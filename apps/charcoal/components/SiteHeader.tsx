"use client";

import { usePathname } from "next/navigation";

/**
 * SiteHeader: BIX-aligned fixed navigation.
 *
 * Desktop geometry mirrors the reference: 24px page inset, compact green
 * wordmark on the left, section links geometrically centered, action on the
 * right. The brief's ≥44px target rule is retained on the action/links.
 */
export function SiteHeader() {
  const pathname = usePathname();
  const isApp = pathname.startsWith("/app");
  const prefix = isApp ? "/app" : "";
  const links = isApp
    ? [["Command", "#command"], ["Work", "#work-board"], ["Onboarding", "#onboarding"], ["Audit", "#audit"]]
    : [["The loop", "#loop"], ["Everyone", "#participants"], ["Rules", "#rules"], ["Work", "#work"]];
  return (
    <header className="site-header">
      <div className="site-header__inner">
        <a
          href={isApp ? "/app" : "/#hero"}
          className="display site-header__wordmark"
          aria-label="Microcosm home"
        >
          MICROCOSM
        </a>

        <nav className="site-header__nav" aria-label="Sections">
          {links.map(([label, hash]) => (
            <a key={hash} href={`${prefix}${hash}`} className="site-header__link">
              {label}
            </a>
          ))}
        </nav>

        <a className="site-header__action" href={isApp ? "/app#command" : "/#cta"}>
          Open on Microcosm
          <span aria-hidden="true" className="site-header__action-mark">
            ↗
          </span>
        </a>
      </div>
    </header>
  );
}
