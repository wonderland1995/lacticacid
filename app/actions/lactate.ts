"use server";

import { revalidatePath } from "next/cache";
import { getServerClient } from "@/lib/supabase-server";
import { DEFAULT_PROTOCOL, type LactatePoint, type LactateProtocol, type LactateTest } from "@/lib/types";

type ActionResult<T> = { data?: T; error?: string };

async function requireUser() {
  const supabase = await getServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    return { supabase, user: null, error: error?.message ?? "Not signed in" };
  }
  return { supabase, user, error: null };
}

export async function createTestAction(options?: {
  title?: string;
  notes?: string;
  protocol?: LactateProtocol;
}): Promise<ActionResult<LactateTest>> {
  const { supabase, user, error } = await requireUser();
  if (!user) return { error };

  const protocol = options?.protocol ?? DEFAULT_PROTOCOL;
  const { data, error: insertError } = await supabase
    .from("lactate_tests")
    .insert({
      title: options?.title?.trim() || "Lactate Threshold Test",
      sport: "running",
      protocol,
      notes: options?.notes ?? null,
      user_id: user.id,
      started_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (insertError) return { error: insertError.message };
  revalidatePath("/lactate");
  if (data?.id) revalidatePath(`/lactate/${data.id}`);
  return { data: data as LactateTest };
}

export async function completeTestAction(testId: string): Promise<ActionResult<boolean>> {
  const { supabase, user, error } = await requireUser();
  if (!user) return { error };
  const { error: updateError } = await supabase
    .from("lactate_tests")
    .update({ completed_at: new Date().toISOString() })
    .eq("id", testId)
    .eq("user_id", user.id);
  if (updateError) return { error: updateError.message };
  revalidatePath("/lactate");
  revalidatePath(`/lactate/${testId}`);
  return { data: true };
}

export async function updateNotesAction(testId: string, notes: string): Promise<ActionResult<boolean>> {
  const { supabase, user, error } = await requireUser();
  if (!user) return { error };
  const { error: updateError } = await supabase
    .from("lactate_tests")
    .update({ notes })
    .eq("id", testId)
    .eq("user_id", user.id);
  if (updateError) return { error: updateError.message };
  revalidatePath(`/lactate/${testId}`);
  revalidatePath("/lactate");
  return { data: true };
}

export type UpsertPointInput = {
  testId: string;
  stageIndex: number;
  paceSecondsPerKm: number;
  lactateMmol: number;
  hrBpm?: number | null;
  rpe?: number | null;
  comments?: string;
  speedKmh?: number | null;
  metrics?: Record<string, unknown>;
  measuredAt?: string;
};

export async function upsertPointAction(input: UpsertPointInput): Promise<ActionResult<LactatePoint>> {
  const { supabase, user, error } = await requireUser();
  if (!user) return { error };
  const metricsPayload = input.metrics ?? {};
  const payload = {
    test_id: input.testId,
    user_id: user.id,
    stage_index: input.stageIndex,
    pace_seconds_per_km: input.paceSecondsPerKm,
    lactate_mmol: input.lactateMmol,
    hr_bpm: input.hrBpm ?? null,
    rpe: input.rpe ?? null,
    comments: input.comments ?? null,
    speed_kmh: input.speedKmh ?? null,
    metrics: metricsPayload,
    measured_at: input.measuredAt ?? new Date().toISOString(),
  };

  const { data, error: upsertError } = await supabase
    .from("lactate_points")
    .upsert(payload, { onConflict: "test_id,stage_index" })
    .select("*")
    .single();

  if (upsertError) return { error: upsertError.message };
  revalidatePath(`/lactate/${input.testId}`);
  revalidatePath("/lactate");
  return { data: data as LactatePoint };
}

export type ImportPointInput = {
  stageIndex: number;
  paceSecondsPerKm: number;
  lactateMmol: number;
  hrBpm?: number | null;
  speedKmh?: number | null;
  rpe?: number | null;
  comments?: string;
  metrics?: Record<string, unknown>;
  measuredAt?: string;
};

export async function importPointsAction(testId: string, rows: ImportPointInput[]): Promise<ActionResult<LactatePoint[]>> {
  const { supabase, user, error } = await requireUser();
  if (!user) return { error };
  if (!rows.length) return { data: [] as LactatePoint[] };

  const payload = rows.map((row) => ({
    test_id: testId,
    user_id: user.id,
    stage_index: row.stageIndex,
    pace_seconds_per_km: row.paceSecondsPerKm,
    lactate_mmol: row.lactateMmol,
    hr_bpm: row.hrBpm ?? null,
    rpe: row.rpe ?? null,
    comments: row.comments ?? null,
    speed_kmh: row.speedKmh ?? null,
    metrics: row.metrics ?? {},
    measured_at: row.measuredAt ?? new Date().toISOString(),
  }));

  const { data, error: upsertError } = await supabase
    .from("lactate_points")
    .upsert(payload, { onConflict: "test_id,stage_index" })
    .select("*")
    .order("stage_index", { ascending: true });

  if (upsertError) return { error: upsertError.message };
  revalidatePath(`/lactate/${testId}`);
  revalidatePath("/lactate");
  return { data: data as LactatePoint[] };
}
