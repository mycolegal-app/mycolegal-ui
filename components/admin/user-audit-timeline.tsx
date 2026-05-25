"use client";

/**
 * Timeline cronológico unificado de un usuario dentro de su organización.
 *
 * Combina dos fuentes que vienen del endpoint
 * `GET ${apiBase}/permissions/{authUserId}/audit`:
 *   - AuditLog (login/logout/app access/cambios de permisos)
 *   - MailOutboundLog (envíos de correo de plataforma con su estado real
 *     reportado por Resend vía webhook)
 *
 * Diseñado para vivir como tercera pestaña del `UserPermissionsModal`.
 * Lazy: solo dispara el fetch cuando se activa la pestaña (controla el
 * caller via `enabled`).
 */

import { useEffect, useState } from 'react';
import {
  Loader2,
  LogIn,
  LogOut,
  Clock4,
  ShieldCheck,
  Mail,
  MailCheck,
  MailX,
  MousePointerClick,
  Eye,
  AlertTriangle,
  History,
} from 'lucide-react';
import { Badge } from '../ui/badge';
import { useI18n } from '../i18n/i18n-context';
import { apiErrorMessage } from '../../lib/api-error';

interface AuthTimelineEntry {
  kind: 'auth';
  id: string;
  at: string;
  action: string;
  appSlug: string | null;
  sessionId: string | null;
  targetType: string | null;
  targetId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: unknown;
}

interface MailTimelineEntry {
  kind: 'mail';
  id: string;
  at: string;
  mailKind: string;
  status: string;
  subject: string | null;
  appSlug: string | null;
  eventKey: string | null;
  toAddress: string;
  sentAt: string | null;
  deliveredAt: string | null;
  bouncedAt: string | null;
  bounceReason: string | null;
  complainedAt: string | null;
  firstOpenedAt: string | null;
  lastOpenedAt: string | null;
  openCount: number;
  firstClickedAt: string | null;
  lastClickedAt: string | null;
  clickCount: number;
  lastClickedUrl: string | null;
  error: string | null;
}

type TimelineEntry = AuthTimelineEntry | MailTimelineEntry;

type Category = 'all' | 'auth' | 'mail';

export interface UserAuditTimelineProps {
  apiBase: string;
  authUserId: string;
  /** Solo dispara el fetch cuando la pestaña esté activa. */
  enabled: boolean;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function actionIcon(action: string) {
  const a = action.toUpperCase();
  if (a === 'LOGIN_SUCCESS') return <LogIn className="h-4 w-4 text-emerald-600" />;
  if (a === 'LOGIN_FAILED') return <AlertTriangle className="h-4 w-4 text-red-600" />;
  if (a === 'LOGOUT' || a === 'SESSION_TIMEOUT') return <LogOut className="h-4 w-4 text-slate-500" />;
  if (a === 'APP_ACCESS') return <Clock4 className="h-4 w-4 text-blue-500" />;
  return <ShieldCheck className="h-4 w-4 text-violet-500" />;
}

function mailIcon(status: string) {
  const s = status.toUpperCase();
  if (s === 'BOUNCED' || s === 'COMPLAINED' || s === 'FAILED') return <MailX className="h-4 w-4 text-red-600" />;
  if (s === 'DELIVERED' || s === 'SENT') return <MailCheck className="h-4 w-4 text-emerald-600" />;
  return <Mail className="h-4 w-4 text-slate-500" />;
}

function mailStatusVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  const s = status.toUpperCase();
  if (s === 'DELIVERED') return 'default';
  if (s === 'SENT' || s === 'PENDING') return 'secondary';
  if (s === 'BOUNCED' || s === 'COMPLAINED' || s === 'FAILED') return 'destructive';
  return 'outline';
}

function mailKindLabel(kind: string): string {
  const map: Record<string, string> = {
    USER_INVITATION: 'Invitación',
    EXTERNAL_USER_INVITATION: 'Invitación externa',
    ADMIN_INVITATION: 'Invitación admin',
    PASSWORD_RESET: 'Reset contraseña',
    WELCOME: 'Bienvenida',
    TEST_EMAIL: 'Prueba',
    INCIDENT_REPLY: 'Respuesta incidencia',
    INCIDENT_CLOSED: 'Incidencia cerrada',
    MAINTENANCE_NOTICE: 'Mantenimiento',
    TEMPLATE_EVENT: 'Plantilla',
    ADHOC: 'Ad-hoc',
  };
  return map[kind] ?? kind;
}

function authActionLabel(action: string): string {
  const map: Record<string, string> = {
    LOGIN_SUCCESS: 'Inicio de sesión',
    LOGIN_FAILED: 'Intento fallido',
    LOGOUT: 'Cierre de sesión',
    SESSION_TIMEOUT: 'Sesión expirada',
    APP_ACCESS: 'Acceso a app',
    SUPERADMIN_INVITED: 'Superadmin invitado',
    SUPERADMIN_INVITATION_RESENT: 'Invitación reenviada',
    SUPERADMIN_SUSPENDED: 'Superadmin suspendido',
    SUPERADMIN_REACTIVATED: 'Superadmin reactivado',
    SUPERADMIN_UPDATED: 'Superadmin actualizado',
  };
  return map[action.toUpperCase()] ?? action;
}

