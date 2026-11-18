// The Documentation's guide to the site, in French (owner, 2026-10-24: the page told the methods but not the site; 2026-10-31:
// one documentation per module). guide.en.js in step: the same structure, the English words. build(X) receives the page's
// helpers and returns « Le site » (the documentation's home: short, every section on one page) and the guides of Arena,
// Coach, Orga and Carto, each a set of chapters (Stats' documentation is the methods', content/methods.*.js; Orga's « Le tracé »
// too). Plain sentences for orienteers; a page is named as the menu names it, with a link.
import APP from "./chronoapp.fr.js";

export function build(X) {
  const { html, raw, subTabs, fr = true, admin = false, owner = false } = X;
  // a page of the site, as the menus name it
  const P = (href, label) => html`<a href="${href}">${label}</a>`;
  // a module's documentation
  const M = (mod, label) => html`<a href="#/documentation?module=${mod}">${label}</a>`;
  // a tab of the module's documentation shown (Orga: « Le tracé »)
  const D = (tab, label, goto) => html`<a href="#/documentation?onglet=${tab}${goto ? `&voir=${goto}` : ""}" data-tab-link="${tab}"${raw(goto ? ` data-goto="${goto}"` : "")}>${label}</a>`;
  const chapters = (list, CH) => raw(subTabs(list, list[0][0]).s.replace(/<div data-subpanel="([a-z-]+)"( hidden)?><\/div>/g, (m0, k, hid) =>
    `<div data-subpanel="${k}"${hid || ""}>${CH[k]().s}</div>`));
  const slide = (kicker, title, body, id) => html`<section class="mx-slide"${raw(id ? ` id="${id}"` : "")}><p class="mx-kicker">${kicker}</p><h2>${title}</h2>${body}</section>`;
  const list = (items) => html`<ul class="mx-list">${items.filter(Boolean).map((i) => html`<li><span>${i}</span></li>`)}</ul>`;
  // a chapter of Orga's documentation
  const CHAP = (chapter, label) => html`<a href="#/documentation?module=orga&voir=${chapter}" data-tab-link="orga" data-goto="${chapter}">${label}</a>`;
  // the desktop application's own documentation (content/chronoapp.*.js, which the application shows too): a slide a section
  const appDoc = (kicker) => html`<p class="muted" style="margin:0 0 14px">${APP.lede}</p>${APP.sections.map((sec) => slide(kicker, sec.title,
    raw(sec.html.replace(/<table>/g, '<div class="table-wrap"><table class="data compact">').replace(/<\/table>/g, "</table></div>")), `chrono-app-${sec.id}`))}`;

  // what each documentation says under its title
  const LEDE = {
    home: html`Ozimut en quelques mots, puis la documentation de chaque module : choisissez celui qui vous intéresse.`,
    arena: html`Les compétitions : l'agenda, les résultats des organisateurs, le direct et l'analyse des temps intermédiaires.`,
    coach: owner ? html`S'entraîner : les analyses de traces GPS, les définitions de postes, les symboles de carte, les jeux et la VMA.`
      : html`S'entraîner : les analyses de traces GPS, les jeux et la VMA.`,
    orga: html`Les événements de l'organisateur, une course ou un entraînement chacun : le tracé des circuits, les départs, le direct, les résultats, l'analyse et l'équipe.`,
    carto: html`Dessiner et mettre à jour des cartes de course d'orientation dans le navigateur : fichiers OCAD et Mapper, données ouvertes et LiDAR, relevés sur le terrain avec le téléphone, impression, travail en équipe.`,
  };

  // ======================================================================================================
  // Le site: the documentation's home, short
  // ======================================================================================================
  function site() {
    return html`
      ${slide("Le site", "Les modules et le compte", html`
        <p>Ozimut a plusieurs modules, Arena, Stats, Coach, Orga et Carto : la page des modules, où l'on arrive, propose de choisir l'un d'eux, et
          la barre du haut montre alors ses pages seulement. Le logo Ozimut y ramène à tout moment. Orga et Carto, les modules des organisateurs et des
          cartographes, ne s'affichent qu'à ceux qui s'en servent : cochez-les à l'inscription, dans Réglages › Modules ou en bas de la page des
          modules, ou laissez-les venir d'eux-mêmes — ils apparaissent dès que vous rejoignez l'équipe d'un événement, d'un tracé ou d'une carte, ou
          que vous en commencez un. Arena, Stats et Coach se masquent dans Réglages › Modules. Un module masqué s'ouvre toujours depuis un lien ;
          Orga s'utilise sur ordinateur, Carto aussi sur téléphone.</p>
        ${list([
          html`<b>Sans compte</b>, Ozimut montre ce qui est public : Arena, Coach sauf la comparaison avec les autres coureurs, et dans Stats le coureur, le classement et les
            courses sur la période que la fédération publie librement.`,
          html`<b>Un compte</b> s'ouvre avec une adresse e-mail et un mot de passe, puis les pays où l'on court (${P("#/reglages?onglet=pays", "Réglages › Mes pays")}).
            Pour la France, le nom et le numéro de licence sont vérifiés auprès de la liste des licenciés : c'est ce qui ouvre ${fr ? "les classements et votre page de coureur" : "les classements français"}.
            Le compte ne garde que ce qu'il faut ; ${P("#/compte/confidentialite", "Règles du site et confidentialité")} dit quoi, où et combien de temps.`,
          html`Sous votre nom : la page des modules, cette documentation, les ${P("#/reglages", "Réglages")}, « Nous écrire » et la déconnexion. Les pages
            encore en essai portent la mention « bêta ».`,
        ])}`, "menus")}
      ${slide("Le site", "Pays, langue et thème", html`
        ${list([
          html`<b>Le pays</b>, en haut, choisit les compétitions que l'on voit : l'agenda d'une trentaine de pays, lu chaque matin chez leur fédération,
            leurs résultats et leur direct, ouverts à tous. Les classements n'existent que là où Ozimut a les résultats de la fédération : la France
            (${fr ? "le CN officiel et " : ""}l'indice Ozimut) et l'Espagne (l'indice Ozimut).`,
          html`<b>La langue</b>, français, anglais, allemand ou espagnol, change sur cet appareil et, connecté, pour le compte (les e-mails suivent).`,
          html`<b>Le thème</b>, sous la lune : Jour, Clairière, Forêt, Sous-bois ou Nuit ; clair sur un ordinateur, sombre sur un téléphone par défaut.`,
        ])}`, "pays")}
      ${slide("Le site", "Les alertes", html`
        <p>Dans les ${P("#/reglages", "Réglages")}, chaque alerte part par e-mail, par notification, ou les deux : <b>une de mes courses est en ligne</b>${fr ? "" : " (avec une licence française)"},
          <b>mon heure de départ est publiée</b>, <b>une nouvelle course dans mes régions</b> et <b>la clôture des inscriptions approche</b>. Les
          notifications se règlent appareil par appareil ; les e-mails d'alerte sont ouverts compte par compte, le nombre d'envois du site étant limité.</p>`, "compte")}
      ${slide("Le site", "Sur le téléphone", html`
        ${list([
          html`<b>L'application</b> : « Installer l'application » dans le menu sous votre nom (Chrome, Edge, Android) ; sur iPhone, Partager › « Sur l'écran
            d'accueil » — c'est aussi la seule façon d'y recevoir les notifications.`,
          html`<b>Partager une trace</b> depuis la montre ou le téléphone vers Ozimut ouvre l'${P("#/analyse-solo", "Analyse solo")} avec le fichier ; rien
            n'est envoyé.`,
        ])}`, "telephone")}`;
  }

  // ======================================================================================================
  // Arena
  // ======================================================================================================
  const ARENA = [["competitions", "Les compétitions"], ["resultats", "Résultats"], ["direct", "En direct"], ["analyse", "Analyse"]];
  function arena() {
    return chapters(ARENA, {
      competitions: () => html`
        ${slide("Arena", "Une page, toutes les compétitions", html`
          <p>Arena est une seule page, les ${P("#/agenda", "Compétitions")} du pays choisi : trois cases choisissent celles d'aujourd'hui, celles à venir et
            celles des 60 derniers jours. L'agenda vient chaque matin du calendrier de la fédération — les courses, et aussi les entraînements, stages et
            formations. On filtre par date, spécialité, région${fr ? ", département, et aux courses comptant pour le CN" : ""} ; sur un ordinateur, une carte
            montre où elles ont lieu.${fr ? " Les championnats et nationales des saisons suivantes viennent aussi du calendrier national, souvent provisoire, avant que leur organisateur ne les inscrive à l'agenda : ils sont marqués « provisoire », leur date et leur organisation peuvent encore changer." : ""}</p>
          ${list([
            html`<b>Une compétition à venir</b> s'ouvre à côté de la liste : le lieu et l'itinéraire, l'annonce, ${fr ? "le nombre d'inscrits par circuit, " : ""}la
              clôture des inscriptions, et des boutons quand ils existent — la liste de départ${fr ? " (avec le CN de chacun et la place qu'il laisse attendre)" : ""},
              « Suivre en direct », le suivi GPS.`,
            html`<b>Une compétition passée</b> ouvre sa page : les résultats en premier onglet, puis, quand les temps intermédiaires sont publiés, chaque vue
              de leur analyse. « ‹ Compétitions » ramène à la liste là où on l'avait laissée.`,
          ])}`)}`,
      resultats: () => html`
        ${slide("Arena", "Les résultats des organisateurs", html`
          <p>Les résultats des 60 derniers jours paraissent tels que les organisateurs les publient, souvent le soir même, des jours avant la fédération.
            Ozimut les cherche lui-même plusieurs fois par jour, et toutes les 20 minutes les samedis et dimanches soir :</p>
          ${list([
            html`sur les <b>plateformes</b> de résultats : liveresultat, WinSplits, Helga, O'Live, SPORTident Center, OResults, les sites MeOSDjango (dont Orientation Data) ;`,
            html`sur le <b>site du club</b> organisateur : ses pages et ses fichiers (HTML d'OE ou de MeOS, IOF XML, PDF) ;`,
            html`dans les <b>dépôts</b> des organisateurs et leurs <b>diffusions en direct</b> (voir la documentation d'${M("orga", "Orga")}).`,
          ])}
          <p>Une course en cours le dit (« en cours ») tant que des coureurs sont dehors. Quand plusieurs documents existent, Ozimut montre le meilleur :
            celui de l'organisateur avant les plateformes, les résultats en direct en dernier (ils ne sont pas corrigés ensuite). Les coureurs sont reconnus
            par leur nom et leur club.</p>`)}
        ${!fr ? "" : html`
        <section class="mx-slide">
          <p class="mx-kicker">Résultats</p>
          <h2>Scores et CN provisoires</h2>
          <p>Le site calcule des scores provisoires avec les règles de chaque méthode, pour les coureurs reconnus.</p>
          ${list([
            html`<b>Officiel</b> : le CN officiel de chaque coureur reconnu, 15 jours avant la course, et la règle de la FFCO (moyenne ordinaire sur les deux
              tiers les plus rapides).`,
            html`<b>Ozimut</b> : le niveau habituel de chaque coureur reconnu, 15 jours avant la course, la valeur Ozimut du circuit (la
              moyenne des niveaux × temps des plus rapides : 90 % du peloton en forêt, deux tiers en sprint), et le facteur de recalage du jour. L'indice Ozimut
              provisoire après la course suit la règle des places.`,
            html`Seules les listes <b>par circuit</b> sont notées. Une liste par catégorie l'est circuit par circuit une fois qu'on sait quelles catégories
              couraient sur quel circuit (d'après les listes par circuit de la même course, la liste d'inscription de la FFCO ou l'annonce de course). Les
              coureurs non reconnus restent sans CN.`,
            html`Ces valeurs sont provisoires jusqu'à la publication par la FFCO : les valeurs définitives peuvent différer, si des résultats sont corrigés
              ou des coureurs ajoutés.`,
          ])}
        </section>`}`,
      direct: () => html`
        ${slide("Arena", "En direct", html`
          <p>Le jour de la course, « Suivre en direct » relaie les résultats publiés pendant la course sur liveresultat, O'Live, SPORTident Center, OResults, un site
            MeOSDjango, ou envoyés par l'organisateur depuis son logiciel de chronométrage. Une compétition où un poste ou l'arrivée a enregistré un passage
            dans la dernière demi-heure est marquée « direct ».</p>
          ${list([
            html`<b>Par circuit ou par catégorie</b> : place, temps, écart, heure de départ${fr ? ", le CN de chacun et la place qu'il laisse attendre, et le score de son temps" : ""}.
              Un coureur encore dehors a une heure d'arrivée estimée d'après ses postes radio et le temps des arrivés.`,
            html`<b>Suivre</b> : « Mon club » (les coureurs de votre club, toutes catégories), « Encore en course », « Tous les passages » des 15
              dernières minutes, et ceux de votre club, qui peuvent faire vibrer et sonner le téléphone à chaque passage.`,
            html`<b>Les passages récents</b> sont en vert (moins de 3 minutes) puis en jaune (moins de 9) ; une recherche trouve un coureur ou un club.`,
            html`Dès qu'un temps intermédiaire arrive, « Analyse » analyse la course en direct.`,
          ])}`)}`,
      analyse: () => html`
        ${slide("Arena", "Analyse", html`
          <p>Quand les temps intermédiaires sont publiés, la page d'une course les analyse circuit par circuit, en plusieurs vues : Tableau, Écarts,
            Passages, Inter-postes, Profil, Face-à-face, Groupes, Autonomie, Régularité et Bilan.</p>`)}
        <section class="mx-slide">
          <p class="mx-kicker">Temps intermédiaires</p>
          <h2>Le temps perdu et les erreurs</h2>
          ${list([
            html`Sur chaque tronçon entre deux postes, le <b>temps perdu</b> est l'écart entre le temps du coureur et le temps que son allure habituelle
              sur cette course laissait prévoir. Il est négatif quand le coureur va plus vite que d'habitude. Le temps de référence d'un tronçon est la
              moyenne des temps les plus rapides (le sixième le plus rapide, sans le vainqueur), et l'allure habituelle le temps du coureur sur les tronçons
              courus sans erreur rapporté à leurs temps de référence : un long tronçon y compte plus qu'un court, comme dans MeOS.`,
            html`Une <b>erreur</b> est un tronçon où le coureur a perdu au moins 20 % du temps du tronçon <b>et</b> au moins 10 secondes ; les deux seuils se
              règlent. Les colonnes « Perdu » et « Sans temps perdu » ne comptent que les erreurs.`,
            html`Les <b>écarts</b> se mesurent au « superman », un coureur imaginaire qui aurait le meilleur temps sur chaque tronçon, parmi tous les
              coureurs ou parmi ceux que l'on compare.`,
            html`Les <b>groupes</b> repèrent les coureurs qui passent aux mêmes postes à quelques secondes d'intervalle, poste après poste.`,
          ])}
        </section>
        <section class="mx-slide">
          <p class="mx-kicker">Temps intermédiaires</p>
          <h2>Passages, autonomie, régularité, contrôle des temps</h2>
          ${list([
            html`Le <b>graphique des passages</b> place chaque coureur à l'heure où il pointe chaque poste (son heure de départ plus son temps cumulé) :
              des lignes qui se rejoignent sont des coureurs ensemble, une ligne plus raide est un coureur qui en rattrape d'autres.`,
            html`<b>Autonomie</b>, qui a suivi qui : sur chaque tronçon, deux coureurs du circuit partis du même poste à moins de 20 secondes d'intervalle sont
              comparés tout du long, chacun supposé avancer à vitesse régulière entre les deux postes. À moins de 7 secondes l'un de l'autre, ils courent
              ensemble ; de 7 à 20 secondes, de moins en moins. Celui qui passe le second suit l'autre. L'indice suiveur est le temps couru derrière moins
              le temps couru devant, rapporté au temps de course : positif pour un suiveur, négatif pour un lièvre. Suivre fait gagner du temps (l'autre
              lit la carte et ouvre le chemin), d'où l'intérêt de le repérer ; les deux seuils se règlent.`,
            html`<b>Régularité</b> : sur chaque tronçon, l'indice de performance est le temps de référence (la moyenne du meilleur quart des temps)
              divisé par le temps du coureur, 100 % pour aller aussi vite que les meilleurs. L'irrégularité est l'écart type de ces indices, chaque tronçon
              pesant son temps de référence, rapporté à l'indice moyen du coureur : un coureur régulier garde le même rythme d'un tronçon à l'autre, un
              coureur irrégulier alterne bons tronçons et hésitations. La dispersion d'un tronçon, le niveau de chacun mis à part, montre ceux où tout le
              monde a varié : les tronçons piégeux. Seuls les coureurs arrivés avec tous leurs temps comptent.`,
            html`Le <b>contrôle des temps</b> lit les temps intermédiaires eux-mêmes. Un tronçon couru en temps négatif au même poste pour au moins deux
              coureurs trahit un boîtier mal mis à l'heure (celui de ce poste ou du précédent) : il décale tous ceux qui y pointent. Un tronçon négatif
              isolé trahit une carte non effacée, qui garde les poinçons d'une course précédente. Un coureur classé sans un poste que les autres ont pointé
              l'a sans doute pointé avant son départ, et le logiciel a écarté ce poinçon. L'organisateur le voit en déposant ses résultats, avant de les
              publier ; le lecteur, au-dessus des analyses, et les cases concernées sont encadrées dans le tableau.`,
          ])}
        </section>`,
    });
  }

  // ======================================================================================================
  // Coach
  // ======================================================================================================
  const COACH = [["carte", "Analyse"], ["solo", "Analyse solo"], ["multi", "Comparer avec les autres coureurs"], ["cartes", "Mes cartes"], ...(owner ? [["definitions", "Définitions de postes"], ["symboles", "Symboles de carte"]] : []),     // (the accounts named Le Helloco only, auth.owner)
    ["jeux", "Jeux"], ["vma", "VMA"], ["routes", "Itinéraires calculés"]];     // (every account's since 2026-11-04)
  function coach() {
    return chapters(COACH, {
      carte: () => html`
        ${slide("Coach", "Analyse", html`
          <p>L'${P("#/analyses", "Analyse")} s'ouvre sur la liste des compétitions et des entraînements dont l'organisateur a publié la carte et les circuits.</p>
          ${list([
            html`<b>La liste</b> se filtre par période, par pays (au-dessus de la liste), par type (compétitions ou entraînements), par club organisateur et par nom ;
              sur un ordinateur, la carte du pays est à côté, et la carte de l'événement apparaît en vignette sous la souris.`,
            html`<b>Un événement choisi</b> propose trois entrées : <b>Voir avec tous les coureurs</b> (les traces partagées, rejouées ensemble), <b>Ajouter ma trace et
              comparer</b> (votre trace rejoint celles des autres, avec votre accord) ou <b>Analyser ma trace seule sur cette carte</b> (l'Analyse solo sur la carte de
              l'organisateur : vous ne déposez que votre trace, elle se pose d'elle-même, et rien n'est envoyé). Ajouter sa trace demande un compte, et
              l'organisateur peut fermer l'une ou l'autre entrée.`,
            html`<b>Ajouter mon propre événement</b> ouvre l'Analyse solo sur votre carte et votre trace, pour un entraînement ou n'importe quelle sortie. Si la trace
              est celle d'une course dont les résultats sont publiés, ou d'un événement dont l'organisateur a publié la carte, la page le propose.`,
          ])}`)}`,
      solo: () => html`
        ${slide("Coach", "Analyse solo", html`
          <p>L'${P("#/analyse-solo", "Analyse solo")} rejoue votre course sur votre carte avec votre trace GPS. On y entre par l'${P("#/analyses", "Analyse")} :
            « Ajouter mon propre événement » (un entraînement, n'importe quelle sortie, ou une compétition dont vous avez la carte : la page propose ses temps
            intermédiaires publiés quand la trace en est), ou la carte publiée par l'organisateur, sans carte à fournir ni calage à faire.</p>
          ${list([
            html`<b>Les fichiers</b> : la carte (image, PDF, KMZ, ou le fichier OCAD ou Mapper lui-même), la trace (GPX, FIT ou TCX) et, si on les a, le calage
              de la carte (KMZ, fichier de géoréférencement) et les circuits en IOF XML. Sur un téléphone, « Photographier la carte ».`,
            html`<b>Le calage</b> se fait seul : le parcours est lu sur la carte, la trace posée dessus ; si la lecture se trompe, quelques clics la corrigent.`,
            html`<b>La course</b> se rejoue ensuite, plein écran si on veut, inter-poste par inter-poste, avec le temps perdu, l'allure et les courbes de la
              montre (fréquence cardiaque, cadence, altitude…).`,
            html`<b>La trace</b> se colore par allure, fréquence cardiaque, altitude, pente, cadence ou puissance (ce que la montre a enregistré), avec sa
              légende ; on peut en couper le début et la fin (l'échauffement, le retour) et <b>exporter une image</b> de la carte avec la trace, un titre et
              la légende, enregistrée sur l'appareil.`,
            html`<b>Pas de trace GPS ?</b> « Dessiner mon itinéraire » : cliquez votre itinéraire sur la carte, poste après poste ; les temps intermédiaires publiés
              (ou ceux que vous tapez, l'arrivée au moins) le font courir comme une trace de montre ; « Coller aux chemins » pose ensuite chaque inter-poste
              sur le passage le plus proche que lit la carte. Un itinéraire dessiné ne sert pas à se comparer aux autres coureurs. <b>📏</b> mesure une distance sur la carte, et
              « Orientation de la carte » peut tourner l'inter-poste en cours vers le haut.`,
          ])}
          <p>La carte et la trace sont lues dans votre navigateur et n'en sortent pas ; seul le calage des postes est gardé, pour retrouver l'analyse telle
            qu'on l'a laissée.</p>`)}`,
      multi: () => html`
        ${slide("Coach", "Comparer avec les autres coureurs", html`
          <p>« ${P("#/analyses", "Comparer avec les autres coureurs")} » met côte à côte les traces de tous ceux qui ont couru une compétition ou un entraînement, sur la carte
            que l'organisateur a préparée (voir la documentation d'${M("orga", "Orga")}). Choisissez la course, ajoutez votre trace — elle ne garde que les
            positions et les heures —, et comparez. Il faut un compte.</p>
          ${list([
            html`<b>Le rejeu</b>, comme sur Livelox : heure réelle, départ en masse, attente aux postes, un inter-poste à la fois.`,
            html`<b>À gauche de la carte</b>, l'onglet « Inter-postes » (ouvert d'emblée) détaille les inter-postes d'un coureur, et l'onglet « Analyses » les temps intermédiaires (ceux publiés pour une compétition), les écarts, les variantes d'itinéraire, et
              pour un entraînement les exercices de l'organisateur (couloir, azimut).`,
            html`<b>L'accès</b> : tous les comptes, les membres d'un club (et ses invités, avec le code que l'organisateur leur donne), ou un mot de passe. Votre propre fichier affiche aussi vos courbes à côté de la carte,
              pour vous seul.`,
            html`Chacun peut <b>commenter</b> sa course (« Mon commentaire »), lu par tous ceux qui voient les traces.
              L'organisateur peut ouvrir l'analyse <b>aux visiteurs sans compte</b> : ils ne voient que les traces des coureurs qui l'ont accepté. Un circuit
              <b>au score</b> (postes dans n'importe quel ordre) montre l'ordre de chacun.`,
          ])}`)}`,
      cartes: () => html`
        ${slide("Coach", "Mes cartes", html`
          <p>${P("#/mes-cartes", "Mes cartes")} garde vos cartes et les itinéraires que vous y avez courus, comme un DOMA à vous : une galerie à chercher par
            titre, lieu ou année, et chaque carte avec ses courses dessinées dessus, d'une couleur chacune ou selon l'allure. Il faut un compte.</p>
          ${list([
            html`<b>Ajouter une course</b> : dans l'Analyse solo, une fois la course calée, « Enregistrer dans Mes cartes ». Sont gardés la carte telle que vous
              l'avez donnée et l'itinéraire tel qu'il est dessiné (positions sur la carte et heures, postes), jamais le fichier GPS. La même carte n'est gardée
              qu'une fois : une autre course dessus s'y ajoute.`,
            html`<b>Importer</b> : les JPEG que QuickRoute exporte (ceux que DOMA garde), les fichiers d'Ozimut, un par un ou dans un zip, ou déposés sur la page.
              L'import direct depuis un DOMA n'est pas encore ouvert : son bouton envoie à l'équipe Ozimut une demande toute prête pour l'activer.`,
            html`<b>Exporter</b> : chaque carte devient un JPEG que tout le monde peut ouvrir (la carte avec vos itinéraires), qui contient aussi la carte
              d'origine et les courses ; Ozimut le relit tel quel. Plusieurs cartes cochées s'exportent ensemble dans un zip, se partagent par un même lien ou se suppriment d'un coup.`,
            html`<b>Données personnelles</b> : la fréquence cardiaque, l'altitude et la cadence ne sont gardées que si vous cochez la case (décochée par défaut).`,
            html`<b>Partager</b> : vos cartes sont privées. Un lien vers toutes vos cartes, ou vers une seule, les montre à qui le reçoit, même sans compte, sans
              les données personnelles ; supprimer le lien arrête le partage.`,
          ])}`)}`,
      definitions: () => html`
        ${slide("Coach", "Définitions de postes", html`
          <p>Les ${P("#/definitions", "Définitions de postes")} présentent les symboles de l'IOF colonne par colonne, chacun avec son équivalent sur la carte,
            leurs noms dans 23 langues et une recherche. « Lire une ligne de définitions » détaille un exemple colonne par colonne. Pour réviser, on cache les
            noms, on devine la définition d'après la carte, ou la carte d'après le symbole.</p>`)}`,
      symboles: () => html`
        ${slide("Coach", "Symboles de carte", html`
          <p>Les ${P("#/symboles", "Symboles de carte")} sont la légende complète d'une carte de forêt (ISOM 2017-2), couleur par couleur : chaque symbole avec
            son numéro, son nom et ce qu'il signifie, ceux qu'il est interdit de franchir signalés. « Ce que disent les couleurs » explique la course possible
            selon le vert. Pour réviser, on cache les noms ou les dessins.</p>
          <p>Ces deux pages sont deux onglets de ${P("#/apprendre", "Apprendre")}, avec un troisième, « Entrainement » : une photo du terrain et quatre cercles de
            poste sur la carte, lequel est sur l'élément ? Vingt questions de dix secondes par défaut ; leur nombre, leur temps et ce que montre la
            question (photo, nom, définition) se règlent ; les quatre extraits de chaque question sont groupés comme dans le questionnaire.</p>`)}`,
      jeux: () => html`
        ${slide("Coach", "Treize jeux de lecture de carte", html`
          <p>Les ${P("#/jeux", "Jeux")} se jouent sur des cartes dessinées par le site à chaque partie — une forêt avec son relief et sa végétation, une
            ville, un labyrinthe — et des « photos » du terrain dessinées de même. Rien n'est envoyé ; connecté, vos parties entrent au « Palmarès » de chaque jeu (vos 20 meilleures, les 20 meilleures de tous).</p>
          ${list([
            html`<b>Choix d'itinéraire</b> : Tracé rapide (dessiner le plus court), Choix de parcours (20 secondes de carte, 5 pour choisir), Variante la
              plus rapide, Choix d'itinéraire entre trois ou quatre tracés.`,
            html`<b>Lecture du relief et du terrain</b> : Courbes de niveau, Montée ou descente ?, Cartes identiques, Cherchez l'erreur, Trail'O.`,
            html`<b>Mémoire</b> : Mémoire de carte, Mémoire photo, et le Labyrinthe, vu à la première personne.`,
            html`<b>Définitions</b> : Quel poste ?, l'entrainement d'« Apprendre » en deux niveaux — Débutant, les groupes du questionnaire, Avancé, des extraits tirés au hasard — (une photo du terrain, le bon cercle de poste sur la carte).`,
          ])}`)}`,
      vma: () => html`
        ${slide("Coach", "La VMA", html`
          <p>La page ${P("#/vma", "VMA")} présente les tests (en laboratoire, VAMEVAL, Léger-Boucher, demi-Cooper, Cooper, navette, 45-15), calcule la vitesse
            maximale aérobie d'après un demi-Cooper (6 minutes) ou un Cooper (12 minutes) — le couloir de la piste compte, comme le dernier tour incomplet —,
            en déduit les allures d'entraînement, et propose des applications gratuites pour faire les tests.</p>`)}`,
      routes: () => html`
        ${slide("Coach · essai", "Les itinéraires calculés", html`
          <p>Dans les deux analyses GPS, Ozimut propose, pour chaque inter-poste, les itinéraires les plus rapides
            sur la carte, avec leur longueur, leur dénivelé et un temps estimé — et mesure sur le même modèle l'itinéraire que chaque coureur a pris.
            Dans l'${P("#/analyse-solo", "Analyse solo")}, tous les inter-postes sont calculés et l'onglet « Itinéraires », à gauche de la carte, les reprend poste par poste (les réglages sont dans l'onglet « Calcul de route », à droite) ; dans
            « ${P("#/analyse-club", "Comparer avec les autres coureurs")} », l'inter-poste affiché, avec la liste des coureurs. C'est un prototype : les itinéraires suivent
            la carte telle qu'Ozimut la lit, et cette lecture peut se tromper. Le calcul se lance de lui-même ; on l'arrête dans l'onglet « Calcul », et l'organisateur
            d'une analyse peut le fermer pour son événement.</p>`)}
        ${slide("Coach · essai", "1. Lire la carte d'après ses couleurs", html`
          <p>La carte est une image : Ozimut ne connaît que ses couleurs. Chaque point est classé : le blanc (forêt où l'on court bien), le jaune
            (terrain découvert, plus ou moins clair), les trois verts selon leur intensité, l'olive (zone interdite), et les « encres » posées par-dessus —
            le noir, le gris, le brun, le bleu et le violet du parcours.</p>
          ${list([
            html`<b>Le papier d'abord</b> : sur une photo, il est gris, plus chaud ou plus froid, plus sombre dans un coin. Ozimut trouve sa couleur
              (les points clairs et presque gris), la mesure par carrés d'une cinquantaine de mètres et la ramène au blanc partout ; une carte exportée,
              déjà blanche, reste telle quelle. Une ombre plus claire que le gris du rocher nu n'est pas du rocher.`,
            html`<b>Les lignes du nord</b>, longues, droites, parallèles et régulièrement espacées, sont retirées (en cyan dans « Voir le terrain tel que
              lu ») : elles faisaient sinon des bandes d'eau ou de marais en travers de la carte.`,
            html`Une encre est un <b>trait</b> ou une <b>surface</b> selon son épaisseur, mesurée en mètres : ce qui reste quand on efface les traits de
              moins de 7 à 10 m de large (4 à 5 m en sprint) est une surface. Le noir épais est un bâtiment ou une grande falaise (infranchissable), le
              gris foncé un bâtiment en sprint ou du rocher nu en forêt, le brun épais une zone revêtue, le bleu épais de l'eau.`,
            html`<b>Les chemins</b> : les traits noirs fins (ou gris foncé, comme sur un scan) forment un réseau. Ozimut suit chaque trait, ses deux bouts et
              sa direction, et relie bout à bout les tirets d'un chemin en pointillés quand ils se font face par-dessus leur écart. Une chaîne de 30 m au
              moins est un chemin, de l'un de trois types d'après ses tirets comparés aux autres chemins de la carte : route ou piste (trait plein et plus
              épais, ou longs tirets épais), chemin, petit sentier (tirets courts). Des points, des triangles, un petit trait isolé n'en sont pas.`,
            html`<b>La surcharge de l'organisateur</b> : le violet imprimé sur du jaune, de l'orange ou du vert sort rouge sur le papier. Ses zones
              hachurées sont interdites ; ses bandes de croix le long d'une route sont des itinéraires interdits — on les traverse, on ne les suit pas ;
              près des postes du circuit (leurs cercles et leurs numéros), elle est ignorée. Les murs et clôtures infranchissables, eux, ne se
              distinguent pas d'un chemin sur une photo : leurs petits traits sont trop fins.`,
            html`Les <b>traits bleus fins</b> sont les ruisseaux et, serrés, les marais. Les courbes de niveau, le parcours, le texte et les points sont
              effacés : chaque point prend la couleur du terrain le plus proche en dessous.`,
            html`La carte est ensuite découpée en cases d'environ 1,5 m, chacune avec le terrain le plus présent. « Voir le terrain tel que lu »
              montre ces cases sur la carte, avec leur légende : c'est la première chose à vérifier. Ozimut avertit quand la lecture semble fausse
              (beaucoup de rocher nu ou de bâtiments en forêt, un seul terrain presque partout, aucun chemin).`,
          ])}
          <p>Limites connues : la zone interdite hachurée en violet est effacée avec le parcours ; les falaises infranchissables fines, les murs et les
            clôtures sont des traits noirs comme les chemins (le réglage « Lignes noires fines » dit ce qu'ils sont).</p>`)}
        ${slide("Coach · essai", "1 bis. Mieux : la carte OCAD ou Mapper", html`
          <p>Le fichier de la carte elle-même — OCAD (.ocd) ou OpenOrienteering Mapper (.omap, .xmap) — dit le terrain sans deviner : Ozimut le lit
            dans votre navigateur avec le moteur du tracé de circuits et dessine chaque symbole à sa place exacte.</p>
          ${list([
            html`Les <b>surfaces</b> d'après leur couleur de remplissage (ou de hachure : bleue pour un marais, olive ou violette pour une zone
              interdite), couche par couche comme sur la carte — un vert posé sur un jaune l'emporte. La couleur plutôt que le numéro, sauf quand le numéro en dit plus : végétation, marche, bonne visibilité (409), marais
              infranchissable (307 ; 309 en ISOM 2000), végétation infranchissable (411 en ISSprOM).`,
            html`Les <b>lignes</b> d'après leur numéro, dans la norme de la carte, reconnue à ses symboles (ISOM 2017 et ISSprOM, ISOM 2000 et ISSOM 2007) :
              routes et pistes (501 à 504), chemins (505), petits sentiers et layons (506 à 508) sont les trois types de chemin, continus même quand la
              carte les dessine en tirets ; les falaises, murs et clôtures infranchissables (201, 515, 518 ; 201, 521 et 524 en ISOM 2000) arrêtent
              la course, sauf à un point de passage (519 ; 525 en ISOM 2000) ; murs et clôtures franchissables et limites de végétation sont des
              lignes directrices ; les lignes bleues des ruisseaux.`,
            html`Les <b>lignes à franchir</b> : talus, levées de terre et ravines (104 à 108), falaises franchissables (202), murs et clôtures
              franchissables (513, 514, 516, 517 — en ISOM 2000 : 106 à 110, 203, 519, 520, 522, 523) coûtent chacune un temps de franchissement,
              10 s par défaut pour un coureur à 6:00 min/km (proportionnel à l'allure), calibré sur les temps des coureurs quand leurs
              itinéraires en franchissent au moins 5 sur 3 postes ; là où un chemin les traverse, rien. Les itinéraires les contournent donc quand
              le détour coûte moins.`,
            html`Le <b>sol lent</b> : les surfaces de zone de blocs dense (209), de sol pierreux (210 course lente, 211 marche, 212 progression
              difficile) et de sol sableux (213) ralentissent la course par-dessus la végétation (70, 40 et 15 % de la forêt blanche par
              défaut) ; une zone de blocs (208) ne ralentit pas, comme le dit l'ISOM. Un sol pierreux dessiné en points isolés, bien moins dense
              que la norme, ne compte pas. Les analyses de carte publiées avant le 10 novembre 2026 n'ont ces lignes et ce sol qu'une fois
              publiées à nouveau.`,
            html`Courbes, symboles ponctuels, textes et parcours sont laissés de côté.`,
          ])}
          <p>Dans l'Analyse solo, un fichier OCAD ou Mapper déposé seul <b>est</b> la carte : dessinée ici, la trace calée par son
            géoréférencement. Déposé avec une image de la carte — ou choisi dans la boîte « Itinéraires calculés », dans les deux analyses —, il
            sert aux itinéraires, placé sur l'image par son géoréférencement : il doit en avoir un, et recouvrir la carte affichée.</p>
          <p>Une analyse publiée depuis le tracé de circuits, ou dont les circuits viennent d'un projet OCAD (l'onglet « Analyse » d'un événement, dans Orga),
            garde ce que la carte OCAD de l'organisateur dit du terrain : ses itinéraires lisent ses symboles sans fichier à déposer, et les
            zones interdites et les limites à ne pas franchir que le traceur a dessinées sur le circuit en font partie. Seul ce dessin du terrain est
            envoyé avec le circuit, jamais le fichier OCAD.</p>`)}
        ${slide("Coach · essai", "2. Le temps d'un pas", html`
          <p>Le temps pour aller d'une case à sa voisine est la distance, multipliée par la lenteur du terrain et par celle de la pente :</p>
          ${list([
            html`<b>Le terrain</b> : sa vitesse en part de celle de la forêt blanche — route ou piste 130 %, chemin 125 %, petit sentier 110 %, terrain découvert 110 %, semi-découvert
              100 %, les trois verts 75, 45 et 20 %, marais 65 %, zone revêtue 120 %. L'eau, les bâtiments, la zone interdite (et le gris
              en sprint) sont infranchissables. Tout se règle sous « Vitesses par terrain ».`,
            html`<b>La pente</b>, lue sur les courbes de niveau de la carte — relevées sur le terrain par le cartographe —, chacune mise à son altitude d'après le relief de l'IGN (RGE ALTI, en France) ou des « Terrain Tiles » ailleurs, qui comble aussi l'espace entre elles (« Relief : modèle seul » s'en passe ; une courbe mal lue fait une marche) : en montée, chaque mètre gravi
              coûte autant que 8 m à plat (le réglage « 1 m de montée vaut ») ; en descente douce on va un peu plus vite (jusqu'à 9 % de mieux à
              15 % de pente), plus raide on freine (à 30 %, 29 % plus lent qu'à plat).`,
            html`Les pas vont dans 16 directions (les huit voisines et les sauts de cavalier), ce qui suit une ligne droite à 3 % près.`,
          ])}
          <p>Ce temps est celui d'une allure de référence en forêt blanche à plat : 6:00 min/km par défaut, ou celle qu'on tape, ou — sans rien taper —
            celle du coureur : dans l'Analyse solo, la médiane, sur ses inter-postes, de son temps réel divisé par le temps du modèle sur son propre
            itinéraire ; dans « Comparer avec les autres coureurs », la médiane des coureurs sur l'inter-poste.</p>`)}
        ${slide("Coach · essai", "3. La prudence de navigation", html`
          <p>Le plus court n'est pas toujours le plus sûr : loin de tout repère, au milieu de la forêt, on lit la carte plus souvent, on ralentit, on se
            trompe. Ozimut appelle <b>lignes directrices</b> les chemins, les ruisseaux, les lisières entre terrains différents et les bords de ce qui
            arrête (eau, bâtiments). La prudence ajoute au coût d'un pas une part de son temps qui croît avec la distance à la ligne directrice la plus
            proche, pleine à 50 m :</p>
          <p class="mx-eq">coût = temps × (1 + prudence × visibilité × min(1, distance / 50 m))</p>
          <p>La visibilité pèse 1 en forêt blanche, 1,2 à 1,4 dans les verts, 0,3 en terrain découvert, 0 sur un chemin. À 20 % (le réglage par
            défaut), traverser une forêt sans repère coûte jusqu'à un cinquième de plus ; à 0 %, on court droit comme un coureur qui ne se trompe
            jamais. La prudence choisit l'itinéraire ; les temps affichés restent ceux de la course seule, sans elle.</p>`)}
        ${slide("Coach · essai", "4. Les variantes et la carte des décisions", html`
          <p>Ozimut fait pousser deux arbres de plus courts chemins dans une ellipse autour de l'inter-poste (assez large pour contourner un lac ou aller
            chercher une piste à côté) : l'un depuis le départ, l'autre depuis le poste. Leur somme en un point est le coût du meilleur itinéraire qui
            passe par ce point ; la plus basse donne A, le plus rapide, exact sur la grille. Les choix se lisent sur cette somme :</p>
          ${list([
            html`les <b>plateaux</b> : les tronçons où les deux arbres s'accordent — un chemin suivi longtemps en est un ;`,
            html`les <b>vallées</b> : le long de lignes en travers de l'inter-poste, à chaque dixième, chaque creux de la somme séparé des autres par une
              crête (1,5 % du temps de A au moins) est un passage à lui — où les bons itinéraires coupent-ils l'inter-poste ?`,
          ])}
          <p>Une proposition est gardée si elle ne coûte pas plus que A de plus que l'écart choisi (25 % par défaut), s'écarte des itinéraires gardés sur
            un cinquième de son tracé au moins, et soit coupe l'inter-poste dans une vallée qu'aucun d'eux ne prend (et aucun tronçon de 30 % de sa
            longueur ne peut être raccourci de plus de 1 %), soit s'en écarte sur 30 % et reste <b>localement optimale</b> sur la moitié de sa
            longueur. Un arc à travers une forêt uniforme n'est pas un choix ; le tout droit à côté d'une piste, un détour par un chemin ou autour
            d'un vert le sont. Chaque itinéraire est enfin tendu en lignes droites, hors des 16 directions de la grille, et mesuré comme la trace d'un
            coureur.</p>
          <p>La <b>carte des décisions</b> colore chaque point par le temps perdu en y passant : vert foncé sur un meilleur itinéraire, puis vert clair,
            jaune et orange jusqu'à l'écart des variantes ; au-delà, rien. Elle montre d'un coup d'œil les couloirs des bons choix et ce que coûte
            de s'en écarter.</p>
          <p>Chaque variante dit si elle passe à gauche, à droite ou tout droit par rapport à la ligne entre les postes.</p>`)}
        ${slide("Coach · essai", "5. Votre itinéraire", html`
          <p>Une trace GPS court quelques mètres à côté du chemin qu'elle suit (l'erreur du GPS et celle du calage) : mesurée telle quelle, elle passerait
            en forêt et coûterait plus que le chemin. Ozimut la recale donc sur la carte : le chemin le plus rapide du modèle qui reste à sa marge
            d'erreur près (12 à 25 m, d'après le calage), sur le chemin quand la trace le longe. Puis il mesure la part de cet itinéraire qui suit
            chaque itinéraire calculé. S'il en suit un sur 80 % de sa longueur au moins, c'est l'<b>itinéraire pris</b> et son temps compte ; sinon,
            la liste montre la part de chacun (« A 60 % · B 35 % ») et c'est le temps de la trace recalée qui compte.</p>
          ${list([
            html`<b>Choix</b> : le temps de l'itinéraire pris, moins celui de l'itinéraire A — nul quand vous avez pris A ;`,
            html`<b>Exécution</b> : votre temps réel moins le temps de l'itinéraire pris — ce que la course elle-même a coûté (hésitations,
              erreurs, terrain plus lent que la carte ne le dit).`,
          ])}
          <p>Avec l'allure automatique, l'exécution est nulle en médiane : elle dit quels inter-postes ont été plus lents ou plus rapides que d'habitude.</p>`)}
        ${slide("Coach · essai", "6. La calibration sur les postes courus", html`
          <p>Les vitesses par défaut sont celles d'un coureur moyen. Les postes dont on connaît l'itinéraire disent ce qu'elles valent pour ce
            coureur-là : on sait combien de mètres il a couru sur un chemin, hors chemin, en montée, et en combien de temps. Ozimut en tire trois
            nombres (case « Calibrer les vitesses sur les postes courus », cochée par défaut) :</p>
          ${list([
            html`son <b>allure</b> en forêt blanche à plat ;`,
            html`sa <b>vitesse sur les chemins</b> comparée à la forêt — seulement si deux postes au moins se courent surtout sur chemin et deux
              surtout hors chemin ;`,
            html`le <b>coût de la montée</b> — seulement si la montée pèse 4 % du temps sur six postes au moins.`,
          ])}
          <p>Avec peu de postes, ces valeurs bougent peu : elles ne s'écartent des valeurs par défaut que si les postes le disent nettement. Les
            postes à plus de 25 % du modèle (une erreur, un arrêt, une carte mal lue) sont mis de côté avant un second calcul : la calibration ne doit
            pas absorber les erreurs que l'exécution veut montrer. Les itinéraires sont ensuite recalculés avec ces vitesses : A est le meilleur
            itinéraire <i>pour ce coureur</i>, le choix se mesure contre lui, l'exécution contre ses vitesses habituelles. Dans « Comparer avec les autres coureurs », la
            vitesse sur les chemins et la montée se calibrent sur tout le groupe (tous les postes de tous les coureurs), et chacun garde son allure.</p>`)}`,
    });
  }

  // ======================================================================================================
  // Orga (« Le tracé », its other tab, is content/methods.*.js' tracerDoc)
  // ======================================================================================================
  const ORGA = [["qui", "Mes événements"], ["evenement", "Créer un événement"], ["trace", "Tracé"], ["horaires", "Départs"], ["direct", "Direct"],
    ["resultats", "Résultats"], ["analyses", "Analyse"],
    // Chrono, the race timing: its tab is the administrators' only for now (pages/manage.js), and so are its chapters
    ...(admin ? [["chrono", "Chrono"], ["chrono-app", "L'application Chrono"]] : []), ["equipe", "L'équipe"]];
  function orga() {
    return chapters(ORGA, {
      qui: () => html`
        ${slide("Orga", "Vos événements", html`
          <p>Orga sert aux clubs qui organisent ; il s'affiche dès que vous rejoignez l'équipe d'un événement ou en créez un, ou si vous le cochez, et s'utilise sur ordinateur.
            C'est une seule page, ${P("#/orga", "Mes événements")} : vos événements passés, du jour et à venir — une course ou un entraînement
            chacun —, chacun avec les outils de l'organisateur, en onglets selon son type :</p>
          ${list([
            html`<b>Compétition individuelle</b> et <b>Score</b> : Tracé, Départs, Direct, Résultats, Analyse, Équipe.`,
            html`<b>Relais</b> : Tracé, Direct, Analyse, Équipe (les résultats et la liste de départ d'un relais ne se déposent pas encore).`,
            html`<b>Entraînement</b> : Tracé, Analyse, Équipe.`,
          ])}
          <p>Un événement s'ouvre sur l'onglet de son moment : Départs avant la course, Direct le jour même, Résultats ensuite ; un entraînement sur
            son tracé avant sa date, sur son analyse ensuite.</p>
          <p>La carte elle-même se dessine dans ${M("carto", "Carto")}, un module à part, ouvert à tout compte : une carte sert à bien des
            événements, et on y travaille aussi sur le terrain, avec le téléphone.</p>
          <p>Seule l'équipe d'un événement — et les administrateurs d'Ozimut — agit en organisateur de la compétition qu'il porte : liste de départ,
            réservation des horaires, direct, lien du suivi GPS, résultats, circuits envoyés depuis le tracé, analyse de carte. Une compétition
            qu'aucun événement ne porte n'a pas d'organisateur sur Ozimut : pour en être un, créez son événement, ou demandez à rejoindre l'équipe
            de celui qui la porte.</p>`)}`,
      evenement: () => html`
        ${slide("Orga", "Créer un événement", html`
          <p>« Créer un événement », en haut de la page, se fait en trois étapes :</p>
          <div class="mx-steps">
            <div class="mx-step"><b>Le type, le pays et la date</b>Compétition individuelle, Score (les postes dans l'ordre que l'on veut, classés aux
              points), Relais ou Entraînement ; un pays que vous avez rejoint ; une date dans les 60 derniers jours ou les 400 prochains.</div>
            <div class="mx-step"><b>Au calendrier de la fédération ?</b>En France, une compétition se rattache à celle du calendrier de la
              fédération : la page propose les compétitions du jour choisi, celles de votre club en premier, ou « Elle n'est pas au calendrier ».</div>
            <div class="mx-step"><b>L'événement</b>Son nom, son lieu, son club, sa spécialité, son format et son site web, repris du calendrier quand
              la compétition y est.</div>
          </div>
          ${list([
            html`<b>Le rattachement</b> : si vous êtes membre du club organisateur de la compétition — le club de votre dernière course connue —, il
              est fait tout de suite. Sinon, un administrateur d'Ozimut le confirme ; en attendant, l'équipe peut se former, mais les outils de la
              compétition restent fermés.`,
            html`<b>Une compétition, un événement</b> : une compétition du calendrier n'est portée que par un seul événement. Si une équipe la gère
              déjà, la page le dit et propose de demander à la rejoindre. Dès qu'un événement la porte, les coureurs ne peuvent plus y déposer de
              fichier de résultats : ses résultats sont ceux de son équipe.`,
            html`<b>Hors calendrier</b> : une compétition qui n'y est pas, ou pas encore, se crée sans rattachement ; elle paraît alors dans Arena avec
              les compétitions de son pays (un relais, pas encore), sans que soit publié qui l'a créée. Elle peut être rattachée plus tard, tant que
              rien n'a été publié sous son propre nom.`,
            html`« ✎ Modifier », en tête de l'événement, change sa description, le rattache au calendrier ou l'en détache, ou le supprime.`,
          ])}`)}`,
      equipe: () => html`
        ${slide("Orga", "L'équipe", html`
          <p>Chaque événement a son équipe, et tous ses membres ont les mêmes droits : ils gèrent tout l'événement, acceptent ou retirent des membres,
            le rattachent au calendrier ou l'en détachent, et peuvent le supprimer. Qui crée l'événement en est le premier membre. Le tracé des circuits a son équipe à lui (voir « Tracé »).</p>
          ${list([
            html`<b>Personne n'est ajouté d'office</b>, ni par son nom, ni par sa licence, ni par son adresse e-mail : une personne demande à entrer,
              dans « Rejoindre une équipe » (en haut de la page) ou en ouvrant l'adresse de l'événement, que l'onglet « Équipe » donne à
              transmettre. Elle peut y joindre un mot pour l'équipe.`,
            html`<b>Un membre répond</b> : n'importe lequel accepte ou refuse la demande, dans l'onglet « Équipe ». Les membres sont prévenus d'une
              demande par notification, et la personne de la réponse.`,
            html`<b>Ce que chacun voit</b> : les membres voient les noms et les clubs les uns des autres et de ceux qui demandent à entrer ; hors de
              l'équipe, on ne voit que le prénom et l'initiale du nom de deux membres au plus.`,
            html`<b>Quitter</b> : un membre quitte l'équipe quand il veut ; le dernier membre supprime l'événement plutôt. Pour une compétition du
              calendrier, ce qui a été publié reste en place ; une compétition créée sur Ozimut disparaît d'Arena avec ce qu'elle y a publié.`,
          ])}`)}`,
      trace: () => html`
        ${slide("Orga", "Tracé : les circuits de l'événement", html`
          <p>L'onglet « Tracé » relie l'événement à son tracé des circuits. Tout ce qui se fait dans le tracé est expliqué dans l'onglet
            ${D("tracer", "Le tracé")} de cette documentation.</p>
          ${list([
            html`<b>Commencer le tracé</b> ouvre la page « Tracer » sur un nouveau tracé préparé pour l'événement — sa compétition, ou le nom et la
              date de l'entraînement — et rattaché à lui : il ne reste qu'à donner la carte. <b>Ouvrir le tracé</b> le reprend ensuite.`,
            html`<b>Son équipe à lui</b> : le tracé garde son équipe et ses rôles — traceurs, contrôleur, lecteurs, invités par un lien — et,
              si l'on veut, son chiffrement. Les circuits restent ainsi confidentiels jusqu'à la course.`,
            html`<b>Les autres membres de l'événement</b> voient seulement qu'un tracé existe, qui l'a commencé et combien de personnes sont dans
              son équipe de traçage ; pour y travailler, ils demandent à y être invités.`,
            html`Après la course, le tracé publie ses circuits, carte comprise, vers l'analyse de l'événement (onglet « Analyse »).`,
          ])}`)}`,
      horaires: () => html`
        ${slide("Orga", "Départs : les horaires", html`
          <p>L'onglet « Départs » d'une compétition à venir publie sa liste de départ, jusqu'au jour de la course. Fichiers lus : IOF XML
            « StartList » (le mieux), CSV, tableau à une colonne de circuit par paire, HTML, PDF d'OE ou de MeOS, ou un lien Google Sheets partagé.</p>
          ${list([
            html`Le fichier est d'abord lu et vérifié dans votre navigateur : deux coureurs d'un même club qui se suivent, une minute de départ partagée,
              des coureurs sans heure, sans puce ou sans circuit, les intervalles et les places libres.`,
            html`« Vérifier et exporter » écrit aussi le fichier du départ pour l'application O Checklist.`,
            html`« Ouvrir la réservation » remplace le tableau partagé où les coureurs s'inscrivent à un horaire : vous réglez les circuits (premier et
              dernier départ, intervalle), l'écart entre deux coureurs d'un même club, la clôture ; chaque coureur réserve sur Ozimut avec son compte,
              pour lui et pour d'autres (sa famille, des licenciés ou non, de n'importe quel club ou sans club) ; un tableau Google Sheets déjà rempli
              s'importe avec tous ses onglets. À la clôture, les réservations deviennent la liste de départ publiée, et vous téléchargez le CSV ou
              l'IOF XML pour MeOS ou OE.`,
            html`Une fois publiée, la liste paraît dans Arena (la liste de départ de la compétition), et chaque coureur qui l'a demandé reçoit son heure de
              départ par notification ou par e-mail.`,
          ])}`)}`,
      direct: () => html`
        ${slide("Orga", "Diffuser en direct", html`
          <p>L'onglet « Direct » fait paraître vos résultats en direct dans Arena sans passer par liveresultat. Une diffusion s'y ouvre, rattachée
            d'office à la compétition de l'événement. Puis, au choix :</p>
          <div class="mx-grid">
            <div class="mx-box" style="--c:var(--s1)"><h3>Depuis MeOS</h3><p>Le service « Résultats en ligne » de MeOS envoie lui-même ses résultats à
              l'adresse, au numéro et au mot de passe que la page donne ; les temps intermédiaires des postes radio suivent.</p></div>
            <div class="mx-box" style="--c:var(--s3)"><h3>Depuis un fichier</h3><p>Votre logiciel exporte la liste des résultats toutes les quelques secondes
              (IOF XML, HTML d'OE ou de MeOS) ; la page, ouverte sur l'ordinateur de l'arène dans Chrome ou Edge, relit ce fichier et envoie ce qui change.</p></div>
          </div>
          <p>La diffusion est gardée après la course : ses résultats, ses temps intermédiaires et sa liste de départ restent dans Arena. C'est encore une
            version d'essai : à tester d'abord à un entraînement, ou à côté du direct habituel.</p>
          <p><b>Le suivi GPS</b> : Ozimut ne suit aucun coureur par GPS. Si votre compétition utilise un service de suivi (Loggator, GPSSeuranta, TracTrac,
            Livelox, Routechoices…), donnez son lien dans ce même onglet : il paraît sur la compétition dans Arena, avec ses résultats et son direct. Seul le
            lien est publié.</p>`)}`,
      resultats: () => html`
        ${slide("Orga", "Déposer les résultats", html`
          <p>L'onglet « Résultats » s'ouvre le jour de la course ; « Déposer les résultats » y ajoute votre fichier, en trois étapes :</p>
          <div class="mx-steps">
            <div class="mx-step"><b>Le fichier</b>Un export IOF XML de votre logiciel (le meilleur : il porte les circuits et les temps intermédiaires),
              ou le HTML d'OE ou de MeOS, ou un PDF ; zippé ou non, 30 Mo au plus.</div>
            <div class="mx-step"><b>La vérification</b>Le fichier est lu dans votre navigateur, rien n'est envoyé : résumé, résultats circuit par circuit,
              contrôle des temps (boîtiers mal réglés, cartes non effacées), et toutes les vues de l'analyse.</div>
            <div class="mx-step"><b>La publication</b>« Publier » l'envoie : la course paraît dans Arena en quelques minutes, marquée comme déposée par
              l'organisateur, et n'est plus cherchée ailleurs. Un nouveau dépôt remplace le précédent.</div>
          </div>`)}`,
      analyses: () => html`
        ${slide("Orga", "Préparer l'analyse", html`
          <p>L'onglet « Analyse » ouvre de lui-même l'analyse de carte de l'événement, puis sert à la gérer. Elle se prépare circuit
            par circuit :</p>
          ${list([
            html`<b>La carte</b> : une image, un PDF ou un KMZ, gardée telle quelle, sans perte de qualité.`,
            html`<b>Son calage</b> : d'un KMZ, d'un fichier de géoréférencement, d'un IOF XML avec coordonnées, ou de votre propre trace.`,
            html`<b>Le parcours</b> : lu sur la carte, l'ordre des postes venant de l'IOF XML des circuits, de votre trace, ou de vos clics.`,
            html`<b>L'accès</b> : tous les comptes, les membres du club — et, si vous le voulez, vos invités d'autres clubs ou sans club, avec un code ; les autres comptes voient l'analyse dans la liste, avec l'invitation à vous demander ce code —, ou un mot de passe. « Voir comme les coureurs » montre la page telle qu'ils la
              verront.`,
          ])}
          <p>La page de l'analyse sert à la gérer, pas à analyser : la liste des circuits, la carte de celui qu'on choisit avec son parcours pour le
            vérifier, la publication (une nouvelle analyse reste un brouillon que seuls les organisateurs voient ; « Enregistrer sans publier » la garde ainsi,
            « Enregistrer et publier » l'ouvre aux coureurs, « Enregistrer et publier plus tard » l'ouvre d'elle-même au jour et à l'heure choisis ;
            les circuits d'un fichier OCAD déposé sont ajoutés par ces mêmes boutons), ce que les
            coureurs peuvent faire (ajouter leur trace, « Analyse solo » sur votre carte, « Mes cartes », commentaires, variantes, vue 3D,
            vidéo, itinéraires calculés), et la fréquentation : les comptes qui l'ont ouverte, les traces par circuit, ceux qui l'ont rejouée seuls
            sans partager de trace — des nombres seulement, jamais qui.</p>
          <p>Les coureurs la trouvent dans Coach (« Analyse › Comparer avec les autres coureurs »). Le tracé peut aussi publier ses circuits, carte comprise, vers une analyse (après
            la course pour une compétition).</p>`)}`,
      chrono: () => html`
        ${slide("Chrono", "Chronométrer une course avec Ozimut", html`
          <p>Chrono est l'outil de chronométrage d'Ozimut, ce que les clubs appellent la « GEC » : les inscrits, le tirage des heures de départ, la
            lecture des puces à l'arrivée, les tickets, les résultats, l'arbitrage. Il se trouve dans ${P("#/orga", "Mes événements")} : ouvrez un
            événement, puis son onglet « Chrono », juste avant « Équipe ». Les onglets « Direct » et « Résultats » restent là pour ceux qui
            chronomètrent avec un autre logiciel. Chrono existe aussi en application à installer, pour travailler sans Internet et relier plusieurs
            ordinateurs : voir ${CHAP("chrono-app", "L'application Chrono")}.</p>
          <div class="mx-callout"><b>En test, pour les administrateurs seulement.</b> L'onglet « Chrono » ne s'affiche pour l'instant qu'aux
            administrateurs d'Ozimut. Chrono n'a encore jamais été essayé avec de vraies stations SPORTident ou Emit, ni avec une imprimante à
            tickets, ni avec un vrai MeOS, et aucun de ses fichiers n'a encore été envoyé à une fédération. Essayez-le sur un entraînement, ou à
            côté de votre logiciel habituel ; ne lui confiez pas encore seul une compétition.</div>
          <p><b>L'idée, en trois phrases.</b> Chaque poste — un ordinateur ou un téléphone où Chrono est ouvert — écrit ce qu'il fait (une
            inscription, une puce lue, une correction) comme une opération dans un même journal, celui de la course. Les postes se tiennent à
            jour entre eux : par la copie sur Ozimut quand il y a Internet, par l'application Ozimut Chrono sur un réseau local — chaque ordinateur qui l'a se relie de lui-même aux autres —, par un fichier que l'on transporte sinon. Sans liaison, chaque poste garde tout chez lui et continue : rien n'est perdu, et tout se rejoint
            au retour de la liaison, dans n'importe quel ordre.</p>
          <p><b>L'écran.</b> En haut, le nom de l'événement, l'état du matériel et des liaisons (lecteurs, imprimante, copie sur Ozimut,
            ordinateurs reliés) et l'heure. À gauche, les neuf postes : Préparer, Accueil, Départ, Arrivée, Suivi, Speaker, Arbitre, Postes, Clôturer
            (<kbd>Alt</kbd>+<kbd>1</kbd> à <kbd>Alt</kbd>+<kbd>9</kbd>). Sous la barre, les boutons du poste ouvert. En bas, les compteurs : inscrits,
            en course, puces lues, classés, points à traiter. Une puce lue sur n'importe quel poste est gardée, jugée, annoncée par un bip (aigu :
            tout va bien ; grave : quelque chose manque) et, si vous l'avez demandé, imprimée.</p>`)}
        ${slide("Chrono", "Préparer : l'assistant en neuf étapes", html`
          <p>Le poste « Préparer » mène l'événement de rien à prêt. Ses étapes se font dans l'ordre que l'on veut ; une étape où quelque chose
            empêche de commencer est marquée.</p>
          <div class="mx-steps">
            <div class="mx-step"><b>Événement</b>Nom, date, lieu, club ; « Type de course » (Individuelle, Course au score, Relais) ; « Règles » (le
              pays) ; « Système de chronométrage » (SPORTident ou Emit) ; « Départs » : à l'heure de la liste de départ, au boîtier départ (départ
              libre) ou en masse ; « Premier départ » ; « Fermeture des circuits », après laquelle un coureur est hors délais. Dans l'onglet, le nom,
              la date, le lieu et le club viennent de l'événement d'Orga.</div>
            <div class="mx-step"><b>Circuits</b>Importez le fichier du traceur (IOF XML), ou « Nouveau circuit » : son nom, sa longueur, son
              dénivelé et ses postes dans l'ordre, les numéros des boîtiers séparés par des espaces (31 32 45 100).</div>
            <div class="mx-step"><b>Catégories</b>« Nouvelle catégorie », « Une par circuit » ou « Catégories d'âge » (celles des règles choisies ; il
              reste à leur donner un circuit). Chacune a son circuit, et si l'on veut son premier départ, son intervalle, un temps maximal, un tarif ;
              « Catégorie non classée » pour une découverte.</div>
            <div class="mx-step"><b>Inscrits</b>« Importer » un fichier, ou « Nouveau coureur » un par un. Le « Fichier fédéral » aide à inscrire
              vite et à retrouver les numéros de puce (voir plus bas).</div>
            <div class="mx-step"><b>Équipes</b>Seulement quand une catégorie se court en équipe : relais, binômes, patrouilles (voir « Les formats
              de course »).</div>
            <div class="mx-step"><b>Départs</b>« Tirage » des heures, contrôle de la liste, impression des listes de départ, export IOF XML. Sans
              objet pour un départ au boîtier ou en masse.</div>
            <div class="mx-step"><b>Matériel</b>Les lecteurs de puces, l'imprimante des tickets, et la « Répétition ».</div>
            <div class="mx-step"><b>Liaisons</b>Le nom de l'opérateur, la copie sur Ozimut, le direct, les autres ordinateurs de l'arène et le
              code de l'événement, le fichier de l'événement.</div>
            <div class="mx-step"><b>Vérifier</b>Ce qui empêche de commencer, ce qui est seulement conseillé, avec « Y aller » vers l'étape en
              cause ; puis « Ouvrir le poste Arrivée ».</div>
          </div>
          ${list([
            html`<b>Importer</b> prend n'importe quel fichier et dit ce qu'il contient avant de l'ajouter : IOF XML 3.0 (inscrits, liste de départ,
              circuits, catégories, résultats), tableau CSV — le fichier de la fédération ou d'OE, reconnu à ses en-têtes en français, en anglais
              ou en allemand —, fichier de MeOS, fichier Ozimut Chrono (.ozchrono). Ce qui existe déjà est complété, jamais doublé : un coureur est
              reconnu à sa licence, sinon à son nom et son club.`,
            html`<b>Le fichier fédéral</b> (étape « Inscrits », « Charger le fichier ») est le fichier des licenciés de la fédération, gardé sur cet
              ordinateur : dans la fiche d'un coureur, tapez un nom ou un numéro de licence et le reste se remplit. « Compléter les puces » donne
              aux inscrits sans puce le numéro que ce fichier leur connaît.`,
            html`<b>Le tirage</b> se fait par circuit (tous les coureurs d'un circuit mêlés) ou par catégorie, avec l'intervalle, l'« Écart entre
              coureurs d'un club », des « Places libres » pour les inscriptions tardives, et « Garder les heures déjà données ». L'étape signale
              les coureurs sans heure, les heures données deux fois sur un circuit et les coureurs d'un même club qui se suivent.`,
            html`<b>La répétition</b> (« Matériel », « Lancer une répétition ») fait essayer tous les postes sans rien salir : elle travaille sur
              une copie de la course, avec « Lire une puce fictive », « Dix puces » et « Une puce inconnue » — certaines avec un poste manquant
              ou sans arrivée, pour s'exercer à les traiter. Rien n'est enregistré ni envoyé. Sans inscrits, elle crée une petite course
              inventée. « Quitter la répétition » revient à la vraie course.`,
          ])}`, "chrono-preparer")}
        ${slide("Chrono", "Le jour de la course, poste par poste", html`
          ${list([
            html`<b>Accueil</b> : trouver un coureur par son nom, son club, sa licence, son dossard ou son numéro de puce. Une puce vierge posée
              sur le lecteur ouvre la fiche de son porteur, ou une nouvelle inscription avec ce numéro. La fiche tient l'inscription tardive
              (« Nouveau coureur »), le type d'inscription, le « Tarif » et « Payé », la « Puce louée ». À côté : les inscrits sans puce,
              « À encaisser », les « Puces louées dehors », les inscrits sans catégorie. Le ruban imprime la liste « Par club » et ouvre les
              « Factures par club ».`,
            html`<b>Départ</b> : l'heure, le prochain départ, et les coureurs minute par minute ; pour chacun, « Présent » (✓) ou absent (✕).
              « Marquer les absents » marque ceux qui n'ont pas été pointés et dont l'heure est passée depuis cinq minutes — seulement si
              quelqu'un a été pointé. Le ruban imprime la liste « Minute par minute ».`,
            html`<b>Arrivée</b> : là où se lisent les puces. La dernière puce s'affiche en grand — le coureur, son statut, son temps, sa place,
              son écart, les postes manquants — avec « Ticket », « Corriger la puce », « Fiche du coureur » et « Ce n'est pas lui ». Dessous,
              la liste « À traiter » et les « Dernières puces lues ». « Ticket automatique » imprime le ticket dès la lecture.`,
            html`<b>Suivi</b> : les résultats en cours « Par catégorie » ou « Par circuit », et « En forêt », les coureurs partis et pas encore
              revenus, du plus ancien départ au plus récent. Un clic sur un coureur montre ses postes, avec temps et places. Le ruban imprime
              les résultats, avec ou sans les temps intermédiaires, et « Écran » les ouvre en grands caractères pour un affichage.`,
            html`<b>Speaker</b> : les « Derniers arrivés », ceux qui sont « En tête », les « Passages radio » ; « Plein écran ».`,
            html`<b>Arbitre</b> : le « Journal des modifications » — tout ce qui a été changé à la main depuis la lecture des puces, par qui, à
              quelle heure, sur quel poste —, les « Réclamations et décisions », « Disqualifier » avec son motif, « Exporter le journal ».`,
            html`<b>Postes</b> : chaque boîtier d'après les puces lues — combien l'ont poinçonné, combien auraient dû et ne l'ont pas, son état
              (« jamais poinçonné : en panne ? », « heure incohérente », « souvent manquant »). « Ajouter un poste », et pour chacun ses points
              (course au score), les « Autres numéros acceptés » (un boîtier de remplacement) et « Poste radio ». « Passage à la main » note le
              passage d'un coureur qu'un contrôleur annonce au téléphone.`,
            html`<b>Clôturer</b> : après la course (voir plus bas).`,
          ])}`, "chrono-postes")}
        ${slide("Chrono", "À l'arrivée : la liste « À traiter »", html`
          <p>Chrono ne décide jamais à votre place : ce qui demande quelqu'un attend dans la liste « À traiter » du poste Arrivée (un compteur
            rouge le signale sur le poste), chaque ligne avec son bouton.</p>
          <div class="table-wrap"><table class="data compact"><thead><tr><th>La ligne dit</th><th>Ce que cela veut dire</th><th>Que faire</th></tr></thead><tbody>
            <tr><td>Puce n : personne ne la porte</td><td>Une puce lue qu'aucun inscrit n'a déclarée.</td><td>« Attribuer » : chercher le coureur
              (Chrono dit à quel circuit la puce correspond), « Nouveau coureur », ou « Mettre de côté ».</td></tr>
            <tr><td>Puce n : plusieurs coureurs la portent</td><td>Le même numéro est donné à plusieurs inscrits.</td><td>« Attribuer » au bon coureur.</td></tr>
            <tr><td>Pas de poinçon d'arrivée, ou de départ</td><td>Le coureur n'a pas poinçonné le boîtier, ou le boîtier n'a pas répondu.</td>
              <td>« Voir la puce » : donner l'heure à la main.</td></tr>
            <tr><td>Poste manquant (numéros)</td><td>Un poste du circuit n'est pas sur la puce : le coureur est PM.</td><td>« Voir la puce » pour
              ajouter le poinçon si le contrôle du poste le confirme ; « Vu » pour noter que c'est vérifié.</td></tr>
            <tr><td>Encore en course après la fermeture</td><td>Parti, jamais lu.</td><td>« Saisir l'arrivée » : une arrivée ou un statut à la main.</td></tr>
            <tr><td>n lectures de puce, la dernière compte</td><td>La puce a été lue plusieurs fois.</td><td>« Ouvrir la fiche » si ce n'est pas voulu.</td></tr>
            <tr><td>Poste : heure incohérente pour n coureurs</td><td>Le boîtier est peut-être mal réglé.</td><td>Voir le poste « Postes ».</td></tr>
            <tr><td>Puce louée à récupérer, somme à encaisser</td><td>Un rappel au passage du coureur.</td><td>« Rendue », « Payé ».</td></tr>
          </tbody></table></div>
          ${list([
            html`<b>Corriger une puce</b> (« Contenu de la puce ») : retirer ou ajouter un poinçon, changer le départ ou l'arrivée, changer le
              coureur. Le contenu de la puce elle-même n'est jamais modifié : la correction le remplace, elle est notée au journal de l'arbitre,
              et « Revenir à la puce » l'annule.`,
            html`<b>Saisir une arrivée</b> (ruban, « À la main ») : pour un coureur dont la puce est perdue ou illisible, son heure d'arrivée ou
              son temps de course, et son statut. Elle aussi est notée au journal.`,
            html`<b>La fiche du coureur</b>, partie « Arbitrage » : un statut choisi à la main l'emporte sur ce que dit la puce, et une
              « Correction du temps » ajoute ou retire des secondes.`,
          ])}`, "chrono-traiter")}
        ${slide("Chrono", "Les formats de course", html`
          ${list([
            html`<b>Individuelle</b> : le cas simple, une catégorie, un circuit. Une catégorie peut avoir des « Variantes » (leurs noms séparés
              par « / ») : la variante courue est reconnue à la lecture de la puce.`,
            html`<b>Course au score</b> : le type « Course au score », un circuit coché « Circuit au score » (les postes se prennent dans
              n'importe quel ordre), le « Temps limite » et la « Pénalité par minute entamée » dans « Événement », les points de chaque poste
              dans « Postes » (vide : un point).`,
            html`<b>Relais</b> : le type « Relais » ; dans chaque catégorie, les « Circuits des relayeurs » — un relayeur par « ; », ses
              variantes séparées par « / » (A1/A2; B; C1/C2). L'étape « Équipes » crée les équipes (« Nouvelle équipe » : son nom, son club,
              sa catégorie, son dossard, le coureur de chaque relais ; tapez un nom, les inscrits sans équipe sont proposés) ou les importe ;
              « Numéroter » donne les dossards, catégorie après catégorie (« Premier dossard », « Bloc par catégorie » : 100 pour 1, 101, 201…).
              <b>« Départ en masse des attardés »</b> (étape « Équipes » et poste Départ) : à l'heure choisie, à partir du relais indiqué, les
              relayeurs dont le coéquipier n'est pas arrivé partent ensemble ; leur temps court depuis cette heure, et leur équipe est classée
              après celles qui n'ont pas été relancées. « Annuler le départ en masse » y revient.`,
            html`<b>Binômes et patrouilles</b> : dans la catégorie, « Équipes de » (2 pour des binômes) et « Coureurs comptés » — le temps de
              l'équipe est celui de ce coureur-là à l'arrivée ; vide, tous comptent et le temps est celui du dernier.`,
            html`<b>Sprint à élimination</b> (étape « Départs », « Manches à élimination ») : à partir du classement d'une qualification, Chrono
              répartit les coureurs en manches « en serpentin », pour des manches de force égale ; chaque manche est une catégorie à part, partie
              en masse (« Nombre de manches », « Coureurs par manche », « Départ de la première manche », « Minutes entre deux manches »). Le tour
              suivant prend les « Qualifiés par manche » et, si l'on veut, des « Repêchés au temps », les plus rapides des non-qualifiés. Chacun
              garde sa puce : sa prochaine lecture va à sa manche. Un tour où des puces ont été lues ne se refait plus. Le « Tableau des
              manches » imprime chaque tour puis le classement final.`,
            html`<b>Plusieurs jours</b> (étape « Départs », et poste Clôturer) : ajoutez les étapes déjà courues, depuis un fichier de
              résultats (IOF XML, OE, MeOS ou Ozimut Chrono) ou depuis un autre événement de cet ordinateur. Le classement général additionne
              les temps, ou compte des points (1000 au vainqueur de chaque étape), sur toutes les étapes ou les meilleures seulement (« Étapes
              comptées »). Les coureurs sont reconnus par leur licence, sinon par leur nom et leur club. <b>« Départ en chasse »</b>, pour le
              dernier jour : le premier du général au temps part à l'heure donnée, les autres avec leur retard ; au-delà du « Retard maximal »,
              et pour ceux à qui il manque une étape, départ à la suite à intervalle fixe.`,
          ])}`, "chrono-formats")}
        ${slide("Chrono", "Listes et comptes", html`
          ${list([
            html`<b>Les listes prêtes</b> : la liste de départ par catégorie, par circuit, minute par minute (pour l'équipe du départ) et par club ;
              les résultats, avec ou sans temps intermédiaires ; le ticket de chaque coureur.`,
            html`<b>« Composer une liste »</b> (étape « Départs », groupe « Imprimer ») : vos propres listes de résultats, de départ ou
              d'inscrits — le regroupement (catégorie, circuit, club), les colonnes et leur ordre, le tri, les catégories et les statuts
              retenus, seulement les premiers de chaque groupe (3 pour les podiums), les temps intermédiaires, une page par groupe, la taille
              du texte, l'orientation, des lignes au-dessus et au-dessous. L'aperçu montre la liste telle qu'elle s'imprimera ; elle s'imprime,
              s'exporte en « Fichier CSV » ou s'ouvre sur un « Écran ». Enregistrée (<kbd>Ctrl</kbd>+<kbd>S</kbd>), elle est gardée avec
              l'événement et paraît sous « Mes listes » dans les postes Suivi et Clôturer.`,
            html`<b>« Factures par club »</b> (postes Accueil et Clôturer) : ce que chaque club doit, droits d'inscription et puces louées. On
              règle le « Prix d'une puce louée », le titre, un « Préfixe de numérotation », l'en-tête de l'organisateur et le pied de page
              (coordonnées bancaires, délai) ; on marque un club payé ; on imprime un club, toutes les factures, ou seulement les clubs qui
              doivent quelque chose ; deux exports CSV, récapitulatif et détail.`,
          ])}`, "chrono-listes")}
        ${slide("Chrono", "Après la course : Clôturer", html`
          ${list([
            html`<b>« Où en est la course »</b> : les coureurs encore en course, les inscrits pas partis (« Marquer absents ceux qui ne sont pas
              partis »), les puces lues attribuées à personne, les puces louées pas rendues, ce qui reste à encaisser.`,
            html`<b>« Avant l'envoi à la fédération »</b> : ce qui manquerait au fichier — coureurs sans licence, sans club ou sans catégorie,
              numéros de licence d'une forme inattendue, catégories sans circuit.`,
            html`<b>Les fichiers de résultats</b> : le fichier de la fédération — en France « Fichier FFCO », un CSV au format d'OE 2003, les
              résultats par circuit, celui que la fédération reçoit pour son classement ; « IOF XML » 3.0, avec les temps intermédiaires
              (WinSplits, Livelox, autres logiciels) ; « MeOS », l'événement à rouvrir dans MeOS ; « Page web », les résultats et les temps
              intermédiaires en une page à mettre en ligne.`,
            html`<b>« Publier sur Ozimut »</b> envoie les résultats à Arena › Résultats, comme fichier de l'organisateur : depuis l'onglet
              seulement (il faut être connecté), pour un événement rattaché à une compétition du calendrier. Ils remplacent ceux que vous y
              aviez déposés.`,
            html`<b>Le direct</b> se règle avant la course : « Liaisons », « Diffuser les résultats en direct sur Ozimut » — les résultats
              paraissent dans Arena › En direct, mis à jour toutes les vingt secondes environ.`,
            html`<b>« Retenir les puces »</b> note sur cet ordinateur la puce de chaque licencié, pour les prochaines courses.
              <b>« Enregistrer le fichier »</b> garde toute la course dans un fichier .ozchrono, à archiver.`,
            html`<b>Un relais</b> ne se publie pas encore dans « Résultats », et ses fichiers contiennent les résultats relais par relais : il
              n'y a pas encore de fichier de résultats par équipe. Le classement des équipes est à l'écran et sur les listes imprimées.`,
          ])}`, "chrono-cloturer")}
        ${slide("Chrono", "Le matériel", html`
          ${list([
            html`<b>Lecteur SPORTident</b> : branchez la station maîtresse en USB, puis « Matériel », « SPORTident » ; le navigateur demande de
              choisir son port et s'en souvient. « Mettre à l'heure » règle le lecteur sur l'heure de l'ordinateur. Il faut Chrome ou Edge sur
              un ordinateur — pas Firefox ni Safari, pas un téléphone —, ou l'application. Les puces SI5 à SI11, SIAC et pCard sont prévues.`,
            html`<b>Emit</b> : choisissez Emit comme « Système de chronométrage », puis « Emit » pour un lecteur 250 ou un MTR4. D'un eScan ou
              d'un eScan2 (« Emit eScan »), Chrono ne reçoit que son état et les passages d'emiTag, pas le contenu des puces : Emit n'en publie
              pas le format. Une course aux puces Emit ne se lit donc pas avec un eScan ; il faut un 250 ou un MTR4. Les autres boîtiers d'Emit
              (ECU, ETS) ne sont pas pris en charge.`,
            html`<b>Imprimante des tickets</b>, « Imprimer sur » : une imprimante à tickets sur port série, USB ou Bluetooth (les modèles
              courants, Epson et compatibles, reçoivent le ticket directement : choisissez son port et sa vitesse) ; l'imprimante du système, avec
              sa fenêtre d'impression ; et, dans l'application, l'imprimante choisie sans fenêtre. Papier de 58 ou 80 mm, « Imprimer le ticket
              dès qu'une puce est lue », « Ticket d'essai ».`,
            html`<b>Postes radio</b> : cochez « Poste radio » sur le boîtier (poste « Postes »). Les passages arrivent par l'application, qui
              écoute les relais radio, ou se notent par « Passage à la main » ; le Speaker les affiche.`,
          ])}`, "chrono-materiel")}
        ${slide("Chrono", "Plusieurs postes", html`
          <p>Un poste seul, sans Internet, garde tout lui-même. Dès qu'il y en a plusieurs, ou pour ne pas dépendre d'un seul ordinateur, l'étape
            « Liaisons » offre trois moyens, que l'on peut cumuler ; « Vérifier » prévient tant que la course n'est gardée que sur cet ordinateur.</p>
          <div class="mx-grid">
            <div class="mx-box" style="--c:var(--s1)"><h3>Copie sur Ozimut</h3><p>Dans l'onglet, dès qu'il y a Internet, chaque opération est
              copiée sur Ozimut : un autre ordinateur ouvrant le même événement reprend la course, et rien n'est perdu si celui-ci tombe en
              panne. « Donner l'accès aux autres postes » crée une clé qui voyage avec la course : les postes sans compte (l'application, un
              téléphone) échangent alors eux aussi avec Ozimut, sans rien saisir.</p></div>
            <div class="mx-box" style="--c:var(--s3)"><h3>Les autres ordinateurs de l'arène</h3><p>L'application Ozimut Chrono, sur chaque
              ordinateur de l'arène qui l'a, les relie entre eux sans Internet : tous égaux, chacun avec sa copie complète. Un autre
              ordinateur rejoint l'événement une fois, avec le « Code de l'événement » affiché ici ; les téléphones et les écrans ouvrent
              l'adresse donnée ici. Dans l'onglet, sur un ordinateur où l'application tourne : « Chercher l'application sur cet
              ordinateur » (voir plus bas, et ${CHAP("chrono-app", "L'application Chrono")}).</p></div>
            <div class="mx-box" style="--c:var(--s2)"><h3>Fichier de l'événement</h3><p>« Enregistrer le fichier » met toute la course dans un
              fichier .ozchrono, à porter sur une clé ; « Reprendre un fichier » l'ajoute à la course ouverte, sans rien doubler. Dans Chrome ou
              Edge, « Tenir un journal dans un dossier » écrit aussi chaque opération dans un dossier de l'ordinateur.</p></div>
          </div>
          <p>Le « Nom de l'opérateur » (étape « Liaisons ») est noté avec chaque modification, pour le journal de l'arbitre.</p>`, "chrono-liaisons")}
        ${slide("Chrono", "Les ordinateurs de l'arène", html`
          <p>Avec l'application Ozimut Chrono, tous les ordinateurs de l'arène sont égaux : pas de maître, pas d'ordinateur central à
            choisir. Chaque application annonce sur le réseau local les événements qu'elle tient ; deux applications qui tiennent le même
            événement se relient d'elles-mêmes, chacune garde sa copie complète et son journal, et un ordinateur qui revient rattrape ce qu'il
            a manqué. Il suffit que chaque ordinateur en joigne au moins un autre.</p>
          ${list([
            html`<b>Le code de l'événement</b> : six lettres et chiffres, créé avec l'événement, affiché en grand dans Préparer › Liaisons. Un
              autre ordinateur doit le connaître pour se relier ; il n'est jamais annoncé sur le réseau.`,
            html`<b>Rejoindre depuis un autre ordinateur</b> : installer l'application et l'ouvrir ; son accueil › « Sur le réseau » ›
              l'événement › son code, une seule fois. Ensuite cet ordinateur se relie tout seul, à chaque lancement.`,
            html`<b>Téléphones et écrans</b> (speaker, résultats, arbitre, liste de départ) : rien à installer, leur navigateur ouvre l'adresse
              d'un ordinateur où l'application tourne, donnée dans Préparer › Liaisons. Ils ne lisent pas de puces et n'impriment pas sur une
              imprimante à tickets en port série : les navigateurs l'interdisent à ces pages locales.`,
            html`<b>L'onglet « Chrono » d'Ozimut</b> se relie à l'application de son propre ordinateur (« Chercher l'application sur cet
              ordinateur »), jamais à celle d'un autre : une page https n'a pas le droit de parler à une page locale en http.`,
            html`<b>Un ordinateur n'apparaît pas ?</b> Certains réseaux (Wi-Fi public, réseau d'école) bloquent les annonces : dans Préparer ›
              Liaisons, donnez l'adresse et la clé de l'autre application (son menu Aide › À propos).`,
          ])}
          <div class="mx-grid">
            <div class="mx-box" style="--c:var(--s3)"><h3>Sans Internet</h3><p>Installez l'application sur chaque ordinateur qui lit des
              puces ou imprime des tickets ; créez (ou importez) l'événement sur l'un d'eux ; sur chacun des autres, accueil › « Sur le
              réseau » › l'événement › son code. Les téléphones et les écrans ouvrent l'adresse donnée dans Liaisons.</p></div>
            <div class="mx-box" style="--c:var(--s1)"><h3>Avec Internet</h3><p>L'onglet « Chrono » partout, tenu à jour par la copie sur
              Ozimut ; ou l'application, qui ajoute l'impression silencieuse des tickets — tout droit sur l'imprimante choisie, sans fenêtre
              d'impression — et une copie de la course sur le disque de l'ordinateur.</p></div>
          </div>
          <p>Ces liaisons n'ont encore été essayées qu'entre plusieurs applications d'un même ordinateur, pas entre de vrais ordinateurs sur
            le réseau d'une arène. Le détail : ${CHAP("chrono-app", "L'application Chrono")}.</p>`, "chrono-arene")}
        ${slide("Chrono", "Les règles par pays, et les limites", html`
          <p>Les « Règles » de l'événement fixent les catégories d'âge, les usages du tirage, les types d'inscription (licencié, titre de
            participation, licencié d'une autre fédération, sans licence) et le fichier de la fédération.</p>
          <div class="table-wrap"><table class="data compact"><thead><tr><th>Règles</th><th>Catégories d'âge</th><th>Tirage</th><th>Résultats et fichier</th></tr></thead><tbody>
            <tr><td>France (FFCO)</td><td>H et D</td><td>Par circuit, jamais deux coureurs d'un club à la suite</td><td>Par circuit ; « Fichier FFCO »</td></tr>
            <tr><td>Canada (Orienteering Canada)</td><td>M et F</td><td>Par catégorie, sans règle de club</td><td>Par catégorie</td></tr>
            <tr><td>Règles de l'IOF (autres pays)</td><td>M et W</td><td>Par catégorie, jamais deux coureurs d'un club à la suite</td><td>Par catégorie</td></tr>
          </tbody></table></div>
          <p>Ces usages ne sont que des valeurs proposées : le tirage et le Suivi laissent choisir par circuit ou par catégorie.</p>
          <p><b>Ce que Chrono ne fait pas encore, ou n'a pas encore prouvé</b> :</p>
          ${list([
            html`aucun essai sur du vrai matériel (stations SPORTident ou Emit, imprimante à tickets) ni avec un vrai MeOS ;`,
            html`le contenu des puces Emit lues par un eScan ou un eScan2 ;`,
            html`un fichier de résultats par équipe pour les relais, et la publication d'un relais dans « Résultats » ;`,
            html`l'onglet pour d'autres que les administrateurs.`,
          ])}
          <p>L'installation de l'application, la liaison des ordinateurs de l'arène, l'impression directe et les postes radio sont décrits dans
            ${CHAP("chrono-app", "L'application Chrono")}.</p>`, "chrono-regles")}`,
      "chrono-app": () => appDoc("L'application Chrono"),
    });
  }

  // ======================================================================================================
  // Carto (« Cartographier », the map editor: a module of its own since 2026-11-12)
  // ======================================================================================================
  const CARTO = [["carte", "La carte"], ["donnees", "Les données"], ["terrain", "Sur le terrain"], ["imprimer", "Imprimer et partager"],
    ["equipe", "En équipe"]];
  function carto() {
    return chapters(CARTO, {
      carte: () => html`
        ${slide("Carto", "Une carte dans le navigateur", html`
          <p>${P("#/carto", "Carto")} dessine et met à jour les cartes de course d'orientation dans le navigateur, comme OCAD ou OpenOrienteering
            Mapper : rien à installer. Il suffit d'un compte, sans activer Orga, sur ordinateur comme sur téléphone. C'est encore une version bêta :
            gardez une copie de vos fichiers.</p>
          <p>L'écran de la carte s'ouvre tout de suite, vide, et par-dessus trois choix :</p>
          ${list([
            html`<b>Nouvelle carte</b> : sprint ou forêt, avec le jeu de symboles de l'IOF qui convient (ISSprOM 2019-2 ou ISOM 2017-2), placée à
              l'endroit choisi — des coordonnées ou votre position — dans le quadrillage du pays.`,
            html`<b>Importer une carte</b> : un fichier OCAD (versions 6 à 2018), OpenOrienteering Mapper (.omap, .xmap) ou Ozimut (.ozmap).
              Réenregistré en OCAD, le fichier garde à l'identique tout ce que vous n'avez pas modifié ; ce qu'un format ne sait pas garder est dit à
              l'import et à l'export.`,
            html`<b>Ouvrir une carte</b> : les vôtres, et celles dont l'équipe vous compte.`,
          ])}
          <p>Le ruban suit le travail : Dessiner, Modifier, Fonds, Données, Terrain, Vérifier, Mise en page, Imprimer, Équipe. Les symboles sont à
            gauche, dessinés comme sur la carte. On dessine en lignes droites, en courbes ou à main levée, accroché aux points et aux lignes voisins ;
            on remplit une surface d'un clic entre les lignes qui l'entourent, on coupe, on unit, on lisse. Les symboles et les couleurs, encres
            d'accompagnement comprises, se modifient dans « Mise en page ». « Vérifier » signale ce qui est sous les tailles minimales de l'IOF, et
            « Généraliser » guide, étape par étape, le passage à une autre échelle.</p>`)}`,
      donnees: () => html`
        ${slide("Carto", "Partir des données ouvertes", html`
          <p>Une carte neuve n'a pas à partir de rien. Sous « Données », Carto va chercher pour la zone de la carte :</p>
          ${list([
            html`<b>Les courbes de niveau</b>, d'après le modèle de terrain du pays (l'IGN en France, swisstopo en Suisse, l'USGS aux États-Unis,
              NRCan au Canada, LINZ en Nouvelle-Zélande), ailleurs d'après un modèle mondial.`,
            html`<b>OpenStreetMap</b> : routes, chemins, bâtiments, eau, murs et clôtures, rangés dans les symboles de la carte.`,
            html`<b>Les données nationales</b> : la BD TOPO de l'IGN en France, swissTLM3D en Suisse, les routes, l'eau et les bâtiments de The
              National Map aux États-Unis.`,
            html`<b>Le plan de ville (sprint)</b>, pour une carte sprint en France : la carte que le générateur des courses de Pixel fait d'après le
              LiDAR de l'IGN, sa BD TOPO, la photo aérienne et son infrarouge, le cadastre et OpenStreetMap, selon les règles d'un cartographe — la
              voirie publique pavée jusqu'aux limites des parcelles, le bord des zones pavées et les bordures, les trottoirs et pistes cyclables en
              lignes à leur largeur, les escaliers à leur largeur, le réseau de chemins raccordé, les bâtiments accolés réunis, la végétation et les
              arbres isolés lus par le LiDAR, les murs et clôtures franchissables ou non selon leur hauteur, les jardins privés en olive avec une
              « limite à confirmer » (995, violet, jamais imprimée) là où aucun mur, clôture ou haie n'est connu, les terrains de sport, et les courbes
              coupées aux bâtiments seulement. Elle est calculée sur les serveurs d'Ozimut, en plusieurs minutes : on peut continuer à travailler ou
              fermer la page, elle arrive en brouillon à la prochaine ouverture. Les objets d'OpenStreetMap sont gardés sur des symboles masqués
              (990, 991). La « Nouvelle carte » sprint l'utilise en France ; ailleurs, OpenStreetMap.`,
            html`<b>Le LiDAR</b>, là où un LiDAR national est ouvert (France, Suisse, États-Unis, Canada, Nouvelle-Zélande) : le relief, les falaises
              et la végétation qu'en tire karttapullautin, à l'équidistance de la carte, avec des courbes d'aide denses si on le souhaite (voir
              plus bas). Les dalles se calculent à la demande, en quelques minutes ; une barre dit où en est le calcul.`,
          ])}
          <p>Tout arrive <b>en brouillon</b>, dans une partie à part : on accepte ce qui est juste et on rejette le reste, objet par objet ou d'un
            coup. Les données ouvertes sont un point de départ ; le terrain, lui, se relève sur place. Là où un pays n'a pas encore ses données,
            Carto le dit et propose d'en demander la prise en charge.</p>
          <p>Les <b>fonds</b> se posent sous la carte : une photo aérienne ou une carte en ligne selon le pays, une image ou un PDF calé, une trace
            GPS.</p>`)}
        ${slide("Carto", "Le LiDAR et karttapullautin", html`
          <p>Le relief, les falaises et la végétation du LiDAR sont calculés par <b>karttapullautin</b>, le logiciel libre (licence GPL-3) de
            Jarkko Ryyppö, celui de MapAnt. Ozimut le télécharge depuis sa publication et l'exécute tel quel sur des serveurs de calcul, dalle de
            1 km par dalle ; chaque dalle est calculée une fois, puis sert à tous les cartographes
            (<a href="https://github.com/karttapullautin/karttapullautin" target="_blank" rel="noopener">github.com/karttapullautin</a>).</p>
          ${list([
            html`<b>L'équidistance</b> suit la norme de la carte : 2 ou 2,5 m pour une carte sprint (ISSprOM), 2,5 ou 5 m pour une carte forêt
              (ISOM). À 5 m, karttapullautin ajoute des courbes de forme à mi-équidistance là où le relief le demande.`,
            html`<b>Les courbes d'aide</b> : les courbes « basemap » de karttapullautin, tous les 0,5 m (tous les mètres sous des courbes de 5 m),
              arrivent en violet clair dans une partie à part, « Courbes d'aide (LiDAR) », qu'on masque à volonté, et ne sont jamais imprimées
              (symbole 996, un auxiliaire). Elles montrent les formes entre deux courbes : on y dessine à la main les courbes de forme, les petites
              buttes et les petits creux.`,
            html`<b>Les points lus</b> : karttapullautin garde une part des points du nuage (<code>thinfactor</code>), réglée sur sa densité pour en
              garder environ 6 par m², soit 15 à 20 % des points de l'IGN. Mesuré sur deux dalles de l'IGN (la ville et les bois de Gif-sur-Yvette, la
              forêt de Fontainebleau) : même végétation, mêmes courbes, quelques petites falaises de moins, et une dalle calculée en 20 à 45 s au
              lieu de 40 à 70 s (la lecture du fichier LiDAR reste).`,
            html`<b>Les autres réglages</b> sont ceux de karttapullautin 2.15.4 ; la fenêtre « LiDAR » les liste avec ce qu'ils font : lissage et
              accentuation des courbes, sélection des buttes, pente d'une falaise franchissable (1,15 m par mètre) et infranchissable (2 m par
              mètre), hauteurs du terrain découvert et de la végétation, seuil des rayures de sous-bois. Ils ne se changent pas dans Carto, puisqu'une
              dalle sert à tous ; karttapullautin s'utilise aussi sur son propre ordinateur, avec ses réglages à soi.`,
          ])}`)}`,
      terrain: () => html`
        ${slide("Carto", "Sur le terrain, avec le téléphone", html`
          <p>Sur un téléphone ou une tablette, Carto s'ouvre sur l'onglet « Terrain », avec des boutons à la taille du doigt :</p>
          ${list([
            html`<b>« Ma position »</b>, au-dessus des boutons de zoom : votre position GPS sur la carte et sa précision (en bas, « GPS ± 6 m »). La
              carte la suit jusqu'à ce que vous la déplaciez, et y revient d'un toucher sur le bouton ; l'écran reste allumé tant qu'elle est
              affichée. La boussole tourne la carte comme le terrain devant vous ;`,
            html`<b>la trace</b> de votre passage (« Enregistrer la trace »), sa longueur affichée pendant l'enregistrement, gardée comme fond GPX ;`,
            html`<b>des photos et des notes</b> épinglées sur la carte, là où vous êtes ; un toucher sur une épingle rouvre la note, pour la marquer
              « Traité » ou la supprimer ;`,
            html`<b>dessiner du doigt</b> : un toucher choisit un objet, un doigt déplace la carte, deux doigts zooment. Pendant un tracé, une barre
              au bas de la carte propose « Annuler le point », « Abandonner » et « Terminer » — ce que font Retour arrière, Échap et Entrée au
              clavier ; avec l'outil « Sommets », un point touché se retire ou change d'angle de la même façon. Le symbole en main s'affiche sur le
              bouton de la liste des symboles, qui se referme dès qu'un symbole est choisi ;`,
            html`<b>une copie hors ligne</b> de la carte : sans réseau, on continue de dessiner, et les enregistrements partent dès que le réseau
              revient.`,
          ])}`)}`,
      imprimer: () => html`
        ${slide("Carto", "Imprimer et partager", html`
          ${list([
            html`<b>La mise en page</b> : la zone imprimée, les lignes du nord magnétique, l'échelle graphique, la légende, les logos, les mentions,
              un code QR.`,
            html`<b>Imprimer</b> : un PDF vectoriel en CMJN ; pour une imprimerie offset, les encres d'accompagnement de la carte et les séparations,
              une page par plaque avec ses repères de calage — le même moteur que pour le tracé des circuits.`,
            html`<b>Exporter</b> : OCAD, OpenOrienteering Mapper, .ozmap (le format d'Ozimut, qui garde tout ce qu'il faut pour revenir vers OCAD),
              une image PNG avec son fichier de calage, un KMZ.`,
            html`<b>Vers les autres outils</b> : la carte part d'un clic vers le tracé des circuits, ou vers ${P("#/mes-cartes", "Mes cartes")}.`,
          ])}`)}`,
      equipe: () => html`
        ${slide("Carto", "Cartographier en équipe", html`
          <p>Une carte a son équipe : on y invite par un lien, en cartographe (qui dessine) ou en lecteur ; personne n'y est cherché par son nom ou
            son adresse e-mail. Plusieurs cartographes travaillent en même temps : chacun voit où sont les autres et se réserve un <b>secteur</b>, un
            rectangle que les autres ne modifient pas ; des changements faits en même temps se fusionnent objet par objet.</p>
          <p>Une version est gardée toutes les 30 minutes de travail, ou quand on la nomme, et peut être restaurée ; les commentaires s'épinglent
            sur la carte. Un compte supprimé confie ses cartes au premier cartographe de leur équipe.
            ${P("#/compte/confidentialite", "Règles du site et confidentialité")} dit ce qui est gardé.</p>`)}`,
    });
  }

  const LABELS = { site: "Le site", arena: "Les compétitions", coach: "Coach", orga: "Les outils", carto: "Carto" };
  return { LABELS, LEDE, ARENA, COACH, ORGA, CARTO, site, arena, coach, orga, carto };
}
