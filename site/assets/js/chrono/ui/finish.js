// This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not
// distributed with this file, You can obtain one at https://mozilla.org/MPL/2.0/.

// « Arrivée »: where cards are read. The last card in large — who, the verdict, the time, what is missing —, what waits
// for someone (a card nobody holds, no finish punch, a runner still out after closing) and the cards read lately.

import { t } from "../lib/i18n.js";
import { html, raw, icon, formDialog, statusTag, atClock } from "./kit.js";
import { clock, span } from "../times.js";
import { runnerDialog, readDialog, unknownDialog, manualDialog, runnerSearch } from "./dialogs.js";

const who = (r) => `${r.given || ""} ${r.family || ""}`.trim();

/** One problem as a line with what to do about it. */
export function problemLine(ctx, p) {
  const st = ctx.st(), r = p.runner ? st.runners[p.runner] : null, name = r ? who(r) : "";
  const text = { unknown: t("chr.pb.unknown", { n: p.card }), doubt: t("chr.pb.doubt", { n: p.card }), nofinish: t("chr.pb.nofinish", { name }), nostart: t("chr.pb.nostart", { name }),
    mp: t("chr.pb.mp", { name, codes: (ctx.view().byRunner.get(p.runner)?.missing || []).join(", ") }), out: t("chr.pb.out", { name }), reread: t("chr.pb.reread", { name, n: p.n }),
    dupcard: t("chr.pb.dupcard", { n: p.card, names: (p.runners || []).map((id) => who(st.runners[id] || {})).join(", ") }), nocls: t("chr.pb.nocls", { name }),
    nocourse: t("chr.pb.nocourse", { name: st.classes[p.cls]?.name || "" }), clock: t("chr.pb.clock", { code: p.code, n: p.n }), rent: t("chr.pb.rent", { name, n: r?.card || "" }), unpaid: t("chr.pb.unpaid", { name, fee: r?.fee ?? "" }) }[p.kind] || p.kind;
  const act = { unknown: "assign", doubt: "assign", nofinish: "read", nostart: "read", mp: "read", out: "manual", reread: "runner", dupcard: "runner", nocls: "runner", rent: "back", unpaid: "paid" }[p.kind] || "";
  return html`<li class="chr-pb ${p.level}" data-kind="${p.kind}" data-read="${p.read || ""}" data-runner="${p.runner || p.runners?.[0] || ""}">${icon(p.level === "info" ? "check" : "alert", 16)}<span>${text}</span>
    ${p.kind === "mp" ? html`<button type="button" class="btn btn-sm" data-act="seen">${t("chr.pb.seen")}</button>` : ""}
    ${act ? html`<button type="button" class="btn btn-sm" data-act="${act}">${t(`chr.pb.act.${act}`)}</button>` : ""}</li>`;
}
export function bindProblems(ctx, root) {
  root.querySelectorAll(".chr-pb [data-act]").forEach((b) => b.addEventListener("click", () => {
    const li = b.closest("li"), read = li.dataset.read, runner = li.dataset.runner, a = b.dataset.act;
    if (a === "assign") unknownDialog(ctx, read);
    else if (a === "read") readDialog(ctx, read);
    else if (a === "manual") manualDialog(ctx, runner);
    else if (a === "runner") runnerDialog(ctx, runner);
    else if (a === "back") ctx.put("runners", runner, { rent: 2 });
    else if (a === "paid") ctx.put("runners", runner, { paid: 1 });
    else if (a === "seen") ctx.log.add("edit", { id: read, e: { ...(ctx.st().reads[read]?.ed || {}), seen: 1 } }, ctx.by);
  }));
}

