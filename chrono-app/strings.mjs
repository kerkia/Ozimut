// The few words the app's main process shows itself — its menu and its dialogs — in the site's four languages. The
// screens' own texts are the page's. `strings(app.getLocale())`: French, German and Spanish readers get theirs, everyone
// else English; a key missing in a language falls back to English, never to French. `fill(text, { name })` puts values
// in the `{name}` places.

const en = {
  file: "File", open: "Open an event file…", folder: "Open the data folder", quit: "Quit", close: "Close window",
  edit: "Edit", undo: "Undo", redo: "Redo", cut: "Cut", copy: "Copy", paste: "Paste", selectAll: "Select all",
  view: "View", reload: "Reload", zoomIn: "Zoom in", zoomOut: "Zoom out", zoomReset: "Actual size", fullScreen: "Full screen", devTools: "Developer tools",
  help: "Help", about: "About Ozimut Chrono",
  aboutVersion: "Version {v}",
  aboutStations: "Other stations and phones on the same network open:",
  aboutNoNetwork: "This computer is on no network: other stations cannot reach it.",
  aboutRadio: "Radio punches (SIRAP): TCP port {port}",
  aboutNoRadio: "Radio punches (SIRAP): port {port} is taken by another program.",
  aboutFolder: "Data: {folder}",
  portTitle: "Card reader", portAsk: "Several serial ports are plugged in. Which one is the reader's?", cancel: "Cancel",
  startTitle: "Ozimut Chrono cannot start",
  startPorts: "Ports {a} to {b} are all taken on this computer.",
  startFolder: "The data folder cannot be used: {folder}",
  fileTitle: "Open an event file", fileKind: "Ozimut Chrono event",
  fileRead: "This file could not be read.",
  fileBad: "This file is not an Ozimut Chrono event.",
  fileNewer: "This file comes from a newer version of Ozimut Chrono: update the app to open it.",
  saveTitle: "Save", ok: "OK",
};

const fr = {
  file: "Fichier", open: "Ouvrir un fichier d'événement…", folder: "Ouvrir le dossier des données", quit: "Quitter", close: "Fermer la fenêtre",
  edit: "Édition", undo: "Annuler", redo: "Rétablir", cut: "Couper", copy: "Copier", paste: "Coller", selectAll: "Tout sélectionner",
  view: "Affichage", reload: "Recharger", zoomIn: "Zoom avant", zoomOut: "Zoom arrière", zoomReset: "Taille réelle", fullScreen: "Plein écran", devTools: "Outils de développement",
  help: "Aide", about: "À propos d'Ozimut Chrono",
  aboutVersion: "Version {v}",
  aboutStations: "Les autres postes et les téléphones du même réseau ouvrent :",
  aboutNoNetwork: "Cet ordinateur n'est sur aucun réseau : les autres postes ne peuvent pas le joindre.",
  aboutRadio: "Poinçons radio (SIRAP) : port TCP {port}",
  aboutNoRadio: "Poinçons radio (SIRAP) : le port {port} est pris par un autre logiciel.",
  aboutFolder: "Données : {folder}",
  portTitle: "Lecteur de puces", portAsk: "Plusieurs ports série sont branchés. Lequel est celui du lecteur ?", cancel: "Annuler",
  startTitle: "Ozimut Chrono ne peut pas démarrer",
  startPorts: "Les ports {a} à {b} sont tous pris sur cet ordinateur.",
  startFolder: "Le dossier des données ne peut pas être utilisé : {folder}",
  fileTitle: "Ouvrir un fichier d'événement", fileKind: "Événement Ozimut Chrono",
  fileRead: "Ce fichier n'a pas pu être lu.",
  fileBad: "Ce fichier n'est pas un événement Ozimut Chrono.",
  fileNewer: "Ce fichier vient d'une version plus récente d'Ozimut Chrono : mettez l'application à jour pour l'ouvrir.",
  saveTitle: "Enregistrer", ok: "OK",
};

