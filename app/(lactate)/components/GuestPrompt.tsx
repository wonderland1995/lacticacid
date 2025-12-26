import { startGuestSession } from "@/app/actions/guest";

export function GuestPrompt({ nextLabel, redirectTo }: { nextLabel: string; redirectTo: string }) {
  return (
    <div className="rounded-2xl bg-white/80 p-6 shadow-sm ring-1 ring-slate-200">
      <h3 className="text-lg font-semibold text-slate-900">Enter a name to continue</h3>
      <p className="text-sm text-slate-600">
        We’ll create a guest session so you can save tests without signing in. Auth can be added later.
      </p>
      <form action={startGuestSession} className="mt-4 space-y-3">
        <input type="hidden" name="redirectTo" value={redirectTo} />
        <input
          type="text"
          name="name"
          required
          placeholder="Your name"
          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 shadow-inner outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
        />
        <button
          type="submit"
          className="w-full rounded-xl bg-emerald-700 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-200"
        >
          Continue to {nextLabel}
        </button>
      </form>
    </div>
  );
}
