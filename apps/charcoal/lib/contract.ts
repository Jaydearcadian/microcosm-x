/**
 * Typed client for docs/API_CONTRACT.md v1 (FROZEN).
 * Code against this file — never against server implementation details.
 */

export type JobStatus = "Funded" | "Submitted" | "Completed" | "Rejected" | "Expired" | "Adjudicating";
export type RequestStatus = "Open" | "Assigned" | "InProgress" | "Completed" | "Blocked" | "Cancelled";
export type ParticipantKind = "Human" | "Agent" | "Service" | "Organization" | "Counterparty";

export interface Bounds {
  spaceId: string; treasuryBalance: string; spentToday: string; escrowed: string; remaining: string;
  dailyBudget: string; maxPerTransaction: string; denials: number;
}
export interface SpaceRules { maxPerTransaction: string; dailyBudget: string; allowedCounterparties: string[] }
export interface SpaceSummary { id: string; name: string; description?: string; currency: string; balance: string; myRole: string }
export interface Space {
  id: string; name: string; description?: string; network: string; chainId: number; balance: string;
  currency: string; totalSpentToday?: string; members: Array<{ id: string; name: string; role: string; address?: string }>;
  rules: SpaceRules;
}
export interface Capabilities { spaceId: string; spaceName: string; network: string; currency: string; treasuryBalance: string; spentToday: string; actor: { id: string; name: string; role: string; address?: string }; rules: SpaceRules }
export interface Participant { participantId: string; spaceId: string; displayName: string; kind: ParticipantKind | string; role?: string; address?: string | null; status: string; joinedAt?: string }
export interface Job { jobId: string; spaceId: string; client?: string; provider: string; evaluator?: string; adjudicator?: string | null; description?: string; budget: string; escrowedAmount?: string; status: JobStatus; statusHistory?: Array<{ status: string; timestamp: string }>; deliverableHash?: string | null; evidenceUri?: string | null; feedback?: string | null; receipt?: Receipt; settlement?: Receipt }
export interface Request { requestId: string; spaceId: string; title: string; instructions?: string; createdBy: string; assignee?: string | null; status: RequestStatus; createdAt?: string }
export interface Receipt { receiptId: string; txHash: string; txHashes: Record<string, string>; onchainJobId: string; amount: string; asset: string; network: string; chainId: number; status: "SETTLED"; deliverableHash?: string }
export interface Health { ok: boolean; network: string; chainId: number; time: string }
export interface GovernanceConfig { enabled: boolean; threshold: number; signerAllowlist: string[] }
export interface GovernanceApproval { signerAddress: string; signature?: string; approvedAt?: string }
export interface GovernanceRequest {
  requestId: string; spaceId: string; requesterAddress: string; recipient: string; amount: string;
  asset: string; memo: string; deadline: string; chainId: number; digest: string;
  approvals: GovernanceApproval[]; status: string; createdAt: string; executedAt: string | null;
  receipt: { txHash?: string; receiptId?: string; amount?: string; asset?: string; network?: string; chainId?: number } | null;
}
export interface Eip712TypedData {
  types: Record<string, Array<{ name: string; type: string }>>;
  domain: Record<string, unknown>;
  primaryType: string;
  message: Record<string, unknown>;
}
export interface AuthSession { authenticated: boolean; address: string | null; expiresAt?: number | null }
export interface AuthChallenge { address: string; nonce: string; message: string; expiresAt: number }
export interface Invitation { code: string; spaceId: string; address: string; role: string; displayName: string; status: string; expiresAt: string }
export interface DenialProof { spaceId: string; actorId: string; requestedAmount: string; reasons: string[]; proofHash: string }
export interface Activity { seq: number; type: string; [key: string]: unknown }
export interface ApiError { error: { code: "VALIDATION" | "NOT_FOUND" | "STATE_CONFLICT" | "POLICY_DENIAL" | "AUTH_REQUIRED"; message: string; details?: { denialProof?: DenialProof; reasons?: string[] } } }

