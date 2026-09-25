"use client";

import { motion } from "motion/react";

/**
 * Gauge — the reusable budget instrument (brief §5).
 * props { total, consumed, threshold, denials, size }
 *   arc            = daily budget
 *   fill           = committed budget (spent + escrowed)
 *   center         = remaining, the single dominant readout
 *   threshold tick = per-transaction cap
 *
 * Denials are deliberately not painted inside the ring. The old pulse sat
 * behind the balance and made the instrument unreadable; denial state belongs
 * in its own labeled metric, where danger is unambiguous.
 */
export interface GaugeProps {
  total: number;
  consumed: number;
  threshold: number;
  denials: number;
  size?: number;
}

const TAU = Math.PI * 2;
const EASE_GAUGE = [0.25, 1, 0.5, 1] as const;

export function Gauge({
  total,
  consumed,
  threshold,
  denials,
  size = 320,
}: GaugeProps) {
  const fraction = total > 0 ? Math.min(Math.max(consumed / total, 0), 1) : 0;
  const thresholdFraction =
    total > 0 ? Math.min(Math.max(threshold / total, 0), 1) : 0;
  const remaining = Math.max(total - consumed, 0);
  const percent = Math.round(fraction * 100);

  const R = 52;
  const circumference = TAU * R;
  const consumedOffset = circumference * (1 - fraction);
  const tickAngle = -Math.PI / 2 + thresholdFraction * TAU;
  const tickX1 = 60 + Math.cos(tickAngle) * (R - 9);
  const tickY1 = 60 + Math.sin(tickAngle) * (R - 9);
  const tickX2 = 60 + Math.cos(tickAngle) * (R + 6);
  const tickY2 = 60 + Math.sin(tickAngle) * (R + 6);

  const money = (v: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(v);

  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg
        viewBox="0 0 120 120"
        width={size}
        height={size}
        role="img"
        aria-label={`Daily budget: ${money(remaining)} remaining of ${money(total)}; ${percent}% committed; ${denials} ${denials === 1 ? "denial" : "denials"}`}
      >
        <circle
          cx={60}
          cy={60}
          r={R}
          fill="none"
          stroke="rgba(255,255,255,.025)"
          strokeWidth={18}
        />
        <circle
          cx={60}
          cy={60}
          r={R}
          fill="none"
          stroke="var(--hairline)"
          strokeWidth={5}
        />
        <motion.circle
          cx={60}
          cy={60}
          r={R}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={7}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: consumedOffset }}
          transition={{ duration: 1.8, ease: EASE_GAUGE }}
          transform="rotate(-90 60 60)"
        />
        <line
          x1={tickX1}
          y1={tickY1}
          x2={tickX2}
          y2={tickY2}
          stroke="var(--text)"
          strokeWidth={1.25}
        />
      </svg>

      <div className="gauge-center">
        <span
          className="font-ui"
          style={{
            fontSize: size * 0.155,
            lineHeight: 1,
            fontWeight: 600,
            letterSpacing: "-0.05em",
          }}
        >
          {money(remaining)}
        </span>
        <span className="font-ui muted" style={{ fontSize: 10, letterSpacing: "0.16em" }}>
          REMAINING TODAY
        </span>
        <span className="muted" style={{ fontSize: 12, marginTop: -3 }}>
          {money(total)} daily budget
        </span>
      </div>
    </div>
  );
}
