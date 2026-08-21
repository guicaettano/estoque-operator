import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Estoque Operator",
  description: "Entrada e revisão de mercadorias para lojas",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
