# Court-Track Brief — GenLayer Onchain Adjudication (M13 slice)

You own the Internet Court endgame: replace the last non-onchain step
(the verdict) with a GenLayer Intelligent Contract + relay. Backend
(settlement, ledger) and UI (landing) are owned separately — your seams
are frozen interfaces below. Touch nothing outside `contracts/genlayer/`,
`packages/court-relay/`, and court docs without a version-bump discussion.

## 1. Why this track exists

Today `postVerdict`/`resolveAdjudication` accept a Space-level/offchain
verdict and settle REAL money against it. The author of the verdict is
trusted by configuration. GenLayer turns that trust into decentralized
AI-validator consensus — which is the entire point of M13 and the last
item the founder flagged as "simulated."

## 2. Frozen seams (do not renegotiate unilaterally)

- **Solidity:** `contracts/src/IAdjudicator.sol` — the resolver receives
  `(jobId, deliverableHash, evidenceUri, rubricHash)` and calls back
  `AgenticCommerce.resolveAdjudication(jobId, approve, reason)`, which only
  the bound adjudicator contract may call. Deployed kernel addresses:
  `forge.json → deployment.deployments.testnet.contracts`.
- **Space layer:** `work_request_verdict` → `Adjudicating`;
  `work_post_verdict` by `adjudicatorId`. REST shapes in
  `docs/API_CONTRACT.md` v1.
- **Behavioral spec:** `contracts/src/test/MockAdjudicator.sol` — your
  implementation must satisfy every assertion its tests encode.

## 3. Architecture (the honest version)

GenLayer cannot call X Layer directly. The loop is therefore:

1. Case opens on X Layer (`requestAdjudication`, already built).
2. **Relay** (your `packages/court-relay/`): watches `AdjudicationRequested`
   events → submits the case tuple to the GenLayer IC → waits for GenLayer
   finality → posts the verdict to `resolveAdjudication` (and/or
   `work_post_verdict` for the Space layer).
3. **Trust model, stated plainly:** the relay key is a trusted relayer until
   GenLayer light-client verification exists. Document this in
   `contracts/genlayer/TRUST_MODEL.md`. No hidden trust — the fallback
   today is identical (configured adjudicator), so this is strictly an
   upgrade path, never a regression.

## 4. Deliverables (in order)

1. `contracts/genlayer/verdict_ic.py` — Intelligent Contract: `submit_case`
   stores the tuple; `render_verdict` evaluates deliverable vs rubric via
   the LLM and returns `(approve: bool, reason: bytes32-compatible)`.
2. `contracts/genlayer/test_verdict.py` — `genlayer-test` **Direct Mode**
   tests (milliseconds, no Docker): valid case → verdict shape; rubric
   mismatch → reject; malformed case → loud error.
3. `packages/court-relay/` — event watcher → GenLayer submit → finality wait
   → X Layer `resolveAdjudication` poster. Transport-only logic; all
   judgment lives in the IC.
4. Relay dry-run test against local anvil + a stub GenLayer endpoint
   (test doubles live in TESTS — production code never fakes a verdict).
5. `contracts/genlayer/README.md` — deploy recipe for GenLayer testnet
   (Asimov/Bradbury), Studio Mode validation steps, and what remains
   blocked on testnet access/funds.

## 5. Constraints

- Python 3.12+, `pip install genlayer-test` (small). No Docker required
  unless you choose Studio Mode validation.
- No testnet spend without founder approval. Anvil + Direct Mode cover
  everything until then.
- Reference research (already done, verify before building):
  GenLayer docs (intelligent-contracts, testing, GenLayerJS/PY), testnets
  Asimov + Bradbury live, Internet Court (`internetcourt.org`) is GenLayer's
  own open-standard initiative — our `IAdjudicator` design aligns with it
  deliberately. GenLayer contracts are Python; cross-contract calls are
  async `emit()`; appeals/finality are first-class concepts — your relay
  must wait for finality, not first vote.

## 6. Acceptance

- [ ] `pytest contracts/genlayer` green in Direct Mode.
- [ ] Relay dry-run settles a real escrow on local anvil end to end.
- [ ] `TRUST_MODEL.md` states the relayer assumption and the light-client upgrade.
- [ ] No changes to Solidity/API/MCP surfaces except additive, versioned ones.
- [ ] Testnet deployment recipe reviewed but NOT executed without approval.
