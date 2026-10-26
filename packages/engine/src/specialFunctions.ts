/**
 * Special functions needed by the lognormal model: erf, erfc, the standard
 * normal CDF and its inverse. Implemented here (no dependency) so the engine
 * stays pure and runs unchanged on Node and React Native (Hermes).
 *
 * Accuracy is checked in test/specialFunctions.test.ts against scipy 1.18.1.
 */

const SQRT_PI = Math.sqrt(Math.PI);
const SQRT2 = Math.SQRT2;

/**
 * erf(x) for |x| < 3 by the all-positive-terms series
 *   erf(x) = (2/sqrt(pi)) e^{-x^2} * sum_{n>=0} 2^n x^{2n+1} / (2n+1)!!
 * (no cancellation, unlike the alternating Maclaurin series).
 */
function erfSeries(x: number): number {
  const x2 = x * x;
  let term = x;
  let sum = x;
  for (let n = 0; n < 200; n++) {
    term *= (2 * x2) / (2 * n + 3);
    sum += term;
    if (Math.abs(term) < 1e-17 * Math.abs(sum)) break;
  }
  return (2 / SQRT_PI) * Math.exp(-x2) * sum;
}

/** erfc(x) for x >= 2.5 by the continued fraction, evaluated bottom-up. */
function erfcContinuedFraction(x: number): number {
  let t = x;
  for (let k = 120; k >= 1; k--) t = x + k / 2 / t;
  return Math.exp(-x * x) / (SQRT_PI * t);
}

export function erf(x: number): number {
  if (Number.isNaN(x)) return NaN;
  const ax = Math.abs(x);
  if (ax >= 6) return Math.sign(x);
  const v = ax < 3 ? erfSeries(ax) : 1 - erfcContinuedFraction(ax);
  return x < 0 ? -v : v;
}

export function erfc(x: number): number {
  if (Number.isNaN(x)) return NaN;
  if (x < 0) return 2 - erfc(-x);
  if (x < 2.5) return 1 - erfSeries(x);
  return erfcContinuedFraction(x);
}

/** Standard normal CDF, accurate in both tails. */
export function normalCdf(z: number): number {
  if (z === Infinity) return 1;
  if (z === -Infinity) return 0;
  return 0.5 * erfc(-z / SQRT2);
}

// Acklam's rational approximation (relative error ~1e-9), refined by one Halley step.
const A = [
  -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2,
  -3.066479806614716e1, 2.506628277459239,
];
const B = [
  -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1,
  -1.328068155288572e1,
];
const C = [
  -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734,
  4.374664141464968, 2.938163982698783,
];
const D = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
const P_LOW = 0.02425;

/** Inverse of the standard normal CDF. p must be in [0, 1]. */
export function normalQuantile(p: number): number {
  if (!(p >= 0 && p <= 1)) throw new RangeError(`p must be in [0, 1], got ${p}`);
  if (p === 0) return -Infinity;
  if (p === 1) return Infinity;

  let x: number;
  if (p < P_LOW) {
    const q = Math.sqrt(-2 * Math.log(p));
    x =
      (((((C[0]! * q + C[1]!) * q + C[2]!) * q + C[3]!) * q + C[4]!) * q + C[5]!) /
      ((((D[0]! * q + D[1]!) * q + D[2]!) * q + D[3]!) * q + 1);
  } else if (p <= 1 - P_LOW) {
    const q = p - 0.5;
    const r = q * q;
    x =
      ((((((A[0]! * r + A[1]!) * r + A[2]!) * r + A[3]!) * r + A[4]!) * r + A[5]!) * q) /
      (((((B[0]! * r + B[1]!) * r + B[2]!) * r + B[3]!) * r + B[4]!) * r + 1);
  } else {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    x =
      -(((((C[0]! * q + C[1]!) * q + C[2]!) * q + C[3]!) * q + C[4]!) * q + C[5]!) /
      ((((D[0]! * q + D[1]!) * q + D[2]!) * q + D[3]!) * q + 1);
  }

  // One Halley refinement step: brings the error to ~1e-15.
  const e = normalCdf(x) - p;
  const u = e * Math.sqrt(2 * Math.PI) * Math.exp((x * x) / 2);
  return x - u / (1 + (x * u) / 2);
}
