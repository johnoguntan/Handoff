import {
  fitLogNormal,
  summarizeLogs,
  lognormalCdf,
  lognormalQuantile,
  lognormalMean,
  lognormalPartialExpectation,
  conditionalQuantile,
  type LogNormal,
} from "../src/distributions";

// scipy.stats.lognorm(s=0.4, scale=15): median 15 min, log-sd 0.4.
const D: LogNormal = { mu: Math.log(15), sigma: 0.4 };

describe("lognormal basics (reference: scipy 1.18.1)", () => {
  it("quantiles", () => {
    expect(lognormalQuantile(D, 0.1)).toBeCloseTo(8.983859468414018, 10);
    expect(lognormalQuantile(D, 0.5)).toBeCloseTo(15, 12);
    expect(lognormalQuantile(D, 0.9)).toBeCloseTo(25.04491536082774, 10);
  });
  it("mean = exp(mu + sigma^2/2)", () => {
    expect(lognormalMean(D)).toBeCloseTo(16.24930601512438, 10);
  });
  it("cdf", () => {
    expect(lognormalCdf(D, 20)).toBeCloseTo(0.7639927462288465, 10);
    expect(lognormalCdf(D, 0)).toBe(0);
    expect(lognormalCdf(D, -3)).toBe(0);
  });
  it("cdf and quantile are inverses", () => {
    for (const p of [0.05, 0.3, 0.5, 0.77, 0.95]) {
      expect(lognormalCdf(D, lognormalQuantile(D, p))).toBeCloseTo(p, 12);
    }
  });
  it("quantile endpoints", () => {
    expect(lognormalQuantile(D, 0)).toBe(0);
    expect(lognormalQuantile(D, 1)).toBe(Infinity);
  });
});

describe("lognormalPartialExpectation = E[(R - a)+]", () => {
  // numerical integration with scipy.integrate.quad
  it.each([
    [5, 11.250939782499543],
    [15, 3.1501484483919375],
    [25, 0.5712938212146543],
  ])("a = %p", (a, expected) => {
    expect(lognormalPartialExpectation(D, a)).toBeCloseTo(expected, 9);
  });
  it("is mean - a for a <= 0 (R is always positive)", () => {
    expect(lognormalPartialExpectation(D, 0)).toBeCloseTo(lognormalMean(D), 12);
    expect(lognormalPartialExpectation(D, -5)).toBeCloseTo(lognormalMean(D) + 5, 12);
  });
  it("tends to 0 for huge a", () => {
    expect(lognormalPartialExpectation(D, 1e6)).toBeCloseTo(0, 12);
  });
});

describe("conditionalQuantile (given the food is not ready by elapsed minutes)", () => {
  it("equals the plain quantile when nothing has elapsed", () => {
    expect(conditionalQuantile(D, 0.7, 0)).toBeCloseTo(lognormalQuantile(D, 0.7), 12);
  });
  it("is never below the elapsed time and grows with it", () => {
    const q0 = conditionalQuantile(D, 0.5, 0);
    const q10 = conditionalQuantile(D, 0.5, 10);
    const q20 = conditionalQuantile(D, 0.5, 20);
    expect(q10).toBeGreaterThan(10);
    expect(q10).toBeGreaterThan(q0);
    expect(q20).toBeGreaterThan(q10);
  });
  it("satisfies P(R <= q | R > e) = p", () => {
    const e = 12;
    const q = conditionalQuantile(D, 0.6, e);
    const fe = lognormalCdf(D, e);
    expect((lognormalCdf(D, q) - fe) / (1 - fe)).toBeCloseTo(0.6, 10);
  });
  it("returns the elapsed time if the food is essentially certainly ready", () => {
    expect(conditionalQuantile({ mu: 0, sigma: 0.1 }, 0.5, 1000)).toBe(1000);
  });
});

describe("summarizeLogs / fitLogNormal", () => {
  it("summarizes log-minutes", () => {
    const s = summarizeLogs([Math.E, Math.E ** 2, Math.E ** 3]);
    expect(s.n).toBe(3);
    expect(s.mean).toBeCloseTo(2, 12);
    expect(s.sumSquares).toBeCloseTo(2, 12); // (1-2)^2 + 0 + (3-2)^2
  });
  it("fits mu and the unbiased (n-1) sigma", () => {
    const f = fitLogNormal([Math.E, Math.E ** 2, Math.E ** 3]);
    expect(f.mu).toBeCloseTo(2, 12);
    expect(f.sigma).toBeCloseTo(1, 12); // sqrt(2 / 2)
  });
  it("needs at least two samples", () => {
    expect(() => fitLogNormal([10])).toThrow(RangeError);
    expect(() => fitLogNormal([])).toThrow(RangeError);
  });
  it("rejects non-positive and non-finite samples", () => {
    expect(() => summarizeLogs([10, 0])).toThrow(RangeError);
    expect(() => summarizeLogs([10, -1])).toThrow(RangeError);
    expect(() => summarizeLogs([10, NaN])).toThrow(RangeError);
    expect(() => summarizeLogs([10, Infinity])).toThrow(RangeError);
  });
  it("rejects a degenerate fit (all samples equal gives sigma 0)", () => {
    expect(() => fitLogNormal([10, 10, 10])).toThrow(RangeError);
  });
});

describe("parameter validation", () => {
  it("rejects sigma <= 0 and non-finite parameters", () => {
    expect(() => lognormalQuantile({ mu: 1, sigma: 0 }, 0.5)).toThrow(RangeError);
    expect(() => lognormalCdf({ mu: 1, sigma: -1 }, 5)).toThrow(RangeError);
    expect(() => lognormalMean({ mu: NaN, sigma: 1 })).toThrow(RangeError);
  });
});

describe("conditionalQuantile validation", () => {
  it("rejects bad elapsed and bad p", () => {
    expect(() => conditionalQuantile(D, 0.5, -1)).toThrow(RangeError);
    expect(() => conditionalQuantile(D, 0.5, NaN)).toThrow(RangeError);
    expect(() => conditionalQuantile(D, 1.5, 3)).toThrow(RangeError);
  });
});
