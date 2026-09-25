"use client";

import { Gauge } from "@/components/Gauge";
import { CardRise } from "@/components/motion";
import { HashChip } from "@/components/HashChip";
import { StatusPill } from "@/components/app/StatusPill";
import { SectionIntro } from "@/components/app/SectionIntro";
import { useAppData } from "@/lib/app-data";

const money = (v: string | number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(Number(v));

export function SpaceCommandCenter() {
  const { space, bounds, capabilities, participants, loading, error, actorId, setActorId, spaces, setSpaceId } = useAppData();
  if (loading) return <section className="app-section"><div className="container app-loading">Loading Space Command Center…</div></section>;
  if (error || !space || !bounds) return <section className="app-section"><div className="container app-error"><strong>Command Center unavailable.</strong><p>{error ?? "The API returned no Space."}</p><p className="muted">Start the local server on :8787 or point NEXT_PUBLIC_MICROCOSM_API at the live API.</p></div></section>;
  const spent = Number(bounds.spentToday); const total = Number(bounds.dailyBudget); const escrow = Number(bounds.escrowed); const consumed = Math.max(spent + escrow, 0);
  const cap = Number(bounds.maxPerTransaction); const members = participants.length;
  return <section className="app-section" id="command">
    <div className="container">
      <SectionIntro eyebrow="SPACE COMMAND CENTER" segments={[{ text: "One place to see what is" }, { text: "in bounds", accent: true }, { text: "." }]} copy="The Space is the control surface: one treasury, one policy surface, and the participant roster that shares it." />
      <div className="command-toolbar"><label className="app-select">SPACE <select value={space.id} onChange={(event) => setSpaceId(event.target.value)}>{spaces.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="app-select">ACTING AS <select value={actorId} onChange={(event) => setActorId(event.target.value)}><option value="admin-01">Treasury Admin</option><option value="agent-procure-01">Procurement Agent</option></select></label><StatusPill label={`${bounds.denials} DENIALS HELD`} tone={bounds.denials ? "danger" : "active"} /></div>
      <div className="command-grid">
        <CardRise className="command-panel command-panel--gauge"><div className="command-panel__head"><span className="eyebrow">SHARED TREASURY</span><span className="font-ui muted" style={{ fontSize: 10 }}>{space.network} · {space.chainId}</span></div><div className="command-gauge"><Gauge total={total} consumed={consumed} threshold={cap} denials={bounds.denials} size={300} /></div><div className="command-panel__foot"><span className="font-ui" style={{ fontSize: 22 }}>{money(bounds.treasuryBalance)}</span><span className="muted">treasury balance</span></div></CardRise>
        <CardRise delay={0.12} className="command-panel"><div className="command-panel__head"><span className="eyebrow">AUTHORITY METERS</span><span className="muted" style={{ fontSize: 11 }}>same rules for everyone</span></div><div className="authority-list"><div className="authority-row"><span>Per transaction</span><strong className="font-ui">{money(cap)}</strong><div className="authority-track"><i style={{ width: `${Math.min((cap / total) * 100, 100)}%` }} /></div></div><div className="authority-row"><span>Daily budget</span><strong className="font-ui">{money(spent)} / {money(total)}</strong><div className="authority-track"><i style={{ width: `${Math.min((spent / total) * 100, 100)}%` }} /></div></div><div className="authority-row"><span>Escrowed</span><strong className="font-ui">{money(escrow)}</strong><div className="authority-track"><i className="authority-track--soft" style={{ width: `${Math.min((escrow / total) * 100, 100)}%` }} /></div></div></div><div className="command-panel__foot"><span>{members} active participants</span><span>{capabilities?.actor.role ?? actorId}</span></div></CardRise>
        <CardRise delay={0.24} className="command-panel command-panel--wide"><div className="command-panel__head"><span className="eyebrow">POLICY MATRIX</span><span className="muted" style={{ fontSize: 11 }}>read before write</span></div><div className="policy-table">{[["Per-transaction cap", money(cap)], ["Daily budget", money(total)], ["Approved counterparties", String(capabilities?.rules.allowedCounterparties.length ?? 0)], ["Treasury balance", money(bounds.treasuryBalance)]].map(([label, value]) => <div className="policy-row" key={label}><span>{label}</span><strong className="font-ui">{value}</strong><span className="muted">any participant</span></div>)}</div></CardRise>
        <CardRise delay={0.36} className="command-panel command-panel--wide"><div className="command-panel__head"><span className="eyebrow">MEMBER ROSTER</span><span className="muted" style={{ fontSize: 11 }}>{participants.length} active</span></div><div className="roster-grid">{participants.map((participant) => <div className="roster-member" key={participant.participantId}><div className="roster-avatar">{participant.displayName.slice(0, 1).toUpperCase()}</div><div><strong>{participant.displayName}</strong><span className="muted">{participant.kind} · {participant.role}</span></div><StatusPill label={participant.status.toUpperCase()} tone="active" /></div>)}</div>{participants.some((p) => p.address) && <div className="roster-addresses">{participants.filter((p) => p.address).map((p) => <HashChip key={p.participantId} hash={p.address as string} simulated={!p.address?.startsWith("0x06")} label={p.displayName} />)}</div>}</CardRise>
      </div>
    </div>
  </section>;
}
