"use client";

import { useEffect, useState } from "react";
import { Receipt, AlertTriangle, CheckCircle2 } from "lucide-react";
import {
  ejecutarIntegracionLocal,
  type RecetaIntegracion,
} from "../../lib/local-integration";
import { LoadingSpinner } from "./loading-spinner";
import { useI18n } from "../i18n/i18n-context";

/** Datos resueltos de la factura que el consumidor persiste en su propio modelo. */
export interface FacturaResuelta {
  serie: string | null;
  numero: string;
  total: number | null;
  fechaEmision: string | null;
  /** Código de la integración ejecutada (null si entrada manual). */
  integracionCodigo: string | null;
  /** PDF en base64 devuelto por la integración (null si no aplica). */
  pdfBase64: string | null;
}

interface FacturarDialogProps {
  open: boolean;
  /** POST → { mode: 'AUTO', receta, inputs } | { mode: 'MANUAL', reason }. */
  recetaUrl: string;
  /** POST de auditoría del resultado de ejecución (opcional). */
  resultadoUrl?: string;
  /**
   * Persiste la factura resuelta en el modelo del consumidor (cada app tiene su
   * endpoint/forma). Debe lanzar `Error` (con mensaje) si falla.
   */
  onSubmit: (resuelta: FacturaResuelta) => Promise<void>;
  onClose: () => void;
}

type IntgEstado = "consultando" | "auto" | "sinConfig" | "fallo";

const RAZONES_SIN_CONFIG = new Set([
  "facturae-no-configurado",
  "sin-integracion-configurada",
  "minuta-en-app",
]);

/**
 * Diálogo "Facturar en Wordplex" compartido (Pólizas/Actas/Moratorias). Pregunta
 * al hub (facturae) vía `recetaUrl` si hay receta configurada para la org: si la
 * hay (AUTO) ejecuta la integración en la LAN del notario y rellena
 * serie/nº/total/fecha; si no (MANUAL) el oficial los teclea. En ambos casos el
 * consumidor persiste vía `onSubmit` (su modelo/endpoint propio).
 */
