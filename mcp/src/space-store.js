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
    /** @type {Map<string, object>} Work Orders keyed by jobId */
    this.jobs = new Map();
    this._nextJobSeq = 1;

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

  // ---------------------------------------------------------------------------
  // First-class Work lifecycle (mirrors AgenticCommerce.sol on X Layer)
  //
  // Money must never move without a Work Order and verifiable deliverable
  // proof. State machine:
  //   Open -> Funded -> Submitted -> Completed / Rejected / Expired
  //
  // Gaia exception handling: on Rejected or Expired, 100% of escrowed funds
  // are refunded to the Space balance via claimRefund semantics.
  // ---------------------------------------------------------------------------

  /**
   * Parse a deadline into epoch millis. Accepts ISO strings, ms numbers, or
   * seconds numbers (heuristic: < 1e12 treated as seconds).
   */
  _parseDeadline(deadline) {
    if (deadline === undefined || deadline === null || deadline === '') {
      throw new Error('Work Order requires a future deadline');
    }
    let ms;
    if (typeof deadline === 'number') {
      ms = deadline < 1e12 ? deadline * 1000 : deadline;
    } else if (typeof deadline === 'string' && /^\d+$/.test(deadline.trim())) {
      const n = Number(deadline.trim());
      ms = n < 1e12 ? n * 1000 : n;
    } else {
      ms = Date.parse(deadline);
    }
    if (!Number.isFinite(ms)) {
      throw new Error(`Invalid deadline '${deadline}': must be ISO date or epoch`);
    }
    return ms;
  }

  _getSpaceOrThrow(spaceId) {
    const space = this.spaces.get(spaceId);
    if (!space) {
      throw new Error(`Space '${spaceId}' not found`);
    }
    return space;
  }

  _getJobOrThrow(spaceId, jobId) {
    const job = this.jobs.get(jobId);
    if (!job || job.spaceId !== spaceId) {
      throw new Error(`Work Order '${jobId}' not found in Space '${spaceId}'`);
    }
    return job;
  }

  /**
   * Gaia exception refund: return 100% of escrowed funds to the Space balance.
   * Mirrors AgenticCommerce.claimRefund() on X Layer.
   */
  _claimRefund(space, job, trigger) {
    const escrowed = toBaseUnits(job.escrowedAmount || job.budget || '0');
    if (escrowed > 0n && !job.refunded) {
      const balanceBefore = toBaseUnits(space.balance);
      space.balance = fromBaseUnits(balanceBefore + escrowed);
      // Daily-budget headroom: the escrow committed funds against the daily
      // budget at creation, so a Gaia refund restores that headroom ($0 lost).
      const spentBefore = toBaseUnits(space.totalSpentToday || '0');
      const restored = spentBefore > escrowed ? spentBefore - escrowed : 0n;
      space.totalSpentToday = fromBaseUnits(restored);
      job.refunded = true;
      job.refundedAmount = fromBaseUnits(escrowed);
    } else if (!job.refunded) {
      job.refunded = true;
      job.refundedAmount = '0.000000';
    }
    const timestamp = new Date().toISOString();
    const record = {
      type: trigger === 'expiry' ? 'WORK_EXPIRED' : 'WORK_REJECTED',
      jobId: job.jobId,
      spaceId: space.id,
      refundedAmount: job.refundedAmount,
      gaiaException: true,
      exceptionReason: job.feedback || job.exceptionReason || 'Gaia exception refund',
      spaceBalance: space.balance,
      timestamp,
    };
    this.activity.get(space.id).push(record);
    return record;
  }

  /**
   * Apply expiry lazily: a Funded/Submitted/Adjudicating job past its
   * deadline becomes Expired with a full Gaia refund. Returns true if
   * expiry was applied. Adjudicating jobs expire too: the escape hatch
   * guarantees a stalled court can never strand escrowed funds.
   */
  _applyExpiry(space, job) {
    if (job.status !== 'Funded' && job.status !== 'Submitted' && job.status !== 'Adjudicating') {
      return false;
    }
    if (Date.now() < job.deadlineMs) {
      return false;
    }
    job.status = 'Expired';
    job.exceptionReason = `Deadline exceeded (${job.deadline}) — Gaia exception refund`;
    job.expiredAt = new Date().toISOString();
    this._claimRefund(space, job, 'expiry');
    return true;
  }

  /**
   * Create a Work Order and escrow funds from the Space balance.
   * Transitions: Open -> Funded (atomic within this call).
   *
   * Optional court binding: pass `adjudicator` (Internet Court resolver ID)
   * with a `rubricHash` to route contested deliverables to adjudication
   * instead of single-evaluator settlement, mirroring AgenticCommerce.sol.
   */
  createJob({ spaceId, actorId, provider, evaluator, adjudicator, rubricHash, description, budget, deadline }) {
    const space = this._getSpaceOrThrow(spaceId);
    if (!provider) {
      throw new Error('Work Order requires a provider');
    }
    if (!evaluator) {
      throw new Error('Work Order requires an evaluator');
    }
    if (!description) {
      throw new Error('Work Order requires a description');
    }
    if (budget === undefined || budget === null || budget === '') {
      throw new Error('Work Order requires a budget');
    }

    let budgetBase;
    try {
      budgetBase = toBaseUnits(budget);
    } catch {
      throw new Error(`Invalid budget '${budget}': must be a USDC decimal string`);
    }
    if (budgetBase <= 0n) {
      throw new Error(`Invalid budget '${budget}': must be greater than zero`);
    }

    const deadlineMs = this._parseDeadline(deadline);
    if (deadlineMs <= Date.now()) {
      throw new Error('Work Order deadline must be in the future');
    }

    // Optional Internet Court binding: a resolver ID plus the acceptance
    // rubric hash. Court-bound work skips single-evaluator settlement and
    // resolves only through requestVerdict/postVerdict.
    let courtAdjudicator = null;
    let courtRubric = null;
    if (adjudicator !== undefined && adjudicator !== null && adjudicator !== '') {
      if (typeof adjudicator !== 'string') {
        throw new Error('Work Order adjudicator must be a resolver ID string');
      }
      courtAdjudicator = adjudicator;
    }
    if (rubricHash !== undefined && rubricHash !== null && rubricHash !== '') {
      if (typeof rubricHash !== 'string') {
        throw new Error('Work Order rubricHash must be a string');
      }
      courtRubric = rubricHash;
    }

    // Space policy gate: the escrowed budget must satisfy Space rules
    // (maxPerTransaction, daily budget, counterparty allowlist, balance).
    const actionId = `act-${crypto.randomUUID().slice(0, 8)}`;
    const evaluation = evaluateSpacePayment(space, {
      actionId,
      actorId,
      recipient: provider,
      amount: String(budget),
      memo: description,
    });
    const timestamp = new Date().toISOString();
    if (!evaluation.allowed) {
      const record = {
        type: 'WORK_DENIED',
        actionId,
        actorId,
        provider,
        budget: String(budget),
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

    // Escrow: move funds out of the spendable Space balance into the job.
    const balanceBefore = toBaseUnits(space.balance);
    space.balance = fromBaseUnits(balanceBefore - budgetBase);
    // Daily-budget accounting: escrow commits funds immediately, so it counts
    // against the daily budget at creation. Without this, concurrent Work
    // Orders could collectively breach the daily cap (each checked against a
    // stale totalSpentToday of 0). Settlement does not double-count; Gaia
    // refunds restore headroom.
    const spentTodayBefore = toBaseUnits(space.totalSpentToday || '0');
    space.totalSpentToday = fromBaseUnits(spentTodayBefore + budgetBase);

    const jobId = `job-${String(this._nextJobSeq++).padStart(4, '0')}`;
    const job = {
      jobId,
      spaceId,
      client: actorId,
      provider,
      evaluator,
      adjudicator: courtAdjudicator,
      rubricHash: courtRubric,
      adjudication: null,
      description,
      budget: fromBaseUnits(budgetBase),
      escrowedAmount: fromBaseUnits(budgetBase),
      status: 'Funded',
      statusHistory: [
        { status: 'Open', timestamp },
        { status: 'Funded', timestamp },
      ],
      deliverableHash: null,
      evidenceUri: null,
      feedback: null,
      deadline: new Date(deadlineMs).toISOString(),
      deadlineMs,
      createdAt: timestamp,
      fundedAt: timestamp,
      submittedAt: null,
      completedAt: null,
      refunded: false,
      refundedAmount: null,
      settlement: null,
      actionId,
      authHash: evaluation.approvedIntent.authHash,
    };
    this.jobs.set(jobId, job);
    this.activity.get(spaceId).push({
      type: 'WORK_CREATED',
      jobId,
      actionId,
      actorId,
      provider,
      evaluator,
      adjudicator: courtAdjudicator,
      rubricHash: courtRubric,
      budget: job.budget,
      deadline: job.deadline,
      fromStatus: 'Open',
      toStatus: 'Funded',
      spaceBalance: space.balance,
      timestamp,
    });

    return {
      status: 'Funded',
      job: { ...job },
      spaceBalance: space.balance,
    };
  }

  /**
   * Provider submits verifiable deliverable proof (hash + evidence URI).
   * Transition: Funded -> Submitted.
   */
  submitDeliverable({ spaceId, jobId, actorId, deliverableHash, evidenceUri }) {
    const space = this._getSpaceOrThrow(spaceId);
    const job = this._getJobOrThrow(spaceId, jobId);

    if (this._applyExpiry(space, job)) {
      return {
        status: 'Expired',
        job: { ...job },
        spaceBalance: space.balance,
        gaiaRefund: job.refundedAmount,
      };
    }

    if (job.status !== 'Funded') {
      throw new Error(`Work Order '${jobId}' is '${job.status}': only Funded work can accept a deliverable`);
    }
    if (actorId !== job.provider) {
      throw new Error(`Only provider '${job.provider}' can submit deliverables for Work Order '${jobId}'`);
    }
    if (!deliverableHash) {
      throw new Error('submitDeliverable requires a deliverableHash (verifiable proof)');
    }

    const timestamp = new Date().toISOString();
    job.deliverableHash = deliverableHash;
    job.evidenceUri = evidenceUri || null;
    job.status = 'Submitted';
    job.submittedAt = timestamp;
    job.statusHistory.push({ status: 'Submitted', timestamp });

    this.activity.get(spaceId).push({
      type: 'WORK_SUBMITTED',
      jobId,
      actorId,
      deliverableHash,
      evidenceUri: job.evidenceUri,
      fromStatus: 'Funded',
      toStatus: 'Submitted',
      timestamp,
    });

    return {
      status: 'Submitted',
      job: { ...job },
      spaceBalance: space.balance,
    };
  }

  /**
   * Settle escrowed funds to the provider on OKX X Layer (mock receipt).
   * Shared by evaluator approval and Internet Court verdict settlement.
   * The daily budget was already consumed at escrow time; settlement must
   * not double-count it.
   */
  _settleJob(space, job, fromStatus, decidedBy, feedback) {
    const timestamp = new Date().toISOString();
    job.status = 'Completed';
    job.feedback = feedback || null;
    job.completedAt = timestamp;
    job.statusHistory.push({ status: 'Completed', timestamp });

    const mockTxHash = `0x${crypto.randomBytes(32).toString('hex')}`;
    const receipt = {
      receiptId: `rcpt-${crypto.randomUUID().slice(0, 8)}`,
      actionId: job.actionId,
      spaceId: space.id,
      jobId: job.jobId,
      actorId: job.client,
      provider: job.provider,
      evaluator: job.evaluator,
      recipient: job.provider,
      amount: job.budget,
      asset: space.currency,
      network: 'OKX X Layer Testnet',
      chainId: space.chainId,
      txHash: mockTxHash,
      status: 'SETTLED',
      deliverableHash: job.deliverableHash,
      evidenceUri: job.evidenceUri,
      timestamp,
    };
    job.settlement = receipt;
    this.receipts.set(receipt.receiptId, receipt);

    this.activity.get(space.id).push({
      type: 'WORK_COMPLETED',
      jobId: job.jobId,
      evaluatorId: decidedBy,
      feedback: job.feedback,
      fromStatus,
      toStatus: 'Completed',
      settlement: receipt,
      spaceBalance: space.balance,
      timestamp,
    });

    return {
      status: 'Completed',
      job: { ...job },
      receipt,
      spaceBalance: space.balance,
    };
  }

  /**
   * Evaluator approves or rejects the submitted deliverable.
   * Approved:   Submitted -> Completed (settles on OKX X Layer).
   * Rejected:   Submitted/Funded -> Rejected (Gaia full refund to Space).
   * Court-bound work and Adjudicating work never settle here: payouts halt
   * until the Internet Court posts its verdict.
   */
  evaluateJob({ spaceId, jobId, evaluatorId, approved, feedback }) {
    const space = this._getSpaceOrThrow(spaceId);
    const job = this._getJobOrThrow(spaceId, jobId);

    if (this._applyExpiry(space, job)) {
      return {
        status: 'Expired',
        job: { ...job },
        spaceBalance: space.balance,
        gaiaRefund: job.refundedAmount,
      };
    }

    if (job.status === 'Adjudicating') {
      throw new Error(`Work Order '${jobId}' is Adjudicating: payout halted until the court posts its verdict`);
    }

    if (job.adjudicator) {
      throw new Error(`Work Order '${jobId}' is court-bound: refer it via work_request_verdict, verdict via work_post_verdict`);
    }

    if (evaluatorId !== job.evaluator) {
      throw new Error(`Only evaluator '${job.evaluator}' can evaluate Work Order '${jobId}'`);
    }

    const timestamp = new Date().toISOString();

    if (approved === true) {
      if (job.status !== 'Submitted') {
        throw new Error(`Work Order '${jobId}' is '${job.status}': only Submitted work can be approved`);
      }
      if (!job.deliverableHash) {
        throw new Error(`Work Order '${jobId}' has no verifiable deliverable proof: money cannot move without proof`);
      }
      return this._settleJob(space, job, 'Submitted', evaluatorId, feedback);
    }

    if (approved === false) {
      if (job.status !== 'Submitted' && job.status !== 'Funded') {
        throw new Error(`Work Order '${jobId}' is '${job.status}': cannot reject from terminal state`);
      }
      job.status = 'Rejected';
      job.feedback = feedback || null;
      job.completedAt = timestamp;
      job.statusHistory.push({ status: 'Rejected', timestamp });
      const refundRecord = this._claimRefund(space, job, 'reject');
      return {
        status: 'Rejected',
        job: { ...job },
        gaiaRefund: job.refundedAmount,
        spaceBalance: space.balance,
        refundRecord,
      };
    }

    throw new Error(`evaluateJob requires approved to be true or false`);
  }

  /**
   * Refer a Submitted deliverable to the Internet Court. The resolver
   * receives (jobId, deliverableHash, evidenceUri, rubricHash); the job
   * moves to Adjudicating and all payouts halt until the verdict.
   * Callable by the client, provider, or evaluator.
   */
  requestVerdict({ spaceId, jobId, actorId }) {
    const space = this._getSpaceOrThrow(spaceId);
    const job = this._getJobOrThrow(spaceId, jobId);

    if (this._applyExpiry(space, job)) {
      return {
        status: 'Expired',
        job: { ...job },
        spaceBalance: space.balance,
        gaiaRefund: job.refundedAmount,
      };
    }

    if (job.status !== 'Submitted') {
      throw new Error(`Work Order '${jobId}' is '${job.status}': only Submitted work can be referred to the court`);
    }
    if (!job.deliverableHash) {
      throw new Error(`Work Order '${jobId}' has no verifiable deliverable proof: the court has nothing to judge`);
    }
    if (!job.adjudicator) {
      throw new Error(`Work Order '${jobId}' has no bound adjudicator`);
    }
    if (actorId !== job.client && actorId !== job.provider && actorId !== job.evaluator) {
      throw new Error(`Actor '${actorId}' is not a party to Work Order '${jobId}'`);
    }

    const timestamp = new Date().toISOString();
    const caseId = `case-${job.jobId}-${crypto.randomUUID().slice(0, 8)}`;
    job.status = 'Adjudicating';
    job.adjudication = {
      caseId,
      requestedBy: actorId,
      requestedAt: timestamp,
      deliverableHash: job.deliverableHash,
      evidenceUri: job.evidenceUri,
      rubricHash: job.rubricHash,
    };
    job.statusHistory.push({ status: 'Adjudicating', timestamp });

    const record = {
      type: 'WORK_ADJUDICATION_REQUESTED',
      jobId: job.jobId,
      spaceId: space.id,
      caseId,
      adjudicator: job.adjudicator,
      deliverableHash: job.deliverableHash,
      evidenceUri: job.evidenceUri,
      rubricHash: job.rubricHash,
      requestedBy: actorId,
      fromStatus: 'Submitted',
      toStatus: 'Adjudicating',
      note: 'Payout halted until the court posts its verdict',
      timestamp,
    };
    this.activity.get(space.id).push(record);

    return {
      status: 'Adjudicating',
      job: { ...job },
      case: { ...job.adjudication },
      spaceBalance: space.balance,
    };
  }

  /**
   * Verdict callback — callable ONLY by the job's bound adjudicator.
   * Approval settles to the provider on X Layer; rejection refunds 100%
   * to the Space (Gaia exception semantics).
   */
  postVerdict({ spaceId, jobId, adjudicatorId, approved, reason }) {
    const space = this._getSpaceOrThrow(spaceId);
    const job = this._getJobOrThrow(spaceId, jobId);

    if (this._applyExpiry(space, job)) {
      return {
        status: 'Expired',
        job: { ...job },
        spaceBalance: space.balance,
        gaiaRefund: job.refundedAmount,
      };
    }

    if (job.status !== 'Adjudicating') {
      throw new Error(`Work Order '${jobId}' is '${job.status}': verdicts require Adjudicating work`);
    }
    if (adjudicatorId !== job.adjudicator) {
      throw new Error(`Only adjudicator '${job.adjudicator}' can post the verdict for Work Order '${jobId}'`);
    }
    if (approved !== true && approved !== false) {
      throw new Error('postVerdict requires approved to be true or false');
    }

    const timestamp = new Date().toISOString();
    if (approved === true) {
      if (!job.deliverableHash) {
        throw new Error(`Work Order '${jobId}' has no verifiable deliverable proof: money cannot move without proof`);
      }
      const result = this._settleJob(space, job, 'Adjudicating', adjudicatorId, reason || null);
      this.activity.get(spaceId).push({
        type: 'WORK_ADJUDICATION_RESOLVED',
        jobId,
        adjudicatorId,
        approved: true,
        reason: reason || null,
        fromStatus: 'Adjudicating',
        toStatus: 'Completed',
        spaceBalance: space.balance,
        timestamp,
      });
      return { ...result, verdict: 'approve' };
    }

    job.status = 'Rejected';
    job.feedback = reason || null;
    job.completedAt = timestamp;
    job.statusHistory.push({ status: 'Rejected', timestamp });
    const refundRecord = this._claimRefund(space, job, 'reject');
    return {
      status: 'Rejected',
      job: { ...job },
      verdict: 'reject',
      gaiaRefund: job.refundedAmount,
      spaceBalance: space.balance,
      refundRecord,
    };
  }

  /**
   * Read a Work Order by ID (applies lazy expiry first).
   */
  getJob({ spaceId, jobId }) {
    const space = this._getSpaceOrThrow(spaceId);
    const job = this._getJobOrThrow(spaceId, jobId);
    this._applyExpiry(space, job);
    return { ...job };
  }
}
