"""Cartographier's catalogue (site/assets/js/i18n/mapper.<lang>.js), French the reference, English, German and Spanish beside it.
Run: python tools/mapper/catalogue.py — writes the four files. Each entry: key: (fr, en, de, es). Plural keys end in .one/.other."""
import json, re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
NB = " "

E = {}
def k(key, fr, en, de, es): E[key] = (fr, en, de, es)

# ---- page and start ------------------------------------------------------------------------------------------------------
k("map.page.title", "Cartographier", "Mapping", "Kartieren", "Cartografiar")
k("map.page.lede", "Dessiner et mettre à jour des cartes de course d'orientation dans le navigateur, seul ou en équipe : à partir de vos fichiers OCAD ou OpenOrienteering Mapper, ou d'une nouvelle carte préparée avec le LiDAR, les courbes de niveau et OpenStreetMap.",
  "Draw and update orienteering maps in your browser, alone or as a team: from your OCAD or OpenOrienteering Mapper files, or from a new map prepared with LiDAR, contours and OpenStreetMap.",
  "Orientierungslaufkarten im Browser zeichnen und aktualisieren, allein oder im Team: aus deinen OCAD- oder OpenOrienteering-Mapper-Dateien oder aus einer neuen Karte, vorbereitet mit LiDAR, Höhenlinien und OpenStreetMap.",
  "Dibuja y actualiza mapas de orientación en el navegador, solo o en equipo: a partir de tus archivos de OCAD u OpenOrienteering Mapper, o de un mapa nuevo preparado con LiDAR, curvas de nivel y OpenStreetMap.")
k("map.page.empty", "Cette carte est vide sur le serveur.", "This map is empty on the server.", "Diese Karte ist auf dem Server leer.", "Este mapa está vacío en el servidor.")
k("map.start.new", "Nouvelle carte", "New map", "Neue Karte", "Mapa nuevo")
k("map.start.newDesc", "Une carte sprint ou forêt, au bon jeu de symboles de l'IOF, géoréférencée à l'endroit choisi ; les courbes, les routes et les bâtiments d'OpenStreetMap et le LiDAR peuvent y être ajoutés en brouillon.",
  "A sprint or forest map with the right IOF symbol set, georeferenced where you choose; contours, OpenStreetMap's roads and buildings and the LiDAR can be added as drafts.",
  "Eine Sprint- oder Waldkarte mit dem passenden IOF-Signaturensatz, am gewählten Ort georeferenziert; Höhenlinien, Straßen und Gebäude aus OpenStreetMap und das LiDAR können als Entwurf hinzugefügt werden.",
  "Un mapa de sprint o de bosque con el juego de símbolos de la IOF adecuado, georreferenciado en el lugar elegido; las curvas, las calles y edificios de OpenStreetMap y el LiDAR se pueden añadir como borrador.")
k("map.start.newBtn", "Créer une carte", "Create a map", "Karte anlegen", "Crear un mapa")
k("map.start.import", "Importer une carte", "Import a map", "Karte importieren", "Importar un mapa")
k("map.start.importDesc", "Un fichier OCAD (versions 6 à 2018), OpenOrienteering Mapper (.omap, .xmap) ou Ozimut (.ozmap). Un fichier OCAD réenregistré en OCAD garde à l'identique tout ce que vous n'avez pas modifié.",
  "An OCAD file (versions 6 to 2018), an OpenOrienteering Mapper file (.omap, .xmap) or an Ozimut file (.ozmap). An OCAD file saved back as OCAD keeps everything you did not change exactly as it was.",
  "Eine OCAD-Datei (Versionen 6 bis 2018), eine OpenOrienteering-Mapper-Datei (.omap, .xmap) oder eine Ozimut-Datei (.ozmap). Eine OCAD-Datei, die wieder als OCAD gespeichert wird, behält alles Unveränderte genau so, wie es war.",
  "Un archivo de OCAD (versiones 6 a 2018), de OpenOrienteering Mapper (.omap, .xmap) u Ozimut (.ozmap). Un archivo de OCAD guardado de nuevo como OCAD conserva idéntico todo lo que no hayas modificado.")
k("map.start.drop", "Déposez le fichier ici, ou cliquez pour le choisir", "Drop the file here, or click to choose it", "Datei hier ablegen oder klicken, um sie auszuwählen", "Suelta el archivo aquí o haz clic para elegirlo")
k("map.start.mine", "Mes cartes à éditer", "My maps to edit", "Meine Karten zum Bearbeiten", "Mis mapas para editar")
k("map.start.loading", "Chargement…", "Loading…", "Wird geladen…", "Cargando…")
k("map.start.none", "Aucune carte pour l'instant.", "No maps yet.", "Noch keine Karten.", "Todavía no hay mapas.")
k("map.start.objects.one", "{n} objet", "{n} object", "{n} Objekt", "{n} objeto")
k("map.start.objects.other", "{n} objets", "{n} objects", "{n} Objekte", "{n} objetos")
k("map.start.shared", "partagée par {name}", "shared by {name}", "geteilt von {name}", "compartido por {name}")
k("map.start.offline", "hors ligne", "offline", "offline", "sin conexión")
k("map.start.delete", "Supprimer la carte", "Delete the map", "Karte löschen", "Eliminar el mapa")
k("map.start.deleteQ", "Supprimer cette carte, ses versions et ses fonds pour toute l'équipe ? Cette action est définitive.", "Delete this map, its versions and its backgrounds for the whole team? This cannot be undone.", "Diese Karte mit ihren Versionen und Hintergründen für das ganze Team löschen? Das kann nicht rückgängig gemacht werden.", "¿Eliminar este mapa, sus versiones y sus fondos para todo el equipo? No se puede deshacer.")
k("map.start.q", "Que voulez-vous faire ?", "What would you like to do?", "Was möchtest du tun?", "¿Qué quieres hacer?")
k("map.start.close", "Fermer", "Close", "Schließen", "Cerrar")
k("map.start.closeEsc", "Fermer (Échap)", "Close (Esc)", "Schließen (Esc)", "Cerrar (Esc)")
k("map.start.newNeed", "<b>Il vous faut</b> seulement l'endroit de la carte (des coordonnées ou votre position) ; le reste est facultatif.",
  "<b>You need</b> only the map's place (coordinates or your position); the rest is optional.",
  "<b>Du brauchst</b> nur den Ort der Karte (Koordinaten oder deinen Standort); der Rest ist freiwillig.",
  "<b>Solo necesitas</b> el lugar del mapa (coordenadas o tu posición); lo demás es opcional.")
k("map.start.importNeed", "<b>Il vous faut</b> le fichier de la carte : OCAD (.ocd), OpenOrienteering Mapper (.omap, .xmap) ou Ozimut (.ozmap).",
  "<b>You need</b> the map's file: OCAD (.ocd), OpenOrienteering Mapper (.omap, .xmap) or Ozimut (.ozmap).",
  "<b>Du brauchst</b> die Datei der Karte: OCAD (.ocd), OpenOrienteering Mapper (.omap, .xmap) oder Ozimut (.ozmap).",
  "<b>Necesitas</b> el archivo del mapa: OCAD (.ocd), OpenOrienteering Mapper (.omap, .xmap) u Ozimut (.ozmap).")
k("map.start.importBtn", "Importer…", "Import…", "Importieren…", "Importar…")
k("map.start.open", "Ouvrir une carte", "Open a map", "Karte öffnen", "Abrir un mapa")
k("map.start.err.tooMany", "Trop de cartes créées aujourd'hui (30 par jour au plus) : réessayez demain.", "Too many maps created today (30 a day at most): try again tomorrow.", "Heute wurden zu viele Karten angelegt (höchstens 30 pro Tag): Versuche es morgen wieder.", "Hoy se han creado demasiados mapas (30 al día como máximo): inténtalo mañana.")
k("map.start.err.quota", "Vous avez déjà {max} cartes, le maximum : supprimez-en une (« Ouvrir une carte ») avant d'en créer une autre.", "You already have {max} maps, the maximum: delete one (“Open a map”) before creating another.", "Du hast schon {max} Karten, das Maximum: Lösche eine („Karte öffnen“), bevor du eine neue anlegst.", "Ya tienes {max} mapas, el máximo: elimina uno («Abrir un mapa») antes de crear otro.")
k("map.start.err.other", "La carte n'a pas pu être créée : {error}.", "The map could not be created: {error}.", "Die Karte konnte nicht angelegt werden: {error}.", "No se ha podido crear el mapa: {error}.")
k("map.start.openDesc", "Reprendre une de vos cartes : celles que vous avez créées ou importées et celles dont l'équipe vous compte.",
  "Pick up one of your maps: those you created or imported and those whose team you are on.",
  "Eine deiner Karten wieder aufnehmen: die, die du angelegt oder importiert hast, und die, in deren Team du bist.",
  "Retomar uno de tus mapas: los que creaste o importaste y aquellos de cuyo equipo formas parte.")
k("map.start.foot", "Vous pouvez aussi déposer le fichier d'une carte sur cette fenêtre pour l'importer. Une carte n'est ouverte que par son équipe : celui qui l'a créée et les personnes qui la rejoignent par un lien d'invitation.",
  "You can also drop a map's file on this window to import it. A map is opened only by its team: whoever created it and the people who join it by an invitation link.",
  "Du kannst die Datei einer Karte auch auf dieses Fenster ziehen, um sie zu importieren. Eine Karte öffnet nur ihr Team: wer sie angelegt hat und wer ihm über einen Einladungslink beitritt.",
  "También puedes soltar el archivo de un mapa en esta ventana para importarlo. Un mapa solo lo abre su equipo: quien lo creó y las personas que se unen con un enlace de invitación.")
k("map.start.tagOpen", "ouverte", "open", "geöffnet", "abierto")
k("map.ed.noMap", "Aucune carte ouverte", "No map open", "Keine Karte geöffnet", "Ningún mapa abierto")
k("map.ed.needMap", "Ouvrez, créez ou importez d'abord une carte.", "Open, create or import a map first.", "Öffne, erstelle oder importiere zuerst eine Karte.", "Primero abre, crea o importa un mapa.")
k("map.untitled", "Carte sans titre", "Untitled map", "Unbenannte Karte", "Mapa sin título")

# ---- new map ---------------------------------------------------------------------------------------------------------------
k("map.new.title", "Nouvelle carte", "New map", "Neue Karte", "Mapa nuevo")
k("map.new.name", "Nom de la carte", "Map name", "Name der Karte", "Nombre del mapa")
k("map.new.kind", "Type de carte", "Kind of map", "Kartentyp", "Tipo de mapa")
k("map.new.sprint", "Sprint — ISSprOM 2019-2, 1:4 000", "Sprint — ISSprOM 2019-2, 1:4,000", "Sprint — ISSprOM 2019-2, 1:4.000", "Sprint — ISSprOM 2019-2, 1:4.000")
k("map.new.forest", "Forêt — ISOM 2017-2", "Forest — ISOM 2017-2", "Wald — ISOM 2017-2", "Bosque — ISOM 2017-2")
k("map.new.scale", "Échelle de la carte forêt", "Scale of the forest map", "Maßstab der Waldkarte", "Escala del mapa de bosque")
k("map.new.scale15", "1:15 000 — l'échelle de l'ISOM, ses symboles à leur taille", "1:15,000 — ISOM's scale, its symbols at their size", "1:15.000 — der Maßstab der ISOM, ihre Symbole in ihrer Größe", "1:15.000 — la escala de la ISOM, sus símbolos a su tamaño")
k("map.new.scale10", "1:10 000 — les symboles agrandis de 150 %", "1:10,000 — the symbols enlarged 150%", "1:10.000 — die Symbole um 150 % vergrößert", "1:10.000 — los símbolos ampliados al 150 %")
k("map.new.needKind", "Choisissez sprint ou forêt.", "Choose sprint or forest.", "Wähle Sprint oder Wald.", "Elige sprint o bosque.")
k("map.new.place", "Lieu (latitude, longitude)", "Place (latitude, longitude)", "Ort (Breite, Länge)", "Lugar (latitud, longitud)")
k("map.new.placeHint", "Le milieu de la carte. Laissé vide, la carte n'est pas géoréférencée et les données ouvertes ne peuvent pas être ajoutées.", "The middle of the map. Left empty, the map is not georeferenced and open data cannot be added.", "Die Mitte der Karte. Leer gelassen, ist die Karte nicht georeferenziert und offene Daten können nicht hinzugefügt werden.", "El centro del mapa. Si se deja vacío, el mapa no queda georreferenciado y no se pueden añadir datos abiertos.")
k("map.new.badPlace", "Écrivez le lieu ainsi : 48.3512, -1.2038", "Write the place like this: 48.3512, -1.2038", "Schreibe den Ort so: 48.3512, -1.2038", "Escribe el lugar así: 48.3512, -1.2038")
k("map.new.here", "Ma position", "My position", "Meine Position", "Mi posición")
k("map.new.size", "Zone cartographiée : un carré centré sur le lieu", "Area mapped: a square centred on the place", "Kartiertes Gebiet: ein Quadrat um den Ort", "Zona cartografiada: un cuadrado centrado en el lugar")
k("map.new.sizeOpt", "{a} × {a} km", "{a} × {a} km", "{a} × {a} km", "{a} × {a} km")
k("map.new.data", "Commencer avec, en brouillon", "Start with, as drafts", "Beginnen mit, als Entwurf", "Empezar con, como borrador")
k("map.new.osm", "Données OpenStreetMap", "OpenStreetMap data", "OpenStreetMap-Daten", "Datos de OpenStreetMap")
k("map.new.osmTip", "Ce qu'OpenStreetMap décrit et qu'une carte de CO dessine : routes et chemins, bâtiments, eau, végétation et occupation du sol, murs et clôtures, voies ferrées, lignes électriques…", "What OpenStreetMap describes that an orienteering map draws: roads and paths, buildings, water, vegetation and land use, walls and fences, railways, power lines…", "Was OpenStreetMap beschreibt und eine OL-Karte zeichnet: Straßen und Wege, Gebäude, Gewässer, Vegetation und Landnutzung, Mauern und Zäune, Bahnlinien, Stromleitungen…", "Lo que OpenStreetMap describe y un mapa de orientación dibuja: carreteras y caminos, edificios, agua, vegetación y usos del suelo, muros y vallas, vías férreas, líneas eléctricas…")
k("map.new.national", "Données des agences nationales", "National agencies' data", "Daten der nationalen Behörden", "Datos de las agencias nacionales")
k("map.new.nationalTip", "France : IGN (BD TOPO) · Suisse : swisstopo (swissTLM3D) · États-Unis : USGS (The National Map) · ailleurs : OpenStreetMap. Bâtiments, routes, chemins, eau, murs, talus, haies, parkings.", "France: IGN (BD TOPO) · Switzerland: swisstopo (swissTLM3D) · USA: USGS (The National Map) · elsewhere: OpenStreetMap. Buildings, roads, paths, water, walls, banks, hedges, car parks.", "Frankreich: IGN (BD TOPO) · Schweiz: swisstopo (swissTLM3D) · USA: USGS (The National Map) · sonst: OpenStreetMap. Gebäude, Straßen, Wege, Gewässer, Mauern, Böschungen, Hecken, Parkplätze.", "Francia: IGN (BD TOPO) · Suiza: swisstopo (swissTLM3D) · EE. UU.: USGS (The National Map) · en otros lugares: OpenStreetMap. Edificios, carreteras, caminos, agua, muros, taludes, setos, aparcamientos.")
k("map.new.bdtopo", "Bâtiments, routes, chemins et eau des données nationales (IGN en France, swisstopo en Suisse, USGS aux États-Unis ; ailleurs OpenStreetMap)", "Buildings, roads, paths and water from national data (IGN in France, swisstopo in Switzerland, USGS in the USA; elsewhere OpenStreetMap)", "Gebäude, Straßen, Wege und Gewässer aus nationalen Daten (IGN in Frankreich, swisstopo in der Schweiz, USGS in den USA; sonst OpenStreetMap)", "Edificios, carreteras, caminos y agua de los datos nacionales (IGN en Francia, swisstopo en Suiza, USGS en EE. UU.; en otros lugares OpenStreetMap)")
k("map.data.bdtopo.reading", "Lecture de la BD TOPO de l'IGN…", "Reading IGN's BD TOPO…", "BD TOPO des IGN wird gelesen…", "Leyendo la BD TOPO del IGN…")
k("map.data.bdtopo.none", "La BD TOPO n'a rien dans cette zone (elle couvre la France).", "BD TOPO has nothing in this area (it covers France).", "Die BD TOPO hat in diesem Gebiet nichts (sie deckt Frankreich ab).", "La BD TOPO no tiene nada en esta zona (cubre Francia).")
k("map.new.dem", "Courbes de niveau d'après l'altitude du terrain", "Contours from the ground's elevation", "Höhenlinien aus der Geländehöhe", "Curvas de nivel según la altitud del terreno")
k("map.new.demTip", "Calculées d'après l'altitude du sol publiée par chaque pays (le « modèle numérique de terrain ») : RGE ALTI de l'IGN en France (1 m), swissALTI3D en Suisse, 3DEP aux États-Unis, ailleurs un relief mondial d'environ 30 m. Rapides, mais moins fines que celles du LiDAR.", "Computed from the ground elevation each country publishes (the \"digital terrain model\"): IGN's RGE ALTI in France (1 m), swissALTI3D in Switzerland, 3DEP in the USA, elsewhere a worldwide relief of about 30 m. Quick, but coarser than the LiDAR's.", "Berechnet aus der Bodenhöhe, die jedes Land veröffentlicht (dem „digitalen Geländemodell“): RGE ALTI des IGN in Frankreich (1 m), swissALTI3D in der Schweiz, 3DEP in den USA, sonst ein weltweites Relief von etwa 30 m. Schnell, aber gröber als die aus dem LiDAR.", "Calculadas a partir de la altitud del suelo que publica cada país (el «modelo digital del terreno»): RGE ALTI del IGN en Francia (1 m), swissALTI3D en Suiza, 3DEP en EE. UU., en otros lugares un relieve mundial de unos 30 m. Rápidas, pero menos finas que las del LiDAR.")
k("map.new.lidar", "Courbes, falaises et végétation du LiDAR, par karttapullautin (quelques minutes)", "LiDAR contours, cliffs and vegetation, by karttapullautin (a few minutes)", "Höhenlinien, Felsen und Vegetation aus dem LiDAR, mit karttapullautin (einige Minuten)", "Curvas, cortados y vegetación del LiDAR, con karttapullautin (unos minutos)")
k("map.new.lidarTip", "Les nuages de points LiDAR ouverts (IGN LiDAR HD en France, swisstopo, USGS 3DEP, NRCan, LINZ) passés par karttapullautin, le logiciel libre de Jarkko Ryyppö (celui de MapAnt), sur les serveurs d'Ozimut. Il donne des courbes, des falaises, des cuvettes et une végétation à reprendre sur le terrain. France, Suisse, États-Unis, Canada, Nouvelle-Zélande.", "Open LiDAR point clouds (IGN LiDAR HD in France, swisstopo, USGS 3DEP, NRCan, LINZ) run through karttapullautin, Jarkko Ryyppö's free software (MapAnt's), on Ozimut's servers. It gives contours, cliffs, depressions and vegetation to be checked in the field. France, Switzerland, USA, Canada, New Zealand.", "Offene LiDAR-Punktwolken (IGN LiDAR HD in Frankreich, swisstopo, USGS 3DEP, NRCan, LINZ), auf Ozimuts Servern mit karttapullautin verarbeitet, der freien Software von Jarkko Ryyppö (der von MapAnt). Sie liefert Höhenlinien, Felsen, Senken und Vegetation, die im Gelände zu prüfen sind. Frankreich, Schweiz, USA, Kanada, Neuseeland.", "Nubes de puntos LiDAR abiertas (IGN LiDAR HD en Francia, swisstopo, USGS 3DEP, NRCan, LINZ) procesadas con karttapullautin, el software libre de Jarkko Ryyppö (el de MapAnt), en los servidores de Ozimut. Da curvas, cortados, depresiones y vegetación que hay que revisar en el terreno. Francia, Suiza, EE. UU., Canadá, Nueva Zelanda.")
k("map.new.demByLidar", "Le LiDAR apporte ses propres courbes, plus précises : un seul jeu de courbes.", "The LiDAR brings its own, more precise contours: one set of contours only.", "Das LiDAR bringt eigene, genauere Höhenlinien mit: nur ein Satz Höhenlinien.", "El LiDAR trae sus propias curvas, más precisas: un solo juego de curvas.")

# ---- top bar, view, status -------------------------------------------------------------------------------------------------
k("map.top.maps", "Mes cartes à éditer", "My maps to edit", "Meine Karten zum Bearbeiten", "Mis mapas para editar")
k("map.top.search", "Rechercher une commande ou un symbole (Alt+Q)", "Search a command or a symbol (Alt+Q)", "Befehl oder Signatur suchen (Alt+Q)", "Buscar un comando o un símbolo (Alt+Q)")
k("map.view.label", "La carte", "The map", "Die Karte", "El mapa")
k("map.view.zoomIn", "Zoom avant", "Zoom in", "Vergrößern", "Acercar")
k("map.view.zoomOut", "Zoom arrière", "Zoom out", "Verkleinern", "Alejar")
k("map.view.fit", "Toute la carte", "Whole map", "Ganze Karte", "Todo el mapa")
k("map.status.scale", "1:{scale} · écran {view} %", "1:{scale} · screen {view}%", "1:{scale} · Bildschirm {view} %", "1:{scale} · pantalla {view} %")
k("map.status.sel.one", "{n} objet choisi", "{n} object selected", "{n} Objekt ausgewählt", "{n} objeto seleccionado")
k("map.status.sel.other", "{n} objets choisis", "{n} objects selected", "{n} Objekte ausgewählt", "{n} objetos seleccionados")
k("map.status.measure", "{mm} mm sur la carte · {m} m sur le terrain · surface {area} m²", "{mm} mm on the map · {m} m on the ground · area {area} m²", "{mm} mm auf der Karte · {m} m im Gelände · Fläche {area} m²", "{mm} mm en el mapa · {m} m en el terreno · superficie {area} m²")
k("map.save.dirty", "Modifications non enregistrées", "Unsaved changes", "Ungespeicherte Änderungen", "Cambios sin guardar")
k("map.save.saving", "Enregistrement…", "Saving…", "Wird gespeichert…", "Guardando…")
k("map.save.saved", "Enregistré", "Saved", "Gespeichert", "Guardado")
k("map.save.local", "Gardé sur cet appareil", "Kept on this device", "Auf diesem Gerät behalten", "Guardado en este dispositivo")
k("map.save.error", "Enregistrement impossible, nouvel essai bientôt", "Could not save, trying again soon", "Speichern nicht möglich, neuer Versuch gleich", "No se pudo guardar, se reintentará pronto")
k("map.save.conflict", "Conflit avec une autre version", "Conflict with another version", "Konflikt mit einer anderen Version", "Conflicto con otra versión")
k("map.save.failed", "La carte n'a pas pu être enregistrée ({error}) : nouvel essai dans 15 s. Ne fermez pas la page avant « Enregistré ».", "The map could not be saved ({error}): trying again in 15 s. Do not close the page before “Saved”.", "Die Karte konnte nicht gespeichert werden ({error}): neuer Versuch in 15 s. Schließe die Seite nicht vor „Gespeichert“.", "No se pudo guardar el mapa ({error}): nuevo intento en 15 s. No cierres la página antes de «Guardado».")
k("map.save.auto", "Enregistrement automatique", "Automatic save", "Automatische Speicherung", "Guardado automático")
k("map.conflict.title", "Une autre version a été enregistrée", "Another version was saved", "Eine andere Version wurde gespeichert", "Se guardó otra versión")
k("map.conflict.text", "{by} a enregistré la carte ({at}) pendant que vous la modifiiez. Garder votre version remplace la sienne ; reprendre la sienne abandonne vos modifications non enregistrées.", "{by} saved the map ({at}) while you were editing it. Keeping your version replaces theirs; taking theirs drops your unsaved changes.", "{by} hat die Karte gespeichert ({at}), während du sie bearbeitet hast. Deine Version behalten ersetzt die andere; die andere übernehmen verwirft deine ungespeicherten Änderungen.", "{by} guardó el mapa ({at}) mientras lo editabas. Conservar tu versión sustituye la suya; tomar la suya descarta tus cambios sin guardar.")
k("map.conflict.mine", "Garder ma version", "Keep my version", "Meine Version behalten", "Conservar mi versión")
k("map.conflict.theirs", "Reprendre la sienne", "Take theirs", "Die andere übernehmen", "Tomar la suya")

