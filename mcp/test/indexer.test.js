import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createPublicClient, decodeEventLog, http } from "viem";
import { SpaceStore } from "../src/space-store.js";
import { JOB_CREATED_ABI, JobCreatedIndexer } from "../src/indexer.js";
import { ensureChain } from "./helpers/chain.mjs";
import { load, save } from "../../packages/server/src/persist.js";

let chain;
let publicClient;

function cast(...args) {
  return execFileSync("cast", args, { encoding: "utf8" }).trim();
}

async function createJob(description) {
  const expiry = String(Math.floor(Date.now() / 1000) + 86_400);
  const output = cast("send", chain.contracts.AgenticCommerce, "createJob(address,address,uint256,string)", chain.addrs.provider, chain.addrs.deployer, expiry, description, "--private-key", chain.keys.deployer, "--rpc-url", chain.rpc);
  const match = output.match(/transaction\s*hash\s*:?\s*(0x[0-9a-fA-F]{64})/i);
  if (!match) throw new Error(`Could not parse createJob transaction hash from cast output: ${output}`);
  const receipt = await publicClient.getTransactionReceipt({ hash: match[1] });
  const created = receipt.logs.map((log) => decodeEventLog({ abi: [JOB_CREATED_ABI], ...log })).find((log) => log.eventName === "JobCreated");
  if (!created) throw new Error('createJob receipt did not contain JobCreated');
  return Number(created.args[0]);
}

function fundJob(jobId, amount) {
  cast("send", chain.contracts.AgenticCommerce, "setBudget(uint256,uint256)", String(jobId), String(amount), "--private-key", chain.keys.deployer, "--rpc-url", chain.rpc);
  cast("send", chain.contracts.MockERC20, "approve(address,uint256)", chain.contracts.AgenticCommerce, String(amount), "--private-key", chain.keys.deployer, "--rpc-url", chain.rpc);
  cast("send", chain.contracts.AgenticCommerce, "fund(uint256,uint256)", String(jobId), String(amount), "--private-key", chain.keys.deployer, "--rpc-url", chain.rpc);
}

const indexedContract = "0x4444444444444444444444444444444444444444";
const spaceId = "space-procurement-001";

function createdLog({ jobId = 7n, provider = "0x3333333333333333333333333333333333333333", blockNumber = 10, logIndex = 0, txDigit = "1" } = {}) {
  return {
    eventName: "JobCreated",
    blockNumber,
    transactionHash: `0x${txDigit.repeat(64)}`,
    logIndex,
    args: {
      jobId,
      client: "0x1111111111111111111111111111111111111111",
      evaluator: "0x2222222222222222222222222222222222222222",
      provider,
      description: "indexed work",
      expiredAt: 2_000_000_000n,
    },
  };
}

function fundedLog({ jobId = 7n, amount = 123_456_789n, blockNumber = 10, logIndex = 1, txDigit = "2" } = {}) {
  return {
    eventName: "JobFunded",
    blockNumber,
    transactionHash: `0x${txDigit.repeat(64)}`,
    logIndex,
    args: { jobId, amount },
  };
}

function providerSetLog({ jobId = 7n, provider = "0x6666666666666666666666666666666666666666", blockNumber = 10, logIndex = 1, txDigit = "c" } = {}) {
  return {
    eventName: "ProviderSet",
    blockNumber,
    transactionHash: `0x${txDigit.repeat(64)}`,
    logIndex,
    args: { jobId, provider },
  };
}

function budgetSetLog({ jobId = 7n, amount = 123_456_789n, blockNumber = 10, logIndex = 2, txDigit = "d" } = {}) {
  return {
    eventName: "BudgetSet",
    blockNumber,
    transactionHash: `0x${txDigit.repeat(64)}`,
    logIndex,
    args: { jobId, amount },
  };
}

function adjudicatorSetLog({ jobId = 7n, adjudicator = "0x5555555555555555555555555555555555555555", blockNumber = 10, logIndex = 3, txDigit = "e" } = {}) {
  return {
    eventName: "AdjudicatorSet",
    blockNumber,
    transactionHash: `0x${txDigit.repeat(64)}`,
    logIndex,
    args: { jobId, adjudicator },
  };
}

function rubricSetLog({ jobId = 7n, rubricHash = `0x${"b".repeat(64)}`, blockNumber = 10, logIndex = 4, txDigit = "f" } = {}) {
  return {
    eventName: "RubricSet",
    blockNumber,
    transactionHash: `0x${txDigit.repeat(64)}`,
    logIndex,
    args: { jobId, rubricHash },
  };
}

function evidenceAttachedLog({ jobId = 7n, deliverableHash = `0x${"a".repeat(64)}`, blockNumber = 10, logIndex = 7, txDigit = "1" } = {}) {
  return {
    eventName: "EvidenceAttached",
    blockNumber,
    transactionHash: `0x${txDigit.repeat(64)}`,
    logIndex,
    args: { jobId, deliverableHash },
  };
}

function submittedLog({ jobId = 7n, deliverableHash = `0x${"a".repeat(64)}`, blockNumber = 10, logIndex = 2, txDigit = "3" } = {}) {
  return {
    eventName: "JobSubmitted",
    blockNumber,
    transactionHash: `0x${txDigit.repeat(64)}`,
    logIndex,
    args: { jobId, deliverableHash },
  };
}

function adjudicationLog({ jobId = 7n, adjudicator = "0x5555555555555555555555555555555555555555", caseId = `0x${"c".repeat(64)}`, blockNumber = 10, logIndex = 3, txDigit = "4" } = {}) {
  return {
    eventName: "AdjudicationRequested",
    blockNumber,
    transactionHash: `0x${txDigit.repeat(64)}`,
    logIndex,
    args: { jobId, adjudicator, caseId },
  };
}

function completedLog({ jobId = 7n, reason = `0x${"d".repeat(64)}`, blockNumber = 10, logIndex = 3, txDigit = "5" } = {}) {
  return {
    eventName: "JobCompleted",
    blockNumber,
    transactionHash: `0x${txDigit.repeat(64)}`,
    logIndex,
    args: { jobId, reason },
  };
}

function rejectedLog({ jobId = 7n, rejector = "0x2222222222222222222222222222222222222222", reason = `0x${"e".repeat(64)}`, blockNumber = 10, logIndex = 2, txDigit = "6" } = {}) {
  return {
    eventName: "JobRejected",
    blockNumber,
    transactionHash: `0x${txDigit.repeat(64)}`,
    logIndex,
    args: { jobId, rejector, reason },
  };
}

function expiredLog({ jobId = 7n, blockNumber = 10, logIndex = 2, txDigit = "7" } = {}) {
  return {
    eventName: "JobExpired",
    blockNumber,
    transactionHash: `0x${txDigit.repeat(64)}`,
    logIndex,
    args: { jobId },
  };
}

function refundedLog({ jobId = 7n, client = "0x1111111111111111111111111111111111111111", amount = 123_456_789n, blockNumber = 10, logIndex = 2, txDigit = "8" } = {}) {
  return {
    eventName: "Refunded",
    blockNumber,
    transactionHash: `0x${txDigit.repeat(64)}`,
    logIndex,
    args: { jobId, client, amount },
  };
}

function resolvedLog({ jobId = 7n, adjudicator = "0x5555555555555555555555555555555555555555", approve = true, reason = `0x${"a".repeat(64)}`, blockNumber = 10, logIndex = 5, txDigit = "9" } = {}) {
  return {
    eventName: "AdjudicationResolved",
    blockNumber,
    transactionHash: `0x${txDigit.repeat(64)}`,
    logIndex,
    args: { jobId, adjudicator, approve, reason },
  };
}

function attestedSettlementLog({ jobId = 7n, provider = "0x3333333333333333333333333333333333333333", amount = 123_456_789n, nonce = 41n, blockNumber = 10, logIndex = 3, txDigit = "b" } = {}) {
  return {
    eventName: "AttestedJobSettlement",
    blockNumber,
    transactionHash: `0x${txDigit.repeat(64)}`,
    logIndex,
    args: { jobId, provider, amount, nonce },
  };
}

function addOpenIndexedJob(store, log = createdLog()) {
  return store.upsertIndexedJob({
    spaceId,
    chainId: 1952,
    contractAddress: indexedContract,
    onchainJobId: log.args.jobId,
    client: log.args.client,
    provider: log.args.provider,
    evaluator: log.args.evaluator,
    description: log.args.description,
    expiredAt: log.args.expiredAt,
    blockNumber: log.blockNumber,
    txHash: log.transactionHash,
    logIndex: log.logIndex,
  });
}

function addFundedIndexedJob(store, created = createdLog(), funded = fundedLog()) {
  addOpenIndexedJob(store, created);
  return store.fundIndexedJob({
    spaceId,
    chainId: 1952,
    contractAddress: indexedContract,
    onchainJobId: funded.args.jobId,
    amount: funded.args.amount,
    blockNumber: funded.blockNumber,
    txHash: funded.transactionHash,
    logIndex: funded.logIndex,
  });
}

function addSubmittedIndexedJob(store, created = createdLog(), funded = fundedLog(), submitted = submittedLog()) {
  addFundedIndexedJob(store, created, funded);
  return store.submitIndexedJob({
    spaceId,
    chainId: 1952,
    contractAddress: indexedContract,
    onchainJobId: submitted.args.jobId,
    deliverableHash: submitted.args.deliverableHash,
    blockNumber: submitted.blockNumber,
    txHash: submitted.transactionHash,
    logIndex: submitted.logIndex,
  });
}

function addAdjudicatingIndexedJob(store, created = createdLog(), funded = fundedLog(), submitted = submittedLog(), requested = adjudicationLog()) {
  addSubmittedIndexedJob(store, created, funded, submitted);
  return store.requestAdjudicationIndexedJob({
    spaceId,
    chainId: 1952,
    contractAddress: indexedContract,
    onchainJobId: requested.args.jobId,
    adjudicator: requested.args.adjudicator,
    caseId: requested.args.caseId,
    blockNumber: requested.blockNumber,
    txHash: requested.transactionHash,
    logIndex: requested.logIndex,
  });
}

function eventInput(log, args) {
  return {
    spaceId,
    chainId: 1952,
    contractAddress: indexedContract,
    onchainJobId: log.args.jobId,
    ...args,
    blockNumber: log.blockNumber,
    txHash: log.transactionHash,
    logIndex: log.logIndex,
  };
}

function directTerminalLogs() {
  const rejectedRefund = refundedLog({ jobId: 11n, logIndex: 2 });
  const rejected = rejectedLog({ jobId: 11n, logIndex: 3 });
  const expiredRefund = refundedLog({ jobId: 12n, logIndex: 6 });
  const expired = expiredLog({ jobId: 12n, logIndex: 7 });
  const completed = completedLog({ jobId: 13n, logIndex: 11 });
  const adjudicatedCompleted = completedLog({ jobId: 14n, logIndex: 16, reason: `0x${"f".repeat(64)}` });
  return {
    rejected,
    expired,
    completed,
    adjudicatedCompleted,
    logs: [
      createdLog({ jobId: 11n, logIndex: 0 }),
      fundedLog({ jobId: 11n, logIndex: 1 }),
      rejectedRefund,
      rejected,
      createdLog({ jobId: 12n, logIndex: 4 }),
      fundedLog({ jobId: 12n, logIndex: 5 }),
      expiredRefund,
      expired,
      createdLog({ jobId: 13n, logIndex: 8 }),
      fundedLog({ jobId: 13n, logIndex: 9 }),
      submittedLog({ jobId: 13n, logIndex: 10 }),
      completed,
      createdLog({ jobId: 14n, logIndex: 12 }),
      fundedLog({ jobId: 14n, logIndex: 13 }),
      submittedLog({ jobId: 14n, logIndex: 14 }),
      adjudicationLog({ jobId: 14n, logIndex: 15 }),
      adjudicatedCompleted,
    ],
  };
}

