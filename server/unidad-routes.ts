import { NextResponse, type NextRequest } from 'next/server';
import { extractText } from '@mycolegal-app/sharedlib/text-extract';

/**
 * Factory con TODA la lógica de la Unidad de Red (`DriveNode`) — dominio +
 * rutas `/api/unidad/*` — inyectando las dependencias app-specific (Prisma,
 * almacenamiento GCS y el wrapper de permisos). Cualquier app puede así servir
 * la Unidad en local (sin iframe a `archivo.mycolegal.app`), montando un único
 * catch-all `[[...path]]`.
 *
 * Sigue la forma de `incidents-routes.ts`: un `create*Routes(deps)` que cierra
 * sobre `deps` y devuelve `{ catchAll: { GET, POST } }` (dispatcher del namespace
 * completo) + los handlers nombrados por si una app prefiere cablearlos uno a uno.
 *
 * Modelo de visibilidad (idéntico a archivo):
 *   - `/Compartido`  → visibility ORG     (todos los empleados de la org)
 *   - `/Mi espacio`  → visibility PRIVATE (solo el dueño; admin ve todo)
 *   Los hijos heredan visibility + ownerUserId del padre al crearse.
 *   `managedBy` ≠ null = carpeta de sistema (read-only).
 *
 * Diferencia respecto a archivo: NO existe la proyección virtual "Archivo"
 * (carpetas-año `arc:y:*`, documentos `arc:d:*`, búsqueda `?q=`). La versión
 * compartida es SOLO catálogo: el área "Documentos" lista todas las raíces
 * gestionadas (`managedBy != null`) de la org, sin sustrato legacy.
 */

// --------------------------------------------------------------------------
// Tipos inyectados (todo lo app-specific viaja por `deps`)
// --------------------------------------------------------------------------

/**
 * Scope del "Área de archivos" (intercambio Notaría ↔ partner). Cuando está
 * presente en `auth`, el factory opera en MODO PARTNER (raíces `PARTNER:*`) en
 * lugar del modo Unidad interna (Documentos/Compartido/Mi espacio). Lo resuelve
 * el gate de la app y lo inyecta en `auth`:
 *   - `all`  → interno de la notaría: ve TODAS las raíces `PARTNER:*` de la org.
 *   - `one`  → externo (gestoría/banco): ve SOLO su raíz `PARTNER:{partnerOrgId}`;
 *              en bancos, sub-scope por `partnerDeptIds`; `inboxOnly` limita la
 *              escritura a las carpetas `_bandeja` (`partnerInbox`).
 * Ver PLAN_TECNICO_UNIDAD_DE_RED.md §B.1.
 */
export type PartnerScope =
  | { mode: 'all' }
  | {
      mode: 'one';
      partnerOrgId: string;
      partnerDeptIds?: string[] | null; // null/vacío en gestorías o banco sin restricción de depto
      inboxOnly: boolean;
    };

export interface UnidadAuth {
  authUserId: string;
  orgId: string;
  permissions: string[];
  userRoleId: string;
  /**
   * `true` = el usuario solo ve/gestiona lo suyo (PRIVATE propio + ORG). Cuando
   * es `false`/ausente el usuario es admin (org_admin/superadmin) y ve TODO,
   * incluido lo PRIVATE de otros. Reemplaza el `isOrgAdmin(authRole)` de archivo.
   */
  mine?: boolean;
  /**
   * Presente ⇒ el factory sirve el "Área de archivos" (modo partner) en vez de la
   * Unidad interna. Ausente ⇒ comportamiento legacy intacto. Ver `PartnerScope`.
   */
  partnerScope?: PartnerScope;
}

export interface UnidadStorage {
  buildPath(a: {
    orgId: string;
    ownerUserId?: string | null;
    nodeId: string;
    filename: string;
    /** Modo partner: prefijo físico `_partners/{partnerOrgId}` (opcional). */
    partnerOrgId?: string | null;
  }): string;
  signUploadUrl(gcsPath: string, contentType: string): Promise<{ ok: boolean; url?: string; error?: string }>;
  signDownloadUrl(
    gcsPath: string,
    opts: { filename?: string; disposition?: 'inline' | 'attachment' },
  ): Promise<{ ok: boolean; url?: string; error?: string }>;
  confirmUpload(gcsPath: string): Promise<{ ok: boolean; size?: number }>;
  deleteObject(gcsPath: string): Promise<void>;
  listVersions(gcsPath: string): Promise<{ generation: string; size: number; updated?: string }[]>;
  restoreVersion(gcsPath: string, generation: string): Promise<{ ok: boolean; error?: string }>;
  /**
   * Descarga los bytes del objeto (para extraer texto/OCR server-side, ver
   * `POST /read`). Opcional: sin él, `read` degrada a 501. Devuelve `Uint8Array`
   * (evita `@types/node` en ui; un `Buffer` es un `Uint8Array`).
   */
  readBytes?(gcsPath: string): Promise<Uint8Array | null>;
  /**
   * Descarga el contenido de una generación concreta (para servirla por el
   * server; la signed URL firma siempre la versión viva). Opcional: sin él,
   * la descarga por `?generation=` degrada a 503.
   */
  downloadVersion?(
    gcsPath: string,
    generation: string,
  ): Promise<{ ok: boolean; body?: Uint8Array; error?: string }>;
}

/**
 * Wrapper de permisos del host: `withPermission('unidad:read')(handler)` → un
 * RouteHandler de Next. El handler recibe `(request, { auth, params })` con
 * `params` ya resuelto (objeto plano, no Promise).
 */
type UnidadHandler = (
  req: NextRequest,
  ctx: { auth: UnidadAuth; params: Record<string, string> },
) => Promise<Response> | Response;

export interface UnidadDeps {
  /** Cliente Prisma; usa `driveNode` + `organization` (estructural). */
  prisma: any;
  storage: UnidadStorage;
  withPermission: (
    permission: string,
  ) => (handler: UnidadHandler) => (req: NextRequest, ctx: any) => Promise<Response>;
  /**
   * Resume un texto con IA. Lo inyecta la app (reenvía el texto + el JWT del
   * usuario a Consultor, que cobra 1 crédito y llama a Gemini). Sin él, `resumir`
   * degrada a 501. Ver PLAN_TECNICO_MYCOBOT_TOOLS.md §5.1.
   */
  summarize?: (
    texto: string,
  ) => Promise<{ ok: boolean; resumen?: string; status?: number; error?: string }>;
  /**
   * Incorpora un fichero de la "Biblioteca particular" al corpus PRIVADO de la org
   * (Consultor: enrich + embeddings, resolucion con orgId + clase APORTACION_ORG,
   * enlazada al DriveNode). Lo inyecta la app (reenvía a Consultor con el JWT). Sin
   * él, la acción degrada a 501. El texto ya lo extrae el factory (capa de texto).
   */
  corpusIngest?: (payload: {
    nodeId: string;
    titulo: string;
    texto: string;
    mime: string | null;
  }) => Promise<{ ok: boolean; status?: number; error?: string }>;
  /**
   * OCR por visión de un escaneo (bytes → texto), para `read`/`resumir` cuando el
   * PDF/imagen NO tiene capa de texto. OVERRIDE opcional: si no se inyecta, la
   * factory llama a platform (`POST /internal/ocr`) resolviendo URL+clave por env
   * (`PLATFORM_SERVICE_URL`/`PLATFORM_INTERNAL_URL` + `APPS_REGISTER_SECRET`). Sin
   * override ni env → el escaneo queda sin texto (`needsOcr:true`), como en v0.1.
   */
  ocr?: (bytes: Uint8Array, mime: string | null) => Promise<{ texto: string; chars: number } | null>;
  /**
   * Claves de permiso a exigir. Por defecto `unidad:read`/`unidad:write` (Unidad
   * interna). El montaje del "Área de archivos" (modo partner) pasa
   * `{ read: 'unidad:read_partner', write: 'unidad:write_partner' }`.
   */
  permissions?: { read: string; write: string };
}

// --------------------------------------------------------------------------
// Helpers de respuesta (mismo shape que @mycolegal-app/sharedlib/api; ui no
// depende de sharedlib, así que se reimplementan aquí).
// --------------------------------------------------------------------------

function successResponse<T>(data: T): NextResponse {
  return NextResponse.json({ data });
}

function errorResponse(code: string, message: string, status = 400): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status });
}

