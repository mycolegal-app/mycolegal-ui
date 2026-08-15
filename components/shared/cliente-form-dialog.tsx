"use client";

/**
 * Shared cliente form dialog. Two modes:
 *
 *   - `create` (no `clienteId`)  → POST {apiBase}
 *   - `edit`   (with `clienteId`) → GET {apiBase}/{id} on open, PATCH on save
 *
 * In edit mode, when `canDelete` is true, exposes a "Dar de baja" button
 * that PATCHes `active: false` (soft-delete). The picker filters by
 * `active: true`, so the client disappears from new selections but
 * historical references stay intact.
 *
 * The dialog is endpoint-agnostic: it sends a canonical payload
 * (`nif`, never `cif`) and trusts the backend to map fields. Apps with
 * legacy `cif` columns alias them server-side.
 */

import { useEffect, useState } from "react";
import { Trash2, User, UserPlus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { useI18n } from "../i18n/i18n-context";

/**
 * Candidato duplicado devuelto por el backend (POSSIBLE_DUPLICATE). Forma
 * mínima para mostrarlo y para poder seleccionarlo como si se hubiese creado.
 */
export interface DuplicateCandidate {
  id: string;
  tipo: string;
  nombre: string;
  apellidos: string | null;
  razonSocial: string | null;
  nif: string | null;
}

export interface ClienteFormData {
  id: string;
  tipo: "PERSONA_FISICA" | "PERSONA_JURIDICA";
  nombre: string;
  apellidos: string | null;
  razonSocial: string | null;
  nif: string | null;
  telefono?: string | null;
  email?: string | null;
  direccion?: string | null;
  codigoPostal?: string | null;
  ciudad?: string | null;
  provincia?: string | null;
  notas?: string | null;
  /** C7 — flag tri-estado retención IRPF (consumido por Legifirma). */
  sujetoRetencion?: boolean | null;
}

interface ClienteFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Endpoint base. Same convention as ClientPicker. Default
   * `/api/catalogs/clientes` (notaria). Apps with other paths (e.g.
   * legifirma `/api/clientes`) pass an override.
   */
  apiBase?: string;
  /** Edit mode if provided; otherwise create mode. */
  clienteId?: string;
  /** Prefill when opened from picker's failed search. */
  initialNombre?: string;
  initialApellidos?: string;
  initialNif?: string;
  /** Whether the soft-delete button is shown (caller checks permission). */
  canDelete?: boolean;
  /** Optional NIF normalizer applied before POST/PATCH. */
  formatNif?: (nif: string) => string;
  /** C7 — show the "Sujeto a retención IRPF" tri-state. Off by default. */
  showSujetoRetencion?: boolean;
  onCreated?: (cliente: ClienteFormData) => void;
  onUpdated?: (cliente: ClienteFormData) => void;
  onDeleted?: (id: string) => void;
}

interface FormState {
  tipo: "PERSONA_FISICA" | "PERSONA_JURIDICA";
  nombre: string;
  apellidos: string;
  razonSocial: string;
  nif: string;
  telefono: string;
  email: string;
  direccion: string;
  codigoPostal: string;
  ciudad: string;
  provincia: string;
  notas: string;
  /** C7 — "" = auto (derivar del tipo), "true" / "false" = override. */
  sujetoRetencion: "" | "true" | "false";
}

const EMPTY: FormState = {
  tipo: "PERSONA_FISICA",
  nombre: "",
  apellidos: "",
  razonSocial: "",
  nif: "",
  telefono: "",
  email: "",
  direccion: "",
  codigoPostal: "",
  ciudad: "",
  provincia: "",
  notas: "",
  sujetoRetencion: "",
};

