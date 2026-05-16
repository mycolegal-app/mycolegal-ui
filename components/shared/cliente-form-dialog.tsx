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

  // Reset and hydrate on open.
  useEffect(() => {
    if (!open) return;
    setError("");
    setConfirmDelete(false);
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
    return {
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
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const url = isEdit ? `${apiBase}/${clienteId}` : apiBase;
      const method = isEdit ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload()),
      });
      const json = await res.json().catch(() => ({}));
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

        {loading ? (
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
