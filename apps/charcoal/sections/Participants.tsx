"use client";

import { DisplayHeading } from "@/components/DisplayHeading";
import { BodyReveal, CardRise } from "@/components/motion";
import { PARTICIPANT_KINDS } from "@/lib/content";

/**
 * Section 3 — Participants (brief §4 #3): "People and software, side by side."
 * All five kinds get IDENTICAL treatment — same card, same size, same order
 * weight, no hierarchy, no agent special-casing.
 */
export function Participants() {
  return (
    <section id="participants" className="section hairline-top">
      <div className="container">
        <DisplayHeading
          eyebrow="ONE SPACE, EVERYONE IN"
          size={64}
          as="h2"
          segments={[
            { text: "People and" },
            { text: "software", accent: true },
            { text: "side by side." },
          ]}
        />
        <BodyReveal
          className="muted"
          lines={[
            "One Space holds five kinds of participant. The ontology is the point: a founder, an autonomous agent, a service, a partner organization, and a vendor all appear in the same ledger with the same standing.",
          ]}
        />
        <div className="participant-grid">
          {PARTICIPANT_KINDS.map((p, i) => (
            <CardRise key={p.kind} delay={i * 0.12} className="">
              <div
                style={{
                  border: "1px solid var(--hairline)",
                  borderRadius: "var(--radius-card)",
                  background: "var(--surface)",
                  padding: 24,
                  minHeight: 180,
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                }}
              >
                <span className="font-ui accent" style={{ fontSize: 11, letterSpacing: "0.12em" }}>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className="display" style={{ fontSize: 22 }}>
                  {p.kind}
                </h3>
                <p className="muted" style={{ fontSize: 14, lineHeight: 1.55 }}>
                  {p.body}
                </p>
              </div>
            </CardRise>
          ))}
        </div>
      </div>
    </section>
  );
}
