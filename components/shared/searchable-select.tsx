"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Check } from "lucide-react";

export interface SearchableOption {
  id: string;
  nombre?: string;
  codigo?: string;
}

interface SearchableSelectProps {
  /** Id seleccionado. Pasar `""` para "ninguno". */
  value: string;
  onChange: (id: string) => void;
  options: SearchableOption[];
  placeholder?: string;
  ariaLabel?: string;
  testId?: string;
  /** Muestra `codigo —` antes del nombre en el dropdown. Default: true. */
  showCodigo?: boolean;
  /**
   * Si true, tras seleccionar limpia el input y NO refleja la selección
   * en el campo. Pensado para usarse como picker de listas multi-select
   * (el caller acumula los IDs en su propio estado y vuelve a abrir el
   * picker con `value=""`).
   */
  clearAfterPick?: boolean;
}

/**
 * Combobox para catálogos: input filtrable que muestra "código — nombre",
 * con autoselección cuando el texto matchea exactamente un código (p.ej.
 * el operario teclea `1405` y queda seleccionado el acto correspondiente).
 *
 * Filtra client-side hasta 50 coincidencias. No depende de Radix/cmdk
 * para mantener el bundle ligero.
 */
export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = "Selecciona…",
  ariaLabel,
  testId,
  showCodigo = true,
  clearAfterPick = false,
}: SearchableSelectProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const labelOf = (o: SearchableOption) => {
    const c = showCodigo && o.codigo ? `${o.codigo} — ` : "";
    return `${c}${o.nombre ?? ""}`.trim();
  };
  const selected = useMemo(
    () => options.find((o) => o.id === value) ?? null,
    [options, value],
  );

  // Cuando se selecciona desde fuera, refleja el label en el input
  // (salvo en modo `clearAfterPick`, donde el input siempre vuelve vacío).
  useEffect(() => {
    if (clearAfterPick) {
      if (!open) setQuery("");
      return;
    }
    if (!open) setQuery(selected ? labelOf(selected) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, open, clearAfterPick]);

  // Cerrar al click fuera.
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options.slice(0, 50);
    return options
      .filter((o) => {
        const hay = `${o.codigo ?? ""} ${o.nombre ?? ""}`.toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 50);
  }, [options, query]);

  function pick(o: SearchableOption) {
    onChange(o.id);
    if (clearAfterPick) {
      setQuery("");
    } else {
      setQuery(labelOf(o));
    }
    setOpen(false);
  }

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            // Auto-pick cuando el usuario teclea un código exacto.
            const v = e.target.value.trim().toLowerCase();
            const exact = options.find(
              (o) => (o.codigo ?? "").toLowerCase() === v,
            );
            if (exact) {
              onChange(exact.id);
              if (clearAfterPick) {
                setQuery("");
                setOpen(false);
              }
            }
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          aria-label={ariaLabel}
          data-testid={testId}
          className="w-full rounded-md border px-3 py-1.5 pr-9 text-sm"
        />
        <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
      </div>
      {open && filtered.length > 0 && (
        <div className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-md border bg-white shadow-lg">
          {filtered.map((o) => {
            const isSel = !clearAfterPick && o.id === value;
            return (
              <button
                type="button"
                key={o.id}
                onClick={() => pick(o)}
                className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-cyan-50 ${
                  isSel ? "bg-cyan-50 font-medium" : ""
                }`}
              >
                <span className="truncate">
                  {showCodigo && o.codigo && (
                    <span className="mr-1 font-mono text-xs text-gray-500">{o.codigo}</span>
                  )}
                  {o.nombre}
                </span>
                {isSel && <Check className="h-3.5 w-3.5 shrink-0 text-cyan-600" />}
              </button>
            );
          })}
        </div>
      )}
      {open && filtered.length === 0 && (
        <div className="absolute z-20 mt-1 w-full rounded-md border bg-white px-3 py-2 text-xs text-gray-500 shadow-lg">
          No hay coincidencias
        </div>
      )}
    </div>
  );
}
