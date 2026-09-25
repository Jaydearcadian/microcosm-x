"use client";

import { useState } from "react";
import { AppDataProvider } from "@/lib/app-data";
import { AppShell, type AppView } from "@/components/app/AppShell";
import { CommandView } from "@/components/app/CommandView";
import { WorkView } from "@/components/app/WorkView";
import { OnboardingView } from "@/components/app/OnboardingView";
import { AuditView } from "@/components/app/AuditView";

export function AppWorkspace() {
  const [view, setView] = useState<AppView>("command");
  return <AppDataProvider><AppShell active={view} onChange={setView}>{view === "command" ? <CommandView /> : view === "work" ? <WorkView /> : view === "onboarding" ? <OnboardingView /> : <AuditView />}</AppShell></AppDataProvider>;
}
