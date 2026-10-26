import { optimalQuantile, expectedOutcomes, weightedCost, type CostWeights } from "../src/cost";
import { conditionalQuantile, type LogNormal } from "../src/distributions";

const D: LogNormal = { mu: Math.log(15), sigma: 0.4 };
const W1: CostWeights = { riderWait: 1, foodWait: 0.5, lateness: 0.5 };

// Small seeded PRNG so the Monte Carlo cross-check is reproducible (mulberry32).
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function normal(next: () => number) {
  const u = Math.max(next(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * next());
}

function monteCarlo(leave: number, travel: number, elapsed: number, n: number, seed: number) {
  const next = rng(seed);
  let rider = 0,
    food = 0,
    late = 0,
    kept = 0;
  while (kept < n) {
    const r = Math.exp(D.mu + D.sigma * normal(next));
    if (r <= elapsed) continue; // condition on "not ready yet"
    kept++;
    const arrive = leave + travel;
    const baseline = Math.max(elapsed + travel, r);
    rider += Math.max(0, r - arrive);
    food += Math.max(0, arrive - r);
    late += Math.max(arrive, r) - baseline;
  }
  return { riderWait: rider / n, foodWait: food / n, lateness: late / n };
}

describe("optimalQuantile (newsvendor critical ratio)", () => {
  it("is riderWait / (riderWait + foodWait + lateness)", () => {
    expect(optimalQuantile(W1)).toBeCloseTo(0.5, 12);
    expect(optimalQuantile({ riderWait: 3, foodWait: 1, lateness: 0 })).toBeCloseTo(0.75, 12);
    expect(optimalQuantile({ riderWait: 1, foodWait: 1, lateness: 2 })).toBeCloseTo(0.25, 12);
  });
  it("rejects weights that give no interior optimum", () => {
    expect(() => optimalQuantile({ riderWait: 0, foodWait: 1, lateness: 1 })).toThrow(RangeError);
    expect(() => optimalQuantile({ riderWait: 1, foodWait: 0, lateness: 0 })).toThrow(RangeError);
    expect(() => optimalQuantile({ riderWait: -1, foodWait: 1, lateness: 1 })).toThrow(RangeError);
    expect(() => optimalQuantile({ riderWait: NaN, foodWait: 1, lateness: 1 })).toThrow(RangeError);
  });
});

describe("expectedOutcomes vs Monte Carlo (independent check of the closed forms)", () => {
  const cases: Array<[string, number, number, number]> = [
    ["leave now, 10 min away", 0, 10, 0],
    ["leave at 5, 10 min away", 5, 10, 0],
    ["leave at 12, 10 min away", 12, 10, 0],
    ["leave at 20, 4 min away", 20, 4, 0],
    ["conditional: 8 min elapsed, leave at 11", 11, 10, 8],
    ["conditional: 18 min elapsed, leave now", 18, 6, 18],
  ];
  it.each(cases)("%s", (_name, leave, travel, elapsed) => {
    const exact = expectedOutcomes({
      prep: D,
      travelMinutes: travel,
      leaveMinutes: leave,
      elapsedMinutes: elapsed,
    });
    const mc = monteCarlo(leave, travel, elapsed, 400_000, 12345);
    expect(exact.riderWait).toBeCloseTo(mc.riderWait, 1);
    expect(exact.foodWait).toBeCloseTo(mc.foodWait, 1);
    expect(exact.lateness).toBeCloseTo(mc.lateness, 1);
  });

  it("outcomes are non-negative", () => {
    const o = expectedOutcomes({ prep: D, travelMinutes: 7, leaveMinutes: 3 });
    expect(o.riderWait).toBeGreaterThanOrEqual(0);
    expect(o.foodWait).toBeGreaterThanOrEqual(0);
    expect(o.lateness).toBeGreaterThanOrEqual(0);
  });

  it("lateness is 0 when leaving immediately", () => {
    const o = expectedOutcomes({ prep: D, travelMinutes: 7, leaveMinutes: 0 });
    expect(o.lateness).toBeCloseTo(0, 10);
  });

  it("rejects leaving before now", () => {
    expect(() =>
      expectedOutcomes({ prep: D, travelMinutes: 5, leaveMinutes: 3, elapsedMinutes: 10 }),
    ).toThrow(RangeError);
  });
});

describe("the closed-form optimum really minimizes expected cost", () => {
  const scenarios: Array<[string, CostWeights, number, number]> = [
    ["balanced", W1, 10, 0],
    ["rider time expensive", { riderWait: 3, foodWait: 1, lateness: 1 }, 8, 0],
    [
      "food quality expensive (optimum is 'leave now')",
      { riderWait: 1, foodWait: 3, lateness: 1 },
      12,
      0,
    ],
    ["conditional on 6 min elapsed", W1, 9, 6],
  ];
  it.each(scenarios)("%s", (_name, weights, travel, elapsed) => {
    const p = optimalQuantile(weights);
    // closed form: arrive at the (conditional) p-quantile, i.e. leave at that minus travel, but not before now
    let best = Infinity,
      bestL = elapsed;
    for (let L = elapsed; L <= 60; L += 0.01) {
      const c = weightedCost(
        expectedOutcomes({
          prep: D,
          travelMinutes: travel,
          leaveMinutes: L,
          elapsedMinutes: elapsed,
        }),
        weights,
      );
      if (c < best) {
        best = c;
        bestL = L;
      }
    }
    const closedForm = Math.max(elapsed, conditionalQuantile(D, p, elapsed) - travel);
    expect(bestL).toBeCloseTo(closedForm, 1);
  });
});

describe("weightedCost", () => {
  it("is the dot product of outcomes and weights", () => {
    expect(
      weightedCost(
        { riderWait: 2, foodWait: 4, lateness: 6 },
        { riderWait: 1, foodWait: 0.5, lateness: 0.25 },
      ),
    ).toBeCloseTo(2 + 2 + 1.5, 12);
  });
});

describe("expectedOutcomes edge cases", () => {
  it("rejects invalid travel and elapsed", () => {
    expect(() => expectedOutcomes({ prep: D, travelMinutes: -1, leaveMinutes: 0 })).toThrow(
      RangeError,
    );
    expect(() =>
      expectedOutcomes({ prep: D, travelMinutes: 1, leaveMinutes: 5, elapsedMinutes: -2 }),
    ).toThrow(RangeError);
  });
  it("when the food is certainly ready already, there is no rider wait", () => {
    const tight: LogNormal = { mu: 0, sigma: 0.1 };
    const o = expectedOutcomes({
      prep: tight,
      travelMinutes: 3,
      leaveMinutes: 1000,
      elapsedMinutes: 1000,
    });
    expect(o.riderWait).toBe(0);
  });
});
