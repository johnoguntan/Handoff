/**
 * Default parameters.
 *
 * !! Every number here is an ASSUMPTION, not a measurement. They are not
 * estimated from Chowdeck or any real vendor data. They exist so the engine
 * and simulation run end to end; each is listed in docs/simulation-params.md
 * and varied in the sensitivity analysis.
 */
import type { CostWeights } from "./cost";
import type { GlobalPrior } from "./prior";

/** ASSUMPTION: typical prep median 15 min, log-sd 0.45 (about +/-57% at one sd), worth 3 / 4 pseudo-orders. */
export const DEFAULT_GLOBAL_PRIOR: GlobalPrior = {
  mu: Math.log(15),
  sigma: 0.45,
  kappa0: 3,
  nu0: 4,
};

/**
 * ASSUMPTION: cost per minute. Rider waiting is the reference unit; food
 * waiting and extra delivery delay each count half as much. Critical ratio
 * = 1 / (1 + 0.5 + 0.5) = 0.5, i.e. aim to arrive at the median ready time.
 */
export const DEFAULT_COST_WEIGHTS: CostWeights = {
  riderWait: 1,
  foodWait: 0.5,
  lateness: 0.5,
};
