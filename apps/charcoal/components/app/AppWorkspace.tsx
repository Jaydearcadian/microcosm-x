"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { AppDataProvider } from "@/lib/app-data";
import { AppShell, type AppView } from "@/components/app/AppShell";
import { CommandView } from "@/components/app/CommandView";
import { WorkView } from "@/components/app/WorkView";
import { SandboxView } from "@/components/app/SandboxView";
import { SettingsView } from "@/components/app/SettingsView";
import { OnboardingView } from "@/components/app/OnboardingView";
import { EntryGate } from "@/components/app/EntryGate";
import { InviteRedeem } from "@/components/app/InviteRedeem";

const VIEWS: AppView[] = ["overview", "work", "test", "settings"];

/* A shared #sandbox or #governance link used to be the only way to reach those
   surfaces, so they are still accepted and land on wherever that surface lives
   now. The section itself is chosen by the tab or the default inside Settings. */
const LEGACY: Record<string, AppView> = {
  command: "overview",
  sandbox: "test",
  governance: "settings",
  delegation: "settings",
  agent: "settings",
  audit: "settings",
};

function viewFromHash(): AppView {
  if (typeof window === "undefined") return "overview";
  if (window.location.pathname === "/app/onboarding") return "settings";
  const raw = window.location.hash.slice(1);
  const section = raw.split("=")[0];
  if (section === "settings") return "settings";
  return VIEWS.includes(section as AppView) ? (section as AppView) : (LEGACY[section] ?? "overview");
}

export function AppWorkspace({ accessCode = "" }: { accessCode?: string }) {
  const pathname = usePathname();
  const [view, setView] = useState<AppView>(viewFromHash);
  useEffect(() => {
    const sync = () => setView(viewFromHash());
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  const changeView = (next: AppView) => {
    setView(next);
    const path = next === "settings" && window.location.pathname === "/app/onboarding" ? "/app/onboarding" : "/app";
    window.history.replaceState(null, "", `${path}#${next}`);
  };

  if (pathname === "/app/access") {
    return <AppDataProvider><InviteRedeem code={accessCode} /></AppDataProvider>;
  }

  return (
    <AppDataProvider>
      <AppShell active={view} onChange={changeView}>
        {pathname === "/app/onboarding" ? (
          <OnboardingView />
        ) : view === "work" ? (
          <WorkView />
        ) : view === "test" ? (
          <SandboxView />
        ) : view === "settings" ? (
          <SettingsView />
        ) : (
          <CommandView />
        )}
      </AppShell>
    </AppDataProvider>
  );
}
