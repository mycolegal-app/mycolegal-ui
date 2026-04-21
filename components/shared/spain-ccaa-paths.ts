// --------------------------------------------------------------------------
// Simplified SVG polygon paths for Spain's 17 CCAA (INE codes 01–17), plus
// Canarias (05) as an inset at the bottom-left and Ceuta (18) + Melilla (19)
// as label-only positions in the Strait of Gibraltar.
//
// The geometry is approximate — enough to read as Spain, not cartographic.
// Coordinates live in a fixed 1000×720 viewBox. To swap in more accurate
// geometry, replace only the `d` and `centroid` fields here; the component
// API does not change.
// --------------------------------------------------------------------------

export const VIEWBOX = { width: 1000, height: 720 };

export interface CCAAPath {
  /** SVG path `d` attribute. */
  d: string;
  /** (x, y) within the viewBox where the badge/label is anchored. */
  centroid: [number, number];
  /** Short label (not shown inside the map — used for Ceuta/Melilla labels only). */
  shortLabel: string;
}

export const PATHS: Record<string, CCAAPath> = {
  "12": {
    // Galicia
    d: "M 0,60 L 10,20 L 90,5 L 160,30 L 160,130 L 130,175 L 60,195 L 15,180 L 0,120 Z",
    centroid: [80, 100],
    shortLabel: "GA",
  },
  "03": {
    // Asturias
    d: "M 160,30 L 305,25 L 305,80 L 185,85 L 160,75 Z",
    centroid: [230, 55],
    shortLabel: "AS",
  },
  "06": {
    // Cantabria
    d: "M 305,25 L 420,35 L 420,85 L 310,95 L 305,80 Z",
    centroid: [365, 60],
    shortLabel: "CB",
  },
  "16": {
    // País Vasco
    d: "M 420,35 L 525,35 L 530,95 L 440,105 L 420,85 Z",
    centroid: [475, 65],
    shortLabel: "PV",
  },
  "15": {
    // Navarra
    d: "M 525,35 L 615,65 L 620,155 L 540,170 L 530,95 Z",
    centroid: [575, 110],
    shortLabel: "NA",
  },
  "17": {
    // La Rioja
    d: "M 440,105 L 530,95 L 540,170 L 500,175 L 440,135 Z",
    centroid: [490, 135],
    shortLabel: "LR",
  },
  "02": {
    // Aragón
    d: "M 620,155 L 615,65 L 725,80 L 770,135 L 780,210 L 700,320 L 620,380 L 580,330 L 565,260 L 540,170 Z",
    centroid: [670, 225],
    shortLabel: "AR",
  },
  "09": {
    // Cataluña
    d: "M 725,80 L 830,110 L 920,145 L 870,260 L 790,335 L 720,320 L 780,210 L 770,135 Z",
    centroid: [830, 205],
    shortLabel: "CT",
  },
  "04": {
    // Illes Balears (three islands as separate subpaths)
    d:
      // Mallorca
      "M 850,285 a 27,18 0 1,0 54,0 a 27,18 0 1,0 -54,0 Z " +
      // Menorca
      "M 920,252 a 18,10 0 1,0 36,0 a 18,10 0 1,0 -36,0 Z " +
      // Ibiza
      "M 780,325 a 13,9 0 1,0 26,0 a 13,9 0 1,0 -26,0 Z",
    centroid: [875, 285],
    shortLabel: "IB",
  },
  "08": {
    // Castilla y León
    d: "M 160,130 L 185,85 L 305,80 L 310,95 L 420,85 L 440,105 L 440,135 L 500,175 L 540,170 L 565,260 L 430,310 L 330,320 L 190,300 L 160,250 L 140,180 Z",
    centroid: [340, 195],
    shortLabel: "CL",
  },
  "13": {
    // Madrid (small overlay)
    d: "M 395,235 L 445,245 L 450,290 L 420,310 L 380,300 L 380,260 Z",
    centroid: [415, 275],
    shortLabel: "MD",
  },
  "07": {
    // Castilla-La Mancha (wraps around Madrid visually; we render without a hole — Madrid is drawn on top)
    d: "M 190,300 L 330,320 L 430,310 L 565,260 L 580,330 L 570,380 L 580,430 L 530,420 L 320,410 L 220,380 L 210,340 Z",
    centroid: [415, 370],
    shortLabel: "CM",
  },
  "10": {
    // Comunidad Valenciana
    d: "M 580,330 L 720,320 L 720,375 L 680,430 L 660,490 L 600,505 L 580,475 L 580,430 L 570,380 Z",
    centroid: [650, 410],
    shortLabel: "VC",
  },
  "14": {
    // Región de Murcia
    d: "M 555,480 L 600,505 L 615,525 L 590,545 L 555,540 Z",
    centroid: [580, 515],
    shortLabel: "MC",
  },
  "11": {
    // Extremadura
    d: "M 140,180 L 160,250 L 190,300 L 210,340 L 220,380 L 200,450 L 155,455 L 130,420 L 140,340 L 130,260 Z",
    centroid: [175, 335],
    shortLabel: "EX",
  },
  "01": {
    // Andalucía
    d: "M 130,420 L 155,455 L 200,450 L 320,410 L 530,420 L 580,430 L 580,475 L 555,480 L 555,540 L 500,555 L 420,560 L 320,555 L 250,540 L 170,495 Z",
    centroid: [350, 485],
    shortLabel: "AN",
  },
  // Canarias inset (drawn as 5 islands inside the inset box)
  "05": {
    d:
      "M 30,625 a 12,10 0 1,0 24,0 a 12,10 0 1,0 -24,0 Z " + // La Palma / Gomera
      "M 70,650 a 28,16 0 1,0 56,0 a 28,16 0 1,0 -56,0 Z " + // Tenerife
      "M 140,660 a 20,14 0 1,0 40,0 a 20,14 0 1,0 -40,0 Z " + // Gran Canaria
      "M 195,645 a 22,11 0 1,0 44,0 a 22,11 0 1,0 -44,0 Z " + // Fuerteventura
      "M 246,625 a 14,10 0 1,0 28,0 a 14,10 0 1,0 -28,0 Z", // Lanzarote
    centroid: [145, 645],
    shortLabel: "CN",
  },
};

/** Bounding box of the Canarias inset frame (x, y, w, h). */
export const CANARIAS_INSET_BOX: [number, number, number, number] = [15, 600, 275, 100];

/** Positions (x, y) for Ceuta/Melilla label badges in the Strait area. */
export const CEUTA_POS: [number, number] = [300, 555];
export const MELILLA_POS: [number, number] = [425, 560];
