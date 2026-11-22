"""The native apps' icons, all drawn from the Ozimut mark (site/assets/favicon.svg): a compass bezel — a ring with four
ticks — and, as its needle on a bearing of 45°, the control flag's two quarters (top-right orange, bottom-left dark).
The mark is drawn here from the same coordinates (a 32-unit box), the ring and ticks last, over the fills.

    py track/tools/make_icons.py        (Pillow; run from the repository's root)

Writes the iPhone and Apple Watch icon (one 1024 px picture, no transparency: Apple refuses an alpha channel), the
Garmin launcher icon (70 px, the mark in light ink on black, as watch faces are dark), and the Android vector drawables
(the adaptive icon's foreground and the notification's white silhouette) from the same numbers.
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


def mark(size, *, fill=0.78, bg=PAPER, ink=INK, ss=8):
    """The mark centred on a square of `size` px, its ring's outer edge `fill` of the side; drawn `ss` times larger, then
    reduced (smooth edges)."""
    big = size * ss
    img = Image.new("RGB", (big, big), bg)
    d = ImageDraw.Draw(img)
    unit = big * fill / (2 * (RING_R + RING_W / 2))          # px a mark unit
    off = big / 2 - 16 * unit
    P = lambda p: (off + p[0] * unit, off + p[1] * unit)
    d.polygon([P(p) for p in ORANGE_TRI], fill=ORANGE)
    d.polygon([P(p) for p in INK_TRI], fill=ink)
    c, r, w = P((16, 16)), RING_R * unit, RING_W * unit
    d.ellipse([c[0] - r - w / 2, c[1] - r - w / 2, c[0] + r + w / 2, c[1] + r + w / 2], outline=ink, width=round(w))
    tw = TICK_W * unit
    for a, b in TICKS:
        pa, pb = P(a), P(b)
        d.line([pa, pb], fill=ink, width=round(tw))
        for q in (pa, pb):                                       # round caps
            d.ellipse([q[0] - tw / 2, q[1] - tw / 2, q[0] + tw / 2, q[1] + tw / 2], fill=ink)
    return img.resize((size, size), Image.LANCZOS)


def android_vectors():
    """The adaptive icon's foreground (108 dp, the mark in the 66 dp safe zone) and the notification icon (24 dp, white)."""
    def tr(scale, off):
        f = lambda p: f"{off + p[0] * scale:.2f},{off + p[1] * scale:.2f}"
        return f

    s, o = 66 / 32, 54 - 16 * 66 / 32                            # 32 units → 66 dp, centred on 54
    f = tr(s, o)
    fg = f"""<?xml version="1.0" encoding="utf-8"?>
<!-- The Ozimut mark (site/assets/favicon.svg), drawn by track/tools/make_icons.py: a compass bezel, and the control flag's
     two quarters as its needle on a bearing of 45 degrees. -->
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp" android:height="108dp"
    android:viewportWidth="108" android:viewportHeight="108">
    <path android:fillColor="#E8641C" android:pathData="M{f(ORANGE_TRI[0])} L{f(ORANGE_TRI[1])} L{f(ORANGE_TRI[2])} Z" />
    <path android:fillColor="#1B1A17" android:pathData="M{f(INK_TRI[0])} L{f(INK_TRI[1])} L{f(INK_TRI[2])} Z" />
    <path android:strokeColor="#1B1A17" android:strokeWidth="{RING_W * s:.2f}" android:fillColor="#00000000"
        android:pathData="M{o + 16 * s:.2f},{o + (16 - RING_R) * s:.2f} A{RING_R * s:.2f},{RING_R * s:.2f} 0 1,1 {o + 16 * s - 0.01:.2f},{o + (16 - RING_R) * s:.2f} Z" />
    <path android:strokeColor="#1B1A17" android:strokeWidth="{TICK_W * s:.2f}" android:strokeLineCap="round"
        android:pathData="{' '.join(f'M{f(a)} L{f(b)}' for a, b in TICKS)}" />
</vector>
"""
    s2, o2 = 22 / 32, 12 - 16 * 22 / 32
    g = tr(s2, o2)
    stat = f"""<?xml version="1.0" encoding="utf-8"?>
<!-- The notification's icon: the Ozimut mark as a white silhouette (Android draws it in one colour). track/tools/make_icons.py -->
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp" android:height="24dp"
    android:viewportWidth="24" android:viewportHeight="24">
    <path android:fillColor="#FFFFFFFF" android:pathData="M{g(ORANGE_TRI[0])} L{g(ORANGE_TRI[1])} L{g(ORANGE_TRI[2])} Z M{g(INK_TRI[0])} L{g(INK_TRI[1])} L{g(INK_TRI[2])} Z" />
    <path android:strokeColor="#FFFFFFFF" android:strokeWidth="{RING_W * s2:.2f}" android:fillColor="#00000000"
        android:pathData="M{o2 + 16 * s2:.2f},{o2 + (16 - RING_R) * s2:.2f} A{RING_R * s2:.2f},{RING_R * s2:.2f} 0 1,1 {o2 + 16 * s2 - 0.01:.2f},{o2 + (16 - RING_R) * s2:.2f} Z" />
</vector>
"""
    res = ROOT / "track/android/app/src/main/res/drawable"
    (res / "ic_fg.xml").write_text(fg, encoding="utf-8", newline="\n")
    (res / "ic_stat.xml").write_text(stat, encoding="utf-8", newline="\n")


def main():
    # iPhone and Apple Watch: one 1024 px picture each platform takes (Xcode 14+ single-size icons); the watch shows it in a circle
    cat = ROOT / "track/ios/Resources/Assets.xcassets"
    (cat / "AppIcon.appiconset").mkdir(parents=True, exist_ok=True)
    mark(1024, fill=0.74).save(cat / "AppIcon.appiconset/icon-1024.png", optimize=True)
    (cat / "Contents.json").write_text('{ "info" : { "author" : "xcode", "version" : 1 } }\n', encoding="utf-8", newline="\n")
    (cat / "AppIcon.appiconset/Contents.json").write_text("""{
  "images" : [
    { "filename" : "icon-1024.png", "idiom" : "universal", "platform" : "ios", "size" : "1024x1024" },
    { "filename" : "icon-1024.png", "idiom" : "universal", "platform" : "watchos", "size" : "1024x1024" }
  ],
  "info" : { "author" : "xcode", "version" : 1 }
}
""", encoding="utf-8", newline="\n")
    # Garmin: the watches ask 54 to 70 px; one 70 px picture, scaled down by the SDK for the smaller ones
    mark(70, fill=0.86, bg=(0, 0, 0), ink=INK_DARK).save(ROOT / "track/garmin/resources/drawables/launcher_icon.png", optimize=True)
    android_vectors()
    print("icons written")


if __name__ == "__main__":
    main()
