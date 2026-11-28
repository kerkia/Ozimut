// The privacy policy and legal notices, in German — a translation for information; the French version (privacy.fr.js, the
// reference) prevails. Keep the two in step.
// world: registration open to every orienteer (privacy.fr.js, which prevails).
export const body = (SITE, { world = false, later = "" } = {}) => `
      <p class="muted"><i>Diese deutsche Fassung dient nur zur Information; maßgeblich ist die französische Fassung.</i></p>
      <p>${SITE} ist eine unabhängige Website ohne Verbindung zum französischen Orientierungslaufverband (Fédération française de
        course d'orientation, FFCO). Sie wird privat und nicht kommerziell von <b>Yann Le Helloco</b> herausgegeben, dem
        Verantwortlichen für die unten beschriebenen personenbezogenen Daten im Sinne der Verordnung (EU) 2016/679 (DSGVO).
        Kontakt: <b>contact@ozimut.com</b>.</p>
      <h2 style="font-size:16px">Nutzungsbedingungen</h2>
      <p>${SITE} läuft mit kostenlosen, begrenzten Ressourcen, die sich alle Nutzer teilen. Die Website ist für die persönliche
        Nutzung durch ${world ? "ihre Nutzer" : "die Lizenzinhaber"} mit einem Webbrowser bestimmt. Ohne vorherige Zustimmung des Herausgebers sind daher
        untersagt: die automatisierte Erfassung (Robots, Skripte, Abgreifen von Seiten oder Datendateien), die Nutzung ihrer Inhalte zum Trainieren, Anpassen oder Speisen von KI-Modellen, massenhafte Downloads,
        die Weiterverwendung der Daten zu anderen Zwecken sowie jede Nutzung, die die Website zulasten der anderen Nutzer
        überlasten könnte. Ein Konto, das diese Regeln nicht einhält, kann gesperrt werden.</p>
      <p>Für einen besonderen Bedarf (eine Studie, die Bedürfnisse eines Vereins oder Regionalverbands, Daten für ein anderes
        Werkzeug) kannst du dem Herausgeber über die Seite „Kontakt“ oder an contact@ozimut.com schreiben: Die Anfrage wird
        geprüft.</p>
      <h2 style="font-size:16px">Unabhängigkeit und Quellen</h2>
      <p>${SITE} ist unabhängig, inoffiziell und für alle offen, ohne Verbindung zu einem Verband oder Veranstalter. Die Quellen: für Frankreich
        die Ergebnisse, die nationale Rangliste (CN) und der Kalender, die der französische Orientierungslaufverband (FFCO)
        auf cn.ffcorientation.fr und ffcorientation.fr veröffentlicht und die die Referenz bleiben; für Spanien der Kalender und die
        Anmeldungen, die der spanische Verband (FEDO) auf sico.fedo.org veröffentlicht, sowie die auf O-Replay (oreplay.es)
        veröffentlichten Ergebnisse; für alle Läufe die Ergebnisse und Startzeiten, die die Veranstalter veröffentlichen (ihre
        Website, liveresultat, WinSplits, Helga, Orientation Data, O-Replay) oder auf ${SITE} hochladen.</p>
      <p>Der Kalender der anderen Länder übernimmt die Kalender, die ihre Verbände veröffentlichen, jeweils unter dem Wettkampf
        genannt („Ansehen auf …“). Region und Département (oder ihre Entsprechung) eines Wettkampfs werden aus seinem Ort anhand
        der Ortsnamen von GeoNames (<a href="https://www.geonames.org/" target="_blank" rel="noopener">geonames.org</a>) ermittelt,
        unter der Lizenz <a href="https://creativecommons.org/licenses/by/4.0/deed.fr" target="_blank" rel="noopener">Creative Commons
        Attribution 4.0</a>.</p>
      <p>Für Spanien übernimmt ${SITE} die öffentlichen Ergebnisse der Läufe (Name, Verein, Kategorie, Zeit, Zwischenzeiten) und die
        Zahl der Anmeldungen je Kategorie; um denselben Läufer von einem Lauf zum nächsten wiederzuerkennen, liest die Website auch
        die öffentliche Liste der Lizenzinhaber der FEDO (Name, Verein, Regionalverband, Lizenz- und Chipnummer), von der sie keine Nummer anzeigt. Da diese Ergebnisse öffentlich sind,
        sind sie für alle sichtbar, mit oder ohne Konto. Jede betroffene Person kann verlangen, dort nicht mehr identifiziert zu
        werden (siehe „Deine Rechte“).</p>
      <h2 style="font-size:16px">Zugang und Bilder der Website</h2>
      ${later ? `<p>${later}</p>` : ""}
      <p>Ein Teil der Website ist ohne Konto zugänglich; ein Konto öffnet die Benachrichtigungen und das Teilen von
        GPS-Tracks, und der vollständige Verlauf der Rangliste ist den Lizenzinhabern des Verbands vorbehalten: in Frankreich einem Konto, das
        Frankreich beigetreten ist und dessen FFCO-Lizenznummer anhand des Namens geprüft wurde. Länder, deren Ergebnisse alle öffentlich sind (Spanien),
        stehen allen offen.</p>
      <p>Die Bildschirmfotos der Startseite stammen aus einer verfremdeten Kopie der Daten: Namen, Lizenzen, Vereine und Zeiten
        sind dort erfunden oder verändert und entsprechen keiner realen Person. Die mit „Entwurf“ gekennzeichneten Kästen sind Illustrationen.</p>
      <h2 style="font-size:16px">Ergebnisdaten, auch die von Lizenzinhabern ohne Konto</h2>
      <p>Die angezeigten Ranglisten, Ergebnisse und Berechnungen stammen aus den von der FFCO auf cn.ffcorientation.fr veröffentlichten
        Ergebnissen: Name, Verein, Kategorie, Lizenznummer, Zeit und Rang jedes klassierten Lizenzinhabers, ob er ein Konto auf ${SITE} hat
        oder nicht, minderjährige Lizenzinhaber eingeschlossen. ${SITE} leitet daraus neu berechnete CN, Ranglisten, Vergleiche und Statistiken ab (Vereine,
        Regionen, Alterspyramide, im Wettkampf getroffene Läufer). Die Seite „Ergebnisse“ zeigt außerdem für die Läufe der
        letzten 60 Tage die Ergebnisse, die die Veranstalter selbst veröffentlicht haben (auf ihrer Website, liveresultat, WinSplits, Helga usw.)
        oder die auf ${SITE} hochgeladen wurden, anhand von Name und Verein den Lizenzen zugeordnet.</p>
      <p>Diese Verarbeitung beruht auf dem berechtigten Interesse des Herausgebers, die Lizenzinhaber zu informieren und die nationale Rangliste
        anhand bereits veröffentlichter Ergebnisse zu analysieren. Auf ${SITE} sind die Daten in dem Umfang zugänglich, in dem die FFCO sie selbst veröffentlicht: Ohne
        Konto${world ? " oder mit einem Konto, das Frankreich nicht beigetreten ist," : ""} sieht man die Läufe, die Ergebnisse und die Rangliste der
        Saisons, die die FFCO auf ihrer Website ohne Anmeldung zeigt, sowie die von den Veranstaltern veröffentlichten Ergebnisse (Name,
        Verein, Kategorie, Zeit), ohne CN und Score. Die älteren Saisons, die die FFCO ihren Lizenzinhabern vorbehält, sowie die daraus abgeleiteten Verläufe
        und Statistiken sind nur angemeldeten Konten zugänglich${world ? ", die Frankreich beigetreten sind" : ""}, deren
        FFCO-Lizenznummer anhand des Namens geprüft wurde; eine Nummer, die der Index der gewerteten Läufer nicht kennt (kein gewerteter Lauf seit 2010), kann auf Wunsch der Person vom Herausgeber von Hand geprüft werden, der die Nummer und die beigefügte Nachricht bis zu seiner Entscheidung aufbewahrt; die Nachricht wird dann gelöscht. Einzige Ausnahme: Der Herausgeber kann einer Orientierungslauf-Organisation
        (Verband, Regionalverband, Verein), die die Website kennenlernen möchte, für begrenzte Zeit ein Demokonto einrichten; dieses Konto
        ist mit keiner Lizenz verbunden, kann nichts ändern oder hochladen und funktioniert ab dem festgelegten Datum nicht mehr. Jede
        betroffene Person kann die Berichtigung verlangen oder verlangen, dort nicht mehr identifiziert zu werden (siehe
        „Deine Rechte“); die Quelle bleibt die Website der FFCO.</p>
      <h2 style="font-size:16px">Verzeichnis der Vereine, Komitees und Regionalverbände</h2>
      <p>Der Reiter „Verzeichnis“ der Seite „Vereine“ übernimmt für jeden Regionalverband, jedes Départementskomitee und jeden Verein, was die FFCO auf
        ihren Strukturseiten und in ihrem Vereinsverzeichnis veröffentlicht: Nummer, Website und Kontaktdaten — Namen und Funktionen der
        Vorstandsmitglieder (Präsident, Sekretär, Schatzmeister), Telefonnummer und E-Mail-Adresse. Die Postanschrift wird nicht
        übernommen. Diese Kontaktdaten werden nur angemeldeten Konten mit geprüfter FFCO-Lizenz angezeigt (weder Besuchern ohne
        Konto noch Demokonten) und jede Woche neu gelesen: Was die FFCO entfernt, verschwindet bei der nächsten Lesung von ${SITE}.
        Rechtsgrundlage: das berechtigte Interesse des Herausgebers, den Lizenzinhabern zu helfen, die Strukturen ihres
        Sports zu erreichen, anhand von Informationen, die die FFCO selbst veröffentlicht. Jede betroffene Person kann dem widersprechen oder die
        Berichtigung verlangen (siehe „Deine Rechte“); die Quelle bleibt die Website der FFCO.</p>
      <h2 style="font-size:16px">Hochgeladene Ergebnisse und Startzeiten</h2>
      <p>Beim Hochladen einer Ergebnisdatei werden das Konto des Hochladenden, der Lauf, Name und Größe der
        Datei sowie das Datum des Hochladens gespeichert. Die Datei wird 60 Tage im Speicher der Website (Cloudflare) aufbewahrt und dann
        gelöscht; die darin enthaltenen Ergebnisse bleiben angezeigt. Der Administrator sieht, wer jede Datei hochgeladen hat, und kann
        eine Datei entfernen. Die Startzeiten, die ein Veranstalter vor dem Lauf hochlädt (Reiter „Starts“ einer Veranstaltung, in Orga), folgen denselben
        Regeln; veröffentlicht werden nur Namen, Vereine, Kategorien und Startzeiten, und die Veranstalter des Laufs können sie
        entfernen. Ein Wettkampf, den ein Veranstalter außerhalb des Kalenders des Verbands anlegt (siehe „Veranstaltungen der Veranstalter“), wird
        mit Name, Datum, Ort, Verein, Disziplin und Website im Kalender veröffentlicht, ohne dass veröffentlicht wird, wer ihn angelegt hat. Ein Veranstalter kann auch den Link zum GPS-Tracking seines Wettkampfs bei einem anderen
        Dienst angeben (Reiter „Live“ seiner Veranstaltung): Nur dieser Link wird veröffentlicht; das Konto, das ihn angegeben hat, wird gespeichert und nicht veröffentlicht; Ozimut
        erhält keine Positionen.</p>
      <h2 style="font-size:16px">Veranstaltungen der Veranstalter (Orga)</h2>
      <p>Ein Konto, das in Orga eine Veranstaltung anlegt – einen Lauf oder ein Training –, bildet ihr Team. Die Website
        speichert: die Beschreibung der Veranstaltung (Name, Datum, Ort, Verein, Disziplin, Format, Website) und das Konto, das sie angelegt
        hat; ihre etwaige Verknüpfung mit einem Wettkampf aus dem Kalender des Verbands; ihr Team (die Konten der Mitglieder, das Datum, an
        dem jedes beigetreten ist, und das Mitglied, das es aufgenommen hat); die Beitrittsanfragen (das anfragende Konto, eine freiwillige
        Nachricht von höchstens 300 Zeichen, das Datum, die Antwort und das Mitglied, das sie gegeben hat). Niemand wird über seinen Namen,
        seine Lizenz oder seine E-Mail-Adresse zu einem Team hinzugefügt: Man bittet um Beitritt, und ein Mitglied nimmt an oder lehnt ab;
        die Mitglieder werden über eine Anfrage, die Person über die Antwort per Push-Mitteilung informiert. Die Mitglieder eines Teams sehen
        gegenseitig ihre Namen und Vereine sowie die der Personen, die um Beitritt bitten; andere Konten sehen von einem Team nur Vorname und
        Initiale des Nachnamens von höchstens zwei Mitgliedern. Die Administratoren der Website sehen die Veranstaltungen und bestätigen die
        Verknüpfungen, die Konten anfragen, die nicht Mitglied des veranstaltenden Vereins sind. Rechtsgrundlage: die Erbringung des
        angeforderten Dienstes. Wird ein Konto gelöscht, verlässt es seine Teams und seine Anfragen werden gelöscht; eine Veranstaltung,
        deren letztes Mitglied es war, bleibt in den Händen der Administratoren, und was die Veranstaltung veröffentlicht hat, bleibt. Eine Bahnlegung, die mit einer Veranstaltung verbunden ist, behält ihr eigenes
        Team (siehe „Bahnlegung“): Das Team der Veranstaltung sieht nur, dass es sie gibt, wer sie begonnen hat und wie viele Personen ihr
        Bahnlegungsteam hat.</p>
      <h2 style="font-size:16px">Analysen von GPS-Tracks</h2>
      <p>Die Seite „Einzelanalyse“ liest Karte und GPS-Track in deinem Browser: Es werden keine Daten an die Website übertragen, und diese
        Dateien werden nur für die Dauer des Besuchs aufbewahrt.</p>
      <p>In der Analyse eines Trainings oder Wettkampfs lädt der Veranstalter die Karten und Bahnen hoch, und jeder
        Teilnehmer kann seinen eigenen GPS-Track hinzufügen. Dieser wird dann übertragen und im Speicher der Website
        (Cloudflare) aufbewahrt, mit Name und Lizenznummer des Teilnehmers, beschränkt auf die Positionen und Uhrzeiten innerhalb der
        Kartenfläche (ohne Herzfrequenz, Kadenz und Wege außerhalb der Karte). Er ist für die Personen sichtbar, die die Analyse öffnen dürfen,
        je nach Wahl des Veranstalters: alle angemeldeten Lizenzinhaber, die Mitglieder seines Vereins oder die Inhaber des
        Passworts. Jeder Teilnehmer kann seinen GPS-Track jederzeit entfernen; er wird mit der Analyse und mit seinem Konto gelöscht. Die
        Karten einer Analyse werden aufbewahrt, solange die Analyse besteht; löscht der Veranstalter sein Konto, bleibt die Analyse erhalten,
        ohne seinen Namen. Die OCAD- oder Mapper-Dateien, aus denen ihre Bahnen stammen, werden nur aufbewahrt, wenn der Veranstalter es wählt („Für die Bahnlegung der Veranstaltung bereitstellen“, standardmäßig angehakt): Nur die Veranstalter der Analyse haben Zugriff darauf, für die Bahnlegung der Veranstaltung, und sie werden mit ihr gelöscht. In der Analyse einer Veranstaltung stammen deine eigenen Kurven (Tempo, Herzfrequenz, Kadenz usw.) aus deiner
        Datei, die in deinem Browser auf diesem Gerät gespeichert ist: Sie wird nicht übertragen, und nur du hast Zugriff darauf.</p>
      <p>Dein Kommentar zu deinem
        Lauf ist für dieselben Personen sichtbar wie dein Track; du kannst ihn jederzeit ändern oder löschen. Öffnet der Veranstalter die
        Analyse für Besucher ohne Konto, werden ihnen dein Track und dein Kommentar nur gezeigt, wenn du zustimmst (ein standardmäßig
        nicht angekreuztes Kästchen), mit deinem Namen, aber ohne deine Lizenznummer; du kannst diese Zustimmung jederzeit zurückziehen.
        In « Meine Karten » wird dein Kommentar zu einem Lauf mit ihm gespeichert und folgt denselben Regeln.</p>
      <p>Damit der Veranstalter entscheiden kann (veröffentlichen, eine Funktion freigeben oder abschalten), zählt eine Analyse,
        wer sie öffnet und wer eine Bahn allein in der „Einzelanalyse“ auf seiner Karte abspielt: die Nummer deines Kontos, der erste
        und der letzte Tag und die Zahl der Tage, höchstens einmal pro Tag; für Besucher ohne Konto nur eine Zahl pro Tag. Die
        Veranstalter sehen nur Summen, nie wer; sie selbst werden nicht gezählt. Diese Einträge werden mit der Analyse, mit der
        betreffenden Bahn und mit deinem Konto gelöscht.</p>
      <h2 style="font-size:16px">Meine Karten</h2>
      <p>„Meine Karten“ bewahrt die Karten, die du dort speicherst (aus der „Einzelanalyse“) oder importierst (JPEG-Dateien aus
        QuickRoute oder Ozimut), und die Routen, die du darauf gelaufen bist, im Speicher der Website (Cloudflare) auf: das Bild der
        Karte so, wie du es gegeben hast, ihren Titel, ihr Datum, ihren Ort und deine Notizen und für jeden Lauf die Positionen auf der
        Karte und die Zeiten, nie die GPS-Datei selbst. Herzfrequenz, Höhe und Schrittfrequenz werden nur aufbewahrt, wenn du das dafür
        vorgesehene Kästchen ankreuzt (standardmäßig nicht angekreuzt): Es sind Gesundheitsdaten, die mit deiner Einwilligung aufbewahrt
        werden; du widerrufst sie, indem du den Lauf löschst. Diese Karten siehst nur du. Erstellst du einen Link zum Teilen (zu allen
        deinen Karten oder zu einer), sieht sie jeder, der den Link hat, mit deinem Namen, auch ohne Konto, aber nie die Herzfrequenz
        oder andere persönliche Daten; das Löschen des Links beendet das Teilen. Du kannst deine ganze Bibliothek auch mit den Personen teilen, die du einlädst: Ein Einladungslink, einmal und 7 Tage gültig, gibt dem Ozimut-Konto, das ihn öffnet, Zugang zu deiner Bibliothek in „Meine Karten“, ohne deine privaten Karten und deine persönlichen Daten, bis du dieses Teilen entfernst oder diese Person darauf verzichtet. Du siehst dann ihren Namen und ihren Verein. Gespeichert wird nur ein Fingerabdruck des Links, nie der Link selbst. Du kannst einen Lauf oder eine Karte jederzeit löschen;
        alles wird mit deinem Konto gelöscht. Eine Anfrage zum Import aus DOMA ist eine Nachricht an das Ozimut-Team, wie die über
        „Kontakt“.</p>
      <p>Wenn du in der „Einzelanalyse“ neben „Lauf ansehen“ das Häkchen bei „Analyse speichern“ setzt (standardmäßig gesetzt), werden die Karte und dein Lauf — nur Positionen und Zeiten, sonst nichts von der Uhr — in deiner Bibliothek „Meine Karten“ behalten (seit dem 24. November 2026; die vorher gespeicherten Analysen wurden dorthin verschoben): nur du siehst sie, es sei denn, du teilst deine Bibliothek, in „Meine Karten“ und in der „Analyse“, wo du die Analyse erneut abspielst, umbenennst oder löschst. Eine Karte wird dort nur einmal behalten. Wenn du deinen Track zur Kartenanalyse eines Veranstalters hinzufügst, der es erlaubt, kommen dein Lauf und seine Karte von selbst ebenfalls dorthin, nur Positionen und Zeiten; das Kästchen „Meinen Lauf automatisch in Meine Karten aufbewahren“ im Reiter „Export“ stellt das auf diesem Gerät ab.</p>
      <p>Eine Bibliothek in „Meine Karten“ fasst höchstens 1 GB (die Originalkarten und die Läufe). Die Administratoren der Website können die an Ozimut gesendeten Karten sehen — in „Meine Karten“, der „Einzelanalyse“, den Analysen der Veranstalter und der Bahnlegung — und eine Kopie davon behalten, außer denen, die du beim Senden in „Meine Karten“, der „Einzelanalyse“ oder der Bahnlegung als „Private Karte“ markierst; nie deine Läufe, deine Kommentare oder die Bahnen, noch die Karte einer verschlüsselten Veranstaltung. Diese Karten bleiben, wenn das Konto gelöscht wird, ohne deinen Namen.</p>
      <h2 style="font-size:16px">GPS-Verfolgung und Meine Spuren</h2>
      <p>Die GPS-Verfolgung (im Test, vorerst nur für die Administratoren der Website, einige Tester und die Kinderkonten, die sie anlegen) zeichnet die Position eines Kontos während eines Laufs auf, eine Position pro Sekunde, mit der Ozimut-App auf einem Telefon, einer Apple Watch oder Garmin-Uhr oder der App Traccar Client. Außerhalb eines Laufs, den die Person (oder ihr Elternteil auf ihrem Gerät) gestartet hat, wird nichts aufgezeichnet. Gespeichert werden: die Positionen, ihre Uhrzeit und Genauigkeit, die Höhe, wenn das Gerät sie liefert, der Akkustand des Geräts; für jedes Gerät sein Typ, sein Modell, die App-Version, das Datum, an dem es zuletzt gesehen wurde, und das Benachrichtigungs-Token seines Systems (Google oder Apple), um ihm die Warnungen zu senden. Die Positionen werden in Paketen übertragen und im Speicher der Website gespeichert (Cloudflare, Europäische Union und Vereinigte Staaten); ein Lauf wird 30 Tage in « Meine Spuren » behalten, länger nur, wenn du ihn in einer Analyse öffnest oder in « Meine Karten » behältst.</p>
      <p>Einen Lauf live sehen und seine Warnungen erhalten (Start, Ziel, Hilferuf, keine Position, keine Bewegung, schwacher Akku, Verlassen des Gebiets) nur die Konten, die die Person oder ihr Elternteil ausdrücklich per Einladung erlaubt hat; diese Erlaubnis kann jederzeit zurückgezogen werden. Ein als privat markierter Lauf ist für niemanden sonst sichtbar. Importierte Spuren (Datei, Apple Health, Polar) bleiben privat. Die Verbindung mit Polar gibt Ozimut Zugriff auf deine Polar-Trainings, bis du sie aufhebst; Ozimut behält von jedem nur die GPS-Route.</p>
      <h2 style="font-size:16px">Folloz</h2>
      <p>Die App Folloz verfolgt ein Telefon live ohne Konto. Das verfolgte Telefon legt auf dem Relais von Ozimut einen « Kanal » an, der mit einer Zufallsnummer bezeichnet wird; jedes Telefon, das ihm folgt, tritt durch das Scannen eines Codes bei und erhält einen Schlüssel, den das Relais nie sieht. Die Positionen werden für jedes dieser Telefone verschlüsselt: Das Relais kann sie nicht lesen, ebenso wenig die ausgetauschten Vornamen. Es behält den laufenden Lauf, seine Sendezeiten, den Akkustand und die Art der Warnungen (Start, Ziel, Hilferuf, keine Position, schwacher Akku, keine Bewegung, Verlassen des Gebiets), gelöscht 24 Stunden nach dem Ende des Laufs oder beim Start des nächsten, und, um die Benachrichtigungen zu senden, das Benachrichtigungs-Token jedes folgenden Telefons. Ein 180 Tage lang ungenutzter Kanal wird gelöscht; « Meine Daten löschen » in der App löscht ihn sofort. Jeder Lauf wird auf dem verfolgten Telefon selbst aufbewahrt. Mit einem Ozimut-Konto verbunden, sendet die App ihre Läufe auch an dieses Konto: Dann gilt der Abschnitt oben.</p>
      <h2 style="font-size:16px">Konten von Kindern</h2>
      <p>Sobald die Verfolgung für alle offen ist, legt niemand unter 15 allein ein Konto an: Die Registrierung fragt nach dem Geburtsjahr, und für ein jüngeres Kind legt ein Elternteil das Konto an und verwaltet es, ohne E-Mail-Adresse und Passwort. Der Elternteil verbindet die Geräte des Kindes, wählt, wer es verfolgen darf, und kann das Konto jederzeit löschen; ein zweiter Elternteil kann per Einladung hinzugefügt werden. Das Konto eines Kindes speichert nur Vorname, Nachname, Geburtsjahr, gegebenenfalls die Lizenznummer und die Spuren. Ein eigenes Konto, das jemand unter 15 bereits eröffnet hat, wartet darauf, dass ein Elternteil verbunden wird: Bis dahin bleiben seine Spuren privat und es werden keine Warnungen gesendet. Ab 15 kann der junge Mensch sein Konto selbst übernehmen (eigene Adresse und eigenes Passwort); seine Spuren und sein Verlauf bleiben seine, und seine Eltern werden zu Personen, die ihn verfolgen dürfen, was er ändern kann. Löscht ein Elternteil sein Konto, wird das Konto eines Kindes, dessen einziger Elternteil er war, mit allen Spuren gelöscht.</p>
      <h2 style="font-size:16px">Zeitmessung (Chronoz)</h2>
      <p>Chronoz, das Zeitmessungswerkzeug der Veranstalter (im Test, vorerst nur für die Administratoren der Website), arbeitet zuerst auf dem Computer des Veranstalters: Die Teilnehmer eines Laufs (Name, Vorname, Verein, Kategorie, Lizenznummer, Chipnummer, Startzeit, Startgeld und Zahlung), der Inhalt der ausgelesenen Chips und die von Hand vorgenommenen Korrekturen werden dort im Browser oder in der App gespeichert. Ist die Station mit Ozimut verbunden, werden diese Vorgänge auf Ozimut kopiert, damit der Lauf auf einem anderen Computer übernommen werden kann; nur die Veranstalter des Anlasses haben darauf Zugriff, und nichts wird ohne ihr Zutun veröffentlicht (Live-Resultate, Veröffentlichung der Resultate). Die Lizenzdatei des Verbands und die von Lauf zu Lauf gemerkten Chipnummern bleiben auf dem Computer des Veranstalters: Sie werden nicht an Ozimut gesendet.</p>
      <h2 style="font-size:16px">Vereine (Mein Verein)</h2>
      <p>Ein Verein, ein Komitee oder ein Landesverband entsteht auf Ozimut, sobald ein Konto ihn braucht. In Frankreich ist ein Konto,
        dessen Lizenz die eines Vereins ist (der Verein seines letzten Laufs in den veröffentlichten Ergebnissen), automatisch dessen
        Mitglied; anderswo bittest du um Aufnahme in einen Verein oder wirst über einen Link eingeladen. Die Mitglieder eines Vereins
        sehen die Namen der anderen Mitglieder und ihre Rollen (Verantwortliche, Veranstalter, Kartografen, Kassenwarte); die
        Verantwortlichen sehen außerdem die offenen Anfragen. Ein Vorstandsmitglied, das das Verzeichnis des Verbands nennt (Präsident,
        Sekretär, Kassenwart: Der Name des Kontos wird mit dem des Verzeichnisses verglichen), wird sofort Verantwortlicher des Vereins,
        alle anderen nach Zustimmung der Administratoren der Website. Die Einstellungen des Vereins (welche Anmeldungen er übernimmt, sein
        Bankkonto, seine Kontaktadresse) sehen nur seine Verantwortlichen und Kassenwarte; Kontoinhaber und IBAN werden nur denen
        gezeigt, die sich zu einem Lauf des Vereins gemeldet haben oder ihm etwas schulden.</p>
      <h2 style="font-size:16px">Anmeldungen zu Läufen</h2>
      <p>Wenn die Veranstalter einer Veranstaltung die Anmeldungen öffnen, meldet ein Konto sich selbst an, ebenso die Läufer, die es zu „Meine
        Läufer“ hinzufügt (Familie, Freunde, mit oder ohne Lizenz: Es verpflichtet sich, das mit ihrem Einverständnis zu tun), und die
        Konten seiner Kinder. Eine Anmeldung speichert Vorname, Nachname, Verein und dessen Land, die Lizenznummer, falls angegeben, das
        Geburtsjahr, das Geschlecht und die Altersklasse, die gewählte Kategorie, die Chipnummer oder einen Leihchip, die Optionen, die
        Startzeit, den bei der Anmeldung festgelegten Betrag, wer ihn zahlt (der Läufer oder sein Verein), den Verwendungszweck und den
        Zahlungsstand (offen, bezahlt, erlassen, und wie). Eine Anmeldung ohne Konto legt ein Konto an wie die Registrierung auf der
        Website; sie bleibt offen, bis die E-Mail-Adresse bestätigt ist, und wird nach drei Tagen ohne Bestätigung storniert. Das Team der
        Veranstaltung sieht all das; die öffentliche Anmeldeliste zeigt nur Name, Verein, Kategorie und Startzeit, nie Lizenznummer, Chip,
        Geburtsjahr, Betrag oder Zahlung. Die Veranstalter können auch Angemeldete aus einer Datei einlesen; sie sind dafür verantwortlich.
        Bei Anmeldeschluss werden die Startzeiten zur veröffentlichten Startliste. Wird ein Konto gelöscht, werden seine Anmeldungen und die,
        die es für andere zu kommenden Läufen gemacht hat, storniert; die vergangener Läufe behalten die Namen der Läufer in den
        Unterlagen der Veranstalter, ohne Verbindung zum Konto. „Meine Läufer“ wird mit dem Konto gelöscht.</p>
      <h2 style="font-size:16px">Vereinskonten</h2>
      <p>Keine Zahlung läuft über Ozimut: Überweisungen, Bargeld und Schecks gehen direkt zwischen Personen und Vereinen, und Ozimut
        speichert nur, was das Team einer Veranstaltung oder der Kassenwart eines Vereins als bezahlt markiert. Betrag und Stand einer
        Anmeldung sehen der Läufer und das Konto, das ihn angemeldet hat, das Team der Veranstaltung, die Kassenwarte und Verantwortlichen
        des veranstaltenden Vereins und, wenn der Verein des Läufers die Anmeldung übernimmt, dessen Kassenwarte und Verantwortliche. Für
        jedes Mitglied und jede Saison speichert ein Verein in seinen Konten, was er übernommen hat, was das Mitglied erstattet hat und
        welche Abrechnungen er ihm geschickt hat; seine Kassenwarte und Verantwortlichen sehen das, und jedes Mitglied sieht sein
        eigenes Konto. Die Jahresabrechnung und die Zahlungserinnerungen werden auf Wunsch des Kassenwarts im Namen des Vereins per
        E-Mail verschickt (Erinnerungen auch als Benachrichtigung); Antworten gehen an die Kontaktadresse des Vereins. Der Kontoauszug,
        den ein Kassenwart ablegt, wird in seinem Browser gelesen und nie an Ozimut gesendet: Nur die erkannten und angekreuzten
        Verwendungszwecke werden gesendet, um die Zahlungen zu markieren. Die Verrechnung zwischen zwei Vereinen, die sie beide
        akzeptiert haben, dient nur zur Information. Wird ein Konto gelöscht, bleiben die Einträge in den Vereinskonten, die es betreffen,
        in diesen Konten, ohne Verbindung zum Konto.</p>
      <h2 style="font-size:16px">Von deinem Handy</h2>
      <p>„Vom Handy“ bringt ein Foto der Karte oder eine Datei (einen Track) von deinem Handy auf deinen Computer: Die Datei wartet im Speicher der Website (Cloudflare) unter einem Einmal-Link, 15 Minuten gültig, und wird gelöscht, sobald der Computer sie empfangen hat oder du das Fenster mit dem Code schließt; eine nie empfangene Datei wird spätestens am nächsten Tag gelöscht. Weder der Link noch die Datei tragen deinen Namen, und auf dem Handy ist kein Konto nötig.</p>
      <h2 style="font-size:16px">Gesundheit: Artikel und Urheberrecht</h2>
      <p>Die Seite „Gesundheit“, offen für die Konten, die der Herausgeber dafür freigibt, veröffentlicht Artikel, die ihre Autorinnen
        und Autoren geschrieben haben. Ein Artikel wird in der Datenbank der Website (Cloudflare) mit dem Namen seines Autors gespeichert,
        der mit ihm angezeigt wird, seine Bilder im Dateispeicher der Website; er wird gelöscht, wenn sein Autor oder der Herausgeber ihn
        löscht. Löscht der Autor sein Konto, bleiben seine Artikel unter seinem Namen veröffentlicht, es sei denn, er verlangt ihre
        Entfernung (contact@ozimut.com). „Gefällt mir“ wird pro Konto gespeichert; nur ihre Anzahl wird angezeigt. Jeder Artikel wird
        vom Sprachmodell von Ozimut, das Cloudflare ausführt (Workers AI) und das ihn nicht speichert, automatisch ins Englische und ins
        Französische übersetzt (außer in seine Originalsprache); die Übersetzung wird mit dem Artikel gespeichert und als solche gekennzeichnet.</p>
      <p><b>Urheberrecht.</b> Jeder Autor behält alle Urheberrechte an seinen Artikeln (den Texten und Bildern, die er geschaffen hat),
        einschließlich des Urheberpersönlichkeitsrechts, und kann sie frei anderswo veröffentlichen, in der Form und zu den Bedingungen
        seiner Wahl. Mit der Veröffentlichung eines Artikels auf ${SITE} gewährt er dem Herausgeber nur eine unentgeltliche, nicht
        ausschließliche Erlaubnis, für die Dauer der Veröffentlichung, ihn zu speichern, ihn den Lesern der Seite „Gesundheit“ zu zeigen,
        ihn automatisch in die Sprachen der Website zu übersetzen, seinen Titel, seine Zusammenfassung und seine ersten Zeilen in Listen
        und Benachrichtigungen zu übernehmen und seine Darstellung (Layout, Bildgröße) anzupassen, ohne seinen Sinn zu ändern. Diese
        Erlaubnis endet, wenn der Artikel gelöscht wird; bereits versandte Benachrichtigungen lassen sich nicht zurückholen. Der Autor
        sichert zu, dass die Texte und Bilder, die er veröffentlicht, von ihm stammen oder dass er sie verwenden darf.</p>
      <p>Jede Vervielfältigung, Wiedergabe oder Verbreitung eines Artikels, ganz oder teilweise, durch eine andere Person braucht die
        vorherige Zustimmung seines Autors, vorbehaltlich der gesetzlichen Ausnahmen, insbesondere kurzer Zitate mit Angabe des Autors
        und der Quelle (Artikel L. 122-5 des französischen Gesetzbuchs über geistiges Eigentum). Die automatischen Übersetzungen sind
        Bearbeitungen des Artikels und folgen denselben Regeln.</p>
      <h2 style="font-size:16px">Carto</h2>
      <p>Eine Karte in Carto (das Kartendokument, die OCAD-Datei, aus der sie stammt, ihre Hintergründe, ihre Versionen, die Kommentare und Fotos des Teams) wird im Speicher der Website (Cloudflare) aufbewahrt und ist nur ihrem Team zugänglich: ihrem Ersteller und den Personen, die über einen Einladungslink beitreten (niemand wird über Name oder E-Mail-Adresse gesucht); ihr Name und ihr Konto werden mit ihrer Rolle gespeichert. Online-Hintergründe (Luftbilder und Karten des IGN, OpenStreetMap) werden bei jedem Öffnen gelesen und nicht gespeichert; für offene Daten (Höhen des IGN, OpenStreetMap, LiDAR) wird nur die Ausdehnung des Gebiets an diese Dienste gesendet. Der Stadtplan (Sprint) wird von Ozimuts Servern (GitHub) berechnet, die nur Mittelpunkt und Größe des Gebiets erhalten; die Anfrage mit der Nummer deines Kontos und die erstellte Karte werden 30 Tage aufbewahrt. Die GPS-Position des Geländemodus bleibt in deinem Browser, außer einer Spur, die du als Hintergrund speicherst. Wird das Konto gelöscht, geht jede von ihm angelegte Karte an den ersten Kartografen ihres Teams, sonst wird sie mit allem, was sie enthält, gelöscht.</p>
      <h2 style="font-size:16px">Bahnlegung</h2>
      <p>Ein Ereignis der Seite „Bahnlegung“ (seine Bahnen, seine Karte, seine Versionen, die Kommentare des Teams und die im Geländemodus
        notierten Postenzustände) wird im Speicher der Website (Cloudflare) aufbewahrt und ist nur seinem Team zugänglich:
        seinem Ersteller und den Personen, die über einen Einladungslink beitreten, den ihnen das Team übermittelt hat (niemand wird dort
        nach Name, Lizenz oder E-Mail-Adresse gesucht); ihr Name, ihr Konto und bei einem FFCO-Lizenzinhaber seine Lizenz werden
        mit ihrer Rolle gespeichert. Die
        Versionen, Kommentare und Postenzustände tragen den Namen ihres Urhebers. Im Geländemodus speichert der an einem Posten notierte Zustand
        auch die Position des Telefons in diesem Moment (um sie mit der Karte zu vergleichen), sichtbar für das Team, und das Team
        kann Fotos der Posten anhängen (sie können Personen zeigen: vermeide das), die mit dem Ereignis gelöscht werden; die Position
        wird nur in diesem Modus und mit Erlaubnis des Browsers gelesen. Verschlüsselt das Team das Ereignis, werden diese Daten
        im Browser verschlüsselt und sind für die Website unlesbar. Das Ereignis wird aufbewahrt, bis sein Ersteller es löscht; löscht
        dieser sein Konto, geht es an den ersten Bahnleger (ersatzweise Kontrolleur) des Teams mit einem Konto über, andernfalls wird es
        gelöscht. Die Berechnung der Steigung sendet an den Höhendienst des IGN (Géoplateforme, Frankreich) nur die Koordinaten der
        Posten und der Knickpunkte der Bahnen, ohne Namen oder Code.</p>
      <h2 style="font-size:16px">Bestenliste der Spiele</h2>
      <p>Wenn du angemeldet bist, sendet jedes beendete Spiel (« Spiele ») sein Ergebnis: Es wird unter dem
        Namen deines Kontos gespeichert, wenn es eines deiner 20 besten für dieses Spiel ist, und den anderen Konten gezeigt, wenn es
        zu den 20 besten aller gehört. Nur das Ergebnis, seine Einstellungen und das Datum; von den Spielen eines Besuchers ohne Konto
        wird nichts gespeichert. Diese Ergebnisse werden mit deinem Konto gelöscht.</p>
      <h2 style="font-size:16px">Virtuoz</h2>
      <p>Die Tasten, die du unter Avatar › Steuerung wählst, werden mit deinem Konto gespeichert, damit du sie auf deinen anderen Geräten wiederfindest; sie werden mit ihm gelöscht.</p>
      <p>Jedes Rennen, das du in Virtuoz beendest, wird unter dem Namen deines Kontos gespeichert: seine Zeit, seine
        Zwischenzeiten, die gelaufene Strecke und sein Weg durch den virtuellen Wald, den anderen Konten in den Ergebnissen, der
        Rangliste und der Analyse dieser Bahn gezeigt; von einem Rennen zum nächsten wirst du an einem Fingerabdruck deines Kontos
        erkannt, nie an seiner Nummer. Von den Rennen eines Besuchers ohne Konto wird nichts gespeichert. Ein Organisator, der eine
        Veranstaltung erstellt, sendet seine OCAD-Karte (und, wenn er will, seine Bahnen): sie wird im Speicher der Website
        aufbewahrt, nur den Läufern der Veranstaltung gezeigt, im Spiel, sobald er sie veröffentlicht hat, und dient dazu, das Rennen
        auf GitHub zu bauen, wo sie nicht aufbewahrt wird. Diese Rennen und die Veranstaltungen mit ihren Karten und Ergebnissen werden
        mit deinem Konto gelöscht. Wenn du dich für einen Wettkampf anmeldest, speichert er unter deinem Konto die gewählte Bahn,
        deine Startzeit und ob der Lauf beendet oder aufgegeben wurde; sie werden mit deinem Namen in seinen Ergebnissen gezeigt und
        mit deinem Konto gelöscht.</p>
      <h2 style="font-size:16px">Die Ozimut-App</h2>
      <p>Die Ozimut-App für Telefone zeigt diese Website und verfolgt deinen Standort nicht. Wenn du dort Benachrichtigungen einschaltest, speichert die Website für dieses Telefon die Sendekennung, die der Benachrichtigungsdienst des Telefons vergibt (Google auf Android, Apple auf dem iPhone), und die Geräteart; sie wird gelöscht, wenn du sie ausschaltest, dich in der App abmeldest oder dein Konto löschst. Die Karte, die du scannst, die Dateien, die du mit der App teilst, und die aus Health gelesenen Routen (iPhone, mit deiner Zustimmung, nur lesend) bleiben auf dem Telefon, wie auf der Website, solange du die Analyse weder speicherst noch teilst. In der App wird kein Konto angelegt oder gelöscht: Das geschieht auf der Website.</p>
      <h2 style="font-size:16px">Fragen an die KI</h2>
      <p>Auf der Seite „KI“ wird deine Frage an das Sprachmodell gesendet, das die Abfrage schreibt, zusammen mit der Beschreibung der Tabellen der
        Website, dem heutigen Datum, deiner Lizenznummer sowie der gewählten Methode und Disziplin: standardmäßig das Modell von Ozimut, ausgeführt
        von Cloudflare (Workers AI); weder die Website noch Cloudflare speichern die Fragen. Die Abfrage wird dann in deinem
        Browser ausgeführt, auf den Daten, die die Website veröffentlicht: Sie werden an kein Modell übertragen. Wenn du deinen eigenen
        API-Schlüssel verwendest (Anthropic, OpenAI, Google oder OpenRouter), sendet dein Browser dieselben Angaben direkt an diesen Anbieter, unter
        deinem Konto und nach dessen Bedingungen (mit einem kostenlosen Schlüssel kann Google die Fragen zur Verbesserung seiner
        Produkte nutzen); der Schlüssel bleibt in deinem Browser und wird nie an Ozimut übertragen.</p>
      <h2 style="font-size:16px">Daten deines Kontos</h2>
      <ul>
        <li><b>Gespeicherte Daten:</b> die E-Mail-Adresse; der eingegebene Vor- und Nachname; die beigetretenen Länder, jeweils mit dem
          angegebenen Verein und der Mitgliedsnummer, und für Frankreich die Lizenznummer, anhand der von der FFCO veröffentlichten Ergebnisse geprüft; das Passwort in einer irreversibel verschlüsselten Form; das Datum der Registrierung
          und der letzten Anmeldung; die für die Website und die E-Mails gewählte Sprache; die Einstellungen der Benachrichtigungen (gewählte Regionen) und die Liste der
          bereits per E-Mail angekündigten Läufe; für den
          Staffelsimulator die hinzugefügten Läufer (Name, Kategorie, geschätzter CN) und die als nicht verfügbar markierten, nur für dich sichtbar.
          Füge dort nur Personen hinzu, die damit einverstanden sind.</li>
        <li><b>Zwecke und Rechtsgrundlagen:</b> die Erbringung des bei der Erstellung des Kontos angeforderten Dienstes (${world
          ? "die Daten der FFCO ihren Lizenzinhabern vorbehalten" : "den Zugang den Lizenzinhabern der FFCO vorbehalten"}, die E-Mail-Adresse bestätigen, das Passwort zurücksetzen); das berechtigte Interesse des Herausgebers, mehrere
          Konten für dieselbe Lizenz zu erkennen; deine Einwilligung für die Benachrichtigungen per E-Mail oder Push-Mitteilung, die du jederzeit
          in den Einstellungen widerrufen kannst.</li>
        <li><b>Speicherdauer:</b> bis zur Löschung des Kontos, die du jederzeit in den Einstellungen vornehmen kannst. Eine
          zum Versand anstehende E-Mail wird gelöscht, sobald sie versendet ist.</li>
        <li><b>Empfänger:</b> der Administrator der Website und die unten genannten technischen Dienstleister. Es werden keine Daten
          verkauft oder zu Werbezwecken verwendet.</li>
      </ul>
      <p>Eine über die Seite „Kontakt“ gesendete Nachricht erreicht den Herausgeber per E-Mail, zusammen mit deiner Adresse, deinem Namen und dem
        verwendeten Browser; sie wird in seinem Postfach so lange aufbewahrt, wie es für die Bearbeitung der Anfrage nötig ist.</p>
      <h2 style="font-size:16px">Push-Mitteilungen</h2>
      <p>Wenn du die Mitteilungen von Ozimut auf einem Gerät erlaubst, speichert die Website für dieses Gerät die Zustelladresse, die ihm
        der Mitteilungsdienst deines Browsers zuweist (Google für Chrome und Android, Apple für Safari, Mozilla für
        Firefox, Microsoft für Edge), die Schlüssel zur Verschlüsselung der Nachrichten und den Gerätetyp (zum Beispiel
        „Chrome · Android“). Die Nachrichten (deine Startzeit, die Veröffentlichung deiner Ergebnisse, die Läufe des Kalenders,
        je nach deinen Einstellungen) sind Ende-zu-Ende-verschlüsselt: Der Mitteilungsdienst stellt sie zu, ohne sie lesen zu können. Die Website
        speichert außerdem die zuletzt mitgeteilte Startzeit für jeden Lauf, um sie nur bei einer Änderung erneut zu senden, sowie die
        zum Versand anstehenden Mitteilungen, höchstens einige Tage lang. Rechtsgrundlage: deine Einwilligung, die du durch das Erlauben der
        Mitteilungen gibst und jederzeit in den Einstellungen oder in den Einstellungen deines Browsers widerrufen kannst. Diese Daten werden gelöscht,
        wenn du die Mitteilungen auf dem Gerät deaktivierst, wenn du dich auf diesem Gerät abmeldest und mit dem Konto.</p>
      <h2 style="font-size:16px">Nutzungsstatistiken</h2>
      <p>Um die Nutzung der Website zu kennen und sie zu verbessern (berechtigtes Interesse), speichert die Website für jedes Konto die Zahl der
        aufgerufenen Seiten pro Tag und Rubrik (Rangliste, Läufer, Netzwerk usw.) und die Zahl der Besuche. Zu diesem Zweck werden keine weiteren Daten
        gespeichert: weder die durchgeführten Suchen noch die IP-Adresse. Diese Statistiken sind nur dem
        Administrator zugänglich; sie werden 13 Monate aufbewahrt und mit dem Konto gelöscht. Mit jedem Seitenaufruf hält die Website
        außerdem fest, wie lange die Seite zum Anzeigen und Reagieren gebraucht hat, um ihre Geschwindigkeit zu verfolgen. Diese
        Zeiten werden nach Tag, Seite und Version der Website gezählt, ohne Bezug zum Konto.</p>
      <h2 style="font-size:16px">Sicherheit</h2>
      <p>Um wiederholte Versuche zu begrenzen (Anmeldung, Registrierung, Passwort vergessen), zählt die Website die Versuche pro
        IP-Adresse und pro E-Mail-Adresse (berechtigtes Interesse); diese Zähler werden nach etwa einem Tag gelöscht. Der Hoster kann
        außerdem die IP-Adresse verarbeiten, um die Seiten auszuliefern und die Website vor Angriffen zu schützen.</p>
      <h2 style="font-size:16px">Auftragsverarbeiter und Übermittlungen außerhalb der Europäischen Union</h2>
      <p>Die folgenden Dienstleister verarbeiten Daten im Auftrag des Herausgebers:</p>
      <ul>
        <li><b>Cloudflare, Inc.</b> (USA) hostet die Website, ihre Kontendatenbank und ihren Dateispeicher und führt
          das Sprachmodell der Seite „KI“ und das Modell aus, das die Artikel der Seite „Gesundheit“ übersetzt; bei der Registrierung und beim Betreten ohne Konto prüft sein Dienst Turnstile, dass die Website von einer
          Person und nicht von einem Robot genutzt wird, indem er den Browser ohne Werbe-Cookie und ohne seitenübergreifendes Tracking untersucht. Die
          Übermittlungen in die USA beruhen auf dem Datenschutzrahmen EU-USA (Data Privacy Framework),
          dem Cloudflare beigetreten ist.</li>
        <li><b>Resend</b> (Plus Five Five, Inc., USA) versendet die E-Mails der Website, was die Adresse des
          Empfängers und den Inhalt der Nachricht einschließt. Die Übermittlungen sind durch die Standardvertragsklauseln der Europäischen
          Kommission abgesichert.</li>
        <li><b>Scaleway</b> (Scaleway SAS, Frankreich) versendet die E-Mails, die der kostenlose Tarif von Resend nicht übernehmen kann,
          mit denselben Daten; sie bleiben in der Europäischen Union (Paris).</li>
        <li><b>GitHub, Inc.</b> (USA) führt die automatischen Aktualisierungen der Website aus; die Ergebnisse und hochgeladenen Dateien werden dort
          verarbeitet, ausgenommen die Kontodaten. Die Übermittlungen sind durch die Standardvertragsklauseln abgesichert.</li>
      </ul>
      <h2 style="font-size:16px">Cookies und lokale Speicherung</h2>
      <p>Die Website setzt ein Cookie, das für ihren Betrieb unbedingt erforderlich ist: Es hält deine Anmeldung aufrecht, höchstens 30 Tage
        lang; ein Besuch ohne Konto erhält ein weiteres, das 12 Stunden lang bestätigt, dass die Prüfung gegen Robots bestanden
        wurde, und sonst nichts enthält. Der Browser speichert außerdem auf deinem Gerät deine Anzeigeeinstellungen (Sprache, Thema, gewählte Disziplin und
        Methode), deine Eingaben im MAG-Rechner oder im Staffelsimulator und, für die Bahnlegung, ihre Anzeigeeinstellungen, den Schlüssel
        eines verschlüsselten Ereignisses, aus seiner Passphrase abgeleitet (für die Dauer des Tabs), die auf eine Netzverbindung wartenden Zustände des Geländemodus und, wenn du
        ein Ereignis behältst, um offline zu arbeiten, seine Kopie (Bahnen und Karte, verschlüsselt, falls das Ereignis verschlüsselt ist) und die Dateien der Website, die beim Abmelden gelöscht werden;
        wenn du auf der Seite „KI“ deinen eigenen API-Schlüssel verwendest, diesen Schlüssel (für die Dauer des Tabs oder auf dem Gerät, wenn du es wünschst;
        beim Abmelden gelöscht). Die Website verwendet keine Werbetracker und
        kein Reichweitenmessungswerkzeug von Dritten; eine Einwilligung ist daher nicht erforderlich.</p>
      <h2 style="font-size:16px">Deine Rechte</h2>
      <p>Gemäß der DSGVO hast du ein Recht auf Auskunft, Berichtigung, Löschung und Datenübertragbarkeit, ein
        Recht auf Einschränkung der Verarbeitung und ein Widerspruchsrecht gegen Verarbeitungen, die auf dem berechtigten Interesse des
        Herausgebers beruhen.</p>
      <p>Du kannst insbesondere verlangen, auf ${SITE} nicht mehr identifiziert zu werden, sofern keine zwingenden schutzwürdigen Gründe entgegenstehen: Dein Name und
        deine Lizenznummer werden dann auf der gesamten Website durch einen anonymen Vermerk („Anonymer Läufer“) ersetzt. Deine
        Zeiten und Ränge werden weiterhin berücksichtigt, ohne deinen Namen und deine Lizenznummer, damit die Ranglisten der anderen
        Lizenzinhaber nicht verändert werden; die Maßnahme ist auf deinen Wunsch umkehrbar. Ein Antrag auf Löschung der Ergebnisdaten
        wird auf dieselbe Weise erfüllt; ein Konto wird dagegen vollständig gelöscht. Die Daten eines minderjährigen Lizenzinhabers werden
        auf einfachen Antrag seines gesetzlichen Vertreters, der diese Rechte in seinem Namen ausübt, anonymisiert und sein Konto, falls er eines hat,
        gelöscht.</p>
      <p>Du kannst dein Konto selbst in den Einstellungen löschen. Andere Anfragen richtest du an contact@ozimut.com; sie werden
        innerhalb eines Monats beantwortet. Bei begründeten Zweifeln an der Identität des Antragstellers kann ein Nachweis verlangt werden.
        Wenn du der Ansicht bist, dass deine Rechte nicht gewahrt werden, kannst du eine Beschwerde bei der CNIL, der französischen Datenschutzaufsichtsbehörde, einreichen
        (<a href="https://www.cnil.fr/fr/plaintes" target="_blank" rel="noopener">cnil.fr/fr/plaintes</a>).</p>
      <h2 style="font-size:16px">Impressum</h2>
      <p><b>Herausgeber und verantwortlich für den Inhalt:</b> Yann Le Helloco, Privatperson, nicht berufliche Veröffentlichung;
        Kontakt: contact@ozimut.com.<br>
        <b>Hoster:</b> Cloudflare, Inc., 101 Townsend Street, San Francisco, CA 94107, USA; Telefon: +1 888 993 5273.</p>
      <p><b>Geistiges Eigentum:</b> Die Texte, Abbildungen, die Gestaltung und der Code der Website sind urheberrechtlich geschützt;
        sofern nicht anders angegeben, gehören sie dem Herausgeber, und ihre Vervielfältigung braucht seine Zustimmung. Die Artikel der
        Seite „Gesundheit“ gehören ihren Autorinnen und Autoren (siehe „Gesundheit: Artikel und Urheberrecht“). Die Ergebnisse,
        offiziellen Ranglisten und Kalender, die die Website übernimmt, bleiben die ihrer Quellen (siehe „Unabhängigkeit und Quellen“);
        Bestandteile Dritter sind unten genannt.</p>
      <p><b>Danksagung:</b> Die Symbole und Texte der Postenbeschreibungen (Coach › Postenbeschreibungen, die Bahnlegung)
        stammen aus Purple Pen von Peter Golde (<a href="https://github.com/petergolde/PurplePen" target="_blank" rel="noopener">github.com/petergolde/PurplePen</a>),
        unter der <a href="assets/tracer/LICENSE-PurplePen.txt" target="_blank" rel="noopener">BSD-Lizenz</a>.</p>
      <p class="muted">Letzte Aktualisierung: 28. November 2026.</p>
`;
