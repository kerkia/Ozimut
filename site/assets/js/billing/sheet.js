// The plan sheet (docs/billing/design.md §9; loaded only through ../offers.js): opened in place when an option the account
// lacks is used (offers.guard), when its mark is clicked, or on a refusal for a plan reason. What the option does, what else
// the plan holds, the yearly price, « Essayer 30 jours, sans carte » and « S'abonner pour l'année » — whose second step holds
// the box the law asks for (the express request to start during the withdrawal period) before the payment page.

import { html, t, api, offer, state, seen, money, day, capName, capWhat, capVal, adds, needOf, participantCaps, plusPrice, clubPrice, cur,
  planName, dialog, run, say, refreshAccount, terms } from "./core.js";
import * as auth from "../auth.js";

let openNow = null;
/**
 * The sheet for a capability. Resolves true when the option may be used after it (a trial started here), false otherwise.
 * `refusal`: the server's 402 / 413 body, said on top. One sheet at a time.
 */
export function open(key, { refusal = null, from = "" } = {}) {
  if (openNow) return openNow;
  openNow = show(key, refusal, from).finally(() => { openNow = null; });
  return openNow;
}

async function show(key, refusal, from) {
  const me = auth.session();
  const [O, S] = await Promise.all([offer(), me ? state().catch(() => null) : null]);
  if (!O) return false;
  const need = needOf(O, key), P = O.prices || {}, c = cur(P);
  seen("sheet", key);
  const res = await dialog((body, close) => {
    const first = () => {
      const price = plusPrice(P);
      const others = adds(O, need).filter((a) => a.key !== key);
      const mine = adds(O, need).find((a) => a.key === key);
      const val = mine ? capVal(key, mine.v) : "";
      const open = participantCaps(O).includes(key);
      body.innerHTML = html`
        <div class="bl-sheet-head"><span class="bl-mark bl-mark-big" data-bl-plan="${need}">${t(`bill.mark.${need}`)}</span><h2>${capName(key)}</h2></div>
        ${refusal ? html`<div class="notice">${t(refusal.error === "quota" ? "bill.sheet.quota" : "bill.sheet.refused")}</div>` : ""}
        <p class="bl-what">${capWhat(key)}${val ? html` <b>${t("bill.sheet.with", { plan: planName(need), val })}</b>` : ""}</p>
        ${others.length ? html`<div class="bl-also"><b>${t("bill.sheet.also", { plan: planName(need) })}</b>
          <ul>${others.map((a) => html`<li>${capName(a.key)}${capVal(a.key, a.v) ? html` <span class="muted">· ${capVal(a.key, a.v)}</span>` : ""}</li>`)}</ul></div>` : ""}
        ${need === "club" ? html`
          <p class="bl-price"><b>${t("bill.sheet.clubPrice", { price: money(clubPrice(P, null), c) })}</b>${P.club?.small ? html` <span class="muted">${t("bill.sheet.clubSmall", { price: money(P.club.small, c), n: P.club.smallMax })}</span>` : ""}</p>
          <p class="bl-explain">${t("bill.sheet.club")}</p>
          <div class="bl-btns"><a class="btn btn-primary" href="#/monclub?onglet=formule" data-go>${t("bill.sheet.toClub")}</a>
            <a class="btn" href="#/tarifs" data-go>${t("bill.sheet.all")}</a></div>`
        : html`
          <p class="bl-price"><b>${t("bill.price.year", { price: money(price.amount, c) })}</b>
            ${price.founder ? html` <s class="muted">${money(price.full, c)}</s> <span class="bl-founder">${price.until ? t("bill.price.founderUntil", { date: day(price.until) }) : t("bill.price.founder")}</span>` : ""}</p>
          ${open ? html`<p class="bl-explain">${t("bill.sheet.participants")}</p>` : ""}
          ${!me ? html`<p class="bl-explain">${t("bill.sheet.account")}</p>
            <div class="bl-btns"><a class="btn btn-primary" href="#/compte/inscription" data-go>${t("ac.register")}</a><a class="btn" href="#/" data-go>${t("ac.login")}</a></div>`
          : html`<div class="notice" data-note hidden></div>
            <div class="bl-btns">${S?.canTrial ? html`<button type="button" class="btn btn-primary" data-trial>${t("bill.trial.btn", { n: P.trialDays || 30 })}</button>` : ""}
              ${price.ready ? html`<button type="button" class="btn ${S?.canTrial ? "" : "btn-primary"}" data-sub>${t("bill.sub.btn")}</button>` : ""}</div>
            ${price.ready ? "" : html`<p class="muted bl-small">${t("bill.sub.notReady")}</p>`}
            ${S?.canTrial ? html`<p class="muted bl-small">${t("bill.trial.hint")}</p>` : ""}
            <p class="bl-small"><a href="#/tarifs" data-go>${t("bill.sheet.all")}</a></p>`}`}`;
      body.querySelectorAll("[data-go]").forEach((a) => a.addEventListener("click", () => close(false)));
      const note = body.querySelector("[data-note]");
      body.querySelector("[data-trial]")?.addEventListener("click", (e) => run(e.currentTarget, note, async () => {
        seen("trial", key);
        await api("trial", { method: "POST", body: { from: key } });
        await refreshAccount();
        close("trial");
      }));
      body.querySelector("[data-sub]")?.addEventListener("click", () => { seen("subscribe", key); second(); });
    };
    const second = () => checkoutStep(body, { P, back: first, key });
    first();
  }, { cls: "bl-sheet" });
  if (res !== "trial") return false;
  // the trial is on: said once, then the tool goes on where it was
  window.dispatchEvent(new CustomEvent("ocn:plan", { detail: { key } }));
  await say(t("bill.trial.started", { n: (O.prices || {}).trialDays || 30 }));
  return !from || auth.can?.(key) !== false;
}

