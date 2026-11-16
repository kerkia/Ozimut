// The documentation's texts in French (pages/methods.js builds the page, its data and its tabs; methods.en.js in step:
// the same structure, the same figures, the English words). build(X) receives the page's neutral helpers and data
// and returns the tabs' labels, the five panels (officiel, top, etude, calculs, tracerDoc), and the charts that carry
// words (drawAgreement, drawEval). Written for orienteers who are not mathematicians (owner, 2026-10-14); the Fit is
// never named (the circuits are measured on the runners' « niveau habituel »).
export function build(X) {
  const { html, raw, $, $$, fmt, fmtSigned, mean, t, data, timeChart, scatterChart, methodColor, terrainColor, METHOD_SLOT, css,
    TERRAINS, available, chartCard, bindChartCard, legend, methodKey, methodLabel, methodShort, seg, cnLabel, replaceQuery, TR, TRD,
    PDF, cvar, MINUS, EXAMPLE, pearson, roundHalfUp, sg, ci, neg, tickStep, tickDec, est, star, SEP,
    main, meta, pf, p6, M, analyst, tops, fmtW, own, TNAME, v, ev, study, season, VM, ref, entry, right, share,
    EVM, EV_UNIT, evRows, evSeasons, evFmt, pairLabel, evWins, lvl, hf, hs, hfn, hsn, dci, subTabs, windows,
    RACE6, r6, n0, more, fr = true } = X;

  // the methods' tabs (the guide's — Le site, Courses, Entraînement, Organisation — are content/guide.*.js'; pages/methods.js orders
  // them all); « L'étude » is no tab of the bar since 2026-10-24 (owner): the Ozimut method's tab leads to it (STUDY_TAB)
  const TABS = [["officiel", "CN officiel"], ["top", "Méthode Ozimut"], ["calculs", "Coureurs et clubs"], ["tracer", "Le tracé"]]
    .filter(([k]) => fr || (k !== "officiel" && k !== "calculs"));
  const STUDY_TAB = ["etude", "L'étude"];
  const STUDY_CHAPTERS = [["objectifs", "Objectifs"], ["depart", "Le point de départ"], ["mesure", "La mesure"],
    ["choix", "Les choix et les variantes"], ["resultats", "Les résultats"], ["conclusion", "La méthode retenue"]];
  // (the results and split times moved to the guide's « Courses » on 2026-10-24: guide.*.js)
  const SITE_CHAPTERS = [["clubs", "Clubs"], ["coureurs", "Coureurs"], ["reseau", "Réseau"], ["relais", "Relais"], ["limites", "Limites"]];
  // (Stats' documentation, since 2026-10-31: one documentation per module)
  const lede = fr ? html`Comment les classements se calculent : le CN officiel, la méthode Ozimut et l'étude qui l'a validée, et les calculs des pages des coureurs et des clubs.`
    : html`Comment le classement se calcule : la méthode Ozimut et l'étude qui l'a validée sur les résultats français.`;
  const note = !fr ? "" : html`Seule la ${methodLabel("official")} reprend des valeurs publiées par la Fédération française de course d'orientation (FFCO) ; la méthode Ozimut est un calcul alternatif, fait par le site sur les mêmes résultats.`;
  const pctOf = (x) => `${fmt(100 * x)} %`;
  const force = html`le niveau habituel des coureurs`;
  const EV_LABEL = { acc: "Duels bien prédits", r2: "Écarts de temps expliqués" };
  const forestPlot = (items, meas) => {
    if (!items.length) return html`<div class="empty">—</div>`;
    const lo = Math.min(0, ...items.map((i) => i.d[1])), hi = Math.max(0, ...items.map((i) => i.d[2]));
    const pad = (hi - lo) * 0.04 || 0.01, a = lo - pad, span = hi + pad - a;
    const pos = (x) => ((x - a) / span) * 100;
    return html`<div class="ev-forest">${items.map((i) => {
      const cls = i.d[1] > 0 ? "up" : i.d[2] < 0 ? "down" : "flat";
      return html`<div class="ev-row ${cls}" title="${cls === "flat" ? "l'intervalle contient 0 : écart non significatif" : "écart significatif"}">
        <span class="ev-lab">${i.label}</span>
        <span class="ev-val num">${evFmt(meas, i.d[0])}<span class="dim"> [${evFmt(meas, i.d[1])} ; ${evFmt(meas, i.d[2])}]</span></span>
        <span class="ev-track"><i class="ev-zero" style="left:${pos(0)}%"></i>
          <i class="ev-ci" style="left:${pos(i.d[1])}%;width:${Math.max(0.6, pos(i.d[2]) - pos(i.d[1]))}%"></i>
          <i class="ev-pt" style="left:${pos(i.d[0])}%"></i></span></div>`;
    })}</div>`;
  };
  const shareName = (f) => (f >= 1 ? "tout le peloton" : Math.abs(f - 2 / 3) < 0.01 ? "les deux tiers les plus rapides" : `les ${fmt(Math.round(100 * f))} % les plus rapides`);
  const shareShort = (f) => (f >= 1 ? "100 %" : Math.abs(f - 2 / 3) < 0.01 ? "deux tiers" : `${fmt(Math.round(100 * f))} %`);
  const years = (d) => (d === 365 ? "12 mois" : `${fmt(Math.round(d / 365))} ans`);
  const r6Table = (level, extra) => html`<div class="table-wrap"><table class="data compact"><thead><tr><th>Coureur</th><th class="r">${level}</th>
    <th class="r">Temps</th><th class="r">${level} × temps</th>${extra.map(([h]) => html`<th class="r">${h}</th>`)}</tr></thead>
    <tbody>${RACE6.map(([name, c, tm], i) => html`<tr><td>${name}</td><td class="r num">${n0(c)}</td><td class="r num">${fmt(tm)} min</td>
      <td class="r num">${n0(r6.prod[i])}</td>${extra.map(([, f]) => html`<td class="r num">${f(i, tm)}</td>`)}</tr>`)}</tbody></table></div>`;

  // ======================================================================================================
  // 1. CN officiel
  // ======================================================================================================
  function officiel() {
    return html`
    <section class="mx-slide" style="${cvar("official")}">
      <p class="mx-kicker">${methodKey("official")} ${methodLabel("official")}</p>
      <h2>Le score d'une course</h2>
      <p>Chaque course rapporte un score à chaque coureur classé. Ce score dépend du temps du coureur et de la difficulté du circuit. La difficulté
        se mesure sur les coureurs présents, à partir de leur CN : c'est la <b>valeur du circuit</b>.</p>
      <p>Pour chaque coureur qui a un CN, on multiplie son CN par son temps : un coureur de CN 6 000 qui court en 50 minutes donne 300 000. La valeur du
        circuit est la moyenne de ces produits pour les deux tiers les plus rapides des coureurs qui ont un CN. Le score d'un coureur est la valeur du
        circuit divisée par son temps.</p>
      <div class="mx-eq">valeur du circuit = moyenne des (CN × temps) des deux tiers les plus rapides
        <small>score = valeur du circuit ÷ temps du coureur</small></div>
      <p>Un coureur qui court comme son CN le laisse prévoir obtient un score proche de son CN. S'il court 10 % plus vite, son score est 11 % plus haut ;
        s'il court 10 % plus lentement, son score est 9 % plus bas.</p>
      <h3>Exemple : un circuit de six coureurs</h3>
      ${r6Table("CN", [["Dans la valeur ?", (i) => (i < r6.keep ? "oui" : "non")], ["Score officiel", (i, tm) => n0(r6.off / tm)]])}
      <p>Les deux tiers de six coureurs, c'est quatre coureurs : A, B, C et D. La valeur du circuit est la moyenne de leurs quatre produits, soit
        ${n0(r6.off)}. Le score de A est ${n0(r6.off)} ÷ 50 = ${n0(r6.off / 50)}. E et F, les plus lents, ne comptent pas dans la valeur, mais reçoivent
        un score comme les autres.</p>
      <ul class="mx-list">
        <li><span>Le CN utilisé est le CN officiel publié 15 jours avant la course (le « CN J-15 »).</span></li>
        <li><span>Quand le circuit ne compte que trois coureurs ayant un CN, les trois comptent dans la valeur.</span></li>
        <li><span>Un poinçon manquant, un abandon, une disqualification ou un hors-délai donnent un score de 0, qui compte dans le CN. Un résultat
          « non classé » (nc) ne compte nulle part.</span></li>
        <li><span>En 2022, la valeur des circuits était multipliée par 0,95 ; les autres années, elle ne l'est pas.</span></li>
      </ul>
    </section>
    <section class="mx-slide" style="${cvar("official")}">
      <p class="mx-kicker">Le CN</p>
      <h2>La moyenne des scores du milieu</h2>
      <p>Le CN officiel est la moyenne des scores des 12 derniers mois, sans les meilleurs ni les moins bons. Depuis 2026, on écarte les 10 % meilleurs
        scores et les 40 % moins bons, puis on fait la moyenne de ceux qui restent. Le nombre de scores écartés est arrondi : avec 10 courses, on écarte
        la meilleure et les 4 moins bonnes, et le CN est la moyenne des 5 autres.</p>
      <ul class="mx-list">
        <li><span>Avant 2026, seule la meilleure course était écartée.</span></li>
        <li><span>Chaque 1<sup>er</sup> janvier depuis 2026, tous les CN d'une spécialité sont multipliés par un même nombre, choisi pour que la moyenne
          des 20 % meilleurs CN vaille 5 600 : c'est le recalage. Avant 2026, le meilleur CN était ramené à 10 000 quand il dépassait cette valeur ;
          c'est arrivé au 1<sup>er</sup> janvier 2013, 2023, 2024 et 2025.</span></li>
        <li><span>Il y a quatre classements depuis 2026 : forêt (longue distance, moyenne distance, nuit), sprint, VTT et ski. Avant 2026, un seul
          classement pédestre réunissait la forêt et le sprint ; le site l'affiche tel quel.</span></li>
      </ul>
    </section>
    <section class="mx-slide" style="${cvar("official")}">
      <p class="mx-kicker">Sur le site</p>
      <h2>Ce que le site reprend</h2>
      <ul class="mx-list">
        <li><span>Les CN et les scores officiels sont repris tels que la FFCO les publie sur le site du classement national, course par course.</span></li>
        <li><span>La page d'un coureur lit en direct sa page CN sur le site de la FFCO. La fédération réévalue parfois les courses des saisons passées ;
          ses points peuvent alors différer de ceux de la page de résultats de la course.</span></li>
        <li><span>À côté du CN publié, la page d'un coureur refait le calcul avec la règle ci-dessus et les scores officiels. Un écart éventuel vient d'un
          résultat absent du site, corrigé après coup, ou réévalué.</span></li>
        <li><span>Le classement officiel fait foi : c'est le seul qui compte pour les sélections.</span></li>
      </ul>
    </section>`;
  }

  // ======================================================================================================
  // 2. The Ozimut method
  // ======================================================================================================
  function top() {
    // the worked example, computed with each visible method's rules on the same ten scores
    const W = { cdf: pf.weights.cdf, national: pf.weights.national, other: pf.weights.other };
    const n = EXAMPLE.length;
    const keep = roundHalfUp(pf.eligible_fraction * n);
    function aggregate(places) {
      let left = places, num = 0, den = 0;
      const used = EXAMPLE.map(([s, k], i) => {
        if (i >= keep || left <= 0) return 0;
        const u = Math.min(W[k], left);
        num += u * s; den += u; left -= u;
        return u;
      });
      return { cn: roundHalfUp(num / den), used };
    }
    const offDrop = Math.round(0.1 * n), offLow = Math.round(0.4 * n);
    const offUsed = EXAMPLE.map((_, i) => (i >= offDrop && i < n - offLow ? 1 : 0));
    const offCn = Math.round(mean(EXAMPLE.filter((_, i) => offUsed[i]).map(([s]) => s)));
    const EX = {
      official: { cn: offCn, used: offUsed, what: html`la moyenne des ${fmt(n - offDrop - offLow)} scores du milieu, sans le meilleur ni les
        ${fmt(offLow)} moins bons` },
      top6w: { ...aggregate(p6.top_n), what: html`${fmt(p6.top_n)} places, remplies par les meilleurs scores selon leur poids, en moyenne pondérée` },
    };
    const chips = (m) => html`<div class="mx-scores">${EXAMPLE.map(([s, k], i) => {
      const u = EX[m].used[i];
      const sup = m !== "official" && u ? html`<sup>${u === W[k] && k === "other" ? "" : `×${fmtW(u)}`}</sup>` : "";
      return html`<span class="mx-sc ${u ? "on" : "off"} ${k === "cdf" ? "star" : ""}">${fmt(s)}${sup}</span>`;
    })}</div>`;
    const exLabel = (m) => (m === "official" ? cnLabel("official") : cnLabel("top6w"));

    return html`
    <section class="mx-slide">
      <p class="mx-kicker" style="${cvar("top6w")}">${methodKey("top6w")} ${methodLabel("top6w")}</p>
      <h2>Un score Ozimut par course, un indice Ozimut par coureur</h2>
      <p class="mx-lead">La méthode Ozimut se lit en deux temps, comme le classement mondial de l'IOF. D'abord, chaque course rapporte un <b>score Ozimut</b> à
        chaque coureur. Ensuite, l'<b>indice Ozimut</b> d'un coureur résume ses meilleurs scores Ozimut des 12 derniers mois.</p>
      <div class="notice info" style="margin:12px 0">Pourquoi ces choix, et ce qu'ils valent face au CN officiel : <a href="#/documentation?onglet=etude" data-tab-link="etude"><b>l'étude</b></a>,
        qui a mesuré chaque variante sur les résultats français depuis 2012.</div>
      <div class="mx-grid">
        <div class="mx-box" style="--c:var(--s1)"><h3>Le score Ozimut d'une course</h3>
          <p>La difficulté du circuit se mesure sur le niveau habituel des coureurs présents, comme la FFCO le fait avec leur CN. Le score d'un coureur
            est cette difficulté divisée par son temps.</p></div>
        <div class="mx-box" style="--c:var(--s3)"><h3>L'indice Ozimut d'un coureur</h3>
          <p>Ses meilleurs scores Ozimut des 12 derniers mois remplissent ${fmt(p6.top_n)} places ; l'indice Ozimut est leur moyenne, chaque course comptée
            selon ses places.</p></div>
      </div>
      <p style="margin-top:14px">Tout se calcule avec des moyennes ordinaires : chacun peut refaire un score ou un indice à la main. Les formules sont les mêmes dans
        les quatre spécialités ; seuls trois réglages changent : les courses prises en compte et la part des meilleurs scores, parce que le VTT et le ski
        ont bien moins de courses, et la part du peloton qui mesure le circuit.</p>
      <div class="table-wrap"><table class="data compact"><thead><tr><th>${t("f.terrain")}</th><th>Courses prises en compte</th>
        <th class="r">Meilleurs scores regardés</th><th class="r">Coureurs qui mesurent le circuit</th></tr></thead>
        <tbody>${windows.map(([tr, w, f, sf]) => html`<tr><td>${t(`terrain.${tr}`)}</td><td>${w === 365 ? "les 12 derniers mois" : `les ${fmt(Math.round(w / 365))} dernières années`}</td>
          <td class="r">les ${pctOf(f)} meilleurs</td><td class="r">${shareName(sf)}</td></tr>`)}</tbody></table></div>
      <p style="margin-top:14px">Les raisons de chaque choix, les variantes essayées et
        les mesures qui les justifient sont dans
        <a href="#/documentation?onglet=etude&voir=choix" data-tab-link="etude" data-goto="choix">l'étude</a>.</p>
    </section>

    <section class="mx-slide" style="--c:var(--s1)">
      <p class="mx-kicker">Le score Ozimut · étape 1</p>
      <h2>Le niveau habituel des coureurs présents</h2>
      <p>Comme pour le CN officiel, la difficulté d'un circuit se mesure sur les coureurs présents. Mais la méthode Ozimut n'utilise pas leur indice Ozimut : elle
        utilise leur <b>niveau habituel</b>, tel qu'il était ${fmt(pf.lag_days)} jours avant la course.</p>
      <p>Le niveau habituel d'un coureur est la moyenne pondérée de ses ${pctOf(pf.eligible_fraction)} meilleurs scores Ozimut des 12 derniers mois
        (70 % sur deux ans en VTT, sur trois ans en ski), chaque score compté selon son poids (voir l'indice Ozimut plus bas), sans limite de places. Il dit ce
        que vaut le coureur d'ordinaire. Ce n'est pas un classement : c'est une étape du calcul, faite des courses que le coureur a déjà courues. L'indice
        Ozimut, lui, ne retient que les meilleures courses : il sert à classer. Comme dans l'indice Ozimut, les courses courues en catégorie jeune y comptent
        de moins en moins avec le temps.</p>
      <ul class="mx-list">
        <li><span>Seuls comptent les coureurs qui ont un niveau habituel dans la spécialité de la course. Il en faut au moins ${fmt(pf.min_ranked)} sur le
          circuit ; sinon le circuit n'a pas de valeur et ne donne pas de score.</span></li>
        <li><span>Le calcul part des résultats de 2010, avec les CN officiels de cette première saison comme point de départ.</span></li>
        <li><span>Les résultats « non classé » (nc) et les catégories H10 et D10 ne comptent pas.</span></li>
      </ul>
    </section>

    <section class="mx-slide" style="--c:var(--s1)">
      <p class="mx-kicker">Le score Ozimut · étape 2</p>
      <h2>La valeur Ozimut du circuit</h2>
      <p>Pour chaque coureur, on multiplie son niveau habituel par son temps. La valeur Ozimut du circuit est la <b>moyenne de ces produits pour les plus
        rapides</b> : ${shareName(own(pf, "For", "sample_fraction") ?? 2 / 3)} en forêt, ${shareName(own(pf, "Spr", "sample_fraction") ?? 2 / 3)} en sprint,
        ${shareName(own(pf, "VTT", "sample_fraction") ?? 2 / 3)} en VTT et en ski. C'est la règle de la FFCO, qui prend les deux tiers les plus rapides,
        avec une part réglée dans chaque spécialité.</p>
      <div class="mx-eq">valeur Ozimut du circuit = moyenne des (niveau habituel × temps) des plus rapides
        <small>forêt : ${shareShort(own(pf, "For", "sample_fraction") ?? 2 / 3)} des coureurs ayant un niveau · sprint : ${shareShort(own(pf, "Spr", "sample_fraction") ?? 2 / 3)} · VTT et ski : ${shareShort(own(pf, "VTT", "sample_fraction") ?? 2 / 3)} ; le nombre est arrondi au-dessus</small></div>
      <p>Les coureurs les plus lents d'un circuit sont ceux qui se sont trompés, et ceux qui ont couru à leur niveau. Les compter dit à quel point le
        circuit était piégeux ; les écarter dit la difficulté du circuit couru sans faute. La bonne part n'est pas la même partout : en forêt, où une
        course sur douze se perd, presque tout le peloton renseigne ; en sprint, où les erreurs sont deux fois plus rares, les plus lents brouillent la
        mesure. Chaque part a été choisie parce qu'elle prédit le mieux les résultats dans sa spécialité
        (<a href="#/documentation?onglet=etude&voir=choix" data-tab-link="etude" data-goto="choix">l'étude</a>).</p>
      <ul class="mx-list">
        <li><span>Quand le circuit ne compte que ${fmt(pf.min_ranked)} coureurs ayant un niveau, les ${fmt(pf.min_ranked)} comptent, comme dans la règle
          officielle.</span></li>
        <li><span>Un poinçon manquant, un abandon, une disqualification ou un hors-délai ne comptent pas dans la valeur Ozimut du circuit.</span></li>
      </ul>
    </section>

    <section class="mx-slide" style="--c:var(--s1)">
      <p class="mx-kicker">Le score Ozimut · étape 3</p>
      <h2>Le score</h2>
      <div class="mx-eq">score Ozimut = valeur Ozimut du circuit ÷ temps du coureur × facteur de recalage du jour</div>
      <ul class="mx-list">
        <li><span>Comme pour le score officiel, courir 10 % plus vite donne un score 11 % plus haut, et courir 10 % plus lentement un score 9 % plus bas.</span></li>
        <li><span>Un poinçon manquant, un abandon, une disqualification ou un hors-délai donnent un score de 0, qui compte dans l'indice Ozimut.</span></li>
        <li><span>Le facteur de recalage, expliqué plus bas, est celui du jour de la course. Le score est calculé une fois pour toutes et n'est jamais revu.</span></li>
      </ul>
      <h3>Exemple : un circuit de six coureurs</h3>
      ${r6Table("Niveau", [["Score officiel", (i, tm) => n0(r6.off / tm)], ["Score Ozimut en forêt", (i, tm) => n0(r6.topFor / tm)], ["Score Ozimut en sprint", (i, tm) => n0(r6.topSpr / tm)]])}
      <p>On suppose ici que le niveau habituel de chaque coureur est égal à son CN, et on ne tient pas compte du recalage. F s'est perdu : 90 minutes
        pour un coureur de niveau 5 000, alors que C, du même niveau, a mis 62 minutes. La règle officielle mesure le circuit sur les quatre plus
        rapides, A à D : la valeur est ${n0(r6.off)}. En sprint, la méthode Ozimut fait de même. En forêt, elle prend ${fmt(r6.keepFor)} coureurs sur six
        (90 % de six, arrondi au-dessus), F compris : la valeur passe à ${n0(r6.topFor)}, et A, qui a couru sans faute, marque ${n0(r6.topFor / 50)} au lieu
        de ${n0(r6.off / 50)}. Ce circuit a coûté cher à un coureur sur six ; celui qui l'a couru sans faute en est récompensé. Sur un vrai circuit de
        plusieurs dizaines de coureurs, une seule erreur pèse bien moins, et le recalage ramène le niveau général à ${fmt(pf.anchor_target)}.</p>
    </section>

    <section class="mx-slide" style="${cvar("top6w")}">
      <p class="mx-kicker">L'indice Ozimut d'un coureur</p>
      <h2>${fmt(p6.top_n)} places pour les meilleures courses</h2>
      <p>On range les scores Ozimut des 12 derniers mois du meilleur au moins bon, et on ne regarde que les ${pctOf(p6.eligible_fraction)} meilleurs. On remplit
        alors ${fmt(p6.top_n)} places, en commençant par le meilleur score. Chaque course prend autant de places que son poids : ${fmtW(pf.weights.cdf)} places
        pour un championnat de France, ${fmtW(pf.weights.national)} place pour une course nationale (O'France, Nationale), ${fmtW(pf.weights.other)} place pour
        toute autre course, courses de sélection et championnats de ligue compris. La dernière course retenue ne prend que les places qui restent.</p>
      <p>L'indice Ozimut est la <b>moyenne pondérée</b> des scores retenus : chaque score compte autant de fois qu'il a de places. Prenons un championnat
        de France à 6 800, qui prend 2 places, et quatre autres courses à 6 500, 6 400, 6 200 et 6 000, qui prennent une place chacune. L'indice Ozimut vaut
        (2 × 6 800 + 6 500 + 6 400 + 6 200 + 6 000) ÷ 6 = 6 450.</p>
      <div class="mx-eq">indice Ozimut = Σ (places × score) ÷ Σ places
        <small>au plus ${fmt(p6.top_n)} places, dans toutes les spécialités ; une course courue en catégorie jeune compte pour places × (1 − son âge ÷ la fenêtre)</small></div>
      <ul class="mx-list">
        <li><span>Les poids suivent le nom de la compétition. Les niveaux A, B, C et D de la FFCO ne sont pas utilisés.</span></li>
        <li><span><b>Les courses des jeunes comptent de moins en moins avec le temps.</b> Une course courue en catégorie jeune (H et D jusqu'à 20 ans)
          prend ses places comme les autres, mais elle compte dans la moyenne pour 1 − son âge ÷ 12 mois (÷ deux ans en VTT, trois en ski) : en entier le
          jour de la course, à moitié six mois plus tard, presque plus à la fin de la fenêtre. Un jeune progresse vite : ses courses d'il y a dix mois
          décrivent un coureur plus lent. Les courses des adultes gardent leur poids. L'indice Ozimut d'un jeune peut donc bouger entre deux courses.</span></li>
        <li><span>Il faut au moins ${fmt(pf.min_scores)} courses dans les 12 derniers mois pour être classé. Quand il y a moins de ${fmt(p6.top_n)} places
          remplies, l'indice Ozimut est la moyenne pondérée de ce qui est là.</span></li>
        <li><span>Une fois les ${fmt(p6.top_n)} places remplies, une course de plus ne peut pas faire baisser l'indice Ozimut d'un adulte : soit elle prend la place
          d'une course moins bonne, soit elle reste dehors. Il faut pour cela en général 10 courses en 12 mois, moins avec des championnats ou des nationales.
          Tant que les places ne sont pas remplies, l'indice Ozimut est une moyenne ordinaire, et une course moins bonne que les autres le fait baisser. Pour un
          jeune, une course récente pèse plus que les anciennes qu'elle remplace : moins bonne qu'elles, elle peut faire baisser son indice Ozimut.</span></li>
      </ul>
    </section>

    <section class="mx-slide">
      <p class="mx-kicker">Le recalage</p>
      <h2>Un facteur par jour, jamais revu</h2>
      <p>Sans correction, le niveau général des CN monterait peu à peu d'une année à l'autre ; l'étude explique pourquoi. Le recalage corrige cette
        dérive : chaque score Ozimut est multiplié par un facteur, le même pour toutes les courses d'un même jour dans une même spécialité.</p>
      <ul class="mx-list">
        <li><span>Le facteur est choisi pour que la moyenne des ${pctOf(pf.anchor_top_fraction)} meilleurs indices Ozimut de chaque spécialité reste à
          ${fmt(pf.anchor_target)}, la règle de la FFCO depuis 2026. Il change un peu chaque jour, au lieu d'une fois par an.</span></li>
        <li><span>Pour le calculer, on mesure le niveau des indices Ozimut ${fmt(pf.anchor_lag_months)} mois plus tôt, en moyenne sur 13 mois, puis on le prolonge
          de 10 mois, au rythme auquel il a monté pendant les dix dernières années. Les mois se comptent au calendrier : un mois sans course garde le niveau
          du mois précédent. Le facteur est calculé pour chaque mois ; entre deux mois, il passe en ligne droite de l'un à l'autre. La règle est la même
          dans les quatre spécialités.</span></li>
        <li><span>Le facteur d'une course est fixé une fois pour toutes. Un indice Ozimut ne change donc que quand une course entre dans les 12 derniers mois ou en
          sort, jamais à cause du recalage.</span></li>
      </ul>
      <div style="margin-top:16px">${chartCard({ id: "norm", title: "Le facteur de recalage", hint: "Le facteur appliqué au score Ozimut d'une course, selon son jour et sa spécialité", short: true })}</div>
    </section>

    <section class="mx-slide">
      <p class="mx-kicker" style="--c:var(--s3)">Illustration</p>
      <h2>Mêmes scores, valeurs différentes</h2>
      <p class="mx-lead">Un coureur a couru ${fmt(n)} courses en 12 mois. Voici ses scores, du meilleur au moins bon. Le meilleur, ${fmt(EXAMPLE[0][0])}, est
        un championnat de France (★) ; ${fmt(EXAMPLE[2][0])} est une course nationale. Voici ce que chaque calcul retient de ces mêmes scores.</p>
      ${["official", "top6w"].map((m) => html`<div class="mx-agg" style="${cvar(m)}">
        <div><b>${methodKey(m)} ${exLabel(m)}</b><div class="what">${EX[m].what}</div></div>
        ${chips(m)}
        <div class="cn">${fmt(EX[m].cn)}</div></div>`)}
      <p class="muted" style="font-size:13px">Les nombres en exposant (×2, ×1,5) sont les places prises par la course. L'exemple applique chaque règle aux
        mêmes scores. En réalité, le score officiel et le score Ozimut d'une même course diffèrent, puisque la valeur du circuit n'est pas calculée de la même
        façon.</p>
    </section>`;
  }

  // ======================================================================================================
  // 3. L'étude
  // ======================================================================================================
  function etude() {
    const S = study, L = study?.lineaire;
    const pctCi = (a) => (a ? `${sg(a[0], 1)} % [${sg(a[1], 1)} ; ${sg(a[2], 1)}]` : "—");
    const calib = (tr, g, m) => S?.calib?.[tr]?.[g]?.v?.[m];
    const mark = (kind, label, note) => html`<span class="mx-mark ${kind}">${label}</span>${note ? html`<span class="mx-note">${note}</span>` : ""}`;
    const YES = (x) => mark("yes", "oui", x), NO = (x) => mark("no", "non", x), PART = (x) => mark("part", "en partie", x);
    const CRIT = [
      ["Compte les championnats et les nationales", (m) => (m === "official" ? NO("souvent écartés") : YES("ils pèsent plus"))],
      ["Une course de plus ne fait pas baisser le CN", (m) => (m === "official" ? NO("souvent si") : PART("pour un adulte, une fois les 6 places remplies"))],
      ["Reflète le niveau dans les grandes compétitions", (m) => (m === "official" ? NO("sans les 10 % meilleures") : YES("les meilleures courses"))],
      ["Suit la progression rapide des jeunes", (m) => (m === "official" ? NO("leur CN retarde : une course d'il y a un an compte autant") : YES("leurs anciennes courses s'effacent, dans l'indice comme dans la mesure des circuits"))],
      ["Stable d'une année à l'autre", (m) => (m === "official" ? NO("saut au 1er janvier") : YES("recalage progressif"))],
      ["Simple à expliquer", (m) => (m === "official" ? YES() : YES("des moyennes ordinaires"))],
      ["Fait foi pour les sélections", (m) => (m === "official" ? YES("seul classement officiel") : NO("calcul d'analyse"))],
    ];
    const noStudy = html`<p class="muted">Les chiffres de l'étude ne sont pas disponibles pour le moment.</p>`;
    const pts = (a) => (a ? html`${ci(a)} point` : "—");
    const cell = (a) => (a ? html`${sg(a[0], 2)}${est(a) ? "*" : ""}` : "—");
    const SC = ["all_holdout", "nat_holdout", "all_tuned"];
    const SCH = ["Toutes les courses<br>2012–2024", "Courses nationales<br>2012–2024", "Toutes les courses<br>depuis juillet 2025"];
    const share = (tr) => L?.share?.[tr]?.rows || [];
    const picked = (tr) => L?.picked?.[tr];

    const CH = {
      objectifs: () => html`
        <section class="mx-slide mx-hero">
          <p class="mx-kicker">L'étude</p>
          <h2>Un indice simple à comprendre, qui compte vos meilleures courses et prédit mieux les résultats</h2>
          <p class="mx-lead">Ce chapitre explique pourquoi la méthode Ozimut a été créée, comment elle a été évaluée, quelles idées ont été essayées et
            lesquelles ont été retenues. Il aboutit à la méthode Ozimut : la plus simple de celles qui prédisent le mieux.</p>
          ${hf && hs ? html`<div class="mx-stats">
            <div class="mx-stat"><b>${lvl(hf, "acc", "official")} % puis ${lvl(hf, "acc", "top6w")} %</b><span>des duels bien prédits en forêt par le CN
              officiel, puis par l'indice Ozimut. Un duel, ce sont deux coureurs d'un même circuit ; il est bien prédit quand celui qui avait la meilleure valeur
              finit devant.</span></div>
            <div class="mx-stat"><b>${lvl(hs, "acc", "official")} % puis ${lvl(hs, "acc", "top6w")} %</b><span>des duels bien prédits en sprint, sur les
              mêmes saisons.</span></div>
            <div class="mx-stat"><b>${lvl(hf, "r2", "official")} % puis ${lvl(hf, "r2", "top6w")} %</b><span>des écarts de temps entre coureurs d'un même
              circuit expliqués en forêt par le CN officiel, puis par l'indice Ozimut.</span></div>
            <div class="mx-stat"><b>${fmt(ev.rows.For.all.holdout.comps + ev.rows.Spr.all.holdout.comps)}</b><span>compétitions de ${ev.holdout[0]} à
              ${ev.holdout[1]}, mises de côté pendant la mise au point des méthodes et utilisées seulement pour les juger.</span></div>
          </div>` : ""}
          <p style="margin-top:18px"><a class="mx-dl" href="${PDF}" download>⬇ Télécharger l'étude en PDF (livre blanc)</a></p>
        </section>
        <section class="mx-slide">
          <p class="mx-kicker">Le point de départ</p>
          <h2>Le CN sert à deux choses différentes</h2>
          <div class="mx-grid">
            <div class="mx-box" style="--c:var(--s1)"><h3>Mesurer la difficulté des circuits</h3>
              <p>Pour savoir si un circuit était dur, il faut connaître le <b>niveau habituel</b> des coureurs présents, sans qu'une contre-performance ou un
                exploit isolé le déforme.</p></div>
            <div class="mx-box" style="--c:var(--s3)"><h3>Classer les coureurs</h3>
              <p>Pour les qualifications aux championnats de France, il faut savoir ce dont un coureur est capable <b>dans une grande compétition</b>, donc
                regarder ses meilleures courses.</p></div>
          </div>
          <div class="mx-callout">Le ${cnLabel("official")} sert aux deux usages : il convient au premier et dessert le second. La méthode Ozimut les sépare. Le
            <b>score Ozimut</b> d'une course se mesure sur le niveau habituel des coureurs présents ; l'<b>indice Ozimut</b> d'un coureur retient ses meilleures courses.</div>
        </section>
        <section class="mx-slide">
          <p class="mx-kicker">Les objectifs</p>
          <h2>Ce que la méthode doit faire</h2>
          <ul class="mx-list">
            <li><span>Partir des <b>mêmes résultats et du même score de course</b> que la FFCO, pour que chacun puisse comprendre et vérifier.</span></li>
            <li><span><b>Compter les championnats de France et les courses nationales</b>, que la méthode officielle écarte souvent, parce qu'elle écarte les
              10 % meilleures courses.</span></li>
            <li><span><b>Ne pas pénaliser le coureur qui court une course de plus</b> : une fois ses meilleures courses en place, une course de plus ne
              doit pas faire baisser son CN.</span></li>
            <li><span><b>Supprimer le saut du 1<sup>er</sup> janvier</b>, pour pouvoir suivre un coureur sur plusieurs saisons.</span></li>
            <li><span><b>Suivre les jeunes qui progressent vite</b> : le niveau d'un jeune monte d'une saison à l'autre, et ses courses
              d'il y a dix mois décrivent un coureur plus lent. Son indice doit suivre sa progression, sinon il le classe trop bas et fait paraître
              plus faciles les circuits où il court.</span></li>
            <li><span><b>Mieux prédire les résultats</b>, et le prouver par une mesure fiable.</span></li>
            <li><span><b>Rester simple à expliquer</b> : des moyennes ordinaires, une règle commune, pas un modèle ajusté coureur par coureur. Quand
              une variante plus savante ne gagne que quelques centièmes de point, la règle simple l'emporte.</span></li>
          </ul>
        </section>`,

      depart: () => html`
        <section class="mx-slide" style="${cvar("official")}">
          <p class="mx-kicker">${methodKey("official")} ${methodLabel("official")}</p>
          <h2>La référence : solide pour mesurer, mal adaptée pour classer</h2>
          <div class="mx-grid">
            <div><h3 style="margin-top:4px">Ce qu'elle fait bien</h3><ul class="mx-list">
              <li><span>Elle fait foi : c'est le <b>seul classement officiel</b>, celui des sélections.</span></li>
              <li><span>Elle écarte les scores extrêmes, dans les deux sens : c'est une bonne mesure du <b>niveau habituel</b>, utile pour mesurer la
                difficulté des circuits.</span></li>
              <li><span>Sa règle est publique et simple.</span></li>
              <li><span>Elle donne à chaque coureur une <b>mesure de sa performance par rapport aux autres</b>, course après course.</span></li>
              <li><span>Elle <b>incite chacun à progresser</b> : chaque course compte, et le classement montre les progrès.</span></li>
              <li><span>Elle a <b>lancé la collecte des résultats des compétitions</b>, depuis de nombreuses années ; tous ces résultats ont été publics à un
                moment ou à un autre. Sans ce travail, ni ce site ni cette étude n'existeraient.</span></li>
            </ul></div>
            <div><h3 style="margin-top:4px">Ce qu'elle fait moins bien</h3><ul class="mx-list bad">
              <li><span><b>Elle écarte les 10 % meilleures courses.</b> Pour les meilleurs coureurs, ce sont le plus souvent les championnats de France et
                les nationales : les courses qu'ils préparent, et les plus relevées.</span></li>
              <li><span><b>Elle évalue la performance habituelle plutôt que la performance potentielle</b>, plus pertinente pour les
                qualifications.</span></li>
              <li><span><b>Elle n'incite pas à courir.</b> Pour un coureur bien classé, une course de plus fait souvent baisser le CN. Certains s'arrêtent
                dès qu'ils ont le CN qui les qualifie pour un championnat de France ; d'autres ne courent que les courses qu'ils jugent « rentables ».</span></li>
              <li><span><b>Un saut chaque 1<sup>er</sup> janvier</b>, et des règles qui ont changé au fil des saisons : on ne peut pas comparer les CN d'une
                année à l'autre.</span></li>
              <li><span><b>Toutes les courses pèsent pareil</b>, d'un championnat de France à une régionale.</span></li>
              <li><span><b>Les jeunes progressent plus vite que leur CN.</b> Une course d'il y a dix mois compte autant que celle de la semaine
                dernière : le CN d'un jeune qui progresse retarde sur son niveau, le classe trop bas et fait paraître plus faciles les circuits où il court.</span></li>
            </ul></div>
          </div>
        </section>
        <section class="mx-slide">
          <p class="mx-kicker">En un coup d'œil</p>
          <h2>Chaque méthode, critère par critère</h2>
          <div class="table-wrap"><table class="mx-matrix">
            <thead><tr><th></th>${M.map((m) => html`<th>${methodKey(m)}${methodShort(m)}</th>`)}</tr></thead>
            <tbody>${CRIT.map(([label, cell]) => html`<tr><td>${label}</td>${M.map((m) => html`<td>${cell(m)}</td>`)}</tr>`)}</tbody>
          </table></div>
        </section>
        <section class="mx-slide">
          <p class="mx-kicker" style="--c:var(--s3)">Ce que change la méthode Ozimut</p>
          <h2>Mêmes résultats, mêmes temps, autre calcul</h2>
          <div class="mx-fix">
            <div class="head">Méthode officielle</div><div></div><div class="head">Méthode Ozimut</div>
            <div class="p"><b>Les meilleures courses sont écartées</b>souvent les championnats de France et les nationales</div><div class="arrow">→</div>
            <div class="s"><b>Les meilleures courses comptent le plus</b>un championnat de France compte double, une nationale une fois et demie ; seules
              les moins bonnes courses sont laissées de côté</div>
            <div class="p"><b>Une course de plus peut faire baisser le CN</b>ce qui dissuade de courir</div><div class="arrow">→</div>
            <div class="s"><b>Une fois les ${fmt(p6.top_n)} places remplies, une course de plus ne peut plus faire baisser le CN d'un adulte</b>les places sont remplies par
              les meilleures courses : plus on court, plus on a de chances de bien les remplir</div>
            <div class="p"><b>Le circuit mesuré sur les deux tiers les plus rapides</b>les coureurs qui se sont trompés ne comptent pas, et bien s'orienter
              sur un circuit piégeux rapporte moins qu'ailleurs</div><div class="arrow">→</div>
            <div class="s"><b>La part du peloton réglée par spécialité</b>en forêt, 90 % des coureurs : la difficulté d'un circuit comprend
              les erreurs qu'il provoque, et les éviter rapporte ; en sprint, les deux tiers, comme la FFCO</div>
            <div class="p"><b>Un saut au 1<sup>er</sup> janvier</b>tout le classement change d'un coup</div><div class="arrow">→</div>
            <div class="s"><b>Un recalage progressif, jour après jour</b>le score d'une course est fixé une fois pour toutes, et l'indice d'un adulte ne
              bouge que quand une course entre dans les 12 derniers mois ou en sort</div>
            <div class="p"><b>Le CN d'un jeune retarde sur ses progrès</b>sa course d'il y a onze mois compte autant que celle d'hier, alors qu'il
              courait bien moins vite</div><div class="arrow">→</div>
            <div class="s"><b>Les courses des jeunes s'effacent avec le temps</b>une course courue en catégorie jeune compte de moins en moins au fil des
              12 mois : l'indice d'un jeune suit sa progression bien plus vite, et ses circuits sont mieux mesurés</div>
            <div class="p"><b>Un seul CN pour deux usages</b>mesurer les circuits et classer les coureurs</div><div class="arrow">→</div>
            <div class="s"><b>Un calcul pour chaque usage</b>la valeur d'un circuit se mesure à partir des scores que les coureurs présents ont obtenus
              dans leurs courses précédentes ; l'indice Ozimut retient leurs meilleures courses</div>
          </div>
        </section>`,

      mesure: () => html`
        <section class="mx-slide mx-hero">
          <p class="mx-kicker">Le test</p>
          <h2>Avant la course, qui est favori ? Après, qui a fini devant, et avec quel écart ?</h2>
          <p class="mx-lead">Un bon CN doit annoncer les résultats. Pour chaque coureur, on prend le CN qu'il avait <b>15 jours avant</b> la course : ce
            CN ne sait rien de la course. Puis on regarde, circuit par circuit, si ces CN annonçaient l'ordre d'arrivée et les écarts de temps. Toutes les
            méthodes sont jugées sur les mêmes coureurs : ceux qui avaient un CN dans chacune d'elles.</p>
        </section>
        <section class="mx-slide">
          <p class="mx-kicker">Première mesure</p>
          <h2>La part des duels bien prédits</h2>
          <p>Sur un circuit, chaque paire de coureurs forme un <b>duel</b> : il y a 45 duels entre 10 coureurs, et 11 175 entre 150 coureurs. Le CN prédit
            bien un duel quand le coureur qui avait le CN le plus haut termine devant l'autre. Quand les deux CN sont égaux, le duel compte pour moitié.</p>
          <p>Un CN tiré au hasard prédirait bien la moitié des duels, soit 50 %. Aucun CN ne peut les prédire tous, car la forme du jour et les erreurs
            décident d'une partie des résultats.</p>
          <div class="mx-eq">part des duels bien prédits = duels bien prédits ÷ nombre de duels
            <small>calculée pour chaque circuit, puis moyennée sur tous les circuits, chacun pesant son nombre de coureurs</small></div>
          <p><b>Pourquoi chaque circuit pèse son nombre de coureurs.</b> Chaque coureur affronte tous les autres coureurs de son circuit. La part de ses
            duels bien prédits dit si le CN l'a bien placé parmi eux. En faisant la moyenne de cette part sur tous les coureurs de la saison, on obtient
            exactement la moyenne des circuits pondérée par leur nombre de coureurs : chaque résultat compte une fois. Compter chaque duel une fois donnerait
            trop de poids aux grands circuits, puisqu'un circuit de 150 coureurs pèserait autant que 250 circuits de 10 coureurs. Compter chaque circuit une
            fois en donnerait trop aux petits, puisqu'un circuit de 5 coureurs pèserait autant qu'un circuit de championnat de France.</p>
          <p><b>Le lien avec le τ de Kendall.</b> Les statisticiens mesurent l'accord entre deux classements par le « τ de Kendall » : la part des duels
            bien prédits moins la part des duels mal prédits. Avec 80 % de duels bien prédits, et donc 20 % de mal prédits, τ vaut 0,80 − 0,20 = 0,60.
            C'est la même mesure sur une autre échelle : τ vaut 0 pour un CN tiré au hasard et 1 pour un ordre parfait. Ce document donne la part des
            duels, plus parlante.</p>
          ${hf ? html`<p>En forêt, de ${ev.holdout[0]} à ${ev.holdout[1]}, le CN officiel prédit bien ${lvl(hf, "acc", "official")} % des duels et l'indice Ozimut
            ${lvl(hf, "acc", "top6w")} %. Le CN officiel se trompe donc sur ${fmt(100 * (1 - hf.acc.official), 1)} % des duels, et l'indice Ozimut sur
            ${fmt(100 * (1 - hf.acc.top6w), 1)} % : c'est ${fmt(Math.round(100 * (1 - (1 - hf.acc.top6w) / (1 - hf.acc.official))))} % d'erreurs en moins.
            Les écarts entre les variantes essayées pendant l'étude sont souvent de quelques dixièmes de point.</p>` : ""}
        </section>
        <section class="mx-slide">
          <p class="mx-kicker">Deuxième mesure</p>
          <h2>Les écarts de temps expliqués</h2>
          <p>L'ordre d'arrivée ne dit pas tout : finir 10 secondes ou 10 minutes derrière un autre coureur, ce n'est pas la même chose. Or un CN se lit comme
            une vitesse : un coureur dont le CN est 10 % plus haut doit courir environ 10 % plus vite. Sur chaque circuit, on compare donc le temps de chaque
            coureur au temps que son CN annonçait.</p>
          <ul class="mx-list">
            <li><span><b>Les temps se comparent en proportion.</b> Perdre 5 minutes sur un sprint de 15 minutes n'est pas la même chose que perdre 5 minutes
              sur une longue distance de 90 minutes. Les écarts sont donc mesurés en pourcentage du temps, et non en minutes.</span></li>
            <li><span><b>La part expliquée</b>, notée R², dit quelle part des différences de temps entre les coureurs d'un même circuit le CN annonçait : 0 %
              si le CN n'annonce rien, 100 % si chaque coureur a mis exactement le temps annoncé. Là aussi, chaque résultat compte une fois.</span></li>
            <li><span><b>La règle qui traduit un écart de CN en écart de temps est apprise sur la saison précédente.</b> Chaque saison est ainsi prédite sans
              qu'on l'ait regardée, comme le serait la saison à venir.</span></li>
          </ul>
          ${more("La formule", html`<div class="mx-eq">ln(temps) = constante du circuit − b × ln(CN) + écart
            <small>ln : le logarithme, qui transforme les rapports en différences. La constante tient compte de la longueur et de la difficulté du circuit ;
              b, proche de 1, est apprise sur la saison précédente. R² = 1 − (somme des écarts²) ÷ (somme des écarts de ln(temps) à la moyenne du circuit)².</small></div>`)}
        </section>
        <section class="mx-slide">
          <p class="mx-kicker">La marge d'incertitude</p>
          <h2>Un écart est-il réel, ou dû au hasard des courses ?</h2>
          <p>Les courses d'une saison ne sont qu'un échantillon de toutes les courses possibles. Avec d'autres courses, l'écart entre deux méthodes aurait été
            un peu différent. Pour savoir de combien, on refait le calcul ${ev ? fmt(ev.boot) : "2 000"} fois sur des saisons tirées au sort. Chaque tirage
            prend autant de compétitions que la saison réelle, choisies au hasard parmi elles : certaines sortent deux fois, d'autres pas du tout.</p>
          <ul class="mx-list">
            <li><span><b>L'intervalle à 95 %</b>, écrit entre crochets après chaque écart, va du plus petit au plus grand écart obtenu dans 95 % de ces
              tirages. Par exemple, « +0,40 [+0,35 ; +0,44] » veut dire que l'écart mesuré est de 0,40 point, et que 95 % des tirages donnent entre 0,35 et
              0,44 point.</span></li>
            <li><span><b>Un écart est dit significatif quand son intervalle ne contient pas 0.</b> Presque tous les tirages donnent alors un écart du même
              signe : le hasard des courses ne suffit pas à l'expliquer. Quand l'intervalle contient 0, par exemple [−0,02 ; +0,01], on ne peut pas dire
              laquelle des deux méthodes est la meilleure.</span></li>
            <li><span><b>On tire des compétitions entières, pas des duels.</b> Les coureurs d'une même course partagent le terrain, la carte et la météo :
              leurs duels ne sont pas indépendants. Les tirer un par un donnerait des intervalles trop étroits, donc trop optimistes.</span></li>
            <li><span><b>Les méthodes sont comparées sur les mêmes coureurs et les mêmes courses</b>, course par course.</span></li>
            <li><span><b>Des saisons mises de côté.</b> Les réglages ont été choisis sur la période de juillet 2025 à octobre 2026. Les saisons
              ${ev ? `${ev.holdout[0]} à ${ev.holdout[1]}` : "2012 à 2024"} n'ont servi qu'à juger : les réglages n'ont pas pu s'adapter à leurs
              particularités, comme un examen fait de questions jamais vues à l'entraînement.</span></li>
            <li><span>Chaque variante est recalculée depuis 2010 sur une copie de la base de données, avec son propre recalage. Les CN de 15 jours avant la
              course sont ceux qu'elle aurait publiés.</span></li>
          </ul>
          <p class="muted" style="font-size:13px">Les tableaux
            datés du 6 et du 7 octobre, repliés dans les chapitres suivants, viennent de la mise au point : chaque duel y comptait une fois, sans intervalle.</p>
        </section>`,

      choix: () => html`
        <section class="mx-slide mx-hero">
          <p class="mx-kicker">Les choix</p>
          <h2>Chaque réglage a été mesuré, et la règle la plus simple gardée quand elle fait aussi bien</h2>
          <p class="mx-lead">Chaque variante a été recalculée depuis 2010 sur une copie de la base de données, puis jugée comme la méthode retenue, sur
            les mêmes coureurs. Les écarts sont en points de duels bien prédits, de 2012 à 2024 sauf mention ; un astérisque ou un intervalle qui ne
            contient pas 0 marquent un écart significatif.</p>
        </section>
        <section class="mx-slide">
          <p class="mx-kicker">Les poids et les places</p>
          <h2>Les meilleures courses comptent, chacune selon son importance</h2>
          <ul class="mx-list">
            <li><span><b>Le poids d'une course suit le nom de la compétition.</b> Un championnat de France a un poids de ${fmtW(pf.weights.cdf)} : c'est la
              course la plus relevée, celle que les coureurs préparent, et elle compte comme deux courses. Une course nationale a un poids de
              ${fmtW(pf.weights.national)}, toute autre course un poids de ${fmtW(pf.weights.other)}. Les niveaux A, B, C et D de la FFCO ne sont pas utilisés.</span></li>
            <li><span><b>${fmt(p6.top_n)} places</b>, remplies du meilleur score au moins bon. Une fois les places remplies, une course de plus ne peut pas faire baisser le CN d'un adulte.
              Le classement mondial de l'IOF fonctionne de la même façon, avec les cinq meilleures courses. Dix places ne faisaient pas mieux ; quatre
              faisaient moins bien (−0,24 point en forêt).</span></li>
            <li><span><b>Seuls les ${pctOf(pf.eligible_fraction)} meilleurs scores</b> des 12 derniers mois peuvent compter, pour l'indice Ozimut comme pour le
              niveau habituel, et il faut au moins ${fmt(pf.min_scores)} courses. Les scores laissés de côté sont, pour l'essentiel, les courses où le coureur
              s'est trompé. Regarder 70 ou 80 % des scores coûtait de 0,4 à 1 point ; 50 % faisait jeu égal. Exiger cinq courses réduisait le nombre de
              coureurs qui mesurent les circuits ; se contenter de deux classait plus de coureurs, mais coûtait de 0,1 à 0,4 point.</span></li>
          </ul>
          ${L?.eligible_grid ? html`<p>La part de scores qui fait le niveau habituel a été mesurée à part, l'indice Ozimut gardant ses 60 % : en forêt, contre les
            60 % meilleurs, les 50 % font ${pts(L.eligible_grid.For[50].all_holdout)}, les 70 % ${pts(L.eligible_grid.For[70].all_holdout)}, les 80 %
            ${pts(L.eligible_grid.For[80].all_holdout)} et tous les scores ${pts(L.eligible_grid.For[100].all_holdout)}. En sprint, de 50 à 80 % se valent.
            Les erreurs d'un coureur doivent rester hors du niveau qui mesure les circuits.</p>` : ""}
        </section>
        <section class="mx-slide">
          <p class="mx-kicker">Le niveau habituel</p>
          <h2>Les circuits se mesurent sur le niveau habituel, pas sur les indices Ozimut</h2>
          <p>Le classement mondial de l'IOF mesure une course d'après les points de classement des coureurs présents. Ici, ce n'est pas possible avec les
            indices Ozimut, parce qu'ils ne retiennent que les meilleures courses : ils se nourriraient d'eux-mêmes. Un groupe qui court surtout entre soi, comme les
            vétérans ou les jeunes, aurait des CN tirés vers le haut, ses circuits paraîtraient plus difficiles, et ses CN monteraient encore. Dans les
            premiers essais, les H/D 21 se trouvaient ainsi sous-évalués de 13 % environ.</p>
          <p>Les circuits se mesurent donc sur le niveau habituel : la moyenne pondérée des ${pctOf(pf.eligible_fraction)} meilleurs scores, sans limite de
            places. ${S ? html`Mesurés avec les indices Ozimut, les duels seraient moins bien prédits (${ci(S.onecn?.For?.all_holdout?.ST6_t)} point de 2012 à 2024,
            ${ci(S.onecn?.For?.all_tuned?.ST6_t)} depuis juillet 2025, une perte qui grandit au fil des saisons), et les jeunes surévalués de
            ${fmt(Math.abs(calib("For", "young", "ST6_t")?.[0] ?? 1.4), 1)} % face aux H/D 21.` : ""}</p>
        </section>
        ${S?.jeunes ? html`<section class="mx-slide" style="${cvar("top6w")}">
          <p class="mx-kicker">Les courses des jeunes</p>
          <h2>Un jeune progresse vite : ses anciennes courses comptent de moins en moins</h2>
          <p>Le CN d'un jeune retarde sur son niveau. Un an et demi plus tard, le niveau habituel d'un jeune a monté de 22 % en forêt, celui d'un adulte
            de 11 % (la montée générale de l'échelle comprise) : ses courses d'il y a dix mois décrivent un coureur plus lent. Une course courue en catégorie jeune (H et D jusqu'à 20 ans) compte dans la moyenne pour 1 − son âge ÷ la fenêtre, les courses des adultes
            gardant leur poids ; dans le niveau habituel, qui mesure les circuits, comme dans l'indice Ozimut.</p>
          <ul class="mx-list">
            <li><span><b>Forêt</b> : ${pts(S.jeunes.J.For.holdout)} de 2012 à 2024, mieux dans ${S.jeunes.J.For.better} saisons sur ${S.jeunes.J.For.seasons},
              ${pts(S.jeunes.J.For.tuned)} depuis juillet 2025.</span></li>
            <li><span><b>Sprint</b> : ${pts(S.jeunes.J.Spr.holdout)} de 2012 à 2024, rien de significatif depuis juillet 2025
              (${ci(S.jeunes.J.Spr.tuned)}).</span></li>
            <li><span><b>VTT</b> : ${pts(S.jeunes.J.VTT.holdout)} de 2012 à 2024, ${pts(S.jeunes.J.VTT.tuned)} depuis juillet 2025.</span></li>
          </ul>
          <p>Faire vieillir les courses de tous les coureurs apporte peu : au mieux ${pts(S.jeunes.adults_best.For.holdout)} en forêt (le poids divisé par
            deux tous les six mois), et rien de plus une fois les courses des jeunes effacées (${pts(S.jeunes.adults_and_juniors.For.holdout)} avec les deux,
            ${pts(S.jeunes.J.For.holdout)} avec les jeunes seuls). Le niveau d'un adulte bouge peu d'une saison à l'autre : une course de l'an dernier le
            renseigne encore. Une fenêtre de deux ans fait ${pts(S.jeunes.window24.For.holdout)} en forêt ; effacer les courses dans l'indice Ozimut seul, sans
            toucher au niveau habituel, ${pts(S.jeunes.top_only.For.holdout)}. Le prix : en forêt, les jeunes sont un peu plus souvent annoncés devant les
            H/D 21-34 qu'ils ne finissent devant (${sg(S.jeunes.J.For.junior_bias[0], 1)} points avant, ${sg(S.jeunes.J.For.junior_bias[1], 1)} après) ; en
            sprint et en VTT, où ils étaient sous-évalués, l'écart se réduit.</p>
        </section>` : ""}
        ${S?.ecarts ? html`<section class="mx-slide">
          <p class="mx-kicker">Les coureurs loin de leur niveau</p>
          <h2>Les écarter de la mesure des circuits ne vaut pas la peine</h2>
          <p>Sur un circuit, quelques coureurs finissent loin de ce que leur niveau habituel laisse prévoir : bien plus vite, souvent des jeunes en progrès
            dont le niveau était en effet trop bas (un an plus tard, 17 à 19 % au-dessus des autres coureurs de leur âge), ou bien plus lentement, après une
            erreur. L'étude du 18 octobre 2026 a essayé, sur 28 règles, de les écarter de la valeur du circuit : d'un côté ou des deux, au-delà d'un seuil ou
            en part fixe, et de ne plus laisser les jeunes mesurer les circuits.</p>
          <ul class="mx-list">
            <li><span><b>N'écarter que les plus rapides</b> fait monter les circuits des jeunes, donc leurs CN, donc la mesure de leurs circuits suivants : en
              forêt, les circuits des jeunes finissent jusqu'à ${fmt(S.ecarts.loop_fast_25[0], 0)} % au-dessus de ceux des adultes, et la prédiction recule
              (${pts(S.ecarts.fast_25.For.holdout)}, ${pts(S.ecarts.fast_5.For.holdout)} au seuil de 5 %).</span></li>
            <li><span><b>Écarter les deux côtés</b> coûte en forêt (${pts(S.ecarts.both_25.For.holdout)}) ; en sprint, ajouté à l'écart des jeunes, il gagne
              ${pts(S.ecarts.both_and_no_juniors.Spr.holdout)}, et ${pts(S.ecarts.both_and_no_juniors.VTT.holdout)} en VTT.</span></li>
          </ul>
          <p>Ces gains demanderaient deux règles de plus dans la mesure des circuits, à expliquer et à tenir à jour, pour corriger le même défaut que
            l'effacement des courses des jeunes : un CN de jeune en retard sur son niveau. La méthode garde la mesure des circuits telle quelle et traite ce
            retard là où il naît, dans le CN.</p>
        </section>` : ""}
        <section class="mx-slide" style="${cvar("top6w")}">
          <p class="mx-kicker">La valeur du circuit</p>
          <h2>Quelle part du peloton mesure le circuit</h2>
          <p>La règle de la FFCO mesure un circuit sur les deux tiers les plus rapides. Le dernier tiers réunit des coureurs plus faibles, qui ont couru à
            leur niveau, et des coureurs qui se sont trompés. En les écartant, on mesure la difficulté du circuit couru presque sans erreur ; or certains
            circuits provoquent bien plus d'erreurs que d'autres, et sur ces circuits tous les scores sortent trop bas. En forêt, la valeur mesurée sur tout le
            peloton dépasse celle des deux tiers de 4,8 % en moyenne, mais presque pas sur un circuit sur dix et de plus de 10 % sur un autre sur dix ;
            en sprint, de 2,8 %.</p>
          <p>La part des plus rapides a donc été réglée dans chaque spécialité, par un seul critère : la part qui prédit le mieux les duels de 2012 à 2024,
            sans perte significative depuis juillet 2025.</p>
          ${L ? html`<div class="table-wrap"><table class="data compact"><thead><tr><th class="r">Part du peloton</th>
            ${["For", "Spr", "VTT"].map((tr) => html`<th class="r">${t(`terrain.${tr}`)}<br>2012–2024</th><th class="r">${t(`terrain.${tr}`)}<br>depuis 2025</th>`)}</tr></thead>
            <tbody>${share("For").map((r0) => html`<tr><td class="r">${r0.pct === 67 ? "les deux tiers (FFCO)" : r0.pct === 100 ? "tout le peloton" : `${fmt(r0.pct)} %`}</td>
              ${["For", "Spr", "VTT"].map((tr) => { const r = share(tr).find((x) => x.pct === r0.pct); const on = picked(tr) === r0.pct;
                return r ? html`<td class="r num">${on ? html`<b>${cell(r.all_holdout)}</b>` : cell(r.all_holdout)}</td><td class="r num">${on ? html`<b>${cell(r.all_tuned)}</b>` : cell(r.all_tuned)}</td>` : html`<td class="r">—</td><td class="r">—</td>`; })}</tr>
              ${r0.pct === 85 ? (L.forest90 ? html`<tr><td class="r"><b>90 %</b></td><td class="r num"><b>${sg(L.share.For.rows.find((x) => x.pct === 100).all_holdout[0] + L.forest90.vs100.all_holdout[0], 2)}*</b></td>
                <td class="r num"><b>${sg(L.share.For.rows.find((x) => x.pct === 100).all_tuned[0] + L.forest90.vs100.all_tuned[0], 2)}*</b></td><td class="r">—</td><td class="r">—</td><td class="r">—</td><td class="r">—</td></tr>` : "") : ""}`)}

            </tbody></table></div>
          <p class="muted" style="font-size:13px">Écart de la part des duels bien prédits, en points, face aux deux tiers les plus rapides, avec la méthode Ozimut
            (moyennes ordinaires, recalage prolongé). Un astérisque marque un écart significatif ; en gras, la part retenue. Le ski suit le VTT : il a trop
            peu de courses pour être mesuré.</p>
          <ul class="mx-list">
            <li><span><b>Forêt : 90 %.</b> Plus la part grandit, mieux la méthode prédit : tout le peloton gagne ${pts(share("For").find((x) => x.pct === 100)?.all_holdout)}
              sur les deux tiers, et 90 % gagnent encore ${pts(L.forest90?.vs100?.all_holdout)} sur tout le peloton (${pts(L.forest90?.vs100?.nat_holdout)} sur les
              courses nationales), mieux dans ${fmt(L.forest90?.vs100?.better ?? 0)} saisons sur 15, moins bien dans ${fmt(L.forest90?.vs100?.worse ?? 0)}.
              Le dernier dixième du peloton, ce sont les courses très perdues : les laisser de côté ne retire rien à la mesure du circuit, et évite qu'un
              seul coureur égaré la porte.</span></li>
            <li><span><b>Sprint : les deux tiers</b>, la règle de la FFCO. Rien ne fait mieux sur les quinze saisons ; 75 % perd un peu, tout le peloton
              ${pts(share("Spr").find((x) => x.pct === 100)?.all_holdout)}. Les erreurs y sont deux fois plus rares qu'en forêt, et les plus lents y renseignent
              moins sur le circuit que sur eux-mêmes.</span></li>
            <li><span><b>VTT : 75 %.</b> 85 % fait le mieux de 2012 à 2024 (${pts(share("VTT").find((x) => x.pct === 85)?.all_holdout)}), mais perd
              ${pts(share("VTT").find((x) => x.pct === 85)?.all_tuned)} depuis juillet 2025 ; 75 % gagne ${pts(share("VTT").find((x) => x.pct === 75)?.all_holdout)}
              et ne perd rien de significatif depuis. <b>Ski : 75 %</b>, comme le VTT.</span></li>
          </ul>` : noStudy}
        </section>
        <section class="mx-slide">
          <p class="mx-kicker">Le recalage</p>
          <h2>Un facteur prolongé au rythme de la montée du niveau</h2>
          <p>Le CN d'un coureur est fait de ses meilleures courses : il est un peu au-dessus de ses courses ordinaires. Les circuits suivants sont mesurés avec
            ces niveaux un peu hauts, leurs scores sortent un peu plus hauts, et les CN qui en découlent aussi : avant recalage, le niveau général monte de
            quelques dixièmes de pour cent par mois. Le recalage le ramène à ${fmt(pf.anchor_target)}. Mais le facteur d'un jour est calculé sur le niveau
            mesuré avant ce jour, et chaque CN résume lui-même un an de courses : au total il corrigeait le niveau tel qu'il était 18 à 20 mois plus tôt, et le
            niveau publié dépassait la cible de 7 % en forêt.</p>
          <p>La correction retenue prolonge la moyenne des 13 mois au rythme moyen de la montée des dix dernières années. Ce rythme change très peu d'un mois
            à l'autre, le facteur reste régulier, et depuis 2018 le niveau publié reste en moyenne à 2 % de ${fmt(pf.anchor_target)} en forêt et en VTT, à 3 % en sprint (jusqu'à 6 à 9 %
            après les saisons Covid, dont le peu de courses a dérangé le rythme de la montée). Un
            facteur qui fait des à-coups met les scores de deux mois voisins à des niveaux différents : une droite recalculée chaque mois coûtait 0,06 point.
            ${L?.recalage_gain ? html`Appliquée à la méthode retenue, la correction gagne ${pts(L.recalage_gain.For)} de duels en forêt et ne change rien de
            significatif ailleurs.` : ""} Les valeurs ramenées à 5 600 sont les indices Ozimut, ceux qui sont publiés, et non les niveaux habituels.</p>
        </section>
        <section class="mx-slide" style="--c:var(--bad)">
          <p class="mx-kicker">Mesuré, puis écarté</p>
          <h2>Les autres idées, et ce qu'elles ont donné</h2>
          <ul class="mx-list bad">
            <li><span><b>La valeur du circuit en moyenne géométrique</b> (avec le niveau habituel en moyenne cubique) : face à la méthode Ozimut, sur les
              mêmes coureurs, −0,02 point de duels en forêt et +0,15 [0,10 ; 0,20] en sprint. Un peu meilleure en sprint, elle a été écartée parce que la
              moyenne ordinaire se refait à la main : pour quelques centièmes de point, la règle simple l'emporte. Ce qui faisait la différence entre les
              méthodes, c'était la part du peloton qui mesure le circuit, pas la façon d'en faire la moyenne.</span></li>
            <li><span><b>Rendre le retard plus cher</b> (le temps élevé à une puissance, 7 octobre 2026) : un gain jusqu'à la puissance 2, puis plus rien ;
              c'était en fait changer les moyennes du circuit et du niveau habituel, comme la variante précédente.</span></li>
            <li><span><b>Une règle propre à chaque circuit pour traduire le temps en score</b>, estimée sur le circuit lui-même : moins bien
              (${pts(S?.onecn?.For?.all_holdout?.IK_t)} en forêt, ${pts(S?.onecn?.Spr?.all_holdout?.IK_t)} en sprint) ; sur une vingtaine de coureurs,
              l'estimation est trop incertaine.</span></li>
            <li><span><b>Donner plus de poids aux courses qui départagent mieux les coureurs</b> : pas de différence significative.</span></li>
            <li><span><b>Un score qui pénalise moins les très grosses pertes de temps</b> : un peu mieux en forêt, nettement moins bien en sprint.</span></li>
            <li><span><b>Le niveau estimé par un modèle statistique</b> qui sépare la forme du jour et les erreurs : meilleur en sprint
              (${S ? sg(S.mle_fit.Spr[0], 2) : "+0,37"} point), nettement moins bon en forêt (${S ? sg(S.mle_fit.For[0], 2) : "−1,62"} point) : en forêt, se
              tromper souvent est un trait du coureur.</span></li>
            <li><span><b>Atténuer les temps aberrants</b> (une méthode statistique dite de Huber) ou n'écarter que les 15 % les plus lents, au lieu de régler
              la part du peloton : environ 0,1 point de moins.</span></li>
            <li><span><b>Une valeur de circuit commune aux circuits de même longueur en sprint</b> : l'allure n'est pas comparable d'un circuit à l'autre.</span></li>
            <li><span><b>Un score fondé sur l'écart au temps moyen du circuit</b>, à la façon du classement mondial de l'IOF : moins bon que le score de la FFCO.</span></li>
            <li><span><b>Un recalage qui réagit à ses propres effets</b> : il oscillait d'un mois à l'autre.</span></li>
          </ul>
        </section>`,

      resultats: () => html`
        <section class="mx-slide mx-hero">
          <p class="mx-kicker">Les résultats</p>
          <h2>Contre le classement officiel, sur quinze saisons qui n'ont pas servi aux réglages</h2>
          ${ev ? html`<p class="mx-lead">De ${ev.holdout[0]} à ${ev.holdout[1]}, sur les mêmes coureurs, l'indice Ozimut prédit bien ${lvl(hf, "acc", "top6w")} % des
            duels en forêt contre ${lvl(hf, "acc", "official")} % pour le CN officiel, et ${lvl(hs, "acc", "top6w")} % contre ${lvl(hs, "acc", "official")} % en
            sprint. Il explique aussi bien mieux les écarts de temps entre coureurs.</p>` : ""}
        </section>
        ${ev ? html`<section class="mx-slide">
          <p class="mx-kicker">Contre le classement officiel</p>
          <h2>Les chiffres</h2>
          <div class="table-wrap"><table class="data compact"><thead><tr><th></th><th class="r" colspan="2">Forêt</th><th class="r" colspan="2">Sprint</th></tr>
            <tr><th></th><th class="r">${methodShort("official")}</th><th class="r">${methodShort("top6w")}</th><th class="r">${methodShort("official")}</th><th class="r">${methodShort("top6w")}</th></tr></thead>
            <tbody>
              <tr><td>duels bien prédits</td><td class="r num">${lvl(hf, "acc", "official")} %</td><td class="r num"><b>${lvl(hf, "acc", "top6w")} %</b></td><td class="r num">${lvl(hs, "acc", "official")} %</td><td class="r num"><b>${lvl(hs, "acc", "top6w")} %</b></td></tr>
              <tr><td>écarts de temps expliqués</td><td class="r num">${lvl(hf, "r2", "official")} %</td><td class="r num"><b>${lvl(hf, "r2", "top6w")} %</b></td><td class="r num">${lvl(hs, "r2", "official")} %</td><td class="r num"><b>${lvl(hs, "r2", "top6w")} %</b></td></tr>
              <tr><td>gain de l'indice Ozimut en duels, toutes les courses</td><td class="r num" colspan="2">${dci(hf, "top6w-official", "acc")}</td><td class="r num" colspan="2">${dci(hs, "top6w-official", "acc")}</td></tr>
              <tr><td>gain de l'indice Ozimut en duels, courses nationales</td><td class="r num" colspan="2">${dci(hfn, "top6w-official", "acc")}</td><td class="r num" colspan="2">${dci(hsn, "top6w-official", "acc")}</td></tr>
              <tr><td>gain de l'indice Ozimut en écarts de temps expliqués</td><td class="r num" colspan="2">${dci(hf, "top6w-official", "r2")}</td><td class="r num" colspan="2">${dci(hs, "top6w-official", "r2")}</td></tr>
              <tr><td>saisons où le gain de l'indice Ozimut est significatif</td><td class="r num" colspan="2">${evWins("For").join(" sur ")}</td><td class="r num" colspan="2">${evWins("Spr").join(" sur ")}</td></tr>
            </tbody></table></div>
          <p class="muted" style="font-size:13px">Saisons ${ev.holdout[0]} à ${ev.holdout[1]} : ${fmt(ev.rows.For.all.holdout.comps)} compétitions en forêt et
            ${fmt(ev.rows.Spr.all.holdout.comps)} en sprint, les mêmes coureurs pour chaque méthode, chaque circuit pesant son nombre de coureurs. Les gains
            sont en points, avec leur intervalle à 95 %. Ces chiffres sont recalculés à chaque mise à jour du site.</p>
        </section>
        <section class="mx-slide" id="saisons">
          <p class="mx-kicker">Saison après saison</p>
          <h2>L'écart entre deux méthodes, chaque saison, avec sa marge</h2>
          <div class="filters" id="ev-controls"></div>
          <div class="grid grid-2" id="ev-seasons"></div>
          <p class="muted" style="font-size:13px">Chaque ligne est une saison. Le point est l'écart entre les deux méthodes, en points ; le trait est son
            intervalle à 95 %. Un point à droite de la ligne zéro est en faveur de la première méthode nommée. En vert, un écart significatif en faveur de la
            première méthode ; en rouge, en faveur de la seconde ; en gris, un écart non significatif. Seuls comptent les circuits d'au moins ${ev.min_runners}
            coureurs qui ont un CN dans chaque méthode. Avant 2026, la méthode officielle est le classement commun forêt et sprint de la FFCO.</p>
        </section>
        <section class="mx-slide" id="periodes">
          <p class="mx-kicker">Les deux méthodes</p>
          <h2>Pendant les saisons mises de côté, et pendant la mise au point</h2>
          <div id="ev-periods"></div>
        </section>` : html`<section class="mx-slide"><p>${t("me.val.none")}</p></section>`}
        <section class="mx-slide">
          <p class="mx-kicker">Les jeunes et les vétérans</p>
          <h2>Aucun groupe favorisé</h2>
          <p>Un CN juste ne doit favoriser aucun groupe. Pour le vérifier, on cherche, pour les jeunes (20 ans et moins) et pour les vétérans (55 ans et plus),
            de combien il faudrait corriger leur CN pour qu'il prédise au mieux leurs duels contre les H/D 21. ${S ? html`En forêt, le CN officiel sous-évalue
            les jeunes de ${pctCi(calib("For", "young", "official"))} : leurs circuits provoquent beaucoup d'erreurs, que la mesure sur les deux tiers les plus
            rapides laisse de côté. Mesurée sur tout le peloton, la valeur des circuits les remettait à leur place (étude du 13 octobre). Les vétérans restent surévalués de 8 à 9 % par toutes
            les méthodes, la méthode officielle comprise : la cause n'est pas la mesure du circuit et demanderait une étude à part.` : ""}</p>
        </section>
        <section class="mx-slide">
          <p class="mx-kicker">Accord entre méthodes</p>
          <h2>Des classements proches, pas identiques</h2>
          <p>Chaque point est un coureur au dernier classement publié : en largeur son CN officiel, en hauteur son indice Ozimut. Les points proches
            de la diagonale ont à peu près la même valeur dans les deux méthodes.</p>
          <div class="filters" id="agr-filters"></div>
          <div class="grid grid-main-side" style="align-items:start">
            ${chartCard({ id: "agr", title: "Le même coureur dans deux méthodes", hint: "Chaque point est un coureur, au dernier classement publié", tall: true })}
            <section class="card"><div class="card-head"><h2>Écarts entre méthodes</h2></div><div id="agr-stats"></div>
              <div class="card-body"><p class="muted" style="font-size:13px;margin:0">Corrélation : 1 quand les deux CN sont exactement proportionnels, 0 quand
                ils n'ont aucun rapport. Écart moyen : de combien le second CN dépasse le premier, en moyenne. Écart moyen absolu : de combien les deux CN
                diffèrent en moyenne, dans un sens ou dans l'autre.</p></div></section>
          </div>
        </section>`,

      conclusion: () => html`
        <section class="mx-slide" style="${cvar("top6w")}">
          <p class="mx-kicker">La méthode retenue</p>
          <h2>Les règles en bref</h2>
          <ul class="mx-list">
            <li><span><b>Niveau habituel</b> : pour chaque coureur, 15 jours avant la course, la moyenne pondérée de ses ${pctOf(pf.eligible_fraction)} meilleurs
              scores Ozimut des 12 derniers mois, chacun selon son poids, sans limite de places (en VTT et en ski : 70 % des scores, sur deux et trois ans), une
              course courue en catégorie jeune comptant pour 1 − son âge ÷ la fenêtre. Ce n'est pas un classement, mais une étape du calcul de la valeur
              des circuits.</span></li>
            <li><span><b>Valeur Ozimut du circuit</b> : la moyenne des produits niveau habituel × temps des coureurs les plus rapides ayant un niveau :
              ${shareName(own(pf, "For", "sample_fraction") ?? 2 / 3)} en forêt, ${shareName(own(pf, "Spr", "sample_fraction") ?? 2 / 3)} en sprint,
              ${shareName(own(pf, "VTT", "sample_fraction") ?? 2 / 3)} en VTT et en ski ; au moins ${fmt(pf.min_ranked)} coureurs, tous les
              ${fmt(pf.min_ranked)} quand il n'y en a que ${fmt(pf.min_ranked)}.</span></li>
            <li><span><b>Score Ozimut</b> : la valeur Ozimut du circuit divisée par le temps, multipliée par le facteur de recalage du jour, et fixée une fois pour toutes.
              Un poinçon manquant, un abandon, une disqualification ou un hors-délai donnent 0, qui compte.</span></li>
            <li><span><b>Indice Ozimut</b> : les meilleurs scores Ozimut, parmi les ${pctOf(pf.eligible_fraction)} meilleurs des 12 derniers mois, remplissent
              ${fmt(p6.top_n)} places : ${fmtW(pf.weights.cdf)} pour un championnat de France, ${fmtW(pf.weights.national)} pour une course nationale,
              ${fmtW(pf.weights.other)} pour une autre course. L'indice Ozimut est la moyenne pondérée des scores retenus, chacun compté autant de fois qu'il a de
              places ; une course courue en catégorie jeune y compte pour 1 − son âge ÷ la fenêtre. Il faut au moins ${fmt(pf.min_scores)} courses.</span></li>
            <li><span><b>Recalage</b> : chaque jour, un facteur maintient à ${fmt(pf.anchor_target)} la moyenne des ${pctOf(pf.anchor_top_fraction)} meilleurs indices Ozimut
              de chaque spécialité. Il est calculé sur le niveau mesuré deux mois plus tôt, en moyenne sur 13 mois, prolongé de 10 mois au rythme de la montée
              des dix dernières années, dans les quatre spécialités ; les mois se comptent au calendrier.</span></li>
          </ul>
          <p>Les règles complètes sont dans l'onglet <a href="#/documentation?onglet=top" data-tab-link="top">Méthode Ozimut</a>.</p>
          <p><a class="mx-dl" href="${PDF}" download>⬇ Télécharger l'étude en PDF (livre blanc)</a></p>
        </section>
        <section class="mx-slide">
          <p class="mx-kicker">Pourquoi celle-là</p>
          <h2>La plus simple de celles qui prédisent le mieux</h2>
          <p>Toutes les variantes essayées en octobre 2026 se tiennent en quelques dixièmes de point de duels bien prédits, et les meilleures en quelques
            centièmes. À ce niveau, un gain ne se voit plus dans un classement, mais une règle compliquée se voit dans chaque explication. La méthode retenue
            garde donc le score de la FFCO et des moyennes ordinaires, et ne change que ce qui compte vraiment : les meilleures courses retenues sur six places,
            une part du peloton réglée par spécialité pour mesurer les circuits, et un recalage continu. Elle gagne plus de deux points de duels sur le CN
            officiel en forêt comme en sprint.</p>
          <div class="mx-verdict">
            <div class="mx-box" style="${cvar("top6w")}"><h3>Classer, qualifier, sélectionner</h3>
              <div class="who">${cnLabel("top6w")}</div>
              <p>Ce dont le coureur est capable à son meilleur, nourri par les grandes compétitions ; une fois ses 6 places remplies, une course de plus ne
                fait pas baisser celui d'un adulte.</p></div>
            <div class="mx-box" style="${cvar("top6w")}"><h3>Prédire qui finira devant</h3>
              <div class="who">${cnLabel("top6w")}</div>
              <p>Nettement devant la méthode officielle : plus de 2 points de duels bien prédits de plus, en forêt comme en sprint.</p></div>
            <div class="mx-box" style="${cvar("official")}"><h3>Mesurer la difficulté d'un circuit</h3>
              <div class="who">Les scores déjà courus</div>
              <p>Le niveau habituel des coureurs présents, tiré de leurs courses précédentes, sur les plus rapides du peloton, sans la limite de places qui
                fausserait la mesure.</p></div>
            <div class="mx-box" style="${cvar("official")}"><h3>Faire foi</h3>
              <div class="who">${cnLabel("official")}</div>
              <p>Le seul classement officiel, celui des sélections, quelles que soient ses limites.</p></div>
          </div>
          <p class="muted" style="font-size:13px;margin-top:14px">Les données proviennent du site du classement national de la FFCO ; une course absente, mal
            saisie ou corrigée ensuite peut expliquer un écart. La méthode Ozimut part des CN de 2010 : ses premiers mois reflètent
            surtout ce point de départ. Ses indices ne remplacent en aucun cas le classement officiel.</p>
        </section>`,
    };
    return html`<p style="margin:0 0 12px"><a href="#/documentation?onglet=top" data-tab-link="top">← Méthode Ozimut</a></p>${buildChapters(STUDY_CHAPTERS, CH, "objectifs")}`;
  }

  // ======================================================================================================
  // 5. Le tracé (Organisation › Tracer): a guide that needs nothing else — starting, the map, the screen, the tools, courses,
  //    descriptions, specials, printing, checks, teamwork, after the race, every menu entry — and its calculations, in plain words
  // ======================================================================================================
  function tracerDoc() {
    const CHAPTERS = [["principe", "Pour commencer"], ["carte", "La carte"], ["fonds", "Fonds et relief"], ["ecran", "L'écran"], ["postes", "Les postes"], ["circuits", "Les circuits"],
      ["definitions", "Les définitions"], ["speciaux", "Objets spéciaux"], ["sorties", "Imprimer et exporter"], ["verifier", "Vérifier"], ["itineraires", "Les itinéraires"],
      ["outils", "En équipe et sur le terrain"], ["apres", "Après la course"], ["ruban", "Le ruban"], ["avance", "Le niveau avancé"], ["calculs", "Ses calculs"]];
    const ic = (k, s = 18) => raw(TR.svg(k, s));
    const K = "Le tracé";
    // where a command is in the ribbon: « Carte › Position › Caler les postes »
    const W = (act) => TRD.ribbonAt(act);
    // the tools of the editor's bar, with the letter that picks them
    const TOOLS = [
      ["select", "Sélection", "S", "Cliquer un objet pour le choisir ; glisser un objet choisi pour le déplacer ; glisser ailleurs pour déplacer la carte. Double-cliquer un poste ouvre sa définition."],
      ["start", "Départ", "D", "Cliquer à l'endroit du départ. Dans un circuit, cliquer un départ déjà posé le reprend."],
      ["control", "Poste", "P", "Cliquer pour poser un poste ; l'outil reste actif pour poser les suivants. Cliquer un poste pâle, celui d'un autre circuit, l'ajoute au circuit."],
      ["finish", "Arrivée", "A", "Cliquer à l'endroit de l'arrivée."],
      ["crossing", "Passage obligatoire", "O", "Un point de passage obligé (une brèche dans une clôture, un pont) : cliquer sur l'interposte."],
      ["issue", "Remise de carte", "", "Là où le coureur reçoit sa carte avant le départ ; un trajet balisé mène ensuite au départ."],
      ["exchange", "Échange de carte", "", "Cliquer un poste du circuit : le coureur y change de carte, et le circuit se partage en parties."],
      ["bend", "Coude", "C", "Cliquer un interposte pour le plier (pour contourner une zone interdite) ; un coude se glisse ; cliquer un coude pour le retirer."],
      ["gap", "Coupure", "X", "Glisser le long d'un interposte ou d'un cercle pour le couper, et laisser lisible un détail de la carte ; cliquer une coupure pour la refermer."],
      ["route", "Itinéraire", "", "Dessiner un itinéraire à la main : cliquer l'interposte, puis les points du chemin ; double-cliquer pour finir. Il s'ajoute aux itinéraires de l'interposte (chapitre « Les itinéraires ») et ne s'imprime pas."],
      ["descr", "Définitions sur la carte", "", "Glisser un cadre sur la carte : les définitions du circuit s'y placent, et leur largeur fixe leur taille."],
      ["special", "Objets spéciaux", "", "Ouvre la liste des objets : point d'eau, poste de secours, zone interdite, texte, image… (chapitre « Objets spéciaux »)."],
    ];
    const KEYS = [
      ["Ctrl + Z, Ctrl + Y", "Annuler, rétablir (100 étapes)"], ["Ctrl + S", "Enregistrer tout de suite"],
      ["Suppr", "Supprimer l'objet choisi ; dans un circuit, retirer le poste du circuit seulement"],
      ["Échap", "Abandonner le tracé en cours, revenir à la Sélection, puis désélectionner"],
      ["Entrée", "Finir une ligne, une zone ou un itinéraire (comme un double-clic)"],
      ["S, D, P, A, O, C, X", "Choisir un outil (Sélection, Départ, Poste, Arrivée, passage Obligatoire, Coude, coupure)"],
      ["Maj + clic", "Garder l'outil après avoir posé un départ, une arrivée ou un objet"],
      ["Maj en glissant un poste", "Le poser exactement sur un poste voisin"],
      ["Molette, + et −", "Zoomer"], ["Flèches, clic droit glissé", "Déplacer la carte"], ["Clic droit", "Le menu de l'objet sous la souris"],
      ["Alt", "Les raccourcis du ruban : une lettre sur chaque onglet, puis sur chaque bouton de l'onglet choisi"], ["Alt + Q", "Rechercher une commande"],
      ["← → ↑ ↓, Début, Fin (dans le ruban)", "D'un onglet à l'autre (il s'affiche), d'un bouton à l'autre ; ↓ d'un onglet entre dans son ruban, ↑ y revient ; Tab passe des onglets au ruban"],
      ["Ctrl + F1", "Replier le ruban à ses onglets, ou le déplier"], ["F1", "Le guide, au chapitre de la commande sous la souris"],
    ];
    // what each menu entry does (the menus come from tracer/icons.js, as in the editor)
    const MENU_HELP = {
      "start-new": "Créer un autre événement, sur sa carte (le premier des trois choix qu'offre la page à son ouverture).",
      "start-open": "Ouvrir un autre de vos événements (ceux que vous avez créés et ceux dont l'équipe vous compte).",
      "start-import": "Un événement pris dans un fichier Ozimut (.ozmt, qui contient sa carte) ou Purple Pen (.ppen, avec sa carte) : un nouvel événement, à côté de celui-ci.",
      save: "Enregistre tout de suite ; l'enregistrement se fait aussi tout seul, quelques secondes après chaque changement.",
      "version-save": "Garde l'état actuel sous un nom, pour y revenir plus tard.",
      versions: "La liste des versions (une version est aussi gardée toutes les 30 minutes de travail) : voir ce qui a changé, en rouvrir une.",
      "export-ocn": "Tout l'événement en un seul fichier Ozimut (.ozmt), sa carte comprise si on le veut : une copie, une archive, ou l'événement pour un autre club ; il se rouvre par « Importer un événement ».",
      "export-ppen": "Le fichier de l'événement pour Purple Pen, à mettre à côté de la carte.",
      "import-ppen": "Remplace les circuits de l'événement par ceux d'un fichier Purple Pen ; la carte reste celle de l'événement.",
      "pdf-courses": "Les cartes des circuits à imprimer.", "pdf-descriptions": "Les définitions seules, plusieurs par page.",
      "pdf-punch": "Les cartons de contrôle, avec une case par poste.",
      "export-iof3": "Les circuits pour les logiciels de chronométrage : postes, ordre, longueurs, et les équipes des relais.",
      "export-iof2": "La même chose pour les logiciels plus anciens.", "export-gpx": "Les postes en points GPS (carte géoréférencée).",
      "export-kml": "Les circuits pour Google Earth ou une carte en ligne (carte géoréférencée).",
      "export-images": "Une image par circuit, avec son fichier de calage quand la carte est géoréférencée.",
      "export-ocad": "Chaque circuit en carte OCAD ou OpenOrienteering Mapper, pour le finir ou l'imprimer avec ces logiciels.",
      "export-routegadget": "La carte en image et les circuits, à déposer sur RouteGadget.", "export-csv": "Les tableaux des rapports, pour un tableur.",
      publish: "Après la course : les circuits dans l'analyse, où les coureurs déposent leurs traces GPS.",
      "send-results": "À partir du jour de la course : longueurs, dénivelées et postes de chaque circuit envoyés aux résultats du site.",
      "map-change": "Une autre carte (une version corrigée, un meilleur scan, le fichier OCAD) : les postes gardent leur place.",
      offline: "Garder l'événement sur cet appareil pour l'ouvrir sans réseau.",
      "event-props": "Le titre, l'échelle de la carte (et la résolution d'une image), l'échelle d'impression de « Tous les postes », la langue des définitions en texte, des notes.",
      appearance: "La taille des cercles, l'épaisseur des traits, la police et la taille des numéros, le violet et sa façon de se poser sur la carte.",
      standards: "La norme des définitions (IOF 2004 ou 2018/2024) et celle de la carte (ISOM 2017, ISSprOM 2019, ISOM 2000), qui fixe la taille des symboles.",
      numbering: "Le premier code donné aux nouveaux postes, et si l'on évite les codes qui se lisent aussi à l'envers (66, 99…).",
      codes: "Changer les codes de plusieurs postes d'un coup.", renumber: "Redonner un code à chaque poste, à partir du premier code.",
      "remove-unused": "Supprimer les postes qu'aucun circuit n'utilise.", calage: "Recaler tous les postes sur la carte, en deux clics (chapitre « La carte »).",
      "move-all": "Déplacer, tourner ou mettre à l'échelle tous les postes à la fois.",
      "custom-text": "Changer le texte que les définitions en texte donnent à un symbole.", punch: "Le dessin de la pince de chaque poste, pour vérifier les cartons.",
      load: "Le nombre de concurrents de chaque circuit (repris des inscriptions officielles quand il y en a), pour la charge des postes.",
      georef: "Situer la carte sur la Terre : des points cliqués, un fichier de calage, un KMZ.", team: "Les membres de l'équipe et leur rôle.",
      encryption: "Chiffrer l'événement avec une phrase de passe de l'équipe.",
      "course-new": "Un nouveau circuit (aussi : le « + » au bout des onglets).",
      "course-props": "Le nom, le type (normal ou au score), les catégories, la dénivelée, la longueur, l'échelle d'impression, les définitions, la numérotation, les concurrents attendus.",
      "course-dup": "Une copie du circuit, pour en dériver un autre.", "course-delete": "Supprimer le circuit ; ses postes restent dans « Tous les postes ».",
      "course-order": "L'ordre des onglets et des listes.", "var-fork": "Une fourche à partir du poste choisi : des branches qui se rejoignent plus loin.",
      "var-loop": "Des boucles à partir du poste choisi (un « papillon »).", "var-delete": "Supprimer la fourche ou les boucles qui partent du poste choisi.",
      relay: "Pour un relais : quelle variante court chaque relayeur de chaque équipe.", "print-area": "La partie de la carte imprimée, le format et l'orientation de la feuille.",
      "part-options": "Pour un circuit en plusieurs parties : montrer ou non l'arrivée sur la partie choisie.",
      "rep-summary": "Pour chaque circuit : la longueur, la dénivelée, le nombre de postes.", "rep-legs": "La longueur de chaque interposte de chaque circuit.",
      "rep-cross": "Quels circuits passent à quel poste.", "rep-load": "Le nombre de concurrents attendus à chaque poste et sur chaque interposte.",
      "rep-audit": "Les vérifications : postes trop proches, définitions incomplètes, codes, interpostes qui traversent une zone interdite… (chapitre « Vérifier »).",
      "rep-climb": "La dénivelée de chaque circuit, sur le modèle de terrain de l'IGN.", "rep-times": "Le temps attendu du vainqueur de chaque circuit, et la longueur pour un temps visé.",
      "rep-pickup": "Quand et dans quel ordre ramasser les postes.", tour: "Le chemin le plus rapide par tous les postes choisis (par défaut, tous) : pour le contrôleur, et pour poser ou ramasser les postes.", "rep-after": "Après la course : temps, erreurs et itinéraires pris sur chaque interposte.",
      comments: "Les commentaires de l'équipe, épinglés sur la carte.", field: "Sur le téléphone : la carte avec sa position GPS, pour poser et vérifier les postes.",
      "view-course": "Cadrer tout le circuit.", "view-map": "Cadrer toute la carte.", "view-all": "Montrer en pâle les postes des autres circuits, pour les reprendre.",
      "view-printarea": "Montrer le cadre de la zone d'impression.", "view-others": "Montrer d'autres circuits en bleu pâle sous celui en cours.",
      "import-course": "Lire les cercles, le départ et l'arrivée imprimés sur une carte (un PDF, une photo) et en faire des postes.",
      "save-to": "Quand une commande crée plusieurs fichiers : les écrire dans un dossier choisi, ou en un seul .zip.",
    };
    // the editor's screen, drawn: its zones numbered as in the list under it
    const screenFig = () => {
      const P = "#a7179b", ink2 = "var(--ink-2)", line = "var(--border-strong)";
      const mark = (n, x, y) => `<g><circle cx="${x}" cy="${y}" r="11" fill="${P}"/><text x="${x}" y="${y + 4}" text-anchor="middle" font-size="12" font-weight="700" style="fill:#fff">${n}</text></g>`;
      const icon = (k, x, y, s = 0.72, c = ink2) => `<g transform="translate(${x} ${y}) scale(${s})" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${TR.ICON[k]}</g>`;
      const txt = (x, y, t, o = "") => `<text x="${x}" y="${y}" font-size="11" ${o}>${t}</text>`;
      // the tabs of the ribbon, the contextual one at the end
      let tx = 66;
      const tabs = ["Tracer", "Circuits", "Carte", "Vérifier", "Imprimer", "Équipe et course"].map((l, i) => {
        const w = l.length * 6.4 + 18 + (l === "Vérifier" ? 16 : 0), x = tx; tx += w;
        return `${txt(x + 8, 53, l, `style="fill:${i ? "var(--ink-2)" : "var(--ink)"}" ${i ? "" : 'font-weight="700"'}`)}${i ? "" : `<line x1="${x + 4}" y1="61" x2="${x + w - 6}" y2="61" stroke="${P}" stroke-width="2.5"/>`}${l === "Vérifier" ? `<circle cx="${x + w - 12}" cy="49" r="7" fill="var(--amber)"/><text x="${x + w - 12}" y="52.5" text-anchor="middle" font-size="9.5" font-weight="700" style="fill:#1b1a17">2</text>` : ""}`;
      }).join("");
      const big = (k, x, label, on = false) => `${on ? `<rect x="${x - 4}" y="68" width="56" height="52" rx="6" fill="color-mix(in srgb, ${P} 13%, transparent)" stroke="${P}" stroke-opacity=".6"/>` : ""}${icon(k, x + 12, 72, 1, P)}<text x="${x + 24}" y="112" text-anchor="middle" font-size="10.5" style="fill:var(--ink)">${label}</text>`;
      const small = (k, x, y, label) => `${icon(k, x, y - 9, 0.5)}<text x="${x + 16}" y="${y + 1}" font-size="10" style="fill:var(--ink)">${label}</text>`;
      const sep = (x) => `<line x1="${x}" y1="68" x2="${x}" y2="140" stroke="${line}"/>`;
      const gt = (x, t) => `<text x="${x}" y="140" text-anchor="middle" font-size="9.5" style="fill:var(--ink-3)">${t}</text>`;
      const cells = ["water", "firstaid", "oob", "boundary", "danger", "forbidden", "text", "image"].map((k, i) => `<rect x="${452 + (i % 4) * 25}" y="${70 + Math.floor(i / 4) * 25}" width="23" height="23" rx="4" fill="var(--surface)" stroke="${line}"/>${icon(k, 456 + (i % 4) * 25, 74 + Math.floor(i / 4) * 25, 0.62, P)}`).join("");
      const ctl = [[330, 380, "start"], [400, 300, 1], [495, 345, 2], [585, 255, 3], [675, 320, 4], [705, 405, "finish"]];
      let legs = "";
      for (let i = 1; i < ctl.length; i++) {
        const [x1, y1] = ctl[i - 1], [x2, y2] = ctl[i], d = Math.hypot(x2 - x1, y2 - y1), ux = (x2 - x1) / d, uy = (y2 - y1) / d, a = i === 1 ? 10 : 12, b = i === ctl.length - 1 ? 15 : 12;
        legs += `<line x1="${x1 + ux * a}" y1="${y1 + uy * a}" x2="${x2 - ux * b}" y2="${y2 - uy * b}"/>`;
      }
      const marks = ctl.map(([x, y, k]) => (k === "start" ? `<path d="M${x} ${y - 11}l10 17h-20z"/>` : k === "finish" ? `<circle cx="${x}" cy="${y}" r="9"/><circle cx="${x}" cy="${y}" r="14"/>`
        : `<circle cx="${x}" cy="${y}" r="12" ${k === 3 ? 'stroke="#0a84ff" stroke-width="3"' : ""}/><text x="${x + 15}" y="${y - 12}" font-size="15" stroke="none" style="fill:${k === 3 ? "#0a84ff" : P}">${k}</text>`)).join("");
      const rows = [["", "", "Départ : sommet"], ["1", "31", "Rocher, côté nord"], ["2", "45", "Dépression"], ["3", "52", "Chemin, croisement"], ["4", "38", "Clairière"]];
      const sheet = rows.map(([n, c, t], i) => `${i === 3 ? `<rect x="12" y="${182 + i * 20}" width="210" height="20" fill="#fff59d"/>` : ""}<text x="22" y="${196 + i * 20}" font-size="11" font-weight="700" style="fill:${i === 3 ? "#111" : "var(--ink)"}">${n}</text><text x="38" y="${196 + i * 20}" font-size="10.5" style="fill:${i === 3 ? "#111" : "var(--ink)"}">${c}</text><text x="64" y="${196 + i * 20}" font-size="10.5" style="fill:${i === 3 ? "#333" : "var(--ink-2)"}">${t}</text><line x1="12" y1="${202 + i * 20}" x2="222" y2="${202 + i * 20}" stroke="${line}"/>`).join("");
      return `<svg viewBox="0 0 760 486" role="img" aria-label="L'écran du tracé, ses zones numérotées">
        <rect x="0.5" y="0.5" width="759" height="485" rx="9" fill="var(--surface)" stroke="${line}"/>
        <rect x="8" y="7" width="94" height="22" rx="5" fill="var(--surface-2)" stroke="${line}"/>${icon("folder", 13, 11, 0.55)}${txt(32, 22, "Événements", 'style="fill:var(--ink)"')}
        <text x="112" y="23" font-size="12.5" font-weight="700" style="fill:var(--ink)">Entraînement</text>
        <rect x="196" y="11" width="34" height="15" rx="7.5" fill="var(--flag)"/><text x="213" y="22" text-anchor="middle" font-size="8.5" font-weight="700" style="fill:#fff">BÊTA</text>
        <line x1="240" y1="10" x2="240" y2="27" stroke="${line}"/>${icon("undo", 248, 9, 0.62)}${icon("redo", 270, 9, 0.62)}${icon("printer", 292, 9, 0.62)}${icon("shield", 314, 9, 0.62)}${icon("pencil", 336, 9, 0.62)}<text x="358" y="22" font-size="8" style="fill:var(--ink-3)">▾</text>
        <rect x="470" y="7" width="176" height="22" rx="6" fill="var(--surface-2)" stroke="${line}"/>${icon("search", 476, 11, 0.55)}${txt(494, 22, "Rechercher une commande", 'style="fill:var(--ink-3)"')}
        ${txt(656, 22, "Enregistré", 'style="fill:var(--good)"')}${icon("ribbon", 712, 9, 0.62)}${icon("fit", 734, 9, 0.62)}
        <line x1="0" y1="35" x2="760" y2="35" stroke="${line}"/>
        <rect x="8" y="40" width="50" height="19" rx="5" fill="${P}"/><text x="33" y="53.5" text-anchor="middle" font-size="11" font-weight="700" style="fill:#fff">Fichier</text>${tabs}
        <rect x="560" y="38" width="128" height="24" fill="color-mix(in srgb, ${P} 9%, var(--surface))"/><line x1="560" y1="38.5" x2="688" y2="38.5" stroke="${P}" stroke-width="3"/>
        <text x="566" y="53" font-size="7.5" font-weight="700" letter-spacing=".5" style="fill:${P}">OUTILS DU POSTE</text><text x="644" y="53" font-size="11" font-weight="700" style="fill:var(--ink)">Poste</text>
        <line x1="0" y1="62" x2="760" y2="62" stroke="${line}"/>
        ${big("select", 12, "Sélection", true)}${gt(36, "Sélection")}${sep(66)}
        ${big("control", 74, "Poste")}${big("start", 126, "Départ")}${big("finish", 178, "Arrivée")}
        ${small("crossing", 236, 84, "Passage obligatoire")}${small("issue", 236, 103, "Remise de carte")}${small("exchange", 236, 122, "Échange de carte")}${gt(240, "Postes")}${sep(346)}
        ${small("bend", 354, 84, "Coude")}${small("gap", 354, 103, "Coupure")}${small("route", 354, 122, "Itinéraire")}${gt(395, "Interpostes")}${sep(444)}
        ${cells}<rect x="552" y="70" width="10" height="48" rx="2" fill="var(--surface-2)" stroke="${line}"/><text x="557" y="97" text-anchor="middle" font-size="8" style="fill:var(--ink-3)">▾</text>${gt(505, "Objets spéciaux")}${sep(572)}
        ${big("descr", 580, "Sur la carte")}${txt(640, 86, "Norme", 'style="fill:var(--ink-2)"')}<rect x="676" y="76" width="70" height="15" rx="3" fill="var(--plane)" stroke="${line}"/>${txt(681, 87, "IOF 2018 ▾", 'font-size="9.5" style="fill:var(--ink)"')}
        ${txt(640, 108, "Langue", 'style="fill:var(--ink-2)"')}<rect x="676" y="98" width="70" height="15" rx="3" fill="var(--plane)" stroke="${line}"/>${txt(681, 109, "Français ▾", 'font-size="9.5" style="fill:var(--ink)"')}${gt(664, "Définitions")}
        ${icon("launcher", 742, 131, 0.45)}
        <line x1="0" y1="148" x2="760" y2="148" stroke="${line}"/>
        <text x="12" y="165" font-size="12" style="fill:var(--ink-2)">Tous les postes</text><text x="118" y="165" font-size="12" font-weight="700" style="fill:var(--ink)">Circuit A</text>
        <line x1="114" y1="172" x2="176" y2="172" stroke="${P}" stroke-width="2.5"/><text x="190" y="165" font-size="12" style="fill:var(--ink-2)">Circuit B</text>${icon("plus", 252, 154, 0.55)}
        <line x1="0" y1="174" x2="760" y2="174" stroke="${line}"/>
        <rect x="12" y="180" width="210" height="124" fill="var(--surface)" stroke="var(--ink)"/>${sheet}
        <path d="M20 189.5l9 5-9 5z" fill="none" stroke="var(--ink)" stroke-width="1.3"/>
        <text x="14" y="330" font-size="12" font-weight="700" style="fill:var(--ink)">Circuit A</text>
        <text x="14" y="348" font-size="11" style="fill:var(--ink-2)">Longueur 3,2 km · Dénivelée 85 m</text><text x="14" y="364" font-size="11" style="fill:var(--ink-2)">4 postes · 1:10 000</text>
        <rect x="233" y="175" width="527" height="285" fill="var(--surface-2)"/>
        <path d="M250 230c60-30 120 10 170-20s110-40 150 10M260 280c70-20 120 30 200 0s120-30 180 20M300 450c40-60 120-50 170-20" fill="none" stroke="#c8865a" stroke-opacity=".55" stroke-width="1.4"/>
        <ellipse cx="520" cy="410" rx="60" ry="26" fill="#f6c46a" fill-opacity=".45"/>
        <g fill="none" stroke="${P}" stroke-width="2.2">${legs}${marks}</g>
        <line x1="232" y1="174" x2="232" y2="460" stroke="${line}" stroke-width="2"/>
        <g>${[0, 1, 2].map((i) => `<rect x="724" y="${184 + i * 26}" width="24" height="22" rx="5" fill="var(--surface)" stroke="${line}"/>`).join("")}${icon("plus", 727, 186, 0.6)}${icon("minus", 727, 212, 0.6)}${icon("fit", 727, 238, 0.6)}
          <line x1="736" y1="266" x2="736" y2="320" stroke="${P}" stroke-width="3" stroke-linecap="round"/><circle cx="736" cy="276" r="5" fill="${P}"/></g>
        <line x1="0" y1="460" x2="760" y2="460" stroke="${line}"/>
        <text x="12" y="477" font-size="11" style="fill:var(--ink-3)">Cliquer pour choisir un objet ; glisser un objet choisi pour le déplacer…</text><text x="748" y="477" text-anchor="end" font-size="11" style="fill:var(--ink-3)">1:10 000 · 140 %</text>
        ${mark(1, 384, 18)}${mark(2, 540, 50)}${mark(3, 346, 136)}${mark(4, 700, 50)}${mark(5, 292, 162)}${mark(6, 222, 186)}${mark(7, 420, 240)}${mark(8, 708, 196)}
      </svg>`;
    };
    const CH = {
      principe: () => html`
        <section class="mx-slide" id="tr-principe">
          <p class="mx-kicker">${K}</p>
          <h2>Tracer les circuits dans le navigateur</h2>
          <p class="mx-lead">Le tracé, qui s'ouvre depuis l'onglet « Tracé » d'un événement dans Orga, sert à préparer les circuits d'une course ou d'un entraînement, de la carte vierge aux cartes imprimées :
            placer les postes, composer les circuits, remplir les définitions, vérifier, imprimer, préparer les fichiers du chronométrage. Rien à installer :
            tout se passe dans le navigateur, et l'événement est enregistré sur le site.</p>
          <p>Il reprend les règles de traçage et le format de fichier de <a href="https://purple-pen.org/" target="_blank" rel="noopener">Purple Pen</a>,
            le logiciel libre de traçage de Peter Golde, que beaucoup de clubs connaissent : un événement passe de l'un à l'autre, dans les deux sens. Il a aussi son
            propre fichier, le fichier Ozimut (.ozmt), qui garde tout l'événement et sa carte en un seul fichier. On n'a pas besoin de connaître Purple Pen pour s'en
            servir : ce guide explique tout.</p>
          <div class="mx-callout"><b>Version bêta.</b> Le tracé vient d'être réalisé et n'a encore été que peu testé : essayez-le, et signalez-nous ce qui ne va
            pas par la page « Nous écrire » (le menu de votre nom). Il n'est pas encore conseillé pour préparer une vraie compétition ; il convient très bien aux cartes
            d'entraînement.</div>
          <h3>Les étapes</h3>
          <div class="mx-steps" style="--c:#a7179b">
            <div class="mx-step"><b>Commencer le tracé</b>Dans Orga, l'onglet « Tracé » de l'événement : « Commencer le tracé » ouvre un tracé préparé pour la compétition ou l'entraînement, et rattaché à lui ; il reste à donner la carte.</div>
            <div class="mx-step"><b>Poser les postes</b>Avec l'outil Poste, sur l'onglet « Tous les postes » ou directement dans un circuit.</div>
            <div class="mx-step"><b>Composer les circuits</b>Un onglet par circuit : départ, postes dans l'ordre, arrivée.</div>
            <div class="mx-step"><b>Remplir les définitions</b>Dans le panneau de gauche, case par case, symboles ou texte.</div>
            <div class="mx-step"><b>Vérifier</b>Longueurs, dénivelée, postes trop proches, définitions oubliées : l'onglet Vérifier.</div>
            <div class="mx-step"><b>Imprimer et exporter</b>Les PDF des cartes et des définitions, les fichiers pour le chronométrage.</div>
          </div>
          <h3>Les trois choix</h3>
          <p>Depuis l'onglet « Tracé » d'un événement, la page « Tracer » s'ouvre directement sur son tracé. Ouverte autrement (un lien, une invitation), elle montre tout de suite l'écran du tracé, vide, et par-dessus trois choix :</p>
          <ul class="mx-list">
            <li><b>Nouvel événement</b> : tracer les circuits d'une compétition de votre club ou d'un entraînement. Il faut la carte.</li>
            <li><b>Importer un événement</b> : reprendre un événement préparé ailleurs, sur un autre compte, dans un autre club dans Purple Pen ou dans OCAD. Il faut un fichier
              Ozimut (.ozmt), qui contient déjà la carte, un fichier Purple Pen (.ppen) et le fichier de sa carte, ou le fichier OCAD des circuits et celui de sa carte.</li>
            <li><b>Ouvrir un événement</b> : un de ceux que vous avez créés ou dont l'équipe vous compte, dans la liste.</li>
          </ul>
          <p>Des fichiers déposés sur cet écran choisissent pour vous : une carte seule commence un nouvel événement, un .ozmt, un .ppen ou un fichier OCAD qui contient des circuits un import. Le bouton
            « Événements », en haut à gauche, et le menu Fichier (Nouveau, Ouvrir, Importer) ramènent ces trois choix à tout moment ; Échap les ferme. Un lien qui nomme un événement l'ouvre
            directement.</p>
          <h3>Créer un événement</h3>
          <p>« Nouvel événement » demande :</p>
          <ul class="mx-list">
            <li><b>Une compétition ou un entraînement.</b> Une compétition se choisit dans la liste des courses à venir et des 60 derniers jours organisées par votre
              club (le club de votre dernière course) : seuls ses membres la créent. Un entraînement, n'importe qui le crée, avec un titre et une date.</li>
            <li><b>La carte</b>, déposée ou choisie : le fichier OCAD ou Mapper, un PDF ou une image (chapitre « La carte »).</li>
            <li><b>L'échelle de la carte</b> (lue dans le fichier OCAD ou Mapper) et sa <b>norme</b> : forêt (ISOM 2017) ou sprint (ISSprOM 2019), qui fixe la taille
              des cercles et des numéros.</li>
          </ul>
          <p>« Importer un événement » demande les mêmes renseignements (compétition ou entraînement) et le fichier : un fichier Ozimut (.ozmt) se rouvre tel qu'il a
            été enregistré, avec sa carte (un fichier enregistré plus tôt en .ocnt s'ouvre de même) ; un fichier Purple Pen (.ppen)
            avec sa carte ; un fichier OCAD préparé avec son module de traçage, avec sa carte : le fichier OCAD qu'il affiche dessous, que
            la boîte nomme (inutile quand carte et circuits sont dans un même fichier). Ses postes, leurs définitions et ses circuits sont
            repris, et un circuit qui revient à son départ reçoit une arrivée au même endroit ; les variations n'en gardent que la première
            branche (la boîte le signale), et ses logos (les images de sa mise en page) deviennent des images sur tous les circuits, à leur place : un logo
            n'est jamais retiré de la carte, à l'écran comme dans les PDF. Si la carte donnée n'est pas celle du fichier (un PDF au lieu de la carte
            OCAD, par exemple), on cale ensuite les postes en deux clics.</p>
          <div class="mx-grid">
            <div class="mx-box" style="--c:var(--s1)"><h3>Qui le voit</h3><p>Son équipe seulement : son créateur et les personnes qui la rejoignent par un lien d'invitation, comme traceur,
              contrôleur ou lecteur. Pas les administrateurs du site : les circuits restent secrets jusqu'à la course.</p></div>
            <div class="mx-box" style="--c:var(--s3)"><h3>Enregistré tout seul</h3><p>Quelques secondes après chaque changement ; une version est gardée toutes les
              30 minutes de travail, et on peut en garder une sous un nom (${W("version-save")}).</p></div>
            <div class="mx-box" style="--c:var(--s5)"><h3>Chiffré si on veut</h3><p>Avec une phrase de passe de l'équipe (${W("encryption")}), le serveur ne
              garde que des données illisibles. Perdue, elle ne se retrouve pas : exportez d'abord un fichier Ozimut (${W("export-ocn")}), qui, lui,
              n'est pas chiffré.</p></div>
          </div>
        </section>`,
      carte: () => html`
        <section class="mx-slide" id="tr-carte">
          <p class="mx-kicker">${K}</p>
          <h2>La carte</h2>
          <h3>Quel fichier donner</h3>
          <div class="mx-grid">
            <div class="mx-box" style="--c:var(--s1)"><h3>OCAD ou Mapper</h3><p>Le meilleur choix : le fichier .ocd (OCAD 6 à 12 et 2018) ou .omap / .xmap
              (OpenOrienteering Mapper). La carte est dessinée symbole par symbole : nette à tous les zooms, imprimée en vecteurs, aux bonnes dimensions sans
              réglage ; son échelle, son géoréférencement et son violet sont repris.</p></div>
            <div class="mx-box" style="--c:var(--s3)"><h3>PDF</h3><p>Exporté d'OCAD ou de Mapper, il reste net à l'impression : il est repris tel quel dans les PDF des
              circuits. Ses dimensions sont celles de la page.</p></div>
            <div class="mx-box" style="--c:var(--s5)"><h3>Image</h3><p>JPG, PNG, GIF, BMP, WebP ou TIFF, même un scan ou une photo prise bien à plat. Ses
              distances viennent de sa <b>résolution</b> : à 300 points par pouce, 1 mm de carte fait 11,8 points.</p></div>
          </div>
          <p>La résolution d'une image est lue dans le fichier quand il la donne ; sinon elle est demandée. Pour la vérifier, mesurez une distance connue
            (${W("rep-legs")}) ; ${W("event-props")} la corrige. Une carte OCAD peut appeler d'autres fichiers en fond (des
            « modèles », une photo aérienne) : ils ne sont pas dessinés.</p>
          <p>Le curseur sous les boutons de zoom (ou Carte › Affichage › Intensité) pâlit la carte, pour mieux voir le circuit. ${W("map-change")} en met une autre (une version corrigée,
            un meilleur scan, le fichier OCAD au lieu d'une image) : les postes gardent leur place sur la feuille, leurs coordonnées (une nouvelle version du même
            fichier OCAD), leur place sur le terrain (deux cartes géoréférencées), ou se calent ensuite en deux clics.</p>
          <h3>Cartes d'entraînement</h3>
          <p>${W("map-colors")} cache des couleurs et des symboles d'une carte OCAD ou Mapper, pour tous les circuits ou pour un seul : une carte sans chemins, sans végétation, avec le relief ou les courbes seules, en un clic. ${W("exercise")} cache la carte d'un circuit sauf un couloir le long de ses interpostes et des fenêtres autour de ses postes, et suit le circuit quand il change ; les logos de la carte restent visibles.</p>
          <h3>Le violet du circuit</h3>
          <p>Le groupe Carte › Violet règle la façon dont le circuit se pose sur la carte ; chaque façon y est montrée en petit :</p>
          <ul class="mx-list">
            <li><b>Par-dessus</b> : le violet couvre la carte.</li>
            <li><b>Mélangé</b> : le noir de la carte reste visible à travers le violet, comme à l'impression en surimpression.</li>
            <li><b>En couches</b> (carte OCAD ou Mapper) : les cercles, les traits et les zones interdites passent sous les couleurs de la carte au-dessus d'une couleur
              choisie, d'ordinaire sous le noir des chemins et des rochers ; les numéros restent dessus.</li>
          </ul>
          <p>Sur une carte OCAD ou Mapper, le violet est par défaut celui de la carte ; on peut en donner un autre en CMJN (Carte › Violet › Apparence). Les « effets de surimpression » (Carte › Violet › Surimpression) montrent
            les couleurs que la carte marque « surimpression » fondues, comme elles s'impriment.</p>
          <h3>Caler les postes en deux clics</h3>
          <p>Quand les postes ne tombent pas au bon endroit — un fichier .ppen fait sur une autre carte, un scan un peu tourné — ${W("calage")} les replace : on clique un poste, puis l'endroit où il devrait être, et cela deux fois, avec deux postes éloignés l'un de l'autre. Le tracé en
            déduit le décalage, la rotation et l'échelle. Si l'échelle change, il propose de corriger la carte (la résolution de l'image ou l'échelle du PDF),
            les longueurs du circuit restant justes, ou les postes. Un .ppen fait sur une carte OCAD, importé avec la même carte OCAD, n'a pas besoin de calage.</p>
          <h3>Le géoréférencement</h3>
          <p>Pour la dénivelée, le mode terrain, les GPX et l'analyse, il faut savoir où est la carte sur la Terre. Une carte OCAD ou Mapper géoréférencée
            (Lambert 93, UTM, les systèmes d'OCAD) et un TIFF géoréférencé le sont tout seuls. Sinon, ${W("georef")} : deux points de la
            carte (un carrefour, un angle de bâtiment) cliqués avec leur latitude et leur longitude — un clic droit sur Géoportail ou une carte en ligne les
            donne —, ou trois et plus pour une photo déformée ; ou un fichier de calage (.jgw, .pgw… avec son .prj) ; ou un KMZ de la même image. La fenêtre
            vérifie l'échelle obtenue contre celle de la carte.</p>
          <p><b>Exercices</b> : ${W("exercise")} propose, pour le circuit en cours, six cartes d'entraînement — le couloir, les fenêtres, les postes masqués
            (un blanc autour de chaque poste), les interpostes masqués (un blanc sur le milieu de chaque interposte), une carte par interposte (un changement de
            carte à chaque poste) et le puzzle (l'image du circuit en pièces mélangées, à imprimer). Fonds, relief et modèle d'altitude : chapitre « Fonds et relief ».</p>
        </section>`,
      fonds: () => html`
        <section class="mx-slide" id="tr-fonds">
          <p class="mx-kicker">${K}</p>
          <h2>Fonds et relief</h2>
          <p>${W("backdrop")} ouvre un panneau, posé sur la carte, qui montre sous le circuit ce que la carte ne dit pas. Il demande une carte géoréférencée
            (un fichier OCAD ou Mapper l'est le plus souvent ; sinon ${W("georef")}).</p>
          <ul class="mx-list">
            <li><b>OpenStreetMap</b>, partout dans le monde : rues, chemins, bâtiments récents — pour vérifier qu'un chemin existe encore, repérer un parking.</li>
            <li><b>Les cartes et photos aériennes nationales</b> là où Ozimut les connaît : France, Suisse, États-Unis, Nouvelle-Zélande.</li>
            <li>En France, <b>le LiDAR HD de l'IGN</b> : le sol nu ombré (talus, fossés, anciens chemins, plateformes), la hauteur de la végétation (coupes,
              jeunes plantations, clairières) et la nature des points (sol, végétation, bâti).</li>
            <li><b>L'ombrage et les pentes</b> du modèle d'altitude de l'événement, partout.</li>
          </ul>
          <p>Chaque fond a sa case et son opacité ; la dernière ligne règle l'intensité de la carte elle-même, pour voir à travers. Le choix est gardé pour
            l'événement, sur cet appareil. Les fonds ne s'impriment pas — sauf celui choisi comme « fond imprimé » dans la zone d'impression.</p>
          <h3>Le modèle d'altitude</h3>
          <p>La dénivelée, le profil, les itinéraires, l'ombrage et la vue 3D lisent les mêmes altitudes : le modèle d'altitude de l'événement (${W("dem")}).
            Ozimut le charge de lui-même à la première demande — le RGE ALTI de l'IGN en France, les modèles nationaux en Suisse, aux États-Unis, au Canada et
            en Nouvelle-Zélande, le relief mondial ailleurs — puis le garde avec l'événement : toute l'équipe lit les mêmes altitudes, même hors ligne, et le
            fichier Ozimut (.ozmt) les emporte. Vous avez mieux ? « Utiliser mon fichier » prend un GeoTIFF ou une grille ASCII : un MNT du LiDAR à 1 m, par exemple.</p>
          <p>${W("rep-climb")} donne la dénivelée de chaque circuit de trois façons : <b>entre les postes</b> (la somme des montées nettes d'un poste au suivant),
            <b>le long des interpostes</b> (toutes les montées de la ligne droite) et <b>le long des itinéraires</b> (la règle de l'IOF : la montée de
            l'itinéraire le plus rapide). Cliquez l'en-tête de la colonne à reporter et cochez les circuits ; la valeur est arrondie à 5 m. Là où le modèle se
            trompe — un poste sous un pont, au pied d'une falaise —, tapez l'altitude du poste : elle compte alors partout. ${W("profile")} trace le profil du
            circuit, ou celui de l'interposte choisi avec chacun de ses itinéraires.</p>
          <h3>Une trace GPS sur la carte</h3>
          <p>${W("import-track")} pose sur la carte votre reconnaissance du terrain — un fichier GPX, TCX, FIT, NMEA ou FRWD — comme un objet ligne, que vous
            déplacez, recolorez ou supprimez comme un autre. Elle se montre sur « Tous les postes » seulement, à moins de cocher tous les circuits.</p>
          <h3>Voir ici</h3>
          <p>Un clic droit sur la carte, puis « Voir ici sur… », ouvre l'endroit cliqué dans OpenStreetMap, Google Maps et Street View, le Géoportail et
            « Remonter le temps » de l'IGN en France, la carte nationale en Suisse, Mapy.cz ou Mapillary, ou copie ses coordonnées.</p>
          <h3>Sans carte : tracer sur OpenStreetMap</h3>
          <p>Pour un parc, un quartier ou une cour d'école sans carte d'orientation, « Nouvel événement » propose « Pas de carte ? Tracer sur OpenStreetMap » :
            donnez le centre (ses coordonnées, ou « Ma position »), la feuille et l'échelle. L'événement s'ouvre sur OpenStreetMap, géoréférencé ; le fond
            s'imprime sous les circuits, avec son crédit. Le calcul des itinéraires, qui lit une carte d'orientation, n'y est pas disponible : dessinez-les à la main.</p>
        </section>`,
      ecran: () => html`
        <section class="mx-slide" id="tr-ecran">
          <p class="mx-kicker">${K}</p>
          <h2>L'écran</h2>
          <figure class="mx-fig">${raw(screenFig())}</figure>
          <div class="mx-steps" style="--c:#a7179b">
            <div class="mx-step"><b>La barre du haut</b>« Événements » ramène les trois choix (ouvrir un autre événement, en créer ou en importer un) ; le titre ;
              la barre d'accès rapide : annuler, rétablir, le PDF du circuit en cours, le contrôle de l'événement, les propriétés du circuit. À droite, la recherche d'une commande, l'état de l'enregistrement, ▭ (l'affichage du
              ruban), ⤢ (toute la fenêtre) et ↗ (un onglet à part).</div>
            <div class="mx-step"><b>Les onglets du ruban</b>Fichier, puis un onglet par étape du travail : Tracer, Circuits, Carte, Vérifier, Imprimer, Équipe et
              course. Un chiffre sur Vérifier : les problèmes trouvés ; sur Équipe et course : les commentaires encore ouverts.</div>
            <div class="mx-step"><b>Le ruban</b>Les commandes de l'onglet, par groupes : de grands boutons pour les plus courantes, de petits empilés par trois, des
              réglages en place, et ↘ dans le coin d'un groupe pour sa fenêtre complète.</div>
            <div class="mx-step"><b>L'onglet de l'objet choisi</b>Un poste, un interposte, un objet choisi, ou une ligne en train d'être dessinée, a son propre
              onglet, en violet, avec tout ce qui s'applique à lui.</div>
            <div class="mx-step"><b>Les circuits</b>« Tous les postes », puis un onglet par circuit, et « + » pour en créer un.</div>
            <div class="mx-step"><b>Les définitions</b>Celles du circuit en cours, à remplir en cliquant (chapitre « Les définitions ») ; dessous, le circuit en
              cours quand rien n'est choisi.</div>
            <div class="mx-step"><b>La carte</b>Où l'on pose et déplace les objets. Glisser la séparation à gauche élargit le panneau.</div>
            <div class="mx-step"><b>Le zoom et la ligne d'aide</b>Zoom avant, arrière, tout le circuit, et le curseur qui pâlit la carte ; en bas, ce que fait
              l'outil en cours, l'échelle et le zoom.</div>
          </div>
          <h3>Le ruban</h3>
          <p>Les onglets suivent le travail : <b>Tracer</b> pour poser les postes et les objets, <b>Circuits</b> pour composer les circuits, leurs variantes et leur
            impression, <b>Carte</b> pour la carte elle-même (la changer, la caler, la géoréférencer, la façon dont le violet s'y pose), <b>Vérifier</b>, <b>Imprimer</b>
            (les PDF et tous les fichiers à exporter), <b>Équipe et course</b> (l'équipe, le terrain, l'après-course). La page <b>Fichier</b> réunit ce qui sert
            rarement : les informations de l'événement, nouveau, ouvrir, importer, enregistrer et les versions, chaque fichier à exporter avec ce à quoi il sert,
            partager, hors ligne et les options.</p>
          <p>Un bouton grisé dit pourquoi dans sa bulle (« Choisissez d'abord un circuit », « à partir du jour de la course »…) : on ne tombe pas sur une commande qui
            refuse. La bulle de chaque bouton dit aussi ce qu'il fait et sa touche ; F1 ouvre le guide à son chapitre.
            Certains réglages se font dans le ruban même, avec l'effet tout de suite : l'échelle d'impression, la norme et la langue des définitions, la taille des
            cercles, des traits et des numéros, la façon dont le violet se pose sur la carte et le balisage d'un interposte, chacune montrée en petit.</p>
          <h3>L'onglet de l'objet choisi</h3>
          <p>Choisir un poste fait venir l'onglet <b>Poste</b> : son code, sa définition, une fourche ou des boucles à partir de lui, une ligne de texte avant ou
            après lui, couper son cercle, l'échange de carte, et ce qu'on sait de lui (ses circuits, sa charge, la longueur jusqu'au suivant). Un interposte a l'onglet
            <b>Interposte</b> (coude, coupure, itinéraire, balisage), un objet spécial l'onglet <b>Objet</b> (apparence, circuits, sommets), et une ligne ou une zone
            en train d'être dessinée l'onglet <b>Tracé en cours</b>, avec « Terminer » et « Annuler ». Choisi depuis l'onglet Tracer, l'objet ouvre son onglet tout
            seul ; depuis un autre onglet, son onglet apparaît et clignote, sans prendre la place de celui où l'on travaille. Les commandes qui demandent un endroit
            (« Ajouter un coude », « Couper le cercle ») demandent ensuite un clic sur la carte ; Échap y renonce.</p>
          <h3>La barre d'accès rapide</h3>
          <p>À côté du titre, elle garde à portée de clic, quel que soit l'onglet, les commandes qui servent le plus souvent : annuler, rétablir, le PDF du
            circuit en cours (pour imprimer une épreuve, avec les derniers réglages), le contrôle de l'événement et les propriétés du circuit. Son ▾ en ajoute
            ou en retire d'autres (enregistrer, le PDF de tous les circuits, la zone d'impression, l'IOF XML, les versions, les commentaires, le mode
            terrain…) ; un clic droit sur n'importe quel bouton du ruban l'y ajoute, un clic droit dans la barre l'en retire. Elle est gardée sur ce navigateur.</p>
          <h3>Trouver une commande</h3>
          <p>La <b>recherche</b>, en haut (Alt + Q), trouve une commande par un mot de son nom ou de ce qu'elle fait (« fourche », « gpx », « caler », « échelle »), et
            dit où elle est ; Entrée la lance et fait clignoter son bouton, pour la retrouver la fois suivante. <b>Alt</b> seul fait paraître une lettre sur chaque
            onglet, puis, l'onglet choisi, sur chaque bouton : deux touches lancent n'importe quelle commande sans la souris.</p>
          <h3>Plus de place pour la carte</h3>
          <p>Le bouton ▭, en haut à droite, met le ruban sur <b>une seule ligne</b> de petits boutons, ou n'en garde que <b>les onglets</b> (Ctrl + F1) : il s'ouvre
            alors sur la carte au clic d'un onglet et se referme après la commande. Sans choix de votre part, il est <b>automatique</b> : complet, sur une seule ligne
            quand la fenêtre a moins de 800 points de haut (un écran d'ordinateur portable), et réduit à ses onglets en plein écran (⤢), où la carte prend toute la
            place ; Fichier › Options règle les deux cas. Quand la fenêtre est étroite, les groupes se replient d'eux-mêmes, en commençant par la droite, chacun en un
            bouton qui l'ouvre.</p>
          <h3>Se déplacer sur la carte</h3>
          <p>La molette zoome autour de la souris ; glisser là où il n'y a rien (ou clic droit glissé) déplace la carte ; les flèches aussi. Carte › Affichage › Tout
            le circuit et Toute la carte recadrent. Zoomer loin sur une carte OCAD, Mapper ou PDF la redessine nette.</p>
          <h3>Choisir, déplacer, supprimer</h3>
          <p>Avec l'outil Sélection, un clic choisit un poste, un interposte, un numéro ou un objet ; il se surligne en bleu, sa ligne de définitions en jaune.
            Glisser un objet choisi le déplace. Un objet choisi montre ses <b>poignées</b> : les coudes d'un interposte, les bords de ses coupures, les sommets d'une
            zone, le coin des définitions ; elles se glissent. Suppr supprime l'objet ; dans un circuit, un poste est seulement retiré du circuit et reste dans
            « Tous les postes ».</p>
          <h3>Le clic droit</h3>
          <p>Le clic droit sur la carte ouvre le menu de l'objet sous la souris, avec exactement les commandes de son onglet, groupe par groupe, dites pour
            l'endroit cliqué : pour un poste, sa définition, une fourche ou des boucles, un échange de carte, une ligne de texte, couper son cercle ici, le retirer ;
            pour un interposte, un coude ou une coupure ici, retirer ce coude, l'itinéraire, le balisage ; pour un objet, son apparence, un sommet ici ou ce
            sommet, les circuits où il apparaît. Sur un bouton du ruban, le clic droit l'ajoute à la barre d'accès rapide.</p>
          <h3>Le clavier</h3>
          <div class="table-wrap"><table class="data compact tr-doc-tools"><thead><tr><th>Touche</th><th>Effet</th></tr></thead><tbody>
            ${KEYS.map(([k, v]) => html`<tr><td style="white-space:nowrap"><b>${k}</b></td><td>${v}</td></tr>`)}</tbody></table></div>
          <p>Un seul membre de l'équipe modifie à la fois : les autres voient l'événement en lecture seule, avec un bouton « Prendre la main ».</p>
        </section>`,
      postes: () => html`
        <section class="mx-slide" id="tr-postes">
          <p class="mx-kicker">${K}</p>
          <h2>Les outils et les postes</h2>
          <div class="table-wrap"><table class="data compact tr-doc-tools"><thead><tr><th></th><th>Outil</th><th>Touche</th><th>Ce qu'il fait</th></tr></thead><tbody>
            ${TOOLS.map(([k, n, key, v]) => html`<tr><td class="tr-doc-ico">${ic(k, 20)}</td><td style="white-space:nowrap"><b>${n}</b></td><td>${key}</td><td>${v}</td></tr>`)}
          </tbody></table></div>
          <h3>« Tous les postes » et les circuits</h3>
          <p>L'onglet <b>Tous les postes</b> rassemble tous les postes de l'événement, avec leurs codes. Un poste posé là n'appartient encore à aucun circuit. Un
            poste posé dans un circuit y entre aussi. Un même poste sert à plusieurs circuits : dans un circuit, les postes des autres circuits s'affichent en pâle
            quand l'outil Poste est actif (ou toujours, avec ${W("view-all")}) ; un clic sur l'un d'eux l'ajoute au circuit.</p>
          <h3>Où va un nouveau poste</h3>
          <p>Dans un circuit, un poste posé va :</p>
          <ul class="mx-list">
            <li>juste <b>après le poste choisi</b>, s'il y en a un ;</li>
            <li>dans l'<b>interposte choisi</b>, s'il y en a un ;</li>
            <li>sinon dans l'<b>interposte le plus proche</b> de l'endroit cliqué.</li>
          </ul>
          <p>Pour ajouter un poste en fin de circuit, choisissez le dernier poste, puis posez le nouveau. Pour en insérer un entre 3 et 4, choisissez
            l'interposte 3–4, ou cliquez simplement près de lui. Le départ et l'arrivée vont toujours au début et à la fin.</p>
          <h3>Codes et numéros</h3>
          <p>Chaque poste reçoit un <b>code</b> (31, 32…, réglé par ${W("numbering")}, qui évite par défaut les codes lisibles à l'envers) ; le
            champ Code de l'onglet Poste le change. Dans un circuit, le <b>numéro d'ordre</b> se place tout seul près du cercle, sans gêner les traits ; glissez-le pour
            le mettre ailleurs, et posez-le sur son cercle pour qu'il se replace tout seul. Les propriétés du circuit montrent à la place le code, ou les deux.</p>
          <h3>Déplacer un poste</h3>
          <p>Glissez-le avec l'outil Sélection : ses interpostes suivent dans tous les circuits. Un poste commun à d'autres circuits, déplacé de plus de 75 m, fait
            demander s'il faut le déplacer partout ou en créer un nouveau pour ce circuit. Maj en glissant le pose exactement sur un poste voisin.</p>
        </section>`,
      circuits: () => html`
        <section class="mx-slide" id="tr-circuits">
          <p class="mx-kicker">${K}</p>
          <h2>Les circuits</h2>
          <p>Le « + » au bout des onglets (ou ${W("course-new")}) crée un circuit. Ses <b>propriétés</b> (${W("course-props")}, ou un clic sur
            l'en-tête des définitions) :</p>
          <ul class="mx-list">
            <li><b>Nom</b> et <b>catégories</b>, qui s'impriment en tête des définitions ;</li>
            <li><b>type</b> : normal (les postes dans l'ordre) ou <b>au score</b> (les postes dans n'importe quel ordre, chacun avec ses points) ;</li>
            <li><b>dénivelée</b> et <b>longueur</b> : la longueur est calculée (le long des coudes), la dénivelée vient de ${W("rep-climb")} ou se tape ;</li>
            <li><b>échelle d'impression</b> : une carte au 1:10 000 peut s'imprimer au 1:7 500 pour les jeunes ; cercles et numéros y prennent la taille que la norme prévoit (Carte › Symboles) ; elle se change aussi dans Circuits › Impression › Échelle ;</li>
            <li><b>définitions</b> en symboles, en texte ou les deux, et l'<b>étiquette</b> des postes : numéro d'ordre, code, ou les deux ;</li>
            <li>les <b>concurrents attendus</b>, pour la charge des postes.</li>
          </ul>
          <p>${W("course-dup")} copie un circuit pour en dériver un autre ; ${W("course-order")} range les onglets. Supprimer un circuit laisse ses postes dans
            « Tous les postes » (${W("remove-unused")} les enlève).</p>
          <h3>Les interpostes</h3>
          <ul class="mx-list">
            <li>Un <b>coude</b> (outil Coude) plie un interposte pour contourner une zone interdite ; la longueur suit le trait.</li>
            <li>Une <b>coupure</b> (outil Coupure, en glissant) interrompt un trait ou un cercle pour laisser lisible un détail de la carte. Le tracé coupe aussi
              tout seul un trait là où il croise un autre interposte du circuit (Carte › Violet › Apparence règle cette coupure).</li>
            <li>Le <b>balisage</b> (l'onglet Interposte, qui montre chaque façon en petit, ou le clic droit) : tout l'interposte, son début ou sa fin balisés, dessinés en
              tirets.</li>
            <li>Un <b>passage obligatoire</b> (outil Passage obligatoire) marque une brèche ou un pont où le coureur doit passer.</li>
          </ul>
          <h3>Les variantes : fourches et boucles</h3>
          <p>Pour un relais ou une course en masse, les coureurs d'un même circuit ne font pas tous les mêmes postes. Choisissez le poste d'où partent les variantes,
            puis, dans son onglet Poste, Fourche ici (des branches qui se rejoignent plus loin) ou Boucles ici (des boucles qui reviennent au même poste), avec
            le nombre de branches. Un sélecteur apparaît au-dessus de la carte : choisissez une branche, et posez ses postes comme d'habitude. La longueur du
            circuit s'affiche alors de la variante la plus courte à la plus longue. ${W("relay")} répartit les variantes entre les équipes et leurs
            relayeurs, de façon que chaque équipe coure, sur l'ensemble de ses relayeurs, toutes les branches ; les PDF s'impriment par équipe et par relayeur.</p>
          <h3>Plusieurs parties</h3>
          <p>Un <b>échange de carte</b> (outil Échange de carte sur un poste du circuit) partage le circuit en parties : un sélecteur de partie apparaît, et chaque
            partie a sa zone d'impression et s'imprime sur sa propre feuille. ${W("part-options")} montre ou non l'arrivée sur une partie.</p>
          <h3>La zone d'impression</h3>
          <p>${W("print-area")} choisit le papier (A4, A3…), l'orientation, les marges, et la partie de la carte à imprimer ; le papier et l'orientation se changent aussi
            d'un clic dans Circuits › Impression › Papier (« selon le circuit » tourne la feuille dans le sens du circuit). La zone se place toute seule, centrée sur le
            circuit, ou suit un cadre tiré sur la carte. Une zone plus grande que la feuille se découpe sur plusieurs pages qui se chevauchent un peu, ou se réduit à son
            centre. ${W("view-printarea")} la montre en pointillés.</p>
          <p><b>Catégories</b> : ${W("classes")} lie chaque catégorie à son circuit, avec ses coureurs attendus et, pour un relais, son premier dossard ; un
            CSV « circuit;catégorie;coureurs » s'importe d'un coup. Les équipes d'un relais sont alors numérotées catégorie par catégorie.</p>
        </section>`,
      definitions: () => html`
        <section class="mx-slide" id="tr-definitions">
          <p class="mx-kicker">${K}</p>
          <h2>Les définitions</h2>
          <p>Le panneau de gauche montre les définitions du circuit en cours, telles qu'elles s'imprimeront. Elles suivent la norme IOF (2018/2024 par défaut, 2004
            possible : Tracer › Définitions › Norme) : une ligne par poste, avec ses colonnes C à H — quel détail, lequel, sa nature, sa taille, l'emplacement du poste.</p>
          <ul class="mx-list">
            <li>Un <b>clic sur une ligne</b> choisit le poste, et la carte se centre dessus.</li>
            <li>Un <b>second clic sur une case</b> ouvre les symboles de cette colonne ; tapez quelques lettres pour filtrer (« rav » donne « Ravine »). La colonne F
              accepte aussi la taille du détail (« 2 m », « 3 × 4 »).</li>
            <li><b>Au clavier</b>, la feuille choisie : ↑ ↓ changent de ligne, ← → de case, Entrée ou une lettre ouvre les symboles, Suppr vide la case.</li>
            <li>Un clic sur la case du <b>code</b> le change ; sur le <b>titre</b>, change le titre de l'événement ; sur l'<b>en-tête</b> (longueur, dénivelée),
              ouvre les propriétés du circuit.</li>
            <li>La ligne de l'<b>arrivée</b> (et celles des passages obligatoires et de la remise de carte) donne le balisage jusqu'à l'arrivée : un clic choisit sa forme.</li>
            <li>Une <b>ligne de texte</b> avant ou après un poste (l'onglet Poste › Définitions, ou le clic droit sur le poste) ajoute une consigne (« Passage dans le village »).</li>
          </ul>
          <p>Les définitions s'impriment en symboles, en texte, ou les deux (les propriétés du circuit). Le texte se compose dans la langue choisie (Tracer ›
            Définitions › Langue), parmi 23 langues ; ${W("custom-text")} change le texte d'un symbole. Pour les mettre sur la carte, l'outil Définitions sur la
            carte : glissez un cadre, sa largeur fixe la taille ; le coin en bas à droite redimensionne, un clic droit répartit sur plusieurs colonnes.
            ${W("pdf-descriptions")} les imprime seules, plusieurs par page, à découper pour les porte-définitions.</p>
          <h3>Lire la définition sur la carte</h3>
          <p>Sur une carte OCAD ou Mapper, ${W("auto-desc")} remplit la définition d'un nouveau poste d'après l'objet de la carte placé dessous : un rocher, une
            dépression, un bâtiment, une jonction de chemins. Posez le poste en <b>glissant</b> : la direction du glissé dit de quel côté de l'élément se trouve
            la balise (colonne G). ${W("desc-table")} montre la correspondance entre les symboles de la carte et les éléments de définition, à ajuster pour votre
            carte, et remplit les postes encore sans définition. Les courbes de niveau n'ont pas de correspondance : rentrant ou éperon, la ligne est la même.</p>
          <p><b>ISCD 2024</b> est la norme des nouveaux événements : elle ajoute la voie ferrée ou le tramway et le retournement de carte (clic droit sur un
            poste du circuit : la carte recto verso se retourne là), accepte un code de départ en colonne B (« S1 », « S2 ») et demande des cases de 5 à 7 mm,
            que le contrôle vérifie. Côté carte, les normes de ski (ISSkiOM 2019) et de VTT (ISMTBOM 2022) règlent la taille des cercles, du départ, de l'arrivée et des traits.</p>
        </section>`,
      speciaux: () => html`
        <section class="mx-slide" id="tr-speciaux">
          <p class="mx-kicker">${K}</p>
          <h2>Les objets spéciaux</h2>
          <p>Les plus courants sont dans la galerie de Tracer › Objets spéciaux ; ▾ ou ↘ ${ic("special", 16)} ouvre la liste complète. Chacun se pose à sa façon :</p>
          <div class="mx-grid">
            <div class="mx-box" style="--c:var(--s1)"><h3>${ic("water", 18)} Points</h3><p>Point d'eau, poste de secours, point de passage facultatif,
              itinéraire interdit, repère de calage : un clic à l'endroit voulu.</p></div>
            <div class="mx-box" style="--c:var(--s3)"><h3>${ic("oob", 18)} Lignes et zones</h3><p>Limite infranchissable, ligne, zone interdite, zone
              dangereuse, construction temporaire, masque blanc : un clic par sommet, puis un double-clic (ou Entrée) pour finir. Une zone se ferme toute seule.</p></div>
            <div class="mx-box" style="--c:var(--s5)"><h3>${ic("text", 18)} Cadres</h3><p>Texte, image, rectangle, ellipse : glisser un cadre sur la carte, puis
              donner le texte (police, taille, couleur), choisir l'image, ou l'apparence du trait.</p></div>
          </div>
          <p>Un objet s'affiche sur tous les circuits, ou seulement sur ceux choisis (l'onglet Objet › Circuits, ou le clic droit). Ses sommets se
            glissent ; l'onglet Objet (ou le clic droit) ajoute ou retire un sommet. Le <b>masque blanc</b> efface un morceau de carte sous le circuit (une
            légende obsolète, un détail à cacher). Une zone interdite traversée par un interposte est signalée par le contrôle de l'événement.</p>
        </section>`,
      sorties: () => html`
        <section class="mx-slide" id="tr-sorties">
          <p class="mx-kicker">${K}</p>
          <h2>Imprimer et exporter</h2>
          <h3>Les cartes des circuits</h3>
          <p>${W("pdf-courses")} : cochez les circuits (et « Tous les postes », pour le contrôleur), puis choisissez :</p>
          <ul class="mx-list">
            <li>un seul PDF d'une page par circuit, ou un PDF par circuit, ou par partie ;</li>
            <li>pour les variantes, chacune à part, toutes ensemble, ou par équipe et relayeur ;</li>
            <li>la carte et le circuit, ou le <b>circuit seul</b>, pour une surimpression sur des cartes déjà imprimées ;</li>
            <li>les couleurs en CMJN (pour un imprimeur) ou en RVB.</li>
          </ul>
          <p>Le bouton ${ic("printer", 14)} de l'accès rapide, en haut, donne le PDF du circuit en cours avec les derniers réglages. Chaque circuit s'imprime à son échelle d'impression, sur sa zone d'impression. <b>Imprimez le PDF en taille réelle</b> (sans « ajuster à la page »),
            sinon l'échelle est fausse : mesurez une longueur connue sur la première feuille.</p>
          <h3>Les autres fichiers</h3>
          <div class="mx-grid">
            <div class="mx-box" style="--c:var(--s1)"><h3>${ic("stopwatch", 18)} Chronométrage</h3><p>IOF XML 3.0 (ou 2.0.3 pour les logiciels anciens) : les
              circuits, l'ordre des postes, les longueurs, les équipes des relais. À importer dans le logiciel de chronométrage avant la course.</p></div>
            <div class="mx-box" style="--c:var(--s2)"><h3>${ic("descr", 18)} Définitions, cartons</h3><p>Le PDF des définitions seules, et les cartons de
              contrôle avec une case par poste (${W("punch")} dessine la pince de chaque poste).</p></div>
            <div class="mx-box" style="--c:var(--s3)"><h3>${ic("globe", 18)} GPS et cartes en ligne</h3><p>GPX des postes, KML des circuits, images des
              circuits (PNG, JPEG, GIF) avec leur fichier de calage, fichiers RouteGadget : il faut une carte géoréférencée.</p></div>
            <div class="mx-box" style="--c:var(--s4)"><h3>${ic("layers", 18)} OCAD et Mapper</h3><p>Chaque circuit en carte OCAD (9 à 12, 2018) ou Mapper, en
              symboles de circuit, avec la carte de l'événement en fond : pour finir ou imprimer le circuit avec ces logiciels.</p></div>
            <div class="mx-box" style="--c:var(--s5)"><h3>${ic("export", 18)} Ozimut et Purple Pen</h3><p>Le fichier Ozimut (.ozmt) garde tout l'événement, et sa
              carte si on le veut, en un seul fichier : une copie, une archive, l'événement pour un autre club ; il se rouvre par « Importer un événement ». Le
              .ppen s'ouvre dans Purple Pen à côté de la carte ; il garde tout, sauf ce que Purple Pen ne connaît pas (les itinéraires, par exemple).</p></div>
            <div class="mx-box" style="--c:var(--s6)"><h3>${ic("table", 18)} Tableaux</h3><p>Les rapports en CSV (séparateur « ; »), pour un tableur.</p></div>
          </div>
          <p>Chaque fenêtre d'export revient avec les choix faits la dernière fois sur ce navigateur — le format, la résolution, le nombre d'exemplaires, la
            taille des cases, les couleurs… — ; seuls les circuits à cocher sont à refaire. Quand une commande crée plusieurs fichiers, ils s'écrivent dans un dossier choisi (Chrome, Edge) ou dans un seul .zip ; ${W("save-to")}
            change ce choix.</p>
          <h3>L'apparence</h3>
          <p>Carte › Symboles règle la taille des cercles, l'épaisseur des traits et la hauteur des numéros (en proportion de la norme) ; Carte › Violet › Apparence, la police et le gras des
            numéros, leur contour blanc, la coupure automatique des traits qui se croisent, la taille selon l'échelle d'impression, et le violet. Les textes posés sur
            la carte s'impriment dans la police qu'ils nomment, avec gras et italique, et dans toutes les langues.</p>
          <h3>Gabarits, papiers, recto verso</h3>
          <p>${W("canvases")} garde sous un nom les réglages d'impression d'un circuit — papier et orientation, marges, zone, échelle, carte filtrée, fond
            imprimé — et les remet sur un circuit ou sur tous d'un clic. La zone d'impression connaît les papiers de A2 à A6, B4, B5, SRA3, Tabloid et un format
            libre. Le PDF des circuits sait faire commencer chaque circuit sur un recto : une page blanche est glissée où il faut, et les deux côtés d'une carte
            à retourner tombent dos à dos.</p>
          <p><b>Surimprimer des cartes déjà imprimées</b> : le décalage de l'imprimante, une échelle fine (99 à 101 % rattrapent le retrait du papier) et
            l'impression en miroir, dans le PDF des circuits.</p>
          <p><b>QR code</b> : parmi les objets spéciaux, un QR code posé sur la carte mène le coureur aux résultats, aux horaires de départ ou aux analyses de
            l'événement sur Ozimut, ou à l'adresse de votre choix. <b>Carte Garmin</b> : ${W("export-garmin")} découpe la carte, seule ou avec un circuit, en
            dalles de 1024 × 1024 pixels au plus, pour les montres et GPS Garmin.</p>
        </section>`,
      verifier: () => html`
        <section class="mx-slide" id="tr-verifier">
          <p class="mx-kicker">${K}</p>
          <h2>Vérifier</h2>
          <p>L'onglet Vérifier donne, pour l'événement entier :</p>
          <ul class="mx-list">
            <li><b>Résumé des circuits</b> : longueur, dénivelée, nombre de postes ;</li>
            <li><b>Longueurs des interpostes</b>, circuit par circuit ;</li>
            <li><b>Références croisées</b> : quels circuits passent à quel poste ;</li>
            <li><b>Charge des postes et des interpostes</b> : le nombre de concurrents attendus à chaque poste, pour placer plusieurs boîtiers là où il le faut ;</li>
            <li><b>Contrôle de l'événement</b> : postes inutilisés, définitions incomplètes, codes inférieurs à 31 ou lisibles à l'envers, postes trop près les uns des
              autres (au moins 30 m entre deux postes en forêt, 15 m en sprint, et des détails nettement différents à moins de 60 m, 30 m en sprint), interpostes qui
              traversent une zone interdite ou une limite infranchissable, qui passent dans le cercle d'un autre poste, allers-retours, interpostes trop courts, circuits qui partent du même départ vers le même premier poste ou dans presque la même direction.</li>
          </ul>
          <p>Le contrôle tourne tout seul après chaque changement : le nombre de problèmes trouvés s'affiche sur l'onglet Vérifier — en rouge, en orange quand il
            ne reste que des rappels, une dénivelée pas encore renseignée par exemple —, et les premiers dans l'onglet même ; un clic ouvre le contrôle complet. Le
            groupe « Circuit en cours » donne sa longueur, sa dénivelée, son nombre de postes, son échelle et ses concurrents attendus.</p>
          <h3>Dénivelée et temps du vainqueur</h3>
          <p>${W("rep-climb")} donne la dénivelée de chaque circuit d'après le modèle d'altitude — entre les postes, le long des interpostes ou le long des itinéraires (chapitre « Fonds et relief ») ; cochez les circuits pour la reporter dans leurs propriétés. ${W("rep-times")} donne, pour chaque circuit, le temps attendu du vainqueur, d'après les résultats des deux dernières
            saisons, et la longueur qui donne un temps visé (chapitre « Ses calculs »).</p>
          <p>La charge vient du nombre de concurrents de chaque circuit : ${W("load")} le reprend des inscriptions officielles quand la course y figure.</p>
          <p>Le contrôle signale aussi : un circuit sans départ, sans arrivée ou sans dénivelée ; deux circuits identiques ; en sprint, des postes à moins de 25 m
            en ligne droite, à vérifier par le chemin de course ; les interpostes courus dans les deux sens ; une définition sans colonne D, ou deux éléments
            (D et E) sans croisement ni jonction pour dire comment ils se rencontrent ; un numéro de boîtier écrit deux fois ou égal au code d'un autre poste ;
            des cases de définitions hors des 5 à 7 mm de la norme. Les itinéraires, leur rapport et le profil : chapitre « Les itinéraires ».</p>
        </section>`,
      itineraires: () => html`
        <section class="mx-slide" id="tr-itineraires">
          <p class="mx-kicker">${K}</p>
          <h2>Les itinéraires</h2>
          <p>${W("routes")} ouvre l'analyse des itinéraires : pour chaque interposte du circuit, l'itinéraire le plus rapide et ses variantes, calculés sur la
            carte, et ceux que vous dessinez. C'est le calcul des analyses des coureurs : la carte est lue symbole par symbole (un fichier OCAD ou Mapper) ou par
            ses couleurs (une image, un PDF), le relief vient du modèle d'altitude, et les zones interdites et les limites que vous avez posées sur le circuit sont fermées.</p>
          <ul class="mx-list">
            <li><b>Calculer</b> traite le circuit en cours ; le petit ▾ calcule l'interposte choisi, ou tous les circuits.</li>
            <li><b>Dessiner</b> ajoute un itinéraire à la main sur l'interposte choisi : une option que le calcul ne propose pas, un passage obligé. Il est collé
              aux chemins et mesuré sur le même modèle (longueur, montée, temps), et reste le vôtre quand vous relancez le calcul.</li>
            <li>Chaque itinéraire a sa lettre et sa couleur, sa <b>longueur</b>, sa <b>montée</b> et son <b>temps</b> à l'allure du circuit. L'étoile ★ marque
              l'itinéraire principal, celui qui compte pour le circuit ; ☆ en choisit un autre. L'œil le masque, le crayon le nomme, la corbeille le supprime.</li>
            <li>Sur la carte, les étiquettes donnent « longueur | montée | temps » : pour l'itinéraire principal, pour tous, ou aucune.</li>
            <li><b>L'allure</b> est celle du coureur attendu, en forêt courante et à plat : elle donne les temps, sans changer le choix des itinéraires.</li>
          </ul>
          <h3>Longueur, dénivelée, supplément du sprint</h3>
          <p>C'est à cela que servent d'abord les itinéraires. Le panneau résume le circuit : sa longueur par les itinéraires principaux, ce qu'elle ajoute à la
            ligne droite, sa montée, son temps. « Reporter sur le circuit… » écrit la dénivelée dans les propriétés du circuit et, si vous le cochez, fait suivre
            sa longueur aux itinéraires : c'est la règle du sprint, où la longueur annoncée est celle de l'itinéraire idéal. Elle se met ensuite à jour
            d'elle-même. ${W("rep-routes")} donne le tout en un texte — chaque interposte avec ses itinéraires, chaque circuit avec son supplément —, à imprimer
            ou en CSV, et reporte tous les circuits d'un coup.</p>
          <h3>Réglages</h3>
          <p>Les réglages (la roue du panneau) valent pour l'événement et sont partagés par l'équipe : l'allure par défaut, le nombre de variantes, ce que vaut
            un mètre de montée, la prudence loin des lignes, le temps pour franchir un talus ou une clôture, et la vitesse de chaque terrain en % de la forêt
            courante. Sur une carte OCAD ou Mapper, ${W("route-table")} va plus loin : symbole par symbole, ce qu'il vaut pour le calcul — sa nature (chemin,
            vert, infranchissable, ignoré…) et sa vitesse —, avec un retour aux valeurs d'Ozimut. Une carte où le vert clair se court mal, un symbole maison : c'est là.</p>
          <p>Les itinéraires ne s'impriment pas. Le ▾ de « Calculer » enregistre une image de la carte avec eux, pour une réunion de traceurs ou un compte rendu.</p>
        </section>`,
      outils: () => html`
        <section class="mx-slide" id="tr-outils">
          <p class="mx-kicker">${K}</p>
          <h2>En équipe et sur le terrain</h2>
          <div class="mx-grid">
            <div class="mx-box" style="--c:var(--s1)"><h3>${ic("team", 18)} L'équipe</h3><p>${W("team")} : créez un lien d'invitation pour un rôle et transmettez-le ; qui l'ouvre connecté rejoint l'équipe, licencié FFCO ou non.
              Le traceur et le contrôleur modifient, le lecteur lit et commente. Un seul modifie à la fois ; les autres peuvent « prendre la main ».</p></div>
            <div class="mx-box" style="--c:var(--s2)"><h3>${ic("comment", 18)} Commentaires</h3><p>${W("comments")} : un commentaire épinglé à un
              endroit de la carte, des réponses, et « Fait » quand c'est réglé ; le nombre de ceux encore ouverts s'affiche sur l'onglet.</p></div>
            <div class="mx-box" style="--c:var(--s3)"><h3>${ic("history", 18)} Versions</h3><p>${W("versions")} : chaque version, ce qui a changé depuis
              (« poste 34 déplacé de 40 m »), et la rouvrir.</p></div>
            <div class="mx-box" style="--c:var(--s4)"><h3>${ic("phone", 18)} Mode terrain</h3><p>Sur le téléphone, la carte géoréférencée avec sa position GPS, le
              poste le plus proche, sa distance et sa direction ; chaque poste noté posé, vérifié, ramassé ou à problème, avec une photo.</p></div>
            <div class="mx-box" style="--c:var(--s5)"><h3>${ic("offline", 18)} Hors ligne</h3><p>${W("offline")} garde l'événement sur l'appareil :
              il s'ouvre sans réseau, et les modifications partent quand le réseau revient.</p></div>
            <div class="mx-box" style="--c:var(--s6)"><h3>${ic("box", 18)} Ramassage</h3><p>${W("rep-pickup")} : à quelle heure chaque poste peut être
              ramassé, et l'ordre de ramassage de chaque ramasseur.</p></div>
            <div class="mx-box" style="--c:var(--s1)"><h3>${ic("tour", 18)} Tournée des postes</h3><p>${W("tour")} : le chemin le plus rapide par les postes cochés (par défaut, tous), pour le contrôleur et pour qui les pose
              ou les ramasse ; numéroté sur la carte, exporté en GPX, en image ou en CSV, ou fait circuit avec ses définitions et son carton de contrôle.</p></div>
          </div>
          <p>La tournée des postes part du départ, d'un poste ou du mieux placé, et finit à l'arrivée, au point de départ ou n'importe où ; elle
            compte l'allure choisie et le temps passé à chaque poste. La carte est lue comme pour les itinéraires calculés des analyses (une carte OCAD
            ou Mapper par ses symboles, les autres par leurs couleurs), les zones interdites et limites du traceur fermées, le relief compté quand la
            carte est géoréférencée ; l'ordre est le plus rapide trouvé (exact jusqu'à 10 postes). « Créer le circuit » en fait un circuit de l'événement, ses postes dans l'ordre de la tournée (un circuit d'essai, hors des
            rapports) : le panneau imprime alors sa carte, ses définitions et son carton de contrôle.</p>
          <p>Aussi : ${W("import-course")} reprend les postes d'un circuit imprimé (un PDF ou une photo d'une course passée), à vérifier ensuite ;
            ${W("view-others")} montre d'autres circuits en pâle, pour éviter les croisements et les postes trop proches.</p>
          <h3>Prêter la carte</h3>
          <p>Le propriétaire d'une carte ne veut pas toujours la donner. Dans ${W("team")}, « Carte prêtée » — sur un membre, ou sur un lien d'invitation —
            laisse tracer sur la carte sans pouvoir l'imprimer ni l'exporter : les PDF sortent avec le circuit seul. Un navigateur ne peut que décourager la
            copie (la carte est à l'écran), pas l'empêcher. Les analyses ont le même réglage : « Exporter une image de la carte », que les organisateurs décochent.</p>
        </section>`,
      apres: () => html`
        <section class="mx-slide" id="tr-apres">
          <p class="mx-kicker">${K}</p>
          <h2>Après la course</h2>
          <p>Le jour de la course ou après (jamais avant : les circuits restent secrets, et les boutons d'Équipe et course › Après la course restent grisés jusque-là), le
            traceur peut :</p>
          <ul class="mx-list">
            <li><b>publier les circuits vers l'analyse</b> (${W("publish")}) : chaque circuit y arrive avec sa carte et son calage, les coureurs n'ont plus qu'à déposer
              leur trace GPS. La même fenêtre règle toute l'analyse : son nom (qui peut différer de celui de l'événement), sa date, qui l'ouvre (tous les comptes, avec ou
              sans les visiteurs, le club, un mot de passe), les actions activées pour les coureurs ; puis « Publier », ou « Enregistrer en brouillon » (seuls ses
              organisateurs la voient). Une fenêtre suit l'avancement — chaque circuit est imprimé sur sa carte puis envoyé —, puis ouvre l'analyse d'un clic, ou sa
              page de gestion (l'onglet « Analyse » de l'événement, dans Orga, où tout reste modifiable). Une nouvelle publication crée une autre analyse, ou met à jour, au choix, l'une de
              celles déjà publiées depuis l'événement (ses circuits et ses réglages remplacés, les traces partagées gardées) ; une compétition n'a qu'une analyse ;</li>
            <li><b>envoyer les circuits à « Résultats »</b> (${W("send-results")}) : un complément aux résultats, pas des résultats. Le fichier de résultats exporté
              par le logiciel de chronométrage (MeOS, OE…) en IOF XML donne déjà la longueur, la dénivelée et les postes de chaque circuit : avec lui, cet envoi n'apporte
              rien. Il sert quand les résultats publiés viennent d'ailleurs — un PDF, liveresultat, WinSplits, O'Live, une page HTML sans en-tête de circuit — et n'ont
              pas ces informations. Les circuits du tracé (en IOF XML) sont alors rapprochés de ceux des résultats par leur nom (« Circuit A » = « A ») ou par leurs postes,
              et seules les valeurs manquantes sont complétées, jamais les temps ni les places : la page de résultats de la course affiche la longueur et la dénivelée,
              « Arena › Analyse » numérote les postes par leurs codes, et la dénivelée des courses passées sert aux estimations de temps du vainqueur des tracés à venir.
              Il faut un événement lié à une compétition, être membre du club organisateur et accepter la publication ; rien n'apparaît avant le lendemain de la course,
              et un nouvel envoi remplace le précédent ;</li>
            <li>lire le <b>bilan</b> (${W("rep-after")}) : pour chaque interposte, le meilleur temps et le temps médian, la part des coureurs qui s'y sont
              trompés, les postes manquants (un boîtier à vérifier ?), et les <b>itinéraires</b> pris, d'après les traces partagées sur l'analyse.</li>
          </ul>
        </section>`,
      ruban: () => {
        // each item of a group: a command, a setting, a figure, the gallery
        const flat = (items) => items.flatMap((it) => (it.t === "stack" ? flat(it.items) : [it]));
        const entry = (it) => {
          if (it.t === "field") { const f = TRD.INFO.field[it.id] || [it.id, ""]; return html`<dt>${ic("sliders", 16)}<span>${f[0]}</span></dt><dd>${f[1]}</dd>`; }
          if (it.t === "chip") return html`<dt>${ic("list", 16)}<span>${{ issues: "Les problèmes", course: "Le circuit en cours", mapInfo: "La carte", geoInfo: "Géoréférencée ?", control: "Le poste", leg: "L'interposte", special: "L'objet", drawing: "Le tracé" }[it.id] || ""}</span></dt><dd>${TRD.INFO.chip[it.id] || ""}</dd>`;
          if (it.t === "modes") return html`<dt>${ic("palette", 16)}<span>${it.id === "blend" ? "Par-dessus, Mélangé, En couches" : "Aucun, Tout, Le début, La fin"}</span></dt><dd>${TRD.INFO.modes[it.id]}</dd>`;
          if (it.t === "gallery") return html`<dt>${ic("special", 16)}<span>La galerie</span></dt><dd>${TRD.INFO.gallery}</dd>`;
          return html`<dt>${ic(it.icon, 16)}<span>${it.label}${it.key && it.key.length === 1 ? ` (${it.key})` : ""}</span></dt><dd>${it.tip || MENU_HELP[it.act] || ""}${it.split ? ` Le petit ▾ : ${it.split.map((x) => x[1]).join(", ")}.` : ""}</dd>`;
        };
        const groups = (gs) => gs.map((g) => html`<h4 class="tr-doc-gh">${g.title || "—"}${g.pro ? " — niveau avancé" : ""}</h4><dl class="tr-doc-menu">${flat(g.items).map(entry)}</dl>`);
        return html`
        <section class="mx-slide" id="tr-ruban">
          <p class="mx-kicker">${K}</p>
          <h2>Le ruban, onglet par onglet</h2>
          <p>Chaque commande du ruban, avec l'icône qu'elle porte dans le tracé : les onglets, ceux de l'objet choisi, puis le menu Fichier : ses listes (les formats d'export, les imports, le partage) s'ouvrent dans une fenêtre où chaque fichier dit à quoi il sert.</p>
          ${TRD.TABS.filter((tb) => tb.groups).map((tb) => html`<h3 class="tr-doc-mh">${ic(tb.icon, 20)}<span>${tb.label}</span></h3>${groups(tb.groups)}`)}
          <h3 class="tr-doc-mh">${ic("select", 20)}<span>Les onglets de l'objet choisi</span></h3>
          ${Object.values(TRD.CONTEXT).map((c) => html`<h4 class="tr-doc-gh">${c.label}</h4><dl class="tr-doc-menu">${c.groups.flatMap((g) => flat(g.items)).map(entry)}</dl>`)}
          <h3 class="tr-doc-mh">${ic("file", 20)}<span>Le menu Fichier</span></h3>
          ${TRD.BACKSTAGE.map((sec) => html`<h4 class="tr-doc-gh">${sec.label}</h4><dl class="tr-doc-menu">${
            sec.act ? html`<dt>${raw(TR.actIcon(sec.act, 16))}<span>${sec.label}</span></dt><dd>${MENU_HELP[sec.act] || ""}</dd>`
              : sec.id === "info" ? html`<dt>${ic("sliders", 16)}<span>Informations</span></dt><dd>L'événement : sa carte, ses circuits, votre rôle, le chiffrement ; ses propriétés, son équipe.</dd>`
                : sec.id === "options" ? html`<dt>${ic("sliders", 16)}<span>Options</span></dt><dd>Le ruban complet, sur une ligne ou ses onglets seuls ; la barre d'accès rapide ; les fichiers multiples.</dd>`
                  : [...(sec.items || []), ...(sec.groups || []).flatMap((x) => x[1])].map(([act, l, d]) => html`<dt>${raw(TR.actIcon(act, 16))}<span>${l}</span></dt><dd>${d}</dd>`)}</dl>`)}
        </section>`;
      },
      avance: () => html`
        <section class="mx-slide" id="tr-avance">
          <p class="mx-kicker">${K}</p>
          <h2>Le niveau avancé</h2>
          <p>Le tracé a deux niveaux. Le niveau <b>essentiel</b>, pour tous, fait ce que fait un fichier Purple Pen, plus le travail en
            équipe, le terrain, les vérifications et l'après-course d'Ozimut. Le niveau <b>avancé</b> ajoute ce que fait Condes, un autre
            logiciel de tracé, pour des besoins plus pointus ; il est ouvert à tous. Ses boutons portent un petit point orange.
            Un fichier Purple Pen (.ppen) ne garde pas ces ajouts : l'export dit avant ce qu'il laisse de côté ; le fichier Ozimut
            (.ozmt) garde tout.</p>
          <h3>Venir d'un autre logiciel</h3>
          <p>${W("import-courses")} reprend les postes, les circuits, les catégories et les équipes de relais d'un IOF XML (3.0 ou
            2.0.3) exporté de Condes, d'OCAD, de Purple Pen ou d'un logiciel de chronométrage, ou les circuits d'une carte OCAD préparée
            avec son module de traçage (vérifié sur un fichier d'OCAD 2018 : postes, définitions, départ, circuits). Un IOF XML
            déposé avec sa carte sur « Importer un événement » crée l'événement. Les variantes arrivent comme des circuits à part.</p>
          <h3>Les catégories</h3>
          <p>${W("classes")} : chaque catégorie, son circuit et ses concurrents attendus. La liste des catégories d'un circuit et ses
            concurrents en découlent, et avec eux la charge des postes.</p>
          <h3>Variantes et relais</h3>
          <p>Le <b>losange</b> (${W("var-phi")}) part du poste choisi vers le suivant : deux branches courues l'une après l'autre, avec
            un retour entre elles ; les variantes s'appellent AB et BA. On ajoute les postes de chaque branche et du retour en choisissant
            la variante au-dessus de la carte. Une fourche ou des boucles peuvent avoir jusqu'à 20 branches. Dans ${W("relay")} :
            remplir les équipes avec les mêmes variantes dans un autre ordre, coupler des fourches (« A=C » : qui court A court C sur le
            même relais), cocher les relais où chaque branche est courue, et modifier les équipes à la main (dossard, nom, variante de
            chaque relais), les cases qui rendent une équipe différente des autres en rouge.</p>
          <h3>Formes et disciplines</h3>
          <p>Les propriétés d'un circuit donnent sa <b>forme</b> — normale, circuit jalonné (le fil suivi le long des itinéraires
            dessinés), trail-O —, les traits entre les postes ou non, sa <b>discipline</b> (VTT-O : longueurs le long des itinéraires ;
            ski-O : un point au centre des cercles), le rogaine (points = code arrondi à la dizaine) et « tous les postes ». Un poste
            peut être en <b>ordre libre</b> (${W("random-section")}) : pas de trait vers, entre ni depuis les postes de la section, et une
            ligne dans les définitions. ${W("finish-at-start")} dessine l'arrivée sur le départ.</p>
          <p>Les symboles du <b>VTT-O</b> (ISMTBOM 2022) sont dans les objets spéciaux : sens unique obligatoire, itinéraire interdit,
            section dangereuse, obstacle sur la piste, passage interdit ; ils sont dessinés d'après la description de la norme, leurs
            dimensions sont à vérifier.</p>
          <h3>Postes et définitions</h3>
          <p>Les propriétés d'un poste ajoutent ses autres boîtiers, un verrou (il ne bouge plus quand on le glisse) et, en trail-O, ses
            balises (« A–E », en colonne B) et sa bonne réponse. Une case de définition peut porter un second symbole (cocher
            « 2ᵉ symbole » en le choisissant) ; ${W("my-symbols")} ajoute des symboles à vous, tirés de dessins SVG ; les propriétés de
            l'événement mettent sa date après le titre.</p>
          <h3>Vérifier et mesurer</h3>
          <p>${W("view-angles")} montre le virage à chaque poste (en rouge au-delà de 120°), ${W("view-nearest")} entoure les postes
            trop proches ; ${W("rep-controls")} donne chaque poste avec ses boîtiers et le poste le plus proche, ${W("trail-answer")} les
            bonnes réponses. Un interposte peut avoir plusieurs itinéraires (${W("routes-alt")}), la longueur prenant le plus court. Hors
            de France, la dénivelée vient des tuiles de terrain ouvertes (SRTM, à 30 m environ).</p>
          <h3>Mise en page et impression</h3>
          <p>Les objets spéciaux ajoutent l'<b>agrandissement</b> (un cadre qui montre une autre partie de la carte, agrandie, avec le
            circuit) et le <b>masque</b> (blanc, avec des trous). Le PDF des circuits ajoute : plusieurs circuits ou copies par feuille,
            tous les circuits sur une même carte, le dos de chaque carte (nom, catégories, équipe et relais), des repères de calage avec
            le décalage de l'imprimante, et des pages géoréférencées (Avenza Maps). Les définitions se placent au centième de millimètre,
            et les cartons de contrôle peuvent être des cartons de secours.</p>
          <p>Pour une <b>imprimerie offset</b>, les couleurs du PDF peuvent être des <b>encres d'accompagnement</b> : celles qu'une carte
            OCAD définit, et le violet dans une encre à part (ou l'une des encres de la carte, si on lui donne son nom), avec la vraie
            surimpression de PDF. Les <b>séparations</b> donnent une page par plaque — chaque encre d'accompagnement, ou C, M, J et N —, en
            noir, avec ses repères de calage et son nom ; elles demandent une carte OCAD ou Mapper, ou le circuit seul. C'est le même
            moteur que les séparations de Carto.</p>
          <h3>Autres formats</h3>
          <p>${W("export-geotiff")}, SVG (chaque objet nommé), KMZ avec la carte, MapRun, le texte OCAD des circuits, IOF XML 2.0.3 avec
            chaque variante comme un circuit, et un paquet pour la page d'import de Livelox (l'envoi direct à Livelox demande un accord avec
            Livelox).</p>
          <h3>Cartes</h3>
          <p>${W("maps")} : d'autres cartes dans l'événement, calées sur la première (par leurs géoréférencements, le même cadre, ou deux
            points sur chacune), et la carte de chaque partie d'un circuit. ${W("map-templates")} montre les modèles d'une carte OCAD qu'on lui donne. ${W("field-states")} nomme les états des
            postes en mode terrain.</p>
        </section>`,
      calculs: () => html`
        <section class="mx-slide" id="tr-calculs">
          <p class="mx-kicker">Le tracé</p>
          <h2>Ses calculs, expliqués</h2>
          <h3>Le temps du vainqueur</h3>
          <p>Sur les résultats officiels des deux dernières saisons (environ une centaine de courses du même format), on relève pour chaque circuit l'allure du
            vainqueur, en minutes par kilomètre, et son CN officiel 15 jours avant. Plus le CN est haut, plus l'allure est rapide : la relation est ajustée une
            fois pour toutes, et donne l'allure d'un vainqueur de CN donné. Par exemple, sur un même circuit, un vainqueur de CN 6 500 court à peu près 1,3 fois
            plus vite qu'un vainqueur de CN 3 000.</p>
          <p>Les résultats officiels ne donnent pas la dénivelée des circuits ; les fichiers des organisateurs la donnent souvent (« Résultats »). Sur ces circuits, on compare le
            temps du vainqueur à celui que son CN laisse attendre, selon la dénivelée par kilomètre : plus le circuit monte, plus le vainqueur met de temps.
            Pour ne pas se fier à quelques circuits, la mesure est rapprochée de la règle du kilomètre-effort (100 m de montée valent 1 km de plat, soit
            +10 % de temps pour 10 m de plus par kilomètre), d'autant plus qu'elle est imprécise. En longue distance, la mesure redonne cette règle ; en sprint,
            où l'on court vite et où chaque montée coûte davantage, elle est plus forte.</p>
          <p>Chaque estimation donne une fourchette : la moitié des courses de référence ont un temps de vainqueur dans cette fourchette, car le terrain,
            la végétation et la difficulté technique, qui comptent beaucoup, ne sont pas dans le calcul.</p>
          <h3>Les erreurs et les itinéraires</h3>
          <p>Une erreur, comme dans « Temps intermédiaires » : au moins 20 % et 10 secondes perdus sur l'interposte par rapport à l'allure du coureur sur
            l'ensemble de sa course. Deux itinéraires sont le même quand les deux traces restent à moins d'une quinzaine de pour cent de la longueur de
            l'interposte (25 m au moins) l'une de l'autre tout du long ; le côté (« par la gauche », « tout droit ») se lit par rapport à la ligne droite.</p>
          <h3>Le plan de ramassage</h3>
          <p>Un poste peut être ramassé quand le dernier coureur de chaque circuit qui y passe l'a passé : son heure de départ, plus la distance jusqu'au poste
            à l'allure d'un coureur lent (15 min/km en forêt, 9 en sprint, en ligne droite), plus une marge. Les postes sont partagés entre les ramasseurs par
            secteur, et chacun les prend dans l'ordre où il peut les atteindre.</p>
          <h3>Les itinéraires et la dénivelée</h3>
          <p>Le calcul des itinéraires pose sur la carte une grille d'environ 1,5 m (1 m en sprint). Chaque case a une vitesse — celle de son terrain, en % de la
            forêt courante — et une altitude. Courir d'une case à la voisine coûte la distance divisée par la vitesse, plus la pente : un mètre de montée vaut
            8 m à plat. Loin des chemins, des ruisseaux et des limites nettes, la prudence ajoute jusqu'à 20 % : on y court moins vite parce qu'il faut lire.
            Franchir un talus ou une clôture coûte 10 secondes. L'itinéraire le plus rapide est le chemin de moindre coût ; les variantes sont les autres
            chemins vraiment différents, tant qu'ils ne sont pas 25 % plus lents. Le temps affiché est ce coût, sans la prudence, à l'allure donnée.</p>
          <p>La montée d'un itinéraire est lue sur le modèle d'altitude, un point tous les quelques mètres, lissée sur trois points pour que les petites bosses
            du modèle ne s'additionnent pas : c'est le même chiffre dans le panneau, le rapport, le profil et « Dénivelée ».</p>
        </section>`,
    };
    return buildChapters(CHAPTERS, CH, "principe");
  }

  /** A panel with chapters: the sub-tab bar, then every chapter's content in its own panel (the others hidden). */
  function buildChapters(chapters, CH, first) {
    return raw(subTabs(chapters, first).s.replace(/<div data-subpanel="([a-z]+)"( hidden)?><\/div>/g, (m0, k, hid) =>
      `<div data-subpanel="${k}"${hid || ""}>${CH[k]().s}</div>`));
  }

  // ======================================================================================================
  // 4. Les calculs du site
  // ======================================================================================================
  function calculs() {
    const CH = {
      clubs: () => html`
        <section class="mx-slide" id="clubs">
          <p class="mx-kicker">Clubs</p>
          <h2>Classements des clubs</h2>
          <p>Un club se classe selon deux choix indépendants, sur les coureurs d'un sexe et d'une tranche d'âge donnés (jeunes : jusqu'à H/D 20 ;
            adultes : H/D 21 et plus ; élite : H/D 21 seulement).</p>
          <div class="mx-grid">
            <div class="mx-box" style="--c:var(--s1)"><h3>Ce que l'on compte</h3><p>Le <b>CN</b> de chaque coureur classé, dans la méthode choisie, ou ses
              <b>points en courses nationales</b>.</p></div>
            <div class="mx-box" style="--c:var(--s3)"><h3>Comment on l'additionne</h3><p>La <b>somme</b>, qui mêle le nombre de coureurs et leur niveau ; la
              <b>moyenne</b>, le niveau du coureur moyen ; le <b>top 5</b>, la moyenne des cinq meilleurs, un coureur manquant comptant 0 ; ou l'<b>effectif</b>.</p></div>
          </div>
        </section>
        <section class="mx-slide" id="elite">
          <p class="mx-kicker">Clubs</p>
          <h2>Points en courses nationales</h2>
          <p>Ces points ne dépendent d'aucune méthode de CN : ils reposent sur les places. Aux courses de niveau national (championnats de France,
            nationales, courses de sélection, soit les groupes A et B1), les 10 premiers de chaque catégorie marquent 25, 18, 15, 12, 10, 8, 6, 4, 2 et 1
            points. Les points sont <b>doublés aux championnats de France</b>. Une catégorie est rattachée au circuit où la plupart de ses coureurs ont
            couru. La page des clubs compte les points des 12 mois qui précèdent la date choisie ; la comparaison de clubs les montre saison par saison.</p>
        </section>
        <section class="mx-slide" id="cfc">
          <p class="mx-kicker">Clubs</p>
          <h2>Coupe de France des clubs</h2>
          <p>Le site applique à chaque saison la règle 2026 de la FFCO (« Classement national des clubs », annexe 2). Pour chaque coureur, on prend ses
            5 meilleurs scores officiels de l'année à pied et ses 5 meilleurs en VTT ou en ski ; les points des dames sont multipliés par 1,4 ; le club
            additionne les points de ses coureurs. Ce calcul n'est pas officiel : tous les coureurs classés comptent, car le site ne connaît pas le type de
            licence, et le club d'un coureur est celui de sa dernière course de l'année. La coupe n'a pas été décernée de 2023 à 2025.</p>
        </section>`,
      coureurs: () => html`
        <section class="mx-slide" id="progression">
          <p class="mx-kicker">Coureurs</p>
          <h2>Progression par âge</h2>
          <p>Pour chaque saison et chaque catégorie (H14, D21, H45…), le site prend les CN de tous les coureurs classés à la fin de la saison et regarde
            comment ils se répartissent : la médiane, et les zones où se trouvent la moitié et les quatre cinquièmes des coureurs. Chaque mois, le CN d'un
            coureur est situé dans cette répartition : son <b>centile</b> est la part des coureurs de sa catégorie qui ont un CN inférieur ou égal. Un
            coureur au 90<sup>e</sup> centile fait mieux que 90 % de sa catégorie. La courbe « toutes saisons » regroupe les saisons depuis 2012 : c'est
            une photographie de l'ensemble des coureurs, pas le suivi d'une même génération.</p>
        </section>
        <section class="mx-slide" id="categories">
          <p class="mx-kicker">Coureurs</p>
          <h2>Les catégories côte à côte</h2>
          <p>La page « Catégories » montre, à une fin de mois, la répartition des CN de chaque catégorie sur un même axe : une bande claire du
            10<sup>e</sup> au 90<sup>e</sup> centile, la moitié centrale plus foncée (du 25<sup>e</sup> au 75<sup>e</sup>), la médiane et la moyenne. On
            y voit d'un coup d'œil où les catégories se recouvrent : en forêt, en octobre 2026, l'indice Ozimut médian des H55 valait celui des H16.</p>
          <p>Les points désignent <b>les meilleurs de chaque catégorie</b>, par une seule règle, la même partout : dans chaque catégorie
            d'au moins 5 coureurs classés, ses 2 % meilleurs (arrondi à l'unité inférieure), et au moins son premier ; à CN égal à la
            limite, tous. Une catégorie de 76 coureurs en montre donc un, une de 192 en montre trois, une de 275 en montre cinq. Une
            règle fondée sur l'écart de chaque catégorie (repérer les CN qui « sortent de la boîte » d'une boîte à moustaches) aurait
            traité les catégories différemment : plus une catégorie est étalée, plus il faut d'avance pour en sortir, et des catégories
            entières seraient restées sans personne. Pour chacun, la page donne son rang dans sa catégorie, combien de fois la médiane
            de celle-ci il vaut, et son centile s'il courait en H21 ou en D21.</p>
        </section>
        <section class="mx-slide">
          <p class="mx-kicker">Coureurs</p>
          <h2>La page d'un coureur</h2>
          <ul class="mx-list">
            <li><span><b>Calcul du CN</b> : à n'importe quelle date, les courses des 12 derniers mois, celles qui comptent et le CN qui en sort, refait
              exactement, avec les mêmes arrondis et la même règle des places, à partir des scores publiés course par course.</span></li>
            <li><span><b>Historique du CN</b> : chaque course qui entre dans les 12 derniers mois et chaque course qui en sort, avec le CN qui en résulte et sa
              variation. Pour le CN officiel, c'est l'historique publié par la FFCO, lu en direct.</span></li>
            <li><span><b>Progression</b> : le CN mois par mois, puis la place du coureur dans sa catégorie d'âge. Après un changement de méthode, la méthode
              précédente reste affichée en gris le temps de la visite.</span></li>
            <li><span><b>Carte</b> : les courses par département. <b>Saisons</b> : le bilan de chaque saison. <b>Réseau</b> : les coureurs rencontrés.</span></li>
          </ul>
        </section>`,
      reseau: () => html`
        <section class="mx-slide" id="reseau">
          <p class="mx-kicker">Réseau</p>
          <h2>Qui court avec qui</h2>
          <p>Deux coureurs se « rencontrent » quand ils courent le même circuit. Sur toutes les saisons, le site retient pour chaque coureur les 30 coureurs
            qu'il a rencontrés le plus souvent, au moins 2 fois ; pour une saison, il les recalcule avec les résultats de cette saison. Il compte aussi combien
            de fois chacun a terminé devant l'autre. Un coureur non classé (poinçon manquant, abandon…) est derrière tous les classés.</p>
        </section>
        <section class="mx-slide">
          <p class="mx-kicker">Statistiques</p>
          <h2>Territoires, participation, âges</h2>
          <ul class="mx-list">
            <li><span><b>Territoires</b> : le nombre de compétitions organisées, de coureurs, et de compétitions pour 100 coureurs, par ligue ou par
              département. Une compétition est rattachée à son organisateur : le club (les deux premiers chiffres de son numéro donnent le département), le
              comité départemental ou la ligue.</span></li>
            <li><span><b>Participation</b> : les grands chiffres saison par saison, pour tous, pour une ligue ou pour un club, dans une spécialité ou dans
              toutes.</span></li>
            <li><span><b>Âges</b> : la répartition des coureurs entre les catégories d'âge, dames à gauche, hommes à droite, en part de l'ensemble choisi.</span></li>
            <li><span><b>Les plus actifs</b> : les coureurs qui ont couru le plus de courses, sur toutes les saisons, la dernière ou celle en cours, avec le nombre de
              chaque type (longue et moyenne distance, nuit, sprint, VTT, ski). PM et abandons comptent : le coureur a pris le départ.</span></li>
          </ul>
        </section>`,
      relais: () => html`
        <section class="mx-slide">
          <p class="mx-kicker">Relais</p>
          <h2>Le simulateur de relais</h2>
          <ul class="mx-list">
            <li><span><b>Le modèle</b> : le temps d'un coureur sur un relais est inversement proportionnel à son CN. Un coureur de CN deux fois plus haut met
              deux fois moins de temps. Le temps de référence de chaque relais est calé pour que la meilleure équipe de tous les clubs réalise exactement la
              somme des temps de référence du format (en CNE, la moyenne des 5 meilleures équipes).</span></li>
            <li><span><b>Les formats</b> suivent les règles 2026 de la FFCO : CFC N1 à N4 avec leurs conditions de composition et leurs relais réservés (les
              premiers et derniers relais dames et hommes alternent selon que l'année est paire ou impaire), CNE hommes, dames, jeunes et mini, relais de
              catégorie, relais sprint (2 dames, 2 hommes, dans l'ordre D-H-H-D). On peut aussi composer son propre format.</span></li>
            <li><span><b>La meilleure équipe est la vraie meilleure</b> : le site essaie toutes les façons de répartir les conditions entre les relais, puis
              choisit les coureurs par une méthode exacte d'affectation (l'algorithme hongrois). L'âge et le sexe viennent de la catégorie : un vétéran qui
              court en H21 compte comme un H21. On peut modifier la première équipe coureur par coureur, et ajouter les coureurs qui n'ont pas de CN
              (étrangers, coureurs de relais seulement) avec le CN qu'on leur prête.</span></li>
          </ul>
        </section>`,
      limites: () => html`
        <section class="mx-slide" id="limites">
          <p class="mx-kicker">À garder en tête</p>
          <h2>Limites et précautions</h2>
          <ul class="mx-list bad">
            <li><span>Les données proviennent du site du classement national de la FFCO. Une course absente, mal saisie ou corrigée ensuite peut expliquer un
              écart.</span></li>
            <li><span>La méthode Ozimut part des CN de 2010 ; ses premiers mois reflètent surtout ce point de départ.</span></li>
            <li><span>Ses indices ne remplacent en aucun cas le classement officiel, qui reste la seule référence.</span></li>
            <li><span>Les classements mensuels sont calculés en fin de mois ; la page d'un coureur détaille le calcul à n'importe quelle date.</span></li>
            <li><span>Les résultats provisoires sont ceux des organisateurs, avant toute correction de la FFCO.</span></li>
          </ul>
        </section>`,
    };
    return buildChapters(SITE_CHAPTERS, CH, SITE_CHAPTERS[0][0]);
  }

  // how far the methods agree, per discipline: each visible computed method against the official one.
  // meta.agreement rows: [official, fair, top6w]
  const AGREE_COL = { fair: 1, top6w: 2 };
  const computed = M.filter((m) => m !== "official");     // never the Fits (M excludes them)
  let agTerrain = "For";
  function drawAgreement() {
    if (!$("#agr-filters", main)) return;
    $("#agr-filters").innerHTML = html`<div class="field"><span>${t("f.terrain")}</span>${seg("agt", TERRAINS.filter((x) => meta.agreement[x]?.length).map((x) => [x, t(`terrain.${x}`)]), agTerrain)}</div>`;
    $$('[data-seg="agt"]').forEach((b) => b.addEventListener("click", () => { agTerrain = b.dataset.value; drawAgreement(); }));
    const pts = meta.agreement[agTerrain] || [];
    const series = computed.map((m) => ({
      m, name: methodShort(m), color: methodColor(m),
      data: pts.filter((p) => p[0] && p[AGREE_COL[m]]).map((p) => [p[0], p[AGREE_COL[m]]]),
    }));
    const max = Math.ceil(Math.max(0, ...pts.flat().filter(Boolean)) / 1000) * 1000;
    $("#agr-legend").innerHTML = legend(series.map((s) => ({ label: `${s.name} / ${methodShort("official")}`, color: s.color, dot: true })));
    scatterChart($("#agr"), { series, xName: methodLabel("official"), yName: "Indice Ozimut", max });
    const stat = (name, pairs) => {
      const d = pairs.map((p) => p[1] - p[0]);
      return { name, n: pairs.length, r: pearson(pairs.map((p) => p[0]), pairs.map((p) => p[1])), bias: mean(d), mae: mean(d.map(Math.abs)) };
    };
    const stats = series.map((x) => stat(`${x.name} / ${methodShort("official")}`, x.data));
    $("#agr-stats").innerHTML = html`<div class="table-wrap"><table class="data compact"><thead><tr>
      <th>Méthodes comparées</th><th class="r">Coureurs</th><th class="r">Corrélation</th><th class="r">Écart moyen</th><th class="r">Écart moyen absolu</th></tr></thead>
      <tbody>${stats.map((s) => html`<tr><td>${s.name}</td><td class="r num">${fmt(s.n)}</td>
        <td class="r num">${fmt(s.r, 3)}</td><td class="r num">${fmtSigned(Math.round(s.bias))}</td><td class="r num">${fmt(s.mae)}</td></tr>`)}</tbody></table></div>`;
    $("#agr-table").innerHTML = $("#agr-stats").innerHTML;
  }
  // the evaluation's season-by-season chart: one measure, one comparison, one scope, forest and sprint side by side
  let evMeas = "acc", evScope = "all", evPeriod = "holdout";
  const evPair = "top6w-official";
  const EV_PAIRS = () => [evPair];
  function drawEval() {
    if (!ev || !$("#ev-seasons", main)) return;
    $("#ev-controls").innerHTML = html`
      <div class="field"><span>Mesure</span>${seg("evm", EVM.map((m) => [m, EV_LABEL[m]]), evMeas)}</div>
      <div class="field"><span>Courses</span>${seg("evs", [["all", "toutes"], ["nat", "nationales"]], evScope)}</div>`;
    $$('[data-seg="evm"]').forEach((x) => x.addEventListener("click", () => { evMeas = x.dataset.value; drawEval(); }));
    $$('[data-seg="evs"]').forEach((x) => x.addEventListener("click", () => { evScope = x.dataset.value; drawEval(); }));
    $("#ev-seasons").innerHTML = html`${["For", "Spr"].map((tr) => {
      const rows = evRows(tr, evScope);
      const items = [...evSeasons(tr, evScope).map((y) => ({ label: y, d: rows[y].d[evPair][evMeas], n: rows[y].comps })),
        ...[["holdout", `${ev.holdout[0]}–${String(ev.holdout[1]).slice(2)}`], ["tuned", "mise au point"]]
          .filter(([k]) => rows[k]).map(([k, label]) => ({ label: html`<b>${label}</b>`, d: rows[k].d[evPair][evMeas] }))];
      const up = items.filter((i) => i.d[1] > 0).length, against = items.filter((i) => i.d[2] < 0).length;
      return html`<section class="card"><div class="card-head"><div><h2>${t(`terrain.${tr}`)} · ${pairLabel(evPair)}</h2>
        <div class="hint">${EV_LABEL[evMeas]} (écart en points)</div></div></div>
        <div class="card-body">${forestPlot(items, evMeas)}
          <p class="muted" style="font-size:12.5px;margin:8px 0 0">Écart significatif en faveur de « ${methodShort(evPair.split("-")[0])} » :
            ${fmt(up)} ligne${up > 1 ? "s" : ""} sur ${fmt(items.length)} ; en faveur de « ${methodShort(evPair.split("-")[1])} » : ${fmt(against)}.</p></div></section>`;
    })}`;
    const shown = M.filter((m) => ev.methods.includes(m));
    $("#ev-periods").innerHTML = html`
      <div class="filters"><div class="field"><span>Période</span>${seg("evq", [["holdout", `${ev.holdout[0]}–${ev.holdout[1]} (saisons mises de côté)`],
        ["tuned", "juillet 2025 – octobre 2026 (mise au point)"]], evPeriod)}</div></div>
      <div class="grid grid-2">${["For", "Spr"].map((tr) => {
        const e = evRows(tr, "all")[evPeriod], en = evRows(tr, "nat")[evPeriod];
        if (!e) return "";
        const best = (meas) => Math.max(...shown.map((m) => e[meas][m]));
        return html`<section class="card"><div class="card-head"><div><h2>${t(`terrain.${tr}`)}</h2>
          <div class="hint">${fmt(e.comps)} compétitions, ${fmt(e.circuits)} circuits, ${fmt(e.runners)} résultats</div></div></div>
          <div class="table-wrap"><table class="data compact"><thead><tr><th>Méthode</th>${EVM.map((m) => html`<th class="r">${EV_LABEL[m]}</th>`)}</tr></thead>
            <tbody>${shown.map((m) => html`<tr><td>${methodKey(m)} ${methodShort(m)}</td>${EVM.map((meas) => {
              const x = evFmt(meas, e[meas][m], false) + (meas === "r2" || meas === "acc" ? " %" : "");
              return html`<td class="r num">${e[meas][m] === best(meas) ? html`<b>${x}</b>` : x}</td>`;
            })}</tr>`)}</tbody></table></div>
          <div class="card-body"><h3 style="margin:0 0 6px;font-size:14px">Écarts, toutes les courses</h3>
            ${forestPlot(EV_PAIRS().map((p) => ({ label: pairLabel(p), d: e.d[p][evMeas] })), evMeas)}
            ${en ? html`<h3 style="margin:12px 0 6px;font-size:14px">Écarts, courses nationales (${fmt(en.comps)} compétitions)</h3>
              ${forestPlot(EV_PAIRS().map((p) => ({ label: pairLabel(p), d: en.d[p][evMeas] })), evMeas)}` : ""}
            <p class="muted" style="font-size:12.5px;margin:8px 0 0">Mesure des écarts : ${EV_LABEL[evMeas].toLowerCase()} (choisie plus haut).</p></div></section>`;
      })}</div>`;
    $$('[data-seg="evq"]').forEach((x) => x.addEventListener("click", () => { evPeriod = x.dataset.value; drawEval(); }));
  }
  return { TABS, STUDY_TAB, STUDY_CHAPTERS, SITE_CHAPTERS, lede, note, officiel, top, etude, calculs, tracerDoc, drawAgreement, drawEval };
}
