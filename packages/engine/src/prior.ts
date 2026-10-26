/**
 * Per-vendor prep-time estimate with shrinkage towards a global prior.
 *
 * Model (Gelman et al., BDA3, "normal model with conjugate prior"): for a vendor,
 * ln(prep minutes) ~ Normal(m, s2) with the conjugate normal-scaled-inverse-chi-squared prior
 *   m | s2 ~ Normal(mu0, s2 / kappa0),   s2 ~ Scaled-Inv-chi2(nu0, sigma0^2).
 * mu0 and sigma0 are the global (all-vendor) values; kappa0 and nu0 act as
 * "pseudo-observations": how many real orders it takes before the vendor's own
 * history outweighs the global prior (for the mean and the spread respectively).
 *
 * Simplification (documented in docs/decisions.md): the exact predictive
 * distribution is Student-t; we use a lognormal with the same centre and the
 * predictive scale sigma^2 (1 + 1/kappa). That slightly understates tail
 * risk when the vendor has very few orders (nu small).
 */
import { summarizeLogs, type LogNormal } from "./distributions";

export interface GlobalPrior {
  /** prior mean of ln(minutes) */
  readonly mu: number;
  /** prior sd of ln(minutes) */
  readonly sigma: number;
  /** pseudo-observation count behind the prior mean, > 0 */
  readonly kappa0: number;
  /** pseudo-observation count behind the prior variance, > 0 */
  readonly nu0: number;
}

export interface Posterior {
  readonly n: number;
  readonly mu: number;
  readonly sigma2: number;
  readonly kappa: number;
  readonly nu: number;
}

function assertPrior(p: GlobalPrior): void {
  if (!Number.isFinite(p.mu)) throw new RangeError(`prior mu must be finite, got ${p.mu}`);
  if (!Number.isFinite(p.sigma) || p.sigma <= 0)
    throw new RangeError(`prior sigma must be finite and > 0, got ${p.sigma}`);
  if (!Number.isFinite(p.kappa0) || p.kappa0 <= 0)
    throw new RangeError(`prior kappa0 must be finite and > 0, got ${p.kappa0}`);
  if (!Number.isFinite(p.nu0) || p.nu0 <= 0)
    throw new RangeError(`prior nu0 must be finite and > 0, got ${p.nu0}`);
}

/** Posterior parameters given a vendor's historical prep times (minutes). */
export function posterior(prior: GlobalPrior, prepMinutes: readonly number[]): Posterior {
  assertPrior(prior);
  const { n, mean, sumSquares } = summarizeLogs(prepMinutes);
  const kappa = prior.kappa0 + n;
  const nu = prior.nu0 + n;
  const mu = (prior.kappa0 * prior.mu + n * mean) / kappa;
  const shift = n === 0 ? 0 : ((prior.kappa0 * n) / kappa) * (mean - prior.mu) ** 2;
  const sigma2 = (prior.nu0 * prior.sigma ** 2 + sumSquares + shift) / nu;
  return { n, mu, sigma2, kappa, nu };
}

/** Lognormal prep-time distribution to plan with for this vendor. */
export function prepDistribution(prior: GlobalPrior, prepMinutes: readonly number[]): LogNormal {
  const p = posterior(prior, prepMinutes);
  return { mu: p.mu, sigma: Math.sqrt(p.sigma2 * (1 + 1 / p.kappa)) };
}
