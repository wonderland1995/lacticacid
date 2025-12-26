"use server";

import { cookies } from "next/headers";
import { getServerClient } from "@/lib/supabase-server";

export async function startGuestSession(formData: FormData) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Guest mode requires SUPABASE_SERVICE_ROLE_KEY to be set on the server.");
  }
  const name = (formData.get("name") as string | null)?.trim() || "Guest";
  const cookieStore = await cookies();

  const existingId = cookieStore.get("guest_user_id")?.value;
  if (existingId) {
    cookieStore.set({ name: "guest_user_name", value: name, path: "/", sameSite: "lax" });
    return;
  }

  const supabase = await getServerClient();
  const email = `guest+${crypto.randomUUID()}@guest.local`;
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { name },
  });

  if (error || !data.user) {
    throw new Error(error?.message ?? "Unable to start guest session");
  }

  cookieStore.set({
    name: "guest_user_id",
    value: data.user.id,
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
  cookieStore.set({ name: "guest_user_name", value: name, path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 30 });
}
