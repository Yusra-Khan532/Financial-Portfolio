"""Tab icons (favicon-16/32/48/96.png, favicon.ico) and home-screen/app icons (apple-touch-icon.png, icon-192/512.png, icon-maskable-512.png)
from the team's FinLit Ventures logo (scripts/assets/finlit-ventures-logo-2000.webp, the owner's 2000 x 2000 artwork of 28 Nov 2026).
Owner, 28 Nov 2026: "Strictly change this logo to every place": every icon is the WHOLE artwork, as given: square, with "VENTURES", nothing
cropped, stretched or recoloured, only scaled down. The maskable icon (Android may cut it to a circle) has the same artwork scaled to 72% on its
own black, so no part of the logo is cut off.
Run from finlit-platform/frontend: python3 scripts/make-favicons.py"""
from PIL import Image

SRC = "../scripts/assets/finlit-ventures-logo-2000.webp"
OUT = "public"
art = Image.open(SRC).convert("RGB")
assert art.size[0] == art.size[1], "the artwork is square"


def icon(n: int) -> Image.Image:
    return art.resize((n, n), Image.LANCZOS)


for n in (16, 32, 48, 96):
    icon(n).save(f"{OUT}/favicon-{n}.png", optimize=True)
icon(48).save(f"{OUT}/favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)], append_images=[icon(16), icon(32)])
for n, name in ((180, "apple-touch-icon"), (192, "icon-192"), (512, "icon-512")):
    icon(n).save(f"{OUT}/{name}.png", optimize=True)
m = Image.new("RGB", (512, 512), (0, 0, 0))
inner = art.resize((368, 368), Image.LANCZOS)   # the logo itself then sits inside the central 80% circle
m.paste(inner, (72, 72))
m.save(f"{OUT}/icon-maskable-512.png", optimize=True)
