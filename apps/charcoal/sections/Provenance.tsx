"use client";

import { DisplayHeading } from "@/components/DisplayHeading";
import { BodyReveal, CountUp, PillReveal } from "@/components/motion";
import { HashChip } from "@/components/HashChip";
import { AUDIT_TRAIL } from "@/lib/content";

/** Section 5 — Provenance (§4 #5): audit ticker + verified badges. Static. */
export function Provenance() {
  return (
    <section id="provenance" className="section hairline-top">
      <div className="container two-col">
        <div>
          <DisplayHeading
            eyebrow="PROVENANCE"
            size={64}
            as="h2"
            segments={[
              { text: "Every cent" },
              { text: "traceable", accent: true },
              { text: "." },
            ]}
          />
          <BodyReveal
            className="muted"
            lines={[
              "Activity records carry a monotonically increasing seq per Space. Settlement receipts bind tx hash to deliverable hash. Onchain hashes link to OKLink; proof hashes stay labeled as proof.",
            ]}
          />
          <div
            style={{
              display: "flex",
              gap: 12,
              marginTop: 32,
              flexWrap: "wrap",
            }}
          >
            <span
              className="font-ui"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: 11,
                letterSpacing: "0.1em",
                padding: "8px 14px",
                borderRadius: "var(--radius-pill)",
                border: "1px solid rgba(202,254,92,.4)",
                color: "var(--accent)",
              }}
            >
              ✓ OKLINK VERIFIED SOURCES
            </span>
            <HashChip
              hash="0x9ab4105b5c0a4b1e2f6d3c8a7e5f0b1c2d3e4f5a"
              label="SettlementRouter"
              kind="contract"
            />
            <HashChip
              hash="0xc4d29e7f1a8b3c6d5e0f2a4b6c8d0e1f2a3b4c5d"
              label="AgenticCommerce"
              kind="contract"
            />
          </div>
        </div>

        <PillReveal delay={0.3}>
          <div
            style={{
              border: "1px solid var(--hairline)",
              borderRadius: "var(--radius-card)",
              background: "var(--surface)",
              padding: 20,
            }}
          >
            <div
              className="font-ui muted"
              style={{ fontSize: 11, letterSpacing: "0.12em", marginBottom: 12 }}
            >
              AUDIT TICKER · seq ↑
            </div>
            <div style={{ display: "grid", gap: 0 }}>
              {AUDIT_TRAIL.map((entry) => (
                <div
                  key={entry.seq}
                  style={{
                    display: "flex",
                    gap: 14,
                    alignItems: "baseline",
                    padding: "10px 0",
                    borderTop: "1px solid var(--hairline)",
                  }}
                >
                  <span className="font-ui muted" style={{ fontSize: 12 }}>
                    {String(entry.seq).padStart(3, "0")}
                  </span>
                  <span
                    className="font-ui"
                    style={{
                      fontSize: 10,
                      letterSpacing: "0.1em",
                      color:
                        entry.type === "PAYMENT_DENIED" ? "var(--danger)" : "var(--accent)",
                    }}
                  >
                    {entry.type}
                  </span>
                  <span className="muted" style={{ fontSize: 13 }}>
                    {entry.detail}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </PillReveal>
      </div>
      <div className="container" style={{ marginTop: 56 }}>
        <div
          style={{
            display: "flex",
            gap: 48,
            flexWrap: "wrap",
            borderTop: "1px solid var(--hairline)",
            paddingTop: 32,
          }}
        >
          <div>
            <div className="font-ui" style={{ fontSize: 32, fontWeight: 600 }}>
              <CountUp value={19} />
            </div>
            <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
              event types streamed over SSE
            </div>
          </div>
          <div>
            <div className="font-ui" style={{ fontSize: 32, fontWeight: 600 }}>
              <CountUp value={100} />%
            </div>
            <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
              of failed-work escrow refunded
            </div>
          </div>
          <div>
            <div className="font-ui" style={{ fontSize: 32, fontWeight: 600 }}>
              <CountUp value={3} />
            </div>
            <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
              interfaces with identical terminal states (MCP · REST · SDK)
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
