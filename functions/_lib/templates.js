// The e-mails the site sends, in the recipient's language (users.lang: "fr", the reference, "en" (2026-10-17), "de" or "es"
// (2026-11-01: German « du », Spanish « tú », docs/i18n/glossary.de-es.md); anything else is French).
// Each returns { subject, html, text }. The FFCO's own data (race names, places, regions, officials) stays as published.

import { siteUrl } from "./api.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const LANGS = ["fr", "en", "de", "es"];
const L = (lang) => (LANGS.includes(lang) ? lang : "fr");
const LOCALES = { fr: "fr-FR", en: "en-GB", de: "de-DE", es: "es-ES" };
const locale = (lang) => LOCALES[L(lang)];
/** The recipient's language's entry of { fr, en, de, es }. */
const pick = (lang, o) => o[L(lang)];
/** « Bonjour Anne, » — Spanish writes « Hola, Ana: »; German goes on in lower case after « Hallo Anna, ». */
const GREET = { fr: (n) => `Bonjour ${n},`, en: (n) => `Hello ${n},`, de: (n) => `Hallo ${n},`, es: (n) => `Hola, ${n}:` };
const greet = (lang, name) => GREET[L(lang)](name);

const FRAME = {
  fr: { tagline: "La course d'orientation, en cartes et en chiffres",
    foot: (from) => `Site indépendant, sans lien avec aucune fédération. Message envoyé automatiquement ; contactez ${from} pour toute question ou tout retour.`,
    copy: "Si le bouton ne fonctionne pas, copiez ce lien :" },
  en: { tagline: "Orienteering, in maps and numbers",
    foot: (from) => `An independent site, not affiliated with any federation. Automatic message; contact ${from} with any question or feedback.`,
    copy: "If the button doesn't work, copy this link:" },
  de: { tagline: "Orientierungslauf, in Karten und Zahlen",
    foot: (from) => `Eine unabhängige Website, ohne Verbindung zu einem Verband. Automatisch versandte Nachricht; schreib an ${from} bei Fragen oder Rückmeldungen.`,
    copy: "Falls der Button nicht funktioniert, kopiere diesen Link:" },
  es: { tagline: "La orientación, en mapas y en cifras",
    foot: (from) => `Sitio independiente, sin relación con ninguna federación. Mensaje enviado automáticamente; escribe a ${from} para cualquier pregunta o comentario.`,
    copy: "Si el botón no funciona, copia este enlace:" },
};
function wrap(env, title, bodyHtml, lang) {
  const F = FRAME[L(lang)];
  return `<!doctype html><html lang="${L(lang)}"><body style="margin:0;background:#f4f6f9;font-family:system-ui,Segoe UI,Arial,sans-serif;color:#1b2430">
<div style="max-width:560px;margin:0 auto;padding:24px 16px">
<div style="font-weight:700;font-size:20px;color:#1b1a17;margin-bottom:12px"><img src="${siteUrl(env)}/assets/mail-mark.png" width="28" height="28" alt="" style="vertical-align:-6px;margin-right:8px;border:0"><span style="color:#e8641c">O</span>zimut <span style="font-weight:500;font-size:13px;color:#5b6675">${F.tagline}</span></div>
<div style="background:#fff;border-radius:10px;padding:22px 24px;line-height:1.5">
<h1 style="font-size:18px;margin:0 0 12px">${esc(title)}</h1>${bodyHtml}</div>
<p style="font-size:12px;color:#5b6675;margin:14px 4px">${esc(F.foot(env.REPLY_TO || env.MAIL_FROM))}</p>
</div></body></html>`;
}
const button = (href, label, lang) => `<p style="margin:18px 0"><a href="${esc(href)}" style="background:#d4561a;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;display:inline-block">${esc(label)}</a></p>
<p style="font-size:12px;color:#5b6675;word-break:break-all">${FRAME[L(lang)].copy} ${esc(href)}</p>`;

export function verifyMail(env, token, firstName, lang) {
  const url = `${siteUrl(env)}/#/compte/verifier?token=${encodeURIComponent(token)}`;
  if (L(lang) === "en") return {
    subject: "Confirm your email address — Ozimut",
    html: wrap(env, "Confirm your email address", `<p>Hello ${esc(firstName)},</p>
<p>Thank you for registering. Click below to confirm your email address and activate your account (link valid for 24 hours).</p>${button(url, "Confirm my address", lang)}
<p style="font-size:13px;color:#5b6675">If you didn't register, ignore this message: nothing will be activated.</p>`, lang),
    text: `Hello ${firstName},\n\nConfirm your email address to activate your Ozimut account (link valid for 24 hours):\n${url}\n\nIf you didn't register, ignore this message.`,
  };
  if (L(lang) === "de") return {
    subject: "Bestätige deine E-Mail-Adresse — Ozimut",
    html: wrap(env, "Bestätige deine E-Mail-Adresse", `<p>${esc(greet(lang, firstName))}</p>
<p>danke für deine Registrierung. Klicke unten, um deine E-Mail-Adresse zu bestätigen und dein Konto zu aktivieren (der Link ist 24 Stunden gültig).</p>${button(url, "Adresse bestätigen", lang)}
<p style="font-size:13px;color:#5b6675">Falls du dich nicht registriert hast, ignoriere diese Nachricht: Es wird nichts aktiviert.</p>`, lang),
    text: `${greet(lang, firstName)}\n\nbestätige deine E-Mail-Adresse, um dein Ozimut-Konto zu aktivieren (der Link ist 24 Stunden gültig):\n${url}\n\nFalls du dich nicht registriert hast, ignoriere diese Nachricht.`,
  };
  if (L(lang) === "es") return {
    subject: "Confirma tu dirección de correo electrónico — Ozimut",
    html: wrap(env, "Confirma tu dirección de correo electrónico", `<p>${esc(greet(lang, firstName))}</p>
<p>Gracias por registrarte. Haz clic abajo para confirmar tu dirección de correo electrónico y activar tu cuenta (enlace válido durante 24 horas).</p>${button(url, "Confirmar mi dirección", lang)}
<p style="font-size:13px;color:#5b6675">Si no te has registrado, ignora este mensaje: no se activará nada.</p>`, lang),
    text: `${greet(lang, firstName)}\n\nConfirma tu dirección de correo electrónico para activar tu cuenta de Ozimut (enlace válido durante 24 horas):\n${url}\n\nSi no te has registrado, ignora este mensaje.`,
  };
  return {
    subject: "Confirmez votre adresse e-mail — Ozimut",
    html: wrap(env, "Confirmez votre adresse e-mail", `<p>Bonjour ${esc(firstName)},</p>
<p>Merci de votre inscription. Cliquez ci-dessous pour confirmer votre adresse e-mail et activer votre compte (lien valable 24 heures).</p>${button(url, "Confirmer mon adresse", lang)}
<p style="font-size:13px;color:#5b6675">Si vous n'êtes pas à l'origine de cette inscription, ignorez ce message : rien ne sera activé.</p>`, lang),
    text: `Bonjour ${firstName},\n\nConfirmez votre adresse e-mail pour activer votre compte Ozimut (lien valable 24 h) :\n${url}\n\nSi vous n'êtes pas à l'origine de cette inscription, ignorez ce message.`,
  };
}

export function resetMail(env, token, lang) {
  const url = `${siteUrl(env)}/#/compte/reinitialiser?token=${encodeURIComponent(token)}`;
  if (L(lang) === "en") return {
    subject: "Resetting your password — Ozimut",
    html: wrap(env, "Reset your password", `<p>A password reset was requested for this account. The link below is valid for 1 hour.</p>${button(url, "Choose a new password", lang)}
<p style="font-size:13px;color:#5b6675">If you didn't ask for anything, ignore this message: your password stays unchanged.</p>`, lang),
    text: `A password reset was requested for your Ozimut account. Link valid for 1 hour:\n${url}\n\nIf you didn't ask for anything, ignore this message.`,
  };
  if (L(lang) === "de") return {
    subject: "Passwort zurücksetzen — Ozimut",
    html: wrap(env, "Setze dein Passwort zurück", `<p>Für dieses Konto wurde das Zurücksetzen des Passworts angefordert. Der Link unten ist 1 Stunde gültig.</p>${button(url, "Neues Passwort wählen", lang)}
<p style="font-size:13px;color:#5b6675">Falls du nichts angefordert hast, ignoriere diese Nachricht: Dein Passwort bleibt unverändert.</p>`, lang),
    text: `Für dein Ozimut-Konto wurde das Zurücksetzen des Passworts angefordert. Der Link ist 1 Stunde gültig:\n${url}\n\nFalls du nichts angefordert hast, ignoriere diese Nachricht.`,
  };
  if (L(lang) === "es") return {
    subject: "Restablecimiento de tu contraseña — Ozimut",
    html: wrap(env, "Restablece tu contraseña", `<p>Se ha solicitado restablecer la contraseña de esta cuenta. El enlace de abajo es válido durante 1 hora.</p>${button(url, "Elegir una nueva contraseña", lang)}
<p style="font-size:13px;color:#5b6675">Si no has pedido nada, ignora este mensaje: tu contraseña no cambia.</p>`, lang),
    text: `Se ha solicitado restablecer la contraseña de tu cuenta de Ozimut. Enlace válido durante 1 hora:\n${url}\n\nSi no has pedido nada, ignora este mensaje.`,
  };
  return {
    subject: "Réinitialisation de votre mot de passe — Ozimut",
    html: wrap(env, "Réinitialiser votre mot de passe", `<p>Une réinitialisation de mot de passe a été demandée pour ce compte. Le lien ci-dessous est valable 1 heure.</p>${button(url, "Choisir un nouveau mot de passe", lang)}
<p style="font-size:13px;color:#5b6675">Si vous n'avez rien demandé, ignorez ce message : votre mot de passe reste inchangé.</p>`, lang),
    text: `Une réinitialisation de mot de passe a été demandée pour votre compte Ozimut. Lien valable 1 heure :\n${url}\n\nSi vous n'avez rien demandé, ignorez ce message.`,
  };
}

/**
 * To an administrator who asked for it (in their language): an account was just confirmed. total: confirmed accounts now;
 * countries: its memberships as "FR O'BUGEY" (migration 0014).
 */
export function newUserMail(env, user, total, lang, countries = []) {
  const url = `${siteUrl(env)}/#/admin`;
  const who = `${user.first_name} ${user.last_name}`;
  const day = String(user.created_at).slice(0, 10);
  if (L(lang) === "en") {
    const lines = [`Email: ${user.email}`, ...(user.licence ? [`Licence: ${user.licence} (${user.display_name})`] : []),
      `Countries: ${countries.join(", ") || "none"}`, `Registered on: ${day}`, `Confirmed accounts: ${total}`];
    return {
      subject: `New account: ${who} — Ozimut`,
      html: wrap(env, `New account: ${who}`, `<p>A new account has just been confirmed.</p>
<ul>${lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>${button(url, "Open the admin page", lang)}
<p style="font-size:13px;color:#5b6675">You receive this message because the new sign-ups alert is on, on the admin page.</p>`, lang),
      text: `A new account has just been confirmed: ${who}
${lines.join("\n")}

Administration (to turn this alert off): ${url}`,
    };
  }
  if (L(lang) === "de") {
    const lines = [`E-Mail: ${user.email}`, ...(user.licence ? [`Lizenz: ${user.licence} (${user.display_name})`] : []),
      `Länder: ${countries.join(", ") || "keine"}`, `Registriert am: ${day}`, `Bestätigte Konten: ${total}`];
    return {
      subject: `Neues Konto: ${who} — Ozimut`,
      html: wrap(env, `Neues Konto: ${who}`, `<p>Soeben wurde ein neues Konto bestätigt.</p>
<ul>${lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>${button(url, "Administrationsseite öffnen", lang)}
<p style="font-size:13px;color:#5b6675">Du erhältst diese Nachricht, weil die Benachrichtigung über neue Registrierungen auf der Administrationsseite eingeschaltet ist.</p>`, lang),
      text: `Soeben wurde ein neues Konto bestätigt: ${who}
${lines.join("\n")}

Administration (um diese Benachrichtigung auszuschalten): ${url}`,
    };
  }
  if (L(lang) === "es") {
    const lines = [`Correo electrónico: ${user.email}`, ...(user.licence ? [`Licencia: ${user.licence} (${user.display_name})`] : []),
      `Países: ${countries.join(", ") || "ninguno"}`, `Registrado el: ${day}`, `Cuentas confirmadas: ${total}`];
    return {
      subject: `Nueva cuenta: ${who} — Ozimut`,
      html: wrap(env, `Nueva cuenta: ${who}`, `<p>Se acaba de confirmar una nueva cuenta.</p>
<ul>${lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>${button(url, "Abrir la página de administración", lang)}
<p style="font-size:13px;color:#5b6675">Recibes este mensaje porque la alerta de nuevos registros está activada en la página de administración.</p>`, lang),
      text: `Se acaba de confirmar una nueva cuenta: ${who}
${lines.join("\n")}

Administración (para desactivar esta alerta): ${url}`,
    };
  }
  const lines = [`E-mail : ${user.email}`, ...(user.licence ? [`Licence : ${user.licence} (${user.display_name})`] : []),
    `Pays : ${countries.join(", ") || "aucun"}`, `Inscrit le : ${day}`, `Comptes confirmés : ${total}`];
  return {
    subject: `Nouveau compte : ${who} — Ozimut`,
    html: wrap(env, `Nouveau compte : ${who}`, `<p>Un nouveau compte vient d'être confirmé.</p>
<ul>${lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>${button(url, "Ouvrir la page d'administration", lang)}
<p style="font-size:13px;color:#5b6675">Vous recevez ce message parce que l'alerte des nouvelles inscriptions est activée sur la page d'administration.</p>`, lang),
    text: `Un nouveau compte vient d'être confirmé : ${who}
${lines.join("\n")}

Administration (pour désactiver cette alerte) : ${url}`,
  };
}

/** To the administrators (each in their language): an organiser uploaded a results file on « Résultats » (or, kind
 *  "courses", the course setter's circuits from « Orga › Tracer »). */
export function uploadMail(env, user, up, lang) {
  const url = `${siteUrl(env)}/#/admin?onglet=depots`;
  const courses = up.kind === "courses", starts = up.kind === "startlist";
  const kb = Math.max(1, Math.round(up.size / 1024));
  if (L(lang) === "en") {
    const lines = [`Race: ${up.race}`, `File: ${up.filename} (${kb} KB)`,
      `Uploaded by: ${user.first_name} ${user.last_name} — ${user.email} — licence ${user.licence}`];
    const head = courses ? "Courses uploaded" : starts ? "Start list uploaded" : "Results uploaded";
    const intro = courses ? "The courses of a race (the course setter's IOF XML file) have just been uploaded to “Results”."
      : starts ? "An organiser has just uploaded the start list of a coming race (“Orga › Start times”)."
      : "A results file has just been uploaded to “Results”.";
    const when = courses ? "They complete the race's results lists (length, climb, controls), once the race is over."
      : "It is published at the next collection run.";
    return {
      subject: `${head}: ${up.race} — Ozimut`,
      html: wrap(env, head, `<p>${intro} ${when}</p>
<ul>${lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>${button(url, "See the uploads", lang)}`, lang),
      text: `${intro}
${lines.join("\n")}

The uploads (to remove one): ${url}`,
    };
  }
  if (L(lang) === "de") {
    const lines = [`Lauf: ${up.race}`, `Datei: ${up.filename} (${kb} KB)`,
      `Hochgeladen von: ${user.first_name} ${user.last_name} — ${user.email} — Lizenz ${user.licence}`];
    const head = courses ? "Bahnen hochgeladen" : starts ? "Startliste hochgeladen" : "Ergebnisse hochgeladen";
    const intro = courses ? "Soeben wurden die Bahnen eines Laufs (die IOF-XML-Datei des Bahnlegers) in „Ergebnisse“ hochgeladen."
      : starts ? "Ein Veranstalter hat soeben die Startliste eines kommenden Laufs hochgeladen („Orga › Startzeiten“)."
      : "Soeben wurde eine Ergebnisdatei in „Ergebnisse“ hochgeladen.";
    const when = courses ? "Sie ergänzen die Ergebnislisten des Laufs (Länge, Steigung, Posten), sobald der Lauf vorbei ist."
      : "Sie wird beim nächsten Datenabruf veröffentlicht.";
    return {
      subject: `${head}: ${up.race} — Ozimut`,
      html: wrap(env, head, `<p>${intro} ${when}</p>
<ul>${lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>${button(url, "Uploads ansehen", lang)}`, lang),
      text: `${intro}
${lines.join("\n")}

Die Uploads (um einen zu entfernen): ${url}`,
    };
  }
  if (L(lang) === "es") {
    const lines = [`Carrera: ${up.race}`, `Archivo: ${up.filename} (${kb} KB)`,
      `Subido por: ${user.first_name} ${user.last_name} — ${user.email} — licencia ${user.licence}`];
    const head = courses ? "Recorridos subidos" : starts ? "Lista de salida subida" : "Resultados subidos";
    const intro = courses ? "Se acaban de subir a «Resultados» los recorridos de una carrera (el archivo IOF XML del trazador)."
      : starts ? "Un organizador acaba de subir la lista de salida de una próxima carrera («Orga › Horarios»)."
      : "Se acaba de subir un archivo de resultados a «Resultados».";
    const when = courses ? "Completan las listas de resultados de la carrera (longitud, desnivel, controles) una vez pasada la carrera."
      : "Se publicará en la próxima recogida de datos.";
    return {
      subject: `${head}: ${up.race} — Ozimut`,
      html: wrap(env, head, `<p>${intro} ${when}</p>
<ul>${lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>${button(url, "Ver los archivos subidos", lang)}`, lang),
      text: `${intro}
${lines.join("\n")}

Los archivos subidos (para retirar uno): ${url}`,
    };
  }
  const lines = [`Course : ${up.race}`, `Fichier : ${up.filename} (${kb} Ko)`,
    `Déposé par : ${user.first_name} ${user.last_name} — ${user.email} — licence ${user.licence}`];
  const head = courses ? "Circuits déposés" : starts ? "Horaires de départ déposés" : "Résultats déposés";
  const intro = courses ? "Les circuits d'une course (fichier IOF XML du traceur) viennent d'être déposés sur « Résultats »."
    : starts ? "Un organisateur vient de déposer les horaires de départ d'une course à venir (« Orga › Horaires »)."
    : "Un fichier de résultats vient d'être déposé sur « Résultats ».";
  const when = courses ? "Ils complètent les listes de résultats de la course (longueur, dénivelé, postes), une fois la course passée."
    : "Il est publié au prochain passage de la collecte.";
  return {
    subject: `${head} : ${up.race} — Ozimut`,
    html: wrap(env, head, `<p>${intro} ${when}</p>
<ul>${lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>${button(url, "Voir les dépôts", lang)}`, lang),
    text: `${intro}
${lines.join("\n")}

Les dépôts (pour en retirer un) : ${url}`,
  };
}

