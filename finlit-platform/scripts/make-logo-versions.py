"""The FinLit Ventures logo with NO background, in two versions (owner, 28 Nov 2026: "logo that is without background ... whenever the website is in the dark
mode, Fin will be in the white; in the bright mode Fin should be in the black; the L and everything remains same, and VENTURES also white and black"):
  scripts/assets/finlit-ventures-logo-light.png  for the light site: Fin, the walking person, the first steps and VENTURES in black
  scripts/assets/finlit-ventures-logo-dark.png   for the dark site:  the same in white
The gold (L, stairs, i, t, the two rules) and the teal (bars, arrow) are the artwork's own in both. Made from the team's artwork
(scripts/assets/finlit-ventures-logo-2000.webp): the black and dark green background is removed pixel by pixel (edges keep their soft alpha), then cropped
to the logo with a small transparent margin. Run from finlit-platform/: python3 scripts/make-logo-versions.py"""
import numpy as np
from PIL import Image

SRC = "scripts/assets/finlit-ventures-logo-2000.webp"
a = np.asarray(Image.open(SRC).convert("RGB")).astype(float)
H, W, _ = a.shape
# the two backgrounds: black around the panel, dark green inside it (x 106-1892, y 429-1373 on the 2000 px artwork)
bg = np.zeros_like(a)
panel = np.zeros((H, W), bool); panel[429:1374, 106:1893] = True
bg[panel] = (0, 19, 6)
d = np.sqrt(((a - bg) ** 2).sum(2))
alpha = np.clip((d - 14) / 70, 0, 1)                         # background noise under 14 stays clear; full colour from about 84 away
safe = np.maximum(alpha, 1e-3)[..., None]
fg = np.clip(bg + (a - bg) / safe, 0, 255)                     # the colour before it was blended onto the background
mx, mn = fg.max(2), fg.min(2)
light_part = (mx - mn) / np.maximum(mx, 1) < 0.25               # white and grey: Fin, the person, the first steps, VENTURES
ys, xs = np.where(alpha > 0.5)
pad = 24
box = (max(0, xs.min() - pad), max(0, ys.min() - pad), min(W, xs.max() + pad + 1), min(H, ys.max() + pad + 1))
for name, ink in (("dark", 255), ("light", 0)):
    rgb = fg.copy()
    rgb[light_part] = ink
    out = np.dstack([rgb, alpha * 255]).astype(np.uint8)
    Image.fromarray(out, "RGBA").crop(box).save(f"scripts/assets/finlit-ventures-logo-{name}.png", optimize=True)
print("box", box, "size", box[2] - box[0], "x", box[3] - box[1])
