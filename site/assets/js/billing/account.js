// « Réglages › Abonnement » (docs/billing/design.md §9; loaded only through ../offers.js, never in the app): the account's
// plan and its renewal, the payment method and invoices (Stripe's portal), what a club or a federation opens for it, the trial,
// a code, termination in three clicks (« Résilier » → the summary → « Confirmer la résiliation »), withdrawal within 14 days
// of the first payment. Back from the payment page (&retour=1): « Activation en cours… », the state asked every 2 s for 30 s.

import { html, raw, t, api, offer, state, money, day, today, capName, capShort, capVal, adds, plusPrice, clubPrice, cur, planName, dialog, run, errText,
  refreshAccount, terms, seen } from "./core.js";
import { checkoutStep } from "./sheet.js";
import { bar, setBar } from "../waitbar.js";

const WAIT_S = 30, EVERY_S = 2;
// (the state's shapes: functions/_lib/billing.js stateOf — sub { plan, status, period, start, end, cancelAtEnd, amount, currency,
// firstPaidAt, endedAt }, withdrawUntil an ISO time, invoices Stripe's own with their links)
const active = (S) => !!S?.sub && ["active", "past_due"].includes(S.sub.status) && !S.sub.endedAt;
const subEnd = (S) => S?.sub?.end || "";
/** What someone else opens for the account: [{ name, plan, until, scope }] — a club, a federation (never the person's own). */
function opened(S) {
  const seenKey = new Set(), out = [];
  for (const w of Object.values(S?.why || {})) {
    if (!w || !w.scope || ["person", "user", "free"].includes(w.scope)) continue;
    const k = `${w.scope}|${w.name}|${w.plan}`;
    if (!seenKey.has(k)) { seenKey.add(k); out.push(w); }
  }
  for (const o of S?.orgs || []) if (o.plan && !out.some((w) => w.name === o.name)) out.push({ scope: "club", name: o.name, plan: o.plan, until: o.until });
  return out;
}

/** Draws the section into `box` (a .card), and again after each action. `back`: returning from the payment page. */
export async function draw(box, { back = false } = {}) {
  const body = box.querySelector(".card-body") || box;
  let O, S;
  try { [O, S] = await Promise.all([offer(), state()]); }
  catch (e) { body.innerHTML = html`<div class="notice">${errText(e)}</div>`; return; }
  if (back && !active(S)) return activating(box, body);
  if (back) history.replaceState(null, "", "#/reglages?onglet=abonnement");
  render(box, body, O || {}, S, back);
}

/** Back from the payment page: the payment's confirmation comes to the server by itself, a few seconds later. */
function activating(box, body) {
  body.innerHTML = html`<div class="bl-activating"><p><b>${t("bill.act.title")}</b></p>${raw(bar(0))}<p class="muted bl-small">${t("bill.act.hint")}</p></div>`;
  const pb = body.querySelector("progress"), t0 = Date.now();
  const tick = async () => {
    if (!box.isConnected) return;
    const s = (Date.now() - t0) / 1000;
    setBar(pb, s / WAIT_S);
    let S = null;
    try { S = await state(); } catch (e) { S = null; }
    if (!box.isConnected) return;
    if (active(S)) { await refreshAccount(); history.replaceState(null, "", "#/reglages?onglet=abonnement"); return draw(box, {}).then(() => flash(box, t("bill.act.done"))); }
    if (s >= WAIT_S) {
      history.replaceState(null, "", "#/reglages?onglet=abonnement");
      await draw(box, {});
      box.querySelector(".card-body")?.insertAdjacentHTML("afterbegin", html`<div class="notice">${t("bill.act.late")}</div>`);
      return;
    }
    setTimeout(tick, EVERY_S * 1000);
  };
  setTimeout(tick, EVERY_S * 1000);
}
const flash = (box, text) => box.querySelector(".card-body")?.insertAdjacentHTML("afterbegin", html`<div class="notice ok">${text}</div>`);

