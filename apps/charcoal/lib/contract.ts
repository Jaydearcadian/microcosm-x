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
