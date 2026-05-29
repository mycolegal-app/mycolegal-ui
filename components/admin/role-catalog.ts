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
};

export function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role;
}

export function roleColor(role: string): string {
  return ROLE_COLORS[role] ?? 'bg-gray-100 text-gray-700 border-gray-300';
}
