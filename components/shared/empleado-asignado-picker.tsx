"use client";

import { useEffect, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { useI18n } from "../i18n/i18n-context";

export interface EmpleadoOption {
  id: string;
  displayName: string;
  email?: string | null;
  role?: string | null;
}

interface EmpleadoAsignadoPickerProps {
  /** Current selected userRoleId. Empty string means "no selection". */
  value: string;
  /** Receives the new userRoleId. When `allowEmpty`, an empty string is possible. */
  onChange: (id: string) => void;
  /**
   * Show a "Sin asignar" option that sets `value` to "". When false (default),
   * the select is required and won't render an empty entry.
   */
  allowEmpty?: boolean;
  /** Override the "Sin asignar" label when `allowEmpty` is true. */
  emptyLabel?: string;
  /** Trigger placeholder shown when nothing is selected. */
  placeholder?: string;
  /**
   * Pre-fill `value` with the current session's `userRoleId` once the list is
   * loaded, if `value` is still empty. Default: true.
   */
  autoFillFromSession?: boolean;
  /** Override the catalog endpoint. Default: `/api/catalogs/empleados`. */
  endpoint?: string;
  /** Override the session endpoint. Default: `/api/auth/me`. */
  meEndpoint?: string;
  /** Page size for the catalog fetch. Default: 200. */
  pageSize?: number;
  disabled?: boolean;
  /** aria-label on the trigger (defaults to the placeholder). */
  ariaLabel?: string;
  className?: string;
  /** Forwarded to the SelectTrigger (for label htmlFor). */
  id?: string;
}

// Radix Select forbids empty-string item values. Use a sentinel and translate
// in/out at the boundary so callers keep a clean `""` contract.
const EMPTY_SENTINEL = "__empleado_none__";

/**
 * Shared picker for "empleado asignado" (assigned employee) fields.
 *
 * - Fetches the org's active employees from `/api/catalogs/empleados` (which
 *   only requires authentication — NOT `admin:users` — so any role can see
 *   their colleagues to assign).
 * - Pre-fills with the current session's `userRoleId` so non-notario users
 *   default to themselves instead of an empty select.
 *
 * Designed to be drop-in for react-hook-form via `<Controller>`:
 *
 *   <Controller name="empleadoId" control={control} render={({ field }) => (
 *     <EmpleadoAsignadoPicker value={field.value} onChange={field.onChange} />
 *   )} />
 */
export function EmpleadoAsignadoPicker({
  value,
  onChange,
  allowEmpty = false,
  emptyLabel,
  placeholder,
  autoFillFromSession = true,
  endpoint = "/api/catalogs/empleados",
  meEndpoint = "/api/auth/me",
  pageSize = 200,
  disabled,
  ariaLabel,
  className,
  id,
}: EmpleadoAsignadoPickerProps) {
  const { t } = useI18n();
  const resolvedPlaceholder = placeholder ?? t("ui.empleadoPicker.placeholder");
  const resolvedEmptyLabel = emptyLabel ?? t("ui.empleadoPicker.sinAsignar");

  const [empleados, setEmpleados] = useState<EmpleadoOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [sessionUserRoleId, setSessionUserRoleId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const requests: Promise<Response>[] = [
          fetch(`${endpoint}?pageSize=${pageSize}`),
        ];
        if (autoFillFromSession) {
          requests.push(fetch(meEndpoint));
        }

        const results = await Promise.all(requests.map((p) => p.catch(() => null)));
        if (cancelled) return;

        const [listRes, meRes] = results;

        if (listRes?.ok) {
          const json = await listRes.json().catch(() => null);
          if (!cancelled && Array.isArray(json?.data)) {
            setEmpleados(json.data);
          }
        }

        if (autoFillFromSession && meRes?.ok) {
          const json = await meRes.json().catch(() => null);
          const urid = json?.data?.userRoleId;
          if (!cancelled && typeof urid === "string" && urid.length > 0) {
            setSessionUserRoleId(urid);
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [endpoint, meEndpoint, pageSize, autoFillFromSession]);

  // Pre-fill with the session's userRoleId once both list + me are loaded,
  // only if the caller hasn't set anything yet.
  useEffect(() => {
    if (!autoFillFromSession) return;
    if (loading) return;
    if (value) return;
    if (!sessionUserRoleId) return;
    if (!empleados.some((e) => e.id === sessionUserRoleId)) return;
    onChange(sessionUserRoleId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, sessionUserRoleId, empleados, autoFillFromSession]);

  const selectValue = value || (allowEmpty ? EMPTY_SENTINEL : "");

  function handleChange(next: string) {
    if (next === EMPTY_SENTINEL) {
      onChange("");
    } else {
      onChange(next);
    }
  }

  return (
    <Select value={selectValue} onValueChange={handleChange} disabled={disabled}>
      <SelectTrigger
        id={id}
        aria-label={ariaLabel ?? resolvedPlaceholder}
        className={className}
      >
        <SelectValue
          placeholder={loading ? t("ui.empleadoPicker.loading") : resolvedPlaceholder}
        />
      </SelectTrigger>
      <SelectContent>
        {allowEmpty && (
          <SelectItem value={EMPTY_SENTINEL}>{resolvedEmptyLabel}</SelectItem>
        )}
        {empleados.map((emp) => (
          <SelectItem key={emp.id} value={emp.id}>
            {emp.displayName}
          </SelectItem>
        ))}
        {!loading && empleados.length === 0 && !allowEmpty && (
          // py-6 + block para que el popover no colapse a "unos milímetros"
          // cuando no hay opciones (en modo popper el viewport toma la altura
          // de una fila; un mensaje sin alto suficiente se veía como un sliver
          // en blanco — incidencias #60/#42). El texto explica el porqué.
          <div className="block whitespace-nowrap px-3 py-6 text-center text-sm text-muted-foreground">
            {t("ui.empleadoPicker.empty") || "No hay empleados disponibles"}
          </div>
        )}
      </SelectContent>
    </Select>
  );
}