export const API_BASE = process.env.NEXT_PUBLIC_MICROCOSM_API ?? "";
export const SEED_BOUNDS: Bounds = { spaceId: "", treasuryBalance: "4530.000000", spentToday: "470.000000", escrowed: "350.000000", remaining: "1180.000000", dailyBudget: "2000.00", maxPerTransaction: "500.00", denials: 1 };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, { ...init, credentials: "include", headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  if (!response.ok) { const body = (await response.json().catch(() => null)) as ApiError | null; throw new Error(body?.error?.message ?? `${init?.method ?? "GET"} ${path} → ${response.status}`); }
  return (await response.json()) as T;
}
const post = <T,>(path: string, body: unknown) => request<T>(path, { method: "POST", body: JSON.stringify(body) });
const q = (value: string) => encodeURIComponent(value);

export async function fetchHealth(signal?: AbortSignal): Promise<Health> { return request<Health>("/api/health", { signal }); }
export async function fetchAuthSession(signal?: AbortSignal): Promise<AuthSession> { return request<AuthSession>("/api/auth/session", { signal }); }
export async function fetchAuthChallenge(address: string, signal?: AbortSignal): Promise<AuthChallenge> { return request<AuthChallenge>(`/api/auth/challenge?address=${q(address)}`, { signal }); }
export async function createAuthSession(address: string, signature: string): Promise<AuthSession> { return post<AuthSession>("/api/auth/session", { address, signature }); }
export async function revokeAuthSession(): Promise<AuthSession> { return post<AuthSession>("/api/auth/logout", {}); }
export async function createSpaceInvitation(spaceId: string, body: { address?: string; role?: string; displayName?: string }): Promise<Invitation> { return (await post<{ invitation: Invitation }>(`/api/spaces/${q(spaceId)}/invitations`, body)).invitation; }
export async function redeemSpaceInvitation(code: string): Promise<{ space: Space; invitation: Invitation }> { return post("/api/auth/invitations/redeem", { code }); }
export async function fetchSpaces(actorId?: string, signal?: AbortSignal): Promise<SpaceSummary[]> { const query = actorId ? `?actorId=${q(actorId)}` : ""; return (await request<{ spaces: SpaceSummary[] }>(`/api/spaces${query}`, { signal })).spaces; }
export async function fetchSpace(spaceId: string, signal?: AbortSignal): Promise<Space> { return (await request<{ space: Space }>(`/api/spaces/${q(spaceId)}`, { signal })).space; }
export async function fetchCapabilities(spaceId: string, actorId: string, signal?: AbortSignal): Promise<Capabilities> { return request<Capabilities>(`/api/spaces/${q(spaceId)}/capabilities?actorId=${q(actorId)}`, { signal }); }
export async function fetchBoundsFor(spaceId: string, actorId: string, signal?: AbortSignal): Promise<Bounds> { return request<Bounds>(`/api/spaces/${q(spaceId)}/bounds?actorId=${q(actorId)}`, { signal }); }