export function ClienteFormDialog({
  open,
  onOpenChange,
  apiBase = "/api/catalogs/clientes",
  clienteId,
  initialNombre,
  initialApellidos,
  initialNif,
  canDelete,
  formatNif,
  showSujetoRetencion,
  onCreated,
  onUpdated,
  onDeleted,
}: ClienteFormDialogProps) {
  const { t } = useI18n();
  const isEdit = Boolean(clienteId);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Candidatos duplicados devueltos por el backend (POSSIBLE_DUPLICATE).
  // Mientras haya candidatos mostramos el panel de aviso en vez de crear.
  const [duplicates, setDuplicates] = useState<DuplicateCandidate[] | null>(null);

  // Reset and hydrate on open.
  useEffect(() => {
    if (!open) return;
    setError("");
    setConfirmDelete(false);
    setDuplicates(null);
    if (isEdit && clienteId) {
      setLoading(true);
      fetch(`${apiBase}/${clienteId}`)
        .then((r) => r.json())
        .then((json) => {
          const c = json?.data;
          if (!c) {
            setError(t("ui.clienteForm.errLoad"));
            return;
          }
          setForm({
            tipo: c.tipo ?? "PERSONA_FISICA",
            nombre: c.nombre ?? "",
            apellidos: c.apellidos ?? "",
            razonSocial: c.razonSocial ?? "",
            nif: c.nif ?? "",
            telefono: c.telefono ?? "",
            email: c.email ?? "",
            direccion: c.direccion ?? "",
            codigoPostal: c.codigoPostal ?? "",
            ciudad: c.ciudad ?? "",
            provincia: c.provincia ?? "",
            notas: c.notas ?? "",
            sujetoRetencion:
              c.sujetoRetencion === true ? "true" : c.sujetoRetencion === false ? "false" : "",
          });
        })
        .catch(() => setError(t("ui.clienteForm.errLoad")))
        .finally(() => setLoading(false));
    } else {
      setForm({
        ...EMPTY,
        nombre: initialNombre ?? "",
        apellidos: initialApellidos ?? "",
        nif: initialNif ?? "",
      });
    }
  }, [open, isEdit, clienteId, apiBase, initialNombre, initialApellidos, initialNif, t]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function buildPayload() {
    const base: Record<string, unknown> = {
      tipo: form.tipo,
      nombre: form.nombre.trim(),
      apellidos: form.apellidos.trim() || null,
      razonSocial: form.razonSocial.trim() || null,
      nif: form.nif.trim() ? (formatNif ? formatNif(form.nif.trim()) : form.nif.trim()) : null,
      telefono: form.telefono.trim() || null,
      email: form.email.trim() || null,
      direccion: form.direccion.trim() || null,
      codigoPostal: form.codigoPostal.trim() || null,
      ciudad: form.ciudad.trim() || null,
      provincia: form.provincia.trim() || null,
      notas: form.notas.trim() || null,
    };
    if (showSujetoRetencion) {
      base.sujetoRetencion =
        form.sujetoRetencion === "true" ? true : form.sujetoRetencion === "false" ? false : null;
    }
    return base;
  }

  async function handleSubmit(e: React.FormEvent, force = false) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const url = isEdit ? `${apiBase}/${clienteId}` : apiBase;
      const method = isEdit ? "PATCH" : "POST";
      const payload = buildPayload();
      // En creación, `force` salta la comprobación anti-duplicados del backend.
      if (!isEdit && force) payload.force = true;
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      // Backend detectó posibles duplicados: mostramos el panel de aviso y
      // dejamos al usuario elegir (usar existente / crear igualmente).
      if (res.status === 409 && json?.error?.code === "POSSIBLE_DUPLICATE") {
        setDuplicates((json.error.candidates as DuplicateCandidate[]) ?? []);
        return;
      }
      if (!res.ok) {
        throw new Error(
          json?.error?.message || json?.message || `HTTP ${res.status}`,
        );
      }
      const cliente = json.data as ClienteFormData;
      if (isEdit) onUpdated?.(cliente);
      else onCreated?.(cliente);
      onOpenChange(false);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setSaving(false);
    }
  }

  // El usuario elige un candidato existente en vez de crear uno nuevo: se
  // trata como "creado" para que el picker lo seleccione.
  function handleUseExisting(c: DuplicateCandidate) {
    onCreated?.(c as unknown as ClienteFormData);
    onOpenChange(false);
  }

  function candidateName(c: DuplicateCandidate): string {
    return c.tipo === "PERSONA_JURIDICA"
      ? c.razonSocial || c.nombre
      : `${c.nombre} ${c.apellidos || ""}`.trim();
  }

  async function handleDelete() {
    if (!clienteId || saving) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`${apiBase}/${clienteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: false }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          json?.error?.message || json?.message || `HTTP ${res.status}`,
        );
      }
      onDeleted?.(clienteId);
      onOpenChange(false);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setSaving(false);
    }
  }

  const isPersonaJuridica = form.tipo === "PERSONA_JURIDICA";

  const TitleIcon = isEdit ? User : UserPlus;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[680px] p-5 gap-3">
        <DialogHeader className="space-y-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <TitleIcon className="h-4 w-4 text-cyan-600" aria-hidden="true" />
            {isEdit ? t("ui.clienteForm.titleEdit") : t("ui.clienteForm.titleCreate")}
          </DialogTitle>
        </DialogHeader>

        {error && (
          <div className="rounded-md bg-red-50 p-2 text-xs text-red-700">{error}</div>
        )}

        {duplicates && duplicates.length > 0 ? (
          <div className="space-y-3">
            <div className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">
              <p className="font-medium">{t("ui.clienteForm.dupTitle")}</p>
              <p className="mt-0.5 text-xs">{t("ui.clienteForm.dupHint")}</p>
            </div>
            <div className="max-h-56 space-y-1.5 overflow-auto">
              {duplicates.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{candidateName(c)}</div>
                    {c.nif && (
                      <div className="text-xs text-gray-500">
                        {formatNif ? formatNif(c.nif) : c.nif}
                      </div>
                    )}
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => handleUseExisting(c)}
                  >
                    {t("ui.clienteForm.dupUse")}
                  </Button>
                </div>
              ))}
            </div>
            <DialogFooter className="flex-row items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDuplicates(null)}
                disabled={saving}
              >
                {t("ui.clienteForm.btnCancel")}
              </Button>
              <Button
                type="button"
                disabled={saving}
                onClick={(e) => handleSubmit(e as unknown as React.FormEvent, true)}
              >
                {saving ? t("ui.clienteForm.btnSaving") : t("ui.clienteForm.dupCreateAnyway")}
              </Button>
            </DialogFooter>
          </div>
        ) : loading ? (
          <div className="py-6 text-center text-sm text-gray-500">
            {t("ui.clienteForm.loading")}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="grid grid-cols-12 gap-x-3 gap-y-2">
              <div className="col-span-4">
                <Label>{t("ui.clienteForm.tipo")} *</Label>
                <select
                  value={form.tipo}
                  onChange={(e) => update("tipo", e.target.value as FormState["tipo"])}
                  className="mt-1 h-9 w-full rounded-md border px-2 text-sm"
                >
                  <option value="PERSONA_FISICA">{t("ui.clienteForm.personaFisica")}</option>
                  <option value="PERSONA_JURIDICA">{t("ui.clienteForm.personaJuridica")}</option>
                </select>
              </div>
              <div className="col-span-4">
                <Label htmlFor="nif">{t("ui.clienteForm.nif")}</Label>
                <Input
                  id="nif"
                  value={form.nif}
                  onChange={(e) => update("nif", e.target.value)}
                  className="h-9"
                />
              </div>
              <div className="col-span-4">
                <Label htmlFor="telefono">{t("ui.clienteForm.telefono")}</Label>
                <Input
                  id="telefono"
                  value={form.telefono}
                  onChange={(e) => update("telefono", e.target.value)}
                  className="h-9"
                />
              </div>

              {isPersonaJuridica ? (
                <div className="col-span-12">
                  <Label htmlFor="razonSocial">{t("ui.clienteForm.razonSocial")} *</Label>
                  <Input
                    id="razonSocial"
                    value={form.razonSocial}
                    onChange={(e) => update("razonSocial", e.target.value)}
                    required
                    className="h-9"
                  />
                </div>
              ) : (
                <>
                  <div className="col-span-5">
                    <Label htmlFor="nombre">{t("ui.clienteForm.nombre")} *</Label>
                    <Input
                      id="nombre"
                      value={form.nombre}
                      onChange={(e) => update("nombre", e.target.value)}
                      required
                      className="h-9"
                    />
                  </div>
                  <div className="col-span-7">
                    <Label htmlFor="apellidos">{t("ui.clienteForm.apellidos")}</Label>
                    <Input
                      id="apellidos"
                      value={form.apellidos}
                      onChange={(e) => update("apellidos", e.target.value)}
                      className="h-9"
                    />
                  </div>
                </>
              )}

              <div className="col-span-12">
                <Label htmlFor="email">{t("ui.clienteForm.email")}</Label>
                <Input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={(e) => update("email", e.target.value)}
                  className="h-9"
                />
              </div>

              <div className="col-span-12">
                <Label htmlFor="direccion">{t("ui.clienteForm.direccion")}</Label>
                <Input
                  id="direccion"
                  value={form.direccion}
                  onChange={(e) => update("direccion", e.target.value)}
                  className="h-9"
                />
              </div>
              <div className="col-span-3">
                <Label htmlFor="codigoPostal">{t("ui.clienteForm.codigoPostal")}</Label>
                <Input
                  id="codigoPostal"
                  value={form.codigoPostal}
                  onChange={(e) => update("codigoPostal", e.target.value)}
                  className="h-9"
                />
              </div>
              <div className="col-span-5">
                <Label htmlFor="ciudad">{t("ui.clienteForm.ciudad")}</Label>
                <Input
                  id="ciudad"
                  value={form.ciudad}
                  onChange={(e) => update("ciudad", e.target.value)}
                  className="h-9"
                />
              </div>
              <div className="col-span-4">
                <Label htmlFor="provincia">{t("ui.clienteForm.provincia")}</Label>
                <Input
                  id="provincia"
                  value={form.provincia}
                  onChange={(e) => update("provincia", e.target.value)}
                  className="h-9"
                />
              </div>

              <div className="col-span-12">
                <Label htmlFor="notas">{t("ui.clienteForm.notas")}</Label>
                <textarea
                  id="notas"
                  value={form.notas}
                  onChange={(e) => update("notas", e.target.value)}
                  rows={2}
                  className="mt-1 w-full rounded-md border px-2 py-1.5 text-sm"
                />
              </div>

              {showSujetoRetencion && (
                <div className="col-span-12">
                  <Label htmlFor="sujetoRetencion">
                    {t("ui.clienteForm.sujetoRetencion")}
                  </Label>
                  <select
                    id="sujetoRetencion"
                    value={form.sujetoRetencion}
                    onChange={(e) =>
                      update("sujetoRetencion", e.target.value as "" | "true" | "false")
                    }
                    className="mt-1 h-9 w-full rounded-md border px-2 text-sm"
                  >
                    <option value="">{t("ui.clienteForm.sujetoRetencionAuto")}</option>
                    <option value="true">{t("ui.clienteForm.sujetoRetencionYes")}</option>
                    <option value="false">{t("ui.clienteForm.sujetoRetencionNo")}</option>
                  </select>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("ui.clienteForm.sujetoRetencionHint")}
                  </p>
                </div>
              )}
            </div>

            <DialogFooter className="flex-row items-center justify-between gap-3 sm:justify-between">
              <div>
                {isEdit && canDelete && (
                  confirmDelete ? (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-red-700">{t("ui.clienteForm.confirmDelete")}</span>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        disabled={saving}
                        onClick={handleDelete}
                      >
                        {t("ui.clienteForm.confirmDeleteYes")}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={saving}
                        onClick={() => setConfirmDelete(false)}
                      >
                        {t("ui.clienteForm.btnCancel")}
                      </Button>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setConfirmDelete(true)}
                      disabled={saving}
                      className="text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                      {t("ui.clienteForm.delete")}
                    </Button>
                  )
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={saving}
                >
                  {t("ui.clienteForm.btnCancel")}
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving
                    ? t("ui.clienteForm.btnSaving")
                    : isEdit
                      ? t("ui.clienteForm.btnSave")
                      : t("ui.clienteForm.btnCreate")}
                </Button>
              </div>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
