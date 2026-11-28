"""Tab icons, app icons, the share image and the PDF logo from the FinLit Ventures logo with no background (owner, 28 Nov 2026; scripts/make-logo-versions.py
makes the two versions: black Fin and VENTURES for light, white for dark; gold and teal the same).
  favicon-theme.svg          the tab icon: the light version, and the dark version when the browser is in dark mode (prefers-color-scheme)
  favicon-16/32/48/96.png    favicon.ico (16/32/48)  the light version on a clear background, for browsers without SVG icons
  apple-touch-icon.png, icon-192.png, icon-512.png   the light version on white (a home screen needs a solid icon); icon-maskable-512.png the same at 72%
  og-finlit-1200x630.png     the share image: the light version on white with the tagline
  brand/finlit-ventures-pdf-logo.jpg   the AI-summary PDF's header logo on white
Nothing is cropped, stretched or recoloured; the logo is only scaled and centred. Run from finlit-platform/frontend: python3 scripts/make-favicons.py <old og png>"""
import base64, io, sys
from PIL import Image

LIGHT = Image.open("../scripts/assets/finlit-ventures-logo-light.png").convert("RGBA")
DARK = Image.open("../scripts/assets/finlit-ventures-logo-dark.png").convert("RGBA")
WHITE = (255, 255, 255, 255)


def square(logo, n, fill=(0, 0, 0, 0), share=0.96):
    c = Image.new("RGBA", (n * 4, n * 4), fill)
    w = round(n * 4 * share); h = round(w * logo.height / logo.width)
    c.alpha_composite(logo.resize((w, h), Image.LANCZOS), ((n * 4 - w) // 2, (n * 4 - h) // 2))
    return c.resize((n, n), Image.LANCZOS)


for n in (16, 32, 48, 96):
    square(LIGHT, n).save(f"public/favicon-{n}.png", optimize=True)
square(LIGHT, 48).save("public/favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)], append_images=[square(LIGHT, 16), square(LIGHT, 32)])

def b64(img):
    buf = io.BytesIO(); img.save(buf, "PNG", optimize=True); return base64.b64encode(buf.getvalue()).decode()
svg = ('<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 128 128">'
       '<style>.d{display:none}@media (prefers-color-scheme: dark){.l{display:none}.d{display:inline}}</style>'
       f'<image class="l" width="128" height="128" href="data:image/png;base64,{b64(square(LIGHT, 128))}"/>'
       f'<image class="d" width="128" height="128" href="data:image/png;base64,{b64(square(DARK, 128))}"/></svg>')
open("public/favicon-theme.svg", "w").write(svg)

for n, name in ((180, "apple-touch-icon"), (192, "icon-192"), (512, "icon-512")):
    square(LIGHT, n, WHITE, 0.88).convert("RGB").save(f"public/{name}.png", optimize=True)
square(LIGHT, 512, WHITE, 0.72).convert("RGB").save("public/icon-maskable-512.png", optimize=True)

# the share image: the light version on white, and the tagline taken from the earlier share image (light text there, dark ink here)
og = Image.new("RGBA", (1200, 630), WHITE)
h = 430; w = round(h * LIGHT.width / LIGHT.height)
og.alpha_composite(LIGHT.resize((w, h), Image.LANCZOS), ((1200 - w) // 2, 50))
if len(sys.argv) > 1:
    old = Image.open(sys.argv[1]).convert("L").crop((296, 530, 904, 572))
    alpha = old.point(lambda v: 0 if v < 40 else min(255, (v - 40) * 255 // 180))
    og.paste(Image.new("RGBA", old.size, (28, 26, 21, 255)), (296, 525), alpha)
og.convert("RGB").save("public/og-finlit-1200x630.png", optimize=True)

pdf = Image.new("RGBA", (LIGHT.width, LIGHT.height), WHITE); pdf.alpha_composite(LIGHT)
pdf.convert("RGB").resize((round(200 * LIGHT.width / LIGHT.height), 200), Image.LANCZOS).save("public/brand/finlit-ventures-pdf-logo.jpg", quality=90)
