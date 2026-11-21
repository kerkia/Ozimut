// « Apprendre › Test » and the game « Quel poste ? » (owner, 2026-11-10, after a club's quiz « définitions carte course
// d'orientation »: 28 questions, a feature named, four map extracts with a control circle, 20 s each). A feature is shown — its
// photo (by default), its name, its control description symbols, any of them — and four map extracts with a control circle:
// which one is on it? **The map extracts are the quiz's own** (owner, 2026-11-10: use those, never invent map extracts):
// each question's right answer, 147 × 143 px as the quiz serves them, in site/assets/learn/map/<key>.png; a feature's extract
// is its question's answer, so a wrong option shows another feature's. The symbols are the IOF's (Purple Pen's, cdsymbol.js).
// From the quiz also come its 28 features and, for each, the three wrong answers its author chose (« Facile »: those of another
// question, mapped feature by feature; its three pictures that answer no question — used nine times — are kept as they are,
// `EXTRA`, read by Ozimut: one boulder in a group « Rocher » (filed under « Gros rocher »), a small ring of form line « Butte »,
// a green cross « Souche »). « Aléatoire »: three other features of the 28 at random, never one shown by the same symbols.
// The photos of the terrain (owner, 2026-11-10: « the whole point »): the quiz's own photos are not used — two carry stock
// agencies' watermarks (Dreamstime, iStock), one a photographer's signature, the others no source —, but freely licensed
// ones from Wikimedia Commons, one a feature where an unambiguous one was found — the feature at a control's scale, nothing
// else of the list in the frame (owner, 2026-11-10: a « petite colline » that was a big wooded hill behind a vegetation
// boundary): 20 of 28, none for the boulder cluster (many boulders too close to map one by one: those found showed two or three
// big ones, each a boulder of its own), the earth wall (a linear bank: those found showed their ditch, or a hedge), re-entrant,
// spur, small hill, path crossing, thicket and earth bank —, each credited in the list under the game; one by its author, with
// his permission: Emmanuel Roiné's « zone rocheuse », the quiz's own, and five more of his (owner, 2026-11-10: route goudronnée,
// souche, levée de terre, grand rocher, petite falaise; his photo replaces the web's wherever he has one — owner: a professional
// orienteering coach, his photos are best), and nine more on 2026-11-11 (abrupt de terre, borne, butte, coude, croisement and
// jonction de chemins, falaise, grillage, petite ruine: the path crossing and the earth bank have a photo since). A feature may have several photos (`k` in learnphotos.js), drawn at random. Replace one by dropping site/assets/learn/<key>.webp and
// changing its credit in learnphotos.js. The quiz's « face/paroi rocheuse (petite falaise) », a second rock face, is here the
// impassable cliff, and its « zone rocheuse » the boulder field.
// Its « fossé (sec) » is ISOM 108, brown dots (« petite ravine, fossé sec ou tranchée »), so described by 1.8 « Petite ravine »,
// not by 3.5 « Fossé, rigole », a water feature (306, blue) — owner, 2026-11-10.

import { html, fmt } from "../util.js";
import { t } from "../i18n.js";
import { loadSymbols, symbol } from "../tracer/symbols.js";
import { cdSymbolSvg } from "../cdsymbol.js";
import { grid, framed } from "./common.js";
import { shuffle } from "./rng.js";
import { LETTERS } from "./quiz.js";
import { PHOTOS } from "./learnphotos.js";
export { PHOTOS };

await loadSymbols();

/** The features, in the quiz's order: key (names `lt.q.<key>`, the extract `learn/map/<key>.png`), the description symbols
 *  that say it (Purple Pen's ids: column D, then E or G), and the quiz's three wrong answers (« Facile »), in its order. */
