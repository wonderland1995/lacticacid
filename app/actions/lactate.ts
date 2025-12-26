"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { getServerClient } from "@/lib/supabase-server";
import { DEFAULT_PROTOCOL, type LactatePoint, type LactateProtocol, type LactateTest } from "@/lib/types";

const authDisabled =
  process.env.DISABLE_AUTH === "true" || process.env.NEXT_PUBLIC_DISABLE_AUTH === "true";

type ActionResult<T> = { data?: T; error?: string };

async function requireUser() {
  if (authDisabled && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { supabase: null as any, user: null, error: "Guest mode requires SUPABASE_SERVICE_ROLE_KEY on the server." };
  }
  const supabase = await getServerClient();
  if (authDisabled) {
    const cookieStore = await cookies();
    const guestId = cookieStore.get("guest_user_id")?.value;
    if (!guestId) return { supabase, user: null, error: "Start a guest session first." };
    return { supabase, user: { id: guestId }, error: null };
  }
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
  measuredAt?: string;
};

export async function upsertPointAction(input: UpsertPointInput): Promise<ActionResult<LactatePoint>> {
  const { supabase, user, error } = await requireUser();
  if (!user) return { error };
  const payload = {
    test_id: input.testId,
    user_id: user.id,
    stage_index: input.stageIndex,
    pace_seconds_per_km: input.paceSecondsPerKm,
    lactate_mmol: input.lactateMmol,
    hr_bpm: input.hrBpm ?? null,
    rpe: input.rpe ?? null,
    comments: input.comments ?? null,
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
