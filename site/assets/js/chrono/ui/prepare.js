// This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not
// distributed with this file, You can obtain one at https://mozilla.org/MPL/2.0/.

// « Préparer »: the assistant that takes an event from nothing to ready — the event, its courses, its classes, the entries,
// the start times, the equipment, the links, a last check. Each step is a panel; the ribbon holds the step's commands.

import { t, tn, locale } from "../lib/i18n.js";
import { confirmBox, alertBox } from "../lib/ask.js";
import { html, raw, icon, formDialog, values, field, opt, pickFiles, download, printHtml, table, bindTable, statusTag, atClock } from "./kit.js";
import { clock, span, parseClock } from "../times.js";
import { newId } from "../log.js";
import { importSet, norm } from "../model.js";
import { draw, checkStarts } from "../draw.js";
import { exportView } from "../view.js";
import { RULES } from "../rules/index.js";
import { readIof, writeStarts, writeEntries } from "../io/iofxml.js";
import { readCsv } from "../io/oecsv.js";
import { decodeText } from "../xml.js";
import { fromFile, toFile, eventFileName, kvSet } from "../store.js";
import { startsHtml, minutesHtml, clubsHtml } from "../print/lists.js";
import { runnerDialog } from "./dialogs.js";
import { teamsPanel, teamDialog, numberTeams, restartDialog, hasTeams } from "./teams.js";
import { knockoutDialog, seriesDialog, chaseDialog } from "./formats.js";
import { personOf } from "../view.js";
import { fakeRead, serialOk } from "./devices.js";

const STEPS = ["event", "courses", "classes", "entries", "teams", "starts", "kit", "net", "check"];
/** The steps of this event: « Équipes » only where a class is run in teams. */
const stepsOf = (ctx) => STEPS.filter((s) => s !== "teams" || hasTeams(ctx.st()));

/** Where the desktop application is downloaded: the files the release workflow publishes (.github/workflows/release.yml). */
const APP_BASE = "https://github.com/kerkia/ChronOzimut/releases/latest/download/";
const APP_FILES = [["win", "Windows", "Ozimut-Chrono-Setup.exe"], ["winp", "Windows", "Ozimut-Chrono-Portable.exe"], ["mac", "macOS", "Ozimut-Chrono.dmg"], ["linux", "Linux", "Ozimut-Chrono.AppImage"]];
export function appDialog() {
  const ua = navigator.userAgent, mine = /Windows/.test(ua) ? "win" : /Mac OS X|Macintosh/.test(ua) ? "mac" : /Linux|X11/.test(ua) && !/Android/.test(ua) ? "linux" : "";
  return formDialog({ title: t("chr.app.title"), ok: "", cancel: t("chr.close"),
    body: html`<p>${t("chr.app.lede")}</p><ul class="chr-app-dl">${APP_FILES.map(([k, os, file]) => html`<li><a class="btn ${k === mine ? "btn-primary" : ""}" href="${APP_BASE}${file}" rel="noopener" download>${icon("down", 14)} ${os}</a>
      <span>${t(`chr.app.f.${k}`)}</span></li>`)}</ul><p class="chr-dim">${t("chr.app.warn")}</p><p class="chr-dim">${t("chr.app.doc")}</p>` });
}
const byName = (a, b) => String(a.name).localeCompare(String(b.name), undefined, { numeric: true });
const who = (r) => `${r.family || ""} ${r.given || ""}`.trim();

/** The labels the printed lists need. */
export function listLabels(title) {
  const st = {};
  for (const s of ["ok", "mp", "dnf", "dns", "dsq", "ot", "nc", "run", "wait"]) st[s] = t(`chr.st.${s}`);
  return { title, place: t("chr.col.place"), name: t("chr.col.name"), club: t("chr.col.club"), cat: t("chr.col.cls"), time: t("chr.col.time"), behind: t("chr.col.behind"), start: t("chr.col.start"),
    card: t("chr.col.card"), bib: t("chr.col.bib"), status: st, runners: t("chr.lst.runners"), km: "km", climb: "m", controls: t("chr.lst.controls"), printed: t("chr.lst.printed", { at: new Date().toLocaleString(locale()) }), points: t("chr.col.points") };
}

/** Any file a timing tool may be given: what it is, what it holds, then — once agreed — into the log. */
export async function importFiles(ctx, files) {
  for (const f of files) {
    const bytes = new Uint8Array(await f.arrayBuffer()), text = decodeText(bytes), head = text.slice(0, 600).toLowerCase();
    try {
      if (/\.(ozchrono|jsonl)$/i.test(f.name) || head.startsWith('{"format":"ozimut-chrono"')) {
        const d = fromFile(text);
        if (!(await confirmBox(t("chr.imp.fileAsk", { n: d.ops.length, name: d.event?.name || f.name }), { ok: t("chr.imp.take") }))) continue;
        const n = ctx.log.merge(d.ops).length;
        ctx.toast(t("chr.imp.fileDone", { n }), "ok");
        continue;
      }
      let res = null, kind = "";
      if (head.includes("<meosdata")) { const m = await import("../io/meosxml.js"); res = { set: m.readMeos(text).set }; kind = "meos"; }
      else if (head.includes("<?xml") || /<(entrylist|startlist|resultlist|coursedata|classlist|competitorlist)\b/.test(head)) { res = readIof(text); kind = res ? `iof.${res.kind}` : ""; }
      else { res = readCsv(bytes); kind = res ? `csv.${res.layout}` : ""; }
      if (!res?.set) { await alertBox(t("chr.imp.unknown", { name: f.name })); continue; }
      const s = res.set, n = (a) => (a ? a.length : 0);
      const ok = await formDialog({ title: t("chr.imp.title"), ok: t("chr.imp.take"),
        body: html`<p><b>${f.name}</b> — ${t(`chr.imp.kind.${kind.split(".")[0]}`)}${kind.includes(".") ? ` (${kind.split(".")[1]})` : ""}</p><ul class="chr-ul">
          ${n(s.runners) ? html`<li>${tn("chr.imp.runners", n(s.runners))}</li>` : ""}${n(s.courses) ? html`<li>${tn("chr.imp.courses", n(s.courses))}</li>` : ""}
          ${n(s.classes) ? html`<li>${tn("chr.imp.classes", n(s.classes))}</li>` : ""}${n(s.reads) ? html`<li>${tn("chr.imp.reads", n(s.reads))}</li>` : ""}${n(s.teams) ? html`<li>${tn("chr.imp.teams", n(s.teams))}</li>` : ""}</ul>
          <p class="chr-dim">${t("chr.imp.merge")}</p>` });
      if (!ok) continue;
      const did = importSet(ctx.log, s, { by: ctx.by });
      ctx.toast(t("chr.imp.done", { added: did.added, updated: did.updated }), "ok");
    } catch (e) { await alertBox(t("chr.imp.fail", { name: f.name, why: e?.message || String(e) })); }
  }
  ctx.refresh();
}

