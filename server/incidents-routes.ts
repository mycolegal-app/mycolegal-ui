import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { proxyToAuth, type AuthProxyConfig } from './auth-proxy';

/**
 * Factory for the **whole** set of /api/incidents/* route handlers used
 * by every app to wire the platform-wide bug reporter (the floating
 * widget + "my incidents" screen). Each app instantiates this once with
 * its own JWT cookie name and auth URL, then re-exports the handlers
 * from the corresponding route.ts files.
 *
 * Usage from an app:
 *
 *   // src/app/api/incidents/route.ts
 *   import { incidentsRoutes } from '@/lib/incidents-server';
 *   export const { POST } = incidentsRoutes.report;
 *
 *   // src/app/api/incidents/mine/route.ts
 *   import { incidentsRoutes } from '@/lib/incidents-server';
 *   export const { GET } = incidentsRoutes.mine;
 *
 * Where `incidents-server.ts` does:
 *   import { createIncidentsRoutes } from '@mycolegal-app/ui/server/incidents-routes';
 *   import { AUTH_INTERNAL_URL, JWT_COOKIE_NAME } from './config';
 *   export const incidentsRoutes = createIncidentsRoutes({
 *     jwtCookieName: JWT_COOKIE_NAME,
 *     authInternalUrl: AUTH_INTERNAL_URL,
 *   });
 */
export function createIncidentsRoutes(config: AuthProxyConfig) {
  return {
    /**
     * POST /api/incidents — submit a new incident report.
     * Reads JWT from cookie, forwards to auth /incidents.
     */
    report: {
      async POST(request: NextRequest) {
        const cookieStore = await cookies();
        const token = cookieStore.get(config.jwtCookieName)?.value;
        if (!token) {
          return NextResponse.json(
            { error: { code: 'UNAUTHORIZED', message: 'No autenticado' } },
            { status: 401 },
          );
        }
        const body = await request.text();
        const res = await fetch(`${config.authInternalUrl}/incidents`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body,
        });
        const data = await res.json().catch(() => ({}));
        return NextResponse.json(data, { status: res.status });
      },
    },

    /** GET /api/incidents/mine — list current user's incidents. */
    mine: {
      async GET(request: NextRequest) {
        return proxyToAuth(
          config,
          request,
          `/incidents/mine${request.nextUrl.search}`,
        );
      },
    },

    /** GET /api/incidents/mine/[id] — get one incident. */
    mineDetail: {
      async GET(
        request: NextRequest,
        { params }: { params: Promise<{ id: string }> },
      ) {
        const { id } = await params;
        return proxyToAuth(config, request, `/incidents/mine/${id}`);
      },
    },

    /** POST /api/incidents/mine/[id]/close. */
    mineClose: {
      async POST(
        request: NextRequest,
        { params }: { params: Promise<{ id: string }> },
      ) {
        const { id } = await params;
        return proxyToAuth(config, request, `/incidents/mine/${id}/close`);
      },
    },

    /** POST /api/incidents/mine/[id]/reopen. */
    mineReopen: {
      async POST(
        request: NextRequest,
        { params }: { params: Promise<{ id: string }> },
      ) {
        const { id } = await params;
        return proxyToAuth(config, request, `/incidents/mine/${id}/reopen`);
      },
    },

    /** GET / POST /api/incidents/mine/[id]/messages. */
    mineMessages: {
      async GET(
        request: NextRequest,
        { params }: { params: Promise<{ id: string }> },
      ) {
        const { id } = await params;
        return proxyToAuth(config, request, `/incidents/mine/${id}/messages`);
      },
      async POST(
        request: NextRequest,
        { params }: { params: Promise<{ id: string }> },
      ) {
        const { id } = await params;
        return proxyToAuth(config, request, `/incidents/mine/${id}/messages`);
      },
    },

    /** GET /api/incidents/mine/by-number/[number] — fetch incident by user-friendly number. */
    mineByNumber: {
      async GET(
        request: NextRequest,
        { params }: { params: Promise<{ number: string }> },
      ) {
        const { number } = await params;
        return proxyToAuth(
          config,
          request,
          `/incidents/mine/by-number/${number}`,
        );
      },
    },
  };
}
