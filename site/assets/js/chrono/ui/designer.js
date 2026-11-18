// The list designer: an organiser composes their own lists — which rows, grouped how, which columns, sorted how —, sees
// them as they will print, prints them, exports them, and saves them with the event (one event key a list, « list.<id> »,
// so that two stations changing different lists never overwrite each other). The saved lists join the posts' print groups.

import { t, locale } from "../../i18n.js";
import { confirmBox } from "../../askbox.js";
import { html, raw, icon, field, opt, download, printHtml, openPage } from "./kit.js";
import { listLabels } from "./prepare.js";
import { COLUMNS, KINDS, GROUPS, SIZES, STATUSES, columnsOf, defaultList, normalise, savedLists, listHtml, listCsv, newListId } from "../print/designer.js";

const COL_KEY = { place: "chr.col.place", bib: "chr.col.bib", name: "chr.col.name", family: "chr.run.family", given: "chr.run.given", club: "chr.col.club", clubCode: "chr.dsg.col.clubCode",
  cls: "chr.col.cls", cat: "chr.dsg.col.cat", course: "chr.col.course", card: "chr.col.card", lic: "chr.run.lic", birth: "chr.run.birth", sex: "chr.run.sex", nat: "chr.dsg.col.nat",
  start: "chr.col.start", finish: "chr.dsg.col.finish", time: "chr.col.time", behind: "chr.col.behind", status: "chr.run.status", points: "chr.col.points", rent: "chr.run.rent",
  fee: "chr.run.fee", paid: "chr.run.paid", note: "chr.run.note", sign: "chr.dsg.col.sign" };
const colName = (k) => t(COL_KEY[k]);
const byName = (a, b) => String(a.name).localeCompare(String(b.name), undefined, { numeric: true });
const slug = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w-]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "list";
const nameOf = (d) => d.name || t(`chr.dsg.kind.${d.kind}`);

