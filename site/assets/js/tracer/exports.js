// The Tracer's files for other programs: IOF XML CourseData 3.0 and 2.0.3 as Purple Pen writes them (ExportXml.cs; BSD
// licence, assets/tracer/LICENSE-PurplePen.txt) for timing software (MeOS, OE, SportIdent…), GPX of the controls and
// courses, KML of the courses, images of the courses with a world file, and RouteGadget's map and course files.

import * as M from "./model.js";
import { layoutCourse } from "./layout.js";
import { itemsFor, drawItems, cmykToRgb, SCREEN } from "./draw.js";
import { modal, download, fileName, field, sel, num, saveFiles } from "./dialogs.js";
import { hasGeo, toLatLon } from "./geo.js";
import { where } from "./ribbon-data.js";
import { relayAssignments } from "./relay.js";
import { zip, printBox } from "./pdf.js";
import { paintCourse, paintMap, purpleOverride, syncMap } from "./appear.js";
import { t } from "./lang.js";

const x = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const r2 = (v) => Math.round(v * 100) / 100;
const nowIso = () => new Date().toISOString();

/** Codes for every control (starts, exchanges, finishes and crossing points get STA1, XCHG1, FIN1, CROSS1…). */
function codeMap(ev) {
  const map = new Map();
  for (const [kind, prefix] of [["start", "STA"], ["map-exchange", "XCHG"], ["normal", "CTL"], ["finish", "FIN"], ["crossing", "CROSS"]]) {
    let n = 1;
    for (const id of Object.keys(ev.controls).map(Number).sort((a, b) => a - b)) {
      const c = ev.controls[id];
      if (c.kind === kind) map.set(id, c.code || `${prefix}${n++}`);
    }
  }
  return map;
}
const classNames = (c) => String(c.secondary || "").split(/[,|]/).map((s) => s.trim()).filter(Boolean);
/** A course (or variation) as Purple Pen walks it for IOF XML: [{ kind, control, ordinal, leg (m since the last), points }]. */
function courseSequence(ev, cd) {
  const v = M.view(ev, cd, { specials: false, descriptions: false });
  const out = [];
  let dist = 0, i = 0;
  const score = v.kind === "score";
  while (i >= 0 && i < v.controls.length) {
    const cv = v.controls[i], c = ev.controls[cv.control];
    out.push({ kind: c.kind, control: cv.control, ordinal: cv.ordinal, leg: dist, points: cv.ccs[0] ? ev.courseControls[cv.ccs[0]]?.points || 0 : 0, symbol: c.symbols[0] });
    if (c.kind !== "start") dist = 0;
    if (cv.legLen?.length) dist += cv.legLen[0];
    i = score ? i + 1 : M.nextIndex(v, i);
  }
  return { seq: out, view: v };
}

