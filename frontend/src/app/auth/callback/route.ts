import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/overview";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // Redirect to the intended destination after successful OAuth
      return NextResponse.redirect(new URL(next, origin));
    }
  }

  // Auth failed — redirect to login with error context
  return NextResponse.redirect(new URL("/login?error=auth_callback_failed", origin));
}