export async function fetchBounds(signal?: AbortSignal): Promise<Bounds> { const spaces = await fetchSpaces(undefined, signal); const spaceId = spaces[0]?.id; if (!spaceId) throw new Error("No Space is available"); return fetchBoundsFor(spaceId, "admin-01", signal); }
export async function fetchParticipants(spaceId: string, signal?: AbortSignal): Promise<Participant[]> { return (await request<{ participants: Participant[] }>(`/api/spaces/${q(spaceId)}/participants`, { signal })).participants; }
export async function fetchJobs(spaceId: string, signal?: AbortSignal): Promise<Job[]> { return (await request<{ jobs: Job[] }>(`/api/spaces/${q(spaceId)}/work`, { signal })).jobs; }
export async function fetchRequests(spaceId: string, signal?: AbortSignal): Promise<Request[]> { return (await request<{ requests: Request[] }>(`/api/spaces/${q(spaceId)}/requests`, { signal })).requests; }
export async function fetchActivity(spaceId: string, limit = 50, cursor?: number, signal?: AbortSignal): Promise<{ activity: Activity[]; nextCursor: number }> { const query = new URLSearchParams({ limit: String(limit) }); if (cursor !== undefined) query.set("cursor", String(cursor)); return request(`/api/spaces/${q(spaceId)}/activity?${query}`, { signal }); }
export async function createSpace(body: { name: string; description?: string; actorId: string }): Promise<Space> { return (await post<{ space: Space }>("/api/spaces", body)).space; }
export async function fundSpace(spaceId: string, amount: string, actorId: string): Promise<Space> { return (await post<{ space: Space }>(`/api/spaces/${q(spaceId)}/fund`, { amount, actorId })).space; }
export async function createParticipant(spaceId: string, body: { kind: ParticipantKind; displayName: string; address?: string; actorId?: string }): Promise<Participant> { return (await post<{ participant: Participant }>(`/api/spaces/${q(spaceId)}/participants`, body)).participant; }
export async function createRequest(spaceId: string, body: { createdBy: string; assignee?: string; title: string; instructions?: string; context?: unknown }): Promise<Request> { return (await post<{ request: Request }>(`/api/spaces/${q(spaceId)}/requests`, body)).request; }
export async function createJob(spaceId: string, body: { actorId: string; provider: string; evaluator: string; description: string; budget: string; deadline: string; requestId?: string }): Promise<{ status: string; job: Job; spaceBalance: string }> { return post(`/api/spaces/${q(spaceId)}/work`, body); }
export async function submitDeliverable(spaceId: string, jobId: string, body: { actorId: string; deliverableHash: string; evidenceUri?: string }): Promise<{ status: string; job: Job; spaceBalance: string }> { return post(`/api/spaces/${q(spaceId)}/work/${q(jobId)}/submit`, body); }
export async function evaluateJob(spaceId: string, jobId: string, evaluatorId: string, approved: boolean, feedback?: string): Promise<{ status: string; job: Job; receipt?: Receipt; gaiaRefund?: string; spaceBalance: string }> { return post(`/api/spaces/${q(spaceId)}/work/${q(jobId)}/evaluate`, { evaluatorId, approved, feedback }); }
export async function postVerdict(spaceId: string, jobId: string, adjudicatorId: string, approved: boolean, reason?: string): Promise<{ job: Job; receipt?: Receipt; gaiaRefund?: string }> { return post(`/api/spaces/${q(spaceId)}/work/${q(jobId)}/post-verdict`, { adjudicatorId, approved, reason }); }
export async function requestVerdict(spaceId: string, jobId: string, actorId: string): Promise<{ job: Job; case: { caseId: string; deliverableHash: string; evidenceUri?: string; rubricHash?: string } }> { return post(`/api/spaces/${q(spaceId)}/work/${q(jobId)}/request-verdict`, { actorId }); }
export function okLinkTxUrl(txHash: string): string { return `https://www.oklink.com/xlayer-testnet/tx/${txHash}`; }

// ---- M12 threshold governance ----
export async function fetchGovernanceConfig(spaceId: string, signal?: AbortSignal): Promise<GovernanceConfig> {
  return (await request<{ governance: GovernanceConfig }>(`/api/spaces/${q(spaceId)}/governance/payments`, { signal })).governance;
}
export async function configureGovernance(spaceId: string, body: { threshold: number; signerAllowlist: string[]; enabled?: boolean }): Promise<GovernanceConfig> {
  return (await post<{ governance: GovernanceConfig }>(`/api/spaces/${q(spaceId)}/governance/config`, body)).governance;
}
export async function createGovernancePayment(spaceId: string, body: { recipient: string; amount: string; deadline: string; memo?: string }): Promise<{ request: GovernanceRequest; typedData: Eip712TypedData }> {
  return post(`/api/spaces/${q(spaceId)}/governance/payments`, body);
}
export async function fetchGovernanceRequests(spaceId: string, status?: string, signal?: AbortSignal): Promise<GovernanceRequest[]> {
  const query = status ? `?status=${q(status)}` : "";
  return (await request<{ requests: GovernanceRequest[] }>(`/api/spaces/${q(spaceId)}/governance/requests${query}`, { signal })).requests;
}
export async function signGovernanceRequest(spaceId: string, requestId: string, signature: string): Promise<GovernanceRequest> {
  return (await post<{ request: GovernanceRequest }>(`/api/spaces/${q(spaceId)}/governance/requests/${q(requestId)}/sign`, { signature })).request;
}
export async function executeGovernanceRequest(spaceId: string, requestId: string): Promise<{ status: string; request: GovernanceRequest; receipt?: GovernanceRequest["receipt"]; spaceBalance: string }> {
  return post(`/api/spaces/${q(spaceId)}/governance/requests/${q(requestId)}/execute`, {});
}

