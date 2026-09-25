"use client";

import { ReactNode } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { useAppData } from "@/lib/app-data";

export type AppView = "command" | "work" | "onboarding" | "audit";
const NAV: Array<{ id: AppView; label: string; hint: string }> = [
  { id: "command", label: "Command Center", hint: "Bounds & roster" },
  { id: "work", label: "Work", hint: "Escrow & delivery" },
  { id: "onboarding", label: "Onboarding", hint: "Five-step setup" },
  { id: "audit", label: "Audit", hint: "Activity & SSE" },
];

export function AppShell({ active, onChange, children }: { active: AppView; onChange: (view: AppView) => void; children: ReactNode }) {
  const { space, spaces, setSpaceId, actorId, setActorId, refresh, loading } = useAppData();
  return <div className="app-root"><SiteHeader /><div className="app-workspace"><aside className="app-rail"><div className="app-rail__brand"><span className="app-rail__mark">M</span><div><strong>MICROCOSM</strong><span>SPACE COMMAND</span></div></div><div className="app-rail__space"><span className="eyebrow">ACTIVE SPACE</span><select value={space?.id ?? ""} onChange={(event) => setSpaceId(event.target.value)} aria-label="Active Space">{spaces.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div><nav className="app-rail__nav" aria-label="App views">{NAV.map((item) => <button key={item.id} className={active === item.id ? "is-active" : ""} onClick={() => onChange(item.id)}><span className="font-ui">{String(NAV.indexOf(item) + 1).padStart(2, "0")}</span><strong>{item.label}</strong><small>{item.hint}</small></button>)}</nav><div className="app-rail__foot"><label className="app-rail__actor"><span>ACTING AS</span><select value={actorId} onChange={(event) => setActorId(event.target.value)}><option value="admin-01">Treasury Admin</option><option value="agent-procure-01">Procurement Agent</option></select></label><button className="app-refresh" onClick={() => void refresh()} disabled={loading}>{loading ? "SYNCING…" : "↻ REFRESH"}</button><span className="app-rail__status"><i className={loading ? "is-busy" : ""} /> {loading ? "SYNCING" : "API CONNECTED"}</span></div></aside><main className="app-content">{children}</main></div></div>;
}
