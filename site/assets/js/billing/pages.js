// The purchase gate's pages (docs/billing/design.md §9; loaded only through ../offers.js, which opens them only when billing
// is on for the visitor): #/tarifs — the pricing page, public once billing is live —, #/conditions-de-vente — the terms of
// sale, one module a language (./terms.<lang>.js) —, #/changements — « Ce qui change », the dated entries of the config.
// Everything shown of the plans, the prices and the seller comes from GET /api/billing/offer.

import { html, raw, t, api, offer, state, seen, money, day, capName, capShort, capVal, adds, participantCaps, plusPrice, cur, planName, dialog, run, errText,
  refreshAccount, lang } from "./core.js";
import { checkoutStep } from "./sheet.js";
import * as auth from "../auth.js";
import { SITE } from "../app.js";

export async function render(main, r) {
  const head = String(r.path || "").split("/").filter(Boolean)[0] || "tarifs";
  const O = await offer();
  if (!O) { main.innerHTML = html`<div class="card"><div class="empty">${t("bill.err.other")}</div></div>`; return { title: t("bill.pp.title") }; }
  if (head === "conditions-de-vente") return termsPage(main, O);
  if (head === "changements") return changesPage(main, O);
  return pricingPage(main, O);
}
const backLink = () => html`<p><a href="${auth.session() || auth.guest() ? "#/modules" : "#/"}">← ${t(auth.session() || auth.guest() ? "bill.back.site" : "ac.toLogin")}</a></p>`;

