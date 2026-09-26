"use client";

import { useState } from "react";
import { GovernanceView } from "@/components/app/GovernanceView";
import { DelegationView } from "@/components/app/DelegationView";
import { AgentView } from "@/components/app/AgentView";
import { AuditView } from "@/components/app/AuditView";
import { OnboardingView } from "@/components/app/OnboardingView";

/**
 * The four surfaces that used to be rail destinations are now tabs here.
 *
 * They were peers of Work and the Sandbox in the rail, which made the rail eight
 * items long and implied that Governance mattered as much as doing a job. None
 * of these are used every day, so they live one level down and the rail stays
 * four items. Which tab is open is in the URL, so a link points at the tab and
 * not just the section.
 */
const TABS = [
  { id: "people", label: "People and agents", hint: "Governance, delegation, agent access" },
  { id: "proof", label: "Proof", hint: "Activity, chain indexer" },
  { id: "setup", label: "Setup guide", hint: "The six steps, explained" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function tabFromHash(): TabId {
  if (typeof window === "undefined") return "people";
  const raw = window.location.hash.split("=")[1] as TabId | undefined;
  return TABS.some((tab) => tab.id === raw) ? raw! : "people";
}

export function SettingsView() {
  const [tab, setTab] = useState<TabId>(tabFromHash);

  const change = (next: TabId) => {
    setTab(next);
    window.history.replaceState(null, "", `/app#settings=${next}`);
  };

  return (
    <div className="app-view">
      <nav className="settings-tabs" aria-label="Settings sections">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`settings-tab${tab === item.id ? " is-active" : ""}`}
            aria-current={tab === item.id ? "page" : undefined}
            onClick={() => change(item.id)}
          >
            <strong>{item.label}</strong>
            <span className="muted">{item.hint}</span>
          </button>
        ))}
      </nav>

      {tab === "people" ? (
        <div className="settings-stack">
          <GovernanceView />
          <DelegationView />
          <AgentView />
        </div>
      ) : tab === "proof" ? (
        <AuditView />
      ) : (
        <OnboardingView />
      )}
    </div>
  );
}
