"""FFCO's official CN in forest and sprint on any day, across its yearly rescale.

Since 2026 (Règlement des compétitions 2026) FFCO rescales the official CN every 1 January, one factor per speciality, so
that the mean of the best 20 % of the CNs is 5 600. The previous season's races then carry their points × that factor
(under new circuit ids that only each runner's CN page on FFCO's site links), and a window holding them gives the CN on the
new scale. In January 2026 FFCO also re-ran the 2025 season under the 2026 rules first (forest and sprint apart, best 10 %
and worst 40 % dropped, circuits valued on the fastest ⌈2N/3⌉), which `rerun` reproduces.

Measured on 2026-11-16 (`C:\\Kerkia\\Ozimut\\work\\rescale`: 40 runners' CN pages at 15/02/2026, 775 re-valued 2025 races):
FFCO's new points ÷ the original ones are one number within a circuit (spread ≤ 0.0003 over 55 circuits) but 0.84-0.93
across circuits; the re-run × 0.9035 in forest, × 0.9020 in sprint gives them, half within 10 points; 5 600 ÷ the best
20 % of the re-run's CNs gives 0.9011 and 0.8989. Nadejda Le Helloco's CN at 16/11/2026 (two 2025 races in her window):
3 286, FFCO's.

`OfficialScale.cn` gives the CN on a day:
- a window of the scale's own season only: FFCO's rule on its points, exact (`cn.ffco_cn`; 98 % of FFCO's values);
- a window holding the previous season's races: those races' points on the new scale (the re-run's or FFCO's own × each
  circuit's multiplier), anchored on the last value FFCO printed on that scale (its CN after a race, its CN J-15): that
  value + what the model says changed since. Held out from the fit, 73 % of FFCO's values exact and 97 % within 10 points
  in forest, 66 % and 96 % in sprint (FFCO's last value as it was, what the site showed before: 44 % and 50 %).

The factor of a year: `MEASURED` when known; else, once FFCO has printed values on the new scale (its first races of the
year), fitted on them (the median of printed ÷ computed, iterated); before that, 5 600 ÷ the best 20 % of the CNs on
31 December. A re-run year's circuits each get their own multiplier, fitted on FFCO's printed values (the re-run's error is
one number per circuit); a plain rescale keeps the factor for all.
"""
from __future__ import annotations

import math
import statistics
from bisect import bisect_right
from collections import defaultdict
from dataclasses import dataclass
from datetime import date, timedelta

from .cn import Decimal_round, ffco_cn

FIRST = 2026                    # the first rescale (RC 2026); every 1 January since
RERUN = {2026}                  # years whose previous season FFCO first re-ran under new rules
MEASURED = {2026: {"For": 0.9035, "Spr": 0.9020}}   # read on FFCO's CN pages (study of 2026-11-16)
TARGET, TOP = 5600, 0.20        # the mean of the best 20 % of the CNs made 5 600
WINDOW, LAG = 365, 15
FIT_MIN = 100                   # printed values needed to fit a year's factor
FIT_ROUNDS = 20                 # the per-circuit fit of a re-run year (Jacobi, damped)
CLAMP = 0.15                    # a circuit's multiplier within ± 15 % of the year's factor


@dataclass(frozen=True)
class Race:
    cid: int
    lic: str
    day: date
    t: str                      # "For" | "Spr"
    time_s: int | None
    ranked: bool                # a place (not PM, abandon, disqualified…)
    points: int | None          # FFCO's own


@dataclass(frozen=True)
class Printed:
    lic: str
    t: str
    day: date                   # the day the CN is of (a race's day, or 15 days before it for its CN J-15)
    scale: int                  # the race's season: its CN J-15 is on that season's scale even when it falls in December
    min_races: int              # 2 for the CN after a race, 1 for the CN J-15
    value: int


def _window(scores: list[int], min_races: int) -> int | None:
    return ffco_cn(scores, min_races) if scores else None


