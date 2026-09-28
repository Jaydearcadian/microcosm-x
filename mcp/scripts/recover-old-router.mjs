#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Move what is still recoverable from the old router to the new one, and re-bind
// the Space that has a signed owner.
//
// The digest fix invalidated every existing binding, so the limits contract, the
// router and the escrow were all replaced. The old router still holds the money
// that was deposited into it, and withdrawing there is gated on the Space's own
// signed owner — read from the old limits contract.
//
// Only Spaces that were ever bound have one. This recovers those and reports the
// rest rather than pretending they can be moved.
import { createPublicClient, createWalletClient, http, parseAbi, toBytes } from 'viem';
import { privateKeyToAccount, signTypedData } from 'viem/accounts';
import { keccak256 } from 'viem';

const rpc = process.env.XLAYER_RPC_URL;
const OLD_ROUTER = process.env.OLD_ROUTER_ADDRESS;
const OLD_BUDGET = process.env.OLD_BUDGET_ADDRESS;
const router = process.env.XLAYER_ROUTER_ADDRESS;
const budget = process.env.XLAYER_BUDGET_ADDRESS;
const token = process.env.USDC_ADDRESS;
for (const [k, v] of Object.entries({ XLAYER_RPC_URL: rpc, OLD_ROUTER_ADDRESS: OLD_ROUTER, XLAYER_ROUTER_ADDRESS: router, XLAYER_BUDGET_ADDRESS: budget })) {
  if (!v) throw new Error(`recover: ${k} must be set`);
}
const client = createPublicClient({ transport: http(rpc) });
const VENDOR = '0x1111111111111111111111111111111111111111';
const account = privateKeyToAccount(process.env.PRIVATE_KEY);
const wallet = createWalletClient({ account, transport: http(rpc) });

