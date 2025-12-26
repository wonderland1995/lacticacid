"use client";

import { useMemo, useState, useTransition } from "react";
import { getBrowserClient } from "@/lib/supabase-browser";

type Props = {
  redirectTo?: string;
  title?: string;
  subtitle?: string;
};

export function AuthForm({
  redirectTo = "/lactate",
  title = "Sign in to save your tests",
  subtitle = "Use an email magic link to authenticate. No passwords, just a quick link.",
}: Props) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const callbackUrl = useMemo(() => {
    if (typeof window === "undefined") return `${redirectTo}`;
    const origin = window.location.origin;
    return `${origin}/auth/callback?next=${encodeURIComponent(redirectTo)}`;
  }, [redirectTo]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setStatus(null);
    startTransition(() => {
      void (async () => {
        const supabase = getBrowserClient();
        const { error: authError } = await supabase.auth.signInWithOtp({
          email,
          options: {
            emailRedirectTo: callbackUrl,
          },
        });
        if (authError) {
          setError(authError.message);
          return;
        }
        setStatus("Check your inbox for the magic link.");
      })();
    });
  };

  return (
    <div className="w-full max-w-lg rounded-2xl bg-white/80 p-8 shadow-sm ring-1 ring-slate-200">
      <div className="mb-6 space-y-2">
        <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Authentication</p>
        <h2 className="text-2xl font-semibold text-slate-900">{title}</h2>
        <p className="text-sm text-slate-600">{subtitle}</p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block text-sm font-medium text-slate-700">
          Email
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 shadow-inner outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
            placeholder="you@example.com"
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex w-full items-center justify-center rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          {pending ? "Sending magic link..." : "Send magic link"}
        </button>
      </form>
      {status && <p className="mt-4 text-sm text-emerald-700">{status}</p>}
      {error && <p className="mt-4 text-sm text-rose-700">{error}</p>}
    </div>
  );
}