export const BANK = [
  { k: "stump", sym: ["4.10"], easy: ["earthBank", "cairn", "pathCross"] },
  { k: "boulder", sym: ["2.4"], easy: ["depression", "knoll", "roughOpen"] },
  { k: "roughOpen", sym: ["4.4"], easy: ["bigTree", "pit", "reentrant"] },
  { k: "pathBend", sym: ["5.2", "11.7"], easy: ["smallDep", "pathCross", "cliff"] },
  { k: "rockFace", sym: ["2.1"], easy: ["boulder-2", "knoll-2", "boulderField"] },
  { k: "smallDep", sym: ["1.13"], easy: ["spur", "fence", "earthWall"] },
  { k: "earthWall", sym: ["1.6"], easy: ["pathCross", "hill", "knoll-2"] },
  { k: "bigTree", sym: ["4.9"], easy: ["stump-2", "vegBoundary", "ruin"] },
  { k: "road", sym: ["5.1"], easy: ["pathCross", "knoll", "pathJunction"] },
  { k: "boulderCluster", sym: ["2.6"], easy: ["impFence", "ruin", "boulder-2"] },
  { k: "pathCross", sym: ["5.2", "10.1"], easy: ["fence", "pathJunction", "road"] },
  { k: "pit", sym: ["1.14"], easy: ["stump", "knoll-2", "knoll"] },
  { k: "knoll", sym: ["1.10"], easy: ["boulder-2", "roughOpen", "earthBank"] },
  { k: "depression", sym: ["1.12"], easy: ["knoll", "vegBoundary", "hill"] },
  { k: "ruin", sym: ["5.13"], easy: ["impFence", "cairn", "pathBend"] },
  { k: "reentrant", sym: ["1.3"], easy: ["earthBank", "smallDep", "boulderField"] },
  { k: "boulderField", sym: ["2.5"], easy: ["depression", "stump-2", "cliff"] },
  { k: "cliff", sym: ["2.1"], easy: ["boulderField", "depression", "fence"] },
  { k: "fence", sym: ["5.9"], easy: ["earthWall", "pathCross", "cairn"] },
  { k: "spur", sym: ["1.2"], easy: ["depression", "earthBank", "roughOpen"] },
  { k: "impFence", sym: ["5.9"], easy: ["earthWall", "pathCross", "pit"] },
  { k: "vegBoundary", sym: ["4.7"], easy: ["fence", "bigTree", "impFence"] },
  { k: "cairn", sym: ["5.17"], easy: ["bigTree", "stump-2", "cliff"] },
  { k: "thicket", sym: ["4.5"], easy: ["ditch", "vegBoundary", "roughOpen"] },
  { k: "ditch", sym: ["1.8"], easy: ["spur", "fence", "pathBend"] },
  { k: "pathJunction", sym: ["5.2", "10.2"], easy: ["pathCross", "pathBend", "fence"] },
  { k: "hill", sym: ["1.9"], easy: ["smallDep", "knoll", "depression"] },
  { k: "earthBank", sym: ["1.4"], easy: ["spur", "cairn", "rockFace"] },
];
const BY = Object.fromEntries(BANK.map((f) => [f.k, f]));
/** The quiz's three wrong pictures that answer none of its questions (owner, 2026-11-10: shown as the quiz shows them, with
 *  Ozimut's reading of their circle): only among the « Facile » answers, where the quiz has them. `name`: a name of their own. */
const EXTRA = {
  "boulder-2": { k: "boulder", name: "lt.q.rock" },   // one boulder at the centre, in a group of boulders
  "knoll-2": { k: "knoll" },                          // a small ring of form line, no slope tick: a knoll
  "stump-2": { k: "stump" },                          // a green cross (ISOM 419)
};
/** An option: its feature, its picture (`learn/map/<img>.png`) and its name. */
const pic = (key) => { const x = EXTRA[key], f = BY[x ? x.k : key];
  return { f, img: key, name: x?.name ? t(x.name) : nameOf(f) }; };
export const MAX = BANK.length;
/** What a question shows (owner, 2026-11-10: the photo of the terrain the most interesting, so chosen by default): any of a
 *  photo of the feature, its name, its description symbols. A feature without a photo shows its name instead. */
export const SHOW = ["photo", "name", "sym"];
export const LIMITS = [5, 10, 15, 20, 30, 45, 60];
/** The defaults (owner, 2026-11-10): 20 questions, 10 s each, the photo and the name shown (not the description symbols). */
export const DEFAULTS = { count: 20, limit: 10, show: ["photo", "name"] };
/** Each feature's photos (games/learnphotos.js: an entry names its feature in `k`, else by its key), and the features that
 *  have one. */
