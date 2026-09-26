import crypto from 'node:crypto';
import { evaluateSpacePayment, governanceApprovalTypedData, governancePaymentDigest, governancePolicyHash, toBaseUnits, fromBaseUnits, validateGovernanceApproval, validateGovernanceConfig, createCapabilityManifest, authorityDelegationDigest, authorityDelegationTypedData, normalizeAuthorityDelegation, verifyAuthorityDelegationSignature, validateAuthorityDelegation, authoritySubsetProof } from '../../packages/policy-engine/src/index.js';
import { validateX402PaymentIntent as validateX402PaymentIntentPure, normalizeX402Expiry, newX402Nonce, verifyX402IntentSignature, x402IntentDigest, x402IntentTypedData } from './x402.js';

/**
 * In-memory Space store providing state continuity across MCP and API calls.
 */
/**
 * EVM addresses are case-insensitive; checksum casing is a display convention.
 * Conflict detection compared a lowercased incoming address against a stored
 * checksummed value and aborted the whole sync, which only live chain logs
 * revealed because fixtures were already lowercase.
 */
function sameAddress(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return a === b;
  return a.toLowerCase() === b.toLowerCase();
}

/**
 * A terms event (ProviderSet, BudgetSet, AdjudicatorSet, RubricSet,
 * EvidenceAttached) that names a job which is no longer Open.
 *
 * These are legal on chain and routinely land after the job already reached a
 * terminal state, so they describe a fact about history rather than a corrupt
 * projection. The store refuses to mutate the job, which is the invariant that
 * matters, but it flags the refusal so the indexer can record the event as
 * inapplicable and keep advancing. Lifecycle transition errors ("cannot
 * transition indexed job") are deliberately NOT this type: a job completing out
 * of order is a real integrity failure and must still abort the sync.
 */
export class IndexedTermsNotApplicableError extends Error {
  constructor({ eventName, onchainKey, fromStatus }) {
    super(`${eventName} cannot update indexed job '${onchainKey}' from '${fromStatus}'`);
    this.name = 'IndexedTermsNotApplicableError';
    this.eventName = eventName;
    this.onchainKey = onchainKey;
    this.fromStatus = fromStatus;
    this.inapplicableTermsEvent = true;
  }
}

