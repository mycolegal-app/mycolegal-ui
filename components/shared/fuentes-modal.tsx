"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Database, Layers, SlidersHorizontal, X } from "lucide-react";
import { useI18n } from "../i18n/i18n-context";
import { apiErrorFromResponse } from "../../lib/api-error";
import {
  readFuentesSel,
  writeFuentesSel,
  FUENTES_CHANGED_EVENT,
} from "../../lib/biblioteca-fuentes";
import {
  readClasesSel,
  writeClasesSel,
  CLASES_CHANGED_EVENT,
} from "../../lib/biblioteca-clases";

// Color por CLASE (mismo criterio que la Biblioteca del Consultor y el rail).
const CLASE_COLOR: Record<string, string> = {
  RESOLUCIONES_DGRN: "bg-cyan-100 text-cyan-800 border-cyan-300",
  RESOLUCIONES_DGDEJ: "bg-red-100 text-red-800 border-red-300",
  SISTEMA_NOTARIAL: "bg-indigo-100 text-indigo-800 border-indigo-300",
  DOCTRINA: "bg-violet-100 text-violet-800 border-violet-300",
  JURISPRUDENCIA: "bg-amber-100 text-amber-800 border-amber-300",
  LEGISLACION: "bg-emerald-100 text-emerald-800 border-emerald-300",
  LEGISLACION_AUTONOMICA: "bg-emerald-100 text-emerald-800 border-emerald-300",
  LEGISLACION_UE: "bg-blue-100 text-blue-800 border-blue-300",
  GUIAS: "bg-amber-100 text-amber-800 border-amber-300",
  FUNDACIONES: "bg-orange-100 text-orange-800 border-orange-300",
  BIENES_MUEBLES: "bg-lime-100 text-lime-800 border-lime-300",
  OTROS: "bg-gray-100 text-gray-700 border-gray-300",
};

/** Una fuente del catálogo (payload de /api/resoluciones/fuentes). */
export interface FuenteCatalogoDTO {
  id: string;
  nombre: string;
  familia: string;
  selloAutor: string | null;
  activa: boolean;
  ultimaActualizacion: string | null;
  docCount: number;
  clases: { clase: string; count: number }[];
}

export interface FuentesModalProps {
  open: boolean;
  onClose: () => void;
  /** Catálogo de fuentes. Self-service: `/api/resoluciones/fuentes`; en otras apps,
   *  el proxy que reenvía a `/api/inter/resoluciones/fuentes`. */
  fuentesUrl: string;
}

/**
 * Modal de FUENTES del corpus (Biblioteca + rail de MycoBot). Muestra las fuentes
 * agrupadas por familia con su nº de documentos, última actualización y las clases
 * que aportan, y permite activar/desactivar por FUENTE y por CLASE (dos niveles).
 * La selección es POR-USUARIO (no destructiva), persistida en las cookies
 * compartidas `mc_biblioteca_fuentes` y `mc_biblioteca_clases`; se combina en AND.
 * `null` en cualquiera de las dos = "todas". Es el mismo modal que abre `/sources`.
 */
