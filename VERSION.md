# mycolegal-ui — Version History

> Formato: `VV.vv.rr` — misma versión que la plataforma.
> Solo se registran las versiones en las que este repo tiene cambios.

---

## 1.37.1 — NotificationsBell: modal centrado en lugar de dropdown anclado (2026-05-04)

Type: **patch**

Click en la campana ya no abre un panel anclado al sidebar — abre
directamente un modal centrado (lista de notificaciones). Click en una
notificación marca como leída y la misma modal swappea a la vista de
detalle (con flecha "← Volver" para regresar a la lista). Sin dropdown
intermedio, sin botón "Ir al detalle", sin redirects fuera de la app.

---

## 1.37.0 — SearchableSelect + ClientPicker compartidos (2026-05-04)

Type: **minor**

Dos componentes nuevos para captura de catálogos, antes duplicados o
inconsistentes entre apps:

- `SearchableSelect` — combobox client-side filtrable (acto jurídico,
  jurisdicción, etc.). Autoselect por código exacto. Modo `clearAfterPick`
  para usarse como picker de listas multi-select.
- `ClientPicker` — autocomplete asíncrono de clientes con debounce y
  shape canónico `{nombre, apellidos, razonSocial, nif, tipo}`. Prop
  `apiBase` configurable (default `/api/catalogs/clientes`); apps con
  endpoint distinto (archivo: `/api/clientes`) pasan override.

Migración prevista: notaria/previos, notaria/expedientes/nuevo (ya en
nuevo layout), notaria/previos/[id], legifirma/actuaciones/nueva,
archivo/peticiones/nueva, consultor/jurisprudencia y
consultor/consultor-documentos pasan a usar estos componentes en vez
de copias locales o `<select>` planos.

---

## 1.36.2 — NotificationsBell: fix marcar leídas + modal autocontenido (2026-05-04)

Type: **patch**

Dos bugs:

1. **"Marcar todas" y mark-one no funcionaban**: el frontend hacía
   `fetch(..., { method: "POST"|"PATCH" })` sin body. El proxy de las
   apps consumer fwd `Content-Type: application/json` y Fastify (auth)
   rechazaba con 400 `"Body cannot be empty when content-type is set
   to application/json"`. Fix: enviar `body: "{}"` con el header
   explícito.

2. **"Ir al detalle" llevaba al login de admin**: las notificaciones de
   incidencias tienen `appSlug='admin'` para superadmins, y al navegar
   se redirigía a `admin.mycolegal.local/...` que requiere sesión
   admin separada. Fix: el modal del detalle es autocontenido — se
   eliminó el botón "Ir al detalle"; el contenido completo del aviso
   queda visible en el propio modal y la notificación se marca como
   leída automáticamente al abrirse.

---

## 1.36.1 — Componentes shared usan NavLink en vez de next/link (2026-05-04)

Type: **patch**

`UserAccountDialog`, `MyIncidentsPage` e `IncidentDetailPage` importaban
`next/link` directamente; cuando el componente se renderiza en una app
consumer con `output: 'standalone'`, esa navegación cliente puede fallar
silenciosamente (mismo bug que motivó la creación de NavLink). Migrados
a `import { NavLink as Link } from "./nav-link"` para consistencia con
el patrón canónico del ecosistema.

---

## 1.36.0 — Gating cross-app: useOrgApps + AppGatedButton (2026-05-04)

Type: **minor**

Nueva infraestructura compartida para deshabilitar funcionalidad que
depende de apps no contratadas por la org, mostrando un tooltip que
explica al usuario por qué no está disponible (en vez de ocultar el
botón sin más).

- `hooks/use-org-apps.ts`: `useOrgApps()` y `useIsAppEnabled(slug)`.
  Llaman a `/api/org/apps-habilitadas` en la app consumidora y cachean
  module-level (evita re-fetch entre componentes en la misma sesión).
- `components/shared/app-gated-button.tsx`: `<AppGatedButton appSlug=
  ... disabledTooltip=... onClick=...>` envuelve un button HTML; si la
  app no está habilitada, se renderiza disabled con `title=tooltip`.

