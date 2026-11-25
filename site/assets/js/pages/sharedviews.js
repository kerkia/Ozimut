// « Analyse multi »'s views under the replay (pages/shared.js), as tabs: the splits table against a chosen runner (the
// duel), and one runner's legs as « Analyse solo » shows them — time, rank, the time lost by the split-times page's rule
// (trace/legs.js), the route's length against the straight line, the pace. Only positions and times are shared: no heart
// rate or cadence here for anyone (one's own stay in « Mes courbes », on one's device). « Écarts » (after SplitsBrowser
// and 2DRerun's autOanalysis): each runner shown, their time behind a reference at each control — the leader there, the
// « superman » of the best legs, or a runner —, against the controls or the course's distance; a click on a point puts
// the replay there; and a duel, leg by leg, the time one runner gained or lost on another. « Variantes »: on a leg, the
// runners' routes grouped by route choice (trace/routes.js), each variant's runners, best and median time and length;
// the grouping can be changed by hand (a runner moved, variants merged, names), kept on the device, and the organiser's
// shared with everyone. « Exercices » (a training event's): corridors and compass legs set by the organiser, each
// runner's share of their route inside, time outside, largest and mean deviation and, on a compass leg, the bearing error
// (trace/corridor.js); the width changes the scores live.
//
// X, the replay's context: runners (all, each { uid, name, colour, visible, passes, start, finish, tr, fit, mine }),
// ctrls, legsN, ctrlLabel(i), legName(j), legTime(r, j), total(r), fieldLegs() (the field's leg times and their source),
// state (tab, ref, legsOf: the replay's choices), setLeg(j), changed() (the address and the map follow).

import { html, raw, esc, $, $$, fmt, pctN } from "../util.js";
import { t } from "../i18n.js";
import { clock } from "./provisional.js";
import { cumAt } from "../trace/track.js";
import { toM } from "../trace/geom.js";
import { bestLegs, refLegs, legLoss, cumOf, referenceCum } from "../trace/legs.js";
import { gapChart, duelChart } from "../charts.js";
import { variantKey } from "../trace/routes.js";
import { pace } from "../trace/curves.js";
import { freezeAttrs } from "../ui.js";
import { confirmBox, alertBox } from "../askbox.js";

export const signed = (s) => (s == null ? "—" : `${s >= 0 ? "+" : "−"}${clock(Math.abs(s))}`);
const detour = (dist, straight) => { const p = (100 * dist) / straight - 100; return `${p >= 0 ? "+" : "−"}${pctN(Math.abs(p))}`; };

export const TABS = ["splits", "legs", "gaps", "variants", "exercises"];

/** The tabs and their panel in `el`; returns { draw() } — a full redraw (the runners shown, the leg, the reference changed). */
export function views(el, X) {
  const tabs = () => TABS.filter((k) => !X.tabOk || X.tabOk(k));
  function draw() {
    const list = tabs();
    if (!list.includes(X.state.tab)) X.state.tab = list[0];
    el.innerHTML = html`<nav class="page-tabs sh-vtabs" role="tablist">${list.map((k) => html`<button type="button" role="tab" data-vtab="${k}" aria-selected="${k === X.state.tab}">${t(`sh.v.${k}`)}${X.tabMark?.(k) ? html` ${X.tabMark(k)}` : ""}</button>`)}</nav>
      <div id="sh-vbody"></div>`;
    const go = (k) => { X.state.tab = k; draw(); X.changed(); };
    // a tab the account lacks (X.tabGuard: true, or a promise of it — offers.js) opens only once it may
    $$("[data-vtab]", el).forEach((b) => b.addEventListener("click", () => {
      const ok = X.tabGuard ? X.tabGuard(b.dataset.vtab, b) : true;
      if (ok === true) go(b.dataset.vtab); else Promise.resolve(ok).then((y) => { if (y) go(b.dataset.vtab); });
    }));
    const body = $("#sh-vbody", el);
    if (X.state.tab === "legs") legsView(body, X);
    else if (X.state.tab === "gaps") gapsView(body, X);
    else if (X.state.tab === "variants") variantsView(body, X);
    else if (X.state.tab === "exercises") exercisesView(body, X);
    else splitsView(body, X);
  }
  return { draw, tab: () => X.state.tab };
}
/** One runner's legs alone (« Analyse multi »'s « Inter-postes » tab, owner 2026-11-04). */
export function legsPanel(el, X) {
  return { draw: () => { if (!X.score) legsView(el, X); } };
}

