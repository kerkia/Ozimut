// Invoices by club: what each club owes for its runners' entry fees and rented cards — the settings of the document (kept
// on the event under « inv »), the clubs with their totals, a club's runners marked paid or not, the pages and the tables.

import { t, tn, locale } from "../../i18n.js";
import { alertBox } from "../../askbox.js";
import { html, raw, icon, formDialog, values, field, table, bindTable, download, printHtml } from "./kit.js";
import { invoiceData, invoicesHtml, invoicesCsv, invoiceLinesCsv } from "../print/invoices.js";

const slug = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w-]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "chrono";

/** Opens the invoices over the window; resolves when closed. */
export function invoicesDialog(ctx) {
  const S = { sort: "name", dir: "asc" }, nf = new Intl.NumberFormat(locale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 }), money = (n) => nf.format(Number(n) || 0);
  const dec = nf.formatToParts(1.5).find((p) => p.type === "decimal")?.value || ".";
  let open = null;                                                // the club whose runners are shown (its id; "" the runners without a club)
  const conf = () => { const c = ctx.st().event.inv; return { rent: 0, title: "", num: "", head: "", foot: "", skipDns: false, ...(c && typeof c === "object" ? c : {}) }; };
  const day = (iso) => { const d = /^\d{4}-\d{2}-\d{2}$/.test(iso || "") ? new Date(`${iso}T12:00:00`) : null; return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString(locale()) : iso || ""; };
  const data = () => { const c = conf(), d = invoiceData(ctx.st(), { rent: Number(c.rent) || 0, skipDns: !!c.skipDns, noClub: t("chr.dsg.noClub") }); d.event.date = day(d.event.date); return d; };
  function labels() {
    const status = {};
    for (const s of ["mp", "dnf", "dns", "dsq", "ot", "nc"]) status[s] = t(`chr.st.${s}`);
    return { title: conf().title || t("chr.inv.docDefault"), number: t("chr.inv.number"), date: t("chr.inv.date"), club: t("chr.col.club"), code: t("chr.dsg.col.clubCode"), runner: t("chr.inv.runner"),
      cls: t("chr.col.cls"), fee: t("chr.inv.fee"), rent: t("chr.run.rent"), total: t("chr.inv.total"), paid: t("chr.inv.paid"), due: t("chr.inv.due"), runners: t("chr.lst.runners"),
      fees: t("chr.inv.fees"), rents: t("chr.inv.rents"), lic: t("chr.run.lic"), status, dec };
  }
  const pages = (d, more = {}) => { const c = conf(); return invoicesHtml(d, labels(), { head: c.head, foot: c.foot, num: c.num, date: new Date().toLocaleDateString(locale()), money, ...more }); };
  const file = (key) => `${slug(ctx.st().event.name)}-${t(key)}.csv`;

  const c0 = conf();
  return formDialog({ title: t("chr.inv.title"), wide: true, ok: "", cancel: t("chr.close"), onOk: () => false,
    extra: html`<button type="button" class="btn btn-primary" data-act="all">${icon("print", 14)} ${t("chr.inv.printAll")}</button><button type="button" class="btn" data-act="due">${icon("print", 14)} ${t("chr.inv.printDue")}</button>
      <button type="button" class="btn" data-act="csv">${icon("down", 14)} ${t("chr.inv.csvSum")}</button><button type="button" class="btn" data-act="lines">${icon("down", 14)} ${t("chr.inv.csvLines")}</button>`,
    body: html`<div class="chr-inv-set" data-part="set"><div class="chr-grid">
        ${field(t("chr.inv.rent"), html`<input name="rent" data-num inputmode="decimal" value="${c0.rent || ""}" placeholder="0">`)}
        ${field(t("chr.inv.docTitle"), html`<input name="title" value="${c0.title}" maxlength="60" placeholder="${t("chr.inv.docDefault")}">`)}
        ${field(t("chr.inv.num"), html`<input name="num" value="${c0.num}" maxlength="20">`, t("chr.inv.numHint"))}</div>
      <div class="chr-inv-texts">${field(t("chr.inv.head"), html`<textarea name="head" rows="3" maxlength="1000">${c0.head}</textarea>`, t("chr.inv.headHint"))}
        ${field(t("chr.inv.foot"), html`<textarea name="foot" rows="3" maxlength="1000">${c0.foot}</textarea>`, t("chr.inv.footHint"))}</div>
      <label class="chr-check"><input type="checkbox" name="skipDns" ${c0.skipDns ? raw("checked") : ""}> ${t("chr.inv.skipDns")}</label></div>
      <div class="chr-tiles chr-inv-tiles" data-part="sum"></div><div data-part="clubs"></div><div data-part="club"></div>`,
    onOpen(dlg) {
      dlg.classList.add("chr-inv");
      const part = (name) => dlg.querySelector(`[data-part="${name}"]`);
      function draw() {
        const d = data(), T = d.total;
        part("sum").innerHTML = html`<div><b>${d.clubs.length}</b><span>${tn("chr.inv.clubs", d.clubs.length)} · ${tn("chr.inv.runners", T.n)}</span></div><div><b>${money(T.total)}</b><span>${t("chr.inv.total")}</span></div>
          <div><b>${money(T.paid)}</b><span>${t("chr.inv.paid")}</span></div><div class="${T.due > 0 ? "warn" : ""}"><b>${money(T.due)}</b><span>${t("chr.inv.due")}</span></div>`.toString();
        part("clubs").innerHTML = String(table([
          { key: "name", label: t("chr.col.club"), get: (c) => c.name, cell: (c) => html`${c.name}${c.code ? html` <small class="chr-dim">${c.code}</small>` : ""}` },
          { key: "n", label: t("chr.inv.colRunners"), num: 1, get: (c) => c.n },
          { key: "total", label: t("chr.inv.total"), num: 1, get: (c) => money(c.total), sort: (c) => c.total },
          { key: "paid", label: t("chr.inv.paid"), num: 1, get: (c) => money(c.paid), sort: (c) => c.paid },
          { key: "due", label: t("chr.inv.due"), num: 1, get: (c) => money(c.due), sort: (c) => c.due, cell: (c) => (c.due > 0 ? html`<b class="chr-warn">${money(c.due)}</b>` : money(c.due)) },
        ], d.clubs, { id: (c) => c.id, state: S, empty: t("chr.inv.none"), rowCls: (c) => (c.id === open ? "chr-inv-on" : "") }));
        bindTable(part("clubs"), S, draw, (id) => { open = open === id ? null : id; draw(); part("club").querySelector("button")?.focus(); });
        part("clubs").querySelectorAll("tbody tr[data-id]").forEach((tr) => {                    // a club's row from the keyboard
          tr.tabIndex = 0;
          tr.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); tr.click(); } });
        });
        const club = open == null ? null : d.clubs.find((c) => c.id === open);
        for (const a of ["all", "due", "csv", "lines"]) dlg.querySelector(`[data-act="${a}"]`).disabled = !d.clubs.length;
        if (!club) { part("club").innerHTML = d.clubs.length ? html`<p class="chr-dim">${t("chr.inv.pick")}</p>`.toString() : ""; return; }
        const allPaid = club.lines.every((l) => ctx.st().runners[l.runner]?.paid);
        part("club").innerHTML = html`<div class="chr-card chr-inv-club"><h3>${club.name} <small>${tn("chr.inv.runners", club.n)} · ${t("chr.inv.due")} ${money(club.due)}</small></h3>
          <p class="chr-inv-acts"><button type="button" class="btn" data-paid="1" ${allPaid ? raw("disabled") : ""}>${icon("check", 14)} ${t("chr.inv.markPaid")}</button>
            <button type="button" class="btn" data-paid="0" ${club.lines.some((l) => ctx.st().runners[l.runner]?.paid) ? "" : raw("disabled")}>${icon("undo", 14)} ${t("chr.inv.markUnpaid")}</button>
            <button type="button" class="btn" data-print>${icon("print", 14)} ${t("chr.inv.printClub")}</button></p>
          <table class="data chr-t chr-inv-lines"><thead><tr><th>${t("chr.inv.runner")}</th><th>${t("chr.col.cls")}</th><th class="num">${t("chr.inv.fee")}</th><th class="num">${t("chr.run.rent")}</th>
            <th class="num">${t("chr.inv.total")}</th><th>${t("chr.run.paid")}</th></tr></thead><tbody>${club.lines.map((l) => html`<tr><td>${l.name}${l.status ? html` <span class="chr-chip">${t(`chr.st.${l.status}`)}</span>` : ""}</td><td>${l.cls}</td>
            <td class="num">${money(l.fee)}</td><td class="num">${l.rent ? money(l.rent) : ""}</td><td class="num">${money(l.total)}</td><td>${ctx.st().runners[l.runner]?.paid ? "✓" : html`<span class="chr-dim">—</span>`}</td></tr>`)}</tbody></table></div>`.toString();
        part("club").querySelectorAll("[data-paid]").forEach((b) => b.addEventListener("click", () => {
          const on = b.dataset.paid === "1", rows = club.lines.filter((l) => !!ctx.st().runners[l.runner]?.paid !== on).map((l) => ["runners", l.runner, { paid: on ? 1 : null }]);
          if (rows.length) ctx.log.add("many", { rows }, ctx.by);
          draw();
          part("club").querySelector(`[data-paid="${on ? 0 : 1}"]`)?.focus();
        }));
        part("club").querySelector("[data-print]").addEventListener("click", () => printHtml(pages(data(), { only: club.id })));
      }
      part("set").addEventListener("change", () => {
        const v = values(part("set"));
        ctx.setEvent({ inv: { rent: Number.isFinite(v.rent) && v.rent > 0 ? Math.round(v.rent * 100) / 100 : 0, title: v.title, num: v.num, head: v.head, foot: v.foot, skipDns: !!v.skipDns } });
        draw();
      });
      dlg.querySelector('[data-act="all"]').addEventListener("click", () => printHtml(pages(data())));
      dlg.querySelector('[data-act="due"]').addEventListener("click", async () => {
        const d = data();
        if (!d.clubs.some((c) => c.due > 0)) { await alertBox(t("chr.inv.noDue")); return; }
        printHtml(pages(d, { dueOnly: true }));
      });
      dlg.querySelector('[data-act="csv"]').addEventListener("click", () => download(file("chr.inv.fileSum"), `﻿${invoicesCsv(data(), labels())}`, "text/csv"));
      dlg.querySelector('[data-act="lines"]').addEventListener("click", () => download(file("chr.inv.fileLines"), `﻿${invoiceLinesCsv(data(), labels())}`, "text/csv"));
      draw();
    } });
}
