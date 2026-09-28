/**
 * Our ledger says what each Space has. The chain says what the router is
 * actually holding for it. Until the router funds payments from a Space's own
 * pool those disagree, and the ledger is a claim rather than a fact.
 *
 * The switch that makes them agree is gated on this. So the report has to be
 * able to say "no" clearly, and it has to be able to tell the two ways of
 * disagreeing apart: our books claiming money that is not there, and money
 * sitting in the router that our books have never heard of.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { SpaceStore } from '../src/space-store.js';

const VENDOR = '0x1111111111111111111111111111111111111111';
const SPACE_BALANCE = '1000.00';

/** A store whose settlement reads are stubbed, so no chain is needed. */
function setup() {
  const store = new SpaceStore({
    seed: false,
    settlement: async () => ({ txHash: '0x' + 'ab'.repeat(32), txHashes: { direct: '0x' + 'ab'.repeat(32) } }),
  });
  const space = store.createSpace({ name: 'Recon Space', actorId: '0x' + '11'.repeat(20) });
  store.fundSpace({ spaceId: space.id, amount: SPACE_BALANCE, actorId: '0x' + '11'.repeat(20) });
  return { store, spaceId: space.id };
}

/** Replaces the adapter's reads with a fixed picture of the chain. */
function stubChain(store, picture) {
  const original = store.reconcileOnchainBalances;
  assert.equal(typeof original, 'function');
  // The store imports the adapter lazily, so stub the adapter on the module the
  // store will reach for.
  return picture;
}

test('R2-1: with nothing deposited, the report says the ledger is unbacked', async () => {
  const { store, spaceId } = setup();
  // No pool entries at all: the chain holds nothing for anybody.
  const original = globalThis.__heldBalances;
  const held = { perSpace: { [spaceId]: 0n }, sumOfSpaceBalances: 0n, totalAccounted: 0n, routerTokenBalance: 0n, excess: 0n };
  const { XLayerAdapter } = await import('../src/xlayer.js');
  const proto = XLayerAdapter.prototype;
  const before = proto.heldBalances;
  proto.heldBalances = async () => held;
  try {
    const report = await store.reconcileOnchainBalances();
    assert.equal(report.agrees, false, 'an unbacked ledger must not report agreement');
    assert.equal(report.readyToFundFromPool, false, 'and must not be ready to switch');
    assert.equal(report.perSpace.length, 1);
    assert.equal(report.perSpace[0].state, 'UNBACKED', `expected UNBACKED, got ${report.perSpace[0].state}`);
    assert.equal(report.perSpace[0].claimed, '1000.000000');
    assert.equal(report.perSpace[0].heldOnChain, '0.000000');
    assert.equal(report.summary.unbacked, '1000.000000');
    // The chain is internally consistent even though our books are not: it holds
    // nothing, and it owes nothing.
    assert.equal(report.chainBalances, true, 'the chain is consistent; it is our ledger that is not');
  } finally {
    proto.heldBalances = before;
    if (original) globalThis.__heldBalances = original;
  }
});

test('R2-2: when the chain holds exactly what the ledger claims, it reports agreement', async () => {
  const { store, spaceId } = setup();
  const { XLayerAdapter } = await import('../src/xlayer.js');
  const proto = XLayerAdapter.prototype;
  const before = proto.heldBalances;
  const one = 1_000_000_000n; // 1000 USDC in base units
  proto.heldBalances = async () => ({
    poolDeployed: true,
    bound: { [spaceId]: true },
    perSpace: { [spaceId]: one },
    sumOfSpaceBalances: one,
    totalAccounted: one,
    routerTokenBalance: one,
    excess: 0n,
  });
  try {
    const report = await store.reconcileOnchainBalances();
    assert.equal(report.agrees, true, `expected agreement, got ${JSON.stringify(report.perSpace)}`);
    assert.equal(report.chainBalances, true);
    assert.equal(report.readyToFundFromPool, true, 'this is the state that unlocks the switch');
  } finally {
    proto.heldBalances = before;
  }
});

