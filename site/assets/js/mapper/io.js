// Cartographier's files: opening a map (OCAD 6-2018, OpenOrienteering Mapper .omap/.xmap, Ozimut's .ozmap) into a document, and
// writing it — OCAD (the version it came in, 12 or 2018; what was not changed carried through byte for byte: ocadout.js), Mapper
// (toomap.js), .ozmap (the document, its OCAD source and its backgrounds), a vector PDF (CMYK, the map's colours in OCAD's
// order, its logos), a PNG with its world file, a KMZ for phones and Google Earth, a GeoTIFF; and handing the map to the Tracer
// (a new event on it) or to « Mes cartes ».

import * as D from "./doc.js";
import * as S from "./store.js";
import { drawRect } from "./view.js";
import { download, modal, field, sel } from "../tracer/dialogs.js";
import { t, tn } from "./lang.js";

const fileName = (s) => String(s || "carte").replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim().slice(0, 80) || "carte";

/** A document from a file's bytes: { doc, source (OCAD bytes or null), files }. */
export async function openBytes(bytes, name) {
  const u8 = new Uint8Array(bytes), title = String(name || "").replace(/\.[^.]+$/, "");
  if (S.isOzmap({ name }) || (u8[0] === 0x50 && u8[1] === 0x4b)) return S.readOzmap(u8);
  if (u8[0] === 0xad && u8[1] === 0x0c) return { doc: D.fromOcad(u8, title), source: u8, files: {} };
  const head = new TextDecoder().decode(u8.subarray(0, 800));
  if (/<map[\s>]/.test(head)) {
    const M = await import("./fromomap.js");
    const doc = await M.omapToDoc(u8);
    if (!doc.title) doc.title = title;
    return { doc, source: null, files: {} };
  }
  throw new Error(t("map.file.unknown"));
}

export async function act(E, act) {
  const base = fileName(E.doc.title);
  switch (act) {
    case "export-ozmap": {
      const files = {};
      for (const b of E.doc.backgrounds || []) if (b.file) { const f = E.files[b.file] || (E.id ? await S.loadFile(E.id, b.file).catch(() => null) : null); if (f) files[b.file] = f; }
      download(`${base}${S.EXT}`, await S.writeOzmap(E.live.toJSON(), { source: E.source, files }), "application/zip");
      return;
    }
    case "export-ocd": {
      const src = E.source && E.doc.ocad?.version >= 9 ? E.doc.ocad.version : 2018;
      const v = await modal(E, { title: t("map.rib.export-ocd"), ok: t("map.ok.export"), body: field(t("map.io.ocdVersion"), sel("v", [[String(src), t("map.io.ocdSame", { v: src })], ...[2018, 12, 11, 10, 9].filter((x) => x !== src).map((x) => [String(x), `OCAD ${x}`])], String(src)))
        + `<p class="mp-hint">${t("map.io.ocdHint")}</p>`, remember: "mp-ocd" });
      if (!v) return;
      const { writeOcadDoc } = await import("./ocadout.js");
      E.say(t("map.io.writing"), "busy");
      const bytes = writeOcadDoc(E.live.toJSON(), E.source, { version: Number(v.v) });
      download(`${base}.ocd`, bytes, "application/octet-stream");
      E.say(t("map.io.written"));
      return;
    }
    case "export-omap": {
      const M = await import("./toomap.js"), losses = [];
      download(`${base}.omap`, await M.docToOmap(E.live.toJSON(), { losses }), "application/xml");
      sayLosses(E, losses);
      return;
    }
    case "export-pdf": return pdf(E, base);
    case "export-sep": {
      const C = await import("./colors.js");
      E.say(t("map.io.writing"), "busy");
      const r = await C.separationsPdf(E, areaOf(E), base);
      if (r) { download(r.name, r.bytes, "application/pdf"); E.say(r.warn || t("map.io.written"), r.warn ? "bad" : undefined); } else E.say("");
      return;
    }
    case "export-png": return png(E, base);
    case "export-kmz": return kmz(E, base);
    case "export-geotiff": return png(E, base, true);
    case "to-tracer": return toTracer(E);
    case "to-mymaps": return toMyMaps(E);
  }
}

