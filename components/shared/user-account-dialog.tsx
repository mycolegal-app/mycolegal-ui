"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { Loader2, Save, KeyRound, User as UserIcon, Inbox, ExternalLink } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../ui/tabs";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "../ui/select";

interface ProfileShape {
  id: string;
  email: string;
  displayName: string;
  role: string;
  language: string;
  phoneNumber: string | null;
  nif: string | null;
  lastLogin: string | null;
  passwordChangedAt: string | null;
  organization?: { id: string; name: string; slug: string } | null;
}

interface IncidentEntry {
  id: string;
  number: number;
  appSlug: string;
  description: string;
  status: string;
  closedByRole: string | null;
  lastActivityAt: string;
  createdAt: string;
  reporterDisplayName?: string | null;
}

interface UserAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** App slug used to scope the "incidents on this app" listings. */
  appSlug: string;
  /**
   * Endpoints. Defaults match the proxy convention used across the user
   * apps (see mycolegal-ui/server/incidents-routes.ts and the auth-proxy
   * helper). Override only if your app exposes them under different paths.
   */
  endpoints?: {
    profile?: string;       // GET + PATCH
    changePassword?: string; // POST
    myIncidents?: string;   // GET — current user's incidents (filtered by appSlug client-side)
    orgAppIncidents?: string; // GET — others' incidents on this app
  };
  /**
   * Called after a successful profile update so the host (sidebar/topbar)
   * can refresh the displayName badge without a full reload.
   */
  onProfileUpdated?: (profile: ProfileShape) => void;
}

const LANGUAGE_OPTIONS = [
  { value: "CAST", label: "Castellano" },
  { value: "CAT", label: "Català" },
  { value: "EU", label: "Euskara" },
  { value: "GAL", label: "Galego" },
];