export function iofXmlText(ev, version = 3) {
  const codes = codeMap(ev), geo = hasGeo(ev);
  const [fx, fy] = M.fileOffset(ev);                         // an OCAD or Mapper map: the positions in its own mm, as Purple Pen
  const bounds = [fx, fy, fx + (ev.map.w || 0), fy + (ev.map.h || 0)];
  const out = [];
  const courses = M.courseIds(ev).filter((id) => M.findKind(ev, id, "start") && M.hasFinish(ev, id));
  if (version === 3) {
    out.push('<?xml version="1.0" encoding="utf-8"?>',
      `<CourseData xmlns="http://www.orienteering.org/datastandard/3.0" iofVersion="3.0" createTime="${nowIso()}" creator="Ozimut">`,
      `  <Event>\n    <Name>${x(ev.title.replace(/\|/g, " "))}</Name>\n  </Event>`, "  <RaceCourseData>",
      `    <Map>\n      <Scale>${ev.map.scale}</Scale>\n      <MapPositionTopLeft x="${r2(bounds[0])}" y="${r2(bounds[3])}" />\n      <MapPositionBottomRight x="${r2(bounds[2])}" y="${r2(bounds[1])}" />\n    </Map>`);
    const TYPE = { normal: "Control", start: "Start", "map-exchange": "Start", finish: "Finish", crossing: "CrossingPoint" };
    for (const kind of ["start", "map-exchange", "normal", "finish", "crossing"]) for (const id of Object.keys(ev.controls).map(Number).sort((a, b) => a - b)) {
      const c = ev.controls[id];
      if (c.kind !== kind) continue;
      out.push(`    <Control type="${TYPE[kind]}">`, `      <Id>${x(codes.get(id))}</Id>`);
      if (geo) { const [lat, lon] = toLatLon(ev, c.x, c.y); out.push(`      <Position lng="${lon.toFixed(7)}" lat="${lat.toFixed(7)}" />`); }
      out.push(`      <MapPosition x="${r2(c.x + fx)}" y="${r2(c.y + fy)}" />`, "    </Control>");
    }
    const assignments = [];
    for (const id of courses) {
      const c = ev.courses[id], score = c.kind === "score";
      const vars = M.hasVariations(ev, id) ? M.allVariations(ev, id) : [null];
      for (const vr of vars) {
        const cd = M.cdCourse(id, -1, vr?.path || null), { seq, view } = courseSequence(ev, cd);
        const name = vr ? `${c.name} ${vr.code}` : c.name;
        out.push("    <Course>", `      <Name>${x(name)}</Name>`);
        if (vr) out.push(`      <CourseFamily>${x(c.name)}</CourseFamily>`);
        if (!score) {
          out.push(`      <Length>${Math.round(view.totalMax / 100) * 100}</Length>`);
          if (c.climb > 0) out.push(`      <Climb>${Math.round(c.climb / 5) * 5}</Climb>`);
        }
        for (const cn of classNames(c)) assignments.push({ cls: cn, course: name, family: vr ? c.name : null });
        for (const s of seq) {
          if (s.kind === "map-issue") continue;
          let attrs = "";
          if (s.kind === "start" || s.kind === "map-exchange") attrs = ' type="Start"';
          else if (s.kind === "finish") attrs = ` type="Finish"${s.symbol === "14.1" ? ' specialInstruction="TapedRoute"' : s.symbol === "14.2" ? ' specialInstruction="FunnelTapedRoute"' : ""}`;
          else if (s.kind === "normal") attrs = ` type="Control"${score ? ' randomOrder="true"' : ""}`;
          else if (s.kind === "crossing") attrs = ` type="CrossingPoint" specialInstruction="${s.symbol === "13.4" ? "MandatoryOutOfBoundsAreaPassage" : "MandatoryCrossingPoint"}"`;
          out.push(`      <CourseControl${attrs}>`, `        <Control>${x(codes.get(s.control))}</Control>`);
          if (!score && s.ordinal > 0) out.push(`        <MapText>${s.ordinal}</MapText>`);
          if (!score && s.kind !== "start") out.push(`        <LegLength>${Math.round(s.leg)}</LegLength>`);
          if (score && s.kind === "normal" && s.points > 0) out.push(`        <Score>${s.points}</Score>`);
          out.push("      </CourseControl>");
        }
        out.push("    </Course>");
      }
    }
    for (const a of assignments) out.push("    <ClassCourseAssignment>", `      <ClassName>${x(a.cls)}</ClassName>`, `      <CourseName>${x(a.course)}</CourseName>`, ...(a.family ? [`      <CourseFamily>${x(a.family)}</CourseFamily>`] : []), "    </ClassCourseAssignment>");
    // relay teams (ExportRelayVariations3)
    for (const id of courses) {
      const c = ev.courses[id];
      if (!M.hasVariations(ev, id) || !(c.relay?.teams > 0 || c.relay?.table?.length)) continue;
      for (const t of relayAssignments(ev, id)) {
        out.push("    <TeamCourseAssignment>", `      <BibNumber>${x(t.bib ?? t.team)}</BibNumber>`, `      <TeamName>${x(t.name || t.team)}</TeamName>`);
        t.legs.forEach((code, i) => out.push("      <TeamMemberCourseAssignment>", `        <Leg>${i + 1}</Leg>`, `        <CourseName>${x(`${c.name} ${code}`)}</CourseName>`, `        <CourseFamily>${x(c.name)}</CourseFamily>`, "      </TeamMemberCourseAssignment>"));
        out.push("    </TeamCourseAssignment>");
      }
    }
    // relay teams imported from another program (iofin.js), written back with the courses they name that are still there
    const names = new Set(courses.flatMap((id) => (M.hasVariations(ev, id) ? M.allVariations(ev, id).map((vr) => `${ev.courses[id].name} ${vr.code}`) : [ev.courses[id].name])));
    if (!courses.some((id) => M.hasVariations(ev, id) && (ev.courses[id].relay?.teams > 0 || ev.courses[id].relay?.table?.length))) for (const tm of ev.relayTeams || []) {
      const legs = tm.legs.filter((l) => names.has(l.course));
      if (!legs.length) continue;
      out.push("    <TeamCourseAssignment>", `      <BibNumber>${x(tm.bib)}</BibNumber>`, `      <TeamName>${x(tm.name)}</TeamName>`);
      for (const l of legs) out.push("      <TeamMemberCourseAssignment>", `        <Leg>${l.leg}</Leg>`, `        <CourseName>${x(l.course)}</CourseName>`, ...(l.family ? [`        <CourseFamily>${x(l.family)}</CourseFamily>`] : []), "      </TeamMemberCourseAssignment>");
      out.push("    </TeamCourseAssignment>");
    }
    out.push("  </RaceCourseData>", "</CourseData>");
    return out.join("\n") + "\n";
  }
  // IOF XML 2.0.3
  const d = new Date();
  out.push('<?xml version="1.0" encoding="utf-8"?>', '<!DOCTYPE CourseData SYSTEM "IOFdata.dtd">', "<CourseData>", '  <IOFVersion version="2.0.3" />',
    `  <ModifyDate>\n    <Date>${d.toISOString().slice(0, 10)}</Date>\n    <Clock>${d.toTimeString().slice(0, 8)}</Clock>\n  </ModifyDate>`,
    `  <Map>\n    <Scale>${ev.map.scale}</Scale>\n    <MapPosition x="${r2(bounds[0])}" y="${r2(bounds[1])}" />\n  </Map>`);
  const EL = { start: "StartPoint", "map-exchange": "StartPoint", normal: "Control", finish: "FinishPoint" };
  for (const kind of ["start", "map-exchange", "normal", "finish"]) for (const id of Object.keys(ev.controls).map(Number).sort((a, b) => a - b)) {
    const c = ev.controls[id];
    if (c.kind !== kind) continue;
    const el = EL[kind];
    out.push(`  <${el}>`, `    <${el}Code>${x(codes.get(id))}</${el}Code>`, `    <MapPosition x="${r2(c.x + fx)}" y="${r2(c.y + fy)}" />`, `  </${el}>`);
  }
  courses.forEach((id, n) => {
    const c = ev.courses[id], score = c.kind === "score";
    out.push("  <Course>", `    <CourseName>${x(c.name)}</CourseName>`, `    <CourseId>${n}</CourseId>`);
    for (const cn of classNames(c)) out.push(`    <ClassShortName>${x(cn)}</ClassShortName>`);
    const vars = M.hasVariations(ev, id) ? M.allVariations(ev, id) : [null];
    vars.forEach((vr, vn) => {
      const { seq, view } = courseSequence(ev, M.cdCourse(id, -1, vr?.path || null));
      out.push("    <CourseVariation>", `      <CourseVariationId>${vn}</CourseVariationId>`);
      if (vr) out.push(`      <Name>${x(vr.code)}</Name>`);
      if (!score) { out.push(`      <CourseLength>${Math.round(view.totalMax / 100) * 100}</CourseLength>`); if (c.climb > 0) out.push(`      <CourseClimb>${Math.round(c.climb / 5) * 5}</CourseClimb>`); }
      let k = 1;
      for (const s of seq) {
        if (s.kind === "start") out.push(`      <StartPointCode>${x(codes.get(s.control))}</StartPointCode>`);
        else if (s.kind === "finish") { out.push(`      <FinishPointCode>${x(codes.get(s.control))}</FinishPointCode>`, `      <DistanceToFinish>${Math.round(s.leg)}</DistanceToFinish>`); }
        else if (s.kind === "normal") {
          out.push("      <CourseControl>", `        <Sequence>${k++}</Sequence>`, `        <ControlCode>${x(codes.get(s.control))}</ControlCode>`);
          if (!score) out.push(`        <LegLength>${Math.round(s.leg)}</LegLength>`);
          if (score && s.points > 0) out.push(`        <ScoreOPoints>${s.points}</ScoreOPoints>`);
          out.push("      </CourseControl>");
        }
      }
      out.push("    </CourseVariation>");
    });
    out.push("  </Course>");
  });
  out.push("</CourseData>");
  return out.join("\n") + "\n";
}
export function iofXml(E, version) {
  const ev = E.ev;
  const missing = M.courseIds(ev).filter((id) => !(M.findKind(ev, id, "start") && M.hasFinish(ev, id))).map((id) => ev.courses[id].name);
  download(`${fileName(ev.title)} - IOF XML ${version === 3 ? "3.0" : "2.0.3"}.xml`, iofXmlText(ev, version), "application/xml");
  if (missing.length) E.toast(t("trc.exp.notExported", { list: missing.join(", ") }), 6000);
}

