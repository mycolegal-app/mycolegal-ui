/**
 * Manifiesto de tools de MycoBot de la Unidad de Red (contrato T4). Módulo PURO
 * (sin imports de next ni de prisma): lo cargan las `instrumentation.node.ts` de
 * las apps que montan la Unidad para declarar estas tools en auth
 * (`tools` en /apps/register).
 *
 * A diferencia de las tools per-app (que apuntan a `/api/mycobot/tools/[name]`),
 * las de Unidad apuntan DIRECTAMENTE a los endpoints de la factory compartida
 * `createUnidadRoutes` (`/api/unidad/search` y `/api/unidad/read`): el executor
 * genérico de Consultor hace POST con args JSON y ambos ya aplican el filtro de
 * visibilidad del usuario. Ver PLAN_TECNICO_MYCOBOT_TOOLS.md (T4 unidad_*).
 */

export interface UnidadToolDef {
  key: string;
  label: string;
  description: string;
  parameters: Record<string, unknown>;
  /** Sub-path (bajo `/api/unidad`) del endpoint de la factory que la resuelve. */
  path: string;
}

export const UNIDAD_MYCOBOT_TOOLS: UnidadToolDef[] = [
  {
    key: 'unidad_buscar',
    label: 'Buscar en la Unidad de Red',
    description:
      'Busca documentos y carpetas por NOMBRE en la Unidad de Red del despacho (respetando los permisos del usuario). Devuelve id, nombre y tipo de cada coincidencia. Usa el id con unidad_leer para leer el contenido de un documento. Solo lectura.',
    parameters: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Texto a buscar en el nombre (mín. 2 caracteres).' } },
      required: ['query'],
    },
    path: '/api/unidad/search',
  },
  {
    key: 'unidad_leer',
    label: 'Leer documento de la Unidad de Red',
    description:
      'Extrae el texto de un documento (PDF con capa de texto) de la Unidad de Red para poder responder preguntas sobre su contenido. Recibe el id del documento (obtenido con unidad_buscar). Si el documento es una imagen escaneada, indícalo. Solo lectura.',
    parameters: {
      type: 'object',
      properties: { nodeId: { type: 'string', description: 'Id del documento (DriveNode) a leer.' } },
      required: ['nodeId'],
    },
    path: '/api/unidad/read',
  },
];

/**
 * Construye el manifiesto para el payload de `/apps/register` (campo `tools`).
 * `invokeUrl` = URL pública de la app + el sub-path de la factory.
 */
export function buildUnidadToolManifest(appUrl: string) {
  const base = appUrl.replace(/\/$/, '');
  return UNIDAD_MYCOBOT_TOOLS.map((t) => ({
    key: t.key,
    name: t.label,
    description: t.description,
    invokeUrl: `${base}${t.path}`,
    method: 'POST',
    parametersSchema: t.parameters,
    kind: 'read',
  }));
}