/** An invented event, for a rehearsal with nothing entered yet: courses, classes and runners that are nobody. */
export function demoSet() {
  // i18n-ignore-next 3
  const fam = ["Aubier", "Bruyère", "Cormier", "Douglas", "Érable", "Frêne", "Genêt", "Houx", "If", "Jonc", "Lierre", "Mélèze", "Noyer", "Orme", "Prunier", "Roseau", "Sureau", "Tilleul"];
  const giv = ["Alix", "Camille", "Charlie", "Dominique", "Eden", "Lou", "Maé", "Noa", "Sacha", "Yaël"];
  const clubs = [["Balise d'Essai", "9901"], ["CO des Fougères", "9902"], ["Azimut Démo", "9903"]];
  const runners = [];
  ["H21", "D21", "H40", "D16"].forEach((cls, k) => { for (let i = 0; i < 6; i++) { const c = clubs[(i + k) % 3]; runners.push({ family: fam[(k * 6 + i) % fam.length], given: giv[(k * 3 + i) % giv.length], club: c[0], clubCode: c[1], cls, card: 500100 + k * 10 + i }); } });
  return { courses: [{ name: "A", length: 6200, climb: 180, controls: [31, 32, 33, 34, 35, 36, 37, 100] }, { name: "B", length: 4100, climb: 110, controls: [31, 38, 34, 39, 37, 100] }, { name: "C", length: 2800, climb: 60, controls: [38, 39, 40, 100] }],
    classes: [{ name: "H21", course: "A" }, { name: "D21", course: "B" }, { name: "H40", course: "B" }, { name: "D16", course: "C" }], runners };
}

function eventPanel(ctx) {
  const e = ctx.st().event, sc = e.score || {};
  return html`<div class="chr-card"><h3>${t("chr.prep.event")}</h3><div class="chr-grid" data-form="event">
    ${field(t("chr.ev.name"), html`<input name="name" value="${e.name || ""}">`)}
    ${field(t("chr.ev.date"), html`<input name="date" type="date" value="${e.date || ""}">`)}
    ${field(t("chr.ev.place"), html`<input name="place" value="${e.place || ""}">`)}
    ${field(t("chr.ev.club"), html`<input name="club" value="${e.club || ""}">`)}
    ${field(t("chr.ev.type"), html`<select name="type">${["individual", "score", "relay"].map((x) => opt(x, t(`chr.ev.type.${x}`), e.type || "individual"))}</select>`)}
    ${field(t("chr.ev.rules"), html`<select name="rules">${Object.keys(RULES).map((x) => opt(x, t(`chr.rules.${x}`), e.rules || "iof"))}</select>`, t("chr.ev.rulesHint"))}
    ${field(t("chr.ev.timing"), html`<select name="timing">${opt("si", "SPORTident", e.timing || "si")}${opt("emit", "Emit", e.timing)}</select>`)}
    ${field(t("chr.ev.startMode"), html`<select name="startMode">${["list", "punch", "mass"].map((x) => opt(x, t(`chr.ev.start.${x}`), e.startMode || "list"))}</select>`, t("chr.ev.startHint"))}
    ${field(t("chr.ev.zero"), html`<input name="zero" data-clock value="${clock(e.zero)}" placeholder="10:00:00">`)}
    ${field(t("chr.ev.close"), html`<input name="close" data-clock value="${clock(e.close)}" placeholder="14:00:00">`, t("chr.ev.closeHint"))}
    ${e.type === "score" ? html`${field(t("chr.ev.limit"), html`<input name="score.limit" data-min value="${sc.limit ? sc.limit / 60 : ""}">`)}
      ${field(t("chr.ev.penalty"), html`<input name="score.penalty" data-num value="${sc.penalty ?? 1}">`, t("chr.ev.penaltyHint"))}` : ""}
    ${field(t("chr.ev.footer"), html`<input name="footer" value="${e.footer || ""}" placeholder="${t("chr.rc.footer")}">`)}
  </div></div>`;
}
function bindEvent(ctx, el) {
  el.querySelectorAll("[data-form=event] [name]").forEach((inp) => inp.addEventListener("change", () => {
    let v = inp.value.trim();
    if (inp.dataset.clock != null) { v = v ? parseClock(v) : null; if (inp.value.trim() && v == null) { ctx.toast(t("chr.badTime"), "warn"); return; } }
    if (inp.name.startsWith("score.")) {
      const k = inp.name.slice(6), n = Number(v.replace(",", "."));
      ctx.setEvent({ score: { per: 60, penalty: 1, ...(ctx.st().event.score || {}), [k]: k === "limit" ? Math.round(n * 60) : n } });
    } else ctx.setEvent({ [inp.name]: v === "" ? null : v });
  }));
}

function coursesPanel(ctx, S) {
  const st = ctx.st(), rows = Object.values(st.courses).sort(byName);
  const used = (c) => Object.values(st.classes).filter((k) => k.course === c.id || k.pool?.includes(c.id) || k.legs?.some((l) => l.course === c.id || l.pool?.includes(c.id))).map((k) => k.name).join(", ");
  return html`<div class="chr-card"><h3>${t("chr.prep.courses")} <small>${rows.length}</small></h3>${table([
    { key: "name", label: t("chr.col.course"), get: (c) => c.name },
    { key: "len", label: "km", num: 1, get: (c) => (c.length ? (c.length / 1000).toFixed(1) : ""), sort: (c) => c.length },
    { key: "climb", label: "m", num: 1, get: (c) => c.climb ?? "" },
    { key: "n", label: t("chr.lst.controls"), num: 1, get: (c) => c.controls?.length || 0 },
    { key: "codes", label: t("chr.crs.codes"), get: (c) => (c.controls || []).join(" "), cell: (c) => html`<span class="chr-codes">${(c.controls || []).join(" ")}</span>${c.score ? html` <span class="chr-chip">${t("chr.ev.type.score")}</span>` : ""}` },
    { key: "cls", label: t("chr.prep.classes"), get: used },
  ], rows, { state: S.courses, empty: t("chr.crs.none") })}</div>`;
}
function courseDialog(ctx, id) {
  const c = id ? ctx.st().courses[id] : { controls: [] };
  return formDialog({ title: id ? t("chr.crs.edit") : t("chr.crs.new"), ok: t("chr.save"), wide: true,
    extra: id ? html`<button type="button" class="btn btn-danger" data-del>${t("chr.delete")}</button>` : "",
    body: html`<div class="chr-grid">${field(t("chr.col.course"), html`<input name="name" value="${c.name || ""}" required autofocus>`)}
      ${field(t("chr.crs.length"), html`<input name="length" data-num value="${c.length ?? ""}">`)}${field(t("chr.crs.climb"), html`<input name="climb" data-num value="${c.climb ?? ""}">`)}</div>
      ${field(t("chr.crs.codes"), html`<textarea name="codes" rows="3">${(c.controls || []).join(" ")}</textarea>`, t("chr.crs.codesHint"))}
      <label class="chr-check"><input type="checkbox" name="score" ${c.score ? raw("checked") : ""}> ${t("chr.crs.score")}</label>`,
    onOpen(dlg) { dlg.querySelector("[data-del]")?.addEventListener("click", async () => { if (await confirmBox(t("chr.crs.delAsk", { name: c.name }), { ok: t("chr.delete") })) { ctx.put("courses", id, null); dlg.end(null); } }); },
    onOk(dlg) {
      const v = values(dlg), controls = (v.codes.match(/\d+/g) || []).map(Number).filter((n) => n > 0);
      if (!v.name) return false;
      const cid = id || newId(), rows = controls.filter((n) => !ctx.st().controls[n]).map((n) => ["controls", String(n), {}]);
      rows.push(["courses", cid, { name: v.name, length: v.length, climb: v.climb, controls, score: v.score ? true : null }]);
      ctx.log.add("many", { rows }, ctx.by);
      return cid;
    } });
}

