"use client";

import { HeadlineSegment, WordReveal } from "@/components/motion";

/**
 * DisplayHeading: eyebrow → headline choreography per section (brief §4).
 * Green words arrive as `accent` segments — keep ≤2 per heading (§2).
 * Size is fluid: clamp(floor, vw, cap) applied inline, no global styles.
 */
export function DisplayHeading({
  eyebrow,
  segments,
  as = "h1",
  size = 72,
  id,
}: {
  eyebrow?: string;
  segments: HeadlineSegment[];
  as?: "h1" | "h2";
  size?: number;
  id?: string;
}) {
  return (
    <div style={{ marginBottom: 32 }}>
      {eyebrow && (
        <p className="eyebrow" style={{ marginBottom: 20 }}>
          {eyebrow}
        </p>
      )}
      <WordReveal
        id={id}
        as={as}
        segments={segments}
        className=""
        style={{
          fontSize: `clamp(36px, ${(size / 16).toFixed(2)}vw, ${size}px)`,
        }}
      />
    </div>
  );
}
