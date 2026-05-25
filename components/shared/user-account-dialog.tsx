"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { NavLink as Link } from "./nav-link";
import { Loader2, Save, KeyRound, User as UserIcon, Inbox, ExternalLink } from "lucide-react";
import { useI18n } from "../i18n/i18n-context";
import { apiErrorMessage } from "../../lib/api-error";
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
  { value: "CAST", labelKey: "ui.userAccount.lang.cast" },
  { value: "CAT", labelKey: "ui.userAccount.lang.cat" },
  { value: "EU", labelKey: "ui.userAccount.lang.eus" },
  { value: "GAL", labelKey: "ui.userAccount.lang.gal" },
];

const STATUS_TONES: Record<string, string> = {
  open: "bg-amber-100 text-amber-800",
  awaiting_user: "bg-cyan-100 text-cyan-800",
  awaiting_admin: "bg-cyan-100 text-cyan-800",
  closed: "bg-gray-100 text-gray-700",
};

const STATUS_LABEL_KEYS: Record<string, string> = {
  open: "ui.userAccount.status.open",
  awaiting_user: "ui.userAccount.status.awaitingUser",
  awaiting_admin: "ui.userAccount.status.awaitingAdmin",
  closed: "ui.userAccount.status.closed",
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
  const { t } = useI18n();
  const ep = {
    profile: endpoints?.profile ?? "/api/auth/me/profile",
    changePassword: endpoints?.changePassword ?? "/api/auth/change-password",
    myIncidents: endpoints?.myIncidents ?? "/api/incidents/mine",
    orgAppIncidents: endpoints?.orgAppIncidents ?? "/api/incidents/org-app",
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Capped at 85vh + column layout so the header stays put and the
          active tab scrolls on its own — long incident lists no longer
          push the modal off-screen. */}
      <DialogContent className="flex max-h-[85vh] max-w-3xl flex-col">
        <DialogHeader>
          <DialogTitle>{t("ui.userAccount.title")}</DialogTitle>
          <DialogDescription>
            {t("ui.userAccount.description")}
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="profile" className="mt-2 flex min-h-0 flex-1 flex-col">
          <TabsList className="grid w-full shrink-0 grid-cols-3">
            <TabsTrigger value="profile">
              <UserIcon className="mr-1.5 h-4 w-4" /> {t("ui.userAccount.tabProfile")}
            </TabsTrigger>
            <TabsTrigger value="password">
              <KeyRound className="mr-1.5 h-4 w-4" /> {t("ui.userAccount.tabPassword")}
            </TabsTrigger>
            <TabsTrigger value="incidents">
              <Inbox className="mr-1.5 h-4 w-4" /> {t("ui.userAccount.tabIncidents")}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="profile" className="mt-4 min-h-0 flex-1 overflow-y-auto">
            <ProfileTab
              endpoint={ep.profile}
              onProfileUpdated={onProfileUpdated}
            />
          </TabsContent>

          <TabsContent value="password" className="mt-4 min-h-0 flex-1 overflow-y-auto">
            <PasswordTab endpoint={ep.changePassword} />
          </TabsContent>

          <TabsContent value="incidents" className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
            <IncidentsTab
              appSlug={appSlug}
              myIncidentsEndpoint={ep.myIncidents}
              orgAppIncidentsEndpoint={ep.orgAppIncidents}
              onClose={() => onOpenChange(false)}
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
  const { t } = useI18n();
  const router = useRouter();
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
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          throw new Error(
            apiErrorMessage(t, { status: res.status, code: errBody?.error?.code, message: errBody?.error?.message }, t("ui.userAccount.errLoadProfile")),
          );
        }
        const body = await res.json();
        const p: ProfileShape = body.data ?? body;
        if (cancelled) return;
        setProfile(p);
        setDisplayName(p.displayName ?? "");
        setLanguage(p.language ?? "CAST");
        setPhoneNumber(p.phoneNumber ?? "");
        setNif(p.nif ?? "");
      } catch (err) {
        if (!cancelled) setError((err as Error).message || t("ui.userAccount.errLoadProfile"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [endpoint, t]);

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
          throw new Error(
            apiErrorMessage(t, { status: res.status, code: body?.error?.code, message: body?.error?.message || body?.message }, t("ui.userAccount.errSave")),
          );
        }
        const body = await res.json();
        const updated: ProfileShape = body.data ?? body;
        const languageChanged = updated.language !== profile?.language;
        setProfile((prev) => (prev ? { ...prev, ...updated } : updated));
        setSavedAt(Date.now());
        onProfileUpdated?.(updated);
        // Si cambió el idioma, fuerza re-render del layout server-side: el
        // PATCH habrá sembrado la cookie `mc_lang` (lo hace el proxy de la
        // app consumer en su mismo dominio), pero los mensajes ya cargados
        // siguen en el idioma anterior hasta que el árbol RSC se reevalúa.
        if (languageChanged) {
          router.refresh();
        }
      } catch (err) {
        setError((err as Error).message || t("ui.userAccount.errSave"));
      } finally {
        setSaving(false);
      }
    },
    [displayName, endpoint, language, nif, onProfileUpdated, phoneNumber, profile?.language, router, t],
  );

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin" /> {t("ui.userAccount.loadingProfile")}
      </div>
    );
  }
  if (!profile) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
        {error || t("ui.userAccount.errLoadProfile")}
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="ua-name">{t("ui.userAccount.fieldName")}</Label>
          <Input
            id="ua-name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={255}
            required
          />
        </div>
        <div>
          <Label htmlFor="ua-lang">{t("ui.userAccount.fieldLanguage")}</Label>
          <Select value={language} onValueChange={setLanguage}>
            <SelectTrigger id="ua-lang">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LANGUAGE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {t(o.labelKey)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="ua-phone">{t("ui.userAccount.fieldPhone")}</Label>
          <Input
            id="ua-phone"
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            maxLength={20}
            placeholder="+34 600 000 000"
          />
        </div>
        <div>
          <Label htmlFor="ua-nif">{t("ui.userAccount.fieldNif")}</Label>
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
          <dt className="text-gray-500">{t("ui.userAccount.fieldEmail")}</dt>
          <dd className="font-mono">{profile.email}</dd>
          <dt className="text-gray-500">{t("ui.userAccount.fieldRole")}</dt>
          <dd>{profile.role}</dd>
          {profile.organization && (
            <>
              <dt className="text-gray-500">{t("ui.userAccount.fieldOrganization")}</dt>
              <dd>{profile.organization.name}</dd>
            </>
          )}
          <dt className="text-gray-500">{t("ui.userAccount.fieldLastLogin")}</dt>
          <dd>{formatWhen(profile.lastLogin)}</dd>
          <dt className="text-gray-500">{t("ui.userAccount.fieldPasswordChanged")}</dt>
          <dd>{formatWhen(profile.passwordChangedAt)}</dd>
        </dl>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}
      {savedAt && !error && (
        <div className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
          {t("ui.userAccount.savedOk")}
        </div>
      )}

      <div className="flex justify-end">
        <Button type="submit" disabled={saving || !displayName.trim()}>
          {saving ? (
            <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" />{t("ui.userAccount.btnSaving")}</>
          ) : (
            <><Save className="mr-1.5 h-4 w-4" />{t("ui.userAccount.btnSave")}</>
          )}
        </Button>
      </div>
    </form>
  );
}

