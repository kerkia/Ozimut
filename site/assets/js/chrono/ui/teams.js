// This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not
// distributed with this file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Teams: the relay's (one runner a leg) and those whose members race together (pairs, patrols). The list of « Préparer »,
// a team's own dialog — its name, club, class, bib, and who runs each leg —, the bibs given in one go, and the relay's
// mass start of the runners still waiting.

import { t, tn } from "../lib/i18n.js";
import { confirmBox } from "../lib/ask.js";
import { html, raw, icon, formDialog, values, field, opt, table } from "./kit.js";
import { clock, parseClock } from "../times.js";
import { newId } from "../log.js";
import { clubFor, searchRunners, norm } from "../model.js";

const byName = (a, b) => String(a.name).localeCompare(String(b.name), undefined, { numeric: true });
const who = (r) => `${r.given || ""} ${r.family || ""}`.trim();

/** The classes run in teams, and how many members a team of each has. */
export const teamClasses = (st) => Object.values(st.classes).filter((k) => k.legs?.length || k.team).sort(byName);
export const teamSize = (k) => (k?.legs?.length ? k.legs.length : k?.team?.size || 2);
export const hasTeams = (st) => st.event.type === "relay" || Object.keys(st.teams).length > 0 || Object.values(st.classes).some((k) => k.legs?.length || k.team);

export function teamsPanel(ctx, S) {
  const st = ctx.st(), q = norm(S.tq || "");
  let rows = Object.values(st.teams);
  const names = (tm) => (tm.runners || []).map((id) => (st.runners[id] ? who(st.runners[id]) : "—")).join(", ");
  if (q) rows = rows.filter((tm) => `${norm(tm.name)} ${norm(st.clubs[tm.club]?.name)} ${norm(st.classes[tm.cls]?.name)} ${tm.bib ?? ""} ${norm(names(tm))}`.includes(q));
  const lack = (tm) => { const k = st.classes[tm.cls]; return k ? teamSize(k) - (tm.runners || []).filter((id) => st.runners[id]).length : 0; };
  if (!S.teams.sort) S.teams.sort = "bib";
  const classes = teamClasses(st);
  return html`<div class="chr-card"><h3>${t("chr.prep.teams")} <small>${rows.length}${q ? ` / ${Object.keys(st.teams).length}` : ""}</small>
    <input type="search" class="chr-q" id="chr-team-q" placeholder="${t("chr.search")}" value="${S.tq || ""}"></h3>
    ${classes.length ? "" : html`<p class="chr-note chr-warn">${t("chr.team.noCls")}</p>`}
    ${table([
    { key: "bib", label: t("chr.col.bib"), num: 1, get: (tm) => tm.bib ?? "" },
    { key: "name", label: t("chr.team.name"), get: (tm) => tm.name || st.clubs[tm.club]?.name || "" },
    { key: "club", label: t("chr.col.club"), get: (tm) => st.clubs[tm.club]?.name || "" },
    { key: "cls", label: t("chr.col.cls"), get: (tm) => st.classes[tm.cls]?.name || "", cell: (tm) => (st.classes[tm.cls] ? st.classes[tm.cls].name : html`<span class="chr-warn">—</span>`) },
    { key: "who", label: t("chr.team.members"), get: names },
    { key: "state", label: t("chr.team.state"), get: lack, cell: (tm) => (lack(tm) > 0 ? html`<span class="chr-warn">${tn("chr.team.lack", lack(tm))}</span>` : html`<span class="chr-okc">${t("chr.team.full")}</span>`) },
  ], rows.slice(0, 800), { state: S.teams, empty: q ? t("chr.noMatch") : t("chr.team.none") })}</div>`;
}