function classesPanel(ctx, S) {
  const st = ctx.st(), rows = Object.values(st.classes).sort(byName), count = {};
  for (const r of Object.values(st.runners)) count[r.cls] = (count[r.cls] || 0) + 1;
  const courseOf = (k) => (k.legs?.length ? k.legs.map((l) => (l.pool || [l.course]).map((id) => st.courses[id]?.name || "?").join("/")).join(" ; ")
    : k.pool?.length ? k.pool.map((id) => st.courses[id]?.name || "?").join("/") : st.courses[k.course]?.name || "");
  return html`<div class="chr-card"><h3>${t("chr.prep.classes")} <small>${rows.length}</small></h3>${table([
    { key: "name", label: t("chr.col.cls"), get: (k) => k.name },
    { key: "course", label: t("chr.col.course"), get: courseOf, cell: (k) => (courseOf(k) ? courseOf(k) : html`<span class="chr-warn">${t("chr.cls.noCourse")}</span>`) },
    { key: "n", label: t("chr.lst.runners"), num: 1, get: (k) => count[k.id] || 0 },
    { key: "first", label: t("chr.cls.first"), num: 1, get: (k) => clock(k.first), sort: (k) => k.first },
    { key: "step", label: t("chr.cls.step"), num: 1, get: (k) => (k.step ? span(k.step) : "") },
    { key: "fee", label: t("chr.run.fee"), num: 1, get: (k) => k.fee ?? "" },
    { key: "team", label: t("chr.prep.teams"), get: (k) => (k.legs?.length ? t("chr.cls.relayOf", { n: k.legs.length }) : k.team ? t("chr.cls.teamOf", { n: k.team.size }) : k.ko ? t("chr.ko.heat") : "") },
    { key: "nc", label: t("chr.st.nc"), get: (k) => (k.nc ? "✓" : "") },
  ], rows, { state: S.classes, empty: t("chr.cls.none") })}</div>`;
}
function classDialog(ctx, id) {
  const st = ctx.st(), k = id ? st.classes[id] : {}, courses = Object.values(st.courses).sort(byName), relay = st.event.type === "relay";
  const names = (ids) => (ids || []).map((x) => st.courses[x]?.name || "").filter(Boolean).join("/");
  const byNorm = new Map(courses.map((c) => [norm(c.name), c.id]));
  const ids = (text) => text.split("/").map((x) => byNorm.get(norm(x))).filter(Boolean);
  return formDialog({ title: id ? t("chr.cls.edit") : t("chr.cls.new"), ok: t("chr.save"), wide: true,
    extra: id ? html`<button type="button" class="btn btn-danger" data-del>${t("chr.delete")}</button>` : "",
    body: html`<div class="chr-grid">${field(t("chr.col.cls"), html`<input name="name" value="${k.name || ""}" required autofocus>`)}
      ${field(t("chr.col.course"), html`<select name="course">${opt("", "—", k.course)}${courses.map((c) => opt(c.id, c.name, k.course))}</select>`)}
      ${field(t("chr.cls.pool"), html`<input name="pool" value="${names(k.pool)}" placeholder="AB/BA">`, t("chr.cls.poolHint"))}
      ${relay ? field(t("chr.cls.legs"), html`<input name="legs" value="${(k.legs || []).map((l) => names(l.pool || [l.course])).join(" ; ")}" placeholder="A1/A2; B; C1/C2">`, t("chr.cls.legsHint")) : ""}
      ${field(t("chr.cls.first"), html`<input name="first" value="${clock(k.first)}" placeholder="10:00:00">`)}${field(t("chr.cls.step"), html`<input name="step" data-num value="${k.step ?? ""}">`, t("chr.cls.stepHint"))}
      ${field(t("chr.cls.maxTime"), html`<input name="maxTime" data-num value="${k.maxTime ? k.maxTime / 60 : ""}">`)}${field(t("chr.run.fee"), html`<input name="fee" data-num value="${k.fee ?? ""}">`)}
      ${k.ko ? "" : html`${field(t("chr.cls.teamSize"), html`<input name="teamSize" data-num value="${k.team?.size ?? ""}">`, t("chr.cls.teamSizeHint"))}${field(t("chr.cls.teamCount"), html`<input name="teamCount" data-num value="${k.team?.count ?? ""}">`, t("chr.cls.teamCountHint"))}`}</div>
      <label class="chr-check"><input type="checkbox" name="nc" ${k.nc ? raw("checked") : ""}> ${t("chr.cls.nc")}</label>`,
    onOpen(dlg) { dlg.querySelector("[data-del]")?.addEventListener("click", async () => { if (await confirmBox(t("chr.cls.delAsk", { name: k.name }), { ok: t("chr.delete") })) { ctx.put("classes", id, null); dlg.end(null); } }); },
    onOk(dlg) {
      const v = values(dlg), first = v.first ? parseClock(v.first) : null;
      if (!v.name) return false;
      if (v.first && first == null) { dlg.fail(t("chr.badTime")); return false; }
      const pool = ids(v.pool || ""), legs = relay && v.legs ? v.legs.split(";").map((x) => ids(x)).filter((a) => a.length).map((a, i) => ({ ...(a.length > 1 ? { pool: a } : { course: a[0] }), ...(k.legs?.[i]?.mass != null ? { mass: k.legs[i].mass } : {}) })) : [];
      ctx.put("classes", id || newId(), { name: v.name, course: v.course || null, pool: pool.length ? pool : null, legs: legs.length ? legs : null, first, step: v.step, maxTime: v.maxTime ? v.maxTime * 60 : null, fee: v.fee, nc: v.nc ? 1 : null,
        ...(k.ko ? {} : { team: !legs.length && v.teamSize > 1 ? { size: Math.round(v.teamSize), ...(v.teamCount > 0 && v.teamCount < v.teamSize ? { count: Math.round(v.teamCount) } : {}) } : null }) });
      return true;
    } });
}

function entriesPanel(ctx, S) {
  const st = ctx.st(), q = norm(S.q || "");
  let rows = Object.values(st.runners);
  if (q) rows = rows.filter((r) => `${norm(r.family)} ${norm(r.given)} ${norm(st.clubs[r.club]?.name)} ${norm(st.classes[r.cls]?.name)} ${r.card || ""} ${r.lic || ""} ${r.bib ?? ""}`.includes(q));
  if (!S.entries.sort) S.entries.sort = "name";
  return html`<div class="chr-card"><h3>${t("chr.prep.entries")} <small>${rows.length}${q ? ` / ${Object.keys(st.runners).length}` : ""}</small>
    <input type="search" class="chr-q" id="chr-ent-q" placeholder="${t("chr.search")}" value="${S.q || ""}"></h3>${table([
    { key: "name", label: t("chr.col.name"), get: who },
    { key: "club", label: t("chr.col.club"), get: (r) => st.clubs[r.club]?.name || "" },
    { key: "cls", label: t("chr.col.cls"), get: (r) => st.classes[r.cls]?.name || "", cell: (r) => (st.classes[r.cls] ? st.classes[r.cls].name : html`<span class="chr-warn">—</span>`) },
    { key: "card", label: t("chr.col.card"), num: 1, get: (r) => r.card || "", cell: (r) => html`${r.card || html`<span class="chr-warn">—</span>`}${r.rent ? html` <span class="chr-chip">${t("chr.run.rentTag")}</span>` : ""}` },
    { key: "lic", label: t("chr.run.lic"), get: (r) => r.lic || "" },
    { key: "bib", label: t("chr.col.bib"), num: 1, get: (r) => r.bib ?? "" },
    { key: "start", label: t("chr.col.start"), num: 1, get: (r) => clock(r.start), sort: (r) => r.start },
    { key: "paid", label: t("chr.run.paid"), get: (r) => (r.fee > 0 ? (r.paid ? "✓" : "—") : ""), cell: (r) => (r.fee > 0 ? (r.paid ? "✓" : html`<span class="chr-warn">${r.fee}</span>`) : "") },
    { key: "st", label: t("chr.run.status"), get: (r) => r.status || "", cell: (r) => (r.status ? statusTag(r.status) : "") },
  ], rows.slice(0, 800), { state: S.entries, empty: q ? t("chr.noMatch") : t("chr.ent.none") })}${rows.length > 800 ? html`<p class="chr-dim">${t("chr.ent.more", { n: rows.length - 800 })}</p>` : ""}</div>`;
}

