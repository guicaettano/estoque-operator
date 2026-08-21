export type AuthCredentials = {
  email: string;
  password: string;
};

export function readAuthCredentials(formData: FormData):
  | { success: true; credentials: AuthCredentials }
  | { success: false; message: string } {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !email.includes("@") || password.length < 6) {
    return {
      success: false,
      message: "Informe um e-mail válido e uma senha de pelo menos 6 caracteres.",
    };
  }

  return { success: true, credentials: { email, password } };
}
