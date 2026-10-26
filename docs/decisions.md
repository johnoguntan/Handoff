# Decision log

Each entry: what was decided, why, and what is still unverified. Dates are 2026.

## Scope

**Oct 25 - iOS only.** Android (Gradle lane, Google Play internal testing, Android Detox) is dropped.
Why: the author's machine is an M1 MacBook Pro with 8 GB RAM and little free disk, and an iPhone 12
is the only test phone. Consequence: the job description mentions Gradle; Handoff will not demonstrate
it. Android can be added after Nov 9 if time allows. This is a scope decision, not an oversight.

**Oct 25 - Backend runs with `docker compose up` (Node + MySQL).** No AWS/Terraform: no AWS access
right now. Deployment to AWS is possible but out of scope.

**Oct 25 - Phase 1 (engine, simulation, tests, README draft) is finished before any app code.**
Target Oct 26-30.

**Oct 25 - Demo accounts:** two hard-coded users (one vendor, one rider), clearly labelled demo-only.

## Engine

**Ready signal = the vendor taps "ready".** Prep time = accepted -> that tap. Limitation: vendors may
tap early or late, which biases the learned distribution. Documented in the README.

**Prep time is lognormal.** Prep times are positive and right-skewed (a few orders take much longer),
which a normal distribution cannot represent (it puts mass below zero and is symmetric). A normal vs
lognormal comparison on the synthetic data goes in the simulation write-up. Unverified: whether real
vendor data is lognormal. That would need real data.

**New vendors get a shrinkage prior.** Conjugate normal-scaled-inverse-chi-squared model on ln(minutes).
`kappa0` and `nu0` are pseudo-observation counts: how many real orders before a vendor's own history
outweighs the global prior. Simplification: the exact predictive is Student-t; we use a lognormal with
the predictive scale `sigma^2 (1 + 1/kappa)`. This slightly understates tail risk for vendors with very
few orders.

**Leave time = arrive at a quantile of prep time.** Two policies, one mechanism:

- `quantile`: the operator picks p directly (the fallback).
- `cost`: per-minute costs for rider wait, food wait and lateness (all configurable). Expected cost is
  convex in the leave time and its minimum satisfies F(arrival) = cRider / (cRider + cFood + cLate)
  (the newsvendor condition; derivation in `packages/engine/src/cost.ts`). So the cost policy reduces to
  a quantile with p chosen from the cost ratio. The tests do not assume this: they minimize expected
  cost numerically (grid search, plus 300 random scenarios) and cross-check the closed-form expected
  outcomes against Monte Carlo.

**Lateness is defined as extra handoff delay versus leaving right now**, not versus a customer
promise (there is no promise in the model). This is a modelling choice; change it in `cost.ts` and the
tests will show what moves.

**Re-planning uses "not ready yet".** If the order has already cooked for e minutes, the estimate is
the quantile of prep time truncated to R > e, so the recommendation never goes stale-optimistic.

**Rider travel time is deterministic in v1.** Real travel is uncertain; adding travel variance is a
documented extension, not done.

**Default numbers are assumptions, not data.** Median prep 15 min, log-sd 0.45, prior weights 3 and 4,
cost weights 1 / 0.5 / 0.5. They live in `config.ts`, are listed in `docs/simulation-params.md`, and are
varied in the sensitivity analysis. Nothing is estimated from Chowdeck or any real vendor.

## Tooling

**TypeScript pinned to 6.0.3, not the latest 7.0.2.** On Oct 25 `ts-jest` 29.4.15 declares a peer range
of `typescript >=4.3 <7` and `typescript-eslint` 8.72.0 declares `>=4.8.4 <6.1.0`, so TS 7 is
unsupported by both. Revisit when they add support.

**Special functions (erf, normal CDF/quantile) are implemented in-repo** rather than pulled in from a
library, so the engine stays dependency-free and runs unchanged on Node and React Native. Accuracy
(about 1e-12 or better) is tested against scipy 1.18.1.

**Engine is consumed as TypeScript source** (`main: src/index.ts`). Whether React Native's bundler (Metro)
handles that inside a workspace cleanly is a Phase 0 check; if not, the engine gets a build step.

**CI uses `actions/checkout@v4` and `actions/setup-node@v4`.** I could not confirm whether newer
majors exist; v4 is known to work. Bump if desired.

**Node:** CI runs 22 and 24. The author's Mac has Node 26.7.0; compatibility with the chosen React Native
version is a Phase 0 check.

## Working agreements

- Git commits are made under the author's own identity, with no AI co-author trailers.
- No secrets in the repo: `.env` is ignored, `.env.example` is committed.
- Disk: the Mac had ~3 GB free on Oct 25. Mobile phases need roughly 40-60 GB free (estimate). RAM is 8 GB,
  so: test on the real iPhone, avoid running Xcode, Docker and a simulator at once, and run the
  Detox simulator test in CI only.
