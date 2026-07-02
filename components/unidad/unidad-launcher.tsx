"use client";

import { useEffect, useState } from "react";
import { HardDrive } from "lucide-react";
import { DriveLauncher } from "./drive-launcher";
import { useSidebarCollapse } from "../layout/sidebar-collapse-context";
import { useI18n } from "../i18n/i18n-context";

/**
 * Ítem de menú "Unidad de red" (Modelo B): abre el explorador de Archivo
 * embebido en un modal (iframe a `/unidad-embed`), sin salir de la app. Se
 * monta vía `extraNav` del AppSidebar y sirve a cualquier app de la notaría.
 *
 * Componente compartido (antes vivía duplicado como wrapper por app). Deriva la
 * URL de Archivo de forma genérica: sustituye el primer segmento de subdominio
 * del host actual por `archivo` (p.ej. `notaria.mycolegal.app` →
 * `archivo.mycolegal.app`), o usa `NEXT_PUBLIC_ARCHIVO_URL` si está definida.
 */
export function UnidadLauncher({ context }: { context?: { protocolo?: string | number } } = {}) {
  const { t } = useI18n();
  const { collapsed } = useSidebarCollapse();
  const [archivoUrl, setArchivoUrl] = useState<string | null>(null);

  useEffect(() => {
    const explicit = process.env.NEXT_PUBLIC_ARCHIVO_URL?.replace(/\/$/, "") || "";
    // Sustituye el primer label del host (el slug de la app) por "archivo",
    // dejando intacto el resto (dominio y puerto).
    const derived = `${window.location.protocol}//${window.location.host.replace(
      /^[^.]+/,
      "archivo",
    )}`;
    setArchivoUrl(explicit || derived);
  }, []);

  if (!archivoUrl) return null;

  // En modo compacto reproducimos el comportamiento de SidebarLink: icono
  // centrado y el texto pasa a ser solo accesible (sr-only).
  const base =
    "flex w-full items-center gap-3 rounded-md py-2 text-sm text-white/80 transition-colors hover:bg-white/10 hover:text-white";

  return (
    <DriveLauncher
      archivoUrl={archivoUrl}
      context={context}
      onPick={(_node, url) => {
        if (url) window.open(url, "_blank", "noopener,noreferrer");
      }}
      className={`${base} ${collapsed ? "justify-center px-0" : "px-2"}`}
    >
      <HardDrive className="h-4 w-4 shrink-0" />
      {collapsed ? <span className="sr-only">{t("ui.sidebar.unidad")}</span> : t("ui.sidebar.unidad")}
    </DriveLauncher>
  );
}
