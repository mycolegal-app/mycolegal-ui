import { type NextRequest } from 'next/server';
import { proxyToAuth, type AuthProxyConfig } from './auth-proxy';

/**
 * Factory for the WHOLE /api/notifications/* proxy used by the shared
 * notifications bell (`NotificationsBell` in `@mycolegal-app/ui`). Each app
 * instantiates it once with its own JWT cookie name + auth URL and mounts a
 * single optional catch-all route:
 *
 *   // src/lib/notifications-server.ts
 *   import { createNotificationsRoutes } from '@mycolegal-app/ui/server/notifications-routes';
 *   import { AUTH_INTERNAL_URL, JWT_COOKIE_NAME } from './config';
 *   export const notificationsRoutes = createNotificationsRoutes({
 *     jwtCookieName: JWT_COOKIE_NAME,
 *     authInternalUrl: AUTH_INTERNAL_URL,
 *   });
 *
 *   // src/app/api/notifications/[[...path]]/route.ts
 *   import { notificationsRoutes } from '@/lib/notifications-server';
 *   export const { GET, PATCH, POST } = notificationsRoutes.catchAll;
 *
 * One file wires every endpoint the bell uses: list (GET /), unread-count
 * (GET /unread-count), mark-one (PATCH /:id/read) and mark-all (POST
 * /read-all). Auth enforces auth + per-user ownership on each path; this
 * only forwards within the `/notifications/*` namespace.
 */
export function createNotificationsRoutes(config: AuthProxyConfig) {
  const forward = (request: NextRequest, path?: string[]) => {
    const sub = path?.length ? `/${path.join('/')}` : '';
    return proxyToAuth(config, request, `/notifications${sub}${request.nextUrl.search}`);
  };
  return {
    catchAll: {
      async GET(request: NextRequest, ctx: { params: Promise<{ path?: string[] }> }) {
        return forward(request, (await ctx.params).path);
      },
      async PATCH(request: NextRequest, ctx: { params: Promise<{ path?: string[] }> }) {
        return forward(request, (await ctx.params).path);
      },
      async POST(request: NextRequest, ctx: { params: Promise<{ path?: string[] }> }) {
        return forward(request, (await ctx.params).path);
      },
    },
  };
}
