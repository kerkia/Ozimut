// This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not
// distributed with this file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Questions and messages drawn in the page, in place of the browser's confirm() and alert(): after a few dialogs in a row
// a browser may stop showing them, and confirm() then answers « no » at once — a deletion asked for would do nothing.

import { html } from "./html.js";
import { t } from "./i18n.js";

function open(message, buttons) {
  return new Promise((resolve) => {
    const d = document.createElement("dialog");
    d.className = "chr-dlg chr-ask";
    d.setAttribute("role", "alertdialog");
    d.innerHTML = html`<p class="chr-ask-msg"></p><div class="chr-ask-btns">${buttons.map((b, i) => html`<button type="button" class="btn ${b.primary ? "btn-primary" : ""}" data-i="${i}">${b.label}</button>`)}</div>`;
    d.querySelector(".chr-ask-msg").textContent = String(message ?? "");   // the text as it is, line breaks kept by the CSS
    const no = buttons.find((b) => b.cancel)?.value;
    let done = false;
    // answered at once, not on the dialog's « close » event (queued, and not fired at all in a page that is not drawn)
    const finish = (v) => { if (done) return; done = true; try { d.close(); } catch (e) { /* closed */ } d.remove(); resolve(v); };
    d.addEventListener("click", (e) => {
      const b = e.target.closest("[data-i]");
      if (b) finish(buttons[Number(b.dataset.i)].value);
      else if (e.target === d) {                                           // a click beside it (the backdrop): as cancel
        const r = d.getBoundingClientRect();
        if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) finish(no);
      }
    });
    d.addEventListener("cancel", (e) => { e.preventDefault(); finish(no); });   // Escape
    d.addEventListener("close", () => finish(no));
    document.body.append(d);
    try { d.showModal(); } catch (e) { d.setAttribute("open", ""); }
    d.querySelector(buttons.some((b) => b.cancel) ? "[data-i]:not(.btn-primary)" : ".btn-primary")?.focus();
  });
}

/** A question: true when the reader confirms. `ok` the confirming button's words (an action's own: « Supprimer »…). */
export function confirmBox(message, { ok = t("chr.yes"), cancel = t("chr.cancel") } = {}) {
  return open(message, [{ label: cancel, value: false, cancel: true }, { label: ok, value: true, primary: true }]).then((v) => v === true);
}

/** A message the reader acknowledges. */
export function alertBox(message) {
  return open(message, [{ label: t("chr.yes"), value: true, primary: true, cancel: true }]);
}
