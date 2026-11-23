// The page a Traccar Client address shows when it is opened in a browser (2026-11-23, owner: the QR code scanned with the
// phone's camera opened « OK » and nothing else). The QR code is meant for Traccar Client's own scanner (its settings, the QR
// icon at the top), which reads a plain https address: the server address is its origin and path, its query the settings
// (traccar-client lib/configuration_service.dart: id, interval, distance, accuracy « highest » in lower case, buffer, wakelock,
// stop_detection). A browser lands here instead: a button opens the app with the same settings by its deep link
// (org.traccar.client://config?url=…, on Android as an intent: Chrome does not follow custom schemes from a page), the server
// address to copy, the stores. Four languages, by the browser's Accept-Language.

/** The settings Ozimut gives Traccar Client (also the QR code's query and the deep link's). */
export const TRACCAR_SETTINGS = { interval: 5, distance: 0, accuracy: "highest", buffer: "true", wakelock: "true", stop_detection: "false" };

const TX = {
  fr: {
    title: "Associer Traccar Client", lead: "Cette adresse sert à l'application Traccar Client, pas au navigateur.",
    open: "Ouvrir dans Traccar Client", openText: "Sur ce téléphone, si Traccar Client est installé : le bouton y ouvre ces réglages, confirmez-les.",
    scan: "Ou scannez le code depuis Traccar Client", scanText: "Dans Traccar Client, ouvrez les réglages et touchez l'icône de code QR en haut de l'écran, puis scannez le code affiché sur l'ordinateur. Pas l'appareil photo du téléphone : il ouvre cette page.",
    copy: "Ou copiez l'adresse du serveur", copyText: "Collez-la dans « URL du serveur », puis réglez la précision sur « la plus haute » (elle est « moyenne » par défaut) et l'intervalle sur 5 s.",
    copyBtn: "Copier", copied: "Copié", get: "Installer Traccar Client", play: "Google Play", apple: "App Store",
  },
  en: {
    title: "Pair Traccar Client", lead: "This address is for the Traccar Client app, not for the browser.",
    open: "Open in Traccar Client", openText: "On this phone, if Traccar Client is installed: the button opens these settings there; confirm them.",
    scan: "Or scan the code from Traccar Client", scanText: "In Traccar Client, open the settings and tap the QR code icon at the top of the screen, then scan the code shown on the computer. Not the phone's camera: it opens this page.",
    copy: "Or copy the server address", copyText: "Paste it into « Server URL », then set the accuracy to « highest » (it is « medium » by default) and the interval to 5 s.",
    copyBtn: "Copy", copied: "Copied", get: "Install Traccar Client", play: "Google Play", apple: "App Store",
  },
  de: {
    title: "Traccar Client verbinden", lead: "Diese Adresse ist für die App Traccar Client, nicht für den Browser.",
    open: "In Traccar Client öffnen", openText: "Auf diesem Telefon, wenn Traccar Client installiert ist: Der Knopf öffnet dort diese Einstellungen; bestätige sie.",
    scan: "Oder scanne den Code in Traccar Client", scanText: "Öffne in Traccar Client die Einstellungen und tippe oben auf das QR-Code-Symbol, dann scanne den Code auf dem Computer. Nicht mit der Kamera des Telefons: Sie öffnet diese Seite.",
    copy: "Oder kopiere die Serveradresse", copyText: "Füge sie in « Server-URL » ein und stelle dann die Genauigkeit auf « höchste » (Standard ist « mittel ») und das Intervall auf 5 s.",
    copyBtn: "Kopieren", copied: "Kopiert", get: "Traccar Client installieren", play: "Google Play", apple: "App Store",
  },
  es: {
    title: "Vincular Traccar Client", lead: "Esta dirección es para la aplicación Traccar Client, no para el navegador.",
    open: "Abrir en Traccar Client", openText: "En este teléfono, si Traccar Client está instalado: el botón abre allí estos ajustes; confírmalos.",
    scan: "O escanea el código desde Traccar Client", scanText: "En Traccar Client, abre los ajustes y toca el icono de código QR arriba de la pantalla, luego escanea el código que muestra el ordenador. No con la cámara del teléfono: abre esta página.",
    copy: "O copia la dirección del servidor", copyText: "Pégala en « URL del servidor » y pon la precisión en « la más alta » (por defecto es « media ») y el intervalo en 5 s.",
    copyBtn: "Copiar", copied: "Copiado", get: "Instalar Traccar Client", play: "Google Play", apple: "App Store",
  },
};

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const langOf = (h) => { for (const p of String(h || "").toLowerCase().split(",")) { const l = p.trim().slice(0, 2); if (TX[l]) return l; } return "en"; };

