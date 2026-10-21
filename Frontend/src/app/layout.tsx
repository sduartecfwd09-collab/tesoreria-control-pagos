import type { Metadata } from "next";
import "./globals.css";
import { Navegacion } from "@/components/Navegacion";

export const metadata: Metadata = {
  title: "Control de pagos · Tesorería",
  description: "Seguimiento de vencimientos y conciliación de pagos frecuentes",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <header className="bg-cabecera text-sobre-cabecera border-b-4 border-acento">
          <div className="mx-auto max-w-6xl px-4 py-3 flex items-baseline gap-3">
            <span className="font-bold tracking-wide">GARNIER</span>
            <span className="text-sm uppercase tracking-[0.2em] font-light">Control de pagos · Tesorería</span>
          </div>
        </header>
        <Navegacion />
        <main className="mx-auto w-full max-w-6xl px-4 py-8 flex-1">{children}</main>
      </body>
    </html>
  );
}
