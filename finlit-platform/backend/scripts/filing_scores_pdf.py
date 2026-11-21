"""Task #266: write the methodology PDF of "The three filings, point by point" (frontend/public/docs/finlit-filing-scores-method.pdf) from the scorer's own
lexicon, so the PDF and the scores can never disagree. Run it after any change to finlit/docscore/lexicon.py:

    cd backend && python scripts/filing_scores_pdf.py

The PDF explains the scoring method, the three score ranges and how the analysis is structured across the three documents. It names the ranges by
colour only: never positive, neutral or negative (the task's rule).
"""
from __future__ import annotations

import sys
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from finlit.docscore import lexicon as L  # noqa: E402

OUT = Path(__file__).resolve().parents[2] / "frontend" / "public" / "docs" / "finlit-filing-scores-method.pdf"
INK, MUTED, LINE = colors.HexColor("#1D2A24"), colors.HexColor("#5A5444"), colors.HexColor("#D9D3C4")
GREEN, YELLOW, RED = colors.HexColor("#1F6B49"), colors.HexColor("#7A5B16"), colors.HexColor("#A12E26")
GREEN_S, YELLOW_S, RED_S = colors.HexColor("#E1F2E7"), colors.HexColor("#F6EBCB"), colors.HexColor("#F8E1DF")

ss = getSampleStyleSheet()
H1 = ParagraphStyle("h1", parent=ss["Title"], fontName="Helvetica-Bold", fontSize=20, leading=24, textColor=INK, alignment=TA_LEFT, spaceAfter=6)
H2 = ParagraphStyle("h2", parent=ss["Heading2"], fontName="Helvetica-Bold", fontSize=13.5, leading=17, textColor=INK, spaceBefore=12, spaceAfter=4, keepWithNext=1)
H3 = ParagraphStyle("h3", parent=ss["Heading3"], fontName="Helvetica-Bold", fontSize=11, leading=14, textColor=INK, spaceBefore=8, spaceAfter=2)
P = ParagraphStyle("p", parent=ss["BodyText"], fontName="Helvetica", fontSize=9.5, leading=13.5, textColor=INK, spaceAfter=4)
SM = ParagraphStyle("sm", parent=P, fontSize=8, leading=11, textColor=MUTED)
CELL = ParagraphStyle("cell", parent=P, fontSize=8.5, leading=11.5, spaceAfter=0)
CELLB = ParagraphStyle("cellb", parent=CELL, fontName="Helvetica-Bold")


def table(rows, widths, head=True, shade=None):
    t = Table([[Paragraph(str(c), CELLB if head and i == 0 else CELL) for c in r] for i, r in enumerate(rows)], colWidths=widths, repeatRows=1 if head else 0)
    st = [("GRID", (0, 0), (-1, -1), 0.4, LINE), ("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 5), ("RIGHTPADDING", (0, 0), (-1, -1), 5),
          ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3)]
    if head:
        st.append(("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#F1EDE3")))
    for (r, c), col in (shade or {}).items():
        st.append(("BACKGROUND", (c, r), (c, r), col))
    t.setStyle(TableStyle(st))
    return t


def words(theme: str, up: bool, types: str = "") -> str:
    items = [(p, w, t) for p, w, th, t in L.WORDS if th == theme and ((w > 0) if up else (w < 0))]
    return "; ".join(f"{p} {('+' if w > 0 else '')}{w:g}{f' [{t}]' if t else ''}" for p, w, t in items)