/** The part of the map to print: its print area, else everything with a margin. */
const areaOf = (E) => E.doc.printArea || (() => { const b = E.live.bounds(); return [b[0] - 3, b[1] - 3, b[2] + 3, b[3] + 3]; })();

async function pdf(E, base) {
  const v = await modal(E, { title: t("map.rib.export-pdf"), ok: t("map.ok.pdf"), body: field(t("map.io.color"), sel("c", [["cmyk", t("map.io.cmyk")], ["rgb", t("map.io.rgb")]], "cmyk"))
    + `<label class="mp-row"><input type="checkbox" name="op" checked> ${t("map.colors.overprint")}</label>`, remember: "mp-pdf" });
  if (!v) return;
  E.say(t("map.io.writing"), "busy");
  const { pdfLib, makeFonts } = await import("../tracer/pdf.js");
  const [{ PdfTarget }, { Matrix }] = await Promise.all([import("../tracer/vmap/target.js"), import("../tracer/vmap/geom.js")]);
  const L = await pdfLib(), doc = await L.PDFDocument.create();
  doc.setTitle(E.doc.title || ""); doc.setCreator("Ozimut — Cartographier"); doc.setProducer("Ozimut (pdf-lib)");
  const r = areaOf(E), pt = 72 / 25.4, W = (r[2] - r[0]) * pt, H = (r[3] - r[1]) * pt;
  const page = doc.addPage([W, H]);
  const fonts = await makeFonts(doc, L);
  let darken = null;
  if (v.op) darken = page.node.newExtGState("GSdark", doc.context.register(doc.context.obj({ Type: "ExtGState", BM: "Darken" })));
  const tg = new PdfTarget(L, page, new Matrix(pt, 0, 0, pt, -r[0] * pt, -r[1] * pt), { rgb: v.c === "rgb", fonts, darken, minRes: 0.01 });
  drawRect(E.live, tg, r, { minRes: 0.01, overprint: !!v.op, print: true });
  await tg.finish();
  download(`${base}.pdf`, await doc.save(), "application/pdf");
  E.say(t("map.io.written"));
}
/** A raster of the print area at a resolution, with its world file in the map's grid (or a GeoTIFF-ready PNG + .pgw + .prj). */
async function png(E, base, geo = false) {
  const v = await modal(E, { title: t(geo ? "map.rib.export-geotiff" : "map.rib.export-png"), ok: t("map.ok.export"), body: field(t("map.io.dpi"), sel("d", [["150", "150 dpi"], ["300", "300 dpi"], ["600", "600 dpi"]], "300")), remember: "mp-png" });
  if (!v) return;
  const r = areaOf(E), k = Number(v.d) / 25.4, W = Math.round((r[2] - r[0]) * k), H = Math.round((r[3] - r[1]) * k);
  if (W * H > 200e6) { E.say(t("map.io.tooLarge"), "bad"); return; }
  E.say(t("map.io.writing"), "busy");
  const c = E.view.render(r, W, H, { print: true });
  const blob = await new Promise((res) => c.toBlob(res, "image/png"));
  download(`${base}.png`, blob, "image/png");
  const f = E.frame;
  if (f && E.doc.realWorld?.on) {
    const px = 1 / k, o = f.toReal(r[0] + px / 2, r[3] - px / 2), ax = f.toReal(r[0] + px * 1.5, r[3] - px / 2), ay = f.toReal(r[0] + px / 2, r[3] - px * 1.5);
    const wld = [ax[0] - o[0], ax[1] - o[1], ay[0] - o[0], ay[1] - o[1], o[0], o[1]].map((x) => x.toFixed(6)).join("\n");
    download(`${base}.pgw`, wld + "\n", "text/plain");
    if (f.epsg === 2154) download(`${base}.prj`, 'PROJCS["RGF93 / Lambert-93",GEOGCS["RGF93",DATUM["Reseau_Geodesique_Francais_1993",SPHEROID["GRS 1980",6378137,298.257222101]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]],PROJECTION["Lambert_Conformal_Conic_2SP"],PARAMETER["standard_parallel_1",49],PARAMETER["standard_parallel_2",44],PARAMETER["latitude_of_origin",46.5],PARAMETER["central_meridian",3],PARAMETER["false_easting",700000],PARAMETER["false_northing",6600000],UNIT["metre",1]]', "text/plain");
  }
  E.say(t("map.io.written"));
}
async function kmz(E, base) {
  if (!E.frame?.geo) { E.say(t("map.data.nogeo"), "bad"); return; }
  const r = areaOf(E), k = 200 / 25.4, W = Math.round((r[2] - r[0]) * k), H = Math.round((r[3] - r[1]) * k);
  const c = E.view.render(r, Math.min(W, 8000), Math.min(H, Math.round(8000 * H / W)), { print: true });
  const jpg = new Uint8Array(await (await new Promise((res) => c.toBlob(res, "image/jpeg", 0.9))).arrayBuffer());
  const ll = [[r[0], r[1]], [r[2], r[1]], [r[2], r[3]], [r[0], r[3]]].map(([x, y]) => E.frame.toLatLon(x, y));
  const kml = `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2" xmlns:gx="http://www.google.com/kml/ext/2.2"><Document><name>${(E.doc.title || "").replace(/[<&]/g, " ")}</name>
<GroundOverlay><name>${(E.doc.title || "").replace(/[<&]/g, " ")}</name><Icon><href>files/map.jpg</href></Icon><gx:LatLonQuad><coordinates>${ll.map(([la, lo]) => `${lo.toFixed(7)},${la.toFixed(7)}`).join(" ")}</coordinates></gx:LatLonQuad></GroundOverlay></Document></kml>`;
  const { FFLATE } = await import("../vendor.js");
  if (!window.fflate) await new Promise((res, rej) => { const s = document.createElement("script"); s.src = FFLATE; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
  download(`${base}.kmz`, window.fflate.zipSync({ "doc.kml": new TextEncoder().encode(kml), "files/map.jpg": [jpg, { level: 0 }] }), "application/vnd.google-earth.kmz");
}
/** A new Tracer event on this map: the map written as OCAD 2018 and handed over, the Tracer's « Nouvel événement » opened with it. */
async function toTracer(E) {
  const { writeOcadDoc } = await import("./ocadout.js");
  const bytes = writeOcadDoc(E.live.toJSON(), E.source, { version: E.source && E.doc.ocad?.version >= 9 ? E.doc.ocad.version : 2018 });
  const { handOver } = await import("../pwa.js").catch(() => ({}));
  const file = new File([bytes], `${fileName(E.doc.title)}.ocd`, { type: "application/x-ocad" });
  await E.save(true);
  if (handOver) await handOver([file], "#/orga-tracer?recu=1");
}
async function toMyMaps(E) {
  const r = areaOf(E), k = 300 / 25.4, W = Math.round((r[2] - r[0]) * k), H = Math.round((r[3] - r[1]) * k);
  const c = E.view.render(r, Math.min(W, 9000), Math.min(H, Math.round(9000 * H / W)), { print: true });
  const blob = await new Promise((res) => c.toBlob(res, "image/png"));
  const { handOver } = await import("../pwa.js").catch(() => ({}));
  const file = new File([blob], `${fileName(E.doc.title)}.png`, { type: "image/png" });
  await E.save(true);
  if (handOver) await handOver([file], "#/mes-cartes?recu=1");
}
/** What a conversion to or from Mapper could not keep, said once (each kind of loss once). */
export function sayLosses(E, losses) {
  const kinds = [...new Set((losses || []).map((x) => x.key))];
  if (kinds.length) E.say(t("map.omap.losses", { list: kinds.map((k) => t(k)).join(" · ") }), "bad");
}
export { fileName };
void tn;
