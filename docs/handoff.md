# Sandpile (Abelian sandpile) — handoff

## Goal
An Abelian sandpile toy: pour sand at the centre, watch the fractal grow, and learn how it works (explanation tab).

## Files
- `sim.js`: WebGL2 R32I ping-pong. Each pass topples every cell ⌊h/T⌋ times at once and keeps an odometer in a second attachment (MRT). Grains past the edge are lost (sink). `cpuStabilize` is the CPU reference used for verification.
- `app.js`: presets (pour at centre, pour little by little, identity element, fill with 3s plus one grain, avalanche watching), adaptive passes per frame, stability check by readback.
  - Pour at centre: activity spreads at most one cell per pass, so only a (passes+2) square around the centre is computed (scissor).
  - Avalanche watching: a CPU stack algorithm (with warm-up to criticality) uploads its state to the texture. Log-log binned plot.
  - `window.sandpile.run(n)` / `verify(k, T)` are test hooks for a hidden pane.
- `explain.js`: 7 cards (rule, 7×7 hands-on, abelian property, fractal (proven vs open), identity element, SOC, GPU method) plus references.

## Run / deploy
- launch.json server `sandpile` (port 8994)
- Deploy: `npx vercel@latest deploy --prod --yes --scope magic3ightballs-projects` → https://sandpile-flame.vercel.app

## Verified (2026-10-20)
- `verify(12,4)`, `verify(13,8)`, `verify(14,4)`: GPU and CPU results differ in 0 cells, and grains are conserved.
- Measured with no rendering: 2^18 grains ≈ 6 s, 2^19 ≈ 22 s. 2^20 is estimated at over a minute (not measured).
- Identity element at 256×256 ≈ 15 s (two phases of tens of thousands of passes each; limited by draw-call overhead). The picture matches the known form.
- Fill with 3s plus one grain → diagonal X (known result). The SOC slope comes out around -1.3.

## Next ideas
- Speed up identity and 2^20: lower-bound odometer initialisation (least action principle) or WebGPU compute with multiple passes per dispatch.
- Zoom/pan, hexagonal grid.
