#!/usr/bin/env python3
"""The app's texts in its four languages, French the reference wording (tutoiement on the child-facing screens,
German « du », Spanish « tú »). Writes Resources/Localizable.xcstrings and Resources/<lang>.lproj/InfoPlist.strings.

Edit the tables here, then run `python3 tools/strings.py` from track/ios and commit both outputs.
"""
import json
import pathlib

NB = " "  # French spaces before ; : ! ? and inside « »


def q(s):
    """French quotes with their non-breaking spaces."""
    return "«" + NB + s + NB + "»"


# key: (fr, en, de, es)
TEXTS = {
    "common.close": ("Fermer", "Close", "Schließen", "Cerrar"),
    "common.ok": ("OK", "OK", "OK", "Aceptar"),
    "common.cancel": ("Annuler", "Cancel", "Abbrechen", "Cancelar"),

    "start.title": ("Suivi en direct", "Live tracking", "Live-Verfolgung", "Seguimiento en directo"),
    "start.followedBy": ("Suivi(e) par %@", "Followed by %@", "Dir folgen: %@", "Te siguen: %@"),
    "start.nobody": ("Personne ne te suit pour l'instant", "Nobody follows you yet", "Noch folgt dir niemand",
                     "Todavía no te sigue nadie"),
    "start.gps": ("GPS", "GPS", "GPS", "GPS"),
    "start.gps.off": ("Localisation refusée", "Location denied", "Standort verweigert", "Ubicación denegada"),
    "start.gps.ask": ("Autorisation demandée au départ", "Permission asked at the start", "Erlaubnis wird beim Start erfragt",
                      "Se pedirá permiso al empezar"),
    "start.gps.reduced": ("Position approximative" + NB + ": active «" + NB + "Position exacte" + NB + "»",
                          "Approximate location: turn on “Precise Location”",
                          "Ungefährer Standort: „Genauer Standort“ einschalten",
                          "Ubicación aproximada: activa «Ubicación exacta»"),
    "start.gps.ok": ("Précision ±%ld m", "Accuracy ±%ld m", "Genauigkeit ±%ld m", "Precisión ±%ld m"),
    "start.gps.ready": ("Prêt", "Ready", "Bereit", "Listo"),
    "start.network": ("Réseau", "Network", "Netz", "Red"),
    "start.network.on": ("Connecté", "Online", "Verbunden", "Conectado"),
    "start.network.off": ("Hors ligne" + NB + ": les positions partiront plus tard",
                          "Offline: positions will be sent later",
                          "Offline: Positionen werden später gesendet",
                          "Sin conexión: las posiciones se enviarán después"),
    "start.battery": ("Batterie", "Battery", "Akku", "Batería"),
    "start.share": ("Partager ma position en direct", "Share my position live", "Meine Position live teilen",
                    "Compartir mi posición en directo"),
    "start.privacy": ("Ta position n'est envoyée qu'entre Démarrer et Arrêter.",
                      "Your position is only sent between Start and Stop.",
                      "Deine Position wird nur zwischen Start und Stopp gesendet.",
                      "Tu posición solo se envía entre Empezar y Parar."),
    "start.go": ("Démarrer", "Start", "Start", "Empezar"),
    "start.test": ("Tester le suivi (2" + NB + "min)", "Test tracking (2 min)", "Verfolgung testen (2 Min.)",
                   "Probar el seguimiento (2 min)"),
    "start.watch": ("Associer ma montre", "Pair my watch", "Meine Uhr koppeln", "Vincular mi reloj"),
    "start.watch.working": ("Association de la montre…", "Pairing the watch…", "Uhr wird gekoppelt…", "Vinculando el reloj…"),
    "start.watch.sent": ("Code envoyé à la montre", "Code sent to the watch", "Code an die Uhr gesendet",
                         "Código enviado al reloj"),
    "start.watch.fail": ("La montre n'a pas pu être associée", "The watch could not be paired",
                         "Die Uhr konnte nicht gekoppelt werden", "No se pudo vincular el reloj"),
    "start.settings": ("Ouvrir les Réglages", "Open Settings", "Einstellungen öffnen", "Abrir Ajustes"),
    "start.unpair": ("Oublier ce compte sur ce téléphone", "Forget this account on this phone",
                     "Dieses Konto auf diesem Telefon vergessen", "Olvidar esta cuenta en este teléfono"),
    "start.unpair.confirm": ("Ce téléphone n'enverra plus de position pour ce compte.",
                             "This phone will no longer send positions for this account.",
                             "Dieses Telefon sendet keine Positionen mehr für dieses Konto.",
                             "Este teléfono dejará de enviar posiciones para esta cuenta."),

    "run.title": ("Suivi en cours", "Tracking", "Verfolgung läuft", "Seguimiento en curso"),
    "run.distance": ("Distance", "Distance", "Strecke", "Distancia"),
    "run.pending": ("Positions en attente", "Positions waiting", "Wartende Positionen", "Posiciones en espera"),
    "run.lastSent": ("Envoyé il y a %ld" + NB + "s", "Sent %ld s ago", "Vor %ld s gesendet", "Enviado hace %ld s"),
    "run.never": ("Rien envoyé pour l'instant", "Nothing sent yet", "Noch nichts gesendet", "Aún no se ha enviado nada"),
    "run.stop": ("Arrêter", "Stop", "Stopp", "Parar"),
    "run.stop.hint": ("Appuie 2" + NB + "secondes pour arrêter", "Hold 2 seconds to stop", "Zum Stoppen 2 Sekunden drücken",
                      "Mantén 2 segundos para parar"),
    "run.help": ("J'ai besoin d'aide", "I need help", "Ich brauche Hilfe", "Necesito ayuda"),
    "run.help.confirm": ("Prévenir les personnes qui te suivent" + NB + "?", "Alert the people who follow you?",
                         "Die Personen benachrichtigen, die dir folgen?", "¿Avisar a quienes te siguen?"),
    "run.help.send": ("Envoyer l'alerte", "Send the alert", "Alarm senden", "Enviar la alerta"),
    "run.help.sent": ("Alerte envoyée", "Alert sent", "Alarm gesendet", "Alerta enviada"),
    "run.call": ("Appeler %@", "Call %@", "%@ anrufen", "Llamar al %@"),
    "run.ending": ("Envoi des dernières positions…", "Sending the last positions…", "Letzte Positionen werden gesendet…",
                   "Enviando las últimas posiciones…"),
    "run.offline": ("Pas de réseau" + NB + ": les positions sont gardées", "No network: positions are kept",
                    "Kein Netz: Positionen werden gespeichert", "Sin red: se guardan las posiciones"),
    "run.keepApp": ("Ne ferme pas l'application (ne la balaie pas vers le haut).",
                    "Don't close the app (don't swipe it away).",
                    "Schließe die App nicht (nicht wegwischen).",
                    "No cierres la app (no la deslices hacia arriba)."),

    "end.title": ("Course terminée", "Run finished", "Lauf beendet", "Carrera terminada"),
    "end.duration": ("Durée", "Duration", "Dauer", "Duración"),
    "end.fixes": ("Positions", "Positions", "Positionen", "Posiciones"),
    "end.reason.cap": ("Durée maximale atteinte", "Maximum duration reached", "Maximale Dauer erreicht",
                       "Duración máxima alcanzada"),
    "end.reason.remote": ("Arrêtée depuis le site", "Stopped from the site", "Über die Website beendet",
                          "Detenida desde el sitio"),
    "end.reason.closed": ("Le serveur avait déjà clos cette course", "The server had already closed this run",
                          "Der Server hatte diesen Lauf schon beendet", "El servidor ya había cerrado esta carrera"),
    "end.done": ("Terminé", "Done", "Fertig", "Hecho"),

    "pair.title": ("Associer ce téléphone", "Pair this phone", "Dieses Telefon koppeln", "Vincular este teléfono"),
    "pair.intro": ("Sur ozimut.com, ouvre " + q("Mes appareils") + " (ou " + q("Famille") + ") et affiche le code "
                   "d'association de ce téléphone.",
                   "On ozimut.com, open “My devices” (or “Family”) and show the pairing code for this phone.",
                   "Öffne auf ozimut.com „Meine Geräte“ (oder „Familie“) und lass dir den Kopplungscode für dieses "
                   "Telefon anzeigen.",
                   "En ozimut.com, abre «Mis dispositivos» (o «Familia») y muestra el código de vinculación de este "
                   "teléfono."),
    "pair.scan": ("Scanner le QR code", "Scan the QR code", "QR-Code scannen", "Escanear el código QR"),
    "pair.type": ("Ou tape le code à 8 caractères", "Or type the 8-character code", "Oder gib den 8-stelligen Code ein",
                  "O escribe el código de 8 caracteres"),
    "pair.go": ("Associer", "Pair", "Koppeln", "Vincular"),
    "pair.error.code": ("Code inconnu, déjà utilisé ou expiré", "Unknown, used or expired code",
                        "Code unbekannt, schon benutzt oder abgelaufen", "Código desconocido, usado o caducado"),
    "pair.error.many": ("Trop d'essais" + NB + ": réessaie dans quelques minutes", "Too many attempts: try again in a few minutes",
                        "Zu viele Versuche: versuche es in ein paar Minuten noch einmal",
                        "Demasiados intentos: vuelve a intentarlo en unos minutos"),
    "pair.error.network": ("Impossible de joindre Ozimut", "Cannot reach Ozimut", "Ozimut ist nicht erreichbar",
                           "No se puede contactar con Ozimut"),
    "pair.error.other": ("L'association a échoué", "Pairing failed", "Die Kopplung ist fehlgeschlagen",
                         "La vinculación ha fallado"),
    "pair.done": ("Associé au compte de %@", "Paired with %@'s account", "Mit dem Konto von %@ gekoppelt",
                  "Vinculado a la cuenta de %@"),
    "pair.camera.denied": ("Caméra refusée" + NB + ": tape le code", "Camera denied: type the code",
                           "Kamera verweigert: gib den Code ein", "Cámara denegada: escribe el código"),
    "removed": ("Ce téléphone a été retiré du compte. Associe-le à nouveau pour suivre une course.",
                "This phone was removed from the account. Pair it again to track a run.",
                "Dieses Telefon wurde vom Konto entfernt. Kopple es erneut, um einen Lauf zu verfolgen.",
                "Este teléfono se ha quitado de la cuenta. Vuelve a vincularlo para seguir una carrera."),
    "removed.watch": ("Cette montre a été retirée du compte.", "This watch was removed from the account.",
                      "Diese Uhr wurde vom Konto entfernt.", "Este reloj se ha quitado de la cuenta."),

    "test.title": ("Test de 2" + NB + "minutes", "Two-minute test", "2-Minuten-Test", "Prueba de 2 minutos"),
    "test.intro": ("Lance le test, verrouille le téléphone et garde-le 2" + NB + "minutes dans ta poche, comme pendant "
                   "une course. Ne balaie pas l'application vers le haut.",
                   "Start the test, lock the phone and keep it in your pocket for 2 minutes, as during a run. Don't swipe "
                   "the app away.",
                   "Starte den Test, sperre das Telefon und lass es 2 Minuten in der Tasche, wie bei einem Lauf. Wische die "
                   "App nicht weg.",
                   "Empieza la prueba, bloquea el teléfono y guárdalo 2 minutos en el bolsillo, como en una carrera. No "
                   "deslices la app hacia arriba."),
    "test.start": ("Lancer le test", "Start the test", "Test starten", "Empezar la prueba"),
    "test.running": ("Positions reçues" + NB + ": %ld, encore %ld" + NB + "s", "Positions received: %ld, %ld s left",
                     "Empfangene Positionen: %ld, noch %ld s", "Posiciones recibidas: %ld, quedan %ld s"),
    "test.good": ("Parfait" + NB + ": %ld positions en 2" + NB + "minutes. Le suivi marchera téléphone verrouillé.",
                  "Perfect: %ld positions in 2 minutes. Tracking will work with the phone locked.",
                  "Perfekt: %ld Positionen in 2 Minuten. Die Verfolgung funktioniert bei gesperrtem Telefon.",
                  "Perfecto: %ld posiciones en 2 minutos. El seguimiento funcionará con el teléfono bloqueado."),
    "test.bad": ("Seulement %ld positions en 2" + NB + "minutes. Vérifie dans Réglages que la localisation d'Ozimut est "
                 + q("Lorsque l'app est active") + " avec " + q("Position exacte") + ", et coupe le mode Économie d'énergie.",
                 "Only %ld positions in 2 minutes. In Settings, check that Ozimut's location is “While Using the App” with "
                 "“Precise Location”, and turn Low Power Mode off.",
                 "Nur %ld Positionen in 2 Minuten. Prüfe in den Einstellungen, dass Ozimuts Standort „Beim Verwenden der App“ "
                 "mit „Genauer Standort“ ist, und schalte den Stromsparmodus aus.",
                 "Solo %ld posiciones en 2 minutos. En Ajustes, comprueba que la ubicación de Ozimut está en «Cuando se use la "
                 "app» con «Ubicación exacta», y desactiva el modo de bajo consumo."),
    "test.again": ("Recommencer", "Try again", "Noch einmal", "Repetir"),
    "test.back": ("Retour", "Back", "Zurück", "Volver"),
    "test.busy": ("Une course est en cours", "A run is in progress", "Ein Lauf ist im Gang", "Hay una carrera en curso"),

    "watch.code.title": ("Code de la montre", "Watch code", "Code der Uhr", "Código del reloj"),
    "watch.code.help": ("Sur ozimut.com" + NB + ": " + q("Mes appareils") + " › " + q("Associer une montre") +
                        ", puis tape ce code. Ou associe-la depuis l'app Ozimut de ton iPhone.",
                        "On ozimut.com: “My devices” › “Pair a watch”, then type this code. Or pair it from the Ozimut "
                        "app on your iPhone.",
                        "Auf ozimut.com: „Meine Geräte“ › „Uhr koppeln“, dann diesen Code eingeben. Oder koppeln über die "
                        "Ozimut-App auf deinem iPhone.",
                        "En ozimut.com: «Mis dispositivos» › «Vincular un reloj» y escribe este código. O vincúlalo "
                        "desde la app Ozimut de tu iPhone."),
    "watch.help": ("Aide", "Help", "Hilfe", "Ayuda"),
    "watch.sent": ("envoyé il y a %ld" + NB + "s", "sent %ld s ago", "vor %ld s gesendet", "enviado hace %ld s"),
    "watch.never": ("rien envoyé", "nothing sent", "nichts gesendet", "nada enviado"),
    "watch.fixes": ("%ld positions", "%ld positions", "%ld Positionen", "%ld posiciones"),
    "watch.health": ("Autorise Santé pour enregistrer l'entraînement", "Allow Health to record the workout",
                     "Erlaube Health, das Training aufzuzeichnen", "Permite a Salud registrar el entrenamiento"),

    "live.title": ("Suivi Ozimut", "Ozimut tracking", "Ozimut-Verfolgung", "Seguimiento Ozimut"),
    "live.help": ("Aide demandée", "Help requested", "Hilfe angefordert", "Ayuda solicitada"),
    "live.pending": ("%ld en attente", "%ld waiting", "%ld wartend", "%ld en espera"),

    "health.name": ("Entraînement du %@", "Workout of %@", "Training vom %@", "Entrenamiento del %@"),
    "file.tooBig": ("Fichier trop volumineux", "File too large", "Datei zu groß", "Archivo demasiado grande"),
    "error.health": ("Santé n'est pas disponible", "Health is not available", "Health ist nicht verfügbar",
                     "Salud no está disponible"),
    "error.health.notFound": ("Entraînement introuvable", "Workout not found", "Training nicht gefunden",
                              "Entrenamiento no encontrado"),
}