function startsPanel(ctx, S) {
  const st = ctx.st(), rows = Object.values(st.runners).filter((r) => !st.classes[r.cls]?.legs?.length), rules = ctx.rules();
  const bad = checkStarts(st, { gap: rules.clubGap || 0 }), none = bad.filter((b) => b.kind === "none").length, same = bad.filter((b) => b.kind === "same"), club = bad.filter((b) => b.kind === "club");
  const flagged = new Set([...same, ...club].flatMap((b) => b.runners));
  if (!S.starts.sort) S.starts.sort = "start";
  const mode = st.event.startMode || "list";
  return html`<div class="chr-card"><h3>${t("chr.prep.starts")}</h3>
    ${mode !== "list" ? html`<p class="chr-note">${t(`chr.sta.mode.${mode}`)}</p>` : html`<p class="chr-checks-line">
      <span class="${none ? "chr-warn" : "chr-okc"}">${none ? tn("chr.sta.none", none) : t("chr.sta.allSet")}</span>
      ${same.length ? html`<span class="chr-warn">${tn("chr.sta.same", same.length)}</span>` : ""}${club.length ? html`<span class="chr-warn">${tn("chr.sta.club", club.length)}</span>` : ""}</p>`}
    ${table([
    { key: "start", label: t("chr.col.start"), num: 1, get: (r) => clock(r.start), sort: (r) => r.start },
    { key: "cls", label: t("chr.col.cls"), get: (r) => st.classes[r.cls]?.name || "" },
    { key: "course", label: t("chr.col.course"), get: (r) => st.courses[st.classes[r.cls]?.course]?.name || "" },
    { key: "name", label: t("chr.col.name"), get: who },
    { key: "club", label: t("chr.col.club"), get: (r) => st.clubs[r.club]?.name || "" },
    { key: "card", label: t("chr.col.card"), num: 1, get: (r) => r.card || "" },
  ], rows.slice(0, 1000), { state: S.starts, empty: t("chr.ent.none"), rowCls: (r) => (flagged.has(r.id) ? "chr-row-warn" : "") })}</div>`;
}
function drawDialog(ctx) {
  const st = ctx.st(), rules = ctx.rules(), classes = Object.values(st.classes).filter((k) => !k.legs?.length).sort(byName);
  return formDialog({ title: t("chr.sta.draw"), ok: t("chr.sta.doDraw"), wide: true,
    body: html`<div class="chr-grid">${field(t("chr.ev.zero"), html`<input name="first" value="${clock(st.event.zero ?? 36000)}">`)}
      ${field(t("chr.cls.step"), html`<input name="step" data-num value="${rules.step.forest}">`, t("chr.cls.stepHint"))}
      ${field(t("chr.sta.by"), html`<select name="by">${opt("course", t("chr.sta.byCourse"), rules.drawBy)}${opt("class", t("chr.sta.byClass"), rules.drawBy)}</select>`, t("chr.sta.byHint"))}
      ${field(t("chr.sta.gap"), html`<input name="gap" data-num value="${rules.clubGap}">`, t("chr.sta.gapHint"))}
      ${field(t("chr.sta.vacant"), html`<input name="vacant" data-num value="0">`, t("chr.sta.vacantHint"))}</div>
      <label class="chr-check"><input type="checkbox" name="keep"> ${t("chr.sta.keep")}</label>
      <fieldset class="chr-fs"><legend>${t("chr.prep.classes")} <button type="button" class="btn btn-sm" data-all>${t("chr.all")}</button> <button type="button" class="btn btn-sm" data-none>${t("chr.none")}</button></legend>
      <div class="chr-cols">${classes.map((k) => html`<label><input type="checkbox" data-cls="${k.id}" checked> ${k.name}</label>`)}</div></fieldset>`,
    onOpen(dlg) { const set = (v) => dlg.querySelectorAll("[data-cls]").forEach((c) => { c.checked = v; }); dlg.querySelector("[data-all]").onclick = () => set(true); dlg.querySelector("[data-none]").onclick = () => set(false); },
    onOk(dlg) {
      const v = values(dlg), first = parseClock(v.first), picked = [...dlg.querySelectorAll("[data-cls]:checked")].map((c) => c.dataset.cls);
      if (first == null || !(v.step > 0)) { dlg.fail(t("chr.badTime")); return false; }
      if (!picked.length) return false;
      const d = draw(st, { classes: picked, first, step: v.step, by: v.by, gap: v.gap || 0, vacant: v.vacant || 0, keep: v.keep, seed: Date.now() });
      for (let i = 0; i < d.rows.length; i += 400) ctx.log.add("many", { rows: d.rows.slice(i, i + 400) }, ctx.by);
      ctx.toast(t("chr.sta.done", { n: d.rows.length, last: clock(d.last) }), "ok");
      return true;
    } });
}

