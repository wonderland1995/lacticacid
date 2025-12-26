import Link from "next/link";
import { AuthForm } from "@/components/auth/AuthForm";
import { getServerClient } from "@/lib/supabase-server";
import { DEFAULT_PROTOCOL } from "@/lib/types";
import { displayDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function LactatePage() {
  const supabase = getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="flex justify-center">
        <AuthForm redirectTo="/lactate" />
      </div>
    );
  }

  const { data: tests, error } = await supabase
    .from("lactate_tests")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const { data: pointCounts } = await supabase
    .from("lactate_points")
    .select("test_id, stage_index")
    .eq("user_id", user.id);

  const countMap = new Map<string, number>();
  pointCounts?.forEach((p) => {
    countMap.set(p.test_id, (countMap.get(p.test_id) || 0) + 1);
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Sessions</p>
          <h1 className="text-3xl font-semibold text-slate-900">Lactate Threshold Tests</h1>
          <p className="text-sm text-slate-600">Track, compare, and capture samples for every stage.</p>
        </div>
        <Link
          href="/lactate/new"
          className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
        >
          Start new test
        </Link>
      </div>

      {error && <p className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">Failed to load sessions: {error.message}</p>}

      {!tests?.length && !error ? (
        <div className="flex flex-col items-start gap-3 rounded-2xl bg-white/70 p-6 shadow-sm ring-1 ring-slate-200">
          <h3 className="text-xl font-semibold text-slate-900">No tests yet</h3>
          <p className="text-sm text-slate-600">
            Create a new test to start capturing lactate samples across stages. Defaults use an 8 x 3:00 protocol with sampling at 2:30.
          </p>
          <Link
            href="/lactate/new"
            className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
          >
            Create your first test
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {tests?.map((test) => {
            const protocol = (test.protocol as typeof DEFAULT_PROTOCOL) ?? DEFAULT_PROTOCOL;
            const recorded = countMap.get(test.id) ?? 0;
            return (
              <Link
                key={test.id}
                href={`/lactate/${test.id}`}
                className="group relative overflow-hidden rounded-2xl bg-white/80 p-5 shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-1 hover:shadow-lg"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500">Running</p>
                    <h3 className="text-lg font-semibold text-slate-900">{test.title}</h3>
                    <p className="text-xs text-slate-500">Created {displayDate(test.created_at)}</p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                    {recorded}/{protocol.numStages} stages
                  </span>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-3 text-sm text-slate-700">
                  <div>
                    <p className="text-xs uppercase text-slate-500">Warmup</p>
                    <p className="font-semibold">{Math.round(protocol.warmupSeconds / 60)} min</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase text-slate-500">Stage</p>
                    <p className="font-semibold">{Math.round(protocol.stageSeconds / 60)}:00 x {protocol.numStages}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase text-slate-500">Sampling</p>
                    <p className="font-semibold">
                      {Math.floor(protocol.sampleOffsetSeconds / 60)}:
                      {(protocol.sampleOffsetSeconds % 60).toString().padStart(2, "0")} +{protocol.sampleWindowSeconds}s
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between text-sm text-slate-600">
                  <span>{test.completed_at ? "Completed" : "In progress"}</span>
                  <span className="text-slate-400">View details -&gt;</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
