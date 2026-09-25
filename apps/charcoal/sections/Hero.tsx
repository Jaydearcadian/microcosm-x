"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { DisplayHeading } from "@/components/DisplayHeading";
import { BodyReveal, CountUp, PillReveal } from "@/components/motion";
import { PillButton } from "@/components/PillButton";
import { MediaStage } from "@/components/MediaStage";
import { Gauge } from "@/components/Gauge";
import { HashChip } from "@/components/HashChip";
import { fetchBounds, SEED_BOUNDS, type Bounds } from "@/lib/contract";
import { HERO_TICKER } from "@/lib/content";

const money = (v: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(v);

/**
 * Hero (§4 #1). The Gauge + counters are the FIRST live binding:
 * GET /api/spaces/:id/bounds. Until the fetch resolves (or if the dev server
 * is down) we render the hardcoded seed numbers per brief §6.
 */
export function Hero() {
  const [bounds, setBounds] = useState<Bounds>(SEED_BOUNDS);
  const [live, setLive] = useState(false);

  useEffect(() => {
    const ac = new AbortController();
    fetchBounds(ac.signal)
      .then((b) => {
        setBounds(b);
        setLive(true);
      })
      .catch(() => {
        /* keep seed numbers */
      });
    return () => ac.abort();
  }, []);

  const total = Number(bounds.dailyBudget);
  const consumed = Math.max(total - Number(bounds.remaining), 0);

  return (
    <section id="hero" className="section" style={{ paddingTop: 180 }}>
      <div className="container">
        <div className="hero-grid">
          <div>
            <p className="eyebrow" style={{ marginBottom: 20 }}>
              COMMERCE OS · OKX X LAYER
            </p>
            <DisplayHeading
              size={76}
              segments={[
                { text: "One shared" },
                { text: "Space", accent: true },
                { text: "where people and software get work done." },
              ]}
            />
            <BodyReveal
              lines={[
                "Requests, work, payments, and proof — coordinated under rules everyone can see, settled on OKX X Layer.",
              ]}
              className="muted"
            />
            <div style={{ display: "flex", gap: 16, marginTop: 36, flexWrap: "wrap" }}>
              <PillButton href="#cta" revealDelay={1.1}>
                Create a Space
              </PillButton>
              <PillButton href="#work" variant="ghost" revealDelay={1.2}>
                See a Space run
              </PillButton>
            </div>
          </div>
          {/* live treasury instrument — bound to GET /bounds (contract §2) */}
          <MediaStage aspect="auto" className="hero-instrument">
            <div className="treasury-instrument">
              <div className="treasury-instrument__header">
                <span className="font-ui" style={{ fontSize: 11, letterSpacing: "0.14em" }}>
                  SHARED TREASURY
                </span>
                <span className="font-ui muted" style={{ fontSize: 10, letterSpacing: "0.1em" }}>
                  {live && bounds.spaceId
                    ? `LIVE · ${bounds.spaceId.toUpperCase()}`
                    : "SEED · BINDING /BOUNDS"}
                </span>
              </div>

              <div className="treasury-instrument__gauge">
                <Gauge
                  total={total}
                  consumed={consumed}
                  threshold={Number(bounds.maxPerTransaction)}
                  denials={bounds.denials}
                  size={286}
                />
              </div>

              <div className="allocation" aria-label="Daily budget allocation">
                <div className="allocation__labels">
                  <span>SPENT</span>
                  <span>ESCROWED</span>
                  <span>AVAILABLE</span>
                </div>
                <div className="allocation__track">
                  <motion.span
                    className="allocation__segment allocation__segment--spent"
                    initial={{ width: "0%" }}
                    animate={{ width: `${Math.min((Number(bounds.spentToday) / total) * 100, 100)}%` }}
                    transition={{ duration: 1.8, ease: [0.25, 1, 0.5, 1] }}
                  />
                  <motion.span
                    className="allocation__segment allocation__segment--escrow"
                    initial={{ width: "0%" }}
                    animate={{ width: `${Math.min((Number(bounds.escrowed) / total) * 100, 100 - (Number(bounds.spentToday) / total) * 100)}%` }}
                    transition={{ duration: 1.8, ease: [0.25, 1, 0.5, 1] }}
                  />
                  <span className="allocation__segment allocation__segment--available" />
                </div>
                <div className="allocation__values">
                  <span className="font-ui">{money(Number(bounds.spentToday))}</span>
                  <span className="font-ui">{money(Number(bounds.escrowed))}</span>
                  <span className="font-ui">{money(Number(bounds.remaining))}</span>
                </div>
                <div className="allocation__cap">
                  <span className="allocation__cap-line" aria-hidden="true" />
                  <span className="font-ui muted">{money(Number(bounds.maxPerTransaction))} CAP / TRANSACTION</span>
                </div>
              </div>

              <div className="treasury-metrics">
                <div className="treasury-metric">
                  <span className="treasury-metric__label">TREASURY</span>
                  <span className="treasury-metric__value font-ui">
                    <CountUp value={Number(bounds.treasuryBalance)} format={money} />
                  </span>
                </div>
                <div className="treasury-metric">
                  <span className="treasury-metric__label">SPENT TODAY</span>
                  <span className="treasury-metric__value font-ui">
                    <CountUp value={Number(bounds.spentToday)} format={money} />
                  </span>
                </div>
                <div className="treasury-metric">
                  <span className="treasury-metric__label">IN ESCROW</span>
                  <span className="treasury-metric__value font-ui">
                    <CountUp value={Number(bounds.escrowed)} format={money} />
                  </span>
                </div>
                <div className="treasury-metric treasury-metric--denial">
                  <span className="treasury-metric__label">DENIALS HELD</span>
                  <span className="treasury-metric__value font-ui">
                    <CountUp value={bounds.denials} />
                  </span>
                  <span className="treasury-metric__note">held at policy</span>
                </div>
              </div>
            </div>
          </MediaStage>
        </div>
        {/* latest-ledger ticker (static until told otherwise) */}
        <div style={{ marginTop: 64, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <PillReveal delay={1.35}>
            <span className="eyebrow" style={{ marginRight: 8 }}>
              LATEST LEDGER
            </span>
          </PillReveal>
          {HERO_TICKER.map((item, i) => (
            <PillReveal key={item.type + i} delay={1.4 + i * 0.12}>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 14px",
                  border: "1px solid var(--hairline)",
                  borderRadius: "var(--radius-pill)",
                  background: "var(--surface)",
                  fontSize: 13,
                }}
              >
                <span className="font-ui muted" style={{ fontSize: 10, letterSpacing: "0.1em" }}>
                  {item.type}
                </span>
                <span>{item.detail}</span>
                {item.hash && <HashChip hash={item.hash} kind="proof" />}
              </span>
            </PillReveal>
          ))}
        </div>
      </div>
    </section>
  );
}