function lastCard(ctx) {
  const st = ctx.st(), v = ctx.view();
  const reads = Object.values(st.reads), id = ctx.lastRead?.id && st.reads[ctx.lastRead.id] ? ctx.lastRead.id : reads.sort((a, b) => b.at - a.at)[0]?.id;
  const read = id ? st.reads[id] : null;
  if (!read) return html`<div class="chr-last empty">${icon("card", 40)}<p>${ctx.devices.readers.length ? t("chr.fin.wait") : t("chr.fin.noReader")}</p></div>`;
  const row = read.runner ? v.byRunner.get(read.runner) : null;
  if (!row) return html`<div class="chr-last bad" data-read="${read.id}"><div class="chr-last-st">${t("chr.fin.unknown")}</div><h2>${t("chr.read.card", { n: read.card })}</h2>
    <p>${t("chr.read.n", { n: read.punches.length })}${read.finish != null ? ` · ${clock(read.finish)}` : ""}</p>
    <p><button type="button" class="btn btn-primary" data-do="assign">${t("chr.pb.act.assign")}</button></p></div>`;
  const course = v.courses.find((c) => c.id === row.course), crow = course?.rows.find((r) => r.id === row.id) || row, of = course ? course.rows.filter((r) => r.place).length : 0;
  const stale = read.id !== row.read;
  return html`<div class="chr-last ${row.status === "ok" ? "ok" : "bad"}" data-read="${read.id}" data-runner="${row.id}">
    <div class="chr-last-st">${statusTag(row.status)}${ctx.lastRead?.dup && ctx.lastRead.id === read.id ? html` <span class="chr-chip">${t("chr.fin.dup")}</span>` : ""}${stale ? html` <span class="chr-chip bad">${t("chr.fin.older")}</span>` : ""}</div>
    <h2>${who(row)}</h2><p class="chr-last-sub">${[row.club, row.clsName, course?.name].filter(Boolean).join(" · ")}</p>
    <div class="chr-last-nums"><div><b>${row.time != null ? span(row.time) : "—"}</b><span>${t("chr.col.time")}</span></div>
      ${row.points != null ? html`<div><b>${row.points}</b><span>${t("chr.col.points")}</span></div>` : ""}
      <div><b>${crow.place ? `${crow.place}${of ? ` / ${of}` : ""}` : "—"}</b><span>${t("chr.col.place")}</span></div>
      <div><b>${crow.behind ? `+${span(crow.behind)}` : "—"}</b><span>${t("chr.col.behind")}</span></div></div>
    ${row.missing.length ? html`<p class="chr-last-miss">${t("chr.read.missing", { codes: row.missing.join(", ") })}</p>` : ""}
    ${row.extra.length ? html`<p class="chr-dim">${t("chr.fin.extra", { codes: row.extra.map((p) => p[0]).join(", ") })}</p>` : ""}
    ${row.rent === 1 ? html`<p class="chr-last-rent">${icon("card", 16)} ${t("chr.rc.rent")} <button type="button" class="btn btn-sm" data-do="back">${t("chr.pb.act.back")}</button></p>` : ""}
    <p class="chr-last-acts"><button type="button" class="btn" data-do="print">${icon("print", 14)} ${t("chr.fin.receipt")}</button> <button type="button" class="btn" data-do="read">${icon("edit", 14)} ${t("chr.fin.fix")}</button>
      <button type="button" class="btn" data-do="runner">${icon("user", 14)} ${t("chr.fin.entry")}</button> <button type="button" class="btn" data-do="assign">${icon("swap", 14)} ${t("chr.fin.other")}</button></p></div>`;
}

