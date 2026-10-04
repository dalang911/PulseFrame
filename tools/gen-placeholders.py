#!/usr/bin/env python3
"""Generate the placeholder assets that ship with this repository.

The production deployment uses personal photographs as background presets and
real watch exports as demo data. Neither may be published, so the repository
ships generated substitutes instead:

    bg/169.jpg, bg/1692.jpg, bg/1693.jpg   1920x1080 gradient plates
    bg/916.jpg                             1080x1920 gradient plate
    samples/demo-run.gpx                   synthetic ~10 km run, no real location

Usage:

    python3 tools/gen-placeholders.py        # needs Pillow

Everything is deterministic (fixed seeds), so re-running produces the same files.
Edit PALETTES / the point count below to re-brand the presets.
"""
import math
import os
import random

from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BG = os.path.join(ROOT, 'bg')
SAMPLES = os.path.join(ROOT, 'samples')

PALETTES = [
    ((22, 34, 58), (52, 96, 140), (12, 18, 30)),    # night blue
    ((40, 26, 56), (104, 52, 86), (16, 12, 22)),    # dusk plum
    ((18, 48, 44), (46, 112, 96), (10, 22, 22)),    # forest teal
]


def plate(path, size, palette, streaks):
    w, h = size
    (r1, g1, b1), (r2, g2, b2), (r3, g3, b3) = palette
    # vertical blend top -> mid -> bottom, built as a 1px wide column then scaled
    column = Image.new('RGB', (1, h))
    cpx = column.load()
    for y in range(h):
        t = y / max(1, h - 1)
        if t < 0.55:
            k = t / 0.55
            col = (int(r1 + (r2 - r1) * k), int(g1 + (g2 - g1) * k), int(b1 + (b2 - b1) * k))
        else:
            k = (t - 0.55) / 0.45
            col = (int(r2 + (r3 - r2) * k), int(g2 + (g3 - g2) * k), int(b2 + (b3 - b2) * k))
        cpx[0, y] = col
    img = column.resize((w, h), Image.BILINEAR)

    draw = ImageDraw.Draw(img, 'RGBA')
    # soft light bands, like a blurred stadium / road shot
    for cx, cy, rx, ry, alpha in streaks:
        draw.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=(255, 255, 255, alpha))
    img = img.filter(ImageFilter.GaussianBlur(max(w, h) // 28))

    # gentle vignette so overlaid gauges stay readable without going black
    vig = Image.new('L', (w, h), 0)
    vd = ImageDraw.Draw(vig)
    vd.ellipse([-w * 0.3, -h * 0.3, w * 1.3, h * 1.3], fill=70)
    vig = vig.filter(ImageFilter.GaussianBlur(min(w, h) // 5))
    dark = Image.new('RGB', (w, h), (0, 0, 0))
    img = Image.composite(dark, img, vig.point(lambda v: int((255 - v) * 0.22)))

    img.save(path, 'JPEG', quality=82, optimize=True, progressive=True)
    print('wrote', os.path.relpath(path, ROOT), img.size)


def streaks_for(w, h, seed):
    rnd = random.Random(seed)
    out = []
    for _ in range(7):
        out.append((rnd.randint(0, w), rnd.randint(int(h * 0.15), int(h * 0.85)),
                    rnd.randint(w // 8, w // 2), rnd.randint(h // 40, h // 10),
                    rnd.randint(14, 34)))
    return out


def demo_gpx(path, minutes=60, stride=3):
    """A closed-ish loop with a plausible heart-rate curve.

    60 minutes at ~10 km/h sampled every 3 s -> 1200 points, about 10 km. The
    start coordinate is an arbitrary city centre and the heading drift is a sine
    wave, so nothing here corresponds to a route anybody actually ran.
    """
    rnd = random.Random(20260929)
    lat, lon, ele = 47.6062, -122.3321, 40.0     # arbitrary, not a real route
    pts = minutes * 60 // stride
    rows = []
    secs = 0
    for i in range(pts):
        heading = math.radians(20 + 320 * math.sin(math.pi * i / pts))
        step = 8.4 + rnd.uniform(-0.6, 0.6)      # metres per stride interval
        lat += step * math.cos(heading) / 111320.0
        lon += step * math.sin(heading) / (111320.0 * math.cos(math.radians(lat)))
        ele = 40 + 18 * math.sin(2 * math.pi * i / pts) + rnd.uniform(-0.4, 0.4)
        hr = 148 + int(14 * math.sin(2 * math.pi * i / (pts / 2))) + rnd.randint(-3, 3)
        rows.append((secs, round(lat, 6), round(lon, 6), round(ele, 1), hr))
        secs += stride

    # gpxtpx is declared on the root element because GPXParser.js looks the
    # extension up with a qualified selector; a nested xmlns would not resolve.
    out = ['<?xml version="1.0" encoding="UTF-8"?>',
           '<gpx version="1.1" creator="PulseFrame demo"'
           ' xmlns="http://www.topografix.com/GPX/1/1"'
           ' xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">',
           '  <metadata><name>Demo run (synthetic)</name><time>2026-01-01T08:00:00Z</time></metadata>',
           '  <trk><name>Demo run</name><type>running</type><trkseg>']
    for secs, la, lo, el, hr in rows:
        hh, mm, ss = secs // 3600, (secs % 3600) // 60, secs % 60
        stamp = '2026-01-01T%02d:%02d:%02dZ' % (8 + hh, mm, ss)
        out.append('    <trkpt lat="%s" lon="%s"><ele>%s</ele><time>%s</time>'
                   '<extensions><gpxtpx:TrackPointExtension>'
                   '<gpxtpx:hr>%d</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions></trkpt>'
                   % (la, lo, el, stamp, hr))
    out += ['  </trkseg></trk>', '</gpx>']
    with open(path, 'w', encoding='utf-8') as fh:
        fh.write('\n'.join(out) + '\n')
    km = 8.4 * len(rows) / 1000.0
    print('wrote %s  %d points, %.2f km' % (os.path.relpath(path, ROOT), len(rows), km))


if __name__ == '__main__':
    os.makedirs(BG, exist_ok=True)
    os.makedirs(SAMPLES, exist_ok=True)

    plate(os.path.join(BG, '169.jpg'), (1920, 1080), PALETTES[0], streaks_for(1920, 1080, 11))
    plate(os.path.join(BG, '1692.jpg'), (1920, 1080), PALETTES[1], streaks_for(1920, 1080, 22))
    plate(os.path.join(BG, '1693.jpg'), (1920, 1080), PALETTES[2], streaks_for(1920, 1080, 33))
    plate(os.path.join(BG, '916.jpg'), (1080, 1920), PALETTES[0], streaks_for(1080, 1920, 44))

    demo_gpx(os.path.join(SAMPLES, 'demo-run.gpx'))
