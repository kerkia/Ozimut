"""The Garmin data field's launcher icon, drawn from the Ozimut mark (site/assets/favicon.svg): a compass bezel — a ring
with four ticks — and, as its needle on a bearing of 45°, the control flag's two quarters (top-right orange, bottom-left).
The mark is drawn here from the same coordinates (a 32-unit box), the ring and ticks last, over the fills.

    py track/tools/make_icons.py        (Pillow; run from the repository's root)

Writes the Garmin launcher icon (70 px, the mark in light ink on black, as watch faces are dark) and the Ozimut app's
iPhone icon (app/ios, 1024 px on white): the companion app's ring and ticks are orange, so that its icon is told from the
installed web app's (black ring) on one home screen (owner, 2026-11-28); its Android icon is the vector app/android's
drawable/ic_fg.xml, kept to the same colours by hand. The Folloz apps' icons,
from the same numbers, are drawn by the Folloz repository's own tools/make_icons.py (https://github.com/kerkia/Folloz).
"""
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
ORANGE = (232, 100, 28)          # #e8641c, the control flag's orange
INK = (27, 26, 23)               # #1b1a17, the site's text colour
INK_DARK = (244, 242, 236)       # #f4f2ec, the text colour of the dark themes
PAPER = (255, 255, 255)

# the mark in its 32-unit box (favicon.svg)
ORANGE_TRI = [(16, 8), (24, 16), (16, 16)]
INK_TRI = [(8, 16), (16, 24), (16, 16)]
RING_R, RING_W = 13.7, 1.9
TICKS = [((16, 3.4), (16, 5.6)), ((28.6, 16), (26.4, 16)), ((16, 28.6), (16, 26.4)), ((3.4, 16), (5.6, 16))]
TICK_W = 2.0


def mark(size, *, fill=0.78, bg=PAPER, ink=INK, ring=None, ss=8):
    """The mark centred on a square of `size` px, its ring's outer edge `fill` of the side; drawn `ss` times larger, then
    reduced (smooth edges). `ring` colours the ring and its ticks (else `ink`)."""
    ring = ring or ink
    big = size * ss
    img = Image.new("RGB", (big, big), bg)
    d = ImageDraw.Draw(img)
    unit = big * fill / (2 * (RING_R + RING_W / 2))          # px a mark unit
    off = big / 2 - 16 * unit
    P = lambda p: (off + p[0] * unit, off + p[1] * unit)
    d.polygon([P(p) for p in ORANGE_TRI], fill=ORANGE)
    d.polygon([P(p) for p in INK_TRI], fill=ink)
    c, r, w = P((16, 16)), RING_R * unit, RING_W * unit
    d.ellipse([c[0] - r - w / 2, c[1] - r - w / 2, c[0] + r + w / 2, c[1] + r + w / 2], outline=ring, width=round(w))
    tw = TICK_W * unit
    for a, b in TICKS:
        pa, pb = P(a), P(b)
        d.line([pa, pb], fill=ring, width=round(tw))
        for q in (pa, pb):                                       # round caps
            d.ellipse([q[0] - tw / 2, q[1] - tw / 2, q[0] + tw / 2, q[1] + tw / 2], fill=ring)
    return img.resize((size, size), Image.LANCZOS)


def main():
    # Garmin: the watches ask 54 to 70 px; one 70 px picture, scaled down by the SDK for the smaller ones
    mark(70, fill=0.86, bg=(0, 0, 0), ink=INK_DARK).save(ROOT / "track/garmin/resources/drawables/launcher_icon.png", optimize=True)
    # the Ozimut app (companion to the site): iPhone's 1024 px, no alpha
    mark(1024, fill=0.74, ring=ORANGE).save(ROOT / "app/ios/Resources/Assets.xcassets/AppIcon.appiconset/icon-1024.png",
                                            optimize=True)
    print("icons written")


if __name__ == "__main__":
    main()
