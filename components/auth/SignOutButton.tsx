"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { getBrowserClient } from "@/lib/supabase";

export function SignOutButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const handleSignOut = () => {
    startTransition(() => {
      void (async () => {
        const supabase = getBrowserClient();
        await supabase.auth.signOut();
        router.refresh();
      })();
    });
  };

  return (
    <button
      onClick={handleSignOut}
      disabled={pending}
      className="rounded-full border border-slate-300 px-3 py-1 text-sm font-medium text-slate-700 transition hover:border-slate-500 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Signing out..." : "Sign out"}
    </button>
  );
}