# Info.plist's purpose strings (InfoPlist.strings), same order.
INFO = {
    "CFBundleDisplayName": ("Ozimut", "Ozimut", "Ozimut", "Ozimut"),
    "NSLocationWhenInUseUsageDescription": (
        "Ozimut envoie ta position aux personnes qui te suivent, seulement entre Démarrer et Arrêter.",
        "Ozimut sends your position to the people who follow you, only between Start and Stop.",
        "Ozimut sendet deine Position an die Personen, die dir folgen, nur zwischen Start und Stopp.",
        "Ozimut envía tu posición a quienes te siguen, solo entre Empezar y Parar."),
    "TrackRun": (
        "Le suivi en direct a besoin de ta position exacte.",
        "Live tracking needs your precise position.",
        "Die Live-Verfolgung braucht deinen genauen Standort.",
        "El seguimiento en directo necesita tu posición exacta."),
    "NSCameraUsageDescription": (
        "L'appareil photo lit un QR code d'association et photographie des cartes.",
        "The camera scans a pairing QR code and takes photos of maps.",
        "Die Kamera liest einen Kopplungs-QR-Code und fotografiert Karten.",
        "La cámara lee un código QR de vinculación y fotografía mapas."),
    "NSPhotoLibraryUsageDescription": (
        "Choisis une photo de carte ou un fichier à envoyer à Ozimut.",
        "Choose a map photo or a file to send to Ozimut.",
        "Wähle ein Kartenfoto oder eine Datei, die du an Ozimut sendest.",
        "Elige una foto de mapa o un archivo para enviar a Ozimut."),
    "NSMicrophoneUsageDescription": (
        "Une vidéo que tu enregistres pour Ozimut peut contenir le son.",
        "A video you record for Ozimut may include sound.",
        "Ein Video, das du für Ozimut aufnimmst, kann Ton enthalten.",
        "Un vídeo que grabes para Ozimut puede incluir sonido."),
    "NSHealthShareUsageDescription": (
        "Ozimut lit les tracés de tes entraînements pour que tu puisses les analyser.",
        "Ozimut reads the routes of your workouts so that you can analyse them.",
        "Ozimut liest die Routen deiner Trainings, damit du sie analysieren kannst.",
        "Ozimut lee las rutas de tus entrenamientos para que puedas analizarlas."),
    "NSHealthUpdateUsageDescription": (
        "Ozimut enregistre comme entraînements les courses suivies avec ta montre.",
        "Ozimut saves the runs tracked with your watch as workouts.",
        "Ozimut speichert die mit deiner Uhr verfolgten Läufe als Trainings.",
        "Ozimut guarda como entrenamientos las carreras seguidas con tu reloj."),
}

LANGS = ["fr", "en", "de", "es"]


def main():
    root = pathlib.Path(__file__).resolve().parent.parent / "Resources"
    root.mkdir(exist_ok=True)
    strings = {}
    for key in sorted(TEXTS):
        values = TEXTS[key]
        assert len(values) == 4, key
        loc = {}
        for lang, v in zip(LANGS, values):
            loc[lang] = {"stringUnit": {"state": "translated", "value": v}}
        strings[key] = {"extractionState": "manual", "localizations": loc}
    catalog = {"sourceLanguage": "en", "strings": strings, "version": "1.0"}
    (root / "Localizable.xcstrings").write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n",
                                                encoding="utf-8", newline="\n")
    for i, lang in enumerate(LANGS):
        d = root / (lang + ".lproj")
        d.mkdir(exist_ok=True)
        lines = ['/* Generated by tools/strings.py: edit there. */']
        for key, values in INFO.items():
            v = values[i].replace("\\", "\\\\").replace('"', '\\"')
            lines.append('"%s" = "%s";' % (key, v))
        (d / "InfoPlist.strings").write_text("\n".join(lines) + "\n", encoding="utf-8", newline="\n")


if __name__ == "__main__":
    main()