// ---- a score course (owner, 2026-11-02, after RouteGadget): each runner's controls in the order run, the most first, then the
// fastest; a control named by its code when it has one
function scoreView(el, X) {
  const R = X.runners.filter((r) => r.visible).map((r) => ({ r, v: X.visitsOf(r), tot: X.total(r) }))
    .sort((a, b) => b.v.length - a.v.length || (a.tot ?? 1e9) - (b.tot ?? 1e9));
  if (!R.length) { el.innerHTML = html`<div class="empty">${t("sh.noTraces")}</div>`; return; }
  const name = (j) => X.ctrls[j].code || X.ctrlLabel(j);
  el.innerHTML = html`<div class="card-head"><div class="hint">${t("sh.score.view.hint")}</div></div>
    <div class="table-wrap"><table class="data compact sh-score"><thead><tr><th>${t("prov.runner")}</th><th class="r">${t("sh.score.col.n")}</th><th class="r">${t("sh.score.col.time")}</th><th>${t("sh.score.col.order")}</th></tr></thead>
    <tbody>${R.map(({ r, v, tot }) => html`<tr><td><span class="sh-swatch" style="background:${r.colour}"></span> ${r.name}</td><td class="r num">${v.length} / ${X.scoreN}</td>
      <td class="r num">${tot != null ? clock(tot) : "—"}</td><td class="sh-score-order">${v.map((x) => html`<span class="sh-score-c"><b>${name(x.j)}</b> <span class="muted">${clock(x.s)}</span></span>`)}</td></tr>`)}</tbody></table></div>`;
}

// ---- the splits table, against a reference (the duel)
function splitsView(el, X) {
  if (X.score) { scoreView(el, X); return; }
  const { legsN, ctrlLabel, legTime, total } = X;
  const R = X.runners.filter((r) => r.visible), ref = X.state.ref;
  if (!R.length || legsN < 1) { el.innerHTML = html`<div class="empty">${t("sh.noTraces")}</div>`; return; }
  const best = Array.from({ length: legsN }, (_, j) => Math.min(...R.map((r) => legTime(r, j + 1) ?? 1e9)));
  const rankOf = (r, j) => { const v = legTime(r, j); return v == null ? null : 1 + R.filter((x) => (legTime(x, j) ?? 1e9) < v).length; };
  el.innerHTML = html`<div class="card-head"><div class="hint">${t("sh.splits.hint")}</div>
      <label class="field" style="margin-left:auto"><span>${t("sh.ref")}</span><select id="sh-ref"><option value="">—</option>${R.map((r) => html`<option value="${r.uid}" ${raw(r === ref ? "selected" : "")}>${r.name}</option>`)}</select></label></div>
    <div class="table-wrap"><table class="data compact sh-splits"${raw(freezeAttrs(1, 1))}><thead><tr><th>${t("prov.name")}</th>${Array.from({ length: legsN }, (_, j) => html`<th class="r" data-legh="${j + 1}" style="cursor:pointer">${ctrlLabel(j + 1)}</th>`)}<th class="r">${t("an.total")}</th></tr></thead>
    <tbody>${R.map((r) => html`<tr><td><span class="sh-swatch" style="background:${r.colour}"></span> ${r.name}${r.published ? html` <span class="tag" title="${t("sh.pub.tip")}">${t("sh.pub")}</span>` : ""}</td>
      ${Array.from({ length: legsN }, (_, j) => { const v = legTime(r, j + 1), c = r.passes[j + 1] != null ? r.passes[j + 1] - r.start : null, rv = ref && ref !== r ? legTime(ref, j + 1) : null;
        return html`<td class="r num${v != null && v === best[j] ? " sh-best" : ""}" data-legh="${j + 1}" style="cursor:pointer">${v != null ? html`${clock(v)} <span class="muted">(${rankOf(r, j + 1)})</span>` : "—"}
          <div class="sh-sub muted">${c != null ? clock(c) : ""}${v != null && rv != null ? html` <span class="${v > rv ? "delta-down" : "delta-up"}">${signed(v - rv)}</span>` : ""}</div></td>`; })}
      <td class="r num"><b>${total(r) != null ? clock(total(r)) : "—"}</b>${ref && ref !== r && total(r) != null && total(ref) != null ? html`<div class="sh-sub ${total(r) > total(ref) ? "delta-down" : "delta-up"}">${signed(total(r) - total(ref))}</div>` : ""}</td></tr>`)}</tbody></table></div>`;
  $("#sh-ref", el).addEventListener("change", (e) => { X.state.ref = X.runners.find((r) => r.uid === Number(e.target.value)) || null; X.refChanged(); });
  // a control's heading or any of its cells opens the leg on the map (owner, 2026-11-05: the cells did nothing)
  $$("[data-legh]", el).forEach((c) => c.addEventListener("click", () => X.setLeg(Number(c.dataset.legh))));
}

