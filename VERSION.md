# mycolegal-ui — Version History

> Formato: `VV.vv.rr` — misma versión que la plataforma.
> Solo se registran las versiones en las que este repo tiene cambios.

---

##  — Fixes ded incidencias TEST (2026-08-05)

Type: **revision**




##  — fixes de consultor (2026-07-23)

Type: **revision**




##  — fixes (2026-07-22)

Type: **revision**




##  — Fixes prod (2026-07-17)

Type: **revision**




##  — Fixes del job de resoluciones BOE y reorganizacion de gestorias en Tramitacion (2026-07-11)

Type: **revision**




##  — Fixes en TEST (2026-06-29)

Type: **revision**




## 1.98.0 — Cookies host-aware (`Domain` por host) (2026-06-24)

Type: **minor**

Las cookies de sesión/idioma/impersonación de `server/*` (auth-routes,
language, impersonation) ahora resuelven el atributo `Domain` por petición:
si el host de la request NO es sufijo del dominio compartido configurado
(`COOKIE_DOMAIN`, p.ej. `.mycolegal.app` / `.test.mycolegal.app`), se emite
una cookie host-only (sin `Domain`) en lugar de una que el navegador
descartaría. Sin esto, al servir la app en un host fuera de ese dominio —la
URL `*.run.app` de Cloud Run que ataca el e2e— el `Set-Cookie` del proxy de
idioma (`PATCH /api/auth/me/profile`) se perdía y el reload del toggle ES/CA
volvía a leer el idioma viejo del JWT (rompía `peticiones/i18n-portal`). En
prod/preprod reales el host sí pertenece al dominio compartido, así que se
conserva el `Domain` y el SSO cross-subdominio funciona igual. Nuevo helper
`server/cookie-domain.ts` (`effectiveCookieDomain`). Set y clear usan la
misma resolución para que el borrado siga casando con el alta.

##  — Primera versión de Polizas (2026-06-17)

Type: **revision**




##  — Nuevos logos B2B (2026-06-15)

Type: **revision**




## 1.95.0 — Auto-provisioning resiliente a drift de roles (2026-06-15)

Type: **minor**