// ---- M10 authority delegation (attenuation only) ----
export interface DelegationSubsetProof { valid: boolean; reasons: string[] }
export interface AuthorityDelegation {
  delegationId: string; spaceId: string; parentActor: string; child: string; parentRole: string; childRole: string;
  maxPerTransaction: string; dailyBudget: string; allowedCounterparties: string[]; asset: string; chainId: number;
  nonce: string; expiry: string; expiryAt: string; policySnapshotHash: string; digest: string;
  typedData?: Eip712TypedData; status: string; signature: string | null; signedBy: string | null;
  signedAt: string | null; revokedAt: string | null; revokedBy: string | null; createdAt: string;
}
export interface CreateDelegationInput {
  delegationId: string; child: string; childRole: string; maxPerTransaction: string; dailyBudget: string;
  allowedCounterparties: string[]; nonce: string; expiry: string; policySnapshotHash: string;
}
export async function fetchDelegations(spaceId: string, status?: string, signal?: AbortSignal): Promise<AuthorityDelegation[]> {
  const query = status ? `?status=${q(status)}` : "";
  return (await request<{ delegations: AuthorityDelegation[] }>(`/api/spaces/${q(spaceId)}/delegations${query}`, { signal })).delegations;
}
export async function createDelegation(spaceId: string, body: CreateDelegationInput): Promise<{ delegation: AuthorityDelegation; typedData: Eip712TypedData; proof: DelegationSubsetProof }> {
  return post(`/api/spaces/${q(spaceId)}/delegations`, body);
}
export async function signDelegation(spaceId: string, delegationId: string, signature: string, digest?: string): Promise<AuthorityDelegation> {
  return (await post<{ delegation: AuthorityDelegation }>(`/api/spaces/${q(spaceId)}/delegations/${q(delegationId)}/sign`, { signature, digest })).delegation;
}
export async function verifyDelegation(spaceId: string, delegationId: string): Promise<{ valid: boolean; delegationId: string; signer: string; digest: string; status: string }> {
  return (await post<{ verification: { valid: boolean; delegationId: string; signer: string; digest: string; status: string } }>(`/api/spaces/${q(spaceId)}/delegations/${q(delegationId)}/verify`, {})).verification;
}
export async function revokeDelegation(spaceId: string, delegationId: string): Promise<AuthorityDelegation> {
  return (await post<{ delegation: AuthorityDelegation }>(`/api/spaces/${q(spaceId)}/delegations/${q(delegationId)}/revoke`, {})).delegation;
}