// ---- one runner's legs, as « Analyse solo » (time lost, detour, pace)
function legsView(el, X) {
  const { legsN, ctrls, ctrlLabel, legTime } = X;
  const R = X.runners.filter((r) => r.passes.some((p) => p != null));
  if (!R.length || legsN < 1) { el.innerHTML = html`<div class="empty">${t("sh.noTraces")}</div>`; return; }
  const who = R.find((r) => r.uid === X.state.legsOf) || X.state.sel || R.find((r) => r.mine) || R[0];
  const field = X.fieldLegs(), best = bestLegs(field.all, legsN);
  const mine = Array.from({ length: legsN }, (_, i) => legTime(who, i + 1));
  const loss = legLoss(mine, refLegs(field.all, legsN));
  const rows = mine.map((v, i) => {
    const j = i + 1, a = who.passes[j - 1], b = who.passes[j];
    const dist = v != null ? cumAt(who.tr, b) - cumAt(who.tr, a) : null;
    const p = toM(who.fit, ctrls[j - 1].x, ctrls[j - 1].y), q = toM(who.fit, ctrls[j].x, ctrls[j].y), straight = Math.hypot(p[0] - q[0], p[1] - q[1]);
    const rank = v != null ? 1 + field.all.filter((l) => l[i] != null && l[i] < v).length : null;
    return { j, time: v, best: best[i], rank, n: field.all.filter((l) => l[i] != null).length, ...loss[i], dist, straight, v: v > 0 && dist != null ? dist / v : null };
  });
  const sum = rows.reduce((s, l) => ({ time: s.time + (l.time || 0), dist: s.dist + (l.dist || 0), straight: s.straight + (l.time != null ? l.straight : 0), lost: s.lost + (l.mistake ? l.lost : 0), n: s.n + (l.mistake ? 1 : 0) }), { time: 0, dist: 0, straight: 0, lost: 0, n: 0 });
  // the runner on one line under the tabs, the list beside its name (owner, 2026-11-07)
  el.innerHTML = html`<label class="sh-legs-head"><span>${t("prov.runner")}</span><select id="sh-legs-of">${R.map((r) => html`<option value="${r.uid}" ${raw(r === who ? "selected" : "")}>${r.name}</option>`)}</select></label>
    <div class="table-wrap" title="${t("sh.legs.hint", { src: t(`sh.legs.src.${field.source}`) })}"><table class="data compact sh-legs"><thead><tr><th>${t("an.col.leg")}</th><th class="r">${t("an.col.time")}</th><th class="r">${t("an.col.best")}</th>
      <th class="r">${t("an.col.rank")}</th><th class="r">${t("an.col.lost")}</th><th class="r">${t("an.col.trace")}</th><th class="r">${t("an.col.straight")}</th><th class="r">${t("an.col.detour")}</th><th class="r">${t("an.col.pace")}</th></tr></thead>
    <tbody><tr data-leg="0" class="sh-legs-all${X.leg ? "" : " cur"}" style="cursor:pointer"><td colspan="9">${t("sh.leg.all")}</td></tr>
    ${rows.map((l) => html`<tr data-leg="${l.j}" class="${l.mistake ? "an-mistake" : ""}${l.j === X.leg ? " cur" : ""}" style="cursor:pointer">
      <td>${ctrlLabel(l.j)}${ctrls[l.j].code ? html` <span class="muted">${ctrls[l.j].code}</span>` : ""}</td>
      <td class="r num">${l.time != null ? clock(l.time) : "—"}</td><td class="r num">${l.best != null ? clock(l.best) : "—"}</td>
      <td class="r num">${l.rank != null ? html`${l.rank}<span class="muted">/${l.n}</span>` : "—"}</td>
      <td class="r num${l.mistake ? " an-lost" : ""}">${l.lost != null ? signed(Math.round(l.lost)) : "—"}</td>
      <td class="r num">${l.dist != null ? html`${fmt(l.dist)} m` : "—"}</td><td class="r num">${fmt(l.straight)} m</td>
      <td class="r num">${l.dist != null && l.straight > 0 ? detour(l.dist, l.straight) : "—"}</td><td class="r num">${l.v != null ? pace(l.v) : "—"}</td></tr>`)}</tbody>
    <tfoot><tr><td>${t("an.total")}</td><td class="r num">${clock(sum.time)}</td><td></td><td></td>
      <td class="r num">${sum.n ? `${signed(Math.round(sum.lost))} (${sum.n})` : "—"}</td><td class="r num">${fmt(sum.dist)} m</td><td class="r num">${fmt(sum.straight)} m</td>
      <td class="r num">${sum.dist && sum.straight ? detour(sum.dist, sum.straight) : "—"}</td><td class="r num">${sum.time && sum.dist ? pace(sum.dist / sum.time) : "—"}</td></tr></tfoot></table></div>
    <p class="hint" style="margin:6px 2px 0">${t("sh.legs.rule")}</p>`;
  $("#sh-legs-of", el).addEventListener("change", (e) => { X.state.legsOf = Number(e.target.value); legsView(el, X); X.changed(); });
  $$("tr[data-leg]", el).forEach((tr) => tr.addEventListener("click", () => X.setLeg(Number(tr.dataset.leg))));
}