// ---- GPX and KML (need the map's georeference) -----------------------------------------------------------------------------------
function needGeo(E) {
  if (hasGeo(E.ev)) return true;
  E.toast(t("trc.exp.noGeo", { where: where("georef") }), 6000);
  return false;
}
export function gpx(E) {
  if (!needGeo(E)) return;
  const ev = E.ev, codes = codeMap(ev);
  const wpt = Object.keys(ev.controls).map(Number).map((id) => {
    const c = ev.controls[id], [lat, lon] = toLatLon(ev, c.x, c.y);
    return `  <wpt lat="${lat.toFixed(7)}" lon="${lon.toFixed(7)}"><name>${x(codes.get(id))}</name><sym>Flag</sym></wpt>`;
  });
  const trk = M.courseIds(ev).map((id) => {
    const v = M.view(ev, M.cdCourse(id), { specials: false, descriptions: false });
    const pts = [];
    for (const cv of v.controls) { const c = ev.controls[cv.control], [lat, lon] = toLatLon(ev, c.x, c.y); pts.push(`<trkpt lat="${lat.toFixed(7)}" lon="${lon.toFixed(7)}" />`); }
    return `  <trk><name>${x(ev.courses[id].name)}</name><trkseg>${pts.join("")}</trkseg></trk>`;
  });
  download(`${fileName(ev.title)}.gpx`, `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Ozimut" xmlns="http://www.topografix.com/GPX/1/1">\n${wpt.join("\n")}\n${trk.join("\n")}\n</gpx>\n`, "application/gpx+xml");
}
export function kml(E) {
  if (!needGeo(E)) return;
  const ev = E.ev, codes = codeMap(ev);
  const ll = (c) => { const [lat, lon] = toLatLon(ev, c.x, c.y); return `${lon.toFixed(7)},${lat.toFixed(7)},0`; };
  const folders = M.courseIds(ev).map((id) => {
    const v = M.view(ev, M.cdCourse(id), { specials: false, descriptions: false });
    const marks = v.controls.map((cv) => { const c = ev.controls[cv.control]; return `<Placemark><name>${x(cv.ordinal > 0 ? `${cv.ordinal}-${codes.get(cv.control)}` : codes.get(cv.control))}</name><styleUrl>#c</styleUrl><Point><coordinates>${ll(c)}</coordinates></Point></Placemark>`; });
    const line = `<Placemark><name>${x(ev.courses[id].name)}</name><styleUrl>#l</styleUrl><LineString><coordinates>${v.controls.map((cv) => ll(ev.controls[cv.control])).join(" ")}</coordinates></LineString></Placemark>`;
    return `<Folder><name>${x(ev.courses[id].name)}</name>${line}${marks.join("")}</Folder>`;
  });
  download(`${fileName(ev.title)}.kml`, `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${x(ev.title)}</name>
<Style id="c"><IconStyle><color>ff9b17a7</color><Icon><href>http://maps.google.com/mapfiles/kml/shapes/placemark_circle.png</href></Icon></IconStyle></Style>
<Style id="l"><LineStyle><color>ff9b17a7</color><width>3</width></LineStyle></Style>
${folders.join("\n")}</Document></kml>\n`, "application/vnd.google-earth.kml+xml");
}

