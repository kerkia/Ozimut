// waitbar.js — a wait shown (owner, 2026-11-01: « wherever requests to IGN, OpenStreetMap or running karttapullautin may take time, progress
// bars or hourglasses »): the browser's own <progress>, its value the share done, no value while the share is unknown — the
// browsers then animate it, the hourglass. Used by the generated maps, the 3D views' relief, the Tracer's busy states.

import { t } from "./i18n.js";

const clamp = (f) => Math.max(0, Math.min(1, f));

/** The bar's HTML: frac in [0, 1], or null for a wait of unknown length. */
export const bar = (frac = null, cls = "") => `<progress class="wait-bar${cls ? ` ${cls}` : ""}" max="1"${frac == null ? "" : ` value="${clamp(frac).toFixed(3)}"`}></progress>`;

/** A bar already drawn, set to frac (null: unknown). */
export function setBar(el, frac = null) {
  if (!el) return;
  if (frac == null) el.removeAttribute("value"); else el.value = clamp(frac);
}

/** Seconds as « m:ss » (an elapsed wait). */
export const elapsed = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

// ---- time left (owner, 2026-11-28: « a progress bar with indication about time left, whenever an estimate can be made fairly
// reliably ») -----------------------------------------------------------------------------------------------------------------
// The estimate, in the order trusted: how long the same kind of work took on this device the last times (localStorage ocn.wait);
// else what the caller expects (expect(), e.g. from a first step's own time); else the share done against the time spent, once a
// sixth is done and two seconds have passed. Nothing is said when none holds, nor once the work has outrun its estimate.

const STORE = "ocn.wait";
const known = () => { try { return JSON.parse(localStorage.getItem(STORE) || "{}") || {}; } catch (e) { return {}; } };
function remember(kind, s) {
  if (!kind || !(s > 0)) return;
  try {
    const k = known(), ids = Object.keys(k);
    k[kind] = [...(Array.isArray(k[kind]) ? k[kind] : []), Math.round(s * 10) / 10].slice(-3);
    if (ids.length > 60) delete k[ids[0]];
    localStorage.setItem(STORE, JSON.stringify(k));
  } catch (e) { /* not kept */ }
}
/** Seconds as « 25 s », « 1 min 30 » (rounded as an estimate is: to 5 s from 20 s, to 10 s from a minute, to the minute from 5). */
export function about(s) {
  s = Math.max(1, s);
  if (s < 20) return `${Math.round(s)} s`;
  if (s < 57) return `${Math.round(s / 5) * 5} s`;
  if (s >= 300) return `${Math.round(s / 60)} min`;
  const r = Math.round(s / 10) * 10, m = Math.floor(r / 60), x = r % 60;
  return x ? `${m} min ${x}` : `${m} min`;
}
/** Seconds left of a wait begun `spent` s ago, `frac` of it done (null: unknown), `total` s expected (null: unknown); null when no
 *  fair estimate can be made. */
export function leftOf(spent, frac, total) {
  if (total > 0) return spent < total * 1.1 ? Math.max(1, total - spent) : null;
  return frac >= 1 / 6 && frac < 1 && spent >= 2 ? (spent * (1 - frac)) / frac : null;
}
/**
 * A wait followed in a box holding a <progress> and a <span>: follow(find, { kind, guess }) → { set(label, frac), expect(seconds),
 * stop(ok) }. find() returns the box as it is now (pages draw theirs again), or null; kind names the work for this device's memory
 * (stop(true) keeps how long it took); guess, seconds, stands in until then. The box is painted twice a second: the bar by the
 * share done, or by the time when a total is known, and the label followed by the time left.
 */
export function follow(find, { kind = "", guess = null } = {}) {
  const t0 = performance.now(), past = known()[kind];
  let total = Array.isArray(past) && past.length ? past.reduce((a, b) => a + b, 0) / past.length : guess, sure = !!(Array.isArray(past) && past.length);
  let label = "", frac = null, timer = 0;
  const paint = () => {
    const box = find(); if (!box) return;
    const spent = (performance.now() - t0) / 1000, left = leftOf(spent, frac, total);
    setBar(box.querySelector("progress"), total > 0 && left != null ? Math.min(0.97, spent / total) : frac);
    const span = box.querySelector("span");
    if (span) span.textContent = [label, left != null ? t("wait.left", { t: about(left) }) : ""].filter(Boolean).join(" · ");
  };
  timer = setInterval(paint, 500);
  return {
    set(l, f = null) { label = l || ""; frac = f; paint(); },
    /** A better total than the guess (never over this device's own memory). */
    expect(s) { if (!sure && s > 0) total = s; },
    stop(ok = false) { clearInterval(timer); if (ok) remember(kind, (performance.now() - t0) / 1000); },
  };
}
