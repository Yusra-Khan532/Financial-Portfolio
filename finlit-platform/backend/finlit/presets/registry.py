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

REGISTRY_VERSION = 17      # 17: task #283 (the Basic tab, built on the retired FinLit IQ, removed; Sector themes ranks unrated companies by market cap, not by the IQ); 16: task #243 round 3a (13 new screens; F&O and liquidity on every row); 15: no "breakout" (the group is New highs, task #64 14 Nov N-12), "parts" not "pillars", the screen-score line without how it is built (N-36); 14: Prism basics served, Sector themes on the NSE industries, plain order notes, lender cut-off at or above; 13: Top gainers; 12: the Chart patterns group (11 scans, both tabs); 11: fixes 9 to 14 (each input ranked once, every company that passes, Quality for lenders, FinLit IQ on Basic); 10: the Breakouts group on the version 2 rules (task #64); 9: sizes by rupee market cap, a Rs 1,000 Cr floor on every Advanced list, Sector themes on NSE industries, full ratings only by default on Rating upgrades; 7: the Setups group (pre-breakout; breakout then pulled back); 6: caps, tags and sector themes read the Sector LABEL (not the macro sector or the Industry); the two valuation views split at 50; the screens page by 25
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
    format: str = "text"      # text | num1 | pct | pct_down | score | cr | label | badge
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
    tab: str = "advanced"     # the one tab: FinLit Prism (task #283 retired the Basic tab, built on the FinLit IQ)
    # a weighted rank score (redesign pdf, "Top 10"): ((field, weight), ...). Each input is turned into its percentile among the company's own size bucket
    # (the bucket's Prism-rated companies); the score is 100 x the weighted sum.
    rank_score: Tuple[Tuple[str, float], ...] = ()
    sector_cap: int = 0       # at most this many companies from one Sector label in the list (0 = no cap)
    fill: Tuple[str, ...] = ()   # rule labels a company may fail and still fill a short list (badged "Trend not confirmed")
    list_text: str = ""       # what the card says about its list when it shows fewer than all that pass, e.g. "Top 10"
    # Task #243 (pack v4, i notes): "What it shows" and the three "How to use it" points beside the screen's name, and the notes line under the toolbar.
    # Both come from plain.json, like the card text. `added` is the day the screen first ran: the card carries a NEW tag for NEW_DAYS after it.
    about: Tuple[str, Tuple[str, ...]] = ()
    notes: Tuple[str, ...] = ()
    added: str = ""

    @property
    def status(self) -> str:
        return "blocked" if self.kind == "blocked" else "live"


# Task #243 (screeners update pack v4, R2): the featured groups first (Top rated · Momentum · Growth · Themes, and Sectors on Advanced), then the rest
# (Prism views · Setups · Chart patterns · Top gainers · Value and income · Safety · Ownership). "Trend" reads Momentum and "New highs" reads Setups
# (pack L14: the group holds the three setups; "Near a 52-week high" sits under Momentum). The ids stay, so stored lists and links keep working.
GROUPS: List[Tuple[str, str]] = [("top-rated", "Top rated"), ("trend", "Momentum"), ("growth", "Growth"), ("themes", "Themes"), ("sectors", "Sectors"),
                                 ("prism-basics", "Prism views"), ("setups", "Setups"), ("chart-patterns", "Chart patterns"), ("top-gainers", "Top gainers"),
                                 ("value-income", "Value and income"), ("safety", "Safety"), ("ownership", "Ownership")]
FEATURED_GROUPS = ("top-rated", "trend", "growth", "themes", "sectors")

# ------------------------------------------------------------------------------------------------------------------------------ columns
RANK = Col("rank", "#", "text", "right")
STOCK = Col("name", "Stock", "text", "left")
PRISM = Col("prism_final", "Prism Fundamental score", "score")
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


R3M = Col("ret_3m", "3-month return", "pct")
R6M = Col("ret_6m", "6-month return", "pct")
W52 = Col("pct_from_high", "Down from 52-week high", "pct_down")
RSC = Col("rank_score", "Rank score", "score")
SUBT = Col("sub_theme", "Sub-theme", "text", "left")
TOP_COLS = (RANK, STOCK, SECTOR, PRISM, PLABEL, FUND, VAL, QUAL, RISK, STS, LTS, R3M, R6M, R1Y, W52, MCAP, RSC)
# a Prism-rated stock shows its Rated / Provisional status as a badge on every screen but the Top-10 ones (which are Rated only)
with_status = lambda cols: tuple(cols) + (PSTATUS,)   # noqa: E731
VIEWS = (STS, LTS)