// ---- the gaps to a reference along the race, and a duel leg by leg
export const GAP_REFS = ["leader", "superman"];
function gapsView(el, X) {
  const { legsN, ctrlLabel, legTime, state } = X;
  const R = X.runners.filter((r) => r.visible && r.passes.some((p) => p != null));
  if (!R.length || legsN < 1) { el.innerHTML = html`<div class="empty">${t("sh.noTraces")}</div>`; return; }
  const legsOf = (r) => Array.from({ length: legsN }, (_, i) => legTime(r, i + 1));
  const duel = state.gm === "duel";
  const refRunner = /^r\d+$/.test(state.gref || "") ? X.runners.find((r) => r.uid === Number(state.gref.slice(1))) : null;
  const gref = refRunner ? state.gref : GAP_REFS.includes(state.gref) ? state.gref : "leader";
  const A = R.find((r) => r.uid === state.da) || state.sel || R.find((r) => r.mine) || R[0];
  const B = state.ref && state.ref !== A ? state.ref : R.find((r) => r !== A) || null;
  const opts = (sel, list) => list.map((r) => html`<option value="${r.uid}" ${raw(r === sel ? "selected" : "")}>${r.name}</option>`);
  el.innerHTML = html`<div class="filters sh-gap-tools">
      <div class="seg" role="group">${["gaps", "duel"].map((m) => html`<button type="button" data-gm="${m}" aria-pressed="${(m === "duel") === duel}">${t(`sh.gm.${m}`)}</button>`)}</div>
      ${duel ? html`<label class="field"><span>${t("prov.runner")}</span><select id="sh-da">${opts(A, R)}</select></label>
          <label class="field"><span>${t("sh.duel.vs")}</span><select id="sh-db">${opts(B, R.filter((r) => r !== A))}</select></label>`
        : html`<label class="field"><span>${t("sh.gref")}</span><select id="sh-gref">${GAP_REFS.map((k) => html`<option value="${k}" ${raw(k === gref ? "selected" : "")}>${t(`sh.gref.${k}`)}</option>`)}
            <optgroup label="${t("sh.gref.runner")}">${X.runners.map((r) => html`<option value="r${r.uid}" ${raw(`r${r.uid}` === gref ? "selected" : "")}>${r.name}</option>`)}</optgroup></select></label>
          <label class="field"><span>${t("sh.gx")}</span><select id="sh-gx">${["ctrl", "dist"].map((k) => html`<option value="${k}" ${raw(k === (state.gx || "ctrl") ? "selected" : "")}>${t(`sh.gx.${k}`)}</option>`)}</select></label>`}</div>
    ${duel ? "" : html`<div class="sh-gap-key">${R.map((r) => html`<span class="${r === state.sel ? "on" : ""}"><span class="sh-swatch" style="background:${r.colour}"></span>${r.name}</span>`)}</div>`}
    <div class="chart" id="sh-gap-chart"></div>
    <p class="hint" style="margin:6px 2px 0">${duel ? t("sh.duel.hint", { a: A.name, b: B?.name || "—" }) : t("sh.gaps.hint", { src: t(`sh.legs.src.${X.fieldLegs().source}`) })}</p>`;
  $$("[data-gm]", el).forEach((b) => b.addEventListener("click", () => { state.gm = b.dataset.gm === "duel" ? "duel" : null; gapsView(el, X); X.changed(); }));
  $("#sh-gref", el)?.addEventListener("change", (e) => { state.gref = e.target.value === "leader" ? null : e.target.value; gapsView(el, X); X.changed(); });
  $("#sh-gx", el)?.addEventListener("change", (e) => { state.gx = e.target.value === "ctrl" ? null : e.target.value; gapsView(el, X); X.changed(); });
  $("#sh-da", el)?.addEventListener("change", (e) => { state.da = Number(e.target.value); gapsView(el, X); X.changed(); });
  $("#sh-db", el)?.addEventListener("change", (e) => { state.ref = X.runners.find((r) => r.uid === Number(e.target.value)) || null; gapsView(el, X); X.changed(); });
  const labels = Array.from({ length: legsN + 1 }, (_, j) => ctrlLabel(j));
  if (duel) {
    if (!B) return;
    const la = legsOf(A), lb = legsOf(B), values = la.map((v, i) => (v != null && lb[i] != null ? lb[i] - v : null));
    duelChart($("#sh-gap-chart", el), { categories: labels.slice(1), values, fmtY: signed,
      tip: (i) => `<b>${esc(labels[i + 1])}</b><br>${esc(A.name)} ${la[i] != null ? clock(la[i]) : "—"} · ${esc(B.name)} ${lb[i] != null ? clock(lb[i]) : "—"}${values[i] == null ? "" : `<br>${esc(t(values[i] >= 0 ? "sh.duel.won" : "sh.duel.lost", { a: A.name, d: clock(Math.abs(values[i])) }))}`}`,
      onClick: (i) => X.setLeg(i + 1) });
    return;
  }
  const field = X.fieldLegs().all;
  const ref = refRunner ? referenceCum("runner", field, legsN, legsOf(refRunner)) : referenceCum(gref, field, legsN);
  const dist = state.gx === "dist", xs = dist ? X.courseKm() : labels.map((_, j) => j);
  const series = R.map((r) => { const c = cumOf(legsOf(r)); return { name: r.name, color: r.colour, bold: r === state.sel, data: c.map((v, j) => [xs[j], v != null && ref[j] != null ? v - ref[j] : null, j]) }; });
  gapChart($("#sh-gap-chart", el), { series, xLabels: dist ? null : labels, xName: dist ? "km" : "", fmtX: (v) => fmt(v, 1), fmtY: signed,
    onClick: (i, j) => X.jump(R[i], j) });
}

