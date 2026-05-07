/**
 * Shared manual content for the "Administración → Usuarios" section.
 *
 * Las 9 apps de usuario montan el mismo `UsersAdminPanel`, así que el
 * contenido del manual sobre cómo se invita / suspende / desactiva /
 * elimina usuarios es idéntico. Este componente se renderiza desde el
 * wrapper `administracion.tsx` de cada app, por idioma.
 */

import {
  AlertTriangle,
  Info,
  Lock,
  Mail,
  Pause,
  Pencil,
  Trash2,
  UserPlus,
} from "lucide-react";

export type ManualLang = "CAST" | "CAT" | "EUS" | "GAL";

export interface AdminUsersSectionProps {
  lang: ManualLang;
  /** Nombre legible de la app (p.ej. "Notaría", "Archivo"). */
  appName: string;
  /** Roles asignables vía el panel — los que aparecen en el desplegable de invitación. */
  assignableRoles: readonly string[];
  /** Rol protegido (no editable desde el panel). Default: el rol de org admin de la app. */
  protectedRole?: string;
}

interface ActionStrings {
  label: string;
  desc: string;
}

interface SectionStrings {
  sectionTitle: string;
  intro: string;
  invite: ActionStrings;
  resend: ActionStrings;
  edit: ActionStrings;
  suspend: ActionStrings;
  deactivate: ActionStrings;
  remove: ActionStrings;
  protectedRoleNote: (role: string) => string;
  rolesNote: (roles: string) => string;
  permissionsNote: string;
}

