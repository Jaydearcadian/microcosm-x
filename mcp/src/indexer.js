import { createRequire } from "node:module";
import { createPublicClient, decodeEventLog, http, parseAbiItem } from "viem";

const require = createRequire(import.meta.url);
const curatedAbis = require("../../packages/sdk/src/abis.json");
const jobCreatedFragment = curatedAbis.AgenticCommerce.find((entry) => entry.startsWith("event JobCreated("));
export const JOB_CREATED_ABI = parseAbiItem(jobCreatedFragment);

function addressKey(value) {
  return String(value).toLowerCase();
}

export function indexerCursorKey(chainId, contractAddress) {
  return `${Number(chainId)}:${addressKey(contractAddress)}`;
}

function logPosition(log) {
  return {
    blockNumber: Number(log.blockNumber),
    txHash: String(log.transactionHash || log.txHash).toLowerCase(),
    logIndex: Number(log.logIndex),
  };
}

function samePosition(a, b) {
  return a.blockNumber === b.blockNumber && a.txHash === b.txHash && a.logIndex === b.logIndex;
}

function orderedLogs(logs) {
  return [...logs].sort((a, b) => {
    const byBlock = Number(a.blockNumber) - Number(b.blockNumber);
    if (byBlock !== 0) return byBlock;
    return Number(a.logIndex) - Number(b.logIndex);
  });
}

function eventArgs(log) {
  const args = log.data && log.topics
    ? decodeEventLog({ abi: [JOB_CREATED_ABI], data: log.data, topics: log.topics }).args
    : log.args;
  if (!args) throw new Error("JobCreated log is missing raw event data");
  if (!Array.isArray(args)) return args;
  const [jobId, client, evaluator, provider, description, expiredAt] = args;
  return { jobId, client, evaluator, provider, description, expiredAt };
}

export class JobCreatedIndexer {
  constructor({ store, chainId, contractAddress, rpcUrl, client, spaceId = "space-procurement-001", fromBlock = 0, dataPath = null, persist = null }) {
    if (!store) throw new Error("JobCreatedIndexer requires a SpaceStore");
    if (!Number.isInteger(Number(chainId))) throw new Error("JobCreatedIndexer requires an integer chainId");
    if (!/^0x[0-9a-fA-F]{40}$/.test(String(contractAddress || ""))) throw new Error("JobCreatedIndexer requires a contract address");
    this.store = store;
    this.chainId = Number(chainId);
    this.contractAddress = addressKey(contractAddress);
    this.spaceId = spaceId;
    this.fromBlock = Number(fromBlock);
    this.dataPath = dataPath;
    this.persist = persist;
    this.cursorKey = indexerCursorKey(this.chainId, this.contractAddress);
    this.client = client || createPublicClient({
      chain: {
        id: this.chainId,
        name: `chain-${this.chainId}`,
        nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
        rpcUrls: { default: { http: [rpcUrl] } },
      },
      transport: http(rpcUrl),
    });
  }

  getCursor() {
    const cursor = this.store.indexerCursors.get(this.cursorKey);
    return cursor ? { ...cursor } : null;
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

  async sync({ fromBlock, toBlock } = {}) {
    const cursor = this.getCursor();
    const start = fromBlock === undefined ? cursor?.blockNumber ?? this.fromBlock : Number(fromBlock);
    const end = toBlock === undefined ? Number(await this.client.getBlockNumber()) : Number(toBlock);
    if (!Number.isInteger(start) || start < 0 || !Number.isInteger(end) || end < start) {
      throw new Error("Invalid JobCreated indexer block range");
    }

    const logs = await this.client.getLogs({
      address: this.contractAddress,
      event: JOB_CREATED_ABI,
      fromBlock: BigInt(start),
      toBlock: BigInt(end),
    });
    let processed = 0;
    let skipped = 0;

    for (const log of orderedLogs(logs)) {
      const position = logPosition(log);
      if (cursor && (position.blockNumber < cursor.blockNumber || (position.blockNumber === cursor.blockNumber && !samePosition(position, cursor) && position.logIndex <= cursor.logIndex))) {
        skipped += 1;
        continue;
      }
      if (cursor && samePosition(position, cursor)) {
        skipped += 1;
        continue;
      }

      const args = eventArgs(log);
      this.store.upsertIndexedJob({
        spaceId: this.spaceId,
        chainId: this.chainId,
        contractAddress: this.contractAddress,
        onchainJobId: args.jobId,
        client: args.client,
        provider: args.provider,
        evaluator: args.evaluator,
        description: args.description,
        expiredAt: args.expiredAt,
        blockNumber: position.blockNumber,
        txHash: position.txHash,
        logIndex: position.logIndex,
      });
      this.store.indexerCursors.set(this.cursorKey, position);
      await this.checkpoint();
      processed += 1;
    }

    return {
      fromBlock: start,
      toBlock: end,
      processed,
      skipped,
      cursor: this.getCursor(),
    };
  }

  runOnce(options) {
    return this.sync(options);
  }
}

export const AgenticCommerceJobCreatedIndexer = JobCreatedIndexer;
