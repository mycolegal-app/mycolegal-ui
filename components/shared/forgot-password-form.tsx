"use client";

import { useState, type FormEvent } from "react";
import { cn } from "../../lib/utils";

interface ForgotPasswordFormProps {
  /** App display name shown in the header. */
  appName: string;
  /** Optional SVG logo markup. */
  appLogoSvg?: string;
  /** Optional logo image URL. */
  appLogoUrl?: string;
  /** Brand accent color class for visual highlights. */
  accentClass?: string;
  /** Subtitle copy shown below the app name on the left panel. */
  subtitle?: string;
  /** Hero image URL for the left branding panel. */
  heroImageUrl?: string;
  /** Optional bullet points shown on the left branding panel. */
  features?: string[];
  /** API endpoint that proxies to auth's POST /auth/reset-password/request. */
  endpoint?: string;
  /** Path to go back to (defaults to /login). */
  loginPath?: string;
  /** Version footer. */
  versionInfo?: { platform?: string; ui?: string };
}

/**
 * The "I forgot my password" entry point. One input (email), one submit,
 * and a neutral success message that does not reveal whether the address
 * exists — security-sensitive flow, so we never 404 or differentiate.
 */
export function ForgotPasswordForm({
  appName,
  appLogoSvg,
  appLogoUrl,
  accentClass = "text-mc-primary-400",
  subtitle,
  heroImageUrl,
  features,
  endpoint = "/api/auth/reset-password/request",
  loginPath = "/login",
  versionInfo,
}: ForgotPasswordFormProps) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      // Success is "accepted" regardless of whether the email exists —
      // avoids exposing account enumeration.
      if (!res.ok && res.status !== 202 && res.status !== 200) {
        setError("No se pudo procesar la solicitud. Vuelve a intentarlo.");
        return;
      }
      setSent(true);
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

      <div className="flex flex-1 flex-col items-center justify-center px-6 bg-mc-neutral-50 relative">
        <div className="w-full max-w-sm">
          <div className="flex items-center gap-3 mb-8 lg:hidden">
            {mobileLogoElement}
            <span className="text-xl font-semibold text-mc-slate-900">{appName}</span>
          </div>

          {sent ? (
            <>
              <h2 className="text-2xl font-bold text-mc-slate-900">Revisa tu correo</h2>
              <p className="mt-3 text-sm text-mc-slate-500">
                Si ese email está en nuestro sistema, acabas de recibir un enlace para
                restablecer tu contraseña. El enlace caduca en 1 hora.
              </p>
              <a
                href={loginPath}
                className="mt-6 inline-block text-sm text-mc-slate-500 hover:text-mc-slate-700 transition-colors"
              >
                ← Volver al login
              </a>
            </>
          ) : (
            <>
              <h2 className="text-2xl font-bold text-mc-slate-900">Restablecer contraseña</h2>
              <p className="mt-2 text-sm text-mc-slate-500">
                Introduce el email de tu cuenta y te enviaremos un enlace para elegir una
                nueva contraseña.
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
                  <label className="block text-sm font-medium text-mc-slate-700" htmlFor="forgot-email">
                    Email
                  </label>
                  <input
                    id="forgot-email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="mt-1 block w-full rounded-lg border border-mc-neutral-300 px-3 py-2 text-sm focus:border-mc-primary-500 focus:outline-none focus:ring-1 focus:ring-mc-primary-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-lg bg-mc-primary-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-mc-primary-600 transition-colors disabled:opacity-50"
                >
                  {loading ? "Enviando…" : "Enviar enlace"}
                </button>
              </form>

              <a
                href={loginPath}
                className="mt-4 block text-center text-sm text-mc-slate-500 hover:text-mc-slate-700 transition-colors"
              >
                ← Volver al login
              </a>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
