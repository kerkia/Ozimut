"""WGS 84 <-> Lambert 93 for the town tools, pyproj's when it loads, else the same formulas in numpy (2026-11-14: Windows' Smart
App Control refused one of pyproj's DLLs on the PC, and every town tool stopped). RGF93 and WGS 84 differ by a few centimetres.

    tr = transformer(4326, 2154)      # always_xy: tr.transform(lon, lat) -> (x, y); arrays or numbers
"""
import math

import numpy as np

A = 6378137.0
F = 1 / 298.257222101
E2 = F * (2 - F)
E = math.sqrt(E2)
LON0, FE, FN = 3.0, 700000.0, 6600000.0


def _m(p):
    return np.cos(p) / np.sqrt(1 - E2 * np.sin(p) ** 2)


def _t(p):
    return np.tan(np.pi / 4 - p / 2) / ((1 - E * np.sin(p)) / (1 + E * np.sin(p))) ** (E / 2)


_P1, _P2, _P0 = (math.radians(v) for v in (44.0, 49.0, 46.5))
N = math.log(_m(_P1) / _m(_P2)) / math.log(_t(_P1) / _t(_P2))
_FC = _m(_P1) / (N * _t(_P1) ** N)
_RHO0 = A * _FC * _t(_P0) ** N


def _fwd(lon, lat):
    lon, lat = np.asarray(lon, float), np.asarray(lat, float)
    rho = A * _FC * _t(np.radians(lat)) ** N
    th = N * np.radians(lon - LON0)
    x, y = FE + rho * np.sin(th), FN + _RHO0 - rho * np.cos(th)
    return (float(x), float(y)) if x.ndim == 0 else (x, y)


def _inv(x, y):
    x, y = np.asarray(x, float), np.asarray(y, float)
    dx, dy = x - FE, _RHO0 - (y - FN)
    rho = np.copysign(np.hypot(dx, dy), N)
    tt = (rho / (A * _FC)) ** (1 / N)
    lam = np.arctan2(dx, dy) / N + math.radians(LON0)
    phi = np.pi / 2 - 2 * np.arctan(tt)
    for _ in range(8):
        phi = np.pi / 2 - 2 * np.arctan(tt * ((1 - E * np.sin(phi)) / (1 + E * np.sin(phi))) ** (E / 2))
    lon, lat = np.degrees(lam), np.degrees(phi)
    return (float(lon), float(lat)) if lon.ndim == 0 else (lon, lat)


class _Tr:
    def __init__(self, f):
        self.transform = f


def transformer(src, dst):
    """A transformer with pyproj's always_xy transform(); pyproj's own when it can be loaded."""
    try:
        import pyproj
        return pyproj.Transformer.from_crs(src, dst, always_xy=True)
    except (ImportError, OSError):
        pass
    if (int(src), int(dst)) == (4326, 2154):
        return _Tr(_fwd)
    if (int(src), int(dst)) == (2154, 4326):
        return _Tr(_inv)
    raise RuntimeError(f"pyproj could not be loaded, and EPSG:{src} -> EPSG:{dst} has no fallback")