Las apps consumidoras necesitan exponer `GET /api/org/apps-habilitadas`
que devuelva `{ data: { apps: string[] } }` (notaria ya lo tenía;
otras apps deben replicar el patrón con `lib/org-apps.ts`).

Caso de uso inicial: deshabilitar botones de "Generar documento" cuando
la org no tiene la app `docfilling` contratada.

---

## 1.35.3 — DataTable.paginatorExtras + help-overlay flip-to-top + anchor-aware (2026-05-04)

Type: **patch**

DataTable: nuevo prop `paginatorExtras` que renderiza un slot a la
derecha del selector "registros por página" en el footer del paginador.
Útil para checkboxes que no merecen una fila propia arriba de la tabla
(ej. "Mostrar inactivos").

HelpOverlay: el algoritmo anti-solapamiento ahora también considera los
anchors `[data-help]` (cards/charts) como obstáculos, y cuando el shift
acumulado superaría el umbral de 60px (el tooltip taparía contenido
siguiente), flippea el tooltip arriba del anchor en lugar de empujarlo
más abajo. Resuelve el caso del dashboard de notaria con 5 KPI cards
seguidas de charts donde los tooltips bottom-placement caían sobre los
gráficos.

---

## 1.35.2 — Help tooltips: fuente reducida y anti-solapamiento (2026-05-04)

Type: **patch**

Las ayudas flotantes del modo ayuda (`HelpOverlay`) eran demasiado
grandes (`text-sm`, `max-w-xs` = 320px) y se solapaban entre sí cuando
varias caían cerca — visible en notaría con las 5 KPI cards y los
charts cuyos tooltips se cruzaban.

Cambios en `components/help/help-tooltip.tsx`:
- `text-sm` → `text-[11px]`, `leading-snug`, padding más compacto
- `max-w-xs` (320px) → `max-w-[200px]`
- Flecha y "Más info" reducidos en proporción
- Emite evento `mycolegal:help-repositioned` al posicionarse para que
  el overlay re-evalúe colisiones

Cambios en `components/help/help-overlay.tsx`:
- Pase de evitación de solapamientos: tras cada
  posicionamiento/scroll/resize, recorre los tooltips en orden DOM y
  desplaza vertical (`translate: 0 Ypx`) los que colisionan con
  hermanos previamente colocados. Idempotente (resetea translate y
  recalcula).

El cambio aplica a todas las apps que consumen `@mycolegal-app/ui`.

---

## 1.35.1 — user-account-dialog soporta el shape `{error:string}` de Fastify (2026-05-04)

Type: **patch**

`UserAccountDialog` parseaba el cuerpo de error como `body.error.message`
o `body.message`, pero auth (Fastify) devuelve `{ error: "La contraseña
actual no es correcta", statusCode: 409 }` — `error` es string. El
componente caía al fallback `HTTP 409` y el usuario nunca veía el
mensaje real. Añadido un tercer caso al fallback chain.

---

## 1.34.2 — shared-lock skip vía fixture auto, no `test.beforeEach` toplevel (2026-05-04)

Type: **patch**

`shared-lock-fixture.ts` también se carga desde `playwright.config.ts`
como reporter (clase default). Llamar `test.beforeEach()` a top-level
en ese módulo disparaba `"Playwright Test did not expect
test.beforeEach() to be called here"` al arrancar Playwright. Cambio
mínimo: el skip ahora se inyecta vía fixture auto (`_sharedLockGuard`)
en lugar de `test.beforeEach`. La API pública (`import { test, expect }
from '@mycolegal-app/ui/e2e/shared-lock-fixture'`) no cambia.

---

## 1.34.1 — fix import extension en fixture compilado (2026-05-04)

Type: **patch**

`shared-lock-fixture.ts` importaba `./shared-lock` sin extensión; al
compilarse a `.js` y servirse desde un paquete `type: module`, Node ESM
(modo estricto) rechazaba el import con `ERR_MODULE_NOT_FOUND`. Cambio
mínimo: el source ahora importa `./shared-lock.js` (TypeScript acepta
esta sintaxis y el `.js` resuelve correctamente tanto antes como
después de compilar).

---

