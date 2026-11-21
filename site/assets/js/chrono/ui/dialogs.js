// This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not
// distributed with this file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The dialogs every post shares: a runner's entry, a card's content (corrected by hand), a card nobody holds, a finish
// typed by hand. Each writes operations through the log and resolves when closed.

import { t } from "../lib/i18n.js";
import { confirmBox } from "../lib/ask.js";
import { html, raw, formDialog, values, field, opt, icon, statusTag, atClock } from "./kit.js";
import { clock, span, parseClock, parseSpan } from "../times.js";
import { newId } from "../log.js";
import { assignRead, clubFor, searchRunners, norm } from "../model.js";
import { guessCourse, punchesOf, judge } from "../judge.js";

const STATUS_SET = ["", "ok", "mp", "dnf", "dns", "dsq", "ot", "nc"];
const who = (r) => `${r.given || ""} ${r.family || ""}`.trim();

/** A search field over the entries: `onPick(runner)`; the list is drawn under the field. */
export function runnerSearch(ctx, input, list, onPick, { limit = 8 } = {}) {
  const draw = () => {
    const found = searchRunners(ctx.st(), input.value, limit);
    list.innerHTML = found.map((r) => html`<button type="button" class="chr-pick" data-id="${r.id}"><b>${who(r)}</b><span>${ctx.st().clubs[r.club]?.name || ""}</span>
      <span>${ctx.st().classes[r.cls]?.name || ""}</span><span class="num">${r.card || ""}</span></button>`).join("");
    list.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => onPick(ctx.st().runners[b.dataset.id])));
  };
  input.addEventListener("input", draw);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); list.querySelector("button")?.click(); } });
  draw();
}

/** A person of the federation's file (the archive kept on this computer): `[{ lic, family, given, club, clubCode, card, sex, birth, cat }]`. */
export function searchArchive(ctx, q, limit = 8) {
  const A = ctx.archive || [], words = norm(q).split(" ").filter(Boolean);
  if (!words.length || !A.length) return [];
  const out = [];
  for (const p of A) {
    const hay = p.k || (p.k = `${norm(p.family)} ${norm(p.given)} ${p.lic || ""} ${p.card || ""}`);
    if (words.every((w) => hay.includes(w))) { out.push(p); if (out.length >= limit) break; }
  }
  return out;
}

/**
 * A runner's entry: `id` an existing runner, or null for a new one (`preset`: fields to start from).
 * Resolves to the runner's id, or null (given up, deleted).
 */
