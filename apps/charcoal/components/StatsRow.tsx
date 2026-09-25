"use client";

import { CountUp } from "@/components/motion";

/**
 * StatsRow (§4 section 2): CountUp stats, numbers in --font-ui tabular.
 */
export function StatsRow({
  stats,
}: {
  stats: Array<{ value: number; prefix?: string; suffix?: string; label: string; decimals?: number }>;
}) {
  const fmt = (decimals = 0) => (v: number) =>
    new Intl.NumberFormat("en-US", {
      maximumFractionDigits: decimals,
      minimumFractionDigits: 0,
    }).format(v);

  return (
    <div
      style={{
        display: "flex",
        gap: 48,
        flexWrap: "wrap",
        borderTop: "1px solid var(--hairline)",
        paddingTop: 32,
      }}
    >
      {stats.map((s) => (
        <div key={s.label}>
          <div className="font-ui" style={{ fontSize: 40, fontWeight: 600 }}>
            {s.prefix}
            <CountUp value={s.value} format={fmt(s.decimals)} />
            {s.suffix}
          </div>
          <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
            {s.label}
          </div>
        </div>
      ))}
    </div>
  );
}
