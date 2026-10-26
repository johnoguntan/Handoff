/**
 * Expected-cost model for the leave-time decision.
 *
 * Notation (all times in minutes since the order was accepted):
 *   R  prep-ready time (random, lognormal; conditioned on R > e when e minutes have already elapsed)
 *   T  rider travel time to the vendor (deterministic in v1)
 *   L  the moment the rider leaves (L >= e, the decision cannot be in the past)
 *   A = L + T  rider arrival time
 *
 * Outcomes:
 *   rider wait  = max(0, R - A)                   rider standing around
 *   food wait   = max(0, A - R)                   food sitting ready, getting cold
 *   lateness    = max(A, R) - max(e + T, R)       extra handoff delay versus leaving right now
 *
 * Cost(L) = cRider E[rider wait] + cFood E[food wait] + cLate E[lateness].
 *
 * dCost/dL = -cRider (1 - F(A)) + (cFood + cLate) F(A), with F the CDF of R | R > e,
 * so Cost is convex in L and the optimum satisfies the "newsvendor" condition
 *   F(A*) = cRider / (cRider + cFood + cLate).
 * Hence the optimal arrival time is a quantile of the prep-time distribution,
 * and the cost-function mode and the quantile mode are the same machinery.
 * `expectedOutcomes` exists so that claim is checked numerically in the tests
 * and so the simulation can report expected values.
 */
import { lognormalPartialExpectation, lognormalSurvival, type LogNormal } from "./distributions";

export interface CostWeights {
  readonly riderWait: number;
  readonly foodWait: number;
  readonly lateness: number;
}

export interface Outcomes {
  readonly riderWait: number;
  readonly foodWait: number;
  readonly lateness: number;
}

export function assertWeights(w: CostWeights): void {
  for (const [k, v] of Object.entries(w)) {
    if (!Number.isFinite(v) || v < 0)
      throw new RangeError(`weight ${k} must be finite and >= 0, got ${v}`);
  }
  if (!(w.riderWait > 0)) throw new RangeError("riderWait weight must be > 0");
  if (!(w.foodWait + w.lateness > 0))
    throw new RangeError(
      "foodWait + lateness must be > 0 (otherwise the optimum is to never leave)",
    );
}

/** Critical ratio: the quantile of prep time the rider should arrive at. */
export function optimalQuantile(w: CostWeights): number {
  assertWeights(w);
  return w.riderWait / (w.riderWait + w.foodWait + w.lateness);
}

/** E[(R - a)+ | R > e] for R lognormal. */
function conditionalPartialExpectation(prep: LogNormal, a: number, e: number): number {
  const sf = lognormalSurvival(prep, e);
  if (sf <= 0) return Math.max(0, e - a); // food is (numerically) certainly ready: R = e
  if (a >= e) return lognormalPartialExpectation(prep, a) / sf;
  return lognormalPartialExpectation(prep, e) / sf + (e - a);
}

const LEAVE_TOLERANCE_MIN = 1e-6;

export interface OutcomesInput {
  readonly prep: LogNormal;
  readonly travelMinutes: number;
  /** minutes since acceptance at which the rider leaves */
  readonly leaveMinutes: number;
  /** minutes already elapsed since acceptance with the food not ready (default 0) */
  readonly elapsedMinutes?: number;
}

export function expectedOutcomes(input: OutcomesInput): Outcomes {
  const e = input.elapsedMinutes ?? 0;
  const { prep, travelMinutes: T } = input;
  if (!Number.isFinite(e) || e < 0) throw new RangeError(`elapsedMinutes must be >= 0, got ${e}`);
  if (!Number.isFinite(T) || T < 0) throw new RangeError(`travelMinutes must be >= 0, got ${T}`);
  // Timestamps arrive as epoch ms (~1.7e12), which resolve to only ~1e-4 ms, so minutes
  // derived from them can land ~1e-9 below `e`. Tolerate 1e-6 min (60 microseconds) and clamp.
  if (!Number.isFinite(input.leaveMinutes) || input.leaveMinutes < e - LEAVE_TOLERANCE_MIN)
    throw new RangeError(`leaveMinutes (${input.leaveMinutes}) must be >= elapsedMinutes (${e})`);
  const L = Math.max(input.leaveMinutes, e);

  const A = L + T;
  const riderWait = conditionalPartialExpectation(prep, A, e);
  const meanR = conditionalPartialExpectation(prep, 0, e);
  const foodWait = A - meanR + riderWait; // (A - R)+ = (A - R) + (R - A)+
  const lateness = L - e + riderWait - conditionalPartialExpectation(prep, e + T, e);
  return {
    riderWait: Math.max(0, riderWait),
    foodWait: Math.max(0, foodWait),
    lateness: Math.max(0, lateness),
  };
}

export function weightedCost(o: Outcomes, w: CostWeights): number {
  return w.riderWait * o.riderWait + w.foodWait * o.foodWait + w.lateness * o.lateness;
}
