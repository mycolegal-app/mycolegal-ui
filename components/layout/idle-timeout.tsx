"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useI18n } from "../i18n/i18n-context";

interface IdleTimeoutProps {
  /** Inactivity timeout in minutes before showing the warning modal */
  timeoutMinutes: number;
  /** Countdown seconds shown in the modal before auto-logout (default: 60) */
  countdownSeconds?: number;
  /** Called when the user clicks "Continue" — should refresh the JWT */
  onContinue: () => Promise<void>;
  /** Called when the user explicitly clicks "Cerrar sesión" in the modal. */
  onLogout: () => void;
  /**
   * Called when the countdown elapses without user action. Distinct from
   * onLogout so callers can emit a SESSION_TIMEOUT audit event instead of
   * a regular LOGOUT. Falls back to onLogout when not provided.
   */
  onTimeout?: () => void;
  /**
   * Silent JWT refresh, fired while the user is actively interacting with
   * the UI (rate-limited by `refreshIntervalMinutes`). Closes the gap
   * between client-side activity (mouse/keyboard/scroll) and server-side
   * JWT TTL: without this, an active user who doesn't trigger API calls for
   * `inactivityTimeout + 2 min` is silently logged out on the next request.
   * Errors are swallowed — the next 401 is handled by `useAuthFetchGuard`.
   */
  onSilentRefresh?: () => Promise<void>;
  /**
   * Minimum interval between silent refreshes. Defaults to half of
   * `timeoutMinutes` (capped to ≥1). Must stay strictly below the JWT TTL
   * (`timeoutMinutes + 2`) so the access token never expires while the
   * user is active.
   */
  refreshIntervalMinutes?: number;
}

// #452 — "leer cuenta como actividad": mientras la pestaña esté visible Y con
// foco, un tick periódico resetea el temporizador de inactividad aunque el
// usuario no mueva ratón/teclado ni haga scroll (p.ej. leyendo una resolución
// corta que cabe en pantalla). Se ACOTA a `READING_KEEPALIVE_CAP × timeout`
// desde la última interacción REAL, para no eternizar una pestaña abandonada
// pero abierta: pasado ese margen, el temporizador de inactividad salta normal.
const READING_TICK_MS = 30_000;
const READING_KEEPALIVE_CAP = 3;

const ACTIVITY_EVENTS: (keyof DocumentEventMap)[] = [
  "mousemove",
  "keydown",
  // `input` (besides `keydown`) guarantees that typing into ANY field always
  // counts as activity and refreshes the session — it fires for paste, IME
  // composition, autofill and mobile/virtual keyboards that `keydown` misses.
  // Without it, a user writing a long incident report could be silently logged
  // out mid-sentence on those input paths.
  "input",
  "click",
  "scroll",
  "touchstart",
];

