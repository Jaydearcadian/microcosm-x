# DESIGN-REVIEW.md — reconciling the external design sources

Five design sources were consulted before rebuilding the app. They disagree in
places. This records what was adopted, what was rejected, and why, so the
rebuild does not oscillate between them later.

Read this alongside [`DESIGN.md`](DESIGN.md), which holds the tokens. This file
holds the reasoning.

## 1. Sources

| # | Source | What it is | Authority used here |
|---|---|---|---|
| 1 | `vercel-labs/web-interface-guidelines` | A ruleset for reviewing UI code. Concrete, testable, no taste. | **Binding** on mechanics |
| 2 | `bencium-claude-code-design-skill` | Responsive and audit methodology, with a breakpoint table. | **Binding** on breakpoints |
| 3 | `nextlevelbuilder/ui-ux-pro-max-skill` | Prioritised UX rule catalogue, 119 guidelines across 10 categories. | **Binding** on priority order |
| 4 | `accesslint/claude-marketplace` | Accessibility conformance process, WCAG 2.2 AA, evidence tiers. | **Binding** on evidence honesty |
| 5 | `anthropics/skills` | Skill authoring and document work. No layout rules. | Not applicable here |

Where a source is silent, the sampled reference image wins. Where two sources
conflict, section 3 records the resolution.

## 2. What was adopted, and from where

### Text overflow and truncation — source 1

This is the direct answer to "words should not overflow or break out, text
should just truncate to fit".

Three rules, all from the Vercel ruleset, and they work as a set:

```css
/* 1. a flex or grid child must be allowed to shrink below its content width,
      or no truncation is possible no matter what you put on the child */
.row > * { min-width: 0; }

/* 2. the text element itself truncates */
.label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* 3. multi-line text clamps instead of growing the card */
.desc {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
}
```

Rule 1 is the one that is always missing. A flex child defaults to
`min-width: auto`, which means it refuses to shrink below its longest word, and
`text-overflow: ellipsis` silently does nothing. Any card in this app that shows
an identifier, a hash, or a long description needs all three.

Identifiers and hashes get `word-break: break-all` **only** where they must
wrap, such as inside a hash chip. Everywhere else they truncate. Truncating
mid-word is correct for a machine identifier; wrapping one is not.

### Numbers — source 1

`font-variant-numeric: tabular-nums` on any column or figure that is compared
vertically. The Work view and the Command metric row both qualify. Without it,
figures jitter as their values change.

### Headings — sources 1 and 3

`text-wrap: balance` on headings so a two-line heading does not leave one word
alone on the second line. Source 3 also asks for a 60–75 character line length
on desktop; the main column is capped accordingly.

### Scrollbars and nested scroll — sources 1 and 3

`color-scheme: dark` on `<html>`, so the scrollbar and native `<select>` follow
the theme instead of rendering a light bar in a dark app. A matching
`<meta name="theme-color">`.

Source 3 lists nested scroll regions as an anti-pattern. The app frame is
allowed exactly one internal scroller (the main column). The rail scrolls with
the viewport and never independently.

### Touch — sources 2 and 3

`touch-action: manipulation` on interactive elements, and a 44×44px minimum
touch target at mobile widths. Both sources agree; there is no conflict.

### Lists — source 1

Any list over 50 items gets `content-visibility: auto` with a sensible
`contain-intrinsic-size`. The Work view renders 91 projected jobs, so this
applies there directly.

### Motion — sources 1 and 3

`prefers-reduced-motion` is honoured, transitions name their properties rather
than using `transition: all`, and only `transform` and `opacity` animate.

### Accessibility evidence — source 4

Source 4's rule that findings must be grounded in a selector and visible text,
and that anything not checked must be stated, is why the audit numbers in the
commit messages come from a real browser pass rather than an eyeball. Anything
unverified is reported as unverified.

## 3. Conflicts, and how they were resolved

### Conflict 1 — the reference's horizontal card row

`DESIGN.md` originally specified the stat row as a horizontal scroller where
cards are cut off at the right edge, on the theory that it looked intentional.

