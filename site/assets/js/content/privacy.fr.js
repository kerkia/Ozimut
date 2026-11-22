// The privacy policy and legal notices, in French — the version that prevails (pages/account.js « privacy »; the GDPR's
// information, articles 13 and 14, and the legal notices, LCEN article 6; reviewed 2026-10-15, the directory's contacts added 2026-10-31: keep the date up to date
// when what the site keeps changes, and the English version, privacy.en.js, in step).
// world: registration open to every orienteer (WORLD_OPEN, /api/account/status; owner, 2026-10-20): the texts about who may
// see what follow it, so that the page says what is true on either side of the switch.
export const body = (SITE, { world = false } = {}) => `
      <p>${SITE} est un site indépendant, sans lien avec la Fédération française de course d'orientation (FFCO). Il est édité à titre
        personnel et non commercial par <b>Yann Le Helloco</b>, responsable du traitement des données personnelles décrites ci-dessous
        au sens du règlement (UE) 2016/679 (RGPD). Contact : <b>contact@ozimut.com</b>.</p>
      <h2 style="font-size:16px">Conditions d'utilisation</h2>
      <p>${SITE} fonctionne avec des ressources gratuites et limitées, partagées entre tous ses utilisateurs. Il est destiné à être
        consulté personnellement par ${world ? "ses utilisateurs" : "les licenciés"}, au moyen d'un navigateur. Sauf accord préalable de l'éditeur, sont en conséquence
        interdits : la collecte automatisée (robots, scripts, aspiration des pages ou des fichiers de données), l'usage de ses contenus pour entraîner, ajuster ou alimenter des modèles d'intelligence artificielle, les téléchargements
        massifs, la réutilisation des données à d'autres fins et tout usage de nature à surcharger le site au détriment des autres
        utilisateurs. Un compte qui ne respecte pas ces règles peut être suspendu.</p>
      <p>Pour un besoin particulier (étude, besoins d'un club ou d'une ligue, données destinées à un autre outil), il est possible
        d'écrire à l'éditeur, par la page « Nous écrire » ou à contact@ozimut.com : la demande sera examinée.</p>
      <h2 style="font-size:16px">Indépendance et sources</h2>
      <p>${SITE} est indépendant, non officiel et gratuit, sans lien avec aucune fédération ni aucun organisateur. Ses sources : pour la France,
        les résultats, le classement national (CN) et l'agenda publiés par la Fédération française de course d'orientation (FFCO)
        sur cn.ffcorientation.fr et ffcorientation.fr, qui restent la référence ; pour l'Espagne, le calendrier et les inscriptions
        publiés par la Fédération espagnole (FEDO) sur sico.fedo.org, et les résultats publiés sur O-Replay (oreplay.es) ; pour
        toutes les courses, les résultats et les horaires que publient les organisateurs (leur site, liveresultat, WinSplits, Helga,
        Orientation Data, O-Replay) ou qu'ils déposent sur ${SITE}.</p>
      <p>L'agenda des autres pays reprend les calendriers que publient leurs fédérations, chacun nommé sous l'épreuve (« Voir
        sur … »). La région et le département (ou leur équivalent) d'une épreuve sont retrouvés à partir de son lieu grâce aux
        noms de lieux de GeoNames (<a href="https://www.geonames.org/" target="_blank" rel="noopener">geonames.org</a>), sous
        licence <a href="https://creativecommons.org/licenses/by/4.0/deed.fr" target="_blank" rel="noopener">Creative Commons
        Attribution 4.0</a>.</p>
      <p>Pour l'Espagne, ${SITE} reprend les résultats publics des courses (nom, club, catégorie, temps, temps intermédiaires) et le
        nombre d'inscrits par catégorie ; pour reconnaître un même coureur d'une course à l'autre, il lit aussi la liste publique
        des licenciés de la FEDO (nom, club, fédération régionale, numéro de licence et de puce), dont il n'affiche aucun numéro. Ces résultats étant publics, ils
        sont visibles par tous, avec ou sans compte. Toute personne concernée peut demander à ne plus y être identifiée (voir
        « Vos droits »).</p>
      <h2 style="font-size:16px">Accès et images du site</h2>
      <p>${SITE} est gratuit pendant son lancement. À mesure que l'usage grandit, certaines fonctions avancées ou coûteuses pourront devenir payantes : nous l'annoncerons au moins deux mois avant, et ce que vous avez déjà enregistré restera consultable et exportable.</p>
      <p>Une partie du site se consulte sans compte ; un compte ouvre les alertes et le partage de
        traces, et l'historique complet du classement est réservé aux licenciés de la fédération : en France, un compte qui a rejoint
        la France, son numéro de licence FFCO vérifié d'après le nom. Les pays dont tous les résultats sont publics (l'Espagne)
        s'ouvrent à tous.</p>
      <p>Les captures d'écran de la page d'accueil sont prises sur une copie brouillée des données : noms, licences, clubs et temps
        y sont inventés ou modifiés, et ne correspondent à personne. Les encadrés marqués « Maquette » sont des illustrations.</p>
      <h2 style="font-size:16px">Données des résultats, y compris celles des licenciés sans compte</h2>
      <p>Les classements, résultats et calculs affichés proviennent des résultats publiés par la FFCO sur cn.ffcorientation.fr : nom,
        club, catégorie, numéro de licence, temps et place de chaque licencié classé, qu'il dispose ou non d'un compte sur ${SITE}, y
        compris les licenciés mineurs. ${SITE} en tire des CN recalculés, des classements, des comparaisons et des statistiques (clubs,
        territoires, pyramide des âges, coureurs rencontrés en course). La page « Résultats » présente en outre, pour les courses des
        60 derniers jours, les résultats publiés par les organisateurs eux-mêmes (sur leur site, liveresultat, WinSplits, Helga, etc.)
        ou déposés sur ${SITE}, rapprochés des licences d'après le nom et le club.</p>
      <p>Ce traitement repose sur l'intérêt légitime de l'éditeur à informer les licenciés et à analyser le classement national à
        partir de résultats déjà publiés. Sur ${SITE}, elles sont ouvertes dans la mesure où la FFCO les publie elle-même : sans
        compte${world ? ", ou avec un compte qui n'a pas rejoint la France," : ""} on voit les courses, les résultats et le classement des
        saisons que la FFCO montre sur son site sans demander de connexion, ainsi que les résultats publiés par les organisateurs (nom,
        club, catégorie, temps), sans CN ni score. Les saisons plus anciennes, que la FFCO réserve à ses licenciés, et les historiques
        et statistiques qui en sont tirés ne sont accessibles qu'aux comptes connectés${world ? " qui ont rejoint la France" : ""}, dont
        le numéro de licence FFCO est vérifié d'après le nom. Seule exception : l'éditeur peut ouvrir,
        pour une durée limitée, un compte de démonstration à un organisme de course d'orientation (fédération, ligue, club) qui
        souhaite découvrir le site ; ce compte n'est rattaché à aucune licence, ne peut rien modifier ni déposer et cesse de
        fonctionner à la date fixée. Toute personne concernée peut en demander la rectification ou demander à ne plus y être identifiée (voir
        « Vos droits ») ; la source demeure le site de la FFCO.</p>
      <h2 style="font-size:16px">Annuaire des clubs, comités et ligues</h2>
      <p>L'onglet « Annuaire » de la page Clubs reprend, pour chaque ligue, comité départemental et club, ce que la FFCO publie sur
        ses pages des structures et son annuaire des clubs : son numéro, son site web et ses coordonnées — les noms et fonctions des
        membres de son bureau (président, secrétaire, trésorier), son téléphone et son adresse e-mail. L'adresse postale n'est pas
        reprise. Ces coordonnées ne sont montrées qu'aux comptes connectés dont la licence FFCO est vérifiée (pas aux visiteurs sans
        compte, ni aux comptes de démonstration), et sont relues chaque semaine : ce que la FFCO retire disparaît d'${SITE} à la
        relecture suivante. Base légale : l'intérêt légitime de l'éditeur à aider les licenciés à joindre les structures de leur
        sport, à partir d'informations que la FFCO publie elle-même. Toute personne concernée peut s'y opposer ou en demander la
        rectification (voir « Vos droits ») ; la source demeure le site de la FFCO.</p>
      <h2 style="font-size:16px">Dépôts de résultats et d'horaires de départ</h2>
      <p>Lors du dépôt d'un fichier de résultats, sont enregistrés le compte de l'auteur du dépôt, la course, le nom et la taille du
        fichier ainsi que la date du dépôt. Le fichier est conservé 60 jours dans l'espace de stockage du site (Cloudflare), puis
        effacé ; les résultats qu'il contient restent affichés. L'administrateur voit l'auteur de chaque dépôt et peut retirer un
        dépôt. Les horaires de départ qu'un organisateur dépose avant la course (onglet « Départs » d'un événement, dans Orga) suivent les mêmes
        règles ; seuls les noms, clubs, catégories et heures de départ en sont publiés, et les organisateurs de la course peuvent les
        retirer. Une compétition qu'un organisateur crée hors du calendrier de la fédération (voir « Événements des organisateurs ») est publiée
        dans l'Agenda avec son nom, sa date, son lieu, son club, sa spécialité et son site, sans que soit publié qui l'a créée. Un organisateur peut aussi donner le lien du suivi GPS de sa compétition sur un autre
        service (onglet « Direct » de son événement) : seul ce lien est publié, avec le compte qui l'a donné gardé et non publié ; Ozimut ne
        reçoit aucune position.</p>
      <h2 style="font-size:16px">Événements des organisateurs (Orga)</h2>
      <p>Un compte qui crée un événement — une course ou un entraînement — dans Orga en forme l'équipe. Le site garde : la
        description de l'événement (nom, date, lieu, club, spécialité, format, site web) et le compte qui l'a créé ; son éventuel rattachement
        à une compétition du calendrier de la fédération ; son équipe (les comptes membres, la date où chacun y est entré et le membre qui
        l'a accepté) ; les demandes pour la rejoindre (le compte qui demande, un message facultatif de 300 caractères au plus, la date, la
        réponse et le membre qui l'a donnée). Personne n'est ajouté à une équipe par son nom, sa licence ou son adresse e-mail : on demande à
        y entrer, et un membre accepte ou refuse ; les membres sont prévenus d'une demande, et la personne de la réponse, par notification. Les
        membres d'une équipe voient les noms et les clubs les uns des autres et des personnes qui demandent à entrer ; les autres comptes ne
        voient d'une équipe que le prénom et l'initiale du nom de deux de ses membres au plus. Les administrateurs du site voient les
        événements et confirment les rattachements demandés par des comptes qui ne sont pas membres du club organisateur. Base légale :
        l'exécution du service demandé. À la suppression d'un compte, il quitte ses équipes et ses demandes sont effacées ; un événement
        dont il était le dernier membre reste aux mains des administrateurs, et ce que l'événement a publié reste en place. Un tracé des circuits rattaché à un événement garde sa propre équipe (voir « Tracé des circuits ») :
        l'équipe de l'événement n'en voit que l'existence, le nom de qui l'a commencé et le nombre de personnes de son équipe de traçage.</p>
      <h2 style="font-size:16px">Analyses de traces GPS</h2>
      <p>La page « Analyse solo » lit la carte et la trace GPS dans votre navigateur : aucune donnée n'est transmise au site, et ces
        fichiers ne sont conservés que le temps de la visite.</p>
      <p>Dans l'analyse d'un entraînement ou d'une compétition, l'organisateur dépose les cartes et les parcours, et chaque
        participant peut y ajouter sa propre trace. Celle-ci est alors transmise et conservée dans l'espace de stockage du site
        (Cloudflare), avec le nom et le numéro de licence du participant, réduite aux positions et aux heures situées sur l'emprise de
        la carte (sans fréquence cardiaque, cadence ni trajet hors de la carte). Elle est visible des personnes autorisées à ouvrir
        l'analyse, selon le choix de l'organisateur : tous les licenciés connectés, les membres de son club ou les détenteurs du mot
        de passe. Chaque participant peut retirer sa trace à tout moment ; elle est effacée avec l'analyse et avec son compte. Les
        cartes d'une analyse sont conservées tant que celle-ci existe ; si l'organisateur supprime son compte, l'analyse est maintenue,
        sans son nom. Les fichiers OCAD ou Mapper dont viennent ses circuits ne sont gardés que si l'organisateur le choisit (« Les rendre disponibles pour le tracé de l'événement », coché par défaut) : seuls les organisateurs de l'analyse y ont accès, pour le tracé de l'événement, et ils sont effacés avec elle. Dans l'analyse d'un événement, vos propres courbes (allure, fréquence cardiaque, cadence, etc.) proviennent de votre
        fichier, conservé dans votre navigateur sur cet appareil : il n'est pas transmis, et vous seul y avez accès.</p>
      <p>Le commentaire que vous écrivez sur
        votre course est visible des mêmes personnes que votre trace ; vous le modifiez ou l'effacez à tout moment. Si l'organisateur
        ouvre l'analyse aux visiteurs sans compte, votre trace et votre commentaire ne leur sont montrés que si vous l'acceptez (une case
        décochée par défaut), avec votre nom mais sans votre numéro de licence ; vous retirez cet accord à tout moment. Dans « Mes
        cartes », le commentaire que vous écrivez sur une course est gardé avec elle et suit les mêmes règles qu'elle.</p>
      <p>Pour aider l'organisateur à décider (publier, ouvrir ou fermer une fonction), une analyse compte qui l'ouvre et qui
        rejoue un circuit seul dans « Analyse solo » sur sa carte : le numéro de votre compte, le premier et le dernier jour, et le
        nombre de jours, une fois par jour au plus ; pour les visiteurs sans compte, un nombre par jour seulement. Les organisateurs
        n'en voient que des totaux, jamais qui ; ils ne sont pas comptés eux-mêmes. Ces relevés sont effacés avec l'analyse, avec le
        circuit concerné et avec votre compte.</p>
      <h2 style="font-size:16px">Mes cartes</h2>
      <p>« Mes cartes » garde les cartes que vous y enregistrez (depuis « Analyse solo ») ou importez (fichiers JPEG de QuickRoute ou
        d'Ozimut), et les itinéraires que vous y avez courus, dans l'espace de stockage du site (Cloudflare)  l'image de la carte telle
        que vous l'avez donnée, son titre, sa date, son lieu et vos notes, et pour chaque course les positions sur la carte et les
        heures, jamais le fichier GPS lui-même. La fréquence cardiaque, l'altitude et la cadence ne sont gardées que si vous cochez la
        case prévue (décochée par défaut)  ce sont des données de santé, conservées sur votre consentement, que vous retirez en
        supprimant la course. Ces cartes ne sont visibles que de vous. Si vous créez un lien de partage (vers toutes vos cartes ou
        vers une seule), toute personne qui a ce lien les voit avec votre nom, même sans compte, mais jamais la fréquence cardiaque
        ni les autres données personnelles  supprimer le lien arrête ce partage. Vous supprimez une course ou une carte à tout
        moment  tout est effacé avec votre compte. Une demande d'import depuis DOMA est un message envoyé à l'équipe Ozimut, comme
        ceux de « Nous écrire ».</p>
      <p>Si vous cochez « Enregistrer l'analyse » à côté de « Voir la course » dans « Analyse solo » (coché par défaut), la carte et votre course — positions et heures seulement, rien d'autre de la montre — sont gardées dans votre compte, à part de « Mes cartes » : vous seul les voyez, dans « Analyse », où vous rejouez ou supprimez l'analyse. Une carte n'y est gardée qu'une fois et part avec la dernière analyse qui la montre.</p>
      <p>Une bibliothèque « Mes cartes » garde 1 Go au plus (les cartes d'origine et les courses). Les administrateurs du site peuvent voir les cartes envoyées à Ozimut — dans « Mes cartes », « Analyse solo », les analyses des organisateurs et le tracé — et en garder une copie, sauf celles que vous marquez « Carte privée » en les envoyant dans « Mes cartes », « Analyse solo » ou le tracé ; jamais vos courses, vos commentaires ni les circuits, ni la carte d'un événement chiffré. Ces cartes restent quand le compte est supprimé, sans votre nom.</p>
      <h2 style="font-size:16px">Suivi GPS et Mes traces</h2>
      <p>Le suivi GPS (en essai, réservé pour l'instant aux administrateurs du site et aux comptes d'enfants qu'ils créent) enregistre la position d'un compte pendant une course, une position par seconde, avec l'application Ozimut sur un téléphone, une montre Apple Watch ou Garmin, ou l'application Traccar Client. Rien n'est enregistré hors d'une course démarrée par la personne (ou par son parent sur son appareil). Sont gardés : les positions, leur heure et leur précision, l'altitude quand l'appareil la donne, la batterie de l'appareil ; pour chaque appareil, son type, son modèle, la version de l'application, la date où il a été vu, et le jeton de notification de son système (Google ou Apple) pour lui envoyer les alertes. Les positions sont transmises par paquets et gardées dans l'espace de stockage du site (Cloudflare, Union européenne et États-Unis) ; une course est gardée 30 jours dans « Mes traces », plus longtemps seulement si vous l'ouvrez dans une analyse ou la gardez dans « Mes cartes ».</p>
      <p>Ne voient une course en direct et ne reçoivent ses alertes (départ, arrivée, demande d'aide, plus de position, immobilité, batterie faible, sortie de zone) que les comptes que la personne, ou son parent, a explicitement autorisés par une invitation ; elle peut retirer cette autorisation à tout moment. Une course marquée privée n'est vue de personne d'autre. Les traces importées (fichier, Santé d'Apple, Polar) restent privées. Relier Polar donne à Ozimut l'accès à vos séances Polar jusqu'à ce que vous le retiriez ; Ozimut ne garde que le parcours GPS de chacune.</p>
      <h2 style="font-size:16px">Comptes des enfants</h2>
      <p>Lorsque le suivi est ouvert à tous, personne ne crée de compte seul avant 15 ans : l'inscription demande l'année de naissance, et pour un enfant plus jeune c'est un parent qui crée et gère son compte, sans adresse e-mail ni mot de passe. Le parent associe les appareils de l'enfant, choisit qui peut le suivre et peut supprimer le compte à tout moment ; un second parent peut être ajouté par une invitation. Le compte d'un enfant ne garde que son prénom, son nom, son année de naissance, éventuellement son numéro de licence, et ses traces. Un compte personnel déjà ouvert par un jeune de moins de 15 ans attend qu'un parent y soit rattaché : jusque-là ses traces restent privées et aucune alerte n'est envoyée. À partir de 15 ans, le jeune peut prendre son compte en main (son adresse et son mot de passe), ses traces et son historique restant les siens, et ses parents devenant des personnes qui peuvent le suivre, ce qu'il peut changer. Lorsqu'un parent supprime son compte, le compte de l'enfant dont il était le seul parent est supprimé avec toutes ses traces.</p>
      <h2 style="font-size:16px">Chronométrage (Ozimut Chrono)</h2>
      <p>Ozimut Chrono, l'outil de chronométrage des organisateurs (en essai, réservé pour l'instant aux administrateurs du site), travaille d'abord sur l'ordinateur de l'organisateur : les inscrits d'une course (nom, prénom, club, catégorie, numéro de licence, numéro de puce, heure de départ, tarif et paiement), le contenu des puces lues et les corrections faites à la main y sont gardés dans le navigateur ou dans l'application. Quand le poste est relié à Ozimut, ces opérations sont copiées sur Ozimut pour que la course puisse être reprise sur un autre ordinateur ; seuls les organisateurs de l'événement y accèdent, et rien n'en est publié sans leur action (les résultats en direct, la publication des résultats). Le fichier des licenciés de la fédération et les numéros de puce retenus d'une course à l'autre restent sur l'ordinateur de l'organisateur : ils ne sont pas envoyés à Ozimut.</p>
      <h2 style="font-size:16px">Réservation des horaires de départ</h2>
      <p>Quand les organisateurs d'une compétition ouvrent la réservation de ses horaires de départ, un compte réserve un départ pour
        lui-même et pour les coureurs qu'il ajoute à « Mes coureurs » (sa famille, des amis, licenciés ou non) : leur prénom, leur nom,
        le club et son pays, le numéro de licence FFCO s'il est donné, et le numéro de puce si les organisateurs le demandent. Le compte
        qui les ajoute s'engage à le faire avec leur accord. La grille des horaires (nom et club de chaque coureur) est publique, comme
        une liste de départ ; le numéro de licence et le numéro de puce ne sont vus que du compte qui a réservé et des organisateurs. À la
        clôture, les réservations deviennent la liste de départ publiée de la compétition. « Mes coureurs » et les réservations des
        compétitions à venir sont supprimés avec le compte ; celles des compétitions passées restent dans leur liste de départ.</p>
      <h2 style="font-size:16px">Depuis votre téléphone</h2>
      <p>« Depuis mon téléphone » fait passer une photo de la carte ou un fichier (une trace) de votre téléphone à votre ordinateur : le fichier attend dans l'espace de stockage du site (Cloudflare) sous un lien à usage unique, valable 15 minutes, et il est effacé dès que l'ordinateur l'a reçu ou que vous fermez la fenêtre du code ; un fichier jamais reçu est effacé au plus tard le lendemain. Ni le lien ni le fichier ne portent votre nom, et aucun compte n'est demandé sur le téléphone.</p>
      <h2 style="font-size:16px">Santé : articles et droits d'auteur</h2>
      <p>La page « Santé », ouverte aux comptes que l'éditeur y autorise, publie des articles écrits par leurs auteurs. Un article est
        conservé dans la base du site (Cloudflare) avec le nom de son auteur, affiché avec lui, et ses images dans l'espace de stockage
        du site ; il est effacé quand son auteur ou l'éditeur le supprime. Si l'auteur supprime son compte, ses articles restent publiés
        sous son nom, sauf s'il en demande le retrait (contact@ozimut.com). Les « j'aime » sont enregistrés par compte ; seul leur nombre
        est affiché. Chaque article est traduit automatiquement en anglais et en français (sauf dans sa langue d'origine) par le modèle de langage d'Ozimut,
        exécuté par Cloudflare (Workers AI), qui ne le conserve pas ; la traduction est conservée avec l'article et signalée comme
        telle.</p>
      <p><b>Droits d'auteur.</b> Chaque auteur reste titulaire de tous les droits d'auteur sur ses articles (les textes et les images
        qu'il a créés), y compris son droit moral, et reste libre de les publier ailleurs, sous la forme et aux conditions qu'il
        choisit. En publiant un article sur ${SITE}, il accorde seulement à l'éditeur une autorisation gratuite et non exclusive, pour
        la durée de sa publication, de le conserver, de l'afficher aux lecteurs de la page « Santé », de le traduire automatiquement
        dans les langues du site, d'en reprendre le titre, le résumé et les premières lignes dans les listes et les alertes, et d'en
        adapter la présentation (mise en page, taille des images) sans en changer le sens. Cette autorisation prend fin quand
        l'article est supprimé ; les alertes déjà envoyées ne peuvent être reprises. L'auteur garantit que les textes et les images
        qu'il publie sont les siens ou qu'il a le droit de les utiliser.</p>
      <p>Toute reproduction, représentation ou diffusion d'un article, en tout ou en partie, par une autre personne demande l'accord
        préalable de son auteur, sous réserve des exceptions prévues par la loi, notamment les courtes citations qui mentionnent
        l'auteur et la source (article L. 122-5 du Code de la propriété intellectuelle). Les traductions automatiques sont des
        adaptations de l'article et suivent les mêmes règles.</p>
      <h2 style="font-size:16px">Carto</h2>
      <p>Une carte de Carto (le document de la carte, le fichier OCAD dont elle vient, ses fonds, ses versions, les commentaires et les photos de l'équipe) est conservée dans l'espace de stockage du site (Cloudflare) et n'est accessible qu'à son équipe : son créateur et les personnes qui la rejoignent par un lien d'invitation (personne n'y est recherché par son nom ou son adresse e-mail) ; leur nom et leur compte sont enregistrés avec leur rôle. Les fonds en ligne (photos aériennes et plans de l'IGN, OpenStreetMap) sont lus à chaque ouverture, sans être gardés ; pour les données ouvertes (altitudes de l'IGN, OpenStreetMap, LiDAR), seule l'emprise de la zone est envoyée à ces services. Le plan de ville (sprint) est calculé par les serveurs d'Ozimut (GitHub), qui ne reçoivent que le centre et la taille de la zone ; la demande, avec le numéro de votre compte, et la carte obtenue sont gardées 30 jours. La position GPS du mode terrain reste dans votre navigateur, sauf la trace que vous choisissez d'enregistrer comme fond. Quand le compte est supprimé, chaque carte qu'il a créée passe au premier cartographe de son équipe, sinon elle est supprimée avec tout ce qu'elle contient.</p>
      <h2 style="font-size:16px">Tracé des circuits</h2>
      <p>Un événement de la page « Tracer » (ses circuits, sa carte, ses versions, les commentaires de l'équipe et les états des
        postes notés en mode terrain) est conservé dans l'espace de stockage du site (Cloudflare) et n'est accessible qu'à son équipe :
        son créateur et les personnes qui la rejoignent par un lien d'invitation que l'équipe leur a transmis (personne n'y est
        recherché par son nom, sa licence ou son adresse e-mail) ; leur nom, leur compte et, pour un licencié FFCO, sa licence sont
        enregistrés avec leur rôle. Les
        versions, les commentaires et les états des postes portent le nom de leur auteur. En mode terrain, l'état noté sur un poste
        enregistre aussi la position du téléphone à cet instant (pour la comparer à la carte), visible de l'équipe, et l'équipe
        peut y joindre des photos des postes (elles peuvent montrer des personnes : évitez-le), effacées avec l'événement ; la position
        n'est lue que pendant ce mode, avec l'autorisation du navigateur. Si l'équipe chiffre l'événement, ces données sont chiffrées
        dans le navigateur et illisibles pour le site. L'événement est conservé jusqu'à sa suppression par son créateur ; si
        celui-ci supprime son compte, il passe au premier traceur (à défaut, contrôleur) de l'équipe qui a un compte, sinon il est
        supprimé. Le calcul de la dénivelée envoie au service d'altitude de l'IGN (Géoplateforme, France) les seules coordonnées des
        postes et des coudes des circuits, sans nom ni code.</p>
      <h2 style="font-size:16px">Palmarès des jeux</h2>
      <p>Quand vous êtes connecté, chaque partie terminée d'un jeu (« Jeux ») envoie son résultat : il est
        gardé sous le nom de votre compte si c'est l'un de vos 20 meilleurs pour ce jeu, et montré aux autres comptes s'il est parmi les
        20 meilleurs de tous. Le résultat, ses réglages et la date seulement ; rien n'est gardé des parties d'un visiteur sans compte.
        Ces résultats sont supprimés avec votre compte.</p>
      <h2 style="font-size:16px">Pixel</h2>
      <p>Chaque course terminée dans Pixel est gardée sous le nom de votre compte : son temps, ses temps intermédiaires, la
        distance courue et son tracé dans la forêt virtuelle, montrés aux autres comptes dans les résultats, le classement et l'analyse
        de ce circuit ; vous êtes reconnu d'une course à l'autre par une empreinte de votre compte, jamais par son numéro. Rien n'est
        gardé des courses d'un visiteur sans compte. Un organisateur qui crée un événement y envoie sa carte OCAD (et, s'il le veut,
        ses circuits) : elle est gardée dans l'espace de stockage du site, n'est montrée qu'aux coureurs de l'événement, dans le jeu,
        une fois qu'il l'a publié, et sert à fabriquer la course sur GitHub, où elle n'est pas conservée. Ces courses, et les événements
        avec leurs cartes et leurs résultats, sont supprimés avec votre compte.</p>
      <h2 style="font-size:16px">Questions à l'IA</h2>
      <p>Sur la page « IA », votre question est envoyée au modèle de langage qui écrit la requête, avec la description des tables du
        site, la date du jour, votre numéro de licence et la méthode et la discipline choisies : par défaut le modèle d'Ozimut, exécuté
        par Cloudflare (Workers AI) ; ni le site ni Cloudflare ne conservent les questions. La requête s'exécute ensuite dans votre
        navigateur, sur les données que le site publie : elles ne sont transmises à aucun modèle. Si vous utilisez votre propre clé
        d'API (Anthropic, OpenAI, Google ou OpenRouter), votre navigateur envoie ces mêmes éléments directement à ce fournisseur, sous
        votre compte et selon ses conditions (avec une clé gratuite, Google peut se servir des questions pour améliorer ses
        produits) ; la clé reste dans votre navigateur et n'est jamais transmise à Ozimut.</p>
      <h2 style="font-size:16px">Données de votre compte</h2>
      <ul>
        <li><b>Données conservées :</b> l'adresse e-mail ; les prénom et nom saisis ; les pays rejoints, avec pour chacun le club et le
          numéro de membre indiqués, et pour la France le numéro de licence, vérifié d'après les résultats publiés par la FFCO ; le mot de passe, sous une forme chiffrée irréversible ; les dates d'inscription et
          de dernière connexion ; la langue choisie pour le site et les e-mails ; les réglages d'alertes (régions choisies) et la liste des
          courses déjà annoncées par e-mail ; pour le
          simulateur de relais, les coureurs ajoutés (nom, catégorie, CN estimé) et ceux marqués indisponibles, visibles de vous seul.
          N'y ajoutez que des personnes qui y consentent.</li>
        <li><b>Finalités et bases légales :</b> l'exécution du service demandé lors de la création du compte (réserver ${world
          ? "les données de la FFCO à ses licenciés" : "l'accès aux licenciés de la FFCO"}, confirmer l'adresse e-mail, réinitialiser le mot de passe) ; l'intérêt légitime de l'éditeur à détecter
          les comptes multiples pour une même licence ; votre consentement pour les alertes par e-mail ou par notification, que vous pouvez retirer à tout
          moment dans Réglages.</li>
        <li><b>Durée de conservation :</b> jusqu'à la suppression du compte, que vous pouvez effectuer à tout moment dans Réglages. Un
          e-mail en attente d'envoi est effacé dès son envoi.</li>
        <li><b>Destinataires :</b> l'administrateur du site et les prestataires techniques mentionnés ci-dessous. Aucune donnée n'est
          vendue ni utilisée à des fins publicitaires.</li>
      </ul>
      <p>Un message envoyé par la page « Nous écrire » parvient à l'éditeur par e-mail, accompagné de votre adresse, de votre nom et du
        navigateur utilisé ; il est conservé dans sa messagerie le temps nécessaire au traitement de la demande.</p>
      <h2 style="font-size:16px">Notifications</h2>
      <p>Si vous autorisez les notifications d'Ozimut sur un appareil, le site conserve, pour cet appareil, l'adresse d'envoi que lui
        attribue le service de notification de votre navigateur (Google pour Chrome et Android, Apple pour Safari, Mozilla pour
        Firefox, Microsoft pour Edge), les clés qui servent à chiffrer les messages et le type d'appareil (par exemple
        « Chrome · Android »). Les messages (votre heure de départ, la mise en ligne de vos résultats, les courses de l'agenda,
        selon vos réglages) sont chiffrés de bout en bout : le service de notification les achemine sans pouvoir les lire. Le site
        conserve aussi la dernière heure de départ notifiée pour chaque course, afin de ne la renvoyer que si elle change, et les
        notifications en attente d'envoi, quelques jours au plus. Base légale : votre consentement, donné en autorisant les
        notifications et retirable à tout moment dans Réglages ou dans les réglages de votre navigateur. Ces données sont effacées
        lorsque vous désactivez les notifications sur l'appareil, lorsque vous vous déconnectez de cet appareil et avec le compte.</p>
      <h2 style="font-size:16px">Statistiques d'utilisation</h2>
      <p>Afin de connaître l'usage du site et de l'améliorer (intérêt légitime), le site enregistre, pour chaque compte, le nombre de
        pages vues par jour et par rubrique (Classement, Coureur, Réseau, etc.) et le nombre de visites. Aucune autre donnée n'est
        enregistrée à ce titre : ni les recherches effectuées, ni l'adresse IP. Ces statistiques ne sont accessibles qu'à
        l'administrateur ; elles sont conservées 13 mois et supprimées avec le compte. Avec chaque page vue, le site
        note aussi le temps que la page a mis à s'afficher et à réagir, pour suivre sa rapidité. Ces durées sont comptées par jour,
        par page et par version du site, sans lien avec le compte.</p>
      <h2 style="font-size:16px">Sécurité</h2>
      <p>Afin de limiter les tentatives répétées (connexion, inscription, mot de passe oublié), le site comptabilise les essais par
        adresse IP et par adresse e-mail (intérêt légitime) ; ces compteurs sont effacés au bout d'un jour environ. L'hébergeur peut en
        outre traiter l'adresse IP pour acheminer les pages et protéger le site contre les attaques.</p>
      <h2 style="font-size:16px">Prestataires et transferts hors de l'Union européenne</h2>
      <p>Les prestataires suivants traitent des données pour le compte de l'éditeur :</p>
      <ul>
        <li><b>Cloudflare, Inc.</b> (États-Unis) héberge le site, sa base de comptes et son espace de stockage de fichiers, et exécute
          le modèle de langage de la page « IA » et celui qui traduit les articles de la page « Santé » ; à l'inscription et à l'entrée sans compte, son service Turnstile vérifie que le site est utilisé par une
          personne et non par un robot, en examinant le navigateur sans cookie publicitaire ni suivi d'un site à l'autre. Les
          transferts vers les États-Unis reposent sur le cadre de protection des données UE-États-Unis (Data Privacy Framework),
          auquel Cloudflare a adhéré.</li>
        <li><b>Resend</b> (Plus Five Five, Inc., États-Unis) assure l'envoi des e-mails du site, ce qui implique l'adresse du
          destinataire et le contenu du message. Les transferts sont encadrés par les clauses contractuelles types de la Commission
          européenne.</li>
        <li><b>Scaleway</b> (Scaleway SAS, France) envoie les e-mails que l'offre gratuite de Resend ne peut pas prendre, ce qui implique
          les mêmes données ; elles restent dans l'Union européenne (Paris).</li>
        <li><b>GitHub, Inc.</b> (États-Unis) exécute les mises à jour automatiques du site ; les résultats et les fichiers déposés y sont
          traités, à l'exclusion des données de compte. Les transferts sont encadrés par les clauses contractuelles types.</li>
      </ul>
      <h2 style="font-size:16px">Cookies et stockage local</h2>
      <p>Le site dépose un cookie strictement nécessaire à son fonctionnement : il maintient votre connexion, pendant 30 jours
        au plus ; une visite sans compte en reçoit un autre, qui atteste pendant 12 heures le passage de la vérification anti-robot et
        ne contient rien d'autre. Le navigateur conserve également, sur votre appareil, vos préférences d'affichage (langue, thème, discipline et
        méthode choisies), vos saisies dans le calculateur VMA ou le simulateur de relais et, pour le tracé des circuits, ses réglages d'affichage, la clé
        d'un événement chiffré, tirée de sa phrase de passe (le temps de l'onglet), les états du mode terrain en attente de réseau et, si vous
        gardez un événement pour travailler hors ligne, sa copie (circuits et carte, chiffrés s'il l'est) et les fichiers du site, effacés à la déconnexion ;
        si vous utilisez votre propre clé d'API sur la page « IA », cette clé (le temps de l'onglet, ou sur l'appareil si vous le demandez ;
        effacée à la déconnexion). Le site n'utilise aucun traceur publicitaire ni
        aucun outil tiers de mesure d'audience ; aucun consentement n'est donc requis.</p>
      <h2 style="font-size:16px">Vos droits</h2>
      <p>Conformément au RGPD, vous disposez d'un droit d'accès, de rectification, d'effacement et de portabilité de vos données, d'un
        droit à la limitation de leur traitement et d'un droit d'opposition aux traitements fondés sur l'intérêt légitime de
        l'éditeur.</p>
      <p>Vous pouvez en particulier demander à ne plus être identifié sur ${SITE}, sauf motif légitime et impérieux : votre nom et
        votre numéro de licence y sont alors remplacés, sur l'ensemble du site, par une mention anonyme (« Coureur anonyme »). Vos
        temps et vos places restent pris en compte, sans votre nom ni votre numéro de licence, afin que les classements des autres
        licenciés ne soient pas modifiés ; la mesure est réversible à votre demande. Une demande d'effacement des données de résultats
        est satisfaite de la même manière ; un compte, en revanche, est supprimé intégralement. Les données d'un licencié mineur sont
        anonymisées, et son compte supprimé s'il en a un, sur simple demande de son représentant légal, qui exerce ces droits en son
        nom.</p>
      <p>Vous pouvez supprimer vous-même votre compte, dans Réglages. Les autres demandes sont à adresser à contact@ozimut.com ; il y est
        répondu dans un délai d'un mois. En cas de doute raisonnable sur l'identité du demandeur, un justificatif peut être demandé.
        Si vous estimez que vos droits ne sont pas respectés, vous pouvez introduire une réclamation auprès de la CNIL
        (<a href="https://www.cnil.fr/fr/plaintes" target="_blank" rel="noopener">cnil.fr/fr/plaintes</a>).</p>
      <h2 style="font-size:16px">Mentions légales</h2>
      <p><b>Éditeur et directeur de la publication :</b> Yann Le Helloco, particulier, publication à titre non professionnel ;
        contact : contact@ozimut.com.<br>
        <b>Hébergeur :</b> Cloudflare, Inc., 101 Townsend Street, San Francisco, CA 94107, États-Unis ; téléphone : +1 888 993 5273.</p>
      <p><b>Propriété intellectuelle :</b> les textes, les illustrations, la présentation et le code du site sont protégés par le droit
        d'auteur ; sauf mention contraire, ils appartiennent à l'éditeur, et leur reproduction demande son accord. Les articles de la
        page « Santé » appartiennent à leurs auteurs (voir « Santé : articles et droits d'auteur »). Les résultats, classements
        officiels et calendriers repris par le site restent ceux de leurs sources (voir « Indépendance et sources ») ; les éléments
        venus de tiers sont cités ci-dessous.</p>
      <p><b>Crédits :</b> les symboles et les textes des définitions de postes (Coach › Définitions de postes, le tracé des circuits)
        viennent de Purple Pen, de Peter Golde (<a href="https://github.com/petergolde/PurplePen" target="_blank" rel="noopener">github.com/petergolde/PurplePen</a>),
        sous <a href="assets/tracer/LICENSE-PurplePen.txt" target="_blank" rel="noopener">licence BSD</a>.</p>
      <p class="muted">Dernière mise à jour : 22 novembre 2026.</p>
`;
