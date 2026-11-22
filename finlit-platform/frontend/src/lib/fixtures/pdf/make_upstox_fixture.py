"""A sample Upstox-style DP holding statement (same layout as the broker's real one: ISIN | Scrip Name | Current Qty | Free Qty | Freeze Qty |
Locked Qty | Pledge Qty | Remat Qty | Value Date | Rate | Valuation). Sample member, sample quantities; no average price column, like the real one."""
import sys
from reportlab.pdfgen import canvas
W, H = 1224, 792
COLS = [("ISIN", 120), ("Scrip Name", 260), ("Current Qty", 378), ("Free Qty", 471), ("Freeze Qty", 565), ("Locked Qty", 659),
        ("Pledge Qty", 752), ("Remat Qty", 846), ("Value Date", 940), ("Rate", 1033), ("Valuation", 1127)]
P1 = [("INE002A01018", "RELIANCE INDUSTRIES LTD", 15, 1544.2), ("INE467B01029", "TATA CONSULTANCY SERV LT", 8, 3105.5),
      ("INE009A01021", "INFOSYS LIMITED", 40, 1561.3), ("INE040A01034", "HDFC BANK LIMITED", 25, 986.45),
      ("INE154A01025", "ITC LIMITED", 120, 404.1), ("INE075A01022", "WIPRO LIMITED", 0, 245.6), ("INF204KB14I2", "NIPPON INDIA ETF NIFTY BEES", 50, 291.4)]
P2 = [("INE280A01028", "TITAN COMPANY LIMITED", 10, 3876.0), ("INE733E01010", "NTPC LIMITED", 55, 331.25),
      ("INE018A01030", "LARSEN & TOUBRO LIMITED", 12, 4012.7), ("INE002A01018", "RELIANCE INDUSTRIES LTD", 5, 1544.2)]
c = canvas.Canvas(sys.argv[1], pagesize=(W, H))
def page(rows, first):
    y = H - 60
    if first:
        c.setFont("Helvetica-Bold", 12); c.drawCentredString(W / 2, y, "UPSTOX SECURITIES PRIVATE LIMITED"); y -= 40
        c.setFont("Helvetica", 9)
        for t in ["UCC : SAMPLE01", "Name : Member", "BOID : SAMPLE0001", "Report Date Till : 21-11-2026", "Report Generation Date : 22-11-2026"]:
            c.drawString(50, y, t); y -= 16
        y -= 60
    c.setFont("Helvetica-Bold", 9)
    for name, x in COLS: c.drawCentredString(x, y, name)
    y -= 31; c.setFont("Helvetica", 8)
    for isin, name, q, rate in rows:
        vals = [isin, name, f"{q:.1f}", f"{q:.1f}", "0.0", "0.0", "0.0", "0.0", "20-11-2026", f"{rate:g}", f"{q * rate:.1f}"]
        for k, ((lab, x), v) in enumerate(zip(COLS, vals)):
            if k == 1: c.drawString(214, y, v)          # names start at one x, as on most lines of the real statement
            else: c.drawCentredString(x, y, v)
        y -= 30
    c.setFont("Helvetica", 7); c.drawString(50, 30, "This is a system generated statement.")
    c.showPage()
page(P1, True); page(P2, False); c.save()
