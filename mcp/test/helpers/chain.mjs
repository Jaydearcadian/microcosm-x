/**
 * Live-chain harness for settlement tests. Every test that moves money runs
 * against a REAL EVM with REAL signed transactions — never mocks, never
 * simulated receipts.
 *
 * Two backends, one interface:
 *   - default: boots a private anvil instance, deploys the full kernel,
 *     funds test accounts. Fully offline-capable, deterministic.
 *   - testnet: when XLAYER_RPC_URL points off-localhost, uses the live
 *     testnet + PRIVATE_KEY (fatal if the key is missing). Used for
 *     recorded evidence runs; spends real testnet funds.
 *
 * Local test keys are parsed from the spawned anvil's own stdout, so keys
 * always match accounts regardless of foundry version or mnemonic. They are
 * throwaway local keys and must NEVER leave the test process.
 */

import { spawn, execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..', '..');
const CONTRACTS_DIR = path.join(REPO_ROOT, 'contracts');

/** Parse throwaway test keys + accounts from anvil's startup banner. */
function parseAnvilBanner(output) {
  const section = (start, end) => {
    const lines = output.split('\n');
    const s = lines.findIndex((l) => l.trim() === start);
    const e = lines.findIndex((l) => l.trim() === end);
    if (s === -1 || e === -1 || e <= s) return [];
    return lines.slice(s, e)
      .map((l) => (l.match(/^\((\d+)\)\s+(0x[0-9a-fA-F]+)/) || [])[2])
      .filter(Boolean);
  };
  const accounts = section('Available Accounts', 'Private Keys');
  const keys = section('Private Keys', 'Wallet');
  if (accounts.length < 2 || keys.length < 2) {
    throw new Error('chain harness: could not parse accounts/keys from anvil banner');
  }
  return { accounts, keys };
}

function repoKey(name) {
  if (process.env[name]) return process.env[name].trim();
  const envFile = path.join(REPO_ROOT, '.env');
  if (existsSync(envFile)) {
    for (const line of readFileSync(envFile, 'utf8').split('\n')) {
      const m = line.match(new RegExp(`^${name}=(0x[0-9a-fA-F]{64})$`));
      if (m) return m[1];
    }
  }
  return null;
}

function run(cmd, args, { cwd = REPO_ROOT, env = {}, timeout = 300_000 } = {}) {
  try {
    return execFileSync(cmd, args, { cwd, env: { ...process.env, ...env }, encoding: 'utf8', timeout }).trim();
  } catch (err) {
    const out = [err.stdout, err.stderr, err.message].filter(Boolean).join('\n').slice(0, 3000);
    throw new Error(`chain harness: \`${cmd} ${args.slice(0, 4).join(' ')}\` failed:\n${out}`);
  }
}

async function waitForRpc(rpc, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const id = run('cast', ['chain-id', '--rpc-url', rpc], { timeout: 10000 });
      return id;
    } catch {
      if (Date.now() > deadline) throw new Error(`chain harness: RPC ${rpc} never came up`);
      await new Promise((r) => setTimeout(r, 500));
    }
  }
}

function deployKernel(rpc, deployerKey) {
  // foundry ≥1.8 rejects msg.sender reads inside broadcast scripts unless
  // --sender is given: derive it so the script's deployer fallback resolves.
  const sender = run('cast', ['wallet', 'address', '--private-key', deployerKey]).trim();
  run('forge', ['script', 'script/DeployXLayer.s.sol:DeployXLayer', '--rpc-url', rpc, '--broadcast', '--sender', sender],
    { cwd: CONTRACTS_DIR, env: { PRIVATE_KEY: deployerKey }, timeout: 300_000 });
  const chainId = run('cast', ['chain-id', '--rpc-url', rpc]).trim();
  const artifact = path.join(CONTRACTS_DIR, 'broadcast', 'DeployXLayer.s.sol', String(Number(chainId)), 'run-latest.json');
  if (!existsSync(artifact)) throw new Error(`chain harness: missing broadcast artifact ${artifact}`);
  const data = JSON.parse(readFileSync(artifact, 'utf8'));
  const byName = {};
  data.transactions.forEach((t, i) => {
    if (t.contractName && data.receipts[i]?.contractAddress) byName[t.contractName] = data.receipts[i].contractAddress;
  });
  for (const name of ['AgenticCommerce', 'MockERC20']) {
    if (!byName[name]) throw new Error(`chain harness: deploy did not produce ${name} (artifact ${artifact})`);
  }
  return { chainId: Number(chainId), AgenticCommerce: byName.AgenticCommerce, MockERC20: byName.MockERC20 };
}

