"use client";

import { DisplayHeading } from "@/components/DisplayHeading";
import { BodyReveal, CardRise } from "@/components/motion";
import { HashChip } from "@/components/HashChip";
import { POLICY_MATRIX, RULE_DENIAL } from "@/lib/content";

/**
 * Section 4 — Rules (brief §4 #4): "One agreement, enforced equally."
 * The denial card is EVIDENCE that the rules bind everyone alike — it is
 * not the moral of the page (per the positioning rule).
 */
export function Rules() {
  return (
    <section id="rules" className="section hairline-top">
      <div className="container two-col">
        <div>
          <DisplayHeading
            eyebrow="RULES EVERYONE CAN SEE"
            size={64}
            as="h2"
            segments={[
              { text: "One agreement," },
              { text: "enforced equally", accent: true },
              { text: "." },
            ]}
          />
          <BodyReveal
            className="muted"
            lines={[
              "Caps, budgets, allowlists, and balances are written where everyone can read them, then checked deterministically before any signature exists. The rules do not care who is asking.",
            ]}
          />
          {/* policy matrix excerpt */}
          <div
            style={{
              marginTop: 40,
              border: "1px solid var(--hairline)",
              borderRadius: "var(--radius-card)",
              background: "var(--surface)",
              padding: 20,
            }}
          >
            <div className="font-ui muted" style={{ fontSize: 11, letterSpacing: "0.12em", marginBottom: 12 }}>
              POLICY MATRIX · EXCERPT
            </div>
            {POLICY_MATRIX.map((row) => (
              <div
                key={row.rule}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto auto",
                  gap: 16,
                  alignItems: "baseline",
                  padding: "10px 0",
                  borderTop: "1px solid var(--hairline)",
                }}
              >
                <span style={{ fontSize: 14 }}>{row.rule}</span>
                <span className="font-ui" style={{ fontSize: 14 }}>{row.value}</span>
                <span className="muted" style={{ fontSize: 12 }}>{row.note}</span>
              </div>
            ))}
          </div>
        </div>

        {/* the denial card — evidence, not the moral */}
        <CardRise delay={0.2} className="">
          <div
            style={{
              border: "1px solid rgba(229,72,77,.35)",
              borderRadius: "var(--radius-card)",
              background: "var(--surface)",
              padding: 24,
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
          >
            <span
              className="font-ui"
              style={{
                alignSelf: "flex-start",
                fontSize: 10,
                letterSpacing: "0.12em",
                padding: "3px 8px",
                borderRadius: 999,
                border: "1px solid var(--danger)",
                color: "var(--danger)",
              }}
            >
              DENIED · SAME VERDICT FOR ANYONE
            </span>
            <h3 className="display" style={{ fontSize: 24 }}>
              {RULE_DENIAL.title}
            </h3>
            <p className="muted" style={{ fontSize: 15, lineHeight: 1.6 }}>
              {RULE_DENIAL.body}
            </p>
            <ul style={{ listStyle: "none", display: "grid", gap: 8 }}>
              {RULE_DENIAL.reasons.map((r) => (
                <li key={r} className="font-ui danger-text" style={{ fontSize: 12 }}>
                  {r}
                </li>
              ))}
            </ul>
            <p className="font-ui muted" style={{ fontSize: 12 }}>{RULE_DENIAL.impact}</p>
            <div style={{ marginTop: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
              <HashChip hash={RULE_DENIAL.proofHash} label="denialProof" kind="proof" />
            </div>
          </div>
        </CardRise>
      </div>
    </section>
  );
}
