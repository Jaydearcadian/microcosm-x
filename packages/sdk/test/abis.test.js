/**
 * ABI drift test: every curated signature in src/abis.json must exist in the
 * freshly compiled contract artifacts with an IDENTICAL selector. If a
 * contract changes, this fails loudly instead of shipping a stale ABI.
 *
 * Requires compiled artifacts (forge build). No chain needed.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { keccak256 } from '../../../packages/policy-engine/src/attestation.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, '..', '..', '..', 'contracts', 'out');
const ABIS = JSON.parse(readFileSync(path.join(HERE, '..', 'src', 'abis.json'), 'utf8'));

const CONTRACT_FILE = {
  AgenticCommerce: 'AgenticCommerce.sol/AgenticCommerce.json',
  SettlementRouter: 'SettlementRouter.sol/SettlementRouter.json',
  ClaimEscrow: 'ClaimEscrow.sol/ClaimEscrow.json',
};

const keccakHex = (str) => keccak256(new TextEncoder().encode(str));

/** Canonical signature from a nameless human-readable fragment. */
function canonicalSig(frag) {
  const m = frag.match(/^(function|event)\s+(\w+)\((.*)\)$/s);
  if (!m) throw new Error(`unparseable fragment: ${frag}`);
  const [, , name, params] = m;
  const compact = params.replace(/\s*indexed\s*/g, '').replace(/\s+/g, '');
  return `${name}(${compact})`;
}

function artifactSelectors(name) {
  const p = path.join(OUT, CONTRACT_FILE[name]);
  if (!existsSync(p)) throw new Error(`missing artifact ${p} — run forge build first`);
  const abi = JSON.parse(readFileSync(p, 'utf8')).abi;
  const typ = (i) => i.type.startsWith('tuple')
    ? `(${i.components.map(typ).join(',')})${i.type.slice('tuple'.length)}`
    : i.type;
  const map = new Map();
  for (const item of abi) {
    if (item.type !== 'function' && item.type !== 'event') continue;
    const sig = `${item.name}(${item.inputs.map(typ).join(',')})`;
    map.set((item.type === 'event' ? 'event:' : '') + sig, keccakHex(sig));
  }
  return map;
}

for (const [contract, frags] of Object.entries(ABIS)) {
  if (contract.startsWith('_')) continue;
  test(`ABI-DRIFT: curated ${contract} selectors match compiled artifacts`, () => {
    const selectors = artifactSelectors(contract);
    assert.ok(selectors.size > 0);
    for (const frag of frags) {
      const sig = canonicalSig(frag);
      const key = (frag.startsWith('event ') ? 'event:' : '') + sig;
      assert.ok(selectors.has(key), `${contract}: curated entry missing onchain: ${sig}`);
      const full = key.startsWith('event:') ? key.slice(6) : key;
      assert.equal(
        keccakHex(full).slice(0, frag.startsWith('event ') ? 66 : 10),
        (frag.startsWith('event ') ? selectors.get(key) : selectors.get(key).slice(0, 10)),
        `${contract}.${sig} selector mismatch — contract changed, regenerate abis.json`
      );
    }
  });
}
