// « Mon club › Formule » (docs/billing/design.md §6, §9; loaded only through ../offers.js; a club's managers and treasurers):
// the club's plan and until when, who opened it, the price for this club, the billing details, « Demander un devis »,
// « Commander Ozimut Club » (an invoice issued at once, payable by bank transfer within 30 days, the plan starting at once),
// the invoices with their PDF drawn in the browser (./invoicepdf.js), the events bought by the unit.
// Server: functions/api/billing/org/[[path]].js (its header gives every shape).

import { html, t, api, money, day, planName, dialog, run, say, errText, terms, seen } from "./core.js";
import { tn } from "../i18n.js";
import * as country from "../country.js";

const FIELDS = ["name", "address", "country", "siret", "vat_id", "email"];
const kindName = (k) => t(`bill.inv.kind.${["invoice", "credit", "quote"].includes(k) ? k : "invoice"}`);
const statusName = (i) => (i.kind === "quote" ? t("bill.inv.st.quote", { date: day(i.due_at, "short") })
  : i.status === "paid" ? t("bill.inv.st.paid", { date: day(i.paid_at, "short") })
  : i.status === "cancelled" ? t("bill.inv.st.cancelled")
  : i.status === "issued" ? t("bill.inv.st.issued", { date: day(i.due_at, "short") }) : t("bill.inv.st.draft"));

