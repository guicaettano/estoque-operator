import { describe, expect, it } from "vitest";
import { loginErrorMessage, signUpErrorMessage } from "@/lib/supabase/auth-errors";
import { readAuthCredentials } from "@/lib/supabase/auth-request";

describe("Supabase authentication forms", () => {
  it("normalizes valid credentials", () => {
    const formData = new FormData();
    formData.set("email", "  User@Example.com ");
    formData.set("password", "secret123");

    expect(readAuthCredentials(formData)).toEqual({
      success: true,
      credentials: { email: "user@example.com", password: "secret123" },
    });
  });

  it("rejects incomplete credentials", () => {
    const formData = new FormData();
    formData.set("email", "invalid");
    formData.set("password", "123");

    expect(readAuthCredentials(formData).success).toBe(false);
  });

  it("explains an unconfirmed login", () => {
    expect(loginErrorMessage({ code: "email_not_confirmed" })).toContain("Confirme seu e-mail");
  });

  it("explains when signup is disabled", () => {
    expect(signUpErrorMessage({ code: "signup_disabled" })).toContain("desativada");
  });
});