`provisionUserRole` ya no revienta (y echa al usuario al login) cuando el
`app_role_key` centralizado del catálogo global B2B (#78) no es un valor del
enum de rol local de la app: degrada a `defaultRole` y, opcionalmente, valida
contra `validRoles`. Fix transversal a todas las apps del patrón que afectó a
Consultor (incidencia CGN-test / `USUARIO_NOTARIA`).

---

##  — Reserva de números de protocolo (2026-06-14)

Type: **minor**




## 1.87.0 — Factory de rutas /api/auth/* (2026-05-27)

`server/auth-routes.ts`: `createAuthRoutes(config)` — hermano de
`createIncidentsRoutes`/`createNotificationsRoutes`. Empaqueta los handlers de
`/api/auth/*` que son funcionalmente idénticos en las 10 apps de usuario:
`changePassword`, `impersonate`, `impersonateStop`, `profile` (GET/PATCH),
`refresh`, `sessionTimeout`, `logout`. Reusa `auth-proxy`/`impersonation`/`language`.
Cada app instancia una vez en `src/lib/auth-server.ts` y re-exporta `POST`/`GET`/`PATCH`
desde cada `route.ts`. `login`/`login/select-org` (org-select) y `me`
(ROLE_PERMISSIONS) se quedan in-app por ser específicos de cada app.

## 1.76.0 — Conector vía daemon loopback (transporte A) (2026-05-22)

`lib/local-integration.ts`: el transporte del conector pasa de extensión +
native messaging a **daemon loopback**. `AGENTE_HTTP`/`AGENTE_COMANDO` ahora
llaman por `fetch` a `http://127.0.0.1:47117/{proxy,exec}` (el daemon responde
con CORS + Private Network Access). Si el daemon no responde →
`conector-no-disponible` → fallback manual. API pública (`ejecutarIntegracionLocal`,
`RecetaIntegracion`, `PlantillaComando`) sin cambios.

---

## 1.75.0 — Transportes de agente en el runtime de integración (A2) (2026-05-22)

`lib/local-integration.ts` deja de devolver `transporte-no-soportado` para
`AGENTE_HTTP`/`AGENTE_COMANDO` y los ejecuta vía el conector local (extensión +
native messaging; ver `mycolegal-platform/connector/`):

- **AGENTE_HTTP** → `proxy` (HTTP a la LAN sin CORS) por el puente
  `window.postMessage` ↔ content script ↔ background ↔ native host.
- **AGENTE_COMANDO** → `exec` de plantilla **firmada (ed25519)**; el host
  verifica firma + allowlist + aprobación y ejecuta sin shell.
- Nuevo tipo `PlantillaComando` (signed_blob + signature + params);
  `requestTemplate` pasa a `PlantillaPeticion | PlantillaComando`.
- Sin conector instalado → `{ok:false, reason:'conector-no-disponible'}` → el
  consumidor cae a entrada manual (mismo patrón de fallback que A1).

---

## 1.74.0 — Runtime de integración local (`lib/local-integration.ts`) (2026-05-22)

`ejecutarIntegracionLocal(receta, inputs)`: ejecuta recetas de integración local (las
devuelve el hub `facturae`) contra sistemas de la LAN de la notaría. A1 soporta
`HTTP_DIRECT` (fetch directo con CORS); `AGENTE_*` (extensión + native messaging) llega
en A2. Módulo puro, sin peer-deps. Ver `mycolegal-platform/PLAN_INTEGRACION_LOCAL.md`.

## 1.73.0 — Notificaciones: proxy catch-all compartido (mismo patrón que incidencias) (2026-05-22)

Type: **minor**

Para que la **campana** funcione igual en todas las apps sin replicar los
4 ficheros de proxy de notificaciones por app:

- Nuevo `server/notifications-routes.ts` → `createNotificationsRoutes(config)`
  con `catchAll` (GET+PATCH+POST). Cada app monta TODO el namespace
  `/api/notifications/*` con un único fichero
  `api/notifications/[[...path]]/route.ts`:

  ```ts
  import { notificationsRoutes } from '@/lib/notifications-server';
  export const { GET, PATCH, POST } = notificationsRoutes.catchAll;
  ```

  Cubre list (GET /), unread-count (GET /unread-count), mark-one
  (PATCH /:id/read) y mark-all (POST /read-all). Auth aplica auth +
  propiedad por path; solo reenvía dentro de `/notifications/*`.

Mismo patrón que el catch-all de incidencias de 1.72.0. Las apps en
`^1.72.0` ya admiten 1.73.0 (caret) → publicar + rebuild, sin tocar
package.json de las apps.

## 1.72.0 — Incidencias: proxy catch-all compartido (un solo fichero por app) (2026-05-22)

Type: **minor**

Para que la pantalla de incidencias se monte igual en todas las apps sin
replicar los ~10 ficheros de proxy por app:

- `createIncidentsRoutes` añade `catchAll` (GET+POST). Cada app monta TODO
  el namespace `/api/incidents/*` con un único fichero
  `api/incidents/[[...path]]/route.ts`:

  ```ts
  import { incidentsRoutes } from '@/lib/incidents-server';
  export const { GET, POST } = incidentsRoutes.catchAll;
  ```

  Cubre report (POST base), `mine`, `org`, `org-app`, `by-number`, hilo
  (messages/close/reopen) y screenshots. Auth sigue aplicando auth +
  permisos por path; solo reenvía dentro de `/incidents/*` (nunca toca el
  admin `/orgs/:orgId/incidents/*`). Añadir un endpoint nuevo = cero
  cambios en apps. Los handlers explícitos del factory se mantienen por
  retrocompatibilidad.
- `proxyToAuth` (auth-proxy): las respuestas no-JSON se reenvían como
  bytes con su `content-type` (antes se leían con `.text()` y corrompían
  binarios) → el screenshot del hilo de incidencias ya funciona vía proxy.

Aditivo y retrocompatible: `catchAll` es nuevo y los handlers previos
siguen exportados.

## 1.71.0 — Impersonación: salida del superadmin vuelve al origen (2026-05-22)

Type: **minor**

- `server/impersonation.ts`: nuevo campo `returnUrlAfterStop` en `ImpersonationConfig`.
  Cuando se setea (admin pasa su `APP_URL`), `startImpersonation` deja una cookie
  legible `mc-imp-return` que `stopImpersonation` limpia.
- `ImpersonationBanner`: al salir, redirige a `mc-imp-return` si existe (caso
  superadmin cross-app → vuelve a admin) y si no recarga `/` (caso org_admin).
- También separa cookie de actor vs. cookie de sesión (`actorJwtCookieName` /
  `sessionJwtCookieName`) para soportar que admin (`admin_token`) escriba la
  sesión de impersonación en la cookie compartida `mycolegal-token`.

## 1.70.0 — Impersonación de usuarios (banner + botón en gestión de usuarios) (2026-05-22)

Type: **minor**

Soporte de UI compartida para que un superadmin (desde admin) o un org_admin
(desde notaria/legifirma) actúe como otro usuario.

- `server/impersonation.ts` (nuevo): handler config-driven `startImpersonation` /
  `stopImpersonation` que preserva la sesión del actor en cookies `<name>__actor`
  y conmuta a la sesión de impersonación; usado por las rutas `/api/auth/impersonate`
  y `/api/auth/impersonate/stop` de cada app.
- `components/shared/impersonation-banner.tsx` (nuevo): barra superior persistente
  "Estás actuando como X — Salir", montada por `AppShell` cuando `/api/auth/me`
  reporta `impersonatedBy`.
- `components/admin/users-admin-panel.tsx`: botón "Impersonar" por fila con diálogo
  de confirmación; gating por rol del actor (auto-resuelto vía `/api/auth/me`,
  con props `enableImpersonation` / `currentAuthRole` / `impersonationLandingUrl`).
- i18n `ui.impersonation.*` en cast/cat/eus/gal.

## 1.69.0 — Modal "Mi cuenta": incidencias con scroll, abribles y lectura para gestores de la org (2026-05-22)

Type: **minor**

Arregla la pestaña **Incidencias** del `UserAccountDialog` (modal "Mi
cuenta"), que desbordaba la pantalla sin scroll y no permitía abrir el
hilo de una incidencia:

- `DialogContent` ahora se limita a `max-h-[85vh]` con cabecera fija y la
  pestaña activa con scroll propio. Aplica a las tres pestañas.
- Cada fila de incidencia es clicable y navega a `/incidencias/:number`
  cerrando el modal. Las **propias** siempre; las de **otros usuarios**
  solo si el viewer puede gestionar incidencias de la org. El modal lo
  decide con el flag `canManage` que devuelve el endpoint `org-app` (no
  con el rol del cliente), así que cubre superadmin · org_admin ·
  titulares de `admin:users`. Un usuario normal mantiene la sección
  "otros" como resumen de solo lectura.
- `IncidentThread` añade el prop `readOnly` (oculta responder/cerrar/
  reabrir y muestra un aviso) para que un gestor pueda LEER el hilo de una
  incidencia ajena sin actuar como usuario. `IncidentDetailPage` lo activa
  según `viewerIsReporter` que devuelve el backend.
- `MyIncidentsPage` (página `/incidencias`): un gestor de la org ve **por
  defecto todas las incidencias de su organización** (con columna
  "Reportada por") y un toggle "Toda la organización / Mis incidencias".
  Un usuario normal sigue viendo solo las suyas, sin toggle. Lo decide el
  flag `canManage` que ahora devuelven `GET /incidents/mine` y `GET
  /incidents/org`.
- Claves i18n nuevas `ui.incidentThread.readOnlyNotice` y, en `myIncidents`,
  `colReporter`/`scopeMine`/`scopeOrg`/`titleOrg`/`subtitleOrg`/`emptyOrg`
  (cast/cat/eus/gal).

Backend (mycolegal-auth): las rutas de **lectura** `GET
/incidents/mine/by-number/:number`, `GET /incidents/mine/:id` y `GET
/incidents/mine/:id/messages` (+ screenshot) traen la incidencia con
`bypassOwnership` y luego permiten **dueño ∨ gestor de la org** (helper
`userHasOrgUserManagement`, mismo criterio que el panel admin); 404 en
otro caso. El read-receipt solo se marca si quien abre es el reporter.
`GET /incidents/mine` y `GET /incidents/org-app` añaden `canManage`; nueva
ruta `GET /incidents/org` (gestores; 403 si no) lista todas las
incidencias de la org. Las rutas de **escritura** (responder/cerrar/
reabrir) siguen estrictamente del propietario. La respuesta de detalle
incluye `viewerIsReporter`.

Las apps de usuario (notaria, legifirma, archivo) añaden el proxy
`/api/incidents/org` con su `@/lib/proxy` local (como `/notifications`),
para no acoplar el build de la app a la versión del factory de ui.
`MyIncidentsPage` degrada con gracia (cae a "mías" y oculta el toggle) si
una app monta la página sin ese proxy.

Aditivo y retrocompatible: `readOnly` por defecto `false` y los campos
nuevos del backend son opcionales, así que consumidores en 1.68.0 siguen
igual.

## 1.68.0 — Read-receipt en IncidentThread (2026-05-21)

Type: **minor**

`IncidentThreadMessage` añade el campo opcional `readByReporterAt`. El
componente `IncidentThread` muestra, solo en la vista de soporte
(`viewerRole='superadmin'`), si el usuario que reportó ha leído cada
mensaje de soporte ("✓ Leído por el usuario el …" / "Sin leer por el
usuario"). Aditivo y retrocompatible — los consumidores en 1.67.0 siguen
funcionando sin el indicador. Claves i18n nuevas
`ui.incidentThread.readByReporterAt` y `notYetRead` en cast/cat/eus/gal.

El backend (mycolegal-auth) setea `read_by_reporter_at` cuando el
reporter abre su hilo (`GET /incidents/mine/:id/messages`).

## 1.66.0 — IncidentProposalCard + IncidentProposalsList para flujo de agente IA (2026-05-20)

Type: **minor**

Componentes shared para que el panel admin revise propuestas generadas
por el agente IA contra incidencias abiertas.

- `IncidentProposalCard`: tarjeta con el mensaje propuesto al usuario,
  diagnóstico interno colapsable, indicador de `fixCommit/fixRepo` y
  acciones inline aprobar/editar/rechazar. La aprobación de tipo `close`
  con fix queda como `armed` (se dispara con el deploy a prod del repo);
  el resto se envía inmediatamente.
- `IncidentProposalsList`: feed cross-org con filtros por estado
  (pending/armed/sent/rejected) y polling 30s. Apunta por defecto a
  `/api/agent/admin` — admin proxea a auth con bearer + service key.
- i18n cast/cat/eus/gal bajo `ui.incidentProposals.*`.

Consumido inicialmente por mycolegal-admin en una tab "Propuestas IA"
de la página de incidencias.

## 1.62.0 — ClienteFormDialog compartido + edición/baja en ClientPicker (2026-05-16)

Type: **minor**

`ClienteFormDialog` se promueve a componente shared con dos modos
(`create` + `edit`) y soft-delete integrado vía PATCH `active:false`.
`ClientPicker` añade:
- prop `onEdit?: (clienteId: string) => void` que muestra un icono
  lápiz junto al cliente seleccionado para abrir el modal en modo edit.
- prop `refreshToken?: number | string` para forzar refresco del label
  tras editar el cliente sin cambiar `value`.

El modal acepta `apiBase` igual que el picker. Endpoints requeridos:
`GET {apiBase}/{id}`, `POST {apiBase}`, `PATCH {apiBase}/{id}`. El
botón "Dar de baja" se controla con prop `canDelete` (el caller
comprueba el permiso `clientes:delete`). Estado dummy/duplicado de
`ClienteFormDialog` queda obsoleto en `mycolegal-notaria` y se
reemplaza por el shared.

##  — Versión mejorada de DataTables (vistas de tablas) homogéneas para todas las apps (2026-05-14)

Type: **revision**




## 1.59.3 — AppSwitcherBar: fondo unificado con sidebar (2026-05-13)

Type: **patch**

El subheader `AppSwitcherBar` ahora usa exactamente el mismo color de
fondo que el sidebar (`bg-[#0f1b2d]`) en lugar de `bg-slate-500`. Así
header (navy-700), subheader y sidebar comparten paleta oscura y se
perciben como un único bloque de chrome de la app. Bordes pasan a
`border-white/10` y el hover de la cinta colapsada a `hover:bg-white/5`
para integrarse con el resto del cromado oscuro.

---

## 1.59.1 — AppSwitcherBar: subheader conmutador de apps (2026-05-13)

Type: **minor**

Nuevo componente `AppSwitcherBar` que reemplaza la entrada "Mis
aplicaciones" del sidebar por un subheader colapsable justo debajo del
header estándar. Una sola interacción para saltar entre apps habilitadas.

- **API nuevo en `<AppShell>`**: prop `showAppSwitcherBar?: boolean`.
  Cuando es `true`, AppShell renderiza `<AppSwitcherBar apps={apps}
  currentSlug={appSlug} />` entre el `<header>` y los breadcrumbs sin
  alterar el header existente.
- **API nuevo en `<AppSidebar>`**: prop `hideMyApps?: boolean`. Las
  apps que activan el subheader deben pasar `hideMyApps` para no
  duplicar el acceso al catálogo desde el sidebar.
- **Comportamiento**: el subheader usa `bg-slate-500` tanto colapsado
  como expandido. Colapsado = cinta de 18px con un único chevron a la
  derecha (sin texto). Expandido = fila horizontal centrada de
  icono (28px, ≈80% del logo brand del sidebar, sin recuadro) + nombre
  en blanco a 10px, con scroll si hay overflow. App activa marcada con
  underline cyan bajo el nombre.
- **Persistencia**: `localStorage["mc:app-switcher:open"]` por
  usuario+dispositivo. La primera visita arranca expandido.
- **i18n**: nueva sección `ui.appSwitcher.*` (`ariaLabel`, `expand`,
  `collapse`, `loadingApp`) en cast/cat/eus/gal. Los strings sólo se
  usan como `aria-label`/`title` — la cinta colapsada no muestra
  ningún texto.
- **Rollout**: la primera app que lo activa es LegiFirma. Resto de
  apps mantienen `MyAppsSection` hasta migrarse.

---

## 1.58.0 — DataTable con prop `source` (auto cliente/servidor por umbral) (2026-05-12)

Type: **minor**

`DataTable` ahora acepta una `RemoteDataSource` opcional que encapsula
fetch, paginación y búsqueda; las apps consumidoras no replican esa
lógica en cada página.

- **API nuevo (backwards-compat)**: en lugar de pasar `data: T[]` +
  `manualPagination` + `pageIndex/pageCount/totalRows/onPaginationChange`,
  la página puede pasar `source={{ endpoint, extraParams?, threshold?,
  refreshKey?, searchParam? }}`. DataTable se encarga del resto.
- **Modo auto por umbral** (default 200): la primera carga pide
  `pageSize=threshold` y mira `meta.total`. Si total ≤ umbral, modo
  client-side (TanStack pagina/ordena/filtra en memoria). Si total >
  umbral, modo server-side: `manualPagination` + debounce 300ms para
  `?search=` al backend, refetch en cada cambio de página/tamaño.
- **Búsqueda siempre sobre toda la población**: el input de búsqueda
  vive dentro del DataTable (controlado), y en modo server-side empuja
  el término al backend, no solo al slice cargado.
- **`refreshKey`** para forzar refetch tras mutaciones.
- **`extraParams`** se serializan via `JSON.stringify` como dep key →
  no fetchea con cada render del padre.
- **Contrato de API esperado**: `{ data: T[], meta: { total, page, pageSize, totalPages } }`.
  Misma forma que ya usan archivo y notaria.

El API legacy (`data` + `manualPagination` controlado) se mantiene sin
cambios.

---

## 1.57.0 — Atajos por app con chip y chord de tres modificadores (2026-05-12)

Type: **minor**

Rediseño del atajo de teclado en `MyAppsSection`:

- **Antes**: `⌘K` abría el flyout y luego una letra suelta lanzaba la app.
  Chocaba con el palette de búsqueda que también usa `⌘K`.
- **Ahora**: combo directo y global por app, sin pasar por el flyout.
  - Mac: `⌘ + ⌥ + ⇧ + <letra>`
  - Windows/Linux: `Ctrl + Alt + Shift + <letra>`
  - Tres modificadores → cero choques con navegador (palette `⌘K`,
    `⌘⇧T` reabrir pestaña, `⌘R` recargar, etc.) y con el OS.
- **Cada app muestra un chip** con su combo a la derecha del nombre,
  en el flyout. Sustituye la letra subrayada como mecanismo de descubrimiento.
- **I18n**: se elimina `ui.myApps.shortcutHint`; `appShortcutTitle` pasa
  de `(pulsa {letter})` a `({combo})`.
- El mapa estable de letras por slug (`STABLE_ACCELS`) se mantiene
  igual — quien ya tuviera memorizada la letra de una app solo nota
  el cambio en los modificadores.

---

## 1.56.0 — `EmailTemplatesManager`: selector + editor WYSIWYG (TipTap) (2026-05-12)

Type: **minor**

Rediseño completo del componente compartido `EmailTemplatesManager`:

- **Layout split**: selector de plantillas a la izquierda (lista compacta
  con badge `Personalizada` / `Por defecto`) y editor a la derecha.
  Colapsa a una columna en móvil.
- **Editor WYSIWYG con TipTap**: toolbar con negrita / cursiva / strike
  / H1-H2 / listas / enlace / undo-redo. El editor emite HTML
  semánticamente limpio. `StarterKit` + `extension-link`.
- **Toggle Visual / HTML**: para editar el código crudo cuando se
  necesitan estilos inline u otras tags no cubiertas por la toolbar.
- **Macros clickeables**: los chips de la lista de "Campos disponibles"
  ahora son botones que insertan `{{name}}` en la posición del cursor
  (visual) o al final (modo HTML).
- **Botón "Insertar logo"** en la toolbar: aparece sólo cuando la
  plantilla declara la macro `logoUrl` (ej. plantillas de auth).
  Inserta un snippet `<img src="{{logoUrl}}" alt="{{orgName}}" ...>`
  centrado con `max-width:200px`. Auth ya sustituye `{{logoUrl}}` por
  la URL del logo de la org en `renderTemplate`.
- **Estado dirty**: los botones `Cancelar` y `Guardar cambios` solo se
  habilitan cuando hay cambios respecto al estado guardado.

Nuevas dependencias: `@tiptap/react`, `@tiptap/starter-kit`,
`@tiptap/extension-link` (~60 KB minified gzip combinados).

La API del componente NO cambia: las apps que ya lo montan
(notaria, legifirma, mycolegal-admin) siguen funcionando sin tocar nada.

---

## 1.55.3 — Fix: editar acceso a la app actual desde el panel admin (2026-05-12)

Type: **revision (bug fix)**

Bug en `UserPermissionsModal`: el checkbox de "acceso" de la app actual
quedaba deshabilitado para **todos** los usuarios editados, no solo
para el propio admin. Resultado: imposible dar/quitar acceso a la
app actual desde el modal — había que abrirlo desde otra app.

La prop `protectedAppSlug` (que era el causante) queda como `@deprecated`
y sin efecto. El backend ya protege contra el caso del "último org_admin
sin acceso" y, en cualquier otro caso, la acción es reversible desde
mycolegal-admin u otra app de la misma org.

---

## 1.55.1 — Pulido del modal de gestión de usuarios (2026-05-11)

Type: **revision**

Pequeños ajustes al modal de gestión de usuarios introducido en `1.55.0`:

- El botón con icono de lápiz en la fila ya no muestra texto "Editar
  permisos" — sólo el icono con tooltip. Mejor ratio info/píxel en
  tablas con muchas columnas.
- El modal abre por defecto en la pestaña **Perfil** y el título cambia
  según la pestaña activa: "Perfil de {name}" / "Permisos de {name}".
  Acompañado de subtítulo coherente.
- La pestaña Perfil se redibuja en grid de 2 columnas con campos
  compactos (`h-8`), sin scroll, sin alterar el alto del modal — se
  fija un `min-h` en el contenedor de Tabs para que cambiar de
  pestaña no haga "saltar" el modal.

Nuevas claves i18n: `ui.usersAdmin.modalTitleProfile`,
`ui.usersAdmin.modalSubtitleProfile`.

---

## 1.55.0 — Panel de usuarios: edición de perfil, restablecer contraseña y papelera redibujada (2026-05-11)

Type: **minor**

Tres mejoras en `UsersAdminPanel` + `UserPermissionsModal`:

1. **Edición de perfil** — el modal ahora tiene dos pestañas (`Permisos` /
   `Perfil`). La pestaña Perfil permite cambiar `displayName`, `email`,
   `phoneNumber` e `idioma` del usuario. El email tiene control de
   unicidad en auth.
2. **Restablecer contraseña** — botón nuevo en la toolbar de acciones
   del modal. Disponible para usuarios `active`/`suspended` (no para
   `invited`, que usan "Reenviar invitación"). Dispara el mismo flujo
   `/auth/reset-password/request` que la opción de self-service, pero
   iniciado por el admin.
3. **Diálogo de la papelera** — la papelera ya no ofrece "Desactivar
   en {app}" (la revocación por app vive en el modal de Permisos).
   Ahora presenta opciones claras: **Suspender** (reversible, bloquea
   login en toda la org), **Reactivar** (si ya estaba suspendido) y
   **Eliminar definitivamente**. Botón `Cancelar` siempre visible y
   centrado.

Nuevos exports en `server/admin`:
- `createUsuariosByIdProfileRoute` — `PATCH /permissions/[authUserId]/profile`
- `createUsuariosByIdSendPasswordResetRoute` — `POST /permissions/[authUserId]/send-password-reset`

Nuevos campos en `UserRow`: `phoneNumber`, `language` (rellenados por
el sync de auth, opcionales).

---

## 1.54.0 — `AppSidebar`: título único en blanco desde `apps.json` (2026-05-11)

Type: **minor (breaking)**

`AppSidebar` reemplaza las props `brandPrefix` + `brandHighlight` por una
sola prop `title: string`. El título se renderiza íntegro en blanco, sin
palabra resaltada en color de acento. El acento sigue aplicándose al
icono de marca y al avatar de usuario vía la prop `accent`.

Cada consumidor debe pasar `title="..."` exactamente como aparece en
`mycolegal-platform/apps.json`. Se eliminó también el campo
`highlightTextClass` del tipo `AppSidebarAccent`.

Apps actualizadas: actas, archivo, cancelaciones, consultor, docfilling,
facturae, legifirma, moratorias, notaria, peticiones, tributos.

---

## 1.53.0 — `DocumentProducer`: helper compartido para producción de documentos (auto/manual) (2026-05-10)

Type: **minor**

Componente compartido para cualquier app que produce documentos: actas,
cancelaciones, consultor. Maneja los dos caminos:

- **Auto**: invoca al engine de la app (local RTF o DocFilling Python si
  está contratado) y adjunta el resultado al expediente.
- **Manual**: ficha con (a) instrucciones paso a paso, (b) descarga de la
  plantilla en blanco vía signed URL, (c) tabla "datos a usar" con
  botón 📋 copiar por celda, (d) input de subida del documento producido.

El modo se decide en runtime por el endpoint `resolve` que la app
inyecta como prop (la app envuelve `GET auth /document-templates/.../resolve`
con su propio GCS para signed URLs). Si el modo es `auto+manual` se
muestra tabs para que el oficial elija.

API expuesta:
- `<DocumentProducer />` con props `resolve, values, uploadEndpoint, generateEndpoint?, onProduced?`.
- Tipos `DocumentProducerProps`, `DocumentProducerResolution`, `DocumentFieldSpec` exportados desde el index.


## 1.51.1 — `ActPicker`: scroll infinito + orden alfabético (2026-05-09)

Type: **patch**

Mejoras de usabilidad sobre la 1.51.0. La 1.51.0 abría con sólo 20
items y no había forma de ver el resto sin escribir, lo que en notaria
(catálogo de 400+ actos) parecía "primera página" como antes.

**Cambios**

- Scroll infinito en el dropdown: al llegar al fondo carga la siguiente
  página y la concatena. Usa `meta.total` del endpoint para parar.
- `pageSize` default subido de 20 a 50 (cabe en el alto del dropdown
  sin scroll inmediato).
- Forzado `?sortBy=nombre&sortOrder=asc` para que la lista al abrir
  sea navegable. El default genérico `createdAt desc` del endpoint de
  notaria no aplica a un catálogo.
- Indicador `n/total` + hint "desplázate para ver más" cuando hay más
  páginas pendientes.

**i18n**

- Nuevas keys `ui.actPicker.loadingMore` y `ui.actPicker.scrollHint` en
  cast/cat/eus/gal.

---

## 1.51.0 — `ActPicker`: selector compartido de acto jurídico con búsqueda server-side (2026-05-09)

Type: **minor**

Nuevo componente shared `ActPicker` paralelo a `ClientPicker` para
catálogos de actos jurídicos. Reemplaza el `SearchableSelect` cliente
en notaria/pre-expedientes, donde el cap interno de 50 elementos
client-side dejaba inalcanzables los actos posteriores ("solo primera
página" reportado por el usuario).

**`ActPicker`** (`components/shared/act-picker.tsx`)

- Lista al abrir (`pageSize=20` por defecto, sin minLength) y filtra al
  escribir con debounce 300ms — la búsqueda corre server-side contra
  `?search=…&pageSize=…`.
- Lookup individual al recibir `value` desde fuera vía `GET {apiBase}/{id}`.
- Display compacto: `codigo` (mono, gris) — `nombre` (negrita) —
  `categoria` (gris pequeño).
- `apiBase` configurable. Default `/api/catalogs/actos-juridicos`
  (notaria); apps con otro path (archivo: `/api/actos-juridicos`) lo
  pasan como override y deberán añadir su propio endpoint `/[id]`
  cuando migren.
- **Sin `onCreateNew`** — el catálogo de actos lo gestiona consultor;
  los usuarios sólo escogen entre los existentes.

**i18n**

- Nueva sección `ui.actPicker` con `placeholder`, `searching`,
  `noResults`, `clearAria` en cast/cat/eus/gal.

---

## 1.45.2 — Recuperar "crear con contraseña inicial" en el invite dialog (2026-05-08)

Type: **patch**

Restaura la capacidad de crear usuarios con una contraseña que el admin
introduce a mano, perdida cuando se migró el panel inline de
mycolegal-admin al `UsersAdminPanel` compartido. Ahora disponible en
las 11 apps + admin (`allowInitialPasswordInvite` por defecto `true`).

**`InviteUserDialog`**

- Nuevo prop `allowInitialPassword?: boolean` (default `true`).
- Cuando está activo, el modal expone un radio "Modo de creación":
  **Enviar invitación por email** (default) / **Crear con contraseña inicial**.
- En modo password aparece un campo `password` con botón ojo
  (`Eye`/`EyeOff`) y un hint *"El usuario tendrá que cambiarla en el
  primer login"*. Validación cliente mín. 8 caracteres (alineado con
  el `createWithPasswordSchema` de auth).
- `onSubmit` recibe `data.initialPassword?` cuando aplica; el panel
  decide qué endpoint llamar (`/invite` o `/create-with-password`).

**Factory `createUsuariosCreateWithPasswordRoute`**

- `POST /api/admin/usuarios/create-with-password` proxiea a auth's
  `POST /orgs/:orgId/users/create-with-password` (ya existente; guard
  `requireOrgUserManagement()` permite org_admin desde 2.4.9).
- Validaciones: 422 si falta cualquier campo o si la password tiene
  <8 chars (igual que auth's zod schema, pero validado en frontend
  para feedback inmediato).
- Tras crear, override del rol con `appRoleKey=appRole` vía
  `PUT /orgs/:orgId/users/:uid/permissions/:appSlug` (mismo patrón
  que `createUsuariosInviteRoute`). Local UserRole upsert si hay
  prisma.

**`UsersAdminPanel`**

- Nuevo prop `allowInitialPasswordInvite?: boolean` (default `true`).
- `handleInvite` ahora ramifica por `data.initialPassword`: pega a
  `/create-with-password` si viene, a `/invite` si no.

**i18n** (cast/cat/eus/gal)

- `inviteModeLabel`, `inviteModeEmail`, `inviteModePassword`,
  `invitePassword`, `invitePasswordHint`, `invitePasswordPlaceholder`,
  `invitePasswordTooShort`, `btnShowPassword`, `btnHidePassword`,
  `btnCreateUser`, `btnCreatingUser`, `toastUserCreatedWithPassword`.


## 1.45.1 — Modal: reenvío de invitación + escala a 11+ apps + factory sin prisma (2026-05-08)

Type: **patch**

Acompaña a `mycolegal-auth@2.4.9` (relax del guard en `/resend-invitation`).

**Modal `UserPermissionsModal`**

- Botón **"Reenviar invitación"** condicional al inicio del modal
  cuando `user.authStatus === 'invited'`. Tooltip explica que invalida
  la invitación anterior y manda una nueva. Llama a
  `POST {apiBase}/permissions/{authUserId}/resend-invitation`.
- Layout escalable: `max-w-4xl`, `max-h-[90vh] flex flex-col`, grid de
  apps `xl:grid-cols-4` (4 cols en pantalla grande, 3/2/1 al bajar) con
  `overflow-y-auto` si crecen. Validado mentalmente con 11 apps —
  3 filas en xl, sin descuadre.

**Shared route factory `usuarios-routes.ts`**

- `prisma` pasa a opcional (`AdminPrisma | null | undefined`). Apps
  sin DB local (mycolegal-admin) lo dejan `undefined` y todas las
  ramas que tocan `userRole.findMany/upsert/update/delete` se gatean
  con `if (prisma)`. La fallback "auth caído → leer local" se
  cortocircuita con `AUTH_ERROR` cuando no hay DB local.
- `resolveOrgId({ auth, params })` opcional para que mycolegal-admin
  saque el orgId del segmento `[id]` de la URL en lugar del JWT
  (`_system`).
- Nuevo factory **`createUsuariosByIdResendInvitationRoute`** —
  `POST /permissions/[authUserId]/resend-invitation`.

**Refactor menor**

- PATCH `/api/admin/usuarios/[id]` devuelve 501 cuando no hay prisma
  (mycolegal-admin no necesita PATCH; los cambios de rol/active van
  por la PUT cross-app del modal).
- DELETE soporta `prisma` ausente: usa `body.authUserId || params.id`
  como `resolvedAuthUserId` y se salta la limpieza local.

**i18n**

- Nuevas claves `btnResendInvitation`, `btnResendingInvitation`,
  `resendInvitationHint`, `toastInvitationResent`,
  `toastResendInvitationError` en cast/cat/eus/gal.


## 1.45.0 — Panel compacto + modal cross-app + i18n completo en `usersAdmin` (2026-05-08)

Type: **minor**

Acompaña a `mycolegal-auth@2.4.8` (catálogo apps+roles, `otherApps[i].appRoleKey`).

**Panel `UsersAdminPanel`**

- Filas más densas: avatar pequeño + nombre/email apilados, badges
  `text-xs px-1.5 py-0`.
- Columna **Apps activadas** con chips de tamaño uniforme
  (`min-w-[4.5rem] max-w-[7rem] truncate`); la app actual destacada en
  variante `default`, el resto en `outline`.
- Edición inline retirada: ahora una sola acción `Editar permisos` por
  fila abre el modal cross-app. `Eliminar` queda como icon-only con
  `title=` para accesibilidad.
- Nuevo prop **requerido `appSlug`** (las 9 apps consumidoras se
  actualizan en este mismo turno).
- Nuevo prop opcional `showOrgRoleInModal` (default `true`).

**Nuevo componente `UserPermissionsModal`**

- Una tarjeta del mismo tamaño por cada app activa de la org
  (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`).
- Cada tarjeta tiene un toggle (acceso sí/no) + selector de rol; el
  default role para "grant" se toma del `AppRole.isDefault` que llega
  del catálogo.
- Toggle org-level `org_admin`/`user` arriba (configurable vía
  `showOrgRoleInModal`).
- Diff sobre el estado inicial al guardar → llama una sola vez a
  `PUT /api/admin/usuarios/permissions/[authUserId]`.

**Nuevos endpoints en `server/admin`**

- `createUsuariosAppsCatalogRoute(deps)` — `GET /apps-catalog`
  passthrough a auth.
- `createUsuariosByIdPermissionsRoute(deps)` — `PUT
  /permissions/[authUserId]` con shape `{ apps:[{slug,appRoleKey}],
  removeApps:[slug], authRole? }`. Aplica diffs vía PUT/DELETE de
  `/orgs/:orgId/users/:uid/permissions/:slug` y, si la app actual
  cambia, sincroniza el `UserRole` local.

**i18n**

- Bloque `ui.usersAdmin` reescrito con TODOS los literales del panel
  + modal en `cast.json`, `cat.json`, `eus.json`, `gal.json`. Se
  retiran los hardcodes que se habían colado en 1.44.5
  (`Sin acceso`, `Dar acceso a [App]`, `Apps activadas`, toasts).
- Nuevo subobjeto `statusEnum.*` para los badges de estado de auth.

**Tipo `UserRow`**

- `role` pasa a `string | null` (se pone a `null` cuando
  `hasAppAccess === false`).
- Nuevo campo opcional `authRole` (`org_admin` | `user` | …) — fuente
  para el toggle del modal.
- `otherApps[i]` ahora puede traer `appRoleKey`.


## 1.44.5 — Panel de administración: distinguir acceso por app y mostrar apps activadas (2026-05-07)

Type: **patch**

`UsersAdminPanel` y el route factory `createUsuariosRoutes` se actualizan
en tándem con `mycolegal-auth@2.4.6` (`/sync/:appSlug` ahora devuelve
todos los miembros de la org).

Cambios:

- Cada fila incluye `hasAppAccess: boolean` (canónico desde
  `UserAppPermission` en auth, no del `UserRole` local).
- Nueva columna **Apps activadas** con badges para cada app que el
  usuario tiene activa (la actual destacada en `default`, el resto en
  `outline`).
- Cuando `hasAppAccess === false`: el rol se muestra como `—`, el
  estado como **Sin acceso** y el bloque de acciones se reduce a
  **Dar acceso a [App]**, que abre un selector de rol y llama al
  POST `/api/admin/usuarios` existente (que crea la
  `UserAppPermission` y el `UserRole` local).
- `UserRow.role` pasa a `string | null` para reflejar el caso "sin
  acceso aún".


## 1.44.4 — TranslationMessages recursivo para defaults i18n del paquete (2026-05-07)

Type: **patch**

El tipo `TranslationMessages` estaba definido como
`Record<string, string | Record<string, string>>`, lo que solo permitía 2
niveles de anidamiento. Las defaults shippeadas con el paquete
(`i18n/cast.json`, etc.) tienen 3+ niveles (p. ej. `ui.userAccount.lang.cast`),
lo que rompía el `tsc` de cualquier app consumidora con un error de
"Conversion of type ... may be a mistake" en `i18n/index.ts:23`.

Se cambia a una `interface` recursiva: `{ [key: string]: string | TranslationMessages }`.

---

## 1.44.3 — Fix type error en NotificationsBell tras refactor i18n (2026-05-07)

Type: **patch**

`notifications-bell.tsx:363` llamaba a `formatRelative(detail.createdAt)` con
1 argumento; tras el refactor i18n (`44cc5a7`) la función pasó a requerir
`(iso, t)`. La línea 325 sí se actualizó pero la 363 quedó descolgada,
rompiendo el `tsc` de cualquier app consumidora. Bug latente en 1.44.0/1/2.

---

## 1.44.1 — SetPasswordForm/ForgotPasswordForm: inputs self-contained (2026-05-07)

Type: **patch**

`SetPasswordForm` y `ForgotPasswordForm` añaden `bg-white text-mc-slate-900` en
los `<input>`. Sin esto, los inputs heredaban `color: inherit` del `<body>` del
host (e.g. el `body class="text-white"` de landing) y las contraseñas se tecleaban
en blanco sobre fondo blanco — invisible. Cambio defensivo: el componente queda
self-contained y deja de depender del color de texto del host.

---

## 1.43.0 — LoginForm: prop `forgotPasswordUrl` para apuntar a landing (2026-05-06)

Type: **minor**

`LoginForm` añade el prop opcional `forgotPasswordUrl` (default `/forgot-password`).
Permite que cada app pase la URL absoluta al portal de landing
(`${PORTAL_URL}/forgot-password`) en lugar del fallback in-app. Las apps
consumidoras pueden eliminar sus páginas `(auth)/forgot-password` y delegar el
flujo a landing. Backwards-compatible — apps que no pasen el prop mantienen el
comportamiento previo.

---

## 1.42.0 — HeaderActions: slot por portal en lugar de children del PageTitle (2026-05-06)

Type: **minor**

Refactor del patrón de "acciones en el top bar". Antes el consumer pasaba
los widgets como `children` al `<PageTitle>`, que los almacenaba en
`PageHeaderContext` vía `setHeader({ actions: children })` y el AppShell
los re-renderizaba. El patrón tenía una race condition real (observada
en e2e de peticiones / i18n-portal): cuando el consumer re-renderizaba
y propagaba un nuevo `<JSX/>` a `setHeader`, el AppShell quedaba con
`header.actions = null` y el slot no se pintaba.

**Patrón nuevo**: `<HeaderActions>` portal'd via `createPortal` a un
`<div ref={registerActionsSlot}/>` que el AppShell mounta dentro del
header. Cero state para las actions, cero useEffect, cero loops; React
maneja el árbol naturalmente.

API pública:
- `<HeaderActions>{children}</HeaderActions>` — nuevo, recomendado.
- `<PageTitle title=... subtitle=... />` — children está **deprecated**
  pero sigue funcionando por backward-compat (renderiza
  `<HeaderActions>{children}</HeaderActions>` internamente, así los
  consumers actuales no se rompen).
- `usePageHeader()` ahora también expone `actionsSlot` y
  `registerActionsSlot` para integraciones avanzadas. La forma `header.actions`
  ya no existe.

Migración recomendada para apps consumer:
```tsx
// Antes:
<PageTitle title="Peticiones" subtitle="...">
  <LangToggle />
</PageTitle>

// Después:
<PageTitle title="Peticiones" subtitle="..." />
<HeaderActions>
  <LangToggle />
</HeaderActions>
```

Sin cambios en `AppShell` para los consumers (la API pública del shell
no cambia). Apps que pasan children al `PageTitle` siguen funcionando
sin migrar.

## 1.41.0 — Helpers compartidos para resolución/persistencia de idioma (2026-05-05)

Type: **minor**

Nuevo módulo `@mycolegal-app/ui/server/language` que consolida la lógica
de cookie + cascada JWT + factory de PATCH proxy que estaba copiada en
las 10 apps consumer (notaria, legifirma, archivo, cancelaciones,
consultor, docfilling, facturae, peticiones, tributos, actas).

API pública:

- Constantes: `LANG_COOKIE_NAME`, `LANG_COOKIE_MAX_AGE`, `VALID_LANGS`.
- Tipos: `Language`, `LanguageCookieOpts`, `ProfileProxyConfig`.
- Type guards: `isValidLanguage`, `pickLanguage`.
- JWT: `languageFromJwt(token)` — decode sin verify.
- Cookie ops: `setLanguageCookie(res, lang, opts)`,
  `clearLanguageCookie(res, opts)`.
- Layout: `await resolveDashboardLanguage({ jwtCookieName, fallback? })` —
  cascade cookie → JWT → fallback.
- Factory: `createProfileProxyHandlers({ authInternalUrl, jwtCookieName,
  cookieOpts })` → `{ GET, PATCH }` para `/api/auth/me/profile`. PATCH
  siembra `mc_lang` automáticamente cuando auth confirma cambio de idioma.

Cada app consumer pasa de ~60 líneas duplicadas a ~5 llamadas a estos
helpers. La adopción se hace app por app — el patrón viejo sigue
funcionando hasta que cada repo migre.

## 1.40.0 — UserAccountDialog refresca al cambiar idioma (2026-05-05)

Type: **minor**

Cuando el usuario cambia su idioma de preferencia desde la pestaña
"Mi cuenta" del modal y guarda, el dialog detecta el cambio y dispara
`router.refresh()` para que el layout server-side vuelva a ejecutarse
con el nuevo idioma. El cambio de los demás campos (nombre, NIF, etc.)
no provoca refresh — sigue siendo update silencioso con toast.

Esto requiere que la app consumer:

1. Sirva un layout server component que lea el idioma desde una cookie
   (p.ej. `mc_lang`) en cada render.
2. Tenga un proxy `PATCH /api/auth/me/profile` que, cuando auth (privado)
   confirme el cambio, siembre la cookie `mc_lang` en su propio dominio.

Sin estas dos piezas el `router.refresh()` no tiene efecto visible — la
UI seguirá mostrando los mensajes anteriores. Notaria es la primera app
con el patrón completo cableado (mycolegal-notaria 2.10.5).

## 1.39.1 — Fix type-check ES2017 en release-notes.tsx (2026-05-05)

Type: **revision**

Las regex internas de `ReleaseNotes` usaban named capture groups
(`(?<code>…)`, `(?<bold>…)`, `(?<version>…)`, etc.), sintaxis que
requiere target ES2018+. Las apps consumidoras (admin, facturae,
notaria, …) tienen `target: ES2017` en su `tsconfig.json`, así que
el type-check del Docker build fallaba con `Named capturing groups
are only available when targeting 'ES2018' or later`.

- `INLINE_RE`, `HEADING_RE` y `TYPE_RE` pasan a usar grupos numerados
  (`m[1]`, `m[2]`, `m[3]`) — comportamiento idéntico, compatible con
  ES2017.
- Sin cambios de API ni de UX.

## 1.39.0 — AppInfoButton muestra notas de versión (2026-05-05)

Type: **minor**

El modal de "Acerca de" del header (componente `AppInfoButton`) ahora
muestra un panel scrollable con las notas de versión bajo la tabla de
versiones. La app consumidora debe exponer su `VERSION.md` vía
`GET /api/version/notes` (devuelve `text/markdown` o 204 si no hay).

- Nuevo hook `useReleaseNotes(enabled)` — fetch perezoso al abrir el
  modal, con cache de módulo igual que `useVersionInfo`.
- Nuevo componente interno `ReleaseNotes` con renderer markdown propio
  (cero dependencias). Soporta headings de versión `## X.Y.Z — title
  (date)`, badge de `Type`, listas, **bold**, `code`, párrafos y
  bloques de diffstat (colapsados en `<pre>`).
- Modal ensanchado a `max-w-2xl` con scroll interno (`max-h-[85vh]`).
- Si la app no implementa `/api/version/notes` o devuelve 204, el panel
  muestra un empty state silencioso — no rompe la UX.

## 1.37.3 — NotificationsBell: detail modal vía portal a body (2026-05-04)

Type: **patch**

El modal de detalle aparecía pequeño y pegado al sidebar (no centrado)
en legifirma porque el sidebar/AppShell tiene un ancestro con
`transform`/`filter` que crea un containing block y rompe
`position: fixed`. Fix: rendrizar el modal vía `createPortal` a
`document.body`, así `inset-0` referencia siempre al viewport.

---

## 1.37.2 — NotificationsBell: dropdown anclado + modal de detalle full-screen (2026-05-04)

Type: **patch**

Restablece el dropdown anclado al sidebar (lista de notificaciones) y
deja el modal centrado a pantalla completa SOLO para la vista de
detalle: click en una notificación de la lista cierra el dropdown y
abre directamente el modal centrado con el detalle completo. Sin
botón "Ir al detalle", sin redirects.

(Reemplaza el comportamiento de 1.37.1, donde la lista misma se abría
como modal centrado — pedido contradictorio del usuario.)

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



