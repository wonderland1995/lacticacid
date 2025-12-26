import { NextResponse } from "next/server";
import { getServerClient } from "@/lib/supabase-server";

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://lacticacid-production.up.railway.app").replace(/\/$/, "");

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");

  if (code) {
    const supabase = await getServerClient();
    await supabase.auth.exchangeCodeForSession(code);
  }

  const redirectTo = requestUrl.searchParams.get("next") || "/lactate";
  const base = siteUrl || requestUrl.origin;
  return NextResponse.redirect(new URL(redirectTo, base));
}
