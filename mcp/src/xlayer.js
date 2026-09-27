/**
 * Live X Layer settlement adapter for the Space runtime.
 *
 * Bridges the SpaceStore to an AgenticCommerce kernel. Settlement here is
 * ALWAYS real: USDC moves onchain via `cast send` and receipts carry the
 * actual transaction hashes. There is no simulated fallback — if the key,
 * RPC, or contracts are unavailable, every call throws loudly and Space
 * books are left untouched.
 *
 * Configuration (environment):
 *   XLAYER_RPC_URL        default https://testrpc.xlayer.tech
 *   XLAYER_CHAIN_ID       default 1952
 *   XLAYER_COMMERCE_ADDRESS / XLAYER_USDC_ADDRESS
 *                         contract overrides (e.g. fresh anvil deploys);
 *                         defaults to forge.json testnet deployment.
 *   PRIVATE_KEY           deployer key (fatal if missing)
 *   PROVIDER_KEY          optional separate key for the provider submit step
 *                         (defaults to PRIVATE_KEY; onchain submit requires
 *                         the provider's own signature)
 *
 * Requires: cast (foundry), network access to the RPC.
 */

import { privateKeyToAccount } from 'viem/accounts';
import { execFileSync } from 'node:child_process';
import { keccak256, toBytes } from 'viem';
import { readFileSync, existsSync } from 'node:fs';

/**
 * The bytes32 a Space is known by on chain.
 *
 * The product identifies a Space by a readable string; the contracts key on
 * bytes32. This is the bridge, and it has to match
 * contracts/script/BindSpaceBudget.s.sol exactly, or a Space gets bound under
 * one id and paid under another. Nothing in the runtime used to call
 * registerSpaceToken at all, so there was no agreed derivation to disagree
 * about — which is why the live router had no Spaces registered.
 */
export function spaceIdToBytes32(spaceId) {
  return keccak256(toBytes(String(spaceId)));
}


export function rpcUrl() {
  return process.env.XLAYER_RPC_URL || 'https://testrpc.xlayer.tech';
}

export function chainId() {
  return Number(process.env.XLAYER_CHAIN_ID || 1952);
}

function isZeroAddress(addr) {
  return /^0x0{40}$/i.test(addr || '');
}

// Deployment addresses from forge.json → deployment.deployments.testnet,
// unless overridden for a fresh (e.g. anvil) deploy.
let CACHED = null;
function addresses() {
  if (CACHED) return CACHED;
  const forgeJson = JSON.parse(readFileSync(new URL('../../forge.json', import.meta.url), 'utf8'));
  const testnet = forgeJson.deployment.deployments.testnet.contracts;
  CACHED = {
    AgenticCommerce: process.env.XLAYER_COMMERCE_ADDRESS || testnet.AgenticCommerce,
    MockERC20: process.env.XLAYER_USDC_ADDRESS || testnet.MockERC20,
    // The router is what a direct payment goes through, and what consults the
    // Space's signed limits. Without it the adapter would fall back to the
    // escrow path, which is the bypass this split exists to close.
    SettlementRouter: process.env.XLAYER_ROUTER_ADDRESS || testnet.SettlementRouter,
    SpaceBudget: process.env.XLAYER_BUDGET_ADDRESS || testnet.SpaceBudget,
  };
  if (!CACHED.AgenticCommerce || !CACHED.MockERC20 || !CACHED.SettlementRouter) {
    throw new Error('XLayerAdapter: missing contract addresses (forge.json or XLAYER_*_ADDRESS overrides)');
  }
  return CACHED;
}

export function resetAddressCache() {
  CACHED = null;
}

/**
 * Totally side-effect-free readiness probe: is there a key AND a reachable
 * chain? Used by scaffolding (seed) to decide whether the live top-up can
 * run. Never fabricates anything — returns {ok, reason}.
 */
export async function liveReady() {
  try {
    privKey();
  } catch (err) {
    return { ok: false, reason: `no signing key: ${err.message}` };
  }
  try {
    const id = cast(['chain-id', '--rpc-url', rpcUrl()]);
    return { ok: true, chainId: Number(id), rpc: rpcUrl() };
  } catch (err) {
    return { ok: false, reason: `RPC unreachable: ${err.message.slice(0, 200)}` };
  }
}

function readEnvKey(name) {
  if (process.env[name]) return process.env[name].trim();
  if (name === 'PRIVATE_KEY') {
    const envFile = new URL('../../.env', import.meta.url);
    if (existsSync(envFile)) {
      for (const line of readFileSync(envFile, 'utf8').split('\n')) {
        const m = line.match(/^PRIVATE_KEY=(0x[0-9a-fA-F]{64})$/);
        if (m) return m[1];
      }
    }
  }
  return null;
}

function privKey() {
  const key = readEnvKey('PRIVATE_KEY');
  if (!key) {
    throw new Error('XLayerAdapter: no PRIVATE_KEY found (.env or environment). Live settlement unavailable — refusing to fake it.');
  }
  return key;
}