// ---- M14 capability manifest + x402 v2 intent lifecycle ----
export interface CapabilityManifest {
  schema: string;
  space: { id: string; name: string; network: string; chainId: number; currency: string };
  capabilities: Record<string, { id: string }>;
  policy: {
    maxPerTransaction: string | null;
    dailyBudget: string | null;
    allowlist: { type: string; enabled: boolean };
  };
}
export interface X402Accept {
  scheme: string; network: string; amount: string; asset: string; payTo: string; maxTimeoutSeconds: number;
}
export interface X402PaymentRequired {
  x402Version: number;
  resource: { url: string };
  accepts: X402Accept[];
}
export interface X402Validation {
  valid: boolean; protocolValid: boolean; policyAllowed: boolean;
  selectedAccept: { amountDecimal: string; amount: string; asset: string; payTo: string; network: string; scheme: string; maxTimeoutSeconds: number } | null;
  reasons: string[];
  resource?: { url: string };
}
export interface X402Intent {
  intentId: string; spaceId: string; requesterAddress: string; amount: string; amountDecimal: string;
  asset: string; payTo: string; network: string; chainId: number; expiry: string; nonce: string;
  digest: string; status: string; resourceUrl?: string; receipt?: { txHash?: string } | null;
}
export async function fetchCapabilityManifest(spaceId: string, signal?: AbortSignal): Promise<CapabilityManifest> {
  return (await request<{ manifest: CapabilityManifest }>(`/api/spaces/${q(spaceId)}/capability-manifest`, { signal })).manifest;
}
export async function validateX402Intent(spaceId: string, body: { paymentRequired: X402PaymentRequired; selectedAcceptIndex: number; actorId: string; expectedAssetAddress: string }): Promise<X402Validation> {
  return (await post<{ validation: X402Validation }>(`/api/spaces/${q(spaceId)}/payments/x402/validate`, body)).validation;
}
export async function createX402Intent(spaceId: string, body: { paymentRequired: X402PaymentRequired; selectedAcceptIndex: number; expectedAssetAddress: string }): Promise<{ status: string; intent: X402Intent; typedData: Eip712TypedData }> {
  return post(`/api/spaces/${q(spaceId)}/payments/x402/intents`, body);
}
export async function signX402Intent(spaceId: string, intentId: string, signature: string, digest?: string): Promise<X402Intent> {
  return (await post<{ intent: X402Intent }>(`/api/spaces/${q(spaceId)}/payments/x402/intents/${q(intentId)}/sign`, { signature, digest })).intent;
}
export async function settleX402Intent(spaceId: string, intentId: string): Promise<X402Intent> {
  return (await post<{ intent: X402Intent }>(`/api/spaces/${q(spaceId)}/payments/x402/intents/${q(intentId)}/settle`, {})).intent;
}

// ---- M9 chain indexer status (read-only, honest when unconfigured) ----
export interface IndexerStatus {
  enabled: boolean;
  reason?: string;
  status?: string;
  error?: string;
  spaceId?: string;
  chainId?: number;
  contractAddress?: string;
  transport?: string;
  cursorKey?: string;
  fromBlock?: number;
  reorgDepth?: number;
  projectionCount?: number;
  cursor?: { blockNumber: number; txHash: string; logIndex: number } | null;
  reconciliation?: { status: string; error: string | null };
  projectedJobs?: Array<{ jobId: string; status: string; onchainJobId: string | null }>;
}
export async function fetchIndexerStatus(spaceId: string, signal?: AbortSignal): Promise<IndexerStatus> {
  return (await request<{ indexer: IndexerStatus }>(`/api/spaces/${q(spaceId)}/indexer`, { signal })).indexer;
}

// ---- M7 Boundary Sandbox: run a real scenario and report what actually happened ----
export type SandboxOutcome =
  | { allowed: true; status: number; job: Job; spaceBalance: string }
  | { allowed: false; status: number; code: string; message: string; reasons: string[]; denialProof: DenialProof | null };

/**
 * Creates (or refuses) a work order without throwing, so the sandbox can show a
 * judge the real API verdict — including the DenialProof — rather than a
 * prettified simulation.
 */
export async function probeWorkOrder(spaceId: string, body: {
  actorId: string; provider: string; evaluator: string; description: string; budget: string; deadline: string;
}): Promise<SandboxOutcome> {
  const response = await fetch(`${API_BASE}/api/spaces/${q(spaceId)}/work`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => null)) as
    | ({ status: string; job: Job; spaceBalance: string } & ApiError)
    | ApiError
    | null;
  if (response.ok) {
    const ok = payload as { status: string; job: Job; spaceBalance: string };
    return { allowed: true, status: response.status, job: ok.job, spaceBalance: ok.spaceBalance };
  }
  const failure = payload as ApiError;
  return {
    allowed: false,
    status: response.status,
    code: failure?.error?.code ?? "UNKNOWN",
    message: failure?.error?.message ?? `POST /work returned ${response.status}`,
    reasons: failure?.error?.details?.reasons ?? [],
    denialProof: failure?.error?.details?.denialProof ?? null,
  };
}