/** To the administrator (in their language): several verified accounts claim the same licence. */
export function duplicateAlert(env, licence, accounts, lang) {
  const url = `${siteUrl(env)}/#/admin`;
  const D = pick(lang, { fr: { on: "inscrit le", off: " (désactivé)" }, en: { on: "registered on", off: " (disabled)" },
    de: { on: "registriert am", off: " (deaktiviert)" }, es: { on: "registrada el", off: " (desactivada)" } });
  const lines = accounts.map((a) => `${a.email} — ${a.first_name} ${a.last_name} — ${D.on} ${String(a.created_at).slice(0, 10)}${a.status === "disabled" ? D.off : ""}`);
  if (L(lang) === "de") return {
    subject: `Lizenz ${licence}: ${accounts.length} Konten — Ozimut`,
    html: wrap(env, `Lizenz ${licence}: ${accounts.length} Konten`, `<p>Mehrere bestätigte Konten gehören zur selben FFCO-Lizenz:</p>
<ul>${lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>${button(url, "Administrationsseite öffnen", lang)}`, lang),
    text: `Mehrere bestätigte Konten für die Lizenz ${licence}:\n${lines.join("\n")}\n\nAdministration: ${url}`,
  };
  if (L(lang) === "es") return {
    subject: `Licencia ${licence}: ${accounts.length} cuentas — Ozimut`,
    html: wrap(env, `Licencia ${licence}: ${accounts.length} cuentas`, `<p>Varias cuentas confirmadas corresponden a la misma licencia FFCO:</p>
<ul>${lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>${button(url, "Abrir la página de administración", lang)}`, lang),
    text: `Varias cuentas confirmadas para la licencia ${licence}:\n${lines.join("\n")}\n\nAdministración: ${url}`,
  };
  if (L(lang) === "en") return {
    subject: `Licence ${licence}: ${accounts.length} accounts — Ozimut`,
    html: wrap(env, `Licence ${licence}: ${accounts.length} accounts`, `<p>Several confirmed accounts match the same FFCO licence:</p>
<ul>${lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>${button(url, "Open the admin page", lang)}`, lang),
    text: `Several confirmed accounts for licence ${licence}:\n${lines.join("\n")}\n\nAdministration: ${url}`,
  };
  return {
    subject: `Licence ${licence} : ${accounts.length} comptes — Ozimut`,
    html: wrap(env, `Licence ${licence} : ${accounts.length} comptes`, `<p>Plusieurs comptes confirmés correspondent à la même licence FFCO :</p>
<ul>${lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>${button(url, "Ouvrir la page d'administration", lang)}`, lang),
    text: `Plusieurs comptes confirmés pour la licence ${licence} :\n${lines.join("\n")}\n\nAdministration : ${url}`,
  };
}

/** races: [{ id, prov?, title, date, location }] — one digest per runner and update, in their language; `prov`: an
 *  organiser's results, on « Résultats » (before FFCO's), else FFCO's on « Courses classées ». */
export function digestMail(env, user, races) {
  const lang = L(user.lang), en = lang === "en";
  const base = siteUrl(env);
  const n = races.length;
  const rows = races.map((r) => ({ ...r, url: r.prov ? `${base}/#/resultats?course=${encodeURIComponent(r.prov)}`
    : `${base}/#/courses?id=${encodeURIComponent(r.id)}`, note: r.prov ? pick(lang, { fr: "résultats de l'organisateur", en: "organiser's results",
      de: "Ergebnisse des Veranstalters", es: "resultados del organizador" }) : "" }));
  const settings = `${base}/#/reglages`;
  const list = `<ul style="padding-left:18px">${rows.map((r) => `<li style="margin:6px 0"><a href="${esc(r.url)}">${esc(r.title)}</a>${r.location ? ` — ${esc(r.location)}` : ""}${r.date ? ` (${esc(r.date)})` : ""}${r.note ? ` <span style="color:#5b6675">· ${esc(r.note)}</span>` : ""}</li>`).join("")}</ul>`;
  const listText = rows.map((r) => `- ${r.title}${r.location ? ` (${r.location})` : ""}${r.date ? ` ${r.date}` : ""}${r.note ? ` · ${r.note}` : ""}\n  ${r.url}`).join("\n");
  if (en) return {
    subject: n === 1 ? `New race online: ${races[0].title} — Ozimut` : `${n} new races online — Ozimut`,
    html: wrap(env, n === 1 ? "One of your races is online" : `${n} of your races are online`, `<p>Hello ${esc(user.first_name)},</p>
${list}
<p style="font-size:13px;color:#5b6675">You receive this message because you turned notifications on. <a href="${esc(settings)}">Change my settings</a>.</p>`, lang),
    text: `Hello ${user.first_name},\n\n${listText}\n\nTo stop receiving these messages: ${settings}`,
  };
  if (lang === "de") return {
    subject: n === 1 ? `Neuer Lauf online: ${races[0].title} — Ozimut` : `${n} neue Läufe online — Ozimut`,
    html: wrap(env, n === 1 ? "Einer deiner Läufe ist online" : `${n} deiner Läufe sind online`, `<p>${esc(greet(lang, user.first_name))}</p>
${list}
<p style="font-size:13px;color:#5b6675">Du erhältst diese Nachricht, weil du Benachrichtigungen eingeschaltet hast. <a href="${esc(settings)}">Einstellungen ändern</a>.</p>`, lang),
    text: `${greet(lang, user.first_name)}\n\n${listText}\n\nUm diese Nachrichten nicht mehr zu erhalten: ${settings}`,
  };
  if (lang === "es") return {
    subject: n === 1 ? `Nueva carrera en línea: ${races[0].title} — Ozimut` : `${n} nuevas carreras en línea — Ozimut`,
    html: wrap(env, n === 1 ? "Una de tus carreras está en línea" : `${n} de tus carreras están en línea`, `<p>${esc(greet(lang, user.first_name))}</p>
${list}
<p style="font-size:13px;color:#5b6675">Recibes este mensaje porque has activado las notificaciones. <a href="${esc(settings)}">Cambiar mis ajustes</a>.</p>`, lang),
    text: `${greet(lang, user.first_name)}\n\n${listText}\n\nPara dejar de recibir estos mensajes: ${settings}`,
  };
  return {
    subject: n === 1 ? `Nouvelle course en ligne : ${races[0].title} — Ozimut` : `${n} nouvelles courses en ligne — Ozimut`,
    html: wrap(env, n === 1 ? "Une de vos courses est en ligne" : `${n} de vos courses sont en ligne`, `<p>Bonjour ${esc(user.first_name)},</p>
${list}
<p style="font-size:13px;color:#5b6675">Vous recevez ce message parce que vous avez activé les notifications. <a href="${esc(settings)}">Modifier mes réglages</a>.</p>`, lang),
    text: `Bonjour ${user.first_name},\n\n${listText}\n\nPour ne plus recevoir ces messages : ${settings}`,
  };
}

/**
 * events: the new courses (full details as sent by update.py) in the regions the user follows.
 * The first FULL are described completely, the rest as a compact list.
 */
