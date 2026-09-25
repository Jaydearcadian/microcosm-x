"use client";

import {
  animate,
  motion,
  useInView,
  useScroll,
  useSpring,
  type MotionValue,
} from "motion/react";
import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

/**
 * Motion primitives — the numbers in this file ARE the brief §3 formula.
 * Headlines: opacity 0→1, y 32→0, 1.2s, 50ms stagger, power2.out.
 * Body: 1.3s, 45ms stagger, smaller rise, 0.5s after headline.
 * Buttons: 0.8s scale-fade, land last.
 * Cards: rise 2.0–2.2s. Swaps 300–500ms. Count-up 1.8s on inview.
 * No bounce, no elastic, no scramble, no blur.
 *
 * NOTE: the §3 choreography is mandatory and always runs — deliberately NO
 * `reducedMotion="user"` MotionConfig gate here. With that gate, an OS/browser
 * "reduce motion" setting made every animation jump to its final state
 * (content visible, zero stagger) — which is exactly the "motion is gone"
 * regression it caused in production.
 */
export const EASE_POWER2_OUT = [0.25, 1, 0.5, 1] as const;

export function Providers({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export type HeadlineSegment = { text: string; accent?: boolean };

/** Word-split headline reveal. Green words pass through `accent` segments. */
export function WordReveal({
  segments,
  as: Tag = "h1",
  className = "",
  delay = 0,
  id,
  style,
}: {
  segments: HeadlineSegment[];
  as?: "h1" | "h2";
  className?: string;
  delay?: number;
  id?: string;
  style?: React.CSSProperties;
}) {
  let wordIndex = 0;
  return (
    <Tag id={id} className={`display ${className}`} style={style}>
      {segments.map((segment, s) => (
        <span
          key={s}
          className={segment.accent ? "accent" : undefined}
          style={segment.accent ? undefined : { color: "var(--text)" }}
        >
          {segment.text.split(" ").map((word) => {
            const i = wordIndex++;
            return (
              <span key={i} className="word-clip" aria-hidden="true">
                <motion.span
                  style={{ display: "inline-block" }}
                  initial={{ opacity: 0, y: 32 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-12% 0px" }}
                  transition={{
                    duration: 1.2,
                    ease: EASE_POWER2_OUT,
                    delay: delay + i * 0.05,
                  }}
                >
                  {word}
                  {"\u00A0"}
                </motion.span>
              </span>
            );
          })}
        </span>
      ))}
    </Tag>
  );
}

/** Body copy: 1.3s, 45ms stagger, smaller rise, 0.5s after the headline. */
export function BodyReveal({
  lines,
  className = "",
  delay = 0.5,
}: {
  lines: string[];
  className?: string;
  delay?: number;
}) {
  return (
    <div className={className}>
      {lines.map((line, i) => (
        <motion.p
          key={i}
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-12% 0px" }}
          transition={{
            duration: 1.3,
            ease: EASE_POWER2_OUT,
            delay: delay + i * 0.045,
          }}
          style={{ marginBottom: i < lines.length - 1 ? 12 : 0 }}
        >
          {line}
        </motion.p>
      ))}
    </div>
  );
}

/** Buttons: 0.8s scale-fade, land last. */
export function PillReveal({
  children,
  delay,
  className = "",
}: {
  children: ReactNode;
  delay: number;
  className?: string;
}) {
  return (
    <motion.span
      className={className}
      style={{ display: "inline-block" }}
      initial={{ opacity: 0, scale: 0.94 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true, margin: "-12% 0px" }}
      transition={{ duration: 0.8, ease: EASE_POWER2_OUT, delay }}
    >
      {children}
    </motion.span>
  );
}

/** Cards: rise 2.0–2.2s (2.1s), modest distance, ease power2.out. */
export function CardRise({
  children,
  delay = 0,
  className = "",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-8% 0px" }}
      transition={{ duration: 2.1, ease: EASE_POWER2_OUT, delay }}
    >
      {children}
    </motion.div>
  );
}

/** Stats count-up, 1.8s on inview (§3). Re-runs when `value` changes. */
export function CountUp({
  value,
  format = (v: number) => String(Math.round(v)),
  className = "",
  "aria-label": ariaLabel,
}: {
  value: number;
  format?: (v: number) => string;
  className?: string;
  "aria-label"?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-20% 0px" });
  const [display, setDisplay] = useState(0);
  const started = useRef(false);

  useEffect(() => {
    if (!inView && !started.current) return;
    started.current = true;
    const controls = animate(0, value, {
      duration: 1.8,
      ease: EASE_POWER2_OUT,
      onUpdate: (v) => setDisplay(v),
    });
    return () => controls.stop();
  }, [inView, value]);

  return (
    <span ref={ref} className={className} aria-label={ariaLabel}>
      {format(display)}
    </span>
  );
}

/**
 * Scroll pin with softened scrub (~0.75 feel, brief §3): raw scroll progress
 * is eased through a spring so the pinned media trails the scroll slightly.
 * Children receive the softened progress as a MotionValue.
 */
export function ScrollPin({
  children,
  pinLength = "260vh",
  className = "",
}: {
  children: (progress: MotionValue<number>) => ReactNode;
  pinLength?: string;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end end"],
  });
  const softened = useSpring(scrollYProgress, {
    stiffness: 90,
    damping: 30,
    mass: 0.5,
  });
  return (
    <div ref={ref} className={className} style={{ height: pinLength }}>
      <div
        style={{
          position: "sticky",
          top: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
        }}
      >
        {children(softened)}
      </div>
    </div>
  );
}

/** Screen swap: 400ms opacity crossfade (§3 range 300–500ms).
 *  Controlled mode: pass `index` to drive the active step externally
 *  (e.g. from scroll progress); otherwise it auto-advances on the interval.
 */
export function CrossfadeSwap({
  steps,
  intervalMs = 2400,
  index: controlledIndex,
  className = "",
}: {
  steps: Array<{ key: string; node: ReactNode }>;
  intervalMs?: number;
  index?: number;
  className?: string;
}) {
  const [internalIndex, setInternalIndex] = useState(0);
  const index = controlledIndex ?? internalIndex;
  useEffect(() => {
    if (controlledIndex !== undefined || steps.length < 2) return;
    const t = setInterval(
      () => setInternalIndex((i) => (i + 1) % steps.length),
      intervalMs,
    );
    return () => clearInterval(t);
  }, [controlledIndex, steps.length, intervalMs]);
  const step = steps[index % steps.length];
  return (
    <div className={className} style={{ position: "relative" }}>
      <motion.div
        key={step.key}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, ease: "linear" }}
      >
        {step.node}
      </motion.div>
    </div>
  );
}
