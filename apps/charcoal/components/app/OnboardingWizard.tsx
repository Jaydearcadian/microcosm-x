"use client";

import { useMemo, useState } from "react";
import {
  createJob,
  createParticipant,
  createRequest,
  createSpace,
  evaluateJob,
  fetchHealth,
  fetchSpaces,
  fundSpace,
  submitDeliverable,
  type Health,
  type ParticipantKind,
} from "@/lib/contract";
import { CardRise } from "@/components/motion";
import { SectionIntro } from "@/components/app/SectionIntro";
import { useAppData } from "@/lib/app-data";
import { SpaceAccess } from "@/components/app/SpaceAccess";

/**
 * Steps are written for someone who has never heard of a Space, a Work Order,
 * or a bounded ledger. Each one says what you are about to do, why it matters,
 * and what you will have when it is done. The internal vocabulary is kept
 * deliberately thin: the product term appears once, in parentheses, so the
 * person reading this learns the idea before the jargon.
 */
const STEPS = [
  {
    key: "connect",
    title: "Connect",
    copy: "Check that the system is switched on and you can be identified.",
    goal: "Confirm the app is talking to a real server before you build anything on top of it.",
  },
  {
    key: "space",
    title: "Space",
    copy: "Make one container for your company to work in. Everything else happens inside it.",
    goal: "A Space (the one container) holding your money, your people, and your rules together.",
  },
  {
    key: "roster",
    title: "Participants",
    copy: "Add who is working here: people, AI agents, and the vendors you pay.",
    goal: "A roster, so money can only ever be sent to someone you have named in advance.",
  },
  {
    key: "fund",
    title: "Fund",
    copy: "Put a balance in the Space and set the limits on what may be spent.",
    goal: "A funded balance with a per-payment cap and a daily limit, so an agent cannot drain it.",
  },
  {
    key: "request",
    title: "Request",
    copy: "Describe the job you want done and hand it to someone on the roster.",
    goal: "A specific job, assigned, with nobody guessing what was actually asked for.",
  },
  {
    key: "work",
    title: "Work",
    copy: "Do the job, attach proof, and approve or reject it. Money moves only on approval.",
    goal: "A finished job where the proof and the payment are permanently linked.",
  },
] as const;
type StepKey = (typeof STEPS)[number]["key"];

const futureDeadline = () => new Date(Date.now() + 7 * 86400000).toISOString();
const shortHash = (hash: string) => `${hash.slice(0, 10)}…${hash.slice(-8)}`;

