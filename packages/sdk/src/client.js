/**
 * SpaceClient (M5): typed fetch client for the Microcosm REST API.
 * Mirrors docs/API_CONTRACT.md v1. Transport-only — all policy and
 * settlement semantics live server-side, identical to MCP.
 *
 * Amounts are USDC decimal strings, hashes are 0x-hex, times ISO-8601.
 * Receipts from this client are ALWAYS real onchain settlements; the
 * server throws loudly instead of fabricating receipts.
 */

/**
 * @typedef {Object} Bounds
 * @property {string} spaceId
 * @property {string} treasuryBalance
 * @property {string} spentToday
 * @property {string} escrowed
 * @property {string} remaining
 * @property {string} dailyBudget
 * @property {string} maxPerTransaction
 * @property {number} denials
 */

/**
 * @typedef {Object} Receipt
 * @property {string} receiptId
 * @property {string} txHash
 * @property {Object.<string,string>} txHashes
 * @property {string} onchainJobId
 * @property {string} amount
 * @property {string} asset
 * @property {string} network
 * @property {number} chainId
 * @property {string} status
 */

/**
 * @typedef {Object} DenialProof
 * @property {string} spaceId
 * @property {string} actorId
 * @property {string} requestedAmount
 * @property {string[]} reasons
 * @property {string} proofHash
 */

/** Server policy-denial surfaced as a typed error (HTTP 422). */
export class PolicyDenial extends Error {
  /**
   * @param {string} message
   * @param {DenialProof} denialProof
   * @param {string[]} reasons
   */
  constructor(message, denialProof, reasons) {
    super(message);
    this.name = 'PolicyDenial';
    this.code = 'POLICY_DENIAL';
    this.denialProof = denialProof;
    this.reasons = reasons;
  }
}

/** Any non-2xx API error with its frozen code. */
export class ApiError extends Error {
  /** @param {number} status @param {string} code @param {string} message */
  constructor(status, code, message) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export class SpaceClient {
  /** @param {string} baseUrl e.g. http://localhost:8787 */
  constructor(baseUrl, { cookie = null } = {}) {
    this.baseUrl = String(baseUrl).replace(/\/$/, '');
    this.cookie = cookie;
  }

  async _req(method, path, body, query = {}) {
    const qs = new URLSearchParams(Object.fromEntries(
      Object.entries(query).filter(([, v]) => v !== undefined && v !== null)
    )).toString();
    const url = `${this.baseUrl}${path}${qs ? `?${qs}` : ''}`;
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', ...(this.cookie ? { Cookie: this.cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = json.error || {};
      if (res.status === 422 && err.code === 'POLICY_DENIAL') {
        throw new PolicyDenial(err.message, err.details?.denialProof, err.details?.reasons || []);
      }
      throw new ApiError(res.status, err.code || 'UNKNOWN', err.message || `HTTP ${res.status}`);
    }
    return json;
  }

  // --- meta ---
  health() { return this._req('GET', '/api/health'); }

  // --- spaces ---
  listSpaces(actorId) { return this._req('GET', '/api/spaces', undefined, { actorId }); }
  /** @param {{name:string, description?:string, actorId?:string}} args */
  createSpace(args) { return this._req('POST', '/api/spaces', args); }
  getSpace(spaceId) { return this._req('GET', `/api/spaces/${spaceId}`); }
  /** @returns {Promise<Bounds>} hero-dial binding */
  bounds(spaceId) { return this._req('GET', `/api/spaces/${spaceId}/bounds`); }
  capabilities(spaceId, actorId) { return this._req('GET', `/api/spaces/${spaceId}/capabilities`, undefined, { actorId }); }
  getCapabilityManifest(spaceId) { return this._req('GET', `/api/spaces/${spaceId}/capability-manifest`); }
  validateX402Payment(spaceId, args) { return this._req('POST', `/api/spaces/${spaceId}/payments/x402/validate`, args); }
  validateX402PaymentIntent(spaceId, args) { return this.validateX402Payment(spaceId, args); }
  createX402Intent(spaceId, args) { return this._req('POST', `/api/spaces/${spaceId}/payments/x402/intents`, args); }
  getX402Intent(spaceId, intentId) { return this._req('GET', `/api/spaces/${spaceId}/payments/x402/intents/${intentId}`); }
  signX402Intent(spaceId, intentId, args) { return this._req('POST', `/api/spaces/${spaceId}/payments/x402/intents/${intentId}/sign`, args); }
  settleX402Intent(spaceId, intentId, args = {}) { return this._req('POST', `/api/spaces/${spaceId}/payments/x402/intents/${intentId}/settle`, args); }
  createX402PaymentIntent(spaceId, args) { return this.createX402Intent(spaceId, args); }
  getX402PaymentIntent(spaceId, intentId) { return this.getX402Intent(spaceId, intentId); }
  signX402PaymentIntent(spaceId, intentId, args) { return this.signX402Intent(spaceId, intentId, args); }
  settleX402PaymentIntent(spaceId, intentId, args = {}) { return this.settleX402Intent(spaceId, intentId, args); }
  fundSpace(spaceId, args) { return this._req('POST', `/api/spaces/${spaceId}/fund`, args); }

