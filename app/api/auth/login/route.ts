import { NextResponse, type NextRequest } from "next/server";
import { loginErrorMessage } from "@/lib/supabase/auth-errors";
import { readAuthCredentials } from "@/lib/supabase/auth-request";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function loginRedirect(request: NextRequest, message: string) {
  const url = new URL("/login", request.url);
  url.searchParams.set("error", message);
  return NextResponse.redirect(url, 303);
}

export async function POST(request: NextRequest) {
  const parsed = readAuthCredentials(await request.formData());
  if (!parsed.success) return loginRedirect(request, parsed.message);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.credentials);

  if (error) {
    console.warn("[auth/login] Supabase rejected the login", {
      code: error.code,
      status: error.status,
    });
    return loginRedirect(request, loginErrorMessage(error));
  }

  return NextResponse.redirect(new URL("/", request.url), 303);
}
