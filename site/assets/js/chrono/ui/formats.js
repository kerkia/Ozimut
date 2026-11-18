// The race formats beyond one individual race: the knockout's rounds (heats made from a ranking), the totals over several
// days (the stages kept, how they are added, the general ranking) and the chase start of the last day.

import { t, tn, locale } from "../../i18n.js";
import { confirmBox, alertBox } from "../../askbox.js";
import { html, raw, icon, formDialog, values, field, opt, pickFiles, download, printHtml, openPage } from "./kit.js";
import { clock, parseClock } from "../times.js";
import { newId } from "../log.js";
import { qualified, planRound, koTree, koRanking, dropRound } from "../knockout.js";
import { stagesOf, stageFromSet, stageFromOps, totals, chaseStarts } from "../series.js";
import { readIof } from "../io/iofxml.js";
import { readCsv } from "../io/oecsv.js";
import { decodeText } from "../xml.js";
import { fromFile, listEvents, loadOps } from "../store.js";
import { koHtml, totalsHtml, totalsCsv } from "../print/lists.js";

const byName = (a, b) => String(a.name).localeCompare(String(b.name), undefined, { numeric: true });
const many = (ctx, rows) => { for (let i = 0; i < rows.length; i += 400) ctx.log.add("many", { rows: rows.slice(i, i + 400) }, ctx.by); };

/** The labels the knockout's and the totals' pages need, beyond the lists' own. */
export function formatLabels(L) {
  return { ...L, heat: t("chr.ko.heat"), final: t("chr.ko.ranking"), round: t("chr.ko.round"), total: t("chr.ser.total"), stage: t("chr.ser.stage"), team: t("chr.team.name") };
}