const STATUS_COPY: Record<string, { label: string; tone: string }> = {
  open: { label: "Abierta", tone: "bg-amber-100 text-amber-800" },
  awaiting_user: { label: "Esperando tu respuesta", tone: "bg-cyan-100 text-cyan-800" },
  awaiting_admin: { label: "Esperando soporte", tone: "bg-cyan-100 text-cyan-800" },
  closed: { label: "Cerrada", tone: "bg-gray-100 text-gray-700" },
};

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function UserAccountDialog({
  open,
  onOpenChange,
  appSlug,
  endpoints,
  onProfileUpdated,
}: UserAccountDialogProps) {
  const ep = {
    profile: endpoints?.profile ?? "/api/auth/me/profile",
    changePassword: endpoints?.changePassword ?? "/api/auth/change-password",
    myIncidents: endpoints?.myIncidents ?? "/api/incidents/mine",
    orgAppIncidents: endpoints?.orgAppIncidents ?? "/api/incidents/org-app",
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Mi cuenta</DialogTitle>
          <DialogDescription>
            Gestiona tus datos, cambia tu contraseña y revisa las incidencias relacionadas con esta aplicación.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="profile" className="mt-2">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="profile">
              <UserIcon className="mr-1.5 h-4 w-4" /> Mis datos
            </TabsTrigger>
            <TabsTrigger value="password">
              <KeyRound className="mr-1.5 h-4 w-4" /> Contraseña
            </TabsTrigger>
            <TabsTrigger value="incidents">
              <Inbox className="mr-1.5 h-4 w-4" /> Incidencias
            </TabsTrigger>
          </TabsList>

          <TabsContent value="profile" className="mt-4">
            <ProfileTab
              endpoint={ep.profile}
              onProfileUpdated={onProfileUpdated}
            />
          </TabsContent>

          <TabsContent value="password" className="mt-4">
            <PasswordTab endpoint={ep.changePassword} />
          </TabsContent>

          <TabsContent value="incidents" className="mt-4">
            <IncidentsTab
              appSlug={appSlug}
              myIncidentsEndpoint={ep.myIncidents}
              orgAppIncidentsEndpoint={ep.orgAppIncidents}
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

// ────────────────────────────── Profile tab ──────────────────────────────

function ProfileTab({
  endpoint,
  onProfileUpdated,
}: {
  endpoint: string;
  onProfileUpdated?: (p: ProfileShape) => void;
}) {
  const [profile, setProfile] = useState<ProfileShape | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const [displayName, setDisplayName] = useState("");
  const [language, setLanguage] = useState("CAST");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [nif, setNif] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(endpoint, { credentials: "include" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = await res.json();
        const p: ProfileShape = body.data ?? body;
        if (cancelled) return;
        setProfile(p);
        setDisplayName(p.displayName ?? "");
        setLanguage(p.language ?? "CAST");
        setPhoneNumber(p.phoneNumber ?? "");
        setNif(p.nif ?? "");
      } catch (err) {
        if (!cancelled) setError((err as Error).message || "No se pudo cargar el perfil.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [endpoint]);

  const onSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      setError(null);
      setSaving(true);
      try {
        const res = await fetch(endpoint, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            displayName: displayName.trim(),
            language,
            phoneNumber: phoneNumber.trim() || null,
            nif: nif.trim() || null,
          }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error?.message || body?.message || `HTTP ${res.status}`);
        }
        const body = await res.json();
        const updated: ProfileShape = body.data ?? body;
        setProfile((prev) => (prev ? { ...prev, ...updated } : updated));
        setSavedAt(Date.now());
        onProfileUpdated?.(updated);
      } catch (err) {
        setError((err as Error).message || "No se pudo guardar.");
      } finally {
        setSaving(false);
      }
    },
    [displayName, endpoint, language, nif, onProfileUpdated, phoneNumber],
  );

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Cargando perfil…
      </div>
    );
  }
  if (!profile) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
        {error || "No se pudo cargar el perfil."}
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="ua-name">Nombre</Label>
          <Input
            id="ua-name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={255}
            required
          />
        </div>
        <div>
          <Label htmlFor="ua-lang">Idioma</Label>
          <Select value={language} onValueChange={setLanguage}>
            <SelectTrigger id="ua-lang">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LANGUAGE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="ua-phone">Teléfono</Label>
          <Input
            id="ua-phone"
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            maxLength={20}
            placeholder="+34 600 000 000"
          />
        </div>
        <div>
          <Label htmlFor="ua-nif">NIF / NIE</Label>
          <Input
            id="ua-nif"
            value={nif}
            onChange={(e) => setNif(e.target.value)}
            maxLength={20}
            placeholder="12345678A"
          />
        </div>
      </div>

      <div className="rounded-md border border-gray-100 bg-gray-50 px-3 py-2 text-xs text-gray-600">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
          <dt className="text-gray-500">Email</dt>
          <dd className="font-mono">{profile.email}</dd>
          <dt className="text-gray-500">Rol</dt>
          <dd>{profile.role}</dd>
          {profile.organization && (
            <>
              <dt className="text-gray-500">Organización</dt>
              <dd>{profile.organization.name}</dd>
            </>
          )}
          <dt className="text-gray-500">Último acceso</dt>
          <dd>{formatWhen(profile.lastLogin)}</dd>
          <dt className="text-gray-500">Contraseña cambiada</dt>
          <dd>{formatWhen(profile.passwordChangedAt)}</dd>
        </dl>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}
      {savedAt && !error && (
        <div className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
          Datos guardados.
        </div>
      )}

      <div className="flex justify-end">
        <Button type="submit" disabled={saving || !displayName.trim()}>
          {saving ? (
            <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" />Guardando…</>
          ) : (
            <><Save className="mr-1.5 h-4 w-4" />Guardar cambios</>
          )}
        </Button>
      </div>
    </form>
  );
}

// ────────────────────────────── Password tab ─────────────────────────────

