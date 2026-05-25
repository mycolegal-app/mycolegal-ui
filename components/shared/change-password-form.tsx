"use client";

import { useState, type FormEvent } from "react";
import { useI18n } from "../i18n/i18n-context";
import { apiErrorMessage } from "../../lib/api-error";

interface ChangePasswordFormProps {
  /** API endpoint that proxies to /auth/change-password. */
  endpoint?: string;
  /** Where to redirect after a successful change. */
  redirectTo?: string;
  /** Minimum length enforced client-side. Server is authoritative. */
  minLength?: number;
}

/**
 * Forced-change-password form for authenticated users. Used after an
 * admin creates a user with a dictated initial password: the user logs
 * in, is redirected here, and must rotate before they can use the app.
 *
 * Unlike SetPasswordForm, this doesn't take an activation token — the
 * JWT cookie identifies the caller.
 */
export function ChangePasswordForm({
  endpoint = "/api/auth/change-password",
  redirectTo = "/",
  minLength = 12,
}: ChangePasswordFormProps) {
  const { t } = useI18n();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (password.length < minLength) {
      setError(t("ui.setPassword.errMinLength", { min: String(minLength) }));
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
        credentials: "include",
        body: JSON.stringify({ newPassword: password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const message = data?.error?.message || (typeof data?.error === "string" ? data.error : undefined);
        setError(
          apiErrorMessage(t, { status: res.status, code: data?.error?.code, message }, t("ui.userAccount.errChangePassword")),
        );
        return;
      }
      window.location.href = redirectTo;
    } catch {
      setError(t("ui.login.errConnection"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-md space-y-4 p-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">{t("ui.changePassword.title")}</h1>
        <p className="mt-1 text-sm text-gray-600">
          {t("ui.changePassword.subtitle")}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label htmlFor="new-password" className="mb-1 block text-sm text-gray-700">
            {t("ui.userAccount.fieldNew")}
          </label>
          <input
            id="new-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={minLength}
            autoFocus
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-cyan focus:outline-none focus:ring-1 focus:ring-cyan"
          />
        </div>
        <div>
          <label htmlFor="new-password-confirm" className="mb-1 block text-sm text-gray-700">
            {t("ui.changePassword.repeat")}
          </label>
          <input
            id="new-password-confirm"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-cyan focus:outline-none focus:ring-1 focus:ring-cyan"
          />
        </div>

        {error && (
          <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
        )}

        <button
          type="submit"
          disabled={loading || !password || !confirm}
          className="w-full rounded-md bg-cyan px-4 py-2 text-sm font-medium text-white hover:bg-cyan/90 disabled:opacity-50"
        >
          {loading ? t("ui.userAccount.btnSaving") : t("ui.changePassword.btnSave")}
        </button>
      </form>
    </div>
  );
}
