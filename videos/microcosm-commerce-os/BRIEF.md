---
workflow: product-launch-video
flow: automation
storyboard: yes
message: "Microcosm is the Commerce OS where people and autonomous agents coordinate inside a governed Space."
destination: youtube
aspect: 1920x1080
language: en
length: 120s
angle: proof
---

## Intent

Create a production-grade three-minute product demo for Microcosm, the Commerce OS for humans and autonomous agents on OKX X Layer. Show the real deployed Charcoal UI as the visual source of truth, with the Space as the central product concept: people and software coordinate inside one governed commercial environment. The tone is precise, confident, and instrument-like rather than speculative.

## Assets

- `https://reputation-university-abstract-gotta.trycloudflare.com` — deployed Charcoal landing and app for captured screens.
- `forge/DEMO_SCRIPT.md` — verified three-minute narrative and voiceover source.
- `forge/DEMO_SHOT_LIST.md` — shot timing and required proof surfaces.
- Latest testnet settlement: `0xbd1957ffcc4ce1d57b10cc785ae5c41ec329169ea2cda1ee9695fc9dd7c47556` on OKX X Layer Testnet, chain `1952`.

## Customizations

- Use real headless Chromium/VM capture of the deployed app rather than a synthetic re-creation.
- Use HyperFrames seek-safe animation for the narrative overlays, transitions, proof callouts, and final transaction receipt moment.
- Keep the Space-first story: create or open a Space, add participants, fund, create a Request, execute Work, submit proof, evaluate, settle, and audit.
- Show the live X Layer transaction hash and the deterministic policy denial without claiming an unconfigured facilitator or unsupported settlement.
- Preserve the established vocabulary: Commerce OS, Space, participants, bounded authority, proof, and settlement. Never use the word harness.

## Motion System

Motion stays in dedicated motion components, separate from the visual components. Never animate visual markup and motion in the same place.

| Motion component | Behavior |
| --- | --- |
| `WordReveal` | Words rise from 32px below with an opacity fade |
| `BodyReveal` | Supporting text follows after the headline |
| `PillReveal` | Buttons fade and gently scale into place |
| `ScrollPin` | Pins a section while internal content changes |
| `CountUp` | Animates statistics over approximately 1.8 seconds |
| `CrossfadeSwap` | Crossfades between phone screens or card states |
| `HorizontalScrub` | Moves a card rail horizontally with scroll |
| `FloatIn` | Product imagery rises and settles slowly |
| `GlowPulse` | Brief green bloom around an active product |
| `ProductFlip` | Rotates a card or phone into its final state |
| `FooterCascade` | Reveals footer elements in sequence |

Timing: headline words 1.2s at 50ms stagger; body copy 1.3s at 40–60ms stagger; buttons 0.8s delayed; card entrance 2.0–2.2s; screen swap 300–500ms; stats count 1.8s; footer cascade 1.3s.

Easing and config: entrances use `power2.out`; scroll-driven animation uses `scrub: 0.75`. Avoid bounce, elastic easing, and excessive rotation.

## Notes

- Use the latest verified build and public deployment at capture time.
- Real wallet extension acceptance is not available; use the existing credential-free browser session flow only as a supporting proof, not as a claim of literal extension acceptance.
- The video must not fabricate receipts, balances, or settlement results.
- Use the verified counts from the current proof ledger: 177 tests, 41 claims, 8 gates.
