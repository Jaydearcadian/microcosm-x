/**
 * Which wallet a direct payment actually comes from.
 *
 * The point of the pool is that a Space's money belongs to that Space, so a
 * payment should come out of the Space's own onchain balance. The temptation
 * this guards against is the quiet version: when the check is anything other
 * than a clear yes, fall back to the broadcaster's shared wallet and let the
 * payment through anyway. Every case here is about refusing that.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { SpaceStore } from '../src/space-store.js';

const TX = '0x' + 'ab'.repeat(32);

function setup() {
  const seen = [];
  const store = new SpaceStore({
    seed: false,
    settlement: async (args) => {
      seen.push(args);
      return { txHash: TX, txHashes: { direct: TX } };
    },
  });
  const space = store.createSpace({ name: 'Pool Space', actorId: '0x' + '11'.repeat(20) });
  store.fundSpace({ spaceId: space.id, amount: '1000.00', actorId: '0x' + '11'.repeat(20) });
  return { store, spaceId: space.id, seen };
}

/** Stubs the chain picture the store reads to decide. */
function stubChain(store, picture) {
  const original = store.reconcileOnchainBalances;
  store.reconcileOnchainBalances = async () => picture;
  return () => { store.reconcileOnchainBalances = original; };
}

const BACKED = {
  poolDeployed: true,
  chainBalances: true,
  agrees: true,
  perSpace: [{ spaceId: 'x', claimed: '1000.000000', heldOnChain: '1000.000000', difference: '0.000000', agrees: true, state: 'AGREES' }],
};

test('F-1: an unfunded Space is paid from the broadcaster, and says why', async () => {
  const { store, spaceId } = setup();
  const restore = stubChain(store, {
    ...BACKED,
    perSpace: [{ spaceId, claimed: '1000.000000', heldOnChain: '0.000000', difference: '1000.000000', agrees: false, state: 'UNBACKED' }],
  });
  try {
    const verdict = await store._spaceIsPoolBacked(spaceId);
    assert.equal(verdict.funded, false, 'an unbacked ledger must not draw from the pool');
    assert.match(verdict.reason, /disagree/, `reason should name the disagreement, got: ${verdict.reason}`);
  } finally { restore(); }
});

test('F-2: a Space with money in its own pool is paid from that pool', async () => {
  const { store, spaceId } = setup();
  const restore = stubChain(store, { ...BACKED, perSpace: [{ ...BACKED.perSpace[0], spaceId }] });
  try {
    const verdict = await store._spaceIsPoolBacked(spaceId);
    assert.equal(verdict.funded, true, `expected funded, reason was: ${verdict.reason}`);
  } finally { restore(); }
});

test('F-3: a router with no pool is never treated as a funded Space', async () => {
  const { store, spaceId } = setup();
  const restore = stubChain(store, { ...BACKED, poolDeployed: false, chainBalances: false });
  try {
    const verdict = await store._spaceIsPoolBacked(spaceId);
    assert.equal(verdict.funded, false);
    assert.match(verdict.reason, /no per-Space pool/);
  } finally { restore(); }
});

test('F-4: a broken router is never treated as a funded Space', async () => {
  const { store, spaceId } = setup();
  const restore = stubChain(store, { ...BACKED, chainBalances: false });
  try {
    const verdict = await store._spaceIsPoolBacked(spaceId);
    assert.equal(verdict.funded, false);
    assert.match(verdict.reason, /holds less than it owes/);
  } finally { restore(); }
});

test('F-5: a Space that deposited nothing is not funded, even when the books agree', async () => {
  const { store, spaceId } = setup();
  // The ledger and the chain can both say zero and still be perfectly
  // consistent. Agreement is not the same as having a balance to spend.
  const restore = stubChain(store, {
    ...BACKED,
    perSpace: [{ spaceId, claimed: '0.000000', heldOnChain: '0.000000', difference: '0.000000', agrees: true, state: 'AGREES' }],
  });
  try {
    const verdict = await store._spaceIsPoolBacked(spaceId);
    assert.equal(verdict.funded, false, 'a zero balance cannot fund anything');
    assert.match(verdict.reason, /deposited nothing/);
  } finally { restore(); }
});