# ---- ribbon tabs, groups, contexts -----------------------------------------------------------------------------------------
for key, v in {
  "file": ("Fichier", "File", "Datei", "Archivo"), "draw": ("Dessiner", "Draw", "Zeichnen", "Dibujar"), "edit": ("Modifier", "Edit", "Bearbeiten", "Editar"),
  "backgrounds": ("Fonds", "Backgrounds", "Hintergründe", "Fondos"), "data": ("Données", "Data", "Daten", "Datos"), "field": ("Terrain", "Field", "Gelände", "Terreno"),
  "check": ("Vérifier", "Check", "Prüfen", "Comprobar"), "layout": ("Mise en page", "Layout", "Layout", "Maquetación"), "print": ("Imprimer", "Print", "Drucken", "Imprimir"),
  "team": ("Équipe", "Team", "Team", "Equipo")}.items(): k(f"map.tab.{key}", *v)
for key, v in {
  "tools": ("Outils", "Tools", "Werkzeuge", "Herramientas"), "draw": ("Dessin", "Drawing", "Zeichnen", "Dibujo"), "snap": ("Aides", "Helpers", "Hilfen", "Ayudas"),
  "history": ("Historique", "History", "Verlauf", "Historial"), "pick": ("Choisir", "Select", "Auswählen", "Seleccionar"), "cut": ("Couper et joindre", "Cut and join", "Schneiden und verbinden", "Cortar y unir"),
  "combine": ("Combiner", "Combine", "Kombinieren", "Combinar"), "shape": ("Forme", "Shape", "Form", "Forma"), "symbol": ("Symbole", "Symbol", "Signatur", "Símbolo"),
  "order": ("Ordre", "Order", "Reihenfolge", "Orden"), "bgAdd": ("Ajouter", "Add", "Hinzufügen", "Añadir"), "bgPlace": ("Placer", "Place", "Platzieren", "Colocar"),
  "bgView": ("Affichage", "Display", "Anzeige", "Visualización"), "area": ("Zone", "Area", "Gebiet", "Zona"), "sources": ("Sources", "Sources", "Quellen", "Fuentes"),
  "draft": ("Brouillon", "Draft", "Entwurf", "Borrador"), "gps": ("GPS", "GPS", "GPS", "GPS"), "notes": ("Notes", "Notes", "Notizen", "Notas"),
  "offline": ("Hors ligne", "Offline", "Offline", "Sin conexión"), "checks": ("Contrôles", "Checks", "Prüfungen", "Controles"), "stats": ("Chiffres", "Figures", "Zahlen", "Cifras"),
  "frame": ("Cadre", "Frame", "Rahmen", "Marco"), "furniture": ("Éléments", "Elements", "Elemente", "Elementos"), "symbols": ("Symboles", "Symbols", "Signaturen", "Símbolos"),
  "pdf": ("Imprimer", "Print", "Drucken", "Imprimir"), "files": ("Fichiers", "Files", "Dateien", "Archivos"), "send": ("Envoyer", "Send", "Senden", "Enviar"),
  "share": ("Partager", "Share", "Teilen", "Compartir"), "history2": ("Versions", "Versions", "Versionen", "Versiones"), "comments": ("Commentaires", "Comments", "Kommentare", "Comentarios"),
  "ctxShape": ("Forme", "Shape", "Form", "Forma"), "ctxSymbol": ("Symbole", "Symbol", "Signatur", "Símbolo"), "ctxText": ("Texte", "Text", "Text", "Texto"), "ctxDraft": ("Brouillon", "Draft", "Entwurf", "Borrador"),
  }.items(): k(f"map.grp.{key}", *v)
for key, v in {
  "relief": ("Relief (1xx)", "Landforms (1xx)", "Geländeformen (1xx)", "Relieve (1xx)"), "rock": ("Rochers et pierres (2xx)", "Rock and boulders (2xx)", "Felsen und Steine (2xx)", "Rocas y piedras (2xx)"),
  "water": ("Eau et marais (3xx)", "Water and marsh (3xx)", "Gewässer und Sumpf (3xx)", "Agua y pantanos (3xx)"), "vegetation": ("Végétation (4xx)", "Vegetation (4xx)", "Vegetation (4xx)", "Vegetación (4xx)"),
  "manmade": ("Aménagements (5xx)", "Man-made features (5xx)", "Künstliche Objekte (5xx)", "Elementos artificiales (5xx)"), "technical": ("Symboles techniques (6xx)", "Technical symbols (6xx)", "Technische Signaturen (6xx)", "Símbolos técnicos (6xx)"),
  "course": ("Surimpression du parcours (7xx)", "Course overprint (7xx)", "Bahneindruck (7xx)", "Sobreimpresión del recorrido (7xx)"), "other": ("Autres", "Others", "Andere", "Otros"),
  }.items(): k(f"map.grp.sym.{key}", *v)
for key, v in {"line": ("Ligne", "Line", "Linie", "Línea"), "area": ("Surface", "Area", "Fläche", "Superficie"), "point": ("Point", "Point", "Punkt", "Punto"),
  "text": ("Texte", "Text", "Text", "Texto"), "draft": ("Brouillon", "Draft", "Entwurf", "Borrador"), "tab": ("Sélection", "Selection", "Auswahl", "Selección")}.items(): k(f"map.ctx.{key}", *v)

# ---- ribbon commands -----------------------------------------------------------------------------------------------------------
RIB = {
  "tool_select": ("Sélection", "Select", "Auswählen", "Seleccionar"), "tool_pan": ("Déplacer la vue", "Pan", "Ansicht verschieben", "Desplazar la vista"), "tool_vertex": ("Sommets", "Points", "Stützpunkte", "Vértices"),
  "tool_draw": ("Dessiner", "Draw", "Zeichnen", "Dibujar"), "tool_fill": ("Remplir", "Fill", "Füllen", "Rellenar"), "tool_cut": ("Couper", "Cut", "Schneiden", "Cortar"),
  "tool_hole": ("Trouer", "Cut hole", "Loch ausschneiden", "Agujerear"), "tool_measure": ("Mesurer", "Measure", "Messen", "Medir"),
  "mode_straight": ("Droit", "Straight", "Gerade", "Recto"), "mode_curve": ("Courbe", "Curve", "Kurve", "Curva"), "mode_free": ("Main levée", "Freehand", "Freihand", "A mano alzada"),
  "mode_rect": ("Angles droits", "Right angles", "Rechte Winkel", "Ángulos rectos"), "mode_circle": ("Cercle", "Circle", "Kreis", "Círculo"),
  "snap": ("Accrochage", "Snapping", "Fangen", "Ajuste"), "pipette": ("Pipette", "Pick symbol", "Pipette", "Cuentagotas"), "undo": ("Annuler", "Undo", "Rückgängig", "Deshacer"), "redo": ("Rétablir", "Redo", "Wiederholen", "Rehacer"),
  "join": ("Joindre", "Join", "Verbinden", "Unir"), "reverse": ("Inverser", "Reverse", "Umkehren", "Invertir"), "union": ("Unir", "Union", "Vereinigen", "Unión"),
  "difference": ("Soustraire", "Difference", "Abziehen", "Diferencia"), "intersection": ("Intersection", "Intersection", "Schnittmenge", "Intersección"),
  "smooth": ("Lisser", "Smooth", "Glätten", "Suavizar"), "simplify": ("Simplifier", "Simplify", "Vereinfachen", "Simplificar"), "toggleCurves": ("Courbes ↔ segments", "Curves ↔ segments", "Kurven ↔ Strecken", "Curvas ↔ segmentos"),
  "changeSymbol": ("Changer de symbole", "Change symbol", "Signatur ändern", "Cambiar símbolo"), "rotate": ("Pivoter", "Rotate", "Drehen", "Girar"), "duplicate": ("Dupliquer", "Duplicate", "Duplizieren", "Duplicar"),
  "delete": ("Supprimer", "Delete", "Löschen", "Eliminar"), "toFront": ("Au premier plan", "Bring to front", "Nach vorne", "Al frente"), "toBack": ("À l'arrière-plan", "Send to back", "Nach hinten", "Al fondo"),
  "toPart": ("Changer de partie", "Move to part", "In Teil verschieben", "Mover a parte"), "rotatePattern": ("Pivoter le motif", "Rotate pattern", "Muster drehen", "Girar el patrón"), "editText": ("Modifier le texte", "Edit text", "Text bearbeiten", "Editar el texto"),
  "bg-add": ("Fichier de fond", "Background file", "Hintergrunddatei", "Archivo de fondo"), "bg-online": ("Fond en ligne", "Online background", "Online-Hintergrund", "Fondo en línea"),
  "bg-calage": ("Caler", "Adjust", "Einpassen", "Ajustar"), "bg-georef": ("Géoréférencer", "Georeference", "Georeferenzieren", "Georreferenciar"),
  "bg-toggle": ("Afficher les fonds", "Show backgrounds", "Hintergründe zeigen", "Mostrar fondos"), "map-fade": ("Estomper la carte", "Fade the map", "Karte abblenden", "Atenuar el mapa"),
  "data-area": ("Zone des données", "Data area", "Datengebiet", "Zona de datos"), "data-lidar": ("LiDAR", "LiDAR", "LiDAR", "LiDAR"), "data-contours": ("Courbes de niveau", "Contours", "Höhenlinien", "Curvas de nivel"),
  "data-osm": ("OpenStreetMap", "OpenStreetMap", "OpenStreetMap", "OpenStreetMap"), "data-bdtopo": ("BD TOPO (France)", "BD TOPO (France)", "BD TOPO (Frankreich)", "BD TOPO (Francia)"), "data-town": ("Plan de ville (sprint)", "Town plan (sprint)", "Stadtplan (Sprint)", "Plano urbano"), "draft-accept": ("Accepter", "Accept", "Übernehmen", "Aceptar"),
  "draft-acceptKind": ("Accepter ce symbole partout", "Accept this symbol everywhere", "Diese Signatur überall übernehmen", "Aceptar este símbolo en todo"), "draft-reject": ("Rejeter", "Reject", "Verwerfen", "Rechazar"),
  "gps": ("Ma position", "My position", "Meine Position", "Mi posición"), "gps-follow": ("Suivre", "Follow", "Folgen", "Seguir"), "gps-track": ("Enregistrer la trace", "Record track", "Spur aufzeichnen", "Grabar el track"),
  "gps-north": ("Boussole", "Compass", "Kompass", "Brújula"), "photo": ("Photo", "Photo", "Foto", "Foto"), "comment": ("Note sur la carte", "Note on the map", "Notiz auf der Karte", "Nota en el mapa"),
  "offline": ("Garder hors ligne", "Keep offline", "Offline behalten", "Guardar sin conexión"), "check-run": ("Vérifier la carte", "Check the map", "Karte prüfen", "Comprobar el mapa"),
  "check-next": ("Problème suivant", "Next problem", "Nächstes Problem", "Siguiente problema"), "check-legibility": ("Lisibilité", "Legibility", "Lesbarkeit", "Legibilidad"), "stats": ("Statistiques", "Statistics", "Statistik", "Estadísticas"),
  "print-area": ("Zone d'impression", "Print area", "Druckbereich", "Zona de impresión"), "north-lines": ("Lignes du nord", "North lines", "Nordlinien", "Líneas de norte"),
  "scale-bar": ("Échelle graphique", "Scale bar", "Maßstabsleiste", "Escala gráfica"), "legend": ("Légende", "Legend", "Legende", "Leyenda"), "logo": ("Logo", "Logo", "Logo", "Logotipo"),
  "credits": ("Sources", "Credits", "Quellen", "Créditos"), "qr": ("Code QR", "QR code", "QR-Code", "Código QR"), "symbol-set": ("Jeu de symboles", "Symbol set", "Signaturensatz", "Juego de símbolos"),
  "colors": ("Couleurs", "Colours", "Farben", "Colores"), "export-pdf": ("PDF", "PDF", "PDF", "PDF"), "export-png": ("Image", "Image", "Bild", "Imagen"),
  "export-ocd": ("OCAD", "OCAD", "OCAD", "OCAD"), "export-omap": ("OpenOrienteering Mapper", "OpenOrienteering Mapper", "OpenOrienteering Mapper", "OpenOrienteering Mapper"),
  "export-ozmap": ("Fichier Ozimut", "Ozimut file", "Ozimut-Datei", "Archivo Ozimut"), "export-kmz": ("KMZ", "KMZ", "KMZ", "KMZ"), "export-geotiff": ("Image géoréférencée", "Georeferenced image", "Georeferenziertes Bild", "Imagen georreferenciada"),
  "to-tracer": ("Vers le tracé", "To course setting", "Zur Bahnlegung", "Al trazado"), "to-mymaps": ("Vers Mes cartes", "To My maps", "Zu Meine Karten", "A Mis mapas"),
  "invite": ("Inviter", "Invite", "Einladen", "Invitar"), "members": ("Membres", "Members", "Mitglieder", "Miembros"), "version-save": ("Enregistrer une version", "Save a version", "Version speichern", "Guardar una versión"),
  "versions": ("Versions", "Versions", "Versionen", "Versiones"), "comments": ("Commentaires", "Comments", "Kommentare", "Comentarios"),
  "file_new": ("Nouvelle carte", "New map", "Neue Karte", "Mapa nuevo"), "file_open": ("Ouvrir", "Open", "Öffnen", "Abrir"), "file_import": ("Importer", "Import", "Importieren", "Importar"),
  "file_save-now": ("Enregistrer", "Save", "Speichern", "Guardar"), "file_version-save": ("Enregistrer une version", "Save a version", "Version speichern", "Guardar una versión"),
  "file_versions": ("Versions", "Versions", "Versionen", "Versiones"), "file_export-ozmap": ("Fichier Ozimut", "Ozimut file", "Ozimut-Datei", "Archivo Ozimut"),
  "file_export": ("Exporter…", "Export…", "Exportieren…", "Exportar…"), "file_export-ocd": ("Exporter en OCAD", "Export as OCAD", "Als OCAD exportieren", "Exportar a OCAD"), "file_export-omap": ("Exporter en Mapper", "Export as Mapper", "Als Mapper exportieren", "Exportar a Mapper"),
  "file_props": ("Propriétés de la carte", "Map properties", "Karteneigenschaften", "Propiedades del mapa"), "file_close": ("Fermer", "Close", "Schließen", "Cerrar"),
}
for key, v in RIB.items(): k(f"map.rib.{key}", *v)
k("map.file.new", "Nouvelle carte…", "New map…", "Neue Karte…", "Mapa nuevo…")
k("map.file.open", "Ouvrir une carte…", "Open a map…", "Karte öffnen…", "Abrir un mapa…")
k("map.file.import", "Importer un fichier…", "Import a file…", "Datei importieren…", "Importar un archivo…")
k("map.file.save", "Enregistrer maintenant", "Save now", "Jetzt speichern", "Guardar ahora")
k("map.file.props", "Propriétés de la carte…", "Map properties…", "Karteneigenschaften…", "Propiedades del mapa…")
k("map.file.close", "Fermer la carte", "Close the map", "Karte schließen", "Cerrar el mapa")
k("map.file.export", "Exporter…", "Export…", "Exportieren…", "Exportar…")
# « Exporter… »'s dialog (owner, 2026-11-07): each format a card, its name, extension and what it is for
k("map.exp.title", "Exporter", "Export", "Exportieren", "Exportar")
k("map.exp.sub", "Chaque fichier, et à quoi il sert.", "Each file, and what it is for.", "Jede Datei und wofür sie dient.", "Cada archivo y para qué sirve.")
k("map.exp.g.print", "Pour imprimer", "For printing", "Zum Drucken", "Para imprimir")
k("map.exp.g.mapping", "Pour un logiciel de cartographie", "For mapping software", "Für eine Kartensoftware", "Para un programa de cartografía")
k("map.exp.g.geo", "Géoréférencé, pour un SIG ou un GPS", "Georeferenced, for a GIS or a GPS", "Georeferenziert, für ein GIS oder ein GPS", "Georreferenciado, para un SIG o un GPS")
k("map.exp.g.ozimut", "Dans Ozimut", "In Ozimut", "In Ozimut", "En Ozimut")
k("map.exp.export-pdf", "PDF de la carte", "Map PDF", "Karten-PDF", "PDF del mapa")
k("map.exp.export-pdf.d", "La carte en vectoriel, prête à imprimer, avec sa mise en page (zone d'impression, échelle, légende, logos).",
  "The map as vectors, ready to print, with its layout (print area, scale bar, legend, logos).",
  "Die Karte als Vektoren, druckfertig, mit ihrem Layout (Druckbereich, Maßstab, Legende, Logos).",
  "El mapa en vectorial, listo para imprimir, con su maquetación (zona de impresión, escala, leyenda, logotipos).")
k("map.exp.export-sep", "Séparations", "Separations", "Farbauszüge", "Separaciones")
k("map.exp.export-sep.d", "Pour l'imprimeur : une page par encre, en tons directs ou en CMJN, avec repères de calage.",
  "For the printer: one page per ink, spot colours or CMYK, with registration marks.",
  "Für die Druckerei: eine Seite pro Farbe, Sonderfarben oder CMYK, mit Passermarken.",
  "Para la imprenta: una página por tinta, en tintas planas o CMYK, con marcas de registro.")
k("map.exp.export-ocd", "Fichier OCAD", "OCAD file", "OCAD-Datei", "Archivo OCAD")
k("map.exp.export-ocd.d", "Pour OCAD (versions 9 à 2018) ; ce que vous n'avez pas modifié reste à l'identique.",
  "For OCAD (versions 9 to 2018); what you did not change stays exactly as it was.",
  "Für OCAD (Versionen 9 bis 2018); was du nicht geändert hast, bleibt genau erhalten.",
  "Para OCAD (versiones 9 a 2018); lo que no modificaste queda idéntico.")
k("map.exp.export-omap", "Fichier OpenOrienteering Mapper", "OpenOrienteering Mapper file", "OpenOrienteering-Mapper-Datei", "Archivo de OpenOrienteering Mapper")
k("map.exp.export-omap.d", "Pour OpenOrienteering Mapper, le logiciel libre ; ce que Mapper ne connaît pas est signalé.",
  "For OpenOrienteering Mapper, the free software; what Mapper does not know is listed.",
  "Für OpenOrienteering Mapper, die freie Software; was Mapper nicht kennt, wird aufgelistet.",
  "Para OpenOrienteering Mapper, el programa libre; lo que Mapper no conoce se indica.")
k("map.exp.export-ozmap", "Fichier Ozimut", "Ozimut file", "Ozimut-Datei", "Archivo Ozimut")
k("map.exp.export-ozmap.d", "Toute la carte, ses fonds et son fichier d'origine : pour la garder ou la reprendre sur un autre compte.",
  "The whole map, its backgrounds and its original file: to keep it or to pick it up on another account.",
  "Die ganze Karte, ihre Hintergründe und ihre Ursprungsdatei: zum Aufbewahren oder für ein anderes Konto.",
  "Todo el mapa, sus fondos y su archivo original: para guardarlo o retomarlo en otra cuenta.")
k("map.exp.export-png", "Image", "Image", "Bild", "Imagen")
k("map.exp.export-png.d", "La carte en image (150, 300 ou 600 dpi), pour un document ou un site.",
  "The map as an image (150, 300 or 600 dpi), for a document or a website.",
  "Die Karte als Bild (150, 300 oder 600 dpi), für ein Dokument oder eine Website.",
  "El mapa como imagen (150, 300 o 600 ppp), para un documento o una web.")
k("map.exp.export-geotiff", "Image géoréférencée", "Georeferenced image", "Georeferenziertes Bild", "Imagen georreferenciada")
k("map.exp.export-geotiff.d", "L'image avec son fichier de calage (world file) et sa projection : elle se pose à sa place dans un SIG.",
  "The image with its world file and projection: it lands in place in a GIS.",
  "Das Bild mit World-File und Projektion: Es liegt in einem GIS an seinem Platz.",
  "La imagen con su archivo de georreferencia (world file) y su proyección: se coloca en su sitio en un SIG.")
k("map.exp.export-kmz", "KMZ", "KMZ", "KMZ", "KMZ")
k("map.exp.export-kmz.d", "La carte posée sur le globe, pour Google Earth, un GPS ou une application de course.",
  "The map laid on the globe, for Google Earth, a GPS or a running app.",
  "Die Karte auf dem Globus, für Google Earth, ein GPS oder eine Lauf-App.",
  "El mapa sobre el globo, para Google Earth, un GPS o una aplicación de carrera.")
k("map.exp.to-tracer", "Vers le tracé", "To course setting", "Zur Bahnlegung", "Al trazado")
k("map.exp.to-tracer.d", "Un nouvel événement du tracé sur cette carte, pour y tracer des circuits.",
  "A new course-setting event on this map, to set courses on it.",
  "Eine neue Bahnlegungs-Veranstaltung auf dieser Karte, um Bahnen zu legen.",
  "Un nuevo evento de trazado sobre este mapa, para trazar recorridos.")
k("map.exp.to-mymaps", "Vers Mes cartes", "To My maps", "Zu Meine Karten", "A Mis mapas")
k("map.exp.to-mymaps.d", "Une image de la carte dans votre bibliothèque, pour y garder vos traces.",
  "An image of the map in your library, to keep your tracks on it.",
  "Ein Bild der Karte in deiner Bibliothek, um deine Spuren darauf zu sammeln.",
  "Una imagen del mapa en tu biblioteca, para guardar tus trazas en él.")
k("map.file.unknown", "Ce fichier n'est pas une carte qu'Ozimut sait lire (OCAD, OpenOrienteering Mapper, Ozimut).", "This file is not a map Ozimut can read (OCAD, OpenOrienteering Mapper, Ozimut).", "Diese Datei ist keine Karte, die Ozimut lesen kann (OCAD, OpenOrienteering Mapper, Ozimut).", "Este archivo no es un mapa que Ozimut sepa leer (OCAD, OpenOrienteering Mapper, Ozimut).")
k("map.file.notOzmap", "Ce fichier n'est pas un fichier de carte Ozimut.", "This file is not an Ozimut map file.", "Diese Datei ist keine Ozimut-Kartendatei.", "Este archivo no es un archivo de mapa de Ozimut.")
k("map.file.newer", "Ce fichier a été écrit par une version plus récente d'Ozimut : rechargez la page.", "This file was written by a newer version of Ozimut: reload the page.", "Diese Datei wurde von einer neueren Ozimut-Version geschrieben: Seite neu laden.", "Este archivo lo escribió una versión más reciente de Ozimut: recarga la página.")

