"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n/i18n-context";

export interface ActOption {
  id: string;
  codigo: string;
  nombre: string;
  categoria: string | null;
}

interface ActPickerProps {
  /** ID del acto jurídico seleccionado. Cadena vacía = ninguno. */
  value: string;
  onChange: (actId: string) => void;
  placeholder?: string;
  label?: string;
  required?: boolean;
  /**
   * Endpoint base. Default `/api/catalogs/actos-juridicos` (notaria).
   * Forma esperada del backend:
   *   GET {apiBase}?search=<q>&pageSize=<n>  → { data: ActOption[] }
   *   GET {apiBase}/{id}                      → { data: ActOption }
   * Apps con un path distinto (archivo: `/api/actos-juridicos`) lo pasan
   * como override.
   */
  apiBase?: string;
  /** Tamaño de página al abrir o filtrar. Default 20. */
  pageSize?: number;
}

/**
 * Selector de acto jurídico con búsqueda asíncrona server-side. A
 * diferencia del ClientPicker, lista al abrir (sin requerir caracteres
 * mínimos) y filtra al escribir con debounce 300ms. Pensado para
 * catálogos grandes donde el `SearchableSelect` cortaba a las 50 primeras
 * coincidencias y dejaba el resto inalcanzables.
 *
 * Sin acción "crear nuevo" — el catálogo de actos lo gestiona consultor
 * y los usuarios sólo escogen entre los existentes.
 */
export function ActPicker({
  value,
  onChange,
  placeholder,
  label,
  required,
  apiBase = "/api/catalogs/actos-juridicos",
  pageSize = 20,
}: ActPickerProps) {
  const { t } = useI18n();
  const resolvedPlaceholder = placeholder ?? t("ui.actPicker.placeholder");
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<ActOption[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
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

  useEffect(() => {
    if (!open) return;
    const debounce = query.length > 0 ? 300 : 0;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const url = query
          ? `${apiBase}?search=${encodeURIComponent(query)}&pageSize=${pageSize}`
          : `${apiBase}?pageSize=${pageSize}`;
        const res = await fetch(url);
        const json = await res.json();
        setOptions(json.data ?? []);
      } catch {
        setOptions([]);
      } finally {
        setLoading(false);
      }
    }, debounce);
    return () => clearTimeout(timer);
  }, [query, open, apiBase, pageSize]);

  function handleSelect(act: ActOption) {
    onChange(act.id);
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
        />
      )}
      {open && !value && (
        <div className="absolute z-50 mt-1 max-h-72 w-full overflow-auto rounded-md border bg-white shadow-lg">
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
              </div>
              {act.categoria && (
                <div className="mt-0.5 text-xs text-gray-400">{act.categoria}</div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