export function IdleTimeout({
  timeoutMinutes,
  countdownSeconds = 60,
  onContinue,
  onLogout,
  onTimeout,
  onSilentRefresh,
  refreshIntervalMinutes,
}: IdleTimeoutProps) {
  const { t } = useI18n();
  const [showModal, setShowModal] = useState(false);
  const [remaining, setRemaining] = useState(countdownSeconds);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastActivity = useRef(Date.now());
  // Última interacción REAL (ratón/teclado/scroll/touch), distinta de los ticks de
  // lectura (#452): acota cuánto puede la lectura sola mantener viva la sesión.
  const lastRealActivity = useRef(Date.now());
  const lastRefreshAt = useRef(Date.now());
  const silentRefreshing = useRef(false);
  const onSilentRefreshRef = useRef(onSilentRefresh);
  useEffect(() => {
    onSilentRefreshRef.current = onSilentRefresh;
  }, [onSilentRefresh]);

  const timeoutMs = timeoutMinutes * 60 * 1000;
  const refreshIntervalMs =
    (refreshIntervalMinutes ?? Math.max(timeoutMinutes / 2, 1)) * 60 * 1000;

  const resetIdleTimer = useCallback(() => {
    lastActivity.current = Date.now();
    if (showModal) return; // Don't reset while modal is showing
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => {
      setShowModal(true);
      setRemaining(countdownSeconds);
    }, timeoutMs);
  }, [timeoutMs, countdownSeconds, showModal]);

  const maybeSilentRefresh = useCallback(() => {
    const fn = onSilentRefreshRef.current;
    if (!fn) return;
    if (silentRefreshing.current) return;
    if (Date.now() - lastRefreshAt.current < refreshIntervalMs) return;
    silentRefreshing.current = true;
    fn()
      .then(() => {
        lastRefreshAt.current = Date.now();
      })
      .catch(() => {
        // Swallow — the next 401 is caught by useAuthFetchGuard, which
        // already redirects to /login. Surfacing this here would just
        // duplicate that path.
      })
      .finally(() => {
        silentRefreshing.current = false;
      });
  }, [refreshIntervalMs]);

  // Set up activity listeners
  useEffect(() => {
    function handleActivity() {
      if (showModal) return;
      lastRealActivity.current = Date.now();
      resetIdleTimer();
      maybeSilentRefresh();
    }

    ACTIVITY_EVENTS.forEach((event) =>
      document.addEventListener(event, handleActivity, { passive: true })
    );

    // Pause timer when tab is hidden, resume when visible
    function handleVisibility() {
      if (document.hidden) {
        if (idleTimer.current) clearTimeout(idleTimer.current);
      } else {
        const elapsed = Date.now() - lastActivity.current;
        if (elapsed >= timeoutMs) {
          setShowModal(true);
          setRemaining(countdownSeconds);
        } else {
          resetIdleTimer();
          maybeSilentRefresh();
        }
      }
    }
    document.addEventListener("visibilitychange", handleVisibility);

    // Initial timer
    resetIdleTimer();

    return () => {
      ACTIVITY_EVENTS.forEach((event) =>
        document.removeEventListener(event, handleActivity)
      );
      document.removeEventListener("visibilitychange", handleVisibility);
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, [resetIdleTimer, maybeSilentRefresh, timeoutMs, countdownSeconds, showModal]);

  // Reading keep-alive (#452): count sustained reading as activity, bounded.
  useEffect(() => {
    const id = setInterval(() => {
      if (showModal) return;
      if (typeof document === "undefined") return;
      // Solo si la pestaña está realmente delante del usuario.
      if (document.hidden || !document.hasFocus()) return;
      // Cap: la lectura sola extiende la sesión hasta `READING_KEEPALIVE_CAP ×
      // timeout` desde la última interacción real; pasado eso, dejar que salte.
      if (Date.now() - lastRealActivity.current >= timeoutMs * READING_KEEPALIVE_CAP) return;
      resetIdleTimer();
      maybeSilentRefresh();
    }, READING_TICK_MS);
    return () => clearInterval(id);
  }, [resetIdleTimer, maybeSilentRefresh, timeoutMs, showModal]);

  // Countdown when modal is showing
  useEffect(() => {
    if (!showModal) {
      if (countdownTimer.current) clearInterval(countdownTimer.current);
      return;
    }

    countdownTimer.current = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(countdownTimer.current!);
          (onTimeout ?? onLogout)();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (countdownTimer.current) clearInterval(countdownTimer.current);
    };
  }, [showModal, onLogout, onTimeout]);

  async function handleContinue() {
    // Pause the countdown while refreshing but keep the modal visible so the
    // user gets clear feedback if the refresh fails (previous behavior closed
    // the modal immediately and swallowed the error silently).
    if (countdownTimer.current) clearInterval(countdownTimer.current);
    setRefreshing(true);
    setRefreshError(false);
    try {
      await onContinue();
      setShowModal(false);
      setRefreshing(false);
      lastActivity.current = Date.now();
      lastRealActivity.current = Date.now();
      lastRefreshAt.current = Date.now();
      if (idleTimer.current) clearTimeout(idleTimer.current);
      idleTimer.current = setTimeout(() => {
        setShowModal(true);
        setRemaining(countdownSeconds);
      }, timeoutMs);
    } catch {
      // Refresh failed — surface the error and force the user to log in again.
      setRefreshing(false);
      setRefreshError(true);
    }
  }

  function handleLogout() {
    // Close the modal immediately for visual feedback; onLogout will redirect.
    if (countdownTimer.current) clearInterval(countdownTimer.current);
    setShowModal(false);
    onLogout();
  }

  if (!showModal) return null;

  const pct = (remaining / countdownSeconds) * 100;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-2xl">
        <div className="text-center">
          {/* Circular countdown */}
          <div className="relative mx-auto mb-4 h-20 w-20">
            <svg className="h-20 w-20 -rotate-90" viewBox="0 0 80 80">
              <circle
                cx="40" cy="40" r="36"
                fill="none"
                stroke="#e5e7eb"
                strokeWidth="4"
              />
              <circle
                cx="40" cy="40" r="36"
                fill="none"
                stroke={remaining <= 15 ? "#ef4444" : "#0891b2"}
                strokeWidth="4"
                strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 36}`}
                strokeDashoffset={`${2 * Math.PI * 36 * (1 - pct / 100)}`}
                className="transition-all duration-1000 ease-linear"
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-2xl font-bold text-gray-800">
              {remaining}
            </span>
          </div>

          <h2 className="text-lg font-semibold text-gray-900">
            {refreshError ? t("ui.idleTimeout.errTitle") : t("ui.idleTimeout.title")}
          </h2>
          <p className="mt-2 text-sm text-gray-500">
            {refreshError ? (
              <>{t("ui.idleTimeout.errBody")}</>
            ) : (
              <>
                {t("ui.idleTimeout.bodyBefore")}{" "}
                <strong>{remaining}</strong> {t("ui.idleTimeout.bodyAfter")}
              </>
            )}
          </p>

          <div className="mt-6 flex gap-3">
            {refreshError ? (
              <button
                onClick={handleLogout}
                className="flex-1 rounded-lg bg-cyan-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-cyan-700"
              >
                {t("ui.idleTimeout.btnGoLogin")}
              </button>
            ) : (
              <>
                <button
                  onClick={handleLogout}
                  disabled={refreshing}
                  className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {t("ui.idleTimeout.btnLogout")}
                </button>
                <button
                  onClick={handleContinue}
                  disabled={refreshing}
                  className="flex-1 rounded-lg bg-cyan-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-cyan-700 disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  {refreshing ? t("ui.idleTimeout.refreshing") : t("ui.idleTimeout.btnContinue")}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
