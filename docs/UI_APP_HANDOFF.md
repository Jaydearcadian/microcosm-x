# Microcosm UI App Handoff

**Status:** `/app` is a real workspace shell in progress, not a finished app.
**Date:** 2026-09-25
**Repository:** `https://github.com/Jaydearcadian/microcosm-x.git`
**Branch:** `main`
**UI app root:** `apps/charcoal`

This document is for the next UI agent. Read it before changing the app.
The repository is the source of truth; the API contract is frozen v1.

---

## 1. Read first

1. `docs/UI_AGENT_BRIEF.md` — visual system, motion formula, component set, acceptance checklist.
2. `docs/API_CONTRACT.md` — the only backend dependency; v1 is frozen.
3. `docs/UI_APP_V2_REQUEST.md` — explicit gaps filed for v2; do not silently work around them.
4. `AGENTS.md` — Forge/ground rules and the `Space` naming rule.
5. `docs/COURT_AGENT_BRIEF.md` — parked; do not pick it up in this UI track.

**Do not modify:** `mcp/`, `packages/server/`, `packages/sdk/`, `contracts/`.
The UI app is isolated in `apps/charcoal`.

---

## 2. Current routes and architecture

### `/` — landing

Existing coordination-first landing page:

- Hero with live `/bounds` Gauge.
- The loop.
- Participants: five equal-weight kinds.
- Rules: equal-enforcement evidence.
- Work preview.
- Provenance.
- CTA.
- Charcoal-black footer shell.

### `/app` — app workspace

Current route is implemented in:

- `apps/charcoal/app/app/page.tsx`
- `apps/charcoal/components/app/AppWorkspace.tsx`

`AppWorkspace` owns the active view state:

```text
Command Center → Work → Onboarding → Audit
```

`AppShell` provides:

- Fixed landing header (route-aware links).
- Persistent app rail.
- Active Space selector.
- Actor selector (`admin-01` / `agent-procure-01`).
- Refresh button.
- API connection/syncing indicator.
- One active workspace view at a time.

The old long editorial section composition is no longer the intended `/app`
architecture. Do not turn the app back into a landing-style scroll narrative.

---

## 3. Live services

Preferred dev backend:

```bash
npm run dev --workspace=@microcosm/server
# http://localhost:8787
```

Live backend currently used by the deployed UI:

```text
http://52.40.133.66:8791
```

The app uses `NEXT_PUBLIC_MICROCOSM_API` when set. When deployed with an empty
value, `next.config.mjs` rewrites same-origin `/api/*` requests to the live
backend. This avoids tunnel-origin CORS assumptions without changing the API.

The app currently discovers Spaces through `GET /api/spaces`; it does not
hardcode a Space ID. During refresh it prefers the first Space that actually
has Work Orders, because seeded Space ordering is not guaranteed.

---

## 4. App views and API calls

### Command Center

Files:

- `components/app/CommandView.tsx`
- `components/Gauge.tsx`
- `components/app/SpaceCommandCenter.tsx` (legacy component retained but no
  longer the active `/app` default; consolidate/remove during cleanup)

Uses:

- `GET /api/spaces`
- `GET /api/spaces/:id`
- `GET /api/spaces/:id/bounds?actorId=`
- `GET /api/spaces/:id/capabilities?actorId=`
- `GET /api/spaces/:id/participants`

Displays:

- Shared treasury Gauge.
- Space-wide authority meters derived from v1 rules.
- Policy matrix.
- Participant roster.
- Address/hash chips with simulated flags.

Important: v1 has no participant-scoped authority endpoint. The current meters
are honestly Space-wide. Do not label them as per-agent authority until a v2
request is approved.

### Work

Files:

- `components/app/WorkView.tsx`
- `components/app/WorkKanban.tsx`

Columns are literal v1 job states:

```text
Funded → Submitted → Completed / Rejected / Adjudicating
```

Uses:

- `GET /api/spaces/:id/work`
- `POST /api/spaces/:id/work/:jobId/evaluate`
- `POST /api/spaces/:id/work/:jobId/post-verdict`
- `POST /api/spaces/:id/work/:jobId/request-verdict` is typed in the client
  but should be wired to a visible court/referral action if that UX is needed.

Cards show escrow, status, deliverable hash chip, simulated state, and actions
for Submitted/Adjudicating jobs. Never present a settlement receipt without its
`simulated` flag.

### Onboarding

Files:

- `components/app/OnboardingView.tsx`
- `components/app/OnboardingWizard.tsx`

Five steps:

1. Connect
2. Create
3. Roster
4. Fund
5. First request

Each step prechecks from v1 resources and gives guidance if already complete
or unavailable. It uses real v1 calls for Space creation, participant creation,
funding, and request creation.