const POOL = parseAbi([
  'function spaceBalance(bytes32) view returns (uint256)',
  'function spaceTokens(bytes32) view returns (address)',
  'function totalAccounted() view returns (uint256)',
  'function withdraw(bytes32,address,address,uint256)',
  'function deposit(bytes32,uint256)',
]);
// Written as a JSON ABI because parseAbi cannot express named tuple components.
// An unnamed tuple takes positional values, and an object then encodes into the
// wrong slots, so the digest changes and bind is refused as BadSignature.
const BINDING_TUPLE = {
  type: 'tuple',
  components: [
    { name: 'spaceId', type: 'bytes32' },
    { name: 'owner', type: 'address' },
    { name: 'maxPerTransaction', type: 'uint256' },
    { name: 'dailyBudget', type: 'uint256' },
    { name: 'recipients', type: 'address[]' },
    { name: 'deadline', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
  ],
};
const BUDGET_ABI = [
  { type: 'function', name: 'limits', stateMutability: 'view', inputs: [{ name: 'spaceId', type: 'bytes32' }],
    outputs: [{ name: 'owner', type: 'address' }, { name: 'maxPerTransaction', type: 'uint128' }, { name: 'dailyBudget', type: 'uint128' },
      { name: 'boundAt', type: 'uint64' }, { name: 'updatedAt', type: 'uint64' }, { name: 'nonce', type: 'uint256' }, { name: 'bound', type: 'bool' }] },
  { type: 'function', name: 'bindingDigest', stateMutability: 'view',
    inputs: [{ name: 'binding', ...BINDING_TUPLE }], outputs: [{ type: 'bytes32' }] },
  { type: 'function', name: 'bind', stateMutability: 'nonpayable',
    inputs: [{ name: 'binding', ...BINDING_TUPLE }, { name: 'signature', type: 'bytes' }], outputs: [] },
];
const TOKEN = parseAbi(['function balanceOf(address) view returns (uint256)', 'function approve(address,uint256) returns (bool)']);

const SPACES = (process.argv.slice(2).length ? process.argv.slice(2) : [
  'space-procurement-001', 'space-acme-procurement-42ee', 'space-jane-be2a',
  'space-probe-sb-939b', 'space-live-settlement-probe-25cb', 'space-bind-probe-1fb5',
  'space-bind-probe-84f1', 'space-bind-probe-172c', 'space-bind-probe-baf9',
  'space-lim-probe-1790433550051-94cd',
]);

const recover = [];
const stuck = [];
let stuckTotal = 0n;

for (const spaceId of SPACES) {
  const sid = keccak256(toBytes(spaceId));
  let held = 0n;
  try { held = await client.readContract({ address: OLD_ROUTER, abi: POOL, functionName: 'spaceBalance', args: [sid] }); } catch { continue; }
  if (held === 0n) continue;

  let owner = '0x0000000000000000000000000000000000000000';
  let cap = 0n; let daily = 0n; let recipients = [];
  try {
    const l = await client.readContract({ address: OLD_BUDGET, abi: BUDGET_ABI, functionName: 'limits', args: [sid] });
    // A struct with several outputs arrives as an array, not an object, unless
    // the ABI names the outputs — which it does, but readContract still hands
    // back positional values here. Handle both.
    const parts = Array.isArray(l) ? l : [l.owner, l.maxPerTransaction, l.dailyBudget];
    owner = parts[0] || '0x0000000000000000000000000000000000000000';
    cap = BigInt(parts[1] ?? 0); daily = BigInt(parts[2] ?? 0);
  } catch { /* unbound */ }

  if (owner.toLowerCase() === account.address.toLowerCase() && cap > 0n) {
    // The approved list is not enumerable on chain, so it is carried over from
    // the Space's configuration rather than read back. The seeded demo Space's
    // vendor is the one that was signed.
    recover.push({ spaceId, sid, held, cap, daily, recipients: [VENDOR] });
  } else {
    stuck.push({ spaceId, held, reason: owner === '0x0000000000000000000000000000000000000000'
      ? 'never bound, so no signed owner exists to authorise a withdrawal'
      : `signed owner is ${owner}, and it is not the key held here` });
    stuckTotal += held;
  }
}

console.log(`old router holds ${await client.readContract({ address: token, abi: TOKEN, functionName: 'balanceOf', args: [OLD_ROUTER] })} base units\n`);

for (const item of recover) {
  console.log(`recovering ${item.spaceId}: ${item.held} base units`);
  const h1 = await wallet.writeContract({ address: OLD_ROUTER, abi: POOL, functionName: 'withdraw', args: [item.sid, token, account.address, item.held] });
  const r1 = await client.waitForTransactionReceipt({ hash: h1 });
  if (r1.status !== 'success') throw new Error(`withdraw reverted for ${item.spaceId}: ${h1}`);
  console.log(`  withdrew from the old router   ${h1}`);

  await client.waitForTransactionReceipt({ hash: await wallet.writeContract({ address: token, abi: TOKEN, functionName: 'approve', args: [router, item.held] }) });
  const reg = await client.readContract({ address: router, abi: POOL, functionName: 'spaceTokens', args: [item.sid] });
  if (reg.toLowerCase() !== token.toLowerCase()) {
    await client.waitForTransactionReceipt({ hash: await wallet.writeContract({
      address: router,
      abi: [{ type: 'function', name: 'registerSpaceToken', stateMutability: 'nonpayable', inputs: [{ name: 'spaceId', type: 'bytes32' }, { name: 'token', type: 'address' }], outputs: [] }],
      functionName: 'registerSpaceToken', args: [item.sid, token],
    }) });
  }
  const h2 = await wallet.writeContract({ address: router, abi: POOL, functionName: 'deposit', args: [item.sid, item.held] });
  const r2 = await client.waitForTransactionReceipt({ hash: h2 });
  if (r2.status !== 'success') throw new Error(`deposit reverted for ${item.spaceId}: ${h2}`);
  console.log(`  deposited into the new router   ${h2}`);

  // Re-bind on the new limits contract, whose digest is the one a wallet signs.
  const message = {
    spaceId: item.sid, owner: account.address,
    maxPerTransaction: item.cap, dailyBudget: item.daily,
    recipients: item.recipients, deadline: BigInt(Math.floor(Date.now() / 1000) + 86400 * 365), nonce: 0n,
  };
  const typedData = {
    domain: { name: 'MicrocosmSpaceBudget', version: '1', chainId: 1952, verifyingContract: budget },
    types: { Binding: [
      { name: 'spaceId', type: 'bytes32' }, { name: 'owner', type: 'address' },
      { name: 'maxPerTransaction', type: 'uint256' }, { name: 'dailyBudget', type: 'uint256' },
      { name: 'recipients', type: 'address[]' }, { name: 'deadline', type: 'uint256' },
      { name: 'nonce', type: 'uint256' }] },
    primaryType: 'Binding', message,
  };
  const onChain = await client.readContract({ address: budget, abi: BUDGET_ABI, functionName: 'bindingDigest', args: [message] });
  const signature = await account.signTypedData(typedData);
  const h3 = await wallet.writeContract({ address: budget, abi: BUDGET_ABI, functionName: 'bind', args: [message, signature] });
  const r3 = await client.waitForTransactionReceipt({ hash: h3 });
  if (r3.status !== 'success') throw new Error(`bind reverted for ${item.spaceId}: ${h3}`);
  console.log(`  re-bound on the new contract    ${h3}`);
  console.log(`  digest ${onChain}`);
}

console.log(`\nrecovered ${recover.length} space(s)`);
if (stuck.length) {
  console.log(`\nNOT recoverable, ${stuckTotal} base units remain on the old router:`);
  for (const s of stuck) console.log(`  ${s.spaceId}: ${s.reason}`);
}
const newHeld = await client.readContract({ address: token, abi: TOKEN, functionName: 'balanceOf', args: [router] });
const newTotal = await client.readContract({ address: router, abi: POOL, functionName: 'totalAccounted' });
console.log(`\nnew router holds ${newHeld} and owes ${newTotal}`);
process.exit(newHeld === newTotal ? 0 : 1);