export const post = {
  ribbon(ctx) {
    const D = ctx.devices;
    return [{ label: t("chr.kit.readers"), items: [
      { icon: "plug", label: D.readers.length ? t("chr.fin.plugged", { n: D.readers.length }) : "SPORTident", primary: !D.readers.length, tip: t("chr.kit.plugTip"), on: () => D.connect(ctx.st().event.timing === "emit" ? "emit" : "si") },
      { icon: "print", label: t("chr.fin.auto"), pressed: !!D.printer.auto, tip: t("chr.kit.prAuto"), on: () => D.setPrinter({ auto: !D.printer.auto }) },
    ] }, { label: t("chr.fin.byHand"), items: [
      { icon: "edit", label: t("chr.man.title"), tip: t("chr.man.tip"), on: () => formDialog({ title: t("chr.man.title"), ok: "", cancel: t("chr.close"),
        body: html`<input type="search" id="chr-man-q" placeholder="${t("chr.unk.search")}" autofocus autocomplete="off"><div class="chr-picks" id="chr-man-l"></div>`,
        onOpen(dlg) { runnerSearch(ctx, dlg.querySelector("#chr-man-q"), dlg.querySelector("#chr-man-l"), (r) => { dlg.end(null); manualDialog(ctx, r.id); }); } }) },
    ] }];
  },
  mount(ctx, el) {
    el.innerHTML = html`<div class="chr-fin"><div id="chr-fin-last"></div><div class="chr-card chr-fin-pb"><h3>${t("chr.fin.todo")} <small id="chr-fin-n"></small></h3><ul id="chr-fin-list" class="chr-pbs"></ul></div>
      <div class="chr-card chr-fin-recent"><h3>${t("chr.fin.recent")}</h3><div id="chr-fin-recent"></div></div></div>`.toString();
    function draw() {
      const st = ctx.st(), v = ctx.view(), last = el.querySelector("#chr-fin-last");
      last.innerHTML = String(lastCard(ctx));
      last.querySelectorAll("[data-do]").forEach((b) => b.addEventListener("click", () => {
        const box = b.closest(".chr-last"), a = b.dataset.do;
        if (a === "print") ctx.printReceipt(box.dataset.runner).then((ok) => { if (ok === false && ctx.devices.printer.mode === "none") ctx.toast(t("chr.fin.noPrinter"), "warn"); });
        else if (a === "read") readDialog(ctx, box.dataset.read);
        else if (a === "runner") runnerDialog(ctx, box.dataset.runner);
        else if (a === "assign") unknownDialog(ctx, box.dataset.read);
        else if (a === "back") ctx.put("runners", box.dataset.runner, { rent: 2 });
      }));
      const pb = ctx.problems().filter((p) => p.level !== "info" || p.kind === "rent");
      el.querySelector("#chr-fin-n").textContent = pb.length || "";
      el.querySelector("#chr-fin-list").innerHTML = pb.length ? pb.slice(0, 40).map((p) => problemLine(ctx, p)).join("") : html`<li class="chr-pb none">${icon("check", 16)}<span>${t("chr.fin.nothing")}</span></li>`.toString();
      bindProblems(ctx, el);
      const recent = Object.values(st.reads).sort((a, b) => b.at - a.at).slice(0, 14);
      el.querySelector("#chr-fin-recent").innerHTML = recent.length ? html`<table class="data chr-t"><tbody>${recent.map((rd) => {
        const row = rd.runner ? v.byRunner.get(rd.runner) : null;
        return html`<tr data-read="${rd.id}"><td class="num">${atClock(rd.at)}</td><td class="num">${rd.card}</td><td>${row ? who(row) : html`<span class="chr-warn">${rd.runner === 0 ? t("chr.fin.aside") : t("chr.fin.unknown")}</span>`}</td>
          <td>${row?.clsName || ""}</td><td>${row ? statusTag(row.status) : ""}</td><td class="num">${row?.time != null ? span(row.time) : ""}</td><td class="num">${row?.place ?? ""}</td></tr>`;
      })}</tbody></table>`.toString() : html`<p class="chr-empty">${t("chr.fin.noneYet")}</p>`.toString();
      el.querySelectorAll("#chr-fin-recent tr").forEach((tr) => tr.addEventListener("click", () => { ctx.lastRead = { id: tr.dataset.read, at: Date.now() }; ctx.refresh(); }));
    }
    draw();
    return { update: draw };
  },
};
