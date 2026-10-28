import type { Metadata } from "next";
import "./globals.css";
import { BarraIdentidad } from "@/components/BarraIdentidad";
import { MenuLateral } from "@/components/MenuLateral";

export const metadata: Metadata = {
  title: "Control de pagos · Tesorería",
  description: "Seguimiento de pagos frecuentes y conciliación con los estados de cuenta",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className="h-full antialiased">
      <body>
        <MenuLateral>
          <BarraIdentidad />
          {children}
        </MenuLateral>
      </body>
    </html>
  );
}
