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
}

export interface UnidadStorage {
  buildPath(a: { orgId: string; ownerUserId?: string | null; nodeId: string; filename: string }): string;
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

interface DriveNodeRow {
  id: string;
  type: string;
  name: string;
  visibility: string;
  ownerUserId: string | null;
  managedBy: string | null;
  rootKey: string | null;
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
  mimeType: string | null;
  sizeBytes: number | null;
  createdAt: string;
}

export function createUnidadRoutes(deps: UnidadDeps) {
  const { prisma, storage, withPermission, summarize } = deps;

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

  function serializeNode(n: DriveNodeRow, auth: UnidadAuth): DriveNodeDTO {
    return {
      id: n.id,
      type: n.type as DriveNodeType,
      name: n.name,
      visibility: n.visibility as Visibility,
      rootKey: n.rootKey,
      managed: n.managedBy != null,
      mine: n.ownerUserId == null ? false : n.ownerUserId === auth.authUserId,
      mimeType: n.mimeType,
      sizeBytes: n.sizeBytes == null ? null : Number(n.sizeBytes),
      createdAt: n.createdAt.toISOString(),
    };
  }

  async function ensureRoot(args: {
    orgId: string;
    rootKey: string;
    name: string;
    visibility: Visibility;
    ownerUserId: string | null;
    createdBy: string;
    managedBy?: string | null;
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
    return { compartido, miEspacio };
  }

  /** Lee un nodo de la org del usuario aplicando el filtro de visibilidad. */
  async function getVisibleNode(auth: UnidadAuth, id: string) {
    return prisma.driveNode.findFirst({
      where: { id, orgId: auth.orgId, ...visibilityWhere(auth) },
    });
  }

  /**
   * Carpeta destino válida para escribir: existe, es FOLDER, visible y NO es de
   * sistema (`managedBy` null). Devuelve la carpeta o `null`.
   */
  async function getWritableFolder(auth: UnidadAuth, parentId: string) {
    const parent = await getVisibleNode(auth, parentId);
    if (!parent || parent.type !== 'FOLDER' || parent.managedBy != null) return null;
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
  const listHandler: UnidadHandler = async (request, { auth }) => {
    const url = new URL(request.url);
    const parentId = url.searchParams.get('parentId');

    // Asegura las raíces libres en cada acceso (idempotente).
    const { compartido, miEspacio } = await ensureRoots(auth);

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

    // Listado raíz: Documentos [org] · Espacio compartido · Mi espacio.
    if (!parentId) {
      const freeRoots = [compartido, miEspacio].filter(
        (n): n is NonNullable<typeof n> => n != null,
      );
      return successResponse({
        breadcrumb: [],
        parent: null,
        nodes: [documentosNode, ...freeRoots.map((n: DriveNodeRow) => serializeNode(n, auth))],
      });
    }

    // Carpeta real.
    const folder = await getVisibleNode(auth, parentId);
    if (!folder || folder.type !== 'FOLDER') {
      return errorResponse('NOT_FOUND', 'Carpeta no encontrada', 404);
    }

    const children = await prisma.driveNode.findMany({
      where: { parentId: folder.id, orgId: auth.orgId, ...visibilityWhere(auth) },
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

    return successResponse({
      breadcrumb: await buildBreadcrumb(folder.id, auth.orgId),
      parent: {
        id: folder.id,
        name: folder.name,
        rootKey: folder.rootKey,
        managed: folder.managedBy != null,
      },
      nodes: [...children.map((n: DriveNodeRow) => serializeNode(n, auth)), ...trashNode],
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
          mimeType: contentType,
          sizeBytes,
          createdBy: auth.authUserId,
        },
      });
    }

    const gcsPath =
      node.gcsPath ??
      storage.buildPath({ orgId: auth.orgId, ownerUserId: node.ownerUserId, nodeId: node.id, filename });
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
      where: { id: nodeId, orgId: auth.orgId, type: 'FILE' },
      select: { id: true, gcsPath: true },
    });
    if (!node || !node.gcsPath) return errorResponse('NOT_FOUND', 'Fichero no encontrado', 404);

    await storage.confirmUpload(node.gcsPath);
    return successResponse({ ok: true });
  };

  /** GET /api/unidad/trash — papelera (áreas libres del usuario), recientes primero. */
  const trashHandler: UnidadHandler = async (_request, { auth }) => {
    const nodes = await prisma.driveNode.findMany({
      where: {
        orgId: auth.orgId,
        trashedAt: { not: null },
        managedBy: null,
        ...(isOrgAdmin(auth)
          ? {}
          : { OR: [{ visibility: 'ORG' }, { ownerUserId: auth.authUserId }] }),
      },
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
      where: { id, orgId: auth.orgId, trashedAt: { not: null } },
    });
    if (!node) return errorResponse('NOT_FOUND', 'Elemento no encontrado en la papelera', 404);
    if (node.managedBy) return errorResponse('FORBIDDEN', 'Carpeta gestionada (solo lectura)', 403);
    if (!isOrgAdmin(auth) && node.visibility !== 'ORG' && node.ownerUserId !== auth.authUserId) {
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
    // Solo cachea si hay texto real; `needsOcr` (escaneo) queda para v0.2 (Document AI).
    if (!ex.needsOcr && ex.texto) {
      await prisma.fileText.upsert({
        where: { driveNodeId: nodeId },
        create: {
          driveNodeId: nodeId, orgId: auth.orgId, texto: ex.texto, chars: ex.chars,
          metodo: ex.metodo, sha256: node.sha256 ?? null, extractedAt: new Date(),
        },
        update: {
          texto: ex.texto, chars: ex.chars, metodo: ex.metodo,
          sha256: node.sha256 ?? null, extractedAt: new Date(),
        },
      });
    }
    return successResponse({
      texto: ex.texto, chars: ex.chars, metodo: ex.metodo, cached: false, needsOcr: ex.needsOcr,
    });
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
      if (ex.needsOcr || !ex.texto) {
        return errorResponse('NEEDS_OCR', 'Documento escaneado sin capa de texto (OCR próximamente)', 422);
      }
      ft = await prisma.fileText.upsert({
        where: { driveNodeId: nodeId },
        create: {
          driveNodeId: nodeId, orgId: auth.orgId, texto: ex.texto, chars: ex.chars,
          metodo: ex.metodo, sha256: node.sha256 ?? null, extractedAt: new Date(),
        },
        update: {
          texto: ex.texto, chars: ex.chars, metodo: ex.metodo,
          sha256: node.sha256 ?? null, extractedAt: new Date(),
        },
      });
      texto = ex.texto;
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
        ...visibilityWhere(auth),
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

  // Handlers ya envueltos por el wrapper de permisos del host.
  const wrapped = {
    list: withPermission('unidad:read')(listHandler),
    search: withPermission('unidad:read')(searchHandler),
    read: withPermission('unidad:read')(readHandler),
    resumir: withPermission('unidad:read')(resumirHandler),
    folder: withPermission('unidad:write')(folderHandler),
    uploadUrl: withPermission('unidad:write')(uploadUrlHandler),
    confirm: withPermission('unidad:write')(confirmHandler),
    trash: withPermission('unidad:read')(trashHandler),
    download: withPermission('unidad:read')(downloadHandler),
    nodePatch: withPermission('unidad:write')(nodePatchHandler),
    nodeDelete: withPermission('unidad:write')(nodeDeleteHandler),
    versionsGet: withPermission('unidad:read')(versionsGetHandler),
    versionsPost: withPermission('unidad:write')(versionsPostHandler),
    restore: withPermission('unidad:write')(restoreHandler),
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