def rerun(races: list[Race], season: int) -> tuple[dict[tuple[int, str], float], dict[tuple[int, str], bool]]:
    """The season's points under FFCO's current rules, race by race from its 1 January, the earlier points (FFCO's) as
    they were: circuit value = mean of CN J-15 × time over the fastest ⌈2N/3⌉ ranked runners holding a CN (all three when
    three), a ranked runner's points = value ÷ time, others 0; forest and sprint apart. Unrounded points by (circuit,
    licence), and whether each race counted in the CN after it."""
    start, end = date(season, 1, 1), date(season, 12, 31)
    # each runner's races: dates, points, and whether the race counted in the CN after it (a window brought down to one
    # race keeps a CN only then, see OfficialScale._counted)
    hist: dict[tuple[str, str], tuple[list[date], list[int], list[bool]]] = defaultdict(lambda: ([], [], []))
    by_cid: dict[int, list[Race]] = defaultdict(list)

    def add(lic, t, d, p):
        ds, ps, ok = hist[(lic, t)]
        ds.append(d)
        ps.append(p)
        lo = bisect_right(ds, d - timedelta(days=WINDOW))
        w = ps[lo:]
        ok.append(len(w) >= 2 and (len(w) - 1) in OfficialScale._kept(w))

    for r in sorted(races, key=lambda r: r.day):
        if r.day < start - timedelta(days=2 * WINDOW + LAG):
            continue
        if r.day < start:
            if r.points is not None:
                add(r.lic, r.t, r.day, r.points)
        elif r.day <= end:
            by_cid[r.cid].append(r)

    def cn_at(lic, t, X):
        ds, ps, ok = hist.get((lic, t), ((), (), ()))
        lo, hi = bisect_right(ds, X - timedelta(days=WINDOW)), bisect_right(ds, X)
        if hi - lo == 1:
            return (ps[lo] or None) if ok[lo] else None
        return _window(list(ps[lo:hi]), 1)

    out: dict[tuple[int, str], float] = {}
    counted: dict[tuple[int, str], bool] = {}
    for cid in sorted(by_cid, key=lambda c: (by_cid[c][0].day, c)):
        rows = by_cid[cid]
        d = rows[0].day
        ranked = sorted((r.time_s, cn) for r in rows if r.ranked and r.time_s
                        for cn in [cn_at(r.lic, r.t, d - timedelta(days=LAG))] if cn)
        if len(ranked) < 3:
            continue
        n = 3 if len(ranked) == 3 else math.ceil(2 * len(ranked) / 3)
        val = sum(cn * s for s, cn in ranked[:n]) / n
        for r in rows:
            p = val / r.time_s if r.ranked and r.time_s else 0.0
            out[(cid, r.lic)] = p
            add(r.lic, r.t, d, Decimal_round(p))
            counted[(cid, r.lic)] = hist[(r.lic, r.t)][2][-1]
    return out, counted


