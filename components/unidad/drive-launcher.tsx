"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "../i18n/i18n-context";

export interface PickedDriveNode {
  id: string;
  name: string;
  mimeType: string | null;
  sizeBytes: number | null;
}

export interface DriveLauncherProps {
  /**
   * URL base de la app que hospeda la Unidad de Red (Archivo), sin barra final.
   * Configurable para poder promocionar el explorador a su propia app sin tocar
   * los consumidores. Ej.: `https://archivo.mycolegal.app`.
   */
  archivoUrl: string;
  /**
   * Se invoca al seleccionar un fichero. `url` es una signed URL de descarga
   * (≈15 min) ya resuelta por el embed; puede ser `null` si la firma falló.
   */
  onPick: (node: PickedDriveNode, url: string | null) => void;
  /** Contenido del botón disparador (por defecto, texto i18n). */
  children?: ReactNode;
  className?: string;
}

/**
 * Lanzador de la Unidad de Red (Modelo B): abre un modal con un iframe al
 * `/unidad-embed` de Archivo en modo picker y escucha el `postMessage` con el
 * fichero elegido. Same-site (`*.mycolegal.app`) → la sesión viaja en el iframe.
 */
export function DriveLauncher({ archivoUrl, onPick, children, className }: DriveLauncherProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  // Montado en cliente: el modal va por portal a `document.body`, así escapa de
  // cualquier ancestro con `transform` (p.ej. el AppSidebar usa `translate-x`
  // para el drawer), que de otro modo se vuelve el bloque contenedor del
  // `position: fixed` y recorta el modal dentro de la zona del sidebar.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const base = archivoUrl.replace(/\/$/, "");

  useEffect(() => {
    if (!open) return;
    let origin: string;
    try {
      origin = new URL(base).origin;
    } catch {
      origin = base;
    }
    function onMessage(e: MessageEvent) {
      if (e.origin !== origin) return; // solo aceptamos mensajes del iframe de Archivo
      const d = e.data as { type?: string; node?: PickedDriveNode; url?: string | null };
      if (d && d.type === "unidad:pick" && d.node) {
        onPick(d.node, d.url ?? null);
        setOpen(false);
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [open, base, onPick]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          className ??
          "inline-flex items-center gap-2 rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        }
      >
        {children ?? t("ui.driveLauncher.open")}
      </button>

      {open && mounted && createPortal(
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="flex h-[80vh] w-full max-w-4xl flex-col overflow-hidden rounded-lg bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-2">
              <h3 className="text-sm font-semibold">{t("ui.driveLauncher.title")}</h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-gray-500 hover:text-gray-800"
                aria-label={t("ui.driveLauncher.close")}
              >
                ✕
              </button>
            </div>
            <iframe
              src={`${base}/unidad-embed?mode=picker`}
              title={t("ui.driveLauncher.title")}
              className="flex-1 border-0"
            />
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
