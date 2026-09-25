export function StatusPill({ label, tone = "quiet" }: { label: string; tone?: "quiet" | "active" | "danger" }) {
  const color = tone === "active" ? "var(--accent)" : tone === "danger" ? "var(--danger)" : "var(--muted)";
  return <span className="status-pill font-ui" style={{ color, borderColor: tone === "quiet" ? "var(--hairline)" : color }}>{label}</span>;
}
