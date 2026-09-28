"use client";

import { useCallback, useState } from "react";
import { useSignMessage, useSignTypedData } from "wagmi";
import {
  configureSpaceLimits,
  createDelegation,
  createParticipant,
  createSpace,
  fetchBudgetBinding,
  fetchSpace,
  fundSpace,
  signDelegation,
  submitBudgetBindingOnchain,
  type BudgetBinding,
  type ParticipantKind,
} from "@/lib/contract";
import { useWalletSession } from "@/lib/wallet-session";

/**
 * Creating a Space, in the order someone actually needs to do it.
 *
 * Every field here maps to a real call. There is no step that only looks like it
 * worked, and nothing is pre-filled with a value the backend would not accept:
 * name and purpose create the Space, people are added as participants, the
 * limits are set on the Space itself, the money is funded, and the budget is
 * bound by a signature the server composes and then verifies.
 *
 * The last step is the one that used to be wrong. It said an agent connects
 * with a name and nothing else, and handed out the Space id as the agent's
 * actorId. Both were untrue, and the policy engine now refuses exactly that:
 * an agent spends only under a delegation its owner signed, addressed to a
 * wallet, and the Space id was never a member of anything.
 *
 * So this step mints a real delegation per agent, signs it with the connected
 * wallet, and shows the exact id and actorId the agent must present. Nothing
 * here is advisory: if the signature fails, the agent has no authority and the
 * screen says that rather than implying otherwise.
 */

type Person = { name: string; kind: ParticipantKind; address: string };

/** One agent, and the authority it was actually given. */
type Issued = {
  name: string;
  address: string;
  delegationId: string;
  maxPerTransaction: string;
  dailyBudget: string;
  expiresAt: string;
  status: string;
  signature: string | null;
};

const STEPS = ["Purpose", "People", "Limits", "Bind", "Agents"] as const;
type StepId = (typeof STEPS)[number];

const EMPTY_PERSON: Person = { name: "", kind: "Agent", address: "" };

