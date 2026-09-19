import crypto from 'node:crypto';
import { evaluateSpacePayment, toBaseUnits, fromBaseUnits } from '../../packages/policy-engine/src/index.js';

/**
 * In-memory Space store providing state continuity across MCP and API calls.
 */
export class SpaceStore {
  constructor() {
    /** @type {Map<string, object>} */
    this.spaces = new Map();
    /** @type {Map<string, Array<object>>} */
    this.activity = new Map();
    /** @type {Map<string, object>} */
    this.receipts = new Map();

    // Seed with canonical Procurement Space
    this.seedProcurementSpace();
  }

  seedProcurementSpace() {
    const defaultSpace = {
      id: 'space-procurement-001',
      name: 'Autonomous Procurement Space',
      description: 'Bounded operating context for purchasing compute, datasets, and API credits.',
      network: 'OKX X Layer Testnet',
      chainId: 195,
      balance: '5000.00',
      currency: 'USDC',
      totalSpentToday: '0.00',
      members: [
        { id: 'admin-01', name: 'Treasury Admin', role: 'admin' },
        { id: 'agent-procure-01', name: 'Autonomous Procurement Agent', role: 'agent' },
      ],
      rules: {
        maxPerTransaction: '500.00',
        dailyBudget: '2000.00',
        allowedCounterparties: [
          '0x1111111111111111111111111111111111111111', // CloudCompute Corp
          '0x2222222222222222222222222222222222222222', // Dataset Provider
          'cloudcompute.eth',
        ],
      },
    };
    this.spaces.set(defaultSpace.id, defaultSpace);
    this.activity.set(defaultSpace.id, []);
  }

  getSpace(spaceId) {
    return this.spaces.get(spaceId);
  }

  listSpaces(actorId) {
    const list = [];
    for (const space of this.spaces.values()) {
      if (!actorId || (space.members || []).some((m) => m.id === actorId)) {
        list.push({
          id: space.id,
          name: space.name,
          description: space.description,
          currency: space.currency,
          balance: space.balance,
          myRole: (space.members || []).find((m) => m.id === actorId)?.role || 'unaffiliated',
        });
      }
    }
    return list;
  }

  getCapabilities(spaceId, actorId) {
    const space = this.spaces.get(spaceId);
    if (!space) {
      throw new Error(`Space '${spaceId}' not found`);
    }
    const member = (space.members || []).find((m) => m.id === actorId);
    return {
      spaceId: space.id,
      spaceName: space.name,
      network: space.network,
      currency: space.currency,
      treasuryBalance: space.balance,
      spentToday: space.totalSpentToday,
      actor: member || { id: actorId, role: 'none' },
      rules: {
        maxPerTransaction: space.rules.maxPerTransaction,
        dailyBudget: space.rules.dailyBudget,
        allowedCounterparties: space.rules.allowedCounterparties,
      },
    };
  }

  requestPayment({ spaceId, actorId, recipient, amount, memo }) {
    const space = this.spaces.get(spaceId);
    if (!space) {
      throw new Error(`Space '${spaceId}' not found`);
    }

    const actionId = `act-${crypto.randomUUID().slice(0, 8)}`;
    const evaluation = evaluateSpacePayment(space, {
      actionId,
      actorId,
      recipient,
      amount,
      memo,
    });

    const timestamp = new Date().toISOString();

    if (!evaluation.allowed) {
      // Record denial proof in Space activity log
      const record = {
        type: 'PAYMENT_DENIED',
        actionId,
        actorId,
        recipient,
        amount,
        reasons: evaluation.reasons,
        denialProof: evaluation.denialProof,
        timestamp,
      };
      this.activity.get(spaceId).push(record);

      return {
        status: 'REJECTED',
        actionId,
        reasons: evaluation.reasons,
        denialProof: evaluation.denialProof,
        spaceBalance: space.balance,
      };
    }

    // Compliant payment: update Space balance and ledger
    const balanceBefore = toBaseUnits(space.balance);
    const amountBase = toBaseUnits(amount);
    const spentTodayBefore = toBaseUnits(space.totalSpentToday);

    space.balance = fromBaseUnits(balanceBefore - amountBase);
    space.totalSpentToday = fromBaseUnits(spentTodayBefore + amountBase);

    // Mock onchain settlement receipt on X Layer
    const mockTxHash = `0x${crypto.randomBytes(32).toString('hex')}`;
    const receipt = {
      receiptId: `rcpt-${crypto.randomUUID().slice(0, 8)}`,
      actionId,
      spaceId,
      actorId,
      recipient,
      amount,
      asset: space.currency,
      network: 'OKX X Layer Testnet',
      chainId: space.chainId,
      txHash: mockTxHash,
      status: 'SETTLED',
      authHash: evaluation.approvedIntent.authHash,
      timestamp,
      memo,
    };

    this.receipts.set(receipt.receiptId, receipt);
    this.activity.get(spaceId).push({
      type: 'PAYMENT_SETTLED',
      ...receipt,
    });

    return {
      status: 'SETTLED',
      receipt,
      spaceBalance: space.balance,
    };
  }

  getActivity(spaceId) {
    return this.activity.get(spaceId) || [];
  }
}
