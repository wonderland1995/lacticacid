import Link from "next/link";
import { AuthForm } from "@/components/auth/AuthForm";
import { SessionDetail } from "@/components/SessionDetail";
import { getServerClient } from "@/lib/supabase-server";
import { DEFAULT_PROTOCOL, type LactatePoint } from "@/lib/types";
import { displayDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function firstQueryValue(sp?: SearchParams, keys: string[] = ["id", "testId"]) {
  if (!sp) return undefined;
  for (const key of keys) {
    const v = sp[key];
    if (typeof v === "string" && v.trim()) return v;
    if (Array.isArray(v) && v[0]?.trim()) return v[0];
  }
  return undefined;
}

export default async function SessionPage({
  params,
  searchParams,
}: {
  params: { id?: string };
  searchParams?: SearchParams;
}) {
  const testId = params?.id || firstQueryValue(searchParams);

  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="flex justify-center">
        <AuthForm redirectTo={`/lactate/${testId ?? ""}`} title="Sign in to view this session" />
      </div>
    );
  }

  if (!testId) {
    return (
      <div className="rounded-2xl bg-white/80 p-6 text-sm text-rose-700 shadow-sm ring-1 ring-rose-200">
        Missing session id. Go back to{" "}
        <Link href="/lactate" className="font-semibold text-slate-900 underline">
          Sessions
        </Link>{" "}
        and re-open a test.
      </div>
    );
  }

  const { data: test, error } = await supabase.from("lactate_tests").select("*").eq("id", testId).single();

  if (error || !test) {
    return (
      <div className="rounded-2xl bg-white/80 p-6 text-sm text-rose-700 shadow-sm ring-1 ring-rose-200">
        Failed to load session {testId}. {error?.message ?? "Not found."}
      </div>
    );
  }

  const { data: points, error: pointsError } = await supabase
    .from("lactate_points")
    .select("*")
    .eq("test_id", testId)
    .order("stage_index", { ascending: true });

  if (pointsError) {
    return (
      <div className="rounded-2xl bg-white/80 p-6 text-sm text-rose-700 shadow-sm ring-1 ring-rose-200">
        Failed to load points. {pointsError.message}
      </div>
    );
  }

  const protocol = (test.protocol as typeof DEFAULT_PROTOCOL) ?? DEFAULT_PROTOCOL;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Session detail</p>
          <h1 className="text-3xl font-semibold text-slate-900">{test.title}</h1>
          <p className="text-sm text-slate-600">
            Started {displayDate(test.started_at)} - {test.completed_at ? `Completed ${displayDate(test.completed_at)}` : "In progress"}
          </p>
        </div>
        <Link
          href="/lactate"
          className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-500"
        >
          Back to sessions
        </Link>
      </div>

      <SessionDetail
        testId={testId}
        protocol={protocol}
        initialPoints={(points ?? []) as LactatePoint[]}
        initialNotes={test.notes}
      />
    </div>
  );
}
