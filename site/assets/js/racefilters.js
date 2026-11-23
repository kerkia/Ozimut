// The filters of the lists of races (owner, 2026-10-23: Résultats, En direct, Analyse de course, Analyse solo and Analyse
// multi alike, after Résultats'): what the races show (Résultats' own choice), the discipline, the region, a runner, a search
// on the race's name, place and organiser — each field only when the page's races carry it. The runner is looked for by name
// (no link to their page: the filter is not a way there) and shown with a cross that removes them. The state lives in the
// address under the same names on every page: f, t, reg, r, who, q.

import { html, raw, $, $$, normalise, displayName, fmtRegion } from "./util.js";
import { t } from "./i18n.js";
import * as auth from "./auth.js";
import * as data from "./data.js";
import * as country from "./country.js";
import { seg, runnerSearch, bindRunnerSearch, filterFold } from "./ui.js";
import { replaceQuery } from "./app.js";

export const SPECS = ["For", "Spr", "VTT", "Ski"];
/** A race of « Résultats »' index: its discipline, the CN terrain, else, for a race outside the CN, its format. */
export const specOf = (r) => ({ "Forêt": "For", Sprint: "Spr", VTT: "VTT", Ski: "Ski" })[r.terrain]     // i18n-ignore
  || (r.epreuve === "Sprint" ? "Spr" : ["MD", "LD", "Nuit"].includes(r.epreuve) ? "For" : null);
/** What a race of « Résultats »' index offers the filters. */
export const provFacts = (r) => ({ spec: specOf(r), region: r.region || "", lics: r.lics || [], text: `${r.name} ${r.place || ""} ${r.org || ""}` });

/**
 * The filter bar of a page's list. opts:
 *   id       the fields' prefix
 *   query    the page's address query (the state read from it)
 *   races    the page's races, and `facts(race)` → { spec, region, lics, text } (provFacts by default)
 *   show     Résultats' « Afficher » choices [[value, label]], or none
 *   mine     the signed-in runner's races by default (Résultats)
 *   ranBy    (race, licence) → also the runner's race (Résultats: FFCO's own published races)
 *   onChange called after any change
 *   address  the state kept in the address (false: the page's address is its own)
 *   runner   the runner chosen at the start (a page that remembers its own state: the Agenda; null: nobody), over the address's
 *   fields   the fields drawn (default all: show, spec, reg, runner, q); bare: without the fold (inside a page's own filters)
 * Returns { html, bind(), keep(race), shown, runner(), one() }.
 */