// ---- #/tarifs -----------------------------------------------------------------------------------------------------------
async function pricingPage(main, O) {
  const me = auth.session();
  let S = null;
  if (me) { try { S = await state(); } catch (e) { S = null; } }
  seen("pricing", "");
  const P = O.prices || {}, c = cur(P), price = plusPrice(P);
  const freeCaps = O.plans?.find((p) => p.id === "free")?.caps || {};
  const limits = Object.keys(freeCaps).filter((k) => typeof freeCaps[k] === "number");
  const plus = adds(O, "plus"), club = adds(O, "club").filter((a) => !plus.some((p) => p.key === a.key));
  const opened = participantCaps(O);
  const hasPlus = S && S.plan && S.plan !== "free";
  const subOn = S?.sub && ["active", "past_due"].includes(S.sub.status) && !S.sub.endedAt;
  const li = (a) => html`<li>${capName(a.key)}${capVal(a.key, a.v) ? html` <span class="bl-val">${capVal(a.key, a.v)}</span>` : ""}</li>`;
  const fed = P.fed || {};
  main.innerHTML = html`
    <div class="page-head"><div><h1>${t("bill.pp.title")}</h1><p class="lede">${t("bill.pp.lede")}</p></div></div>
    ${price.founder ? html`<div class="notice info bl-founder-bar">${price.until ? t("bill.pp.founder", { price: money(price.amount, c), full: money(price.full, c), date: day(price.until) }) : ""}</div>` : ""}
    <div class="bl-cols">
      <section class="card bl-col" data-bl-plan="free"><div class="card-body">
        <h2>${planName("free")}</h2><p class="bl-col-price"><b>${money(0, c)}</b></p><p class="bl-col-lede">${t("bill.pp.free.lede")}</p>
        <ul class="bl-col-list"><li>${t("bill.pp.free.l1")}</li><li>${t("bill.pp.free.l2")}</li><li>${t("bill.pp.free.l3")}</li>
          ${limits.map((k) => html`<li>${capShort(k)} <span class="bl-val">${capVal(k, freeCaps[k])}</span></li>`)}</ul>
        ${me ? "" : html`<div class="bl-col-btn"><a class="btn" href="#/compte/inscription">${t("ac.register")}</a></div>`}
      </div></section>

      <section class="card bl-col bl-col-main" data-bl-plan="plus"><div class="card-body">
        <h2>${planName("plus")}</h2>
        <p class="bl-col-price"><b>${money(price.amount, c)}</b> <span>${t("bill.pp.perYear")}</span>${price.founder ? html` <s class="muted">${money(price.full, c)}</s>` : ""}</p>
        <p class="bl-col-lede">${t("bill.pp.plus.lede")}</p>
        <ul class="bl-col-list"><li>${t("bill.pp.plus.l0")}</li>${plus.map(li)}</ul>
        <div class="notice" data-note hidden></div>
        <div class="bl-col-btn">${hasPlus ? html`<span class="tag bl-ok">${t(subOn ? "bill.pp.yours" : "bill.pp.yoursOpen")}</span> <a class="btn btn-sm" href="#/reglages?onglet=abonnement">${t("bill.st.title")}</a>`
          : !me ? html`<a class="btn btn-primary" href="#/compte/inscription">${t("bill.pp.plus.signup", { n: P.trialDays || 30 })}</a>`
          : html`${S?.canTrial ? html`<button type="button" class="btn btn-primary" data-trial>${t("bill.trial.btn", { n: P.trialDays || 30 })}</button>` : ""}
            ${price.ready ? html`<button type="button" class="btn ${S?.canTrial ? "" : "btn-primary"}" data-sub>${t("bill.sub.btn")}</button>` : html`<span class="muted bl-small">${t("bill.sub.notReady")}</span>`}`}</div>
        <p class="muted bl-small">${t("bill.pp.plus.note", { n: P.trialDays || 30 })}</p>
      </div></section>

      <section class="card bl-col" data-bl-plan="club"><div class="card-body">
        <h2>${planName("club")}</h2>
        <p class="bl-col-price"><b>${money(P.club?.year, c)}</b> <span>${t("bill.pp.perYear")}</span></p>
        <p class="bl-col-lede">${P.club?.small ? t("bill.pp.club.small", { price: money(P.club.small, c), n: P.club.smallMax }) : ""} ${t("bill.pp.club.lede")}</p>
        <ul class="bl-col-list">${club.map(li)}
          ${opened.length ? html`<li>${t("bill.pp.club.opens")}<ul>${opened.map((k) => html`<li>${capName(k)}</li>`)}</ul></li>` : ""}
          <li>${t("bill.pp.club.u21")}</li><li>${t("bill.pp.club.pay")}</li></ul>
        <div class="bl-col-btn">${me ? html`<a class="btn" href="#/monclub?onglet=formule">${t("bill.sheet.toClub")}</a>` : ""}</div>
        ${P.event?.perEntry ? html`<p class="muted bl-small">${t("bill.pp.event", { per: money(P.event.perEntry, c), cap: money(P.event.cap, c) })}</p>` : ""}
      </div></section>

      <section class="card bl-col" data-bl-plan="fed"><div class="card-body">
        <h2>${t("bill.plan.fed")}</h2>
        <p class="bl-col-price">${fed.clubs ? html`<b>${money(fed.clubs, c)}</b> <span>${t("bill.pp.perLicensee")}</span>` : html`<b>${t("bill.pp.fed.ask")}</b>`}</p>
        <p class="bl-col-lede">${t("bill.pp.fed.lede")}</p>
        <ul class="bl-col-list"><li>${t("bill.pp.fed.l1")}${fed.clubs ? html` <span class="bl-val">${t("bill.pp.fed.per", { price: money(fed.clubs, c) })}</span>` : ""}</li>
          <li>${t("bill.pp.fed.l2")}${fed.all ? html` <span class="bl-val">${t("bill.pp.fed.per", { price: money(fed.all, c) })}</span>` : ""}</li><li>${t("bill.pp.fed.l3")}</li></ul>
        <div class="bl-col-btn"><a class="btn" href="#/contact?sujet=${encodeURIComponent(t("bill.pp.fed.subject"))}">${t("bill.pp.fed.write")}</a></div>
      </div></section>
    </div>

    ${me && S ? html`<section class="card bl-myclub"><div class="card-head"><h2>${t("bill.pp.myclub.title")}</h2></div><div class="card-body">
      ${(S.orgs || []).length ? html`<ul class="bl-facts">${S.orgs.map((o) => html`<li><b>${o.name}</b> — ${o.plan ? t("bill.pp.myclub.yes", { plan: planName(o.plan) }) : t("bill.pp.myclub.no")}${o.plan && o.until ? html` <span class="muted">· ${t("bill.until", { date: day(o.until) })}</span>` : ""}
        ${o.may ? html` · <a href="#/monclub?org=${o.id}&onglet=formule">${t("bill.club.tab")}</a>` : ""}</li>`)}</ul>
        <p class="muted bl-small">${t("bill.pp.myclub.hint")}</p>`
      : html`<p class="soft" style="margin:0">${t("bill.pp.myclub.none")} <a href="#/monclub">${t("cl.myClub")}</a></p>`}
    </div></section>` : ""}

    <div class="bl-notes prose">
      ${P.mapPack?.amount ? html`<p>${t("bill.pp.mapPack", { km2: P.mapPack.km2, price: money(P.mapPack.amount, c) })}</p>` : ""}
      <p>${t("bill.pp.note.eur")}</p><p>${t("bill.pp.note.data")}</p><p>${t("bill.pp.note.entries")}</p>
      <p><a href="#/conditions-de-vente">${t("bill.terms.link")}</a> · <a href="#/changements">${t("bill.changes.link")}</a> · <a href="#/compte/confidentialite">${t("pv.title")}</a></p>
      ${backLink()}
    </div>`;
  const note = main.querySelector("[data-note]");
  main.querySelector("[data-trial]")?.addEventListener("click", (e) => run(e.currentTarget, note, async () => {
    seen("trial", "pricing");
    await api("trial", { method: "POST", body: {} });
    await refreshAccount();
    location.hash = "#/reglages?onglet=abonnement";
  }));
  main.querySelector("[data-sub]")?.addEventListener("click", () => { seen("subscribe", "pricing"); dialog((b) => checkoutStep(b, { P, key: "pricing" }), { cls: "bl-sheet" }); });
  return { title: t("bill.pp.title") };
}