export function FuentesModal({ open, onClose, fuentesUrl }: FuentesModalProps) {
  const { t } = useI18n();
  const [cats, setCats] = useState<FuenteCatalogoDTO[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fuentesSel, setFuentesSel] = useState<string[] | null>(null);
  const [clasesSel, setClasesSel] = useState<string[] | null>(null);

  // Carga el catálogo al abrir (una vez por apertura) y sincroniza la selección.
  useEffect(() => {
    if (!open) return;
    setFuentesSel(readFuentesSel());
    setClasesSel(readClasesSel());
    let cancel = false;
    setLoading(true);
    setError(null);
    fetch(fuentesUrl, { headers: { Accept: "application/json" } })
      .then(async (r) => {
        if (!r.ok) throw new Error(await apiErrorFromResponse(t, r));
        const json = await r.json();
        return (json?.data?.fuentes ?? json?.fuentes ?? []) as FuenteCatalogoDTO[];
      })
      .then((f) => {
        if (!cancel) setCats(f);
      })
      .catch((e) => {
        if (!cancel) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancel) setLoading(false);
      });
    return () => {
      cancel = true;
    };
  }, [open, fuentesUrl]);

  // Sincronía en vivo si otra vista (la otra pestaña del modal, el rail) cambia la selección.
  useEffect(() => {
    const onF = () => setFuentesSel(readFuentesSel());
    const onC = () => setClasesSel(readClasesSel());
    window.addEventListener(FUENTES_CHANGED_EVENT, onF);
    window.addEventListener(CLASES_CHANGED_EVENT, onC);
    return () => {
      window.removeEventListener(FUENTES_CHANGED_EVENT, onF);
      window.removeEventListener(CLASES_CHANGED_EVENT, onC);
    };
  }, []);

  const claseLabel = (clase: string) => t(`ui.mycobot.clases.${clase}`) || clase;
  const familiaLabel = (familia: string) => t(`ui.fuentes.familia.${familia}`) || familia;

  const allFuenteIds = (cats ?? []).map((c) => c.id);
  const allClases = Array.from(new Set((cats ?? []).flatMap((c) => c.clases.map((x) => x.clase))));

  const isFuenteSel = (id: string) => fuentesSel === null || fuentesSel.includes(id);
  const isClaseSel = (clase: string) => clasesSel === null || clasesSel.includes(clase);

  const toggleFuente = useCallback(
    (id: string) => {
      const current = fuentesSel === null ? allFuenteIds : fuentesSel;
      const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
      if (next.length === 0) return; // siempre al menos una fuente considerada
      const value = next.length === allFuenteIds.length ? null : next;
      setFuentesSel(value);
      writeFuentesSel(value);
    },
    [fuentesSel, allFuenteIds],
  );

  const toggleClase = useCallback(
    (clase: string) => {
      const current = clasesSel === null ? allClases : clasesSel;
      const next = current.includes(clase) ? current.filter((x) => x !== clase) : [...current, clase];
      if (next.length === 0) return;
      const value = next.length === allClases.length ? null : next;
      setClasesSel(value);
      writeClasesSel(value);
    },
    [clasesSel, allClases],
  );

  const resetAll = () => {
    setFuentesSel(null);
    writeFuentesSel(null);
    setClasesSel(null);
    writeClasesSel(null);
  };

  const fmtFecha = (iso: string | null): string | null => {
    if (!iso) return null;
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString();
  };

  if (!open) return null;

  // Agrupar por familia preservando el orden de llegada (el endpoint ordena por familia).
  const familias: { familia: string; fuentes: FuenteCatalogoDTO[] }[] = [];
  for (const c of cats ?? []) {
    let g = familias.find((x) => x.familia === c.familia);
    if (!g) {
      g = { familia: c.familia, fuentes: [] };
      familias.push(g);
    }
    g.fuentes.push(c);
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-lg bg-white shadow-xl dark:bg-gray-800"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-4 py-3 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-cyan-600" />
            <h3 className="text-sm font-semibold">{t("ui.fuentes.title")}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("ui.fuentes.done")}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="px-4 pt-3 text-xs text-gray-500">{t("ui.fuentes.help")}</p>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {loading && <p className="text-xs text-gray-400">{t("ui.fuentes.loading")}</p>}
          {error && <p className="text-xs text-red-500">{error}</p>}
          {!loading && !error && familias.length === 0 && (
            <p className="text-xs text-gray-400">{t("ui.fuentes.empty")}</p>
          )}

          {familias.map((g) => (
            <div key={g.familia} className="mb-4 last:mb-0">
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                {familiaLabel(g.familia)}
              </div>
              <div className="space-y-2">
                {g.fuentes.map((f) => {
                  const fSel = isFuenteSel(f.id);
                  const fecha = fmtFecha(f.ultimaActualizacion);
                  return (
                    <div
                      key={f.id}
                      className={`rounded-md border p-2.5 transition-colors ${
                        fSel
                          ? "border-gray-200 dark:border-gray-700"
                          : "border-dashed border-gray-200 opacity-60 dark:border-gray-700"
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <button
                          type="button"
                          onClick={() => toggleFuente(f.id)}
                          aria-pressed={fSel}
                          aria-label={f.nombre}
                          className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                            fSel
                              ? "border-cyan-600 bg-cyan-600 text-white"
                              : "border-gray-300 dark:border-gray-600"
                          }`}
                        >
                          {fSel && <Check className="h-3 w-3" />}
                        </button>
                        <div className="min-w-0 flex-1">
                          <button
                            type="button"
                            onClick={() => toggleFuente(f.id)}
                            className="block w-full text-left text-sm font-medium leading-snug"
                          >
                            {f.nombre}
                          </button>
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-gray-400">
                            <span className="inline-flex items-center gap-1">
                              <Database className="h-3 w-3" />
                              {t("ui.fuentes.docs", { n: f.docCount.toLocaleString() })}
                            </span>
                            {fecha && (
                              <span>{t("ui.fuentes.updated", { date: fecha })}</span>
                            )}
                          </div>
                          {/* Clases que aporta la fuente (segundo nivel de toggle). */}
                          {f.clases.length > 0 && (
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              {f.clases.map((c) => {
                                const cSel = isClaseSel(c.clase);
                                return (
                                  <button
                                    key={c.clase}
                                    type="button"
                                    onClick={() => toggleClase(c.clase)}
                                    aria-pressed={cSel}
                                    disabled={!fSel}
                                    className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] transition-colors disabled:cursor-not-allowed ${
                                      cSel
                                        ? `${CLASE_COLOR[c.clase] ?? "border-gray-300 bg-gray-100 text-gray-700"} ring-1 ring-inset ring-current`
                                        : "border-gray-200 text-gray-400 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700"
                                    }`}
                                  >
                                    {cSel ? (
                                      <Check className="h-2.5 w-2.5 shrink-0" />
                                    ) : (
                                      <Layers className="h-2.5 w-2.5 shrink-0 opacity-40" />
                                    )}
                                    <span>{claseLabel(c.clase)}</span>
                                    <span className="opacity-60">{c.count.toLocaleString()}</span>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between border-t px-4 py-2.5 dark:border-gray-700">
          <button
            type="button"
            onClick={resetAll}
            className="text-xs text-gray-400 underline-offset-2 hover:text-gray-600 hover:underline"
          >
            {t("ui.fuentes.all")}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md bg-cyan-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-cyan-700"
          >
            {t("ui.fuentes.done")}
          </button>
        </div>
      </div>
    </div>
  );
}