# ---- why greyed ---------------------------------------------------------------------------------------------------------------
k("map.why.readOnly", "Carte ouverte en lecture seule", "Map open read-only", "Karte nur zum Lesen geöffnet", "Mapa abierto solo para lectura")
k("map.why.noSel", "Choisissez d'abord un ou plusieurs objets", "Select one or more objects first", "Wähle zuerst ein oder mehrere Objekte", "Selecciona primero uno o varios objetos")
k("map.why.twoAreas", "Choisissez au moins deux surfaces", "Select at least two areas", "Wähle mindestens zwei Flächen", "Selecciona al menos dos superficies")
k("map.why.twoLines", "Choisissez au moins deux lignes", "Select at least two lines", "Wähle mindestens zwei Linien", "Selecciona al menos dos líneas")
k("map.why.noSymbol", "Choisissez d'abord un symbole à gauche", "Choose a symbol on the left first", "Wähle zuerst links eine Signatur", "Elige primero un símbolo a la izquierda")
k("map.why.nothing", "Rien à faire", "Nothing to do", "Nichts zu tun", "Nada que hacer")
k("map.why.noDraft", "Aucun objet en brouillon", "No draft objects", "Keine Entwurfsobjekte", "No hay objetos en borrador")
k("map.why.notSaved", "La carte doit d'abord être enregistrée sur Ozimut", "The map must be saved on Ozimut first", "Die Karte muss zuerst auf Ozimut gespeichert werden", "Primero hay que guardar el mapa en Ozimut")

# ---- hints ----------------------------------------------------------------------------------------------------------------------
for key, v in {
  "select": ("Cliquez sur un objet ; Maj pour en ajouter ; un cadre pour en choisir plusieurs ; glissez un objet choisi pour le déplacer ; la carte : bouton du milieu, Espace + glisser ou l'outil Main (H)", "Click an object; Shift adds; a box selects several; drag a selected object to move it; the map: middle button, Space + drag or the Pan tool (H)", "Klicke auf ein Objekt; Umschalt fügt hinzu; ein Rahmen wählt mehrere; ziehe ein gewähltes Objekt, um es zu verschieben; die Karte: mittlere Maustaste, Leertaste + Ziehen oder das Werkzeug „Ansicht verschieben“ (H)", "Haz clic en un objeto; Mayús añade; un recuadro elige varios; arrastra un objeto elegido para moverlo; el mapa: botón central, Espacio + arrastrar o la herramienta Desplazar la vista (H)"),
  "pan": ("Glissez pour déplacer la carte ; S pour revenir à la sélection", "Drag to move the map; S to go back to Select", "Ziehe, um die Karte zu verschieben; S für zurück zum Auswählen", "Arrastra para mover el mapa; S para volver a Seleccionar"),
  "vertex": ("Glissez un point ou une poignée ; un clic sur la ligne ajoute un point ; Alt+clic en retire un ; double-clic : angle ou arrondi", "Drag a point or a handle; a click on the line adds a point; Alt+click removes one; double-click: corner or smooth", "Punkt oder Anfasser ziehen; Klick auf die Linie fügt einen Punkt hinzu; Alt+Klick entfernt ihn; Doppelklick: Ecke oder rund", "Arrastra un punto o un tirador; un clic en la línea añade un punto; Alt+clic lo quita; doble clic: esquina o curva"),
  "fill": ("Cliquez à l'intérieur d'une zone fermée par des lignes", "Click inside a region closed by lines", "Klicke in einen von Linien geschlossenen Bereich", "Haz clic dentro de una zona cerrada por líneas"),
  "cut": ("Cliquez sur une ligne pour la couper, ou tracez une ligne à travers une surface puis Entrée", "Click a line to cut it, or draw a line across an area then Enter", "Klicke auf eine Linie, um sie zu schneiden, oder zeichne eine Linie durch eine Fläche, dann Eingabe", "Haz clic en una línea para cortarla, o traza una línea a través de una superficie y pulsa Intro"),
  "hole": ("Dessinez le trou dans la surface choisie, puis Entrée", "Draw the hole in the selected area, then Enter", "Zeichne das Loch in die gewählte Fläche, dann Eingabe", "Dibuja el agujero en la superficie elegida y pulsa Intro"),
  "measure": ("Cliquez les points à mesurer ; double-clic pour finir", "Click the points to measure; double-click to finish", "Klicke die Punkte zum Messen; Doppelklick zum Beenden", "Haz clic en los puntos que medir; doble clic para terminar"),
  "comment": ("Cliquez où placer la note", "Click where to place the note", "Klicke, wo die Notiz hin soll", "Haz clic donde poner la nota"),
  "calage": ("Un point du fond, puis sa place sur la carte ; Entrée pour appliquer", "A point of the background, then its place on the map; Enter to apply", "Ein Punkt des Hintergrunds, dann seine Stelle auf der Karte; Eingabe zum Anwenden", "Un punto del fondo y luego su lugar en el mapa; Intro para aplicar"),
  "area": ("Deux clics pour les coins", "Two clicks for the corners", "Zwei Klicks für die Ecken", "Dos clics para las esquinas"),
  "place": ("Cliquez où placer l'élément", "Click where to place the element", "Klicke, wo das Element hin soll", "Haz clic donde colocar el elemento"),
  }.items(): k(f"map.hint.{key}", *v)
for key, v in {
  "straight": ("Cliquez chaque point ; double-clic ou Entrée pour finir ; Retour arrière enlève le dernier", "Click each point; double-click or Enter to finish; Backspace removes the last", "Klicke jeden Punkt; Doppelklick oder Eingabe zum Beenden; Rücktaste entfernt den letzten", "Haz clic en cada punto; doble clic o Intro para terminar; Retroceso quita el último"),
  "curve": ("Cliquez et glissez pour donner la direction de la courbe en chaque point", "Click and drag to set the curve's direction at each point", "Klicken und ziehen, um die Richtung der Kurve an jedem Punkt festzulegen", "Haz clic y arrastra para dar la dirección de la curva en cada punto"),
  "free": ("Dessinez en gardant le bouton appuyé", "Draw while holding the button down", "Zeichne mit gedrückter Taste", "Dibuja manteniendo el botón pulsado"),
  "rect": ("Chaque côté à angle droit du précédent (bâtiments) ; revenir au départ ferme", "Each side at a right angle to the previous one (buildings); back to the start closes", "Jede Seite im rechten Winkel zur vorigen (Gebäude); zurück zum Start schließt", "Cada lado en ángulo recto con el anterior (edificios); volver al inicio cierra"),
  "circle": ("Cliquez le centre et glissez jusqu'au rayon", "Click the centre and drag to the radius", "Klicke den Mittelpunkt und ziehe bis zum Radius", "Haz clic en el centro y arrastra hasta el radio"),
  }.items(): k(f"map.hint.draw.{key}", *v)
k("map.hint.draw.point", "Cliquez où poser le symbole ; glissez pour l'orienter", "Click where the symbol goes; drag to turn it", "Klicke, wo die Signatur hin soll; ziehe, um sie zu drehen", "Haz clic donde va el símbolo; arrastra para orientarlo")
k("map.hint.draw.text", "Cliquez où placer le texte", "Click where the text goes", "Klicke, wo der Text hin soll", "Haz clic donde va el texto")
# the same by touch (a phone, a tablet: no key, no button, no hover)
for key, v in {
  "select": ("Touchez un objet pour le choisir ; glissez-le pour le déplacer ; un doigt déplace la carte, deux doigts zooment", "Tap an object to select it; drag it to move it; one finger moves the map, two fingers zoom", "Tippe ein Objekt an, um es zu wählen; ziehe es, um es zu verschieben; ein Finger verschiebt die Karte, zwei Finger zoomen", "Toca un objeto para elegirlo; arrástralo para moverlo; un dedo mueve el mapa, dos dedos hacen zoom"),
  "pan": ("Glissez pour déplacer la carte ; deux doigts pour zoomer", "Drag to move the map; two fingers to zoom", "Ziehe, um die Karte zu verschieben; zwei Finger zum Zoomen", "Arrastra para mover el mapa; dos dedos para el zoom"),
  "vertex": ("Glissez un point ou une poignée ; touchez la ligne pour ajouter un point ; touchez un point pour le retirer ou changer son angle", "Drag a point or a handle; tap the line to add a point; tap a point to remove it or change its corner", "Punkt oder Anfasser ziehen; tippe auf die Linie, um einen Punkt hinzuzufügen; tippe einen Punkt an, um ihn zu entfernen oder seine Ecke zu ändern", "Arrastra un punto o un tirador; toca la línea para añadir un punto; toca un punto para quitarlo o cambiar su esquina"),
  "fill": ("Touchez l'intérieur d'une zone fermée par des lignes", "Tap inside a region closed by lines", "Tippe in einen von Linien geschlossenen Bereich", "Toca dentro de una zona cerrada por líneas"),
  "cut": ("Touchez une ligne pour la couper, ou tracez une ligne à travers une surface puis « Couper »", "Tap a line to cut it, or draw a line across an area then “Cut”", "Tippe auf eine Linie, um sie zu schneiden, oder zeichne eine Linie durch eine Fläche, dann „Schneiden“", "Toca una línea para cortarla, o traza una línea a través de una superficie y luego «Cortar»"),
  "hole": ("Touchez les points du trou dans la surface choisie, puis « Terminer »", "Tap the points of the hole in the selected area, then “Finish”", "Tippe die Punkte des Lochs in der gewählten Fläche, dann „Fertig“", "Toca los puntos del agujero en la superficie elegida y luego «Terminar»"),
  "measure": ("Touchez les points à mesurer", "Tap the points to measure", "Tippe die Punkte zum Messen", "Toca los puntos que medir"),
  }.items(): k(f"map.hint.touch.{key}", *v)
for key, v in {
  "straight": ("Touchez chaque point, puis « Terminer » ; deux doigts déplacent la carte", "Tap each point, then “Finish”; two fingers move the map", "Tippe jeden Punkt, dann „Fertig“; zwei Finger verschieben die Karte", "Toca cada punto y luego «Terminar»; dos dedos mueven el mapa"),
  "curve": ("Touchez et glissez pour donner la direction de la courbe en chaque point, puis « Terminer »", "Tap and drag to set the curve's direction at each point, then “Finish”", "Tippen und ziehen, um die Richtung der Kurve an jedem Punkt festzulegen, dann „Fertig“", "Toca y arrastra para dar la dirección de la curva en cada punto y luego «Terminar»"),
  "free": ("Dessinez du doigt ; deux doigts déplacent la carte", "Draw with your finger; two fingers move the map", "Zeichne mit dem Finger; zwei Finger verschieben die Karte", "Dibuja con el dedo; dos dedos mueven el mapa"),
  "rect": ("Touchez chaque coin : les côtés restent à angle droit ; revenir au départ ferme", "Tap each corner: the sides stay at right angles; back to the start closes", "Tippe jede Ecke: Die Seiten bleiben rechtwinklig; zurück zum Start schließt", "Toca cada esquina: los lados quedan en ángulo recto; volver al inicio cierra"),
  "circle": ("Touchez le centre et glissez jusqu'au rayon", "Tap the centre and drag to the radius", "Tippe den Mittelpunkt und ziehe bis zum Radius", "Toca el centro y arrastra hasta el radio"),
  "point": ("Touchez où poser le symbole ; glissez pour l'orienter", "Tap where the symbol goes; drag to turn it", "Tippe, wo die Signatur hin soll; ziehe, um sie zu drehen", "Toca donde va el símbolo; arrastra para orientarlo"),
  "text": ("Touchez où placer le texte", "Tap where the text goes", "Tippe, wo der Text hin soll", "Toca donde va el texto"),
  }.items(): k(f"map.hint.touch.draw.{key}", *v)
# the bar over the map's bottom, by touch: what a key does with a mouse
k("map.touch.undoPoint", "Annuler le point", "Undo point", "Punkt zurück", "Deshacer punto")
k("map.touch.cancel", "Abandonner", "Discard", "Verwerfen", "Descartar")
k("map.touch.finish", "Terminer", "Finish", "Fertig", "Terminar")
k("map.touch.cut", "Couper", "Cut", "Schneiden", "Cortar")
k("map.touch.apply", "Appliquer", "Apply", "Anwenden", "Aplicar")
k("map.touch.clear", "Effacer la mesure", "Clear the measure", "Messung löschen", "Borrar la medida")
k("map.touch.delPoint", "Retirer le point", "Remove point", "Punkt entfernen", "Quitar el punto")
k("map.touch.corner", "Angle ou arrondi", "Corner or smooth", "Ecke oder rund", "Esquina o curva")

# ---- tools' messages -------------------------------------------------------------------------------------------------------------
k("map.tool.pickSymbol", "Choisissez d'abord un symbole dans la liste à gauche.", "Choose a symbol in the list on the left first.", "Wähle zuerst eine Signatur in der Liste links.", "Elige primero un símbolo en la lista de la izquierda.")
k("map.tool.pickArea", "Choisissez d'abord un symbole de surface.", "Choose an area symbol first.", "Wähle zuerst eine Flächensignatur.", "Elige primero un símbolo de superficie.")
k("map.tool.pickAreaFirst", "Choisissez d'abord la surface à trouer.", "Select the area to cut a hole in first.", "Wähle zuerst die Fläche, in die ein Loch soll.", "Selecciona primero la superficie que agujerear.")
k("map.tool.notClosed", "Cette zone n'est pas fermée par des lignes à proximité.", "This region is not closed by lines nearby.", "Dieser Bereich ist nicht von Linien in der Nähe geschlossen.", "Esta zona no está cerrada por líneas cercanas.")
k("map.tool.noSegment", "Aucun segment droit ici : passez la courbe en segments ou ajoutez le point à côté.", "No straight segment here: turn the curve into segments or add the point beside it.", "Hier keine gerade Strecke: Kurve in Strecken umwandeln oder den Punkt daneben setzen.", "No hay un segmento recto aquí: convierte la curva en segmentos o añade el punto al lado.")
k("map.tool.tooFew", "L'objet garderait trop peu de points.", "The object would keep too few points.", "Das Objekt hätte zu wenige Punkte.", "El objeto se quedaría con muy pocos puntos.")
k("map.tool.cutDone.one", "{n} surface coupée", "{n} area cut", "{n} Fläche geschnitten", "{n} superficie cortada")
k("map.tool.cutDone.other", "{n} surfaces coupées", "{n} areas cut", "{n} Flächen geschnitten", "{n} superficies cortadas")
k("map.tool.cutNone", "La ligne ne traverse aucune surface de part en part.", "The line does not cross any area from side to side.", "Die Linie durchquert keine Fläche ganz.", "La línea no atraviesa ninguna superficie de lado a lado.")
k("map.tool.emptyResult", "Le résultat est vide.", "The result is empty.", "Das Ergebnis ist leer.", "El resultado está vacío.")
k("map.tool.joinFar", "Les lignes doivent se toucher bout à bout pour être jointes.", "The lines must meet end to end to be joined.", "Die Linien müssen sich an den Enden berühren, um verbunden zu werden.", "Las líneas deben tocarse por los extremos para unirse.")
k("map.tool.symbolKind", "Certains objets n'ont pas pris le symbole : un point ne devient pas une ligne.", "Some objects did not take the symbol: a point does not become a line.", "Einige Objekte haben die Signatur nicht übernommen: Ein Punkt wird keine Linie.", "Algunos objetos no tomaron el símbolo: un punto no se convierte en línea.")
k("map.tool.pipette", "Cliquez sur un objet de la carte pour prendre son symbole.", "Click an object on the map to take its symbol.", "Klicke auf ein Objekt der Karte, um seine Signatur zu übernehmen.", "Haz clic en un objeto del mapa para tomar su símbolo.")
k("map.warn.area", "Surface de {a} mm² : sous le minimum de {min} mm² des spécifications", "Area of {a} mm²: below the specification's minimum of {min} mm²", "Fläche von {a} mm²: unter dem Mindestwert von {min} mm² der Spezifikation", "Superficie de {a} mm²: por debajo del mínimo de {min} mm² de la especificación")
k("map.warn.length", "Longueur de {l} mm : sous le minimum de {min} mm des spécifications", "Length of {l} mm: below the specification's minimum of {min} mm", "Länge von {l} mm: unter dem Mindestwert von {min} mm der Spezifikation", "Longitud de {l} mm: por debajo del mínimo de {min} mm de la especificación")
k("map.text.title", "Texte", "Text", "Text", "Texto")
k("map.text.label", "Le texte", "The text", "Der Text", "El texto")
k("map.dlg.angle", "Angle (degrés, sens inverse des aiguilles)", "Angle (degrees, anticlockwise)", "Winkel (Grad, gegen den Uhrzeigersinn)", "Ángulo (grados, sentido antihorario)")
k("map.dlg.cancel", "Annuler", "Cancel", "Abbrechen", "Cancelar")
k("map.dlg.close", "Fermer", "Close", "Schließen", "Cerrar")
k("map.dlg.save", "Enregistrer", "Save", "Speichern", "Guardar")
k("map.ctxm.pipette", "Prendre ce symbole", "Take this symbol", "Diese Signatur übernehmen", "Tomar este símbolo")
k("map.ctxm.paste", "Coller", "Paste", "Einfügen", "Pegar")
# a dialog's confirming button says what it does (2026-11-17)
k("map.ok.add", "Ajouter à la carte", "Add to the map", "Zur Karte hinzufügen", "Añadir al mapa")
k("map.ok.apply", "Appliquer", "Apply", "Anwenden", "Aplicar")
k("map.ok.show", "Afficher le fond", "Show the background", "Hintergrund anzeigen", "Mostrar el fondo")
k("map.ok.pdf", "Créer le PDF", "Create the PDF", "PDF erstellen", "Crear el PDF")
k("map.ok.export", "Exporter", "Export", "Exportieren", "Exportar")
k("map.ok.create", "Créer", "Create", "Erstellen", "Crear")
k("map.ok.link", "Créer le lien", "Create the link", "Link erstellen", "Crear el enlace")
# an empty map (the review of the workflows, 2026-11-17)
k("map.empty.title", "Carte vide", "Empty map", "Leere Karte", "Mapa vacío")
k("map.empty.hint", "Choisissez un symbole à gauche, puis dessinez. Ou partez de données ouvertes (courbes, LiDAR, OpenStreetMap) ou d'un fond à décalquer.",
  "Choose a symbol on the left, then draw. Or start from open data (contours, LiDAR, OpenStreetMap) or from a background to trace over.",
  "Wähle links ein Symbol und zeichne. Oder beginne mit offenen Daten (Höhenlinien, LiDAR, OpenStreetMap) oder einer Vorlage zum Abzeichnen.",
  "Elige un símbolo a la izquierda y dibuja. O parte de datos abiertos (curvas, LiDAR, OpenStreetMap) o de un fondo para calcar.")
k("map.search.none", "Rien trouvé", "Nothing found", "Nichts gefunden", "No se encontró nada")

# ---- undo labels ----------------------------------------------------------------------------------------------------------------
for key, v in {
  "draw": ("Dessin", "Drawing", "Zeichnen", "Dibujo"), "text": ("Texte", "Text", "Text", "Texto"), "move": ("Déplacement", "Move", "Verschieben", "Movimiento"),
  "vertex": ("Point modifié", "Point changed", "Punkt geändert", "Punto modificado"), "cut": ("Coupe", "Cut", "Schnitt", "Corte"), "hole": ("Trou", "Hole", "Loch", "Agujero"),
  "delete": ("Suppression", "Deletion", "Löschen", "Eliminación"), "duplicate": ("Copie", "Copy", "Kopie", "Copia"), "symbol": ("Symbole changé", "Symbol changed", "Signatur geändert", "Símbolo cambiado"),
  "reverse": ("Sens inversé", "Direction reversed", "Richtung umgekehrt", "Sentido invertido"), "smooth": ("Lissage", "Smoothing", "Glätten", "Suavizado"), "simplify": ("Simplification", "Simplification", "Vereinfachung", "Simplificación"),
  "toggleCurves": ("Courbes ↔ segments", "Curves ↔ segments", "Kurven ↔ Strecken", "Curvas ↔ segmentos"), "union": ("Union", "Union", "Vereinigung", "Unión"),
  "difference": ("Soustraction", "Difference", "Differenz", "Diferencia"), "intersection": ("Intersection", "Intersection", "Schnittmenge", "Intersección"), "join": ("Jonction", "Join", "Verbindung", "Unión de líneas"),
  "rotate": ("Rotation", "Rotation", "Drehung", "Giro"), "order": ("Ordre", "Order", "Reihenfolge", "Orden"), "part": ("Partie changée", "Part changed", "Teil geändert", "Parte cambiada"),
  "parts": ("Parties", "Parts", "Teile", "Partes"), "props": ("Propriétés", "Properties", "Eigenschaften", "Propiedades"), "bg": ("Fonds", "Backgrounds", "Hintergründe", "Fondos"),
  "data": ("Données ajoutées", "Data added", "Daten hinzugefügt", "Datos añadidos"), "accept": ("Brouillon accepté", "Draft accepted", "Entwurf übernommen", "Borrador aceptado"),
  "reject": ("Brouillon rejeté", "Draft rejected", "Entwurf verworfen", "Borrador rechazado"), "print": ("Zone d'impression", "Print area", "Druckbereich", "Zona de impresión"),
  "north": ("Lignes du nord", "North lines", "Nordlinien", "Líneas de norte"), "layout": ("Mise en page", "Layout", "Layout", "Maquetación"), "set": ("Jeu de symboles", "Symbol set", "Signaturensatz", "Juego de símbolos"),
  }.items(): k(f"map.undo.{key}", *v)

# ---- panes ------------------------------------------------------------------------------------------------------------------------
k("map.left.title", "Symboles", "Symbols", "Signaturen", "Símbolos")
k("map.left.search", "Numéro ou nom", "Number or name", "Nummer oder Name", "Número o nombre")
k("map.left.recent", "Récents", "Recent", "Zuletzt", "Recientes")
k("map.left.none", "Aucun symbole ne correspond.", "No symbol matches.", "Keine Signatur passt.", "Ningún símbolo coincide.")
for key, v in {"sel": ("Sélection", "Selection", "Auswahl", "Selección"), "parts": ("Parties", "Parts", "Teile", "Partes"), "bg": ("Fonds", "Backgrounds", "Hintergründe", "Fondos"),
  "colors": ("Couleurs", "Colours", "Farben", "Colores"), "issues": ("Problèmes", "Problems", "Probleme", "Problemas")}.items(): k(f"map.right.{key}", *v)
k("map.sel.none", "Aucun objet choisi.", "No object selected.", "Kein Objekt ausgewählt.", "Ningún objeto seleccionado.")
k("map.sel.current", "Symbole pour dessiner :", "Symbol to draw with:", "Signatur zum Zeichnen:", "Símbolo para dibujar:")
k("map.sel.objects", "Objets", "Objects", "Objekte", "Objetos")
k("map.sel.symbols", "Symboles", "Symbols", "Signaturen", "Símbolos")
k("map.sel.scale", "Échelle", "Scale", "Maßstab", "Escala")
k("map.sel.drafts", "En brouillon", "Drafts", "Entwürfe", "En borrador")
k("map.sel.symbol", "Symbole", "Symbol", "Signatur", "Símbolo")
k("map.sel.length", "Longueur", "Length", "Länge", "Longitud")
k("map.sel.area", "Surface", "Area", "Fläche", "Superficie")
k("map.sel.holes", "Trous", "Holes", "Löcher", "Agujeros")
k("map.sel.angle", "Angle", "Angle", "Winkel", "Ángulo")
k("map.sel.text", "Texte", "Text", "Text", "Texto")
k("map.sel.source", "Source", "Source", "Quelle", "Fuente")
k("map.sel.draft", "brouillon", "draft", "Entwurf", "borrador")
k("map.sel.points", "Points", "Points", "Punkte", "Puntos")
k("map.sel.count", "Sélection", "Selection", "Auswahl", "Selección")
k("map.sel.part", "Partie", "Part", "Teil", "Parte")
for key, v in {"osm": ("OpenStreetMap", "OpenStreetMap", "OpenStreetMap", "OpenStreetMap"), "dem": ("modèle de terrain", "terrain model", "Geländemodell", "modelo del terreno"),
  "lidar": ("LiDAR", "LiDAR", "LiDAR", "LiDAR"), "bdtopo": ("IGN BD TOPO", "IGN BD TOPO", "IGN BD TOPO", "IGN BD TOPO"), "north": ("lignes du nord", "north lines", "Nordlinien", "líneas de norte"),
  "layout": ("mise en page", "layout", "Layout", "maquetación")}.items(): k(f"map.src.{key}", *v)
