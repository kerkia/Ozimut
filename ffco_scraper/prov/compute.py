"""Provisional race scores and CNs for an organiser's results, as each method would publish them.

The same steps as the engine, with its own functions, on the runners matched to a licence:
 * official: the official CN 15 days before - in forest and sprint from 2026 as build_site computes it, across FFCO's
   yearly rescale (ffco_scale.py, with the factors the site's build saved), else FFCO's last published one (cn_history) -,
   circuit value = mean of CN x time over the fastest ⌈2N/3⌉ (FFCO's 2026 rule: 367 of 400 circuits of 2026 exact, 126
   with the two thirds rounded down), score = value / time;
 * Fit and Top (linear and quadratic): the base method's internal CN 15 days before (the aggregate of its raw
   scores, as run_method values circuits), its circuit value, raw score = value / time, published score = raw x
   the recalage factor of the race's day; Fit and Top share these scores and differ in their CN.
PM, abandon, disqualified and over time score 0. D10/H10 take no part. The CN after the race: the method's
aggregate of its published scores in the window plus this one (for a race FFCO already published, its own
copy of the race is left out). Only classes that are circuits are scored: a circuit's value needs everyone
who ran it, which a list by category does not give.
"""

from __future__ import annotations

import json
from datetime import date, timedelta
from pathlib import Path

from .. import ffco_scale
from ..cn import CnParams, Decimal_round, aggregate, circuit_value, fade_factors, is_junior, title_weight
from ..cn_engine import build_methods, daily_knots, factor_on

COMPUTED = ("fair", "top6w")
BASE = {"fair": "fair", "top6w": "fair"}
FAIL = ("mp", "dnf", "dsq", "ot")
OFFICIAL = CnParams(sample_rounding="ceil")
FOOT = {"Forêt": "For", "Sprint": "Spr"}


