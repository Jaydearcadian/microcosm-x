/**
 * Money must not be deposited for a Space that can never spend or recover it.
 *
 * A withdrawal is gated on the Space's own signed owner, read from the limits
 * contract. A Space that was never bound therefore has nobody who can ever
 * authorise a refund — not its owner, not the router owner, nobody. Anything put
 * in its pool is unreachable forever.
 *
 * That is not hypothetical. Depositing into pools for four unbound Spaces
 * stranded 15,830 USDC, and the only reason the loss was bounded at all is that
 * one Space had been bound out of band by hand. The ordering has to be
 * enforced, not remembered.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { SpaceStore } from '../src/space-store.js';

const OWNER = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const VENDOR = '0x1111111111111111111111111111111111111111';

function setup() {
  const store = new SpaceStore({ seed: false });
  const space = store.createSpace({ name: 'Funding Order', actorId: OWNER });
  store.bindMemberAddress(space.id, OWNER, OWNER);
  return { store, spaceId: space.id };
}

async function withStubbedAdapter(store, bound, fn) {
  const { XLayerAdapter } = await import('../src/xlayer.js');
  const proto = XLayerAdapter.prototype;
  const beforeBinding = proto.spaceBudgetBinding;
  const beforeDeposit = proto.depositSpacePool;
  const deposited = [];
  proto.spaceBudgetBinding = async () => ({
    bound,
    owner: bound ? OWNER : null,
    maxPerTransaction: bound ? 500_000_000n : 0n,
    dailyBudget: bound ? 2_000_000_000n : 0n,
    readable: true,
  });
  proto.depositSpacePool = async ({ spaceId, amount }) => {
    deposited.push({ spaceId, amount });
    return { depositTx: '0x' + 'ab'.repeat(32) };
  };
  try {
    return await fn(deposited);
  } finally {
    proto.spaceBudgetBinding = beforeBinding;
    proto.depositSpacePool = beforeDeposit;
  }
}

test('FB-1: funding an unbound Space is refused before any money moves', async () => {
  const { store, spaceId } = setup();
  await withStubbedAdapter(store, false, async (deposited) => {
    await assert.rejects(
      () => store.fundSpaceOnchain({ spaceId, amount: '500.00', actorId: OWNER }),
      (err) => {
        // The refusal has to say what to do, not just that it failed.
        assert.match(err.message, /no spending limits signed on chain/i);
        assert.match(err.message, /bind the limits on chain first/i);
        assert.match(err.message, /nothing has been deposited/i);
        return true;
      },
    );
    assert.equal(deposited.length, 0, 'no deposit may be attempted at all');
  });
});

test('FB-2: a refused funding leaves the ledger claiming nothing', async () => {
  const { store, spaceId } = setup();
  await withStubbedAdapter(store, false, async () => {
    await assert.rejects(() => store.fundSpaceOnchain({ spaceId, amount: '500.00', actorId: OWNER }));
  });
  // The important half: the ledger must not have been credited, or the Space is
  // claiming money that was never deposited and cannot be recovered.
  assert.equal(toPlain(store.getSpace(spaceId).balance), 0);
});

test('FB-3: a bound Space is funded normally', async () => {
  const { store, spaceId } = setup();
  await withStubbedAdapter(store, true, async (deposited) => {
    const space = await store.fundSpaceOnchain({ spaceId, amount: '500.00', actorId: OWNER });
    assert.equal(deposited.length, 1, 'the deposit should have happened');
    assert.equal(toPlain(space.balance), 500);
  });
});

test('FB-4: a non-admin still cannot fund, and the order of the checks does not leak', async () => {
  const { store, spaceId } = setup();
  await withStubbedAdapter(store, true, async (deposited) => {
    await assert.rejects(
      () => store.fundSpaceOnchain({ spaceId, amount: '500.00', actorId: '0x9999999999999999999999999999999999999999' }),
      /not an admin/i,
    );
    assert.equal(deposited.length, 0);
  });
});

function toPlain(v) {
  return Number(String(v ?? '0'));
}
