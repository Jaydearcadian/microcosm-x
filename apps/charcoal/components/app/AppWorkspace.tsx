"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { AppDataProvider } from "@/lib/app-data";
import { AppShell, type AppView } from "@/components/app/AppShell";
import { CommandView } from "@/components/app/CommandView";
import { WorkView } from "@/components/app/WorkView";
import { GovernanceView } from "@/components/app/GovernanceView";
import { DelegationView } from "@/components/app/DelegationView";
import { OnboardingView } from "@/components/app/OnboardingView";
import { AuditView } from "@/components/app/AuditView";
import { InviteRedeem } from "@/components/app/InviteRedeem";

const VIEWS: AppView[] = ["command", "work", "governance", "delegation", "onboarding", "audit"];

function viewFromHash(): AppView {
  if (typeof window === "undefined") return "command";
  if (window.location.pathname === "/app/onboarding") return "onboarding";
  const value = window.location.hash.slice(1) as AppView;
  return VIEWS.includes(value) ? value : "command";
}

export function AppWorkspace({ accessCode = "" }: { accessCode?: string } = {}) {
  const pathname = usePathname();
  const [view, setView] = useState<AppView>(viewFromHash);
  useEffect(() => {
    const sync = () => setView(viewFromHash());
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  const changeView = (next: AppView) => {
    setView(next);
    const path = next === "onboarding" ? "/app/onboarding" : "/app";
    window.history.replaceState(null, "", `${path}#${next}`);
  };
  return <AppDataProvider><AppShell active={view} onChange={changeView}>{pathname === "/app/access" ? <InviteRedeem code={accessCode} /> : view === "command" ? <CommandView /> : view === "work" ? <WorkView /> : view === "governance" ? <GovernanceView /> : view === "delegation" ? <DelegationView /> : view === "onboarding" ? <OnboardingView /> : <AuditView />}</AppShell></AppDataProvider>;
}
