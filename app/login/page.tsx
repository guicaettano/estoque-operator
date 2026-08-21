type LoginPageProps = {
  searchParams: Promise<{ error?: string; message?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { error, message } = await searchParams;

  return (
    <main className="login-page">
      <section className="login-intro">
        <div className="brand login-brand"><span className="brand-mark" aria-hidden="true">EO</span><span>Estoque Operator</span></div>
        <div><p className="eyebrow">Compras organizadas</p><h1>Da nota ao estoque, sem retrabalho.</h1><p>Extraia produtos de PDFs e XMLs, revise preços e distribua cada item entre suas lojas.</p></div>
        <p className="login-footnote">Operação segura. Nenhum produto é enviado ao TagPlus sem confirmação.</p>
      </section>
      <section className="login-form-panel">
        <div className="login-card">
        <p className="eyebrow">Acesso à conta</p>
        <h2>Acesse sua operação</h2>
        <p className="login-description">
          Entre para processar notas de fornecedor e conectar a conta do TagPlus.
        </p>

        {error ? <p className="notice notice-error" role="alert">{error}</p> : null}
        {message ? <p className="notice notice-success" role="status">{message}</p> : null}

        <form action="/api/auth/login" method="post" className="login-form">
          <label>
            E-mail
            <input
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="voce@empresa.com"
            />
          </label>
          <label>
            Senha
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              minLength={6}
              required
              placeholder="Mínimo de 6 caracteres"
            />
          </label>
          <button type="submit" className="button button-primary">Entrar</button>
          <div className="login-divider"><span>ou</span></div>
          <button type="submit" formAction="/api/auth/signup" className="button button-quiet">Criar uma conta</button>
        </form>
        </div>
      </section>
    </main>
  );
}
