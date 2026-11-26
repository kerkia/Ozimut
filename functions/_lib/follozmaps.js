// Folloz's map layers (docs/track/folloz.md « The map »): what GET /api/folloz/config hands the apps. Each phone fetches its
// tiles from the providers itself; a country or a layer is added here alone, the apps need no update. The outlines come from
// follozareas.js (tools/folloz_areas.py).
import { AREAS } from "./follozareas.js";

const GEOPF = (layer, fmt) =>
  `https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${layer}&STYLE=normal&TILEMATRIXSET=PM` +
  `&FORMAT=image/${fmt}&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}`;
const SWISS = (layer) => `https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.${layer}/default/current/3857/{z}/{x}/{y}.jpeg`;

const OSM = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const OSM_CREDIT = "© OpenStreetMap contributors";

// i18n-ignore-next 40
const LAYERS = [
  { id: "osm", tiles: OSM, credit: OSM_CREDIT, maxZoom: 19,
    name: { fr: "OpenStreetMap", en: "OpenStreetMap", de: "OpenStreetMap", es: "OpenStreetMap" } },
  // IGN, Géoplateforme (Licence Ouverte 2.0), no key: Plan IGN has the relief, forests and paths; read 2026-11-23 to zoom 19
  { id: "ign-plan", tiles: GEOPF("GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2", "png"), credit: "© IGN", maxZoom: 19,
    name: { fr: "Plan IGN", en: "IGN map (Plan IGN)", de: "IGN-Karte (Plan IGN)", es: "Mapa IGN (Plan IGN)" } },
  { id: "ign-ortho", tiles: GEOPF("ORTHOIMAGERY.ORTHOPHOTOS", "jpeg"), credit: "© IGN", maxZoom: 19,
    name: { fr: "Photos aériennes IGN", en: "IGN aerial photos", de: "IGN-Luftbilder", es: "Fotos aéreas IGN" } },
  // swisstopo (open data, « © swisstopo »), no key, fair use per address
  { id: "ch-color", tiles: SWISS("pixelkarte-farbe"), credit: "© swisstopo", maxZoom: 19,
    name: { fr: "Carte nationale suisse", en: "Swiss national map", de: "Landeskarte", es: "Mapa nacional suizo" } },
  { id: "ch-grey", tiles: SWISS("pixelkarte-grau"), credit: "© swisstopo", maxZoom: 19,
    name: { fr: "Carte nationale suisse (gris)", en: "Swiss national map (grey)", de: "Landeskarte (grau)",
      es: "Mapa nacional suizo (gris)" } },
  { id: "ch-image", tiles: SWISS("swissimage"), credit: "© swisstopo", maxZoom: 20,
    name: { fr: "Photos aériennes swisstopo", en: "swisstopo aerial photos", de: "swisstopo-Luftbilder (SWISSIMAGE)",
      es: "Fotos aéreas swisstopo" } },
];

const AREA_LIST = [
  { id: "FR", layers: ["ign-plan", "ign-ortho", "osm"],
    name: { fr: "France", en: "France", de: "Frankreich", es: "Francia" } },
  { id: "CH", layers: ["ch-color", "ch-grey", "ch-image", "osm"],
    name: { fr: "Suisse et Liechtenstein", en: "Switzerland and Liechtenstein", de: "Schweiz und Liechtenstein",
      es: "Suiza y Liechtenstein" } },
];

const ELSEWHERE = { layers: ["osm"], name: { fr: "Ailleurs", en: "Elsewhere", de: "Anderswo", es: "En otros lugares" } };

/** The config's map part. FOLLOZ_TILES (and its credit and zoom) replaces OpenStreetMap as the default elsewhere. */
export function maps(env) {
  const layers = LAYERS.slice();
  const elsewhere = { ...ELSEWHERE, layers: ELSEWHERE.layers.slice() };
  if (env.FOLLOZ_TILES && /^https:\/\/.*\{z\}.*/.test(env.FOLLOZ_TILES)) {
    layers.push({ id: "custom", tiles: env.FOLLOZ_TILES, credit: env.FOLLOZ_TILES_CREDIT || "",
      maxZoom: Number(env.FOLLOZ_MAX_ZOOM) || 19, name: { fr: "Carte", en: "Map", de: "Karte", es: "Mapa" } });
    elsewhere.layers.unshift("custom");
  }
  const first = layers.find((l) => l.id === elsewhere.layers[0]);
  return {
    tiles: first.tiles, attribution: first.credit, maxZoom: first.maxZoom,
    layers,
    areas: AREA_LIST.map((a) => ({ ...a, poly: AREAS[a.id] || [] })).filter((a) => a.poly.length),
    elsewhere,
  };
}
