import Link from "next/link";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { getServerClient } from "@/lib/supabase-server";

export default async function LactateLayout({ children }: { children: React.ReactNode }) {
  const supabase = getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

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
              className="rounded-full bg-slate-900 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
            >
              New test
            </Link>
            {user ? (
              <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-sm text-slate-700 shadow-sm">
                <span className="hidden sm:inline">{user.email}</span>
                <span className="text-xs text-slate-400">|</span>
                <SignOutButton />
              </div>
            ) : (
              <Link
                href="/lactate"
                className="rounded-full border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-500"
              >
                Sign in
              </Link>
            )}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 pb-16 pt-8">{children}</main>
    </div>
  );
}