/** A team's dialog: `id` an existing team, or null for a new one. Resolves to the team's id, or null. */
export function teamDialog(ctx, id = null) {
  const st = ctx.st(), tm = id ? st.teams[id] : {}, classes = teamClasses(st);
  if (!classes.length) { ctx.toast(t("chr.team.noCls"), "warn"); return Promise.resolve(null); }
  const was = (tm.runners || []).filter((rid) => st.runners[rid]);
  let M = (tm.runners || []).map((rid) => { const r = st.runners[rid]; return r ? { rid, family: r.family || "", given: r.given || "", card: r.card || "", course: r.course || "" } : { rid: null, family: "", given: "", card: "", course: "" }; });
  const blank = () => ({ rid: null, family: "", given: "", card: "", course: "" });
  let cur = tm.cls && st.classes[tm.cls] ? tm.cls : classes[0].id;
  const variants = (k, i) => { const ids = k.legs?.length ? (k.legs[i]?.pool || []) : (k.pool || []); return ids.map((cid) => st.courses[cid]).filter(Boolean); };
  const body = html`<div class="chr-grid">
      ${field(t("chr.team.name"), html`<input name="name" value="${tm.name || ""}" autofocus>`, t("chr.team.nameHint"))}
      ${field(t("chr.col.club"), html`<input name="club" list="chr-tclubs" value="${st.clubs[tm.club]?.name || ""}"><datalist id="chr-tclubs">${Object.values(st.clubs).map((c) => html`<option value="${c.name}">`)}</datalist>`)}
      ${field(t("chr.col.cls"), html`<select name="cls">${classes.map((k) => opt(k.id, k.name, cur))}</select>`)}
      ${field(t("chr.col.bib"), html`<input name="bib" value="${tm.bib ?? ""}">`)}</div>
    <table class="chr-punches chr-team-m"><thead><tr><th></th><th>${t("chr.run.family")}</th><th>${t("chr.run.given")}</th><th>${t("chr.col.card")}</th><th data-var>${t("chr.team.variant")}</th><th></th></tr></thead><tbody></tbody></table>
    <p class="chr-dim">${t("chr.team.hint")}</p>`;
  return formDialog({ title: id ? t("chr.team.edit") : t("chr.team.new"), ok: t("chr.save"), wide: true, body,
    extra: id ? html`<button type="button" class="btn btn-danger" data-del>${t("chr.delete")}</button>` : "",
    onOpen(dlg) {
      const tb = dlg.querySelector("tbody");
      const keep = () => tb.querySelectorAll("tr[data-i]").forEach((tr) => { const m = M[Number(tr.dataset.i)]; if (!m) return; for (const f of ["family", "given", "card", "course"]) { const el = tr.querySelector(`[data-f=${f}]`); if (el) m[f] = el.value.trim(); } });
      function rows() {
        const k = st.classes[cur], n = teamSize(k), relay = !!k.legs?.length;
        while (M.length < n) M.push(blank());
        const any = Array.from({ length: n }, (_, i) => variants(k, i)).some((v) => v.length > 1);
        dlg.querySelector("[data-var]").hidden = !any;
        tb.innerHTML = M.slice(0, n).map((m, i) => { const vs = variants(k, i); return html`<tr data-i="${i}"><td class="num">${relay ? t("chr.team.leg", { n: i + 1 }) : i + 1}</td>
          <td><input data-f="family" value="${m.family}" autocomplete="off"></td><td><input data-f="given" value="${m.given}" autocomplete="off"></td>
          <td><input data-f="card" class="chr-in-m" inputmode="numeric" value="${m.card}"></td>
          <td ${any ? "" : raw("hidden")}>${vs.length > 1 ? html`<select data-f="course">${opt("", t("chr.team.varAuto"), m.course)}${vs.map((c) => opt(c.id, c.name, m.course))}</select>` : ""}</td>
          <td><button type="button" class="chr-x" data-clear title="${t("chr.team.clear")}">${icon("x", 14)}</button></td></tr><tr class="chr-team-p" data-p="${i}" hidden><td></td><td colspan="5"><div class="chr-picks"></div></td></tr>`; }).join("");
        tb.querySelectorAll("tr[data-i]").forEach((tr) => {
          const i = Number(tr.dataset.i), fam = tr.querySelector("[data-f=family]"), pr = tb.querySelector(`tr[data-p="${i}"]`), list = pr.querySelector(".chr-picks");
          // typing a name offers the entries not yet in a team: a pick takes that entry as it is
          fam.addEventListener("input", () => {
            const found = searchRunners(st, fam.value, 6).filter((r) => (!r.team || r.team === id) && !M.some((m, x) => x !== i && m.rid === r.id));
            pr.hidden = !found.length || fam.value.trim().length < 2;
            list.innerHTML = found.map((r) => html`<button type="button" class="chr-pick" data-id="${r.id}"><b>${who(r)}</b><span>${st.clubs[r.club]?.name || ""}</span><span>${st.classes[r.cls]?.name || ""}</span><span class="num">${r.card || ""}</span></button>`).join("");
            list.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => { keep(); const r = st.runners[b.dataset.id]; M[i] = { rid: r.id, family: r.family || "", given: r.given || "", card: r.card || "", course: M[i].course || "" }; rows(); }));
          });
          tr.querySelector("[data-clear]").addEventListener("click", () => { keep(); M[i] = blank(); rows(); });
          // the reader fills the card of the row in hand
          tr.querySelector("[data-f=card]").addEventListener("focus", () => ctx.cardInto((num) => { const el = tr.querySelector("[data-f=card]"); if (!el?.isConnected) return false; el.value = num; el.classList.add("chr-flash"); return true; }));
        });
      }
      rows();
      dlg.querySelector("[name=cls]").addEventListener("change", (e) => { keep(); cur = e.target.value; rows(); });
      dlg.querySelector("[data-del]")?.addEventListener("click", async () => {
        if (!(await confirmBox(t("chr.team.delAsk", { name: tm.name || st.clubs[tm.club]?.name || "" }), { ok: t("chr.delete") }))) return;
        const read = new Set(Object.values(st.reads).map((r) => r.runner));
        const out = was.map((rid) => ["runners", rid, read.has(rid) ? { team: null, leg: null } : null]);
        out.push(["teams", id, null]);
        ctx.log.add("many", { rows: out }, ctx.by);
        dlg.end(null);
      });
      dlg.keep = keep;
    },
    onOk(dlg) {
      dlg.keep();
      const v = values(dlg), k = st.classes[v.cls];
      if (!k) return false;
      const n = teamSize(k), mem = M.slice(0, n);
      if (!v.name && !v.club) { dlg.fail(t("chr.team.needName")); return false; }
      if (!mem.some((m) => m.family || m.given)) { dlg.fail(t("chr.team.needOne")); return false; }
      const club = v.club ? clubFor(ctx.log, v.club, "", ctx.by) : null, tid = id || newId(), out = [], ids = [];
      mem.forEach((m, i) => {
        if (!m.family && !m.given) { ids.push(null); return; }
        const rid = m.rid || newId(), old = m.rid ? st.runners[m.rid] : null;
        out.push(["runners", rid, { family: m.family, given: m.given, card: Number(m.card) || null, cls: k.id, team: tid, leg: i + 1, course: m.course || null, ...(club && !old?.club ? { club } : {}) }]);
        ids.push(rid);
      });
      while (ids.length && ids[ids.length - 1] == null) ids.pop();
      for (const rid of was) if (!ids.includes(rid)) out.push(["runners", rid, { team: null, leg: null }]);
      out.push(["teams", tid, { name: v.name || null, club, cls: k.id, bib: v.bib || null, runners: ids }]);
      ctx.log.add("many", { rows: out }, ctx.by);
      return tid;
    },
  }).finally(() => ctx.cardInto(null));
}

