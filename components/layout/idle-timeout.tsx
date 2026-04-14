"use client";

import { useState, useEffect, useRef, useCallback } from "react";

interface IdleTimeoutProps {
  /** Inactivity timeout in minutes before showing the warning modal */
  timeoutMinutes: number;
  /** Countdown seconds shown in the modal before auto-logout (default: 60) */
  countdownSeconds?: number;
  /** Called when the user clicks "Continue" — should refresh the JWT */
  onContinue: () => Promise<void>;
  /** Called when the countdown expires — should logout and redirect */
  onLogout: () => void;
}

const ACTIVITY_EVENTS: (keyof DocumentEventMap)[] = [
  "mousemove",
  "keydown",
  "click",
  "scroll",
  "touchstart",
];

export function IdleTimeout({
  timeoutMinutes,
  countdownSeconds = 60,
  onContinue,
  onLogout,
}: IdleTimeoutProps) {
  const [showModal, setShowModal] = useState(false);
  const [remaining, setRemaining] = useState(countdownSeconds);
  const [continuing, setContinuing] = useState(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastActivity = useRef(Date.now());

  const timeoutMs = timeoutMinutes * 60 * 1000;

  const resetIdleTimer = useCallback(() => {
    lastActivity.current = Date.now();
    if (showModal) return; // Don't reset while modal is showing
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => {
      setShowModal(true);
      setRemaining(countdownSeconds);
    }, timeoutMs);
  }, [timeoutMs, countdownSeconds, showModal]);

  // Set up activity listeners
  useEffect(() => {
    function handleActivity() {
      if (!showModal) resetIdleTimer();
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
  }, [resetIdleTimer, timeoutMs, countdownSeconds, showModal]);

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
          onLogout();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (countdownTimer.current) clearInterval(countdownTimer.current);
    };
  }, [showModal, onLogout]);

  async function handleContinue() {
    setContinuing(true);
    try {
      await onContinue();
      setShowModal(false);
      resetIdleTimer();
    } catch {
      // If refresh fails, logout
      onLogout();
    } finally {
      setContinuing(false);
    }
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
            Sesión a punto de expirar
          </h2>
          <p className="mt-2 text-sm text-gray-500">
            Por inactividad, tu sesión se cerrará automáticamente en{" "}
            <strong>{remaining}</strong> segundos.
          </p>

          <div className="mt-6 flex gap-3">
            <button
              onClick={() => onLogout()}
              className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cerrar sesión
            </button>
            <button
              onClick={handleContinue}
              disabled={continuing}
              className="flex-1 rounded-lg bg-cyan-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-cyan-700 disabled:opacity-50"
            >
              {continuing ? "Renovando..." : "Continuar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