// --------------------------------------------------------------------------
// Tipos de dominio
// --------------------------------------------------------------------------

export type DriveNodeType = 'FOLDER' | 'FILE';
export type Visibility = 'ORG' | 'PRIVATE';

export const ROOT_COMPARTIDO = 'COMPARTIDO';
export function rootMiEspacio(authUserId: string): string {
  return `MIESPACIO:${authUserId}`;
}

// Corpus GLOBAL de "Biblioteca legal" (Consultor): una sola copia de los originales
// bajo un orgId SENTINELA (`DriveNode.orgId` es string suelto, no FK), montada
// READ-ONLY en la Unidad de Red de TODA org. La escritura es imposible por diseño:
// el subárbol es `managedBy != null` + la raíz tiene `rootKey` → los guards de
// mutación existentes (managedBy/rootKey) la rechazan. Solo se relaja la LECTURA.
const BIBLIOTECA_ROOT_KEY = 'GLOBAL:BIBLIOTECA';
const BIBLIOTECA_LABEL = 'Biblioteca Digital';
// "Biblioteca particular de <org>": raíz gestionada PERO writable (smart-inbox de
// aportaciones al corpus privado de la org). Vive bajo la org (orgId), aparece en
// Documentos y como atajo dentro de "Biblioteca Digital".
const BIBLIOTECA_PARTICULAR_KEY = 'BIBLIOTECA_PARTICULAR';
const BIBLIOTECA_PARTICULAR_LABEL = 'Biblioteca particular';

interface DriveNodeRow {
  id: string;
  type: string;
  name: string;
  visibility: string;
  ownerUserId: string | null;
  managedBy: string | null;
  writable?: boolean | null;
  rootKey: string | null;
  partnerOrgId: string | null;
  partnerDeptId: string | null;
  partnerInbox: boolean;
  entityType: string | null;
  entityId: string | null;
  entityLabel: string | null;
  mimeType: string | null;
  sizeBytes: bigint | null;
  parentId: string | null;
  createdAt: Date;
}

export interface DriveNodeDTO {
  id: string;
  type: DriveNodeType;
  name: string;
  visibility: Visibility;
  rootKey: string | null;
  managed: boolean;
  mine: boolean;
  /** Modo partner: `true` = carpeta `_bandeja` (única zona escribible por el externo). */
  partnerInbox?: boolean;
  /** Metadatos visuales del smart folder (B.5), si esta carpeta gestionada lo es. */
  smartFolder?: { color: string | null; icon: string | null; description: string | null };
  mimeType: string | null;
  sizeBytes: number | null;
  createdAt: string;
}