PROVISIONAL = Chip("include-provisional", "Include provisional", "Also lists companies with a Provisional Prism rating (a rating built on limited history), each with its badge.", False,
                   _m(prism_set={"status": None}), ("Provisional ratings are included, with a Provisional badge.",))
TURNING_UP = Chip("turning-up", "Turning up", "Keeps only names where the short-term technical view is no longer negative: the price has stopped falling.", False,
                  _m(derived_add=(("prism_st_score >= 0", "Short-term technical view 0 or more"),)), ("Turning up: the short-term technical view must be 0 or more.",))
ALL_CAPS = Chip("all-caps", "All caps", "Also lists small and micro caps (the default is large and mid caps).", False, _m(derived_drop=("is_large_mid = 1",)), ("All caps: small and micro caps are included.",))   # task #262: four sizes
FAST_G = Chip("fast-growers", "Fast growers", "Asks for stronger growth and profitability.", False, _m(prism_set={"zfmin": 85}), ("Fast growers: Prism Growth & Profitability 85 or more.",))
SHOW_ALL_THEME = Chip("show-all-theme", "Show all theme members", "Drops the Growth & Profitability and Risk gates: every theme member of Rs 1,000 Cr or more is listed.", False,
                      _m(derived_drop=("has_prism = 0 or (prism_fundamental >= 50 and prism_risk >= 40)",)), ("Every theme member of Rs 1,000 Cr or more is listed, whatever its Growth & Profitability and Risk.",))
SMALL_GROUPS = Chip("small-groups", "Include small groups", "Also lists smaller groups, which are too few to call a theme with the same confidence.", False,
                    _m(small_groups=True), ("Smaller groups are included.",))
SUB_CHIPS = tuple(Chip(slug(sub), sub, f"Only companies in {sub}. Pick several to see any of them.", False, _m(sub=sub), (f"Sub-theme: {sub}.",)) for sub in THEME_SUBS)

TOP_RANK = (("prism_final", 0.55), ("prism_lt_score", 0.40), ("prism_st_score", 0.05))      # fix 9: each input once (the Prism score already holds Valuation and Risk)
TOP_ORDER = (("rank_score", "desc"), ("prism_quality", "desc"), ("prism_final", "desc"), ("market_cap", "desc"))   # fix 12: exact ties go to the larger market cap


def size_range(bucket: str) -> str:
    """Task #258 (Advanced SPEC §5): the market-value range of a size, e.g. "above ₹75,000 Cr", from the site's one ₹ rule (finlit/sizes.py, task #262)."""
    from ..sizes import LARGE_ABOVE, MID_FROM, SMALL_FROM
    cr = lambda v: f"{v:,.0f}"
    return {"Large": f"above ₹{cr(LARGE_ABOVE)} Cr", "Mid": f"₹{cr(MID_FROM)}–{cr(LARGE_ABOVE)} Cr", "Small": f"₹{cr(SMALL_FROM)}–{cr(MID_FROM)} Cr",
            "Micro": f"below ₹{cr(SMALL_FROM)} Cr"}[bucket]


def _size_words(bucket: str) -> str:
    """The size sentence of a size screen, on the site's one ₹ rule (finlit/sizes.py, task #262; the old text named market-cap ranks)."""
    return f"Only {bucket.lower()} caps: a market value {size_range(bucket)}, as the site sizes every company."


def has_size(bucket: str) -> bool:
    """True when the site's sizes include this bucket (all four since task #262)."""
    from ..screener.catalog import CAPS
    return bucket in CAPS


def _top(n: int, bucket: str, label: str) -> Preset:
    filters = {"cap": bucket, "rated": 1, "status": "RATED", "zmin": 65, "zqmin": 50, "zrmin": 50}      # fix 12: Healthy or Strong only; one Risk minimum for every size
    how = [f"Only {label} caps: a market value {size_range(bucket)}, as the site sizes companies.",
           "Only companies with a full Prism rating (Provisional ratings appear only with the Include provisional chip, with their badge). Market cap Rs 1,000 Cr or more.",
           "Healthy or Strong on Prism, with sound quality and risk, a firm long-term trend and a price not far below its 52-week high.",
           "The strongest ten come first, at most three from one Sector label, then every other company that passes, ranked by the same score.",
           "If fewer than 10 pass, the list is filled with the next names that fail only the trend or the 52-week gate, badged Trend not confirmed."]
    return Preset(f"highest-rated-{label}", f"Highest-rated {label} caps", "top-rated", f"{label.title()} caps ({size_range(bucket)}) with a strong Prism rating and a firm long-term trend. The 10 strongest come first, then every other company that passes.", "rules",
                  _m(**filters), "Below 52-week high <= 30", (("prism_lt_score > -20", "Long-term technical view above -20"), RUN_GUARD, MCAP1000), TOP_ORDER, 10, TOP_COLS, (PROVISIONAL,), tuple(how), True, None, ("provisional",),
                  f"p4 (Top 10, {label})", "advanced", TOP_RANK, 3, ("technical view", "52-week high"))


