"use client";

import { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui/Icon";

type AppHeaderView = "command" | "work" | "onboarding" | "audit";

export function SiteHeader({
  onNavigate,
  onToggleRail,
  railCollapsed = false,
  actions,
}: {
  onNavigate?: (view: AppHeaderView) => void;
  onToggleRail?: () => void;
  railCollapsed?: boolean;
  actions?: ReactNode;
} = {}) {
  const pathname = usePathname();
  const isApp = pathname.startsWith("/app");
  const prefix = isApp ? "/app" : "";
  // The app shell's rail is the only navigation on /app. The top bar used to
  // repeat four of the eight views, which made the other four unreachable from
  // here and implied two competing menus. The marketing page keeps its own links.
  const links: Array<[string, string, AppHeaderView?]> = isApp
    ? []
    : [["The loop", "#loop", undefined], ["Everyone", "#participants", undefined], ["Rules", "#rules", undefined], ["Work", "#work", undefined]];
  return (
    <header className="site-header">
      <div className="site-header__inner">
        {isApp && onToggleRail ? (
          <button
            type="button"
            className="site-header__toggle"
            onClick={onToggleRail}
            aria-expanded={!railCollapsed}
            aria-label={railCollapsed ? "Show navigation" : "Hide navigation"}
            title={railCollapsed ? "Show navigation" : "Hide navigation"}
          >
            <Icon name="panel" size={16} />
          </button>
        ) : null}
        <a href={isApp ? "/app" : "/#hero"} className="display site-header__wordmark truncate" aria-label="Microcosm home">Microcosm</a>
        <nav className="site-header__nav" aria-label="Sections">
          {links.map(([label, hash, view]) => { const href = isApp && view === "onboarding" ? "/app/onboarding#onboarding" : `${prefix}${hash}`; return <a key={hash} href={href} className="site-header__link truncate" onClick={(event) => { if (isApp && view && onNavigate) { event.preventDefault(); onNavigate(view); const path = view === "onboarding" ? "/app/onboarding" : "/app"; window.history.replaceState(null, "", `${path}#${view}`); } }}>{label}</a>; })}
        </nav>
        <div className="site-header__end">
          {/* This link said "Open on Microcosm" and pointed at #cta, an anchor
              further down the same page, so it scrolled instead of opening
              anything. Whatever the section renames to, the control has to go to
              the app. */}
          {isApp ? actions : <a className="site-header__action truncate" href="/app">Open on Microcosm<span aria-hidden="true" className="site-header__action-mark">↗</span></a>}
        </div>
      </div>
    </header>
  );
}