export function FacturarDialog({
  open,
  recetaUrl,
  resultadoUrl,
  onSubmit,
  onClose,
}: FacturarDialogProps) {
  const { t } = useI18n();

  const [intgEstado, setIntgEstado] = useState<IntgEstado>("consultando");
  const [intgReason, setIntgReason] = useState<string | null>(null);
  const [receta, setReceta] = useState<{
    receta: RecetaIntegracion & { codigo: string };
    inputs: Record<string, unknown>;
  } | null>(null);

  const [serie, setSerie] = useState("");
  const [numero, setNumero] = useState("");
  const [total, setTotal] = useState("");
  const [fecha, setFecha] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSerie("");
    setNumero("");
    setTotal("");
    setFecha("");
    setError(null);
    setIntgEstado("consultando");
    setIntgReason(null);
    setReceta(null);
    let cancelado = false;
    (async () => {
      try {
        const res = await fetch(recetaUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
        const json = await res.json().catch(() => null);
        const data = json?.data as
          | { mode: "AUTO"; receta: RecetaIntegracion & { codigo: string }; inputs: Record<string, unknown> }
          | { mode: "MANUAL"; reason: string }
          | undefined;
        if (cancelado) return;
        if (data?.mode === "AUTO") {
          setReceta({ receta: data.receta, inputs: data.inputs ?? {} });
          setIntgEstado("auto");
        } else if (data?.mode === "MANUAL") {
          setIntgReason(data.reason);
          setIntgEstado(RAZONES_SIN_CONFIG.has(data.reason) ? "sinConfig" : "fallo");
        } else {
          setIntgEstado("sinConfig");
        }
      } catch {
        if (!cancelado) setIntgEstado("sinConfig");
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [open, recetaUrl]);

  function reportar(codigo: string, transporte: string, ok: boolean, reason?: string, detail?: string) {
    if (!resultadoUrl) return;
    void fetch(resultadoUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ codigo, transporte, ok, reason, detail }),
    }).catch(() => {});
  }

  // Resuelve serie/nº/total/fecha: lo tecleado manda; si no y hay AUTO, ejecuta
  // la receta en local. Devuelve null si la integración falla (motivo en banner).
  async function resolver(): Promise<FacturaResuelta | null> {
    const serieM = serie.trim();
    const numeroM = numero.trim();
    const totalM = total.trim() ? Number(total) : null;
    if (numeroM) {
      return {
        serie: serieM || null,
        numero: numeroM,
        total: totalM,
        fechaEmision: fecha || null,
        integracionCodigo: null,
        pdfBase64: null,
      };
    }
    if (intgEstado === "auto" && receta) {
      const out = await ejecutarIntegracionLocal(receta.receta, receta.inputs);
      reportar(
        receta.receta.codigo,
        receta.receta.transporte,
        out.ok,
        out.ok ? undefined : out.reason,
        out.ok ? undefined : out.detail,
      );
      if (out.ok) {
        const n =
          typeof out.data.numero === "string"
            ? out.data.numero
            : typeof out.data.numero === "number"
              ? String(out.data.numero)
              : null;
        if (!n) {
          setIntgEstado("fallo");
          setIntgReason("respuesta-sin-numero");
          return null;
        }
        const s =
          typeof out.data.serie === "string"
            ? out.data.serie
            : typeof receta.inputs.serie === "string"
              ? (receta.inputs.serie as string)
              : null;
        const tot =
          typeof out.data.total === "number"
            ? out.data.total
            : typeof out.data.total === "string" && out.data.total.trim()
              ? Number(out.data.total)
              : null;
        const fec = typeof out.data.fecha === "string" ? out.data.fecha : null;
        const pdf = typeof out.data.pdf === "string" ? out.data.pdf : null;
        setSerie(s ?? "");
        setNumero(n);
        if (tot != null) setTotal(String(tot));
        return {
          serie: s ?? (serieM || null),
          numero: n,
          total: tot,
          fechaEmision: fec,
          integracionCodigo: receta.receta.codigo,
          pdfBase64: pdf,
        };
      }
      setIntgEstado("fallo");
      setIntgReason(out.reason);
      return null;
    }
    // MANUAL sin nº tecleado → error (no autogeneramos correlativo).
    setError(t("ui.facturar.faltaNumero"));
    return null;
  }

  async function handleSubmit() {
    setLoading(true);
    setError(null);
    try {
      const r = await resolver();
      if (!r) {
        setLoading(false);
        return;
      }
      await onSubmit(r);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("ui.facturar.errGenerico"));
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold">
          <Receipt className="h-4 w-4 text-cyan-600" />
          {t("ui.facturar.titulo")}
        </h2>
        <p className="mb-4 text-sm text-gray-500">{t("ui.facturar.descripcion")}</p>

        {/* Estado de la integración */}
        {intgEstado === "consultando" && (
          <p className="mb-3 flex items-center gap-2 text-xs text-gray-500">
            <LoadingSpinner size="sm" />
            {t("ui.facturar.consultando")}
          </p>
        )}
        {intgEstado === "auto" && (
          <p className="mb-3 flex items-center gap-2 text-xs text-emerald-600">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
            {t("ui.facturar.autoListo")}
          </p>
        )}
        {intgEstado === "sinConfig" && (
          <p className="mb-3 text-xs text-gray-500">{t("ui.facturar.sinConfig")}</p>
        )}
        {intgEstado === "fallo" && (
          <div className="mb-3 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            <span>
              {t("ui.facturar.fallo")}
              {intgReason && <span className="block opacity-70">{intgReason}</span>}
            </span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium">{t("ui.facturar.serie")}</label>
            <input
              value={serie}
              onChange={(e) => setSerie(e.target.value)}
              maxLength={20}
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">{t("ui.facturar.numero")}</label>
            <input
              value={numero}
              onChange={(e) => setNumero(e.target.value)}
              maxLength={40}
              placeholder={intgEstado === "auto" ? t("ui.facturar.numeroAuto") : ""}
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">{t("ui.facturar.total")}</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={total}
              onChange={(e) => setTotal(e.target.value)}
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">{t("ui.facturar.fecha")}</label>
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
          </div>
        </div>

        {error && <p className="mt-3 text-xs text-red-500">{error}</p>}

        <div className="mt-5 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
          >
            {t("ui.facturar.cancelar")}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading || intgEstado === "consultando"}
            className="inline-flex items-center gap-1.5 rounded-md bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-700 disabled:opacity-50"
          >
            {loading ? <LoadingSpinner size="sm" /> : <Receipt className="h-4 w-4" />}
            {t("ui.facturar.btn")}
          </button>
        </div>
      </div>
    </div>
  );
}
