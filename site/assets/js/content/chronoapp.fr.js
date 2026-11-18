// The documentation of Ozimut Chrono's desktop application (chrono-app/), in French — the reference: chronoapp.en.js, .de.js
// and .es.js in step, the same sections under the same ids. Plain data, so that both readers render it without helpers of
// their own: the application's own page (chrono/ui/appdoc.js, chrono-app/www/doc.html) and Orga's documentation on the site
// (content/guide.*.js, chapter « chrono-app »). `html` is static markup: h3, p, ul, ol, table, code, kbd, b — no script, no
// link to another page. Every statement was checked against chrono-app/main.mjs, hub.mjs and strings.mjs: when the
// application changes (a port, a menu, a folder), change the four files.
export default {
  title: "L'application Ozimut Chrono",
  lede: "Le chronométrage d'Ozimut installé sur un ordinateur : sans Internet, plusieurs postes reliés, tickets imprimés sans fenêtre. Ce mode d'emploi est le même dans l'application (Aide › Documentation) et dans la documentation d'Orga sur ozimut.com.",
  sections: [
    { id: "what", title: "À quoi sert l'application", html: `
      <p>L'application Ozimut Chrono montre les mêmes écrans que l'onglet « Chrono » d'un événement d'Orga, sur ozimut.com. Elle fait en plus
        ce qu'un onglet de navigateur ne peut pas faire :</p>
      <ul>
        <li>elle marche <b>sans Internet</b> ;</li>
        <li>elle sert de <b>concentrateur</b> : les autres ordinateurs et les téléphones du réseau local ouvrent son adresse dans leur
          navigateur et travaillent sur la même course ;</li>
        <li>elle écrit chaque opération dans un <b>journal</b>, un fichier par événement dans un dossier de l'ordinateur ;</li>
        <li>elle imprime les tickets <b>sans fenêtre d'impression</b> ;</li>
        <li>elle reçoit les <b>poinçons radio</b> des relais (protocole SIRAP).</li>
      </ul>
      <p><b>L'onglet seul suffit</b> quand un seul ordinateur chronomètre, ou quand tous les postes ont Internet : ils se tiennent alors à jour
        par la copie sur Ozimut. Il faut Chrome ou Edge pour brancher un lecteur de puces.</p>
      <p><b>En test.</b> Comme Chrono lui-même, l'application n'a encore jamais servi avec de vraies stations SPORTident ou Emit, ni avec une
        imprimante à tickets, ni sur une vraie compétition. Essayez-la sur un entraînement, ou à côté de votre logiciel habituel.</p>` },
    { id: "install", title: "Télécharger et installer", html: `
      <p>Les fichiers se téléchargent depuis Ozimut : Orga › Mes événements › un événement › onglet « Chrono » › Préparer › Liaisons ›
        « Télécharger l'application ».</p>
      <table>
        <thead><tr><th>Système</th><th>Fichier</th><th>Ce que c'est</th></tr></thead>
        <tbody>
          <tr><td>Windows</td><td><code>Ozimut-Chrono-Setup.exe</code></td><td>L'installateur, recommandé (environ 100 Mo). Il installe l'application pour votre
            compte, sans droits d'administrateur.</td></tr>
          <tr><td>Windows</td><td><code>Ozimut-Chrono-Portable.exe</code></td><td>La version portable : un seul programme, rien n'est installé. À
            lancer d'où l'on veut, d'une clé USB par exemple.</td></tr>
          <tr><td>macOS</td><td><code>Ozimut-Chrono.dmg</code></td><td>Une seule image disque pour tous les Mac, à puce Apple comme Intel : ouvrez-la et
            glissez l'application dans Applications.</td></tr>
          <tr><td>Linux</td><td><code>Ozimut-Chrono.AppImage</code></td><td>Un seul fichier (64 bits). Rendez-le exécutable — Propriétés ›
            Permissions, ou <code>chmod +x Ozimut-Chrono.AppImage</code> —, puis lancez-le.</td></tr>
        </tbody>
      </table>
      <p><b>Tant que l'application n'est pas signée</b>, le système s'en méfie au premier lancement :</p>
      <ul>
        <li><b>Windows</b> affiche « Windows a protégé votre ordinateur » : choisissez « Informations complémentaires », puis « Exécuter quand
          même ».</li>
        <li><b>macOS</b> refuse d'abord de l'ouvrir. Sur les versions récentes : Réglages Système › Confidentialité et sécurité, puis « Ouvrir
          quand même ». Sur les versions plus anciennes : clic droit sur l'application, « Ouvrir », puis confirmez.</li>
      </ul>` },
    { id: "first", title: "Premier lancement", html: `
      <p>La fenêtre s'ouvre sur l'accueil : la liste « Événements » et la carte « Nouvel événement » (un nom, une date, les règles du pays —
        France, Canada ou règles de l'IOF —, puis « Créer »). L'événement ouvert, tout se passe comme dans l'onglet : les postes Préparer,
        Accueil, Départ, Arrivée, Suivi, Speaker, Arbitre, Postes et Clôturer, décrits dans la documentation d'Orga, chapitre « Chrono ».</p>
      <ul>
        <li><b>Le dossier des événements</b> est « Ozimut Chrono », dans vos Documents ; l'application le crée. Fichier › « Ouvrir le dossier
          des données » le montre.</li>
        <li><b>Un fichier d'événement</b> (.ozchrono) s'ouvre par un double-clic (avec la version installée), ou par Fichier › « Ouvrir un
          fichier d'événement… » : ses opérations rejoignent cet événement dans l'application, sans rien doubler, et l'événement s'ouvre.</li>
        <li><b>Une seule application à la fois</b> : la lancer une seconde fois ramène la fenêtre déjà ouverte.</li>
        <li><b>Le pare-feu</b> : au premier lancement, Windows peut demander s'il laisse les autres ordinateurs joindre l'application. Acceptez
          pour les réseaux privés si d'autres postes doivent s'y relier.</li>
        <li><b>Le menu</b> : Fichier (ouvrir un fichier, ouvrir le dossier, quitter), Édition, Affichage (recharger, zoom, plein écran), Aide ›
          « Documentation » (<kbd>F1</kbd>) et « À propos d'Ozimut Chrono », qui donne la version, les adresses pour les autres postes, le port
          des poinçons radio et le dossier des données.</li>
      </ul>` },
    { id: "hub", title: "Relier d'autres ordinateurs et des téléphones", html: `
      <p>L'application est un concentrateur : tous les appareils du même réseau local — une borne Wi-Fi ou un simple routeur suffit, sans
        Internet — peuvent travailler sur la même course.</p>
      <ol>
        <li>Sur l'ordinateur de l'application, ouvrez Aide › « À propos d'Ozimut Chrono » : la fenêtre donne l'adresse à ouvrir, de la forme
          <code>http://192.168.1.20:8377/?k=…</code>. Ce qui suit <code>?k=</code> est la <b>clé</b> du concentrateur.</li>
        <li>Sur l'autre ordinateur ou le téléphone, ouvrez cette adresse dans le navigateur. Sans la clé, la page la demande dans un champ
          marqué d'une clé.</li>
        <li>Choisissez l'événement dans la liste. Ce poste voit la course en quelques instants et y écrit comme les autres.</li>
      </ol>
      <p>Un poste qui perd le réseau continue seul et se relie de lui-même au retour ; rien n'est perdu.</p>
      <h3>Un poste, un rôle</h3>
      <p>Ajoutez <code>&amp;role=</code> à l'adresse pour qu'un poste ne montre que ce qui le concerne, par exemple
        <code>http://192.168.1.20:8377/?k=…&amp;role=start</code> :</p>
      <table>
        <thead><tr><th>Rôle</th><th>Postes montrés</th></tr></thead>
        <tbody>
          <tr><td><code>desk</code></td><td>Accueil</td></tr>
          <tr><td><code>start</code></td><td>Départ</td></tr>
          <tr><td><code>finish</code></td><td>Arrivée et Suivi</td></tr>
          <tr><td><code>speaker</code></td><td>Speaker et Suivi</td></tr>
          <tr><td><code>referee</code></td><td>Arbitre et Suivi</td></tr>
          <tr><td>(sans rôle)</td><td>Tous les postes</td></tr>
        </tbody>
      </table>
      <p>Une fois l'événement ouvert, l'adresse du navigateur le nomme (<code>&amp;ev=…</code>) : gardez-la en favori, elle rouvre directement
        cet événement, dans ce rôle.</p>
      <h3>Les lecteurs de puces sur les autres postes</h3>
      <p>Un navigateur ne laisse une page parler à un lecteur de puces, ou à une imprimante à tickets sur port série, que si elle vient d'un
        site sécurisé ou de l'ordinateur lui-même. Une page ouverte à l'adresse du concentrateur depuis un autre ordinateur ne peut donc pas
        lire de puces : elle convient à l'accueil sans lecteur, au départ, au suivi, au speaker, à l'arbitre. Pour un second poste de lecture :</p>
      <ul>
        <li>avec Internet : ouvrez sur cet ordinateur l'onglet « Chrono » de l'événement sur ozimut.com, dans Chrome ou Edge ; il se tient à
          jour par la copie sur Ozimut ;</li>
        <li>sans Internet : installez-y aussi l'application, ouvrez-y le fichier de l'événement (.ozchrono) enregistré sur le premier
          ordinateur, puis, dans Préparer › Liaisons, donnez l'adresse du premier (<code>192.168.1.20:8377</code>) et la « Clé du
          concentrateur », et « Se relier ». C'est à refaire quand l'application est relancée.</li>
      </ul>` },
    { id: "tab", title: "Relier l'onglet d'Ozimut à l'application", html: `
      <p>Sur l'ordinateur de l'application, ouvrez aussi l'onglet « Chrono » de l'événement sur ozimut.com (Chrome ou Edge), puis Préparer ›
        Liaisons › « Chercher l'application sur cet ordinateur ». L'onglet se relie à l'application, et la barre du haut affiche
        « Concentrateur ». Dès lors, l'événement de l'onglet est aussi dans l'application, avec son journal dans le dossier.</p>
      <p>À quoi cela sert : l'onglet est connecté à Ozimut — la copie sur Ozimut, les résultats en direct, « Publier sur Ozimut » —, et
        l'application relie les postes de l'arène sans Internet. Dans l'onglet, « Donner l'accès aux autres postes » crée une clé qui voyage
        avec la course : les postes de l'application échangent alors eux aussi avec Ozimut quand ils ont Internet.</p>
      <p>Si l'onglet répond « L'application Ozimut Chrono n'a pas été trouvée sur cet ordinateur » : vérifiez qu'elle est lancée, et, si le
        navigateur demande l'autorisation d'accéder aux appareils du réseau local, accordez-la.</p>` },
    { id: "print", title: "Imprimer les tickets sans fenêtre", html: `
      <p>Dans Préparer › Matériel › « Imprimante des tickets », l'application ajoute un choix à « Imprimer sur » : « L'imprimante choisie, sans
        fenêtre (application) ».</p>
      <ul>
        <li>« Imprimante » liste les imprimantes installées sur l'ordinateur ; celle par défaut porte une étoile. L'imprimante à tickets doit
          donc d'abord être installée dans le système, avec son pilote.</li>
        <li>« Papier » : 58 mm ou 80 mm. « Ticket d'essai » vérifie le tout.</li>
        <li>« Imprimer le ticket dès qu'une puce est lue » (ou « Ticket automatique », au poste Arrivée) imprime sans rien demander.</li>
      </ul>
      <p>Les listes (résultats, listes de départ, factures) passent par la fenêtre d'impression du système. Les fichiers exportés demandent où
        les enregistrer : le dossier des événements la première fois, ensuite le dernier dossier utilisé.</p>` },
    { id: "readers", title: "Les lecteurs de puces", html: `
      <p>Les boutons sont ceux de l'onglet : Préparer › Matériel › « SPORTident », « Emit » ou « Emit eScan », ou le ruban du poste Arrivée.
        L'application choisit le port elle-même : s'il n'y a qu'un port série, c'est lui ; s'il y en a plusieurs, celui de la station
        SPORTident ; s'il en reste plusieurs, elle demande « Lequel est celui du lecteur ? ».</p>
      <ul>
        <li>« Mettre à l'heure » règle le lecteur sur l'heure de l'ordinateur : vérifiez d'abord l'heure de l'ordinateur.</li>
        <li><b>Emit</b> : le lecteur 250 et le MTR4. D'un eScan ou d'un eScan2, seuls son état et les passages d'emiTag sont reçus, pas le
          contenu des puces.</li>
      </ul>` },
    { id: "radio", title: "Les poinçons radio (SIRAP)", html: `
      <p>L'application écoute sur le <b>port TCP 10000</b> les poinçons que des relais radio envoient par le protocole SIRAP. Réglez le relais,
        ou son logiciel, pour qu'il envoie à l'adresse de cet ordinateur, port 10000.</p>
      <ul>
        <li>Les poinçons vont à l'<b>événement ouvert en dernier</b> dans l'application.</li>
        <li>Ils paraissent au poste Speaker (« Passages radio »). Cochez « Poste radio » sur le boîtier, au poste « Postes ».</li>
        <li>Un même poinçon relayé deux fois ne compte qu'une fois. Une puce entière envoyée par un relais est prise comme une puce lue.</li>
        <li>Si le port 10000 est pris par un autre logiciel de chronométrage, l'application démarre sans la radio, et « À propos » le dit.
          Fermez l'autre logiciel et relancez l'application.</li>
      </ul>` },
    { id: "data", title: "Où sont les données", html: `
      <ul>
        <li><b>Les événements</b> : dans Documents › « Ozimut Chrono », un journal par événement,
          <code>&lt;événement&gt;.ozchrono.jsonl</code>. Chaque opération y est ajoutée et écrite sur le disque à l'instant où elle a lieu ; le
          fichier n'est jamais réécrit. Il est relu à la réouverture de l'événement (une dernière ligne coupée par une panne de courant est
          ignorée). Le fichier <code>hub.json</code>, à côté, retient l'identité du concentrateur et le dernier événement ouvert.</li>
        <li><b>Sauvegarder</b>, c'est copier ce dossier. Un journal s'ouvre sur un autre ordinateur par Fichier › « Ouvrir un fichier
          d'événement… ».</li>
        <li><b>Les réglages</b> : <code>settings.json</code>, dans le dossier de réglages de l'application
          (<code>%APPDATA%\\Ozimut Chrono</code> sous Windows) : la clé du concentrateur et le dernier dossier d'enregistrement. Une ligne
          <code>"folder"</code>, ajoutée à la main, application fermée, place les événements dans un autre dossier.</li>
        <li><b>Rien n'est envoyé nulle part par l'application elle-même.</b> Un événement n'échange avec Ozimut que si la copie a été mise en
          place depuis l'onglet d'Ozimut (« Donner l'accès aux autres postes »).</li>
        <li>Le journal contient des noms, des clubs, des numéros de licence et de puce : gardez ce dossier comme vous gardez vos fichiers de
          résultats.</li>
      </ul>` },
    { id: "update", title: "Mettre à jour, désinstaller", html: `
      <ul>
        <li><b>La version</b> est dans Aide › « À propos d'Ozimut Chrono ».</li>
        <li><b>Mettre à jour</b> : l'application ne se met pas à jour seule. Téléchargez le nouveau fichier au même endroit et lancez-le ;
          l'installateur remplace la version en place. Pour la version portable et l'AppImage, remplacez le fichier. Les événements et les
          réglages sont conservés.</li>
        <li>Un fichier d'événement venu d'une version plus récente est refusé avec un message : mettez l'application à jour pour l'ouvrir.</li>
        <li><b>Désinstaller</b> : sous Windows, Paramètres › Applications › Ozimut Chrono › Désinstaller (version portable : supprimez le
          fichier) ; sous macOS, mettez l'application à la corbeille ; sous Linux, supprimez l'AppImage. Le dossier des événements et les
          réglages restent : supprimez-les à la main si vous le souhaitez.</li>
      </ul>` },
    { id: "trouble", title: "En cas de problème", html: `
      <table>
        <thead><tr><th>Ce qui se passe</th><th>Que faire</th></tr></thead>
        <tbody>
          <tr><td>« Ozimut Chrono ne peut pas démarrer » : les ports 8377 à 8387 sont tous pris.</td><td>L'application prend le port 8377 ou,
            s'il est pris, le premier libre jusqu'à 8387. Fermez le logiciel qui les occupe. Si le port n'est pas 8377, l'adresse à donner aux
            autres postes change : « À propos » donne la bonne.</td></tr>
          <tr><td>« Le dossier des données ne peut pas être utilisé ».</td><td>Le dossier « Ozimut Chrono » des Documents n'est pas accessible
            en écriture (dossier protégé ou en cours de synchronisation) : libérez-le, ou indiquez un autre dossier dans
            <code>settings.json</code>.</td></tr>
          <tr><td>Un autre ordinateur ou un téléphone n'ouvre pas l'adresse.</td><td>Vérifiez qu'il est sur le même réseau ; que le pare-feu
            de l'ordinateur de l'application la laisse joindre (autorisez « Ozimut Chrono » sur les réseaux privés) ; que le réseau Wi-Fi
            n'isole pas les appareils entre eux, comme le font les réseaux publics ; que l'adresse est bien celle d'« À propos ».</td></tr>
          <tr><td>La page demande une clé.</td><td>Tapez celle qui suit <code>?k=</code> dans l'adresse donnée par « À propos ».</td></tr>
          <tr><td>Windows ou l'antivirus bloque l'application.</td><td>Elle n'est pas encore signée : voir « Télécharger et installer ».</td></tr>
          <tr><td>Le lecteur de puces n'est pas vu.</td><td>Vérifiez le câble et le pilote USB du lecteur ; fermez tout autre logiciel qui
            tient son port (un autre logiciel de chronométrage, l'outil de réglage des stations, un onglet Chrono ouvert dans un navigateur) ;
            débranchez et rebranchez, puis « Débrancher » et rebranchez le lecteur dans Chrono.</td></tr>
          <tr><td>Le ticket ne sort pas.</td><td>Faites un « Ticket d'essai » ; vérifiez l'imprimante choisie, le papier, et que l'imprimante
            imprime depuis un autre programme.</td></tr>
          <tr><td>Les poinçons radio n'arrivent pas.</td><td>« À propos » dit si le port 10000 est pris ; vérifiez l'adresse et le port réglés
            sur le relais, et que le bon événement a été ouvert en dernier.</td></tr>
          <tr><td>La fenêtre reste vide ou figée.</td><td>Affichage › « Recharger ». Rien n'est perdu : la course est dans le journal.</td></tr>
        </tbody>
      </table>` },
  ],
};
