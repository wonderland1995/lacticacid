import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { TestRunner } from "@/components/TestRunner";
import { getServerClient } from "@/lib/supabase-server";
import { DEFAULT_PROTOCOL, type LactatePoint } from "@/lib/types";
import { GuestPrompt } from "../../components/GuestPrompt";

const authDisabled =
  process.env.DISABLE_AUTH === "true" || process.env.NEXT_PUBLIC_DISABLE_AUTH === "true";
const serviceRoleMissing = authDisabled && !process.env.SUPABASE_SERVICE_ROLE_KEY;

export const dynamic = "force-dynamic";

export default async function NewTestPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  if (serviceRoleMissing) {
    return (
      <div className="rounded-2xl bg-white/80 p-6 text-sm text-rose-700 shadow-sm ring-1 ring-rose-200">
        Guest mode is enabled but SUPABASE_SERVICE_ROLE_KEY is not set. Add it to the server env (Supabase → Settings → API
        → service_role) and redeploy.
      </div>
    );
  }

  const supabase = await getServerClient();
  const cookieStore = await cookies();
  const guestId = cookieStore.get("guest_user_id")?.value;
  const userId = authDisabled ? guestId : (await supabase.auth.getUser()).data.user?.id;
  if (!userId) {
    return <GuestPrompt nextLabel="start" redirectTo="/lactate/new" />;
  }

  const testId = typeof searchParams.testId === "string" ? searchParams.testId : null;

  if (!testId) {
    const { data, error } = await supabase
      .from("lactate_tests")
      .insert({
        user_id: userId,
        title: "Lactate Threshold Test",
        sport: "running",
        protocol: DEFAULT_PROTOCOL,
        started_at: new Date().toISOString(),
      })
      .select("*")
      .single();

    if (error || !data) {
      return (
        <div className="rounded-2xl bg-white/80 p-6 text-sm text-rose-700 shadow-sm ring-1 ring-rose-200">
          Failed to create test: {error?.message}
        </div>
      );
    }
    redirect(`/lactate/new?testId=${data.id}`);
  }

  const { data: test, error: testError } = await supabase
    .from("lactate_tests")
    .select("*")
    .eq("id", testId)
    .eq("user_id", userId)
    .single();

  if (testError || !test) {
    return (
      <div className="rounded-2xl bg-white/80 p-6 text-sm text-rose-700 shadow-sm ring-1 ring-rose-200">
        Test not found or unavailable.
      </div>
    );
  }

  const { data: points } = await supabase
    .from("lactate_points")
    .select("*")
    .eq("test_id", test.id)
    .order("stage_index", { ascending: true });

  const protocol = (test.protocol as typeof DEFAULT_PROTOCOL) ?? DEFAULT_PROTOCOL;

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">New test</p>
        <h1 className="text-3xl font-semibold text-slate-900">Run and capture samples</h1>
        <p className="text-sm text-slate-600">
          Warmup for {Math.round(protocol.warmupSeconds / 60)} minutes, then {protocol.numStages} x{" "}
          {Math.round(protocol.stageSeconds / 60)}:00 stages. Sampling at {Math.floor(protocol.sampleOffsetSeconds / 60)}:
          {(protocol.sampleOffsetSeconds % 60).toString().padStart(2, "0")}.
        </p>
      </div>
      <TestRunner testId={test.id} protocol={protocol} initialPoints={(points ?? []) as LactatePoint[]} />
    </div>
  );
}
