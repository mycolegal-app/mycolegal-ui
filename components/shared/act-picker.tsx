"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n/i18n-context";

export interface ActOption {
  id: string;
  codigo: string;
  nombre: string;
  categoria: string | null;
  /**
   * Opcional: sólo consultor la informa hoy. Es lo que separa actos que se
   * llaman igual ("Compraventa · Inmuebles" solar vs. vivienda en PH), así que
   * sin pintarla el desplegable los muestra indistinguibles. Los backends que
   * no la devuelven no notan nada.
   */
  subcategoria?: string | null;
}

interface ActPickerProps {
  /** ID del acto jurídico seleccionado. Cadena vacía = ninguno. */
  value: string;
  onChange: (actId: string) => void;
  /**
   * Notifica también el objeto completo del acto seleccionado en el
   * mismo evento de cambio. Útil cuando el caller quiere mostrar
   * codigo/nombre/categoria sin re-fetchear (p.ej. multi-select
   * acumulativo donde el padre lleva su propia lista visualizada).
   */
  onPick?: (act: ActOption) => void;
  placeholder?: string;
  label?: string;
  required?: boolean;
  /**
   * Endpoint base. Default `/api/catalogs/actos-juridicos` (notaria).
   * Forma esperada del backend:
   *   GET {apiBase}?search=<q>&page=<n>&pageSize=<m>&sortBy=<f>&sortOrder=<o>
   *     → { data: ActOption[], meta: { page, pageSize, total, totalPages } }
   *   GET {apiBase}/{id}
   *     → { data: ActOption }
   * Apps con un path distinto (archivo: `/api/actos-juridicos`) lo pasan
   * como override y deben ofrecer el mismo contrato (search + page +
   * meta.total para que el infinite-scroll sepa cuándo parar).
   */
  apiBase?: string;
  /** Tamaño de página al abrir o filtrar. Default 50. */
  pageSize?: number;
  /** data-testid aplicado al input para tests e2e. */
  testId?: string;
}

/**
 * Selector de acto jurídico con búsqueda asíncrona server-side. A
 * diferencia del ClientPicker, lista al abrir (sin requerir caracteres
 * mínimos) y carga más resultados al hacer scroll hasta el fondo del
 * dropdown — pensado para catálogos grandes (400+ actos en notaria) donde
 * el `SearchableSelect` cortaba a las 50 primeras coincidencias y dejaba
 * el resto inalcanzables.
 *
 * Sin acción "crear nuevo" — el catálogo de actos lo gestiona consultor
 * y los usuarios sólo escogen entre los existentes.
 */
export function ActPicker({
  value,
  onChange,
  onPick,
  placeholder,
  label,
  required,
  apiBase = "/api/catalogs/actos-juridicos",
  pageSize = 50,
  testId,
}: ActPickerProps) {
  const { t } = useI18n();
  const resolvedPlaceholder = placeholder ?? t("ui.actPicker.placeholder");
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<ActOption[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [selectedAct, setSelectedAct] = useState<ActOption | null>(null);
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

  useEffect(() => {
    if (value && (!selectedAct || selectedAct.id !== value)) {
      fetch(`${apiBase}/${value}`)
        .then((r) => r.json())
        .then((json) => {
          if (json.data) setSelectedAct(json.data);
        })
        .catch(() => {});
    }
    if (!value && selectedAct) setSelectedAct(null);
  }, [value, selectedAct, apiBase]);

  function buildUrl(targetPage: number): string {
    const sep = apiBase.includes("?") ? "&" : "?";
    const params = new URLSearchParams();
    if (query) params.set("search", query);
    params.set("page", String(targetPage));
    params.set("pageSize", String(pageSize));
    // Sin search, ordenar alfabéticamente para que el dropdown sea
    // navegable; con search el orden por relevancia (el del server) es
    // suficiente. El endpoint genérico de notaria default a `createdAt
    // desc` que no tiene sentido para un catálogo.
    params.set("sortBy", "nombre");
    params.set("sortOrder", "asc");
    return `${apiBase}${sep}${params.toString()}`;
  }

  // Fetch primera página al abrir o cambiar query.
  useEffect(() => {
    if (!open) return;
    const debounce = query.length > 0 ? 300 : 0;
    const timer = setTimeout(async () => {
      setLoading(true);
      setPage(1);
      try {
        const res = await fetch(buildUrl(1));
        const json = await res.json();
        const data: ActOption[] = json.data ?? [];
        setOptions(data);
        setTotal(json.meta?.total ?? data.length);
        // Auto-pick por código exacto: si la query coincide letra-a-letra
        // con un `codigo`, seleccionamos automáticamente. Replica el
        // comportamiento del antiguo SearchableSelect, útil para flujos
        // donde el usuario pega un código completo (e2e, scripts).
        const v = query.trim().toLowerCase();
        if (v) {
          const exact = data.find((o) => (o.codigo ?? "").toLowerCase() === v);
          if (exact) handleSelect(exact);
        }
      } catch {
        setOptions([]);
        setTotal(0);
      } finally {
        setLoading(false);
      }
    }, debounce);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, open, apiBase, pageSize]);

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

  function handleSelect(act: ActOption) {
    onChange(act.id);
    onPick?.(act);
    setSelectedAct(act);
    setQuery("");
    setOpen(false);
  }

  function handleClear() {
    onChange("");
    setSelectedAct(null);
    setQuery("");
  }

  return (
    <div ref={wrapperRef} className="relative">
      {label && (
        <label className="mb-1 block text-sm font-medium">
          {label} {required && "*"}
        </label>
      )}
      {value && selectedAct ? (
        <div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
          <span className="flex items-center gap-2">
            <span className="font-mono text-xs text-gray-500">{selectedAct.codigo}</span>
            <span>{selectedAct.nombre}</span>
            {selectedAct.categoria && (
              <span className="text-xs text-gray-400">— {selectedAct.categoria}</span>
            )}
            {selectedAct.subcategoria && (
              <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600">
                {selectedAct.subcategoria}
              </span>
            )}
          </span>
          <button
            type="button"
            onClick={handleClear}
            aria-label={t("ui.actPicker.clearAria")}
            className="ml-2 text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>
        </div>
      ) : (
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={resolvedPlaceholder}
          className="w-full rounded-md border px-3 py-2 text-sm"
          data-testid={testId}
        />
      )}
      {open && !value && (
        <div
          onScroll={handleScroll}
          className="absolute z-50 mt-1 max-h-72 w-full overflow-auto rounded-md border bg-white shadow-lg"
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
              onClick={() => handleSelect(act)}
              className="block w-full px-3 py-2 text-left text-sm hover:bg-cyan-50"
            >
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-gray-500">{act.codigo}</span>
                <span className="font-medium">{act.nombre}</span>
                {act.subcategoria && (
                  <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600">
                    {act.subcategoria}
                  </span>
                )}
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