function kitPanel(ctx) {
  const D = ctx.devices, p = D.printer, st = ctx.st(), sand = ctx.sandbox();
  return html`<div class="chr-card"><h3>${t("chr.kit.readers")}</h3>
    ${serialOk() ? "" : html`<p class="chr-note chr-warn">${t("chr.dev.noSerial")}</p>`}
    ${D.readers.length ? html`<ul class="chr-devs">${D.readers.map((r) => html`<li><b>${r.label}</b> <span class="chr-chip ${r.state === "error" ? "bad" : "ok"}">${t(`chr.dev.st.${["opening", "error", "card", "reading"].includes(r.state) ? r.state : "ready"}`)}</span>
      ${r.info ? html`<span class="chr-dim">${[r.info.model, ["string", "number"].includes(typeof r.info.serial) && r.info.serial !== "" && `n° ${r.info.serial}`, r.info.mode, r.info.code != null && `code ${r.info.code}`].filter(Boolean).join(" · ")}</span>` : ""}${r.error ? html`<span class="chr-warn">${r.error}</span>` : ""}
      <button type="button" class="btn btn-sm" data-clockset="${r.id}">${t("chr.kit.setClock")}</button><button type="button" class="btn btn-sm" data-off="${r.id}">${t("chr.kit.unplug")}</button></li>`)}</ul>` : html`<p class="chr-dim">${t("chr.kit.noReader")}</p>`}
    <p class="chr-dim">${t("chr.kit.readerHint")}</p></div>
  <div class="chr-card"><h3>${t("chr.kit.printer")}</h3><div class="chr-grid" data-form="printer">
    ${field(t("chr.kit.prMode"), html`<select name="mode">${["none", "escpos", "system", ...(window.chronoApp ? ["app"] : [])].map((m) => opt(m, t(`chr.kit.pr.${m}`), p.mode))}</select>`)}
    ${field(t("chr.kit.prWidth"), html`<select name="width">${opt(32, "58 mm", p.width)}${opt(48, "80 mm", p.width)}</select>`)}
    ${p.mode === "escpos" ? field(t("chr.kit.prBaud"), html`<select name="baud">${[9600, 19200, 38400, 57600, 115200].map((b) => opt(b, b, p.baud))}</select>`) : ""}
    ${p.mode === "app" ? field(t("chr.kit.prName"), html`<select name="name" id="chr-pr-names">${opt(p.name || "", p.name || t("chr.kit.prDefault"), p.name)}</select>`) : ""}</div>
    <label class="chr-check"><input type="checkbox" id="chr-pr-auto" ${p.auto ? raw("checked") : ""}> ${t("chr.kit.prAuto")}</label>
    <p>${p.mode === "escpos" ? html`<button type="button" class="btn" id="chr-pr-port">${icon("plug", 14)} ${D.printerPort ? t("chr.kit.prPortOk") : t("chr.kit.prPort")}</button> ` : ""}
      <button type="button" class="btn" id="chr-pr-test" ${p.mode === "none" ? raw("disabled") : ""}>${icon("print", 14)} ${t("chr.kit.prTest")}</button> ${D.lastError ? html`<span class="chr-warn">${D.lastError}</span>` : ""}</p>
    <p class="chr-dim">${t("chr.kit.prHint")}</p></div>
  <div class="chr-card"><h3>${t("chr.kit.rehearse")}</h3><p>${t("chr.kit.rehearseHint")}</p>
    ${sand ? html`<p><button type="button" class="btn btn-primary" data-sim="1">${icon("card", 14)} ${t("chr.kit.sim1")}</button> <button type="button" class="btn" data-sim="10">${t("chr.kit.sim10")}</button>
      <button type="button" class="btn" data-sim="unknown">${t("chr.kit.simUnknown")}</button> <button type="button" class="btn" id="chr-sim-end">${t("chr.sand.leave")}</button></p>
      <p class="chr-dim">${t("chr.kit.simLeft", { n: ctx.view().counts.entries - ctx.view().counts.read })}</p>`
    : html`<p><button type="button" class="btn btn-primary" id="chr-sim-go">${icon("play", 14)} ${t("chr.kit.rehearseGo")}</button>${Object.keys(st.runners).length ? "" : html` <span class="chr-dim">${t("chr.kit.demoNote")}</span>`}</p>`}</div>`;
}
function bindKit(ctx, el) {
  const D = ctx.devices, act = (fn) => async () => { try { await fn(); } catch (e) { ctx.toast(e?.message === "noserial" ? t("chr.dev.noSerial") : `${t("chr.failed")} ${e?.message || e}`, "stop"); } ctx.refresh(); };
  el.querySelectorAll("[data-off]").forEach((b) => b.addEventListener("click", act(() => D.disconnect(Number(b.dataset.off)))));
  el.querySelectorAll("[data-clockset]").forEach((b) => b.addEventListener("click", act(async () => { await D.setClock(Number(b.dataset.clockset)); ctx.toast(t("chr.kit.clockDone"), "ok"); })));
  el.querySelectorAll("[data-form=printer] [name]").forEach((inp) => inp.addEventListener("change", () => D.setPrinter({ [inp.name]: ["width", "baud"].includes(inp.name) ? Number(inp.value) : inp.value })));
  el.querySelector("#chr-pr-auto")?.addEventListener("change", (e) => D.setPrinter({ auto: e.target.checked }));
  el.querySelector("#chr-pr-port")?.addEventListener("click", act(() => D.pickPrinterPort()));
  el.querySelector("#chr-pr-test")?.addEventListener("click", act(async () => {
    const v = ctx.view(), row = [...v.byRunner.values()].find((r) => r.read) || { given: "Alix", family: "Essai", club: "Balise d'Essai", clsName: "H21", card: 500100, bib: "", start: 36000, finish: 38467, time: 2467, status: "ok", place: 1, behind: 0, splits: [{ code: 31, t: 300, leg: 300, lp: 1 }, { code: 32, t: 760, leg: 460, lp: 2 }], missing: [], extra: [] };
    const course = v.courses.find((c) => c.id === row.course) || { name: "A", length: 5200 };
    if (await D.printReceipt(row, { event: v.event.name ? v.event : { name: t("chr.kit.prTest") }, course, of: 12 })) ctx.toast(t("chr.kit.prSent"), "ok");
  }));
  window.chronoApp?.printers?.().then((list) => { const s = el.querySelector("#chr-pr-names"); if (s && list?.length) s.innerHTML = list.map((x) => opt(x.name, x.name + (x.isDefault ? " ★" : ""), D.printer.name || (x.isDefault ? x.name : ""))).join(""); }).catch(() => {});
  el.querySelector("#chr-sim-go")?.addEventListener("click", () => { ctx.enterSandbox(); if (!Object.keys(ctx.st().runners).length) { importSet(ctx.log, demoSet()); const d = draw(ctx.st(), { first: ctx.st().event.zero ?? 36000, step: 120, by: "course", gap: 1 }); ctx.log.add("many", { rows: d.rows }); } });
  el.querySelector("#chr-sim-end")?.addEventListener("click", () => ctx.leaveSandbox());
  el.querySelectorAll("[data-sim]").forEach((b) => b.addEventListener("click", () => {
    const st = ctx.st(), v = ctx.view();
    if (b.dataset.sim === "unknown") { const any = Object.values(st.runners)[0]; if (any) ctx.card({ ...fakeRead(st, any), card: 999000 + Math.floor(Math.random() * 999) }); return; }
    const left = Object.values(st.runners).filter((r) => r.card && !v.byRunner.get(r.id)?.read).sort((a, b) => (a.start ?? 0) - (b.start ?? 0));
    for (const r of left.slice(0, Number(b.dataset.sim))) { const x = Math.random(); ctx.card(fakeRead(st, r, { fault: x < 0.1 ? "mp" : x < 0.14 ? "dnf" : x < 0.2 ? "extra" : "" })); }
    if (!left.length) ctx.toast(t("chr.kit.simNone"), "warn");
  }));
}

