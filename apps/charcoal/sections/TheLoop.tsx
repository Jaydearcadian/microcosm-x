"use client";

import { DisplayHeading } from "@/components/DisplayHeading";
import { BodyReveal } from "@/components/motion";
import { StatsRow } from "@/components/StatsRow";
import { LOOP_NODES } from "@/lib/content";

/** Section 2 — The loop (§4 #2). Static. */
export function TheLoop() {
  return (
    <section id="loop" className="section hairline-top">
      <div className="container">
        <DisplayHeading
          eyebrow="THE LOOP"
          size={64}
          as="h2"
          segments={[
            { text: "Request → Work →" },
            { text: "Result", accent: true },
            { text: "→ Payment" },
          ]}
        />
        <BodyReveal
          className="muted"
          lines={[
            "One flow, four states, zero improvisation. The Space decides what may happen; the chain records what did.",
          ]}
        />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
            gap: 16,
            marginTop: 56,
          }}
          className="loop-nodes"
        >
          {LOOP_NODES.map((node) => (
            <div
              key={node.step}
              style={{
                border: "1px solid var(--hairline)",
                borderRadius: "var(--radius-card)",
                padding: 24,
                background: "var(--surface)",
              }}
            >
              <span className="font-ui accent" style={{ fontSize: 12, letterSpacing: "0.12em" }}>
                {node.step}
              </span>
              <h3 className="display" style={{ fontSize: 20, marginTop: 12 }}>
                {node.title}
              </h3>
              <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                {node.who}
              </p>
              <p className="muted" style={{ fontSize: 14, lineHeight: 1.55, marginTop: 10 }}>
                {node.body}
              </p>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 56 }}>
          <StatsRow
            stats={[
              { value: 78, suffix: "", label: "tests green" },
              { value: 5, label: "contracts on X Layer" },
              { value: 0, prefix: "$", label: "lost to failed work" },
            ]}
          />
        </div>
      </div>
    </section>
  );
}
