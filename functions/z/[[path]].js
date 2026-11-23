// /z/<channel>#<code>.<key>.<name> — an Ozitrac code (docs/track/ozitrac.md): the link or QR code a followed phone shows to
// the people who will follow it. Opened by Ozitrac (App Links, universal links) it never reaches here; in a browser this page
// says what it is and where to get the app. The part after « # » never leaves the browser: nothing of the channel is read.
import { LANGS } from "../_lib/api.js";

const TXT = {
  fr: { title: "Suivre quelqu'un avec Ozitrac", p: "Quelqu'un t'invite à le suivre en direct pendant sa course. Ouvre ce lien sur un téléphone où l'application Ozitrac est installée, ou scanne le code dans Ozitrac (« Je suis › Scanner un code »).", soon: "Ozitrac n'est pas encore dans les magasins d'applications : elle est en essai.", android: "Ozitrac pour Android", ios: "Ozitrac pour iPhone", what: "Ozitrac est une application gratuite de suivi GPS en direct, sans compte : la position n'est lisible que par les téléphones qui suivent." },
  en: { title: "Follow someone with Ozitrac", p: "Someone invites you to follow them live during their run. Open this link on a phone where the Ozitrac app is installed, or scan the code in Ozitrac (« Following › Scan a code »).", soon: "Ozitrac is not in the app stores yet: it is being tested.", android: "Ozitrac for Android", ios: "Ozitrac for iPhone", what: "Ozitrac is a free live GPS tracking app, with no account: only the phones that follow can read the position." },
  de: { title: "Jemandem mit Ozitrac folgen", p: "Jemand lädt dich ein, ihm während seines Laufs live zu folgen. Öffne diesen Link auf einem Telefon, auf dem die App Ozitrac installiert ist, oder scanne den Code in Ozitrac (« Ich folge › Einen Code scannen »).", soon: "Ozitrac ist noch nicht in den App-Stores: Die App wird getestet.", android: "Ozitrac für Android", ios: "Ozitrac für iPhone", what: "Ozitrac ist eine kostenlose App für die Live-GPS-Verfolgung, ohne Konto: Nur die folgenden Telefone können die Position lesen." },
  es: { title: "Seguir a alguien con Ozitrac", p: "Alguien te invita a seguirle en directo durante su carrera. Abre este enlace en un teléfono con la aplicación Ozitrac instalada, o escanea el código en Ozitrac (« Sigo a › Escanear un código »).", soon: "Ozitrac aún no está en las tiendas de aplicaciones: está en pruebas.", android: "Ozitrac para Android", ios: "Ozitrac para iPhone", what: "Ozitrac es una aplicación gratuita de seguimiento GPS en directo, sin cuenta: solo los teléfonos que siguen pueden leer la posición." },
};
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

function langOf(request) {
  const al = request.headers.get("Accept-Language") || "";
  for (const part of al.split(",")) { const l = part.trim().slice(0, 2).toLowerCase(); if (LANGS.includes(l)) return l; }
  return "en";
}

export async function onRequestGet({ request, env }) {
  const lang = langOf(request), T = TXT[lang];
  const android = env.OZITRAC_ANDROID_URL || "", ios = env.OZITRAC_IOS_URL || "";
  const stores = android || ios
    ? `${android ? `<a class="b" href="${esc(android)}">${esc(T.android)}</a>` : ""}${ios ? `<a class="b" href="${esc(ios)}">${esc(T.ios)}</a>` : ""}`
    : `<p class="n">${esc(T.soon)}</p>`;
  return new Response(`<!doctype html><html lang="${lang}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(T.title)}</title>
<style>body{margin:0;font-family:system-ui,Segoe UI,Arial,sans-serif;background:#f4f6f9;color:#1b2430}main{max-width:520px;margin:0 auto;padding:32px 18px}
h1{font-size:22px}.o{color:#e8641c}.n{background:#fff;border-radius:10px;padding:12px 16px}.w{color:#5b6573;font-size:14px}
a.b{display:block;margin:12px 0;background:#d4561a;color:#fff;text-decoration:none;padding:12px 16px;border-radius:8px;text-align:center}
@media (prefers-color-scheme:dark){body{background:#13171c;color:#e6e9ee}.n{background:#1f252d}.w{color:#9aa4b2}}</style>
</head><body><main><p style="font-weight:700;font-size:20px"><span class="o">O</span>zitrac</p><h1>${esc(T.title)}</h1>
<p>${esc(T.p)}</p>${stores}<p class="w">${esc(T.what)}</p></main></body></html>`,
  { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
}
