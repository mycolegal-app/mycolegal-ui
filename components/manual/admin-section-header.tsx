/**
 * Cabecera estándar para la sección "Administración" del manual de cada app.
 * Renderiza el h1 + intro contextualizado al nombre de la app y al idioma.
 */

import type { ManualLang } from "./admin-users-section";

export interface AdminSectionHeaderProps {
  lang: ManualLang;
  appName: string;
  /**
   * Rol que se considera org admin en esta app (NOTARIO, EDITOR, EDITOR_CATALOGO, …).
   * Se usa para advertir que la pantalla solo es visible para ese rol.
   */
  orgAdminRoleLabel?: string;
}

const STRINGS: Record<ManualLang, {
  title: string;
  intro: (appName: string) => string;
  visibilityNote: (role: string) => string;
}> = {
  CAST: {
    title: "Administración",
    intro: (appName) =>
      `La sección Administración agrupa la gestión del equipo y la configuración específica de ${appName}. Las pestañas que veas aquí dependen de las necesidades de configuración de la aplicación; en algunas apps solo encontrarás Usuarios, en otras hay pestañas adicionales como Configuración, Plantillas de correo, Aranceles o Auditoría.`,
    visibilityNote: (role) =>
      `Esta sección solo es visible para los usuarios con rol ${role} (administrador de la organización). Si no la ves en el sidebar, es porque tu cuenta no tiene permisos administrativos en esta app.`,
  },
  CAT: {
    title: "Administració",
    intro: (appName) =>
      `La secció Administració agrupa la gestió de l'equip i la configuració específica de ${appName}. Les pestanyes que vegis aquí depenen de les necessitats de configuració de l'aplicació; en algunes apps només trobaràs Usuaris, en altres hi ha pestanyes addicionals com Configuració, Plantilles de correu, Aranzels o Auditoria.`,
    visibilityNote: (role) =>
      `Aquesta secció només és visible per als usuaris amb rol ${role} (administrador de l'organització). Si no la veus al menú lateral, és perquè el teu compte no té permisos administratius en aquesta app.`,
  },
  EUS: {
    title: "Administrazioa",
    intro: (appName) =>
      `Administrazioa atalak taldearen kudeaketa eta ${appName}-en konfigurazio espezifikoa biltzen ditu. Hemen ikusiko dituzun fitxak aplikazioaren konfigurazio-beharretatik eraketzen dira; app batzuetan Erabiltzaileak bakarrik aurkituko dituzu, beste batzuetan badaude fitxa gehigarriak Konfigurazioa, Posta-txantiloiak, Aranzelak edo Auditoretza bezalakoak.`,
    visibilityNote: (role) =>
      `Atal hau ${role} rola duten erabiltzaileentzat soilik dago ikusgai (erakundearen administratzailea). Albo-menuan ikusten ez baduzu, zure kontuak ez dituelako baimen administratiboak app honetan.`,
  },
  GAL: {
    title: "Administración",
    intro: (appName) =>
      `A sección Administración agrupa a xestión do equipo e a configuración específica de ${appName}. As pestanas que vexas aquí dependen das necesidades de configuración da aplicación; nalgunhas apps só atoparás Usuarios, noutras hai pestanas adicionais como Configuración, Modelos de correo, Aranceis ou Auditoría.`,
    visibilityNote: (role) =>
      `Esta sección só é visible para os usuarios con rol ${role} (administrador da organización). Se non a ves no menú lateral, é porque a túa conta non ten permisos administrativos nesta app.`,
  },
};

export function AdminSectionHeader({ lang, appName, orgAdminRoleLabel }: AdminSectionHeaderProps) {
  const t = STRINGS[lang] ?? STRINGS.CAST;
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">{t.title}</h1>
      <p className="mt-2 text-sm leading-relaxed text-gray-600">{t.intro(appName)}</p>
      {orgAdminRoleLabel && (
        <p className="mt-2 text-sm leading-relaxed text-gray-500">
          {t.visibilityNote(orgAdminRoleLabel)}
        </p>
      )}
    </div>
  );
}
