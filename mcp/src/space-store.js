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
    /** @type {Map<string, object>} Space participants keyed by participantId */
    this.participants = new Map();
    /** @type {Map<string, object>} First-class Requests keyed by requestId */
    this.requests = new Map();
    this._nextJobSeq = 1;
    this._nextParticipantSeq = 1;
    this._nextRequestSeq = 1;
    // Seed with canonical Procurement Space
    this.seedProcurementSpace();
  }

  seedProcurementSpace() {
    const defaultSpace = {
      id: 'space-procurement-001',
      name: 'Autonomous Procurement Space',
      description: 'Bounded operating context for purchasing compute, datasets, and API credits.',
      network: 'OKX X Layer Testnet',
      chainId: 1952,
      balance: '5000.00',
      currency: 'USDC',
      totalSpentToday: '0.00',
      members: [
        { id: 'admin-01', name: 'Treasury Admin', role: 'admin', address: '0x066cFaf02c08D4D2df5FaB2F93bf1B5dB1292367' },
        { id: 'agent-procure-01', name: 'Autonomous Procurement Agent', role: 'agent', address: '0x066cFaf02c08D4D2df5FaB2F93bf1B5dB1292367' },
      ],
      rules: {
        maxPerTransaction: '500.00',
        dailyBudget: '2000.00',
        allowedCounterparties: [
          '0x1111111111111111111111111111111111111111', // CloudCompute Corp
          '0x2222222222222222222222222222222222222222', // Dataset Provider
          'cloudcompute.eth',
          '0xeE791E89F4Ad69662A96dcb2ABa52Eb8dcbDCEEE', // Live provider wallet
        ],
      },
    };
    this.spaces.set(defaultSpace.id, defaultSpace);
    this.activity.set(defaultSpace.id, []);
    // Seed participants mirror the Space members so the registry and the
    // legacy member list agree from the start.
    for (const member of defaultSpace.members) {
      const seed = {
        participantId: `part-${String(this._nextParticipantSeq++).padStart(4, '0')}`,
        spaceId: defaultSpace.id,
        displayName: member.name,
        kind: member.role === 'admin' ? 'Human' : member.role === 'agent' ? 'Agent' : 'Service',
        role: member.role,
        address: member.address || null,
        externalRef: null,
        status: 'Active',
        joinedAt: new Date().toISOString(),
      };
      this.participants.set(seed.participantId, seed);
    }
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

  /**
   * REAL onchain settlement via XLayerAdapter. Throws loudly on any failure
   * (no key, no RPC, address mismatch, chain mismatch, revert) — callers
   * must only mutate Space state after this resolves. There is no
   * simulated fallback anywhere in this file.
   */
  async _liveSettle({ space, jobIdLabel, provider, evaluatorId, evaluatorAddr, description, budget, deliverableHash }) {
    const { XLayerAdapter } = await import('./xlayer.js');
    const adapter = new XLayerAdapter();
    if (adapter.chainId !== space.chainId) {
      throw new Error(`Chain mismatch: Space '${space.id}' expects chain ${space.chainId}, adapter targets ${adapter.chainId} (${adapter.rpc})`);
    }
    const { providerKey } = await import('./provider-key.js');
    const evaluator = evaluatorAddr || evaluatorId;
    const result = adapter.settleJobOnchain({
      jobIdLabel,
      provider,
      evaluator,
      description,
      budget,
      deliverableHash,
      spaceId: space.id,
      providerKey: providerKey(),
    });
    return { txHash: result.txHashes.complete, txHashes: result.txHashes, onchainJobId: result.jobId };
  }

  async requestPayment({ spaceId, actorId, recipient, amount, memo }) {
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

    // Compliant payment: settle REAL value onchain first. If this throws,
    // Space books are untouched — there is no simulated fallback.
    const memberAddr = (space.members || []).find((mb) => mb.id === actorId)?.address;
    let live;
    try {
      live = await this._liveSettle({
        space,
        jobIdLabel: actionId,
        provider: recipient,
        evaluatorId: actorId,
        evaluatorAddr: memberAddr,
        description: memo || `Payment ${actionId}`,
        budget: amount,
        deliverableHash: evaluation.approvedIntent.deliverableHash || evaluation.approvedIntent.authHash,
      });
    } catch (err) {
      throw new Error(`Onchain settlement failed; Space books untouched: ${err.message}`, { cause: err });
    }

    const balanceBefore = toBaseUnits(space.balance);
    const amountBase = toBaseUnits(amount);
    const spentTodayBefore = toBaseUnits(space.totalSpentToday);

    space.balance = fromBaseUnits(balanceBefore - amountBase);
    space.totalSpentToday = fromBaseUnits(spentTodayBefore + amountBase);

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
      txHash: live.txHash,
      txHashes: live.txHashes,
      onchainJobId: live.onchainJobId,
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

  /**
   * Walk the full evidence chain for one Request (rebaseline §17 Slice 8):
   * Request → Work → Result → Authorization → Payment → Receipt → Activity.
   * One inspector, one chain.
   */
  traceRequest({ spaceId, requestId }) {
    const space = this._getSpaceOrThrow(spaceId);
    const request = this._getRequestOrThrow(spaceId, requestId);
    const all = this.activity.get(spaceId) || [];

    const work = request.workId ? this.jobs.get(request.workId) : null;

    // Events that belong to this Request or its Work. WORK_CREATED carries
    // both ids, so select on the union and dedupe by object identity.
    const seen = new Set();
    const activity = all
      .filter((a) => a.requestId === requestId || (work && a.jobId === work.jobId))
      .filter((a) => (seen.has(a) ? false : seen.add(a)))
      .sort((a, b) => (a.timestamp > b.timestamp ? 1 : -1));

    const payment = work && work.settlement ? this.receipts.get(work.settlement.receiptId) : null;

    // Authorization: the EIP-712 auth hash bound at escrow time.
    const authorization = work ? { authHash: work.authHash, actionId: work.actionId } : null;

    return {
      requestId,
      spaceId,
      title: request.title,
      status: request.status,
      chain: {
        request: { ...request },
        work: work
          ? {
              jobId: work.jobId,
              status: work.status,
              budget: work.budget,
              provider: work.provider,
              evaluator: work.evaluator,
              deliverableHash: work.deliverableHash,
              evidenceUri: work.evidenceUri,
              settlement: work.settlement,
            }
          : null,
        result: request.result,
        authorization,
        payment: payment
          ? {
              receiptId: payment.receiptId,
              amount: payment.amount,
              txHash: payment.txHash,
              txHashes: payment.txHashes,
              onchainJobId: payment.onchainJobId,
              network: payment.network,
              chainId: payment.chainId,
            }
          : null,
      },
      activity,
    };
  }

  /**
   * What a participant receives when assigned a Request (rebaseline §17
   * Slice 4): the Request itself, plus Context, Authority (the exact Space
   * rules and the granted authority of this participant), and the relevant
   * Space information. This is the receive-path payload.
   */
  receiveRequest({ spaceId, requestId, actorId }) {
    const space = this._getSpaceOrThrow(spaceId);
    const request = this._getRequestOrThrow(spaceId, requestId);

    const active = [...this.participants.values()].filter(
      (p) => p.spaceId === spaceId && p.status === 'Active'
    );
    const me = active.find((p) => p.displayName === actorId || p.participantId === actorId);
    if (!me) {
      throw new Error(`'${actorId}' is not an active participant of Space '${spaceId}'`);
    }

    // Authority: what this participant can and cannot do inside the Space.
    const rules = space.rules || {};
    const authority = {
      participantId: me.participantId,
      kind: me.kind,
      role: me.role,
      address: me.address,
      canCreateRequests: true,
      canAssigneeComplete: request.assignee === me.participantId,
      maxPerTransaction: rules.maxPerTransaction || null,
      dailyBudget: rules.dailyBudget || null,
      spentToday: space.totalSpentToday || '0.00',
      dailyBudgetRemaining: (() => {
        if (!rules.dailyBudget) return null;
        try {
          return fromBaseUnits(toBaseUnits(rules.dailyBudget) - toBaseUnits(space.totalSpentToday || '0'));
        } catch {
          return null;
        }
      })(),
      approvedCounterparties: rules.allowedCounterparties || [],
      network: space.network,
      chainId: space.chainId,
    };

    // Relevant Space information: the participants involved and the current
    // Work/Result linkage if it exists.
    const involved = request.assignee
      ? [active.find((p) => p.participantId === request.createdBy), me].filter(Boolean)
      : [active.find((p) => p.participantId === request.createdBy), me].filter(Boolean);
    const work = request.workId ? this.jobs.get(request.workId) : null;

    return {
      request: { ...request },
      context: request.context,
      authority,
      space: {
        spaceId: space.id,
        spaceName: space.name,
        network: space.network,
        chainId: space.chainId,
        treasuryBalance: space.balance,
        currency: space.currency,
      },
      participants: involved.map((p) => ({
        participantId: p.participantId,
        displayName: p.displayName,
        kind: p.kind,
        role: p.role,
        address: p.address,
      })),
      work: work
        ? {
            jobId: work.jobId,
            status: work.status,
            budget: work.budget,
            deliverableHash: work.deliverableHash,
            settlement: work.settlement,
          }
        : null,
    };
  }

  /**
   * Create a Space (rebaseline §17 Slice 1): the bounded operating context
   * for a group's work. The founder becomes the first participant and admin.
   */
  createSpace({ name, description = '', network = 'OKX X Layer Testnet', chainId = 1952, actorId = 'founder-01' }) {
    if (!name || typeof name !== 'string' || !name.trim()) {
      throw new Error("'name' must be a non-empty string");
    }
    const id = `space-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32)}-${crypto.randomUUID().slice(0, 4)}`;
    const now = new Date().toISOString();
    const space = {
      id,
      name: name.trim(),
      description: description || '',
      network,
      chainId,
      balance: '0.00',
      currency: 'USDC',
      totalSpentToday: '0.00',
      members: [{ id: actorId, name: actorId, role: 'admin' }],
      rules: {
        maxPerTransaction: '500.00',
        dailyBudget: '2000.00',
        allowedCounterparties: [],
      },
      createdAt: now,
    };
    this.spaces.set(id, space);
    this.activity.set(id, []);
    const seed = {
      participantId: `part-${String(this._nextParticipantSeq++).padStart(4, '0')}`,
      spaceId: id,
      displayName: actorId,
      kind: 'Human',
      role: 'admin',
      address: null,
      externalRef: null,
      status: 'Active',
      joinedAt: now,
    };
    this.participants.set(seed.participantId, seed);
    this.activity.get(id).push({
      type: 'SPACE_CREATED',
      spaceId: id,
      name: space.name,
      createdBy: actorId,
      timestamp: now,
    });
    return { ...space };
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
  createJob({ spaceId, actorId, provider, evaluator, adjudicator, rubricHash, description, budget, deadline, requestId }) {
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
    // Bind the Work Order to its Request (rebaseline §17 Slice 5):
    // Request → Work. The linkage lives on the store, not the demo.
    let requestRef = null;
    if (requestId !== undefined && requestId !== null && requestId !== '') {
      const request = this._getRequestOrThrow(spaceId, requestId);
      if (request.workId) {
        throw new Error(`Request '${requestId}' already has Work '${request.workId}' attached`);
      }
      request.workId = jobId;
      requestRef = { requestId, title: request.title, assignee: request.assignee };
    }

    this.jobs.set(jobId, job);
    this.activity.get(spaceId).push({
      type: 'WORK_CREATED',
      jobId,
      actionId,
      actorId,
      provider,
      evaluator,
      adjudicator: courtAdjudicator,
      requestId: requestRef ? requestRef.requestId : null,
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
      request: requestRef,
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
   * Settle escrowed funds to the provider on OKX X Layer (REAL transaction).
   * Shared by evaluator approval and Internet Court verdict settlement.
   * Settlement happens FIRST: if it throws, the job is untouched (still
   * Submitted/Adjudicating) and no receipt exists. No simulated fallback.
   * The daily budget was already consumed at escrow time; settlement must
   * not double-count it.
   */
  async _settleJob(space, job, fromStatus, decidedBy, feedback) {
    // Resolve Space member ids to wallet addresses for the onchain
    // evaluator binding (the chain needs addresses, not display ids).
    const evaluatorMember = (space.members || []).find(
      (mb) => mb.id === job.evaluator || mb.name === job.evaluator || mb.address === job.evaluator || mb.id === job.client
    );
    const evaluatorAddr = evaluatorMember?.address || job.evaluator;
    let live;
    try {
      live = await this._liveSettle({
        space,
        jobIdLabel: job.jobId,
        provider: job.provider,
        evaluatorId: job.evaluator,
        evaluatorAddr,
        description: job.description,
        budget: job.budget,
        deliverableHash: job.deliverableHash,
      });
    } catch (err) {
      throw new Error(`Onchain settlement failed for Work Order '${job.jobId}'; job left '${job.status}', no receipt created: ${err.message}`, { cause: err });
    }

    const timestamp = new Date().toISOString();
    job.status = 'Completed';
    job.feedback = feedback || null;
    job.completedAt = timestamp;
    job.statusHistory.push({ status: 'Completed', timestamp });

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
      txHash: live.txHash,
      txHashes: live.txHashes,
      onchainJobId: live.onchainJobId,
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
  async evaluateJob({ spaceId, jobId, evaluatorId, approved, feedback }) {
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
      return await this._settleJob(space, job, "Submitted", evaluatorId, feedback);
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
  async postVerdict({ spaceId, jobId, adjudicatorId, approved, reason }) {
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
      const result = await this._settleJob(space, job, "Adjudicating", adjudicatorId, reason || null);
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

  // ---------------------------------------------------------------------------
  // Requests: first-class product object (rebaseline §8, §17 Slice 3)
  //

  createRequest({ spaceId, createdBy, assignee = null, title, instructions = '', context = null }) {
    const space = this.spaces.get(spaceId);
    if (!space) throw new Error(`Space '${spaceId}' not found`);
    if (!title || typeof title !== 'string' || !title.trim()) {
      throw new Error("'title' must be a non-empty string");
    }
    const active = [...this.participants.values()].filter(
      (p) => p.spaceId === spaceId && p.status === 'Active'
    );
    const assigner = active.find((p) => p.displayName === createdBy || p.participantId === createdBy);
    if (!assigner) throw new Error(`Request creator '${createdBy}' is not an active participant`);
    if (assignee) {
      const t = active.find((p) => p.displayName === assignee || p.participantId === assignee);
      if (!t) throw new Error(`Assignee '${assignee}' is not an active participant`);
      assignee = t.participantId;
    }
    const now = new Date().toISOString();
    const request = {
      requestId: `req-${String(this._nextRequestSeq++).padStart(4, '0')}`,
      spaceId,
      createdBy: assigner.participantId,
      assignee,
      title: title.trim(),
      instructions: instructions || '',
      context: context || null,
      status: assignee ? 'Assigned' : 'Open',
      workId: null,
      result: null,
      payment: null,
      createdAt: now,
      completedAt: null,
    };
    this.requests.set(request.requestId, request);
    this.activity.get(spaceId).push({
      type: 'REQUEST_CREATED',
      requestId: request.requestId,
      title: request.title,
      createdBy: request.createdBy,
      assignee: request.assignee,
      status: request.status,
      timestamp: now,
    });
    return request;
  }

  _getRequestOrThrow(spaceId, requestId) {
    const r = this.requests.get(requestId);
    if (!r || r.spaceId !== spaceId) {
      throw new Error(`Request '${requestId}' not found in Space '${spaceId}'`);
    }
    return r;
  }

  _requestParticipant(requestId, name) {
    const active = [...this.participants.values()].filter(
      (p) => p.spaceId === this.requests.get(requestId).spaceId && p.status === 'Active'
    );
    const match = active.find((p) => p.displayName === name || p.participantId === name);
    if (!match) throw new Error(`'${name}' is not an active participant`);
    return match;
  }

  listRequests({ spaceId, status = null, assignee = null, createdBy = null }) {
    let list = [...this.requests.values()].filter((r) => r.spaceId === spaceId);
    if (status) list = list.filter((r) => r.status === status);
    if (assignee) list = list.filter((r) => r.assignee === assignee);
    if (createdBy) list = list.filter((r) => r.createdBy === createdBy);
    return list;
  }

  getRequest({ spaceId, requestId }) {
    return { ...this._getRequestOrThrow(spaceId, requestId) };
  }

  acceptRequest({ spaceId, requestId, actorId }) {
    const request = this._getRequestOrThrow(spaceId, requestId);
    if (request.status !== 'Open') {
      throw new Error(`Request '${requestId}' is '${request.status}', only Open requests can be accepted`);
    }
    const p = this._requestParticipant(requestId, actorId);
    request.assignee = p.participantId;
    request.status = 'Assigned';
    request.acceptedAt = new Date().toISOString();
    this.activity.get(spaceId).push({
      type: 'REQUEST_ACCEPTED',
      requestId,
      acceptedBy: p.participantId,
      timestamp: request.acceptedAt,
    });
    return { ...request };
  }

  completeRequest({ spaceId, requestId, actorId, result }) {
    const request = this._getRequestOrThrow(spaceId, requestId);
    if (!['Assigned', 'InProgress'].includes(request.status)) {
      throw new Error(`Request '${requestId}' is '${request.status}', cannot complete`);
    }
    const p = this._requestParticipant(requestId, actorId);
    if (request.assignee && request.assignee !== p.participantId) {
      throw new Error(`'${actorId}' is not the assignee of '${requestId}'`);
    }
    request.status = 'Completed';
    request.result = result || null;
    request.completedAt = new Date().toISOString();
    this.activity.get(spaceId).push({
      type: 'REQUEST_COMPLETED',
      requestId,
      completedBy: p.participantId,
      hasResult: Boolean(result),
      timestamp: request.completedAt,
    });
    return { ...request };
  }

  blockRequest({ spaceId, requestId, actorId, reason }) {
    const request = this._getRequestOrThrow(spaceId, requestId);
    if (!['Open', 'Assigned', 'InProgress'].includes(request.status)) {
      throw new Error(`Request '${requestId}' is '${request.status}', cannot block`);
    }
    this._requestParticipant(requestId, actorId);
    request.status = 'Blocked';
    request.blockedReason = reason || null;
    request.blockedAt = new Date().toISOString();
    this.activity.get(spaceId).push({
      type: 'REQUEST_BLOCKED',
      requestId,
      reason: request.blockedReason,
      timestamp: request.blockedAt,
    });
    return { ...request };
  }

  cancelRequest({ spaceId, requestId, actorId, reason }) {
    const request = this._getRequestOrThrow(spaceId, requestId);
    if (request.status === 'Completed') {
      throw new Error(`Request '${requestId}' is already Completed and cannot be cancelled`);
    }
    if (request.status === 'Cancelled') {
      throw new Error(`Request '${requestId}' is already Cancelled`);
    }
    this._requestParticipant(requestId, actorId);
    request.status = 'Cancelled';
    request.cancelledReason = reason || null;
    request.cancelledAt = new Date().toISOString();
    this.activity.get(spaceId).push({
      type: 'REQUEST_CANCELLED',
      requestId,
      reason: request.cancelledReason,
      timestamp: request.cancelledAt,
    });
    return { ...request };
  }

  // ---------------------------------------------------------------------------
  // Participants: Space members as first-class participants (rebaseline §6)
  //

  addParticipant({ spaceId, kind, displayName, address = null, externalRef = null, actorId = null }) {
    const space = this.spaces.get(spaceId);
    if (!space) throw new Error(`Space '${spaceId}' not found`);
    const KINDS = ['Human', 'Agent', 'Service', 'Organization', 'Counterparty'];
    if (!KINDS.includes(kind)) {
      throw new Error(`Invalid participant kind '${kind}'. Allowed: ${KINDS.join(', ')}`);
    }
    if (!displayName || typeof displayName !== 'string' || !displayName.trim()) {
      throw new Error("'displayName' must be a non-empty string");
    }
    const active = [...this.participants.values()].filter(
      (p) => p.spaceId === spaceId && p.status === 'Active'
    );
    const sameName = active.find(
      (p) => p.displayName.trim().toLowerCase() === displayName.trim().toLowerCase()
    );
    if (sameName) throw new Error(`Participant '${displayName}' already active in Space '${spaceId}'`);

    const now = new Date().toISOString();
    const participant = {
      participantId: `part-${String(this._nextParticipantSeq++).padStart(4, '0')}`,
      spaceId,
      displayName: displayName.trim(),
      kind,
      role: kind === 'Human' ? 'member' : kind === 'Agent' ? 'agent' : 'service',
      address: address || null,
      externalRef: externalRef || null,
      status: 'Active',
      addedBy: actorId || 'admin-01',
      joinedAt: now,
    };
    this.participants.set(participant.participantId, participant);
    (space.members || []).push({ id: participant.displayName, name: participant.displayName, role: participant.role, address: participant.address || null });
    this.activity.get(spaceId).push({
      type: 'PARTICIPANT_ADDED',
      participantId: participant.participantId,
      displayName: participant.displayName,
      kind,
      addedBy: participant.addedBy,
      timestamp: now,
    });
    return participant;
  }

  listParticipants({ spaceId, kind = null, status = null }) {
    let list = [...this.participants.values()].filter((p) => p.spaceId === spaceId);
    if (kind) list = list.filter((p) => p.kind === kind);
    if (status) list = list.filter((p) => p.status === status);
    return list;
  }

  getParticipant({ spaceId, participantId }) {
    const p = this.participants.get(participantId);
    if (!p || p.spaceId !== spaceId) {
      throw new Error(`Participant '${participantId}' not found in Space '${spaceId}'`);
    }
    return p;
  }

  deactivateParticipant({ spaceId, participantId, actorId = null }) {
    const p = this.participants.get(participantId);
    if (!p || p.spaceId !== spaceId) {
      throw new Error(`Participant '${participantId}' not found in Space '${spaceId}'`);
    }
    if (p.status === 'Inactive') throw new Error(`Participant '${participantId}' is already Inactive`);
    p.status = 'Inactive';
    p.deactivatedBy = actorId || 'admin-01';
    p.deactivatedAt = new Date().toISOString();
    this.activity.get(spaceId).push({
      type: 'PARTICIPANT_REMOVED',
      participantId,
      displayName: p.displayName,
      removedBy: p.deactivatedBy,
      timestamp: p.deactivatedAt,
    });
    return p;
  }

  // ---------------------------------------------------------------------------
  // Funding: capitalize a Space treasury (admin-only)
  //

  fundSpace({ spaceId, amount, actorId }) {
    const space = this._getSpaceOrThrow(spaceId);
    let amountBase;
    try {
      amountBase = toBaseUnits(amount);
    } catch {
      throw new Error(`Invalid amount '${amount}': must be a USDC decimal string`);
    }
    if (amountBase <= 0n) throw new Error("Invalid amount: must be greater than zero");
    const member = (space.members || []).find((m) => m.id === actorId || m.name === actorId);
    if (!member || member.role !== 'admin') {
      throw new Error(`'${actorId}' is not an admin of Space '${spaceId}'`);
    }
    const now = new Date().toISOString();
    space.balance = fromBaseUnits(toBaseUnits(space.balance) + amountBase);
    this.activity.get(spaceId).push({
      type: 'SPACE_FUNDED',
      spaceId,
      amount: fromBaseUnits(amountBase),
      fundedBy: actorId,
      spaceBalance: space.balance,
      timestamp: now,
    });
    return { ...space };
  }
}
