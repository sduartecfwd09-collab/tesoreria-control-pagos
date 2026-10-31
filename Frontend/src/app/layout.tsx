import type { Metadata } from "next";
import "./globals.css";
import { BarraIdentidad } from "@/components/BarraIdentidad";
import { LineaHoy } from "@/components/LineaHoy";
import { MenuLateral } from "@/components/MenuLateral";
import { ProveedorAvisos } from "@/components/Avisos";

export const metadata: Metadata = {
  title: "Control de pagos · Tesorería",
  description: "Seguimiento de pagos frecuentes y conciliación con los estados de cuenta",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className="h-full antialiased">
      <body>
        <ProveedorAvisos>
          <MenuLateral>
            <BarraIdentidad />
            <LineaHoy />
            {children}
          </MenuLateral>
        </ProveedorAvisos>
      </body>
    </html>
  );
}
