// Selección de FUENTES de la Biblioteca Legal que MycoBot considera (y que filtra
// la tabla del Consultor). Es el OTRO nivel del modal de Fuentes, junto a las CLASES
// (ver `biblioteca-clases.ts`): se combinan en AND. Misma mecánica que las clases —
// COOKIE del dominio PADRE (`.mycolegal.app`) para compartirla entre subdominios—.
// `null` = sin selección guardada ⇒ se consideran TODAS las fuentes.

const COOKIE = 'mc_biblioteca_fuentes';
const MAX_AGE = 60 * 60 * 24 * 365; // 1 año

/** Evento que se emite al cambiar la selección de fuentes, para sincronizar en vivo
 *  a los consumidores del mismo origen (página de Biblioteca y rail de MycoBot). */
export const FUENTES_CHANGED_EVENT = 'mc:biblioteca-fuentes-changed';

/** Dominio padre común a toda la flota (`consultor.mycolegal.app` → `.mycolegal.app`).
 *  '' en localhost/IP. */
function parentDomain(): string {
  if (typeof window === 'undefined') return '';
  const h = window.location.hostname;
  if (h === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(h)) return '';
  const parts = h.split('.');
  if (parts.length < 2) return '';
  return '.' + parts.slice(-2).join('.');
}

/** Lee la selección de fuentes guardada. `null` = sin selección (⇒ todas). */
export function readFuentesSel(): string[] | null {
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
export function writeFuentesSel(fuentes: string[] | null): void {
  if (typeof document === 'undefined') return;
  const dom = parentDomain();
  const domAttr = dom ? `; domain=${dom}` : '';
  const secure = window.location.protocol === 'https:' ? '; secure' : '';
  if (!fuentes || fuentes.length === 0) {
    document.cookie = `${COOKIE}=; path=/${domAttr}; max-age=0; samesite=lax${secure}`;
  } else {
    const val = encodeURIComponent(JSON.stringify(fuentes));
    document.cookie = `${COOKIE}=${val}; path=/${domAttr}; max-age=${MAX_AGE}; samesite=lax${secure}`;
  }
  try {
    window.dispatchEvent(new CustomEvent(FUENTES_CHANGED_EVENT));
  } catch {
    /* SSR / entornos sin window */
  }
}
