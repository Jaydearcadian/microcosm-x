"use client";

import { useEffect, useState } from "react";
import { AppDataProvider } from "@/lib/app-data";
import { AppShell, type AppView } from "@/components/app/AppShell";
import { CommandView } from "@/components/app/CommandView";
import { WorkView } from "@/components/app/WorkView";
import { OnboardingView } from "@/components/app/OnboardingView";
import { AuditView } from "@/components/app/AuditView";

const VIEWS: AppView[] = ["command", "work", "onboarding", "audit"];

function viewFromHash(): AppView {
  if (typeof window === "undefined") return "command";
  if (window.location.pathname === "/app/onboarding") return "onboarding";
  const value = window.location.hash.slice(1) as AppView;
  return VIEWS.includes(value) ? value : "command";
}

export function AppWorkspace() {
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
  return <AppDataProvider><AppShell active={view} onChange={changeView}>{view === "command" ? <CommandView /> : view === "work" ? <WorkView /> : view === "onboarding" ? <OnboardingView /> : <AuditView />}</AppShell></AppDataProvider>;
}