test.before(async () => {
  chain = await ensureChain({ port: 18547 });
  publicClient = createPublicClient({
    chain: {
      id: chain.chainId,
      name: "anvil",
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      rpcUrls: { default: { http: [chain.rpc] } },
    },
    transport: http(chain.rpc),
  });
});

test.after(async () => {
  if (chain) await chain.cleanup();
});

test("M9-2: JobCreated cursor resumes later logs in the same block", async () => {
  const first = {
    eventName: "JobCreated",
    blockNumber: 10,
    transactionHash: `0x${"1".repeat(64)}`,
    logIndex: 0,
    args: [1n, "0x1111111111111111111111111111111111111111", "0x2222222222222222222222222222222222222222", "0x3333333333333333333333333333333333333333", "first", 2_000_000_000],
  };
  const second = {
    eventName: "JobCreated",
    blockNumber: 10,
    transactionHash: `0x${"2".repeat(64)}`,
    logIndex: 1,
    args: [2n, "0x1111111111111111111111111111111111111111", "0x2222222222222222222222222222222222222222", "0x3333333333333333333333333333333333333333", "second", 2_000_000_000],
  };
  const store = new SpaceStore();
  const client = { getBlockNumber: async () => 10n, getLogs: async () => [first, second] };
  const indexer = new JobCreatedIndexer({ store, chainId: 1952, contractAddress: "0x4444444444444444444444444444444444444444", client });
  store.indexerCursors.set(indexer.cursorKey, { blockNumber: 10, txHash: first.transactionHash, logIndex: 0 });

  const result = await indexer.sync({ fromBlock: 0, toBlock: 10 });
  assert.equal(result.processed, 1);
  assert.equal(store.jobs.size, 1);
  assert.equal([...store.jobs.values()][0].onchainJobId, "2");
});