k("map.parts.hint", "Une partie regroupe des objets à masquer ou verrouiller ensemble (la carte, un brouillon, la mise en page).", "A part groups objects to hide or lock together (the map, a draft, the layout).", "Ein Teil fasst Objekte zusammen, die gemeinsam ausgeblendet oder gesperrt werden (Karte, Entwurf, Layout).", "Una parte agrupa objetos para ocultarlos o bloquearlos juntos (el mapa, un borrador, la maquetación).")
k("map.parts.current", "Dessiner dans", "Draw in", "Zeichnen in", "Dibujar en")
k("map.parts.default", "Carte", "Map", "Karte", "Mapa")
k("map.parts.draft", "Brouillon", "Draft", "Entwurf", "Borrador")
k("map.parts.lidarHelp", "Courbes d'aide (LiDAR)", "Helper contours (LiDAR)", "Hilfshöhenlinien (LiDAR)", "Curvas de ayuda (LiDAR)")
k("map.parts.add", "Nouvelle partie", "New part", "Neuer Teil", "Nueva parte")
k("map.parts.name", "Nom", "Name", "Name", "Nombre")
k("map.parts.rename", "Renommer", "Rename", "Umbenennen", "Cambiar nombre")
k("map.parts.delete", "Supprimer la partie", "Delete the part", "Teil löschen", "Eliminar la parte")
k("map.parts.notEmpty", "Videz d'abord la partie de ses objets.", "Move the part's objects out first.", "Verschiebe zuerst die Objekte des Teils.", "Primero saca los objetos de la parte.")
k("map.parts.show", "Afficher", "Show", "Anzeigen", "Mostrar")
k("map.parts.hide", "Masquer", "Hide", "Ausblenden", "Ocultar")
k("map.parts.lock", "Verrouiller", "Lock", "Sperren", "Bloquear")
k("map.parts.unlock", "Déverrouiller", "Unlock", "Entsperren", "Desbloquear")
k("map.bg.mapOpacity", "Opacité de la carte", "Map opacity", "Deckkraft der Karte", "Opacidad del mapa")
k("map.bg.opacity", "Opacité", "Opacity", "Deckkraft", "Opacidad")
k("map.bg.toggle", "Afficher ou masquer", "Show or hide", "Ein- oder ausblenden", "Mostrar u ocultar")
k("map.bg.remove", "Retirer le fond", "Remove the background", "Hintergrund entfernen", "Quitar el fondo")
k("map.bg.none", "Aucun fond. Ajoutez un scan, une photo, un PDF, une image géoréférencée, une trace GPS ou un fond en ligne.", "No backgrounds. Add a scan, a photo, a PDF, a georeferenced image, a GPS track or an online background.", "Keine Hintergründe. Füge einen Scan, ein Foto, ein PDF, ein georeferenziertes Bild, eine GPS-Spur oder einen Online-Hintergrund hinzu.", "No hay fondos. Añade un escaneo, una foto, un PDF, una imagen georreferenciada, un track GPS o un fondo en línea.")
k("map.bg.reading", "Lecture de {name}…", "Reading {name}…", "{name} wird gelesen…", "Leyendo {name}…")
k("map.bg.placedGeo", "Fond placé d'après son géoréférencement.", "Background placed from its georeference.", "Hintergrund nach seiner Georeferenzierung platziert.", "Fondo colocado según su georreferenciación.")
k("map.bg.placedHint", "Fond placé au milieu de l'écran : calez-le sur la carte avec « Caler ».", "Background placed in the middle of the screen: fit it to the map with « Adjust ».", "Hintergrund in der Bildschirmmitte platziert: mit „Einpassen“ an die Karte anpassen.", "Fondo colocado en el centro de la pantalla: ajústalo al mapa con «Ajustar».")
k("map.bg.needGeo", "La carte doit être géoréférencée (Fichier › Propriétés).", "The map must be georeferenced (File › Properties).", "Die Karte muss georeferenziert sein (Datei › Eigenschaften).", "El mapa debe estar georreferenciado (Archivo › Propiedades).")
k("map.bg.gpxEmpty", "Cette trace ne contient aucun point.", "This track has no points.", "Diese Spur hat keine Punkte.", "Este track no tiene puntos.")
k("map.bg.gpxLarge", "Cette trace couvre une zone trop grande pour la carte.", "This track covers too large an area for the map.", "Diese Spur deckt ein zu großes Gebiet für die Karte ab.", "Este track cubre una zona demasiado grande para el mapa.")
k("map.bg.loading", "Chargement du fond en ligne…", "Loading the online background…", "Online-Hintergrund wird geladen…", "Cargando el fondo en línea…")
k("map.bg.layer", "Fond", "Background", "Hintergrund", "Fondo")
k("map.bg.layer.ortho", "Photos aériennes IGN (France)", "IGN aerial photos (France)", "IGN-Luftbilder (Frankreich)", "Fotos aéreas del IGN (Francia)")
k("map.bg.layer.plan", "Plan IGN (France)", "Plan IGN (France)", "Plan IGN (Frankreich)", "Plan IGN (Francia)")
k("map.bg.layer.osm", "OpenStreetMap", "OpenStreetMap", "OpenStreetMap", "OpenStreetMap")
k("map.bg.onlineHint", "Les images sont lues à chaque ouverture et ne sont pas gardées ; la carte doit être géoréférencée.", "The images are read at each opening and not kept; the map must be georeferenced.", "Die Bilder werden bei jedem Öffnen gelesen und nicht gespeichert; die Karte muss georeferenziert sein.", "Las imágenes se leen en cada apertura y no se guardan; el mapa debe estar georreferenciado.")
k("map.bg.credit.ortho", "Fond : © IGN, photos aériennes", "Background: © IGN aerial photos", "Hintergrund: © IGN-Luftbilder", "Fondo: © IGN, fotos aéreas")
k("map.bg.credit.plan", "Fond : © IGN, Plan IGN", "Background: © IGN, Plan IGN", "Hintergrund: © IGN, Plan IGN", "Fondo: © IGN, Plan IGN")
k("map.bg.credit.osm", "Fond : © les contributeurs d'OpenStreetMap", "Background: © OpenStreetMap contributors", "Hintergrund: © OpenStreetMap-Mitwirkende", "Fondo: © colaboradores de OpenStreetMap")
k("map.bg.calageStart", "Cliquez un point du fond…", "Click a point of the background…", "Klicke einen Punkt des Hintergrunds…", "Haz clic en un punto del fondo…")
k("map.bg.calageTo", "…puis l'endroit où il doit être sur la carte.", "…then where it belongs on the map.", "…dann die Stelle, an die er auf der Karte gehört.", "…y luego el lugar donde va en el mapa.")
k("map.bg.calagePairs.one", "{n} paire ; il en faut au moins deux, puis Entrée.", "{n} pair; at least two are needed, then Enter.", "{n} Paar; mindestens zwei nötig, dann Eingabe.", "{n} par; hacen falta al menos dos, luego Intro.")
k("map.bg.calagePairs.other", "{n} paires ; Entrée pour appliquer.", "{n} pairs; Enter to apply.", "{n} Paare; Eingabe zum Anwenden.", "{n} pares; Intro para aplicar.")
k("map.colors.hint", "Du haut au bas de l'ordre d'impression. Masquer une couleur ne change que l'affichage.", "From the top to the bottom of the printing order. Hiding a colour only changes the display.", "Von oben nach unten in der Druckreihenfolge. Eine Farbe auszublenden ändert nur die Anzeige.", "De arriba abajo en el orden de impresión. Ocultar un color solo cambia la visualización.")
k("map.colors.toggle", "Afficher ou masquer la couleur", "Show or hide the colour", "Farbe ein- oder ausblenden", "Mostrar u ocultar el color")
k("map.colors.overprint", "Simuler la surimpression", "Simulate overprinting", "Überdrucken simulieren", "Simular la sobreimpresión")

# ---- properties ----------------------------------------------------------------------------------------------------------------
k("map.props.title", "Titre", "Title", "Titel", "Título")
k("map.props.scale", "Échelle", "Scale", "Maßstab", "Escala")
k("map.props.scaleHint", "Le dénominateur : 10000 pour 1:10 000.", "The denominator: 10000 for 1:10,000.", "Der Nenner: 10000 für 1:10.000.", "El denominador: 10000 para 1:10.000.")
k("map.props.crs", "Système de coordonnées (EPSG)", "Coordinate system (EPSG)", "Koordinatensystem (EPSG)", "Sistema de coordenadas (EPSG)")
k("map.props.crsHint", "2154 pour Lambert 93 (France), 326xx pour l'UTM du fuseau xx.", "2154 for Lambert 93 (France), 326xx for UTM zone xx.", "2154 für Lambert 93 (Frankreich), 326xx für UTM-Zone xx.", "2154 para Lambert 93 (Francia), 326xx para el huso UTM xx.")
k("map.props.origin", "Origine de la carte (X, Y en mètres)", "Map origin (X, Y in metres)", "Kartenursprung (X, Y in Metern)", "Origen del mapa (X, Y en metros)")
k("map.props.originHint", "Les coordonnées terrain du point 0 ; 0 de la carte.", "The ground coordinates of the map's 0, 0 point.", "Die Geländekoordinaten des Punkts 0, 0 der Karte.", "Las coordenadas del terreno del punto 0, 0 del mapa.")
k("map.props.grivation", "Angle de la grille (degrés)", "Grid angle (degrees)", "Gitterwinkel (Grad)", "Ángulo de la cuadrícula (grados)")
k("map.props.grivationHint", "La rotation de la carte par rapport à la grille, le plus souvent 0.", "The map's rotation against the grid, usually 0.", "Die Drehung der Karte gegenüber dem Gitter, meist 0.", "El giro del mapa respecto a la cuadrícula, casi siempre 0.")
k("map.props.declination", "Déclinaison magnétique (degrés, Est positif)", "Magnetic declination (degrees, east positive)", "Magnetische Deklination (Grad, Ost positiv)", "Declinación magnética (grados, este positivo)")
k("map.props.declinationHint", "Pour les lignes du nord magnétique ; elle se trouve sur les sites des services géodésiques.", "For the magnetic north lines; geodetic agencies publish it.", "Für die magnetischen Nordlinien; geodätische Dienste veröffentlichen sie.", "Para las líneas del norte magnético; la publican los servicios geodésicos.")

# ---- data -------------------------------------------------------------------------------------------------------------------------
k("map.data.area", "Zone", "Area", "Gebiet", "Zona")
k("map.data.area.screen", "Ce que montre l'écran", "What the screen shows", "Was der Bildschirm zeigt", "Lo que muestra la pantalla")
k("map.data.area.print", "La zone d'impression", "The print area", "Den Druckbereich", "La zona de impresión")
k("map.data.area.map", "Toute la carte", "The whole map", "Die ganze Karte", "Todo el mapa")
k("map.data.areaSet", "Zone des données choisie.", "Data area set.", "Datengebiet festgelegt.", "Zona de datos fijada.")
k("map.data.interval", "Équidistance", "Contour interval", "Äquidistanz", "Equidistancia")
k("map.data.contoursHint", "Du modèle de terrain national (IGN en France, swisstopo en Suisse, USGS aux États-Unis, NRCan au Canada, LINZ en Nouvelle-Zélande), ailleurs des tuiles de relief mondiales ; à vérifier sur le terrain.", "From the national terrain model (IGN in France, swisstopo in Switzerland, USGS in the USA, NRCan in Canada, LINZ in New Zealand), elsewhere from worldwide terrain tiles; to be checked in the field.", "Aus dem nationalen Geländemodell (IGN in Frankreich, swisstopo in der Schweiz, USGS in den USA, NRCan in Kanada, LINZ in Neuseeland), sonst aus weltweiten Reliefkacheln; im Gelände zu prüfen.", "Del modelo digital del terreno nacional (IGN en Francia, swisstopo en Suiza, USGS en EE. UU., NRCan en Canadá, LINZ en Nueva Zelanda), en otros lugares de teselas de relieve mundiales; a comprobar sobre el terreno.")
k("map.data.loadingDem", "Lecture des altitudes…", "Reading the heights…", "Höhen werden gelesen…", "Leyendo las altitudes…")
k("map.data.kind", "Type de carte", "Kind of map", "Kartentyp", "Tipo de mapa")
k("map.data.kind.sprint", "Carte sprint (ISSprOM 2019-2)", "Sprint map (ISSprOM 2019-2)", "Sprintkarte (ISSprOM 2019-2)", "Mapa de sprint (ISSprOM 2019-2)")
k("map.data.kind.forest", "Carte forêt (ISOM 2017-2)", "Forest map (ISOM 2017-2)", "Waldkarte (ISOM 2017-2)", "Mapa de bosque (ISOM 2017-2)")
k("map.data.needKind", "Choisissez sprint ou forêt.", "Choose sprint or forest.", "Wähle Sprint oder Wald.", "Elige sprint o bosque.")
k("map.data.contoursSprint", "Carte de sprint : le sol lissé sur 4 m, chaque courbe arrondie, les boucles de moins de 600 m² et les courbes ouvertes de moins de 40 m laissées de côté, chaque courbe coupée aux bâtiments de la carte — comme le plan de ville.", "Sprint map: the ground smoothed over 4 m, each contour rounded, loops under 600 m² and open lines under 40 m left out, each contour cut at the map's buildings — as the town plan does.", "Sprintkarte: der Boden über 4 m geglättet, jede Höhenlinie gerundet, Schleifen unter 600 m² und offene Linien unter 40 m weggelassen, jede Höhenlinie an den Gebäuden der Karte geschnitten — wie beim Stadtplan.", "Mapa de sprint: el terreno suavizado en 4 m, cada curva redondeada, los bucles de menos de 600 m² y las curvas abiertas de menos de 40 m descartados, cada curva cortada en los edificios del mapa, como en el plano urbano.")
k("map.data.lidarHint", "Le LiDAR national (IGN en France, swisstopo en Suisse, USGS aux États-Unis, NRCan au Canada, LINZ en Nouvelle-Zélande) traité par karttapullautin : quelques minutes pour les tuiles qui ne sont pas encore prêtes, davantage hors de France.", "The national LiDAR (IGN in France, swisstopo in Switzerland, USGS in the USA, NRCan in Canada, LINZ in New Zealand) processed by karttapullautin: a few minutes for tiles not made yet, longer outside France.", "Das nationale LiDAR (IGN in Frankreich, swisstopo in der Schweiz, USGS in den USA, NRCan in Kanada, LINZ in Neuseeland), verarbeitet mit karttapullautin: einige Minuten für noch nicht erstellte Kacheln, außerhalb Frankreichs länger.", "El LiDAR nacional (IGN en Francia, swisstopo en Suiza, USGS en EE. UU., NRCan en Canadá, LINZ en Nueva Zelanda) procesado con karttapullautin: unos minutos para las teselas aún no hechas, más fuera de Francia.")
k("map.data.csrc.dem", "du modèle de terrain", "from the terrain model", "aus dem Geländemodell", "del modelo del terreno")
k("map.data.csrc.town", "du plan de ville", "from the town plan", "aus dem Stadtplan", "del plano urbano")
k("map.data.csrc.lidar", "du LiDAR", "from the LiDAR", "aus dem LiDAR", "del LiDAR")
k("map.data.contoursReplace.one", "Le brouillon a déjà {n} courbe de niveau venue {from}. La remplacer par celles {to}, pour ne garder qu'un jeu de courbes ?", "The draft already holds {n} contour {from}. Replace it with those {to}, so as to keep one set of contours?", "Der Entwurf enthält schon {n} Höhenlinie {from}. Durch die {to} ersetzen, damit nur ein Satz Höhenlinien bleibt?", "El borrador ya tiene {n} curva de nivel {from}. ¿Sustituirla por las {to}, para conservar un solo juego de curvas?")
k("map.data.contoursReplace.other", "Le brouillon a déjà {n} courbes de niveau venues {from}. Les remplacer par celles {to}, pour ne garder qu'un jeu de courbes ?", "The draft already holds {n} contours {from}. Replace them with those {to}, so as to keep one set of contours?", "Der Entwurf enthält schon {n} Höhenlinien {from}. Durch die {to} ersetzen, damit nur ein Satz Höhenlinien bleibt?", "El borrador ya tiene {n} curvas de nivel {from}. ¿Sustituirlas por las {to}, para conservar un solo juego de curvas?")
k("map.data.contoursReplaceOk", "Remplacer", "Replace", "Ersetzen", "Sustituir")
k("map.data.contoursKeep", "Garder les anciennes", "Keep the old ones", "Die alten behalten", "Conservar las anteriores")
k("map.data.lidar.interval", "Équidistance des courbes", "Contour interval", "Äquidistanz", "Equidistancia de las curvas")
k("map.data.lidar.m", "{m} m", "{m} m", "{m} m", "{m} m")
k("map.data.lidar.default", "par défaut", "default", "Standard", "por defecto")
k("map.data.lidar.intervalHint.sprint", "ISSprOM 2019-2 : 2 ou 2,5 m. Une équidistance pas encore calculée pour ces dalles demande quelques minutes de plus.", "ISSprOM 2019-2: 2 or 2.5 m. An interval not yet computed for these tiles takes a few more minutes.", "ISSprOM 2019-2: 2 oder 2,5 m. Eine für diese Kacheln noch nicht berechnete Äquidistanz braucht einige Minuten mehr.", "ISSprOM 2019-2: 2 o 2,5 m. Una equidistancia aún no calculada para estas teselas tarda unos minutos más.")
k("map.data.lidar.intervalHint.forest", "ISOM 2017-2 : 5 m, ou 2,5 m en terrain plat. Une équidistance pas encore calculée pour ces dalles demande quelques minutes de plus.", "ISOM 2017-2: 5 m, or 2.5 m in flat terrain. An interval not yet computed for these tiles takes a few more minutes.", "ISOM 2017-2: 5 m, oder 2,5 m in flachem Gelände. Eine für diese Kacheln noch nicht berechnete Äquidistanz braucht einige Minuten mehr.", "ISOM 2017-2: 5 m, o 2,5 m en terreno llano. Una equidistancia aún no calculada para estas teselas tarda unos minutos más.")
k("map.data.lidar.helpers", "Courbes d'aide denses (tous les 0,5 m, ou tous les mètres sous des courbes de 5 m), en violet clair, dans une partie à part qu'on peut masquer, jamais imprimées : pour dessiner les courbes de forme à la main", "Dense helper contours (every 0.5 m, or every metre under 5 m contours), in light violet, in a part of their own you can hide, never printed: for drawing form lines by hand", "Dichte Hilfshöhenlinien (alle 0,5 m, unter 5-m-Höhenlinien jeden Meter), hellviolett, in einem eigenen, ausblendbaren Teil, nie gedruckt: zum Zeichnen der Formlinien von Hand", "Curvas de ayuda densas (cada 0,5 m, o cada metro bajo curvas de 5 m), en violeta claro, en una parte propia que se puede ocultar, nunca impresas: para dibujar a mano las curvas auxiliares")
k("map.data.lidar.credit", "Le relief, les falaises et la végétation sont calculés par karttapullautin, le logiciel libre (GPL-3) de Jarkko Ryyppö — celui de MapAnt —, exécuté tel quel sur les serveurs de calcul d'Ozimut.", "The relief, cliffs and vegetation are computed by karttapullautin, Jarkko Ryyppö's free software (GPL-3) — MapAnt's tool —, run as it is on Ozimut's computing servers.", "Relief, Felsen und Vegetation berechnet karttapullautin, die freie Software (GPL-3) von Jarkko Ryyppö — das Werkzeug von MapAnt —, unverändert auf den Rechenservern von Ozimut ausgeführt.", "El relieve, los cortados y la vegetación los calcula karttapullautin, el software libre (GPL-3) de Jarkko Ryyppö — el de MapAnt —, ejecutado tal cual en los servidores de cálculo de Ozimut.")
k("map.data.lidar.helpersIn.one", "{n} courbe d'aide dans la partie « Courbes d'aide (LiDAR) »", "{n} helper contour in the « Helper contours (LiDAR) » part", "{n} Hilfshöhenlinie im Teil „Hilfshöhenlinien (LiDAR)“", "{n} curva de ayuda en la parte «Curvas de ayuda (LiDAR)»")
k("map.data.lidar.helpersIn.other", "{n} courbes d'aide dans la partie « Courbes d'aide (LiDAR) »", "{n} helper contours in the « Helper contours (LiDAR) » part", "{n} Hilfshöhenlinien im Teil „Hilfshöhenlinien (LiDAR)“", "{n} curvas de ayuda en la parte «Curvas de ayuda (LiDAR)»")
k("map.data.kp.title", "Réglages de karttapullautin", "karttapullautin's settings", "Einstellungen von karttapullautin", "Ajustes de karttapullautin")
k("map.data.kp.lede", "Chaque dalle est calculée une fois avec ces réglages et sert ensuite à tous les cartographes : seule l'équidistance (et avec elle les courbes d'aide) se choisit. Les autres valeurs sont celles de karttapullautin 2.15.4.", "Each tile is computed once with these settings and then serves every mapper: only the contour interval (and with it the helper contours) can be chosen. The other values are karttapullautin 2.15.4's own.", "Jede Kachel wird einmal mit diesen Einstellungen berechnet und dient dann allen Kartografen: Nur die Äquidistanz (und mit ihr die Hilfshöhenlinien) ist wählbar. Die übrigen Werte sind die von karttapullautin 2.15.4.", "Cada tesela se calcula una vez con estos ajustes y luego sirve a todos los cartógrafos: solo se elige la equidistancia (y con ella las curvas de ayuda). Los demás valores son los de karttapullautin 2.15.4.")
k("map.data.kp.setting", "Réglage", "Setting", "Einstellung", "Ajuste")
k("map.data.kp.value", "Valeur", "Value", "Wert", "Valor")
k("map.data.kp.what", "Ce qu'il fait", "What it does", "Wirkung", "Qué hace")
k("map.data.kp.auto", "≈ 6 points par m²", "≈ 6 points per m²", "≈ 6 Punkte pro m²", "≈ 6 puntos por m²")
k("map.data.kp.contour_interval", "Équidistance : {iv}. Sans courbes de forme (sprint), karttapullautin trace une courbe tous les contour_interval ÷ 2 × scalefactor mètres, d'où la valeur écrite.", "Contour interval: {iv}. Without form lines (sprint), karttapullautin draws a contour every contour_interval ÷ 2 × scalefactor metres, hence the value written.", "Äquidistanz: {iv}. Ohne Formlinien (Sprint) zeichnet karttapullautin alle contour_interval ÷ 2 × scalefactor Meter eine Höhenlinie, daher der eingetragene Wert.", "Equidistancia: {iv}. Sin curvas auxiliares (sprint), karttapullautin traza una curva cada contour_interval ÷ 2 × scalefactor metros, de ahí el valor escrito.")
k("map.data.kp.formline", "Courbes de forme : 2 = à mi-équidistance, là où le relief le demande ; 0 = aucune", "Form lines: 2 = at half the interval, where the relief calls for them; 0 = none", "Formlinien: 2 = bei halber Äquidistanz, wo das Relief sie verlangt; 0 = keine", "Curvas auxiliares: 2 = a media equidistancia, donde el relieve las pide; 0 = ninguna")
k("map.data.kp.formlinesteepness", "Plus la valeur est grande, plus il y a de courbes de forme", "The larger the value, the more form lines", "Je größer der Wert, desto mehr Formlinien", "Cuanto mayor el valor, más curvas auxiliares")
k("map.data.kp.indexcontours", "Courbes maîtresses, une courbe sur cinq (en mètres)", "Index contours, every fifth contour (in metres)", "Zählkurven, jede fünfte Höhenlinie (in Metern)", "Curvas maestras, una de cada cinco (en metros)")
k("map.data.kp.basemapinterval", "Courbes d'aide tous les {h} (la couche « basemap » de karttapullautin)", "Helper contours every {h} (karttapullautin's « basemap » layer)", "Hilfshöhenlinien alle {h} (die Ebene „basemap“ von karttapullautin)", "Curvas de ayuda cada {h} (la capa «basemap» de karttapullautin)")
k("map.data.kp.thinfactor", "Part des points lus, réglée sur la densité de chaque nuage pour en garder environ 6 par m² (en France 15 à 20 % : même végétation et mêmes courbes, quelques petites falaises de moins, nettement plus rapide)", "Share of the points read, set from each cloud's density to keep about 6 per m² (in France 15 to 20 %: the same vegetation and contours, a few small cliffs fewer, much faster)", "Anteil der gelesenen Punkte, nach der Dichte jeder Punktwolke so gewählt, dass etwa 6 pro m² bleiben (in Frankreich 15 bis 20 %: gleiche Vegetation und Höhenlinien, ein paar kleine Felsen weniger, deutlich schneller)", "Parte de los puntos leídos, ajustada a la densidad de cada nube para conservar unos 6 por m² (en Francia del 15 al 20 %: la misma vegetación y las mismas curvas, algunos cortados pequeños menos, mucho más rápido)")
k("map.data.kp.scalefactor", "Dessin à 1:4 000 au lieu de 1:10 000 : traits et falaises 2,5 fois plus fins sur le terrain", "Drawn at 1:4,000 instead of 1:10,000: lines and cliffs 2.5 times finer on the ground", "Gezeichnet in 1:4 000 statt 1:10 000: Linien und Felsen im Gelände 2,5-mal feiner", "Dibujo a 1:4000 en lugar de 1:10 000: líneas y cortados 2,5 veces más finos sobre el terreno")
k("map.data.kp.remove_touching_contours", "Retire les courbes trop serrées pour être distinguées (talus, remparts)", "Leaves out contours too close to be told apart (banks, ramparts)", "Lässt Höhenlinien weg, die zu dicht sind, um sie zu unterscheiden (Böschungen, Wälle)", "Quita las curvas demasiado juntas para distinguirlas (taludes, murallas)")
k("map.data.kp.smoothing", "Lissage des courbes (plus grand : plus lisses)", "Smoothing of the contours (larger: smoother)", "Glättung der Höhenlinien (größer: glatter)", "Suavizado de las curvas (mayor: más suaves)")
k("map.data.kp.curviness", "Accentuation des rentrants et des éperons", "How much re-entrants and spurs are stressed", "Betonung von Rinnen und Sporen", "Acentuación de vaguadas y espolones")
k("map.data.kp.knolls", "Sélection des buttes, de 0 à 1 (plus grand : moins de buttes, plus nettes)", "Selection of the knolls, 0 to 1 (larger: fewer, more distinct knolls)", "Auswahl der Kuppen, 0 bis 1 (größer: weniger, deutlichere Kuppen)", "Selección de los montículos, de 0 a 1 (mayor: menos montículos, más nítidos)")
k("map.data.kp.cliff1", "Pente d'une falaise franchissable (mètres de dénivelé par mètre)", "Slope of a passable cliff (metres of drop per metre)", "Neigung eines passierbaren Felsens (Meter Höhenunterschied pro Meter)", "Pendiente de un cortado franqueable (metros de desnivel por metro)")
k("map.data.kp.cliff2", "Pente d'une falaise infranchissable", "Slope of an impassable cliff", "Neigung eines unpassierbaren Felsens", "Pendiente de un cortado infranqueable")
k("map.data.kp.yellowheight", "Hauteur (m) sous laquelle un retour compte pour le terrain découvert", "Height (m) under which a return counts for open land", "Höhe (m), unter der ein Echo als offenes Gelände zählt", "Altura (m) por debajo de la cual un retorno cuenta como terreno abierto")
k("map.data.kp.yellowthresold", "Part des retours sous cette hauteur qui donne du jaune", "Share of the returns under that height that gives yellow", "Anteil der Echos unter dieser Höhe, der Gelb ergibt", "Parte de los retornos bajo esa altura que da amarillo")
k("map.data.kp.greenground", "Hauteur (m) sous laquelle un retour compte comme sol pour la végétation", "Height (m) under which a return counts as ground for the vegetation", "Höhe (m), unter der ein Echo für die Vegetation als Boden zählt", "Altura (m) por debajo de la cual un retorno cuenta como suelo para la vegetación")
k("map.data.kp.greenhigh", "Hauteur (m) jusqu'où la végétation basse compte pour le vert", "Height (m) up to which low vegetation counts for green", "Höhe (m), bis zu der niedrige Vegetation für Grün zählt", "Altura (m) hasta la que la vegetación baja cuenta para el verde")
k("map.data.kp.undergrowth", "Seuil des rayures de sous-bois (plus petit : plus de rayures)", "Threshold of the undergrowth stripes (smaller: more stripes)", "Schwelle der Unterwuchs-Streifen (kleiner: mehr Streifen)", "Umbral de las rayas de sotobosque (menor: más rayas)")
k("map.data.nogeo", "La carte doit être géoréférencée pour recevoir des données (Fichier › Propriétés).", "The map must be georeferenced to receive data (File › Properties).", "Die Karte muss georeferenziert sein, um Daten aufzunehmen (Datei › Eigenschaften).", "El mapa debe estar georreferenciado para recibir datos (Archivo › Propiedades).")
k("map.data.tooLarge", "La zone est trop grande pour le LiDAR : réduisez-la.", "The area is too large for the LiDAR: make it smaller.", "Das Gebiet ist zu groß für das LiDAR: verkleinere es.", "La zona es demasiado grande para el LiDAR: redúcela.")
k("map.data.missing", "Symboles absents de la carte, objets laissés de côté : {list}. Ajoutez le jeu de symboles de l'IOF (Mise en page › Jeu de symboles).", "Symbols missing from the map, objects left out: {list}. Add the IOF symbol set (Layout › Symbol set).", "Signaturen fehlen in der Karte, Objekte ausgelassen: {list}. Füge den IOF-Signaturensatz hinzu (Layout › Signaturensatz).", "Símbolos ausentes del mapa, objetos omitidos: {list}. Añade el juego de símbolos de la IOF (Maquetación › Juego de símbolos).")
k("map.data.brought.one", "{n} objet ajouté en brouillon", "{n} object added as a draft", "{n} Objekt als Entwurf hinzugefügt", "{n} objeto añadido como borrador")
k("map.data.brought.other", "{n} objets ajoutés en brouillon", "{n} objects added as drafts", "{n} Objekte als Entwurf hinzugefügt", "{n} objetos añadidos como borrador")
k("map.data.accepted.one", "{n} objet accepté", "{n} object accepted", "{n} Objekt übernommen", "{n} objeto aceptado")
k("map.data.accepted.other", "{n} objets acceptés", "{n} objects accepted", "{n} Objekte übernommen", "{n} objetos aceptados")
k("map.data.rejectAll.one", "Aucun objet n'est choisi : rejeter tout le brouillon ({n} objet) ? Il sera supprimé de la carte.", "Nothing is selected: reject the whole draft ({n} object)? It will be deleted from the map.", "Nichts ist gewählt: den ganzen Entwurf verwerfen ({n} Objekt)? Es wird aus der Karte gelöscht.", "No hay nada seleccionado: ¿rechazar todo el borrador ({n} objeto)? Se borrará del mapa.")
k("map.data.rejectAll.other", "Aucun objet n'est choisi : rejeter tout le brouillon ({n} objets) ? Ils seront supprimés de la carte.", "Nothing is selected: reject the whole draft ({n} objects)? They will be deleted from the map.", "Nichts ist gewählt: den ganzen Entwurf verwerfen ({n} Objekte)? Sie werden aus der Karte gelöscht.", "No hay nada seleccionado: ¿rechazar todo el borrador ({n} objetos)? Se borrarán del mapa.")
k("map.data.rejected.one", "{n} objet rejeté", "{n} object rejected", "{n} Objekt verworfen", "{n} objeto rechazado")
k("map.data.rejected.other", "{n} objets rejetés", "{n} objects rejected", "{n} Objekte verworfen", "{n} objetos rechazados")
k("map.data.noVectors.one", "{n} tuile faite avant les vecteurs : seulement son image", "{n} tile made before vectors: its image only", "{n} Kachel vor den Vektoren erstellt: nur ihr Bild", "{n} tesela hecha antes de los vectores: solo su imagen")
k("map.data.noVectors.other", "{n} tuiles faites avant les vecteurs : seulement leur image", "{n} tiles made before vectors: their images only", "{n} Kacheln vor den Vektoren erstellt: nur ihre Bilder", "{n} teselas hechas antes de los vectores: solo sus imágenes")
k("map.data.osm.credit", "© les contributeurs d'OpenStreetMap (ODbL)", "© OpenStreetMap contributors (ODbL)", "© OpenStreetMap-Mitwirkende (ODbL)", "© colaboradores de OpenStreetMap (ODbL)")
k("map.data.osm.asking", "Demande à OpenStreetMap…", "Asking OpenStreetMap…", "OpenStreetMap wird abgefragt…", "Consultando OpenStreetMap…")
k("map.data.osm.reading", "Lecture des objets d'OpenStreetMap…", "Reading OpenStreetMap's features…", "OpenStreetMap-Objekte werden gelesen…", "Leyendo los objetos de OpenStreetMap…")

