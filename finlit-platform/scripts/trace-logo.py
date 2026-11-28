#!/usr/bin/env python3
"""Traces the FinLit Ventures logo (scripts/assets/finlit-ventures-logo-source.webp, the team's artwork from task #400) into vector shapes
(frontend/src/components/logoPaths.ts), so the logo is crisp at any size and its parts (stairs, person, letters, bars, arrow) can be animated one by one
(components/LogoLoader.tsx, styles/logo-loader.css). Needs: pip install potracer numpy pillow scipy. Run it from finlit-platform/.

The wordmark on the green panel is traced, and since the owner's note of 28 Nov 2026 ("below FinLit there is also written VENTURES ... strictly change
this logo to every place") also the "VENTURES" line under it with its two gold rules (LOGO_VENTURES, LOGO_VRULES); the viewBox takes in both. The picture is split by colour into gold (stairs with
the L and the shelf under the bars, the i of "Lit", the t), green (bars, arrow) and light (F, n, the person and his head, the first steps); every connected
piece is traced on its own and named by where it sits, so a re-export of the artwork keeps the names. The two round dots (the person's head and the dot
of the i) are drawn as exact circles. Coordinates are the artwork's, halved (about 820 units wide).
"""
import json
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
import potrace

SRC = "scripts/assets/finlit-ventures-logo-source.webp"
OUT = "frontend/src/components/logoPaths.ts"
CROP = (120, 470, 1800, 1300)   # x0, y0, x1, y1 of the wordmark in the 1920 x 1920 artwork (VENTURES starts below y 1340)
K = 0.5                         # artwork pixels to logo units

a = np.array(Image.open(SRC).convert("RGB").crop(CROP)).astype(float) / 255
r, g, b = a[..., 0], a[..., 1], a[..., 2]
mx, mn = a.max(2), a.min(2)
sat = (mx - mn) / (mx + 1e-6)
masks = {"gold": (r > g) & (g > b) & (sat > 0.35) & (mx > 0.45), "green": (g > r) & (g >= b * 0.9) & (sat > 0.35) & (mx > 0.3), "light": (sat < 0.2) & (mx > 0.6)}
OX, OY = CROP[0], CROP[1]


def pieces(name, min_px=1500):
    """The connected pieces of a colour layer, biggest first: [(mask, (y0, y1, x0, x1)), ...]."""
    lab, n = ndi.label(masks[name], structure=np.ones((3, 3)))
    out = []
    for i, sl in enumerate(ndi.find_objects(lab), start=1):
        m = lab == i
        if m.sum() >= min_px: out.append((m, (sl[0].start, sl[0].stop, sl[1].start, sl[1].stop)))
    return out


def trace(mask, bbox, pad=6, origin=None):
    OX, OY = origin or (CROP[0], CROP[1])
    y0, y1, x0, x1 = bbox
    y0, x0, y1, x1 = max(0, y0 - pad), max(0, x0 - pad), min(mask.shape[0], y1 + pad), min(mask.shape[1], x1 + pad)
    plist = potrace.Bitmap(~mask[y0:y1, x0:x1]).trace(turdsize=20, turnpolicy=potrace.POTRACE_TURNPOLICY_MINORITY, alphamax=1.0, opticurve=True, opttolerance=0.4)
    f = lambda p: f"{(p.x + x0 + OX) * K:.1f} {(p.y + y0 + OY) * K:.1f}"
    d = []
    for c in plist:
        d.append("M" + f(c.start_point))
        for s in c.segments:
            d.append(("L" + f(s.c) + " L" + f(s.end_point)) if s.is_corner else ("C" + f(s.c1) + " " + f(s.c2) + " " + f(s.end_point)))
        d.append("Z")
    return "".join(d)


def circle(bbox):
    y0, y1, x0, x1 = bbox
    return {"cx": round((x0 + x1) / 2 * K + OX * K, 1), "cy": round((y0 + y1) / 2 * K + OY * K, 1), "r": round(((x1 - x0) + (y1 - y0)) / 4 * K, 1)}


def area(p): return (p[1][1] - p[1][0]) * (p[1][3] - p[1][2])


