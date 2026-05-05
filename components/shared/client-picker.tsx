"use client";

import { useEffect, useRef, useState } from "react";

export interface ClientOption {
  id: string;
  nombre: string;
  apellidos: string | null;
  razonSocial: string | null;
  nif: string | null;
  tipo: string;
}

interface ClientPickerProps {
  /** ID del cliente seleccionado. Cadena vacía = ninguno. */
  value: string;
  onChange: (clientId: string) => void;
  /** Opcional: callback al pulsar "+ Crear nuevo cliente". */
  onCreateNew?: () => void;
  placeholder?: string;
  label?: string;
  required?: boolean;
  /**
   * Endpoint base para búsqueda + lookup individual. Default
   * `/api/catalogs/clientes` (notaria/legifirma). Apps con otro path
   * (ej. archivo usa `/api/clientes`) pasan su override.
   *
   * Forma esperada del backend:
   *   GET {apiBase}?search=<q>&pageSize=10  → { data: ClientOption[] }
   *   GET {apiBase}/{id}                     → { data: ClientOption }
   */
  apiBase?: string;
  /**
   * Función opcional para formatear NIF en el dropdown. Si no se pasa,
   * se muestra el NIF tal cual. Permite que cada app aporte su propio
   * formateador (notaria → `formatNif` con separadores, archivo → raw).
   */
  formatNif?: (nif: string) => string;
}

/**
 * Selector de cliente con búsqueda asíncrona (server-side). Debounce
 * 300ms, mínimo 2 caracteres. Cuando hay un valor seleccionado se
 * muestra como tag con cruz para limpiar; sin valor se muestra el input.
 *
 * Cubre persona física (`nombre + apellidos`) y persona jurídica
 * (`razonSocial`) según `tipo`. Permite "Crear nuevo cliente" como
 * acción inline si el caller pasa `onCreateNew`.
 */
export function ClientPicker({
  value,
  onChange,
  onCreateNew,
  placeholder = "Buscar cliente por nombre o NIF...",
  label,
  required,
  apiBase = "/api/catalogs/clientes",
  formatNif,
}: ClientPickerProps) {
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<ClientOption[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedLabel, setSelectedLabel] = useState("");
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Cierra el dropdown al click fuera.
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  // Carga el label del cliente seleccionado cuando llega `value` desde fuera.
  useEffect(() => {
    if (value && !selectedLabel) {
      fetch(`${apiBase}/${value}`)
        .then((r) => r.json())
        .then((json) => {
          if (json.data) {
            setSelectedLabel(getDisplayName(json.data));
          }
        })
        .catch(() => {});
    }
  }, [value, selectedLabel, apiBase]);

  // Búsqueda con debounce.
  useEffect(() => {
    if (query.length < 2) {
      setOptions([]);
      return;
    }
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `${apiBase}?search=${encodeURIComponent(query)}&pageSize=10`,
        );
        const json = await res.json();
        if (json.data) setOptions(json.data);
      } catch {
        setOptions([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query, apiBase]);

  function getDisplayName(c: ClientOption): string {
    return c.tipo === "PERSONA_JURIDICA"
      ? c.razonSocial || c.nombre
      : `${c.nombre} ${c.apellidos || ""}`.trim();
  }

  function handleSelect(client: ClientOption) {
    onChange(client.id);
    setSelectedLabel(getDisplayName(client));
    setQuery("");
    setOpen(false);
  }

  function handleClear() {
    onChange("");
    setSelectedLabel("");
    setQuery("");
  }

  return (
    <div ref={wrapperRef} className="relative">
      {label && (
        <label className="mb-1 block text-sm font-medium">
          {label} {required && "*"}
        </label>
      )}
      {value && selectedLabel ? (
        <div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
          <span>{selectedLabel}</span>
          <button
            type="button"
            onClick={handleClear}
            aria-label="Quitar selección"
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
          onFocus={() => query.length >= 2 && setOpen(true)}
          placeholder={placeholder}
          className="w-full rounded-md border px-3 py-2 text-sm"
        />
      )}
      {open && (query.length >= 2 || options.length > 0) && (
        <div className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border bg-white shadow-lg">
          {loading && (
            <div className="px-3 py-2 text-sm text-gray-500">Buscando…</div>
          )}
          {!loading && options.length === 0 && query.length >= 2 && (
            <div className="px-3 py-2 text-sm text-gray-500">
              No se encontraron resultados
            </div>
          )}
          {options.map((client) => (
            <button
              key={client.id}
              type="button"
              onClick={() => handleSelect(client)}
              className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100"
            >
              <div className="font-medium">{getDisplayName(client)}</div>
              {client.nif && (
                <div className="text-xs text-gray-500">
                  {formatNif ? formatNif(client.nif) : client.nif}
                </div>
              )}
            </button>
          ))}
          {onCreateNew && (
            <>
              <div className="border-t" />
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onCreateNew();
                }}
                className="w-full px-3 py-2 text-left text-sm font-medium text-cyan-600 hover:bg-cyan-50"
              >
                + Crear nuevo cliente
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
