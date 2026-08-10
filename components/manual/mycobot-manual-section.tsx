/**
 * Sección de manual "Preguntar a MycoBot", compartida por TODAS las apps que
 * montan el asistente. Se autora UNA sola vez aquí y cada app la embebe en su
 * Manual (un fichero `src/content/manual/<lang>/mycobot.tsx` que renderiza este
 * componente con su propio `appSlug`).
 *
 * Doble propósito, como `EcosistemaAppsGlosario`:
 *  1. Página legible del Manual de cada app.
 *  2. Al indexarse el Manual, entra en el corpus `mycobot_doc` bajo el appSlug de
 *     cada app (MycoBot filtra DURO por app), así el propio asistente puede
 *     responder "¿qué me puedes responder?" desde su ayuda.
 *
 * Es un componente PURO (sin hooks, sin "use client"): el extractor del corpus lo
 * renderiza con `renderToStaticMarkup` sin props de runtime. Por eso todo el
 * texto —incluidos los ejemplos por app— vive en diccionarios por idioma aquí
 * dentro; el único parámetro es `appSlug`, que selecciona el juego de ejemplos.
 *
 * Deliberadamente NO habla de "tools", "function-calling" ni de la mecánica
 * interna: describe, en lenguaje de usuario, los TIPOS de pregunta que entiende.
 */

import { Sparkles, BookOpen, FolderSearch, Scale, Landmark } from "lucide-react";

import type { ManualLang } from "./admin-users-section";

export interface MycoBotManualSectionProps {
  lang: ManualLang;
  /** Slug de la app propietaria del manual; selecciona los ejemplos de "datos". */
  appSlug: string;
}

/** Perfil de "datos del despacho" de cada app (qué ejemplos mostrar en el bloque 2). */
type DataProfile = "notaria" | "legifirma" | "unidad" | "none";

const DATA_PROFILE: Record<string, DataProfile> = {
  notaria: "notaria",
  legifirma: "legifirma",
  polizas: "unidad",
  tributos: "unidad",
  archivo: "unidad",
  // Apps sin datos consultables propios hoy: solo ayuda + (si procede) doctrina/normativa.
  consultor: "none",
  peticiones: "none",
  tramitacion: "none",
  config: "none",
  facturae: "none",
};

interface Family {
  title: string;
  desc: string;
  examples: string[];
}

interface Strings {
  title: string;
  intro: string;
  famAyuda: Family;
  /** Bloque "datos del despacho": el título/descr es común; los ejemplos, por perfil. */
  datosTitle: string;
  datosDescNotaria: string;
  datosDescLegifirma: string;
  datosDescUnidad: string;
  famDoctrina: Family;
  famNormativa: Family;
  behaviorTitle: string;
  behavior: string[];
  startTitle: string;
  start: string;
  gatedNote: string;
  examplesLabel: string;
}

const DATA_EXAMPLES: Record<Exclude<DataProfile, "none">, Record<ManualLang, string[]>> = {
  notaria: {
    CAST: [
      "¿Cuántos expedientes tengo pendientes de firma esta semana?",
      "Enséñame los protocolos con defectos sin resolver.",
      "¿Qué minutas me quedan por cobrar este mes?",
    ],
    CAT: [
      "Quants expedients tinc pendents de signatura aquesta setmana?",
      "Ensenya'm els protocols amb defectes sense resoldre.",
      "Quines minutes em queden per cobrar aquest mes?",
    ],
    GAL: [
      "Cantos expedientes teño pendentes de sinatura esta semana?",
      "Amósame os protocolos con defectos sen resolver.",
      "Que minutas me quedan por cobrar este mes?",
    ],
    EUS: [
      "Zenbat espediente ditut aste honetan sinatzeko zain?",
      "Erakutsi ebatzi gabeko akatsak dituzten protokoloak.",
      "Zein minuta ditut hilabete honetan kobratzeke?",
    ],
  },
  legifirma: {
    CAST: [
      "¿Qué actuaciones tengo pendientes de entrega?",
      "Enséñame el Libro Indicador de este año.",
      "¿Qué facturas de legitimaciones están sin cobrar?",
    ],
    CAT: [
      "Quines actuacions tinc pendents de lliurament?",
      "Ensenya'm el Llibre Indicador d'enguany.",
      "Quines factures de legitimacions estan sense cobrar?",
    ],
    GAL: [
      "Que actuacións teño pendentes de entrega?",
      "Amósame o Libro Indicador deste ano.",
      "Que facturas de lexitimacións están sen cobrar?",
    ],
    EUS: [
      "Zein jarduketa ditut entregatzeke?",
      "Erakutsi aurtengo Liburu Adierazlea.",
      "Zein legitimazio-faktura daude kobratzeke?",
    ],
  },
  unidad: {
    CAST: [
      "Busca el documento «poder de representación» de este expediente.",
      "¿Qué dice el PDF que subí ayer?",
    ],
    CAT: [
      "Cerca el document «poder de representació» d'aquest expedient.",
      "Què diu el PDF que vaig pujar ahir?",
    ],
    GAL: [
      "Busca o documento «poder de representación» deste expediente.",
      "Que di o PDF que subín onte?",
    ],
    EUS: [
      "Bilatu espediente honetako «ordezkaritza ahalordea» dokumentua.",
      "Zer dio atzo igo nuen PDFak?",
    ],
  },
};

