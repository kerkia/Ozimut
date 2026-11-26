// This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not
// distributed with this file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The documentation of Chronoz's desktop application, in German (app.fr.js is the reference: the same
// sections under the same ids). Plain data read by the application's own page (src/ui/appdoc.js) and by Orga's
// documentation on the site (content/guide.de.js, chapter « chrono-app »).
export default {
  title: "Die Anwendung Chronoz",
  lede: "Die Zeitmessung von Ozimut, auf einem Computer installiert: ohne Internet, die Computer im Wettkampfzentrum miteinander verbunden, Belege ohne Druckdialog. Diese Anleitung ist dieselbe in der Anwendung (Hilfe › Dokumentation) und in der Orga-Dokumentation auf ozimut.com.",
  sections: [
    { id: "what", title: "Wozu die Anwendung dient", html: `
      <p>Die Anwendung Chronoz zeigt dieselben Bildschirme wie der Reiter „Chrono“ einer Orga-Veranstaltung auf ozimut.com. Dazu
        kann sie, was ein Browser-Tab nicht kann:</p>
      <ul>
        <li>sie läuft <b>ohne Internet</b>;</li>
        <li>sie <b>verbindet die Computer im Wettkampfzentrum</b> miteinander: Jeder, der sie hat, behält den ganzen Lauf und hält ihn mit den
          anderen auf dem Stand, ohne Hauptrechner; Telefone und Bildschirme öffnen im Browser die Adresse eines dieser Computer;</li>
        <li>sie schreibt jeden Vorgang in ein <b>Protokoll</b>, eine Datei pro Veranstaltung in einem Ordner des Computers;</li>
        <li>sie druckt die Belege <b>ohne Druckdialog</b>;</li>
        <li>sie empfängt die <b>Funkstempel</b> von Relais (SIRAP-Protokoll).</li>
      </ul>
      <p><b>Der Reiter allein genügt</b>, wenn ein einziger Computer zeitmisst oder wenn alle Stationen Internet haben: Sie halten sich
        dann über die Kopie auf Ozimut auf dem Stand. Um ein Chip-Lesegerät anzuschließen, braucht es Chrome oder Edge. <b>Ohne
        Internet</b> installierst du die Anwendung auf jedem Computer, der Chips ausliest oder Belege druckt (siehe „Die Computer im
        Wettkampfzentrum verbinden“).</p>
      <p><b>Freie Software.</b> Die Anwendung steht unter der Mozilla Public License 2.0 (MPL 2.0); ihr Quellcode liegt auf
        <a href="https://github.com/kerkia/Chronoz" target="_blank" rel="noopener">github.com/kerkia/Chronoz</a>. Sie funktioniert
        ohne ozimut.com: Ihre Verbindungen zu Ozimut — die Kopie der Veranstaltung auf Ozimut, das Veröffentlichen der Ergebnisse, die
        Live-Ergebnisse — sind freiwillig. „Ozimut“ und „Chronoz“ bleiben die Namen ihres Autors: Eine veränderte Version, die du an
        andere weitergibst, muss einen anderen Namen tragen.</p>
      <p><b>In der Testphase.</b> Wie der Reiter „Chrono“ von Ozimut wurde die Anwendung noch nie mit echten SPORTident- oder Emit-Stationen, mit einem
        Belegdrucker oder bei einem echten Wettkampf eingesetzt, und ihre Verbindungen wurden noch nicht zwischen echten Computern im Netz
        eines Wettkampfzentrums erprobt. Probiere sie bei einem Training oder neben deiner gewohnten Software aus.</p>` },
    { id: "install", title: "Herunterladen, installieren, deinstallieren", html: `
      <p>Die Dateien lädst du von der Release-Seite des Projekts herunter:
        <a href="https://github.com/kerkia/Chronoz/releases/latest" target="_blank" rel="noopener">github.com/kerkia/Chronoz/releases/latest</a>.
        Die Schaltfläche „Anwendung herunterladen“ im Reiter „Chrono“ von Ozimut (Vorbereiten › Verbindungen) führt zu denselben
        Dateien.</p>
      <table>
        <thead><tr><th>System</th><th>Datei</th><th>Was es ist</th></tr></thead>
        <tbody>
          <tr><td>Windows</td><td><code>Chronoz-Setup.exe</code></td><td>Das Installationsprogramm, empfohlen (etwa 100 MB). Es
            installiert die Anwendung für dein eigenes Konto, ohne Administratorrechte, und <b>sie hält sich danach selbst aktuell</b>.</td></tr>
          <tr><td>Windows</td><td><code>Chronoz-Portable.exe</code></td><td>Die portable Version: ein einziges Programm, nichts wird
            installiert. Starte es, von wo du willst, zum Beispiel von einem USB-Stick. Sie meldet neue Versionen, aktualisiert sich aber
            nicht selbst.</td></tr>
          <tr><td>macOS</td><td><code>Chronoz.dmg</code></td><td>Ein einziges Disk-Image für alle Macs, mit Apple-Chip wie mit
            Intel: Öffne es und ziehe die Anwendung in den Ordner „Programme“. Sie meldet neue Versionen, die du von Hand installierst.</td></tr>
          <tr><td>Linux</td><td><code>Chronoz.AppImage</code></td><td>Eine einzige Datei (64 Bit). Mache sie ausführbar —
            Eigenschaften › Zugriffsrechte oder <code>chmod +x Chronoz.AppImage</code> — und starte sie. Sie hält sich selbst
            aktuell.</td></tr>
        </tbody>
      </table>
      <p><b>Solange die Anwendung nicht signiert ist</b>, ist das System beim ersten Start misstrauisch:</p>
      <ul>
        <li><b>Windows</b> zeigt „Der Computer wurde durch Windows geschützt“: Wähle „Weitere Informationen“, dann „Trotzdem
          ausführen“.</li>
        <li><b>macOS</b> weigert sich zunächst, sie zu öffnen. In neueren Versionen: Systemeinstellungen › Datenschutz &amp; Sicherheit,
          dann „Dennoch öffnen“. In älteren Versionen: Rechtsklick auf die Anwendung, „Öffnen“, dann bestätigen.</li>
      </ul>
      <h3>Deinstallieren</h3>
      <ul>
        <li><b>Windows</b> (Installationsprogramm): Einstellungen › Apps › Chronoz › Deinstallieren. <b>Portable Version</b>: Lösche
          die Datei.</li>
        <li><b>macOS</b>: Lege die Anwendung in den Papierkorb.</li>
        <li><b>Linux</b>: Lösche die AppImage-Datei.</li>
      </ul>
      <p>Die Veranstaltungen bleiben in ihrem Ordner (Dokumente › „Chronoz“, siehe „Wo die Daten liegen“) und die Einstellungen im
        Einstellungsordner der Anwendung, bis du sie von Hand löschst.</p>` },
    { id: "first", title: "Erster Start", html: `
      <p>Das Fenster öffnet sich auf der Startseite: die Liste „Veranstaltungen“, die Karte „Neue Veranstaltung“ (ein Name, ein Datum, die
        Regeln des Landes — Frankreich, Kanada oder IOF-Regeln —, dann „Erstellen“) und die Karte „Im Netzwerk“, die Veranstaltungen der
        anderen Computer im Wettkampfzentrum, denen du mit ihrem Code beitrittst (siehe „Die Computer im Wettkampfzentrum verbinden“). Ist
        eine Veranstaltung geöffnet, läuft alles wie im Reiter: die Stationen Vorbereiten, Anmeldung, Start, Ziel, Übersicht, Sprecher,
        Schiedsrichter, Posten und Abschließen, beschrieben in der Orga-Dokumentation, Kapitel „Chrono“.</p>
      <ul>
        <li><b>Das Aussehen</b>: Die Startseite hat eine Auswahl „Design“ — die fünf Designs von ozimut.com, Tag, Lichtung, Wald, Unterholz
          und Nacht; Tag für pralle Sonne, Nacht für Nachtläufe — und eine Auswahl „Sprache“. Standardmäßig folgt das Design der hellen oder
          dunklen Einstellung des Systems (Lichtung oder Unterholz) und die Sprache der des Computers; die Menüs des Fensters (Datei, Hilfe…) folgen immer
          der Sprache des Systems. Jedes Gerät behält seine eigene Wahl:
          Ein Telefon oder ein Bildschirm kann ein anderes Design haben als der Computer.</li>
        <li><b>Ein Laptop</b>: Die Bildschirme der Anwendung sind für die Größe eines Laptops gemacht. Telefone und Tablets dienen den
          Seiten, die die Anwendung ihnen liefert (Sprecher, Ergebnisse, Schiedsrichter; siehe „Telefone und Bildschirme“).</li>
        <li><b>Der Ordner der Veranstaltungen</b> heißt „Chronoz“ und liegt in deinen Dokumenten; die Anwendung legt ihn an. Datei ›
          „Datenordner öffnen“ zeigt ihn.</li>
        <li><b>Eine Veranstaltungsdatei</b> (.chronoz) öffnest du mit einem Doppelklick (mit der installierten Version) oder über Datei ›
          „Veranstaltungsdatei öffnen…“: Ihre Vorgänge kommen zu dieser Veranstaltung in der Anwendung hinzu, ohne etwas zu verdoppeln,
          und die Veranstaltung öffnet sich.</li>
        <li><b>Nur eine Anwendung auf einmal</b>: Ein zweiter Start holt das schon offene Fenster nach vorn.</li>
        <li><b>Die Firewall</b>: Beim ersten Start fragt Windows, ob Chronoz im Netzwerk kommunizieren darf. Erlaube es für private
          Netzwerke: Sonst finden die anderen Computer im Wettkampfzentrum sie nicht, und Telefone können sie nicht öffnen.</li>
        <li><b>Das Menü</b>: Datei (eine Datei öffnen, den Ordner öffnen, beenden), Bearbeiten, Ansicht (neu laden, Zoom, Vollbild),
          Hilfe › „Dokumentation“ (<kbd>F1</kbd>), „Nach Updates suchen…“ und „Chronoz aktuell halten“ (siehe „Aktualisieren“) und
          „Über Chronoz“ mit der Version, der Adresse für Telefone und andere Computer (mit dem Schlüssel der Anwendung), dem Port der
          Funkstempel und dem Datenordner.</li>
      </ul>` },
    { id: "hub", title: "Die Computer im Wettkampfzentrum verbinden", html: `
      <p>Alle Computer, auf denen die Anwendung läuft, sind gleichberechtigt: kein Hauptrechner, kein zentraler Computer, den man wählen
        müsste. Jeder behält seine vollständige Kopie des Laufs und sein eigenes Protokoll. Sie müssen nur im selben lokalen Netz sein — ein
        WLAN-Zugangspunkt oder ein einfacher Router genügt, ohne Internet.</p>
      <h3>Wie sie sich finden</h3>
      <p>Alle paar Sekunden meldet jede Anwendung im lokalen Netz, wer sie ist, welche Version sie hat und welche Veranstaltungen sie hat
        (deren Namen und Datum, nie deren Code). Zwei Anwendungen mit derselben Veranstaltung verbinden sich von selbst und halten sich
        gegenseitig auf dem Stand. Die Verbindungen laufen über jeden beliebigen der Computer: Es genügt, dass jeder mindestens einen anderen
        erreicht. Ein Computer, der geht oder neu startet, holt bei seiner Rückkehr von selbst nach, was ohne ihn geschehen ist.</p>
      <h3>Der Code der Veranstaltung</h3>
      <p>Jede Veranstaltung hat einen Code aus sechs Zeichen, Buchstaben und Ziffern, die sich nicht verwechseln lassen (nie O, 0, I, L oder
        1). Er steht groß in Vorbereiten › Verbindungen, Karte „Die anderen Rechner im Wettkampfzentrum“, unter „Code der Veranstaltung“. Er
        entsteht von selbst mit der Veranstaltung, in der Anwendung wie im Reiter „Chrono“ von Ozimut. Er schützt die Veranstaltung: Ein
        anderer Computer muss ihn kennen, um sich zu verbinden, und er wird nie im Netz gemeldet — eine Anwendung beweist, dass sie ihn
        kennt, ohne ihn zu nennen.</p>
      <h3>Der Veranstaltung von einem anderen Computer aus beitreten</h3>
      <ol>
        <li>Installiere die Anwendung auf diesem Computer und öffne sie.</li>
        <li>Ihre Startseite hat eine Karte „Im Netzwerk“: die Veranstaltungen der anderen Computer im Wettkampfzentrum, jeweils mit dem
          Computer, der sie hat („auf PC-Ziel“). Klicke auf die Veranstaltung.</li>
        <li>Gib ihren Code ein, in Groß- oder Kleinbuchstaben, dann „Beitreten“. Die Veranstaltung öffnet sich und füllt sich in wenigen
          Augenblicken. Ein falscher Code wird abgelehnt: „Das ist nicht der Code dieser Veranstaltung.“</li>
      </ol>
      <p>Der Code wird nur einmal gefragt: Danach verbindet sich dieser Computer von selbst, bei jedem Start, in jedem Netz. Nach einem
        Neustart ist nichts zu wiederholen.</p>
      <p>In Vorbereiten › Verbindungen nennt die Karte „Die anderen Rechner im Wettkampfzentrum“ den Code, die verbundenen Computer („2 weitere
        Rechner verbunden: PC-Ziel, PC-Anmeldung“ oder „Noch kein anderer Rechner teilt diese Veranstaltung…“) und die anderen Anwendungen,
        die im Netz zu sehen sind. Die Leiste oben fasst es zusammen: „1 weiterer Rechner verbunden“, „Kein anderer Rechner“.</p>
      <h3>Überall dieselbe Version</h3>
      <p>Die Computer eines Teams müssen dieselbe Version der Anwendung haben. Haben verbundene oder im Netz gesehene Computer eine andere
        Version, sagt es Vorbereiten › Verbindungen („Unterschiedliche Versionen: … (dieser Rechner: …). Aktualisiere alle Rechner vor dem
        Wettkampf.“), und das Verbindungs-Symbol in der Leiste oben wird orange. Miss keinen Wettkampf mit gemischten Versionen: Aktualisiere
        die Computer vorher (siehe „Aktualisieren“).</p>
      <h3>Ein Rechner erscheint nicht?</h3>
      <p>Manche Netze (öffentliches WLAN, Schulnetz) verhindern, dass sich Computer finden. Öffne in Vorbereiten › Verbindungen „Ein Rechner
        erscheint nicht?“, gib die Adresse und den Schlüssel der Anwendung des anderen Computers ein und wähle „Verbinden“. Ihr Menü Hilfe ›
        „Über Chronoz“ nennt eine Adresse der Form <code>http://192.168.1.20:8377/?k=…</code>: Die Adresse ist
        <code>192.168.1.20:8377</code>, der Schlüssel das, was auf <code>?k=</code> folgt. Auch diese Verbindung bleibt von einem Start zum
        nächsten erhalten.</p>
      <h3>Telefone und Bildschirme</h3>
      <p>Ein Telefon, ein Tablet oder ein Bildschirm (Sprecher, Ergebnisse, Schiedsrichter, Startliste) braucht nichts zu installieren: Sein
        Browser öffnet die Adresse eines beliebigen Computers, auf dem die Anwendung läuft. Vorbereiten › Verbindungen nennt sie („Handys und
        Bildschirme ohne die Anwendung (Sprecher, Ergebnisse, Schiedsrichter): öffne <code>http://192.168.1.20:8377/?k=…</code>“), Hilfe ›
        „Über Chronoz“ ebenso. Was auf <code>?k=</code> folgt, ist der <b>Schlüssel</b> dieser Anwendung; ohne ihn fragt die Seite
        danach, in einem Feld mit einem Schlüsselsymbol. Wähle die Veranstaltung in der Liste: Diese Station sieht den Lauf nach wenigen
        Augenblicken und schreibt hinein wie die anderen. Eine Station, die das Netz verliert, arbeitet allein weiter und verbindet sich von
        selbst wieder; nichts geht verloren.</p>
      <h3>Eine Station, eine Rolle</h3>
      <p>Hänge <code>&amp;role=</code> an die Adresse, damit eine Station nur zeigt, was sie betrifft, zum Beispiel
        <code>http://192.168.1.20:8377/?k=…&amp;role=start</code>:</p>
      <table>
        <thead><tr><th>Rolle</th><th>Gezeigte Stationen</th></tr></thead>
        <tbody>
          <tr><td><code>desk</code></td><td>Anmeldung</td></tr>
          <tr><td><code>start</code></td><td>Start</td></tr>
          <tr><td><code>finish</code></td><td>Ziel und Übersicht</td></tr>
          <tr><td><code>speaker</code></td><td>Sprecher und Übersicht</td></tr>
          <tr><td><code>referee</code></td><td>Schiedsrichter und Übersicht</td></tr>
          <tr><td>(ohne Rolle)</td><td>Alle Stationen</td></tr>
        </tbody>
      </table>
      <p>Ist die Veranstaltung geöffnet, nennt die Adresse im Browser sie (<code>&amp;ev=…</code>): Lege sie als Lesezeichen ab, sie
        öffnet diese Veranstaltung direkt wieder, in dieser Rolle.</p>
      <h3>Chip-Lesegeräte und Belegdrucker</h3>
      <p>Ein Browser lässt eine Seite nur dann mit einem Chip-Lesegerät oder mit einem Belegdrucker an seriellem Anschluss sprechen, wenn
        sie von einer sicheren Website oder vom Computer selbst kommt. Eine Seite, die an der Adresse eines anderen Computers geöffnet wird,
        kann also keine Chips auslesen: Sie eignet sich für den Start, die Übersicht, den Sprecher, den Schiedsrichter, die Anmeldung ohne
        Lesegerät. <b>Jeder Computer, der Chips ausliest oder Belege druckt, hat die Anwendung</b>, mit den anderen verbunden wie oben.</p>
      <h3>Was wir empfehlen</h3>
      <ul>
        <li><b>Ein oder zwei Tage vor dem Wettkampf</b>, zu Hause mit Internet: Öffne die Anwendung auf jedem der Computer, damit alle
          dieselbe Version haben.</li>
        <li><b>Ohne Internet im Wettkampfzentrum</b>: Installiere die Anwendung auf jedem Computer, der Chips ausliest oder Belege druckt;
          erstelle (oder importiere) die Veranstaltung auf einem von ihnen; auf jedem anderen: Startseite › „Im Netzwerk“ › die
          Veranstaltung › ihr Code. Telefone und Bildschirme öffnen die Adresse aus Vorbereiten › Verbindungen.</li>
        <li><b>Mit Internet</b>: überall der Reiter „Chrono“ von Ozimut, oder die Anwendung, die das stille Drucken der Belege hinzufügt —
          direkt auf den gewählten Drucker, ohne Druckdialog — und eine Kopie des Laufs auf der Festplatte des Computers.</li>
      </ul>
      <p><b>Noch nicht in einem echten Wettkampfzentrum erprobt.</b> Die Verbindungen wurden nur zwischen mehreren Anwendungen auf einem
        Computer getestet, noch nie zwischen echten Laptops im Netz eines Wettkampfzentrums. Manche Netze blockieren die Meldungen: Dann
        hilft „Ein Rechner erscheint nicht?“.</p>` },
    { id: "tab", title: "Den Ozimut-Reiter mit der Anwendung verbinden", html: `
      <p>Der Reiter „Chrono“ einer Veranstaltung auf ozimut.com dient zum Vorbereiten zu Hause und zur Zeitmessung in einem
        Wettkampfzentrum mit Internet: Die im Reiter geöffneten Stationen halten sich über die Kopie auf Ozimut auf dem Stand.</p>
      <p>Auf einem Computer, auf dem die Anwendung läuft, kann sich der Reiter auch mit ihr verbinden: Vorbereiten › Verbindungen › „Die App
        auf diesem Computer suchen“ (Chrome oder Edge). Die Leiste oben zeigt dann „Anwendung“, danach die Zahl der anderen verbundenen
        Computer. Von da an ist die Veranstaltung des Reiters auch in der Anwendung, mit ihrem Protokoll im Ordner, und die anderen Computer
        im Wettkampfzentrum können ihr mit ihrem Code beitreten.</p>
      <p><b>Der Reiter verbindet sich nur mit der Anwendung seines eigenen Computers</b>, nie mit der eines anderen: Eine sichere Seite (https)
        darf nicht mit einer unverschlüsselten lokalen Seite (http) sprechen. Mit Internet im Wettkampfzentrum können alle einfach den Reiter
        nutzen; ohne Internet nimm die Anwendung auf jedem Computer.</p>
      <p>Wozu es dient, den Reiter mit der Anwendung zu verbinden: Der Reiter ist bei Ozimut angemeldet — die Kopie auf Ozimut, die
        Live-Ergebnisse, „Auf Ozimut veröffentlichen“ —, und die Anwendung verbindet die Computer im Wettkampfzentrum ohne Internet. Im Reiter
        erzeugt „Den anderen Stationen Zugang geben“ einen Schlüssel, der mit dem Lauf mitreist: Die Computer mit der Anwendung tauschen dann
        ebenfalls mit Ozimut aus, wenn sie Internet haben.</p>
      <p>Antwortet der Reiter „Die App Chronoz wurde auf diesem Computer nicht gefunden.“: Prüfe, ob sie läuft, und erteile die
        Erlaubnis, falls der Browser fragt, ob er auf Geräte im lokalen Netzwerk zugreifen darf.</p>` },
    { id: "print", title: "Belege ohne Druckdialog drucken", html: `
      <p>In Vorbereiten › Geräte › „Belegdrucker“ fügt die Anwendung bei „Drucken auf“ eine Auswahl hinzu: „Dem gewählten Drucker, ohne
        Dialog (App)“.</p>
      <ul>
        <li>„Drucker“ listet die auf dem Computer installierten Drucker auf; der Standarddrucker trägt einen Stern. Der Belegdrucker muss
          also zuerst im System installiert sein, mit seinem Treiber.</li>
        <li>„Papier“: 58 mm oder 80 mm. „Testbeleg“ prüft das Ganze.</li>
        <li>„Den Beleg drucken, sobald ein Chip ausgelesen ist“ (oder „Beleg automatisch“ an der Station Ziel) druckt ohne Rückfrage.</li>
      </ul>
      <p>Die Listen (Ergebnisse, Startlisten, Rechnungen) laufen über den Druckdialog des Systems. Exportierte Dateien fragen, wohin sie
        gespeichert werden sollen: beim ersten Mal in den Ordner der Veranstaltungen, danach in den zuletzt benutzten Ordner.</p>` },
    { id: "readers", title: "Die Chip-Lesegeräte", html: `
      <p>Die Schaltflächen sind die des Reiters: Vorbereiten › Geräte › „SPORTident“, „Emit“ oder „Emit eScan“, oder das Menüband der
        Station Ziel. Die Anwendung wählt den Anschluss selbst: Gibt es nur einen seriellen Anschluss, ist es dieser; gibt es mehrere, den
        der SPORTident-Station; bleiben mehrere übrig, fragt sie „Welcher gehört zum Lesegerät?“.</p>
      <ul>
        <li>„Uhr stellen“ stellt das Lesegerät auf die Zeit des Computers: Prüfe zuerst die Uhrzeit des Computers.</li>
        <li><b>Emit</b>: das Lesegerät 250 und das MTR4. Von einem eScan oder eScan2 werden nur sein Status und emiTag-Durchgänge
          empfangen, nicht der Inhalt der Chips.</li>
      </ul>` },
    { id: "radio", title: "Die Funkstempel (SIRAP)", html: `
      <p>Die Anwendung hört auf <b>TCP-Port 10000</b> auf die Stempel, die Funkrelais über das SIRAP-Protokoll senden. Stelle das Relais
        oder seine Software so ein, dass es an die Adresse dieses Computers sendet, Port 10000.</p>
      <ul>
        <li>Die Stempel gehen an die <b>zuletzt geöffnete Veranstaltung</b> der Anwendung.</li>
        <li>Sie erscheinen an der Station Sprecher („Funk-Durchgänge“). Setze an der Station „Posten“ das Häkchen „Funkposten“ an der
          Einheit.</li>
        <li>Derselbe Stempel, zweimal weitergeleitet, zählt nur einmal. Ein ganzer Chip, den ein Relais sendet, gilt als ausgelesener
          Chip.</li>
        <li>Ist Port 10000 von einer anderen Zeitmess-Software belegt, startet die Anwendung ohne Funk, und „Über“ sagt es. Schließe das
          andere Programm und starte die Anwendung neu.</li>
      </ul>` },
    { id: "data", title: "Wo die Daten liegen", html: `
      <ul>
        <li><b>Die Veranstaltungen</b>: in Dokumente › „Chronoz“, ein Protokoll pro Veranstaltung,
          <code>&lt;Veranstaltung&gt;.chronoz.jsonl</code>. Jeder Vorgang wird dort angehängt und in dem Moment auf die Platte
          geschrieben, in dem er geschieht; die Datei wird nie neu geschrieben. Sie wird wieder gelesen, wenn die Veranstaltung erneut
          geöffnet wird (eine letzte, durch einen Stromausfall abgeschnittene Zeile wird übergangen). Jeder Computer im Wettkampfzentrum hat
          sein eigenes, vollständiges Protokoll.</li>
        <li><b>Die Datei <code>hub.json</code></b> daneben merkt sich die Identität dieses Computers im Netz, die zuletzt geöffnete
          Veranstaltung, die Codes, die zum Beitreten eingegeben wurden, und die von Hand hinzugefügten Adressen („Ein Rechner erscheint
          nicht?“).</li>
        <li><b>Sichern</b> heißt, diesen Ordner zu kopieren. Ein Protokoll öffnest du auf einem anderen Computer über Datei ›
          „Veranstaltungsdatei öffnen…“.</li>
        <li><b>Die Einstellungen</b>: <code>settings.json</code> im Einstellungsordner der Anwendung — <code>%APPDATA%\\Chronoz</code>
          unter Windows, <code>~/Library/Application Support/Chronoz</code> unter macOS, <code>~/.config/Chronoz</code> unter
          Linux: der Schlüssel der Anwendung (nach dem Telefone und von Hand hinzugefügte Verbindungen fragen), der zuletzt benutzte
          Speicherordner und, falls du es abgewählt hast, die Wahl „Chronoz aktuell halten“. Eine Zeile <code>"folder"</code>, von Hand
          bei geschlossener Anwendung ergänzt, legt die Veranstaltungen in einen anderen Ordner.</li>
        <li>Das Protokoll enthält Namen, Vereine, Lizenz- und Chipnummern und den Code der Veranstaltung: Bewahre diesen Ordner so auf wie
          deine Ergebnisdateien.</li>
      </ul>
      <h3>Was den Computer verlässt</h3>
      <p>Alles bleibt auf dem Computer und auf den Computern im Wettkampfzentrum, die du verbindest. Im lokalen Netz meldet die Anwendung den
        Namen des Computers, ihre Version sowie Namen und Datum ihrer Veranstaltungen; sie tauscht einen Lauf nur mit den Computern aus, die
        seinen Code oder ihren Schlüssel kennen. Im Internet tut sie nur zweierlei: GitHub fragen, ob es eine neue Version gibt (siehe
        „Aktualisieren“; nichts über den Computer, dich oder deine Veranstaltungen wird gesendet), und was du mit ozimut.com von ihr
        verlangst — eine Veranstaltung tauscht nur dann mit Ozimut aus, wenn die Kopie vom Ozimut-Reiter aus eingerichtet wurde („Den
        anderen Stationen Zugang geben“).</p>` },
    { id: "update", title: "Aktualisieren", html: `
      <p>Beim Start und danach alle sechs Stunden fragt die Anwendung bei GitHub nach, ob es eine neuere Version gibt. Nichts über den
        Computer, dich oder deine Veranstaltungen wird gesendet; ohne Internet passiert nichts. Wie es weitergeht, hängt davon ab, wie die
        Anwendung installiert wurde:</p>
      <ul>
        <li><b>Windows, mit <code>Chronoz-Setup.exe</code> installiert, und Linux (AppImage)</b>: Die neue Version wird im Hintergrund
          heruntergeladen und <b>beim Schließen der Anwendung</b> installiert. In der Leiste oben einer Veranstaltung erscheint dann „Update x
          bereit“, und das Menü Hilfe bietet „Neu starten und Version x installieren“ an. Ein sofortiger Neustart wird nie erzwungen; mach ihn
          nicht, während Chips ausgelesen werden, denn die Anwendung schließt sich für eine Minute.</li>
        <li><b>macOS und die portable Windows-Version</b>: Die Anwendung meldet nur, dass es eine neue Version gibt — „Version x verfügbar“
          und Hilfe › „Version x herunterladen…“, das die Download-Seite öffnet. Lade sie herunter und installiere sie von Hand, wie beim
          ersten Mal (siehe „Herunterladen, installieren, deinstallieren“).</li>
        <li>Hilfe › „Nach Updates suchen…“ prüft sofort und gibt die Antwort. Hilfe › „Chronoz aktuell halten“ (standardmäßig
          angehakt) stellt die Prüfungen ab oder wieder an.</li>
        <li><b>Die laufende Version</b> steht in Hilfe › „Über Chronoz“. Veranstaltungen und Einstellungen bleiben von einer Version
          zur nächsten erhalten.</li>
        <li>Eine Veranstaltungsdatei aus einer neueren Version wird mit einer Meldung abgelehnt: Aktualisiere die Anwendung, um sie zu
          öffnen.</li>
      </ul>
      <h3>Vor einem Wettkampf</h3>
      <p>Öffne die Anwendung ein oder zwei Tage vorher zu Hause mit Internet <b>auf jedem der Computer</b> und lass sie sich aktualisieren:
        So haben alle dieselbe Version. Im Wettkampfzentrum ohne Internet melden die auf einer Veranstaltung verbundenen Computer, wenn ihre
        Versionen voneinander abweichen (Vorbereiten › Verbindungen, und das Verbindungs-Symbol wird orange): Ein Team sollte keinen
        Wettkampf mit gemischten Versionen messen.</p>
      <p>Die Anwendung ist noch nicht signiert: Eine von Hand heruntergeladene Version löst dieselben Warnungen von Windows oder macOS aus
        wie beim ersten Mal (siehe „Herunterladen, installieren, deinstallieren“).</p>` },
    { id: "trouble", title: "Wenn etwas nicht klappt", html: `
      <table>
        <thead><tr><th>Was passiert</th><th>Was zu tun ist</th></tr></thead>
        <tbody>
          <tr><td>„Chronoz kann nicht starten“: Die Ports 8377 bis 8387 sind alle belegt.</td><td>Die Anwendung nimmt Port 8377
            oder, wenn er belegt ist, den ersten freien bis 8387. Schließe das Programm, das sie belegt. Ist der Port nicht 8377, ändert
            sich die Adresse für die Telefone: Vorbereiten › Verbindungen und „Über“ nennen die richtige.</td></tr>
          <tr><td>„Der Datenordner kann nicht benutzt werden“.</td><td>In den Ordner „Chronoz“ der Dokumente lässt sich nicht
            schreiben (geschützter Ordner oder laufende Synchronisierung): Gib ihn frei oder nenne in <code>settings.json</code> einen
            anderen Ordner.</td></tr>
          <tr><td>Ein anderer Computer erscheint nicht unter „Im Netzwerk“, die Leiste zeigt „Kein anderer Rechner“, oder „Der andere Rechner
            antwortet nicht.“</td><td>Prüfe, ob er eingeschaltet ist, ob die Anwendung dort läuft und ob er im selben Netz ist. Beim ersten
            Start fragt Windows einmal, ob Chronoz in privaten Netzwerken zugelassen wird: Stimme zu (sonst lass es in der
            Windows-Firewall zu). Manche WLANs isolieren die Geräte voneinander oder blockieren die Meldungen, wie öffentliche Netze und
            Schulnetze: Nimm dann „Ein Rechner erscheint nicht?“. Zwischen den Computern müssen der UDP-Port 8379 (die Meldungen) und der
            TCP-Port 8377 (die Verbindungen und die Seiten) durchgehen.</td></tr>
          <tr><td>„Das ist nicht der Code dieser Veranstaltung.“</td><td>Gib den Code erneut ein, den der andere Computer in Vorbereiten ›
            Verbindungen anzeigt. Er enthält nie O, 0, I, L oder 1.</td></tr>
          <tr><td>„Unterschiedliche Versionen: …“, oder das Verbindungs-Symbol ist orange.</td><td>Die verbundenen Computer haben nicht
            dieselbe Version. Aktualisiere sie alle mit Internet vor dem Wettkampf (siehe „Aktualisieren“); ohne Internet im
            Wettkampfzentrum installiere auf jedem dieselbe, vorher heruntergeladene Datei.</td></tr>
          <tr><td>Hilfe › „Nach Updates suchen…“ antwortet „Der Update-Server ist nicht erreichbar.“</td><td>Der Computer hat kein Internet,
            oder GitHub antwortet nicht. Keine Eile: Die Anwendung prüft beim Start und alle sechs Stunden erneut.</td></tr>
          <tr><td>Ein Telefon öffnet die Adresse nicht.</td><td>Prüfe, ob es im selben Netz ist wie der Computer, ob dessen Firewall „Chronoz“
             durchlässt, ob das WLAN die Geräte nicht voneinander isoliert und ob die Adresse die aus Vorbereiten › Verbindungen oder
            „Über“ ist.</td></tr>
          <tr><td>Die Seite fragt nach einem Schlüssel.</td><td>Tippe ein, was in der Adresse aus Vorbereiten › Verbindungen oder „Über“ auf
            <code>?k=</code> folgt.</td></tr>
          <tr><td>Windows oder der Virenschutz blockiert die Anwendung.</td><td>Sie ist noch nicht signiert: siehe „Herunterladen,
            installieren, deinstallieren“.</td></tr>
          <tr><td>Das Chip-Lesegerät wird nicht erkannt.</td><td>Prüfe das Kabel und den USB-Treiber des Lesegeräts; schließe jedes andere
            Programm, das seinen Anschluss belegt (eine andere Zeitmess-Software, das Konfigurationsprogramm der Stationen, einen in
            einem Browser geöffneten Chrono-Reiter); stecke es aus und wieder ein, wähle dann „Trennen“ und schließe das Lesegerät in
            Chronoz erneut an.</td></tr>
          <tr><td>Der Beleg kommt nicht heraus.</td><td>Drucke einen „Testbeleg“; prüfe den gewählten Drucker, das Papier und ob der
            Drucker aus einem anderen Programm druckt.</td></tr>
          <tr><td>Die Funkstempel kommen nicht an.</td><td>„Über“ sagt, ob Port 10000 belegt ist; prüfe die am Relais eingestellte
            Adresse und den Port und ob die richtige Veranstaltung zuletzt geöffnet wurde.</td></tr>
          <tr><td>Das Fenster bleibt leer oder eingefroren.</td><td>Ansicht › „Neu laden“. Nichts geht verloren: Der Lauf steht im
            Protokoll.</td></tr>
        </tbody>
      </table>` },
  ],
};