export function createUnidadRoutes(deps: UnidadDeps) {
  const { prisma, storage, withPermission, summarize } = deps;

  // OCR de un escaneo (needsOcr) → texto. Usa el override de la app (`deps.ocr`) si
  // viene; si no, llama a platform (servicio-a-servicio, sin JWT) resolviendo la URL
  // y la clave por env. Devuelve null si no hay OCR disponible → el escaneo queda
  // sin texto (comportamiento v0.1), nunca lanza.
  const resolveOcr = async (
    bytes: Uint8Array,
    mime: string | null,
  ): Promise<{ texto: string; chars: number } | null> => {
    try {
      if (deps.ocr) return await deps.ocr(bytes, mime);
      const platformUrl = process.env.PLATFORM_SERVICE_URL || process.env.PLATFORM_INTERNAL_URL || '';
      const serviceKey = process.env.APPS_REGISTER_SECRET || '';
      if (!platformUrl || !serviceKey) return null;
      // import dinámico: si la app va con un sharedlib antiguo (sin ocr-client), esto
      // falla y se captura → null (la UR sigue funcionando, solo sin OCR). Evita
      // acoplar el bump de ui al de sharedlib para no romper consumidores.
      const { ocrViaPlatform } = await import('@mycolegal-app/sharedlib/ocr-client');
      return await ocrViaPlatform({ platformUrl, serviceKey, bytes, mimeType: mime ?? undefined });
    } catch (e) {
      console.warn('[unidad] OCR vía platform falló:', e instanceof Error ? e.message : e);
      return null;
    }
  };

  // ------------------------------------------------------------------------
  // Dominio (cerrado sobre `deps`)
  // ------------------------------------------------------------------------

  /** Admin (org_admin/superadmin) ve todo, incluido lo PRIVATE de otros. */
  function isOrgAdmin(auth: UnidadAuth): boolean {
    return auth.mine !== true;
  }

  /** Fragmento `where` Prisma para filtrar por visibilidad (admin ve todo). */
  function visibilityWhere(auth: UnidadAuth): Record<string, unknown> {
    if (isOrgAdmin(auth)) return { trashedAt: null };
    return { trashedAt: null, OR: [{ visibility: 'ORG' }, { ownerUserId: auth.authUserId }] };
  }

  // ---- Modo partner ("Área de archivos") -----------------------------------

  /**
   * Fragmento `where` de aislamiento por partner (SIN `trashedAt`). `all` =
   * interno de la notaría (todas las raíces partner); `one` = externo acotado a
   * su `partnerOrgId` (+ sub-scope por departamento en bancos). Este fragmento es
   * la ÚNICA llave que impide que una gestoría vea lo de otra.
   */
  function partnerFilter(s: PartnerScope): Record<string, unknown> {
    if (s.mode === 'all') return { partnerOrgId: { not: null } };
    const w: Record<string, unknown> = { partnerOrgId: s.partnerOrgId };
    if (s.partnerDeptIds && s.partnerDeptIds.length) {
      // El nodo entra si no tiene depto (raíz) o si su depto está autorizado.
      w.OR = [{ partnerDeptId: null }, { partnerDeptId: { in: s.partnerDeptIds } }];
    }
    return w;
  }

  /**
   * Filtro de lectura efectivo: en modo partner sustituye por completo al de
   * visibilidad ORG/PRIVATE (que NO debe aplicarse a un externo — filtraría por
   * lo compartido de la notaría). Incluye `trashedAt: null`.
   */
  function scopeWhere(auth: UnidadAuth): Record<string, unknown> {
    if (auth.partnerScope) return { trashedAt: null, ...partnerFilter(auth.partnerScope) };
    return visibilityWhere(auth);
  }

  /** ¿El nodo cuelga de (o es) una carpeta `_bandeja` (`partnerInbox`)? */
  async function isInsideInbox(
    node: { id: string; parentId: string | null; partnerInbox: boolean },
    orgId: string,
  ): Promise<boolean> {
    let cur: { id: string; parentId: string | null; partnerInbox: boolean } | null = node;
    for (let i = 0; i < 50 && cur; i++) {
      if (cur.partnerInbox) return true;
      if (!cur.parentId) break;
      cur = await prisma.driveNode.findFirst({
        where: { id: cur.parentId, orgId },
        select: { id: true, parentId: true, partnerInbox: true },
      });
    }
    return false;
  }

  /**
   * ¿Puede el usuario ESCRIBIR (crear/renombrar/mover/borrar/versionar) sobre este
   * nodo? Modo partner `one` con `inboxOnly` ⇒ solo dentro de `_bandeja`; `all`
   * (notaría) ⇒ gobierna toda la estructura. Fuera de modo partner devuelve true
   * (el llamante ya validó `managedBy`).
   */
  async function partnerWriteAllowed(
    auth: UnidadAuth,
    node: { id: string; parentId: string | null; partnerInbox: boolean },
  ): Promise<boolean> {
    const s = auth.partnerScope;
    if (!s || s.mode === 'all' || !s.inboxOnly) return true;
    return isInsideInbox(node, auth.orgId);
  }

  function serializeNode(n: DriveNodeRow, auth: UnidadAuth): DriveNodeDTO {
    return {
      id: n.id,
      type: n.type as DriveNodeType,
      name: n.name,
      visibility: n.visibility as Visibility,
      rootKey: n.rootKey,
      managed: n.managedBy != null,
      mine: n.ownerUserId == null ? false : n.ownerUserId === auth.authUserId,
      ...(n.partnerInbox ? { partnerInbox: true } : {}),
      mimeType: n.mimeType,
      sizeBytes: n.sizeBytes == null ? null : Number(n.sizeBytes),
      createdAt: n.createdAt.toISOString(),
    };
  }

  /**
   * Adjunta los metadatos visuales (color/icono/descripción) del `SmartFolderType`
   * a los DTOs de carpetas GESTIONADAS que sean smart folders. El vínculo es
   * `(managedBy = app, name = label)` — estable porque las carpetas gestionadas son
   * read-only (no renombrables en la UI). No-op si la app no tiene el modelo
   * `SmartFolderType` (notaria/legifirma/polizas/tributos/peticiones). `rows` y
   * `dtos` deben venir alineados por índice. Ver PLAN_TECNICO_UNIDAD_DE_RED.md §B.5.
   */
  async function enrichSmartFolders(rows: DriveNodeRow[], dtos: DriveNodeDTO[]): Promise<void> {
    if (!prisma.smartFolderType) return;
    const apps = [
      ...new Set(rows.filter((r) => r.type === 'FOLDER' && r.managedBy).map((r) => r.managedBy as string)),
    ];
    if (!apps.length) return;
    const types: { app: string; label: string; color: string | null; icon: string | null; description: string | null }[] =
      await prisma.smartFolderType.findMany({
        where: { app: { in: apps }, active: true },
        select: { app: true, label: true, color: true, icon: true, description: true },
      });
    if (!types.length) return;
    const byKey = new Map(types.map((t) => [`${t.app} ${t.label}`, t]));
    rows.forEach((r, i) => {
      if (r.type !== 'FOLDER' || !r.managedBy) return;
      const t = byKey.get(`${r.managedBy} ${r.name}`);
      if (t) dtos[i].smartFolder = { color: t.color ?? null, icon: t.icon ?? null, description: t.description ?? null };
    });
  }

  async function ensureRoot(args: {
    orgId: string;
    rootKey: string;
    name: string;
    visibility: Visibility;
    ownerUserId: string | null;
    createdBy: string;
    managedBy?: string | null;
    writable?: boolean;
  }) {
    const where = { orgId_rootKey: { orgId: args.orgId, rootKey: args.rootKey } };
    const existing = await prisma.driveNode.findUnique({ where });
    if (existing) return existing;
    try {
      return await prisma.driveNode.create({
        data: {
          orgId: args.orgId,
          rootKey: args.rootKey,
          name: args.name,
          type: 'FOLDER',
          visibility: args.visibility,
          ownerUserId: args.ownerUserId,
          managedBy: args.managedBy ?? null,
          writable: args.writable ?? false,
          createdBy: args.createdBy,
        },
      });
    } catch {
      // Carrera entre dos requests del mismo usuario: el unique (orgId,rootKey)
      // hace fallar el segundo create → re-leer el que ganó.
      return prisma.driveNode.findUnique({ where });
    }
  }

  /** Crea (si faltan) y devuelve las dos raíces libres del usuario en su org. */
  async function ensureRoots(auth: UnidadAuth) {
    const compartido = await ensureRoot({
      orgId: auth.orgId,
      rootKey: ROOT_COMPARTIDO,
      name: 'Compartido',
      visibility: 'ORG',
      ownerUserId: null,
      createdBy: auth.authUserId,
    });
    const miEspacio = await ensureRoot({
      orgId: auth.orgId,
      rootKey: rootMiEspacio(auth.authUserId),
      name: 'Mi espacio',
      visibility: 'PRIVATE',
      ownerUserId: auth.authUserId,
      createdBy: auth.authUserId,
    });
    // "Biblioteca particular de <org>": carpeta GESTIONADA (aparece en Documentos,
    // no borrable) pero WRITABLE (smart-inbox de aportaciones al corpus privado).
    // Se monta además como atajo dentro de "Biblioteca Digital".
    const bibliotecaParticular = await ensureRoot({
      orgId: auth.orgId,
      rootKey: BIBLIOTECA_PARTICULAR_KEY,
      name: BIBLIOTECA_PARTICULAR_LABEL,
      visibility: 'ORG',
      ownerUserId: null,
      managedBy: 'consultor',
      writable: true,
      createdBy: auth.authUserId,
    });
    return { compartido, miEspacio, bibliotecaParticular };
  }

  /** Lee un nodo de la org del usuario aplicando el filtro de visibilidad/scope. */
  // El corpus GLOBAL de Biblioteca cuelga de la org de SISTEMA `_system` (DriveNode.orgId
  // tiene FK a organizations). Su UUID difiere por entorno → se resuelve por SLUG, cacheado.
  let _bibliotecaOrgId: string | null = null;
  let _bibLoaded = false;
  async function bibliotecaOrgId(): Promise<string | null> {
    if (_bibLoaded) return _bibliotecaOrgId;
    const o = await prisma.organization.findFirst({ where: { slug: '_system' }, select: { id: true } });
    _bibliotecaOrgId = o?.id ?? null;
    _bibLoaded = true;
    return _bibliotecaOrgId;
  }

  async function getVisibleNode(auth: UnidadAuth, id: string) {
    const own = await prisma.driveNode.findFirst({
      where: { id, orgId: auth.orgId, ...scopeWhere(auth) },
    });
    if (own) return own;
    // Corpus GLOBAL de Biblioteca legal: read-only, visible desde cualquier org.
    // (Las mutaciones lo rechazan por su `managedBy`/`rootKey`, ver comentario arriba.)
    const bibOrg = await bibliotecaOrgId();
    if (!bibOrg) return null;
    return prisma.driveNode.findFirst({
      where: { id, orgId: bibOrg, rootKey: null, trashedAt: null },
    });
  }

  /**
   * Carpeta destino válida para escribir: existe, es FOLDER y visible. En modo
   * legacy, además NO puede ser de sistema (`managedBy` null). En modo partner
   * externo con `inboxOnly`, debe colgar de una `_bandeja`; el interno (`all`)
   * gobierna toda la estructura. Devuelve la carpeta o `null`.
   */
  async function getWritableFolder(auth: UnidadAuth, parentId: string) {
    const parent = await getVisibleNode(auth, parentId);
    if (!parent || parent.type !== 'FOLDER') return null;
    if (auth.partnerScope) {
      return (await partnerWriteAllowed(auth, parent)) ? parent : null;
    }
    // Gestionada = read-only, SALVO las smart-inbox (`writable`): Biblioteca particular.
    if (parent.managedBy != null && !parent.writable) return null;
    return parent;
  }

  /** Visibility + owner que un hijo hereda de su carpeta padre. */
  function inheritFromParent(parent: { visibility: string; ownerUserId: string | null }) {
    return { visibility: parent.visibility, ownerUserId: parent.ownerUserId };
  }

  /** Recoge el id del nodo + todos sus descendientes (BFS, acotado en profundidad). */
  async function collectSubtreeIds(rootId: string, orgId: string): Promise<string[]> {
    const ids: string[] = [rootId];
    let frontier = [rootId];
    for (let depth = 0; depth < 100 && frontier.length; depth++) {
      const children = await prisma.driveNode.findMany({
        where: { parentId: { in: frontier }, orgId },
        select: { id: true },
      });
      frontier = children.map((c: { id: string }) => c.id);
      ids.push(...frontier);
    }
    return ids;
  }

  /** ¿Mover `nodeId` bajo `targetParentId` crearía un ciclo? */
  async function wouldCreateCycle(
    nodeId: string,
    targetParentId: string,
    orgId: string,
  ): Promise<boolean> {
    let currentId: string | null = targetParentId;
    for (let i = 0; i < 100 && currentId; i++) {
      if (currentId === nodeId) return true;
      const p: { parentId: string | null } | null = await prisma.driveNode.findFirst({
        where: { id: currentId, orgId },
        select: { parentId: true },
      });
      currentId = p?.parentId ?? null;
    }
    return false;
  }

  /** Sube por la cadena de `parentId` hasta la raíz (con guarda de profundidad). */
  async function buildBreadcrumb(folderId: string, orgId: string) {
    const chain: { id: string; name: string; rootKey: string | null }[] = [];
    let currentId: string | null = folderId;
    for (let i = 0; i < 50 && currentId; i++) {
      const node: { id: string; name: string; rootKey: string | null; parentId: string | null } | null =
        await prisma.driveNode.findFirst({
          where: { id: currentId, orgId },
          select: { id: true, name: true, rootKey: true, parentId: true },
        });
      if (!node) break;
      chain.unshift({ id: node.id, name: node.name, rootKey: node.rootKey });
      currentId = node.parentId;
    }
    return chain;
  }

  // ------------------------------------------------------------------------
  // Handlers (implementación pura; el catch-all los despacha por path)
  // ------------------------------------------------------------------------

  /**
   * GET /api/unidad/list?parentId=...
   * Sin `parentId` → raíces (Documentos + Compartido + Mi espacio).
   * `DOCUMENTS`     → todas las raíces gestionadas de la org (read-only).
   * `TRASH:*`       → papelera del área (Compartido / Mi espacio).
   * Carpeta real    → hijos (filtrados por visibilidad) + breadcrumb.
   */
  /**
   * GET /api/unidad/list (MODO PARTNER, "Área de archivos").
   * - Sin `parentId`:
   *     · `all`  → una carpeta por partner (raíces `PARTNER:*`), etiquetada con la
   *                razón social de la Organization externa.
   *     · `one`  → entra directo en su raíz y lista sus expedientes.
   * - Con `parentId` → hijos de la carpeta (validada por scope) + breadcrumb.
   */
  const partnerListHandler = async (request: NextRequest, auth: UnidadAuth): Promise<Response> => {
    const s = auth.partnerScope!;
    const parentId = new URL(request.url).searchParams.get('parentId');
    const filter = partnerFilter(s);

    if (!parentId) {
      if (s.mode === 'all') {
        const roots = await prisma.driveNode.findMany({
          where: { orgId: auth.orgId, parentId: null, rootKey: { startsWith: 'PARTNER:' }, trashedAt: null },
          orderBy: { name: 'asc' },
        });
        const ids = roots.map((r: DriveNodeRow) => r.partnerOrgId).filter(Boolean) as string[];
        const orgs = ids.length
          ? await prisma.organization.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
          : [];
        const nameById = new Map(orgs.map((o: { id: string; name: string }) => [o.id, o.name]));
        return successResponse({
          breadcrumb: [],
          parent: null,
          nodes: roots.map((r: DriveNodeRow) => ({
            ...serializeNode(r, auth),
            name: (r.partnerOrgId && nameById.get(r.partnerOrgId)) || r.name,
          })),
        });
      }
      // mode 'one': la raíz del propio partner (puede no existir aún → vacío).
      const root = await prisma.driveNode.findFirst({
        where: { orgId: auth.orgId, parentId: null, rootKey: `PARTNER:${s.partnerOrgId}`, trashedAt: null },
      });
      if (!root) return successResponse({ breadcrumb: [], parent: null, nodes: [] });
      const children = await prisma.driveNode.findMany({
        where: { parentId: root.id, orgId: auth.orgId, trashedAt: null, ...filter },
        orderBy: [{ type: 'desc' }, { name: 'asc' }],
      });
      return successResponse({
        breadcrumb: [{ id: root.id, name: 'Área de archivos', rootKey: root.rootKey }],
        parent: { id: root.id, name: 'Área de archivos', rootKey: root.rootKey, managed: true },
        nodes: children.map((n: DriveNodeRow) => serializeNode(n, auth)),
      });
    }

    const folder = await getVisibleNode(auth, parentId);
    if (!folder || folder.type !== 'FOLDER') {
      return errorResponse('NOT_FOUND', 'Carpeta no encontrada', 404);
    }
    const children = await prisma.driveNode.findMany({
      where: { parentId: folder.id, orgId: auth.orgId, trashedAt: null, ...filter },
      orderBy: [{ type: 'desc' }, { name: 'asc' }],
    });
    return successResponse({
      breadcrumb: await buildBreadcrumb(folder.id, auth.orgId),
      parent: { id: folder.id, name: folder.name, rootKey: folder.rootKey, managed: folder.managedBy != null },
      nodes: children.map((n: DriveNodeRow) => serializeNode(n, auth)),
    });
  };

  const listHandler: UnidadHandler = async (request, { auth }) => {
    if (auth.partnerScope) return partnerListHandler(request, auth);
    const url = new URL(request.url);
    const parentId = url.searchParams.get('parentId');

    // Asegura las raíces libres en cada acceso (idempotente).
    const { compartido, miEspacio, bibliotecaParticular } = await ensureRoots(auth);

    // Nombre de la org para la etiqueta "Documentos [Notaría X]".
    const org = await prisma.organization.findUnique({
      where: { id: auth.orgId },
      select: { name: true },
    });
    const orgName = org?.name ?? 'Documentos';
    const documentosNode = {
      id: 'DOCUMENTS',
      type: 'FOLDER' as const,
      name: orgName,
      visibility: 'ORG' as const,
      rootKey: 'DOCUMENTS' as string | null,
      managed: true,
      mine: false,
      mimeType: null as string | null,
      sizeBytes: null as number | null,
      createdAt: new Date().toISOString(),
    };

    // Área "Documentos [org]": TODAS las raíces gestionadas de la org (read-only,
    // pobladas por las apps vía `storeFile`). A diferencia de archivo, no se
    // filtra por apps de la sesión: cualquier host muestra todas.
    if (parentId === 'DOCUMENTS') {
      const managedRoots = await prisma.driveNode.findMany({
        where: { orgId: auth.orgId, parentId: null, managedBy: { not: null }, trashedAt: null },
        orderBy: { name: 'asc' },
      });
      return successResponse({
        breadcrumb: [{ id: 'DOCUMENTS', name: orgName, rootKey: 'DOCUMENTS' }],
        parent: { id: 'DOCUMENTS', name: orgName, rootKey: 'DOCUMENTS', managed: true },
        nodes: managedRoots.map((n: DriveNodeRow) => serializeNode(n, auth)),
      });
    }

    // Área "Biblioteca legal" (corpus GLOBAL de Consultor, read-only): los hijos de
    // la raíz global (carpetas por fuente). Visible en TODA org (una sola copia).
    if (parentId === 'BIBLIOTECA') {
      const bibOrg = await bibliotecaOrgId();
      const root = bibOrg
        ? await prisma.driveNode.findFirst({
            where: { orgId: bibOrg, rootKey: BIBLIOTECA_ROOT_KEY, trashedAt: null },
            select: { id: true },
          })
        : null;
      const children = root
        ? await prisma.driveNode.findMany({
            where: { parentId: root.id, orgId: bibOrg!, trashedAt: null },
            orderBy: { name: 'asc' },
          })
        : [];
      // Atajo a la "Biblioteca particular de <org>" (carpeta real bajo la org, ver
      // ensureRoots). Navegar a ella usa su id real → orgId=auth.org (escribible).
      // Defensivo: si no se pudo crear (p.ej. app sin la columna `writable`), se omite
      // el atajo en vez de romper el listado.
      const particularNodes = bibliotecaParticular
        ? [{
            ...serializeNode(bibliotecaParticular as DriveNodeRow, auth),
            name: `${BIBLIOTECA_PARTICULAR_LABEL} de ${orgName}`,
          }]
        : [];
      return successResponse({
        breadcrumb: [{ id: 'BIBLIOTECA', name: BIBLIOTECA_LABEL, rootKey: 'BIBLIOTECA' }],
        parent: { id: 'BIBLIOTECA', name: BIBLIOTECA_LABEL, rootKey: 'BIBLIOTECA', managed: true },
        nodes: [...children.map((n: DriveNodeRow) => serializeNode(n, auth)), ...particularNodes],
      });
    }

    // Papelera por área: nodos en `trashedAt` del Espacio compartido o Mi espacio.
    // Solo elementos de nivel superior (su padre no está en papelera). Restaurar
    // (POST /api/unidad/node/[id]/restore) rehace el subárbol.
    if (parentId === 'TRASH:COMPARTIDO' || parentId === 'TRASH:MIESPACIO') {
      const isShared = parentId === 'TRASH:COMPARTIDO';
      const areaWhere = isShared
        ? { visibility: 'ORG', managedBy: null }
        : { ownerUserId: auth.authUserId };
      const trashed = await prisma.driveNode.findMany({
        where: { orgId: auth.orgId, trashedAt: { not: null }, ...areaWhere },
        orderBy: { trashedAt: 'desc' },
        take: 500,
      });
      const trashedIds = new Set(trashed.map((n: DriveNodeRow) => n.id));
      const topLevel = trashed.filter((n: DriveNodeRow) => !n.parentId || !trashedIds.has(n.parentId));
      const label = isShared ? 'Papelera · Espacio compartido' : 'Papelera · Mi espacio';
      return successResponse({
        breadcrumb: [{ id: parentId, name: 'Papelera', rootKey: parentId }],
        parent: { id: parentId, name: label, rootKey: parentId, managed: true, trash: true },
        nodes: topLevel.map((n: DriveNodeRow) => serializeNode(n, auth)),
      });
    }

    // Listado raíz: Documentos [org] · Biblioteca legal (si hay corpus) · Espacio
    // compartido · Mi espacio.
    if (!parentId) {
      const freeRoots = [compartido, miEspacio].filter(
        (n): n is NonNullable<typeof n> => n != null,
      );
      // Nodo virtual "Biblioteca Digital" (corpus global read-only + atajo a la
      // Biblioteca particular de la org). Siempre presente: contiene al menos la
      // particular (creada en ensureRoots).
      const bibliotecaNode = {
        id: 'BIBLIOTECA',
        type: 'FOLDER' as const,
        name: BIBLIOTECA_LABEL,
        visibility: 'ORG' as const,
        rootKey: 'BIBLIOTECA' as string | null,
        managed: true,
        mine: false,
        mimeType: null as string | null,
        sizeBytes: null as number | null,
        createdAt: new Date().toISOString(),
      };
      return successResponse({
        breadcrumb: [],
        parent: null,
        nodes: [documentosNode, bibliotecaNode, ...freeRoots.map((n: DriveNodeRow) => serializeNode(n, auth))],
      });
    }

    // Carpeta real.
    const folder = await getVisibleNode(auth, parentId);
    if (!folder || folder.type !== 'FOLDER') {
      return errorResponse('NOT_FOUND', 'Carpeta no encontrada', 404);
    }

    const children = await prisma.driveNode.findMany({
      // `folder.orgId`: para carpetas normales == auth.orgId; para el corpus GLOBAL
      // read-only (Biblioteca legal) == BIBLIOTECA_ORG → navega el subárbol global.
      where: { parentId: folder.id, orgId: folder.orgId, ...visibilityWhere(auth) },
      orderBy: [{ type: 'desc' }, { name: 'asc' }], // FOLDER antes que FILE
    });

    // En la raíz de un área libre (Compartido/Mi espacio), añade su Papelera.
    const isFreeRoot = folder.rootKey === 'COMPARTIDO' || folder.rootKey?.startsWith('MIESPACIO:');
    const trashNode = isFreeRoot
      ? [
          {
            id: folder.rootKey === 'COMPARTIDO' ? 'TRASH:COMPARTIDO' : 'TRASH:MIESPACIO',
            type: 'FOLDER' as const,
            name: 'Papelera',
            visibility: 'ORG' as const,
            rootKey: (folder.rootKey === 'COMPARTIDO'
              ? 'TRASH:COMPARTIDO'
              : 'TRASH:MIESPACIO') as string | null,
            managed: true,
            mine: false,
            mimeType: null as string | null,
            sizeBytes: null as number | null,
            createdAt: new Date().toISOString(),
          },
        ]
      : [];

    const childDtos = children.map((n: DriveNodeRow) => serializeNode(n, auth));
    await enrichSmartFolders(children, childDtos);

    return successResponse({
      breadcrumb: await buildBreadcrumb(folder.id, auth.orgId),
      parent: {
        id: folder.id,
        name: folder.name,
        rootKey: folder.rootKey,
        managed: folder.managedBy != null,
        writable: folder.writable ?? false,
      },
      nodes: [...childDtos, ...trashNode],
    });
  };

  /** POST /api/unidad/folder { parentId, name } → crea una subcarpeta. */
  const folderHandler: UnidadHandler = async (request, { auth }) => {
    const body = await request.json().catch(() => null);
    const parentId: string | undefined = body?.parentId;
    const name: string = (body?.name ?? '').trim();
    if (!parentId || !name) return errorResponse('BAD_REQUEST', 'Faltan parentId o name', 400);

    const parent = await getWritableFolder(auth, parentId);
    if (!parent) return errorResponse('FORBIDDEN', 'Carpeta destino no válida', 403);

    const inh = inheritFromParent(parent);
    const node = await prisma.driveNode.create({
      data: {
        orgId: auth.orgId,
        parentId: parent.id,
        type: 'FOLDER',
        name,
        visibility: inh.visibility,
        ownerUserId: inh.ownerUserId,
        // Modo partner: hereda el eje de aislamiento del padre para no salirse del scope.
        ...(auth.partnerScope
          ? { partnerOrgId: parent.partnerOrgId, partnerDeptId: parent.partnerDeptId }
          : {}),
        createdBy: auth.authUserId,
      },
    });
    return successResponse(serializeNode(node, auth));
  };

  /**
   * POST /api/unidad/upload-url { parentId, filename, contentType, sizeBytes }
   * Crea el nodo FILE, firma una URL V4 de subida (PUT directo a GCS) y la
   * devuelve. Sobrescritura por nombre reutiliza el nodo + `gcsPath` (GCS con
   * Object Versioning conserva la generación anterior).
   */
  const uploadUrlHandler: UnidadHandler = async (request, { auth }) => {
    const body = await request.json().catch(() => null);
    const parentId: string | undefined = body?.parentId;
    const filename: string = (body?.filename ?? '').trim();
    const contentType: string = body?.contentType || 'application/octet-stream';
    const sizeBytes: number | null = Number.isFinite(body?.sizeBytes) ? Number(body.sizeBytes) : null;
    if (!parentId || !filename) return errorResponse('BAD_REQUEST', 'Faltan parentId o filename', 400);

    const parent = await getWritableFolder(auth, parentId);
    if (!parent) return errorResponse('FORBIDDEN', 'Carpeta destino no válida', 403);

    const existing = await prisma.driveNode.findFirst({
      where: { parentId: parent.id, orgId: auth.orgId, type: 'FILE', name: filename },
    });

    let node = existing;
    if (!node) {
      const inh = inheritFromParent(parent);
      node = await prisma.driveNode.create({
        data: {
          orgId: auth.orgId,
          parentId: parent.id,
          type: 'FILE',
          name: filename,
          visibility: inh.visibility,
          ownerUserId: inh.ownerUserId,
          ...(auth.partnerScope
            ? { partnerOrgId: parent.partnerOrgId, partnerDeptId: parent.partnerDeptId }
            : {}),
          mimeType: contentType,
          sizeBytes,
          createdBy: auth.authUserId,
        },
      });
    }

    const gcsPath =
      node.gcsPath ??
      storage.buildPath({
        orgId: auth.orgId,
        ownerUserId: node.ownerUserId,
        nodeId: node.id,
        filename,
        partnerOrgId: node.partnerOrgId,
      });
    const signed = await storage.signUploadUrl(gcsPath, contentType);
    if (!signed.ok || !signed.url) {
      if (!existing) await prisma.driveNode.delete({ where: { id: node.id } }).catch(() => {});
      return errorResponse('STORAGE_ERROR', signed.error ?? 'No se pudo firmar la subida', 503);
    }

    const updated = await prisma.driveNode.update({
      where: { id: node.id },
      data: { gcsPath, mimeType: contentType, sizeBytes },
    });
    // `created` distingue alta de sobrescritura: si el PUT del navegador falla,
    // el cliente solo puede retirar el nodo cuando lo acaba de crear (retirarlo
    // en una sobrescritura se llevaría por delante el fichero que ya estaba).
    return successResponse({
      uploadUrl: signed.url,
      contentType,
      created: !existing,
      node: serializeNode(updated, auth),
    });
  };

  /** POST /api/unidad/confirm { nodeId } — contabiliza el storage tras el PUT. */
  const confirmHandler: UnidadHandler = async (request, { auth }) => {
    const body = await request.json().catch(() => null);
    const nodeId: string | undefined = body?.nodeId;
    if (!nodeId) return errorResponse('BAD_REQUEST', 'Falta nodeId', 400);

    const node = await prisma.driveNode.findFirst({
      where: {
        id: nodeId,
        orgId: auth.orgId,
        type: 'FILE',
        ...(auth.partnerScope ? partnerFilter(auth.partnerScope) : {}),
      },
      select: { id: true, gcsPath: true },
    });
    if (!node || !node.gcsPath) return errorResponse('NOT_FOUND', 'Fichero no encontrado', 404);

    await storage.confirmUpload(node.gcsPath);
    return successResponse({ ok: true });
  };

  /** GET /api/unidad/trash — papelera (áreas libres del usuario), recientes primero. */
  const trashHandler: UnidadHandler = async (_request, { auth }) => {
    const where: Record<string, unknown> = auth.partnerScope
      ? { orgId: auth.orgId, trashedAt: { not: null }, ...partnerFilter(auth.partnerScope) }
      : {
          orgId: auth.orgId,
          trashedAt: { not: null },
          managedBy: null,
          ...(isOrgAdmin(auth)
            ? {}
            : { OR: [{ visibility: 'ORG' }, { ownerUserId: auth.authUserId }] }),
        };
    const nodes = await prisma.driveNode.findMany({
      where,
      orderBy: { trashedAt: 'desc' },
      take: 200,
    });
    return successResponse({ nodes: nodes.map((n: DriveNodeRow) => serializeNode(n, auth)) });
  };

  /**
   * GET /api/unidad/download/[id]?disposition=inline|attachment[&generation=…]
   * Devuelve una signed URL V4 de lectura para el fichero (o sirve una versión
   * concreta por el server si se pide `?generation=`).
   */
  const downloadHandler: UnidadHandler = async (request, { params, auth }) => {
    const { id } = params;
    const disposition =
      new URL(request.url).searchParams.get('disposition') === 'inline' ? 'inline' : 'attachment';

    const node = await getVisibleNode(auth, id);
    if (!node || node.type !== 'FILE' || !node.gcsPath) {
      return errorResponse('NOT_FOUND', 'Fichero no encontrado', 404);
    }

    const generation = new URL(request.url).searchParams.get('generation');
    if (generation) {
      if (!storage.downloadVersion) {
        return errorResponse('STORAGE_ERROR', 'Descarga de versiones no disponible', 503);
      }
      const dl = await storage.downloadVersion(node.gcsPath, generation);
      if (!dl.ok || !dl.body) {
        return errorResponse('STORAGE_ERROR', dl.error ?? 'No se pudo descargar la versión', 503);
      }
      return new NextResponse(new Uint8Array(dl.body), {
        headers: {
          'Content-Type': node.mimeType ?? 'application/octet-stream',
          'Content-Disposition': `attachment; filename="${node.name.replace(/["\\]/g, '')}"`,
        },
      });
    }

    const signed = await storage.signDownloadUrl(node.gcsPath, { disposition, filename: node.name });
    if (!signed.ok || !signed.url) {
      return errorResponse('STORAGE_ERROR', signed.error ?? 'No se pudo firmar la descarga', 503);
    }
    return successResponse({ url: signed.url });
  };

  /**
   * PATCH /api/unidad/node/[id] — renombrar (`{ name }`) y/o mover (`{ parentId }`).
   * Mover recalcula visibilidad/dueño de TODO el subárbol y prohíbe ciclos.
   */
  const nodePatchHandler: UnidadHandler = async (request, { params, auth }) => {
    const { id } = params;
    const node = await getVisibleNode(auth, id);
    if (!node) return errorResponse('NOT_FOUND', 'Nodo no encontrado', 404);
    if (node.rootKey) return errorResponse('FORBIDDEN', 'No se puede modificar una carpeta raíz', 403);
    if (node.managedBy) {
      return errorResponse('FORBIDDEN', 'Carpeta gestionada por una app (solo lectura)', 403);
    }
    if (!(await partnerWriteAllowed(auth, node))) {
      return errorResponse('FORBIDDEN', 'Solo se puede escribir en la bandeja de entrada', 403);
    }

    const body = await request.json().catch(() => null);
    const newName =
      typeof body?.name === 'string' && body.name.trim() ? body.name.trim() : undefined;
    const newParentId =
      typeof body?.parentId === 'string' && body.parentId !== node.parentId
        ? body.parentId
        : undefined;

    if (!newName && !newParentId) {
      return successResponse(serializeNode(node, auth));
    }

    if (newParentId) {
      const target = await getWritableFolder(auth, newParentId);
      if (!target) return errorResponse('FORBIDDEN', 'Carpeta destino no válida', 403);
      if (await wouldCreateCycle(node.id, target.id, auth.orgId)) {
        return errorResponse('BAD_REQUEST', 'No se puede mover una carpeta dentro de sí misma', 400);
      }
      const inh = inheritFromParent(target);
      const subtreeIds = await collectSubtreeIds(node.id, auth.orgId);
      await prisma.$transaction([
        prisma.driveNode.update({
          where: { id: node.id },
          data: { parentId: target.id, ...(newName ? { name: newName } : {}) },
        }),
        prisma.driveNode.updateMany({
          where: { id: { in: subtreeIds }, orgId: auth.orgId },
          data: { visibility: inh.visibility, ownerUserId: inh.ownerUserId },
        }),
      ]);
    } else if (newName) {
      await prisma.driveNode.update({ where: { id: node.id }, data: { name: newName } });
    }

    const updated = await prisma.driveNode.findUnique({ where: { id: node.id } });
    return successResponse(serializeNode(updated!, auth));
  };

  /**
   * DELETE /api/unidad/node/[id] — soft-delete (papelera): marca el nodo y su
   * subárbol con `trashedAt`. Los objetos GCS los purga el job de retención.
   */
  const nodeDeleteHandler: UnidadHandler = async (_request, { params, auth }) => {
    const { id } = params;
    const node = await getVisibleNode(auth, id);
    if (!node) return errorResponse('NOT_FOUND', 'Nodo no encontrado', 404);
    if (node.rootKey) return errorResponse('FORBIDDEN', 'No se puede borrar una carpeta raíz', 403);
    if (node.managedBy) {
      return errorResponse('FORBIDDEN', 'Carpeta gestionada por una app (solo lectura)', 403);
    }
    if (!(await partnerWriteAllowed(auth, node))) {
      return errorResponse('FORBIDDEN', 'Solo se puede escribir en la bandeja de entrada', 403);
    }

    const ids = await collectSubtreeIds(node.id, auth.orgId);
    const { count } = await prisma.driveNode.updateMany({
      where: { id: { in: ids }, orgId: auth.orgId },
      data: { trashedAt: new Date() },
    });
    return successResponse({ id: node.id, trashed: count });
  };

  /** GET /api/unidad/node/[id]/versions — historial de versiones (GCS). */
  const versionsGetHandler: UnidadHandler = async (_request, { params, auth }) => {
    const { id } = params;
    const node = await getVisibleNode(auth, id);
    if (!node || node.type !== 'FILE' || !node.gcsPath) {
      return errorResponse('NOT_FOUND', 'Fichero no encontrado', 404);
    }
    return successResponse({ versions: await storage.listVersions(node.gcsPath) });
  };

  /** POST /api/unidad/node/[id]/versions { generation } — restaura esa versión. */
  const versionsPostHandler: UnidadHandler = async (request, { params, auth }) => {
    const { id } = params;
    const node = await getVisibleNode(auth, id);
    if (!node || node.type !== 'FILE' || !node.gcsPath) {
      return errorResponse('NOT_FOUND', 'Fichero no encontrado', 404);
    }
    if (node.managedBy) {
      return errorResponse('FORBIDDEN', 'Carpeta gestionada por una app (solo lectura)', 403);
    }
    if (!(await partnerWriteAllowed(auth, node))) {
      return errorResponse('FORBIDDEN', 'Solo se puede escribir en la bandeja de entrada', 403);
    }
    const body = await request.json().catch(() => null);
    const generation = String(body?.generation ?? '');
    if (!generation) return errorResponse('BAD_REQUEST', 'Falta generation', 400);

    const r = await storage.restoreVersion(node.gcsPath, generation);
    if (!r.ok) return errorResponse('STORAGE_ERROR', r.error ?? 'No se pudo restaurar la versión', 503);
    return successResponse({ ok: true });
  };

  /**
   * POST /api/unidad/node/[id]/restore — saca de la papelera el nodo y su subárbol.
   */
  const restoreHandler: UnidadHandler = async (_request, { params, auth }) => {
    const { id } = params;
    const node = await prisma.driveNode.findFirst({
      where: {
        id,
        orgId: auth.orgId,
        trashedAt: { not: null },
        ...(auth.partnerScope ? partnerFilter(auth.partnerScope) : {}),
      },
    });
    if (!node) return errorResponse('NOT_FOUND', 'Elemento no encontrado en la papelera', 404);
    if (node.managedBy) return errorResponse('FORBIDDEN', 'Carpeta gestionada (solo lectura)', 403);
    if (auth.partnerScope) {
      if (!(await partnerWriteAllowed(auth, node))) {
        return errorResponse('FORBIDDEN', 'Solo se puede escribir en la bandeja de entrada', 403);
      }
    } else if (!isOrgAdmin(auth) && node.visibility !== 'ORG' && node.ownerUserId !== auth.authUserId) {
      return errorResponse('FORBIDDEN', 'Sin permiso sobre este elemento', 403);
    }

    const ids = await collectSubtreeIds(node.id, auth.orgId);
    const { count } = await prisma.driveNode.updateMany({
      where: { id: { in: ids }, orgId: auth.orgId },
      data: { trashedAt: null },
    });
    return successResponse({ id: node.id, restored: count });
  };

  /**
   * POST /api/unidad/read { nodeId } — extrae (o devuelve cacheado) el TEXTO del
   * documento. v0.1: solo capa de texto (sin OCR; si es escaneo → `needsOcr:true`,
   * Document AI = v0.2). Cachea en `FileText` → la biblioteca de texto se
   * auto-construye por uso (semilla del buscador de contenido/vectorización,
   * Fase 2). Backend de `unidad_leer` (MycoBot) y de "Resumir con IA". Ver
   * PLAN_TECNICO_MYCOBOT_TOOLS.md §5.1.
   */
  const readHandler: UnidadHandler = async (request, { auth }) => {
    const body = await request.json().catch(() => null);
    const nodeId = String(body?.nodeId ?? '');
    if (!nodeId) return errorResponse('BAD_REQUEST', 'Falta nodeId', 400);

    const node = await getVisibleNode(auth, nodeId);
    if (!node || node.type !== 'FILE' || !node.gcsPath) {
      return errorResponse('NOT_FOUND', 'Fichero no encontrado', 404);
    }

    // Caché: hay texto y el sha256 coincide (o no hay sha256) → devuelve cacheado.
    const cached = await prisma.fileText.findUnique({ where: { driveNodeId: nodeId } });
    if (cached?.texto && (!node.sha256 || cached.sha256 === node.sha256)) {
      return successResponse({
        texto: cached.texto, chars: cached.chars, metodo: cached.metodo, cached: true, needsOcr: false,
      });
    }

    if (!storage.readBytes) {
      return errorResponse('NOT_CONFIGURED', 'Lectura de contenido no disponible en esta app', 501);
    }
    const bytes = await storage.readBytes(node.gcsPath);
    if (!bytes) return errorResponse('STORAGE_ERROR', 'No se pudo leer el documento', 502);

    const ex = await extractText(bytes, node.mimeType);
    let texto = ex.texto, chars = ex.chars, needsOcr = ex.needsOcr;
    let metodo: string = ex.metodo;
    // Escaneo sin capa de texto → OCR por visión (platform / deps.ocr). Si resuelve,
    // deja de necesitar OCR y se cachea igual que la capa de texto.
    if (needsOcr) {
      const o = await resolveOcr(bytes, node.mimeType);
      if (o?.texto) { texto = o.texto; chars = o.chars; metodo = 'ocr-vision'; needsOcr = false; }
    }
    // Solo cachea si hay texto real (capa de texto u OCR).
    if (!needsOcr && texto) {
      await prisma.fileText.upsert({
        where: { driveNodeId: nodeId },
        create: {
          driveNodeId: nodeId, orgId: auth.orgId, texto, chars,
          metodo, sha256: node.sha256 ?? null, extractedAt: new Date(),
        },
        update: {
          texto, chars, metodo,
          sha256: node.sha256 ?? null, extractedAt: new Date(),
        },
      });
    }
    return successResponse({ texto, chars, metodo, cached: false, needsOcr });
  };

  /**
   * POST /api/unidad/resumir { nodeId } — "Resumir con IA". Asegura el texto
   * (caché o extrae) y, si no hay resumen cacheado, lo pide a `deps.summarize`
   * (→ Consultor cobra 1 crédito + Gemini). Cachea el resumen en `FileText`.
   * Ver PLAN_TECNICO_MYCOBOT_TOOLS.md §5.1.
   */
  const resumirHandler: UnidadHandler = async (request, { auth }) => {
    const body = await request.json().catch(() => null);
    const nodeId = String(body?.nodeId ?? '');
    if (!nodeId) return errorResponse('BAD_REQUEST', 'Falta nodeId', 400);

    const node = await getVisibleNode(auth, nodeId);
    if (!node || node.type !== 'FILE' || !node.gcsPath) {
      return errorResponse('NOT_FOUND', 'Fichero no encontrado', 404);
    }

    // Resumen cacheado → gratis/instantáneo.
    let ft = await prisma.fileText.findUnique({ where: { driveNodeId: nodeId } });
    if (ft?.resumen) return successResponse({ resumen: ft.resumen, cached: true });

    // Asegura el texto (caché o extrae ahora).
    let texto: string = ft?.texto ?? '';
    if (!texto) {
      if (!storage.readBytes) return errorResponse('NOT_CONFIGURED', 'Lectura no disponible', 501);
      const bytes = await storage.readBytes(node.gcsPath);
      if (!bytes) return errorResponse('STORAGE_ERROR', 'No se pudo leer el documento', 502);
      const ex = await extractText(bytes, node.mimeType);
      let exTexto = ex.texto, exChars = ex.chars;
      let exMetodo: string = ex.metodo;
      // Escaneo sin capa de texto → OCR por visión antes de rendirse.
      if (ex.needsOcr || !ex.texto) {
        const o = await resolveOcr(bytes, node.mimeType);
        if (o?.texto) { exTexto = o.texto; exChars = o.chars; exMetodo = 'ocr-vision'; }
      }
      if (!exTexto) {
        return errorResponse('NEEDS_OCR', 'Documento escaneado sin capa de texto', 422);
      }
      ft = await prisma.fileText.upsert({
        where: { driveNodeId: nodeId },
        create: {
          driveNodeId: nodeId, orgId: auth.orgId, texto: exTexto, chars: exChars,
          metodo: exMetodo, sha256: node.sha256 ?? null, extractedAt: new Date(),
        },
        update: {
          texto: exTexto, chars: exChars, metodo: exMetodo,
          sha256: node.sha256 ?? null, extractedAt: new Date(),
        },
      });
      texto = exTexto;
    }

    if (!summarize) return errorResponse('NOT_CONFIGURED', 'Resumen IA no disponible en esta app', 501);
    const r = await summarize(texto);
    if (!r.ok || !r.resumen) {
      const code = r.status === 402 ? 'NO_CREDITS' : 'SUMMARY_FAILED';
      return errorResponse(code, r.error ?? 'No se pudo resumir', r.status ?? 502);
    }

    await prisma.fileText.update({
      where: { driveNodeId: nodeId },
      data: { resumen: r.resumen, resumidoAt: new Date() },
    });
    return successResponse({ resumen: r.resumen, cached: false });
  };

  /**
   * POST /api/unidad/incorporar-corpus { nodeId } — "Incorporar al corpus": añade
   * un fichero de la Biblioteca particular al corpus PRIVADO de la org (Consultor).
   * El factory extrae el texto (capa de texto) y lo delega en `deps.corpusIngest`
   * (→ Consultor: enrich + embeddings + resolucion orgId/APORTACION_ORG). Solo para
   * ficheros propios de la org (no el corpus global read-only).
   */
  const corpusIngestHandler: UnidadHandler = async (request, { auth }) => {
    if (!deps.corpusIngest) {
      return errorResponse('NOT_CONFIGURED', 'Incorporar al corpus no disponible en esta app', 501);
    }
    const body = await request.json().catch(() => null);
    const nodeId = String(body?.nodeId ?? '');
    if (!nodeId) return errorResponse('BAD_REQUEST', 'Falta nodeId', 400);

    const node = await getVisibleNode(auth, nodeId);
    if (!node || node.type !== 'FILE' || !node.gcsPath) {
      return errorResponse('NOT_FOUND', 'Fichero no encontrado', 404);
    }
    // Solo ficheros de la PROPIA org (la Biblioteca particular); el corpus global es
    // read-only y ya está incorporado.
    if (node.orgId !== auth.orgId) {
      return errorResponse('FORBIDDEN', 'Solo se pueden incorporar ficheros de la organización', 403);
    }

    // Asegura el texto (caché de FileText o extracción por capa de texto).
    let texto = (await prisma.fileText.findUnique({ where: { driveNodeId: nodeId } }))?.texto ?? '';
    if (!texto) {
      if (!storage.readBytes) {
        return errorResponse('NOT_CONFIGURED', 'Lectura de contenido no disponible', 501);
      }
      const bytes = await storage.readBytes(node.gcsPath);
      if (!bytes) return errorResponse('STORAGE_ERROR', 'No se pudo leer el documento', 502);
      const ex = await extractText(bytes, node.mimeType);
      if (ex.needsOcr || !ex.texto) {
        return errorResponse('NO_TEXT', 'El documento no tiene capa de texto (OCR pendiente)', 422);
      }
      texto = ex.texto;
      await prisma.fileText.upsert({
        where: { driveNodeId: nodeId },
        create: { driveNodeId: nodeId, orgId: auth.orgId, texto, chars: ex.chars, metodo: ex.metodo, sha256: node.sha256 ?? null, extractedAt: new Date() },
        update: { texto, chars: ex.chars, metodo: ex.metodo, sha256: node.sha256 ?? null, extractedAt: new Date() },
      });
    }

    const res = await deps.corpusIngest({ nodeId, titulo: node.name, texto, mime: node.mimeType });
    if (!res.ok) {
      return errorResponse('INGEST_ERROR', res.error ?? 'No se pudo incorporar al corpus', res.status ?? 502);
    }
    return successResponse({ ok: true });
  };

  /**
   * POST /api/unidad/search { query } → nodos cuyo nombre contiene `query`,
   * acotados a la org y a la visibilidad del usuario (MISMO filtro que el explorer
   * vía `visibilityWhere`). Es la superficie de la tool `unidad_buscar` de MycoBot.
   * Búsqueda por nombre (contenido = Fase 2 con `FileText`). Solo lectura.
   */
  const searchHandler: UnidadHandler = async (request, { auth }) => {
    const body = await request.json().catch(() => null);
    const query = typeof body?.query === 'string' ? body.query.trim() : '';
    if (query.length < 2) {
      return errorResponse('BAD_REQUEST', 'La búsqueda necesita al menos 2 caracteres', 400);
    }
    const nodes = await prisma.driveNode.findMany({
      where: {
        orgId: auth.orgId,
        name: { contains: query, mode: 'insensitive' },
        ...scopeWhere(auth),
      },
      orderBy: [{ type: 'desc' }, { name: 'asc' }],
      take: 20,
    });
    return successResponse({
      total: nodes.length,
      items: nodes.map((n: DriveNodeRow) => {
        const s = serializeNode(n, auth);
        return { id: s.id, name: s.name, type: s.type, mimeType: s.mimeType, sizeBytes: s.sizeBytes };
      }),
    });
  };

  // Permisos a exigir (por defecto Unidad interna; el montaje partner pasa
  // `unidad:read_partner`/`unidad:write_partner`).
  const permRead = deps.permissions?.read ?? 'unidad:read';
  const permWrite = deps.permissions?.write ?? 'unidad:write';

  // Handlers ya envueltos por el wrapper de permisos del host.
  const wrapped = {
    list: withPermission(permRead)(listHandler),
    search: withPermission(permRead)(searchHandler),
    read: withPermission(permRead)(readHandler),
    resumir: withPermission(permRead)(resumirHandler),
    incorporarCorpus: withPermission(permWrite)(corpusIngestHandler),
    folder: withPermission(permWrite)(folderHandler),
    uploadUrl: withPermission(permWrite)(uploadUrlHandler),
    confirm: withPermission(permWrite)(confirmHandler),
    trash: withPermission(permRead)(trashHandler),
    download: withPermission(permRead)(downloadHandler),
    nodePatch: withPermission(permWrite)(nodePatchHandler),
    nodeDelete: withPermission(permWrite)(nodeDeleteHandler),
    versionsGet: withPermission(permRead)(versionsGetHandler),
    versionsPost: withPermission(permWrite)(versionsPostHandler),
    restore: withPermission(permWrite)(restoreHandler),
  };

  /**
   * Despacha una request del namespace `/api/unidad/*` al handler adecuado
   * inspeccionando los segmentos del catch-all. Devuelve el RouteHandler ya
   * envuelto (con permisos), inyectando los `params` derivados de la ruta (p.ej.
   * `node/[id]` → `{ id }`). `null` = ruta desconocida (404).
   */
  function resolve(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    segs: string[],
  ): { run: (req: NextRequest, ctx: any) => Promise<Response>; params: Record<string, string> } | null {
    // /list
    if (segs.length === 1 && segs[0] === 'list' && method === 'GET') {
      return { run: wrapped.list, params: {} };
    }
    // /folder
    if (segs.length === 1 && segs[0] === 'folder' && method === 'POST') {
      return { run: wrapped.folder, params: {} };
    }
    // /upload-url
    if (segs.length === 1 && segs[0] === 'upload-url' && method === 'POST') {
      return { run: wrapped.uploadUrl, params: {} };
    }
    // /confirm
    if (segs.length === 1 && segs[0] === 'confirm' && method === 'POST') {
      return { run: wrapped.confirm, params: {} };
    }
    // /trash
    if (segs.length === 1 && segs[0] === 'trash' && method === 'GET') {
      return { run: wrapped.trash, params: {} };
    }
    // /search
    if (segs.length === 1 && segs[0] === 'search' && method === 'POST') {
      return { run: wrapped.search, params: {} };
    }
    // /read
    if (segs.length === 1 && segs[0] === 'read' && method === 'POST') {
      return { run: wrapped.read, params: {} };
    }
    // /resumir
    if (segs.length === 1 && segs[0] === 'resumir' && method === 'POST') {
      return { run: wrapped.resumir, params: {} };
    }
    // /incorporar-corpus
    if (segs.length === 1 && segs[0] === 'incorporar-corpus' && method === 'POST') {
      return { run: wrapped.incorporarCorpus, params: {} };
    }
    // /download/[id]
    if (segs.length === 2 && segs[0] === 'download' && method === 'GET') {
      return { run: wrapped.download, params: { id: segs[1] } };
    }
    // /node/[id]
    if (segs.length === 2 && segs[0] === 'node') {
      if (method === 'PATCH') return { run: wrapped.nodePatch, params: { id: segs[1] } };
      if (method === 'DELETE') return { run: wrapped.nodeDelete, params: { id: segs[1] } };
    }
    // /node/[id]/versions
    if (segs.length === 3 && segs[0] === 'node' && segs[2] === 'versions') {
      if (method === 'GET') return { run: wrapped.versionsGet, params: { id: segs[1] } };
      if (method === 'POST') return { run: wrapped.versionsPost, params: { id: segs[1] } };
    }
    // /node/[id]/restore
    if (segs.length === 3 && segs[0] === 'node' && segs[2] === 'restore' && method === 'POST') {
      return { run: wrapped.restore, params: { id: segs[1] } };
    }
    return null;
  }

  async function dispatch(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    request: NextRequest,
    ctx: { params: Promise<{ path?: string[] }> },
  ): Promise<Response> {
    const { path } = await ctx.params;
    const segs = path ?? [];
    const match = resolve(method, segs);
    if (!match) return errorResponse('NOT_FOUND', 'Ruta no encontrada', 404);
    return match.run(request, { params: match.params });
  }

  return {
    /**
     * Catch-all para TODO el namespace `/api/unidad/*`. Se monta una vez por app:
     *
     *   // src/app/api/unidad/[[...path]]/route.ts
     *   import { unidadRoutes } from '@/lib/unidad-server';
     *   export const { GET, POST, PATCH, DELETE } = unidadRoutes.catchAll;
     */
    catchAll: {
      GET: (request: NextRequest, ctx: { params: Promise<{ path?: string[] }> }) =>
        dispatch('GET', request, ctx),
      POST: (request: NextRequest, ctx: { params: Promise<{ path?: string[] }> }) =>
        dispatch('POST', request, ctx),
      PATCH: (request: NextRequest, ctx: { params: Promise<{ path?: string[] }> }) =>
        dispatch('PATCH', request, ctx),
      DELETE: (request: NextRequest, ctx: { params: Promise<{ path?: string[] }> }) =>
        dispatch('DELETE', request, ctx),
    },
    /** Handlers nombrados (ya con permisos) por si una app cablea rutas una a una. */
    handlers: wrapped,
  };
}