/** Address of the configured deployer key (transient process use only). */
export function deployerAddress() {
  return cast(['wallet', 'address', '--private-key', privKey()]).trim().split(' ')[0];
}

export function requireAddress(label, value) {  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(value) || isZeroAddress(value)) {
    throw new Error(`XLayerAdapter: live settlement requires an EVM address ${label}, got '${value}'`);
  }
  return value;
}

export function requireBytes32(label, value) {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error(`XLayerAdapter: live settlement requires a 0x bytes32 ${label}, got '${value}'`);
  }
  return value;
}

/** Exact decimal string → 6-decimal base units. No floats anywhere near money. */
export function toBaseUnitsExact(amount) {
  const m = String(amount).trim().match(/^(\d+)\.(\d{0,6}|\d+)?$/);
  if (!m) throw new Error(`XLayerAdapter: bad USDC amount '${amount}'`);
  const frac = (m[2] || '').slice(0, 6).padEnd(6, '0');
  if ((m[2] || '').length > 6) throw new Error(`XLayerAdapter: USDC amount '${amount}' exceeds 6 decimals`);
  return BigInt(m[1]) * 1000000n + BigInt(frac);
}

/** Strip key material from any string destined for logs/errors. */
export function scrubSecrets(s) {
  return String(s).replace(/--private-key\s+\S+/g, '--private-key <redacted>');
}

function cast(args, { input = null } = {}) {
  try {
    return execFileSync('cast', args, { input, encoding: 'utf8', timeout: 180_000 }).trim();
  } catch (err) {
    const out = [err.stdout, err.stderr, err.message].filter(Boolean).join('\n').slice(0, 2000);
    throw new Error(scrubSecrets(`XLayerAdapter: cast failed (${args.slice(0, 3).join(' ')}): ${out}`));
  }
}

/** Pending nonce for an address (base for a rapid-fire sequence). */
function senderNonce(key) {
  const addr = cast(['wallet', 'address', '--private-key', key]);
  const n = cast(['nonce', addr, '--block', 'pending', '--rpc-url', rpcUrl()]);
  return BigInt(n.split(' ')[0]);
}

function sendAs(key, to, sig, args, { nonce = null, gasLimit = null } = {}) {
  const nonceArgs = nonce !== null && nonce !== undefined ? ['--nonce', String(nonce)] : [];
  const gasArgs = gasLimit !== null && gasLimit !== undefined ? ['--gas-limit', String(gasLimit)] : [];
  const out = cast(['send', to, sig, ...args, ...nonceArgs, ...gasArgs, '--private-key', key, '--rpc-url', rpcUrl()]);
  const status = (out.match(/^status\s+(\d+)/m) || [])[1];
  const txHash = (out.match(/^transactionHash\s+(0x[0-9a-fA-F]+)/m) || [])[1];
  if (status !== '1' || !txHash) throw new Error(`XLayerAdapter: tx failed or hash unparseable (status ${status})`);
  return { txHash, status: '0x1' };
}

/**
 * Sequential-nonce sender for one key. Remote RPCs (testnet) lag on their
 * pending-nonce view, so rapid-fire `cast send` calls collide there
 * (nonce-too-low reverts); assigning nonces explicitly from a single fetched
 * base eliminates the race, with one refetch-and-retry for interference.
 * Local automining chains (anvil) cannot race and manage nonces perfectly
 * themselves — explicit nonces only add gap risk there, so they are skipped
 * on localhost. Same transactions either way; only the assignment differs.
 */
function makeSequencer(key) {
  const explicit = !/127\.0\.0\.1|localhost/.test(rpcUrl());
  let n = explicit ? senderNonce(key) : null;
  const sendOne = (to, sig, args) => explicit
    ? sendAs(key, to, sig, args, { nonce: n++, gasLimit: 1000000 })
    : sendAs(key, to, sig, args);
  return (to, sig, args) => {
    try {
      return sendOne(to, sig, args);
    } catch (err) {
      if (!explicit || !/nonce too low|nonce too high|replacement transaction|known transaction/i.test(err.message)) throw err;
      n = senderNonce(key);
      return sendAs(key, to, sig, args, { nonce: n++, gasLimit: 1000000 });
    }
  };
}

function send(to, sig, args) {
  return sendAs(privKey(), to, sig, args);
}

function usdcBalanceOf(addr) {
  const out = cast(['call', addresses().MockERC20, 'balanceOf(address)(uint256)', addr, '--rpc-url', rpcUrl()]);
  return BigInt(out.split(' ')[0]);
}

export class XLayerAdapter {
  constructor() {
    this.network = 'OKX X Layer Testnet';
    this.chainId = chainId();
    this.rpc = rpcUrl();
  }

  announce() {
    return {
      adapter: 'XLayerAdapter',
      mode: 'LIVE',
      network: this.network,
      chainId: this.chainId,
      rpc: this.rpc,
      kernel: addresses().AgenticCommerce,
      usdc: addresses().MockERC20,
    };
  }

