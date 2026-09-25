"use client";

import { usePathname } from "next/navigation";

type AppHeaderView = "command" | "work" | "onboarding" | "audit";

export function SiteHeader({ onNavigate }: { onNavigate?: (view: AppHeaderView) => void } = {}) {
  const pathname = usePathname();
  const isApp = pathname.startsWith("/app");
  const prefix = isApp ? "/app" : "";
  const links: Array<[string, string, AppHeaderView?]> = isApp
    ? [["Command", "#command", "command"], ["Work", "#work", "work"], ["Onboarding", "#onboarding", "onboarding"], ["Audit", "#audit", "audit"]]
    : [["The loop", "#loop", undefined], ["Everyone", "#participants", undefined], ["Rules", "#rules", undefined], ["Work", "#work", undefined]];
  return (
    <header className="site-header">
      <div className="site-header__inner">
        <a href={isApp ? "/app" : "/#hero"} className="display site-header__wordmark" aria-label="Microcosm home">MICROCOSM</a>
        <nav className="site-header__nav" aria-label="Sections">
          {links.map(([label, hash, view]) => { const href = isApp && view === "onboarding" ? "/app/onboarding#onboarding" : `${prefix}${hash}`; return <a key={hash} href={href} className="site-header__link" onClick={(event) => { if (isApp && view && onNavigate) { event.preventDefault(); onNavigate(view); const path = view === "onboarding" ? "/app/onboarding" : "/app"; window.history.replaceState(null, "", `${path}#${view}`); } }}>{label}</a>; })}
        </nav>
        <a className="site-header__action" href={isApp ? "/app#command" : "/#cta"}>Open on Microcosm<span aria-hidden="true" className="site-header__action-mark">↗</span></a>
      </div>
    </header>
  );
}
