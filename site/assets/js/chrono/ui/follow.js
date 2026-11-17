// « Suivi », « Speaker », « Arbitre », « Postes »: the posts that watch the race. Suivi lists every class or course as it
// stands; Speaker shows who just came in and who leads; Arbitre holds the record of every change made by hand and the
// complaints; Postes tells which units are punched, by how many, and which may be at fault.

import { t, tn } from "../../i18n.js";
import { html, raw, icon, formDialog, values, field, opt, printHtml, openPage, download, statusTag, atClock } from "./kit.js";
import { clock, span, parseClock } from "../times.js";
import { opMs } from "../log.js";
import { punchesOf } from "../judge.js";
import { resultsHtml } from "../print/lists.js";
import { runnerDialog, readDialog, manualDialog, runnerSearch } from "./dialogs.js";
import { listLabels } from "./prepare.js";

const who = (r) => `${r.given || ""} ${r.family || ""}`.trim();
const groupsOf = (ctx) => ((ctx.ui.by || ctx.rules().resultsBy) === "course" ? ctx.view().courses : ctx.view().classes);

/** A runner's race in detail: the controls with times and places; from there, the entry or the card. */
export function runnerSheet(ctx, id) {
  const v = ctx.view(), base = v.byRunner.get(id);
  if (!base) return null;
  const course = v.courses.find((c) => c.id === base.course), row = course?.rows.find((r) => r.id === id) || base;
  return formDialog({ title: who(row), ok: "", cancel: t("chr.close"), wide: true,
    extra: html`<button type="button" class="btn" data-a="runner">${icon("user", 14)} ${t("chr.fin.entry")}</button>${row.read ? html`<button type="button" class="btn" data-a="read">${icon("edit", 14)} ${t("chr.fin.fix")}</button>
      <button type="button" class="btn" data-a="print">${icon("print", 14)} ${t("chr.fin.receipt")}</button>` : html`<button type="button" class="btn" data-a="manual">${t("chr.man.title")}</button>`}`,
    body: html`<p>${[row.club, row.clsName, course?.name].filter(Boolean).join(" · ")} · ${statusTag(row.status)}${row.manual ? html` <span class="chr-chip">${t("chr.ref.byHand")}</span>` : ""}</p>
      <p>${t("chr.col.start")} <b>${clock(row.start) || "—"}</b> · ${t("chr.rc.finish")} <b>${clock(row.finish) || "—"}</b> · ${t("chr.col.time")} <b>${row.time != null ? span(row.time) : "—"}</b>${row.place ? html` · ${t("chr.col.place")} <b>${row.place}</b>` : ""}</p>
      ${row.splits.length ? html`<table class="data chr-t"><thead><tr><th class="num">#</th><th class="num">${t("chr.rc.code")}</th><th class="num">${t("chr.col.time")}</th><th class="num">${t("chr.col.place")}</th><th class="num">${t("chr.rc.leg")}</th><th class="num">${t("chr.col.place")}</th></tr></thead>
        <tbody>${row.splits.map((s, i) => html`<tr class="${s.t == null ? "chr-row-warn" : ""}"><td class="num">${i + 1}</td><td class="num">${s.code}</td><td class="num">${s.t == null ? "—" : span(s.t)}</td><td class="num">${s.p ?? ""}</td>
          <td class="num">${s.leg == null ? "" : span(s.leg)}</td><td class="num">${s.lp ?? ""}</td></tr>`)}</tbody></table>` : ""}
      ${row.extra.length ? html`<p class="chr-dim">${t("chr.fin.extra", { codes: row.extra.map((p) => p[0]).join(", ") })}</p>` : ""}`,
    onOpen(dlg) { dlg.querySelectorAll("[data-a]").forEach((b) => b.addEventListener("click", () => { dlg.end(null); const a = b.dataset.a; if (a === "runner") runnerDialog(ctx, id); else if (a === "read") readDialog(ctx, row.read); else if (a === "manual") manualDialog(ctx, id); else ctx.printReceipt(id); })); } });
}

