"use client";

import { useEffect, useState, type FormEvent } from "react";
import { cn } from "../../lib/utils";

interface SetPasswordFormProps {
  /** App display name shown in the header (e.g. "Notaría"). */
  appName: string;
  /** Optional SVG logo markup (dangerouslySetInnerHTML). */
  appLogoSvg?: string;
  /** Optional logo image URL (alternative to SVG). */
  appLogoUrl?: string;
  /** Brand accent color class for visual highlights. */
  accentClass?: string;
  /** Subtitle copy shown below the app name on the left panel. */
  subtitle?: string;
  /** Hero image URL for the left branding panel. */
  heroImageUrl?: string;
  /** Optional bullet points shown on the left branding panel. */
  features?: string[];
  /**
   * Activation token from the email link. Falls back to reading ?token=
   * from window.location.search so pages can skip wiring it if they prefer.
   */
  token?: string;
  /** API endpoint that proxies to auth's POST /auth/set-password. */
  endpoint?: string;
  /** Minimum password length enforced client-side. Server is authoritative. */
  minLength?: number;
  /** Path to redirect to on success (typically the app's /login). */
  redirectTo?: string;
  /** Heading shown above the form — defaults to activation copy. */
  formTitle?: string;
  /** Paragraph under the heading. */
  formSubtitle?: string;
  /** Submit button label. */
  submitLabel?: string;
  /** Copy shown on the success screen before the redirect fires. */
  successTitle?: string;
  /** Version footer (same shape as LoginForm). */
  versionInfo?: { platform?: string; ui?: string };
}

