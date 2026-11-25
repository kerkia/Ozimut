// Verkaufsbedingungen auf Deutsch (docs/billing/design.md §9; nur von ./pages.js geladen): eine Übersetzung von terms.fr.js,
// das maßgeblich ist, Artikel für Artikel. Die Angaben zum Verkäufer stammen aus dessen Datensatz (`f(feld)`: das Feld, oder
// ein sichtbares « [noch auszufüllen] »). ENTWURF: vor dem Verkaufsstart von einem Anwalt zu prüfen.

export function body(X) {
  const { site, f, seller: S } = X;
  return `
<p class="bl-draft"><b>Entwurf vom 25. November 2026.</b> Dieser Text ist ein Entwurf: Er muss vor jedem Verkauf von einem Anwalt geprüft werden und ist noch kein Vertrag. Maßgeblich ist die französische Fassung.</p>
<p>Diese Bedingungen gelten für das, was ${site} selbst verkauft: das persönliche Paket „Ozimut Plus“, das Paket „Ozimut Club“ und die Vereinbarungen mit Regionalverbänden oder Verbänden sowie das, was einzeln verkauft wird (eine Veranstaltung, generierte Karten über das Enthaltene hinaus). Meldungen zu Läufen und die Konten der Vereine sind Zahlungen zwischen Personen und Vereinen: ${site} nimmt davon nichts ein, und diese Bedingungen betreffen sie nicht.</p>

<h2>1. Der Verkäufer</h2>
<p>${f("name")}${S.form ? `, ${f("form")}` : ""}${S.capital ? `, Kapital ${f("capital")}` : ""}<br>
Anschrift: ${f("address")}${S.country ? ` (${f("country")})` : ""}<br>
SIREN / SIRET (französische Unternehmensnummer): ${S.siret ? f("siret") : f("siren")}${S.rcs ? ` — RCS ${f("rcs")}` : ""}<br>
E-Mail: ${f("email")}<br>
${S.vatNote ? f("vatNote") : `Umsatzsteuer: ${X.gap}`}</p>

<h2>2. Was verkauft wird</h2>
<p>${site} bleibt kostenlos nutzbar. Die Pakete öffnen weitere Funktionen und höhere Grenzen, beschrieben auf der Seite <a href="#/tarifs">Pakete und Preise</a>; maßgeblich ist, was diese Seite am Tag der Bestellung beschreibt. Kommende Änderungen werden auf der Seite <a href="#/changements">Was sich ändert</a> angekündigt.</p>
<p>Die Preise sind in Euro angegeben. ${S.vatNote ? f("vatNote") + "." : ""}</p>

<h2>Teil A — Privatpersonen: Ozimut Plus</h2>

<h3>3. Die Probezeit</h3>
<p>Ein Konto kann Ozimut Plus ${X.trialDays} Tage lang testen, einmalig, ohne Zahlungsmittel. Am Ende der Probezeit wird nichts abgebucht und nichts passiert: Das Konto kehrt zur kostenlosen Nutzung zurück, außer du schließt ein Abo ab.</p>

<h3>4. Bestellung und Zahlung</h3>
<p>Das Abo läuft jährlich: ${X.plus} pro Jahr zum geltenden Preis, im Voraus für das Jahr bezahlt, per Karte oder SEPA-Lastschrift. Die Zahlung wird von Stripe abgewickelt; ${site} sieht und speichert weder deine Kartennummer noch deine IBAN. Bezahlt wird der bei der Bestellung angezeigte Preis; ein Einführungspreis, wenn er angeboten wird, bleibt bei jeder Verlängerung erhalten, solange das Abo nicht unterbrochen wird.</p>
<p>Du erhältst die Bestellbestätigung per E-Mail, zusammen mit diesen Bedingungen. Deine Rechnungen und dein Zahlungsmittel findest du jederzeit unter Einstellungen › Abo.</p>

<h3>5. Laufzeit und Verlängerung</h3>
<p>Das Abo wird für ein Jahr geschlossen und verlängert sich jedes Jahr um dieselbe Dauer, zum dann für dich geltenden Preis, außer du kündigst vor dem Stichtag. Wir schreiben dir vor jedem Stichtag, frühestens drei Monate und spätestens einen Monat vor der Frist, um dich an Datum, Betrag und die Möglichkeit, nicht zu verlängern, zu erinnern. Wurde dir diese Erinnerung nicht fristgerecht geschickt, kannst du das Abo ab dem Verlängerungsdatum jederzeit kostenfrei beenden.</p>

<h3>6. Widerrufsrecht (14 Tage)</h3>
<p>Als Verbraucher kannst du binnen vierzehn Tagen ab deiner Bestellung ohne Angabe von Gründen widerrufen. So geht es: die Schaltfläche „Widerrufen“ unter Einstellungen › Abo, oder jede eindeutige Erklärung an ${f("email")} — zum Beispiel das am Ende dieser Bedingungen wiedergegebene Formular, das nicht vorgeschrieben ist.</p>
<p>Bei der Bestellung verlangst du ausdrücklich, dass das Abo sofort beginnt. Widerrufst du danach, zahlst du nur den am Tag des Widerrufs bereits abgelaufenen Teil des Jahres; der Rest wird dir über das bei der Bestellung verwendete Zahlungsmittel erstattet, spätestens vierzehn Tage nachdem wir von deiner Entscheidung erfahren haben.</p>

<h3>7. Kündigung</h3>
<p>Du kannst jederzeit kündigen, online und mit drei Klicks: Einstellungen › Abo › „Kündigen“, die Zusammenfassung, dann „Kündigung bestätigen“. Die Kündigung wirkt zum Ende des bereits bezahlten Zeitraums: Das Abo läuft bis dahin und verlängert sich nicht. Der laufende Zeitraum wird nicht erstattet, außer beim Widerruf und in den gesetzlich vorgesehenen Fällen. Bis zum Ende des Zeitraums kannst du deine Entscheidung zurücknehmen („Abo fortsetzen“).</p>
<p>Schlägt eine Verlängerungszahlung fehl, informieren wir dich und lassen dir Zeit, dein Zahlungsmittel zu aktualisieren; andernfalls endet das Abo.</p>

<h3>8. Änderungen von Preis oder Inhalt</h3>
<p>Eine Preisänderung oder eine Änderung, die einem Paket etwas nimmt, wird mindestens zwei Monate im Voraus auf der Seite „Was sich ändert“ und per E-Mail an die Abonnenten angekündigt. Sie gilt für dein Abo erst ab der nächsten Verlängerung, und du kannst vorher kündigen.</p>

<h3>9. Was mit deinen Daten geschieht</h3>
<p>Das Ende eines Pakets oder einer Probezeit löscht nichts. Was du gespeichert hast, bleibt lesbar, exportierbar und löschbar; über die Grenzen der kostenlosen Nutzung hinaus kannst du lediglich nichts mehr hinzufügen. Der Umgang mit deinen personenbezogenen Daten ist in den <a href="#/compte/confidentialite">Regeln der Website</a> beschrieben.</p>

<h3>10. Der Dienst, Gewährleistung, Haftung</h3>
<p>${site} ist ein sorgfältig betriebener Online-Dienst, ohne Garantie, jederzeit verfügbar zu sein; Unterbrechungen für Wartung oder Ausfälle unserer Hoster können vorkommen. ${site} ist kein Sicherheitswerkzeug: Seine Karten, berechneten Routen und Ergebnisse ersetzen weder das Urteil des Veranstalters noch das des Läufers.</p>
<p>Als Verbraucher steht dir die gesetzliche Gewährleistung für digitale Inhalte und Dienstleistungen zu; nichts in diesen Bedingungen schränkt sie ein, ebenso wenig die Rechte, die dir das Recht deines Wohnsitzlandes zwingend gibt.</p>

<h3>11. Beschwerden und Schlichtung</h3>
<p>Eine Frage, eine Beschwerde: ${f("email")} oder die Seite „Schreib uns“. Bist du Verbraucher und haben wir deine schriftliche Beschwerde nicht zu deiner Zufriedenheit beantwortet, kannst du dich kostenlos an die für uns zuständige Verbraucherschlichtungsstelle wenden: ${f("mediator")}${S.mediatorUrl ? ` — ${f("mediatorUrl")}` : ""}.</p>

<h2>Teil B — Vereine, Regionalverbände, Komitees und Verbände: Ozimut Club</h2>

<h3>12. Die Bestellung</h3>
<p>Das Paket Ozimut Club wird unter Mein Verein › Paket bestellt, von einem Verwalter oder Kassier des Vereins, der erklärt, den Verein verpflichten zu dürfen. Vorab kann ein Angebot angefordert werden; es gilt sechzig Tage. Mit der Bestellung wird sofort eine Rechnung ausgestellt, und das Paket beginnt sofort.</p>

<h3>13. Der Preis</h3>
<p>${X.club} pro Jahr${X.clubSmall ? `; ${X.clubSmall} pro Jahr für einen Verein mit höchstens ${X.smallMax} Mitgliedern` : ""}, nach der Mitgliederzahl des Vereins auf ${site} am Tag der Bestellung. ${S.vatNote ? f("vatNote") + "." : ""}</p>

<h3>14. Die Zahlung</h3>
<p>Die Rechnung ist per Banküberweisung zahlbar, dreißig Tage nach ihrem Ausstellungsdatum, unter Angabe ihrer Nummer als Verwendungszweck. Für vorzeitige Zahlung wird kein Skonto gewährt. Für Unternehmer führt jeder Zahlungsverzug von Rechts wegen zu Verzugszinsen in Höhe des Dreifachen des französischen gesetzlichen Zinssatzes sowie zu einer Pauschale für Beitreibungskosten von ${X.indemnity}. Wird die Rechnung bei Fälligkeit nicht bezahlt, kann das Paket bis zur Zahlung ausgesetzt werden.</p>
<p>Eine ausgestellte Rechnung wird nie geändert: Ein Fehler wird durch eine Gutschrift und dann eine neue Rechnung berichtigt. Schreib uns.</p>

<h3>15. Die Laufzeit</h3>
<p>Das Paket läuft ein Jahr ab dem Tag der Bestellung. Es verlängert sich nicht von selbst: Wir erinnern den Verein an das Ende, und er bestellt neu, wenn er möchte. Am Ende des Pakets wird nichts gelöscht, was der Verein gespeichert hat (Artikel 9).</p>

<h3>16. Eine einzelne Veranstaltung</h3>
<p>Ein Verein ohne Paket kann das, was das Paket bringt, für eine einzelne Veranstaltung öffnen. ${X.perEntry ? `Der Preis beträgt ${X.perEntry} pro Gemeldetem, höchstens ${X.eventCap} pro Veranstaltung; ` : ""}die Rechnung wird nach der Veranstaltung nach der Zahl der Gemeldeten erstellt und wie in Artikel 14 bezahlt.</p>

<h3>17. Vereinbarungen mit Regionalverbänden und Verbänden</h3>
<p>Ein Regionalverband, ein Komitee oder ein Verband kann das Paket seinen Vereinen oder seinen Vereinen und deren Lizenzinhabern öffnen, durch eine schriftliche Vereinbarung, die Umfang, Preis und Dauer festlegt. Im Übrigen gelten diese Bedingungen.</p>

<h2>Gemeinsame Bestimmungen</h2>
<h3>18. Anwendbares Recht</h3>
<p>Diese Bedingungen unterliegen französischem Recht. Ein Verbraucher behält den Schutz der zwingenden Vorschriften des Rechts seines Wohnsitzlandes und kann die Gerichte dieses Landes anrufen.</p>

<h2>Anhang — Muster-Widerrufsformular</h2>
<p><i>(Fülle dieses Formular nur aus und sende es zurück, wenn du den Vertrag widerrufen willst.)</i></p>
<div class="bl-form-model">
<p>An ${f("name")}, ${f("address")} — ${f("email")}:</p>
<p>Hiermit widerrufe ich den von mir abgeschlossenen Vertrag über die Erbringung der folgenden Dienstleistung: Abo Ozimut Plus.</p>
<p>Bestellt am: …<br>Name des Verbrauchers: …<br>Anschrift des Verbrauchers: …<br>E-Mail-Adresse des ${site}-Kontos: …<br>Datum: …<br>Unterschrift (nur bei Mitteilung auf Papier): …</p>
</div>`;
}
