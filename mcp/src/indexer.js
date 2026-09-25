import { createRequire } from "node:module";
import { createPublicClient, decodeEventLog, getEventSelector, http, parseAbiItem, webSocket } from "viem";
import { IndexedTermsNotApplicableError } from "./space-store.js";

const require = createRequire(import.meta.url);
const curatedAbis = require("../../packages/sdk/src/abis.json");
const jobCreatedFragment = curatedAbis.AgenticCommerce.find((entry) => entry.startsWith("event JobCreated("));
const providerSetFragment = curatedAbis.AgenticCommerce.find((entry) => entry.startsWith("event ProviderSet("));
const budgetSetFragment = curatedAbis.AgenticCommerce.find((entry) => entry.startsWith("event BudgetSet("));
const adjudicatorSetFragment = curatedAbis.AgenticCommerce.find((entry) => entry.startsWith("event AdjudicatorSet("));
const rubricSetFragment = curatedAbis.AgenticCommerce.find((entry) => entry.startsWith("event RubricSet("));
const evidenceAttachedFragment = curatedAbis.AgenticCommerce.find((entry) => entry.startsWith("event EvidenceAttached("));
const jobFundedFragment = curatedAbis.AgenticCommerce.find((entry) => entry.startsWith("event JobFunded("));
const jobSubmittedFragment = curatedAbis.AgenticCommerce.find((entry) => entry.startsWith("event JobSubmitted("));
const jobCompletedFragment = curatedAbis.AgenticCommerce.find((entry) => entry.startsWith("event JobCompleted("));
const jobRejectedFragment = curatedAbis.AgenticCommerce.find((entry) => entry.startsWith("event JobRejected("));
const jobExpiredFragment = curatedAbis.AgenticCommerce.find((entry) => entry.startsWith("event JobExpired("));
const refundedFragment = curatedAbis.AgenticCommerce.find((entry) => entry.startsWith("event Refunded("));
const adjudicationRequestedFragment = curatedAbis.AgenticCommerce.find((entry) => entry.startsWith("event AdjudicationRequested("));
const adjudicationResolvedFragment = curatedAbis.AgenticCommerce.find((entry) => entry.startsWith("event AdjudicationResolved("));
const attestedJobSettlementFragment = curatedAbis.AgenticCommerce.find((entry) => entry.startsWith("event AttestedJobSettlement("));
if (!jobCreatedFragment || !providerSetFragment || !budgetSetFragment || !adjudicatorSetFragment || !rubricSetFragment || !evidenceAttachedFragment || !jobFundedFragment || !jobSubmittedFragment || !jobCompletedFragment || !jobRejectedFragment || !jobExpiredFragment || !refundedFragment || !adjudicationRequestedFragment || !adjudicationResolvedFragment || !attestedJobSettlementFragment) throw new Error("Curated AgenticCommerce ABI is missing indexed job events");
export const JOB_CREATED_ABI = parseAbiItem(jobCreatedFragment);
export const PROVIDER_SET_ABI = parseAbiItem(providerSetFragment);
export const BUDGET_SET_ABI = parseAbiItem(budgetSetFragment);
export const ADJUDICATOR_SET_ABI = parseAbiItem(adjudicatorSetFragment);
export const RUBRIC_SET_ABI = parseAbiItem(rubricSetFragment);
export const EVIDENCE_ATTACHED_ABI = parseAbiItem(evidenceAttachedFragment);
export const JOB_FUNDED_ABI = parseAbiItem(jobFundedFragment);
export const JOB_SUBMITTED_ABI = parseAbiItem(jobSubmittedFragment);
export const JOB_COMPLETED_ABI = parseAbiItem(jobCompletedFragment);
export const JOB_REJECTED_ABI = parseAbiItem(jobRejectedFragment);
export const JOB_EXPIRED_ABI = parseAbiItem(jobExpiredFragment);
export const REFUNDED_ABI = parseAbiItem(refundedFragment);
export const ADJUDICATION_REQUESTED_ABI = parseAbiItem(adjudicationRequestedFragment);
export const ADJUDICATION_RESOLVED_ABI = parseAbiItem(adjudicationResolvedFragment);
export const ATTESTED_JOB_SETTLEMENT_ABI = parseAbiItem(attestedJobSettlementFragment);