def build() -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    doc = SimpleDocTemplate(str(OUT), pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm, topMargin=16 * mm, bottomMargin=16 * mm,
                            title="FinLit: how the three filings are scored", author="FinLit Ventures", subject="Scoring method, score ranges and structure")
    W = A4[0] - 36 * mm
    s = []
    s.append(Paragraph("How the three filings are scored", H1))
    s.append(Paragraph("The method behind <b>The three filings, point by point</b> in Section 18 (News and filings) of the FinLit company report. "
                       f"Word lists version {L.LEXICON_VERSION}.", SM))
    s.append(Spacer(1, 6))
    s.append(Paragraph("1. What it does", H2))
    s.append(Paragraph("Investor presentations, earnings call transcripts and results filings are long. FinLit breaks each one into short points (a sentence, a "
                       "bullet or a table row), scores every point from 0 to 100 with fixed rules, and rolls the points up into a score for the document and one "
                       "for the company. The method is rule-based: no artificial intelligence or machine-learning model is used, and every score can be traced "
                       "to the words and rules that produced it.", P))
    s.append(Paragraph("Every score is shown as a number with its colour, and only that. The colours mark three score ranges; they are not labels of good or "
                       "bad news, and the page never names them with such words.", P))
    s.append(Paragraph("2. The three score ranges", H2))
    s.append(table([["Colour", "Range", "What the range holds"],
                    ["Green", f"{L.GREEN_FROM:g}–100", "Points backed by figures, business that is done, or clearly stated improvement"],
                    ["Yellow", f"{L.YELLOW_FROM:g}–{L.GREEN_FROM - 1:g}", "Mixed or general statements, or business that is only intended"],
                    ["Red", f"0–{L.YELLOW_FROM - 1:g}", "Weak, delayed or cancelled business, or a point an auditor has flagged"]],
                   [24 * mm, 24 * mm, W - 48 * mm], shade={(1, 0): GREEN_S, (2, 0): YELLOW_S, (3, 0): RED_S}))
    s.append(Spacer(1, 4))
    s.append(Paragraph("The same three ranges apply to every point, theme, parameter, document and company score, so the three documents can be compared. "
                       "Secondary flags: a score within 62–67 or 37–42 sits near a boundary (one word can move it across); a document whose point scores spread "
                       "widely (standard deviation above 25) is marked as widely spread; a document with a hard trigger is held at 64 or below.", P))

    s.append(Paragraph("3. Where the documents come from: Section 18", H2))
    s.append(Paragraph("The underlying data is Section 18 of the FinLit company report, <b>News and filings</b>: the announcements the company files with NSE. "
                       "For each of the three document types FinLit takes the newest filing of that type in the list, and opens the company's own PDF:", P))
    s.append(table([["Document", "The Section 18 filing used", "What is scored"],
                    ["Investor presentation", "NSE category Investor Presentation (or a filing that names an investor or earnings presentation)",
                     "Slides and notes, split by slide title, bullet and table row"],
                    ["Earnings call transcript", "A filing whose subject is the transcript of the earnings call",
                     "What management said, sentence by sentence; analysts' questions and the moderator are left out"],
                    ["Results filing", "Outcome of Board Meeting / Financial Results: the filed results (not the notice of the meeting)",
                     "Statements, notes and the auditor's report, by line and paragraph"]], [36 * mm, 70 * mm, W - 106 * mm]))
    s.append(Spacer(1, 4))
    s.append(Paragraph("When Section 18's newest 25 filings do not include one of the three, the newest stored filing of that type in the last 400 days is used, and "
                       "the page says so. Many companies file results, press release and presentation as one PDF: FinLit then reads, for the results filing, the "
                       "pages before the press release or presentation begins, and for the presentation, the pages from its title page on.", P))

    s.append(Paragraph("4. Preparing the text", H2))
    s.append(Paragraph("Wrapped lines are joined and words split at a line end are re-joined. A short title line starts a new section and is kept for structure, not "
                       "scored. In a transcript every sentence carries its speaker; the moderator and the analysts (the speakers the moderator introduces, or "
                       "labelled analyst or participant) are left out, because a question is not a company statement. These are listed but never averaged:", P))
    s.append(table([["Left out", "Why"],
                    ["Legal text: forward-looking statements, safe harbour, disclaimers, the operator's script, and the auditor's standard responsibilities paragraphs",
                     "It says nothing about this company's business"],
                    ["Analysts' questions and moderator lines", "A question is not a company statement"],
                    ["Headings", "They carry structure, not facts"],
                    ["Points with no listed word and no figure, or fewer than three words", "No signal: including them would pull every score toward 50"],
                    ["A sentence repeated word for word", "Scored once"]], [W * 0.62, W * 0.38]))
    s.append(Paragraph("Importance weight of a point (the highest that applies, never multiplied): a listed word 1.3; a bullet, the first or last point of a section, "
                       "a figure or a word such as conclusion, significant, risk or must 1.2; otherwise 1.0.", P))

    s.append(Paragraph("5. Scoring one point", H2))
    s.append(Paragraph("<b>Point score = 50 + D + M + E + X + C + T + S18</b>, limited to 0–100.", P))
    s.append(table([["Part", "What it measures", "Range", "How it is read"],
                    ["D Direction", "Words that describe improvement or deterioration", "−35 to +35",
                     "The sum of the weights of the listed phrases found (appendix). The longest phrase is matched first and its words are not counted again; a "
                     "phrase repeated in one point counts once."],
                    ["M Magnitude", "The size of a stated percentage change", "−12 to +10",
                     "A percentage with an up word (grew, rose) or a down word (fell, declined) within about ten words: up +2 / +6 / +10, down −4 / −8 / −12 for "
                     "a change below 10%, 10% to below 25%, 25% or more. The largest effect only; none when up and down words both sit next to it."],
                    ["E Evidence", "Whether the statement is backed by data", "−3 to +8",
                     "+4 a figure; +2 a period or comparison with it (YoY, QoQ, FY, quarter); +2 a source phrase (as per, audited, as reported); −3 vague "
                     "words (significant, several, going forward) with no figure."],
                    ["X Execution", "Done or only intended", "−6 to +6", "+6 executed words (signed, commissioned, completed) with no intent words; −6 intent words "
                     "(MoU, exploring, plans to, subject to approval) with no executed words; 0 when both; +2 in-progress words."],
                    ["C Certainty", "How firm the language is", "−3 to +2", "+2 commitment words (firm order, we will, committed to); −3 hedge words (may, could, believe, expect)."],
                    ["T Horizon", "When the claim applies", "−2 to +2", "−2 a long horizon (by 2030, long-term); else +2 the current period (this quarter, Q2, year ended)."],
                    ["S18 Check", "A stated figure checked against reported data", "−10 to +5",
                     "+5 agrees, −10 differs. Section 18 holds filings, not figures, so this check is not used yet and its weight is shared by the others."]],
                   [22 * mm, 38 * mm, 18 * mm, W - 78 * mm]))
    s.append(Spacer(1, 4))
    s.append(Paragraph("Negation: no, not, without, nil, never, none or cannot within the three words before a phrase reverses it; a phrase that lowers the score is "
                       "then halved (\"no risk of default\" adds 10). Contrast: despite, although, though, while or in spite of before a phrase that lowers the score "
                       "halves it. Standard wording that only looks like a listed phrase (\"the going concern basis of accounting\", \"fraud or error\", "
                       "\"by default\") is read as no signal.", P))
    s.append(Paragraph("Hard triggers: a phrase that on its own marks a serious issue. When one is present and not negated, the point is held at 25 or below and "
                       "the document at 64 or below.", P))
    s.append(table([["Applies to", "Hard triggers"], ["All three", "; ".join(L.HARD_ALL)], ["Results filings", "; ".join(L.HARD_R)],
                    ["Presentations and transcripts", "; ".join(L.HARD_PC)]], [42 * mm, W - 42 * mm]))

    s.append(Paragraph("6. Nine themes, weighted by document", H2))
    s.append(Paragraph("Each point belongs to the theme whose listed words carry most of its weight (points with none are General and carry no theme weight). "
                       "A theme's score is the importance-weighted average of its points. Each document weights the themes differently: a results filing is "
                       "mostly numbers and audit, a call mostly guidance and margins, a presentation mostly orders and capacity. A theme with no points shares "
                       "its weight among the others.", P))
    s.append(table([["Theme", "Presentation", "Call", "Results"]] + [[L.THEMES[t], L.THEME_WEIGHTS["P"][t], L.THEME_WEIGHTS["C"][t], L.THEME_WEIGHTS["R"][t]] for t in L.THEMES]
                   + [["Total", 100, 100, 100]], [W - 75 * mm, 25 * mm, 25 * mm, 25 * mm]))

    s.append(Paragraph("7. The document score", H2))
    s.append(table([["Parameter", "What it measures", "Formula", "Weight"],
                    ["P1 Theme-weighted points", "The overall reading of the content", "Sum of theme weight × theme score ÷ the weights of themes with points", L.PARAM_WEIGHTS["P1"]],
                    ["P2 Balance", "Green points against red points", "50 + (green share − red share) ÷ 2", L.PARAM_WEIGHTS["P2"]],
                    ["P3 Evidence", "How much is backed by figures", "Share of points with a figure ÷ 70%, at most 100", L.PARAM_WEIGHTS["P3"]],
                    ["P4 Execution", "Done against intended business", "Executed ÷ (executed + intended) × 100; 50 with fewer than 3 such points", L.PARAM_WEIGHTS["P4"]],
                    ["P5 Severity", "The weakest points", "100 − (25 × hard triggers + 10 × red points of importance 1.3 or more)", L.PARAM_WEIGHTS["P5"]],
                    ["P6 Reported figures", "Text against reported data", "Agree ÷ (agree + differ) × 100; not used when nothing is checked", L.PARAM_WEIGHTS["P6"]]],
                   [36 * mm, 42 * mm, W - 96 * mm, 18 * mm]))
    s.append(Paragraph("<b>Document score</b> = the weighted average of the parameters used; with a hard trigger it is at most 64. "
                       "<b>Confidence</b>: high with 60 or more scored points, at least 35% of them with figures and at least 10 figures checked; low with fewer than "
                       "25 scored points; otherwise medium. Confidence is shown next to the score and does not change it.", P))

    s.append(Paragraph("8. How the three documents fit together", H2))
    s.append(table([["Document", "Themes that weigh most", "Weight in the company score", "Why"],
                    ["Results filing", "Profitability and margins 18, balance sheet 16, governance and audit 16", "40%", "Audited, the most reliable source"],
                    ["Earnings call transcript", "Guidance and outlook 18, growth 16, margins 16", "35%", "Management's own words, answering questions"],
                    ["Investor presentation", "Growth 18, orders and execution 18, strategy 12", "25%", "The most curated by management"]],
                   [36 * mm, 66 * mm, 30 * mm, W - 132 * mm]))
    s.append(Paragraph("<b>Company score</b> = 0.40 × results + 0.35 × call + 0.25 × presentation. When a document is missing or cannot be read, the others' weights "
                       "are scaled up to total 100, and the page shows the weights used.", P))

    s.append(Paragraph("9. Calibration and limits", H2))
    s.append(Paragraph("The weights are a starting set, tuned on documents an analyst has already read; every change to the lists gets a new version and a line in "
                       "the change log, so an old score can be reproduced. The method reads words, not meaning: it cannot detect sarcasm, implied meaning or what "
                       "a document leaves out. Without reported figures to check against, the score reflects the text only. A score describes what a "
                       "company's own documents say; it is not a recommendation to buy, sell or hold anything. Information only, not investment advice.", P))
    s.append(Paragraph(f"Version {L.LEXICON_VERSION} change log: standard auditor wording and similar contexts that only look like a listed phrase are read as no "
                       "signal; the auditor's standard responsibilities paragraphs are left out as legal text; a phrase repeated in one point counts once; "
                       "\"full-year\" counts as a period next to a figure.", SM))

    s.append(PageBreak())
    s.append(Paragraph("Appendix A: the complete word list", H2))
    s.append(Paragraph("Points added to or taken from the starting 50. [P] presentation, [C] call transcript, [R] results filing only; no tag: all three. A plural "
                       "matches the listed word.", SM))
    for t, name in L.THEMES.items():
        s.append(Paragraph(name, H3))
        s.append(Paragraph("<b>Raise the score:</b> " + words(t, True), SM))
        s.append(Paragraph("<b>Lower the score:</b> " + words(t, False), SM))
    s.append(Paragraph("Appendix B: the other lists", H2))
    for title, xs in (("Executed (X +6)", L.EXECUTED), ("Intent (X −6)", L.INTENT), ("In progress (X +2)", L.IN_PROGRESS), ("Commitment (C +2)", L.COMMITMENT),
                      ("Hedge (C −3)", L.HEDGE), ("Vague with no figure (E −3)", L.VAGUE), ("Long horizon (T −2)", L.LONG_HORIZON),
                      ("Current period (T +2)", L.CURRENT_PERIOD), ("Up words (magnitude)", L.UP), ("Down words (magnitude)", L.DOWN), ("Negation", L.NEGATION),
                      ("Contrast (a lowering phrase halved)", L.CONTRAST), ("Standard wording read as no signal", L.NEUTRAL_CONTEXTS), ("Left out as legal text", L.BOILERPLATE)):
        s.append(Paragraph(f"<b>{title}:</b> " + "; ".join(xs), SM))

    def footer(canvas, d):
        canvas.saveState()
        canvas.setFont("Helvetica", 7.5)
        canvas.setFillColor(MUTED)
        canvas.drawString(18 * mm, 9 * mm, "FinLit Ventures · How the three filings are scored · Information only, not investment advice")
        canvas.drawRightString(A4[0] - 18 * mm, 9 * mm, f"Page {d.page}")
        canvas.restoreState()
    doc.build(s, onFirstPage=footer, onLaterPages=footer)


if __name__ == "__main__":
    build()
    print(OUT)