const de = {
  file: "Datei", open: "Veranstaltungsdatei öffnen…", folder: "Datenordner öffnen", quit: "Beenden", close: "Fenster schließen",
  edit: "Bearbeiten", undo: "Rückgängig", redo: "Wiederholen", cut: "Ausschneiden", copy: "Kopieren", paste: "Einfügen", selectAll: "Alles auswählen",
  view: "Ansicht", reload: "Neu laden", zoomIn: "Vergrößern", zoomOut: "Verkleinern", zoomReset: "Originalgröße", fullScreen: "Vollbild", devTools: "Entwicklerwerkzeuge",
  help: "Hilfe", about: "Über Ozimut Chrono",
  aboutVersion: "Version {v}",
  aboutStations: "Andere Stationen und Telefone im selben Netz öffnen:",
  aboutNoNetwork: "Dieser Computer ist in keinem Netz: Andere Stationen können ihn nicht erreichen.",
  aboutRadio: "Funkposten (SIRAP): TCP-Port {port}",
  aboutNoRadio: "Funkposten (SIRAP): Port {port} ist von einem anderen Programm belegt.",
  aboutFolder: "Daten: {folder}",
  portTitle: "Chip-Lesegerät", portAsk: "Mehrere serielle Anschlüsse sind verbunden. Welcher gehört zum Lesegerät?", cancel: "Abbrechen",
  startTitle: "Ozimut Chrono kann nicht starten",
  startPorts: "Die Ports {a} bis {b} sind auf diesem Computer alle belegt.",
  startFolder: "Der Datenordner kann nicht benutzt werden: {folder}",
  fileTitle: "Veranstaltungsdatei öffnen", fileKind: "Ozimut-Chrono-Veranstaltung",
  fileRead: "Diese Datei konnte nicht gelesen werden.",
  fileBad: "Diese Datei ist keine Ozimut-Chrono-Veranstaltung.",
  fileNewer: "Diese Datei stammt aus einer neueren Version von Ozimut Chrono: Aktualisiere die App, um sie zu öffnen.",
  saveTitle: "Speichern", ok: "OK",
};

const es = {
  file: "Archivo", open: "Abrir un archivo de evento…", folder: "Abrir la carpeta de datos", quit: "Salir", close: "Cerrar la ventana",
  edit: "Edición", undo: "Deshacer", redo: "Rehacer", cut: "Cortar", copy: "Copiar", paste: "Pegar", selectAll: "Seleccionar todo",
  view: "Ver", reload: "Recargar", zoomIn: "Acercar", zoomOut: "Alejar", zoomReset: "Tamaño real", fullScreen: "Pantalla completa", devTools: "Herramientas de desarrollo",
  help: "Ayuda", about: "Acerca de Ozimut Chrono",
  aboutVersion: "Versión {v}",
  aboutStations: "Los demás puestos y los teléfonos de la misma red abren:",
  aboutNoNetwork: "Este ordenador no está en ninguna red: los demás puestos no pueden alcanzarlo.",
  aboutRadio: "Picadas por radio (SIRAP): puerto TCP {port}",
  aboutNoRadio: "Picadas por radio (SIRAP): el puerto {port} está ocupado por otro programa.",
  aboutFolder: "Datos: {folder}",
  portTitle: "Lector de tarjetas", portAsk: "Hay varios puertos serie conectados. ¿Cuál es el del lector?", cancel: "Cancelar",
  startTitle: "Ozimut Chrono no puede arrancar",
  startPorts: "Los puertos {a} a {b} están todos ocupados en este ordenador.",
  startFolder: "No se puede usar la carpeta de datos: {folder}",
  fileTitle: "Abrir un archivo de evento", fileKind: "Evento de Ozimut Chrono",
  fileRead: "No se ha podido leer este archivo.",
  fileBad: "Este archivo no es un evento de Ozimut Chrono.",
  fileNewer: "Este archivo viene de una versión más reciente de Ozimut Chrono: actualiza la aplicación para abrirlo.",
  saveTitle: "Guardar", ok: "OK",
};

const ALL = { en, fr, de, es };

/** The texts for a locale (« fr-CA », « de », « es-419 »…). */
export function strings(locale) {
  const lang = String(locale || "").slice(0, 2).toLowerCase();
  return { ...en, ...(ALL[lang] || en) };
}
export const fill = (text, vars = {}) => String(text).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
export const LANGS = Object.keys(ALL);
