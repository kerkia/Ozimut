// The documentation's texts in Spanish (pages/methods.js builds the page, its data and its tabs; methods.fr.js is the reference, kept in step:
// the same structure, the same figures, the Spanish words). build(X) receives the page's neutral helpers and data
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
  const TABS = [["officiel", "CN oficial"], ["top", "Método Ozimut"], ["calculs", "Corredores y clubes"], ["tracer", "Trazado"]]
    .filter(([k]) => fr || (k !== "officiel" && k !== "calculs"));
  const STUDY_TAB = ["etude", "El estudio"];
  const STUDY_CHAPTERS = [["objectifs", "Objetivos"], ["depart", "El punto de partida"], ["mesure", "La medida"],
    ["choix", "Las decisiones y las variantes"], ["resultats", "Los resultados"], ["conclusion", "El método elegido"]];
  // (the results and split times moved to the guide's « Courses » on 2026-10-24: guide.*.js)
  const SITE_CHAPTERS = [["clubs", "Clubes"], ["coureurs", "Corredores"], ["reseau", "Red"], ["relais", "Relevos"], ["limites", "Límites"]];
  // (Stats' documentation, since 2026-10-31: one documentation per module)
  const lede = fr ? html`Cómo se calculan las clasificaciones: el CN oficial, el método Ozimut y el estudio que lo validó, y los cálculos de las páginas de corredores y clubes.`
    : html`Cómo se calcula la clasificación: el método Ozimut y el estudio que lo validó con los resultados franceses.`;
  const note = !fr ? "" : html`Solo el ${methodLabel("official")} toma valores publicados por la Federación Francesa de Orientación (FFCO); el método Ozimut es un cálculo alternativo que hace el sitio con los mismos resultados.`;
  const pctOf = (x) => `${fmt(100 * x)} %`;
  const force = html`el nivel habitual de los corredores`;
  const EV_LABEL = { acc: "Duelos bien predichos", r2: "Diferencias de tiempo explicadas" };
  const forestPlot = (items, meas) => {
    if (!items.length) return html`<div class="empty">—</div>`;
    const lo = Math.min(0, ...items.map((i) => i.d[1])), hi = Math.max(0, ...items.map((i) => i.d[2]));
    const pad = (hi - lo) * 0.04 || 0.01, a = lo - pad, span = hi + pad - a;
    const pos = (x) => ((x - a) / span) * 100;
    return html`<div class="ev-forest">${items.map((i) => {
      const cls = i.d[1] > 0 ? "up" : i.d[2] < 0 ? "down" : "flat";
      return html`<div class="ev-row ${cls}" title="${cls === "flat" ? "el intervalo contiene 0: diferencia no significativa" : "diferencia significativa"}">
        <span class="ev-lab">${i.label}</span>
        <span class="ev-val num">${evFmt(meas, i.d[0])}<span class="dim"> [${evFmt(meas, i.d[1])}; ${evFmt(meas, i.d[2])}]</span></span>
        <span class="ev-track"><i class="ev-zero" style="left:${pos(0)}%"></i>
          <i class="ev-ci" style="left:${pos(i.d[1])}%;width:${Math.max(0.6, pos(i.d[2]) - pos(i.d[1]))}%"></i>
          <i class="ev-pt" style="left:${pos(i.d[0])}%"></i></span></div>`;
    })}</div>`;
  };
  const shareName = (f) => (f >= 1 ? "todos los corredores" : Math.abs(f - 2 / 3) < 0.01 ? "los dos tercios más rápidos" : `el ${fmt(Math.round(100 * f))} % más rápido`);
  const shareShort = (f) => (f >= 1 ? "100 %" : Math.abs(f - 2 / 3) < 0.01 ? "dos tercios" : `${fmt(Math.round(100 * f))} %`);
  const years = (d) => (d === 365 ? "12 meses" : `${fmt(Math.round(d / 365))} años`);
  const r6Table = (level, extra) => html`<div class="table-wrap"><table class="data compact"><thead><tr><th>Corredor</th><th class="r">${level}</th>
    <th class="r">Tiempo</th><th class="r">${level} × tiempo</th>${extra.map(([h]) => html`<th class="r">${h}</th>`)}</tr></thead>
    <tbody>${RACE6.map(([name, c, tm], i) => html`<tr><td>${name}</td><td class="r num">${n0(c)}</td><td class="r num">${fmt(tm)} min</td>
      <td class="r num">${n0(r6.prod[i])}</td>${extra.map(([, f]) => html`<td class="r num">${f(i, tm)}</td>`)}</tr>`)}</tbody></table></div>`;

  // ======================================================================================================
  // 1. CN officiel
  // ======================================================================================================
  function officiel() {
    return html`
    <section class="mx-slide" style="${cvar("official")}">
      <p class="mx-kicker">${methodKey("official")} ${methodLabel("official")}</p>
      <h2>La puntuación de una carrera</h2>
      <p>Cada carrera da una puntuación a cada corredor clasificado. Esa puntuación depende del tiempo del corredor y de la dificultad del recorrido. La dificultad
        se mide con los corredores presentes, a partir de su CN: es el <b>valor del recorrido</b>.</p>
      <p>Para cada corredor que tiene CN, se multiplica su CN por su tiempo: un corredor con CN 6000 que corre en 50 minutos da 300 000. El valor del
        recorrido es la media de esos productos para los dos tercios más rápidos de los corredores que tienen CN. La puntuación de un corredor es el valor del
        recorrido dividido por su tiempo.</p>
      <div class="mx-eq">valor del recorrido = media de los (CN × tiempo) de los dos tercios más rápidos
        <small>puntuación = valor del recorrido ÷ tiempo del corredor</small></div>
      <p>Un corredor que corre como su CN deja prever obtiene una puntuación cercana a su CN. Si corre un 10 % más rápido, su puntuación es un 11 % más alta;
        si corre un 10 % más lento, su puntuación es un 9 % más baja.</p>
      <h3>Ejemplo: un recorrido de seis corredores</h3>
      ${r6Table("CN", [["¿En el valor?", (i) => (i < r6.keep ? "sí" : "no")], ["Puntuación oficial", (i, tm) => n0(r6.off / tm)]])}
      <p>Los dos tercios de seis corredores son cuatro corredores: A, B, C y D. El valor del recorrido es la media de sus cuatro productos, es decir,
        ${n0(r6.off)}. La puntuación de A es ${n0(r6.off)} ÷ 50 = ${n0(r6.off / 50)}. E y F, los más lentos, no cuentan en el valor, pero reciben
        una puntuación como los demás.</p>
      <ul class="mx-list">
        <li><span>El CN utilizado es el CN oficial publicado 15 días antes de la carrera (el «CN D-15»).</span></li>
        <li><span>Cuando el recorrido solo tiene tres corredores con CN, los tres cuentan en el valor.</span></li>
        <li><span>Un error de tarjeta, un abandono, una descalificación o un fuera de tiempo dan una puntuación de 0, que cuenta en el CN. Un resultado
          «no clasificado» (nc) no cuenta en ninguna parte.</span></li>
        <li><span>En 2022, el valor de los recorridos se multiplicaba por 0,95; los demás años, no.</span></li>
      </ul>
    </section>
    <section class="mx-slide" style="${cvar("official")}">
      <p class="mx-kicker">El CN</p>
      <h2>La media de las puntuaciones del medio</h2>
      <p>El CN oficial es la media de las puntuaciones de los últimos 12 meses, sin las mejores ni las peores. Desde 2026 se descartan el 10 % de las mejores
        puntuaciones y el 40 % de las peores, y luego se hace la media de las que quedan. El número de puntuaciones descartadas se redondea: con 10 carreras, se descartan
        la mejor y las 4 peores, y el CN es la media de las otras 5.</p>
      <ul class="mx-list">
        <li><span>Antes de 2026, solo se descartaba la mejor carrera.</span></li>
        <li><span>Desde 2026, cada 1 de enero todos los CN de una disciplina se multiplican por un mismo número, elegido para que la media
          del 20 % de los mejores CN valga 5600: es el reescalado. Antes de 2026, el mejor CN se rebajaba a 10 000 cuando superaba ese valor;
          ocurrió el 1 de enero de 2013, 2023, 2024 y 2025.</span></li>
        <li><span>Desde 2026 hay cuatro clasificaciones: bosque (larga distancia, media distancia, nocturna), sprint, MTB-O y Ski-O. Antes de 2026, una única
          clasificación a pie reunía el bosque y el sprint; el sitio la muestra tal cual.</span></li>
      </ul>
    </section>
    <section class="mx-slide" style="${cvar("official")}">
      <p class="mx-kicker">En el sitio</p>
      <h2>Lo que el sitio toma</h2>
      <ul class="mx-list">
        <li><span>Los CN y las puntuaciones oficiales se toman tal como la FFCO los publica en la web de la clasificación nacional, carrera por carrera.</span></li>
        <li><span>La página de un corredor lee en directo su página de CN en la web de la FFCO. La federación a veces reevalúa carreras de temporadas pasadas;
          sus puntos pueden entonces diferir de los de la página de resultados de la carrera.</span></li>
        <li><span>Junto al CN publicado, la página de un corredor rehace el cálculo con la regla anterior y las puntuaciones oficiales. Una posible diferencia viene de un
          resultado que falta en el sitio, corregido a posteriori o reevaluado.</span></li>
        <li><span>La clasificación oficial es la que vale: es la única que cuenta para las selecciones.</span></li>
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
      official: { cn: offCn, used: offUsed, what: html`la media de las ${fmt(n - offDrop - offLow)} puntuaciones del medio, sin la mejor ni las
        ${fmt(offLow)} peores` },
      top6w: { ...aggregate(p6.top_n), what: html`${fmt(p6.top_n)} plazas, ocupadas por las mejores puntuaciones según su peso, en media ponderada` },
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
      <h2>Una puntuación Ozimut por carrera, un índice Ozimut por corredor</h2>
      <p class="mx-lead">El método Ozimut se lee en dos tiempos, como el ranking mundial de la IOF. Primero, cada carrera da una <b>puntuación Ozimut</b> a
        cada corredor. Después, el <b>índice Ozimut</b> de un corredor resume sus mejores puntuaciones Ozimut de los últimos 12 meses.</p>
      <div class="notice info" style="margin:12px 0">Por qué estas decisiones, y qué valen frente al CN oficial: <a href="#/documentation?onglet=etude" data-tab-link="etude"><b>el estudio</b></a>,
        que midió cada variante con los resultados franceses desde 2012.</div>
      <div class="mx-grid">
        <div class="mx-box" style="--c:var(--s1)"><h3>La puntuación Ozimut de una carrera</h3>
          <p>La dificultad del recorrido se mide con el nivel habitual de los corredores presentes, como hace la FFCO con su CN. La puntuación de un corredor
            es esa dificultad dividida por su tiempo.</p></div>
        <div class="mx-box" style="--c:var(--s3)"><h3>El índice Ozimut de un corredor</h3>
          <p>Sus mejores puntuaciones Ozimut de los últimos 12 meses ocupan ${fmt(p6.top_n)} plazas; el índice Ozimut es su media, y cada carrera cuenta
            según sus plazas.</p></div>
      </div>
      <p style="margin-top:14px">Todo se calcula con medias normales: cualquiera puede rehacer una puntuación o un índice a mano. Las fórmulas son las mismas en
        las cuatro disciplinas; solo cambian tres ajustes: las carreras que se tienen en cuenta y la parte de las mejores puntuaciones, porque el MTB-O y el Ski-O
        tienen muchas menos carreras, y la parte de los corredores que mide el recorrido.</p>
      <div class="table-wrap"><table class="data compact"><thead><tr><th>${t("f.terrain")}</th><th>Carreras que se tienen en cuenta</th>
        <th class="r">Mejores puntuaciones consideradas</th><th class="r">Corredores que miden el recorrido</th></tr></thead>
        <tbody>${windows.map(([tr, w, f, sf]) => html`<tr><td>${t(`terrain.${tr}`)}</td><td>${w === 365 ? "los últimos 12 meses" : `los últimos ${fmt(Math.round(w / 365))} años`}</td>
          <td class="r">el mejor ${pctOf(f)}</td><td class="r">${shareName(sf)}</td></tr>`)}</tbody></table></div>
      <p style="margin-top:14px">Las razones de cada decisión, las variantes probadas y
        las medidas que las justifican están en
        <a href="#/documentation?onglet=etude&voir=choix" data-tab-link="etude" data-goto="choix">el estudio</a>.</p>
    </section>

    <section class="mx-slide" style="--c:var(--s1)">
      <p class="mx-kicker">La puntuación Ozimut · paso 1</p>
      <h2>El nivel habitual de los corredores presentes</h2>
      <p>Como en el CN oficial, la dificultad de un recorrido se mide con los corredores presentes. Pero el método Ozimut no usa su índice Ozimut: usa
        su <b>nivel habitual</b>, tal como era ${fmt(pf.lag_days)} días antes de la carrera.</p>
      <p>El nivel habitual de un corredor es la media ponderada de su mejor ${pctOf(pf.eligible_fraction)} de puntuaciones Ozimut de los últimos 12 meses
        (70 % en dos años en MTB-O, en tres años en Ski-O), cada puntuación contada según su peso (ver el índice Ozimut más abajo), sin límite de plazas. Dice lo
        que vale el corredor normalmente. No es una clasificación: es un paso del cálculo, hecho con las carreras que el corredor ya ha corrido. El índice
        Ozimut, en cambio, solo retiene las mejores carreras: sirve para clasificar. Como en el índice Ozimut, las carreras corridas en categoría juvenil cuentan
        cada vez menos con el tiempo.</p>
      <ul class="mx-list">
        <li><span>Solo cuentan los corredores que tienen un nivel habitual en la disciplina de la carrera. Hacen falta al menos ${fmt(pf.min_ranked)} en el
          recorrido; si no, el recorrido no tiene valor y no da puntuación.</span></li>
        <li><span>El cálculo parte de los resultados de 2010, con los CN oficiales de esa primera temporada como punto de partida.</span></li>
        <li><span>Los resultados «no clasificado» (nc) y las categorías M10 y F10 no cuentan.</span></li>
      </ul>
    </section>

    <section class="mx-slide" style="--c:var(--s1)">
      <p class="mx-kicker">La puntuación Ozimut · paso 2</p>
      <h2>El valor Ozimut del recorrido</h2>
      <p>Para cada corredor, se multiplica su nivel habitual por su tiempo. El valor Ozimut del recorrido es la <b>media de esos productos para los más
        rápidos</b>: ${shareName(own(pf, "For", "sample_fraction") ?? 2 / 3)} en bosque, ${shareName(own(pf, "Spr", "sample_fraction") ?? 2 / 3)} en sprint,
        ${shareName(own(pf, "VTT", "sample_fraction") ?? 2 / 3)} en MTB-O y en Ski-O. Es la regla de la FFCO, que toma los dos tercios más rápidos,
        con una parte ajustada en cada disciplina.</p>
      <div class="mx-eq">valor Ozimut del recorrido = media de los (nivel habitual × tiempo) de los más rápidos
        <small>bosque: ${shareShort(own(pf, "For", "sample_fraction") ?? 2 / 3)} de los corredores con nivel · sprint: ${shareShort(own(pf, "Spr", "sample_fraction") ?? 2 / 3)} · MTB-O y Ski-O: ${shareShort(own(pf, "VTT", "sample_fraction") ?? 2 / 3)}; el número se redondea hacia arriba</small></div>
      <p>Los corredores más lentos de un recorrido son los que se equivocaron y los que corrieron a su nivel. Contarlos dice hasta qué punto el
        recorrido era traicionero; descartarlos dice la dificultad del recorrido corrido sin errores. La parte adecuada no es la misma en todas partes: en bosque, donde
        una carrera de cada doce se pierde por errores, casi todos los corredores aportan información; en sprint, donde los errores son la mitad de frecuentes, los más lentos enturbian la
        medida. Cada parte se eligió porque es la que mejor predice los resultados en su disciplina
        (<a href="#/documentation?onglet=etude&voir=choix" data-tab-link="etude" data-goto="choix">el estudio</a>).</p>
      <ul class="mx-list">
        <li><span>Cuando el recorrido solo tiene ${fmt(pf.min_ranked)} corredores con nivel, los ${fmt(pf.min_ranked)} cuentan, como en la regla
          oficial.</span></li>
        <li><span>Un error de tarjeta, un abandono, una descalificación o un fuera de tiempo no cuentan en el valor Ozimut del recorrido.</span></li>
      </ul>
    </section>

    <section class="mx-slide" style="--c:var(--s1)">
      <p class="mx-kicker">La puntuación Ozimut · paso 3</p>
      <h2>La puntuación</h2>
      <div class="mx-eq">puntuación Ozimut = valor Ozimut del recorrido ÷ tiempo del corredor × factor de reescalado del día</div>
      <ul class="mx-list">
        <li><span>Como en la puntuación oficial, correr un 10 % más rápido da una puntuación un 11 % más alta, y correr un 10 % más lento una puntuación un 9 % más baja.</span></li>
        <li><span>Un error de tarjeta, un abandono, una descalificación o un fuera de tiempo dan una puntuación de 0, que cuenta en el índice Ozimut.</span></li>
        <li><span>El factor de reescalado, explicado más abajo, es el del día de la carrera. La puntuación se calcula de una vez por todas y nunca se revisa.</span></li>
      </ul>
      <h3>Ejemplo: un recorrido de seis corredores</h3>
      ${r6Table("Nivel", [["Puntuación oficial", (i, tm) => n0(r6.off / tm)], ["Puntuación Ozimut en bosque", (i, tm) => n0(r6.topFor / tm)], ["Puntuación Ozimut en sprint", (i, tm) => n0(r6.topSpr / tm)]])}
      <p>Suponemos aquí que el nivel habitual de cada corredor es igual a su CN, y no tenemos en cuenta el reescalado. F se perdió: 90 minutos
        para un corredor de nivel 5000, mientras que C, del mismo nivel, tardó 62 minutos. La regla oficial mide el recorrido con los cuatro más
        rápidos, de A a D: el valor es ${n0(r6.off)}. En sprint, el método Ozimut hace lo mismo. En bosque, toma ${fmt(r6.keepFor)} corredores de seis
        (el 90 % de seis, redondeado hacia arriba), F incluido: el valor pasa a ${n0(r6.topFor)}, y A, que corrió sin errores, obtiene ${n0(r6.topFor / 50)} en lugar
        de ${n0(r6.off / 50)}. Este recorrido le costó caro a un corredor de cada seis; quien lo corrió sin errores sale recompensado. En un recorrido real de
        varias decenas de corredores, un solo error pesa mucho menos, y el reescalado devuelve el nivel general a ${fmt(pf.anchor_target)}.</p>
    </section>

    <section class="mx-slide" style="${cvar("top6w")}">
      <p class="mx-kicker">El índice Ozimut de un corredor</p>
      <h2>${fmt(p6.top_n)} plazas para las mejores carreras</h2>
      <p>Se ordenan las puntuaciones Ozimut de los últimos 12 meses de la mejor a la peor, y solo se mira el mejor ${pctOf(p6.eligible_fraction)}. Luego se ocupan
        ${fmt(p6.top_n)} plazas, empezando por la mejor puntuación. Cada carrera ocupa tantas plazas como su peso: ${fmtW(pf.weights.cdf)} plazas
        para un Campeonato de Francia, ${fmtW(pf.weights.national)} plaza para una carrera nacional (O'France, Nationale), ${fmtW(pf.weights.other)} plaza para
        cualquier otra carrera, incluidas las carreras de selección y los campeonatos de liga regional. La última carrera retenida solo ocupa las plazas que quedan.</p>
      <p>El índice Ozimut es la <b>media ponderada</b> de las puntuaciones retenidas: cada puntuación cuenta tantas veces como plazas tiene. Tomemos un Campeonato
        de Francia con 6800, que ocupa 2 plazas, y otras cuatro carreras con 6500, 6400, 6200 y 6000, que ocupan una plaza cada una. El índice Ozimut vale
        (2 × 6800 + 6500 + 6400 + 6200 + 6000) ÷ 6 = 6450.</p>
      <div class="mx-eq">índice Ozimut = Σ (plazas × puntuación) ÷ Σ plazas
        <small>como máximo ${fmt(p6.top_n)} plazas, en todas las disciplinas; una carrera corrida en categoría juvenil cuenta por plazas × (1 − su antigüedad ÷ la ventana)</small></div>
      <ul class="mx-list">
        <li><span>Los pesos dependen del nombre de la competición. Los niveles A, B, C y D de la FFCO no se utilizan.</span></li>
        <li><span><b>Las carreras de los jóvenes cuentan cada vez menos con el tiempo.</b> Una carrera corrida en categoría juvenil (M y F hasta 20 años)
          ocupa sus plazas como las demás, pero cuenta en la media por 1 − su antigüedad ÷ 12 meses (÷ dos años en MTB-O, tres en Ski-O): entera el
          día de la carrera, la mitad seis meses después, casi nada al final de la ventana. Un joven progresa rápido: sus carreras de hace diez meses
          describen a un corredor más lento. Las carreras de los adultos conservan su peso. El índice Ozimut de un joven puede, por tanto, moverse entre dos carreras.</span></li>
        <li><span>Hacen falta al menos ${fmt(pf.min_scores)} carreras en los últimos 12 meses para estar clasificado. Cuando hay menos de ${fmt(p6.top_n)} plazas
          ocupadas, el índice Ozimut es la media ponderada de lo que hay.</span></li>
        <li><span>Una vez ocupadas las ${fmt(p6.top_n)} plazas, una carrera más no puede bajar el índice Ozimut de un adulto: o bien ocupa la plaza
          de una carrera peor, o bien se queda fuera. Para ello hacen falta en general 10 carreras en 12 meses, menos con campeonatos o nacionales.
          Mientras las plazas no estén ocupadas, el índice Ozimut es una media normal, y una carrera peor que las demás lo hace bajar. Para un
          joven, una carrera reciente pesa más que las antiguas a las que sustituye: si es peor que ellas, puede bajar su índice Ozimut.</span></li>
      </ul>
    </section>

    <section class="mx-slide">
      <p class="mx-kicker">El reescalado</p>
      <h2>Un factor por día, nunca revisado</h2>
      <p>Sin corrección, el nivel general de los CN subiría poco a poco de un año a otro; el estudio explica por qué. El reescalado corrige esa
        deriva: cada puntuación Ozimut se multiplica por un factor, el mismo para todas las carreras de un mismo día en una misma disciplina.</p>
      <ul class="mx-list">
        <li><span>El factor se elige para que la media del ${pctOf(pf.anchor_top_fraction)} de los mejores índices Ozimut de cada disciplina se mantenga en
          ${fmt(pf.anchor_target)}, la regla de la FFCO desde 2026. Cambia un poco cada día, en lugar de una vez al año.</span></li>
        <li><span>Para calcularlo, se mide el nivel de los índices Ozimut ${fmt(pf.anchor_lag_months)} meses antes, en media sobre 13 meses, y luego se prolonga
          10 meses, al ritmo al que subió durante los últimos diez años. Los meses se cuentan según el calendario: un mes sin carreras conserva el nivel
          del mes anterior. El factor se calcula para cada mes; entre dos meses, pasa en línea recta de uno a otro. La regla es la misma
          en las cuatro disciplinas.</span></li>
        <li><span>El factor de una carrera se fija de una vez por todas. Por tanto, un índice Ozimut solo cambia cuando una carrera entra en los últimos 12 meses o
          sale de ellos, nunca por el reescalado.</span></li>
      </ul>
      <div style="margin-top:16px">${chartCard({ id: "norm", title: "El factor de reescalado", hint: "El factor aplicado a la puntuación Ozimut de una carrera, según su día y su disciplina", short: true })}</div>
    </section>

    <section class="mx-slide">
      <p class="mx-kicker" style="--c:var(--s3)">Ilustración</p>
      <h2>Mismas puntuaciones, valores distintos</h2>
      <p class="mx-lead">Un corredor ha corrido ${fmt(n)} carreras en 12 meses. Estas son sus puntuaciones, de la mejor a la peor. La mejor, ${fmt(EXAMPLE[0][0])}, es
        un Campeonato de Francia (★); ${fmt(EXAMPLE[2][0])} es una carrera nacional. Esto es lo que cada cálculo retiene de esas mismas puntuaciones.</p>
      ${["official", "top6w"].map((m) => html`<div class="mx-agg" style="${cvar(m)}">
        <div><b>${methodKey(m)} ${exLabel(m)}</b><div class="what">${EX[m].what}</div></div>
        ${chips(m)}
        <div class="cn">${fmt(EX[m].cn)}</div></div>`)}
      <p class="muted" style="font-size:13px">Los números en superíndice (×2, ×1,5) son las plazas que ocupa la carrera. El ejemplo aplica cada regla a las
        mismas puntuaciones. En realidad, la puntuación oficial y la puntuación Ozimut de una misma carrera difieren, ya que el valor del recorrido no se calcula de la misma
        manera.</p>
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
    const YES = (x) => mark("yes", "sí", x), NO = (x) => mark("no", "no", x), PART = (x) => mark("part", "en parte", x);
    const CRIT = [
      ["Cuenta los campeonatos y las nacionales", (m) => (m === "official" ? NO("a menudo descartados") : YES("pesan más"))],
      ["Una carrera más no baja el CN", (m) => (m === "official" ? NO("a menudo sí") : PART("para un adulto, una vez ocupadas las 6 plazas"))],
      ["Refleja el nivel en las grandes competiciones", (m) => (m === "official" ? NO("sin el 10 % de las mejores") : YES("las mejores carreras"))],
      ["Sigue la progresión rápida de los jóvenes", (m) => (m === "official" ? NO("su CN va con retraso: una carrera de hace un año cuenta lo mismo") : YES("sus carreras antiguas se desvanecen, en el índice como en la medida de los recorridos"))],
      ["Estable de un año a otro", (m) => (m === "official" ? NO("salto el 1 de enero") : YES("reescalado progresivo"))],
      ["Fácil de explicar", (m) => (m === "official" ? YES() : YES("medias normales"))],
      ["Es la que vale para las selecciones", (m) => (m === "official" ? YES("única clasificación oficial") : NO("cálculo de análisis"))],
    ];
    const noStudy = html`<p class="muted">Las cifras del estudio no están disponibles por el momento.</p>`;
    const pts = (a) => (a ? html`${ci(a)} punto` : "—");
    const cell = (a) => (a ? html`${sg(a[0], 2)}${est(a) ? "*" : ""}` : "—");
    const SC = ["all_holdout", "nat_holdout", "all_tuned"];
    const SCH = ["Todas las carreras<br>2012–2024", "Carreras nacionales<br>2012–2024", "Todas las carreras<br>desde julio de 2025"];
    const share = (tr) => L?.share?.[tr]?.rows || [];
    const picked = (tr) => L?.picked?.[tr];

    const CH = {
      objectifs: () => html`
        <section class="mx-slide mx-hero">
          <p class="mx-kicker">El estudio</p>
          <h2>Un índice fácil de entender, que cuenta tus mejores carreras y predice mejor los resultados</h2>
          <p class="mx-lead">Este capítulo explica por qué se creó el método Ozimut, cómo se evaluó, qué ideas se probaron y
            cuáles se adoptaron. Llega al método Ozimut: el más sencillo de los que mejor predicen.</p>
          ${hf && hs ? html`<div class="mx-stats">
            <div class="mx-stat"><b>${lvl(hf, "acc", "official")} % y luego ${lvl(hf, "acc", "top6w")} %</b><span>de los duelos bien predichos en bosque por el CN
              oficial, y luego por el índice Ozimut. Un duelo son dos corredores de un mismo recorrido; está bien predicho cuando el que tenía el mejor valor
              llega delante.</span></div>
            <div class="mx-stat"><b>${lvl(hs, "acc", "official")} % y luego ${lvl(hs, "acc", "top6w")} %</b><span>de los duelos bien predichos en sprint, en las
              mismas temporadas.</span></div>
            <div class="mx-stat"><b>${lvl(hf, "r2", "official")} % y luego ${lvl(hf, "r2", "top6w")} %</b><span>de las diferencias de tiempo entre corredores de un mismo
              recorrido explicadas en bosque por el CN oficial, y luego por el índice Ozimut.</span></div>
            <div class="mx-stat"><b>${fmt(ev.rows.For.all.holdout.comps + ev.rows.Spr.all.holdout.comps)}</b><span>competiciones de ${ev.holdout[0]} a
              ${ev.holdout[1]}, apartadas durante la puesta a punto de los métodos y utilizadas solo para juzgarlos.</span></div>
          </div>` : ""}
          <p style="margin-top:18px"><a class="mx-dl" href="${PDF}" download>⬇ Descargar el estudio en PDF (libro blanco)</a></p>
        </section>
        <section class="mx-slide">
          <p class="mx-kicker">El punto de partida</p>
          <h2>El CN sirve para dos cosas distintas</h2>
          <div class="mx-grid">
            <div class="mx-box" style="--c:var(--s1)"><h3>Medir la dificultad de los recorridos</h3>
              <p>Para saber si un recorrido fue duro, hay que conocer el <b>nivel habitual</b> de los corredores presentes, sin que un mal día o una
                hazaña aislada lo deformen.</p></div>
            <div class="mx-box" style="--c:var(--s3)"><h3>Clasificar a los corredores</h3>
              <p>Para clasificarse para los Campeonatos de Francia, hay que saber de qué es capaz un corredor <b>en una gran competición</b>, y por tanto
                mirar sus mejores carreras.</p></div>
          </div>
          <div class="mx-callout">El ${cnLabel("official")} sirve para ambos usos: es adecuado para el primero y perjudica al segundo. El método Ozimut los separa. La
            <b>puntuación Ozimut</b> de una carrera se mide con el nivel habitual de los corredores presentes; el <b>índice Ozimut</b> de un corredor retiene sus mejores carreras.</div>
        </section>
        <section class="mx-slide">
          <p class="mx-kicker">Los objetivos</p>
          <h2>Lo que debe hacer el método</h2>
          <ul class="mx-list">
            <li><span>Partir de los <b>mismos resultados y de la misma puntuación de carrera</b> que la FFCO, para que cualquiera pueda entenderlo y comprobarlo.</span></li>
            <li><span><b>Contar los Campeonatos de Francia y las carreras nacionales</b>, que el método oficial descarta a menudo, porque descarta el
              10 % de las mejores carreras.</span></li>
            <li><span><b>No penalizar al corredor que corre una carrera más</b>: una vez colocadas sus mejores carreras, una carrera más no
              debe bajar su CN.</span></li>
            <li><span><b>Suprimir el salto del 1 de enero</b>, para poder seguir a un corredor a lo largo de varias temporadas.</span></li>
            <li><span><b>Seguir a los jóvenes que progresan rápido</b>: el nivel de un joven sube de una temporada a otra, y sus carreras
              de hace diez meses describen a un corredor más lento. Su índice debe seguir su progresión; si no, lo clasifica demasiado bajo y hace parecer
              más fáciles los recorridos en los que corre.</span></li>
            <li><span><b>Predecir mejor los resultados</b>, y demostrarlo con una medida fiable.</span></li>
            <li><span><b>Seguir siendo fácil de explicar</b>: medias normales, una regla común, no un modelo ajustado corredor por corredor. Cuando
              una variante más sofisticada solo gana unas centésimas de punto, se impone la regla sencilla.</span></li>
          </ul>
        </section>`,

      depart: () => html`
        <section class="mx-slide" style="${cvar("official")}">
          <p class="mx-kicker">${methodKey("official")} ${methodLabel("official")}</p>
          <h2>La referencia: sólida para medir, poco adecuada para clasificar</h2>
          <div class="mx-grid">
            <div><h3 style="margin-top:4px">Lo que hace bien</h3><ul class="mx-list">
              <li><span>Es la que vale: es la <b>única clasificación oficial</b>, la de las selecciones.</span></li>
              <li><span>Descarta las puntuaciones extremas, en los dos sentidos: es una buena medida del <b>nivel habitual</b>, útil para medir la
                dificultad de los recorridos.</span></li>
              <li><span>Su regla es pública y sencilla.</span></li>
              <li><span>Da a cada corredor una <b>medida de su rendimiento respecto a los demás</b>, carrera tras carrera.</span></li>
              <li><span><b>Anima a todos a progresar</b>: cada carrera cuenta, y la clasificación muestra los progresos.</span></li>
              <li><span><b>Puso en marcha la recopilación de los resultados de las competiciones</b>, desde hace muchos años; todos esos resultados han sido públicos en un
                momento u otro. Sin ese trabajo, no existirían ni este sitio ni este estudio.</span></li>
            </ul></div>
            <div><h3 style="margin-top:4px">Lo que hace peor</h3><ul class="mx-list bad">
              <li><span><b>Descarta el 10 % de las mejores carreras.</b> Para los mejores corredores, suelen ser los Campeonatos de Francia y
                las nacionales: las carreras que preparan, y las de más nivel.</span></li>
              <li><span><b>Evalúa el rendimiento habitual más que el rendimiento potencial</b>, más pertinente para
                clasificarse para los campeonatos.</span></li>
              <li><span><b>No anima a correr.</b> Para un corredor bien clasificado, una carrera más a menudo baja el CN. Algunos se detienen
                en cuanto tienen el CN que los clasifica para un Campeonato de Francia; otros solo corren las carreras que consideran «rentables».</span></li>
              <li><span><b>Un salto cada 1 de enero</b>, y reglas que han cambiado con las temporadas: no se pueden comparar los CN de un
                año a otro.</span></li>
              <li><span><b>Todas las carreras pesan lo mismo</b>, de un Campeonato de Francia a una regional.</span></li>
              <li><span><b>Los jóvenes progresan más rápido que su CN.</b> Una carrera de hace diez meses cuenta lo mismo que la de la semana
                pasada: el CN de un joven que progresa va por detrás de su nivel, lo clasifica demasiado bajo y hace parecer más fáciles los recorridos en los que corre.</span></li>
            </ul></div>
          </div>
        </section>
        <section class="mx-slide">
          <p class="mx-kicker">De un vistazo</p>
          <h2>Cada método, criterio por criterio</h2>
          <div class="table-wrap"><table class="mx-matrix">
            <thead><tr><th></th>${M.map((m) => html`<th>${methodKey(m)}${methodShort(m)}</th>`)}</tr></thead>
            <tbody>${CRIT.map(([label, cell]) => html`<tr><td>${label}</td>${M.map((m) => html`<td>${cell(m)}</td>`)}</tr>`)}</tbody>
          </table></div>
        </section>
        <section class="mx-slide">
          <p class="mx-kicker" style="--c:var(--s3)">Lo que cambia el método Ozimut</p>
          <h2>Mismos resultados, mismos tiempos, otro cálculo</h2>
          <div class="mx-fix">
            <div class="head">Método oficial</div><div></div><div class="head">Método Ozimut</div>
            <div class="p"><b>Se descartan las mejores carreras</b>a menudo los campeonatos de Francia y las carreras nacionales</div><div class="arrow">→</div>
            <div class="s"><b>Las mejores carreras son las que más cuentan</b>un campeonato de Francia cuenta doble, una carrera nacional una vez y media; solo
              se dejan de lado las carreras menos buenas</div>
            <div class="p"><b>Una carrera más puede bajar el CN</b>lo que disuade de correr</div><div class="arrow">→</div>
            <div class="s"><b>Una vez llenas las ${fmt(p6.top_n)} plazas, una carrera más ya no puede bajar el CN de un adulto</b>las plazas se llenan con
              las mejores carreras: cuanto más corres, más posibilidades tienes de llenarlas bien</div>
            <div class="p"><b>El recorrido medido sobre los dos tercios más rápidos</b>los corredores que se equivocaron no cuentan, y orientarse bien
              en un recorrido traicionero da menos que en otros</div><div class="arrow">→</div>
            <div class="s"><b>La parte del pelotón, fijada por disciplina</b>en bosque, el 90 % de los corredores: la dificultad de un recorrido incluye
              los errores que provoca, y evitarlos tiene premio; en sprint, los dos tercios, como la FFCO</div>
            <div class="p"><b>Un salto cada 1 de enero</b>toda la clasificación cambia de golpe</div><div class="arrow">→</div>
            <div class="s"><b>Un reescalado progresivo, día a día</b>la puntuación de una carrera se fija de una vez por todas, y el índice de un adulto solo
              cambia cuando una carrera entra en los últimos 12 meses o sale de ellos</div>
            <div class="p"><b>El CN de un joven va por detrás de sus progresos</b>su carrera de hace once meses cuenta tanto como la de ayer, aunque entonces
              corría mucho más despacio</div><div class="arrow">→</div>
            <div class="s"><b>Las carreras de los jóvenes se desvanecen con el tiempo</b>una carrera corrida en categoría juvenil cuenta cada vez menos a lo largo de los
              12 meses: el índice de un joven sigue su progresión mucho más deprisa, y sus recorridos se miden mejor</div>
            <div class="p"><b>Un solo CN para dos usos</b>medir los recorridos y clasificar a los corredores</div><div class="arrow">→</div>
            <div class="s"><b>Un cálculo para cada uso</b>el valor de un recorrido se mide a partir de las puntuaciones que los corredores presentes obtuvieron
              en sus carreras anteriores; el índice Ozimut retiene sus mejores carreras</div>
          </div>
        </section>`,

      mesure: () => html`
        <section class="mx-slide mx-hero">
          <p class="mx-kicker">La prueba</p>
          <h2>Antes de la carrera, ¿quién es el favorito? Después, ¿quién terminó delante, y con qué diferencia?</h2>
          <p class="mx-lead">Un buen CN debe anunciar los resultados. Para cada corredor tomamos el CN que tenía <b>15 días antes</b> de la carrera: ese
            CN no sabe nada de la carrera. Después miramos, recorrido por recorrido, si esos CN anunciaban el orden de llegada y las diferencias de tiempo. Todos los
            métodos se juzgan sobre los mismos corredores: los que tenían un CN en cada uno de ellos.</p>
        </section>
        <section class="mx-slide">
          <p class="mx-kicker">Primera medida</p>
          <h2>La parte de duelos bien predichos</h2>
          <p>En un recorrido, cada pareja de corredores forma un <b>duelo</b>: hay 45 duelos entre 10 corredores, y 11 175 entre 150 corredores. El CN predice
            bien un duelo cuando el corredor que tenía el CN más alto termina delante del otro. Cuando los dos CN son iguales, el duelo cuenta la mitad.</p>
          <p>Un CN elegido al azar predeciría bien la mitad de los duelos, es decir, el 50 %. Ningún CN puede predecirlos todos, porque la forma del día y los errores
            deciden una parte de los resultados.</p>
          <div class="mx-eq">parte de duelos bien predichos = duelos bien predichos ÷ número de duelos
            <small>calculada para cada recorrido y luego promediada sobre todos los recorridos, cada uno con el peso de su número de corredores</small></div>
          <p><b>Por qué cada recorrido pesa según su número de corredores.</b> Cada corredor se enfrenta a todos los demás corredores de su recorrido. La parte de sus
            duelos bien predichos dice si el CN lo situó bien entre ellos. Al promediar esa parte sobre todos los corredores de la temporada, se obtiene
            exactamente la media de los recorridos ponderada por su número de corredores: cada resultado cuenta una vez. Contar cada duelo una vez daría
            demasiado peso a los recorridos grandes, ya que un recorrido de 150 corredores pesaría tanto como 250 recorridos de 10 corredores. Contar cada recorrido una
            vez daría demasiado peso a los pequeños, ya que un recorrido de 5 corredores pesaría tanto como un recorrido de un campeonato de Francia.</p>
          <p><b>La relación con la τ de Kendall.</b> Los estadísticos miden la concordancia entre dos clasificaciones con la «τ de Kendall»: la parte de duelos
            bien predichos menos la parte de duelos mal predichos. Con un 80 % de duelos bien predichos, y por tanto un 20 % mal predichos, τ vale 0,80 − 0,20 = 0,60.
            Es la misma medida en otra escala: τ vale 0 para un CN elegido al azar y 1 para un orden perfecto. Este documento da la parte de
            duelos, más fácil de entender.</p>
          ${hf ? html`<p>En bosque, de ${ev.holdout[0]} a ${ev.holdout[1]}, el CN oficial predice bien el ${lvl(hf, "acc", "official")} % de los duelos y el índice Ozimut
            el ${lvl(hf, "acc", "top6w")} %. Así pues, el CN oficial se equivoca en el ${fmt(100 * (1 - hf.acc.official), 1)} % de los duelos, y el índice Ozimut en el
            ${fmt(100 * (1 - hf.acc.top6w), 1)} %: es decir, un ${fmt(Math.round(100 * (1 - (1 - hf.acc.top6w) / (1 - hf.acc.official))))} % menos de errores.
            Las diferencias entre las variantes probadas durante el estudio son a menudo de unas pocas décimas de punto.</p>` : ""}
        </section>
        <section class="mx-slide">
          <p class="mx-kicker">Segunda medida</p>
          <h2>Las diferencias de tiempo explicadas</h2>
          <p>El orden de llegada no lo dice todo: terminar 10 segundos o 10 minutos detrás de otro corredor no es lo mismo. Ahora bien, un CN se lee como
            una velocidad: un corredor cuyo CN es un 10 % más alto debería correr aproximadamente un 10 % más rápido. Por eso, en cada recorrido comparamos el tiempo de cada
            corredor con el tiempo que anunciaba su CN.</p>
          <ul class="mx-list">
            <li><span><b>Los tiempos se comparan en proporción.</b> Perder 5 minutos en un sprint de 15 minutos no es lo mismo que perder 5 minutos
              en una larga distancia de 90 minutos. Por eso las diferencias se miden en porcentaje del tiempo, y no en minutos.</span></li>
            <li><span><b>La parte explicada</b>, escrita R², dice qué parte de las diferencias de tiempo entre los corredores de un mismo recorrido anunciaba el CN: 0 %
              si el CN no anuncia nada, 100 % si cada corredor tardó exactamente el tiempo anunciado. Aquí también, cada resultado cuenta una vez.</span></li>
            <li><span><b>La regla que traduce una diferencia de CN en una diferencia de tiempo se aprende con la temporada anterior.</b> Así, cada temporada se predice sin
              haberla mirado, como se predeciría la temporada que viene.</span></li>
          </ul>
          ${more("La fórmula", html`<div class="mx-eq">ln(tiempo) = constante del recorrido − b × ln(CN) + desviación
            <small>ln: el logaritmo, que transforma los cocientes en diferencias. La constante tiene en cuenta la longitud y la dificultad del recorrido;
              b, cercano a 1, se aprende con la temporada anterior. R² = 1 − (suma de las desviaciones²) ÷ (suma de las desviaciones de ln(tiempo) respecto a la media del recorrido)².</small></div>`)}
        </section>
        <section class="mx-slide">
          <p class="mx-kicker">El margen de incertidumbre</p>
          <h2>¿Una diferencia es real o se debe al azar de las carreras?</h2>
          <p>Las carreras de una temporada son solo una muestra de todas las carreras posibles. Con otras carreras, la diferencia entre dos métodos habría sido
            algo distinta. Para saber cuánto, repetimos el cálculo ${ev ? fmt(ev.boot) : "2000"} veces sobre temporadas sorteadas. Cada sorteo
            toma tantas competiciones como la temporada real, elegidas al azar entre ellas: algunas salen dos veces, otras ninguna.</p>
          <ul class="mx-list">
            <li><span><b>El intervalo al 95 %</b>, escrito entre corchetes después de cada diferencia, va de la menor a la mayor diferencia obtenida en el 95 % de esos
              sorteos. Por ejemplo, «+0,40 [+0,35; +0,44]» quiere decir que la diferencia medida es de 0,40 puntos, y que el 95 % de los sorteos da entre 0,35 y
              0,44 puntos.</span></li>
            <li><span><b>Una diferencia se llama significativa cuando su intervalo no contiene el 0.</b> Casi todos los sorteos dan entonces una diferencia del mismo
              signo: el azar de las carreras no basta para explicarla. Cuando el intervalo contiene el 0, por ejemplo [−0,02; +0,01], no se puede decir
              cuál de los dos métodos es mejor.</span></li>
            <li><span><b>Se sortean competiciones enteras, no duelos.</b> Los corredores de una misma carrera comparten el terreno, el mapa y el tiempo que hace:
              sus duelos no son independientes. Sortearlos uno a uno daría intervalos demasiado estrechos, y por tanto demasiado optimistas.</span></li>
            <li><span><b>Los métodos se comparan sobre los mismos corredores y las mismas carreras</b>, carrera por carrera.</span></li>
            <li><span><b>Temporadas reservadas.</b> Los ajustes se eligieron sobre el periodo de julio de 2025 a octubre de 2026. Las temporadas
              ${ev ? `${ev.holdout[0]} a ${ev.holdout[1]}` : "2012 a 2024"} solo sirvieron para juzgar: los ajustes no pudieron adaptarse a sus
              particularidades, como un examen hecho de preguntas nunca vistas en el entrenamiento.</span></li>
            <li><span>Cada variante se recalcula desde 2010 sobre una copia de la base de datos, con su propio reescalado. Los CN de 15 días antes de la
              carrera son los que habría publicado.</span></li>
          </ul>
          <p class="muted" style="font-size:13px">Las tablas
            del 6 y del 7 de octubre, plegadas en los capítulos siguientes, proceden de la puesta a punto: en ellas cada duelo contaba una vez, sin intervalo.</p>
        </section>`,

      choix: () => html`
        <section class="mx-slide mx-hero">
          <p class="mx-kicker">Las decisiones</p>
          <h2>Cada ajuste se midió, y se conservó la regla más sencilla cuando funciona igual de bien</h2>
          <p class="mx-lead">Cada variante se recalculó desde 2010 sobre una copia de la base de datos y luego se juzgó como el método elegido, sobre
            los mismos corredores. Las diferencias están en puntos de duelos bien predichos, de 2012 a 2024 salvo indicación contraria; un asterisco o un intervalo que no
            contiene el 0 marcan una diferencia significativa.</p>
        </section>
        <section class="mx-slide">
          <p class="mx-kicker">Los pesos y las plazas</p>
          <h2>Las mejores carreras cuentan, cada una según su importancia</h2>
          <ul class="mx-list">
            <li><span><b>El peso de una carrera depende del nombre de la competición.</b> Un campeonato de Francia tiene un peso de ${fmtW(pf.weights.cdf)}: es la
              carrera de más nivel, la que preparan los corredores, y cuenta como dos carreras. Una carrera nacional tiene un peso de
              ${fmtW(pf.weights.national)}, cualquier otra carrera un peso de ${fmtW(pf.weights.other)}. Los niveles A, B, C y D de la FFCO no se utilizan.</span></li>
            <li><span><b>${fmt(p6.top_n)} plazas</b>, llenadas de la mejor puntuación a la menos buena. Una vez llenas las plazas, una carrera más no puede bajar el CN de un adulto.
              La clasificación mundial de la IOF funciona igual, con las cinco mejores carreras. Diez plazas no daban mejor resultado; cuatro
              daban peor (−0,24 puntos en bosque).</span></li>
            <li><span><b>Solo puede contar el ${pctOf(pf.eligible_fraction)} de mejores puntuaciones</b> de los últimos 12 meses, tanto para el índice Ozimut como para el
              nivel habitual, y hacen falta al menos ${fmt(pf.min_scores)} carreras. Las puntuaciones que se dejan de lado son, en su mayoría, las carreras en las que el corredor
              se equivocó. Tener en cuenta el 70 o el 80 % de las puntuaciones costaba de 0,4 a 1 punto; el 50 % daba lo mismo. Exigir cinco carreras reducía el número de
              corredores que miden los recorridos; conformarse con dos clasificaba a más corredores, pero costaba de 0,1 a 0,4 puntos.</span></li>
          </ul>
          ${L?.eligible_grid ? html`<p>La parte de puntuaciones que forma el nivel habitual se midió aparte, manteniendo el índice Ozimut su 60 %: en bosque, frente al
            60 % mejor, el 50 % da ${pts(L.eligible_grid.For[50].all_holdout)}, el 70 % ${pts(L.eligible_grid.For[70].all_holdout)}, el 80 %
            ${pts(L.eligible_grid.For[80].all_holdout)} y todas las puntuaciones ${pts(L.eligible_grid.For[100].all_holdout)}. En sprint, del 50 al 80 % dan lo mismo.
            Los errores de un corredor deben quedar fuera del nivel que mide los recorridos.</p>` : ""}
        </section>
        <section class="mx-slide">
          <p class="mx-kicker">El nivel habitual</p>
          <h2>Los recorridos se miden con el nivel habitual, no con los índices Ozimut</h2>
          <p>La clasificación mundial de la IOF mide una carrera según los puntos de clasificación de los corredores presentes. Aquí no es posible con los
            índices Ozimut, porque solo retienen las mejores carreras: se alimentarían de sí mismos. Un grupo que corre sobre todo entre sí, como los
            veteranos o los jóvenes, tendría CN inflados, sus recorridos parecerían más difíciles y sus CN subirían aún más. En los
            primeros ensayos, los M/F 21 quedaban así infravalorados en torno a un 13 %.</p>
          <p>Por eso los recorridos se miden con el nivel habitual: la media ponderada del ${pctOf(pf.eligible_fraction)} de mejores puntuaciones, sin límite de
            plazas. ${S ? html`Medidos con los índices Ozimut, los duelos se predecirían peor (${ci(S.onecn?.For?.all_holdout?.ST6_t)} puntos de 2012 a 2024,
            ${ci(S.onecn?.For?.all_tuned?.ST6_t)} desde julio de 2025, una pérdida que crece con las temporadas), y los jóvenes quedarían sobrevalorados un
            ${fmt(Math.abs(calib("For", "young", "ST6_t")?.[0] ?? 1.4), 1)} % frente a los M/F 21.` : ""}</p>
        </section>
        ${S?.jeunes ? html`<section class="mx-slide" style="${cvar("top6w")}">
          <p class="mx-kicker">Las carreras de los jóvenes</p>
          <h2>Un joven progresa deprisa: sus carreras antiguas cuentan cada vez menos</h2>
          <p>El CN de un joven va por detrás de su nivel. Un año y medio después, el nivel habitual de un joven ha subido un 22 % en bosque, y el de un adulto
            un 11 % (incluida la subida general de la escala): sus carreras de hace diez meses describen a un corredor más lento. Una carrera corrida en categoría juvenil (M y F hasta 20 años) cuenta en la media por 1 − su antigüedad ÷ la ventana, mientras que las carreras de los adultos
            conservan su peso; tanto en el nivel habitual, que mide los recorridos, como en el índice Ozimut.</p>
          <ul class="mx-list">
            <li><span><b>Bosque</b>: ${pts(S.jeunes.J.For.holdout)} de 2012 a 2024, mejor en ${S.jeunes.J.For.better} temporadas de ${S.jeunes.J.For.seasons},
              ${pts(S.jeunes.J.For.tuned)} desde julio de 2025.</span></li>
            <li><span><b>Sprint</b>: ${pts(S.jeunes.J.Spr.holdout)} de 2012 a 2024, nada significativo desde julio de 2025
              (${ci(S.jeunes.J.Spr.tuned)}).</span></li>
            <li><span><b>MTB-O</b>: ${pts(S.jeunes.J.VTT.holdout)} de 2012 a 2024, ${pts(S.jeunes.J.VTT.tuned)} desde julio de 2025.</span></li>
          </ul>
          <p>Envejecer las carreras de todos los corredores aporta poco: como mucho ${pts(S.jeunes.adults_best.For.holdout)} en bosque (el peso dividido entre
            dos cada seis meses), y nada más una vez desvanecidas las carreras de los jóvenes (${pts(S.jeunes.adults_and_juniors.For.holdout)} con ambas cosas,
            ${pts(S.jeunes.J.For.holdout)} solo con los jóvenes). El nivel de un adulto cambia poco de una temporada a otra: una carrera del año pasado todavía
            dice algo de él. Una ventana de dos años da ${pts(S.jeunes.window24.For.holdout)} en bosque; desvanecer las carreras solo en el índice Ozimut, sin
            tocar el nivel habitual, ${pts(S.jeunes.top_only.For.holdout)}. El precio: en bosque, los jóvenes aparecen como favoritos frente a los
            M/F 21-34 algo más a menudo de lo que terminan delante (${sg(S.jeunes.J.For.junior_bias[0], 1)} puntos antes, ${sg(S.jeunes.J.For.junior_bias[1], 1)} después); en
            sprint y en MTB-O, donde estaban infravalorados, la diferencia se reduce.</p>
        </section>` : ""}
        ${S?.ecarts ? html`<section class="mx-slide">
          <p class="mx-kicker">Los corredores lejos de su nivel</p>
          <h2>Excluirlos de la medida de los recorridos no merece la pena</h2>
          <p>En un recorrido, algunos corredores terminan lejos de lo que su nivel habitual hacía prever: mucho más rápido, a menudo jóvenes que progresan
            cuyo nivel era, en efecto, demasiado bajo (un año después, entre un 17 y un 19 % por encima de los demás corredores de su edad), o mucho más lento, tras un
            error. El estudio del 18 de octubre de 2026 probó, con 28 reglas, a excluirlos del valor del recorrido: por un lado o por los dos, más allá de un umbral o
            en una parte fija, y también a dejar de permitir que los jóvenes midan los recorridos.</p>
          <ul class="mx-list">
            <li><span><b>Excluir solo a los más rápidos</b> hace subir los recorridos de los jóvenes, y con ellos sus CN, y con ellos la medida de sus recorridos siguientes: en
              bosque, los recorridos de los jóvenes acaban hasta un ${fmt(S.ecarts.loop_fast_25[0], 0)} % por encima de los de los adultos, y la predicción empeora
              (${pts(S.ecarts.fast_25.For.holdout)}, ${pts(S.ecarts.fast_5.For.holdout)} con el umbral del 5 %).</span></li>
            <li><span><b>Excluir los dos lados</b> cuesta en bosque (${pts(S.ecarts.both_25.For.holdout)}); en sprint, sumado a la exclusión de los jóvenes, gana
              ${pts(S.ecarts.both_and_no_juniors.Spr.holdout)}, y ${pts(S.ecarts.both_and_no_juniors.VTT.holdout)} en MTB-O.</span></li>
          </ul>
          <p>Esas ganancias exigirían dos reglas más en la medida de los recorridos, que habría que explicar y mantener, para corregir el mismo defecto que
            el desvanecimiento de las carreras de los jóvenes: un CN de joven que va por detrás de su nivel. El método mantiene la medida de los recorridos tal cual y trata ese
            retraso donde nace: en el CN.</p>
        </section>` : ""}
        <section class="mx-slide" style="${cvar("top6w")}">
          <p class="mx-kicker">El valor del recorrido</p>
          <h2>Qué parte del pelotón mide el recorrido</h2>
          <p>La regla de la FFCO mide un recorrido sobre los dos tercios más rápidos. El último tercio reúne a corredores más flojos, que corrieron a
            su nivel, y a corredores que se equivocaron. Al excluirlos, se mide la dificultad del recorrido corrido casi sin errores; pero algunos
            recorridos provocan muchos más errores que otros, y en esos recorridos todas las puntuaciones salen demasiado bajas. En bosque, el valor medido sobre todo el
            pelotón supera al de los dos tercios en un 4,8 % de media, pero casi nada en uno de cada diez recorridos y más de un 10 % en otro de cada diez;
            en sprint, un 2,8 %.</p>
          <p>Por eso la parte de los más rápidos se fijó en cada disciplina con un único criterio: la parte que mejor predice los duelos de 2012 a 2024,
            sin pérdida significativa desde julio de 2025.</p>
          ${L ? html`<div class="table-wrap"><table class="data compact"><thead><tr><th class="r">Parte del pelotón</th>
            ${["For", "Spr", "VTT"].map((tr) => html`<th class="r">${t(`terrain.${tr}`)}<br>2012–2024</th><th class="r">${t(`terrain.${tr}`)}<br>desde 2025</th>`)}</tr></thead>
            <tbody>${share("For").map((r0) => html`<tr><td class="r">${r0.pct === 67 ? "los dos tercios (FFCO)" : r0.pct === 100 ? "todo el pelotón" : `${fmt(r0.pct)} %`}</td>
              ${["For", "Spr", "VTT"].map((tr) => { const r = share(tr).find((x) => x.pct === r0.pct); const on = picked(tr) === r0.pct;
                return r ? html`<td class="r num">${on ? html`<b>${cell(r.all_holdout)}</b>` : cell(r.all_holdout)}</td><td class="r num">${on ? html`<b>${cell(r.all_tuned)}</b>` : cell(r.all_tuned)}</td>` : html`<td class="r">—</td><td class="r">—</td>`; })}</tr>
              ${r0.pct === 85 ? (L.forest90 ? html`<tr><td class="r"><b>90 %</b></td><td class="r num"><b>${sg(L.share.For.rows.find((x) => x.pct === 100).all_holdout[0] + L.forest90.vs100.all_holdout[0], 2)}*</b></td>
                <td class="r num"><b>${sg(L.share.For.rows.find((x) => x.pct === 100).all_tuned[0] + L.forest90.vs100.all_tuned[0], 2)}*</b></td><td class="r">—</td><td class="r">—</td><td class="r">—</td><td class="r">—</td></tr>` : "") : ""}`)}

            </tbody></table></div>
          <p class="muted" style="font-size:13px">Diferencia en la parte de duelos bien predichos, en puntos, frente a los dos tercios más rápidos, con el método Ozimut
            (medias ordinarias, reescalado prolongado). Un asterisco marca una diferencia significativa; en negrita, la parte elegida. El Ski-O sigue al MTB-O: tiene demasiado
            pocas carreras para poder medirse.</p>
          <ul class="mx-list">
            <li><span><b>Bosque: 90 %.</b> Cuanto mayor es la parte, mejor predice el método: todo el pelotón gana ${pts(share("For").find((x) => x.pct === 100)?.all_holdout)}
              sobre los dos tercios, y el 90 % gana además ${pts(L.forest90?.vs100?.all_holdout)} sobre todo el pelotón (${pts(L.forest90?.vs100?.nat_holdout)} en las
              carreras nacionales), mejor en ${fmt(L.forest90?.vs100?.better ?? 0)} temporadas de 15, peor en ${fmt(L.forest90?.vs100?.worse ?? 0)}.
              La última décima parte del pelotón son las carreras muy malas: dejarlas de lado no quita nada a la medida del recorrido, y evita que un
              solo corredor perdido la condicione.</span></li>
            <li><span><b>Sprint: los dos tercios</b>, la regla de la FFCO. Nada da mejor resultado en las quince temporadas; el 75 % pierde un poco, todo el pelotón
              ${pts(share("Spr").find((x) => x.pct === 100)?.all_holdout)}. Allí los errores son la mitad de frecuentes que en bosque, y los más lentos dicen
              menos del recorrido que de sí mismos.</span></li>
            <li><span><b>MTB-O: 75 %.</b> El 85 % da el mejor resultado de 2012 a 2024 (${pts(share("VTT").find((x) => x.pct === 85)?.all_holdout)}), pero pierde
              ${pts(share("VTT").find((x) => x.pct === 85)?.all_tuned)} desde julio de 2025; el 75 % gana ${pts(share("VTT").find((x) => x.pct === 75)?.all_holdout)}
              y no pierde nada significativo desde entonces. <b>Ski-O: 75 %</b>, como el MTB-O.</span></li>
          </ul>` : noStudy}
        </section>
        <section class="mx-slide">
          <p class="mx-kicker">El reescalado</p>
          <h2>Un factor prolongado al ritmo de la subida del nivel</h2>
          <p>El CN de un corredor está hecho de sus mejores carreras: queda un poco por encima de sus carreras normales. Los recorridos siguientes se miden con
            esos niveles algo altos, sus puntuaciones salen algo más altas, y también los CN que se derivan de ellas: antes del reescalado, el nivel general sube
            unas décimas de punto porcentual al mes. El reescalado lo devuelve a ${fmt(pf.anchor_target)}. Pero el factor de un día se calcula con el nivel
            medido antes de ese día, y cada CN resume a su vez un año de carreras: en total corregía el nivel tal como era 18 a 20 meses antes, y el
            nivel publicado superaba el objetivo en un 7 % en bosque.</p>
          <p>La corrección elegida prolonga la media de 13 meses al ritmo medio de la subida de los últimos diez años. Ese ritmo cambia muy poco de un mes
            a otro, el factor se mantiene regular y, desde 2018, el nivel publicado se queda de media a un 2 % de ${fmt(pf.anchor_target)} en bosque y en MTB-O, y a un 3 % en sprint (hasta un 6 a 9 %
            tras las temporadas de la covid, cuyas pocas carreras alteraron el ritmo de la subida). Un
            factor que va a tirones pone las puntuaciones de dos meses vecinos a niveles distintos: una recta recalculada cada mes costaba 0,06 puntos.
            ${L?.recalage_gain ? html`Aplicada al método elegido, la corrección gana ${pts(L.recalage_gain.For)} de duelos en bosque y no cambia nada
            significativo en lo demás.` : ""} Los valores devueltos a 5600 son los índices Ozimut, los que se publican, y no los niveles habituales.</p>
        </section>
        <section class="mx-slide" style="--c:var(--bad)">
          <p class="mx-kicker">Medido y luego descartado</p>
          <h2>Las otras ideas, y lo que dieron</h2>
          <ul class="mx-list bad">
            <li><span><b>El valor del recorrido como media geométrica</b> (con el nivel habitual como media cúbica): frente al método Ozimut, sobre los
              mismos corredores, −0,02 puntos de duelos en bosque y +0,15 [0,10; 0,20] en sprint. Algo mejor en sprint, se descartó porque la
              media ordinaria se puede rehacer a mano: por unas centésimas de punto, gana la regla sencilla. Lo que marcaba la diferencia entre los
              métodos era la parte del pelotón que mide el recorrido, no la forma de promediarla.</span></li>
            <li><span><b>Encarecer el retraso</b> (el tiempo elevado a una potencia, 7 de octubre de 2026): una ganancia hasta la potencia 2, y luego nada más;
              en realidad equivalía a cambiar las medias del recorrido y del nivel habitual, como la variante anterior.</span></li>
            <li><span><b>Una regla propia de cada recorrido para traducir el tiempo en puntuación</b>, estimada sobre el propio recorrido: peor
              (${pts(S?.onecn?.For?.all_holdout?.IK_t)} en bosque, ${pts(S?.onecn?.Spr?.all_holdout?.IK_t)} en sprint); con una veintena de corredores,
              la estimación es demasiado incierta.</span></li>
            <li><span><b>Dar más peso a las carreras que separan mejor a los corredores</b>: ninguna diferencia significativa.</span></li>
            <li><span><b>Una puntuación que penaliza menos las pérdidas de tiempo muy grandes</b>: algo mejor en bosque, claramente peor en sprint.</span></li>
            <li><span><b>El nivel estimado por un modelo estadístico</b> que separa la forma del día y los errores: mejor en sprint
              (${S ? sg(S.mle_fit.Spr[0], 2) : "+0,37"} puntos), claramente peor en bosque (${S ? sg(S.mle_fit.For[0], 2) : "−1,62"} puntos): en bosque,
              equivocarse a menudo es un rasgo del corredor.</span></li>
            <li><span><b>Atenuar los tiempos aberrantes</b> (un método estadístico llamado de Huber) o excluir solo el 15 % más lento, en lugar de fijar
              la parte del pelotón: alrededor de 0,1 puntos menos.</span></li>
            <li><span><b>Un valor de recorrido común a los recorridos de la misma longitud en sprint</b>: el ritmo no es comparable de un recorrido a otro.</span></li>
            <li><span><b>Una puntuación basada en la diferencia con el tiempo medio del recorrido</b>, al estilo de la clasificación mundial de la IOF: peor que la puntuación de la FFCO.</span></li>
            <li><span><b>Un reescalado que reacciona a sus propios efectos</b>: oscilaba de un mes a otro.</span></li>
          </ul>
        </section>`,

      resultats: () => html`
        <section class="mx-slide mx-hero">
          <p class="mx-kicker">Los resultados</p>
          <h2>Frente a la clasificación oficial, en quince temporadas que no sirvieron para los ajustes</h2>
          ${ev ? html`<p class="mx-lead">De ${ev.holdout[0]} a ${ev.holdout[1]}, sobre los mismos corredores, el índice Ozimut predice bien el ${lvl(hf, "acc", "top6w")} % de los
            duelos en bosque, frente al ${lvl(hf, "acc", "official")} % del CN oficial, y el ${lvl(hs, "acc", "top6w")} % frente al ${lvl(hs, "acc", "official")} % en
            sprint. También explica mucho mejor las diferencias de tiempo entre corredores.</p>` : ""}
        </section>
        ${ev ? html`<section class="mx-slide">
          <p class="mx-kicker">Frente a la clasificación oficial</p>
          <h2>Las cifras</h2>
          <div class="table-wrap"><table class="data compact"><thead><tr><th></th><th class="r" colspan="2">Bosque</th><th class="r" colspan="2">Sprint</th></tr>
            <tr><th></th><th class="r">${methodShort("official")}</th><th class="r">${methodShort("top6w")}</th><th class="r">${methodShort("official")}</th><th class="r">${methodShort("top6w")}</th></tr></thead>
            <tbody>
              <tr><td>duelos bien predichos</td><td class="r num">${lvl(hf, "acc", "official")} %</td><td class="r num"><b>${lvl(hf, "acc", "top6w")} %</b></td><td class="r num">${lvl(hs, "acc", "official")} %</td><td class="r num"><b>${lvl(hs, "acc", "top6w")} %</b></td></tr>
              <tr><td>diferencias de tiempo explicadas</td><td class="r num">${lvl(hf, "r2", "official")} %</td><td class="r num"><b>${lvl(hf, "r2", "top6w")} %</b></td><td class="r num">${lvl(hs, "r2", "official")} %</td><td class="r num"><b>${lvl(hs, "r2", "top6w")} %</b></td></tr>
              <tr><td>ganancia del índice Ozimut en duelos, todas las carreras</td><td class="r num" colspan="2">${dci(hf, "top6w-official", "acc")}</td><td class="r num" colspan="2">${dci(hs, "top6w-official", "acc")}</td></tr>
              <tr><td>ganancia del índice Ozimut en duelos, carreras nacionales</td><td class="r num" colspan="2">${dci(hfn, "top6w-official", "acc")}</td><td class="r num" colspan="2">${dci(hsn, "top6w-official", "acc")}</td></tr>
              <tr><td>ganancia del índice Ozimut en diferencias de tiempo explicadas</td><td class="r num" colspan="2">${dci(hf, "top6w-official", "r2")}</td><td class="r num" colspan="2">${dci(hs, "top6w-official", "r2")}</td></tr>
              <tr><td>temporadas en las que la ganancia del índice Ozimut es significativa</td><td class="r num" colspan="2">${evWins("For").join(" de ")}</td><td class="r num" colspan="2">${evWins("Spr").join(" de ")}</td></tr>
            </tbody></table></div>
          <p class="muted" style="font-size:13px">Temporadas ${ev.holdout[0]} a ${ev.holdout[1]}: ${fmt(ev.rows.For.all.holdout.comps)} competiciones en bosque y
            ${fmt(ev.rows.Spr.all.holdout.comps)} en sprint, los mismos corredores para cada método, cada recorrido con el peso de su número de corredores. Las ganancias
            están en puntos, con su intervalo al 95 %. Estas cifras se recalculan en cada actualización del sitio.</p>
        </section>
        <section class="mx-slide" id="saisons">
          <p class="mx-kicker">Temporada a temporada</p>
          <h2>La diferencia entre dos métodos, cada temporada, con su margen</h2>
          <div class="filters" id="ev-controls"></div>
          <div class="grid grid-2" id="ev-seasons"></div>
          <p class="muted" style="font-size:13px">Cada línea es una temporada. El punto es la diferencia entre los dos métodos, en puntos; el trazo es su
            intervalo al 95 %. Un punto a la derecha de la línea cero favorece al primer método nombrado. En verde, una diferencia significativa a favor del
            primer método; en rojo, a favor del segundo; en gris, una diferencia no significativa. Solo cuentan los recorridos de al menos ${ev.min_runners}
            corredores que tienen un CN en cada método. Antes de 2026, el método oficial es la clasificación común de bosque y sprint de la FFCO.</p>
        </section>
        <section class="mx-slide" id="periodes">
          <p class="mx-kicker">Los dos métodos</p>
          <h2>Durante las temporadas reservadas, y durante la puesta a punto</h2>
          <div id="ev-periods"></div>
        </section>` : html`<section class="mx-slide"><p>${t("me.val.none")}</p></section>`}
        <section class="mx-slide">
          <p class="mx-kicker">Los jóvenes y los veteranos</p>
          <h2>Ningún grupo favorecido</h2>
          <p>Un CN justo no debe favorecer a ningún grupo. Para comprobarlo, buscamos, para los jóvenes (20 años o menos) y para los veteranos (55 años o más),
            cuánto habría que corregir su CN para que predijera lo mejor posible sus duelos contra los M/F 21. ${S ? html`En bosque, el CN oficial infravalora
            a los jóvenes en un ${pctCi(calib("For", "young", "official"))}: sus recorridos provocan muchos errores, que la medida sobre los dos tercios más
            rápidos deja de lado. Medido sobre todo el pelotón, el valor de los recorridos los devolvía a su sitio (estudio del 13 de octubre). Los veteranos siguen sobrevalorados entre un 8 y un 9 % con todos
            los métodos, incluido el oficial: la causa no es la medida del recorrido y requeriría un estudio aparte.` : ""}</p>
        </section>
        <section class="mx-slide">
          <p class="mx-kicker">Concordancia entre métodos</p>
          <h2>Clasificaciones parecidas, no idénticas</h2>
          <p>Cada punto es un corredor en la última clasificación publicada: en horizontal, su CN oficial; en vertical, su índice Ozimut. Los puntos cercanos
            a la diagonal tienen aproximadamente el mismo valor en los dos métodos.</p>
          <div class="filters" id="agr-filters"></div>
          <div class="grid grid-main-side" style="align-items:start">
            ${chartCard({ id: "agr", title: "El mismo corredor en dos métodos", hint: "Cada punto es un corredor, en la última clasificación publicada", tall: true })}
            <section class="card"><div class="card-head"><h2>Diferencias entre métodos</h2></div><div id="agr-stats"></div>
              <div class="card-body"><p class="muted" style="font-size:13px;margin:0">Correlación: 1 cuando los dos CN son exactamente proporcionales, 0 cuando
                no tienen ninguna relación. Diferencia media: cuánto supera de media el segundo CN al primero. Diferencia media absoluta: cuánto difieren los dos CN
                de media, en un sentido o en otro.</p></div></section>
          </div>
        </section>`,

      conclusion: () => html`
        <section class="mx-slide" style="${cvar("top6w")}">
          <p class="mx-kicker">El método elegido</p>
          <h2>Las reglas en resumen</h2>
          <ul class="mx-list">
            <li><span><b>Nivel habitual</b>: para cada corredor, 15 días antes de la carrera, la media ponderada de su ${pctOf(pf.eligible_fraction)} de mejores
              puntuaciones Ozimut de los últimos 12 meses, cada una según su peso, sin límite de plazas (en MTB-O y en Ski-O: el 70 % de las puntuaciones, sobre dos y tres años); una
              carrera corrida en categoría juvenil cuenta por 1 − su antigüedad ÷ la ventana. No es una clasificación, sino un paso del cálculo del valor
              de los recorridos.</span></li>
            <li><span><b>Valor Ozimut del recorrido</b>: la media de los productos nivel habitual × tiempo de los corredores más rápidos que tienen un nivel:
              ${shareName(own(pf, "For", "sample_fraction") ?? 2 / 3)} en bosque, ${shareName(own(pf, "Spr", "sample_fraction") ?? 2 / 3)} en sprint,
              ${shareName(own(pf, "VTT", "sample_fraction") ?? 2 / 3)} en MTB-O y en Ski-O; al menos ${fmt(pf.min_ranked)} corredores, todos los
              ${fmt(pf.min_ranked)} cuando solo hay ${fmt(pf.min_ranked)}.</span></li>
            <li><span><b>Puntuación Ozimut</b>: el valor Ozimut del recorrido dividido por el tiempo, multiplicado por el factor de reescalado del día, y fijada de una vez por todas.
              Un error de tarjeta, un abandono, una descalificación o un fuera de tiempo dan 0, que cuenta.</span></li>
            <li><span><b>Índice Ozimut</b>: las mejores puntuaciones Ozimut, dentro del ${pctOf(pf.eligible_fraction)} de mejores de los últimos 12 meses, llenan
              ${fmt(p6.top_n)} plazas: ${fmtW(pf.weights.cdf)} para un campeonato de Francia, ${fmtW(pf.weights.national)} para una carrera nacional,
              ${fmtW(pf.weights.other)} para cualquier otra carrera. El índice Ozimut es la media ponderada de las puntuaciones retenidas, cada una contada tantas veces como
              plazas tenga; una carrera corrida en categoría juvenil cuenta en él por 1 − su antigüedad ÷ la ventana. Hacen falta al menos ${fmt(pf.min_scores)} carreras.</span></li>
            <li><span><b>Reescalado</b>: cada día, un factor mantiene en ${fmt(pf.anchor_target)} la media del ${pctOf(pf.anchor_top_fraction)} de mejores índices Ozimut
              de cada disciplina. Se calcula con el nivel medido dos meses antes, en media sobre 13 meses, prolongado 10 meses al ritmo de la subida
              de los últimos diez años, en las cuatro disciplinas; los meses se cuentan por el calendario.</span></li>
          </ul>
          <p>Las reglas completas están en la pestaña <a href="#/documentation?onglet=top" data-tab-link="top">Método Ozimut</a>.</p>
          <p><a class="mx-dl" href="${PDF}" download>⬇ Descargar el estudio en PDF (libro blanco)</a></p>
        </section>
        <section class="mx-slide">
          <p class="mx-kicker">Por qué este</p>
          <h2>El más sencillo de los que mejor predicen</h2>
          <p>Todas las variantes probadas en octubre de 2026 quedan a pocas décimas de punto unas de otras en duelos bien predichos, y las mejores a pocas
            centésimas. A ese nivel, una ganancia ya no se nota en una clasificación, pero una regla complicada se nota en cada explicación. Por eso el método elegido
            conserva la puntuación de la FFCO y medias normales, y solo cambia lo que de verdad cuenta: las mejores carreras en seis plazas,
            una parte del pelotón fijada por disciplina para medir los recorridos y un reescalado continuo. Gana más de dos puntos de duelos sobre el CN
            oficial, tanto en bosque como en sprint.</p>
          <div class="mx-verdict">
            <div class="mx-box" style="${cvar("top6w")}"><h3>Clasificar, calificar, seleccionar</h3>
              <div class="who">${cnLabel("top6w")}</div>
              <p>Lo que el corredor es capaz de hacer en su mejor momento, alimentado por las grandes competiciones; una vez llenas sus 6 plazas, una carrera más no
                hace bajar el de un adulto.</p></div>
            <div class="mx-box" style="${cvar("top6w")}"><h3>Predecir quién acabará delante</h3>
              <div class="who">${cnLabel("top6w")}</div>
              <p>Claramente por delante del método oficial: más de 2 puntos más de duelos bien predichos, tanto en bosque como en sprint.</p></div>
            <div class="mx-box" style="${cvar("official")}"><h3>Medir la dificultad de un recorrido</h3>
              <div class="who">Las puntuaciones ya obtenidas</div>
              <p>El nivel habitual de los corredores presentes, sacado de sus carreras anteriores, sobre los más rápidos del pelotón, sin el límite de plazas que
                falsearía la medida.</p></div>
            <div class="mx-box" style="${cvar("official")}"><h3>Ser la referencia</h3>
              <div class="who">${cnLabel("official")}</div>
              <p>La única clasificación oficial, la de las selecciones, con todos sus límites.</p></div>
          </div>
          <p class="muted" style="font-size:13px;margin-top:14px">Los datos proceden del sitio de la clasificación nacional de la FFCO; una carrera que falta, mal
            introducida o corregida después puede explicar una diferencia. El método Ozimut parte de los CN de 2010: sus primeros meses reflejan
            sobre todo ese punto de partida. Sus índices no sustituyen en ningún caso a la clasificación oficial.</p>
        </section>`,
    };
    return html`<p style="margin:0 0 12px"><a href="#/documentation?onglet=top" data-tab-link="top">← Método Ozimut</a></p>${buildChapters(STUDY_CHAPTERS, CH, "objectifs")}`;
  }

  // ======================================================================================================
  // 5. Le tracé (Organisation › Tracer): a guide that needs nothing else — starting, the map, the screen, the tools, courses,
  //    descriptions, specials, printing, checks, teamwork, after the race, every menu entry — and its calculations, in plain words
  // ======================================================================================================
  function tracerDoc() {
    const CHAPTERS = [["principe", "Para empezar"], ["carte", "El mapa"], ["fonds", "Fondos y relieve"], ["ecran", "La pantalla"], ["postes", "Los controles"], ["circuits", "Los recorridos"],
      ["definitions", "Las descripciones"], ["speciaux", "Objetos especiales"], ["sorties", "Imprimir y exportar"], ["verifier", "Revisar"], ["itineraires", "Las rutas"],
      ["outils", "En equipo y en el terreno"], ["apres", "Después de la carrera"], ["ruban", "La cinta de opciones"], ["avance", "El nivel avanzado"], ["calculs", "Sus cálculos"]];
    const ic = (k, s = 18) => raw(TR.svg(k, s));
    const K = "Trazado";
    // where a command is in the ribbon: « Carte › Position › Caler les postes »
    const W = (act) => TRD.ribbonAt(act);
    // the tools of the editor's bar, with the letter that picks them
    const TOOLS = [
      ["select", "Selección", "S", "Hacer clic en un objeto para seleccionarlo; arrastrar un objeto seleccionado para moverlo; arrastrar en otro sitio para mover el mapa. Hacer doble clic en un control abre su descripción."],
      ["start", "Salida", "D", "Hacer clic en el lugar de la salida. En un recorrido, hacer clic en una salida ya colocada la reutiliza."],
      ["control", "Control", "P", "Hacer clic para colocar un control; la herramienta sigue activa para colocar los siguientes. Hacer clic en un control pálido, el de otro recorrido, lo añade al recorrido."],
      ["finish", "Meta", "A", "Hacer clic en el lugar de la meta."],
      ["crossing", "Punto de paso obligatorio", "O", "Un punto por el que hay que pasar (un hueco en una valla, un puente): hacer clic en el tramo."],
      ["issue", "Entrega de mapa", "", "Donde el corredor recibe su mapa antes de la salida; un itinerario balizado lleva después a la salida."],
      ["exchange", "Cambio de mapa", "", "Hacer clic en un control del recorrido: el corredor cambia allí de mapa, y el recorrido se divide en partes."],
      ["bend", "Codo", "C", "Hacer clic en un tramo para doblarlo (para rodear una zona prohibida); un codo se puede arrastrar; hacer clic en un codo para quitarlo."],
      ["gap", "Corte", "X", "Arrastrar a lo largo de un tramo o de un círculo para cortarlo y dejar legible un detalle del mapa; hacer clic en un corte para cerrarlo."],
      ["route", "Ruta", "", "Dibujar una ruta a mano: haz clic en el tramo y luego en los puntos del camino; doble clic para terminar. Se añade a las rutas del tramo (capítulo «Las rutas») y no se imprime."],
      ["descr", "Descripciones en el mapa", "", "Arrastrar un marco sobre el mapa: las descripciones del recorrido se colocan en él, y su anchura fija su tamaño."],
      ["special", "Objetos especiales", "", "Abre la lista de objetos: punto de agua, puesto de socorro, zona prohibida, texto, imagen… (capítulo «Objetos especiales»)."],
    ];
    const KEYS = [
      ["Ctrl + Z, Ctrl + Y", "Deshacer, rehacer (100 pasos)"], ["Ctrl + S", "Guardar enseguida"],
      ["Supr", "Eliminar el objeto seleccionado; en un recorrido, quitar el control solo del recorrido"],
      ["Esc", "Abandonar el trazo en curso, volver a Selección y luego deseleccionar"],
      ["Intro", "Terminar una línea, una zona o un itinerario (como un doble clic)"],
      ["S, D, P, A, O, C, X", "Elegir una herramienta (S Selección, D Salida, P Control, A Meta, O Paso obligatorio, C Codo, X Corte)"],
      ["Mayús + clic", "Mantener la herramienta después de colocar una salida, una meta o un objeto"],
      ["Mayús al arrastrar un control", "Colocarlo exactamente sobre un control vecino"],
      ["Rueda, + y −", "Hacer zoom"], ["Flechas, arrastrar con clic derecho", "Mover el mapa"], ["Clic derecho", "El menú del objeto bajo el ratón"],
      ["Alt", "Los atajos de la cinta: una letra en cada pestaña y luego en cada botón de la pestaña elegida"], ["Alt + Q", "Buscar un comando"],
      ["← → ↑ ↓, Inicio, Fin (en la cinta)", "De una pestaña a otra (se muestra), de un botón a otro; ↓ desde una pestaña entra en su cinta, ↑ vuelve; Tab pasa de las pestañas a la cinta"],
      ["Ctrl + F1", "Plegar la cinta a sus pestañas, o desplegarla"], ["F1", "La guía, en el capítulo del comando bajo el ratón"],
    ];
    // what each menu entry does (the menus come from tracer/icons.js, as in the editor)
    const MENU_HELP = {
      "start-new": "Crear otro evento, sobre su mapa (la primera de las tres opciones que ofrece la página al abrirse).",
      "start-open": "Abrir otro de tus eventos (los que has creado y aquellos cuyo equipo te incluye).",
      "start-import": "Un evento tomado de un archivo Ozimut (.ozmt, que contiene su mapa) o Purple Pen (.ppen, con su mapa): un evento nuevo, junto a este.",
      save: "Guarda enseguida; el guardado también se hace solo, unos segundos después de cada cambio.",
      "version-save": "Guarda el estado actual con un nombre, para volver a él más tarde.",
      versions: "La lista de versiones (también se guarda una versión cada 30 minutos de trabajo): ver qué ha cambiado, volver a abrir una.",
      "export-ocn": "Todo el evento en un solo archivo Ozimut (.ozmt), con su mapa si quieres: una copia, un archivo de respaldo o el evento para otro club; se vuelve a abrir con «Importar un evento».",
      "export-ppen": "El archivo del evento para Purple Pen, para poner junto al mapa.",
      "import-ppen": "Sustituye los recorridos del evento por los de un archivo Purple Pen; el mapa sigue siendo el del evento.",
      "pdf-courses": "Los mapas de los recorridos para imprimir.", "pdf-descriptions": "Las descripciones solas, varias por página.",
      "pdf-punch": "Las tarjetas de control, con una casilla por control.",
      "export-iof3": "Los recorridos para los programas de cronometraje: controles, orden, longitudes y los equipos de relevos.",
      "export-iof2": "Lo mismo para programas más antiguos.", "export-gpx": "Los controles como puntos GPS (mapa georreferenciado).",
      "export-kml": "Los recorridos para Google Earth o un mapa en línea (mapa georreferenciado).",
      "export-images": "Una imagen por recorrido, con su archivo de georreferencia cuando el mapa está georreferenciado.",
      "export-ocad": "Cada recorrido como mapa de OCAD u OpenOrienteering Mapper, para terminarlo o imprimirlo con esos programas.",
      "export-routegadget": "El mapa como imagen y los recorridos, para subir a RouteGadget.", "export-csv": "Las tablas de los informes, para una hoja de cálculo.",
      publish: "Después de la carrera: los recorridos en el análisis, donde los corredores suben sus tracks GPS.",
      "send-results": "A partir del día de la carrera: longitud, desnivel y controles de cada recorrido enviados a los resultados del sitio.",
      "map-change": "Otro mapa (una versión corregida, un escaneo mejor, el archivo OCAD): los controles conservan su lugar.",
      offline: "Guardar el evento en este dispositivo para abrirlo sin conexión.",
      "event-props": "El título, la escala del mapa (y la resolución de una imagen), la escala de impresión de «Todos los controles», el idioma de las descripciones en texto, notas.",
      appearance: "El tamaño de los círculos, el grosor de las líneas, la fuente y el tamaño de los números, el violeta y su forma de superponerse al mapa.",
      standards: "La norma de las descripciones (IOF 2004 o 2018/2024) y la del mapa (ISOM 2017, ISSprOM 2019, ISOM 2000), que fija el tamaño de los símbolos.",
      numbering: "El primer código que se da a los controles nuevos, y si se evitan los códigos que también se leen al revés (66, 99…).",
      codes: "Cambiar los códigos de varios controles a la vez.", renumber: "Volver a dar un código a cada control, a partir del primer código.",
      "remove-unused": "Eliminar los controles que ningún recorrido usa.", calage: "Recalibrar todos los controles sobre el mapa, en dos clics (capítulo «El mapa»).",
      "move-all": "Mover, girar o escalar todos los controles a la vez.",
      "custom-text": "Cambiar el texto que las descripciones en texto dan a un símbolo.", punch: "El dibujo de la pinza de cada control, para comprobar las tarjetas.",
      load: "El número de participantes de cada recorrido (tomado de las inscripciones oficiales cuando las hay), para la carga de los controles.",
      georef: "Situar el mapa en la Tierra: puntos marcados con clic, un archivo de georreferencia, un KMZ.", team: "Los miembros del equipo y su función.",
      encryption: "Cifrar el evento con una frase de contraseña del equipo.",
      "course-new": "Un recorrido nuevo (también: el «+» al final de las pestañas).",
      "course-props": "El nombre, el tipo (normal o score), las categorías, el desnivel, la longitud, la escala de impresión, las descripciones, la numeración, los participantes esperados.",
      "course-dup": "Una copia del recorrido, para derivar otro de él.", "course-delete": "Eliminar el recorrido; sus controles se quedan en «Todos los controles».",
      "course-order": "El orden de las pestañas y las listas.", "var-fork": "Una horquilla a partir del control elegido: ramas que se unen más adelante.",
      "var-loop": "Bucles a partir del control elegido (una «mariposa»).", "var-delete": "Eliminar la horquilla o los bucles que salen del control elegido.",
      relay: "Para un relevo: qué variante corre cada relevista de cada equipo.", "print-area": "La parte del mapa que se imprime, el formato y la orientación de la hoja.",
      "part-options": "Para un recorrido en varias partes: mostrar o no la meta en la parte elegida.",
      "rep-summary": "Para cada recorrido: la longitud, el desnivel, el número de controles.", "rep-legs": "La longitud de cada tramo de cada recorrido.",
      "rep-cross": "Qué recorridos pasan por qué control.", "rep-load": "El número de participantes esperados en cada control y en cada tramo.",
      "rep-audit": "Las verificaciones: controles demasiado cercanos, descripciones incompletas, códigos, tramos que cruzan una zona prohibida… (capítulo «Revisar»).",
      "rep-climb": "El desnivel de cada recorrido, sobre el modelo de terreno del IGN.", "rep-times": "El tiempo esperado del ganador de cada recorrido, y la longitud para un tiempo objetivo.",
      "rep-pickup": "Cuándo y en qué orden recoger los controles.", tour: "El camino más rápido por todos los controles elegidos (por defecto, todos): para el controlador y para colocar o recoger los controles.", "rep-after": "Después de la carrera: tiempos, errores e itinerarios tomados en cada tramo.",
      comments: "Los comentarios del equipo, fijados en el mapa.", field: "En el móvil: el mapa con tu posición GPS, para colocar y comprobar los controles.",
      "view-course": "Encuadrar todo el recorrido.", "view-map": "Encuadrar todo el mapa.", "view-all": "Mostrar en pálido los controles de los demás recorridos, para reutilizarlos.",
      "view-printarea": "Mostrar el marco de la zona de impresión.", "view-others": "Mostrar otros recorridos en azul pálido bajo el actual.",
      "import-course": "Leer los círculos, la salida y la meta impresos en un mapa (un PDF, una foto) y convertirlos en controles.",
      "save-to": "Cuando un comando crea varios archivos: escribirlos en una carpeta elegida o en un solo .zip.",
    };
    // the editor's screen, drawn: its zones numbered as in the list under it
    const screenFig = () => {
      const P = "#a7179b", ink2 = "var(--ink-2)", line = "var(--border-strong)";
      const mark = (n, x, y) => `<g><circle cx="${x}" cy="${y}" r="11" fill="${P}"/><text x="${x}" y="${y + 4}" text-anchor="middle" font-size="12" font-weight="700" style="fill:#fff">${n}</text></g>`;
      const icon = (k, x, y, s = 0.72, c = ink2) => `<g transform="translate(${x} ${y}) scale(${s})" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${TR.ICON[k]}</g>`;
      const txt = (x, y, t, o = "") => `<text x="${x}" y="${y}" font-size="11" ${o}>${t}</text>`;
      // the tabs of the ribbon, the contextual one at the end
      let tx = 66;
      const tabs = ["Trazado", "Recorridos", "Mapa", "Revisar", "Imprimir", "Equipo y carrera"].map((l, i) => {
        const w = l.length * 6.4 + 18 + (l === "Revisar" ? 16 : 0), x = tx; tx += w;
        return `${txt(x + 8, 53, l, `style="fill:${i ? "var(--ink-2)" : "var(--ink)"}" ${i ? "" : 'font-weight="700"'}`)}${i ? "" : `<line x1="${x + 4}" y1="61" x2="${x + w - 6}" y2="61" stroke="${P}" stroke-width="2.5"/>`}${l === "Revisar" ? `<circle cx="${x + w - 12}" cy="49" r="7" fill="var(--amber)"/><text x="${x + w - 12}" y="52.5" text-anchor="middle" font-size="9.5" font-weight="700" style="fill:#1b1a17">2</text>` : ""}`;
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
      const rows = [["", "", "Salida: cima"], ["1", "31", "Piedra, lado norte"], ["2", "45", "Depresión"], ["3", "52", "Camino, cruce"], ["4", "38", "Claro"]];
      const sheet = rows.map(([n, c, t], i) => `${i === 3 ? `<rect x="12" y="${182 + i * 20}" width="210" height="20" fill="#fff59d"/>` : ""}<text x="22" y="${196 + i * 20}" font-size="11" font-weight="700" style="fill:${i === 3 ? "#111" : "var(--ink)"}">${n}</text><text x="38" y="${196 + i * 20}" font-size="10.5" style="fill:${i === 3 ? "#111" : "var(--ink)"}">${c}</text><text x="64" y="${196 + i * 20}" font-size="10.5" style="fill:${i === 3 ? "#333" : "var(--ink-2)"}">${t}</text><line x1="12" y1="${202 + i * 20}" x2="222" y2="${202 + i * 20}" stroke="${line}"/>`).join("");
      return `<svg viewBox="0 0 760 486" role="img" aria-label="La pantalla del trazado, con sus zonas numeradas">
        <rect x="0.5" y="0.5" width="759" height="485" rx="9" fill="var(--surface)" stroke="${line}"/>
        <rect x="8" y="7" width="94" height="22" rx="5" fill="var(--surface-2)" stroke="${line}"/>${icon("folder", 13, 11, 0.55)}${txt(32, 22, "Eventos", 'style="fill:var(--ink)"')}
        <text x="112" y="23" font-size="12.5" font-weight="700" style="fill:var(--ink)">Entrenamiento</text>
        <rect x="196" y="11" width="34" height="15" rx="7.5" fill="var(--flag)"/><text x="213" y="22" text-anchor="middle" font-size="8.5" font-weight="700" style="fill:#fff">BETA</text>
        <line x1="240" y1="10" x2="240" y2="27" stroke="${line}"/>${icon("undo", 248, 9, 0.62)}${icon("redo", 270, 9, 0.62)}${icon("printer", 292, 9, 0.62)}${icon("shield", 314, 9, 0.62)}${icon("pencil", 336, 9, 0.62)}<text x="358" y="22" font-size="8" style="fill:var(--ink-3)">▾</text>
        <rect x="470" y="7" width="176" height="22" rx="6" fill="var(--surface-2)" stroke="${line}"/>${icon("search", 476, 11, 0.55)}${txt(494, 22, "Buscar un comando", 'style="fill:var(--ink-3)"')}
        ${txt(656, 22, "Guardado", 'style="fill:var(--good)"')}${icon("ribbon", 712, 9, 0.62)}${icon("fit", 734, 9, 0.62)}
        <line x1="0" y1="35" x2="760" y2="35" stroke="${line}"/>
        <rect x="8" y="40" width="50" height="19" rx="5" fill="${P}"/><text x="33" y="53.5" text-anchor="middle" font-size="11" font-weight="700" style="fill:#fff">Archivo</text>${tabs}
        <rect x="560" y="38" width="128" height="24" fill="color-mix(in srgb, ${P} 9%, var(--surface))"/><line x1="560" y1="38.5" x2="688" y2="38.5" stroke="${P}" stroke-width="3"/>
        <text x="566" y="53" font-size="7.5" font-weight="700" letter-spacing=".5" style="fill:${P}">HERRAMIENTAS</text><text x="644" y="53" font-size="11" font-weight="700" style="fill:var(--ink)">Control</text>
        <line x1="0" y1="62" x2="760" y2="62" stroke="${line}"/>
        ${big("select", 12, "Selección", true)}${gt(36, "Selección")}${sep(66)}
        ${big("control", 74, "Control")}${big("start", 126, "Salida")}${big("finish", 178, "Meta")}
        ${small("crossing", 236, 84, "Paso obligatorio")}${small("issue", 236, 103, "Entrega de mapa")}${small("exchange", 236, 122, "Cambio de mapa")}${gt(240, "Controles")}${sep(346)}
        ${small("bend", 354, 84, "Codo")}${small("gap", 354, 103, "Corte")}${small("route", 354, 122, "Itinerario")}${gt(395, "Tramos")}${sep(444)}
        ${cells}<rect x="552" y="70" width="10" height="48" rx="2" fill="var(--surface-2)" stroke="${line}"/><text x="557" y="97" text-anchor="middle" font-size="8" style="fill:var(--ink-3)">▾</text>${gt(505, "Objetos especiales")}${sep(572)}
        ${big("descr", 580, "En el mapa")}${txt(640, 86, "Norma", 'style="fill:var(--ink-2)"')}<rect x="676" y="76" width="70" height="15" rx="3" fill="var(--plane)" stroke="${line}"/>${txt(681, 87, "IOF 2018 ▾", 'font-size="9.5" style="fill:var(--ink)"')}
        ${txt(640, 108, "Idioma", 'style="fill:var(--ink-2)"')}<rect x="676" y="98" width="70" height="15" rx="3" fill="var(--plane)" stroke="${line}"/>${txt(681, 109, "Español ▾", 'font-size="9.5" style="fill:var(--ink)"')}${gt(664, "Descripciones")}
        ${icon("launcher", 742, 131, 0.45)}
        <line x1="0" y1="148" x2="760" y2="148" stroke="${line}"/>
        <text x="12" y="165" font-size="12" style="fill:var(--ink-2)">Todos los controles</text><text x="118" y="165" font-size="12" font-weight="700" style="fill:var(--ink)">Recorrido A</text>
        <line x1="114" y1="172" x2="176" y2="172" stroke="${P}" stroke-width="2.5"/><text x="190" y="165" font-size="12" style="fill:var(--ink-2)">Recorrido B</text>${icon("plus", 252, 154, 0.55)}
        <line x1="0" y1="174" x2="760" y2="174" stroke="${line}"/>
        <rect x="12" y="180" width="210" height="124" fill="var(--surface)" stroke="var(--ink)"/>${sheet}
        <path d="M20 189.5l9 5-9 5z" fill="none" stroke="var(--ink)" stroke-width="1.3"/>
        <text x="14" y="330" font-size="12" font-weight="700" style="fill:var(--ink)">Recorrido A</text>
        <text x="14" y="348" font-size="11" style="fill:var(--ink-2)">Longitud 3,2 km · Desnivel 85 m</text><text x="14" y="364" font-size="11" style="fill:var(--ink-2)">4 controles · 1:10.000</text>
        <rect x="233" y="175" width="527" height="285" fill="var(--surface-2)"/>
        <path d="M250 230c60-30 120 10 170-20s110-40 150 10M260 280c70-20 120 30 200 0s120-30 180 20M300 450c40-60 120-50 170-20" fill="none" stroke="#c8865a" stroke-opacity=".55" stroke-width="1.4"/>
        <ellipse cx="520" cy="410" rx="60" ry="26" fill="#f6c46a" fill-opacity=".45"/>
        <g fill="none" stroke="${P}" stroke-width="2.2">${legs}${marks}</g>
        <line x1="232" y1="174" x2="232" y2="460" stroke="${line}" stroke-width="2"/>
        <g>${[0, 1, 2].map((i) => `<rect x="724" y="${184 + i * 26}" width="24" height="22" rx="5" fill="var(--surface)" stroke="${line}"/>`).join("")}${icon("plus", 727, 186, 0.6)}${icon("minus", 727, 212, 0.6)}${icon("fit", 727, 238, 0.6)}
          <line x1="736" y1="266" x2="736" y2="320" stroke="${P}" stroke-width="3" stroke-linecap="round"/><circle cx="736" cy="276" r="5" fill="${P}"/></g>
        <line x1="0" y1="460" x2="760" y2="460" stroke="${line}"/>
        <text x="12" y="477" font-size="11" style="fill:var(--ink-3)">Haz clic para seleccionar un objeto; arrastra un objeto seleccionado para moverlo…</text><text x="748" y="477" text-anchor="end" font-size="11" style="fill:var(--ink-3)">1:10.000 · 140 %</text>
        ${mark(1, 384, 18)}${mark(2, 540, 50)}${mark(3, 346, 136)}${mark(4, 700, 50)}${mark(5, 292, 162)}${mark(6, 222, 186)}${mark(7, 420, 240)}${mark(8, 708, 196)}
      </svg>`;
    };
    const CH = {
      principe: () => html`
        <section class="mx-slide" id="tr-principe">
          <p class="mx-kicker">${K}</p>
          <h2>Trazar los recorridos en el navegador</h2>
          <p class="mx-lead">El trazado, que se abre desde la pestaña «Trazado» de un evento en Orga, sirve para preparar los recorridos de una carrera o de un entrenamiento, del mapa en blanco a los mapas impresos:
            colocar los controles, componer los recorridos, rellenar las descripciones, verificar, imprimir, preparar los archivos del cronometraje. Nada que instalar:
            todo ocurre en el navegador, y el evento se guarda en el sitio.</p>
          <p>Retoma las reglas de trazado y el formato de archivo de <a href="https://purple-pen.org/" target="_blank" rel="noopener">Purple Pen</a>,
            el programa libre de trazado de Peter Golde, que muchos clubes conocen: un evento pasa de uno a otro, en ambos sentidos. También tiene su
            propio archivo, el archivo Ozimut (.ozmt), que guarda todo el evento y su mapa en un solo archivo. No hace falta conocer Purple Pen para
            usarlo: esta guía lo explica todo.</p>
          <div class="mx-callout"><b>Versión beta.</b> El trazado se acaba de crear y apenas se ha probado: pruébalo y cuéntanos lo que no funcione
            desde la página «Contacto» (el menú de tu nombre). Todavía no se recomienda para preparar una competición real; va muy bien para los mapas
            de entrenamiento.</div>
          <h3>Los pasos</h3>
          <div class="mx-steps" style="--c:#a7179b">
            <div class="mx-step"><b>Empezar el trazado</b>En Orga, la pestaña «Trazado» del evento: «Empezar el trazado» abre un trazado preparado para la competición o el entrenamiento, y vinculado a él; solo falta dar el mapa.</div>
            <div class="mx-step"><b>Colocar los controles</b>Con la herramienta Control, en la pestaña «Todos los controles» o directamente en un recorrido.</div>
            <div class="mx-step"><b>Componer los recorridos</b>Una pestaña por recorrido: salida, controles en orden, meta.</div>
            <div class="mx-step"><b>Rellenar las descripciones</b>En el panel de la izquierda, casilla a casilla, con símbolos o texto.</div>
            <div class="mx-step"><b>Revisar</b>Longitudes, desnivel, controles demasiado cercanos, descripciones olvidadas: la pestaña Revisar.</div>
            <div class="mx-step"><b>Imprimir y exportar</b>Los PDF de los mapas y de las descripciones, los archivos para el cronometraje.</div>
          </div>
          <h3>Las tres opciones</h3>
          <p>Desde la pestaña «Trazado» de un evento, la página «Trazado» se abre directamente en su trazado. Abierta de otro modo (un enlace, una invitación), muestra enseguida la pantalla del trazado, vacía, y encima tres opciones:</p>
          <ul class="mx-list">
            <li><b>Nuevo evento</b>: trazar los recorridos de una competición de tu club o de un entrenamiento. Hace falta el mapa.</li>
            <li><b>Importar un evento</b>: retomar un evento preparado en otro sitio, en otra cuenta, en otro club en Purple Pen o en OCAD. Hace falta un archivo
              Ozimut (.ozmt), que ya contiene el mapa, un archivo Purple Pen (.ppen) y el archivo de su mapa, o el archivo de recorridos de OCAD y el de su mapa.</li>
            <li><b>Abrir un evento</b>: uno de los que has creado o cuyo equipo te incluye, en la lista.</li>
          </ul>
          <p>Los archivos que sueltes en esta pantalla eligen por ti: un mapa solo empieza un evento nuevo, un .ozmt, un .ppen o un archivo OCAD con recorridos una importación. El botón
            «Eventos», arriba a la izquierda, y el menú Archivo (Nuevo, Abrir, Importar) vuelven a mostrar estas tres opciones en cualquier momento; Esc las cierra. Un enlace que nombra un evento lo abre
            directamente.</p>
          <h3>Crear un evento</h3>
          <p>«Nuevo evento» pide:</p>
          <ul class="mx-list">
            <li><b>Una competición o un entrenamiento.</b> Una competición se elige en la lista de las carreras próximas y de los últimos 60 días organizadas por tu
              club (el club de tu última carrera): solo sus miembros la crean. Un entrenamiento lo puede crear cualquiera, con un título y una fecha.</li>
            <li><b>El mapa</b>, soltado o elegido: el archivo OCAD o Mapper, un PDF o una imagen (capítulo «El mapa»).</li>
            <li><b>La escala del mapa</b> (leída en el archivo OCAD o Mapper) y su <b>norma</b>: bosque (ISOM 2017) o sprint (ISSprOM 2019), que fija el tamaño
              de los círculos y los números.</li>
          </ul>
          <p>«Importar un evento» pide los mismos datos (competición o entrenamiento) y el archivo: un archivo Ozimut (.ozmt) se vuelve a abrir tal como se
            guardó, con su mapa (un archivo guardado antes como .ocnt se abre igual); un archivo Purple Pen (.ppen)
            con su mapa; un archivo OCAD preparado con su módulo de trazado, con su mapa: el archivo OCAD que muestra debajo, que la ventana
            nombra (no hace falta si mapa y recorridos están en un mismo archivo). Se toman sus controles, sus descripciones y sus recorridos, y
            un recorrido que vuelve a su salida recibe una meta en el mismo lugar; las variantes solo conservan su primera rama (la ventana lo
            indica), y sus logotipos (las imágenes de su maquetación) pasan a ser imágenes en todos los recorridos, en su sitio: un
            logotipo nunca se quita del mapa, ni en pantalla ni en los PDF. Si el mapa dado no es el del archivo (un PDF en lugar del mapa
            OCAD, por ejemplo), después se calibran los controles en dos clics.</p>
          <div class="mx-grid">
            <div class="mx-box" style="--c:var(--s1)"><h3>Quién lo ve</h3><p>Solo su equipo: su creador y las personas que se unen a él con un enlace de invitación, como trazador,
              controlador o lector. No los administradores del sitio: los recorridos siguen siendo secretos hasta la carrera.</p></div>
            <div class="mx-box" style="--c:var(--s3)"><h3>Se guarda solo</h3><p>Unos segundos después de cada cambio; se guarda una versión cada
              30 minutos de trabajo, y puedes guardar una con un nombre (${W("version-save")}).</p></div>
            <div class="mx-box" style="--c:var(--s5)"><h3>Cifrado si quieres</h3><p>Con una frase de contraseña del equipo (${W("encryption")}), el servidor solo
              guarda datos ilegibles. Si se pierde, no se puede recuperar: exporta primero un archivo Ozimut (${W("export-ocn")}), que
              no está cifrado.</p></div>
          </div>
          <p class="tr-steps-doc">Un evento aún vacío muestra <b>«Primeros pasos»</b> en el panel izquierdo: colocar la salida, los controles y la meta, crear un recorrido, hacer clic en sus controles en orden, y luego revisar e imprimir — cada paso con el botón que lo hace, marcado cuando está hecho. La cruz lo oculta.</p>
        </section>`,
      carte: () => html`
        <section class="mx-slide" id="tr-carte">
          <p class="mx-kicker">${K}</p>
          <h2>El mapa</h2>
          <h3>Qué archivo dar</h3>
          <div class="mx-grid">
            <div class="mx-box" style="--c:var(--s1)"><h3>OCAD o Mapper</h3><p>La mejor opción: el archivo .ocd (OCAD 6 a 12 y 2018) o .omap / .xmap
              (OpenOrienteering Mapper). El mapa se dibuja símbolo a símbolo: nítido con cualquier zoom, impreso en vectores, con las dimensiones correctas sin
              ajuste; se recuperan su escala, su georreferenciación y su violeta.</p></div>
            <div class="mx-box" style="--c:var(--s3)"><h3>PDF</h3><p>Exportado desde OCAD o Mapper, sigue nítido al imprimirlo: se incluye tal cual en los PDF de los
              recorridos. Sus dimensiones son las de la página.</p></div>
            <div class="mx-box" style="--c:var(--s5)"><h3>Imagen</h3><p>JPG, PNG, GIF, BMP, WebP o TIFF, incluso un escaneo o una foto tomada bien plana. Sus
              distancias vienen de su <b>resolución</b>: a 300 puntos por pulgada, 1 mm de mapa son 11,8 puntos.</p></div>
          </div>
          <p>La resolución de una imagen se lee en el archivo cuando la indica; si no, se te pide. Para comprobarla, mide una distancia conocida
            (${W("rep-legs")}); ${W("event-props")} la corrige. Un mapa OCAD puede llamar a otros archivos de fondo
            («plantillas», una foto aérea): no se dibujan.</p>
          <p>El control deslizante bajo los botones de zoom (o Mapa › Vista › Intensidad) aclara el mapa, para ver mejor el recorrido. ${W("map-change")} pone otro (una versión corregida,
            un escaneo mejor, el archivo OCAD en lugar de una imagen): los controles conservan su sitio en la hoja, sus coordenadas (una nueva versión del mismo
            archivo OCAD), su sitio en el terreno (dos mapas georreferenciados), o se alinean después con dos clics.</p>
          <h3>Mapas de entrenamiento</h3>
          <p>${W("map-colors")} oculta colores y símbolos de un mapa de OCAD o Mapper, para todos los recorridos o para uno: un mapa sin caminos, sin vegetación, solo con el relieve o las curvas de nivel, con un clic. ${W("exercise")} oculta el mapa de un recorrido salvo un pasillo a lo largo de sus tramos y ventanas alrededor de sus controles, y sigue al recorrido cuando cambia; los logotipos del mapa siguen visibles.</p>
          <h3>El violeta del recorrido</h3>
          <p>El grupo Mapa › Violeta ajusta cómo se coloca el recorrido sobre el mapa; cada modo se muestra ahí en miniatura:</p>
          <ul class="mx-list">
            <li><b>Por encima</b>: el violeta cubre el mapa.</li>
            <li><b>Mezclado</b>: el negro del mapa sigue viéndose a través del violeta, como en la impresión con sobreimpresión.</li>
            <li><b>En capas</b> (mapa OCAD o Mapper): los círculos, las líneas y las zonas prohibidas pasan bajo los colores del mapa que están por encima de un color
              elegido, normalmente bajo el negro de los caminos y las rocas; los números quedan encima.</li>
          </ul>
          <p>En un mapa OCAD o Mapper, el violeta es por defecto el del mapa; puedes indicar otro en CMYK (Mapa › Violeta › Apariencia). Los «efectos de sobreimpresión» (Mapa › Violeta › Sobreimpresión) muestran
            los colores que el mapa marca como «sobreimpresión» fundidos, tal como se imprimen.</p>
          <h3>Alinear los controles con dos clics</h3>
          <p>Cuando los controles no caen en el sitio correcto —un archivo .ppen hecho sobre otro mapa, un escaneo un poco girado—, ${W("calage")} los recoloca: haces clic en un control, luego en el sitio donde debería estar, y eso dos veces, con dos controles alejados entre sí. El trazado
            deduce de ello el desplazamiento, la rotación y la escala. Si la escala cambia, propone corregir el mapa (la resolución de la imagen o la escala del PDF),
            con lo que las longitudes del recorrido siguen siendo correctas, o los controles. Un .ppen hecho sobre un mapa OCAD, importado con el mismo mapa OCAD, no necesita alineación.</p>
          <h3>La georreferenciación</h3>
          <p>Para el desnivel, el modo terreno, los GPX y el análisis, hay que saber dónde está el mapa en la Tierra. Un mapa OCAD o Mapper georreferenciado
            (Lambert 93, UTM, los sistemas de OCAD) y un TIFF georreferenciado lo están por sí solos. Si no, ${W("georef")}: dos puntos del
            mapa (un cruce, una esquina de edificio) marcados con su latitud y su longitud —un clic derecho en Géoportail o en un mapa en línea las
            da—, o tres o más para una foto deformada; o un archivo de georreferencia (.jgw, .pgw… con su .prj); o un KMZ de la misma imagen. La ventana
            comprueba la escala obtenida contra la del mapa.</p>
          <p><b>Ejercicios</b>: ${W("exercise")} ofrece, para el recorrido actual, seis mapas de entrenamiento — el pasillo, las ventanas, los controles
            ocultos (un blanco alrededor de cada control), los tramos ocultos (un blanco sobre la mitad de cada tramo), un mapa por tramo (un cambio de mapa
            en cada control) y el puzle (la imagen del recorrido en piezas mezcladas, para imprimir). Fondos, relieve y modelo de elevación: capítulo «Fondos y relieve».</p>
        </section>`,
      fonds: () => html`
        <section class="mx-slide" id="tr-fonds">
          <p class="mx-kicker">${K}</p>
          <h2>Fondos y relieve</h2>
          <p>${W("backdrop")} abre un panel, colocado sobre el mapa, que muestra bajo el recorrido lo que el mapa no dice. Requiere un mapa georreferenciado
            (un archivo OCAD o Mapper suele estarlo; si no, ${W("georef")}).</p>
          <ul class="mx-list">
            <li><b>OpenStreetMap</b>, en todo el mundo: calles, caminos, edificios recientes — para comprobar que un camino sigue existiendo, localizar un aparcamiento.</li>
            <li><b>Los mapas y fotos aéreas nacionales</b> donde Ozimut los conoce: Francia, Suiza, Estados Unidos, Nueva Zelanda.</li>
            <li>En Francia, <b>el LiDAR HD del IGN</b>: el suelo desnudo sombreado (taludes, zanjas, caminos antiguos, plataformas), la altura de la vegetación
              (talas, plantaciones jóvenes, claros) y los puntos por tipo (suelo, vegetación, edificios).</li>
            <li><b>El sombreado y las pendientes</b> del modelo de elevación del evento, en todas partes.</li>
          </ul>
          <p>Cada fondo tiene su casilla y su opacidad; la última línea ajusta la intensidad del propio mapa, para ver a través de él. La elección se guarda
            para el evento, en este dispositivo. Los fondos no se imprimen — salvo el elegido como «fondo impreso» en el área de impresión.</p>
          <h3>El modelo de elevación</h3>
          <p>El desnivel, el perfil, las rutas, el sombreado y la vista 3D leen las mismas altitudes: el modelo de elevación del evento (${W("dem")}). Ozimut lo
            carga por sí solo la primera vez que hace falta — el RGE ALTI del IGN en Francia, los modelos nacionales en Suiza, Estados Unidos, Canadá y Nueva
            Zelanda, el relieve mundial en otros lugares — y luego lo guarda con el evento: todo el equipo lee las mismas altitudes, incluso sin conexión, y
            el archivo Ozimut (.ozmt) las lleva consigo. ¿Tienes algo mejor? «Usar mi archivo» acepta un GeoTIFF o una malla ASCII: un MDT LiDAR de 1 m, por ejemplo.</p>
          <p>${W("rep-climb")} da el desnivel de cada recorrido de tres maneras: <b>entre los controles</b> (la suma de las subidas netas de un control al
            siguiente), <b>a lo largo de los tramos</b> (todas las subidas de la línea recta) y <b>a lo largo de las rutas</b> (la regla de la IOF: la subida
            de la ruta más rápida). Haz clic en el encabezado de la columna que quieras aplicar y marca los recorridos; el valor se redondea a 5 m. Donde el
            modelo se equivoca — un control bajo un puente, al pie de un cortado —, escribe la altitud del control: entonces cuenta en todas partes.
            ${W("profile")} dibuja el perfil del recorrido, o el del tramo elegido con cada una de sus rutas.</p>
          <h3>Una traza GPS sobre el mapa</h3>
          <p>${W("import-track")} coloca sobre el mapa tu reconocimiento del terreno — un archivo GPX, TCX, FIT, NMEA o FRWD — como un objeto de línea, que
            mueves, recoloreas o eliminas como cualquier otro. Se muestra solo en «Todos los controles», a menos que marques todos los recorridos.</p>
          <h3>Ver aquí</h3>
          <p>Un clic derecho en el mapa y luego «Ver aquí en…» abre el lugar en OpenStreetMap, Google Maps y Street View, el Géoportail y «Remonter le temps»
            del IGN en Francia, el mapa nacional en Suiza, Mapy.cz o Mapillary, o copia sus coordenadas.</p>
          <h3>Sin mapa: trazar sobre OpenStreetMap</h3>
          <p>Para un parque, un barrio o un patio de colegio sin mapa de orientación, «Nuevo evento» ofrece «¿Sin mapa? Trazar sobre OpenStreetMap»: indica el
            centro (sus coordenadas, o «Mi posición»), la hoja y la escala. El evento se abre sobre OpenStreetMap, georreferenciado; el fondo se imprime bajo
            los recorridos, con su crédito. El cálculo de rutas, que lee un mapa de orientación, no está disponible ahí: dibújalas a mano.</p>
        </section>`,
      ecran: () => html`
        <section class="mx-slide" id="tr-ecran">
          <p class="mx-kicker">${K}</p>
          <h2>La pantalla</h2>
          <figure class="mx-fig">${raw(screenFig())}</figure>
          <div class="mx-steps" style="--c:#a7179b">
            <div class="mx-step"><b>La barra superior</b>«Eventos» devuelve las tres opciones (abrir otro evento, crear o importar uno); el título;
              la barra de acceso rápido: deshacer, rehacer, el PDF del recorrido actual, la revisión del evento, las propiedades del recorrido. A la derecha, la búsqueda de un comando, el estado del guardado, ▭ (la presentación de la
              cinta), ⤢ (toda la ventana) y ↗ (una pestaña aparte).</div>
            <div class="mx-step"><b>Las pestañas de la cinta</b>Archivo, y luego una pestaña por etapa del trabajo: Trazado, Recorridos, Mapa, Revisar, Imprimir, Equipo y
              carrera. Un número en Revisar: los problemas encontrados; en Equipo y carrera: los comentarios aún abiertos.</div>
            <div class="mx-step"><b>La cinta</b>Los comandos de la pestaña, por grupos: botones grandes para los más habituales, pequeños apilados de tres en tres,
              ajustes en el sitio, y ↘ en la esquina de un grupo para su ventana completa.</div>
            <div class="mx-step"><b>La pestaña del objeto seleccionado</b>Un control, un tramo, un objeto seleccionado, o una línea que se está dibujando, tiene su propia
              pestaña, en violeta, con todo lo que se le aplica.</div>
            <div class="mx-step"><b>Los recorridos</b>«Todos los controles», luego una pestaña por recorrido, y «+» para crear uno.</div>
            <div class="mx-step"><b>Las descripciones</b>Las del recorrido actual, que se rellenan haciendo clic (capítulo «Las descripciones»); debajo, el recorrido
              actual cuando no hay nada seleccionado.</div>
            <div class="mx-step"><b>El mapa</b>Donde se colocan y mueven los objetos. Arrastrar la separación de la izquierda ensancha el panel.</div>
            <div class="mx-step"><b>El zoom y la línea de ayuda</b>Acercar, alejar, todo el recorrido, y el control deslizante que aclara el mapa; abajo, lo que hace
              la herramienta actual, la escala y el zoom.</div>
          </div>
          <h3>La cinta</h3>
          <p>Las pestañas siguen el trabajo: <b>Trazado</b> para colocar los controles y los objetos, <b>Recorridos</b> para componer los recorridos, sus variantes y su
            impresión, <b>Mapa</b> para el propio mapa (cambiarlo, alinearlo, georreferenciarlo, cómo se coloca el violeta sobre él), <b>Revisar</b>, <b>Imprimir</b>
            (los PDF y todos los archivos que exportar), <b>Equipo y carrera</b> (el equipo, el terreno, después de la carrera). La página <b>Archivo</b> reúne lo que se usa
            pocas veces: la información del evento, nuevo, abrir, importar, guardar y las versiones, cada archivo que exportar con aquello para lo que sirve,
            compartir, sin conexión y las opciones.</p>
          <p>Un botón en gris dice por qué en su globo de ayuda («Elige primero un recorrido», «a partir del día de la carrera»…): nunca te encuentras con un comando que
            se niega. El globo de cada botón dice también lo que hace y su tecla; F1 abre la guía en su capítulo.
            Algunos ajustes se hacen en la propia cinta, con efecto inmediato: la escala de impresión, la norma y el idioma de las descripciones, el tamaño de los
            círculos, las líneas y los números, cómo se coloca el violeta sobre el mapa y el balizamiento de un tramo, cada uno mostrado en miniatura.</p>
          <h3>La pestaña del objeto seleccionado</h3>
          <p>Seleccionar un control hace aparecer la pestaña <b>Control</b>: su código, su descripción, una horquilla o bucles a partir de él, una línea de texto antes o
            después de él, cortar su círculo, el cambio de mapa, y lo que se sabe de él (sus recorridos, su carga, la longitud hasta el siguiente). Un tramo tiene la pestaña
            <b>Tramo</b> (codo, corte, itinerario, balizamiento), un objeto especial la pestaña <b>Objeto</b> (apariencia, recorridos, vértices), y una línea o una zona
            que se está dibujando la pestaña <b>Dibujo en curso</b>, con «Terminar» y «Cancelar». Seleccionado desde la pestaña Trazado, el objeto abre su pestaña
            por sí solo; desde otra pestaña, su pestaña aparece y parpadea, sin ocupar el lugar de aquella en la que trabajas. Los comandos que necesitan un sitio
            («Añadir un codo», «Cortar el círculo») piden después un clic en el mapa; Esc los cancela.</p>
          <h3>La barra de acceso rápido</h3>
          <p>Junto al título, mantiene a un clic, sea cual sea la pestaña, los comandos que más se usan: deshacer, rehacer, el PDF del
            recorrido actual (para imprimir una prueba, con los últimos ajustes), la revisión del evento y las propiedades del recorrido. Su ▾ añade
            o quita otros (guardar, el PDF de todos los recorridos, el área de impresión, el IOF XML, las versiones, los comentarios, el modo
            terreno…); un clic derecho en cualquier botón de la cinta lo añade, un clic derecho en la barra lo quita. Se guarda en este navegador.</p>
          <h3>Encontrar un comando</h3>
          <p>La <b>búsqueda</b>, arriba (Alt + Q), encuentra un comando por una palabra de su nombre o de lo que hace («horquilla», «gpx», «alinear», «escala»), y
            dice dónde está; Intro lo ejecuta y hace parpadear su botón, para encontrarlo la próxima vez. <b>Alt</b> solo hace aparecer una letra en cada
            pestaña y luego, elegida la pestaña, en cada botón: dos teclas ejecutan cualquier comando sin el ratón.</p>
          <h3>Más espacio para el mapa</h3>
          <p>El botón ▭, arriba a la derecha, pone la cinta en <b>una sola línea</b> de botones pequeños, o solo conserva <b>sus pestañas</b> (Ctrl + F1): entonces se abre
            sobre el mapa al hacer clic en una pestaña y se vuelve a cerrar tras el comando. Si no eliges nada, es <b>automática</b>: completa, en una sola línea
            cuando la ventana tiene menos de 800 píxeles de alto (una pantalla de portátil), y reducida a sus pestañas a pantalla completa (⤢), donde el mapa ocupa todo el
            espacio; Archivo › Opciones ajusta ambos casos. Cuando la ventana es estrecha, los grupos se pliegan solos, empezando por la derecha, cada uno en un
            botón que lo abre.</p>
          <h3>Moverse por el mapa</h3>
          <p>La rueda hace zoom alrededor del ratón; arrastrar donde no hay nada (o arrastrar con el botón derecho) mueve el mapa; las flechas también. Mapa › Vista › Todo
            el recorrido y Todo el mapa reencuadran. Acercarse mucho a un mapa OCAD, Mapper o PDF lo vuelve a dibujar nítido.</p>
          <h3>Seleccionar, mover, eliminar</h3>
          <p>Con la herramienta Selección, un clic selecciona un control, un tramo, un número o un objeto; se resalta en azul, su línea de descripción en amarillo.
            Arrastrar un objeto seleccionado lo mueve. Un objeto seleccionado muestra sus <b>tiradores</b>: los codos de un tramo, los bordes de sus cortes, los vértices de una
            zona, la esquina de las descripciones; se pueden arrastrar. Supr elimina el objeto; en un recorrido, un control solo se quita del recorrido y sigue en
            «Todos los controles».</p>
          <h3>El clic derecho</h3>
          <p>El clic derecho en el mapa abre el menú del objeto bajo el ratón, con exactamente los comandos de su pestaña, grupo por grupo, formulados para
            el sitio en el que se hace clic: para un control, su descripción, una horquilla o bucles, un cambio de mapa, una línea de texto, cortar su círculo aquí, quitarlo;
            para un tramo, un codo o un corte aquí, quitar este codo, el itinerario, el balizamiento; para un objeto, su apariencia, un vértice aquí o este
            vértice, los recorridos en los que aparece. En un botón de la cinta, el clic derecho lo añade a la barra de acceso rápido.</p>
          <h3>El teclado</h3>
          <div class="table-wrap"><table class="data compact tr-doc-tools"><thead><tr><th>Tecla</th><th>Efecto</th></tr></thead><tbody>
            ${KEYS.map(([k, v]) => html`<tr><td style="white-space:nowrap"><b>${k}</b></td><td>${v}</td></tr>`)}</tbody></table></div>
          <p>Solo un miembro del equipo edita a la vez: los demás ven el evento en solo lectura, con un botón «Tomar el control».</p>
        </section>`,
      postes: () => html`
        <section class="mx-slide" id="tr-postes">
          <p class="mx-kicker">${K}</p>
          <h2>Las herramientas y los controles</h2>
          <div class="table-wrap"><table class="data compact tr-doc-tools"><thead><tr><th></th><th>Herramienta</th><th>Tecla</th><th>Qué hace</th></tr></thead><tbody>
            ${TOOLS.map(([k, n, key, v]) => html`<tr><td class="tr-doc-ico">${ic(k, 20)}</td><td style="white-space:nowrap"><b>${n}</b></td><td>${key}</td><td>${v}</td></tr>`)}
          </tbody></table></div>
          <h3>«Todos los controles» y los recorridos</h3>
          <p>La pestaña <b>Todos los controles</b> reúne todos los controles del evento, con sus códigos. Un control colocado ahí aún no pertenece a ningún recorrido. Un
            control colocado en un recorrido entra también en él. Un mismo control sirve para varios recorridos: en un recorrido, los controles de los demás recorridos se muestran en tono pálido
            cuando la herramienta Control está activa (o siempre, con ${W("view-all")}); un clic en uno de ellos lo añade al recorrido.</p>
          <h3>Adónde va un control nuevo</h3>
          <p>En un recorrido, un control colocado va:</p>
          <ul class="mx-list">
            <li>justo <b>después del control seleccionado</b>, si lo hay;</li>
            <li>en el <b>tramo seleccionado</b>, si lo hay;</li>
            <li>si no, en el <b>tramo más cercano</b> al sitio en el que se hace clic.</li>
          </ul>
          <p>Para añadir un control al final del recorrido, selecciona el último control y luego coloca el nuevo. Para insertar uno entre el 3 y el 4, selecciona
            el tramo 3–4, o simplemente haz clic cerca de él. La salida y la meta van siempre al principio y al final.</p>
          <h3>Códigos y números</h3>
          <p>Cada control recibe un <b>código</b> (31, 32…, ajustado por ${W("numbering")}, que por defecto evita los códigos legibles del revés); el
            campo Código de la pestaña Control lo cambia. En un recorrido, el <b>número de orden</b> se coloca solo cerca del círculo, sin estorbar a las líneas; arrástralo para
            ponerlo en otro sitio, y suéltalo sobre su círculo para que vuelva a colocarse solo. Las propiedades del recorrido muestran en su lugar el código, o ambos.</p>
          <h3>Mover un control</h3>
          <p>Arrástralo con la herramienta Selección: sus tramos lo siguen en todos los recorridos. Un control compartido con otros recorridos, movido más de 75 m, hace
            preguntar si hay que moverlo en todas partes o crear uno nuevo para este recorrido. Mayús al arrastrar lo coloca exactamente sobre un control vecino.</p>
        </section>`,
      circuits: () => html`
        <section class="mx-slide" id="tr-circuits">
          <p class="mx-kicker">${K}</p>
          <h2>Los recorridos</h2>
          <p>El «+» al final de las pestañas (o ${W("course-new")}) crea un recorrido. Sus <b>propiedades</b> (${W("course-props")}, o un clic en
            la cabecera de las descripciones):</p>
          <ul class="mx-list">
            <li><b>Nombre</b> y <b>categorías</b>, que se imprimen en la cabecera de las descripciones;</li>
            <li><b>tipo</b>: normal (los controles en orden) o <b>score</b> (los controles en cualquier orden, cada uno con sus puntos);</li>
            <li><b>desnivel</b> y <b>longitud</b>: la longitud se calcula (a lo largo de los codos), el desnivel viene de ${W("rep-climb")} o se escribe;</li>
            <li><b>escala de impresión</b>: un mapa a 1:10 000 puede imprimirse a 1:7 500 para los más jóvenes; círculos y números toman entonces el tamaño que prevé la norma (Mapa › Símbolos); también se cambia en Recorridos › Impresión › Escala;</li>
            <li><b>descripciones</b> en símbolos, en texto o ambos, y la <b>etiqueta</b> de los controles: número de orden, código, o ambos;</li>
            <li>los <b>participantes esperados</b>, para la carga de los controles.</li>
          </ul>
          <p>${W("course-dup")} copia un recorrido para derivar otro; ${W("course-order")} ordena las pestañas. Eliminar un recorrido deja sus controles en
            «Todos los controles» (${W("remove-unused")} los quita).</p>
          <h3>Los tramos</h3>
          <ul class="mx-list">
            <li>Un <b>codo</b> (herramienta Codo) dobla un tramo para rodear una zona prohibida; la longitud sigue la línea.</li>
            <li>Un <b>corte</b> (herramienta Corte, arrastrando) interrumpe una línea o un círculo para dejar legible un detalle del mapa. El trazado también corta
              solo una línea allí donde cruza otro tramo del recorrido (Mapa › Violeta › Apariencia ajusta ese corte).</li>
            <li>El <b>balizamiento</b> (la pestaña Tramo, que muestra cada modo en miniatura, o el clic derecho): todo el tramo, su principio o su final balizados, dibujados con
              guiones.</li>
            <li>Un <b>paso obligatorio</b> (herramienta Paso obligatorio) marca un hueco o un puente por el que el corredor debe pasar.</li>
          </ul>
          <h3>Las variantes: horquillas y bucles</h3>
          <p>En un relevo o una salida en masa, los corredores de un mismo recorrido no hacen todos los mismos controles. Selecciona el control del que salen las variantes
            y luego, en su pestaña Control, Horquilla aquí (ramas que se vuelven a unir más adelante) o Bucles aquí (bucles que vuelven al mismo control), con
            el número de ramas. Aparece un selector sobre el mapa: elige una rama y coloca sus controles como de costumbre. La longitud del
            recorrido se muestra entonces de la variante más corta a la más larga. ${W("relay")} reparte las variantes entre los equipos y sus
            relevistas, de modo que cada equipo corra, sumando todos sus relevistas, todas las ramas; los PDF se imprimen por equipo y por relevista.</p>
          <h3>Varias partes</h3>
          <p>Un <b>cambio de mapa</b> (herramienta Cambio de mapa sobre un control del recorrido) divide el recorrido en partes: aparece un selector de parte, y cada
            parte tiene su área de impresión y se imprime en su propia hoja. ${W("part-options")} muestra o no la meta en una parte.</p>
          <h3>El área de impresión</h3>
          <p>${W("print-area")} elige el papel (A4, A3…), la orientación, los márgenes y la parte del mapa que imprimir; el papel y la orientación también se cambian
            con un clic en Recorridos › Impresión › Papel («según el recorrido» gira la hoja en el sentido del recorrido). El área se coloca sola, centrada en el
            recorrido, o sigue un marco trazado en el mapa. Un área más grande que la hoja se divide en varias páginas que se solapan un poco, o se reduce a su
            centro. ${W("view-printarea")} la muestra con línea de puntos.</p>
          <p><b>Categorías</b>: ${W("classes")} une cada categoría a su recorrido, con sus corredores esperados y, en un relevo, su primer dorsal; un CSV
            «recorrido;categoría;corredores» se importa de una vez. Los equipos de un relevo se numeran entonces categoría por categoría.</p>
        </section>`,
      definitions: () => html`
        <section class="mx-slide" id="tr-definitions">
          <p class="mx-kicker">${K}</p>
          <h2>Las descripciones</h2>
          <p>El panel de la izquierda muestra las descripciones del recorrido actual, tal como se imprimirán. Siguen la norma IOF (2018/2024 por defecto, 2004
            posible: Trazado › Descripciones › Norma): una línea por control, con sus columnas C a H —qué elemento, cuál de ellos, su naturaleza, su tamaño, la ubicación del control.</p>
          <ul class="mx-list">
            <li>Un <b>clic en una línea</b> selecciona el control, y el mapa se centra en él.</li>
            <li>Un <b>segundo clic en una casilla</b> abre los símbolos de esa columna; escribe unas letras para filtrar («cár» da «Cárcava»). La columna F
              acepta también el tamaño del elemento («2 m», «3 × 4»).</li>
            <li><b>Con el teclado</b>, una vez seleccionada la hoja: ↑ ↓ cambian de línea, ← → de casilla, Intro o una letra abre los símbolos, Supr vacía la casilla.</li>
            <li>Un clic en la casilla del <b>código</b> lo cambia; en el <b>título</b>, cambia el título del evento; en la <b>cabecera</b> (longitud, desnivel),
              abre las propiedades del recorrido.</li>
            <li>La línea de la <b>meta</b> (y las de los pasos obligatorios y la entrega de mapa) indica el balizamiento hasta la meta: un clic elige su forma.</li>
            <li>Una <b>línea de texto</b> antes o después de un control (la pestaña Control › Descripciones, o el clic derecho en el control) añade una indicación («Paso por el pueblo»).</li>
          </ul>
          <p>Las descripciones se imprimen en símbolos, en texto, o ambos (las propiedades del recorrido). El texto se compone en el idioma elegido (Trazado ›
            Descripciones › Idioma), entre 23 idiomas; ${W("custom-text")} cambia el texto de un símbolo. Para ponerlas en el mapa, la herramienta Descripciones en el
            mapa: arrastra un marco, su anchura fija el tamaño; la esquina inferior derecha cambia el tamaño, un clic derecho las reparte en varias columnas.
            ${W("pdf-descriptions")} las imprime solas, varias por página, para recortar para los portadescripciones.</p>
          <h3>Leer la descripción en el mapa</h3>
          <p>En un mapa OCAD o Mapper, ${W("auto-desc")} rellena la descripción de un control nuevo según el objeto del mapa que hay debajo: una roca, una
            depresión, un edificio, una unión de caminos. Coloca el control <b>arrastrando</b>: la dirección del arrastre dice de qué lado del elemento está la
            baliza (columna G). ${W("desc-table")} muestra la correspondencia entre los símbolos del mapa y los elementos de descripción, para ajustarla a tu
            mapa, y rellena los controles aún sin descripción. Las curvas de nivel no tienen correspondencia: vaguada o espolón, la línea es la misma.</p>
          <p><b>ISCD 2024</b> es la norma de los eventos nuevos: añade la vía férrea o el tranvía y el volteo del mapa (clic derecho en un control del
            recorrido: el mapa a doble cara se da la vuelta ahí), acepta un código de salida en la columna B («S1», «S2») y pide casillas de 5 a 7 mm, que la
            revisión comprueba. Del lado del mapa, las normas de esquí (ISSkiOM 2019) y de BTT (ISMTBOM 2022) fijan el tamaño de los círculos, la salida, la
            meta y las líneas.</p>
        </section>`,
      speciaux: () => html`
        <section class="mx-slide" id="tr-speciaux">
          <p class="mx-kicker">${K}</p>
          <h2>Los objetos especiales</h2>
          <p>Los más habituales están en la galería de Trazado › Objetos especiales; ▾ o ↘ ${ic("special", 16)} abre la lista completa. Cada uno se coloca a su manera:</p>
          <div class="mx-grid">
            <div class="mx-box" style="--c:var(--s1)"><h3>${ic("water", 18)} Puntos</h3><p>Avituallamiento, puesto de primeros auxilios, punto de paso opcional,
              ruta prohibida, marca de registro: un clic en el sitio deseado.</p></div>
            <div class="mx-box" style="--c:var(--s3)"><h3>${ic("oob", 18)} Líneas y zonas</h3><p>Límite infranqueable, línea, zona prohibida, zona
              peligrosa, construcción temporal, máscara blanca: un clic por vértice, y luego un doble clic (o Intro) para terminar. Una zona se cierra sola.</p></div>
            <div class="mx-box" style="--c:var(--s5)"><h3>${ic("text", 18)} Marcos</h3><p>Texto, imagen, rectángulo, elipse: arrastrar un marco en el mapa, y luego
              escribir el texto (fuente, tamaño, color), elegir la imagen, o la apariencia de la línea.</p></div>
          </div>
          <p>Un objeto se muestra en todos los recorridos, o solo en los elegidos (la pestaña Objeto › Recorridos, o el clic derecho). Sus vértices se
            arrastran; la pestaña Objeto (o el clic derecho) añade o quita un vértice. La <b>máscara blanca</b> borra un trozo de mapa bajo el recorrido (una
            leyenda obsoleta, un detalle que ocultar). Una zona prohibida atravesada por un tramo queda señalada por la revisión del evento.</p>
        </section>`,
      sorties: () => html`
        <section class="mx-slide" id="tr-sorties">
          <p class="mx-kicker">${K}</p>
          <h2>Imprimir y exportar</h2>
          <h3>Los mapas de los recorridos</h3>
          <p>${W("pdf-courses")}: marca los recorridos (y «Todos los controles», para el controlador), y luego elige:</p>
          <ul class="mx-list">
            <li>un solo PDF con una página por recorrido, o un PDF por recorrido, o por parte;</li>
            <li>para las variantes, cada una aparte, todas juntas, o por equipo y relevista;</li>
            <li>el mapa y el recorrido, o el <b>recorrido solo</b>, para una sobreimpresión sobre mapas ya impresos;</li>
            <li>los colores en CMYK (para una imprenta) o en RGB.</li>
          </ul>
          <p>El botón ${ic("printer", 14)} del acceso rápido, arriba, da el PDF del recorrido actual con los últimos ajustes. Cada recorrido se imprime a su escala de impresión, sobre su área de impresión. <b>Imprime el PDF a tamaño real</b> (sin «ajustar a la página»),
            si no, la escala es incorrecta: mide una longitud conocida en la primera hoja.</p>
          <h3>Los demás archivos</h3>
          <div class="mx-grid">
            <div class="mx-box" style="--c:var(--s1)"><h3>${ic("stopwatch", 18)} Cronometraje</h3><p>IOF XML 3.0 (o 2.0.3 para los programas antiguos): los
              recorridos, el orden de los controles, las longitudes, los equipos de los relevos. Para importar en el programa de cronometraje antes de la carrera.</p></div>
            <div class="mx-box" style="--c:var(--s2)"><h3>${ic("descr", 18)} Descripciones, tarjetas</h3><p>El PDF de las descripciones solas, y las tarjetas de
              control con una casilla por control (${W("punch")} dibuja la pinza de cada control).</p></div>
            <div class="mx-box" style="--c:var(--s3)"><h3>${ic("globe", 18)} GPS y mapas en línea</h3><p>GPX de los controles, KML de los recorridos, imágenes de los
              recorridos (PNG, JPEG, GIF) con su archivo de georreferencia, archivos RouteGadget: hace falta un mapa georreferenciado.</p></div>
            <div class="mx-box" style="--c:var(--s4)"><h3>${ic("layers", 18)} OCAD y Mapper</h3><p>Cada recorrido como mapa OCAD (9 a 12, 2018) o Mapper, en
              símbolos de recorrido, con el mapa del evento de fondo: para terminar o imprimir el recorrido con esos programas.</p></div>
            <div class="mx-box" style="--c:var(--s5)"><h3>${ic("export", 18)} Ozimut y Purple Pen</h3><p>El archivo Ozimut (.ozmt) guarda todo el evento, y su
              mapa si quieres, en un solo archivo: una copia, un archivo histórico, el evento para otro club; se vuelve a abrir con «Importar un evento». El
              .ppen se abre en Purple Pen junto al mapa; lo guarda todo, salvo lo que Purple Pen no conoce (los itinerarios, por ejemplo).</p></div>
            <div class="mx-box" style="--c:var(--s6)"><h3>${ic("table", 18)} Tablas</h3><p>Los informes en CSV (separador «;»), para una hoja de cálculo.</p></div>
          </div>
          <p>Cada ventana de exportación vuelve con las opciones elegidas la última vez en este navegador —el formato, la resolución, el número de ejemplares, el
            tamaño de las casillas, los colores…—; solo hay que volver a marcar los recorridos. Cuando un comando crea varios archivos, se escriben en una carpeta elegida (Chrome, Edge) o en un solo .zip; ${W("save-to")}
            cambia esa opción.</p>
          <h3>La apariencia</h3>
          <p>Mapa › Símbolos ajusta el tamaño de los círculos, el grosor de las líneas y la altura de los números (en proporción a la norma); Mapa › Violeta › Apariencia, la fuente y la negrita de los
            números, su contorno blanco, el corte automático de las líneas que se cruzan, el tamaño según la escala de impresión, y el violeta. Los textos colocados en
            el mapa se imprimen en la fuente que indican, con negrita y cursiva, y en todos los idiomas.</p>
          <h3>Plantillas, papeles, doble cara</h3>
          <p>${W("canvases")} guarda con un nombre los ajustes de impresión de un recorrido — papel y orientación, márgenes, área, escala, mapa filtrado,
            fondo impreso — y los aplica a un recorrido o a todos con un clic. El área de impresión conoce los papeles de A2 a A6, B4, B5, SRA3, Tabloid y un
            formato libre. El PDF de los recorridos puede hacer que cada recorrido empiece en un anverso: se intercala una página en blanco donde hace falta,
            y las dos caras de un mapa a voltear quedan espalda con espalda.</p>
          <p><b>Sobreimprimir mapas ya impresos</b>: el desplazamiento de la impresora, una escala fina (del 99 al 101 % compensan la contracción del papel)
            y la impresión en espejo, en el PDF de los recorridos.</p>
          <p><b>Código QR</b>: entre los objetos especiales, un código QR colocado en el mapa lleva al corredor a los resultados, las horas de salida o los
            análisis del evento en Ozimut, o a la dirección que elijas. <b>Mapa Garmin</b>: ${W("export-garmin")} corta el mapa, solo o con un recorrido, en
            teselas de 1024 × 1024 píxeles como máximo, para relojes y GPS Garmin.</p>
        </section>`,
      verifier: () => html`
        <section class="mx-slide" id="tr-verifier">
          <p class="mx-kicker">${K}</p>
          <h2>Revisar</h2>
          <p>La pestaña Revisar da, para todo el evento:</p>
          <ul class="mx-list">
            <li><b>Resumen de los recorridos</b>: longitud, desnivel, número de controles;</li>
            <li><b>Longitudes de los tramos</b>, recorrido por recorrido;</li>
            <li><b>Referencias cruzadas</b>: qué recorridos pasan por qué control;</li>
            <li><b>Carga de los controles y de los tramos</b>: el número de participantes esperados en cada control, para colocar varias estaciones donde haga falta;</li>
            <li><b>Revisión del evento</b>: controles sin usar, descripciones incompletas, códigos inferiores a 31 o legibles del revés, controles demasiado cerca unos de
              otros (al menos 30 m entre dos controles en bosque, 15 m en sprint, y elementos claramente distintos a menos de 60 m, 30 m en sprint), tramos que
              atraviesan una zona prohibida o un límite infranqueable, que pasan por el círculo de otro control, idas y vueltas, tramos demasiado cortos, recorridos que salen de la misma salida hacia el mismo primer control o casi en la misma dirección.</li>
          </ul>
          <p>La revisión se ejecuta sola después de cada cambio: el número de problemas encontrados aparece en la pestaña Revisar —en rojo, en naranja cuando
            solo quedan recordatorios, por ejemplo un desnivel aún sin indicar—, y los primeros en la propia pestaña; un clic abre la revisión completa. El
            grupo «Recorrido actual» da su longitud, su desnivel, su número de controles, su escala y sus participantes esperados.</p>
          <h3>Desnivel y tiempo del ganador</h3>
          <p>${W("rep-climb")} da el desnivel de cada recorrido según el modelo de elevación — entre los controles, a lo largo de los tramos o de las rutas (capítulo «Fondos y relieve»); marca los recorridos para aplicarlo a sus propiedades. ${W("rep-times")} da, para cada recorrido, el tiempo esperado del ganador, según los resultados de las dos últimas
            temporadas, y la longitud que da un tiempo objetivo (capítulo «Sus cálculos»).</p>
          <p>La carga viene del número de participantes de cada recorrido: ${W("load")} la toma de las inscripciones oficiales cuando la carrera figura en ellas.</p>
          <p>La revisión señala también: un recorrido sin salida, sin meta o sin desnivel; dos recorridos idénticos; en sprint, controles a menos de 25 m en
            línea recta, que hay que comprobar por la ruta de carrera; los tramos corridos en ambos sentidos; una descripción sin columna D, o dos elementos
            (D y E) sin cruce ni unión que diga cómo se encuentran; un número de estación escrito dos veces o igual al código de otro control; casillas de
            descripción fuera de los 5 a 7 mm de la norma. Las rutas, su informe y el perfil: capítulo «Las rutas».</p>
        </section>`,
      itineraires: () => html`
        <section class="mx-slide" id="tr-itineraires">
          <p class="mx-kicker">${K}</p>
          <h2>Las rutas</h2>
          <p>${W("routes")} abre el análisis de rutas: para cada tramo del recorrido, la ruta más rápida y sus alternativas, calculadas sobre el mapa, y las
            que dibujes. Es el cálculo de los análisis de los corredores: el mapa se lee símbolo por símbolo (un archivo OCAD o Mapper) o por sus colores (una
            imagen, un PDF), el relieve viene del modelo de elevación, y las zonas prohibidas y los límites que has puesto en el recorrido quedan cerrados.</p>
          <ul class="mx-list">
            <li><b>Calcular</b> trata el recorrido actual; el pequeño ▾ calcula el tramo elegido, o todos los recorridos.</li>
            <li><b>Dibujar</b> añade una ruta a mano en el tramo elegido: una opción que el cálculo no propone, un paso obligado. Se ajusta a los caminos y se
              mide en el mismo modelo (longitud, subida, tiempo), y sigue siendo tuya cuando vuelves a calcular.</li>
            <li>Cada ruta tiene su letra y su color, su <b>longitud</b>, su <b>subida</b> y su <b>tiempo</b> al ritmo del recorrido. La estrella ★ marca la
              ruta principal, la que cuenta para el recorrido; ☆ elige otra. El ojo la oculta, el lápiz la nombra, la papelera la elimina.</li>
            <li>En el mapa, las etiquetas dan «longitud | subida | tiempo»: para la ruta principal, para todas, o ninguna.</li>
            <li><b>El ritmo</b> es el del corredor esperado, en bosque corrible y en llano: da los tiempos, sin cambiar la elección de rutas.</li>
          </ul>
          <h3>Longitud, desnivel, suplemento del sprint</h3>
          <p>Para eso sirven ante todo las rutas. El panel resume el recorrido: su longitud por las rutas principales, lo que añade a la línea recta, su
            subida, su tiempo. «Aplicar al recorrido…» escribe el desnivel en las propiedades del recorrido y, si lo marcas, hace que su longitud siga las
            rutas: es la regla del sprint, donde la longitud anunciada es la de la ruta ideal. Después se actualiza sola. ${W("rep-routes")} lo da todo en un
            texto — cada tramo con sus rutas, cada recorrido con su suplemento —, para imprimir o en CSV, y aplica todos los recorridos de una vez.</p>
          <h3>Ajustes</h3>
          <p>Los ajustes (el botón de reguladores del panel) valen para el evento y los comparte el equipo: el ritmo por defecto, el número de alternativas,
            lo que vale un metro de subida, la prudencia lejos de las líneas, el tiempo para cruzar un talud o una valla, y la velocidad de cada terreno en %
            del bosque corrible. En un mapa OCAD o Mapper, ${W("route-table")} va más lejos: símbolo por símbolo, lo que vale para el cálculo — su tipo
            (camino, verde, infranqueable, ignorado…) y su velocidad —, con vuelta a los valores de Ozimut. Un mapa cuyo verde claro se corre mal, un símbolo
            propio: ese es el lugar.</p>
          <p>Las rutas no se imprimen. El ▾ de «Calcular» guarda una imagen del mapa con ellas, para una reunión de trazadores o un informe.</p>
        </section>`,
      outils: () => html`
        <section class="mx-slide" id="tr-outils">
          <p class="mx-kicker">${K}</p>
          <h2>En equipo y en el terreno</h2>
          <div class="mx-grid">
            <div class="mx-box" style="--c:var(--s1)"><h3>${ic("team", 18)} El equipo</h3><p>${W("team")}: crea un enlace de invitación para un rol y pásalo; quien lo abre con la sesión iniciada se une al equipo, sea federado en la FFCO o no.
              El trazador y el controlador editan, el lector lee y comenta. Solo uno edita a la vez; los demás pueden «tomar el control».</p></div>
            <div class="mx-box" style="--c:var(--s2)"><h3>${ic("comment", 18)} Comentarios</h3><p>${W("comments")}: un comentario fijado en un
              sitio del mapa, respuestas, y «Hecho» cuando está resuelto; el número de los que siguen abiertos aparece en la pestaña.</p></div>
            <div class="mx-box" style="--c:var(--s3)"><h3>${ic("history", 18)} Versiones</h3><p>${W("versions")}: cada versión, lo que ha cambiado desde entonces
              («control 34 movido 40 m»), y volver a abrirla.</p></div>
            <div class="mx-box" style="--c:var(--s4)"><h3>${ic("phone", 18)} Modo terreno</h3><p>En el teléfono, el mapa georreferenciado con tu posición GPS, el
              control más cercano, su distancia y su dirección; cada control marcado como colocado, verificado, recogido o con problema, con una foto.</p></div>
            <div class="mx-box" style="--c:var(--s5)"><h3>${ic("offline", 18)} Sin conexión</h3><p>${W("offline")} guarda el evento en el dispositivo:
              se abre sin red, y los cambios se envían cuando vuelve la red.</p></div>
            <div class="mx-box" style="--c:var(--s6)"><h3>${ic("box", 18)} Recogida</h3><p>${W("rep-pickup")}: a qué hora se puede recoger cada
              control, y el orden de recogida de cada recogedor.</p></div>
            <div class="mx-box" style="--c:var(--s1)"><h3>${ic("tour", 18)} Ruta de controles</h3><p>${W("tour")}: el camino más rápido por los controles marcados (por defecto, todos), para el controlador y para quien los
              coloca o los recoge; numerado en el mapa, exportado en GPX, como imagen o en CSV, o convertido en recorrido con su descripción y su tarjeta de control.</p></div>
          </div>
          <p>La ruta de controles sale de la salida, de un control o del mejor situado, y termina en la meta, en su punto de salida o en cualquier
            sitio; cuenta el ritmo elegido y el tiempo en cada control. El mapa se lee como para los itinerarios calculados de los análisis (un mapa OCAD
            o Mapper por sus símbolos, cualquier otro por sus colores), con las zonas prohibidas y límites del trazador cerrados y el relieve contado
            cuando el mapa está georreferenciado; el orden es el más rápido encontrado (exacto hasta 10 controles). «Crear el recorrido» la convierte en un recorrido del evento, con sus controles en el orden de la ruta (un recorrido de prueba,
            fuera de los informes): el panel imprime entonces su mapa, su descripción de controles y su tarjeta de control.</p>
          <p>Además: ${W("import-course")} toma los controles de un recorrido impreso (un PDF o una foto de una carrera pasada), para revisarlos después;
            ${W("view-others")} muestra otros recorridos en tono pálido, para evitar cruces y controles demasiado cercanos.</p>
          <h3>Prestar el mapa</h3>
          <p>El dueño de un mapa no siempre quiere regalarlo. En ${W("team")}, «Mapa prestado» — en un miembro, o en un enlace de invitación — deja trazar
            sobre el mapa sin poder imprimirlo ni exportarlo: los PDF salen solo con el recorrido. Un navegador solo puede disuadir de copiar (el mapa está en
            pantalla), no impedirlo. Los análisis tienen el mismo ajuste: «Exportar una imagen del mapa», que los organizadores desmarcan.</p>
        </section>`,
      apres: () => html`
        <section class="mx-slide" id="tr-apres">
          <p class="mx-kicker">${K}</p>
          <h2>Después de la carrera</h2>
          <p>El día de la carrera o después (nunca antes: los recorridos siguen siendo secretos, y los botones de Equipo y carrera › Después de la carrera siguen en gris hasta entonces), el
            trazador puede:</p>
          <ul class="mx-list">
            <li><b>publicar los recorridos en el análisis</b> (${W("publish")}): cada recorrido llega con su mapa y su calibración, y los corredores solo tienen que subir
              su track GPS. La misma ventana ajusta todo el análisis: su nombre (que puede ser distinto del del evento), su fecha, quién lo abre (todas las cuentas, con o sin
              visitantes, el club, una contraseña), las acciones activadas para los corredores; después «Publicar», o «Guardar como borrador» (solo lo ven sus
              organizadores). Una ventana sigue el avance — cada recorrido se imprime en su mapa y se envía — y luego abre el análisis con un clic, igual que su página de
              gestión (pestaña «Análisis» del evento, en Orga, donde todo sigue siendo modificable). Una nueva publicación crea otro análisis o, a elección, actualiza uno de los ya
              publicados desde el evento (sus recorridos y ajustes reemplazados, los tracks compartidos conservados); una competición tiene un solo análisis;</li>
            <li><b>enviar los recorridos a «Resultados»</b> (${W("send-results")}): un complemento de los resultados, no resultados. El archivo de resultados que
              exporta el software de cronometraje (MeOS, OE…) en IOF XML ya da la longitud, el desnivel y los controles de cada recorrido: con él, este envío no aporta
              nada. Sirve cuando los resultados publicados vienen de otra parte — un PDF, liveresultat, WinSplits, O'Live, una página HTML sin cabecera de recorrido — y
              no tienen esos datos. Los recorridos del trazado (en IOF XML) se asocian entonces a los de los resultados por su nombre («Recorrido A» = «A») o por sus
              controles, y solo se completan los valores que faltan, nunca los tiempos ni los puestos: la página de resultados de la carrera muestra la longitud y el
              desnivel, «Arena › Análisis» nombra los controles por sus códigos, y el desnivel de las carreras pasadas alimenta las estimaciones del tiempo del
              ganador de los recorridos por trazar. Hace falta un evento vinculado a una competición, ser miembro del club organizador y aceptar la publicación; nada
              aparece antes del día siguiente a la carrera, y un nuevo envío sustituye al anterior;</li>
            <li>leer el <b>balance</b> (${W("rep-after")}): para cada tramo, el mejor tiempo y el tiempo mediano, la proporción de corredores que se
              equivocaron en él, los errores de tarjeta (¿una estación que revisar?), y las <b>rutas</b> elegidas, según los tracks compartidos en el análisis.</li>
          </ul>
        </section>`,
      ruban: () => {
        // each item of a group: a command, a setting, a figure, the gallery
        const flat = (items) => items.flatMap((it) => (it.t === "stack" ? flat(it.items) : [it]));
        const entry = (it) => {
          if (it.t === "field") { const f = TRD.INFO.field[it.id] || [it.id, ""]; return html`<dt>${ic("sliders", 16)}<span>${f[0]}</span></dt><dd>${f[1]}</dd>`; }
          if (it.t === "chip") return html`<dt>${ic("list", 16)}<span>${{ issues: "Los problemas", course: "El recorrido actual", mapInfo: "El mapa", geoInfo: "¿Georreferenciado?", control: "El control", leg: "El tramo", special: "El objeto", drawing: "El dibujo" }[it.id] || ""}</span></dt><dd>${TRD.INFO.chip[it.id] || ""}</dd>`;
          if (it.t === "modes") return html`<dt>${ic("palette", 16)}<span>${it.id === "blend" ? "Encima, Mezclado, En capas" : "Ninguno, Todo, El principio, El final"}</span></dt><dd>${TRD.INFO.modes[it.id]}</dd>`;
          if (it.t === "gallery") return html`<dt>${ic("special", 16)}<span>La galería</span></dt><dd>${TRD.INFO.gallery}</dd>`;
          return html`<dt>${ic(it.icon, 16)}<span>${it.label}${it.key && it.key.length === 1 ? ` (${it.key})` : ""}</span></dt><dd>${it.tip || MENU_HELP[it.act] || ""}${it.split ? ` El pequeño ▾: ${it.split.map((x) => x[1]).join(", ")}.` : ""}</dd>`;
        };
        const groups = (gs) => gs.map((g) => html`<h4 class="tr-doc-gh">${g.title || "—"}${g.pro ? " — nivel avanzado" : ""}</h4><dl class="tr-doc-menu">${flat(g.items).map(entry)}</dl>`);
        return html`
        <section class="mx-slide" id="tr-ruban">
          <p class="mx-kicker">${K}</p>
          <h2>La cinta de opciones, pestaña por pestaña</h2>
          <p>Cada comando de la cinta, con el icono que lleva en el trazado: las pestañas, las del objeto elegido y, después, el menú Archivo: sus listas (formatos de exportación, importaciones, compartir) se abren en una ventana donde cada archivo dice para qué sirve.</p>
          ${TRD.TABS.filter((tb) => tb.groups).map((tb) => html`<h3 class="tr-doc-mh">${ic(tb.icon, 20)}<span>${tb.label}</span></h3>${groups(tb.groups)}`)}
          <h3 class="tr-doc-mh">${ic("select", 20)}<span>Las pestañas del objeto elegido</span></h3>
          ${Object.values(TRD.CONTEXT).map((c) => html`<h4 class="tr-doc-gh">${c.label}</h4><dl class="tr-doc-menu">${c.groups.flatMap((g) => flat(g.items)).map(entry)}</dl>`)}
          <h3 class="tr-doc-mh">${ic("file", 20)}<span>El menú Archivo</span></h3>
          ${TRD.BACKSTAGE.map((sec) => html`<h4 class="tr-doc-gh">${sec.label}</h4><dl class="tr-doc-menu">${
            sec.act ? html`<dt>${raw(TR.actIcon(sec.act, 16))}<span>${sec.label}</span></dt><dd>${MENU_HELP[sec.act] || ""}</dd>`
              : sec.id === "info" ? html`<dt>${ic("sliders", 16)}<span>Información</span></dt><dd>El evento: su mapa, sus recorridos, tu rol, el cifrado; sus propiedades, su equipo.</dd>`
                : sec.id === "options" ? html`<dt>${ic("sliders", 16)}<span>Opciones</span></dt><dd>La cinta completa, en una línea o solo sus pestañas; la barra de acceso rápido; los archivos múltiples.</dd>`
                  : [...(sec.items || []), ...(sec.groups || []).flatMap((x) => x[1])].map(([act, l, d]) => html`<dt>${raw(TR.actIcon(act, 16))}<span>${l}</span></dt><dd>${d}</dd>`)}</dl>`)}
        </section>`;
      },
      avance: () => html`
        <section class="mx-slide" id="tr-avance">
          <p class="mx-kicker">${K}</p>
          <h2>El nivel avanzado</h2>
          <p>El trazado tiene dos niveles. El nivel <b>esencial</b>, para todos, hace lo que hace un archivo de Purple Pen, más el trabajo en
            equipo, el terreno, las comprobaciones y el después de la carrera de Ozimut. El nivel <b>avanzado</b> añade lo que hace Condes, otro
            programa de trazado, para necesidades más específicas; está abierto a todos. Sus botones llevan un pequeño punto naranja.
            Un archivo de Purple Pen (.ppen) no conserva estos añadidos: la exportación indica antes lo que deja fuera; el archivo Ozimut
            (.ozmt) lo conserva todo.</p>
          <h3>Venir de otro programa</h3>
          <p>${W("import-courses")} toma los controles, los recorridos, las categorías y los equipos de relevos de un IOF XML (3.0 o
            2.0.3) exportado de Condes, de OCAD, de Purple Pen o de un programa de cronometraje, o los recorridos de un mapa de OCAD preparado
            con su módulo de trazado (comprobado con un archivo de OCAD 2018: controles, descripciones, salida, recorridos). Un IOF XML
            depositado con su mapa en «Importar un evento» crea el evento. Las variantes llegan como recorridos aparte.</p>
          <h3>Las categorías</h3>
          <p>${W("classes")}: cada categoría, su recorrido y sus participantes previstos. De ahí se deducen la lista de categorías de un recorrido y sus
            participantes, y con ellos la carga de los controles.</p>
          <h3>Variantes y relevos</h3>
          <p>El <b>rombo</b> (${W("var-phi")}) va del control elegido al siguiente: dos ramas corridas una tras otra, con
            un retorno entre ellas; las variantes se llaman AB y BA. Los controles de cada rama y del retorno se añaden eligiendo
            la variante encima del mapa. Una horquilla o unos bucles pueden tener hasta 20 ramas. En ${W("relay")}:
            llenar los equipos con las mismas variantes en otro orden, acoplar horquillas («A=C»: quien corre A corre C en la
            misma posta), marcar las postas en que se corre cada rama y modificar los equipos a mano (dorsal, nombre, variante de
            cada posta), con en rojo las casillas que hacen a un equipo distinto de los demás.</p>
          <h3>Formas y disciplinas</h3>
          <p>Las propiedades de un recorrido dan su <b>forma</b> —normal, recorrido marcado (la línea seguida a lo largo de las rutas
            dibujadas), trail-O—, las líneas entre los controles o no, su <b>disciplina</b> (MTB-O: longitudes a lo largo de las rutas;
            Ski-O: un punto en el centro de los círculos), el rogaine (puntos = código redondeado a la decena) y «todos los controles». Un control
            puede estar en <b>orden libre</b> (${W("random-section")}): sin línea hacia, entre ni desde los controles de la sección, y una
            línea en las descripciones de control. ${W("finish-at-start")} dibuja la meta sobre la salida.</p>
          <p>Los símbolos de <b>MTB-O</b> (ISMTBOM 2022) están en los objetos especiales: sentido único obligatorio, ruta prohibida,
            sección peligrosa, obstáculo en la pista, paso prohibido; están dibujados según la descripción de la norma, y sus
            dimensiones están pendientes de comprobar.</p>
          <h3>Controles y descripciones</h3>
          <p>Las propiedades de un control añaden sus otras estaciones, un bloqueo (ya no se mueve al arrastrarlo) y, en trail-O, sus
            balizas («A–E», en la columna B) y su respuesta correcta. Una casilla de la descripción puede llevar un segundo símbolo (marcando
            «2.º símbolo» al elegirlo); ${W("my-symbols")} añade símbolos tuyos, sacados de dibujos SVG; las propiedades del
            evento ponen su fecha tras el título.</p>
          <h3>Comprobar y medir</h3>
          <p>${W("view-angles")} muestra el giro en cada control (en rojo por encima de 120°), ${W("view-nearest")} rodea los controles
            demasiado cercanos; ${W("rep-controls")} da cada control con sus estaciones y el control más cercano, ${W("trail-answer")} las
            respuestas correctas. Un tramo puede tener varias rutas (${W("routes-alt")}), y la longitud toma la más corta. Fuera
            de Francia, el desnivel viene de las teselas de terreno abiertas (SRTM, de unos 30 m).</p>
          <h3>Maquetación e impresión</h3>
          <p>Los objetos especiales añaden la <b>ampliación</b> (un marco que muestra otra parte del mapa, ampliada, con el
            recorrido) y la <b>máscara</b> (blanca, con agujeros). El PDF de los recorridos añade: varios recorridos o copias por hoja,
            todos los recorridos en un mismo mapa, el reverso de cada mapa (nombre, categorías, equipo y posta), marcas de registro con
            el desplazamiento de la impresora, y páginas georreferenciadas (Avenza Maps). Las descripciones se colocan con precisión de centésima de milímetro,
            y las tarjetas de control pueden ser tarjetas de reserva.</p>
          <p>Para una <b>imprenta offset</b>, los colores del PDF pueden ser <b>tintas planas</b>: las que define un mapa de OCAD, y el
            violeta en una tinta aparte (o en una de las tintas del mapa, si se le da su nombre), con la sobreimpresión real de PDF. Las
            <b>separaciones</b> dan una página por plancha —cada tinta plana, o C, M, Y y K—, en negro, con sus marcas de registro y su
            nombre; requieren un mapa de OCAD o Mapper, o solo el recorrido. Es el mismo motor que las separaciones de Carto.</p>
          <h3>Otros formatos</h3>
          <p>${W("export-geotiff")}, SVG (cada objeto con nombre), KMZ con el mapa, MapRun, el texto OCAD de los recorridos, IOF XML 2.0.3 con
            cada variante como un recorrido, y un paquete para la página de importación de Livelox (el envío directo a Livelox requiere un acuerdo con
            Livelox).</p>
          <h3>Mapas</h3>
          <p>${W("maps")}: otros mapas en el evento, alineados con el primero (por sus georreferencias, el mismo marco o dos
            puntos en cada uno), y el mapa de cada parte de un recorrido. ${W("map-templates")} muestra las plantillas que se le dan a un mapa de OCAD. ${W("field-states")} da nombre a los estados de los
            controles en el modo de campo.</p>
        </section>`,
      calculs: () => html`
        <section class="mx-slide" id="tr-calculs">
          <p class="mx-kicker">El trazado</p>
          <h2>Sus cálculos, explicados</h2>
          <h3>El tiempo del ganador</h3>
          <p>En los resultados oficiales de las dos últimas temporadas (más o menos un centenar de carreras del mismo formato), se anota para cada recorrido el ritmo del
            ganador, en minutos por kilómetro, y su CN oficial 15 días antes. Cuanto más alto es el CN, más rápido es el ritmo: la relación se ajusta de una
            vez por todas y da el ritmo de un ganador con un CN dado. Por ejemplo, en un mismo recorrido, un ganador con CN 6 500 corre aproximadamente 1,3 veces
            más rápido que un ganador con CN 3 000.</p>
          <p>Los resultados oficiales no dan el desnivel de los recorridos; los archivos de los organizadores lo dan a menudo («Resultados»). En esos recorridos se compara el
            tiempo del ganador con el que su CN hace esperar, según el desnivel por kilómetro: cuanto más sube el recorrido, más tarda el ganador.
            Para no fiarse de unos pocos recorridos, la medida se acerca a la regla del kilómetro-esfuerzo (100 m de subida equivalen a 1 km llano, es decir,
            +10 % de tiempo por cada 10 m más por kilómetro), tanto más cuanto más imprecisa es. En larga distancia, la medida reproduce esta regla; en sprint,
            donde se corre rápido y cada subida cuesta más, es más fuerte.</p>
          <p>Cada estimación da una horquilla: la mitad de las carreras de referencia tienen un tiempo del ganador dentro de esa horquilla, porque el terreno,
            la vegetación y la dificultad técnica, que cuentan mucho, no entran en el cálculo.</p>
          <h3>Los errores y las rutas</h3>
          <p>Un error, como en «Tiempos parciales»: al menos un 20 % y 10 segundos perdidos en el tramo respecto al ritmo del corredor en
            toda su carrera. Dos rutas son la misma cuando los dos tracks se mantienen a menos de un quince por ciento aproximado de la longitud del
            tramo (25 m como mínimo) el uno del otro en todo su recorrido; el lado («por la izquierda», «recto») se lee respecto a la línea recta.</p>
          <h3>El plan de recogida</h3>
          <p>Un control puede recogerse cuando el último corredor de cada recorrido que pasa por él ya ha pasado: su hora de salida, más la distancia hasta el control
            al ritmo de un corredor lento (15 min/km en bosque, 9 en sprint, en línea recta), más un margen. Los controles se reparten entre los recogedores por
            sector, y cada uno los recoge en el orden en que puede alcanzarlos.</p>
          <h3>Las rutas y el desnivel</h3>
          <p>El cálculo de rutas coloca sobre el mapa una malla de unos 1,5 m (1 m en sprint). Cada celda tiene una velocidad — la de su terreno, en % del
            bosque corrible — y una altitud. Correr de una celda a la vecina cuesta la distancia dividida por la velocidad, más la pendiente: un metro de
            subida equivale a 8 m en llano. Lejos de caminos, arroyos y límites claros, la prudencia añade hasta un 20 %: ahí se corre más despacio porque hay
            que leer. Cruzar un talud o una valla cuesta 10 segundos. La ruta más rápida es el camino de menor coste; las alternativas son los otros caminos
            realmente distintos, mientras no sean un 25 % más lentos. El tiempo mostrado es ese coste, sin la prudencia, al ritmo indicado.</p>
          <p>La subida de una ruta se lee en el modelo de elevación, un punto cada pocos metros, suavizada sobre tres puntos para que los pequeños bultos del
            modelo no se sumen: es la misma cifra en el panel, el informe, el perfil y «Desnivel».</p>
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
          <p class="mx-kicker">Clubes</p>
          <h2>Clasificaciones de clubes</h2>
          <p>Un club se clasifica según dos elecciones independientes, sobre los corredores de un sexo y un tramo de edad determinados (jóvenes: hasta M/F 20;
            adultos: M/F 21 y más; élite: solo M/F 21).</p>
          <div class="mx-grid">
            <div class="mx-box" style="--c:var(--s1)"><h3>Lo que se cuenta</h3><p>El <b>CN</b> de cada corredor clasificado, en el método elegido, o sus
              <b>puntos en carreras nacionales</b>.</p></div>
            <div class="mx-box" style="--c:var(--s3)"><h3>Cómo se suma</h3><p>La <b>suma</b>, que mezcla el número de corredores y su nivel; la
              <b>media</b>, el nivel del corredor medio; el <b>top 5</b>, la media de los cinco mejores, contando 0 un corredor que falte; o el <b>número de corredores</b>.</p></div>
          </div>
        </section>
        <section class="mx-slide" id="elite">
          <p class="mx-kicker">Clubes</p>
          <h2>Puntos en carreras nacionales</h2>
          <p>Estos puntos no dependen de ningún método de CN: se basan en los puestos. En las carreras de nivel nacional (campeonatos de Francia,
            nacionales, carreras de selección, es decir, los grupos A y B1), los 10 primeros de cada categoría suman 25, 18, 15, 12, 10, 8, 6, 4, 2 y 1
            puntos. Los puntos se <b>duplican en los campeonatos de Francia</b>. Una categoría se asigna al recorrido donde corrió la mayoría de sus
            corredores. La página de clubes cuenta los puntos de los 12 meses anteriores a la fecha elegida; la comparación de clubes los muestra temporada a temporada.</p>
        </section>
        <section class="mx-slide" id="cfc">
          <p class="mx-kicker">Clubes</p>
          <h2>Copa de Francia de clubes</h2>
          <p>El sitio aplica a cada temporada la regla 2026 de la FFCO («Classement national des clubs», anexo 2). Para cada corredor se toman sus
            5 mejores puntuaciones oficiales del año a pie y sus 5 mejores en MTB-O o en Ski-O; los puntos de las mujeres se multiplican por 1,4; el club
            suma los puntos de sus corredores. Este cálculo no es oficial: cuentan todos los corredores clasificados, porque el sitio no conoce el tipo de
            licencia, y el club de un corredor es el de su última carrera del año. La copa no se otorgó de 2023 a 2025.</p>
        </section>`,
      coureurs: () => html`
        <section class="mx-slide" id="progression">
          <p class="mx-kicker">Corredores</p>
          <h2>Progresión por edad</h2>
          <p>Para cada temporada y cada categoría (M14, F21, M45…), el sitio toma los CN de todos los corredores clasificados al final de la temporada y observa
            cómo se reparten: la mediana, y las zonas donde se encuentran la mitad y las cuatro quintas partes de los corredores. Cada mes, el CN de un
            corredor se sitúa en ese reparto: su <b>percentil</b> es la proporción de corredores de su categoría con un CN inferior o igual. Un
            corredor en el percentil 90<sup></sup> lo hace mejor que el 90 % de su categoría. La curva «todas las temporadas» agrupa las temporadas desde 2012: es
            una fotografía del conjunto de los corredores, no el seguimiento de una misma generación.</p>
        </section>
        <section class="mx-slide" id="categories">
          <p class="mx-kicker">Corredores</p>
          <h2>Las categorías una al lado de otra</h2>
          <p>La página «Categorías» muestra, a un fin de mes, el reparto de los CN de cada categoría en un mismo eje: una banda clara del percentil
            10<sup></sup> al 90<sup></sup>, la mitad central más oscura (del 25<sup></sup> al 75<sup></sup>), la mediana y la media. Se
            ve de un vistazo dónde se solapan las categorías: en bosque, en octubre de 2026, el índice Ozimut mediano de los M55 equivalía al de los M16.</p>
          <p>Los puntos señalan <b>a los mejores de cada categoría</b>, con una sola regla, la misma en todas partes: en cada categoría
            de al menos 5 corredores clasificados, su 2 % mejor (redondeado a la unidad inferior), y al menos su primero; con CN igual en el
            límite, todos. Una categoría de 76 corredores muestra, pues, uno; una de 192, tres; una de 275, cinco. Una
            regla basada en la dispersión de cada categoría (detectar los CN que «se salen de la caja» de un diagrama de caja) habría
            tratado las categorías de forma distinta: cuanto más dispersa es una categoría, más ventaja hace falta para salirse, y categorías
            enteras se habrían quedado sin nadie. Para cada uno, la página da su puesto en su categoría, cuántas veces vale la mediana
            de esta, y su percentil si corriera en M21 o en F21.</p>
        </section>
        <section class="mx-slide">
          <p class="mx-kicker">Corredores</p>
          <h2>La página de un corredor</h2>
          <ul class="mx-list">
            <li><span><b>Cálculo del CN</b>: en cualquier fecha, las carreras de los últimos 12 meses, las que cuentan y el CN que resulta, recalculado
              exactamente, con los mismos redondeos y la misma regla de plazas, a partir de las puntuaciones publicadas carrera por carrera.</span></li>
            <li><span><b>Historial del CN</b>: cada carrera que entra en los últimos 12 meses y cada carrera que sale, con el CN resultante y su
              variación. Para el CN oficial, es el historial publicado por la FFCO, leído en directo.</span></li>
            <li><span><b>Progresión</b>: el CN mes a mes, y luego el puesto del corredor en su categoría de edad. Tras un cambio de método, el método
              anterior sigue mostrándose en gris durante la visita.</span></li>
            <li><span><b>Mapa</b>: las carreras por departamento. <b>Temporadas</b>: el balance de cada temporada. <b>Red</b>: los corredores con los que ha coincidido.</span></li>
          </ul>
        </section>`,
      reseau: () => html`
        <section class="mx-slide" id="reseau">
          <p class="mx-kicker">Red</p>
          <h2>Quién corre con quién</h2>
          <p>Dos corredores «coinciden» cuando corren el mismo recorrido. Sobre todas las temporadas, el sitio guarda para cada corredor los 30 corredores
            con los que ha coincidido más a menudo, al menos 2 veces; para una temporada, los recalcula con los resultados de esa temporada. También cuenta cuántas
            veces cada uno terminó por delante del otro. Un corredor no clasificado (error de tarjeta, abandono…) queda detrás de todos los clasificados.</p>
        </section>
        <section class="mx-slide">
          <p class="mx-kicker">Estadísticas</p>
          <h2>Territorios, participación, edades</h2>
          <ul class="mx-list">
            <li><span><b>Territorios</b>: el número de competiciones organizadas, de corredores, y de competiciones por cada 100 corredores, por liga regional o por
              departamento. Una competición se asigna a su organizador: el club (las dos primeras cifras de su número dan el departamento), el
              comité departamental o la liga regional.</span></li>
            <li><span><b>Participación</b>: las grandes cifras temporada a temporada, para todos, para una liga regional o para un club, en una disciplina o en
              todas.</span></li>
            <li><span><b>Edades</b>: el reparto de los corredores entre las categorías de edad, mujeres a la izquierda, hombres a la derecha, como proporción del conjunto elegido.</span></li>
            <li><span><b>Los más activos</b>: los corredores que más carreras corrieron, en todas las temporadas, la última o la actual, con el número de
              cada tipo (larga y media distancia, nocturna, sprint, MTB-O, ski-O). Los errores de tarjeta y los abandonos cuentan: el corredor tomó la salida.</span></li>
          </ul>
        </section>`,
      relais: () => html`
        <section class="mx-slide">
          <p class="mx-kicker">Relevos</p>
          <h2>El simulador de relevos</h2>
          <ul class="mx-list">
            <li><span><b>El modelo</b>: el tiempo de un corredor en una posta es inversamente proporcional a su CN. Un corredor con un CN el doble de alto tarda
              la mitad. El tiempo de referencia de cada posta se ajusta para que el mejor equipo de todos los clubes haga exactamente la
              suma de los tiempos de referencia del formato (en el CNE, la media de los 5 mejores equipos).</span></li>
            <li><span><b>Los formatos</b> siguen las reglas 2026 de la FFCO: CFC N1 a N4 con sus condiciones de composición y sus postas reservadas (las
              primeras y últimas postas de mujeres y hombres se alternan según el año sea par o impar), CNE hombres, mujeres, jóvenes y mini, relevos por
              categoría, relevos sprint (2 mujeres, 2 hombres, en el orden F-M-M-F). También se puede componer un formato propio.</span></li>
            <li><span><b>El mejor equipo es de verdad el mejor</b>: el sitio prueba todas las formas de repartir las condiciones entre las postas, y luego
              elige a los corredores con un método exacto de asignación (el algoritmo húngaro). La edad y el sexo vienen de la categoría: un veterano que
              corre en M21 cuenta como M21. Se puede modificar el primer equipo corredor a corredor, y añadir a los corredores que no tienen CN
              (extranjeros, corredores solo de relevos) con el CN que se les atribuya.</span></li>
          </ul>
        </section>`,
      limites: () => html`
        <section class="mx-slide" id="limites">
          <p class="mx-kicker">Para tener en cuenta</p>
          <h2>Límites y precauciones</h2>
          <ul class="mx-list bad">
            <li><span>Los datos proceden del sitio de la clasificación nacional de la FFCO. Una carrera ausente, mal introducida o corregida después puede explicar una
              diferencia.</span></li>
            <li><span>El método Ozimut parte de los CN de 2010; sus primeros meses reflejan sobre todo ese punto de partida.</span></li>
            <li><span>Sus índices no sustituyen en ningún caso a la clasificación oficial, que sigue siendo la única referencia.</span></li>
            <li><span>Las clasificaciones mensuales se calculan a final de mes; la página de un corredor detalla el cálculo en cualquier fecha.</span></li>
            <li><span>Los resultados provisionales son los de los organizadores, antes de cualquier corrección de la FFCO.</span></li>
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
  let agreement = meta.agreement || null;      // (its own file since 2026-11-17, data.metaMore: read when the chart is drawn)
  function drawAgreement() {
    if (!$("#agr-filters", main)) return;
    if (!agreement) { data.metaMore().then((m) => { agreement = m?.agreement || {}; drawAgreement(); }).catch(() => { agreement = {}; drawAgreement(); }); return; }
    $("#agr-filters").innerHTML = html`<div class="field"><span>${t("f.terrain")}</span>${seg("agt", TERRAINS.filter((x) => agreement[x]?.length).map((x) => [x, t(`terrain.${x}`)]), agTerrain)}</div>`;
    $$('[data-seg="agt"]').forEach((b) => b.addEventListener("click", () => { agTerrain = b.dataset.value; drawAgreement(); }));
    const pts = agreement[agTerrain] || [];
    const series = computed.map((m) => ({
      m, name: methodShort(m), color: methodColor(m),
      data: pts.filter((p) => p[0] && p[AGREE_COL[m]]).map((p) => [p[0], p[AGREE_COL[m]]]),
    }));
    const max = Math.ceil(Math.max(0, ...pts.flat().filter(Boolean)) / 1000) * 1000;
    $("#agr-legend").innerHTML = legend(series.map((s) => ({ label: `${s.name} / ${methodShort("official")}`, color: s.color, dot: true })));
    scatterChart($("#agr"), { series, xName: methodLabel("official"), yName: "Índice Ozimut", max });
    const stat = (name, pairs) => {
      const d = pairs.map((p) => p[1] - p[0]);
      return { name, n: pairs.length, r: pearson(pairs.map((p) => p[0]), pairs.map((p) => p[1])), bias: mean(d), mae: mean(d.map(Math.abs)) };
    };
    const stats = series.map((x) => stat(`${x.name} / ${methodShort("official")}`, x.data));
    $("#agr-stats").innerHTML = html`<div class="table-wrap"><table class="data compact"><thead><tr>
      <th>Métodos comparados</th><th class="r">Corredores</th><th class="r">Correlación</th><th class="r">Diferencia media</th><th class="r">Diferencia media absoluta</th></tr></thead>
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
      <div class="field"><span>Medida</span>${seg("evm", EVM.map((m) => [m, EV_LABEL[m]]), evMeas)}</div>
      <div class="field"><span>Carreras</span>${seg("evs", [["all", "todas"], ["nat", "nacionales"]], evScope)}</div>`;
    $$('[data-seg="evm"]').forEach((x) => x.addEventListener("click", () => { evMeas = x.dataset.value; drawEval(); }));
    $$('[data-seg="evs"]').forEach((x) => x.addEventListener("click", () => { evScope = x.dataset.value; drawEval(); }));
    $("#ev-seasons").innerHTML = html`${["For", "Spr"].map((tr) => {
      const rows = evRows(tr, evScope);
      const items = [...evSeasons(tr, evScope).map((y) => ({ label: y, d: rows[y].d[evPair][evMeas], n: rows[y].comps })),
        ...[["holdout", `${ev.holdout[0]}–${String(ev.holdout[1]).slice(2)}`], ["tuned", "ajuste"]]
          .filter(([k]) => rows[k]).map(([k, label]) => ({ label: html`<b>${label}</b>`, d: rows[k].d[evPair][evMeas] }))];
      const up = items.filter((i) => i.d[1] > 0).length, against = items.filter((i) => i.d[2] < 0).length;
      return html`<section class="card"><div class="card-head"><div><h2>${t(`terrain.${tr}`)} · ${pairLabel(evPair)}</h2>
        <div class="hint">${EV_LABEL[evMeas]} (diferencia en puntos)</div></div></div>
        <div class="card-body">${forestPlot(items, evMeas)}
          <p class="muted" style="font-size:12.5px;margin:8px 0 0">Diferencia significativa a favor de «${methodShort(evPair.split("-")[0])}»:
            ${fmt(up)} línea${up > 1 ? "s" : ""} de ${fmt(items.length)}; a favor de «${methodShort(evPair.split("-")[1])}»: ${fmt(against)}.</p></div></section>`;
    })}`;
    const shown = M.filter((m) => ev.methods.includes(m));
    $("#ev-periods").innerHTML = html`
      <div class="filters"><div class="field"><span>Período</span>${seg("evq", [["holdout", `${ev.holdout[0]}–${ev.holdout[1]} (temporadas reservadas)`],
        ["tuned", "julio de 2025 – octubre de 2026 (ajuste)"]], evPeriod)}</div></div>
      <div class="grid grid-2">${["For", "Spr"].map((tr) => {
        const e = evRows(tr, "all")[evPeriod], en = evRows(tr, "nat")[evPeriod];
        if (!e) return "";
        const best = (meas) => Math.max(...shown.map((m) => e[meas][m]));
        return html`<section class="card"><div class="card-head"><div><h2>${t(`terrain.${tr}`)}</h2>
          <div class="hint">${fmt(e.comps)} competiciones, ${fmt(e.circuits)} recorridos, ${fmt(e.runners)} resultados</div></div></div>
          <div class="table-wrap"><table class="data compact"><thead><tr><th>Método</th>${EVM.map((m) => html`<th class="r">${EV_LABEL[m]}</th>`)}</tr></thead>
            <tbody>${shown.map((m) => html`<tr><td>${methodKey(m)} ${methodShort(m)}</td>${EVM.map((meas) => {
              const x = evFmt(meas, e[meas][m], false) + (meas === "r2" || meas === "acc" ? " %" : "");
              return html`<td class="r num">${e[meas][m] === best(meas) ? html`<b>${x}</b>` : x}</td>`;
            })}</tr>`)}</tbody></table></div>
          <div class="card-body"><h3 style="margin:0 0 6px;font-size:14px">Diferencias, todas las carreras</h3>
            ${forestPlot(EV_PAIRS().map((p) => ({ label: pairLabel(p), d: e.d[p][evMeas] })), evMeas)}
            ${en ? html`<h3 style="margin:12px 0 6px;font-size:14px">Diferencias, carreras nacionales (${fmt(en.comps)} competiciones)</h3>
              ${forestPlot(EV_PAIRS().map((p) => ({ label: pairLabel(p), d: en.d[p][evMeas] })), evMeas)}` : ""}
            <p class="muted" style="font-size:12.5px;margin:8px 0 0">Medida de las diferencias: ${EV_LABEL[evMeas].toLowerCase()} (elegida más arriba).</p></div></section>`;
      })}</div>`;
    $$('[data-seg="evq"]').forEach((x) => x.addEventListener("click", () => { evPeriod = x.dataset.value; drawEval(); }));
  }
  return { TABS, STUDY_TAB, STUDY_CHAPTERS, SITE_CHAPTERS, lede, note, officiel, top, etude, calculs, tracerDoc, drawAgreement, drawEval };
}