const eventAbis = {
  JobCreated: JOB_CREATED_ABI,
  ProviderSet: PROVIDER_SET_ABI,
  BudgetSet: BUDGET_SET_ABI,
  AdjudicatorSet: ADJUDICATOR_SET_ABI,
  RubricSet: RUBRIC_SET_ABI,
  EvidenceAttached: EVIDENCE_ATTACHED_ABI,
  JobFunded: JOB_FUNDED_ABI,
  JobSubmitted: JOB_SUBMITTED_ABI,
  JobCompleted: JOB_COMPLETED_ABI,
  JobRejected: JOB_REJECTED_ABI,
  JobExpired: JOB_EXPIRED_ABI,
  Refunded: REFUNDED_ABI,
  AdjudicationRequested: ADJUDICATION_REQUESTED_ABI,
  AdjudicationResolved: ADJUDICATION_RESOLVED_ABI,
  AttestedJobSettlement: ATTESTED_JOB_SETTLEMENT_ABI,
};

const indexedEventNames = new Set(Object.keys(eventAbis));

function addressKey(value) {
  return String(value).toLowerCase();
}

export function indexerCursorKey(chainId, contractAddress) {
  return `${Number(chainId)}:${addressKey(contractAddress)}`;
}

function logPosition(log) {
  const position = {
    blockNumber: Number(log.blockNumber),
    txHash: String(log.transactionHash || log.txHash).toLowerCase(),
    logIndex: Number(log.logIndex),
  };
  if (log.blockHash) position.blockHash = String(log.blockHash).toLowerCase();
  return position;
}

function normalizeTransport(transport) {
  const value = String(transport || "http").toLowerCase();
  if (["http", "https"].includes(value)) return "http";
  if (["ws", "wss", "websocket"].includes(value)) return "websocket";
  throw new Error("JobCreatedIndexer transport must be http or websocket");
}

function websocketEndpoint(rpcUrl, webSocketUrl) {
  const endpoint = String(webSocketUrl || rpcUrl || "");
  if (!endpoint) throw new Error("JobCreatedIndexer WebSocket transport requires a URL");
  return endpoint.replace(/^http:/i, "ws:").replace(/^https:/i, "wss:");
}