const follow = {
  ribbon(ctx) {
    const by = ctx.ui.by || ctx.rules().resultsBy, L = () => listLabels(t("chr.lst.results"));
    return [{ label: t("chr.fol.show"), items: [
      { icon: "list", label: t("chr.sta.byClass"), pressed: by !== "course", on: () => { ctx.ui.by = "class"; ctx.ui.group = null; } },
      { icon: "list", label: t("chr.sta.byCourse"), pressed: by === "course", on: () => { ctx.ui.by = "course"; ctx.ui.group = null; } },
      { icon: "go", label: t("chr.fol.out"), pressed: ctx.ui.group === "*out", tip: t("chr.fol.outTip"), on: () => { ctx.ui.group = ctx.ui.group === "*out" ? null : "*out"; } },
    ] }, { label: t("chr.rb.print"), items: [
      { icon: "print", label: t("chr.lst.results"), on: () => printHtml(resultsHtml(ctx.view(), groupsOf(ctx), L(), { cat: by === "course" })) },
      { icon: "print", label: t("chr.fol.splits"), on: () => printHtml(resultsHtml(ctx.view(), groupsOf(ctx), L(), { cat: by === "course", splits: true })) },
      { icon: "tv", label: t("chr.fol.screen"), tip: t("chr.fol.screenTip"), on: () => openPage(resultsHtml(ctx.view(), groupsOf(ctx), L(), { cat: by === "course", tv: true })) },
    ] }];
  },
  mount(ctx, el) {
    el.innerHTML = html`<div class="chr-fol"><nav id="chr-fol-g" class="chr-fol-g"></nav><div id="chr-fol-t" class="chr-card"></div></div>`.toString();
    function draw() {
      const groups = groupsOf(ctx).filter((g) => g.rows.length), now = ctx.now(), course = (ctx.ui.by || ctx.rules().resultsBy) === "course";
      if (ctx.ui.group !== "*out" && !groups.some((g) => (g.id || "") === ctx.ui.group)) ctx.ui.group = groups[0]?.id || "";
      el.querySelector("#chr-fol-g").innerHTML = groups.map((g) => { const done = g.rows.filter((r) => r.read || r.manual).length; return html`<button type="button" data-g="${g.id || ""}" aria-current="${String((g.id || "") === ctx.ui.group)}"><b>${g.name || "—"}</b><span>${done} / ${g.rows.length}</span></button>`; }).join("");
      el.querySelectorAll("#chr-fol-g button").forEach((b) => b.addEventListener("click", () => { ctx.ui.group = b.dataset.g; ctx.refresh(); }));
      const box = el.querySelector("#chr-fol-t"), keep = box.querySelector(".table-wrap")?.scrollTop || 0;
      if (ctx.ui.group === "*out") {
        const out = [...ctx.view().byRunner.values()].filter((r) => r.status === "run").sort((a, b) => (a.start ?? 0) - (b.start ?? 0));
        box.innerHTML = html`<h3>${t("chr.fol.out")} <small>${out.length}</small></h3>${out.length ? html`<div class="table-wrap chr-tw"><table class="data chr-t"><thead><tr><th>${t("chr.col.name")}</th><th>${t("chr.col.club")}</th><th>${t("chr.col.cls")}</th>
          <th class="num">${t("chr.col.card")}</th><th class="num">${t("chr.col.start")}</th><th class="num">${t("chr.fol.since")}</th></tr></thead><tbody>${out.map((r) => html`<tr data-id="${r.id}"><td>${who(r)}</td><td>${r.club}</td><td>${r.clsName}</td>
          <td class="num">${r.card ?? ""}</td><td class="num">${clock(r.start)}</td><td class="num">${r.start != null ? span(now - r.start) : ""}</td></tr>`)}</tbody></table></div>` : html`<p class="chr-empty">${t("chr.fol.noneOut")}</p>`}`.toString();
      } else {
        const g = groups.find((x) => (x.id || "") === ctx.ui.group), c = g ? (course ? g : g.course) : null;
        box.innerHTML = !g ? html`<p class="chr-empty">${t("chr.ent.none")}</p>`.toString() : html`<h3>${g.name || "—"} <small>${[c?.length ? `${(c.length / 1000).toFixed(1)} km` : "", c?.climb ? `${c.climb} m` : "", c?.controls?.length ? tn("chr.fol.controls", c.controls.length) : ""].filter(Boolean).join(" · ")}</small></h3>
          <div class="table-wrap chr-tw"><table class="data chr-t"><thead><tr><th class="num">${t("chr.col.place")}</th><th>${t("chr.col.name")}</th><th>${t("chr.col.club")}</th>${course ? html`<th>${t("chr.col.cls")}</th>` : ""}
          ${c?.score ? html`<th class="num">${t("chr.col.points")}</th>` : ""}<th class="num">${t("chr.col.time")}</th><th class="num">${t("chr.col.behind")}</th><th></th></tr></thead>
          <tbody>${g.rows.map((r) => html`<tr data-id="${r.id}"><td class="num">${r.place ?? ""}</td><td>${who(r)}</td><td>${r.club}</td>${course ? html`<td>${r.clsName}</td>` : ""}${c?.score ? html`<td class="num">${r.points ?? ""}</td>` : ""}
            <td class="num">${r.time != null && ["ok", "nc", "mp", "ot"].includes(r.status) ? span(r.time) : r.status === "run" && r.start != null ? html`<i class="chr-dim">${span(now - r.start)}</i>` : r.status === "wait" ? html`<i class="chr-dim">${clock(r.start)}</i>` : ""}</td>
            <td class="num">${r.behind ? `+${span(r.behind)}` : ""}</td><td>${r.status === "ok" ? "" : statusTag(r.status)}${r.manual ? html` <span class="chr-chip">${t("chr.ref.byHand")}</span>` : ""}</td></tr>`)}</tbody></table></div>`.toString();
      }
      const tw = box.querySelector(".table-wrap"); if (tw) tw.scrollTop = keep;
      box.querySelectorAll("tr[data-id]").forEach((tr) => tr.addEventListener("click", () => runnerSheet(ctx, tr.dataset.id)));
    }
    draw();
    return { update: draw };
  },
};

