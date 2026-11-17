// France (FFCO): what the federation's rules and habits ask of a timing tool. Data only: labels come from the catalogues.

const AGES = [10, 12, 14, 16, 18, 20, 21, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80];

export default {
  id: "fr",
  country: "FR",
  sexes: ["H", "D"],
  ages: AGES,
  /** A licensee's category for a season: the age reached in that year. */
  catOf(birth, sex, year) {
    const age = year - Number(birth);
    if (!Number.isFinite(age) || age < 0 || !sex) return "";
    const s = /^(f|d|w)/i.test(sex) ? "D" : "H";
    if (age <= 20) return s + (AGES.find((a) => a >= Math.max(10, age)) ?? 20);
    if (age < 35) return `${s}21`;
    return s + Math.min(80, Math.floor(age / 5) * 5);
  },
  order: ["ok", "nc", "mp", "dnf", "ot", "dsq", "dns", "run", "wait"],
  step: { forest: 120, sprint: 60, mtbo: 120, ski: 60 },       // usual start interval on a circuit, seconds
  clubGap: 1,                                                    // never two runners of a club one after the other on a circuit
  drawBy: "course",                                              // start times are drawn circuit by circuit
  resultsBy: "course",                                           // the national ranking reads results by circuit
  close: true,                                                   // the circuits close at a set time: later is « hors délais »
  kinds: ["lic", "day", "foreign", "guest"],                     // licence, titre de participation, another federation's, none
  courses: ["Vert", "Bleu", "Jaune", "Orange", "Violet court", "Violet moyen", "Violet long", "Noir"],
  imports: ["ffco", "oe", "iof", "meos", "csv"],
  exports: ["ffco", "iof", "oe", "winsplits", "meos", "html"],
  federation: "FFCO",
  licence: /^\d{1,7}$/,
};
