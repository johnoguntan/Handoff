import { posterior, prepDistribution, type GlobalPrior } from "../src/prior";
import { lognormalQuantile } from "../src/distributions";

const PRIOR: GlobalPrior = { mu: Math.log(15), sigma: 0.45, kappa0: 3, nu0: 4 };

describe("posterior (normal-scaled-inverse-chi-squared on log minutes)", () => {
  it("with no data equals the prior", () => {
    const p = posterior(PRIOR, []);
    expect(p.n).toBe(0);
    expect(p.mu).toBeCloseTo(PRIOR.mu, 12);
    expect(p.sigma2).toBeCloseTo(PRIOR.sigma ** 2, 12);
    expect(p.kappa).toBe(3);
    expect(p.nu).toBe(4);
  });

  it("matches the textbook update for a hand-computed case", () => {
    // logs: 2, 3  => n=2, xbar=2.5, SS=0.5. prior mu0=2.7, sigma0^2=0.25, k0=3, nu0=4.
    const prior: GlobalPrior = { mu: 2.7, sigma: 0.5, kappa0: 3, nu0: 4 };
    const p = posterior(prior, [Math.exp(2), Math.exp(3)]);
    expect(p.kappa).toBe(5);
    expect(p.nu).toBe(6);
    expect(p.mu).toBeCloseTo((3 * 2.7 + 2 * 2.5) / 5, 12); // 2.62
    const expected = (4 * 0.25 + 0.5 + ((3 * 2) / 5) * (2.5 - 2.7) ** 2) / 6; // (1 + 0.5 + 0.048) / 6
    expect(p.sigma2).toBeCloseTo(expected, 12);
  });

  it("shrinks towards the prior with few samples and towards the data with many", () => {
    const dataMu = Math.log(30);
    const few = posterior(PRIOR, [30, 30.5]);
    const many = posterior(
      PRIOR,
      Array.from({ length: 200 }, (_, i) => 30 + (i % 3) * 0.1),
    );
    expect(few.mu).toBeGreaterThan(PRIOR.mu);
    expect(few.mu).toBeLessThan(dataMu);
    expect(Math.abs(many.mu - dataMu)).toBeLessThan(Math.abs(few.mu - dataMu));
    expect(Math.abs(many.mu - dataMu)).toBeLessThan(0.05);
  });

  it("does not need a variance from the sample (a single sample is fine)", () => {
    const p = posterior(PRIOR, [20]);
    expect(p.n).toBe(1);
    expect(Number.isFinite(p.sigma2)).toBe(true);
    expect(p.sigma2).toBeGreaterThan(0);
  });

  it("rejects invalid samples and invalid priors", () => {
    expect(() => posterior(PRIOR, [10, -2])).toThrow(RangeError);
    expect(() => posterior({ ...PRIOR, kappa0: 0 }, [10])).toThrow(RangeError);
    expect(() => posterior({ ...PRIOR, nu0: -1 }, [10])).toThrow(RangeError);
    expect(() => posterior({ ...PRIOR, sigma: 0 }, [10])).toThrow(RangeError);
  });
});

describe("prepDistribution", () => {
  it("for a new vendor is the prior, widened by the 1 + 1/kappa predictive factor", () => {
    const d = prepDistribution(PRIOR, []);
    expect(d.mu).toBeCloseTo(PRIOR.mu, 12);
    expect(d.sigma).toBeCloseTo(PRIOR.sigma * Math.sqrt(1 + 1 / 3), 12);
  });
  it("narrows as evidence accumulates", () => {
    const stable = Array.from({ length: 50 }, (_, i) => 20 + ((i % 5) - 2) * 0.5);
    const few = prepDistribution(PRIOR, stable.slice(0, 2));
    const many = prepDistribution(PRIOR, stable);
    expect(many.sigma).toBeLessThan(few.sigma);
  });
  it("a reliable vendor gets a tighter p90 than the new-vendor prior", () => {
    const reliable = Array.from({ length: 40 }, (_, i) => 15 + ((i % 5) - 2) * 0.4);
    const spreadReliable = lognormalQuantile(prepDistribution(PRIOR, reliable), 0.9) - 15;
    const spreadNew = lognormalQuantile(prepDistribution(PRIOR, []), 0.9) - 15;
    expect(spreadReliable).toBeLessThan(spreadNew);
  });
});

describe("prior validation", () => {
  it("rejects a non-finite prior mean", () => {
    expect(() => posterior({ ...PRIOR, mu: NaN }, [10])).toThrow(RangeError);
  });
});
