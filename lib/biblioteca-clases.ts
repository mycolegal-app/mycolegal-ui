// Selección de CLASES de la Biblioteca Legal que MycoBot considera (y que filtra la
// tabla del Consultor). Se guarda en una COOKIE del dominio PADRE
// (`.mycolegal.app` / `.mycolegal.local`) para que sea la MISMA en todas las apps
// —localStorage es por-origen y no cruza subdominios—. La usan el rail de MycoBot
// (comando /sources, leyenda de cabecera y scope del `ask`) y la página de
// Biblioteca del Consultor. `null` = sin selección guardada ⇒ se consideran TODAS.

const COOKIE = 'mc_biblioteca_clases';
const MAX_AGE = 60 * 60 * 24 * 365; // 1 año

/** Evento que se emite al cambiar la selección, para sincronizar en vivo a los
 *  consumidores del mismo origen (la página de Biblioteca y el rail de MycoBot). */
export const CLASES_CHANGED_EVENT = 'mc:biblioteca-clases-changed';

/** Dominio padre común a toda la flota: los dos últimos labels del hostname
 *  (`consultor.test.mycolegal.app` → `.mycolegal.app`). '' en localhost/IP. */
function parentDomain(): string {
  if (typeof window === 'undefined') return '';
  const h = window.location.hostname;
  if (h === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(h)) return '';
  const parts = h.split('.');
  if (parts.length < 2) return '';
  return '.' + parts.slice(-2).join('.');
}

/** Lee la selección guardada. `null` = sin selección (⇒ todas las clases). */
export function readClasesSel(): string[] | null {
  if (typeof document === 'undefined') return null;
  const m = document.cookie.match(new RegExp('(?:^|; )' + COOKIE + '=([^;]*)'));
  if (!m) return null;
  try {
    const arr = JSON.parse(decodeURIComponent(m[1]));
    return Array.isArray(arr) ? arr.map(String) : null;
  } catch {
    return null;
  }
}

/** Guarda la selección en el dominio padre. `null` o `[]` borra la cookie
 *  (⇒ vuelve al estado "todas"). */
export function writeClasesSel(clases: string[] | null): void {
  if (typeof document === 'undefined') return;
  const dom = parentDomain();
  const domAttr = dom ? `; domain=${dom}` : '';
  const secure = window.location.protocol === 'https:' ? '; secure' : '';
  if (!clases || clases.length === 0) {
    document.cookie = `${COOKIE}=; path=/${domAttr}; max-age=0; samesite=lax${secure}`;
  } else {
    const val = encodeURIComponent(JSON.stringify(clases));
    document.cookie = `${COOKIE}=${val}; path=/${domAttr}; max-age=${MAX_AGE}; samesite=lax${secure}`;
  }
  try {
    window.dispatchEvent(new CustomEvent(CLASES_CHANGED_EVENT));
  } catch {
    /* SSR / entornos sin window */
  }
}
