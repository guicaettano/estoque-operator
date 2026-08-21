import { NextResponse, type NextRequest } from "next/server";
import { signUpErrorMessage } from "@/lib/supabase/auth-errors";
import { readAuthCredentials } from "@/lib/supabase/auth-request";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function loginRedirect(request: NextRequest, kind: "error" | "message", message: string) {
  const url = new URL("/login", request.url);
  url.searchParams.set(kind, message);
  return NextResponse.redirect(url, 303);
}

export async function POST(request: NextRequest) {
  const parsed = readAuthCredentials(await request.formData());
  if (!parsed.success) return loginRedirect(request, "error", parsed.message);

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? request.nextUrl.origin).replace(/\/$/, "");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    ...parsed.credentials,
    options: { emailRedirectTo: `${siteUrl}/auth/confirm` },
  });

  if (error) {
    console.warn("[auth/signup] Supabase rejected the signup", {
      code: error.code,
      status: error.status,
    });
    return loginRedirect(request, "error", signUpErrorMessage(error));
  }

  if (data.session) return NextResponse.redirect(new URL("/", request.url), 303);

  return loginRedirect(
    request,
    "message",
    "Conta criada. Confira seu e-mail para confirmar o acesso.",
  );
}