# ---- field --------------------------------------------------------------------------------------------------------------------------
k("map.field.needGeo", "La carte doit être géoréférencée pour montrer votre position.", "The map must be georeferenced to show your position.", "Die Karte muss georeferenziert sein, um deine Position zu zeigen.", "El mapa debe estar georreferenciado para mostrar tu posición.")
k("map.field.noGps", "Cet appareil ne donne pas sa position.", "This device does not give its position.", "Dieses Gerät gibt seine Position nicht an.", "Este dispositivo no da su posición.")
k("map.field.waiting", "Recherche de la position…", "Finding the position…", "Position wird gesucht…", "Buscando la posición…")
k("map.field.acc", "Position à ± {m} m", "Position within ± {m} m", "Position auf ± {m} m", "Posición a ± {m} m")
k("map.field.denied", "La position n'est pas autorisée pour ce site (réglages du navigateur).", "Location is not allowed for this site (browser settings).", "Der Standort ist für diese Seite nicht erlaubt (Browsereinstellungen).", "La ubicación no está permitida para este sitio (ajustes del navegador).")
k("map.field.noFix", "Position introuvable pour l'instant.", "No position for now.", "Im Moment keine Position.", "Sin posición por ahora.")
k("map.field.noCompass", "La boussole n'est pas disponible.", "The compass is not available.", "Der Kompass ist nicht verfügbar.", "La brújula no está disponible.")
k("map.field.recording", "Enregistrement de la trace ; touchez à nouveau pour l'arrêter.", "Recording the track; tap again to stop.", "Spur wird aufgezeichnet; erneut tippen zum Beenden.", "Grabando el track; toca de nuevo para pararlo.")
k("map.field.trackShort", "Trace trop courte : rien de gardé.", "Track too short: nothing kept.", "Spur zu kurz: nichts behalten.", "Track demasiado corto: no se guarda nada.")
k("map.field.gps", "GPS ± {m} m", "GPS ± {m} m", "GPS ± {m} m", "GPS ± {m} m")
k("map.field.outside", "Vous êtes à {d} de la carte : la vue reste sur la carte.", "You are {d} from the map: the view stays on the map.", "Du bist {d} von der Karte entfernt: Die Ansicht bleibt auf der Karte.", "Estás a {d} del mapa: la vista se queda en el mapa.")
k("map.field.recBusy", "La trace s'enregistre : arrêtez-la d'abord (Terrain › Enregistrer la trace).", "The track is being recorded: stop it first (Field › Record track).", "Die Spur wird aufgezeichnet: Beende sie zuerst (Gelände › Spur aufzeichnen).", "El track se está grabando: páralo primero (Terreno › Grabar el track).")
k("map.field.trackKept", "Trace gardée parmi les fonds ({d}).", "Track kept among the backgrounds ({d}).", "Spur bei den Hintergründen abgelegt ({d}).", "Track guardado entre los fondos ({d}).")
k("map.comment.delete", "Supprimer la note", "Delete the note", "Notiz löschen", "Eliminar la nota")
k("map.field.trackName", "Trace de terrain", "Field track", "Geländespur", "Track de campo")
k("map.comment.title", "Note sur la carte", "Note on the map", "Notiz auf der Karte", "Nota en el mapa")
k("map.comment.text", "Note", "Note", "Notiz", "Nota")
k("map.comment.where", "Indiquez sur la carte où placer la note.", "Point on the map where the note goes.", "Zeige auf der Karte, wo die Notiz hin soll.", "Indica en el mapa dónde va la nota.")
k("map.comment.later", "La note sera envoyée quand le réseau reviendra.", "The note will be sent when the network returns.", "Die Notiz wird gesendet, sobald das Netz zurück ist.", "La nota se enviará cuando vuelva la red.")
k("map.comment.none", "Aucun commentaire.", "No comments.", "Keine Kommentare.", "No hay comentarios.")
k("map.comment.go", "Voir sur la carte", "Show on the map", "Auf der Karte zeigen", "Ver en el mapa")
k("map.comment.done", "Traité", "Done", "Erledigt", "Hecho")
k("map.comment.reopen", "À reprendre", "Reopen", "Wieder öffnen", "Reabrir")
k("map.off.noSupport", "Ce navigateur ne peut pas garder le site hors ligne.", "This browser cannot keep the site offline.", "Dieser Browser kann die Seite nicht offline behalten.", "Este navegador no puede guardar el sitio sin conexión.")
k("map.off.preparing", "Préparation de la carte hors ligne…", "Preparing the map for offline use…", "Karte wird für die Offline-Nutzung vorbereitet…", "Preparando el mapa sin conexión…")
k("map.off.kept", "Carte gardée sur cet appareil : elle s'ouvre sans réseau, et vos modifications partent dès qu'il revient.", "Map kept on this device: it opens without the network, and your changes go as soon as it returns.", "Karte auf diesem Gerät behalten: Sie öffnet sich ohne Netz, und deine Änderungen werden gesendet, sobald es zurück ist.", "Mapa guardado en este dispositivo: se abre sin red y tus cambios se envían en cuanto vuelve.")

# ---- checks, statistics ----------------------------------------------------------------------------------------------------------
k("map.chk.unknown", "Symbole {n} absent de la carte", "Symbol {n} missing from the map", "Signatur {n} fehlt in der Karte", "Símbolo {n} ausente del mapa")
k("map.chk.points", "Objet avec trop peu de points", "Object with too few points", "Objekt mit zu wenigen Punkten", "Objeto con muy pocos puntos")
k("map.chk.dup", "Objet en double", "Duplicate object", "Doppeltes Objekt", "Objeto duplicado")
k("map.chk.draft", "Encore en brouillon", "Still a draft", "Noch Entwurf", "Todavía en borrador")
k("map.chk.area", "{s} : {a} mm², minimum {min} mm²", "{s}: {a} mm², minimum {min} mm²", "{s}: {a} mm², Minimum {min} mm²", "{s}: {a} mm², mínimo {min} mm²")
k("map.chk.length", "{s} : {l} mm, minimum {min} mm", "{s}: {l} mm, minimum {min} mm", "{s}: {l} mm, Minimum {min} mm", "{s}: {l} mm, mínimo {min} mm")
k("map.chk.contour", "Courbes à moins de {min} mm l'une de l'autre", "Contours less than {min} mm apart", "Höhenlinien weniger als {min} mm voneinander", "Curvas a menos de {min} mm una de otra")
k("map.chk.gap", "Éléments infranchissables à {d} mm l'un de l'autre, minimum {min} mm : fermer ou élargir le passage", "Impassable features {d} mm apart, minimum {min} mm: close or widen the gap", "Unpassierbare Objekte {d} mm voneinander, Minimum {min} mm: Lücke schließen oder verbreitern", "Elementos infranqueables a {d} mm uno de otro, mínimo {min} mm: cerrar o ensanchar el paso")
k("map.chk.pathPaved", "{s} tracé sur une surface revêtue ({l} mm)", "{s} drawn on paving ({l} mm)", "{s} auf befestigter Fläche gezeichnet ({l} mm)", "{s} dibujado sobre una superficie pavimentada ({l} mm)")
k("map.chk.stairs", "Escalier hors d'une surface revêtue ({p} % dessus)", "Stairway off paving ({p} % on it)", "Treppe außerhalb befestigter Fläche ({p} % darauf)", "Escalera fuera de una superficie pavimentada ({p} % encima)")
k("map.chk.found.one", "{n} point à revoir", "{n} point to review", "{n} Punkt zu prüfen", "{n} punto que revisar")
k("map.chk.found.other", "{n} points à revoir", "{n} points to review", "{n} Punkte zu prüfen", "{n} puntos que revisar")
k("map.chk.none", "Aucun problème trouvé.", "No problems found.", "Keine Probleme gefunden.", "No se encontraron problemas.")
k("map.chk.again", "Vérifier à nouveau", "Check again", "Erneut prüfen", "Comprobar de nuevo")
k("map.stats.objects.one", "{n} objet", "{n} object", "{n} Objekt", "{n} objeto")
k("map.stats.objects.other", "{n} objets", "{n} objects", "{n} Objekte", "{n} objetos")
k("map.stats.n", "N°", "No.", "Nr.", "N.º")
k("map.stats.symbol", "Symbole", "Symbol", "Signatur", "Símbolo")
k("map.stats.count", "Objets", "Objects", "Objekte", "Objetos")
k("map.stats.length", "Longueur", "Length", "Länge", "Longitud")
k("map.stats.area", "Surface", "Area", "Fläche", "Superficie")

# ---- layout ------------------------------------------------------------------------------------------------------------------
k("map.lay.paper", "Zone", "Area", "Bereich", "Zona")
k("map.lay.draw", "La tracer sur la carte", "Draw it on the map", "Auf der Karte ziehen", "Trazarla en el mapa")
k("map.lay.fit", "Autour de toute la carte", "Around the whole map", "Um die ganze Karte", "Alrededor de todo el mapa")
k("map.lay.twoClicks", "Cliquez deux coins opposés.", "Click two opposite corners.", "Klicke zwei gegenüberliegende Ecken.", "Haz clic en dos esquinas opuestas.")
k("map.lay.noNorthSymbol", "La carte n'a pas de symbole 601 (ligne du nord magnétique) : ajoutez le jeu de symboles de l'IOF.", "The map has no symbol 601 (magnetic north line): add the IOF symbol set.", "Die Karte hat keine Signatur 601 (magnetische Nordlinie): Füge den IOF-Signaturensatz hinzu.", "El mapa no tiene el símbolo 601 (línea del norte magnético): añade el juego de símbolos de la IOF.")
k("map.lay.spacing", "Espacement (mm sur la carte)", "Spacing (mm on the map)", "Abstand (mm auf der Karte)", "Separación (mm en el mapa)")
k("map.lay.spacingHint", "Les spécifications : 30 mm à 1:15 000 et 1:10 000, 20 mm en sprint.", "The specifications: 30 mm at 1:15,000 and 1:10,000, 20 mm for sprint.", "Die Spezifikationen: 30 mm bei 1:15.000 und 1:10.000, 20 mm im Sprint.", "Las especificaciones: 30 mm a 1:15.000 y 1:10.000, 20 mm en sprint.")
k("map.lay.where", "Cliquez où placer l'élément.", "Click where to place the element.", "Klicke, wo das Element hin soll.", "Haz clic donde colocar el elemento.")
k("map.lay.nothingUsed", "Aucun symbole n'est encore utilisé.", "No symbol is used yet.", "Noch keine Signatur verwendet.", "Todavía no se usa ningún símbolo.")
k("map.lay.noText", "La carte n'a pas de symbole de texte.", "The map has no text symbol.", "Die Karte hat keine Textsignatur.", "El mapa no tiene ningún símbolo de texto.")
k("map.lay.creditLidar", "Relief : {src}, LiDAR traité par karttapullautin", "Relief: {src}, LiDAR processed by karttapullautin", "Relief: {src}, LiDAR verarbeitet mit karttapullautin", "Relieve: {src}, LiDAR procesado con karttapullautin")
k("map.lay.creditDem", "Courbes : modèle numérique de terrain national (IGN, swisstopo, USGS 3DEP, NRCan HRDEM, LINZ) ou Mapzen / AWS Terrain Tiles", "Contours: national terrain model (IGN, swisstopo, USGS 3DEP, NRCan HRDEM, LINZ) or Mapzen / AWS Terrain Tiles", "Höhenlinien: nationales Geländemodell (IGN, swisstopo, USGS 3DEP, NRCan HRDEM, LINZ) oder Mapzen / AWS Terrain Tiles", "Curvas: modelo digital del terreno nacional (IGN, swisstopo, USGS 3DEP, NRCan HRDEM, LINZ) o Mapzen / AWS Terrain Tiles")
k("map.lay.creditBdtopo", "© IGN, BD TOPO", "© IGN, BD TOPO", "© IGN, BD TOPO", "© IGN, BD TOPO")
k("map.lay.creditOzimut", "Carte dessinée avec Ozimut — ozimut.com", "Map drawn with Ozimut — ozimut.com", "Karte gezeichnet mit Ozimut — ozimut.com", "Mapa dibujado con Ozimut — ozimut.com")
k("map.lay.qrUrl", "Adresse du code", "Address in the code", "Adresse im Code", "Dirección del código")
k("map.lay.set", "Jeu de symboles", "Symbol set", "Signaturensatz", "Juego de símbolos")
k("map.lay.setHow", "Les symboles déjà dans la carte", "Symbols already in the map", "Signaturen, die schon in der Karte sind", "Los símbolos que ya están en el mapa")
k("map.lay.setAdd", "Les garder ; ajouter seulement ceux qui manquent", "Keep them; add only the missing ones", "Behalten; nur fehlende hinzufügen", "Conservarlos; añadir solo los que faltan")
k("map.lay.setReplace", "Les remplacer par ceux des spécifications", "Replace them with the specification's", "Durch die der Spezifikation ersetzen", "Sustituirlos por los de la especificación")
k("map.lay.setDone", "{a} symboles ajoutés, {r} remplacés.", "{a} symbols added, {r} replaced.", "{a} Signaturen hinzugefügt, {r} ersetzt.", "{a} símbolos añadidos, {r} sustituidos.")
k("map.lay.noSet", "Le jeu de symboles n'a pas pu être chargé.", "The symbol set could not be loaded.", "Der Signaturensatz konnte nicht geladen werden.", "No se pudo cargar el juego de símbolos.")

