"use client";

// Selector de registrador (Propiedad/Mercantil) con búsqueda asíncrona. El
// catálogo es GLOBAL (sin orgId) y suele tener miles de registros, por lo que
// un <select> no sirve. Persiste el **id** (FK `registradorId`), igual que
// `ClientPicker`. Cada app expone su `/api/registradores` con el contrato:
//   GET {apiBase}?search=<q>&pageSize=10[&tipo=MERCANTIL|PROPIEDAD] → { data: RegistradorOption[] }
//   GET {apiBase}/{id} → { data: RegistradorOption }

import { useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n/i18n-context";

export interface RegistradorOption {
  id: string;
  tipo: "MERCANTIL" | "PROPIEDAD" | "BIENES_MUEBLES";
  codigo: string | null;
  nombre: string;
  poblacion: string | null;
}

interface RegistradorPickerProps {
  /** ID del registrador seleccionado. Cadena vacía = ninguno. */
  value: string;
  onChange: (registradorId: string, match: RegistradorOption | null) => void;
  /** Filtra el catálogo por tipo de registro. */
  tipo?: "MERCANTIL" | "PROPIEDAD" | "BIENES_MUEBLES";
  /** Endpoint base. Default `/api/registradores`. */
  apiBase?: string;
  placeholder?: string;
  label?: string;
  required?: boolean;
  disabled?: boolean;
  /** `md` (default) para forms; `sm` para toolbars. */
  size?: "sm" | "md";
  /**
   * Municipio de la finca. Si se indica, el picker precarga la DEMARCACIÓN
   * registral de ese municipio: autoselecciona el registro cuando es único y
   * exacto, o lo(s) ofrece como sugerencia sobre el buscador. La app debe
   * exponer `demarcacionApiBase` con el contrato:
   *   GET {demarcacionApiBase}?poblacionId=<id> → { data: { exacta, registros: RegistradorOption[] } }
   */
  poblacionId?: string;
  /** Endpoint de demarcación. Default `/api/geo/demarcacion`. */
  demarcacionApiBase?: string;
}

export function RegistradorPicker({
  value,
  onChange,
  tipo,
  apiBase = "/api/registradores",
  placeholder,
  label,
  required,
  disabled,
  size = "md",
  poblacionId,
  demarcacionApiBase = "/api/geo/demarcacion",
}: RegistradorPickerProps) {
  const { t } = useI18n();
  const inputSizeCls = size === "sm" ? "h-8 px-2 py-1 text-xs" : "px-3 py-2 text-sm";
  const tagSizeCls = size === "sm" ? "h-8 px-2 py-1 text-xs" : "px-3 py-2 text-sm";
  const resolvedPlaceholder = placeholder ?? t("ui.registradorPicker.placeholder");

  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<RegistradorOption[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedLabel, setSelectedLabel] = useState("");
  const [suggested, setSuggested] = useState<RegistradorOption[]>([]);
  const [suggestExacta, setSuggestExacta] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  // Municipio para el que ya autorrellenamos, para no pisar una edición manual
  // ni reintentar en bucle.
  const autoFilledFor = useRef<string | null>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  // Hidrata el label del registrador seleccionado cuando llega `value` de fuera.
  useEffect(() => {
    if (!value) {
      setSelectedLabel("");
      return;
    }
    fetch(`${apiBase}/${value}`)
      .then((r) => r.json())
      .then((json) => { if (json.data) setSelectedLabel(displayName(json.data)); })
      .catch(() => {});
  }, [value, apiBase]);

  // Demarcación registral del municipio: precarga los registros que lo cubren.
  // Autoselecciona cuando es único y exacto (y no hay ya un registro elegido).
  useEffect(() => {
    if (!poblacionId) {
      setSuggested([]);
      setSuggestExacta(false);
      return;
    }
    let cancelled = false;
    fetch(`${demarcacionApiBase}?poblacionId=${encodeURIComponent(poblacionId)}`)
      .then((r) => r.json())
      .then((json) => {
        if (cancelled || !json?.data) return;
        const regs: RegistradorOption[] = json.data.registros ?? [];
        setSuggested(regs);
        setSuggestExacta(!!json.data.exacta);
        if (!value && json.data.exacta && regs.length === 1 && autoFilledFor.current !== poblacionId) {
          autoFilledFor.current = poblacionId;
          onChange(regs[0].id, regs[0]);
          setSelectedLabel(displayName(regs[0]));
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // Intencionadamente sin `value`/`onChange` en deps: solo reacciona al municipio.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poblacionId, demarcacionApiBase]);

  // Búsqueda con debounce (mín. 2 caracteres).
  useEffect(() => {
    if (query.length < 2) {
      setOptions([]);
      return;
    }
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const qs = new URLSearchParams({ search: query, pageSize: "10" });
        if (tipo) qs.set("tipo", tipo);
        const res = await fetch(`${apiBase}?${qs.toString()}`);
        const json = await res.json();
        setOptions(json.data ?? []);
      } catch {
        setOptions([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query, apiBase, tipo]);

  function displayName(r: RegistradorOption): string {
    return `${r.codigo ? `[${r.codigo}] ` : ""}${r.nombre}`;
  }

  function handleSelect(r: RegistradorOption) {
    onChange(r.id, r);
    setSelectedLabel(displayName(r));
    setQuery("");
    setOpen(false);
  }

  function handleClear() {
    onChange("", null);
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
        <div className={`flex items-center justify-between rounded-md border ${tagSizeCls}`}>
          <span className="truncate">{selectedLabel}</span>
          <button
            type="button"
            onClick={handleClear}
            disabled={disabled}
            aria-label={t("ui.registradorPicker.clearAria")}
            className="ml-2 text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>
        </div>
      ) : (
        <input
          type="text"
          value={query}
          disabled={disabled}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => query.length >= 2 && setOpen(true)}
          placeholder={resolvedPlaceholder}
          className={`w-full rounded-md border ${inputSizeCls}`}
        />
      )}
      {/* Sugerencias de la demarcación del municipio (solo si aún no hay registro
          elegido). Con demarcación exacta muestra el/los del municipio; si no,
          los de la provincia como respaldo. */}
      {!value && !query && suggested.length > 0 && (
        <div className="mt-1 flex flex-wrap items-center gap-1">
          <span className="text-xs text-gray-500">
            {suggestExacta ? t("ui.registradorPicker.demarcacionMunicipio") : t("ui.registradorPicker.demarcacionProvincia")}:
          </span>
          {suggested.slice(0, 8).map((r) => (
            <button
              key={r.id}
              type="button"
              disabled={disabled}
              onClick={() => handleSelect(r)}
              className="rounded border border-gray-300 px-2 py-0.5 text-xs hover:bg-gray-100"
              title={r.poblacion ?? undefined}
            >
              {displayName(r)}
            </button>
          ))}
        </div>
      )}
      {open && query.length >= 2 && (
        <div className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border bg-white shadow-lg">
          {loading && <div className="px-3 py-2 text-sm text-gray-500">{t("ui.registradorPicker.searching")}</div>}
          {!loading && options.length === 0 && (
            <div className="px-3 py-2 text-sm text-gray-500">{t("ui.registradorPicker.noResults")}</div>
          )}
          {options.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => handleSelect(r)}
              className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100"
            >
              <div className="font-medium">{displayName(r)}</div>
              {r.poblacion && <div className="text-xs text-gray-500">{r.poblacion}</div>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