export async function raceFilters({ id, query = {}, races = [], facts = provFacts, show = null, mine = false, ranBy = null, onChange, address = true,
  fields = null, bare = false, runner }) {
  const has = (f) => !fields || fields.includes(f);
  const F = races.map(facts);
  const specs = SPECS.filter((s) => F.some((x) => x.spec === s));
  const regions = [...new Set(F.map((x) => x.region).filter(Boolean))].sort((a, b) => a.localeCompare(b, "fr"));
  // a runner: France's runners, on France's lists, for an account that sees France's data
  const withRunner = country.current() === "FR" && auth.sees("FR") && data.loadedCountry() === "FR";
  if (withRunner) await data.bootPrivate();
  const me = withRunner ? auth.myId() : null;
  const st = {
    shown: show?.some(([v]) => v === query.f) ? query.f : show ? show[0][0] : null,
    spec: specs.includes(query.t) ? query.t : "all",
    reg: regions.includes(query.reg) ? query.reg : "",
    runner: !withRunner ? null : runner !== undefined ? (runner && data.runner(runner) ? String(runner) : null) : query.r && data.runner(query.r) ? String(query.r) : query.who === "all" || !mine ? null : me,
    q: query.q || "",
  };
  const name = (lic) => displayName(data.runner(lic)?.nom || lic);
  // (address false: a page whose address holds its own choices, Analyse solo's race and runner)
  const save = () => address && replaceQuery({ f: show && st.shown !== show[0][0] ? st.shown : null, t: st.spec === "all" ? null : st.spec,
    reg: st.reg || null, r: st.runner && st.runner !== (mine ? me : null) ? st.runner : null,
    who: mine && me && !st.runner ? "all" : null, q: st.q || null });
  const changed = () => { save(); onChange?.(); };

  // one's own races or everyone's, as a choice of two in the look of « Afficher » (owner, 2026-10-29: a lone « Mes courses »
  // button looked chosen when it was not); another runner, found by the search, shows with a ✕ that takes them off
  const mineSeg = () => (me && data.runner(me) ? html`<div class="seg" role="group">
      <button type="button" data-rw="all" aria-pressed="${String(!st.runner)}">${t("rf.everyone")}</button>
      <button type="button" data-rw="me" aria-pressed="${String(st.runner === me)}">${t("rf.mine")}</button></div>` : "");
  const runnerField = () => html`${mineSeg()}${st.runner && st.runner !== me ? html`<span class="pill rf-pick">${name(st.runner)}<button type="button" class="rf-x" id="${id}-rx"
      title="${t("rf.clear")}" aria-label="${t("rf.clear")}">✕</button></span>` : ""}
    ${runnerSearch(`${id}-rs`, t(st.runner && st.runner !== me ? "rn.change" : "rf.find"))}`;
  const inner = html`<div class="filters rf" id="${id}">
    ${show && has("show") ? html`<div class="field"><span>${t("prov.show")}</span><div id="${id}-f">${raw(seg(`${id}f`, show, st.shown))}</div></div>` : ""}
    ${specs.length && has("spec") ? html`<div class="field"><span>${t("f.terrain")}</span><div id="${id}-t">${raw(seg(`${id}t`, [["all", t("f.all")], ...specs.map((s) => [s, t(`terrain.${s}`)])], st.spec))}</div></div>` : ""}
    ${regions.length && has("reg") ? html`<label class="field"><span>${t("prov.region")}</span><select id="${id}-reg"><option value="">${t("f.all")}</option>
      ${regions.map((x) => html`<option value="${x}" ${raw(x === st.reg ? "selected" : "")}>${fmtRegion(x)}</option>`)}</select></label>` : ""}
    ${withRunner && has("runner") ? html`<div class="field"><span>${t("prov.runner")}</span><div class="row rf-runner" id="${id}-who">${raw(runnerField())}</div></div>` : ""}
    ${has("q") ? html`<label class="field"><span>${t("prov.search")}</span><input type="search" id="${id}-q" value="${st.q}" placeholder="${t("rf.q")}" style="width:200px"></label>` : ""}
  </div>`;
  const html_ = bare ? inner : filterFold(inner);

  function bindRunner() {
    const box = $(`#${id}-who`);
    if (!box) return;
    box.innerHTML = runnerField();
    $(`#${id}-rx`)?.addEventListener("click", () => { st.runner = null; bindRunner(); changed(); });
    box.querySelectorAll("[data-rw]").forEach((b) => b.addEventListener("click", () => {
      const v = b.dataset.rw === "me" ? me : null;
      if (v === st.runner) return;
      st.runner = v; bindRunner(); changed();
    }));
    bindRunnerSearch($(`#${id}-rs`), { onPick: (l) => { st.runner = String(l); bindRunner(); changed(); } });
  }
  function bind() {
    for (const [k, key] of [["f", "shown"], ["t", "spec"]]) {
      $$(`[data-seg="${id}${k}"]`).forEach((b) => b.addEventListener("click", () => {
        st[key] = b.dataset.value;
        $$(`[data-seg="${id}${k}"]`).forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
        changed();
      }));
    }
    $(`#${id}-reg`)?.addEventListener("change", (e) => { st.reg = e.target.value; changed(); });
    $(`#${id}-q`)?.addEventListener("input", (e) => { st.q = e.target.value; changed(); });
    bindRunner();
    save();
  }
  /** Whether a race passes the filters (all but « Afficher », which is the page's: `shown`). */
  function keep(r) {
    const x = facts(r), qn = normalise(st.q);
    return (st.spec === "all" || x.spec === st.spec) && (!st.reg || x.region === st.reg)
      && (!st.runner || x.lics.includes(st.runner) || !!ranBy?.(r, st.runner))
      && (!qn || normalise(x.text).includes(qn));
  }
  return { html: html_, bind, keep, withRunner, get shown() { return st.shown; }, runner: () => st.runner, one: () => !!st.runner, searching: () => !!st.q.trim(),
    filtered: () => st.spec !== "all" || !!st.reg || !!st.runner };
}
