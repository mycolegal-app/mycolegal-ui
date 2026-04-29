# mycolegal-ui — Version History

> Formato: `VV.vv.rr` — misma versión que la plataforma.
> Solo se registran las versiones en las que este repo tiene cambios.

---

## 1.25.0 — Auto-provision compartido de UserRole (2026-04-29)

Type: **minor**

Nuevo helper `@mycolegal-app/ui/server/auth-provision` que centraliza el
patrón "upsert UserRole on first SSO" usado por `getAuthContext` en cada
app del ecosistema.

- `provisionUserRole({ userRoleDelegate, authUserId, orgId, email,
  defaultRole, centralizedRole })` — busca el UserRole local; si no existe,
  hace upsert con el role aportado. Idempotente. Devuelve `null` cuando
  el upsert falla por FK (Organization aún no creada en la BD app), sin
  lanzar.
- Genérico sobre el enum `AppRole` específico de cada app (cada una
  pasa su Prisma delegate y su valor de role).

Reemplaza la duplicación previa en `notaria/legifirma/archivo/cancelaciones`
y deja un único punto de evolución (e.g. cuando se añadan más reglas como
linkedOrgIds, scopes, etc.).

## 1.24.1 — Scoped RBAC helpers (2026-04-29)

Type: **minor**

Nuevo módulo `@mycolegal-app/ui/server/scopes` y extensión del wrapper RLS:

- `buildScopeWhere(ctx, resource)` — produce un fragmento `where` Prisma
  a partir de `ctx.scopes` (claim JWT minteado por `mycolegal-auth`).
- `mergeScopedWhere(userWhere, ctx, resource)` — folding del `where`
  del caller con el del scope (AND-merge).
- `assertScopeAllows(ctx, resource, payload)` — valida payloads de
  escritura; lanza `ScopeViolationError` si algún atributo del payload
  cae fuera del scope. Rechaza también `null`/`undefined` en atributos
  scopados (writers no pueden bypasear borrando el atributo).
- `withScopedContext(orgId, ctx, fn)` añadido a `createRlsHelpers` —
  envuelve `withOrgContext` y expone `scoped(resource)` al callback
  para componer el `where`.

**Semántica**:
- Scopes de otros apps se filtran por `appKey` antes de aplicar.
- Atributos no declarados en el `manifest` del app se ignoran
  (forward-compat con tipos de scope futuros).
- Mismo `(resource, attribute)` con varios scopes → unión (OR) de
  valores. Distintos atributos → AND.
- `IN` con `values=[]` → `{ in: [] }` (deny-all, fail-closed).
- `NOT_IN` con `values=[]` → no-op.
- `EQ` se trata como `IN` con un valor.

Driver real: caso AUCASA en `mycolegal-archivo` (usuario que sólo debe
ver `ArchivoPeticion` con `entidadBancariaId IN (1)`). Adopción en
archivo viene en PR de Fase 3.


## 1.23.0 — RLS shared helper (2026-04-29)

Type: **minor**

Nuevo módulo `@mycolegal-app/ui/server/rls`:

- `createRlsHelpers(prisma)` factory que devuelve
  `{ withOrgContext, withoutOrgContext }` tipados con el cliente
  Prisma de la app consumidora (cada app tiene su slim schema).
- `withOrgContext(orgId, fn)` envuelve la operación en una transacción
  con `SET LOCAL app.current_org = '<orgId>'` para que las políticas
  RLS de Postgres filtren por tenant. Validación de orgId
  (`/^[A-Za-z0-9_-]{1,128}$/`) defense-in-depth.
- `withoutOrgContext(fn)` marker para futuros endpoints cross-org
  (superadmin, dashboards globales).

Cada app la consume con un fichero de 2 líneas
(`src/lib/rls.ts → createRlsHelpers(prisma)`). Cuando hagamos
roll-out a las 5 apps, evita ~50 LOC duplicadas y garantiza misma
implementación.


## 1.22.0 — Refactor: incidencias compartidas entre apps (2026-04-28)

Type: **minor**

Mueve toda la lógica del módulo de reporte de incidencias (que estaba
duplicada byte a byte entre notaria, legifirma y archivo) al paquete
compartido. Cada app consumidora pasa de ~600 líneas a 28 (10
ficheros de 2-3 líneas cada uno).

**Nuevos exports**:

