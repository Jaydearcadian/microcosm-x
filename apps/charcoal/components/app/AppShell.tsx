"use client";

import { ReactNode, useCallback, useEffect, useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { SiteHeader } from "@/components/SiteHeader";
import { Icon, type IconName } from "@/components/ui/Icon";
import { useAppData } from "@/lib/app-data";
import { useWalletSession } from "@/lib/wallet-session";

export type AppView =
  | "overview" | "work" | "test" | "settings"
  | "command" | "governance" | "delegation" | "agent" | "sandbox" | "audit" | "onboarding";

/* Four destinations, in the order someone actually needs them.
   The old rail had eight peers of equal weight, which put the Boundary Sandbox
   sixth and buried the one screen that lets a visitor prove the product works
   without reading anything. It is now third, and the header carries a shortcut
   to it from every page. */
const NAV: Array<{ id: AppView; label: string; hint: string; icon: IconName }> = [
  { id: "overview", label: "Overview", hint: "Money and rules", icon: "command" },
  { id: "work", label: "Work", hint: "Requests and orders", icon: "work" },
  { id: "test", label: "Test", hint: "Four scenarios", icon: "sandbox" },
  { id: "settings", label: "Settings", hint: "People, approvals, proof", icon: "settings" },
];

/* Legacy ids still resolve so an old bookmark or a shared #sandbox link does not
   dead-end. They redirect to wherever that surface lives now. */
const ALIASES: Partial<Record<string, AppView>> = {
  command: "overview",
  sandbox: "test",
  governance: "settings",
  delegation: "settings",
  agent: "settings",
  audit: "settings",
  onboarding: "settings",
};
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
      {/* The Boundary Sandbox is the screen a visitor actually comes to try, so
          it gets a shortcut from every page instead of only a rail position. */}
      <button
        type="button"
        className={`app-wallet__try${active === "test" ? " is-current" : ""}`}
        onClick={() => onChange("test")}
        title="Run the four boundary scenarios against the live API"
      >
        <span aria-hidden="true">&#9654;</span>
        Try it
      </button>
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
              {NAV.map((item) => {
                const current = active === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`app-rail__link${current ? " is-active" : ""}`}
                    aria-current={current ? "page" : undefined}
                    // The label is display:none on the collapsed icon rail, so the
                    // name is stated here and stays the same at every width.
                    // title stays for the hover affordance.
                    aria-label={item.label}
                    title={item.hint}
                    onClick={() => onChange(item.id)}
                  >
                    <span className="app-rail__icon"><Icon name={item.icon} /></span>
                    <span className="app-rail__label truncate">{item.label}</span>
                  </button>
                );
              })}
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