const speaker = {
  ribbon(ctx) {
    return [{ label: t("chr.post.speaker"), items: [{ icon: "tv", label: t("chr.spk.full"), tip: t("chr.spk.fullTip"), on: () => (document.fullscreenElement ? document.exitFullscreen() : ctx.root.querySelector("#chr-body").requestFullscreen?.()) }] }];
  },
  mount(ctx, el) {
    el.innerHTML = html`<div class="chr-spk"><div class="chr-card"><h3>${t("chr.spk.last")}</h3><div id="chr-spk-last"></div></div><div class="chr-card"><h3>${t("chr.spk.lead")}</h3><div id="chr-spk-lead" class="chr-spk-lead"></div></div>
      <div class="chr-card"><h3>${t("chr.spk.radio")}</h3><div id="chr-spk-radio"></div></div></div>`.toString();
    function draw() {
      const st = ctx.st(), v = ctx.view(), now = Date.now();
      const last = Object.values(st.reads).filter((r) => r.runner && v.byRunner.get(r.runner)?.read === r.id).sort((a, b) => b.at - a.at).slice(0, 12);
      el.querySelector("#chr-spk-last").innerHTML = last.length ? last.map((rd) => { const r = v.byRunner.get(rd.runner), fresh = now - rd.at < 180000; return html`<div class="chr-spk-row ${fresh ? "fresh" : ""} ${r.place && r.place <= 3 ? "podium" : ""}"><i>${r.place ?? "—"}</i><b>${who(r)}</b>
        <span>${r.club}</span><span>${r.clsName}</span><em>${r.status === "ok" ? span(r.time) : t(`chr.st.${r.status}`)}</em><small>${r.behind ? `+${span(r.behind)}` : ""}</small></div>`; }).join("") : html`<p class="chr-empty">${t("chr.fin.noneYet")}</p>`.toString();
      el.querySelector("#chr-spk-lead").innerHTML = v.classes.filter((k) => k.rows.some((r) => r.place)).map((k) => { const out = k.rows.filter((r) => r.status === "run").length; return html`<div class="chr-spk-k"><h4>${k.name} <small>${out ? tn("chr.spk.out", out) : t("chr.spk.done")}</small></h4>
        ${k.rows.filter((r) => r.place && r.place <= 3).map((r) => html`<p><i>${r.place}</i> ${who(r)} <span>${r.club}</span> <em>${span(r.time)}</em></p>`)}</div>`; }).join("") || html`<p class="chr-empty">${t("chr.fin.noneYet")}</p>`.toString();
      const byCard = new Map(Object.values(st.runners).filter((r) => r.card).map((r) => [Number(r.card), r]));
      const radio = [...st.radio].sort((a, b) => (b.at || 0) - (a.at || 0)).slice(0, 14);
      el.querySelector("#chr-spk-radio").innerHTML = radio.length ? radio.map((p) => { const r = byCard.get(Number(p.card)); return html`<div class="chr-spk-row"><i>${p.code}</i><b>${r ? who(r) : p.card}</b><span>${r ? st.classes[r.cls]?.name || "" : ""}</span>
        <em>${clock(p.s)}</em><small>${r?.start != null && p.s != null ? span(p.s - r.start) : ""}</small></div>`; }).join("") : html`<p class="chr-empty">${t("chr.spk.noRadio")}</p>`.toString();
    }
    draw();
    return { update: draw };
  },
};

