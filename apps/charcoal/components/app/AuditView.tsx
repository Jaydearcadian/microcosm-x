"use client";

import { AuditStream } from "@/components/app/AuditStream";
import { StatusPill } from "@/components/app/StatusPill";
import { useAppData } from "@/lib/app-data";

export function AuditView() {
  const { activity } = useAppData();
  return <div className="app-view"><header className="app-view__header"><div><span className="eyebrow">AUDIT</span><h1 className="display">Proof has a trail.</h1><p>Activity stays paginated, sequenced, and live without hiding failures.</p></div><StatusPill label={`${activity.length} EVENTS LOADED`} tone="active" /></header><AuditStream embedded /></div>;
}
