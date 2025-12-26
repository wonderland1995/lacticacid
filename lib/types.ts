export type LactateProtocol = {
  warmupSeconds: number;
  stageSeconds: number;
  numStages: number;
  sampleOffsetSeconds: number;
  sampleWindowSeconds: number;
};

export const DEFAULT_PROTOCOL: LactateProtocol = {
  warmupSeconds: 600,
  stageSeconds: 180,
  numStages: 8,
  sampleOffsetSeconds: 150,
  sampleWindowSeconds: 30,
};

export type LactateTest = {
  id: string;
  user_id: string;
  title: string;
  sport: string;
  protocol: LactateProtocol;
  started_at: string | null;
  completed_at: string | null;
  notes: string | null;
  created_at: string;
};

export type LactatePoint = {
  id: string;
  test_id: string;
  user_id: string;
  stage_index: number;
  pace_seconds_per_km: number;
  speed_kmh: number | null;
  lactate_mmol: number;
  hr_bpm: number | null;
  rpe: number | null;
  comments: string | null;
  metrics: Record<string, unknown>;
  measured_at: string;
  created_at: string;
};
