"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { useI18n } from "../i18n/i18n-context";

export interface SolicitanteOption {
  id: string;
  tipo: "PERSONA_FISICA" | "PERSONA_JURIDICA" | string;
  nombre: string;
  apellidos: string | null;
  razonSocial: string | null;
  nif: string | null;
}

interface SolicitantePickerProps {
  /** Universo de solicitantes ya deduplicado por id. */
  options: SolicitanteOption[];
  /** ID del solicitante seleccionado. Cadena vacía = sin filtro. */
  value: string;
  onChange: (id: string) => void;
  /** Formato opcional de NIF en el dropdown. */
  formatNif?: (nif: string) => string;
  placeholder?: string;
  /** Anchura mínima del input. Default 260px (mantiene el actual). */
  minWidthClass?: string;
}

/**
 * Picker de filtro por solicitante alimentado de un set local de opciones
 * (deduplicadas por id). No hace fetch — la búsqueda al teclear se filtra
 * en cliente, evitando el re-fetch del listado completo en cada keystroke
 * (que causaba flicker en las páginas de previos/expedientes/protocolos).
 *
 * Para listas grandes con paginación server, el caller pasa el subset
 * cargado actualmente; el picker reflejará sólo a los solicitantes
 * presentes en ese subset.
 */
export function SolicitantePicker({
  options,
  value,
  onChange,
  formatNif,
  placeholder,
  minWidthClass = "min-w-[260px]",
}: SolicitantePickerProps) {
  const { t } = useI18n();
  const resolvedPlaceholder = placeholder ?? t("ui.solicitantePicker.placeholder");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
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

  function getDisplayName(c: SolicitanteOption): string {
    return c.tipo === "PERSONA_JURIDICA"
      ? c.razonSocial || c.nombre
      : `${c.nombre} ${c.apellidos || ""}`.trim();
  }

  const selected = useMemo(
    () => (value ? options.find((o) => o.id === value) ?? null : null),
    [value, options],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 1) return options;
    return options.filter((o) => {
      const name = getDisplayName(o).toLowerCase();
      const nif = (o.nif || "").toLowerCase();
      return name.includes(q) || nif.includes(q);
    });
  }, [query, options]);

  function handleSelect(o: SolicitanteOption) {
    onChange(o.id);
    setQuery("");
    setOpen(false);
  }

  function handleClear() {
    onChange("");
    setQuery("");
  }

  return (
    <div ref={wrapperRef} className={`relative ${minWidthClass} flex-1 max-w-sm`}>
      {selected ? (
        <div className="flex items-center justify-between rounded-md border bg-white px-3 py-2 text-sm">
          <span className="truncate">
            {getDisplayName(selected)}
            {selected.nif && (
              <span className="ml-2 text-xs text-gray-500">
                {formatNif ? formatNif(selected.nif) : selected.nif}
              </span>
            )}
          </span>
          <button
            type="button"
            onClick={handleClear}
            aria-label={t("ui.solicitantePicker.clearAria")}
            className="ml-2 text-gray-400 hover:text-gray-600"
          >
            <X className="h-4 w-4" />
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
      {open && !selected && (
        <div className="absolute z-50 mt-1 max-h-72 w-full overflow-auto rounded-md border bg-white shadow-lg">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-sm text-gray-500">
              {options.length === 0
                ? t("ui.solicitantePicker.empty")
                : t("ui.solicitantePicker.noResults")}
            </div>
          ) : (
            filtered.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => handleSelect(o)}
                className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100"
              >
                <div className="font-medium">{getDisplayName(o)}</div>
                {o.nif && (
                  <div className="text-xs text-gray-500">
                    {formatNif ? formatNif(o.nif) : o.nif}
                  </div>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