// ---- route choices on a leg
function variantsView(el, X) {
  const { legsN, legName, legTime } = X;
  if (!X.leg) {
    el.innerHTML = html`<p class="hint" style="margin:4px 2px 8px">${t("sh.var.pick")}</p>
      <label class="field"><span>${t("sh.leg")}</span><select id="sh-var-leg"><option value="0">—</option>${Array.from({ length: legsN }, (_, j) => html`<option value="${j + 1}">${legName(j + 1)}</option>`)}</select></label>`;
    $("#sh-var-leg", el).addEventListener("change", (e) => { if (Number(e.target.value)) X.setLeg(Number(e.target.value)); });
    return;
  }
  // the routes coloured by variant from the start (owner, 2026-11-05), until unticked in this visit
  if (X.state.varColour !== false && X.colourBy() !== "variant") X.setColourBy("variant");
  const j = X.leg, V = X.variants();
  if (!V.items.length) { el.innerHTML = html`<div class="empty">${t("sh.noTraces")}</div>`; return; }
  const col = (i) => X.VARIANT_COLOURS[i % X.VARIANT_COLOURS.length];
  const byUid = new Map(X.runners.map((r) => [r.uid, r]));
  // an edit freezes the leg's grouping as it stands, then changes it
  const edit = (fn) => {
    const tags = { th: V.th, names: Object.fromEntries(V.list.filter((v) => v.name).map((v) => [v.key, v.name])), assign: Object.fromEntries(V.of) };
    fn(tags);
    X.setTags(j, tags);
  };
  const freeKey = () => { const used = new Set(V.list.map((v) => v.key)); let i = 0; while (used.has(variantKey(i))) i++; return variantKey(i); };
  el.innerHTML = html`<div class="filters sh-gap-tools">
      <label class="field"><span>${t("sh.leg")}</span><select id="sh-var-leg"><option value="0">${t("sh.leg.all")}</option>${Array.from({ length: legsN }, (_, i) => html`<option value="${i + 1}" ${raw(i + 1 === j ? "selected" : "")}>${legName(i + 1)}</option>`)}</select></label>
      <label class="field"><span>${t("sh.var.th")}</span><span class="row" style="gap:6px"><input type="range" id="sh-var-th" min="10" max="300" step="5" value="${V.th}"><b class="num" id="sh-var-thv">${V.th} m</b></span></label>
      <label class="an-opt"><input type="checkbox" id="sh-var-colour" ${raw(X.colourBy() === "variant" ? "checked" : "")}> ${t("sh.var.colour")}</label>
      ${V.manual || V.local ? html`<button type="button" class="btn btn-sm" id="sh-var-reset">${t(V.shared && V.local ? "sh.var.toShared" : "sh.var.auto")}</button>` : ""}
      ${X.organiser && V.local ? html`<button type="button" class="btn btn-sm btn-primary" id="sh-var-share">${t("sh.var.share")}</button>` : ""}</div>
    <p class="hint" style="margin:0 2px 8px">${t(V.manual ? "sh.var.manual" : "sh.var.autoHint")} ${t(X.organiser ? "sh.var.where.org" : "sh.var.where")}${V.shared && !V.local ? ` ${t("sh.var.fromOrg")}` : ""}</p>
    <div class="table-wrap"><table class="data compact sh-var"><thead><tr><th>${t("sh.var.col.variant")}</th><th class="r">${t("sh.var.col.n")}</th><th class="r">${t("an.col.best")}</th><th class="r">${t("sh.var.col.median")}</th><th class="r">${t("sh.var.col.len")}</th><th>${t("sh.var.col.merge")}</th></tr></thead>
      <tbody>${V.list.map((v, i) => html`<tr><td><span class="sh-swatch" style="background:${col(i)}"></span> <b>${v.key}</b> <input class="sh-var-name" data-vname="${v.key}" value="${v.name}" placeholder="${t("sh.var.name.ph")}" maxlength="40"></td>
        <td class="r num">${v.uids.length}</td><td class="r num">${clock(v.best)}</td><td class="r num">${clock(v.median)}</td><td class="r num">${fmt(v.len)} m</td>
        <td>${V.list.length > 1 ? html`<select data-vmerge="${v.key}"><option value="">—</option>${V.list.filter((w) => w !== v).map((w) => html`<option value="${w.key}">${w.name || w.key}</option>`)}</select>` : ""}</td></tr>`)}</tbody></table></div>
    <div class="table-wrap" style="margin-top:8px"><table class="data compact sh-var"><thead><tr><th>${t("prov.name")}</th><th class="r">${t("an.col.time")}</th><th class="r">${t("an.col.trace")}</th><th>${t("sh.var.col.variant")}</th></tr></thead>
      <tbody>${[...V.items].sort((a, b) => a.time - b.time).map((it) => { const r = byUid.get(it.uid), k = V.of.get(it.uid);
        return html`<tr><td><span class="sh-swatch" style="background:${r.colour}"></span> ${r.name}</td><td class="r num">${clock(legTime(r, j))}</td><td class="r num">${fmt(it.len)} m</td>
          <td><select data-vrun="${it.uid}">${V.list.map((v) => html`<option value="${v.key}" ${raw(v.key === k ? "selected" : "")}>${v.name ? `${v.key} · ${v.name}` : v.key}</option>`)}<option value="+">${t("sh.var.new")}</option></select></td></tr>`; })}</tbody></table></div>`;
  const th = $("#sh-var-th", el);
  th.addEventListener("input", () => { $("#sh-var-thv", el).textContent = `${th.value} m`; });
  th.addEventListener("change", () => {
    const v = Number(th.value);
    if (V.manual) edit((tags) => { tags.th = v; });                         // a frozen grouping: the threshold for new traces only
    else X.setTags(j, { th: v, names: Object.fromEntries(V.list.filter((x) => x.name).map((x) => [x.key, x.name])) });
  });
  $("#sh-var-colour", el).addEventListener("change", (e) => { X.state.varColour = e.target.checked; X.setColourBy(e.target.checked ? "variant" : "runner"); });
  $("#sh-var-leg", el).addEventListener("change", (e) => X.setLeg(Number(e.target.value)));
  $("#sh-var-reset", el)?.addEventListener("click", () => X.setTags(j, null));
  $("#sh-var-share", el)?.addEventListener("click", async (e) => { e.target.disabled = true; try { await X.shareTags(j); } catch (err) { e.target.disabled = false; alertBox(X.errText(err)); } });
  $$("[data-vname]", el).forEach((inp) => inp.addEventListener("change", () => edit((tags) => { if (inp.value.trim()) tags.names[inp.dataset.vname] = inp.value.trim(); else delete tags.names[inp.dataset.vname]; })));
  $$("[data-vmerge]", el).forEach((s) => s.addEventListener("change", () => { const from = s.dataset.vmerge, into = s.value; if (!into) return;
    edit((tags) => { for (const u of Object.keys(tags.assign)) if (tags.assign[u] === from) tags.assign[u] = into; delete tags.names[from]; }); }));
  $$("[data-vrun]", el).forEach((s) => s.addEventListener("change", () => { const k = s.value === "+" ? freeKey() : s.value; edit((tags) => { tags.assign[s.dataset.vrun] = k; }); }));
}

