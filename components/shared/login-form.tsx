"use client";

import { useState, type FormEvent } from "react";
import { cn } from "../../lib/utils";

interface Organization {
  id: string;
  name: string;
  slug: string;
}

interface LoginFormProps {
  /** App display name shown in the header */
  appName: string;
  /** Optional SVG logo markup (dangerouslySetInnerHTML) */
  appLogoSvg?: string;
  /** Optional logo image URL (alternative to SVG) */
  appLogoUrl?: string;
  /** App accent color class for the brand highlight, e.g. "text-mc-primary-400" */
  accentClass?: string;
  /** Subtitle shown below the app name */
  subtitle?: string;
  /** Optional hero image URL shown on the left branding panel */
  heroImageUrl?: string;
  /** Optional bullet points shown on the left branding panel */
  features?: string[];
  /** API endpoint to POST credentials to (defaults to /api/auth/login) */
  loginEndpoint?: string;
  /** URL to redirect to after successful login */
  redirectTo?: string;
  /** Callback after successful login (alternative to redirectTo) */
  onSuccess?: (data: { token: string; user: Record<string, unknown> }) => void;
}

export function LoginForm({
  appName,
  appLogoSvg,
  appLogoUrl,
  accentClass = "text-mc-primary-400",
  subtitle,
  heroImageUrl,
  features,
  loginEndpoint = "/api/auth/login",
  redirectTo = "/",
  onSuccess,
}: LoginFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Org selection state (superadmin flow)
  const [orgs, setOrgs] = useState<Organization[] | null>(null);
  const [selectToken, setSelectToken] = useState<string | null>(null);
  const [userName, setUserName] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch(loginEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error?.message || "Error de autenticación");
        return;
      }

      // Superadmin with multiple orgs — show selector
      if (data.requiresOrgSelection) {
        setOrgs(data.organizations);
        setSelectToken(data.selectToken);
        setUserName(data.user?.displayName || "");
        return;
      }

      if (onSuccess) {
        onSuccess(data);
      } else {
        window.location.href = redirectTo;
      }
    } catch {
      setError("Error de conexión. Inténtalo de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  async function handleOrgSelect(orgId: string) {
    setError("");
    setLoading(true);

    try {
      const res = await fetch(`${loginEndpoint}/select-org`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectToken, orgId }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error?.message || "Error al seleccionar organización");
        return;
      }

      if (onSuccess) {
        onSuccess(data);
      } else {
        window.location.href = redirectTo;
      }
    } catch {
      setError("Error de conexión. Inténtalo de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  function handleBackToLogin() {
    setOrgs(null);
    setSelectToken(null);
    setUserName("");
    setPassword("");
    setError("");
  }

  const logoElement = appLogoSvg ? (
    <div
      className="h-12 w-12 shrink-0"
      dangerouslySetInnerHTML={{ __html: appLogoSvg }}
    />
  ) : appLogoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={appLogoUrl} alt={appName} className="h-12 w-12 shrink-0" />
  ) : null;

  const mobileLogoElement = appLogoSvg ? (
    <div
      className="h-9 w-9 shrink-0"
      dangerouslySetInnerHTML={{ __html: appLogoSvg }}
    />
  ) : appLogoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={appLogoUrl} alt={appName} className="h-9 w-9 shrink-0" />
  ) : null;

  return (
    <div className="flex min-h-screen">
      {/* Left panel — branding */}
      <div className="hidden lg:flex lg:w-2/5 flex-col justify-between bg-mc-slate-950 text-white relative overflow-hidden">
        {/* Background photo */}
        {heroImageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={heroImageUrl}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 h-full w-full object-cover opacity-20 pointer-events-none select-none"
          />
        )}
        {/* Gradient overlay to ensure text readability */}
        <div className="absolute inset-0 bg-mc-slate-950/70 pointer-events-none" />

        {/* Content */}
        <div className="relative z-10 flex flex-1 flex-col justify-center px-12">
          <div className="flex items-center gap-4 mb-6">
            {logoElement}
            <h1 className="text-4xl font-bold">{appName}</h1>
          </div>
          {subtitle && (
            <p className="text-base text-mc-slate-300 max-w-sm leading-relaxed">{subtitle}</p>
          )}
          <div className={cn("mt-8 h-px w-24", accentClass.replace("text-", "bg-"))} />
          {features && features.length > 0 && (
            <ul className="mt-8 space-y-3">
              {features.map((feat, i) => (
                <li key={i} className="flex items-center gap-3 text-mc-slate-400 text-sm">
                  <svg className={cn("h-5 w-5 shrink-0", accentClass)} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  {feat}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Platform footer */}
        <div className="relative z-10 px-12 py-6 border-t border-white/10">
          <p className="text-xs text-mc-slate-500">
            Una aplicación de la plataforma{" "}
            <span className="text-mc-slate-400 font-medium">MycoLegal.app</span>
          </p>
          <p className="text-xs text-mc-slate-600 mt-1">
            &copy; {new Date().getFullYear()} MycoLegalTech S.A.
          </p>
        </div>
      </div>

      {/* Right panel */}
      <div className="flex flex-1 items-center justify-center px-6 bg-mc-neutral-50">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="flex items-center gap-3 mb-8 lg:hidden">
            {mobileLogoElement}
            <span className="text-xl font-semibold text-mc-slate-900">{appName}</span>
          </div>

          {orgs ? (
            /* ── Org selection step ── */
            <>
              <h2 className="text-2xl font-bold text-mc-slate-900">Selecciona organización</h2>
              <p className="mt-2 text-sm text-mc-slate-500">
                Hola {userName}, elige con qué organización deseas trabajar
              </p>

              {error && (
                <div className="mt-4 rounded-lg bg-mc-error-50 border border-mc-error-500/30 px-4 py-3 text-sm text-mc-error-700">
                  {error}
                </div>
              )}

              <div className="mt-6 space-y-2 max-h-80 overflow-y-auto">
                {orgs.map((org) => (
                  <button
                    key={org.id}
                    type="button"
                    disabled={loading}
                    onClick={() => handleOrgSelect(org.id)}
                    className="w-full text-left rounded-lg border border-mc-neutral-300 bg-white px-4 py-3 hover:border-mc-primary-400 hover:bg-mc-primary-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span className="font-medium text-mc-slate-900">{org.name}</span>
                    <span className="block text-xs text-mc-slate-400">{org.slug}</span>
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={handleBackToLogin}
                className="mt-4 text-sm text-mc-slate-500 hover:text-mc-slate-700 transition-colors"
              >
                ← Volver al login
              </button>
            </>
          ) : (
            /* ── Login form step ── */
            <>
              <h2 className="text-2xl font-bold text-mc-slate-900">Iniciar sesión</h2>
              <p className="mt-2 text-sm text-mc-slate-500">
                Introduce tus credenciales para acceder
              </p>

              <form onSubmit={handleSubmit} className="mt-8 space-y-5">
                {error && (
                  <div className="rounded-lg bg-mc-error-50 border border-mc-error-500/30 px-4 py-3 text-sm text-mc-error-700">
                    {error}
                  </div>
                )}

                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-mc-slate-700">
                    Correo electrónico
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    className="mt-1 block w-full rounded-lg border border-mc-neutral-300 bg-white px-3 py-2.5 text-mc-slate-900 shadow-sm focus:border-mc-primary-500 focus:outline-none focus:ring-1 focus:ring-mc-primary-500"
                  />
                </div>

                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-mc-slate-700">
                    Contraseña
                  </label>
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    className="mt-1 block w-full rounded-lg border border-mc-neutral-300 bg-white px-3 py-2.5 text-mc-slate-900 shadow-sm focus:border-mc-primary-500 focus:outline-none focus:ring-1 focus:ring-mc-primary-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-lg bg-mc-slate-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-mc-slate-900 focus:outline-none focus:ring-2 focus:ring-mc-primary-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {loading ? "Accediendo..." : "Entrar"}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