export class SpaceStore {
  constructor({ settlement = null, x402Settlement = null, x402SettlementAdapter = null, x402Facilitator = null, seed = true } = {}) {
    this.settlement = settlement;
    this.x402Settlement = x402Settlement;
    this.x402SettlementAdapter = x402SettlementAdapter;
    this.x402Facilitator = x402Facilitator;
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
    /** @type {Map<string, object>} Space invitations keyed by invite code */
    this.invitations = new Map();
    this.governanceRequests = new Map();
    this.governanceExecutionClaims = new Set();
    this.x402Intents = new Map();
    this.x402ExecutionClaims = new Set();
    this.delegations = new Map();
    this.delegationNonces = new Map();
    this.indexerCursors = new Map();
    this.indexerReconciliations = new Map();
    this.indexerReorgSnapshots = new Map();
    this._nextJobSeq = 1;
    this._nextParticipantSeq = 1;
    this._nextRequestSeq = 1;
    this._nextInviteSeq = 1;
    this._nextGovernanceRequestSeq = 1;
    this._nextX402IntentSeq = 1;
    if (seed) this.seedProcurementSpace();
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
      if (!actorId || (space.members || []).some((m) => m.id === actorId || m.name === actorId || String(m.address || '').toLowerCase() === String(actorId).toLowerCase())) {
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
    const member = (space.members || []).find((m) => m.id === actorId || m.name === actorId || String(m.address || '').toLowerCase() === String(actorId).toLowerCase());
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

  getCapabilityManifest(spaceId) {
    return createCapabilityManifest(this._getSpaceOrThrow(spaceId));
  }

  async validateX402PaymentIntent(args) {
    const space = this._getSpaceOrThrow(args.spaceId);
    return validateX402PaymentIntentPure({ ...args, space });
  }

  _x402RequesterOrThrow(space, sessionAddress) {
    const address = String(sessionAddress || '').toLowerCase();
    if (!/^0x[0-9a-fA-F]{40}$/.test(address)) throw new Error('Authenticated x402 session address is required');
    const member = (space.members || []).find((item) => String(item.address || '').toLowerCase() === address);
    if (!member) throw new Error(`Authenticated address '${address}' is not a member of Space '${space.id}'`);
    return { address, memberId: member.id };
  }

  _x402IntentOrThrow(spaceId, intentId) {
    const intent = this.x402Intents.get(intentId);
    if (!intent || intent.spaceId !== spaceId) throw new Error(`x402 intent '${intentId}' not found in Space '${spaceId}'`);
    return intent;
  }

  _assertX402Binding(intent, binding = {}) {
    if (binding.digest && String(binding.digest).toLowerCase() !== intent.digest.toLowerCase()) throw new Error('x402 intent digest does not match the immutable intent');
    if (binding.asset && String(binding.asset).toLowerCase() !== intent.asset.toLowerCase()) throw new Error(`x402 intent asset mismatch: expected ${intent.asset}`);
    if (binding.network && binding.network !== intent.network) throw new Error(`x402 intent network mismatch: expected ${intent.network}`);
    if (binding.chainId !== undefined && Number(binding.chainId) !== intent.chainId) throw new Error(`x402 intent chain mismatch: expected ${intent.chainId}`);
  }

  async createX402Intent(args) {
    const space = this._getSpaceOrThrow(args.spaceId);
    const requester = this._x402RequesterOrThrow(space, args.sessionAddress);
    const validation = await validateX402PaymentIntentPure({ ...args, space, actorId: requester.memberId });
    if (!validation.valid) return { status: 'REJECTED', intent: null, validation };
    const selectedAccept = validation.selectedAccept;
    const expiresInSeconds = args.expiresInSeconds ?? args.maxTimeoutSeconds;
    if (expiresInSeconds !== undefined && (!Number.isInteger(Number(expiresInSeconds)) || Number(expiresInSeconds) < 1 || Number(expiresInSeconds) > selectedAccept.maxTimeoutSeconds)) {
      throw new Error('x402 intent expiresInSeconds must be between 1 and selected maxTimeoutSeconds');
    }
    const expiryMs = normalizeX402Expiry(
      args.expiry ?? args.expiresAt ?? (expiresInSeconds === undefined ? undefined : new Date(Date.now() + Number(expiresInSeconds) * 1000).toISOString()),
      selectedAccept.maxTimeoutSeconds,
    );
    const now = new Date().toISOString();
    const intentId = `x402-${String(this._nextX402IntentSeq++).padStart(4, '0')}-${crypto.randomUUID().slice(0, 8)}`;
    const intent = {
      intentId,
      spaceId: space.id,
      requester: requester.address,
      requesterAddress: requester.address,
      requesterMemberId: requester.memberId,
      resourceUrl: validation.validation?.resource?.url || args.paymentRequired?.resource?.url,
      selectedAccept: Object.freeze({
        scheme: selectedAccept.scheme,
        network: selectedAccept.network,
        amount: selectedAccept.amount,
        amountDecimal: selectedAccept.amountDecimal,
        asset: String(selectedAccept.asset).toLowerCase(),
        payTo: String(selectedAccept.payTo).toLowerCase(),
        maxTimeoutSeconds: selectedAccept.maxTimeoutSeconds,
      }),
      amount: selectedAccept.amount,
      amountDecimal: selectedAccept.amountDecimal,
      asset: String(selectedAccept.asset).toLowerCase(),
      payTo: String(selectedAccept.payTo).toLowerCase(),
      network: selectedAccept.network,
      chainId: space.chainId,
      expiry: new Date(expiryMs).toISOString(),
      expiryMs,
      nonce: newX402Nonce(),
      requesterIdentity: { address: requester.address, memberId: requester.memberId },
      selectedAcceptIndex: args.selectedAcceptIndex,
      resource: Object.freeze({ url: args.paymentRequired.resource.url }),
      status: 'PENDING',
      signature: null,
      digest: null,
      receipt: null,
      createdAt: now,
      signedAt: null,
      settledAt: null,
      sourceActivity: { type: 'X402_INTENT_CREATED', intentId, spaceId: space.id, timestamp: now },
    };
    intent.resourceUrl = intent.resourceUrl || args.paymentRequired.resource.url;
    intent.digest = x402IntentDigest(intent);
    intent.typedData = x402IntentTypedData(intent);
    this.x402Intents.set(intentId, intent);
    this.activity.get(space.id).push({ ...intent.sourceActivity, requester: requester.address, amount: intent.amount, asset: intent.asset, payTo: intent.payTo, network: intent.network, expiry: intent.expiry, digest: intent.digest });
    return { status: 'PENDING', intent: structuredClone(intent), typedData: structuredClone(intent.typedData) };
  }

  getX402Intent({ spaceId, intentId, sessionAddress }) {
    const space = this._getSpaceOrThrow(spaceId);
    const requester = this._x402RequesterOrThrow(space, sessionAddress);
    const intent = this._x402IntentOrThrow(spaceId, intentId);
    if (intent.requester !== requester.address) throw new Error('x402 intent is bound to a different authenticated session');
    return structuredClone(intent);
  }

  async signX402Intent({ spaceId, intentId, sessionAddress, signature, digest }) {
    const space = this._getSpaceOrThrow(spaceId);
    const requester = this._x402RequesterOrThrow(space, sessionAddress);
    const intent = this._x402IntentOrThrow(spaceId, intentId);
    if (intent.requester !== requester.address) throw new Error('x402 intent is bound to a different authenticated session');
    if (intent.status === 'SIGNED') throw new Error(`x402 intent '${intentId}' is already signed`);
    if (intent.status === 'SETTLED') throw new Error(`x402 intent '${intentId}' is already settled`);
    if (intent.status === 'REJECTED') throw new Error(`x402 intent '${intentId}' is rejected`);
    if (Date.parse(intent.expiry) <= Date.now()) throw new Error(`x402 intent '${intentId}' has expired`);
    const verification = await verifyX402IntentSignature(intent, signature, { address: requester.address, digest });
    intent.signature = signature;
    intent.signedBy = requester.address;
    intent.digest = verification.digest;
    intent.status = 'SIGNED';
    intent.signedAt = new Date().toISOString();
    this.activity.get(spaceId).push({ type: 'X402_INTENT_SIGNED', spaceId, intentId, signer: requester.address, digest: intent.digest, timestamp: intent.signedAt });
    return structuredClone(intent);
  }

  _x402AdapterOrNull() {
    return this.x402Settlement || this.x402SettlementAdapter || this.x402Facilitator || null;
  }

  _assertX402AdapterCompatible(intent, adapter) {
    if (!adapter) return false;
    const configuredAsset = adapter.assetAddress || adapter.asset || adapter.expectedAssetAddress;
    const configuredChain = adapter.chainId ?? adapter.networkChainId;
    const configuredNetwork = adapter.network;
    if (configuredAsset && String(configuredAsset).toLowerCase() !== intent.asset.toLowerCase()) return false;
    if (configuredChain !== undefined && Number(configuredChain) !== intent.chainId) return false;
    if (configuredNetwork && configuredNetwork !== intent.network) return false;
    if (typeof adapter.supports === 'function' && !adapter.supports(intent)) return false;
    return true;
  }

  _assertX402Receipt(result) {
    if (!result || typeof result !== 'object' || result.simulated === true || result.receipt?.simulated === true) throw new Error('x402 settlement adapter did not return a real receipt');
    const receipt = result.receipt || result.txReceipt || null;
    const txHash = result.txHash || receipt?.transactionHash || receipt?.txHash;
    if (!/^0x[0-9a-fA-F]{64}$/.test(String(txHash || ''))) throw new Error('x402 settlement adapter did not return a valid transaction hash');
    if (receipt && receipt.status !== undefined && !['0x1', '1', 1, true].includes(receipt.status)) throw new Error('x402 settlement adapter returned an unsuccessful receipt');
    return { ...result, txHash, receipt };
  }

  async settleX402Intent({ spaceId, intentId, sessionAddress, digest, asset, network, chainId }) {
    const space = this._getSpaceOrThrow(spaceId);
    const requester = this._x402RequesterOrThrow(space, sessionAddress);
    const intent = this._x402IntentOrThrow(spaceId, intentId);
    if (intent.requester !== requester.address) throw new Error('x402 intent is bound to a different authenticated session');
    this._assertX402Binding(intent, { digest, asset, network, chainId });
    const adapter = this._x402AdapterOrNull();
    if (!adapter || !this._assertX402AdapterCompatible(intent, adapter)) {
      const error = new Error('UNSUPPORTED_SETTLEMENT: no compatible EIP-3009 asset/facilitator adapter is configured');
      error.httpStatus = 501;
      error.httpCode = 'UNSUPPORTED_SETTLEMENT';
      throw error;
    }
    if (Date.parse(intent.expiry) <= Date.now()) throw new Error(`x402 intent '${intentId}' has expired`);
    if (intent.status === 'SETTLED') throw new Error(`x402 intent '${intentId}' is already settled`);
    if (intent.status !== 'SIGNED') throw new Error(`x402 intent '${intentId}' must be signed before settlement`);
    const claim = `${spaceId}:${intentId}`;
    if (this.x402ExecutionClaims.has(claim)) throw new Error(`x402 intent '${intentId}' is already executing`);
    this.x402ExecutionClaims.add(claim);
    try {
      const settle = typeof adapter === 'function' ? adapter : adapter.settle || adapter.facilitate;
      if (typeof settle !== 'function') {
        const error = new Error('UNSUPPORTED_SETTLEMENT: configured adapter has no settle method');
        error.httpStatus = 501;
        error.httpCode = 'UNSUPPORTED_SETTLEMENT';
        throw error;
      }
      const result = await settle.call(adapter, { intent: structuredClone(intent), signature: intent.signature, digest: intent.digest });
      const settlement = this._assertX402Receipt(result);
      intent.receipt = structuredClone(settlement);
      intent.txHash = settlement.txHash;
      intent.status = 'SETTLED';
      intent.settledAt = new Date().toISOString();
      this.activity.get(spaceId).push({ type: 'X402_INTENT_SETTLED', spaceId, intentId, txHash: intent.txHash, digest: intent.digest, timestamp: intent.settledAt });
      return structuredClone(intent);
    } finally {
      this.x402ExecutionClaims.delete(claim);
    }
  }

  /**
   * REAL onchain settlement via XLayerAdapter. Throws loudly on any failure
   * (no key, no RPC, address mismatch, chain mismatch, revert) — callers
   * must only mutate Space state after this resolves. There is no
   * simulated fallback anywhere in this file.
   */
  async _liveSettle(args) {
    if (this.settlement) return this.settlement(args);
    const { XLayerAdapter } = await import('./xlayer.js');
    const { space, jobIdLabel, provider, evaluatorId, evaluatorAddr, description, budget, deliverableHash } = args;
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

  async _settleApprovedPayment({ space, actionId, actorId, recipient, amount, memo, evaluation, evaluatorAddr, receiptMetadata = {}, timestamp = new Date().toISOString() }) {
    let live;
    try {
      live = await this._liveSettle({
        space,
        jobIdLabel: actionId,
        provider: recipient,
        evaluatorId: actorId,
        evaluatorAddr,
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
      spaceId: space.id,
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
      ...receiptMetadata,
    };
    this.receipts.set(receipt.receiptId, receipt);
    this.activity.get(space.id).push({ type: 'PAYMENT_SETTLED', ...receipt });
    return { status: 'SETTLED', receipt, spaceBalance: space.balance };
  }

  async requestPayment({ spaceId, actorId, recipient, amount, memo }) {
    const space = this.spaces.get(spaceId);
    if (!space) throw new Error(`Space '${spaceId}' not found`);
    const actionId = `act-${crypto.randomUUID().slice(0, 8)}`;
    const evaluation = evaluateSpacePayment(space, { actionId, actorId, recipient, amount, memo });
    const timestamp = new Date().toISOString();
    if (!evaluation.allowed) {
      const record = { type: 'PAYMENT_DENIED', actionId, actorId, recipient, amount, reasons: evaluation.reasons, denialProof: evaluation.denialProof, timestamp };
      this.activity.get(spaceId).push(record);
      return { status: 'REJECTED', actionId, reasons: evaluation.reasons, denialProof: evaluation.denialProof, spaceBalance: space.balance };
    }
    const memberAddr = (space.members || []).find((mb) => mb.id === actorId)?.address;
    return this._settleApprovedPayment({ space, actionId, actorId, recipient, amount, memo, evaluation, evaluatorAddr: memberAddr, timestamp });
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

  bindMemberAddress(spaceId, memberId, address) {
    const space = this._getSpaceOrThrow(spaceId);
    if (!/^0x[0-9a-fA-F]{40}$/.test(String(address || ''))) throw new Error('A valid EVM address is required');
    const normalized = String(address).toLowerCase();
    const member = (space.members || []).find((item) => item.id === memberId || item.name === memberId || String(item.address || '').toLowerCase() === normalized);
    if (!member) throw new Error(`Member '${memberId}' is not in Space '${spaceId}'`);
    member.address = normalized;
    const participant = [...this.participants.values()].find((item) => item.spaceId === spaceId && item.displayName === member.name && !item.address);
    if (participant) participant.address = normalized;
    return member;
  }

  createInvitation({ spaceId, inviterId, address, role = 'member', displayName }) {
    const space = this._getSpaceOrThrow(spaceId);
    if (address && !/^0x[0-9a-fA-F]{40}$/.test(String(address))) throw new Error('Invitation target requires a valid EVM address');
    const normalized = address ? String(address).toLowerCase() : null;
    if (!['member', 'agent', 'service', 'admin'].includes(role)) throw new Error(`Invalid invitation role '${role}'`);
    const inviter = (space.members || []).find((item) => item.id === inviterId || item.name === inviterId || String(item.address || '').toLowerCase() === String(inviterId).toLowerCase());
    if (!inviter || inviter.role !== 'admin') throw new Error(`Only an admin can invite members to Space '${spaceId}'`);
    if (normalized && (space.members || []).some((item) => String(item.address || '').toLowerCase() === normalized)) throw new Error(`Address '${normalized}' already belongs to Space '${spaceId}'`);
    const code = `invite-${String(this._nextInviteSeq++).padStart(4, '0')}-${crypto.randomBytes(4).toString('hex')}`;
    const invitation = { code, spaceId, address: normalized, role, displayName: displayName || normalized || 'Invited member', inviterId, status: 'PENDING', createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 7 * 86400000).toISOString() };
    this.invitations.set(code, invitation);
    this.activity.get(spaceId).push({ type: 'INVITATION_CREATED', spaceId, code, address: normalized, role, inviterId, expiresAt: invitation.expiresAt, timestamp: invitation.createdAt });
    return { ...invitation };
  }

  redeemInvitation({ code, address }) {
    if (!/^0x[0-9a-fA-F]{40}$/.test(String(address || ''))) throw new Error('A valid EVM address is required');
    const normalized = String(address).toLowerCase();
    const invitation = this.invitations.get(String(code || ''));
    if (!invitation) throw new Error('Invitation not found');
    if (invitation.status !== 'PENDING') throw new Error(`Invitation is already ${invitation.status.toLowerCase()}`);
    if (Date.parse(invitation.expiresAt) < Date.now()) throw new Error('Invitation has expired');
    if (invitation.address && invitation.address !== normalized) throw new Error('Invitation is bound to a different wallet address');
    const space = this._getSpaceOrThrow(invitation.spaceId);
    const existing = (space.members || []).find((member) => String(member.address || '').toLowerCase() === normalized);
    if (!existing) {
      const member = { id: normalized, name: invitation.displayName, role: invitation.role, address: normalized };
      (space.members || []).push(member);
      this.participants.set(`part-${String(this._nextParticipantSeq++).padStart(4, '0')}`, { participantId: `part-${String(this._nextParticipantSeq - 1).padStart(4, '0')}`, spaceId: space.id, displayName: member.name, kind: invitation.role === 'agent' ? 'Agent' : invitation.role === 'service' ? 'Service' : 'Human', role: invitation.role, address: normalized, externalRef: null, status: 'Active', addedBy: invitation.inviterId, joinedAt: new Date().toISOString() });
    }
    if (!invitation.address) invitation.address = normalized;
    invitation.status = 'REDEEMED';
    invitation.redeemedBy = normalized;
    invitation.redeemedAt = new Date().toISOString();
    this.activity.get(space.id).push({ type: 'INVITATION_REDEEMED', spaceId: space.id, code: invitation.code, address: normalized, memberId: existing?.id || normalized, timestamp: invitation.redeemedAt });
    return { space: { ...space }, invitation: { ...invitation } };
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

  upsertIndexedJob({ spaceId, chainId, contractAddress, onchainJobId, client, provider, evaluator, description, expiredAt, blockNumber, txHash, logIndex }) {
    this._getSpaceOrThrow(spaceId);
    const contract = String(contractAddress).toLowerCase();
    const chain = Number(chainId);
    const externalId = String(onchainJobId);
    const onchainKey = `${chain}:${contract}:${externalId}`;
    const existing = [...this.jobs.values()].find((job) => job.onchainKey === onchainKey);
    if (existing) return { job: { ...existing }, created: false };

    const now = new Date().toISOString();
    const deadlineMs = Number(expiredAt) * 1000;
    const jobId = `onchain-${chain}-${contract.slice(2, 10)}-${externalId}`;
    const job = {
      jobId,
      spaceId,
      client,
      provider,
      evaluator,
      onchainJobId: externalId,
      onchainKey,
      chainId: chain,
      contractAddress: contract,
      description,
      budget: '0.000000',
      escrowedAmount: '0.000000',
      status: 'Open',
      statusHistory: [{ status: 'Open', timestamp: now }],
      deliverableHash: null,
      evidenceUri: null,
      evidenceAttached: null,
      feedback: null,
      deadline: new Date(deadlineMs).toISOString(),
      deadlineMs,
      createdAt: now,
      fundedAt: null,
      submittedAt: null,
      completedAt: null,
      completionReason: null,
      rejectedAt: null,
      rejectedBy: null,
      rejectionReason: null,
      expiredAt: null,
      refunded: false,
      refundedAmount: null,
      refundClient: null,
      refundSourceLog: null,
      attestedSettlement: null,
      settlement: null,
      actionId: null,
      authHash: null,
      adjudicator: null,
      rubricHash: null,
      adjudication: null,
      source: 'onchain',
      sourceLog: { blockNumber: Number(blockNumber), txHash, logIndex: Number(logIndex) },
    };
    this.jobs.set(jobId, job);
    const entries = this.activity.get(spaceId) || [];
    if (!entries.some((entry) => entry.onchainKey === onchainKey)) {
      entries.push({
        type: 'WORK_CREATED',
        jobId,
        spaceId,
        source: 'onchain',
        onchainJobId: externalId,
        onchainKey,
        chainId: chain,
        contractAddress: contract,
        client,
        provider,
        evaluator,
        description,
        status: 'Open',
        fromStatus: null,
        toStatus: 'Open',
        blockNumber: Number(blockNumber),
        txHash,
        logIndex: Number(logIndex),
        timestamp: now,
      });
      this.activity.set(spaceId, entries);
    }
    return { job: { ...job }, created: true };
  }

  setProviderIndexedJob({ spaceId, chainId, contractAddress, onchainJobId, provider, blockNumber, txHash, logIndex }) {
    const indexed = this._getIndexedJobForEvent({ spaceId, chainId, contractAddress, onchainJobId, eventName: 'ProviderSet' });
    const { job, contract, chain, externalId, onchainKey } = indexed;
    if (typeof provider !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(provider)) throw new Error('ProviderSet requires a valid provider address');
    const normalizedProvider = provider.toLowerCase();
    if (normalizedProvider === '0x0000000000000000000000000000000000000000') throw new Error('ProviderSet requires a non-zero provider address');
    const sourceLog = this._indexedSourceLog({ blockNumber, txHash, logIndex });
    if (job.status === 'Open' && this._sameIndexedSourceLog(job.sourceLog, sourceLog) && sameAddress(job.provider, normalizedProvider)) {
      return { job: { ...job }, providerSet: false };
    }
    if (job.status !== 'Open') throw new IndexedTermsNotApplicableError({ eventName: 'ProviderSet', onchainKey, fromStatus: job.status });
    if (job.provider && !sameAddress(job.provider, '0x0000000000000000000000000000000000000000')) throw new Error(`ProviderSet conflicts with indexed job provider '${job.provider}'`);

    const timestamp = new Date().toISOString();
    job.provider = normalizedProvider;
    job.sourceLog = sourceLog;
    const entries = this.activity.get(spaceId) || [];
    entries.push(this._indexedActivity({
      spaceId,
      job,
      contract,
      chain,
      externalId,
      onchainKey,
      sourceLog,
      timestamp,
      type: 'WORK_PROVIDER_SET',
      fromStatus: 'Open',
      toStatus: 'Open',
      provider: normalizedProvider,
    }));
    this.activity.set(spaceId, entries);
    return { job: { ...job }, providerSet: true };
  }

  setBudgetIndexedJob({ spaceId, chainId, contractAddress, onchainJobId, amount, blockNumber, txHash, logIndex }) {
    const indexed = this._getIndexedJobForEvent({ spaceId, chainId, contractAddress, onchainJobId, eventName: 'BudgetSet' });
    const { job, contract, chain, externalId, onchainKey } = indexed;
    if (typeof amount !== 'bigint' || amount < 0n) throw new Error('BudgetSet requires a uint256 amount');
    const budget = fromBaseUnits(amount);
    const sourceLog = this._indexedSourceLog({ blockNumber, txHash, logIndex });
    if (job.status === 'Open' && this._sameIndexedSourceLog(job.sourceLog, sourceLog) && job.budget === budget) {
      return { job: { ...job }, budgetSet: false };
    }
    if (job.status === 'Open' && this._sameIndexedSourceLog(job.sourceLog, sourceLog)) throw new Error(`BudgetSet conflicts with indexed job budget '${job.budget}'`);
    if (job.status !== 'Open') throw new IndexedTermsNotApplicableError({ eventName: 'BudgetSet', onchainKey, fromStatus: job.status });

    const timestamp = new Date().toISOString();
    job.budget = budget;
    job.sourceLog = sourceLog;
    const entries = this.activity.get(spaceId) || [];
    entries.push(this._indexedActivity({
      spaceId,
      job,
      contract,
      chain,
      externalId,
      onchainKey,
      sourceLog,
      timestamp,
      type: 'WORK_BUDGET_SET',
      fromStatus: 'Open',
      toStatus: 'Open',
      amount: budget,
    }));
    this.activity.set(spaceId, entries);
    return { job: { ...job }, budgetSet: true };
  }

  setAdjudicatorIndexedJob({ spaceId, chainId, contractAddress, onchainJobId, adjudicator, blockNumber, txHash, logIndex }) {
    const indexed = this._getIndexedJobForEvent({ spaceId, chainId, contractAddress, onchainJobId, eventName: 'AdjudicatorSet' });
    const { job, contract, chain, externalId, onchainKey } = indexed;
    if (typeof adjudicator !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(adjudicator)) throw new Error('AdjudicatorSet requires a valid adjudicator address');
    const normalizedAdjudicator = adjudicator.toLowerCase();
    if (normalizedAdjudicator === '0x0000000000000000000000000000000000000000') throw new Error('AdjudicatorSet requires a non-zero adjudicator address');
    const sourceLog = this._indexedSourceLog({ blockNumber, txHash, logIndex });
    if (job.status === 'Open' && this._sameIndexedSourceLog(job.sourceLog, sourceLog) && job.adjudicator === normalizedAdjudicator) {
      return { job: { ...job }, adjudicatorSet: false };
    }
    if (job.status !== 'Open') throw new IndexedTermsNotApplicableError({ eventName: 'AdjudicatorSet', onchainKey, fromStatus: job.status });
    if (job.adjudicator && !sameAddress(job.adjudicator, normalizedAdjudicator)) throw new Error(`AdjudicatorSet conflicts with indexed job adjudicator '${job.adjudicator}'`);

    const timestamp = new Date().toISOString();
    job.adjudicator = normalizedAdjudicator;
    job.sourceLog = sourceLog;
    const entries = this.activity.get(spaceId) || [];
    entries.push(this._indexedActivity({
      spaceId,
      job,
      contract,
      chain,
      externalId,
      onchainKey,
      sourceLog,
      timestamp,
      type: 'WORK_ADJUDICATOR_SET',
      fromStatus: 'Open',
      toStatus: 'Open',
      adjudicator: normalizedAdjudicator,
    }));
    this.activity.set(spaceId, entries);
    return { job: { ...job }, adjudicatorSet: true };
  }

  setRubricIndexedJob({ spaceId, chainId, contractAddress, onchainJobId, rubricHash, blockNumber, txHash, logIndex }) {
    const indexed = this._getIndexedJobForEvent({ spaceId, chainId, contractAddress, onchainJobId, eventName: 'RubricSet' });
    const { job, contract, chain, externalId, onchainKey } = indexed;
    if (typeof rubricHash !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(rubricHash)) throw new Error('RubricSet requires a bytes32 rubric hash');
    const normalizedRubricHash = rubricHash.toLowerCase();
    if (normalizedRubricHash === `0x${'0'.repeat(64)}`) throw new Error('RubricSet requires a non-zero rubric hash');
    const sourceLog = this._indexedSourceLog({ blockNumber, txHash, logIndex });
    if (job.status === 'Open' && this._sameIndexedSourceLog(job.sourceLog, sourceLog) && job.rubricHash === normalizedRubricHash) {
      return { job: { ...job }, rubricSet: false };
    }
    if (job.status !== 'Open') throw new IndexedTermsNotApplicableError({ eventName: 'RubricSet', onchainKey, fromStatus: job.status });
    if (job.rubricHash && job.rubricHash !== normalizedRubricHash) throw new Error(`RubricSet conflicts with indexed job rubric '${job.rubricHash}'`);

    const timestamp = new Date().toISOString();
    job.rubricHash = normalizedRubricHash;
    job.sourceLog = sourceLog;
    const entries = this.activity.get(spaceId) || [];
    entries.push(this._indexedActivity({
      spaceId,
      job,
      contract,
      chain,
      externalId,
      onchainKey,
      sourceLog,
      timestamp,
      type: 'WORK_RUBRIC_SET',
      fromStatus: 'Open',
      toStatus: 'Open',
      rubricHash: normalizedRubricHash,
    }));
    this.activity.set(spaceId, entries);
    return { job: { ...job }, rubricSet: true };
  }

  recordIndexedEvidenceAttached({ spaceId, chainId, contractAddress, onchainJobId, deliverableHash, blockNumber, txHash, logIndex }) {
    const indexed = this._getIndexedJobForEvent({ spaceId, chainId, contractAddress, onchainJobId, eventName: 'EvidenceAttached' });
    const { job, contract, chain, externalId, onchainKey } = indexed;
    if (typeof deliverableHash !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(deliverableHash)) throw new Error('EvidenceAttached requires a bytes32 deliverable hash');
    const normalizedDeliverableHash = deliverableHash.toLowerCase();
    if (job.status !== 'Funded' && job.status !== 'Submitted') throw new IndexedTermsNotApplicableError({ eventName: 'EvidenceAttached', onchainKey, fromStatus: job.status });
    if (job.status === 'Submitted' && job.deliverableHash !== normalizedDeliverableHash) throw new Error(`EvidenceAttached hash conflicts with indexed job deliverable '${job.deliverableHash}'`);
    const sourceLog = this._indexedSourceLog({ blockNumber, txHash, logIndex });
    if (job.evidenceAttached) {
      if (this._sameIndexedSourceLog(job.evidenceAttached.sourceLog, sourceLog) && job.evidenceAttached.deliverableHash === normalizedDeliverableHash) {
        return { job: { ...job }, evidenceAttached: false };
      }
      if (job.evidenceAttached.deliverableHash !== normalizedDeliverableHash) {
        throw new Error(`EvidenceAttached conflicts with recorded evidence for indexed job '${onchainKey}'`);
      }
    }

    const timestamp = new Date().toISOString();
    job.evidenceAttached = {
      deliverableHash: normalizedDeliverableHash,
      observedAt: timestamp,
      sourceLog,
    };
    job.sourceLog = sourceLog;
    const entries = this.activity.get(spaceId) || [];
    entries.push(this._indexedActivity({
      spaceId,
      job,
      contract,
      chain,
      externalId,
      onchainKey,
      sourceLog,
      timestamp,
      type: 'WORK_EVIDENCE_ATTACHED',
      fromStatus: job.status,
      toStatus: job.status,
      deliverableHash: normalizedDeliverableHash,
    }));
    this.activity.set(spaceId, entries);
    return { job: { ...job }, evidenceAttached: true };
  }

  fundIndexedJob({ spaceId, chainId, contractAddress, onchainJobId, amount, blockNumber, txHash, logIndex }) {
    this._getSpaceOrThrow(spaceId);
    const contract = String(contractAddress).toLowerCase();
    const chain = Number(chainId);
    const externalId = String(onchainJobId);
    const onchainKey = `${chain}:${contract}:${externalId}`;
    const job = [...this.jobs.values()].find((entry) => entry.onchainKey === onchainKey);
    if (!job) throw new Error(`JobFunded references unknown indexed job '${onchainKey}'`);
    if (job.spaceId !== spaceId) throw new Error(`Indexed job '${onchainKey}' belongs to Space '${job.spaceId}'`);
    if (typeof amount !== 'bigint' || amount <= 0n) throw new Error('JobFunded requires a positive uint256 amount');
    const budget = fromBaseUnits(amount);
    const sourceLog = { blockNumber: Number(blockNumber), txHash: String(txHash).toLowerCase(), logIndex: Number(logIndex) };
    const sameSourceLog = job.sourceLog && job.sourceLog.blockNumber === sourceLog.blockNumber && job.sourceLog.txHash === sourceLog.txHash && job.sourceLog.logIndex === sourceLog.logIndex;
    if (job.status === 'Funded' && sameSourceLog && job.budget === budget && job.escrowedAmount === budget) {
      return { job: { ...job }, funded: false };
    }
    if (job.status !== 'Open') {
      throw new Error(`JobFunded cannot transition indexed job '${onchainKey}' from '${job.status}'`);
    }

    const timestamp = new Date().toISOString();
    job.budget = budget;
    job.escrowedAmount = budget;
    job.status = 'Funded';
    job.fundedAt = timestamp;
    job.statusHistory.push({ status: 'Funded', timestamp });
    job.sourceLog = sourceLog;

    const entries = this.activity.get(spaceId) || [];
    entries.push({
      type: 'WORK_FUNDED',
      jobId: job.jobId,
      spaceId,
      source: 'onchain',
      onchainJobId: externalId,
      onchainKey,
      chainId: chain,
      contractAddress: contract,
      amount: budget,
      fromStatus: 'Open',
      toStatus: 'Funded',
      blockNumber: sourceLog.blockNumber,
      txHash: sourceLog.txHash,
      logIndex: sourceLog.logIndex,
      timestamp,
    });
    this.activity.set(spaceId, entries);
    return { job: { ...job }, funded: true };
  }

  submitIndexedJob({ spaceId, chainId, contractAddress, onchainJobId, deliverableHash, blockNumber, txHash, logIndex }) {
    this._getSpaceOrThrow(spaceId);
    const contract = String(contractAddress).toLowerCase();
    const chain = Number(chainId);
    const externalId = String(onchainJobId);
    const onchainKey = `${chain}:${contract}:${externalId}`;
    const job = [...this.jobs.values()].find((entry) => entry.onchainKey === onchainKey);
    if (!job) throw new Error(`JobSubmitted references unknown indexed job '${onchainKey}'`);
    if (job.spaceId !== spaceId) throw new Error(`Indexed job '${onchainKey}' belongs to Space '${job.spaceId}'`);
    if (typeof deliverableHash !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(deliverableHash)) throw new Error('JobSubmitted requires a bytes32 deliverable hash');
    const normalizedDeliverableHash = deliverableHash.toLowerCase();
    const sourceLog = { blockNumber: Number(blockNumber), txHash: String(txHash).toLowerCase(), logIndex: Number(logIndex) };
    const sameSourceLog = job.sourceLog && job.sourceLog.blockNumber === sourceLog.blockNumber && job.sourceLog.txHash === sourceLog.txHash && job.sourceLog.logIndex === sourceLog.logIndex;
    if (job.status === 'Submitted' && sameSourceLog && job.deliverableHash === normalizedDeliverableHash) {
      return { job: { ...job }, submitted: false };
    }
    if (job.status !== 'Funded') {
      throw new Error(`JobSubmitted cannot transition indexed job '${onchainKey}' from '${job.status}'`);
    }

    const timestamp = new Date().toISOString();
    job.deliverableHash = normalizedDeliverableHash;
    job.status = 'Submitted';
    job.submittedAt = timestamp;
    job.statusHistory.push({ status: 'Submitted', timestamp });
    job.sourceLog = sourceLog;

    const entries = this.activity.get(spaceId) || [];
    entries.push({
      type: 'WORK_SUBMITTED',
      jobId: job.jobId,
      spaceId,
      source: 'onchain',
      onchainJobId: externalId,
      onchainKey,
      chainId: chain,
      contractAddress: contract,
      deliverableHash: normalizedDeliverableHash,
      fromStatus: 'Funded',
      toStatus: 'Submitted',
      blockNumber: sourceLog.blockNumber,
      txHash: sourceLog.txHash,
      logIndex: sourceLog.logIndex,
      timestamp,
    });
    this.activity.set(spaceId, entries);
    return { job: { ...job }, submitted: true };
  }

  requestAdjudicationIndexedJob({ spaceId, chainId, contractAddress, onchainJobId, adjudicator, caseId, blockNumber, txHash, logIndex }) {
    this._getSpaceOrThrow(spaceId);
    const contract = String(contractAddress).toLowerCase();
    const chain = Number(chainId);
    const externalId = String(onchainJobId);
    const onchainKey = `${chain}:${contract}:${externalId}`;
    const job = [...this.jobs.values()].find((entry) => entry.onchainKey === onchainKey);
    if (!job) throw new Error(`AdjudicationRequested references unknown indexed job '${onchainKey}'`);
    if (job.spaceId !== spaceId) throw new Error(`Indexed job '${onchainKey}' belongs to Space '${job.spaceId}'`);
    if (typeof adjudicator !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(adjudicator)) throw new Error('AdjudicationRequested requires a valid adjudicator address');
    if (typeof caseId !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(caseId)) throw new Error('AdjudicationRequested requires a bytes32 caseId');
    const normalizedAdjudicator = adjudicator.toLowerCase();
    const normalizedCaseId = caseId.toLowerCase();
    const sourceLog = { blockNumber: Number(blockNumber), txHash: String(txHash).toLowerCase(), logIndex: Number(logIndex) };
    const sameSourceLog = job.sourceLog && job.sourceLog.blockNumber === sourceLog.blockNumber && job.sourceLog.txHash === sourceLog.txHash && job.sourceLog.logIndex === sourceLog.logIndex;
    if (job.status === 'Adjudicating' && sameSourceLog && job.adjudicator === normalizedAdjudicator && job.adjudication?.caseId === normalizedCaseId) {
      return { job: { ...job }, requested: false };
    }
    if (job.status !== 'Submitted') {
      throw new Error(`AdjudicationRequested cannot transition indexed job '${onchainKey}' from '${job.status}'`);
    }

    const timestamp = new Date().toISOString();
    job.status = 'Adjudicating';
    job.adjudicator = normalizedAdjudicator;
    job.adjudication = {
      caseId: normalizedCaseId,
      requestedAt: timestamp,
      deliverableHash: job.deliverableHash,
      evidenceUri: job.evidenceUri,
      rubricHash: job.rubricHash,
    };
    job.statusHistory.push({ status: 'Adjudicating', timestamp });
    job.sourceLog = sourceLog;

    const entries = this.activity.get(spaceId) || [];
    entries.push({
      type: 'WORK_ADJUDICATION_REQUESTED',
      jobId: job.jobId,
      spaceId,
      source: 'onchain',
      onchainJobId: externalId,
      onchainKey,
      chainId: chain,
      contractAddress: contract,
      adjudicator: normalizedAdjudicator,
      caseId: normalizedCaseId,
      deliverableHash: job.deliverableHash,
      evidenceUri: job.evidenceUri,
      rubricHash: job.rubricHash,
      fromStatus: 'Submitted',
      toStatus: 'Adjudicating',
      blockNumber: sourceLog.blockNumber,
      txHash: sourceLog.txHash,
      logIndex: sourceLog.logIndex,
      timestamp,
    });
    this.activity.set(spaceId, entries);
    return { job: { ...job }, requested: true };
  }

  /**
   * Drops indexed projections derived from logs at or after `fromBlock`.
   *
   * Replaying history from an earlier block is only sound when the projections
   * built from the logs being replayed are discarded first. A cursor rewind
   * that keeps them strands jobs in states the replayed logs can no longer
   * reach: job 5 on X Layer was projected Rejected from block 41645865 while
   * the cursor still sat at 41645475, so every restart replaying that range
   * failed with "cannot transition ... from 'Rejected'" and the historical
   * backfill could never advance past one block range.
   *
   * Returns what was removed so the caller can report it rather than silently
   * discarding derived state.
   */
  /**
   * Reports the block range the current indexed projections were built from.
   *
   * A cursor that sits behind `maxBlock` is inconsistent with its own derived
   * state: those projections were produced by logs this indexer is about to read
   * again, so replaying from the cursor collides with them. Callers use this to
   * detect the condition and rebuild instead of stalling.
   */
  indexedProjectionRange({ spaceId, chainId, contractAddress }) {
    this._getSpaceOrThrow(spaceId);
    const prefix = `${Number(chainId)}:${String(contractAddress).toLowerCase()}:`;
    let minBlock = null;
    let maxBlock = null;
    let count = 0;
    for (const job of this.jobs.values()) {
      if (typeof job?.onchainKey !== 'string' || !job.onchainKey.startsWith(prefix)) continue;
      const block = job.sourceLog?.blockNumber;
      if (!Number.isFinite(block)) continue;
      count += 1;
      if (minBlock === null || block < minBlock) minBlock = block;
      if (maxBlock === null || block > maxBlock) maxBlock = block;
    }
    return { minBlock, maxBlock, count };
  }

  pruneIndexedProjections({ spaceId, chainId, contractAddress, fromBlock }) {
    this._getSpaceOrThrow(spaceId);
    const contract = String(contractAddress).toLowerCase();
    const chain = Number(chainId);
    const floor = Number(fromBlock);
    if (!Number.isInteger(floor) || floor < 0) throw new Error(`pruneIndexedProjections requires a non-negative block, got '${fromBlock}'`);
    const prefix = `${chain}:${contract}:`;

    const dropped = new Set();
    for (const [jobId, job] of [...this.jobs.entries()]) {
      if (typeof job?.onchainKey !== 'string' || !job.onchainKey.startsWith(prefix)) continue;
      const block = job.sourceLog?.blockNumber;
      if (!Number.isFinite(block) || block < floor) continue;
      dropped.add(jobId);
    }
    for (const jobId of dropped) this.jobs.delete(jobId);

    let droppedActivity = 0;
    for (const [spaceKey, entries] of this.activity.entries()) {
      if (!Array.isArray(entries)) continue;
      const kept = entries.filter((entry) => {
        if (entry?.source !== 'onchain') return true;
        if (typeof entry.onchainKey !== 'string' || !entry.onchainKey.startsWith(prefix)) return true;
        const block = entry.blockNumber;
        if (!Number.isFinite(block) || block < floor) return true;
        droppedActivity += 1;
        return false;
      });
      this.activity.set(spaceKey, kept);
    }

    return { jobs: dropped.size, activity: droppedActivity, fromBlock: floor };
  }

  _getIndexedJobForEvent({ spaceId, chainId, contractAddress, onchainJobId, eventName }) {
    this._getSpaceOrThrow(spaceId);
    const contract = String(contractAddress).toLowerCase();
    const chain = Number(chainId);
    const externalId = String(onchainJobId);
    const onchainKey = `${chain}:${contract}:${externalId}`;
    const job = [...this.jobs.values()].find((entry) => entry.onchainKey === onchainKey);
    if (!job) throw new Error(`${eventName} references unknown indexed job '${onchainKey}'`);
    if (job.spaceId !== spaceId) throw new Error(`Indexed job '${onchainKey}' belongs to Space '${job.spaceId}'`);
    return { job, contract, chain, externalId, onchainKey };
  }

  _indexedSourceLog({ blockNumber, txHash, logIndex }) {
    return { blockNumber: Number(blockNumber), txHash: String(txHash).toLowerCase(), logIndex: Number(logIndex) };
  }

  _sameIndexedSourceLog(left, right) {
    return left?.blockNumber === right?.blockNumber && left?.txHash === right?.txHash && left?.logIndex === right?.logIndex;
  }

  _indexedActivity({ spaceId, job, contract, chain, externalId, onchainKey, sourceLog, timestamp, type, fromStatus, toStatus, ...metadata }) {
    return {
      type,
      jobId: job.jobId,
      spaceId,
      source: 'onchain',
      onchainJobId: externalId,
      onchainKey,
      chainId: chain,
      contractAddress: contract,
      ...metadata,
      fromStatus,
      toStatus,
      blockNumber: sourceLog.blockNumber,
      txHash: sourceLog.txHash,
      logIndex: sourceLog.logIndex,
      timestamp,
    };
  }

  completeIndexedJob({ spaceId, chainId, contractAddress, onchainJobId, reason, blockNumber, txHash, logIndex }) {
    const indexed = this._getIndexedJobForEvent({ spaceId, chainId, contractAddress, onchainJobId, eventName: 'JobCompleted' });
    const { job, contract, chain, externalId, onchainKey } = indexed;
    if (typeof reason !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(reason)) throw new Error('JobCompleted requires a bytes32 reason');
    const normalizedReason = reason.toLowerCase();
    const sourceLog = this._indexedSourceLog({ blockNumber, txHash, logIndex });
    if (job.status === 'Completed' && this._sameIndexedSourceLog(job.sourceLog, sourceLog) && job.completionReason === normalizedReason) {
      return { job: { ...job }, completed: false };
    }
    if (job.status !== 'Submitted' && job.status !== 'Adjudicating') {
      throw new Error(`JobCompleted cannot transition indexed job '${onchainKey}' from '${job.status}'`);
    }

    const timestamp = new Date().toISOString();
    const fromStatus = job.status;
    job.status = 'Completed';
    job.completedAt = timestamp;
    job.completionReason = normalizedReason;
    job.feedback = normalizedReason;
    job.statusHistory.push({ status: 'Completed', timestamp });
    job.sourceLog = sourceLog;

    const entries = this.activity.get(spaceId) || [];
    entries.push(this._indexedActivity({
      spaceId,
      job,
      contract,
      chain,
      externalId,
      onchainKey,
      sourceLog,
      timestamp,
      type: 'WORK_COMPLETED',
      fromStatus,
      toStatus: 'Completed',
      reason: normalizedReason,
    }));
    this.activity.set(spaceId, entries);
    return { job: { ...job }, completed: true };
  }

  rejectIndexedJob({ spaceId, chainId, contractAddress, onchainJobId, rejector, reason, blockNumber, txHash, logIndex }) {
    const indexed = this._getIndexedJobForEvent({ spaceId, chainId, contractAddress, onchainJobId, eventName: 'JobRejected' });
    const { job, contract, chain, externalId, onchainKey } = indexed;
    if (typeof rejector !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(rejector)) throw new Error('JobRejected requires a valid rejector address');
    if (typeof reason !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(reason)) throw new Error('JobRejected requires a bytes32 reason');
    const normalizedRejector = rejector.toLowerCase();
    const normalizedReason = reason.toLowerCase();
    const sourceLog = this._indexedSourceLog({ blockNumber, txHash, logIndex });
    if (job.status === 'Rejected' && this._sameIndexedSourceLog(job.sourceLog, sourceLog) && job.rejectedBy === normalizedRejector && job.rejectionReason === normalizedReason) {
      return { job: { ...job }, rejected: false };
    }
    if (job.status !== 'Open' && job.status !== 'Funded' && job.status !== 'Submitted' && job.status !== 'Adjudicating') {
      throw new Error(`JobRejected cannot transition indexed job '${onchainKey}' from '${job.status}'`);
    }

    const timestamp = new Date().toISOString();
    const fromStatus = job.status;
    job.status = 'Rejected';
    job.rejectedBy = normalizedRejector;
    job.rejectionReason = normalizedReason;
    job.feedback = normalizedReason;
    job.rejectedAt = timestamp;
    job.statusHistory.push({ status: 'Rejected', timestamp });
    job.sourceLog = sourceLog;

    const entries = this.activity.get(spaceId) || [];
    entries.push(this._indexedActivity({
      spaceId,
      job,
      contract,
      chain,
      externalId,
      onchainKey,
      sourceLog,
      timestamp,
      type: 'WORK_REJECTED',
      fromStatus,
      toStatus: 'Rejected',
      rejector: normalizedRejector,
      reason: normalizedReason,
      refundedAmount: job.refundedAmount,
    }));
    this.activity.set(spaceId, entries);
    return { job: { ...job }, rejected: true };
  }

  expireIndexedJob({ spaceId, chainId, contractAddress, onchainJobId, blockNumber, txHash, logIndex }) {
    const indexed = this._getIndexedJobForEvent({ spaceId, chainId, contractAddress, onchainJobId, eventName: 'JobExpired' });
    const { job, contract, chain, externalId, onchainKey } = indexed;
    const sourceLog = this._indexedSourceLog({ blockNumber, txHash, logIndex });
    if (job.status === 'Expired' && this._sameIndexedSourceLog(job.sourceLog, sourceLog)) {
      return { job: { ...job }, expired: false };
    }
    if (job.status !== 'Funded' && job.status !== 'Submitted' && job.status !== 'Adjudicating') {
      throw new Error(`JobExpired cannot transition indexed job '${onchainKey}' from '${job.status}'`);
    }

    const timestamp = new Date().toISOString();
    const fromStatus = job.status;
    job.status = 'Expired';
    job.expiredAt = timestamp;
    job.statusHistory.push({ status: 'Expired', timestamp });
    job.sourceLog = sourceLog;

    const entries = this.activity.get(spaceId) || [];
    entries.push(this._indexedActivity({
      spaceId,
      job,
      contract,
      chain,
      externalId,
      onchainKey,
      sourceLog,
      timestamp,
      type: 'WORK_EXPIRED',
      fromStatus,
      toStatus: 'Expired',
      refundedAmount: job.refundedAmount,
    }));
    this.activity.set(spaceId, entries);
    return { job: { ...job }, expired: true };
  }

  recordIndexedRefund({ spaceId, chainId, contractAddress, onchainJobId, client, amount, blockNumber, txHash, logIndex }) {
    const indexed = this._getIndexedJobForEvent({ spaceId, chainId, contractAddress, onchainJobId, eventName: 'Refunded' });
    const { job, contract, chain, externalId, onchainKey } = indexed;
    if (typeof client !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(client)) throw new Error('Refunded requires a valid client address');
    if (typeof amount !== 'bigint' || amount <= 0n) throw new Error('Refunded requires a positive uint256 amount');
    const normalizedClient = client.toLowerCase();
    if (job.client && !sameAddress(job.client, normalizedClient)) throw new Error(`Refunded client '${normalizedClient}' conflicts with indexed job client '${job.client}'`);
    const refundedAmount = fromBaseUnits(amount);
    const sourceLog = this._indexedSourceLog({ blockNumber, txHash, logIndex });
    if (job.refunded && this._sameIndexedSourceLog(job.refundSourceLog, sourceLog) && job.refundedAmount === refundedAmount && job.refundClient === normalizedClient) {
      return { job: { ...job }, refunded: false };
    }
    if (job.refunded || job.status === 'Completed' || job.status === 'Rejected' || job.status === 'Expired') {
      throw new Error(`Refunded conflicts with indexed job '${onchainKey}' in status '${job.status}'`);
    }

    const timestamp = new Date().toISOString();
    job.refunded = true;
    job.refundedAmount = refundedAmount;
    job.refundClient = normalizedClient;
    job.refundSourceLog = sourceLog;

    const entries = this.activity.get(spaceId) || [];
    entries.push(this._indexedActivity({
      spaceId,
      job,
      contract,
      chain,
      externalId,
      onchainKey,
      sourceLog,
      timestamp,
      type: 'WORK_REFUNDED',
      fromStatus: job.status,
      toStatus: job.status,
      client: normalizedClient,
      amount: refundedAmount,
      refundedAmount,
    }));
    this.activity.set(spaceId, entries);
    return { job: { ...job }, refunded: true };
  }

  resolveAdjudicationIndexedJob({ spaceId, chainId, contractAddress, onchainJobId, adjudicator, approve, reason, blockNumber, txHash, logIndex }) {
    const indexed = this._getIndexedJobForEvent({ spaceId, chainId, contractAddress, onchainJobId, eventName: 'AdjudicationResolved' });
    const { job, contract, chain, externalId, onchainKey } = indexed;
    if (typeof adjudicator !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(adjudicator)) throw new Error('AdjudicationResolved requires a valid adjudicator address');
    if (typeof approve !== 'boolean') throw new Error('AdjudicationResolved requires a boolean approve decision');
    if (typeof reason !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(reason)) throw new Error('AdjudicationResolved requires a bytes32 reason');
    const normalizedAdjudicator = adjudicator.toLowerCase();
    const normalizedReason = reason.toLowerCase();
    if (!job.adjudication?.caseId) throw new Error(`AdjudicationResolved requires an adjudication request for indexed job '${onchainKey}'`);
    if (job.adjudicator !== normalizedAdjudicator) throw new Error(`AdjudicationResolved adjudicator '${normalizedAdjudicator}' conflicts with bound adjudicator '${job.adjudicator}'`);
    const sourceLog = this._indexedSourceLog({ blockNumber, txHash, logIndex });
    const existing = job.adjudication.resolution;
    if (existing) {
      if (existing.sourceLog && this._sameIndexedSourceLog(existing.sourceLog, sourceLog) && existing.adjudicator === normalizedAdjudicator && existing.approve === approve && existing.reason === normalizedReason) {
        const expectedStatus = approve ? 'Completed' : 'Rejected';
        if (job.status !== expectedStatus) throw new Error(`AdjudicationResolved outcome conflicts with indexed job status '${job.status}'`);
        return { job: { ...job }, resolved: false };
      }
      throw new Error(`AdjudicationResolved conflicts with recorded resolution for indexed job '${onchainKey}'`);
    }
    if (job.status !== 'Adjudicating' && job.status !== 'Completed' && job.status !== 'Rejected') {
      throw new Error(`AdjudicationResolved cannot reconcile indexed job '${onchainKey}' from '${job.status}'`);
    }
    if ((approve && job.status === 'Rejected') || (!approve && job.status === 'Completed')) {
      throw new Error(`AdjudicationResolved ${approve ? 'approval' : 'rejection'} conflicts with indexed job status '${job.status}'`);
    }
    if (job.status === 'Completed' && job.completionReason !== normalizedReason) {
      throw new Error(`AdjudicationResolved reason conflicts with the recorded completion for indexed job '${onchainKey}'`);
    }
    if (job.status === 'Rejected' && (job.rejectedBy !== normalizedAdjudicator || job.rejectionReason !== normalizedReason)) {
      throw new Error(`AdjudicationResolved outcome conflicts with the recorded rejection for indexed job '${onchainKey}'`);
    }

    const timestamp = new Date().toISOString();
    const toStatus = approve ? 'Completed' : 'Rejected';
    job.adjudication.resolution = {
      adjudicator: normalizedAdjudicator,
      approve,
      reason: normalizedReason,
      resolvedAt: timestamp,
      sourceLog,
    };
    if (job.status === 'Adjudicating') {
      job.status = toStatus;
      if (approve) {
        job.completedAt = timestamp;
        job.completionReason = normalizedReason;
        job.feedback = normalizedReason;
      } else {
        job.rejectedAt = timestamp;
        job.rejectedBy = normalizedAdjudicator;
        job.rejectionReason = normalizedReason;
        job.feedback = normalizedReason;
      }
      job.statusHistory.push({ status: toStatus, timestamp });
    }

    const entries = this.activity.get(spaceId) || [];
    entries.push(this._indexedActivity({
      spaceId,
      job,
      contract,
      chain,
      externalId,
      onchainKey,
      sourceLog,
      timestamp,
      type: 'WORK_ADJUDICATION_RESOLVED',
      fromStatus: 'Adjudicating',
      toStatus,
      adjudicator: normalizedAdjudicator,
      approved: approve,
      approve,
      reason: normalizedReason,
    }));
    this.activity.set(spaceId, entries);
    return { job: { ...job }, resolved: true };
  }

  recordIndexedAttestedSettlement({ spaceId, chainId, contractAddress, onchainJobId, provider, amount, nonce, blockNumber, txHash, logIndex }) {
    const indexed = this._getIndexedJobForEvent({ spaceId, chainId, contractAddress, onchainJobId, eventName: 'AttestedJobSettlement' });
    const { job, contract, chain, externalId, onchainKey } = indexed;
    if (typeof provider !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(provider)) throw new Error('AttestedJobSettlement requires a valid provider address');
    if (typeof amount !== 'bigint' || amount <= 0n) throw new Error('AttestedJobSettlement requires a positive uint256 amount');
    if (typeof nonce !== 'bigint' || nonce < 0n) throw new Error('AttestedJobSettlement requires a uint256 nonce');
    const normalizedProvider = provider.toLowerCase();
    const settledAmount = fromBaseUnits(amount);
    if (!sameAddress(job.provider, normalizedProvider)) throw new Error(`AttestedJobSettlement provider '${normalizedProvider}' conflicts with indexed job provider '${job.provider}'`);
    if (job.budget !== settledAmount) throw new Error(`AttestedJobSettlement amount '${settledAmount}' conflicts with indexed job budget '${job.budget}'`);
    const sourceLog = this._indexedSourceLog({ blockNumber, txHash, logIndex });
    const existing = job.attestedSettlement;
    if (existing) {
      if (this._sameIndexedSourceLog(existing.sourceLog, sourceLog) && existing.provider === normalizedProvider && existing.amount === settledAmount && existing.nonce === nonce.toString()) {
        return { job: { ...job }, recorded: false };
      }
      throw new Error(`AttestedJobSettlement conflicts with recorded evidence for indexed job '${onchainKey}'`);
    }
    if (job.status !== 'Submitted') {
      throw new Error(`AttestedJobSettlement cannot record evidence on indexed job '${onchainKey}' from '${job.status}'`);
    }

    const timestamp = new Date().toISOString();
    job.attestedSettlement = {
      provider: normalizedProvider,
      amount: settledAmount,
      nonce: nonce.toString(),
      observedAt: timestamp,
      sourceLog,
    };
    const entries = this.activity.get(spaceId) || [];
    entries.push(this._indexedActivity({
      spaceId,
      job,
      contract,
      chain,
      externalId,
      onchainKey,
      sourceLog,
      timestamp,
      type: 'WORK_ATTESTED_SETTLEMENT',
      fromStatus: 'Submitted',
      toStatus: 'Submitted',
      provider: normalizedProvider,
      amount: settledAmount,
      nonce: nonce.toString(),
    }));
    this.activity.set(spaceId, entries);
    return { job: { ...job }, recorded: true };
  }

  _delegationActivity(spaceId) {
    if (!this.activity.has(spaceId)) this.activity.set(spaceId, []);
    return this.activity.get(spaceId);
  }

  _delegationMemberOrThrow(space, parentActor) {
    const member = (space.members || []).find((item) => String(item.address || '').toLowerCase() === String(parentActor || '').toLowerCase());
    if (!member || !['admin', 'agent', 'operator'].includes(member.role)) throw new Error(`Parent '${parentActor}' is not a spending member of Space '${space.id}'`);
    return member;
  }

  _delegationChildOrThrow(space, child, childRole) {
    const address = String(child || '').toLowerCase();
    const member = (space.members || []).find((item) => String(item.address || '').toLowerCase() === address);
    if (member) {
      if (member.role !== childRole) throw new Error(`Child '${child}' has role '${member.role}', not '${childRole}'`);
      return { member, participantId: member.id };
    }
    const participant = [...this.participants.values()].find((item) => item.spaceId === space.id && item.status === 'Active' && String(item.address || '').toLowerCase() === address);
    if (!participant) throw new Error(`Child '${child}' is not a member or address-backed participant of Space '${space.id}'`);
    if (participant.role !== childRole && childRole !== 'member') throw new Error(`Child '${child}' has role '${participant.role}', not '${childRole}'`);
    return { member: null, participantId: participant.participantId };
  }

  _delegationOrThrow(spaceId, delegationId) {
    const delegation = this.delegations.get(delegationId);
    if (!delegation || delegation.spaceId !== spaceId) throw new Error(`Authority delegation '${delegationId}' not found in Space '${spaceId}'`);
    if (delegation.status !== 'REVOKED' && BigInt(delegation.expiry) * 1000n <= BigInt(Date.now())) {
      delegation.status = 'EXPIRED';
      delegation.expiredAt = new Date().toISOString();
      delegation.activity.push({ type: 'DELEGATION_EXPIRED', timestamp: delegation.expiredAt });
      this._delegationActivity(spaceId).push({ type: 'DELEGATION_EXPIRED', delegationId, spaceId, timestamp: delegation.expiredAt });
    }
    return delegation;
  }

  _delegationParentEnvelope(space, parent) {
    const rules = space.rules || {};
    return {
      delegationId: `parent-${space.id}`,
      spaceId: space.id,
      parentActor: parent.address,
      child: parent.address,
      parentRole: parent.role,
      childRole: parent.role,
      maxPerTransaction: rules.maxPerTransaction,
      dailyBudget: rules.dailyBudget,
      allowedCounterparties: (rules.allowedCounterparties || []).map((item) => String(item).toLowerCase()),
      asset: space.currency,
      chainId: space.chainId,
      nonce: '0',
      expiry: (2n ** 256n - 1n).toString(),
      policySnapshotHash: `0x${'0'.repeat(64)}`,
    };
  }

  createDelegation(args = {}) {
    const input = args.delegation && typeof args.delegation === 'object' ? { ...args, ...args.delegation } : args;
    const space = this._getSpaceOrThrow(input.spaceId);
    let normalized;
    try {
      normalized = normalizeAuthorityDelegation(input, { chainId: input.chainId });
    } catch (error) {
      throw new Error(`Invalid authority delegation: ${error.message}`);
    }
    const validation = validateAuthorityDelegation(input, { nowMs: Date.now(), chainId: space.chainId });
    if (!validation.valid) throw new Error(`Invalid authority delegation: ${validation.reasons.join('; ')}`);
    const candidate = {
      ...input,
      spaceId: normalized.spaceId,
      parentActor: normalized.parentActor,
      child: normalized.child,
      parentRole: normalized.parentRole,
      childRole: normalized.childRole,
      allowedCounterparties: normalized.allowedCounterparties,
      asset: normalized.asset,
      chainId: normalized.chainId,
      nonce: normalized.nonce,
      expiry: normalized.expiry,
      policySnapshotHash: normalized.policySnapshotHash,
    };
    const parent = this._delegationMemberOrThrow(space, normalized.parentActor);
    if (parent.role !== normalized.parentRole) throw new Error(`Parent role '${normalized.parentRole}' does not match Space role '${parent.role}'`);
    this._delegationChildOrThrow(space, normalized.child, normalized.childRole);
    if (normalized.chainId !== String(space.chainId)) throw new Error(`Delegation chainId must be ${space.chainId}`);
    if (normalized.asset.toLowerCase() !== String(space.currency).toLowerCase()) throw new Error(`Delegation asset must be ${space.currency}`);
    const parentEnvelope = this._delegationParentEnvelope(space, parent);
    const proof = authoritySubsetProof(parentEnvelope, candidate);
    if (!proof.valid) throw new Error(`Delegation expands parent authority: ${proof.reasons.join('; ')}`);
    if (this.delegations.has(normalized.delegationId)) throw new Error(`Duplicate delegation '${normalized.delegationId}'`);
    const nonceKey = `${normalized.spaceId}:${normalized.parentActor}:${normalized.nonce}`;
    if (this.delegationNonces.has(nonceKey)) throw new Error(`Duplicate delegation nonce '${normalized.nonce}' for parent '${normalized.parentActor}'`);
    const now = new Date().toISOString();
    const delegation = {
      ...candidate,
      expiryAt: new Date(Number(normalized.expiry) * 1000).toISOString(),
      digest: authorityDelegationDigest(candidate, space.chainId),
      typedData: authorityDelegationTypedData(candidate, space.chainId),
      status: 'PENDING',
      signature: null,
      signedBy: null,
      signedAt: null,
      revokedAt: null,
      revokedBy: null,
      createdAt: now,
      activity: [{ type: 'DELEGATION_CREATED', delegationId: normalized.delegationId, spaceId: normalized.spaceId, parentActor: normalized.parentActor, child: normalized.child, digest: authorityDelegationDigest(candidate, space.chainId), timestamp: now }],
    };
    delegation.digest = authorityDelegationDigest(candidate, space.chainId);
    this.delegations.set(normalized.delegationId, delegation);
    this.delegationNonces.set(nonceKey, normalized.delegationId);
    this._delegationActivity(normalized.spaceId).push({ ...delegation.activity[0] });
    return { delegation: structuredClone(delegation), typedData: structuredClone(delegation.typedData), proof: structuredClone(proof) };
  }

  listDelegations({ spaceId, status = null } = {}) {
    this._getSpaceOrThrow(spaceId);
    let delegations = [...this.delegations.values()].filter((item) => item.spaceId === spaceId).map((item) => this._delegationOrThrow(spaceId, item.delegationId));
    if (status) delegations = delegations.filter((item) => item.status === status);
    return delegations.map((item) => structuredClone(item));
  }

  getDelegation({ spaceId, delegationId }) {
    this._getSpaceOrThrow(spaceId);
    return structuredClone(this._delegationOrThrow(spaceId, delegationId));
  }

  async signDelegation({ spaceId, delegationId, signature, digest, parentActor }) {
    const space = this._getSpaceOrThrow(spaceId);
    const delegation = this._delegationOrThrow(spaceId, delegationId);
    if (parentActor && String(parentActor).toLowerCase() !== delegation.parentActor) throw new Error('Authority delegation is bound to a different parent session');
    if (delegation.status !== 'PENDING') throw new Error(`Authority delegation '${delegationId}' is ${delegation.status.toLowerCase()}`);
    const verified = await verifyAuthorityDelegationSignature({ delegation, signature, signerAddress: delegation.parentActor, digest, nowMs: Date.now(), chainId: space.chainId });
    delegation.signature = signature;
    delegation.signedBy = verified.signer;
    delegation.signedAt = new Date().toISOString();
    delegation.status = 'SIGNED';
    delegation.activity.push({ type: 'DELEGATION_SIGNED', signer: verified.signer, digest: verified.digest, timestamp: delegation.signedAt });
    this._delegationActivity(spaceId).push({ type: 'DELEGATION_SIGNED', delegationId, spaceId, signer: verified.signer, digest: verified.digest, timestamp: delegation.signedAt });
    return structuredClone(delegation);
  }

  async verifyDelegation({ spaceId, delegationId, delegation: candidate, signature, digest, parentActor } = {}) {
    const space = this._getSpaceOrThrow(spaceId);
    const stored = this._delegationOrThrow(spaceId, delegationId);
    if (stored.status !== 'SIGNED') throw new Error(`Authority delegation '${delegationId}' is not signed`);
    if (parentActor && String(parentActor).toLowerCase() !== stored.parentActor) throw new Error('Authority delegation is bound to a different parent session');
    const subject = candidate || stored;
    const expected = authorityDelegationDigest(stored, space.chainId);
    if (authorityDelegationDigest(subject, space.chainId).toLowerCase() !== expected.toLowerCase()) throw new Error('Authority delegation is tampered');
    const verified = await verifyAuthorityDelegationSignature({ delegation: subject, signature: signature || stored.signature, signerAddress: stored.parentActor, digest: digest || stored.digest, nowMs: Date.now(), chainId: space.chainId });
    return { valid: true, delegationId, signer: verified.signer, digest: verified.digest, status: stored.status };
  }

  revokeDelegation({ spaceId, delegationId, parentActor, actorAddress }) {
    const space = this._getSpaceOrThrow(spaceId);
    const delegation = this._delegationOrThrow(spaceId, delegationId);
    const revoker = String(parentActor || actorAddress || '').toLowerCase();
    if (revoker !== delegation.parentActor) throw new Error('Only the delegation parent can revoke this delegation');
    if (delegation.status === 'REVOKED') throw new Error(`Authority delegation '${delegationId}' is already revoked`);
    if (delegation.status === 'EXPIRED') throw new Error(`Authority delegation '${delegationId}' has expired`);
    const timestamp = new Date().toISOString();
    delegation.status = 'REVOKED';
    delegation.revokedAt = timestamp;
    delegation.revokedBy = revoker;
    delegation.activity.push({ type: 'DELEGATION_REVOKED', actor: revoker, timestamp });
    this._delegationActivity(spaceId).push({ type: 'DELEGATION_REVOKED', delegationId, spaceId, actor: revoker, timestamp });
    return structuredClone(delegation);
  }

  _governanceConfigOrThrow(spaceId) {
    const space = this._getSpaceOrThrow(spaceId);
    const config = space.governance;
    const reasons = validateGovernanceConfig(config);
    if (reasons.length > 0) throw new Error(`Space '${spaceId}' governance is not configured: ${reasons.join('; ')}`);
    return { space, config: { ...config, signerAllowlist: config.signerAllowlist.map((address) => address.toLowerCase()) } };
  }

  getGovernanceConfig({ spaceId }) {
    const { config } = this._governanceConfigOrThrow(spaceId);
    return { ...config, signerAllowlist: [...config.signerAllowlist] };
  }

  configureSpaceGovernance({ spaceId, actorAddress, threshold, signerAllowlist, enabled = true }) {
    const space = this._getSpaceOrThrow(spaceId);
    const admin = (space.members || []).find((member) => String(member.address || '').toLowerCase() === String(actorAddress || '').toLowerCase() && member.role === 'admin');
    if (!admin) throw new Error(`Only an admin of Space '${spaceId}' can configure governance`);
    const config = { enabled, threshold, signerAllowlist };
    const reasons = validateGovernanceConfig(config);
    if (reasons.length > 0) throw new Error(`Invalid governance config: ${reasons.join('; ')}`);
    space.governance = { ...config, signerAllowlist: config.signerAllowlist.map((address) => address.toLowerCase()) };
    return this.getGovernanceConfig({ spaceId });
  }

  _governanceMember(space, address) {
    return (space.members || []).find((member) => String(member.address || '').toLowerCase() === String(address || '').toLowerCase() && ['admin', 'agent', 'operator'].includes(member.role));
  }

  _governanceCapReason(space, amount) {
    const max = space.rules?.maxPerTransaction;
    if (!max || toBaseUnits(amount) <= toBaseUnits(max)) return null;
    return `Exceeds Space per-transaction cap: requested ${amount} ${space.currency || 'USDC'}, max permitted is ${max}`;
  }

  _evaluateGovernancePayment(space, request) {
    const requester = this._governanceMember(space, request.requesterAddress);
    const evaluation = evaluateSpacePayment(space, {
      actionId: request.actionId,
      actorId: requester?.id || request.requesterAddress,
      recipient: request.recipient,
      amount: request.amount,
      asset: request.asset,
      memo: request.memo,
      timestamp: new Date().toISOString(),
    });
    const capReason = this._governanceCapReason(space, request.amount);
    const reasons = evaluation.reasons.filter((reason) => reason !== capReason);
    const allowed = reasons.length === 0;
    return {
      ...evaluation,
      allowed,
      reasons,
      capException: Boolean(capReason),
      approvedIntent: allowed ? {
        actionId: request.actionId,
        spaceId: space.id,
        actorId: request.requesterAddress,
        recipient: request.recipient,
        amount: request.amount,
        asset: request.asset,
        approvedAt: new Date().toISOString(),
        memo: request.memo,
        nonce: request.approval.nonce,
        authHash: request.approval.policyHash,
        deliverableHash: request.approval.policyHash,
      } : null,
    };
  }

  createGovernancePaymentRequest({ spaceId, requesterAddress, recipient, amount, memo = '', deadline }) {
    const { space, config } = this._governanceConfigOrThrow(spaceId);
    if (!this._governanceMember(space, requesterAddress)) throw new Error(`Requester '${requesterAddress}' is not a spending member of Space '${spaceId}'`);
    if (!/^0x[0-9a-fA-F]{40}$/.test(String(recipient || ''))) throw new Error('Governance payment recipient must be an EVM address');
    const amountBase = toBaseUnits(amount);
    if (amountBase <= 0n) throw new Error('Governance payment amount must be greater than zero');
    const capReason = this._governanceCapReason(space, amount);
    if (!capReason) throw new Error('Governance payment must exceed the Space per-transaction cap');
    const deadlineMs = this._parseDeadline(deadline);
    if (deadlineMs <= Date.now()) throw new Error('Governance payment deadline must be in the future');
    const actionId = `act-${crypto.randomUUID().slice(0, 8)}`;
    const createdAt = new Date().toISOString();
    const requestId = `gov-${String(this._nextGovernanceRequestSeq++).padStart(4, '0')}-${crypto.randomUUID().slice(0, 8)}`;
    const policySnapshot = {
      chainId: space.chainId,
      currency: space.currency,
      balance: space.balance,
      totalSpentToday: space.totalSpentToday,
      rules: structuredClone(space.rules || {}),
    };
    const policyHash = governancePolicyHash(policySnapshot);
    const approval = {
      requestId,
      spaceId,
      recipient: String(recipient).toLowerCase(),
      amount: amountBase.toString(),
      asset: space.currency,
      memo: String(memo || ''),
      nonce: BigInt(`0x${crypto.randomBytes(16).toString('hex')}`).toString(),
      deadline: Math.floor(deadlineMs / 1000).toString(),
      policyHash,
    };
    const request = {
      requestId,
      spaceId,
      actionId,
      requesterAddress: String(requesterAddress).toLowerCase(),
      recipient: approval.recipient,
      amount: String(amount),
      asset: space.currency,
      memo: approval.memo,
      deadline: new Date(deadlineMs).toISOString(),
      deadlineMs,
      chainId: space.chainId,
      nonce: approval.nonce,
      policyHash,
      policySnapshot,
      governanceSnapshot: { threshold: config.threshold, signerAllowlist: [...config.signerAllowlist] },
      approval,
      digest: governancePaymentDigest(approval, space.chainId),
      approvals: [],
      status: 'PENDING',
      createdAt,
      executedAt: null,
      receipt: null,
    };
    const policy = this._evaluateGovernancePayment(space, request);
    if (!policy.allowed) throw new Error(`Governance request violates non-cap policy: ${policy.reasons.join('; ')}`);
    this.governanceRequests.set(requestId, request);
    this.activity.get(spaceId).push({ type: 'GOVERNANCE_PAYMENT_REQUESTED', requestId, spaceId, amount: request.amount, recipient: request.recipient, digest: request.digest, createdAt });
    return { request: structuredClone(request), typedData: governanceApprovalTypedData(approval, space.chainId) };
  }

  listGovernanceRequests({ spaceId, status = null }) {
    this._getSpaceOrThrow(spaceId);
    let requests = [...this.governanceRequests.values()].filter((request) => request.spaceId === spaceId);
    if (status) requests = requests.filter((request) => request.status === status);
    return requests.map((request) => structuredClone(request));
  }

  getGovernanceRequest({ spaceId, requestId }) {
    this._getSpaceOrThrow(spaceId);
    const request = this.governanceRequests.get(requestId);
    if (!request || request.spaceId !== spaceId) throw new Error(`Governance request '${requestId}' not found in Space '${spaceId}'`);
    return structuredClone(request);
  }

  async signGovernancePaymentRequest({ spaceId, requestId, signerAddress, signature }) {
    const { space, config } = this._governanceConfigOrThrow(spaceId);
    const request = this.governanceRequests.get(requestId);
    if (!request || request.spaceId !== spaceId) throw new Error(`Governance request '${requestId}' not found in Space '${spaceId}'`);
    if (request.status === 'EXECUTED' || request.status === 'EXECUTING') throw new Error(`Governance request '${requestId}' is already ${request.status.toLowerCase()}`);
    if (request.status === 'APPROVED') throw new Error(`Governance request '${requestId}' already has its required approvals`);
    if (request.deadlineMs <= Date.now()) throw new Error(`Governance request '${requestId}' has expired`);
    const signer = String(signerAddress || '').toLowerCase();
    if (request.approvals.some((approval) => approval.signerAddress === signer)) throw new Error(`Governance signer '${signer}' has already approved request '${requestId}'`);
    const validation = await validateGovernanceApproval({ approval: { signerAddress: signer, signature, digest: request.digest }, request, chainId: space.chainId, signerAllowlist: request.governanceSnapshot.signerAllowlist, nowMs: Date.now() });
    if (!validation.valid) {
      const error = new Error(`Invalid governance approval: ${validation.reasons.join('; ')}`);
      error.httpStatus = validation.reasons.some((reason) => reason.includes('not authorized')) ? 403 : 400;
      error.httpCode = validation.reasons.some((reason) => reason.includes('not authorized')) ? 'FORBIDDEN' : 'VALIDATION';
      throw error;
    }
    request.approvals.push({ signerAddress: signer, signature, digest: request.digest, approvedAt: new Date().toISOString() });
    if (request.approvals.length === request.governanceSnapshot.threshold) request.status = 'APPROVED';
    this.activity.get(spaceId).push({ type: 'GOVERNANCE_PAYMENT_SIGNED', requestId, spaceId, signerAddress: signer, approvalCount: request.approvals.length, threshold: request.governanceSnapshot.threshold, timestamp: request.approvals.at(-1).approvedAt });
    return structuredClone(request);
  }

  async executeGovernancePaymentRequest({ spaceId, requestId, actorAddress }) {
    const { space, config } = this._governanceConfigOrThrow(spaceId);
    const request = this.governanceRequests.get(requestId);
    if (!request || request.spaceId !== spaceId) throw new Error(`Governance request '${requestId}' not found in Space '${spaceId}'`);
    if (!this._governanceMember(space, actorAddress)) throw new Error(`Executor '${actorAddress}' is not a spending member of Space '${spaceId}'`);
    if (request.status === 'EXECUTED') return { status: 'EXECUTED', request: structuredClone(request), receipt: structuredClone(request.receipt) };
    if (request.status === 'EXECUTING') throw new Error(`Governance request '${requestId}' is already executing`);
    if (request.deadlineMs <= Date.now()) throw new Error(`Governance request '${requestId}' has expired`);
    const claim = `${spaceId}:${requestId}`;
    if (this.governanceExecutionClaims.has(claim)) throw new Error(`Governance request '${requestId}' is already executing`);
    this.governanceExecutionClaims.add(claim);
    try {
      const unique = new Set();
      for (const approval of request.approvals) {
        if (unique.has(approval.signerAddress)) throw new Error(`Governance request '${requestId}' contains duplicate approvals`);
        unique.add(approval.signerAddress);
        const validation = await validateGovernanceApproval({ approval, request, chainId: space.chainId, signerAllowlist: request.governanceSnapshot.signerAllowlist, nowMs: Date.now() });
        if (!validation.valid) throw new Error(`Governance request '${requestId}' has an invalid approval: ${validation.reasons.join('; ')}`);
      }
      if (unique.size !== request.governanceSnapshot.threshold) throw new Error(`Governance request '${requestId}' requires exactly ${request.governanceSnapshot.threshold} unique approvals`);
      const policy = this._evaluateGovernancePayment(space, request);
      if (!policy.allowed) throw new Error(`Governance request '${requestId}' violates non-cap policy: ${policy.reasons.join('; ')}`);
      request.status = 'EXECUTING';
      const settlement = await this._settleApprovedPayment({
        space,
        actionId: request.actionId,
        actorId: request.requesterAddress,
        recipient: request.recipient,
        amount: request.amount,
        memo: request.memo,
        evaluation: policy,
        evaluatorAddr: request.requesterAddress,
        receiptMetadata: { governanceRequestId: requestId, governanceDigest: request.digest },
      });
      request.receipt = settlement.receipt;
      request.executedAt = new Date().toISOString();
      request.status = 'EXECUTED';
      this.activity.get(spaceId).push({ type: 'GOVERNANCE_PAYMENT_EXECUTED', requestId, spaceId, receiptId: settlement.receipt.receiptId, digest: request.digest, approvalCount: request.approvals.length, timestamp: request.executedAt });
      return { status: 'EXECUTED', request: structuredClone(request), receipt: structuredClone(settlement.receipt), spaceBalance: settlement.spaceBalance };
    } catch (err) {
      request.status = request.approvals.length === request.governanceSnapshot.threshold ? 'APPROVED' : 'PENDING';
      throw err;
    } finally {
      this.governanceExecutionClaims.delete(claim);
    }
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

    // Naming someone with a wallet address approves them as payable.
    //
    // This is what makes the empty-allowlist fix usable rather than inert. The
    // policy now treats a present but empty allowlist as "nobody is approved
    // yet" and denies every payment, which is the correct posture but would
    // leave a freshly created Space unable to do anything at all. The product
    // language already says the roster is who you work with, and a work order
    // can only be created for a participant, so approving a participant on
    // arrival is the same decision stated once instead of twice. It also means
    // the counterparty boundary is no longer a separate list a user can forget
    // to fill in.
    if (participant.address) {
      space.rules = space.rules || {};
      const current = Array.isArray(space.rules.allowedCounterparties) ? space.rules.allowedCounterparties : [];
      const incoming = String(participant.address).toLowerCase();
      if (!current.some((entry) => String(entry).toLowerCase() === incoming)) {
        space.rules.allowedCounterparties = [...current, participant.address];
      }
    }
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