# ---- files ------------------------------------------------------------------------------------------------------------------------
k("map.io.ocdVersion", "Version d'OCAD", "OCAD version", "OCAD-Version", "Versión de OCAD")
k("map.io.ocdSame", "OCAD {v} (celle du fichier d'origine)", "OCAD {v} (the source file's)", "OCAD {v} (die der Ausgangsdatei)", "OCAD {v} (la del archivo de origen)")
k("map.io.ocdHint", "Dans la version du fichier d'origine, tout ce que vous n'avez pas modifié est écrit octet pour octet comme il était.", "In the source file's version, everything you did not change is written byte for byte as it was.", "In der Version der Ausgangsdatei wird alles Unveränderte Byte für Byte so geschrieben, wie es war.", "En la versión del archivo de origen, todo lo que no hayas modificado se escribe byte a byte como estaba.")
k("map.io.writing", "Écriture du fichier…", "Writing the file…", "Datei wird geschrieben…", "Escribiendo el archivo…")
k("map.io.written", "Fichier enregistré.", "File saved.", "Datei gespeichert.", "Archivo guardado.")
k("map.io.color", "Couleurs", "Colours", "Farben", "Colores")
k("map.io.cmyk", "CMJN, pour l'imprimeur", "CMYK, for the printer", "CMYK, für die Druckerei", "CMYK, para la imprenta")
k("map.io.rgb", "RVB, pour l'écran et les imprimantes de bureau", "RGB, for screens and office printers", "RGB, für Bildschirme und Bürodrucker", "RGB, para pantallas e impresoras de oficina")
k("map.io.dpi", "Résolution", "Resolution", "Auflösung", "Resolución")
k("map.io.tooLarge", "Image trop grande : baissez la résolution ou la zone d'impression.", "Image too large: lower the resolution or the print area.", "Bild zu groß: Auflösung oder Druckbereich verkleinern.", "Imagen demasiado grande: baja la resolución o la zona de impresión.")
k("map.ocad.version", "Cartographier ne sait pas écrire la version {v} d'OCAD (9, 10, 11, 12 ou 2018).", "Cartographier cannot write OCAD version {v} (9, 10, 11, 12 or 2018).", "Cartographier kann OCAD-Version {v} nicht schreiben (9, 10, 11, 12 oder 2018).", "Cartographier no puede escribir la versión {v} de OCAD (9, 10, 11, 12 o 2018).")
k("map.ocad.notOcad", "Le fichier d'origine n'est pas un fichier OCAD.", "The source file is not an OCAD file.", "Die Ausgangsdatei ist keine OCAD-Datei.", "El archivo de origen no es un archivo OCAD.")
k("map.omap.notOmap", "Ce fichier n'est pas une carte OpenOrienteering Mapper.", "This file is not an OpenOrienteering Mapper map.", "Diese Datei ist keine OpenOrienteering-Mapper-Karte.", "Este archivo no es un mapa de OpenOrienteering Mapper.")
k("map.omap.version", "Version {v} du format de Mapper non lue (6 à 9).", "Mapper format version {v} not read (6 to 9).", "Mapper-Formatversion {v} wird nicht gelesen (6 bis 9).", "Versión {v} del formato de Mapper no leída (6 a 9).")
k("map.omap.badXml", "Le fichier Mapper est illisible (XML invalide).", "The Mapper file cannot be read (invalid XML).", "Die Mapper-Datei ist unlesbar (ungültiges XML).", "El archivo de Mapper es ilegible (XML no válido).")

# ---- team -----------------------------------------------------------------------------------------------------------------------
k("map.team.invite", "Inviter dans l'équipe", "Invite to the team", "Ins Team einladen", "Invitar al equipo")
k("map.team.role", "Rôle", "Role", "Rolle", "Rol")
k("map.team.mapper", "cartographe (modifie)", "mapper (edits)", "Kartograf (bearbeitet)", "cartógrafo (edita)")
k("map.team.viewer", "lecteur (lit et commente)", "viewer (reads and comments)", "Leser (liest und kommentiert)", "lector (lee y comenta)")
k("map.team.owner", "propriétaire", "owner", "Eigentümer", "propietario")
k("map.team.days", "Lien valable (jours)", "Link valid for (days)", "Link gültig (Tage)", "Enlace válido (días)")
k("map.team.inviteHint", "Personne n'est cherché par son nom ni son e-mail : transmettez le lien comme vous le souhaitez ; qui l'ouvre connecté rejoint la carte.", "Nobody is looked up by name or e-mail: pass the link on as you like; whoever opens it signed in joins the map.", "Niemand wird über Name oder E-Mail gesucht: Gib den Link weiter, wie du willst; wer ihn angemeldet öffnet, tritt der Karte bei.", "No se busca a nadie por nombre ni e-mail: pasa el enlace como quieras; quien lo abra con sesión iniciada se une al mapa.")
k("map.team.link", "Lien d'invitation", "Invitation link", "Einladungslink", "Enlace de invitación")
k("map.team.linkHint", "Ce lien fait rejoindre la carte comme {role}, jusqu'au {date}.", "This link joins the map as {role}, until {date}.", "Dieser Link fügt bis {date} als {role} hinzu.", "Este enlace une al mapa como {role}, hasta el {date}.")
k("map.team.copied", "Lien copié.", "Link copied.", "Link kopiert.", "Enlace copiado.")
k("map.team.members", "Membres de l'équipe", "Team members", "Teammitglieder", "Miembros del equipo")
k("map.team.name", "Nom", "Name", "Name", "Nombre")
k("map.team.remove", "retirer", "remove", "entfernen", "quitar")
k("map.team.links", "Liens d'invitation en cours", "Current invitation links", "Aktuelle Einladungslinks", "Enlaces de invitación vigentes")
k("map.team.until", "jusqu'au {date}", "until {date}", "bis {date}", "hasta el {date}")
k("map.team.revoke", "Révoquer", "Revoke", "Widerrufen", "Revocar")
k("map.team.saved", "Équipe enregistrée.", "Team saved.", "Team gespeichert.", "Equipo guardado.")
k("map.team.note", "Note", "Note", "Notiz", "Nota")
k("map.team.notePh", "Avant la reprise du nord", "Before revising the north", "Vor der Überarbeitung des Nordens", "Antes de revisar el norte")
k("map.team.versionSaved", "Version enregistrée.", "Version saved.", "Version gespeichert.", "Versión guardada.")
k("map.team.noVersions", "Aucune version enregistrée.", "No saved versions.", "Keine gespeicherten Versionen.", "No hay versiones guardadas.")
k("map.team.versionsHint", "La carte actuelle est gardée comme version avant d'être remplacée.", "The current map is kept as a version before it is replaced.", "Die aktuelle Karte wird vor dem Ersetzen als Version behalten.", "El mapa actual se guarda como versión antes de sustituirlo.")
k("map.team.restore", "Rétablir cette version", "Restore this version", "Diese Version wiederherstellen", "Restaurar esta versión")
k("map.team.beforeRestore", "Avant le retour à une version", "Before restoring a version", "Vor dem Wiederherstellen einer Version", "Antes de restaurar una versión")


# ---- what a conversion to or from Mapper cannot keep (mapper/fromomap.js, toomap.js) ----------------------------------------------
for key, v in {
  "symbol": ("Symbole illisible, laissé de côté", "Unreadable symbol, left out", "Unlesbares Symbol, weggelassen", "Símbolo ilegible, omitido"),
  "capSquare": ("Extrémités carrées : plates dans OCAD", "Square line ends: flat in OCAD", "Eckige Linienenden: in OCAD flach", "Extremos cuadrados: planos en OCAD"),
  "joinCap": ("Angles et extrémités : arrondis ensemble ou pas du tout dans OCAD", "Corners and ends: OCAD rounds both or neither", "Ecken und Enden: OCAD rundet beide oder keines", "Esquinas y extremos: OCAD redondea ambos o ninguno"),
  "dashGroups": ("Groupes de plus de deux tirets : deux dans OCAD", "Groups of more than two dashes: two in OCAD", "Gruppen von mehr als zwei Strichen: zwei in OCAD", "Grupos de más de dos trazos: dos en OCAD"),
  "borders": ("Bordures différentes à gauche et à droite : approchées", "Different left and right borders: approximated", "Unterschiedliche Ränder links und rechts: angenähert", "Bordes izquierdo y derecho distintos: aproximados"),
  "midDash": ("Symboles au milieu des tirets : placés dans les intervalles", "Symbols at dash centres: placed in the gaps", "Symbole in Strichmitte: in die Lücken gesetzt", "Símbolos en el centro de los trazos: colocados en los huecos"),
  "midMin": ("« Au moins un symbole » non désactivable dans OCAD", "« At least one symbol » cannot be turned off in OCAD", "„Mindestens ein Symbol“ lässt sich in OCAD nicht abschalten", "«Al menos un símbolo» no se puede desactivar en OCAD"),
  "patternOffset": ("Décalage de motif ignoré", "Pattern offset dropped", "Musterversatz verworfen", "Desplazamiento del patrón descartado"),
  "patternOrigin": ("Centre de rotation du motif : l'origine de la carte dans OCAD", "Pattern rotation centre: the map's origin in OCAD", "Drehpunkt des Musters: in OCAD der Kartenursprung", "Centro de rotación del patrón: el origen del mapa en OCAD"),
  "textUnderline": ("Texte souligné : pas de soulignement dans OCAD", "Underlined text: no underline in OCAD", "Unterstrichener Text: in OCAD ohne Unterstreichung", "Texto subrayado: sin subrayado en OCAD"),
  "comboPart": ("Partie ponctuelle ou texte d'un symbole combiné ignorée", "Point or text part of a combined symbol left out", "Punkt- oder Textteil eines kombinierten Symbols weggelassen", "Parte de punto o texto de un símbolo combinado omitida"),
  }.items(): k(f"map.omap.loss.{key}", *v)
for key, v in {
  "rectGrid": ("Grille du rectangle non reprise", "Rectangle grid not kept", "Rechteckraster nicht übernommen", "Cuadrícula del rectángulo no conservada"),
  "decrease": ("Symboles décroissants : de taille constante", "Decreasing symbols: constant size", "Abnehmende Symbole: gleichbleibende Größe", "Símbolos decrecientes: tamaño constante"),
  "irregular": ("Structure irrégulière : régulière", "Irregular structure: regular", "Unregelmäßige Struktur: regelmäßig", "Estructura irregular: regular"),
  "wordSpace": ("Espacement des mots ignoré", "Word spacing dropped", "Wortabstand verworfen", "Espaciado entre palabras descartado"),
  "indent": ("Retraits de paragraphe ignorés", "Paragraph indents dropped", "Absatzeinzüge verworfen", "Sangrías de párrafo descartadas"),
  "textPoint": ("Symbole ponctuel du texte ignoré", "Text's point symbol dropped", "Punktsymbol des Textes verworfen", "Símbolo de punto del texto descartado"),
  "textFrame": ("Cadre rectangulaire du texte ignoré", "Text's rectangle frame dropped", "Rechteckrahmen des Textes verworfen", "Marco rectangular del texto descartado"),
  "lineText": ("Texte le long d'une ligne : texte droit au début de la ligne", "Text along a line: straight text at the line's start", "Text entlang einer Linie: gerader Text am Linienanfang", "Texto a lo largo de una línea: texto recto al inicio de la línea"),
  "gaps": ("Coupures de ligne (« sans ligne ») ignorées", "Line gaps (« no line ») dropped", "Linienlücken („ohne Linie“) verworfen", "Huecos de línea («sin línea») descartados"),
  "circleGaps": ("Coupures de cercle ignorées", "Circle gaps dropped", "Kreislücken verworfen", "Huecos de círculo descartados"),
  "holesInLine": ("Ligne en plusieurs parties : toutes tracées", "Line in several parts: all drawn", "Linie aus mehreren Teilen: alle gezeichnet", "Línea en varias partes: todas dibujadas"),
  "grid": ("Système de coordonnées OCAD sans équivalent : local", "OCAD grid with no equivalent: local", "OCAD-Koordinatensystem ohne Entsprechung: lokal", "Sistema de coordenadas de OCAD sin equivalente: local"),
  "layoutImage": ("Images de mise en page (logos) non reprises", "Layout images (logos) not kept", "Layoutbilder (Logos) nicht übernommen", "Imágenes de maquetación (logotipos) no conservadas"),
  }.items(): k(f"map.omap.lost.{key}", *v)
k("map.omap.losses", "À noter, ce que l'autre format ne garde pas : {list}", "Note what the other format does not keep: {list}", "Beachte, was das andere Format nicht behält: {list}", "Ten en cuenta lo que el otro formato no conserva: {list}")

# ---- the symbol editor (symedit.js) ------------------------------------------------------------------------------------------------
for key, v in {
  "symbol-edit": ("Modifier le symbole", "Edit symbol", "Signatur bearbeiten", "Editar el símbolo"), "symbol-new": ("Nouveau symbole", "New symbol", "Neue Signatur", "Símbolo nuevo"),
  "symbol-delete": ("Supprimer le symbole", "Delete symbol", "Signatur löschen", "Eliminar el símbolo"), "export-sep": ("Séparations", "Separations", "Farbauszüge", "Separaciones"),
  "sector": ("Mon secteur", "My sector", "Mein Sektor", "Mi sector"),
  }.items(): k(f"map.rib.{key}", *v)
SYM = {
  "edit": ("Symbole {n}", "Symbol {n}", "Signatur {n}", "Símbolo {n}"), "new": ("Nouveau symbole", "New symbol", "Neue Signatur", "Símbolo nuevo"),
  "newName": ("Nouveau symbole", "New symbol", "Neue Signatur", "Símbolo nuevo"), "number": ("Numéro", "Number", "Nummer", "Número"), "name": ("Nom", "Name", "Name", "Nombre"),
  "rotatable": ("Tourne avec l'objet", "Turns with the object", "Dreht mit dem Objekt", "Gira con el objeto"), "hidden": ("Masqué", "Hidden", "Ausgeblendet", "Oculto"),
  "preview": ("Aperçu", "Preview", "Vorschau", "Vista previa"), "noPreview": ("Pas d'aperçu pour ce symbole.", "No preview for this symbol.", "Keine Vorschau für diese Signatur.", "Sin vista previa para este símbolo."),
  "none": ("aucune", "none", "keine", "ninguna"), "color": ("Couleur", "Colour", "Farbe", "Color"), "width": ("Largeur", "Width", "Breite", "Anchura"), "diameter": ("Diamètre", "Diameter", "Durchmesser", "Diámetro"),
  "ends": ("Extrémités et angles", "Ends and corners", "Enden und Ecken", "Extremos y esquinas"), "dash": ("Tiret", "Dash", "Strich", "Trazo"), "gap": ("Intervalle", "Gap", "Lücke", "Hueco"),
  "endDash": ("Tiret aux extrémités", "End dash", "Endstrich", "Trazo de los extremos"), "secGap": ("Petit intervalle", "Secondary gap", "Zweite Lücke", "Hueco secundario"),
  "endGap": ("Intervalle aux extrémités", "End gap", "Endlücke", "Hueco de los extremos"), "minSym": ("Tirets au minimum", "Minimum dashes", "Mindestzahl der Striche", "Trazos mínimos"),
  "fromStart": ("Raccourcie au début", "Shortened at the start", "Am Anfang verkürzt", "Acortada al inicio"), "toEnd": ("Raccourcie à la fin", "Shortened at the end", "Am Ende verkürzt", "Acortada al final"),
  "dblMode": ("Ligne double", "Double line", "Doppellinie", "Línea doble"), "dblWidth": ("Écart des deux bords", "Width between the edges", "Abstand der Ränder", "Separación de los bordes"),
  "dblLeft": ("Bord gauche", "Left edge", "Linker Rand", "Borde izquierdo"), "dblLeftWidth": ("Épaisseur du bord gauche", "Left edge width", "Breite des linken Rands", "Grosor del borde izquierdo"),
  "dblRight": ("Bord droit", "Right edge", "Rechter Rand", "Borde derecho"), "dblRightWidth": ("Épaisseur du bord droit", "Right edge width", "Breite des rechten Rands", "Grosor del borde derecho"),
  "dblFill": ("Remplissage entre les bords", "Fill between the edges", "Füllung zwischen den Rändern", "Relleno entre los bordes"), "dblFillOn": ("Remplir", "Fill", "Füllen", "Rellenar"),
  "dblDash": ("Tiret des bords", "Edge dash", "Strich der Ränder", "Trazo de los bordes"), "dblGap": ("Intervalle des bords", "Edge gap", "Lücke der Ränder", "Hueco de los bordes"),
  "frame": ("Contour", "Framing", "Umrandung", "Contorno"), "frameWidth": ("Épaisseur du contour", "Framing width", "Breite der Umrandung", "Grosor del contorno"),
  "nPrim": ("Symboles le long, par groupe", "Symbols along, per group", "Symbole entlang, je Gruppe", "Símbolos a lo largo, por grupo"), "primDist": ("Écart entre eux", "Spacing between them", "Abstand zwischen ihnen", "Separación entre ellos"),
  "fillOn": ("Remplie", "Filled", "Gefüllt", "Rellena"), "fill": ("Couleur de fond", "Fill colour", "Füllfarbe", "Color de relleno"), "hatchMode": ("Hachures", "Hatching", "Schraffur", "Rayado"),
  "hatchColor": ("Couleur des hachures", "Hatching colour", "Schraffurfarbe", "Color del rayado"), "hatchWidth": ("Épaisseur des hachures", "Hatch line width", "Schraffurlinienbreite", "Grosor del rayado"),
  "hatchDist": ("Écart des hachures", "Hatch spacing", "Schraffurabstand", "Separación del rayado"), "hatchAngle1": ("Angle", "Angle", "Winkel", "Ángulo"), "hatchAngle2": ("Second angle", "Second angle", "Zweiter Winkel", "Segundo ángulo"),
  "structMode": ("Motif", "Pattern", "Muster", "Patrón"), "structWidth": ("Écart horizontal du motif", "Pattern horizontal spacing", "Waagrechter Musterabstand", "Separación horizontal del patrón"),
  "structHeight": ("Écart vertical du motif", "Pattern vertical spacing", "Senkrechter Musterabstand", "Separación vertical del patrón"), "structAngle": ("Angle du motif", "Pattern angle", "Musterwinkel", "Ángulo del patrón"),
  "borderOn": ("Bordure", "Border", "Rand", "Borde"), "border": ("Symbole de bordure", "Border symbol", "Randsignatur", "Símbolo de borde"),
  "font": ("Police", "Font", "Schrift", "Fuente"), "size": ("Taille", "Size", "Größe", "Tamaño"), "bold": ("Gras", "Bold", "Fett", "Negrita"), "italic": ("Italique", "Italic", "Kursiv", "Cursiva"),
  "align": ("Alignement", "Alignment", "Ausrichtung", "Alineación"), "lineSpace": ("Interligne (%)", "Line spacing (%)", "Zeilenabstand (%)", "Interlineado (%)"), "frMode": ("Cadre du texte", "Text frame", "Textrahmen", "Marco del texto"),
  "radius": ("Rayon des coins", "Corner radius", "Eckenradius", "Radio de las esquinas"),
  "points": ("Points (mm)", "Points (mm)", "Punkte (mm)", "Puntos (mm)"), "pointsHint": ("x y en mm, séparés par « ; » ; « *1 » ou « *2 » marquent les poignées d'une courbe", "x y in mm, separated by « ; »; « *1 » or « *2 » mark a curve's handles", "x y in mm, getrennt durch „;“; „*1“ oder „*2“ markieren die Anfasser einer Kurve", "x y en mm, separados por «;»; «*1» o «*2» marcan los tiradores de una curva"),
  "addElt": ("Ajouter un élément", "Add an element", "Element hinzufügen", "Añadir un elemento"), "badNumber": ("Numéro de la forme 101 ou 101.1.", "A number like 101 or 101.1.", "Eine Nummer wie 101 oder 101.1.", "Un número como 101 o 101.1."),
  "taken": ("Le numéro {n} est déjà pris.", "Number {n} is already used.", "Die Nummer {n} ist schon vergeben.", "El número {n} ya está en uso."),
  "inUse": ("Des objets utilisent ce symbole : changez-les d'abord de symbole.", "Objects use this symbol: change their symbol first.", "Objekte verwenden diese Signatur: Ändere zuerst ihre Signatur.", "Hay objetos que usan este símbolo: cámbiales antes el símbolo."),
  "isBorder": ("Ce symbole borde une surface : retirez-le d'abord de sa bordure.", "This symbol borders an area symbol: remove it from that border first.", "Diese Signatur ist der Rand einer Flächensignatur: Entferne sie zuerst dort.", "Este símbolo es el borde de una superficie: quítalo antes de ese borde."),
  "startFrom": ("Partir de", "Start from", "Ausgehend von", "Partir de"), "copyOf": ("une copie de {s}", "a copy of {s}", "einer Kopie von {s}", "una copia de {s}"),
  }
for key, v in SYM.items(): k(f"map.sym.{key}", *v)
for key, v in {"stroke": ("Trait", "Stroke", "Strich", "Trazo"), "dashes": ("Tirets", "Dashes", "Strichelung", "Trazos discontinuos"), "double": ("Ligne double", "Double line", "Doppellinie", "Línea doble"),
  "frame": ("Contour", "Framing", "Umrandung", "Contorno"), "fill": ("Fond", "Fill", "Füllung", "Relleno"), "hatch": ("Hachures", "Hatching", "Schraffur", "Rayado"),
  "pattern": ("Motif", "Pattern", "Muster", "Patrón"), "border": ("Bordure", "Border", "Rand", "Borde")}.items(): k(f"map.sym.grp.{key}", *v)
for key, v in {"flat": ("Plates", "Flat", "Flach", "Planos"), "round": ("Arrondies", "Round", "Rund", "Redondeados"), "miter": ("Plates, angles vifs", "Flat, sharp corners", "Flach, spitze Ecken", "Planos, esquinas vivas"),
  "pointed": ("Pointues", "Pointed", "Spitz", "Puntiagudos"), "pointedRound": ("Pointues, angles arrondis", "Pointed, round corners", "Spitz, runde Ecken", "Puntiagudos, esquinas redondeadas")}.items(): k(f"map.sym.ends.{key}", *v)
for key, v in {"line": ("Ligne", "Line", "Linie", "Línea"), "area": ("Surface", "Area", "Fläche", "Superficie"), "circle": ("Cercle", "Circle", "Kreis", "Círculo"), "dot": ("Point plein", "Dot", "Punkt", "Punto")}.items(): k(f"map.sym.elt.{key}", *v)
for key, v in {"elts": ("Éléments", "Elements", "Elemente", "Elementos"), "prim": ("Symboles le long de la ligne", "Symbols along the line", "Symbole entlang der Linie", "Símbolos a lo largo de la línea"),
  "sec": ("Symboles dans les intervalles", "Symbols in the gaps", "Symbole in den Lücken", "Símbolos en los huecos"), "corner": ("Symboles aux angles", "Symbols at corners", "Symbole an den Ecken", "Símbolos en las esquinas"),
  "start": ("Symbole au début", "Symbol at the start", "Symbol am Anfang", "Símbolo al inicio"), "end": ("Symbole à la fin", "Symbol at the end", "Symbol am Ende", "Símbolo al final")}.items(): k(f"map.sym.list.{key}", *v)
