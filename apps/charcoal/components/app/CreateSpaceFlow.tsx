"use client";

import { useCallback, useState } from "react";
import { useSignMessage } from "wagmi";
import {
  configureSpaceLimits,
  createParticipant,
  createSpace,
  fetchBudgetBinding,
  fundSpace,
  submitBudgetBinding,
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
 * The step that looked like a formality is the one that matters. An agent
 * connecting over MCP identifies itself with an actorId and nothing else, so
 * whoever holds that name can spend the Space's money. Handing it out is the
 * moment authority leaves the building, and the screen says so.
 */

type Person = { name: string; kind: ParticipantKind; address: string };

const STEPS = ["Purpose", "People", "Limits", "Bind", "Agents"] as const;
type StepId = (typeof STEPS)[number];

const EMPTY_PERSON: Person = { name: "", kind: "Agent", address: "" };

export function CreateSpaceFlow({ onDone }: { onDone: (spaceId: string) => void }) {
  const { address, isAuthenticated } = useWalletSession();
  const { signMessageAsync } = useSignMessage();

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

      const funded = await fundSpace(space.id, balance, address ?? "founder-01");
      note(`Funded with ${balance} ${funded.currency ?? "USDC"}.`);

      setStep("Bind");
    } catch (reason) {
      fail(reason);
    }
  }, [address, balance, cap, daily, name, people, purpose]);

  const bind = useCallback(async () => {
    setBusy(true); setError(null);
    try {
      const { challenge } = await fetchBudgetBinding(spaceId);
      // The message is composed by the server, so what is signed is the real
      // limits and not a label chosen here.
      const signature = await signMessageAsync({ message: challenge.message });
      const result = await submitBudgetBinding(spaceId, signature, challenge.nonce);
      setBinding(result.binding);
      note(`Budget bound and signed by ${result.binding.actorAddress.slice(0, 10)}…`);
      setStep("Agents");
    } catch (reason) {
      fail(reason);
    }
  }, [signMessageAsync, spaceId]);

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
            <strong>Read this before you hand out the agent name.</strong>
            <p className="muted">
              An agent connects over MCP with a name and nothing else. It does not sign anything.
              Whoever holds <code className="ident">{spaceId}</code> can spend this Space&apos;s money
              up to the limits above, and the only thing standing between that and a mistake is the
              cap. Give the agent to one process, and lower the cap to what you can afford to lose.
            </p>
          </div>
          <dl className="csf__facts">
            <div><dt>Space id (the agent's actorId)</dt><dd className="ident">{spaceId}</dd></div>
            <div><dt>Per-payment cap</dt><dd className="tnum">{cap}</dd></div>
            <div><dt>Daily budget</dt><dd className="tnum">{daily}</dd></div>
            <div><dt>Bound by</dt><dd className="ident">{binding?.actorAddress ?? "—"}</dd></div>
            <div><dt>Signed at</dt><dd>{binding?.boundAt ? new Date(binding.boundAt).toLocaleString() : "—"}</dd></div>
          </dl>
          {binding ? (
            <details className="csf__sig">
              <summary>The exact message that was signed</summary>
              <pre className="ident">{binding.message}</pre>
              <p className="muted">Signature <span className="ident">{binding.signature}</span></p>
            </details>
          ) : null}
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
