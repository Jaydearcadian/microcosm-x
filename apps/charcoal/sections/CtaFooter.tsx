"use client";

import { DisplayHeading } from "@/components/DisplayHeading";
import { BodyReveal } from "@/components/motion";
import { PillButton } from "@/components/PillButton";

/**
 * Section 6 — CTA/footer (§4 #6): glow field, pill buttons, staggered footer
 * cascade. The wizard CTA destination is NOT defined anywhere in the brief or
 * the frozen contract, so per ground rule (b) the button renders disabled with
 * an explicit reason rather than a fake-working link — the destination is
 * filed as an open question for the M7 wizard owner.
 */
export function CtaFooter() {
  return (
    <section id="cta" className="section hairline-top" style={{ overflow: "hidden" }}>
      <div className="bloom" aria-hidden="true" />
      <div className="container" style={{ position: "relative" }}>
        <div style={{ display: "grid", justifyItems: "start", gap: 8 }}>
          <DisplayHeading
            size={68}
            segments={[
              { text: "Open a" },
              { text: "Space", accent: true },
              { text: "in 60 seconds" },
            ]}
          />
          <BodyReveal
            className="muted"
            lines={[
              "Name the Space, set the caps, invite everyone. The wizard walks you from empty treasury to first settled payment — every step is a receipt.",
            ]}
          />
          <div style={{ display: "flex", gap: 16, marginTop: 32, flexWrap: "wrap", alignItems: "center" }}>
            <PillButton href="/app/onboarding" variant="primary" revealDelay={0.5}>
              Create your Space
            </PillButton>
            <PillButton href="/docs/API_CONTRACT.md" variant="ghost" revealDelay={0.6}>
              Read the API contract
            </PillButton>
            {/* boundary demo survives only as a secondary text link (brief §4 #7) */}
            <a
              href="#rules"
              className="muted font-ui"
              style={{ minHeight: 44, display: "inline-flex", alignItems: "center", fontSize: 13, textDecoration: "underline", textUnderlineOffset: 4 }}
            >
              See the rules hold
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
