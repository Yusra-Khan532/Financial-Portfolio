"""The registry of prebuilt screens: every screen defined ONCE, as data (spec p15, "Screen definition: one record per screen, versioned").

Nothing here runs. engine.py reads these records; the API, the nightly job, the cards, the "How this screen works" text and the CSV export are all built from them.
To add or change a screen, edit the record, bump REGISTRY_VERSION (it is part of every cache key) and add a test (docs/PRESETS.md, "How to add a screen").

Record fields (spec names in brackets)
  id, name, group, card_text           what the user sees; names describe, never advise (a test scans every name and card for the banned words)
  prism_filters                        the page's own Prism parameters: zmin (Prism score), zfmin / zvmin / zqmin / zrmin (Growth & Profitability / Valuation / Quality / Risk
                                       part, "or more"), zvbelow (Valuation strictly BELOW the number: with zvmin=50 on its twin it makes a clean split, nobody falls between), st / lt (short / long-term technical view score, "or more"), rated=1 (has a Prism score; Provisional
                                       included and badged), status="RATED" (Rated only: the three Top-10 screens), cap = Large | Mid | Small (the site's size buckets)
  ql                                   rules in the Query builder's own language, one condition per line (same parser, same units, same missing-data rule: unknown fails)
  derived                              rules that need a nightly field or a Prism part: (rule, plain-words label), see expr.py for the little language
  rank                                 ((field, "desc" | "asc"), ...): first key, then tie-breaks; a missing value ranks last; "cap:<field>" ranks on the figure held
                                       between its 1st and 99th percentile (spec p16); market cap then symbol decide what is left
  limit                                10 for the Top-10 screens, else 25 (the full count is always reported). A screen of 25 pages: the API serves the rest 25 at a time
                                       (?offset=25), up to EXPORT_MAX rows; the Top-10 screens never page
  columns, chips                       the table and the optional chips; a chip changes the rules through `effect` (below)
  how_it_works                         plain-words rule lines
Chip effect keys: prism_set {key: value | None to drop}, ql_add (lines), ql_replace {old line: new line}, derived_add ((rule, label), ...),
  derived_replace {old rule: (rule, label)}, rank (replaces the ranking), sub (a sub-theme to keep; several chips = any of them), small_groups (screen 7)
Kinds: rules (prism_filters + ql + derived), tags (rules among theme-tagged companies), themes (screen 7), quickview (the page's own four views: handled
  by the front-end), blocked (cannot run yet: `blocked_reason` says what data is missing).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from types import MappingProxyType
from typing import Dict, List, Mapping, Optional, Tuple

from .seed import slug
from .theme_map import SUBTHEMES as THEME_SUBS

REGISTRY_VERSION = 13      # 13: Top gainers; 12: the Chart patterns group (11 scans, both tabs); 11: fixes 9 to 14 (each input ranked once, every company that passes, Quality for lenders, FinLit IQ on Basic); 10: the Breakouts group on the version 2 rules (task #64); 9: sizes by rupee market cap, a Rs 1,000 Cr floor on every Advanced list, Sector themes on NSE industries, full ratings only by default on Rating upgrades; 7: the Setups group (pre-breakout; breakout then pulled back); 6: caps, tags and sector themes read the Sector LABEL (not the macro sector or the Industry); the two valuation views split at 50; the screens page by 25
DISCLAIMER = "A screen narrows a list. It is not a recommendation."
BANNED_WORDS = ("best", "buy", "multibagger", "sell", "top pick", "undervalued gem")   # in names and card text, never (spec p2: names describe, never advise)
MCAP1000 = ("market_cap >= 1000", "Market cap Rs 1,000 Cr or more")
RUN_GUARD = ("coalesce(ret_1y, 0) <= 300", "1-year return no more than 300%")   # a stock that has run far past that is not a steady leader: kept out of the Top 10 and momentum lists
LIQUIDITY_FLOOR_CR = 1000   # market cap, until the average-volume data is fixed (spec p2-3)


def _m(**kw) -> Mapping:
    return MappingProxyType(dict(kw))


@dataclass(frozen=True)
class Col:
    key: str
    label: str
    format: str = "text"      # text | num1 | pct | score | cr | label | badge
    align: str = "right"


@dataclass(frozen=True)
class Chip:
    id: str
    label: str
    description: str
    default: bool = False
    effect: Mapping = field(default_factory=lambda: _m())
    how: Tuple[str, ...] = ()


@dataclass(frozen=True)
class Preset:
    id: str
    name: str
    group: str
    card_text: str
    kind: str = "rules"
    prism_filters: Mapping = field(default_factory=lambda: _m())
    ql: str = ""
    derived: Tuple[Tuple[str, str], ...] = ()
    rank: Tuple[Tuple[str, str], ...] = ()
    limit: int = 25
    columns: Tuple[Col, ...] = ()
    chips: Tuple[Chip, ...] = ()
    how_it_works: Tuple[str, ...] = ()
    top10: bool = False
    blocked_reason: Optional[str] = None
    badges: Tuple[str, ...] = ("provisional",)
    spec: str = ""            # where in the spec pdf
    tab: str = "advanced"     # advanced (Gold: Prism fields) | basic (Silver: FinLit score fields)
    # a weighted rank score (redesign pdf, "Top 10"): ((field, weight), ...). Each input is turned into its percentile among the company's own size bucket
    # (the bucket's Prism-rated companies on the Advanced tab; the bucket's companies of Rs 1,000 Cr or more on the Basic tab); the score is 100 x the weighted sum.
    rank_score: Tuple[Tuple[str, float], ...] = ()
    sector_cap: int = 0       # at most this many companies from one Sector label in the list (0 = no cap)
    fill: Tuple[str, ...] = ()   # rule labels a company may fail and still fill a short list (badged "Trend not confirmed")
    list_text: str = ""       # what the card says about its list when it shows fewer than all that pass, e.g. "Top 10"

    @property
    def status(self) -> str:
        return "blocked" if self.kind == "blocked" else "live"


GROUPS: List[Tuple[str, str]] = [("top-rated", "Top rated"), ("trend", "Trend"), ("setups", "Breakouts"), ("chart-patterns", "Chart patterns"), ("top-gainers", "Top gainers"), ("growth", "Growth"), ("themes", "Themes"), ("value-income", "Value and income"),
                                 ("safety", "Safety"), ("ownership", "Ownership"), ("prism-basics", "Prism basics")]

# ------------------------------------------------------------------------------------------------------------------------------ columns
RANK = Col("rank", "#", "text", "right")
STOCK = Col("name", "Stock", "text", "left")
PRISM = Col("prism_final", "Prism score", "score")
PLABEL = Col("prism_label", "Prism rating", "label", "left")
PSTATUS = Col("prism_status", "Rating status", "badge", "left")
FUND = Col("prism_fundamental", "Growth & Profitability", "score")
VAL = Col("prism_valuation", "Valuation", "score")
QUAL = Col("prism_quality", "Quality", "score")
RISK = Col("prism_risk", "Risk", "score")
ST = Col("prism_st", "Short-term view", "label", "left")
LT = Col("prism_lt", "Long-term view", "label", "left")
STS = Col("prism_st_score", "Short-term view score", "score")
LTS = Col("prism_lt_score", "Long-term view score", "score")
R1Y = Col("ret_1y", "1-year return", "pct")
MCAP = Col("market_cap", "Market cap (Rs Cr)", "cr")
SECTOR = Col("sector", "Sector", "text", "left")
FINLIT = Col("overall", "FinLit IQ", "score")


R3M = Col("ret_3m", "3-month return", "pct")
R6M = Col("ret_6m", "6-month return", "pct")
W52 = Col("pct_from_high", "Below 52-week high", "pct")
RSC = Col("rank_score", "Rank score", "score")
SUBT = Col("sub_theme", "Sub-theme", "text", "left")
TOP_COLS = (RANK, STOCK, SECTOR, PRISM, PLABEL, FUND, VAL, QUAL, RISK, STS, LTS, R3M, R6M, R1Y, W52, MCAP, RSC)
# a Prism-rated stock shows its Rated / Provisional status as a badge on every screen but the Top-10 ones (which are Rated only)
with_status = lambda cols: tuple(cols) + (PSTATUS,)   # noqa: E731
VIEWS = (STS, LTS)

PROVISIONAL = Chip("include-provisional", "Include provisional", "Also lists companies with a Provisional Prism rating (a rating built on limited history), each with its badge.", False,
                   _m(prism_set={"status": None}), ("Provisional ratings are included, with a Provisional badge.",))
TURNING_UP = Chip("turning-up", "Turning up", "Keeps only names whose short-term technical view is 0 or more: the price has stopped falling.", False,
                  _m(derived_add=(("prism_st_score >= 0", "Short-term technical view 0 or more"),)), ("Turning up: the short-term technical view must be 0 or more.",))
ALL_CAPS = Chip("all-caps", "All caps", "Also lists small caps (the default is large and mid caps).", False, _m(derived_drop=("is_large_mid = 1",)), ("All caps: small caps are included.",))
FAST_G = Chip("fast-growers", "Fast growers", "Raises the Growth & Profitability cut-off from 75 to 85.", False, _m(prism_set={"zfmin": 85}), ("Fast growers: Prism Growth & Profitability 85 or more.",))
SHOW_ALL_THEME = Chip("show-all-theme", "Show all theme members", "Drops the Growth & Profitability and Risk gates: every theme member of Rs 1,000 Cr or more is listed.", False,
                      _m(derived_drop=("has_prism = 0 or (prism_fundamental >= 50 and prism_risk >= 40)",)), ("Every theme member of Rs 1,000 Cr or more is listed, whatever its Growth & Profitability and Risk.",))
SMALL_GROUPS = Chip("small-groups", "Include small groups", "Also lists sectors with 5 to 7 companies, which are too few to call a theme with the same confidence.", False,
                    _m(small_groups=True), ("Small groups (5 to 7 companies) are included.",))
SUB_CHIPS = tuple(Chip(slug(sub), sub, f"Only companies in {sub}. Pick several to see any of them.", False, _m(sub=sub), (f"Sub-theme: {sub}.",)) for sub in THEME_SUBS)

TOP_RANK = (("prism_final", 0.55), ("prism_lt_score", 0.40), ("prism_st_score", 0.05))      # fix 9: each input once (the Prism score already holds Valuation and Risk)
TOP_ORDER = (("rank_score", "desc"), ("prism_quality", "desc"), ("prism_final", "desc"), ("market_cap", "desc"))   # fix 12: exact ties go to the larger market cap


def _top(n: int, bucket: str, label: str) -> Preset:
    filters = {"cap": bucket, "rated": 1, "status": "RATED", "zmin": 65, "zqmin": 50, "zrmin": 50}      # fix 12: Healthy or Strong only; one Risk minimum for every size
    how = [f"Only {label} caps: companies ranked {'1 to 100' if bucket == 'Large' else '101 to 250' if bucket == 'Mid' else '251 onward'} by market cap, as the site buckets them.",
           "Only companies with a full Prism rating (Provisional ratings appear only with the Include provisional chip, with their badge). Market cap Rs 1,000 Cr or more.",
           "Healthy or Strong on Prism, with sound quality and risk, a firm long-term trend and a price not far below its 52-week high.",
           "The strongest ten come first, at most three from one Sector label, then every other company that passes, ranked by the same score.",
           "If fewer than 10 pass, the list is filled with the next names that fail only the trend or the 52-week gate, badged Trend not confirmed."]
    return Preset(f"highest-rated-{label}", f"Highest-rated {label} caps", "top-rated", f"{label.title()} caps with a strong Prism rating and a firm long-term trend. The 10 strongest come first, then every other company that passes.", "rules",
                  _m(**filters), "Below 52-week high <= 30", (("prism_lt_score > -20", "Long-term technical view above -20"), RUN_GUARD, MCAP1000), TOP_ORDER, 10, TOP_COLS, (PROVISIONAL,), tuple(how), True, None, ("provisional",),
                  f"p4 (Top 10, {label})", "advanced", TOP_RANK, 3, ("technical view", "52-week high"))


LT_ST_COLS = (STS, LTS)

PRESETS: List[Preset] = [
    _top(1, "Large", "large"),
    _top(2, "Mid", "mid"),
    _top(3, "Small", "small"),

    Preset("momentum-leaders", "Momentum leaders", "trend", "Rated stocks in an uptrend near their 52-week high, ranked by 3-, 6- and 12-month returns against the market.", "rules",
           _m(zmin=50, rated=1, lt=20),
           "Below 52-week high <= 15\n3-month return > 0\n6-month return > 0\nMarket cap >= 1000",
           (("prism_st_score >= 0", "Short-term technical view 0 or more"), RUN_GUARD),
           (("momentum_score", "desc"), ("prism_final", "desc")), 25,
           with_status((STOCK, Col("momentum_score", "Momentum score", "score"), R3M, R6M, R1Y, W52, STS, LTS, PRISM, SECTOR, MCAP)), (),
           ("Rated or provisional by Prism with a score of 50 or more.", "Long-term technical view +20 or more (price above its long-term average) and short-term view 0 or more (not stretched down).",
            "No more than 15% below its 52-week high; 3-month and 6-month returns both positive; 1-year return 300% or less; market cap Rs 1,000 Cr or more.",
            "Ranked by the momentum score: 100 x (0.3 x P3M + 0.4 x P6M + 0.3 x P12M), P being the percentile (0 to 1) of that period's return among stocks of Rs 1,000 Cr or more."),
           False, None, ("provisional",), "p10 (Momentum leaders)"),

    Preset("at-52-week-high", "Near a 52-week high", "trend", "Within 5% of the 52-week high with a positive short-term view.", "rules",
           _m(rated=1, zmin=50, st=20), "Below 52-week high <= 5", (), (("prism_st_score", "desc"), ("prism_final", "desc")), 25,
           with_status((STOCK, STS, LTS, W52, R3M, R6M, PRISM, SECTOR, MCAP)), (),
           ("Rated or provisional by Prism with a score of 50 or more.", "No more than 5% below the 52-week high.", "Short-term technical view +20 or more.", "Ranked by the short-term view."),
           False, None, ("provisional",), "p10 (At a 52-week high)"),

    Preset("both-views-positive", "Positive on both technical views", "trend", "Large and mid caps whose short-term and long-term technical views are both positive.", "rules",
           _m(rated=1, st=20, lt=20), "", (("is_large_mid = 1", "Large or mid cap"),), (("prism_final", "desc"),), 25,
           with_status((STOCK, PRISM, STS, LTS, ST, LT, R6M, W52, SECTOR, MCAP)), (ALL_CAPS,),
           ("Rated or provisional by Prism.", "Short-term and long-term technical views both +20 or more.", "Large and mid caps by default; the All caps chip adds small caps.", "Ranked by Prism score."),
           False, None, ("provisional",), "p10 (merged with F&O stocks)"),

    Preset("consistent-growers", "Consistent growers", "growth", "Companies with strong Growth & Profitability, quality and risk scores together.", "rules",
           _m(rated=1, zfmin=75, zqmin=60, zrmin=50), "", (), (("prism_fundamental", "desc"), ("prism_final", "desc")), 25,
           with_status((STOCK, FUND, QUAL, RISK, PRISM, STS, LTS, R6M, SECTOR, MCAP)), (FAST_G,),
           ("Prism Growth & Profitability 75 or more, Quality 60 or more, Risk 50 or more.", "Ranked by Growth & Profitability. The Fast growers chip raises the cut-off to 85."),
           False, None, ("provisional",), "p11 (Consistent growers)"),

    Preset("emerging-tech", "Emerging tech", "themes", "Companies in new-technology businesses (electronics, defence and shipbuilding, software and data, digital platforms, fintech, EVs, clean energy), still growing.",
           "tags", _m(), "Market cap >= 1000",
           (("has_prism = 0 or (prism_fundamental >= 50 and prism_risk >= 40)", "Rated: Growth & Profitability 50 or more and Risk 40 or more"),),
           (("has_prism", "desc"), ("rank_score", "desc")), 25,
           with_status((STOCK, SUBT, PRISM, FUND, RISK, STS, LTS, R6M, W52, SECTOR, MCAP)), (SHOW_ALL_THEME,) + SUB_CHIPS,
           ("Companies in a sub-theme: every company whose Sector label belongs to it (for example Aerospace & Defense, Ship Building, Explosives, Consumer Electronics, E-Retail, Exchange and Data Platform) joined with a short named list that the research team reviews every quarter. The sub-theme is shown as a column.",
            "Market cap Rs 1,000 Cr or more.", "Rated or Provisional by Prism: Growth & Profitability 50 or more (still growing) and Risk 40 or more. No trend gate: the two technical views are shown as columns.",
            "Ranked by the same weighted score as the Top 10 lists. Companies Prism has not rated yet are listed below, by market cap, with no score."),
           False, None, ("provisional", "unrated"), "p6-9 (Emerging tech)", "advanced", TOP_RANK),

    Preset("sector-themes", "Sector themes in play", "themes", "Sectors where more stocks sit near their 52-week high than in the market as a whole, and the companies leading them.", "themes",
           _m(), "", (), (("has_prism", "desc"), ("prism_final", "desc"), ("overall", "desc")), 25,
           with_status((STOCK, SECTOR, PRISM, STS, LTS, R3M, Col("vs_industry_3m", "3-month return against the sector median (points)", "num1"), W52, MCAP)), (SMALL_GROUPS,),
           ("Every night each sector (by its Sector label) is scored on breadth, the share of its stocks within 15% of their 52-week high, and its median 3-month return against the whole market; stocks of Rs 1,000 Cr or more.",
            "In play: breadth at least 40% and 15 points above the market's, and median 3-month return at least 5 points above the market's.",
            "Leaders (up to 5 per sector): market cap Rs 1,000 Cr or more, within 15% of their 52-week high, 3-month return above the sector median; rated companies first by Prism score, then unrated by FinLit IQ.",
            "Generic labels (Capital Goods, Financial Services, Services, FMCG, Healthcare, Information Technology) and groups under 8 companies are left out of theme status.",
            "With fewer than 3 sectors in play, the 3 with the highest relative 3-month return among those with breadth above the market are shown as Closest to qualifying."),
           False, None, ("provisional",), "p12 (Sector themes in play)"),

    Preset("quality-fair-price", "Quality at a fair price", "value-income", "Strong quality and growth & profitability without a stretched valuation.", "rules",
           _m(rated=1, zqmin=70, zfmin=60, zvmin=60), "", (), (("prism_final", "desc"), ("prism_quality", "desc")), 25,
           with_status((STOCK, PRISM, QUAL, FUND, VAL, RISK, STS, LTS, R6M, SECTOR, MCAP)), (),
           ("Prism Quality 70 or more, Growth & Profitability 60 or more, Valuation 60 or more.", "Ranked by Prism score."), False, None, ("provisional",), "p12 (Quality at a fair price)"),

    Preset("quality-off-highs", "Quality off its highs", "value-income", "High quality, 25%+ below the 52-week high.", "rules",
           _m(rated=1, zqmin=75, zfmin=65, zrmin=50), "Below 52-week high >= 25", (), (("prism_final", "desc"), ("prism_quality", "desc")), 25,
           with_status((STOCK, PRISM, QUAL, FUND, RISK, STS, LTS, W52, R6M, SECTOR, MCAP)), (TURNING_UP,),
           ("Prism Quality 75 or more, Growth & Profitability 65 or more, Risk 50 or more.", "At least 25% below the 52-week high.", "Both technical views are shown; the Turning up chip keeps names whose short-term view is 0 or more.", "Ranked by Prism score."),
           False, None, ("provisional",), "p12 (Quality off its highs)"),

    Preset("value-with-quality", "Value with quality", "value-income", "Cheaper-valued companies that also score well on quality, risk and growth & profitability.", "rules",
           _m(rated=1, zvmin=75, zqmin=60, zrmin=60, zfmin=50), "", (), (("prism_valuation", "desc"), ("prism_final", "desc")), 25,
           with_status((STOCK, VAL, QUAL, RISK, FUND, PRISM, STS, LTS, R6M, SECTOR, MCAP)), (),
           ("Prism Valuation 75 or more, Quality 60 or more, Risk 60 or more, Growth & Profitability 50 or more.", "Ranked by Valuation, highest first (a higher Valuation score means cheaper)."),
           False, None, ("provisional",), "p13 (Value with quality)"),

    Preset("low-risk-compounders", "Low-risk compounders", "safety", "Companies that score high on risk, quality and growth & profitability together.", "rules",
           _m(rated=1, zrmin=80, zqmin=75, zfmin=65), "", (), (("prism_final", "desc"),), 25,
           with_status((STOCK, PRISM, RISK, QUAL, FUND, STS, LTS, R6M, SECTOR, MCAP)), (),
           ("Prism Risk 80 or more (a higher Risk score means lower risk), Quality 75 or more, Growth & Profitability 65 or more.", "Ranked by Prism score."),
           False, None, ("provisional",), "p13 (Low-risk compounders)"),

    Preset("low-volatility", "Low-volatility names", "safety", "Low risk score and a narrow 52-week range.", "rules", _m(rated=1, zrmin=80, zmin=60), "", (("high_over_low <= 35", "52-week high no more than 35% above the 52-week low"),),
           (("prism_risk", "desc"), ("prism_final", "desc")), 25, with_status((STOCK, RISK, Col("high_over_low", "52-week high above the low", "pct"), PRISM, QUAL, STS, LTS, R6M, SECTOR, MCAP)), (),
           ("Prism Risk 80 or more and Prism score 60 or more.", "The 52-week high is no more than 35% above the 52-week low.", "Ranked by the Prism Risk part."), False, None, ("provisional",), "p13 (Low-volatility names)"),

    Preset("higher-risk-list", "Higher-risk list", "safety", "Companies with more warning signs than usual. Read the company page before acting.", "rules",
           _m(rated=1), "", (("prism_risk < 40 or prism_final < 35 or (pct_from_high >= 40 and prism_lt_score <= -50)", "Risk below 40, or Prism below 35, or 40% or more below the high with a long-term view of -50 or lower"),),
           (("prism_risk", "asc"), ("prism_final", "asc")), 25, with_status((STOCK, RISK, PRISM, PLABEL, W52, LTS, R6M, SECTOR, MCAP)), (),
           ("Rated or provisional by Prism.", "Prism Risk below 40, or Prism score below 35, or 40% or more below the 52-week high with a long-term technical view of -50 or lower.", "Ranked by the Risk part, lowest first. This is a caution list, not a recommendation."),
           False, None, ("provisional",), "p14 (Higher-risk list)"),

    # ---- not built: the data does not exist yet. Listed so the cards can say so in plain words, never computed.
    Preset("rating-upgrades", "Rating upgrades", "top-rated", "Companies whose Prism rating moved up a band, or whose score rose 8 points or more, over the last 30 days.", "rules",
           _m(rated=1, status="RATED"), "", (("prism_band_up = 1 or prism_rise_30d >= 8", "Prism rating up a band, or score up 8 points or more"),), (("prism_rise_30d", "desc"), ("prism_final", "desc")), 25,
           with_status((STOCK, SECTOR, PRISM, PLABEL, Col("prism_rise_30d", "Score change", "num1"), MCAP)), (PROVISIONAL,),
           ("Only companies with a full Prism rating, compared over the last 30 days of the site's own daily Prism history. The Include provisional chip adds the provisional ones, badged.",
            "Listed when the rating moved up a band (Poor under 35, Weak 35 to 49, Average 50 to 64, Healthy 65 to 79, Strong 80 or more) or the score rose 8 points or more.",
            "Ranked by the size of the rise. A company with fewer than two days of history is left out; while the history is shorter than 30 days the card says how many days it covers."),
           False, None, ("provisional",), "p9 (Rating upgrades)", "advanced"),
    Preset("psu-stocks", "PSU stocks", "ownership", "Public-sector companies with a Prism score of 55 or more, ranked by Prism score.", "blocked",
           blocked_reason="Needs a maintained list of public-sector companies; coming once that list is shown as a column.", spec="p14"),
]

# ------------------------------------------------------------------------------------------------------------------------------ Setups (task #37, both tabs)
# Rules of the design package's 3_screeners/setup-scans (setupScans.js, "full" rules: they run on the nightly price fields of screener/price_fields.py).
# The page shows what a card finds and why, never how it ranks: the rank score stays on the server.
S_HIGH = Col("pct_from_high", "Below 52-week high (%)", "num1")
S_DSH = Col("days_since_high", "Sessions since the high", "num1")
S_R10 = Col("range_10d", "10-session range (%)", "num1")
S_ATR = Col("atr_ratio", "Volatility against the longer run", "num1")
S_V10 = Col("vol_ratio_10_50", "Volume, last 10 against 50 sessions", "num1")
S_RSI = Col("rsi14", "RSI (14 days)", "num1")
S_BAGE = Col("breakout_age", "Sessions since the breakout", "num1")
S_BLEV = Col("breakout_level", "Breakout level (Rs)", "num1")
S_VSB = Col("vs_breakout", "Against the breakout level (%)", "num1")
S_BVOL = Col("breakout_vol_ratio", "Volume on the breakout day", "num1")
S_E20 = Col("vs_ema20", "Against the 20-day average (%)", "num1")
S_UP = ("vs_ema50 > 0 and vs_ema200 > 0 and vs_ema200 > vs_ema50", "Price above its 50- and 200-day averages, with the 50-day above the 200-day")
S_FLAGS = ("coalesce(flag_count, 0) <= 2", "At most 2 red flags (a blank counts as none)")
S_NOTE = "A screen narrows a list. It is not a recommendation."


def _between(field: str, lo: float, hi: float, label: str) -> Tuple[str, str]:
    return (f"{field} >= {lo:g} and {field} <= {hi:g}", label)


VOLUME_TESTS = False   # fix 8 of the handover: the daily volume is rebuilt from NSE's bhavcopy first; until then the two volume tests (breakout day, value traded) stay off
FULL_YEAR = ("missing(ret_1y) = 0", "A full year of prices")
S_B2AGE = Col("b2_age", "Sessions since the breakout", "num1")
S_B2LEV = Col("b2_level", "Breakout level (Rs)", "num1")
S_B2VS = Col("b2_vs_level", "Against the breakout level (%)", "num1")
S_B2PULL = Col("b2_pullback", "Below the highest close since (%)", "num1")
S_B2VOL = Col("b2_vol_x", "Volume on the breakout day", "num1")
S_V9 = Col("vs_ema9", "Against the 9-day average (%)", "num1")
S_R4 = Col("range_4d", "4-session range (%)", "num1")
S_TURN = Col("turnover20_cr", "Value traded a day, 20-session average (Rs Cr)", "num1")
PB_RULES = (FULL_YEAR, S_UP, _between("pct_from_high", 1.5, 8, "1.5% to 8% below the 52-week high"), ("days_since_high >= 15", "The 52-week closing high is at least 15 sessions old: a base of three weeks or more"),
            ("range_10d <= 10", "The last 10 sessions moved within a 10% range"), ("atr_ratio < 1.1", "Price swings are not widening (10-day against 50-day range under 1.1)"),
            _between("rsi14", 45, 68, "RSI between 45 and 68"))
BR_RULES = (FULL_YEAR, ("vs_ema50 > 0", "Price above its 50-day average"), _between("b2_age", 3, 25, "Broke above a 52-week closing high 3 to 25 sessions ago (an old high at least 10 sessions old)"),
            _between("b2_pullback", 2, 12, "2% to 12% below the highest close since the breakout"), _between("b2_vs_level", -3, 6, "Back within 3% below to 6% above the level it broke"),
            _between("vs_ema20", -4, 4, "Within 4% of its 20-day average"), _between("rsi14", 40, 65, "RSI between 40 and 65")) \
           + ((("b2_vol_x >= 1.3", "The breakout came on volume (1.3 times the usual or more)"),) if VOLUME_TESTS else ())
E9_RULES = (FULL_YEAR, ("vs_ema50 > 0 and ema_stack = 1", "In an uptrend: price above the 50-day average, with the 9-day above the 20-day above the 50-day"),
            ("ema9_above4 = 1", "The last four closes were each above the 9-day average"), ("vs_ema9 <= 3 and ema9_near4 = 1", "Within 3% of the 9-day average now, and never more than 4% above it in the last four sessions"),
            ("ema9_touch4 = 1", "Touched the 9-day average in the last four sessions"), ("range_4d <= 6", "The last four sessions moved within a 6% range")) \
           + ((("turnover20_cr >= 1", "At least Rs 1 Cr traded a day on average"),) if VOLUME_TESTS else ())
SETUP_BLOCK = "Needs the 9-day average signal, which the nightly price job does not store yet; turns on once it does."

SETUPS_ADV: List[Preset] = [
    Preset("setup-pre-breakout", "Pre-breakout", "setups", "Stocks in an uptrend resting just under their 52-week high, with price swings no wider than before.", "rules", _m(rated=1), "",
           PB_RULES + (MCAP1000, ("prism_st_score >= 20", "Short-term technical view +20 or more"), ("prism_lt_score >= 20", "Long-term technical view +20 or more")),
           (("rank_score", "desc"), ("prism_lt_score", "desc")), 25, with_status((STOCK, S_HIGH, S_DSH, S_R10, S_ATR, S_V10, S_RSI, STS, LTS, PRISM, SECTOR, MCAP)), (),
           ("Rated or provisional by Prism (a Provisional rating is badged); a full year of prices; market cap Rs 1,000 Cr or more.", "In an uptrend: price above its 50- and 200-day averages, with the 50-day above the 200-day.",
            "Resting under the high: 1.5% to 8% below the 52-week high, a closing high at least 15 sessions old.",
            "Quiet: a 10-session range of 10% or less, price swings not widening, RSI between 45 and 68, and both technical views at +20 or more.", S_NOTE),
           False, None, ("provisional",), "setup scans", "advanced", (("-pct_from_high", 0.4), ("-range_10d", 0.3), ("prism_lt_score", 0.3))),
    Preset("setup-breakout-pullback", "Breakout, then pulled back", "setups", "Stocks that broke above their 52-week high in the last five weeks and have eased back towards that level.", "rules", _m(rated=1), "",
           BR_RULES + (MCAP1000, ("prism_lt_score >= 20", "Long-term technical view +20 or more")),
           (("rank_score", "desc"), ("prism_lt_score", "desc")), 25, with_status((STOCK, S_B2AGE, S_B2LEV, S_B2VS, S_B2PULL, S_B2VOL, S_E20, S_RSI, LTS, PRISM, SECTOR, MCAP)), (),
           ("Rated or provisional by Prism (a Provisional rating is badged); a full year of prices; market cap Rs 1,000 Cr or more; price above its 50-day average.",
            "A recent breakout: the close rose above a 52-week closing high that was at least 10 sessions old, 3 to 25 sessions ago.",
            "Now pulled back: 2% to 12% below the highest close since, back near the level it broke and its 20-day average, RSI between 40 and 65, and a long-term technical view of +20 or more.", S_NOTE),
           False, None, ("provisional",), "setup scans", "advanced", (("-abs_b2_level", 0.4), ("prism_lt_score", 0.6))),
    Preset("setup-ema9-consolidation", "Consolidating above the 9 EMA", "setups", "Stocks in an uptrend, holding a tight range just above their 9-day average.", "rules", _m(rated=1), "",
           E9_RULES + (MCAP1000, ("prism_st_score >= 20", "Short-term technical view +20 or more")),
           (("rank_score", "desc"), ("prism_st_score", "desc")), 25, with_status((STOCK, S_V9, S_R4, S_TURN, S_E20, S_RSI, STS, LTS, PRISM, SECTOR, MCAP)), (),
           ("Rated or provisional by Prism (a Provisional rating is badged); a full year of prices; market cap Rs 1,000 Cr or more.", "In an uptrend: price above its 50-day average, with the 9-day above the 20-day above the 50-day.",
            "Holding just above the 9-day average: four closes above it, within 3% of it now, a touch of it in the last four sessions, and a range of 6% or less.", S_NOTE),
           False, None, ("provisional",), "setup scans", "advanced", (("-range_4d", 0.5), ("prism_st_score", 0.5))),
]
# ------------------------------------------------------------------------------------------------------------------------------ Chart patterns (task #64, both tabs)
# Eleven scans on daily candles, run nightly (presets/patterns.py). The rules live only in finlit/pattern_scans.py; the page shows what a scan found, in words.
from .patterns import FACT_LABELS as _FACTS, NAMES as _PNAMES, SCAN_IDS as _SCANS, TEXTS as _PTEXTS   # noqa: E402


def _pcols(scan: str) -> Tuple[Col, ...]:
    return tuple(Col(f"pf{j}", lab, "text", "left") for j, lab in enumerate(_FACTS[scan], 1) if lab)


PATTERNS_ADV: List[Preset] = [
    Preset(f"pattern-{k}", _PNAMES[k], "chart-patterns", _PTEXTS[k], "pattern", _m(), "", (), (("prism_final", "desc"),), 25,
           with_status((STOCK, PRISM, STS, LTS) + _pcols(k) + (SECTOR, MCAP)), (), (), False, None, ("provisional",), k, "advanced")
    for k in _SCANS]
PRESETS = PRESETS[:-2] + SETUPS_ADV + PATTERNS_ADV + PRESETS[-2:]

# the page's existing four quick views (frontend/src/lib/scoreScreen.ts, PRISM_PRESETS): listed under "Prism basics", handled by the page itself
QUICK_VIEWS: List[Preset] = [
    Preset("strongsafe", "Prism strong and lower risk", "prism-basics", "A Prism score of 80 or more (Strong) and Prism Risk 65 or more (a higher Risk score means lower risk).", "quickview", _m(zmin=80, zrmin=65, rated=1)),
    Preset("fairvalue", "Strong Growth & Profitability at a fair valuation", "prism-basics", "Prism Growth & Profitability 65 or more and Prism Valuation 50 or more.", "quickview", _m(zfmin=65, zvmin=50, rated=1)),
    Preset("weakvalue", "Growth & Profitability strong but valuation weak", "prism-basics", "Prism Growth & Profitability 65 or more but Prism Valuation below 50.", "quickview", _m(zfmin=65, zvbelow=50, rated=1)),
]


# ------------------------------------------------------------------------------------------------------------------------------ the Basic tab (Silver)
# Built only from what the Basic score screener shows: the FinLit IQ, its pillars (Quality, Growth, Profitability, Balance sheet, Technical), the Growth & Profitability
# score (the average of the four business pillars, needs 3 of 4), market cap, Sector, 52-week and return fields. Every rule is a "derived" rule with a plain-words label.
BASIC_GROUP = {"top": "top-rated", "trend": "trend", "setups": "setups", "patterns": "chart-patterns", "gainers": "top-gainers", "growth": "growth", "themes": "themes", "value": "value-income", "safety": "safety"}
B_TECH = Col("pillar_technical", "Technical", "score")
B_QUAL = Col("pillar_quality", "Quality", "score")
B_GROW = Col("pillar_growth", "Growth", "score")
B_PROF = Col("pillar_profitability", "Profitability", "score")
B_BAL = Col("pillar_balance", "Balance sheet", "score")
B_MOM = Col("momentum_score", "Momentum score", "score")
B_PB = Col("profit_plus_balance", "Profitability + Balance sheet", "score")
B_BASE = (RANK, STOCK, FINLIT, B_TECH)
B_TAIL = (R3M, R6M, R1Y, W52, SECTOR, MCAP)
B_RANK_SCORE = (("overall", 1.0),)                                              # fix 13: FinLit IQ itself; it counts each of its five scores once
B_TOP_ORDER = (("rank_score", "desc"), ("pillar_technical", "desc"), ("market_cap", "desc"))   # ties: Technical, then the larger market cap
B_FULL = (("missing(ret_1y) = 0", "A full year of prices"), RUN_GUARD)           # fix 14: every screen that reads the price needs a full year and a 1-year return of 300% or less
Q_FIT = lambda n, w: (f"quality_fit >= {n}", f"Quality {w} (a bank or finance company against other lenders)")   # noqa: E731
IQ_HEALTHY = ("overall >= 62", "FinLit IQ Healthy or Strong")
IQ_STRONG = ("overall >= 78", "FinLit IQ Strong")
MC1000 = ("market_cap >= 1000", "Market cap Rs 1,000 Cr or more")
MC2000 = ("market_cap >= 2000", "Market cap Rs 2,000 Cr or more")
B_NOTE = "A company with a blank score drops out of any rule that uses that score."


def _bal(minimum: int, blank: str = "any") -> Tuple[str, str]:
    """Balance sheet at `minimum` or more; a blank is allowed (blank = any company) or only for banks (blank = bank)."""
    if blank == "bank":
        return (f"pillar_balance >= {minimum} or (coalesce(pillar_balance, -1) = -1 and is_bank = 1)", f"Balance sheet {minimum} or more (blank allowed for banks)")
    return (f"coalesce(pillar_balance, 100) >= {minimum}", f"Balance sheet {minimum} or more (blank allowed)")


def _bt(bucket: str, label: str) -> Preset:
    small = bucket == "Small"
    rules = (IQ_HEALTHY, ("pillar_technical >= 45", "Technical out of Watch"), Q_FIT(45, "out of Watch"), _bal(62 if small else 45, "bank"), ("pct_from_high <= 30", "No more than 30% below the 52-week high"),
             MC1000) + B_FULL
    how = (f"Only {label} caps: companies ranked {'1 to 100' if bucket == 'Large' else '101 to 250' if bucket == 'Mid' else '251 onward'} by market cap, as the site buckets them. Market cap Rs 1,000 Cr or more.",
           "FinLit IQ Healthy or Strong, Technical and Quality out of Watch, a Balance sheet " + ("Healthy" if small else "out of Watch") + " (a blank is allowed for banks), no more than 30% below the 52-week high and a full year of prices.",
           f"The {label} caps with the highest FinLit IQ come first, at most three from one Sector label, then every other company that passes, in FinLit IQ order.", B_NOTE)
    return Preset(f"basic-top-{label}", f"Top 10 {label} caps", BASIC_GROUP["top"], f"{label.title()} caps with a strong FinLit IQ. The 10 highest come first, then every other company that passes.", "rules",
                  _m(cap=bucket), "", rules, B_TOP_ORDER, 10, B_BASE + (B_QUAL, B_BAL, R3M, R6M, W52, SECTOR, MCAP), (), how, True, None, (), f"p5 (Top 10, {label}, Basic)", "basic", B_RANK_SCORE, 3)


def _bp(pid, name, group, text, rules, rank, cols, how, **kw) -> Preset:
    return Preset(pid, name, BASIC_GROUP[group], text, "rules", _m(), "", tuple(rules), tuple(rank), 25, tuple(cols), (), tuple(how) + (B_NOTE,), False, None, (), kw.pop("spec", "p15-17"), "basic", **kw)


B_THEME_RULES = (MC1000, ("pillar_growth >= 62", "Growth Healthy or Strong"), _bal(45))
BASIC: List[Preset] = [
    _bt("Large", "large"), _bt("Mid", "mid"), _bt("Small", "small"),
    _bp("basic-strong-both", "Strong on both", "top", "FinLit IQ and Technical both Strong.",
        (IQ_STRONG, ("pillar_technical >= 78", "Technical Strong"), MC1000) + B_FULL, (("overall", "desc"),),
        B_BASE + B_TAIL, ("FinLit IQ Strong and Technical Strong, with a full year of prices.", "Market cap Rs 1,000 Cr or more.", "Ranked by FinLit IQ.")),
    _bp("basic-strong-business-lagging", "Strong business, price lagging", "value", "Quality, Growth, Profitability and Balance sheet all Healthy or Strong while the Technical score is in Watch.",
        (Q_FIT(62, "Healthy or Strong"), ("pillar_growth >= 62", "Growth Healthy or Strong"), ("pillar_profitability >= 62", "Profitability Healthy or Strong"), _bal(62, "bank"),
         ("pillar_technical < 45", "Technical in Watch"), MC1000) + B_FULL, (("overall", "desc"),),
        (RANK, STOCK, FINLIT, B_QUAL, B_GROW, B_PROF, B_BAL, B_TECH, W52, R3M, R6M, R1Y, SECTOR, MCAP),
        ("The four business scores Healthy or Strong and Technical in Watch: a strong business whose price has not followed.", "Market cap Rs 1,000 Cr or more; a full year of prices.", "Ranked by FinLit IQ; the % below the 52-week high is shown.")),
    _bp("basic-strong-trend-weaker-business", "Strong trend, weaker business", "safety", "A caution view: Technical Strong while two or more of the four business scores are in Watch.",
        (("pillar_technical >= 78", "Technical Strong"), ("business_watch >= 2", "Two or more business scores in Watch"), MC1000) + B_FULL, (("pillar_technical", "desc"), ("overall", "desc")),
        (RANK, STOCK, B_TECH, B_QUAL, B_GROW, B_PROF, B_BAL, FINLIT, W52, R3M, R6M, R1Y, SECTOR, MCAP),
        ("Technical Strong and two or more of Quality, Growth, Profitability and Balance sheet in Watch: the price is strong but the business scores are weak. This is a caution view, not a signal.", "Market cap Rs 1,000 Cr or more; a full year of prices.", "Ranked by Technical.")),
    _bp("basic-strong-all-four", "Strong on all four pillars", "top", "Quality, Growth, Profitability and Balance sheet all Strong. Banks and finance companies are judged on their other scores.",
        (Q_FIT(78, "Strong"), ("pillar_growth >= 78", "Growth Strong"), ("pillar_profitability >= 78", "Profitability Strong"), _bal(78, "bank"), MC1000),
        (("overall", "desc"),), (RANK, STOCK, FINLIT, B_QUAL, B_GROW, B_PROF, B_BAL, B_TECH, W52, SECTOR, MCAP),
        ("Quality, Growth, Profitability and Balance sheet all Strong. A bank or finance company has no Balance sheet score, so it is judged on the other three, with Quality against other lenders.", "Market cap Rs 1,000 Cr or more.", "Ranked by FinLit IQ.")),
    _bp("basic-growth-leaders", "Growth leaders", "growth", "High growth with real profitability, a sound balance sheet and a price that is not falling apart.",
        (("pillar_growth >= 78", "Growth Strong"), ("pillar_profitability >= 62", "Profitability Healthy or Strong"), _bal(45), ("pillar_technical >= 45", "Technical out of Watch"), MC1000) + B_FULL,
        (("pillar_growth", "desc"), ("overall", "desc")), (RANK, STOCK, B_GROW, B_PROF, B_BAL, B_TECH, FINLIT, R6M, W52, SECTOR, MCAP),
        ("Growth Strong, Profitability Healthy or Strong, Balance sheet and Technical out of Watch (a blank Balance sheet is allowed), and a full year of prices.", "Market cap Rs 1,000 Cr or more.", "Ranked by Growth, then FinLit IQ.")),
    _bp("basic-profitable-debt-light", "Profitable and debt-light", "safety", "Profitability and Balance sheet both Strong. Not for banks and finance companies, which have no Balance sheet score.",
        (("pillar_profitability >= 78", "Profitability Strong"), ("pillar_balance >= 78", "Balance sheet Strong"), MC1000), (("overall", "desc"),),
        (RANK, STOCK, FINLIT, B_PROF, B_BAL, B_TECH, W52, SECTOR, MCAP),
        ("Profitability Strong and Balance sheet Strong.", "Market cap Rs 1,000 Cr or more.", "Ranked by FinLit IQ.")),
    _bp("basic-quality-compounders", "Quality compounders", "growth", "Top Quality with healthy growth, profitability and balance sheet.",
        (Q_FIT(78, "Strong"), ("pillar_growth >= 62", "Growth Healthy or Strong"), ("pillar_profitability >= 62", "Profitability Healthy or Strong"), _bal(62), MC1000),
        (("overall", "desc"),), (RANK, STOCK, B_QUAL, B_GROW, B_PROF, B_BAL, FINLIT, B_TECH, SECTOR, MCAP),
        ("Quality Strong (a bank or finance company against other lenders); Growth, Profitability and Balance sheet Healthy or Strong (a blank Balance sheet is allowed).", "Market cap Rs 1,000 Cr or more.", "Ranked by FinLit IQ.")),
    _bp("basic-momentum-leaders", "Momentum leaders", "trend", "Strong Technical score, within 15% of the 52-week high, with 3- and 6-month returns up.",
        (("pillar_technical >= 78", "Technical Strong"), IQ_HEALTHY, ("pct_from_high <= 15", "No more than 15% below the 52-week high"),
         ("ret_3m > 0", "3-month return above 0"), ("ret_6m > 0", "6-month return above 0"), MC2000) + B_FULL, (("momentum_score", "desc"), ("pillar_technical", "desc")),
        (RANK, STOCK, B_MOM, R3M, R6M, R1Y, W52, B_TECH, FINLIT, SECTOR, MCAP),
        ("Technical Strong, FinLit IQ Healthy or Strong, no more than 15% below the 52-week high, 3-month and 6-month returns both positive, a full year of prices.", "Market cap Rs 2,000 Cr or more (the fastest movers below that are thinly traded).",
         "Ranked by the momentum score: 3-, 6- and 12-month returns against stocks of Rs 1,000 Cr or more.")),
    _bp("basic-near-high", "Near 52-week high", "trend", "Within 5% of the 52-week high with a FinLit IQ that is Healthy or Strong.",
        (("pct_from_high <= 5", "No more than 5% below the 52-week high"), IQ_HEALTHY, MC2000) + B_FULL,
        (("pillar_technical", "desc"), ("momentum_score", "desc")), (RANK, STOCK, W52, B_TECH, B_MOM, FINLIT, R3M, R6M, SECTOR, MCAP),
        ("No more than 5% below the 52-week high, FinLit IQ Healthy or Strong, and a full year of prices.", "Market cap Rs 2,000 Cr or more.", "Ranked by Technical, then momentum score.")),
    _bp("basic-quality-off-highs", "Quality off its highs", "value", "The Quality compounders that are 25% or more below the 52-week high.",
        (Q_FIT(78, "Strong"), ("pillar_growth >= 62", "Growth Healthy or Strong"), ("pillar_profitability >= 62", "Profitability Healthy or Strong"), _bal(62), ("pct_from_high >= 25", "At least 25% below the 52-week high"), MC1000) + B_FULL,
        (("overall", "desc"),), (RANK, STOCK, B_QUAL, B_GROW, B_PROF, B_BAL, W52, B_TECH, FINLIT, R6M, SECTOR, MCAP),
        ("Quality Strong; Growth, Profitability and Balance sheet Healthy or Strong; at least 25% below the 52-week high; a full year of prices.", "Market cap Rs 1,000 Cr or more.", "Ranked by FinLit IQ.")),
    Preset("basic-emerging-tech", "Emerging tech", BASIC_GROUP["themes"], "Companies in new-technology businesses (electronics, defence and shipbuilding, software and data, digital platforms, fintech, EVs, clean energy), still growing.",
           "tags", _m(), "", B_THEME_RULES, (("rank_score", "desc"), ("overall", "desc")), 25,
           (RANK, STOCK, SUBT, FINLIT, B_TECH, B_GROW, B_BAL, R6M, W52, SECTOR, MCAP), SUB_CHIPS,
           ("Companies in a sub-theme: every company whose Sector label belongs to it (for example Aerospace & Defense, Ship Building, Explosives, Consumer Electronics, E-Retail, Exchange and Data Platform) joined with a short named list that the research team reviews every quarter. The sub-theme is shown as a column.",
            "Market cap Rs 1,000 Cr or more, Growth Healthy or Strong, Balance sheet out of Watch (a blank is allowed).",
            "Ranked by FinLit IQ.", B_NOTE),
           False, None, (), "p6-9 (Emerging tech, Basic)", "basic", B_RANK_SCORE),
    Preset("basic-sector-themes", "Sector themes in play", BASIC_GROUP["themes"], "Sectors where more stocks sit near their 52-week high than in the market as a whole, and the companies leading them.", "themes",
           _m(), "", (), (("rank_score", "desc"), ("overall", "desc")), 25, (RANK, STOCK, SECTOR, FINLIT, B_TECH, R3M, Col("vs_industry_3m", "3-month return against the sector median (points)", "num1"), W52, MCAP),
           (SMALL_GROUPS,),
           ("Every night each sector (by its Sector label) is scored on breadth, the share of its stocks within 15% of their 52-week high, and its median 3-month return against the whole market; stocks of Rs 1,000 Cr or more.",
            "In play: breadth at least 40% and 15 points above the market's, and median 3-month return at least 5 points above the market's.",
            "Leaders (up to 5 per sector): market cap Rs 1,000 Cr or more, within 15% of their 52-week high, 3-month return above the sector median; ranked by FinLit IQ.",
            "Generic labels (Capital Goods, Financial Services, Services, FMCG, Healthcare, Information Technology) and groups under 8 companies are left out of theme status."),
           False, None, (), "p12 (Sector themes, Basic)", "basic", B_RANK_SCORE),
    _bp("basic-caution-list", "Caution list", "safety", "Companies with more warning signs than usual. Read the company page before acting.",
        (("overall < 45 or balance_weak_ex = 1 or (pct_from_high >= 40 and pillar_technical <= 25)", "FinLit IQ below 45, or Balance sheet below 35 (not for insurers and brokers), or 40% or more below the high with Technical 25 or less"), MC1000),
        (("overall", "asc"),), (RANK, STOCK, FINLIT, B_BAL, B_TECH, W52, R6M, SECTOR, MCAP),
        ("FinLit IQ below 45 (Watch), or Balance sheet below 35 (not tested for insurers and capital-markets companies), or 40% or more below the 52-week high with Technical 25 or less.", "Market cap Rs 1,000 Cr or more.", "Ranked by FinLit IQ, lowest first. This is a caution list, not a recommendation.")),
]

BASIC += [
    Preset("basic-setup-pre-breakout", "Pre-breakout", BASIC_GROUP["setups"], "Stocks in an uptrend resting just under their 52-week high, with price swings no wider than before.", "rules", _m(), "",
           (MC2000,) + PB_RULES + (("pillar_technical >= 60", "Technical 60 or more"),), (("rank_score", "desc"), ("pillar_technical", "desc")), 25,
           (RANK, STOCK, S_HIGH, S_DSH, S_R10, S_ATR, S_V10, S_RSI, B_TECH, FINLIT, SECTOR, MCAP), (),
           ("Market cap Rs 2,000 Cr or more; a full year of prices; in an uptrend: price above its 50- and 200-day averages, with the 50-day above the 200-day.",
            "Resting under the high: 1.5% to 8% below the 52-week high, a closing high at least 15 sessions old.",
            "Quiet: a 10-session range of 10% or less, price swings not widening, RSI between 45 and 68, and a Technical score of 60 or more.", S_NOTE, B_NOTE),
           False, None, (), "setup scans", "basic", (("-pct_from_high", 0.4), ("-range_10d", 0.3), ("pillar_technical", 0.3))),
    Preset("basic-setup-breakout-pullback", "Breakout, then pulled back", BASIC_GROUP["setups"], "Stocks that broke above their 52-week high in the last five weeks and have eased back towards that level.", "rules", _m(), "",
           (MC2000,) + BR_RULES + (("pillar_technical >= 55", "Technical 55 or more"),), (("rank_score", "desc"), ("pillar_technical", "desc")), 25,
           (RANK, STOCK, S_B2AGE, S_B2LEV, S_B2VS, S_B2PULL, S_B2VOL, S_E20, S_RSI, B_TECH, FINLIT, SECTOR, MCAP), (),
           ("Market cap Rs 2,000 Cr or more; a full year of prices; price above its 50-day average.",
            "A recent breakout: the close rose above a 52-week closing high that was at least 10 sessions old, 3 to 25 sessions ago.",
            "Now pulled back: 2% to 12% below the highest close since, back near the level it broke and its 20-day average, RSI between 40 and 65, and a Technical score of 55 or more.", S_NOTE, B_NOTE),
           False, None, (), "setup scans", "basic", (("-abs_b2_level", 0.4), ("pillar_technical", 0.6))),
    Preset("basic-setup-ema9-consolidation", "Consolidating above the 9 EMA", BASIC_GROUP["setups"], "Stocks in an uptrend, holding a tight range just above their 9-day average.", "rules", _m(), "",
           (MC1000,) + E9_RULES + (("pillar_technical >= 60", "Technical 60 or more"),), (("rank_score", "desc"), ("pillar_technical", "desc")), 25,
           (RANK, STOCK, S_V9, S_R4, S_TURN, S_E20, S_RSI, B_TECH, FINLIT, SECTOR, MCAP), (),
           ("Market cap Rs 1,000 Cr or more; a full year of prices; in an uptrend: price above its 50-day average, with the 9-day above the 20-day above the 50-day.",
            "Holding just above the 9-day average: four closes above it, within 3% of it now, a touch of it in the last four sessions, and a range of 6% or less, with a Technical score of 60 or more.", S_NOTE, B_NOTE),
           False, None, (), "setup scans", "basic", (("-range_4d", 0.5), ("pillar_technical", 0.5))),
]

BASIC += [
    Preset(f"basic-pattern-{k}", _PNAMES[k], BASIC_GROUP["patterns"], _PTEXTS[k], "pattern", _m(), "", (), (("overall", "desc"),), 25,
           (RANK, STOCK, FINLIT, B_TECH) + _pcols(k) + (SECTOR, MCAP), (), (), False, None, (), k, "basic")
    for k in _SCANS]

# Top gainers (Today, This week, This month): companies our screens listed, ranked by the rise since the day they joined. Stored nightly (presets/history.py).
GAIN_WIN = (("day", "Today", "Companies that joined a screen of this page at the previous close, ranked by how far the price has risen since."),
            ("week", "This week", "Companies that joined a screen of this page at one of the last 5 closes, ranked by how far the price has risen since."),
            ("month", "This month", "Companies that joined a screen of this page at one of the last 21 closes, ranked by how far the price has risen since."))
GAIN_COLS = (Col("joined", "Joined", "text", "left"), Col("screen", "Screen it came from", "text", "left"), Col("closeJoined", "Close when it joined", "num1"), Col("since", "Since it joined", "pct"),
             Col("bench", "NIFTY 500, same days", "pct"), Col("highest", "Highest close since", "pct"), Col("stillOn", "Still on it", "text", "left"))
GAINERS: List[Preset] = [
    Preset(f"{'basic-' if tab == 'basic' else ''}gainers-{w}", f"Top gainers: {name}", "top-gainers", text, "gainers", _m(), "", (), (), 20, (RANK, STOCK) + GAIN_COLS + (SECTOR, MCAP), (), (), False, None, (), "top gainers", tab)
    for tab in ("basic", "advanced") for w, name, text in GAIN_WIN]
PRESETS = PRESETS + [p for p in GAINERS if p.tab == "advanced"]
BASIC = BASIC + [p for p in GAINERS if p.tab == "basic"]

ADVANCED: List[Preset] = list(PRESETS)
PRESETS = PRESETS + BASIC

# fix 11 (no model rules on the page): the card text and the "How this screen works" lines come from plain.json (the handover's data/screens.json): words only, never a
# weight, a cut-off or a formula. A screen without plain lines shows its card text only. The rule lists above stay on the server, in the presets job.
import json as _json
from dataclasses import replace as _replace
from pathlib import Path as _Path
_PLAIN: Dict[str, dict] = _json.loads((_Path(__file__).with_name("plain.json")).read_text(encoding="utf-8"))


def _plain(p: Preset) -> Preset:
    if p.kind == "pattern":          # the page words, without the look-back lengths the pack's texts printed (the handover drops them)
        return _replace(p, how_it_works=())
    w = _PLAIN.get(p.id)
    if w is None:
        return _replace(p, how_it_works=())
    return _replace(p, card_text=w["text"], how_it_works=tuple(w.get("how") or ()))


PRESETS = [_plain(p) for p in PRESETS]
BASIC = [_plain(p) for p in BASIC]
QUICK_VIEWS = [_plain(p) for p in QUICK_VIEWS]
ADVANCED = [p for p in PRESETS if p.tab != "basic"]
ALL: List[Preset] = PRESETS + QUICK_VIEWS
BY_ID: Dict[str, Preset] = {p.id: p for p in ALL}


def render_card(p: Preset, n: Optional[int] = None) -> str:
    """The card text; `{n}` is how many companies Prism has rated in the bucket (the small-cap sentence), or "those" when not known."""
    if "{n}" not in p.card_text:
        return p.card_text
    return p.card_text.replace("the {n} that", f"the {n} that" if n else "those that")


def group_name(gid: str) -> str:
    return dict(GROUPS)[gid]


def chip_by_id(p: Preset, cid: str) -> Optional[Chip]:
    return next((c for c in p.chips if c.id == cid), None)