test('R2-3: money in the router that our books never saw is UNRECORDED, not agreement', async () => {
  const { store, spaceId } = setup();
  const { XLayerAdapter } = await import('../src/xlayer.js');
  const proto = XLayerAdapter.prototype;
  const before = proto.heldBalances;
  const one = 1_000_000_000n;
  proto.heldBalances = async () => ({
    poolDeployed: true,
    bound: { [spaceId]: true },
    perSpace: { [spaceId]: one },
    sumOfSpaceBalances: one,
    totalAccounted: one,
    routerTokenBalance: one,
    excess: 0n,
  });
  // Empty the ledger so the chain is ahead of it.
  store.getSpace(spaceId).balance = '0.00';
  try {
    const report = await store.reconcileOnchainBalances();
    assert.equal(report.perSpace[0].state, 'UNRECORDED');
    assert.equal(report.summary.unrecorded, '1000.000000');
    assert.equal(report.readyToFundFromPool, false);
  } finally {
    proto.heldBalances = before;
  }
});

test('R2-4: a router whose books do not add up is reported as broken', async () => {
  const { store, spaceId } = setup();
  const { XLayerAdapter } = await import('../src/xlayer.js');
  const proto = XLayerAdapter.prototype;
  const before = proto.heldBalances;
  // Owed 1000, actually holding 900. That is a contract-level inconsistency and
  // must not be confused with our ledger being wrong.
  proto.heldBalances = async () => ({
    perSpace: { [spaceId]: 1_000_000_000n },
    sumOfSpaceBalances: 1_000_000_000n,
    totalAccounted: 1_000_000_000n,
    routerTokenBalance: 900_000_000n,
    excess: 0n,
  });
  try {
    const report = await store.reconcileOnchainBalances();
    assert.equal(report.chainBalances, false, 'a router holding less than it owes is broken');
    assert.equal(report.readyToFundFromPool, false, 'and must never be a reason to switch');
  } finally {
    proto.heldBalances = before;
  }
});

test('R2-5: a mistaken transfer shows up as excess, not as a Space having money', async () => {
  const { store, spaceId } = setup();
  const { XLayerAdapter } = await import('../src/xlayer.js');
  const proto = XLayerAdapter.prototype;
  const before = proto.heldBalances;
  proto.heldBalances = async () => ({
    perSpace: { [spaceId]: 0n },
    sumOfSpaceBalances: 0n,
    totalAccounted: 0n,
    routerTokenBalance: 7_000_000n,
    excess: 7_000_000n,
  });
  try {
    const report = await store.reconcileOnchainBalances();
    assert.equal(report.summary.excess, '7.000000', 'the excess should be visible');
    assert.equal(report.perSpace[0].heldOnChain, '0.000000', 'and not credited to a Space');
  } finally {
    proto.heldBalances = before;
  }
});

test('R2-6: a router with no pool at all is not a router holding nothing', async () => {
  const { store, spaceId } = setup();
  const { XLayerAdapter } = await import('../src/xlayer.js');
  const proto = XLayerAdapter.prototype;
  const before = proto.heldBalances;
  // poolDeployed false is what heldBalances reports when totalAccounted() is not
  // callable — a router built before the pool existed. Every number is zero, so
  // the arithmetic is "consistent" and says nothing.
  proto.heldBalances = async () => ({
    poolDeployed: false,
    perSpace: { [spaceId]: 0n }, sumOfSpaceBalances: 0n, totalAccounted: 0n,
    routerTokenBalance: 0n, excess: 0n,
  });
  try {
    const report = await store.reconcileOnchainBalances();
    assert.equal(report.poolDeployed, false, 'the absence of a pool must be visible');
    assert.equal(report.chainBalances, false, '0 == 0 is not a passing invariant when there is no pool');
    assert.equal(report.readyToFundFromPool, false, 'and there is nothing to fund from');
  } finally {
    proto.heldBalances = before;
  }
});

test('R2-7: a fully backed ledger with a real pool is the only thing that unblocks', async () => {
  const { store, spaceId } = setup();
  const { XLayerAdapter } = await import('../src/xlayer.js');
  const proto = XLayerAdapter.prototype;
  const before = proto.heldBalances;
  const one = 1_000_000_000n;
  proto.heldBalances = async () => ({
    poolDeployed: true,
    bound: { [spaceId]: true },
    perSpace: { [spaceId]: one }, sumOfSpaceBalances: one,
    totalAccounted: one, routerTokenBalance: one, excess: 0n,
  });
  try {
    const report = await store.reconcileOnchainBalances();
    assert.equal(report.poolDeployed, true);
    assert.equal(report.readyToFundFromPool, true);
  } finally {
    proto.heldBalances = before;
  }
});
