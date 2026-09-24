# UI Agent Brief — Charcoal Landing + App Shell (M7 track)

You build the interface. Backend (`packages/server`, MCP, contracts) is owned
separately. Your sole backend dependency is the frozen contract in
[`docs/API_CONTRACT.md`](../API_CONTRACT.md) — code against it, never against
implementation details.

## 1. Stack (decided)

Next.js App Router, deployed on Vercel. `framer-motion` (`motion` package) for
reveals/pins/scrubs. `wagmi`/`viem` later for the wizard wallet step (M7 scope,
not landing). TypeScript strict. No other animation libraries.

## 2. Visual system (frozen — do not invent outside it)

BIX editorial reference, scoped per brief: **BIX owns the landing, the
instrument owns the app**, bridged by these tokens.

```css
:root {
  --bg: #020202;
  --surface: #0e0e0e;
  --accent: #cafe5c;          /* the one accent. Green reads "active/settled". */
  --accent-soft: #e8ffb8;
  --danger: #e5484d;          /* denials + refunds ONLY. Never decoration. */
  --text: #ffffff;
  --muted: rgba(255,255,255,.6);
  --hairline: rgba(255,255,255,.08);
  --font-display: "Delight", "Clash Display", sans-serif;
  --font-body: "Aeonik Pro", "Inter Tight", sans-serif;
  --font-ui: "Geist", "Geist Mono", monospace;
  --radius-pill: 999px;
  --radius-card: 16px;
  --content-width: 1216px;
}
```

- **Fonts (TBD, non-blocking):** preferred licensed stack is
  Delight / Aeonik Pro / Geist. Fallback is Clash Display / Inter Tight /
  Geist Mono. Families resolve through the CSS vars above, so the swap is
  trivial — build with vars from day one and never hardcode a family.
- **Numbers, hashes, timestamps:** always `--font-ui`, tabular numerals.
- One accent rule: ≤2 green words per heading. Inactive cards near-black.
- Media: no 3D budget. `MediaStage` slots take live instruments (Gauge,
  Kanban mini, audit ticker) or CSS radial green bloom on black — soft, never
  neon. No stock crypto art. No gray boxes left unticketed.

## 3. Motion formula (non-negotiable)

- Headlines: word-split reveal, `opacity 0→1, y 32→0`, 1.2s, 50ms stagger, `power2.out` (cubic-bezier(.25,1,.5,1)).
- Body: 1.3s, 40–60ms stagger, smaller rise, delayed 0.45–0.6s after headline.
- Buttons: 0.8s scale-fade, land last.
- Cards: rise 2.0–2.2s. Screen swaps 300–500ms. Stats count-up 1.8s on inview.
- Black pauses between sections. No bounce, no elastic, no scramble, no blur.
- Scroll pins (`useScroll`/`useTransform`, scrub ~0.75): benefits rail,
  sticky Kanban story. Header stays fixed.

## 4. Section map (keep BIX structure/choreography, swap narrative + media)

| # | Section | Eyebrow → H1 (green = highlighted) | Media slot |
|---|---|---|---|
| 1 | Hero | `COMMERCE OS · OKX X LAYER` → "One shared **Space** where people and software get work done." + sub "Requests, work, payments, and proof — coordinated under rules everyone can see, settled on OKX X Layer." + [Create a Space] [Watch a boundary hold] | Live Gauge (binds `GET /bounds` later; static numbers now) + latest-ledger ticker |
| 2 | The loop | `THE LOOP` → "Request → Work → **Result** → Payment" + 4 node diagram | CountUp stats: 72 tests green · 5 contracts · $0 lost |
| 3 | Boundary proof | `BOUNDARIES HOLD` → "The $900 purchase that **never happened**" | Denial cards (active/inactive rail): over-cap, rejected work, expired escrow |
| 4 | Live work | `LIVE WORK` → "Every work order, **on the board**" | Sticky Kanban preview, columns swap per step |
| 5 | Provenance | `PROVENANCE` → "Every cent **traceable**" | Audit ticker + OKLink verified badges + contract addresses |
| 6 | CTA/footer | "Open a Space in **60 seconds**" + wizard CTA + docs | Glow field; pill buttons; staggered footer cascade |

Choreography per section: eyebrow → headline → copy → media → details. One
focal point per viewport. Mobile: centered, single column, one object at a
time, shorter copy.

## 5. Components to build (in this order)

`SiteHeader` → motion wrappers (`WordReveal`, `BodyReveal`, `PillReveal`,
`CountUp`, `ScrollPin`, `CrossfadeSwap`) → `DisplayHeading`, `HighlightText`,
`PillButton`, `MediaStage`, `FeatureCard`, `StatsRow`, `HashChip`
(copy-on-click, truncated `0x6de0…f3999`, expands full hash) →
`Gauge` (arc=budget, fill=consumed, center=remaining, threshold tick, denial
pulse; props `{ total, consumed, threshold, denials, size }` — reused in hero,
command preview, wizard) → sections top-to-bottom → `SiteFooter`.

## 6. Backend binding (when ready, not before)

- Dev server (local): `npm run dev --workspace=@microcosm/server` → `:8787`,
  CORS open for `localhost:3000`, pre-seeded living Space (IDs printed on boot).
- **Live server: `http://52.40.133.66:8791`** (systemd `microcosm-server` on
  `i-07bd826a6cba642fa`, seeded on boot, auto-restarts). Use this for
  demos and judge clicks; use local for development.
- **Durability warning (until M4):** the server is in-memory — a restart
  reseeds fresh IDs and wipes played state. Never hardcode a space/job ID
  from the live box; discover via `GET /api/spaces` at session start.
- First live binding: hero Gauge + counters ← `GET /api/spaces/:id/bounds`.
  Until then, hardcode the seed's numbers. Everything else stays static until
  told otherwise.
- Receipts/hashes: every hash chip renders the `simulated` flag. Simulated
  hashes say so; real ones link to OKLink. A fake hash presented as real is a
  ship-blocker (CON-06).

## 7. Acceptance

- [ ] One focal point per viewport; ≤2 green words per heading.
- [ ] Motion matches §3 numbers exactly (spot-check with devtools timing).
- [ ] Mobile single-column, no horizontal scroll, ≥44px targets.
- [ ] All hashes truncated with copy + expand; simulated labels present.
- [ ] No invented colors/fonts/components; no lorem; no dead placeholders.
- [ ] `npm run build` clean; Lighthouse performance ≥90 desktop.
