"use client";

// Selector del directorio nacional de notarios. Catálogo global (sin orgId)
// mantenido por mycolegal-platform (~2.871 notarios importados del legacy
// `notarisCaixa_new`). Cada app expone su propio `/api/notarios` con el mismo
// contrato (GET ?q=...&pageSize=10 → { data: NotarioOption[] }).
//
// A diferencia de `ClientPicker`, el valor que se persiste es **texto libre**,
// no un id. El picker permite seleccionar del catálogo (autocompleta el
// nombre + devuelve provincia/población para que el caller las auto-rellene)
// o, si `allowCustom`, escribir un valor que no esté en el catálogo.

import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { useI18n } from "../i18n/i18n-context";

export type NotarioFuente = "LEGACY" | "PORTAL_NOTARIADO" | "AMBOS" | "MANUAL";

export interface NotarioOption {
  id: string;
  legacyIdNotari: string | null;
  nombre: string;
  nombreCompleto: string | null;
  cg1: string | null;
  cg2: string | null;
  correoCorporativo: string | null;
  correoSecundario: string | null;
  telefono: string | null;
  fax: string | null;
  direccionCompleta: string | null;
  idiomas: string | null;
  fuente: NotarioFuente;
  ultimaSincPortalAt: string | null;
  /**
   * Fecha de baja del notario (jubilado/fallecido). Opcional: solo algunas apps
   * la devuelven (p.ej. Copias, cuyo picker es para el notario autorizante/
   * custodio e incluye los no-activos). Si viene poblada, el picker pinta un
   * badge "jubilado".
   */
  fechaBaja?: string | null;
  provincia: { id: string; codigo: string | null; nombre: string } | null;
  poblacion: { id: string; nombre: string } | null;
}

interface NotarioPickerProps {
  /** Texto actual del campo (lo que se persiste). */
  value: string;
  /**
   * Llamado cuando cambia el texto. `match` es el `NotarioOption` cuando el
   * usuario selecciona del catálogo (puede usarse para auto-rellenar
   * provincia/población); `null` cuando el usuario escribe texto libre.
   */
  onChange: (text: string, match: NotarioOption | null) => void;
  /** Endpoint base. Default `/api/notarios`. */
  apiBase?: string;
  placeholder?: string;
  label?: string;
  required?: boolean;
  disabled?: boolean;
  /**
   * Si es true (default), el usuario puede escribir un valor que no esté
   * en el catálogo. Si es false, solo se aceptan selecciones del dropdown.
   */
  allowCustom?: boolean;
  /** Variante visual. `md` (default) para forms, `sm` para toolbars. */
  size?: "sm" | "md";
  /**
   * Fuente del notario actualmente seleccionado (si el caller la conoce).
   * Si es "LEGACY", el picker pinta un aviso amarillo "no figura en el
   * censo actual del portal notariado.org".
   */
  selectedFuente?: NotarioFuente | null;
}

const DEBOUNCE_MS = 300;
const MIN_QUERY_CHARS = 2;
const PAGE_SIZE = 10;

function getDisplayName(n: NotarioOption): string {
  return n.nombreCompleto?.trim() || n.nombre;
}

function getSubtitle(n: NotarioOption): string {
  const partes: string[] = [];
  if (n.poblacion?.nombre) partes.push(n.poblacion.nombre);
  if (n.provincia?.nombre) partes.push(n.provincia.nombre);
  return partes.join(", ");
}