export function OnboardingWizard({ embedded = false }: { embedded?: boolean } = {}) {
  const { space, spaceId, participants, jobs, requests, actorId, refresh, loading, error } = useAppData();
  const [active, setActive] = useState<StepKey>("connect");
  const [status, setStatus] = useState<Record<string, string>>({});
  const [health, setHealth] = useState<Health | null>(null);
  const [name, setName] = useState("My Space");
  const [description, setDescription] = useState("Created from the onboarding wizard");
  const [kind, setKind] = useState<ParticipantKind>("Agent");
  const [displayName, setDisplayName] = useState("ProviderBot");
  const [address, setAddress] = useState("");
  const [amount, setAmount] = useState("5.00");
  const [title, setTitle] = useState("First bounded request");
  const [workDescription, setWorkDescription] = useState("First verified provider run");
  const [busy, setBusy] = useState(false);
  const [completed, setCompleted] = useState<Partial<Record<StepKey, boolean>>>({});

  const provider = useMemo(() => participants.find((participant) => participant.address), [participants]);
  const currentRequest = requests[0] || null;
  const currentJob = jobs[0] || null;
  const currentIndex = STEPS.findIndex((step) => step.key === active);
  const setResult = (key: StepKey, value: string) => setStatus((current) => ({ ...current, [key]: value }));
  const finish = (key: StepKey) => setCompleted((current) => ({ ...current, [key]: true }));

  const run = async (key: StepKey) => {
    setActive(key);
    setBusy(true);
    setResult(key, "Checking…");
    try {
      if (key === "connect") {
        const [nextHealth, spaces] = await Promise.all([fetchHealth(), fetchSpaces()]);
        setHealth(nextHealth);
        setResult(key, `API online · chain ${nextHealth.chainId} · ${spaces.length} Space${spaces.length === 1 ? "" : "s"} visible · acting as ${actorId}`);
        finish(key);
        setActive("space");
        return;
      }
      if (key === "space") {
        if (spaceId) {
          setResult(key, `${space?.name ?? "Active Space"} is ready.`);
        } else {
          const created = await createSpace({ name, description, actorId });
          setResult(key, `Created ${created.id}.`);
          await refresh();
        }
        finish(key);
        setActive("roster");
        return;
      }
      if (!spaceId) throw new Error("Create or select a Space first.");
      if (key === "roster") {
        if (provider) {
          setResult(key, `Participant ${provider.displayName} is address-backed and ready for settlement.`);
        } else {
          if (!address.trim()) throw new Error("An address-backed participant is required for settlement.");
          const participant = await createParticipant(spaceId, { kind, displayName, address: address.trim(), actorId });
          setResult(key, `Added ${participant.displayName} as a ${kind} participant with a settlement address.`);
          await refresh();
        }
        finish(key);
        setActive("fund");
        return;
      }
      if (key === "fund") {
        const updated = await fundSpace(spaceId, amount, actorId);
        setResult(key, `Space ledger balance is ${updated.balance} USDC. v1 funding is bookkeeping; no wallet transfer occurred.`);
        await refresh();
        finish(key);
        setActive("request");
        return;
      }
      if (key === "request") {
        if (currentRequest) {
          setResult(key, `${currentRequest.requestId} is already available.`);
        } else {
          const request = await createRequest(spaceId, { createdBy: actorId, assignee: provider?.displayName, title, instructions: "Created from onboarding" });
          setResult(key, `Created and assigned ${request.requestId}.`);
          await refresh();
        }
        finish(key);
        setActive("work");
        return;
      }
      if (!provider) throw new Error("Add an address-backed provider before creating Work.");
      if (!currentRequest) throw new Error("Create the first Request before creating Work.");
      let job = currentJob;
      if (!job) {
        const created = await createJob(spaceId, {
          actorId,
          provider: provider.address!,
          evaluator: actorId,
          description: workDescription,
          budget: amount,
          deadline: futureDeadline(),
          requestId: currentRequest.requestId,
        });
        job = created.job;
        setResult(key, `Created ${job.jobId} and escrowed ${job.budget} USDC.`);
        await refresh();
      }
      if (job.status === "Funded") {
        const submitted = await submitDeliverable(spaceId, job.jobId, { actorId: provider.address!, deliverableHash: `0x${"a".repeat(64)}`, evidenceUri: "ipfs://QmOnboardingProof" });
        job = submitted.job;
        setResult(key, `Submitted proof for ${job.jobId}.`);
        await refresh();
      }
      if (job.status === "Submitted") {
        const settled = await evaluateJob(spaceId, job.jobId, actorId, true, "Verified by onboarding evaluator");
        const txHash = settled.receipt?.txHash;
        setResult(key, txHash ? `Settled ${shortHash(txHash)} on chain.` : `Settlement returned no receipt.`);
        await refresh();
      }
      finish(key);
    } catch (reason) {
      setResult(key, reason instanceof Error ? reason.message : "The step could not be completed.");
    } finally {
      setBusy(false);
    }
  };

  const move = (offset: number) => {
    const next = STEPS[Math.max(0, Math.min(STEPS.length - 1, currentIndex + offset))];
    setActive(next.key);
  };

  return <section className={`app-section app-section--wizard ${embedded ? "app-section--embedded" : ""}`} id="onboarding"><div className="container">{!embedded && <SectionIntro eyebrow="THE COMMERCE OS" segments={[{ text: "Build a Space where" }, { text: "people and software", accent: true }, { text: " work together." }]} copy="Bring your participants, set the boundaries, then move work from request to proof to settlement. Every step calls the real API." />}{embedded && <div className="wizard-lede"><span className="eyebrow">GETTING STARTED</span><h1 className="display">Get started in six steps.</h1><p>Connect a wallet, create the Space your company works in, add who is working there, put money in it with limits, then run one job from request to payment.</p><div className="wizard-readout"><strong>One Space. People and software, working under the same rules.</strong><span>Add participants, fund the ledger, and turn a request into verifiable work.</span></div></div>}{error && <div className="action-flash action-flash--danger">{error}</div>}<div className="wizard-grid"><CardRise className="wizard-steps"><div className="wizard-step-list">{STEPS.map((step, index) => <button type="button" key={step.key} className={`wizard-step ${active === step.key ? "is-active" : ""}`} onClick={() => setActive(step.key)}><span className="font-ui">{completed[step.key] ? "✓" : `0${index + 1}`}</span><strong>{step.title}</strong><span className="muted">{step.copy}</span>{status[step.key] && <em>{status[step.key]}</em>}</button>)}</div></CardRise><CardRise delay={0.18} className="wizard-panel"><div className="wizard-panel__top"><span className="eyebrow">STEP {String(currentIndex + 1).padStart(2, "0")} OF {STEPS.length}</span><span className="font-ui muted" style={{ fontSize: 10 }}>{STEPS[currentIndex].key.toUpperCase()}</span></div><h3>{STEPS[currentIndex].title}</h3><p className="muted">{STEPS[currentIndex].copy}</p><p className="wizard-goal"><strong>You end up with</strong> {STEPS[currentIndex].goal}</p>{active === "connect" && <><div className="wizard-intro"><h4>What you are setting up</h4><p>You are about to give your company one place where staff and AI agents work together and spend money, with rules that limit what an agent may spend, and a permanent record of everything that happened.</p><p className="wizard-intro__note">The problem this solves: handing an AI agent a company card means one wrong instruction, or one prompt it read online, can spend your money with nobody able to explain why. Here the agent asks, the rules answer yes or no, and a refusal is recorded rather than retried until it goes through.</p><ol className="wizard-intro__steps"><li>Check the system is on</li><li>Create your Space</li><li>Add who is working here</li><li>Add money and set limits</li><li>Describe a job</li><li>Do the job and pay for it</li></ol><p className="wizard-intro__note">Every button below calls the real API. Nothing here is a mock-up, and a refusal you see is a real refusal.</p></div><div className="wizard-readout"><strong>{health ? `Chain ${health.chainId}` : "API not checked"}</strong><span>{health ? `${health.network} · acting as ${actorId}` : "Run the check before continuing."}</span></div><div className="wizard-actions"><button type="button" className="wizard-run" onClick={() => void run("connect")} disabled={busy}>Check API and identity</button></div></>}{active === "space" && <><div className="wizard-readout"><strong>{space?.name ?? "No Space yet"}</strong><span>{space ? `${space.network} · chain ${space.chainId}` : "A Space is required before roster and funding."}</span></div>{!space && <div className="wizard-fields"><label className="wizard-field">SPACE NAME<input value={name} onChange={(event) => setName(event.target.value)} /></label><label className="wizard-field">DESCRIPTION<input value={description} onChange={(event) => setDescription(event.target.value)} /></label></div>}<div className="wizard-actions"><button type="button" className="wizard-run" onClick={() => void run("space")} disabled={busy}>{space ? "Continue with active Space" : "Create Space"}</button></div></>}{active === "roster" && <><div className="wizard-readout"><strong>{provider ? provider.displayName : "No address-backed provider"}</strong><span>{provider?.address ?? "Add a provider wallet to make settlement real."}</span></div><div className="wizard-fields"><label className="wizard-field">PARTICIPANT<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label><label className="wizard-field">KIND<select value={kind} onChange={(event) => setKind(event.target.value as ParticipantKind)}><option>Agent</option><option>Human</option><option>Service</option><option>Organization</option><option>Counterparty</option></select></label></div><label className="wizard-field">PARTICIPANT WALLET ADDRESS<input value={address} onChange={(event) => setAddress(event.target.value)} placeholder="0x…" /></label><p className="wizard-hint">This is the address that would <em>receive</em> a payment, and it is what makes settlement real rather than simulated. Any address works. If you do not have one to hand, leave it blank and finish the setup: you can explore everything, and the Sandbox will show you both an approved and a blocked payment. Add an address later to move real money on X Layer.</p><div className="wizard-actions"><button type="button" className="wizard-run" onClick={() => void run("roster")} disabled={busy}>{provider ? "Use existing participant" : "Add participant"}</button></div><SpaceAccess /></>}{active === "fund" && <><div className="wizard-readout"><strong>{space?.balance ?? "0.00"} USDC</strong><span>What the Space can spend right now. In this demo you type the balance in directly; nothing is taken from your wallet.</span></div><label className="wizard-field">ADD TO SPACE LEDGER (USDC)<input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" /></label><div className="wizard-actions"><button type="button" className="wizard-run" onClick={() => void run("fund")} disabled={busy}>Fund Space ledger</button></div></>}{active === "request" && <><div className="wizard-readout"><strong>{currentRequest?.title ?? "No Request yet"}</strong><span>{currentRequest ? `${currentRequest.requestId} · ${currentRequest.status}` : "The provider will receive the first bounded request."}</span></div>{!currentRequest && <><label className="wizard-field">REQUEST TITLE<input value={title} onChange={(event) => setTitle(event.target.value)} /></label><div className="wizard-actions"><button type="button" className="wizard-run" onClick={() => void run("request")} disabled={busy}>Create and assign Request</button></div></>}{currentRequest && <div className="wizard-actions"><button type="button" className="wizard-run" onClick={() => void run("request")} disabled={busy}>Continue to Work</button></div>}</>}{active === "work" && <><div className="wizard-readout"><strong>{currentJob ? `${currentJob.jobId} · ${currentJob.status}` : "No Work Order yet"}</strong><span>{currentJob ? `${currentJob.budget} USDC · ${currentJob.deliverableHash ? "proof submitted" : "awaiting proof"}` : `Provider: ${provider?.displayName ?? "not configured"}`}</span></div><label className="wizard-field">WORK DESCRIPTION<input value={workDescription} onChange={(event) => setWorkDescription(event.target.value)} /></label><div className="wizard-actions"><button type="button" className="wizard-run" onClick={() => void run("work")} disabled={busy || !provider || !currentRequest}>{currentJob?.status === "Completed" ? "Work already settled" : currentJob?.status === "Submitted" ? "Evaluate and settle" : "Create, submit, and evaluate"}</button></div></>}{status[active] && <p className={`wizard-result ${completed[active] ? "is-done" : ""}`}>{status[active]}</p>}<div className="wizard-actions"><button type="button" className="wizard-next" onClick={() => move(-1)} disabled={currentIndex === 0 || busy}>Back</button><button type="button" className="wizard-next" onClick={() => move(1)} disabled={currentIndex === STEPS.length - 1 || busy}>Next step</button></div></CardRise></div></div></section>;
}
