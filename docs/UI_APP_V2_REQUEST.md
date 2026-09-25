# UI App Contract v2 Request

Status: **REQUEST ONLY — v1 remains frozen; the app ships against v1 only.**

The M7 app shell currently needs these capabilities to be first-class in the
contract rather than derived in the UI:

1. **Authority meters** — a participant-scoped authority/budget response. v1
   exposes Space-wide `capabilities` and `bounds`, but not per-agent/per-role
   authority, remaining authority, or actor-specific spending posture. The app
   currently derives the meters from Space rules and labels them honestly as
   Space-wide policy meters.
2. **Wizard precondition state** — a read endpoint (or expanded create/fund
   responses) that returns prerequisite status, missing fields, and the next
   valid action. The app performs prechecks from v1 resources instead of
   pretending a step is complete.
3. **Actor identity/session** — a current actor context for UI actions. v1 takes
   `actorId`, `createdBy`, `evaluatorId`, and `adjudicatorId` as request fields,
   but has no session/current-user endpoint. The app exposes an explicit actor
   selector and never invents authentication.
4. **SSE event envelope typing** — v1 documents the envelope and event names,
   but does not define a typed payload map for UI renderers. The app treats
   payload fields defensively until v2 supplies the map.

These are filed as v2 additions, not worked around in the frozen v1 client.