/** Traccar Client's deep link for a server address and device id (Android: as an intent, which Chrome follows). */
export function traccarLink(server, id, android = false) {
  const q = new URLSearchParams({ url: server, id, ...Object.fromEntries(Object.entries(TRACCAR_SETTINGS).map(([k, v]) => [k, String(v)])) }).toString();
  return android ? `intent://config?${q}#Intent;scheme=org.traccar.client;package=org.traccar.client;end` : `org.traccar.client://config?${q}`;
}

/** The page for a browser that opened a Traccar Client address. */
export function traccarPage(request, server, id) {
  const T = TX[langOf(request.headers.get("Accept-Language"))];
  const android = /android/i.test(request.headers.get("User-Agent") || "");
  const body = `<!doctype html><html lang="${Object.keys(TX).find((k) => TX[k] === T)}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Ozimut · ${esc(T.title)}</title>
<style>:root{color-scheme:light dark;--bg:#fbfaf7;--ink:#1b1a17;--dim:#5d5a52;--line:#d9d5cb;--flag:#e8641c}
@media(prefers-color-scheme:dark){:root{--bg:#16181a;--ink:#f4f2ec;--dim:#a9a59b;--line:#3a3d40}}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.5 system-ui,sans-serif}main{max-width:34rem;margin:0 auto;padding:20px 16px 40px}
h1{font-size:1.35rem;margin:.2em 0 .3em}h2{font-size:1.05rem;margin:1.4em 0 .2em}p{margin:.3em 0}.dim{color:var(--dim)}
.btn{display:inline-block;padding:.65em 1.1em;border-radius:8px;border:1px solid var(--line);color:var(--ink);text-decoration:none;background:transparent;font:inherit;cursor:pointer}
.go{background:var(--flag);border-color:var(--flag);color:#fff;font-weight:600}.row{display:flex;gap:8px;margin-top:.5em}
input{flex:1;min-width:0;font:inherit;font-size:14px;padding:.55em;border:1px solid var(--line);border-radius:8px;background:transparent;color:var(--ink)}
.brand{font-weight:700;letter-spacing:.01em}.brand b{color:var(--flag)}</style></head><body><main>
<p class="brand"><b>O</b>zimut</p><h1>${esc(T.title)}</h1><p class="dim">${esc(T.lead)}</p>
<h2>${esc(T.open)}</h2><p class="dim">${esc(T.openText)}</p>
<p><a class="btn go" href="${esc(traccarLink(server, id, android))}">${esc(T.open)}</a></p>
<h2>${esc(T.scan)}</h2><p class="dim">${esc(T.scanText)}</p>
<h2>${esc(T.copy)}</h2><p class="dim">${esc(T.copyText)}</p>
<div class="row"><input id="u" readonly value="${esc(server)}"><button class="btn" id="c" type="button">${esc(T.copyBtn)}</button></div>
<h2>${esc(T.get)}</h2><p class="row"><a class="btn" href="https://play.google.com/store/apps/details?id=org.traccar.client">${esc(T.play)}</a>
<a class="btn" href="https://apps.apple.com/app/traccar-client/id843156974">${esc(T.apple)}</a></p>
</main><script>document.getElementById("c").onclick=async function(){var i=document.getElementById("u");try{await navigator.clipboard.writeText(i.value)}catch(e){i.select();document.execCommand("copy")}this.textContent=${JSON.stringify(T.copied)}}</script></body></html>`;
  return new Response(body, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'" } });
}
