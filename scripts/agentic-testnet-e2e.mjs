#!/usr/bin/env node

import assert from 'node:assert/strict';
import { SpaceStore } from '../mcp/src/space-store.js';
import { handleToolCall } from '../mcp/src/tools.js';
import { deployerAddress, liveReady } from '../mcp/src/xlayer.js';

const FOUNDER = 'agent-founder-01';
const AGENT = 'Procurement Agent';
const OPERATOR = 'Treasury Operator';
const PROVIDER = 'Provider Agent';
const CHAIN_ID = 1952;
const futureDeadline = () => new Date(Date.now() + 7 * 86400000).toISOString();
const txHashOk = (value) => typeof value === 'string' && /^0x[0-9a-fA-F]{64}$/.test(value);

function parseResult(result) {
  const text = result.content?.[0]?.text || '';
  try {
    return JSON.parse(text);
  } catch {
    return { _raw: text };
  }
}

async function main() {
  const ready = await liveReady();
  assert.equal(ready.ok, true, ready.reason);
  assert.equal(ready.chainId, CHAIN_ID);

  const deployer = deployerAddress();
  const providerAddress = process.env.PROVIDER_ADDRESS || deployer;
  const store = new SpaceStore();
  const history = [];

  async function call(tool, args) {
    const response = await handleToolCall(store, tool, args);
    const data = parseResult(response);
    const summary = {
      tool,
      status: data.status || null,
      spaceId: data.space?.id || data.spaceId || null,
      requestId: data.request?.requestId || data.requestId || null,
      jobId: data.job?.jobId || data.jobId || null,
      txHash: data.receipt?.txHash || null,
    };
    history.push(summary);
    console.log(JSON.stringify(summary));
    if (response.isError && data.status !== 'REJECTED') {
      throw new Error(`${tool} failed: ${data._raw || data.error?.message || 'unknown MCP error'}`);
    }
    return data;
  }

  const created = await call('spaces_create', {
    name: `Agentic Testnet ${Date.now()}`,
    description: 'Tool-using agent acceptance run on OKX X Layer Testnet',
    actorId: FOUNDER,
  });
  const spaceId = created.space.id;

  await call('participants_add', { spaceId, kind: 'Counterparty', displayName: PROVIDER, address: providerAddress, actorId: FOUNDER });
  await call('participants_add', { spaceId, kind: 'Agent', displayName: OPERATOR, address: deployer, actorId: FOUNDER });
  await call('participants_add', { spaceId, kind: 'Agent', displayName: AGENT, actorId: FOUNDER });
  await call('spaces_fund', { spaceId, amount: '10.00', actorId: FOUNDER });

  const requestResult = await call('requests_create', {
    spaceId,
    createdBy: FOUNDER,
    title: 'Agent acceptance request',
    instructions: 'Produce a verifiable result within the Space budget.',
  });
  const requestId = requestResult.request.requestId;
  await call('requests_accept', { spaceId, requestId, actorId: AGENT });
  const received = await call('requests_receive', { spaceId, requestId, actorId: AGENT });
  assert.equal(received.request.requestId, requestId);
  assert.ok(received.authority);
  assert.ok(received.space);

  const workResult = await call('work_create', {
    spaceId,
    actorId: OPERATOR,
    provider: providerAddress,
    evaluator: OPERATOR,
    description: 'Agent acceptance work order',
    budget: '1.00',
    deadline: futureDeadline(),
    requestId,
  });
  const jobId = workResult.job.jobId;
  await call('work_submit', {
    spaceId,
    jobId,
    actorId: providerAddress,
    deliverableHash: `0x${'7'.repeat(64)}`,
    evidenceUri: 'ipfs://QmAgenticTestnetProof',
  });
  const settled = await call('work_evaluate', {
    spaceId,
    jobId,
    evaluatorId: OPERATOR,
    approved: true,
    feedback: 'Agent proof accepted by the testnet evaluator',
  });
  assert.equal(settled.status, 'Completed');
  assert.equal(settled.receipt.status, 'SETTLED');
  assert.ok(txHashOk(settled.receipt.txHash));
  assert.ok(txHashOk(settled.receipt.txHashes.complete));
  assert.ok(settled.receipt.onchainJobId);

  await call('requests_complete', {
    spaceId,
    requestId,
    actorId: AGENT,
    result: { output: 'Agent completed the bounded work', workId: jobId, evidence: [settled.receipt.receiptId] },
  });

  const denied = await call('payments_request', {
    spaceId,
    actorId: OPERATOR,
    recipient: providerAddress,
    amount: '900.00',
    memo: 'Agent policy-boundary probe',
  });
  assert.equal(denied.status, 'REJECTED');
  assert.ok(denied.denialProof?.proofHash);

  const trace = await call('activity_trace', { spaceId, requestId });
  assert.equal(trace.chain.request.requestId, requestId);
  assert.equal(trace.chain.work.jobId, jobId);
  assert.equal(trace.chain.payment.txHash, settled.receipt.txHash);
  assert.ok(txHashOk(trace.chain.payment.txHashes.complete));

  console.log(JSON.stringify({
    result: 'PASS',
    network: 'OKX X Layer Testnet',
    chainId: CHAIN_ID,
    spaceId,
    requestId,
    jobId,
    txHash: settled.receipt.txHash,
    toolCalls: history.length,
    transcript: history,
  }));
}

main().catch((error) => {
  console.error(JSON.stringify({ result: 'FAIL', error: error instanceof Error ? error.message : String(error) }));
  process.exitCode = 1;
});
