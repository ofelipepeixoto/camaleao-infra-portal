import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Camaleão Infra Portal",
  description: "Seu espaço para diagnosticar necessidades de IA, revisar planos e acompanhar os próximos passos com a Agência Camaleão.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
