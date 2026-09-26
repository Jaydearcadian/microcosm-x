import type { ReactNode } from "react";

/**
 * The inline stroke icons the shell needs.
 *
 * No icon dependency: every glyph is a handful of paths on a 24x24 grid, drawn
 * with currentColor at 1.5 stroke so the rail can recolour a row by changing
 * one colour (DESIGN.md §3). Views do not import from here (DESIGN.md §8) — they
 * wear `.app-rail__icon`, `.stat-card__mark` and friends as plain markup.
 */

const ICONS = {
  command: (
    <>
      <circle cx="12" cy="12" r="7" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    </>
  ),
  work: (
    <>
      <rect x="3" y="7" width="18" height="13" rx="2.5" />
      <path d="M8.5 7V5.5A1.5 1.5 0 0 1 10 4h4a1.5 1.5 0 0 1 1.5 1.5V7" />
      <path d="M3 12.5h18" />
    </>
  ),
  governance: (
    <>
      <path d="M12 3.5 20 8v8l-8 4.5L4 16V8Z" />
      <path d="M9 12.5l2.2 2.2L15.5 10" />
    </>
  ),
  delegation: (
    /* Authority narrows: a funnel. */
    <>
      <path d="M4 5.5h16l-6 7v5.5l-4 2v-7.5Z" />
    </>
  ),
  agent: (
    <>
      <rect x="4.5" y="8" width="15" height="10" rx="3" />
      <path d="M12 4.5V8" />
      <path d="M9 12.5h.01M15 12.5h.01" />
      <path d="M2.5 13.5v-2M21.5 13.5v-2" />
    </>
  ),
  sandbox: (
    <>
      <path d="M12 3.5 20.5 8v8L12 20.5 3.5 16V8Z" />
      <path d="M3.5 8 12 12.5 20.5 8M12 12.5v8" />
    </>
  ),
  onboarding: (
    <>
      <path d="M12 3.5 5 6.5v5c0 4.2 2.9 7.7 7 9 4.1-1.3 7-4.8 7-9v-5Z" />
      <path d="M12 9.5v5M9.5 12h5" />
    </>
  ),
  audit: (
    <>
      <rect x="4.5" y="3.5" width="15" height="17" rx="2.5" />
      <path d="M8.5 9h7M8.5 13h7M8.5 17h4" />
    </>
  ),
  chevron: <path d="M8 10.5 12 14.5 16 10.5" />,
  panel: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
      <path d="M9.5 4.5v15" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6" />
      <path d="M15.5 15.5 20 20" />
    </>
  ),
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof ICONS;

export function Icon({
  name,
  size = 18,
  className,
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {ICONS[name]}
    </svg>
  );
}