  /**
   * REAL onchain settlement of a plain disbursement.
   *
   * This is the instrument a direct payment should use, and it is a different
   * one from the Work Order path below. A disbursement has no deliverable, so
   * routing it through createJob/fund/submit/complete meant inventing a job and
   * submitting a deliverable hash that was a constant — and, because that path
   * goes through AgenticCommerce, it bypassed the Space's signed limits
   * entirely. SettlementRouter asks SpaceBudget first, so a cap the owner
   * signed actually stops the payment here.
   *
   * Fails closed: an unbound Space, an unregistered asset, an unlisted
   * recipient or an over-cap amount all revert rather than settle.
   */
  settleDirectOnchain({ spaceId, paymentIdHash, recipient, amount }) {
    requireAddress('recipient', recipient);
    requireBytes32('paymentIdHash', paymentIdHash);
    const amountBase = toBaseUnitsExact(amount);
    if (amountBase <= 0n) throw new Error(`XLayerAdapter: amount must be positive, got '${amount}'`);

    const router = addresses().SettlementRouter;
    const usdc = addresses().MockERC20;
    const send = makeSequencer(privKey());
    // The router pulls with transferFrom, so the broadcaster has to approve it
    // first — the same step the escrow path takes for the kernel. Without this
    // the settlement reverts "allowance too low", which says nothing about the
    // cause.
    send(usdc, 'approve(address,uint256)', [router, String(amountBase)]);
    const receipt = send(router, 'settleDirect(bytes32,bytes32,address,address,uint256)', [
      spaceIdToBytes32(spaceId),
      paymentIdHash,
      usdc,
      recipient,
      String(amountBase),
    ]);
    return {
      txHash: receipt.txHash,
      txHashes: { direct: receipt.txHash },
      spaceIdOnChain: spaceIdToBytes32(spaceId),
    };
  }

  /**
   * REAL onchain settlement of a Work Order:
   * createJob → setBudget → fund (approve + transferFrom) → submit → complete.
   * Money moves onchain. Throws on any revert, parse failure, or bad input —
   * callers must leave their books untouched when this throws.
   */
  settleJobOnchain({ jobIdLabel, provider, evaluator, description, budget, deliverableHash, spaceId, providerKey }) {
    requireAddress('provider', provider);
    requireAddress('evaluator', evaluator);
    requireBytes32('deliverableHash', deliverableHash);
    const budgetBase = toBaseUnitsExact(budget);
    if (budgetBase <= 0n) throw new Error(`XLayerAdapter: budget must be positive, got '${budget}'`);

    const kernel = addresses().AgenticCommerce;
    const usdc = addresses().MockERC20;
    const expiredAt = Math.floor(Date.now() / 1000) + 7 * 24 * 3600;
    const deployerKey = privKey();
    const sendD = makeSequencer(deployerKey);

    const create = sendD(kernel, 'createJob(address,address,uint256,string)', [
      provider, evaluator, String(expiredAt), description || `Work ${jobIdLabel}`,
    ]);
    const jobId = this._readCreatedJobId(create.txHash);

    sendD(kernel, 'setBudget(uint256,uint256)', [String(jobId), String(budgetBase)]);
    sendD(usdc, 'approve(address,uint256)', [kernel, String(budgetBase)]);
    sendD(kernel, 'fund(uint256,uint256)', [String(jobId), String(budgetBase)]);

    // submit must come from the provider's own key: the contract checks it, and
    // paying an address whose key we do not hold cannot get past that step.
    //
    // Falling back to the deployer key used to look like it worked and then
    // surfaced as "tx failed or hash unparseable (status 0)", which says
    // nothing. The counterparty here is a vendor address the app has no key
    // for, so the honest answer is to say which key is missing.
    const broadcaster = privateKeyToAccount(deployerKey).address;
    if (!providerKey && provider.toLowerCase() !== broadcaster.toLowerCase()) {
      throw new Error(
        `XLayerAdapter: settlement needs the provider's key to submit the deliverable, and none is ` +
        `configured for ${provider}. Set PROVIDER_KEY, or make the provider the account whose key is ` +
        `used to broadcast. The provider is checked onchain, so this cannot be signed around.`,
      );
    }
    const pKey = providerKey || deployerKey;
    const submit = pKey === deployerKey
      ? sendD(kernel, 'submit(uint256,bytes32)', [String(jobId), deliverableHash])
      : makeSequencer(pKey)(kernel, 'submit(uint256,bytes32)', [String(jobId), deliverableHash]);
    const complete = sendD(kernel, 'complete(uint256,bytes32)', [
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
    const out = cast(['receipt', createTxHash, '--rpc-url', rpcUrl()]);
    // logs field is a JSON array; JobCreated topic1 = jobId
    const m = out.match(/"topics":\s*\[\s*"0x[0-9a-fA-F]+",\s*"(0x[0-9a-fA-F]{64})"/);
    if (!m) throw new Error('XLayerAdapter: could not parse JobCreated jobId from receipt');
    return BigInt(m[1]);
  }

  /** REAL USDC balance for an address on the configured chain. */
  balanceOf(addr) {
    requireAddress('balanceOf', addr);
    return usdcBalanceOf(addr);
  }
}
