# CookedBrain

Instant-play skill tests. Every round ends with how you place against other players.

## Commands

```sh
npm install
npm run build      # writes dist/index.html, one self-contained page
npm run typecheck
npm run unit       # seeds, scoring and placement maths
npm run e2e        # plays the tests in a real browser
```

## Layout

| Path | What it holds |
| --- | --- |
| `src/core/types.ts` | The `CookedTest` contract every test implements |
| `src/core/stage.ts` | The round surface: input, timestamps, frames, abort |
| `src/core/stats.ts` | % Cooked, tiers, placement, histogram, rank |
| `src/core/norms.ts` | Reference curves used until real players exist |
| `src/core/store.ts` | Device storage plus the shared player documents |
| `src/tests/` | The 12 tests |
| `src/ui/` | Views, results screen, burner shader, sparks |
| `e2e/` | Unit checks, browser drivers, timing check |

## How placement works

- Each player holds one row per test and device class: best score, last 10 scores, rounds.
- A round is compared with other players' rolling medians, so grinders count once.
- Under 30 other players on that test and device, a modelled reference curve stands in, and the result is labelled as an estimate.
- From 30 to 99 it reads as an early estimate. From 100 it is a plain player count.
- Mouse, touch and keyboard are never compared with each other.

Only the reaction curve is anchored on public data, the 273 ms median Human Benchmark publishes. Every other curve in `norms.ts` is an estimate to replace with real data.

## Moving to cookedbrain.com

`Store.connect()` is the only part tied to the prototype host, which provides the shared document store and a viewer id. Keep the `Store` interface and replace that method with an API client:

1. Worker issues signed seeds for ranked runs.
2. Browser sends raw trials after a round.
3. Worker re-runs the same pure `score()` and writes the row.
4. Real sign-in replaces the name-only claim.

Until step 3 exists, scores are not protected. The browser reports them, so a determined player can fake one.
