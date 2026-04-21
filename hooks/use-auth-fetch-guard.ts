"use client";

import { useEffect, useRef } from "react";

/**
 * Monkey-patches window.fetch so that any 401 response to a same-origin
 * `/api/...` call redirects the user to the login page. Without this guard,
 * each caller would have to handle 401 itself — the typical failure mode is
 * that a JWT expires between renders, the next menu navigation fetches data,
 * gets a 401, and the UI silently shows stale or empty content instead of
 * sending the user back to login.
 *
 * Scope is deliberately narrow:
 *   - Only same-origin requests.
 *   - Only paths under `/api/`.
 *   - Excludes `/api/auth/refresh` so the IdleTimeout refresh flow can still
 *     surface its own error without triggering a redirect.
 */
export function useAuthFetchGuard(loginPath = "/login") {
  const installed = useRef(false);

  useEffect(() => {
    if (installed.current) return;
    installed.current = true;

    if (typeof window === "undefined") return;
    const originalFetch = window.fetch.bind(window);

    async function guardedFetch(
      input: RequestInfo | URL,
      init?: RequestInit,
    ): Promise<Response> {
      const response = await originalFetch(input, init);
      if (response.status !== 401) return response;

      let url: string;
      if (typeof input === "string") url = input;
      else if (input instanceof URL) url = input.toString();
      else url = input.url;

      let pathname: string;
      try {
        const resolved = new URL(url, window.location.origin);
        if (resolved.origin !== window.location.origin) return response;
        pathname = resolved.pathname;
      } catch {
        return response;
      }

      if (!pathname.startsWith("/api/")) return response;
      if (pathname.startsWith("/api/auth/refresh")) return response;
      if (pathname.startsWith("/api/auth/login")) return response;
      if (pathname.startsWith("/api/auth/logout")) return response;
      if (pathname.startsWith("/api/auth/set-password")) return response;
      if (pathname.startsWith("/api/auth/reset-password")) return response;

      // Avoid infinite loops if we're already on the login page
      if (window.location.pathname === loginPath) return response;

      window.location.href = loginPath;
      return response;
    }

    window.fetch = guardedFetch as typeof window.fetch;
  }, [loginPath]);
}