export function SetPasswordForm({
  appName,
  appLogoSvg,
  appLogoUrl,
  accentClass = "text-mc-primary-400",
  subtitle,
  heroImageUrl,
  features,
  token: tokenProp,
  endpoint = "/api/auth/set-password",
  minLength = 12,
  redirectTo = "/login",
  formTitle,
  formSubtitle,
  submitLabel,
  successTitle,
  versionInfo,
}: SetPasswordFormProps) {
  const [token, setToken] = useState<string | null>(tokenProp ?? null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  // Read the token from the URL as a convenience for pages that just mount
  // the form without wiring params explicitly. Client-side only so SSR is
  // unaffected.
  useEffect(() => {
    if (tokenProp) return;
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const t = params.get("token");
    if (t) setToken(t);
  }, [tokenProp]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (!token) {
      setError("Falta el token de activación. Abre el enlace del email otra vez.");
      return;
    }
    if (password.length < minLength) {
      setError(`La contraseña debe tener al menos ${minLength} caracteres.`);
      return;
    }
    if (password !== confirm) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({} as Record<string, unknown>));
        const msg =
          (data as { error?: { message?: string }; message?: string })?.error?.message ??
          (data as { message?: string })?.message ??
          "No se pudo establecer la contraseña. El enlace puede haber expirado.";
        setError(msg);
        return;
      }
      setDone(true);
      // Brief pause so the user reads the success copy before we navigate.
      setTimeout(() => {
        window.location.href = redirectTo;
      }, 1500);
    } catch {
      setError("Error de red. Vuelve a intentarlo.");
    } finally {
      setLoading(false);
    }
  }

  const desktopLogoElement = appLogoSvg ? (
    <div
      className="h-12 w-12 flex items-center justify-center"
      dangerouslySetInnerHTML={{ __html: appLogoSvg }}
    />
  ) : appLogoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={appLogoUrl} alt="" className="h-12 w-12 object-contain" />
  ) : null;

  const mobileLogoElement = appLogoSvg ? (
    <div
      className="h-10 w-10 flex items-center justify-center"
      dangerouslySetInnerHTML={{ __html: appLogoSvg }}
    />
  ) : appLogoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={appLogoUrl} alt="" className="h-10 w-10 object-contain" />
  ) : null;

  return (
    <div className="flex min-h-screen bg-mc-neutral-50">
      {/* Left branding panel — mirrors LoginForm so the invite flow feels
          continuous. Hidden on mobile to keep the form centered. */}
      <div className="hidden lg:flex flex-1 flex-col justify-between bg-mc-navy-900 relative overflow-hidden">
        {heroImageUrl && (
          <div
            className="absolute inset-0 opacity-10 bg-cover bg-center"
            style={{ backgroundImage: `url(${heroImageUrl})` }}
          />
        )}
        <div className="relative z-10 px-12 py-12 flex items-center gap-4">
          {desktopLogoElement}
          <div>
            <h1 className="text-3xl font-bold text-white">
              <span className={accentClass}>{appName}</span>
            </h1>
            {subtitle && <p className="mt-2 text-sm text-mc-slate-300 max-w-md">{subtitle}</p>}
          </div>
        </div>

        <div className="relative z-10 px-12 flex-1 flex flex-col justify-center">
          {features && features.length > 0 && (
            <ul className="space-y-4 max-w-md">
              {features.map((feat) => (
                <li key={feat} className="flex items-start gap-3 text-mc-slate-200">
                  <svg className={cn("h-5 w-5 shrink-0", accentClass)} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  {feat}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="relative z-10 px-12 py-6 border-t border-white/10">
          <p className="text-xs text-mc-slate-500">
            Una aplicación de la plataforma{" "}
            <span className="text-mc-slate-400 font-medium">MycoLegal.app</span>
          </p>
          <p className="text-xs text-mc-slate-600 mt-1">
            &copy; {new Date().getFullYear()} MycoLegalTech S.A.
          </p>
          {versionInfo && (
            <p
              className="text-[10px] text-mc-slate-700 mt-2 font-mono"
              data-testid="version-info"
              data-version-platform={versionInfo.platform}
              data-version-ui={versionInfo.ui}
            >
              {versionInfo.platform && <>v{versionInfo.platform}</>}
              {versionInfo.platform && versionInfo.ui && <> · </>}
              {versionInfo.ui && <>ui {versionInfo.ui}</>}
            </p>
          )}
        </div>
      </div>

      {/* Right panel — the form itself. */}
      <div className="flex flex-1 flex-col items-center justify-center px-6 bg-mc-neutral-50 relative">
        <div className="w-full max-w-sm">
          <div className="flex items-center gap-3 mb-8 lg:hidden">
            {mobileLogoElement}
            <span className="text-xl font-semibold text-mc-slate-900">{appName}</span>
          </div>

          {done ? (
            <>
              <h2 className="text-2xl font-bold text-mc-slate-900">
                {successTitle ?? "Contraseña establecida"}
              </h2>
              <p className="mt-3 text-sm text-mc-slate-500">
                Te estamos llevando a la pantalla de acceso…
              </p>
            </>
          ) : (
            <>
              <h2 className="text-2xl font-bold text-mc-slate-900">
                {formTitle ?? "Establece tu contraseña"}
              </h2>
              <p className="mt-2 text-sm text-mc-slate-500">
                {formSubtitle ?? <>Elige una contraseña para tu cuenta en <strong>{appName}</strong>.</>}
              </p>

              {error && (
                <div
                  role="alert"
                  className="mt-4 rounded-lg bg-mc-error-50 border border-mc-error-500/30 px-4 py-3 text-sm text-mc-error-700"
                >
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-mc-slate-700" htmlFor="new-password">
                    Nueva contraseña
                  </label>
                  <input
                    id="new-password"
                    type="password"
                    required
                    autoComplete="new-password"
                    minLength={minLength}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="mt-1 block w-full rounded-lg border border-mc-neutral-300 px-3 py-2 text-sm focus:border-mc-primary-500 focus:outline-none focus:ring-1 focus:ring-mc-primary-500"
                  />
                  <p className="mt-1 text-xs text-mc-slate-500">
                    Mínimo {minLength} caracteres.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-mc-slate-700" htmlFor="confirm-password">
                    Confirma la contraseña
                  </label>
                  <input
                    id="confirm-password"
                    type="password"
                    required
                    autoComplete="new-password"
                    minLength={minLength}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    className="mt-1 block w-full rounded-lg border border-mc-neutral-300 px-3 py-2 text-sm focus:border-mc-primary-500 focus:outline-none focus:ring-1 focus:ring-mc-primary-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading || !token}
                  className="w-full rounded-lg bg-mc-primary-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-mc-primary-600 transition-colors disabled:opacity-50"
                >
                  {loading ? "Guardando…" : (submitLabel ?? "Establecer contraseña")}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
