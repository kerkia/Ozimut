// This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not
// distributed with this file, You can obtain one at https://mozilla.org/MPL/2.0/.

// A neutral pack, after the IOF's competition rules: for any country without a pack of its own.

const AGES = [10, 12, 14, 16, 18, 20, 21, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90];

export default {
  id: "iof",
  country: "",
  sexes: ["M", "W"],
  ages: AGES,
  catOf(birth, sex, year) {
    const age = year - Number(birth);
    if (!Number.isFinite(age) || age < 0 || !sex) return "";
    const s = /^(f|d|w)/i.test(sex) ? "W" : "M";
    if (age <= 20) return s + (AGES.find((a) => a >= Math.max(10, age)) ?? 20);
    if (age < 35) return `${s}21`;
    return s + Math.min(90, Math.floor(age / 5) * 5);
  },
  order: ["ok", "nc", "mp", "dnf", "ot", "dsq", "dns", "run", "wait"],
  step: { forest: 120, sprint: 60, mtbo: 120, ski: 60 },
  clubGap: 1,
  drawBy: "class",
  resultsBy: "class",
  close: false,
  kinds: ["lic", "day", "foreign", "guest"],
  courses: [],
  imports: ["iof", "oe", "meos", "csv"],
  exports: ["iof", "oe", "winsplits", "meos", "html"],
  federation: "",
  licence: /^[\w-]{1,16}$/,
};