const PHOTOS_OF = {};
for (const [key, ph] of Object.entries(PHOTOS)) (PHOTOS_OF[ph.k || key] ||= []).push(key);
export const PHOTO_KEYS = BANK.filter((f) => PHOTOS_OF[f.k]).map((f) => f.k);

const nameOf = (f) => t(`lt.q.${f.k}`);
const sig = (f) => f.sym.join("+");
/** An option's map extract with its control circle, the quiz's own (147 × 143 px). */
const extract = (o) => html`<img class="lt-map" src="/assets/learn/map/${o.img}.png" width="147" height="143" alt="${t("lt.map.alt")}" draggable="false">`;
/** Its description symbols, side by side as on a sheet. */
const symbols = (f, size = 56) => html`<span class="lt-syms" role="img" aria-label="${t("lt.symbols")}">${f.sym.map((id) => {
  const s = symbol(id);
  return s ? html`<span class="lt-cell">${cdSymbolSvg(s, size, "lt-sym")}</span>` : "";
})}</span>`;
/** A photo's credit (author, licence, Wikimedia Commons; `page`: with the link to the file, whose name gives the answer
 *  away — after the answer only). */
export const credit = (ph, page = true) => ph.permission
  ? html`<span class="lt-credit">${t("lt.credit", { a: ph.author })} · ${t("lt.credit.perm")}</span>`
  : html`<span class="lt-credit">${t("lt.credit", { a: ph.author })} ·
  <a href="${ph.licenceUrl}" target="_blank" rel="noopener">${ph.licence}</a> ·
  ${page ? html`<a href="${ph.page}" target="_blank" rel="noopener">Wikimedia Commons</a>` : "Wikimedia Commons"} · ${t("lt.credit.cut")}</span>`;
/** A photo, by its key (its credit in the list under the game, `creditsHtml`: owner, 2026-11-10, not under each photo), `cap`
 *  the feature's name right over it (owner, 2026-11-10: the name beside the photo, not at the question's far left). */
const photo = (key, cap = "") => { const ph = PHOTOS[key];
  return html`<figure class="lt-photo">${cap}<img src="/assets/learn/${key}.webp" width="${ph.w}" height="${ph.h}" alt="${t("lt.photo.alt")}" decoding="async"></figure>`; };
/** Every photo's credit, a folded list (under the test in « Apprendre » and under the game in « Jeux »). */
export const creditsHtml = () => html`<details class="lt-credits"><summary>${t("lt.credits")}</summary><p class="muted">${t("lt.credits.hint")}</p>
  <ul>${PHOTO_KEYS.flatMap((k) => PHOTOS_OF[k].map((key) => html`<li><b>${t(`lt.q.${k}`)}</b> — ${credit(PHOTOS[key])}</li>`))}</ul>
  <p class="muted">${t("lt.credit.maps")}</p></details>`;

/**
 * The spec for the games' engine (games/quiz.js runGame): `count` features at random (those with a photo first when photos
 * are shown), `limit` seconds each, showing `show` (SHOW), each answered among four map extracts — `mode` "groups": the quiz's
 * own four, grouped as in its PDF (owner, 2026-11-10: « Apprendre »'s training and the game's beginner level); "random": the
 * right one and three others drawn at random, different each time (the game's advanced level). `palmKey`: the palmarès it
 * goes to when signed in (none for the training, owner). `onState`: the engine's (the page hides its settings).
 */
