import { NextResponse, type NextRequest } from 'next/server';

/**
 * Forward an expired-password change to the auth service.
 *
 * UNAUTHENTICATED by design: there is no session yet. The login returned
 * PASSWORD_EXPIRED (403) *before* issuing any token, so the user proves identity
 * with their current (correct but expired) password carried in the JSON body.
 * This is a pure passthrough — it sets no cookies. On success the client re-runs
 * the normal `/api/auth/login`, which yields the session AND the per-app
 * provisioning that each login proxy performs (org/role upsert, language cookie).
 *
 * Wired into every app: factory apps re-export `authRoutes.expiredPassword`;
 * the few apps that don't use `createAuthRoutes` call this helper directly with
 * their own `AUTH_INTERNAL_URL`.
 */
export async function forwardExpiredPasswordChange(
  authInternalUrl: string,
  request: NextRequest,
): Promise<NextResponse> {
  const body = await request.text();
  const authResponse = await fetch(`${authInternalUrl}/auth/password/expired`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });

  // auth serializes errors as `{ error: <msg>, code }`; normalize to the
  // `{ error: { code, message } }` envelope the shared LoginForm expects, so it
  // can translate PASSWORD_SAME / INVALID_CREDENTIALS / ACCOUNT_LOCKED by code.
  const data = (await authResponse.json().catch(() => ({}))) as {
    error?: unknown;
    code?: string;
    message?: string;
    success?: boolean;
  };

  if (!authResponse.ok) {
    const code = data.code || (typeof (data.error as { code?: string })?.code === 'string' ? (data.error as { code?: string }).code : undefined) || 'AUTH_FAILED';
    const message =
      typeof data.error === 'string'
        ? data.error
        : (data.error as { message?: string })?.message || data.message || 'No se pudo cambiar la contraseña.';
    return NextResponse.json({ error: { code, message } }, { status: authResponse.status });
  }

  return NextResponse.json(data, { status: authResponse.status });
}
