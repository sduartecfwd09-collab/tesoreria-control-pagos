"use client";
import { useToast } from "../Avisos";
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

/**
 * «Copiar ruta» (la ruta relativa dentro de la carpeta de fuentes). No hay «Abrir archivo»: no se duplican los archivos en los computadores.
 * Queda anotado «Abrir en OneDrive»: depende del inicio de sesión, de Microsoft Graph y de que todos puedan abrir la carpeta (se coordina con TI).
 */
export function AccionesArchivo({ rutaRelativa }: { rutaRelativa: string }) {
  const aviso = useToast();
  async function copiarRuta() {
    if (await copiar(rutaRelativa)) aviso.exito("Ruta copiada");
    else aviso.error("No se pudo copiar la ruta");
  }

  return (
    <div className="mt-2">
      <p className="text-sm text-suave">Ábralo desde su OneDrive.</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="button" onClick={copiarRuta} className={`${claseBotonSecundario} !px-3 !py-1.5 text-sm`}>
          Copiar ruta
        </button>
      </div>
    </div>
  );
}
