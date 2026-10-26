/**
 * Lognormal prep-time model. Prep time R (minutes from "order accepted" to
 * "vendor taps ready") is modelled as R ~ LogNormal(mu, sigma), i.e. ln R is
 * Normal(mu, sigma^2). See docs/decisions.md for why lognormal over normal.
 */
import { normalCdf, normalQuantile } from "./specialFunctions";

export interface LogNormal {
  /** mean of ln(minutes) */
  readonly mu: number;
  /** standard deviation of ln(minutes), > 0 */
  readonly sigma: number;
}

export function assertLogNormal(d: LogNormal): void {
  if (!Number.isFinite(d.mu)) throw new RangeError(`mu must be finite, got ${d.mu}`);
  if (!Number.isFinite(d.sigma) || d.sigma <= 0)
    throw new RangeError(`sigma must be finite and > 0, got ${d.sigma}`);
}

function assertProbability(p: number): void {
  if (!(p >= 0 && p <= 1)) throw new RangeError(`p must be in [0, 1], got ${p}`);
}

export function lognormalCdf(d: LogNormal, x: number): number {
  assertLogNormal(d);
  if (!(x > 0)) return 0;
  return normalCdf((Math.log(x) - d.mu) / d.sigma);
}

/** P(R > x), computed from the tail directly so it stays accurate for large x. */
export function lognormalSurvival(d: LogNormal, x: number): number {
  assertLogNormal(d);
  if (!(x > 0)) return 1;
  return normalCdf(-(Math.log(x) - d.mu) / d.sigma);
}

export function lognormalQuantile(d: LogNormal, p: number): number {
  assertLogNormal(d);
  assertProbability(p);
  if (p === 0) return 0;
  if (p === 1) return Infinity;
  return Math.exp(d.mu + d.sigma * normalQuantile(p));
}

export function lognormalMean(d: LogNormal): number {
  assertLogNormal(d);
  return Math.exp(d.mu + (d.sigma * d.sigma) / 2);
}

/**
 * E[(R - a)+] = E[max(R - a, 0)] in closed form (the Black-Scholes call
 * formula): mean * Phi(d2 + sigma) - a * Phi(d2), with d2 = (mu - ln a) / sigma.
 */
export function lognormalPartialExpectation(d: LogNormal, a: number): number {
  assertLogNormal(d);
  const mean = lognormalMean(d);
  if (!(a > 0)) return mean - a; // R > 0 always, so (R - a)+ = R - a for a <= 0
  const d2 = (d.mu - Math.log(a)) / d.sigma;
  const v = mean * normalCdf(d2 + d.sigma) - a * normalCdf(d2);
  return Math.max(0, v);
}

/**
 * Quantile of R given that the food is NOT ready after `elapsedMinutes`:
 * the p-quantile of the distribution truncated to R > elapsed. Used to re-plan
 * when the order has already been cooking for a while.
 * Returns `elapsedMinutes` if the food is (numerically) certain to be ready already.
 */
export function conditionalQuantile(d: LogNormal, p: number, elapsedMinutes: number): number {
  assertLogNormal(d);
  assertProbability(p);
  if (!Number.isFinite(elapsedMinutes) || elapsedMinutes < 0)
    throw new RangeError(`elapsedMinutes must be finite and >= 0, got ${elapsedMinutes}`);
  const sf = lognormalSurvival(d, elapsedMinutes);
  if (sf <= 0) return elapsedMinutes;
  // Solve S(q) = (1 - p) * S(e) in the upper tail (keeps precision when S(e) is small).
  const tail = (1 - p) * sf;
  return Math.exp(d.mu - d.sigma * normalQuantile(tail));
}

export interface LogSummary {
  readonly n: number;
  /** mean of ln(sample) */
  readonly mean: number;
  /** sum of squared deviations of ln(sample) from their mean */
  readonly sumSquares: number;
}

/** Welford summary of ln(minutes). Every sample must be finite and > 0. */
export function summarizeLogs(samples: readonly number[]): LogSummary {
  let n = 0;
  let mean = 0;
  let m2 = 0;
  for (const s of samples) {
    if (!Number.isFinite(s) || s <= 0)
      throw new RangeError(`prep-time samples must be finite and > 0, got ${s}`);
    const x = Math.log(s);
    n += 1;
    const delta = x - mean;
    mean += delta / n;
    m2 += delta * (x - mean);
  }
  return { n, mean, sumSquares: m2 };
}

/** Plain sample fit (mean and unbiased sd of ln). Needs >= 2 non-identical samples. */
export function fitLogNormal(samples: readonly number[]): LogNormal {
  const s = summarizeLogs(samples);
  if (s.n < 2) throw new RangeError(`need at least 2 samples to fit, got ${s.n}`);
  const sigma = Math.sqrt(s.sumSquares / (s.n - 1));
  if (!(sigma > 0)) throw new RangeError("degenerate fit: all samples are identical (sigma = 0)");
  return { mu: s.mean, sigma };
}
