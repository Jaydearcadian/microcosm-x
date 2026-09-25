"use client";

import { ScrollPin, CrossfadeSwap } from "@/components/motion";
import { HashChip } from "@/components/HashChip";
import { KANBAN_STEPS } from "@/lib/content";
import { useMotionValueEvent } from "motion/react";
import { useState } from "react";

/**
 * Section 4 — Live work (§4 #4): the sticky Kanban story (§3 pin). The
 * section pins while scroll progress drives which column is on the board;
 * each swap is a 400ms crossfade. Mobile: single column, one object at a time.
 */
export function LiveWork() {
  return (
    <section id="work" className="section hairline-top" style={{ paddingBlock: 0 }}>
      <ScrollPin pinLength="300vh">
        {(progress) => <KanbanStory progress={progress} />}
      </ScrollPin>
    </section>
  );
}

function KanbanStory({ progress }: { progress: import("motion/react").MotionValue<number> }) {
  const [stepIndex, setStepIndex] = useState(0);
  useMotionValueEvent(progress, "change", (v) => {
    setStepIndex(Math.min(KANBAN_STEPS.length - 1, Math.floor(v * KANBAN_STEPS.length)));
  });
  return (
    <div className="container two-col" style={{ width: "100%" }}>
      <div>
        <p className="eyebrow" style={{ marginBottom: 20 }}>
          LIVE WORK
        </p>
        <h2 className="display" style={{ fontSize: "clamp(36px, 4vw, 64px)" }}>
          Every work order, on the <span className="accent">board</span>.
        </h2>
        <p className="muted" style={{ fontSize: 16, lineHeight: 1.6, maxWidth: 440, marginTop: 20 }}>
          Funded means escrowed. Submitted means a deliverable hash exists.
          Completed means the evaluator approved and payment settled on X
          Layer — bound to that exact hash. The board is the money.
        </p>
      </div>
      <CrossfadeSwap
        index={stepIndex}
        steps={KANBAN_STEPS.map((s) => ({ key: s.key, node: buildColumn(s) }))}
      />
    </div>
  );
}

function buildColumn(step: (typeof KANBAN_STEPS)[number]) {
  return (
    <div
      style={{
        border: "1px solid var(--hairline)",
        borderRadius: "var(--radius-card)",
        background: "var(--surface)",
        padding: 20,
        minHeight: 300,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
        }}
      >
        <span className="display" style={{ fontSize: 18 }}>
          {step.column}
        </span>
        <span className="font-ui accent" style={{ fontSize: 11, letterSpacing: "0.1em" }}>
          {step.jobs.length} JOB{step.jobs.length === 1 ? "" : "S"}
        </span>
      </div>
      {step.jobs.map((job) => (
        <div
          key={job.id}
          style={{
            border: "1px solid var(--hairline)",
            borderRadius: 12,
            padding: 16,
            display: "grid",
            gap: 8,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
            <span style={{ fontSize: 14 }}>{job.title}</span>
            <span className="font-ui" style={{ fontSize: 14 }}>
              ${job.amount}
            </span>
          </div>
          <span className="muted" style={{ fontSize: 12 }}>
            {job.note}
          </span>
          {job.hash && <HashChip hash={job.hash} kind="proof" />}
        </div>
      ))}
    </div>
  );
}
