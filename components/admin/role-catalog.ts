/**
 * Centralized role labels + colors so every app shows identical badges.
 *
 * AppRole is a single union across the platform. Each app surfaces only
 * the subset that makes sense for its domain (via `assignableRoles`),
 * but the visual catalog is one place so a "NOTARIO" badge looks the
 * same in notaria, legifirma, tributos, etc.
 */

export const ROLE_LABELS: Record<string, string> = {
  NOTARIO: 'Notario',
  OFICIAL: 'Oficial',
  TRAMITADOR: 'Tramitador',
  CONSULTOR: 'Consultor',
  CONSULTOR_EXTERNO: 'Consultor externo',
  EDITOR_CATALOGO: 'Editor de catálogo',
  CONTABILIDAD: 'Contabilidad',
  AUXILIAR: 'Auxiliar',
  GESTOR: 'Gestor externo',
  AYUDANTE_GESTOR: 'Ayudante de gestor',
  GESTORIA_EXTERNA: 'Gestoría externa',
  BANCO_EXTERNO: 'Banco externo',
  EXTERNO: 'Usuario externo',
  EDITOR: 'Editor',
  OPERADOR: 'Operador',
  VISOR: 'Visor',
  // ── Catálogo unificado B2B (incidencia #78) ──
  ADMINISTRADOR_NOTARIA: 'Administrador de notaría',
  USUARIO_NOTARIA: 'Usuario de notaría',
  OBSERVADOR_NOTARIA: 'Observador',
  CONTABLE_NOTARIA: 'Contable',
  ADMINISTRADOR_BANCO: 'Administrador de banco',
  USUARIO_BANCO: 'Usuario de banco',
  VALIDADOR_BANCO: 'Validador',
  USUARIO_CENTRO_LIQUIDADOR: 'Usuario de centro liquidador',
  OBSERVADOR: 'Observador',
  OBSERVADOR_APP: 'Observador de aplicación',
  ADMINISTRADOR_EXTERNO: 'Administrador externo',
  VALIDADOR_EXTERNO: 'Validador externo',
  USUARIO_EXTERNO: 'Usuario externo',
  NOTARIO_EXTERNO: 'Notario externo',
  USUARIO_NOTARIO_EXTERNO: 'Usuario de notario externo',
};

export const ROLE_COLORS: Record<string, string> = {
  NOTARIO: 'bg-purple-100 text-purple-700 border-purple-300',
  OFICIAL: 'bg-blue-100 text-blue-700 border-blue-300',
  TRAMITADOR: 'bg-amber-100 text-amber-700 border-amber-300',
  CONSULTOR: 'bg-slate-100 text-slate-700 border-slate-300',
  CONSULTOR_EXTERNO: 'bg-slate-50 text-slate-600 border-slate-200',
  EDITOR_CATALOGO: 'bg-violet-100 text-violet-700 border-violet-300',
  CONTABILIDAD: 'bg-emerald-100 text-emerald-700 border-emerald-300',
  AUXILIAR: 'bg-rose-100 text-rose-700 border-rose-300',
  GESTOR: 'bg-cyan-100 text-cyan-700 border-cyan-300',
  AYUDANTE_GESTOR: 'bg-cyan-50 text-cyan-600 border-cyan-200',
  GESTORIA_EXTERNA: 'bg-sky-100 text-sky-700 border-sky-300',
  BANCO_EXTERNO: 'bg-teal-100 text-teal-700 border-teal-300',
  EXTERNO: 'bg-orange-100 text-orange-700 border-orange-300',
  EDITOR: 'bg-indigo-100 text-indigo-700 border-indigo-300',
  OPERADOR: 'bg-blue-100 text-blue-700 border-blue-300',
  VISOR: 'bg-slate-100 text-slate-700 border-slate-300',
  // ── Catálogo unificado B2B (incidencia #78) ──
  ADMINISTRADOR_NOTARIA: 'bg-purple-100 text-purple-700 border-purple-300',
  USUARIO_NOTARIA: 'bg-blue-100 text-blue-700 border-blue-300',
  OBSERVADOR_NOTARIA: 'bg-slate-100 text-slate-700 border-slate-300',
  CONTABLE_NOTARIA: 'bg-emerald-100 text-emerald-700 border-emerald-300',
  ADMINISTRADOR_BANCO: 'bg-purple-100 text-purple-700 border-purple-300',
  USUARIO_BANCO: 'bg-teal-100 text-teal-700 border-teal-300',
  VALIDADOR_BANCO: 'bg-amber-100 text-amber-700 border-amber-300',
  USUARIO_CENTRO_LIQUIDADOR: 'bg-teal-50 text-teal-600 border-teal-200',
  OBSERVADOR: 'bg-slate-100 text-slate-700 border-slate-300',
  OBSERVADOR_APP: 'bg-slate-50 text-slate-600 border-slate-200',
  ADMINISTRADOR_EXTERNO: 'bg-orange-100 text-orange-700 border-orange-300',
  VALIDADOR_EXTERNO: 'bg-amber-100 text-amber-700 border-amber-300',
  USUARIO_EXTERNO: 'bg-orange-100 text-orange-700 border-orange-300',
  NOTARIO_EXTERNO: 'bg-sky-100 text-sky-700 border-sky-300',
  USUARIO_NOTARIO_EXTERNO: 'bg-sky-50 text-sky-600 border-sky-200',
};

/**
 * Roles legacy ya cubiertos por el catálogo unificado (incidencia #78). Se
 * ocultan del desplegable de asignación para que el admin solo vea la
 * nomenclatura nueva. NO se borran de auth (siguen como red de seguridad /
 * fallback).
 *
 * Externos: se ocultan también los legacy de externos (GESTOR/AYUDANTE_GESTOR/
 * EXTERNO/GESTORIA_EXTERNA/BANCO_EXTERNO/CONSULTOR_EXTERNO). Es seguro porque
 * NO hay todavía ningún usuario externo operando (confirmado), así que ocultarlos
 * no deja a nadie sin rol asignable. NO se ocultan los roles funcionales de
 * foundation B2B de Peticiones (ADMIN_DEPARTAMENTO, VALIDADOR_BANCO,
 * PRE_VALIDADOR_GESTORIA): son funcionalidad activa, no nomenclatura legacy.
 */
export const LEGACY_HIDDEN_ROLE_KEYS = new Set<string>([
  // Internos
  'NOTARIO', 'OFICIAL', 'TRAMITADOR', 'CONSULTOR',
  'EDITOR', 'OPERADOR', 'VISOR',
  'EDITOR_CATALOGO', 'CONTABILIDAD', 'AUXILIAR',
  // Externos legacy (sin usuarios externos operando aún)
  'GESTOR', 'AYUDANTE_GESTOR', 'EXTERNO',
  'GESTORIA_EXTERNA', 'BANCO_EXTERNO', 'CONSULTOR_EXTERNO',
]);

/** ¿Debe ocultarse este rol del desplegable de asignación? */
export function isLegacyHiddenRole(key: string): boolean {
  return LEGACY_HIDDEN_ROLE_KEYS.has(key);
}

export function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role;
}

export function roleColor(role: string): string {
  return ROLE_COLORS[role] ?? 'bg-gray-100 text-gray-700 border-gray-300';
}
