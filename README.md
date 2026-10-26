# Handoff

> **DRAFT. Phase 1 in progress.** All simulation data in this project is **SYNTHETIC**. Nothing here
> is a real-world result, and nothing is claimed about Chowdeck.

Handoff explores one question: instead of sending a rider the moment an order is accepted, can we tell
the rider _when to leave_ so they arrive about when the food is ready, using each vendor's own history
of prep-time reliability?

See [docs/problem-statement.md](docs/problem-statement.md) for what is documented versus hypothesised,
and [docs/decisions.md](docs/decisions.md) for every decision and its caveats.

## Status

| Part                                  | State                      |
| ------------------------------------- | -------------------------- |
| Leave-time engine (`packages/engine`) | Done for v1: 97 unit tests |
| Simulation (`packages/simulation`)    | Not started                |
| Backend (Node, MySQL)                 | Not started                |
| iOS app (React Native)                | Not started                |

## Run the engine tests

Requires Node >= 22.13.

```sh
npm install
npm run typecheck && npm run lint && npm test
```

## How the engine decides

1. Model a vendor's prep time as lognormal, shrunk toward a global prior when the vendor has few orders.
2. Pick the quantile of prep time to arrive at, either directly, or from per-minute costs of rider waiting,
   food waiting and extra delay: `p = c_rider / (c_rider + c_food + c_late)`.
3. Leave time = that quantile minus the rider's travel time, but never earlier than now.

Limitations: the "ready" moment is the vendor's tap (may be early or late); rider travel time is a
single number with no uncertainty; defaults are assumptions.
