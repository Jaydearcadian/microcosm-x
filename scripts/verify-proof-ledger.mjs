import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const LEDGER_PATH = path.join(ROOT_DIR, 'forge', 'PROOF_LEDGER.md');

function parseProofLedger(content) {
  const lines = content.split('\n');
  const claims = [];
  const validStatuses = new Set(['UNTESTED', 'PARTIAL', 'FAILED', 'VERIFIED', 'REGRESSED']);

  let inTable = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('| **') && trimmed.endsWith('|')) {
      const cols = trimmed
        .split('|')
        .slice(1, -1)
        .map(c => c.trim());
      
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
    console.error('❌ No claims found in PROOF_LEDGER.md table!');
    process.exit(1);
  }

  let verifiedCount = 0;
  let failedCount = 0;
  let partialCount = 0;
  let untestedCount = 0;
  let invalidStatusCount = 0;

  console.log(`Auditing ${claims.length} claims in forge/PROOF_LEDGER.md:\n`);

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
      console.log(`  ❌ [${claim.claimId}] ${claim.status} — ${claim.description}`);
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
  console.log(`Summary: ${verifiedCount} VERIFIED | ${partialCount} PARTIAL | ${untestedCount} UNTESTED | ${failedCount} FAILED`);
  console.log('----------------------------------------------------------------------\n');

  if (invalidStatusCount > 0 || failedCount > 0) {
    console.error('❌ Proof ledger verification FAILED: Invalid statuses or failed claims detected.');
    process.exit(1);
  }

  console.log('🎉 PROOF LEDGER VERIFIED: All claims adhere to FORGE 1.4 ground rules with evidence.\n');
}

verifyLedger();
