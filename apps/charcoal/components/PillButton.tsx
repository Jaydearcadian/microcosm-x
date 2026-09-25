"use client";

import { PillReveal } from "@/components/motion";

type Variant = "primary" | "ghost";

/**
 * PillButton (§5): pill radius, ≥44px target, primary = accent bg / black
 * text, ghost = hairline border. Buttons land last in section choreography.
 */
export function PillButton({
  children,
  href,
  onClick,
  variant = "primary",
  disabled = false,
  disabledReason,
  revealDelay = 0,
}: {
  children: React.ReactNode;
  href?: string;
  onClick?: () => void;
  variant?: Variant;
  disabled?: boolean;
  disabledReason?: string;
  revealDelay?: number;
}) {
  const base: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    padding: "0 24px",
    borderRadius: "var(--radius-pill)",
    fontFamily: "var(--font-ui)",
    fontSize: 14,
    letterSpacing: "0.02em",
    transition: "opacity .2s ease",
    opacity: disabled ? 0.45 : 1,
    cursor: disabled ? "not-allowed" : "pointer",
    ...(variant === "primary"
      ? { background: "var(--accent)", color: "var(--bg)" }
      : { border: "1px solid var(--hairline)", color: "var(--text)" }),
  };

  const inner = (
    <PillReveal delay={revealDelay}>
      {disabled ? (
        <span style={base} aria-disabled="true" title={disabledReason}>
          {children}
        </span>
      ) : href ? (
        <a href={href} style={base}>
          {children}
        </a>
      ) : (
        <button type="button" onClick={onClick} style={base}>
          {children}
        </button>
      )}
    </PillReveal>
  );

  return disabled && disabledReason ? (
    <span style={{ display: "inline-flex", flexDirection: "column", gap: 6 }}>
      {inner}
      <span className="muted font-ui" style={{ fontSize: 11, paddingLeft: 12 }}>
        {disabledReason}
      </span>
    </span>
  ) : (
    inner
  );
}