for key, v in {"point": ("Symbole ponctuel : ses éléments sont placés autour du point de l'objet (0 0), en mm sur la carte.", "Point symbol: its elements are placed around the object's point (0 0), in map mm.", "Punktsignatur: Ihre Elemente liegen um den Objektpunkt (0 0), in mm auf der Karte.", "Símbolo puntual: sus elementos se sitúan alrededor del punto del objeto (0 0), en mm del mapa."),
  "line": ("Symbole linéaire : épaisseur, tirets, ligne double, contour et symboles répétés le long.", "Line symbol: width, dashes, double line, framing and symbols repeated along it.", "Liniensignatur: Breite, Striche, Doppellinie, Umrandung und entlang wiederholte Symbole.", "Símbolo lineal: grosor, trazos, línea doble, contorno y símbolos repetidos a lo largo."),
  "area": ("Symbole de surface : fond, hachures, motif (ses éléments) et bordure.", "Area symbol: fill, hatching, pattern (its elements) and border.", "Flächensignatur: Füllung, Schraffur, Muster (seine Elemente) und Rand.", "Símbolo de superficie: relleno, rayado, patrón (sus elementos) y borde."),
  "text": ("Symbole de texte.", "Text symbol.", "Textsignatur.", "Símbolo de texto."), "linetext": ("Texte le long d'une ligne.", "Text along a line.", "Text entlang einer Linie.", "Texto a lo largo de una línea."),
  "rect": ("Rectangle.", "Rectangle.", "Rechteck.", "Rectángulo.")}.items(): k(f"map.sym.kind.{key}", *v)
for key, v in {"point": ("un point vide", "an empty point symbol", "einer leeren Punktsignatur", "un símbolo puntual vacío"), "line": ("une ligne vide", "an empty line symbol", "einer leeren Liniensignatur", "un símbolo lineal vacío"),
  "area": ("une surface vide", "an empty area symbol", "einer leeren Flächensignatur", "un símbolo de superficie vacío"), "text": ("un texte vide", "an empty text symbol", "einer leeren Textsignatur", "un símbolo de texto vacío")}.items(): k(f"map.sym.blank.{key}", *v)
for key, v in {"0": ("aucune", "none", "keine", "ninguna"), "1": ("deux bords pleins", "two solid edges", "zwei durchgezogene Ränder", "dos bordes continuos"), "2": ("bord gauche en tirets", "left edge dashed", "linker Rand gestrichelt", "borde izquierdo discontinuo"),
  "3": ("deux bords en tirets", "both edges dashed", "beide Ränder gestrichelt", "ambos bordes discontinuos"), "4": ("tout en tirets", "all dashed", "alles gestrichelt", "todo discontinuo")}.items(): k(f"map.sym.dbl.{key}", *v)
for key, v in {"0": ("aucune", "none", "keine", "ninguno"), "1": ("une direction", "one direction", "eine Richtung", "una dirección"), "2": ("croisées", "crossed", "gekreuzt", "cruzado")}.items(): k(f"map.sym.hatch.{key}", *v)
for key, v in {"0": ("aucun", "none", "keines", "ninguno"), "1": ("lignes alignées", "aligned rows", "ausgerichtete Reihen", "filas alineadas"), "2": ("lignes décalées", "shifted rows", "versetzte Reihen", "filas desplazadas")}.items(): k(f"map.sym.struct.{key}", *v)
for key, v in {"left": ("à gauche", "left", "links", "a la izquierda"), "center": ("au centre", "centre", "zentriert", "al centro"), "right": ("à droite", "right", "rechts", "a la derecha"), "justify": ("justifié", "justified", "Blocksatz", "justificado")}.items(): k(f"map.sym.align.{key}", *v)
for key, v in {"0": ("aucun", "none", "keiner", "ninguno"), "1": ("ombre", "shadow", "Schatten", "sombra"), "2": ("contour", "outline", "Kontur", "contorno")}.items(): k(f"map.sym.fr.{key}", *v)

# ---- colours, inks, separations (colors.js) -------------------------------------------------------------------------------------
for key, v in {
  "hint": ("Du haut au bas de l'ordre d'impression. Encres : « Nom 100 » (pourcentage), plusieurs séparées par des virgules.", "From the top to the bottom of the printing order. Inks: « Name 100 » (percentage), several separated by commas.", "Von oben nach unten in der Druckreihenfolge. Druckfarben: „Name 100“ (Prozent), mehrere durch Kommas getrennt.", "De arriba abajo en el orden de impresión. Tintas: «Nombre 100» (porcentaje), varias separadas por comas."),
  "name": ("Nom", "Name", "Name", "Nombre"), "op": ("Surimp.", "Overpr.", "Überdr.", "Sobreimp."), "overprint": ("Surimpression", "Overprint", "Überdrucken", "Sobreimpresión"),
  "spots": ("Encres d'accompagnement", "Spot inks", "Schmuckfarben", "Tintas planas"), "cmyk": ("CMJN", "CMYK", "CMYK", "CMYK"),
  "up": ("Monter", "Move up", "Nach oben", "Subir"), "down": ("Descendre", "Move down", "Nach unten", "Bajar"), "delete": ("Supprimer", "Delete", "Löschen", "Eliminar"),
  "add": ("Nouvelle couleur", "New colour", "Neue Farbe", "Color nuevo"), "new": ("Nouvelle couleur", "New colour", "Neue Farbe", "Color nuevo"),
  "inks": ("Encres d'accompagnement", "Spot inks", "Schmuckfarben", "Tintas planas"), "inksHint": ("Les encres de l'imprimeur (Pantone…) : leur CMJN pour l'écran, la linéature et l'angle de trame.", "The printer's inks (Pantone…): their CMYK for the screen, screen frequency and angle.", "Die Druckfarben der Druckerei (Pantone…): ihr CMYK für den Bildschirm, Rasterweite und -winkel.", "Las tintas de la imprenta (Pantone…): su CMYK para la pantalla, lineatura y ángulo de trama."),
  "freq": ("Linéature", "Frequency", "Rasterweite", "Lineatura"), "angle": ("Angle", "Angle", "Winkel", "Ángulo"), "addInk": ("Nouvelle encre", "New ink", "Neue Druckfarbe", "Tinta nueva"), "newInk": ("Encre", "Ink", "Druckfarbe", "Tinta"),
  "inUse": ("Cette couleur est utilisée par un symbole ou un objet.", "This colour is used by a symbol or an object.", "Diese Farbe wird von einer Signatur oder einem Objekt verwendet.", "Este color lo usa un símbolo o un objeto."),
  }.items(): k(f"map.col.{key}", *v)
for key, v in {
  "title": ("Séparations des couleurs", "Colour separations", "Farbauszüge", "Separaciones de color"), "what": ("Pour l'imprimeur", "For the printer", "Für die Druckerei", "Para la imprenta"),
  "composite": ("Un PDF en encres d'accompagnement (couleurs de séparation)", "One PDF in spot inks (separation colours)", "Ein PDF in Schmuckfarben (Separationsfarben)", "Un PDF en tintas planas (colores de separación)"),
  "spotPlates": ("Une page par encre d'accompagnement (et par encre CMJN pour les couleurs sans encre)", "One page per spot ink (and per CMYK ink for the colours without one)", "Eine Seite je Schmuckfarbe (und je CMYK-Farbe für die Farben ohne Schmuckfarbe)", "Una página por tinta plana (y por tinta CMYK para los colores sin tinta)"),
  "unprinted": ("Couleurs sur aucune plaque (leurs encres sont masquées) : {list}", "Colours on no plate (their inks are hidden): {list}", "Farben auf keiner Druckplatte (ihre Schmuckfarben sind ausgeblendet): {list}", "Colores en ninguna plancha (sus tintas están ocultas): {list}"),
  "processPlates": ("Une page par encre CMJN (quadrichromie)", "One page per CMYK ink (process)", "Eine Seite je CMYK-Farbe (Vierfarbdruck)", "Una página por tinta CMYK (cuatricromía)"),
  "noSpots": ("La carte n'a pas d'encres d'accompagnement : définissez-les dans Mise en page › Couleurs.", "The map has no spot inks: define them in Layout › Colours.", "Die Karte hat keine Schmuckfarben: Lege sie unter Layout › Farben an.", "El mapa no tiene tintas planas: defínelas en Maquetación › Colores."),
  "marks": ("Repères de repérage et nom de chaque plaque", "Registration marks and each plate's name", "Passermarken und Name jeder Druckplatte", "Marcas de registro y nombre de cada plancha"), "plate": ("Plaque", "Plate", "Platte", "Plancha"),
  }.items(): k(f"map.sep.{key}", *v)

# ---- several mappers at once (collab.js) ------------------------------------------------------------------------------------------
k("map.collab.others.one", "Aussi sur la carte : {names}", "Also on the map: {names}", "Auch auf der Karte: {names}", "También en el mapa: {names}")
k("map.collab.others.other", "{n} autres sur la carte : {names}", "{n} others on the map: {names}", "{n} weitere auf der Karte: {names}", "{n} más en el mapa: {names}")
k("map.collab.pulled", "Modifications de l'équipe reprises.", "The team's changes taken in.", "Änderungen des Teams übernommen.", "Cambios del equipo incorporados.")
k("map.collab.merged", "Vos modifications et celles de l'équipe ont été réunies.", "Your changes and the team's were merged.", "Deine Änderungen und die des Teams wurden zusammengeführt.", "Tus cambios y los del equipo se han combinado.")
k("map.collab.mergedConflicts.one", "Réunies ; {n} objet modifié des deux côtés : la version de qui tient le secteur l'emporte.", "Merged; {n} object changed on both sides: the version of the sector's keeper wins.", "Zusammengeführt; {n} Objekt auf beiden Seiten geändert: Die Version dessen, der den Sektor hält, gilt.", "Combinados; {n} objeto cambiado por ambos lados: gana la versión de quien tiene el sector.")
k("map.collab.mergedConflicts.other", "Réunies ; {n} objets modifiés des deux côtés : la version de qui tient le secteur l'emporte.", "Merged; {n} objects changed on both sides: the version of the sector's keeper wins.", "Zusammengeführt; {n} Objekte auf beiden Seiten geändert: Die Version dessen, der den Sektor hält, gilt.", "Combinados; {n} objetos cambiados por ambos lados: gana la versión de quien tiene el sector.")
k("map.sector.pick", "Cliquez deux coins de votre secteur : les autres ne pourront pas y modifier la carte.", "Click two corners of your sector: the others will not be able to change the map there.", "Klicke zwei Ecken deines Sektors: Die anderen können die Karte dort nicht ändern.", "Haz clic en dos esquinas de tu sector: los demás no podrán modificar el mapa ahí.")
k("map.sector.kept", "Secteur réservé.", "Sector kept.", "Sektor reserviert.", "Sector reservado.")
k("map.sector.released", "Secteur libéré.", "Sector released.", "Sektor freigegeben.", "Sector liberado.")
k("map.sector.clash", "Ce secteur empiète sur celui de {name}.", "This sector overlaps {name}'s.", "Dieser Sektor überschneidet sich mit dem von {name}.", "Este sector se solapa con el de {name}.")
k("map.sector.locked", "Un autre cartographe a réservé ce secteur.", "Another mapper keeps this sector.", "Ein anderer Kartograf hat diesen Sektor reserviert.", "Otro cartógrafo tiene reservado este sector.")
k("map.sector.mine", "Mon secteur", "My sector", "Mein Sektor", "Mi sector")
k("map.sector.of", "Secteur de {name}", "{name}'s sector", "Sektor von {name}", "Sector de {name}")
k("map.undo.colors", "Couleurs", "Colours", "Farben", "Colores")
k("map.undo.symbolEdit", "Symbole modifié", "Symbol edited", "Signatur geändert", "Símbolo modificado")
k("map.undo.symbolNew", "Nouveau symbole", "New symbol", "Neue Signatur", "Símbolo nuevo")
k("map.undo.symbolDelete", "Symbole supprimé", "Symbol deleted", "Signatur gelöscht", "Símbolo eliminado")

# ---- generalisation (generalise.js) ----------------------------------------------------------------------------------------------
k("map.rib.generalise", "Généraliser", "Generalise", "Generalisieren", "Generalizar")
k("map.grp.generalise", "Généralisation", "Generalisation", "Generalisierung", "Generalización")
k("map.right.gen", "Généraliser", "Generalise", "Generalisieren", "Generalizar")
k("map.undo.scale", "Changement d'échelle", "Change of scale", "Maßstabswechsel", "Cambio de escala")
k("map.undo.generalise", "Généralisation", "Generalisation", "Generalisierung", "Generalización")
for key, v in {
  "lede": ("Rendre la carte lisible à son échelle, étape par étape : chaque étape trouve ses cas, « Montrer » les choisit sur la carte, « Appliquer » les traite (annulable).", "Make the map legible at its scale, step by step: each step finds its cases, « Show » selects them on the map, « Apply » handles them (undoable).", "Die Karte Schritt für Schritt in ihrem Maßstab lesbar machen: Jeder Schritt findet seine Fälle, „Zeigen“ wählt sie auf der Karte aus, „Anwenden“ bearbeitet sie (rückgängig machbar).", "Hacer el mapa legible a su escala, paso a paso: cada paso encuentra sus casos, «Mostrar» los selecciona en el mapa, «Aplicar» los trata (se puede deshacer)."),
  "scale": ("Échelle", "Scale", "Maßstab", "Escala"),
  "scaleHint": ("Carte au 1:{s}. La nouvelle échelle réduit ou agrandit toute la carte autour de son origine ; son géoréférencement ne change pas.", "Map at 1:{s}. The new scale shrinks or enlarges the whole map about its origin; its georeference stays.", "Karte im Maßstab 1:{s}. Der neue Maßstab verkleinert oder vergrößert die ganze Karte um ihren Ursprung; ihre Georeferenzierung bleibt.", "Mapa a 1:{s}. La nueva escala reduce o amplía todo el mapa alrededor de su origen; su georreferenciación no cambia."),
  "scaleSyms": ("Les symboles suivent (1:10 000 ↔ 1:15 000 de l'ISOM)", "Symbols follow (ISOM's 1:10,000 ↔ 1:15,000)", "Signaturen folgen (1:10.000 ↔ 1:15.000 der ISOM)", "Los símbolos siguen (1:10.000 ↔ 1:15.000 de la ISOM)"),
  "apply": ("Appliquer", "Apply", "Anwenden", "Aplicar"), "scaled": ("Carte passée au 1:{s}.", "Map now at 1:{s}.", "Karte jetzt im Maßstab 1:{s}.", "Mapa ahora a 1:{s}."),
  "small": ("Trop petit", "Too small", "Zu klein", "Demasiado pequeño"),
  "smallHint": ("Surfaces et lignes sous le minimum de leur symbole dans les spécifications.", "Areas and lines under their symbol's minimum in the specifications.", "Flächen und Linien unter dem Mindestmaß ihrer Signatur laut Spezifikation.", "Superficies y líneas por debajo del mínimo de su símbolo en las especificaciones."),
  "find": ("Chercher", "Find", "Suchen", "Buscar"), "found.one": ("{n} cas", "{n} case", "{n} Fall", "{n} caso"), "found.other": ("{n} cas", "{n} cases", "{n} Fälle", "{n} casos"),
  "show": ("Montrer", "Show", "Zeigen", "Mostrar"), "enlarge": ("Agrandir au minimum", "Enlarge to the minimum", "Auf das Mindestmaß vergrößern", "Ampliar al mínimo"), "delete": ("Supprimer", "Delete", "Löschen", "Eliminar"),
  "dense": ("Trop de points", "Too many points", "Zu viele Punkte", "Demasiados puntos"), "tol": ("Tolérance", "Tolerance", "Toleranz", "Tolerancia"),
  "simplify": ("Simplifier ({n} points en moins)", "Simplify ({n} points fewer)", "Vereinfachen ({n} Punkte weniger)", "Simplificar ({n} puntos menos)"),
  "overlaps": ("Surfaces qui se chevauchent", "Overlapping areas", "Überlappende Flächen", "Superficies superpuestas"), "unite": ("Réunir", "Unite", "Vereinigen", "Unir"),
  "crowded": ("Points trop serrés", "Crowded point features", "Zu dichte Punktobjekte", "Puntos demasiado juntos"), "dist": ("Distance", "Distance", "Abstand", "Distancia"),
  "thin": ("En garder un", "Keep one", "Eines behalten", "Conservar uno"),
  "contours": ("Courbes trop serrées", "Contours too close", "Zu enge Höhenlinien", "Curvas demasiado juntas"),
  "contoursHint": ("À reprendre à la main : déplacer une courbe est un choix du cartographe.", "To fix by hand: moving a contour is the mapper's choice.", "Von Hand zu ändern: Eine Höhenlinie zu verschieben entscheidet der Kartograf.", "A corregir a mano: mover una curva es decisión del cartógrafo."),
  "next": ("Suivante", "Next", "Nächste", "Siguiente"),
  }.items(): k(f"map.gen.{key}", *v)


# ---- national data abroad (data/ch.js, us.js; trace/terrain.js; backgrounds.js) ----------------------------------------------
k("map.rib.data-national", "Données nationales", "National data", "Nationale Daten", "Datos nacionales")
k("map.data.national.none", "Pas de données nationales ouvertes pour ce pays : utilisez OpenStreetMap.", "No open national data for this country: use OpenStreetMap.", "Keine offenen nationalen Daten für dieses Land: Verwende OpenStreetMap.", "No hay datos nacionales abiertos para este país: usa OpenStreetMap.")
k("map.data.national.reading.bdtopo", "Lecture de la BD TOPO de l'IGN…", "Reading IGN's BD TOPO…", "BD TOPO des IGN wird gelesen…", "Leyendo la BD TOPO del IGN…")
k("map.data.national.reading.swisstopo", "Lecture de swissTLM3D (swisstopo)…", "Reading swissTLM3D (swisstopo)…", "swissTLM3D (swisstopo) wird gelesen…", "Leyendo swissTLM3D (swisstopo)…")
# « Plan de ville (sprint) » (2026-11-12): the town map of the generator Pixel's races use, made on Ozimut's servers (townmap workflow)
k("map.data.town.hint", "Une carte sprint de la ville faite par le générateur des courses de Pixel, d'après le LiDAR de l'IGN, sa BD TOPO, la photo aérienne et son infrarouge, le cadastre et OpenStreetMap, selon les règles d'un cartographe : la voirie publique pavée jusqu'aux limites des parcelles, le bord des zones pavées et les bordures, les trottoirs et pistes cyclables en lignes à leur largeur, les escaliers à leur largeur, le réseau de chemins raccordé, les bâtiments accolés réunis, la végétation et les arbres isolés lus par le LiDAR, les jardins privés en olive avec leurs limites à confirmer, les terrains de sport, les murs et clôtures franchissables ou non selon leur hauteur. Tout arrive en brouillon ; les objets d'OpenStreetMap sont gardés sur des symboles masqués (990, 991). France seulement, 2 × 2 km au plus.",
  "A sprint map of the town made by the generator Pixel's races use, from IGN's LiDAR, its BD TOPO, the aerial photograph and its infrared, the cadastre and OpenStreetMap, by a mapper's rules: the public road space paved up to the property lines, the edge of paved areas and the kerbs, footways and cycle paths as lines at their width, stairways at their width, the path network joined, adjoining buildings drawn as one, vegetation and lone trees read from the LiDAR, private gardens in olive with their boundaries to confirm, the sports grounds, walls and fences passable or not by their height. Everything comes in as a draft; OpenStreetMap's objects are kept on hidden symbols (990, 991). France only, 2 × 2 km at most.",
  "Eine Sprintkarte der Stadt, erstellt vom Generator der Pixel-Rennen aus dem LiDAR des IGN, seiner BD TOPO, dem Luftbild und seinem Infrarot, dem Kataster und OpenStreetMap, nach den Regeln eines Kartografen: der öffentliche Straßenraum befestigt bis zu den Flurstücksgrenzen, der Rand befestigter Flächen und die Bordsteine, Gehwege und Radwege als Linien in ihrer Breite, Treppen in ihrer Breite, das Wegenetz verbunden, aneinandergebaute Gebäude als eines, Vegetation und einzelne Bäume aus dem LiDAR, private Gärten in Oliv mit ihren zu bestätigenden Grenzen, die Sportplätze, Mauern und Zäune passierbar oder nicht nach ihrer Höhe. Alles kommt als Entwurf; die Objekte von OpenStreetMap bleiben auf ausgeblendeten Signaturen (990, 991). Nur Frankreich, höchstens 2 × 2 km.",
  "Un mapa de sprint de la ciudad hecho por el generador de las carreras de Pixel, a partir del LiDAR del IGN, su BD TOPO, la foto aérea y su infrarrojo, el catastro y OpenStreetMap, según las reglas de un cartógrafo: el espacio viario público pavimentado hasta los límites de las parcelas, el borde de las zonas pavimentadas y los bordillos, aceras y carriles bici como líneas a su anchura, escaleras a su anchura, la red de caminos conectada, los edificios adosados unidos, la vegetación y los árboles aislados leídos del LiDAR, los jardines privados en oliva con sus límites por confirmar, las instalaciones deportivas, muros y vallas franqueables o no según su altura. Todo llega como borrador; los objetos de OpenStreetMap se guardan en símbolos ocultos (990, 991). Solo Francia, 2 × 2 km como máximo.")
k("map.data.town.time", "Le calcul se fait sur les serveurs d'Ozimut et prend plusieurs minutes, parfois plus d'une demi-heure (le LiDAR à télécharger, la carte à calculer). Vous pouvez continuer à travailler, ou fermer la page : la carte arrivera en brouillon à la prochaine ouverture.",
  "The map is made on Ozimut's servers and takes several minutes, sometimes over half an hour (the LiDAR to download, the map to compute). You may keep working, or close the page: the map will come in as a draft the next time you open it.",
  "Die Karte wird auf Ozimuts Servern berechnet und braucht mehrere Minuten, manchmal über eine halbe Stunde (das LiDAR herunterladen, die Karte berechnen). Du kannst weiterarbeiten oder die Seite schließen: Die Karte kommt beim nächsten Öffnen als Entwurf.",
  "El mapa se calcula en los servidores de Ozimut y tarda varios minutos, a veces más de media hora (descargar el LiDAR, calcular el mapa). Puedes seguir trabajando o cerrar la página: el mapa llegará como borrador la próxima vez que lo abras.")
