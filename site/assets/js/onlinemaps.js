// The online map layers Ozimut can draw under or over a map (Cartographier's « Fonds », the Tracer's « Fonds et relief »): all
// Web Mercator tiles, fetched by the reader's browser from each service, never stored by Ozimut. One list for both tools.
// `country` (ISO alpha-2): offered only for a map there (trace/terrain.js countryAt); `off`: not offered (New Zealand's photos
// until Ozimut has a LINZ Basemaps key, free on request to LINZ: their keys made in the browser last 90 days). `credit`: what
// the map must say when the layer is shown or printed; `url`: the service's page, for the credit's link.

export const LINZ_KEY = "";
const GEOPF = (layer, style, fmt, tms = "PM") => `https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${layer}&STYLE=${style}&TILEMATRIXSET=${tms}&FORMAT=image/${fmt}&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}`;
export const ONLINE = {
  ortho: { url: GEOPF("ORTHOIMAGERY.ORTHOPHOTOS", "normal", "jpeg"), max: 19, country: "FR", credit: "© IGN", page: "https://geoservices.ign.fr/" },
  plan: { url: GEOPF("GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2", "normal", "png"), max: 18, country: "FR", credit: "© IGN", page: "https://geoservices.ign.fr/" },
  // swisstopo (open data, « © swisstopo »): SWISSIMAGE 10 cm to 25 cm, the national maps
  swissimage: { url: "https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.swissimage/default/current/3857/{z}/{x}/{y}.jpeg", max: 20, country: "CH", credit: "© swisstopo", page: "https://www.swisstopo.admin.ch/" },
  chmap: { url: "https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-farbe/default/current/3857/{z}/{x}/{y}.jpeg", max: 18, country: "CH", credit: "© swisstopo", page: "https://www.swisstopo.admin.ch/" },
  // The National Map (USGS, public domain): its imagery (NAIP and others) and topo cached to zoom 16 (~2 m a pixel)
  usimagery: { url: "https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}", max: 16, country: "US", credit: "USGS The National Map", page: "https://www.usgs.gov/programs/national-geospatial-program/national-map" },
  ustopo: { url: "https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}", max: 16, country: "US", credit: "USGS The National Map", page: "https://www.usgs.gov/programs/national-geospatial-program/national-map" },
  // LINZ Basemaps (CC BY 4.0, « © LINZ »): New Zealand's aerial photos, a key needed
  nzaerial: { url: `https://basemaps.linz.govt.nz/v1/tiles/aerial/WebMercatorQuad/{z}/{x}/{y}.webp?api=${LINZ_KEY}`, max: 20, country: "NZ", off: !LINZ_KEY, credit: "© LINZ CC BY 4.0", page: "https://basemaps.linz.govt.nz/" },
  osm: { url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png", max: 19, credit: "© OpenStreetMap contributors", page: "https://www.openstreetmap.org/copyright" },
};
// IGN's LiDAR HD layers (France; Licence Ouverte 2.0), read 2026-11-16 in the Géoplateforme's WMTS capabilities: the ground's
// relief at 50 cm, the height of what stands on it (trees, buildings: « MNH »), and the points' classes (ground, low, medium
// and high vegetation, buildings, water). The Tracer's « Fonds et relief » (the vegetation's height from LiDAR).
export const LIDAR_FR = {
  lidarrelief: { url: GEOPF("IGNF_LIDAR-HD_MNT_ELEVATION.ELEVATIONGRIDCOVERAGE.SHADOW", "normal", "png", "PM_0_18"), max: 18, country: "FR", credit: "© IGN – LiDAR HD", page: "https://geoservices.ign.fr/lidarhd" },
  lidarveg: { url: GEOPF("IGNF_LIDAR-HD_MNH_ELEVATION.ELEVATIONGRIDCOVERAGE.SHADOW", "normal", "png", "PM_0_18"), max: 18, country: "FR", credit: "© IGN – LiDAR HD", page: "https://geoservices.ign.fr/lidarhd" },
  lidarclass: { url: GEOPF("IGNF_LIDAR-HD_CLASS", "cartes-classes-p", "png", "PM_0_18"), max: 18, country: "FR", credit: "© IGN – LiDAR HD", page: "https://geoservices.ign.fr/lidarhd" },
};
/** A tile's address. */
export const tileUrl = (L, z, x, y) => L.url.replace("{z}", z).replace("{x}", x).replace("{y}", y);
/** Web Mercator: a latitude and longitude's tile coordinates (fractional) at a zoom, and back. */
export function tileOf(lat, lon, z) {
  const n = 2 ** z, la = (Math.max(-85.05, Math.min(85.05, lat)) * Math.PI) / 180;
  return [((lon + 180) / 360) * n, ((1 - Math.log(Math.tan(la) + 1 / Math.cos(la)) / Math.PI) / 2) * n];
}
export function latLonOfTile(x, y, z) {
  const n = 2 ** z;
  return [(Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI, (x / n) * 360 - 180];
}
/** The zoom whose tiles have about `mpp` metres a pixel at a latitude. */
export const zoomFor = (mpp, lat) => Math.log2((156543.03392 * Math.cos((lat * Math.PI) / 180)) / Math.max(1e-6, mpp));