export function NotarioPicker({
  value,
  onChange,
  apiBase = "/api/notarios",
  placeholder,
  label,
  required,
  disabled,
  allowCustom = true,
  size = "md",
  selectedFuente,
}: NotarioPickerProps) {
  const { t } = useI18n();
  const resolvedPlaceholder = placeholder ?? t("ui.notarioPicker.placeholder");
  const inputSizeCls = size === "sm" ? "h-8 px-2 py-1 text-xs" : "px-3 py-2 text-sm";

  const [options, setOptions] = useState<NotarioOption[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searchedEmpty, setSearchedEmpty] = useState(false);
  // Marcamos que el último change vino de una selección de catálogo; así
  // evitamos disparar otra búsqueda inmediatamente con el texto resultante.
  const justPickedRef = useRef(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Cierra el dropdown al clic fuera.
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  // Búsqueda con debounce.
  useEffect(() => {
    if (justPickedRef.current) {
      justPickedRef.current = false;
      return;
    }
    if (!value || value.length < MIN_QUERY_CHARS) {
      setOptions([]);
      setSearchedEmpty(false);
      return;
    }
    setSearchedEmpty(false);
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `${apiBase}?q=${encodeURIComponent(value)}&pageSize=${PAGE_SIZE}`,
        );
        const json = await res.json();
        const items: NotarioOption[] = json.data ?? [];
        setOptions(items);
        setSearchedEmpty(items.length === 0);
      } catch {
        setOptions([]);
        setSearchedEmpty(true);
      } finally {
        setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [value, apiBase]);

  function handleType(next: string) {
    if (!allowCustom && next === "") {
      onChange("", null);
      setOpen(false);
      return;
    }
    onChange(next, null);
    setOpen(true);
  }

  function handlePick(notario: NotarioOption) {
    justPickedRef.current = true;
    const text = getDisplayName(notario);
    onChange(text, notario);
    setOpen(false);
  }

  return (
    <div ref={wrapperRef} className="relative">
      {label && (
        <label className="mb-1 block text-xs font-medium text-gray-700">
          {label}
          {required && <span className="ml-0.5 text-red-500">*</span>}
        </label>
      )}
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <input
          type="text"
          value={value}
          onChange={(e) => handleType(e.target.value)}
          onFocus={() => { if (value.length >= MIN_QUERY_CHARS) setOpen(true); }}
          placeholder={resolvedPlaceholder}
          disabled={disabled}
          required={required}
          className={`w-full rounded-md border border-gray-300 bg-white pl-8 ${inputSizeCls} disabled:opacity-50`}
          autoComplete="off"
        />
      </div>

      {selectedFuente === "LEGACY" && (
        <p className="mt-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] text-amber-800">
          ⚠ {t("ui.notarioPicker.obsoletoWarning")}
        </p>
      )}

      {open && (loading || options.length > 0 || searchedEmpty) && (
        <ul className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-md border border-gray-200 bg-white shadow-lg">
          {loading && (
            <li className="px-3 py-2 text-xs text-muted-foreground">
              {t("ui.notarioPicker.searching")}
            </li>
          )}
          {!loading && options.map((n) => {
            const subtitle = getSubtitle(n);
            const obsoleto = n.fuente === "LEGACY";
            const jubilado = Boolean(n.fechaBaja);
            return (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => handlePick(n)}
                  className="block w-full px-3 py-2 text-left text-xs hover:bg-gray-50"
                >
                  <div className="flex items-center gap-1.5">
                    <span className={`font-medium ${jubilado ? "text-gray-500" : obsoleto ? "text-amber-800" : "text-gray-900"}`}>
                      {getDisplayName(n)}
                    </span>
                    {jubilado && (
                      <span className="rounded bg-gray-200 px-1 py-0.5 text-[9px] uppercase text-gray-600">
                        {t("ui.notarioPicker.jubilado")}
                      </span>
                    )}
                    {obsoleto && (
                      <span className="rounded bg-amber-100 px-1 py-0.5 text-[9px] uppercase text-amber-800">
                        {t("ui.notarioPicker.obsoleto")}
                      </span>
                    )}
                  </div>
                  {subtitle && (
                    <div className="text-[10px] text-muted-foreground">{subtitle}</div>
                  )}
                </button>
              </li>
            );
          })}
          {!loading && searchedEmpty && (
            <li className="px-3 py-2 text-xs text-muted-foreground">
              {allowCustom
                ? t("ui.notarioPicker.noResultsAllowCustom")
                : t("ui.notarioPicker.noResults")}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
