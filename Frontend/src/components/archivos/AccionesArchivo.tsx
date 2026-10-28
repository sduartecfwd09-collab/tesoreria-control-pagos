"use client";
import { useState } from "react";
import { api } from "@/lib/api";
import { claseBotonSecundario } from "../ui";

/** Copia texto al portapapeles; si el navegador no lo permite, usa un campo temporal. */
async function copiar(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    try {
      const campo = document.createElement("textarea");
      campo.value = texto;
      campo.setAttribute("readonly", "");
      campo.style.position = "fixed";
      campo.style.opacity = "0";
      document.body.appendChild(campo);
      campo.select();
      const ok = document.execCommand("copy");
      campo.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

/** «Abrir archivo» (descarga una copia) y «Copiar ruta» (la ruta relativa dentro de la carpeta de fuentes). */
export function AccionesArchivo({ id, nombre, rutaRelativa }: { id: number; nombre: string; rutaRelativa: string }) {
  const [trabajando, setTrabajando] = useState(false);
  const [mensaje, setMensaje] = useState<{ texto: string; error: boolean } | null>(null);

  async function abrir() {
    setTrabajando(true);
    setMensaje(null);
    try {
      await api.descargarArchivo(id, nombre);
      setMensaje({ texto: "Archivo descargado", error: false });
    } catch (e) {
      setMensaje({ texto: e instanceof Error && e.message ? e.message : "No se pudo abrir el archivo", error: true });
    } finally {
      setTrabajando(false);
    }
  }
  async function copiarRuta() {
    const ok = await copiar(rutaRelativa);
    setMensaje(ok ? { texto: "Ruta copiada", error: false } : { texto: "No se pudo copiar la ruta", error: true });
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <button type="button" onClick={abrir} disabled={trabajando} className={`${claseBotonSecundario} !px-3 !py-1.5 text-sm`}>
        {trabajando ? "Abriendo…" : "Abrir archivo"}
      </button>
      <button type="button" onClick={copiarRuta} className={`${claseBotonSecundario} !px-3 !py-1.5 text-sm`}>
        Copiar ruta
      </button>
      <span role={mensaje?.error ? "alert" : "status"} aria-live="polite" className={`text-sm font-medium ${mensaje?.error ? "text-rojo" : "text-suave"}`}>
        {mensaje?.texto ?? ""}
      </span>
    </div>
  );
}
