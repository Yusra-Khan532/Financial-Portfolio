# Used once on 28 Nov 2026 (owner: the whole logo, with VENTURES, everywhere) on the 71 landing pictures that #1016 had given the cut-down wordmark.
# Run from frontend/public: python3 ../../scripts/landing-logo-patch.py brand/finlit-ventures-logo.png <old wordmark-on-light.png> <list of files>
"""Finds the cut-down wordmark in the header corner of each landing picture by template matching (several sizes) and puts the whole
FinLit Ventures logo (with VENTURES, its own proportions) in its place on the header's background."""
import sys
import cv2
import numpy as np
from PIL import Image

LOGO = Image.open(sys.argv[1]).convert("RGB")
def template(path, bg):
    wm = Image.open(path).convert("RGBA")
    alpha = np.asarray(wm)[..., 3]
    ys, xs = np.where(alpha > 20)
    wm = wm.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
    c = Image.new("RGBA", wm.size, bg + (255,)); c.alpha_composite(wm)
    return cv2.cvtColor(np.asarray(c.convert("RGB")), cv2.COLOR_RGB2GRAY)
TEMPLATES = [template(sys.argv[2], (245, 240, 228)), template(sys.argv[2].replace("wm-light", "wm-dark"), (22, 36, 30))]

def find(gray, W, H, T):
    zone = gray[: int(H * 0.3), : int(W * 0.25)]
    best = (-1, None)
    for h in range(8, int(H * 0.1) + 1):
        w = round(h * T.shape[1] / T.shape[0])
        if w >= zone.shape[1] or h >= zone.shape[0]: break
        t = cv2.resize(T, (w, h), interpolation=cv2.INTER_AREA)
        res = cv2.matchTemplate(zone, t, cv2.TM_CCOEFF_NORMED)
        _, mv, _, ml = cv2.minMaxLoc(res)
        if mv > best[0]: best = (mv, (ml[0], ml[1], w, h))
    return best

def patch(path):
    im = Image.open(path).convert("RGB"); W, H = im.size
    a = np.asarray(im)
    gray = cv2.cvtColor(a, cv2.COLOR_RGB2GRAY)
    score, (x, y, w, h) = max((find(gray, W, H, T) for T in TEMPLATES), key=lambda r: r[0])
    pad = max(1, round(h * 0.08))
    strip = a[max(0, y - pad): y + h + pad, max(0, x - pad - 4): max(1, x - pad)]
    bg = tuple(int(v) for v in np.median(strip.reshape(-1, 3), axis=0))
    out = im.copy()
    out.paste(bg, (max(0, x - pad), max(0, y - pad), x + w + pad, y + h + pad))
    nh = round(h * 1.1); nw = round(nh * LOGO.width / LOGO.height)
    out.paste(LOGO.resize((nw, nh), Image.LANCZOS), (x, round(y + h / 2 - nh / 2)))
    return out, score, (x, y, w, h)

if __name__ == "__main__":
    files = open(sys.argv[3]).read().split(); out_dir = sys.argv[4] if len(sys.argv) > 4 else None
    for f in files:
        out, score, box = patch(f)
        print(f"{score:.2f} {box} {f}")
        if out_dir: out.save(out_dir + "/" + f.replace("/", "__") + ".png")
        else: out.save(f, quality=90)
