/**
 * Live X Layer settlement adapter for the Space runtime.
 *
 * Bridges the in-memory SpaceStore to the deployed AgenticCommerce kernel on
 * OKX X Layer Testnet (chain 1952). Settlement here is REAL: USDC moves
 * onchain via `cast send` against the deployed contracts. Receipts carry
 * `simulated: false` and the actual transaction hash.
 *
 * Requires: PRIVATE_KEY (funded deployer), cast (foundry), network access.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';

const RPC = 'https://testrpc.xlayer.tech';
const CHAIN = 1952;

// Deployment addresses from forge.json → deployment.deployments.testnet
let ADDRESSES = null;
function addresses() {
  if (ADDRESSES) return ADDRESSES;
  const forgeJson = JSON.parse(readFileSync(new URL('../../forge.json', import.meta.url), 'utf8'));
  ADDRESSES = forgeJson.deployment.deployments.testnet.contracts;
  return ADDRESSES;
}

function privKey() {
  // .env at repo root (PRIVATE_KEY=0x…) or environment
  const envFile = new URL('../../.env', import.meta.url);
  if (existsSync(envFile)) {
    for (const line of readFileSync(envFile, 'utf8').split('\n')) {
      const m = line.match(/^PRIVATE_KEY=(0x[0-9a-fA-F]{64})$/);
      if (m) return m[1];
    }
  }
  if (process.env.PRIVATE_KEY) return process.env.PRIVATE_KEY;
  throw new Error('XLayerAdapter: no PRIVATE_KEY found (.env or environment). Live settlement unavailable.');
}

function cast(args, { input = null } = {}) {
  return execFileSync('cast', args, { input, encoding: 'utf8', timeout: 120_000 }).trim();
}

function send(to, sig, args) {
  return sendAs(privKey(), to, sig, args);
}

function sendAs(key, to, sig, args) {
  const out = cast(['send', to, sig, ...args, '--private-key', key, '--rpc-url', RPC]);
  const status = (out.match(/^status\s+(\d+)/m) || [])[1];
  const txHash = (out.match(/^transactionHash\s+(0x[0-9a-fA-F]+)/m) || [])[1];
  if (status !== '1') throw new Error(`XLayerAdapter: tx failed (status ${status})`);
  return { txHash, status: '0x1' };
}

function usdcBalanceOf(addr) {
  const out = cast(['call', addresses().MockERC20, 'balanceOf(address)(uint256)', addr, '--rpc-url', RPC]);
  return BigInt(out.split(' ')[0]);
}

// Space string id → bytes32 (keccak), matching the onchain spaceId binding
function spaceIdBytes32(spaceId) {
  const out = cast(['keccak', spaceId]);
  return out;
}

export class XLayerAdapter {
  constructor() {
    this.network = 'OKX X Layer Testnet';
    this.chainId = CHAIN;
  }

  announce() {
    return {
      adapter: 'XLayerAdapter',
      mode: 'LIVE',
      network: this.network,
      chainId: this.chainId,
      kernel: addresses().AgenticCommerce,
      usdc: addresses().MockERC20,
    };
  }

  /**
   * REAL onchain settlement of a Work Order:
   * createJob → setBudget → fund (approve + transferFrom) → submit → complete.
   * Money moves onchain. Throws on any revert.
   */
  settleJobOnchain({ jobIdLabel, provider, evaluator, description, budget, deliverableHash, spaceId, providerKey }) {
    const kernel = addresses().AgenticCommerce;
    const usdc = addresses().MockERC20;
    const budgetBase = BigInt(Math.round(parseFloat(budget) * 1_000_000)); // 6 decimals
    const expiredAt = Math.floor(Date.now() / 1000) + 7 * 24 * 3600;

    const create = send(kernel, 'createJob(address,address,uint256,string)', [
      provider, evaluator, String(expiredAt), description || `Work ${jobIdLabel}`,
    ]);
    const jobId = this._readCreatedJobId(create.txHash);

    send(kernel, 'setBudget(uint256,uint256)', [String(jobId), String(budgetBase)]);
    send(usdc, 'approve(address,uint256)', [kernel, String(budgetBase)]);
    send(kernel, 'fund(uint256,uint256)', [String(jobId), String(budgetBase)]);

    // submit must come from the provider's own key (onchain NotProvider check)
    const submit = sendAs(providerKey || privKey(), kernel, 'submit(uint256,bytes32)', [
      String(jobId), deliverableHash,
    ]);
    const complete = send(kernel, 'complete(uint256,bytes32)', [
      String(jobId), '0x' + '00'.repeat(31) + '64',
    ]);

    return {
      jobId: String(jobId),
      txHashes: {
        create: create.txHash,
        submit: submit.txHash,
        complete: complete.txHash,
      },
      status: 'SETTLED',
    };
  }

  _readCreatedJobId(createTxHash) {
    const out = cast(['receipt', createTxHash, '--rpc-url', RPC]);
    // logs field is a JSON array; JobCreated topic1 = jobId
    const m = out.match(/"topics":\s*\[\s*"0x[0-9a-fA-F]+",\s*"(0x[0-9a-fA-F]{64})"/);
    if (!m) throw new Error('XLayerAdapter: could not parse JobCreated jobId from receipt');
    return BigInt(m[1]);
  }

  /** REAL USDC balance for an address on chain 1952. */
  balanceOf(addr) {
    return usdcBalanceOf(addr);
  }
}