gold, green, light = pieces("gold"), pieces("green"), pieces("light")
assert len(gold) == 4 and len(green) == 4 and len(light) == 5, (len(gold), len(green), len(light))
# gold: the stairs + L + shelf is the widest; of the rest, the round one is the dot of the i, the tall thin one its stem, the right-most the t
stairs = max(gold, key=lambda p: p[1][3] - p[1][2])
rest = [p for p in gold if p is not stairs]
t = max(rest, key=lambda p: p[1][2])
rest = [p for p in rest if p is not t]
idot = min(rest, key=lambda p: p[1][1] - p[1][0])
istem = max(rest, key=lambda p: p[1][1] - p[1][0])
# green: the arrow is the widest; the bars from left to right
arrow = max(green, key=lambda p: p[1][3] - p[1][2])
bars = sorted([p for p in green if p is not arrow], key=lambda p: p[1][2])
# light: from left to right F, the white steps (lowest), the person, his head (smallest), n
head = min(light, key=area)
steps = max(light, key=lambda p: p[1][1])
rest = sorted([p for p in light if p is not head and p is not steps], key=lambda p: p[1][2])
F, person, n = rest

parts = {"stairsL_gold": trace(*stairs), "t": trace(*t), "istem": trace(*istem),
         "F": trace(*F), "n": trace(*n), "person": trace(*person), "stairL_white": trace(*steps),
         "arrow": trace(*arrow), "bar1": trace(*bars[0]), "bar2": trace(*bars[1]), "bar3": trace(*bars[2]),
         "head": circle(head[1]), "idot": circle(idot[1])}
# the "VENTURES" line under the panel: white letters and, either side, a gold rule
VCROP = (120, 1340, 1800, 1490)
v = np.array(Image.open(SRC).convert("RGB").crop(VCROP)).astype(float) / 255
vmx, vmn = v.max(2), v.min(2)
vsat = (vmx - vmn) / (vmx + 1e-6)
vgold = (v[..., 0] > v[..., 1]) & (v[..., 1] > v[..., 2]) & (vsat > 0.35) & (vmx > 0.45)
vlight = (vsat < 0.2) & (vmx > 0.6)
whole = lambda m: (0, m.shape[0], 0, m.shape[1])
parts["ventures"] = trace(vlight, whole(vlight), pad=0, origin=VCROP[:2])
parts["vrules"] = trace(vgold, whole(vgold), pad=0, origin=VCROP[:2])
vy, vx = np.where(vlight | vgold)

ys = [v + OY for p in gold + green + light for v in (p[1][0], p[1][1])] + [vy.min() + VCROP[1], vy.max() + VCROP[1]]
xs = [v + OX for p in gold + green + light for v in (p[1][2], p[1][3])] + [vx.min() + VCROP[0], vx.max() + VCROP[0]]
# the logo's own frame (owner, 28 Nov 2026: the logo exactly as given, same proportions): the dark green panel, and under it the black band that
# holds VENTURES, as tall below VENTURES as the gap above it. Measured on the 1920 x 1920 artwork.
PANEL = (102, 412, 1818, 1319)
FRAME = (101, 412, 1820, 1506)
assert min(xs) >= FRAME[0] and max(xs) <= FRAME[2] and min(ys) >= FRAME[1] and max(ys) <= FRAME[3]
parts["panel"] = {"x": PANEL[0] * K, "y": PANEL[1] * K, "w": (PANEL[2] - PANEL[0]) * K, "h": (PANEL[3] - PANEL[1]) * K}
vb = [FRAME[0] * K, FRAME[1] * K, (FRAME[2] - FRAME[0]) * K, (FRAME[3] - FRAME[1]) * K]
vb = [int(x) if float(x).is_integer() else x for x in vb]
vbs = " ".join(map(str, vb))
ts = f"// GENERATED by scripts/trace-logo.py from scripts/assets/finlit-ventures-logo-source.webp: the FinLit Ventures logo as vector shapes (viewBox {vbs}). Do not edit by hand.\n"
ts += f'export const LOGO_VIEWBOX = "{vbs}";\n'
for k, v in parts.items():
    ts += f"export const LOGO_{k.upper()} = {json.dumps(v)};\n"
open(OUT, "w").write(ts)
print("wrote", OUT, len(ts), "bytes; viewBox", vbs)
