import { NextResponse } from "next/server";
import { getServerClient } from "@/lib/supabase";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");

  if (code) {
    const supabase = getServerClient();
    await supabase.auth.exchangeCodeForSession(code);
  }

  const redirectTo = requestUrl.searchParams.get("next") || "/lactate";
  return NextResponse.redirect(new URL(redirectTo, requestUrl.origin));
}