k("map.data.town.src.contours", "Courbes de niveau tous les 2,5 m, d'après le LiDAR, coupées aux bâtiments seulement", "Contours every 2.5 m from the LiDAR, cut at the buildings only", "Höhenlinien alle 2,5 m aus dem LiDAR, nur an Gebäuden unterbrochen", "Curvas de nivel cada 2,5 m a partir del LiDAR, cortadas solo en los edificios")
k("map.data.town.notFrance", "Le plan de ville n'existe qu'en France (LiDAR, BD TOPO et cadastre de l'IGN) : ailleurs, utilisez OpenStreetMap.", "The town plan exists in France only (IGN's LiDAR, BD TOPO and cadastre): elsewhere, use OpenStreetMap.", "Den Stadtplan gibt es nur in Frankreich (LiDAR, BD TOPO und Kataster des IGN): anderswo verwende OpenStreetMap.", "El plano urbano solo existe en Francia (LiDAR, BD TOPO y catastro del IGN): en otros lugares, usa OpenStreetMap.")
k("map.data.town.notSprint", "Le plan de ville est fait pour une carte sprint (ISSprOM).", "The town plan is made for a sprint map (ISSprOM).", "Der Stadtplan ist für eine Sprintkarte (ISSprOM) gedacht.", "El plano urbano está pensado para un mapa de sprint (ISSprOM).")
k("map.data.town.tooLarge", "Le plan de ville fait au plus 2 × 2 km : choisissez une zone plus petite (Données › Zone des données).", "A town plan is 2 × 2 km at most: choose a smaller area (Data › Data area).", "Ein Stadtplan ist höchstens 2 × 2 km groß: Wähle ein kleineres Gebiet (Daten › Datengebiet).", "Un plano urbano mide como máximo 2 × 2 km: elige una zona más pequeña (Datos › Zona de datos).")
k("map.data.town.asking", "Demande du plan de ville…", "Asking for the town plan…", "Stadtplan wird angefordert…", "Pidiendo el plano urbano…")
k("map.data.town.limit", "Trop de plans de ville demandés aujourd'hui : réessayez demain.", "Too many town plans asked for today: try again tomorrow.", "Heute wurden zu viele Stadtpläne angefordert: Versuche es morgen wieder.", "Se han pedido demasiados planos urbanos hoy: vuelve a intentarlo mañana.")
k("map.data.town.preparing", "Plan de ville : préparation du calcul (quelques minutes en tout)", "Town plan: preparing the computation (a few minutes in all)", "Stadtplan: Die Berechnung wird vorbereitet (insgesamt einige Minuten)", "Plano urbano: preparando el cálculo (unos minutos en total)")
k("map.data.town.ahead.one", "Plan de ville : {n} demande avant la vôtre", "Town plan: {n} request before yours", "Stadtplan: {n} Anfrage vor deiner", "Plano urbano: {n} solicitud antes de la tuya")
k("map.data.town.ahead.other", "Plan de ville : {n} demandes avant la vôtre", "Town plan: {n} requests before yours", "Stadtplan: {n} Anfragen vor deiner", "Plano urbano: {n} solicitudes antes de la tuya")
k("map.data.town.stage.fetch", "Plan de ville : téléchargement du LiDAR, de la BD TOPO, de la photo aérienne, du cadastre et d'OpenStreetMap", "Town plan: downloading the LiDAR, BD TOPO, the aerial photograph, the cadastre and OpenStreetMap", "Stadtplan: LiDAR, BD TOPO, Luftbild, Kataster und OpenStreetMap werden heruntergeladen", "Plano urbano: descargando el LiDAR, la BD TOPO, la foto aérea, el catastro y OpenStreetMap")
k("map.data.town.stage.map", "Plan de ville : calcul de la carte", "Town plan: computing the map", "Stadtplan: Die Karte wird berechnet", "Plano urbano: calculando el mapa")
k("map.data.town.stage.upload", "Plan de ville : envoi de la carte", "Town plan: sending the map", "Stadtplan: Die Karte wird gesendet", "Plano urbano: enviando el mapa")
k("map.data.town.stage.fetchList", "Plan de ville : téléchargement, encore {list}", "Town plan: downloading, still {list}", "Stadtplan: Herunterladen, noch {list}", "Plano urbano: descargando, aún {list}")
k("map.data.town.stage.mapStep", "Plan de ville : calcul de la carte — {step}", "Town plan: computing the map — {step}", "Stadtplan: Die Karte wird berechnet — {step}", "Plano urbano: calculando el mapa — {step}")
k("map.data.town.src.lidar", "le LiDAR HD de l'IGN", "IGN's LiDAR HD", "das LiDAR HD des IGN", "el LiDAR HD del IGN")
k("map.data.town.src.bdtopo", "la BD TOPO", "BD TOPO", "die BD TOPO", "la BD TOPO")
k("map.data.town.src.ortho", "la photo aérienne", "the aerial photograph", "das Luftbild", "la foto aérea")
k("map.data.town.src.cadastre", "le cadastre", "the cadastre", "das Kataster", "el catastro")
k("map.data.town.src.osm", "OpenStreetMap", "OpenStreetMap", "OpenStreetMap", "OpenStreetMap")
k("map.data.town.src.osmTry", "OpenStreetMap (essai {n})", "OpenStreetMap (try {n})", "OpenStreetMap (Versuch {n})", "OpenStreetMap (intento {n})")
k("map.data.town.step.points", "lecture des points LiDAR de la zone", "reading the area's LiDAR points", "die LiDAR-Punkte des Gebiets werden gelesen", "lectura de los puntos LiDAR de la zona")
k("map.data.town.step.photo", "la photo infrarouge (pelouses, arbres)", "the infrared photograph (lawns, trees)", "das Infrarotbild (Rasen, Bäume)", "la foto infrarroja (césped, árboles)")
k("map.data.town.step.vectors", "bâtiments, rues, chemins, eau, ponts et terrains de sport", "buildings, streets, paths, water, bridges and sports grounds", "Gebäude, Straßen, Wege, Wasser, Brücken und Sportplätze", "edificios, calles, caminos, agua, puentes y campos de deporte")
k("map.data.town.step.areas", "surfaces : végétation, zones pavées, jardins privés", "areas: vegetation, paved areas, private gardens", "Flächen: Vegetation, befestigte Flächen, Privatgärten", "superficies: vegetación, zonas pavimentadas, jardines privados")
k("map.data.town.step.lines", "lignes : bordures, murs, clôtures, passages", "lines: kerbs, walls, fences, passages", "Linien: Bordsteine, Mauern, Zäune, Durchgänge", "líneas: bordillos, muros, vallas, pasos")
k("map.data.town.step.contours", "courbes de niveau", "contours", "Höhenlinien", "curvas de nivel")
k("map.data.town.step.objects", "arbres isolés et objets de la carte", "lone trees and the map's objects", "Einzelbäume und Kartenobjekte", "árboles aislados y objetos del mapa")
k("map.data.town.waited", "{t} écoulées", "{t} elapsed", "{t} vergangen", "{t} transcurridos")
k("map.data.town.step.enclosures", "terrains enclos et accès", "enclosed ground and its access", "eingeschlossenes Gelände und Zugänge", "terrenos cerrados y accesos")
k("map.data.town.step.legibility", "contrôle de lisibilité (ISSprOM)", "legibility check (ISSprOM)", "Lesbarkeitsprüfung (ISSprOM)", "control de legibilidad (ISSprOM)")
k("map.data.town.leg.one", "Le contrôle de lisibilité du générateur a laissé {n} point à revoir (règles de l'ISSprOM) : lancez Vérifier.", "The generator's legibility check left {n} point to review (ISSprOM's rules): run Check.", "Die Lesbarkeitsprüfung des Generators hat {n} Stelle zum Überprüfen gelassen (Regeln der ISSprOM): Starte Prüfen.", "El control de legibilidad del generador ha dejado {n} punto por revisar (reglas de la ISSprOM): ejecuta Comprobar.")
k("map.data.town.leg.other", "Le contrôle de lisibilité du générateur a laissé {n} points à revoir (règles de l'ISSprOM) : lancez Vérifier.", "The generator's legibility check left {n} points to review (ISSprOM's rules): run Check.", "Die Lesbarkeitsprüfung des Generators hat {n} Stellen zum Überprüfen gelassen (Regeln der ISSprOM): Starte Prüfen.", "El control de legibilidad del generador ha dejado {n} puntos por revisar (reglas de la ISSprOM): ejecuta Comprobar.")
k("map.data.town.reading", "Plan de ville : lecture de la carte…", "Town plan: reading the map…", "Stadtplan: Die Karte wird gelesen…", "Plano urbano: leyendo el mapa…")
k("map.data.town.failed", "Le plan de ville n'a pas pu être fait : {error}", "The town plan could not be made: {error}", "Der Stadtplan konnte nicht erstellt werden: {error}", "No se pudo hacer el plano urbano: {error}")
k("map.data.town.gone", "Ce plan de ville n'est plus disponible : demandez-le à nouveau.", "This town plan is no longer available: ask for it again.", "Dieser Stadtplan ist nicht mehr verfügbar: Fordere ihn erneut an.", "Este plano urbano ya no está disponible: vuelve a pedirlo.")
k("map.data.town.credit", "LiDAR HD{date}, BD TOPO, BD ORTHO © IGN ; cadastre © DGFiP (Licence Ouverte 2.0) ; © les contributeurs d'OpenStreetMap (ODbL)", "LiDAR HD{date}, BD TOPO, BD ORTHO © IGN; cadastre © DGFiP (Licence Ouverte 2.0); © OpenStreetMap contributors (ODbL)", "LiDAR HD{date}, BD TOPO, BD ORTHO © IGN; Kataster © DGFiP (Licence Ouverte 2.0); © OpenStreetMap-Mitwirkende (ODbL)", "LiDAR HD{date}, BD TOPO, BD ORTHO © IGN; catastro © DGFiP (Licence Ouverte 2.0); © colaboradores de OpenStreetMap (ODbL)")
k("map.data.national.reading.tnm", "Lecture de The National Map (USGS)…", "Reading The National Map (USGS)…", "The National Map (USGS) wird gelesen…", "Leyendo The National Map (USGS)…")
k("map.src.swisstopo", "swisstopo", "swisstopo", "swisstopo", "swisstopo")
k("map.src.tnm", "The National Map (USGS)", "The National Map (USGS)", "The National Map (USGS)", "The National Map (USGS)")
k("map.lay.creditSwisstopo", "© swisstopo (swissTLM3D)", "© swisstopo (swissTLM3D)", "© swisstopo (swissTLM3D)", "© swisstopo (swissTLM3D)")
k("map.lay.creditTnm", "USGS The National Map, FEMA USA Structures (domaine public)", "USGS The National Map, FEMA USA Structures (public domain)", "USGS The National Map, FEMA USA Structures (gemeinfrei)", "USGS The National Map, FEMA USA Structures (dominio público)")
for key, v in {
  "swissimage": ("Photos aériennes SWISSIMAGE (Suisse)", "SWISSIMAGE aerial photos (Switzerland)", "SWISSIMAGE-Luftbilder (Schweiz)", "Fotos aéreas SWISSIMAGE (Suiza)"),
  "chmap": ("Carte nationale swisstopo (Suisse)", "swisstopo national map (Switzerland)", "Landeskarte swisstopo (Schweiz)", "Mapa nacional de swisstopo (Suiza)"),
  "usimagery": ("Photos aériennes USGS (États-Unis)", "USGS aerial imagery (USA)", "USGS-Luftbilder (USA)", "Imágenes aéreas del USGS (EE. UU.)"),
  "ustopo": ("Carte USGS Topo (États-Unis)", "USGS Topo map (USA)", "USGS-Topokarte (USA)", "Mapa USGS Topo (EE. UU.)"),
  "nzaerial": ("Photos aériennes LINZ (Nouvelle-Zélande)", "LINZ aerial imagery (New Zealand)", "LINZ-Luftbilder (Neuseeland)", "Fotos aéreas de LINZ (Nueva Zelanda)"),
  }.items(): k(f"map.bg.layer.{key}", *v)
for key, v in {
  "swissimage": ("Fond : © swisstopo, SWISSIMAGE", "Background: © swisstopo, SWISSIMAGE", "Hintergrund: © swisstopo, SWISSIMAGE", "Fondo: © swisstopo, SWISSIMAGE"),
  "chmap": ("Fond : © swisstopo, carte nationale", "Background: © swisstopo, national map", "Hintergrund: © swisstopo, Landeskarte", "Fondo: © swisstopo, mapa nacional"),
  "usimagery": ("Fond : USGS The National Map, orthophotos (domaine public)", "Background: USGS The National Map orthoimagery (public domain)", "Hintergrund: USGS The National Map, Orthofotos (gemeinfrei)", "Fondo: USGS The National Map, ortofotos (dominio público)"),
  "ustopo": ("Fond : USGS The National Map, US Topo (domaine public)", "Background: USGS The National Map, US Topo (public domain)", "Hintergrund: USGS The National Map, US Topo (gemeinfrei)", "Fondo: USGS The National Map, US Topo (dominio público)"),
  "nzaerial": ("Fond : © LINZ, photos aériennes (CC BY 4.0)", "Background: © LINZ aerial imagery (CC BY 4.0)", "Hintergrund: © LINZ, Luftbilder (CC BY 4.0)", "Fondo: © LINZ, fotos aéreas (CC BY 4.0)"),
  }.items(): k(f"map.bg.credit.{key}", *v)

# ---- support by place (mapper/support.js): what is missing where, and the way to ask Ozimut for a country --------------------
k("map.support.title", "Pas encore de prise en charge ici", "Not supported here yet", "Hier noch nicht unterstützt", "Aún sin soporte aquí")
k("map.support.close", "Fermer", "Close", "Schließen", "Cerrar")
k("map.support.missing", "Pour ce lieu, Cartographier n'a pas encore : {list}. OpenStreetMap et les tuiles de relief mondiales prennent le relais.", "For this place, Cartographier does not have yet: {list}. OpenStreetMap and the worldwide terrain tiles stand in.", "Für diesen Ort hat Cartographier noch nicht: {list}. OpenStreetMap und die weltweiten Reliefkacheln springen ein.", "Para este lugar, Cartographier aún no tiene: {list}. OpenStreetMap y las teselas de relieve mundiales toman el relevo.")
k("map.support.ask", "Ozimut peut ajouter les données ouvertes d'un pays, quels que soient les pays de votre compte : écrivez-nous en indiquant le pays et, si vous les connaissez, les données que les cartographes y utilisent.", "Ozimut can add a country's open data, whatever the countries of your account: write to us with the country and, if you know them, the data mappers use there.", "Ozimut kann die offenen Daten eines Landes hinzufügen, unabhängig von den Ländern deines Kontos: Schreib uns das Land und, wenn du sie kennst, die Daten, die Kartografen dort nutzen.", "Ozimut puede añadir los datos abiertos de un país, sean cuales sean los países de tu cuenta: escríbenos indicando el país y, si los conoces, los datos que usan allí los cartógrafos.")
k("map.support.link", "Demander la prise en charge", "Ask for support", "Unterstützung anfragen", "Solicitar soporte")
k("map.support.subject", "Cartographier : données de cartographie pour {where}", "Cartographier: mapping data for {where}", "Cartographier: Kartendaten für {where}", "Cartographier: datos cartográficos para {where}")
k("map.support.what.dem", "modèle de terrain national", "national terrain model", "nationales Geländemodell", "modelo digital del terreno nacional")
k("map.support.what.vectors", "données nationales (bâtiments, routes, eau)", "national data (buildings, roads, water)", "nationale Daten (Gebäude, Straßen, Gewässer)", "datos nacionales (edificios, carreteras, agua)")
k("map.support.what.lidar", "LiDAR (courbes, falaises, végétation)", "LiDAR (contours, cliffs, vegetation)", "LiDAR (Höhenlinien, Felsen, Vegetation)", "LiDAR (curvas, cortados, vegetación)")
k("map.support.what.backgrounds", "fonds nationaux (photos aériennes, carte)", "national backgrounds (aerial photos, map)", "nationale Hintergründe (Luftbilder, Karte)", "fondos nacionales (fotos aéreas, mapa)")

k("map.data.lidar.fetching", "Lecture des dalles : {done} sur {total} ({mb} Mo)…", "Reading the tiles: {done} of {total} ({mb} MB)…", "Kacheln werden gelesen: {done} von {total} ({mb} MB)…", "Leyendo las teselas: {done} de {total} ({mb} MB)…")
k("map.data.lidar.reading", "Courbes, falaises et points des {total} dalles mis en objets…", "Contours, cliffs and points of the {total} tiles turned into objects…", "Höhenlinien, Felsen und Punkte der {total} Kacheln werden zu Objekten…", "Curvas, cortados y puntos de las {total} teselas convertidos en objetos…")

# ---- the site's own catalogues (nav, tiles, beta) are written by `site_keys` below -----------------------------------------------
SITE = {
  "nav.orgMapper": ("Cartographier", "Mapping", "Kartieren", "Cartografiar"),
  "nav.orgMapper.hint": ("Dessiner et mettre à jour les cartes, comme avec OCAD ou OpenOrienteering Mapper", "Draw and update maps, as with OCAD or OpenOrienteering Mapper", "Karten zeichnen und aktualisieren, wie mit OCAD oder OpenOrienteering Mapper", "Dibujar y actualizar mapas, como con OCAD u OpenOrienteering Mapper"),
  "mt.orgMapper": ("Dessiner et mettre à jour ses cartes, du LiDAR au terrain", "Draw and update your maps, from LiDAR to the field", "Karten zeichnen und aktualisieren, vom LiDAR bis ins Gelände", "Dibujar y actualizar tus mapas, del LiDAR al terreno"),
  "beta.mapper.title": ("Cartographier, en version bêta", "Mapping, in beta", "Kartieren, in der Beta-Version", "Cartografiar, en versión beta"),
  "beta.mapper.subject": ("Cartographier : ", "Mapping: ", "Kartieren: ", "Cartografiar: "),
  "beta.mapper.body": ("<p>Cartographier vient d'être réalisé et n'a encore été que peu testé. C'est une <b>version bêta</b> : {try}</p><p>Gardez une copie de vos fichiers OCAD : un fichier réenregistré en OCAD garde tout ce que vous n'avez pas modifié, mais il n'a pas encore été vérifié dans OCAD lui-même.</p>",
    "<p>Mapping has just been built and has had little testing yet. It is a <b>beta version</b>: {try}</p><p>Keep a copy of your OCAD files: a file saved back as OCAD keeps everything you did not change, but has not yet been checked in OCAD itself.</p>",
    "<p>Kartieren wurde gerade entwickelt und ist noch wenig getestet. Es ist eine <b>Beta-Version</b>: {try}</p><p>Behalte eine Kopie deiner OCAD-Dateien: Eine als OCAD gespeicherte Datei behält alles Unveränderte, wurde aber noch nicht in OCAD selbst geprüft.</p>",
    "<p>Cartografiar acaba de crearse y aún se ha probado poco. Es una <b>versión beta</b>: {try}</p><p>Guarda una copia de tus archivos de OCAD: un archivo guardado de nuevo como OCAD conserva todo lo que no hayas modificado, pero todavía no se ha comprobado en el propio OCAD.</p>"),
  "beta.mapper.note": ("Version bêta, encore peu testée : gardez une copie de vos fichiers OCAD.", "Beta version, little tested yet: keep a copy of your OCAD files.", "Beta-Version, noch wenig getestet: Behalte eine Kopie deiner OCAD-Dateien.", "Versión beta, aún poco probada: guarda una copia de tus archivos de OCAD."),
  # the sprint set's own forms and helpers (2026-11-12, a mapper's review; docs/mapper/sets.mjs reads the English names)
  "ms.sp.s.501.4": ("Zone pavée, trafic important", "Paved area, heavy traffic", "Befestigte Fläche, starker Verkehr", "Área pavimentada, tráfico intenso"),
  "ms.sp.s.501.6": ("Zone pavée, emprise 1,4 m", "Paved area, footprint 1.4 m", "Befestigte Fläche, Breite 1,4 m", "Área pavimentada, anchura 1,4 m"),
  "ms.sp.s.501.7": ("Zone pavée, emprise 2 m", "Paved area, footprint 2 m", "Befestigte Fläche, Breite 2 m", "Área pavimentada, anchura 2 m"),
  "ms.sp.s.501.8": ("Zone pavée, emprise 3 m", "Paved area, footprint 3 m", "Befestigte Fläche, Breite 3 m", "Área pavimentada, anchura 3 m"),
  "ms.sp.s.501.9": ("Zone pavée, emprise 4 m", "Paved area, footprint 4 m", "Befestigte Fläche, Breite 4 m", "Área pavimentada, anchura 4 m"),
  "ms.sp.s.532.1": ("Escalier, 0,5 mm", "Stairway, 0.5 mm", "Treppe, 0,5 mm", "Escalera, 0,5 mm"),
  "ms.sp.s.532.2": ("Escalier, 0,75 mm", "Stairway, 0.75 mm", "Treppe, 0,75 mm", "Escalera, 0,75 mm"),
  "ms.sp.s.532.3": ("Escalier, 1 mm", "Stairway, 1 mm", "Treppe, 1 mm", "Escalera, 1 mm"),
  "ms.sp.s.532.4": ("Escalier, 1,25 mm", "Stairway, 1.25 mm", "Treppe, 1,25 mm", "Escalera, 1,25 mm"),
  "ms.sp.s.532.5": ("Escalier, 1,5 mm", "Stairway, 1.5 mm", "Treppe, 1,5 mm", "Escalera, 1,5 mm"),
  "ms.sp.s.532.6": ("Escalier, 2 mm", "Stairway, 2 mm", "Treppe, 2 mm", "Escalera, 2 mm"),
  "ms.sp.s.990": ("OpenStreetMap, ligne (masquée)", "OpenStreetMap line (hidden)", "OpenStreetMap-Linie (ausgeblendet)", "Línea de OpenStreetMap (oculta)"),
  "ms.sp.s.991": ("OpenStreetMap, point (masqué)", "OpenStreetMap point (hidden)", "OpenStreetMap-Punkt (ausgeblendet)", "Punto de OpenStreetMap (oculto)"),
  "ms.sp.s.993": ("Passage au niveau inférieur (masqué)", "Passage at the lower level (hidden)", "Durchgang auf der unteren Ebene (ausgeblendet)", "Paso en el nivel inferior (oculto)"),
  "ms.sp.s.995": ("Limite à confirmer (mur, clôture ou haie)", "Boundary to confirm (wall, fence or hedge)", "Grenze zu bestätigen (Mauer, Zaun oder Hecke)", "Límite por confirmar (muro, valla o seto)"),
  "ms.s.996": ("Courbe d'aide (LiDAR)", "Helper contour (LiDAR)", "Hilfshöhenlinie (LiDAR)", "Curva de ayuda (LiDAR)"),
  "ms.sp.s.996": ("Courbe d'aide (LiDAR)", "Helper contour (LiDAR)", "Hilfshöhenlinie (LiDAR)", "Curva de ayuda (LiDAR)"),
}

def french(s):
    s = re.sub(r" ([:;?!»])", NB + r"\1", s)
    s = re.sub(r"« ", "«" + NB, s)
    return s

def write(lang_i, lang):
    lines = [f"// Cartographier's catalogue in {['French', 'English', 'German', 'Spanish'][lang_i]} (Orga › « Cartographier », site/assets/js/mapper/), loaded by loadArea(\"mapper\") through mapper/lang.js; written by tools/mapper/catalogue.py (mapper.fr.js the reference).",
             "export default {"]
    for key, vals in E.items():
        v = vals[lang_i]
        if lang_i == 0: v = french(v)
        lines.append(f"  {json.dumps(key, ensure_ascii=False)}: {json.dumps(v, ensure_ascii=False)},")
    lines.append("};")
    (ROOT / f"site/assets/js/i18n/mapper.{lang}.js").write_bytes(("\n".join(lines) + "\n").encode("utf-8"))   # LF, on Windows too

for i, l in enumerate(["fr", "en", "de", "es"]): write(i, l)

# the site's catalogues: keys added after « nav.orgTracer.hint » / « mt.orgTracer » / « beta.direct.note » when missing
for i, l in enumerate(["fr", "en", "de", "es"]):
    p = ROOT / f"site/assets/js/i18n/{l}.js"
    raw = p.read_bytes().decode("utf-8")
    crlf = "\r\n" in raw
    s = raw.replace("\r\n", "\n")
    add = []
    for key, vals in SITE.items():
        if f'"{key}":' in s: continue
        v = french(vals[i]) if i == 0 else vals[i]
        add.append(f"  {json.dumps(key, ensure_ascii=False)}: {json.dumps(v, ensure_ascii=False)},")
    if add:
        m = s.rfind("\n}")
        s = s[:m] + "\n  // « Cartographier » (Orga, 2026-11-06)\n" + "\n".join(add) + s[m:]
        if crlf: s = s.replace("\n", "\r\n")
        p.write_bytes(s.encode("utf-8"))
print(len(E), "keys")