test('F-6: an unreachable chain is a refusal, not a silent downgrade', async () => {
  const { store, spaceId } = setup();
  const restore = stubChain(store, null);
  store.reconcileOnchainBalances = async () => { throw new Error('rpc unreachable'); };
  try {
    const verdict = await store._spaceIsPoolBacked(spaceId);
    assert.equal(verdict.funded, false, 'a failed check must not read as permission');
    assert.match(verdict.reason, /could not check the chain/);
  } finally { restore(); }
});

/**
 * Money in a pool is not the same as money a Space can spend.
 *
 * SpaceBudget refuses an unbound Space, so a Space whose limits were never
 * signed holds its funds and cannot pay a single person out of them. This
 * happened in production: 15,530 USDC sat in pools across four Spaces, every
 * one of which would have reverted on payment, while the books and the chain
 * agreed perfectly with each other and the report called the whole thing ready.
 */
test('F-8: readiness is false while any Space holds funds it cannot spend', async () => {
  const { store, spaceId } = setup();
  const { XLayerAdapter } = await import('../src/xlayer.js');
  const proto = XLayerAdapter.prototype;
  const before = proto.heldBalances;
  const one = 1_000_000_000n;
  proto.heldBalances = async () => ({
    poolDeployed: true,
    // This Space is bound, so it can spend.
    bound: { [spaceId]: true },
    perSpace: { [spaceId]: one }, sumOfSpaceBalances: one,
    totalAccounted: one, routerTokenBalance: one, excess: 0n,
  });
  try {
    const funded = await store.reconcileOnchainBalances({ spaceIds: [spaceId] });
    assert.equal(funded.perSpace[0].bound, true);
    assert.equal(funded.perSpace[0].spendable, true);
    assert.equal(funded.stranded.spaces.length, 0, 'a bound Space is not stranded');
    assert.equal(funded.readyToFundFromPool, true);

    // Now take the binding away while leaving the money exactly where it was.
    proto.heldBalances = async () => ({
      poolDeployed: true,
      bound: { [spaceId]: false },
      perSpace: { [spaceId]: one }, sumOfSpaceBalances: one,
      totalAccounted: one, routerTokenBalance: one, excess: 0n,
    });
    const stranded = await store.reconcileOnchainBalances({ spaceIds: [spaceId] });
    assert.equal(stranded.agrees, true, 'the books and the chain still agree');
    assert.equal(stranded.perSpace[0].spendable, false, 'but the funds cannot be spent');
    assert.deepEqual(stranded.stranded.spaces, [spaceId]);
    assert.equal(stranded.stranded.total, '1000.000000');
    assert.equal(stranded.readyToFundFromPool, false,
      'agreement between books and chain is not the same as a Space being able to pay');
  } finally {
    proto.heldBalances = before;
  }
});

test('F-9: an empty unbound Space is not stranded', async () => {
  const { store, spaceId } = setup();
  const { XLayerAdapter } = await import('../src/xlayer.js');
  const proto = XLayerAdapter.prototype;
  const before = proto.heldBalances;
  proto.heldBalances = async () => ({
    poolDeployed: true, bound: { [spaceId]: false },
    perSpace: { [spaceId]: 0n }, sumOfSpaceBalances: 0n,
    totalAccounted: 0n, routerTokenBalance: 0n, excess: 0n,
  });
  try {
    const report = await store.reconcileOnchainBalances({ spaceIds: [spaceId] });
    assert.equal(report.stranded.spaces.length, 0,
      'a Space with no money and no binding is empty, not stranded');
  } finally {
    proto.heldBalances = before;
  }
});