Source 3 lists horizontal scroll on mobile as a **must-have violation** and
nested scroll regions as an anti-pattern. Source 1 says avoid *unwanted*
scrollbars — the qualifier matters, because a deliberate scroller is not an
unwanted one.

**Resolution: the scroller survives only where there is room for it.**

| Viewport | `.stat-row` behaviour |
|---|---|
| below 640px | single column, no scroller |
| 640–1023px | two columns, no scroller |
| 1024–1279px | two columns, no scroller |
| 1280px and up | horizontal scroller, 280px minimum card |

Below 1280px nobody scrolls sideways to read a balance. The reference's
bleeding edge is a desktop behaviour and is kept there. `DESIGN.md` §4 has been
corrected to match.

### Conflict 2 — fixed pixel widths

`DESIGN.md` uses fixed pixels throughout. Source 3 lists "fixed px container
widths" as an anti-pattern.

**Resolution: fixed pixels are correct for a fixed-size object and wrong for a
minimum that can force overflow.**

- The rail keeps a fixed width, because a rail is a fixed-size object. It is
  capped as a share of the viewport so it can never dominate.
- Any card minimum is removed below its breakpoint and replaced with
  `minmax(0, 1fr)`. A `min-width` is only ever allowed above the width at which
  the container starts scroller.

### Conflict 3 — minimum type size

Source 3 asks for a 16px minimum body size on mobile, to stop iOS zooming the
viewport when a field is focused. `DESIGN.md` specifies 11px meta text.

**Resolution: they are about different things, so both stand.**

- Form inputs are 16px at mobile widths. This is the actual anti-zoom rule and
  it is non-negotiable.
- Body copy and labels keep 13–14px.
- Meta, axis and note text may go to 11px, which is the floor. Nothing in the
  app is smaller than 11px.

### Conflict 4 — breakpoint values

Source 2 specifies 640 / 768 / 1024 / 1280 / 1536. Source 3 suggests
375 / 768 / 1024 / 1440. They agree at 768, 1024 and roughly at 1440.

**Resolution: the union that both can live with.**

`390` (the width the mobile tests assert at) · `640` · `768` · `1024` · `1280` ·
`1440`

Four of those carry layout decisions: 768 (rail becomes a strip), 1024 (content
goes two-up), 1280 (card rows may scroll), 1440 (main column caps its measure).

### Conflict 5 — grid rigidity versus the reference's inset panels

Source 2 states that every element sits on a grid and that being off by one or
two pixels is wrong. The reference deliberately nests a raised panel inside a
card, which is not a grid cell.

**Resolution: source 2's intent is honoured, its letter is not.** The inset
panel is a grid cell like everything else; what makes it read as inset is its
surface colour and negative bleed to the card's edges, not a free-floating
offset. Radii are uniform, and every card's outer edge lands on the same
column.

## 4. Rail sizing

The complaint that the sidebar takes up too much of the screen is a real
measurement, not a preference. It was 264px, which is **34% of a 768px
viewport**.

| Viewport | Rail | Share |
|---|---|---|
| below 768px | horizontal strip, scrolls with the page | n/a |
| 768–1023px | 64px icon rail | ~8% |
| 1024–1279px | 200px | ~18% |
| 1280–1535px | 232px | ~16% |
| 1536px and up | 264px | ~15% |

The rail is additionally capped at 22% of the viewport width, so no viewport can
make it dominant. Below 1024px it defaults to the collapsed icon rail, and the
toggle still works at every size.

## 5. What was deliberately not adopted

- **Emoji as icons.** Source 3 forbids it. The rail uses inline SVG.
- **A UI component library.** Source 3's own token-architecture reference
  assumes Tailwind. This app has no Tailwind, and the tokens in `DESIGN.md` are
  plain CSS custom properties. The architecture guidance transfers; the tooling
  does not, and importing it would have meant restyling everything twice.
- **Anything that would break the test contract** in `DESIGN.md` §7. Where a
  source rule and a test disagreed, the test won and the deviation is recorded
  in `DESIGN.md` §7 rather than hidden.
