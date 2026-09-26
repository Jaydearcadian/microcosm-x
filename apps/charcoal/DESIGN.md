# DESIGN.md — the visual system, deconstructed from the reference

This is the source of truth for the app's appearance. Every colour, radius and
spacing value below was sampled from the reference image rather than eyeballed,
so two people working on different views produce the same product.

Read this before editing any view. If you need a value that is not here, add it
here first and use the token, not a literal.

## 1. Where the values came from

The reference is a dark dashboard. Sampling its pixels gives a very narrow
neutral range: the whole thing lives between `#0f0f0f` and `#2d2d2f`, with
exactly one pure white for emphasis. The colour in it is used three times, on
three 10px swatches, and nowhere else.

That is the single most important thing to absorb. **The product is
monochrome.** Colour is a punctuation mark, not a theme.

## 2. Tokens

```css
:root {
  /* surfaces, darkest to lightest */
  --bg-page:      #0a0a0b;   /* the page behind the app frame */
  --bg-app:       #0f0f0f;   /* app frame and sidebar */
  --surface-1:    #161618;   /* raised rows, active nav, doc cards */
  --surface-2:    #1b1b1d;   /* cards */
  --surface-3:    #212123;   /* inset panels inside a card */
  --surface-btn:  #2d2d2f;   /* secondary button fill */
  --surface-ghost:#0e0e10;   /* ghost button, reads as the card behind it */

  /* borders: hairlines, never heavier */
  --border:        #202022;
  --border-strong: #2a2a2c;   /* hover and active only */

  /* text: four steps, no more */
  --text:   #ffffff;   /* headings and numbers only */
  --text-2: #9b9b9b;   /* labels, nav, secondary copy */
  --text-3: #818085;   /* icons, meta */
  --text-4: #545454;   /* disabled, least important */

  /* accents: three, and only ever on a small swatch or a 1px mark */
  --accent-blue:   #135cdd;
  --accent-yellow: #d4b50d;
  --accent-gray:   #545454;

  /* the chart is the only place white draws a data line */
  --chart-line:  #ffffff;
  --chart-compare: #6a6a6e;
  --chart-grid:  #1e1e20;
  --chart-fill:  #26262a;   /* diagonal hatch stripe colour */

  --radius-frame: 20px;   /* the floating app frame */
  --radius-card:  14px;
  --radius-ctl:   10px;   /* nav items, inputs, small buttons */
  --radius-pill:  999px;

  --rail-width: 264px;
  --rail-width-collapsed: 64px;
  --frame-inset: 16px;
}
```

**The accent rule.** If you are about to write a colour that is not in the
token block, you are about to break the design. The previous lime accent
(`#cafe5c`) is gone. Do not reintroduce it, and do not substitute another.

## 3. Layout

The app is a floating frame on a slightly lighter page, not a full-bleed page.

```text
page  #0a0a0b
└── frame  #0f0f0f, radius 20px, inset 16px, border 1px --border
    ├── rail      264px, own right border, #0f0f0f
    └── main      #0f0f0f, padding 28px 32px
```

- The frame does not go edge to edge. The 16px inset is what makes it read as
  an object rather than a page.
- The rail and main are the same colour, separated by a hairline only.
- Content is left-aligned. Nothing is centred except empty states.

### Rail anatomy, top to bottom

1. **Brand selector** — a bordered pill, full rail width, holding the mark, the
   product name, and a chevron. It is a control, not a logo.
2. **Search** — a row reading "Search" with a `/` keycap badge on the right.
3. **Nav group 1** — icon + label per row, 52px tall, 10px radius.
4. **Hairline divider.**
5. **Nav group 2** — same rows. The row for the current view gets
   `background: var(--surface-1)` and a 1px border. No colour.
6. **Bottom block, pushed down** — status and refresh, in that order.

Every nav row carries a 18px stroke icon at `--text-3`. The current view's icon
and label go to `--text`. Never to an accent.

## 4. The two signature components

### Split stat card

The reference's metric card is two panels side by side inside one border.

```text
┌──────────────────────────────────┬────────────┐
│ Treasury                        │  ┌──────┐  │
│                                 │  │ mark │  │
│ $5,000                          │  └──────┘  │
│                                 │            │
│ OKX X Layer · chain 1952        │            │
└──────────────────────────────────┴────────────┘
   content, flex 1                  inset, #212123
```

- Outer: `--surface-2`, 1px `--border`, `--radius-card`.
- Content: 18px padding, label `--text-2` 13px, number `--text` 34px in the UI
  font, note `--text-4` 11px.
- Inset: `--surface-3`, 30% of the card, holding a 30px mark. The mark is a
  glyph or a 2px-stroke icon in `--text-3`, never a filled colour.
- An alarming metric changes the number to the danger colour and nothing else.
  Do not tint the card.

The row scrolls horizontally rather than wrapping or squashing. A card is
280px minimum. Cut off at the right edge is correct and intentional.

