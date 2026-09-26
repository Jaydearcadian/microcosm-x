"use client";

import { ReactNode, useCallback, useEffect, useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { SiteHeader } from "@/components/SiteHeader";
import { Icon, type IconName } from "@/components/ui/Icon";
import { useAppData } from "@/lib/app-data";
import { useWalletSession } from "@/lib/wallet-session";

export type AppView = "command" | "work" | "governance" | "delegation" | "agent" | "sandbox" | "onboarding" | "audit";

const NAV: Array<{ id: AppView; label: string; hint: string; icon: IconName }> = [
  { id: "command", label: "Command Center", hint: "Bounds & roster", icon: "command" },
  { id: "work", label: "Work", hint: "Escrow & delivery", icon: "work" },
  { id: "governance", label: "Governance", hint: "Quorum & approvals", icon: "governance" },
  { id: "delegation", label: "Delegation", hint: "Narrower authority", icon: "delegation" },
  { id: "agent", label: "Agent", hint: "Capabilities & x402", icon: "agent" },
  { id: "sandbox", label: "Sandbox", hint: "One-click verdicts", icon: "sandbox" },
  { id: "onboarding", label: "Onboarding", hint: "Six-step setup", icon: "onboarding" },
  { id: "audit", label: "Audit", hint: "Activity & SSE", icon: "audit" },
];

/* Two groups, split by a hairline: the surfaces an operator opens constantly,
   then the ones they open deliberately (DESIGN.md §3). */
const NAV_GROUPS: AppView[][] = [
  ["command", "work", "governance", "delegation"],
  ["agent", "sandbox", "onboarding", "audit"],
];

/* Below 1024px the rail DEFAULTS to the collapsed 64px icon rail: at 768px a
   264px rail was 34% of the viewport, which is the measured complaint in
   DESIGN-REVIEW.md §4. "auto" means "whatever the breakpoint says"; an explicit
   choice by the operator overrides it at every width, and is persisted. */
type RailPref = "auto" | "open" | "collapsed";
const NARROW_RAIL = "(max-width: 1023.98px)";
const RAIL_KEY = "microcosm:rail";

function readRailPref(): RailPref {
  try {
    const stored = window.localStorage.getItem(RAIL_KEY);
    if (stored === "open" || stored === "collapsed") return stored;
  } catch {}
  return "auto";
}

export function AppShell({ active, onChange, children }: { active: AppView; onChange: (view: AppView) => void; children: ReactNode }) {
  const { space, spaces, setSpaceId, actorId, setActorId, refresh, loading } = useAppData();
  const { isConnected, isAuthenticated, authenticate, disconnect, isAuthenticating, error } = useWalletSession();
  const actors = space?.members?.length ? space.members : [{ id: actorId, name: actorId, role: "unaffiliated" }];
  // The rail is the primary navigation, so it collapses to an icon strip rather
  // than disappearing: an operator scanning eight views should not lose them.
  const [narrow, setNarrow] = useState(false);
  const [railPref, setRailPref] = useState<RailPref>("auto");

  useEffect(() => {
    const query = window.matchMedia(NARROW_RAIL);
    const sync = () => setNarrow(query.matches);
    sync();
    query.addEventListener("change", sync);
    setRailPref(readRailPref());
    return () => query.removeEventListener("change", sync);
  }, []);

  const railCollapsed = railPref === "auto" ? narrow : railPref === "collapsed";
  // is-expanded is only for the case CSS cannot see on its own: the operator
  // asked for the labelled rail at a width where the default hides it.
  const railClass = `app-rail${railCollapsed ? " is-collapsed" : narrow ? " is-expanded" : ""}`;
  const toggleRail = useCallback(() => {
    setRailPref((current) => {
      // Toggling from the breakpoint default means "I want the other one", and
      // from there it stays an explicit choice the breakpoints do not override.
      const effective = current === "auto" ? (narrow ? "collapsed" : "open") : current;
      const next: RailPref = effective === "collapsed" ? "open" : "collapsed";
      try {
        window.localStorage.setItem(RAIL_KEY, next);
      } catch {}
      return next;
    });
  }, [narrow]);

  const wallet = (
    <div className="app-wallet">
      <ConnectButton showBalance={false} chainStatus="icon" />
      {isConnected && !isAuthenticated ? (
        <button className="app-wallet__session" type="button" onClick={() => void authenticate().catch(() => undefined)} disabled={isAuthenticating}>
          {isAuthenticating ? "SIGNING…" : "SIGN SESSION"}
        </button>
      ) : null}
      {isAuthenticated ? (
        <button className="app-wallet__session app-wallet__session--on" type="button" onClick={() => void disconnect()}>
          DISCONNECT
        </button>
      ) : null}
      {error ? <span className="app-wallet__error truncate" role="status">{error}</span> : null}
    </div>
  );

  return (
    <div className="app-root">
      <div className="app-frame">
        <SiteHeader
          onNavigate={onChange}
          onToggleRail={toggleRail}
          railCollapsed={railCollapsed}
          actions={wallet}
        />
        <div className="app-workspace">
          <aside className={railClass}>
            <div className="app-rail__brand">
              <span className="app-rail__mark" aria-hidden="true">M</span>
              <span className="app-rail__space">
                <select
                  className="truncate"
                  value={space?.id ?? ""}
                  onChange={(event) => setSpaceId(event.target.value)}
                  aria-label="Active Space"
                  disabled={!spaces.length}
                >
                  <option value="">No Space yet</option>
                  {spaces.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
                <span className="app-rail__chevron" aria-hidden="true"><Icon name="chevron" size={14} /></span>
              </span>
            </div>
            <div className="app-rail__search" aria-hidden="true">
              <span className="app-rail__label truncate">Search</span>
              <span className="app-rail__keycap">/</span>
            </div>
            <nav className="app-rail__nav" aria-label="App views">
              {NAV_GROUPS.map((group, index) => (
                <div className="app-rail__group" key={group[0]}>
                  {index > 0 ? <div className="app-rail__divider" role="presentation" /> : null}
                  {NAV.filter((item) => group.includes(item.id)).map((item) => {
                    const current = active === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        className={`app-rail__link${current ? " is-active" : ""}`}
                        aria-current={current ? "page" : undefined}
                        // The label is display:none on the collapsed icon rail, so
                        // the name is stated here and stays the same at every
                        // width. title stays for the hover affordance.
                        aria-label={item.label}
                        title={item.hint}
                        onClick={() => onChange(item.id)}
                      >
                        <span className="app-rail__icon"><Icon name={item.icon} /></span>
                        <span className="app-rail__label truncate">{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </nav>
            <div className="app-rail__foot">
              <span className="app-rail__status">
                <i className={loading ? "is-busy" : ""} aria-hidden="true" />
                <span className="app-rail__status-text truncate">{loading ? "Syncing" : "API connected"}</span>
              </span>
              <button className="app-refresh" type="button" onClick={() => void refresh()} disabled={loading} aria-label={loading ? "Syncing" : "Refresh"}>
                <span aria-hidden="true">↻</span>
                <span className="app-rail__refresh-label truncate">{loading ? "Syncing…" : "Refresh"}</span>
              </button>
              <label className="app-rail__actor">
                <span className="truncate">Acting as</span>
                <select className="truncate" value={actorId} onChange={(event) => setActorId(event.target.value)} aria-label="Acting actor">
                  {actors.map((member) => <option key={member.id} value={member.id}>{member.name} · {member.role}</option>)}
                </select>
              </label>
            </div>
          </aside>
          <main className="app-content">{children}</main>
        </div>
      </div>
    </div>
  );
}
