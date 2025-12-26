import { type LactatePoint } from "@/lib/types";

export type ThresholdEstimate = {
  hr_bpm: number | null;
  pace_seconds_per_km: number | null;
  method: string;
};

function sortPoints(points: LactatePoint[]) {
  return [...points].sort((a, b) => a.stage_index - b.stage_index);
}

export function estimateLT1(points: LactatePoint[]): ThresholdEstimate | null {
  const sorted = sortPoints(points).filter((p) => Number.isFinite(p.lactate_mmol));
  if (!sorted.length) return null;

  const firstOver = sorted.find((p) => Number(p.lactate_mmol) >= 2);
  if (firstOver) {
    return {
      hr_bpm: firstOver.hr_bpm ?? null,
      pace_seconds_per_km: firstOver.pace_seconds_per_km ?? null,
      method: "first-lactate>=2.0",
    };
  }

  let closest: LactatePoint | null = null;
  let smallestDelta = Number.POSITIVE_INFINITY;
  for (const p of sorted) {
    const delta = Math.abs(Number(p.lactate_mmol) - 2);
    if (delta < smallestDelta) {
      closest = p;
      smallestDelta = delta;
    }
  }

  if (!closest) return null;
  return {
    hr_bpm: closest.hr_bpm ?? null,
    pace_seconds_per_km: closest.pace_seconds_per_km ?? null,
    method: "closest-to-2.0",
  };
}

export function estimateLT2(points: LactatePoint[]): ThresholdEstimate | null {
  const sorted = sortPoints(points).filter((p) => Number.isFinite(p.lactate_mmol));
  if (sorted.length < 2) return null;

  const crossingIndex = sorted.findIndex((p, idx) => {
    const next = sorted[idx + 1];
    if (!next) return false;
    const currentLac = Number(p.lactate_mmol);
    const nextLac = Number(next.lactate_mmol);
    return currentLac < 4 && nextLac >= 4;
  });

  if (crossingIndex >= 0) {
    const p1 = sorted[crossingIndex];
    const p2 = sorted[crossingIndex + 1];
    const lac1 = Number(p1.lactate_mmol);
    const lac2 = Number(p2.lactate_mmol);
    const ratio = lac2 === lac1 ? 0 : (4 - lac1) / (lac2 - lac1);

    const interpolate = (a: number | null, b: number | null) => {
      if (!Number.isFinite(a) && !Number.isFinite(b)) return null;
      if (!Number.isFinite(a)) return b ?? null;
      if (!Number.isFinite(b)) return a ?? null;
      return Math.round((a ?? 0) + ((b ?? 0) - (a ?? 0)) * ratio);
    };

    const hr = interpolate(p1.hr_bpm ?? null, p2.hr_bpm ?? null);
    const pace = interpolate(p1.pace_seconds_per_km ?? null, p2.pace_seconds_per_km ?? null);

    return {
      hr_bpm: hr,
      pace_seconds_per_km: pace,
      method: "interpolated-4.0-crossing",
    };
  }

  let maxDelta = -Infinity;
  let idxMax = -1;
  for (let i = 0; i < sorted.length - 1; i++) {
    const delta = Number(sorted[i + 1].lactate_mmol) - Number(sorted[i].lactate_mmol);
    if (delta > maxDelta) {
      maxDelta = delta;
      idxMax = i + 1;
    }
  }

  if (idxMax === -1) return null;
  const kneePoint = sorted[idxMax];
  return {
    hr_bpm: kneePoint.hr_bpm ?? null,
    pace_seconds_per_km: kneePoint.pace_seconds_per_km ?? null,
    method: "knee-largest-delta",
  };
}