const STRINGS: Record<ManualLang, SectionStrings> = {
  CAST: {
    sectionTitle: "Gestión de usuarios",
    intro:
      "La pestaña Usuarios del menú Administración muestra la tabla del personal de tu organización con acceso a esta aplicación: nombre, email, rol, estado y último acceso. Desde aquí inicias el alta, gestionas el ciclo de vida y ajustas los permisos de cada miembro del equipo.",
    invite: {
      label: "Invitar usuario",
      desc: "Pulsa Invitar usuario para enviar una invitación por correo. Indica email, nombre visible (opcional) y el rol que quieras asignar. El usuario recibe un enlace para activar su cuenta y definir su contraseña. Si el correo ya pertenece a alguien de tu organización en otra app, el sistema reutiliza la cuenta y solo añade el permiso para esta.",
    },
    resend: {
      label: "Reenviar invitación",
      desc: "Si el enlace original caducó o el usuario no lo recibió, pulsa el icono de sobre ✉️ en su fila. Se envía un correo nuevo con un enlace fresco. Solo aplica a usuarios que aún no han activado su cuenta.",
    },
    edit: {
      label: "Editar rol",
      desc: "Pulsa el icono de lápiz ✏️ para cambiar el rol de un usuario en esta aplicación. El cambio es inmediato; las sesiones activas del usuario se invalidan al siguiente refresh para que el nuevo rol surta efecto.",
    },
    suspend: {
      label: "Suspender",
      desc: "Pausa temporal con un mensaje personalizable que el usuario verá al intentar entrar. Útil para situaciones recuperables: investigación interna, baja larga, impago en curso. Reversible con Reactivar.",
    },
    deactivate: {
      label: "Desactivar",
      desc: "Bloquea el acceso del usuario sin mostrarle un mensaje específico. Se conservan datos, autoría e histórico. Útil para offboarding limpio (ex-empleado). Reversible con Reactivar.",
    },
    remove: {
      label: "Eliminar",
      desc: "Borrado físico de la cuenta y datos asociados. Irreversible. Úsalo solo para errores de alta o ejercicio de derecho al olvido (RGPD). Requiere confirmación explícita.",
    },
    protectedRoleNote: (role) =>
      `El rol ${role} es el del administrador de la organización en esta aplicación y no puede editarse ni eliminarse desde este panel. Para cambiar quién es el org admin de tu organización, contacta con soporte MycoLegal.`,
    rolesNote: (roles) =>
      `Los roles asignables desde el desplegable de invitación en esta aplicación son: ${roles}.`,
    permissionsNote:
      "Las tres acciones de bloqueo (Suspender / Desactivar / Eliminar) revocan los tokens de refresco del usuario. La sesión activa puede sobrevivir unos minutos hasta que expira el access token corto, pero el usuario no podrá refrescarla.",
  },
  CAT: {
    sectionTitle: "Gestió d'usuaris",
    intro:
      "La pestanya Usuaris del menú Administració mostra la taula del personal de la teva organització amb accés a aquesta aplicació: nom, correu, rol, estat i darrer accés. Des d'aquí inicies l'alta, gestiones el cicle de vida i ajustes els permisos de cada membre de l'equip.",
    invite: {
      label: "Convidar usuari",
      desc: "Prem Convidar usuari per enviar una invitació per correu. Indica correu, nom visible (opcional) i el rol que vulguis assignar. L'usuari rep un enllaç per activar el seu compte i definir la seva contrasenya. Si el correu ja pertany a algú de la teva organització en una altra app, el sistema reutilitza el compte i només afegeix el permís per a aquesta.",
    },
    resend: {
      label: "Reenviar invitació",
      desc: "Si l'enllaç original ha caducat o l'usuari no l'ha rebut, prem la icona del sobre ✉️ a la seva fila. S'envia un correu nou amb un enllaç fresc. Només aplica a usuaris que encara no han activat el seu compte.",
    },
    edit: {
      label: "Editar rol",
      desc: "Prem la icona del llapis ✏️ per canviar el rol d'un usuari en aquesta aplicació. El canvi és immediat; les sessions actives de l'usuari s'invaliden al següent refresc perquè el nou rol tingui efecte.",
    },
    suspend: {
      label: "Suspendre",
      desc: "Pausa temporal amb un missatge personalitzable que l'usuari veurà en intentar entrar. Útil per a situacions recuperables: investigació interna, baixa llarga, impagament en curs. Reversible amb Reactivar.",
    },
    deactivate: {
      label: "Desactivar",
      desc: "Bloqueja l'accés de l'usuari sense mostrar-li cap missatge específic. Es conserven dades, autoria i històric. Útil per a un offboarding net (extreballador). Reversible amb Reactivar.",
    },
    remove: {
      label: "Eliminar",
      desc: "Esborrat físic del compte i dades associades. Irreversible. Fes-lo servir només per a errors d'alta o exercici del dret a l'oblit (RGPD). Requereix confirmació explícita.",
    },
    protectedRoleNote: (role) =>
      `El rol ${role} és el de l'administrador de l'organització en aquesta aplicació i no es pot editar ni eliminar des d'aquest panell. Per canviar qui és l'org admin de la teva organització, contacta amb el suport MycoLegal.`,
    rolesNote: (roles) =>
      `Els rols assignables des del desplegable d'invitació en aquesta aplicació són: ${roles}.`,
    permissionsNote:
      "Les tres accions de bloqueig (Suspendre / Desactivar / Eliminar) revoquen els tokens de refresc de l'usuari. La sessió activa pot sobreviure uns minuts fins que expira l'access token curt, però l'usuari no la podrà refrescar.",
  },
  EUS: {
    sectionTitle: "Erabiltzaileen kudeaketa",
    intro:
      "Administrazioa menuko Erabiltzaileak fitxak zure erakundeko langileen taula erakusten du, aplikazio honetarako sarbidearekin: izena, posta, rola, egoera eta azken sarrera. Hemendik abiatzen duzu altan, bizi-zikloa kudeatzen duzu eta taldekide bakoitzaren baimenak doitzen dituzu.",
    invite: {
      label: "Erabiltzailea gonbidatu",
      desc: "Sakatu Erabiltzailea gonbidatu posta bidez gonbidapena bidaltzeko. Adierazi posta, ikusgai dagoen izena (aukerakoa) eta esleitu nahi duzun rola. Erabiltzaileak esteka jasoko du kontua aktibatzeko eta pasahitza ezartzeko. Posta dagoeneko zure erakundeko norbaitena bada beste app batean, sistemak kontua berrerabiltzen du eta honetarako baimena bakarrik gehitzen du.",
    },
    resend: {
      label: "Gonbidapena birbidali",
      desc: "Jatorrizko esteka iraungi bada edo erabiltzaileak ez badu jaso, sakatu bere errenkadako gutun-azalaren ikonoa ✉️. Posta berria bidaltzen da esteka berriarekin. Kontua oraindik aktibatu ez duten erabiltzaileei bakarrik aplikatzen zaie.",
    },
    edit: {
      label: "Rola editatu",
      desc: "Sakatu arkatzaren ikonoa ✏️ aplikazio honetan erabiltzaile baten rola aldatzeko. Aldaketa berehalakoa da; erabiltzailearen saio aktiboak hurrengo freskatzean baliogabetzen dira rol berria eragin dezan.",
    },
    suspend: {
      label: "Eten",
      desc: "Aldi baterako etena, erabiltzaileak sartzen saiatzean ikusiko duen mezu pertsonalizagarri batekin. Erabilgarria berreskuragarriak diren egoeretarako: barne-ikerketa, baja luzea, ordainketa-eza. Berrezargarria Berraktibatu aukerarekin.",
    },
    deactivate: {
      label: "Desaktibatu",
      desc: "Erabiltzailearen sarbidea blokeatzen du mezu zehatzik erakutsi gabe. Datuak, egiletza eta historiala gordetzen dira. Erabilgarria offboarding garbietarako (langile ohia). Berrezargarria Berraktibatu aukerarekin.",
    },
    remove: {
      label: "Ezabatu",
      desc: "Kontuaren eta lotutako datuen ezabaketa fisikoa. Itzulezina. Erabili soilik altarako akatsetan edo ahaztua izateko eskubidea (RGPD) gauzatzean. Berariazko berrespena eskatzen du.",
    },
    protectedRoleNote: (role) =>
      `${role} rola aplikazio honetan erakundearen administratzailearena da eta ezin da panel honetatik editatu edo ezabatu. Zure erakundeko org admina nor den aldatzeko, jarri harremanetan MycoLegal laguntzarekin.`,
    rolesNote: (roles) =>
      `Aplikazio honetan gonbidapenaren goitibeherakatik esleigarriak diren rolak hauek dira: ${roles}.`,
    permissionsNote:
      "Hiru blokeatze-ekintzek (Eten / Desaktibatu / Ezabatu) erabiltzailearen freskatze-tokenak baliogabetzen dituzte. Saio aktiboak minutu batzuk iraun ditzake access token laburra iraungitzen den arte, baina erabiltzaileak ezin izango du freskatu.",
  },
  GAL: {
    sectionTitle: "Xestión de usuarios",
    intro:
      "A pestana Usuarios do menú Administración mostra a táboa do persoal da túa organización con acceso a esta aplicación: nome, correo, rol, estado e último acceso. Dende aquí inicias a alta, xestionas o ciclo de vida e axustas os permisos de cada membro do equipo.",
    invite: {
      label: "Convidar usuario",
      desc: "Preme Convidar usuario para enviar unha invitación por correo. Indica correo, nome visible (opcional) e o rol que queiras asignar. O usuario recibe unha ligazón para activar a súa conta e definir o seu contrasinal. Se o correo xa pertence a alguén da túa organización noutra app, o sistema reutiliza a conta e só engade o permiso para esta.",
    },
    resend: {
      label: "Reenviar invitación",
      desc: "Se a ligazón orixinal caducou ou o usuario non a recibiu, preme a icona do sobre ✉️ na súa fila. Envíase un correo novo cunha ligazón fresca. Só se aplica a usuarios que aínda non activaron a súa conta.",
    },
    edit: {
      label: "Editar rol",
      desc: "Preme a icona do lapis ✏️ para cambiar o rol dun usuario nesta aplicación. O cambio é inmediato; as sesións activas do usuario invalídanse no seguinte refresco para que o novo rol teña efecto.",
    },
    suspend: {
      label: "Suspender",
      desc: "Pausa temporal cunha mensaxe personalizable que o usuario verá ao intentar entrar. Útil para situacións recuperables: investigación interna, baixa longa, impago en curso. Reversible con Reactivar.",
    },
    deactivate: {
      label: "Desactivar",
      desc: "Bloquea o acceso do usuario sen amosarlle unha mensaxe específica. Consérvanse datos, autoría e historial. Útil para offboarding limpo (extraballador). Reversible con Reactivar.",
    },
    remove: {
      label: "Eliminar",
      desc: "Borrado físico da conta e datos asociados. Irreversible. Úsao só para erros de alta ou exercicio do dereito ao esquecemento (RGPD). Require confirmación explícita.",
    },
    protectedRoleNote: (role) =>
      `O rol ${role} é o do administrador da organización nesta aplicación e non pode editarse nin eliminarse dende este panel. Para cambiar quen é o org admin da túa organización, contacta co soporte MycoLegal.`,
    rolesNote: (roles) =>
      `Os roles asignables dende o despregable de invitación nesta aplicación son: ${roles}.`,
    permissionsNote:
      "As tres accións de bloqueo (Suspender / Desactivar / Eliminar) revogan os tokens de refresco do usuario. A sesión activa pode sobrevivir uns minutos ata que expira o access token curto, pero o usuario non poderá refrescala.",
  },
};

