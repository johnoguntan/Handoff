/**
 * Leave-time recommendation. Pure: no clock reads, no I/O. Callers pass `nowMs`
 * (on the server this is server time, never the phone's clock).
 */
import { assertLogNormal, conditionalQuantile, type LogNormal } from "./distributions";
import { optimalQuantile, type CostWeights } from "./cost";

export type Policy =
  | { readonly kind: "quantile"; readonly quantile: number }
  | { readonly kind: "cost"; readonly weights: CostWeights };

export interface LeaveTimeInput {
  /** epoch ms when the vendor accepted the order (prep clock starts here) */
  readonly acceptedAtMs: number;
  /** epoch ms "now" (server time) */
  readonly nowMs: number;
  /** rider travel time to the vendor, minutes */
  readonly travelMinutes: number;
  /** vendor prep-time distribution, minutes from acceptance to ready */
  readonly prep: LogNormal;
  readonly policy: Policy;
}

export interface LeaveTimeResult {
  /** when the rider should leave (never earlier than nowMs) */
  readonly leaveAtMs: number;
  /** minutes from now until leaving, >= 0 */
  readonly leaveInMinutes: number;
  /** expected arrival at the vendor if the rider leaves at leaveAtMs */
  readonly arrivalAtMs: number;
  /** the prep-time quantile the policy aimed to arrive at */
  readonly quantile: number;
  /** true if the ideal leave time was already in the past, so "leave now" is returned */
  readonly clamped: boolean;
}

const MS_PER_MIN = 60_000;

export function recommendLeaveTime(input: LeaveTimeInput): LeaveTimeResult {
  const { acceptedAtMs, nowMs, travelMinutes, prep, policy } = input;
  if (!Number.isFinite(acceptedAtMs) || !Number.isFinite(nowMs))
    throw new RangeError("acceptedAtMs and nowMs must be finite");
  if (nowMs < acceptedAtMs) throw new RangeError("nowMs is before acceptedAtMs");
  if (!Number.isFinite(travelMinutes) || travelMinutes < 0)
    throw new RangeError(`travelMinutes must be finite and >= 0, got ${travelMinutes}`);
  assertLogNormal(prep);

  const quantile = policy.kind === "quantile" ? policy.quantile : optimalQuantile(policy.weights);
  if (!(quantile > 0 && quantile < 1))
    throw new RangeError(`quantile must be strictly between 0 and 1, got ${quantile}`);

  const elapsedMinutes = (nowMs - acceptedAtMs) / MS_PER_MIN;
  const readyAtMinutes = conditionalQuantile(prep, quantile, elapsedMinutes);
  const idealLeaveMs = acceptedAtMs + (readyAtMinutes - travelMinutes) * MS_PER_MIN;
  const clamped = idealLeaveMs < nowMs;
  const leaveAtMs = clamped ? nowMs : idealLeaveMs;

  return {
    leaveAtMs,
    leaveInMinutes: (leaveAtMs - nowMs) / MS_PER_MIN,
    arrivalAtMs: leaveAtMs + travelMinutes * MS_PER_MIN,
    quantile,
    clamped,
  };
}
