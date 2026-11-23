// What a ranking page shows when the site's country has none for this account (owner, 2026-10-20; by country since
// 2026-10-22): a country the site does not rank yet says so; France, whose data is for its members, says what joining it
// opens and leads to Réglages › Mes pays (the login gate refuses the data anyway: _middleware.js `needs`).

import { inApp } from "../appbridge.js";
import { html } from "../util.js";
import { t } from "../i18n.js";
import * as country from "../country.js";
import * as auth from "../auth.js";

export async function render(main) {
  if (!country.ranks()) {
    main.innerHTML = html`<section class="card account-card"><div class="card-head"><h1 style="font-size:20px;margin:0">${t("cty.none.title")}</h1></div>
      <div class="card-body stack" style="gap:12px">
        <p style="margin:0">${t("cty.none.text", { country: country.name(country.current()) })}</p>
        <p class="soft" style="margin:0">${t("cty.none.other")}</p>
      </div></section>`;
    return { title: t("cty.none.title") };
  }
  main.innerHTML = html`<section class="card account-card"><div class="card-head"><h1 style="font-size:20px;margin:0">${t("cty.need.title")}</h1></div>
    <div class="card-body stack" style="gap:12px">
      <p style="margin:0">${t("cty.need.text")}</p>
      ${inApp() ? (auth.session() ? "" : html`<p class="soft" style="margin:0">${t("cty.need.guest.app")}</p>`)     // (the app: no account made, the countries joined on the site)
        : auth.session() ? html`<p class="soft" style="margin:0">${t("cty.need.how")}</p>
      <div class="row" style="gap:8px;flex-wrap:wrap"><a class="btn btn-primary" href="#/reglages?onglet=pays">${t("cty.need.join")}</a></div>`
        // a visitor without an account (owner, 2026-10-30): an account that joins France opens the page
        : html`<p class="soft" style="margin:0">${t("cty.need.guest")}</p>
      <div class="row" style="gap:8px;flex-wrap:wrap"><a class="btn btn-primary" href="#/compte/inscription">${t("hub.register")}</a></div>`}
    </div></section>`;
  return { title: t("cty.need.title") };
}
