// Pixel › Avatar › « Commandes » (owner, 2026-11-28; docs/pixel/competitions.md §2, §4): the game's keyboard actions in three
// groups — the race, the map, the views —, each with what it does and up to two keys as buttons. A click on a key's button waits
// for the next key pressed and binds it (Escape gives up, Backspace or Delete empties the slot); a key another action uses is
// refused with that action named; Escape and Enter stay the game's own. Saved at once in this browser (games/vkeys.js). Under
// them, what the mouse and a touch screen do (not configurable). The page (pages/virtually.js) loads the area « vplay » before.
import { html, raw } from "../util.js";
import { t } from "../i18n.js";
import { ACTIONS, GROUPS, MAX_KEYS, FIXED, loadKeys, saveKeys, resetKeys, keyLabel, keysReady, boundTo, isDefault, labelsOf } from "./vkeys.js";

/** Draw the « Commandes » page in `el`; returns the cleanup (the key listener, if one waits). */
export async function renderControls(el) {
  await keysReady;
  let B = loadKeys(), waiting = null, savedAt = 0, msgTimer = 0;

  const slotHtml = (id, i) => {
    const code = B[id][i], show = isDefault(B, id) && ACTIONS.find((a) => a.id === id).show;
    const label = code ? (show && i === 0 ? show[0] : keyLabel(code)) : "";
    const busy = waiting && waiting.id === id && waiting.i === i;
    return html`<button type="button" class="vk-slot${code ? "" : " empty"}${busy ? " wait" : ""}" data-id="${id}" data-i="${i}"
      title="${code ? t("vk.slot.change") : t("vk.slot.add")}" aria-label="${t(`vk.a.${id}`)} — ${code ? label : t("vk.slot.add")}">${busy ? t("vk.slot.press") : code ? html`<kbd>${label}</kbd>` : t("vk.slot.empty")}</button>`;
  };
  const rowHtml = (a) => html`<div class="vk-row" data-row="${a.id}">
    <div class="vk-what"><b>${t(`vk.a.${a.id}`)}</b><span class="muted">${t(`vk.ad.${a.id}`, { s: 3 })}</span></div>
    <div class="vk-keys">${Array.from({ length: MAX_KEYS }, (_, i) => slotHtml(a.id, i))}</div></div>`;
  const also = (id) => labelsOf(B, id).filter((l) => !B[id].some((c) => keyLabel(c) === l));

  function draw() {
    el.innerHTML = html`<div class="vk-page">
      <p class="lede vk-intro">${t("vk.intro")}</p>
      ${GROUPS.map((g) => html`<section class="card vk-group"><h3>${t(`vk.g.${g}`)}</h3>${ACTIONS.filter((a) => a.group === g).map(rowHtml)}</section>`)}
      <section class="card vk-group"><h3>${t("vk.g.fixed")}</h3><ul class="vk-fixed">
        <li><kbd>${t("vk.key.esc")}</kbd> ${t("vk.fixed.esc")}</li><li><kbd>${t("vk.key.enter")}</kbd> ${t("vk.fixed.enter")}</li>
        ${also("help").length ? html`<li><kbd>${also("help").join(" ")}</kbd> ${t("vk.fixed.help")}</li>` : ""}</ul></section>
      <div class="vk-bar"><button type="button" class="btn" id="vk-reset">${t("vk.reset")}</button>
        <span class="vk-saved" id="vk-saved" ${raw(savedAt ? "" : "hidden")}>✓ ${t("vk.saved")}</span>
        <span class="vk-msg" id="vk-msg" role="status" aria-live="polite"></span></div>
      <div class="vk-cols">
        <section class="card vk-group"><h3>${t("vk.g.mouse")}</h3><ul class="vk-list">
          <li>${t("vt.keys.look")}</li><li>${t("vk.mouse.map")}</li><li>${t("vk.mouse.turn")}</li><li>${t("vk.mouse.wheel")}</li><li>${t("vk.mouse.tap")}</li></ul></section>
        <section class="card vk-group"><h3>${t("vk.g.touch")}</h3><ul class="vk-list">
          ${["touch.move", "touch.look", "touch.punch", "touch.map", "touch.views", "touch.pause"].map((k) => html`<li>${t(`vt.keys.${k}`)}</li>`)}
          <li>${t("vk.touch.twist")}</li></ul></section>
      </div></div>`;
  }

  const say = (text, bad = false) => {
    const m = el.querySelector("#vk-msg"); if (!m) return;
    m.textContent = text; m.classList.toggle("bad", bad);
    clearTimeout(msgTimer); msgTimer = setTimeout(() => { if (m.isConnected) m.textContent = ""; }, 5000);
  };
  const saved = () => {
    const ok = saveKeys(B); savedAt = Date.now();
    const s = el.querySelector("#vk-saved"); if (s) { s.hidden = false; s.textContent = ok ? `✓ ${t("vk.saved")}` : t("vk.notSaved"); }
  };
  const redraw = (msg, bad) => { draw(); if (msg) say(msg, bad); };

  /** The next key pressed for slot `i` of action `id`. */
  const onWait = (e) => {
    if (!waiting) return;
    e.preventDefault(); e.stopPropagation();
    if (e.repeat) return;
    const { id, i } = waiting, code = e.code;
    waiting = null;
    if (code === "Escape") { redraw(); return; }
    if (code === "Backspace" || code === "Delete") {
      B[id] = B[id].filter((_, k) => k !== i); saved(); redraw(t("vk.cleared", { a: t(`vk.a.${id}`) })); return;
    }
    if (!code || FIXED.has(code)) { redraw(t("vk.err.fixed", { k: keyLabel(code) || e.key }), true); return; }
    const other = boundTo(B, code, id);
    if (other) { redraw(t("vk.err.taken", { k: keyLabel(code), a: t(`vk.a.${other}`) }), true); return; }
    const list = B[id].slice();
    if (list.includes(code)) { redraw(); return; }                // already this action's
    if (i < list.length) list[i] = code; else list.push(code);
    B[id] = list.slice(0, MAX_KEYS); saved();
    redraw(t("vk.bound", { k: keyLabel(code), a: t(`vk.a.${id}`) }));
  };
  const onClick = (e) => {
    const slot = e.target.closest(".vk-slot");
    if (slot) {
      const id = slot.dataset.id, i = Math.min(+slot.dataset.i, B[id].length);   // an empty slot fills the first free place
      waiting = waiting && waiting.id === id && waiting.i === i ? null : { id, i };
      draw();
      if (waiting) { say(t("vk.waiting", { a: t(`vk.a.${id}`) })); el.querySelector(`.vk-slot[data-id="${id}"][data-i="${i}"]`)?.focus(); }
      return;
    }
    if (e.target.closest("#vk-reset")) { waiting = null; B = resetKeys(); savedAt = Date.now(); redraw(t("vk.resetDone")); return; }
    if (waiting) { waiting = null; draw(); }                       // a click elsewhere gives up
  };
  draw();
  el.addEventListener("click", onClick);
  addEventListener("keydown", onWait, true);
  return () => { el.removeEventListener("click", onClick); removeEventListener("keydown", onWait, true); clearTimeout(msgTimer); };
}
