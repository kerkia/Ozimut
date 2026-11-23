// The Ozimut app's pre-release crawl (docs/app/design.md « The purchase gate »): every page opened as the app's web view
// opens it — its user agent, a phone's screen — signed out, as a visitor without an account and, when an account is given,
// signed in, in the four languages; it fails when a page shows a price, a selling word, a way to create an account, the
// settings the app must not have, or « IA ».
//   cd tools/app && npm install            (puppeteer-core; a Chrome or Edge on the machine)
//   node tools/app/crawl.mjs --base http://localhost:8757 [--email a@b --password …] [--langs fr,en] [--browser <path>] [--shots <folder>]
// From PowerShell on the PC (the Bash sandbox blocks the browser). Exit code 1 when something was found.
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import puppeteer from "puppeteer-core";

const arg = (k, d = null) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const BASE = (arg("base", "http://localhost:8757")).replace(/\/$/, "");
const LANGS = arg("langs", "fr,en,de,es").split(",");
const EMAIL = arg("email"), PASSWORD = arg("password"), SHOTS = arg("shots");
const BROWSER = arg("browser") || ["C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"].find(existsSync);
const UA = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36 OzimutApp/1.0 (android)";

// the pages of each state (addresses that need a race, an event or an id are left to the tests of their own tools)
const OUT = ["#/", "#/?s=features", "#/compte/inscription", "#/compte/mot-de-passe", "#/compte/confidentialite", "#/reglages", "#/ia"];
const GUEST = ["#/modules", "#/agenda", "#/stats", "#/classement", "#/coach", "#/analyses", "#/analyse-solo", "#/apprendre", "#/jeux", "#/vma",
  "#/documentation", "#/documentation?module=stats", "#/contact", "#/compte/inscription", "#/compte/confidentialite", "#/ia", "#/reglages", "#/orga", "#/carto"];
const USER = [...GUEST, "#/coureur", "#/mes-cartes", "#/pixel", "#/mes-inscriptions", "#/monclub", "#/categories", "#/clubs", "#/reseau"];

// what must never be seen (the shown text, lower-cased): prices and selling words in the four languages
const SELL = /\d\s?€|€\s?\d|\btarifs\b|gratuit aujourd|devenir payant|\babonnement\b|s'abonner|\bpricing\b|free today|become paid|\bsubscribe\b|\bsubscription\b|\bupgrade\b|\bpreise\b|heute kostenlos|kostenpflichtig|\babonnieren\b|\bprecios\b|gratis hoy|(ser|funciones) de pago\b|suscripci/;
// (race entry fees and the clubs' accounts are real-world payments between people and clubs: their pages may show amounts)
const MONEY_OK = /^#\/(mes-inscriptions|monclub|inscription)/;
const REGISTER = /créer un compte|créez un compte|create an account|konto erstellen|erstelle ein konto|crear una cuenta|crea una cuenta/;
// (the documentation and the rules describe the website, accounts included: their words are not ways in; links still count)
const DESCRIBES = /^#\/(documentation|compte\/confidentialite)/;
const WEB_ONLY = /supprimer mon compte|delete my account|konto löschen|eliminar mi cuenta|changer de mot de passe|mes pays|my countries/;

const found = [];
const browser = await puppeteer.launch({ executablePath: BROWSER, headless: "new", args: ["--no-sandbox"] });
async function visit(page, state, lang, hash) {
  await page.goto(`${BASE}/?lang=${lang}${hash}`, { waitUntil: "domcontentloaded" });
  await page.evaluate((h) => { if (location.hash !== h) location.hash = h; }, hash);
  await new Promise((r) => setTimeout(r, 1800));
  const seen = await page.evaluate(() => ({ text: document.body.innerText.toLowerCase(), hash: location.hash, inApp: document.documentElement.classList.contains("in-app"),
    reg: [...document.querySelectorAll('a[href*="compte/inscription"]')].filter((a) => a.offsetParent).length,
    ia: [...document.querySelectorAll('a[href="#/ia"]')].filter((a) => a.offsetParent).length }));
  const bad = (what) => found.push(`${lang} · ${state} · ${hash} (shown: ${seen.hash}): ${what}`);
  if (!seen.inApp) bad("the page does not know it is in the app");
  const sell = SELL.exec(seen.text);
  if (sell && !MONEY_OK.test(hash)) bad(`a selling word or a price: « ${seen.text.slice(Math.max(0, sell.index - 40), sell.index + 50).replace(/\s+/g, " ")} »`);
  if (seen.reg || (REGISTER.test(seen.text) && !DESCRIBES.test(hash))) bad("a way to create an account");
  if (seen.ia) bad("a link to « IA »");
  if (/^#\/ia/.test(seen.hash)) bad("« IA » opened");
  if (/^#\/compte\/inscription/.test(seen.hash)) bad("the registration page opened");
  if (WEB_ONLY.test(seen.text) && !DESCRIBES.test(hash)) bad("a setting the app must not have (password, countries, deletion)");
  if (SHOTS) { mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: join(SHOTS, `${lang}-${state}-${hash.replace(/[^a-z0-9]+/gi, "_")}.png`) }); }
}
for (const lang of LANGS) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setUserAgent(UA);
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  for (const h of OUT) await visit(page, "signed out", lang, h);
  // a visitor without an account
  await page.goto(`${BASE}/?lang=${lang}#/`, { waitUntil: "domcontentloaded" });
  await new Promise((r) => setTimeout(r, 1500));
  const entered = await page.evaluate(() => { const b = document.querySelector("[data-guest-enter]"); if (b) b.click(); return !!b; });
  await new Promise((r) => setTimeout(r, 3000));
  if (!entered) found.push(`${lang} · signed out: no « Entrer sans compte » on the sign-in screen`);
  else for (const h of GUEST) await visit(page, "visitor", lang, h);
  await ctx.close();
  if (EMAIL && PASSWORD) {
    const c2 = await browser.createBrowserContext();
    const p2 = await c2.newPage();
    await p2.setUserAgent(UA);
    await p2.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await p2.goto(`${BASE}/?lang=${lang}#/`, { waitUntil: "domcontentloaded" });
    await p2.waitForSelector("#acct-email", { timeout: 15000 });
    await p2.type("#acct-email", EMAIL);
    await p2.type("#acct-pw", PASSWORD);
    await p2.click("#acct-btn");
    await new Promise((r) => setTimeout(r, 4000));
    for (const h of USER) await visit(p2, "account", lang, h);
    await c2.close();
  }
}
await browser.close();
if (found.length) {
  console.log(`The app's crawl: ${found.length} thing(s) the app must not show`);
  for (const f of found) console.log(`  ${f}`);
  process.exit(1);
}
console.log(`The app's crawl: nothing about buying, no account making, no web-only setting (${LANGS.join(", ")}${EMAIL ? ", with an account" : ", without an account"}).`);
