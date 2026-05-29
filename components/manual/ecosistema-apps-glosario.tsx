/**
 * Glosario de apps del ecosistema MyCoLegal, embebido al final del home de
 * cada manual de app. Es la red de seguridad de la regla "los manuales son
 * autocontenidos": MycoBot filtra DURO por appSlug al buscar ayuda, así que
 * cualquier referencia cruzada a otra app debe poder resolverse SIN salir del
 * manual de la app actual. Este glosario garantiza que la mini-descripción de
 * cada app esté presente como chunk indexado bajo el appSlug de cada manual.
 *
 * Los nombres de producto se mantienen en su forma original (Notaría,
 * LegiFirma, Archivo, …) en los cuatro idiomas; sólo se traducen las
 * descripciones.
 */

import { Sparkles } from "lucide-react";

import type { ManualLang } from "./admin-users-section";

export interface EcosistemaAppsGlosarioProps {
  lang: ManualLang;
}

interface AppEntry {
  name: string;
  desc: string;
}

interface Strings {
  title: string;
  intro: string;
  apps: AppEntry[];
}

const STRINGS: Record<ManualLang, Strings> = {
  CAST: {
    title: "Ecosistema MyCoLegal",
    intro:
      "Las demás apps de la plataforma, por si en algún punto de este manual se mencionan y quieres saber qué hace cada una:",
    apps: [
      { name: "Notaría", desc: "Plataforma operativa del despacho: pre-expedientes, expedientes, protocolos, minutas, agenda y peticiones recibidas." },
      { name: "LegiFirma", desc: "Legitimaciones de firmas, testimonios, traslados a papel (Sección 2ª) y módulo de minutación." },
      { name: "Archivo", desc: "Archivo histórico del protocolo: consulta de protocolos antiguos y emisión de copias." },
      { name: "Cancelaciones", desc: "Gestión de cancelaciones registrales (hipotecas y otros gravámenes) y sus honorarios." },
      { name: "Actas", desc: "Actas notariales, con facturación B2B agrupada para bancos." },
      { name: "Peticiones", desc: "Portal externo white-label donde gestorías, bancos y particulares envían peticiones a la notaría." },
      { name: "Tributos", desc: "Liquidación tributaria de actos (M600 y similares), con simulador de cuotas." },
      { name: "Facturae", desc: "Hub transversal de facturación electrónica: agrupa eventos facturables del resto de apps y emite la factura." },
      { name: "DocFilling", desc: "Rellenado automático de modelos y plantillas documentales a partir de los datos del expediente." },
      { name: "Consultor", desc: "Asistente jurídico: catálogos normativos por CCAA, resoluciones, doctrina y sede de MycoBot." },
      { name: "Moratorias", desc: "Gestión de moratorias bancarias." },
    ],
  },
  CAT: {
    title: "Ecosistema MyCoLegal",
    intro:
      "Les altres apps de la plataforma, per si en algun punt d'aquest manual es mencionen i vols saber què fa cadascuna:",
    apps: [
      { name: "Notaría", desc: "Plataforma operativa del despatx: pre-expedients, expedients, protocols, minutes, agenda i peticions rebudes." },
      { name: "LegiFirma", desc: "Legitimacions de signatures, testimonis, trasllats a paper (Secció 2a) i mòdul de minutació." },
      { name: "Archivo", desc: "Arxiu històric del protocol: consulta de protocols antics i emissió de còpies." },
      { name: "Cancelaciones", desc: "Gestió de cancel·lacions registrals (hipoteques i altres gravàmens) i els seus honoraris." },
      { name: "Actas", desc: "Actes notarials, amb facturació B2B agrupada per a bancs." },
      { name: "Peticiones", desc: "Portal extern white-label on gestories, bancs i particulars envien peticions a la notaria." },
      { name: "Tributos", desc: "Liquidació tributària d'actes (M600 i similars), amb simulador de quotes." },
      { name: "Facturae", desc: "Hub transversal de facturació electrònica: agrupa esdeveniments facturables de la resta d'apps i emet la factura." },
      { name: "DocFilling", desc: "Emplenat automàtic de models i plantilles documentals a partir de les dades de l'expedient." },
      { name: "Consultor", desc: "Assistent jurídic: catàlegs normatius per CCAA, resolucions, doctrina i seu de MycoBot." },
      { name: "Moratorias", desc: "Gestió de moratòries bancàries." },
    ],
  },
  EUS: {
    title: "MyCoLegal ekosistema",
    intro:
      "Plataformaren beste appak, eskuliburu honetan aipatzen badira eta bakoitzak zer egiten duen jakin nahi baduzu:",
    apps: [
      { name: "Notaría", desc: "Notario-bulegoaren plataforma operatiboa: aurre-espedienteak, espedienteak, protokoloak, minutak, agenda eta jasotako eskaerak." },
      { name: "LegiFirma", desc: "Sinaduren legitimazioak, lekukotzak, paperera eskualdaketak (2. Atala) eta minutazio modulua." },
      { name: "Archivo", desc: "Protokoloaren artxibo historikoa: protokolo zaharrak kontsultatzeko eta kopiak emateko." },
      { name: "Cancelaciones", desc: "Erregistroko deuseztapenen kudeaketa (hipotekak eta beste zama batzuk) eta horien ordainsariak." },
      { name: "Actas", desc: "Notario aktak, banketxeentzako B2B fakturazio bateratuarekin." },
      { name: "Peticiones", desc: "Kanpoko white-label ataria, kudeaketa-bulegoek, banketxeek eta partikularrek notariotzari eskaerak bidaltzeko." },
      { name: "Tributos", desc: "Akten zerga-likidazioa (M600 eta antzekoak), kuoten simulagailuarekin." },
      { name: "Facturae", desc: "Faktura elektronikoaren hub orokorra: gainerako appen ekintza fakturagarriak biltzen ditu eta faktura jaulkitzen du." },
      { name: "DocFilling", desc: "Eredu eta dokumentu-txantiloien betetze automatikoa, espedientearen datuetatik abiatuta." },
      { name: "Consultor", desc: "Lege-laguntzailea: AAEEen araudi-katalogoak, ebazpenak, doktrina eta MycoBoten egoitza." },
      { name: "Moratorias", desc: "Banketxeen moratorien kudeaketa." },
    ],
  },
  GAL: {
    title: "Ecosistema MyCoLegal",
    intro:
      "As demais apps da plataforma, por se nalgún punto deste manual se mencionan e queres saber que fai cada unha:",
    apps: [
      { name: "Notaría", desc: "Plataforma operativa do despacho: pre-expedientes, expedientes, protocolos, minutas, axenda e peticións recibidas." },
      { name: "LegiFirma", desc: "Lexitimacións de sinaturas, testemuños, traslados a papel (Sección 2ª) e módulo de minutación." },
      { name: "Archivo", desc: "Arquivo histórico do protocolo: consulta de protocolos antigos e emisión de copias." },
      { name: "Cancelaciones", desc: "Xestión de cancelacións rexistrais (hipotecas e outros gravames) e os seus honorarios." },
      { name: "Actas", desc: "Actas notariais, con facturación B2B agrupada para bancos." },
      { name: "Peticiones", desc: "Portal externo white-label onde xestorías, bancos e particulares envían peticións á notaría." },
      { name: "Tributos", desc: "Liquidación tributaria de actos (M600 e similares), con simulador de cotas." },
      { name: "Facturae", desc: "Hub transversal de facturación electrónica: agrupa eventos facturables do resto de apps e emite a factura." },
      { name: "DocFilling", desc: "Enchemento automático de modelos e prantillas documentais a partir dos datos do expediente." },
      { name: "Consultor", desc: "Asistente xurídico: catálogos normativos por CCAA, resolucións, doutrina e sede de MycoBot." },
      { name: "Moratorias", desc: "Xestión de moratorias bancarias." },
    ],
  },
};

export function EcosistemaAppsGlosario({ lang }: EcosistemaAppsGlosarioProps) {
  const t = STRINGS[lang] ?? STRINGS.CAST;
  return (
    <section className="rounded-xl border border-gray-200 bg-gray-50 p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-200">
          <Sparkles className="h-5 w-5 text-gray-600" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-gray-900">{t.title}</h3>
          <p className="mt-1 text-sm text-gray-600">{t.intro}</p>
          <ul className="mt-3 space-y-1.5 text-sm text-gray-700">
            {t.apps.map((a) => (
              <li key={a.name} className="leading-relaxed">
                <strong className="font-semibold text-gray-900">{a.name}</strong>
                <span className="text-gray-500"> — </span>
                {a.desc}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