/** What a hand-made operation did, in words. */
function describe(ctx, o) {
  const st = ctx.st(), nameOf = (id) => who(st.runners[id] || {}) || "?";
  if (o.k === "edit") { const rd = st.reads[o.id]; return o.e ? (Object.keys(o.e).every((k) => k === "seen") ? t("chr.ref.op.seen", { name: nameOf(rd?.runner) }) : t("chr.ref.op.edit", { name: nameOf(rd?.runner), n: rd?.card ?? "" })) : t("chr.ref.op.unedit", { name: nameOf(rd?.runner) }); }
  if (o.k === "assign") { const rd = st.reads[o.id]; return o.runner ? t("chr.ref.op.assign", { n: rd?.card ?? "", name: nameOf(o.runner) }) : t("chr.ref.op.aside", { n: rd?.card ?? "" }); }
  if (o.k === "read" && o.r?.sys === "manual") return t("chr.ref.op.manual", { name: nameOf(o.r.runner), time: clock(o.r.finish) });
  if (o.k === "put" && o.c === "runners" && o.p) {
    const p = o.p, bits = [];
    if ("status" in p) bits.push(p.status ? t("chr.ref.op.status", { status: t(`chr.st.${p.status}`) }) : t("chr.ref.op.statusOff"));
    if ("adj" in p) bits.push(t("chr.ref.op.adj", { s: p.adj ?? 0 }));
    if ("start" in p) bits.push(t("chr.ref.op.start", { time: clock(p.start) || "—" }));
    if ("cls" in p) bits.push(t("chr.ref.op.cls", { cls: st.classes[p.cls]?.name || "—" }));
    if ("card" in p) bits.push(t("chr.ref.op.card", { n: p.card ?? "—" }));
    return bits.length ? `${nameOf(o.id)} : ${bits.join(", ")}` : null;
  }
  if (o.k === "put" && o.c === "runners" && o.p === null) return t("chr.ref.op.del");
  return null;
}
const referee = {
  ribbon(ctx) {
    return [{ label: t("chr.post.referee"), items: [
      { icon: "plus", label: t("chr.ref.complaint"), primary: true, on: () => noteDialog(ctx) },
      { icon: "x", label: t("chr.ref.dsq"), tip: t("chr.ref.dsqTip"), on: () => formDialog({ title: t("chr.ref.dsq"), ok: t("chr.ref.dsq"), danger: true,
        body: html`<input type="search" id="chr-dsq-q" placeholder="${t("chr.unk.search")}" autofocus autocomplete="off"><div class="chr-picks" id="chr-dsq-l"></div><input type="hidden" name="id"><p id="chr-dsq-n"></p>${field(t("chr.ref.reason"), html`<input name="why">`)}`,
        onOpen(dlg) { runnerSearch(ctx, dlg.querySelector("#chr-dsq-q"), dlg.querySelector("#chr-dsq-l"), (r) => { dlg.querySelector("[name=id]").value = r.id; dlg.querySelector("#chr-dsq-n").textContent = who(r); dlg.querySelector("#chr-dsq-l").innerHTML = ""; }); },
        onOk(dlg) { const v = values(dlg); if (!v.id) return false; ctx.put("runners", v.id, { status: "dsq" }); ctx.log.add("note", { x: { kind: "decision", runner: v.id, text: v.why || "" } }, ctx.by); return true; } }) },
      { icon: "down", label: t("chr.ref.export"), on: () => {
        const lines = journal(ctx).map((x) => [new Date(x.at).toLocaleString(), x.st, x.by, x.text].map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";"));
        download("journal.csv", `﻿${[t("chr.ref.when"), t("chr.ref.station"), t("chr.ref.who"), t("chr.ref.what")].join(";")}\r\n${lines.join("\r\n")}`, "text/csv");
      } },
    ] }];
  },
  mount(ctx, el) {
    el.innerHTML = html`<div class="chr-ref"><div class="chr-card"><h3>${t("chr.ref.notes")}</h3><div id="chr-ref-notes"></div></div><div class="chr-card"><h3>${t("chr.ref.journal")} <small id="chr-ref-n"></small></h3><p class="chr-dim">${t("chr.ref.journalHint")}</p><div id="chr-ref-j"></div></div></div>`.toString();
    function draw() {
      const st = ctx.st(), notes = st.notes.filter((n) => n.kind === "complaint" || n.kind === "decision").slice().reverse();
      const answered = new Set(st.notes.filter((n) => n.kind === "decision" && n.re).map((n) => n.re));
      el.querySelector("#chr-ref-notes").innerHTML = notes.length ? notes.map((n) => html`<div class="chr-note-row ${n.kind} ${n.kind === "complaint" && !answered.has(n.id) ? "open" : ""}"><b>${t(`chr.ref.kind.${n.kind}`)}</b> ${n.runner ? html`<span>${who(st.runners[n.runner] || {})}</span>` : ""}
        <p>${n.text || ""}</p><small>${atClock(n.at)} · ${n.by || n.st}</small>${n.kind === "complaint" && !answered.has(n.id) ? html`<button type="button" class="btn btn-sm" data-re="${n.id}">${t("chr.ref.decide")}</button>` : ""}</div>`).join("") : html`<p class="chr-empty">${t("chr.ref.noNotes")}</p>`.toString();
      el.querySelectorAll("[data-re]").forEach((b) => b.addEventListener("click", () => noteDialog(ctx, b.dataset.re)));
      const J = journal(ctx).reverse();
      el.querySelector("#chr-ref-n").textContent = J.length || "";
      el.querySelector("#chr-ref-j").innerHTML = J.length ? html`<div class="table-wrap chr-tw"><table class="data chr-t"><thead><tr><th>${t("chr.ref.when")}</th><th>${t("chr.ref.who")}</th><th>${t("chr.ref.what")}</th></tr></thead>
        <tbody>${J.slice(0, 300).map((x) => html`<tr><td class="num">${atClock(x.at)}</td><td>${x.by || x.st}</td><td>${x.text}</td></tr>`)}</tbody></table></div>`.toString() : html`<p class="chr-empty">${t("chr.ref.noJournal")}</p>`.toString();
    }
    draw();
    return { update: draw };
  },
};
function journal(ctx) {
  const out = [], first = new Set();
  for (const o of ctx.log.ops) {
    // an entry's first writing is its creation (an import, the desk), not a correction
    if (o.k === "put" && o.c === "runners" && !first.has(o.id)) { first.add(o.id); continue; }
    if (o.k === "many") { for (const [c, id] of o.rows || []) if (c === "runners") first.add(id); continue; }
    const text = describe(ctx, o);
    if (text) out.push({ at: opMs(o), st: o.s, by: o.by || "", text });
  }
  return out;
}
function noteDialog(ctx, re = null) {
  return formDialog({ title: re ? t("chr.ref.decide") : t("chr.ref.complaint"), ok: t("chr.save"),
    body: html`${re ? "" : html`<input type="search" id="chr-nt-q" placeholder="${t("chr.ref.about")}" autocomplete="off"><div class="chr-picks" id="chr-nt-l"></div><input type="hidden" name="runner"><p id="chr-nt-n"></p>`}
      ${field(re ? t("chr.ref.decision") : t("chr.ref.text"), html`<textarea name="text" rows="4" required autofocus></textarea>`)}`,
    onOpen(dlg) { if (!re) runnerSearch(ctx, dlg.querySelector("#chr-nt-q"), dlg.querySelector("#chr-nt-l"), (r) => { dlg.querySelector("[name=runner]").value = r.id; dlg.querySelector("#chr-nt-n").textContent = who(r); dlg.querySelector("#chr-nt-l").innerHTML = ""; }); },
    onOk(dlg) { const v = values(dlg); if (!v.text) return false; ctx.log.add("note", { x: re ? { kind: "decision", re, text: v.text } : { kind: "complaint", runner: v.runner || null, text: v.text } }, ctx.by); return true; } });
}

