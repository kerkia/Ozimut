#!/usr/bin/env python3
"""Ozitrac's texts in its four languages (the iPhone app, its notification extension and widget, the watch app), French
the reference wording (tutoiement, as the Android app), German « du », Spanish « tú »; the wording follows the Android
app's strings (track/android/app/src/main/res/values*/strings.xml). Writes Resources/Localizable.xcstrings and
Resources/<lang>.lproj/InfoPlist.strings.

Edit the tables here, then run `python3 tools/strings.py` from track/ios and commit both outputs. French is written with
plain spaces before : ; ! ? %, and inside « »; they become non-breaking spaces when written out (`french`).
"""
import json
import pathlib
import re

NB = " "  # French spaces before ; : ! ? % and inside « »


def french(s):
    s = re.sub(r" ([:;!?»]|%%|%)", NB + r"\1", s)
    return s.replace("« ", "«" + NB)


# key: (fr, en, de, es). Formats: %@ a text, %ld a number (String(format:)).
TEXTS = {
    "common.close": ("Fermer", "Close", "Schließen", "Cerrar"),
    "common.ok": ("OK", "OK", "OK", "Aceptar"),
    "common.cancel": ("Annuler", "Cancel", "Abbrechen", "Cancelar"),
    "retry": ("Réessayer", "Try again", "Erneut versuchen", "Reintentar"),
    "net.error": ("Ozitrac n'a pas pu joindre son serveur. Vérifie le réseau et réessaie.",
                  "Ozitrac could not reach its server. Check the network and try again.",
                  "Ozitrac konnte seinen Server nicht erreichen. Prüfe das Netz und versuche es noch einmal.",
                  "Ozitrac no ha podido contactar con su servidor. Revisa la red y vuelve a intentarlo."),

    "tab.me": ("Ma course", "My run", "Mein Lauf", "Mi carrera"),
    "tab.follow": ("Je suis", "Following", "Ich folge", "Sigo a"),

    "home.start": ("Démarrer une course", "Start a run", "Einen Lauf starten", "Empezar una carrera"),
    "home.openRun": ("Voir ma course", "Open my run", "Meinen Lauf öffnen", "Ver mi carrera"),
    "home.running": ("En course : %@ · %@", "Running: %@ · %@", "Unterwegs: %@ · %@", "En carrera: %@ · %@"),
    "home.name": ("Ton prénom pour ceux que tu invites : %@", "Your first name for the people you invite: %@",
                  "Dein Vorname für die Personen, die du einlädst: %@", "Tu nombre para quienes invitas: %@"),
    "home.noName": ("Tu n'as pas encore donné ton prénom.", "You have not given your first name yet.",
                    "Du hast deinen Vornamen noch nicht angegeben.", "Todavía no has dado tu nombre."),
    "home.changeName": ("Changer mon prénom", "Change my first name", "Meinen Vornamen ändern", "Cambiar mi nombre"),

    "name.title": ("Ton prénom", "Your first name", "Dein Vorname", "Tu nombre"),
    "name.text": ("Il est montré à ceux qui te suivent et à ceux que tu suis. Rien d'autre n'est demandé.",
                  "It is shown to the people who follow you and to those you follow. Nothing else is asked.",
                  "Er wird den Personen gezeigt, die dir folgen, und denen, denen du folgst. Sonst wird nichts abgefragt.",
                  "Se muestra a quienes te siguen y a quienes sigues. No se pide nada más."),
    "name.hint": ("Prénom", "First name", "Vorname", "Nombre"),

    "watchers.title": ("Qui me suit", "Who follows me", "Wer mir folgt", "Quién me sigue"),
    "watchers.none": ("Personne ne te suit encore. Ajoute quelqu'un : il scanne ton code avec son Ozitrac.",
                      "Nobody follows you yet. Add someone: they scan your code with their Ozitrac.",
                      "Noch niemand folgt dir. Füge jemanden hinzu: Die Person scannt deinen Code mit ihrem Ozitrac.",
                      "Todavía nadie te sigue. Añade a alguien: escanea tu código con su Ozitrac."),
    "watchers.add": ("Ajouter quelqu'un", "Add someone", "Jemanden hinzufügen", "Añadir a alguien"),
    "watchers.unknown": ("Quelqu'un", "Someone", "Jemand", "Alguien"),
    "watchers.remove": ("Retirer", "Remove", "Entfernen", "Quitar"),
    "watchers.removeAsk": ("%@ ne te suivra plus. Retirer ?", "%@ will no longer follow you. Remove?",
                           "%@ wird dir nicht mehr folgen. Entfernen?", "%@ dejará de seguirte. ¿Quitar?"),

    "runs.title": ("Mes courses", "My runs", "Meine Läufe", "Mis carreras"),
    "runs.text": ("Tes courses sont gardées sur ce téléphone seulement. Partage-les ou enregistre-les en GPX.",
                  "Your runs are kept on this phone only. Share them or save them as GPX.",
                  "Deine Läufe werden nur auf diesem Handy gespeichert. Teile sie oder speichere sie als GPX.",
                  "Tus carreras se guardan solo en este móvil. Compártelas o guárdalas en GPX."),
    "runs.none": ("Aucune course gardée pour l'instant.", "No run kept yet.", "Noch kein Lauf gespeichert.",
                  "Todavía no hay ninguna carrera guardada."),
    "runs.line": ("%@ · %@", "%@ · %@", "%@ · %@", "%@ · %@"),
    "runs.view": ("Voir", "See", "Ansehen", "Ver"),
    "runs.share": ("Partager", "Share", "Teilen", "Compartir"),
    "runs.save": ("Enregistrer", "Save", "Speichern", "Guardar"),
    "runs.delete": ("Supprimer", "Delete", "Löschen", "Borrar"),
    "runs.deleteAsk": ("Supprimer cette course de ce téléphone ? C'est définitif.",
                       "Delete this run from this phone? It cannot be undone.",
                       "Diesen Lauf von diesem Handy löschen? Das lässt sich nicht rückgängig machen.",
                       "¿Borrar esta carrera de este móvil? No se puede deshacer."),
    "runs.saved": ("GPX enregistré.", "GPX saved.", "GPX gespeichert.", "GPX guardado."),
    "runs.saveFailed": ("Le GPX n'a pas pu être enregistré.", "The GPX could not be saved.",
                        "Die GPX-Datei konnte nicht gespeichert werden.", "No se ha podido guardar el GPX."),
    "runs.watch": ("Enregistrée sur la montre", "Recorded on the watch", "Auf der Uhr aufgezeichnet", "Grabada en el reloj"),
    "runs.watch.received": ("Une course de ta montre est arrivée dans « Mes courses ».",
                            "A run from your watch has arrived in “My runs”.",
                            "Ein Lauf von deiner Uhr ist in „Meine Läufe“ angekommen.",
                            "Una carrera de tu reloj ha llegado a «Mis carreras»."),

    "zone.title": ("Zone", "Zone", "Zone", "Zona"),
    "zone.text": ("Déplace la carte pour mettre la croix au centre de ta zone, et donne son rayon. Si tu en sors pendant "
                  "une course, ceux qui te suivent sont prévenus.",
                  "Move the map to put the cross at the centre of your zone, and give its radius. If you leave it during "
                  "a run, the people who follow you are alerted.",
                  "Verschiebe die Karte, bis das Kreuz in der Mitte deiner Zone liegt, und gib ihren Radius an. "
                  "Verlässt du sie während eines Laufs, werden die Personen gewarnt, die dir folgen.",
                  "Mueve el mapa para poner la cruz en el centro de tu zona e indica su radio. Si sales de ella durante "
                  "una carrera, quienes te siguen reciben un aviso."),
    "zone.radius": ("Rayon (m)", "Radius (m)", "Radius (m)", "Radio (m)"),
    "zone.alert": ("Prévenir ceux qui me suivent si je sors de la zone", "Alert the people who follow me when I leave the zone",
                   "Die Personen warnen, die mir folgen, wenn ich die Zone verlasse",
                   "Avisar a quienes me siguen si salgo de la zona"),
    "zone.here": ("Ma position", "My position", "Mein Standort", "Mi posición"),
    "zone.save": ("Enregistrer", "Save", "Speichern", "Guardar"),
    "zone.saved": ("Zone enregistrée.", "Zone saved.", "Zone gespeichert.", "Zona guardada."),
    "zone.radiusBad": ("Le rayon doit faire au moins 50 m.", "The radius must be 50 m or more.",
                       "Der Radius muss mindestens 50 m betragen.", "El radio debe ser de 50 m o más."),
    "zone.on": ("Zone : %ld m autour de son centre", "Zone: %ld m around its centre", "Zone: %ld m um ihre Mitte",
                "Zona: %ld m alrededor de su centro"),
    "zone.off": ("Zone : aucune", "Zone: none", "Zone: keine", "Zona: ninguna"),

    "oz.title": ("Ozimut", "Ozimut", "Ozimut", "Ozimut"),
    "oz.text": ("Tu as un compte Ozimut ? Relie ce téléphone à ce compte : tes courses y vont aussi, et ceux qui t'y "
                "suivent les voient.",
                "Do you have an Ozimut account? Link this phone to it: your runs also go to that account, and the people "
                "who follow you there see them.",
                "Du hast ein Ozimut-Konto? Verbinde dieses Handy damit: Deine Läufe gehen dann auch an dieses Konto, und "
                "wer dir dort folgt, sieht sie.",
                "¿Tienes una cuenta de Ozimut? Vincula este móvil con ella: tus carreras irán también a esa cuenta, y "
                "quienes te siguen allí las verán."),
    "oz.link": ("Relier à Ozimut", "Link to Ozimut", "Mit Ozimut verbinden", "Vincular con Ozimut"),
    "oz.linked": ("Relié au compte Ozimut de %@.", "Linked to the Ozimut account of %@.",
                  "Verbunden mit dem Ozimut-Konto von %@.", "Vinculado con la cuenta de Ozimut de %@."),
    "oz.linkedText": ("Tes courses vont aussi à ce compte.", "Your runs also go to that account.",
                      "Deine Läufe gehen auch an dieses Konto.", "Tus carreras van también a esa cuenta."),
    "oz.unlink": ("Délier d'Ozimut", "Unlink from Ozimut", "Von Ozimut trennen", "Desvincular de Ozimut"),
    "oz.unlinkAsk": ("Délier ce téléphone d'Ozimut ? Tes courses n'iront plus à ce compte.",
                     "Unlink this phone from Ozimut? Your runs will no longer go to that account.",
                     "Dieses Handy von Ozimut trennen? Deine Läufe gehen dann nicht mehr an dieses Konto.",
                     "¿Desvincular este móvil de Ozimut? Tus carreras dejarán de ir a esa cuenta."),

    "data.title": ("Mes données", "My data", "Meine Daten", "Mis datos"),
    "data.text": ("Ozitrac n'a pas de compte. Son relais garde ton canal, ceux qui te suivent, ceux que tu suis et la "
                  "course en cours (chiffrée). Tes courses restent sur ce téléphone.",
                  "Ozitrac keeps no account. Its relay holds your channel, the people who follow you, those you follow, and "
                  "the run under way (encrypted). Your runs stay on this phone.",
                  "Ozitrac hat kein Konto. Sein Relais bewahrt deinen Kanal, die Personen, die dir folgen, die, denen du "
                  "folgst, und den laufenden Lauf (verschlüsselt). Deine Läufe bleiben auf diesem Telefon.",
                  "Ozitrac no tiene cuenta. Su relé guarda tu canal, quienes te siguen, a quienes sigues y la carrera en "
                  "curso (cifrada). Tus carreras se quedan en este teléfono."),
    "data.erase": ("Effacer mes données", "Erase my data", "Meine Daten löschen", "Borrar mis datos"),
    "data.eraseAsk": ("Effacer tes données sur le relais d'Ozitrac ? Plus personne ne te suivra, et tu ne suivras plus "
                      "personne. Tes courses restent sur ce téléphone.",
                      "Erase your data on Ozitrac's relay? Nobody will follow you any more, and you will follow nobody. "
                      "Your runs stay on this phone.",
                      "Deine Daten auf dem Relais von Ozitrac löschen? Niemand folgt dir mehr, und du folgst niemandem "
                      "mehr. Deine Läufe bleiben auf diesem Telefon.",
                      "¿Borrar tus datos del relé de Ozitrac? Nadie te seguirá ya, y tú no seguirás a nadie. Tus carreras "
                      "se quedan en este teléfono."),
    "data.erased": ("Tes données ont été effacées du relais.", "Your data was erased from the relay.",
                    "Deine Daten wurden vom Relais gelöscht.", "Tus datos se han borrado del relé."),

    "invite.title": ("Ajouter quelqu'un", "Add someone", "Jemanden hinzufügen", "Añadir a alguien"),
    "invite.making": ("Création du code…", "Making a code…", "Code wird erstellt…", "Creando el código…"),
    "invite.text": ("Demande-lui de scanner ce code avec Ozitrac, sur son téléphone. Il suivra tes courses en direct.",
                    "Ask them to scan this code with Ozitrac on their phone. They will follow your runs live.",
                    "Bitte die Person, diesen Code mit Ozitrac auf ihrem Handy zu scannen. Sie folgt dann deinen Läufen live.",
                    "Pídele que escanee este código con Ozitrac en su móvil. Seguirá tus carreras en directo."),
    "invite.once": ("Ce code sert une fois et dure 24 heures. Crées-en un par personne.",
                    "This code works once and lasts 24 hours. Make one for each person.",
                    "Dieser Code gilt einmal und 24 Stunden lang. Erstelle für jede Person einen eigenen.",
                    "Este código sirve una vez y dura 24 horas. Crea uno para cada persona."),
    "invite.share": ("Envoyer le lien", "Send the link", "Link senden", "Enviar el enlace"),
    "invite.message": ("%@ t'invite à suivre ses courses en direct avec Ozitrac : %@",
                       "%@ invites you to follow their runs live with Ozitrac: %@",
                       "%@ lädt dich ein, die Läufe live mit Ozitrac zu verfolgen: %@",
                       "%@ te invita a seguir sus carreras en directo con Ozitrac: %@"),
    "invite.done": ("Terminé", "Done", "Fertig", "Hecho"),

    "join.title": ("Suivre quelqu'un", "Follow someone", "Jemandem folgen", "Seguir a alguien"),
    "join.text": ("Suivre les courses de %@ en direct ?", "Follow %@'s runs live?", "Den Läufen von %@ live folgen?",
                  "¿Seguir en directo las carreras de %@?"),
    "join.go": ("Suivre", "Follow", "Folgen", "Seguir"),
    "join.err.code": ("Ce code a déjà servi ou a expiré. Demandes-en un nouveau.",
                      "This code was already used or has expired. Ask for a new one.",
                      "Dieser Code wurde schon benutzt oder ist abgelaufen. Bitte um einen neuen.",
                      "Este código ya se ha usado o ha caducado. Pide uno nuevo."),
    "join.err.gone": ("Cette personne ne partage plus ses courses.", "This person no longer shares their runs.",
                      "Diese Person teilt ihre Läufe nicht mehr.", "Esta persona ya no comparte sus carreras."),

    "follow.scan": ("Scanner un code", "Scan a code", "Einen Code scannen", "Escanear un código"),
    "follow.cameraDenied": ("Caméra refusée : autorise-la dans Réglages, ou ouvre le lien qu'on t'a envoyé.",
                            "Camera denied: allow it in Settings, or open the link you were sent.",
                            "Kamera verweigert: Erlaube sie in den Einstellungen oder öffne den Link, den du bekommen hast.",
                            "Cámara denegada: permítela en Ajustes o abre el enlace que te han enviado."),
    "follow.none": ("Tu ne suis encore personne. Demande à quelqu'un de te montrer son code, et scanne-le.",
                    "You follow nobody yet. Ask someone to show you their code, and scan it.",
                    "Du folgst noch niemandem. Lass dir von jemandem den Code zeigen und scanne ihn.",
                    "Todavía no sigues a nadie. Pide a alguien que te enseñe su código y escanéalo."),
    "follow.noRun": ("Pas de course", "No run", "Kein Lauf", "Sin carrera"),
    "follow.running": ("En course depuis %@", "Running for %@", "Unterwegs seit %@", "En carrera desde hace %@"),
    "follow.position": ("position il y a %@", "position %@ ago", "Position vor %@", "posición de hace %@"),
    "follow.ended": ("Course terminée à %@", "Run ended at %@", "Lauf beendet um %@", "Carrera terminada a las %@"),
    "follow.battery": ("batterie %ld %%", "battery %ld %%", "Akku %ld %%", "batería %ld %%"),
    "follow.gpx": ("Enregistrer en GPX", "Save as GPX", "Als GPX speichern", "Guardar en GPX"),
    "follow.stop": ("Ne plus suivre", "Stop following", "Nicht mehr folgen", "Dejar de seguir"),
    "follow.stopAsk": ("Ne plus suivre %@ ?", "Stop following %@?", "%@ nicht mehr folgen?", "¿Dejar de seguir a %@?"),
    "follow.gone": ("Cette personne ne partage plus ses courses avec toi.", "This person no longer shares their runs with you.",
                    "Diese Person teilt ihre Läufe nicht mehr mit dir.", "Esta persona ya no comparte sus carreras contigo."),
    "follow.nothing": ("Rien de reçu pour l'instant.", "Nothing received yet.", "Noch nichts empfangen.",
                       "Todavía no se ha recibido nada."),
    "map.follow": ("Suivre", "Follow", "Folgen", "Seguir"),

    "alert.start": ("%@ a démarré une course", "%@ has started a run", "%@ hat einen Lauf gestartet",
                    "%@ ha empezado una carrera"),
    "alert.end": ("%@ a terminé sa course", "%@ has ended their run", "%@ hat den Lauf beendet", "%@ ha terminado su carrera"),
    "alert.help": ("%@ a besoin d'aide !", "%@ needs help!", "%@ braucht Hilfe!", "¡%@ necesita ayuda!"),
    "alert.silent": ("Plus de nouvelles de %@ depuis 3 minutes", "No news from %@ for 3 minutes", "Seit 3 Minuten nichts von %@",
                     "Sin noticias de %@ desde hace 3 minutos"),
    "alert.battery": ("La batterie de %@ est faible", "%@'s battery is low", "Der Akku von %@ ist schwach",
                      "A %@ le queda poca batería"),
    "alert.still": ("%@ n'a pas bougé depuis 5 minutes", "%@ has not moved for 5 minutes",
                    "%@ hat sich seit 5 Minuten nicht bewegt", "%@ no se ha movido en 5 minutos"),
    "alert.zone": ("%@ est sorti(e) de sa zone", "%@ has left their zone", "%@ hat die Zone verlassen", "%@ ha salido de su zona"),
    "alert.other": ("Nouvelles de %@", "News from %@", "Neues von %@", "Noticias de %@"),
    # The relay's notifications (aps.alert.loc-key): the words without the name, which the extension then puts in.
    "OZ_ALERT_START": ("Une personne que tu suis a démarré une course", "Someone you follow has started a run",
                       "Jemand, dem du folgst, hat einen Lauf gestartet", "Alguien a quien sigues ha empezado una carrera"),
    "OZ_ALERT_END": ("Une personne que tu suis a terminé sa course", "Someone you follow has ended their run",
                     "Jemand, dem du folgst, hat den Lauf beendet", "Alguien a quien sigues ha terminado su carrera"),
    "OZ_ALERT_HELP": ("Une personne que tu suis a besoin d'aide !", "Someone you follow needs help!",
                      "Jemand, dem du folgst, braucht Hilfe!", "¡Alguien a quien sigues necesita ayuda!"),
    "OZ_ALERT_SILENT": ("Plus de nouvelles d'une personne que tu suis depuis 3 minutes",
                        "No news for 3 minutes from someone you follow",
                        "Seit 3 Minuten nichts von jemandem, dem du folgst",
                        "Sin noticias desde hace 3 minutos de alguien a quien sigues"),
    "OZ_ALERT_BATTERY": ("La batterie d'une personne que tu suis est faible", "The battery of someone you follow is low",
                         "Der Akku von jemandem, dem du folgst, ist schwach", "A alguien a quien sigues le queda poca batería"),
    "OZ_ALERT_STILL": ("Une personne que tu suis n'a pas bougé depuis 5 minutes",
                       "Someone you follow has not moved for 5 minutes",
                       "Jemand, dem du folgst, hat sich seit 5 Minuten nicht bewegt",
                       "Alguien a quien sigues no se ha movido en 5 minutos"),
    "OZ_ALERT_ZONE": ("Une personne que tu suis est sortie de sa zone", "Someone you follow has left their zone",
                      "Jemand, dem du folgst, hat die Zone verlassen", "Alguien a quien sigues ha salido de su zona"),
    "ago.s": ("%ld s", "%ld s", "%ld s", "%ld s"),
    "ago.min": ("%ld min", "%ld min", "%ld min", "%ld min"),
    "ago.h": ("%ld h", "%ld h", "%ld h", "%ld h"),

    "start.title": ("Ma course", "My run", "Mein Lauf", "Mi carrera"),
    "start.followedBy": ("Suivi(e) par %@", "Followed by %@", "Dir folgen: %@", "Te siguen: %@"),
    "start.gps": ("GPS", "GPS", "GPS", "GPS"),
    "start.gps.off": ("Localisation refusée", "Location denied", "Standort verweigert", "Ubicación denegada"),
    "start.gps.ask": ("Autorisation demandée au départ", "Permission asked at the start", "Erlaubnis wird beim Start erfragt",
                      "Se pedirá permiso al empezar"),
    "start.gps.reduced": ("Position approximative : active « Position exacte »",
                          "Approximate location: turn on “Precise Location”",
                          "Ungefährer Standort: „Genauer Standort“ einschalten",
                          "Ubicación aproximada: activa «Ubicación exacta»"),
    "start.gps.ok": ("Précision ±%ld m", "Accuracy ±%ld m", "Genauigkeit ±%ld m", "Precisión ±%ld m"),
    "start.gps.ready": ("Prêt", "Ready", "Bereit", "Listo"),
    "start.network": ("Réseau", "Network", "Netz", "Red"),
    "start.network.on": ("Connecté", "Online", "Verbunden", "Conectado"),
    "start.network.off": ("Hors ligne : les positions partiront plus tard", "Offline: positions will be sent later",
                          "Offline: Positionen werden später gesendet", "Sin conexión: las posiciones se enviarán después"),
    "start.battery": ("Batterie", "Battery", "Akku", "Batería"),
    "start.share": ("Partager en direct avec ceux qui me suivent", "Share live with the people who follow me",
                    "Live mit den Personen teilen, die mir folgen", "Compartir en directo con quienes me siguen"),
    "start.privacy": ("Ta position n'est envoyée qu'entre Démarrer et Arrêter.",
                      "Your position is only sent between Start and Stop.",
                      "Deine Position wird nur zwischen Start und Stopp gesendet.",
                      "Tu posición solo se envía entre Empezar y Parar."),
    "start.go": ("Démarrer", "Start", "Start", "Empezar"),
    "start.test": ("Test de 2 minutes", "Two-minute test", "2-Minuten-Test", "Prueba de 2 minutos"),
    "start.settings": ("Ouvrir les Réglages", "Open Settings", "Einstellungen öffnen", "Abrir Ajustes"),
    "tr.followedNobody": ("Personne ne te suit encore : ta course reste sur ce téléphone.",
                          "Nobody follows you yet: your run is kept on this phone.",
                          "Noch niemand folgt dir: Dein Lauf bleibt auf diesem Handy.",
                          "Todavía nadie te sigue: tu carrera se queda en este móvil."),
    "tr.followedOzimut": ("Tes courses vont à ton compte Ozimut.", "Your runs go to your Ozimut account.",
                          "Deine Läufe gehen an dein Ozimut-Konto.", "Tus carreras van a tu cuenta de Ozimut."),
    "tr.local": ("Ta course reste sur ce téléphone seulement.", "Your run stays on this phone only.",
                 "Dein Lauf bleibt nur auf diesem Handy.", "Tu carrera se queda solo en este móvil."),
    "tr.kept": ("Ta course est gardée sur ce téléphone.", "Your run is kept on this phone.",
                "Dein Lauf ist auf diesem Handy gespeichert.", "Tu carrera está guardada en este móvil."),

    "run.title": ("Ma course", "My run", "Mein Lauf", "Mi carrera"),
    "run.distance": ("Distance", "Distance", "Strecke", "Distancia"),
    "run.pending": ("Positions en attente", "Positions waiting", "Wartende Positionen", "Posiciones en espera"),
    "run.lastSent": ("Envoyé il y a %ld s", "Sent %ld s ago", "Vor %ld s gesendet", "Enviado hace %ld s"),
    "run.never": ("Rien envoyé pour l'instant", "Nothing sent yet", "Noch nichts gesendet", "Aún no se ha enviado nada"),
    "run.stop": ("Arrêter", "Stop", "Stopp", "Parar"),
    "run.stop.hint": ("Appuie 2 secondes pour arrêter", "Hold 2 seconds to stop", "Zum Stoppen 2 Sekunden drücken",
                      "Mantén 2 segundos para parar"),
    "run.help": ("J'ai besoin d'aide", "I need help", "Ich brauche Hilfe", "Necesito ayuda"),
    "run.help.confirm": ("Prévenir les personnes qui te suivent ?", "Alert the people who follow you?",
                         "Die Personen benachrichtigen, die dir folgen?", "¿Avisar a quienes te siguen?"),
    "run.help.send": ("Envoyer l'alerte", "Send the alert", "Alarm senden", "Enviar la alerta"),
    "run.help.sent": ("Aide demandée : ceux qui te suivent sont prévenus.",
                      "Help asked: the people who follow you are alerted.",
                      "Hilfe angefordert: Die Personen, die dir folgen, sind gewarnt.",
                      "Ayuda pedida: quienes te siguen reciben un aviso."),
    "run.call": ("Appeler %@", "Call %@", "%@ anrufen", "Llamar al %@"),
    "run.ending": ("Envoi des dernières positions…", "Sending the last positions…", "Letzte Positionen werden gesendet…",
                   "Enviando las últimas posiciones…"),
    "run.offline": ("Pas de réseau : les positions sont gardées", "No network: positions are kept",
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
    "end.reason.remote": ("Arrêtée depuis Ozimut", "Stopped from Ozimut", "Über Ozimut beendet", "Detenida desde Ozimut"),
    "end.reason.closed": ("Le serveur avait déjà clos cette course", "The server had already closed this run",
                          "Der Server hatte diesen Lauf schon beendet", "El servidor ya había cerrado esta carrera"),
    "end.done": ("Terminé", "Done", "Fertig", "Hecho"),

    "pair.title": ("Relier à Ozimut", "Link to Ozimut", "Mit Ozimut verbinden", "Vincular con Ozimut"),
    "pair.intro": ("Sur ozimut.com, dans « Suivi GPS », crée un code pour ton compte ou celui de ton enfant. Scanne son QR "
                   "code, ou tape ses 8 caractères. Tes courses iront aussi à ce compte.",
                   "On ozimut.com, in “GPS tracking”, make a code for your account or your child's. Scan its QR code, or "
                   "type its 8 characters. Your runs then go to that account too.",
                   "Erstelle auf ozimut.com unter „GPS-Verfolgung“ einen Code für dein Konto oder das deines Kindes. Scanne "
                   "seinen QR-Code oder tippe seine 8 Zeichen ein. Deine Läufe gehen dann auch an dieses Konto.",
                   "En ozimut.com, en «Seguimiento GPS», crea un código para tu cuenta o la de tu hijo. Escanea su código QR "
                   "o escribe sus 8 caracteres. Tus carreras irán también a esa cuenta."),
    "pair.scan": ("Scanner le QR code", "Scan the QR code", "QR-Code scannen", "Escanear el código QR"),
    "pair.type": ("Ou tape le code à 8 caractères", "Or type the 8-character code", "Oder gib den 8-stelligen Code ein",
                  "O escribe el código de 8 caracteres"),
    "pair.go": ("Relier", "Link", "Verbinden", "Vincular"),
    "pair.error.code": ("Code inconnu, déjà utilisé ou expiré", "Unknown, used or expired code",
                        "Code unbekannt, schon benutzt oder abgelaufen", "Código desconocido, usado o caducado"),
    "pair.error.many": ("Trop d'essais : réessaie dans quelques minutes", "Too many attempts: try again in a few minutes",
                        "Zu viele Versuche: versuche es in ein paar Minuten noch einmal",
                        "Demasiados intentos: vuelve a intentarlo en unos minutos"),
    "pair.error.network": ("Impossible de joindre Ozimut", "Cannot reach Ozimut", "Ozimut ist nicht erreichbar",
                           "No se puede contactar con Ozimut"),
    "pair.error.other": ("La liaison a échoué", "Linking failed", "Die Verbindung ist fehlgeschlagen",
                         "La vinculación ha fallado"),
    "pair.done": ("Relié au compte Ozimut de %@", "Linked to %@'s Ozimut account", "Mit dem Ozimut-Konto von %@ verbunden",
                  "Vinculado con la cuenta de Ozimut de %@"),
    "pair.camera.denied": ("Caméra refusée : tape le code", "Camera denied: type the code",
                           "Kamera verweigert: gib den Code ein", "Cámara denegada: escribe el código"),
    "removed": ("Ce téléphone a été retiré de son compte Ozimut.", "This phone was removed from its Ozimut account.",
                "Dieses Handy wurde aus seinem Ozimut-Konto entfernt.", "Este móvil se ha quitado de su cuenta de Ozimut."),
    "removed.watch": ("Cette montre a été retirée de son compte Ozimut.", "This watch was removed from its Ozimut account.",
                      "Diese Uhr wurde aus ihrem Ozimut-Konto entfernt.", "Este reloj se ha quitado de su cuenta de Ozimut."),

    "test.title": ("Test de 2 minutes", "Two-minute test", "2-Minuten-Test", "Prueba de 2 minutos"),
    "test.intro": ("Lance le test, verrouille le téléphone et garde-le 2 minutes dans ta poche, comme pendant "
                   "une course. Ne balaie pas l'application vers le haut.",
                   "Start the test, lock the phone and keep it in your pocket for 2 minutes, as during a run. Don't swipe "
                   "the app away.",
                   "Starte den Test, sperre das Telefon und lass es 2 Minuten in der Tasche, wie bei einem Lauf. Wische die "
                   "App nicht weg.",
                   "Empieza la prueba, bloquea el teléfono y guárdalo 2 minutos en el bolsillo, como en una carrera. No "
                   "deslices la app hacia arriba."),
    "test.start": ("Lancer le test", "Start the test", "Test starten", "Empezar la prueba"),
    "test.running": ("Positions reçues : %ld, encore %ld s", "Positions received: %ld, %ld s left",
                     "Empfangene Positionen: %ld, noch %ld s", "Posiciones recibidas: %ld, quedan %ld s"),
    "test.good": ("Parfait : %ld positions en 2 minutes. Le suivi marchera téléphone verrouillé.",
                  "Perfect: %ld positions in 2 minutes. Tracking will work with the phone locked.",
                  "Perfekt: %ld Positionen in 2 Minuten. Die Verfolgung funktioniert bei gesperrtem Telefon.",
                  "Perfecto: %ld posiciones en 2 minutos. El seguimiento funcionará con el teléfono bloqueado."),
    "test.bad": ("Seulement %ld positions en 2 minutes. Vérifie dans Réglages que la localisation d'Ozitrac est "
                 "« Lorsque l'app est active » avec « Position exacte », et coupe le mode Économie d'énergie.",
                 "Only %ld positions in 2 minutes. In Settings, check that Ozitrac's location is “While Using the App” with "
                 "“Precise Location”, and turn Low Power Mode off.",
                 "Nur %ld Positionen in 2 Minuten. Prüfe in den Einstellungen, dass der Standort von Ozitrac „Beim Verwenden "
                 "der App“ mit „Genauer Standort“ ist, und schalte den Stromsparmodus aus.",
                 "Solo %ld posiciones en 2 minutos. En Ajustes, comprueba que la ubicación de Ozitrac está en «Cuando se use "
                 "la app» con «Ubicación exacta», y desactiva el modo de bajo consumo."),
    "test.again": ("Recommencer", "Try again", "Noch einmal", "Repetir"),
    "test.back": ("Retour", "Back", "Zurück", "Volver"),
    "test.busy": ("Une course est en cours. Réessaie après.", "A run is being recorded. Try again after it.",
                  "Ein Lauf wird aufgezeichnet. Versuche es danach noch einmal.",
                  "Se está grabando una carrera. Vuelve a intentarlo después."),

    "watch.code.title": ("Relier à Ozimut", "Link to Ozimut", "Mit Ozimut verbinden", "Vincular con Ozimut"),
    "watch.code.help": ("Sur ozimut.com › Suivi GPS › Associer une montre, tape ce code.",
                        "On ozimut.com › GPS tracking › Pair a watch, type this code.",
                        "Gib diesen Code auf ozimut.com › GPS-Verfolgung › Eine Uhr verbinden ein.",
                        "En ozimut.com › Seguimiento GPS › Vincular un reloj, escribe este código."),
    "watch.help": ("Aide (maintenir)", "Help (hold)", "Hilfe (halten)", "Ayuda (mantener)"),
    "watch.sent": ("envoyé il y a %ld s", "sent %ld s ago", "vor %ld s gesendet", "enviado hace %ld s"),
    "watch.never": ("rien envoyé", "nothing sent", "nichts gesendet", "nada enviado"),
    "watch.local": ("gardée sur la montre", "kept on the watch", "auf der Uhr gespeichert", "guardada en el reloj"),
    "watch.fixes": ("%ld positions", "%ld positions", "%ld Positionen", "%ld posiciones"),
    "watch.kept": ("Course gardée sur la montre. Elle ira dans « Mes courses » sur ton iPhone.",
                   "Run kept on the watch. It will go to “My runs” on your iPhone.",
                   "Lauf auf der Uhr gespeichert. Er kommt in „Meine Läufe“ auf deinem iPhone.",
                   "Carrera guardada en el reloj. Irá a «Mis carreras» en tu iPhone."),
    "watch.health": ("Autorise Santé pour enregistrer l'entraînement", "Allow Health to record the workout",
                     "Erlaube Health, das Training aufzuzeichnen", "Permite a Salud registrar el entrenamiento"),
    "watch.nobody": ("Personne ne te suit encore : la course reste sur la montre.",
                     "Nobody follows you yet: the run stays on the watch.",
                     "Noch niemand folgt dir: Der Lauf bleibt auf der Uhr.",
                     "Todavía nadie te sigue: la carrera se queda en el reloj."),
    "watch.ozLinked": ("Ozimut : %@", "Ozimut: %@", "Ozimut: %@", "Ozimut: %@"),
    "watch.ozUnlink": ("Délier d'Ozimut (maintenir)", "Unlink Ozimut (hold)", "Von Ozimut trennen (halten)",
                       "Desvincular de Ozimut (mantener)"),
    "watch.nameText": ("Montré à ceux qui te suivent.", "Shown to the people who follow you.",
                       "Wird den Personen gezeigt, die dir folgen.", "Se muestra a quienes te siguen."),
    "watch.qrTitle": ("Scanne avec Ozitrac sur le téléphone", "Scan with Ozitrac on the phone",
                      "Mit Ozitrac auf dem Handy scannen", "Escanea con Ozitrac en el móvil"),
    "watch.qrOnce": ("Pour une personne, dans les 24 heures.", "For one person, within 24 hours.",
                     "Für eine Person, innerhalb von 24 Stunden.", "Para una persona, en 24 horas."),

    "live.title": ("Ozitrac", "Ozitrac", "Ozitrac", "Ozitrac"),
    "live.help": ("Aide demandée", "Help requested", "Hilfe angefordert", "Ayuda solicitada"),
    "live.pending": ("%ld en attente", "%ld waiting", "%ld wartend", "%ld en espera"),
}

# Info.plist's purpose strings (InfoPlist.strings), same order.
INFO = {
    "CFBundleDisplayName": ("Ozitrac", "Ozitrac", "Ozitrac", "Ozitrac"),
    "NSLocationWhenInUseUsageDescription": (
        "Ozitrac enregistre ta course et l'envoie, chiffrée, aux personnes que tu as choisies, seulement entre Démarrer et "
        "Arrêter.",
        "Ozitrac records your run and sends it, sealed, to the people you chose, only between Start and Stop.",
        "Ozitrac zeichnet deinen Lauf auf und sendet ihn verschlüsselt an die Personen, die du gewählt hast, nur zwischen "
        "Start und Stopp.",
        "Ozitrac graba tu carrera y la envía, cifrada, a las personas que has elegido, solo entre Empezar y Parar."),
    "TrackRun": (
        "Le suivi en direct a besoin de ta position exacte.",
        "Live tracking needs your precise position.",
        "Die Live-Verfolgung braucht deinen genauen Standort.",
        "El seguimiento en directo necesita tu posición exacta."),
    "NSCameraUsageDescription": (
        "L'appareil photo lit le code de la personne que tu suis, ou de ton compte Ozimut.",
        "The camera scans the code of the person you follow, or of your Ozimut account.",
        "Die Kamera liest den Code der Person, der du folgst, oder deines Ozimut-Kontos.",
        "La cámara lee el código de la persona a la que sigues, o de tu cuenta de Ozimut."),
    "NSHealthShareUsageDescription": (
        "Ozitrac enregistre ta course comme un entraînement.",
        "Ozitrac records your run as a workout.",
        "Ozitrac zeichnet deinen Lauf als Training auf.",
        "Ozitrac graba tu carrera como un entrenamiento."),
    "NSHealthUpdateUsageDescription": (
        "Ozitrac enregistre ta course comme un entraînement, avec son tracé.",
        "Ozitrac saves your run as a workout with its route.",
        "Ozitrac speichert deinen Lauf als Training mit seiner Route.",
        "Ozitrac guarda tu carrera como un entrenamiento con su ruta."),
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
            loc[lang] = {"stringUnit": {"state": "translated", "value": french(v) if lang == "fr" else v}}
        strings[key] = {"extractionState": "manual", "localizations": loc}
    catalog = {"sourceLanguage": "en", "strings": strings, "version": "1.0"}
    (root / "Localizable.xcstrings").write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n",
                                                encoding="utf-8", newline="\n")
    for i, lang in enumerate(LANGS):
        d = root / (lang + ".lproj")
        d.mkdir(exist_ok=True)
        lines = ['/* Generated by tools/strings.py: edit there. */']
        for key, values in INFO.items():
            v = french(values[i]) if lang == "fr" else values[i]
            v = v.replace("\\", "\\\\").replace('"', '\\"')
            lines.append('"%s" = "%s";' % (key, v))
        (d / "InfoPlist.strings").write_text("\n".join(lines) + "\n", encoding="utf-8", newline="\n")


if __name__ == "__main__":
    main()
