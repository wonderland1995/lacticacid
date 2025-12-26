"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getServerClient } from "@/lib/supabase-server";

export async function logoutAction() {
  const supabase = await getServerClient();
  // Best-effort sign out if a Supabase session exists.
  await supabase.auth.signOut().catch(() => {});

  const cookieStore = await cookies();
  cookieStore.delete("guest_user_id");
  cookieStore.delete("guest_user_name");

  redirect("/lactate");
}