function render(box, body, O, S, justBack) {
  const P = S.prices || O.prices || {}, c = cur(P), price = plusPrice(P);
  const sub = active(S) ? S.sub : null, trial = !sub && S.trial?.until && S.trial.until >= today() ? S.trial : null;
  const others = opened(S), end = subEnd(S);
  const withdraw = sub && S.withdrawUntil && S.withdrawUntil > new Date().toISOString() ? S.withdrawUntil : "";
  const failing = sub && sub.status === "past_due";
  const leaving = sub && sub.cancelAtEnd;
  const giftPlus = !sub && !trial && S.plan && S.plan !== "free";
  const again = () => draw(box, {});
  body.innerHTML = html`<div class="stack" style="gap:12px">
    ${sub ? html`
      <div class="bl-plan-line"><span class="bl-mark bl-mark-big" data-bl-plan="plus">${t("bill.mark.plus")}</span>
        <div><b>${planName("plus")}</b> · ${t("bill.price.year", { price: money(sub.amount ?? price.amount, sub.currency || c) })}<br>
          <span class="muted">${leaving ? t("bill.st.ends", { date: day(end) }) : t("bill.st.renews", { date: day(end) })}</span></div></div>
      ${failing ? html`<div class="notice">${t("bill.st.failing")}</div>` : ""}
      ${leaving ? html`<div class="notice info">${t("bill.st.leaving", { date: day(end) })}</div>` : ""}
      <div class="notice" data-note hidden></div>
      <div class="row bl-actions">
        ${S.canPortal !== false ? html`<button type="button" class="btn ${failing ? "btn-primary" : ""}" data-portal>${t("bill.st.portal")}</button>` : ""}
        ${leaving ? html`<button type="button" class="btn btn-primary" data-resume>${t("bill.st.resume")}</button>`
          : html`<button type="button" class="btn" data-cancel>${t("bill.st.cancel")}</button>`}
        ${withdraw ? html`<button type="button" class="btn btn-ghost" data-withdraw>${t("bill.st.withdraw")}</button>` : ""}</div>
      ${withdraw ? html`<p class="muted bl-small">${t("bill.st.withdrawUntil", { date: day(withdraw) })}</p>` : ""}`
    : trial ? html`
      <div class="bl-plan-line"><span class="bl-mark bl-mark-big" data-bl-plan="plus">${t("bill.mark.plus")}</span>
        <div><b>${t("bill.st.trial", { plan: planName("plus") })}</b><br><span class="muted">${t("bill.st.trialUntil", { date: day(trial.until) })}</span></div></div>
      <p class="bl-explain">${t("bill.st.trialEnd")}</p>
      <div class="row bl-actions">${price.ready ? html`<button type="button" class="btn btn-primary" data-sub>${t("bill.sub.btn")}</button>` : html`<span class="muted bl-small">${t("bill.sub.notReady")}</span>`}
        <span class="bl-price-in">${t("bill.price.year", { price: money(price.amount, c) })}${price.founder ? html` · <span class="bl-founder">${price.until ? t("bill.price.founderUntil", { date: day(price.until) }) : t("bill.price.founder")}</span>` : ""}</span></div>`
    : html`
      <div class="bl-plan-line"><div><b>${giftPlus ? planName(S.plan) : t("bill.st.free")}</b><br><span class="muted">${t(giftPlus ? "bill.st.giftLede" : "bill.st.freeLede")}</span></div></div>
      ${giftPlus ? "" : html`<ul class="bl-plans">
        <li><b>${planName("plus")}</b> · ${t("bill.price.year", { price: money(price.amount, c) })}${price.founder ? html` <s class="muted">${money(price.full, c)}</s> <span class="bl-founder">${price.until ? t("bill.price.founderUntil", { date: day(price.until) }) : t("bill.price.founder")}</span>` : ""}<br>
          <span class="muted">${t("bill.st.plusLine")}</span></li>
        <li><b>${planName("club")}</b> · ${t("bill.sheet.clubPrice", { price: money(clubPrice(P, null), c) })}<br><span class="muted">${t("bill.st.clubLine")}</span></li></ul>
      <div class="notice" data-note hidden></div>
      <div class="row bl-actions">${S.canTrial ? html`<button type="button" class="btn btn-primary" data-trial>${t("bill.trial.btn", { n: P.trialDays || 30 })}</button>` : ""}
        ${price.ready ? html`<button type="button" class="btn ${S.canTrial ? "" : "btn-primary"}" data-sub>${t("bill.sub.btn")}</button>` : ""}
        <a class="btn btn-ghost" href="#/tarifs">${t("bill.sheet.all")}</a></div>
      ${S.canTrial ? html`<p class="muted bl-small">${t("bill.trial.hint")}</p>` : ""}
      ${price.ready ? "" : html`<p class="muted bl-small">${t("bill.sub.notReady")}</p>`}`}`}

    ${(S.invoices || []).length ? html`<div class="bl-opened"><b>${t("bill.st.invoices")}</b>
      <ul>${S.invoices.map((i) => html`<li>${day(i.day, "medium")} · ${money(i.amount, i.currency || c)}${i.number ? html` · <span class="muted">${i.number}</span>` : ""}
        ${i.pdf || i.url ? html` · <a href="${i.pdf || i.url}" target="_blank" rel="noopener">${t("bill.inv.pdf")}</a>` : ""}</li>`)}</ul></div>` : ""}

    ${others.length ? html`<div class="bl-opened"><b>${t(sub || trial ? "bill.st.alsoOpened" : "bill.st.opened")}</b>
      <ul>${others.map((w) => html`<li>${t(`bill.st.by.${["club", "federation", "event"].includes(w.scope) ? w.scope : "club"}`, { name: w.name || "—", plan: planName(w.plan) })}${w.until ? html` <span class="muted">· ${t("bill.until", { date: day(w.until) })}</span>` : ""}</li>`)}</ul></div>` : ""}

    ${(S.grants || []).filter((g) => g.reason !== "trial" && (!g.until || g.until >= today())).map((g) => html`<p class="bl-small">${t("bill.st.grant", { plan: planName(g.plan) })}${g.until ? html` <span class="muted">· ${t("bill.until", { date: day(g.until) })}</span>` : ""}</p>`)}

    ${(S.orgs || []).some((o) => o.may) ? html`<p class="bl-small">${(S.orgs || []).filter((o) => o.may).map((o) => html`<a href="#/monclub?org=${o.id}&onglet=formule">${t("bill.st.clubLink", { name: o.name })}</a> `)}</p>` : ""}

    ${sub ? "" : html`<form class="row bl-code" data-code><label class="field"><span>${t("bill.code.label")}</span><input name="code" autocomplete="off" maxlength="40" spellcheck="false"></label>
      <button type="submit" class="btn btn-sm">${t("bill.code.use")}</button><div class="notice" data-code-note hidden></div></form>`}
    <p class="muted bl-small">${terms()} · <a href="#/tarifs">${t("bill.pricing.link")}</a> · <a href="#/changements">${t("bill.changes.link")}</a></p>
  </div>`;
  if (justBack) flash(box, t("bill.act.done"));

  const note = body.querySelector("[data-note]");
  body.querySelector("[data-trial]")?.addEventListener("click", (e) => run(e.currentTarget, note, async () => {
    seen("trial", "settings");
    await api("trial", { method: "POST", body: {} });
    await refreshAccount();
    await again();
    flash(box, t("bill.trial.started", { n: P.trialDays || 30 }));
  }));
  body.querySelector("[data-sub]")?.addEventListener("click", () => { seen("subscribe", "settings"); dialog((b) => checkoutStep(b, { P, key: "settings" }), { cls: "bl-sheet" }); });
  body.querySelector("[data-portal]")?.addEventListener("click", (e) => run(e.currentTarget, note, async () => {
    const j = await api("portal", { method: "POST", body: {} });
    if (j.url) location.href = j.url;
  }));
  body.querySelector("[data-resume]")?.addEventListener("click", (e) => run(e.currentTarget, note, async () => {
    await api("resume", { method: "POST", body: {} });
    await again();
    flash(box, t("bill.st.resumed"));
  }));
  body.querySelector("[data-cancel]")?.addEventListener("click", async () => {
    if (await cancelDialog(O, S, end)) { await again(); flash(box, t("bill.cancel.done", { date: day(end) })); }
  });
  body.querySelector("[data-withdraw]")?.addEventListener("click", async () => {
    const r = await withdrawDialog(S, P);
    if (r) { await refreshAccount(); await again(); flash(box, r.refund != null ? t("bill.wd.done", { amount: money(r.refund, r.currency || c) }) : t("bill.wd.doneNo")); }
  });
  body.querySelector("[data-code]")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.currentTarget, code = String(new FormData(f).get("code") || "").trim(), cn = f.querySelector("[data-code-note]");
    if (!code) return;
    const ok = await run(f.querySelector("button"), cn, async () => { await api("code", { method: "POST", body: { code } }); return true; });
    if (ok) { await refreshAccount(); await again(); flash(box, t("bill.code.done")); }
  });
}