test("M9-1: JobCreated indexer ingests two logs and survives restart replay idempotently", async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "microcosm-m9-"));
  const snapshotPath = path.join(directory, "store.json");
  const spaceId = "space-procurement-001";
  try {
    const firstJobId = await createJob("First indexed work");
    const secondJobId = await createJob("Second indexed work");
    fundJob(secondJobId, 42_500000n);
    const head = Number(await publicClient.getBlockNumber());
    const store = new SpaceStore();
    const balanceBefore = store.getSpace(spaceId).balance;
    const spentBefore = store.getSpace(spaceId).totalSpentToday;
    const indexer = new JobCreatedIndexer({
      store,
      chainId: chain.chainId,
      contractAddress: chain.contracts.AgenticCommerce,
      rpcUrl: chain.rpc,
      dataPath: snapshotPath,
    });

    const first = await indexer.sync({ toBlock: head });
    assert.equal(first.processed, 4);
    assert.equal(store.jobs.size, 2);
    assert.equal(store.jobs.get(`onchain-${chain.chainId}-${chain.contracts.AgenticCommerce.slice(2, 10).toLowerCase()}-${firstJobId}`).status, "Open");
    assert.equal(store.jobs.get(`onchain-${chain.chainId}-${chain.contracts.AgenticCommerce.slice(2, 10).toLowerCase()}-${secondJobId}`).budget, "42.500000");
    assert.equal(store.getActivity(spaceId).filter((entry) => entry.type === "WORK_CREATED").length, 2);
    assert.equal(store.getActivity(spaceId).filter((entry) => entry.type === "WORK_FUNDED").length, 1);
    assert.equal(store.getSpace(spaceId).balance, balanceBefore);
    assert.equal(store.getSpace(spaceId).totalSpentToday, spentBefore);
    assert.equal(store.receipts.size, 0);
    assert.ok(indexer.getCursor().blockNumber > 0);
    assert.match(indexer.getCursor().txHash, /^0x[0-9a-f]{64}$/);
    assert.equal(Number.isInteger(indexer.getCursor().logIndex), true);

    const restartedStore = new SpaceStore();
    assert.equal(load(restartedStore, snapshotPath), true);
    assert.deepEqual(restartedStore.indexerCursors.get(indexer.cursorKey), indexer.getCursor());
    const restarted = new JobCreatedIndexer({
      store: restartedStore,
      chainId: chain.chainId,
      contractAddress: chain.contracts.AgenticCommerce,
      rpcUrl: chain.rpc,
      dataPath: snapshotPath,
    });

    const replay = await restarted.sync({ fromBlock: 0, toBlock: head });
    assert.equal(replay.processed, 0);
    assert.equal(restartedStore.jobs.size, 2);
    assert.equal(restartedStore.getActivity(spaceId).filter((entry) => entry.type === "WORK_CREATED").length, 2);
    assert.equal(restartedStore.getActivity(spaceId).filter((entry) => entry.type === "WORK_FUNDED").length, 1);
    assert.equal(restartedStore.getSpace(spaceId).balance, balanceBefore);
    assert.equal(restartedStore.receipts.size, 0);

    const duplicate = await restarted.sync({ toBlock: head });
    assert.equal(duplicate.processed, 0);
    assert.equal(restartedStore.jobs.size, 2);
    assert.equal(restartedStore.getActivity(spaceId).filter((entry) => entry.type === "WORK_CREATED").length, 2);
    assert.equal(restartedStore.getActivity(spaceId).filter((entry) => entry.type === "WORK_FUNDED").length, 1);
    assert.equal(load(new SpaceStore(), snapshotPath), true);
    save(restartedStore, snapshotPath);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("M9-3: JobFunded transitions the indexed Open job and records its source log", () => {
  const store = new SpaceStore();
  const created = createdLog();
  const funded = fundedLog();
  const { job: openJob } = addOpenIndexedJob(store, created);

  const result = store.fundIndexedJob({
    spaceId,
    chainId: 1952,
    contractAddress: indexedContract,
    onchainJobId: funded.args.jobId,
    amount: funded.args.amount,
    blockNumber: funded.blockNumber,
    txHash: funded.transactionHash,
    logIndex: funded.logIndex,
  });

  assert.equal(result.funded, true);
  assert.equal(result.job.status, "Funded");
  assert.equal(result.job.budget, "123.456789");
  assert.equal(result.job.escrowedAmount, "123.456789");
  assert.equal(result.job.fundedAt, result.job.statusHistory.at(-1).timestamp);
  assert.deepEqual(result.job.statusHistory.at(-1), { status: "Funded", timestamp: result.job.fundedAt });
  assert.deepEqual(result.job.sourceLog, { blockNumber: 10, txHash: funded.transactionHash, logIndex: 1 });
  assert.notEqual(result.job.fundedAt, openJob.fundedAt);
  const activities = store.getActivity(spaceId);
  assert.equal(activities.filter((entry) => entry.type === "WORK_FUNDED").length, 1);
  assert.equal(activities.at(-1).fromStatus, "Open");
  assert.equal(activities.at(-1).toStatus, "Funded");
});

test("M9-3: JobFunded has no Space financial side effects", () => {
  const store = new SpaceStore();
  const funded = fundedLog();
  addOpenIndexedJob(store);
  const balanceBefore = store.getSpace(spaceId).balance;
  const spentBefore = store.getSpace(spaceId).totalSpentToday;
  const receiptsBefore = store.receipts.size;

  const { job } = store.fundIndexedJob({
    spaceId,
    chainId: 1952,
    contractAddress: indexedContract,
    onchainJobId: funded.args.jobId,
    amount: funded.args.amount,
    blockNumber: funded.blockNumber,
    txHash: funded.transactionHash,
    logIndex: funded.logIndex,
  });

  assert.equal(store.getSpace(spaceId).balance, balanceBefore);
  assert.equal(store.getSpace(spaceId).totalSpentToday, spentBefore);
  assert.equal(store.receipts.size, receiptsBefore);
  assert.equal(job.refunded, false);
  assert.equal(job.refundedAmount, null);
  assert.equal(job.settlement, null);
});

test("M9-3: combined indexer replay and repeated funding are idempotent", async () => {
  const store = new SpaceStore();
  const created = createdLog();
  const funded = fundedLog();
  const client = { getBlockNumber: async () => 10n, getLogs: async () => [created, funded] };
  const indexer = new JobCreatedIndexer({ store, chainId: 1952, contractAddress: indexedContract, client });

  const first = await indexer.sync({ fromBlock: 0, toBlock: 10 });
  assert.equal(first.processed, 2);
  const repeated = store.fundIndexedJob({
    spaceId,
    chainId: 1952,
    contractAddress: indexedContract,
    onchainJobId: funded.args.jobId,
    amount: funded.args.amount,
    blockNumber: funded.blockNumber,
    txHash: funded.transactionHash,
    logIndex: funded.logIndex,
  });
  const replay = await indexer.sync({ fromBlock: 0, toBlock: 10 });

  assert.equal(repeated.funded, false);
  assert.equal(replay.processed, 0);
  assert.equal(replay.skipped, 2);
  assert.equal(store.jobs.size, 1);
  assert.equal(store.getActivity(spaceId).filter((entry) => entry.type === "WORK_FUNDED").length, 1);
  assert.equal(store.indexerCursors.size, 1);
});

test("M9-3: combined indexer applies same-block logs in canonical order", async () => {
  const store = new SpaceStore();
  const created = createdLog({ logIndex: 3 });
  const funded = fundedLog({ logIndex: 4 });
  const client = { getBlockNumber: async () => 10n, getLogs: async () => [funded, created] };
  const indexer = new JobCreatedIndexer({ store, chainId: 1952, contractAddress: indexedContract, client });

  const result = await indexer.sync({ fromBlock: 0, toBlock: 10 });

  assert.equal(result.processed, 2);
  assert.equal(store.jobs.size, 1);
  assert.equal([...store.jobs.values()][0].status, "Funded");
  assert.deepEqual(store.getActivity(spaceId).slice(-2).map((entry) => entry.type), ["WORK_CREATED", "WORK_FUNDED"]);
  assert.deepEqual(indexer.getCursor(), { blockNumber: 10, txHash: funded.transactionHash, logIndex: 4 });
});

test("M9-3: JobFunded before JobCreated fails loudly", async () => {
  const store = new SpaceStore();
  const funded = fundedLog({ logIndex: 0 });
  const created = createdLog({ logIndex: 1 });
  const client = { getBlockNumber: async () => 10n, getLogs: async () => [funded, created] };
  const indexer = new JobCreatedIndexer({ store, chainId: 1952, contractAddress: indexedContract, client });

  await assert.rejects(indexer.sync({ fromBlock: 0, toBlock: 10 }), /unknown indexed job/);
  assert.equal(store.jobs.size, 0);
  assert.equal(store.getActivity(spaceId).filter((entry) => entry.type === "WORK_FUNDED").length, 0);
  assert.equal(indexer.getCursor(), null);
});

test("M9-3: JobFunded projection persists across restart", async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "microcosm-m9-funded-"));
  const snapshotPath = path.join(directory, "store.json");
  try {
    const created = createdLog({ blockNumber: 20, logIndex: 2 });
    const funded = fundedLog({ blockNumber: 20, logIndex: 3 });
    const client = { getBlockNumber: async () => 20n, getLogs: async () => [created, funded] };
    const store = new SpaceStore();
    const indexer = new JobCreatedIndexer({ store, chainId: 1952, contractAddress: indexedContract, client, dataPath: snapshotPath });

    await indexer.sync({ fromBlock: 0, toBlock: 20 });
    const cursor = indexer.getCursor();
    const restartedStore = new SpaceStore();
    assert.equal(load(restartedStore, snapshotPath), true);
    const restarted = new JobCreatedIndexer({ store: restartedStore, chainId: 1952, contractAddress: indexedContract, client, dataPath: snapshotPath });
    const replay = await restarted.sync({ fromBlock: 0, toBlock: 20 });
    const restartedJob = [...restartedStore.jobs.values()][0];

    assert.equal(replay.processed, 0);
    assert.equal(replay.skipped, 2);
    assert.equal(restartedJob.status, "Funded");
    assert.equal(restartedJob.budget, "123.456789");
    assert.equal(restartedJob.escrowedAmount, "123.456789");
    assert.deepEqual(restartedJob.sourceLog, { blockNumber: 20, txHash: funded.transactionHash, logIndex: 3 });
    assert.deepEqual(restartedStore.indexerCursors.get(restarted.cursorKey), cursor);
    assert.equal(restartedStore.getActivity(spaceId).filter((entry) => entry.type === "WORK_FUNDED").length, 1);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("M9-4: JobSubmitted transitions Funded to Submitted and records its source log", () => {
  const store = new SpaceStore();
  const submitted = submittedLog();
  addFundedIndexedJob(store);

  const result = store.submitIndexedJob({
    spaceId,
    chainId: 1952,
    contractAddress: indexedContract,
    onchainJobId: submitted.args.jobId,
    deliverableHash: submitted.args.deliverableHash,
    blockNumber: submitted.blockNumber,
    txHash: submitted.transactionHash,
    logIndex: submitted.logIndex,
  });

  assert.equal(result.submitted, true);
  assert.equal(result.job.status, "Submitted");
  assert.equal(result.job.deliverableHash, submitted.args.deliverableHash);
  assert.equal(result.job.submittedAt, result.job.statusHistory.at(-1).timestamp);
  assert.deepEqual(result.job.statusHistory.at(-1), { status: "Submitted", timestamp: result.job.submittedAt });
  assert.deepEqual(result.job.statusHistory.map((entry) => entry.status), ["Open", "Funded", "Submitted"]);
  assert.deepEqual(result.job.sourceLog, { blockNumber: 10, txHash: submitted.transactionHash, logIndex: 2 });
  const activities = store.getActivity(spaceId).filter((entry) => entry.type === "WORK_SUBMITTED");
  assert.equal(activities.length, 1);
  assert.equal(activities[0].deliverableHash, submitted.args.deliverableHash);
  assert.equal(activities[0].fromStatus, "Funded");
  assert.equal(activities[0].toStatus, "Submitted");
});

test("M9-4: JobSubmitted has no Space financial side effects", () => {
  const store = new SpaceStore();
  const submitted = submittedLog();
  const { job: fundedJob } = addFundedIndexedJob(store);
  const spaceBefore = structuredClone(store.getSpace(spaceId));
  const receiptsBefore = store.receipts.size;
  store._settleJob = async () => { throw new Error("settlement must not run"); };
  store._claimRefund = () => { throw new Error("refund must not run"); };

  const { job } = store.submitIndexedJob({
    spaceId,
    chainId: 1952,
    contractAddress: indexedContract,
    onchainJobId: submitted.args.jobId,
    deliverableHash: submitted.args.deliverableHash,
    blockNumber: submitted.blockNumber,
    txHash: submitted.transactionHash,
    logIndex: submitted.logIndex,
  });

  assert.deepEqual(store.getSpace(spaceId), spaceBefore);
  assert.equal(store.receipts.size, receiptsBefore);
  assert.equal(job.budget, fundedJob.budget);
  assert.equal(job.escrowedAmount, fundedJob.escrowedAmount);
  assert.equal(job.refunded, false);
  assert.equal(job.refundedAmount, null);
  assert.equal(job.settlement, null);
});

test("M9-4: combined indexer replay is idempotent and conflicts loudly", async () => {
  const store = new SpaceStore();
  const created = createdLog();
  const funded = fundedLog();
  const submitted = submittedLog();
  const client = { getBlockNumber: async () => 10n, getLogs: async () => [created, funded, submitted] };
  const indexer = new JobCreatedIndexer({ store, chainId: 1952, contractAddress: indexedContract, client });

  const first = await indexer.sync({ fromBlock: 0, toBlock: 10 });
  const repeated = store.submitIndexedJob({
    spaceId,
    chainId: 1952,
    contractAddress: indexedContract,
    onchainJobId: submitted.args.jobId,
    deliverableHash: submitted.args.deliverableHash,
    blockNumber: submitted.blockNumber,
    txHash: submitted.transactionHash,
    logIndex: submitted.logIndex,
  });
  const replay = await indexer.sync({ fromBlock: 0, toBlock: 10 });

  assert.equal(first.processed, 3);
  assert.equal(repeated.submitted, false);
  assert.equal(replay.processed, 0);
  assert.equal(replay.skipped, 3);
  assert.equal(store.getActivity(spaceId).filter((entry) => entry.type === "WORK_SUBMITTED").length, 1);
  assert.equal(store.indexerCursors.size, 1);
  assert.throws(() => store.submitIndexedJob({
    spaceId,
    chainId: 1952,
    contractAddress: indexedContract,
    onchainJobId: submitted.args.jobId,
    deliverableHash: `0x${"b".repeat(64)}`,
    blockNumber: submitted.blockNumber,
    txHash: submitted.transactionHash,
    logIndex: submitted.logIndex,
  }), /from 'Submitted'/);
});

test("M9-4: combined indexer applies same-block JobSubmitted in canonical order", async () => {
  const store = new SpaceStore();
  const created = createdLog({ logIndex: 3 });
  const funded = fundedLog({ logIndex: 4 });
  const submitted = submittedLog({ logIndex: 5 });
  const client = { getBlockNumber: async () => 10n, getLogs: async () => [submitted, funded, created] };
  const indexer = new JobCreatedIndexer({ store, chainId: 1952, contractAddress: indexedContract, client });

  const result = await indexer.sync({ fromBlock: 0, toBlock: 10 });
  const job = [...store.jobs.values()][0];

  assert.equal(result.processed, 3);
  assert.equal(job.status, "Submitted");
  assert.equal(job.deliverableHash, submitted.args.deliverableHash);
  assert.deepEqual(store.getActivity(spaceId).slice(-3).map((entry) => entry.type), ["WORK_CREATED", "WORK_FUNDED", "WORK_SUBMITTED"]);
  assert.deepEqual(indexer.getCursor(), { blockNumber: 10, txHash: submitted.transactionHash, logIndex: 5 });
});

test("M9-4: JobSubmitted before JobFunded fails loudly", async () => {
  const store = new SpaceStore();
  const created = createdLog({ logIndex: 1 });
  const submitted = submittedLog({ logIndex: 2 });
  const funded = fundedLog({ logIndex: 3 });
  const client = { getBlockNumber: async () => 10n, getLogs: async () => [created, submitted, funded] };
  const indexer = new JobCreatedIndexer({ store, chainId: 1952, contractAddress: indexedContract, client });

  await assert.rejects(indexer.sync({ fromBlock: 0, toBlock: 10 }), /cannot transition indexed job .* from 'Open'/);
  assert.equal([...store.jobs.values()][0].status, "Open");
  assert.equal(store.getActivity(spaceId).filter((entry) => entry.type === "WORK_SUBMITTED").length, 0);
  assert.deepEqual(indexer.getCursor(), { blockNumber: 10, txHash: created.transactionHash, logIndex: 1 });
});

test("M9-4: JobSubmitted projection persists across restart", async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "microcosm-m9-submitted-"));
  const snapshotPath = path.join(directory, "store.json");
  try {
    const created = createdLog({ blockNumber: 20, logIndex: 4 });
    const funded = fundedLog({ blockNumber: 20, logIndex: 5 });
    const submitted = submittedLog({ blockNumber: 20, logIndex: 6 });
    const client = { getBlockNumber: async () => 20n, getLogs: async () => [created, funded, submitted] };
    const store = new SpaceStore();
    const indexer = new JobCreatedIndexer({ store, chainId: 1952, contractAddress: indexedContract, client, dataPath: snapshotPath });

    await indexer.sync({ fromBlock: 0, toBlock: 20 });
    const cursor = indexer.getCursor();
    const restartedStore = new SpaceStore();
    assert.equal(load(restartedStore, snapshotPath), true);
    const restarted = new JobCreatedIndexer({ store: restartedStore, chainId: 1952, contractAddress: indexedContract, client, dataPath: snapshotPath });
    const replay = await restarted.sync({ fromBlock: 0, toBlock: 20 });
    const restartedJob = [...restartedStore.jobs.values()][0];

    assert.equal(replay.processed, 0);
    assert.equal(replay.skipped, 3);
    assert.equal(restartedJob.status, "Submitted");
    assert.equal(restartedJob.deliverableHash, submitted.args.deliverableHash);
    assert.deepEqual(restartedJob.sourceLog, { blockNumber: 20, txHash: submitted.transactionHash, logIndex: 6 });
    assert.deepEqual(restartedStore.indexerCursors.get(restarted.cursorKey), cursor);
    assert.equal(restartedStore.getActivity(spaceId).filter((entry) => entry.type === "WORK_SUBMITTED").length, 1);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("M9-5: AdjudicationRequested transitions Submitted to Adjudicating and records its source log", () => {
  const store = new SpaceStore();
  const requested = adjudicationLog();
  addSubmittedIndexedJob(store);

  const result = store.requestAdjudicationIndexedJob({
    spaceId,
    chainId: 1952,
    contractAddress: indexedContract,
    onchainJobId: requested.args.jobId,
    adjudicator: requested.args.adjudicator,
    caseId: requested.args.caseId,
    blockNumber: requested.blockNumber,
    txHash: requested.transactionHash,
    logIndex: requested.logIndex,
  });

  assert.equal(result.requested, true);
  assert.equal(result.job.status, "Adjudicating");
  assert.equal(result.job.adjudicator, requested.args.adjudicator);
  assert.equal(result.job.adjudication.caseId, requested.args.caseId);
  assert.equal(result.job.adjudication.deliverableHash, submittedLog().args.deliverableHash);
  assert.deepEqual(result.job.statusHistory.map((entry) => entry.status), ["Open", "Funded", "Submitted", "Adjudicating"]);
  assert.deepEqual(result.job.sourceLog, { blockNumber: 10, txHash: requested.transactionHash, logIndex: 3 });
  const activity = store.getActivity(spaceId).filter((entry) => entry.type === "WORK_ADJUDICATION_REQUESTED");
  assert.equal(activity.length, 1);
  assert.equal(activity[0].adjudicator, requested.args.adjudicator);
  assert.equal(activity[0].caseId, requested.args.caseId);
  assert.equal(activity[0].fromStatus, "Submitted");
  assert.equal(activity[0].toStatus, "Adjudicating");
});

test("M9-5: AdjudicationRequested has no Space financial side effects", () => {
  const store = new SpaceStore();
  const requested = adjudicationLog();
  addSubmittedIndexedJob(store);
  const spaceBefore = structuredClone(store.getSpace(spaceId));
  const receiptsBefore = store.receipts.size;
  store.requestVerdict = () => { throw new Error("requestVerdict must not run"); };
  store._settleJob = async () => { throw new Error("settlement must not run"); };
  store._claimRefund = () => { throw new Error("refund must not run"); };

  const { job } = store.requestAdjudicationIndexedJob({
    spaceId,
    chainId: 1952,
    contractAddress: indexedContract,
    onchainJobId: requested.args.jobId,
    adjudicator: requested.args.adjudicator,
    caseId: requested.args.caseId,
    blockNumber: requested.blockNumber,
    txHash: requested.transactionHash,
    logIndex: requested.logIndex,
  });

  assert.deepEqual(store.getSpace(spaceId), spaceBefore);
  assert.equal(store.receipts.size, receiptsBefore);
  assert.equal(job.budget, "123.456789");
  assert.equal(job.escrowedAmount, "123.456789");
  assert.equal(job.refunded, false);
  assert.equal(job.refundedAmount, null);
  assert.equal(job.settlement, null);
});

test("M9-5: AdjudicationRequested replay is idempotent and conflicts loudly", () => {
  const store = new SpaceStore();
  const requested = adjudicationLog();
  addSubmittedIndexedJob(store);
  const input = {
    spaceId,
    chainId: 1952,
    contractAddress: indexedContract,
    onchainJobId: requested.args.jobId,
    adjudicator: requested.args.adjudicator,
    caseId: requested.args.caseId,
    blockNumber: requested.blockNumber,
    txHash: requested.transactionHash,
    logIndex: requested.logIndex,
  };

  assert.equal(store.requestAdjudicationIndexedJob(input).requested, true);
  assert.equal(store.requestAdjudicationIndexedJob(input).requested, false);
  assert.throws(() => store.requestAdjudicationIndexedJob({ ...input, caseId: `0x${"d".repeat(64)}` }), /from 'Adjudicating'/);
  assert.equal(store.getActivity(spaceId).filter((entry) => entry.type === "WORK_ADJUDICATION_REQUESTED").length, 1);
});

test("M9-5: combined indexer applies AdjudicationRequested in same-block canonical order", async () => {
  const store = new SpaceStore();
  const created = createdLog({ logIndex: 3 });
  const funded = fundedLog({ logIndex: 4 });
  const submitted = submittedLog({ logIndex: 5 });
  const requested = adjudicationLog({ logIndex: 6 });
  const client = { getBlockNumber: async () => 10n, getLogs: async () => [requested, submitted, funded, created] };
  const indexer = new JobCreatedIndexer({ store, chainId: 1952, contractAddress: indexedContract, client });

  const result = await indexer.sync({ fromBlock: 0, toBlock: 10 });
  const job = [...store.jobs.values()][0];

  assert.equal(result.processed, 4);
  assert.equal(job.status, "Adjudicating");
  assert.equal(job.adjudication.caseId, requested.args.caseId);
  assert.deepEqual(store.getActivity(spaceId).slice(-4).map((entry) => entry.type), ["WORK_CREATED", "WORK_FUNDED", "WORK_SUBMITTED", "WORK_ADJUDICATION_REQUESTED"]);
  assert.deepEqual(indexer.getCursor(), { blockNumber: 10, txHash: requested.transactionHash, logIndex: 6 });
});

test("M9-5: AdjudicationRequested before JobSubmitted fails loudly", async () => {
  const store = new SpaceStore();
  const created = createdLog({ logIndex: 0 });
  const requested = adjudicationLog({ logIndex: 1 });
  const client = { getBlockNumber: async () => 10n, getLogs: async () => [created, requested] };
  const indexer = new JobCreatedIndexer({ store, chainId: 1952, contractAddress: indexedContract, client });

  await assert.rejects(indexer.sync({ fromBlock: 0, toBlock: 10 }), /from 'Open'/);
  assert.equal([...store.jobs.values()][0].status, "Open");
  assert.equal(store.getActivity(spaceId).filter((entry) => entry.type === "WORK_ADJUDICATION_REQUESTED").length, 0);
  assert.deepEqual(indexer.getCursor(), { blockNumber: 10, txHash: created.transactionHash, logIndex: 0 });
});

test("M9-5: AdjudicationRequested projection persists across restart", async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "microcosm-m9-adjudication-"));
  const snapshotPath = path.join(directory, "store.json");
  try {
    const created = createdLog({ blockNumber: 20, logIndex: 4 });
    const funded = fundedLog({ blockNumber: 20, logIndex: 5 });
    const submitted = submittedLog({ blockNumber: 20, logIndex: 6 });
    const requested = adjudicationLog({ blockNumber: 20, logIndex: 7 });
    const client = { getBlockNumber: async () => 20n, getLogs: async () => [created, funded, submitted, requested] };
    const store = new SpaceStore();
    const indexer = new JobCreatedIndexer({ store, chainId: 1952, contractAddress: indexedContract, client, dataPath: snapshotPath });

    await indexer.sync({ fromBlock: 0, toBlock: 20 });
    const cursor = indexer.getCursor();
    const restartedStore = new SpaceStore();
    assert.equal(load(restartedStore, snapshotPath), true);
    const restarted = new JobCreatedIndexer({ store: restartedStore, chainId: 1952, contractAddress: indexedContract, client, dataPath: snapshotPath });
    const replay = await restarted.sync({ fromBlock: 0, toBlock: 20 });
    const restartedJob = [...restartedStore.jobs.values()][0];

    assert.equal(replay.processed, 0);
    assert.equal(replay.skipped, 4);
    assert.equal(restartedJob.status, "Adjudicating");
    assert.equal(restartedJob.adjudicator, requested.args.adjudicator);
    assert.equal(restartedJob.adjudication.caseId, requested.args.caseId);
    assert.deepEqual(restartedJob.sourceLog, { blockNumber: 20, txHash: requested.transactionHash, logIndex: 7 });
    assert.deepEqual(restartedStore.indexerCursors.get(restarted.cursorKey), cursor);
    assert.equal(restartedStore.getActivity(spaceId).filter((entry) => entry.type === "WORK_ADJUDICATION_REQUESTED").length, 1);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("M9-6: JobCompleted projects Submitted and Adjudicating with terminal metadata", async (t) => {
  for (const [name, prepare] of [
    ["Submitted", (store) => addSubmittedIndexedJob(store)],
    ["Adjudicating", (store) => addAdjudicatingIndexedJob(store)],
  ]) {
    await t.test(name, () => {
      const store = new SpaceStore();
      const fromStatus = prepare(store).job.status;
      const completed = completedLog();
      const input = eventInput(completed, { reason: completed.args.reason });
      const result = store.completeIndexedJob(input);
      const activity = store.getActivity(spaceId).at(-1);

      assert.equal(result.completed, true);
      assert.equal(result.job.status, "Completed");
      assert.equal(result.job.completionReason, completed.args.reason);
      assert.equal(result.job.completedAt, result.job.statusHistory.at(-1).timestamp);
      assert.deepEqual(result.job.statusHistory.at(-1), { status: "Completed", timestamp: result.job.completedAt });
      assert.deepEqual(result.job.sourceLog, { blockNumber: completed.blockNumber, txHash: completed.transactionHash, logIndex: completed.logIndex });
      assert.equal(result.job.settlement, null);
      assert.equal(activity.type, "WORK_COMPLETED");
      assert.equal(activity.fromStatus, fromStatus);
      assert.equal(activity.toStatus, "Completed");
      assert.equal(activity.reason, completed.args.reason);
    });
  }
});

test("M9-6: JobRejected projects Open, Funded, and Submitted with terminal metadata", async (t) => {
  for (const [name, prepare] of [
    ["Open", (store) => addOpenIndexedJob(store)],
    ["Funded", (store) => addFundedIndexedJob(store)],
    ["Submitted", (store) => addSubmittedIndexedJob(store)],
  ]) {
    await t.test(name, () => {
      const store = new SpaceStore();
      prepare(store);
      const rejected = rejectedLog();
      const result = store.rejectIndexedJob(eventInput(rejected, { rejector: rejected.args.rejector, reason: rejected.args.reason }));
      const activity = store.getActivity(spaceId).at(-1);

      assert.equal(result.rejected, true);
      assert.equal(result.job.status, "Rejected");
      assert.equal(result.job.rejectedBy, rejected.args.rejector);
      assert.equal(result.job.rejectionReason, rejected.args.reason);
      assert.equal(result.job.rejectedAt, result.job.statusHistory.at(-1).timestamp);
      assert.deepEqual(result.job.sourceLog, { blockNumber: rejected.blockNumber, txHash: rejected.transactionHash, logIndex: rejected.logIndex });
      assert.equal(activity.type, "WORK_REJECTED");
      assert.equal(activity.fromStatus, name);
      assert.equal(activity.toStatus, "Rejected");
      assert.equal(activity.rejector, rejected.args.rejector);
      assert.equal(activity.reason, rejected.args.reason);
    });
  }
});

test("M9-6: JobExpired projects Funded, Submitted, and Adjudicating with terminal metadata", async (t) => {
  for (const [name, prepare] of [
    ["Funded", (store) => addFundedIndexedJob(store)],
    ["Submitted", (store) => addSubmittedIndexedJob(store)],
    ["Adjudicating", (store) => addAdjudicatingIndexedJob(store)],
  ]) {
    await t.test(name, () => {
      const store = new SpaceStore();
      prepare(store);
      const expired = expiredLog();
      const result = store.expireIndexedJob(eventInput(expired, {}));
      const activity = store.getActivity(spaceId).at(-1);

      assert.equal(result.expired, true);
      assert.equal(result.job.status, "Expired");
      assert.equal(result.job.expiredAt, result.job.statusHistory.at(-1).timestamp);
      assert.deepEqual(result.job.statusHistory.at(-1), { status: "Expired", timestamp: result.job.expiredAt });
      assert.deepEqual(result.job.sourceLog, { blockNumber: expired.blockNumber, txHash: expired.transactionHash, logIndex: expired.logIndex });
      assert.equal(activity.type, "WORK_EXPIRED");
      assert.equal(activity.fromStatus, name);
      assert.equal(activity.toStatus, "Expired");
    });
  }
});

test("M9-6: Refunded records evidence without transitioning status", () => {
  const store = new SpaceStore();
  addSubmittedIndexedJob(store);
  const refunded = refundedLog();
  const result = store.recordIndexedRefund(eventInput(refunded, { client: refunded.args.client, amount: refunded.args.amount }));
  const activity = store.getActivity(spaceId).at(-1);

  assert.equal(result.refunded, true);
  assert.equal(result.job.status, "Submitted");
  assert.equal(result.job.refunded, true);
  assert.equal(result.job.refundedAmount, "123.456789");
  assert.equal(result.job.refundClient, refunded.args.client);
  assert.deepEqual(result.job.refundSourceLog, { blockNumber: refunded.blockNumber, txHash: refunded.transactionHash, logIndex: refunded.logIndex });
  assert.equal(activity.type, "WORK_REFUNDED");
  assert.equal(activity.fromStatus, "Submitted");
  assert.equal(activity.toStatus, "Submitted");
  assert.equal(activity.refundedAmount, "123.456789");
  assert.deepEqual(result.job.statusHistory.map((entry) => entry.status), ["Open", "Funded", "Submitted"]);
});

test("M9-6: terminal and refund projections have no Space financial side effects", () => {
  const cases = [
    ["completed", (store) => addSubmittedIndexedJob(store), (store, log) => store.completeIndexedJob(eventInput(log, { reason: log.args.reason }))],
    ["rejected", (store) => addFundedIndexedJob(store), (store, log) => store.rejectIndexedJob(eventInput(log, { rejector: log.args.rejector, reason: log.args.reason }))],
    ["expired", (store) => addFundedIndexedJob(store), (store, log) => store.expireIndexedJob(eventInput(log, {}))],
    ["refunded", (store) => addSubmittedIndexedJob(store), (store, log) => store.recordIndexedRefund(eventInput(log, { client: log.args.client, amount: log.args.amount }))],
  ];

  for (const [name, prepare, project] of cases) {
    const store = new SpaceStore();
    prepare(store);
    const spaceBefore = structuredClone(store.getSpace(spaceId));
    const receiptsBefore = store.receipts.size;
    store._liveSettle = async () => { throw new Error("local settlement must not run"); };
    store._settleJob = async () => { throw new Error("job settlement must not run"); };
    store._claimRefund = () => { throw new Error("local refund must not run"); };
    const log = { completed: completedLog, rejected: rejectedLog, expired: expiredLog, refunded: refundedLog }[name]();

    const { job } = project(store, log);

    assert.deepEqual(store.getSpace(spaceId), spaceBefore);
    assert.equal(store.receipts.size, receiptsBefore);
    assert.equal(job.settlement, null);
  }
});

test("M9-6: identical direct replays are no-ops and conflicts fail loudly", () => {
  const completedStore = new SpaceStore();
  addSubmittedIndexedJob(completedStore);
  const completed = completedLog();
  const completedInput = eventInput(completed, { reason: completed.args.reason });
  assert.equal(completedStore.completeIndexedJob(completedInput).completed, true);
  assert.equal(completedStore.completeIndexedJob(completedInput).completed, false);
  assert.throws(() => completedStore.completeIndexedJob({ ...completedInput, reason: `0x${"a".repeat(64)}` }), /from 'Completed'/);

  const refundStore = new SpaceStore();
  addSubmittedIndexedJob(refundStore);
  const refunded = refundedLog();
  const refundInput = eventInput(refunded, { client: refunded.args.client, amount: refunded.args.amount });
  const rejected = rejectedLog();
  assert.equal(refundStore.recordIndexedRefund(refundInput).refunded, true);
  assert.equal(refundStore.recordIndexedRefund(refundInput).refunded, false);
  assert.equal(refundStore.rejectIndexedJob(eventInput(rejected, { rejector: rejected.args.rejector, reason: rejected.args.reason })).rejected, true);
  assert.equal(refundStore.recordIndexedRefund(refundInput).refunded, false);
  assert.throws(() => refundStore.recordIndexedRefund({ ...refundInput, amount: 1n }), /conflicts/);
  assert.equal(refundStore.getActivity(spaceId).filter((entry) => entry.type === "WORK_REFUNDED").length, 1);
  assert.equal(refundStore.getActivity(spaceId).filter((entry) => entry.type === "WORK_REJECTED").length, 1);
});

test("M9-6: combined indexer orders same-block direct logs and Refunded before applicable terminals", async () => {
  const store = new SpaceStore();
  const fixture = directTerminalLogs();
  const client = { getBlockNumber: async () => 10n, getLogs: async () => [...fixture.logs].reverse() };
  const indexer = new JobCreatedIndexer({ store, chainId: 1952, contractAddress: indexedContract, client });

  const result = await indexer.sync({ fromBlock: 0, toBlock: 10 });
  const jobs = [...store.jobs.values()];
  const rejected = jobs.find((job) => job.onchainJobId === "11");
  const expired = jobs.find((job) => job.onchainJobId === "12");
  const completed = jobs.find((job) => job.onchainJobId === "13");
  const adjudicated = jobs.find((job) => job.onchainJobId === "14");
  const activities = store.getActivity(spaceId);

  assert.equal(result.processed, 17);
  assert.equal(rejected.status, "Rejected");
  assert.equal(rejected.refundedAmount, "123.456789");
  assert.deepEqual(rejected.statusHistory.map((entry) => entry.status), ["Open", "Funded", "Rejected"]);
  assert.equal(expired.status, "Expired");
  assert.equal(expired.refunded, true);
  assert.deepEqual(expired.statusHistory.map((entry) => entry.status), ["Open", "Funded", "Expired"]);
  assert.equal(completed.status, "Completed");
  assert.deepEqual(completed.statusHistory.map((entry) => entry.status), ["Open", "Funded", "Submitted", "Completed"]);
  assert.equal(adjudicated.status, "Completed");
  assert.deepEqual(adjudicated.statusHistory.map((entry) => entry.status), ["Open", "Funded", "Submitted", "Adjudicating", "Completed"]);
  assert.deepEqual(activities.map((entry) => entry.type), [
    "WORK_CREATED", "WORK_FUNDED", "WORK_REFUNDED", "WORK_REJECTED",
    "WORK_CREATED", "WORK_FUNDED", "WORK_REFUNDED", "WORK_EXPIRED",
    "WORK_CREATED", "WORK_FUNDED", "WORK_SUBMITTED", "WORK_COMPLETED",
    "WORK_CREATED", "WORK_FUNDED", "WORK_SUBMITTED", "WORK_ADJUDICATION_REQUESTED", "WORK_COMPLETED",
  ]);
  assert.equal(activities.filter((entry) => entry.type === "WORK_REFUNDED").length, 2);
  assert.equal(store.indexerCursors.size, 1);
  assert.deepEqual(indexer.getCursor(), { blockNumber: 10, txHash: fixture.adjudicatedCompleted.transactionHash, logIndex: 16 });

  const replay = await indexer.sync({ fromBlock: 0, toBlock: 10 });
  assert.equal(replay.processed, 0);
  assert.equal(replay.skipped, 17);
  assert.equal(store.getActivity(spaceId).length, 17);
});

test("M9-6: invalid terminal, refund, and cursor ordering fails loudly", async () => {
  const rejectedAfterCompletion = new SpaceStore();
  addSubmittedIndexedJob(rejectedAfterCompletion);
  const completedBeforeRejected = completedLog({ logIndex: 3 });
  rejectedAfterCompletion.completeIndexedJob(eventInput(completedBeforeRejected, { reason: completedBeforeRejected.args.reason }));
  const rejected = rejectedLog({ logIndex: 4 });
  assert.throws(() => rejectedAfterCompletion.rejectIndexedJob(eventInput(rejected, { rejector: rejected.args.rejector, reason: rejected.args.reason })), /from 'Completed'/);

  const expiredTooEarly = new SpaceStore();
  addOpenIndexedJob(expiredTooEarly);
  const expired = expiredLog({ logIndex: 1 });
  assert.throws(() => expiredTooEarly.expireIndexedJob(eventInput(expired, {})), /from 'Open'/);

  const completeTooEarly = new SpaceStore();
  const funded = fundedLog({ logIndex: 1 });
  const completed = completedLog({ logIndex: 2 });
  const completeClient = { getBlockNumber: async () => 10n, getLogs: async () => [completed, funded, createdLog({ logIndex: 0 })] };
  const completeIndexer = new JobCreatedIndexer({ store: completeTooEarly, chainId: 1952, contractAddress: indexedContract, client: completeClient });
  await assert.rejects(completeIndexer.sync({ fromBlock: 0, toBlock: 10 }), /JobCompleted cannot transition .* from 'Funded'/);

  const refundTooLate = new SpaceStore();
  const lateRefund = refundedLog({ logIndex: 4 });
  const lateLogs = [createdLog({ logIndex: 0 }), fundedLog({ logIndex: 1 }), submittedLog({ logIndex: 2 }), completedLog({ logIndex: 3 }), lateRefund];
  const refundClient = { getBlockNumber: async () => 10n, getLogs: async () => lateLogs };
  const refundIndexer = new JobCreatedIndexer({ store: refundTooLate, chainId: 1952, contractAddress: indexedContract, client: refundClient });
  await assert.rejects(refundIndexer.sync({ fromBlock: 0, toBlock: 10 }), /Refunded conflicts/);

  const cursorStore = new SpaceStore();
  const cursorIndexer = new JobCreatedIndexer({ store: cursorStore, chainId: 1952, contractAddress: indexedContract, client: { getBlockNumber: async () => 10n, getLogs: async () => [] } });
  cursorStore.indexerCursors.set(cursorIndexer.cursorKey, { blockNumber: 10, txHash: `0x${"9".repeat(64)}`, logIndex: 7 });
  const conflictingClient = { getBlockNumber: async () => 10n, getLogs: async () => [createdLog({ logIndex: 7, txDigit: "8" })] };
  const conflictingIndexer = new JobCreatedIndexer({ store: cursorStore, chainId: 1952, contractAddress: indexedContract, client: conflictingClient });
  await assert.rejects(conflictingIndexer.sync({ fromBlock: 0, toBlock: 10 }), /conflicts with the persisted/);
});

test("M9-6: direct terminal and refund projections persist across restart", async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "microcosm-m9-direct-"));
  const snapshotPath = path.join(directory, "store.json");
  try {
    const fixture = directTerminalLogs();
    const client = { getBlockNumber: async () => 10n, getLogs: async () => fixture.logs };
    const store = new SpaceStore();
    const indexer = new JobCreatedIndexer({ store, chainId: 1952, contractAddress: indexedContract, client, dataPath: snapshotPath });

    await indexer.sync({ fromBlock: 0, toBlock: 10 });
    const cursor = indexer.getCursor();
    const restartedStore = new SpaceStore();
    assert.equal(load(restartedStore, snapshotPath), true);
    const restarted = new JobCreatedIndexer({ store: restartedStore, chainId: 1952, contractAddress: indexedContract, client, dataPath: snapshotPath });
    const replay = await restarted.sync({ fromBlock: 0, toBlock: 10 });
    const jobs = [...restartedStore.jobs.values()];

    assert.equal(replay.processed, 0);
    assert.equal(replay.skipped, 17);
    assert.deepEqual(restartedStore.indexerCursors.get(restarted.cursorKey), cursor);
    assert.deepEqual(jobs.map((job) => job.status), ["Rejected", "Expired", "Completed", "Completed"]);
    assert.deepEqual(jobs.map((job) => job.refunded), [true, true, false, false]);
    assert.equal(restartedStore.getActivity(spaceId).filter((entry) => entry.type === "WORK_COMPLETED").length, 2);
    assert.equal(restartedStore.getActivity(spaceId).filter((entry) => entry.type === "WORK_REJECTED").length, 1);
    assert.equal(restartedStore.getActivity(spaceId).filter((entry) => entry.type === "WORK_EXPIRED").length, 1);
    assert.equal(restartedStore.getActivity(spaceId).filter((entry) => entry.type === "WORK_REFUNDED").length, 2);
    assert.equal(restartedStore.receipts.size, 0);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("M9-7: AdjudicationResolved follows contract-order JobCompleted and replays safely", async () => {
  const store = new SpaceStore();
  const completed = completedLog({ logIndex: 4, reason: `0x${"a".repeat(64)}` });
  const resolved = resolvedLog({ logIndex: 5, reason: `0x${"a".repeat(64)}` });
  const logs = [
    createdLog({ logIndex: 0 }),
    fundedLog({ logIndex: 1 }),
    submittedLog({ logIndex: 2 }),
    adjudicationLog({ logIndex: 3 }),
    completed,
    resolved,
  ];
  const spaceBefore = structuredClone(store.getSpace(spaceId));
  const receiptsBefore = store.receipts.size;
  store._settleJob = async () => { throw new Error("local settlement must not run"); };
  store._claimRefund = () => { throw new Error("local refund must not run"); };
  const indexer = new JobCreatedIndexer({ store, chainId: 1952, contractAddress: indexedContract, client: { getBlockNumber: async () => 10n, getLogs: async () => [...logs].reverse() } });

  const first = await indexer.sync({ fromBlock: 0, toBlock: 10 });
  const replay = await indexer.sync({ fromBlock: 0, toBlock: 10 });
  const job = [...store.jobs.values()][0];
  const activity = store.getActivity(spaceId);

  assert.equal(first.processed, 6);
  assert.equal(replay.processed, 0);
  assert.equal(replay.skipped, 6);
  assert.equal(job.status, "Completed");
  assert.deepEqual(job.statusHistory.map((entry) => entry.status), ["Open", "Funded", "Submitted", "Adjudicating", "Completed"]);
  assert.equal(job.completionReason, completed.args.reason);
  assert.deepEqual(job.sourceLog, { blockNumber: 10, txHash: completed.transactionHash, logIndex: 4 });
  assert.equal(job.adjudication.resolution.adjudicator, resolved.args.adjudicator);
  assert.equal(job.adjudication.resolution.approve, true);
  assert.equal(job.adjudication.resolution.reason, resolved.args.reason);
  assert.deepEqual(job.adjudication.resolution.sourceLog, { blockNumber: 10, txHash: resolved.transactionHash, logIndex: 5 });
  assert.deepEqual(activity.slice(-2).map((entry) => entry.type), ["WORK_COMPLETED", "WORK_ADJUDICATION_RESOLVED"]);
  assert.equal(activity.at(-1).fromStatus, "Adjudicating");
  assert.equal(activity.at(-1).toStatus, "Completed");
  assert.deepEqual(store.getSpace(spaceId), spaceBefore);
  assert.equal(store.receipts.size, receiptsBefore);
  assert.equal(job.settlement, null);
  assert.equal(activity.filter((entry) => entry.type === "WORK_ADJUDICATION_RESOLVED").length, 1);
});

test("M9-7: AdjudicationResolved follows contract-order Refunded and JobRejected", async () => {
  const store = new SpaceStore();
  const refunded = refundedLog({ logIndex: 4 });
  const resolved = resolvedLog({ logIndex: 6, approve: false, reason: `0x${"e".repeat(64)}` });
  const rejected = rejectedLog({ logIndex: 5, rejector: resolved.args.adjudicator, reason: resolved.args.reason });
  const logs = [
    createdLog({ logIndex: 0 }),
    fundedLog({ logIndex: 1 }),
    submittedLog({ logIndex: 2 }),
    adjudicationLog({ logIndex: 3 }),
    refunded,
    rejected,
    resolved,
  ];
  const spaceBefore = structuredClone(store.getSpace(spaceId));
  const indexer = new JobCreatedIndexer({ store, chainId: 1952, contractAddress: indexedContract, client: { getBlockNumber: async () => 10n, getLogs: async () => logs } });

  const result = await indexer.sync({ fromBlock: 0, toBlock: 10 });
  const job = [...store.jobs.values()][0];
  const activity = store.getActivity(spaceId);

  assert.equal(result.processed, 7);
  assert.equal(job.status, "Rejected");
  assert.equal(job.refundedAmount, "123.456789");
  assert.equal(job.rejectedBy, rejected.args.rejector);
  assert.equal(job.rejectionReason, rejected.args.reason);
  assert.equal(job.adjudication.resolution.approve, false);
  assert.equal(job.adjudication.resolution.reason, resolved.args.reason);
  assert.deepEqual(job.adjudication.resolution.sourceLog, { blockNumber: 10, txHash: resolved.transactionHash, logIndex: 6 });
  assert.deepEqual(activity.slice(-3).map((entry) => entry.type), ["WORK_REFUNDED", "WORK_REJECTED", "WORK_ADJUDICATION_RESOLVED"]);
  assert.equal(activity.at(-1).fromStatus, "Adjudicating");
  assert.equal(activity.at(-1).toStatus, "Rejected");
  assert.deepEqual(store.getSpace(spaceId), spaceBefore);
  assert.equal(store.receipts.size, 0);
  assert.equal(job.settlement, null);
});

test("M9-7: AdjudicationResolved projects clean Adjudicating approvals and rejections", async (t) => {
  for (const approve of [true, false]) {
    await t.test(approve ? "approved" : "rejected", () => {
      const store = new SpaceStore();
      addAdjudicatingIndexedJob(store);
      const resolved = resolvedLog({ approve, reason: `0x${approve ? "a".repeat(64) : "c".repeat(64)}`, logIndex: 4 });
      const input = eventInput(resolved, { adjudicator: resolved.args.adjudicator, approve, reason: resolved.args.reason });

      const result = store.resolveAdjudicationIndexedJob(input);
      const repeated = store.resolveAdjudicationIndexedJob(input);
      const activity = store.getActivity(spaceId).at(-1);

      assert.equal(result.resolved, true);
      assert.equal(repeated.resolved, false);
      assert.equal(result.job.status, approve ? "Completed" : "Rejected");
      assert.deepEqual(result.job.statusHistory.map((entry) => entry.status), ["Open", "Funded", "Submitted", "Adjudicating", approve ? "Completed" : "Rejected"]);
      assert.equal(result.job.adjudication.resolution.reason, resolved.args.reason);
      assert.deepEqual(result.job.adjudication.resolution.sourceLog, { blockNumber: 10, txHash: resolved.transactionHash, logIndex: 4 });
      assert.equal(activity.type, "WORK_ADJUDICATION_RESOLVED");
      assert.equal(activity.fromStatus, "Adjudicating");
      assert.equal(activity.toStatus, approve ? "Completed" : "Rejected");
      assert.equal(result.job.settlement, null);
    });
  }
});

test("M9-7: AdjudicationResolved validation, replay, and conflicts fail loudly", () => {
  const store = new SpaceStore();
  addAdjudicatingIndexedJob(store);
  const resolved = resolvedLog();
  const input = eventInput(resolved, { adjudicator: resolved.args.adjudicator, approve: resolved.args.approve, reason: resolved.args.reason });
  assert.equal(store.resolveAdjudicationIndexedJob(input).resolved, true);
  assert.equal(store.resolveAdjudicationIndexedJob(input).resolved, false);
  assert.throws(() => store.resolveAdjudicationIndexedJob({ ...input, reason: `0x${"f".repeat(64)}` }), /conflicts with recorded resolution/);
  assert.throws(() => store.resolveAdjudicationIndexedJob({ ...input, adjudicator: "0x6666666666666666666666666666666666666666" }), /conflicts with bound adjudicator/);
  assert.throws(() => store.resolveAdjudicationIndexedJob({ ...input, reason: "0x1234" }), /bytes32 reason/);
  assert.throws(() => store.resolveAdjudicationIndexedJob({ ...input, approve: "true" }), /boolean approve/);

  const unrequested = new SpaceStore();
  addSubmittedIndexedJob(unrequested);
  assert.throws(() => unrequested.resolveAdjudicationIndexedJob(eventInput(resolved, { adjudicator: resolved.args.adjudicator, approve: true, reason: resolved.args.reason })), /requires an adjudication request/);

  const wrongOutcome = new SpaceStore();
  addAdjudicatingIndexedJob(wrongOutcome);
  const completed = completedLog({ logIndex: 4 });
  wrongOutcome.completeIndexedJob(eventInput(completed, { reason: completed.args.reason }));
  assert.throws(() => wrongOutcome.resolveAdjudicationIndexedJob(eventInput(resolvedLog({ logIndex: 5, approve: false }), { adjudicator: resolved.args.adjudicator, approve: false, reason: resolved.args.reason })), /conflicts with indexed job status 'Completed'/);

  const wrongReason = new SpaceStore();
  addAdjudicatingIndexedJob(wrongReason);
  wrongReason.completeIndexedJob(eventInput(completed, { reason: completed.args.reason }));
  assert.throws(() => wrongReason.resolveAdjudicationIndexedJob(eventInput(resolvedLog({ logIndex: 5 }), { adjudicator: resolved.args.adjudicator, approve: true, reason: resolved.args.reason })), /reason conflicts with the recorded completion/);
  assert.equal(store.getActivity(spaceId).filter((entry) => entry.type === "WORK_ADJUDICATION_RESOLVED").length, 1);
});

test("M9-7: AttestedJobSettlement records evidence then JobCompleted completes the job", async () => {
  const store = new SpaceStore();
  const attested = attestedSettlementLog({ logIndex: 3 });
  const completed = completedLog({ logIndex: 4 });
  const logs = [createdLog({ logIndex: 0 }), fundedLog({ logIndex: 1 }), submittedLog({ logIndex: 2 }), attested, completed];
  const spaceBefore = structuredClone(store.getSpace(spaceId));
  const receiptsBefore = store.receipts.size;
  store._settleJob = async () => { throw new Error("local settlement must not run"); };
  store._claimRefund = () => { throw new Error("local refund must not run"); };
  const client = { getBlockNumber: async () => 10n, getLogs: async () => [...logs].reverse() };
  const indexer = new JobCreatedIndexer({ store, chainId: 1952, contractAddress: indexedContract, client });

  const first = await indexer.sync({ fromBlock: 0, toBlock: 10 });
  const replay = await indexer.sync({ fromBlock: 0, toBlock: 10 });
  const job = [...store.jobs.values()][0];
  const activity = store.getActivity(spaceId);

  assert.equal(first.processed, 5);
  assert.equal(replay.processed, 0);
  assert.equal(replay.skipped, 5);
  assert.equal(job.status, "Completed");
  assert.equal(job.attestedSettlement.provider, attested.args.provider);
  assert.equal(job.attestedSettlement.amount, "123.456789");
  assert.equal(job.attestedSettlement.nonce, "41");
  assert.deepEqual(job.attestedSettlement.sourceLog, { blockNumber: 10, txHash: attested.transactionHash, logIndex: 3 });
  assert.deepEqual(activity.slice(-3).map((entry) => entry.type), ["WORK_SUBMITTED", "WORK_ATTESTED_SETTLEMENT", "WORK_COMPLETED"]);
  const evidenceActivity = activity.find((entry) => entry.type === "WORK_ATTESTED_SETTLEMENT");
  assert.equal(evidenceActivity.fromStatus, "Submitted");
  assert.equal(evidenceActivity.toStatus, "Submitted");
  assert.equal(evidenceActivity.amount, "123.456789");
  assert.equal(evidenceActivity.nonce, "41");
  assert.deepEqual(store.getSpace(spaceId), spaceBefore);
  assert.equal(store.receipts.size, receiptsBefore);
  assert.equal(job.settlement, null);
});

test("M9-7: AttestedJobSettlement evidence is replay-safe and validates its binding", () => {
  const store = new SpaceStore();
  addSubmittedIndexedJob(store);
  const attested = attestedSettlementLog();
  const input = eventInput(attested, { provider: attested.args.provider, amount: attested.args.amount, nonce: attested.args.nonce });
  const completed = completedLog({ logIndex: 4 });

  assert.equal(store.recordIndexedAttestedSettlement(input).recorded, true);
  assert.equal([...store.jobs.values()][0].status, "Submitted");
  assert.equal(store.recordIndexedAttestedSettlement(input).recorded, false);
  assert.equal(store.completeIndexedJob(eventInput(completed, { reason: completed.args.reason })).completed, true);
  assert.equal(store.recordIndexedAttestedSettlement(input).recorded, false);
  assert.throws(() => store.recordIndexedAttestedSettlement({ ...input, nonce: 42n }), /conflicts with recorded evidence/);

  const wrongProvider = new SpaceStore();
  addSubmittedIndexedJob(wrongProvider);
  assert.throws(() => wrongProvider.recordIndexedAttestedSettlement({ ...input, provider: "0x6666666666666666666666666666666666666666" }), /conflicts with indexed job provider/);

  const wrongAmount = new SpaceStore();
  addSubmittedIndexedJob(wrongAmount);
  assert.throws(() => wrongAmount.recordIndexedAttestedSettlement({ ...input, amount: 1n }), /conflicts with indexed job budget/);

  const invalidNonce = new SpaceStore();
  addSubmittedIndexedJob(invalidNonce);
  assert.throws(() => invalidNonce.recordIndexedAttestedSettlement({ ...input, nonce: "41" }), /uint256 nonce/);

  const invalidTransition = new SpaceStore();
  addFundedIndexedJob(invalidTransition);
  assert.throws(() => invalidTransition.recordIndexedAttestedSettlement(input), /cannot record evidence .* from 'Funded'/);

  const missingEvidence = new SpaceStore();
  addSubmittedIndexedJob(missingEvidence);
  missingEvidence.completeIndexedJob(eventInput(completed, { reason: completed.args.reason }));
  assert.throws(() => missingEvidence.recordIndexedAttestedSettlement(input), /cannot record evidence .* from 'Completed'/);
  assert.equal(store.getActivity(spaceId).filter((entry) => entry.type === "WORK_ATTESTED_SETTLEMENT").length, 1);
});

test("M9-7: same-block adjudication and attestation events apply in contract order", async () => {
  const store = new SpaceStore();
  const logs = [
    createdLog({ jobId: 21n, logIndex: 0 }),
    fundedLog({ jobId: 21n, logIndex: 1 }),
    submittedLog({ jobId: 21n, logIndex: 2 }),
    adjudicationLog({ jobId: 21n, logIndex: 3 }),
    refundedLog({ jobId: 21n, logIndex: 4 }),
    rejectedLog({ jobId: 21n, logIndex: 5, rejector: "0x5555555555555555555555555555555555555555", reason: `0x${"a".repeat(64)}` }),
    resolvedLog({ jobId: 21n, logIndex: 6, approve: false, reason: `0x${"a".repeat(64)}` }),
    createdLog({ jobId: 22n, logIndex: 7 }),
    fundedLog({ jobId: 22n, logIndex: 8 }),
    submittedLog({ jobId: 22n, logIndex: 9 }),
    attestedSettlementLog({ jobId: 22n, logIndex: 10 }),
    completedLog({ jobId: 22n, logIndex: 11 }),
  ];
  const spaceBefore = structuredClone(store.getSpace(spaceId));
  const indexer = new JobCreatedIndexer({ store, chainId: 1952, contractAddress: indexedContract, client: { getBlockNumber: async () => 10n, getLogs: async () => [...logs].reverse() } });

  const result = await indexer.sync({ fromBlock: 0, toBlock: 10 });
  const jobs = [...store.jobs.values()];
  const rejected = jobs.find((job) => job.onchainJobId === "21");
  const attested = jobs.find((job) => job.onchainJobId === "22");
  const activity = store.getActivity(spaceId);

  assert.equal(result.processed, 12);
  assert.equal(rejected.status, "Rejected");
  assert.equal(rejected.refunded, true);
  assert.equal(rejected.adjudication.resolution.approve, false);
  assert.equal(attested.status, "Completed");
  assert.equal(attested.attestedSettlement.nonce, "41");
  assert.deepEqual(activity.map((entry) => entry.type), ["WORK_CREATED", "WORK_FUNDED", "WORK_SUBMITTED", "WORK_ADJUDICATION_REQUESTED", "WORK_REFUNDED", "WORK_REJECTED", "WORK_ADJUDICATION_RESOLVED", "WORK_CREATED", "WORK_FUNDED", "WORK_SUBMITTED", "WORK_ATTESTED_SETTLEMENT", "WORK_COMPLETED"]);
  assert.deepEqual(indexer.getCursor(), { blockNumber: 10, txHash: logs.at(-1).transactionHash, logIndex: 11 });
  assert.equal(store.receipts.size, 0);
  assert.deepEqual(store.getSpace(spaceId), spaceBefore);
});

test("M9-7: adjudication resolution and attested evidence persist across restart", async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "microcosm-m9-resolution-"));
  const snapshotPath = path.join(directory, "store.json");
  try {
    const logs = [
      createdLog({ jobId: 31n, blockNumber: 20, logIndex: 0 }),
      fundedLog({ jobId: 31n, blockNumber: 20, logIndex: 1 }),
      submittedLog({ jobId: 31n, blockNumber: 20, logIndex: 2 }),
      adjudicationLog({ jobId: 31n, blockNumber: 20, logIndex: 3 }),
      completedLog({ jobId: 31n, blockNumber: 20, logIndex: 4, reason: `0x${"a".repeat(64)}` }),
      resolvedLog({ jobId: 31n, blockNumber: 20, logIndex: 5, reason: `0x${"a".repeat(64)}` }),
      createdLog({ jobId: 32n, blockNumber: 20, logIndex: 6 }),
      fundedLog({ jobId: 32n, blockNumber: 20, logIndex: 7 }),
      submittedLog({ jobId: 32n, blockNumber: 20, logIndex: 8 }),
      attestedSettlementLog({ jobId: 32n, blockNumber: 20, logIndex: 9, nonce: 77n }),
      completedLog({ jobId: 32n, blockNumber: 20, logIndex: 10 }),
    ];
    const client = { getBlockNumber: async () => 20n, getLogs: async () => logs };
    const store = new SpaceStore();
    const indexer = new JobCreatedIndexer({ store, chainId: 1952, contractAddress: indexedContract, client, dataPath: snapshotPath });
    await indexer.sync({ fromBlock: 0, toBlock: 20 });
    const cursor = indexer.getCursor();

    const restartedStore = new SpaceStore();
    assert.equal(load(restartedStore, snapshotPath), true);
    const restarted = new JobCreatedIndexer({ store: restartedStore, chainId: 1952, contractAddress: indexedContract, client, dataPath: snapshotPath });
    const replay = await restarted.sync({ fromBlock: 0, toBlock: 20 });
    const jobs = [...restartedStore.jobs.values()];
    const adjudicated = jobs.find((job) => job.onchainJobId === "31");
    const attested = jobs.find((job) => job.onchainJobId === "32");

    assert.equal(replay.processed, 0);
    assert.equal(replay.skipped, 11);
    assert.deepEqual(restartedStore.indexerCursors.get(restarted.cursorKey), cursor);
    assert.equal(adjudicated.status, "Completed");
    assert.equal(adjudicated.adjudication.resolution.approve, true);
    assert.deepEqual(adjudicated.adjudication.resolution.sourceLog, { blockNumber: 20, txHash: logs[5].transactionHash, logIndex: 5 });
    assert.equal(attested.status, "Completed");
    assert.equal(attested.attestedSettlement.nonce, "77");
    assert.deepEqual(attested.attestedSettlement.sourceLog, { blockNumber: 20, txHash: logs[9].transactionHash, logIndex: 9 });
    assert.equal(restartedStore.getActivity(spaceId).filter((entry) => entry.type === "WORK_ADJUDICATION_RESOLVED").length, 1);
    assert.equal(restartedStore.getActivity(spaceId).filter((entry) => entry.type === "WORK_ATTESTED_SETTLEMENT").length, 1);
    assert.equal(restartedStore.receipts.size, 0);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("M9-8: ProviderSet updates an Open indexed job without financial side effects", () => {
  const store = new SpaceStore();
  const created = createdLog({ provider: "0x0000000000000000000000000000000000000000" });
  const event = providerSetLog();
  addOpenIndexedJob(store, created);
  const spaceBefore = structuredClone(store.getSpace(spaceId));
  const result = store.setProviderIndexedJob(eventInput(event, { provider: event.args.provider }));
  const job = result.job;

  assert.equal(result.providerSet, true);
  assert.equal(job.status, "Open");
  assert.equal(job.provider, event.args.provider);
  assert.equal(job.escrowedAmount, "0.000000");
  assert.deepEqual(job.sourceLog, { blockNumber: event.blockNumber, txHash: event.transactionHash, logIndex: event.logIndex });
  assert.deepEqual(store.getSpace(spaceId), spaceBefore);
  assert.equal(store.receipts.size, 0);
  assert.equal(store.getActivity(spaceId).at(-1).type, "WORK_PROVIDER_SET");
});

test("M9-8: BudgetSet updates an Open indexed job budget without escrowing", () => {
  const store = new SpaceStore();
  const event = budgetSetLog();
  addOpenIndexedJob(store);
  const spaceBefore = structuredClone(store.getSpace(spaceId));
  const result = store.setBudgetIndexedJob(eventInput(event, { amount: event.args.amount }));

  assert.equal(result.budgetSet, true);
  assert.equal(result.job.status, "Open");
  assert.equal(result.job.budget, "123.456789");
  assert.equal(result.job.escrowedAmount, "0.000000");
  assert.deepEqual(store.getSpace(spaceId), spaceBefore);
  assert.equal(store.receipts.size, 0);
  assert.equal(store.getActivity(spaceId).at(-1).type, "WORK_BUDGET_SET");
});

test("M9-8: AdjudicatorSet updates Open-job metadata without changing status", () => {
  const store = new SpaceStore();
  const event = adjudicatorSetLog();
  addOpenIndexedJob(store);
  const result = store.setAdjudicatorIndexedJob(eventInput(event, { adjudicator: event.args.adjudicator }));

  assert.equal(result.adjudicatorSet, true);
  assert.equal(result.job.status, "Open");
  assert.equal(result.job.adjudicator, event.args.adjudicator);
  assert.equal(result.job.adjudication, null);
  assert.equal(store.getActivity(spaceId).at(-1).type, "WORK_ADJUDICATOR_SET");
});

test("M9-8: RubricSet updates Open-job metadata without changing status", () => {
  const store = new SpaceStore();
  const event = rubricSetLog();
  addOpenIndexedJob(store);
  const result = store.setRubricIndexedJob(eventInput(event, { rubricHash: event.args.rubricHash }));

  assert.equal(result.rubricSet, true);
  assert.equal(result.job.status, "Open");
  assert.equal(result.job.rubricHash, event.args.rubricHash);
  assert.equal(store.getActivity(spaceId).at(-1).type, "WORK_RUBRIC_SET");
});

test("M9-8: EvidenceAttached records the observed hash and source log without inventing a URI", () => {
  const store = new SpaceStore();
  const event = evidenceAttachedLog();
  addSubmittedIndexedJob(store);
  const spaceBefore = structuredClone(store.getSpace(spaceId));
  const result = store.recordIndexedEvidenceAttached(eventInput(event, { deliverableHash: event.args.deliverableHash }));

  assert.equal(result.evidenceAttached, true);
  assert.equal(result.job.status, "Submitted");
  assert.equal(result.job.evidenceUri, null);
  assert.equal(result.job.evidenceAttached.deliverableHash, event.args.deliverableHash);
  assert.deepEqual(result.job.evidenceAttached.sourceLog, { blockNumber: event.blockNumber, txHash: event.transactionHash, logIndex: event.logIndex });
  assert.deepEqual(store.getSpace(spaceId), spaceBefore);
  assert.equal(store.receipts.size, 0);
  assert.equal(store.getActivity(spaceId).at(-1).type, "WORK_EVIDENCE_ATTACHED");
});

test("M9-8: metadata and evidence replays are no-ops while conflicts fail loudly", () => {
  const store = new SpaceStore();
  const created = createdLog({ provider: "0x0000000000000000000000000000000000000000" });
  addOpenIndexedJob(store, created);
  const provider = providerSetLog();
  const budget = budgetSetLog({ logIndex: 2 });
  const adjudicator = adjudicatorSetLog({ logIndex: 3 });
  const rubric = rubricSetLog({ logIndex: 4 });
  const funded = fundedLog({ logIndex: 5 });
  const submitted = submittedLog({ logIndex: 6 });
  const evidence = evidenceAttachedLog({ logIndex: 7 });
  const providerInput = eventInput(provider, { provider: provider.args.provider });
  const budgetInput = eventInput(budget, { amount: budget.args.amount });
  const adjudicatorInput = eventInput(adjudicator, { adjudicator: adjudicator.args.adjudicator });
  const rubricInput = eventInput(rubric, { rubricHash: rubric.args.rubricHash });

  assert.equal(store.setProviderIndexedJob(providerInput).providerSet, true);
  assert.equal(store.setProviderIndexedJob(providerInput).providerSet, false);
  assert.equal(store.setBudgetIndexedJob(budgetInput).budgetSet, true);
  assert.equal(store.setBudgetIndexedJob(budgetInput).budgetSet, false);
  assert.throws(() => store.setBudgetIndexedJob({ ...budgetInput, amount: 1n }), /conflicts/);
  assert.equal(store.setAdjudicatorIndexedJob(adjudicatorInput).adjudicatorSet, true);
  assert.equal(store.setAdjudicatorIndexedJob(adjudicatorInput).adjudicatorSet, false);
  assert.equal(store.setRubricIndexedJob(rubricInput).rubricSet, true);
  assert.equal(store.setRubricIndexedJob(rubricInput).rubricSet, false);
  assert.throws(() => store.setProviderIndexedJob({ ...providerInput, provider: "0x7777777777777777777777777777777777777777" }), /conflicts/);
  assert.throws(() => store.setAdjudicatorIndexedJob({ ...adjudicatorInput, adjudicator: "0x7777777777777777777777777777777777777777" }), /conflicts/);
  assert.throws(() => store.setRubricIndexedJob({ ...rubricInput, rubricHash: `0x${"c".repeat(64)}` }), /conflicts/);

  assert.equal(store.fundIndexedJob(eventInput(funded, { amount: funded.args.amount })).funded, true);
  assert.equal(store.submitIndexedJob(eventInput(submitted, { deliverableHash: submitted.args.deliverableHash })).submitted, true);
  const evidenceInput = eventInput(evidence, { deliverableHash: evidence.args.deliverableHash });
  assert.equal(store.recordIndexedEvidenceAttached(evidenceInput).evidenceAttached, true);
  assert.equal(store.recordIndexedEvidenceAttached(evidenceInput).evidenceAttached, false);
  const secondEvidence = evidenceAttachedLog({ logIndex: 8, txDigit: "9" });
  const secondEvidenceInput = eventInput(secondEvidence, { deliverableHash: secondEvidence.args.deliverableHash });
  assert.equal(store.recordIndexedEvidenceAttached(secondEvidenceInput).evidenceAttached, true);
  assert.throws(() => store.recordIndexedEvidenceAttached({ ...evidenceInput, deliverableHash: `0x${"b".repeat(64)}` }), /conflicts/);
  assert.equal(store.getActivity(spaceId).filter((entry) => entry.type === "WORK_PROVIDER_SET").length, 1);
  assert.equal(store.getActivity(spaceId).filter((entry) => entry.type === "WORK_BUDGET_SET").length, 1);
  assert.equal(store.getActivity(spaceId).filter((entry) => entry.type === "WORK_EVIDENCE_ATTACHED").length, 2);
});

test("M9-8: combined indexer orders all metadata/evidence events canonically in one block", async () => {
  const store = new SpaceStore();
  const logs = [
    createdLog({ provider: "0x0000000000000000000000000000000000000000", logIndex: 0 }),
    providerSetLog({ logIndex: 1 }),
    budgetSetLog({ logIndex: 2 }),
    adjudicatorSetLog({ logIndex: 3 }),
    rubricSetLog({ logIndex: 4 }),
    fundedLog({ logIndex: 5 }),
    submittedLog({ logIndex: 6 }),
    evidenceAttachedLog({ logIndex: 7 }),
  ];
  const spaceBefore = structuredClone(store.getSpace(spaceId));
  const indexer = new JobCreatedIndexer({ store, chainId: 1952, contractAddress: indexedContract, client: { getBlockNumber: async () => 10n, getLogs: async () => [...logs].reverse() } });
  const result = await indexer.sync({ fromBlock: 0, toBlock: 10 });
  const job = [...store.jobs.values()][0];

  assert.equal(result.processed, 8);
  assert.equal(job.status, "Submitted");
  assert.equal(job.provider, providerSetLog().args.provider);
  assert.equal(job.budget, "123.456789");
  assert.equal(job.escrowedAmount, "123.456789");
  assert.equal(job.adjudicator, adjudicatorSetLog().args.adjudicator);
  assert.equal(job.rubricHash, rubricSetLog().args.rubricHash);
  assert.equal(job.evidenceUri, null);
  assert.deepEqual(store.getActivity(spaceId).map((entry) => entry.type), ["WORK_CREATED", "WORK_PROVIDER_SET", "WORK_BUDGET_SET", "WORK_ADJUDICATOR_SET", "WORK_RUBRIC_SET", "WORK_FUNDED", "WORK_SUBMITTED", "WORK_EVIDENCE_ATTACHED"]);
  assert.deepEqual(store.getSpace(spaceId), spaceBefore);
  assert.equal(store.receipts.size, 0);
  assert.deepEqual(indexer.getCursor(), { blockNumber: 10, txHash: evidenceAttachedLog().transactionHash, logIndex: 7 });

  const replay = await indexer.sync({ fromBlock: 0, toBlock: 10 });
  assert.equal(replay.processed, 0);
  assert.equal(replay.skipped, 8);
  assert.equal(store.getActivity(spaceId).length, 8);
});

test("M9-8: invalid metadata ordering and evidence state fail loudly", async () => {
  const providerFirst = new SpaceStore();
  const providerIndexer = new JobCreatedIndexer({ store: providerFirst, chainId: 1952, contractAddress: indexedContract, client: { getBlockNumber: async () => 10n, getLogs: async () => [providerSetLog({ logIndex: 0 }), createdLog({ provider: "0x0000000000000000000000000000000000000000", logIndex: 1 })] } });
  await assert.rejects(providerIndexer.sync({ fromBlock: 0, toBlock: 10 }), /unknown indexed job/);

  const budgetAfterFunding = new SpaceStore();
  addOpenIndexedJob(budgetAfterFunding);
  budgetAfterFunding.fundIndexedJob(eventInput(fundedLog(), { amount: fundedLog().args.amount }));
  assert.throws(() => budgetAfterFunding.setBudgetIndexedJob(eventInput(budgetSetLog({ logIndex: 2 }), { amount: 1n })), /from 'Funded'/);

  const metadataAfterFunding = new SpaceStore();
  addOpenIndexedJob(metadataAfterFunding);
  metadataAfterFunding.fundIndexedJob(eventInput(fundedLog(), { amount: fundedLog().args.amount }));
  assert.throws(() => metadataAfterFunding.setAdjudicatorIndexedJob(eventInput(adjudicatorSetLog(), { adjudicator: adjudicatorSetLog().args.adjudicator })), /from 'Funded'/);
  assert.throws(() => metadataAfterFunding.setRubricIndexedJob(eventInput(rubricSetLog(), { rubricHash: rubricSetLog().args.rubricHash })), /from 'Funded'/);

  const evidenceBeforeFunding = new SpaceStore();
  addOpenIndexedJob(evidenceBeforeFunding);
  assert.throws(() => evidenceBeforeFunding.recordIndexedEvidenceAttached(eventInput(evidenceAttachedLog(), { deliverableHash: `0x${"a".repeat(64)}` })), /from 'Open'/);
});

test("M9-8: metadata/evidence projection persists across restart and remains side-effect free", async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "microcosm-m9-metadata-"));
  const snapshotPath = path.join(directory, "store.json");
  try {
    const logs = [
      createdLog({ provider: "0x0000000000000000000000000000000000000000", blockNumber: 20, logIndex: 0 }),
      providerSetLog({ blockNumber: 20, logIndex: 1 }),
      budgetSetLog({ blockNumber: 20, logIndex: 2 }),
      adjudicatorSetLog({ blockNumber: 20, logIndex: 3 }),
      rubricSetLog({ blockNumber: 20, logIndex: 4 }),
      fundedLog({ blockNumber: 20, logIndex: 5 }),
      submittedLog({ blockNumber: 20, logIndex: 6 }),
      evidenceAttachedLog({ blockNumber: 20, logIndex: 7 }),
    ];
    const client = { getBlockNumber: async () => 20n, getLogs: async () => logs };
    const store = new SpaceStore();
    const indexer = new JobCreatedIndexer({ store, chainId: 1952, contractAddress: indexedContract, client, dataPath: snapshotPath });
    await indexer.sync({ fromBlock: 0, toBlock: 20 });
    const cursor = indexer.getCursor();
    const restartedStore = new SpaceStore();
    assert.equal(load(restartedStore, snapshotPath), true);
    const restarted = new JobCreatedIndexer({ store: restartedStore, chainId: 1952, contractAddress: indexedContract, client, dataPath: snapshotPath });
    const replay = await restarted.sync({ fromBlock: 0, toBlock: 20 });
    const job = [...restartedStore.jobs.values()][0];

    assert.equal(replay.processed, 0);
    assert.equal(replay.skipped, 8);
    assert.deepEqual(restartedStore.indexerCursors.get(restarted.cursorKey), cursor);
    assert.equal(job.provider, providerSetLog().args.provider);
    assert.equal(job.budget, "123.456789");
    assert.equal(job.adjudicator, adjudicatorSetLog().args.adjudicator);
    assert.equal(job.rubricHash, rubricSetLog().args.rubricHash);
    assert.equal(job.evidenceAttached.deliverableHash, evidenceAttachedLog().args.deliverableHash);
    assert.equal(job.evidenceUri, null);
    assert.equal(restartedStore.getActivity(spaceId).length, 8);
    assert.equal(restartedStore.receipts.size, 0);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