const STRINGS: Record<ManualLang, Strings> = {
  CAST: {
    title: "Preguntar a MycoBot",
    intro:
      "MycoBot es el asistente que tienes en el lateral derecho de cualquier pantalla. Le escribes en lenguaje natural, como si preguntaras a un compañero. Estos son los tipos de pregunta que entiende:",
    famAyuda: {
      title: "Cómo usar la aplicación",
      desc: "Dudas de uso del producto: cómo hacer algo, dónde está una función o qué significa un término. Responde con el manual y te enlaza la página exacta.",
      examples: [
        "¿Dónde doy de alta un expediente?",
        "¿Qué significa el estado «En trámite»?",
        "¿Cómo emito una copia?",
      ],
    },
    datosTitle: "Datos de tu despacho",
    datosDescNotaria:
      "Consulta tu propia información operativa: expedientes, protocolos, agenda de firmas, minutas y alertas. Solo consulta (nunca modifica nada) y respeta tus permisos: solo ve lo que tú verías.",
    datosDescLegifirma:
      "Consulta tu propia información operativa: actuaciones, Libro Indicador, facturación y clientes. Solo consulta (nunca modifica nada) y respeta tus permisos: solo ve lo que tú verías.",
    datosDescUnidad:
      "Busca y lee los documentos de tu Unidad de Red. Solo consulta (nunca modifica nada) y respeta tus permisos: solo ve los documentos a los que tú tienes acceso.",
    famDoctrina: {
      title: "Dudas jurídicas y de doctrina",
      desc: "Preguntas jurídicas apoyadas en el corpus de resoluciones de la DGSJFP/DGRN y doctrina registral y notarial. Cita siempre la resolución en la que se apoya.",
      examples: [
        "¿Es inscribible una hipoteca unilateral no aceptada?",
        "Criterios de la DGSJFP sobre la calificación del NIF del representante.",
      ],
    },
    famNormativa: {
      title: "Normativa fiscal",
      desc: "Qué dice la norma tributaria autonómica y municipal: tipos de gravamen, reducciones, bonificaciones y requisitos de un beneficio fiscal. No calcula importes: para el cálculo está el simulador de Tributos.",
      examples: [
        "¿Qué bonificación hay en el ISD en Asturias entre padres e hijos?",
        "¿Qué tipo de AJD se aplica a una obra nueva en Cataluña?",
      ],
    },
    behaviorTitle: "Cómo se comporta",
    behavior: [
      "Cita sus fuentes y no inventa: si no encuentra base, lo dice.",
      "No calcula impuestos ni realiza acciones: solo lee y responde.",
      "Respeta tus permisos: nunca te muestra datos que no verías en la aplicación.",
      "Solo tiene en cuenta las clases de la Biblioteca legal que tengas marcadas; la cabecera del chat indica cuántas clases y documentos considera, y cada referencia que cita muestra su tipo (clase) con icono y color.",
    ],
    startTitle: "Cómo empezar",
    start:
      "Abre MycoBot con el botón del lateral derecho y escribe tu pregunta en lenguaje natural. Escribe /help en cualquier momento para volver a ver esta ayuda dentro del chat, o /sources para elegir qué clases de la Biblioteca considera.",
    gatedNote:
      "Disponible si tu organización lo tiene contratado.",
    examplesLabel: "Prueba a preguntar",
  },
  CAT: {
    title: "Preguntar a MycoBot",
    intro:
      "MycoBot és l'assistent que tens al lateral dret de qualsevol pantalla. Li escrius en llenguatge natural, com si preguntessis a un company. Aquests són els tipus de pregunta que entén:",
    famAyuda: {
      title: "Com fer servir l'aplicació",
      desc: "Dubtes d'ús del producte: com fer una cosa, on és una funció o què significa un terme. Respon amb el manual i t'enllaça la pàgina exacta.",
      examples: [
        "On done d'alta un expedient?",
        "Què significa l'estat «En tràmit»?",
        "Com emeto una còpia?",
      ],
    },
    datosTitle: "Dades del teu despatx",
    datosDescNotaria:
      "Consulta la teva pròpia informació operativa: expedients, protocols, agenda de signatures, minutes i alertes. Només consulta (mai no modifica res) i respecta els teus permisos: només veu allò que tu veuries.",
    datosDescLegifirma:
      "Consulta la teva pròpia informació operativa: actuacions, Llibre Indicador, facturació i clients. Només consulta (mai no modifica res) i respecta els teus permisos: només veu allò que tu veuries.",
    datosDescUnidad:
      "Cerca i llegeix els documents de la teva Unitat de Xarxa. Només consulta (mai no modifica res) i respecta els teus permisos: només veu els documents als quals tu tens accés.",
    famDoctrina: {
      title: "Dubtes jurídics i de doctrina",
      desc: "Preguntes jurídiques basades en el corpus de resolucions de la DGSJFP/DGRN i doctrina registral i notarial. Cita sempre la resolució en què es basa.",
      examples: [
        "És inscriptible una hipoteca unilateral no acceptada?",
        "Criteris de la DGSJFP sobre la qualificació del NIF del representant.",
      ],
    },
    famNormativa: {
      title: "Normativa fiscal",
      desc: "Què diu la norma tributària autonòmica i municipal: tipus de gravamen, reduccions, bonificacions i requisits d'un benefici fiscal. No calcula imports: per al càlcul hi ha el simulador de Tributs.",
      examples: [
        "Quina bonificació hi ha a l'ISD a Astúries entre pares i fills?",
        "Quin tipus d'AJD s'aplica a una obra nova a Catalunya?",
      ],
    },
    behaviorTitle: "Com es comporta",
    behavior: [
      "Cita les seves fonts i no s'inventa res: si no troba base, ho diu.",
      "No calcula impostos ni fa accions: només llegeix i respon.",
      "Respecta els teus permisos: mai no et mostra dades que no veuries a l'aplicació.",
      "Només té en compte les classes de la Biblioteca legal que tinguis marcades; la capçalera del xat indica quantes classes i documents considera, i cada referència que cita mostra el seu tipus (classe) amb icona i color.",
    ],
    startTitle: "Com començar",
    start:
      "Obre MycoBot amb el botó del lateral dret i escriu la teva pregunta en llenguatge natural. Escriu /help en qualsevol moment per tornar a veure aquesta ajuda dins del xat, o /sources per triar quines classes de la Biblioteca té en compte.",
    gatedNote: "Disponible si la teva organització ho té contractat.",
    examplesLabel: "Prova a preguntar",
  },
  GAL: {
    title: "Preguntar a MycoBot",
    intro:
      "MycoBot é o asistente que tes no lateral dereito de calquera pantalla. Escríbeslle en linguaxe natural, coma se preguntaras a un compañeiro. Estes son os tipos de pregunta que entende:",
    famAyuda: {
      title: "Como usar a aplicación",
      desc: "Dúbidas de uso do produto: como facer algo, onde está unha función ou que significa un termo. Responde co manual e enlázache a páxina exacta.",
      examples: [
        "Onde dou de alta un expediente?",
        "Que significa o estado «En trámite»?",
        "Como emito unha copia?",
      ],
    },
    datosTitle: "Datos do teu despacho",
    datosDescNotaria:
      "Consulta a túa propia información operativa: expedientes, protocolos, axenda de sinaturas, minutas e alertas. Só consulta (nunca modifica nada) e respecta os teus permisos: só ve o que ti verías.",
    datosDescLegifirma:
      "Consulta a túa propia información operativa: actuacións, Libro Indicador, facturación e clientes. Só consulta (nunca modifica nada) e respecta os teus permisos: só ve o que ti verías.",
    datosDescUnidad:
      "Busca e le os documentos da túa Unidade de Rede. Só consulta (nunca modifica nada) e respecta os teus permisos: só ve os documentos aos que ti tes acceso.",
    famDoctrina: {
      title: "Dúbidas xurídicas e de doutrina",
      desc: "Preguntas xurídicas apoiadas no corpus de resolucións da DGSJFP/DGRN e doutrina rexistral e notarial. Cita sempre a resolución na que se apoia.",
      examples: [
        "É inscribible unha hipoteca unilateral non aceptada?",
        "Criterios da DGSJFP sobre a cualificación do NIF do representante.",
      ],
    },
    famNormativa: {
      title: "Normativa fiscal",
      desc: "Que di a norma tributaria autonómica e municipal: tipos de gravame, reducións, bonificacións e requisitos dun beneficio fiscal. Non calcula importes: para o cálculo está o simulador de Tributos.",
      examples: [
        "Que bonificación hai no ISD en Asturias entre pais e fillos?",
        "Que tipo de AXD se aplica a unha obra nova en Cataluña?",
      ],
    },
    behaviorTitle: "Como se comporta",
    behavior: [
      "Cita as súas fontes e non inventa: se non atopa base, dío.",
      "Non calcula impostos nin realiza accións: só le e responde.",
      "Respecta os teus permisos: nunca che mostra datos que non verías na aplicación.",
      "Só ten en conta as clases da Biblioteca legal que teñas marcadas; a cabeceira do chat indica cantas clases e documentos considera, e cada referencia que cita amosa o seu tipo (clase) con icona e cor.",
    ],
    startTitle: "Como comezar",
    start:
      "Abre MycoBot co botón do lateral dereito e escribe a túa pregunta en linguaxe natural. Escribe /help en calquera momento para volver ver esta axuda dentro do chat, ou /sources para elixir que clases da Biblioteca ten en conta.",
    gatedNote: "Dispoñible se a túa organización o ten contratado.",
    examplesLabel: "Proba a preguntar",
  },
  EUS: {
    title: "MycoBot-i galdetu",
    intro:
      "MycoBot edozein pantailaren eskuineko aldean duzun laguntzailea da. Hizkuntza naturalean idazten diozu, lankide bati galdetuko bazenio bezala. Hauek dira ulertzen dituen galdera motak:",
    famAyuda: {
      title: "Aplikazioa nola erabili",
      desc: "Produktuaren erabilerari buruzko zalantzak: zerbait nola egin, funtzio bat non dagoen edo termino batek zer esan nahi duen. Eskuliburuarekin erantzuten du eta orrialde zehatza estekatzen dizu.",
      examples: [
        "Non ematen dut espediente bat alta?",
        "Zer esan nahi du «Izapidetzen» egoerak?",
        "Nola jaulkitzen dut kopia bat?",
      ],
    },
    datosTitle: "Zure bulegoaren datuak",
    datosDescNotaria:
      "Zure informazio operatiboa kontsultatu: espedienteak, protokoloak, sinadura-agenda, minutak eta alertak. Kontsultatu baino ez du egiten (ez du ezer aldatzen) eta zure baimenak errespetatzen ditu: zuk ikusiko zenukeena baino ez du ikusten.",
    datosDescLegifirma:
      "Zure informazio operatiboa kontsultatu: jarduketak, Liburu Adierazlea, fakturazioa eta bezeroak. Kontsultatu baino ez du egiten (ez du ezer aldatzen) eta zure baimenak errespetatzen ditu: zuk ikusiko zenukeena baino ez du ikusten.",
    datosDescUnidad:
      "Bilatu eta irakurri zure Sare Unitateko dokumentuak. Kontsultatu baino ez du egiten (ez du ezer aldatzen) eta zure baimenak errespetatzen ditu: zuk sarbidea duzun dokumentuak baino ez ditu ikusten.",
    famDoctrina: {
      title: "Zalantza juridikoak eta doktrina",
      desc: "DGSJFP/DGRN-ren ebazpen-corpusean eta erregistro- eta notario-doktrinan oinarritutako galdera juridikoak. Beti aipatzen du oinarritzen den ebazpena.",
      examples: [
        "Onartu gabeko hipoteka unilateral bat inskribagarria da?",
        "DGSJFP-ren irizpideak ordezkariaren NIFaren kalifikazioari buruz.",
      ],
    },
    famNormativa: {
      title: "Zerga-araudia",
      desc: "Zer dioen autonomia- eta udal-zergen arauak: karga-tasak, murrizketak, hobariak eta zerga-onura baten baldintzak. Ez du zenbatekorik kalkulatzen: kalkulurako Tributos-en simulagailua dago.",
      examples: [
        "Zein hobari dago OSZ-n Asturiasen gurasoen eta seme-alaben artean?",
        "Zein AJD tasa aplikatzen zaio obra berri bati Katalunian?",
      ],
    },
    behaviorTitle: "Nola jokatzen duen",
    behavior: [
      "Bere iturriak aipatzen ditu eta ez du asmatzen: oinarririk aurkitzen ez badu, esan egiten du.",
      "Ez du zergarik kalkulatzen ez ekintzarik egiten: irakurri eta erantzun baino ez du egiten.",
      "Zure baimenak errespetatzen ditu: ez dizu inoiz aplikazioan ikusiko ez zenituzkeen daturik erakusten.",
      "Lege Liburutegian markatuta dituzun klaseak baino ez ditu kontuan hartzen; txataren goiburuak zenbat klase eta dokumentu hartzen dituen adierazten du, eta aipatzen duen erreferentzia bakoitzak bere mota (klasea) erakusten du ikonoarekin eta kolorearekin.",
    ],
    startTitle: "Nola hasi",
    start:
      "Ireki MycoBot eskuineko aldeko botoiarekin eta idatzi zure galdera hizkuntza naturalean. Idatzi /help edonoiz laguntza hau txataren barruan berriz ikusteko, edo /sources Liburutegiko zein klase hartzen dituen aukeratzeko.",
    gatedNote: "Erabilgarri zure erakundeak kontratatuta badu.",
    examplesLabel: "Saiatu galdetzen",
  },
};