interface ActionRowProps {
  icon: typeof UserPlus;
  label: string;
  desc: string;
  tone?: "info" | "warning" | "danger";
}

function ActionRow({ icon: Icon, label, desc, tone = "info" }: ActionRowProps) {
  const iconClass =
    tone === "danger"
      ? "text-red-500"
      : tone === "warning"
        ? "text-amber-600"
        : "text-cyan-600";
  return (
    <div className="flex items-start gap-3 rounded-lg border border-gray-100 bg-white p-3">
      <Icon className={`h-4 w-4 shrink-0 ${iconClass} mt-0.5`} />
      <div>
        <p className="text-sm font-semibold text-gray-900">{label}</p>
        <p className="mt-0.5 text-sm text-gray-600">{desc}</p>
      </div>
    </div>
  );
}

export function AdminUsersSection({
  lang,
  appName: _appName,
  assignableRoles,
  protectedRole,
}: AdminUsersSectionProps) {
  const t = STRINGS[lang] ?? STRINGS.CAST;
  const rolesList = assignableRoles.join(", ");

  return (
    <section id="usuarios" className="space-y-3">
      <h2 className="mb-1 text-lg font-semibold text-gray-900">{t.sectionTitle}</h2>
      <p className="text-sm leading-relaxed text-gray-600">{t.intro}</p>

      <div className="space-y-2">
        <ActionRow icon={UserPlus} label={t.invite.label} desc={t.invite.desc} />
        <ActionRow icon={Mail} label={t.resend.label} desc={t.resend.desc} />
        <ActionRow icon={Pencil} label={t.edit.label} desc={t.edit.desc} />
        <ActionRow icon={Pause} label={t.suspend.label} desc={t.suspend.desc} tone="warning" />
        <ActionRow icon={Lock} label={t.deactivate.label} desc={t.deactivate.desc} tone="warning" />
        <ActionRow icon={Trash2} label={t.remove.label} desc={t.remove.desc} tone="danger" />
      </div>

      {protectedRole && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
          <p className="text-sm text-amber-800">{t.protectedRoleNote(protectedRole)}</p>
        </div>
      )}

      <div className="flex items-start gap-3 rounded-xl border border-cyan-200 bg-cyan-50 p-4">
        <Info className="h-5 w-5 shrink-0 text-cyan-600" />
        <p className="text-sm text-cyan-800">{t.rolesNote(rolesList)}</p>
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-gray-100 bg-gray-50 p-4">
        <Info className="h-5 w-5 shrink-0 text-gray-500" />
        <p className="text-sm text-gray-600">{t.permissionsNote}</p>
      </div>
    </section>
  );
}