export function testSpec({ count = DEFAULTS.count, limit = DEFAULTS.limit, show = DEFAULTS.show, mode = "groups", key = "learntest", palmKey = null, onState, onStop } = {}) {
  count = Math.max(1, Math.min(MAX, count | 0));
  show = SHOW.filter((x) => show.includes(x));
  if (!show.length) show = DEFAULTS.show;
  let order = [];
  return {
    key, count, limit, scoring: "count", pickOnly: true, scrollOnPlay: true, onState,
    topAction: onStop ? { label: t("lt.stop"), onClick: onStop } : null,
    // the palmarès: one a level of the game, best = the larger share of right answers, then the shorter mean time a question
    palmares: !!palmKey, palmKey, palmTitle: t("lt.tab"),
    palmScore: (R) => {
      const right = R.filter((x) => x.ok).length, mean = R.reduce((a, x) => a + (x.ms || 0), 0) / Math.max(1, R.length);
      return { value: (right / Math.max(1, R.length)) * 1e6 - mean, higher: true,
        label: `${right} / ${R.length} · ${fmt(mean / 1000, 1)} s`, extra: `${t("lt.seconds", { n: limit })} · ${show.map((s) => t(`lt.sh.${s}`)).join(" + ")}` };
    },
    intro: html`<p>${t("lt.rules", { n: count, s: limit })}</p><p class="muted">${t(mode === "random" ? "lt.rules.how.random" : "lt.rules.how")}</p>`,
    make(i, r) {
      if (i === 0) {
        const all = shuffle(r, BANK.slice());
        order = (show.includes("photo") ? [...all.filter((f) => PHOTOS_OF[f.k]), ...all.filter((f) => !PHOTOS_OF[f.k])] : all).slice(0, count);
        order = shuffle(r, order);
      }
      const f = order[i];
      const right = pic(f.k);
      const wrong = mode === "groups" ? f.easy.map(pic)
        : shuffle(r, BANK.filter((g) => g !== f && sig(g) !== sig(f))).slice(0, 3).map((g) => pic(g.k));
      const opts = shuffle(r, [right, ...wrong]);
      const answer = LETTERS[opts.indexOf(right)];
      // the pictures alone answer (owner, 2026-11-10: no letters): the result and the summary say the features' names
      const labels = Object.fromEntries(opts.map((o, k) => [LETTERS[k], o.name]));
      // what this question shows: the choice, a missing photo replaced by the name
      const withPhoto = show.includes("photo") && !!PHOTOS_OF[f.k];
      // one of the feature's photos, at random
      const shot = withPhoto ? PHOTOS_OF[f.k][Math.floor(r() * PHOTOS_OF[f.k].length)] : null;
      const withName = show.includes("name") || (show.includes("photo") && !withPhoto) ;
      const withSym = show.includes("sym");
      const puzzle = {
        options: LETTERS.slice(0, 4), answer,
        text: "", labels,
        render(stage) {
          // the name over the photo, centred with it (owner, 2026-11-10: close to the photo on a wide screen)
          const name = withName ? html`<p class="lt-name">${nameOf(f)}</p>` : "";
          if (withPhoto || withSym || withName) stage.insertAdjacentHTML("beforeend", html`<div class="lt-ask">${withPhoto ? photo(shot, name) : name}${withSym ? symbols(f) : ""}</div>`);
          const box = (g, k) => { const d = document.createElement("div"); d.className = "lt-pic"; d.innerHTML = extract(g); return framed(d, "", `g-pick-${LETTERS[k]}`); };
          grid(stage, opts.map(box), 4).classList.add("lt-grid");
          stage.dataset.mode = mode;
        },
        solution(stage, choice, ok) {
          // the right circle framed, a wrong choice marked, each named by its tooltip; the names in the result's line, not over
          // the circles (owner, 2026-11-10: the whole question on a laptop's screen)
          opts.forEach((g, k) => {
            const fr = stage.querySelector(`.g-pick-${LETTERS[k]}`);
            if (!fr) return;
            fr.title = labels[LETTERS[k]];
            if (g === right) fr.classList.add("g-right");
            else if (choice === LETTERS[k]) fr.classList.add("g-wrong");
          });
          puzzle.info = ok ? nameOf(f) : labels[choice] ? t("lt.yours", { a: labels[choice] }) : "";
        },
      };
      return puzzle;
    },
  };
}

/** « Jeux » (games.js), « Quel poste ? »: no settings — 20 questions of 10 s —, two levels (owner, 2026-11-10): « Débutant »,
 *  the quiz's groups of four, the photo when the feature has one and its name; « Avancé », three extracts drawn at random, the
 *  photo alone, the name only for a feature without one; each its own palmarès. */
export const LEVELS = [["beginner", "g.lvl.beginner"], ["advanced", "g.lvl.advanced"]];
export function spec(level = "beginner") {
  level = LEVELS.some(([k]) => k === level) ? level : "beginner";
  return testSpec({ key: `learntest-${level}`, palmKey: `learntest-${level}`, mode: level === "advanced" ? "random" : "groups",
    show: level === "advanced" ? ["photo"] : ["photo", "name"] });
}
