import { cookies } from "next/headers";
import Link from "next/link";
import { logoutAction } from "@/app/actions/logout";

const authDisabled =
  process.env.DISABLE_AUTH === "true" || process.env.NEXT_PUBLIC_DISABLE_AUTH === "true";

export default async function LactateLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const guestName = cookieStore.get("guest_user_name")?.value;

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white/70 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <Link href="/lactate" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-indigo-600 text-white shadow-lg shadow-indigo-200">
              LT
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800">Lactate Threshold Test</p>
              <p className="text-xs text-slate-500">Running | Multi-stage sampling</p>
            </div>
          </Link>
          <nav className="flex items-center gap-4">
            <Link
              href="/lactate"
              className="rounded-full px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
            >
              Sessions
            </Link>
            <Link
              href="/lactate/new"
              prefetch={false}
              className="rounded-full bg-emerald-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-200"
            >
              New test
            </Link>
            {authDisabled && (
              <form action={logoutAction} className="flex items-center gap-2">
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                  {guestName ? `Guest: ${guestName}` : "Guest mode"}
                </span>
                <button
                  type="submit"
                  className="rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 transition hover:border-slate-500 hover:bg-white focus:outline-none focus:ring-2 focus:ring-slate-200"
                >
                  Log out
                </button>
              </form>
            )}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 pb-16 pt-8">{children}</main>
    </div>
  );
}