/** A knockout round made from a ranking: a qualification's, or the round before. */
export function knockoutDialog(ctx) {
  const st = ctx.st(), v = ctx.view(), tree = koTree(st, v);
  const quals = v.classes.filter((k) => k.id && !st.classes[k.id].ko && !k.teams && k.rows.some((r) => r.place));
  const sources = quals.map((k) => ({ v: `q:${k.id}`, label: t("chr.ko.fromQual", { name: k.name }), base: k.id, round: 1 }))
    .concat(tree.map((b) => { const last = b.rounds[b.rounds.length - 1]; return { v: `r:${b.base}`, label: t("chr.ko.fromRound", { name: b.name, round: last.label || last.round }), base: b.base, round: last.round + 1, prev: last.round }; }));
  if (!sources.length) return alertBox(t("chr.ko.noSource"));
  const courses = Object.values(st.courses).sort(byName), presets = ["chr.ko.r.r1", "chr.ko.r.r16", "chr.ko.r.qf", "chr.ko.r.sf", "chr.ko.r.f"].map((k) => t(k));
  const src = (dlg) => sources.find((s) => s.v === dlg.querySelector("[name=src]").value) || sources[0];
  const listOf = (s, lucky) => qualified(st, v, s.prev != null ? { base: s.base, prev: s.prev, lucky } : { from: [s.base] });
  return formDialog({ title: t("chr.ko.title"), ok: t("chr.ko.make"), wide: true,
    body: html`<p>${t("chr.ko.lede")}</p><div class="chr-grid">
      ${field(t("chr.ko.from"), html`<select name="src">${sources.map((s) => opt(s.v, s.label, sources[sources.length - 1].v))}</select>`)}
      ${field(t("chr.ko.label"), html`<input name="label" list="chr-ko-labels" value="${presets[3]}"><datalist id="chr-ko-labels">${presets.map((p) => html`<option value="${p}">`)}</datalist>`)}
      ${field(t("chr.ko.heats"), html`<input name="heats" data-num value="2">`)}
      ${field(t("chr.ko.size"), html`<input name="size" data-num value="6">`)}
      ${field(t("chr.ko.up"), html`<input name="up" data-num value="3">`, t("chr.ko.upHint"))}
      ${field(t("chr.ko.lucky"), html`<input name="lucky" data-num value="0">`, t("chr.ko.luckyHint"))}
      ${field(t("chr.col.course"), html`<select name="course">${opt("", "—", "")}${courses.map((c) => opt(c.id, c.name, ""))}</select>`)}
      ${field(t("chr.ko.first"), html`<input name="first" value="${clock(Math.ceil((ctx.now() + 900) / 300) * 300)}">`)}
      ${field(t("chr.ko.gap"), html`<input name="gap" data-num value="5">`, t("chr.ko.gapHint"))}</div>
      <p id="chr-ko-sum" class="chr-note"></p>`,
    onOpen(dlg) {
      const sum = () => {
        const x = values(dlg), s = src(dlg), n = listOf(s, s.prev != null ? x.lucky || 0 : 0).length, places = (x.heats || 1) * (x.size || 6);
        dlg.querySelector("#chr-ko-sum").textContent = t(n > places ? "chr.ko.sumOver" : "chr.ko.sum", { n, heats: x.heats || 1, size: Math.ceil(Math.min(n, places) / (x.heats || 1)), out: Math.max(0, n - places) });
        dlg.querySelector("[name=lucky]").closest("label").hidden = s.prev == null;
      };
      dlg.querySelectorAll("input, select").forEach((el) => el.addEventListener("input", sum));
      sum();
    },
    async onOk(dlg) {
      const x = values(dlg), s = src(dlg), first = parseClock(x.first);
      if (first == null) { dlg.fail(t("chr.badTime")); return false; }
      if (!(x.heats >= 1) || !(x.size >= 2)) { dlg.fail(t("chr.ko.bad")); return false; }
      const rows = [];
      if (Object.values(st.classes).some((k) => k.ko && k.ko.base === s.base && k.ko.round === s.round)) {
        const drop = dropRound(st, s.base, s.round);
        if (!drop) { dlg.fail(t("chr.ko.ran")); return false; }
        if (!(await confirmBox(t("chr.ko.replaceAsk"), { ok: t("chr.ko.replace") }))) return false;
        rows.push(...drop);
      }
      const plan = planRound(st, v, { base: s.base, round: s.round, label: x.label, ...(s.prev != null ? { prev: s.prev, lucky: x.lucky || 0 } : { from: [s.base] }),
        heats: x.heats, size: x.size, up: x.up || 0, course: x.course || null, first, gap: Math.round((x.gap || 0) * 60) });
      if (!plan.heats.some((h) => h.length)) { dlg.fail(t("chr.ko.nobody")); return false; }
      many(ctx, rows.concat(plan.rows));
      ctx.toast(t("chr.ko.done", { heats: plan.heats.length, n: plan.heats.reduce((a, h) => a + h.length, 0) }), "ok");
      return true;
    } });
}

/** The knockouts as a page: each round's heats, then the final ranking. */
export function knockoutPage(ctx, L) {
  const st = ctx.st(), v = ctx.view(), tree = koTree(st, v);
  return koHtml(v, tree.map((b) => ({ ...b, ranking: koRanking(st, v, b.base) })), formatLabels(L));
}
export const hasKnockout = (ctx) => Object.values(ctx.st().classes).some((k) => k.ko);

async function stageFromFile(f) {
  const bytes = new Uint8Array(await f.arrayBuffer()), text = decodeText(bytes), head = text.slice(0, 600).toLowerCase();
  if (/\.(ozchrono|jsonl)$/i.test(f.name) || head.startsWith('{"format":"ozimut-chrono"')) { const d = fromFile(text); return stageFromOps(d.ops, { name: d.event?.name || f.name.replace(/\.\w+$/, ""), date: d.event?.date || "" }); }
  let set = null;
  if (head.includes("<meosdata")) set = (await import("../io/meosxml.js")).readMeos(text).set;
  else if (head.includes("<?xml") || /<resultlist\b/.test(head)) set = readIof(text)?.set;
  else set = readCsv(bytes)?.set;
  if (!set) return null;
  const sg = stageFromSet(set);
  if (!sg.name) sg.name = f.name.replace(/\.\w+$/, "");
  return sg;
}

