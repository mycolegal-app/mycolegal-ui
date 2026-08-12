"use client";

import { useEffect, useMemo, useState } from "react";
import { X, ChevronLeft, ChevronRight, Plus, Loader2 } from "lucide-react";
import { cn } from "../../lib/utils";

// #558 — Bienvenida first-run. Se monta UNA vez en el app-shell de cada app
// (como <IncidentReporter/> o <MycoBotRail/>). Es autocontenido: consulta
// `/api/auth/me` para el estado de onboarding + rol, se muestra si procede, y
// marca lo visto en `/api/onboarding/seen`. El alta asistida (solo org_admin,
// una vez global) invita vía `/api/team/invite`. Todas son rutas relativas que
// cada app proxy-fea a auth, de modo que el componente no conoce URLs internas.
//
// Estado (central en auth, ver /apps/user-apps):
//   welcomeSeen: string[]      → appSlugs cuyo tour ya se vio (1 vez por app)
//   teamOnboardingSeen: bool   → alta asistida del org_admin (1 vez global)

export interface WelcomeStep {
  /** Clave estable del paso (para logs/analytics). */
  key: string;
  title: string;
  text: string;
  /** URL de la captura del elemento referido (recorte real de la app). */
  image?: string;
  /** Texto alternativo de la imagen. */
  imageAlt?: string;
}

interface MeOnboarding {
  welcomeSeen?: string[];
  teamOnboardingSeen?: boolean;
}

interface MeResponse {
  authRole?: string;
  role?: string;
  impersonatedBy?: string | null;
  onboarding?: MeOnboarding;
}

interface FirstRunWelcomeProps {
  /** Slug de esta app (ej. "consultor"): clave del flag `welcome:<appSlug>`. */
  appSlug: string;
  /** Nombre visible en la cabecera del modal (ej. "Consultor"). */
  appName: string;
  /** Marca/logo de la app (nodo ya estilizado, ej. un <img> o un badge). */
  logo?: React.ReactNode;
  /** Pasos del tour, con su captura del elemento referido. */
  steps: WelcomeStep[];
  /** Ruta para retomar el alta de usuarios si el org_admin la pospone. */
  adminUrl?: string;
}

interface InviteRow {
  displayName: string;
  email: string;
}

const BRAND_GOLD = "#b09a6e";

