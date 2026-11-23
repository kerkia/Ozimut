# Ozimut — the store listing pack (App Store and Google Play)

Written 2026-11-23 for version 1.0 of the companion app (`app/ios`, `app/android`). The contract is
[`design.md`](design.md): **nothing about buying, ever** — and the listing obeys the same rule as the app. No price, no plan,
no « gratuit / free / kostenlos / gratis », no « premium », no subscription, no purchase, no « create your account at… », no
pointer to the website as the place to get more (Apple guideline 3.1.3(f); Google Play consumption-only). The texts below were
checked by a script for every store limit and for those words (the counts are given after each field); change a text, count it
again. The App Store texts may name the iPhone and the Health app; the Google Play texts name neither, and neither listing
names another company's product (watch makers included: « your watch's app »).

Points still to confirm are marked **to confirm** and gathered in section 9.

## 1. Positioning

**For ourselves.** The app is not « the website on a phone »: a browser already does that. It is **the race analysed in the
arena, minutes after the finish**: the paper map scanned by the phone's own document scanner (edges found, perspective
straightened), the GPS track taken from the watch (shared from the watch's app into Ozimut, or on an iPhone read from the Health
app), and Ozimut does what no other phone app does — it reads the course printed on the map, finds the controls, lays the track
on them by itself, and replays the race leg by leg with the pace, the time lost, the route choices computed on the map and, where
the organiser opened an analysis, the other runners. Everything else Ozimut offers (the competitions, results and live results of
Arena, the rankings of Stats, Coach's training tools, Carto, Pixel) comes with it and makes the app worth keeping between races;
the notifications bring the runner back to it. Every listing text, the first two screenshots and the review notes lead with the
analysis.

**The three native features, by value:**

1. **Map and track straight into the analysis** — the document scanner (« Scanner la carte ») and, on an iPhone, the watch's
   routes read from Health (« Mes sorties (Santé) »); on both phones a GPX, FIT or TCX shared from the watch's app or opened with
   Ozimut lands in « Analyse solo ». This is what makes the arena use possible: no computer, no cable, no file hunting.
2. **Native notifications** — results online, start time published, a new competition in one's regions, entries closing. They are
   what brings a runner back to the app after the race and before the next one.
3. **Files in and out** — « Open with / Share to Ozimut » for GPX, FIT, TCX, KML, KMZ, images and PDF from any app; every image
   or export the site makes handed to the system's share / save sheet.

## 2. App Store texts

Limits: name 30, subtitle 30, promotional text 170, description 4000, keywords 100 (comma-separated, no spaces), What's New 4000.
The words of the name and the subtitle are indexed by the App Store: the keywords do not repeat them. **Apple shows no « What's
New » field for a first version**: keep these texts for the first update (1.0.1), shortened to what it changes.

### 2.1 Français (fr-FR)

**Name** — 29 / 30 characters

```text
Ozimut – Course d'orientation
```

**Subtitle** — 30 / 30 characters

```text
La course analysée à l'arrivée
```

**Promotional text** — 161 / 170 characters

```text
Scannez la carte, prenez la trace de votre montre : Ozimut pose la trace sur la carte et rejoue votre course poste après poste, quelques minutes après l'arrivée.
```

**Keywords** — 95 / 100 characters

```text
CO,carte,GPS,trace,montre,poste,circuit,interposte,itinéraire,résultats,classement,sprint,forêt
```

**Description** — 2140 / 4000 characters

```text
Votre course analysée avant même d'avoir quitté l'arène.

Scannez la carte papier avec le téléphone, prenez la trace GPS de votre montre — partagée depuis l'app de votre montre, ou lue dans l'app Santé — et Ozimut fait le reste. Il lit le circuit imprimé sur la carte, retrouve les postes, y pose votre trace et rejoue votre course poste après poste :
• votre itinéraire sur la carte, coloré selon l'allure
• le temps, l'allure et la longueur de chaque interposte, comparée à la ligne droite
• le temps perdu sur chaque interposte, dès que les temps intermédiaires de la course sont sur Ozimut
• les choix d'itinéraire calculés sur la carte, et la place du vôtre parmi eux
• les itinéraires des autres coureurs, quand l'organisateur a ouvert l'analyse de son événement

Rien à caler à la main, pas besoin d'ordinateur. La carte et la trace restent sur le téléphone tant que vous ne choisissez pas d'enregistrer l'analyse.

ET AUSSI
ARENA — le calendrier des compétitions en France et dans plus de trente pays, les résultats dès que les organisateurs les publient, le direct et l'analyse des temps intermédiaires.
STATS — les classements nationaux (France, Espagne) et la page de chaque coureur : progression, saisons, courses.
COACH — des jeux pour apprendre à lire la carte, les définitions de postes et les symboles de carte, votre bibliothèque de cartes et d'itinéraires.
CARTO — un éditeur de cartes de CO, jusque sur le terrain avec votre position sur la carte.
PIXEL — des courses virtuelles dans des forêts en 3D tirées de vraies cartes.

NOTIFICATIONS
Vos résultats en ligne, votre heure de départ publiée, une nouvelle compétition dans vos régions, la clôture des inscriptions qui approche.

OUVRIR AVEC OZIMUT
GPX, FIT, TCX, KML, KMZ, images et PDF, depuis n'importe quelle app. Les images et exports d'Ozimut s'enregistrent sur le téléphone ou se partagent.

Connectez-vous avec votre compte Ozimut, ou entrez sans compte pour découvrir les compétitions, les résultats et l'analyse.

Ozimut est indépendant, et ne vous suit pas : votre position n'est lue que pendant qu'une page qui l'affiche est ouverte, jamais en arrière-plan.
```

**What's New in This Version** — 213 / 4000 characters

```text
Première version : la course analysée à l'arrivée (carte scannée, trace de la montre ou de l'app Santé), les notifications d'Ozimut sur le téléphone, et les fichiers GPX, FIT et TCX ouverts directement dans l'app.
```

### 2.2 English (en-GB, also used for en-US)

**Name** — 21 / 30 characters

```text
Ozimut – Orienteering
```

**Subtitle** — 27 / 30 characters

```text
Replay your race on the map
```

**Promotional text** — 139 / 170 characters

```text
Scan the map, take the track from your watch: Ozimut lays it on the map and replays your race control by control, minutes after the finish.
```

**Keywords** — 99 / 100 characters

```text
GPS,track,watch,control,course,leg,route,choice,splits,results,ranking,sprint,forest,analysis,arena
```

**Description** — 1867 / 4000 characters

```text
Your race analysed before you have even left the arena.

Scan the paper map with your phone, take the GPS track from your watch — shared from your watch's app, or read from the Health app — and Ozimut does the rest. It reads the course printed on the map, finds the controls, lays your track on it and replays your race control by control:
• your route on the map, coloured by pace
• each leg's time, pace and length against the straight line
• the time lost on each leg, as soon as the race's split times are on Ozimut
• the route choices computed on the map, and where yours stood
• the other runners' routes, when the organiser has opened an analysis of the event

Nothing to calibrate by hand, no computer needed. The map and the track stay on your phone unless you choose to save the analysis.

ALSO IN OZIMUT
ARENA — the calendar of competitions in France and over thirty other countries, results as soon as organisers publish them, live results and split-time analysis.
STATS — national rankings (France, Spain) and every runner's page: progress, seasons, races.
COACH — games to train your map reading, control descriptions and map symbols to learn, your own library of maps and routes.
CARTO — an orienteering map editor that goes out into the terrain with you, your position on the map.
PIXEL — virtual races through 3D forests made from real maps.

NOTIFICATIONS
Your results online, your start time published, a new competition in your regions, entries about to close.

OPEN WITH OZIMUT
GPX, FIT, TCX, KML, KMZ, images and PDF, from any app. Ozimut's images and exports are saved to your phone or shared.

Sign in with your Ozimut account, or enter without an account to explore competitions, results and the analysis.

Ozimut is independent, and it does not follow you: your position is read only while a page showing it is open, never in the background.
```

**What's New in This Version** — 196 / 4000 characters

```text
First version: your race analysed at the finish (scanned map, track from your watch or the Health app), Ozimut's notifications on your phone, and GPX, FIT and TCX files opened straight in the app.
```

### 2.3 Deutsch (de-DE)

**Name** — 26 / 30 characters

```text
Ozimut – Orientierungslauf
```

**Subtitle** — 29 / 30 characters

```text
Dein Lauf, im Ziel analysiert
```

**Promotional text** — 152 / 170 characters

```text
Karte scannen, Track von der Uhr holen: Ozimut legt ihn auf die Karte und spielt deinen Lauf Posten für Posten ab – wenige Minuten nach dem Zieleinlauf.
```

**Keywords** — 100 / 100 characters

```text
OL,Karte,GPS,Track,Uhr,Posten,Teilstrecke,Routenwahl,Zwischenzeiten,Ergebnisse,Rangliste,Sprint,Wald
```

**Description** — 2033 / 4000 characters

```text
Dein Lauf ist analysiert, bevor du die Arena verlassen hast.

Scanne die Papierkarte mit dem iPhone, hol dir den GPS-Track deiner Uhr – geteilt aus der App deiner Uhr oder aus der Health-App gelesen – und Ozimut erledigt den Rest. Es liest die auf der Karte gedruckte Bahn, findet die Posten, legt deinen Track darauf und spielt deinen Lauf Posten für Posten ab:
• deine Route auf der Karte, nach Tempo eingefärbt
• Zeit, Tempo und Länge jeder Teilstrecke, verglichen mit der Luftlinie
• der Zeitverlust auf jeder Teilstrecke, sobald die Zwischenzeiten des Laufs auf Ozimut sind
• die auf der Karte berechneten Routenwahlen – und wo deine dabei liegt
• die Routen der anderen Läufer, wenn der Veranstalter eine Analyse seines Laufs geöffnet hat

Nichts von Hand kalibrieren, kein Computer nötig. Karte und Track bleiben auf dem Handy, solange du die Analyse nicht speicherst.

AUSSERDEM IN OZIMUT
ARENA – der Wettkampfkalender für Frankreich und über dreißig weitere Länder, Ergebnisse, sobald die Veranstalter sie veröffentlichen, Live-Ergebnisse und Zwischenzeitanalyse.
STATS – nationale Ranglisten (Frankreich, Spanien) und die Seite jedes Läufers: Entwicklung, Saisons, Läufe.
COACH – Spiele fürs Kartenlesen, Postenbeschreibungen und Kartensymbole zum Lernen, deine eigene Sammlung von Karten und Routen.
CARTO – ein OL-Karteneditor, der mit ins Gelände kommt, mit deiner Position auf der Karte.
PIXEL – virtuelle Läufe durch 3D-Wälder, die aus echten Karten entstehen.

BENACHRICHTIGUNGEN
Deine Ergebnisse sind online, deine Startzeit ist veröffentlicht, ein neuer Wettkampf in deinen Regionen, der Anmeldeschluss naht.

MIT OZIMUT ÖFFNEN
GPX, FIT, TCX, KML, KMZ, Bilder und PDF aus jeder App. Bilder und Exporte aus Ozimut speicherst du auf dem Handy oder teilst sie.

Melde dich mit deinem Ozimut-Konto an oder mach ohne Konto weiter, um Wettkämpfe, Ergebnisse und die Analyse zu entdecken.

Ozimut ist unabhängig und verfolgt dich nicht: Deine Position wird nur gelesen, solange eine Seite sie anzeigt – nie im Hintergrund.
```

**What's New in This Version** — 212 / 4000 characters

```text
Erste Version: dein Lauf im Ziel analysiert (gescannte Karte, Track von der Uhr oder aus der Health-App), die Benachrichtigungen von Ozimut auf dem Handy und GPX-, FIT- und TCX-Dateien direkt in der App geöffnet.
```

### 2.4 Español (es-ES)

**Name** — 20 / 30 characters

```text
Ozimut – Orientación
```

**Subtitle** — 29 / 30 characters

```text
Tu carrera, analizada en meta
```

**Promotional text** — 156 / 170 characters

```text
Escanea el mapa, toma el track de tu reloj: Ozimut lo coloca sobre el mapa y reproduce tu carrera control a control, pocos minutos después de llegar a meta.
```

**Keywords** — 98 / 100 characters

```text
mapa,GPS,track,reloj,control,baliza,recorrido,tramo,ruta,parciales,resultados,clasificación,bosque
```

**Description** — 2053 / 4000 characters

```text
Tu carrera analizada antes incluso de salir de la arena.

Escanea el mapa de papel con el iPhone, toma el track GPS de tu reloj —compartido desde la app de tu reloj o leído en la app Salud— y Ozimut hace el resto. Lee el recorrido impreso en el mapa, encuentra los controles, coloca tu track encima y reproduce tu carrera control a control:
• tu ruta sobre el mapa, coloreada según el ritmo
• el tiempo, el ritmo y la longitud de cada tramo, frente a la línea recta
• el tiempo perdido en cada tramo, en cuanto los tiempos parciales de la carrera están en Ozimut
• las elecciones de ruta calculadas sobre el mapa, y dónde queda la tuya
• las rutas de los demás corredores, cuando el organizador ha abierto el análisis de su evento

Nada que calibrar a mano, ningún ordenador. El mapa y el track se quedan en el teléfono mientras no decidas guardar el análisis.

ADEMÁS EN OZIMUT
ARENA: el calendario de competiciones de Francia y de más de treinta países, los resultados en cuanto los organizadores los publican, los resultados en directo y el análisis de tiempos parciales.
STATS: clasificaciones nacionales (Francia, España) y la página de cada corredor: progresión, temporadas, carreras.
COACH: juegos para aprender a leer el mapa, descripciones de control y símbolos del mapa, tu propia biblioteca de mapas y rutas.
CARTO: un editor de mapas de orientación que te acompaña al terreno, con tu posición en el mapa.
PIXEL: carreras virtuales por bosques en 3D creados a partir de mapas reales.

NOTIFICACIONES
Tus resultados publicados, tu hora de salida, una nueva competición en tus regiones, el cierre de inscripciones que se acerca.

ABRIR CON OZIMUT
GPX, FIT, TCX, KML, KMZ, imágenes y PDF desde cualquier app. Las imágenes y exportaciones de Ozimut se guardan en el teléfono o se comparten.

Inicia sesión con tu cuenta Ozimut o entra sin cuenta para descubrir las competiciones, los resultados y el análisis.

Ozimut es independiente y no te sigue: tu posición solo se lee mientras una página que la muestra está abierta, nunca en segundo plano.
```

**What's New in This Version** — 207 / 4000 characters

```text
Primera versión: tu carrera analizada en meta (mapa escaneado, track de tu reloj o de la app Salud), las notificaciones de Ozimut en el teléfono y los archivos GPX, FIT y TCX abiertos directamente en la app.
```

## 3. Google Play texts

Limits: app name 30, short description 80, full description 4000, release notes 500. Google Play forbids in the listing words
such as « best », « #1 », « free » or a price, and emoji in the title: none is used. The release notes go in the release itself
(Play Console › Release › the release's notes), one block per language.

### 3.1 Français (fr-FR)

**App name (title)** — 29 / 30 characters

```text
Ozimut – Course d'orientation
```

**Short description** — 80 / 80 characters

```text
Scannez la carte, ajoutez la trace de la montre : la course rejouée à l'arrivée.
```

**Full description** — 1982 / 4000 characters

```text
Votre course analysée avant même d'avoir quitté l'arène.

Scannez la carte papier avec le scanner de documents du téléphone, partagez la trace GPS depuis l'app de votre montre — ou ouvrez n'importe quel fichier GPX, FIT ou TCX — et Ozimut fait le reste. Il lit le circuit imprimé sur la carte, retrouve les postes, y pose votre trace et rejoue votre course poste après poste :
• votre itinéraire sur la carte, coloré selon l'allure
• le temps, l'allure et la longueur de chaque interposte, comparée à la ligne droite
• le temps perdu sur chaque interposte, dès que les temps intermédiaires de la course sont sur Ozimut
• les choix d'itinéraire calculés sur la carte, et la place du vôtre parmi eux
• les itinéraires des autres coureurs, quand l'organisateur a ouvert l'analyse de son événement

Rien à caler à la main, pas besoin d'ordinateur. La carte et la trace restent sur le téléphone tant que vous ne choisissez pas d'enregistrer l'analyse.

ET AUSSI
ARENA — le calendrier des compétitions en France et dans plus de trente pays, les résultats dès que les organisateurs les publient, le direct et l'analyse des temps intermédiaires.
STATS — les classements nationaux (France, Espagne) et la page de chaque coureur.
COACH — des jeux pour apprendre à lire la carte, les définitions de postes, votre bibliothèque de cartes et d'itinéraires.
CARTO — un éditeur de cartes de CO, jusque sur le terrain avec votre position.
PIXEL — des courses virtuelles dans des forêts en 3D tirées de vraies cartes.

Des notifications pour vos résultats en ligne, votre heure de départ, les nouvelles compétitions de vos régions et la clôture des inscriptions. Les exports d'Ozimut s'enregistrent ou se partagent depuis l'app.

Connectez-vous avec votre compte Ozimut, ou entrez sans compte pour découvrir les compétitions, les résultats et l'analyse.

Ozimut est indépendant, et ne vous suit pas : votre position n'est lue que pendant qu'une page qui l'affiche est ouverte, jamais en arrière-plan.
```

**Release notes (What's new)** — 217 / 500 characters

```text
Première version : la course analysée à l'arrivée (carte scannée, trace partagée depuis l'app de la montre), les notifications d'Ozimut sur le téléphone, et les fichiers GPX, FIT et TCX ouverts directement dans l'app.
```

### 3.2 English (en-GB, also used for en-US)

**App name (title)** — 21 / 30 characters

```text
Ozimut – Orienteering
```

**Short description** — 77 / 80 characters

```text
Scan the map, add your watch's track: your race replayed right at the finish.
```

**Full description** — 1709 / 4000 characters

```text
Your race analysed before you have even left the arena.

Scan the paper map with your phone's document scanner, share the GPS track from your watch's app — or open any GPX, FIT or TCX file — and Ozimut does the rest. It reads the course printed on the map, finds the controls, lays your track on it and replays your race control by control:
• your route on the map, coloured by pace
• each leg's time, pace and length against the straight line
• the time lost on each leg, as soon as the race's split times are on Ozimut
• the route choices computed on the map, and where yours stood
• the other runners' routes, when the organiser has opened an analysis of the event

Nothing to calibrate by hand, no computer needed. The map and the track stay on your phone unless you choose to save the analysis.

ALSO IN OZIMUT
ARENA — the calendar of competitions in France and over thirty other countries, results as soon as organisers publish them, live results and split-time analysis.
STATS — national rankings (France, Spain) and every runner's page.
COACH — games to train your map reading, control descriptions, your own library of maps and routes.
CARTO — an orienteering map editor that goes out into the terrain with you.
PIXEL — virtual races through 3D forests made from real maps.

Notifications for your results, your start time, new competitions in your regions and entries about to close. Ozimut's exports are saved to your phone or shared from the app.

Sign in with your Ozimut account, or enter without an account to explore competitions, results and the analysis.

Ozimut is independent, and it does not follow you: your position is read only while a page showing it is open, never in the background.
```

**Release notes (What's new)** — 191 / 500 characters

```text
First version: your race analysed at the finish (scanned map, track shared from your watch's app), Ozimut's notifications on your phone, and GPX, FIT and TCX files opened straight in the app.
```

### 3.3 Deutsch (de-DE)

**App name (title)** — 26 / 30 characters

```text
Ozimut – Orientierungslauf
```

**Short description** — 78 / 80 characters

```text
Karte scannen, Track der Uhr dazu: dein Lauf, abgespielt gleich nach dem Ziel.
```

**Full description** — 1853 / 4000 characters

```text
Dein Lauf ist analysiert, bevor du die Arena verlassen hast.

Scanne die Papierkarte mit dem Dokumentenscanner des Handys, teile den GPS-Track aus der App deiner Uhr – oder öffne eine beliebige GPX-, FIT- oder TCX-Datei – und Ozimut erledigt den Rest. Es liest die auf der Karte gedruckte Bahn, findet die Posten, legt deinen Track darauf und spielt deinen Lauf Posten für Posten ab:
• deine Route auf der Karte, nach Tempo eingefärbt
• Zeit, Tempo und Länge jeder Teilstrecke, verglichen mit der Luftlinie
• der Zeitverlust auf jeder Teilstrecke, sobald die Zwischenzeiten des Laufs auf Ozimut sind
• die auf der Karte berechneten Routenwahlen – und wo deine dabei liegt
• die Routen der anderen Läufer, wenn der Veranstalter eine Analyse seines Laufs geöffnet hat

Nichts von Hand kalibrieren, kein Computer nötig. Karte und Track bleiben auf dem Handy, solange du die Analyse nicht speicherst.

AUSSERDEM IN OZIMUT
ARENA – der Wettkampfkalender für Frankreich und über dreißig weitere Länder, Ergebnisse, sobald die Veranstalter sie veröffentlichen, Live-Ergebnisse und Zwischenzeitanalyse.
STATS – nationale Ranglisten (Frankreich, Spanien) und die Seite jedes Läufers.
COACH – Spiele fürs Kartenlesen, Postenbeschreibungen, deine eigene Sammlung von Karten und Routen.
CARTO – ein OL-Karteneditor, der mit ins Gelände kommt.
PIXEL – virtuelle Läufe durch 3D-Wälder, die aus echten Karten entstehen.

Benachrichtigungen für deine Ergebnisse, deine Startzeit, neue Wettkämpfe in deinen Regionen und den nahenden Anmeldeschluss. Exporte aus Ozimut speicherst oder teilst du direkt aus der App.

Melde dich mit deinem Ozimut-Konto an oder mach ohne Konto weiter, um Wettkämpfe, Ergebnisse und die Analyse zu entdecken.

Ozimut ist unabhängig und verfolgt dich nicht: Deine Position wird nur gelesen, solange eine Seite sie anzeigt – nie im Hintergrund.
```

**Release notes (What's new)** — 207 / 500 characters

```text
Erste Version: dein Lauf im Ziel analysiert (gescannte Karte, Track aus der App deiner Uhr geteilt), die Benachrichtigungen von Ozimut auf dem Handy und GPX-, FIT- und TCX-Dateien direkt in der App geöffnet.
```

### 3.4 Español (es-ES)

**App name (title)** — 20 / 30 characters

```text
Ozimut – Orientación
```

**Short description** — 74 / 80 characters

```text
Escanea el mapa, añade el track del reloj: tu carrera reproducida en meta.
```

**Full description** — 1888 / 4000 characters

```text
Tu carrera analizada antes incluso de salir de la arena.

Escanea el mapa de papel con el escáner de documentos del teléfono, comparte el track GPS desde la app de tu reloj —o abre cualquier archivo GPX, FIT o TCX— y Ozimut hace el resto. Lee el recorrido impreso en el mapa, encuentra los controles, coloca tu track encima y reproduce tu carrera control a control:
• tu ruta sobre el mapa, coloreada según el ritmo
• el tiempo, el ritmo y la longitud de cada tramo, frente a la línea recta
• el tiempo perdido en cada tramo, en cuanto los tiempos parciales de la carrera están en Ozimut
• las elecciones de ruta calculadas sobre el mapa, y dónde queda la tuya
• las rutas de los demás corredores, cuando el organizador ha abierto el análisis de su evento

Nada que calibrar a mano, ningún ordenador. El mapa y el track se quedan en el teléfono mientras no decidas guardar el análisis.

ADEMÁS EN OZIMUT
ARENA: el calendario de competiciones de Francia y de más de treinta países, los resultados en cuanto los organizadores los publican, los resultados en directo y el análisis de tiempos parciales.
STATS: clasificaciones nacionales (Francia, España) y la página de cada corredor.
COACH: juegos para aprender a leer el mapa, descripciones de control, tu propia biblioteca de mapas y rutas.
CARTO: un editor de mapas de orientación que te acompaña al terreno.
PIXEL: carreras virtuales por bosques en 3D creados a partir de mapas reales.

Notificaciones para tus resultados, tu hora de salida, las nuevas competiciones de tus regiones y el cierre de inscripciones. Las exportaciones de Ozimut se guardan o se comparten desde la app.

Inicia sesión con tu cuenta Ozimut o entra sin cuenta para descubrir las competiciones, los resultados y el análisis.

Ozimut es independiente y no te sigue: tu posición solo se lee mientras una página que la muestra está abierta, nunca en segundo plano.
```

**Release notes (What's new)** — 213 / 500 characters

```text
Primera versión: tu carrera analizada en meta (mapa escaneado, track compartido desde la app de tu reloj), las notificaciones de Ozimut en el teléfono y los archivos GPX, FIT y TCX abiertos directamente en la app.
```

## 4. Screenshots

**Six screenshots**, in this order, for the iPhone 6.9" set (1320 × 2868 px portrait; 1290 × 2796 is accepted too) and the
Android phone set (1080 × 1920 px portrait: Google refuses a side more than twice the other). On Google Play also: the icon
512 × 512 PNG and the feature graphic 1024 × 500 (the Ozimut mark on the map's white, the first caption beside it).

**Data: invented only.** The screenshots are public, as the home page's: **never a real runner's results, name, map or track**
(CLAUDE.md « The site in pictures »). Use the invented material already made for the home page: the reel's invented forest map
with its course drawn in purple and the invented runner's GPX (`site/data/_trtest/carte.kmz` + `trace.gpx`, the files behind
`tour/<lang>/phone-analysis.webp`; the generator in `C:\kerkia\Ozimut\work\scratch-scripts\…\reelgps\`), the local test analysis
« Test UI club » with its runners' names replaced by `shots/lib.mjs`, and the scrambled database `synth/oz2` for Arena. **No price
anywhere**: no event's entry details (they may show entry fees), no « Tarifs » section, no « Plus » mark.

**How to capture** (**to confirm** which way the owner prefers): a Debug build pointed at a local server that serves the invented
data — iOS `OZ_BASE_URL` / `OZ_DEV_HOST` through an https tunnel, Android `-PozimutBase=http://10.0.2.2:8788` on the emulator with
a debug manifest allowing cleartext — and the screens taken on the device or simulator, in each of the four languages (the
account's language: set it in Réglages before each set). Screenshot 1 must come from a real phone (the scanner needs a camera).
The pages themselves are the site's: headless Edge with the app's user agent (` OzimutApp/1.0 (ios)`) at 440 × 956 and a device
scale of 3 gives the same pages for screenshots 2-6 if a device is not at hand, with the status bar added afterwards.

| # | Caption FR | Caption EN | Caption DE | Caption ES | What to capture |
|---|---|---|---|---|---|
| 1 | Scannez la carte à l'arrivée | Scan the map at the finish | Scanne die Karte im Ziel | Escanea el mapa en meta | The system's document scanner (iPhone: VisionKit; Android: Google's document scanner) framing the invented map **printed on A4**, its edges found (the highlighted outline), in daylight on a bench or grass. If the scanner's screen is not wanted: « Analyse solo »'s files card just after the scan — the map's thumbnail, the buttons « Scanner la carte » and « Mes sorties (Santé) » and their line « La carte, redressée par le scanner… » (`appf.hint.both`). |
| 2 | La trace se pose seule sur la carte | Your track laid on the map, by itself | Dein Track liegt von selbst auf der Karte | Tu track, colocado solo sobre el mapa | « Analyse solo » at the end of the automatic calibration: the scanned map, the controls found ringed, the invented runner's track laid through them, the bar at the bottom with « Voir la course ». |
| 3 | Rejouez la course, poste après poste | Replay your race, control by control | Dein Lauf, Posten für Posten abgespielt | Revive tu carrera, control a control | The playback in full window (⤢), dark theme as `phone-analysis.webp`: the route coloured by pace with its legend, the runner's dot and tail mid-race, the leg chip « 4 → 5 », the « Allure » bar with the moment's figures. |
| 4 | Temps perdu et choix d'itinéraire | Time lost and route choices, leg by leg | Zeitverlust und Routenwahl je Teilstrecke | Tiempo perdido y elección de ruta por tramo | A leg opened, the left drawer on « Itinéraires »: the computed routes A, B, C drawn on the map with their times, the runner's own route matched (« Choix », « Exécution »). Choose a leg with a real route choice (the invented map was made with them). |
| 5 | Comparez avec les autres coureurs | Compare with the other runners | Vergleiche dich mit den anderen | Compárate con los demás corredores | The map analysis « Test UI club », circuit « Bleu », four invented runners coloured by runner, a leg opened (their four routes whole), their invented names and initials (`lib.mjs`). |
| 6 | Compétitions, résultats et direct | Competitions, results and live | Wettkämpfe, Ergebnisse und live | Competiciones, resultados y directo | Arena's competitions list on the scrambled data (`synth/oz2`), today's line with the last past competition above it, the three period boxes; optionally a notification banner « Vos résultats sont en ligne » laid over its top (a composite is allowed if it shows what the app does). |

Optional seventh and eighth (Apple takes ten, Google eight): a Stats runner page on the scrambled data (« Votre progression,
saison après saison »), and Pixel's 3D forest on an invented terrain (« Courez dans des forêts en 3D »).

## 5. App Review notes (English, ready to paste)

Paste in App Store Connect › the version › App Review Information › Notes. Attach the two files named below (Attachment).
**Sign-in information**: use a **regular** test account kept for Apple, not one of Ozimut's « demo » accounts (those are
read-only: the server refuses them every write, so the reviewer could neither turn notifications on nor save an analysis).

```text
WHAT THE APP IS
Ozimut is an independent service for orienteering, the sport of racing between checkpoints ("controls") with a paper map. This app is its iPhone companion: it shows the ozimut.com service in a web view and adds what a web page cannot do on a phone:
- the document scanner (VisionKit) to photograph and straighten the paper race map;
- read-only access to the workout routes in the Health app, to take the GPS track recorded by the runner's watch;
- files opened with or shared to the app (GPX, FIT, TCX, KML, KMZ, images, PDF);
- native notifications (results published, start time published, new competitions, entries closing);
- saving the images and files the service makes through the share sheet.
Its main use: minutes after finishing a race, the runner scans the map, picks the watch's track, and the app lays the track on the map automatically (it reads the course printed on the map and aligns the track to it), then replays the race leg by leg.

BUSINESS MODEL (GUIDELINE 3.1.3(f))
The app is a free stand-alone companion to the web-based Ozimut service. There is no purchasing of any kind in the app, and no call to action for purchasing outside it: no price, plan, subscription, upgrade button or link towards buying is ever shown in the app (the service checks the app's user agent and removes all of it; the app also refuses to load any payment page). A signed-in account sees in the app what it already has.

ACCOUNTS (GUIDELINE 5.1.1(v))
Accounts are neither created nor deleted in the app: the app offers sign-in, or "Enter without an account". It has no registration screen and does not mention where accounts are made, so in-app account deletion does not apply. Accounts are created and deleted on the ozimut.com website (deletion: Settings, "Delete my account").

HOW TO ENTER
- Without an account: on the first screen, tap "Enter without an account". (An invisible anti-robot check may ask for one tap.)
- With the test account: <e-mail> / <password>

SEE THE NATIVE FEATURES IN TWO MINUTES
We attached two files: ozimut-review-map.png (a made-up orienteering map with a course printed in purple) and ozimut-review-track.gpx (a made-up GPS track run on that map).
1. Save both attachments to the Files app. Show ozimut-review-map.png full screen on a computer, or print it.
2. In Ozimut: on the modules page, tap "Coach", then "Analysis", then "Add my own event". The "Solo analysis" page opens.
3. Tap "Scan the map" and scan the map from the screen or the paper (any printed page works to see the scanner itself).
4. In the Files app, open ozimut-review-track.gpx, tap Share, then "Ozimut" (or use the file field of the page). The app reads the course on the map, places the controls and lays the track on them.
5. Tap "View the race" (bottom bar): the race replays; tap ⤢ for full screen, and a row of "Legs" (left panel) to see that leg alone.
6. "My workouts (Health)" (next to "Scan the map") lists the workouts with a GPS route from the last 30 days; on a device with none it says so.
7. With the test account: open the top-right menu, "Settings", then "Turn on for this device" under notifications; "Send a test" delivers one; tapping it opens its page.
8. Any image the service makes opens the share sheet: in the replay's "Export" panel, "Export a picture" then "Save the picture".

PERMISSIONS
- Location, when in use only: shown as "your position" on a map page that asks for it (the map editor's field mode, "My position"). Never in the background; the app has no background mode and does not track anyone. The position is not stored by the app.
- Health, read only: workout routes, read only when the user taps "My workouts (Health)" and picks one; turned into a GPS track for the analysis on the phone. Nothing is ever written to Health. Health data is not used for advertising, and there is no advertising at all.
- Camera and photo library: photographing or choosing the map. Notifications: asked only when the user turns them on in Settings.

No advertising, no tracking, no third-party analytics or advertising SDK in the app.
```

Before submitting (**to confirm**): make the two attachments — the invented map with its course as a PNG (from
`site/data/_trtest/carte.kmz`) and its GPX (`trace.gpx`), renamed as above — and check on a phone that scanning that PNG from a
computer screen gives an automatic calibration (the moiré of a screen may defeat the course reading; if so, say « print it » only).
Check also that the English labels quoted above match the app (« Coach », « Analysis », « Add my own event », « Scan the map »,
« My workouts (Health) », « View the race », « Legs », « Export a picture », « Turn on for this device », « Send a test »): **to confirm** on the device, as
some page labels may differ slightly.

## 6. Ready replies to a rejection (English)

**Guideline 3.1.1 / 3.1.3 (payments)**

```text
Hello, and thank you for the review.

Ozimut is a stand-alone companion app to the web-based Ozimut service, under guideline 3.1.3(f). The app contains no purchasing of any kind and no call to action for purchasing outside the app: it shows no price, plan, subscription, upgrade button or link towards buying, and it refuses to load payment pages. The service recognises the app and removes every such element from what it displays; a signed-in user simply sees in the app the features their account already has. Nothing is unlocked, sold or redeemed in the app.

If a screen still shows something you consider a purchase or a call to action, could you tell us which one (a screenshot would help)? We will remove it at once.

Kind regards,
The Ozimut team
```

**Guideline 4.2 (minimum functionality)**

```text
Hello, and thank you for the review.

Ozimut is more than a website in a web view. Its main use relies on native features that a web page cannot offer on iPhone: the VisionKit document scanner to capture and straighten the paper orienteering map in the race arena; read-only access to the workout routes in the Health app to take the GPS track recorded by the runner's watch; GPX, FIT and TCX files opened with or shared to the app from the watch makers' apps; native push notifications when the runner's results or start time are published; and the share sheet for the images and files the analysis produces. Together they let a runner analyse a race on the phone minutes after the finish: the app reads the course printed on the map, lays the watch's track on it automatically and replays the race leg by leg.

The steps in the review notes show these features in about two minutes with the two attached sample files. We would be glad to provide anything else that helps.

Kind regards,
The Ozimut team
```

## 7. Privacy answers

What the app shows is Ozimut's own web service, so the answers cover what **the service** collects through the app, not only the
shell's code. The shells themselves collect nothing but the notification token. No data is used for tracking, advertising or
sold; nothing is shared with data brokers. Processors (not « sharing »): Cloudflare (hosting, storage, the anti-robot check),
Resend and Scaleway (e-mail), Google Firebase Cloud Messaging and Apple Push Notification service (notifications).

### 7.1 Apple — App Privacy

« Do you or your third-party partners use data for tracking purposes? » **No.** No data type is « Used to Track You ».

| Data type (Apple) | Collected? | Linked to the user? | Purposes | Note |
|---|---|---|---|---|
| Contact Info › Name | Yes | Yes | App Functionality | The account's name, shown in results, analyses and teams. Handled by the website the app shows. |
| Contact Info › Email Address | Yes | Yes | App Functionality | Sign-in, the e-mail alerts the user turns on. |
| Contact Info › Phone Number, Physical Address | No (**to confirm**) | – | – | Unless a race entry form asks for a phone number (an organiser's choice of fields): then Yes, linked, App Functionality. |
| Health & Fitness › Health | Yes, **only when the user saves** an analysis made from a Health workout (**to confirm** whether Apple counts the route as Health data once uploaded) | Yes | App Functionality | The route is read on the phone; saved (positions and times only) only on the user's action. Never used for advertising. |
| Health & Fitness › Fitness | Yes, optional | Yes | App Functionality | Heart rate, cadence, altitude of a run kept in « Mes cartes » only when the user ticks the box. |
| Location › Precise Location | Yes, **only as user content** (a GPS track the user saves or shares in an analysis or « Mes cartes », a track recorded in the map editor's field mode and saved with the map) | Yes | App Functionality | The device's live position is used on the device only and never stored by the app (**to confirm** that the map editor keeps its field-mode track only on the user's save). |
| Location › Coarse Location | No | – | – | |
| User Content › Photos or Videos | Yes | Yes | App Functionality | Map photos and scans, when the user saves an analysis, a map or shares a circuit. |
| User Content › Customer Support | Yes | Yes | App Functionality | Messages sent through « Nous écrire / Contact us ». |
| User Content › Gameplay Content | Yes | Yes | App Functionality | Games' scores (palmarès), Pixel's virtual runs. |
| User Content › Other User Content | Yes | Yes | App Functionality | Comments on analyses, maps drawn, course setting, race entries. |
| Identifiers › User ID | Yes | Yes | App Functionality | The account's number; a federation licence number when the user gives it. |
| Identifiers › Device ID | Yes (**to confirm**: Apple does not list push tokens as Device ID; declaring it is the cautious answer) | Yes | App Functionality | The APNs token, registered so that the account's notifications reach this device; deleted at sign-out. |
| Usage Data › Product Interaction | Yes | Yes | Analytics | Pages viewed per account and day (kept 13 months), first-party only. |
| Diagnostics › Performance Data | Yes | No | Analytics | Page load times by page and day, counted without the account. |
| Diagnostics › Crash Data | No | – | – | No crash reporting SDK. |
| Other Data Types | Yes (**to confirm**) | Yes | App Functionality | Year of birth, sex, club and timing-card number asked by race entries. |
| Financial Info, Contacts, Browsing History, Search History, Sensitive Info, Purchases, Audio, Emails or Text Messages, Advertising Data | No | – | – | Entry fees are paid outside Ozimut, between people and clubs. |

### 7.2 Google Play — Data safety

« Does your app collect or share any of the required user data types? » **Yes.** « Is all of the user data collected by your app
encrypted in transit? » **Yes** (HTTPS only). « Do you provide a way for users to request that their data is deleted? » **Yes** —
account deletion on the website, Réglages (**to confirm** the URL Google asks for: `https://ozimut.com/#/compte/confidentialite`,
whose section on rights explains it, or a page of its own). Account question: « users log in with an account created outside the
app » (no creation in the app). **Shared: No** for every type (processors and transfers the user asks for, such as a track shared
with an event's runners, are not « sharing » in Google's sense).

| Category › type (Google) | Collected | Required or optional | Processed ephemerally | Purposes |
|---|---|---|---|---|
| Personal info › Name | Yes | Optional (only with an account) | No | App functionality, Account management |
| Personal info › Email address | Yes | Optional (only with an account) | No | App functionality, Account management, Developer communications (the alerts the user turns on) |
| Personal info › User IDs | Yes | Optional | No | App functionality, Account management |
| Personal info › Phone number, Address | No (**to confirm**, see 7.1) | – | – | – |
| Personal info › Other info | Yes (**to confirm**) | Optional | No | App functionality (race entries: year of birth, sex, club, card number) |
| Location › Precise location | Yes, user content only (GPS tracks saved or shared) | Optional | No | App functionality |
| Location › Approximate location | No | – | – | – |
| Health and fitness › Fitness info | Yes | Optional | No | App functionality (a run's heart rate, cadence when the user keeps them) |
| Health and fitness › Health info | No | – | – | – |
| Photos and videos › Photos | Yes | Optional | No | App functionality (map photos and scans the user saves) |
| Files and docs | Yes | Optional | No | App functionality (GPX, FIT, map files the user saves) |
| Messages › Other in-app messages | Yes | Optional | No | App functionality, Developer communications (« Contact us ») |
| App activity › App interactions | Yes | Required for accounts (**to confirm**) | No | Analytics |
| App activity › Other user-generated content | Yes | Optional | No | App functionality (comments, maps, courses, entries) |
| App activity › In-app search history, Installed apps | No | – | – | – |
| App info and performance › Diagnostics | Yes | Required | No | Analytics (page load times, without the account) |
| App info and performance › Crash logs | No | – | – | – |
| Device or other IDs | Yes | Optional (only when notifications are on) | No | App functionality (the FCM token; Firebase Cloud Messaging's own disclosure lists it) |
| Financial info, Contacts, Calendar, Web browsing, Audio | No | – | – | – |

## 8. Age rating, category, addresses

- **Category.** Primary **Sports** (orienteering is a sport; competitions, results, rankings are the content). Secondary on the
  App Store: **Health & Fitness** rather than Navigation — the app trains and analyses (MAS tests, training games, workouts read from
  Health, sits naturally beside HealthKit), while Navigation promises guidance to a place, which the app does not give and which
  would sit badly with « it does not track you ». Google Play: **Sports** (one category); tags close to orienteering, sports,
  maps (**to confirm** in the Play Console's tag list).
- **Age rating.** Apple: **4+** — no violence, no mature content, no gambling, no advertising, no unrestricted web access (other
  sites open in Safari), no chat. **To confirm**: the questionnaire's « User-generated content »: runners can comment on an event's
  analysis, seen by that event's participants. Answering Yes makes guideline 1.2 apply (a way to report content and to block
  users), which the site does not offer today; decide before submitting. Santé's articles (nutrition) are read only by the accounts
  given the right: « Medical/Treatment Information » **None**, **to confirm**. Google Play (IARC questionnaire): expected **PEGI 3 /
  ESRB Everyone**, possibly with « Users Interact » for the comments. Target audience: **13 and over**, not designed for children
  (**to confirm**); « Contains ads »: **No**. Play Console › App content › « Health apps »: the app is not a health app; if asked,
  « Activity and fitness » only (**to confirm**).
- **Addresses.**
  - Support URL: `https://ozimut.com/#/compte/confidentialite` — the rules page, public, with `contact@ozimut.com` in its first
    paragraph (`#/contact` is not: its form is for accounts, and a signed-out visitor lands on the sign-in screen)
  - Privacy policy URL: `https://ozimut.com/#/compte/confidentialite`
  - Marketing URL: `https://ozimut.com/`
  - Google Play contact e-mail: `contact@ozimut.com`
  - Copyright (App Store): « 2026 Yann Le Helloco » (**to confirm** the holder's name as the owner wants it shown).

## 9. To confirm before submitting

1. The two review attachments (invented map PNG and GPX) made, and a scan of that PNG from a screen calibrated on a phone.
2. The English page labels quoted in the review notes, read on the device.
3. A regular test account for Apple (not a « demo » one: read-only), its e-mail and password entered in App Store Connect only.
4. App Privacy: push token as « Device ID »; GPS tracks as « Precise Location »; a Health route saved as « Health »; the entry
   forms' fields (phone number, other data); the map editor's field-mode track kept only on save.
5. Data safety: the deletion URL; whether app interactions count as « required ».
6. Age rating: user-generated content (comments) and guideline 1.2; Santé's articles; Google's target audience.
7. How the screenshots are captured (Debug build on the invented data, or headless pages plus a device for the scanner), and the
   copyright line.
8. The App Store's What's New: none for 1.0; the texts of section 2 are for the first update.
9. Both privacy and contact pages render for a visitor arriving from a store link without the guest pass (they are public pages,
   but are drawn by the site's script).