/** Bibs for every team, class after class, from a first number. */
export function numberTeams(ctx) {
  const st = ctx.st();
  return formDialog({ title: t("chr.team.number"), ok: t("chr.team.number"),
    body: html`<div class="chr-grid">${field(t("chr.team.firstBib"), html`<input name="first" data-num value="1" autofocus>`)}${field(t("chr.team.perCls"), html`<input name="jump" data-num value="0">`, t("chr.team.perClsHint"))}</div>
      <label class="chr-check"><input type="checkbox" name="keep" checked> ${t("chr.team.keepBib")}</label>`,
    onOk(dlg) {
      const v = values(dlg);
      if (!(v.first >= 0)) return false;
      const taken = new Set(v.keep ? Object.values(st.teams).map((tm) => String(tm.bib ?? "")).filter(Boolean) : []), out = [];
      let n = v.first;
      for (const [ci, k] of teamClasses(st).entries()) {
        if (v.jump > 0) n = Math.max(n, v.first + ci * v.jump);          // each class its own block: 1…, 101…, 201…
        for (const tm of Object.values(st.teams).filter((x) => x.cls === k.id).sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), undefined, { numeric: true }))) {
          if (v.keep && tm.bib != null && tm.bib !== "") continue;
          while (taken.has(String(n))) n++;
          out.push(["teams", tm.id, { bib: String(n) }]);
          taken.add(String(n));
          n++;
        }
      }
      if (out.length) ctx.log.add("many", { rows: out }, ctx.by);
      ctx.toast(tn("chr.team.numbered", out.length), "ok");
      return true;
    } });
}

