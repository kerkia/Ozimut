"""Draw the field's launcher icon (40 x 40 PNG): a compass ring with the control flag's orange quarter.

Run from track/garmin:  python tools/make_icon.py
"""
import struct
import zlib

W = H = 40
ORANGE = (232, 93, 4)


def pixel(x, y):
    dx, dy = x - 19.5, y - 19.5
    d = (dx * dx + dy * dy) ** 0.5
    if 13 <= d <= 17:
        return ORANGE
    if d < 13:
        return ORANGE if x > y else (255, 255, 255)
    return (0, 0, 0)


def chunk(tag, data):
    return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data))


raw = b"".join(b"\x00" + b"".join(bytes(pixel(x, y)) for x in range(W)) for y in range(H))
png = (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", W, H, 8, 2, 0, 0, 0))
       + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b""))
with open("resources/drawables/launcher_icon.png", "wb") as f:
    f.write(png)
