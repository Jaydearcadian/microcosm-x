"use client";

import { ReactNode } from "react";
import { CardRise } from "@/components/motion";

/**
 * FeatureCard (§2): near-black when inactive, hairline + accent cue when
 * active. Danger color appears ONLY for denial/refund semantics.
 */
export function FeatureCard({
  title,
  body,
  active = false,
  statusTag,
  statusDanger = false,
  delay = 0,
  children,
}: {
  title: string;
  body: string;
  active?: boolean;
  statusTag?: string;
  statusDanger?: boolean;
  delay?: number;
  children?: ReactNode;
}) {
  return (
    <CardRise delay={delay} className="">
      <div
        style={{
          background: active ? "var(--surface)" : "#080808",
          border: `1px solid ${active ? "rgba(202,254,92,.35)" : "var(--hairline)"}`,
          borderRadius: "var(--radius-card)",
          padding: 24,
          minHeight: 200,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        {statusTag && (
          <span
            className="font-ui"
            style={{
              alignSelf: "flex-start",
              fontSize: 10,
              letterSpacing: "0.12em",
              padding: "3px 8px",
              borderRadius: 999,
              border: `1px solid ${statusDanger ? "var(--danger)" : active ? "rgba(202,254,92,.4)" : "var(--hairline)"}`,
              color: statusDanger ? "var(--danger)" : active ? "var(--accent)" : "var(--muted)",
            }}
          >
            {statusTag}
          </span>
        )}
        <h3 className="display" style={{ fontSize: 22 }}>
          {title}
        </h3>
        <p className="muted" style={{ fontSize: 15, lineHeight: 1.55 }}>
          {body}
        </p>
        {children}
      </div>
    </CardRise>
  );
}
