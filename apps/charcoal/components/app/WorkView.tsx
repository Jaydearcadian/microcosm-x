"use client";

import { WorkKanban } from "@/components/app/WorkKanban";
import { StatusPill } from "@/components/app/StatusPill";
import { useAppData } from "@/lib/app-data";

export function WorkView() {
  const { jobs } = useAppData();
  return <div className="app-view"><header className="app-view__header"><div><span className="eyebrow">WORK</span><h1 className="display">Proof before payout.</h1><p>Every state transition stays visible from escrow to settlement or refund.</p></div><StatusPill label={`${jobs.length} WORK ORDERS`} tone="active" /></header><WorkKanban embedded /></div>;
}