/** The relay's mass start of the runners still waiting: from a leg on, everyone not yet away leaves at that time. */
export function restartDialog(ctx) {
  const st = ctx.st(), classes = Object.values(st.classes).filter((k) => k.legs?.length > 1).sort(byName);
  if (!classes.length) { ctx.toast(t("chr.rst.none"), "warn"); return Promise.resolve(null); }
  const set = classes.map((k) => k.legs.map((l, i) => (l.mass != null && i ? `${i + 1} : ${clock(l.mass)}` : "")).filter(Boolean).join(", "));
  const most = Math.max(...classes.map((k) => k.legs.length));
  return formDialog({ title: t("chr.rst.title"), ok: t("chr.save"), wide: true,
    extra: html`<button type="button" class="btn" data-off>${t("chr.rst.off")}</button>`,
    body: html`<p>${t("chr.rst.lede")}</p><div class="chr-grid">${field(t("chr.rst.time"), html`<input name="time" value="${clock(Math.ceil((ctx.now() + 300) / 300) * 300)}" autofocus>`)}
      ${field(t("chr.rst.from"), html`<select name="from">${Array.from({ length: most - 1 }, (_, i) => opt(i + 2, t("chr.team.leg", { n: i + 2 }), 2))}</select>`, t("chr.rst.fromHint"))}</div>
      <fieldset class="chr-fs"><legend>${t("chr.prep.classes")}</legend><div class="chr-cols">${classes.map((k, i) => html`<label><input type="checkbox" data-cls="${k.id}" checked> ${k.name}${set[i] ? html` <i class="chr-dim">(${set[i]})</i>` : ""}</label>`)}</div></fieldset>`,
    onOpen(dlg) {
      dlg.querySelector("[data-off]").addEventListener("click", () => {
        const picked = [...dlg.querySelectorAll("[data-cls]:checked")].map((c) => c.dataset.cls);
        const out = picked.map((cid) => ["classes", cid, { legs: st.classes[cid].legs.map((l, i) => { if (!i) return l; const { mass, ...rest } = l; return rest; }) }]);
        if (out.length) ctx.log.add("many", { rows: out }, ctx.by);
        ctx.toast(t("chr.rst.offDone"), "ok");
        dlg.end(true);
      });
    },
    onOk(dlg) {
      const v = values(dlg), time = parseClock(v.time), from = Number(v.from) || 2, picked = [...dlg.querySelectorAll("[data-cls]:checked")].map((c) => c.dataset.cls);
      if (time == null) { dlg.fail(t("chr.badTime")); return false; }
      if (!picked.length) return false;
      ctx.log.add("many", { rows: picked.map((cid) => ["classes", cid, { legs: st.classes[cid].legs.map((l, i) => (i + 1 >= from ? { ...l, mass: time } : l)) }]) }, ctx.by);
      ctx.toast(t("chr.rst.done", { time: clock(time) }), "ok");
      return true;
    } });
}