## 1.34.0 — e2e fixtures publicadas como JS compilado (2026-05-04)

Type: **patch**

Playwright no transforma archivos `.ts` dentro de `node_modules` al
descubrir specs, lo cual rompía cualquier app que importara
`@mycolegal-app/ui/e2e/shared-lock-fixture` desde un spec
(`SyntaxError: Unexpected token '{'` en notaria al usarlo en 5 specs).

Cambios:
- Nuevo `tsconfig.e2e.json` que compila `e2e/*.ts` → `e2e/*.js` + `.d.ts`.
- `prepublishOnly` ejecuta `build:e2e` automáticamente al publicar.
- DevDeps: `@playwright/test`, `@types/node` (necesarios para tsc).

Las apps consumidoras siguen importando
`@mycolegal-app/ui/e2e/shared-lock-fixture` sin cambio — el resolver
escogerá el `.js` compilado en lugar del `.ts` crudo.

---

## 1.33.0 — Cross-app e2e shared-lock helpers (2026-05-04)

Type: **minor**

Nuevo subpath `@mycolegal-app/ui/e2e/shared-lock` y
`@mycolegal-app/ui/e2e/shared-lock-fixture` para deduplicar tests e2e que
prueban contratos compartidos (auth, incidencias, componentes shared)
cuando la orquestación corre Playwright en varias apps en serie. Las apps
añaden `SharedLockReporter` a su `playwright.config.ts` y los specs con
tag `@shared:*` importan el `test` extendido (incluye un beforeEach que
salta cuando el tag ya pasó en la misma run).

Mecanismo: `mycolegal-platform/scripts/build-e2e-lock-env.mjs` calcula
RUN_IDs por tag desde `shared-test-deps.json`. Sin `E2E_LOCK_PATH` (dev
local de un solo app) los helpers son no-op. `@playwright/test` añadido
como peer opcional para que solo lo necesiten las apps que usen los
helpers e2e.

## 1.32.0 — UserAccountDialog ("Mi cuenta") + orgApp incidents route (2026-05-04)

Type: **minor**

Nuevo componente `UserAccountDialog` para apps de usuario (notaria,
legifirma): modal con tabs Mis datos / Contraseña / Incidencias, montado
sobre el bloque user-info del sidebar. Permite editar `displayName`,
`language`, `phoneNumber` y `nif`; cambiar contraseña con `currentPassword`
obligatorio (excepto en flow `mustChangePassword`); y revisar incidencias
abiertas por mí y por otros en la misma app.

`server/incidents-routes.ts` añade el handler `orgApp` (proxy a
`GET /incidents/org-app`) que las apps cablean en
`/api/incidents/org-app`.

Requiere `mycolegal-auth >= 2.3.0`.

## 1.31.0 — SpainCCAAMap inlina el SVG bundled (2026-05-01)

Type: **minor**

`SpainCCAAMap` ahora trae embebido el SVG realista de comunidades autónomas
dentro del propio paquete, eliminando la dependencia de que cada app
consumidora copie `spain-map.svg` en su `public/`.

- Nueva variante por defecto `variant="realistic"` que usa el SVG inline
  de `components/shared/spain-ccaa-map-svg.ts`.
- `variant="schematic"` mantiene los paths esquemáticos previos para
  consumidores que no quieran el peso adicional.
- `svgSrc` queda como override opcional para apps que necesiten un SVG
  personalizado (uso raro). Antes era el único modo de obtener el mapa
  realista y exigía publicar el asset en `public/`.
- Para regenerar el SVG inline tras editar el fichero fuente:
  `node -e 'process.stdout.write("export const SPAIN_MAP_SVG = " +
  JSON.stringify(require("fs").readFileSync(
  "components/shared/spain-map.svg","utf8")) + ";\n")' >
  components/shared/spain-ccaa-map-svg.ts`

Breaking change menor: callers que pasaban `svgSrc="/spain-map.svg"` siguen
funcionando, pero ya no es necesario y pueden eliminarlo. Llamadas sin
`svgSrc` que antes renderizaban el esquemático ahora renderizan el realista
por defecto; pasar `variant="schematic"` recupera el comportamiento previo.

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



