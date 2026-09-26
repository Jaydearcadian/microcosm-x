// The tone used to be applied with an inline `color`, which referenced
// `var(--accent)` after the lime accent was removed from the token set. An
// undefined custom property resolves to nothing, so an "active" pill silently
// fell back to the base pill and stopped looking active at all. The tone now
// comes from the `.status-pill--*` classes, which are part of the design system
// and cannot drift from it.
export function StatusPill({ label, tone = "quiet" }: { label: string; tone?: "quiet" | "active" | "danger" }) {
  return <span className={`status-pill font-ui status-pill--${tone}`}>{label}</span>;
}
