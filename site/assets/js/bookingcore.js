// The entries and their start times (owner, 2026-11-03, then 2026-11-22: the booking became the entries' start times): what
// the runners' page (pages/entry.js) and the organisers' tab (pages/entriesorg.js) share — the API's calls
// (functions/api/entries/[[path]].js), the slots of a course, the club rule as the server applies it (_lib/booking.js clubKey),
// the clubs one picks from (France's and Spain's lists, the clubs other runners of the race typed for another country), and the
// runner's form (names, the club's country, the club, the card).

import { html, $, $$ } from "./util.js";
import { t, locale } from "./i18n.js";
import * as country from "./country.js";
import { fmtMoney } from "./entryprice.js";

/** A call to /api/entries; -> { ok, status, data }. */
export async function call(method, path, body) {
  try {
    const r = await fetch(`api/entries${path}`, { method, credentials: "same-origin", cache: "no-store",
      headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
    let data = null;
    try { data = await r.json(); } catch (e) { /* none */ }
    return { ok: r.ok, status: r.status, data: data || {} };
  } catch (e) { return { ok: false, status: 0, data: {} }; }
}

const two = (n) => String(n).padStart(2, "0");
/** 34260 -> "9:31" (seconds shown only when there are some). */
export const hm = (s) => (s == null ? "" : `${Math.floor(s / 3600)}:${two(Math.floor((s % 3600) / 60))}${s % 60 ? `:${two(s % 60)}` : ""}`);
/** "9:31", "09h31", "9:31:30" -> seconds of the day; null if it is no time. */
export function parseHm(x) {
  const m = /^\s*(\d{1,2})\s*[:hH.]\s*(\d{2})(?:\s*[:.]\s*(\d{2}))?\s*$/.exec(String(x || ""));
  if (!m || +m[1] > 23 || +m[2] > 59 || +(m[3] || 0) > 59) return null;
  return +m[1] * 3600 + +m[2] * 60 + +(m[3] || 0);
}
/** "2", "1:30", "0:30" (minutes, or minutes:seconds) -> seconds; null if not. */
export function parseStep(x) {
  const s = String(x || "").trim().replace(",", ".");
  let m = /^(\d+):(\d{2})$/.exec(s);
  if (m) return +m[1] * 60 + +m[2];
  m = /^\d+(\.\d+)?$/.exec(s);
  return m ? Math.round(Number(s) * 60) : null;
}
export const fmtStep = (s) => (s % 60 ? `${Math.floor(s / 60)}:${two(s % 60)}` : String(s / 60));

/** A circuit's starts, in seconds. */
export function slotsOf(c) {
  const out = [];
  for (let s = c.first; s <= c.last && out.length < 400; s += c.step) out.push(s);
  return out;
}

const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
/** The club the gap rule compares (_lib/booking.js clubKey). */
export function clubKey(r) {
  if (!r.club_country) return "";
  if (r.club_code) return `${r.club_country}:${r.club_code}`;
  const n = norm(r.club_name);
  return n ? `${r.club_country}:${n}` : "";
}
/** A runner's club as shown: its name, its country's flag for a club abroad. */
export function clubLabel(r, here = "FR") {
  if (!r.club_country) return t("bk.noClub");
  const name = r.club_name || r.club_code || "";
  return r.club_country === here ? name : `${name} (${country.name(r.club_country)})`;
}

// the clubs one picks from: France's (its public copy's names: every account reads it) and Spain's, by number
const LISTS = { FR: "data/fr/pub/meta.json", ES: "data/es/meta.json" };
const lists = new Map();
export function clubList(cc) {
  if (!LISTS[cc]) return Promise.resolve(null);
  if (!lists.has(cc)) {
    lists.set(cc, fetch(LISTS[cc], { credentials: "same-origin" }).then((r) => (r.ok ? r.json() : null))
      .then((m) => Object.entries(m?.names?.clubs || {}).map(([code, name]) => ({ code, name })).sort((a, b) => a.name.localeCompare(b.name)))
      .catch(() => null));
  }
  return lists.get(cc);
}

/**
 * The runner's form: first and last names, the club's country (« no club » first), the club — a federation's list (France,
 * Spain) or typed, with the clubs other runners of the race typed for that country offered (`known`: [{ cc, name }]) —,
 * the licence (France), the card when asked. -> markup; bindRunnerForm reads and checks it.
 */
export function runnerForm(id, r = {}, { card = false, licence = true } = {}) {
  const cc = r.club_country || "";
  const members = country.sortedMembers(["FR"]);
  return html`<div class="bk-form" id="${id}">
    <div class="bk-form-row">
      <label class="field"><span>${t("bk.f.first")}</span><input name="first_name" value="${r.first_name || ""}" maxlength="60" required autocomplete="off"></label>
      <label class="field"><span>${t("bk.f.last")}</span><input name="last_name" value="${r.last_name || ""}" maxlength="60" required autocomplete="off"></label>
    </div>
    <div class="bk-form-row">
      <label class="field"><span>${t("bk.f.country")}</span><select name="club_country">
        <option value="" ${cc ? "" : "selected"}>${t("bk.noClub")}</option>
        <option value="FR" ${cc === "FR" ? "selected" : ""}>${country.name("FR")}</option>
        ${members.map((x) => html`<option value="${x}" ${cc === x ? "selected" : ""}>${country.name(x)}</option>`)}</select></label>
      <label class="field bk-club"><span>${t("bk.f.club")}</span><input name="club" list="${id}-clubs" value="${r.club_name || r.club_code || ""}" maxlength="80" autocomplete="off">
        <datalist id="${id}-clubs"></datalist></label>
    </div>
    <div class="bk-form-row">
      ${licence ? html`<label class="field bk-lic"><span>${t("bk.f.licence")}</span><input name="licence" value="${r.licence || ""}" inputmode="numeric" maxlength="9" autocomplete="off"></label>` : ""}
      ${card ? html`<label class="field"><span>${t("bk.f.card")}</span><input name="card" value="${r.card || ""}" inputmode="numeric" maxlength="10" autocomplete="off"></label>` : ""}
    </div>
    <div class="bk-form-err" role="alert"></div>
  </div>`;
}
/** Bind the form: the club's list follows the country; -> { read() → fields | null (an error shown) }. */
export function bindRunnerForm(root, { known = [] } = {}) {
  const sel = $("[name=club_country]", root), club = $("[name=club]", root), dl = $("datalist", root);
  const lic = $("[name=licence]", root)?.closest(".field");
  let list = null;
  const fill = async () => {
    const cc = sel.value;
    club.disabled = !cc;
    if (!cc) club.value = "";
    if (lic) lic.hidden = cc !== "FR";
    list = await clubList(cc);
    const typed = [...new Set(known.filter((k) => k.cc === cc && k.name).map((k) => k.name))];
    dl.innerHTML = list ? list.map((c) => html`<option value="${c.name}">${c.code}</option>`).join("")
      : typed.map((n) => html`<option value="${n}"></option>`).join("");
  };
  sel.addEventListener("change", fill);
  fill();
  const err = $(".bk-form-err", root);
  return {
    read() {
      err.textContent = "";
      const v = (n) => ($(`[name=${n}]`, root)?.value || "").trim();
      const out = { first_name: v("first_name"), last_name: v("last_name"), club_country: sel.value, club_code: "", club_name: "",
        licence: sel.value === "FR" ? v("licence").replace(/\s+/g, "") : "", card: v("card").replace(/\s+/g, "") };
      if (!out.first_name || !out.last_name) { err.textContent = t("bk.err.names"); return null; }
      if (out.club_country) {
        const typed = v("club");
        if (!typed) { err.textContent = t("bk.err.club"); return null; }
        if (list) {             // a federation's list: its number, the name as the list writes it (or its number typed)
          const hit = list.find((c) => norm(c.name) === norm(typed) || c.code === typed.padStart(4, "0"));
          if (!hit) { err.textContent = t("bk.err.clubList"); return null; }
          out.club_code = hit.code; out.club_name = hit.name;
        } else out.club_name = typed;
      }
      if (out.licence && !/^\d{1,9}$/.test(out.licence)) { err.textContent = t("bk.err.licence"); return null; }
      if (out.card && !/^\d{1,10}$/.test(out.card)) { err.textContent = t("bk.err.card"); return null; }
      return out;
    },
    focus() { $("[name=first_name]", root).focus(); },
  };
}
/** The slots of every circuit taken: Map "circuit|s" -> booking. */
export const takenMap = (bookings) => new Map(bookings.map((b) => [`${b.c}|${b.s}`, b]));
/** Would a runner of club key `ck` at `s` break the club rule, given the bookings (`except`: their own booking's id)? */
export const clashes = (bookings, ck, s, gap, except = null) => !!ck && gap > 0
  && bookings.some((b) => b.ck === ck && b.id !== except && Math.abs(b.s - s) < gap);
export const qs = (sel, root) => $$(sel, root);

/** The parts of an entry's price, worded: « Licenciés 9 € + location de puce 3 € » (entryprice.js's codes « @rent »…). */
export function partsText(parts, cur) {
  return (parts || []).map(([l, c]) => `${l.startsWith("@") ? t(`ent.part.${l.slice(1)}`) : l} ${fmtMoney(c, cur, locale())}`).join(" + ");
}