export function runnerDialog(ctx, id = null, preset = {}) {
  const st = ctx.st(), r = id ? st.runners[id] : preset, rules = ctx.rules();
  const classes = Object.values(st.classes).sort((a, b) => String(a.name).localeCompare(String(b.name), undefined, { numeric: true }));
  const body = html`
    ${!id && ctx.archive?.length ? html`<div class="chr-arch"><input type="search" id="chr-arch-q" placeholder="${t("chr.run.archive")}" autocomplete="off"><div class="chr-picks" id="chr-arch-l"></div></div>` : ""}
    <div class="chr-grid">
      ${field(t("chr.run.family"), html`<input name="family" value="${r.family || ""}" required autofocus>`)}
      ${field(t("chr.run.given"), html`<input name="given" value="${r.given || ""}">`)}
      ${field(t("chr.run.club"), html`<input name="club" list="chr-clubs" value="${st.clubs[r.club]?.name || r.clubName || ""}"><datalist id="chr-clubs">${Object.values(st.clubs).map((c) => html`<option value="${c.name}">`)}</datalist>`)}
      ${field(t("chr.run.cls"), html`<select name="cls">${opt("", "—", r.cls)}${classes.map((k) => opt(k.id, k.name, r.cls))}</select>`)}
      ${field(t("chr.run.card"), html`<input name="card" inputmode="numeric" data-num value="${r.card || ""}">`, t("chr.run.cardHint"))}
      ${field(t("chr.run.lic"), html`<input name="lic" value="${r.lic || ""}">`)}
      ${field(t("chr.run.bib"), html`<input name="bib" value="${r.bib ?? ""}">`)}
      ${field(t("chr.run.start"), html`<input name="start" value="${clock(r.start)}" placeholder="10:30:00">`)}
      ${field(t("chr.run.sex"), html`<select name="sex">${opt("", "—", r.sex)}${rules.sexes.map((s, i) => opt(i ? "F" : "M", s, /^(f|d|w)/i.test(r.sex || "") ? "F" : r.sex ? "M" : ""))}</select>`)}
      ${field(t("chr.run.birth"), html`<input name="birth" inputmode="numeric" data-num value="${r.birth || ""}">`)}
      ${field(t("chr.run.kind"), html`<select name="kind">${rules.kinds.map((k) => opt(k, t(`chr.kind.${k}`), r.kind || "lic"))}</select>`)}
      ${field(t("chr.run.fee"), html`<input name="fee" inputmode="decimal" data-num value="${r.fee ?? ""}">`)}
    </div>
    <div class="chr-checks"><label><input type="checkbox" name="paid" ${r.paid ? raw("checked") : ""}> ${t("chr.run.paid")}</label>
      <label><input type="checkbox" name="rent" ${r.rent ? raw("checked") : ""}> ${t("chr.run.rent")}</label></div>
    <details class="chr-more" ${r.status || r.adj || r.note ? raw("open") : ""}><summary>${t("chr.run.more")}</summary><div class="chr-grid">
      ${field(t("chr.run.status"), html`<select name="status">${STATUS_SET.map((s) => opt(s, s ? t(`chr.st.${s}`) : t("chr.run.auto"), r.status || ""))}</select>`, t("chr.run.statusHint"))}
      ${field(t("chr.run.adj"), html`<input name="adj" data-num value="${r.adj || ""}">`, t("chr.run.adjHint"))}
      ${field(t("chr.run.note"), html`<input name="note" value="${r.note || ""}">`)}
    </div></details>`;
  return formDialog({
    title: id ? t("chr.run.edit") : t("chr.run.new"), body, wide: true, ok: t("chr.save"),
    extra: id ? html`<button type="button" class="btn btn-danger" data-del>${t("chr.delete")}</button>` : "",
    onOpen(dlg) {
      const q = dlg.querySelector("#chr-arch-q"), l = dlg.querySelector("#chr-arch-l");
      q?.addEventListener("input", () => {
        const found = searchArchive(ctx, q.value);
        l.innerHTML = found.map((p, i) => html`<button type="button" class="chr-pick" data-i="${i}"><b>${who(p)}</b><span>${p.club || ""}</span><span>${p.lic || ""}</span><span class="num">${p.card || ""}</span></button>`).join("");
        l.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
          const p = found[Number(b.dataset.i)], f = (n, v) => { const el = dlg.querySelector(`[name=${n}]`); if (el && v != null && v !== "") el.value = v; };
          f("family", p.family); f("given", p.given); f("club", p.club); f("lic", p.lic); f("card", p.card); f("birth", p.birth); f("sex", /^(f|d|w)/i.test(p.sex || "") ? "F" : p.sex ? "M" : "");
          const cat = p.cat || (p.birth && p.sex ? rules.catOf(p.birth, p.sex, Number((st.event.date || "").slice(0, 4)) || new Date().getFullYear()) : "");
          const k = classes.find((c) => norm(c.name) === norm(cat));
          if (k) f("cls", k.id);
          dlg.dataset.cat = cat; dlg.dataset.clubCode = p.clubCode || "";
          l.innerHTML = ""; q.value = "";
        }));
      });
      dlg.querySelector("[data-del]")?.addEventListener("click", async () => {
        if (!(await confirmBox(t("chr.run.delAsk", { name: who(r) }), { ok: t("chr.delete") }))) return;
        ctx.put("runners", id, null);
        dlg.end(null);
      });
      // the reader fills the card field while this dialog is open
      ctx.cardInto((n) => { const el = dlg.querySelector("[name=card]"); if (!el.isConnected) return false; el.value = n; el.classList.add("chr-flash"); return true; });
    },
    onOk(dlg) {
      const v = values(dlg), p = {};
      if (!v.family && !v.given) { dlg.fail(t("chr.run.needName")); return false; }
      const start = v.start ? parseClock(v.start) : null;
      if (v.start && start == null) { dlg.fail(t("chr.badTime")); return false; }
      const clubId = v.club ? clubFor(ctx.log, v.club, dlg.dataset.clubCode || "", ctx.by) : null;
      const set = (k, val) => { if ((r[k] ?? null) !== (val ?? null)) p[k] = val ?? null; };
      set("family", v.family); set("given", v.given); set("club", clubId); set("cls", v.cls || null); set("card", v.card || null); set("lic", v.lic || null);
      set("bib", v.bib || null); set("start", start); set("sex", v.sex || null); set("birth", v.birth || null); set("kind", v.kind || null); set("fee", v.fee);
      set("paid", v.paid ? 1 : null); set("rent", v.rent ? 1 : null); set("status", v.status || null); set("adj", v.adj || null); set("note", v.note || null);
      if (dlg.dataset.cat && !r.cat) p.cat = dlg.dataset.cat;
      const rid = id || newId();
      if (Object.keys(p).length) ctx.put("runners", rid, p);
      return rid;
    },
  }).finally(() => ctx.cardInto(null));
}