// ────────────────────────────── Password tab ─────────────────────────────

function PasswordTab({ endpoint }: { endpoint: string }) {
  const { t } = useI18n();
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
      setError(t("ui.userAccount.errMinChars", { min: String(MIN) }));
      return;
    }
    if (next !== confirm) {
      setError(t("ui.userAccount.errMismatch"));
      return;
    }
    if (!current) {
      setError(t("ui.userAccount.errCurrentRequired"));
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
        // Soporta tres shapes: `{error:{message}}` (apps consumer),
        // `{message}` (legacy), `{error:"texto"}` (Fastify default — auth).
        const message =
          body?.error?.message || body?.message || (typeof body?.error === 'string' ? body.error : undefined);
        throw new Error(
          apiErrorMessage(t, { status: res.status, code: body?.error?.code, message }, t("ui.userAccount.errChangePassword")),
        );
      }
      setCurrent("");
      setNext("");
      setConfirm("");
      setSavedAt(Date.now());
    } catch (err) {
      setError((err as Error).message || t("ui.userAccount.errChangePassword"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <Label htmlFor="ua-current">{t("ui.userAccount.fieldCurrent")}</Label>
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
        <Label htmlFor="ua-new">{t("ui.userAccount.fieldNew")}</Label>
        <Input
          id="ua-new"
          type="password"
          autoComplete="new-password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          minLength={MIN}
          required
        />
        <p className="mt-1 text-xs text-gray-500">{t("ui.userAccount.minCharsHint", { min: String(MIN) })}</p>
      </div>
      <div>
        <Label htmlFor="ua-confirm">{t("ui.userAccount.fieldConfirm")}</Label>
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
          {t("ui.userAccount.passwordUpdated")}
        </div>
      )}

      <div className="flex justify-end">
        <Button type="submit" disabled={submitting}>
          {submitting ? (
            <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" />{t("ui.userAccount.btnSaving")}</>
          ) : (
            <><KeyRound className="mr-1.5 h-4 w-4" />{t("ui.userAccount.btnChangePassword")}</>
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
  onClose,
}: {
  appSlug: string;
  myIncidentsEndpoint: string;
  orgAppIncidentsEndpoint: string;
  /** Closes the parent dialog — fired when a row navigates away. */
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [mine, setMine] = useState<IncidentEntry[] | null>(null);
  const [others, setOthers] = useState<IncidentEntry[] | null>(null);
  // Whether the viewer may open OTHERS' threads. The backend decides this
  // (`canManage` on the org-app response) using the same rule as the admin
  // incidents panel: superadmin / org_admin / admin:users. Plain users get
  // the read-only summary only.
  const [canOpenOthers, setCanOpenOthers] = useState(false);
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
        if (!r1.ok) throw new Error(t("ui.userAccount.errMyIncidents", { status: String(r1.status) }));
        if (!r2.ok) throw new Error(t("ui.userAccount.errOtherIncidents", { status: String(r2.status) }));
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
        setCanOpenOthers(b2.canManage === true);
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [appSlug, myIncidentsEndpoint, orgAppIncidentsEndpoint, t]);

  return (
    <div className="space-y-5">
      {error && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      <Section
        title={t("ui.userAccount.sectionMine")}
        items={mine}
        emptyText={t("ui.userAccount.emptyMine")}
        showReporter={false}
        clickable
        onClose={onClose}
      />

      <Section
        title={t("ui.userAccount.sectionOthers")}
        items={others}
        emptyText={t("ui.userAccount.emptyOthers")}
        showReporter
        clickable={canOpenOthers}
        onClose={onClose}
      />

      <div className="flex justify-end">
        <Link
          href="/incidencias"
          className="inline-flex items-center gap-1 text-sm text-mc-primary-600 hover:underline"
        >
          {t("ui.userAccount.linkAllIncidents")} <ExternalLink className="h-3.5 w-3.5" />
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
  clickable,
  onClose,
}: {
  title: string;
  items: IncidentEntry[] | null;
  emptyText: string;
  showReporter: boolean;
  /** Whether rows navigate to the incident detail page on click. */
  clickable: boolean;
  /** Closes the parent dialog when a row navigates away. */
  onClose: () => void;
}) {
  const { t } = useI18n();
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</h3>
      {items === null ? (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" /> {t("ui.userAccount.loadingShort")}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-md border border-dashed border-gray-200 bg-gray-50 px-3 py-4 text-center text-xs text-gray-500">
          {emptyText}
        </div>
      ) : (
        <ul className="divide-y divide-gray-100 overflow-hidden rounded-md border border-gray-100 bg-white">
          {items.map((i) => {
            const tone = STATUS_TONES[i.status] || "bg-gray-100 text-gray-700";
            const labelKey = STATUS_LABEL_KEYS[i.status];
            const statusLabel = labelKey ? t(labelKey) : i.status;
            // The whole row is the click target so the user doesn't have to
            // aim for the tiny "#N". When not clickable (others + non-admin)
            // it stays a plain div — the detail endpoint is owner-scoped, so
            // navigating would only 404.
            const rowInner = (
              <>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`font-mono text-xs ${clickable ? "text-mc-primary-600" : "text-gray-500"}`}
                    >
                      #{i.number}
                    </span>
                    <span className={`inline-block rounded px-2 py-0.5 text-[10px] font-medium ${tone}`}>
                      {statusLabel}
                    </span>
                    {showReporter && i.reporterDisplayName && (
                      <span className="text-xs text-gray-500">· {i.reporterDisplayName}</span>
                    )}
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-gray-700">{i.description}</p>
                </div>
                <span className="shrink-0 text-xs text-gray-400">{formatWhen(i.lastActivityAt)}</span>
              </>
            );
            return (
              <li key={i.id} className="text-sm">
                {clickable ? (
                  <Link
                    href={`/incidencias/${i.number}`}
                    onClick={onClose}
                    className="flex items-start justify-between gap-3 px-3 py-2 transition-colors hover:bg-gray-50"
                  >
                    {rowInner}
                  </Link>
                ) : (
                  <div className="flex items-start justify-between gap-3 px-3 py-2">{rowInner}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