function publicError(error) {
  const name = typeof error?.name === "string" && /^[A-Za-z][A-Za-z0-9]*$/.test(error.name) ? error.name : "Error";
  const message = String(error?.message || "Reconciliation failed")
    .replace(/\b(?:https?|wss?):\/\/[^\s"'<>]+/gi, "[redacted endpoint]")
    .replace(/((?:api[-_]?key|access[-_]?token|token|secret|password|authorization)\s*[:=]\s*)[^\s,;]+/gi, "$1[redacted]");
  return { name, message: message.slice(0, 1000) };
}

function cloneValue(value) {
  return structuredClone(value);
}

function samePosition(a, b) {
  return a.blockNumber === b.blockNumber && a.txHash === b.txHash && a.logIndex === b.logIndex;
}

function conflictingPosition(a, b) {
  return a.blockNumber === b.blockNumber && a.txHash !== b.txHash && a.logIndex === b.logIndex;
}

function orderedLogs(logs) {
  return [...logs].sort((a, b) => {
    const byBlock = Number(a.blockNumber) - Number(b.blockNumber);
    if (byBlock !== 0) return byBlock;
    return Number(a.logIndex) - Number(b.logIndex);
  });
}

function eventName(log) {
  if (log.eventName) {
    if (!indexedEventNames.has(log.eventName)) {
      throw new Error(`Unsupported indexed event '${log.eventName}'`);
    }
    return log.eventName;
  }
  if (log.data && log.topics) {
    for (const [name, abi] of Object.entries(eventAbis)) {
      if (log.topics[0] === getEventSelector(abi)) return name;
    }
  }
  throw new Error("Indexed log is missing a recognized event name or topic");
}

function eventArgs(log, name) {
  const abi = eventAbis[name];
  const args = log.data && log.topics
    ? decodeEventLog({ abi: [abi], data: log.data, topics: log.topics }).args
    : log.args;
  if (!args) throw new Error(`${name} log is missing raw event data`);
  if (!Array.isArray(args)) return args;
  if (name === "JobCreated") {
    const [jobId, client, evaluator, provider, description, expiredAt] = args;
    return { jobId, client, evaluator, provider, description, expiredAt };
  }
  if (name === "ProviderSet") {
    const [jobId, provider] = args;
    return { jobId, provider };
  }
  if (name === "BudgetSet") {
    const [jobId, amount] = args;
    return { jobId, amount };
  }
  if (name === "AdjudicatorSet") {
    const [jobId, adjudicator] = args;
    return { jobId, adjudicator };
  }
  if (name === "RubricSet") {
    const [jobId, rubricHash] = args;
    return { jobId, rubricHash };
  }
  if (name === "EvidenceAttached") {
    const [jobId, deliverableHash] = args;
    return { jobId, deliverableHash };
  }
  if (name === "JobFunded") {
    const [jobId, amount] = args;
    return { jobId, amount };
  }
  if (name === "JobSubmitted") {
    const [jobId, deliverableHash] = args;
    return { jobId, deliverableHash };
  }
  if (name === "JobCompleted") {
    const [jobId, reason] = args;
    return { jobId, reason };
  }
  if (name === "JobRejected") {
    const [jobId, rejector, reason] = args;
    return { jobId, rejector, reason };
  }
  if (name === "JobExpired") {
    const [jobId] = args;
    return { jobId };
  }
  if (name === "Refunded") {
    const [jobId, client, amount] = args;
    return { jobId, client, amount };
  }
  if (name === "AdjudicationRequested") {
    const [jobId, adjudicator, caseId] = args;
    return { jobId, adjudicator, caseId };
  }
  if (name === "AdjudicationResolved") {
    const [jobId, adjudicator, approve, reason] = args;
    return { jobId, adjudicator, approve, reason };
  }
  const [jobId, provider, amount, nonce] = args;
  return { jobId, provider, amount, nonce };
}

export class JobCreatedIndexer {
  constructor({ store, chainId, contractAddress, rpcUrl, webSocketUrl = null, transport = null, client, transportType = null, spaceId = "space-procurement-001", fromBlock = 0, reorgDepth = 8, dataPath = null, persist = null }) {
    if (!store) throw new Error("JobCreatedIndexer requires a SpaceStore");
    if (!Number.isInteger(Number(chainId))) throw new Error("JobCreatedIndexer requires an integer chainId");
    if (!/^0x[0-9a-fA-F]{40}$/.test(String(contractAddress || ""))) throw new Error("JobCreatedIndexer requires a contract address");
    if (!Number.isInteger(Number(reorgDepth)) || Number(reorgDepth) < 1) throw new Error("JobCreatedIndexer requires a positive reorgDepth");
    this.store = store;
    this.chainId = Number(chainId);
    this.contractAddress = addressKey(contractAddress);
    this.spaceId = spaceId;
    this.fromBlock = Number(fromBlock);
    this.reorgDepth = Number(reorgDepth);
    this.dataPath = dataPath;
    this.persist = persist;
    this.cursorKey = indexerCursorKey(this.chainId, this.contractAddress);
    const selectedTransport = transport === null || transport === undefined
      ? normalizeTransport(/^wss?:/i.test(String(rpcUrl || "")) ? "websocket" : "http")
      : normalizeTransport(transport);
    // an explicit transportType lets a production caller inject a wrapped client
    // (for example an HTTP client that chunks getLogs) without mislabelling it
    this.transportType = transportType || (client ? "injected" : selectedTransport);
    this.client = client || this.createClient({ rpcUrl, webSocketUrl, transport: selectedTransport });
    const savedState = this.store.indexerReconciliations?.get(this.cursorKey);
    this.reconciliation = savedState ? cloneValue(savedState) : { status: "RECONCILED", error: null };
  }

  createClient({ rpcUrl, webSocketUrl, transport }) {
    const endpoint = transport === "websocket" ? websocketEndpoint(rpcUrl, webSocketUrl) : String(rpcUrl || "");
    if (!endpoint) throw new Error("JobCreatedIndexer requires an RPC URL");
    const defaultRpcUrls = { http: [endpoint] };
    if (transport === "websocket") {
      defaultRpcUrls.http = [String(rpcUrl || endpoint).replace(/^ws:/i, "http:").replace(/^wss:/i, "https:")];
      defaultRpcUrls.webSocket = [endpoint];
    }
    return createPublicClient({
      chain: {
        id: this.chainId,
        name: `chain-${this.chainId}`,
        nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
        rpcUrls: { default: defaultRpcUrls },
      },
      transport: transport === "websocket" ? webSocket(endpoint) : http(endpoint),
    });
  }

  getCursor() {
    const cursor = this.store.indexerCursors.get(this.cursorKey);
    return cursor ? { ...cursor } : null;
  }

  getReconciliationState() {
    return cloneValue(this.reconciliation);
  }

  setReconciliationState(status, error = null) {
    this.reconciliation = { status, error: error ? publicError(error) : null };
    if (this.store.indexerReconciliations) this.store.indexerReconciliations.set(this.cursorKey, cloneValue(this.reconciliation));
  }

  async checkpoint() {
    if (this.persist) {
      await this.persist(this.store);
      return;
    }
    if (this.dataPath) {
      const { save } = await import("../../packages/server/src/persist.js");
      save(this.store, this.dataPath);
    }
  }

  isIndexedProjection(value) {
    return value?.source === "onchain" && Number(value.chainId) === this.chainId && addressKey(value.contractAddress || "") === this.contractAddress;
  }

  captureReorgSnapshot(position) {
    const jobs = [...this.store.jobs.entries()]
      .filter(([, job]) => this.isIndexedProjection(job))
      .map(([jobId, job]) => [jobId, cloneValue(job)]);
    const activity = [];
    for (const [spaceId, entries] of this.store.activity.entries()) {
      entries.forEach((entry, index) => {
        if (this.isIndexedProjection(entry)) activity.push({ spaceId, index, entry: cloneValue(entry) });
      });
    }
    const snapshots = this.store.indexerReorgSnapshots.get(this.cursorKey) || [];
    const snapshot = { blockNumber: position.blockNumber, blockHash: position.blockHash, cursor: this.getCursor(), jobs, activity };
    const retained = snapshots.filter((entry) => entry.blockNumber < position.blockNumber);
    retained.push(snapshot);
    this.store.indexerReorgSnapshots.set(this.cursorKey, retained.filter((entry) => entry.blockNumber >= Math.max(0, position.blockNumber - this.reorgDepth)));
  }

  restoreReorgSnapshot(snapshot) {
    for (const [jobId, job] of this.store.jobs.entries()) {
      if (this.isIndexedProjection(job)) this.store.jobs.delete(jobId);
    }
    for (const [spaceId, entries] of this.store.activity.entries()) {
      this.store.activity.set(spaceId, entries.filter((entry) => !this.isIndexedProjection(entry)));
    }
    if (!snapshot) {
      this.store.indexerCursors.delete(this.cursorKey);
      this.store.indexerReorgSnapshots.set(this.cursorKey, []);
      return;
    }
    for (const [jobId, job] of snapshot.jobs) this.store.jobs.set(jobId, cloneValue(job));
    for (const record of snapshot.activity) {
      const entries = this.store.activity.get(record.spaceId) || [];
      entries[record.index] = cloneValue(record.entry);
      this.store.activity.set(record.spaceId, entries);
    }
    this.store.indexerCursors.set(this.cursorKey, cloneValue(snapshot.cursor));
    this.store.indexerReorgSnapshots.set(this.cursorKey, cloneValue((this.store.indexerReorgSnapshots.get(this.cursorKey) || []).filter((entry) => entry.blockNumber <= snapshot.blockNumber)));
  }

  async detectReorg(cursor, endBlock) {
    if (!cursor?.blockHash || endBlock < cursor.blockNumber || typeof this.client.getBlock !== "function") return null;
    const block = await this.client.getBlock({ blockNumber: BigInt(cursor.blockNumber) });
    if (!block?.hash || String(block.hash).toLowerCase() === cursor.blockHash) return null;
    const safeBlock = Math.max(this.fromBlock, cursor.blockNumber - this.reorgDepth);
    const candidates = (this.store.indexerReorgSnapshots.get(this.cursorKey) || [])
      .filter((entry) => entry.blockNumber <= safeBlock)
      .toReversed();
    let snapshot = null;
    for (const candidate of candidates) {
      const safeBlockRecord = await this.client.getBlock({ blockNumber: BigInt(candidate.blockNumber) });
      if (safeBlockRecord?.hash && String(safeBlockRecord.hash).toLowerCase() === candidate.blockHash) {
        snapshot = candidate;
        break;
      }
    }
    this.restoreReorgSnapshot(snapshot);
    return { detected: true, safeBlock, replayFromBlock: snapshot ? safeBlock : this.fromBlock, previousBlockNumber: cursor.blockNumber, canonicalBlockHash: String(block.hash).toLowerCase() };
  }

  async sync({ fromBlock, toBlock } = {}) {
    this.setReconciliationState("RECONCILING");
    try {
      await this.checkpoint();
      const persistedCursor = this.getCursor();
      const end = toBlock === undefined ? Number(await this.client.getBlockNumber()) : Number(toBlock);
      const reorg = fromBlock === undefined ? await this.detectReorg(persistedCursor, end) : null;
      const cursor = this.getCursor();
      const start = fromBlock === undefined ? reorg?.replayFromBlock ?? cursor?.blockNumber ?? this.fromBlock : Number(fromBlock);
      if (!Number.isInteger(start) || start < 0 || !Number.isInteger(end) || end < start) {
        throw new Error("Invalid JobCreated indexer block range");
      }

      const logs = await this.client.getLogs({
        address: this.contractAddress,
        events: Object.values(eventAbis),
        fromBlock: BigInt(start),
        toBlock: BigInt(end),
      });
      const canonicalLogs = orderedLogs(logs);
      for (let index = 1; index < canonicalLogs.length; index += 1) {
        if (conflictingPosition(logPosition(canonicalLogs[index - 1]), logPosition(canonicalLogs[index]))) {
          throw new Error("Indexed logs contain conflicting positions in the canonical ordering");
        }
      }
      let processed = 0;
      let skipped = 0;
      // Terms events that name a job past Open are legal history, not a
      // corrupt projection. They are recorded here with their reason so the
      // operator can audit them, and the cursor still advances past them.
      const inapplicable = [];

      for (const log of canonicalLogs) {
        const position = logPosition(log);
        if (reorg && position.blockNumber <= reorg.safeBlock) {
          this.store.indexerCursors.set(this.cursorKey, position);
          this.captureReorgSnapshot(position);
          skipped += 1;
          continue;
        }
        const replaying = Boolean(reorg);
        if (!replaying && cursor && conflictingPosition(position, cursor)) {
          throw new Error("Indexed log conflicts with the persisted chainId:contract cursor");
        }
        if (!replaying && cursor && (position.blockNumber < cursor.blockNumber || (position.blockNumber === cursor.blockNumber && !samePosition(position, cursor) && position.logIndex <= cursor.logIndex))) {
          skipped += 1;
          continue;
        }
        if (!replaying && cursor && samePosition(position, cursor)) {
          if (!cursor.blockHash && position.blockHash) {
            this.store.indexerCursors.set(this.cursorKey, position);
            this.captureReorgSnapshot(position);
            await this.checkpoint();
          }
          skipped += 1;
          continue;
        }

        const name = eventName(log);
        const args = eventArgs(log, name);
        const common = {
          spaceId: this.spaceId,
          chainId: this.chainId,
          contractAddress: this.contractAddress,
          onchainJobId: args.jobId,
          blockNumber: position.blockNumber,
          txHash: position.txHash,
          logIndex: position.logIndex,
        };
        try {
          if (name === "JobCreated") {
            this.store.upsertIndexedJob({
              ...common,
              client: args.client,
              provider: args.provider,
              evaluator: args.evaluator,
              description: args.description,
              expiredAt: args.expiredAt,
            });
          } else if (name === "ProviderSet") {
            this.store.setProviderIndexedJob({ ...common, provider: args.provider });
          } else if (name === "BudgetSet") {
            this.store.setBudgetIndexedJob({ ...common, amount: args.amount });
          } else if (name === "AdjudicatorSet") {
            this.store.setAdjudicatorIndexedJob({ ...common, adjudicator: args.adjudicator });
          } else if (name === "RubricSet") {
            this.store.setRubricIndexedJob({ ...common, rubricHash: args.rubricHash });
          } else if (name === "EvidenceAttached") {
            this.store.recordIndexedEvidenceAttached({ ...common, deliverableHash: args.deliverableHash });
          } else if (name === "JobFunded") {
            this.store.fundIndexedJob({ ...common, amount: args.amount });
          } else if (name === "JobSubmitted") {
            this.store.submitIndexedJob({ ...common, deliverableHash: args.deliverableHash });
          } else if (name === "JobCompleted") {
            this.store.completeIndexedJob({ ...common, reason: args.reason });
          } else if (name === "JobRejected") {
            this.store.rejectIndexedJob({ ...common, rejector: args.rejector, reason: args.reason });
          } else if (name === "JobExpired") {
            this.store.expireIndexedJob(common);
          } else if (name === "Refunded") {
            this.store.recordIndexedRefund({ ...common, client: args.client, amount: args.amount });
          } else if (name === "AdjudicationRequested") {
            this.store.requestAdjudicationIndexedJob({ ...common, adjudicator: args.adjudicator, caseId: args.caseId });
          } else if (name === "AdjudicationResolved") {
            this.store.resolveAdjudicationIndexedJob({ ...common, adjudicator: args.adjudicator, approve: args.approve, reason: args.reason });
          } else {
            this.store.recordIndexedAttestedSettlement({ ...common, provider: args.provider, amount: args.amount, nonce: args.nonce });
          }
        } catch (reason) {
          // Only a terms event landing on a non-Open job is tolerated here.
          // Any other failure is an integrity error and aborts the sync so
          // the cursor never advances past unapplied state.
          if (!(reason instanceof IndexedTermsNotApplicableError)) throw reason;
          inapplicable.push({
            event: name,
            onchainJobId: String(args.jobId ?? ""),
            fromStatus: reason.fromStatus,
            blockNumber: position.blockNumber,
            txHash: position.txHash,
            logIndex: position.logIndex,
          });
        }
        this.store.indexerCursors.set(this.cursorKey, position);
        this.captureReorgSnapshot(position);
        await this.checkpoint();
        processed += 1;
      }

      this.setReconciliationState("RECONCILED");
      await this.checkpoint();
      return {
        fromBlock: start,
        toBlock: end,
        processed,
        skipped,
        inapplicable,
        cursor: this.getCursor(),
        reorg,
      };
    } catch (error) {
      this.setReconciliationState("RECONCILING", error);
      try {
        await this.checkpoint();
      } catch {}
      throw error;
    }
  }

  runOnce(options) {
    return this.sync(options);
  }
}

export class IndexerRunLoop {
  constructor({ sync, intervalMs = 1000 }) {
    if (typeof sync !== "function") throw new Error("IndexerRunLoop requires a sync function");
    if (!Number.isInteger(intervalMs) || intervalMs < 0) throw new Error("IndexerRunLoop requires a non-negative intervalMs");
    this.sync = sync;
    this.intervalMs = intervalMs;
    this.mode = "polling";
    this.stopped = true;
    this.loopPromise = null;
    this.wake = null;
  }

  start() {
    if (!this.loopPromise) {
      this.stopped = false;
      this.loopPromise = this.runLoop();
    }
    return this;
  }

  async stop() {
    this.stopped = true;
    if (this.wake) this.wake();
    const loopPromise = this.loopPromise;
    if (loopPromise) await loopPromise;
    if (this.loopPromise === loopPromise) this.loopPromise = null;
  }

  async runLoop() {
    while (!this.stopped) {
      try {
        await this.sync();
      } catch {
        if (this.stopped) break;
      }
      if (!this.stopped && this.intervalMs > 0) {
        await new Promise((resolve) => {
          const timer = setTimeout(() => {
            this.wake = null;
            resolve();
          }, this.intervalMs);
          timer.unref?.();
          this.wake = () => {
            clearTimeout(timer);
            resolve();
          };
        });
      }
    }
  }
}

export const AgenticCommerceJobCreatedIndexer = JobCreatedIndexer;