export function FirstRunWelcome({ appSlug, appName, logo, steps, adminUrl = "/admin" }: FirstRunWelcomeProps) {
  const [ready, setReady] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [showTeam, setShowTeam] = useState(false);
  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);
  const [rows, setRows] = useState<InviteRow[]>([
    { displayName: "", email: "" },
    { displayName: "", email: "" },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [teamDone, setTeamDone] = useState<null | "invited" | "later">(null);

  // Decide si mostrarse a partir del estado central de onboarding.
  useEffect(() => {
    let alive = true;
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!alive) return;
        const me: MeResponse = j?.data ?? {};
        // Nunca durante impersonación: contaminaría el flag del usuario real.
        if (me.impersonatedBy) return;
        const seen = me.onboarding?.welcomeSeen ?? [];
        const teamSeen = me.onboarding?.teamOnboardingSeen ?? false;
        const isOrgAdmin = (me.authRole ?? me.role) === "org_admin";
        const w = !seen.includes(appSlug);
        const t = isOrgAdmin && !teamSeen;
        setShowWelcome(w);
        setShowTeam(t);
        setOpen(w || t);
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setReady(true);
      });
    return () => {
      alive = false;
    };
  }, [appSlug]);

  // Lista efectiva de pasos: tour de la app (si no visto) + paso de equipo (si org_admin).
  const effectiveSteps = useMemo(() => {
    const list: WelcomeStep[] = [];
    if (showWelcome) list.push(...steps);
    if (showTeam) list.push({ key: "team", title: "Da de alta a tu equipo", text: "" });
    return list;
  }, [showWelcome, showTeam, steps]);

  if (!ready || !open || effectiveSteps.length === 0) return null;

  const current = effectiveSteps[Math.min(i, effectiveSteps.length - 1)];
  const isTeamStep = current.key === "team";
  const isLast = i === effectiveSteps.length - 1;

  async function mark(key: string) {
    try {
      await fetch("/api/onboarding/seen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
      });
    } catch {
      /* best-effort: si falla, como mucho reaparece el tour */
    }
  }

  async function finishAll(invite: boolean) {
    setSubmitting(true);
    try {
      if (invite) {
        const people = rows
          .map((r) => ({ displayName: r.displayName.trim(), email: r.email.trim() }))
          .filter((r) => r.displayName && r.email);
        if (people.length > 0) {
          try {
            await fetch("/api/team/invite", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ people }),
            });
            setTeamDone("invited");
          } catch {
            setTeamDone("later");
          }
        } else {
          setTeamDone("later");
        }
      } else if (showTeam) {
        setTeamDone("later");
      }
      if (showWelcome) await mark(`welcome:${appSlug}`);
      if (showTeam) await mark("team-onboarding");
    } finally {
      setSubmitting(false);
      // Pequeña pausa para que se vea el acuse del alta.
      setTimeout(() => setOpen(false), showTeam ? 900 : 0);
      if (!showTeam) setOpen(false);
    }
  }

  function next() {
    if (isLast) {
      finishAll(isTeamStep);
    } else {
      setI((n) => n + 1);
    }
  }
  function prev() {
    setI((n) => Math.max(0, n - 1));
  }
  function skip() {
    // "Omitir" / "Ahora no": marca todo como visto sin invitar.
    finishAll(false);
  }

  const primaryLabel = isLast
    ? isTeamStep
      ? "Enviar invitaciones"
      : `Empezar a usar ${appName}`
    : "Siguiente";

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/55 p-4 backdrop-blur-[2px]">
      <div className="flex w-full max-w-[500px] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">
        {/* Franja de marca (oro canónico) */}
        <div className="h-1" style={{ background: `linear-gradient(90deg, ${BRAND_GOLD}, #d8c9a6)` }} />

        {/* Cabecera: logo + nombre de app + omitir */}
        <div className="flex items-center gap-3 px-5 pb-1 pt-4">
          {logo ?? (
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-cyan-600 font-bold text-white">
              {appName.charAt(0)}
            </span>
          )}
          <div className="min-w-0">
            <div className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Te damos la bienvenida a</div>
            <div className="truncate text-[15px] font-bold tracking-tight text-gray-900">MycoLegal · {appName}</div>
          </div>
          <button
            type="button"
            onClick={skip}
            disabled={submitting}
            className="ml-auto flex items-center gap-1 rounded-md px-2 py-1 text-xs text-gray-400 hover:text-gray-600"
          >
            {isTeamStep ? "Ahora no" : "Omitir"} <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Escenario: captura del elemento o formulario de alta */}
        <div className="relative mx-5 mt-3 h-[204px] overflow-hidden rounded-xl border border-gray-200 bg-gray-50">
          {isTeamStep ? (
            <TeamForm rows={rows} setRows={setRows} done={teamDone} />
          ) : current.image ? (
            <img
              src={current.image}
              alt={current.imageAlt ?? current.title}
              className="h-full w-full object-contain"
            />
          ) : (
            <div className="flex h-full items-center justify-center gap-3">
              {logo ?? (
                <span className="grid h-14 w-14 place-items-center rounded-2xl bg-cyan-600 text-2xl font-bold text-white">
                  {appName.charAt(0)}
                </span>
              )}
              <div>
                <div className="text-[15px] font-bold text-gray-900">{appName}</div>
                <div className="text-[12.5px] text-gray-500">by MycoLegal</div>
              </div>
            </div>
          )}
        </div>

        {/* Texto del paso */}
        <div className="px-5 pb-1 pt-3">
          <h2 className="text-[17px] font-bold tracking-tight text-gray-900" style={{ textWrap: "balance" as never }}>
            {current.title}
          </h2>
          <p className="mt-1 max-w-[52ch] text-[13.5px] text-gray-600">
            {isTeamStep
              ? teamDone === "invited"
                ? "Invitaciones enviadas. Podrás gestionar accesos y roles en Administración cuando quieras."
                : "Son tus oficiales y tramitadores quienes más aprovechan la herramienta. Invítalos ahora (opcional) o retómalo cuando quieras desde Administración → Invitar usuario."
              : current.text}
          </p>
        </div>

        {/* Pie: dots + navegación */}
        <div className="mt-auto flex items-center gap-3 px-5 pb-5 pt-3">
          <div className="flex gap-1.5">
            {effectiveSteps.map((s, idx) => (
              <button
                key={s.key + idx}
                type="button"
                aria-label={`Paso ${idx + 1}`}
                onClick={() => setI(idx)}
                className={cn(
                  "h-2 rounded-full transition-all",
                  idx === i ? "w-5 bg-cyan-600" : "w-2 bg-gray-300 hover:bg-gray-400",
                )}
              />
            ))}
          </div>
          <span className="flex-1" />
          {i > 0 && (
            <button
              type="button"
              onClick={prev}
              disabled={submitting}
              className="inline-flex h-9 items-center gap-1 rounded-lg border border-gray-200 px-3 text-[13px] font-semibold text-gray-700 hover:bg-gray-50"
            >
              <ChevronLeft className="h-4 w-4" /> Anterior
            </button>
          )}
          <button
            type="button"
            onClick={next}
            disabled={submitting}
            className="inline-flex h-9 items-center gap-1 rounded-lg bg-cyan-600 px-4 text-[13px] font-semibold text-white hover:bg-cyan-700 disabled:opacity-50"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {primaryLabel}
            {!isLast && <ChevronRight className="h-4 w-4" />}
          </button>
        </div>

        {isTeamStep && (
          <div className="px-5 pb-4 -mt-2 text-[11.5px] text-gray-400">
            ¿Prefieres hacerlo luego?{" "}
            <a href={adminUrl} className="font-semibold text-cyan-700 hover:underline">
              Administración → Invitar usuario
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

function TeamForm({
  rows,
  setRows,
  done,
}: {
  rows: InviteRow[];
  setRows: React.Dispatch<React.SetStateAction<InviteRow[]>>;
  done: null | "invited" | "later";
}) {
  if (done === "invited") {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center">
        <p className="text-[13.5px] font-semibold text-cyan-700">✓ Invitaciones enviadas a tu equipo</p>
      </div>
    );
  }
  function update(idx: number, field: keyof InviteRow, value: string) {
    setRows((prev) => prev.map((r, k) => (k === idx ? { ...r, [field]: value } : r)));
  }
  return (
    <div className="flex h-full flex-col gap-2 overflow-auto p-3">
      <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Alta asistida · opcional</span>
      {rows.map((r, idx) => (
        <div key={idx} className="grid grid-cols-[1fr_1.3fr] gap-1.5">
          <input
            value={r.displayName}
            onChange={(e) => update(idx, "displayName", e.target.value)}
            placeholder="Nombre y apellidos"
            className="h-8 min-w-0 rounded-lg border border-gray-200 px-2 text-[12px] outline-none focus:border-cyan-500"
          />
          <input
            value={r.email}
            onChange={(e) => update(idx, "email", e.target.value)}
            placeholder="email@despacho.com"
            type="email"
            className="h-8 min-w-0 rounded-lg border border-gray-200 px-2 text-[12px] outline-none focus:border-cyan-500"
          />
        </div>
      ))}
      <button
        type="button"
        onClick={() => setRows((prev) => [...prev, { displayName: "", email: "" }])}
        className="inline-flex h-7 items-center justify-center gap-1 rounded-lg border border-dashed border-gray-300 text-[12px] text-gray-500 hover:border-cyan-400 hover:text-cyan-700"
      >
        <Plus className="h-3.5 w-3.5" /> Añadir otra persona
      </button>
      <span className="text-[11px] text-gray-400">Se les enviará una invitación por email para crear su acceso.</span>
    </div>
  );
}
