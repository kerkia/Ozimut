// The documentation's texts in German (pages/methods.js builds the page, its data and its tabs; methods.fr.js is the reference, kept in step:
// the same structure, the same figures, the German words). build(X) receives the page's neutral helpers and data
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
  const TABS = [["officiel", "Offizieller CN"], ["top", "Ozimut-Methode"], ["calculs", "Läufer und Vereine"], ["tracer", "Bahnlegung"]]
    .filter(([k]) => fr || (k !== "officiel" && k !== "calculs"));
  const STUDY_TAB = ["etude", "Die Studie"];
  const STUDY_CHAPTERS = [["objectifs", "Ziele"], ["depart", "Der Ausgangspunkt"], ["mesure", "Die Messung"],
    ["choix", "Entscheidungen und Varianten"], ["resultats", "Die Ergebnisse"], ["conclusion", "Die gewählte Methode"]];
  // (the results and split times moved to the guide's « Courses » on 2026-10-24: guide.*.js)
  const SITE_CHAPTERS = [["clubs", "Vereine"], ["coureurs", "Läufer"], ["reseau", "Netzwerk"], ["relais", "Staffeln"], ["limites", "Grenzen"]];
  // (Stats' documentation, since 2026-10-31: one documentation per module)
  const lede = fr ? html`Wie die Ranglisten berechnet werden: der offizielle CN, die Ozimut-Methode und die Studie, die sie bestätigt hat, sowie die Berechnungen auf den Seiten der Läufer und Vereine.`
    : html`Wie die Rangliste berechnet wird: die Ozimut-Methode und die Studie, die sie an den französischen Ergebnissen bestätigt hat.`;
  const note = !fr ? "" : html`Nur die ${methodLabel("official")} übernimmt Werte, die der französische Orientierungslaufverband (FFCO) veröffentlicht; die Ozimut-Methode ist eine alternative Berechnung, die die Website mit denselben Ergebnissen durchführt.`;
  const pctOf = (x) => `${fmt(100 * x)} %`;
  const force = html`das übliche Niveau der Läufer`;
  const EV_LABEL = { acc: "Richtig vorhergesagte Duelle", r2: "Erklärte Zeitunterschiede" };
  const forestPlot = (items, meas) => {
    if (!items.length) return html`<div class="empty">—</div>`;
    const lo = Math.min(0, ...items.map((i) => i.d[1])), hi = Math.max(0, ...items.map((i) => i.d[2]));
    const pad = (hi - lo) * 0.04 || 0.01, a = lo - pad, span = hi + pad - a;
    const pos = (x) => ((x - a) / span) * 100;
    return html`<div class="ev-forest">${items.map((i) => {
      const cls = i.d[1] > 0 ? "up" : i.d[2] < 0 ? "down" : "flat";
      return html`<div class="ev-row ${cls}" title="${cls === "flat" ? "das Intervall enthält 0: Unterschied nicht signifikant" : "signifikanter Unterschied"}">
        <span class="ev-lab">${i.label}</span>
        <span class="ev-val num">${evFmt(meas, i.d[0])}<span class="dim"> [${evFmt(meas, i.d[1])}; ${evFmt(meas, i.d[2])}]</span></span>
        <span class="ev-track"><i class="ev-zero" style="left:${pos(0)}%"></i>
          <i class="ev-ci" style="left:${pos(i.d[1])}%;width:${Math.max(0.6, pos(i.d[2]) - pos(i.d[1]))}%"></i>
          <i class="ev-pt" style="left:${pos(i.d[0])}%"></i></span></div>`;
    })}</div>`;
  };
  const shareName = (f) => (f >= 1 ? "das ganze Feld" : Math.abs(f - 2 / 3) < 0.01 ? "die schnellsten zwei Drittel" : `die schnellsten ${fmt(Math.round(100 * f))} %`);
  const shareShort = (f) => (f >= 1 ? "100 %" : Math.abs(f - 2 / 3) < 0.01 ? "zwei Drittel" : `${fmt(Math.round(100 * f))} %`);
  const years = (d) => (d === 365 ? "12 Monate" : `${fmt(Math.round(d / 365))} Jahre`);
  const r6Table = (level, extra) => html`<div class="table-wrap"><table class="data compact"><thead><tr><th>Läufer</th><th class="r">${level}</th>
    <th class="r">Zeit</th><th class="r">${level} × Zeit</th>${extra.map(([h]) => html`<th class="r">${h}</th>`)}</tr></thead>
    <tbody>${RACE6.map(([name, c, tm], i) => html`<tr><td>${name}</td><td class="r num">${n0(c)}</td><td class="r num">${fmt(tm)} min</td>
      <td class="r num">${n0(r6.prod[i])}</td>${extra.map(([, f]) => html`<td class="r num">${f(i, tm)}</td>`)}</tr>`)}</tbody></table></div>`;

  // ======================================================================================================
  // 1. CN officiel
  // ======================================================================================================
  function officiel() {
    return html`
    <section class="mx-slide" style="${cvar("official")}">
      <p class="mx-kicker">${methodKey("official")} ${methodLabel("official")}</p>
      <h2>Der Score eines Laufs</h2>
      <p>Jeder Lauf bringt jedem klassierten Läufer einen Score. Dieser Score hängt von der Zeit des Läufers und von der Schwierigkeit der Bahn ab. Die Schwierigkeit
        wird an den anwesenden Läufern gemessen, anhand ihres CN: das ist der <b>Bahnwert</b>.</p>
      <p>Für jeden Läufer mit einem CN multipliziert man seinen CN mit seiner Zeit: Ein Läufer mit CN 6000, der 50 Minuten läuft, ergibt 300.000. Der
        Bahnwert ist der Mittelwert dieser Produkte für die schnellsten zwei Drittel der Läufer mit einem CN. Der Score eines Läufers ist der
        Bahnwert geteilt durch seine Zeit.</p>
      <div class="mx-eq">Bahnwert = Mittelwert der (CN × Zeit) der schnellsten zwei Drittel
        <small>Score = Bahnwert ÷ Zeit des Läufers</small></div>
      <p>Ein Läufer, der so läuft, wie sein CN es erwarten lässt, erhält einen Score nahe an seinem CN. Läuft er 10 % schneller, ist sein Score 11 % höher;
        läuft er 10 % langsamer, ist sein Score 9 % niedriger.</p>
      <h3>Beispiel: eine Bahn mit sechs Läufern</h3>
      ${r6Table("CN", [["Im Bahnwert?", (i) => (i < r6.keep ? "ja" : "nein")], ["Offizieller Score", (i, tm) => n0(r6.off / tm)]])}
      <p>Zwei Drittel von sechs Läufern sind vier Läufer: A, B, C und D. Der Bahnwert ist der Mittelwert ihrer vier Produkte, also
        ${n0(r6.off)}. Der Score von A ist ${n0(r6.off)} ÷ 50 = ${n0(r6.off / 50)}. E und F, die Langsamsten, zählen nicht für den Bahnwert, erhalten aber
        einen Score wie die anderen.</p>
      <ul class="mx-list">
        <li><span>Verwendet wird der offizielle CN, der 15 Tage vor dem Lauf veröffentlicht wurde (der „CN T-15“).</span></li>
        <li><span>Wenn auf der Bahn nur drei Läufer einen CN haben, zählen alle drei für den Bahnwert.</span></li>
        <li><span>Ein Fehlstempel, eine Aufgabe, eine Disqualifikation oder eine Zeitüberschreitung ergeben einen Score von 0, der im CN zählt. Ein Ergebnis
          „nicht klassiert“ (nc) zählt nirgends.</span></li>
        <li><span>2022 wurde der Bahnwert mit 0,95 multipliziert; in den anderen Jahren nicht.</span></li>
      </ul>
    </section>
    <section class="mx-slide" style="${cvar("official")}">
      <p class="mx-kicker">Der CN</p>
      <h2>Der Mittelwert der mittleren Scores</h2>
      <p>Der offizielle CN ist der Mittelwert der Scores der letzten 12 Monate, ohne die besten und die schwächsten. Seit 2026 streicht man die besten 10 %
        der Scores und die schwächsten 40 % und bildet dann den Mittelwert der übrigen. Die Zahl der gestrichenen Scores wird gerundet: Bei 10 Läufen streicht man
        den besten und die 4 schwächsten, und der CN ist der Mittelwert der 5 anderen.</p>
      <ul class="mx-list">
        <li><span>Vor 2026 wurde nur der beste Lauf gestrichen.</span></li>
        <li><span>Seit 2026 werden an jedem 1. Januar alle CN einer Disziplin mit derselben Zahl multipliziert, die so gewählt wird, dass der Mittelwert
          der besten 20 % der CN 5600 beträgt: Das ist die Neuskalierung. Vor 2026 wurde der beste CN auf 10.000 zurückgesetzt, wenn er diesen Wert überschritt;
          das geschah am 1. Januar 2013, 2023, 2024 und 2025.</span></li>
        <li><span>Seit 2026 gibt es vier Ranglisten: Wald (Langdistanz, Mitteldistanz, Nacht), Sprint, MTB-O und Ski-O. Vor 2026 vereinte eine einzige
          Fuß-OL-Rangliste Wald und Sprint; die Website zeigt sie unverändert an.</span></li>
      </ul>
    </section>
    <section class="mx-slide" style="${cvar("official")}">
      <p class="mx-kicker">Auf der Website</p>
      <h2>Was die Website übernimmt</h2>
      <ul class="mx-list">
        <li><span>Die offiziellen CN und Scores werden so übernommen, wie die FFCO sie auf der Website der nationalen Rangliste veröffentlicht, Lauf für Lauf.</span></li>
        <li><span>Die Seite eines Läufers liest live seine CN-Seite auf der Website der FFCO. Der Verband bewertet manchmal Läufe vergangener Saisons neu;
          seine Punkte können dann von denen auf der Ergebnisseite des Laufs abweichen.</span></li>
        <li><span>Neben dem veröffentlichten CN rechnet die Seite eines Läufers mit der obigen Regel und den offiziellen Scores nach. Eine etwaige Abweichung kommt von einem
          Ergebnis, das auf der Website fehlt, nachträglich korrigiert oder neu bewertet wurde.</span></li>
        <li><span>Die offizielle Rangliste ist maßgebend: Nur sie zählt für die Selektionen.</span></li>
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
      official: { cn: offCn, used: offUsed, what: html`der Mittelwert der ${fmt(n - offDrop - offLow)} mittleren Scores, ohne den besten und die
        ${fmt(offLow)} schwächsten` },
      top6w: { ...aggregate(p6.top_n), what: html`${fmt(p6.top_n)} Plätze, gefüllt mit den besten Scores nach ihrem Gewicht, als gewichteter Mittelwert` },
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
      <h2>Ein Ozimut-Score pro Lauf, ein Ozimut-Index pro Läufer</h2>
      <p class="mx-lead">Die Ozimut-Methode funktioniert in zwei Schritten, wie die Weltrangliste der IOF. Zuerst bringt jeder Lauf jedem Läufer einen <b>Ozimut-Score</b>.
        Dann fasst der <b>Ozimut-Index</b> eines Läufers seine besten Ozimut-Scores der letzten 12 Monate zusammen.</p>
      <div class="notice info" style="margin:12px 0">Warum diese Entscheidungen, und was sie im Vergleich zum offiziellen CN taugen: <a href="#/documentation?onglet=etude" data-tab-link="etude"><b>die Studie</b></a>,
        die jede Variante an den französischen Ergebnissen seit 2012 gemessen hat.</div>
      <div class="mx-grid">
        <div class="mx-box" style="--c:var(--s1)"><h3>Der Ozimut-Score eines Laufs</h3>
          <p>Die Schwierigkeit der Bahn wird am üblichen Niveau der anwesenden Läufer gemessen, so wie die FFCO es mit ihrem CN tut. Der Score eines Läufers
            ist diese Schwierigkeit geteilt durch seine Zeit.</p></div>
        <div class="mx-box" style="--c:var(--s3)"><h3>Der Ozimut-Index eines Läufers</h3>
          <p>Seine besten Ozimut-Scores der letzten 12 Monate füllen ${fmt(p6.top_n)} Plätze; der Ozimut-Index ist ihr Mittelwert, wobei jeder Lauf
            nach seinen Plätzen zählt.</p></div>
      </div>
      <p style="margin-top:14px">Alles wird mit gewöhnlichen Mittelwerten berechnet: Jeder kann einen Score oder einen Index von Hand nachrechnen. Die Formeln sind in
        allen vier Disziplinen dieselben; nur drei Einstellungen ändern sich: die berücksichtigten Läufe und der Anteil der besten Scores, weil MTB-O und Ski-O
        viel weniger Läufe haben, sowie der Anteil des Feldes, der die Bahn misst.</p>
      <div class="table-wrap"><table class="data compact"><thead><tr><th>${t("f.terrain")}</th><th>Berücksichtigte Läufe</th>
        <th class="r">Betrachtete beste Scores</th><th class="r">Läufer, die die Bahn messen</th></tr></thead>
        <tbody>${windows.map(([tr, w, f, sf]) => html`<tr><td>${t(`terrain.${tr}`)}</td><td>${w === 365 ? "die letzten 12 Monate" : `die letzten ${fmt(Math.round(w / 365))} Jahre`}</td>
          <td class="r">die besten ${pctOf(f)}</td><td class="r">${shareName(sf)}</td></tr>`)}</tbody></table></div>
      <p style="margin-top:14px">Die Gründe für jede Entscheidung, die ausprobierten Varianten und
        die Messungen, die sie begründen, findest du in
        <a href="#/documentation?onglet=etude&voir=choix" data-tab-link="etude" data-goto="choix">der Studie</a>.</p>
    </section>

    <section class="mx-slide" style="--c:var(--s1)">
      <p class="mx-kicker">Der Ozimut-Score · Schritt 1</p>
      <h2>Das übliche Niveau der anwesenden Läufer</h2>
      <p>Wie beim offiziellen CN wird die Schwierigkeit einer Bahn an den anwesenden Läufern gemessen. Die Ozimut-Methode verwendet aber nicht ihren Ozimut-Index, sondern
        ihr <b>übliches Niveau</b>, so wie es ${fmt(pf.lag_days)} Tage vor dem Lauf war.</p>
      <p>Das übliche Niveau eines Läufers ist der gewichtete Mittelwert seiner besten ${pctOf(pf.eligible_fraction)} Ozimut-Scores der letzten 12 Monate
        (70 % über zwei Jahre im MTB-O, über drei Jahre im Ski-O), jeder Score nach seinem Gewicht gezählt (siehe den Ozimut-Index weiter unten), ohne Platzbegrenzung. Es sagt,
        was der Läufer gewöhnlich wert ist. Es ist keine Rangliste, sondern ein Rechenschritt aus den Läufen, die der Läufer schon gelaufen ist. Der Ozimut-Index
        dagegen behält nur die besten Läufe: Er dient zum Klassieren. Wie im Ozimut-Index zählen auch hier Läufe in einer Jugendkategorie
        mit der Zeit immer weniger.</p>
      <ul class="mx-list">
        <li><span>Es zählen nur Läufer, die in der Disziplin des Laufs ein übliches Niveau haben. Es braucht mindestens ${fmt(pf.min_ranked)} davon auf der
          Bahn; sonst hat die Bahn keinen Wert und ergibt keinen Score.</span></li>
        <li><span>Die Berechnung beginnt mit den Ergebnissen von 2010, mit den offiziellen CN dieser ersten Saison als Ausgangspunkt.</span></li>
        <li><span>Ergebnisse „nicht klassiert“ (nc) und die Kategorien H10 und D10 zählen nicht.</span></li>
      </ul>
    </section>

    <section class="mx-slide" style="--c:var(--s1)">
      <p class="mx-kicker">Der Ozimut-Score · Schritt 2</p>
      <h2>Der Ozimut-Bahnwert</h2>
      <p>Für jeden Läufer multipliziert man sein übliches Niveau mit seiner Zeit. Der Ozimut-Bahnwert ist der <b>Mittelwert dieser Produkte für die
        Schnellsten</b>: ${shareName(own(pf, "For", "sample_fraction") ?? 2 / 3)} im Wald, ${shareName(own(pf, "Spr", "sample_fraction") ?? 2 / 3)} im Sprint,
        ${shareName(own(pf, "VTT", "sample_fraction") ?? 2 / 3)} im MTB-O und im Ski-O. Das ist die Regel der FFCO, die die schnellsten zwei Drittel nimmt,
        mit einem für jede Disziplin eingestellten Anteil.</p>
      <div class="mx-eq">Ozimut-Bahnwert = Mittelwert der (übliches Niveau × Zeit) der Schnellsten
        <small>Wald: ${shareShort(own(pf, "For", "sample_fraction") ?? 2 / 3)} der Läufer mit einem Niveau · Sprint: ${shareShort(own(pf, "Spr", "sample_fraction") ?? 2 / 3)} · MTB-O und Ski-O: ${shareShort(own(pf, "VTT", "sample_fraction") ?? 2 / 3)}; die Anzahl wird aufgerundet</small></div>
      <p>Die langsamsten Läufer einer Bahn sind die, die Fehler gemacht haben, und die, die auf ihrem Niveau gelaufen sind. Zählt man sie mit, sagt das, wie
        tückisch die Bahn war; lässt man sie weg, sagt das, wie schwer die Bahn ohne Fehler war. Der richtige Anteil ist nicht überall gleich: Im Wald, wo
        jeder zwölfte Lauf durch Fehler verloren geht, gibt fast das ganze Feld Auskunft; im Sprint, wo Fehler halb so häufig sind, verfälschen die Langsamsten die
        Messung. Jeder Anteil wurde gewählt, weil er die Ergebnisse in seiner Disziplin am besten vorhersagt
        (<a href="#/documentation?onglet=etude&voir=choix" data-tab-link="etude" data-goto="choix">die Studie</a>).</p>
      <ul class="mx-list">
        <li><span>Wenn auf der Bahn nur ${fmt(pf.min_ranked)} Läufer ein Niveau haben, zählen alle ${fmt(pf.min_ranked)}, wie in der offiziellen
          Regel.</span></li>
        <li><span>Ein Fehlstempel, eine Aufgabe, eine Disqualifikation oder eine Zeitüberschreitung zählen nicht im Ozimut-Bahnwert.</span></li>
      </ul>
    </section>

    <section class="mx-slide" style="--c:var(--s1)">
      <p class="mx-kicker">Der Ozimut-Score · Schritt 3</p>
      <h2>Der Score</h2>
      <div class="mx-eq">Ozimut-Score = Ozimut-Bahnwert ÷ Zeit des Läufers × Neuskalierungsfaktor des Tages</div>
      <ul class="mx-list">
        <li><span>Wie beim offiziellen Score ergibt 10 % schneller laufen einen um 11 % höheren Score und 10 % langsamer laufen einen um 9 % niedrigeren.</span></li>
        <li><span>Ein Fehlstempel, eine Aufgabe, eine Disqualifikation oder eine Zeitüberschreitung ergeben einen Score von 0, der im Ozimut-Index zählt.</span></li>
        <li><span>Der Neuskalierungsfaktor, weiter unten erklärt, ist der des Lauftages. Der Score wird ein für alle Mal berechnet und nie überarbeitet.</span></li>
      </ul>
      <h3>Beispiel: eine Bahn mit sechs Läufern</h3>
      ${r6Table("Niveau", [["Offizieller Score", (i, tm) => n0(r6.off / tm)], ["Ozimut-Score im Wald", (i, tm) => n0(r6.topFor / tm)], ["Ozimut-Score im Sprint", (i, tm) => n0(r6.topSpr / tm)]])}
      <p>Wir nehmen hier an, dass das übliche Niveau jedes Läufers gleich seinem CN ist, und lassen die Neuskalierung außer Acht. F hat sich verlaufen: 90 Minuten
        für einen Läufer mit Niveau 5000, während C mit demselben Niveau 62 Minuten brauchte. Die offizielle Regel misst die Bahn an den vier
        Schnellsten, A bis D: Der Wert ist ${n0(r6.off)}. Im Sprint macht die Ozimut-Methode dasselbe. Im Wald nimmt sie ${fmt(r6.keepFor)} von sechs Läufern
        (90 % von sechs, aufgerundet), F eingeschlossen: Der Wert steigt auf ${n0(r6.topFor)}, und A, der fehlerfrei gelaufen ist, erzielt ${n0(r6.topFor / 50)} statt
        ${n0(r6.off / 50)}. Diese Bahn hat einen von sechs Läufern viel gekostet; wer sie fehlerfrei gelaufen ist, wird dafür belohnt. Auf einer echten Bahn mit
        mehreren Dutzend Läufern wiegt ein einzelner Fehler viel weniger, und die Neuskalierung bringt das allgemeine Niveau auf ${fmt(pf.anchor_target)} zurück.</p>
    </section>

    <section class="mx-slide" style="${cvar("top6w")}">
      <p class="mx-kicker">Der Ozimut-Index eines Läufers</p>
      <h2>${fmt(p6.top_n)} Plätze für die besten Läufe</h2>
      <p>Man ordnet die Ozimut-Scores der letzten 12 Monate vom besten zum schwächsten und betrachtet nur die besten ${pctOf(p6.eligible_fraction)}. Dann füllt man
        ${fmt(p6.top_n)} Plätze, beginnend mit dem besten Score. Jeder Lauf nimmt so viele Plätze ein, wie sein Gewicht beträgt: ${fmtW(pf.weights.cdf)} Plätze
        für eine Französische Meisterschaft, ${fmtW(pf.weights.national)} Platz für einen nationalen Lauf (O'France, Nationale), ${fmtW(pf.weights.other)} Platz für
        jeden anderen Lauf, Selektionsläufe und Regionalmeisterschaften eingeschlossen. Der letzte berücksichtigte Lauf nimmt nur die verbleibenden Plätze ein.</p>
      <p>Der Ozimut-Index ist der <b>gewichtete Mittelwert</b> der berücksichtigten Scores: Jeder Score zählt so oft, wie er Plätze hat. Nehmen wir eine Französische
        Meisterschaft mit 6800, die 2 Plätze einnimmt, und vier andere Läufe mit 6500, 6400, 6200 und 6000, die je einen Platz einnehmen. Der Ozimut-Index beträgt
        (2 × 6800 + 6500 + 6400 + 6200 + 6000) ÷ 6 = 6450.</p>
      <div class="mx-eq">Ozimut-Index = Σ (Plätze × Score) ÷ Σ Plätze
        <small>höchstens ${fmt(p6.top_n)} Plätze, in allen Disziplinen; ein Lauf in einer Jugendkategorie zählt mit Plätze × (1 − sein Alter ÷ das Zeitfenster)</small></div>
      <ul class="mx-list">
        <li><span>Die Gewichte richten sich nach dem Namen des Wettkampfs. Die Stufen A, B, C und D der FFCO werden nicht verwendet.</span></li>
        <li><span><b>Die Läufe der Jugendlichen zählen mit der Zeit immer weniger.</b> Ein Lauf in einer Jugendkategorie (H und D bis 20 Jahre)
          nimmt seine Plätze wie die anderen ein, zählt im Mittelwert aber mit 1 − sein Alter ÷ 12 Monate (÷ zwei Jahre im MTB-O, drei im Ski-O): voll am
          Tag des Laufs, halb sechs Monate später, fast gar nicht mehr am Ende des Zeitfensters. Ein Jugendlicher macht schnell Fortschritte: Seine Läufe von vor zehn Monaten
          beschreiben einen langsameren Läufer. Die Läufe der Erwachsenen behalten ihr Gewicht. Der Ozimut-Index eines Jugendlichen kann sich also zwischen zwei Läufen ändern.</span></li>
        <li><span>Um klassiert zu werden, braucht man mindestens ${fmt(pf.min_scores)} Läufe in den letzten 12 Monaten. Wenn weniger als ${fmt(p6.top_n)} Plätze
          gefüllt sind, ist der Ozimut-Index der gewichtete Mittelwert dessen, was vorhanden ist.</span></li>
        <li><span>Sobald die ${fmt(p6.top_n)} Plätze gefüllt sind, kann ein weiterer Lauf den Ozimut-Index eines Erwachsenen nicht senken: Entweder nimmt er den Platz
          eines schwächeren Laufs ein, oder er bleibt draußen. Dafür braucht es meist 10 Läufe in 12 Monaten, weniger mit Meisterschaften oder nationalen Läufen.
          Solange die Plätze nicht gefüllt sind, ist der Ozimut-Index ein gewöhnlicher Mittelwert, und ein Lauf, der schwächer ist als die anderen, senkt ihn. Bei einem
          Jugendlichen wiegt ein neuer Lauf mehr als die alten, die er ersetzt: Ist er schwächer als sie, kann er seinen Ozimut-Index senken.</span></li>
      </ul>
    </section>

    <section class="mx-slide">
      <p class="mx-kicker">Die Neuskalierung</p>
      <h2>Ein Faktor pro Tag, nie überarbeitet</h2>
      <p>Ohne Korrektur würde das allgemeine Niveau der CN von Jahr zu Jahr langsam steigen; die Studie erklärt, warum. Die Neuskalierung korrigiert diese
        Drift: Jeder Ozimut-Score wird mit einem Faktor multipliziert, demselben für alle Läufe desselben Tages in derselben Disziplin.</p>
      <ul class="mx-list">
        <li><span>Der Faktor wird so gewählt, dass der Mittelwert der besten ${pctOf(pf.anchor_top_fraction)} Ozimut-Indizes jeder Disziplin bei
          ${fmt(pf.anchor_target)} bleibt, nach der Regel der FFCO seit 2026. Er ändert sich jeden Tag ein wenig, statt einmal im Jahr.</span></li>
        <li><span>Um ihn zu berechnen, misst man das Niveau der Ozimut-Indizes ${fmt(pf.anchor_lag_months)} Monate früher, gemittelt über 13 Monate, und schreibt es dann
          um 10 Monate fort, in dem Tempo, in dem es in den letzten zehn Jahren gestiegen ist. Die Monate zählen nach dem Kalender: Ein Monat ohne Lauf behält das Niveau
          des Vormonats. Der Faktor wird für jeden Monat berechnet; zwischen zwei Monaten geht er geradlinig vom einen zum anderen über. Die Regel ist in allen
          vier Disziplinen dieselbe.</span></li>
        <li><span>Der Faktor eines Laufs wird ein für alle Mal festgelegt. Ein Ozimut-Index ändert sich also nur, wenn ein Lauf in die letzten 12 Monate eintritt oder
          aus ihnen herausfällt, nie wegen der Neuskalierung.</span></li>
      </ul>
      <div style="margin-top:16px">${chartCard({ id: "norm", title: "Der Neuskalierungsfaktor", hint: "Der Faktor, der auf den Ozimut-Score eines Laufs angewendet wird, je nach Tag und Disziplin", short: true })}</div>
    </section>

    <section class="mx-slide">
      <p class="mx-kicker" style="--c:var(--s3)">Veranschaulichung</p>
      <h2>Gleiche Scores, unterschiedliche Werte</h2>
      <p class="mx-lead">Ein Läufer ist in 12 Monaten ${fmt(n)} Läufe gelaufen. Hier sind seine Scores, vom besten zum schwächsten. Der beste, ${fmt(EXAMPLE[0][0])}, ist
        eine Französische Meisterschaft (★); ${fmt(EXAMPLE[2][0])} ist ein nationaler Lauf. Hier siehst du, was jede Berechnung von denselben Scores behält.</p>
      ${["official", "top6w"].map((m) => html`<div class="mx-agg" style="${cvar(m)}">
        <div><b>${methodKey(m)} ${exLabel(m)}</b><div class="what">${EX[m].what}</div></div>
        ${chips(m)}
        <div class="cn">${fmt(EX[m].cn)}</div></div>`)}
      <p class="muted" style="font-size:13px">Die hochgestellten Zahlen (×2, ×1,5) sind die Plätze, die der Lauf einnimmt. Das Beispiel wendet jede Regel auf
        dieselben Scores an. In Wirklichkeit unterscheiden sich der offizielle Score und der Ozimut-Score desselben Laufs, da der Bahnwert nicht auf dieselbe
        Weise berechnet wird.</p>
    </section>`;
  }

  // ======================================================================================================
  // 3. L'étude
  // ======================================================================================================
  function etude() {
    const S = study, L = study?.lineaire;
    const pctCi = (a) => (a ? `${sg(a[0], 1)} % [${sg(a[1], 1)}; ${sg(a[2], 1)}]` : "—");
    const calib = (tr, g, m) => S?.calib?.[tr]?.[g]?.v?.[m];
    const mark = (kind, label, note) => html`<span class="mx-mark ${kind}">${label}</span>${note ? html`<span class="mx-note">${note}</span>` : ""}`;
    const YES = (x) => mark("yes", "ja", x), NO = (x) => mark("no", "nein", x), PART = (x) => mark("part", "teilweise", x);
    const CRIT = [
      ["Zählt Meisterschaften und nationale Läufe", (m) => (m === "official" ? NO("oft gestrichen") : YES("sie wiegen mehr"))],
      ["Ein weiterer Lauf senkt den CN nicht", (m) => (m === "official" ? NO("oft doch") : PART("bei Erwachsenen, sobald die 6 Plätze gefüllt sind"))],
      ["Spiegelt das Niveau bei großen Wettkämpfen", (m) => (m === "official" ? NO("ohne die besten 10 %") : YES("die besten Läufe"))],
      ["Folgt dem schnellen Fortschritt der Jugendlichen", (m) => (m === "official" ? NO("ihr CN hinkt hinterher: Ein Lauf von vor einem Jahr zählt gleich viel") : YES("ihre alten Läufe verblassen, im Index wie bei der Messung der Bahnen"))],
      ["Stabil von Jahr zu Jahr", (m) => (m === "official" ? NO("Sprung am 1. Januar") : YES("schrittweise Neuskalierung"))],
      ["Einfach zu erklären", (m) => (m === "official" ? YES() : YES("gewöhnliche Mittelwerte"))],
      ["Maßgebend für die Selektionen", (m) => (m === "official" ? YES("einzige offizielle Rangliste") : NO("Analyseberechnung"))],
    ];
    const noStudy = html`<p class="muted">Die Zahlen der Studie sind im Moment nicht verfügbar.</p>`;
    const pts = (a) => (a ? html`${ci(a)} Punkt` : "—");
    const cell = (a) => (a ? html`${sg(a[0], 2)}${est(a) ? "*" : ""}` : "—");
    const SC = ["all_holdout", "nat_holdout", "all_tuned"];
    const SCH = ["Alle Läufe<br>2012–2024", "Nationale Läufe<br>2012–2024", "Alle Läufe<br>seit Juli 2025"];
    const share = (tr) => L?.share?.[tr]?.rows || [];
    const picked = (tr) => L?.picked?.[tr];

    const CH = {
      objectifs: () => html`
        <section class="mx-slide mx-hero">
          <p class="mx-kicker">Die Studie</p>
          <h2>Ein leicht verständlicher Index, der deine besten Läufe zählt und die Ergebnisse besser vorhersagt</h2>
          <p class="mx-lead">Dieses Kapitel erklärt, warum die Ozimut-Methode entwickelt wurde, wie sie bewertet wurde, welche Ideen ausprobiert und
            welche übernommen wurden. Am Ende steht die Ozimut-Methode: die einfachste unter denen, die am besten vorhersagen.</p>
          ${hf && hs ? html`<div class="mx-stats">
            <div class="mx-stat"><b>${lvl(hf, "acc", "official")} %, dann ${lvl(hf, "acc", "top6w")} %</b><span>der Duelle im Wald richtig vorhergesagt, vom offiziellen
              CN, dann vom Ozimut-Index. Ein Duell sind zwei Läufer derselben Bahn; es ist richtig vorhergesagt, wenn der mit dem besseren Wert
              vor dem anderen ins Ziel kommt.</span></div>
            <div class="mx-stat"><b>${lvl(hs, "acc", "official")} %, dann ${lvl(hs, "acc", "top6w")} %</b><span>der Duelle im Sprint richtig vorhergesagt, über dieselben
              Saisons.</span></div>
            <div class="mx-stat"><b>${lvl(hf, "r2", "official")} %, dann ${lvl(hf, "r2", "top6w")} %</b><span>der Zeitunterschiede zwischen Läufern derselben
              Bahn im Wald erklärt, vom offiziellen CN, dann vom Ozimut-Index.</span></div>
            <div class="mx-stat"><b>${fmt(ev.rows.For.all.holdout.comps + ev.rows.Spr.all.holdout.comps)}</b><span>Wettkämpfe von ${ev.holdout[0]} bis
              ${ev.holdout[1]}, während der Entwicklung der Methoden beiseitegelegt und nur zu ihrer Beurteilung verwendet.</span></div>
          </div>` : ""}
          <p style="margin-top:18px"><a class="mx-dl" href="${PDF}" download>⬇ Die Studie als PDF herunterladen (Whitepaper)</a></p>
        </section>
        <section class="mx-slide">
          <p class="mx-kicker">Der Ausgangspunkt</p>
          <h2>Der CN dient zwei verschiedenen Zwecken</h2>
          <div class="mx-grid">
            <div class="mx-box" style="--c:var(--s1)"><h3>Die Schwierigkeit der Bahnen messen</h3>
              <p>Um zu wissen, ob eine Bahn schwer war, muss man das <b>übliche Niveau</b> der anwesenden Läufer kennen, ohne dass ein einzelner Ausrutscher oder
                eine einzelne Glanzleistung es verzerrt.</p></div>
            <div class="mx-box" style="--c:var(--s3)"><h3>Die Läufer klassieren</h3>
              <p>Für die Qualifikation zu den Französischen Meisterschaften muss man wissen, wozu ein Läufer <b>bei einem großen Wettkampf</b> fähig ist, also
                seine besten Läufe betrachten.</p></div>
          </div>
          <div class="mx-callout">Der ${cnLabel("official")} dient beiden Zwecken: Für den ersten eignet er sich, dem zweiten schadet er. Die Ozimut-Methode trennt sie. Der
            <b>Ozimut-Score</b> eines Laufs wird am üblichen Niveau der anwesenden Läufer gemessen; der <b>Ozimut-Index</b> eines Läufers behält seine besten Läufe.</div>
        </section>
        <section class="mx-slide">
          <p class="mx-kicker">Die Ziele</p>
          <h2>Was die Methode leisten soll</h2>
          <ul class="mx-list">
            <li><span>Von <b>denselben Ergebnissen und demselben Laufscore</b> ausgehen wie die FFCO, damit jeder es verstehen und überprüfen kann.</span></li>
            <li><span><b>Die Französischen Meisterschaften und die nationalen Läufe zählen</b>, die die offizielle Methode oft streicht, weil sie die
              besten 10 % der Läufe streicht.</span></li>
            <li><span><b>Den Läufer nicht bestrafen, der einen Lauf mehr läuft</b>: Sobald seine besten Läufe feststehen, darf ein weiterer Lauf
              seinen CN nicht senken.</span></li>
            <li><span><b>Den Sprung am 1. Januar abschaffen</b>, um einen Läufer über mehrere Saisons verfolgen zu können.</span></li>
            <li><span><b>Den Jugendlichen folgen, die schnell Fortschritte machen</b>: Das Niveau eines Jugendlichen steigt von Saison zu Saison, und seine Läufe
              von vor zehn Monaten beschreiben einen langsameren Läufer. Sein Index muss seinem Fortschritt folgen, sonst klassiert er ihn zu tief und lässt
              die Bahnen, auf denen er läuft, leichter erscheinen.</span></li>
            <li><span><b>Die Ergebnisse besser vorhersagen</b> und das durch eine verlässliche Messung beweisen.</span></li>
            <li><span><b>Einfach zu erklären bleiben</b>: gewöhnliche Mittelwerte, eine gemeinsame Regel, kein Modell, das Läufer für Läufer angepasst wird. Wenn
              eine ausgefeiltere Variante nur ein paar Hundertstel Punkte gewinnt, setzt sich die einfache Regel durch.</span></li>
          </ul>
        </section>`,

      depart: () => html`
        <section class="mx-slide" style="${cvar("official")}">
          <p class="mx-kicker">${methodKey("official")} ${methodLabel("official")}</p>
          <h2>Die Referenz: solide zum Messen, wenig geeignet zum Klassieren</h2>
          <div class="mx-grid">
            <div><h3 style="margin-top:4px">Was sie gut macht</h3><ul class="mx-list">
              <li><span>Sie ist maßgebend: Es ist die <b>einzige offizielle Rangliste</b>, die der Selektionen.</span></li>
              <li><span>Sie streicht die extremen Scores, in beide Richtungen: Das ist ein gutes Maß für das <b>übliche Niveau</b>, nützlich, um die
                Schwierigkeit der Bahnen zu messen.</span></li>
              <li><span>Ihre Regel ist öffentlich und einfach.</span></li>
              <li><span>Sie gibt jedem Läufer ein <b>Maß seiner Leistung im Vergleich zu den anderen</b>, Lauf für Lauf.</span></li>
              <li><span>Sie <b>spornt jeden an, besser zu werden</b>: Jeder Lauf zählt, und die Rangliste zeigt die Fortschritte.</span></li>
              <li><span>Sie hat <b>das Sammeln der Wettkampfergebnisse ins Rollen gebracht</b>, schon vor vielen Jahren; alle diese Ergebnisse waren zu dem einen oder anderen
                Zeitpunkt öffentlich. Ohne diese Arbeit gäbe es weder diese Website noch diese Studie.</span></li>
            </ul></div>
            <div><h3 style="margin-top:4px">Was sie weniger gut macht</h3><ul class="mx-list bad">
              <li><span><b>Sie streicht die besten 10 % der Läufe.</b> Für die besten Läufer sind das meist die Französischen Meisterschaften und
                die nationalen Läufe: die Läufe, auf die sie sich vorbereiten, und die am stärksten besetzten.</span></li>
              <li><span><b>Sie bewertet die übliche Leistung statt der möglichen Leistung</b>, die für die
                Qualifikationen aussagekräftiger ist.</span></li>
              <li><span><b>Sie ermutigt nicht zum Laufen.</b> Für einen gut klassierten Läufer senkt ein weiterer Lauf oft den CN. Manche hören auf,
                sobald sie den CN haben, der sie für eine Französische Meisterschaft qualifiziert; andere laufen nur die Läufe, die sie für „lohnend“ halten.</span></li>
              <li><span><b>Ein Sprung an jedem 1. Januar</b> und Regeln, die sich im Lauf der Saisons geändert haben: Man kann die CN nicht von einem
                Jahr zum anderen vergleichen.</span></li>
              <li><span><b>Alle Läufe wiegen gleich</b>, von der Französischen Meisterschaft bis zum Regionallauf.</span></li>
              <li><span><b>Die Jugendlichen machen schneller Fortschritte als ihr CN.</b> Ein Lauf von vor zehn Monaten zählt so viel wie der von letzter
                Woche: Der CN eines Jugendlichen, der Fortschritte macht, hinkt seinem Niveau hinterher, klassiert ihn zu tief und lässt die Bahnen, auf denen er läuft, leichter erscheinen.</span></li>
            </ul></div>
          </div>
        </section>
        <section class="mx-slide">
          <p class="mx-kicker">Auf einen Blick</p>
          <h2>Jede Methode, Kriterium für Kriterium</h2>
          <div class="table-wrap"><table class="mx-matrix">
            <thead><tr><th></th>${M.map((m) => html`<th>${methodKey(m)}${methodShort(m)}</th>`)}</tr></thead>
            <tbody>${CRIT.map(([label, cell]) => html`<tr><td>${label}</td>${M.map((m) => html`<td>${cell(m)}</td>`)}</tr>`)}</tbody>
          </table></div>
        </section>
        <section class="mx-slide">
          <p class="mx-kicker" style="--c:var(--s3)">Was die Ozimut-Methode ändert</p>
          <h2>Gleiche Ergebnisse, gleiche Zeiten, andere Berechnung</h2>
          <div class="mx-fix">
            <div class="head">Offizielle Methode</div><div></div><div class="head">Ozimut-Methode</div>
            <div class="p"><b>Die besten Läufe werden gestrichen</b>oft die Französischen Meisterschaften und die nationalen Läufe</div><div class="arrow">→</div>
            <div class="s"><b>Die besten Läufe zählen am meisten</b>eine Französische Meisterschaft zählt doppelt, ein nationaler Lauf anderthalbfach; nur
              die schwächeren Läufe bleiben außen vor</div>
            <div class="p"><b>Ein Lauf mehr kann den CN senken</b>was vom Laufen abhält</div><div class="arrow">→</div>
            <div class="s"><b>Sind die ${fmt(p6.top_n)} Plätze gefüllt, kann ein Lauf mehr den CN eines Erwachsenen nicht mehr senken</b>die Plätze werden mit
              den besten Läufen gefüllt: Je mehr du läufst, desto größer die Chance, sie gut zu füllen</div>
            <div class="p"><b>Die Bahn wird an den schnellsten zwei Dritteln gemessen</b>wer Fehler gemacht hat, zählt nicht, und gutes Orientieren
              auf einer kniffligen Bahn bringt weniger als anderswo</div><div class="arrow">→</div>
            <div class="s"><b>Der Anteil des Feldes, je Disziplin festgelegt</b>im Wald 90 % der Läufer: Die Schwierigkeit einer Bahn umfasst
              die Fehler, die sie provoziert, und sie zu vermeiden zahlt sich aus; im Sprint zwei Drittel, wie bei der FFCO</div>
            <div class="p"><b>Ein Sprung am 1. Januar</b>die ganze Rangliste ändert sich auf einen Schlag</div><div class="arrow">→</div>
            <div class="s"><b>Eine schrittweise Neuskalierung, Tag für Tag</b>der Score eines Laufs wird ein für alle Mal festgelegt, und der Index eines Erwachsenen
              ändert sich nur, wenn ein Lauf in die letzten 12 Monate hinein- oder aus ihnen herausfällt</div>
            <div class="p"><b>Der CN eines Jugendlichen hinkt seinen Fortschritten hinterher</b>sein Lauf von vor elf Monaten zählt so viel wie der von gestern, obwohl er
              damals viel langsamer lief</div><div class="arrow">→</div>
            <div class="s"><b>Die Läufe der Jugendlichen verblassen mit der Zeit</b>ein in einer Jugendkategorie gelaufener Lauf zählt über die
              12 Monate immer weniger: Der Index eines Jugendlichen folgt seiner Entwicklung viel schneller, und seine Bahnen werden besser gemessen</div>
            <div class="p"><b>Ein einziger CN für zwei Zwecke</b>die Bahnen messen und die Läufer einordnen</div><div class="arrow">→</div>
            <div class="s"><b>Eine Berechnung für jeden Zweck</b>der Wert einer Bahn wird aus den Scores gemessen, die die anwesenden Läufer
              in ihren vorherigen Läufen erzielt haben; der Ozimut-Index behält ihre besten Läufe</div>
          </div>
        </section>`,

      mesure: () => html`
        <section class="mx-slide mx-hero">
          <p class="mx-kicker">Der Test</p>
          <h2>Wer ist vor dem Lauf Favorit? Wer lag danach vorn, und mit welchem Abstand?</h2>
          <p class="mx-lead">Ein guter CN sollte die Ergebnisse vorhersagen. Für jeden Läufer nehmen wir den CN, den er <b>15 Tage vor</b> dem Lauf hatte: Dieser
            CN weiß nichts über den Lauf. Dann schauen wir Bahn für Bahn, ob diese CN die Zielreihenfolge und die Zeitabstände vorhergesagt haben. Alle
            Methoden werden an denselben Läufern beurteilt: an denen, die in jeder von ihnen einen CN hatten.</p>
        </section>
        <section class="mx-slide">
          <p class="mx-kicker">Erstes Maß</p>
          <h2>Der Anteil richtig vorhergesagter Duelle</h2>
          <p>Auf einer Bahn bildet jedes Läuferpaar ein <b>Duell</b>: Zwischen 10 Läufern gibt es 45 Duelle, zwischen 150 Läufern 11.175. Der CN sagt
            ein Duell richtig vorher, wenn der Läufer mit dem höheren CN vor dem anderen ins Ziel kommt. Sind beide CN gleich, zählt das Duell zur Hälfte.</p>
          <p>Ein zufällig gewählter CN würde die Hälfte der Duelle richtig vorhersagen, also 50 %. Kein CN kann alle vorhersagen, denn Tagesform und Fehler
            entscheiden einen Teil der Ergebnisse.</p>
          <div class="mx-eq">Anteil richtig vorhergesagter Duelle = richtig vorhergesagte Duelle ÷ Anzahl der Duelle
            <small>für jede Bahn berechnet, dann über alle Bahnen gemittelt, jede gewichtet mit ihrer Läuferzahl</small></div>
          <p><b>Warum jede Bahn mit ihrer Läuferzahl gewichtet wird.</b> Jeder Läufer tritt gegen alle anderen Läufer seiner Bahn an. Der Anteil seiner
            richtig vorhergesagten Duelle sagt, ob der CN ihn unter ihnen richtig eingeordnet hat. Mittelt man diesen Anteil über alle Läufer der Saison, erhält man
            genau den Mittelwert der Bahnen, gewichtet mit ihrer Läuferzahl: Jedes Ergebnis zählt einmal. Würde jedes Duell einmal zählen, bekämen
            große Bahnen zu viel Gewicht, denn eine Bahn mit 150 Läufern wöge so viel wie 250 Bahnen mit 10 Läufern. Würde jede Bahn einmal
            zählen, bekämen kleine zu viel, denn eine Bahn mit 5 Läufern wöge so viel wie eine Bahn einer Französischen Meisterschaft.</p>
          <p><b>Der Zusammenhang mit Kendalls τ.</b> Statistiker messen die Übereinstimmung zweier Ranglisten mit „Kendalls τ“: dem Anteil richtig
            vorhergesagter Duelle minus dem Anteil falsch vorhergesagter. Bei 80 % richtig vorhergesagten Duellen, also 20 % falschen, ist τ = 0,80 − 0,20 = 0,60.
            Es ist dasselbe Maß auf einer anderen Skala: τ ist 0 für einen zufällig gewählten CN und 1 für eine perfekte Reihenfolge. Dieses Dokument gibt den Anteil der
            Duelle an, der anschaulicher ist.</p>
          ${hf ? html`<p>Im Wald sagt der offizielle CN von ${ev.holdout[0]} bis ${ev.holdout[1]} ${lvl(hf, "acc", "official")} % der Duelle richtig vorher, der Ozimut-Index
            ${lvl(hf, "acc", "top6w")} %. Der offizielle CN irrt sich also bei ${fmt(100 * (1 - hf.acc.official), 1)} % der Duelle, der Ozimut-Index bei
            ${fmt(100 * (1 - hf.acc.top6w), 1)} %: Das sind ${fmt(Math.round(100 * (1 - (1 - hf.acc.top6w) / (1 - hf.acc.official))))} % weniger Fehler.
            Die Unterschiede zwischen den in der Studie getesteten Varianten betragen oft nur wenige Zehntelpunkte.</p>` : ""}
        </section>
        <section class="mx-slide">
          <p class="mx-kicker">Zweites Maß</p>
          <h2>Die erklärten Zeitabstände</h2>
          <p>Die Zielreihenfolge sagt nicht alles: 10 Sekunden oder 10 Minuten hinter einem anderen Läufer ins Ziel zu kommen, ist nicht dasselbe. Nun liest sich ein CN wie
            eine Geschwindigkeit: Ein Läufer mit einem um 10 % höheren CN sollte etwa 10 % schneller laufen. Auf jeder Bahn vergleichen wir daher die Zeit jedes
            Läufers mit der Zeit, die sein CN vorhergesagt hat.</p>
          <ul class="mx-list">
            <li><span><b>Zeiten werden im Verhältnis verglichen.</b> 5 Minuten auf einem 15-minütigen Sprint zu verlieren, ist nicht dasselbe, wie 5 Minuten
              auf einer 90-minütigen Langdistanz zu verlieren. Die Abstände werden daher in Prozent der Zeit gemessen, nicht in Minuten.</span></li>
            <li><span><b>Der erklärte Anteil</b>, R² geschrieben, sagt, welchen Anteil der Zeitunterschiede zwischen den Läufern derselben Bahn der CN vorhergesagt hat: 0 %,
              wenn der CN nichts vorhersagt, 100 %, wenn jeder Läufer genau die vorhergesagte Zeit gebraucht hat. Auch hier zählt jedes Ergebnis einmal.</span></li>
            <li><span><b>Die Regel, die einen CN-Unterschied in einen Zeitunterschied übersetzt, wird an der vorherigen Saison gelernt.</b> So wird jede Saison vorhergesagt,
              ohne dass man sie angeschaut hat, so wie es bei der kommenden Saison der Fall wäre.</span></li>
          </ul>
          ${more("Die Formel", html`<div class="mx-eq">ln(Zeit) = Konstante der Bahn − b × ln(CN) + Abweichung
            <small>ln: der Logarithmus, der Verhältnisse in Differenzen verwandelt. Die Konstante berücksichtigt Länge und Schwierigkeit der Bahn;
              b, nahe 1, wird an der vorherigen Saison gelernt. R² = 1 − (Summe der Abweichungen²) ÷ (Summe der Abweichungen von ln(Zeit) vom Mittel der Bahn)².</small></div>`)}
        </section>
        <section class="mx-slide">
          <p class="mx-kicker">Die Unsicherheitsmarge</p>
          <h2>Ist ein Unterschied echt oder nur Zufall der Läufe?</h2>
          <p>Die Läufe einer Saison sind nur eine Stichprobe aller möglichen Läufe. Mit anderen Läufen wäre der Unterschied zwischen zwei Methoden
            etwas anders ausgefallen. Um herauszufinden, um wie viel, wiederholen wir die Berechnung ${ev ? fmt(ev.boot) : "2000"} Mal an zufällig gezogenen Saisons. Jede Ziehung
            nimmt so viele Wettkämpfe wie die echte Saison, zufällig aus ihnen ausgewählt: Manche kommen zweimal vor, andere gar nicht.</p>
          <ul class="mx-list">
            <li><span><b>Das 95-%-Intervall</b>, in eckigen Klammern hinter jedem Unterschied angegeben, reicht vom kleinsten bis zum größten Unterschied in 95 % dieser
              Ziehungen. Zum Beispiel bedeutet „+0,40 [+0,35; +0,44]“, dass der gemessene Unterschied 0,40 Punkte beträgt und 95 % der Ziehungen zwischen 0,35 und
              0,44 Punkten ergeben.</span></li>
            <li><span><b>Ein Unterschied heißt signifikant, wenn sein Intervall die 0 nicht enthält.</b> Fast alle Ziehungen ergeben dann einen Unterschied mit demselben
              Vorzeichen: Der Zufall der Läufe reicht nicht aus, ihn zu erklären. Enthält das Intervall die 0, zum Beispiel [−0,02; +0,01], kann man nicht sagen,
              welche der beiden Methoden besser ist.</span></li>
            <li><span><b>Gezogen werden ganze Wettkämpfe, keine Duelle.</b> Die Läufer desselben Laufs teilen Gelände, Karte und Wetter:
              Ihre Duelle sind nicht unabhängig. Sie einzeln zu ziehen, ergäbe zu enge, also zu optimistische Intervalle.</span></li>
            <li><span><b>Die Methoden werden an denselben Läufern und denselben Läufen verglichen</b>, Lauf für Lauf.</span></li>
            <li><span><b>Zurückgehaltene Saisons.</b> Die Einstellungen wurden im Zeitraum von Juli 2025 bis Oktober 2026 gewählt. Die Saisons
              ${ev ? `${ev.holdout[0]} bis ${ev.holdout[1]}` : "2012 bis 2024"} dienten nur zur Beurteilung: Die Einstellungen konnten sich nicht an ihre
              Besonderheiten anpassen, wie bei einer Prüfung aus Fragen, die im Training nie vorkamen.</span></li>
            <li><span>Jede Variante wird ab 2010 auf einer Kopie der Datenbank neu berechnet, mit ihrer eigenen Neuskalierung. Die CN 15 Tage vor dem
              Lauf sind die, die sie veröffentlicht hätte.</span></li>
          </ul>
          <p class="muted" style="font-size:13px">Die Tabellen
            vom 6. und 7. Oktober, in den folgenden Kapiteln eingeklappt, stammen aus der Feinabstimmung: Jedes Duell zählte dort einmal, ohne Intervall.</p>
        </section>`,

      choix: () => html`
        <section class="mx-slide mx-hero">
          <p class="mx-kicker">Die Entscheidungen</p>
          <h2>Jede Einstellung wurde gemessen, und die einfachste Regel blieb, wenn sie genauso gut abschneidet</h2>
          <p class="mx-lead">Jede Variante wurde ab 2010 auf einer Kopie der Datenbank neu berechnet und dann wie die gewählte Methode beurteilt, an
            denselben Läufern. Die Unterschiede sind in Punkten richtig vorhergesagter Duelle angegeben, von 2012 bis 2024, sofern nicht anders vermerkt; ein Sternchen oder ein Intervall, das
            die 0 nicht enthält, kennzeichnet einen signifikanten Unterschied.</p>
        </section>
        <section class="mx-slide">
          <p class="mx-kicker">Gewichte und Plätze</p>
          <h2>Die besten Läufe zählen, jeder nach seiner Bedeutung</h2>
          <ul class="mx-list">
            <li><span><b>Das Gewicht eines Laufs richtet sich nach dem Namen des Wettkampfs.</b> Eine Französische Meisterschaft hat das Gewicht ${fmtW(pf.weights.cdf)}: Sie ist der
              am stärksten besetzte Lauf, auf den sich die Läufer vorbereiten, und sie zählt wie zwei Läufe. Ein nationaler Lauf hat das Gewicht
              ${fmtW(pf.weights.national)}, jeder andere Lauf das Gewicht ${fmtW(pf.weights.other)}. Die Stufen A, B, C und D der FFCO werden nicht verwendet.</span></li>
            <li><span><b>${fmt(p6.top_n)} Plätze</b>, vom besten Score abwärts gefüllt. Sind die Plätze gefüllt, kann ein Lauf mehr den CN eines Erwachsenen nicht senken.
              Die IOF-Weltrangliste funktioniert genauso, mit den fünf besten Läufen. Zehn Plätze schnitten nicht besser ab; vier
              schnitten schlechter ab (−0,24 Punkte im Wald).</span></li>
            <li><span><b>Nur die besten ${pctOf(pf.eligible_fraction)} der Scores</b> der letzten 12 Monate können zählen, für den Ozimut-Index wie für das
              übliche Niveau, und es braucht mindestens ${fmt(pf.min_scores)} Läufe. Die außen vor gelassenen Scores sind im Wesentlichen die Läufe, in denen der Läufer
              Fehler gemacht hat. 70 oder 80 % der Scores zu berücksichtigen, kostete 0,4 bis 1 Punkt; 50 % schnitten gleich gut ab. Fünf Läufe zu verlangen, verringerte die Zahl der
              Läufer, die die Bahnen messen; sich mit zwei zu begnügen, wertete mehr Läufer, kostete aber 0,1 bis 0,4 Punkte.</span></li>
          </ul>
          ${L?.eligible_grid ? html`<p>Der Anteil der Scores, der das übliche Niveau bildet, wurde getrennt gemessen, wobei der Ozimut-Index seine 60 % behielt: Im Wald ergeben, gegenüber den
            besten 60 %, die besten 50 % ${pts(L.eligible_grid.For[50].all_holdout)}, 70 % ${pts(L.eligible_grid.For[70].all_holdout)}, 80 %
            ${pts(L.eligible_grid.For[80].all_holdout)} und alle Scores ${pts(L.eligible_grid.For[100].all_holdout)}. Im Sprint sind 50 bis 80 % gleichwertig.
            Die Fehler eines Läufers müssen aus dem Niveau herausbleiben, das die Bahnen misst.</p>` : ""}
        </section>
        <section class="mx-slide">
          <p class="mx-kicker">Das übliche Niveau</p>
          <h2>Die Bahnen werden am üblichen Niveau gemessen, nicht an den Ozimut-Indizes</h2>
          <p>Die IOF-Weltrangliste misst einen Lauf anhand der Ranglistenpunkte der anwesenden Läufer. Hier ist das mit den
            Ozimut-Indizes nicht möglich, weil sie nur die besten Läufe berücksichtigen: Sie würden sich aus sich selbst nähren. Eine Gruppe, die vor allem unter sich läuft, wie die
            Senioren oder die Jugendlichen, hätte nach oben gezogene CN, ihre Bahnen wirkten schwerer, und ihre CN stiegen weiter. In den
            ersten Versuchen wurden die H/D 21 so um etwa 13 % unterschätzt.</p>
          <p>Die Bahnen werden daher am üblichen Niveau gemessen: dem gewichteten Mittel der besten ${pctOf(pf.eligible_fraction)} der Scores, ohne Begrenzung der
            Plätze. ${S ? html`Mit den Ozimut-Indizes gemessen, würden die Duelle schlechter vorhergesagt (${ci(S.onecn?.For?.all_holdout?.ST6_t)} Punkte von 2012 bis 2024,
            ${ci(S.onecn?.For?.all_tuned?.ST6_t)} seit Juli 2025, ein Verlust, der von Saison zu Saison wächst), und die Jugendlichen würden um
            ${fmt(Math.abs(calib("For", "young", "ST6_t")?.[0] ?? 1.4), 1)} % gegenüber den H/D 21 überschätzt.` : ""}</p>
        </section>
        ${S?.jeunes ? html`<section class="mx-slide" style="${cvar("top6w")}">
          <p class="mx-kicker">Die Läufe der Jugendlichen</p>
          <h2>Ein Jugendlicher entwickelt sich schnell: Seine alten Läufe zählen immer weniger</h2>
          <p>Der CN eines Jugendlichen hinkt seinem Niveau hinterher. Anderthalb Jahre später ist das übliche Niveau eines Jugendlichen im Wald um 22 % gestiegen, das eines Erwachsenen
            um 11 % (den allgemeinen Anstieg der Skala eingerechnet): Seine Läufe von vor zehn Monaten beschreiben einen langsameren Läufer. Ein in einer Jugendkategorie (H und D bis 20 Jahre) gelaufener Lauf zählt im Mittel mit 1 − sein Alter ÷ das Zeitfenster, während die Läufe der Erwachsenen
            ihr Gewicht behalten; im üblichen Niveau, das die Bahnen misst, wie im Ozimut-Index.</p>
          <ul class="mx-list">
            <li><span><b>Wald</b>: ${pts(S.jeunes.J.For.holdout)} von 2012 bis 2024, besser in ${S.jeunes.J.For.better} von ${S.jeunes.J.For.seasons} Saisons,
              ${pts(S.jeunes.J.For.tuned)} seit Juli 2025.</span></li>
            <li><span><b>Sprint</b>: ${pts(S.jeunes.J.Spr.holdout)} von 2012 bis 2024, nichts Signifikantes seit Juli 2025
              (${ci(S.jeunes.J.Spr.tuned)}).</span></li>
            <li><span><b>MTB-O</b>: ${pts(S.jeunes.J.VTT.holdout)} von 2012 bis 2024, ${pts(S.jeunes.J.VTT.tuned)} seit Juli 2025.</span></li>
          </ul>
          <p>Die Läufe aller Läufer altern zu lassen, bringt wenig: bestenfalls ${pts(S.jeunes.adults_best.For.holdout)} im Wald (das Gewicht alle sechs Monate
            halbiert), und nichts mehr, sobald die Läufe der Jugendlichen verblassen (${pts(S.jeunes.adults_and_juniors.For.holdout)} mit beidem,
            ${pts(S.jeunes.J.For.holdout)} nur mit den Jugendlichen). Das Niveau eines Erwachsenen ändert sich von einer Saison zur nächsten wenig: Ein Lauf vom letzten Jahr
            sagt noch etwas darüber aus. Ein Zeitfenster von zwei Jahren ergibt ${pts(S.jeunes.window24.For.holdout)} im Wald; die Läufe nur im Ozimut-Index verblassen zu lassen, ohne
            das übliche Niveau anzutasten, ${pts(S.jeunes.top_only.For.holdout)}. Der Preis: Im Wald werden die Jugendlichen etwas öfter vor den
            H/D 21-34 erwartet, als sie tatsächlich vor ihnen ins Ziel kommen (${sg(S.jeunes.J.For.junior_bias[0], 1)} Punkte vorher, ${sg(S.jeunes.J.For.junior_bias[1], 1)} nachher); im
            Sprint und im MTB-O, wo sie unterschätzt waren, verringert sich der Abstand.</p>
        </section>` : ""}
        ${S?.ecarts ? html`<section class="mx-slide">
          <p class="mx-kicker">Läufer fern ihres Niveaus</p>
          <h2>Sie aus der Messung der Bahnen herauszunehmen, lohnt sich nicht</h2>
          <p>Auf einer Bahn kommen einige Läufer weit von dem entfernt ins Ziel, was ihr übliches Niveau erwarten lässt: viel schneller, oft Jugendliche in der Entwicklung,
            deren Niveau tatsächlich zu niedrig war (ein Jahr später 17 bis 19 % über den anderen Läufern ihres Alters), oder viel langsamer, nach einem
            Fehler. Die Studie vom 18. Oktober 2026 hat mit 28 Regeln versucht, sie aus dem Bahnwert herauszunehmen: auf einer Seite oder auf beiden, jenseits einer Schwelle oder
            als fester Anteil, und die Jugendlichen die Bahnen nicht mehr messen zu lassen.</p>
          <ul class="mx-list">
            <li><span><b>Nur die Schnellsten herauszunehmen</b>, hebt die Bahnen der Jugendlichen an, damit ihre CN, damit die Messung ihrer folgenden Bahnen: Im
              Wald liegen die Bahnen der Jugendlichen am Ende bis zu ${fmt(S.ecarts.loop_fast_25[0], 0)} % über denen der Erwachsenen, und die Vorhersage wird schlechter
              (${pts(S.ecarts.fast_25.For.holdout)}, ${pts(S.ecarts.fast_5.For.holdout)} bei der Schwelle von 5 %).</span></li>
            <li><span><b>Beide Seiten herauszunehmen</b>, kostet im Wald (${pts(S.ecarts.both_25.For.holdout)}); im Sprint gewinnt es, zusammen mit dem Ausschluss der Jugendlichen,
              ${pts(S.ecarts.both_and_no_juniors.Spr.holdout)}, und ${pts(S.ecarts.both_and_no_juniors.VTT.holdout)} im MTB-O.</span></li>
          </ul>
          <p>Diese Gewinne verlangten zwei zusätzliche Regeln bei der Messung der Bahnen, die zu erklären und zu pflegen wären, um denselben Mangel zu beheben wie
            das Verblassen der Läufe der Jugendlichen: einen CN eines Jugendlichen, der seinem Niveau hinterherhinkt. Die Methode lässt die Messung der Bahnen, wie sie ist, und behandelt diesen
            Rückstand dort, wo er entsteht: im CN.</p>
        </section>` : ""}
        <section class="mx-slide" style="${cvar("top6w")}">
          <p class="mx-kicker">Der Bahnwert</p>
          <h2>Welcher Anteil des Feldes die Bahn misst</h2>
          <p>Die Regel der FFCO misst eine Bahn an den schnellsten zwei Dritteln. Im letzten Drittel finden sich schwächere Läufer, die auf
            ihrem Niveau gelaufen sind, und Läufer, die Fehler gemacht haben. Lässt man sie weg, misst man die Schwierigkeit der fast fehlerfrei gelaufenen Bahn; doch manche
            Bahnen provozieren viel mehr Fehler als andere, und auf diesen Bahnen fallen alle Scores zu niedrig aus. Im Wald übertrifft der am ganzen
            Feld gemessene Wert den der zwei Drittel im Mittel um 4,8 %, bei jeder zehnten Bahn aber kaum und bei einer weiteren von zehn um mehr als 10 %;
            im Sprint um 2,8 %.</p>
          <p>Der Anteil der Schnellsten wurde daher in jeder Disziplin festgelegt, nach einem einzigen Kriterium: dem Anteil, der die Duelle von 2012 bis 2024 am besten vorhersagt,
            ohne signifikanten Verlust seit Juli 2025.</p>
          ${L ? html`<div class="table-wrap"><table class="data compact"><thead><tr><th class="r">Anteil des Feldes</th>
            ${["For", "Spr", "VTT"].map((tr) => html`<th class="r">${t(`terrain.${tr}`)}<br>2012–2024</th><th class="r">${t(`terrain.${tr}`)}<br>seit 2025</th>`)}</tr></thead>
            <tbody>${share("For").map((r0) => html`<tr><td class="r">${r0.pct === 67 ? "die zwei Drittel (FFCO)" : r0.pct === 100 ? "das ganze Feld" : `${fmt(r0.pct)} %`}</td>
              ${["For", "Spr", "VTT"].map((tr) => { const r = share(tr).find((x) => x.pct === r0.pct); const on = picked(tr) === r0.pct;
                return r ? html`<td class="r num">${on ? html`<b>${cell(r.all_holdout)}</b>` : cell(r.all_holdout)}</td><td class="r num">${on ? html`<b>${cell(r.all_tuned)}</b>` : cell(r.all_tuned)}</td>` : html`<td class="r">—</td><td class="r">—</td>`; })}</tr>
              ${r0.pct === 85 ? (L.forest90 ? html`<tr><td class="r"><b>90 %</b></td><td class="r num"><b>${sg(L.share.For.rows.find((x) => x.pct === 100).all_holdout[0] + L.forest90.vs100.all_holdout[0], 2)}*</b></td>
                <td class="r num"><b>${sg(L.share.For.rows.find((x) => x.pct === 100).all_tuned[0] + L.forest90.vs100.all_tuned[0], 2)}*</b></td><td class="r">—</td><td class="r">—</td><td class="r">—</td><td class="r">—</td></tr>` : "") : ""}`)}

            </tbody></table></div>
          <p class="muted" style="font-size:13px">Unterschied im Anteil richtig vorhergesagter Duelle, in Punkten, gegenüber den schnellsten zwei Dritteln, mit der Ozimut-Methode
            (gewöhnliche Mittelwerte, verlängerte Neuskalierung). Ein Sternchen kennzeichnet einen signifikanten Unterschied; fett der gewählte Anteil. Ski-O folgt dem MTB-O: Es hat zu
            wenige Läufe, um gemessen zu werden.</p>
          <ul class="mx-list">
            <li><span><b>Wald: 90 %.</b> Je größer der Anteil, desto besser sagt die Methode vorher: Das ganze Feld gewinnt ${pts(share("For").find((x) => x.pct === 100)?.all_holdout)}
              gegenüber den zwei Dritteln, und 90 % gewinnen noch einmal ${pts(L.forest90?.vs100?.all_holdout)} gegenüber dem ganzen Feld (${pts(L.forest90?.vs100?.nat_holdout)} bei den
              nationalen Läufen), besser in ${fmt(L.forest90?.vs100?.better ?? 0)} von 15 Saisons, schlechter in ${fmt(L.forest90?.vs100?.worse ?? 0)}.
              Das letzte Zehntel des Feldes sind die völlig verpatzten Läufe: Sie wegzulassen, nimmt der Messung der Bahn nichts und verhindert, dass ein
              einzelner verirrter Läufer sie bestimmt.</span></li>
            <li><span><b>Sprint: zwei Drittel</b>, die Regel der FFCO. Nichts schneidet über die fünfzehn Saisons besser ab; 75 % verlieren etwas, das ganze Feld
              ${pts(share("Spr").find((x) => x.pct === 100)?.all_holdout)}. Fehler sind dort halb so häufig wie im Wald, und die Langsamsten sagen dort
              weniger über die Bahn aus als über sich selbst.</span></li>
            <li><span><b>MTB-O: 75 %.</b> 85 % schneiden von 2012 bis 2024 am besten ab (${pts(share("VTT").find((x) => x.pct === 85)?.all_holdout)}), verlieren aber
              ${pts(share("VTT").find((x) => x.pct === 85)?.all_tuned)} seit Juli 2025; 75 % gewinnen ${pts(share("VTT").find((x) => x.pct === 75)?.all_holdout)}
              und verlieren seitdem nichts Signifikantes. <b>Ski-O: 75 %</b>, wie MTB-O.</span></li>
          </ul>` : noStudy}
        </section>
        <section class="mx-slide">
          <p class="mx-kicker">Die Neuskalierung</p>
          <h2>Ein Faktor, verlängert im Tempo des Niveauanstiegs</h2>
          <p>Der CN eines Läufers besteht aus seinen besten Läufen: Er liegt etwas über seinen gewöhnlichen Läufen. Die folgenden Bahnen werden mit
            diesen etwas zu hohen Niveaus gemessen, ihre Scores fallen etwas höher aus, und die daraus folgenden CN ebenfalls: Vor der Neuskalierung steigt das allgemeine Niveau um
            einige Zehntelprozent pro Monat. Die Neuskalierung bringt es auf ${fmt(pf.anchor_target)} zurück. Doch der Faktor eines Tages wird am Niveau berechnet,
            das vor diesem Tag gemessen wurde, und jeder CN fasst selbst ein Jahr Läufe zusammen: Insgesamt korrigierte er das Niveau, wie es 18 bis 20 Monate zuvor war, und das
            veröffentlichte Niveau lag im Wald 7 % über dem Ziel.</p>
          <p>Die gewählte Korrektur verlängert den 13-Monats-Mittelwert im durchschnittlichen Tempo des Anstiegs der letzten zehn Jahre. Dieses Tempo ändert sich von Monat
            zu Monat sehr wenig, der Faktor bleibt gleichmäßig, und seit 2018 liegt das veröffentlichte Niveau im Mittel im Wald und im MTB-O innerhalb von 2 % um ${fmt(pf.anchor_target)}, im Sprint innerhalb von 3 % (bis zu 6 bis 9 %
            nach den Covid-Saisons, deren wenige Läufe das Tempo des Anstiegs gestört haben). Ein
            Faktor, der ruckelt, setzt die Scores zweier benachbarter Monate auf unterschiedliche Niveaus: Eine jeden Monat neu berechnete Gerade kostete 0,06 Punkte.
            ${L?.recalage_gain ? html`Auf die gewählte Methode angewandt, gewinnt die Korrektur im Wald ${pts(L.recalage_gain.For)} an Duellen und ändert anderswo nichts
            Signifikantes.` : ""} Die auf 5600 gebrachten Werte sind die Ozimut-Indizes, also die veröffentlichten, nicht die üblichen Niveaus.</p>
        </section>
        <section class="mx-slide" style="--c:var(--bad)">
          <p class="mx-kicker">Gemessen, dann verworfen</p>
          <h2>Die anderen Ideen und was sie ergeben haben</h2>
          <ul class="mx-list bad">
            <li><span><b>Der Bahnwert als geometrisches Mittel</b> (mit dem üblichen Niveau als kubischem Mittel): gegenüber der Ozimut-Methode, an denselben
              Läufern, −0,02 Punkte bei den Duellen im Wald und +0,15 [0,10; 0,20] im Sprint. Im Sprint etwas besser, wurde es verworfen, weil sich das
              gewöhnliche Mittel von Hand nachrechnen lässt: Für ein paar Hundertstelpunkte gewinnt die einfache Regel. Was den Unterschied zwischen den
              Methoden ausmachte, war der Anteil des Feldes, der die Bahn misst, nicht die Art, ihn zu mitteln.</span></li>
            <li><span><b>Rückstand teurer machen</b> (die Zeit hoch einer Potenz, 7. Oktober 2026): ein Gewinn bis zur Potenz 2, dann nichts mehr;
              in Wirklichkeit änderte das die Mittelwerte der Bahn und des üblichen Niveaus, wie die vorige Variante.</span></li>
            <li><span><b>Eine eigene Regel für jede Bahn, um die Zeit in einen Score zu übersetzen</b>, an der Bahn selbst geschätzt: schlechter
              (${pts(S?.onecn?.For?.all_holdout?.IK_t)} im Wald, ${pts(S?.onecn?.Spr?.all_holdout?.IK_t)} im Sprint); bei rund zwanzig Läufern
              ist die Schätzung zu unsicher.</span></li>
            <li><span><b>Läufen, die die Läufer besser trennen, mehr Gewicht geben</b>: kein signifikanter Unterschied.</span></li>
            <li><span><b>Ein Score, der sehr große Zeitverluste weniger bestraft</b>: etwas besser im Wald, deutlich schlechter im Sprint.</span></li>
            <li><span><b>Das Niveau, geschätzt von einem statistischen Modell</b>, das Tagesform und Fehler trennt: besser im Sprint
              (${S ? sg(S.mle_fit.Spr[0], 2) : "+0,37"} Punkte), deutlich schlechter im Wald (${S ? sg(S.mle_fit.For[0], 2) : "−1,62"} Punkte): Im Wald ist
              häufiges Fehlermachen ein Merkmal des Läufers.</span></li>
            <li><span><b>Ausreißerzeiten abschwächen</b> (eine statistische Methode nach Huber) oder nur die langsamsten 15 % weglassen, statt
              den Anteil des Feldes festzulegen: etwa 0,1 Punkte weniger.</span></li>
            <li><span><b>Ein gemeinsamer Bahnwert für gleich lange Sprintbahnen</b>: Das Tempo ist von Bahn zu Bahn nicht vergleichbar.</span></li>
            <li><span><b>Ein Score auf Basis des Abstands zur mittleren Zeit der Bahn</b>, nach Art der IOF-Weltrangliste: schlechter als der Score der FFCO.</span></li>
            <li><span><b>Eine Neuskalierung, die auf ihre eigenen Wirkungen reagiert</b>: Sie schwankte von Monat zu Monat.</span></li>
          </ul>
        </section>`,

      resultats: () => html`
        <section class="mx-slide mx-hero">
          <p class="mx-kicker">Die Ergebnisse</p>
          <h2>Gegen die offizielle Rangliste, über fünfzehn Saisons, die nicht zur Feinabstimmung dienten</h2>
          ${ev ? html`<p class="mx-lead">Von ${ev.holdout[0]} bis ${ev.holdout[1]} sagt der Ozimut-Index an denselben Läufern im Wald ${lvl(hf, "acc", "top6w")} % der
            Duelle richtig vorher, gegenüber ${lvl(hf, "acc", "official")} % beim offiziellen CN, und im Sprint ${lvl(hs, "acc", "top6w")} % gegenüber ${lvl(hs, "acc", "official")} %.
            Er erklärt auch die Zeitabstände zwischen den Läufern viel besser.</p>` : ""}
        </section>
        ${ev ? html`<section class="mx-slide">
          <p class="mx-kicker">Gegen die offizielle Rangliste</p>
          <h2>Die Zahlen</h2>
          <div class="table-wrap"><table class="data compact"><thead><tr><th></th><th class="r" colspan="2">Wald</th><th class="r" colspan="2">Sprint</th></tr>
            <tr><th></th><th class="r">${methodShort("official")}</th><th class="r">${methodShort("top6w")}</th><th class="r">${methodShort("official")}</th><th class="r">${methodShort("top6w")}</th></tr></thead>
            <tbody>
              <tr><td>richtig vorhergesagte Duelle</td><td class="r num">${lvl(hf, "acc", "official")} %</td><td class="r num"><b>${lvl(hf, "acc", "top6w")} %</b></td><td class="r num">${lvl(hs, "acc", "official")} %</td><td class="r num"><b>${lvl(hs, "acc", "top6w")} %</b></td></tr>
              <tr><td>erklärte Zeitabstände</td><td class="r num">${lvl(hf, "r2", "official")} %</td><td class="r num"><b>${lvl(hf, "r2", "top6w")} %</b></td><td class="r num">${lvl(hs, "r2", "official")} %</td><td class="r num"><b>${lvl(hs, "r2", "top6w")} %</b></td></tr>
              <tr><td>Gewinn des Ozimut-Index bei den Duellen, alle Läufe</td><td class="r num" colspan="2">${dci(hf, "top6w-official", "acc")}</td><td class="r num" colspan="2">${dci(hs, "top6w-official", "acc")}</td></tr>
              <tr><td>Gewinn des Ozimut-Index bei den Duellen, nationale Läufe</td><td class="r num" colspan="2">${dci(hfn, "top6w-official", "acc")}</td><td class="r num" colspan="2">${dci(hsn, "top6w-official", "acc")}</td></tr>
              <tr><td>Gewinn des Ozimut-Index bei den erklärten Zeitabständen</td><td class="r num" colspan="2">${dci(hf, "top6w-official", "r2")}</td><td class="r num" colspan="2">${dci(hs, "top6w-official", "r2")}</td></tr>
              <tr><td>Saisons, in denen der Gewinn des Ozimut-Index signifikant ist</td><td class="r num" colspan="2">${evWins("For").join(" von ")}</td><td class="r num" colspan="2">${evWins("Spr").join(" von ")}</td></tr>
            </tbody></table></div>
          <p class="muted" style="font-size:13px">Saisons ${ev.holdout[0]} bis ${ev.holdout[1]}: ${fmt(ev.rows.For.all.holdout.comps)} Wettkämpfe im Wald und
            ${fmt(ev.rows.Spr.all.holdout.comps)} im Sprint, dieselben Läufer für jede Methode, jede Bahn gewichtet mit ihrer Läuferzahl. Die Gewinne
            sind in Punkten angegeben, mit ihrem 95-%-Intervall. Diese Zahlen werden bei jeder Aktualisierung der Website neu berechnet.</p>
        </section>
        <section class="mx-slide" id="saisons">
          <p class="mx-kicker">Saison für Saison</p>
          <h2>Der Unterschied zwischen zwei Methoden, jede Saison, mit seiner Marge</h2>
          <div class="filters" id="ev-controls"></div>
          <div class="grid grid-2" id="ev-seasons"></div>
          <p class="muted" style="font-size:13px">Jede Zeile ist eine Saison. Der Punkt ist der Unterschied zwischen den beiden Methoden, in Punkten; der Strich ist sein
            95-%-Intervall. Ein Punkt rechts der Nulllinie spricht für die zuerst genannte Methode. Grün: ein signifikanter Unterschied zugunsten der
            ersten Methode; rot: zugunsten der zweiten; grau: ein nicht signifikanter Unterschied. Es zählen nur Bahnen mit mindestens ${ev.min_runners}
            Läufern, die in jeder Methode einen CN haben. Vor 2026 ist die offizielle Methode die gemeinsame Wald- und Sprintrangliste der FFCO.</p>
        </section>
        <section class="mx-slide" id="periodes">
          <p class="mx-kicker">Die beiden Methoden</p>
          <h2>In den zurückgehaltenen Saisons und während der Feinabstimmung</h2>
          <div id="ev-periods"></div>
        </section>` : html`<section class="mx-slide"><p>${t("me.val.none")}</p></section>`}
        <section class="mx-slide">
          <p class="mx-kicker">Jugendliche und Senioren</p>
          <h2>Keine Gruppe bevorzugt</h2>
          <p>Ein gerechter CN darf keine Gruppe bevorzugen. Um das zu prüfen, ermitteln wir für die Jugendlichen (20 Jahre und jünger) und für die Senioren (55 Jahre und älter),
            um wie viel man ihren CN korrigieren müsste, damit er ihre Duelle gegen die H/D 21 am besten vorhersagt. ${S ? html`Im Wald unterschätzt der offizielle CN
            die Jugendlichen um ${pctCi(calib("For", "young", "official"))}: Ihre Bahnen provozieren viele Fehler, die die Messung an den schnellsten zwei
            Dritteln außen vor lässt. Am ganzen Feld gemessen, rückte der Bahnwert sie wieder an ihren Platz (Studie vom 13. Oktober). Die Senioren bleiben bei allen
            Methoden um 8 bis 9 % überschätzt, die offizielle eingeschlossen: Die Ursache ist nicht die Messung der Bahn und verlangte eine eigene Studie.` : ""}</p>
        </section>
        <section class="mx-slide">
          <p class="mx-kicker">Übereinstimmung der Methoden</p>
          <h2>Ähnliche Ranglisten, keine identischen</h2>
          <p>Jeder Punkt ist ein Läufer in der zuletzt veröffentlichten Rangliste: waagerecht sein offizieller CN, senkrecht sein Ozimut-Index. Die Punkte nahe
            der Diagonale haben in beiden Methoden ungefähr denselben Wert.</p>
          <div class="filters" id="agr-filters"></div>
          <div class="grid grid-main-side" style="align-items:start">
            ${chartCard({ id: "agr", title: "Derselbe Läufer in zwei Methoden", hint: "Jeder Punkt ist ein Läufer, in der zuletzt veröffentlichten Rangliste", tall: true })}
            <section class="card"><div class="card-head"><h2>Unterschiede zwischen den Methoden</h2></div><div id="agr-stats"></div>
              <div class="card-body"><p class="muted" style="font-size:13px;margin:0">Korrelation: 1, wenn die beiden CN genau proportional sind, 0, wenn
                sie nichts miteinander zu tun haben. Mittlere Abweichung: um wie viel der zweite CN den ersten im Mittel übertrifft. Mittlere absolute Abweichung: um wie viel sich die beiden CN
                im Mittel unterscheiden, in die eine oder die andere Richtung.</p></div></section>
          </div>
        </section>`,

      conclusion: () => html`
        <section class="mx-slide" style="${cvar("top6w")}">
          <p class="mx-kicker">Die gewählte Methode</p>
          <h2>Die Regeln in Kürze</h2>
          <ul class="mx-list">
            <li><span><b>Übliches Niveau</b>: für jeden Läufer, 15 Tage vor dem Lauf, das gewichtete Mittel seiner besten ${pctOf(pf.eligible_fraction)}
              Ozimut-Scores der letzten 12 Monate, jeder nach seinem Gewicht, ohne Begrenzung der Plätze (im MTB-O und Ski-O: 70 % der Scores, über zwei bzw. drei Jahre), wobei ein
              in einer Jugendkategorie gelaufener Lauf mit 1 − sein Alter ÷ das Zeitfenster zählt. Es ist keine Rangliste, sondern ein Schritt bei der Berechnung
              des Bahnwerts.</span></li>
            <li><span><b>Ozimut-Bahnwert</b>: das Mittel der Produkte übliches Niveau × Zeit der schnellsten Läufer, die ein Niveau haben:
              ${shareName(own(pf, "For", "sample_fraction") ?? 2 / 3)} im Wald, ${shareName(own(pf, "Spr", "sample_fraction") ?? 2 / 3)} im Sprint,
              ${shareName(own(pf, "VTT", "sample_fraction") ?? 2 / 3)} im MTB-O und Ski-O; mindestens ${fmt(pf.min_ranked)} Läufer, alle
              ${fmt(pf.min_ranked)}, wenn es nur ${fmt(pf.min_ranked)} gibt.</span></li>
            <li><span><b>Ozimut-Score</b>: der Ozimut-Bahnwert geteilt durch die Zeit, multipliziert mit dem Neuskalierungsfaktor des Tages und ein für alle Mal festgelegt.
              Ein Fehlstempel, eine Aufgabe, eine Disqualifikation oder eine Zeitüberschreitung ergeben 0, und diese 0 zählt.</span></li>
            <li><span><b>Ozimut-Index</b>: Die besten Ozimut-Scores unter den besten ${pctOf(pf.eligible_fraction)} der letzten 12 Monate füllen
              ${fmt(p6.top_n)} Plätze: ${fmtW(pf.weights.cdf)} für eine Französische Meisterschaft, ${fmtW(pf.weights.national)} für einen nationalen Lauf,
              ${fmtW(pf.weights.other)} für jeden anderen Lauf. Der Ozimut-Index ist das gewichtete Mittel der behaltenen Scores, jeder so oft gezählt, wie er
              Plätze hat; ein in einer Jugendkategorie gelaufener Lauf zählt darin mit 1 − sein Alter ÷ das Zeitfenster. Es braucht mindestens ${fmt(pf.min_scores)} Läufe.</span></li>
            <li><span><b>Neuskalierung</b>: Jeden Tag hält ein Faktor das Mittel der besten ${pctOf(pf.anchor_top_fraction)} der Ozimut-Indizes
              jeder Disziplin auf ${fmt(pf.anchor_target)}. Er wird am Niveau berechnet, das zwei Monate zuvor gemessen wurde, gemittelt über 13 Monate, um 10 Monate verlängert im Tempo des Anstiegs
              der letzten zehn Jahre, in allen vier Disziplinen; die Monate zählen nach dem Kalender.</span></li>
          </ul>
          <p>Die vollständigen Regeln stehen im Tab <a href="#/documentation?onglet=top" data-tab-link="top">Ozimut-Methode</a>.</p>
          <p><a class="mx-dl" href="${PDF}" download>⬇ Studie als PDF herunterladen (Whitepaper)</a></p>
        </section>
        <section class="mx-slide">
          <p class="mx-kicker">Warum diese</p>
          <h2>Die einfachste unter denen, die am besten vorhersagen</h2>
          <p>Alle im Oktober 2026 getesteten Varianten liegen nur wenige Zehntelpunkte richtig vorhergesagter Duelle auseinander, die besten nur wenige
            Hundertstel. Auf diesem Niveau sieht man einen Gewinn in keiner Rangliste mehr, eine komplizierte Regel aber in jeder Erklärung. Die gewählte Methode
            behält daher den Score der FFCO und gewöhnliche Mittelwerte bei und ändert nur, was wirklich zählt: die besten Läufe auf sechs Plätzen,
            ein je Disziplin festgelegter Anteil des Feldes zur Messung der Bahnen und eine fortlaufende Neuskalierung. Sie gewinnt gegenüber dem offiziellen CN
            mehr als zwei Punkte bei den Duellen, im Wald wie im Sprint.</p>
          <div class="mx-verdict">
            <div class="mx-box" style="${cvar("top6w")}"><h3>Rangieren, qualifizieren, selektionieren</h3>
              <div class="who">${cnLabel("top6w")}</div>
              <p>Was der Läufer in Bestform leisten kann, gespeist von den großen Wettkämpfen; sind seine 6 Plätze einmal gefüllt, senkt ein weiterer Lauf
                den Wert eines Erwachsenen nicht.</p></div>
            <div class="mx-box" style="${cvar("top6w")}"><h3>Vorhersagen, wer vorne landet</h3>
              <div class="who">${cnLabel("top6w")}</div>
              <p>Deutlich vor der offiziellen Methode: mehr als 2 Punkte mehr richtig vorhergesagte Duelle, im Wald wie im Sprint.</p></div>
            <div class="mx-box" style="${cvar("official")}"><h3>Die Schwierigkeit einer Bahn messen</h3>
              <div class="who">Die bereits gelaufenen Scores</div>
              <p>Das übliche Niveau der anwesenden Läufer, aus ihren früheren Läufen, über die Schnellsten des Feldes, ohne die Begrenzung auf Plätze, die
                die Messung verfälschen würde.</p></div>
            <div class="mx-box" style="${cvar("official")}"><h3>Maßgeblich sein</h3>
              <div class="who">${cnLabel("official")}</div>
              <p>Die einzige offizielle Rangliste, die der Selektionen, welche Grenzen sie auch hat.</p></div>
          </div>
          <p class="muted" style="font-size:13px;margin-top:14px">Die Daten stammen von der Website der nationalen Rangliste der FFCO; ein fehlender, falsch
            erfasster oder später korrigierter Lauf kann eine Abweichung erklären. Die Ozimut-Methode geht von den CN-Werten von 2010 aus: Ihre ersten Monate spiegeln
            vor allem diesen Ausgangspunkt wider. Ihre Indizes ersetzen keinesfalls die offizielle Rangliste.</p>
        </section>`,
    };
    return html`<p style="margin:0 0 12px"><a href="#/documentation?onglet=top" data-tab-link="top">← Ozimut-Methode</a></p>${buildChapters(STUDY_CHAPTERS, CH, "objectifs")}`;
  }

  // ======================================================================================================
  // 5. Le tracé (Organisation › Tracer): a guide that needs nothing else — starting, the map, the screen, the tools, courses,
  //    descriptions, specials, printing, checks, teamwork, after the race, every menu entry — and its calculations, in plain words
  // ======================================================================================================
  function tracerDoc() {
    const CHAPTERS = [["principe", "Erste Schritte"], ["carte", "Die Karte"], ["ecran", "Der Bildschirm"], ["postes", "Die Posten"], ["circuits", "Die Bahnen"],
      ["definitions", "Die Postenbeschreibungen"], ["speciaux", "Sonderobjekte"], ["sorties", "Drucken und exportieren"], ["verifier", "Prüfen"],
      ["outils", "Im Team und im Gelände"], ["apres", "Nach dem Lauf"], ["ruban", "Das Menüband"], ["avance", "Die erweiterte Stufe"], ["calculs", "Die Berechnungen"]];
    const ic = (k, s = 18) => raw(TR.svg(k, s));
    const K = "Bahnlegung";
    // where a command is in the ribbon: « Carte › Position › Caler les postes »
    const W = (act) => TRD.ribbonAt(act);
    // the tools of the editor's bar, with the letter that picks them
    const TOOLS = [
      ["select", "Auswahl", "S", "Ein Objekt anklicken, um es auszuwählen; ein ausgewähltes Objekt ziehen, um es zu verschieben; anderswo ziehen, um die Karte zu verschieben. Ein Doppelklick auf einen Posten öffnet seine Beschreibung."],
      ["start", "Start", "D", "Auf die Stelle des Starts klicken. In einer Bahn übernimmt ein Klick auf einen bereits gesetzten Start diesen."],
      ["control", "Posten", "P", "Klicken, um einen Posten zu setzen; das Werkzeug bleibt aktiv, um die nächsten zu setzen. Ein Klick auf einen blassen Posten, den einer anderen Bahn, fügt ihn der Bahn hinzu."],
      ["finish", "Ziel", "A", "Auf die Stelle des Ziels klicken."],
      ["crossing", "Pflichtdurchgang", "O", "Ein Punkt, den die Läufer passieren müssen (eine Lücke in einem Zaun, eine Brücke): auf die Teilstrecke klicken."],
      ["issue", "Kartenausgabe", "", "Wo der Läufer vor dem Start seine Karte erhält; eine markierte Strecke führt dann zum Start."],
      ["exchange", "Kartenwechsel", "", "Einen Posten der Bahn anklicken: Der Läufer wechselt dort die Karte, und die Bahn wird in Teile geteilt."],
      ["bend", "Knick", "C", "Eine Teilstrecke anklicken, um sie zu knicken (um ein Sperrgebiet zu umgehen); ein Knick lässt sich ziehen; einen Knick anklicken, um ihn zu entfernen."],
      ["gap", "Lücke", "X", "Entlang einer Teilstrecke oder eines Kreises ziehen, um sie zu unterbrechen und ein Kartendetail lesbar zu lassen; eine Lücke anklicken, um sie zu schließen."],
      ["route", "Route", "", "Der für die Läufer vorgesehene Weg, der für die Steigung dient: die Teilstrecke anklicken, dann die Punkte des Weges; Doppelklick zum Beenden. Er wird nicht gedruckt."],
      ["descr", "Beschreibungen auf der Karte", "", "Einen Rahmen auf die Karte ziehen: Die Postenbeschreibungen der Bahn kommen dorthin, und ihre Breite bestimmt ihre Größe."],
      ["special", "Sonderobjekte", "", "Öffnet die Liste der Objekte: Wasserstelle, Sanitätsposten, Sperrgebiet, Text, Bild … (Kapitel „Sonderobjekte“)."],
    ];
    const KEYS = [
      ["Strg + Z, Strg + Y", "Rückgängig, wiederherstellen (100 Schritte)"], ["Strg + S", "Sofort speichern"],
      ["Entf", "Das ausgewählte Objekt löschen; in einer Bahn den Posten nur aus der Bahn entfernen"],
      ["Esc", "Das laufende Zeichnen abbrechen, zur Auswahl zurückkehren, dann die Auswahl aufheben"],
      ["Eingabe", "Eine Linie, eine Fläche oder eine Route beenden (wie ein Doppelklick)"],
      ["S, D, P, A, O, C, X", "Ein Werkzeug wählen (S Auswahl, D Start, P Posten, A Ziel, O Pflichtdurchgang, C Knick, X Lücke)"],
      ["Umschalt + Klick", "Das Werkzeug behalten, nachdem ein Start, ein Ziel oder ein Objekt gesetzt wurde"],
      ["Umschalt beim Ziehen eines Postens", "Ihn genau auf einen benachbarten Posten setzen"],
      ["Mausrad, + und −", "Zoomen"], ["Pfeiltasten, Ziehen mit rechter Maustaste", "Die Karte verschieben"], ["Rechtsklick", "Das Menü des Objekts unter der Maus"],
      ["Alt", "Die Tastenkürzel des Menübands: ein Buchstabe auf jeder Registerkarte, dann auf jeder Schaltfläche der gewählten Registerkarte"], ["Alt + Q", "Einen Befehl suchen"],
      ["← → ↑ ↓, Pos1, Ende (im Menüband)", "Von Registerkarte zu Registerkarte (sie wird angezeigt), von Schaltfläche zu Schaltfläche; ↓ von einer Registerkarte führt in ihr Menüband, ↑ zurück; Tab wechselt von den Registerkarten zum Menüband"],
      ["Strg + F1", "Das Menüband auf seine Registerkarten einklappen oder wieder ausklappen"], ["F1", "Die Anleitung, beim Kapitel des Befehls unter der Maus"],
    ];
    // what each menu entry does (the menus come from tracer/icons.js, as in the editor)
    const MENU_HELP = {
      "start-new": "Eine weitere Veranstaltung anlegen, auf ihrer Karte (die erste der drei Möglichkeiten, die die Seite beim Öffnen anbietet).",
      "start-open": "Eine andere deiner Veranstaltungen öffnen (die du angelegt hast und die, zu deren Team du gehörst).",
      "start-import": "Eine Veranstaltung aus einer Ozimut-Datei (.ozmt, die ihre Karte enthält) oder einer Purple-Pen-Datei (.ppen, mit ihrer Karte): eine neue Veranstaltung, neben dieser.",
      save: "Speichert sofort; gespeichert wird auch von selbst, wenige Sekunden nach jeder Änderung.",
      "version-save": "Behält den aktuellen Stand unter einem Namen, um später darauf zurückzukommen.",
      versions: "Die Liste der Versionen (alle 30 Minuten Arbeit wird ebenfalls eine Version behalten): sehen, was sich geändert hat, eine davon wieder öffnen.",
      "export-ocn": "Die ganze Veranstaltung in einer einzigen Ozimut-Datei (.ozmt), auf Wunsch mit Karte: eine Kopie, ein Archiv oder die Veranstaltung für einen anderen Verein; sie lässt sich mit „Veranstaltung importieren“ wieder öffnen.",
      "export-ppen": "Die Veranstaltungsdatei für Purple Pen, neben die Karte zu legen.",
      "import-ppen": "Ersetzt die Bahnen der Veranstaltung durch die einer Purple-Pen-Datei; die Karte bleibt die der Veranstaltung.",
      "pdf-courses": "Die Bahnkarten zum Drucken.", "pdf-descriptions": "Nur die Postenbeschreibungen, mehrere pro Seite.",
      "pdf-punch": "Die Kontrollkarten, mit einem Feld pro Posten.",
      "export-iof3": "Die Bahnen für die Zeitmessungssoftware: Posten, Reihenfolge, Längen und die Staffelteams.",
      "export-iof2": "Dasselbe für ältere Software.", "export-gpx": "Die Posten als GPS-Wegpunkte (georeferenzierte Karte).",
      "export-kml": "Die Bahnen für Google Earth oder eine Online-Karte (georeferenzierte Karte).",
      "export-images": "Ein Bild pro Bahn, mit seinem World-File, wenn die Karte georeferenziert ist.",
      "export-ocad": "Jede Bahn als OCAD- oder OpenOrienteering-Mapper-Karte, um sie mit dieser Software fertigzustellen oder zu drucken.",
      "export-routegadget": "Die Karte als Bild und die Bahnen, zum Hochladen auf RouteGadget.", "export-csv": "Die Tabellen der Berichte, für eine Tabellenkalkulation.",
      publish: "Nach dem Lauf: die Bahnen in der Analyse, wo die Läufer ihre GPS-Tracks hochladen.",
      "send-results": "Ab dem Lauftag: Länge, Steigung und Posten jeder Bahn werden an die Ergebnisse der Website geschickt.",
      "map-change": "Eine andere Karte (eine korrigierte Fassung, ein besserer Scan, die OCAD-Datei): Die Posten behalten ihren Platz.",
      offline: "Die Veranstaltung auf diesem Gerät behalten, um sie ohne Netz zu öffnen.",
      "event-props": "Der Titel, der Kartenmaßstab (und die Auflösung eines Bildes), der Druckmaßstab von „Alle Posten“, die Sprache der Textbeschreibungen, Notizen.",
      appearance: "Die Größe der Kreise, die Strichstärke, Schrift und Größe der Nummern, das Violett und wie es auf der Karte liegt.",
      standards: "Die Norm der Postenbeschreibungen (IOF 2004 oder 2018/2024) und die der Karte (ISOM 2017, ISSprOM 2019, ISOM 2000), die die Größe der Symbole festlegt.",
      numbering: "Der erste Code für neue Posten, und ob Codes vermieden werden, die sich auch auf dem Kopf lesen lassen (66, 99 …).",
      codes: "Die Codes mehrerer Posten auf einmal ändern.", renumber: "Jedem Posten neu einen Code geben, ab dem ersten Code.",
      "remove-unused": "Die Posten löschen, die keine Bahn verwendet.", calage: "Alle Posten mit zwei Klicks neu auf der Karte ausrichten (Kapitel „Die Karte“).",
      "move-all": "Alle Posten auf einmal verschieben, drehen oder skalieren.",
      "custom-text": "Den Text ändern, den die Textbeschreibungen einem Symbol geben.", punch: "Das Zangenmuster jedes Postens, um die Kontrollkarten zu prüfen.",
      load: "Die Zahl der Teilnehmer jeder Bahn (aus den offiziellen Anmeldungen übernommen, wenn es welche gibt), für die Belastung der Posten.",
      georef: "Die Karte auf der Erde verorten: angeklickte Punkte, ein World-File, ein KMZ.", team: "Die Mitglieder des Teams und ihre Rolle.",
      encryption: "Die Veranstaltung mit einer Passphrase des Teams verschlüsseln.",
      "course-new": "Eine neue Bahn (auch: das „+“ am Ende der Registerkarten).",
      "course-props": "Der Name, der Typ (normal oder Score), die Kategorien, die Steigung, die Länge, der Druckmaßstab, die Postenbeschreibungen, die Nummerierung, die erwarteten Teilnehmer.",
      "course-dup": "Eine Kopie der Bahn, um daraus eine andere abzuleiten.", "course-delete": "Die Bahn löschen; ihre Posten bleiben in „Alle Posten“.",
      "course-order": "Die Reihenfolge der Registerkarten und Listen.", "var-fork": "Eine Gabelung ab dem gewählten Posten: Zweige, die weiter hinten wieder zusammenkommen.",
      "var-loop": "Schlaufen ab dem gewählten Posten (ein „Schmetterling“).", "var-delete": "Die Gabelung oder die Schlaufen löschen, die vom gewählten Posten ausgehen.",
      relay: "Für eine Staffel: welche Variante jeder Läufer jedes Teams läuft.", "print-area": "Der gedruckte Teil der Karte, Format und Ausrichtung des Blattes.",
      "part-options": "Für eine Bahn in mehreren Teilen: das Ziel auf dem gewählten Teil zeigen oder nicht.",
      "rep-summary": "Für jede Bahn: Länge, Steigung, Zahl der Posten.", "rep-legs": "Die Länge jeder Teilstrecke jeder Bahn.",
      "rep-cross": "Welche Bahnen zu welchem Posten kommen.", "rep-load": "Die Zahl der erwarteten Teilnehmer an jedem Posten und auf jeder Teilstrecke.",
      "rep-audit": "Die Prüfungen: zu nahe Posten, unvollständige Postenbeschreibungen, Codes, Teilstrecken, die ein Sperrgebiet queren … (Kapitel „Prüfen“).",
      "rep-climb": "Die Steigung jeder Bahn, nach dem Geländemodell des IGN.", "rep-times": "Die erwartete Siegerzeit jeder Bahn und die Länge für eine angestrebte Zeit.",
      "rep-pickup": "Wann und in welcher Reihenfolge die Posten eingesammelt werden.", tour: "Der schnellste Weg über alle gewählten Posten (standardmäßig alle): für den Bahnkontrolleur und zum Setzen oder Einsammeln der Posten.", "rep-after": "Nach dem Lauf: Zeiten, Fehler und gewählte Routen auf jeder Teilstrecke.",
      comments: "Die Kommentare des Teams, an die Karte geheftet.", field: "Auf dem Handy: die Karte mit deiner GPS-Position, um die Posten zu setzen und zu prüfen.",
      "view-course": "Die ganze Bahn einpassen.", "view-map": "Die ganze Karte einpassen.", "view-all": "Die Posten der anderen Bahnen blass zeigen, um sie zu übernehmen.",
      "view-printarea": "Den Rahmen des Druckbereichs zeigen.", "view-others": "Andere Bahnen blassblau unter der aktuellen zeigen.",
      "import-course": "Die auf einer Karte (einem PDF, einem Foto) gedruckten Kreise, Start und Ziel lesen und daraus Posten machen.",
      "save-to": "Wenn ein Befehl mehrere Dateien erzeugt: sie in einen gewählten Ordner schreiben oder in eine einzige .zip-Datei.",
    };
    // the editor's screen, drawn: its zones numbered as in the list under it
    const screenFig = () => {
      const P = "#a7179b", ink2 = "var(--ink-2)", line = "var(--border-strong)";
      const mark = (n, x, y) => `<g><circle cx="${x}" cy="${y}" r="11" fill="${P}"/><text x="${x}" y="${y + 4}" text-anchor="middle" font-size="12" font-weight="700" style="fill:#fff">${n}</text></g>`;
      const icon = (k, x, y, s = 0.72, c = ink2) => `<g transform="translate(${x} ${y}) scale(${s})" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${TR.ICON[k]}</g>`;
      const txt = (x, y, t, o = "") => `<text x="${x}" y="${y}" font-size="11" ${o}>${t}</text>`;
      // the tabs of the ribbon, the contextual one at the end
      let tx = 66;
      const tabs = ["Bahnlegung", "Bahnen", "Karte", "Prüfen", "Drucken", "Team und Lauf"].map((l, i) => {
        const w = l.length * 6.4 + 18 + (l === "Prüfen" ? 16 : 0), x = tx; tx += w;
        return `${txt(x + 8, 53, l, `style="fill:${i ? "var(--ink-2)" : "var(--ink)"}" ${i ? "" : 'font-weight="700"'}`)}${i ? "" : `<line x1="${x + 4}" y1="61" x2="${x + w - 6}" y2="61" stroke="${P}" stroke-width="2.5"/>`}${l === "Prüfen" ? `<circle cx="${x + w - 12}" cy="49" r="7" fill="var(--amber)"/><text x="${x + w - 12}" y="52.5" text-anchor="middle" font-size="9.5" font-weight="700" style="fill:#1b1a17">2</text>` : ""}`;
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
      const rows = [["", "", "Start: Kuppe"], ["1", "31", "Stein, Nordseite"], ["2", "45", "Senke"], ["3", "52", "Weg, Kreuzung"], ["4", "38", "Lichtung"]];
      const sheet = rows.map(([n, c, t], i) => `${i === 3 ? `<rect x="12" y="${182 + i * 20}" width="210" height="20" fill="#fff59d"/>` : ""}<text x="22" y="${196 + i * 20}" font-size="11" font-weight="700" style="fill:${i === 3 ? "#111" : "var(--ink)"}">${n}</text><text x="38" y="${196 + i * 20}" font-size="10.5" style="fill:${i === 3 ? "#111" : "var(--ink)"}">${c}</text><text x="64" y="${196 + i * 20}" font-size="10.5" style="fill:${i === 3 ? "#333" : "var(--ink-2)"}">${t}</text><line x1="12" y1="${202 + i * 20}" x2="222" y2="${202 + i * 20}" stroke="${line}"/>`).join("");
      return `<svg viewBox="0 0 760 486" role="img" aria-label="Der Bildschirm der Bahnlegung, seine Bereiche nummeriert">
        <rect x="0.5" y="0.5" width="759" height="485" rx="9" fill="var(--surface)" stroke="${line}"/>
        <rect x="8" y="7" width="120" height="22" rx="5" fill="var(--surface-2)" stroke="${line}"/>${icon("folder", 13, 11, 0.55)}${txt(32, 22, "Veranstaltungen", 'style="fill:var(--ink)"')}
        <text x="136" y="23" font-size="12.5" font-weight="700" style="fill:var(--ink)">Training</text>
        <rect x="196" y="11" width="34" height="15" rx="7.5" fill="var(--flag)"/><text x="213" y="22" text-anchor="middle" font-size="8.5" font-weight="700" style="fill:#fff">BETA</text>
        <line x1="240" y1="10" x2="240" y2="27" stroke="${line}"/>${icon("undo", 248, 9, 0.62)}${icon("redo", 270, 9, 0.62)}${icon("printer", 292, 9, 0.62)}${icon("shield", 314, 9, 0.62)}${icon("pencil", 336, 9, 0.62)}<text x="358" y="22" font-size="8" style="fill:var(--ink-3)">▾</text>
        <rect x="470" y="7" width="176" height="22" rx="6" fill="var(--surface-2)" stroke="${line}"/>${icon("search", 476, 11, 0.55)}${txt(494, 22, "Befehl suchen", 'style="fill:var(--ink-3)"')}
        ${txt(656, 22, "Gespeichert", 'style="fill:var(--good)"')}${icon("ribbon", 712, 9, 0.62)}${icon("fit", 734, 9, 0.62)}
        <line x1="0" y1="35" x2="760" y2="35" stroke="${line}"/>
        <rect x="8" y="40" width="50" height="19" rx="5" fill="${P}"/><text x="33" y="53.5" text-anchor="middle" font-size="11" font-weight="700" style="fill:#fff">Datei</text>${tabs}
        <rect x="560" y="38" width="128" height="24" fill="color-mix(in srgb, ${P} 9%, var(--surface))"/><line x1="560" y1="38.5" x2="688" y2="38.5" stroke="${P}" stroke-width="3"/>
        <text x="566" y="53" font-size="7.5" font-weight="700" letter-spacing=".5" style="fill:${P}">WERKZEUGE</text><text x="644" y="53" font-size="11" font-weight="700" style="fill:var(--ink)">Posten</text>
        <line x1="0" y1="62" x2="760" y2="62" stroke="${line}"/>
        ${big("select", 12, "Auswahl", true)}${gt(36, "Auswahl")}${sep(66)}
        ${big("control", 74, "Posten")}${big("start", 126, "Start")}${big("finish", 178, "Ziel")}
        ${small("crossing", 236, 84, "Pflichtdurchgang")}${small("issue", 236, 103, "Kartenausgabe")}${small("exchange", 236, 122, "Kartenwechsel")}${gt(240, "Posten")}${sep(346)}
        ${small("bend", 354, 84, "Knick")}${small("gap", 354, 103, "Lücke")}${small("route", 354, 122, "Route")}${gt(395, "Teilstrecken")}${sep(444)}
        ${cells}<rect x="552" y="70" width="10" height="48" rx="2" fill="var(--surface-2)" stroke="${line}"/><text x="557" y="97" text-anchor="middle" font-size="8" style="fill:var(--ink-3)">▾</text>${gt(505, "Sonderobjekte")}${sep(572)}
        ${big("descr", 580, "Auf der Karte")}${txt(640, 86, "Norm", 'style="fill:var(--ink-2)"')}<rect x="676" y="76" width="70" height="15" rx="3" fill="var(--plane)" stroke="${line}"/>${txt(681, 87, "IOF 2018 ▾", 'font-size="9.5" style="fill:var(--ink)"')}
        ${txt(640, 108, "Spr.", 'style="fill:var(--ink-2)"')}<rect x="676" y="98" width="70" height="15" rx="3" fill="var(--plane)" stroke="${line}"/>${txt(681, 109, "Deutsch ▾", 'font-size="9.5" style="fill:var(--ink)"')}${gt(664, "Postenbeschreibung")}
        ${icon("launcher", 742, 131, 0.45)}
        <line x1="0" y1="148" x2="760" y2="148" stroke="${line}"/>
        <text x="12" y="165" font-size="12" style="fill:var(--ink-2)">Alle Posten</text><text x="118" y="165" font-size="12" font-weight="700" style="fill:var(--ink)">Bahn A</text>
        <line x1="114" y1="172" x2="176" y2="172" stroke="${P}" stroke-width="2.5"/><text x="190" y="165" font-size="12" style="fill:var(--ink-2)">Bahn B</text>${icon("plus", 252, 154, 0.55)}
        <line x1="0" y1="174" x2="760" y2="174" stroke="${line}"/>
        <rect x="12" y="180" width="210" height="124" fill="var(--surface)" stroke="var(--ink)"/>${sheet}
        <path d="M20 189.5l9 5-9 5z" fill="none" stroke="var(--ink)" stroke-width="1.3"/>
        <text x="14" y="330" font-size="12" font-weight="700" style="fill:var(--ink)">Bahn A</text>
        <text x="14" y="348" font-size="11" style="fill:var(--ink-2)">Länge 3,2 km · Steigung 85 m</text><text x="14" y="364" font-size="11" style="fill:var(--ink-2)">4 Posten · 1:10 000</text>
        <rect x="233" y="175" width="527" height="285" fill="var(--surface-2)"/>
        <path d="M250 230c60-30 120 10 170-20s110-40 150 10M260 280c70-20 120 30 200 0s120-30 180 20M300 450c40-60 120-50 170-20" fill="none" stroke="#c8865a" stroke-opacity=".55" stroke-width="1.4"/>
        <ellipse cx="520" cy="410" rx="60" ry="26" fill="#f6c46a" fill-opacity=".45"/>
        <g fill="none" stroke="${P}" stroke-width="2.2">${legs}${marks}</g>
        <line x1="232" y1="174" x2="232" y2="460" stroke="${line}" stroke-width="2"/>
        <g>${[0, 1, 2].map((i) => `<rect x="724" y="${184 + i * 26}" width="24" height="22" rx="5" fill="var(--surface)" stroke="${line}"/>`).join("")}${icon("plus", 727, 186, 0.6)}${icon("minus", 727, 212, 0.6)}${icon("fit", 727, 238, 0.6)}
          <line x1="736" y1="266" x2="736" y2="320" stroke="${P}" stroke-width="3" stroke-linecap="round"/><circle cx="736" cy="276" r="5" fill="${P}"/></g>
        <line x1="0" y1="460" x2="760" y2="460" stroke="${line}"/>
        <text x="12" y="477" font-size="11" style="fill:var(--ink-3)">Klicken, um ein Objekt auszuwählen; ein ausgewähltes Objekt ziehen, um es zu verschieben …</text><text x="748" y="477" text-anchor="end" font-size="11" style="fill:var(--ink-3)">1:10 000 · 140 %</text>
        ${mark(1, 384, 18)}${mark(2, 540, 50)}${mark(3, 346, 136)}${mark(4, 700, 50)}${mark(5, 292, 162)}${mark(6, 222, 186)}${mark(7, 420, 240)}${mark(8, 708, 196)}
      </svg>`;
    };
    const CH = {
      principe: () => html`
        <section class="mx-slide" id="tr-principe">
          <p class="mx-kicker">${K}</p>
          <h2>Bahnen im Browser legen</h2>
          <p class="mx-lead">Die Bahnlegung, die du im Reiter „Bahnlegung“ einer Veranstaltung in Orga öffnest, dient dazu, die Bahnen eines Laufs oder eines Trainings vorzubereiten, von der leeren Karte bis zu den gedruckten Karten:
            Posten setzen, Bahnen zusammenstellen, Postenbeschreibungen ausfüllen, prüfen, drucken, die Dateien für die Zeitmessung vorbereiten. Nichts zu installieren:
            Alles läuft im Browser, und die Veranstaltung wird auf der Website gespeichert.</p>
          <p>Sie übernimmt die Regeln der Bahnlegung und das Dateiformat von <a href="https://purple-pen.org/" target="_blank" rel="noopener">Purple Pen</a>,
            der freien Bahnlegungssoftware von Peter Golde, die viele Vereine kennen: Eine Veranstaltung wechselt von einem zum anderen, in beide Richtungen. Sie hat auch ihre
            eigene Datei, die Ozimut-Datei (.ozmt), die die ganze Veranstaltung samt Karte in einer einzigen Datei hält. Du musst Purple Pen nicht kennen, um sie zu
            nutzen: Diese Anleitung erklärt alles.</p>
          <div class="mx-callout"><b>Beta-Version.</b> Die Bahnlegung ist gerade erst entstanden und wurde noch wenig getestet: Probier sie aus und melde uns, was nicht
            funktioniert, über die Seite „Kontakt“ (das Menü unter deinem Namen). Für die Vorbereitung eines echten Wettkampfs wird sie noch nicht empfohlen; für Trainingskarten
            eignet sie sich sehr gut.</div>
          <h3>Die Schritte</h3>
          <div class="mx-steps" style="--c:#a7179b">
            <div class="mx-step"><b>Die Bahnlegung beginnen</b>In Orga, im Reiter „Bahnlegung“ der Veranstaltung: „Bahnlegung beginnen“ öffnet eine Bahnlegung, für den Wettkampf oder das Training vorbereitet und damit verbunden; es fehlt nur noch die Karte.</div>
            <div class="mx-step"><b>Die Posten setzen</b>Mit dem Werkzeug Posten, auf der Registerkarte „Alle Posten“ oder direkt in einer Bahn.</div>
            <div class="mx-step"><b>Die Bahnen zusammenstellen</b>Eine Registerkarte pro Bahn: Start, Posten der Reihe nach, Ziel.</div>
            <div class="mx-step"><b>Die Postenbeschreibungen ausfüllen</b>Im linken Bereich, Feld für Feld, als Symbole oder Text.</div>
            <div class="mx-step"><b>Prüfen</b>Längen, Steigung, zu nahe Posten, vergessene Postenbeschreibungen: die Registerkarte Prüfen.</div>
            <div class="mx-step"><b>Drucken und exportieren</b>Die PDFs der Karten und Postenbeschreibungen, die Dateien für die Zeitmessung.</div>
          </div>
          <h3>Die drei Möglichkeiten</h3>
          <p>Aus dem Reiter „Bahnlegung“ einer Veranstaltung öffnet sich die Seite „Bahnlegung“ direkt mit ihrer Bahnlegung. Anders geöffnet (über einen Link, eine Einladung), zeigt sie sofort den Bildschirm der Bahnlegung, leer, und darüber drei Möglichkeiten:</p>
          <ul class="mx-list">
            <li><b>Neue Veranstaltung</b>: die Bahnen eines Wettkampfs deines Vereins oder eines Trainings legen. Dafür brauchst du die Karte.</li>
            <li><b>Veranstaltung importieren</b>: eine anderswo vorbereitete Veranstaltung übernehmen, aus einem anderen Konto, einem anderen Verein aus Purple Pen oder aus OCAD. Dafür brauchst du eine
              Ozimut-Datei (.ozmt), die die Karte schon enthält, eine Purple-Pen-Datei (.ppen) und die Datei ihrer Karte oder die OCAD-Bahnendatei und die ihrer Karte.</li>
            <li><b>Veranstaltung öffnen</b>: eine von denen, die du angelegt hast oder zu deren Team du gehörst, aus der Liste.</li>
          </ul>
          <p>Auf diesem Bildschirm abgelegte Dateien wählen für dich: eine Karte allein beginnt eine neue Veranstaltung, eine .ozmt- oder .ppen-Datei oder eine OCAD-Datei mit Bahnen einen Import. Der Button
            „Veranstaltungen“ oben links und das Menü Datei (Neu, Öffnen, Importieren) bringen diese drei Möglichkeiten jederzeit zurück; Esc schließt sie. Ein Link, der eine Veranstaltung nennt, öffnet sie
            direkt.</p>
          <h3>Eine Veranstaltung anlegen</h3>
          <p>„Neue Veranstaltung“ fragt nach:</p>
          <ul class="mx-list">
            <li><b>Einem Wettkampf oder einem Training.</b> Ein Wettkampf wird aus der Liste der kommenden und der in den letzten 60 Tagen von deinem
              Verein (dem Verein deines letzten Laufs) organisierten Läufe gewählt: Nur seine Mitglieder können ihn anlegen. Ein Training kann jeder anlegen, mit einem Titel und einem Datum.</li>
            <li><b>Der Karte</b>, abgelegt oder ausgewählt: die OCAD- oder Mapper-Datei, ein PDF oder ein Bild (Kapitel „Die Karte“).</li>
            <li><b>Dem Kartenmaßstab</b> (aus der OCAD- oder Mapper-Datei gelesen) und ihrer <b>Norm</b>: Wald (ISOM 2017) oder Sprint (ISSprOM 2019), die die Größe
              der Kreise und Nummern festlegt.</li>
          </ul>
          <p>„Veranstaltung importieren“ fragt nach denselben Angaben (Wettkampf oder Training) und nach der Datei: Eine Ozimut-Datei (.ozmt) öffnet sich so, wie sie
            gespeichert wurde, mit ihrer Karte (eine früher als .ocnt gespeicherte Datei öffnet sich ebenso); eine Purple-Pen-Datei (.ppen)
            mit ihrer Karte; eine mit OCADs Bahnlegungsmodul vorbereitete OCAD-Datei mit ihrer Karte: der OCAD-Datei, die sie darunter zeigt
            und die das Fenster nennt (unnötig, wenn Karte und Bahnen in einer Datei sind). Ihre Posten, deren Postenbeschreibungen und ihre
            Bahnen werden übernommen, und eine Bahn, die zu ihrem Start zurückkehrt, bekommt dort ein Ziel; Gabelungen behalten nur ihren
            ersten Zweig (das Fenster sagt es), und ihre Logos (die Bilder ihres Layouts) werden an ihrer Stelle zu Bildern auf allen Bahnen: Ein Logo
            wird nie von der Karte entfernt, weder am Bildschirm noch in PDFs. Ist die angegebene Karte nicht die der Datei (zum Beispiel ein PDF statt der OCAD-Karte),
            richtest du die Posten anschließend mit zwei Klicks aus.</p>
          <div class="mx-grid">
            <div class="mx-box" style="--c:var(--s1)"><h3>Wer sie sieht</h3><p>Nur ihr Team: ihr Ersteller und die Personen, die ihr über einen Einladungslink beitreten, als Bahnleger,
              Kontrolleur oder Leser. Nicht die Administratoren der Website: Die Bahnen bleiben bis zum Lauf geheim.</p></div>
            <div class="mx-box" style="--c:var(--s3)"><h3>Automatisch gespeichert</h3><p>Wenige Sekunden nach jeder Änderung; alle
              30 Minuten Arbeit wird eine Version behalten, und du kannst eine unter einem Namen behalten (${W("version-save")}).</p></div>
            <div class="mx-box" style="--c:var(--s5)"><h3>Auf Wunsch verschlüsselt</h3><p>Mit einer Passphrase des Teams (${W("encryption")}) speichert der Server
              nur unlesbare Daten. Geht sie verloren, lässt sie sich nicht wiederfinden: Exportiere zuerst eine Ozimut-Datei (${W("export-ocn")}), die ihrerseits
              nicht verschlüsselt ist.</p></div>
          </div>
        </section>`,
      carte: () => html`
        <section class="mx-slide" id="tr-carte">
          <p class="mx-kicker">${K}</p>
          <h2>Die Karte</h2>
          <h3>Welche Datei du gibst</h3>
          <div class="mx-grid">
            <div class="mx-box" style="--c:var(--s1)"><h3>OCAD oder Mapper</h3><p>Die beste Wahl: die .ocd-Datei (OCAD 6 bis 12 und 2018) oder .omap / .xmap
              (OpenOrienteering Mapper). Die Karte wird Symbol für Symbol gezeichnet: scharf bei jedem Zoom, als Vektoren gedruckt, in den richtigen Abmessungen ohne
              Einstellung; ihr Maßstab, ihre Georeferenzierung und ihr Violett werden übernommen.</p></div>
            <div class="mx-box" style="--c:var(--s3)"><h3>PDF</h3><p>Aus OCAD oder Mapper exportiert, bleibt es im Druck scharf: Es wird unverändert in die PDFs der
              Bahnen übernommen. Seine Abmessungen sind die der Seite.</p></div>
            <div class="mx-box" style="--c:var(--s5)"><h3>Bild</h3><p>JPG, PNG, GIF, BMP, WebP oder TIFF, auch ein Scan oder ein wirklich flach aufgenommenes Foto. Seine
              Distanzen ergeben sich aus seiner <b>Auflösung</b>: Bei 300 Punkten pro Zoll sind 1 mm Karte 11,8 Punkte.</p></div>
          </div>
          <p>Die Auflösung eines Bildes wird aus der Datei gelesen, wenn sie sie angibt; sonst wirst du danach gefragt. Um sie zu prüfen, miss eine bekannte Distanz
            (${W("rep-legs")}); ${W("event-props")} korrigiert sie. Eine OCAD-Karte kann andere Dateien als Hintergrund einbinden
            („Vorlagen“, ein Luftbild): Sie werden nicht gezeichnet.</p>
          <p>Der Schieberegler unter den Zoomknöpfen (oder Karte › Ansicht › Intensität) hellt die Karte auf, damit die Bahn besser zu sehen ist. ${W("map-change")} setzt eine andere ein (eine korrigierte Fassung,
            einen besseren Scan, die OCAD-Datei statt eines Bildes): Die Posten behalten ihre Stelle auf dem Blatt, ihre Koordinaten (eine neue Fassung derselben
            OCAD-Datei), ihre Stelle im Gelände (zwei georeferenzierte Karten), oder sie werden danach mit zwei Klicks ausgerichtet.</p>
          <h3>Trainingskarten</h3>
          <p>${W("map-colors")} blendet Farben und Symbole einer OCAD- oder Mapper-Karte aus, für alle Bahnen oder für eine: eine Karte ohne Wege, ohne Vegetation, nur mit Gelände oder Höhenlinien, mit einem Klick. ${W("exercise")} blendet die Karte einer Bahn aus, bis auf einen Korridor entlang ihrer Teilstrecken und Fenster um ihre Posten, und folgt der Bahn, wenn sie sich ändert; die Logos der Karte bleiben sichtbar.</p>
          <h3>Das Violett der Bahn</h3>
          <p>Die Gruppe Karte › Violett legt fest, wie die Bahn auf der Karte liegt; jede Art wird dort im Kleinen gezeigt:</p>
          <ul class="mx-list">
            <li><b>Darüber</b>: Das Violett deckt die Karte ab.</li>
            <li><b>Gemischt</b>: Das Schwarz der Karte bleibt durch das Violett sichtbar, wie beim Überdruck.</li>
            <li><b>In Ebenen</b> (OCAD- oder Mapper-Karte): Die Kreise, die Linien und die Sperrgebiete liegen unter den Farben der Karte oberhalb einer gewählten
              Farbe, meist unter dem Schwarz der Wege und Felsen; die Nummern bleiben obenauf.</li>
          </ul>
          <p>Auf einer OCAD- oder Mapper-Karte ist das Violett standardmäßig das der Karte; du kannst ein anderes in CMYK angeben (Karte › Violett › Darstellung). Die „Überdruckeffekte“ (Karte › Violett › Überdruck) zeigen
            die Farben, die die Karte als „Überdruck“ markiert, gemischt, so wie sie gedruckt werden.</p>
          <h3>Posten mit zwei Klicks ausrichten</h3>
          <p>Wenn die Posten nicht an der richtigen Stelle liegen – eine .ppen-Datei, die auf einer anderen Karte erstellt wurde, ein leicht gedrehter Scan –, setzt ${W("calage")} sie zurück: Du klickst einen Posten an, dann die Stelle, an der er sein sollte, und das zweimal, mit zwei weit voneinander entfernten Posten. Die Bahnlegung
            leitet daraus die Verschiebung, die Drehung und den Maßstab ab. Ändert sich der Maßstab, bietet sie an, entweder die Karte (die Auflösung des Bildes oder den Maßstab des PDF) zu korrigieren,
            wobei die Bahnlängen richtig bleiben, oder die Posten. Eine .ppen-Datei, die auf einer OCAD-Karte erstellt und mit derselben OCAD-Karte importiert wurde, muss nicht ausgerichtet werden.</p>
          <h3>Die Georeferenzierung</h3>
          <p>Für die Steigung, den Geländemodus, die GPX-Dateien und die Analyse muss bekannt sein, wo die Karte auf der Erde liegt. Eine georeferenzierte OCAD- oder Mapper-Karte
            (Lambert 93, UTM, die Systeme von OCAD) und ein georeferenziertes TIFF sind es von selbst. Sonst ${W("georef")}: zwei Punkte der
            Karte (eine Wegkreuzung, eine Gebäudeecke), angeklickt mit ihrer Breite und Länge – ein Rechtsklick auf Géoportail oder einer Online-Karte liefert
            sie –, oder drei und mehr für ein verzerrtes Foto; oder ein World-File (.jgw, .pgw… mit seiner .prj); oder ein KMZ desselben Bildes. Das Fenster
            prüft den erhaltenen Maßstab gegen den der Karte.</p>
        </section>`,
      ecran: () => html`
        <section class="mx-slide" id="tr-ecran">
          <p class="mx-kicker">${K}</p>
          <h2>Der Bildschirm</h2>
          <figure class="mx-fig">${raw(screenFig())}</figure>
          <div class="mx-steps" style="--c:#a7179b">
            <div class="mx-step"><b>Die obere Leiste</b>„Veranstaltungen“ bringt die drei Möglichkeiten zurück (eine andere Veranstaltung öffnen, eine erstellen oder importieren); der Titel;
              die Schnellzugriffsleiste: Rückgängig, Wiederholen, das PDF der aktuellen Bahn, die Veranstaltungsprüfung, die Eigenschaften der Bahn. Rechts die Befehlssuche, der Speicherstatus, ▭ (die Anzeige des
              Menübands), ⤢ (ganzes Fenster) und ↗ (ein eigener Tab).</div>
            <div class="mx-step"><b>Die Registerkarten des Menübands</b>Datei, dann eine Registerkarte je Arbeitsschritt: Bahnlegung, Bahnen, Karte, Prüfen, Drucken, Team und
              Lauf. Eine Zahl auf Prüfen: die gefundenen Probleme; auf Team und Lauf: die noch offenen Kommentare.</div>
            <div class="mx-step"><b>Das Menüband</b>Die Befehle der Registerkarte, in Gruppen: große Knöpfe für die häufigsten, kleine zu dritt gestapelt,
              Einstellungen direkt vor Ort, und ↘ in der Ecke einer Gruppe für ihr vollständiges Fenster.</div>
            <div class="mx-step"><b>Die Registerkarte des gewählten Objekts</b>Ein Posten, eine Teilstrecke, ein gewähltes Objekt oder eine Linie, die gerade gezeichnet wird, hat seine eigene
              Registerkarte, in Violett, mit allem, was dafür gilt.</div>
            <div class="mx-step"><b>Die Bahnen</b>„Alle Posten“, dann eine Registerkarte je Bahn, und „+“, um eine zu erstellen.</div>
            <div class="mx-step"><b>Die Postenbeschreibungen</b>Die der aktuellen Bahn, per Klick auszufüllen (Kapitel „Die Postenbeschreibungen“); darunter die aktuelle
              Bahn, wenn nichts gewählt ist.</div>
            <div class="mx-step"><b>Die Karte</b>Wo du die Objekte platzierst und verschiebst. Das Ziehen der Trennlinie links verbreitert den Bereich.</div>
            <div class="mx-step"><b>Der Zoom und die Hilfezeile</b>Vergrößern, Verkleinern, die ganze Bahn und der Schieberegler, der die Karte aufhellt; unten, was
              das aktuelle Werkzeug tut, der Maßstab und der Zoom.</div>
          </div>
          <h3>Das Menüband</h3>
          <p>Die Registerkarten folgen der Arbeit: <b>Bahnlegung</b>, um die Posten und Objekte zu platzieren, <b>Bahnen</b>, um die Bahnen, ihre Varianten und ihren
            Druck zusammenzustellen, <b>Karte</b> für die Karte selbst (sie wechseln, ausrichten, georeferenzieren, die Art, wie das Violett darauf liegt), <b>Prüfen</b>, <b>Drucken</b>
            (die PDFs und alle zu exportierenden Dateien), <b>Team und Lauf</b> (das Team, das Gelände, die Zeit nach dem Lauf). Die Seite <b>Datei</b> versammelt, was
            selten gebraucht wird: die Angaben zur Veranstaltung, Neu, Öffnen, Importieren, Speichern und die Versionen, jede zu exportierende Datei mit ihrem Zweck,
            Teilen, Offline und die Optionen.</p>
          <p>Ein ausgegrauter Knopf sagt in seinem Tooltip, warum („Wähle zuerst eine Bahn“, „ab dem Lauftag“…): Du stößt nie auf einen Befehl, der sich
            verweigert. Der Tooltip jedes Knopfs sagt auch, was er tut, und seine Taste; F1 öffnet die Anleitung bei seinem Kapitel.
            Manche Einstellungen werden direkt im Menüband vorgenommen, mit sofortiger Wirkung: der Druckmaßstab, die Norm und die Sprache der Postenbeschreibungen, die Größe der
            Kreise, Linien und Nummern, die Art, wie das Violett auf der Karte liegt, und die Markierung einer Teilstrecke, jeweils im Kleinen gezeigt.</p>
          <h3>Die Registerkarte des gewählten Objekts</h3>
          <p>Einen Posten zu wählen, holt die Registerkarte <b>Posten</b>: sein Code, seine Beschreibung, eine Gabelung oder Schlaufen ab ihm, eine Textzeile vor oder
            nach ihm, seinen Kreis unterbrechen, den Kartenwechsel, und was man über ihn weiß (seine Bahnen, seine Belastung, die Länge bis zum nächsten). Eine Teilstrecke hat die Registerkarte
            <b>Teilstrecke</b> (Knick, Lücke, Route, Markierung), ein Sonderobjekt die Registerkarte <b>Objekt</b> (Darstellung, Bahnen, Eckpunkte), und eine Linie oder Fläche,
            die gerade gezeichnet wird, die Registerkarte <b>Zeichnen</b>, mit „Beenden“ und „Abbrechen“. Aus der Registerkarte Bahnlegung gewählt, öffnet das Objekt seine Registerkarte
            von selbst; aus einer anderen Registerkarte erscheint seine Registerkarte und blinkt, ohne die zu verdrängen, in der du arbeitest. Befehle, die eine Stelle brauchen
            („Knick hinzufügen“, „Kreis unterbrechen“), verlangen danach einen Klick auf die Karte; Esc bricht ab.</p>
          <h3>Die Schnellzugriffsleiste</h3>
          <p>Neben dem Titel hält sie, gleich welche Registerkarte offen ist, die am häufigsten gebrauchten Befehle einen Klick entfernt: Rückgängig, Wiederholen, das PDF der
            aktuellen Bahn (um einen Probedruck mit den letzten Einstellungen zu machen), die Veranstaltungsprüfung und die Eigenschaften der Bahn. Ihr ▾ fügt
            weitere hinzu oder entfernt sie (Speichern, das PDF aller Bahnen, den Druckbereich, IOF XML, die Versionen, die Kommentare, den
            Geländemodus…); ein Rechtsklick auf einen beliebigen Knopf des Menübands fügt ihn hinzu, ein Rechtsklick in der Leiste entfernt ihn. Sie wird in diesem Browser gespeichert.</p>
          <h3>Einen Befehl finden</h3>
          <p>Die <b>Suche</b> oben (Alt + Q) findet einen Befehl über ein Wort seines Namens oder dessen, was er tut („Gabelung“, „gpx“, „ausrichten“, „Maßstab“), und
            sagt, wo er ist; Eingabe führt ihn aus und lässt seinen Knopf blinken, damit du ihn beim nächsten Mal wiederfindest. <b>Alt</b> allein lässt auf jeder
            Registerkarte einen Buchstaben erscheinen, dann, sobald die Registerkarte gewählt ist, auf jedem Knopf: Zwei Tasten führen jeden Befehl ohne Maus aus.</p>
          <h3>Mehr Platz für die Karte</h3>
          <p>Der Knopf ▭ oben rechts stellt das Menüband auf <b>eine einzige Zeile</b> kleiner Knöpfe oder behält nur <b>seine Registerkarten</b> (Strg + F1): Es öffnet sich
            dann beim Klick auf eine Registerkarte über der Karte und schließt sich nach dem Befehl wieder. Ohne deine Wahl ist es <b>automatisch</b>: vollständig, auf einer einzigen Zeile,
            wenn das Fenster weniger als 800 Pixel hoch ist (ein Laptop-Bildschirm), und auf seine Registerkarten reduziert im ganzen Fenster (⤢), wo die Karte den ganzen
            Platz einnimmt; Datei › Optionen regelt beide Fälle. Ist das Fenster schmal, klappen sich die Gruppen von selbst ein, von rechts beginnend, jede zu einem
            Knopf, der sie öffnet.</p>
          <h3>Sich auf der Karte bewegen</h3>
          <p>Das Mausrad zoomt um den Mauszeiger herum; Ziehen, wo nichts ist (oder Ziehen mit gedrückter rechter Maustaste), verschiebt die Karte; die Pfeiltasten ebenso. Karte › Ansicht › Ganze
            Bahn und Ganze Karte passen den Ausschnitt an. Weit in eine OCAD-, Mapper- oder PDF-Karte hineinzuzoomen, zeichnet sie scharf neu.</p>
          <h3>Wählen, verschieben, löschen</h3>
          <p>Mit dem Werkzeug Auswahl wählt ein Klick einen Posten, eine Teilstrecke, eine Nummer oder ein Objekt; es wird blau hervorgehoben, seine Beschreibungszeile gelb.
            Ein gewähltes Objekt zu ziehen, verschiebt es. Ein gewähltes Objekt zeigt seine <b>Griffe</b>: die Knicke einer Teilstrecke, die Ränder ihrer Lücken, die Eckpunkte einer
            Fläche, die Ecke der Postenbeschreibungen; sie lassen sich ziehen. Entf löscht das Objekt; in einer Bahn wird ein Posten nur aus der Bahn entfernt und bleibt in
            „Alle Posten“.</p>
          <h3>Der Rechtsklick</h3>
          <p>Der Rechtsklick auf die Karte öffnet das Menü des Objekts unter der Maus, mit genau den Befehlen seiner Registerkarte, Gruppe für Gruppe, formuliert für
            die angeklickte Stelle: für einen Posten seine Beschreibung, eine Gabelung oder Schlaufen, ein Kartenwechsel, eine Textzeile, seinen Kreis hier unterbrechen, ihn entfernen;
            für eine Teilstrecke ein Knick oder eine Lücke hier, diesen Knick entfernen, die Route, die Markierung; für ein Objekt seine Darstellung, ein Eckpunkt hier oder dieser
            Eckpunkt, die Bahnen, auf denen es erscheint. Auf einem Knopf des Menübands fügt der Rechtsklick ihn der Schnellzugriffsleiste hinzu.</p>
          <h3>Die Tastatur</h3>
          <div class="table-wrap"><table class="data compact tr-doc-tools"><thead><tr><th>Taste</th><th>Wirkung</th></tr></thead><tbody>
            ${KEYS.map(([k, v]) => html`<tr><td style="white-space:nowrap"><b>${k}</b></td><td>${v}</td></tr>`)}</tbody></table></div>
          <p>Nur ein Teammitglied bearbeitet zur gleichen Zeit: Die anderen sehen die Veranstaltung schreibgeschützt, mit einem Knopf „Übernehmen“.</p>
        </section>`,
      postes: () => html`
        <section class="mx-slide" id="tr-postes">
          <p class="mx-kicker">${K}</p>
          <h2>Die Werkzeuge und die Posten</h2>
          <div class="table-wrap"><table class="data compact tr-doc-tools"><thead><tr><th></th><th>Werkzeug</th><th>Taste</th><th>Was es tut</th></tr></thead><tbody>
            ${TOOLS.map(([k, n, key, v]) => html`<tr><td class="tr-doc-ico">${ic(k, 20)}</td><td style="white-space:nowrap"><b>${n}</b></td><td>${key}</td><td>${v}</td></tr>`)}
          </tbody></table></div>
          <h3>„Alle Posten“ und die Bahnen</h3>
          <p>Die Registerkarte <b>Alle Posten</b> versammelt alle Posten der Veranstaltung mit ihren Codes. Ein dort platzierter Posten gehört noch zu keiner Bahn. Ein
            in einer Bahn platzierter Posten kommt auch in sie. Derselbe Posten dient mehreren Bahnen: In einer Bahn werden die Posten der anderen Bahnen blass angezeigt,
            wenn das Werkzeug Posten aktiv ist (oder immer, mit ${W("view-all")}); ein Klick auf einen von ihnen fügt ihn der Bahn hinzu.</p>
          <h3>Wohin ein neuer Posten kommt</h3>
          <p>In einer Bahn kommt ein platzierter Posten:</p>
          <ul class="mx-list">
            <li>direkt <b>nach dem gewählten Posten</b>, wenn einer gewählt ist;</li>
            <li>in die <b>gewählte Teilstrecke</b>, wenn eine gewählt ist;</li>
            <li>sonst in die <b>nächstgelegene Teilstrecke</b> zur angeklickten Stelle.</li>
          </ul>
          <p>Um einen Posten am Ende der Bahn hinzuzufügen, wähle den letzten Posten und platziere dann den neuen. Um einen zwischen 3 und 4 einzufügen, wähle
            die Teilstrecke 3–4 oder klicke einfach in ihre Nähe. Start und Ziel kommen immer an den Anfang und ans Ende.</p>
          <h3>Codes und Nummern</h3>
          <p>Jeder Posten erhält einen <b>Code</b> (31, 32…, festgelegt durch ${W("numbering")}, das standardmäßig Codes vermeidet, die sich verkehrt herum lesen lassen); das
            Feld Code der Registerkarte Posten ändert ihn. In einer Bahn platziert sich die <b>Postennummer</b> von selbst neben dem Kreis, ohne die Linien zu stören; zieh sie, um
            sie anderswo hinzusetzen, und leg sie auf ihren Kreis, damit sie sich wieder von selbst platziert. Die Eigenschaften der Bahn zeigen stattdessen den Code oder beides.</p>
          <h3>Einen Posten verschieben</h3>
          <p>Zieh ihn mit dem Werkzeug Auswahl: Seine Teilstrecken folgen in allen Bahnen. Wird ein Posten, den auch andere Bahnen nutzen, um mehr als 75 m verschoben, wird
            gefragt, ob er überall verschoben oder für diese Bahn ein neuer erstellt werden soll. Umschalt beim Ziehen setzt ihn genau auf einen benachbarten Posten.</p>
        </section>`,
      circuits: () => html`
        <section class="mx-slide" id="tr-circuits">
          <p class="mx-kicker">${K}</p>
          <h2>Die Bahnen</h2>
          <p>Das „+“ am Ende der Registerkarten (oder ${W("course-new")}) erstellt eine Bahn. Ihre <b>Eigenschaften</b> (${W("course-props")}, oder ein Klick auf
            den Kopf der Postenbeschreibungen):</p>
          <ul class="mx-list">
            <li><b>Name</b> und <b>Kategorien</b>, die oben auf den Postenbeschreibungen gedruckt werden;</li>
            <li><b>Typ</b>: normal (die Posten in der Reihenfolge) oder <b>Score</b> (die Posten in beliebiger Reihenfolge, jeder mit seinen Punkten);</li>
            <li><b>Steigung</b> und <b>Länge</b>: Die Länge wird berechnet (entlang der Knicke), die Steigung kommt aus ${W("rep-climb")} oder wird eingetippt;</li>
            <li><b>Druckmaßstab</b>: Eine Karte im Maßstab 1:10 000 kann für die Jüngeren in 1:7 500 gedruckt werden; Kreise und Nummern nehmen dann die Größe an, die die Norm vorsieht (Karte › Symbole); er lässt sich auch unter Bahnen › Druck › Maßstab ändern;</li>
            <li><b>Postenbeschreibungen</b> in Symbolen, in Text oder beides, und die <b>Beschriftung</b> der Posten: Postennummer, Code oder beides;</li>
            <li>die <b>erwarteten Teilnehmer</b>, für die Belastung der Posten.</li>
          </ul>
          <p>${W("course-dup")} kopiert eine Bahn, um eine andere daraus abzuleiten; ${W("course-order")} ordnet die Registerkarten. Eine Bahn zu löschen, lässt ihre Posten in
            „Alle Posten“ (${W("remove-unused")} entfernt sie).</p>
          <h3>Die Teilstrecken</h3>
          <ul class="mx-list">
            <li>Ein <b>Knick</b> (Werkzeug Knick) biegt eine Teilstrecke, um ein Sperrgebiet zu umgehen; die Länge folgt der Linie.</li>
            <li>Eine <b>Lücke</b> (Werkzeug Lücke, durch Ziehen) unterbricht eine Linie oder einen Kreis, damit ein Detail der Karte lesbar bleibt. Die Bahnlegung unterbricht
              eine Linie auch von selbst dort, wo sie eine andere Teilstrecke der Bahn kreuzt (Karte › Violett › Darstellung regelt diese Lücke).</li>
            <li>Die <b>Markierung</b> (die Registerkarte Teilstrecke, die jede Art im Kleinen zeigt, oder der Rechtsklick): die ganze Teilstrecke, ihr Anfang oder ihr Ende markiert, gestrichelt
              gezeichnet.</li>
            <li>Ein <b>Pflichtdurchgang</b> (Werkzeug Pflichtdurchgang) markiert eine Lücke oder eine Brücke, durch die der Läufer muss.</li>
          </ul>
          <h3>Die Varianten: Gabelungen und Schlaufen</h3>
          <p>Bei einer Staffel oder einem Massenstart laufen die Läufer derselben Bahn nicht alle dieselben Posten. Wähle den Posten, an dem die Varianten beginnen,
            dann in seiner Registerkarte Posten Gabelung hier (Zweige, die sich weiter vorne wieder treffen) oder Schlaufen hier (Schlaufen, die zum selben Posten zurückkehren), mit
            der Anzahl der Zweige. Über der Karte erscheint eine Auswahl: Wähle einen Zweig und platziere seine Posten wie gewohnt. Die Länge der
            Bahn wird dann von der kürzesten bis zur längsten Variante angezeigt. ${W("relay")} verteilt die Varianten auf die Teams und ihre
            Läufer, so dass jedes Team über alle seine Läufer hinweg alle Zweige läuft; die PDFs werden je Team und je Läufer gedruckt.</p>
          <h3>Mehrere Teile</h3>
          <p>Ein <b>Kartenwechsel</b> (Werkzeug Kartenwechsel auf einem Posten der Bahn) teilt die Bahn in Teile: Eine Teileauswahl erscheint, und jeder
            Teil hat seinen Druckbereich und wird auf ein eigenes Blatt gedruckt. ${W("part-options")} zeigt das Ziel auf einem Teil an oder nicht.</p>
          <h3>Der Druckbereich</h3>
          <p>${W("print-area")} wählt das Papier (A4, A3…), die Ausrichtung, die Ränder und den zu druckenden Teil der Karte; Papier und Ausrichtung lassen sich auch
            mit einem Klick unter Bahnen › Druck › Papier ändern („je nach Bahn“ dreht das Blatt in die Richtung der Bahn). Der Bereich platziert sich von selbst, zentriert auf der
            Bahn, oder folgt einem auf der Karte aufgezogenen Rahmen. Ein Bereich, der größer ist als das Blatt, wird auf mehrere sich leicht überlappende Seiten aufgeteilt oder auf seine
            Mitte reduziert. ${W("view-printarea")} zeigt ihn gepunktet an.</p>
        </section>`,
      definitions: () => html`
        <section class="mx-slide" id="tr-definitions">
          <p class="mx-kicker">${K}</p>
          <h2>Die Postenbeschreibungen</h2>
          <p>Der linke Bereich zeigt die Postenbeschreibungen der aktuellen Bahn so, wie sie gedruckt werden. Sie folgen der IOF-Norm (standardmäßig 2018/2024, 2004
            möglich: Bahnlegung › Postenbeschreibung › Norm): eine Zeile je Posten, mit ihren Spalten C bis H – welches Objekt, welches von mehreren, seine Beschaffenheit, seine Größe, die Lage des Postens.</p>
          <ul class="mx-list">
            <li>Ein <b>Klick auf eine Zeile</b> wählt den Posten, und die Karte zentriert sich auf ihn.</li>
            <li>Ein <b>zweiter Klick auf ein Feld</b> öffnet die Symbole dieser Spalte; tippe ein paar Buchstaben, um zu filtern („gra“ ergibt „Graben“). Die Spalte F
              nimmt auch die Größe des Objekts an („2 m“, „3 × 4“).</li>
            <li><b>Mit der Tastatur</b>, sobald das Blatt gewählt ist: ↑ ↓ wechseln die Zeile, ← → das Feld, Eingabe oder ein Buchstabe öffnet die Symbole, Entf leert das Feld.</li>
            <li>Ein Klick auf das Feld des <b>Codes</b> ändert ihn; auf den <b>Titel</b> ändert er den Titel der Veranstaltung; auf den <b>Kopf</b> (Länge, Steigung)
              öffnet er die Eigenschaften der Bahn.</li>
            <li>Die Zeile des <b>Ziels</b> (und die der Pflichtdurchgänge und der Kartenausgabe) gibt die Markierung bis zum Ziel an: Ein Klick wählt ihre Form.</li>
            <li>Eine <b>Textzeile</b> vor oder nach einem Posten (die Registerkarte Posten › Postenbeschreibung, oder der Rechtsklick auf den Posten) fügt eine Anweisung hinzu („Durch das Dorf“).</li>
          </ul>
          <p>Die Postenbeschreibungen werden in Symbolen, in Text oder in beidem gedruckt (die Eigenschaften der Bahn). Der Text wird in der gewählten Sprache gesetzt (Bahnlegung ›
            Postenbeschreibung › Sprache), unter 23 Sprachen; ${W("custom-text")} ändert den Text eines Symbols. Um sie auf die Karte zu setzen, dient das Werkzeug Postenbeschreibung auf der
            Karte: Zieh einen Rahmen auf, seine Breite legt die Größe fest; die Ecke unten rechts ändert die Größe, ein Rechtsklick verteilt sie auf mehrere Spalten.
            ${W("pdf-descriptions")} druckt sie allein, mehrere pro Seite, zum Ausschneiden für die Beschreibungshalter.</p>
        </section>`,
      speciaux: () => html`
        <section class="mx-slide" id="tr-speciaux">
          <p class="mx-kicker">${K}</p>
          <h2>Die Sonderobjekte</h2>
          <p>Die häufigsten sind in der Galerie unter Bahnlegung › Sonderobjekte; ▾ oder ↘ ${ic("special", 16)} öffnet die vollständige Liste. Jedes wird auf seine Art platziert:</p>
          <div class="mx-grid">
            <div class="mx-box" style="--c:var(--s1)"><h3>${ic("water", 18)} Punkte</h3><p>Getränkeposten, Sanitätsposten, optionaler Durchgang,
              verbotene Route, Passermarke: ein Klick an der gewünschten Stelle.</p></div>
            <div class="mx-box" style="--c:var(--s3)"><h3>${ic("oob", 18)} Linien und Flächen</h3><p>Unpassierbare Grenze, Linie, Sperrgebiet, gefährliches
              Gebiet, temporäre Konstruktion, weiße Abdeckung: ein Klick je Eckpunkt, dann ein Doppelklick (oder Eingabe) zum Beenden. Eine Fläche schließt sich von selbst.</p></div>
            <div class="mx-box" style="--c:var(--s5)"><h3>${ic("text", 18)} Rahmen</h3><p>Text, Bild, Rechteck, Ellipse: einen Rahmen auf der Karte aufziehen, dann
              den Text angeben (Schrift, Größe, Farbe), das Bild wählen oder die Darstellung der Linie.</p></div>
          </div>
          <p>Ein Objekt erscheint auf allen Bahnen oder nur auf den gewählten (die Registerkarte Objekt › Bahnen, oder der Rechtsklick). Seine Eckpunkte lassen sich
            ziehen; die Registerkarte Objekt (oder der Rechtsklick) fügt einen Eckpunkt hinzu oder entfernt ihn. Die <b>weiße Abdeckung</b> löscht ein Stück Karte unter der Bahn (eine
            veraltete Legende, ein zu verbergendes Detail). Ein Sperrgebiet, das eine Teilstrecke durchquert, meldet die Veranstaltungsprüfung.</p>
        </section>`,
      sorties: () => html`
        <section class="mx-slide" id="tr-sorties">
          <p class="mx-kicker">${K}</p>
          <h2>Drucken und exportieren</h2>
          <h3>Die Bahnkarten</h3>
          <p>${W("pdf-courses")}: Hake die Bahnen an (und „Alle Posten“, für den Kontrolleur), dann wähle:</p>
          <ul class="mx-list">
            <li>ein einziges PDF mit einer Seite je Bahn, oder ein PDF je Bahn, oder je Teil;</li>
            <li>bei Varianten jede einzeln, alle zusammen oder je Team und Läufer;</li>
            <li>die Karte und die Bahn oder die <b>Bahn allein</b>, für einen Überdruck auf bereits gedruckte Karten;</li>
            <li>die Farben in CMYK (für eine Druckerei) oder in RGB.</li>
          </ul>
          <p>Der Knopf ${ic("printer", 14)} des Schnellzugriffs oben liefert das PDF der aktuellen Bahn mit den letzten Einstellungen. Jede Bahn wird in ihrem Druckmaßstab auf ihrem Druckbereich gedruckt. <b>Drucke das PDF in Originalgröße</b> (ohne „an Seite anpassen“),
            sonst stimmt der Maßstab nicht: Miss eine bekannte Länge auf dem ersten Blatt.</p>
          <h3>Die anderen Dateien</h3>
          <div class="mx-grid">
            <div class="mx-box" style="--c:var(--s1)"><h3>${ic("stopwatch", 18)} Zeitmessung</h3><p>IOF XML 3.0 (oder 2.0.3 für ältere Programme): die
              Bahnen, die Reihenfolge der Posten, die Längen, die Staffelteams. Vor dem Lauf in die Zeitmessungssoftware zu importieren.</p></div>
            <div class="mx-box" style="--c:var(--s2)"><h3>${ic("descr", 18)} Postenbeschreibungen, Kontrollkarten</h3><p>Das PDF der Postenbeschreibungen allein und die
              Kontrollkarten mit einem Feld je Posten (${W("punch")} zeichnet das Stanzmuster jedes Postens).</p></div>
            <div class="mx-box" style="--c:var(--s3)"><h3>${ic("globe", 18)} GPS und Online-Karten</h3><p>GPX der Posten, KML der Bahnen, Bilder der
              Bahnen (PNG, JPEG, GIF) mit ihrem World-File, RouteGadget-Dateien: Dafür braucht es eine georeferenzierte Karte.</p></div>
            <div class="mx-box" style="--c:var(--s4)"><h3>${ic("layers", 18)} OCAD und Mapper</h3><p>Jede Bahn als OCAD-Karte (9 bis 12, 2018) oder Mapper-Karte, in
              Bahnsymbolen, mit der Karte der Veranstaltung als Hintergrund: um die Bahn mit diesen Programmen fertigzustellen oder zu drucken.</p></div>
            <div class="mx-box" style="--c:var(--s5)"><h3>${ic("export", 18)} Ozimut und Purple Pen</h3><p>Die Ozimut-Datei (.ozmt) bewahrt die ganze Veranstaltung und, wenn du willst,
              ihre Karte in einer einzigen Datei: eine Kopie, ein Archiv, die Veranstaltung für einen anderen Verein; sie wird über „Veranstaltung importieren“ wieder geöffnet. Die
              .ppen-Datei öffnet sich in Purple Pen neben der Karte; sie bewahrt alles außer dem, was Purple Pen nicht kennt (zum Beispiel die Routen).</p></div>
            <div class="mx-box" style="--c:var(--s6)"><h3>${ic("table", 18)} Tabellen</h3><p>Die Berichte als CSV (Trennzeichen „;“), für eine Tabellenkalkulation.</p></div>
          </div>
          <p>Jedes Exportfenster kommt mit den Einstellungen zurück, die du beim letzten Mal in diesem Browser gewählt hast – das Format, die Auflösung, die Anzahl der Exemplare, die
            Größe der Felder, die Farben… –; nur die Bahnen sind neu anzuhaken. Erstellt ein Befehl mehrere Dateien, werden sie in einen gewählten Ordner (Chrome, Edge) oder in eine einzige .zip-Datei geschrieben; ${W("save-to")}
            ändert diese Wahl.</p>
          <h3>Die Darstellung</h3>
          <p>Karte › Symbole regelt die Größe der Kreise, die Stärke der Linien und die Höhe der Nummern (im Verhältnis zur Norm); Karte › Violett › Darstellung die Schrift und den Fettdruck der
            Nummern, ihre weiße Kontur, die automatische Unterbrechung sich kreuzender Linien, die Größe je nach Druckmaßstab und das Violett. Auf der Karte platzierte Texte
            werden in der Schrift gedruckt, die sie nennen, mit Fett- und Kursivschrift, und in allen Sprachen.</p>
        </section>`,
      verifier: () => html`
        <section class="mx-slide" id="tr-verifier">
          <p class="mx-kicker">${K}</p>
          <h2>Prüfen</h2>
          <p>Die Registerkarte Prüfen liefert für die ganze Veranstaltung:</p>
          <ul class="mx-list">
            <li><b>Bahnübersicht</b>: Länge, Steigung, Anzahl der Posten;</li>
            <li><b>Längen der Teilstrecken</b>, Bahn für Bahn;</li>
            <li><b>Querverweise</b>: welche Bahnen welchen Posten anlaufen;</li>
            <li><b>Belastung der Posten und Teilstrecken</b>: die Zahl der an jedem Posten erwarteten Teilnehmer, um dort, wo es nötig ist, mehrere Stationen aufzustellen;</li>
            <li><b>Veranstaltungsprüfung</b>: ungenutzte Posten, unvollständige Postenbeschreibungen, Codes unter 31 oder verkehrt herum lesbar, Posten zu nah
              beieinander (mindestens 30 m zwischen zwei Posten im Wald, 15 m im Sprint, und deutlich unterschiedliche Objekte unter 60 m, 30 m im Sprint), Teilstrecken, die
              ein Sperrgebiet oder eine unpassierbare Grenze durchqueren oder durch den Kreis eines anderen Postens führen, Doglegs, zu kurze Teilstrecken, Bahnen, die vom selben Start zum selben ersten Posten oder in fast dieselbe Richtung führen.</li>
          </ul>
          <p>Die Prüfung läuft nach jeder Änderung von selbst: Die Zahl der gefundenen Probleme erscheint auf der Registerkarte Prüfen – in Rot, in Orange, wenn
            nur noch Erinnerungen bleiben, etwa eine noch nicht eingetragene Steigung –, und die ersten in der Registerkarte selbst; ein Klick öffnet die vollständige Prüfung. Die
            Gruppe „Aktuelle Bahn“ gibt ihre Länge, ihre Steigung, ihre Postenzahl, ihren Maßstab und ihre erwarteten Teilnehmer an.</p>
          <h3>Steigung und Siegerzeit</h3>
          <p>${W("rep-climb")} berechnet die Steigung jeder Bahn aus dem Geländemodell des IGN (georeferenzierte Karte, in Frankreich); hake die Bahnen an, um den Wert
            in ihre Eigenschaften zu übernehmen. Zeichne mit dem Werkzeug Route den vorgesehenen Weg dort, wo die Luftlinie über einen Hügel führt, den die Läufer
            umlaufen werden. ${W("rep-times")} gibt für jede Bahn die erwartete Siegerzeit an, nach den Ergebnissen der letzten beiden
            Saisons, und die Länge, die eine angestrebte Zeit ergibt (Kapitel „Die Berechnungen“).</p>
          <p>Die Belastung ergibt sich aus der Teilnehmerzahl jeder Bahn: ${W("load")} übernimmt sie aus den offiziellen Anmeldungen, wenn der Lauf dort aufgeführt ist.</p>
        </section>`,
      outils: () => html`
        <section class="mx-slide" id="tr-outils">
          <p class="mx-kicker">${K}</p>
          <h2>Im Team und im Gelände</h2>
          <div class="mx-grid">
            <div class="mx-box" style="--c:var(--s1)"><h3>${ic("team", 18)} Das Team</h3><p>${W("team")}: Erstelle einen Einladungslink für eine Rolle und gib ihn weiter; wer ihn angemeldet öffnet, tritt dem Team bei, ob FFCO-Lizenzinhaber oder nicht.
              Bahnleger und Kontrolleur bearbeiten, der Leser liest und kommentiert. Nur einer bearbeitet zur gleichen Zeit; die anderen können „übernehmen“.</p></div>
            <div class="mx-box" style="--c:var(--s2)"><h3>${ic("comment", 18)} Kommentare</h3><p>${W("comments")}: ein Kommentar, an eine
              Stelle der Karte geheftet, Antworten und „Erledigt“, wenn es geklärt ist; die Zahl der noch offenen erscheint auf der Registerkarte.</p></div>
            <div class="mx-box" style="--c:var(--s3)"><h3>${ic("history", 18)} Versionen</h3><p>${W("versions")}: jede Version, was sich seitdem geändert hat
              („Posten 34 um 40 m verschoben“), und sie wieder öffnen.</p></div>
            <div class="mx-box" style="--c:var(--s4)"><h3>${ic("phone", 18)} Geländemodus</h3><p>Auf dem Telefon die georeferenzierte Karte mit deiner GPS-Position, der
              nächste Posten, seine Entfernung und seine Richtung; jeder Posten als gesetzt, geprüft, eingesammelt oder mit Problem vermerkt, mit einem Foto.</p></div>
            <div class="mx-box" style="--c:var(--s5)"><h3>${ic("offline", 18)} Offline</h3><p>${W("offline")} behält die Veranstaltung auf dem Gerät:
              Sie öffnet sich ohne Netz, und die Änderungen werden gesendet, sobald das Netz zurück ist.</p></div>
            <div class="mx-box" style="--c:var(--s6)"><h3>${ic("box", 18)} Einsammeln</h3><p>${W("rep-pickup")}: ab wann jeder Posten
              eingesammelt werden kann, und die Reihenfolge jedes Einsammlers.</p></div>
            <div class="mx-box" style="--c:var(--s1)"><h3>${ic("tour", 18)} Postenrunde</h3><p>${W("tour")}: der schnellste Weg über die angekreuzten Posten (standardmäßig alle), für den Bahnkontrolleur und alle,
              die sie setzen oder einsammeln; nummeriert auf der Karte, als GPX, Bild oder CSV exportierbar, oder als Bahn mit Postenbeschreibung und Kontrollkarte.</p></div>
          </div>
          <p>Die Postenrunde beginnt am Start, an einem Posten oder am günstigsten, und endet im Ziel, am Ausgangspunkt oder irgendwo; sie rechnet
            mit dem gewählten Tempo und der Zeit an jedem Posten. Die Karte wird gelesen wie für die berechneten Routen der Analysen (eine OCAD- oder
            Mapper-Karte über ihre Symbole, jede andere über ihre Farben), die Sperrgebiete und Begrenzungen des Bahnlegers sind geschlossen, das Relief
            zählt, wenn die Karte georeferenziert ist; die Reihenfolge ist die schnellste gefundene (exakt bis 10 Posten). „Bahn erstellen“ macht daraus eine Bahn der Veranstaltung, ihre Posten in der Reihenfolge der Runde (eine Testbahn, nicht in den
            Berichten): Das Feld druckt dann ihre Karte, ihre Postenbeschreibung und ihre Kontrollkarte.</p>
          <p>Außerdem: ${W("import-course")} übernimmt die Posten einer gedruckten Bahn (ein PDF oder ein Foto eines vergangenen Laufs), danach zu prüfen;
            ${W("view-others")} zeigt andere Bahnen blass an, um Kreuzungen und zu nahe Posten zu vermeiden.</p>
        </section>`,
      apres: () => html`
        <section class="mx-slide" id="tr-apres">
          <p class="mx-kicker">${K}</p>
          <h2>Nach dem Lauf</h2>
          <p>Am Tag des Laufs oder danach (nie vorher: Die Bahnen bleiben geheim, und die Schaltflächen unter Team und Lauf › Nach dem Lauf bleiben bis dahin ausgegraut) kann der
            Bahnleger:</p>
          <ul class="mx-list">
            <li><b>die Bahnen in die Analyse übertragen</b> (${W("publish")}): Jede Bahn kommt dort mit ihrer Karte und ihrer Kalibrierung an, die Läufer müssen nur noch
              ihren GPS-Track hochladen. Dasselbe Fenster stellt die ganze Analyse ein: ihren Namen (der vom Namen der Veranstaltung abweichen kann), ihr Datum, wer sie
              öffnet (alle Konten, mit oder ohne Besucher, der Verein, ein Passwort), die für die Läufer aktivierten Aktionen; dann „Veröffentlichen“ oder „Als Entwurf
              speichern“ (nur ihre Veranstalter sehen sie). Ein Fenster zeigt den Fortschritt — jede Bahn wird auf ihre Karte gedruckt und gesendet — und öffnet danach
              die Analyse mit einem Klick, ebenso ihre Verwaltungsseite (Reiter „Analyse“ der Veranstaltung, in Orga, wo alles änderbar bleibt). Eine neue Veröffentlichung legt eine weitere
              Analyse an oder aktualisiert, nach Wahl, eine der aus der Veranstaltung schon veröffentlichten (ihre Bahnen und Einstellungen ersetzt, die geteilten Tracks
              bleiben); ein Wettkampf hat nur eine Analyse;</li>
            <li><b>die Bahnen an „Ergebnisse“ senden</b> (${W("send-results")}): eine Ergänzung der Ergebnisse, keine Ergebnisse. Die Ergebnisdatei, die die
              Zeitnahme-Software (MeOS, OE…) als IOF XML exportiert, enthält bereits Länge, Steigung und Posten jeder Bahn: mit ihr bringt diese Übertragung nichts.
              Sie hilft, wenn die veröffentlichten Ergebnisse von anderswo stammen — ein PDF, liveresultat, WinSplits, O'Live, eine HTML-Seite ohne Bahnkopf — und diese
              Angaben fehlen. Die Bahnen der Bahnlegung (als IOF XML) werden dann den Bahnen der Ergebnisse über ihren Namen („Bahn A“ = „A“) oder ihre Posten zugeordnet,
              und nur fehlende Werte werden ergänzt, nie Zeiten oder Plätze: Die Ergebnisseite des Laufs zeigt Länge und Steigung, „Arena › Analyse“ benennt die Posten
              mit ihren Codes, und die Steigung vergangener Läufe fließt in die Schätzung der Siegerzeiten künftiger Bahnen ein. Nötig sind eine mit einem Wettkampf
              verknüpfte Veranstaltung, die Mitgliedschaft im ausrichtenden Verein und die Zustimmung zur Veröffentlichung; vor dem Tag nach dem Lauf erscheint nichts,
              und eine neue Übertragung ersetzt die vorige;</li>
            <li>die <b>Bilanz</b> lesen (${W("rep-after")}): für jede Teilstrecke die Bestzeit und die Medianzeit, der Anteil der Läufer, die sich dort
              verlaufen haben, die Fehlstempel (eine Station zu prüfen?) und die gewählten <b>Routen</b>, nach den in der Analyse geteilten Tracks.</li>
          </ul>
        </section>`,
      ruban: () => {
        // each item of a group: a command, a setting, a figure, the gallery
        const flat = (items) => items.flatMap((it) => (it.t === "stack" ? flat(it.items) : [it]));
        const entry = (it) => {
          if (it.t === "field") { const f = TRD.INFO.field[it.id] || [it.id, ""]; return html`<dt>${ic("sliders", 16)}<span>${f[0]}</span></dt><dd>${f[1]}</dd>`; }
          if (it.t === "chip") return html`<dt>${ic("list", 16)}<span>${{ issues: "Die Probleme", course: "Die aktuelle Bahn", mapInfo: "Die Karte", geoInfo: "Georeferenziert?", control: "Der Posten", leg: "Die Teilstrecke", special: "Das Objekt", drawing: "Die Zeichnung" }[it.id] || ""}</span></dt><dd>${TRD.INFO.chip[it.id] || ""}</dd>`;
          if (it.t === "modes") return html`<dt>${ic("palette", 16)}<span>${it.id === "blend" ? "Darüber, Gemischt, In Ebenen" : "Keine, Ganz, Anfang, Ende"}</span></dt><dd>${TRD.INFO.modes[it.id]}</dd>`;
          if (it.t === "gallery") return html`<dt>${ic("special", 16)}<span>Die Galerie</span></dt><dd>${TRD.INFO.gallery}</dd>`;
          return html`<dt>${ic(it.icon, 16)}<span>${it.label}${it.key && it.key.length === 1 ? ` (${it.key})` : ""}</span></dt><dd>${it.tip || MENU_HELP[it.act] || ""}${it.split ? ` Das kleine ▾: ${it.split.map((x) => x[1]).join(", ")}.` : ""}</dd>`;
        };
        const groups = (gs) => gs.map((g) => html`<h4 class="tr-doc-gh">${g.title || "—"}${g.pro ? " — erweiterte Stufe" : ""}</h4><dl class="tr-doc-menu">${flat(g.items).map(entry)}</dl>`);
        return html`
        <section class="mx-slide" id="tr-ruban">
          <p class="mx-kicker">${K}</p>
          <h2>Das Menüband, Registerkarte für Registerkarte</h2>
          <p>Jeder Befehl des Menübands, mit dem Symbol, das er in der Bahnlegung trägt: die Registerkarten, die des gewählten Objekts, dann das Menü Datei: Seine Listen (Exportformate, Importe, Teilen) öffnen sich in einem Fenster, in dem jede Datei sagt, wofür sie dient.</p>
          ${TRD.TABS.filter((tb) => tb.groups).map((tb) => html`<h3 class="tr-doc-mh">${ic(tb.icon, 20)}<span>${tb.label}</span></h3>${groups(tb.groups)}`)}
          <h3 class="tr-doc-mh">${ic("select", 20)}<span>Die Registerkarten des gewählten Objekts</span></h3>
          ${Object.values(TRD.CONTEXT).map((c) => html`<h4 class="tr-doc-gh">${c.label}</h4><dl class="tr-doc-menu">${c.groups.flatMap((g) => flat(g.items)).map(entry)}</dl>`)}
          <h3 class="tr-doc-mh">${ic("file", 20)}<span>Das Menü Datei</span></h3>
          ${TRD.BACKSTAGE.map((sec) => html`<h4 class="tr-doc-gh">${sec.label}</h4><dl class="tr-doc-menu">${
            sec.act ? html`<dt>${raw(TR.actIcon(sec.act, 16))}<span>${sec.label}</span></dt><dd>${MENU_HELP[sec.act] || ""}</dd>`
              : sec.id === "info" ? html`<dt>${ic("sliders", 16)}<span>Informationen</span></dt><dd>Die Veranstaltung: ihre Karte, ihre Bahnen, deine Rolle, die Verschlüsselung; ihre Eigenschaften, ihr Team.</dd>`
                : sec.id === "options" ? html`<dt>${ic("sliders", 16)}<span>Optionen</span></dt><dd>Das vollständige Menüband, auf einer Zeile oder nur seine Registerkarten; die Symbolleiste für den Schnellzugriff; mehrere Dateien.</dd>`
                  : [...(sec.items || []), ...(sec.groups || []).flatMap((x) => x[1])].map(([act, l, d]) => html`<dt>${raw(TR.actIcon(act, 16))}<span>${l}</span></dt><dd>${d}</dd>`)}</dl>`)}
        </section>`;
      },
      avance: () => html`
        <section class="mx-slide" id="tr-avance">
          <p class="mx-kicker">${K}</p>
          <h2>Die erweiterte Stufe</h2>
          <p>Die Bahnlegung hat zwei Stufen. Die <b>Grundstufe</b>, für alle, kann, was eine Purple-Pen-Datei kann, dazu die Teamarbeit,
            das Gelände, die Prüfungen und die Nachbereitung von Ozimut. Die <b>erweiterte Stufe</b> fügt hinzu, was Condes kann, ein anderes
            Bahnlegungsprogramm, für speziellere Anforderungen; sie steht allen offen. Ihre Schaltflächen tragen einen kleinen orangen Punkt.
            Eine Purple-Pen-Datei (.ppen) behält diese Ergänzungen nicht: Der Export sagt vorher, was er weglässt; die Ozimut-Datei
            (.ozmt) behält alles.</p>
          <h3>Von einem anderen Programm kommen</h3>
          <p>${W("import-courses")} übernimmt die Posten, die Bahnen, die Kategorien und die Staffelteams aus einem IOF XML (3.0 oder
            2.0.3), exportiert aus Condes, OCAD, Purple Pen oder einer Zeitmessungssoftware, oder die Bahnen einer OCAD-Karte, die
            mit dessen Bahnlegungsmodul vorbereitet wurde (geprüft an einer Datei aus OCAD 2018: Posten, Postenbeschreibungen, Start, Bahnen). Ein IOF XML,
            mit seiner Karte unter „Veranstaltung importieren“ abgelegt, erstellt die Veranstaltung. Die Varianten kommen als eigene Bahnen an.</p>
          <h3>Die Kategorien</h3>
          <p>${W("classes")}: jede Kategorie, ihre Bahn und ihre erwarteten Teilnehmer. Die Liste der Kategorien einer Bahn und ihre
            Teilnehmer ergeben sich daraus, und mit ihnen die Belastung der Posten.</p>
          <h3>Varianten und Staffeln</h3>
          <p>Die <b>Raute</b> (${W("var-phi")}) führt vom gewählten Posten zum nächsten: zwei Äste, nacheinander gelaufen, mit
            einem Rückweg zwischen ihnen; die Varianten heißen AB und BA. Die Posten jedes Asts und des Rückwegs fügst du hinzu, indem du
            die Variante über der Karte wählst. Eine Gabelung oder Schlaufen können bis zu 20 Äste haben. In ${W("relay")}:
            die Teams mit denselben Varianten in anderer Reihenfolge füllen, Gabelungen koppeln („A=C“: Wer A läuft, läuft C in derselben
            Staffel), die Strecken ankreuzen, auf denen jeder Ast gelaufen wird, und die Teams von Hand ändern (Startnummer, Name, Variante jeder
            Strecke), wobei die Felder, die ein Team von den anderen unterscheiden, rot sind.</p>
          <h3>Formen und Disziplinen</h3>
          <p>Die Eigenschaften einer Bahn geben ihre <b>Form</b> an — normal, markierte Bahn (die Linie entlang der gezeichneten
            Routen), Trail-O —, die Linien zwischen den Posten oder nicht, ihre <b>Disziplin</b> (MTB-O: Längen entlang der Routen;
            Ski-O: ein Punkt in der Mitte der Kreise), das Rogaining (Punkte = Code, auf den Zehner gerundet) und „alle Posten“. Ein Posten
            kann in <b>freier Reihenfolge</b> sein (${W("random-section")}): keine Linie zu, zwischen oder von den Posten des Abschnitts, und eine
            Zeile in der Postenbeschreibung. ${W("finish-at-start")} zeichnet das Ziel auf den Start.</p>
          <p>Die Symbole des <b>MTB-O</b> (ISMTBOM 2022) sind bei den Sonderobjekten: vorgeschriebene Einbahnstrecke, verbotene Route,
            gefährlicher Abschnitt, Hindernis auf dem Weg, verbotener Durchgang; sie sind nach der Beschreibung der Norm gezeichnet, ihre
            Maße sind noch zu prüfen.</p>
          <h3>Posten und Postenbeschreibungen</h3>
          <p>Die Eigenschaften eines Postens fügen seine weiteren Stationen hinzu, eine Sperre (er bewegt sich beim Ziehen nicht mehr) und, beim Trail-O, seine
            Postenflaggen („A–E“, in Spalte B) und seine richtige Antwort. Ein Feld der Postenbeschreibung kann ein zweites Symbol tragen (beim Wählen
            „2. Symbol“ ankreuzen); ${W("my-symbols")} fügt eigene Symbole hinzu, aus SVG-Zeichnungen gewonnen; die Eigenschaften der
            Veranstaltung setzen ihr Datum hinter den Titel.</p>
          <h3>Prüfen und messen</h3>
          <p>${W("view-angles")} zeigt den Richtungswechsel an jedem Posten (rot über 120°), ${W("view-nearest")} kreist zu nahe
            Posten ein; ${W("rep-controls")} gibt jeden Posten mit seinen Stationen und dem nächstgelegenen Posten an, ${W("trail-answer")} die
            richtigen Antworten. Eine Teilstrecke kann mehrere Routen haben (${W("routes-alt")}), wobei die Länge die kürzeste nimmt. Außerhalb
            Frankreichs kommt die Steigung aus den offenen Geländekacheln (SRTM, etwa 30 m).</p>
          <h3>Layout und Druck</h3>
          <p>Die Sonderobjekte fügen die <b>Vergrößerung</b> hinzu (ein Rahmen, der einen anderen Teil der Karte vergrößert zeigt, mit der
            Bahn) und die <b>Maske</b> (weiß, mit Löchern). Das PDF der Bahnen bietet zusätzlich: mehrere Bahnen oder Kopien pro Blatt,
            alle Bahnen auf einer Karte, die Rückseite jeder Karte (Name, Kategorien, Team und Strecke), Passermarken mit
            dem Versatz des Druckers und georeferenzierte Seiten (Avenza Maps). Die Postenbeschreibungen werden auf den Hundertstelmillimeter platziert,
            und die Kontrollkarten können Ersatzkarten sein.</p>
          <p>Für eine <b>Offsetdruckerei</b> können die Farben des PDF <b>Schmuckfarben</b> sein: die, die eine OCAD-Karte festlegt, und das
            Violett in einer eigenen Druckfarbe (oder einer der Druckfarben der Karte, wenn man ihm deren Namen gibt), mit dem echten
            Überdrucken von PDF. <b>Farbauszüge</b> ergeben eine Seite je Druckplatte — jede Schmuckfarbe oder C, M, Y und K —, in Schwarz,
            mit ihren Passermarken und ihrem Namen; sie brauchen eine OCAD- oder Mapper-Karte oder nur die Bahn. Es ist dieselbe Technik
            wie bei den Farbauszügen von Carto.</p>
          <h3>Weitere Formate</h3>
          <p>${W("export-geotiff")}, SVG (jedes Objekt benannt), KMZ mit der Karte, MapRun, der OCAD-Text der Bahnen, IOF XML 2.0.3 mit
            jeder Variante als eigener Bahn, und ein Paket für die Importseite von Livelox (das direkte Senden an Livelox erfordert eine Vereinbarung mit
            Livelox).</p>
          <h3>Karten</h3>
          <p>${W("maps")}: weitere Karten in der Veranstaltung, auf die erste ausgerichtet (über ihre Georeferenzierungen, denselben Rahmen oder zwei
            Punkte auf jeder), und die Karte jedes Teils einer Bahn. ${W("map-templates")} zeigt die Hintergrundkarten einer OCAD-Karte, die man ihr gibt. ${W("field-states")} benennt die Zustände der
            Posten im Feldmodus.</p>
        </section>`,
      calculs: () => html`
        <section class="mx-slide" id="tr-calculs">
          <p class="mx-kicker">Bahnlegung</p>
          <h2>Ihre Berechnungen, erklärt</h2>
          <h3>Die Steigung</h3>
          <p>Die Höhe wird alle 10 m entlang jeder Teilstrecke aus dem Geländemodell des IGN gelesen (RGE ALTI, in Frankreich auf den Meter genau), dann
            über drei Punkte geglättet: Das Modell hat kleine Unregelmäßigkeiten, die sich, aufaddiert, zu einem überhöhten Anstieg summieren würden. Die Steigung ist die Summe der Anstiege,
            auf 5 m gerundet. In gerader Linie zählt eine Teilstrecke, die einen Hügel umgeht, den Hügel mit: Deshalb kann man mit dem Werkzeug Route den
            vorgesehenen Weg zeichnen, der dann für die Berechnung dient.</p>
          <h3>Die Siegerzeit</h3>
          <p>Aus den offiziellen Ergebnissen der letzten beiden Saisons (etwa hundert Läufe desselben Formats) wird für jede Bahn das Tempo des
            Siegers in Minuten pro Kilometer erfasst, und sein offizieller CN 15 Tage vorher. Je höher der CN, desto schneller das Tempo: Der Zusammenhang wird ein
            für alle Mal angepasst und liefert das Tempo eines Siegers mit gegebenem CN. Zum Beispiel läuft auf derselben Bahn ein Sieger mit CN 6 500 etwa 1,3-mal
            so schnell wie ein Sieger mit CN 3 000.</p>
          <p>Die offiziellen Ergebnisse geben die Steigung der Bahnen nicht an; die Dateien der Veranstalter geben sie oft an („Ergebnisse“). Auf diesen Bahnen wird die
            Zeit des Siegers mit der verglichen, die sein CN erwarten lässt, je nach Steigung pro Kilometer: Je mehr die Bahn steigt, desto länger braucht der Sieger.
            Um sich nicht auf wenige Bahnen zu verlassen, wird die Messung an die Regel des Leistungskilometers angenähert (100 m Anstieg entsprechen 1 km in der Ebene, also
            +10 % Zeit für 10 m mehr pro Kilometer), umso stärker, je ungenauer sie ist. Auf der Langdistanz ergibt die Messung wieder diese Regel; im Sprint,
            wo man schnell läuft und jeder Anstieg mehr kostet, ist sie stärker.</p>
          <p>Jede Schätzung gibt eine Spanne an: Die Hälfte der Referenzläufe hat eine Siegerzeit in dieser Spanne, denn das Gelände,
            die Vegetation und die technische Schwierigkeit, die viel ausmachen, sind nicht in der Berechnung.</p>
          <h3>Die Fehler und die Routen</h3>
          <p>Ein Fehler, wie in „Zwischenzeiten“: mindestens 20 % und 10 Sekunden auf der Teilstrecke verloren, gemessen am Tempo des Läufers über
            seinen ganzen Lauf. Zwei Routen sind dieselbe, wenn die beiden Tracks auf ganzer Länge weniger als etwa fünfzehn Prozent der Länge der
            Teilstrecke (mindestens 25 m) voneinander entfernt bleiben; die Seite („links herum“, „geradeaus“) wird gegenüber der Luftlinie bestimmt.</p>
          <h3>Der Einsammelplan</h3>
          <p>Ein Posten kann eingesammelt werden, wenn der letzte Läufer jeder Bahn, die ihn anläuft, ihn passiert hat: seine Startzeit, plus die Strecke bis zum Posten
            im Tempo eines langsamen Läufers (15 min/km im Wald, 9 im Sprint, in Luftlinie), plus ein Puffer. Die Posten werden nach Sektoren auf die Einsammler
            verteilt, und jeder nimmt sie in der Reihenfolge, in der er sie erreichen kann.</p>
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
          <p class="mx-kicker">Vereine</p>
          <h2>Ranglisten der Vereine</h2>
          <p>Ein Verein wird nach zwei unabhängigen Wahlen eingestuft, über die Läufer eines bestimmten Geschlechts und einer bestimmten Altersgruppe (Jugend: bis H/D 20;
            Erwachsene: H/D 21 und älter; Elite: nur H/D 21).</p>
          <div class="mx-grid">
            <div class="mx-box" style="--c:var(--s1)"><h3>Was gezählt wird</h3><p>Der <b>CN</b> jedes gewerteten Läufers, in der gewählten Methode, oder seine
              <b>Punkte bei nationalen Läufen</b>.</p></div>
            <div class="mx-box" style="--c:var(--s3)"><h3>Wie es zusammengezählt wird</h3><p>Die <b>Summe</b>, die die Zahl der Läufer und ihr Niveau vermischt; der
              <b>Mittelwert</b>, das Niveau des durchschnittlichen Läufers; die <b>Top 5</b>, der Mittelwert der fünf Besten, wobei ein fehlender Läufer als 0 zählt; oder die <b>Mitgliederzahl</b>.</p></div>
          </div>
        </section>
        <section class="mx-slide" id="elite">
          <p class="mx-kicker">Vereine</p>
          <h2>Punkte bei nationalen Läufen</h2>
          <p>Diese Punkte hängen von keiner CN-Methode ab: Sie beruhen auf den Rängen. Bei Läufen auf nationaler Ebene (französische Meisterschaften,
            nationale Läufe, Selektionsläufe, also die Gruppen A und B1) erhalten die 10 Ersten jeder Kategorie 25, 18, 15, 12, 10, 8, 6, 4, 2 und 1
            Punkte. Die Punkte werden <b>bei den französischen Meisterschaften verdoppelt</b>. Eine Kategorie wird der Bahn zugeordnet, auf der die meisten ihrer Läufer
            gelaufen sind. Die Vereinsseite zählt die Punkte der 12 Monate vor dem gewählten Datum; der Vereinsvergleich zeigt sie Saison für Saison.</p>
        </section>
        <section class="mx-slide" id="cfc">
          <p class="mx-kicker">Vereine</p>
          <h2>Französischer Vereinspokal</h2>
          <p>Die Website wendet auf jede Saison die Regel 2026 der FFCO an („Classement national des clubs“, Anhang 2). Für jeden Läufer werden seine
            5 besten offiziellen Scores des Jahres zu Fuß und seine 5 besten im MTB-O oder Ski-O genommen; die Punkte der Damen werden mit 1,4 multipliziert; der Verein
            addiert die Punkte seiner Läufer. Diese Berechnung ist nicht offiziell: Alle gewerteten Läufer zählen, da die Website die Art der
            Lizenz nicht kennt, und der Verein eines Läufers ist der seines letzten Laufs im Jahr. Der Pokal wurde von 2023 bis 2025 nicht vergeben.</p>
        </section>`,
      coureurs: () => html`
        <section class="mx-slide" id="progression">
          <p class="mx-kicker">Läufer</p>
          <h2>Entwicklung nach Alter</h2>
          <p>Für jede Saison und jede Kategorie (H14, D21, H45…) nimmt die Website die CN aller am Ende der Saison gewerteten Läufer und betrachtet,
            wie sie sich verteilen: den Median und die Bereiche, in denen die Hälfte und vier Fünftel der Läufer liegen. Jeden Monat wird der CN eines
            Läufers in dieser Verteilung eingeordnet: Sein <b>Perzentil</b> ist der Anteil der Läufer seiner Kategorie mit einem niedrigeren oder gleichen CN. Ein
            Läufer im 90.<sup></sup> Perzentil ist besser als 90 % seiner Kategorie. Die Kurve „alle Saisons“ fasst die Saisons seit 2012 zusammen: Sie ist
            eine Momentaufnahme aller Läufer, nicht die Verfolgung einer Generation.</p>
        </section>
        <section class="mx-slide" id="categories">
          <p class="mx-kicker">Läufer</p>
          <h2>Die Kategorien nebeneinander</h2>
          <p>Die Seite „Kategorien“ zeigt zu einem Monatsende die Verteilung der CN jeder Kategorie auf einer gemeinsamen Achse: ein helles Band vom
            10.<sup></sup> bis zum 90.<sup></sup> Perzentil, die mittlere Hälfte dunkler (vom 25.<sup></sup> bis zum 75.<sup></sup>), den Median und den Mittelwert. Man
            sieht auf einen Blick, wo sich die Kategorien überlappen: Im Wald entsprach im Oktober 2026 der mediane Ozimut-Index der H55 dem der H16.</p>
          <p>Die Punkte bezeichnen <b>die Besten jeder Kategorie</b>, nach einer einzigen Regel, überall gleich: In jeder Kategorie
            mit mindestens 5 gewerteten Läufern ihre besten 2 % (abgerundet), und mindestens ihren Ersten; bei gleichem CN an der
            Grenze alle. Eine Kategorie mit 76 Läufern zeigt also einen, eine mit 192 drei, eine mit 275 fünf. Eine
            Regel, die auf der Streuung jeder Kategorie beruht (die CN finden, die bei einem Boxplot „aus der Box fallen“), hätte
            die Kategorien unterschiedlich behandelt: Je breiter eine Kategorie gestreut ist, desto mehr Vorsprung braucht man, um herauszufallen, und ganze
            Kategorien wären ohne jemanden geblieben. Für jeden gibt die Seite seinen Rang in seiner Kategorie an, das Wievielfache des Medians
            dieser Kategorie er ist, und sein Perzentil, wenn er in H21 oder D21 liefe.</p>
        </section>
        <section class="mx-slide">
          <p class="mx-kicker">Läufer</p>
          <h2>Die Seite eines Läufers</h2>
          <ul class="mx-list">
            <li><span><b>CN-Berechnung</b>: zu jedem beliebigen Datum die Läufe der letzten 12 Monate, die zählenden und der daraus folgende CN, exakt
              nachgerechnet, mit denselben Rundungen und derselben Platzregel, aus den Lauf für Lauf veröffentlichten Scores.</span></li>
            <li><span><b>CN-Verlauf</b>: jeder Lauf, der in die letzten 12 Monate eintritt, und jeder, der sie verlässt, mit dem daraus folgenden CN und seiner
              Veränderung. Für den offiziellen CN ist es der von der FFCO veröffentlichte Verlauf, live gelesen.</span></li>
            <li><span><b>Entwicklung</b>: der CN Monat für Monat, dann der Rang des Läufers in seiner Altersklasse. Nach einem Methodenwechsel bleibt die vorherige
              Methode für die Dauer des Besuchs grau angezeigt.</span></li>
            <li><span><b>Karte</b>: die Läufe nach Département. <b>Saisons</b>: die Bilanz jeder Saison. <b>Netzwerk</b>: die getroffenen Läufer.</span></li>
          </ul>
        </section>`,
      reseau: () => html`
        <section class="mx-slide" id="reseau">
          <p class="mx-kicker">Netzwerk</p>
          <h2>Wer mit wem läuft</h2>
          <p>Zwei Läufer „treffen sich“, wenn sie dieselbe Bahn laufen. Über alle Saisons behält die Website für jeden Läufer die 30 Läufer,
            die er am häufigsten getroffen hat, mindestens 2-mal; für eine Saison berechnet sie sie mit den Ergebnissen dieser Saison neu. Sie zählt auch, wie
            oft jeder vor dem anderen ins Ziel kam. Ein nicht klassierter Läufer (Fehlstempel, Aufgabe…) liegt hinter allen klassierten.</p>
        </section>
        <section class="mx-slide">
          <p class="mx-kicker">Statistiken</p>
          <h2>Regionen, Teilnahme, Alter</h2>
          <ul class="mx-list">
            <li><span><b>Regionen</b>: die Zahl der ausgerichteten Wettkämpfe, der Läufer und der Wettkämpfe pro 100 Läufer, nach Regionalverband oder nach
              Département. Ein Wettkampf wird seinem Veranstalter zugeordnet: dem Verein (die ersten beiden Ziffern seiner Nummer geben das Département an), dem
              Départementskomitee oder dem Regionalverband.</span></li>
            <li><span><b>Teilnahme</b>: die großen Zahlen Saison für Saison, für alle, für einen Regionalverband oder für einen Verein, in einer Disziplin oder in
              allen.</span></li>
            <li><span><b>Alter</b>: die Verteilung der Läufer auf die Altersklassen, Damen links, Herren rechts, als Anteil der gewählten Gesamtheit.</span></li>
            <li><span><b>Die Aktivsten</b>: die Läufer mit den meisten Läufen, über alle Saisons, die letzte oder die laufende, mit der Zahl jeder
              Art (Lang- und Mitteldistanz, Nacht, Sprint, MTB-O, Ski-O). Fehlstempel und Aufgaben zählen: der Läufer ist gestartet.</span></li>
          </ul>
        </section>`,
      relais: () => html`
        <section class="mx-slide">
          <p class="mx-kicker">Staffeln</p>
          <h2>Der Staffelsimulator</h2>
          <ul class="mx-list">
            <li><span><b>Das Modell</b>: Die Zeit eines Läufers auf einer Strecke ist umgekehrt proportional zu seinem CN. Ein Läufer mit doppelt so hohem CN braucht
              halb so viel Zeit. Die Referenzzeit jeder Strecke wird so angepasst, dass das beste Team aller Vereine genau die
              Summe der Referenzzeiten des Formats erreicht (bei der CNE der Mittelwert der 5 besten Teams).</span></li>
            <li><span><b>Die Formate</b> folgen den Regeln 2026 der FFCO: CFC N1 bis N4 mit ihren Zusammensetzungsbedingungen und ihren reservierten Strecken (die
              ersten und letzten Strecken der Damen und Herren wechseln, je nachdem ob das Jahr gerade oder ungerade ist), CNE Herren, Damen, Jugend und Mini,
              Kategoriestaffel, Sprintstaffel (2 Damen, 2 Herren, in der Reihenfolge D-H-H-D). Man kann auch ein eigenes Format zusammenstellen.</span></li>
            <li><span><b>Das beste Team ist wirklich das beste</b>: Die Website probiert alle Möglichkeiten, die Bedingungen auf die Strecken zu verteilen, und
              wählt dann die Läufer mit einem exakten Zuordnungsverfahren (der ungarischen Methode). Alter und Geschlecht kommen aus der Kategorie: Ein Senior, der
              in H21 läuft, zählt als H21. Man kann das erste Team Läufer für Läufer ändern und Läufer ohne CN hinzufügen
              (Ausländer, reine Staffelläufer) mit dem CN, den man ihnen zutraut.</span></li>
          </ul>
        </section>`,
      limites: () => html`
        <section class="mx-slide" id="limites">
          <p class="mx-kicker">Gut zu wissen</p>
          <h2>Grenzen und Vorbehalte</h2>
          <ul class="mx-list bad">
            <li><span>Die Daten stammen von der Website der nationalen Rangliste der FFCO. Ein fehlender, falsch erfasster oder später korrigierter Lauf kann eine
              Abweichung erklären.</span></li>
            <li><span>Die Ozimut-Methode geht von den CN von 2010 aus; ihre ersten Monate spiegeln vor allem diesen Ausgangspunkt wider.</span></li>
            <li><span>Ihre Indizes ersetzen keinesfalls die offizielle Rangliste, die die einzige Referenz bleibt.</span></li>
            <li><span>Die monatlichen Ranglisten werden am Monatsende berechnet; die Seite eines Läufers zeigt die Berechnung zu jedem beliebigen Datum.</span></li>
            <li><span>Die vorläufigen Ergebnisse sind die der Veranstalter, vor jeder Korrektur durch die FFCO.</span></li>
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
    scatterChart($("#agr"), { series, xName: methodLabel("official"), yName: "Ozimut-Index", max });
    const stat = (name, pairs) => {
      const d = pairs.map((p) => p[1] - p[0]);
      return { name, n: pairs.length, r: pearson(pairs.map((p) => p[0]), pairs.map((p) => p[1])), bias: mean(d), mae: mean(d.map(Math.abs)) };
    };
    const stats = series.map((x) => stat(`${x.name} / ${methodShort("official")}`, x.data));
    $("#agr-stats").innerHTML = html`<div class="table-wrap"><table class="data compact"><thead><tr>
      <th>Verglichene Methoden</th><th class="r">Läufer</th><th class="r">Korrelation</th><th class="r">Mittlere Abweichung</th><th class="r">Mittlere absolute Abweichung</th></tr></thead>
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
      <div class="field"><span>Maß</span>${seg("evm", EVM.map((m) => [m, EV_LABEL[m]]), evMeas)}</div>
      <div class="field"><span>Läufe</span>${seg("evs", [["all", "alle"], ["nat", "nationale"]], evScope)}</div>`;
    $$('[data-seg="evm"]').forEach((x) => x.addEventListener("click", () => { evMeas = x.dataset.value; drawEval(); }));
    $$('[data-seg="evs"]').forEach((x) => x.addEventListener("click", () => { evScope = x.dataset.value; drawEval(); }));
    $("#ev-seasons").innerHTML = html`${["For", "Spr"].map((tr) => {
      const rows = evRows(tr, evScope);
      const items = [...evSeasons(tr, evScope).map((y) => ({ label: y, d: rows[y].d[evPair][evMeas], n: rows[y].comps })),
        ...[["holdout", `${ev.holdout[0]}–${String(ev.holdout[1]).slice(2)}`], ["tuned", "Abstimmung"]]
          .filter(([k]) => rows[k]).map(([k, label]) => ({ label: html`<b>${label}</b>`, d: rows[k].d[evPair][evMeas] }))];
      const up = items.filter((i) => i.d[1] > 0).length, against = items.filter((i) => i.d[2] < 0).length;
      return html`<section class="card"><div class="card-head"><div><h2>${t(`terrain.${tr}`)} · ${pairLabel(evPair)}</h2>
        <div class="hint">${EV_LABEL[evMeas]} (Abweichung in Punkten)</div></div></div>
        <div class="card-body">${forestPlot(items, evMeas)}
          <p class="muted" style="font-size:12.5px;margin:8px 0 0">Signifikante Abweichung zugunsten von „${methodShort(evPair.split("-")[0])}“:
            ${fmt(up)} Zeile${up > 1 ? "n" : ""} von ${fmt(items.length)}; zugunsten von „${methodShort(evPair.split("-")[1])}“: ${fmt(against)}.</p></div></section>`;
    })}`;
    const shown = M.filter((m) => ev.methods.includes(m));
    $("#ev-periods").innerHTML = html`
      <div class="filters"><div class="field"><span>Zeitraum</span>${seg("evq", [["holdout", `${ev.holdout[0]}–${ev.holdout[1]} (zurückgehaltene Saisons)`],
        ["tuned", "Juli 2025 – Oktober 2026 (Abstimmung)"]], evPeriod)}</div></div>
      <div class="grid grid-2">${["For", "Spr"].map((tr) => {
        const e = evRows(tr, "all")[evPeriod], en = evRows(tr, "nat")[evPeriod];
        if (!e) return "";
        const best = (meas) => Math.max(...shown.map((m) => e[meas][m]));
        return html`<section class="card"><div class="card-head"><div><h2>${t(`terrain.${tr}`)}</h2>
          <div class="hint">${fmt(e.comps)} Wettkämpfe, ${fmt(e.circuits)} Bahnen, ${fmt(e.runners)} Ergebnisse</div></div></div>
          <div class="table-wrap"><table class="data compact"><thead><tr><th>Methode</th>${EVM.map((m) => html`<th class="r">${EV_LABEL[m]}</th>`)}</tr></thead>
            <tbody>${shown.map((m) => html`<tr><td>${methodKey(m)} ${methodShort(m)}</td>${EVM.map((meas) => {
              const x = evFmt(meas, e[meas][m], false) + (meas === "r2" || meas === "acc" ? " %" : "");
              return html`<td class="r num">${e[meas][m] === best(meas) ? html`<b>${x}</b>` : x}</td>`;
            })}</tr>`)}</tbody></table></div>
          <div class="card-body"><h3 style="margin:0 0 6px;font-size:14px">Abweichungen, alle Läufe</h3>
            ${forestPlot(EV_PAIRS().map((p) => ({ label: pairLabel(p), d: e.d[p][evMeas] })), evMeas)}
            ${en ? html`<h3 style="margin:12px 0 6px;font-size:14px">Abweichungen, nationale Läufe (${fmt(en.comps)} Wettkämpfe)</h3>
              ${forestPlot(EV_PAIRS().map((p) => ({ label: pairLabel(p), d: en.d[p][evMeas] })), evMeas)}` : ""}
            <p class="muted" style="font-size:12.5px;margin:8px 0 0">Maß der Abweichungen: ${EV_LABEL[evMeas].toLowerCase()} (oben gewählt).</p></div></section>`;
      })}</div>`;
    $$('[data-seg="evq"]').forEach((x) => x.addEventListener("click", () => { evPeriod = x.dataset.value; drawEval(); }));
  }
  return { TABS, STUDY_TAB, STUDY_CHAPTERS, SITE_CHAPTERS, lede, note, officiel, top, etude, calculs, tracerDoc, drawAgreement, drawEval };
}