### Hatched area chart

- 2px `--chart-line`, no smoothing that invents data.
- A dashed `--chart-compare` line for the previous period.
- Area under the line is a **diagonal hatch**, not a gradient and not a solid
  fill:

```css
background-image: repeating-linear-gradient(
  45deg,
  var(--chart-fill) 0 1px,
  transparent 1px 7px
);
```

- Gridlines `--chart-grid`, 1px, horizontal only.
- Axis labels `--text-4`, 11px.

## 5. Type

| Role | Size | Colour | Font |
|---|---|---|---|
| main heading | 34px | `--text` | display |
| view title in the top bar | 19px | `--text-2` | body |
| card title | 19px | `--text` | body |
| stat number | 34px | `--text` | ui |
| stat label | 13px | `--text-2` | body |
| nav label | 14px | `--text` | body |
| meta, axis, note | 11px | `--text-4` | body |

Headings are sentence case with a full stop. `The Space at a glance.` not
`SPACE AT A GLANCE`. The old all-caps monospace eyebrows are gone; if you need
a small label, use 11px `--text-4`.

## 6. Buttons

| Kind | Fill | Border | Text |
|---|---|---|---|
| primary | `--text` | none | `--bg-app` |
| secondary | `--surface-btn` | none | `--text` |
| ghost | `--surface-ghost` | 1px `--border` | `--text-2` |
| danger | transparent | 1px danger | danger |

Pill radius. 36px tall. No colour fills except primary.

## 7. The test contract — do not break these

41 Playwright tests depend on the following. They are the app's public
surface. Renaming any of them fails CI.

**Class selectors:** `.indexer-panel`, `.sandbox-card`, `.sandbox-checks`,
`.sandbox-proof`, `.status-pill`

**Headings that must exist, verbatim:**
`The Space at a glance.` · `Proof before payout.` · `Rules move by signature.` ·
`Authority narrows. It never grows.` · `What an agent may do, published.` ·
`One click. One verdict.` · `Proof has a trail.` · `Connect` · `Space` ·
`Participants` · `Join the Space.`

**Buttons that must exist, verbatim:** `Check API and identity` ·
`Continue with active Space` · `Run scenario` · `Load older activity` ·
`Queue for approval` · `Sign approval` · `Sign envelope` · `Create envelope` ·
`Execute payment` · `Revoke` · `Try over the cap` · `Validate in policy` ·
`Connect Wallet` · nav buttons matching `/Governance/`, `/Delegation/`, `/Agent/`

**Labels and copy:** `Active Space` (select) · `PAY TO` · `AMOUNT` ·
`ROSTER` · `CHAIN INDEXER` · `LIVE ACTIVITY` · `APPROVAL QUEUE` ·
`CAPABILITY MANIFEST` · `SPACE-WIDE AUTHORITY` ·
`Space-wide, not actor-specific` · `EXPECT REFUSED` · `EXPECT ACCEPTED` ·
`INVARIANTS HELD` · `One Space. People and software, working under the same rules.` ·
`Add participants, fund the ledger, and turn a request into verifiable work.` ·
`Connect a wallet to enter a Space.` · `invite-demo` ·
`microcosm.space.capability-manifest/v1`

**Status words:** `FUNDED` · `SUBMITTED` · `ADJUDICATING` · `ALLOWED` ·
`REFUSED` · `SIMULATED` · `NOT CONFIGURED` · `RECONCILED` (or `NOT CONFIGURED`
or `UNKNOWN` in the indexer pill)

**Scenario names:** `Request above the per-transaction cap` ·
`Counterparty outside the allowlist` · `Actor that is not a participant` ·
`Compliant order inside every rule`

**Behaviours:** no horizontal overflow at 390px on any view.

## 8. File ownership

Views are being rebuilt in parallel. Stay inside the files you were given.

| Owner | Files |
|---|---|
| foundation | `app/globals.css`, `app/shell.css`, `app/primitives.css`, `components/app/AppShell.tsx`, `components/SiteHeader.tsx`, `components/ui/*` |
| command | `components/app/CommandView.tsx`, `app/views-command.css` |
| work + audit | `components/app/WorkView.tsx`, `WorkKanban.tsx`, `AuditView.tsx`, `AuditStream.tsx`, `app/views-work.css` |
| governance family | `components/app/GovernanceView.tsx`, `DelegationView.tsx`, `AgentView.tsx`, `app/views-gov.css` |
| sandbox + onboarding | `components/app/SandboxView.tsx`, `OnboardingView.tsx`, `OnboardingWizard.tsx`, `app/views-sbx.css` |

Nobody edits another owner's files. If you need a primitive that does not
exist, build it locally in your own CSS file with your own class prefix rather
than reaching into `components/ui/`.

`next build` will fail on a CSS `@import` of a file that does not exist, so
create your CSS file in the same commit as the view that uses it.