export async function draw(box, org) {
  let D;
  try { D = await api(`org/${org.id}`); }
  catch (e) { box.innerHTML = html`<div class="notice">${errText(e)}</div>`; return; }
  const again = () => draw(box, org);
  const P = D.price || {}, c = P.currency || "eur", B = D.billing || {};
  const mine = P.amount ?? P.year;
  const fed = D.why?.scope === "federation";
  const unpaid = (D.invoices || []).find((i) => i.kind === "invoice" && i.status === "issued");
  box.innerHTML = html`
    <section class="card"><div class="card-head"><div><h2>${t("bill.club.title")}</h2></div></div><div class="card-body stack" style="gap:10px">
      ${D.plan ? html`<div class="bl-plan-line"><span class="bl-mark bl-mark-big" data-bl-plan="club">${t("bill.mark.club")}</span>
          <div><b>${planName("club")}</b>${D.until ? html` · ${t("bill.until", { date: day(D.until) })}` : ""}<br>
            <span class="muted">${fed ? t("bill.club.byFed", { name: D.by || "—" }) : D.trust ? t("bill.club.trust", { date: day(D.trust.until) }) : D.sub ? t("bill.club.paid", { date: day(D.sub.current_end) }) : t("bill.club.granted")}</span></div></div>`
        : html`<div class="bl-plan-line"><div><b>${t("bill.club.none")}</b><br><span class="muted">${t("bill.club.noneLede")}</span></div></div>`}
      <p class="bl-price"><b>${t("bill.price.year", { price: money(mine, c) })}</b> <span class="muted">${tn("bill.club.members", D.members ?? P.members ?? 0)}${P.smallMax ? html` · ${t("bill.club.priceRule", { small: money(P.smallAmount ?? P.small, c), n: P.smallMax, year: money(P.year, c) })}` : ""}</span></p>
      <p class="muted bl-small">${P.vatRate ? t("bill.club.vat", { rate: P.vatRate }) : (P.vatNote || t("bill.club.noVat"))}</p>
      <ul class="bl-facts"><li>${t("bill.club.f1")}</li><li>${t("bill.club.f2")}</li><li>${t("bill.club.f3")}</li></ul>
      ${unpaid ? html`<div class="notice info">${t("bill.club.unpaid", { number: unpaid.number, date: day(unpaid.due_at) })}</div>` : ""}
      ${D.blocked === "seller" ? html`<div class="notice">${t("bill.club.blocked.seller")}</div>` : ""}
      <div class="notice" data-note hidden></div>
      <div class="row bl-actions">
        ${!fed ? html`<button type="button" class="btn btn-primary" data-order ${D.canOrder ? "" : "disabled"} title="${D.canOrder ? "" : t(`bill.club.blocked.${["active", "unpaid", "billing", "seller"].includes(D.blocked) ? D.blocked : "billing"}`)}">${t("bill.club.order")}</button>` : ""}
        <button type="button" class="btn" data-quote>${t("bill.club.quote")}</button>
        <a class="btn btn-ghost" href="#/tarifs">${t("bill.sheet.all")}</a></div>
      ${!D.canOrder && !fed && D.blocked && D.blocked !== "seller" ? html`<p class="muted bl-small">${t(`bill.club.blocked.${["active", "unpaid", "billing"].includes(D.blocked) ? D.blocked : "billing"}`)}</p>` : ""}
    </div></section>

    <section class="card"><div class="card-head"><div><h2>${t("bill.club.details")}</h2><div class="hint">${t("bill.club.detailsHint")}</div></div></div><div class="card-body">
      <form class="stack bl-form" data-billing style="gap:10px">
        <label class="field"><span>${t("bill.f.name")}</span><input name="name" required maxlength="200" value="${B.name || ""}"></label>
        <label class="field"><span>${t("bill.f.address")}</span><textarea name="address" rows="3" required maxlength="500">${B.address || ""}</textarea></label>
        <div class="row">
          <label class="field"><span>${t("bill.f.country")}</span><select name="country">${country.MEMBERS.map((cc) => html`<option value="${cc}" ${(B.country || org.cc || "FR") === cc ? "selected" : ""}>${country.name(cc)}</option>`)}</select></label>
          <label class="field"><span>${t("bill.f.siret")}</span><input name="siret" maxlength="20" value="${B.siret || ""}"></label>
          <label class="field"><span>${t("bill.f.vat")}</span><input name="vat_id" maxlength="20" value="${B.vat_id || ""}"></label></div>
        <label class="field"><span>${t("bill.f.email")}</span><input name="email" type="email" maxlength="200" value="${B.email || ""}"></label>
        <div class="notice" data-bnote hidden></div>
        <div><button type="submit" class="btn">${t("bill.f.save")}</button></div>
      </form></div></section>

    <section class="card"><div class="card-head"><div><h2>${t("bill.inv.title")}</h2></div></div>
      ${(D.invoices || []).length ? html`<div class="table-wrap"><table class="data compact bl-inv"><thead><tr><th>${t("bill.inv.col.doc")}</th><th>${t("bill.inv.col.date")}</th><th class="r">${t("bill.inv.col.total")}</th><th>${t("bill.inv.col.state")}</th><th></th></tr></thead>
        <tbody>${D.invoices.map((i) => html`<tr><td><b>${kindName(i.kind)}</b> ${i.number || ""}${i.label ? html`<br><span class="muted">${i.label}</span>` : ""}</td>
          <td class="num">${day(i.issued_at || i.created_at, "short")}</td><td class="r num">${money(i.total, i.currency || c)}</td>
          <td><span class="tag ${i.status === "paid" ? "bl-ok" : ""}">${statusName(i)}</span></td>
          <td class="r"><button type="button" class="btn btn-sm" data-pdf="${i.id}">${t("bill.inv.pdf")}</button></td></tr>`)}</tbody></table></div>`
        : html`<div class="card-body"><div class="empty">${t("bill.inv.none")}</div></div>`}
      ${D.seller?.iban ? html`<div class="card-body"><p class="muted bl-small">${t("bill.inv.pay", { name: D.seller.name || "Ozimut", iban: D.seller.iban, bic: D.seller.bic || "—" })}</p></div>` : ""}
    </section>

    ${(D.eventsUnit || []).length ? html`<section class="card"><div class="card-head"><div><h2>${t("bill.ev.title")}</h2><div class="hint">${t("bill.ev.hint")}</div></div></div>
      <div class="table-wrap"><table class="data compact"><thead><tr><th>${t("bill.ev.col.event")}</th><th>${t("bill.ev.col.date")}</th><th class="r">${t("bill.ev.col.entries")}</th><th class="r">${t("bill.ev.col.amount")}</th><th>${t("bill.inv.col.state")}</th></tr></thead>
        <tbody>${D.eventsUnit.map((e) => html`<tr><td><b>${e.name || `#${e.event}`}</b></td><td class="num">${day(e.date, "short")}</td><td class="r num">${e.entries ?? "—"}</td>
          <td class="r num">${e.invoice ? money(e.invoice.total, e.invoice.currency || c) : e.estimate != null ? html`<span class="muted">${t("bill.ev.estimate", { amount: money(e.estimate, c) })}</span>` : "—"}</td>
          <td>${e.invoice ? html`<span class="tag">${kindName("invoice")} ${e.invoice.number || ""} · ${statusName(e.invoice)}</span>` : html`<span class="muted">${t("bill.ev.later")}</span>`}</td></tr>`)}</tbody></table></div></section>` : ""}
    <p class="muted bl-small">${terms()}</p>`;

  const note = box.querySelector("[data-note]");
  // the billing details
  const form = box.querySelector("[data-billing]");
  const readForm = () => Object.fromEntries(FIELDS.map((k) => [k, String(new FormData(form).get(k) || "").trim()]));
  const save = async () => { const j = await api(`org/${org.id}`, { method: "PUT", body: { billing: readForm() } }); return j.billing; };
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const bn = form.querySelector("[data-bnote]");
    const ok = await run(form.querySelector("button[type=submit]"), bn, save);
    if (ok) { await again(); const n = box.querySelector("[data-bnote]"); if (n) { n.textContent = t("bill.f.saved"); n.className = "notice ok"; n.hidden = false; } }
  });
  const pdfOf = async (rec) => {
    const { save: savePdf } = await import("./invoicepdf.js");
    await savePdf(rec);
  };
  // a quote: made, then its PDF
  box.querySelector("[data-quote]")?.addEventListener("click", (e) => run(e.currentTarget, note, async () => {
    if (form.reportValidity && !form.checkValidity()) { form.reportValidity(); return; }
    if (!B.set || FIELDS.some((k) => readForm()[k] !== String(B[k] || ""))) await save();
    seen("quote", "club");
    const j = await api(`org/${org.id}/quote`, { method: "POST", body: { plan: "club" } });
    await pdfOf(j.quote || j.invoice);
    await again();
  }));
  // the order: said plainly before it is placed
  box.querySelector("[data-order]")?.addEventListener("click", async () => {
    if (!form.checkValidity()) { form.reportValidity(); return; }
    const done = await dialog((body, close) => {
      body.innerHTML = html`<h2>${t("bill.order.title")}</h2>
        <p class="bl-price"><b>${t("bill.price.year", { price: money(mine, c) })}</b> <span class="muted">${P.vatRate ? t("bill.club.vat", { rate: P.vatRate }) : (P.vatNote || t("bill.club.noVat"))}</span></p>
        <ul class="bl-facts"><li>${t("bill.order.f1")}</li><li>${t("bill.order.f2")}</li><li>${t("bill.order.f3")}</li><li>${t("bill.order.f4", { name: B.name || readForm().name })}</li></ul>
        <p class="bl-small">${t("bill.order.terms")} ${terms()}</p>
        <div class="notice" data-note hidden></div>
        <div class="bl-btns"><button type="button" class="btn" data-no>${t("dlg.cancel")}</button><button type="button" class="btn btn-primary" data-yes>${t("bill.order.confirm")}</button></div>`;
      body.querySelector("[data-no]").addEventListener("click", () => close(null));
      body.querySelector("[data-yes]").addEventListener("click", (e) => run(e.currentTarget, body.querySelector("[data-note]"), async () => {
        if (!B.set || FIELDS.some((k) => readForm()[k] !== String(B[k] || ""))) await save();
        seen("order", "club");
        close(await api(`org/${org.id}/order`, { method: "POST", body: { plan: "club" } }));
      }));
    });
    if (!done) return;
    await again();
    await say(t("bill.order.done", { number: done.invoice?.number || "", date: day(done.invoice?.due_at) }));
    if (done.invoice) pdfOf(done.invoice).catch(() => {});
  });
  // an invoice's PDF, from the stored record
  box.querySelectorAll("[data-pdf]").forEach((b) => b.addEventListener("click", () => run(b, note, async () => {
    const j = await api(`org/${org.id}/invoice/${b.dataset.pdf}`);
    await pdfOf(j.invoice);
  })));
}

/**
 * One event bought by the unit (offers.eventNote's « Ouvrir pour cet événement »; POST /api/billing/event/<id>, its header
 * gives the shapes): what it opens, the price per entry and its cap, today's estimate, the club the invoice goes to, then the
 * confirmation. Resolves true once opened (the page then reads the event again).
 */
export async function buyEvent(id) {
  let E;
  try { E = await api(`event/${encodeURIComponent(id)}`); }
  catch (e) { await say(errText(e)); return false; }
  const P = E.price || {}, c = P.currency || "eur";
  if (E.bought && E.grant) { await say(t("bill.event.bought", { date: day(E.grant.until) })); return false; }
  const res = await dialog((body, close) => {
    body.innerHTML = html`<div class="bl-sheet-head"><span class="bl-mark bl-mark-big" data-bl-plan="club">${t("bill.mark.club")}</span><h2>${t("bill.ev.buy.title")}</h2></div>
      <p><b>${E.event?.name || ""}</b>${E.event?.date ? html` <span class="muted">· ${day(E.event.date)}</span>` : ""}</p>
      ${E.covered ? html`<div class="notice info">${t("bill.ev.buy.covered", { name: E.by || "—" })}</div>
        <div class="bl-btns"><button type="button" class="btn btn-primary" data-no>${t("bill.close")}</button></div>`
      : html`<p class="bl-what">${t("bill.ev.buy.what")}</p>
        <p class="bl-price"><b>${t("bill.ev.buy.price", { per: money(P.perEntry, c), cap: money(P.cap, c) })}</b></p>
        <ul class="bl-facts"><li>${t("bill.ev.buy.estimate", { n: E.entries ?? 0, amount: money(E.estimate ?? 0, c) })}</li>
          ${E.org ? html`<li>${t("bill.ev.buy.to", { name: E.org.name })}</li>` : ""}</ul>
        ${E.org && !E.billingOk ? html`<div class="notice info">${t("bill.ev.buy.billing")}</div>` : ""}
        <p class="bl-small">${t("bill.order.terms")} ${terms()}</p>
        <div class="notice" data-note hidden></div>
        <div class="bl-btns"><button type="button" class="btn" data-no>${t("dlg.cancel")}</button>
          <button type="button" class="btn btn-primary" data-yes>${t("bill.ev.buy.confirm")}</button></div>`}`;
    body.querySelector("[data-no]")?.addEventListener("click", () => close(null));
    body.querySelector("[data-yes]")?.addEventListener("click", (e) => run(e.currentTarget, body.querySelector("[data-note]"), async () => {
      seen("event", "");
      close(await api(`event/${encodeURIComponent(id)}`, { method: "POST", body: {} }));
    }));
  }, { cls: "bl-sheet" });
  if (!res) return false;
  await say(t("bill.ev.buy.done", { date: day(res.until || res.grant?.until) }));
  return true;
}