// ---- corridor and compass exercises
function exercisesView(el, X) {
  const { legsN, legName, state } = X;
  const list = X.exercises(), d = X.draft;
  const legOpts = (sel, whole) => html`${whole ? html`<option value="0" ${raw(!sel ? "selected" : "")}>${t("sh.leg.all")}</option>` : ""}${Array.from({ length: legsN }, (_, j) => html`<option value="${j + 1}" ${raw(j + 1 === sel ? "selected" : "")}>${legName(j + 1)}</option>`)}`;
  if (d) {
    el.innerHTML = html`<div class="filters sh-gap-tools">
        <b>${t(`sh.ex.new.${d.kind}`)}</b>
        <label class="field"><span>${t("sh.ex.name")}</span><input id="sh-ex-name" value="${d.name}" maxlength="60" style="width:200px"></label>
        <label class="field"><span>${t("sh.leg")}</span><select id="sh-ex-leg">${legOpts(d.leg, d.kind === "corridor")}</select></label>
        <label class="field"><span>${t("sh.ex.width")}</span><span class="row" style="gap:4px;align-items:center"><input type="number" id="sh-ex-w" min="2" max="1000" step="1" value="${d.w}" style="width:80px"> m</span></label></div>
      ${d.kind === "corridor" ? html`<p class="hint" style="margin:0 2px 8px">${t("sh.ex.draw", { n: d.pts.length })}</p>` : html`<p class="hint" style="margin:0 2px 8px">${t("sh.ex.compass.hint")}</p>`}
      <div class="row" style="gap:6px">${d.kind === "corridor" ? html`<button type="button" class="btn btn-sm" id="sh-ex-undo" ${raw(d.pts.length ? "" : "disabled")}>${t("an.cal.undo")}</button>` : ""}
        <button type="button" class="btn btn-sm btn-primary" id="sh-ex-save" ${raw(d.kind === "corridor" && d.pts.length < 2 || d.kind === "compass" && !d.leg ? "disabled" : "")}>${t("sh.save")}</button>
        <button type="button" class="btn btn-sm" id="sh-ex-cancel">${t("sh.cancel")}</button><span class="muted" id="sh-ex-note"></span></div>`;
    $("#sh-ex-name", el).addEventListener("input", (e) => { d.name = e.target.value; });
    $("#sh-ex-leg", el).addEventListener("change", (e) => { d.leg = Number(e.target.value); X.setDraft(d); if (d.leg) X.setLeg(d.leg); });
    $("#sh-ex-w", el).addEventListener("input", (e) => { const w = Number(e.target.value); if (w >= 2 && w <= 1000) { d.w = w; X.redrawMap(); } });
    $("#sh-ex-undo", el)?.addEventListener("click", () => { d.pts.pop(); X.setDraft(d); });
    $("#sh-ex-cancel", el).addEventListener("click", () => X.setDraft(null));
    $("#sh-ex-save", el).addEventListener("click", async () => {
      const e = { id: Math.random().toString(36).slice(2, 10), kind: d.kind, leg: d.leg || 0, w: d.w, name: d.name.trim(), ...(d.kind === "corridor" ? { pts: d.pts.map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10]) } : {}) };
      try { await X.saveExercises([...list, e]); state.ex = e.id; X.setDraft(null); X.changed(); } catch (err) { $("#sh-ex-note", el).textContent = X.errText(err); }
    });
    return;
  }
  const ex = list.find((e) => e.id === state.ex) || list[0] || null;
  if (ex && state.ex !== ex.id) state.ex = ex.id;
  const exName = (e) => e.name || t(`sh.ex.kind.${e.kind}`);
  const newDraft = (kind) => X.setDraft({ kind, leg: kind === "compass" ? X.leg || 1 : X.leg || 0, w: kind === "compass" ? 50 : 40, name: "", pts: [] });
  el.innerHTML = html`<div class="filters sh-gap-tools">
      ${list.length ? html`<div class="seg" role="group">${list.map((e) => html`<button type="button" data-ex="${e.id}" aria-pressed="${e === ex}">${exName(e)}</button>`)}</div>` : ""}
      ${X.organiser ? html`<button type="button" class="btn btn-sm" id="sh-ex-corr">${t("sh.ex.new.corridor")}</button><button type="button" class="btn btn-sm" id="sh-ex-comp">${t("sh.ex.new.compass")}</button>` : ""}</div>
    ${ex ? html`<div class="filters sh-gap-tools">
        <span class="muted">${t(`sh.ex.kind.${ex.kind}`)} · ${ex.leg ? legName(ex.leg) : t("sh.leg.all")}</span>
        <label class="field"><span>${t("sh.ex.width")}</span><span class="row" style="gap:6px"><input type="range" id="sh-ex-wr" min="5" max="200" step="1" value="${X.exWidth(ex)}"><b class="num" id="sh-ex-wv">${X.exWidth(ex)} m</b></span></label>
        ${X.organiser ? html`<button type="button" class="btn btn-sm" id="sh-ex-del">${t("sh.remove")}</button>` : ""}</div>
      <div id="sh-ex-table"></div>
      <p class="hint" style="margin:6px 2px 0">${t(ex.kind === "compass" ? "sh.ex.rule.compass" : "sh.ex.rule")} ${t(X.organiser ? "sh.ex.width.org" : "sh.ex.width.you")}</p>`
      : html`<p class="hint" style="margin:4px 2px 0">${t(X.organiser ? "sh.ex.none.org" : "sh.ex.none")}</p>`}`;
  $$("[data-ex]", el).forEach((b) => b.addEventListener("click", () => X.pickExercise(list.find((e) => e.id === b.dataset.ex))));
  $("#sh-ex-corr", el)?.addEventListener("click", () => newDraft("corridor"));
  $("#sh-ex-comp", el)?.addEventListener("click", () => newDraft("compass"));
  if (!ex) return;
  const table = () => {
    const rows = X.exScores(ex).sort((a, b) => (b.inside ?? -1) - (a.inside ?? -1));
    $("#sh-ex-table", el).innerHTML = rows.length ? html`<div class="table-wrap"><table class="data compact sh-var"><thead><tr><th>${t("prov.name")}</th><th class="r">${t(ex.kind === "compass" ? "sh.ex.col.insideCompass" : "sh.ex.col.inside")}</th><th class="r">${t("sh.ex.col.out")}</th>
        <th class="r">${t("sh.ex.col.max")}</th><th class="r">${t("sh.ex.col.mean")}</th>${ex.kind === "compass" ? html`<th class="r">${t("sh.ex.col.bearing")}</th>` : ""}</tr></thead>
      <tbody>${rows.map((x) => html`<tr><td><span class="sh-swatch" style="background:${x.r.colour}"></span> ${x.r.name}</td><td class="r num"><b>${x.inside != null ? pctN(Math.round(100 * x.inside)) : "—"}</b></td>
        <td class="r num">${clock(x.outS)}</td><td class="r num">${fmt(x.maxDev)} m</td><td class="r num">${x.meanDev != null ? `${fmt(x.meanDev)} m` : "—"}</td>
        ${ex.kind === "compass" ? html`<td class="r num">${x.bearing != null ? `${x.bearing >= 0 ? "+" : "−"}${fmt(Math.abs(x.bearing), 1)}°` : "—"}</td>` : ""}</tr>`)}</tbody></table></div>`
      : html`<div class="empty">${t("sh.noTraces")}</div>`;
  };
  table();
  const wr = $("#sh-ex-wr", el);
  wr.addEventListener("input", () => { $("#sh-ex-wv", el).textContent = `${wr.value} m`; X.setExWidth(ex, Number(wr.value), false); table(); });
  if (X.organiser) wr.addEventListener("change", () => X.setExWidth(ex, Number(wr.value), true));
  $("#sh-ex-del", el)?.addEventListener("click", async () => { if (!(await confirmBox(t("sh.ex.del.confirm"), { ok: t("sh.remove") }))) return; await X.saveExercises(list.filter((e) => e !== ex)); state.ex = null; X.changed(); });
}
