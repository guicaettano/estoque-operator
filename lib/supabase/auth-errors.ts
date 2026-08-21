type SupabaseAuthError = {
  code?: string;
};

export function loginErrorMessage(error: SupabaseAuthError): string {
  if (error.code === "email_not_confirmed") {
    return "Confirme seu e-mail antes de entrar. Verifique também a caixa de spam.";
  }

  if (error.code === "over_request_rate_limit") {
    return "Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.";
  }

  return "E-mail ou senha inválidos.";
}

export function signUpErrorMessage(error: SupabaseAuthError): string {
  switch (error.code) {
    case "email_exists":
    case "user_already_exists":
      return "Já existe uma conta com esse e-mail. Tente entrar ou confirme o e-mail recebido.";
    case "signup_disabled":
      return "A criação de contas está desativada no Supabase Auth.";
    case "email_address_invalid":
      return "O endereço de e-mail informado não é válido.";
    case "weak_password":
      return "A senha não atende aos requisitos configurados no Supabase.";
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return "Muitas tentativas. Aguarde alguns minutos antes de criar a conta novamente.";
    default:
      return "Não foi possível criar a conta. Verifique os dados ou tente novamente.";
  }
}