function FamilyBlock({
  icon,
  title,
  desc,
  examples,
  examplesLabel,
  note,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  examples: string[];
  examplesLabel: string;
  note?: string;
}) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-mc-primary-100 text-mc-primary-700">
          {icon}
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-gray-900">
            {title}
            {note ? (
              <span className="ml-2 align-middle text-xs font-normal text-gray-400">{note}</span>
            ) : null}
          </h3>
          <p className="mt-1 text-sm leading-relaxed text-gray-600">{desc}</p>
          <p className="mt-3 text-xs font-medium uppercase tracking-wide text-gray-400">
            {examplesLabel}
          </p>
          <ul className="mt-1.5 space-y-1 text-sm text-gray-700">
            {examples.map((ex) => (
              <li key={ex} className="leading-relaxed">
                <span className="text-mc-primary-400">“</span>
                {ex}
                <span className="text-mc-primary-400">”</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

export function MycoBotManualSection({ lang, appSlug }: MycoBotManualSectionProps) {
  const t = STRINGS[lang] ?? STRINGS.CAST;
  const profile = DATA_PROFILE[appSlug] ?? "none";

  const datosDesc =
    profile === "notaria"
      ? t.datosDescNotaria
      : profile === "legifirma"
        ? t.datosDescLegifirma
        : t.datosDescUnidad;
  const datosExamples =
    profile === "none" ? [] : DATA_EXAMPLES[profile][lang] ?? [];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900">
          <Sparkles className="h-5 w-5 text-mc-primary-600" />
          {t.title}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-gray-600">{t.intro}</p>
      </div>

      <section className="grid gap-4">
        <FamilyBlock
          icon={<BookOpen className="h-5 w-5" />}
          title={t.famAyuda.title}
          desc={t.famAyuda.desc}
          examples={t.famAyuda.examples}
          examplesLabel={t.examplesLabel}
        />

        {profile !== "none" ? (
          <FamilyBlock
            icon={<FolderSearch className="h-5 w-5" />}
            title={t.datosTitle}
            desc={datosDesc}
            examples={datosExamples}
            examplesLabel={t.examplesLabel}
          />
        ) : null}

        <FamilyBlock
          icon={<Scale className="h-5 w-5" />}
          title={t.famDoctrina.title}
          desc={t.famDoctrina.desc}
          examples={t.famDoctrina.examples}
          examplesLabel={t.examplesLabel}
          note={t.gatedNote}
        />

        <FamilyBlock
          icon={<Landmark className="h-5 w-5" />}
          title={t.famNormativa.title}
          desc={t.famNormativa.desc}
          examples={t.famNormativa.examples}
          examplesLabel={t.examplesLabel}
          note={t.gatedNote}
        />
      </section>

      <section className="rounded-xl border border-gray-200 bg-gray-50 p-5">
        <h2 className="text-sm font-semibold text-gray-900">{t.behaviorTitle}</h2>
        <ul className="mt-2 space-y-1.5 text-sm text-gray-700">
          {t.behavior.map((b) => (
            <li key={b} className="leading-relaxed">
              {b}
            </li>
          ))}
        </ul>
      </section>

      <div className="flex items-start gap-4 rounded-xl border border-amber-200 bg-amber-50 p-5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100">
          <Sparkles className="h-5 w-5 text-amber-600" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-amber-900">{t.startTitle}</h3>
          <p className="mt-1 text-sm text-amber-800">{t.start}</p>
        </div>
      </div>
    </div>
  );
}
