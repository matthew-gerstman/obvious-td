# obvious-td

Web-based tower defense game engine — **"Don't Let the Demons Into Heaven"**.

A zero-WebGL, Canvas2D browser TD engine targeting Chrome 116 and period-matching iOS Safari on touch. Data-driven architecture: game logic is decoupled from presentation so the same engine can be reskinned to arbitrary themes without touching mechanics.

## Status

Pre-implementation. Design is complete; the foundation (WI-0, CI harness) is the first PR.

## v1 scope

- 3 maps (single-path, multi-path, branching/merging)
- 7 tower archetypes (Gatling, Cannon, Frost, Poison/DoT, Sniper, Aura/Support, Economy)
- 6 enemy archetypes + bosses
- 3 difficulty modes (Easy / Medium / Hard)
- Tower selling at a 70% refund on total gold invested
- Silent by design — no audio

## Architecture (planned)

- **Renderer:** Canvas2D (no WebGL dependency)
- **Input:** Touch + mouse primary; Pointer Events opportunistic; `touch-action: none` on the canvas
- **Data:** tower/enemy/map/theme records as JSON with a `logic` vs `presentation` split
- **Verification:** deterministic logic core → exact-value unit tests; JSON schema validation (incl. negative fixtures); headless E2E; a balance-gate CI check across every wave/map/difficulty combo

The full design spec and research log live in the Obvious project.