// ---- images of the courses ---------------------------------------------------------------------------------------------------------
/**
 * A course drawn over the map into a canvas at dpi (paper), its print area (clipped to a box of map mm when given: the 3D
 * view keeps to the map); returns { canvas, box (map mm), pxPerMm }.
 */
export async function courseImage(E, cd, dpi, { withMap = true, clip = null } = {}) {
  const ev = E.ev, layout = layoutCourse(ev, cd), items = itemsFor(ev, layout);
  const pb = printBox(E, cd, layout), k = pb.k;
  let box = pb.box;
  if (clip) {
    const b = [Math.max(box[0], clip[0]), Math.max(box[1], clip[1]), Math.min(box[2], clip[2]), Math.min(box[3], clip[3])];
    if (b[2] > b[0] && b[3] > b[1]) box = b;
  }
  const pxPerMm = (dpi / 25.4) * k;                            // image px per map mm
  const W = Math.round((box[2] - box[0]) * pxPerMm), H = Math.round((box[3] - box[1]) * pxPerMm);
  if (W * H > 120e6) throw new Error(t("trc.exp.tooBig"));
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const g = c.getContext("2d");
  g.fillStyle = "#fff"; g.fillRect(0, 0, W, H);
  const T = (xx, yy) => [(xx - box[0]) * pxPerMm, (box[3] - yy) * pxPerMm];
  // the online layer printed under the map, or in its place for an event set on OpenStreetMap (backdrop.js), with its credit
  const bgId = withMap && !E.map ? M.printBgOf(ev, cd.course || 0) : "";
  let credit = "";
  if (bgId) { try { const B = await import("./backdrop.js"), cv = await B.backdropCanvas(E, bgId, box, pxPerMm); if (cv) { g.drawImage(cv, 0, 0, W, H); credit = B.creditOf(bgId); } } catch (err) { console.error(err); } }
  const pc = purpleOverride(ev, E.map), purple = pc ? cmykToRgb(pc) : SCREEN.upper;
  await paintCourse(g, ev, E.map, box, pxPerMm, W, H, items, (list, blend) => drawItems(g, list, T, pxPerMm, { blend, purple }), { withMap: withMap && !!E.map, course: cd.course || 0 });
  if (credit) { const fs = Math.max(9, Math.round(pxPerMm * 1.6)); g.font = `${fs}px sans-serif`; g.textBaseline = "bottom"; const tw = g.measureText(credit).width; g.fillStyle = "rgba(255,255,255,0.8)"; g.fillRect(4, H - fs - 8, tw + 8, fs + 6); g.fillStyle = "#222"; g.fillText(credit, 8, H - 4); }
  return { canvas: c, box, pxPerMm };
}
/** A world file for an image of box at pxPerMm: when georeferenced, in degrees (EPSG:4326, approximated by an affine). */
function worldFile(ev, box, pxPerMm) {
  if (!hasGeo(ev)) return null;
  const [lat0, lon0] = toLatLon(ev, box[0] + 0.5 / pxPerMm, box[3] - 0.5 / pxPerMm);
  const [lat1, lon1] = toLatLon(ev, box[0] + 1.5 / pxPerMm, box[3] - 0.5 / pxPerMm);
  const [lat2, lon2] = toLatLon(ev, box[0] + 0.5 / pxPerMm, box[3] - 1.5 / pxPerMm);
  return [lon1 - lon0, lat1 - lat0, lon2 - lon0, lat2 - lat0, lon0, lat0].map((v) => v.toFixed(12)).join("\n") + "\n";
}
export async function imagesDialog(E) {
  const ev = E.ev, ids = M.courseIds(ev);
  const v = await modal(E, { title: t("trc.exp.imagesTitle"), wide: true, ok: t("trc.exp.create"), remember: "images", body: `
    <div class="tr-checks">${[0, ...ids].map((id) => `<label class="tr-check"><input type="checkbox" name="c${id}" ${id ? "checked" : ""}> ${id ? x(ev.courses[id].name) : x(t("trc.exp.allControls"))}</label>`).join("")}</div>
    <div class="tr-grid2">${field(t("trc.exp.format"), sel("fmt", [["png", "PNG"], ["jpeg", "JPEG"], ["gif", t("trc.exp.gif")]], "png"))}${field(t("trc.exp.dpi"), '<input name="dpi" value="200" inputmode="numeric">')}
    ${field(t("trc.exp.content"), sel("content", [["map", t("trc.exp.contentMap")], ["course", t("trc.exp.contentCourse")]], "map"))}</div>
    <p class="tr-hint">${x(hasGeo(ev) ? t("trc.exp.worldYes") : t("trc.exp.worldNo"))}</p>`,
  validate: (o) => (!(num(o.dpi) >= 50 && num(o.dpi) <= 1200) ? t("trc.exp.dpiErr") : null) });
  if (!v) return;
  E.status(t("trc.exp.busy"), "busy");
  const files = {};
  for (const id of [0, ...ids]) {
    if (!v[`c${id}`]) continue;
    const cd = id ? M.cdCourse(id) : M.cdAll(), name = fileName(id ? ev.courses[id].name : t("trc.exp.allControls"));
    const { canvas, box, pxPerMm } = await courseImage(E, cd, num(v.dpi), { withMap: v.content === "map" });
    const ext = { png: ["png", "pgw"], jpeg: ["jpg", "jgw"], gif: ["gif", "gfw"] }[v.fmt];
    if (v.fmt === "gif") {
      const { encodeGif } = await import("./gif.js");
      files[`${name}.gif`] = encodeGif(canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
    } else {
      const blob = await new Promise((r) => canvas.toBlob(r, `image/${v.fmt}`, 0.92));
      files[`${name}.${ext[0]}`] = new Uint8Array(await blob.arrayBuffer());
    }
    const wf = worldFile(ev, box, pxPerMm);
    if (wf) files[`${name}.${ext[1]}`] = new TextEncoder().encode(wf);
  }
  if (Object.keys(files).length === 1) { const [n, b] = Object.entries(files)[0]; download(n, new Blob([b])); }
  else await saveFiles(E, files, `${fileName(ev.title)} - images.zip`);
  E.status(t("trc.exp.done"), "ok");
}

// ---- RouteGadget --------------------------------------------------------------------------------------------------------------------
export async function routeGadget(E) {
  const ev = E.ev;
  // the map image enclosing every print area, at a resolution RouteGadget handles, and the courses in IOF XML 3.0
  const dpi = Math.min(150, (5000 * 25.4) / Math.max(ev.map.w, ev.map.h));
  const pxPerMm = dpi / 25.4, W = Math.round(ev.map.w * pxPerMm), H = Math.round(ev.map.h * pxPerMm);
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const g = c.getContext("2d");
  g.fillStyle = "#fff"; g.fillRect(0, 0, W, H);
  if (E.map) { await syncMap(ev, E.map); await paintMap(g, ev, E.map, [0, 0, ev.map.w, ev.map.h], pxPerMm, W, H); }
  const files = { [`${fileName(ev.title)}.jpg`]: new Uint8Array(await (await new Promise((r) => c.toBlob(r, "image/jpeg", 0.9))).arrayBuffer()) };
  const wf = worldFile(ev, [0, 0, ev.map.w, ev.map.h], pxPerMm);
  if (wf) files[`${fileName(ev.title)}.jgw`] = new TextEncoder().encode(wf);
  // RouteGadget reads the controls' map positions: here in pixels of the image (MapPosition unit="px" is not IOF; the
  // positions stay in mm and the map's corners in the Map element let it scale them)
  files[`${fileName(ev.title)}.xml`] = new TextEncoder().encode(iofXmlText(ev, 3));
  await saveFiles(E, files, `${fileName(ev.title)} - RouteGadget.zip`);
  E.toast(t("trc.exp.routeGadget"), 8000);
}
