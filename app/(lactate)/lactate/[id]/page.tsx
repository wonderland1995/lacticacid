import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import Link from "next/link";
import { SessionDetail } from "@/components/SessionDetail";
import { getServerClient } from "@/lib/supabase-server";
import { DEFAULT_PROTOCOL, type LactatePoint } from "@/lib/types";
import { displayDate } from "@/lib/utils";
import { GuestPrompt } from "../../components/GuestPrompt";

const authDisabled =
  process.env.DISABLE_AUTH === "true" || process.env.NEXT_PUBLIC_DISABLE_AUTH === "true";
const serviceRoleMissing = authDisabled && !process.env.SUPABASE_SERVICE_ROLE_KEY;

export const dynamic = "force-dynamic";

export default async function SessionPage({ params }: { params: { id: string } }) {
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
    return <GuestPrompt nextLabel="session" />;
  }

  const { data: test, error } = await supabase
    .from("lactate_tests")
    .select("*")
    .eq("id", params.id)
    .eq("user_id", userId)
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