/** The days of a race over several days: the stages kept, how they add up, the general ranking. */
export function seriesDialog(ctx) {
  const L = () => formatLabels({ title: t("chr.ser.title"), place: t("chr.col.place"), name: t("chr.col.name"), club: t("chr.col.club"), behind: t("chr.col.behind"), printed: t("chr.lst.printed", { at: new Date().toLocaleString(locale()) }),
    status: Object.fromEntries(["ok", "mp", "dnf", "dns", "dsq", "ot", "nc", "run", "wait"].map((s) => [s, t(`chr.st.${s}`)])) });
  const page = () => totalsHtml(ctx.st().event, totals(ctx.st(), ctx.view()), L());
  return formDialog({ title: t("chr.ser.title"), ok: "", cancel: t("chr.close"), wide: true,
    extra: html`<button type="button" class="btn" data-a="print">${icon("print", 14)} ${t("chr.rb.print")}</button><button type="button" class="btn" data-a="screen">${icon("tv", 14)} ${t("chr.fol.screen")}</button><button type="button" class="btn" data-a="csv">${icon("down", 14)} CSV</button>`,
    body: html`<p>${t("chr.ser.lede")}</p><div id="chr-ser-stages"></div>
      <p><button type="button" class="btn" data-a="file">${icon("up", 14)} ${t("chr.ser.addFile")}</button> <button type="button" class="btn" data-a="local">${icon("list", 14)} ${t("chr.ser.addLocal")}</button></p>
      <div class="chr-grid" id="chr-ser-set"></div><iframe class="chr-ser-pre" id="chr-ser-pre" title="${t("chr.ser.title")}"></iframe>`,
    onOpen(dlg) {
      function draw() {
        const st = ctx.st(), S = st.event.series || {}, stages = stagesOf(st);
        dlg.querySelector("#chr-ser-stages").innerHTML = stages.length ? html`<ul class="chr-devs">${stages.map((s) => html`<li><b>${s.name || "—"}</b> <span class="chr-dim">${[s.date, tn("chr.ser.nClasses", s.classes.length), tn("chr.cnt.entries", s.classes.reduce((a, c) => a + c.rows.length, 0))].filter(Boolean).join(" · ")}</span>
          <button type="button" class="btn btn-sm" data-rm="${s.id}">${t("chr.ser.remove")}</button></li>`)}</ul>`.toString() : html`<p class="chr-empty">${t("chr.ser.none")}</p>`.toString();
        dlg.querySelector("#chr-ser-set").innerHTML = html`${field(t("chr.ser.mode"), html`<select name="mode">${opt("time", t("chr.ser.mode.time"), S.mode || "time")}${opt("points", t("chr.ser.mode.points"), S.mode)}</select>`, t(`chr.ser.modeHint.${S.mode === "points" ? "points" : "time"}`))}
          ${field(t("chr.ser.best"), html`<input name="best" data-num value="${S.best || ""}" placeholder="${t("chr.ser.bestAll")}">`, t("chr.ser.bestHint"))}
          <label class="chr-check"><input type="checkbox" name="cur" ${S.cur === false ? "" : raw("checked")}> ${t("chr.ser.cur")}</label>`.toString();
        dlg.querySelectorAll("#chr-ser-set [name]").forEach((el) => el.addEventListener("change", () => {
          const x = values(dlg.querySelector("#chr-ser-set"));
          ctx.setEvent({ series: { mode: x.mode, best: x.best > 0 ? Math.round(x.best) : 0, cur: x.cur } });
          draw();
        }));
        dlg.querySelectorAll("[data-rm]").forEach((b) => b.addEventListener("click", async () => { if (await confirmBox(t("chr.ser.removeAsk"), { ok: t("chr.ser.remove") })) { ctx.setEvent({ [`stage.${b.dataset.rm}`]: null }); draw(); } }));
        dlg.querySelector("#chr-ser-pre").srcdoc = page();
      }
      const add = (sg) => { if (!sg?.classes?.length) return false; ctx.setEvent({ [`stage.${newId()}`]: { name: sg.name, date: sg.date, classes: sg.classes } }); return true; };
      dlg.querySelectorAll("[data-a]").forEach((b) => b.addEventListener("click", async () => {
        const a = b.dataset.a;
        try {
          if (a === "print") printHtml(page());
          else if (a === "screen") openPage(page());
          else if (a === "csv") download("general.csv", `﻿${totalsCsv(totals(ctx.st(), ctx.view()), L())}`, "text/csv");
          else if (a === "file") {
            for (const f of await pickFiles(".xml,.csv,.txt,.meosxml,.ozchrono,.jsonl", true)) { if (add(await stageFromFile(f))) ctx.toast(t("chr.ser.added", { name: f.name }), "ok"); else await alertBox(t("chr.ser.noResults", { name: f.name })); }
          } else if (a === "local") {
            const list = (await listEvents().catch(() => [])).filter((e) => e.ev !== ctx.ev);
            if (!list.length) { await alertBox(t("chr.ser.noLocal")); return; }
            const pick = await formDialog({ title: t("chr.ser.addLocal"), ok: t("chr.ser.add"), body: field(t("chr.home.events"), html`<select name="ev">${list.map((e) => opt(e.ev, [e.name || t("chr.untitled"), e.date].filter(Boolean).join(" — "), ""))}</select>`), onOk: (d) => values(d).ev });
            if (!pick) return;
            const e = list.find((x) => x.ev === pick);
            if (!add(stageFromOps(await loadOps(pick), { name: e?.name || "", date: e?.date || "" }))) await alertBox(t("chr.ser.noResults", { name: e?.name || "" }));
          }
        } catch (err) { await alertBox(t("chr.imp.fail", { name: "", why: err?.message || String(err) })); }
        draw();
      }));
      draw();
    } });
}

