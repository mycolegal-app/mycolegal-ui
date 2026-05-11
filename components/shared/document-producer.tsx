"use client";

import { useEffect, useState } from "react";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../ui/tabs";
import { Badge } from "../ui/badge";
import { useToast } from "../../hooks/use-toast";

/**
 * Especificación de un campo del documento, declarada por la app en su
 * catálogo de templates. La UI lo usa para renderizar la tabla de "datos
 * a copiar" en modo manual y para validar el payload en modo auto.
 */
export interface DocumentFieldSpec {
  /** Identificador interno del campo. */
  key: string;
  /** Etiqueta legible mostrada al oficial. */
  label: string;
  /** Tipo de dato (string|date|money|number|boolean|long-text). Usado para formateo. */
  type?: "string" | "date" | "money" | "number" | "boolean" | "long-text";
  /** Si está disponible para copy-to-clipboard rápido. Default true. */
  copyable?: boolean;
}

export interface DocumentProducerResolution {
  template: {
    id: string;
    appSlug: string;
    key: string;
    name: string;
    description?: string | null;
    version: number;
    engine: string;
    fieldsSpec: DocumentFieldSpec[];
  };
  /** Signed URL de descarga de la plantilla en blanco (15 min). null si no hay. */
  templateUrl?: string | null;
  /** Si la plantilla viene del default o del override per-org. */
  blobSource?: "default" | "org" | null;
  /** Modo final tras aplicar engine + override + disponibilidad DocFilling. */
  mode: "auto" | "manual" | "auto+manual";
  autoAvailable: boolean;
  docFillingAvailable: boolean;
}

export interface DocumentProducerProps {
  /**
   * Función que la app consumidora pasa para resolver el template. Esta
   * llamada agrega:
   *   1. GET auth `/document-templates/:appSlug/:key/resolve?orgId=...`
   *   2. Signed URL desde el GCS de la app sobre `blobPath`.
   * El componente NO conoce ni auth ni GCS directamente — todo va a través
   * de un endpoint propio de la app (típicamente `/api/{appSlug}/documents/:key/resolve`).
   */
  resolve: () => Promise<DocumentProducerResolution>;
  /** Datos actuales del expediente para rellenar el documento. */
  values: Record<string, string | number | boolean | null | undefined>;
  /**
   * Endpoint POST de la app consumidora donde se sube el archivo
   * producido. La app implementa toda la lógica de attach al expediente.
   * Llamado con FormData { file, mode, templateId, templateKey, templateVersion }.
   */
  uploadEndpoint: string;
  /** Llamado tras éxito en cualquier modo. */
  onProduced?: (result: { mode: "auto" | "manual"; fileUrl?: string; fileName?: string }) => void;
  /** Endpoint POST para invocar la generación automática (modo auto). */
  generateEndpoint?: string;
  /** Si está, oculta el componente entero y muestra placeholder. */
  disabled?: boolean;
}

function formatValue(v: unknown, type?: DocumentFieldSpec["type"]): string {
  if (v === null || v === undefined || v === "") return "—";
  if (type === "money" && typeof v === "number") {
    return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(v);
  }
  if (type === "date" && (typeof v === "string" || v instanceof Date)) {
    const d = typeof v === "string" ? new Date(v) : v;
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" });
    }
  }
  if (type === "boolean") return v ? "Sí" : "No";
  return String(v);
}

/**
 * Helper compartido para "producir un documento" en cualquier app.
 * Maneja los dos caminos:
 *   - auto: invoca al engine (DocFilling Python remoto o local) y adjunta
 *     el resultado.
 *   - manual: muestra al oficial los datos a copiar + plantilla a
 *     descargar + input para subir el documento producido.
 * El modo se decide en `resolve()` que la app inyecta.
 */
