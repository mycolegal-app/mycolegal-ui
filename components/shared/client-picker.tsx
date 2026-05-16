"use client";

import { useEffect, useRef, useState } from "react";
import { Pencil, UserPlus } from "lucide-react";
import { useI18n } from "../i18n/i18n-context";

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
  /**
   * Opcional: callback al pulsar "+ Crear nuevo cliente". Recibe el texto
   * que el usuario ya tenía escrito en el buscador, para que el caller
   * pueda prellenar el dialog de alta (típicamente `ClienteFormDialog`).
   */
  onCreateNew?: (queryHint?: string) => void;
  /**
   * Opcional: callback al pulsar el icono de editar mostrado junto al
   * cliente ya seleccionado. Si no se pasa, el icono no se muestra. El
   * caller normalmente abre un `ClienteFormDialog` en modo edit.
   */
  onEdit?: (clienteId: string) => void;
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
  /**
   * Variante visual. `md` (default) coincide con el resto de inputs en
   * formularios; `sm` se usa en toolbars de tablas para que el picker
   * encaje en la misma fila que el resto de filtros compactos.
   */
  size?: "sm" | "md";
  /**
   * Cambia este valor (cualquier número/string distinto) para forzar al
   * picker a refrescar el label del cliente seleccionado. Útil tras
   * editar el cliente con `ClienteFormDialog`: el `value` no cambia
   * pero el nombre sí, y el picker debe re-hidratarse.
   */
  refreshToken?: number | string;
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
  onEdit,
  placeholder,
  label,
  required,
  apiBase = "/api/catalogs/clientes",
  formatNif,
  size = "md",
  refreshToken,
}: ClientPickerProps) {
  const inputSizeCls =
    size === "sm" ? "h-8 px-2 py-1 text-xs" : "px-3 py-2 text-sm";
  const tagSizeCls =
    size === "sm" ? "h-8 px-2 py-1 text-xs" : "px-3 py-2 text-sm";
  const createBtnSizeCls =
    size === "sm" ? "h-8 px-2 py-1 text-xs" : "px-3 py-2 text-sm";
  const { t } = useI18n();
  const resolvedPlaceholder = placeholder ?? t("ui.clientPicker.placeholder");
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<ClientOption[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searchedEmpty, setSearchedEmpty] = useState(false);
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

  // Carga el label del cliente seleccionado cuando llega `value` desde
  // fuera, o cuando `refreshToken` cambia (forzado tras editar el cliente).
  useEffect(() => {
    if (!value) return;
    fetch(`${apiBase}/${value}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.data) {
          setSelectedLabel(getDisplayName(json.data));
        }
      })
      .catch(() => {});
    // selectedLabel se omite a propósito: este efecto debe recargar al
    // cambiar `refreshToken` aunque ya haya un label cacheado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, apiBase, refreshToken]);

  // Búsqueda con debounce.
  useEffect(() => {
    if (query.length < 2) {
      setOptions([]);
      setSearchedEmpty(false);
      return;
    }
    setSearchedEmpty(false);
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `${apiBase}?search=${encodeURIComponent(query)}&pageSize=10`,
        );
        const json = await res.json();
        const items: ClientOption[] = json.data ?? [];
        setOptions(items);
        setSearchedEmpty(items.length === 0);
      } catch {
        setOptions([]);
        setSearchedEmpty(true);
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
    setSearchedEmpty(false);
  }

  const showCreateBtn = Boolean(onCreateNew) && !value && searchedEmpty && !loading;

  return (
    <div ref={wrapperRef} className="relative">
      {label && (
        <label className="mb-1 block text-sm font-medium">
          {label} {required && "*"}
        </label>
      )}
      {value && selectedLabel ? (
        <div className={`flex items-center justify-between rounded-md border ${tagSizeCls}`}>
          <span className="truncate">{selectedLabel}</span>
          <div className="ml-2 flex items-center gap-1">
            {onEdit && (
              <button
                type="button"
                onClick={() => onEdit(value)}
                aria-label={t("ui.clientPicker.editAria")}
                title={t("ui.clientPicker.editAria")}
                className="text-gray-400 hover:text-cyan-600"
              >
                <Pencil className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} />
              </button>
            )}
            <button
              type="button"
              onClick={handleClear}
              aria-label={t("ui.clientPicker.clearAria")}
              className="text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-stretch gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => query.length >= 2 && setOpen(true)}
            placeholder={resolvedPlaceholder}
            className={`flex-1 rounded-md border ${inputSizeCls}`}
          />
          {showCreateBtn && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onCreateNew?.(query.trim() || undefined);
              }}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-md border border-cyan-200 bg-cyan-50 font-medium text-cyan-700 hover:bg-cyan-100 ${createBtnSizeCls}`}
              title={t("ui.clientPicker.createNew")}
            >
              <UserPlus className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} />
              {t("ui.clientPicker.createInline")}
            </button>
          )}
        </div>
      )}
      {open && (query.length >= 2 || options.length > 0) && (
        <div className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border bg-white shadow-lg">
          {loading && (
            <div className="px-3 py-2 text-sm text-gray-500">{t("ui.clientPicker.searching")}</div>
          )}
          {!loading && options.length === 0 && query.length >= 2 && (
            <div className="px-3 py-2 text-sm text-gray-500">
              {t("ui.clientPicker.noResults")}
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
                  onCreateNew(query.trim() || undefined);
                }}
                className="w-full px-3 py-2 text-left text-sm font-medium text-cyan-600 hover:bg-cyan-50"
              >
                {t("ui.clientPicker.createNew")}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