function netPanel(ctx) {
  const N = ctx.net, e = ctx.st().event, share = e.cloud?.token;
  return html`<div class="chr-card"><h3>${t("chr.net.station")}</h3><div class="chr-grid">${field(t("chr.net.name"), html`<input id="chr-st-name" value="${ctx.ui.name || ""}" placeholder="${t("chr.net.namePh")}">`, t("chr.net.nameHint"))}</div></div>
  <div class="chr-card"><h3>${t("chr.net.cloud")}</h3><p>${t(`chr.net.long.${N.cloud.state}`)}${N.cloud.last ? ` ${t("chr.net.last", { at: atClock(N.cloud.last) })}` : ""}${N.pending() ? ` ${tn("chr.net.pending", N.pending())}` : ""}</p>
    <p><button type="button" class="btn" id="chr-sync" ${N.cloud.state === "off" ? raw("disabled") : ""}>${icon("cloud", 14)} ${t("chr.net.syncNow")}</button>
    ${N.cloud.on ? html` <button type="button" class="btn" id="chr-share">${icon("link", 14)} ${share ? t("chr.net.shared") : t("chr.net.share")}</button>` : ""}</p>
    <p class="chr-dim">${t("chr.net.cloudHint")}</p>
    <label class="chr-check"><input type="checkbox" id="chr-live" ${e.live ? raw("checked") : ""} ${N.cloud.state === "off" ? raw("disabled") : ""}> ${t("chr.net.live")}</label>
    <p class="chr-dim">${t("chr.net.liveHint")}${N.live.state === "ok" ? ` ${t("chr.net.liveOk", { at: atClock(N.live.last) })}` : N.live.state === "error" ? ` ${t("chr.net.liveErr")}` : ""}</p></div>
  <div class="chr-card"><h3>${t("chr.net.hub")}</h3>${lanBlock(ctx)}
    ${N.local() || served() ? "" : html`<p>${t(`chr.hub.long.${N.hub.state}`)} ${N.hub.url ? html`<code>${N.hub.url.replace(/\?.*$/, "")}</code>` : ""}</p>
    <p>${N.hub.state === "off" ? html`<button type="button" class="btn" id="chr-hub-find">${icon("search", 14)} ${t("chr.net.findApp")}</button> ` : html`<button type="button" class="btn" id="chr-hub-off">${t("chr.net.leaveHub")}</button> `}
    </p>
    <p class="chr-dim">${t("chr.net.hubHint")}</p>`}
    ${window.chronoApp ? "" : html`<p><button type="button" class="btn" id="chr-app-dl">${icon("down", 14)} ${t("chr.app.get")}</button> <span class="chr-dim">${t("chr.app.getHint")}</span></p>`}</div>
  <div class="chr-card"><h3>${t("chr.net.file")}</h3><p><button type="button" class="btn" id="chr-file-out">${icon("down", 14)} ${t("chr.net.fileOut")}</button>
    <button type="button" class="btn" id="chr-file-in">${icon("up", 14)} ${t("chr.net.fileIn")}</button>${"showDirectoryPicker" in window ? html` <button type="button" class="btn" id="chr-journal">${icon("file", 14)} ${ctx.ui.journal ? t("chr.net.journalOn") : t("chr.net.journal")}</button>` : ""}</p>
    <p class="chr-dim">${t("chr.net.fileHint")}</p></div>`;
}
/** In the app (or a page linked to the app on this computer): the event's code, the computers linked, the address for phones. */
/** A page another computer's app serves (a phone, a screen): it follows the race, it does not link computers. */
const served = () => typeof location !== "undefined" && location.protocol === "http:" && !/^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(location.host);
function lanBlock(ctx) {
  const N = ctx.net, i = N.hub.info, code = ctx.st().event.lan;
  // Ozimut's tab, not linked to an app: the code the arena's computers will type, nothing else
  if (!served() && !N.local() && code && (N.hub.state !== "on" || !i)) return html`<div class="chr-lan-code"><span>${t("chr.lan.code")}</span><b>${code}</b></div><p class="chr-dim">${t("chr.lan.codeTab")}</p>`;
  if (N.hub.state !== "on" || !i) return "";
  if (served()) return html`<p>${t("chr.lan.served", { name: i.name || "" })}</p>`;
  const linked = N.linked(), others = (i.peers?.hubs || []).filter((h) => !linked.some((l) => l.station === h.station));
  // every computer of the arena on the same version: those known to run another one are named
  const odd = [...linked, ...others].filter((h) => h.ver && i.version && h.ver !== i.version);
  const phone = (i.addresses || [])[0] ? `http://${i.addresses[0]}:${i.port}/?k=${encodeURIComponent(i.token || "")}` : "";
  return html`${code ? html`<div class="chr-lan-code"><span>${t("chr.lan.code")}</span><b>${code}</b></div><p class="chr-dim">${t("chr.lan.codeHint")}</p>` : ""}
    ${linked.length ? html`<p><b>${t("chr.colon", { a: tn("chr.lan.linked", linked.length) })}</b> ${linked.map((l) => l.name || l.host).join(", ")}</p>` : ""}
    ${!linked.length ? html`<p class="chr-dim">${t("chr.lan.alone")}</p>` : ""}
    ${others.length ? html`<p class="chr-dim">${t("chr.lan.others", { names: others.map((h) => h.name).join(", ") })}</p>` : ""}
    ${odd.length ? html`<p class="chr-warn">${icon("alert", 14)} ${t("chr.lan.versions", { list: odd.map((h) => `${h.name || h.host} ${h.ver}`).join(", "), mine: i.version })}</p>` : ""}
    ${phone ? html`<p>${t("chr.lan.phones")} <code class="chr-sel">${phone}</code></p>` : ""}
    ${N.local() ? html`<details class="chr-more"><summary>${t("chr.lan.manual")}</summary><p class="chr-dim">${t("chr.lan.manualHint")}</p>
      <p><input id="chr-peer-host" class="chr-in-l" placeholder="192.168.1.20:8377"> <input id="chr-peer-key" class="chr-in-m" placeholder="${t("chr.net.key")}"> <button type="button" class="btn" id="chr-peer-add">${t("chr.net.join")}</button></p></details>` : ""}`;
}
function bindNet(ctx, el, store) {
  const N = ctx.net;
  el.querySelector("#chr-st-name")?.addEventListener("change", (e) => { ctx.ui.name = e.target.value.trim(); try { localStorage.setItem(`oz.chrono.ui.${ctx.ev}`, JSON.stringify({ post: ctx.ui.post, name: ctx.ui.name })); } catch (err) { /* this visit */ } ctx.refresh(); });
  el.querySelector("#chr-sync")?.addEventListener("click", () => N.sync());
  el.querySelector("#chr-share")?.addEventListener("click", async () => {
    try { const tok = ctx.st().event.cloud?.token || await N.shareCloud(); await alertBox(t("chr.net.shareDone", { token: tok.slice(0, 6) })); } catch (e) { ctx.toast(`${t("chr.failed")} ${e.message}`, "stop"); }
  });
  el.querySelector("#chr-live")?.addEventListener("change", (e) => ctx.setEvent({ live: e.target.checked ? 1 : null }));
  el.querySelector("#chr-hub-find")?.addEventListener("click", async () => { const info = await N.findApp(); if (info) N.joinHub(`ws://127.0.0.1:${info.port}/hub`); else ctx.toast(t("chr.net.noApp"), "warn"); });
  el.querySelector("#chr-hub-off")?.addEventListener("click", () => N.leaveHub());
  el.querySelector("#chr-peer-add")?.addEventListener("click", async () => {
    const v = el.querySelector("#chr-peer-host").value.trim().replace(/^(ws|http)s?:\/\//, "").replace(/\/.*$/, ""), k = el.querySelector("#chr-peer-key").value.trim();
    const m = /^(.*?)(?::(\d+))?$/.exec(v);
    if (!m?.[1]) return;
    const how = await N.addPeer(m[1], Number(m[2]) || 8377, k).catch(() => "unreachable");
    ctx.toast(t(`chr.lan.res.${how === "ok" ? "ok" : how === "code" ? "key" : "unreachable"}`), how === "ok" ? "ok" : "stop");
    ctx.refresh();
  });
  el.querySelector("#chr-app-dl")?.addEventListener("click", () => appDialog());
  el.querySelector("#chr-hub-join")?.addEventListener("click", () => { const v = el.querySelector("#chr-hub-url").value.trim().replace(/^(ws|http)s?:\/\//, "").replace(/\/.*$/, ""); const k = el.querySelector("#chr-hub-key").value.trim(); if (v) N.joinHub(`ws://${v}/hub${k ? `?k=${encodeURIComponent(k)}` : ""}`); });
  el.querySelector("#chr-file-out")?.addEventListener("click", () => download(eventFileName(ctx.log, ctx.ev), toFile(ctx.log, ctx.ev), "application/json"));
  el.querySelector("#chr-file-in")?.addEventListener("click", async () => importFiles(ctx, await pickFiles(".ozchrono,.jsonl")));
  el.querySelector("#chr-journal")?.addEventListener("click", async () => {
    try { const dir = await window.showDirectoryPicker({ mode: "readwrite", id: "ozchrono" }); ctx.ui.journal = await ctx.journal(dir); ctx.toast(t("chr.net.journalDone"), "ok"); } catch (e) { if (e?.name !== "AbortError") ctx.toast(`${t("chr.failed")} ${e.message}`, "stop"); }
    ctx.refresh();
  });
}

function checks(ctx) {
  const st = ctx.st(), R = Object.values(st.runners), K = Object.values(st.classes), C = Object.values(st.courses), list = st.event.startMode !== "mass" && st.event.startMode !== "punch";
  const usedK = K.filter((k) => R.some((r) => r.cls === k.id));
  const held = new Map(); for (const r of R) if (r.card) (held.get(r.card) || held.set(r.card, new Set()).get(r.card)).add(personOf(st, r.id));
  const dup = new Map([...held].map(([card, who]) => [card, who.size]));
  const n = (f) => R.filter(f).length;
  return [
    { step: "event", ok: !!(st.event.name && st.event.date), text: t("chr.chk.event") },
    { step: "courses", ok: C.length > 0 && C.every((c) => c.controls?.length), text: C.length ? tn("chr.chk.courses", C.filter((c) => !c.controls?.length).length) : t("chr.chk.noCourses") },
    { step: "classes", ok: usedK.every((k) => k.course || k.pool?.length || k.legs?.length), text: tn("chr.chk.classes", usedK.filter((k) => !(k.course || k.pool?.length || k.legs?.length)).length) },
    { step: "entries", ok: R.length > 0 && !n((r) => !r.cls), text: R.length ? tn("chr.chk.noCls", n((r) => !r.cls)) : t("chr.chk.noEntries") },
    { step: "entries", ok: !n((r) => !r.card), warn: true, text: tn("chr.chk.noCard", n((r) => !r.card)) },
    { step: "entries", ok: ![...dup.values()].some((x) => x > 1), warn: true, text: tn("chr.chk.dupCard", [...dup.values()].filter((x) => x > 1).length) },
    ...(list ? [{ step: "starts", ok: !n((r) => r.start == null && r.status !== "dns" && !st.classes[r.cls]?.legs), text: tn("chr.chk.noStart", n((r) => r.start == null && r.status !== "dns" && !st.classes[r.cls]?.legs)) }] : []),
    ...(hasTeams(st) ? [{ step: "teams", ok: !Object.values(st.teams).some((tm) => { const k = st.classes[tm.cls]; return !k || (tm.runners || []).filter((id) => st.runners[id]).length < (k.legs?.length || k.team?.size || 1); }), warn: true,
      text: tn("chr.chk.teams", Object.values(st.teams).filter((tm) => { const k = st.classes[tm.cls]; return !k || (tm.runners || []).filter((id) => st.runners[id]).length < (k.legs?.length || k.team?.size || 1); }).length) }] : []),
    { step: "kit", ok: ctx.devices.readers.some((r) => r.state !== "error"), warn: true, text: t("chr.chk.reader") },
    { step: "kit", ok: ctx.devices.printer.mode !== "none", warn: true, text: t("chr.chk.printer") },
    { step: "net", ok: ctx.net.cloud.state === "ok" || (ctx.net.hub.state === "on" && (!ctx.net.local() || ctx.net.linked().length > 0)) || !!ctx.ui.journal, warn: true, text: t("chr.chk.copy") },
  ];
}
function checkPanel(ctx) {
  const list = checks(ctx), bad = list.filter((c) => !c.ok && !c.warn).length;
  return html`<div class="chr-card"><h3>${t("chr.prep.check")}</h3><p class="${bad ? "chr-warn" : "chr-okc"}">${bad ? tn("chr.chk.bad", bad) : t("chr.chk.ready")}</p>
    <ul class="chr-chk">${list.map((c) => html`<li class="${c.ok ? "ok" : c.warn ? "warn" : "bad"}">${icon(c.ok ? "check" : "alert", 16)} <span>${c.ok ? t(`chr.chk.ok.${c.step}`) : c.text}</span>
      ${c.ok ? "" : html`<button type="button" class="btn btn-sm" data-step="${c.step}">${t("chr.chk.go")}</button>`}</li>`)}</ul>
    <p><button type="button" class="btn btn-primary" data-go="finish">${icon("flag", 14)} ${t("chr.chk.toFinish")}</button></p></div>`;
}

export const post = {
  ribbon(ctx) {
    const s = ctx.ui.prepStep || "event", imp = { icon: "up", label: t("chr.rb.import"), tip: t("chr.rb.importTip"), primary: true, on: async () => importFiles(ctx, await pickFiles(".xml,.csv,.txt,.meosxml,.ozchrono,.jsonl", true)) };
    const v = () => exportView(ctx.view(), "class");
    const groups = {
      event: [{ label: t("chr.rb.data"), items: [imp] }],
      courses: [{ label: t("chr.prep.courses"), items: [imp, { icon: "plus", label: t("chr.crs.new"), on: () => courseDialog(ctx, null) }] }],
      classes: [{ label: t("chr.prep.classes"), items: [{ icon: "plus", label: t("chr.cls.new"), primary: true, on: () => classDialog(ctx, null) },
        { icon: "list", label: t("chr.cls.perCourse"), tip: t("chr.cls.perCourseTip"), on: () => {
          const st = ctx.st(), have = new Set(Object.values(st.classes).map((k) => norm(k.name))), rows = Object.values(st.courses).filter((c) => !have.has(norm(c.name))).map((c) => ["classes", newId(), { name: c.name, course: c.id }]);
          if (rows.length) ctx.log.add("many", { rows }, ctx.by);
          ctx.toast(tn("chr.cls.made", rows.length), "ok");
        } },
        { icon: "users", label: t("chr.cls.byAge"), tip: t("chr.cls.byAgeTip"), on: async () => {
          const R = ctx.rules(), st = ctx.st(), have = new Set(Object.values(st.classes).map((k) => norm(k.name)));
          const names = R.sexes.flatMap((s) => R.ages.map((a) => R.catOf(new Date().getFullYear() - a, s === R.sexes[0] ? "M" : "F", new Date().getFullYear()))).filter((x, i, a) => x && a.indexOf(x) === i && !have.has(norm(x)));
          if (!names.length || !(await confirmBox(t("chr.cls.byAgeAsk", { n: names.length }), { ok: t("chr.create") }))) return;
          ctx.log.add("many", { rows: names.map((name) => ["classes", newId(), { name }]) }, ctx.by);
        } }] }],
      entries: [{ label: t("chr.prep.entries"), items: [imp, { icon: "plus", label: t("chr.run.new"), on: () => runnerDialog(ctx, null) }] },
        { label: t("chr.rb.archive"), items: [{ icon: "users", label: ctx.archive?.length ? tn("chr.arch.loaded", ctx.archive.length) : t("chr.arch.load"), tip: t("chr.arch.tip"), on: async () => {
          const [f] = await pickFiles(".csv,.txt,.xml");
          if (!f) return;
          const bytes = new Uint8Array(await f.arrayBuffer()), text = decodeText(bytes), res = /<\w+list/i.test(text.slice(0, 500)) ? readIof(text) : readCsv(bytes);
          if (!res?.set?.runners?.length) { await alertBox(t("chr.imp.unknown", { name: f.name })); return; }
          ctx.archive = res.set.runners.map((r) => ({ lic: r.lic || "", family: r.family, given: r.given, club: r.club || "", clubCode: r.clubCode || "", card: r.card || "", sex: r.sex || "", birth: r.birth || "", cat: r.cls || "" }));
          await kvSet(`archive:${ctx.rules().id}`, ctx.archive);
          ctx.toast(tn("chr.arch.loaded", ctx.archive.length), "ok");
        } }, { icon: "card", label: t("chr.arch.fill"), tip: t("chr.arch.fillTip"), disabled: !ctx.archive?.length, on: () => {
          const by = new Map(ctx.archive.filter((p) => p.lic && p.card).map((p) => [String(p.lic), p.card]));
          const rows = Object.values(ctx.st().runners).filter((r) => !r.card && r.lic && by.has(String(r.lic))).map((r) => ["runners", r.id, { card: Number(by.get(String(r.lic))) }]);
          if (rows.length) ctx.log.add("many", { rows }, ctx.by);
          ctx.toast(tn("chr.arch.filled", rows.length), "ok");
        } }] },
        { label: t("chr.rb.export"), items: [{ icon: "down", label: "IOF XML", tip: t("chr.exp.entries"), on: () => download("entries.xml", writeEntries(v()), "application/xml") }] }],
      teams: [{ label: t("chr.prep.teams"), items: [{ icon: "plus", label: t("chr.team.new"), primary: true, on: () => teamDialog(ctx, null) }, imp,
        { icon: "list", label: t("chr.team.number"), tip: t("chr.team.numberTip"), on: () => numberTeams(ctx) }] },
        ...(Object.values(ctx.st().classes).some((k) => k.legs?.length > 1) ? [{ label: t("chr.ev.type.relay"), items: [{ icon: "clock", label: t("chr.rst.title"), tip: t("chr.rst.tip"), on: () => restartDialog(ctx) }] }] : [])],
      starts: [{ label: t("chr.prep.starts"), items: [{ icon: "dice", label: t("chr.sta.draw"), primary: true, disabled: (ctx.st().event.startMode || "list") !== "list", on: () => drawDialog(ctx) },
        { icon: "trash", label: t("chr.sta.clear"), on: async () => { if (!(await confirmBox(t("chr.sta.clearAsk"), { ok: t("chr.sta.clear") }))) return; const rows = Object.values(ctx.st().runners).filter((r) => r.start != null).map((r) => ["runners", r.id, { start: null }]); if (rows.length) ctx.log.add("many", { rows }, ctx.by); } }] },
        { label: t("chr.rb.print"), items: [
          { icon: "print", label: t("chr.sta.prClass"), on: () => printHtml(startsHtml(ctx.view(), ctx.view().classes, listLabels(t("chr.lst.starts")))) },
          { icon: "print", label: t("chr.sta.prCourse"), on: () => printHtml(startsHtml(ctx.view(), ctx.view().courses, listLabels(t("chr.lst.starts")), { cat: true })) },
          { icon: "clock", label: t("chr.sta.prMinute"), tip: t("chr.sta.prMinuteTip"), on: () => printHtml(minutesHtml(ctx.view(), listLabels(t("chr.lst.minutes")))) },
          { icon: "users", label: t("chr.sta.prClub"), on: () => printHtml(clubsHtml(ctx.view(), listLabels(t("chr.lst.clubs")))) },
          { icon: "edit", label: t("chr.dsg.open"), tip: t("chr.dsg.openTip"), on: async () => (await import("./designer.js")).designerDialog(ctx) }] },
        { label: t("chr.rb.formats"), items: [
          { icon: "swap", label: t("chr.ko.title"), tip: t("chr.ko.tip"), on: () => knockoutDialog(ctx) },
          { icon: "list", label: t("chr.ser.short"), tip: t("chr.ser.tip"), on: () => seriesDialog(ctx) },
          { icon: "go", label: t("chr.cha.title"), tip: t("chr.cha.tip"), on: () => chaseDialog(ctx) }] },
        { label: t("chr.rb.export"), items: [{ icon: "down", label: "IOF XML", tip: t("chr.exp.starts"), on: () => download("startlist.xml", writeStarts(v()), "application/xml") }] }],
      kit: [{ label: t("chr.kit.readers"), items: [{ icon: "plug", label: "SPORTident", primary: true, tip: t("chr.kit.plugTip"), on: () => ctx.devices.connect("si") }, { icon: "plug", label: "Emit", tip: t("chr.kit.plugTip"), on: () => ctx.devices.connect("emit") },
        { icon: "plug", label: "Emit eScan", tip: t("chr.kit.escanTip"), on: () => ctx.devices.connect("emit", "escan") }] }],
      net: [], check: [],
    };
    return groups[s] || [];
  },
  mount(ctx, el) {
    const S = { courses: {}, classes: {}, entries: {}, teams: {}, starts: {}, q: "", tq: "" };
    el.innerHTML = html`<ol class="chr-steps" id="chr-steps"></ol><div id="chr-panel" class="chr-panel"></div>`.toString();
    const panel = el.querySelector("#chr-panel");
    const go = (s) => { ctx.ui.prepStep = s; drawAll(true); ctx.refresh(); };
    function drawSteps() {
      const steps = stepsOf(ctx);
      if (!steps.includes(ctx.ui.prepStep)) ctx.ui.prepStep = "event";
      const cur = ctx.ui.prepStep || "event", bad = new Set(checks(ctx).filter((c) => !c.ok && !c.warn).map((c) => c.step));
      el.querySelector("#chr-steps").innerHTML = steps.map((s, i) => html`<li><button type="button" data-step="${s}" aria-current="${s === cur ? raw("step") : raw("false")}" class="${bad.has(s) ? "todo" : ""}"><i>${i + 1}</i>${t(`chr.prep.${s}`)}</button></li>`).join("");
      el.querySelectorAll("#chr-steps button").forEach((b) => b.addEventListener("click", () => go(b.dataset.step)));
    }
    function drawAll(force = false) {
      drawSteps();
      const a = document.activeElement;
      if (!force && panel.contains(a) && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName)) return;            // never under someone's typing
      const s = ctx.ui.prepStep || "event", keep = panel.querySelector(".table-wrap")?.scrollTop || 0;
      panel.innerHTML = String({ event: eventPanel, courses: (c) => coursesPanel(c, S), classes: (c) => classesPanel(c, S), entries: (c) => entriesPanel(c, S), teams: (c) => teamsPanel(c, S), starts: (c) => startsPanel(c, S), kit: kitPanel, net: netPanel, check: checkPanel }[s](ctx));
      const tw = panel.querySelector(".table-wrap"); if (tw) tw.scrollTop = keep;
      if (s === "event") bindEvent(ctx, panel);
      if (s === "courses") bindTable(panel, S.courses, () => drawAll(true), (id) => courseDialog(ctx, id));
      if (s === "classes") bindTable(panel, S.classes, () => drawAll(true), (id) => classDialog(ctx, id));
      if (s === "entries") {
        bindTable(panel, S.entries, () => drawAll(true), (id) => runnerDialog(ctx, id));
        const q = panel.querySelector("#chr-ent-q");
        q.addEventListener("input", () => { S.q = q.value; const at = q.selectionStart; drawAll(true); const n = panel.querySelector("#chr-ent-q"); n.focus(); n.setSelectionRange(at, at); });
      }
      if (s === "teams") {
        bindTable(panel, S.teams, () => drawAll(true), (id) => teamDialog(ctx, id));
        const q = panel.querySelector("#chr-team-q");
        q.addEventListener("input", () => { S.tq = q.value; const at = q.selectionStart; drawAll(true); const n = panel.querySelector("#chr-team-q"); n.focus(); n.setSelectionRange(at, at); });
      }
      if (s === "starts") bindTable(panel, S.starts, () => drawAll(true), (id) => runnerDialog(ctx, id));
      if (s === "kit") bindKit(ctx, panel);
      if (s === "net") bindNet(ctx, panel);
      if (s === "check") { panel.querySelectorAll("[data-step]").forEach((b) => b.addEventListener("click", () => go(b.dataset.step))); panel.querySelector("[data-go]")?.addEventListener("click", () => ctx.go("finish")); }
    }
    drawAll(true);
    return { update: () => drawAll(false) };
  },
};
