import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const authDisabled =
  process.env.DISABLE_AUTH === "true" || process.env.NEXT_PUBLIC_DISABLE_AUTH === "true";

if (!supabaseUrl || (!supabaseAnonKey && !supabaseServiceRoleKey)) {
  console.warn(
    "Supabase environment variables are missing. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (or SUPABASE_SERVICE_ROLE_KEY).",
  );
}

export async function getServerClient() {
  const keyToUse = supabaseServiceRoleKey ?? supabaseAnonKey;

  if (!supabaseUrl || !keyToUse) {
    throw new Error("Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (or SUPABASE_SERVICE_ROLE_KEY).");
  }
  if (authDisabled && !supabaseServiceRoleKey) {
    throw new Error("Set SUPABASE_SERVICE_ROLE_KEY when DISABLE_AUTH=true to bypass RLS.");
  }

  const cookieStore = await cookies();
  return createServerClient(supabaseUrl, keyToUse, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => cookieStore.set({ name, value, ...options }));
      },
    },
  });
}
