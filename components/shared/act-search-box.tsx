"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n/i18n-context";
import type { ActOption } from "./act-picker";

interface ActSearchBoxProps {
  /** Valor del input — controlado por el padre (típicamente el estado de búsqueda de la tabla). */
  value: string;
  /** Notifica al padre cada cambio del input para que filtre la tabla. */
  onChange: (query: string) => void;
  /** Llamado al hacer click en una sugerencia del dropdown. */
  onSelect?: (act: ActOption) => void;
  placeholder?: string;
  /** Endpoint base. Default `/api/catalogs/actos-juridicos` (notaria). Mismo contrato que ActPicker. */
  apiBase?: string;
  /** Tamaño de página al cargar/scroll. Default 50. */
  pageSize?: number;
}

/**
 * Buscador enriquecido para CRUDs de actos jurídicos. Combina el input
 * tradicional de filtro de tabla con un dropdown de sugerencias paginado
 * server-side (mismo backend que ActPicker). Pensado para mantenimientos
 * donde escribir filtra la tabla pero al hacer click en una sugerencia
 * abres directamente la edición de ese acto, sin tener que localizarlo
 * después en la lista.
 *
 * Diferencia clave con ActPicker:
 *   - ActPicker es selector de valor (form input → guarda un id).
 *   - ActSearchBox es navegador de catálogo (filtra + ofrece atajo al
 *     editar). El padre mantiene `value`/`onChange` como cualquier search
 *     input, y opcionalmente reacciona a `onSelect`.
 */
export function ActSearchBox({
  value,
  onChange,
  onSelect,
  placeholder,
  apiBase = "/api/catalogs/actos-juridicos",
  pageSize = 50,
}: ActSearchBoxProps) {
  const { t } = useI18n();
  const resolvedPlaceholder = placeholder ?? t("ui.actPicker.placeholder");
  const [options, setOptions] = useState<ActOption[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function buildUrl(targetPage: number): string {
    const sep = apiBase.includes("?") ? "&" : "?";
    const params = new URLSearchParams();
    if (value) params.set("search", value);
    params.set("page", String(targetPage));
    params.set("pageSize", String(pageSize));
    params.set("sortBy", "nombre");
    params.set("sortOrder", "asc");
    return `${apiBase}${sep}${params.toString()}`;
  }

  // Fetch primera página al abrir o cambiar query.
  useEffect(() => {
    if (!open) return;
    const debounce = value.length > 0 ? 300 : 0;
    const timer = setTimeout(async () => {
      setLoading(true);
      setPage(1);
      try {
        const res = await fetch(buildUrl(1));
        const json = await res.json();
        setOptions(json.data ?? []);
        setTotal(json.meta?.total ?? json.data?.length ?? 0);
      } catch {
        setOptions([]);
        setTotal(0);
      } finally {
        setLoading(false);
      }
    }, debounce);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, open, apiBase, pageSize]);

  async function loadMore() {
    if (loading || loadingMore || options.length >= total) return;
    setLoadingMore(true);
    const nextPage = page + 1;
    try {
      const res = await fetch(buildUrl(nextPage));
      const json = await res.json();
      setOptions((prev) => [...prev, ...(json.data ?? [])]);
      setPage(nextPage);
    } catch {
      // sin acumular — el usuario puede reintentar haciendo scroll otra vez
    } finally {
      setLoadingMore(false);
    }
  }

  function handleScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 24) {
      loadMore();
    }
  }

  function handlePick(act: ActOption) {
    setOpen(false);
    onSelect?.(act);
  }

  return (
    <div ref={wrapperRef} className="relative">
      <input
        type="search"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={resolvedPlaceholder}
        className="w-full max-w-sm rounded-md border px-3 py-2 text-sm"
      />
      {open && (
        <div
          onScroll={handleScroll}
          className="absolute z-50 mt-1 max-h-72 w-full max-w-sm overflow-auto rounded-md border bg-white shadow-lg"
        >
          {loading && (
            <div className="px-3 py-2 text-sm text-gray-500">{t("ui.actPicker.searching")}</div>
          )}
          {!loading && options.length === 0 && (
            <div className="px-3 py-2 text-sm text-gray-500">{t("ui.actPicker.noResults")}</div>
          )}
          {options.map((act) => (
            <button
              key={act.id}
              type="button"
              onClick={() => handlePick(act)}
              className="block w-full px-3 py-2 text-left text-sm hover:bg-cyan-50"
            >
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-gray-500">{act.codigo}</span>
                <span className="font-medium">{act.nombre}</span>
              </div>
              {act.categoria && (
                <div className="mt-0.5 text-xs text-gray-400">{act.categoria}</div>
              )}
            </button>
          ))}
          {loadingMore && (
            <div className="px-3 py-2 text-center text-xs text-gray-400">
              {t("ui.actPicker.loadingMore")}
            </div>
          )}
          {!loading && !loadingMore && total > 0 && options.length < total && (
            <div className="px-3 py-1 text-center text-xs text-gray-400">
              {t("ui.actPicker.scrollHint")} ({options.length}/{total})
            </div>
          )}
        </div>
      )}
    </div>
  );
}