class OfficialScale:
    def __init__(self, races: list[Race], printed: list[Printed], last_year: int, log=print, cached: dict | None = None):
        """`cached`: a year's factor and circuit multipliers as `saved()` gave them (the provisional results' runs reuse
        the site build's instead of fitting again)."""
        self.log = log
        self.cached = cached or {}
        self.races = sorted(races, key=lambda r: (r.day, r.cid))
        self.own = {(r.cid, r.lic): r for r in self.races}
        self.printed: dict[tuple[str, str], list[Printed]] = defaultdict(list)
        for p in sorted(printed, key=lambda p: (p.day, p.min_races)):
            self.printed[(p.lic, p.t)].append(p)
        self.after = {(p.lic, p.t, p.day): p.value for p in printed if p.min_races == 2}
        self.mult: dict[int, dict[int, float]] = {}     # year -> circuit -> multiplier of its races' points
        self.factor: dict[int, dict[str, float]] = {}
        self.pts: dict[int, dict] = {}                  # year -> (lic, t) -> (dates, points on that year's scale, old?)
        self.base: dict[int, dict[tuple[int, str], float]] = {}
        self.base_counted: dict[int, dict[tuple[int, str], bool]] = {}
        self._memo: dict = {}
        for S in range(FIRST, last_year + 1):
            self._year(S)

    # -- the points of every race on a year's scale ------------------------------------------------------------------
    def _base(self, S: int, r: Race) -> float | None:
        """A race before S on S-1's scale (unrounded for a re-run season), before S's multiplier."""
        if S in RERUN and r.day.year == S - 1:
            return self.base[S].get((r.cid, r.lic))
        if S - 1 >= FIRST:
            return self._on(S - 1, r)
        return r.points

    def _on(self, S: int, r: Race) -> int | None:
        if r.day.year >= S:
            return r.points
        b = self._base(S, r)
        if b is None:
            return None
        m = self.mult[S].get(r.cid, self.factor[S][r.t])
        return Decimal_round(b * m)

    def _arrays(self, S: int):
        lo = date(S - 2, 12, 1)
        out = defaultdict(lambda: ([], [], [], []))   # (lic, t) -> dates, points, before S?, circuits
        for r in self.races:
            if r.day < lo or r.day.year > S:
                continue
            p = self._on(S, r)
            if p is None:
                continue
            a = out[(r.lic, r.t)]
            a[0].append(r.day)
            a[1].append(p)
            a[2].append(r.day.year < S)
            a[3].append(r.cid)
        return out

    def _win(self, S, lic, t, X):
        ds, ps, old, _ = self.pts[S].get((lic, t), ((), (), (), ()))
        lo, hi = bisect_right(ds, X - timedelta(days=WINDOW)), bisect_right(ds, X)
        return lo, hi, ds, ps, old

    # -- a year's factor and multipliers ------------------------------------------------------------------------------
    def _year(self, S: int):
        if S in RERUN:
            self.base[S], self.base_counted[S] = rerun(self.races, S - 1)
            self.log(f"official scale {S}: {S - 1} re-run, {len(self.base[S]):,} results")
        self.mult[S] = {}
        obs = [p for v in self.printed.values() for p in v if p.scale == S]
        f = MEASURED.get(S)
        how = "measured"
        c = self.cached.get(str(S))
        if c:
            self.factor[S] = dict(c["factor"])
            self.mult[S] = {int(k): v for k, v in c.get("mult", {}).items()}
            self.pts[S] = self._arrays(S)
            return
        if f is None:
            self.factor[S] = self._rule(S)
            how = "the rule"
            if len([p for p in obs if p.day.year == S]) >= FIT_MIN:
                self.factor[S] = self._fit_factor(S, obs)
                how = "fitted on FFCO's printed values"
        else:
            self.factor[S] = dict(f)
        if S in RERUN and obs:
            self._fit_circuits(S, obs)
        self.pts[S] = self._arrays(S)
        self.log(f"official scale {S}: factor " + ", ".join(f"{t} {v:.4f}" for t, v in sorted(self.factor[S].items()))
                 + f" ({how}), {len(self.mult[S]):,} circuits fitted")

    def _rule(self, S: int) -> dict[str, float]:
        """5 600 ÷ the mean of the best 20 % of the CNs (two races) on 31 December, on the previous scale."""
        X = date(S - 1, 12, 31)
        win = defaultdict(list)
        for r in self.races:
            if X - timedelta(days=WINDOW) < r.day <= X:
                b = self._base(S, r)
                if b is not None:
                    win[(r.lic, r.t)].append(Decimal_round(b))
        out = {}
        for t in ("For", "Spr"):
            cns = sorted((c for (lic, tt), v in win.items() if tt == t for c in [_window(v, 2)] if c), reverse=True)
            k = max(1, Decimal_round(TOP * len(cns)))
            out[t] = TARGET / (sum(cns[:k]) / k) if cns else 1.0
        return out

    def _entries(self, S: int, obs: list[Printed]):
        """Each printed value's window: [(FFCO's points or None, circuit, base)], the values it must give."""
        races = defaultdict(list)
        lo = date(S - 2, 12, 1)
        for r in self.races:
            if lo <= r.day and r.day.year <= S:
                races[(r.lic, r.t)].append(r)
        out = []
        for p in obs:
            w = []
            for r in races.get((p.lic, p.t), ()):
                if p.day - timedelta(days=WINDOW) < r.day <= p.day:
                    if r.day.year >= S:
                        if r.points is not None:
                            w.append((r.points, None, 0.0, r.t))
                    else:
                        b = self._base(S, r)
                        if b is not None:
                            w.append((None, r.cid, b, r.t))
            if any(e[0] is None for e in w) and len(w) >= p.min_races:
                out.append((w, p))
        return out

    @staticmethod
    def _kept(pts: list[int]) -> list[int]:
        n = len(pts)
        order = sorted(range(n), key=lambda i: -pts[i])
        nb, nw = Decimal_round(0.10 * n), Decimal_round(0.40 * n)
        kept = order[nb: n - nw] or [order[n // 2]]
        return [i for i in kept if pts[i]] or kept

    def _fit_factor(self, S: int, obs: list[Printed]) -> dict[str, float]:
        f = self._rule(S)
        ent = self._entries(S, obs)
        for _ in range(5):
            ratios = defaultdict(list)
            for w, p in ent:
                pts = [e[0] if e[0] is not None else Decimal_round(e[2] * f[e[3]]) for e in w]
                v = _window(pts, p.min_races)
                if v:
                    ratios[p.t].append(p.value / v)
            for t, v in ratios.items():
                f[t] *= statistics.median(v)
        return f

    def _fit_circuits(self, S: int, obs: list[Printed]):
        """One multiplier per circuit of the re-run season, so that the windows give FFCO's printed values: the gap of
        each printed value spread over the circuits it keeps, in proportion to their points (Jacobi, damped)."""
        f = self.factor[S]
        m = self.mult[S]
        ent = self._entries(S, obs)
        ct = {e[1]: e[3] for w, _ in ent for e in w if e[0] is None}
        for cid, t in ct.items():
            m.setdefault(cid, f[t])
        for _ in range(FIT_ROUNDS):
            num, den = defaultdict(float), defaultdict(float)
            for w, p in ent:
                pts = [e[0] if e[0] is not None else Decimal_round(e[2] * m[e[1]]) for e in w]
                kept = self._kept(pts)
                free = [w[i] for i in kept if w[i][0] is None]
                sb = sum(e[2] for e in free)
                if not sb:
                    continue
                dm = (len(kept) * p.value - sum(pts[i] for i in kept)) / sb
                for e in free:
                    num[e[1]] += dm * e[2]
                    den[e[1]] += e[2]
            for cid, v in num.items():
                t = ct[cid]
                m[cid] = min(f[t] * (1 + CLAMP), max(f[t] * (1 - CLAMP), m[cid] + 0.8 * v / den[cid]))

    def saved(self) -> dict:
        """Each year's factor and circuit multipliers (snap/official_scale.json, read back as `cached`)."""
        return {str(S): {"factor": {t: round(v, 6) for t, v in sorted(self.factor[S].items())},
                         "mult": {str(c): round(m, 6) for c, m in sorted(self.mult[S].items())}} for S in sorted(self.factor)}

    # -- the CN on a day ---------------------------------------------------------------------------------------------
    def model(self, lic: str, t: str, X: date, min_races: int = 2, scale: int | None = None) -> int | None:
        """The CN computed from the points alone (no anchor)."""
        S = scale or X.year
        key = (lic, t, X, min_races, S)
        if key in self._memo:
            return self._memo[key]
        lo, hi, ds, ps, old = self._win(S, lic, t, X)
        if hi - lo == 1:        # the CN J-15 too: FFCO prints none for a lone race that did not count (2026-11-16)
            v = (ps[lo] or None) if self._counted(lic, t, ds[lo], S) else None
        else:
            v = _window(list(ps[lo:hi]), min_races)
        self._memo[key] = v
        return v

    def _counted(self, lic, t, d1: date, S: int) -> bool:
        """A window brought down to one race keeps a CN - that race's points - only if the race counted in the CN FFCO
        computed after it, not among the best 10 % or the worst 40 % dropped (measured 2026-10-26): its own points not
        below the CN FFCO printed after it, else ranked within that day's window; a race of a re-run season as the
        re-run says. FFCO prints no CN J-15 either for such a window (2026-11-16)."""
        if d1.year < FIRST:
            cids = [c for d, c in zip(self.pts[S][(lic, t)][0], self.pts[S][(lic, t)][3]) if d == d1]
            return any(self.base_counted.get(d1.year + 1, {}).get((c, lic)) for c in cids)
        lo, hi, ds, ps, old = self._win(d1.year, lic, t, d1)
        idx = [i for i in range(lo, hi) if ds[i] == d1]
        if not idx or hi - lo == 1:
            return False
        a = self.after.get((lic, t, d1))
        if a is None:
            return False
        if a <= ps[idx[-1]]:
            return True
        kept = self._kept(list(ps[lo:hi]))
        return any(lo + i in idx for i in kept)

    def cn(self, lic: str, t: str, X: date, min_races: int = 2, scale: int | None = None,
           strictly_before: bool = False) -> int | None:
        """FFCO's CN on day X on the given season's scale (X's season by default; a race's CN J-15 is on the race's)."""
        S = scale or X.year
        lo, hi, ds, ps, old = self._win(S, lic, t, X)
        if not any(old[lo:hi]):
            return self.model(lic, t, X, min_races, S)
        v = self.model(lic, t, X, min_races, S)
        if v is None:
            return None
        anchor = None
        for p in reversed(self.printed.get((lic, t), ())):
            if p.scale == S and (p.day < X if strictly_before else p.day <= X):
                anchor = p
                break
        if anchor is None:
            return v
        a = self.model(lic, t, anchor.day, anchor.min_races, S)
        return anchor.value + v - a if a else v

    def cn_after(self, lic: str, t: str, d: date, score: int, skip: set[int] = frozenset()) -> int | None:
        """The CN after a race of day d not in FFCO's results yet (its points `score`), on d's season's scale: the window
        with it, anchored as `cn` (the circuits in `skip`: FFCO's own copy of that race, left out)."""
        S = d.year
        lo, hi, ds, ps, old = self._win(S, lic, t, d)
        cids = self.pts[S].get((lic, t), ((), (), (), ()))[3]
        keep = [i for i in range(lo, hi) if cids[i] not in skip]
        v = _window([ps[i] for i in keep] + [score], 2)
        if v is None or not any(old[i] for i in keep):
            return v
        anchor = next((p for p in reversed(self.printed.get((lic, t), ())) if p.scale == S and p.day < d), None)
        if anchor is None:
            return v
        a = self.model(lic, t, anchor.day, anchor.min_races, S)
        return anchor.value + v - a if a else v

    def check(self) -> dict[tuple[str, str], list[int]]:
        """Every value FFCO printed on a rescaled season, computed without it (the anchor strictly before): (speciality,
        « season » | « previous ») -> [values, exact, within 10]."""
        out = defaultdict(lambda: [0, 0, 0])
        for v in self.printed.values():
            for p in v:
                lo, hi, ds, ps, old = self._win(p.scale, p.lic, p.t, p.day)
                if hi == lo:
                    continue
                c = self.cn(p.lic, p.t, p.day, p.min_races, p.scale, strictly_before=True)
                k = out[(p.t, "previous" if any(old[lo:hi]) else "season")]
                k[0] += 1
                k[1] += c == p.value
                k[2] += c is not None and abs(c - p.value) <= 10
        return out


def from_db(con, last_year: int, log=print, cached: dict | None = None) -> OfficialScale:
    """The scale from the database alone (FFCO's results and printed CNs of forest and sprint, from three seasons back)."""
    races, printed = [], []
    t_of = {"Forêt": "For", "Sprint": "Spr"}
    for cid, lic, d, ter, place, temps_s, points, j15, after in con.execute(
            """SELECT s.circuit_id, s.licence, s.date_iso, s.terrain, r.place, s.temps_s, s.score, r.cn_j15, r.nouveau_cn
               FROM scores s JOIN results r ON r.circuit_id = s.circuit_id AND r.licence = s.licence
               WHERE s.method = 'official' AND s.terrain IN ('Forêt', 'Sprint') AND s.date_iso >= ?""",
            (f"{FIRST - 3}-01-01",)):
        place = str(place or "").strip()
        if not lic or place.lower() == "nc":
            continue
        day, t = date.fromisoformat(d), t_of[ter]
        races.append(Race(cid, lic, day, t, temps_s, place.isdigit(), points))
        if day.year >= FIRST:
            for X, v, mr in ((day - timedelta(days=LAG), j15, 1), (day, after, 2)):
                try:
                    v = int(str(v).replace("+", "").strip())
                except (TypeError, ValueError):
                    continue
                if v:
                    printed.append(Printed(lic, t, X, day.year, mr, v))
    return OfficialScale(races, printed, last_year, log, cached)