  // --- participants ---
  listParticipants(spaceId, query = {}) { return this._req('GET', `/api/spaces/${spaceId}/participants`, undefined, query); }
  addParticipant(spaceId, args) { return this._req('POST', `/api/spaces/${spaceId}/participants`, args); }
  deactivateParticipant(spaceId, participantId, args = {}) { return this._req('POST', `/api/spaces/${spaceId}/participants/${participantId}/deactivate`, args); }

  // --- requests ---
  listRequests(spaceId, query = {}) { return this._req('GET', `/api/spaces/${spaceId}/requests`, undefined, query); }
  createRequest(spaceId, args) { return this._req('POST', `/api/spaces/${spaceId}/requests`, args); }
  getRequest(spaceId, requestId) { return this._req('GET', `/api/spaces/${spaceId}/requests/${requestId}`); }
  acceptRequest(spaceId, requestId, args) { return this._req('POST', `/api/spaces/${spaceId}/requests/${requestId}/accept`, args); }
  completeRequest(spaceId, requestId, args) { return this._req('POST', `/api/spaces/${spaceId}/requests/${requestId}/complete`, args); }
  blockRequest(spaceId, requestId, args) { return this._req('POST', `/api/spaces/${spaceId}/requests/${requestId}/block`, args); }
  cancelRequest(spaceId, requestId, args) { return this._req('POST', `/api/spaces/${spaceId}/requests/${requestId}/cancel`, args); }
  receiveRequest(spaceId, requestId, actorId) { return this._req('GET', `/api/spaces/${spaceId}/requests/${requestId}/receive`, undefined, { actorId }); }
  traceRequest(spaceId, requestId) { return this._req('GET', `/api/spaces/${spaceId}/requests/${requestId}/trace`); }

  // --- work ---
  listWork(spaceId) { return this._req('GET', `/api/spaces/${spaceId}/work`); }
  createJob(spaceId, args) { return this._req('POST', `/api/spaces/${spaceId}/work`, args); }
  getJob(spaceId, jobId) { return this._req('GET', `/api/spaces/${spaceId}/work/${jobId}`); }
  submitDeliverable(spaceId, jobId, args) { return this._req('POST', `/api/spaces/${spaceId}/work/${jobId}/submit`, args); }
  /** @returns {Promise<{job:Object, receipt?:Receipt}>} receipt present only on approval */
  evaluateJob(spaceId, jobId, args) { return this._req('POST', `/api/spaces/${spaceId}/work/${jobId}/evaluate`, args); }
  requestVerdict(spaceId, jobId, args) { return this._req('POST', `/api/spaces/${spaceId}/work/${jobId}/request-verdict`, args); }
  postVerdict(spaceId, jobId, args) { return this._req('POST', `/api/spaces/${spaceId}/work/${jobId}/post-verdict`, args); }

  // --- payments ---
  /** @returns {Promise<{receipt:Receipt}>} throws PolicyDenial on boundary violation */
  requestPayment(spaceId, args) { return this._req('POST', `/api/spaces/${spaceId}/payments`, args); }

  configureGovernance(spaceId, args) { return this._req('POST', `/api/spaces/${spaceId}/governance/config`, args); }
  getGovernance(spaceId) { return this._req('GET', `/api/spaces/${spaceId}/governance/payments`); }
  createGovernancePayment(spaceId, args) { return this._req('POST', `/api/spaces/${spaceId}/governance/payments`, args); }
  listGovernanceRequests(spaceId, query = {}) { return this._req('GET', `/api/spaces/${spaceId}/governance/requests`, undefined, query); }
  getGovernanceRequest(spaceId, requestId) { return this._req('GET', `/api/spaces/${spaceId}/governance/requests/${requestId}`); }
  signGovernanceRequest(spaceId, requestId, signature) { return this._req('POST', `/api/spaces/${spaceId}/governance/requests/${requestId}/sign`, { signature }); }
  executeGovernanceRequest(spaceId, requestId) { return this._req('POST', `/api/spaces/${spaceId}/governance/requests/${requestId}/execute`, {}); }

  // --- activity ---
  listActivity(spaceId, query = {}) { return this._req('GET', `/api/spaces/${spaceId}/activity`, undefined, query); }

  /**
   * Subscribe to the live event stream. Yields envelopes
   * {seq, type, at, spaceId, payload} until aborted.
   */
  async *events(spaceId, { since, signal } = {}) {
    const query = since !== undefined ? `?since=${since}` : '';
    const res = await fetch(`${this.baseUrl}/api/spaces/${spaceId}/events${query}`, { signal });
    if (!res.ok || !res.body) throw new ApiError(res.status, 'STREAM', 'event stream unavailable');
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) return;
        buffer += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buffer.indexOf('\n\n')) !== -1) {
          const frame = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          const dataLine = frame.split('\n').find((l) => l.startsWith('data: '));
          if (dataLine) yield JSON.parse(dataLine.slice(6));
        }
      }
    } finally {
      reader.cancel().catch(() => {});
    }
  }
}