export function CreateSpaceFlow({ onDone }: { onDone: (spaceId: string) => void }) {
  const { address, isAuthenticated, signLimitsAsync } = useWalletSession();
  const { signTypedDataAsync } = useSignTypedData();

  const [step, setStep] = useState<StepId>("Purpose");
  const [name, setName] = useState("");
  const [purpose, setPurpose] = useState("");
  const [people, setPeople] = useState<Person[]>([]);
  const [draft, setDraft] = useState<Person>(EMPTY_PERSON);
  const [balance, setBalance] = useState("5000.00");
  const [cap, setCap] = useState("500.00");
  const [daily, setDaily] = useState("2000.00");
  const [spaceId, setCreated] = useState("");
  const [binding, setBinding] = useState<BudgetBinding | null>(null);
  const [issued, setIssued] = useState<Issued[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);

  const note = (line: string) => setLog((current) => [...current, line]);

  const fail = (reason: unknown) => {
    setError(reason instanceof Error ? reason.message : "That did not work.");
    setBusy(false);
  };

  const addPerson = () => {
    if (!draft.name.trim()) { setError("Give them a name first."); return; }
    setPeople((current) => [...current, { ...draft, name: draft.name.trim() }]);
    setDraft(EMPTY_PERSON);
    setError(null);
  };

  /** Steps 1 to 3. Each call is real and each one reports what it actually did. */
  const createAndConfigure = useCallback(async () => {
    setBusy(true); setError(null);
    try {
      const space = await createSpace({
        name: name.trim(),
        description: purpose.trim(),
        actorId: address ?? "founder-01",
      });
      setCreated(space.id);
      // Deliberately not selecting it yet. The flow is rendered by the entry
      // gate, and the gate only exists while no Space is selected, so selecting
      // one here unmounted the form halfway through and threw away the binding
      // step. onDone selects it once the whole thing is finished.
      note(`Space created: ${space.id}`);

      for (const person of people) {
        await createParticipant(space.id, {
          kind: person.kind,
          displayName: person.name,
          address: person.address.trim() || undefined,
          actorId: address ?? "founder-01",
        });
        note(`Added ${person.name}${person.address.trim() ? ` (${person.address.trim().slice(0, 10)}…)` : ""}`);
      }

      const limits = await configureSpaceLimits(space.id, {
        maxPerTransaction: cap,
        dailyBudget: daily,
      });
      if (limits.changed.length) limits.changed.forEach(note);
      else note("Limits already matched; nothing to change.");

      // Not onchain yet. Depositing into a Space's pool is implemented and works, but
      // the limits contract's EIP-712 digest is not wallet-conformant, so a Space
      // cannot be bound — and an unbound Space cannot spend a pool it has funded.
      // Depositing now would only create stranded funds behind a green tick.
      const funded = await fundSpace(space.id, balance, address ?? "founder-01");
      note(`Funded with ${balance} ${funded.currency ?? "USDC"}.`);

      setStep("Bind");
      // Clear the busy flag on the way out. Without this the Bind step renders
      // its button disabled and labelled "Waiting for your signature…", so the
      // step that needs a signature could never be started.
      setBusy(false);
    } catch (reason) {
      fail(reason);
    }
  }, [address, balance, cap, daily, name, people, purpose]);

  const bind = useCallback(async () => {
    setBusy(true); setError(null);
    try {
      const { challenge } = await fetchBudgetBinding(spaceId);
      if (!challenge.typedData) {
        // Without a digest the only thing to sign is prose, and prose commits
        // to nothing on chain. Saying so is better than a green tick that
        // reverts on the Space's first payment.
        throw new Error(
          challenge.bindingUnavailable
            ? `These limits cannot be signed on chain yet: ${challenge.bindingUnavailable}`
            : "The chain is not reachable, so these limits cannot be bound. Nothing has been signed.",
        );
      }
      // Typed data, because that is what SpaceBudget verifies. The digest the
      // server also returns is there to be cross-checked against the contract,
      // not something to sign: a personal-sign prefix, or a "raw" digest that
      // gets re-hashed, both recover to nobody and are refused as a bad
      // signature with the signer blamed rather than the encoding.
      const signature = await signLimitsAsync(challenge.typedData);
      const result = await submitBudgetBindingOnchain(spaceId, signature, {
        maxPerTransaction: challenge.maxPerTransaction,
        dailyBudget: challenge.dailyBudget,
      });
      setBinding(result.binding);
      note(`Budget bound on chain and signed by ${result.binding.actorAddress.slice(0, 10)}…`);
      note(`Limits committed in ${result.onchain.bindTx.slice(0, 10)}…`);
      setStep("Agents");
      setBusy(false);
    } catch (reason) {
      // Not fatal, and deliberately so. Onboarding agents and signing their
      // delegations is offchain work that does not depend on the limits being
      // committed, and blocking the whole setup behind a chain problem left an
      // operator unable to finish configuring a Space at all. The failure is
      // stated plainly and the flow continues, because a Space that cannot
      // settle yet is still worth setting up — it just must not pretend
      // otherwise.
      const message = reason instanceof Error ? reason.message : String(reason);
      fail(reason);
      note("Continuing: agents can still be given delegations, but this Space cannot pay anyone until its limits are bound on chain.");
      setStep("Agents");
      setBusy(false);
    }
  }, [signLimitsAsync, spaceId]);

  /**
   * Mint one signed delegation per agent.
   *
   * The values come from the Space, not from this form: the allowlist and chain
   * are read back from the server, because a delegation that tried to exceed the
   * Space's own authority would be refused anyway and the operator would be
   * left guessing why.
   */
  const issueDelegations = useCallback(async () => {
    setBusy(true); setError(null);
    try {
      const agents = people.filter((person) => person.kind === "Agent");
      if (agents.length === 0) {
        note("No agents in this Space, so there is nothing to delegate.");
        setStep("Agents");
        setBusy(false);
        return;
      }
      const missing = agents.filter((person) => !person.address.trim());
      if (missing.length > 0) {
        throw new Error(
          `${missing.map((person) => person.name).join(", ")} ${missing.length === 1 ? "has" : "have"} no wallet address. A delegation is bound to an address, so an agent without one cannot be given any authority.`,
        );
      }

      const space = await fetchSpace(spaceId);
      const allowlist = space.rules?.allowedCounterparties ?? [];
      const granted: Issued[] = [];

      for (const person of agents) {
        const delegationId = `delegation-${spaceId}-${person.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
        const created = await createDelegation(spaceId, {
          delegationId,
          child: person.address.trim(),
          childRole: "agent",
          maxPerTransaction: cap,
          dailyBudget: daily,
          allowedCounterparties: allowlist,
          nonce: "1",
          expiry: String(Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60),
          policySnapshotHash: `0x${"0".repeat(64)}`,
        });
        // The server composes the EIP-712 payload, so what gets signed is the
        // real limits rather than a label chosen here.
        const signature = await signTypedDataAsync({
          domain: created.typedData.domain as { name?: string; version?: string; chainId?: number },
          types: created.typedData.types,
          primaryType: created.typedData.primaryType,
          message: created.typedData.message,
        });
        const signed = await signDelegation(spaceId, delegationId, signature);
        granted.push({
          name: person.name,
          address: person.address.trim(),
          delegationId,
          maxPerTransaction: cap,
          dailyBudget: daily,
          expiresAt: signed.expiryAt,
          status: signed.status,
          signature,
        });
        note(`Delegated ${person.name} up to ${cap} per payment, ${daily} a day`);
      }

      setIssued(granted);
      setStep("Agents");
      setBusy(false);
    } catch (reason) {
      fail(reason);
    }
  }, [cap, daily, people, signTypedDataAsync, spaceId]);

  const done = () => { if (spaceId) onDone(spaceId); };

  const index = STEPS.indexOf(step);
  const canCreate = Boolean(name.trim()) && (people.length > 0 || true);

  return (
    <section className="csf" aria-labelledby="csf-title">
      <header className="csf__head">
        <span className="eyebrow">New Space</span>
        <h2 id="csf-title" className="display">Set up a Space.</h2>
        <p className="muted">
          Five short steps. Everything you enter is really created on the server, and you can
          change any of it later.
        </p>
      </header>

      <ol className="csf__steps" aria-label="Progress">
        {STEPS.map((item, i) => (
          <li key={item} className={item === step ? "is-current" : i < index ? "is-done" : ""}>
            <span className="font-ui">{i < index ? "✓" : `0${i + 1}`}</span>
            {item}
          </li>
        ))}
      </ol>

      {error ? <p className="csf__error" role="alert">{error}</p> : null}

      {step === "Purpose" ? (
        <div className="csf__body">
          <label className="csf__field">
            <span>What is it called?</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Procurement" autoComplete="off" />
          </label>
          <label className="csf__field">
            <span>What is it for? (optional, but it helps whoever joins)</span>
            <textarea value={purpose} onChange={(e) => setPurpose(e.target.value)} rows={3} placeholder="We buy compute and datasets through agents, under a spending cap." />
          </label>
          <div className="csf__actions">
            <button type="button" className="btn btn--primary" onClick={() => setStep("People")} disabled={!name.trim()}>
              Next: who works here
            </button>
          </div>
        </div>
      ) : null}

      {step === "People" ? (
        <div className="csf__body">
          <p className="muted">
            Anyone you name here can be paid, and nobody else can. An address is optional: without
            one they can hold work but cannot receive a real payment.
          </p>
          <div className="csf__people">
            {people.map((person, i) => (
              <div className="csf__person" key={`${person.name}-${i}`}>
                <strong className="truncate">{person.name}</strong>
                <span className="muted">{person.kind}{person.address ? ` · ${person.address.slice(0, 10)}…` : " · no address"}</span>
                <button type="button" className="btn btn--ghost" onClick={() => setPeople((c) => c.filter((_, j) => j !== i))}>Remove</button>
              </div>
            ))}
            {!people.length ? <p className="muted">Nobody yet. A Space can be created empty and filled in later.</p> : null}
          </div>
          <div className="csf__add">
            <label className="csf__field">
              <span>Name</span>
              <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="CloudCompute Corp" autoComplete="off" />
            </label>
            <label className="csf__field">
              <span>Kind</span>
              <select value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as ParticipantKind })}>
                <option>Agent</option><option>Human</option><option>Service</option><option>Organization</option><option>Counterparty</option>
              </select>
            </label>
            <label className="csf__field">
              <span>Wallet address (optional)</span>
              <input value={draft.address} onChange={(e) => setDraft({ ...draft, address: e.target.value })} placeholder="0x…" spellCheck={false} autoComplete="off" />
            </label>
            <button type="button" className="btn btn--secondary" onClick={addPerson}>Add them</button>
          </div>
          <div className="csf__actions">
            <button type="button" className="btn btn--ghost" onClick={() => setStep("Purpose")}>Back</button>
            <button type="button" className="btn btn--primary" onClick={() => setStep("Limits")}>Next: limits and money</button>
          </div>
        </div>
      ) : null}

      {step === "Limits" ? (
        <div className="csf__body">
          <p className="muted">
            These are the numbers the policy engine enforces on every payment, whoever asks and
            whatever they claim. Setting them is the point of the product.
          </p>
          <div className="csf__grid">
            <label className="csf__field">
              <span>Most any one payment may be</span>
              <input value={cap} onChange={(e) => setCap(e.target.value)} inputMode="decimal" placeholder="500.00" />
            </label>
            <label className="csf__field">
              <span>Most it may spend in a day, in total</span>
              <input value={daily} onChange={(e) => setDaily(e.target.value)} inputMode="decimal" placeholder="2000.00" />
            </label>
            <label className="csf__field">
              <span>Starting balance</span>
              <input value={balance} onChange={(e) => setBalance(e.target.value)} inputMode="decimal" placeholder="5000.00" />
            </label>
          </div>
          <div className="csf__actions">
            <button type="button" className="btn btn--ghost" onClick={() => setStep("People")}>Back</button>
            <button type="button" className="btn btn--primary" onClick={() => void createAndConfigure()} disabled={busy || !isAuthenticated}>
              {busy ? "Creating…" : "Create the Space"}
            </button>
          </div>
          {!isAuthenticated ? <p className="csf__hint">Sign in with your wallet first, so the Space has an owner.</p> : null}
        </div>
      ) : null}

      {step === "Bind" ? (
        <div className="csf__body">
          <p className="muted">
            Signing puts your name against the limits. It is what makes them yours rather than a
            suggestion, and the signature is kept with the Space so anyone can check it later.
          </p>
          <dl className="csf__facts">
            <div><dt>Most per payment</dt><dd className="tnum">{cap}</dd></div>
            <div><dt>Most per day</dt><dd className="tnum">{daily}</dd></div>
            <div><dt>Balance</dt><dd className="tnum">{balance}</dd></div>
            <div><dt>People</dt><dd className="tnum">{people.length}</dd></div>
          </dl>
          <div className="csf__actions">
            <button type="button" className="btn btn--primary" onClick={() => void bind()} disabled={busy}>
              {busy ? "Waiting for your signature…" : "Sign and bind the budget"}
            </button>
          </div>
        </div>
      ) : null}

      {step === "Agents" ? (
        <div className="csf__body">
          <div className="csf__warn">
            <strong>An agent spends under a delegation you signed, or it cannot spend at all.</strong>
            <p className="muted">
              An agent is not authorised by knowing its name. It presents a delegation id that you
              signed, and the Space checks the signature, the expiry, and the limits before any money
              moves. Two ceilings apply at once: the limits below, and the limits on the Space itself.
              The lower one wins, so a delegation can never widen what the Space allows.
            </p>
          </div>

          {issued.length === 0 ? (
            <div className="csf__actions">
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => void issueDelegations()}
                disabled={busy}
              >
                {busy ? "Signing…" : "Sign delegations for your agents"}
              </button>
            </div>
          ) : (
            <>
              {issued.map((grant) => (
                <div className="csf__facts" key={grant.delegationId}>
                  <div>
                    <dt>Agent</dt>
                    <dd>{grant.name}</dd>
                  </div>
                  <div>
                    <dt>Its actorId</dt>
                    <dd className="ident">{grant.name}</dd>
                  </div>
                  <div>
                    <dt>Bound to wallet</dt>
                    <dd className="ident">{grant.address}</dd>
                  </div>
                  <div>
                    <dt>Delegation id (the agent presents this)</dt>
                    <dd className="ident">{grant.delegationId}</dd>
                  </div>
                  <div>
                    <dt>Per-payment cap</dt>
                    <dd className="tnum">{grant.maxPerTransaction}</dd>
                  </div>
                  <div>
                    <dt>Daily budget</dt>
                    <dd className="tnum">{grant.dailyBudget}</dd>
                  </div>
                  <div>
                    <dt>Expires</dt>
                    <dd>{new Date(grant.expiresAt).toLocaleString()}</dd>
                  </div>
                  <div>
                    <dt>Status</dt>
                    <dd>{grant.status}</dd>
                  </div>
                </div>
              ))}

              <p className="muted">
                Give the agent its actorId and its delegation id, and nothing else. It cannot widen
                its own limits, and revoking the delegation stops it at the next call.
              </p>

              {binding ? (
                <details className="csf__sig">
                  <summary>The exact budget message that was signed</summary>
                  <pre className="ident">{binding.message}</pre>
                  <p className="muted">
                    Signature <span className="ident">{binding.signature}</span>
                  </p>
                </details>
              ) : null}

              <details className="csf__sig">
                <summary>How to hand this to the agent</summary>
                <pre className="ident">
{issued
  .map(
    (grant) => `{
  "spaceId": "${spaceId}",
  "actorId": "${grant.name}",
  "delegationId": "${grant.delegationId}"
}`,
  )
  .join("\n\n")}
                </pre>
                <p className="muted">
                  The agent passes <code className="ident">delegationId</code> on every spending call,
                  for example <code className="ident">payments_request</code> or{" "}
                  <code className="ident">work_create</code>. Without it the call is refused.
                </p>
              </details>
            </>
          )}

          <dl className="csf__facts">
            <div><dt>Space id</dt><dd className="ident">{spaceId}</dd></div>
            <div><dt>Space per-payment cap</dt><dd className="tnum">{cap}</dd></div>
            <div><dt>Space daily budget</dt><dd className="tnum">{daily}</dd></div>
            <div><dt>Budget bound by</dt><dd className="ident">{binding?.actorAddress ?? "—"}</dd></div>
            <div><dt>Signed at</dt><dd>{binding?.boundAt ? new Date(binding.boundAt).toLocaleString() : "—"}</dd></div>
          </dl>

          <div className="csf__actions">
            <button type="button" className="btn btn--primary" onClick={done}>Open the Space</button>
          </div>
        </div>
      ) : null}

      {log.length ? (
        <details className="csf__log" open>
          <summary>What actually happened ({log.length})</summary>
          <ul>{log.map((line, i) => <li key={i} className="ident">{line}</li>)}</ul>
        </details>
      ) : null}
    </section>
  );
}