const FULL = 15, COMPACT = 60;
const longDate = (iso, lang) => (iso ? new Date(iso + "T00:00:00").toLocaleDateString(locale(lang), { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : "");
const shortDate = (iso, lang) => (iso ? new Date(iso + "T00:00:00").toLocaleDateString(locale(lang), { day: "numeric", month: "short", year: "numeric" }) : "");
const a = (href, label) => `<a href="${esc(href)}">${esc(label || href)}</a>`;
/** The plain-text twin of an escaped HTML fragment. */
const plain = (html) => html.replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
// a race's type as update.py writes it (« Forêt MD », « Nuit », « Entraînement VTT »…), word by word in the recipient's
// language (German and Spanish: « Longue distance » as one word first, Langdistanz / larga distancia)
const TYPE_EN = { "Forêt": "Forest", Nuit: "Night", Relais: "Relay", "Pédestre": "Foot", VTT: "MTB", "Entraînement": "Training",
  Formation: "Workshop", Moyenne: "Middle", Longue: "Long", Autre: "Other" };
const TYPE_WORDS = {
  en: TYPE_EN,
  de: { "Forêt": "Wald", Nuit: "Nacht", Relais: "Staffel", "Pédestre": "Fuß-OL", VTT: "MTB-O", "Entraînement": "Training",
    Formation: "Schulung", Moyenne: "Mittel", Longue: "Lang", Autre: "Sonstiges" },
  es: { "Forêt": "Bosque", Nuit: "Nocturna", Relais: "Relevos", "Pédestre": "A pie", VTT: "MTB-O", "Entraînement": "Entrenamiento",
    Formation: "Formación", Moyenne: "Media", Longue: "Larga", Autre: "Otro" },
};
const TYPE_PHRASES = {
  de: [[/Longue distance/gi, "Langdistanz"], [/Moyenne distance/gi, "Mitteldistanz"]],
  es: [[/Longue distance/gi, "Larga distancia"], [/Moyenne distance/gi, "Media distancia"]],
};
const typeOf = (s, lang) => {
  const W = TYPE_WORDS[L(lang)];
  if (!W) return s || "";
  const t = (TYPE_PHRASES[L(lang)] || []).reduce((acc, [re, w]) => acc.replace(re, w), String(s || ""));
  return t.replace(/[\p{L}']+/gu, (w) => W[w] ?? w);
};

const AGENDA = {
  fr: {
    place: "Lieu", type: "Type", cn: "Classement national", cnYes: "<b>oui</b> — compte pour le CN", cnNo: "non",
    manif: "Manifestation", org: "Organisateur", referee: "Arbitre titulaire", referee2: "Arbitre stagiaire",
    controller: "Contrôleur des circuits", delegate: "Délégué", monitor: "Moniteur", contact: "Contact", phone: "Téléphone",
    email: "E-mail", site: "Site web", signs: "Fléchage", invitation: "Annonce de course", invitationLink: "Télécharger l'annonce (PDF)",
    gps: "Itinéraire GPS", route: "Ouvrir l'itinéraire", obs: "Observations",
    noReg: "Pas d'inscription en ligne indiquée sur le site de la fédération.",
    close: (d) => `clôture des inscriptions le <b>${d}</b>`, mods: (d) => `modifications (puces, compositions) jusqu'au ${d}`,
    count: (n, teams) => `${n} inscrit${n > 1 ? "s" : ""}${teams != null ? ` (${teams} équipe${teams > 1 ? "s" : ""})` : ""} à ce jour`,
    regOnline: "Inscriptions en ligne", noDates: " — dates de clôture non encore publiées", colon: " :",
    invitationArrow: "Annonce de course (PDF) →", access: "Accès", accessSrc: "(extrait de l'annonce)", accessText: "Accès (extrait de l'annonce)",
    see: "Voir sur Ozimut", ffco: "Fiche officielle", also: "Et aussi :",
    more: (n, link) => `… et ${n} autre${n > 1 ? "s" : ""} dans l'${link}.`, moreText: (n, url) => `… et ${n} autre${n > 1 ? "s" : ""} : ${url}`,
    agenda: "agenda", why: (w, link) => `Vous recevez ce message parce que vous avez activé l'alerte ${w}. ${link}.`, settings: "Modifier mes réglages",
    stop: "Pour modifier ou arrêter cette alerte :",
    new: {
      subject: (n, e) => (n === 1 ? `Nouvelle course à l'agenda : ${e.name} — Ozimut` : `${n} nouvelles courses à l'agenda — Ozimut`),
      title: (n) => (n === 1 ? "Une nouvelle course à l'agenda" : `${n} nouvelles courses à l'agenda`),
      intro: (n) => `${n === 1 ? "Une course vient" : "Des courses viennent"} d'être ajoutée${n > 1 ? "s" : ""} à l'agenda dans les régions que vous suivez :`,
      why: "« nouvelles courses »",
    },
    deadline: {
      subject: (n, e) => (n === 1 ? `Inscriptions bientôt closes : ${e.name} — Ozimut` : `${n} courses : inscriptions bientôt closes — Ozimut`),
      title: (n) => (n === 1 ? "Inscriptions bientôt closes" : `Inscriptions bientôt closes pour ${n} courses`),
      intro: (n) => `Les inscriptions ferment dans les 8 prochains jours pour ${n === 1 ? "cette course" : "ces courses"}, dans les régions que vous suivez :`,
      why: "« clôture des inscriptions »",
    },
  },
  en: {
    place: "Venue", type: "Type", cn: "National ranking", cnYes: "<b>yes</b> — counts for the CN", cnNo: "no",
    manif: "Event", org: "Organiser", referee: "Event adviser", referee2: "Trainee event adviser",
    controller: "Course controller", delegate: "Delegate", monitor: "Instructor", contact: "Contact", phone: "Phone",
    email: "Email", site: "Website", signs: "Signposting", invitation: "Race announcement", invitationLink: "Download the announcement (PDF)",
    gps: "GPS route", route: "Open the route", obs: "Notes",
    noReg: "No online entry given on the federation's website.",
    close: (d) => `entries close on <b>${d}</b>`, mods: (d) => `changes (SI cards, team line-ups) until ${d}`,
    count: (n, teams) => `${n} entr${n !== 1 ? "ies" : "y"}${teams != null ? ` (${teams} team${teams !== 1 ? "s" : ""})` : ""} so far`,
    regOnline: "Online entries", noDates: " — deadlines not published yet", colon: ":",
    invitationArrow: "Race announcement (PDF) →", access: "Getting there", accessSrc: "(from the announcement)", accessText: "Getting there (from the announcement)",
    see: "See on Ozimut", ffco: "Official page", also: "And also:",
    more: (n, link) => `… and ${n} more in the ${link}.`, moreText: (n, url) => `… and ${n} more: ${url}`,
    agenda: "calendar", why: (w, link) => `You receive this message because you turned on the ${w} alert. ${link}.`, settings: "Change my settings",
    stop: "To change or stop this alert:",
    new: {
      subject: (n, e) => (n === 1 ? `New race in the calendar: ${e.name} — Ozimut` : `${n} new races in the calendar — Ozimut`),
      title: (n) => (n === 1 ? "A new race in the calendar" : `${n} new races in the calendar`),
      intro: (n) => `${n === 1 ? "A race has" : "Races have"} just been added to the calendar in the regions you follow:`,
      why: "“new races”",
    },
    deadline: {
      subject: (n, e) => (n === 1 ? `Entries closing soon: ${e.name} — Ozimut` : `${n} races: entries closing soon — Ozimut`),
      title: (n) => (n === 1 ? "Entries closing soon" : `Entries closing soon for ${n} races`),
      intro: (n) => `Entries close within the next 8 days for ${n === 1 ? "this race" : "these races"}, in the regions you follow:`,
      why: "“entry deadline”",
    },
  },
  // German: the intros follow « Hallo Anna, » and so begin in lower case
  de: {
    place: "Ort", type: "Art", cn: "Nationale Rangliste", cnYes: "<b>ja</b> — zählt für den CN", cnNo: "nein",
    manif: "Veranstaltung", org: "Veranstalter", referee: "Schiedsrichter", referee2: "Schiedsrichter in Ausbildung",
    controller: "Bahnkontrolleur", delegate: "Delegierter", monitor: "Ausbilder", contact: "Kontakt", phone: "Telefon",
    email: "E-Mail", site: "Website", signs: "Ausschilderung", invitation: "Ausschreibung", invitationLink: "Ausschreibung herunterladen (PDF)",
    gps: "GPS-Route", route: "Route öffnen", obs: "Bemerkungen",
    noReg: "Auf der Website des Verbands ist keine Online-Anmeldung angegeben.",
    close: (d) => `Anmeldeschluss am <b>${d}</b>`, mods: (d) => `Änderungen (SI-Chips, Aufstellungen) bis ${d}`,
    count: (n, teams) => `bisher ${n} Anmeldung${n !== 1 ? "en" : ""}${teams != null ? ` (${teams} Team${teams !== 1 ? "s" : ""})` : ""}`,
    regOnline: "Online-Anmeldung", noDates: " — Anmeldeschluss noch nicht veröffentlicht", colon: ":",
    invitationArrow: "Ausschreibung (PDF) →", access: "Anreise", accessSrc: "(aus der Ausschreibung)", accessText: "Anreise (aus der Ausschreibung)",
    see: "Auf Ozimut ansehen", ffco: "Offizielle Seite", also: "Außerdem:",
    more: (n, link) => `… und ${n} weitere${n === 1 ? "r" : ""} im ${link}.`, moreText: (n, url) => `… und ${n} weitere${n === 1 ? "r" : ""}: ${url}`,
    agenda: "Kalender", why: (w, link) => `Du erhältst diese Nachricht, weil du die Benachrichtigung ${w} eingeschaltet hast. ${link}.`, settings: "Einstellungen ändern",
    stop: "Um diese Benachrichtigung zu ändern oder abzubestellen:",
    new: {
      subject: (n, e) => (n === 1 ? `Neuer Lauf im Kalender: ${e.name} — Ozimut` : `${n} neue Läufe im Kalender — Ozimut`),
      title: (n) => (n === 1 ? "Ein neuer Lauf im Kalender" : `${n} neue Läufe im Kalender`),
      intro: (n) => `in den Regionen, denen du folgst, ${n === 1 ? "wurde soeben ein Lauf" : "wurden soeben Läufe"} in den Kalender aufgenommen:`,
      why: "„Neue Läufe“",
    },
    deadline: {
      subject: (n, e) => (n === 1 ? `Anmeldeschluss naht: ${e.name} — Ozimut` : `${n} Läufe: Anmeldeschluss naht — Ozimut`),
      title: (n) => (n === 1 ? "Anmeldeschluss naht" : `Anmeldeschluss naht für ${n} Läufe`),
      intro: (n) => `für ${n === 1 ? "diesen Lauf" : "diese Läufe"} in den Regionen, denen du folgst, endet die Anmeldung in den nächsten 8 Tagen:`,
      why: "„Anmeldeschluss“",
    },
  },
  es: {
    place: "Lugar", type: "Tipo", cn: "Clasificación nacional", cnYes: "<b>sí</b> — cuenta para el CN", cnNo: "no",
    manif: "Evento", org: "Organizador", referee: "Árbitro titular", referee2: "Árbitro en prácticas",
    controller: "Controlador de recorridos", delegate: "Delegado", monitor: "Monitor", contact: "Contacto", phone: "Teléfono",
    email: "Correo electrónico", site: "Sitio web", signs: "Señalización", invitation: "Anuncio de la prueba", invitationLink: "Descargar el anuncio (PDF)",
    gps: "Ruta GPS", route: "Abrir la ruta", obs: "Observaciones",
    noReg: "El sitio de la federación no indica inscripción en línea.",
    close: (d) => `cierre de inscripciones el <b>${d}</b>`, mods: (d) => `cambios (pinzas, equipos) hasta el ${d}`,
    count: (n, teams) => `${n} inscrito${n !== 1 ? "s" : ""}${teams != null ? ` (${teams} equipo${teams !== 1 ? "s" : ""})` : ""} hasta ahora`,
    regOnline: "Inscripciones en línea", noDates: " — fechas de cierre aún no publicadas", colon: ":",
    invitationArrow: "Anuncio de la prueba (PDF) →", access: "Cómo llegar", accessSrc: "(del anuncio)", accessText: "Cómo llegar (del anuncio)",
    see: "Ver en Ozimut", ffco: "Página oficial", also: "Y también:",
    more: (n, link) => `… y ${n} más en el ${link}.`, moreText: (n, url) => `… y ${n} más: ${url}`,
    agenda: "calendario", why: (w, link) => `Recibes este mensaje porque has activado la alerta ${w}. ${link}.`, settings: "Cambiar mis ajustes",
    stop: "Para cambiar o desactivar esta alerta:",
    new: {
      subject: (n, e) => (n === 1 ? `Nueva carrera en el calendario: ${e.name} — Ozimut` : `${n} nuevas carreras en el calendario — Ozimut`),
      title: (n) => (n === 1 ? "Una nueva carrera en el calendario" : `${n} nuevas carreras en el calendario`),
      intro: (n) => `${n === 1 ? "Se acaba de añadir una carrera" : "Se acaban de añadir carreras"} al calendario en las regiones que sigues:`,
      why: "«nuevas carreras»",
    },
    deadline: {
      subject: (n, e) => (n === 1 ? `Inscripciones a punto de cerrar: ${e.name} — Ozimut` : `${n} carreras: inscripciones a punto de cerrar — Ozimut`),
      title: (n) => (n === 1 ? "Inscripciones a punto de cerrar" : `Inscripciones a punto de cerrar en ${n} carreras`),
      intro: (n) => `Las inscripciones cierran en los próximos 8 días para ${n === 1 ? "esta carrera" : "estas carreras"}, en las regiones que sigues:`,
      why: "«cierre de inscripciones»",
    },
  },
};

/** [label, htmlValue, textValue] rows of one course. */
function courseRows(env, e, lang) {
  const T = AGENDA[L(lang)];
  const rows = [];
  const add = (label, html, text) => { if (html) rows.push([label, html, text ?? plain(html)]); };
  add(T.place, e.place ? `${esc(e.place)}${e.dep ? ` (${esc(e.dep)}${e.depName ? ` · ${esc(e.depName)}` : ""})` : ""}${e.region ? ` — ${esc(e.region)}` : ""}` : "");
  add(T.type, esc([typeOf(e.type, lang), e.groupe].filter(Boolean).join(" · ")));
  add(T.cn, e.cn ? T.cnYes : T.cnNo);
  add(T.manif, esc(e.manif));
  add(T.org, esc(e.org));
  add(T.referee, esc(e.referee));
  add(T.referee2, esc(e.referee2));
  add(T.controller, esc(e.controller));
  add(T.delegate, esc(e.delegate));
  add(T.monitor, esc(e.monitor));
  add(T.contact, esc(e.contact));
  add(T.phone, e.phone ? a(`tel:${e.phone.replace(/\s+/g, "")}`, e.phone) : "", e.phone);
  add(T.email, e.email ? a(`mailto:${e.email}`, e.email) : "", e.email);
  add(T.site, e.site ? a(e.site) : "", e.site);
  add(T.signs, e.flechage ? (/^https?:\/\//.test(e.flechage) ? a(e.flechage) : esc(e.flechage)) : "", e.flechage);
  add(T.invitation, e.invitation ? a(e.invitation, T.invitationLink) : "", e.invitation);
  const g = e.gps;
  if (g) {
    add(T.gps, `${a(`https://www.google.com/maps/dir/?api=1&destination=${g[0]},${g[1]}&travelmode=driving`, "Google Maps")} · ${a(`https://waze.com/ul?ll=${g[0]},${g[1]}&navigate=yes`, "Waze")} <span style="color:#5b6675">(${g[0]}, ${g[1]})</span>`,
      `https://www.google.com/maps/dir/?api=1&destination=${g[0]},${g[1]} (${g[0]}, ${g[1]})`);
  } else if (e.mapUrl) add(T.gps, a(e.mapUrl, T.route), e.mapUrl);
  add(T.obs, e.obs ? esc(e.obs).replace(/\n/g, "<br>") : "", e.obs);
  return rows;
}

function registrationBlock(e, lang) {
  const T = AGENDA[L(lang)];
  const r = e.reg;
  if (!r) return { html: `<i>${T.noReg}</i>`, text: T.noReg };
  const bits = [];
  if (r.close) bits.push(T.close(esc(shortDate(r.close, lang))));
  if (r.mods) bits.push(T.mods(esc(shortDate(r.mods, lang))));
  if (r.count != null) bits.push(esc(T.count(r.count, r.teams)));
  const bitsText = bits.map(plain);
  return {
    html: `${a(r.url, T.regOnline)}${bits.length ? ` — ${bits.join(", ")}` : T.noDates}`,
    text: `${T.regOnline}${T.colon} ${r.url}${bitsText.length ? ` — ${bitsText.join(", ")}` : T.noDates}`,
  };
}

// the two agenda alerts: a course newly in the agenda, or its registrations closing within 8 days
export function agendaMail(env, user, events, kind = "new") {
  const lang = L(user.lang), T = AGENDA[lang], K = T[kind];
  const base = siteUrl(env);
  const n = events.length;
  const full = events.slice(0, FULL), compact = events.slice(FULL, FULL + COMPACT), more = n - full.length - compact.length;
  const link = (e) => `${base}/#/agenda?id=${encodeURIComponent(e.id)}`;
  const ffco = (e) => `https://api.ffcorientation.fr/iframe/courses/${encodeURIComponent(e.id)}/`;
  const settings = `${base}/#/reglages`;
  const type = (e) => typeOf(e.type, lang);

  const blockHtml = (e) => {
    const rows = courseRows(env, e, lang), reg = registrationBlock(e, lang);
    return `<div style="border:1px solid #dde3ea;border-radius:8px;padding:12px 14px;margin:12px 0">
<div style="font-size:16px;font-weight:700">${a(link(e), e.name)}</div>
<div style="color:#5b6675;margin:2px 0 8px">${esc(longDate(e.date, lang))}${e.type ? ` · ${esc(type(e))}` : ""}</div>
${e.invitation ? `<div style="margin-bottom:8px"><b>${a(e.invitation, T.invitationArrow)}</b></div>` : ""}
<div style="background:#f4f6f9;border-radius:6px;padding:8px 10px;margin-bottom:8px">${reg.html}</div>
${e.access ? `<div style="background:#f4f6f9;border-radius:6px;padding:8px 10px;margin-bottom:8px"><b>${T.access}</b> <span style="color:#5b6675;font-size:12px">${T.accessSrc}</span><div style="white-space:pre-line;font-size:13.5px;margin-top:4px">${esc(e.access)}</div></div>` : ""}
<table style="border-collapse:collapse;font-size:14px">${rows.map(([l, h]) => `<tr><td style="padding:2px 12px 2px 0;color:#5b6675;vertical-align:top;white-space:nowrap">${esc(l)}</td><td style="padding:2px 0">${h}</td></tr>`).join("")}</table>
<div style="margin-top:8px;font-size:13px">${a(link(e), T.see)} · ${a(ffco(e), T.ffco)}</div>
</div>`;
  };
  const blockText = (e) => {
    const rows = courseRows(env, e, lang), reg = registrationBlock(e, lang);
    return [`${e.name}`, `${longDate(e.date, lang)}${e.type ? ` · ${type(e)}` : ""}`, ...(e.invitation ? [`${T.invitation}${T.colon} ${e.invitation}`] : []),
      reg.text, ...(e.access ? [`${T.accessText}${T.colon}\n${e.access}`] : []),
      ...rows.map(([l, , t]) => `${l}${T.colon} ${t}`), `Ozimut${T.colon} ${link(e)}`, `${T.ffco}${T.colon} ${ffco(e)}`].join("\n");
  };
  const compactLine = (e) => `${e.name} — ${shortDate(e.date, lang)}${e.place ? `, ${e.place}` : ""}${e.type ? ` (${type(e)})` : ""}`;

  return {
    subject: K.subject(n, events[0]),
    html: wrap(env, K.title(n), `<p>${esc(greet(lang, user.first_name))}</p>
<p>${K.intro(n)}</p>
${full.map(blockHtml).join("")}
${compact.length ? `<p><b>${T.also}</b></p><ul style="padding-left:18px">${compact.map((e) => `<li style="margin:4px 0">${a(link(e), e.name)} — ${esc(shortDate(e.date, lang))}${e.place ? `, ${esc(e.place)}` : ""}${e.type ? ` (${esc(type(e))})` : ""}</li>`).join("")}</ul>` : ""}
${more > 0 ? `<p>${T.more(more, a(`${base}/#/agenda`, T.agenda))}</p>` : ""}
<p style="font-size:13px;color:#5b6675">${T.why(K.why, a(settings, T.settings))}</p>`, lang),
    text: `${greet(lang, user.first_name)}\n\n${K.intro(n)}\n\n${full.map(blockText).join("\n\n---\n\n")}${compact.length ? `\n\n${T.also}\n${compact.map((e) => `- ${compactLine(e)}\n  ${link(e)}`).join("\n")}` : ""}${more > 0 ? `\n\n${T.moreText(more, `${base}/#/agenda`)}` : ""}\n\n${T.stop} ${settings}`,
  };
}

// the writer's language, when not French, as the administrator reads it
const LANG_NAME_FR = { en: "anglais", de: "allemand", es: "espagnol" };
/** A message from the contact page, to the administrator (in French: the site's own address reads it). msg: { category,
 *  subject, html, text, from, browser, files }. */
export function contactMail(env, user, msg) {
  const base = siteUrl(env);
  const who = `${user.first_name} ${user.last_name}`;
  const rows = [
    ["De", `${esc(who)} (${esc(user.display_name)}) — <a href="mailto:${esc(user.email)}">${esc(user.email)}</a>`, `${who} (${user.display_name}) — ${user.email}`],
    ["Licence", `<a href="${esc(`${base}/#/coureur/${encodeURIComponent(user.licence)}`)}">${esc(user.licence)}</a>`, user.licence],
    ["Type", esc(msg.category), msg.category],
    ...(LANG_NAME_FR[user.lang] ? [["Langue", LANG_NAME_FR[user.lang], LANG_NAME_FR[user.lang]]] : []),
    ...(msg.from ? [["Depuis la page", esc(msg.from), msg.from]] : []),
    ...(msg.browser ? [["Navigateur", esc(msg.browser), msg.browser]] : []),
    ...(msg.files.length ? [["Pièces jointes", esc(msg.files.join(", ")), msg.files.join(", ")]] : []),
  ];
  return {
    subject: `[Ozimut · ${msg.category}] ${msg.subject}`,
    html: wrap(env, msg.subject, `<table style="border-collapse:collapse;font-size:13.5px;margin-bottom:14px">${rows.map(([l, h]) =>
      `<tr><td style="padding:2px 12px 2px 0;color:#5b6675;vertical-align:top;white-space:nowrap">${l}</td><td style="padding:2px 0">${h}</td></tr>`).join("")}</table>
<div style="border-top:1px solid #dde3ea;padding-top:12px">${msg.html || `<p style="white-space:pre-line">${esc(msg.text)}</p>`}</div>
<p style="font-size:12px;color:#5b6675">Répondre à ce message écrit directement à ${esc(user.email)}.</p>`, "fr"),
    text: `${rows.map(([l, , t]) => `${l} : ${t}`).join("\n")}\n\n${msg.text}`,
  };
}

// Push notifications (functions/_lib/push.js, site/sw-push.js): { title, body, url, tag } in the account's language.
const clock = (s) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}${sec ? `:${String(sec).padStart(2, "0")}` : ""}`;
};
/** The pushes' words, by language. */
const PUSH = {
  fr: { start: "Départ", startChanged: "Heure de départ modifiée", startYours: "Votre heure de départ",
    test: "Les notifications fonctionnent sur cet appareil.", and: "et", more: "autres",
    results1: "Vos résultats sont en ligne", resultsN: (n) => `${n} de vos courses sont en ligne`,
    deadline: "Clôture des inscriptions proche", closes: "clôture",
    new1: "Une nouvelle course dans vos régions", newN: (n) => `${n} nouvelles courses dans vos régions` },
  en: { start: "Start", startChanged: "Start time changed", startYours: "Your start time",
    test: "Notifications work on this device.", and: "and", more: "more",
    results1: "Your results are online", resultsN: (n) => `${n} of your races are online`,
    deadline: "Registrations closing soon", closes: "closes",
    new1: "A new race in your regions", newN: (n) => `${n} new races in your regions` },
  de: { start: "Start", startChanged: "Startzeit geändert", startYours: "Deine Startzeit",
    test: "Benachrichtigungen funktionieren auf diesem Gerät.", and: "und", more: (k) => (k === 1 ? "weiterer" : "weitere"),
    results1: "Deine Ergebnisse sind online", resultsN: (n) => `${n} deiner Läufe sind online`,
    deadline: "Anmeldeschluss naht", closes: "Anmeldeschluss",
    new1: "Ein neuer Lauf in deinen Regionen", newN: (n) => `${n} neue Läufe in deinen Regionen` },
  es: { start: "Salida", startChanged: "Hora de salida cambiada", startYours: "Tu hora de salida",
    test: "Las notificaciones funcionan en este dispositivo.", and: "y", more: "más",
    results1: "Tus resultados están en línea", resultsN: (n) => `${n} de tus carreras están en línea`,
    deadline: "Inscripciones a punto de cerrar", closes: "cierre",
    new1: "Una nueva carrera en tus regiones", newN: (n) => `${n} nuevas carreras en tus regiones` },
};
/** A runner's start time, published (or changed: `changed`) on the start list of a coming race.
 *  s = { key, name, date, place, start_s, cls } */
export function startPush(lang, s, changed) {
  const P = PUSH[L(lang)];
  const day = s.date ? new Date(s.date + "T00:00:00").toLocaleDateString(locale(lang), { weekday: "short", day: "numeric", month: "short" }) : "";
  const where = [s.name, day].filter(Boolean).join(" · ");
  const what = `${P.start} ${clock(s.start_s)}${s.cls ? ` · ${s.cls}` : ""}`;
  return {
    title: changed ? P.startChanged : P.startYours,
    body: `${where}
${what}`, url: `/#/resultats?course=${encodeURIComponent(s.key)}`, tag: `start-${s.key}`,
  };
}
/** The admin page's test e-mail (Consommation) as its form starts: a generic subject and text, which the administrator may
 *  change before sending it (plainMail puts it in the site's frame). -> { subject, text } */
export function testMail(user) {
  const lang = user.lang;
  const T = pick(lang, {
    fr: { subject: "E-mail d'essai — Ozimut",
      body: "Cet e-mail d'essai a été envoyé depuis la page d'administration d'Ozimut.",
      check: "Pour vérifier l'authentification, affichez l'original du message (Gmail : ⋮ › Afficher l'original) : SPF, DKIM (ozimut.com) et DMARC doivent indiquer PASS." },
    en: { subject: "Test e-mail — Ozimut",
      body: "This test e-mail was sent from Ozimut's administration page.",
      check: "To check its authentication, show the original message (Gmail: ⋮ › Show original): SPF, DKIM (ozimut.com) and DMARC should all say PASS." },
    de: { subject: "Test-E-Mail — Ozimut",
      body: "Diese Test-E-Mail wurde von der Verwaltungsseite von Ozimut aus gesendet.",
      check: "Um die Authentifizierung zu prüfen, zeige die Originalnachricht an (Gmail: ⋮ › Original anzeigen): SPF, DKIM (ozimut.com) und DMARC sollten PASS anzeigen." },
    es: { subject: "Correo de prueba — Ozimut",
      body: "Este correo de prueba se ha enviado desde la página de administración de Ozimut.",
      check: "Para comprobar su autenticación, muestra el mensaje original (Gmail: ⋮ › Mostrar original): SPF, DKIM (ozimut.com) y DMARC deben indicar PASS." },
  });
  return { subject: T.subject, text: `${greet(lang, user.first_name)}

${T.body}

${T.check}` };
}

/** A text typed on the admin page, in the site's frame: paragraphs at the blank lines, its own line breaks kept. */
export function plainMail(env, subject, text, lang) {
  const paras = String(text).split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  return {
    subject,
    html: wrap(env, subject, paras.map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`).join(""), lang),
    text,
  };
}

/** Réglages' « Envoyer un essai ». */
export function testPush(lang) {
  return { title: "Ozimut", body: PUSH[L(lang)].test, url: "/#/reglages", tag: "test" };
}

const pushDay = (iso, lang) => (iso ? new Date(iso + "T00:00:00").toLocaleDateString(locale(lang), { weekday: "short", day: "numeric", month: "short" }) : "");
/** A list of names for one line: the first two, then « +3 ». */
const fewNames = (names, lang) => {
  const P = PUSH[L(lang)];
  return names.length <= 2 ? names.join(", ") : `${names.slice(0, 2).join(", ")} ${P.and} ${names.length - 2} ${typeof P.more === "function" ? P.more(names.length - 2) : P.more}`;
};
/** « A race you ran is online » (the push twin of digestMail). races: [{ id, prov?, title, date }] */
export function resultsPush(lang, races) {
  const P = PUSH[L(lang)], n = races.length, r = races[0];
  const url = n > 1 ? "/#/resultats" : r.prov ? `/#/resultats?course=${encodeURIComponent(r.prov)}` : `/#/courses?id=${encodeURIComponent(r.id)}`;
  return {
    title: n === 1 ? P.results1 : P.resultsN(n),
    body: n === 1 ? [r.title, pushDay(r.date, lang)].filter(Boolean).join(" · ") : fewNames(races.map((x) => x.title), lang),
    url, tag: n === 1 ? `results-${r.prov || r.id}` : "results",
  };
}
/** The agenda's alerts: new races in the regions followed (`kind` "new"), or registrations closing soon ("deadline").
 *  events: as announceAgenda keeps them ({ id, name, date, place, reg: { close } }). */
export function agendaPush(lang, events, kind = "new") {
  const P = PUSH[L(lang)], n = events.length, e = events[0];
  const url = n === 1 ? `/#/agenda?id=${encodeURIComponent(e.id)}` : "/#/agenda";
  if (kind === "deadline") return {
    title: P.deadline,
    body: n === 1 ? `${e.name} · ${P.closes} ${pushDay(e.reg?.close, lang)}` : fewNames(events.map((x) => x.name), lang),
    url, tag: n === 1 ? `deadline-${e.id}` : "deadline",
  };
  return {
    title: n === 1 ? P.new1 : P.newN(n),
    body: n === 1 ? [e.name, pushDay(e.date, lang), e.place].filter(Boolean).join(" · ") : fewNames(events.map((x) => x.name), lang),
    url, tag: n === 1 ? `agenda-${e.id}` : "agenda",
  };
}

/** A runner's start time by e-mail (the twin of startPush; users.starts_alert). s = { key, name, date, place, start_s, cls } */
export function startMail(env, user, s, changed) {
  const lang = L(user.lang), en = lang === "en";
  const url = `${siteUrl(env)}/#/resultats?course=${encodeURIComponent(s.key)}`, settings = `${siteUrl(env)}/#/reglages`;
  const when = clock(s.start_s), day = longDate(s.date, lang);
  const R = pick(lang, {
    fr: ["Course", "Date", "Lieu", "Circuit / catégorie", "Heure de départ"],
    en: ["Race", "Date", "Place", "Course / class", "Start time"],
    de: ["Lauf", "Datum", "Ort", "Bahn / Kategorie", "Startzeit"],
    es: ["Carrera", "Fecha", "Lugar", "Recorrido / categoría", "Hora de salida"],
  });
  const rows = [[R[0], s.name], [R[1], day], [R[2], s.place], [R[3], s.cls], [R[4], when]].filter(([, v]) => v);
  const table = `<table style="border-collapse:collapse;margin:8px 0">${rows.map(([k, v]) => `<tr><td style="padding:3px 14px 3px 0;color:#5b6675">${esc(k)}</td><td style="padding:3px 0"><b>${esc(v)}</b></td></tr>`).join("")}</table>`;
  const text = rows.map(([k, v]) => `${k}${lang === "fr" ? " :" : ":"} ${v}`).join("\n");
  if (en) return {
    subject: `${changed ? "Start time changed" : "Your start time"}: ${when} — ${s.name} — Ozimut`,
    html: wrap(env, changed ? "Your start time has changed" : "Your start time", `<p>Hello ${esc(user.first_name)},</p>
<p>${changed ? "The start list of your race was updated:" : "The start list of your race is published:"}</p>${table}${button(url, "See the start list", lang)}
<p style="font-size:13px;color:#5b6675">You receive this message because you asked for your start times by email. <a href="${esc(settings)}">Change my settings</a>.</p>`, lang),
    text: `Hello ${user.first_name},\n\n${text}\n\n${url}\n\nTo stop receiving these messages: ${settings}`,
  };
  if (lang === "de") return {
    subject: `${changed ? "Startzeit geändert" : "Deine Startzeit"}: ${when} — ${s.name} — Ozimut`,
    html: wrap(env, changed ? "Deine Startzeit hat sich geändert" : "Deine Startzeit", `<p>${esc(greet(lang, user.first_name))}</p>
<p>${changed ? "die Startliste deines Laufs wurde aktualisiert:" : "die Startliste deines Laufs ist veröffentlicht:"}</p>${table}${button(url, "Startliste ansehen", lang)}
<p style="font-size:13px;color:#5b6675">Du erhältst diese Nachricht, weil du deine Startzeiten per E-Mail angefordert hast. <a href="${esc(settings)}">Einstellungen ändern</a>.</p>`, lang),
    text: `${greet(lang, user.first_name)}\n\n${text}\n\n${url}\n\nUm diese Nachrichten nicht mehr zu erhalten: ${settings}`,
  };
  if (lang === "es") return {
    subject: `${changed ? "Hora de salida cambiada" : "Tu hora de salida"}: ${when} — ${s.name} — Ozimut`,
    html: wrap(env, changed ? "Tu hora de salida ha cambiado" : "Tu hora de salida", `<p>${esc(greet(lang, user.first_name))}</p>
<p>${changed ? "La lista de salida de tu carrera se ha actualizado:" : "La lista de salida de tu carrera está publicada:"}</p>${table}${button(url, "Ver la lista de salida", lang)}
<p style="font-size:13px;color:#5b6675">Recibes este mensaje porque has pedido tus horas de salida por correo electrónico. <a href="${esc(settings)}">Cambiar mis ajustes</a>.</p>`, lang),
    text: `${greet(lang, user.first_name)}\n\n${text}\n\n${url}\n\nPara dejar de recibir estos mensajes: ${settings}`,
  };
  return {
    subject: `${changed ? "Heure de départ modifiée" : "Votre heure de départ"} : ${when} — ${s.name} — Ozimut`,
    html: wrap(env, changed ? "Votre heure de départ a changé" : "Votre heure de départ", `<p>Bonjour ${esc(user.first_name)},</p>
<p>${changed ? "La liste de départ de votre course a été mise à jour :" : "La liste de départ de votre course est publiée :"}</p>${table}${button(url, "Voir la liste de départ", lang)}
<p style="font-size:13px;color:#5b6675">Vous recevez ce message parce que vous avez demandé vos heures de départ par e-mail. <a href="${esc(settings)}">Modifier mes réglages</a>.</p>`, lang),
    text: `Bonjour ${user.first_name},\n\n${text}\n\n${url}\n\nPour ne plus recevoir ces messages : ${settings}`,
  };
}

/**
 * To a new account, once its address is confirmed (api/account/verify.js; owner, 2026-10-21, sent only while WELCOME_MAIL is
 * "1"): what the site does, and an invitation to say what works and what does not, by replying or through « Nous écrire ».
 * fr: the account has joined France (its rankings are open to it); else a word on how a federation's rankings open.
 */
export function welcomeMail(env, user, { fr = false } = {}) {
  const site = siteUrl(env), NB = " ";
  const W = pick(user.lang, { en: {
    subject: "Welcome to Ozimut",
    greet: (n) => `Hello${n ? ` ${n}` : ""},`,
    intro: "Your account is active. Ozimut gathers in four modules what surrounds an orienteering race:",
    items: [
      ["Arena", "today's, coming and past competitions — the calendar, the results as soon as the organiser publishes them, live results and the split-time analysis."],
      fr ? ["Stats", "the rankings and their analyses — your runner's page, the official CN and the Ozimut index, clubs, comparisons and statistics."]
        : ["Stats", "the rankings and their analyses — a federation's rankings open to its licence holders, from Settings › My countries."],
      ["Coach", "training — your GPS track replayed on the map, alone or with your club mates, orienteering games and a MAS calculator."],
      ["Orga", "for organisers — post results and start times, broadcast live results, set courses and share a GPS analysis with your runners (Settings › Modules)."],
    ],
    alerts: "In Settings, choose your alerts: one of your races online, your start time, new races in your regions — as notifications on your phone or computer. Ozimut also installs as an app.",
    feedback: ["Ozimut is young and changes every week. An idea, a mistake, a page that is unclear? Just reply to this message, or write to us from the ", "Contact us", " page. Every message is read."],
    open: "Open Ozimut",
    later: "Ozimut is free during its launch. As usage grows, some advanced or costly features may become paid: we will say so at least two months ahead, and what you have already stored will stay readable and exportable.",
    sign: "See you soon on the courses,",
    team: "The Ozimut team",
    colon: ": ",
  }, fr: {
    subject: "Bienvenue sur Ozimut",
    greet: (n) => `Bonjour${n ? ` ${n}` : ""},`,
    intro: `Votre compte est activé. Ozimut rassemble en quatre modules ce qui entoure une course d'orientation${NB}:`,
    items: [
      ["Arena", `les compétitions du jour, à venir et passées — l'agenda, les résultats dès que l'organisateur les publie, le direct et l'analyse des temps intermédiaires.`],
      fr ? ["Stats", `les classements et leurs analyses — votre page de coureur, le CN officiel et l'indice Ozimut, les clubs, les comparaisons et les statistiques.`]
        : ["Stats", `les classements et leurs analyses — ceux d'une fédération s'ouvrent à ses licenciés, depuis Réglages › Mes pays.`],
      ["Coach", `l'entraînement — votre trace GPS rejouée sur la carte, seul ou avec votre club, des jeux d'orientation et un calculateur de VMA.`],
      ["Orga", `pour les organisateurs — déposer résultats et horaires, diffuser un direct, tracer des circuits, partager une analyse GPS avec vos coureurs (Réglages › Modules).`],
    ],
    alerts: `Dans Réglages, choisissez vos alertes${NB}: une de vos courses en ligne, votre heure de départ, les nouvelles courses de vos régions — par notification sur votre téléphone ou votre ordinateur. Ozimut s'installe aussi comme une application.`,
    feedback: [`Ozimut est jeune et évolue chaque semaine. Une idée, une erreur, une page peu claire${NB}? Répondez simplement à ce message, ou écrivez-nous depuis la page «${NB}`, "Nous écrire", `${NB}». Chaque message est lu.`],
    open: "Ouvrir Ozimut",
    later: `Ozimut est gratuit pendant son lancement. À mesure que l'usage grandit, certaines fonctions avancées ou coûteuses pourront devenir payantes${NB}: nous l'annoncerons au moins deux mois avant, et ce que vous avez déjà enregistré restera consultable et exportable.`,
    sign: "À bientôt sur les circuits,",
    team: "L'équipe Ozimut",
    colon: `${NB}: `,
  }, de: {
    subject: "Willkommen bei Ozimut",
    greet: (n) => `Hallo${n ? ` ${n}` : ""},`,
    intro: "dein Konto ist aktiv. Ozimut vereint in vier Modulen alles rund um einen OL-Wettkampf:",
    items: [
      ["Arena", "die heutigen, kommenden und vergangenen Wettkämpfe — der Kalender, die Ergebnisse, sobald der Veranstalter sie veröffentlicht, Live-Ergebnisse und die Zwischenzeitenanalyse."],
      fr ? ["Stats", "die Ranglisten und ihre Auswertungen — deine Läuferseite, der offizielle CN und der Ozimut-Index, Vereine, Vergleiche und Statistiken."]
        : ["Stats", "die Ranglisten und ihre Auswertungen — die Ranglisten eines Verbands stehen seinen Lizenzinhabern offen, über Einstellungen › Meine Länder."],
      ["Coach", "das Training — dein GPS-Track, abgespielt auf der Karte, allein oder mit deinen Vereinskollegen, OL-Spiele und ein MAG-Rechner."],
      ["Orga", "für Veranstalter — Ergebnisse und Startzeiten hochladen, Live-Ergebnisse übertragen, Bahnen legen und eine GPS-Analyse mit deinen Läufern teilen (Einstellungen › Module)."],
    ],
    alerts: "Wähle in den Einstellungen deine Benachrichtigungen: einer deiner Läufe ist online, deine Startzeit, neue Läufe in deinen Regionen — als Mitteilung auf deinem Handy oder Computer. Ozimut lässt sich auch als App installieren.",
    feedback: ["Ozimut ist jung und entwickelt sich jede Woche weiter. Eine Idee, ein Fehler, eine unklare Seite? Antworte einfach auf diese Nachricht oder schreib uns über die Seite „", "Kontakt", "“. Jede Nachricht wird gelesen."],
    open: "Ozimut öffnen",
    later: "Ozimut ist während seines Starts kostenlos. Mit wachsender Nutzung können einige fortgeschrittene oder kostspielige Funktionen kostenpflichtig werden: Wir kündigen das mindestens zwei Monate vorher an, und was du bereits gespeichert hast, bleibt einsehbar und exportierbar.",
    sign: "Bis bald im Gelände,",
    team: "Das Ozimut-Team",
    colon: ": ",
  }, es: {
    subject: "Te damos la bienvenida a Ozimut",
    greet: (n) => (n ? `Hola, ${n}:` : "¡Hola!"),
    intro: "Tu cuenta está activada. Ozimut reúne en cuatro módulos todo lo que rodea a una carrera de orientación:",
    items: [
      ["Arena", "las competiciones de hoy, próximas y pasadas — el calendario, los resultados en cuanto el organizador los publica, el directo y el análisis de los tiempos parciales."],
      fr ? ["Stats", "las clasificaciones y sus análisis — tu página de corredor, el CN oficial y el índice Ozimut, los clubes, las comparaciones y las estadísticas."]
        : ["Stats", "las clasificaciones y sus análisis — las de una federación se abren a sus federados, desde Ajustes › Mis países."],
      ["Coach", "el entrenamiento — tu track GPS reproducido sobre el mapa, solo o con tu club, juegos de orientación y una calculadora de VAM."],
      ["Orga", "para los organizadores — subir resultados y horarios, emitir en directo, trazar recorridos y compartir un análisis GPS con tus corredores (Ajustes › Módulos)."],
    ],
    alerts: "En Ajustes, elige tus alertas: una de tus carreras en línea, tu hora de salida, las nuevas carreras de tus regiones — como notificaciones en tu móvil o tu ordenador. Ozimut también se instala como aplicación.",
    feedback: ["Ozimut es joven y cambia cada semana. ¿Una idea, un error, una página poco clara? Responde simplemente a este mensaje o escríbenos desde la página «", "Contacto", "». Leemos todos los mensajes."],
    open: "Abrir Ozimut",
    later: "Ozimut es gratis durante su lanzamiento. A medida que crezca su uso, algunas funciones avanzadas o costosas podrán pasar a ser de pago: lo anunciaremos con al menos dos meses de antelación, y lo que ya hayas guardado seguirá pudiendo consultarse y exportarse.",
    sign: "Hasta pronto en los recorridos,",
    team: "El equipo de Ozimut",
    colon: ": ",
  } });
  const hello = W.greet(user.first_name);
  const contact = `${site}/#/contact`, home = `${site}/#/modules`;
  const [f0, fLink, f1] = W.feedback;
  const html = `<p>${esc(hello)}</p><p>${esc(W.intro)}</p>
<ul style="padding-left:20px;margin:0 0 12px">${W.items.map(([k, v]) => `<li style="margin:0 0 6px"><b>${esc(k)}</b>${esc(W.colon)}${esc(v)}</li>`).join("")}</ul>
<p>${esc(W.alerts)}</p>${button(home, W.open, user.lang)}
<p>${esc(f0)}<a href="${esc(contact)}">${esc(fLink)}</a>${esc(f1)}</p>
<p>${esc(W.later)}</p>
<p>${esc(W.sign)}<br>${esc(W.team)}</p>`;
  const text = [hello, "", W.intro, ...W.items.map(([k, v]) => `- ${k}${W.colon}${v}`), "", W.alerts, "", `${W.open}${W.colon}${home}`, "",
    `${f0}${fLink}${f1}`, `${fLink}${W.colon}${contact}`, "", W.later, "", W.sign, W.team].join("\n");
  return { subject: W.subject, html: wrap(env, W.subject, html, user.lang), text };
}

// « Nutrition »: a new article is out (owner, 2026-11-01; users.nut_mail / nut_push, _lib/nutrition.js announceDue).
// posts: [{ id, title, summary, author, lang }], the article's own words as written (its title is not translated here)
const NUT = {
  fr: { one: "Nouvel article dans Santé", many: (n) => `${n} nouveaux articles dans Santé`, by: (a) => `par ${a}`,
    intro1: "Un nouvel article est paru dans Santé :", introN: "De nouveaux articles sont parus dans Santé :", read: "Lire l'article", all: "Voir les articles",
    why: (s) => `Vous recevez ce message parce que l'alerte « Nouvel article dans Santé » est cochée dans vos ${s}.`, settings: "réglages", stop: "Pour ne plus le recevoir :",
    lang: { fr: "", en: " (en anglais)", de: " (en allemand)", es: " (en espagnol)" } },
  en: { one: "New article in Health", many: (n) => `${n} new articles in Health`, by: (a) => `by ${a}`,
    intro1: "A new article is out in Health:", introN: "New articles are out in Health:", read: "Read the article", all: "See the articles",
    why: (s) => `You receive this message because the alert “New article in Health” is ticked in your ${s}.`, settings: "settings", stop: "To stop receiving it:",
    lang: { fr: " (in French)", en: "", de: " (in German)", es: " (in Spanish)" } },
  de: { one: "Neuer Artikel in Gesundheit", many: (n) => `${n} neue Artikel in Gesundheit`, by: (a) => `von ${a}`,
    intro1: "In Gesundheit ist ein neuer Artikel erschienen:", introN: "In Gesundheit sind neue Artikel erschienen:", read: "Artikel lesen", all: "Artikel ansehen",
    why: (s) => `Du erhältst diese Nachricht, weil die Benachrichtigung „Neuer Artikel in Gesundheit“ in deinen ${s} angekreuzt ist.`, settings: "Einstellungen", stop: "Um sie nicht mehr zu erhalten:",
    lang: { fr: " (auf Französisch)", en: " (auf Englisch)", de: "", es: " (auf Spanisch)" } },
  es: { one: "Nuevo artículo en Salud", many: (n) => `${n} artículos nuevos en Salud`, by: (a) => `por ${a}`,
    intro1: "Se ha publicado un artículo nuevo en Salud:", introN: "Se han publicado artículos nuevos en Salud:", read: "Leer el artículo", all: "Ver los artículos",
    why: (s) => `Recibes este mensaje porque la alerta «Nuevo artículo en Salud» está marcada en tus ${s}.`, settings: "ajustes", stop: "Para dejar de recibirlo:",
    lang: { fr: " (en francés)", en: " (en inglés)", de: " (en alemán)", es: "" } },
};
export function nutritionMail(env, user, posts) {
  const lang = L(user.lang), T = NUT[lang], base = siteUrl(env), n = posts.length;
  const link = (p) => `${base}/#/sante?article=${p.id}`, settings = `${base}/#/reglages`;
  const title = n === 1 ? T.one : T.many(n);
  const block = (p) => `<div style="border:1px solid #dde3ea;border-radius:8px;padding:12px 14px;margin:12px 0">
<div style="font-size:16px;font-weight:700">${a(link(p), p.title)}</div>
<div style="color:#5b6675;margin:2px 0 6px">${esc(T.by(p.author))}${esc(T.lang[p.lang] || "")}</div>
${p.summary ? `<div style="font-size:14px">${esc(p.summary)}</div>` : ""}</div>`;
  return {
    subject: n === 1 ? `${T.one}${lang === "fr" ? " : " : ": "}${posts[0].title}` : title,
    html: wrap(env, title, `<p>${esc(greet(lang, user.first_name))}</p><p>${esc(n === 1 ? T.intro1 : T.introN)}</p>
${posts.map(block).join("")}${button(n === 1 ? link(posts[0]) : `${base}/#/sante`, n === 1 ? T.read : T.all, lang)}
<p style="font-size:13px;color:#5b6675">${T.why(a(settings, T.settings))}</p>`, lang),
    text: `${greet(lang, user.first_name)}\n\n${n === 1 ? T.intro1 : T.introN}\n\n${posts.map((p) => `${p.title}\n${T.by(p.author)}${T.lang[p.lang] || ""}${p.summary ? `\n${p.summary}` : ""}\n${link(p)}`).join("\n\n")}\n\n${T.stop} ${settings}`,
  };
}
/** The push twin of nutritionMail. */
export function nutritionPush(lang, posts) {
  const T = NUT[L(lang)], n = posts.length, p = posts[0];
  return {
    title: n === 1 ? T.one : T.many(n),
    body: n === 1 ? `${p.title} · ${T.by(p.author)}` : posts.slice(0, 3).map((x) => x.title).join(" · "),
    url: n === 1 ? `/#/sante?article=${p.id}` : "/#/sante", tag: n === 1 ? `nutrition-${p.id}` : "nutrition",
  };
}

// « Mes horaires réservés » (owner, 2026-11-03; users.book_mail / book_push, _lib/booking.js tellBookers): a start the
// organisers moved or cancelled, and the reminder the day before. No mail when one books (the page confirms it).
// race: { key, name, date, place }; items: [{ name, circuit, start }] (a moved one: its new start)
const BOOK = {
  fr: { moved: "Horaire de départ modifié", cancelled: "Inscription annulée", reminder: "Vos départs de demain",
    introMoved: (r) => `Les organisateurs de ${r} ont modifié ces horaires de départ :`,
    introCancelled: (r) => `Les organisateurs de ${r} ont annulé ces inscriptions :`,
    introReminder: (r) => `Rappel de vos horaires de départ pour ${r} :`,
    line: (x) => `${x.name} · ${x.circuit} · ${x.start}`, lineCancelled: (x) => `${x.name} · ${x.circuit} (était à ${x.start})`,
    open: "Voir les horaires", why: (s) => `Vous recevez ce message parce que l'alerte « Mes horaires réservés » est cochée dans vos ${s}.`,
    settings: "réglages", stop: "Pour ne plus le recevoir :" },
  en: { moved: "Start time changed", cancelled: "Entry cancelled", reminder: "Your starts tomorrow",
    introMoved: (r) => `The organisers of ${r} changed these start times:`,
    introCancelled: (r) => `The organisers of ${r} cancelled these entries:`,
    introReminder: (r) => `A reminder of your start times for ${r}:`,
    line: (x) => `${x.name} · ${x.circuit} · ${x.start}`, lineCancelled: (x) => `${x.name} · ${x.circuit} (was at ${x.start})`,
    open: "See the start times", why: (s) => `You receive this message because the alert “My booked start times” is ticked in your ${s}.`,
    settings: "settings", stop: "To stop receiving it:" },
  de: { moved: "Startzeit geändert", cancelled: "Anmeldung storniert", reminder: "Deine Starts morgen",
    introMoved: (r) => `Die Veranstalter von ${r} haben diese Startzeiten geändert:`,
    introCancelled: (r) => `Die Veranstalter von ${r} haben diese Anmeldungen storniert:`,
    introReminder: (r) => `Zur Erinnerung deine Startzeiten für ${r}:`,
    line: (x) => `${x.name} · ${x.circuit} · ${x.start}`, lineCancelled: (x) => `${x.name} · ${x.circuit} (war um ${x.start})`,
    open: "Startzeiten ansehen", why: (s) => `Du erhältst diese Nachricht, weil die Benachrichtigung „Meine reservierten Startzeiten“ in deinen ${s} angekreuzt ist.`,
    settings: "Einstellungen", stop: "Um sie nicht mehr zu erhalten:" },
  es: { moved: "Hora de salida modificada", cancelled: "Inscripción anulada", reminder: "Tus salidas de mañana",
    introMoved: (r) => `Los organizadores de ${r} han modificado estas horas de salida:`,
    introCancelled: (r) => `Los organizadores de ${r} han anulado estas inscripciones:`,
    introReminder: (r) => `Recordatorio de tus horas de salida para ${r}:`,
    line: (x) => `${x.name} · ${x.circuit} · ${x.start}`, lineCancelled: (x) => `${x.name} · ${x.circuit} (era a las ${x.start})`,
    open: "Ver las horas de salida", why: (s) => `Recibes este mensaje porque la alerta «Mis horas de salida reservadas» está marcada en tus ${s}.`,
    settings: "ajustes", stop: "Para dejar de recibirlo:" },
};
const bookIntro = (T, kind, r) => (kind === "moved" ? T.introMoved(r) : kind === "cancelled" ? T.introCancelled(r) : T.introReminder(r));
export function bookingMail(env, user, race, items, kind) {
  const lang = L(user.lang), T = BOOK[lang], base = siteUrl(env);
  const link = race.url ? `${base}${race.url}` : `${base}/#/horaire?course=${encodeURIComponent(race.key)}`, settings = `${base}/#/reglages`;
  const title = T[kind] || T.reminder, what = `${race.name} (${longDate(race.date, lang)}${race.place ? `, ${race.place}` : ""})`;
  const line = (x) => (kind === "cancelled" ? (x.start ? T.lineCancelled(x) : `${x.name} · ${x.circuit}`) : T.line(x));
  return {
    subject: `${title}${lang === "fr" ? " : " : ": "}${race.name}`,
    html: wrap(env, title, `<p>${esc(greet(lang, user.first_name))}</p><p>${esc(bookIntro(T, kind, what))}</p>
<ul style="padding-left:20px;margin:0 0 12px">${items.map((x) => `<li style="margin:0 0 4px">${esc(line(x))}</li>`).join("")}</ul>
${button(link, T.open, lang)}<p style="font-size:13px;color:#5b6675">${T.why(a(settings, T.settings))}</p>`, lang),
    text: `${greet(lang, user.first_name)}\n\n${bookIntro(T, kind, what)}\n\n${items.map((x) => `- ${line(x)}`).join("\n")}\n\n${T.open}: ${link}\n\n${T.stop} ${settings}`,
  };
}
/** The push twin of bookingMail. */
export function bookingPush(lang, race, items, kind) {
  const T = BOOK[L(lang)];
  const line = (x) => (kind === "cancelled" ? (x.start ? T.lineCancelled(x) : `${x.name} · ${x.circuit}`) : T.line(x));
  return {
    title: `${T[kind] || T.reminder} · ${race.name}`,
    body: items.slice(0, 4).map(line).join("\n") + (items.length > 4 ? "\n…" : ""),
    url: race.url || `/#/horaire?course=${encodeURIComponent(race.key)}`, tag: `book-${race.key}-${kind}`,
  };
}

// ---- « Orga › Gérer »: a team's news (owner, 2026-11-11), by push only -------------------------------------------------
const EVENT = {
  fr: { request: (w) => `${w} demande à rejoindre l'équipe`, accepted: "Vous faites partie de l'équipe", declined: "Votre demande n'a pas été acceptée",
    approved: "Rattachement au calendrier confirmé", refused: "Rattachement au calendrier refusé" },
  en: { request: (w) => `${w} asks to join the team`, accepted: "You are now on the team", declined: "Your request was not accepted",
    approved: "Calendar link confirmed", refused: "Calendar link refused" },
  de: { request: (w) => `${w} möchte dem Team beitreten`, accepted: "Du bist jetzt im Team", declined: "Deine Anfrage wurde nicht angenommen",
    approved: "Verknüpfung mit dem Kalender bestätigt", refused: "Verknüpfung mit dem Kalender abgelehnt" },
  es: { request: (w) => `${w} pide unirse al equipo`, accepted: "Ya formas parte del equipo", declined: "Tu solicitud no ha sido aceptada",
    approved: "Vínculo con el calendario confirmado", refused: "Vínculo con el calendario rechazado" },
};
/** A push about an event to a member (request, approved, refused) or to the account that asked (accepted, declined). */
export function eventPush(lang, kind, ev, who = "") {
  const T = EVENT[L(lang)], line = T[kind];
  return { title: ev.name, body: typeof line === "function" ? line(who) : line,
    url: `/#/orga?ev=${encodeURIComponent(ev.id)}${kind === "request" ? "&onglet=equipe" : ""}`, tag: `event-${ev.id}-${kind}` };
}

// ---- Live GPS tracking (docs/track/design.md « Alerts », 2026-11-21): a watcher's notifications, push only ---------------
const TRACK = {
  fr: { start: (n) => `${n} a démarré le suivi`, end: (n) => `${n} a terminé`, help: (n) => `${n} demande de l'aide !`,
    silent: (n) => `Plus de position de ${n} depuis 3 minutes`, still: (n) => `${n} est immobile depuis 5 minutes`,
    battery: (n, b) => `Batterie faible pour ${n} (${b} %)`, back: (n) => `${n} est revenu·e au départ`,
    area: (n) => `${n} est sorti·e de la zone`, open: "Ouvrir le suivi" },
  en: { start: (n) => `${n} started tracking`, end: (n) => `${n} has finished`, help: (n) => `${n} is asking for help!`,
    silent: (n) => `No position from ${n} for 3 minutes`, still: (n) => `${n} has not moved for 5 minutes`,
    battery: (n, b) => `Low battery for ${n} (${b}%)`, back: (n) => `${n} is back at the start`,
    area: (n) => `${n} has left the area`, open: "Open the tracking" },
  de: { start: (n) => `${n} hat die Verfolgung gestartet`, end: (n) => `${n} ist fertig`, help: (n) => `${n} bittet um Hilfe!`,
    silent: (n) => `Seit 3 Minuten keine Position von ${n}`, still: (n) => `${n} bewegt sich seit 5 Minuten nicht`,
    battery: (n, b) => `Akku schwach bei ${n} (${b} %)`, back: (n) => `${n} ist zurück am Start`,
    area: (n) => `${n} hat das Gebiet verlassen`, open: "Verfolgung öffnen" },
  es: { start: (n) => `${n} ha iniciado el seguimiento`, end: (n) => `${n} ha terminado`, help: (n) => `¡${n} pide ayuda!`,
    silent: (n) => `Ninguna posición de ${n} desde hace 3 minutos`, still: (n) => `${n} no se mueve desde hace 5 minutos`,
    battery: (n, b) => `Batería baja de ${n} (${b} %)`, back: (n) => `${n} ha vuelto a la salida`,
    area: (n) => `${n} ha salido de la zona`, open: "Abrir el seguimiento" },
};
/** A tracking alert for a watcher: { title, body, url, tag }. `b` the relay's alert ({ bat, … }). */
export function trackPush(lang, kind, name, b, uid) {
  const T = TRACK[L(lang)];
  const line = T[kind] ? T[kind](name, b?.bat ?? "") : name;
  return { title: line, body: T.open, url: `/#/suivi/${uid}`, tag: `trk-${uid}-${kind}`, ...(kind === "help" ? { urgent: true } : {}) };
}
trackPush.KINDS = ["start", "end", "help", "silent", "still", "battery", "back", "area"];

/** A child account taken over by the young person (from 15): the link confirming the address they gave. */
export function takeoverMail(env, token, firstName, lang) {
  const url = `${siteUrl(env)}/#/famille?reprendre=${encodeURIComponent(token)}`;
  const T = pick(lang, {
    fr: { s: "Votre compte Ozimut devient le vôtre", p: "Vous avez demandé à gérer vous-même votre compte Ozimut. Confirmez cette adresse : vous vous connecterez ensuite avec elle et le mot de passe choisi, et vos parents deviendront des personnes qui peuvent vous suivre, ce que vous pourrez changer (lien valable 24 heures).", b: "Confirmer", n: "Si vous n'êtes pas à l'origine de cette demande, ignorez ce message." },
    en: { s: "Your Ozimut account becomes yours", p: "You asked to manage your Ozimut account yourself. Confirm this address: you will then sign in with it and the password you chose, and your parents will become people who may follow you, which you can change (link valid for 24 hours).", b: "Confirm", n: "If you didn't ask for this, ignore this message." },
    de: { s: "Dein Ozimut-Konto wird dein eigenes", p: "Du möchtest dein Ozimut-Konto selbst verwalten. Bestätige diese Adresse: Du meldest dich danach mit ihr und dem gewählten Passwort an, und deine Eltern werden zu Personen, die dich verfolgen dürfen – das kannst du ändern (der Link ist 24 Stunden gültig).", b: "Bestätigen", n: "Falls du das nicht angefordert hast, ignoriere diese Nachricht." },
    es: { s: "Tu cuenta de Ozimut pasa a ser tuya", p: "Has pedido gestionar tú mismo tu cuenta de Ozimut. Confirma esta dirección: después iniciarás sesión con ella y la contraseña elegida, y tus padres pasarán a ser personas que pueden seguirte, lo que podrás cambiar (enlace válido durante 24 horas).", b: "Confirmar", n: "Si no lo has pedido tú, ignora este mensaje." },
  });
  return {
    subject: `${T.s} — Ozimut`,
    html: wrap(env, T.s, `<p>${esc(greet(lang, firstName))}</p><p>${esc(T.p)}</p>${button(url, T.b, lang)}<p style="font-size:13px;color:#5b6675">${esc(T.n)}</p>`, lang),
    text: `${greet(lang, firstName)}\n\n${T.p}\n${url}\n\n${T.n}`,
  };
}
// ---- Club accounts (docs/clubs/design.md §4; functions/api/accounts): the year-end bill a club sends its member, and the
// reminders an organising club sends those who have not paid, both in the club's name (replies to its contact when set)
const money = (c, cur, lang) => {
  const n = (Number(c) || 0) / 100;
  try { return new Intl.NumberFormat(locale(lang), { style: "currency", currency: cur || "EUR", minimumFractionDigits: n % 1 ? 2 : 0 }).format(n); }
  catch (e) { return `${n.toFixed(2)} ${cur || "EUR"}`; }
};
const ibanText = (s) => String(s || "").replace(/(.{4})/g, "$1 ").trim();
const ACC = {
  fr: { c: " : ", billTitle: (s) => `Relevé de fin d'année ${s}`, billInfo: (s) => `Relevé ${s} des inscriptions prises en charge`,
    billIntro: (c, s) => `Voici le relevé des inscriptions que ${c} a prises en charge pour vous en ${s}.`,
    billInfoIntro: (c, s) => `Pour information, voici les inscriptions que ${c} a prises en charge pour vous en ${s}. Vous n'avez rien à régler.`,
    carried: "Pris en charge", repaid: "Déjà remboursé", balance: "Reste à régler", ref: "Référence à indiquer avec le virement",
    holder: "Titulaire du compte", pay: "Merci de régler ce montant au club par virement.", nothing: "Il ne reste rien à régler.",
    attached: "Le relevé est joint en PDF.", see: "Voir mon compte au club", by: (c) => `Message envoyé par Ozimut au nom de ${c}.`,
    remTitle: "Paiement en attente", remIntro: (c, e) => `${c} n'a pas encore reçu le paiement de vos inscriptions à ${e} :`,
    remClub: (c, e, p) => `${c} n'a pas encore reçu le paiement des inscriptions de ${p} à ${e}, prises en charge par votre club :`,
    remAmount: "Montant", remDesk: "Vous pouvez aussi régler sur place, si l'organisateur le permet.", remOpen: "Voir mes inscriptions",
    remSeen: "Si vous avez déjà payé, ne tenez pas compte de ce message : le paiement sera marqué dès que l'organisateur l'aura vu." },
  en: { c: ": ", billTitle: (s) => `Year-end statement ${s}`, billInfo: (s) => `Statement ${s} of the entries paid by your club`,
    billIntro: (c, s) => `Here is the statement of the entries ${c} paid for you in ${s}.`,
    billInfoIntro: (c, s) => `For your information, here are the entries ${c} paid for you in ${s}. You have nothing to pay.`,
    carried: "Paid by the club", repaid: "Already repaid", balance: "Left to pay", ref: "Reference to give with the transfer",
    holder: "Account holder", pay: "Please pay this amount to the club by bank transfer.", nothing: "Nothing is left to pay.",
    attached: "The statement is attached as a PDF.", see: "See my account with the club", by: (c) => `Message sent by Ozimut on behalf of ${c}.`,
    remTitle: "Payment pending", remIntro: (c, e) => `${c} has not yet received the payment for your entries to ${e}:`,
    remClub: (c, e, p) => `${c} has not yet received the payment for the entries of ${p} to ${e}, paid by your club:`,
    remAmount: "Amount", remDesk: "You can also pay on the day, if the organisers allow it.", remOpen: "See my entries",
    remSeen: "If you have already paid, ignore this message: the payment will be marked as soon as the organisers see it." },
  de: { c: ": ", billTitle: (s) => `Jahresabrechnung ${s}`, billInfo: (s) => `Übersicht ${s} der vom Verein übernommenen Anmeldungen`,
    billIntro: (c, s) => `hier ist die Abrechnung der Anmeldungen, die ${c} ${s} für dich übernommen hat.`,
    billInfoIntro: (c, s) => `zur Information die Anmeldungen, die ${c} ${s} für dich übernommen hat. Du musst nichts bezahlen.`,
    carried: "Vom Verein übernommen", repaid: "Bereits erstattet", balance: "Noch zu zahlen", ref: "Verwendungszweck für die Überweisung",
    holder: "Kontoinhaber", pay: "Bitte überweise diesen Betrag an den Verein.", nothing: "Es ist nichts mehr zu zahlen.",
    attached: "Die Abrechnung liegt als PDF bei.", see: "Mein Konto beim Verein ansehen", by: (c) => `Nachricht von Ozimut im Namen von ${c}.`,
    remTitle: "Zahlung ausstehend", remIntro: (c, e) => `${c} hat die Zahlung für deine Anmeldungen zu ${e} noch nicht erhalten:`,
    remClub: (c, e, p) => `${c} hat die Zahlung für die Anmeldungen von ${p} zu ${e}, die dein Verein übernimmt, noch nicht erhalten:`,
    remAmount: "Betrag", remDesk: "Du kannst auch vor Ort bezahlen, wenn der Veranstalter das erlaubt.", remOpen: "Meine Anmeldungen ansehen",
    remSeen: "Falls du schon bezahlt hast, ignoriere diese Nachricht: Die Zahlung wird vermerkt, sobald der Veranstalter sie sieht." },
  es: { c: ": ", billTitle: (s) => `Resumen de fin de año ${s}`, billInfo: (s) => `Resumen ${s} de las inscripciones pagadas por tu club`,
    billIntro: (c, s) => `este es el resumen de las inscripciones que ${c} ha pagado por ti en ${s}.`,
    billInfoIntro: (c, s) => `a título informativo, estas son las inscripciones que ${c} ha pagado por ti en ${s}. No tienes nada que pagar.`,
    carried: "Pagado por el club", repaid: "Ya reembolsado", balance: "Pendiente de pago", ref: "Referencia que indicar en la transferencia",
    holder: "Titular de la cuenta", pay: "Por favor, paga este importe al club por transferencia.", nothing: "No queda nada por pagar.",
    attached: "El resumen va adjunto en PDF.", see: "Ver mi cuenta con el club", by: (c) => `Mensaje enviado por Ozimut en nombre de ${c}.`,
    remTitle: "Pago pendiente", remIntro: (c, e) => `${c} aún no ha recibido el pago de tus inscripciones a ${e}:`,
    remClub: (c, e, p) => `${c} aún no ha recibido el pago de las inscripciones de ${p} a ${e}, que paga tu club:`,
    remAmount: "Importe", remDesk: "También puedes pagar en el lugar, si la organización lo permite.", remOpen: "Ver mis inscripciones",
    remSeen: "Si ya has pagado, no tengas en cuenta este mensaje: el pago se marcará en cuanto la organización lo vea." },
};
const bankHtml = (T, bank) => (bank?.iban ? `<p style="margin:8px 0 0">${esc(T.holder)}${T.c}<b>${esc(bank.holder || "—")}</b><br>IBAN${T.c}<b>${esc(ibanText(bank.iban))}</b>${bank.bic ? `<br>BIC${T.c}<b>${esc(bank.bic)}</b>` : ""}</p>` : "");
const bankText = (T, bank) => (bank?.iban ? `\n${T.holder}${T.c}${bank.holder || "—"}\nIBAN${T.c}${ibanText(bank.iban)}${bank.bic ? `\nBIC${T.c}${bank.bic}` : ""}` : "");
/**
 * The year-end bill (« relevé de fin d'année »): b = { club, season, cur, recover, lines: [{ date, event, runner, amount }], carried,
 * repaid, balance, ref, bank, attached }. Written in the member's language, sent in the club's name.
 */
export function billMail(env, user, b) {
  const lang = L(user.lang), T = ACC[lang], cur = b.cur || "EUR", m = (c) => money(c, cur, lang);
  const title = b.recover ? T.billTitle(b.season) : T.billInfo(b.season);
  const intro = b.recover ? T.billIntro(b.club, b.season) : T.billInfoIntro(b.club, b.season);
  const rows = b.lines.map((x) => `<tr><td style="padding:3px 8px 3px 0;color:#5b6675;white-space:nowrap">${esc(shortDate(x.date, lang))}</td><td style="padding:3px 8px 3px 0">${esc(x.event)}${x.runner ? ` <span style="color:#5b6675">· ${esc(x.runner)}</span>` : ""}</td><td style="padding:3px 0;text-align:right;white-space:nowrap">${esc(m(x.amount))}</td></tr>`).join("");
  const sums = b.recover ? `<p style="margin:12px 0 0">${esc(T.carried)}${T.c}<b>${esc(m(b.carried))}</b><br>${esc(T.repaid)}${T.c}<b>${esc(m(b.repaid))}</b><br>${esc(T.balance)}${T.c}<b>${esc(m(b.balance))}</b></p>`
    : `<p style="margin:12px 0 0">${esc(T.carried)}${T.c}<b>${esc(m(b.carried))}</b></p>`;
  const pay = b.recover ? (b.balance > 0 ? `<p>${esc(T.pay)}</p><p>${esc(T.ref)} : <b style="font-family:monospace;font-size:15px">${esc(b.ref)}</b></p>${bankHtml(T, b.bank)}` : `<p>${esc(T.nothing)}</p>`) : "";
  const link = `${siteUrl(env)}/#/monclub?onglet=comptes`;
  const html = wrap(env, title, `<p>${esc(greet(lang, user.first_name))}</p><p>${esc(intro)}</p>
<table style="border-collapse:collapse;font-size:14px;width:100%">${rows}</table>${sums}${pay}${b.attached ? `<p style="font-size:13px;color:#5b6675">${esc(T.attached)}</p>` : ""}
${button(link, T.see, lang)}<p style="font-size:12px;color:#5b6675">${esc(T.by(b.club))}</p>`, lang);
  const text = `${greet(lang, user.first_name)}\n\n${intro}\n\n${b.lines.map((x) => `- ${shortDate(x.date, lang)} · ${x.event}${x.runner ? ` · ${x.runner}` : ""} · ${m(x.amount)}`).join("\n")}\n\n`
    + (b.recover ? `${T.carried}${T.c}${m(b.carried)}\n${T.repaid}${T.c}${m(b.repaid)}\n${T.balance}${T.c}${m(b.balance)}\n` : `${T.carried}${T.c}${m(b.carried)}\n`)
    + (b.recover && b.balance > 0 ? `\n${T.pay}\n${T.ref}${T.c}${b.ref}${bankText(T, b.bank)}\n` : b.recover ? `\n${T.nothing}\n` : "")
    + `\n${T.see}${T.c}${link}\n\n${T.by(b.club)}`;
  return { subject: `${title} — ${b.club}`, html, text };
}
/**
 * A reminder of a payment the organising club has not seen: r = { club (the organiser), event, date, cur, amount, ref, bank, desk,
 * payerClub? (the runners' club: the message goes to its treasurers), runners: [names] }.
 */
export function payReminderMail(env, user, r) {
  const lang = L(user.lang), T = ACC[lang], m = (c) => money(c, r.cur, lang);
  const what = `${r.event} (${longDate(r.date, lang)})`;
  const intro = r.payerClub ? T.remClub(r.club, what, r.payerClub) : T.remIntro(r.club, what);
  const link = `${siteUrl(env)}${r.payerClub ? "/#/monclub?onglet=comptes" : "/#/mes-inscriptions"}`;
  const html = wrap(env, T.remTitle, `<p>${esc(greet(lang, user.first_name))}</p><p>${esc(intro)}</p>
${r.runners?.length ? `<ul style="padding-left:20px;margin:0 0 12px">${r.runners.slice(0, 40).map((n) => `<li>${esc(n)}</li>`).join("")}</ul>` : ""}
<p>${esc(T.remAmount)}${T.c}<b>${esc(m(r.amount))}</b><br>${esc(T.ref)} : <b style="font-family:monospace;font-size:15px">${esc(r.ref)}</b></p>${bankHtml(T, r.bank)}
${r.desk && !r.payerClub ? `<p style="font-size:13px;color:#5b6675">${esc(T.remDesk)}</p>` : ""}${button(link, T.remOpen, lang)}
<p style="font-size:13px;color:#5b6675">${esc(T.remSeen)}</p><p style="font-size:12px;color:#5b6675">${esc(T.by(r.club))}</p>`, lang);
  const text = `${greet(lang, user.first_name)}\n\n${intro}\n${(r.runners || []).slice(0, 40).map((n) => `- ${n}`).join("\n")}\n\n${T.remAmount}${T.c}${m(r.amount)}\n${T.ref}${T.c}${r.ref}${bankText(T, r.bank)}\n\n`
    + `${r.desk && !r.payerClub ? `${T.remDesk}\n\n` : ""}${T.remOpen}${T.c}${link}\n\n${T.remSeen}\n\n${T.by(r.club)}`;
  return { subject: `${T.remTitle} — ${r.event}`, html, text };
}
/** The push twin of payReminderMail. */
export function payReminderPush(lang, r) {
  const T = ACC[L(lang)];
  return { title: `${T.remTitle} · ${r.event}`, body: `${money(r.amount, r.cur, lang)} · ${r.ref}`,
    url: r.payerClub ? "/#/monclub?onglet=comptes" : "/#/mes-inscriptions", tag: `pay-${r.ref}` };
}

// ---- Billing: clubs -------------------------------------------------------------------------------------------------
// (docs/billing/design.md §6, §10; functions/_lib/invoices.js) Ozimut's own invoices to a club, a league or a federation,
// paid by bank transfer: the invoice issued, its reminder, the payment seen, a federation's or league's agreement. Written
// to a club's officers (managers and treasurers): neutral in every language (no « du »). E-mails only, never a push.
// `b.invoice` is a record of _lib/invoices.js `parsed` (its seller as it was when issued: the IBAN printed is the invoice's).
const CLUBBILL = {
  fr: { c: " : ", plan: "Ozimut Club",
    invTitle: (n) => `Facture ${n}`, invIntro: (club) => `la commande de la formule Ozimut Club pour ${club} est enregistrée. La formule est active dès maintenant ; voici la facture, à régler par virement bancaire.`,
    invOther: (club) => `voici une facture d'Ozimut pour ${club}, à régler par virement bancaire.`,
    number: "Facture", amount: "Montant", due: "À régler avant le", period: "Période", ref: "Référence à indiquer sur le virement", holder: "Bénéficiaire",
    noIban: "Les coordonnées bancaires figurent sur la facture.", open: "Voir la facture et la formule du club",
    pdf: "La facture en PDF se télécharge depuis la page « Mon club › Formule ».",
    remTitle: (n) => `Rappel : facture ${n}`, remIntro: (club, n) => `sauf erreur de notre part, le règlement de la facture ${n} pour ${club} ne nous est pas encore parvenu.`,
    remSeen: "Si le virement est déjà parti, merci de ne pas tenir compte de ce message : le paiement sera enregistré dès sa réception.",
    paidTitle: (n) => `Paiement reçu : facture ${n}`, paidIntro: (club, n) => `le règlement de la facture ${n} pour ${club} est bien arrivé. Merci.`,
    paidUntil: (d) => `La formule Ozimut Club est active jusqu'au ${d}.`, paidOn: "Reçu le",
    agrTitle: "Accord avec Ozimut", agrIntro: (name) => `un accord entre Ozimut et ${name} est en place.`,
    agrClubs: "Chaque club concerné dispose de la formule Ozimut Club.", agrAll: "Chaque club concerné dispose de la formule Ozimut Club, et chaque licencié de la formule Plus.",
    agrUntil: (d) => `L'accord court jusqu'au ${d}.`, agrNoEnd: "L'accord n'a pas de date de fin.", agrOpen: "Ouvrir Ozimut" },
  en: { c: ": ", plan: "Ozimut Club",
    invTitle: (n) => `Invoice ${n}`, invIntro: (club) => `the order of the Ozimut Club plan for ${club} is recorded. The plan is active from now on; here is the invoice, payable by bank transfer.`,
    invOther: (club) => `here is an invoice from Ozimut for ${club}, payable by bank transfer.`,
    number: "Invoice", amount: "Amount", due: "Payable by", period: "Period", ref: "Reference to put on the transfer", holder: "Payee",
    noIban: "The bank details are on the invoice.", open: "See the invoice and the club's plan",
    pdf: "The invoice can be downloaded as a PDF from “My club › Plan”.",
    remTitle: (n) => `Reminder: invoice ${n}`, remIntro: (club, n) => `unless we are mistaken, the payment of invoice ${n} for ${club} has not reached us yet.`,
    remSeen: "If the transfer has already been made, please ignore this message: the payment will be recorded as soon as it arrives.",
    paidTitle: (n) => `Payment received: invoice ${n}`, paidIntro: (club, n) => `the payment of invoice ${n} for ${club} has arrived. Thank you.`,
    paidUntil: (d) => `The Ozimut Club plan is active until ${d}.`, paidOn: "Received on",
    agrTitle: "Agreement with Ozimut", agrIntro: (name) => `an agreement between Ozimut and ${name} is in place.`,
    agrClubs: "Every club concerned has the Ozimut Club plan.", agrAll: "Every club concerned has the Ozimut Club plan, and every member the Plus plan.",
    agrUntil: (d) => `The agreement runs until ${d}.`, agrNoEnd: "The agreement has no end date.", agrOpen: "Open Ozimut" },
  de: { c: ": ", plan: "Ozimut Club",
    invTitle: (n) => `Rechnung ${n}`, invIntro: (club) => `die Bestellung von Ozimut Club für ${club} ist eingegangen. Ozimut Club ist ab sofort aktiv; hier ist die Rechnung, zahlbar per Banküberweisung.`,
    invOther: (club) => `hier ist eine Rechnung von Ozimut für ${club}, zahlbar per Banküberweisung.`,
    number: "Rechnung", amount: "Betrag", due: "Zahlbar bis", period: "Zeitraum", ref: "Verwendungszweck der Überweisung", holder: "Empfänger",
    noIban: "Die Bankverbindung steht auf der Rechnung.", open: "Rechnung und Vereinsangebot ansehen",
    pdf: "Die Rechnung lässt sich unter „Mein Verein › Angebot“ als PDF herunterladen.",
    remTitle: (n) => `Erinnerung: Rechnung ${n}`, remIntro: (club, n) => `wenn wir uns nicht irren, ist die Zahlung der Rechnung ${n} für ${club} noch nicht bei uns eingegangen.`,
    remSeen: "Falls die Überweisung schon unterwegs ist, ist diese Nachricht gegenstandslos: Die Zahlung wird vermerkt, sobald sie eingeht.",
    paidTitle: (n) => `Zahlung erhalten: Rechnung ${n}`, paidIntro: (club, n) => `die Zahlung der Rechnung ${n} für ${club} ist eingegangen. Vielen Dank.`,
    paidUntil: (d) => `Ozimut Club ist bis zum ${d} aktiv.`, paidOn: "Eingegangen am",
    agrTitle: "Vereinbarung mit Ozimut", agrIntro: (name) => `zwischen Ozimut und ${name} besteht eine Vereinbarung.`,
    agrClubs: "Jeder betroffene Verein verfügt über Ozimut Club.", agrAll: "Jeder betroffene Verein verfügt über Ozimut Club, jedes lizenzierte Mitglied über Plus.",
    agrUntil: (d) => `Die Vereinbarung läuft bis zum ${d}.`, agrNoEnd: "Die Vereinbarung hat kein Enddatum.", agrOpen: "Ozimut öffnen" },
  es: { c: ": ", plan: "Ozimut Club",
    invTitle: (n) => `Factura ${n}`, invIntro: (club) => `el pedido de Ozimut Club para ${club} está registrado. Ozimut Club está activo desde ahora; esta es la factura, que se abona por transferencia bancaria.`,
    invOther: (club) => `esta es una factura de Ozimut para ${club}, que se abona por transferencia bancaria.`,
    number: "Factura", amount: "Importe", due: "Fecha límite", period: "Periodo", ref: "Referencia que indicar en la transferencia", holder: "Beneficiario",
    noIban: "Los datos bancarios figuran en la factura.", open: "Ver la factura y el plan del club",
    pdf: "La factura se descarga en PDF desde «Mi club › Plan».",
    remTitle: (n) => `Recordatorio: factura ${n}`, remIntro: (club, n) => `salvo error por nuestra parte, el abono de la factura ${n} para ${club} aún no nos ha llegado.`,
    remSeen: "Si la transferencia ya está hecha, este mensaje no tiene efecto: el abono se anotará en cuanto llegue.",
    paidTitle: (n) => `Abono recibido: factura ${n}`, paidIntro: (club, n) => `el abono de la factura ${n} para ${club} ha llegado. Gracias.`,
    paidUntil: (d) => `Ozimut Club está activo hasta el ${d}.`, paidOn: "Recibido el",
    agrTitle: "Acuerdo con Ozimut", agrIntro: (name) => `hay un acuerdo en vigor entre Ozimut y ${name}.`,
    agrClubs: "Cada club afectado dispone de Ozimut Club.", agrAll: "Cada club afectado dispone de Ozimut Club, y cada federado de Plus.",
    agrUntil: (d) => `El acuerdo dura hasta el ${d}.`, agrNoEnd: "El acuerdo no tiene fecha de fin.", agrOpen: "Abrir Ozimut" },
};
const clubBillLink = (env) => `${siteUrl(env)}/#/monclub?onglet=formule`;
/** The lines every invoice mail shares: number, amount, due day, period, then where to pay. → { html, text } */
function clubBillFacts(T, lang, inv, { pay = true } = {}) {
  const cur = String(inv.currency || "eur").toUpperCase(), s = inv.seller || {};
  const rows = [[T.number, inv.number], [T.amount, money(inv.total, cur, lang)], ...(inv.due_at ? [[T.due, longDate(inv.due_at, lang)]] : []),
    ...(inv.period_from && inv.period_to ? [[T.period, `${shortDate(inv.period_from, lang)} – ${shortDate(inv.period_to, lang)}`]] : [])];
  let html = `<p>${rows.map(([k, v]) => `${esc(k)}${T.c}<b>${esc(v)}</b>`).join("<br>")}</p>`;
  let text = rows.map(([k, v]) => `${k}${T.c}${v}`).join("\n");
  if (pay) {
    html += `<p>${esc(T.ref)}${T.c}<b style="font-family:monospace;font-size:15px">${esc(inv.number)}</b></p>`
      + (s.iban ? `<p style="margin:8px 0 0">${esc(T.holder)}${T.c}<b>${esc(s.name || "Ozimut")}</b><br>IBAN${T.c}<b>${esc(ibanText(s.iban))}</b>${s.bic ? `<br>BIC${T.c}<b>${esc(s.bic)}</b>` : ""}</p>`
        : `<p style="font-size:13px;color:#5b6675">${esc(T.noIban)}</p>`);
    text += `\n\n${T.ref}${T.c}${inv.number}\n` + (s.iban ? `${T.holder}${T.c}${s.name || "Ozimut"}\nIBAN${T.c}${ibanText(s.iban)}${s.bic ? `\nBIC${T.c}${s.bic}` : ""}` : T.noIban);
  }
  return { html, text };
}
/** An invoice issued to a club: b = { club, invoice } (an order of the Club plan when invoice.plan is « club »). */
export function clubInvoiceMail(env, user, b) {
  const lang = L(user.lang), T = CLUBBILL[lang], inv = b.invoice, link = clubBillLink(env);
  const title = T.invTitle(inv.number), intro = inv.plan === "club" ? T.invIntro(b.club) : T.invOther(b.club), f = clubBillFacts(T, lang, inv);
  const html = wrap(env, title, `<p>${esc(greet(lang, user.first_name || user.display_name || ""))}</p><p>${esc(intro)}</p>${f.html}
${button(link, T.open, lang)}<p style="font-size:13px;color:#5b6675">${esc(T.pdf)}</p>`, lang);
  const text = `${greet(lang, user.first_name || user.display_name || "")}\n\n${intro}\n\n${f.text}\n\n${T.open}${T.c}${link}\n\n${T.pdf}`;
  return { subject: `${title} — ${b.club}`, html, text };
}
/** The reminder of an invoice past its due day: b = { club, invoice }. */
export function clubInvoiceReminderMail(env, user, b) {
  const lang = L(user.lang), T = CLUBBILL[lang], inv = b.invoice, link = clubBillLink(env);
  const title = T.remTitle(inv.number), intro = T.remIntro(b.club, inv.number), f = clubBillFacts(T, lang, inv);
  const html = wrap(env, title, `<p>${esc(greet(lang, user.first_name || user.display_name || ""))}</p><p>${esc(intro)}</p>${f.html}
${button(link, T.open, lang)}<p style="font-size:13px;color:#5b6675">${esc(T.remSeen)}</p>`, lang);
  const text = `${greet(lang, user.first_name || user.display_name || "")}\n\n${intro}\n\n${f.text}\n\n${T.open}${T.c}${link}\n\n${T.remSeen}`;
  return { subject: `${title} — ${b.club}`, html, text };
}
/** The transfer was seen: b = { club, invoice (paid), until? (the plan's last day, when the invoice carries one) }. */
export function clubPaidMail(env, user, b) {
  const lang = L(user.lang), T = CLUBBILL[lang], inv = b.invoice, link = clubBillLink(env), until = b.until || (inv.plan ? inv.period_to : null);
  const title = T.paidTitle(inv.number), intro = T.paidIntro(b.club, inv.number), f = clubBillFacts(T, lang, { ...inv, due_at: null }, { pay: false });
  const on = inv.paid_at ? `${T.paidOn}${T.c}${longDate(inv.paid_at, lang)}` : "", plan = until ? T.paidUntil(longDate(until, lang)) : "";
  const html = wrap(env, title, `<p>${esc(greet(lang, user.first_name || user.display_name || ""))}</p><p>${esc(intro)}</p>${f.html}
${on ? `<p>${esc(on)}</p>` : ""}${plan ? `<p>${esc(plan)}</p>` : ""}${button(link, T.open, lang)}`, lang);
  const text = `${greet(lang, user.first_name || user.display_name || "")}\n\n${intro}\n\n${f.text}\n${on ? `${on}\n` : ""}${plan ? `\n${plan}\n` : ""}\n${T.open}${T.c}${link}`;
  return { subject: `${title} — ${b.club}`, html, text };
}
/** A federation's or a league's agreement: b = { name (the federation or league), plan: "fed-clubs" | "fed-all", until (a day or null), note? }. */
export function agreementMail(env, user, b) {
  const lang = L(user.lang), T = CLUBBILL[lang], link = `${siteUrl(env)}/`;
  const intro = T.agrIntro(b.name), what = b.plan === "fed-all" ? T.agrAll : T.agrClubs, end = b.until ? T.agrUntil(longDate(b.until, lang)) : T.agrNoEnd;
  const html = wrap(env, T.agrTitle, `<p>${esc(greet(lang, user.first_name || user.display_name || ""))}</p><p>${esc(intro)}</p><p>${esc(what)}</p><p>${esc(end)}</p>
${b.note ? `<p style="color:#5b6675">${esc(b.note)}</p>` : ""}${button(link, T.agrOpen, lang)}`, lang);
  const text = `${greet(lang, user.first_name || user.display_name || "")}\n\n${intro}\n\n${what}\n${end}\n${b.note ? `\n${b.note}\n` : ""}\n${T.agrOpen}${T.c}${link}`;
  return { subject: `${T.agrTitle} — ${b.name}`, html, text };
}
// =====================================================================================================================
// Billing: individuals (docs/billing/design.md §10; functions/_lib/billing.js, api/billing). E-mails only, never a push;
// account e-mails, sent at once. Each takes the account (its language, first name) and the facts; amounts in cents, dates
// as ISO days or timestamps. Plain wording, nothing pushy: what happened, what happens next, how to undo it.
// =====================================================================================================================
const BN = " ";                         // the French no-break space before « : ; ! ? » and inside guillemets
const billDay = (isoDate, lang) => longDate(String(isoDate || "").slice(0, 10), lang);
const billLinks = (env) => ({ settings: `${siteUrl(env)}/#/reglages?onglet=abonnement`, terms: `${siteUrl(env)}/#/conditions-de-vente` });
/** French typography: a no-break space before « : ; ! ? » and inside guillemets (addresses have no space there). */
const frSpaces = (s) => String(s).replace(/ ([:;!?»])/g, `${BN}$1`).replace(/« /g, `«${BN}`);
/** Paragraphs (plain strings), an optional button [href, label] and small print (plain strings) → { subject, html, text }. */
function billingMailOf(env, user, title, paras, { btn = null, small = [] } = {}) {
  const lang = L(user.lang), hello = greet(lang, user.first_name || user.display_name || "");
  const sp = (s) => (lang === "fr" ? frSpaces(s) : s);
  title = sp(title);
  const body = paras.filter(Boolean).map(sp), fine = small.filter(Boolean).map(sp);
  const html = wrap(env, title, `<p>${esc(hello)}</p>${body.map((p) => `<p>${esc(p)}</p>`).join("")}${btn ? button(btn[0], btn[1], lang) : ""}${fine.map((p) => `<p style="font-size:13px;color:#5b6675">${esc(p)}</p>`).join("")}`, lang);
  const text = `${hello}\n\n${body.join("\n\n")}${btn ? `\n\n${btn[1]}${lang === "fr" ? BN : ""}: ${btn[0]}` : ""}${fine.length ? `\n\n${fine.join("\n\n")}` : ""}\n`;
  return { subject: title, html, text };
}
const BILL_BTN = { fr: "Voir mon abonnement", en: "See my subscription", de: "Mein Abo ansehen", es: "Ver mi suscripción" };
const BILL_KEEP = {
  fr: "Rien de ce que vous avez enregistré n'est supprimé : tout reste lisible, exportable et supprimable ; seuls les ajouts au-delà des limites de la formule gratuite ne sont plus possibles.",
  en: "Nothing you have saved is deleted: everything stays readable, exportable and yours to delete; only additions beyond the free plan's limits are no longer possible.",
  de: "Nichts von dem, was du gespeichert hast, wird gelöscht: Alles bleibt lesbar, exportierbar und löschbar; nur Ergänzungen über die Grenzen des kostenlosen Angebots hinaus sind nicht mehr möglich.",
  es: "Nada de lo que has guardado se borra: todo sigue siendo legible, exportable y eliminable; solo dejan de ser posibles los añadidos por encima de los límites del plan gratuito.",
};

/** The 30-day trial has started: i = { until }. */
export function trialStartMail(env, user, i) {
  const lang = L(user.lang), d = billDay(i.until, lang), K = billLinks(env);
  const T = pick(lang, {
    fr: { title: "Votre essai d'Ozimut Plus a commencé",
      p: [`Votre essai gratuit d'Ozimut Plus court jusqu'au ${d} inclus.`,
        `Aucune carte bancaire ne vous a été demandée${BN}: à cette date, l'essai s'arrête de lui-même et rien n'est prélevé. Votre compte retrouve alors la formule gratuite.`, BILL_KEEP.fr] },
    en: { title: "Your Ozimut Plus trial has started",
      p: [`Your free trial of Ozimut Plus runs until ${d} inclusive.`,
        "No card was asked for: on that date the trial stops by itself and nothing is charged. Your account then goes back to the free plan.", BILL_KEEP.en] },
    de: { title: "Dein Test von Ozimut Plus hat begonnen",
      p: [`Dein kostenloser Test von Ozimut Plus läuft bis einschließlich ${d}.`,
        "Es wurde keine Karte verlangt: An diesem Tag endet der Test von selbst, und es wird nichts abgebucht. Dein Konto kehrt dann zum kostenlosen Angebot zurück.", BILL_KEEP.de] },
    es: { title: "Tu prueba de Ozimut Plus ha empezado",
      p: [`Tu prueba gratuita de Ozimut Plus dura hasta el ${d} inclusive.`,
        "No se te ha pedido ninguna tarjeta: ese día la prueba termina sola y no se cobra nada. Tu cuenta vuelve entonces al plan gratuito.", BILL_KEEP.es] },
  });
  return billingMailOf(env, user, T.title, T.p, { btn: [K.settings, BILL_BTN[lang]] });
}

/** Three days before the trial ends: i = { until, price } (price: billing.js displayPrices; its plus.year in cents). */
export function trialEndMail(env, user, i) {
  const lang = L(user.lang), d = billDay(i.until, lang), K = billLinks(env);
  const ready = i.price?.plus?.ready, amount = ready ? money(i.price.plus.founder ?? i.price.plus.year, String(i.price.currency || "eur").toUpperCase(), lang) : "";
  const T = pick(lang, {
    fr: { title: `Votre essai d'Ozimut Plus se termine le ${d}`,
      p: [`Votre essai d'Ozimut Plus se termine le ${d}.`,
        "Vous n'avez rien à faire : sans abonnement de votre part, l'essai s'arrête ce jour-là, rien n'est prélevé et votre compte retrouve la formule gratuite.".replace(" :", `${BN}:`),
        BILL_KEEP.fr, ready ? `Si vous souhaitez continuer, l'abonnement est de ${amount} par an, depuis Réglages › Abonnement.` : ""] },
    en: { title: `Your Ozimut Plus trial ends on ${d}`,
      p: [`Your Ozimut Plus trial ends on ${d}.`,
        "There is nothing you need to do: unless you subscribe, the trial stops that day, nothing is charged and your account goes back to the free plan.",
        BILL_KEEP.en, ready ? `If you would like to continue, the subscription is ${amount} a year, from Settings › Subscription.` : ""] },
    de: { title: `Dein Test von Ozimut Plus endet am ${d}`,
      p: [`Dein Test von Ozimut Plus endet am ${d}.`,
        "Du musst nichts tun: Ohne ein Abo von dir endet der Test an diesem Tag, es wird nichts abgebucht, und dein Konto kehrt zum kostenlosen Angebot zurück.",
        BILL_KEEP.de, ready ? `Wenn du weitermachen möchtest, kostet das Abo ${amount} pro Jahr, unter Einstellungen › Abo.` : ""] },
    es: { title: `Tu prueba de Ozimut Plus termina el ${d}`,
      p: [`Tu prueba de Ozimut Plus termina el ${d}.`,
        "No tienes que hacer nada: si no te suscribes, la prueba termina ese día, no se cobra nada y tu cuenta vuelve al plan gratuito.",
        BILL_KEEP.es, ready ? `Si quieres continuar, la suscripción cuesta ${amount} al año, desde Ajustes › Suscripción.` : ""] },
  });
  return billingMailOf(env, user, T.title, T.p, { btn: [K.settings, BILL_BTN[lang]] });
}

/** The subscription is paid and active: i = { amount, currency, end, withdrawDays }. States the withdrawal right and the terms. */
export function subscribedMail(env, user, i) {
  const lang = L(user.lang), d = billDay(i.end, lang), K = billLinks(env), n = i.withdrawDays || 14;
  const amount = money(i.amount, String(i.currency || "eur").toUpperCase(), lang);
  const T = pick(lang, {
    fr: { title: "Votre abonnement Ozimut Plus est actif",
      p: [`Merci${BN}: votre abonnement Ozimut Plus est actif. Montant${BN}: ${amount} par an.`,
        `Il se renouvelle le ${d}, sauf résiliation de votre part${BN}; nous vous le rappellerons par e-mail avant cette date.`,
        `Droit de rétractation${BN}: vous disposez de ${n} jours à compter de ce paiement pour vous rétracter, sans donner de motif, depuis Réglages › Abonnement ou en nous écrivant. Comme vous avez demandé que l'abonnement commence tout de suite, le remboursement porte sur la part non utilisée.`,
        `Résilier${BN}: Réglages › Abonnement › Résilier, à tout moment${BN}; l'abonnement court alors jusqu'à la fin de la période payée.`,
        `Votre facture et votre moyen de paiement se trouvent au même endroit.`],
      terms: `Conditions générales de vente${BN}: ${K.terms}` },
    en: { title: "Your Ozimut Plus subscription is active",
      p: [`Thank you: your Ozimut Plus subscription is active. Amount: ${amount} a year.`,
        `It renews on ${d} unless you cancel; we will remind you by e-mail before that date.`,
        `Right of withdrawal: you have ${n} days from this payment to withdraw, without giving a reason, from Settings › Subscription or by writing to us. As you asked for the subscription to start at once, the refund covers the unused share.`,
        "To cancel: Settings › Subscription › Cancel, at any time; the subscription then runs until the end of the period paid for.",
        "Your invoice and your payment method are in the same place."],
      terms: `Terms of sale: ${K.terms}` },
    de: { title: "Dein Abo Ozimut Plus ist aktiv",
      p: [`Danke: Dein Abo Ozimut Plus ist aktiv. Betrag: ${amount} pro Jahr.`,
        `Es verlängert sich am ${d}, sofern du nicht kündigst; wir erinnern dich vorher per E-Mail daran.`,
        `Widerrufsrecht: Du kannst innerhalb von ${n} Tagen ab dieser Zahlung ohne Angabe von Gründen widerrufen, unter Einstellungen › Abo oder indem du uns schreibst. Da du gewünscht hast, dass das Abo sofort beginnt, wird der nicht genutzte Anteil erstattet.`,
        "Kündigen: Einstellungen › Abo › Kündigen, jederzeit; das Abo läuft dann bis zum Ende des bezahlten Zeitraums.",
        "Deine Rechnung und dein Zahlungsmittel findest du an derselben Stelle."],
      terms: `Verkaufsbedingungen: ${K.terms}` },
    es: { title: "Tu suscripción a Ozimut Plus está activa",
      p: [`Gracias: tu suscripción a Ozimut Plus está activa. Importe: ${amount} al año.`,
        `Se renueva el ${d}, salvo que la canceles; te lo recordaremos por correo antes de esa fecha.`,
        `Derecho de desistimiento: dispones de ${n} días desde este pago para desistir, sin dar motivos, desde Ajustes › Suscripción o escribiéndonos. Como pediste que la suscripción empezara de inmediato, el reembolso corresponde a la parte no utilizada.`,
        "Cancelar: Ajustes › Suscripción › Cancelar, en cualquier momento; la suscripción sigue entonces hasta el final del periodo pagado.",
        "Tu factura y tu medio de pago están en el mismo sitio."],
      terms: `Condiciones de venta: ${K.terms}` },
  });
  return billingMailOf(env, user, T.title, T.p, { btn: [K.settings, BILL_BTN[lang]], small: [T.terms] });
}

/** The yearly notice before a renewal (the date, the amount, how to terminate): i = { end, amount, currency }. */
export function renewalNoticeMail(env, user, i) {
  const lang = L(user.lang), d = billDay(i.end, lang), K = billLinks(env);
  const amount = money(i.amount, String(i.currency || "eur").toUpperCase(), lang);
  const T = pick(lang, {
    fr: { title: `Votre abonnement Ozimut Plus se renouvelle le ${d}`,
      p: [`Votre abonnement Ozimut Plus arrive à échéance le ${d}. Sans résiliation de votre part avant cette date, il sera renouvelé pour un an et ${amount} seront prélevés sur votre moyen de paiement.`,
        `Pour ne pas le renouveler${BN}: Réglages › Abonnement › Résilier (trois clics), jusqu'au ${d}. Vous gardez Ozimut Plus jusqu'à cette date.`,
        BILL_KEEP.fr, "Si vous souhaitez continuer, vous n'avez rien à faire."], btn: "Gérer mon abonnement" },
    en: { title: `Your Ozimut Plus subscription renews on ${d}`,
      p: [`Your Ozimut Plus subscription reaches its term on ${d}. Unless you cancel before that date, it will renew for one year and ${amount} will be charged to your payment method.`,
        `To stop it from renewing: Settings › Subscription › Cancel (three clicks), until ${d}. You keep Ozimut Plus until that date.`,
        BILL_KEEP.en, "If you would like to continue, there is nothing you need to do."], btn: "Manage my subscription" },
    de: { title: `Dein Abo Ozimut Plus verlängert sich am ${d}`,
      p: [`Dein Abo Ozimut Plus läuft am ${d} ab. Wenn du nicht vorher kündigst, verlängert es sich um ein Jahr, und ${amount} werden von deinem Zahlungsmittel abgebucht.`,
        `Damit es sich nicht verlängert: Einstellungen › Abo › Kündigen (drei Klicks), bis zum ${d}. Du behältst Ozimut Plus bis zu diesem Tag.`,
        BILL_KEEP.de, "Wenn du weitermachen möchtest, musst du nichts tun."], btn: "Mein Abo verwalten" },
    es: { title: `Tu suscripción a Ozimut Plus se renueva el ${d}`,
      p: [`Tu suscripción a Ozimut Plus vence el ${d}. Si no la cancelas antes de esa fecha, se renovará por un año y se cobrarán ${amount} en tu medio de pago.`,
        `Para que no se renueve: Ajustes › Suscripción › Cancelar (tres clics), hasta el ${d}. Conservas Ozimut Plus hasta esa fecha.`,
        BILL_KEEP.es, "Si quieres continuar, no tienes que hacer nada."], btn: "Gestionar mi suscripción" },
  });
  return billingMailOf(env, user, T.title, T.p, { btn: [K.settings, T.btn] });
}

/** A payment did not go through: i = { amount, currency, next (ISO, Stripe's next try, or null) }. */
export function paymentFailedMail(env, user, i) {
  const lang = L(user.lang), K = billLinks(env), next = i.next ? billDay(i.next, lang) : "";
  const amount = money(i.amount, String(i.currency || "eur").toUpperCase(), lang);
  const T = pick(lang, {
    fr: { title: "Le paiement de votre abonnement Ozimut Plus n'a pas abouti",
      p: [`Le paiement de votre abonnement Ozimut Plus (${amount}) n'a pas abouti. Cela arrive${BN}: une carte expirée, un plafond atteint…`,
        `Vous pouvez mettre à jour votre moyen de paiement depuis Réglages › Abonnement.${next ? ` Un nouvel essai aura lieu le ${next}.` : ""}`,
        "Votre abonnement reste actif pour l'instant. Si le paiement ne peut pas être fait, il prendra fin et votre compte retrouvera la formule gratuite, sans rien perdre de ce que vous avez enregistré."],
      btn: "Mettre à jour mon moyen de paiement" },
    en: { title: "The payment for your Ozimut Plus subscription did not go through",
      p: [`The payment for your Ozimut Plus subscription (${amount}) did not go through. It happens: an expired card, a limit reached…`,
        `You can update your payment method from Settings › Subscription.${next ? ` Another attempt will be made on ${next}.` : ""}`,
        "Your subscription stays active for now. If the payment cannot be made, it will end and your account will go back to the free plan, without losing anything you have saved."],
      btn: "Update my payment method" },
    de: { title: "Die Zahlung für dein Abo Ozimut Plus ist fehlgeschlagen",
      p: [`Die Zahlung für dein Abo Ozimut Plus (${amount}) ist fehlgeschlagen. Das kommt vor: eine abgelaufene Karte, ein erreichtes Limit…`,
        `Du kannst dein Zahlungsmittel unter Einstellungen › Abo aktualisieren.${next ? ` Ein neuer Versuch findet am ${next} statt.` : ""}`,
        "Dein Abo bleibt vorerst aktiv. Wenn die Zahlung nicht möglich ist, endet es, und dein Konto kehrt zum kostenlosen Angebot zurück, ohne dass etwas von dem verloren geht, was du gespeichert hast."],
      btn: "Zahlungsmittel aktualisieren" },
    es: { title: "El pago de tu suscripción a Ozimut Plus no se ha completado",
      p: [`El pago de tu suscripción a Ozimut Plus (${amount}) no se ha completado. A veces pasa: una tarjeta caducada, un límite alcanzado…`,
        `Puedes actualizar tu medio de pago desde Ajustes › Suscripción.${next ? ` Se hará un nuevo intento el ${next}.` : ""}`,
        "Tu suscripción sigue activa por ahora. Si el pago no puede hacerse, terminará y tu cuenta volverá al plan gratuito, sin perder nada de lo que has guardado."],
      btn: "Actualizar mi medio de pago" },
  });
  return billingMailOf(env, user, T.title, T.p, { btn: [K.settings, T.btn] });
}

/** The termination is noted (the subscription runs to its period's end): i = { end }. */
export function cancelledMail(env, user, i) {
  const lang = L(user.lang), d = billDay(i.end, lang), K = billLinks(env);
  const T = pick(lang, {
    fr: { title: "Votre résiliation est enregistrée",
      p: [`Votre abonnement Ozimut Plus ne sera pas renouvelé. Vous en gardez tous les avantages jusqu'au ${d}${BN}; plus rien ne sera prélevé.`,
        `Ensuite, votre compte retrouve la formule gratuite. ${BILL_KEEP.fr}`,
        `Vous avez changé d'avis${BN}? Vous pouvez reprendre l'abonnement depuis Réglages › Abonnement, avant cette date.`] },
    en: { title: "Your cancellation is recorded",
      p: [`Your Ozimut Plus subscription will not renew. You keep all of it until ${d}; nothing more will be charged.`,
        `After that, your account goes back to the free plan. ${BILL_KEEP.en}`,
        "Changed your mind? You can resume the subscription from Settings › Subscription, before that date."] },
    de: { title: "Deine Kündigung ist eingetragen",
      p: [`Dein Abo Ozimut Plus wird nicht verlängert. Du behältst alle Vorteile bis zum ${d}; es wird nichts mehr abgebucht.`,
        `Danach kehrt dein Konto zum kostenlosen Angebot zurück. ${BILL_KEEP.de}`,
        "Hast du es dir anders überlegt? Du kannst das Abo vor diesem Tag unter Einstellungen › Abo fortsetzen."] },
    es: { title: "Tu cancelación está registrada",
      p: [`Tu suscripción a Ozimut Plus no se renovará. Conservas todas sus ventajas hasta el ${d}; no se cobrará nada más.`,
        `Después, tu cuenta vuelve al plan gratuito. ${BILL_KEEP.es}`,
        "¿Has cambiado de idea? Puedes reanudar la suscripción desde Ajustes › Suscripción, antes de esa fecha."] },
  });
  return billingMailOf(env, user, T.title, T.p, { btn: [K.settings, BILL_BTN[lang]] });
}

/** A withdrawal within 14 days: the subscription ended, the unused share refunded: i = { refund (cents), currency }. */
export function withdrawnMail(env, user, i) {
  const lang = L(user.lang), K = billLinks(env), has = Number(i.refund) > 0;
  const amount = money(i.refund, String(i.currency || "eur").toUpperCase(), lang);
  const T = pick(lang, {
    fr: { title: "Votre rétractation est enregistrée",
      p: ["Votre rétractation est enregistrée et votre abonnement Ozimut Plus a pris fin aujourd'hui.",
        has ? `Nous vous remboursons ${amount}, la part non utilisée de votre paiement, sur le moyen de paiement utilisé. Le remboursement apparaît en général sous 5 à 10 jours.` : "",
        `Votre compte retrouve la formule gratuite. ${BILL_KEEP.fr}`] },
    en: { title: "Your withdrawal is recorded",
      p: ["Your withdrawal is recorded and your Ozimut Plus subscription ended today.",
        has ? `We are refunding ${amount}, the unused share of your payment, to the payment method you used. The refund usually shows within 5 to 10 days.` : "",
        `Your account goes back to the free plan. ${BILL_KEEP.en}`] },
    de: { title: "Dein Widerruf ist eingetragen",
      p: ["Dein Widerruf ist eingetragen, und dein Abo Ozimut Plus ist heute beendet worden.",
        has ? `Wir erstatten dir ${amount}, den nicht genutzten Anteil deiner Zahlung, auf das verwendete Zahlungsmittel. Die Erstattung erscheint in der Regel innerhalb von 5 bis 10 Tagen.` : "",
        `Dein Konto kehrt zum kostenlosen Angebot zurück. ${BILL_KEEP.de}`] },
    es: { title: "Tu desistimiento está registrado",
      p: ["Tu desistimiento está registrado y tu suscripción a Ozimut Plus ha terminado hoy.",
        has ? `Te reembolsamos ${amount}, la parte no utilizada de tu pago, en el medio de pago que usaste. El reembolso suele aparecer en un plazo de 5 a 10 días.` : "",
        `Tu cuenta vuelve al plan gratuito. ${BILL_KEEP.es}`] },
  });
  return billingMailOf(env, user, T.title, T.p, { small: [pick(lang, { fr: `Conditions générales de vente${BN}: ${K.terms}`, en: `Terms of sale: ${K.terms}`, de: `Verkaufsbedingungen: ${K.terms}`, es: `Condiciones de venta: ${K.terms}` })] });
}

/** The subscription has ended (its period's end after a termination, or a payment that could not be made): i = { end }. */
export function endedMail(env, user, i) {
  const lang = L(user.lang), K = billLinks(env);
  const T = pick(lang, {
    fr: { title: "Votre abonnement Ozimut Plus a pris fin",
      p: ["Votre abonnement Ozimut Plus a pris fin et votre compte est revenu à la formule gratuite. Plus rien ne sera prélevé.", BILL_KEEP.fr,
        "Vous pouvez vous réabonner quand vous le souhaitez, depuis Réglages › Abonnement."] },
    en: { title: "Your Ozimut Plus subscription has ended",
      p: ["Your Ozimut Plus subscription has ended and your account is back on the free plan. Nothing more will be charged.", BILL_KEEP.en,
        "You can subscribe again whenever you like, from Settings › Subscription."] },
    de: { title: "Dein Abo Ozimut Plus ist beendet",
      p: ["Dein Abo Ozimut Plus ist beendet, und dein Konto nutzt wieder das kostenlose Angebot. Es wird nichts mehr abgebucht.", BILL_KEEP.de,
        "Du kannst jederzeit wieder ein Abo abschließen, unter Einstellungen › Abo."] },
    es: { title: "Tu suscripción a Ozimut Plus ha terminado",
      p: ["Tu suscripción a Ozimut Plus ha terminado y tu cuenta ha vuelto al plan gratuito. No se cobrará nada más.", BILL_KEEP.es,
        "Puedes volver a suscribirte cuando quieras, desde Ajustes › Suscripción."] },
  });
  return billingMailOf(env, user, T.title, T.p, { btn: [K.settings, BILL_BTN[lang]] });
}

/**
 * To an administrator, in their language: what = "dispute" (a payment disputed with the bank) | "webhook" (a Stripe event that
 * could not be applied) | "check" (what the daily check found and repaired); lines: the facts, as they are (ids, states).
 */
export function billingAlertMail(env, lang, what, lines = []) {
  lang = L(lang);
  const link = `${siteUrl(env)}/#/admin?onglet=abonnements`;
  const T = pick(lang, {
    fr: { dispute: ["Abonnements : un paiement est contesté", "Un paiement a été contesté auprès de la banque du client. Stripe attend une réponse dans son tableau de bord, dans le délai qu'il indique."],
      webhook: ["Abonnements : un événement Stripe n'a pas pu être appliqué", "Stripe le renverra de lui-même ; il peut aussi être rejoué depuis l'onglet « Abonnements » de la page d'administration."],
      check: ["Abonnements : le contrôle quotidien a trouvé des écarts", "Le contrôle quotidien a comparé les abonnements de Stripe à ceux du site. Voici ce qui différait ; ce qui pouvait l'être a été corrigé d'après Stripe."],
      open: "Ouvrir l'administration" },
    en: { dispute: ["Subscriptions: a payment is disputed", "A payment was disputed with the customer's bank. Stripe expects an answer in its dashboard, within the time it gives."],
      webhook: ["Subscriptions: a Stripe event could not be applied", "Stripe will send it again by itself; it can also be replayed from the admin page's “Subscriptions” tab."],
      check: ["Subscriptions: the daily check found differences", "The daily check compared Stripe's subscriptions with the site's. This is what differed; what could be was corrected from Stripe."],
      open: "Open the admin page" },
    de: { dispute: ["Abos: Eine Zahlung wird angefochten", "Eine Zahlung wurde bei der Bank des Kunden angefochten. Stripe erwartet in seinem Dashboard eine Antwort innerhalb der dort genannten Frist."],
      webhook: ["Abos: Ein Stripe-Ereignis konnte nicht angewendet werden", "Stripe sendet es von selbst erneut; es kann auch im Tab „Abos“ der Verwaltungsseite erneut abgespielt werden."],
      check: ["Abos: Die tägliche Prüfung hat Abweichungen gefunden", "Die tägliche Prüfung hat die Abos bei Stripe mit denen der Website verglichen. Das war unterschiedlich; was möglich war, wurde nach Stripe korrigiert."],
      open: "Verwaltung öffnen" },
    es: { dispute: ["Suscripciones: se ha impugnado un pago", "Se ha impugnado un pago ante el banco del cliente. Stripe espera una respuesta en su panel, en el plazo que indica."],
      webhook: ["Suscripciones: no se pudo aplicar un evento de Stripe", "Stripe lo reenviará por sí mismo; también puede volver a ejecutarse desde la pestaña «Suscripciones» de la página de administración."],
      check: ["Suscripciones: la comprobación diaria ha encontrado diferencias", "La comprobación diaria ha comparado las suscripciones de Stripe con las del sitio. Esto es lo que difería; lo que se podía se ha corregido según Stripe."],
      open: "Abrir la administración" },
  });
  const [title0, intro0] = T[what] || T.check;
  const title = lang === "fr" ? title0.replace(" :", `${BN}:`) : title0, intro = lang === "fr" ? intro0.replace(/ ;/g, `${BN};`).replace(/« /g, `«${BN}`).replace(/ »/g, `${BN}»`) : intro0;
  const list = (lines || []).map((x) => String(x).slice(0, 300)).slice(0, 40);
  const html = wrap(env, title, `<p>${esc(intro)}</p>${list.length ? `<ul style="padding-left:20px;margin:0 0 12px;font-family:monospace;font-size:13px">${list.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}${button(link, T.open, lang)}`, lang);
  return { subject: title, html, text: `${intro}\n\n${list.map((x) => `- ${x}`).join("\n")}\n\n${T.open}${lang === "fr" ? BN : ""}: ${link}\n` };
}

/**
 * To each administrator (in their language): a France membership waits for them — its licence is not in the index of the
 * licensees with a ranked result (_lib/licencecheck.js). known: the name the index gives that licence, or null; note: the
 * person's word to the administrators, or "".
 */
export function licenceCheckMail(env, user, licence, known, lang, note = "") {
  const url = `${siteUrl(env)}/#/admin`;
  const who = `${user.first_name} ${user.last_name}`;
  const T = pick(lang, {
    fr: { subject: `Licence à vérifier : ${who} — Ozimut`, title: `Licence à vérifier : ${who}`,
      intro: "Une personne demande à rejoindre la France sur Ozimut avec un numéro de licence que l'index des licenciés ne lui associe pas (l'index ne contient que les licenciés ayant couru au moins une course du classement national depuis 2010).",
      note: "Son message :", email: "E-mail", lic: "Licence", known: (n) => `Cette licence est connue sous le nom : ${n}`, unknown: "Cette licence n'est pas dans l'index.",
      ask: "Vérifiez-la (par exemple auprès de la FFCO ou du club), puis acceptez ou refusez la demande sur la page d'administration, onglet « Comptes ».",
      button: "Ouvrir la page d'administration" },
    en: { subject: `Licence to check: ${who} — Ozimut`, title: `Licence to check: ${who}`,
      intro: "Someone asks to join France on Ozimut with a licence number the licensee index does not give them (the index holds only the licensees who have run at least one national-ranking race since 2010).",
      note: "Their message:", email: "Email", lic: "Licence", known: (n) => `This licence is known under the name: ${n}`, unknown: "This licence is not in the index.",
      ask: "Check it (with the FFCO or the club, for instance), then accept or refuse the request on the admin page, « Accounts » tab.",
      button: "Open the admin page" },
    de: { subject: `Lizenz zu prüfen: ${who} — Ozimut`, title: `Lizenz zu prüfen: ${who}`,
      intro: "Jemand möchte auf Ozimut Frankreich beitreten, mit einer Lizenznummer, die der Lizenzindex dieser Person nicht zuordnet (der Index enthält nur die Lizenzierten, die seit 2010 mindestens einen Lauf der nationalen Rangliste gelaufen sind).",
      note: "Die Nachricht:", email: "E-Mail", lic: "Lizenz", known: (n) => `Diese Lizenz ist unter dem Namen bekannt: ${n}`, unknown: "Diese Lizenz steht nicht im Index.",
      ask: "Prüfe sie (zum Beispiel beim FFCO oder beim Verein) und nimm die Anfrage dann auf der Administrationsseite, Reiter « Konten », an oder lehne sie ab.",
      button: "Administrationsseite öffnen" },
    es: { subject: `Licencia por verificar: ${who} — Ozimut`, title: `Licencia por verificar: ${who}`,
      intro: "Alguien pide unirse a Francia en Ozimut con un número de licencia que el índice de licenciados no le asocia (el índice solo contiene a los licenciados que han corrido al menos una carrera de la clasificación nacional desde 2010).",
      note: "Su mensaje:", email: "Correo electrónico", lic: "Licencia", known: (n) => `Esta licencia figura con el nombre: ${n}`, unknown: "Esta licencia no está en el índice.",
      ask: "Verifícala (por ejemplo con la FFCO o con el club) y luego acepta o rechaza la solicitud en la página de administración, pestaña « Cuentas ».",
      button: "Abrir la página de administración" },
  });
  const lines = [`${T.email} : ${user.email}`, `${T.lic} : ${licence}`, known ? T.known(known) : T.unknown]
    .map((l) => (L(lang) === "fr" ? l : l.replace(" : ", ": ")));
  return {
    subject: T.subject,
    html: wrap(env, T.title, `<p>${esc(T.intro)}</p>
<ul>${lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>${note ? `<p><b>${esc(T.note)}</b></p><blockquote style="margin:0 0 12px;padding:8px 12px;border-left:3px solid #d4561a;background:#f7f3ef;white-space:pre-line">${esc(note)}</blockquote>` : ""}<p>${esc(T.ask)}</p>${button(url, T.button, lang)}`, lang),
    text: `${T.intro}

${lines.join("\n")}${note ? `\n\n${T.note}\n${note}` : ""}

${T.ask}
${url}`,
  };
}

/** To the person (in their language): their France membership was checked by an administrator — accepted or not. */
export function licenceDecisionMail(env, user, licence, ok) {
  const lang = user.lang;
  const url = `${siteUrl(env)}/#/reglages?onglet=pays`;
  const T = pick(lang, {
    fr: ok
      ? { subject: "Votre licence est vérifiée — Ozimut", title: "Votre licence est vérifiée",
        body: `Votre licence FFCO ${licence} a été vérifiée : votre compte a désormais accès aux classements, au CN et aux alertes liées à votre licence. Votre page de coureur apparaîtra après votre première course classée.`,
        button: "Ouvrir Ozimut" }
      : { subject: "Votre licence n'a pas pu être vérifiée — Ozimut", title: "Votre licence n'a pas pu être vérifiée",
        body: `Nous n'avons pas pu vérifier la licence FFCO ${licence} sous votre nom. Votre compte reste ouvert, sans l'accès réservé aux licenciés. Vérifiez le numéro dans Réglages › Mes pays, ou répondez à ce message pour nous en dire plus.`,
        button: "Ouvrir Mes pays" },
    en: ok
      ? { subject: "Your licence is checked — Ozimut", title: "Your licence is checked",
        body: `Your FFCO licence ${licence} has been checked: your account now opens the rankings, the CN and the alerts tied to your licence. Your runner page will appear after your first ranked race.`,
        button: "Open Ozimut" }
      : { subject: "Your licence could not be checked — Ozimut", title: "Your licence could not be checked",
        body: `We could not check the FFCO licence ${licence} under your name. Your account stays open, without the access reserved to licensees. Check the number in Settings › My countries, or reply to this message to tell us more.`,
        button: "Open My countries" },
    de: ok
      ? { subject: "Deine Lizenz ist geprüft — Ozimut", title: "Deine Lizenz ist geprüft",
        body: `Deine FFCO-Lizenz ${licence} wurde geprüft: Dein Konto öffnet jetzt die Ranglisten, den CN und die Benachrichtigungen zu deiner Lizenz. Deine Läuferseite erscheint nach deinem ersten gewerteten Lauf.`,
        button: "Ozimut öffnen" }
      : { subject: "Deine Lizenz konnte nicht geprüft werden — Ozimut", title: "Deine Lizenz konnte nicht geprüft werden",
        body: `Wir konnten die FFCO-Lizenz ${licence} unter deinem Namen nicht prüfen. Dein Konto bleibt offen, ohne den Lizenzierten vorbehaltenen Zugang. Prüfe die Nummer unter Einstellungen › Meine Länder, oder antworte auf diese Nachricht, um uns mehr zu sagen.`,
        button: "Meine Länder öffnen" },
    es: ok
      ? { subject: "Tu licencia está verificada — Ozimut", title: "Tu licencia está verificada",
        body: `Tu licencia FFCO ${licence} ha sido verificada: tu cuenta abre ahora las clasificaciones, el CN y las alertas ligadas a tu licencia. Tu página de corredor aparecerá tras tu primera carrera puntuable.`,
        button: "Abrir Ozimut" }
      : { subject: "No se ha podido verificar tu licencia — Ozimut", title: "No se ha podido verificar tu licencia",
        body: `No hemos podido verificar la licencia FFCO ${licence} a tu nombre. Tu cuenta sigue abierta, sin el acceso reservado a los licenciados. Comprueba el número en Ajustes › Mis países, o responde a este mensaje para contarnos más.`,
        button: "Abrir Mis países" },
  });
  const href = ok ? `${siteUrl(env)}/` : url;
  return {
    subject: T.subject,
    html: wrap(env, T.title, `<p>${esc(greet(lang, user.first_name))}</p><p>${esc(T.body)}</p>${button(href, T.button, lang)}`, lang),
    text: `${greet(lang, user.first_name)}

${T.body}

${href}`,
  };
}
