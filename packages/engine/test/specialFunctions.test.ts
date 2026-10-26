import { erf, erfc, normalCdf, normalQuantile } from "../src/specialFunctions";

// Reference values generated with scipy 1.18.1 (scipy.special.erf/erfc, scipy.stats.norm).
const rel = (actual: number, expected: number, tol = 1e-12) =>
  Math.abs(actual - expected) <= tol * Math.abs(expected);

describe("erf", () => {
  const cases: Array<[number, number]> = [
    [0, 0],
    [0.1, 0.1124629160182849],
    [0.5, 0.5204998778130465],
    [1, 0.8427007929497148],
    [2, 0.9953222650189527],
    [3, 0.9999779095030014],
    [-1, -0.8427007929497148],
  ];
  it.each(cases)("erf(%p)", (x, expected) => {
    expect(erf(x)).toBeCloseTo(expected, 13);
  });
  it("is odd", () => {
    expect(erf(-0.7)).toBe(-erf(0.7));
  });
  it("saturates", () => {
    expect(erf(10)).toBe(1);
    expect(erf(-10)).toBe(-1);
  });
});

describe("erfc", () => {
  const cases: Array<[number, number]> = [
    [0.5, 0.4795001221869535],
    [2, 0.004677734981047266],
    [2.5, 0.00040695201744495886],
    [3, 2.2090496998585445e-5],
    [5, 1.5374597944280347e-12],
    [6, 2.1519736712498913e-17],
  ];
  it.each(cases)("erfc(%p) has small relative error", (x, expected) => {
    expect(rel(erfc(x), expected, 1e-10)).toBe(true);
  });
  it("erfc(-x) = 2 - erfc(x)", () => {
    expect(erfc(-1.3)).toBeCloseTo(2 - erfc(1.3), 14);
  });
});

describe("normalCdf", () => {
  const cases: Array<[number, number]> = [
    [-5, 2.866515718791933e-7],
    [-3, 0.0013498980316300933],
    [-1, 0.15865525393145707],
    [0, 0.5],
    [0.5, 0.6914624612740131],
    [1.96, 0.9750021048517795],
    [4, 0.9999683287581669],
  ];
  it.each(cases)("Phi(%p)", (z, expected) => {
    expect(rel(normalCdf(z), expected, 1e-10)).toBe(true);
  });
  it("handles infinities", () => {
    expect(normalCdf(Infinity)).toBe(1);
    expect(normalCdf(-Infinity)).toBe(0);
  });
});

describe("normalQuantile", () => {
  const cases: Array<[number, number]> = [
    [1e-8, -5.612001244174789],
    [0.001, -3.090232306167813],
    [0.01, -2.3263478740408408],
    [0.025, -1.9599639845400545],
    [0.1, -1.2815515655446004],
    [0.5, 0],
    [0.75, 0.6744897501960817],
    [0.9, 1.2815515655446004],
    [0.95, 1.6448536269514722],
    [0.975, 1.959963984540054],
    [0.999, 3.090232306167813],
  ];
  it.each(cases)("z(%p)", (p, expected) => {
    expect(normalQuantile(p)).toBeCloseTo(expected, 12);
  });
  it("round-trips through normalCdf", () => {
    for (const p of [1e-6, 0.03, 0.2, 0.5, 0.8, 0.97, 1 - 1e-6]) {
      expect(normalCdf(normalQuantile(p))).toBeCloseTo(p, 12);
    }
  });
  it("returns the infinities at the ends", () => {
    expect(normalQuantile(0)).toBe(-Infinity);
    expect(normalQuantile(1)).toBe(Infinity);
  });
  it("rejects p outside [0, 1] and NaN", () => {
    expect(() => normalQuantile(-0.1)).toThrow(RangeError);
    expect(() => normalQuantile(1.1)).toThrow(RangeError);
    expect(() => normalQuantile(NaN)).toThrow(RangeError);
  });
});

describe("NaN handling", () => {
  it("propagates NaN", () => {
    expect(erf(NaN)).toBeNaN();
    expect(erfc(NaN)).toBeNaN();
  });
});
