// The Documentation's guide to the site, in German (guide.fr.js is the reference: the same structure, the same chapters).
// build(X) receives the page's helpers and returns « Die Website » (the documentation's home) and the guides of Arena, Coach and
// Orga and Carto. A page is named as the German menu names it, with a link.
import APP from "../chrono/doc/app.de.js";

export function build(X) {
  const { html, raw, subTabs, fr = true, admin = false, owner = false, track = false } = X;
  // a page of the site, as the menus name it
  const P = (href, label) => html`<a href="${href}">${label}</a>`;
  // a module's documentation
  const M = (mod, label) => html`<a href="#/documentation?module=${mod}">${label}</a>`;
  // a tab of the module's documentation shown (Orga: « Die Bahnlegung »)
  const D = (tab, label, goto) => html`<a href="#/documentation?onglet=${tab}${goto ? `&voir=${goto}` : ""}" data-tab-link="${tab}"${raw(goto ? ` data-goto="${goto}"` : "")}>${label}</a>`;
  const chapters = (list, CH) => raw(subTabs(list, list[0][0]).s.replace(/<div data-subpanel="([a-z-]+)"( hidden)?><\/div>/g, (m0, k, hid) =>
    `<div data-subpanel="${k}"${hid || ""}>${CH[k]().s}</div>`));
  const slide = (kicker, title, body, id) => html`<section class="mx-slide"${raw(id ? ` id="${id}"` : "")}><p class="mx-kicker">${kicker}</p><h2>${title}</h2>${body}</section>`;
  const list = (items) => html`<ul class="mx-list">${items.filter(Boolean).map((i) => html`<li><span>${i}</span></li>`)}</ul>`;
  // a chapter of Orga's documentation
  const CHAP = (chapter, label) => html`<a href="#/documentation?module=orga&voir=${chapter}" data-tab-link="orga" data-goto="${chapter}">${label}</a>`;
  // the desktop application's own documentation (site/assets/js/chrono/doc/app.*.js, Chrono's own, which the application shows too): a slide a section
  const appDoc = (kicker) => html`<p class="muted" style="margin:0 0 14px">${APP.lede}</p>${APP.sections.map((sec) => slide(kicker, sec.title,
    raw(sec.html.replace(/<table>/g, '<div class="table-wrap"><table class="data compact">').replace(/<\/table>/g, "</table></div>")), `chrono-app-${sec.id}`))}`;

  // what each documentation says under its title
  const LEDE = {
    home: html`Ozimut in wenigen Worten, dann die Dokumentation jedes Moduls: Wähle das, das dich interessiert.`,
    arena: html`Die Wettkämpfe: der Kalender, die Ergebnisse der Veranstalter, die Live-Ergebnisse und die Analyse der Zwischenzeiten.`,
    coach: owner ? html`Trainieren: die Analysen von GPS-Tracks, die Postenbeschreibungen, die Kartensymbole, die Spiele und die MAG.`
      : html`Trainieren: die Analysen von GPS-Tracks, die Spiele und die MAG.`,
    orga: html`Die Veranstaltungen des Ausrichters, jede ein Lauf oder ein Training: die Bahnlegung, die Starts, Live, die Ergebnisse, die Analyse und das Team.`,
    carto: html`OL-Karten im Browser zeichnen und aktualisieren: OCAD- und Mapper-Dateien, offene Daten und LiDAR, Aufnahme im Gelände mit dem Handy, Druck, Teamarbeit.`,
  };

  // ======================================================================================================
  // Die Website: the documentation's home, short
  // ======================================================================================================
  function site() {
    return html`
      ${slide("Die Website", "Die Module und das Konto", html`
        <p>Ozimut hat mehrere Module, Arena, Stats, Coach, Orga und Carto: Die Modulseite, auf der du landest, lässt dich eines davon wählen, und
          die obere Leiste zeigt dann nur dessen Seiten. Das Ozimut-Logo bringt dich jederzeit dorthin zurück. Orga und Carto, die Module der Veranstalter
          und Kartografen, erscheinen nur bei denen, die sie nutzen: Hake sie bei der Registrierung, unter Einstellungen › Module oder unten auf der
          Modulseite an, oder lass sie von selbst kommen – sie erscheinen, sobald du dem Team einer Veranstaltung, einer Bahnlegung oder einer Karte
          beitrittst oder selbst eines beginnst. Arena, Stats und Coach lassen sich unter Einstellungen › Module ausblenden. Ein ausgeblendetes Modul
          öffnet sich weiterhin über einen Link; Orga wird am Computer genutzt, Carto auch am Handy.</p>
        ${list([
          html`<b>Ohne Konto</b> zeigt Ozimut, was öffentlich ist: Arena, Coach außer dem Vergleich mit den anderen Läufern, und in Stats den Läufer, die Rangliste und die
            Läufe aus dem Zeitraum, den der Verband frei veröffentlicht.`,
          html`<b>Ein Konto</b> wird mit einer E-Mail-Adresse und einem Passwort eröffnet, dazu kommen die Länder, in denen du läufst (${P("#/reglages?onglet=pays", "Einstellungen › Meine Länder")}).
            Für Frankreich werden Name und Lizenznummer mit der Liste der Lizenzinhaber abgeglichen: Das öffnet ${fr ? "die Ranglisten und deine Läuferseite" : "die französischen Ranglisten"}.
            Das Konto speichert nur das Nötige; ${P("#/compte/confidentialite", "Website-Regeln und Datenschutz")} sagt, was, wo und wie lange.`,
          html`Unter deinem Namen: die Modulseite, diese Dokumentation, die ${P("#/reglages", "Einstellungen")}, „Kontakt“ und das Abmelden. Seiten, die
            noch in der Testphase sind, tragen den Vermerk „Beta“.`,
        ])}`, "menus")}
      ${slide("Die Website", "Mein Verein", html`
        <p>${P("#/monclub", "Mein Verein")}, unter deinem Namen, versammelt deinen Verein: In Frankreich bist du über deine Lizenz automatisch Mitglied,
          anderswo bittest du um Aufnahme. Dort siehst du seine Mitglieder und ihre Rollen (Verantwortliche, Veranstalter, Kartografen,
          Kassenwarte), seine Veranstaltungen, seine Karten und seine Konten. Ein Vorstandsmitglied wird auf Anfrage Verantwortlicher („Meinen
          Verein verwalten“) und vergibt dann die Rollen.</p>
        ${list([
          html`<b>Was der Verein übernimmt</b>: Jeder Verein wählt, wer die Anmeldungen seiner Mitglieder bezahlt – jeder seine eigenen, der Verein bei
            Meisterschaften, bei allen oder bei denen, die der Kassenwart ankreuzt. Das Meldeformular sagt es dem Läufer.`,
          html`<b>Die Konten</b>: Jedes Mitglied sieht, was der Verein für es bezahlt hat und was noch zu erstatten ist. Der Kassenwart sieht, was
            andere Vereine für ihre Läufer bei den Läufen des Vereins schulden, was der Verein den Veranstaltern schuldet, das Konto jedes Mitglieds
            und seine Jahresabrechnung (PDF, im Namen des Vereins per E-Mail verschickt), die Verrechnung mit den Vereinen, die sie akzeptiert
            haben, und ein Journal zum Herunterladen. Der Kontoauszug wird im Browser gelesen, ohne gesendet zu werden: Überweisungen mit
            Verwendungszweck werden als bezahlt markiert.`,
          html`Keine Zahlung läuft über Ozimut: Überweisungen gehen direkt zwischen Personen und Vereinen; Ozimut sagt nur, wer wem was schuldet.`,
        ])}`, "club")}
      ${slide("Die Website", "Land, Sprache und Farbschema", html`
        ${list([
          html`<b>Das Land</b>, oben, bestimmt die Wettkämpfe, die du siehst: den Kalender von rund dreißig Ländern, jeden Morgen bei ihrem Verband gelesen,
            ihre Ergebnisse und ihre Live-Ergebnisse, offen für alle. Ranglisten gibt es nur dort, wo Ozimut die Ergebnisse des Verbands hat: Frankreich
            (${fr ? "der offizielle CN und " : ""}der Ozimut-Index) und Spanien (der Ozimut-Index).`,
          html`<b>Die Sprache</b> – Deutsch, Englisch, Französisch oder Spanisch – ändert sich auf diesem Gerät und, wenn du angemeldet bist, für das Konto (die E-Mails folgen).`,
          html`<b>Das Farbschema</b>, unter dem Mond: Tag, Lichtung, Wald, Unterholz oder Nacht; standardmäßig hell am Computer, dunkel auf dem Handy.`,
        ])}`, "pays")}
      ${slide("Die Website", "Die Benachrichtigungen", html`
        <p>In den ${P("#/reglages", "Einstellungen")} kommt jede Benachrichtigung per E-Mail, als Push-Mitteilung oder beides: <b>einer meiner Läufe ist online</b>${fr ? "" : " (mit einer französischen Lizenz)"},
          <b>meine Startzeit ist veröffentlicht</b>, <b>ein neuer Lauf in meinen Regionen</b> und <b>der Anmeldeschluss naht</b>. Die
          Push-Mitteilungen werden Gerät für Gerät eingestellt; die Benachrichtigungen per E-Mail werden Konto für Konto freigeschaltet, da die Website nur begrenzt viele E-Mails versenden kann.</p>`, "compte")}
      ${slide("Die Website", "Auf dem Handy", html`
        ${list([
          html`<b>Die App</b>: „App installieren“ im Menü unter deinem Namen (Chrome, Edge, Android); auf dem iPhone Teilen › „Zum Home-Bildschirm“
            – das ist auch der einzige Weg, dort Push-Mitteilungen zu erhalten.`,
          html`<b>Einen Track</b> von der Uhr oder dem Handy an Ozimut <b>teilen</b> öffnet die ${P("#/analyse-solo", "Einzelanalyse")} mit der Datei; nichts
            wird hochgeladen.`,
        ])}`, "telephone")}`;
  }

  // ======================================================================================================
  // Arena
  // ======================================================================================================
  const ARENA = [["competitions", "Die Wettkämpfe"], ["resultats", "Ergebnisse"], ["direct", "Live"], ["analyse", "Analyse"]];
  function arena() {
    return chapters(ARENA, {
      competitions: () => html`
        ${slide("Arena", "Eine Seite, alle Wettkämpfe", html`
          <p>Arena ist eine einzige Seite, die ${P("#/agenda", "Wettkämpfe")} des gewählten Landes: Drei Kästchen wählen die von heute, die kommenden und
            die der letzten 60 Tage. Der Kalender kommt jeden Morgen aus dem Kalender des Verbands – die Läufe, aber auch Trainings, Trainingslager und
            Kurse. Filtern kannst du nach Datum, Disziplin, Region${fr ? ", Département und nach Läufen, die für den CN zählen" : ""}; am Computer zeigt eine Karte,
            wo sie stattfinden.${fr ? " Die Meisterschaften und Nationales der kommenden Saisons kommen außerdem aus dem nationalen Kalender, oft vorläufig, bevor ihr Ausrichter sie in den Terminkalender einträgt: Sie sind als „vorläufig“ markiert, Datum und Ausrichter können sich noch ändern." : ""}</p>
          ${list([
            html`<b>Ein kommender Wettkampf</b> öffnet sich neben der Liste: der Ort und der Weg dorthin, die Ausschreibung, ${fr ? "die Zahl der Anmeldungen pro Bahn, " : ""}der
              Anmeldeschluss und Schaltflächen, wenn es sie gibt – die Startliste${fr ? " (mit dem CN jedes Läufers und dem Rang, den er erwarten lässt)" : ""},
              „Live verfolgen“, das GPS-Tracking.`,
            html`<b>Anmelden</b>: Wenn die Veranstalter die Anmeldungen auf Ozimut geöffnet haben, bietet der Wettkampf „Anmelden“ an. Mit deinem Konto
              meldest du dich selbst, „Meine Läufer“ (Familie, Freunde, mit oder ohne Lizenz) und deine Kinder an; ohne Konto legt das Formular es gleich
              mit an. Der Betrag erscheint vor dem Bestätigen – oder „von deinem Verein übernommen“, wenn dein Verein diesen Lauf bezahlt –, dann der
              Verwendungszweck für die Überweisung und das Konto des Veranstalters. ${P("#/mes-inscriptions", "Meine Anmeldungen")} sammelt sie; die
              Anmeldeliste ist öffentlich, ohne Beträge und Lizenznummern.`,
            html`<b>Ein vergangener Wettkampf</b> öffnet seine Seite: die Ergebnisse als erster Reiter, dann, wenn Zwischenzeiten veröffentlicht sind, jede Ansicht
              ihrer Analyse. „‹ Wettkämpfe“ bringt dich zur Liste zurück, dort, wo du sie verlassen hast.`,
          ])}`)}`,
      resultats: () => html`
        ${slide("Arena", "Die Ergebnisse der Veranstalter", html`
          <p>Die Ergebnisse der letzten 60 Tage erscheinen so, wie die Veranstalter sie veröffentlichen, oft noch am selben Abend, Tage vor dem Verband.
            Ozimut sucht sie selbst mehrmals am Tag, samstags und sonntags abends alle 20 Minuten:</p>
          ${list([
            html`auf den Ergebnis-<b>Plattformen</b>: liveresultat, WinSplits, Helga, O'Live, SPORTident Center, OResults, den MeOSDjango-Websites (darunter Orientation Data);`,
            html`auf der <b>Website des veranstaltenden Vereins</b>: seine Seiten und Dateien (HTML von OE oder MeOS, IOF XML, PDF);`,
            html`in den <b>Uploads</b> der Veranstalter und ihren <b>Live-Übertragungen</b> (siehe die Dokumentation von ${M("orga", "Orga")}).`,
          ])}
          <p>Ein laufender Wettkampf zeigt es an („läuft“), solange Läufer unterwegs sind. Wenn es mehrere Dokumente gibt, zeigt Ozimut das beste:
            das des Veranstalters vor denen der Plattformen, Live-Ergebnisse zuletzt (sie werden danach nicht korrigiert). Die Läufer werden an
            Name und Verein erkannt.</p>`)}
        ${!fr ? "" : html`
        <section class="mx-slide">
          <p class="mx-kicker">Ergebnisse</p>
          <h2>Vorläufige Scores und CN</h2>
          <p>Die Website berechnet vorläufige Scores nach den Regeln jeder Methode, für die erkannten Läufer.</p>
          ${list([
            html`<b>Offiziell</b>: der offizielle CN jedes erkannten Läufers 15 Tage vor dem Lauf und die Regel der FFCO (gewöhnlicher Mittelwert über die schnellsten
              zwei Drittel).`,
            html`<b>Ozimut</b>: das übliche Niveau jedes erkannten Läufers 15 Tage vor dem Lauf, der Ozimut-Bahnwert (der
              Mittelwert von Niveau × Zeit der Schnellsten: 90 % des Felds im Wald, zwei Drittel im Sprint) und der Neuskalierungsfaktor des Tages. Der vorläufige
              Ozimut-Index nach dem Lauf folgt der Regel der Gewichtungsplätze.`,
            html`Nur Listen <b>nach Bahn</b> werden bewertet. Eine Liste nach Kategorie wird Bahn für Bahn bewertet, sobald bekannt ist, welche Kategorien
              auf welcher Bahn liefen (aus den Listen nach Bahn desselben Laufs, der Anmeldeliste der FFCO oder der Ausschreibung). Nicht erkannte
              Läufer bleiben ohne CN.`,
            html`Diese Werte sind vorläufig, bis die FFCO sie veröffentlicht: Die endgültigen Werte können abweichen, wenn Ergebnisse korrigiert
              oder Läufer hinzugefügt werden.`,
          ])}
        </section>`}`,
      direct: () => html`
        ${slide("Arena", "Live", html`
          <p>Am Wettkampftag gibt „Live verfolgen“ die Ergebnisse weiter, die während des Laufs auf liveresultat, O'Live, SPORTident Center, OResults, einer
            MeOSDjango-Website veröffentlicht oder vom Veranstalter aus seiner Zeitmessungssoftware gesendet werden. Ein Wettkampf, bei dem ein Posten
            oder das Ziel in der letzten halben Stunde einen Durchgang registriert hat, ist als „live“ markiert.</p>
          ${list([
            html`<b>Nach Bahn oder nach Kategorie</b>: Rang, Zeit, Rückstand, Startzeit${fr ? ", der CN jedes Läufers und der Rang, den er erwarten lässt, und der Score seiner Zeit" : ""}.
              Ein Läufer, der noch unterwegs ist, hat eine geschätzte Zielzeit anhand seiner Funkposten und der Zeiten der bereits Angekommenen.`,
            html`<b>Verfolgen</b>: „Mein Verein“ (die Läufer deines Vereins, alle Kategorien), „Noch unterwegs“, „Alle Durchgänge“ der letzten 15
              Minuten und die deines Vereins, die das Handy bei jedem Durchgang vibrieren und klingeln lassen können.`,
            html`<b>Neue Durchgänge</b> sind grün (weniger als 3 Minuten), dann gelb (weniger als 9); eine Suche findet einen Läufer oder einen Verein.`,
            html`Sobald eine Zwischenzeit eintrifft, analysiert „Analyse“ den Lauf live.`,
          ])}`)}`,
      analyse: () => html`
        ${slide("Arena", "Analyse", html`
          <p>Wenn Zwischenzeiten veröffentlicht sind, analysiert die Seite eines Laufs sie Bahn für Bahn in mehreren Ansichten: Tabelle, Rückstände,
            Durchgänge, Teilstrecken, Profil, Duell, Gruppen, Selbstständigkeit, Regelmäßigkeit und Bilanz.</p>`)}
        <section class="mx-slide">
          <p class="mx-kicker">Zwischenzeiten</p>
          <h2>Zeitverlust und Fehler</h2>
          ${list([
            html`Auf jeder Teilstrecke zwischen zwei Posten ist der <b>Zeitverlust</b> die Differenz zwischen der Zeit des Läufers und der Zeit, die sein übliches Tempo
              auf diesem Lauf erwarten ließ. Er ist negativ, wenn der Läufer schneller ist als üblich. Die Referenzzeit einer Teilstrecke ist der
              Mittelwert der schnellsten Zeiten (das schnellste Sechstel, ohne den Sieger), und das übliche Tempo die Zeit des Läufers auf den fehlerfrei
              gelaufenen Teilstrecken im Verhältnis zu deren Referenzzeiten: Eine lange Teilstrecke zählt dabei mehr als eine kurze, wie in MeOS.`,
            html`Ein <b>Fehler</b> ist eine Teilstrecke, auf der der Läufer mindestens 20 % der Zeit der Teilstrecke <b>und</b> mindestens 10 Sekunden verloren hat; beide
              Schwellen sind einstellbar. Die Spalten „Verloren“ und „Ohne Zeitverlust“ zählen nur die Fehler.`,
            html`Die <b>Rückstände</b> werden am „Superman“ gemessen, einem gedachten Läufer mit der besten Zeit auf jeder Teilstrecke, unter allen
              Läufern oder unter den verglichenen.`,
            html`Die <b>Gruppen</b> erkennen Läufer, die dieselben Posten im Abstand weniger Sekunden passieren, Posten für Posten.`,
          ])}
        </section>
        <section class="mx-slide">
          <p class="mx-kicker">Zwischenzeiten</p>
          <h2>Durchgänge, Selbstständigkeit, Regelmäßigkeit, Zeitkontrolle</h2>
          ${list([
            html`Das <b>Durchgangsdiagramm</b> zeigt jeden Läufer zu der Uhrzeit, zu der er jeden Posten stempelt (seine Startzeit plus seine kumulierte Zeit):
              Linien, die zusammenlaufen, sind Läufer, die gemeinsam unterwegs sind; eine steilere Linie ist ein Läufer, der andere einholt.`,
            html`<b>Selbstständigkeit</b>, wer wem gefolgt ist: Auf jeder Teilstrecke werden zwei Läufer der Bahn, die denselben Posten im Abstand von weniger als
              20 Sekunden verlassen haben, auf der ganzen Strecke verglichen, wobei für jeden ein gleichmäßiges Tempo zwischen den beiden Posten angenommen wird.
              Weniger als 7 Sekunden auseinander laufen sie zusammen; von 7 bis 20 Sekunden immer weniger. Wer als Zweiter passiert, folgt dem anderen. Der
              Mitläufer-Index ist die hinten gelaufene Zeit minus die vorne gelaufene Zeit, im Verhältnis zur Laufzeit: positiv für einen Mitläufer, negativ
              für einen Hasen. Folgen spart Zeit (der andere liest die Karte und bahnt den Weg), deshalb lohnt es sich, es zu erkennen; beide Schwellen sind
              einstellbar.`,
            html`<b>Regelmäßigkeit</b>: Auf jeder Teilstrecke ist der Leistungsindex die Referenzzeit (der Mittelwert des besten Viertels der Zeiten)
              geteilt durch die Zeit des Läufers, 100 %, wenn er so schnell ist wie die Besten. Die Unregelmäßigkeit ist die Standardabweichung dieser Indizes,
              jede Teilstrecke mit ihrer Referenzzeit gewichtet, im Verhältnis zum mittleren Index des Läufers: Ein regelmäßiger Läufer hält von einer
              Teilstrecke zur nächsten das gleiche Tempo, ein unregelmäßiger wechselt zwischen guten Teilstrecken und Zögern. Die Streuung einer Teilstrecke,
              mit dem Niveau jedes Einzelnen herausgerechnet, zeigt die, auf denen alle geschwankt haben: die tückischen Teilstrecken. Nur Läufer, die mit
              allen Zeiten ins Ziel gekommen sind, zählen.`,
            html`Die <b>Zeitkontrolle</b> prüft die Zwischenzeiten selbst. Eine Teilstrecke mit negativer Zeit am selben Posten bei mindestens zwei
              Läufern verrät eine falsch gestellte Station (die dieses Postens oder des vorherigen): Sie verschiebt alle, die dort stempeln. Eine einzelne
              negative Teilstrecke verrät einen nicht gelöschten Chip, der die Stempel eines früheren Laufs behält. Ein klassierter Läufer ohne einen Posten,
              den die anderen gestempelt haben, hat ihn wohl vor seinem Start gestempelt, und die Software hat diesen Stempel verworfen. Der Veranstalter sieht
              das beim Hochladen seiner Ergebnisse, bevor er sie veröffentlicht; der Leser über den Analysen, und die betroffenen Zellen sind in der Tabelle
              umrandet.`,
          ])}
        </section>`,
    });
  }

  // ======================================================================================================
  // Coach
  // ======================================================================================================
  const COACH = [["carte", "Analyse"], ["solo", "Einzelanalyse"], ["multi", "Mit den anderen vergleichen"], ["cartes", "Meine Karten"], ...(owner ? [["definitions", "Postenbeschreibungen"], ["symboles", "Kartensymbole"]] : []),     // (the accounts named Le Helloco only, auth.owner)
    ["jeux", "Spiele"], ["vma", "MAG"], ["routes", "Berechnete Routen"], ...(track ? [["suivi", "GPS-Verfolgung"]] : [])];     // (every account's since 2026-11-04)
  function coach() {
    return chapters(COACH, {
      carte: () => html`
        ${slide("Coach", "Analyse", html`
          <p>Die ${P("#/analyses", "Analyse")} öffnet mit der Liste der Wettkämpfe und Trainings, deren Veranstalter Karte und Bahnen veröffentlicht hat.</p>
          ${list([
            html`<b>Die Liste</b> lässt sich nach Zeitraum, Land (über der Liste), Art (Wettkämpfe oder Trainings), veranstaltendem Verein und Namen filtern;
              am Computer steht die Karte des Landes daneben, und die Karte des Events erscheint unter der Maus als Vorschaubild.`,
            html`<b>Ein gewähltes Event</b> bietet drei Wege: <b>Mit allen Läufern ansehen</b> (die geteilten Tracks, gemeinsam abgespielt), <b>Meinen Track hinzufügen und
              vergleichen</b> (dein Track kommt zu denen der anderen, mit deinem Einverständnis) oder <b>Meinen Track allein auf dieser Karte analysieren</b> (die
              Solo-Analyse auf der Karte des Veranstalters: Du legst nur deinen Track ab, er platziert sich selbst, und nichts wird gesendet). Einen Track
              hinzuzufügen braucht ein Konto, und der Veranstalter kann jeden der Wege schließen.`,
            html`<b>Eigenes Event hinzufügen</b> öffnet die Solo-Analyse mit deiner Karte und deinem Track, für ein Training oder jeden Ausflug. Stammt der Track
              von einem Lauf mit veröffentlichten Ergebnissen oder von einem Event, dessen Veranstalter die Karte veröffentlicht hat, schlägt die Seite es vor.`,
          ])}`)}`,
      solo: () => html`
        ${slide("Coach", "Einzelanalyse", html`
          <p>Die ${P("#/analyse-solo", "Solo-Analyse")} spielt deinen Lauf mit deinem GPS-Track auf deiner Karte ab. Du erreichst sie über die ${P("#/analyses", "Analyse")}:
            „Eigenes Event hinzufügen“ (ein Training, jeder Ausflug oder ein Wettkampf, dessen Karte du hast: Die Seite bietet seine veröffentlichten Zwischenzeiten
            an, wenn der Track davon stammt), oder die vom Veranstalter veröffentlichte Karte, ohne eigene Karte und ohne Kalibrierung.</p>
          ${list([
            html`<b>Die Dateien</b>: die Karte (Bild, PDF, KMZ oder die OCAD- oder Mapper-Datei selbst), der Track (GPX, FIT oder TCX) und, falls vorhanden,
              die Kalibrierung der Karte (KMZ, Georeferenzierungsdatei) und die Bahnen als IOF XML. Auf dem Handy „Karte fotografieren“.`,
            html`<b>Die Kalibrierung</b> erfolgt automatisch: Die Bahn wird auf der Karte gelesen, der Track darübergelegt; liegt das Lesen daneben, korrigieren es ein paar Klicks.`,
            html`<b>Der Lauf</b> wird dann abgespielt, auf Wunsch im Vollbild, Teilstrecke für Teilstrecke, mit Zeitverlust, Tempo und den Kurven der
              Uhr (Herzfrequenz, Schrittfrequenz, Höhe …).`,
            html`<b>Der Track</b> lässt sich nach Tempo, Herzfrequenz, Höhe, Steigung, Kadenz oder Leistung einfärben (was die Uhr aufgezeichnet hat),
              mit Legende; Anfang und Ende lassen sich abschneiden (Aufwärmen, Rückweg), und <b>ein Bild</b> der Karte mit Track, Titel und Legende
              lässt sich exportieren und auf dem Gerät speichern.`,
            html`<b>Kein GPS-Track?</b> « Meine Route zeichnen »: klicke deine Route auf der Karte, Posten für Posten; die veröffentlichten Zwischenzeiten
              (oder die, die du eingibst, mindestens die Zielzeit) lassen sie laufen wie den Track einer Uhr; « An die Wege anlegen » legt dann jede Teilstrecke auf den nächsten Weg, den die Karte zeigt.
              Eine gezeichnete Route dient nicht zum Vergleich mit den anderen Läufern. <b>📏</b> misst eine Strecke auf der Karte, und
              « Kartenausrichtung » kann die aktuelle Teilstrecke nach oben drehen.`,
          ])}
          <p>Karte und Track werden in deinem Browser gelesen und verlassen ihn nicht; nur die Kalibrierung der Posten wird gespeichert, damit du die Analyse
            so wiederfindest, wie du sie verlassen hast.</p>`)}`,
      multi: () => html`
        ${slide("Coach", "Mit den anderen vergleichen", html`
          <p>„${P("#/analyses", "Mit den anderen vergleichen")}“ zeigt nebeneinander die Tracks aller, die einen Wettkampf oder ein Training gelaufen sind, auf der Karte,
            die der Veranstalter vorbereitet hat (siehe die Dokumentation von ${M("orga", "Orga")}). Wähle den Lauf, füge deinen Track hinzu – er behält nur die
            Positionen und Uhrzeiten – und vergleiche. Du brauchst dafür ein Konto.</p>
          ${list([
            html`<b>Die Wiedergabe</b>, wie bei Livelox: echte Uhrzeit, Massenstart, Warten an den Posten, eine Teilstrecke nach der anderen.`,
            html`<b>Links der Karte</b> zeigt der Reiter „Teilstrecken“ (gleich zu Beginn geöffnet) die Teilstrecken eines Läufers, der Reiter „Analysen“ die Zwischenzeiten (bei einem Wettkampf die veröffentlichten), die Rückstände, die Routenvarianten und
              bei einem Training die Übungen des Veranstalters (Korridor, Kompassstrecke).`,
            html`<b>Der Zugang</b>: alle Konten, die Mitglieder eines Vereins (und seine Gäste, mit dem Code, den ihnen der Veranstalter gibt) oder ein Passwort. Deine eigene Datei zeigt zudem deine Kurven neben der Karte,
              nur für dich.`,
            html`Jeder kann seinen Lauf <b>kommentieren</b> (« Mein Kommentar »), lesbar für alle,
              die die Tracks sehen. Der Veranstalter kann die Analyse <b>für Besucher ohne Konto</b> öffnen: sie sehen nur die Tracks der Läufer, die
              zugestimmt haben. Eine <b>Score-Bahn</b> (Posten in beliebiger Reihenfolge) zeigt die Reihenfolge jedes Läufers.`,
          ])}`)}`,
      cartes: () => html`
        ${slide("Coach", "Meine Karten", html`
          <p>${P("#/mes-cartes", "Meine Karten")} bewahrt deine Karten und die Routen, die du darauf gelaufen bist, auf, wie ein eigenes DOMA: eine Galerie, die
            du nach Titel, Ort oder Jahr durchsuchst, und jede Karte mit ihren eingezeichneten Läufen, jeder in einer Farbe oder nach Tempo. Du brauchst ein Konto.</p>
          ${list([
            html`<b>Einen Lauf hinzufügen</b>: in der Einzelanalyse, sobald der Lauf kalibriert ist, „In Meine Karten speichern“. Aufbewahrt werden die Karte so,
              wie du sie gegeben hast, und die Route so, wie sie gezeichnet ist (Positionen auf der Karte und Zeiten, Posten), nie die GPS-Datei. Dieselbe Karte
              wird nur einmal aufbewahrt: Ein weiterer Lauf darauf kommt hinzu.`,
            html`<b>Importieren</b>: die JPEGs, die QuickRoute exportiert (die DOMA aufbewahrt), die Dateien von Ozimut, einzeln oder in einer ZIP-Datei oder auf
              die Seite gezogen. Der direkte Import aus einem DOMA ist noch nicht freigeschaltet: Sein Knopf schickt dem Ozimut-Team eine fertige Anfrage, ihn
              freizuschalten.`,
            html`<b>Exportieren</b>: Jede Karte wird ein JPEG, das jeder öffnen kann (die Karte mit deinen Routen) und das auch die Originalkarte und die Läufe
              enthält; Ozimut liest es unverändert wieder ein. Mehrere angekreuzte Karten werden zusammen in einer ZIP-Datei exportiert, über einen Link geteilt oder auf einmal gelöscht.`,
            html`<b>Persönliche Daten</b>: Herzfrequenz, Höhe und Schrittfrequenz werden nur aufbewahrt, wenn du das Kästchen ankreuzt (standardmäßig nicht).`,
            html`<b>Teilen</b>: Deine Karten sind privat. Ein Link zu allen deinen Karten oder zu einer zeigt sie jedem, der ihn bekommt, auch ohne Konto, ohne
              die persönlichen Daten; das Löschen des Links beendet das Teilen.`,
          ])}`)}`,
      definitions: () => html`
        ${slide("Coach", "Postenbeschreibungen", html`
          <p>Die ${P("#/definitions", "Postenbeschreibungen")} stellen die IOF-Symbole Spalte für Spalte vor, jedes mit seiner Entsprechung auf der Karte,
            ihre Namen in 23 Sprachen und eine Suche. „Eine Beschreibungszeile lesen“ erklärt ein Beispiel Spalte für Spalte. Zum Üben blendest du
            die Namen aus, errätst die Beschreibung anhand der Karte oder die Karte anhand des Symbols.</p>`)}`,
      symboles: () => html`
        ${slide("Coach", "Kartensymbole", html`
          <p>Die ${P("#/symboles", "Kartensymbole")} sind die vollständige Legende einer Waldkarte (ISOM 2017-2), Farbe für Farbe: jedes Symbol mit
            Nummer, Name und Bedeutung, die nicht zu überquerenden markiert. „Was die Farben sagen“ erklärt, wie gut man je nach Grün laufen kann. Zum Üben
            blendest du die Namen oder die Zeichnungen aus.</p>
          <p>Diese beiden Seiten sind zwei Reiter von ${P("#/apprendre", "Lernen")}, mit einem dritten, „Training“: ein Foto des Geländes und vier
            Postenkreise auf der Karte – welcher liegt auf dem Objekt? Zwanzig Fragen zu zehn Sekunden als Standard; ihre Zahl, ihre Zeit und was die
            Frage zeigt (Foto, Name, Beschreibung) lassen sich einstellen; die vier Ausschnitte jeder Frage sind wie im Quiz gruppiert.</p>`)}`,
      jeux: () => html`
        ${slide("Coach", "Dreizehn Spiele zum Kartenlesen", html`
          <p>Die ${P("#/jeux", "Spiele")} werden auf Karten gespielt, die die Website für jede Runde neu zeichnet – ein Wald mit Relief und Vegetation, eine
            Stadt, ein Labyrinth – und auf ebenso gezeichneten „Fotos“ des Geländes. Nichts wird gesendet; angemeldet kommen deine Spiele in die „Bestenliste“ jedes Spiels (deine 20 besten, die 20 besten aller).</p>
          ${list([
            html`<b>Routenwahl</b>: Schnelle Route (die kürzeste zeichnen), Bahnwahl (20 Sekunden Karte, 5 zum Wählen), Schnellste Gabelung,
              Routenwahl zwischen drei oder vier Routen.`,
            html`<b>Relief und Gelände lesen</b>: Höhenlinien, Bergauf oder bergab?, Gleiche Karten, Finde den Fehler, Trail'O.`,
            html`<b>Gedächtnis</b>: Kartengedächtnis, Fotogedächtnis und das Labyrinth, aus der Ich-Perspektive.`,
            html`<b>Beschreibungen</b>: Welcher Posten?, das Training von „Lernen“ in zwei Stufen – Einsteiger, die Gruppen des Quiz, Fortgeschritten, zufällig gezogene Ausschnitte – (ein Foto des Geländes, der richtige Postenkreis auf der Karte).`,
          ])}`)}`,
      vma: () => html`
        ${slide("Coach", "Die MAG", html`
          <p>Die Seite ${P("#/vma", "MAG")} stellt die Tests vor (im Labor, VAMEVAL, Léger-Boucher, halber Cooper-Test, Cooper-Test, Shuttle-Run, 45-15), berechnet
            die maximale aerobe Geschwindigkeit aus einem halben Cooper-Test (6 Minuten) oder einem Cooper-Test (12 Minuten) – die Bahn im Stadion zählt, ebenso
            die letzte unvollständige Runde –, leitet daraus die Trainingstempi ab und schlägt kostenlose Apps für die Tests vor.</p>`)}`,
      routes: () => html`
        ${slide("Coach · Test", "Die berechneten Routen", html`
          <p>In beiden GPS-Analysen schlägt Ozimut für jede Teilstrecke die schnellsten Routen auf der Karte vor,
            mit Länge, Steigung und geschätzter Zeit – und misst mit demselben Modell die Route, die jeder Läufer genommen hat.
            In der ${P("#/analyse-solo", "Einzelanalyse")} werden alle Teilstrecken berechnet und der Reiter „Routen“ links der Karte führt sie Teilstrecke für Teilstrecke auf (die Einstellungen stehen im Reiter „Routenberechnung“ rechts); in
            „${P("#/analyse-club", "Mit den anderen vergleichen")}“ die angezeigte Teilstrecke, mit der Liste der Läufer. Es ist ein Prototyp: Die Routen folgen
            der Karte so, wie Ozimut sie liest, und dieses Lesen kann sich irren. Die Berechnung startet von selbst; man stoppt sie im Reiter „Routenberechnung“,
            und der Veranstalter einer Analyse kann sie für seine Veranstaltung abschalten.</p>`)}
        ${slide("Coach · Test", "1. Die Karte anhand ihrer Farben lesen", html`
          <p>Die Karte ist ein Bild: Ozimut kennt nur ihre Farben. Jeder Punkt wird eingeordnet: Weiß (gut belaufbarer Wald), Gelb
            (offenes Gelände, mehr oder weniger licht), die drei Grüntöne nach ihrer Intensität, Oliv (Sperrgebiet) und die darübergedruckten „Druckfarben“ –
            Schwarz, Grau, Braun, Blau und das Violett der Bahn.</p>
          ${list([
            html`<b>Zuerst das Papier</b>: Auf einem Foto ist es grau, wärmer oder kälter, in einer Ecke dunkler. Ozimut findet seine Farbe (die hellen, fast
              grauen Punkte), misst sie in Quadraten von etwa fünfzig Metern und bringt sie überall auf Weiß zurück; eine exportierte, schon weiße Karte
              bleibt, wie sie ist. Ein Schatten, heller als das Grau des nackten Felsens, ist kein Fels.`,
            html`<b>Die Nordlinien</b> – lang, gerade, parallel und gleichmäßig verteilt – werden entfernt (in Cyan bei „Gelände wie gelesen anzeigen“):
              Sonst bildeten sie Streifen aus Wasser oder Sumpf quer über die Karte.`,
            html`Eine Druckfarbe ist eine <b>Linie</b> oder eine <b>Fläche</b>, je nach ihrer Dicke, in Metern gemessen: Was übrig bleibt, wenn man die Linien
              unter 7 bis 10 m Breite entfernt (im Sprint 4 bis 5 m), ist eine Fläche. Dickes Schwarz ist ein Gebäude oder eine große Felswand
              (unpassierbar), Dunkelgrau ein Gebäude im Sprint oder nackter Fels im Wald, dickes Braun eine befestigte Fläche, dickes Blau Wasser.`,
            html`<b>Die Wege</b>: Die dünnen schwarzen Linien (oder dunkelgrauen, wie auf einem Scan) bilden ein Netz. Ozimut folgt jeder Linie, ihren beiden
              Enden und ihrer Richtung, und verbindet die Striche eines gestrichelten Wegs Ende an Ende, wenn sie einander über ihre Lücke hinweg
              zugewandt sind. Eine Kette von mindestens 30 m ist ein Weg, einer von drei Arten nach ihren Strichen im Vergleich zu den anderen Wegen der
              Karte: Straße oder Fahrweg (durchgehend und dicker, oder lange dicke Striche), Fußweg, kleiner Pfad (kurze Striche). Punkte, Dreiecke und
              ein kurzer einzelner Strich zählen nicht.`,
            html`<b>Der Aufdruck des Veranstalters</b>: Violett, auf Gelb, Orange oder Grün gedruckt, erscheint auf dem Papier rot. Seine schraffierten
              Flächen sind Sperrgebiete; seine Kreuzbänder entlang eines Weges sind verbotene Wege – man überquert sie, man folgt ihnen nicht; nahe den
              Posten der Bahn (ihre Kreise und Nummern) wird er nicht beachtet. Unpassierbare Mauern und Zäune lassen sich auf einem Foto nicht von einem
              Weg unterscheiden: Ihre kleinen Striche sind zu fein.`,
            html`Die <b>dünnen blauen Linien</b> sind die Bäche und, dicht beieinander, die Sümpfe. Höhenlinien, Bahn, Text und Punkte werden
              entfernt: Jeder Punkt nimmt die Farbe des nächstgelegenen Geländes darunter an.`,
            html`Die Karte wird dann in Zellen von etwa 1,5 m zerlegt, jede mit dem häufigsten Gelände. „Gelände wie gelesen anzeigen“ zeigt diese Zellen
              mit ihrer Legende auf der Karte: das Erste, was du prüfen solltest. Ozimut warnt, wenn das Lesen falsch wirkt (viel nackter Fels oder
              Gebäude im Wald, fast überall ein einziges Gelände, gar kein Weg).`,
          ])}
          <p>Bekannte Grenzen: Das violett schraffierte Sperrgebiet wird mit der Bahn entfernt; dünne unpassierbare Felswände, Mauern und Zäune sind
            schwarze Linien wie die Wege (die Einstellung „Dünne schwarze Linien“ sagt, was sie sind).</p>`)}
        ${slide("Coach · Test", "1b. Besser: die OCAD- oder Mapper-Karte", html`
          <p>Die Datei der Karte selbst – OCAD (.ocd) oder OpenOrienteering Mapper (.omap, .xmap) – beschreibt das Gelände, ohne zu raten: Ozimut liest sie
            in deinem Browser mit der Engine der Bahnlegung und zeichnet jedes Symbol an seiner genauen Stelle.</p>
          ${list([
            html`Die <b>Flächen</b> nach ihrer Füllfarbe (oder Schraffur: blau für einen Sumpf, oliv oder violett für ein Sperrgebiet), Schicht für
              Schicht wie auf der Karte – ein Grün über einem Gelb gewinnt. Die Farbe statt der Nummer, außer wo die Nummer mehr sagt: Vegetation, gehen, gute Sicht (409),
              unpassierbarer Sumpf (307; 309 in ISOM 2000), unpassierbare Vegetation (411 in ISSprOM).`,
            html`Die <b>Linien</b> nach ihrer Nummer, in der Norm der Karte, an ihren Symbolen erkannt (ISOM 2017 und ISSprOM, ISOM 2000 und ISSOM
              2007): Straßen und Fahrwege (501 bis 504), Fußwege (505), kleine Pfade und Schneisen (506 bis 508) sind die drei Arten von Wegen,
              durchgehend, auch wenn die Karte sie gestrichelt zeichnet; unpassierbare Felswände, Mauern und Zäune (201, 515, 518; 201, 521 und 524
              in ISOM 2000) stoppen den Läufer, außer an einem Durchgang (519; 525 in ISOM 2000); passierbare Mauern und Zäune und
              Vegetationsgrenzen sind Leitlinien; die blauen Linien sind Bäche.`,
            html`Die <b>zu überquerenden Linien</b>: Böschungen, Erdwälle und Erosionsrinnen (104 bis 108), passierbare Felswände (202), passierbare
              Mauern und Zäune (513, 514, 516, 517 – in ISOM 2000: 106 bis 110, 203, 519, 520, 522, 523) kosten jeweils eine Überquerungszeit,
              standardmäßig 10 s für einen Läufer mit 6:00 min/km (im Verhältnis zum Tempo), auf die Zeiten der Läufer kalibriert, wenn ihre
              Routen mindestens 5 davon auf 3 Teilstrecken überqueren; wo ein Weg sie quert, nichts. Die Routen umgehen sie also, wenn der Umweg
              weniger kostet.`,
            html`Der <b>langsame Boden</b>: Flächen mit dichtem Blockfeld (209), steinigem Boden (210 langsam laufbar, 211 gehen, 212 schwer
              passierbar) und sandigem Boden (213) bremsen den Läufer zusätzlich zur Vegetation (standardmäßig 70, 40 und 15 % des weißen Waldes);
              ein Blockfeld (208) bremst nicht, wie die ISOM sagt. Steiniger Boden aus einzelnen Punkten, weit unter der Dichte der Norm, zählt
              nicht. Kartenanalysen, die vor dem 10. November 2026 veröffentlicht wurden, haben diese Linien und diesen Boden erst nach einer
              erneuten Veröffentlichung.`,
            html`Höhenlinien, Punktsymbole, Texte und Bahn bleiben unberücksichtigt.`,
          ])}
          <p>In der Einzelanalyse <b>ist</b> eine allein abgelegte OCAD- oder Mapper-Datei die Karte: hier gezeichnet, der Track über ihre
            Georeferenzierung kalibriert. Zusammen mit einem Bild der Karte abgelegt – oder im Feld „Berechnete Routen“ gewählt, in beiden Analysen –
            dient sie den Routen und wird über ihre Georeferenzierung auf das Bild gelegt: Sie muss eine haben und die angezeigte Karte abdecken.</p>
          <p>Eine Analyse, die aus der Bahnlegung veröffentlicht wurde oder deren Bahnen aus einem OCAD-Projekt stammen (Reiter „Analyse“ einer Veranstaltung in Orga), behält, was die OCAD-Karte des Veranstalters über das Gelände sagt: Ihre Routen lesen deren Symbole, ohne dass du
            eine Datei ablegen musst, und die Sperrgebiete und nicht zu überquerenden Grenzen, die der Bahnleger auf der Bahn gezeichnet hat,
            gehören dazu. Nur diese Zeichnung des Geländes wird mit der Bahn gesendet, nie die OCAD-Datei.</p>`)}
        ${slide("Coach · Test", "2. Die Zeit eines Schritts", html`
          <p>Die Zeit von einer Zelle zur benachbarten ist die Distanz, multipliziert mit der Langsamkeit des Geländes und der der Hangneigung:</p>
          ${list([
            html`<b>Das Gelände</b>: seine Geschwindigkeit als Anteil der im weißen Wald – Straße oder Fahrweg 130 %, Fußweg 125 %, kleiner Pfad 110 %, offenes Gelände 110 %, halboffenes
              100 %, die drei Grüntöne 75, 45 und 20 %, Sumpf 65 %, befestigte Fläche 120 %. Wasser, Gebäude, Sperrgebiet (und Grau
              im Sprint) sind unpassierbar. Alles ist unter „Geschwindigkeit nach Gelände“ einstellbar.`,
            html`<b>Die Hangneigung</b>, gelesen aus den Höhenlinien der Karte – vom Kartografen im Gelände aufgenommen –, jede auf ihre Höhe nach dem Relief des IGN (RGE ALTI, in Frankreich) oder den „Terrain Tiles“ anderswo gesetzt, das auch den Raum zwischen ihnen füllt („Relief: nur das Modell“ verzichtet darauf; eine falsch gelesene Linie ergibt eine Stufe): Bergauf kostet jeder
              erstiegene Meter so viel wie 8 m in der Ebene (die Einstellung „1 m Steigung entspricht in der Ebene“); leicht bergab ist man etwas schneller (bis zu 9 %
              bei 15 % Gefälle), steiler bremst man (bei 30 % 29 % langsamer als in der Ebene).`,
            html`Die Schritte gehen in 16 Richtungen (die acht Nachbarn und die Rösselsprünge), womit eine gerade Linie auf 3 % genau nachgebildet wird.`,
          ])}
          <p>Diese Zeit gilt für ein Referenztempo im flachen weißen Wald: standardmäßig 6:00 min/km, oder das eingegebene, oder – wenn nichts eingegeben ist –
            das des Läufers: in der Einzelanalyse der Median, über seine Teilstrecken, seiner echten Zeit geteilt durch die Modellzeit auf seiner eigenen
            Route; in „Mit den anderen vergleichen“ der Median der Läufer auf der Teilstrecke.</p>`)}
        ${slide("Coach · Test", "3. Die Navigationsvorsicht", html`
          <p>Das Kürzeste ist nicht immer das Sicherste: fern von jedem Anhaltspunkt, mitten im Wald, liest man die Karte öfter, wird langsamer, macht
            Fehler. Ozimut nennt <b>Leitlinien</b> die Wege, Bäche, Grenzen zwischen unterschiedlichem Gelände und die Ränder dessen, was aufhält
            (Wasser, Gebäude). Die Vorsicht schlägt auf die Kosten eines Schritts einen Teil seiner Zeit auf, der mit der Entfernung zur nächsten Leitlinie
            wächst, voll bei 50 m:</p>
          <p class="mx-eq">Kosten = Zeit × (1 + Vorsicht × Sichtbarkeit × min(1, Distanz / 50 m))</p>
          <p>Die Sichtbarkeit wiegt 1 im weißen Wald, 1,2 bis 1,4 in den Grüntönen, 0,3 im offenen Gelände, 0 auf einem Weg. Bei 20 % (der
            Standardeinstellung) kostet das Durchqueren eines Waldes ohne Anhaltspunkt bis zu einem Fünftel mehr; bei 0 % läuft man geradeaus wie ein Läufer,
            der sich nie irrt. Die Vorsicht wählt die Route; die angezeigten Zeiten bleiben die des reinen Laufens, ohne sie.</p>`)}
        ${slide("Coach · Test", "4. Die Varianten und die Entscheidungskarte", html`
          <p>Ozimut lässt zwei Bäume kürzester Wege in einer Ellipse um die Teilstrecke wachsen (breit genug, um einen See zu umgehen oder einen Fahrweg
            etwas abseits zu nutzen): einen vom Start, einen vom Posten aus. Ihre Summe in einem Punkt sind die Kosten der besten Route durch diesen Punkt;
            die niedrigste ergibt A, die schnellste, exakt auf dem Raster. Die Wahlmöglichkeiten werden an dieser Summe abgelesen:</p>
          ${list([
            html`die <b>Plateaus</b>: die Abschnitte, in denen beide Bäume übereinstimmen – ein lange verfolgter Weg ist einer;`,
            html`die <b>Täler</b>: entlang von Linien quer zur Teilstrecke, bei jedem Zehntel, ist jede Senke der Summe, von den anderen durch einen Kamm
              getrennt (mindestens 1,5 % der Zeit von A), ein eigener Durchgang – wo kreuzen die guten Routen die Teilstrecke?`,
          ])}
          <p>Ein Vorschlag wird behalten, wenn er nicht mehr kostet als A plus den gewählten Spielraum (standardmäßig 25 %), auf mindestens einem Fünftel
            von den behaltenen Routen abweicht und entweder die Teilstrecke in einem Tal kreuzt, das keine von ihnen nimmt (kein Abschnitt von 30 % seiner
            Länge lässt sich um mehr als 1 % verkürzen), oder auf 30 % abweicht und auf der Hälfte seiner Länge <b>lokal optimal</b> bleibt. Ein Bogen durch
            gleichförmigen Wald ist keine Wahl; der gerade Weg neben einem Fahrweg, ein Umweg über einen Weg oder um ein Grün schon. Jede Route wird
            schließlich in geraden Linien gestrafft, abseits der 16 Richtungen des Rasters, und wie der Track eines Läufers gemessen.</p>
          <p>Die <b>Entscheidungskarte</b> färbt jeden Punkt nach der Zeit, die man verliert, wenn man durch ihn läuft: Dunkelgrün auf einer besten Route,
            dann Hellgrün, Gelb und Orange bis zum Spielraum der Varianten; darüber nichts. Sie zeigt auf einen Blick die Korridore der guten
            Entscheidungen und was es kostet, sie zu verlassen.</p>
          <p>Jede Variante sagt, ob sie gegenüber der Linie zwischen den Posten links, rechts oder geradeaus verläuft.</p>`)}
        ${slide("Coach · Test", "5. Deine Route", html`
          <p>Ein GPS-Track verläuft ein paar Meter neben dem Weg, dem er folgt (der Fehler des GPS und der Kalibrierung): So gemessen ginge er durch
            den Wald und kostete mehr als der Weg. Ozimut legt ihn deshalb auf die Karte: der schnellste Weg des Modells, der innerhalb seiner
            Fehlergrenze bleibt (12 bis 25 m, nach der Kalibrierung), auf dem Weg, wenn der Track ihm folgt. Dann misst es, welcher Anteil dieser Route
            jeder berechneten Route folgt. Folgt sie einer auf mindestens 80 % ihrer Länge, ist das die <b>gewählte Route</b> und ihre Zeit zählt;
            sonst zeigt die Liste den Anteil jeder („A 60 % · B 35 %“) und es zählt die Zeit des aufgelegten Tracks.</p>
          ${list([
            html`<b>Wahl</b>: die Zeit der gewählten Route minus die von Route A – null, wenn du A gewählt hast;`,
            html`<b>Ausführung</b>: deine echte Zeit minus die Zeit der gewählten Route – was das Laufen selbst gekostet hat (Zögern,
              Fehler, Gelände langsamer, als die Karte sagt).`,
          ])}
          <p>Mit dem automatischen Tempo ist die Ausführung im Median null: Sie zeigt, welche Teilstrecken langsamer oder schneller als üblich waren.</p>`)}
        ${slide("Coach · Test", "6. Die Kalibrierung an den gelaufenen Teilstrecken", html`
          <p>Die Standardgeschwindigkeiten sind die eines durchschnittlichen Läufers. Die Teilstrecken, deren Route bekannt ist, sagen, was sie für
            diesen Läufer wert sind: Man weiß, wie viele Meter er auf einem Weg, abseits davon, bergauf gelaufen ist und in welcher Zeit. Ozimut leitet
            daraus drei Zahlen ab (Kästchen „Geschwindigkeiten an den gelaufenen Teilstrecken kalibrieren“, standardmäßig aktiviert):</p>
          ${list([
            html`sein <b>Tempo</b> im flachen, gut belaufbaren Wald;`,
            html`seine <b>Geschwindigkeit auf Wegen</b> im Vergleich zum Wald – nur wenn mindestens zwei Teilstrecken überwiegend auf Wegen und zwei
              überwiegend abseits davon verlaufen;`,
            html`die <b>Kosten der Steigung</b> – nur wenn die Steigung auf mindestens sechs Teilstrecken 4 % der Zeit ausmacht.`,
          ])}
          <p>Mit wenigen Teilstrecken bewegen sich diese Werte kaum: Sie weichen nur von den Standardwerten ab, wenn die Teilstrecken es deutlich
            sagen. Teilstrecken, die über 25 % vom Modell abweichen (ein Fehler, ein Halt, eine falsch gelesene Karte), werden vor einer zweiten
            Anpassung beiseitegelassen: Die Kalibrierung darf die Fehler, die die Ausführung zeigen soll, nicht schlucken. Die Routen werden dann mit
            diesen Geschwindigkeiten neu berechnet: A ist die beste Route <i>für diesen Läufer</i>, die Wahl wird an ihr gemessen, die Ausführung an
            seinen üblichen Geschwindigkeiten. In „Mit den anderen vergleichen“ werden die Geschwindigkeit auf Wegen und die Steigung an der ganzen Gruppe
            kalibriert (jede Teilstrecke jedes Läufers), und jeder behält sein eigenes Tempo.</p>`)}`,
      suivi: () => html`
        <div class="mx-callout"><b>Im Test, nur für Administratoren.</b> Die GPS-Verfolgung wird vorerst nur den Administratoren von Ozimut
          angezeigt. Die Apps für Android, iPhone, Apple Watch und Garmin wurden noch nie auf einem echten Gerät ausprobiert.</div>
        ${slide("Coach", "1. Wozu die GPS-Verfolgung dient", html`
          <p>Die ${P("#/suivi", "GPS-Verfolgung")} dient zweierlei: <b>den eigenen Lauf aufzeichnen</b> ohne GPS-Uhr, mit dem Telefon, und
            <b>einen Läufer live verfolgen</b> — vor allem ein Kind im Wald, das seine Eltern vorankommen sehen und wiederfinden wollen, falls es
            sich verläuft. Dieselbe Spur, eine Position pro Sekunde, dient danach den Analysen.</p>
          ${list([
            html`<b>Verfolgen</b>: die Konten, die du verfolgen darfst — du selbst, deine Kinder, wer es dir erlaubt hat — und ihr laufender Lauf.`,
            html`<b>Meine Spuren</b>: deine aufgezeichneten Läufe und die deiner Kinder, zum Ansehen, Herunterladen oder Öffnen in der Einzelanalyse.`,
            html`<b>Familie und Geräte</b>: die Konten deiner Kinder, die verbundenen Geräte, wer verfolgen darf, die Einstellungen.`,
          ])}`)}
        ${slide("Coach", "2. Womit aufgezeichnet wird", html`
          <p>Eine Webseite kann bei gesperrtem Bildschirm keine Position aufzeichnen. Aufgezeichnet wird daher mit:</p>
          ${list([
            html`<b>der Ozimut-App</b> auf Android oder iPhone: die ganze Website, dazu die Verfolgung. Starten, das Telefon in eine Tasche oder
              ein Armband stecken, zum Beenden den Knopf zwei Sekunden gedrückt halten. Ein Knopf « Ich brauche Hilfe » warnt sofort die
              Verfolgenden;`,
            html`<b>einer Apple Watch</b> mit der Ozimut-App: Sie zeichnet allein auf und sendet allein, wenn sie mobiles Netz hat;`,
            html`<b>einer Garmin-Uhr</b> mit dem Ozimut-Datenfeld, auf dem Bildschirm einer Laufaktivität: Es sendet über das per Bluetooth
              verbundene Telefon (eine Garmin gibt Apps keinen mobilen Zugang);`,
            html`<b>Traccar Client</b>, einer kostenlosen App, um es ohne die Ozimut-App auszuprobieren.`,
          ])}
          <p>Mach vor dem ersten Lauf den <b>Zwei-Minuten-Test</b> der App: Bei gesperrtem Bildschirm prüft er, ob das Telefon richtig
            aufzeichnet. Bei manchen Android-Telefonen muss die App in den Akku-Einstellungen im Hintergrund laufen dürfen; der Test sagt es
            und öffnet den richtigen Bildschirm.</p>`)}
        ${slide("Coach", "3. Ein Gerät verbinden", html`
          <p>Ein Gerät gehört immer zu einem Konto: Ohne Konto wird nichts aufgezeichnet. Unter « Familie und Geräte »:</p>
          ${list([
            html`<b>ein Telefon</b>: « Ein Telefon verbinden » zeigt einen QR-Code; scanne ihn mit der Ozimut-App des Telefons (oder tippe
              seine 8 Zeichen ein). Der Code gilt einmal und 15 Minuten lang. In der App selbst genügt « Dieses Telefon verbinden »;`,
            html`<b>eine Uhr</b>: Die Uhr zeigt einen Code mit 6 Zeichen; tippe ihn unter « Eine Uhr verbinden » ein. Eine Apple Watch kann
              auch über das zugehörige iPhone verbunden werden;`,
            html`<b>Traccar Client</b>: « Traccar Client » gibt eine Adresse und einen QR-Code, die die App einrichten.`,
          ])}
          <p>« Entfernen » stoppt ein Gerät sofort: Es kann keine Positionen mehr senden.</p>`)}
        ${slide("Coach", "4. Konten von Kindern", html`
          <p>Ein Kind hat ein eigenes Konto, das seine Eltern verwalten: ohne E-Mail-Adresse und ohne Passwort. « Konto für ein Kind anlegen »
            fragt nach Vorname, Nachname und Geburtsjahr. Danach wird auf dem Telefon des Kindes das Telefon mit seinem Konto verbunden; die App
            kann sich direkt in der Verfolgung öffnen (« Nur-Verfolgung »).</p>
          ${list([
            html`<b>Ein zweiter Elternteil</b>: « Den anderen Elternteil einladen » gibt einen Link; mit dem eigenen Konto geöffnet, verwaltet
              er das Kind gleichberechtigt.`,
            html`<b>Wer verfolgen darf</b>: Jede Person hat ihre eigene Liste. Unter dem Namen des Kindes gibt « Jemanden einladen, … zu verfolgen » einen Einladungslink, 7 Tage und einmal gültig; die Person
              öffnet ihn mit ihrem Ozimut-Konto. Niemand verfolgt ohne Einladung, und ein Verfolgender kann jederzeit entfernt werden.`,
            html`<b>Die Einstellungen</b>: wie oft gesendet wird, wenn jemand zuschaut (standardmäßig alle 30 s), die längste Verfolgung, die
              Nummer, die der Hilfe-Bildschirm anruft, und ein Gebiet: Verlässt das Kind es, geht eine Warnung raus.`,
          ])}
          <p>Sobald die Verfolgung für alle offen ist, kann niemand unter 15 allein ein Konto anlegen: Ein Elternteil legt es an. Ab 15 kann
            der junge Mensch sein Konto selbst übernehmen (« Mein Konto selbst verwalten »); seine Spuren bleiben seine, und seine Eltern
            werden zu Personen, die ihn verfolgen dürfen.</p>`)}
        ${slide("Coach", "5. Live verfolgen", html`
          <p>Ein Klick auf ein Konto unter « Verfolgen » öffnet seinen Lauf auf einer Grundkarte (OpenStreetMap, nie die OL-Karte): die Spur,
            den Punkt des Läufers und die Genauigkeit seiner Position, die Dauer, die Strecke, den Akku.</p>
          ${list([
            html`<b>Die Verzögerung</b>: Das Telefon sendet seine Positionen in Paketen (alle 30 s, wenn jemand zuschaut, sonst alle
              2 Minuten: Der Akku hält länger). Die Seite spielt den Lauf daher etwa 40 s verzögert ab, flüssig und ohne Sprünge.`,
            html`<b>Die Warnungen</b> erreichen die Verfolgenden als Benachrichtigung: Start, Ziel, Hilferuf, seit 3 Minuten keine Position,
              seit 5 Minuten keine Bewegung, Akku schwach, zurück am Start, Gebiet verlassen.`,
            html`<b>Diese Verfolgung beenden</b>: Ein Elternteil kann die Aufzeichnung aus der Ferne stoppen; das Gerät hört bei seiner nächsten
              Sendung auf.`,
          ])}`)}
        ${slide("Coach", "6. Meine Spuren", html`
          <p>Jeder aufgezeichnete Lauf wird 30 Tage behalten; die in einer Analyse geöffneten so lange, wie du sie behältst. Für jeden: ansehen,
            als GPX herunterladen, in der ${P("#/analyse-solo", "Einzelanalyse")} öffnen, umbenennen, löschen.</p>
          ${list([
            html`<b>Importieren</b>: eine GPX-, FIT- oder TCX-Datei;`,
            html`<b>Aus Health importieren</b> (in der iPhone-App): die Trainings einer Apple Watch oder einer anderen Uhr, die ihre Route in
              Health schreibt;`,
            html`<b>Polar verbinden</b>: Jedes Training einer Polar-Uhr kommt von selbst in « Meine Spuren ».`,
          ])}
          <p>Eine importierte Spur bleibt privat. Einen aufgezeichneten Lauf sehen nur die Personen, die du eingeladen hast, oder niemand, wenn
            er als privat markiert ist.</p>`)}`,
    });
  }

  // ======================================================================================================
  // Orga (« Die Bahnlegung », its other tab, is content/methods.*.js' tracerDoc)
  // ======================================================================================================
  const ORGA = [["qui", "Meine Veranstaltungen"], ["evenement", "Eine Veranstaltung anlegen"], ["trace", "Bahnlegung"], ["horaires", "Anmeldungen und Starts"],
    ["direct", "Live"], ["resultats", "Ergebnisse"], ["analyses", "Analyse"],
    // Chrono, the race timing: its tab is the administrators' only for now (pages/manage.js), and so are its chapters
    ...(admin ? [["chrono", "Chrono"], ["chrono-app", "Die Chrono-Anwendung"]] : []), ["equipe", "Das Team"]];
  function orga() {
    return chapters(ORGA, {
      qui: () => html`
        ${slide("Orga", "Deine Veranstaltungen", html`
          <p>Orga ist für Vereine, die veranstalten; es erscheint, sobald du dem Team einer Veranstaltung beitrittst oder eine anlegst, oder wenn du es
            anhakst, und wird am Computer genutzt. Es ist eine einzige Seite, ${P("#/orga", "Meine Veranstaltungen")}: deine vergangenen, heutigen und kommenden Veranstaltungen –
            jede ein Lauf oder ein Training –, jede mit den Werkzeugen des Veranstalters, in Reitern je nach ihrer Art:</p>
          ${list([
            html`<b>Wettkampf</b> (Einzel oder Score) und <b>Öffentliches Training</b> — offen für alle, oft kostenpflichtig und mit
              Zeitnahme, außerhalb der Ranglisten: Bahnlegung, Anmeldungen und Starts, Live, Ergebnisse, Analyse, Team.`,
            html`<b>Staffelwettkampf</b>: Bahnlegung, Live, Analyse, Team (Ergebnisse und Startliste einer Staffel lassen sich noch nicht hochladen).`,
            html`<b>Vereinstraining</b>: Bahnlegung, Analyse, Team.`,
          ])}
          <p>Eine Veranstaltung öffnet sich auf dem Reiter, der zu ihrem Tag passt: Anmeldungen und Starts vor dem Lauf, Live am Tag selbst, danach Ergebnisse; ein
            Training vor seinem Datum auf seiner Bahnlegung, danach auf seiner Analyse.</p>
          <p>Die Karte selbst wird in ${M("carto", "Carto")} gezeichnet, einem eigenen Modul, das jedem Konto offensteht: Eine Karte dient vielen
            Veranstaltungen, und man arbeitet auch im Gelände daran, mit dem Handy.</p>
          <p>Nur das Team einer Veranstaltung – und die Administratoren von Ozimut – handelt als Veranstalter des Wettkampfs, den sie trägt:
            Startliste, Meldungen und Startzeiten, Live-Ergebnisse, Link zum GPS-Tracking, Ergebnisse, aus der Bahnlegung gesendete Bahnen,
            Kartenanalyse. Ein Wettkampf, den keine Veranstaltung trägt, hat auf Ozimut keinen Veranstalter: Um es zu werden, lege seine
            Veranstaltung an oder bitte darum, dem Team der Veranstaltung beizutreten, die ihn trägt.</p>`)}`,
      evenement: () => html`
        ${slide("Orga", "Eine Veranstaltung anlegen", html`
          <p>„Veranstaltung anlegen“, oben auf der Seite, geht in drei Schritten:</p>
          <div class="mx-steps">
            <div class="mx-step"><b>Art, Land und Datum</b>Wettkampf, Öffentliches Training oder Vereinstraining, dann die Variante: Einzel,
              Score / Rogaine (die Posten in beliebiger Reihenfolge) oder, bei einem Wettkampf, Staffel — „✎ Bearbeiten“ ändert sie später; ein Land, dem du beigetreten bist; ein Datum in den letzten 60 oder den nächsten 400 Tagen.</div>
            <div class="mx-step"><b>Im Kalender des Verbands?</b>In Frankreich wird ein Wettkampf mit seinem Eintrag im Kalender des Verbands
              verknüpft: Die Seite bietet die Wettkämpfe des gewählten Tages an, die deines Vereins zuerst, oder „Er steht nicht im Kalender“.</div>
            <div class="mx-step"><b>Die Veranstaltung</b>Ihr Name, Ort, Verein, Disziplin, Format und Website, aus dem Kalender übernommen, wenn der
              Wettkampf darin steht.</div>
          </div>
          ${list([
            html`<b>Die Verknüpfung</b>: Bist du Mitglied des veranstaltenden Vereins – des Vereins deines letzten bekannten Laufs –, wird sie sofort
              hergestellt. Sonst bestätigt sie ein Administrator von Ozimut; bis dahin kann sich das Team bilden, die Werkzeuge des Wettkampfs
              bleiben aber geschlossen.`,
            html`<b>Ein Wettkampf, eine Veranstaltung</b>: Einen Wettkampf aus dem Kalender trägt höchstens eine Veranstaltung. Verwaltet ihn schon ein
              Team, sagt die Seite es und bietet an, um den Beitritt zu bitten. Sobald eine Veranstaltung ihn trägt, können Läufer keine
              Ergebnisdateien mehr dafür hochladen: Seine Ergebnisse sind die seines Teams.`,
            html`<b>Außerhalb des Kalenders</b>: Ein Wettkampf, der nicht oder noch nicht darin steht, wird ohne Verknüpfung angelegt; er erscheint dann
              in Arena bei den Wettkämpfen seines Landes (eine Staffel noch nicht), ohne dass veröffentlicht wird, wer ihn angelegt hat. Er kann
              später verknüpft werden, solange unter seinem eigenen Namen noch nichts veröffentlicht wurde.`,
            html`„✎ Bearbeiten“, oben in der Veranstaltung, ändert ihre Beschreibung, verknüpft sie mit dem Kalender oder trennt sie davon, oder löscht sie.`,
          ])}`)}`,
      equipe: () => html`
        ${slide("Orga", "Das Team", html`
          <p>Jede Veranstaltung hat ihr Team, und alle Mitglieder haben dieselben Rechte: Sie verwalten die ganze Veranstaltung, nehmen Mitglieder auf
            oder entfernen sie, verknüpfen sie mit dem Kalender oder trennen sie davon und können sie löschen. Wer die Veranstaltung anlegt, ist ihr
            erstes Mitglied. Die Bahnlegung hat ein eigenes Team (siehe „Bahnlegung“).</p>
          ${list([
            html`<b>Niemand wird von anderen hinzugefügt</b>, weder über den Namen noch über die Lizenz noch über die E-Mail-Adresse: Eine Person bittet
              um Beitritt, in „Einem Team beitreten“ (oben auf der Seite) oder indem sie die Adresse der Veranstaltung öffnet, die der Reiter „Team“
              zum Weitergeben angibt. Sie kann ein Wort an das Team dazuschreiben.`,
            html`<b>Ein Mitglied antwortet</b>: Jedes Mitglied kann die Anfrage im Reiter „Team“ annehmen oder ablehnen. Die Mitglieder werden über
              eine Anfrage per Push-Mitteilung informiert, die Person über die Antwort.`,
            html`<b>Wer was sieht</b>: Die Mitglieder sehen gegenseitig ihre Namen und Vereine sowie die derer, die um Beitritt bitten; außerhalb des
              Teams sind nur Vorname und Initiale von höchstens zwei Mitgliedern zu sehen.`,
            html`<b>Verlassen</b>: Ein Mitglied verlässt das Team, wann es will; das letzte Mitglied löscht stattdessen die Veranstaltung. Bei einem
              Wettkampf aus dem Kalender bleibt, was veröffentlicht wurde; ein auf Ozimut angelegter Wettkampf verschwindet aus Arena, mit allem,
              was er dort veröffentlicht hat.`,
          ])}`)}`,
      trace: () => html`
        ${slide("Orga", "Bahnlegung: die Bahnen der Veranstaltung", html`
          <p>Der Reiter „Bahnlegung“ verbindet die Veranstaltung mit ihrer Bahnlegung. Alles, was dort geschieht, erklärt der Reiter
            ${D("tracer", "Die Bahnlegung")} dieser Dokumentation.</p>
          ${list([
            html`<b>Bahnlegung beginnen</b> öffnet die Seite „Bahnlegung“ mit einer neuen Bahnlegung, für die Veranstaltung vorbereitet – ihr
              Wettkampf oder Name und Datum des Trainings – und mit ihr verbunden: Es fehlt nur noch die Karte. <b>Bahnlegung öffnen</b> nimmt sie
              danach wieder auf.`,
            html`<b>Ein eigenes Team</b>: Die Bahnlegung behält ihr eigenes Team und ihre Rollen – Bahnleger, Kontrolleur, Leser, per Link
              eingeladen – und, wenn du willst, ihre Verschlüsselung. So bleiben die Bahnen bis zum Lauf vertraulich.`,
            html`<b>Die anderen Mitglieder der Veranstaltung</b> sehen nur, dass es eine Bahnlegung gibt, wer sie begonnen hat und wie viele Personen
              in ihrem Bahnlegungsteam sind; um daran mitzuarbeiten, bitten sie um eine Einladung.`,
            html`Nach dem Lauf veröffentlicht die Bahnlegung ihre Bahnen samt Karte in der Analyse der Veranstaltung (Reiter „Analyse“).`,
          ])}`)}`,
      horaires: () => html`
        ${slide("Orga", "Anmeldungen und Starts", html`
          <p>Der Reiter „Anmeldungen und Starts“ eines Wettkampfs oder eines öffentlichen Trainings führt in drei Schritten von den Anmeldungen zur
            Startliste; nach dem Lauf bleibt er lesbar.</p>
          <div class="mx-steps">
            <div class="mx-step"><b>Anmeldungen</b>Das Formular: die Kategorien und ihre Bahnen, die Plätze, Öffnung und Anmeldeschluss (und
              Nachmeldungen), die Preise – nach Alter, mit oder ohne Lizenz, nach Kategorie, Leihchip, Optionen, eine Obergrenze pro Familie –, was
              abgefragt wird (Chip, Geburtsjahr, Notiz) und wie bezahlt wird (Überweisung auf das Vereinskonto, vor Ort). Die Läufer melden sich in
              Arena an; du verfolgst die Liste, meldest von Hand an oder liest eine Datei ein (CSV, die von OE, IOF XML, Google Sheets).</div>
            <div class="mx-step"><b>Startzeiten</b>Keine, ein Raster, in dem die Läufer reservieren (erster und letzter Start, Intervall, Abstand
              zwischen zwei Läufern desselben Vereins), eine Auslosung in deinem Browser oder eine hochgeladene Startliste.</div>
            <div class="mx-step"><b>Startliste</b>Bei Anmeldeschluss werden die Startzeiten zur veröffentlichten Startliste, nach jeder Änderung neu
              veröffentlicht; Exporte als IOF XML, CSV von OE und Datei für O Checklist.</div>
          </div>
          ${list([
            html`<b>Die Zahlungen</b>: Jeder Zahler hat pro Veranstaltung einen Verwendungszweck („OZ-7K3F“); du markierst sie einzeln, nach
              Verwendungszweck, gesammelt oder über den Kontoauszug deiner Bank (CSV, OFX, CAMT.053) als bezahlt, der in deinem Browser gelesen und
              nicht gesendet wird. Vereine, die die Anmeldungen ihrer Läufer übernehmen, zahlen mit einer einzigen Überweisung: Ihre Abrechnung steht
              in „Mein Verein › Konten“.`,
            html`Eine anderswo erstellte Startliste lässt sich weiterhin hochladen: IOF XML „StartList“, CSV, Tabelle, HTML, PDF von OE oder MeOS,
              Google-Sheets-Link, zuerst in deinem Browser gelesen und geprüft.`,
            html`Nach der Veröffentlichung erscheint die Liste in Arena, und jeder Läufer, der es gewünscht hat, erhält seine Startzeit per
              Push-Mitteilung oder per E-Mail.`,
          ])}`)}`,
      direct: () => html`
        ${slide("Orga", "Live übertragen", html`
          <p>Der Reiter „Live“ lässt deine Ergebnisse live in Arena erscheinen, ohne Umweg über liveresultat. Dort wird eine Übertragung eröffnet,
            von Anfang an mit dem Wettkampf der Veranstaltung verknüpft. Dann, nach Wahl:</p>
          <div class="mx-grid">
            <div class="mx-box" style="--c:var(--s1)"><h3>Aus MeOS</h3><p>Der MeOS-Dienst „Online-Ergebnisse“ sendet seine Ergebnisse selbst an
              die Adresse, die Nummer und das Passwort, die die Seite angibt; die Zwischenzeiten der Funkposten folgen.</p></div>
            <div class="mx-box" style="--c:var(--s3)"><h3>Aus einer Datei</h3><p>Deine Software exportiert die Ergebnisliste alle paar Sekunden
              (IOF XML, HTML von OE oder MeOS); die Seite, geöffnet auf dem Computer im Wettkampfzentrum in Chrome oder Edge, liest diese Datei erneut und sendet, was sich ändert.</p></div>
          </div>
          <p>Die Übertragung bleibt nach dem Lauf erhalten: Ihre Ergebnisse, Zwischenzeiten und Startliste bleiben in Arena. Es ist noch eine
            Testversion: zuerst bei einem Training ausprobieren oder parallel zum üblichen Live-Dienst.</p>
          <p><b>Das GPS-Tracking</b>: Ozimut verfolgt keinen Läufer per GPS. Wenn dein Wettkampf einen Tracking-Dienst nutzt (Loggator, GPSSeuranta,
            TracTrac, Livelox, Routechoices …), gib seinen Link im selben Reiter an: Er erscheint beim Wettkampf in Arena, mit seinen Ergebnissen und
            seinem Live-Bereich. Nur der Link wird veröffentlicht.</p>`)}`,
      resultats: () => html`
        ${slide("Orga", "Die Ergebnisse hochladen", html`
          <p>Der Reiter „Ergebnisse“ öffnet sich am Wettkampftag; „Ergebnisse hochladen“ fügt dort deine Datei hinzu, in drei Schritten:</p>
          <div class="mx-steps">
            <div class="mx-step"><b>Die Datei</b>Ein IOF-XML-Export deiner Software (am besten: Er enthält die Bahnen und die Zwischenzeiten),
              das HTML von OE oder MeOS oder ein PDF; gezippt oder nicht, höchstens 30 MB.</div>
            <div class="mx-step"><b>Die Prüfung</b>Die Datei wird in deinem Browser gelesen, nichts wird gesendet: Zusammenfassung, Ergebnisse Bahn für Bahn,
              Zeitkontrolle (falsch gestellte Stationen, nicht gelöschte Chips) und alle Ansichten der Analyse.</div>
            <div class="mx-step"><b>Die Veröffentlichung</b>„Veröffentlichen“ sendet sie: Der Lauf erscheint innerhalb weniger Minuten in Arena, als vom
              Veranstalter hochgeladen markiert, und wird nicht mehr anderswo gesucht. Ein neuer Upload ersetzt den vorherigen.</div>
          </div>`)}`,
      analyses: () => html`
        ${slide("Orga", "Die Analyse vorbereiten", html`
          <p>Der Reiter „Analyse“ öffnet die Kartenanalyse der Veranstaltung von selbst und dient danach dazu, sie zu verwalten. Sie
            wird Bahn für Bahn vorbereitet:</p>
          ${list([
            html`<b>Die Karte</b>: ein Bild, ein PDF oder ein KMZ, unverändert gespeichert, ohne Qualitätsverlust.`,
            html`<b>Ihre Kalibrierung</b>: aus einem KMZ, einer Georeferenzierungsdatei, einem IOF XML mit Koordinaten oder deinem eigenen Track.`,
            html`<b>Die Bahn</b>: auf der Karte gelesen, die Reihenfolge der Posten aus dem IOF XML der Bahnen, aus deinem Track oder aus deinen Klicks.`,
            html`<b>Der Zugang</b>: alle Konten, die Mitglieder des Vereins – und, wenn du willst, deine Gäste aus anderen Vereinen oder ohne Verein, mit einem Code; die übrigen Konten sehen die Analyse in der Liste, mit der Bitte, dich nach dem Code zu fragen – oder ein Passwort. „Aus Läufersicht ansehen“ zeigt die Seite so, wie sie sie
              sehen werden.`,
          ])}
          <p>Die Seite der Analyse dient dazu, sie zu verwalten, nicht zu analysieren: die Liste der Bahnen, die Karte der gewählten Bahn mit ihrem
            Verlauf zum Prüfen, die Veröffentlichung (eine neue Analyse bleibt ein Entwurf, den nur die Veranstalter sehen; „Speichern, ohne zu veröffentlichen“ lässt
            sie so, „Speichern und veröffentlichen“ öffnet sie für die Läufer, „Speichern und später veröffentlichen“ öffnet sie von selbst am
            gewählten Tag zur gewählten Uhrzeit; die Bahnen einer abgelegten OCAD-Datei werden mit denselben Schaltflächen hinzugefügt),
            was die Läufer tun können (ihren Track hinzufügen, „Einzelanalyse“ auf deiner Karte, „Meine Karten“, Kommentare, Routenwahlen,
            3D-Ansicht, Video, berechnete Routen) und die Nutzung: die Konten, die sie geöffnet haben, die Tracks pro Bahn, wer sie allein
            abgespielt hat, ohne einen Track zu teilen — nur Zahlen, nie wer.</p>
          <p>Die Läufer finden sie in Coach („Analyse › Mit den anderen vergleichen“). Die Bahnlegung kann ihre Bahnen auch samt Karte in eine Analyse veröffentlichen (bei einem
            Wettkampf nach dem Lauf).</p>`)}`,
      chrono: () => html`
        ${slide("Chrono", "Einen Lauf mit Ozimut zeitmessen", html`
          <p>Chrono ist das Zeitmess-Werkzeug von Ozimut: die Teilnehmer, die Auslosung der Startzeiten, das Auslesen der Chips im Ziel, die
            Belege, die Ergebnisse, die Arbeit des Schiedsrichters. Es steht in ${P("#/orga", "Meine Veranstaltungen")}: Öffne eine
            Veranstaltung, dann ihren Reiter „Chrono“, direkt vor „Team“. Die Reiter „Live“ und „Ergebnisse“ bleiben für alle, die mit einer
            anderen Software zeitmessen. Chrono gibt es auch als Anwendung zum Installieren, um ohne Internet zu arbeiten und mehrere Computer
            zu verbinden: siehe ${CHAP("chrono-app", "Die Chrono-Anwendung")}.</p>
          <div class="mx-callout"><b>In der Testphase, nur für Administratoren.</b> Der Reiter „Chrono“ wird vorerst nur den Administratoren von
            Ozimut angezeigt. Chrono wurde noch nie mit echten SPORTident- oder Emit-Stationen, einem Belegdrucker oder einem echten MeOS
            ausprobiert, und keine seiner Dateien wurde bisher an einen Verband geschickt. Probiere es bei einem Training oder neben deiner
            gewohnten Software aus; vertraue ihm noch keinen Wettkampf allein an.</div>
          <p><b>Die Idee in drei Sätzen.</b> Jede Station — ein Computer oder ein Telefon, auf dem Chrono geöffnet ist — schreibt, was sie tut
            (eine Anmeldung, ein ausgelesener Chip, eine Korrektur), als Vorgang in ein gemeinsames Protokoll, das des Laufs. Die Stationen
            halten sich gegenseitig auf dem Stand: über die Kopie auf Ozimut, wenn es Internet gibt, über die Anwendung Ozimut Chrono im lokalen Netz — jeder Computer, der sie hat, verbindet sich von selbst mit den anderen —, sonst über eine Datei, die man mitnimmt. Ohne Verbindung behält jede Station alles bei sich und arbeitet weiter: Nichts geht
            verloren, und alles findet wieder zusammen, sobald die Verbindung zurück ist, in beliebiger Reihenfolge.</p>
          <p><b>Der Bildschirm.</b> Oben der Name der Veranstaltung, der Zustand der Geräte und Verbindungen (Lesegeräte, Drucker, Kopie auf Ozimut,
            verbundene Computer) und die Uhrzeit. Links die neun Stationen: Vorbereiten, Anmeldung, Start, Ziel, Übersicht, Sprecher, Schiedsrichter,
            Posten, Abschließen (<kbd>Alt</kbd>+<kbd>1</kbd> bis <kbd>Alt</kbd>+<kbd>9</kbd>). Unter der Leiste die Schaltflächen der
            geöffneten Station. Unten die Zähler: Teilnehmer, unterwegs, ausgelesene Chips, gewertet, zu klärende Punkte. Ein Chip, der an
            irgendeiner Station ausgelesen wird, wird behalten, bewertet, mit einem Ton gemeldet (hoch: alles in Ordnung; tief: etwas fehlt)
            und, wenn du es eingestellt hast, gedruckt.</p>`)}
        ${slide("Chrono", "Vorbereiten: der Assistent in neun Schritten", html`
          <p>Die Station „Vorbereiten“ führt die Veranstaltung von null bis startklar. Die Schritte lassen sich in beliebiger Reihenfolge
            erledigen; ein Schritt, in dem etwas den Beginn verhindert, ist markiert.</p>
          <div class="mx-steps">
            <div class="mx-step"><b>Veranstaltung</b>Name, Datum, Ort, Verein; „Art des Laufs“ (Einzellauf, Score-OL, Staffel); „Regeln“ (das
              Land); „Zeitmesssystem“ (SPORTident oder Emit); „Starts“: zur Zeit der Startliste, an der Starteinheit (freier Start) oder
              Massenstart; „Erster Start“; „Zielschluss“, nach dem ein Läufer die Zeit überschritten hat. Im Reiter kommen Name, Datum, Ort
              und Verein aus der Orga-Veranstaltung.</div>
            <div class="mx-step"><b>Bahnen</b>Importiere die Datei des Bahnlegers (IOF XML) oder „Neue Bahn“: ihr Name, ihre Länge, ihre
              Steigung und ihre Posten in der Reihenfolge, die Nummern der Einheiten durch Leerzeichen getrennt (31 32 45 100).</div>
            <div class="mx-step"><b>Kategorien</b>„Neue Kategorie“, „Eine pro Bahn“ oder „Alterskategorien“ (die der gewählten Regeln; sie
              brauchen dann noch eine Bahn). Jede hat ihre Bahn und, wenn gewünscht, ihren ersten Start, ihr Intervall, eine Maximalzeit, ein
              Startgeld; „Kategorie ohne Wertung“ für Einsteiger.</div>
            <div class="mx-step"><b>Teilnehmer</b>Eine Datei „Importieren“ oder einzeln „Neuer Läufer“. Die „Verbandsdatei“ hilft, schnell
              anzumelden und Chipnummern zu finden (siehe unten).</div>
            <div class="mx-step"><b>Teams</b>Nur wenn eine Kategorie im Team gelaufen wird: Staffel, Paare, Patrouillen (siehe „Die
              Laufformate“).</div>
            <div class="mx-step"><b>Starts</b>Die „Auslosung“ der Startzeiten, die Kontrolle der Liste, der Druck der Startlisten, der
              IOF-XML-Export. Entfällt beim Start an der Starteinheit oder beim Massenstart.</div>
            <div class="mx-step"><b>Geräte</b>Die Chip-Lesegeräte, der Belegdrucker und der „Probelauf“.</div>
            <div class="mx-step"><b>Verbindungen</b>Der Name des Bedieners, die Kopie auf Ozimut, die Live-Ergebnisse, die anderen Computer im
              Wettkampfzentrum und der Code der Veranstaltung, die Veranstaltungsdatei.</div>
            <div class="mx-step"><b>Prüfen</b>Was den Beginn verhindert und was nur empfohlen ist, mit „Dorthin“ zum betroffenen Schritt;
              dann „Station Ziel öffnen“.</div>
          </div>
          ${list([
            html`<b>Importieren</b> nimmt jede Datei und sagt, was sie enthält, bevor sie hinzugefügt wird: IOF XML 3.0 (Teilnehmer,
              Startliste, Bahnen, Kategorien, Ergebnisse), eine CSV-Tabelle — die Datei des Verbands oder von OE, erkannt an ihren
              Spaltentiteln auf Französisch, Englisch oder Deutsch —, eine MeOS-Datei, eine Ozimut-Chrono-Datei (.ozchrono). Was schon da
              ist, wird ergänzt, nie verdoppelt: Ein Läufer wird an seiner Lizenz erkannt, sonst an Name und Verein.`,
            html`<b>Die Verbandsdatei</b> (Schritt „Teilnehmer“, „Datei laden“) ist die Datei der Lizenzinhaber des Verbands, auf diesem
              Computer aufbewahrt: Tippe im Eintrag eines Läufers einen Namen oder eine Lizenznummer, und der Rest füllt sich aus. „Chips
              ergänzen“ gibt Teilnehmern ohne Chip die Nummer, die diese Datei für sie kennt.`,
            html`<b>Die Auslosung</b> erfolgt nach Bahn (alle Läufer einer Bahn gemischt) oder nach Kategorie, mit dem Intervall, dem „Abstand
              zwischen Läufern eines Vereins“, „Freien Plätzen“ für Nachmeldungen und „Schon vergebene Zeiten behalten“. Der Schritt meldet
              Läufer ohne Zeit, doppelt vergebene Zeiten auf einer Bahn und Läufer desselben Vereins, die aufeinander folgen.`,
            html`<b>Der Probelauf</b> („Geräte“, „Probelauf starten“) lässt dich alle Stationen ausprobieren, ohne etwas zu verderben: Er
              arbeitet auf einer Kopie des Laufs, mit „Einen erfundenen Chip auslesen“, „Zehn Chips“ und „Ein unbekannter Chip“ — manche mit
              einem fehlenden Posten oder ohne Ziel, um ihre Klärung zu üben. Nichts wird gespeichert oder gesendet. Ohne Teilnehmer legt er
              einen kleinen erfundenen Lauf an. „Probelauf beenden“ führt zum echten Lauf zurück.`,
          ])}`, "chrono-preparer")}
        ${slide("Chrono", "Am Lauftag, Station für Station", html`
          ${list([
            html`<b>Anmeldung</b>: einen Läufer nach Name, Verein, Lizenz, Startnr. oder Chipnummer finden. Ein leerer Chip auf dem Lesegerät
              öffnet den Eintrag seines Trägers oder eine neue Anmeldung mit dieser Nummer. Der Eintrag enthält die Nachmeldung („Neuer
              Läufer“), die Art der Anmeldung, „Startgeld“ und „Bezahlt“, den „Leihchip“. Daneben: Teilnehmer ohne Chip, „Offen“, die
              „Leihchips draußen“, Teilnehmer ohne Kategorie. Das Menüband druckt die Liste „Nach Verein“ und öffnet „Rechnungen nach
              Verein“.`,
            html`<b>Start</b>: die Uhrzeit, der nächste Start und die Läufer Minute für Minute; für jeden „Anwesend“ (✓) oder nicht
              angetreten (✕). „Fehlende markieren“ markiert alle, die nicht abgehakt wurden und deren Zeit seit fünf Minuten vorbei ist — nur
              wenn überhaupt jemand abgehakt wurde. Das Menüband druckt die Liste „Minute für Minute“.`,
            html`<b>Ziel</b>: hier werden die Chips ausgelesen. Der letzte Chip erscheint groß — der Läufer, sein Status, seine Zeit, sein
              Rang, sein Rückstand, die fehlenden Posten — mit „Beleg“, „Chip korrigieren“, „Eintrag des Läufers“ und „Nicht dieser Läufer“.
              Darunter die Liste „Zu klären“ und die „Zuletzt ausgelesenen Chips“. „Beleg automatisch“ druckt den Beleg gleich nach dem
              Auslesen.`,
            html`<b>Übersicht</b>: die laufenden Ergebnisse „Nach Kategorie“ oder „Nach Bahn“ und „Im Wald“, die gestarteten und noch nicht
              zurückgekehrten Läufer, vom frühesten Start zum spätesten. Ein Klick auf einen Läufer zeigt seine Posten mit Zeiten und Rängen.
              Das Menüband druckt die Ergebnisse, mit oder ohne Zwischenzeiten, und „Bildschirm“ öffnet sie in großer Schrift für eine
              Anzeige.`,
            html`<b>Sprecher</b>: „Zuletzt im Ziel“, „In Führung“, die „Funk-Durchgänge“; „Vollbild“.`,
            html`<b>Schiedsrichter</b>: das „Änderungsprotokoll“ — alles, was seit dem Auslesen der Chips von Hand geändert wurde, von wem,
              wann, an welcher Station —, die „Beschwerden und Entscheidungen“, „Disqualifizieren“ mit Begründung, „Protokoll exportieren“.`,
            html`<b>Posten</b>: jede Einheit, wie die ausgelesenen Chips sie zeigen — wie viele sie gestempelt haben, wie viele es hätten tun
              müssen und nicht getan haben, ihr Zustand („nie gestempelt: defekt?“, „unstimmige Zeit“, „fehlt oft“). „Posten hinzufügen“, und
              für jeden seine Punkte (Score-OL), die „Weiteren akzeptierten Nummern“ (eine Ersatzeinheit) und „Funkposten“. „Durchgang von
              Hand“ notiert den Durchgang eines Läufers, den ein Postenkontrolleur am Telefon meldet.`,
            html`<b>Abschließen</b>: nach dem Lauf (siehe unten).`,
          ])}`, "chrono-postes")}
        ${slide("Chrono", "Im Ziel: die Liste „Zu klären“", html`
          <p>Chrono entscheidet nie an deiner Stelle: Was einen Menschen braucht, wartet in der Liste „Zu klären“ der Station Ziel (ein roter
            Zähler zeigt es an der Station), jede Zeile mit ihrer Schaltfläche.</p>
          <div class="table-wrap"><table class="data compact"><thead><tr><th>Die Zeile sagt</th><th>Was das bedeutet</th><th>Was zu tun ist</th></tr></thead><tbody>
            <tr><td>Chip n: Niemand trägt ihn</td><td>Ein ausgelesener Chip, den kein Teilnehmer gemeldet hat.</td><td>„Zuteilen“: den Läufer
              suchen (Chrono sagt, zu welcher Bahn der Chip passt), „Neuer Läufer“ oder „Beiseitelegen“.</td></tr>
            <tr><td>Chip n: Mehrere Läufer tragen ihn</td><td>Dieselbe Nummer ist mehreren Teilnehmern zugeteilt.</td><td>Dem richtigen Läufer „Zuteilen“.</td></tr>
            <tr><td>Kein Zielstempel oder kein Startstempel</td><td>Der Läufer hat die Einheit nicht gestempelt, oder sie hat nicht reagiert.</td>
              <td>„Chip ansehen“: die Zeit von Hand eingeben.</td></tr>
            <tr><td>Posten fehlt (Nummern)</td><td>Ein Posten der Bahn ist nicht auf dem Chip: Der Läufer hat einen Fehlstempel.</td><td>„Chip
              ansehen“, um den Stempel hinzuzufügen, wenn die Kontrolle am Posten ihn bestätigt; „Gesehen“, um zu vermerken, dass es geprüft ist.</td></tr>
            <tr><td>Nach Zielschluss noch unterwegs</td><td>Gestartet, nie ausgelesen.</td><td>„Zieleinlauf eingeben“: ein Zieleinlauf oder ein Status von Hand.</td></tr>
            <tr><td>Chip n-mal ausgelesen, das letzte Auslesen zählt</td><td>Der Chip wurde mehrmals ausgelesen.</td><td>„Eintrag öffnen“, wenn das nicht gewollt ist.</td></tr>
            <tr><td>Posten: unstimmige Zeit bei n Läufern</td><td>Die Einheit ist vielleicht falsch gestellt.</td><td>Siehe die Station „Posten“.</td></tr>
            <tr><td>Leihchip zurückzuholen, Betrag offen</td><td>Eine Erinnerung, wenn der Läufer vorbeikommt.</td><td>„Zurückgegeben“, „Bezahlt“.</td></tr>
          </tbody></table></div>
          ${list([
            html`<b>Einen Chip korrigieren</b> („Inhalt des Chips“): einen Stempel entfernen oder hinzufügen, Start oder Ziel ändern, den
              Läufer ändern. Der Inhalt des Chips selbst wird nie verändert: Die Korrektur ersetzt ihn, sie steht im Protokoll des
              Schiedsrichters, und „Zurück zum Chip“ hebt sie auf.`,
            html`<b>Einen Zieleinlauf eingeben</b> (Menüband, „Von Hand“): für einen Läufer, dessen Chip verloren oder unlesbar ist, seine
              Zielzeit oder seine Laufzeit und sein Status. Auch das steht im Protokoll.`,
            html`<b>Der Eintrag des Läufers</b>, Teil „Schiedsrichter“: Ein von Hand gewählter Status geht dem vor, was der Chip sagt, und
              eine „Zeitkorrektur“ fügt Sekunden hinzu oder zieht sie ab.`,
          ])}`, "chrono-traiter")}
        ${slide("Chrono", "Die Laufformate", html`
          ${list([
            html`<b>Einzellauf</b>: der einfache Fall, eine Kategorie, eine Bahn. Eine Kategorie kann „Varianten“ haben (ihre Namen durch „/“
              getrennt): Die gelaufene Variante wird beim Auslesen des Chips erkannt.`,
            html`<b>Score-OL</b>: die Art „Score-OL“, eine Bahn mit dem Häkchen „Score-Bahn“ (die Posten werden in beliebiger Reihenfolge
              angelaufen), das „Zeitlimit“ und die „Strafe pro angefangener Minute“ in „Veranstaltung“, die Punkte jedes Postens in „Posten“
              (leer: ein Punkt).`,
            html`<b>Staffel</b>: die Art „Staffel“; in jeder Kategorie die „Bahnen der Staffelstrecken“ — eine Strecke pro „;“, ihre Varianten
              durch „/“ getrennt (A1/A2; B; C1/C2). Der Schritt „Teams“ legt die Teams an („Neues Team“: Name, Verein, Kategorie, Startnr., der
              Läufer jeder Strecke; tippe einen Namen, Gemeldete ohne Team werden vorgeschlagen) oder importiert sie; „Nummerieren“ vergibt
              die Startnummern, Kategorie für Kategorie („Erste Startnummer“, „Block pro Kategorie“: 100 für 1, 101, 201…).
              <b>„Massenstart der Wartenden“</b> (Schritt „Teams“ und Station Start): Zur gewählten Zeit starten ab der angegebenen Strecke
              die Läufer gemeinsam, deren Teamkollege noch nicht im Ziel ist; ihre Zeit läuft ab dieser Zeit, und ihr Team wird hinter denen
              gewertet, die nicht neu gestartet wurden. „Massenstart aufheben“ macht es rückgängig.`,
            html`<b>Paare und Patrouillen</b>: in der Kategorie „Teams zu“ (2 für Paare) und „Gewertete Läufer“ — die Zeit des Teams ist die
              dieses Läufers im Ziel; leer zählen alle, und die Zeit ist die des Letzten.`,
            html`<b>K.-o.-Sprint</b> (Schritt „Starts“, „K.-o.-Läufe“): Aus der Rangliste einer Qualifikation verteilt Chrono die Läufer „in
              Schlangenlinie“ auf Läufe, damit sie gleich stark sind; jeder Lauf ist eine eigene Kategorie mit Massenstart („Anzahl Läufe“,
              „Läufer pro Lauf“, „Start des ersten Laufs“, „Minuten zwischen zwei Läufen“). Die nächste Runde nimmt „Weiter pro Lauf“ und,
              wenn gewünscht, „Zeitschnellste dazu“, die Schnellsten der Ausgeschiedenen. Jeder behält seinen Chip: Das nächste Auslesen
              gehört zu seinem Lauf. Eine Runde, in der schon Chips ausgelesen wurden, lässt sich nicht neu anlegen. Das „Tableau der Läufe“
              druckt jede Runde und dann die Schlussrangliste.`,
            html`<b>Mehrere Tage</b> (Schritt „Starts“ und Station Abschließen): Füge die schon gelaufenen Etappen hinzu, aus einer
              Ergebnisdatei (IOF XML, OE, MeOS oder Ozimut Chrono) oder aus einer anderen Veranstaltung dieses Computers. Die Gesamtwertung
              addiert die Zeiten oder zählt Punkte (1000 für den Sieger jeder Etappe), über alle Etappen oder nur die besten („Gewertete
              Etappen“). Läufer werden an ihrer Lizenz erkannt, sonst an Name und Verein. <b>„Jagdstart“</b> für den letzten Tag: Der Führende
              der Gesamtwertung nach Zeit startet zur angegebenen Zeit, die anderen mit ihrem Rückstand; über dem „Größten Rückstand“ und für
              alle, denen eine Etappe fehlt, Start nacheinander in festem Abstand.`,
          ])}`, "chrono-formats")}
        ${slide("Chrono", "Listen und Abrechnung", html`
          ${list([
            html`<b>Die fertigen Listen</b>: die Startliste nach Kategorie, nach Bahn, Minute für Minute (für das Startteam) und nach Verein;
              die Ergebnisse, mit oder ohne Zwischenzeiten; der Beleg jedes Läufers.`,
            html`<b>„Liste gestalten“</b> (Schritt „Starts“, Gruppe „Drucken“): eigene Listen von Ergebnissen, Starts oder Teilnehmern — die
              Gruppierung (Kategorie, Bahn, Verein), die Spalten und ihre Reihenfolge, die Sortierung, die berücksichtigten Kategorien und
              Status, nur die Ersten jeder Gruppe (3 für die Podien), Zwischenzeiten, eine Seite pro Gruppe, die Schriftgröße, die
              Ausrichtung, Zeilen darüber und darunter. Die Vorschau zeigt die Liste, wie sie gedruckt wird; sie wird gedruckt, als
              „CSV-Datei“ exportiert oder auf einem „Bildschirm“ geöffnet. Gespeichert (<kbd>Strg</kbd>+<kbd>S</kbd>) bleibt sie bei der
              Veranstaltung und erscheint unter „Meine Listen“ in den Stationen Übersicht und Abschließen.`,
            html`<b>„Rechnungen nach Verein“</b> (Stationen Anmeldung und Abschließen): was jeder Verein schuldet, Startgelder und Leihchips.
              Du stellst den „Preis eines Leihchips“, den Titel, ein „Nummernpräfix“, den Kopf des Veranstalters und die Fußzeile
              (Bankverbindung, Zahlungsfrist) ein; du markierst einen Verein als bezahlt; du druckst einen Verein, alle Rechnungen oder nur
              die Vereine mit offenem Betrag; zwei CSV-Exporte, Übersicht und Einzelposten.`,
          ])}`, "chrono-listes")}
        ${slide("Chrono", "Nach dem Lauf: Abschließen", html`
          ${list([
            html`<b>„Stand des Laufs“</b>: die Läufer, die noch unterwegs sind, die nicht gestarteten Teilnehmer („Nicht Gestartete als nicht
              angetreten markieren“), ausgelesene Chips, die niemandem zugeteilt sind, nicht zurückgegebene Leihchips, offene Beträge.`,
            html`<b>„Vor dem Versand an den Verband“</b>: was der Datei fehlen würde — Läufer ohne Lizenz, ohne Verein oder ohne Kategorie,
              Lizenznummern in unerwarteter Form, Kategorien ohne Bahn.`,
            html`<b>Die Ergebnisdateien</b>: die Datei des Verbands — in Frankreich „Datei FFCO“, eine CSV im Format von OE 2003, die
              Ergebnisse nach Bahn, so wie der Verband sie für seine Rangliste erhält; „IOF XML“ 3.0 mit Zwischenzeiten (WinSplits, Livelox,
              andere Programme); „MeOS“, die Veranstaltung zum Wiederöffnen in MeOS; „Webseite“, die Ergebnisse und Zwischenzeiten auf einer
              Seite zum Online-Stellen.`,
            html`<b>„Auf Ozimut veröffentlichen“</b> schickt die Ergebnisse an Arena › Ergebnisse, als Datei des Veranstalters: nur aus dem
              Reiter (du musst angemeldet sein), für eine Veranstaltung, die mit einem Wettkampf des Kalenders verknüpft ist. Sie ersetzen
              die, die du dort schon hochgeladen hattest.`,
            html`<b>Die Live-Ergebnisse</b> werden vor dem Lauf eingestellt: „Verbindungen“, „Die Ergebnisse live auf Ozimut zeigen“ — die
              Ergebnisse erscheinen in Arena › Live, etwa alle zwanzig Sekunden aktualisiert.`,
            html`<b>„Chips merken“</b> notiert auf diesem Computer den Chip jedes Lizenzinhabers, für die nächsten Läufe. <b>„Datei
              speichern“</b> bewahrt den ganzen Lauf in einer .ozchrono-Datei auf, zum Archivieren.`,
            html`<b>Eine Staffel</b> lässt sich noch nicht in „Ergebnisse“ veröffentlichen, und ihre Dateien enthalten die Ergebnisse Strecke
              für Strecke: Eine Datei mit Teamergebnissen gibt es noch nicht. Die Rangliste der Teams steht auf dem Bildschirm und auf den
              gedruckten Listen.`,
          ])}`, "chrono-cloturer")}
        ${slide("Chrono", "Die Geräte", html`
          ${list([
            html`<b>SPORTident-Lesegerät</b>: Schließe die Hauptstation per USB an, dann „Geräte“, „SPORTident“; der Browser bittet dich,
              ihren Anschluss zu wählen, und merkt ihn sich. „Uhr stellen“ stellt das Lesegerät auf die Zeit des Computers. Nötig ist Chrome
              oder Edge auf einem Computer — nicht Firefox oder Safari, kein Telefon — oder die Anwendung. Die Chips SI5 bis SI11, SIAC und
              pCard sind vorgesehen.`,
            html`<b>Emit</b>: Wähle Emit als „Zeitmesssystem“, dann „Emit“ für ein Lesegerät 250 oder ein MTR4. Von einem eScan oder eScan2
              („Emit eScan“) empfängt Chrono nur seinen Status und emiTag-Durchgänge, nicht den Inhalt der Chips: Emit veröffentlicht das
              Format nicht. Ein Lauf mit Emit-Chips lässt sich also nicht mit einem eScan auslesen; nötig ist ein 250 oder ein MTR4. Die
              anderen Emit-Einheiten (ECU, ETS) werden nicht unterstützt.`,
            html`<b>Belegdrucker</b>, „Drucken auf“: ein Belegdrucker an seriellem Anschluss, USB oder Bluetooth (die gängigen Modelle, Epson
              und kompatible, erhalten den Beleg direkt: wähle Anschluss und Geschwindigkeit); der Systemdrucker mit seinem Druckdialog; und,
              in der Anwendung, der gewählte Drucker ohne Dialog. Papier von 58 oder 80 mm, „Den Beleg drucken, sobald ein Chip ausgelesen
              ist“, „Testbeleg“.`,
            html`<b>Funkposten</b>: Setze das Häkchen „Funkposten“ an der Einheit (Station „Posten“). Die Durchgänge kommen über die
              Anwendung, die auf die Funkrelais hört, oder werden mit „Durchgang von Hand“ notiert; der Sprecher zeigt sie an.`,
          ])}`, "chrono-materiel")}
        ${slide("Chrono", "Mehrere Stationen", html`
          <p>Eine einzelne Station ohne Internet behält alles selbst. Sobald es mehrere gibt, oder um nicht von einem einzigen Computer
            abzuhängen, bietet der Schritt „Verbindungen“ drei Wege, die sich kombinieren lassen; „Prüfen“ warnt, solange der Lauf nur auf
            diesem Computer liegt.</p>
          <div class="mx-grid">
            <div class="mx-box" style="--c:var(--s1)"><h3>Kopie auf Ozimut</h3><p>Im Reiter wird, sobald es Internet gibt, jeder Vorgang auf
              Ozimut kopiert: Ein anderer Computer, der dieselbe Veranstaltung öffnet, übernimmt den Lauf, und nichts geht verloren, wenn
              dieser ausfällt. „Den anderen Stationen Zugang geben“ erzeugt einen Schlüssel, der mit dem Lauf mitreist: Stationen ohne Konto
              (die Anwendung, ein Telefon) tauschen dann ebenfalls mit Ozimut aus, ohne etwas einzugeben.</p></div>
            <div class="mx-box" style="--c:var(--s3)"><h3>Die anderen Rechner im Wettkampfzentrum</h3><p>Die Anwendung Ozimut Chrono
              verbindet jeden Computer im Wettkampfzentrum, der sie hat, ohne Internet mit den anderen: alle gleichberechtigt, jeder mit
              seiner vollständigen Kopie. Ein anderer Computer tritt der Veranstaltung einmal bei, mit dem „Code der Veranstaltung“, der hier
              steht; Telefone und Bildschirme öffnen die hier genannte Adresse. Im Reiter, auf einem Computer, auf dem die Anwendung läuft:
              „Die App auf diesem Computer suchen“ (siehe unten und ${CHAP("chrono-app", "Die Chrono-Anwendung")}).</p></div>
            <div class="mx-box" style="--c:var(--s2)"><h3>Veranstaltungsdatei</h3><p>„Datei speichern“ legt den ganzen Lauf in eine
              .ozchrono-Datei, zum Mitnehmen auf einem USB-Stick; „Datei laden“ fügt sie dem geöffneten Lauf hinzu, ohne etwas zu verdoppeln.
              In Chrome oder Edge schreibt „Ein Protokoll in einem Ordner führen“ jeden Vorgang zusätzlich in einen Ordner des Computers.</p></div>
          </div>
          <p>Der „Name des Bedieners“ (Schritt „Verbindungen“) wird bei jeder Änderung vermerkt, für das Protokoll des Schiedsrichters.</p>`, "chrono-liaisons")}
        ${slide("Chrono", "Die Computer im Wettkampfzentrum", html`
          <p>Mit der Anwendung Ozimut Chrono sind alle Computer im Wettkampfzentrum gleichberechtigt: kein Hauptrechner, kein zentraler
            Computer, den man wählen müsste. Jede Anwendung meldet im lokalen Netz die Veranstaltungen, die sie hat; zwei Anwendungen mit
            derselben Veranstaltung verbinden sich von selbst, jede behält ihre vollständige Kopie und ihr Protokoll, und ein Computer, der
            zurückkommt, holt nach, was er verpasst hat. Es genügt, dass jeder Computer mindestens einen anderen erreicht.</p>
          ${list([
            html`<b>Der Code der Veranstaltung</b>: sechs Buchstaben und Ziffern, mit der Veranstaltung erzeugt, groß angezeigt in
              Vorbereiten › Verbindungen. Ein anderer Computer muss ihn kennen, um sich zu verbinden; er wird nie im Netz gemeldet.`,
            html`<b>Von einem anderen Computer aus beitreten</b>: die Anwendung installieren und öffnen; ihre Startseite › „Im Netzwerk“ › die
              Veranstaltung › ihr Code, ein einziges Mal. Danach verbindet sich dieser Computer von selbst, bei jedem Start.`,
            html`<b>Telefone und Bildschirme</b> (Sprecher, Ergebnisse, Schiedsrichter, Startliste): nichts zu installieren, ihr Browser öffnet
              die Adresse eines Computers, auf dem die Anwendung läuft, genannt in Vorbereiten › Verbindungen. Sie können keine Chips auslesen
              und nicht auf einem Belegdrucker am seriellen Anschluss drucken: Die Browser verbieten es solchen lokalen Seiten.`,
            html`<b>Der Reiter „Chrono“ von Ozimut</b> verbindet sich mit der Anwendung seines eigenen Computers („Die App auf diesem
              Computer suchen“), nie mit der eines anderen: Eine https-Seite darf nicht mit einer lokalen http-Seite sprechen.`,
            html`<b>Ein Rechner erscheint nicht?</b> Manche Netze (öffentliches WLAN, Schulnetz) blockieren die Meldungen: Gib in Vorbereiten ›
              Verbindungen die Adresse und den Schlüssel der anderen Anwendung ein (ihr Menü Hilfe › Über).`,
          ])}
          <div class="mx-grid">
            <div class="mx-box" style="--c:var(--s3)"><h3>Ohne Internet</h3><p>Installiere die Anwendung auf jedem Computer, der Chips
              ausliest oder Belege druckt; erstelle (oder importiere) die Veranstaltung auf einem von ihnen; auf jedem anderen: Startseite ›
              „Im Netzwerk“ › die Veranstaltung › ihr Code. Telefone und Bildschirme öffnen die Adresse aus Verbindungen.</p></div>
            <div class="mx-box" style="--c:var(--s1)"><h3>Mit Internet</h3><p>Überall der Reiter „Chrono“, auf dem Stand gehalten durch die
              Kopie auf Ozimut; oder die Anwendung, die das stille Drucken der Belege hinzufügt — direkt auf den gewählten Drucker, ohne
              Druckdialog — und eine Kopie des Laufs auf der Festplatte des Computers.</p></div>
          </div>
          <p>Diese Verbindungen wurden bisher nur zwischen mehreren Anwendungen auf einem Computer erprobt, noch nicht zwischen echten Computern
            im Netz eines Wettkampfzentrums. Die Einzelheiten: ${CHAP("chrono-app", "Die Chrono-Anwendung")}.</p>`, "chrono-arene")}
        ${slide("Chrono", "Die Regeln nach Land und die Grenzen", html`
          <p>Die „Regeln“ der Veranstaltung legen die Alterskategorien, die Gewohnheiten der Auslosung, die Arten der Anmeldung
            (Lizenzinhaber, Tageslizenz, Lizenz eines anderen Verbands, ohne Lizenz) und die Datei des Verbands fest.</p>
          <div class="table-wrap"><table class="data compact"><thead><tr><th>Regeln</th><th>Alterskategorien</th><th>Auslosung</th><th>Ergebnisse und Datei</th></tr></thead><tbody>
            <tr><td>Frankreich (FFCO)</td><td>H und D</td><td>Nach Bahn, nie zwei Läufer eines Vereins hintereinander</td><td>Nach Bahn; „Datei FFCO“</td></tr>
            <tr><td>Kanada (Orienteering Canada)</td><td>M und F</td><td>Nach Kategorie, ohne Vereinsregel</td><td>Nach Kategorie</td></tr>
            <tr><td>IOF-Regeln (andere Länder)</td><td>M und W</td><td>Nach Kategorie, nie zwei Läufer eines Vereins hintereinander</td><td>Nach Kategorie</td></tr>
          </tbody></table></div>
          <p>Diese Gewohnheiten sind nur die vorgeschlagenen Werte: Die Auslosung und die Übersicht lassen dich nach Bahn oder nach Kategorie
            wählen.</p>
          <p><b>Was Chrono noch nicht kann oder noch nicht bewiesen hat</b>:</p>
          ${list([
            html`kein Versuch mit echten Geräten (SPORTident- oder Emit-Stationen, Belegdrucker) oder mit einem echten MeOS;`,
            html`der Inhalt von Emit-Chips, die ein eScan oder eScan2 ausliest;`,
            html`eine Datei mit Teamergebnissen für Staffeln und die Veröffentlichung einer Staffel in „Ergebnisse“;`,
            html`der Reiter für andere als die Administratoren.`,
          ])}
          <p>Die Installation der Anwendung, das Verbinden der Computer im Wettkampfzentrum, der Direktdruck und die Funkposten sind in
            ${CHAP("chrono-app", "Die Chrono-Anwendung")} beschrieben.</p>`, "chrono-regles")}`,
      "chrono-app": () => appDoc("Die Chrono-Anwendung"),
    });
  }

  // ======================================================================================================
  // Carto (« Cartographier », the map editor: a module of its own since 2026-11-12)
  // ======================================================================================================
  const CARTO = [["carte", "Die Karte"], ["donnees", "Die Daten"], ["terrain", "Im Gelände"], ["imprimer", "Drucken und teilen"],
    ["equipe", "Im Team"]];
  function carto() {
    return chapters(CARTO, {
      carte: () => html`
        ${slide("Carto", "Eine Karte im Browser", html`
          <p>${P("#/carto", "Carto")} zeichnet und aktualisiert OL-Karten im Browser, wie OCAD oder OpenOrienteering Mapper: nichts zu installieren.
            Ein Konto genügt, ohne Orga zu aktivieren, am Computer wie am Handy. Es ist noch eine Beta-Version: Behalte eine Kopie deiner Dateien.</p>
          <p>Der Kartenbildschirm öffnet sich sofort, leer, und darüber drei Möglichkeiten:</p>
          ${list([
            html`<b>Neue Karte</b>: Sprint oder Wald, mit dem passenden Symbolsatz der IOF (ISSprOM 2019-2 oder ISOM 2017-2), an der gewählten Stelle
              – Koordinaten oder deine Position – im Gitter des Landes platziert.`,
            html`<b>Karte importieren</b>: eine OCAD-Datei (Versionen 6 bis 2018), OpenOrienteering Mapper (.omap, .xmap) oder Ozimut (.ozmap). Wieder
              als OCAD gespeichert, behält die Datei unverändert alles, was du nicht geändert hast; was ein Format nicht behalten kann, wird beim
              Import und Export gesagt.`,
            html`<b>Karte öffnen</b>: deine eigenen und die, zu deren Team du gehörst.`,
          ])}
          <p>Das Menüband folgt der Arbeit: Zeichnen, Bearbeiten, Hintergründe, Daten, Gelände, Prüfen, Layout, Drucken, Team. Die Symbole sind links,
            so gezeichnet wie auf der Karte. Du zeichnest gerade Linien, Kurven oder freihändig, eingerastet an Punkten und Linien in der Nähe; du
            füllst eine Fläche mit einem Klick zwischen den Linien, die sie umgeben, schneidest, vereinigst, glättest. Symbole und Farben,
            Schmuckfarben eingeschlossen, werden unter „Layout“ bearbeitet. „Prüfen“ meldet, was unter den Mindestgrößen der IOF liegt, und
            „Generalisieren“ führt dich Schritt für Schritt zu einem anderen Maßstab.</p>`)}`,
      donnees: () => html`
        ${slide("Carto", "Von offenen Daten ausgehen", html`
          <p>Eine neue Karte muss nicht bei null beginnen. Unter „Daten“ holt Carto für das Gebiet der Karte:</p>
          ${list([
            html`<b>Die Höhenlinien</b>, aus dem Geländemodell des Landes (IGN in Frankreich, swisstopo in der Schweiz, USGS in den Vereinigten
              Staaten, NRCan in Kanada, LINZ in Neuseeland), anderswo aus einem weltweiten Modell.`,
            html`<b>OpenStreetMap</b>: Straßen, Wege, Gebäude, Gewässer, Mauern und Zäune, den Symbolen der Karte zugeordnet.`,
            html`<b>Die nationalen Daten</b>: die BD TOPO des IGN in Frankreich, swissTLM3D in der Schweiz, Straßen, Gewässer und Gebäude von The
              National Map in den Vereinigten Staaten.`,
            html`<b>Der Stadtplan (Sprint)</b> für eine Sprintkarte in Frankreich: die Karte, die der Generator der Pixel-Rennen aus dem LiDAR des IGN,
              seiner BD TOPO, dem Luftbild und seinem Infrarot, dem Kataster und OpenStreetMap nach den Regeln eines Kartografen erstellt — der
              öffentliche Straßenraum befestigt bis zu den Flurstücksgrenzen, der Rand befestigter Flächen und die Bordsteine, Gehwege und Radwege
              als Linien in ihrer Breite, Treppen in ihrer Breite, das Wegenetz verbunden, aneinandergebaute Gebäude als eines, Vegetation und
              einzelne Bäume aus dem LiDAR, Mauern und Zäune passierbar oder nicht nach ihrer Höhe, private Gärten in Oliv mit einer « zu
              bestätigenden Grenze » (995, violett, nie gedruckt), wo keine Mauer, kein Zaun und keine Hecke bekannt ist, die Sportplätze und
              Höhenlinien, die nur an Gebäuden unterbrochen sind. Sie wird auf Ozimuts Servern in einigen Minuten berechnet: Du kannst weiterarbeiten
              oder die Seite schließen, sie kommt beim nächsten Öffnen als Entwurf. Die Objekte von OpenStreetMap bleiben auf ausgeblendeten
              Signaturen (990, 991). Eine « Neue Karte » im Sprint nutzt ihn in Frankreich; anderswo OpenStreetMap.`,
            html`<b>Das LiDAR</b>, wo ein nationales LiDAR offen ist (Frankreich, Schweiz, Vereinigte Staaten, Kanada, Neuseeland): das Relief, die
              Felsen und die Vegetation, die karttapullautin daraus gewinnt, in der Äquidistanz der Karte, auf Wunsch mit dichten Hilfshöhenlinien
              (siehe unten). Die Kacheln werden auf Anfrage berechnet, in wenigen Minuten; ein Balken zeigt, wie weit die Berechnung ist.`,
          ])}
          <p>Alles kommt <b>als Entwurf</b>, in einem eigenen Teil: Du nimmst an, was stimmt, und verwirfst den Rest, Objekt für Objekt oder auf
            einmal. Offene Daten sind ein Ausgangspunkt; das Gelände selbst wird vor Ort aufgenommen. Wo ein Land seine Daten noch nicht hat, sagt
            Carto es und bietet an, ihre Unterstützung anzufragen.</p>
          <p><b>Hintergründe</b> liegen unter der Karte: ein Luftbild oder eine Online-Karte je nach Land, ein eingepasstes Bild oder PDF, ein
            GPS-Track.</p>`)}
        ${slide("Carto", "Das LiDAR und karttapullautin", html`
          <p>Relief, Felsen und Vegetation des LiDAR berechnet <b>karttapullautin</b>, die freie Software (Lizenz GPL-3) von Jarkko Ryyppö, das
            Werkzeug von MapAnt. Ozimut lädt es von seiner eigenen Veröffentlichung herunter und führt es unverändert auf Rechenservern aus,
            Kachel für Kachel zu 1 km; jede Kachel wird einmal berechnet und dient dann allen Kartografen
            (<a href="https://github.com/karttapullautin/karttapullautin" target="_blank" rel="noopener">github.com/karttapullautin</a>).</p>
          ${list([
            html`<b>Die Äquidistanz</b> folgt der Norm der Karte: 2 oder 2,5 m für eine Sprintkarte (ISSprOM), 2,5 oder 5 m für eine Waldkarte
              (ISOM). Bei 5 m fügt karttapullautin Formlinien bei halber Äquidistanz hinzu, wo das Relief sie verlangt.`,
            html`<b>Die Hilfshöhenlinien</b>: die „basemap“-Höhenlinien von karttapullautin, alle 0,5 m (unter 5-m-Höhenlinien jeden Meter),
              kommen hellviolett in einen eigenen Teil, „Hilfshöhenlinien (LiDAR)“, den du nach Belieben ausblendest, und werden nie gedruckt
              (Signatur 996, ein Hilfsmittel). Sie zeigen die Formen zwischen zwei Höhenlinien: Darauf zeichnest du Formlinien, kleine Kuppen und
              kleine Senken von Hand.`,
            html`<b>Die gelesenen Punkte</b>: karttapullautin behält einen Teil der Punkte der Wolke (<code>thinfactor</code>), nach ihrer
              Dichte so gewählt, dass etwa 6 pro m² bleiben, 15 bis 20 % der Punkte des IGN. Gemessen auf zwei Kacheln des IGN (Stadt und Wald von
              Gif-sur-Yvette, Wald von Fontainebleau): gleiche Vegetation, gleiche Höhenlinien, ein paar kleine Felsen weniger, und eine Kachel in
              20 bis 45 s statt 40 bis 70 s berechnet (das Lesen der LiDAR-Datei bleibt).`,
            html`<b>Die übrigen Einstellungen</b> sind die von karttapullautin 2.15.4; das Fenster „LiDAR“ listet sie mit ihrer Wirkung auf:
              Glättung und Betonung der Höhenlinien, Auswahl der Kuppen, Neigung eines passierbaren (1,15 m pro Meter) und eines unpassierbaren
              Felsens (2 m pro Meter), Höhen von offenem Gelände und Vegetation, Schwelle der Unterwuchs-Streifen. In Carto lassen sie sich nicht
              ändern, da eine Kachel allen dient; karttapullautin lässt sich auch auf dem eigenen Rechner nutzen, mit eigenen Einstellungen.`,
          ])}`)}`,
      terrain: () => html`
        ${slide("Carto", "Im Gelände, mit dem Handy", html`
          <p>Auf einem Handy oder Tablet öffnet sich Carto im Reiter „Gelände“, mit fingergroßen Knöpfen:</p>
          ${list([
            html`<b>„Meine Position“</b>, über den Zoom-Knöpfen: deine GPS-Position auf der Karte und ihre Genauigkeit (unten, „GPS ± 6 m“). Die
              Karte folgt ihr, bis du die Karte verschiebst, und kehrt mit einem Tipp auf den Knopf zu ihr zurück; der Bildschirm bleibt an,
              solange sie angezeigt wird. Der Kompass dreht die Karte so, wie das Gelände vor dir liegt;`,
            html`<b>die Spur</b> deines Weges („Spur aufzeichnen“), ihre Länge während der Aufzeichnung angezeigt, als GPX-Hintergrund gespeichert;`,
            html`<b>Fotos und Notizen</b>, auf der Karte dort angeheftet, wo du stehst; ein Tipp auf eine Nadel öffnet die Notiz wieder, um sie als
              „Erledigt“ zu markieren oder zu löschen;`,
            html`<b>mit dem Finger zeichnen</b>: Ein Tipp wählt ein Objekt, ein Finger verschiebt die Karte, zwei Finger zoomen. Während des
              Zeichnens bietet eine Leiste am unteren Kartenrand „Punkt zurück“, „Verwerfen“ und „Fertig“ — was Rücktaste, Escape und Eingabe
              auf der Tastatur tun; mit dem Werkzeug „Stützpunkte“ wird ein angetippter Punkt ebenso entfernt oder von Ecke zu rund gewechselt.
              Die Signatur in der Hand steht auf dem Knopf der Signaturenliste, die sich schließt, sobald eine Signatur gewählt ist;`,
            html`<b>eine Offline-Kopie</b> der Karte: Ohne Netz zeichnest du weiter, und die Speicherungen gehen los, sobald das Netz zurück ist.`,
          ])}`)}`,
      imprimer: () => html`
        ${slide("Carto", "Drucken und teilen", html`
          ${list([
            html`<b>Das Layout</b>: der Druckbereich, die magnetischen Nordlinien, die Maßstabsleiste, die Legende, die Logos, die Vermerke, ein
              QR-Code.`,
            html`<b>Drucken</b>: ein Vektor-PDF in CMYK; für eine Offsetdruckerei die Schmuckfarben der Karte und die Farbauszüge, eine Seite pro
              Platte mit ihren Passermarken – dieselbe Technik wie bei der Bahnlegung.`,
            html`<b>Exportieren</b>: OCAD, OpenOrienteering Mapper, .ozmap (das Format von Ozimut, das alles behält, was für den Weg zurück zu OCAD
              nötig ist), ein PNG-Bild mit seiner Georeferenzierungsdatei, ein KMZ.`,
            html`<b>Zu den anderen Werkzeugen</b>: Die Karte geht mit einem Klick in die Bahnlegung oder nach ${P("#/mes-cartes", "Meine Karten")}.`,
          ])}`)}`,
      equipe: () => html`
        ${slide("Carto", "Im Team kartieren", html`
          <p>Eine Karte hat ihr Team: Man lädt per Link ein, als Kartograf (der zeichnet) oder als Leser; niemand wird über Namen oder E-Mail-Adresse
            gesucht. Mehrere Kartografen arbeiten gleichzeitig: Jeder sieht, wo die anderen sind, und reserviert sich einen <b>Sektor</b>, ein
            Rechteck, das die anderen nicht ändern; gleichzeitige Änderungen werden Objekt für Objekt zusammengeführt.</p>
          <p>Alle 30 Minuten Arbeit, oder wenn du ihr einen Namen gibst, wird eine Version gespeichert, die sich wiederherstellen lässt; Kommentare
            werden auf der Karte angeheftet. Ein gelöschtes Konto übergibt seine Karten dem ersten Kartografen ihres Teams.
            ${P("#/compte/confidentialite", "Website-Regeln und Datenschutz")} sagt, was gespeichert wird.</p>`)}`,
    });
  }

  const LABELS = { site: "Die Website", arena: "Die Wettkämpfe", coach: "Coach", orga: "Die Werkzeuge", carto: "Carto" };
  return { LABELS, LEDE, ARENA, COACH, ORGA, CARTO, site, arena, coach, orga, carto };
}
