// The documentation's texts in English (pages/methods.js builds the page, its data and its tabs; methods.fr.js is the reference, kept in step:
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

  // the methods' tabs (the guide's — The site, Races, Training, Organising — are content/guide.*.js'; pages/methods.js orders
  // them all); « The study » is no tab of the bar since 2026-10-24 (owner): the Ozimut method's tab leads to it (STUDY_TAB)
  const TABS = [["officiel", "Official CN"], ["top", "Ozimut method"], ["calculs", "Runners and clubs"], ["tracer", "Course setting"]]
    .filter(([k]) => fr || (k !== "officiel" && k !== "calculs"));
  const STUDY_TAB = ["etude", "The study"];
  const STUDY_CHAPTERS = [["objectifs", "Objectives"], ["depart", "The starting point"], ["mesure", "The measure"],
    ["choix", "Choices and variants"], ["resultats", "The results"], ["conclusion", "The method adopted"]];
  // (the results and split times moved to the guide's « Races » on 2026-10-24: guide.*.js)
  const SITE_CHAPTERS = [["clubs", "Clubs"], ["coureurs", "Runners"], ["reseau", "Network"], ["relais", "Relays"], ["limites", "Limitations"]];
  // (Stats' documentation, since 2026-10-31: one documentation per module)
  const lede = fr ? html`How the rankings are calculated: the official CN, the Ozimut method and the study that validated it, and the calculations of the runners' and clubs' pages.`
    : html`How the ranking is calculated: the Ozimut method and the study that validated it on French results.`;
  const note = !fr ? "" : html`Only the ${methodLabel("official")} uses values published by the French orienteering federation (FFCO); the Ozimut method is an alternative calculation, made by the site on the same results.`;
  const pctOf = (x) => `${fmt(100 * x)}%`;
  const force = html`the runners' usual level`;
  const EV_LABEL = { acc: "Duels called right", r2: "Time differences explained" };
  const forestPlot = (items, meas) => {
    if (!items.length) return html`<div class="empty">—</div>`;
    const lo = Math.min(0, ...items.map((i) => i.d[1])), hi = Math.max(0, ...items.map((i) => i.d[2]));
    const pad = (hi - lo) * 0.04 || 0.01, a = lo - pad, span = hi + pad - a;
    const pos = (x) => ((x - a) / span) * 100;
    return html`<div class="ev-forest">${items.map((i) => {
      const cls = i.d[1] > 0 ? "up" : i.d[2] < 0 ? "down" : "flat";
      return html`<div class="ev-row ${cls}" title="${cls === "flat" ? "the interval contains 0: difference not significant" : "significant difference"}">
        <span class="ev-lab">${i.label}</span>
        <span class="ev-val num">${evFmt(meas, i.d[0])}<span class="dim"> [${evFmt(meas, i.d[1])}, ${evFmt(meas, i.d[2])}]</span></span>
        <span class="ev-track"><i class="ev-zero" style="left:${pos(0)}%"></i>
          <i class="ev-ci" style="left:${pos(i.d[1])}%;width:${Math.max(0.6, pos(i.d[2]) - pos(i.d[1]))}%"></i>
          <i class="ev-pt" style="left:${pos(i.d[0])}%"></i></span></div>`;
    })}</div>`;
  };
  const shareName = (f) => (f >= 1 ? "the whole field" : Math.abs(f - 2 / 3) < 0.01 ? "the fastest two thirds" : `the fastest ${fmt(Math.round(100 * f))}%`);
  const shareShort = (f) => (f >= 1 ? "100%" : Math.abs(f - 2 / 3) < 0.01 ? "two thirds" : `${fmt(Math.round(100 * f))}%`);
  const years = (d) => (d === 365 ? "12 months" : `${fmt(Math.round(d / 365))} years`);
  const r6Table = (level, extra) => html`<div class="table-wrap"><table class="data compact"><thead><tr><th>Runner</th><th class="r">${level}</th>
    <th class="r">Time</th><th class="r">${level} × time</th>${extra.map(([h]) => html`<th class="r">${h}</th>`)}</tr></thead>
    <tbody>${RACE6.map(([name, c, tm], i) => html`<tr><td>${name}</td><td class="r num">${n0(c)}</td><td class="r num">${fmt(tm)} min</td>
      <td class="r num">${n0(r6.prod[i])}</td>${extra.map(([, f]) => html`<td class="r num">${f(i, tm)}</td>`)}</tr>`)}</tbody></table></div>`;

  // ======================================================================================================
  // 1. CN officiel
  // ======================================================================================================
  function officiel() {
    return html`
    <section class="mx-slide" style="${cvar("official")}">
      <p class="mx-kicker">${methodKey("official")} ${methodLabel("official")}</p>
      <h2>A race's score</h2>
      <p>Each race gives a score to every ranked runner. The score depends on the runner's time and on the difficulty of the course. The difficulty
        is measured on the runners present, from their CN: this is the <b>course value</b>.</p>
      <p>For each runner who has a CN, their CN is multiplied by their time: a runner with a CN of 6,000 who runs 50 minutes gives 300,000. The course
        value is the mean of these products for the fastest two thirds of the runners who have a CN. A runner's score is the course value
        divided by their time.</p>
      <div class="mx-eq">course value = mean of (CN × time) of the fastest two thirds
        <small>score = course value ÷ runner's time</small></div>
      <p>A runner who runs as their CN predicts gets a score close to their CN. If they run 10% faster, their score is 11% higher;
        if they run 10% slower, their score is 9% lower.</p>
      <h3>Example: a course with six runners</h3>
      ${r6Table("CN", [["In the value?", (i) => (i < r6.keep ? "yes" : "no")], ["Official score", (i, tm) => n0(r6.off / tm)]])}
      <p>Two thirds of six runners is four runners: A, B, C and D. The course value is the mean of their four products, that is
        ${n0(r6.off)}. A's score is ${n0(r6.off)} ÷ 50 = ${n0(r6.off / 50)}. E and F, the slowest, do not count in the value, but they get
        a score like the others.</p>
      <ul class="mx-list">
        <li><span>The CN used is the official CN published 15 days before the race (the “CN D-15”).</span></li>
        <li><span>When the course has only three runners with a CN, all three count in the value.</span></li>
        <li><span>A mispunch, a DNF, a disqualification or an over-time result gives a score of 0, which counts in the CN. A
          “not ranked” (nc) result counts nowhere.</span></li>
        <li><span>In 2022, course values were multiplied by 0.95; in the other years they are not.</span></li>
      </ul>
    </section>
    <section class="mx-slide" style="${cvar("official")}">
      <p class="mx-kicker">The CN</p>
      <h2>The mean of the middle scores</h2>
      <p>The official CN is the mean of the scores of the last 12 months, leaving out the best and the worst. Since 2026, the best 10% of scores
        and the worst 40% are set aside, and the CN is the mean of those that remain. The number of scores set aside is rounded: with 10 races, the best
        and the 4 worst are set aside, and the CN is the mean of the other 5.</p>
      <ul class="mx-list">
        <li><span>Before 2026, only the best race was set aside.</span></li>
        <li><span>Every 1 January since 2026, all the CNs of a discipline are multiplied by the same number, chosen so that the mean
          of the best 20% of CNs is 5,600: this is the rescaling. Before 2026, the best CN was brought back to 10,000 when it went above that value;
          this happened on 1 January 2013, 2023, 2024 and 2025.</span></li>
        <li><span>Since 2026 there have been four rankings: forest (long distance, middle distance, night), sprint, MTB and ski. Before 2026, a single
          foot ranking combined forest and sprint; the site shows it as it was.</span></li>
      </ul>
    </section>
    <section class="mx-slide" style="${cvar("official")}">
      <p class="mx-kicker">On the site</p>
      <h2>What the site takes from FFCO</h2>
      <ul class="mx-list">
        <li><span>The official CNs and scores are taken exactly as FFCO publishes them on the national ranking site, race by race.</span></li>
        <li><span>A runner's page reads their CN page on FFCO's site live. The federation sometimes re-evaluates races of past seasons;
          its points may then differ from those on the race's results page.</span></li>
        <li><span>Next to the published CN, a runner's page redoes the calculation with the rule above and the official scores. Any difference comes from a
          result missing from the site, corrected afterwards, or re-evaluated.</span></li>
        <li><span>The official ranking is the reference: it is the only one that counts for selections.</span></li>
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
      official: { cn: offCn, used: offUsed, what: html`the mean of the ${fmt(n - offDrop - offLow)} middle scores, leaving out the best and the
        ${fmt(offLow)} worst` },
      top6w: { ...aggregate(p6.top_n), what: html`${fmt(p6.top_n)} places, filled by the best scores according to their weight, as a weighted mean` },
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
      <h2>An Ozimut score per race, an Ozimut index per runner</h2>
      <p class="mx-lead">The Ozimut method works in two steps, like the IOF World Ranking. First, each race gives every runner an <b>Ozimut score</b>.
        Then a runner's <b>Ozimut index</b> sums up their best Ozimut scores of the last 12 months.</p>
      <div class="notice info" style="margin:12px 0">Why these choices, and how they compare with the official CN: <a href="#/documentation?onglet=etude" data-tab-link="etude"><b>the study</b></a>,
        which measured every variant on French results since 2012.</div>
      <div class="mx-grid">
        <div class="mx-box" style="--c:var(--s1)"><h3>A race's Ozimut score</h3>
          <p>The difficulty of the course is measured on the usual level of the runners present, as FFCO does with their CN. A runner's score
            is this difficulty divided by their time.</p></div>
        <div class="mx-box" style="--c:var(--s3)"><h3>A runner's Ozimut index</h3>
          <p>Their best Ozimut scores of the last 12 months fill ${fmt(p6.top_n)} places; the Ozimut index is their mean, each race counted
            by its places.</p></div>
      </div>
      <p style="margin-top:14px">Everything is calculated with ordinary means: anyone can redo a score or an index by hand. The formulas are the same in
        all four disciplines; only three settings change: the races taken into account and the share of best scores, because MTB and ski
        have far fewer races, and the share of the field that measures the course.</p>
      <div class="table-wrap"><table class="data compact"><thead><tr><th>${t("f.terrain")}</th><th>Races taken into account</th>
        <th class="r">Best scores considered</th><th class="r">Runners who measure the course</th></tr></thead>
        <tbody>${windows.map(([tr, w, f, sf]) => html`<tr><td>${t(`terrain.${tr}`)}</td><td>${w === 365 ? "the last 12 months" : `the last ${fmt(Math.round(w / 365))} years`}</td>
          <td class="r">the best ${pctOf(f)}</td><td class="r">${shareName(sf)}</td></tr>`)}</tbody></table></div>
      <p style="margin-top:14px">The reasons for each choice, the variants tried and the
        measurements that support them are in
        <a href="#/documentation?onglet=etude&voir=choix" data-tab-link="etude" data-goto="choix">the study</a>.</p>
    </section>

    <section class="mx-slide" style="--c:var(--s1)">
      <p class="mx-kicker">Ozimut score · step 1</p>
      <h2>The usual level of the runners present</h2>
      <p>As for the official CN, the difficulty of a course is measured on the runners present. But the Ozimut method does not use their Ozimut index: it
        uses their <b>usual level</b>, as it stood ${fmt(pf.lag_days)} days before the race.</p>
      <p>A runner's usual level is the weighted mean of their best ${pctOf(pf.eligible_fraction)} Ozimut scores of the last 12 months
        (70% over two years in MTB, over three years in ski), each score counted by its weight (see the Ozimut index below), with no limit on places. It says
        what the runner is usually worth. It is not a ranking: it is a step in the calculation, made of the races the runner has already run. The
        Ozimut index, on the other hand, keeps only the best races: it is what ranks the runners. As in the Ozimut index, races run in a junior class count less
        and less in it as they age.</p>
      <ul class="mx-list">
        <li><span>Only runners who have a usual level in the race's discipline count. At least ${fmt(pf.min_ranked)} are needed on the
          course; otherwise the course has no value and gives no score.</span></li>
        <li><span>The calculation starts from the 2010 results, with the official CNs of that first season as its starting point.</span></li>
        <li><span>“Not ranked” (nc) results and the M10 and W10 classes do not count.</span></li>
      </ul>
    </section>

    <section class="mx-slide" style="--c:var(--s1)">
      <p class="mx-kicker">Ozimut score · step 2</p>
      <h2>The course's Ozimut value</h2>
      <p>For each runner, their usual level is multiplied by their time. The course's Ozimut value is the <b>mean of these products for the
        fastest</b>: ${shareName(own(pf, "For", "sample_fraction") ?? 2 / 3)} in forest, ${shareName(own(pf, "Spr", "sample_fraction") ?? 2 / 3)} in sprint,
        ${shareName(own(pf, "VTT", "sample_fraction") ?? 2 / 3)} in MTB and ski. It is FFCO's rule, which takes the fastest two thirds,
        with the share tuned for each discipline.</p>
      <div class="mx-eq">course's Ozimut value = mean of (usual level × time) of the fastest
        <small>forest: ${shareShort(own(pf, "For", "sample_fraction") ?? 2 / 3)} of the runners with a level · sprint: ${shareShort(own(pf, "Spr", "sample_fraction") ?? 2 / 3)} · MTB and ski: ${shareShort(own(pf, "VTT", "sample_fraction") ?? 2 / 3)}; the number is rounded up</small></div>
      <p>The slowest runners on a course are those who made mistakes, and those who ran at their level. Counting them tells how tricky the
        course was; leaving them out tells how hard the course was when run without mistakes. The right share is not the same everywhere: in forest, where
        runners get lost in one race in twelve, almost the whole field is informative; in sprint, where mistakes are half as common, the slowest blur the
        measurement. Each share was chosen because it best predicts the results in its discipline
        (<a href="#/documentation?onglet=etude&voir=choix" data-tab-link="etude" data-goto="choix">the study</a>).</p>
      <ul class="mx-list">
        <li><span>When the course has only ${fmt(pf.min_ranked)} runners with a level, all ${fmt(pf.min_ranked)} count, as in the official
          rule.</span></li>
        <li><span>A mispunch, a DNF, a disqualification or an over-time result does not count in the course's Ozimut value.</span></li>
      </ul>
    </section>

    <section class="mx-slide" style="--c:var(--s1)">
      <p class="mx-kicker">Ozimut score · step 3</p>
      <h2>The score</h2>
      <div class="mx-eq">Ozimut score = course's Ozimut value ÷ runner's time × rescaling factor of the day</div>
      <ul class="mx-list">
        <li><span>As for the official score, running 10% faster gives a score 11% higher, and running 10% slower a score 9% lower.</span></li>
        <li><span>A mispunch, a DNF, a disqualification or an over-time result gives a score of 0, which counts in the Ozimut index.</span></li>
        <li><span>The rescaling factor, explained below, is that of the race day. The score is calculated once and for all and is never revised.</span></li>
      </ul>
      <h3>Example: a course with six runners</h3>
      ${r6Table("Level", [["Official score", (i, tm) => n0(r6.off / tm)], ["Ozimut score in forest", (i, tm) => n0(r6.topFor / tm)], ["Ozimut score in sprint", (i, tm) => n0(r6.topSpr / tm)]])}
      <p>Here we assume that each runner's usual level equals their CN, and we leave the rescaling aside. F got lost: 90 minutes
        for a runner of level 5,000, while C, of the same level, took 62 minutes. The official rule measures the course on the four
        fastest, A to D: the value is ${n0(r6.off)}. In sprint, the Ozimut method does the same. In forest, it takes ${fmt(r6.keepFor)} runners out of six
        (90% of six, rounded up), F included: the value becomes ${n0(r6.topFor)}, and A, who ran without a mistake, scores ${n0(r6.topFor / 50)} instead
        of ${n0(r6.off / 50)}. This course cost one runner in six dearly; the runner who ran it without a mistake is rewarded for it. On a real course of
        several dozen runners, a single mistake weighs much less, and the rescaling brings the general level back to ${fmt(pf.anchor_target)}.</p>
    </section>

    <section class="mx-slide" style="${cvar("top6w")}">
      <p class="mx-kicker">A runner's Ozimut index</p>
      <h2>${fmt(p6.top_n)} places for the best races</h2>
      <p>The Ozimut scores of the last 12 months are sorted from best to worst, and only the best ${pctOf(p6.eligible_fraction)} are considered. Then
        ${fmt(p6.top_n)} places are filled, starting with the best score. Each race takes as many places as its weight: ${fmtW(pf.weights.cdf)} places
        for a French championship, ${fmtW(pf.weights.national)} places for a national race (O'France, Nationale), ${fmtW(pf.weights.other)} place for
        any other race, selection races and regional championships included. The last race kept takes only the places that are left.</p>
      <p>The Ozimut index is the <b>weighted mean</b> of the scores kept: each score counts as many times as it has places. Take a French
        championship at 6,800, which takes 2 places, and four other races at 6,500, 6,400, 6,200 and 6,000, which take one place each. The Ozimut index is
        (2 × 6,800 + 6,500 + 6,400 + 6,200 + 6,000) ÷ 6 = 6,450.</p>
      <div class="mx-eq">Ozimut index = Σ (places × score) ÷ Σ places
        <small>at most ${fmt(p6.top_n)} places, in every discipline; a race run in a junior class counts for places × (1 − its age ÷ the window)</small></div>
      <ul class="mx-list">
        <li><span>The weights follow the competition's name. FFCO's levels A, B, C and D are not used.</span></li>
        <li><span><b>Juniors' races count less and less as they age.</b> A race run in a junior class (M and W up to 20) takes its places like the
          others, but counts in the mean for 1 − its age ÷ 12 months (÷ two years in MTB, three in ski): in full on the race's day, half six months
          later, hardly at all at the end of the window. A junior improves fast: their races of ten months ago describe a slower runner. Adults' races
          keep their weight. A junior's Ozimut index can therefore move between two races.</span></li>
        <li><span>At least ${fmt(pf.min_scores)} races in the last 12 months are needed to be ranked. When fewer than ${fmt(p6.top_n)} places
          are filled, the Ozimut index is the weighted mean of what is there.</span></li>
        <li><span>Once the ${fmt(p6.top_n)} places are filled, one more race cannot lower an adult's Ozimut index: either it takes the place of a weaker
          race, or it stays out. This usually takes 10 races in 12 months, fewer with championships or national races.
          Until the places are filled, the Ozimut index is an ordinary mean, and a race worse than the others lowers it. For a junior, a recent race weighs
          more than the older ones it replaces: worse than them, it can lower their Ozimut index.</span></li>
      </ul>
    </section>

    <section class="mx-slide">
      <p class="mx-kicker">Rescaling</p>
      <h2>One factor per day, never revised</h2>
      <p>Without a correction, the general level of the CNs would creep up from one year to the next; the study explains why. Rescaling corrects this
        drift: each Ozimut score is multiplied by a factor, the same for all races on the same day in the same discipline.</p>
      <ul class="mx-list">
        <li><span>The factor is chosen so that the mean of the best ${pctOf(pf.anchor_top_fraction)} Ozimut indexes in each discipline stays at
          ${fmt(pf.anchor_target)}, FFCO's rule since 2026. It changes a little every day, instead of once a year.</span></li>
        <li><span>To calculate it, the level of the Ozimut indexes ${fmt(pf.anchor_lag_months)} months earlier is measured, averaged over 13 months, then extended
          by 10 months at the rate at which it rose over the last ten years. Months are calendar months: a month without races keeps the level
          of the month before. The factor is calculated for each month; between two months, it moves in a straight line from one to the next. The rule is the same
          in all four disciplines.</span></li>
        <li><span>A race's factor is fixed once and for all. An Ozimut index therefore only changes when a race enters or leaves the last 12 months,
          never because of rescaling.</span></li>
      </ul>
      <div style="margin-top:16px">${chartCard({ id: "norm", title: "The rescaling factor", hint: "The factor applied to a race's Ozimut score, by its day and its discipline", short: true })}</div>
    </section>

    <section class="mx-slide">
      <p class="mx-kicker" style="--c:var(--s3)">Illustration</p>
      <h2>Same scores, different values</h2>
      <p class="mx-lead">A runner has run ${fmt(n)} races in 12 months. Here are their scores, from best to worst. The best, ${fmt(EXAMPLE[0][0])}, is
        a French championship (★); ${fmt(EXAMPLE[2][0])} is a national race. Here is what each calculation keeps from these same scores.</p>
      ${["official", "top6w"].map((m) => html`<div class="mx-agg" style="${cvar(m)}">
        <div><b>${methodKey(m)} ${exLabel(m)}</b><div class="what">${EX[m].what}</div></div>
        ${chips(m)}
        <div class="cn">${fmt(EX[m].cn)}</div></div>`)}
      <p class="muted" style="font-size:13px">The superscript numbers (×2, ×1.5) are the places the race takes. The example applies each rule to the
        same scores. In reality, the official score and the Ozimut score of the same race differ, since the course value is not calculated in the same
        way.</p>
    </section>`;
  }

  // ======================================================================================================
  // 3. L'étude
  // ======================================================================================================
  function etude() {
    const S = study, L = study?.lineaire;
    const pctCi = (a) => (a ? `${sg(a[0], 1)}% [${sg(a[1], 1)}, ${sg(a[2], 1)}]` : "—");
    const calib = (tr, g, m) => S?.calib?.[tr]?.[g]?.v?.[m];
    const mark = (kind, label, note) => html`<span class="mx-mark ${kind}">${label}</span>${note ? html`<span class="mx-note">${note}</span>` : ""}`;
    const YES = (x) => mark("yes", "yes", x), NO = (x) => mark("no", "no", x), PART = (x) => mark("part", "partly", x);
    const CRIT = [
      ["Counts championships and national races", (m) => (m === "official" ? NO("often left out") : YES("they weigh more"))],
      ["One more race does not lower the CN", (m) => (m === "official" ? NO("often it does") : PART("for an adult, once the 6 places are filled"))],
      ["Reflects the level in major competitions", (m) => (m === "official" ? NO("without the best 10%") : YES("the best races"))],
      ["Follows juniors' fast progress", (m) => (m === "official" ? NO("their CN lags: a race of a year ago counts as much") : YES("their older races fade, in the index and in measuring the courses"))],
      ["Stable from one year to the next", (m) => (m === "official" ? NO("jump on 1 January") : YES("gradual rescaling"))],
      ["Simple to explain", (m) => (m === "official" ? YES() : YES("ordinary means"))],
      ["Authoritative for selections", (m) => (m === "official" ? YES("the only official ranking") : NO("an analysis calculation"))],
    ];
    const noStudy = html`<p class="muted">The study's figures are not available at the moment.</p>`;
    const pts = (a) => (a ? html`${ci(a)} points` : "—");
    const cell = (a) => (a ? html`${sg(a[0], 2)}${est(a) ? "*" : ""}` : "—");
    const SC = ["all_holdout", "nat_holdout", "all_tuned"];
    const SCH = ["All races<br>2012–2024", "National races<br>2012–2024", "All races<br>since July 2025"];
    const share = (tr) => L?.share?.[tr]?.rows || [];
    const picked = (tr) => L?.picked?.[tr];

    const CH = {
      objectifs: () => html`
        <section class="mx-slide mx-hero">
          <p class="mx-kicker">The study</p>
          <h2>An index that is simple to understand, counts your best races and predicts results better</h2>
          <p class="mx-lead">This chapter explains why the Ozimut method was created, how it was evaluated, which ideas were tried and which
            were kept. It ends with the Ozimut method: the simplest of those that predict best.</p>
          ${hf && hs ? html`<div class="mx-stats">
            <div class="mx-stat"><b>${lvl(hf, "acc", "official")}% then ${lvl(hf, "acc", "top6w")}%</b><span>of duels called right in forest by the official
              CN, then by the Ozimut index. A duel is two runners on the same course; it is called right when the one with the higher value
              finishes ahead.</span></div>
            <div class="mx-stat"><b>${lvl(hs, "acc", "official")}% then ${lvl(hs, "acc", "top6w")}%</b><span>of duels called right in sprint, over the
              same seasons.</span></div>
            <div class="mx-stat"><b>${lvl(hf, "r2", "official")}% then ${lvl(hf, "r2", "top6w")}%</b><span>of the time differences between runners on the same
              course explained in forest by the official CN, then by the Ozimut index.</span></div>
            <div class="mx-stat"><b>${fmt(ev.rows.For.all.holdout.comps + ev.rows.Spr.all.holdout.comps)}</b><span>competitions from ${ev.holdout[0]} to
              ${ev.holdout[1]}, set aside while the methods were being tuned and used only to judge them.</span></div>
          </div>` : ""}
          <p style="margin-top:18px"><a class="mx-dl" href="${PDF}" download>⬇ Download the study as a PDF (white paper)</a></p>
        </section>
        <section class="mx-slide">
          <p class="mx-kicker">The starting point</p>
          <h2>The CN serves two different purposes</h2>
          <div class="mx-grid">
            <div class="mx-box" style="--c:var(--s1)"><h3>Measuring how hard courses are</h3>
              <p>To know whether a course was hard, you need to know the <b>usual level</b> of the runners who took part, without a single poor run
                or a one-off exploit distorting it.</p></div>
            <div class="mx-box" style="--c:var(--s3)"><h3>Ranking runners</h3>
              <p>For qualification to the French championships, you need to know what a runner can do <b>in a major competition</b>, and so
                look at their best races.</p></div>
          </div>
          <div class="mx-callout">The ${cnLabel("official")} serves both purposes: it suits the first and serves the second poorly. The Ozimut method separates them.
            A race's <b>Ozimut score</b> is measured against the usual level of the runners present; a runner's <b>Ozimut index</b> keeps their best races.</div>
        </section>
        <section class="mx-slide">
          <p class="mx-kicker">The objectives</p>
          <h2>What the method must do</h2>
          <ul class="mx-list">
            <li><span>Start from the <b>same results and the same race score</b> as FFCO, so that everyone can understand and check.</span></li>
            <li><span><b>Count the French championships and national races</b>, which the official method often leaves out, because it leaves out
              the best 10% of races.</span></li>
            <li><span><b>Not penalise the runner who runs one more race</b>: once their best races are in place, one more race must not
              lower their CN.</span></li>
            <li><span><b>Remove the jump on 1 January</b>, so that a runner can be followed over several seasons.</span></li>
            <li><span><b>Keep up with juniors who progress fast</b>: a junior's level rises from one season to the next, and their races
              of ten months ago describe a slower runner. Their index must follow their progress, or it ranks them too low and makes the
              courses they run look easier.</span></li>
            <li><span><b>Predict results better</b>, and prove it with a reliable measure.</span></li>
            <li><span><b>Stay simple to explain</b>: ordinary means, one common rule, not a model fitted runner by runner. When
              a more sophisticated variant gains only a few hundredths of a point, the simple rule wins.</span></li>
          </ul>
        </section>`,

      depart: () => html`
        <section class="mx-slide" style="${cvar("official")}">
          <p class="mx-kicker">${methodKey("official")} ${methodLabel("official")}</p>
          <h2>The reference: sound for measuring, ill-suited to ranking</h2>
          <div class="mx-grid">
            <div><h3 style="margin-top:4px">What it does well</h3><ul class="mx-list">
              <li><span>It is authoritative: it is the <b>only official ranking</b>, the one used for selections.</span></li>
              <li><span>It leaves out extreme scores, in both directions: it is a good measure of the <b>usual level</b>, useful for measuring how
                hard courses are.</span></li>
              <li><span>Its rule is public and simple.</span></li>
              <li><span>It gives each runner a <b>measure of their performance against the others</b>, race after race.</span></li>
              <li><span>It <b>encourages everyone to improve</b>: every race counts, and the ranking shows progress.</span></li>
              <li><span>It <b>started the collection of competition results</b>, many years ago; all these results have been public at one
                time or another. Without that work, neither this site nor this study would exist.</span></li>
            </ul></div>
            <div><h3 style="margin-top:4px">What it does less well</h3><ul class="mx-list bad">
              <li><span><b>It leaves out the best 10% of races.</b> For the best runners, these are most often the French championships and
                national races: the races they prepare for, and the most competitive ones.</span></li>
              <li><span><b>It assesses usual performance rather than potential performance</b>, which matters more for
                qualification.</span></li>
              <li><span><b>It does not encourage racing.</b> For a highly ranked runner, one more race often lowers the CN. Some stop
                as soon as they have the CN that qualifies them for a French championship; others only run the races they consider “worth it”.</span></li>
              <li><span><b>A jump every 1 January</b>, and rules that have changed over the seasons: CNs cannot be compared from one
                year to the next.</span></li>
              <li><span><b>All races weigh the same</b>, from a French championship to a regional race.</span></li>
              <li><span><b>Juniors progress faster than their CN.</b> A race of ten months ago counts as much as last week's: the CN of a
                junior who is progressing lags behind their level, ranks them too low and makes the courses they run look easier.</span></li>
            </ul></div>
          </div>
        </section>
        <section class="mx-slide">
          <p class="mx-kicker">At a glance</p>
          <h2>Each method, criterion by criterion</h2>
          <div class="table-wrap"><table class="mx-matrix">
            <thead><tr><th></th>${M.map((m) => html`<th>${methodKey(m)}${methodShort(m)}</th>`)}</tr></thead>
            <tbody>${CRIT.map(([label, cell]) => html`<tr><td>${label}</td>${M.map((m) => html`<td>${cell(m)}</td>`)}</tr>`)}</tbody>
          </table></div>
        </section>
        <section class="mx-slide">
          <p class="mx-kicker" style="--c:var(--s3)">What the Ozimut method changes</p>
          <h2>Same results, same times, a different calculation</h2>
          <div class="mx-fix">
            <div class="head">Official method</div><div></div><div class="head">Ozimut method</div>
            <div class="p"><b>The best races are left out</b>often the French championships and national races</div><div class="arrow">→</div>
            <div class="s"><b>The best races count the most</b>a French championship counts double, a national race one and a half times; only
              the weakest races are left aside</div>
            <div class="p"><b>One more race can lower the CN</b>which discourages racing</div><div class="arrow">→</div>
            <div class="s"><b>Once the ${fmt(p6.top_n)} places are filled, one more race can no longer lower an adult's CN</b>the places are filled by
              the best races: the more you race, the better your chance of filling them well</div>
            <div class="p"><b>The course measured on the fastest two thirds</b>runners who made mistakes do not count, and navigating well
              on a tricky course earns less than elsewhere</div><div class="arrow">→</div>
            <div class="s"><b>The share of the field set per discipline</b>in forest, 90% of the runners: a course's difficulty includes
              the mistakes it causes, and avoiding them pays; in sprint, two thirds, as FFCO does</div>
            <div class="p"><b>A jump on 1 January</b>the whole ranking changes at once</div><div class="arrow">→</div>
            <div class="s"><b>Gradual rescaling, day after day</b>a race's score is fixed once and for all, and an adult's index only moves when
              a race enters or leaves the last 12 months</div>
            <div class="p"><b>A junior's CN lags behind their progress</b>their race of eleven months ago counts as much as yesterday's, though
              they ran much slower then</div><div class="arrow">→</div>
            <div class="s"><b>Juniors' races fade with time</b>a race run in a junior class counts less and less over the 12 months: a junior's
              index follows their progress much faster, and their courses are measured better</div>
            <div class="p"><b>One CN for two purposes</b>measuring courses and ranking runners</div><div class="arrow">→</div>
            <div class="s"><b>One calculation for each purpose</b>a course's value is measured from the scores the runners present earned
              in their previous races; the Ozimut index keeps their best races</div>
          </div>
        </section>`,

      mesure: () => html`
        <section class="mx-slide mx-hero">
          <p class="mx-kicker">The test</p>
          <h2>Before the race, who is the favourite? Afterwards, who finished ahead, and by how much?</h2>
          <p class="mx-lead">A good CN should foretell the results. For each runner, we take the CN they had <b>15 days before</b> the race: that
            CN knows nothing about the race. Then we look, course by course, at whether these CNs foretold the finishing order and the time differences. All
            the methods are judged on the same runners: those who had a CN in each of them.</p>
        </section>
        <section class="mx-slide">
          <p class="mx-kicker">First measure</p>
          <h2>The share of duels called right</h2>
          <p>On a course, each pair of runners forms a <b>duel</b>: there are 45 duels among 10 runners, and 11,175 among 150 runners. The CN calls
            a duel right when the runner with the higher CN finishes ahead of the other. When the two CNs are equal, the duel counts as half.</p>
          <p>A CN drawn at random would call half the duels right, that is 50%. No CN can call them all, because form on the day and mistakes
            decide part of the results.</p>
          <div class="mx-eq">share of duels called right = duels called right ÷ number of duels
            <small>calculated for each course, then averaged over all courses, each weighted by its number of runners</small></div>
          <p><b>Why each course is weighted by its number of runners.</b> Each runner faces every other runner on their course. The share of their
            duels called right says whether the CN placed them well among them. Averaging this share over all the runners of the season gives
            exactly the mean of the courses weighted by their number of runners: each result counts once. Counting each duel once would give
            too much weight to large courses, since a course of 150 runners would weigh as much as 250 courses of 10 runners. Counting each course
            once would give too much to small ones, since a course of 5 runners would weigh as much as a French championship course.</p>
          <p><b>The link with Kendall's τ.</b> Statisticians measure the agreement between two rankings with “Kendall's τ”: the share of duels
            called right minus the share of duels called wrong. With 80% of duels called right, and so 20% called wrong, τ is 0.80 − 0.20 = 0.60.
            It is the same measure on another scale: τ is 0 for a CN drawn at random and 1 for a perfect order. This document gives the share of
            duels, which is easier to grasp.</p>
          ${hf ? html`<p>In forest, from ${ev.holdout[0]} to ${ev.holdout[1]}, the official CN calls ${lvl(hf, "acc", "official")}% of duels right and the Ozimut index
            ${lvl(hf, "acc", "top6w")}%. The official CN is therefore wrong on ${fmt(100 * (1 - hf.acc.official), 1)}% of duels, and the Ozimut index on
            ${fmt(100 * (1 - hf.acc.top6w), 1)}%: that is ${fmt(Math.round(100 * (1 - (1 - hf.acc.top6w) / (1 - hf.acc.official))))}% fewer errors.
            The differences between the variants tried during the study are often a few tenths of a point.</p>` : ""}
        </section>
        <section class="mx-slide">
          <p class="mx-kicker">Second measure</p>
          <h2>Time differences explained</h2>
          <p>The finishing order does not tell the whole story: finishing 10 seconds or 10 minutes behind another runner is not the same thing. Now a CN reads like
            a speed: a runner whose CN is 10% higher should run about 10% faster. On each course, we therefore compare each
            runner's time with the time their CN foretold.</p>
          <ul class="mx-list">
            <li><span><b>Times are compared in proportion.</b> Losing 5 minutes on a 15-minute sprint is not the same as losing 5 minutes
              on a 90-minute long distance. Differences are therefore measured as a percentage of the time, not in minutes.</span></li>
            <li><span><b>The share explained</b>, written R², says what share of the time differences between runners on the same course the CN foretold: 0%
              if the CN foretells nothing, 100% if every runner took exactly the time foretold. Here too, each result counts once.</span></li>
            <li><span><b>The rule that turns a CN difference into a time difference is learnt on the previous season.</b> Each season is thus predicted
              without having been looked at, as the coming season would be.</span></li>
          </ul>
          ${more("The formula", html`<div class="mx-eq">ln(time) = course constant − b × ln(CN) + deviation
            <small>ln: the logarithm, which turns ratios into differences. The constant accounts for the course's length and difficulty;
              b, close to 1, is learnt on the previous season. R² = 1 − (sum of deviations²) ÷ (sum of the deviations of ln(time) from the course mean)².</small></div>`)}
        </section>
        <section class="mx-slide">
          <p class="mx-kicker">The margin of uncertainty</p>
          <h2>Is a difference real, or down to the luck of the races?</h2>
          <p>The races of a season are only a sample of all possible races. With other races, the difference between two methods would have been
            slightly different. To find out by how much, we redo the calculation ${ev ? fmt(ev.boot) : "2,000"} times on seasons drawn at random. Each draw
            takes as many competitions as the real season, chosen at random from among them: some come out twice, others not at all.</p>
          <ul class="mx-list">
            <li><span><b>The 95% interval</b>, written in square brackets after each difference, runs from the smallest to the largest difference obtained in 95% of these
              draws. For example, “+0.40 [+0.35, +0.44]” means that the measured difference is 0.40 points, and that 95% of the draws give between 0.35 and
              0.44 points.</span></li>
            <li><span><b>A difference is called significant when its interval does not contain 0.</b> Almost all draws then give a difference of the same
              sign: the luck of the races is not enough to explain it. When the interval contains 0, for example [−0.02, +0.01], we cannot say
              which of the two methods is better.</span></li>
            <li><span><b>Whole competitions are drawn, not duels.</b> Runners in the same race share the terrain, the map and the weather:
              their duels are not independent. Drawing them one by one would give intervals that are too narrow, and so too optimistic.</span></li>
            <li><span><b>The methods are compared on the same runners and the same races</b>, race by race.</span></li>
            <li><span><b>Held-out seasons.</b> The settings were chosen on the period from July 2025 to October 2026. The seasons
              ${ev ? `${ev.holdout[0]} to ${ev.holdout[1]}` : "2012 to 2024"} were used only to judge: the settings could not adapt to their
              peculiarities, like an exam made of questions never seen in training.</span></li>
            <li><span>Each variant is recalculated from 2010 on a copy of the database, with its own rescaling. The CNs of 15 days before the
              race are the ones it would have published.</span></li>
          </ul>
          <p class="muted" style="font-size:13px">The tables
            dated 6 and 7 October, folded away in the following chapters, come from the tuning: each duel counted once there, without an interval.</p>
        </section>`,

      choix: () => html`
        <section class="mx-slide mx-hero">
          <p class="mx-kicker">The choices</p>
          <h2>Every setting was measured, and the simplest rule kept when it does as well</h2>
          <p class="mx-lead">Each variant was recalculated from 2010 on a copy of the database, then judged like the method retained, on
            the same runners. Differences are in points of duels called right, from 2012 to 2024 unless stated; an asterisk or an interval that does not
            contain 0 marks a significant difference.</p>
        </section>
        <section class="mx-slide">
          <p class="mx-kicker">Weights and places</p>
          <h2>The best races count, each according to its importance</h2>
          <ul class="mx-list">
            <li><span><b>A race's weight follows the competition's name.</b> A French championship has a weight of ${fmtW(pf.weights.cdf)}: it is the
              most competitive race, the one runners prepare for, and it counts as two races. A national race has a weight of
              ${fmtW(pf.weights.national)}, any other race a weight of ${fmtW(pf.weights.other)}. FFCO's A, B, C and D levels are not used.</span></li>
            <li><span><b>${fmt(p6.top_n)} places</b>, filled from the best score down. Once the places are filled, one more race cannot lower an adult's CN.
              The IOF World Ranking works the same way, with the best five races. Ten places did no better; four
              did worse (−0.24 points in forest).</span></li>
            <li><span><b>Only the best ${pctOf(pf.eligible_fraction)} of scores</b> from the last 12 months can count, for the Ozimut index as for the
              usual level, and at least ${fmt(pf.min_scores)} races are needed. The scores left aside are, for the most part, the races where the runner
              made mistakes. Looking at 70 or 80% of the scores cost 0.4 to 1 point; 50% did as well. Requiring five races reduced the number of
              runners who measure the courses; settling for two ranked more runners, but cost 0.1 to 0.4 points.</span></li>
          </ul>
          ${L?.eligible_grid ? html`<p>The share of scores that makes the usual level was measured separately, the Ozimut index keeping its 60%: in forest, against the
            best 60%, the best 50% give ${pts(L.eligible_grid.For[50].all_holdout)}, 70% ${pts(L.eligible_grid.For[70].all_holdout)}, 80%
            ${pts(L.eligible_grid.For[80].all_holdout)} and all the scores ${pts(L.eligible_grid.For[100].all_holdout)}. In sprint, 50 to 80% are equal.
            A runner's mistakes must stay out of the level that measures the courses.</p>` : ""}
        </section>
        <section class="mx-slide">
          <p class="mx-kicker">The usual level</p>
          <h2>Courses are measured on the usual level, not on the Ozimut index</h2>
          <p>The IOF World Ranking measures a race from the ranking points of the runners present. Here that is not possible with the
            Ozimut index, because it keeps only the best races: it would feed on itself. A group that races mostly among itself, such as
            veterans or juniors, would have its CNs pulled up, its courses would look harder, and its CNs would rise further. In the
            first trials, M/W21 runners were underrated in this way by about 13%.</p>
          <p>Courses are therefore measured on the usual level: the weighted mean of the best ${pctOf(pf.eligible_fraction)} of scores, with no limit on
            places. ${S ? html`Measured with the Ozimut index, duels would be called right less often (${ci(S.onecn?.For?.all_holdout?.ST6_t)} points from 2012 to 2024,
            ${ci(S.onecn?.For?.all_tuned?.ST6_t)} since July 2025, a loss that grows over the seasons), and juniors overrated by
            ${fmt(Math.abs(calib("For", "young", "ST6_t")?.[0] ?? 1.4), 1)}% against M/W21.` : ""}</p>
        </section>
        ${S?.jeunes ? html`<section class="mx-slide" style="${cvar("top6w")}">
          <p class="mx-kicker">Juniors' races</p>
          <h2>A junior improves fast: their older races count less and less</h2>
          <p>A junior's CN lags behind their level. A year and a half later, a junior's usual level has risen by 22% in forest, an adult's by 11% (the
            general rise of the scale included): their races of ten months ago describe a slower runner. A race run in a junior
            class (M and W up to 20) counts in the mean for 1 − its age ÷ the window, adults' races keeping their weight; in the usual level, which
            measures the courses, as in the Ozimut index.</p>
          <ul class="mx-list">
            <li><span><b>Forest</b>: ${pts(S.jeunes.J.For.holdout)} from 2012 to 2024, better in ${S.jeunes.J.For.better} seasons of ${S.jeunes.J.For.seasons},
              ${pts(S.jeunes.J.For.tuned)} since July 2025.</span></li>
            <li><span><b>Sprint</b>: ${pts(S.jeunes.J.Spr.holdout)} from 2012 to 2024, nothing significant since July 2025
              (${ci(S.jeunes.J.Spr.tuned)}).</span></li>
            <li><span><b>MTB</b>: ${pts(S.jeunes.J.VTT.holdout)} from 2012 to 2024, ${pts(S.jeunes.J.VTT.tuned)} since July 2025.</span></li>
          </ul>
          <p>Ageing every runner's races brings little: at best ${pts(S.jeunes.adults_best.For.holdout)} in forest (the weight halved every six months), and
            nothing more once the juniors' races fade (${pts(S.jeunes.adults_and_juniors.For.holdout)} with both, ${pts(S.jeunes.J.For.holdout)} with the
            juniors alone). An adult's level changes little from one season to the next: a race of last year still tells about it. A two-year window gives
            ${pts(S.jeunes.window24.For.holdout)} in forest; fading the races in the Ozimut index alone, leaving the usual level as it was,
            ${pts(S.jeunes.top_only.For.holdout)}. The price: in forest, juniors are predicted ahead of M/W 21-34 a little more often than they finish ahead
            (${sg(S.jeunes.J.For.junior_bias[0], 1)} points before, ${sg(S.jeunes.J.For.junior_bias[1], 1)} after); in sprint and MTB, where they were
            underrated, the gap narrows.</p>
        </section>` : ""}
        ${S?.ecarts ? html`<section class="mx-slide">
          <p class="mx-kicker">Runners far from their level</p>
          <h2>Leaving them out of the course's measure is not worth it</h2>
          <p>On a course, a few runners finish far from what their usual level predicts: much faster, often juniors who are improving and whose level was
            indeed too low (a year later, 17 to 19% above the other runners of their age), or much slower, after a mistake. The study of 18 October 2026
            tried, with 28 rules, to leave them out of the course value: on one side or both, beyond a threshold or as a fixed share, and to stop juniors
            from measuring courses.</p>
          <ul class="mx-list">
            <li><span><b>Leaving out the fastest only</b> raises the juniors' courses, so their CNs, so the measure of their next courses: in forest, the
              juniors' courses end up as much as ${fmt(S.ecarts.loop_fast_25[0], 0)}% above the adults', and predictions get worse
              (${pts(S.ecarts.fast_25.For.holdout)}, ${pts(S.ecarts.fast_5.For.holdout)} at the 5% threshold).</span></li>
            <li><span><b>Leaving out both sides</b> costs in forest (${pts(S.ecarts.both_25.For.holdout)}); in sprint, together with leaving the juniors out,
              it gains ${pts(S.ecarts.both_and_no_juniors.Spr.holdout)}, and ${pts(S.ecarts.both_and_no_juniors.VTT.holdout)} in MTB.</span></li>
          </ul>
          <p>Those gains would take two more rules in the course's measure, to explain and to maintain, to correct the same flaw as the fading of the
            juniors' races: a junior's CN lagging behind their level. The method keeps the course's measure as it is and treats that lag where it arises,
            in the CN.</p>
        </section>` : ""}
        <section class="mx-slide" style="${cvar("top6w")}">
          <p class="mx-kicker">The course value</p>
          <h2>Which share of the field measures the course</h2>
          <p>FFCO's rule measures a course on the fastest two thirds. The last third brings together weaker runners, who ran at
            their level, and runners who made mistakes. Leaving them out measures the difficulty of the course run almost without mistakes; yet some
            courses cause far more mistakes than others, and on those courses all the scores come out too low. In forest, the value measured on the whole
            field exceeds that of the two thirds by 4.8% on average, but by almost nothing on one course in ten and by more than 10% on another one in ten;
            in sprint, by 2.8%.</p>
          <p>The share of the fastest was therefore set in each discipline, by a single criterion: the share that best predicts the duels from 2012 to 2024,
            without a significant loss since July 2025.</p>
          ${L ? html`<div class="table-wrap"><table class="data compact"><thead><tr><th class="r">Share of the field</th>
            ${["For", "Spr", "VTT"].map((tr) => html`<th class="r">${t(`terrain.${tr}`)}<br>2012–2024</th><th class="r">${t(`terrain.${tr}`)}<br>since 2025</th>`)}</tr></thead>
            <tbody>${share("For").map((r0) => html`<tr><td class="r">${r0.pct === 67 ? "the two thirds (FFCO)" : r0.pct === 100 ? "the whole field" : `${fmt(r0.pct)}%`}</td>
              ${["For", "Spr", "VTT"].map((tr) => { const r = share(tr).find((x) => x.pct === r0.pct); const on = picked(tr) === r0.pct;
                return r ? html`<td class="r num">${on ? html`<b>${cell(r.all_holdout)}</b>` : cell(r.all_holdout)}</td><td class="r num">${on ? html`<b>${cell(r.all_tuned)}</b>` : cell(r.all_tuned)}</td>` : html`<td class="r">—</td><td class="r">—</td>`; })}</tr>
              ${r0.pct === 85 ? (L.forest90 ? html`<tr><td class="r"><b>90%</b></td><td class="r num"><b>${sg(L.share.For.rows.find((x) => x.pct === 100).all_holdout[0] + L.forest90.vs100.all_holdout[0], 2)}*</b></td>
                <td class="r num"><b>${sg(L.share.For.rows.find((x) => x.pct === 100).all_tuned[0] + L.forest90.vs100.all_tuned[0], 2)}*</b></td><td class="r">—</td><td class="r">—</td><td class="r">—</td><td class="r">—</td></tr>` : "") : ""}`)}

            </tbody></table></div>
          <p class="muted" style="font-size:13px">Difference in the share of duels called right, in points, against the fastest two thirds, with the Ozimut method
            (ordinary means, extended rescaling). An asterisk marks a significant difference; in bold, the share retained. Ski follows MTB: it has too
            few races to be measured.</p>
          <ul class="mx-list">
            <li><span><b>Forest: 90%.</b> The larger the share, the better the method predicts: the whole field gains ${pts(share("For").find((x) => x.pct === 100)?.all_holdout)}
              over the two thirds, and 90% gains a further ${pts(L.forest90?.vs100?.all_holdout)} over the whole field (${pts(L.forest90?.vs100?.nat_holdout)} on
              national races), better in ${fmt(L.forest90?.vs100?.better ?? 0)} seasons out of 15, worse in ${fmt(L.forest90?.vs100?.worse ?? 0)}.
              The last tenth of the field is the races that went badly wrong: leaving them aside takes nothing away from the course's measure, and stops a
              single lost runner from carrying it.</span></li>
            <li><span><b>Sprint: two thirds</b>, FFCO's rule. Nothing does better over the fifteen seasons; 75% loses a little, the whole field
              ${pts(share("Spr").find((x) => x.pct === 100)?.all_holdout)}. Mistakes are half as common as in forest, and the slowest runners tell
              less about the course than about themselves.</span></li>
            <li><span><b>MTB: 75%.</b> 85% does best from 2012 to 2024 (${pts(share("VTT").find((x) => x.pct === 85)?.all_holdout)}), but loses
              ${pts(share("VTT").find((x) => x.pct === 85)?.all_tuned)} since July 2025; 75% gains ${pts(share("VTT").find((x) => x.pct === 75)?.all_holdout)}
              and loses nothing significant since. <b>Ski: 75%</b>, like MTB.</span></li>
          </ul>` : noStudy}
        </section>
        <section class="mx-slide">
          <p class="mx-kicker">Rescaling</p>
          <h2>A factor extended at the pace of the rise in level</h2>
          <p>A runner's CN is made of their best races: it is a little above their ordinary races. The following courses are measured with
            these slightly high levels, their scores come out a little higher, and so do the CNs that follow from them: before rescaling, the general level rises by
            a few tenths of a percent per month. Rescaling brings it back to ${fmt(pf.anchor_target)}. But a day's factor is calculated on the level
            measured before that day, and each CN itself sums up a year of races: in all, it corrected the level as it was 18 to 20 months earlier, and the
            published level exceeded the target by 7% in forest.</p>
          <p>The correction retained extends the 13-month mean at the average pace of the rise over the last ten years. This pace changes very little from one month
            to the next, the factor stays smooth, and since 2018 the published level has stayed on average within 2% of ${fmt(pf.anchor_target)} in forest and MTB, within 3% in sprint (up to 6 to 9%
            after the Covid seasons, whose few races upset the pace of the rise). A
            factor that moves in jolts puts the scores of two neighbouring months at different levels: a straight line recalculated each month cost 0.06 points.
            ${L?.recalage_gain ? html`Applied to the method retained, the correction gains ${pts(L.recalage_gain.For)} of duels in forest and changes nothing
            significant elsewhere.` : ""} The values brought back to 5,600 are the Ozimut indexes, the published ones, not the usual levels.</p>
        </section>
        <section class="mx-slide" style="--c:var(--bad)">
          <p class="mx-kicker">Measured, then discarded</p>
          <h2>The other ideas, and what came of them</h2>
          <ul class="mx-list bad">
            <li><span><b>The course value as a geometric mean</b> (with the usual level as a cubic mean): against the Ozimut method, on the same
              runners, −0.02 points of duels in forest and +0.15 [0.10, 0.20] in sprint. Slightly better in sprint, it was set aside because the ordinary
              mean can be redone by hand: for a few hundredths of a point, the simple rule wins. What made the difference between the methods was the
              share of the field that measures the course, not the way of averaging it.</span></li>
            <li><span><b>Making a slow time cost more</b> (the time raised to a power, 7 October 2026): a gain up to the power 2, then nothing more;
              it actually amounted to changing the means of the course and of the usual level, like the previous variant.</span></li>
            <li><span><b>A rule specific to each course for turning time into score</b>, estimated on the course itself: worse
              (${pts(S?.onecn?.For?.all_holdout?.IK_t)} in forest, ${pts(S?.onecn?.Spr?.all_holdout?.IK_t)} in sprint); with twenty or so runners,
              the estimate is too uncertain.</span></li>
            <li><span><b>Giving more weight to the races that separate runners better</b>: no significant difference.</span></li>
            <li><span><b>A score that penalises very large time losses less</b>: a little better in forest, clearly worse in sprint.</span></li>
            <li><span><b>The level estimated by a statistical model</b> that separates form on the day from mistakes: better in sprint
              (${S ? sg(S.mle_fit.Spr[0], 2) : "+0.37"} points), clearly worse in forest (${S ? sg(S.mle_fit.For[0], 2) : "−1.62"} points): in forest,
              making mistakes often is a trait of the runner.</span></li>
            <li><span><b>Damping outlying times</b> (a statistical method known as Huber's) or leaving out only the slowest 15%, instead of setting
              the share of the field: about 0.1 points less.</span></li>
            <li><span><b>A course value shared by sprint courses of the same length</b>: pace is not comparable from one course to another.</span></li>
            <li><span><b>A score based on the gap to the course's mean time</b>, in the manner of the IOF World Ranking: worse than FFCO's score.</span></li>
            <li><span><b>A rescaling that reacts to its own effects</b>: it oscillated from one month to the next.</span></li>
          </ul>
        </section>`,

      resultats: () => html`
        <section class="mx-slide mx-hero">
          <p class="mx-kicker">The results</p>
          <h2>Against the official ranking, over fifteen seasons not used for tuning</h2>
          ${ev ? html`<p class="mx-lead">From ${ev.holdout[0]} to ${ev.holdout[1]}, on the same runners, the Ozimut index calls ${lvl(hf, "acc", "top6w")}% of
            duels right in forest against ${lvl(hf, "acc", "official")}% for the official CN, and ${lvl(hs, "acc", "top6w")}% against ${lvl(hs, "acc", "official")}% in
            sprint. It also explains the time differences between runners much better.</p>` : ""}
        </section>
        ${ev ? html`<section class="mx-slide">
          <p class="mx-kicker">Against the official ranking</p>
          <h2>The figures</h2>
          <div class="table-wrap"><table class="data compact"><thead><tr><th></th><th class="r" colspan="2">Forest</th><th class="r" colspan="2">Sprint</th></tr>
            <tr><th></th><th class="r">${methodShort("official")}</th><th class="r">${methodShort("top6w")}</th><th class="r">${methodShort("official")}</th><th class="r">${methodShort("top6w")}</th></tr></thead>
            <tbody>
              <tr><td>duels called right</td><td class="r num">${lvl(hf, "acc", "official")}%</td><td class="r num"><b>${lvl(hf, "acc", "top6w")}%</b></td><td class="r num">${lvl(hs, "acc", "official")}%</td><td class="r num"><b>${lvl(hs, "acc", "top6w")}%</b></td></tr>
              <tr><td>time differences explained</td><td class="r num">${lvl(hf, "r2", "official")}%</td><td class="r num"><b>${lvl(hf, "r2", "top6w")}%</b></td><td class="r num">${lvl(hs, "r2", "official")}%</td><td class="r num"><b>${lvl(hs, "r2", "top6w")}%</b></td></tr>
              <tr><td>Ozimut index's gain in duels, all races</td><td class="r num" colspan="2">${dci(hf, "top6w-official", "acc")}</td><td class="r num" colspan="2">${dci(hs, "top6w-official", "acc")}</td></tr>
              <tr><td>Ozimut index's gain in duels, national races</td><td class="r num" colspan="2">${dci(hfn, "top6w-official", "acc")}</td><td class="r num" colspan="2">${dci(hsn, "top6w-official", "acc")}</td></tr>
              <tr><td>Ozimut index's gain in time differences explained</td><td class="r num" colspan="2">${dci(hf, "top6w-official", "r2")}</td><td class="r num" colspan="2">${dci(hs, "top6w-official", "r2")}</td></tr>
              <tr><td>seasons where the Ozimut index's gain is significant</td><td class="r num" colspan="2">${evWins("For").join(" out of ")}</td><td class="r num" colspan="2">${evWins("Spr").join(" out of ")}</td></tr>
            </tbody></table></div>
          <p class="muted" style="font-size:13px">Seasons ${ev.holdout[0]} to ${ev.holdout[1]}: ${fmt(ev.rows.For.all.holdout.comps)} competitions in forest and
            ${fmt(ev.rows.Spr.all.holdout.comps)} in sprint, the same runners for each method, each course weighted by its number of runners. The gains
            are in points, with their 95% interval. These figures are recalculated at every update of the site.</p>
        </section>
        <section class="mx-slide" id="saisons">
          <p class="mx-kicker">Season after season</p>
          <h2>The difference between two methods, each season, with its margin</h2>
          <div class="filters" id="ev-controls"></div>
          <div class="grid grid-2" id="ev-seasons"></div>
          <p class="muted" style="font-size:13px">Each line is a season. The dot is the difference between the two methods, in points; the bar is its
            95% interval. A dot to the right of the zero line favours the first method named. In green, a significant difference in favour of the
            first method; in red, in favour of the second; in grey, a difference that is not significant. Only courses with at least ${ev.min_runners}
            runners holding a CN in every method count. Before 2026, the official method is FFCO's joint forest and sprint ranking.</p>
        </section>
        <section class="mx-slide" id="periodes">
          <p class="mx-kicker">The two methods</p>
          <h2>During the held-out seasons, and during tuning</h2>
          <div id="ev-periods"></div>
        </section>` : html`<section class="mx-slide"><p>${t("me.val.none")}</p></section>`}
        <section class="mx-slide">
          <p class="mx-kicker">Juniors and veterans</p>
          <h2>No group favoured</h2>
          <p>A fair CN must favour no group. To check this, we look, for juniors (20 and under) and for veterans (55 and over),
            at how much their CN would need correcting to best predict their duels against M/W21. ${S ? html`In forest, the official CN underrates
            juniors by ${pctCi(calib("For", "young", "official"))}: their courses cause many mistakes, which the measure on the fastest two
            thirds leaves aside. Measured on the whole field, the course value put them back in their place (study of 13 October). Veterans remain overrated by 8 to 9% by all
            the methods, the official method included: the cause is not the course's measure, and would need a study of its own.` : ""}</p>
        </section>
        <section class="mx-slide">
          <p class="mx-kicker">Agreement between methods</p>
          <h2>Close rankings, not identical ones</h2>
          <p>Each dot is a runner in the latest published ranking: across, their official CN; up, their Ozimut index. Dots close
            to the diagonal have roughly the same value in both methods.</p>
          <div class="filters" id="agr-filters"></div>
          <div class="grid grid-main-side" style="align-items:start">
            ${chartCard({ id: "agr", title: "The same runner in two methods", hint: "Each dot is a runner, in the latest published ranking", tall: true })}
            <section class="card"><div class="card-head"><h2>Differences between methods</h2></div><div id="agr-stats"></div>
              <div class="card-body"><p class="muted" style="font-size:13px;margin:0">Correlation: 1 when the two CNs are exactly proportional, 0 when
                they are unrelated. Mean difference: by how much the second CN exceeds the first, on average. Mean absolute difference: by how much the two CNs
                differ on average, in either direction.</p></div></section>
          </div>
        </section>`,

      conclusion: () => html`
        <section class="mx-slide" style="${cvar("top6w")}">
          <p class="mx-kicker">The method retained</p>
          <h2>The rules in brief</h2>
          <ul class="mx-list">
            <li><span><b>Usual level</b>: for each runner, 15 days before the race, the weighted mean of their best ${pctOf(pf.eligible_fraction)} of
              Ozimut scores from the last 12 months, each according to its weight, with no limit on places (in MTB and ski: 70% of the scores, over two and three years),
              a race run in a junior class counting for 1 − its age ÷ the window. It is not a ranking, but a step in calculating the course value.</span></li>
            <li><span><b>Course's Ozimut value</b>: the mean of the products usual level × time of the fastest runners who have a level:
              ${shareName(own(pf, "For", "sample_fraction") ?? 2 / 3)} in forest, ${shareName(own(pf, "Spr", "sample_fraction") ?? 2 / 3)} in sprint,
              ${shareName(own(pf, "VTT", "sample_fraction") ?? 2 / 3)} in MTB and ski; at least ${fmt(pf.min_ranked)} runners, all
              ${fmt(pf.min_ranked)} when there are only ${fmt(pf.min_ranked)}.</span></li>
            <li><span><b>Ozimut score</b>: the course's Ozimut value divided by the time, multiplied by the day's rescaling factor, and fixed once and for all.
              A mispunch, a DNF, a disqualification or an over-time result gives 0, which counts.</span></li>
            <li><span><b>Ozimut index</b>: the best Ozimut scores, among the best ${pctOf(pf.eligible_fraction)} of the last 12 months, fill
              ${fmt(p6.top_n)} places: ${fmtW(pf.weights.cdf)} for a French championship, ${fmtW(pf.weights.national)} for a national race,
              ${fmtW(pf.weights.other)} for any other race. The Ozimut index is the weighted mean of the scores kept, each counted as many times as it has
              places; a race run in a junior class counts for 1 − its age ÷ the window. At least ${fmt(pf.min_scores)} races are needed.</span></li>
            <li><span><b>Rescaling</b>: each day, a factor keeps the mean of the best ${pctOf(pf.anchor_top_fraction)} of Ozimut indexes
              in each discipline at ${fmt(pf.anchor_target)}. It is calculated on the level measured two months earlier, averaged over 13 months, extended by 10 months at the pace of the rise
              over the last ten years, in all four disciplines; months are counted by the calendar.</span></li>
          </ul>
          <p>The full rules are in the <a href="#/documentation?onglet=top" data-tab-link="top">Ozimut method</a> tab.</p>
          <p><a class="mx-dl" href="${PDF}" download>⬇ Download the study as a PDF (white paper)</a></p>
        </section>
        <section class="mx-slide">
          <p class="mx-kicker">Why this one</p>
          <h2>The simplest of those that predict best</h2>
          <p>All the variants tried in October 2026 are within a few tenths of a point of one another in duels called right, and the best within a few
            hundredths. At that level, a gain no longer shows in a ranking, but a complicated rule shows in every explanation. The method retained
            therefore keeps FFCO's score and ordinary means, and changes only what really matters: the best races kept over six places,
            a share of the field set per discipline to measure the courses, and continuous rescaling. It gains more than two points of duels over the official
            CN in forest as in sprint.</p>
          <div class="mx-verdict">
            <div class="mx-box" style="${cvar("top6w")}"><h3>Ranking, qualifying, selecting</h3>
              <div class="who">${cnLabel("top6w")}</div>
              <p>What the runner can do at their best, fed by the major competitions; once their 6 places are filled, one more race does not
                lower an adult's.</p></div>
            <div class="mx-box" style="${cvar("top6w")}"><h3>Predicting who will finish ahead</h3>
              <div class="who">${cnLabel("top6w")}</div>
              <p>Well ahead of the official method: more than 2 points more duels called right, in forest as in sprint.</p></div>
            <div class="mx-box" style="${cvar("official")}"><h3>Measuring how hard a course is</h3>
              <div class="who">The scores already earned</div>
              <p>The usual level of the runners present, drawn from their previous races, on the fastest of the field, without the limit on places that
                would distort the measure.</p></div>
            <div class="mx-box" style="${cvar("official")}"><h3>Being authoritative</h3>
              <div class="who">${cnLabel("official")}</div>
              <p>The only official ranking, the one used for selections, whatever its limits.</p></div>
          </div>
          <p class="muted" style="font-size:13px;margin-top:14px">The data come from FFCO's national ranking site; a race that is missing, wrongly
            entered or corrected later can explain a difference. The Ozimut method starts from the 2010 CNs: its first months mainly reflect
            that starting point. Its indexes in no way replace the official ranking.</p>
        </section>`,
    };
    return html`<p style="margin:0 0 12px"><a href="#/documentation?onglet=top" data-tab-link="top">← Ozimut method</a></p>${buildChapters(STUDY_CHAPTERS, CH, "objectifs")}`;
  }

  // ======================================================================================================
  // 5. Le tracé (Organisation › Tracer): a guide that needs nothing else — starting, the map, the screen, the tools, courses,
  //    descriptions, specials, printing, checks, teamwork, after the race, every menu entry — and its calculations, in plain words
  // ======================================================================================================
  function tracerDoc() {
    const CHAPTERS = [["principe", "Getting started"], ["carte", "The map"], ["ecran", "The screen"], ["postes", "Controls"], ["circuits", "Courses"],
      ["definitions", "Descriptions"], ["speciaux", "Special items"], ["sorties", "Printing and exporting"], ["verifier", "Checking"],
      ["outils", "Teamwork and the field"], ["apres", "After the race"], ["ruban", "The ribbon"], ["avance", "The advanced level"], ["calculs", "The calculations"]];
    const ic = (k, s = 18) => raw(TR.svg(k, s));
    const K = "Course setting";
    // where a command is in the ribbon: « Carte › Position › Caler les postes »
    const W = (act) => TRD.ribbonAt(act);
    // the tools of the editor's bar, with the letter that picks them
    const TOOLS = [
      ["select", "Select", "S", "Click an object to select it; drag a selected object to move it; drag elsewhere to move the map. Double-clicking a control opens its description."],
      ["start", "Start", "D", "Click where the start is. In a course, clicking a start already placed reuses it."],
      ["control", "Control", "P", "Click to place a control; the tool stays active to place the next ones. Clicking a faint control, one from another course, adds it to the course."],
      ["finish", "Finish", "A", "Click where the finish is."],
      ["crossing", "Mandatory crossing point", "O", "A point the runners must pass through (a gap in a fence, a bridge): click on the leg."],
      ["issue", "Map issue point", "", "Where the runner receives the map before the start; a marked route then leads to the start."],
      ["exchange", "Map exchange", "", "Click a control of the course: the runner changes maps there, and the course is split into parts."],
      ["bend", "Bend", "C", "Click a leg to bend it (to go round an out-of-bounds area); a bend can be dragged; click a bend to remove it."],
      ["gap", "Gap", "X", "Drag along a leg or a circle to cut it, and keep a map detail readable; click a gap to close it."],
      ["route", "Route", "", "The route planned for the runners, used for the climb: click the leg, then the points of the route; double-click to finish. It is not printed."],
      ["descr", "Descriptions on the map", "", "Drag a frame on the map: the course's descriptions go there, and their width sets their size."],
      ["special", "Special items", "", "Opens the list of items: water location, first aid, out-of-bounds area, text, image… (chapter “Special items”)."],
    ];
    const KEYS = [
      ["Ctrl + Z, Ctrl + Y", "Undo, redo (100 steps)"], ["Ctrl + S", "Save straight away"],
      ["Del", "Delete the selected object; in a course, remove the control from the course only"],
      ["Esc", "Abandon the drawing in progress, go back to Select, then deselect"],
      ["Enter", "Finish a line, an area or a route (like a double-click)"],
      ["S, D, P, A, O, C, X", "Choose a tool (S Select, D Start, P Control, A Finish, O Mandatory crossing point, C Bend, X Gap)"],
      ["Shift + click", "Keep the tool after placing a start, a finish or an item"],
      ["Shift while dragging a control", "Drop it exactly on a nearby control"],
      ["Wheel, + and −", "Zoom"], ["Arrow keys, right-drag", "Move the map"], ["Right-click", "The menu of the object under the mouse"],
      ["Alt", "The ribbon's shortcuts: a letter on each tab, then on each button of the chosen tab"], ["Alt + Q", "Search for a command"],
      ["← → ↑ ↓, Home, End (in the ribbon)", "From tab to tab (each one is shown), from button to button; ↓ from a tab goes into its ribbon, ↑ comes back; Tab moves from the tabs to the ribbon"],
      ["Ctrl + F1", "Fold the ribbon down to its tabs, or unfold it"], ["F1", "The guide, at the chapter of the command under the mouse"],
    ];
    // what each menu entry does (the menus come from tracer/icons.js, as in the editor)
    const MENU_HELP = {
      "start-new": "Create another event, on its map (the first of the three choices the page offers when it opens).",
      "start-open": "Open another of your events (those you created and those whose team includes you).",
      "start-import": "An event taken from an Ozimut file (.ozmt, which holds its map) or a Purple Pen file (.ppen, with its map): a new event, alongside this one.",
      save: "Saves straight away; saving also happens on its own, a few seconds after each change.",
      "version-save": "Keeps the current state under a name, to come back to it later.",
      versions: "The list of versions (a version is also kept every 30 minutes of work): see what has changed, reopen one.",
      "export-ocn": "The whole event in a single Ozimut file (.ozmt), its map included if you wish: a copy, an archive, or the event for another club; it reopens with “Import event”.",
      "export-ppen": "The event's file for Purple Pen, to put next to the map.",
      "import-ppen": "Replaces the event's courses with those of a Purple Pen file; the map stays the event's own.",
      "pdf-courses": "The course maps to print.", "pdf-descriptions": "The descriptions alone, several per page.",
      "pdf-punch": "The punch cards, with a box for each control.",
      "export-iof3": "The courses for timing software: controls, order, lengths, and the relay teams.",
      "export-iof2": "The same for older software.", "export-gpx": "The controls as GPS waypoints (georeferenced map).",
      "export-kml": "The courses for Google Earth or an online map (georeferenced map).",
      "export-images": "One image per course, with its world file when the map is georeferenced.",
      "export-ocad": "Each course as an OCAD or OpenOrienteering Mapper map, to finish or print it with that software.",
      "export-routegadget": "The map as an image and the courses, to upload to RouteGadget.", "export-csv": "The reports' tables, for a spreadsheet.",
      publish: "After the race: the courses in the analysis, where the runners upload their GPS tracks.",
      "send-results": "From the day of the race: each course's length, climb and controls sent to the site's results.",
      "map-change": "Another map (a corrected version, a better scan, the OCAD file): the controls keep their place.",
      offline: "Keep the event on this device to open it without a network.",
      "event-props": "The title, the map's scale (and an image's resolution), the print scale of “All controls”, the language of text descriptions, notes.",
      appearance: "The size of the circles, the width of the lines, the font and size of the numbers, the purple and how it sits on the map.",
      standards: "The description standard (IOF 2004 or 2018/2024) and the map standard (ISOM 2017, ISSprOM 2019, ISOM 2000), which sets the size of the symbols.",
      numbering: "The first code given to new controls, and whether to avoid codes that also read upside down (66, 99…).",
      codes: "Change the codes of several controls at once.", renumber: "Give each control a new code, starting from the first code.",
      "remove-unused": "Delete the controls that no course uses.", calage: "Realign all the controls with the map, in two clicks (chapter “The map”).",
      "move-all": "Move, rotate or scale all the controls at once.",
      "custom-text": "Change the text that text descriptions give a symbol.", punch: "The pattern of each control's punch, to check the punch cards.",
      load: "The number of competitors on each course (taken from the official entries when there are any), for the controls' load.",
      georef: "Place the map on the Earth: clicked points, a world file, a KMZ.", team: "The team's members and their role.",
      encryption: "Encrypt the event with a team passphrase.",
      "course-new": "A new course (also: the “+” at the end of the tabs).",
      "course-props": "The name, the type (normal or score), the classes, the climb, the length, the print scale, the descriptions, the numbering, the expected competitors.",
      "course-dup": "A copy of the course, to make another one from it.", "course-delete": "Delete the course; its controls stay in “All controls”.",
      "course-order": "The order of the tabs and lists.", "var-fork": "A fork from the selected control: branches that join up again further on.",
      "var-loop": "Loops from the selected control (a “butterfly”).", "var-delete": "Delete the fork or the loops that start from the selected control.",
      relay: "For a relay: which variation each runner of each team runs.", "print-area": "The part of the map printed, the paper size and orientation.",
      "part-options": "For a course in several parts: whether to show the finish on the selected part.",
      "rep-summary": "For each course: the length, the climb, the number of controls.", "rep-legs": "The length of each leg of each course.",
      "rep-cross": "Which courses visit which control.", "rep-load": "The number of competitors expected at each control and on each leg.",
      "rep-audit": "The checks: controls too close together, incomplete descriptions, codes, legs that cross an out-of-bounds area… (chapter “Checking”).",
      "rep-climb": "The climb of each course, from IGN's terrain model.", "rep-times": "The expected winning time of each course, and the length for a target time.",
      "rep-pickup": "When and in which order to collect the controls.", tour: "The fastest way through every control chosen (all by default): for the controller, and for putting out or collecting the controls.", "rep-after": "After the race: times, mistakes and routes taken on each leg.",
      comments: "The team's comments, pinned on the map.", field: "On the phone: the map with your GPS position, to put out and check the controls.",
      "view-course": "Fit the whole course in view.", "view-map": "Fit the whole map in view.", "view-all": "Show the other courses' controls faintly, to reuse them.",
      "view-printarea": "Show the print area's frame.", "view-others": "Show other courses in pale blue under the current one.",
      "import-course": "Read the circles, the start and the finish printed on a map (a PDF, a photo) and turn them into controls.",
      "save-to": "When a command creates several files: write them into a chosen folder, or into a single .zip.",
    };
    // the editor's screen, drawn: its zones numbered as in the list under it
    const screenFig = () => {
      const P = "#a7179b", ink2 = "var(--ink-2)", line = "var(--border-strong)";
      const mark = (n, x, y) => `<g><circle cx="${x}" cy="${y}" r="11" fill="${P}"/><text x="${x}" y="${y + 4}" text-anchor="middle" font-size="12" font-weight="700" style="fill:#fff">${n}</text></g>`;
      const icon = (k, x, y, s = 0.72, c = ink2) => `<g transform="translate(${x} ${y}) scale(${s})" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${TR.ICON[k]}</g>`;
      const txt = (x, y, t, o = "") => `<text x="${x}" y="${y}" font-size="11" ${o}>${t}</text>`;
      // the tabs of the ribbon, the contextual one at the end
      let tx = 66;
      const tabs = ["Course setting", "Courses", "Map", "Check", "Print", "Team and race"].map((l, i) => {
        const w = l.length * 6.4 + 18 + (l === "Check" ? 16 : 0), x = tx; tx += w;
        return `${txt(x + 8, 53, l, `style="fill:${i ? "var(--ink-2)" : "var(--ink)"}" ${i ? "" : 'font-weight="700"'}`)}${i ? "" : `<line x1="${x + 4}" y1="61" x2="${x + w - 6}" y2="61" stroke="${P}" stroke-width="2.5"/>`}${l === "Check" ? `<circle cx="${x + w - 12}" cy="49" r="7" fill="var(--amber)"/><text x="${x + w - 12}" y="52.5" text-anchor="middle" font-size="9.5" font-weight="700" style="fill:#1b1a17">2</text>` : ""}`;
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
      const rows = [["", "", "Start: hilltop"], ["1", "31", "Boulder, north side"], ["2", "45", "Depression"], ["3", "52", "Path, crossing"], ["4", "38", "Clearing"]];
      const sheet = rows.map(([n, c, t], i) => `${i === 3 ? `<rect x="12" y="${182 + i * 20}" width="210" height="20" fill="#fff59d"/>` : ""}<text x="22" y="${196 + i * 20}" font-size="11" font-weight="700" style="fill:${i === 3 ? "#111" : "var(--ink)"}">${n}</text><text x="38" y="${196 + i * 20}" font-size="10.5" style="fill:${i === 3 ? "#111" : "var(--ink)"}">${c}</text><text x="64" y="${196 + i * 20}" font-size="10.5" style="fill:${i === 3 ? "#333" : "var(--ink-2)"}">${t}</text><line x1="12" y1="${202 + i * 20}" x2="222" y2="${202 + i * 20}" stroke="${line}"/>`).join("");
      return `<svg viewBox="0 0 760 486" role="img" aria-label="The course-setting screen, its areas numbered">
        <rect x="0.5" y="0.5" width="759" height="485" rx="9" fill="var(--surface)" stroke="${line}"/>
        <rect x="8" y="7" width="94" height="22" rx="5" fill="var(--surface-2)" stroke="${line}"/>${icon("folder", 13, 11, 0.55)}${txt(32, 22, "Events", 'style="fill:var(--ink)"')}
        <text x="112" y="23" font-size="12.5" font-weight="700" style="fill:var(--ink)">Training</text>
        <rect x="196" y="11" width="34" height="15" rx="7.5" fill="var(--flag)"/><text x="213" y="22" text-anchor="middle" font-size="8.5" font-weight="700" style="fill:#fff">BETA</text>
        <line x1="240" y1="10" x2="240" y2="27" stroke="${line}"/>${icon("undo", 248, 9, 0.62)}${icon("redo", 270, 9, 0.62)}${icon("printer", 292, 9, 0.62)}${icon("shield", 314, 9, 0.62)}${icon("pencil", 336, 9, 0.62)}<text x="358" y="22" font-size="8" style="fill:var(--ink-3)">▾</text>
        <rect x="470" y="7" width="176" height="22" rx="6" fill="var(--surface-2)" stroke="${line}"/>${icon("search", 476, 11, 0.55)}${txt(494, 22, "Search for a command", 'style="fill:var(--ink-3)"')}
        ${txt(656, 22, "Saved", 'style="fill:var(--good)"')}${icon("ribbon", 712, 9, 0.62)}${icon("fit", 734, 9, 0.62)}
        <line x1="0" y1="35" x2="760" y2="35" stroke="${line}"/>
        <rect x="8" y="40" width="50" height="19" rx="5" fill="${P}"/><text x="33" y="53.5" text-anchor="middle" font-size="11" font-weight="700" style="fill:#fff">File</text>${tabs}
        <rect x="560" y="38" width="128" height="24" fill="color-mix(in srgb, ${P} 9%, var(--surface))"/><line x1="560" y1="38.5" x2="688" y2="38.5" stroke="${P}" stroke-width="3"/>
        <text x="566" y="53" font-size="7.5" font-weight="700" letter-spacing=".5" style="fill:${P}">CONTROL TOOLS</text><text x="644" y="53" font-size="11" font-weight="700" style="fill:var(--ink)">Control</text>
        <line x1="0" y1="62" x2="760" y2="62" stroke="${line}"/>
        ${big("select", 12, "Select", true)}${gt(36, "Select")}${sep(66)}
        ${big("control", 74, "Control")}${big("start", 126, "Start")}${big("finish", 178, "Finish")}
        ${small("crossing", 236, 84, "Crossing point")}${small("issue", 236, 103, "Map issue point")}${small("exchange", 236, 122, "Map exchange")}${gt(240, "Controls")}${sep(346)}
        ${small("bend", 354, 84, "Bend")}${small("gap", 354, 103, "Gap")}${small("route", 354, 122, "Route")}${gt(395, "Legs")}${sep(444)}
        ${cells}<rect x="552" y="70" width="10" height="48" rx="2" fill="var(--surface-2)" stroke="${line}"/><text x="557" y="97" text-anchor="middle" font-size="8" style="fill:var(--ink-3)">▾</text>${gt(505, "Special items")}${sep(572)}
        ${big("descr", 580, "On the map")}${txt(640, 86, "Std.", 'style="fill:var(--ink-2)"')}<rect x="676" y="76" width="70" height="15" rx="3" fill="var(--plane)" stroke="${line}"/>${txt(681, 87, "IOF 2018 ▾", 'font-size="9.5" style="fill:var(--ink)"')}
        ${txt(640, 108, "Lang.", 'style="fill:var(--ink-2)"')}<rect x="676" y="98" width="70" height="15" rx="3" fill="var(--plane)" stroke="${line}"/>${txt(681, 109, "English ▾", 'font-size="9.5" style="fill:var(--ink)"')}${gt(664, "Descriptions")}
        ${icon("launcher", 742, 131, 0.45)}
        <line x1="0" y1="148" x2="760" y2="148" stroke="${line}"/>
        <text x="12" y="165" font-size="12" style="fill:var(--ink-2)">All controls</text><text x="118" y="165" font-size="12" font-weight="700" style="fill:var(--ink)">Course A</text>
        <line x1="114" y1="172" x2="176" y2="172" stroke="${P}" stroke-width="2.5"/><text x="190" y="165" font-size="12" style="fill:var(--ink-2)">Course B</text>${icon("plus", 252, 154, 0.55)}
        <line x1="0" y1="174" x2="760" y2="174" stroke="${line}"/>
        <rect x="12" y="180" width="210" height="124" fill="var(--surface)" stroke="var(--ink)"/>${sheet}
        <path d="M20 189.5l9 5-9 5z" fill="none" stroke="var(--ink)" stroke-width="1.3"/>
        <text x="14" y="330" font-size="12" font-weight="700" style="fill:var(--ink)">Course A</text>
        <text x="14" y="348" font-size="11" style="fill:var(--ink-2)">Length 3.2 km · Climb 85 m</text><text x="14" y="364" font-size="11" style="fill:var(--ink-2)">4 controls · 1:10,000</text>
        <rect x="233" y="175" width="527" height="285" fill="var(--surface-2)"/>
        <path d="M250 230c60-30 120 10 170-20s110-40 150 10M260 280c70-20 120 30 200 0s120-30 180 20M300 450c40-60 120-50 170-20" fill="none" stroke="#c8865a" stroke-opacity=".55" stroke-width="1.4"/>
        <ellipse cx="520" cy="410" rx="60" ry="26" fill="#f6c46a" fill-opacity=".45"/>
        <g fill="none" stroke="${P}" stroke-width="2.2">${legs}${marks}</g>
        <line x1="232" y1="174" x2="232" y2="460" stroke="${line}" stroke-width="2"/>
        <g>${[0, 1, 2].map((i) => `<rect x="724" y="${184 + i * 26}" width="24" height="22" rx="5" fill="var(--surface)" stroke="${line}"/>`).join("")}${icon("plus", 727, 186, 0.6)}${icon("minus", 727, 212, 0.6)}${icon("fit", 727, 238, 0.6)}
          <line x1="736" y1="266" x2="736" y2="320" stroke="${P}" stroke-width="3" stroke-linecap="round"/><circle cx="736" cy="276" r="5" fill="${P}"/></g>
        <line x1="0" y1="460" x2="760" y2="460" stroke="${line}"/>
        <text x="12" y="477" font-size="11" style="fill:var(--ink-3)">Click to select an object; drag a selected object to move it…</text><text x="748" y="477" text-anchor="end" font-size="11" style="fill:var(--ink-3)">1:10,000 · 140%</text>
        ${mark(1, 384, 18)}${mark(2, 540, 50)}${mark(3, 346, 136)}${mark(4, 700, 50)}${mark(5, 292, 162)}${mark(6, 222, 186)}${mark(7, 420, 240)}${mark(8, 708, 196)}
      </svg>`;
    };
    const CH = {
      principe: () => html`
        <section class="mx-slide" id="tr-principe">
          <p class="mx-kicker">${K}</p>
          <h2>Setting courses in the browser</h2>
          <p class="mx-lead">Course setting, opened from an event's “Course setting” tab in Orga, is for preparing the courses of a race or a training session, from the blank map to the printed maps:
            placing the controls, building the courses, filling in the descriptions, checking, printing, preparing the files for timing. Nothing to install:
            everything happens in the browser, and the event is saved on the site.</p>
          <p>It follows the course-setting rules and the file format of <a href="https://purple-pen.org/" target="_blank" rel="noopener">Purple Pen</a>,
            Peter Golde's free course-setting software, which many clubs know: an event can go from one to the other, both ways. It also has its
            own file, the Ozimut file (.ozmt), which keeps the whole event and its map in a single file. You don't need to know Purple Pen to
            use it: this guide explains everything.</p>
          <div class="mx-callout"><b>Beta version.</b> The course-setting tool has only just been built and has had little testing so far: try it, and tell us what goes
            wrong through the “Contact us” page (the menu under your name). It is not yet advised for preparing a real competition; it is very well suited to training
            maps.</div>
          <h3>The steps</h3>
          <div class="mx-steps" style="--c:#a7179b">
            <div class="mx-step"><b>Start the course setting</b>In Orga, the event's “Course setting” tab: “Start setting the courses” opens a course setting prepared for the competition or the training session, and tied to it; all that is left is to give the map.</div>
            <div class="mx-step"><b>Place the controls</b>With the Control tool, on the “All controls” tab or directly in a course.</div>
            <div class="mx-step"><b>Build the courses</b>One tab per course: start, controls in order, finish.</div>
            <div class="mx-step"><b>Fill in the descriptions</b>In the left-hand pane, box by box, symbols or text.</div>
            <div class="mx-step"><b>Check</b>Lengths, climb, controls too close together, forgotten descriptions: the Check tab.</div>
            <div class="mx-step"><b>Print and export</b>The PDFs of the maps and descriptions, the files for timing.</div>
          </div>
          <h3>The three choices</h3>
          <p>From an event's “Course setting” tab, the “Course setting” page opens straight on its course setting. Opened otherwise (a link, an invitation), it shows the course-setting screen straight away, empty, and over it three choices:</p>
          <ul class="mx-list">
            <li><b>New event</b>: set the courses of a competition of your club or of a training session. You need the map.</li>
            <li><b>Import event</b>: take up an event prepared elsewhere, on another account, in another club in Purple Pen or in OCAD. You need an
              Ozimut file (.ozmt), which already holds the map, a Purple Pen file (.ppen) and its map file, or the OCAD course file and its map's.</li>
            <li><b>Open event</b>: one of those you created or whose team includes you, from the list.</li>
          </ul>
          <p>Files dropped on this screen choose for you: a map alone starts a new event, a .ozmt, a .ppen or an OCAD file holding courses an import. The
            “Events” button, top left, and the File menu (New, Open, Import) bring these three choices back at any time; Esc closes them. A link that names an event opens it
            directly.</p>
          <h3>Creating an event</h3>
          <p>“New event” asks for:</p>
          <ul class="mx-list">
            <li><b>A competition or a training session.</b> A competition is chosen from the list of upcoming races and those of the last 60 days organised by your
              club (the club of your latest race): only its members can create it. A training session can be created by anyone, with a title and a date.</li>
            <li><b>The map</b>, dropped or chosen: the OCAD or Mapper file, a PDF or an image (chapter “The map”).</li>
            <li><b>The map's scale</b> (read from the OCAD or Mapper file) and its <b>standard</b>: forest (ISOM 2017) or sprint (ISSprOM 2019), which sets the size
              of the circles and numbers.</li>
          </ul>
          <p>“Import event” asks for the same details (competition or training session) and the file: an Ozimut file (.ozmt) reopens just as it was
            saved, with its map (a file saved earlier as .ocnt opens the same way); a Purple Pen file (.ppen) with its map; an OCAD file prepared
            with its course-setting module, with its map: the OCAD file it shows underneath, which the box names (not needed when map and courses
            are in one file). Its controls, their descriptions and its courses are taken, and a course that comes back to its start gets a
            finish at the same place; variations keep only their first branch (the box says so), and its logos (the images of its layout) become images on every course, in their place: a logo is
            never removed from the map, on screen or in PDFs. If the map given is not the file's own (a PDF instead of the OCAD
            map, for example), you then align the controls in two clicks.</p>
          <div class="mx-grid">
            <div class="mx-box" style="--c:var(--s1)"><h3>Who sees it</h3><p>Its team only: its creator and the people who join it by an invitation link, as course setter,
              controller or viewer. Not the site's administrators: the courses stay secret until the race.</p></div>
            <div class="mx-box" style="--c:var(--s3)"><h3>Saved automatically</h3><p>A few seconds after each change; a version is kept every
              30 minutes of work, and you can keep one under a name (${W("version-save")}).</p></div>
            <div class="mx-box" style="--c:var(--s5)"><h3>Encrypted if you wish</h3><p>With a team passphrase (${W("encryption")}), the server
              keeps only unreadable data. A lost passphrase cannot be recovered: first export an Ozimut file (${W("export-ocn")}), which
              is not encrypted.</p></div>
          </div>
        </section>`,
      carte: () => html`
        <section class="mx-slide" id="tr-carte">
          <p class="mx-kicker">${K}</p>
          <h2>The map</h2>
          <h3>Which file to give</h3>
          <div class="mx-grid">
            <div class="mx-box" style="--c:var(--s1)"><h3>OCAD or Mapper</h3><p>The best choice: the .ocd file (OCAD 6 to 12 and 2018) or .omap / .xmap
              (OpenOrienteering Mapper). The map is drawn symbol by symbol: sharp at every zoom, printed as vectors, at the right size with no
              adjustment; its scale, its georeferencing and its purple are taken over.</p></div>
            <div class="mx-box" style="--c:var(--s3)"><h3>PDF</h3><p>Exported from OCAD or Mapper, it stays sharp in print: it goes as it is into the courses'
              PDFs. Its dimensions are those of the page.</p></div>
            <div class="mx-box" style="--c:var(--s5)"><h3>Image</h3><p>JPG, PNG, GIF, BMP, WebP or TIFF, even a scan or a photo taken really flat. Its
              distances come from its <b>resolution</b>: at 300 dots per inch, 1 mm of map is 11.8 dots.</p></div>
          </div>
          <p>An image's resolution is read from the file when the file gives it; otherwise you are asked for it. To check it, measure a known distance
            (${W("rep-legs")}); ${W("event-props")} corrects it. An OCAD map can call on other files as a background
            (“templates”, an aerial photo): they are not drawn.</p>
          <p>The slider under the zoom buttons (or Map › View › Intensity) fades the map, to see the course better. ${W("map-change")} puts in another one (a corrected version,
            a better scan, the OCAD file instead of an image): the controls keep their place on the sheet, their coordinates (a new version of the same
            OCAD file), their place on the ground (two georeferenced maps), or are aligned afterwards in two clicks.</p>
          <h3>Training maps</h3>
          <p>${W("map-colors")} hides colours and symbols of an OCAD or Mapper map, for every course or for one: a map without paths, without vegetation, with the relief or the contours only, in one click. ${W("exercise")} hides a course's map except a corridor along its legs and windows round its controls, and follows the course when it changes; the map's logos stay visible.</p>
          <h3>The course's purple</h3>
          <p>The Map › Purple group sets how the course sits on the map; each way is shown there in miniature:</p>
          <ul class="mx-list">
            <li><b>On top</b>: the purple covers the map.</li>
            <li><b>Blended</b>: the map's black stays visible through the purple, as when it is overprinted.</li>
            <li><b>In layers</b> (OCAD or Mapper map): the circles, the lines and the out-of-bounds areas go under the map's colours above a chosen
              colour, usually under the black of the paths and rocks; the numbers stay on top.</li>
          </ul>
          <p>On an OCAD or Mapper map, the purple is by default the map's own; you can give another one in CMYK (Map › Purple › Appearance). The “overprint effects” (Map › Purple › Overprint) show
            the colours the map marks as “overprint” blended, as they print.</p>
          <h3>Aligning the controls in two clicks</h3>
          <p>When the controls do not fall in the right place — a .ppen file made on another map, a slightly rotated scan — ${W("calage")} puts them back: you click a control, then the place where it should be, and do this twice, with two controls far apart. From
            this the tool works out the offset, the rotation and the scale. If the scale changes, it offers to correct either the map (the image's resolution or the PDF's scale),
            which keeps the course lengths right, or the controls. A .ppen made on an OCAD map, imported with the same OCAD map, needs no alignment.</p>
          <h3>Georeferencing</h3>
          <p>For the climb, field mode, GPX files and the analysis, the map's place on the Earth must be known. A georeferenced OCAD or Mapper map
            (Lambert 93, UTM, OCAD's systems) and a georeferenced TIFF are placed automatically. Otherwise, ${W("georef")}: two points of the
            map (a junction, a building corner) clicked with their latitude and longitude — a right-click on Géoportail or an online map gives
            them —, or three or more for a distorted photo; or a world file (.jgw, .pgw… with its .prj); or a KMZ of the same image. The dialog
            checks the scale obtained against the map's.</p>
        </section>`,
      ecran: () => html`
        <section class="mx-slide" id="tr-ecran">
          <p class="mx-kicker">${K}</p>
          <h2>The screen</h2>
          <figure class="mx-fig">${raw(screenFig())}</figure>
          <div class="mx-steps" style="--c:#a7179b">
            <div class="mx-step"><b>The top bar</b>“Events” brings back the three choices (open another event, create or import one); the title;
              the quick-access bar: undo, redo, the PDF of the current course, the event audit, the course properties. On the right, the command search, the save status, ▭ (the
              ribbon's display), ⤢ (full window) and ↗ (a separate tab).</div>
            <div class="mx-step"><b>The ribbon's tabs</b>File, then one tab per stage of the work: Course setting, Courses, Map, Check, Print, Team and
              race. A number on Check: the problems found; on Team and race: the comments still open.</div>
            <div class="mx-step"><b>The ribbon</b>The tab's commands, in groups: large buttons for the most common ones, small ones stacked in threes,
              settings in place, and ↘ in a group's corner for its full dialog.</div>
            <div class="mx-step"><b>The selected object's tab</b>A selected control, leg or item, or a line being drawn, has its own
              tab, in purple, with everything that applies to it.</div>
            <div class="mx-step"><b>The courses</b>“All controls”, then one tab per course, and “+” to create one.</div>
            <div class="mx-step"><b>The descriptions</b>Those of the current course, filled in by clicking (chapter “Descriptions”); below them, the current
              course when nothing is selected.</div>
            <div class="mx-step"><b>The map</b>Where you place and move the objects. Dragging the divider on the left widens the pane.</div>
            <div class="mx-step"><b>The zoom and the help line</b>Zoom in, zoom out, the whole course, and the slider that fades the map; at the bottom, what
              the current tool does, the scale and the zoom.</div>
          </div>
          <h3>The ribbon</h3>
          <p>The tabs follow the work: <b>Course setting</b> to place the controls and items, <b>Courses</b> to build the courses, their variations and their
            printing, <b>Map</b> for the map itself (changing it, aligning it, georeferencing it, how the purple sits on it), <b>Check</b>, <b>Print</b>
            (the PDFs and every file to export), <b>Team and race</b> (the team, the field, after the race). The <b>File</b> page gathers what is
            seldom needed: the event's information, new, open, import, save and the versions, each file to export with what it is for,
            sharing, offline and the options.</p>
          <p>A greyed-out button says why in its tooltip (“Choose a course first”, “from the day of the race”…): you never come across a command that
            refuses. Each button's tooltip also says what it does and its key; F1 opens the guide at its chapter.
            Some settings are made in the ribbon itself, with immediate effect: the print scale, the standard and language of the descriptions, the size of the
            circles, lines and numbers, how the purple sits on the map and a leg's flagging, each shown in miniature.</p>
          <h3>The selected object's tab</h3>
          <p>Selecting a control brings up the <b>Control</b> tab: its code, its description, a fork or loops from it, a line of text before or
            after it, cutting its circle, the map exchange, and what is known about it (its courses, its load, the length to the next one). A leg has the
            <b>Leg</b> tab (bend, gap, route, flagging), a special item the <b>Item</b> tab (appearance, courses, corners), and a line or an area
            being drawn the <b>Drawing</b> tab, with “Finish” and “Cancel”. Selected from the Course setting tab, the object opens its tab
            by itself; from another tab, its tab appears and flashes, without taking the place of the one you are working in. Commands that need a place
            (“Add bend”, “Cut the circle”) then ask for a click on the map; Esc gives up.</p>
          <h3>The quick-access bar</h3>
          <p>Next to the title, whatever the tab, it keeps the most used commands one click away: undo, redo, the PDF of the
            current course (to print a proof, with the latest settings), the event audit and the course properties. Its ▾ adds
            or removes others (save, the PDF of all courses, the print area, IOF XML, the versions, the comments, field
            mode…); a right-click on any ribbon button adds it, a right-click in the bar removes it. It is kept on this browser.</p>
          <h3>Finding a command</h3>
          <p>The <b>search</b>, at the top (Alt + Q), finds a command by a word of its name or of what it does (“fork”, “gpx”, “align”, “scale”), and
            says where it is; Enter runs it and makes its button flash, so that you find it next time. <b>Alt</b> alone shows a letter on each
            tab, then, once the tab is chosen, on each button: two keys run any command without the mouse.</p>
          <h3>More room for the map</h3>
          <p>The ▭ button, top right, puts the ribbon on <b>a single line</b> of small buttons, or keeps only <b>its tabs</b> (Ctrl + F1): it then opens
            over the map when a tab is clicked and closes again after the command. If you make no choice, it is <b>automatic</b>: full, on a single line
            when the window is less than 800 pixels high (a laptop screen), and reduced to its tabs in full window (⤢), where the map takes all the
            room; File › Options sets both cases. When the window is narrow, the groups fold up by themselves, starting from the right, each into a
            button that opens it.</p>
          <h3>Moving around the map</h3>
          <p>The wheel zooms around the mouse; dragging where there is nothing (or right-dragging) moves the map; so do the arrow keys. Map › View › Entire
            course and Entire map reframe it. Zooming far into an OCAD, Mapper or PDF map redraws it sharp.</p>
          <h3>Selecting, moving, deleting</h3>
          <p>With the Select tool, a click selects a control, a leg, a number or an item; it is highlighted in blue, its description line in yellow.
            Dragging a selected object moves it. A selected object shows its <b>handles</b>: a leg's bends, the edges of its gaps, an area's
            corners, the corner of the descriptions; they can be dragged. Del deletes the object; in a course, a control is only removed from the course and stays in
            “All controls”.</p>
          <h3>The right-click</h3>
          <p>Right-clicking on the map opens the menu of the object under the mouse, with exactly the commands of its tab, group by group, worded for
            the spot clicked: for a control, its description, a fork or loops, a map exchange, a line of text, cutting its circle here, removing it;
            for a leg, a bend or a gap here, removing this bend, the route, the flagging; for an item, its appearance, a corner here or this
            corner, the courses it appears on. On a ribbon button, right-clicking adds it to the quick-access bar.</p>
          <h3>The keyboard</h3>
          <div class="table-wrap"><table class="data compact tr-doc-tools"><thead><tr><th>Key</th><th>Effect</th></tr></thead><tbody>
            ${KEYS.map(([k, v]) => html`<tr><td style="white-space:nowrap"><b>${k}</b></td><td>${v}</td></tr>`)}</tbody></table></div>
          <p>Only one team member edits at a time: the others see the event read-only, with a “Take over” button.</p>
        </section>`,
      postes: () => html`
        <section class="mx-slide" id="tr-postes">
          <p class="mx-kicker">${K}</p>
          <h2>Tools and controls</h2>
          <div class="table-wrap"><table class="data compact tr-doc-tools"><thead><tr><th></th><th>Tool</th><th>Key</th><th>What it does</th></tr></thead><tbody>
            ${TOOLS.map(([k, n, key, v]) => html`<tr><td class="tr-doc-ico">${ic(k, 20)}</td><td style="white-space:nowrap"><b>${n}</b></td><td>${key}</td><td>${v}</td></tr>`)}
          </tbody></table></div>
          <h3>“All controls” and the courses</h3>
          <p>The <b>All controls</b> tab gathers all the event's controls, with their codes. A control placed there does not yet belong to any course. A
            control placed in a course is in that course as well. The same control can serve several courses: in a course, the other courses' controls are shown faintly
            when the Control tool is active (or always, with ${W("view-all")}); a click on one of them adds it to the course.</p>
          <h3>Where a new control goes</h3>
          <p>In a course, a new control goes:</p>
          <ul class="mx-list">
            <li>just <b>after the selected control</b>, if there is one;</li>
            <li>into the <b>selected leg</b>, if there is one;</li>
            <li>otherwise into the <b>leg nearest</b> to the spot clicked.</li>
          </ul>
          <p>To add a control at the end of the course, select the last control, then place the new one. To insert one between 3 and 4, select
            leg 3–4, or simply click near it. The start and the finish always go at the beginning and the end.</p>
          <h3>Codes and numbers</h3>
          <p>Each control gets a <b>code</b> (31, 32…, set by ${W("numbering")}, which by default avoids codes that read upside down); the
            Code field of the Control tab changes it. In a course, the <b>sequence number</b> places itself near the circle, clear of the lines; drag it to
            put it elsewhere, and drop it on its circle for it to place itself again. The course properties can show the code instead, or both.</p>
          <h3>Moving a control</h3>
          <p>Drag it with the Select tool: its legs follow in every course. Moving a control shared with other courses by more than 75 m makes the tool
            ask whether to move it everywhere or create a new one for this course. Shift while dragging drops it exactly on a nearby control.</p>
        </section>`,
      circuits: () => html`
        <section class="mx-slide" id="tr-circuits">
          <p class="mx-kicker">${K}</p>
          <h2>Courses</h2>
          <p>The “+” at the end of the tabs (or ${W("course-new")}) creates a course. Its <b>properties</b> (${W("course-props")}, or a click on
            the header of the descriptions):</p>
          <ul class="mx-list">
            <li><b>Name</b> and <b>classes</b>, printed at the top of the descriptions;</li>
            <li><b>type</b>: normal (the controls in order) or <b>score</b> (the controls in any order, each with its points);</li>
            <li><b>climb</b> and <b>length</b>: the length is calculated (along the bends), the climb comes from ${W("rep-climb")} or is typed in;</li>
            <li><b>print scale</b>: a 1:10,000 map can be printed at 1:7,500 for juniors; circles and numbers then take the size the standard sets (Map › Symbols); it can also be changed in Courses › Printing › Scale;</li>
            <li><b>descriptions</b> in symbols, in text or both, and the controls' <b>label</b>: sequence number, code, or both;</li>
            <li>the <b>expected competitors</b>, for the controls' load.</li>
          </ul>
          <p>${W("course-dup")} copies a course to make another one from it; ${W("course-order")} sorts the tabs. Deleting a course leaves its controls in
            “All controls” (${W("remove-unused")} removes them).</p>
          <h3>Legs</h3>
          <ul class="mx-list">
            <li>A <b>bend</b> (Bend tool) bends a leg to go round an out-of-bounds area; the length follows the line.</li>
            <li>A <b>gap</b> (Gap tool, by dragging) breaks a line or a circle to keep a map detail readable. The tool also cuts
              a line by itself where it crosses another leg of the course (Map › Purple › Appearance sets this gap).</li>
            <li><b>Flagging</b> (the Leg tab, which shows each way in miniature, or the right-click): the whole leg, its beginning or its end flagged, drawn
              dashed.</li>
            <li>A <b>mandatory crossing point</b> (Mandatory crossing point tool) marks a gap or a bridge the runner must go through.</li>
          </ul>
          <h3>Variations: forks and loops</h3>
          <p>For a relay or a mass-start race, the runners on the same course do not all visit the same controls. Select the control the variations start from,
            then, in its Control tab, Fork here (branches that join up again further on) or Loops here (loops that come back to the same control), with
            the number of branches. A selector appears above the map: choose a branch, and place its controls as usual. The course's length
            is then shown from the shortest variation to the longest. ${W("relay")} shares out the variations among the teams and their
            runners, so that each team runs every branch across all its runners; the PDFs are printed by team and by leg.</p>
          <h3>Several parts</h3>
          <p>A <b>map exchange</b> (Map exchange tool on a control of the course) splits the course into parts: a part selector appears, and each
            part has its print area and is printed on its own sheet. ${W("part-options")} shows the finish on a part or not.</p>
          <h3>The print area</h3>
          <p>${W("print-area")} chooses the paper (A4, A3…), the orientation, the margins, and the part of the map to print; the paper and the orientation can also be changed
            with a click in Courses › Printing › Paper (“fitted to the course” turns the sheet to suit the course). The area places itself, centred on the
            course, or follows a frame drawn on the map. An area larger than the sheet is split over several slightly overlapping pages, or cut down to its
            centre. ${W("view-printarea")} shows it as a dotted line.</p>
        </section>`,
      definitions: () => html`
        <section class="mx-slide" id="tr-definitions">
          <p class="mx-kicker">${K}</p>
          <h2>Descriptions</h2>
          <p>The left-hand pane shows the current course's descriptions, as they will be printed. They follow the IOF standard (2018/2024 by default, or
            2004: Course setting › Descriptions › Standard): one line per control, with its columns C to H — which feature, which one of several, what it is like, its size, where the control is.</p>
          <ul class="mx-list">
            <li>A <b>click on a line</b> selects the control, and the map centres on it.</li>
            <li>A <b>second click on a box</b> opens the symbols of that column; type a few letters to filter (“gul” gives “Erosion gully”). Column F
              also accepts the feature's size (“2 m”, “3 × 4”).</li>
            <li><b>With the keyboard</b>, once the sheet is selected: ↑ ↓ change line, ← → change box, Enter or a letter opens the symbols, Del clears the box.</li>
            <li>A click on the <b>code</b> box changes the code; on the <b>title</b>, changes the event's title; on the <b>header</b> (length, climb),
              opens the course properties.</li>
            <li>The <b>finish</b> line (and those of the mandatory crossing points and the map issue point) gives the flagging to the finish: a click chooses its shape.</li>
            <li>A <b>line of text</b> before or after a control (the Control tab › Descriptions, or right-clicking the control) adds an instruction (“Through the village”).</li>
          </ul>
          <p>The descriptions are printed in symbols, in text, or both (the course properties). The text is written in the chosen language (Course setting ›
            Descriptions › Language), among 23 languages; ${W("custom-text")} changes a symbol's text. To put them on the map, use the “Descriptions on the
            map” tool: drag a frame, its width sets the size; the bottom right corner resizes them, a right-click spreads them over several columns.
            ${W("pdf-descriptions")} prints them alone, several per page, to cut out for the description holders.</p>
        </section>`,
      speciaux: () => html`
        <section class="mx-slide" id="tr-speciaux">
          <p class="mx-kicker">${K}</p>
          <h2>Special items</h2>
          <p>The most common ones are in the gallery of Course setting › Special items; ▾ or ↘ ${ic("special", 16)} opens the full list. Each is placed in its own way:</p>
          <div class="mx-grid">
            <div class="mx-box" style="--c:var(--s1)"><h3>${ic("water", 18)} Points</h3><p>Water location, first aid, optional crossing point,
              forbidden route, registration mark: one click at the chosen spot.</p></div>
            <div class="mx-box" style="--c:var(--s3)"><h3>${ic("oob", 18)} Lines and areas</h3><p>Uncrossable boundary, line, out-of-bounds area, dangerous
              area, temporary construction, white-out: one click per corner, then a double-click (or Enter) to finish. An area closes by itself.</p></div>
            <div class="mx-box" style="--c:var(--s5)"><h3>${ic("text", 18)} Frames</h3><p>Text, image, rectangle, ellipse: drag a frame on the map, then
              give the text (font, size, colour), choose the image, or the line's appearance.</p></div>
          </div>
          <p>An item is shown on every course, or only on those chosen (the Item tab › Courses, or the right-click). Its corners can be
            dragged; the Item tab (or the right-click) adds or removes a corner. The <b>white-out</b> erases a piece of map under the course (an
            outdated legend, a detail to hide). An out-of-bounds area crossed by a leg is reported by the event audit.</p>
        </section>`,
      sorties: () => html`
        <section class="mx-slide" id="tr-sorties">
          <p class="mx-kicker">${K}</p>
          <h2>Printing and exporting</h2>
          <h3>Course maps</h3>
          <p>${W("pdf-courses")}: tick the courses (and “All controls”, for the controller), then choose:</p>
          <ul class="mx-list">
            <li>a single PDF with one page per course, or one PDF per course, or per part;</li>
            <li>for variations, each one separately, all together, or by team and leg;</li>
            <li>the map and the course, or the <b>course alone</b>, for overprinting on maps already printed;</li>
            <li>colours in CMYK (for a printer) or RGB.</li>
          </ul>
          <p>The ${ic("printer", 14)} button of the quick-access bar, at the top, gives the PDF of the current course with the latest settings. Each course is printed at its print scale, on its print area. <b>Print the PDF at actual size</b> (without “fit to page”),
            otherwise the scale is wrong: measure a known length on the first sheet.</p>
          <h3>Other files</h3>
          <div class="mx-grid">
            <div class="mx-box" style="--c:var(--s1)"><h3>${ic("stopwatch", 18)} Timing</h3><p>IOF XML 3.0 (or 2.0.3 for older software): the
              courses, the order of the controls, the lengths, the relay teams. To import into the timing software before the race.</p></div>
            <div class="mx-box" style="--c:var(--s2)"><h3>${ic("descr", 18)} Descriptions, punch cards</h3><p>The PDF of the descriptions alone, and the
              punch cards with a box for each control (${W("punch")} draws each control's punch pattern).</p></div>
            <div class="mx-box" style="--c:var(--s3)"><h3>${ic("globe", 18)} GPS and online maps</h3><p>GPX of the controls, KML of the courses, course
              images (PNG, JPEG, GIF) with their world file, RouteGadget files: a georeferenced map is needed.</p></div>
            <div class="mx-box" style="--c:var(--s4)"><h3>${ic("layers", 18)} OCAD and Mapper</h3><p>Each course as an OCAD (9 to 12, 2018) or Mapper map, in
              course symbols, with the event's map as background: to finish or print the course with that software.</p></div>
            <div class="mx-box" style="--c:var(--s5)"><h3>${ic("export", 18)} Ozimut and Purple Pen</h3><p>The Ozimut file (.ozmt) keeps the whole event, and its
              map if you wish, in a single file: a copy, an archive, the event for another club; it reopens with “Import event”. The
              .ppen opens in Purple Pen next to the map; it keeps everything except what Purple Pen does not know about (routes, for example).</p></div>
            <div class="mx-box" style="--c:var(--s6)"><h3>${ic("table", 18)} Tables</h3><p>The reports as CSV (separator “;”), for a spreadsheet.</p></div>
          </div>
          <p>Each export dialog comes back with the choices made last time on this browser (the format, the resolution, the number of copies, the
            size of the boxes, the colours…); only the courses need ticking again. When a command creates several files, they are written into a chosen folder (Chrome, Edge) or into a single .zip; ${W("save-to")}
            changes this choice.</p>
          <h3>Appearance</h3>
          <p>Map › Symbols sets the size of the circles, the width of the lines and the height of the numbers (relative to the standard); Map › Purple › Appearance, the font and boldness of the
            numbers, their white outline, the automatic gap in lines that cross, the size by print scale, and the purple. Texts placed on
            the map are printed in the font they name, with bold and italic, and in every language.</p>
        </section>`,
      verifier: () => html`
        <section class="mx-slide" id="tr-verifier">
          <p class="mx-kicker">${K}</p>
          <h2>Checking</h2>
          <p>The Check tab gives, for the whole event:</p>
          <ul class="mx-list">
            <li><b>Course summary</b>: length, climb, number of controls;</li>
            <li><b>Leg lengths</b>, course by course;</li>
            <li><b>Cross-reference</b>: which courses visit which control;</li>
            <li><b>Control and leg load</b>: the number of competitors expected at each control, to put several control units where they are needed;</li>
            <li><b>Event audit</b>: unused controls, incomplete descriptions, codes below 31 or that read upside down, controls too close to one
              another (at least 30 m between two controls in forest, 15 m in sprint, and clearly different features within 60 m, 30 m in sprint), legs that
              cross an out-of-bounds area or an uncrossable boundary, or pass through another control's circle, dog-legs, legs that are too short, courses that leave the same start for the same first control or in almost the same direction.</li>
          </ul>
          <p>The audit runs by itself after each change: the number of problems found is shown on the Check tab — in red, or in orange when only
            reminders are left, such as a climb not yet filled in — and the first ones in the tab itself; a click opens the full audit. The
            “Course” group gives the current course's length, climb, number of controls, scale and expected competitors.</p>
          <h3>Climb and winning time</h3>
          <p>${W("rep-climb")} calculates each course's climb from IGN's terrain model (georeferenced map, in France); tick the courses to copy
            the value into their properties. With the Route tool, draw the planned route where the straight line goes over a hill that the runners
            will go round. ${W("rep-times")} gives, for each course, the expected winning time, based on the results of the last two
            seasons, and the length that gives a target time (chapter “The calculations”).</p>
          <p>The load comes from the number of competitors on each course: ${W("load")} takes it from the official entries when the race is listed there.</p>
        </section>`,
      outils: () => html`
        <section class="mx-slide" id="tr-outils">
          <p class="mx-kicker">${K}</p>
          <h2>Teamwork and the field</h2>
          <div class="mx-grid">
            <div class="mx-box" style="--c:var(--s1)"><h3>${ic("team", 18)} The team</h3><p>${W("team")}: make an invitation link for a role and pass it on; whoever opens it signed in joins, FFCO licence holder or not.
              The course setter and the controller edit, the viewer reads and comments. Only one edits at a time; the others can “take over”.</p></div>
            <div class="mx-box" style="--c:var(--s2)"><h3>${ic("comment", 18)} Comments</h3><p>${W("comments")}: a comment pinned to a
              spot on the map, replies, and “Done” when it is settled; the number still open is shown on the tab.</p></div>
            <div class="mx-box" style="--c:var(--s3)"><h3>${ic("history", 18)} Versions</h3><p>${W("versions")}: each version, what has changed since
              (“control 34 moved 40 m”), and reopening it.</p></div>
            <div class="mx-box" style="--c:var(--s4)"><h3>${ic("phone", 18)} Field mode</h3><p>On the phone, the georeferenced map with your GPS position, the
              nearest control, its distance and its direction; each control marked as put out, checked, collected or with a problem, with a photo.</p></div>
            <div class="mx-box" style="--c:var(--s5)"><h3>${ic("offline", 18)} Offline</h3><p>${W("offline")} keeps the event on the device:
              it opens without a network, and the changes are sent when the network comes back.</p></div>
            <div class="mx-box" style="--c:var(--s6)"><h3>${ic("box", 18)} Collection</h3><p>${W("rep-pickup")}: when each control can be
              collected, and each collector's order of collection.</p></div>
            <div class="mx-box" style="--c:var(--s1)"><h3>${ic("tour", 18)} Control tour</h3><p>${W("tour")}: the fastest way through the controls ticked (all by default), for the controller and for those who put
              them out or collect them; numbered on the map, exported as GPX, image or CSV, or made a course with its description sheet and punch card.</p></div>
          </div>
          <p>The control tour starts at the start, a control or the best-placed one, and ends at the finish, back at its starting point or
            anywhere; it counts the pace chosen and the time spent at each control. The map is read as for the analyses' computed routes (an OCAD or
            Mapper map by its symbols, any other by its colours), the setter's out-of-bounds areas and boundaries closed, the relief counted when the
            map is georeferenced; the order is the fastest found (exact up to 10 controls). “Create the course” makes it a course of the event, its controls in the tour's order (a test course, out of the reports):
            the panel then prints its map, description sheet and punch card.</p>
          <p>Also: ${W("import-course")} takes the controls of a printed course (a PDF or a photo of a past race), to be checked afterwards;
            ${W("view-others")} shows other courses faintly, to avoid crossings and controls too close together.</p>
        </section>`,
      apres: () => html`
        <section class="mx-slide" id="tr-apres">
          <p class="mx-kicker">${K}</p>
          <h2>After the race</h2>
          <p>On the day of the race or after (never before: the courses stay secret, and the buttons of Team and race › After the race stay greyed out until then), the
            course setter can:</p>
          <ul class="mx-list">
            <li><b>publish the courses to the analysis</b> (${W("publish")}): each course arrives there with its map and its calibration, and the runners only have to upload
              their GPS track. The same dialog sets the whole analysis: its name (which may differ from the event's), its date, who opens it (every account, with or without
              visitors, the club, a password), the runners' action rights; then “Publish”, or “Save as draft” (only its organisers see it). A window follows the
              progress — each course is printed on its map, then sent — and then opens the analysis in one click, or its management page (the event's “Analysis” tab, in Orga, where
              everything can still be changed). A new publication creates another analysis or, as chosen, updates one of those already published from the event (its
              courses and settings replaced, the shared tracks kept); a competition has only one analysis;</li>
            <li><b>send the courses to “Results”</b> (${W("send-results")}): a complement to the results, not results. The results file exported by the timing
              software (MeOS, OE…) as IOF XML already gives each course's length, climb and controls: with it, this sends nothing new. It helps when the published results
              come from elsewhere — a PDF, liveresultat, WinSplits, O'Live, an HTML page without course headers — and lack that information. The setter's courses (as
              IOF XML) are then matched to the results' courses by their name (“Course A” = “A”) or by their controls, and only the missing values are filled in, never
              times or places: the race's results page shows the length and climb, “Arena › Analysis” names the controls by their codes, and the climb of past races
              feeds the winning-time estimates of courses still to be set. It needs an event linked to a competition, membership of the organising club and consent to
              publication; nothing shows before the day after the race, and a new send replaces the previous one;</li>
            <li>read the <b>review</b> (${W("rep-after")}): for each leg, the best time and the median time, the share of runners who made
              a mistake on it, the missing punches (a control unit to check?), and the <b>routes</b> taken, from the tracks shared on the analysis.</li>
          </ul>
        </section>`,
      ruban: () => {
        // each item of a group: a command, a setting, a figure, the gallery
        const flat = (items) => items.flatMap((it) => (it.t === "stack" ? flat(it.items) : [it]));
        const entry = (it) => {
          if (it.t === "field") { const f = TRD.INFO.field[it.id] || [it.id, ""]; return html`<dt>${ic("sliders", 16)}<span>${f[0]}</span></dt><dd>${f[1]}</dd>`; }
          if (it.t === "chip") return html`<dt>${ic("list", 16)}<span>${{ issues: "The problems", course: "The current course", mapInfo: "The map", geoInfo: "Georeferenced?", control: "The control", leg: "The leg", special: "The item", drawing: "The drawing" }[it.id] || ""}</span></dt><dd>${TRD.INFO.chip[it.id] || ""}</dd>`;
          if (it.t === "modes") return html`<dt>${ic("palette", 16)}<span>${it.id === "blend" ? "On top, Blended, In layers" : "None, Entire leg, Beginning, End"}</span></dt><dd>${TRD.INFO.modes[it.id]}</dd>`;
          if (it.t === "gallery") return html`<dt>${ic("special", 16)}<span>The gallery</span></dt><dd>${TRD.INFO.gallery}</dd>`;
          return html`<dt>${ic(it.icon, 16)}<span>${it.label}${it.key && it.key.length === 1 ? ` (${it.key})` : ""}</span></dt><dd>${it.tip || MENU_HELP[it.act] || ""}${it.split ? ` The small ▾: ${it.split.map((x) => x[1]).join(", ")}.` : ""}</dd>`;
        };
        const groups = (gs) => gs.map((g) => html`<h4 class="tr-doc-gh">${g.title || "—"}${g.pro ? " — advanced level" : ""}</h4><dl class="tr-doc-menu">${flat(g.items).map(entry)}</dl>`);
        return html`
        <section class="mx-slide" id="tr-ruban">
          <p class="mx-kicker">${K}</p>
          <h2>The ribbon, tab by tab</h2>
          <p>Every command of the ribbon, with the icon it carries in the course-setting tool: the tabs, those of the selected object, then the File menu: its lists (export formats, imports, sharing) open in a window where each file says what it is for.</p>
          ${TRD.TABS.filter((tb) => tb.groups).map((tb) => html`<h3 class="tr-doc-mh">${ic(tb.icon, 20)}<span>${tb.label}</span></h3>${groups(tb.groups)}`)}
          <h3 class="tr-doc-mh">${ic("select", 20)}<span>The selected object's tabs</span></h3>
          ${Object.values(TRD.CONTEXT).map((c) => html`<h4 class="tr-doc-gh">${c.label}</h4><dl class="tr-doc-menu">${c.groups.flatMap((g) => flat(g.items)).map(entry)}</dl>`)}
          <h3 class="tr-doc-mh">${ic("file", 20)}<span>The File menu</span></h3>
          ${TRD.BACKSTAGE.map((sec) => html`<h4 class="tr-doc-gh">${sec.label}</h4><dl class="tr-doc-menu">${
            sec.act ? html`<dt>${raw(TR.actIcon(sec.act, 16))}<span>${sec.label}</span></dt><dd>${MENU_HELP[sec.act] || ""}</dd>`
              : sec.id === "info" ? html`<dt>${ic("sliders", 16)}<span>Info</span></dt><dd>The event: its map, its courses, your role, the encryption; its properties, its team.</dd>`
                : sec.id === "options" ? html`<dt>${ic("sliders", 16)}<span>Options</span></dt><dd>The full ribbon, on one line or its tabs alone; the quick-access bar; multiple files.</dd>`
                  : [...(sec.items || []), ...(sec.groups || []).flatMap((x) => x[1])].map(([act, l, d]) => html`<dt>${raw(TR.actIcon(act, 16))}<span>${l}</span></dt><dd>${d}</dd>`)}</dl>`)}
        </section>`;
      },
      avance: () => html`
        <section class="mx-slide" id="tr-avance">
          <p class="mx-kicker">${K}</p>
          <h2>The advanced level</h2>
          <p>Course setting has two levels. The <b>essential</b> level, for everyone, does what a Purple Pen file does, plus Ozimut's
            teamwork, field mode, checks and after-race tools. The <b>advanced</b> level adds what Condes, another course-setting program,
            does, for more specialised needs; it is open to everyone. Its buttons carry a small orange dot. A Purple Pen file (.ppen) does not keep
            these additions: the export says first what it leaves out; the Ozimut file (.ozmt) keeps everything.</p>
          <h3>Coming from another program</h3>
          <p>${W("import-courses")} takes the controls, courses, classes and relay teams of an IOF XML file (3.0 or 2.0.3) exported from
            Condes, OCAD, Purple Pen or a timing program, or the courses of an OCAD map prepared with its
            course-setting module (checked on an OCAD 2018 file: controls, descriptions, start, courses). An IOF XML dropped with its map on “Import an event”
            creates the event. Variations arrive as courses of their own.</p>
          <h3>Classes</h3>
          <p>${W("classes")}: each class, its course and its expected entries. A course's class list and entries follow from them, and
            with them the controls' loads.</p>
          <h3>Variations and relays</h3>
          <p>The <b>diamond</b> (${W("var-phi")}) goes from the chosen control to the next: two branches run one after the other, with a
            way back between them; the variations are called AB and BA. Add each branch's controls and the way back's by choosing the
            variation above the map. A fork or loops can have up to 20 branches. In ${W("relay")}: fill the teams with the same variations
            in another order, couple forks (“A=C”: whoever runs A runs C on the same leg), tick the legs on which each branch is run, and
            edit the teams by hand (bib, name, each leg's variation), the cells that make a team different from the others in red.</p>
          <h3>Forms and disciplines</h3>
          <p>A course's properties give its <b>form</b> — normal, string course (the string followed along the routes drawn), trail-O —,
            lines between the controls or not, its <b>discipline</b> (MTB-O: lengths along the routes; ski-O: a dot in the circles'
            centre), rogaine (points = the code rounded down to ten) and “all controls”. A control can be in <b>random order</b>
            (${W("random-section")}): no lines to, between or from the section's controls, and a line in the descriptions.
            ${W("finish-at-start")} draws the finish on the start.</p>
          <p><b>MTB-O</b>'s symbols (ISMTBOM 2022) are among the special objects: one-way compulsory, forbidden route, dangerous section,
            obstacle across the track, forbidden to pass; they are drawn after the specification's description, their sizes to be
            checked.</p>
          <h3>Controls and descriptions</h3>
          <p>A control's properties add its other units, a lock (it no longer moves when dragged) and, in trail-O, its flags (“A–E”, in
            column B) and right answer. A description box can carry a second symbol (tick “2nd symbol” when choosing it);
            ${W("my-symbols")} adds symbols of your own, taken from SVG drawings; the event's properties put its date after the title.</p>
          <h3>Checking and measuring</h3>
          <p>${W("view-angles")} shows the turn at each control (in red beyond 120°), ${W("view-nearest")} rings the controls too close;
            ${W("rep-controls")} gives each control with its units and its nearest control, ${W("trail-answer")} the right answers. A leg
            can have several routes (${W("routes-alt")}), the length taking the shortest. Outside France, the climb comes from the open
            terrain tiles (SRTM, about 30 m).</p>
          <h3>Layout and printing</h3>
          <p>The special objects add the <b>enlarged section</b> (a frame showing another part of the map, magnified, with the course) and
            the <b>mask</b> (white, with holes). The courses' PDF adds: several courses or copies per sheet, all courses on one map, the
            back of each map (name, classes, team and leg), registration marks with the printer's offset, and georeferenced pages (Avenza
            Maps). Descriptions are placed to the hundredth of a millimetre, and control cards can be backup cards.</p>
          <p>For an <b>offset print shop</b>, the PDF's colours can be <b>spot inks</b>: those an OCAD map defines, and the purple in an ink
            of its own (or one of the map's inks, if given its name), with PDF's real overprint. <b>Separations</b> give one page per
            plate — each spot ink, or C, M, Y and K —, in black, with its registration marks and its name; they need an OCAD or Mapper map,
            or the course alone. It is the same engine as Carto's separations.</p>
          <h3>Other formats</h3>
          <p>${W("export-geotiff")}, SVG (each object named), KMZ with the map, MapRun, OCAD's text of the courses, IOF XML 2.0.3 with each
            variation as a course, and a package for Livelox's import page (a direct upload to Livelox needs an agreement with Livelox).</p>
          <h3>Maps</h3>
          <p>${W("maps")}: other maps in the event, placed on the first (by their georeferencing, the same frame, or two points on each),
            and the map of each part of a course. ${W("map-templates")} shows the
            templates of an OCAD map you give it. ${W("field-states")} names the controls' states in field mode.</p>
        </section>`,
      calculs: () => html`
        <section class="mx-slide" id="tr-calculs">
          <p class="mx-kicker">Course setting</p>
          <h2>The calculations, explained</h2>
          <h3>The climb</h3>
          <p>The altitude is read every 10 m along each leg from IGN's terrain model (RGE ALTI, accurate to the metre in France), then
            smoothed over three points: the model has small irregularities which, added up, would inflate the climb. The climb is the sum of the ascents,
            rounded to 5 m. In a straight line, a leg that goes round a hill counts the hill: that is why the Route tool lets you draw the
            planned route, which is then used for the calculation.</p>
          <h3>The winning time</h3>
          <p>From the official results of the last two seasons (about a hundred races of the same format), we record for each course the winner's pace, in
            minutes per kilometre, and their official CN 15 days before. The higher the CN, the faster the pace: the relationship is fitted once
            and for all, and gives the pace of a winner with a given CN. For example, on the same course, a winner with a CN of 6,500 runs about 1.3 times
            as fast as a winner with a CN of 3,000.</p>
          <p>Official results do not give the courses' climb; the organisers' files often give it (“Results”). On those courses, the winner's time is compared
            with the time their CN would predict, according to the climb per kilometre: the more the course climbs, the longer the winner takes.
            So as not to rely on a handful of courses, the measurement is pulled towards the kilometre-effort rule (100 m of climb is worth 1 km on the flat, that is
            +10% of time for 10 m more per kilometre), the more so the less precise it is. In long distance, the measurement comes back to this rule; in sprint,
            where you run fast and every climb costs more, the effect is stronger.</p>
          <p>Each estimate gives a range: half the reference races have a winning time within it, because the terrain,
            the vegetation and the technical difficulty, which count for a lot, are not part of the calculation.</p>
          <h3>Mistakes and routes</h3>
          <p>A mistake, as in “Splits”: at least 20% and 10 seconds lost on the leg compared with the runner's pace over
            the whole race. Two routes are the same when the two tracks stay within about fifteen per cent of the leg's
            length (25 m at least) of each other all the way; the side (“on the left”, “straight on”) is read relative to the straight line.</p>
          <h3>The collection plan</h3>
          <p>A control can be collected when the last runner of each course that visits it has passed it: their start time, plus the distance to the control
            at a slow runner's pace (15 min/km in forest, 9 in sprint, in a straight line), plus a margin. The controls are shared out among the collectors by
            sector, and each one takes them in the order in which they can be reached.</p>
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
          <h2>Club rankings</h2>
          <p>A club is ranked by two independent choices, over the runners of a given sex and age group (juniors: up to M/W 20;
            adults: M/W 21 and over; elite: M/W 21 only).</p>
          <div class="mx-grid">
            <div class="mx-box" style="--c:var(--s1)"><h3>What is counted</h3><p>Each ranked runner's <b>CN</b>, in the chosen method, or their
              <b>points in national races</b>.</p></div>
            <div class="mx-box" style="--c:var(--s3)"><h3>How it is added up</h3><p>The <b>sum</b>, which mixes the number of runners and their level; the
              <b>mean</b>, the level of the average runner; the <b>top 5</b>, the mean of the five best, a missing runner counting 0; or the <b>number of runners</b>.</p></div>
          </div>
        </section>
        <section class="mx-slide" id="elite">
          <p class="mx-kicker">Clubs</p>
          <h2>Points in national races</h2>
          <p>These points do not depend on any CN method: they rest on places. At national-level races (French championships,
            national races, selection races, i.e. groups A and B1), the top 10 of each class score 25, 18, 15, 12, 10, 8, 6, 4, 2 and 1
            points. The points are <b>doubled at the French championships</b>. A class is attached to the course on which most of its runners
            ran. The clubs page counts the points of the 12 months before the chosen date; the club comparison shows them season by season.</p>
        </section>
        <section class="mx-slide" id="cfc">
          <p class="mx-kicker">Clubs</p>
          <h2>French Club Cup</h2>
          <p>The site applies FFCO's 2026 rule (“Classement national des clubs”, appendix 2) to every season. For each runner, it takes their
            5 best official scores of the year on foot and their 5 best in MTB or ski; women's points are multiplied by 1.4; the club
            adds up its runners' points. This calculation is not official: every ranked runner counts, since the site does not know the licence
            type, and a runner's club is that of their last race of the year. The cup was not awarded from 2023 to 2025.</p>
        </section>`,
      coureurs: () => html`
        <section class="mx-slide" id="progression">
          <p class="mx-kicker">Runners</p>
          <h2>Progress by age</h2>
          <p>For each season and each class (M14, W21, M45…), the site takes the CNs of all the runners ranked at the end of the season and looks
            at how they are spread: the median, and the bands that hold half and four fifths of the runners. Each month, a runner's CN
            is placed in this spread: their <b>percentile</b> is the share of the runners in their class whose CN is lower or equal. A
            runner at the 90<sup>th</sup> percentile does better than 90% of their class. The “all seasons” curve pools the seasons since 2012: it is
            a snapshot of all the runners, not the follow-up of one generation.</p>
        </section>
        <section class="mx-slide" id="categories">
          <p class="mx-kicker">Runners</p>
          <h2>Classes side by side</h2>
          <p>The “Classes” page shows, at a month-end, how each class's CNs are spread on one shared axis: a light band from the
            10<sup>th</sup> to the 90<sup>th</sup> percentile, the middle half darker (25<sup>th</sup> to 75<sup>th</sup>), the median and the mean. It
            shows at a glance where classes overlap: in forest, in October 2026, the median Ozimut index of M55 matched that of M16.</p>
          <p>The dots mark <b>the best of each class</b>, by one rule, the same everywhere: in each class of at least 5 ranked runners,
            its best 2% (rounded down), and at least its first; all of them at an equal CN at the cut. A class of 76 runners therefore
            shows one, a class of 192 shows three, a class of 275 shows five. A rule based on each class's spread (spotting the CNs
            that "leave the box" of a box plot) would have treated classes differently: the more spread out a class, the bigger the lead
            needed to leave it, and whole classes would have had nobody. For each, the page gives their rank in their class, how many
            times their class median they score, and their percentile if they raced in M21 or W21.</p>
        </section>
        <section class="mx-slide">
          <p class="mx-kicker">Runners</p>
          <h2>A runner's page</h2>
          <ul class="mx-list">
            <li><span><b>CN calculation</b>: at any date, the races of the last 12 months, those that count and the CN that comes out of them, redone
              exactly, with the same rounding and the same place-weighting rule, from the scores published race by race.</span></li>
            <li><span><b>CN history</b>: each race that enters the last 12 months and each race that leaves them, with the resulting CN and its
              change. For the official CN, it is the history published by FFCO, read live.</span></li>
            <li><span><b>Progress</b>: the CN month by month, then the runner's place in their age class. After a change of method, the previous
              method stays shown in grey for the rest of the visit.</span></li>
            <li><span><b>Map</b>: the races by département. <b>Seasons</b>: each season's summary. <b>Network</b>: the runners met.</span></li>
          </ul>
        </section>`,
      reseau: () => html`
        <section class="mx-slide" id="reseau">
          <p class="mx-kicker">Network</p>
          <h2>Who runs with whom</h2>
          <p>Two runners “meet” when they run the same course. Over all seasons, the site keeps for each runner the 30 runners
            they met most often, at least twice; for one season, it recalculates them from that season's results. It also counts how many
            times each finished ahead of the other. A runner who is not ranked (mispunch, DNF…) is behind all the ranked ones.</p>
        </section>
        <section class="mx-slide">
          <p class="mx-kicker">Statistics</p>
          <h2>Territories, participation, ages</h2>
          <ul class="mx-list">
            <li><span><b>Territories</b>: the number of competitions organised, of runners, and of competitions per 100 runners, by region or by
              département. A competition is attached to its organiser: the club (the first two digits of its number give the département), the
              departmental committee or the region.</span></li>
            <li><span><b>Participation</b>: the key figures season by season, for everyone, for a region or for a club, in one discipline or in
              all of them.</span></li>
            <li><span><b>Ages</b>: how the runners are spread across the age classes, women on the left, men on the right, as a share of the chosen group.</span></li>
            <li><span><b>Most active</b>: the runners who ran the most races, over all seasons, the last one or the current one, with the number of
              each type (long and middle distance, night, sprint, MTB, ski). Mispunches and retirements count: the runner started.</span></li>
          </ul>
        </section>`,
      relais: () => html`
        <section class="mx-slide">
          <p class="mx-kicker">Relays</p>
          <h2>The relay simulator</h2>
          <ul class="mx-list">
            <li><span><b>The model</b>: a runner's time on a leg is inversely proportional to their CN. A runner with a CN twice as high takes
              half the time. The reference time of each leg is set so that the best team of all clubs achieves exactly the
              sum of the format's reference times (for the CNE, the mean of the 5 best teams).</span></li>
            <li><span><b>The formats</b> follow FFCO's 2026 rules: CFC N1 to N4 with their composition criteria and their reserved legs (the
              women's and men's first and last legs alternate depending on whether the year is even or odd), CNE men, women, juniors and mini, class
              relays, sprint relay (2 women, 2 men, in the order W-M-M-W). You can also build your own format.</span></li>
            <li><span><b>The best team is truly the best</b>: the site tries every way of sharing the criteria among the legs, then
              chooses the runners by an exact assignment method (the Hungarian algorithm). Age and sex come from the class: a veteran who
              runs M21 counts as an M21. You can change the first team runner by runner, and add the runners who have no CN
              (foreign runners, relay-only runners) with the CN you credit them with.</span></li>
          </ul>
        </section>`,
      limites: () => html`
        <section class="mx-slide" id="limites">
          <p class="mx-kicker">Keep in mind</p>
          <h2>Limitations and caveats</h2>
          <ul class="mx-list bad">
            <li><span>The data come from FFCO's national ranking website. A race that is missing, wrongly entered or corrected later can explain a
              difference.</span></li>
            <li><span>The Ozimut method starts from the CNs of 2010; its first months mostly reflect that starting point.</span></li>
            <li><span>Its indexes in no way replace the official ranking, which remains the only reference.</span></li>
            <li><span>The monthly rankings are calculated at the end of each month; a runner's page details the calculation at any date.</span></li>
            <li><span>The provisional results are the organisers', before any correction by FFCO.</span></li>
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
    scatterChart($("#agr"), { series, xName: methodLabel("official"), yName: "Ozimut index", max });
    const stat = (name, pairs) => {
      const d = pairs.map((p) => p[1] - p[0]);
      return { name, n: pairs.length, r: pearson(pairs.map((p) => p[0]), pairs.map((p) => p[1])), bias: mean(d), mae: mean(d.map(Math.abs)) };
    };
    const stats = series.map((x) => stat(`${x.name} / ${methodShort("official")}`, x.data));
    $("#agr-stats").innerHTML = html`<div class="table-wrap"><table class="data compact"><thead><tr>
      <th>Methods compared</th><th class="r">Runners</th><th class="r">Correlation</th><th class="r">Mean difference</th><th class="r">Mean absolute difference</th></tr></thead>
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
      <div class="field"><span>Measure</span>${seg("evm", EVM.map((m) => [m, EV_LABEL[m]]), evMeas)}</div>
      <div class="field"><span>Races</span>${seg("evs", [["all", "all"], ["nat", "national"]], evScope)}</div>`;
    $$('[data-seg="evm"]').forEach((x) => x.addEventListener("click", () => { evMeas = x.dataset.value; drawEval(); }));
    $$('[data-seg="evs"]').forEach((x) => x.addEventListener("click", () => { evScope = x.dataset.value; drawEval(); }));
    $("#ev-seasons").innerHTML = html`${["For", "Spr"].map((tr) => {
      const rows = evRows(tr, evScope);
      const items = [...evSeasons(tr, evScope).map((y) => ({ label: y, d: rows[y].d[evPair][evMeas], n: rows[y].comps })),
        ...[["holdout", `${ev.holdout[0]}–${String(ev.holdout[1]).slice(2)}`], ["tuned", "tuning"]]
          .filter(([k]) => rows[k]).map(([k, label]) => ({ label: html`<b>${label}</b>`, d: rows[k].d[evPair][evMeas] }))];
      const up = items.filter((i) => i.d[1] > 0).length, against = items.filter((i) => i.d[2] < 0).length;
      return html`<section class="card"><div class="card-head"><div><h2>${t(`terrain.${tr}`)} · ${pairLabel(evPair)}</h2>
        <div class="hint">${EV_LABEL[evMeas]} (gap in points)</div></div></div>
        <div class="card-body">${forestPlot(items, evMeas)}
          <p class="muted" style="font-size:12.5px;margin:8px 0 0">Significant gap in favour of “${methodShort(evPair.split("-")[0])}”:
            ${fmt(up)} row${up !== 1 ? "s" : ""} out of ${fmt(items.length)}; in favour of “${methodShort(evPair.split("-")[1])}”: ${fmt(against)}.</p></div></section>`;
    })}`;
    const shown = M.filter((m) => ev.methods.includes(m));
    $("#ev-periods").innerHTML = html`
      <div class="filters"><div class="field"><span>Period</span>${seg("evq", [["holdout", `${ev.holdout[0]}–${ev.holdout[1]} (held-out seasons)`],
        ["tuned", "July 2025 – October 2026 (tuning)"]], evPeriod)}</div></div>
      <div class="grid grid-2">${["For", "Spr"].map((tr) => {
        const e = evRows(tr, "all")[evPeriod], en = evRows(tr, "nat")[evPeriod];
        if (!e) return "";
        const best = (meas) => Math.max(...shown.map((m) => e[meas][m]));
        return html`<section class="card"><div class="card-head"><div><h2>${t(`terrain.${tr}`)}</h2>
          <div class="hint">${fmt(e.comps)} competitions, ${fmt(e.circuits)} courses, ${fmt(e.runners)} results</div></div></div>
          <div class="table-wrap"><table class="data compact"><thead><tr><th>Method</th>${EVM.map((m) => html`<th class="r">${EV_LABEL[m]}</th>`)}</tr></thead>
            <tbody>${shown.map((m) => html`<tr><td>${methodKey(m)} ${methodShort(m)}</td>${EVM.map((meas) => {
              const x = evFmt(meas, e[meas][m], false) + (meas === "r2" || meas === "acc" ? "%" : "");
              return html`<td class="r num">${e[meas][m] === best(meas) ? html`<b>${x}</b>` : x}</td>`;
            })}</tr>`)}</tbody></table></div>
          <div class="card-body"><h3 style="margin:0 0 6px;font-size:14px">Gaps, all races</h3>
            ${forestPlot(EV_PAIRS().map((p) => ({ label: pairLabel(p), d: e.d[p][evMeas] })), evMeas)}
            ${en ? html`<h3 style="margin:12px 0 6px;font-size:14px">Gaps, national races (${fmt(en.comps)} competitions)</h3>
              ${forestPlot(EV_PAIRS().map((p) => ({ label: pairLabel(p), d: en.d[p][evMeas] })), evMeas)}` : ""}
            <p class="muted" style="font-size:12.5px;margin:8px 0 0">Measure of the gaps: ${EV_LABEL[evMeas].toLowerCase()} (chosen above).</p></div></section>`;
      })}</div>`;
    $$('[data-seg="evq"]').forEach((x) => x.addEventListener("click", () => { evPeriod = x.dataset.value; drawEval(); }));
  }
  return { TABS, STUDY_TAB, STUDY_CHAPTERS, SITE_CHAPTERS, lede, note, officiel, top, etude, calculs, tracerDoc, drawAgreement, drawEval };
}