v1 has no dedicated wizard-precondition response and no session/current-user
endpoint. Actor IDs are explicit request fields, not invented authentication.
See `docs/UI_APP_V2_REQUEST.md`.

### Audit

Files:

- `components/app/AuditView.tsx`
- `components/app/AuditStream.tsx`

Uses:

- `GET /api/spaces/:id/activity?limit=&cursor=`
- `GET /api/spaces/:id/events?since=`

SSE subscribes to every documented activity event type and prepends received
events. Pagination loads older activity through the returned cursor. Settlement
and denial events flash with explicit proof/policy language.

---

## 5. Design and motion rules

Use the brief; do not introduce a second visual system.

- Tokens: `app/globals.css` `:root`; fonts are CSS vars only.
- Display/body/UI font vars are the only font declarations.
- Numbers, hashes, timestamps: `font-ui` and tabular numerals.
- One accent: `--accent`; danger only for denials/refunds.
- Motion:
  - headline 1.2s, 50ms stagger, y32→0;
  - body 1.3s, 45ms stagger;
  - buttons 0.8s scale-fade;
  - cards 2.0–2.2s;
  - count-up 1.8s on inview;
  - swaps 300–500ms;
  - no bounce, elastic, scramble, or blur.
- Existing motion primitives live in `components/motion.tsx`.
- Do not reintroduce `MotionConfig reducedMotion="user"`: it caused the
  production regression where animations disappeared for users with OS reduced
  motion enabled.

Acceptance is §7 of the brief plus mobile single-column/no horizontal scroll/
44px targets and the new app screens.

---

## 6. Build and deploy

Local:

```bash
cd apps/charcoal
npm install
NEXT_PUBLIC_MICROCOSM_API='http://52.40.133.66:8791' npx tsc --noEmit
NEXT_PUBLIC_MICROCOSM_API='' npm run build
```

The app has been deployed to the existing frontend process on the AWS host:

```text
/opt/charcoal/apps/charcoal
next start --port 3900
```

Public tunnel:

```text
https://reputation-university-abstract-gotta.trycloudflare.com/app
```

Do not touch the backend process on `:8791`; it is owned by the backend track.
Restart only the frontend by port `3900` after a successful build.

Deployment pattern used:

1. Build locally first.
2. Package frontend source.
3. Transfer through SSM to `/opt/charcoal/apps/charcoal`.
4. Build remotely with:
   `NEXT_PUBLIC_MICROCOSM_API='' MICROCOSM_API_PROXY='http://52.40.133.66:8791' npm run build`
5. Kill only port `3900` with `fuser -k 3900/tcp`.
6. Start `npx next start --port 3900`.
7. Verify `/app`, `/api/spaces`, and `http://52.40.133.66:8791/api/health`.

---

## 7. Known issues / next work

1. **Finish the app visual pass.** The app shell is now persistent, but the
   active views still need a denser instrument-system pass. Avoid reusing
   `SectionIntro`/editorial pacing in embedded views.
2. **Remove or consolidate legacy app components.** `SpaceCommandCenter.tsx`
   is retained but is no longer the active Command view. Decide whether to
   delete it or use it as a shared panel.
3. **Wire court referral UX.** `requestVerdict()` exists in the typed client;
   expose it as an explicit action only if the UI can prove its precondition
   from Submitted + proof. Do not invent an evaluator/court flow.
4. **Improve roster/action semantics.** v1 participant roles and Space members
   are separate shapes. Keep the distinction visible rather than flattening
   them.
5. **SSE robustness.** The current client treats named event payloads
   defensively. v2 should define the payload map.
6. **Wizard actor/session semantics.** v1 has no authenticated session. Keep
   the explicit actor selector and never imply wallet authentication.
7. **Test browser behavior.** The shell is client-hydrated; the first server
   HTML can show a loading state while the API populates. Verify the hydrated
   app in a real browser at mobile and desktop widths.
8. **Do not pick up the parked court brief.** It is a separate future track.

---

## 8. Protected files and unrelated local changes

UI agents may modify only `apps/charcoal/` and UI handoff/docs needed for the
UI track. Do not stage or commit unrelated local backend/demo changes.

At handoff time, these unrelated local changes existed and were intentionally
left alone:

- `mcp/src/xlayer.js`
- `scripts/demo-procurement-space.mjs`

Do not revert them. Do not include them in UI commits.

---

## 9. Ground rules

- Code against `docs/API_CONTRACT.md` v1, not server implementation details.
- If a required capability is absent, add a v2 request; do not fake or
  silently work around it.
- `Space` is the single external kernel noun.
- Every hash chip must show its simulated state. Real hashes link to OKLink;
  simulated hashes must not be presented as real.
- Never weaken tests or claim VERIFIED without executed evidence.
- Keep the landing page and app separate: landing markets the product; `/app`
  operates the product.