/** A card's content, with what a referee may correct: the punches, the start, the finish; whose it is. */
export function readDialog(ctx, readId) {
  const st = ctx.st(), read = st.reads[readId];
  if (!read) return Promise.resolve(null);
  const runner = read.runner ? st.runners[read.runner] : null;
  const j = runner ? judge(st, runner, read) : null;
  const rows = punchesOf(read).map(([c, s]) => [c, s]);
  const row = ([c, s], i) => html`<tr data-i="${i}"><td><input class="chr-in-s" data-code inputmode="numeric" value="${c}"></td><td><input class="chr-in-m" data-time value="${read.rel ? span(s) : clock(s)}"></td>
    <td>${j && j.extra.some((p) => p[0] === c && p[1] === s) ? html`<span class="chr-dim">${t("chr.read.extra")}</span>` : ""}</td>
    <td><button type="button" class="chr-x" data-rm title="${t("chr.read.rm")}">${icon("x", 14)}</button></td></tr>`;
  const body = html`
    <p class="chr-read-head"><b>${t("chr.read.card", { n: read.card })}</b> · ${read.sys === "manual" ? t("chr.read.manual") : String(read.sys || "").toUpperCase()} · ${atClock(read.at)}
      ${read.ed ? html` · <span class="chr-warn">${t("chr.read.edited")}</span>` : ""}</p>
    <p>${runner ? html`${t("chr.read.of")} <b>${who(runner)}</b> (${st.classes[runner.cls]?.name || "—"}) ${j ? statusTag(j.status) : ""}` : html`<span class="chr-warn">${t("chr.read.nobody")}</span>`}
      <button type="button" class="btn btn-sm" data-assign>${t("chr.read.assign")}</button></p>
    ${j?.missing.length ? html`<p class="chr-warn">${t("chr.read.missing", { codes: j.missing.join(", ") })}</p>` : ""}
    <div class="chr-grid">${read.rel ? "" : field(t("chr.read.start"), html`<input name="start" value="${clock(read.ed?.start ?? read.start)}">`, t("chr.read.startHint"))}
      ${read.rel ? "" : field(t("chr.read.finish"), html`<input name="finish" value="${clock(read.ed?.finish ?? read.finish)}">`)}</div>
    <table class="chr-punches"><thead><tr><th>${t("chr.read.code")}</th><th>${t("chr.read.time")}</th><th></th><th></th></tr></thead><tbody>${rows.map(row)}</tbody></table>
    <button type="button" class="btn btn-sm" data-add>${icon("plus", 14)} ${t("chr.read.add")}</button>`;
  return formDialog({
    title: t("chr.read.title"), body, ok: t("chr.save"), wide: true,
    extra: read.ed ? html`<button type="button" class="btn" data-undo>${t("chr.read.undo")}</button>` : "",
    onOpen(dlg) {
      const tb = dlg.querySelector("tbody");
      const bind = () => tb.querySelectorAll("[data-rm]").forEach((b) => { b.onclick = () => b.closest("tr").remove(); });
      bind();
      dlg.querySelector("[data-add]").addEventListener("click", () => { tb.insertAdjacentHTML("beforeend", row(["", null], tb.children.length).toString()); bind(); tb.lastElementChild.querySelector("input").focus(); });
      dlg.querySelector("[data-undo]")?.addEventListener("click", () => { ctx.log.add("edit", { id: readId, e: null }, ctx.by); dlg.end(true); });
      dlg.querySelector("[data-assign]").addEventListener("click", async () => { dlg.end(null); await unknownDialog(ctx, readId); });
    },
    onOk(dlg) {
      const punches = [];
      for (const tr of dlg.querySelectorAll("tbody tr")) {
        const code = Number(tr.querySelector("[data-code]").value), tv = tr.querySelector("[data-time]").value.trim();
        const s = read.rel ? parseSpan(tv) : parseClock(tv);
        if (!code && !tv) continue;
        if (!(code > 0) || s == null) { dlg.fail(t("chr.read.bad")); return false; }
        punches.push([code, s]);
      }
      punches.sort((a, b) => a[1] - b[1]);
      const e = {}, v = values(dlg), same = JSON.stringify(punches) === JSON.stringify(read.punches);
      if (!same) e.punches = punches;
      for (const k of ["start", "finish"]) {
        if (read.rel) continue;
        const s = v[k] ? parseClock(v[k]) : null;
        if (v[k] && s == null) { dlg.fail(t("chr.badTime")); return false; }
        if ((s ?? null) !== (read[k] ?? null)) e[k] = s;
      }
      const was = JSON.stringify(read.ed || {});
      if (JSON.stringify(e) !== was) ctx.log.add("edit", { id: readId, e: Object.keys(e).length ? e : null }, ctx.by);
      return true;
    },
  });
}

