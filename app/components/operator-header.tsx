import Link from "next/link";
import type { ProductProviderKind } from "@/lib/catalog/types";

type OperatorHeaderProps = {
  active?: "home" | "entrada" | "entradas";
  providerKind?: ProductProviderKind;
};

export function OperatorHeader({ active, providerKind }: OperatorHeaderProps) {
  return (
    <header className="operator-topbar">
      <Link className="brand" href="/" aria-label="Estoque Operator, página inicial">
        <span className="brand-mark" aria-hidden="true">EO</span>
        <span>Estoque Operator</span>
      </Link>

      <nav className="operator-nav" aria-label="Navegação principal">
        <Link aria-current={active === "home" ? "page" : undefined} className={active === "home" ? "is-active" : undefined} href="/">Visão geral</Link>
        <Link aria-current={active === "entrada" ? "page" : undefined} className={active === "entrada" ? "is-active" : undefined} href="/entrada">Nova entrada</Link>
        <Link aria-current={active === "entradas" ? "page" : undefined} className={active === "entradas" ? "is-active" : undefined} href="/entradas">Histórico</Link>
      </nav>

      <div className="operator-actions">
        {providerKind ? (
          <span className="provider-status">
            <span className="status-indicator" aria-hidden="true" />
            {providerKind === "local" ? "Catálogo local" : "TagPlus conectado"}
          </span>
        ) : null}
        <form action="/auth/logout" method="post">
          <button className="logout-button" type="submit">Sair</button>
        </form>
      </div>
    </header>
  );
}