LT_ST_COLS = (STS, LTS)

PRESETS: List[Preset] = [
    _top(1, "Large", "large"),
    _top(2, "Mid", "mid"),
    _top(3, "Small", "small"),
    # task #258 (SPEC §5): "Highest-rated micro caps" joins Top rated once the data has a Micro size (task #262); hidden, never an empty card, until then
    *([_top(4, "Micro", "micro")] if has_size("Micro") else []),

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
           _m(), "", (), (("has_prism", "desc"), ("prism_final", "desc")), 25,
           with_status((STOCK, SECTOR, PRISM, STS, LTS, R3M, Col("vs_industry_3m", "3-month return against the sector median (points)", "num1"), W52, MCAP)), (SMALL_GROUPS,),
           ("Every night each sector (by its Sector label) is scored on breadth, the share of its stocks within 15% of their 52-week high, and its median 3-month return against the whole market; stocks of Rs 1,000 Cr or more.",
            "In play: breadth at least 40% and 15 points above the market's, and median 3-month return at least 5 points above the market's.",
            "Leaders (up to 5 per sector): market cap Rs 1,000 Cr or more, within 15% of their 52-week high, 3-month return above the sector median; rated companies first by Prism score, then the unrated ones by market cap.",
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
S_HIGH = Col("pct_from_high", "Down from 52-week high (%)", "pct_down")
S_DSH = Col("days_since_high", "Sessions since the high", "num1")
S_R10 = Col("range_10d", "10-session range (%)", "num1")
S_ATR = Col("atr_ratio", "Volatility against the longer run", "num1")
S_V10 = Col("vol_ratio_10_50", "Volume, last 10 against 50 sessions", "num1")
S_RSI = Col("rsi14", "RSI (14 days)", "num1")
S_BAGE = Col("breakout_age", "Sessions since it last closed above its range", "num1")
S_BLEV = Col("breakout_level", "Top of the range it closed above (Rs)", "num1")
S_VSB = Col("vs_breakout", "Against that range top (%)", "num1")
S_BVOL = Col("breakout_vol_ratio", "Volume on the day it closed above its range", "num1")
S_E20 = Col("vs_ema20", "Against the 20-day average (%)", "num1")
S_UP = ("vs_ema50 > 0 and vs_ema200 > 0 and vs_ema200 > vs_ema50", "Price above its 50- and 200-day averages, with the 50-day above the 200-day")
S_FLAGS = ("coalesce(flag_count, 0) <= 2", "At most 2 red flags (a blank counts as none)")
S_NOTE = "A screen narrows a list. It is not a recommendation."


def _between(field: str, lo: float, hi: float, label: str) -> Tuple[str, str]:
    return (f"{field} >= {lo:g} and {field} <= {hi:g}", label)


import os as _os
VOLUME_TESTS = _os.environ.get("BHAV_VOLUME", "on").lower() != "off"   # fix 8: the volume is NSE's full-day figure (finlit/bhav_volume.py), so the two volume tests (breakout day, value traded) are on; BHAV_VOLUME=off switches them off
FULL_YEAR = ("missing(ret_1y) = 0", "A full year of prices")
S_B2AGE = Col("b2_age", "Sessions since a recent close above its range", "num1")
S_B2LEV = Col("b2_level", "Range top it closed above, recent 25 sessions (Rs)", "num1")
S_B2VS = Col("b2_vs_level", "Against that recent range top (%)", "num1")
S_B2PULL = Col("b2_pullback", "Below the highest close since (%)", "num1")
S_B2VOL = Col("b2_vol_x", "Volume on that day, recent 25 sessions", "num1")
S_V9 = Col("vs_ema9", "Against the 9-day average (%)", "num1")
S_R4 = Col("range_4d", "4-session range (%)", "num1")
S_TURN = Col("turnover20_cr", "Value traded a day, 20-session average (Rs Cr)", "num1")
PB_RULES = (FULL_YEAR, S_UP, _between("pct_from_high", 1.5, 8, "1.5% to 8% below the 52-week high"), ("days_since_high >= 15", "The 52-week closing high is at least 15 sessions old: a base of three weeks or more"),
            ("range_10d <= 10", "The last 10 sessions moved within a 10% range"), ("atr_ratio < 1.1", "Price swings are not widening (10-day against 50-day range under 1.1)"),
            _between("rsi14", 45, 68, "RSI between 45 and 68"))
BR_RULES = (FULL_YEAR, ("vs_ema50 > 0", "Price above its 50-day average"), _between("b2_age", 3, 25, "Broke above a 52-week closing high 3 to 25 sessions ago (an old high at least 10 sessions old)"),
            _between("b2_pullback", 2, 12, "2% to 12% below the highest close since then"), _between("b2_vs_level", -3, 6, "Back within 3% below to 6% above the range top it closed above"),
            _between("vs_ema20", -4, 4, "Within 4% of its 20-day average"), _between("rsi14", 40, 65, "RSI between 40 and 65")) \
           + ((("b2_vol_x >= 1.3", "That close came on volume (1.3 times the usual or more)"),) if VOLUME_TESTS else ())
E9_RULES = (FULL_YEAR, ("vs_ema50 > 0 and ema_stack = 1", "In an uptrend: price above the 50-day average, with the 9-day above the 20-day above the 50-day"),
            ("ema9_above4 = 1", "The last four closes were each above the 9-day average"), ("vs_ema9 <= 3 and ema9_near4 = 1", "Within 3% of the 9-day average now, and never more than 4% above it in the last four sessions"),
            ("ema9_touch4 = 1", "Touched the 9-day average in the last four sessions"), ("range_4d <= 6", "The last four sessions moved within a 6% range")) \
           + ((("turnover20_cr >= 1", "At least Rs 1 Cr traded a day on average"),) if VOLUME_TESTS else ())
SETUP_BLOCK = "Needs the 9-day average signal, which the nightly price job does not store yet; turns on once it does."

SETUPS_ADV: List[Preset] = [
    Preset("setup-pre-breakout", "Just under the 52-week high", "setups", "Stocks in an uptrend resting just under their 52-week high, with price swings no wider than before.", "rules", _m(rated=1), "",
           PB_RULES + (MCAP1000, ("prism_st_score >= 20", "Short-term technical view +20 or more"), ("prism_lt_score >= 20", "Long-term technical view +20 or more")),
           (("rank_score", "desc"), ("prism_lt_score", "desc")), 25, with_status((STOCK, S_HIGH, S_DSH, S_R10, S_ATR, S_V10, S_RSI, STS, LTS, PRISM, SECTOR, MCAP)), (),
           ("Rated or provisional by Prism (a Provisional rating is badged); a full year of prices; market cap Rs 1,000 Cr or more.", "In an uptrend: price above its 50- and 200-day averages, with the 50-day above the 200-day.",
            "Resting under the high: 1.5% to 8% below the 52-week high, a closing high at least 15 sessions old.",
            "Quiet: a 10-session range of 10% or less, price swings not widening, RSI between 45 and 68, and both technical views at +20 or more.", S_NOTE),
           False, None, ("provisional",), "setup scans", "advanced", (("-pct_from_high", 0.4), ("-range_10d", 0.3), ("prism_lt_score", 0.3))),
    Preset("setup-breakout-pullback", "Closed above the 52-week high, then eased back", "setups", "Stocks that closed above their 52-week high in the last five weeks and have eased back towards that level.", "rules", _m(rated=1), "",
           BR_RULES + (MCAP1000, ("prism_lt_score >= 20", "Long-term technical view +20 or more")),
           (("rank_score", "desc"), ("prism_lt_score", "desc")), 25, with_status((STOCK, S_B2AGE, S_B2LEV, S_B2VS, S_B2PULL, S_B2VOL, S_E20, S_RSI, LTS, PRISM, SECTOR, MCAP)), (),
           ("Rated or provisional by Prism (a Provisional rating is badged); a full year of prices; market cap Rs 1,000 Cr or more; price above its 50-day average.",
            "A recent close above its range: the close rose above a 52-week closing high that was at least 10 sessions old, 3 to 25 sessions ago.",
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
# Twelve scans on daily candles, run nightly (presets/patterns.py): engine 2 (task #325, finlit/pattern_engine.py). The rules live only there; the page shows what a scan found.
from .patterns import FACT_FORMAT as _FFMT, FACT_LABELS as _FACTS, HOW as _PHOW, NAMES as _PNAMES, SCAN_IDS as _SCANS, TEXTS as _PTEXTS   # noqa: E402


def _pcols(scan: str) -> Tuple[Col, ...]:
    """Task #325 (file 26): the screen's four figures as numbers (they sort as numbers), then Status and How clean."""
    fig = tuple(Col(f"pf{j}", lab, _FFMT.get(lab, "text"), "left" if _FFMT.get(lab, "text") in ("text", "date") else "right") for j, lab in enumerate(_FACTS[scan], 1) if lab)
    return fig + (Col("pf_status", "Status", "text", "left"), Col("pf_clean", "How clean", "text", "left"))


PATTERNS_ADV: List[Preset] = [
    Preset(f"pattern-{k}", _PNAMES[k], "chart-patterns", _PTEXTS[k], "pattern", _m(), "", (), (("pattern_q", "desc"),), 25,
           with_status((STOCK, PRISM, STS, LTS) + _pcols(k) + (SECTOR, MCAP)), (), tuple(_PHOW[k]), False, None, ("provisional",), k, "advanced")
    for k in _SCANS]
PRESETS = PRESETS[:-2] + SETUPS_ADV + PATTERNS_ADV + PRESETS[-2:]

# Prism views (14 Nov N-35: the group after Top rated on the Advanced strip; the mock-up's names and order). Formerly "Prism basics" (the page's own quick views, frontend/src/lib/scoreScreen.ts PRISM_PRESETS): served like every other screen, so each has history, As on and a place in Top gainers (task 64, SC-10)
_BASICS_COLS = with_status((RANK, STOCK, SECTOR, PRISM, PLABEL, FUND, VAL, QUAL, RISK, STS, LTS, MCAP))
_BASICS_ORDER = (("prism_final", "desc"), ("market_cap", "desc"))
QUICK_VIEWS: List[Preset] = [
    Preset("strongsafe", "Strong and safe", "prism-basics", "Strong on FinLit Prism, with a Risk part that reads lower risk.", "rules", _m(zmin=80, zrmin=65, rated=1), "", (), _BASICS_ORDER, 25, _BASICS_COLS),
    Preset("fairvalue", "Fair value", "prism-basics", "Strong Growth & Profitability, with a fair valuation.", "rules", _m(zfmin=65, zvmin=50, rated=1), "", (), _BASICS_ORDER, 25, _BASICS_COLS),
    Preset("weakvalue", "Weak value", "prism-basics", "Strong Growth & Profitability, with a weak valuation.", "rules", _m(zfmin=65, zvbelow=50, rated=1), "", (), _BASICS_ORDER, 25, _BASICS_COLS),
    Preset("bothtech", "Uptrend on both views", "prism-basics", "Both of Prism's technical views, short term and long term, in an uptrend.", "rules", _m(st=20, lt=20), "", (), _BASICS_ORDER, 25, _BASICS_COLS),
]


# ------------------------------------------------------------------------------------------------------------------------------ the Basic tab (retired)
# Task #283 (21 Nov 2026): FinLit IQ is retired and FinLit Prism is FinLit's only company score. The Basic tab's screens were built on the IQ and its pillars
# and served only the retired Basic stock screener (/score-screener, which now opens the Advanced one), so they are gone; each had a Prism twin on the
# Advanced tab (Highest-rated by size, Momentum leaders, Near a 52-week high, Strong results, Dividend payers, Rating upgrades and downgrades, ...).
# The standard columns of every list (the 11 Nov design, file 01 and 02): Company | Price & size | FinLit Prism | Technical views | [Returns, behind a switch].
# A screen adds only its own "This screen" columns after them. (key, label, format, align, band)
STD_PRICE = (("price", "LTP (Rs)", "num2", "right", "Price & size"), ("ret_1d", "Day change", "pct", "right", "Price & size"), ("market_cap", "Market cap (Rs Cr)", "cr", "right", "Price & size"))
STD_ADVANCED = STD_PRICE + (("prism_final", "Prism", "score", "right", "FinLit Prism"), ("prism_fundamental", "Growth & Profitability", "score", "right", "FinLit Prism"), ("prism_valuation", "Valuation", "score", "right", "FinLit Prism"),
                            ("prism_quality", "Quality", "score", "right", "FinLit Prism"), ("prism_risk", "Risk", "score", "right", "FinLit Prism"),
                            ("prism_st_score", "Short term", "score", "right", "Technical views"), ("prism_lt_score", "Long term", "score", "right", "Technical views"))
STD_RETURNS = (("ret_3m", "3-month return", "pct", "right", "Returns"), ("ret_6m", "6-month return", "pct", "right", "Returns"), ("ret_1y", "1-year return", "pct", "right", "Returns"),
               ("pct_from_high", "Down from 52-week high", "pct_down", "right", "Returns"))
# Task #243 (pack v4, section 3): Columns ▾ → Sector reading on every Advanced screen (off by default; the Sectors screens open with it on). Words to read, each sorts.
STD_SECTOR = (("sr_industry", "Industry", "text", "left", "Sector reading"), ("sr_rotation", "Rotation", "text", "left", "Sector reading"),
              ("sr_pulse", "Pulse", "text", "left", "Sector reading"), ("sr_peer", "Vs peers", "text", "left", "Sector reading"),
              ("sr_tailwinds", "Tailwinds", "text", "right", "Sector reading"))
IDENTITY_KEYS = ("rank", "name", "sector")

# ------------------------------------------------------------------------------------------------------------------------------ new screens (task #243, pack v3 R5 and v4)
# "Sound" = a Healthy or Strong Prism rating (score 65 or more). The fields res_* and prism_before* / prism_change are put on each company by presets/service.py
# (build_frame) from the Latest results page and the Prism history; a company without them fails the rule (unknown fails), it is never guessed.
NEW_DAY = "2026-11-19"                      # the day these screens first ran: the cards carry a NEW tag for NEW_DAYS (presets/api.py)
C_SALES = Col("q_sales_yoy", "Sales vs a year ago", "pct")
C_PROFIT = Col("q_profit_yoy", "Profit vs a year ago", "pct")
C_DY = Col("dividend_yield", "Dividend yield (%)", "num2")
C_DYRS = Col("div_years", "Years paid (of last 6)", "text")
C_FII = Col("own_fii_chg_1q", "Foreign institutions (points)", "num2")
C_DII = Col("own_dii_chg_1q", "Domestic institutions (points)", "num2")
C_PC = Col("own_promoters_chg_1q", "Promoter stake change (points)", "num2")
C_PS = Col("own_promoters", "Promoter stake (%)", "num1")
C_RD = Col("res_declared", "Declared", "date")
C_RV = Col("res_verdict", "Result", "text", "left")
C_RS = Col("res_sales_yoy", "Sales vs a year ago", "pct")
C_RP = Col("res_profit_yoy", "Profit vs a year ago", "pct")
C_RN = Col("res_npm_change", "Net margin change (points)", "num1")
C_PB, C_PBR, C_PBD, C_PCH = (Col("prism_before", "Prism before", "score"), Col("prism_before_rating", "Rating before", "text", "left"),
                             Col("prism_before_day", "Scored on", "date"), Col("prism_change", "Change", "num1"))
R_STRONG_RES = (("q_sales_yoy >= 20", "Sales growth against the same quarter last year 20% or more"), ("q_profit_yoy >= 25", "Profit growth against the same quarter last year 25% or more"))
R_DIVIDEND = (("dividend_yield >= 2", "Dividend yield 2% or more"), ("div_years >= 5", "A dividend in at least 5 of the last 6 years"))
R_INST = (("own_fii_chg_1q >= 0.5", "Foreign institutions up 0.5 point or more last quarter"), ("own_dii_chg_1q >= 0.5", "Domestic institutions up 0.5 point or more last quarter"),
          ("own_promoters_chg_1y >= -1", "Promoters down no more than 1 point in a year"))
R_PROMOTER = (("own_promoters_chg_1q >= 0.5", "Promoter holding up 0.5 point or more last quarter"),
              ("own_promoters_chg_1q <= 10", "A rise of no more than 10 points (larger jumps come from mergers or reclassification)"))
R_FRESH = (("res_fresh = 1", "Results declared in the last week, with numbers loaded"), ("res_rank >= 5", "The Latest results page reads the quarter as Strong"))
R_WEAK = (("res_fresh = 1", "Results declared in the last week, with numbers loaded"), ("res_rank <= 1", "The Latest results page reads the quarter as Poor or Loss"))
SOUND_ADV = _m(rated=1, zmin=65)


def _new(pid: str, name: str, group: str, tab: str, rules, rank, cols, pf: Optional[Mapping] = None) -> Preset:
    cols = (RANK, STOCK) + tuple(cols) + (SECTOR, MCAP)
    return Preset(pid, name, group, "", "rules", pf if pf is not None else _m(), "", tuple(rules), tuple(rank), 25, with_status(cols), (), (), False, None,
                  ("provisional",), "pack v4 (task #243)", tab, added=NEW_DAY)


NEW_ADV: List[Preset] = [
    _new("strong-results", "Strong results, sound rating", "growth", "advanced", R_STRONG_RES + (MCAP1000,), (("q_profit_yoy", "desc"), ("prism_final", "desc")), (C_SALES, C_PROFIT), SOUND_ADV),
    _new("dividend-payers", "Dividend payers, sound rating", "value-income", "advanced", R_DIVIDEND + (MCAP1000,), (("dividend_yield", "desc"), ("prism_final", "desc")), (C_DY, C_DYRS), SOUND_ADV),
    _new("turnarounds", "Turnarounds", "value-income", "advanced", (("prism_lt_score < 20", "Long-term technical pillar Sideways or lower (a company with no long-term view is left out)"), MCAP1000),
         (("prism_st_score", "desc"), ("prism_final", "desc")), (W52,), _m(rated=1, zmin=65, st=20)),
    _new("rating-downgrades", "Rating downgrades", "safety", "advanced", (("prism_band_down = 1 or prism_change <= -10", "Prism rating down a band, or score down 10 points or more"), MCAP1000),
         (("prism_change", "asc"), ("prism_final", "desc")), (C_PB, C_PBR, C_PBD, C_PCH), _m(rated=1)),
    _new("institutions-buying", "Institutions buying, sound rating", "ownership", "advanced", R_INST + (MCAP1000,), (("inst_chg_1q", "desc"), ("prism_final", "desc")), (C_FII, C_DII), SOUND_ADV),
    _new("promoter-buying", "Promoter buying, sound rating", "ownership", "advanced", R_PROMOTER + (MCAP1000,), (("own_promoters_chg_1q", "desc"), ("prism_final", "desc")), (C_PC, C_PS), SOUND_ADV),
    _new("fresh-results", "Fresh results: strong quarter, sound rating", "growth", "advanced", R_FRESH + (MCAP1000,), (("res_declared_n", "desc"), ("res_profit_yoy", "desc")),
         (C_RD, C_RV, C_RS, C_RP, C_RN), SOUND_ADV),
    _new("weak-results", "Weak results, sound rating", "safety", "advanced", R_WEAK + (MCAP1000,), (("res_profit_yoy", "asc"), ("res_declared_n", "desc")),
         (C_RD, C_RV, C_RS, C_RP, C_RN), SOUND_ADV),
]
PRESETS = PRESETS + NEW_ADV

# ------------------------------------------------------------------------------------------------------------------------------ Sectors (task #243, pack v4, Advanced only)
# Built on the site's own Sector Rotation corners, Sector Pulse states and leader flags, and the peer labels, as the live sector release holds them (presets/sectorread.py
# puts the sr_* fields on each company). A company outside every counted group has no reading and fails these rules: it is never guessed.
C_SFLAG = Col("sr_flag", "Leader flag", "text", "left")
C_SQ = Col("sr_q6m_name", "Place in its industry by 6-month return", "text", "left")
C_SR4 = Col("sr_rank_4w", "Industry ranks climbed in 4 weeks", "num1")
C_SSET = Col("sr_setups", "List it is on", "text", "left")
R_SEC_LEADING = ("sr_ag = 1 or sr_up = 1", "Industry Ahead and gaining on Sector Rotation, or Bouncing back, Bouncing back after a crash or Rising together on Sector Pulse")
R_SEC_LEADER = ("sr_lead = 1", "Peer label Leader")
SECTOR_ADV: List[Preset] = [
    _new("sector-leaders-leading", "Leaders in leading sectors", "sectors", "advanced",
         (("sr_ag = 1", "Industry Ahead and gaining on Sector Rotation"), R_SEC_LEADER, ("prism_lt_score >= 20", "Long-term technical pillar +20 or more")),
         (("sr_tailwinds", "desc"), ("prism_lt_score", "desc")), (), _m()),
    _new("sector-rebound-leaders", "Rebound leaders", "sectors", "advanced",
         (("sr_thrust = 1", "Industry Bouncing back or Bouncing back after a crash on Sector Pulse"), ("sr_q6m = 1", "Top quarter of its industry by 6-month return"),
          ("prism_st_score >= 20", "Short-term technical pillar +20 or more")),
         (("prism_st_score", "desc"), ("sr_tailwinds", "desc")), (C_SQ,), _m()),
    _new("sector-early-leaders", "Early leaders in weak sectors", "sectors", "advanced",
         (("sr_flagged = 1", "A Sector Pulse leader flag: a 52-week closing high while its industry is still well below its own high (Full flag or Early flag)"),),
         (("sr_tailwinds", "desc"), ("prism_st_score", "desc")), (C_SFLAG,), _m()),
    _new("sector-setups-behind", "Setups with the sector behind them", "sectors", "advanced",
         (("sr_on_setup = 1", "On one of the 3 Setups or 11 Chart patterns lists tonight"), R_SEC_LEADING),
         (("sr_tailwinds", "desc"), ("prism_st_score", "desc")), (C_SSET,), _m()),
    _new("sector-turning-up", "Leaders in sectors turning up", "sectors", "advanced",
         (("sr_bg = 1", "Industry Behind but gaining on Sector Rotation"), R_SEC_LEADER, ("prism_st_score >= 20", "Short-term technical pillar +20 or more")),
         (("sr_rank_4w", "desc"), ("prism_st_score", "desc")), (C_SR4,), _m()),
    _new("sector-results-leading", "Strong results in leading sectors", "sectors", "advanced",
         (("res_fresh = 1", "Results declared in the last week, with numbers loaded"), ("res_rank >= 4", "The Latest results page reads the quarter as Strong or Good"),
          R_SEC_LEADER, R_SEC_LEADING),
         (("res_rank", "desc"), ("res_profit_yoy", "desc")), (C_RD, C_RV, C_RS, C_RP, C_RN), _m()),
]
SECTOR_IDS = tuple(p.id for p in SECTOR_ADV)
PRESETS = PRESETS + SECTOR_ADV

# Top gainers (Today, This week, This month): companies our screens listed, ranked by the rise since the day they joined. Stored nightly (presets/history.py).
GAIN_WIN = (("day", "Today", "Companies that joined a screen of this page at the previous close, ranked by how far the price has risen since."),
            ("week", "This week", "Companies that joined a screen of this page at one of the last 5 closes, ranked by how far the price has risen since."),
            ("month", "This month", "Companies that joined a screen of this page at one of the last 21 closes, ranked by how far the price has risen since."))
GAIN_COLS = (Col("joined", "Joined", "text", "left"), Col("screen", "Screen it came from", "text", "left"), Col("closeJoined", "Close when it joined", "num1"), Col("since", "Since it joined", "pct"),
             Col("bench", "NIFTY 500, same days", "pct"), Col("highest", "Highest close since", "pct"), Col("stillOn", "Still on it", "text", "left"))
GAINERS: List[Preset] = [
    Preset(f"gainers-{w}", f"Top gainers: {name}", "top-gainers", text, "gainers", _m(), "", (), (), 20, (RANK, STOCK) + GAIN_COLS + (SECTOR, MCAP), (), (), False, None, (), "top gainers", "advanced")
    for w, name, text in GAIN_WIN]
PRESETS = PRESETS + GAINERS

# fix 11 (no model rules on the page): the card text and the "How this screen works" lines come from plain.json (the handover's data/screens.json): words only, never a
# weight, a cut-off or a formula. A screen without plain lines shows its card text only. The rule lists above stay on the server, in the presets job.
import json as _json
from dataclasses import replace as _replace
from pathlib import Path as _Path
_PLAIN: Dict[str, dict] = _json.loads((_Path(__file__).with_name("plain.json")).read_text(encoding="utf-8"))


def _plain(p: Preset) -> Preset:
    if p.kind == "pattern":          # task #325 (developer file 26): engine 2's card line and How this screen works, from the pack's pattern-text.json, word for word
        return p                     # (file 25, 2.1 row 1: these screens opened an empty How this screen works)
    w = _PLAIN.get(p.id)
    if w is None:
        return _replace(p, how_it_works=())
    ab = w.get("about") or {}
    about = (ab["shows"], tuple(ab["use"])) if ab.get("shows") and ab.get("use") else ()
    text, how = w["text"], tuple(w.get("how") or ())
    if "{range}" in text or any("{range}" in h for h in how):      # task #258 (SPEC §5): a size screen names its range, from the site's size lines
        rng = size_range(str(p.prism_filters.get("cap") or ""))
        text, how = text.replace("{range}", rng), tuple(h.replace("{range}", rng) for h in how)
    return _replace(p, card_text=text, how_it_works=how, about=about, notes=tuple(w.get("notes") or ()))


PRESETS = [_plain(p) for p in PRESETS]
QUICK_VIEWS = [_plain(p) for p in QUICK_VIEWS]
ADVANCED: List[Preset] = list(PRESETS)
ALL: List[Preset] = PRESETS + QUICK_VIEWS
BY_ID: Dict[str, Preset] = {p.id: p for p in ALL}
NEW_ADV = [BY_ID[p.id] for p in NEW_ADV]     # with their plain words
SECTOR_ADV = [BY_ID[p.id] for p in SECTOR_ADV]     # task #243 round 3b: with their plain words


def render_card(p: Preset, n: Optional[int] = None) -> str:
    """The card text; `{n}` is how many companies Prism has rated in the bucket (the small-cap sentence), or "those" when not known."""
    if "{n}" not in p.card_text:
        return p.card_text
    return p.card_text.replace("the {n} that", f"the {n} that" if n else "those that")


def group_name(gid: str) -> str:
    return dict(GROUPS)[gid]


def chip_by_id(p: Preset, cid: str) -> Optional[Chip]:
    return next((c for c in p.chips if c.id == cid), None)