const units = {
  ribbon(ctx) {
    return [{ label: t("chr.post.units"), items: [
      { icon: "plus", label: t("chr.unit.add"), on: () => unitDialog(ctx, null) },
      { icon: "radio", label: t("chr.unit.punch"), tip: t("chr.unit.punchTip"), on: () => formDialog({ title: t("chr.unit.punch"), ok: t("chr.save"),
        body: html`<div class="chr-grid">${field(t("chr.rc.code"), html`<input name="code" data-num required autofocus>`)}${field(t("chr.col.card"), html`<input name="card" data-num required>`)}${field(t("chr.read.time"), html`<input name="s" value="${clock(ctx.now())}">`)}</div>`,
        onOk(dlg) { const v = values(dlg), s = parseClock(v.s); if (!(v.code > 0) || !(v.card > 0) || s == null) { dlg.fail(t("chr.badTime")); return false; } ctx.log.add("punch", { p: { code: v.code, card: v.card, s, at: Date.now(), src: "hand" } }, ctx.by); return true; } }) },
    ] }];
  },
  mount(ctx, el) {
    el.innerHTML = html`<div class="chr-card"><h3>${t("chr.post.units")}</h3><p class="chr-dim">${t("chr.unit.hint")}</p><div id="chr-unit-t"></div></div>`.toString();
    function draw() {
      const st = ctx.st(), v = ctx.view(), stat = new Map();
      const S = (code) => stat.get(code) || stat.set(code, { seen: 0, expected: 0, missing: 0, last: null, courses: new Set(), neg: 0 }).get(code);
      for (const c of Object.values(st.courses)) for (const code of c.controls || []) S(Number(code)).courses.add(c.name);
      for (const code of Object.keys(st.controls)) S(Number(code));
      for (const r of v.byRunner.values()) { if (!r.read) continue; for (const s of r.splits) { const x = S(s.code); x.expected++; if (s.t == null) x.missing++; if (s.leg != null && s.leg < 0) x.neg++; } }
      for (const rd of Object.values(st.reads)) for (const [code, s] of punchesOf(rd)) { const x = S(code); x.seen++; if (!rd.rel && (x.last == null || s > x.last)) x.last = s; }
      const rows = [...stat.entries()].sort((a, b) => a[0] - b[0]);
      el.querySelector("#chr-unit-t").innerHTML = rows.length ? html`<div class="table-wrap chr-tw"><table class="data chr-t"><thead><tr><th class="num">${t("chr.rc.code")}</th><th>${t("chr.prep.courses")}</th><th class="num">${t("chr.unit.seen")}</th>
        <th class="num">${t("chr.unit.missing")}</th><th class="num">${t("chr.unit.last")}</th><th>${t("chr.unit.state")}</th><th></th></tr></thead><tbody>${rows.map(([code, x]) => {
        const c = st.controls[code] || {}, dead = x.expected >= 3 && x.missing === x.expected, weak = x.expected >= 5 && x.missing / x.expected > 0.3, off = x.neg >= 2, stray = !x.courses.size && x.seen > 0;
        return html`<tr data-code="${code}" class="${dead || off ? "chr-row-bad" : weak ? "chr-row-warn" : ""}"><td class="num"><b>${code}</b></td><td>${[...x.courses].join(", ")}</td><td class="num">${x.seen}</td><td class="num">${x.missing || ""}${x.expected ? html` <i class="chr-dim">/ ${x.expected}</i>` : ""}</td>
          <td class="num">${clock(x.last)}</td><td>${dead ? html`<span class="chr-warn">${t("chr.unit.dead")}</span>` : off ? html`<span class="chr-warn">${t("chr.unit.clock")}</span>` : weak ? html`<span class="chr-warn">${t("chr.unit.weak")}</span>` : stray ? t("chr.unit.stray") : x.seen ? t("chr.unit.fine") : ""}</td>
          <td>${[c.radio ? t("chr.unit.radio") : "", c.pts != null ? t("chr.unit.pts", { n: c.pts }) : "", c.any?.length ? `= ${c.any.join(", ")}` : ""].filter(Boolean).join(" · ")}</td></tr>`; })}</tbody></table></div>`.toString() : html`<p class="chr-empty">${t("chr.crs.none")}</p>`.toString();
      el.querySelectorAll("tr[data-code]").forEach((tr) => tr.addEventListener("click", () => unitDialog(ctx, Number(tr.dataset.code))));
    }
    draw();
    return { update: draw };
  },
};
function unitDialog(ctx, code) {
  const c = code ? ctx.st().controls[code] || {} : {};
  return formDialog({ title: code ? t("chr.unit.edit", { code }) : t("chr.unit.add"), ok: t("chr.save"),
    body: html`<div class="chr-grid">${code ? "" : field(t("chr.rc.code"), html`<input name="code" data-num required autofocus>`)}${field(t("chr.unit.ptsField"), html`<input name="pts" data-num value="${c.pts ?? ""}">`, t("chr.unit.ptsHint"))}
      ${field(t("chr.unit.any"), html`<input name="any" value="${(c.any || []).join(" ")}">`, t("chr.unit.anyHint"))}</div><label class="chr-check"><input type="checkbox" name="radio" ${c.radio ? raw("checked") : ""}> ${t("chr.unit.radioField")}</label>`,
    onOk(dlg) { const v = values(dlg), id = code || v.code; if (!(id > 0)) return false; ctx.put("controls", String(id), { pts: v.pts, radio: v.radio ? 1 : null, any: (v.any.match(/\d+/g) || []).map(Number).length ? (v.any.match(/\d+/g) || []).map(Number) : null }); return true; } });
}

export const posts = { follow, speaker, referee, units };