/** An amount as the reader's language writes it, two decimals. */
export function moneyFormat() {
  const nf = new Intl.NumberFormat(locale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (n) => nf.format(Number(n) || 0);
}

/** The labels a composed list needs: the fixed lists' own, every column's name, the words of the empty cases. */
export function designerLabels(def) {
  const cols = {};
  for (const k of Object.keys(COLUMNS)) cols[k] = colName(k);
  return { ...listLabels(nameOf(def)), cols, splits: t("chr.dsg.splitsCol"), empty: t("chr.noMatch"), noClub: t("chr.dsg.noClub"), money: moneyFormat() };
}
const pageOf = (ctx, def) => listHtml(ctx.st(), ctx.view(), def, designerLabels(def));

/** The saved lists as ribbon items (six at most), then the designer itself. */
export function savedItems(ctx) {
  const items = savedLists(ctx.st()).slice(0, 6).map((d) => ({ icon: "print", label: nameOf(d), tip: t("chr.dsg.printTip", { name: nameOf(d) }), on: () => printHtml(pageOf(ctx, d)) }));
  items.push({ icon: "edit", label: t("chr.dsg.open"), tip: t("chr.dsg.openTip"), on: () => designerDialog(ctx) });
  return items;
}

/**
 * The designer, over the window: the saved lists, the settings of the one in hand, its preview. Resolves when closed.
 * What is changed stays in the dialog until « Enregistrer »; closing with unsaved changes asks first.
 */
export function designerDialog(ctx) {
  return new Promise((resolve) => {
    const lists = new Map(savedLists(ctx.st()).map((d) => [d.id, d])), dirty = new Set(), fresh = new Set();
    let cur = lists.keys().next().value ?? null, timer = 0, done = false, asking = false, dragKey = null, savedAt = 0;
    const dlg = document.createElement("dialog");
    dlg.className = "chr-dlg wide chr-dsg";
    dlg.setAttribute("aria-label", t("chr.dsg.title"));
    dlg.innerHTML = html`<div class="chr-dsg-win">
      <h3 class="chr-dsg-head"><span>${t("chr.dsg.title")}</span><button type="button" class="chr-x" data-act="close" title="${t("chr.close")}" aria-label="${t("chr.close")}">${icon("x", 18)}</button></h3>
      <div class="chr-dsg-body">
        <nav class="chr-dsg-lists" aria-label="${t("chr.dsg.mine")}"><h4>${t("chr.dsg.mine")}</h4><div class="chr-dsg-items" data-part="lists"></div>
          <p class="chr-dsg-new"><span>${t("chr.dsg.new")}</span>${KINDS.map((k) => html`<button type="button" class="btn btn-sm" data-new="${k}">${icon("plus", 13)} ${t(`chr.dsg.kind.${k}`)}</button>`)}</p>
          <p class="chr-dsg-tools"><button type="button" class="btn btn-sm" data-act="dup">${t("chr.dsg.dup")}</button> <button type="button" class="btn btn-sm" data-act="del">${icon("trash", 13)} ${t("chr.delete")}</button></p></nav>
        <div class="chr-dsg-set" data-part="set"></div>
        <div class="chr-dsg-prev"><h4>${t("chr.dsg.preview")}</h4><iframe class="chr-dsg-frame" title="${t("chr.dsg.preview")}" sandbox=""></iframe></div>
      </div>
      <div class="chr-dlg-foot"><button type="button" class="btn" data-act="print">${icon("print", 14)} ${t("chr.rb.print")}</button>
        <button type="button" class="btn" data-act="csv" title="${t("chr.dsg.csvTip")}">${icon("down", 14)} ${t("chr.dsg.csv")}</button>
        <button type="button" class="btn" data-act="screen" title="${t("chr.dsg.screenTip")}">${icon("tv", 14)} ${t("chr.dsg.screen")}</button>
        <span class="grow"></span><span class="chr-dsg-state" data-part="state" role="status"></span>
        <button type="button" class="btn btn-primary" data-act="save" title="${t("chr.dsg.saveTip")}">${t("chr.save")}</button><button type="button" class="btn" data-act="close">${t("chr.close")}</button></div>
    </div>`.toString();
    const part = (name) => dlg.querySelector(`[data-part="${name}"]`);
    const def = () => lists.get(cur) || null;

    function drawLists() {
      part("lists").innerHTML = lists.size ? [...lists.values()].sort((a, b) => byName({ name: nameOf(a) }, { name: nameOf(b) })).map((d) => html`<button type="button" class="chr-dsg-item" data-id="${d.id}" aria-current="${d.id === cur ? raw("true") : raw("false")}">
        <b>${nameOf(d)}</b><small>${t(`chr.dsg.kind.${d.kind}`)}${dirty.has(d.id) ? html` · <i>${t("chr.dsg.unsavedTag")}</i>` : ""}</small></button>`).join("") : html`<p class="chr-dim">${t("chr.dsg.empty")}</p>`.toString();
      for (const a of ["dup", "del", "print", "csv", "screen", "save"]) dlg.querySelectorAll(`[data-act="${a}"]`).forEach((b) => { b.disabled = !def(); });
      drawState();
    }
    function drawState() {
      const d = def();
      part("state").textContent = d && dirty.has(d.id) ? t("chr.dsg.unsaved") : d && Date.now() - savedAt < 4000 ? t("chr.dsg.saved") : "";
    }
    function drawCols() {
      const d = def(), box = part("cols");
      if (!d || !box) return;
      const free = columnsOf(d.kind).filter((k) => !d.cols.includes(k));
      box.innerHTML = html`<ol class="chr-dsg-cols">${d.cols.map((k, i) => html`<li class="chr-dsg-col" draggable="true" data-col="${k}"><span class="chr-dsg-grip" aria-hidden="true">⋮⋮</span><span class="chr-dsg-coln">${colName(k)}</span>
        <button type="button" class="chr-x" data-colact="up" title="${t("chr.dsg.up")}" aria-label="${t("chr.dsg.up")}" ${i ? "" : raw("disabled")}>↑</button>
        <button type="button" class="chr-x" data-colact="down" title="${t("chr.dsg.down")}" aria-label="${t("chr.dsg.down")}" ${i < d.cols.length - 1 ? "" : raw("disabled")}>↓</button>
        <button type="button" class="chr-x" data-colact="drop" title="${t("chr.dsg.remove")}" aria-label="${t("chr.dsg.remove")}" ${d.cols.length > 1 ? "" : raw("disabled")}>${icon("x", 14)}</button></li>`)}</ol>
        ${free.length ? html`<select data-addcol aria-label="${t("chr.dsg.addCol")}"><option value="">${t("chr.dsg.addCol")}</option>${free.map((k) => opt(k, colName(k), ""))}</select>` : ""}
        <small class="chr-dim">${t("chr.dsg.colsHint")}</small>`.toString();
    }
    function drawSet() {
      const d = def(), box = part("set");
      if (!d) { box.innerHTML = html`<p class="chr-empty">${t("chr.dsg.emptyHint")}</p>`.toString(); return; }
      const st = ctx.st(), classes = Object.values(st.classes).sort(byName), res = d.kind === "results";
      const inCls = d.classes ? new Set(d.classes) : null, inSt = d.statuses ? new Set(d.statuses) : null;
      box.innerHTML = html`<div class="chr-grid">
          ${field(t("chr.dsg.name"), html`<input name="name" value="${d.name}" maxlength="80" autocomplete="off" placeholder="${t(`chr.dsg.kind.${d.kind}`)}">`)}
          ${field(t("chr.dsg.kindLabel"), html`<select name="kind">${KINDS.map((k) => opt(k, t(`chr.dsg.kind.${k}`), d.kind))}</select>`)}
          ${field(t("chr.dsg.by"), html`<select name="by">${GROUPS.map((g) => opt(g, t(`chr.dsg.by.${g}`), d.by))}</select>`)}
          ${field(t("chr.dsg.sort"), html`<select name="sort">${opt("", t(`chr.dsg.nat.${d.kind}`), d.sort)}${columnsOf(d.kind).filter((k) => !COLUMNS[k].box).map((k) => opt(k, colName(k), d.sort))}</select>`)}
        </div>
        <label class="chr-check"><input type="checkbox" name="desc" ${d.desc ? raw("checked") : ""}> ${t("chr.dsg.desc")}</label>
        <fieldset class="chr-fs"><legend>${t("chr.dsg.cols")}</legend><div data-part="cols"></div></fieldset>
        <fieldset class="chr-fs" data-filter="cls"><legend>${t("chr.dsg.classes")} <button type="button" class="btn btn-sm" data-all>${t("chr.all")}</button> <button type="button" class="btn btn-sm" data-none>${t("chr.none")}</button></legend>
          <div class="chr-cols">${classes.length ? classes.map((k) => html`<label><input type="checkbox" data-cls="${k.id}" ${!inCls || inCls.has(k.id) ? raw("checked") : ""}> ${k.name}</label>`) : html`<span class="chr-dim">—</span>`}</div></fieldset>
        <fieldset class="chr-fs" data-filter="st"><legend>${t("chr.dsg.statuses")} <button type="button" class="btn btn-sm" data-all>${t("chr.dsg.allSt")}</button> <button type="button" class="btn btn-sm" data-none>${t("chr.dsg.noneSt")}</button></legend>
          <div class="chr-cols">${STATUSES.map((s) => html`<label><input type="checkbox" data-st="${s}" ${!inSt || inSt.has(s) ? raw("checked") : ""}> ${t(`chr.st.${s}`)}</label>`)}</div></fieldset>
        <div class="chr-grid">
          ${res ? field(t("chr.dsg.top"), html`<input name="top" type="number" min="1" max="999" step="1" inputmode="numeric" value="${d.top ?? ""}">`, t("chr.dsg.topHint")) : ""}
          ${field(t("chr.dsg.size"), html`<select name="size">${SIZES.map((s) => opt(s, t(`chr.dsg.size.${s}`), d.size))}</select>`)}
          ${field(t("chr.dsg.orient"), html`<select name="landscape">${opt("0", t("chr.dsg.portrait"), d.landscape ? "1" : "0")}${opt("1", t("chr.dsg.landscape"), d.landscape ? "1" : "0")}</select>`)}
        </div>
        ${res ? html`<label class="chr-check"><input type="checkbox" name="splits" ${d.splits ? raw("checked") : ""}> ${t("chr.dsg.splits")}</label>` : ""}
        <label class="chr-check"><input type="checkbox" name="breaks" ${d.breaks ? raw("checked") : ""}> ${t("chr.dsg.breaks")}</label>
        ${field(t("chr.dsg.head"), html`<textarea name="head" rows="2" maxlength="2000">${d.head}</textarea>`)}
        ${field(t("chr.dsg.foot"), html`<textarea name="foot" rows="2" maxlength="2000">${d.foot}</textarea>`)}`.toString();
      drawCols();
    }
    function preview() {
      const d = def(), fr = dlg.querySelector(".chr-dsg-frame");
      try { fr.srcdoc = d ? pageOf(ctx, d) : ""; } catch (err) { fr.srcdoc = ""; part("state").textContent = `${t("chr.failed")} ${err?.message || err}`; }
    }
    const soon = () => { clearTimeout(timer); timer = setTimeout(preview, 300); };
    /** The list in hand was changed: marked, the preview drawn again shortly. */
    function touched(names = true) {
      const d = def();
      if (!d) return;
      const was = dirty.has(d.id);
      dirty.add(d.id);
      if (names || !was) drawLists(); else drawState();
      soon();
    }
    function drawAll() { drawLists(); drawSet(); clearTimeout(timer); preview(); }
    function choose(id) { if (!lists.has(id) || id === cur) return; cur = id; drawAll(); dlg.querySelector(`.chr-dsg-item[data-id="${id}"]`)?.focus(); }
    function add(d) {
      const names = new Set([...lists.values()].map(nameOf));
      let name = d.name, i = 2;
      while (names.has(name)) name = `${d.name} ${i++}`;
      d.name = name;
      lists.set(d.id, d); dirty.add(d.id); fresh.add(d.id); cur = d.id;
      drawAll();
      const inp = dlg.querySelector("[name=name]");
      inp?.focus(); inp?.select();
    }
    function save() {
      const d = def();
      if (!d) return;
      const out = normalise({ ...d, name: nameOf(d) });
      ctx.setEvent({ [`list.${out.id}`]: out });
      lists.set(out.id, out); dirty.delete(out.id); fresh.delete(out.id); savedAt = Date.now();
      const inp = dlg.querySelector("[name=name]");
      if (inp && !inp.value.trim()) inp.value = out.name;
      drawLists();
      setTimeout(() => { if (!done) drawState(); }, 4200);
    }
    async function remove() {
      const d = def();
      if (!d || !(await confirmBox(t("chr.dsg.delAsk", { name: nameOf(d) }), { ok: t("chr.delete") }))) return;
      if (!fresh.has(d.id)) ctx.setEvent({ [`list.${d.id}`]: null });
      lists.delete(d.id); dirty.delete(d.id); fresh.delete(d.id);
      cur = lists.keys().next().value ?? null;
      drawAll();
    }
    function end() {
      if (done) return;
      done = true; clearTimeout(timer);
      try { dlg.close(); } catch (err) { /* closed already */ }
      dlg.remove(); ctx.refresh(); resolve();
    }
    async function close() {
      if (asking) return;
      if (dirty.size) { asking = true; const go = await confirmBox(t("chr.dsg.unsavedAsk"), { ok: t("chr.dsg.leave") }); asking = false; if (!go) return; }
      end();
    }
    const ACTS = {
      close, save, del: remove,
      dup: () => { const d = def(); if (d) add({ ...normalise(d), id: newListId(), name: t("chr.dsg.copyOf", { name: nameOf(d) }) }); },
      print: () => { const d = def(); if (d) printHtml(pageOf(ctx, d)); },
      screen: () => { const d = def(); if (d) openPage(pageOf(ctx, d)); },
      csv: () => { const d = def(); if (d) download(`${slug(nameOf(d))}.csv`, `﻿${listCsv(ctx.st(), ctx.view(), d, designerLabels(d))}`, "text/csv"); },
    };
    function moveCol(k, act) {
      const d = def(), i = d.cols.indexOf(k);
      if (i < 0) return;
      if (act === "drop") { if (d.cols.length > 1) d.cols.splice(i, 1); }
      else { const j = act === "up" ? i - 1 : i + 1; if (j < 0 || j >= d.cols.length) return; d.cols.splice(j, 0, d.cols.splice(i, 1)[0]); }
      touched(false); drawCols();
      const li = part("cols").querySelector(`[data-col="${k}"]`);
      (li?.querySelector(`[data-colact="${act}"]:not([disabled])`) || li?.querySelector("button:not([disabled])") || part("cols").querySelector("button:not([disabled]), select"))?.focus();
    }
    const checked = (sel, key) => [...dlg.querySelectorAll(sel)].filter((c) => c.checked).map((c) => c.dataset[key]);
    function readFilter(kind) {
      const d = def(), all = dlg.querySelectorAll(kind === "cls" ? "[data-cls]" : "[data-st]").length;
      const on = checked(kind === "cls" ? "[data-cls]" : "[data-st]", kind);
      d[kind === "cls" ? "classes" : "statuses"] = on.length === all ? null : on;
      touched(false);
    }

    dlg.addEventListener("click", (e) => {
      if (e.target === dlg) { close(); return; }
      const b = e.target.closest?.("button");
      if (!b || b.disabled) return;
      if (b.dataset.act) ACTS[b.dataset.act]?.();
      else if (b.dataset.new) add(defaultList(b.dataset.new, t(`chr.dsg.kind.${b.dataset.new}`)));
      else if (b.dataset.id) choose(b.dataset.id);
      else if (b.dataset.colact) moveCol(b.closest("[data-col]").dataset.col, b.dataset.colact);
      else if (b.dataset.all != null || b.dataset.none != null) {
        const fs = b.closest("[data-filter]");
        fs.querySelectorAll("input[type=checkbox]").forEach((c) => { c.checked = b.dataset.all != null; });
        readFilter(fs.dataset.filter);
      }
    });
    dlg.addEventListener("input", (e) => {
      const el = e.target, d = def();
      if (!d || !el.name || !["name", "head", "foot", "top"].includes(el.name)) return;
      if (el.name === "top") { const n = Math.floor(Number(el.value)); d.top = el.value.trim() !== "" && n >= 1 ? Math.min(999, n) : null; } else d[el.name] = el.name === "name" ? el.value.trim() : el.value;
      touched(el.name === "name");
    });
    dlg.addEventListener("change", (e) => {
      const el = e.target, d = def();
      if (!d) return;
      if (el.dataset.addcol != null) {
        if (el.value && !d.cols.includes(el.value)) { d.cols.push(el.value); touched(false); drawCols(); part("cols").querySelector("[data-addcol]")?.focus(); }
      } else if (el.dataset.cls != null) readFilter("cls");
      else if (el.dataset.st != null) readFilter("st");
      else if (el.name === "kind") {
        lists.set(d.id, normalise({ ...d, kind: el.value }));                    // the columns, the sort and the options the new kind has not are dropped
        touched(); drawSet(); dlg.querySelector("[name=kind]")?.focus();
      } else if (el.name === "by" || el.name === "sort" || el.name === "size") { d[el.name] = el.value; touched(false); }
      else if (el.name === "landscape") { d.landscape = el.value === "1"; touched(false); }
      else if (["desc", "splits", "breaks"].includes(el.name)) { d[el.name] = el.checked; touched(false); }
    });
    // a column dragged onto another takes its place
    dlg.addEventListener("dragstart", (e) => { const li = e.target.closest?.("[data-col]"); if (!li) return; dragKey = li.dataset.col; e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", dragKey); li.classList.add("drag"); });
    dlg.addEventListener("dragover", (e) => { if (dragKey && e.target.closest?.("[data-col]")) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; } });
    dlg.addEventListener("drop", (e) => {
      const li = e.target.closest?.("[data-col]"), d = def();
      if (!li || !dragKey || !d) return;
      e.preventDefault();
      const from = d.cols.indexOf(dragKey), to = d.cols.indexOf(li.dataset.col);
      dragKey = null;
      if (from < 0 || to < 0 || from === to) return;
      d.cols.splice(to, 0, d.cols.splice(from, 1)[0]);
      touched(false); drawCols();
    });
    dlg.addEventListener("dragend", () => { dragKey = null; dlg.querySelectorAll(".chr-dsg-col.drag").forEach((x) => x.classList.remove("drag")); });
    dlg.addEventListener("keydown", (e) => { if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "s") { e.preventDefault(); save(); } });
    dlg.addEventListener("cancel", (e) => { e.preventDefault(); close(); });      // Escape
    dlg.addEventListener("close", end);                                           // closed by the browser all the same

    document.body.append(dlg);
    dlg.showModal();
    drawAll();
    (dlg.querySelector(".chr-dsg-item[aria-current=true]") || dlg.querySelector("[data-new]"))?.focus();
  });
}