/** The step before the payment page: the price again, the express request (unticked), the terms, « Continuer vers le paiement ». */
export function checkoutStep(body, { P, back = null, key = "" }) {
  const price = plusPrice(P), c = cur(P);
  body.innerHTML = html`
    <div class="bl-sheet-head"><span class="bl-mark bl-mark-big" data-bl-plan="plus">${t("bill.mark.plus")}</span><h2>${t("bill.co.title")}</h2></div>
    <p class="bl-price"><b>${t("bill.price.year", { price: money(price.amount, c) })}</b>
      ${price.founder ? html` <span class="bl-founder">${t("bill.price.founderKeep")}</span>` : ""}</p>
    <ul class="bl-facts"><li>${t("bill.co.renew")}</li><li>${t("bill.co.cancel")}</li><li>${t("bill.co.withdraw")}</li><li>${t("bill.co.pay")}</li></ul>
    <label class="check bl-consent"><input type="checkbox" data-consent><span>${t("bill.co.consent")}</span></label>
    <p class="bl-small">${t("bill.co.terms")} ${terms()}</p>
    <div class="notice" data-note hidden></div>
    <div class="bl-btns">${back ? html`<button type="button" class="btn" data-back>${t("bill.back")}</button>` : ""}
      <button type="button" class="btn btn-primary" data-pay disabled>${t("bill.co.go")}</button></div>`;
  const box = body.querySelector("[data-consent]"), pay = body.querySelector("[data-pay]"), note = body.querySelector("[data-note]");
  box.addEventListener("change", () => { pay.disabled = !box.checked; });
  body.querySelector("[data-back]")?.addEventListener("click", back);
  pay.addEventListener("click", () => run(pay, note, async () => {
    seen("checkout", key);
    const j = await api("checkout", { method: "POST", body: { plan: "plus", startNow: true } });
    if (!j.url) throw Object.assign(new Error("other"), { code: "other" });
    location.href = j.url;
    await new Promise(() => {});            // the page is leaving: the button stays busy
  }));
}
