// This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not
// distributed with this file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The desktop application's documentation as a page of its own (app/www/doc.html: Help › Documentation in the
// application, and /doc.html at the hub's address for the other stations). The words are the content modules
// src/doc/app.<lang>.js — the same ones Orga's documentation shows on the site (content/guide.*.js, chapter
// « chrono-app ») —, in the reader's language as the rest of Chrono chooses it; this module only lays them out: a title, a
// table of contents, a section each. The sections' markup is the modules' own static HTML.

import { lang } from "../lib/i18n.js";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/** The documentation in the reader's language; a language without its module reads English, then French. */
async function load() {
  for (const l of [...new Set([lang(), "en", "fr"])]) {
    try {
      const doc = (await import(`../doc/app.${l}.js`)).default;
      if (doc?.sections?.length) return doc;
    } catch (e) { /* the next language */ }
  }
  return null;
}

export async function renderDoc(root) {
  if (!root) return null;
  const doc = await load();
  if (!doc) { root.textContent = "Chronoz"; return null; }
  document.title = doc.title;
  // the name's O in the control flag's orange, as everywhere it is written
  const title = esc(doc.title).replace("Ozimut", '<span class="brand-o">O</span>zimut');
  root.innerHTML = `<article class="chr-doc">
    <header class="chr-doc-head"><h1>${title}</h1><p class="lede">${esc(doc.lede)}</p></header>
    <nav class="chr-doc-toc" aria-label="${esc(doc.title)}"><ol>${doc.sections.map((s) => `<li><a href="#${esc(s.id)}">${esc(s.title)}</a></li>`).join("")}</ol></nav>
    ${doc.sections.map((s) => `<section class="chr-doc-sec" id="${esc(s.id)}"><h2>${esc(s.title)}</h2>${s.html}</section>`).join("")}
  </article>`;
  // a wide table scrolls within the page on a phone
  root.querySelectorAll(".chr-doc-sec table").forEach((t) => {
    const box = document.createElement("div");
    box.className = "chr-doc-table";
    t.replaceWith(box);
    box.append(t);
  });
  // a section named in the address (doc.html#hub) is shown once drawn
  const at = location.hash.slice(1);
  if (at) document.getElementById(at)?.scrollIntoView();
  return doc;
}
