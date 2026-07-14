"use client";

import { useEffect, useState, type FormEvent } from "react";
import { cn } from "../../lib/utils";
import { useI18n } from "../i18n/i18n-context";

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
  versionInfo?: { platform?: string; ui?: string; sharedlib?: string };
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
  const { t } = useI18n();
  const [token, setToken] = useState<string | null>(tokenProp ?? null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  // Ver lo que se teclea: es una contraseña nueva, sin repetir en ningún sitio,
  // y a ciegas se falla. Cada campo lleva su propio interruptor.
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
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
    const tk = params.get("token");
    if (tk) setToken(tk);
  }, [tokenProp]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (!token) {
      setError(t("ui.setPassword.errMissingToken"));
      return;
    }
    if (password.length < minLength) {
      setError(t("ui.setPassword.errMinLength", { min: String(minLength) }));
      return;
    }
    // Espejo de `passwordSchema` en auth (≥8 + mayúscula + minúscula + dígito).
    // Sin esto el form solo comprobaba la longitud y dejaba enviar contraseñas
    // que el servidor rechazaba con un 400 genérico, dejando al usuario sin
    // saber qué corregir.
    if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
      setError(t("ui.setPassword.errComplexity"));
      return;
    }
    if (password !== confirm) {
      setError(t("ui.setPassword.errMismatch"));
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
        // El backend distingue por qué falla el token (caducado, sustituido por
        // un reenvío posterior, ya usado, inexistente) vía `code`. Lo mapeamos a
        // un mensaje concreto para que el usuario sepa qué hacer en vez de leer
        // siempre "el enlace puede haber expirado".
        const codeKey: Record<string, string> = {
          token_superseded: "ui.setPassword.errSuperseded",
          token_expired: "ui.setPassword.errExpired",
          token_used: "ui.setPassword.errUsed",
          token_not_found: "ui.setPassword.errNotFound",
        };
        const code = (data as { code?: string })?.code;
        // Auth devuelve los fallos de validación Zod como
        // `{ error: "Validation error", details: [{ path, message }] }`, SIN
        // `code` y con `error` como string (no objeto). En este form el único
        // campo validado es la contraseña, así que un fallo de validación =
        // no cumple los requisitos de complejidad. Lo mapeamos a un mensaje
        // claro en el idioma del usuario en vez de exponer el texto del backend
        // (que viene en inglés) o caer al genérico "el enlace puede haber
        // expirado", que despista cuando el problema es la contraseña.
        const hasValidationDetails =
          Array.isArray((data as { details?: unknown })?.details) ||
          (data as { error?: unknown })?.error === "Validation error";
        const msg =
          (code && codeKey[code] ? t(codeKey[code]) : undefined) ??
          (hasValidationDetails ? t("ui.setPassword.errComplexity") : undefined) ??
          (data as { error?: { message?: string }; message?: string })?.error?.message ??
          (data as { message?: string })?.message ??
          t("ui.setPassword.errSet");
        setError(msg);
        return;
      }
      setDone(true);
      // Brief pause so the user reads the success copy before we navigate.
      setTimeout(() => {
        window.location.href = redirectTo;
      }, 1500);
    } catch {
      setError(t("ui.forgotPassword.errNetwork"));
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
            {t("ui.login.platformPrefix")}{" "}
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
              data-version-sharedlib={versionInfo.sharedlib}
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
                {successTitle ?? t("ui.setPassword.successTitle")}
              </h2>
              <p className="mt-3 text-sm text-mc-slate-500">
                {t("ui.setPassword.redirecting")}
              </p>
            </>
          ) : (
            <>
              <h2 className="text-2xl font-bold text-mc-slate-900">
                {formTitle ?? t("ui.setPassword.title")}
              </h2>
              <p className="mt-2 text-sm text-mc-slate-500">
                {formSubtitle ?? <>{t("ui.setPassword.subtitleBefore")} <strong>{appName}</strong>{t("ui.setPassword.subtitleAfter")}</>}
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
                    {t("ui.userAccount.fieldNew")}
                  </label>
                  <div className="relative mt-1">
                    <input
                      id="new-password"
                      type={showPassword ? "text" : "password"}
                      required
                      autoComplete="new-password"
                      minLength={minLength}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="block w-full rounded-lg border border-mc-neutral-300 bg-white px-3 py-2 pr-10 text-sm text-mc-slate-900 focus:border-mc-primary-500 focus:outline-none focus:ring-1 focus:ring-mc-primary-500"
                    />
                    <PasswordToggle
                      shown={showPassword}
                      onToggle={() => setShowPassword((v) => !v)}
                      label={t(showPassword ? "ui.setPassword.hide" : "ui.setPassword.show")}
                    />
                  </div>
                  <p className="mt-1 text-xs text-mc-slate-500">
                    {t("ui.setPassword.reqHint", { min: String(minLength) })}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-mc-slate-700" htmlFor="confirm-password">
                    {t("ui.setPassword.fieldConfirm")}
                  </label>
                  <div className="relative mt-1">
                    <input
                      id="confirm-password"
                      type={showConfirm ? "text" : "password"}
                      required
                      autoComplete="new-password"
                      minLength={minLength}
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      className="block w-full rounded-lg border border-mc-neutral-300 bg-white px-3 py-2 pr-10 text-sm text-mc-slate-900 focus:border-mc-primary-500 focus:outline-none focus:ring-1 focus:ring-mc-primary-500"
                    />
                    <PasswordToggle
                      shown={showConfirm}
                      onToggle={() => setShowConfirm((v) => !v)}
                      label={t(showConfirm ? "ui.setPassword.hide" : "ui.setPassword.show")}
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading || !token}
                  className="w-full rounded-lg bg-mc-primary-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-mc-primary-600 transition-colors disabled:opacity-50"
                >
                  {loading ? t("ui.userAccount.btnSaving") : (submitLabel ?? t("ui.setPassword.btnSet"))}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** Interruptor de visibilidad («el ojo») que se superpone a un campo de contraseña. */
function PasswordToggle({
  shown,
  onToggle,
  label,
}: {
  shown: boolean;
  onToggle: () => void;
  label: string;
}) {
  // tabIndex -1: el tabulador debe saltar de contraseña a confirmación sin pasar
  // por el ojo, que se acciona con el ratón.
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={label}
      title={label}
      tabIndex={-1}
      className="absolute inset-y-0 right-0 flex items-center px-3 text-mc-slate-400 hover:text-mc-slate-600 transition-colors"
    >
      {shown ? (
        <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
        </svg>
      ) : (
        <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.964-7.178z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      )}
    </button>
  );
}