export function DocumentProducer(props: DocumentProducerProps) {
  const { resolve, values, uploadEndpoint, generateEndpoint, onProduced, disabled } = props;
  const { toast } = useToast();
  const [resolution, setResolution] = useState<DocumentProducerResolution | null>(null);
  const [loading, setLoading] = useState(true);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"auto" | "manual">("manual");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const r = await resolve();
        if (!mounted) return;
        setResolution(r);
        setActiveTab(r.autoAvailable ? "auto" : "manual");
      } catch (err) {
        if (!mounted) return;
        setResolveError(err instanceof Error ? err.message : String(err));
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [resolve]);

  if (disabled) {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-muted-foreground">
          Generación de documento deshabilitada.
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-muted-foreground">
          Cargando información de la plantilla…
        </CardContent>
      </Card>
    );
  }

  if (resolveError || !resolution) {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-destructive">
          No se pudo resolver la plantilla: {resolveError ?? "desconocido"}
        </CardContent>
      </Card>
    );
  }

  const { template, templateUrl, mode } = resolution;

  async function copyValue(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: "Copiado", description: text.slice(0, 60) });
    } catch {
      toast({ title: "No se pudo copiar", variant: "destructive" });
    }
  }

  async function handleUploadFile(file: File, mode: "auto" | "manual") {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("mode", mode);
      fd.append("templateId", template.id);
      fd.append("templateKey", template.key);
      fd.append("templateVersion", String(template.version));
      const res = await fetch(uploadEndpoint, { method: "POST", body: fd });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error?.message ?? `HTTP ${res.status}`);
      }
      const json = await res.json().catch(() => ({}));
      toast({ title: "Documento adjuntado correctamente" });
      onProduced?.({ mode, fileUrl: json?.data?.fileUrl, fileName: file.name });
    } catch (err) {
      toast({
        title: "Error al adjuntar",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleGenerate() {
    if (!generateEndpoint) {
      toast({ title: "Generación automática no configurada", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(generateEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId: template.id, templateKey: template.key, values }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error?.message ?? `HTTP ${res.status}`);
      }
      const json = await res.json();
      toast({ title: "Documento generado" });
      onProduced?.({ mode: "auto", fileUrl: json?.data?.fileUrl, fileName: json?.data?.fileName });
    } catch (err) {
      toast({
        title: "Error al generar",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }

  const manualPanel = (
    <div className="space-y-4">
      <div className="rounded border bg-muted/30 p-3">
        <div className="text-sm font-semibold mb-1">Cómo producir este documento</div>
        <ol className="list-decimal pl-5 text-sm text-muted-foreground space-y-1">
          {templateUrl ? (
            <li>
              Descarga la plantilla en blanco:{" "}
              <a className="underline" href={templateUrl} target="_blank" rel="noreferrer">
                {template.name}.docx
              </a>
            </li>
          ) : (
            <li>Usa la plantilla habitual de tu notaría para "{template.name}".</li>
          )}
          <li>Copia los datos del expediente (tabla inferior) en los huecos correspondientes.</li>
          <li>Imprime / firma / completa el documento según el procedimiento de tu notaría.</li>
          <li>Sube el documento producido aquí para adjuntarlo al expediente.</li>
        </ol>
      </div>

      <div>
        <div className="text-sm font-semibold mb-2">Datos a usar</div>
        <div className="rounded border overflow-hidden">
          <table className="w-full text-sm">
            <tbody>
              {template.fieldsSpec.map((field) => {
                const raw = values[field.key];
                const display = formatValue(raw, field.type);
                const canCopy = field.copyable !== false && display !== "—";
                return (
                  <tr key={field.key} className="border-t">
                    <td className="px-3 py-2 text-muted-foreground w-1/3">{field.label}</td>
                    <td className="px-3 py-2 font-mono break-all">{display}</td>
                    <td className="px-3 py-2 w-12 text-right">
                      {canCopy ? (
                        <button
                          type="button"
                          className="text-xs underline text-muted-foreground hover:text-foreground"
                          onClick={() => copyValue(String(raw ?? ""))}
                          aria-label={`Copiar ${field.label}`}
                        >
                          📋
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <label className="text-sm font-semibold">Subir documento producido</label>
        <input
          type="file"
          className="mt-2 block text-sm"
          accept=".docx,.pdf,.rtf,.odt"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleUploadFile(file, "manual");
          }}
        />
      </div>
    </div>
  );

  const autoPanel = (
    <div className="space-y-4">
      <div className="rounded border bg-muted/30 p-3 text-sm text-muted-foreground">
        El sistema rellenará la plantilla con los datos del expediente automáticamente. Tras la
        generación, el documento queda adjunto al expediente.
      </div>
      <Button onClick={handleGenerate} disabled={busy}>
        {busy ? "Generando…" : "Generar documento"}
      </Button>
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">{template.name}</CardTitle>
            {template.description ? (
              <CardDescription className="mt-1 text-xs">{template.description}</CardDescription>
            ) : null}
          </div>
          <Badge variant={mode === "auto+manual" ? "default" : "secondary"}>
            {mode === "auto+manual" ? "Auto / Manual" : "Solo manual"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {mode === "auto+manual" ? (
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "auto" | "manual")}>
            <TabsList>
              <TabsTrigger value="auto">Generación automática</TabsTrigger>
              <TabsTrigger value="manual">Producir manualmente</TabsTrigger>
            </TabsList>
            <TabsContent value="auto" className="mt-4">{autoPanel}</TabsContent>
            <TabsContent value="manual" className="mt-4">{manualPanel}</TabsContent>
          </Tabs>
        ) : (
          manualPanel
        )}
      </CardContent>
    </Card>
  );
}
