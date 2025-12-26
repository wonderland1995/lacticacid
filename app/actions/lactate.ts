"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { getServerClient } from "@/lib/supabase-server";
import { DEFAULT_PROTOCOL, type LactatePoint, type LactateProtocol, type LactateTest } from "@/lib/types";

const authDisabled =
  process.env.DISABLE_AUTH === "true" || process.env.NEXT_PUBLIC_DISABLE_AUTH === "true";

type ActionResult<T> = { data?: T; error?: string };

async function ensureGuestUser(supabase: Awaited<ReturnType<typeof getServerClient>>) {
  const cookieStore = await cookies();
  const existingId = cookieStore.get("guest_user_id")?.value;
  const existingName = cookieStore.get("guest_user_name")?.value ?? "Guest";
  if (existingId) return { id: existingId, name: existingName };

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { id: null, name: null, error: "Guest mode requires SUPABASE_SERVICE_ROLE_KEY on the server." };
  }

  const email = `guest+${crypto.randomUUID()}@guest.local`;
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { name: existingName },
  });
  if (error || !data.user) {
    return { id: null, name: null, error: error?.message ?? "Unable to create guest user." };
  }
  cookieStore.set({
    name: "guest_user_id",
    value: data.user.id,
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  cookieStore.set({
    name: "guest_user_name",
    value: existingName,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return { id: data.user.id, name: existingName };
}

async function requireUser() {
  if (authDisabled && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { supabase: null as any, user: null, error: "Guest mode requires SUPABASE_SERVICE_ROLE_KEY on the server." };
  }
  const supabase = await getServerClient();
  if (authDisabled) {
    const guest = await ensureGuestUser(supabase);
    if (!guest.id) return { supabase, user: null, error: guest.error ?? "Unable to create guest session." };
    return { supabase, user: { id: guest.id }, error: null };
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
