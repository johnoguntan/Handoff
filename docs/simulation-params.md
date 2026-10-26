# Synthetic parameters

**Everything below is an assumption. No value is measured from Chowdeck or any real vendor.**

## Engine defaults (`packages/engine/src/config.ts`)

| Parameter                     | Value                 | Meaning                                |
| ----------------------------- | --------------------- | -------------------------------------- |
| Global prior median prep      | 15 min (`mu = ln 15`) | typical prep time for an unseen vendor |
| Global prior log-sd (`sigma`) | 0.45                  | spread of prep time on the log scale   |
| `kappa0`                      | 3                     | prior mean is worth 3 past orders      |
| `nu0`                         | 4                     | prior variance is worth 4 past orders  |
| Cost: rider wait              | 1.0 / min             | reference unit                         |
| Cost: food wait               | 0.5 / min             |                                        |
| Cost: lateness                | 0.5 / min             |                                        |
| Implied quantile              | 0.5                   | 1 / (1 + 0.5 + 0.5)                    |

## Simulation parameters

Not built yet (Phase 1, next step). Each parameter will be added here as it is introduced:
vendor population, per-vendor medians and spreads, travel-time distribution, order arrival, the fixed
delay for strategy 2, and the random seed.
