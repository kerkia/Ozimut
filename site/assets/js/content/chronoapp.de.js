// The documentation of Ozimut Chrono's desktop application, in German (chronoapp.fr.js is the reference: the same
// sections under the same ids). Plain data read by the application's own page (chrono/ui/appdoc.js) and by Orga's
// documentation on the site (content/guide.de.js, chapter « chrono-app »).
export default {
  title: "Die Anwendung Ozimut Chrono",
  lede: "Die Zeitmessung von Ozimut, auf einem Computer installiert: ohne Internet, mehrere Stationen verbunden, Belege ohne Druckdialog. Diese Anleitung ist dieselbe in der Anwendung (Hilfe › Dokumentation) und in der Orga-Dokumentation auf ozimut.com.",
  sections: [
    { id: "what", title: "Wozu die Anwendung dient", html: `
      <p>Die Anwendung Ozimut Chrono zeigt dieselben Bildschirme wie der Reiter „Chrono“ einer Orga-Veranstaltung auf ozimut.com. Dazu
        kann sie, was ein Browser-Tab nicht kann:</p>
      <ul>
        <li>sie läuft <b>ohne Internet</b>;</li>
        <li>sie ist ein <b>Hub</b>: Die anderen Computer und die Telefone im lokalen Netz öffnen ihre Adresse im Browser und arbeiten am
          selben Lauf;</li>
        <li>sie schreibt jeden Vorgang in ein <b>Protokoll</b>, eine Datei pro Veranstaltung in einem Ordner des Computers;</li>
        <li>sie druckt die Belege <b>ohne Druckdialog</b>;</li>
        <li>sie empfängt die <b>Funkstempel</b> von Relais (SIRAP-Protokoll).</li>
      </ul>
      <p><b>Der Reiter allein genügt</b>, wenn ein einziger Computer zeitmisst oder wenn alle Stationen Internet haben: Sie halten sich
        dann über die Kopie auf Ozimut auf dem Stand. Um ein Chip-Lesegerät anzuschließen, braucht es Chrome oder Edge.</p>
      <p><b>In der Testphase.</b> Wie Chrono selbst wurde die Anwendung noch nie mit echten SPORTident- oder Emit-Stationen, mit einem
        Belegdrucker oder bei einem echten Wettkampf eingesetzt. Probiere sie bei einem Training oder neben deiner gewohnten Software aus.</p>` },
    { id: "install", title: "Herunterladen und installieren", html: `
      <p>Die Dateien lädst du von Ozimut herunter: Orga › Meine Veranstaltungen › eine Veranstaltung › Reiter „Chrono“ › Vorbereiten ›
        Verbindungen › „Anwendung herunterladen“.</p>
      <table>
        <thead><tr><th>System</th><th>Datei</th><th>Was es ist</th></tr></thead>
        <tbody>
          <tr><td>Windows</td><td><code>Ozimut-Chrono-Setup.exe</code></td><td>Das Installationsprogramm, empfohlen (etwa 100 MB). Es
            installiert die Anwendung für dein eigenes Konto, ohne Administratorrechte.</td></tr>
          <tr><td>Windows</td><td><code>Ozimut-Chrono-Portable.exe</code></td><td>Die portable Version: ein einziges Programm, nichts wird
            installiert. Starte es, von wo du willst, zum Beispiel von einem USB-Stick.</td></tr>
          <tr><td>macOS</td><td><code>Ozimut-Chrono.dmg</code></td><td>Ein einziges Disk-Image für alle Macs, mit Apple-Chip wie mit
            Intel: Öffne es und ziehe die Anwendung in den Ordner „Programme“.</td></tr>
          <tr><td>Linux</td><td><code>Ozimut-Chrono.AppImage</code></td><td>Eine einzige Datei (64 Bit). Mache sie ausführbar —
            Eigenschaften › Zugriffsrechte oder <code>chmod +x Ozimut-Chrono.AppImage</code> — und starte sie.</td></tr>
        </tbody>
      </table>
      <p><b>Solange die Anwendung nicht signiert ist</b>, ist das System beim ersten Start misstrauisch:</p>
      <ul>
        <li><b>Windows</b> zeigt „Der Computer wurde durch Windows geschützt“: Wähle „Weitere Informationen“, dann „Trotzdem
          ausführen“.</li>
        <li><b>macOS</b> weigert sich zunächst, sie zu öffnen. In neueren Versionen: Systemeinstellungen › Datenschutz &amp; Sicherheit,
          dann „Dennoch öffnen“. In älteren Versionen: Rechtsklick auf die Anwendung, „Öffnen“, dann bestätigen.</li>
      </ul>` },
    { id: "first", title: "Erster Start", html: `
      <p>Das Fenster öffnet sich auf der Startseite: die Liste „Veranstaltungen“ und die Karte „Neue Veranstaltung“ (ein Name, ein Datum,
        die Regeln des Landes — Frankreich, Kanada oder IOF-Regeln —, dann „Erstellen“). Ist eine Veranstaltung geöffnet, läuft alles wie
        im Reiter: die Stationen Vorbereiten, Anmeldung, Start, Ziel, Übersicht, Sprecher, Schiedsrichter, Posten und Abschließen,
        beschrieben in der Orga-Dokumentation, Kapitel „Chrono“.</p>
      <ul>
        <li><b>Der Ordner der Veranstaltungen</b> heißt „Ozimut Chrono“ und liegt in deinen Dokumenten; die Anwendung legt ihn an. Datei ›
          „Datenordner öffnen“ zeigt ihn.</li>
        <li><b>Eine Veranstaltungsdatei</b> (.ozchrono) öffnest du mit einem Doppelklick (mit der installierten Version) oder über Datei ›
          „Veranstaltungsdatei öffnen…“: Ihre Vorgänge kommen zu dieser Veranstaltung in der Anwendung hinzu, ohne etwas zu verdoppeln,
          und die Veranstaltung öffnet sich.</li>
        <li><b>Nur eine Anwendung auf einmal</b>: Ein zweiter Start holt das schon offene Fenster nach vorn.</li>
        <li><b>Die Firewall</b>: Beim ersten Start fragt Windows unter Umständen, ob andere Computer die Anwendung erreichen dürfen.
          Erlaube es für private Netzwerke, wenn sich andere Stationen verbinden sollen.</li>
        <li><b>Das Menü</b>: Datei (eine Datei öffnen, den Ordner öffnen, beenden), Bearbeiten, Ansicht (neu laden, Zoom, Vollbild),
          Hilfe › „Dokumentation“ (<kbd>F1</kbd>) und „Über Ozimut Chrono“ mit der Version, den Adressen für die anderen Stationen, dem
          Port der Funkstempel und dem Datenordner.</li>
      </ul>` },
    { id: "hub", title: "Andere Computer und Telefone verbinden", html: `
      <p>Die Anwendung ist ein Hub: Alle Geräte im selben lokalen Netz — ein WLAN-Zugangspunkt oder ein einfacher Router genügt, ohne
        Internet — können am selben Lauf arbeiten.</p>
      <ol>
        <li>Öffne auf dem Computer der Anwendung Hilfe › „Über Ozimut Chrono“: Das Fenster nennt die Adresse, die zu öffnen ist, in der
          Form <code>http://192.168.1.20:8377/?k=…</code>. Was auf <code>?k=</code> folgt, ist der <b>Schlüssel</b> des Hubs.</li>
        <li>Öffne diese Adresse auf dem anderen Computer oder dem Telefon im Browser. Ohne den Schlüssel fragt die Seite danach, in einem
          Feld mit einem Schlüsselsymbol.</li>
        <li>Wähle die Veranstaltung in der Liste. Diese Station sieht den Lauf nach wenigen Augenblicken und schreibt hinein wie die
          anderen.</li>
      </ol>
      <p>Eine Station, die das Netz verliert, arbeitet allein weiter und verbindet sich von selbst wieder; nichts geht verloren.</p>
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
      <h3>Chip-Lesegeräte an den anderen Stationen</h3>
      <p>Ein Browser lässt eine Seite nur dann mit einem Chip-Lesegerät oder mit einem Belegdrucker an seriellem Anschluss sprechen, wenn
        sie von einer sicheren Website oder vom Computer selbst kommt. Eine Seite, die von einem anderen Computer aus an der Adresse des
        Hubs geöffnet wird, kann also keine Chips auslesen: Sie eignet sich für die Anmeldung ohne Lesegerät, den Start, die Übersicht,
        den Sprecher, den Schiedsrichter. Für eine zweite Auslesestation:</p>
      <ul>
        <li>mit Internet: Öffne auf diesem Computer den Reiter „Chrono“ der Veranstaltung auf ozimut.com, in Chrome oder Edge; er hält
          sich über die Kopie auf Ozimut auf dem Stand;</li>
        <li>ohne Internet: Installiere die Anwendung auch dort, öffne darin die Veranstaltungsdatei (.ozchrono), die auf dem ersten
          Computer gespeichert wurde, gib dann in Vorbereiten › Verbindungen die Adresse des ersten (<code>192.168.1.20:8377</code>) und
          den „Hub-Schlüssel“ ein und wähle „Verbinden“. Das ist nach jedem Neustart der Anwendung zu wiederholen.</li>
      </ul>` },
    { id: "tab", title: "Den Ozimut-Reiter mit der Anwendung verbinden", html: `
      <p>Öffne auf dem Computer der Anwendung zusätzlich den Reiter „Chrono“ der Veranstaltung auf ozimut.com (Chrome oder Edge), dann
        Vorbereiten › Verbindungen › „Die App auf diesem Computer suchen“. Der Reiter verbindet sich mit der Anwendung, und die Leiste
        oben zeigt „Hub“. Von da an ist die Veranstaltung des Reiters auch in der Anwendung, mit ihrem Protokoll im Ordner.</p>
      <p>Wozu das dient: Der Reiter ist bei Ozimut angemeldet — die Kopie auf Ozimut, die Live-Ergebnisse, „Auf Ozimut veröffentlichen“ —,
        und die Anwendung verbindet die Stationen im Wettkampfzentrum ohne Internet. Im Reiter erzeugt „Den anderen Stationen Zugang
        geben“ einen Schlüssel, der mit dem Lauf mitreist: Die Stationen der Anwendung tauschen dann ebenfalls mit Ozimut aus, wenn sie
        Internet haben.</p>
      <p>Antwortet der Reiter „Die App Ozimut Chrono wurde auf diesem Computer nicht gefunden“: Prüfe, ob sie läuft, und erteile die
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
        <li><b>Die Veranstaltungen</b>: in Dokumente › „Ozimut Chrono“, ein Protokoll pro Veranstaltung,
          <code>&lt;Veranstaltung&gt;.ozchrono.jsonl</code>. Jeder Vorgang wird dort angehängt und in dem Moment auf die Platte
          geschrieben, in dem er geschieht; die Datei wird nie neu geschrieben. Sie wird wieder gelesen, wenn die Veranstaltung erneut
          geöffnet wird (eine letzte, durch einen Stromausfall abgeschnittene Zeile wird übergangen). Die Datei <code>hub.json</code>
          daneben merkt sich die Identität des Hubs und die zuletzt geöffnete Veranstaltung.</li>
        <li><b>Sichern</b> heißt, diesen Ordner zu kopieren. Ein Protokoll öffnest du auf einem anderen Computer über Datei ›
          „Veranstaltungsdatei öffnen…“.</li>
        <li><b>Die Einstellungen</b>: <code>settings.json</code> im Einstellungsordner der Anwendung (<code>%APPDATA%\\Ozimut Chrono</code>
          unter Windows): der Schlüssel des Hubs und der zuletzt benutzte Speicherordner. Eine Zeile <code>"folder"</code>, von Hand bei
          geschlossener Anwendung ergänzt, legt die Veranstaltungen in einen anderen Ordner.</li>
        <li><b>Die Anwendung selbst sendet nichts irgendwohin.</b> Eine Veranstaltung tauscht nur dann mit Ozimut aus, wenn die Kopie vom
          Ozimut-Reiter aus eingerichtet wurde („Den anderen Stationen Zugang geben“).</li>
        <li>Das Protokoll enthält Namen, Vereine, Lizenz- und Chipnummern: Bewahre diesen Ordner so auf wie deine Ergebnisdateien.</li>
      </ul>` },
    { id: "update", title: "Aktualisieren, deinstallieren", html: `
      <ul>
        <li><b>Die Version</b> steht in Hilfe › „Über Ozimut Chrono“.</li>
        <li><b>Aktualisieren</b>: Die Anwendung aktualisiert sich nicht selbst. Lade die neue Datei am selben Ort herunter und starte
          sie; das Installationsprogramm ersetzt die vorhandene Version. Bei der portablen Version und dem AppImage ersetzt du die Datei.
          Veranstaltungen und Einstellungen bleiben erhalten.</li>
        <li>Eine Veranstaltungsdatei aus einer neueren Version wird mit einer Meldung abgelehnt: Aktualisiere die Anwendung, um sie zu
          öffnen.</li>
        <li><b>Deinstallieren</b>: unter Windows Einstellungen › Apps › Ozimut Chrono › Deinstallieren (portable Version: Datei
          löschen); unter macOS die Anwendung in den Papierkorb legen; unter Linux das AppImage löschen. Der Ordner der Veranstaltungen
          und die Einstellungen bleiben: Lösche sie von Hand, wenn du möchtest.</li>
      </ul>` },
    { id: "trouble", title: "Wenn etwas nicht klappt", html: `
      <table>
        <thead><tr><th>Was passiert</th><th>Was zu tun ist</th></tr></thead>
        <tbody>
          <tr><td>„Ozimut Chrono kann nicht starten“: Die Ports 8377 bis 8387 sind alle belegt.</td><td>Die Anwendung nimmt Port 8377
            oder, wenn er belegt ist, den ersten freien bis 8387. Schließe das Programm, das sie belegt. Ist der Port nicht 8377, ändert
            sich die Adresse für die anderen Stationen: „Über“ nennt die richtige.</td></tr>
          <tr><td>„Der Datenordner kann nicht benutzt werden“.</td><td>In den Ordner „Ozimut Chrono“ der Dokumente lässt sich nicht
            schreiben (geschützter Ordner oder laufende Synchronisierung): Gib ihn frei oder nenne in <code>settings.json</code> einen
            anderen Ordner.</td></tr>
          <tr><td>Ein anderer Computer oder ein Telefon öffnet die Adresse nicht.</td><td>Prüfe, ob das Gerät im selben Netz ist; ob die
            Firewall des Computers der Anwendung den Zugriff zulässt (erlaube „Ozimut Chrono“ in privaten Netzwerken); ob das WLAN die
            Geräte nicht voneinander isoliert, wie es öffentliche Netze tun; ob die Adresse die aus „Über“ ist.</td></tr>
          <tr><td>Die Seite fragt nach einem Schlüssel.</td><td>Tippe ein, was in der Adresse aus „Über“ auf <code>?k=</code> folgt.</td></tr>
          <tr><td>Windows oder der Virenschutz blockiert die Anwendung.</td><td>Sie ist noch nicht signiert: siehe „Herunterladen und
            installieren“.</td></tr>
          <tr><td>Das Chip-Lesegerät wird nicht erkannt.</td><td>Prüfe das Kabel und den USB-Treiber des Lesegeräts; schließe jedes andere
            Programm, das seinen Anschluss belegt (eine andere Zeitmess-Software, das Konfigurationsprogramm der Stationen, einen in
            einem Browser geöffneten Chrono-Reiter); stecke es aus und wieder ein, wähle dann „Trennen“ und schließe das Lesegerät in
            Chrono erneut an.</td></tr>
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
