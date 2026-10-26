import { recommendLeaveTime, type LeaveTimeInput } from "../src/leaveTime";
import { lognormalQuantile, type LogNormal } from "../src/distributions";
import { DEFAULT_COST_WEIGHTS } from "../src/config";

const D: LogNormal = { mu: Math.log(15), sigma: 0.4 }; // median 15 min
const T0 = 1_700_000_000_000;
const MIN = 60_000;

const base = (over: Partial<LeaveTimeInput> = {}): LeaveTimeInput => ({
  acceptedAtMs: T0,
  nowMs: T0,
  travelMinutes: 10,
  prep: D,
  policy: { kind: "quantile", quantile: 0.5 },
  ...over,
});

describe("recommendLeaveTime", () => {
  it("quantile policy: arrive at the chosen quantile of prep time", () => {
    const r = recommendLeaveTime(base());
    expect(r.clamped).toBe(false);
    expect(r.leaveAtMs).toBeCloseTo(T0 + (15 - 10) * MIN, 3);
    expect(r.arrivalAtMs).toBeCloseTo(T0 + 15 * MIN, 3);
    expect(r.leaveInMinutes).toBeCloseTo(5, 9);
    expect(r.quantile).toBe(0.5);
  });

  it("leaves immediately (clamped) if the trip is longer than the prep quantile", () => {
    const r = recommendLeaveTime(base({ travelMinutes: 25 }));
    expect(r.clamped).toBe(true);
    expect(r.leaveAtMs).toBe(T0);
    expect(r.leaveInMinutes).toBe(0);
    expect(r.arrivalAtMs).toBe(T0 + 25 * MIN);
  });

  it("cost policy with default weights targets the critical-ratio quantile", () => {
    const r = recommendLeaveTime(base({ policy: { kind: "cost", weights: DEFAULT_COST_WEIGHTS } }));
    const p =
      DEFAULT_COST_WEIGHTS.riderWait /
      (DEFAULT_COST_WEIGHTS.riderWait +
        DEFAULT_COST_WEIGHTS.foodWait +
        DEFAULT_COST_WEIGHTS.lateness);
    expect(r.quantile).toBeCloseTo(p, 12);
    expect(r.arrivalAtMs).toBeCloseTo(T0 + lognormalQuantile(D, p) * MIN, 3);
  });

  it("a higher quantile / costlier rider waiting means leaving later", () => {
    const lo = recommendLeaveTime(base({ policy: { kind: "quantile", quantile: 0.3 } }));
    const hi = recommendLeaveTime(base({ policy: { kind: "quantile", quantile: 0.9 } }));
    expect(hi.leaveAtMs).toBeGreaterThan(lo.leaveAtMs);
    const cheap = recommendLeaveTime(
      base({ policy: { kind: "cost", weights: { riderWait: 1, foodWait: 1, lateness: 1 } } }),
    );
    const dear = recommendLeaveTime(
      base({ policy: { kind: "cost", weights: { riderWait: 4, foodWait: 1, lateness: 1 } } }),
    );
    expect(dear.leaveAtMs).toBeGreaterThan(cheap.leaveAtMs);
  });

  it("a slower, less reliable vendor means leaving later at a high quantile", () => {
    const steady = recommendLeaveTime(
      base({ prep: { mu: Math.log(15), sigma: 0.1 }, policy: { kind: "quantile", quantile: 0.9 } }),
    );
    const erratic = recommendLeaveTime(
      base({ prep: { mu: Math.log(15), sigma: 0.6 }, policy: { kind: "quantile", quantile: 0.9 } }),
    );
    expect(erratic.leaveAtMs).toBeGreaterThan(steady.leaveAtMs);
  });

  it("re-planning later uses 'not ready yet' and never schedules in the past", () => {
    const now = T0 + 14 * MIN;
    const r = recommendLeaveTime(base({ nowMs: now, travelMinutes: 6 }));
    expect(r.leaveAtMs).toBeGreaterThanOrEqual(now);
    // food was not ready at 14 min, so the median-ready estimate moves past 15 min
    expect(r.arrivalAtMs).toBeGreaterThan(T0 + 15 * MIN);
  });

  it("is pure: does not mutate input and is deterministic", () => {
    const input = Object.freeze(
      base({
        prep: Object.freeze({ ...D }),
        policy: Object.freeze({ kind: "quantile" as const, quantile: 0.7 }),
      }),
    );
    const a = recommendLeaveTime(input);
    const b = recommendLeaveTime(input);
    expect(a).toEqual(b);
  });

  it("validates inputs", () => {
    expect(() => recommendLeaveTime(base({ travelMinutes: -1 }))).toThrow(RangeError);
    expect(() => recommendLeaveTime(base({ travelMinutes: NaN }))).toThrow(RangeError);
    expect(() => recommendLeaveTime(base({ nowMs: T0 - 1 }))).toThrow(RangeError);
    expect(() => recommendLeaveTime(base({ policy: { kind: "quantile", quantile: 0 } }))).toThrow(
      RangeError,
    );
    expect(() => recommendLeaveTime(base({ policy: { kind: "quantile", quantile: 1 } }))).toThrow(
      RangeError,
    );
    expect(() => recommendLeaveTime(base({ prep: { mu: 1, sigma: 0 } }))).toThrow(RangeError);
    expect(() =>
      recommendLeaveTime(
        base({ policy: { kind: "cost", weights: { riderWait: 0, foodWait: 1, lateness: 1 } } }),
      ),
    ).toThrow(RangeError);
  });
});

// --- Property check: on random scenarios the recommendation is a local optimum of expected cost. ---
import { expectedOutcomes, weightedCost, optimalQuantile } from "../src/cost";

function lcg(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

describe("recommendation is optimal for the cost function (randomized, seeded)", () => {
  it("beats nearby leave times on 300 random scenarios", () => {
    const u = lcg(2026);
    for (let i = 0; i < 300; i++) {
      const prep: LogNormal = { mu: Math.log(6 + u() * 30), sigma: 0.1 + u() * 0.6 };
      const weights = {
        riderWait: 0.2 + u() * 3,
        foodWait: 0.1 + u() * 3,
        lateness: 0.1 + u() * 3,
      };
      const travel = u() * 25;
      const elapsed = u() < 0.5 ? 0 : u() * 20;
      const r = recommendLeaveTime({
        acceptedAtMs: T0,
        nowMs: T0 + elapsed * MIN,
        travelMinutes: travel,
        prep,
        policy: { kind: "cost", weights },
      });
      const cost = (L: number) =>
        weightedCost(
          expectedOutcomes({
            prep,
            travelMinutes: travel,
            leaveMinutes: L,
            elapsedMinutes: elapsed,
          }),
          weights,
        );
      const L = (r.leaveAtMs - T0) / MIN;
      for (const d of [-0.5, -0.05, 0.05, 0.5]) {
        if (L + d < elapsed) continue; // cannot leave in the past
        expect(cost(L)).toBeLessThanOrEqual(cost(L + d) + 1e-9);
      }
      expect(r.quantile).toBeCloseTo(optimalQuantile(weights), 12);
    }
  });
});

describe("recommendLeaveTime non-finite timestamps", () => {
  it("rejects NaN times", () => {
    expect(() => recommendLeaveTime(base({ nowMs: NaN }))).toThrow(RangeError);
    expect(() => recommendLeaveTime(base({ acceptedAtMs: Infinity }))).toThrow(RangeError);
  });
});