/** A card given to nobody (or to the wrong runner): find its runner, make a new entry, or set it aside. */
export function unknownDialog(ctx, readId) {
  const st = ctx.st(), read = st.reads[readId];
  if (!read) return Promise.resolve(null);
  const guess = guessCourse(st, read), P = punchesOf(read);
  const body = html`
    <p class="chr-read-head"><b>${t("chr.read.card", { n: read.card })}</b> · ${tnPunches(P.length)}${read.finish != null ? html` · ${t("chr.read.finish")} ${clock(read.finish)}` : ""}</p>
    ${guess.length ? html`<p>${t("chr.unk.guess")} ${guess.map((g) => html`<span class="chr-chip">${g.name} ${g.hit}/${g.of}</span>`)}</p>` : ""}
    <p class="chr-dim">${P.map((p) => p[0]).join(" · ")}</p>
    <input type="search" id="chr-unk-q" placeholder="${t("chr.unk.search")}" autocomplete="off" autofocus><div class="chr-picks" id="chr-unk-l"></div>`;
  return formDialog({
    title: t("chr.unk.title"), body, ok: "", cancel: t("chr.close"), wide: true,
    extra: html`<button type="button" class="btn btn-primary" data-new>${icon("plus", 14)} ${t("chr.unk.new")}</button><button type="button" class="btn" data-aside>${t("chr.unk.aside")}</button>`,
    onOpen(dlg) {
      runnerSearch(ctx, dlg.querySelector("#chr-unk-q"), dlg.querySelector("#chr-unk-l"), (r) => { assignRead(ctx.log, readId, r.id, ctx.by); dlg.end(r.id); });
      dlg.querySelector("[data-aside]").addEventListener("click", () => { assignRead(ctx.log, readId, 0, ctx.by); dlg.end(0); });
      dlg.querySelector("[data-new]").addEventListener("click", async () => {
        const course = guess[0] && guess[0].hit === guess[0].of ? guess[0].id : null;
        const k = course ? Object.values(st.classes).filter((c) => c.course === course) : [];
        dlg.end(null);
        const id = await runnerDialog(ctx, null, { card: read.card, cls: k.length === 1 ? k[0].id : null });
        if (id) assignRead(ctx.log, readId, id, ctx.by);
      });
    },
  });
}
const tnPunches = (n) => t("chr.read.n", { n });

/** A runner without a readable card: the finish (or the time) and the status typed by hand, kept as a read of its own. */
export function manualDialog(ctx, runnerId) {
  const st = ctx.st(), r = st.runners[runnerId];
  if (!r) return Promise.resolve(null);
  const body = html`<p><b>${who(r)}</b> · ${st.classes[r.cls]?.name || "—"} · ${t("chr.run.start")} ${clock(r.start) || "—"}</p>
    <div class="chr-grid">${field(t("chr.man.finish"), html`<input name="finish" placeholder="11:42:07" autofocus>`)}${field(t("chr.man.time"), html`<input name="time" placeholder="41:07">`, t("chr.man.timeHint"))}
    ${field(t("chr.run.status"), html`<select name="status">${["ok", "mp", "dnf", "dsq", "ot", "nc"].map((s) => opt(s, t(`chr.st.${s}`), "ok"))}</select>`)}</div>
    <p class="chr-dim">${t("chr.man.note")}</p>`;
  return formDialog({
    title: t("chr.man.title"), body, ok: t("chr.save"),
    onOk(dlg) {
      const v = values(dlg);
      let finish = v.finish ? parseClock(v.finish) : null;
      const time = v.time ? parseSpan(v.time) : null;
      if ((v.finish && finish == null) || (v.time && time == null)) { dlg.fail(t("chr.badTime")); return false; }
      if (finish == null && time != null && r.start != null) finish = r.start + time;
      if (finish == null && v.status !== "dnf") { dlg.fail(t("chr.man.need")); return false; }
      const read = { id: newId(), card: Number(r.card) || 0, sys: "manual", at: Date.now(), start: null, finish, check: null, clear: null, punches: [], runner: r.id };
      ctx.log.add("read", { r: read }, ctx.by);
      ctx.put("runners", r.id, { status: v.status });
      return read.id;
    },
  });
}