/** The chase start: the leader of the days before leaves first, the others behind by their deficit. */
export function chaseDialog(ctx) {
  const st = ctx.st(), stages = stagesOf(st);
  if (!stages.length) return alertBox(t("chr.cha.noStage"));
  if (st.event.series?.mode === "points") return alertBox(t("chr.cha.points"));
  const classes = Object.values(st.classes).filter((k) => !k.legs?.length && !k.ko).sort(byName);
  return formDialog({ title: t("chr.cha.title"), ok: t("chr.cha.make"), wide: true,
    body: html`<p>${t("chr.cha.lede", { n: stages.length })}</p><div class="chr-grid">${field(t("chr.cha.first"), html`<input name="first" value="${clock(st.event.zero ?? 36000)}" autofocus>`)}
      ${field(t("chr.cha.cap"), html`<input name="cap" data-num value="30">`, t("chr.cha.capHint"))}${field(t("chr.cha.step"), html`<input name="step" data-num value="30">`, t("chr.cha.stepHint"))}</div>
      <fieldset class="chr-fs"><legend>${t("chr.prep.classes")}</legend><div class="chr-cols">${classes.map((k) => html`<label><input type="checkbox" data-cls="${k.id}" checked> ${k.name}</label>`)}</div></fieldset>`,
    onOk(dlg) {
      const x = values(dlg), first = parseClock(x.first), picked = [...dlg.querySelectorAll("[data-cls]:checked")].map((c) => c.dataset.cls);
      if (first == null) { dlg.fail(t("chr.badTime")); return false; }
      if (!picked.length) return false;
      const d = chaseStarts(st, { first, cap: Math.round((x.cap || 0) * 60), step: x.step > 0 ? x.step : 30, classes: picked });
      if (!d.rows.length) { dlg.fail(t("chr.cha.nobody")); return false; }
      many(ctx, d.rows);
      ctx.toast(t("chr.cha.done", { chase: d.chase, late: d.late, none: d.none }), d.none ? "warn" : "ok");
      return true;
    } });
}
