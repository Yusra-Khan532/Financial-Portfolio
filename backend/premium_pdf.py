"""Render the current on-demand report; never fetch or recalculate at download time."""
from io import BytesIO
from datetime import datetime
from zoneinfo import ZoneInfo
from xml.sax.saxutils import escape
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether
from reportlab.graphics.shapes import Drawing, String, Line, Circle

NAVY = colors.HexColor("#10233D")
GOLD = colors.HexColor("#B5822E")
MUTED = colors.HexColor("#57677A")
PALE = colors.HexColor("#F0F4F8")


def text(value):
    return escape(str(value if value is not None else "Not available")).replace("\n", "<br/>")


def number(value, suffix=""):
    return f"{value:,.2f}{suffix}" if isinstance(value, (int, float)) else "N/A"


def render_premium_pdf(report):
    output = BytesIO()
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(name="ReportTitle", fontName="Helvetica-Bold", fontSize=27, leading=32, textColor=NAVY, spaceAfter=14))
    styles.add(ParagraphStyle(name="SectionTitle", fontName="Helvetica-Bold", fontSize=16, leading=21, textColor=NAVY, spaceBefore=14, spaceAfter=9))
    styles.add(ParagraphStyle(name="BodyCopy", fontName="Helvetica", fontSize=9, leading=14, textColor=MUTED, spaceAfter=7))
    styles.add(ParagraphStyle(name="CellCopy", fontName="Helvetica", fontSize=8, leading=11, textColor=NAVY))
    styles.add(ParagraphStyle(name="CellSmall", fontName="Helvetica", fontSize=7, leading=9, textColor=NAVY))
    styles.add(ParagraphStyle(name="GoldLabel", fontName="Helvetica-Bold", fontSize=9, leading=13, textColor=GOLD, spaceAfter=10))
    doc = SimpleDocTemplate(output, pagesize=A4, rightMargin=19*mm, leftMargin=19*mm, topMargin=23*mm, bottomMargin=22*mm,
                            title=f"FinLit Premium Report - {report['company']['symbol']}", author="FinLit Ventures")
    story = []
    p = lambda value, style="BodyCopy": Paragraph(text(value), styles[style])
    def section(title): story.append(p(title, "SectionTitle"))
    def table(rows, widths, compact=False):
        cells = [[p(cell, "CellSmall" if compact else "CellCopy") for cell in row] for row in rows]
        t = Table(cells, colWidths=widths, repeatRows=1, hAlign="LEFT")
        t.setStyle(TableStyle([("BACKGROUND", (0,0), (-1,0), PALE), ("VALIGN", (0,0), (-1,-1), "TOP"),
                               ("LEFTPADDING", (0,0), (-1,-1), 4 if compact else 8), ("RIGHTPADDING", (0,0), (-1,-1), 4 if compact else 8),
                               ("TOPPADDING", (0,0), (-1,-1), 5 if compact else 8), ("BOTTOMPADDING", (0,0), (-1,-1), 5 if compact else 8),
                               ("LINEBELOW", (0,0), (-1,0), .8, GOLD), ("LINEBELOW", (0,1), (-1,-1), .3, colors.HexColor("#DDE3EB"))]))
        story.append(t)
    company, rating = report["company"], report["rating"]
    rated = rating["status"] != "NOT RATED"
    story.append(p("FINLIT VENTURES / EQUITY RESEARCH", "GoldLabel"))
    story.append(p("Premium Company Report", "ReportTitle"))
    story.append(p(company["name"], "SectionTitle"))
    story.append(p(f"{company['symbol']} | {company.get('industry') or 'Industry unavailable'} | {report['statementType'].title()} statements"))
    generated = datetime.fromisoformat(report["createdAt"]).astimezone(ZoneInfo("Asia/Kolkata")).strftime("%d %b %Y, %I:%M %p IST")
    story.append(p(f"Generated {generated} | Model {rating['modelVersion']} | Calculation {report['id'][:12]}"))
    story.append(Spacer(1, 7*mm))
    score = number(rating["final"]) + " / 100" if rated else "NOT RATED"
    story.append(p(score, "ReportTitle"))
    story.append(p(f"{rating['label']} | {rating['status']} | Input coverage {rating['confidence'] * 100:.0f}%", "GoldLabel"))
    story.append(p(rating["headline"]))
    story.append(p("Input coverage measures available data; it does not establish predictive accuracy."))
    section("Assessment at a glance")
    rows = [["Component", "Score / 100", "Weight", "Real-data coverage"]]
    for part, weight in rating["partWeights"].items():
        rows.append([part.title(), number(rating["parts"][part]) if rated else "Not rated", f"{weight*100:.0f}%", f"{rating['coverage'][part]*100:.0f}%"])
    table(rows, [155, 105, 80, 147])
    section("Data dates")
    meta = report["inputMeta"]
    story.append(p(" | ".join(f"{label}: {meta.get(key) or 'unavailable'}" for key,label in (("quarterlyAsOf","Quarter"),("annualAsOf","Financial year"),("balanceAsOf","Balance sheet"),("ownershipAsOf","Ownership"),("priceAsOf","Price")))))
    story.append(p("This is a current model-based financial health assessment, not a target price or an investment recommendation. Market, accounting and data-provider limitations apply."))
    story.append(PageBreak())
    story.append(p("Performance & model drivers", "ReportTitle"))
    section("Annual business performance")
    rows = [["Financial year", "Revenue / NII (Cr)", "Net profit (Cr)", "EPS (INR)"]]
    for row in report.get("trends", []): rows.append([row["period"], number(row["revenue"]), number(row["profit"]), number(row["eps"])])
    table(rows, [100, 140, 130, 117])
    # Three small, independently scaled trends keep EPS separate from monetary amounts.
    trends = report.get("trends", [])
    if len(trends) >= 2:
        drawing = Drawing(487, 112)
        for chart_index, (key, title, unit, colour) in enumerate((("revenue", "Revenue / NII", "Cr", GOLD), ("profit", "Net profit", "Cr", colors.HexColor("#31846C")), ("eps", "EPS", "INR/share", colors.HexColor("#476DAB")))):
            offset = chart_index * 166
            drawing.add(String(offset + 4, 96, title, fontName="Helvetica-Bold", fontSize=9, fillColor=NAVY))
            values = [row.get(key) for row in trends if row.get(key) is not None]
            if not values:
                drawing.add(String(offset + 4, 55, "No comparable data", fontSize=8, fillColor=MUTED))
                continue
            low, high = min(values), max(values)
            span = high - low or 1
            previous = None
            for index, row in enumerate(trends):
                value = row.get(key)
                if value is None:
                    previous = None
                    continue
                x, y = offset + 7 + index / (len(trends) - 1) * 140, 35 + (value - low) / span * 40
                if previous: drawing.add(Line(previous[0], previous[1], x, y, strokeColor=colour, strokeWidth=1.8))
                drawing.add(Circle(x, y, 2, fillColor=colour, strokeColor=colour))
                previous = (x, y)
            drawing.add(String(offset + 4, 15, f"{trends[0]['period']} - {trends[-1]['period']} | {unit}", fontSize=7, fillColor=MUTED))
        story.append(Spacer(1, 5*mm))
        story.append(drawing)
    section("Primary strengths")
    for row in rating["strengths"]:
        story.append(p(f"{row['label']}: {number(row['points'])}/100; contributes {row['pointsEarned']:.2f} weighted points."))
    if not rating["strengths"]: story.append(p("No qualifying strengths identified from actual or substituted inputs."))
    section("Primary concerns")
    for row in rating["weaknesses"]:
        story.append(p(f"{row['label']}: {number(row['points'])}/100; costs {row['pointsLost']:.2f} weighted points. {row['details'].get('note') or ''}"))
    if not rating["weaknesses"]: story.append(p("No qualifying red-level weaknesses identified from actual or substituted inputs."))
    story.append(PageBreak())
    story.append(p("Alerts & review notes", "ReportTitle"))
    section("Model alerts")
    for alert in rating["alerts"]: story.append(p("- " + alert))
    if not rating["alerts"]: story.append(p("No model alerts."))
    section("Data-quality review")
    for warning in report.get("warnings", []): story.append(p("- " + warning))
    story.append(PageBreak())
    story.append(p("Detailed model scorecard", "ReportTitle"))
    story.append(p("A: actual | Z: loss rule | S: substituted | F: filled with group value | N: not applicable | L: not supplied. Filled values describe the model assumption, not a company fact."))
    for part in rating["partWeights"]:
        if part == "quality":
            story.append(PageBreak())
            story.append(p("Quality & risk scorecard", "ReportTitle"))
        section(part.title())
        rows = [["Metric", "Value", "Points", "State", "Weight"]]
        for row in rating["metrics"]:
            if row["part"] == part:
                value = row["details"].get("note") if row["value"] is None and row["details"].get("note") else number(row["value"], " " + row.get("unit", ""))
                rows.append([row["label"], value, number(row["points"]), row["status"], str(row["weight"])])
        table(rows, [166, 153, 60, 48, 60])
    trace = report.get("calculationTrace")
    if trace:
        story.append(PageBreak())
        story.append(p("Full calculation trail", "ReportTitle"))
        story.append(p(f"Group {rating['group']} | {report['statementType']} statements | model {rating['modelVersion']}. Calculation input values and the exact active category parameters follow."))
        story.append(p("Financial amounts and share counts use crore units. EPS and prices use INR per share. N/A means unavailable, never zero. Periods run oldest to newest."))
        sales_label = "Net interest income" if rating['group'] in ("BANK","NBFC") else "Net premium income" if rating['group']=="INSURANCE" else "Sales"
        section("Quarterly inputs")
        for offset in range(0,len(trace['quarterly']),7):
            chunk=trace['quarterly'][offset:offset+7]
            rows=[["Input"]+[r['period'] for r in chunk]]
            for key,label in (("sales",sales_label),("profit","Owner-attributable profit"),("ebitda","EBITDA"),("eps","EPS (INR)")):
                rows.append([label]+[number(r.get(key)) for r in chunk])
            table(rows,[120]+[367/len(chunk)]*len(chunk),compact=True)
            story.append(Spacer(1,4*mm))
        if not trace['quarterly']: story.append(p("Quarterly inputs unavailable for this statement basis."))
        section("Annual inputs")
        if trace['annual']:
            rows=[["Input"]+[r['period'] for r in trace['annual']]]
            for key,label in (("sales",sales_label),("profit","Owner-attributable profit"),("cashFlow","Operating cash flow"),("netWorth","Book equity")):
                rows.append([label]+[number(r.get(key)) for r in trace['annual']])
            table(rows,[120]+[367/len(trace['annual'])]*len(trace['annual']),compact=True)
        else: story.append(p("Annual inputs unavailable for this statement basis."))
        story.append(PageBreak())
        story.append(p("Latest inputs & ratios", "ReportTitle"))
        story.append(p("The following reported and derived inputs support the metric calculations. Missing benchmarks remain explicitly unavailable."))
        latest=trace['latest']
        rows=[["Input", "Value", "Input", "Value"]]
        for index in range(0,len(latest),2):
            pair=[]
            for r in latest[index:index+2]: pair.extend([r['label'],number(r['value']," "+r['unit'])])
            rows.append(pair+[""]*(4-len(pair)))
        table(rows,[135,108,135,109],compact=True)
        for part in trace['parts']:
            story.append(PageBreak())
            story.append(p(part['part'].title()+" calculations", "ReportTitle"))
            story.append(p(f"Active group: {rating['group']} | Weight in final score: {part['weight']*100:.0f}% | Category score: {number(part['score'])}/100"))
            story.append(p("Each metric shows the input equation and its actual scoring equation. Raw weights apply inside this category. A: actual; Z: loss rule; S: substituted; F: filled; N/L: excluded."))
            rows=[["Metric & parameters", "Input and points calculation"]]
            for row in trace['metrics']:
                if row['part']!=part['part']: continue
                params=f"{row['label']}\nState {row['state']} | weight {number(row['weight'])}\nPoints: {number(row['points'])}"
                if row['worst'] is not None: params+=f"\n0-point threshold: {number(row['worst'])}\n100-point threshold: {number(row['best'])}"
                rows.append([params,row['valueCalculation']+"\n\n"+row['pointsCalculation']])
            table(rows,[133,354],compact=True)
            section("Category weighted calculation")
            story.append(p(f"Denominator: {number(part['denominator'])}. "+part['calculation']))
        story.append(PageBreak())
        story.append(p("Final score calculation", "ReportTitle"))
        section("Weighted result")
        story.append(p(trace['finalCalculation']))
        section("Input coverage")
        story.append(p(trace['coverageCalculation']))
        section("Rules & interpretation")
        for note in trace['notes']: story.append(p(note))
        story.append(p("Data quality: "+rating.get('dataIntegrityStatus','See report warnings')+". Data-quality warnings are separate from the model's numeric scoring rules."))
    else:
        section("Calculation trail availability")
        story.append(p("Calculation details are unavailable in this report. Generate a new report to include quarterly/annual inputs, active group parameters and step-by-step arithmetic."))
    story.append(PageBreak())
    story.append(p("Methodology & data integrity", "ReportTitle"))
    story.append(p(f"Engine {rating['modelVersion']} implements the supplied {rating['baselineVersion']} baseline with corrections for reporting-period alignment, share counts, valuation reconciliation, valid zero values, incomplete histories and missing-data loss cases. Group: {rating['group']}. Group-fill snapshot: {rating['fillVersion']}."))
    story.append(p("Final = 40% Fundamental + 30% Valuation + 20% Quality + 10% Risk. Labels: Strong >=80; Healthy >=65; Average >=50; Weak >=35; Poor <35. Confidence below 80% or fewer than six comparable quarters is Provisional; below 50% is Not Rated and the aggregate score is withheld."))
    story.append(p("Quarterly histories retain missing calendar slots and compare the same quarter last year. CAGR requires at least three years between four consecutive year-ends. INR monetary inputs and shares use crore units; EPS and prices remain INR per share. Promoter pledge uses promoter holdings as its denominator. CET1 is not substituted for total capital adequacy."))
    section("Benchmark coverage")
    benchmark = report.get("benchmark", {})
    story.append(p(f"{benchmark.get('source', 'Unavailable')} | as of {benchmark.get('asOf', 'N/A')} | peer universe {benchmark.get('universeCount',0)} | current observations {benchmark.get('fetchedCount',0)}."))
    story.append(p(benchmark.get("note", "Industry medians unavailable.")))
    section("Limitations & review notes")
    for warning in report.get("warnings", []): story.append(p("- " + warning))
    story.append(PageBreak())
    story.append(p("Source audit & reproducibility", "ReportTitle"))
    story.append(p("Each input section records its retrieval time and provider availability. The input hash identifies the exact canonical input set used for this assessment."))
    rows = [["Data section", "Available", "Retrieved (UTC)"]]
    for source in report.get("sources", []): rows.append([source["section"], "Yes" if source["available"] else "No", source["retrievedAt"][:19].replace("T", " ") + " UTC"])
    table(rows, [150, 75, 262])
    story.append(Spacer(1, 5*mm))
    story.append(p(f"Input SHA-256: {report['inputHash']}"))
    story.append(p("This PDF and the web page use the same calculation result. Reports are temporary and are not stored in report history. Downloading does not refresh prices or recompute the model. Generate a new report to update the assessment."))
    def footer(canvas, doc):
        canvas.saveState()
        w,h = A4
        canvas.setStrokeColor(GOLD); canvas.line(19*mm, h-16*mm, w-19*mm, h-16*mm)
        canvas.setFont("Helvetica-Bold",8); canvas.setFillColor(NAVY); canvas.drawString(19*mm,h-13*mm,"FINLIT / PREMIUM RESEARCH")
        canvas.setFont("Helvetica",7); canvas.setFillColor(MUTED)
        canvas.drawString(19*mm,13*mm,f"{company['symbol']} | {report['id'][:12]} | Private admin report")
        canvas.drawRightString(w-19*mm,13*mm,f"Page {doc.page}")
        canvas.restoreState()
    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    return output.getvalue()
