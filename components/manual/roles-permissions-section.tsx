/**
 * Shared manual content for the "Roles y permisos" section.
 *
 * Cada app declara su propio catálogo de roles en
 * `instrumentation.node.ts` (APP_ROLES / APP_PERMISSIONS). Esta sección
 * del manual describe ese catálogo en lenguaje natural: cada rol con un
 * resumen de capacidades, sin duplicar la lista exacta de permission
 * keys (esa vive en el diálogo (i) del modal "Permisos por aplicación").
 *
 * Convención multi-app: el caller pasa los roles ya en el idioma del
 * wrapper (mismo patrón que el resto de `src/content/manual/<lang>/*`).
 */

import { CheckCircle2, Info, ShieldCheck, Star } from "lucide-react";

import { roleColor, roleLabel } from "../admin/role-catalog";

export type ManualLang = "CAST" | "CAT" | "EUS" | "GAL";

export interface RoleRow {
  /** Clave del rol tal y como aparece en APP_ROLES (p.ej. "NOTARIO"). */
  key: string;
  /** Etiqueta legible. Si no se pasa, se usa `roleLabel(key)` del catálogo central. */
  label?: string;
  /** Marca este rol como el "org admin" de la app (no editable desde el panel). */
  isOrgAdmin?: boolean;
  /** Marca este rol como el rol por defecto al invitar. */
  isDefault?: boolean;
  /** Resumen de una línea sobre el alcance del rol. */
  summary: string;
  /** 3-5 viñetas con las capacidades principales del rol. */
  capabilities: string[];
}

export interface RolesPermissionsSectionProps {
  lang: ManualLang;
  /** Nombre legible de la app (p.ej. "Notaría"). Usado en el intro. */
  appName: string;
  roles: RoleRow[];
}

interface SectionStrings {
  sectionTitle: string;
  intro: (appName: string) => string;
  capabilitiesLabel: string;
  orgAdminBadge: string;
  defaultBadge: string;
  detailNote: string;
}

const STRINGS: Record<ManualLang, SectionStrings> = {
  CAST: {
    sectionTitle: "Roles y permisos",
    intro: (appName) =>
      `Cada aplicación de MycoLegal define su propio catálogo de roles porque cubre un dominio distinto. Estos son los roles disponibles en ${appName} y lo que puede hacer cada uno. Para ver la lista exacta de permisos detrás de cada rol, abre el modal "Permisos por aplicación" en Administración → Usuarios y pulsa el icono (i) junto a esta app.`,
    capabilitiesLabel: "Qué puede hacer:",
    orgAdminBadge: "Admin de la organización",
    defaultBadge: "Por defecto al invitar",
    detailNote:
      "Los permisos individuales se pueden activar o desactivar de uno en uno desde el diálogo (i). Eso permite crear perfiles a medida: parte de un rol predefinido y ajusta los permisos concretos que sobren o falten para ese empleado.",
  },
  CAT: {
    sectionTitle: "Rols i permisos",
    intro: (appName) =>
      `Cada aplicació de MycoLegal defineix el seu propi catàleg de rols perquè cobreix un domini diferent. Aquests són els rols disponibles a ${appName} i el que pot fer cadascun. Per veure la llista exacta de permisos darrere de cada rol, obre el modal "Permisos per aplicació" a Administració → Usuaris i prem la icona (i) al costat d'aquesta app.`,
    capabilitiesLabel: "Què pot fer:",
    orgAdminBadge: "Administrador de l'organització",
    defaultBadge: "Per defecte en convidar",
    detailNote:
      "Els permisos individuals es poden activar o desactivar d'un en un des del diàleg (i). Això permet crear perfils a mida: parteix d'un rol predefinit i ajusta els permisos concrets que sobrin o faltin per a aquest empleat.",
  },
  EUS: {
    sectionTitle: "Rolak eta baimenak",
    intro: (appName) =>
      `MycoLegal-en aplikazio bakoitzak bere rol-katalogoa definitzen du, domeinu desberdina hartzen baitu. Hauek dira ${appName}-en eskuragarri dauden rolak eta bakoitzak egin dezakeena. Rol bakoitzaren atzean dagoen baimen-zerrenda zehatza ikusteko, ireki "Aplikazio bakoitzaren baimenak" modala Administrazioa → Erabiltzaileak atalean eta sakatu (i) ikonoa app honen ondoan.`,
    capabilitiesLabel: "Zer egin dezake:",
    orgAdminBadge: "Erakundearen administratzailea",
    defaultBadge: "Lehenetsia gonbidatzean",
    detailNote:
      "Banakako baimenak banan-banan aktiba edo desaktiba daitezke (i) elkarrizketa-koadrotik. Horrek profil pertsonalizatuak sortzeko aukera ematen du: aurredefinitutako rol batetik abiatuta, langile horretarako behar ez diren edo falta diren baimen zehatzak doitu.",
  },
  GAL: {
    sectionTitle: "Roles e permisos",
    intro: (appName) =>
      `Cada aplicación de MycoLegal define o seu propio catálogo de roles porque cobre un dominio distinto. Estes son os roles dispoñibles en ${appName} e o que pode facer cada un. Para ver a lista exacta de permisos detrás de cada rol, abre o modal "Permisos por aplicación" en Administración → Usuarios e preme a icona (i) ao lado desta app.`,
    capabilitiesLabel: "Que pode facer:",
    orgAdminBadge: "Administrador da organización",
    defaultBadge: "Por defecto ao convidar",
    detailNote:
      "Os permisos individuais pódense activar ou desactivar un a un desde o diálogo (i). Iso permite crear perfís á medida: parte dun rol predefinido e axusta os permisos concretos que sobren ou falten para ese empregado.",
  },
};

function RoleCard({ row, t }: { row: RoleRow; t: SectionStrings }) {
  const label = row.label ?? roleLabel(row.key);
  const badgeClass = roleColor(row.key);

  return (
    <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${badgeClass}`}
        >
          {row.key}
        </span>
        <span className="text-sm font-semibold text-gray-900">{label}</span>
        {row.isOrgAdmin && (
          <span className="inline-flex items-center gap-1 rounded-full border border-purple-200 bg-purple-50 px-2 py-0.5 text-xs font-medium text-purple-700">
            <ShieldCheck className="h-3 w-3" />
            {t.orgAdminBadge}
          </span>
        )}
        {row.isDefault && (
          <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
            <Star className="h-3 w-3" />
            {t.defaultBadge}
          </span>
        )}
      </div>
      <p className="text-sm leading-relaxed text-gray-600">{row.summary}</p>
      {row.capabilities.length > 0 && (
        <div className="mt-3">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
            {t.capabilitiesLabel}
          </p>
          <ul className="space-y-1">
            {row.capabilities.map((cap, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                <span>{cap}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function RolesPermissionsSection({
  lang,
  appName,
  roles,
}: RolesPermissionsSectionProps) {
  const t = STRINGS[lang] ?? STRINGS.CAST;

  return (
    <section id="roles-permisos" className="space-y-4">
      <h2 className="mb-1 text-lg font-semibold text-gray-900">{t.sectionTitle}</h2>
      <p className="text-sm leading-relaxed text-gray-600">{t.intro(appName)}</p>

      <div className="grid gap-3">
        {roles.map((row) => (
          <RoleCard key={row.key} row={row} t={t} />
        ))}
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-cyan-200 bg-cyan-50 p-4">
        <Info className="h-5 w-5 shrink-0 text-cyan-600" />
        <p className="text-sm text-cyan-800">{t.detailNote}</p>
      </div>
    </section>
  );
}
