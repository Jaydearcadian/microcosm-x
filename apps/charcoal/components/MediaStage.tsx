"use client";

import { ReactNode } from "react";

/**
 * MediaStage (§2 media rules): slots take live instruments (Gauge, Kanban
 * mini, audit ticker) or a CSS radial green bloom on black — soft, never
 * neon. No 3D, no stock crypto art, no unticketed gray boxes.
 */
export function MediaStage({
  children,
  bloom = true,
  aspect = "16 / 10",
  className = "",
}: {
  children?: ReactNode;
  bloom?: boolean;
  aspect?: string;
  className?: string;
}) {
  return (
    <div
      className={className}
      style={{
        position: "relative",
        aspectRatio: aspect,
        background: "var(--surface)",
        border: "1px solid var(--hairline)",
        borderRadius: "var(--radius-card)",
        overflow: "hidden",
        display: "grid",
        placeItems: "center",
        padding: 24,
      }}
    >
      {bloom && <div className="bloom" aria-hidden="true" />}
      <div style={{ position: "relative", width: "100%", display: "grid", placeItems: "center" }}>
        {children}
      </div>
    </div>
  );
}
