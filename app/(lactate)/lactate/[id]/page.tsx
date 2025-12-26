import { notFound } from "next/navigation";
import Link from "next/link";
import { AuthForm } from "@/components/auth/AuthForm";
import { SessionDetail } from "@/components/SessionDetail";
import { getServerClient } from "@/lib/supabase-server";
import { DEFAULT_PROTOCOL, type LactatePoint } from "@/lib/types";
import { displayDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function SessionPage({ params }: { params: { id: string } }) {
  const supabase = getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="flex justify-center">
        <AuthForm redirectTo={`/lactate/${params.id}`} title="Sign in to view this session" />
      </div>
    );
  }

  const { data: test, error } = await supabase
    .from("lactate_tests")
    .select("*")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .single();

  if (error || !test) {
    return notFound();
  }

  const { data: points } = await supabase
    .from("lactate_points")
    .select("*")
    .eq("test_id", params.id)
    .order("stage_index", { ascending: true });

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
        testId={params.id}
        protocol={protocol}
        initialPoints={(points ?? []) as LactatePoint[]}
        initialNotes={test.notes}
      />
    </div>
  );
}