class Scorer:
    def __init__(self, con, scale_file: Path | None = None):
        """`scale_file`: snap/official_scale.json of France's site data (the rescale's factors the build fitted)."""
        self.con = con
        self.specs = build_methods()
        self._knots: dict[tuple[str, str], list] = {}
        self.scale_file = scale_file
        self._scale = None

    def scale(self):
        """FFCO's official CN across its yearly rescale (built once, on the first forest or sprint race of 2026 on)."""
        if self._scale is None:
            cached = None
            if self.scale_file and self.scale_file.exists():
                try:
                    cached = json.loads(self.scale_file.read_text(encoding="utf-8"))
                except ValueError:
                    cached = None
            self._scale = ffco_scale.from_db(self.con, date.today().year, cached=cached)
        return self._scale

    def on_scale(self, terrain: str, d: date) -> bool:
        return terrain in FOOT and d.year >= ffco_scale.FIRST

    def knots(self, method: str, terrain: str):
        if (method, terrain) not in self._knots:
            rows = self.con.execute("SELECT date_iso, factor FROM normalisation WHERE method = ? AND terrain = ? ORDER BY date_iso",
                                    (method, terrain)).fetchall()
            self._knots[(method, terrain)] = daily_knots([(date.fromisoformat(r[0]), r[1]) for r in rows])
        return self._knots[(method, terrain)]

    def params(self, method: str, terrain: str) -> CnParams:
        return OFFICIAL if method == "official" else self.specs[method].params.for_terrain(terrain)

    # ---- what a runner brings to the circuit's value ------------------------------------------------------
    def official_j15(self, lic: str, terrain: str, as_of: date, race_day: date | None = None) -> int | None:
        if race_day and self.on_scale(terrain, race_day):
            return self.scale().cn(lic, FOOT[terrain], as_of, 1, race_day.year)
        r = self.con.execute("""SELECT cn, date_iso FROM cn_history WHERE licence = ? AND method = 'official' AND terrain = ?
                                AND date_iso <= ? AND cn IS NOT NULL ORDER BY date_iso DESC LIMIT 1""",
                             (lic, terrain, as_of.isoformat())).fetchone()
        if not r or r[1] <= (as_of - timedelta(days=OFFICIAL.window_days)).isoformat():
            return None
        return r[0]

    def internal_j15(self, lic: str, base: str, terrain: str, as_of: date) -> int | None:
        p = self.params(base, terrain)
        rows = self.con.execute("""SELECT score_raw, poids, date_iso, categorie FROM scores INDEXED BY idx_scores_runner WHERE licence = ?
                                   AND method = ? AND terrain = ? AND counts_for_cn = 1
                                   AND score_raw IS NOT NULL AND date_iso >= ? AND date_iso <= ?
                                   ORDER BY date_iso, course_id, circuit_id""",
                                (lic, base, terrain, (as_of - timedelta(days=p.window_days)).isoformat(), as_of.isoformat())).fetchall()
        if not rows:
            return None
        fade = fade_factors([date.fromisoformat(r[2]) for r in rows], [is_junior(r[3]) for r in rows], as_of, p)
        cn, kept = aggregate([r[0] for r in rows], [r[1] or 1.0 for r in rows], p, fade)
        return cn if kept else None

    # ---- the CN after the race -------------------------------------------------------------------------------
    def cn_after(self, lic: str, method: str, terrain: str, d: date, score: int, weight: float, skip_course: int | None,
                 cat: str | None = None) -> int | None:
        """`cat`: the runner's category in this race (a junior's races fade, params.junior_fade)."""
        if method == "official" and self.on_scale(terrain, d):
            skip = {c for (c,) in self.con.execute("SELECT circuit_id FROM circuits WHERE course_id = ?", (skip_course,))} if skip_course else set()
            return self.scale().cn_after(lic, FOOT[terrain], d, score, skip)
        p = self.params(method, terrain)
        rows = self.con.execute("""SELECT score, poids, date_iso, categorie FROM scores INDEXED BY idx_scores_runner WHERE licence = ?
                                   AND method = ? AND terrain = ? AND counts_for_cn = 1
                                   AND score IS NOT NULL AND date_iso >= ? AND date_iso <= ? AND course_id IS NOT ?
                                   ORDER BY date_iso, course_id, circuit_id""",
                                (lic, method, terrain, (d - timedelta(days=p.window_days)).isoformat(), d.isoformat(), skip_course)).fetchall()
        s = [r[0] for r in rows] + [score]
        w = [r[1] or 1.0 for r in rows] + [weight if method != "official" else 1.0]
        fade = fade_factors([date.fromisoformat(r[2]) for r in rows] + [d], [is_junior(r[3]) for r in rows] + [is_junior(cat)], d, p)
        return aggregate(s, w, p, fade)[0]

    # ---- one class ---------------------------------------------------------------------------------------------
    def score_class(self, klass: dict, race, ffco_course: int | None) -> dict | None:
        """Adds to each matched runner {'scores': {m: n}, 'cnj15': {m: n}, 'cnAfter': {m: n}}; returns the circuit values."""
        terrain = race["terrain"]
        if terrain not in ("Forêt", "Sprint", "VTT", "Ski"):
            return None
        d = date.fromisoformat(race["date_iso"])
        weight = title_weight(race["name"])
        values = {}
        rows = [r for r in klass["runners"] if r.get("lic") and r["status"] != "nc" and (r.get("category") or r.get("catCn") or "") not in ("H10", "D10")]
        # official
        as_of = d - timedelta(days=OFFICIAL.lag_days)
        cn_in = {r["lic"]: self.official_j15(r["lic"], terrain, as_of, d) for r in rows}
        ranked = [(cn_in[r["lic"]], r["time_s"]) for r in rows if r["status"] == "ok" and r["time_s"] and cn_in[r["lic"]]]
        if OFFICIAL.new_entrant_rescue and len(ranked) < OFFICIAL.min_ranked:
            ranked += [(OFFICIAL.new_entrant_value, r["time_s"]) for r in rows
                       if r["status"] == "ok" and r["time_s"] and not cn_in[r["lic"]]][:OFFICIAL.min_ranked - len(ranked)]
        cv, _ = circuit_value(ranked, OFFICIAL)
        values["official"] = cv
        for r in rows:
            r.setdefault("scores", {}); r.setdefault("cnj15", {}); r.setdefault("cnAfter", {})
            r["cnj15"]["official"] = cn_in[r["lic"]]
            if cv is not None:
                sc = Decimal_round(cv / r["time_s"]) if r["status"] == "ok" and r["time_s"] else (0 if r["status"] in FAIL else None)
                if sc is not None:
                    r["scores"]["official"] = sc
                    r["cnAfter"]["official"] = self.cn_after(r["lic"], "official", terrain, d, sc, 1.0, ffco_course)
        # the computed methods: one circuit value per base (fair), shared by its Top
        for base in ("fair",):
            p = self.params(base, terrain)
            as_of = d - timedelta(days=p.lag_days)
            cn_in = {r["lic"]: self.internal_j15(r["lic"], base, terrain, as_of) for r in rows}
            ranked = [(cn_in[r["lic"]], r["time_s"]) for r in rows if r["status"] == "ok" and r["time_s"] and cn_in[r["lic"]]]
            cv, _ = circuit_value(ranked, p)
            values[base] = cv
            f = factor_on(self.knots(base, terrain), d)
            for r in rows:
                if cv is None:
                    continue
                raw = Decimal_round(cv / r["time_s"]) if r["status"] == "ok" and r["time_s"] else (0 if r["status"] in FAIL else None)
                if raw is None:
                    continue
                pub = Decimal_round(raw * f)
                for m in COMPUTED:
                    if BASE[m] == base:
                        r["scores"][m] = pub
                        r["cnAfter"][m] = self.cn_after(r["lic"], m, terrain, d, pub, weight, ffco_course,
                                                        r.get("category") or r.get("catCn"))
            # the CN J-15 shown: the runner's published CN, as on the rest of the site
            for r in rows:
                for m in COMPUTED:
                    if BASE[m] == base:
                        h = self.con.execute("""SELECT cn FROM cn_history WHERE licence = ? AND method = ? AND terrain = ? AND date_iso <= ?
                                                AND cn IS NOT NULL ORDER BY date_iso DESC LIMIT 1""",
                                             (r["lic"], m, terrain, as_of.isoformat())).fetchone()
                        r["cnj15"][m] = h[0] if h else None
        return values

    # ---- FFCO's own figures for the same race, once published (to check the provisional ones) ---------------
    def ffco_figures(self, course_id: int) -> dict[str, dict]:
        """For a race published since: licence -> {method: {'score': the race's published score, 'cn': the runner's
        published CN after it}} — FFCO's own points and CN for 'official', the site's for the other methods."""
        out: dict[str, dict] = {}
        for lic, method, score, cn in self.con.execute(
                """SELECT s.licence, s.method, s.score, h.cn FROM scores s
                   LEFT JOIN cn_history h ON h.licence = s.licence AND h.method = s.method AND h.date_iso = s.date_iso
                        AND h.terrain = s.terrain
                   WHERE s.course_id = ? AND s.score IS NOT NULL""", (course_id,)):
            out.setdefault(lic, {})[method] = {"score": score, "cn": cn}
        return out
