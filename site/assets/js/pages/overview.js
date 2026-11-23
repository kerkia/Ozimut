// Home: the login page, for visitors who are not logged in (a logged-in visitor is sent to their
// own page by the router). A landscape where every specialité has its place — the forest and its
// runner, the old town of the sprint, the mountain bike trail, the ski slopes, a control flag —
// behind a short presentation and the login form: on wide screens a reel of the site's analyses (reel.js), on
// phones a few lines. The figures are in Réseau · Activité. Under it, the site in pictures (tour.js, 2026-10-19).

import { html, raw, $ } from "../util.js";
import { t } from "../i18n.js";
import * as auth from "../auth.js";
import { signedIn, SITE } from "../app.js";
import { reelHtml, mountReel } from "../reel.js";
import { tourHtml, mountTour } from "../tour.js";
import * as data from "../data.js";
import { inApp } from "../appbridge.js";

// The landscape, drawn once: colours come from CSS (.ls-*), so it has a day and a night version.
const tree = (x, y, h) => `<path d="M${x} ${y} l${h * 0.36} -${h} l${h * 0.36} ${h}Z"/>`;
const forest = (x0, y0, n, step, seed) => Array.from({ length: n }, (_, i) => {
  const h = 70 + ((i * 37 + seed) % 5) * 14, dy = ((i * 53 + seed) % 4) * 9;
  return tree(x0 + i * step, y0 + dy, h);
}).join("");
const LANDSCAPE = `<svg class="home-landscape" viewBox="0 0 1440 640" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">
  <rect class="ls-sky" width="1440" height="640"/>
  <circle class="ls-sun" cx="860" cy="96" r="52"/>
  <path class="ls-far" d="M0 330 L120 250 L210 290 L330 200 L450 280 L560 230 L690 300 L820 210 L930 270 L1060 190 L1190 260 L1310 215 L1440 270 V640 H0Z"/>
  <path class="ls-mount" d="M0 380 L150 270 L250 330 L400 210 L560 330 L700 250 L840 340 L1010 220 L1160 330 L1300 260 L1440 330 V640 H0Z"/>
  <path class="ls-snow" d="M400 210 L440 245 L422 243 L408 258 L392 244 L372 248Z M1010 220 L1052 256 L1032 254 L1016 270 L1000 255 L978 260Z M700 250 L728 274 L714 273 L703 283 L690 274 L676 278Z"/>
  <g class="ls-fig" transform="translate(1845 6) scale(-1 1)"><path d="M1046 300 l46 -24" stroke-width="4" class="ls-stroke"/><path d="M1058 304 l46 -24" stroke-width="4" class="ls-stroke"/>
    <circle cx="1072" cy="262" r="7"/><path d="M1068 270 l9 0 l2 16 l10 6 l-3 4 l-12 -6 l-8 10 l-4 -3 l6 -11Z"/></g>
  <path class="ls-hill" d="M0 430 C180 380 330 410 480 392 C640 372 760 410 920 388 C1080 366 1250 400 1440 378 V640 H0Z"/>
  <g class="ls-forest">${forest(10, 470, 9, 46, 1)}${forest(1010, 462, 10, 44, 3)}</g>
  <g class="ls-town" transform="translate(150 0)">
    <rect x="520" y="418" width="380" height="70"/>
    <path class="ls-wall" d="M500 488 V440 h20 v-10 h14 v10 h20 v-10 h14 v10 h20 v-10 h14 v10 h20 V488Z M820 488 V440 h20 v-10 h14 v10 h20 v-10 h14 v10 h20 V488Z"/>
    <rect x="600" y="360" width="34" height="128"/><path class="ls-roof" d="M594 360 l23 -62 l23 62Z"/>
    <rect x="662" y="396" width="64" height="92"/><path class="ls-roof" d="M656 396 l38 -28 l38 28Z"/>
    <rect x="744" y="384" width="46" height="104"/><path class="ls-roof" d="M738 384 l29 -24 l29 24Z"/>
    <rect x="806" y="404" width="56" height="84"/><path class="ls-roof" d="M800 404 l34 -22 l34 22Z"/>
    <g class="ls-window"><rect x="611" y="392" width="12" height="18" rx="6"/><rect x="680" y="420" width="10" height="14"/><rect x="700" y="420" width="10" height="14"/><rect x="760" y="410" width="10" height="14"/><rect x="822" y="428" width="10" height="14"/></g>
  </g>
  <path class="ls-front" d="M0 520 C200 486 380 500 560 488 C760 474 900 498 1080 484 C1240 472 1360 490 1440 482 V640 H0Z"/>
  <path class="ls-trail" d="M260 640 C380 590 560 566 760 556 C940 548 1100 560 1440 540" fill="none" stroke-width="16"/>
  <g class="ls-fig"><circle cx="452" cy="548" r="8"/><path d="M447 557 l10 0 l5 22 l12 12 l-4 4 l-13 -12 l-8 13 l-5 -3 l6 -16 l-9 6 l-3 -4 l12 -9Z"/></g>
  <g class="ls-fig"><g class="ls-stroke" fill="none" stroke-width="5"><circle cx="880" cy="566" r="17"/><circle cx="932" cy="566" r="17"/>
    <path d="M880 566 l22 -24 l30 24 M902 542 l12 -12 M896 542 h14"/></g><circle cx="906" cy="516" r="8"/><path d="M902 524 l10 0 l-2 16 l-8 2Z"/></g>
  <g><rect class="ls-pole" x="1210" y="500" width="4" height="70"/><path d="M1214 502 h44 v44 h-44Z" fill="#ffffff"/><path d="M1214 502 l44 44 h-44Z" fill="#eb6834"/></g>
  <g class="ls-forest">${forest(1270, 548, 4, 44, 2)}${forest(-6, 560, 3, 40, 4)}</g>
</svg>`;

