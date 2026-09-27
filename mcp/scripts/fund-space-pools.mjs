#!/usr/bin/env node
// SPDX-License-Identifier: MIT
import fs from 'node:fs';
import { createPublicClient, createWalletClient, http, parseAbi, toHex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { SpaceStore } from '../src/space-store.js';

/**
 * Back each Space's ledger balance with real tokens in its own onchain pool.
 *
 * The balances this product quotes were, until now, one shared number held in
 * the broadcaster's wallet: individually plausible, collectively unbacked, and
 * spendable by any Space that reached the broadcaster. This moves the money into
 * per-Space custody, where a leaked broadcaster key cannot reach it.
 *
 * It deliberately does not create tokens or edit balances. The broadcaster
 * already holds more than the ledger claims, so every figure below is a transfer
 * of something that exists. That distinction is the entire point — minting to
 * make a report go green would make the check worthless, and zeroing the ledger
 * to match the chain would throw away the only honest statement we have.
 *
 * Dry run by default. --apply is required to move anything.
 *
 *   node mcp/scripts/fund-space-pools.mjs
 *   node mcp/scripts/fund-space-pools.mjs --apply
 */

const ROUTER_ABI = parseAbi([
  'function spaceBalance(bytes32 spaceId) view returns (uint256)',
  'function spaceTokens(bytes32 spaceId) view returns (address)',
  'function totalAccounted() view returns (uint256)',
  'function registerSpaceToken(bytes32 spaceId, address token)',
  'function deposit(bytes32 spaceId, uint256 amount)',
]);
const TOKEN_ABI = parseAbi([
  'function decimals() view returns (uint8)',
  'function balanceOf(address account) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
]);

const apply = process.argv.includes('--apply');
const rpc = process.env.XLAYER_RPC_URL;
const key = process.env.PRIVATE_KEY;
const asset = process.env.USDC_ADDRESS;
const router = process.env.XLAYER_ROUTER_ADDRESS;
for (const [name, value] of Object.entries({ XLAYER_RPC_URL: rpc, PRIVATE_KEY: key, USDC_ADDRESS: asset, XLAYER_ROUTER_ADDRESS: router })) {
  if (!value) throw new Error(`fund-space-pools: ${name} must be set`);
}

const client = createPublicClient({ transport: http(rpc) });

/** A reverted transaction must never be reported as a deposit that happened. */
async function confirmed(hash, what) {
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success') throw new Error(`fund-space-pools: ${what} reverted (${hash})`);
  return receipt;
}

/**
 * Read a value until it settles, or give up.
 *
 * The public X Layer node served the post-deposit reads from a lagging backend,
 * so a correct deposit was followed by a verification that saw the old state.
 * Retrying is the difference between "the migration ran" and "the migration ran
 * and the money is there".
 */
async function settled(fn, { attempts = 12, delayMs = 2500 } = {}) {
  let value;
  for (let i = 0; i < attempts; i += 1) {
    value = await fn();
    if (value !== undefined && value !== null) return value;
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return value;
}

/** Poll until `fn()` returns the expected value, or the node never catches up. */
async function untilEqual(fn, expected, label) {
  for (let i = 0; i < 12; i += 1) {
    const value = await fn();
    if (value === expected) return value;
    await new Promise((r) => setTimeout(r, 2500));
  }
  throw new Error(`fund-space-pools: ${label} never reached the expected value (wanted ${expected}, last read ${await fn()})`);
}
const account = privateKeyToAccount(key);
const wallet = createWalletClient({ account, transport: http(rpc) });
const decimals = Number(await client.readContract({ address: asset, abi: TOKEN_ABI, functionName: 'decimals' }));
const scale = 10n ** BigInt(decimals);

/** Our ledger is the source of the amount; the chain is only ever compared to. */
function toBase(amount) {
  const [whole, frac = ''] = String(amount).split('.');
  return BigInt(whole || '0') * scale + BigInt((frac + '0'.repeat(decimals)).slice(0, decimals));
}
const fmt = (n) => `${n / scale}.${String(n % scale).padStart(decimals, '0')}`;

/** keccak of the Space id, matching the contracts' own spaceIdToBytes32. */
async function spaceIdToBytes32(spaceId) {
  return keccakText(spaceId);
}
async function keccakText(text) {
  const { keccak256, toBytes } = await import('viem');
  return keccak256(toBytes(text));
}

// Which ledger to back. The default is the snapshot the service actually boots
// from, because funding a store the seed just built in memory is how this script
// first reported success having touched one Space out of nine: it agreed with
// its own fresh seed rather than with production. Pass a path to be explicit.
const snapshotPath = process.argv.find((a) => a.endsWith('.json'));
const PRODUCTION = '/var/lib/microcosm/microcosm-data.json';
const store = new SpaceStore({ seed: false });
if (snapshotPath || fs.existsSync(PRODUCTION)) {
  const file = snapshotPath || PRODUCTION;
  const { load } = await import('../../packages/server/src/persist.js');
  load(store, file);
  console.log(`  ledger: ${file} (${store.spaces.size} space(s))`);
} else {
  throw new Error('fund-space-pools: no ledger found. Pass a snapshot path explicitly rather than funding a seeded store.');
}
const spaces = [...store.spaces.entries()].filter(([, s]) => Number(s.balance || 0) > 0);

console.log(`${apply ? 'APPLYING' : 'DRY RUN'} · router ${router} · asset ${asset} (${decimals}dp)`);
console.log(`${spaces.length} Space(s) with a balance to back\n`);

const broadcasterBefore = await client.readContract({ address: asset, abi: TOKEN_ABI, functionName: 'balanceOf', args: [account.address] });

const plan = [];
let needed = 0n;
for (const [spaceId, space] of spaces) {
  const claimed = toBase(space.balance);
  const sid = await spaceIdToBytes32(spaceId);
  const held = await client.readContract({ address: router, abi: ROUTER_ABI, functionName: 'spaceBalance', args: [sid] });
  const registered = await client.readContract({ address: router, abi: ROUTER_ABI, functionName: 'spaceTokens', args: [sid] });
  const short = claimed > held ? claimed - held : 0n;
  needed += short;
  plan.push({ spaceId, sid, name: space.name, claimed, held, short, needsRegister: registered.toLowerCase() !== asset.toLowerCase() });
  console.log(
    `  ${spaceId}\n` +
    `    our books claim ${fmt(claimed).padStart(14)}   chain holds ${fmt(held).padStart(14)}` +
    (short > 0n ? `   short ${fmt(short)}` : '   already backed') +
    (registered.toLowerCase() !== asset.toLowerCase() ? '\n    needs its asset registered on this router' : '')
  );
}

console.log(`\n  total to deposit ${fmt(needed)} · broadcaster holds ${fmt(broadcasterBefore)}`);
if (needed > broadcasterBefore) {
  console.error('\n  REFUSING: the broadcaster does not hold enough to back the ledger.');
  process.exit(1);
}

if (!apply) {
  console.log('\n  dry run only. Re-run with --apply to move the funds.');
  process.exit(0);
}

for (const step of plan) {
  if (step.short === 0n && !step.needsRegister) continue;
  if (step.needsRegister) {
    const h = await wallet.writeContract({ address: router, abi: ROUTER_ABI, functionName: 'registerSpaceToken', args: [step.sid, asset] });
    await confirmed(h, `registerSpaceToken(${step.spaceId})`);
    console.log(`  registered asset for ${step.spaceId}`);
  }
  if (step.short > 0n) {
    // Approve exactly the shortfall rather than an unlimited allowance, so a
    // compromised router cannot draw more than this Space is owed.
    await confirmed(
      await wallet.writeContract({ address: asset, abi: TOKEN_ABI, functionName: 'approve', args: [router, step.short] }),
      `approve(${step.spaceId})`,
    );
    const h = await wallet.writeContract({ address: router, abi: ROUTER_ABI, functionName: 'deposit', args: [step.sid, step.short] });
    await confirmed(h, `deposit(${step.spaceId})`);
    // Confirm the Space's own balance actually reached the figure we intended.
    // The receipt says the transaction succeeded; only the chain says the money
    // arrived, and those have already differed once on this chain.
    await untilEqual(
      () => client.readContract({ address: router, abi: ROUTER_ABI, functionName: 'spaceBalance', args: [step.sid] }),
      step.claimed,
      `spaceBalance(${step.spaceId})`,
    );
    console.log(`  deposited ${fmt(step.short)} for ${step.spaceId}, chain confirms ${fmt(step.claimed)} (${h})`);
  }
}

// The invariant, checked on chain rather than assumed from our own arithmetic.
const totalAccounted = await settled(() => client.readContract({ address: router, abi: ROUTER_ABI, functionName: 'totalAccounted' }));
const routerHeld = await settled(() => client.readContract({ address: asset, abi: TOKEN_ABI, functionName: 'balanceOf', args: [router] }));
const broadcasterAfter = await settled(() => client.readContract({ address: asset, abi: TOKEN_ABI, functionName: 'balanceOf', args: [account.address] }));

console.log(`\n  router holds ${fmt(routerHeld)} · totalAccounted ${fmt(totalAccounted)}`);
console.log(`  broadcaster ${fmt(broadcasterBefore)} -> ${fmt(broadcasterAfter)} (moved ${fmt(broadcasterBefore - broadcasterAfter)})`);

const owed = plan.reduce((sum, step) => sum + step.claimed, 0n);
if (routerHeld !== totalAccounted) {
  console.error('\n  INVARIANT VIOLATED: the router holds a different amount than it owes.');
  process.exit(1);
}
// A check that 0 == 0 satisfies is not a check. The first version of this script
// printed "invariant holds" on a run where the deposit had silently done nothing,
// because both sides were zero. If the ledger claims money, the chain has to be
// holding it, or this run has failed whatever it printed above.
if (owed > 0n && totalAccounted === 0n) {
  console.error('\n  INVARIANT VIOLATED: the ledger claims balances but the router owes nothing.');
  process.exit(1);
}
if (totalAccounted !== owed) {
  console.error(`\n  MISMATCH: the router owes ${fmt(totalAccounted)} but the ledger claims ${fmt(owed)}.`);
  process.exit(1);
}
console.log(`  invariant holds: the router holds exactly the ${fmt(totalAccounted)} it owes, matching every Space's balance.`);
