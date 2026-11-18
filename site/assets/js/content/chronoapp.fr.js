// The documentation of Ozimut Chrono's desktop application (chrono-app/), in French — the reference: chronoapp.en.js, .de.js
// and .es.js in step, the same sections under the same ids. Plain data, so that both readers render it without helpers of
// their own: the application's own page (chrono/ui/appdoc.js, chrono-app/www/doc.html) and Orga's documentation on the site
// (content/guide.*.js, chapter « chrono-app »). `html` is static markup: h3, p, ul, ol, table, code, kbd, b — no script, no
// link to another page. Every statement was checked against chrono-app/main.mjs, hub.mjs and strings.mjs: when the
// application changes (a port, a menu, a folder), change the four files.
export default {
  title: "L'application Ozimut Chrono",
  lede: "Le chronométrage d'Ozimut installé sur un ordinateur : sans Internet, les ordinateurs de l'arène reliés entre eux, tickets imprimés sans fenêtre. Ce mode d'emploi est le même dans l'application (Aide › Documentation) et dans la documentation d'Orga sur ozimut.com.",
  sections: [
    { id: "what", title: "À quoi sert l'application", html: `
      <p>L'application Ozimut Chrono montre les mêmes écrans que l'onglet « Chrono » d'un événement d'Orga, sur ozimut.com. Elle fait en plus
        ce qu'un onglet de navigateur ne peut pas faire :</p>
      <ul>
        <li>elle marche <b>sans Internet</b> ;</li>
        <li>elle <b>relie les ordinateurs de l'arène</b> entre eux : chacun de ceux qui l'ont garde toute la course et la tient à jour avec
          les autres, sans ordinateur maître ; les téléphones et les écrans ouvrent dans leur navigateur l'adresse de l'un d'eux ;</li>
        <li>elle écrit chaque opération dans un <b>journal</b>, un fichier par événement dans un dossier de l'ordinateur ;</li>
        <li>elle imprime les tickets <b>sans fenêtre d'impression</b> ;</li>
        <li>elle reçoit les <b>poinçons radio</b> des relais (protocole SIRAP).</li>
      </ul>
      <p><b>L'onglet seul suffit</b> quand un seul ordinateur chronomètre, ou quand tous les postes ont Internet : ils se tiennent alors à jour
        par la copie sur Ozimut. Il faut Chrome ou Edge pour brancher un lecteur de puces. <b>Sans Internet</b>, installez l'application sur
        chaque ordinateur qui lit des puces ou imprime des tickets (voir « Relier les ordinateurs de l'arène »).</p>
      <p><b>En test.</b> Comme Chrono lui-même, l'application n'a encore jamais servi avec de vraies stations SPORTident ou Emit, ni avec une
        imprimante à tickets, ni sur une vraie compétition, et ses liaisons n'ont pas encore été essayées entre de vrais ordinateurs sur le
        réseau d'une arène. Essayez-la sur un entraînement, ou à côté de votre logiciel habituel.</p>` },
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
      <p>La fenêtre s'ouvre sur l'accueil : la liste « Événements », la carte « Nouvel événement » (un nom, une date, les règles du pays —
        France, Canada ou règles de l'IOF —, puis « Créer ») et la carte « Sur le réseau », les événements des autres ordinateurs de l'arène,
        à rejoindre avec leur code (voir « Relier les ordinateurs de l'arène »). L'événement ouvert, tout se passe comme dans l'onglet : les
        postes Préparer, Accueil, Départ, Arrivée, Suivi, Speaker, Arbitre, Postes et Clôturer, décrits dans la documentation d'Orga, chapitre
        « Chrono ».</p>
      <ul>
        <li><b>Le dossier des événements</b> est « Ozimut Chrono », dans vos Documents ; l'application le crée. Fichier › « Ouvrir le dossier
          des données » le montre.</li>
        <li><b>Un fichier d'événement</b> (.ozchrono) s'ouvre par un double-clic (avec la version installée), ou par Fichier › « Ouvrir un
          fichier d'événement… » : ses opérations rejoignent cet événement dans l'application, sans rien doubler, et l'événement s'ouvre.</li>
        <li><b>Une seule application à la fois</b> : la lancer une seconde fois ramène la fenêtre déjà ouverte.</li>
        <li><b>Le pare-feu</b> : au premier lancement, Windows demande s'il laisse Ozimut Chrono communiquer sur le réseau. Acceptez pour les
          réseaux privés : sinon les autres ordinateurs de l'arène ne le trouvent pas, et les téléphones ne l'ouvrent pas.</li>
        <li><b>Le menu</b> : Fichier (ouvrir un fichier, ouvrir le dossier, quitter), Édition, Affichage (recharger, zoom, plein écran), Aide ›
          « Documentation » (<kbd>F1</kbd>) et « À propos d'Ozimut Chrono », qui donne la version, l'adresse à ouvrir depuis les téléphones et les
          autres ordinateurs (avec la clé de l'application), le port des poinçons radio et le dossier des données.</li>
      </ul>` },
    { id: "hub", title: "Relier les ordinateurs de l'arène", html: `
      <p>Tous les ordinateurs où l'application tourne sont égaux : pas de maître, pas d'ordinateur central à choisir. Chacun garde sa copie
        complète de la course et son propre journal. Il leur suffit d'être sur le même réseau local — une borne Wi-Fi ou un simple routeur,
        sans Internet.</p>
      <h3>Comment ils se trouvent</h3>
      <p>Toutes les quelques secondes, chaque application annonce sur le réseau local qui elle est et quels événements elle tient (leur nom et
        leur date, jamais leur code). Deux applications qui tiennent le même événement se relient d'elles-mêmes et se tiennent à jour l'une
        l'autre. Les liaisons passent par n'importe lequel des ordinateurs : il suffit que chacun en joigne au moins un autre. Un ordinateur
        qui s'en va ou redémarre rattrape de lui-même, à son retour, ce qui s'est fait sans lui.</p>
      <h3>Le code de l'événement</h3>
      <p>Chaque événement a un code de six caractères, des lettres et des chiffres qui ne se confondent pas (jamais de O, de 0, de I, de L ni
        de 1). Il s'affiche en grand dans Préparer › Liaisons, carte « Les autres ordinateurs de l'arène », sous « Code de l'événement ». Il est
        créé tout seul avec l'événement, dans l'application comme dans l'onglet « Chrono » d'Ozimut. Il protège l'événement : un autre
        ordinateur doit le connaître pour s'y relier, et il n'est jamais annoncé sur le réseau — une application prouve qu'elle le connaît
        sans le dire.</p>
      <h3>Rejoindre l'événement depuis un autre ordinateur</h3>
      <ol>
        <li>Installez l'application sur cet ordinateur et ouvrez-la.</li>
        <li>Son accueil a une carte « Sur le réseau » : les événements des autres ordinateurs de l'arène, chacun avec l'ordinateur qui le tient
          (« sur PC-Arrivée »). Cliquez sur l'événement.</li>
        <li>Tapez son code, en majuscules ou en minuscules, puis « Rejoindre ». L'événement s'ouvre et se remplit en quelques instants. Un code
          faux est refusé : « Ce n'est pas le code de cet événement. »</li>
      </ol>
      <p>Le code n'est demandé qu'une fois : ensuite, cet ordinateur se relie tout seul, à chaque lancement, sur n'importe quel réseau. Rien
        n'est à refaire après un redémarrage.</p>
      <p>Dans Préparer › Liaisons, la carte « Les autres ordinateurs de l'arène » donne le code, les ordinateurs reliés (« 2 autres ordinateurs
        reliés : PC-Arrivée, PC-Accueil », ou « Aucun autre ordinateur ne partage encore cet événement… ») et les autres applications vues sur
        le réseau. La barre du haut le résume : « 1 autre ordinateur relié », « Aucun autre ordinateur ».</p>
      <h3>Un ordinateur n'apparaît pas ?</h3>
      <p>Certains réseaux (Wi-Fi public, réseau d'école) empêchent les ordinateurs de se trouver. Dans Préparer › Liaisons, ouvrez « Un
        ordinateur n'apparaît pas ? », donnez l'adresse et la clé de l'application de l'autre ordinateur, puis « Se relier ». Son menu Aide ›
        « À propos d'Ozimut Chrono » donne une adresse de la forme <code>http://192.168.1.20:8377/?k=…</code> : l'adresse est
        <code>192.168.1.20:8377</code>, la clé ce qui suit <code>?k=</code>. Cette liaison est gardée elle aussi d'un lancement à l'autre.</p>
      <h3>Téléphones et écrans</h3>
      <p>Un téléphone, une tablette ou un écran (speaker, résultats, arbitre, liste de départ) n'a rien à installer : son navigateur ouvre
        l'adresse de n'importe quel ordinateur où l'application tourne. Préparer › Liaisons la donne (« Téléphones et écrans sans
        l'application (speaker, résultats, arbitre) : ouvrez <code>http://192.168.1.20:8377/?k=…</code> »), Aide › « À propos d'Ozimut
        Chrono » aussi. Ce qui suit <code>?k=</code> est la <b>clé</b> de cette application ; sans elle, la page la demande dans un champ marqué
        d'une clé. Choisissez l'événement dans la liste : ce poste voit la course en quelques instants et y écrit comme les autres. Un poste
        qui perd le réseau continue seul et se relie de lui-même au retour ; rien n'est perdu.</p>
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
      <h3>Les lecteurs de puces et les imprimantes à tickets</h3>
      <p>Un navigateur ne laisse une page parler à un lecteur de puces, ou à une imprimante à tickets sur port série, que si elle vient d'un
        site sécurisé ou de l'ordinateur lui-même. Une page ouverte à l'adresse d'un autre ordinateur ne lit donc pas de puces : elle convient
        au départ, au suivi, au speaker, à l'arbitre, à l'accueil sans lecteur. <b>Chaque ordinateur qui lit des puces ou imprime des tickets a
        l'application</b>, reliée aux autres comme plus haut.</p>
      <h3>Ce que nous conseillons</h3>
      <ul>
        <li><b>Sans Internet à l'arène</b> : installez l'application sur chaque ordinateur qui lit des puces ou imprime des tickets ; créez (ou
          importez) l'événement sur l'un d'eux ; sur chacun des autres, accueil › « Sur le réseau » › l'événement › son code. Les téléphones et
          les écrans ouvrent l'adresse donnée dans Préparer › Liaisons.</li>
        <li><b>Avec Internet</b> : l'onglet « Chrono » d'Ozimut partout, ou l'application, qui ajoute l'impression silencieuse des tickets —
          tout droit sur l'imprimante choisie, sans fenêtre d'impression — et une copie de la course sur le disque de l'ordinateur.</li>
      </ul>
      <p><b>Pas encore essayé sur une vraie arène.</b> Les liaisons n'ont été essayées qu'entre plusieurs applications d'un même ordinateur,
        jamais encore entre de vrais ordinateurs portables sur le réseau d'une arène. Certains réseaux bloquent les annonces : c'est alors à
        « Un ordinateur n'apparaît pas ? » de servir.</p>` },
    { id: "tab", title: "Relier l'onglet d'Ozimut à l'application", html: `
      <p>L'onglet « Chrono » d'un événement sur ozimut.com sert à préparer chez soi, et à chronométrer dans une arène qui a Internet : les
        postes ouverts dans l'onglet se tiennent à jour par la copie sur Ozimut.</p>
      <p>Sur un ordinateur où l'application tourne, l'onglet peut aussi se relier à elle : Préparer › Liaisons › « Chercher l'application sur
        cet ordinateur » (Chrome ou Edge). La barre du haut affiche alors « Application », puis le nombre d'autres ordinateurs reliés. Dès lors,
        l'événement de l'onglet est aussi dans l'application, avec son journal dans le dossier, et les autres ordinateurs de l'arène peuvent
        le rejoindre avec son code.</p>
      <p><b>L'onglet ne se relie qu'à l'application de son propre ordinateur</b>, jamais à celle d'un autre : une page sécurisée (https) n'a
        pas le droit de parler à une page locale non sécurisée (http). Avec Internet à l'arène, tout le monde peut simplement utiliser
        l'onglet ; sans Internet, utilisez l'application sur chaque ordinateur.</p>
      <p>À quoi sert de relier l'onglet à l'application : l'onglet est connecté à Ozimut — la copie sur Ozimut, les résultats en direct,
        « Publier sur Ozimut » —, et l'application relie les ordinateurs de l'arène sans Internet. Dans l'onglet, « Donner l'accès aux autres
        postes » crée une clé qui voyage avec la course : les ordinateurs de l'application échangent alors eux aussi avec Ozimut quand ils ont
        Internet.</p>
      <p>Si l'onglet répond « L'application Ozimut Chrono n'a pas été trouvée sur cet ordinateur. » : vérifiez qu'elle est lancée, et, si le
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
          ignorée). Chaque ordinateur de l'arène a le sien, complet.</li>
        <li><b>Le fichier <code>hub.json</code></b>, à côté, retient l'identité de cet ordinateur sur le réseau, le dernier événement ouvert,
          les codes d'événement tapés pour rejoindre un événement et les adresses ajoutées à la main (« Un ordinateur n'apparaît pas ? »).</li>
        <li><b>Sauvegarder</b>, c'est copier ce dossier. Un journal s'ouvre sur un autre ordinateur par Fichier › « Ouvrir un fichier
          d'événement… ».</li>
        <li><b>Les réglages</b> : <code>settings.json</code>, dans le dossier de réglages de l'application
          (<code>%APPDATA%\\Ozimut Chrono</code> sous Windows) : la clé de l'application (celle que demandent les téléphones et les liaisons
          ajoutées à la main) et le dernier dossier d'enregistrement. Une ligne <code>"folder"</code>, ajoutée à la main, application fermée,
          place les événements dans un autre dossier.</li>
        <li><b>L'application n'envoie rien sur Internet d'elle-même.</b> Sur le réseau local, elle annonce le nom de l'ordinateur et le nom et la
          date de ses événements, et n'échange une course qu'avec les ordinateurs qui en connaissent le code, ou sa clé. Un événement n'échange
          avec Ozimut que si la copie a été mise en place depuis l'onglet d'Ozimut (« Donner l'accès aux autres postes »).</li>
        <li>Le journal contient des noms, des clubs, des numéros de licence et de puce, et le code de l'événement : gardez ce dossier comme vous
          gardez vos fichiers de résultats.</li>
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
            téléphones change : Préparer › Liaisons et « À propos » donnent la bonne.</td></tr>
          <tr><td>« Le dossier des données ne peut pas être utilisé ».</td><td>Le dossier « Ozimut Chrono » des Documents n'est pas accessible
            en écriture (dossier protégé ou en cours de synchronisation) : libérez-le, ou indiquez un autre dossier dans
            <code>settings.json</code>.</td></tr>
          <tr><td>Un autre ordinateur n'apparaît pas dans « Sur le réseau », la barre dit « Aucun autre ordinateur », ou « L'autre ordinateur
            ne répond pas. »</td><td>Vérifiez qu'il est allumé, que l'application y est lancée et qu'il est sur le même réseau. Au premier
            lancement, Windows demande une fois d'autoriser Ozimut Chrono sur les réseaux privés : acceptez (sinon, autorisez-le dans le
            pare-feu de Windows). Certains Wi-Fi isolent les appareils les uns des autres ou bloquent les annonces, comme les réseaux publics
            et les réseaux d'école : passez alors par « Un ordinateur n'apparaît pas ? ». Entre les ordinateurs doivent passer le port UDP 8379
            (les annonces) et le port TCP 8377 (les liaisons et les pages).</td></tr>
          <tr><td>« Ce n'est pas le code de cet événement. »</td><td>Retapez le code affiché sur l'autre ordinateur, dans Préparer › Liaisons.
            Il ne contient jamais de O, de 0, de I, de L ni de 1.</td></tr>
          <tr><td>Un téléphone n'ouvre pas l'adresse.</td><td>Vérifiez qu'il est sur le même réseau que l'ordinateur, que le pare-feu de
            celui-ci laisse passer « Ozimut Chrono », que le Wi-Fi n'isole pas les appareils entre eux, et que l'adresse est celle de Préparer ›
            Liaisons ou d'« À propos ».</td></tr>
          <tr><td>La page demande une clé.</td><td>Tapez ce qui suit <code>?k=</code> dans l'adresse donnée par Préparer › Liaisons ou
            « À propos ».</td></tr>
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
