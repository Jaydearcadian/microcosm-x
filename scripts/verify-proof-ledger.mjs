#!/usr/bin/env node
/**
 * Hardened FORGE 1.4 Proof Ledger Verification Gate
 *
 * Verifies that:
 * 1. Every claim in forge/PROOF_LEDGER.md has a valid status.
 * 2. No claim is marked FAILED or REGRESSED without failing the gate.
 * 3. Every VERIFIED claim has non-empty evidence.
 * 4. All declared evidence suites actually execute and exit with code 0.
 *
 * Usage:
 *   node scripts/verify-proof-ledger.mjs              # Run full verification (audit + test execution)
 *   node scripts/verify-proof-ledger.mjs --check-only # Lint markdown ledger table only (no suite execution)
 *   node scripts/verify-proof-ledger.mjs --ledger-path <path> # Specify alternative ledger file
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

// Command line arguments
const args = process.argv.slice(2);
const checkOnly = args.includes('--check-only') || args.includes('--lint-only');
const ledgerPathArgIdx = args.indexOf('--ledger-path');
const LEDGER_PATH = ledgerPathArgIdx !== -1 && args[ledgerPathArgIdx + 1]
  ? path.resolve(process.cwd(), args[ledgerPathArgIdx + 1])
  : path.join(ROOT_DIR, 'forge', 'PROOF_LEDGER.md');

// Declared execution gates mapped to claims
const EVIDENCE_GATES = [
  {
    id: 'CHAIN-1',
    name: 'Contracts Compilation (Solc 0.8.30, Foundry)',
    command: 'forge build',
    cwd: path.join(ROOT_DIR, 'contracts'),
    claims: ['CHAIN-1'],
  },
  {
    id: 'CHAIN-2..3 / ATTEST / ADJUD',
    name: 'Foundry Contracts Suite (Router, Escrow, Attestation, Adjudication, Commerce)',
    command: 'forge test -vvv',
    cwd: path.join(ROOT_DIR, 'contracts'),
    claims: ['CHAIN-2', 'CHAIN-3', 'ATTEST-1', 'ADJUD-1', 'ADJUD-2'],
  },
  {
    id: 'POLICY-1..7',
    name: 'Space Policy Engine Suite (Limits, Counterparties, DenialProof, Units)',
    command: 'npm run test:policy',
    cwd: ROOT_DIR,
    claims: ['SPACE-1', 'SPACE-2', 'SPACE-3', 'ATTEST-2'],
  },
  {
    id: 'MCP-OFFLINE',
    name: 'MCP Server Offline Tools & Boundary Suite (Capabilities, Work, Gaia Refund)',
    command: 'node --test mcp/test/mcp-server.test.js',
    cwd: ROOT_DIR,
    claims: ['MCP-1', 'MCP-2', 'WORK-1', 'WORK-2', 'WORK-4', 'WORK-7', 'WORK-9'],
  },
  {
    id: 'SERVER-PERSIST',
    name: 'Server Persistence Suite (Atomic snapshots, SIGKILL restore)',
    command: 'node --test packages/server/test/persistence.test.js',
    cwd: ROOT_DIR,
    claims: ['M4'],
  },
  {
    id: 'M12-GOV',
    name: 'M12 Governance EIP-712, Quorum, Auth, Idempotency, and Persistence Suite',
    command: 'node --test packages/policy-engine/test/governance.test.js mcp/test/governance.test.js packages/server/test/governance.test.js packages/server/test/governance-persistence.test.js',
    cwd: ROOT_DIR,
    claims: ['M12-1'],
  },
  {
    id: 'SDK-CLIENT',
    name: 'SDK Client & Policy Boundary Suite (Rest, Bounds, DenialProof, Trace)',
    command: 'node --test packages/sdk/test/client.test.js',
    cwd: ROOT_DIR,
    claims: ['SDK-1..5'],
  },
  {
    id: 'SDK-ABIS',
    name: 'SDK ABI Drift Suite (Curated selectors match compiled artifacts)',
    command: 'node --test packages/sdk/test/abis.test.js',
    cwd: ROOT_DIR,
    claims: ['ABI-DRIFT'],
  },
];

function parseProofLedger(content) {
  const lines = content.split('\n');
  const claims = [];
  const validStatuses = new Set(['UNTESTED', 'PARTIAL', 'FAILED', 'VERIFIED', 'REGRESSED']);

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('| **') && trimmed.endsWith('|')) {
      const cols = trimmed
        .split('|')
        .slice(1, -1)
        .map((c) => c.trim());

      if (cols.length >= 6) {
        const claimId = cols[0].replace(/\*\*/g, '').trim();
        const layer = cols[1];
        const description = cols[2];
        const status = cols[3].replace(/`/g, '').trim();
        const evidence = cols[4];
        const date = cols[5];

        claims.push({ claimId, layer, description, status, evidence, date });
      }
    }
  }

  return { claims, validStatuses };
}

function runEvidenceGates() {
  console.log('----------------------------------------------------------------------');
  console.log('  EXECUTING EVIDENCE VERIFICATION GATES (Zero-Mock Proof)');
  console.log('----------------------------------------------------------------------\n');

  let gatesPassed = 0;
  let gatesFailed = 0;

  for (const gate of EVIDENCE_GATES) {
    const start = Date.now();
    process.stdout.write(`  [GATE] ${gate.name} (${gate.command})... `);
    try {
      execSync(gate.command, {
        cwd: gate.cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 120_000,
        env: { ...process.env, CI: 'true' },
      });
      const elapsed = Date.now() - start;
      console.log(`PASS (${elapsed}ms) ✅`);
      gatesPassed++;
    } catch (err) {
      const elapsed = Date.now() - start;
      console.log(`FAIL (${elapsed}ms) ❌`);
      const stderr = err.stderr ? err.stderr.toString().trim() : '';
      const stdout = err.stdout ? err.stdout.toString().trim() : '';
      if (stderr) console.error(`    Stderr: ${stderr.slice(0, 500)}`);
      if (stdout && !stderr) console.error(`    Stdout: ${stdout.slice(-500)}`);
      gatesFailed++;
    }
  }

  console.log('\n----------------------------------------------------------------------');
  console.log(`Gates Execution Summary: ${gatesPassed} PASSED | ${gatesFailed} FAILED`);
  console.log('----------------------------------------------------------------------\n');

  return { gatesPassed, gatesFailed };
}

function verifyLedger() {
  console.log('\n======================================================================');
  console.log('  FORGE 1.4 PROOF LEDGER VERIFICATION GATE');
  console.log('======================================================================\n');

  if (!fs.existsSync(LEDGER_PATH)) {
    console.error(`❌ Proof ledger not found at ${LEDGER_PATH}`);
    process.exit(1);
  }

  const content = fs.readFileSync(LEDGER_PATH, 'utf8');
  const { claims, validStatuses } = parseProofLedger(content);

  if (claims.length === 0) {
    console.error(`❌ No claims found in ${LEDGER_PATH} table!`);
    process.exit(1);
  }

  let verifiedCount = 0;
  let failedCount = 0;
  let partialCount = 0;
  let untestedCount = 0;
  let invalidStatusCount = 0;

  console.log(`Auditing ${claims.length} claims in ${path.relative(ROOT_DIR, LEDGER_PATH)}:\n`);

  for (const claim of claims) {
    if (!validStatuses.has(claim.status)) {
      console.error(`  ❌ [${claim.claimId}] INVALID STATUS: "${claim.status}"`);
      invalidStatusCount++;
      continue;
    }

    if (claim.status === 'VERIFIED') {
      if (!claim.evidence || claim.evidence.trim().length === 0) {
        console.error(`  ❌ [${claim.claimId}] VERIFIED claim missing evidence!`);
        failedCount++;
      } else {
        console.log(`  ✅ [${claim.claimId}] (${claim.layer}) ${claim.status} — ${claim.evidence}`);
        verifiedCount++;
      }
    } else if (claim.status === 'FAILED' || claim.status === 'REGRESSED') {
      console.error(`  ❌ [${claim.claimId}] ${claim.status} — ${claim.description}`);
      failedCount++;
    } else if (claim.status === 'PARTIAL') {
      console.log(`  ⚠️  [${claim.claimId}] PARTIAL — ${claim.description}`);
      partialCount++;
    } else {
      console.log(`  ⏳ [${claim.claimId}] UNTESTED — ${claim.description}`);
      untestedCount++;
    }
  }

  console.log('\n----------------------------------------------------------------------');
  console.log(`Claims Audit Summary: ${verifiedCount} VERIFIED | ${partialCount} PARTIAL | ${untestedCount} UNTESTED | ${failedCount} FAILED`);
  console.log('----------------------------------------------------------------------\n');

  let gatesFailed = 0;
  if (!checkOnly) {
    const res = runEvidenceGates();
    gatesFailed = res.gatesFailed;
  } else {
    console.log('ℹ️  Skipping evidence suite execution (--check-only flag provided).\n');
  }

  if (invalidStatusCount > 0 || failedCount > 0 || gatesFailed > 0) {
    console.error('❌ Proof ledger verification FAILED: Invalid statuses, failed claims, or failed evidence gates detected.');
    process.exit(1);
  }

  console.log('🎉 PROOF LEDGER VERIFIED: All claims adhere to FORGE 1.4 ground rules with executable evidence.\n');
}

verifyLedger();
