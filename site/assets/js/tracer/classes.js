// Classes as data (the advanced level; owner, 2026-10-24, after Condes's classes spreadsheet): each class's name, its course and
// its expected entries (ev.classes). A course's class list (its secondary title, which .ppen and IOF XML carry) and expected
// entries follow from them (model.js syncDerived), and with them the loads of the controls. Filled by hand, from the courses' class
// lists already typed, from an IOF XML ClassList or CourseData (iofin.js), or from a CSV of « course;class;runners » (owner,
// 2026-11-16, after OCAD's class import: the entries' spreadsheet saved as CSV — a header row or none, « ; », « , » or tabs, a
// fourth column the class's first start number). A relay class's first start number (`first`): its teams are numbered from it
// (relay.js relayPlan: the classes of a relay course one after the other, each from its own number).

import * as M from "./model.js";
import { t, tn } from "./lang.js";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const split = (s) => String(s || "").split(/[,|;/]+/).map((x) => x.trim()).filter(Boolean);
const fold = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\b(circuit|parcours|course|bahn|recorrido)\b/g, "").replace(/[^a-z0-9]+/g, " ").trim();
/**
 * A CSV of classes: rows of course, class, runners and, if any, the first start number — in that order, or by a header row naming
 * them (course | circuit | parcours | bahn | recorrido; class | catégorie | kategorie | categoría; runners | coureurs | inscrits |
 * entries | teilnehmer | corredores; first | dossard | bib | start number). → [{ course, name, est, first }].
 */
export function parseClassCsv(text) {
  const lines = String(text || "").replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const sep = [";", "\t", ","].map((c) => [c, lines.slice(0, 5).reduce((n, l) => n + l.split(c).length - 1, 0)]).sort((a, b) => b[1] - a[1])[0][0];
  const cells = (l) => l.split(sep).map((x) => x.trim().replace(/^"(.*)"$/, "$1").trim());
  let col = { course: 0, name: 1, est: 2, first: 3 }, start = 0;
  const head = cells(lines[0]).map(fold), find = (re) => head.findIndex((h) => re.test(h));
  const hc = find(/^(course|circuit|parcours|bahn|recorrido|)$/), hn = find(/^(class|classe|categorie|category|kategorie|categoria|klasse)/), he = find(/(runner|coureur|inscrit|entr|teilnehmer|corredor|nombre|number|anzahl|participants|equipes|teams)/), hf = find(/(first|premier|dossard|bib|start ?n|startnummer|primer)/);
  if (hn >= 0 && !/^\d+$/.test(cells(lines[0])[2] || "")) { col = { course: head.findIndex((h, i) => i !== hn && i !== he && i !== hf && /(course|circuit|parcours|bahn|recorrido)/.test(lines[0].split(sep)[i].toLowerCase())), name: hn, est: he, first: hf }; if (col.course < 0) col.course = hc >= 0 && hc !== hn ? hc : 0; start = 1; }
  const out = [];
  for (const l of lines.slice(start)) {
    const c = cells(l), name = c[col.name] || "";
    if (!name) continue;
    const n = (i) => { const v = i >= 0 ? Number(String(c[i] ?? "").replace(/\s/g, "")) : NaN; return Number.isFinite(v) && String(c[i] ?? "").trim() !== "" ? Math.max(0, Math.round(v)) : -1; };
    out.push({ course: c[col.course] || "", name, est: n(col.est), first: n(col.first) });
  }
  return out;
}