function PasswordTab({ endpoint }: { endpoint: string }) {
  const MIN = 12;
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSavedAt(null);
    if (next.length < MIN) {
      setError(`La nueva contraseña debe tener al menos ${MIN} caracteres.`);
      return;
    }
    if (next !== confirm) {
      setError("La nueva contraseña y la confirmación no coinciden.");
      return;
    }
    if (!current) {
      setError("Debes indicar tu contraseña actual.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error?.message || body?.message || `HTTP ${res.status}`);
      }
      setCurrent("");
      setNext("");
      setConfirm("");
      setSavedAt(Date.now());
    } catch (err) {
      setError((err as Error).message || "No se pudo cambiar la contraseña.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <Label htmlFor="ua-current">Contraseña actual</Label>
        <Input
          id="ua-current"
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          required
        />
      </div>
      <div>
        <Label htmlFor="ua-new">Nueva contraseña</Label>
        <Input
          id="ua-new"
          type="password"
          autoComplete="new-password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          minLength={MIN}
          required
        />
        <p className="mt-1 text-xs text-gray-500">Mínimo {MIN} caracteres.</p>
      </div>
      <div>
        <Label htmlFor="ua-confirm">Confirmar nueva contraseña</Label>
        <Input
          id="ua-confirm"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
        />
      </div>

      {error && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}
      {savedAt && !error && (
        <div className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
          Contraseña actualizada. Las demás sesiones se cerrarán al refrescar.
        </div>
      )}

      <div className="flex justify-end">
        <Button type="submit" disabled={submitting}>
          {submitting ? (
            <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" />Guardando…</>
          ) : (
            <><KeyRound className="mr-1.5 h-4 w-4" />Cambiar contraseña</>
          )}
        </Button>
      </div>
    </form>
  );
}

// ───────────────────────────── Incidents tab ─────────────────────────────

function IncidentsTab({
  appSlug,
  myIncidentsEndpoint,
  orgAppIncidentsEndpoint,
}: {
  appSlug: string;
  myIncidentsEndpoint: string;
  orgAppIncidentsEndpoint: string;
}) {
  const [mine, setMine] = useState<IncidentEntry[] | null>(null);
  const [others, setOthers] = useState<IncidentEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setError(null);
      try {
        const [r1, r2] = await Promise.all([
          fetch(`${myIncidentsEndpoint}?limit=50`, { credentials: "include" }),
          fetch(`${orgAppIncidentsEndpoint}?appSlug=${encodeURIComponent(appSlug)}&limit=20`, {
            credentials: "include",
          }),
        ]);
        if (!r1.ok) throw new Error(`Mis incidencias: HTTP ${r1.status}`);
        if (!r2.ok) throw new Error(`Otros: HTTP ${r2.status}`);
        const b1 = await r1.json();
        const b2 = await r2.json();
        if (cancelled) return;
        // Filter "mine" client-side to the current app: backend returns
        // every app, but this view is the per-app drawer.
        const mineRows: IncidentEntry[] = (b1.data || []).filter(
          (r: IncidentEntry) => r.appSlug === appSlug,
        );
        setMine(mineRows);
        setOthers(b2.data || []);
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [appSlug, myIncidentsEndpoint, orgAppIncidentsEndpoint]);

  return (
    <div className="space-y-5">
      {error && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      <Section
        title="Abiertas por mí en esta aplicación"
        items={mine}
        emptyText="No has abierto incidencias en esta aplicación."
        showReporter={false}
      />

      <Section
        title="Abiertas por otros en esta aplicación"
        items={others}
        emptyText="No hay incidencias de otros usuarios en esta aplicación."
        showReporter
      />

      <div className="flex justify-end">
        <Link
          href="/incidencias"
          className="inline-flex items-center gap-1 text-sm text-mc-primary-600 hover:underline"
        >
          Ver todas mis incidencias <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}

function Section({
  title,
  items,
  emptyText,
  showReporter,
}: {
  title: string;
  items: IncidentEntry[] | null;
  emptyText: string;
  showReporter: boolean;
}) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</h3>
      {items === null ? (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-md border border-dashed border-gray-200 bg-gray-50 px-3 py-4 text-center text-xs text-gray-500">
          {emptyText}
        </div>
      ) : (
        <ul className="divide-y divide-gray-100 overflow-hidden rounded-md border border-gray-100 bg-white">
          {items.map((i) => {
            const status = STATUS_COPY[i.status] || { label: i.status, tone: "bg-gray-100 text-gray-700" };
            const showLink = !showReporter; // only own incidents are clickable
            const number = (
              <span className="font-mono text-xs text-gray-500">#{i.number}</span>
            );
            return (
              <li key={i.id} className="px-3 py-2 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {showLink ? (
                        <Link
                          href={`/incidencias/${i.number}`}
                          className="font-mono text-xs text-mc-primary-600 hover:underline"
                        >
                          #{i.number}
                        </Link>
                      ) : (
                        number
                      )}
                      <span className={`inline-block rounded px-2 py-0.5 text-[10px] font-medium ${status.tone}`}>
                        {status.label}
                      </span>
                      {showReporter && i.reporterDisplayName && (
                        <span className="text-xs text-gray-500">· {i.reporterDisplayName}</span>
                      )}
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-gray-700">{i.description}</p>
                  </div>
                  <span className="shrink-0 text-xs text-gray-400">{formatWhen(i.lastActivityAt)}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