// ---- #/conditions-de-vente ----------------------------------------------------------------------------------------------
async function termsPage(main, O) {
  const mod = await import(`./terms.${lang()}.js`).catch(() => import("./terms.en.js"));
  const P = O.prices || {}, c = cur(P), S = O.seller || {};
  const gap = `<span class="bl-gap">${t("bill.terms.gap")}</span>`;
  const esc = (s) => String(html`${s}`);
  /** A seller's field, or the visible placeholder. */
  const f = (k) => (S[k] ? esc(S[k]) : gap);
  const body = mod.body({ site: SITE, seller: S, f, gap, esc,
    plus: esc(money(P.plus?.year, c)), club: esc(money(P.club?.year, c)), clubSmall: P.club?.small ? esc(money(P.club.small, c)) : "", smallMax: P.club?.smallMax || "",
    trialDays: P.trialDays || 30, perEntry: P.event?.perEntry ? esc(money(P.event.perEntry, c)) : "", eventCap: P.event?.cap ? esc(money(P.event.cap, c)) : "",
    indemnity: esc(money(4000, "eur")) });
  main.innerHTML = html`<section class="card account-card bl-terms" style="max-width:820px"><div class="card-head"><h1 style="font-size:20px;margin:0">${t("bill.terms.title")}</h1></div>
    <div class="card-body prose">${raw(body)}
      <p><a href="#/tarifs">${t("bill.pricing.link")}</a> · <a href="#/compte/confidentialite">${t("pv.title")}</a></p>${backLink()}
    </div></section>`;
  return { title: t("bill.terms.title") };
}

// ---- #/changements ------------------------------------------------------------------------------------------------------
function changesPage(main, O) {
  const L = lang();
  const text = (e) => { const x = e?.text ?? e; return typeof x === "string" ? x : x?.[L] || x?.en || x?.fr || e?.[L] || e?.en || e?.fr || ""; };
  const title = (e) => { const x = e?.title; return typeof x === "string" ? x : x?.[L] || x?.en || x?.fr || ""; };
  const list = (Array.isArray(O.changes) ? O.changes : []).map((e) => ({ date: e.date || e.day || "", title: title(e), text: text(e) })).filter((e) => e.text || e.title)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  main.innerHTML = html`<section class="card account-card" style="max-width:760px"><div class="card-head"><h1 style="font-size:20px;margin:0">${t("bill.changes.title")}</h1></div>
    <div class="card-body prose"><p>${t("bill.changes.lede")}</p>
      ${list.length ? list.map((e) => html`<article class="bl-change"><h3>${e.date ? html`<time datetime="${e.date}">${day(e.date)}</time>` : ""}${e.title ? html`${e.date ? " — " : ""}${e.title}` : ""}</h3>
        ${e.text.split(/\n{2,}/).map((p) => html`<p>${p}</p>`)}</article>`) : html`<p class="soft">${t("bill.changes.none")}</p>`}
      <p><a href="#/tarifs">${t("bill.pricing.link")}</a> · <a href="#/conditions-de-vente">${t("bill.terms.link")}</a></p>${backLink()}
    </div></section>`;
  return { title: t("bill.changes.title") };
}
export { errText };