/** « Catégories »: the event's classes in a table, a row each. */
export async function classesDialog(E) {
  const { modal, num } = await import("./dialogs.js");
  const ev = E.ev, ids = M.courseIds(ev);
  let rows = Object.entries(ev.classes || {}).map(([id, k]) => ({ id: Number(id), name: k.name, course: k.course || 0, est: k.est >= 0 ? k.est : "", first: k.first > 0 ? k.first : "" }))
    .sort((a, b) => (a.course - b.course) || a.name.localeCompare(b.name, undefined, { numeric: true }));
  const courseSel = (cur, i) => `<select data-k="course" data-i="${i}"><option value="0">${esc(t("trc.cls.noCourse"))}</option>${ids.map((id) => `<option value="${id}" ${id === cur ? "selected" : ""}>${esc(ev.courses[id].name)}</option>`).join("")}</select>`;
  const draw = (box) => {
    const per = new Map();
    for (const r of rows) if (r.course) per.set(r.course, (per.get(r.course) || 0) + (Number(r.est) || 0));
    // the first start number only for the classes of a relay course (a course with variations)
    const relay = (id) => !!id && M.hasVariations(ev, id), anyRelay = rows.some((r) => relay(r.course));
    box.innerHTML = `<table class="tr-table tr-classes"><thead><tr><th>${esc(t("trc.cls.name"))}</th><th>${esc(t("trc.cls.course"))}</th><th class="r">${esc(t("trc.cls.est"))}</th>${anyRelay ? `<th class="r" title="${esc(t("trc.cls.firstTip"))}">${esc(t("trc.cls.first"))}</th>` : ""}<th></th></tr></thead>
      <tbody>${rows.map((r, i) => `<tr><td><input data-k="name" data-i="${i}" value="${esc(r.name)}" size="10"></td><td>${courseSel(r.course, i)}</td>
        <td class="r"><input data-k="est" data-i="${i}" value="${esc(r.est)}" size="5" inputmode="numeric"></td>${anyRelay ? `<td class="r">${relay(r.course) ? `<input data-k="first" data-i="${i}" value="${esc(r.first)}" size="5" inputmode="numeric">` : ""}</td>` : ""}<td><button type="button" class="btn btn-sm" data-del="${i}" aria-label="${esc(t("trc.cls.remove"))}">✕</button></td></tr>`).join("")}</tbody></table>
      <p class="tr-hint">${ids.filter((id) => per.has(id)).map((id) => esc(t("trc.cls.perCourse", { course: ev.courses[id].name, n: per.get(id) }))).join(" · ") || esc(t("trc.cls.none"))}</p>`;
  };
  const v = await modal(E, { title: t("trc.cls.title"), wide: true, ok: t("trc.cls.save"), body: `
    <p>${esc(t("trc.cls.intro"))}</p>
    <div id="tr-cls"></div>
    <p><button type="button" class="btn btn-sm" id="tr-cls-add">${esc(t("trc.cls.add"))}</button>
      <button type="button" class="btn btn-sm" id="tr-cls-from">${esc(t("trc.cls.fromCourses"))}</button>
      <button type="button" class="btn btn-sm" id="tr-cls-import">${esc(t("trc.cls.import"))}</button></p>
    <p class="tr-hint">${esc(t("trc.cls.importHint"))}</p>
    <input type="file" id="tr-cls-file" accept=".xml,.csv,.txt,.tsv,text/csv,text/plain" hidden>`,
  onOpen: (f) => {
    const box = f.querySelector("#tr-cls");
    draw(box);
    box.addEventListener("input", (e) => { const el = e.target.closest("[data-k]"); if (!el) return; const r = rows[Number(el.dataset.i)]; r[el.dataset.k] = el.dataset.k === "course" ? Number(el.value) : el.value; });
    box.addEventListener("change", (e) => { if (e.target.closest("[data-k=course], [data-k=est], [data-k=first]")) { const el = e.target; rows[Number(el.dataset.i)][el.dataset.k] = el.dataset.k === "course" ? Number(el.value) : el.value; draw(box); } });
    box.addEventListener("click", (e) => { const d = e.target.closest("[data-del]"); if (d) { rows.splice(Number(d.dataset.del), 1); draw(box); } });
    f.querySelector("#tr-cls-add").addEventListener("click", () => { rows.push({ id: 0, name: "", course: E.cd.course || 0, est: "" }); draw(box); box.querySelector("tr:last-child input")?.focus(); });
    // the class lists typed on the courses (« D21E, H21E »), one row each
    f.querySelector("#tr-cls-from").addEventListener("click", () => {
      let n = 0;
      for (const id of ids) for (const name of split(ev.courses[id].secondary)) if (!rows.some((r) => r.name === name && r.course === id)) { rows.push({ id: 0, name, course: id, est: "" }); n++; }
      draw(box); E.toast(tn("trc.cls.added", n));
    });
    const file = f.querySelector("#tr-cls-file");
    f.querySelector("#tr-cls-import").addEventListener("click", () => file.click());
    file.addEventListener("change", async () => {
      const fl = file.files[0]; if (!fl) return;
      const iof = await import("./iofin.js"), text = await fl.text();
      // a CSV of « course;class;runners »: each row a class, its course found by name (« A », « Circuit A »)
      if (!/^\s*</.test(text)) {
        const list = parseClassCsv(text);
        let n = 0, miss = new Set();
        for (const k of list) {
          const course = ids.find((id) => fold(ev.courses[id].name) === fold(k.course)) || ids.find((id) => fold(ev.courses[id].name).split(" ")[0] === fold(k.course).split(" ")[0] && fold(k.course)) || 0;
          if (k.course && !course) miss.add(k.course);
          const old = rows.find((r) => r.name === k.name);
          if (old) { if (course) old.course = course; if (k.est >= 0) old.est = k.est; if (k.first > 0) old.first = k.first; }
          else rows.push({ id: 0, name: k.name, course, est: k.est >= 0 ? k.est : "", first: k.first > 0 ? k.first : "" });
          n++;
        }
        draw(box);
        E.toast(list.length ? `${tn("trc.cls.csvRead", n)}${miss.size ? ` ${t("trc.cls.csvMiss", { list: [...miss].slice(0, 8).join(", ") })}` : ""}` : t("trc.cls.csvNone"), 7000);
        file.value = "";
        return;
      }
      if (!iof.iofKind(text)) { E.toast(t("trc.imp.notIof")); return; }
      const data = iof.readIof(text);
      let n = 0;
      for (const k of data.classes) {
        const course = k.course ? ids.find((id) => ev.courses[id].name === k.course) || 0 : 0;
        if (!rows.some((r) => r.name === k.name)) { rows.push({ id: 0, name: k.name, course, est: k.est >= 0 ? k.est : "" }); n++; }
      }
      draw(box); E.toast(tn("trc.cls.added", n));
    });
  },
  validate: () => { const names = rows.map((r) => `${r.name.trim()}|${r.course}`).filter((x) => !x.startsWith("|")); return names.some((x, i) => names.indexOf(x) !== i) ? t("trc.cls.twice") : null; } });
  if (!v) return;
  E.change((x) => {
    x.classes = {};
    x.next.class = 0;
    rows.filter((r) => r.name.trim()).forEach((r, i) => { const k = { name: r.name.trim(), course: r.course || 0, est: r.est === "" ? -1 : Math.max(0, Math.round(num(r.est)) || 0), order: i }; const f = Math.round(num(r.first)); if (f > 0 && r.course && M.hasVariations(x, r.course)) k.first = f; M.addObj(x, "class", k); });
    // a course whose classes all went: its class list too
    for (const id of M.courseIds(x)) if (!Object.values(x.classes).some((k) => k.course === id) && Object.keys(ev.classes || {}).some((k) => ev.classes[k].course === id)) x.courses[id].secondary = null;
  }, t("trc.cls.undo"));
}
