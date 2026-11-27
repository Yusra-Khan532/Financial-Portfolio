"""Tab icons (favicon-16/32/48/64/96.png and favicon.ico) from the team's FinLit Ventures logo (task #400 attachment, 1920x1920 "VENTURES Logo Final").
Owner, 27 Nov 2026: the tab must show the company's logo, not the "L + bars" crop. The icon is the whole FinLit mark (the figure on the stairs, "Fin",
"Lit", the bars and the arrow) on the logo's own dark green, with rounded corners; "VENTURES" is left out (under 2 px tall at tab size).
It also makes the home-screen and app icons (apple-touch-icon.png 180, icon-192.png, icon-512.png: square, the phone rounds them; icon-maskable-512.png:
the mark inside the central 80% circle that Android may crop to).
Run: python3 scripts/make-favicons.py <logo.png or .webp> public   (then delete favicon-64.png, which the site does not link)."""
import sys
from PIL import Image, ImageDraw
src=Image.open(sys.argv[1]).convert('RGB'); out=sys.argv[2]
BG=(1,18,6)
mark=src.crop((146,493,1786,1288))           # the FinLit mark: figure on the stairs, Fin, Lit, bars and arrow
# the artwork's dark panel is slightly noisy: its near-black pixels become BG exactly, so no faint edge of the crop shows on the icon
_bg=Image.new('RGB',mark.size,BG); _ink=mark.convert('L').point(lambda v: 255 if v>48 else (0 if v<28 else (v-28)*255//20))
mark=Image.composite(mark,_bg,_ink)
def icon(n, pad=0.02, radius=0.14):
    S=1024; c=Image.new('RGB',(S,S),BG)
    w=int(S*(1-2*pad)); h=round(w*mark.height/mark.width)
    m=mark.resize((w,h),Image.LANCZOS); c.paste(m,((S-w)//2,(S-h)//2))
    ic=c.resize((n,n),Image.LANCZOS).convert('RGBA')
    if radius:
        mk=Image.new('L',(n*4,n*4),0); ImageDraw.Draw(mk).rounded_rectangle((0,0,n*4-1,n*4-1),int(n*4*radius),fill=255)
        ic.putalpha(mk.resize((n,n),Image.LANCZOS))
    return ic
for n, name in ((180,'apple-touch-icon'),(192,'icon-192'),(512,'icon-512')): icon(n, pad=0.06, radius=0).convert('RGB').save(f'{out}/{name}.png',optimize=True)
icon(512, pad=0.14, radius=0).convert('RGB').save(f'{out}/icon-maskable-512.png',optimize=True)
for n in (16,32,48,64,96): icon(n).save(f'{out}/favicon-{n}.png',optimize=True)
icon(48).save(f'{out}/favicon.ico',sizes=[(16,16),(32,32),(48,48)],append_images=[icon(16),icon(32)])
