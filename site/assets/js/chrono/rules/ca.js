// This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not
// distributed with this file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Canada (Orienteering Canada): age classes by sex for championships, courses by level at local events.

const AGES = [10, 12, 14, 16, 20, 21, 35, 45, 55, 65, 75, 80, 85];

export default {
  id: "ca",
  country: "CA",
  sexes: ["M", "F"],
  ages: AGES,
  catOf(birth, sex, year) {
    const age = year - Number(birth);
    if (!Number.isFinite(age) || age < 0 || !sex) return "";
    const s = /^(f|d|w)/i.test(sex) ? "F" : "M";
    if (age <= 16) return s + (AGES.find((a) => a >= Math.max(10, age)) ?? 16);
    if (age <= 20) return `${s}17-20`;
    if (age < 35) return `${s}21`;
    const a = [...AGES].reverse().find((x) => x <= age && x >= 35);
    return `${s}${a}+`;
  },
  order: ["ok", "nc", "mp", "dnf", "ot", "dsq", "dns", "run", "wait"],
  step: { forest: 120, sprint: 60, mtbo: 120, ski: 60 },
  clubGap: 0,
  drawBy: "class",
  resultsBy: "class",
  close: true,
  kinds: ["lic", "day", "foreign", "guest"],
  courses: ["Novice", "Intermediate", "Short Advanced", "Long Advanced"],
  imports: ["iof", "oe", "meos", "csv"],
  exports: ["iof", "oe", "winsplits", "meos", "html"],
  federation: "Orienteering Canada",
  licence: /^[\w-]{1,16}$/,
};