- `MyIncidentsPage` (componente client) — listado de "mis
  incidencias". Las apps lo re-exportan como default de su
  `/(dashboard)/incidencias/page.tsx`.
- `IncidentDetailPage` (componente client) — detalle con thread,
  cierre y reapertura. Re-exportado en `/(dashboard)/incidencias/[number]/page.tsx`.
- `createIncidentsRoutes(config)` (factory en
  `@mycolegal-app/ui/server/incidents-routes`) — devuelve los 7
  handlers Next.js (`report`, `mine`, `mineDetail`, `mineClose`,
  `mineReopen`, `mineMessages`, `mineByNumber`). Cada app lo
  instancia una vez en `lib/incidents-server.ts` con su
  `JWT_COOKIE_NAME` y `AUTH_INTERNAL_URL`.
- `proxyToAuth` y `fetchFromAuth` (en
  `@mycolegal-app/ui/server/auth-proxy`) — versión genérica
  parametrizada del helper que cada app ya tenía en `src/lib/proxy.ts`.

**Peer deps**: `next: ">=14"` añadida (opcional). Las apps que
consumen los handlers ya tienen Next como dep directa, así que el
import no introduce overhead.


## 2.1.0 — Primer despliegue con Beta de Archivo y skeleton de apps nuevas (2026-04-27)

Type: **minor**




## 2.0.0 — Versión con BD unificada entre apps e integración inicial con DocFilling (2026-04-23)

Type: **major**




## 1.20.0 — Manual: aside del índice fijo y más aire entre secciones + consolida DocFillingModal (2026-04-22)

Type: **minor**

Este tag consolida dos líneas de trabajo que corrieron en paralelo:

**Manual layout (este repo, continuación de la serie 1.10.x):**
- El aside con el índice del manual ya no hace scroll con la página: el layout del manual es una shell de altura fija (`h-[calc(100vh-8rem)]`, mismo patrón que otras pantallas full-height de la plataforma) y el scroll vive solo en la columna derecha de contenido. El topbar y la línea de breadcrumb permanecen fijos. El índice tiene scroll interno propio si crece.
- Contenido con más respiración: se aumenta la separación entre secciones (`space-y-8` efectivo a 3.5rem), se añade margen inferior a h2/h3 y `scroll-mt` a las secciones para que los anclas no queden pegados al borde.

**DocFillingModal (integrado desde publicaciones puntuales 1.1.0 y 1.2.0 hechas desde otra máquina):**
- Nuevo componente `components/docfilling/DocFillingModal.tsx` — modal de 4 fases (selección de plantilla → revisión de campos → polling de generación → resultado).
- Conecta a `/api/inter/*` de `mycolegal-docfilling` vía `X-Service-Key`.
- Refinado a fases con source docs y pre/post acciones más campos incompletos.

**Nota sobre numeración**: el remoto publicó 1.1.0 y 1.2.0 en paralelo con esta serie 1.10.x. Para evitar colisiones y dejar claro que este tag supera ambos, saltamos a 1.20.0.




## 1.10.0 — Versión con gestor de documentos requeridos por CCAAs y ajustes en la visualización UI (2026-04-22)

Type: **minor**




## 1.8.0 — Activación de RESEND para envío genérico de mails desde mail.mycolegal.app (2026-04-17)

Type: **minor**




## 1.7.0 — Version con audit de sesiones (2026-04-17)

Type: **minor**




## 1.5.1 — Bug con el timeout de inactividad de sesión de usuario (2026-04-16)

Type: **revision**




## 1.5.0 — Configuración de RESEND para servidor genérico de correo de la plataforma (2026-04-16)

Type: **minor**




## 1.4.2 — Selector de aplicaciones en Header y cambios estéticos UI (2026-04-15)

Type: **revision**




## 1.4.1 — Bug fixes (borrado de organizaciones desde admin y otros errores menores) (2026-04-15)

Type: **revision**




## 1.4.0 — Muestra versiones desplegadas en la pantalla de login (2026-04-15)

Type: **minor**




## 1.3.1 — Ajustes menores en los casos de test e2e (2026-04-15)

Type: **revision**




## 1.3.0 — Versión con mejoras UI (nuevos componentes compartidos: header con selector de apps) y con timeout de sesión de usuario (2026-04-14)

Type: **minor**



