// /t/<code> — a pair code's address (docs/track/design.md): the QR code a parent shows. Opened by Ozitrac (App Links,
// Universal Links) it never reaches here; in a browser this page says what it is and where to get the app.
// /t/login#<token> — the app's web view signing in to its device's account (POST /api/track/session), then the site.
import { LANGS } from "../_lib/api.js";

const TXT = {
  fr: { title: "Associer un téléphone à Ozimut", p: "Ce code associe le téléphone qui le scanne à un compte Ozimut pour le suivi GPS. Ouvrez-le avec l'application Ozitrac : installez-la, puis, dans « Relier à Ozimut », scannez à nouveau le code ou tapez-le.", code: "Code", android: "Ozitrac pour Android", ios: "Ozitrac pour iPhone", site: "Aller sur Ozimut", wait: "Connexion…", fail: "Ce lien de connexion n'est plus valable. Rouvrez l'application." },
  en: { title: "Pair a phone with Ozimut", p: "This code pairs the phone that scans it with an Ozimut account for GPS tracking. Open it with the Ozitrac app: install it, then in « Link to Ozimut » scan the code again or type it.", code: "Code", android: "Ozitrac for Android", ios: "Ozitrac for iPhone", site: "Go to Ozimut", wait: "Signing in…", fail: "This sign-in link is no longer valid. Open the app again." },
  de: { title: "Ein Telefon mit Ozimut verbinden", p: "Dieser Code verbindet das Telefon, das ihn scannt, für die GPS-Verfolgung mit einem Ozimut-Konto. Öffne ihn mit der App Ozitrac: Installiere sie, scanne den Code dann unter « Mit Ozimut verbinden » noch einmal oder tippe ihn ein.", code: "Code", android: "Ozitrac für Android", ios: "Ozitrac für iPhone", site: "Zu Ozimut", wait: "Anmeldung…", fail: "Dieser Anmeldelink ist nicht mehr gültig. Öffne die App erneut." },
  es: { title: "Vincular un teléfono con Ozimut", p: "Este código vincula el teléfono que lo escanea con una cuenta de Ozimut para el seguimiento GPS. Ábrelo con la aplicación Ozitrac: instálala y, en « Vincular con Ozimut », vuelve a escanear el código o escríbelo.", code: "Código", android: "Ozitrac para Android", ios: "Ozitrac para iPhone", site: "Ir a Ozimut", wait: "Iniciando sesión…", fail: "Este enlace de inicio de sesión ya no es válido. Vuelve a abrir la aplicación." },
};
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const page = (lang, title, body) => new Response(`<!doctype html><html lang="${lang}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>body{margin:0;font-family:system-ui,Segoe UI,Arial,sans-serif;background:#f4f6f9;color:#1b2430}main{max-width:520px;margin:0 auto;padding:32px 18px}
h1{font-size:22px}.o{color:#e8641c}.code{font:600 28px ui-monospace,Consolas,monospace;letter-spacing:.12em;background:#fff;border-radius:10px;padding:12px 16px;display:inline-block}
a.b{display:block;margin:12px 0;background:#d4561a;color:#fff;text-decoration:none;padding:12px 16px;border-radius:8px;text-align:center}
a.s{color:#1b4f8a}@media (prefers-color-scheme:dark){body{background:#13171c;color:#e6e9ee}.code{background:#1f252d}a.s{color:#8fb8ea}}</style>
</head><body><main><p style="font-weight:700;font-size:20px"><span class="o">O</span>zimut</p>${body}</main></body></html>`,
  { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });

function langOf(request) {
  const al = request.headers.get("Accept-Language") || "";
  for (const part of al.split(",")) { const l = part.trim().slice(0, 2).toLowerCase(); if (LANGS.includes(l)) return l; }
  return "en";
}

export async function onRequestGet({ request, env, params }) {
  const lang = langOf(request), T = TXT[lang];
  const code = (Array.isArray(params.code) ? params.code.join("/") : params.code || "");
  if (code === "login") {
    return page(lang, T.wait, `<p id="m">${esc(T.wait)}</p><script>
(async () => { const tok = location.hash.slice(1); history.replaceState(null, "", "/t/login");
  try { const r = await fetch("/api/track/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: tok }) });
    const j = await r.json(); if (!r.ok) throw 0; location.replace("/" + (j.home || "#/")); }
  catch (e) { document.getElementById("m").textContent = ${JSON.stringify(T.fail)}; } })();
</script>`);
  }
  const shown = /^[A-Z0-9]{8}$/.test(code) ? code : "";
  const android = env.APP_ANDROID_URL || "", ios = env.APP_IOS_URL || "";
  return page(lang, T.title, `<h1>${esc(T.title)}</h1><p>${esc(T.p)}</p>
${shown ? `<p>${esc(T.code)} : <span class="code">${shown}</span></p>` : ""}
${android ? `<a class="b" href="${esc(android)}">${esc(T.android)}</a>` : ""}${ios ? `<a class="b" href="${esc(ios)}">${esc(T.ios)}</a>` : ""}
<p><a class="s" href="/">${esc(T.site)}</a></p>`);
}