export function UserAuditTimeline({ apiBase, authUserId, enabled }: UserAuditTimelineProps) {
  const { t } = useI18n();
  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState<Category>('all');
  const [hasFetched, setHasFetched] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    const qp = new URLSearchParams({ category, limit: '100' });
    fetch(`${apiBase}/permissions/${authUserId}/audit?${qp.toString()}`, {
      credentials: 'include',
    })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(
            apiErrorMessage(t, { status: res.status, code: body?.error?.code, message: body?.error?.message }, t('ui.errors.generic')),
          );
        }
        const body = await res.json();
        // The endpoint may wrap in { data: { data: [...] } } or { data: [...] }.
        const raw = body?.data;
        const list: TimelineEntry[] = Array.isArray(raw)
          ? raw
          : Array.isArray(raw?.data)
            ? raw.data
            : [];
        if (!cancelled) {
          setEntries(list);
          setHasFetched(true);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message || t('ui.errors.generic'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, apiBase, authUserId, category]);

  const chips: Array<{ key: Category; label: string }> = [
    { key: 'all', label: t('ui.usersAdmin.auditFilterAll') },
    { key: 'auth', label: t('ui.usersAdmin.auditFilterSessions') },
    { key: 'mail', label: t('ui.usersAdmin.auditFilterMails') },
  ];

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-2 mb-3">
        {chips.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => setCategory(c.key)}
            className={`px-2.5 py-1 rounded-md text-xs border transition-colors ${
              category === c.key
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background text-muted-foreground border-input hover:bg-muted'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto pr-1 -mr-1">
        {loading ? (
          <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            {t('ui.usersAdmin.auditLoading')}
          </div>
        ) : error ? (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        ) : hasFetched && entries.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            <History className="h-5 w-5 mx-auto mb-2 text-muted-foreground" />
            {t('ui.usersAdmin.auditEmpty')}
          </div>
        ) : (
          <ol className="relative border-l border-mc-neutral-200 ml-2">
            {entries.map((e) => (
              <li key={`${e.kind}-${e.id}`} className="ml-4 mb-3">
                <span className="absolute -left-[7px] flex h-3.5 w-3.5 items-center justify-center rounded-full bg-background ring-1 ring-mc-neutral-200" />
                {e.kind === 'auth' ? (
                  <AuthRow entry={e} />
                ) : (
                  <MailRow entry={e} />
                )}
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

function AuthRow({ entry }: { entry: AuthTimelineEntry }) {
  return (
    <div className="rounded-md border bg-background p-2.5">
      <div className="flex items-center gap-2">
        {actionIcon(entry.action)}
        <span className="text-sm font-medium">{authActionLabel(entry.action)}</span>
        {entry.appSlug && (
          <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
            {entry.appSlug}
          </Badge>
        )}
        <span className="ml-auto text-[11px] text-muted-foreground" title={entry.at}>
          {formatDateTime(entry.at)}
        </span>
      </div>
      {(entry.ipAddress || entry.sessionId) && (
        <div className="mt-1 text-[11px] text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5">
          {entry.ipAddress && <span>IP: {entry.ipAddress}</span>}
          {entry.sessionId && <span>Sesión: {entry.sessionId.slice(0, 8)}</span>}
        </div>
      )}
    </div>
  );
}

function MailRow({ entry }: { entry: MailTimelineEntry }) {
  const showOpens = entry.openCount > 0;
  const showClicks = entry.clickCount > 0;
  return (
    <div className="rounded-md border bg-background p-2.5">
      <div className="flex items-center gap-2">
        {mailIcon(entry.status)}
        <span className="text-sm font-medium">{mailKindLabel(entry.mailKind)}</span>
        <Badge variant={mailStatusVariant(entry.status)} className="text-[10px] uppercase">
          {entry.status}
        </Badge>
        {entry.appSlug && (
          <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
            {entry.appSlug}
          </Badge>
        )}
        <span className="ml-auto text-[11px] text-muted-foreground" title={entry.at}>
          {formatDateTime(entry.at)}
        </span>
      </div>
      {entry.subject && (
        <div className="mt-1 text-xs text-foreground truncate" title={entry.subject}>
          {entry.subject}
        </div>
      )}
      <div className="mt-1 text-[11px] text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5">
        <span>{entry.toAddress}</span>
        {entry.deliveredAt && <span title={entry.deliveredAt}>Entregado: {formatDateTime(entry.deliveredAt)}</span>}
        {entry.bouncedAt && (
          <span className="text-red-600" title={entry.bounceReason || ''}>
            Rebote{entry.bounceReason ? `: ${entry.bounceReason.slice(0, 80)}` : ''}
          </span>
        )}
        {showOpens && (
          <span className="inline-flex items-center gap-1">
            <Eye className="h-3 w-3" />
            {entry.openCount}
          </span>
        )}
        {showClicks && (
          <span className="inline-flex items-center gap-1">
            <MousePointerClick className="h-3 w-3" />
            {entry.clickCount}
          </span>
        )}
        {entry.error && <span className="text-red-600">{entry.error.slice(0, 100)}</span>}
      </div>
    </div>
  );
}
