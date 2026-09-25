"use client";

/**
 * HighlightText: the green word treatment (§2: ≤2 green words per heading;
 * green reads "active/settled"). Purely presentational — color comes from the
 * token var, never a literal.
 */
export function HighlightText({
  children,
  soft = false,
}: {
  children: React.ReactNode;
  soft?: boolean;
}) {
  return <span style={{ color: soft ? "var(--accent-soft)" : "var(--accent)" }}>{children}</span>;
}