/** What the account uses beyond the free plan: sentences for the termination's summary (stored things stay readable). */
function beyondFree(O) {
  const out = [];
  for (const a of adds(O, "plus")) {
    if (a.v === true) { out.push(t("bill.cancel.loseFlag", { name: capName(a.key) })); continue; }
    out.push(t("bill.cancel.loseLimit", { name: capShort(a.key), from: capVal(a.key, a.v), to: capVal(a.key, a.free) || "—" }));
  }
  return out;
}
/** « Résilier » → the summary → « Confirmer la résiliation ». Resolves true once terminated. */
function cancelDialog(O, S, end) {
  return dialog((body, close) => {
    const lost = beyondFree(O);
    body.innerHTML = html`<h2>${t("bill.cancel.title")}</h2>
      <p>${t("bill.cancel.runs", { date: day(end) })}</p>
      ${lost.length ? html`<p><b>${t("bill.cancel.after")}</b></p><ul class="bl-facts">${lost.map((s) => html`<li>${s}</li>`)}</ul>` : ""}
      <p class="bl-explain">${t("bill.cancel.keeps")}</p>
      <div class="notice" data-note hidden></div>
      <div class="bl-btns"><button type="button" class="btn" data-keep>${t("bill.cancel.keep")}</button>
        <button type="button" class="btn btn-primary" data-confirm>${t("bill.cancel.confirm")}</button></div>`;
    body.querySelector("[data-keep]").addEventListener("click", () => close(false));
    body.querySelector("[data-confirm]").addEventListener("click", (e) => run(e.currentTarget, body.querySelector("[data-note]"), async () => {
      seen("cancel", "");
      await api("cancel", { method: "POST", body: {} });
      close(true);
    }));
  }).then((v) => v === true);
}
/** « Me rétracter »: within 14 days of the first payment, the plan ends now and the unused share is refunded. */
function withdrawDialog(S, P) {
  const sub = S.sub || {}, c = sub.currency || cur(P);
  // amount × days left / days of the period (the server computes the refund; this is the same rule, shown before)
  const d = (iso) => Date.parse(`${String(iso).slice(0, 10)}T12:00:00Z`);
  const from = sub.start, to = sub.end;
  const total = from && to ? Math.max(1, Math.round((d(to) - d(from)) / 864e5)) : 0;
  const left = total ? Math.max(0, Math.min(total, Math.round((d(to) - d(today())) / 864e5))) : 0;
  const est = total && sub.amount != null ? Math.round(sub.amount * left / total) : null;
  return dialog((body, close) => {
    body.innerHTML = html`<h2>${t("bill.wd.title")}</h2>
      <p>${t("bill.wd.what", { date: day(S.withdrawUntil) })}</p>
      <p>${est != null ? t("bill.wd.amount", { amount: money(est, c), paid: money(sub.amount, c), left, total }) : t("bill.wd.amountNo")}</p>
      <p class="bl-explain">${t("bill.wd.ends")}</p>
      <div class="notice" data-note hidden></div>
      <div class="bl-btns"><button type="button" class="btn" data-keep>${t("bill.cancel.keep")}</button>
        <button type="button" class="btn btn-primary" data-confirm>${t("bill.wd.confirm")}</button></div>`;
    body.querySelector("[data-keep]").addEventListener("click", () => close(null));
    body.querySelector("[data-confirm]").addEventListener("click", (e) => run(e.currentTarget, body.querySelector("[data-note]"), async () => {
      const j = await api("withdraw", { method: "POST", body: {} });
      close({ refund: j.refund ?? j.refunded ?? j.amount ?? null, currency: j.currency });
    }));
  }).then((v) => v || null);
}