/** The bar's links lead to a section of the page (#/?s=arena…, s=features), « Se connecter » to the form (s=login). */
// The section starts at the top of the window, under the bar (owner, 2026-10-30): a jump (a smooth scroll still running
// when the pictures above it settle lands elsewhere), put right again as they load unless the reader has scrolled since.
function goTo(s) {
  if (!s) return;
  const el = s === "login" ? document.querySelector(".home-login") : document.getElementById(`mod-${s}`);
  if (!el) return;
  const top = () => Math.max(0, el.getBoundingClientRect().top + window.scrollY - (document.querySelector(".topbar")?.offsetHeight || 0) - 12);
  let at = -1;
  const align = () => { window.scrollTo({ top: top(), behavior: "instant" }); at = window.scrollY; };
  align();
  for (const ms of [400, 1200, 2500]) setTimeout(() => { if (Math.abs(window.scrollY - at) < 2) align(); }, ms);
  if (s === "login") setTimeout(() => document.getElementById("acct-email")?.focus({ preventScroll: true }), 300);
}
// the bar's links to the sections (#/?s=…) and the page's own: handled here, so that a second click on the same one scrolls too
function onSectionLink(e) {
  if (e.target.closest?.(".brand-home, .brand-name") && /^#\/?(\?.*)?$/.test(location.hash || "#/")) {
    e.preventDefault();
    history.replaceState(null, "", "#/");
    window.scrollTo({ top: 0, behavior: "instant" });
    return;
  }
  const a = e.target.closest?.('a[href^="#/?s="]');
  if (!a) return;
  e.preventDefault();
  const s = new URLSearchParams(a.getAttribute("href").split("?")[1]).get("s");
  history.replaceState(null, "", a.getAttribute("href"));
  $("#nav")?.classList.remove("open");
  goTo(s);
}

export async function render(main, { query = {} } = {}) {
  // registration open to every orienteer (WORLD_OPEN): the tour's pledge about who sees the results follows it
  // the Ozimut app (docs/app/design.md): the sign-in card alone — no presentation, no account made there
  const app = !!inApp();
  let world = false;
  if (!app) try { world = !!(await (await fetch("api/account/status")).json()).world; } catch (e) { /* as before */ }
  main.innerHTML = html`
    <section class="home-hero">
      ${raw(LANDSCAPE)}
      <div class="home-inner">
        <div class="home-intro">
          <h1>${SITE}</h1>
          <p class="home-tag">${t("home.tag")}</p>
          ${app ? "" : raw(reelHtml())}
        </div>
        <div class="login-box home-login">
          <h2>${t("auth.title")}</h2>
          <form id="acct-form" class="stack" style="gap:12px;margin-top:10px" autocomplete="on">
            <label class="field"><span>${t("ac.email")}</span>
              <input type="email" id="acct-email" name="email" autocomplete="username" required></label>
            <label class="field"><span>${t("ac.password")}</span>
              <input type="password" id="acct-pw" name="password" autocomplete="current-password" required></label>
            <div class="notice" id="acct-error" hidden></div>
            <button class="btn btn-primary" type="submit" id="acct-btn">${t("ac.login")}</button>
            <p class="links">${app ? "" : html`<a href="#/compte/inscription">${t("ac.register")}</a>`}<a href="#/compte/mot-de-passe">${t("ac.forgot")}</a></p>
          </form>
          <div class="home-guest"><span class="muted">${t("home.guest.or")}</span>
            <button type="button" class="btn" data-guest-enter="">${t("hub.guest.enter")}</button>
            <span class="muted">${t("home.guest.hint")}</span></div>
        </div>
      </div>
    </section>
    ${app ? "" : raw(tourHtml(data.meta()?.counts, { world }))}`;

  if (!app) { mountReel(main); mountTour(main); }
  if (query.s) setTimeout(() => goTo(query.s), 50); else $("#acct-email").focus();
  const aform = $("#acct-form"), aerr = $("#acct-error"), abtn = $("#acct-btn");
  aform.addEventListener("submit", async (e) => {
    e.preventDefault();
    aerr.hidden = true;
    abtn.disabled = true;
    abtn.textContent = t("auth.checking");
    try {
      const s = await auth.accountLogin($("#acct-email").value.trim(), $("#acct-pw").value);
      await signedIn(s);
    } catch (x) {
      aerr.textContent = t(`ac.err.${x.code || "generic"}`);
      if (x.code === "unverified") aerr.insertAdjacentHTML("beforeend", ` <a href="#/compte/renvoyer">${t("ac.resend")}</a>`);
      aerr.hidden = false;
      abtn.disabled = false;
      abtn.textContent = t("ac.login");
    }
  });
  document.addEventListener("click", onSectionLink);
  return { title: t("ov.title"), onQuery: (q) => goTo(q.s), cleanup: () => document.removeEventListener("click", onSectionLink) };
}