function mintUsdc(rpc, usdc, key, to, amountBase) {
  run('cast', ['send', usdc, 'mint(address,uint256)', to, String(amountBase), '--private-key', key, '--rpc-url', rpc]);
}

/**
 * Ensure a live chain for settlement tests. Returns:
 * { rpc, chainId, contracts: {AgenticCommerce, MockERC20},
 *   keys: {deployer, provider}, addrs: {deployer, provider},
 *   live: 'anvil'|'testnet', cleanup() }
 *
 * Side effect: points the xlayer adapter at this chain via env so the
 * SpaceStore settles here. Call in before(), cleanup() in after().
 */
export async function ensureChain({ port = 8545 } = {}) {
  const configuredRpc = process.env.XLAYER_RPC_URL || '';
  const offLocalhost = configuredRpc && !/127\.0\.0\.1|localhost/.test(configuredRpc);

  if (offLocalhost) {
    const deployerKey = repoKey('PRIVATE_KEY');
    if (!deployerKey) {
      throw new Error('LIVE testnet mode (XLAYER_RPC_URL is remote) requires PRIVATE_KEY in .env or environment — refusing to fake it.');
    }
    const providerKey = repoKey('PROVIDER_KEY') || deployerKey;
    const forgeJson = JSON.parse(readFileSync(path.join(REPO_ROOT, 'forge.json'), 'utf8'));
    const contracts = forgeJson.deployment.deployments.testnet.contracts;
    const chainId = Number(process.env.XLAYER_CHAIN_ID || 1952);
    process.env.XLAYER_CHAIN_ID = String(chainId);
    process.env.XLAYER_COMMERCE_ADDRESS = contracts.AgenticCommerce;
    process.env.XLAYER_USDC_ADDRESS = contracts.MockERC20;
    const { resetAddressCache } = await import('../../src/xlayer.js');
    resetAddressCache();
    return {
      rpc: configuredRpc, chainId, contracts,
      keys: { deployer: deployerKey, provider: providerKey },
      live: 'testnet',
      cleanup: async () => {},
    };
  }

  // Local mode: private anvil + fresh kernel + funded accounts. Keys and
  // accounts are parsed from anvil's own banner (never hardcoded).
  const rpc = `http://127.0.0.1:${port}`;
  const child = spawn('anvil', ['--port', String(port)], { stdio: ['ignore', 'pipe', 'pipe'] });
  let banner = '';
  const bannerReady = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('chain harness: anvil banner timeout')), 30000);
    child.stdout.on('data', (c) => {
      banner += c.toString();
      if (/Listening on/i.test(banner)) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on('exit', (code) => {
      if (!/Listening on/i.test(banner)) {
        clearTimeout(timer);
        reject(new Error(`chain harness: anvil exited early (code ${code}): ${banner.slice(-500)}`));
      }
    });
  });
  try {
    await bannerReady;
    await waitForRpc(rpc);
    const { accounts, keys } = parseAnvilBanner(banner);
    if (!/^0x[0-9a-fA-F]{64}$/.test(keys[0]) || !/^0x[0-9a-fA-F]{64}$/.test(keys[1])) {
      throw new Error('chain harness: parsed anvil keys are malformed — refusing to continue');
    }
    const deployerKey = keys[0];
    const providerKey = keys[1];
    const deployer = accounts[0];
    const provider = accounts[1];
    // Pin the throwaway keys into the environment so the adapter can never
    // pick up a real .env/testnet key during local runs (and vice versa).
    process.env.PRIVATE_KEY = deployerKey;
    process.env.PROVIDER_KEY = providerKey;
    const deployed = deployKernel(rpc, deployerKey);
    // Fund the triangle: deployer (client/evaluator/treasury) + provider.
    mintUsdc(rpc, deployed.MockERC20, deployerKey, deployer, 10_000_000_000000n);
    mintUsdc(rpc, deployed.MockERC20, deployerKey, provider, 1_000_000_000000n);
    process.env.XLAYER_RPC_URL = rpc;
    process.env.XLAYER_CHAIN_ID = String(deployed.chainId);
    process.env.XLAYER_COMMERCE_ADDRESS = deployed.AgenticCommerce;
    process.env.XLAYER_USDC_ADDRESS = deployed.MockERC20;
    const { resetAddressCache } = await import('../../src/xlayer.js');
    resetAddressCache();
    return {
      rpc, chainId: deployed.chainId,
      contracts: { AgenticCommerce: deployed.AgenticCommerce, MockERC20: deployed.MockERC20 },
      keys: { deployer: deployerKey, provider: providerKey },
      addrs: { deployer, provider },
      live: 'anvil',
      cleanup: async () => {
        child.kill('SIGKILL');
      },
    };
  } catch (err) {
    child.kill('SIGKILL');
    throw err;
  }
}
