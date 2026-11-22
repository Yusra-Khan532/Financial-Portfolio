"""FinLit chart patterns, engine 2 (task #325, developer file 26, 22 Nov 2026). Ported from the pack's reference implementation (patterns.py and vcp2.py).

Input: one year of daily open/high/low/close/volume for one company (oldest first), three years of weekly high/low/close where the exchange candles hold
them, and the Nifty MidSmallcap 400 and Nifty 500 closes. Output, for each pattern a company meets today: the figures behind the hit, a status, a quality
from 0 to 100 (shown only as Clean, Fair or Rough) and what to draw (level, base, lines, marks).

Everything is measured in the stock's own average daily range where a fixed percentage would treat a quiet large cap and a volatile small cap alike.
Every number in here is a rule and stays on the server; the page shows what a scan found, never these settings. Nothing here is advice: a pattern
describes what a chart has done, not what it will do.
"""
from __future__ import annotations

import math
from typing import Any, Dict, List, Optional, Sequence

import numpy as np

MIN_TURNOVER_CR = 5.0          # 20-day average value traded, Rs crore
MIN_PRICE = 20.0
CLEAN, FAIR = 70, 50           # quality cut-offs for the label (70 reproduces the pack's "Rated Clean" counts on 20 Nov exactly)


def clean_label(q: Optional[int]) -> Optional[str]:
    return None if q is None else "Clean" if q >= CLEAN else "Fair" if q >= FAIR else "Rough"


def weekly_trend(wd, wh, wl, wc, date, close):
    """Uptrend read from weekly bars up to `date`: close above the 30-week average, that above the 40-week,
    the 40-week rising over a month, 25% or more off the 52-week low and within 25% of the 52-week high."""
    k = int(np.searchsorted(wd, date, side='right'))
    if k < 45: return False
    c = wc[:k]; m30, m40, m40b = c[-30:].mean(), c[-40:].mean(), c[-44:-4].mean()
    hi, lo = wh[max(0, k - 52):k].max(), wl[max(0, k - 52):k].min()
    return close > m30 > m40 and m40 > m40b and close >= lo * 1.25 and close >= hi * 0.75


def contractions(h, l, c, v, adr, ratio=0.75, last_max=3.0, dry=1.0, min_legs=2, near=8.0, span=65):
    """Returns the pattern at the last bar, or None. A pivot high 10 to `span` sessions old; since then
    successive falls, each no more than `ratio` of the one before, on higher lows; the latest fall is at
    most `last_max` usual daily ranges; the close is within `near`% of the pivot; volume has dried up."""
    n = len(c)
    if n < span + 55: return None
    p = n - span + int(np.argmax(h[n - span:n - 10])); pivot = h[p]
    if c[p + 1:].max() > pivot: return None
    th = max(2.5, 1.2 * adr) / 100; legs = []; hi_i = p; lo_i = None; down = True
    for i in range(p + 1, n):
        if down:
            if lo_i is None or l[i] < l[lo_i]: lo_i = i
            if h[i] >= l[lo_i] * (1 + th) and i > lo_i: legs.append((hi_i, lo_i)); hi_i = i; down = False
        else:
            if h[i] > h[hi_i]: hi_i = i
            if l[i] <= h[hi_i] * (1 - th) and i > hi_i: lo_i = i; down = True
    if down:                                                              # an unfinished fall: count it only if it has started to turn
        if lo_i is None or c[-1] < l[lo_i] * (1 + th / 2): return None
        legs.append((hi_i, lo_i))
    if len(legs) < min_legs: return None
    legs = legs[-3:]; dep = [(1 - l[b] / h[a]) * 100 for a, b in legs]
    if dep[0] > 35 or any(dep[i + 1] > dep[i] * ratio for i in range(len(dep) - 1)) or dep[-1] > last_max * adr: return None
    if any(l[legs[i + 1][1]] < l[legs[i][1]] for i in range(len(legs) - 1)): return None    # lows must rise
    d = (1 - c[-1] / pivot) * 100; vd = v[-10:].mean() / v[-50:].mean() if v[-50:].mean() > 0 else 9
    if d > near or d < -0.2 or vd > dry: return None
    return dict(p=p, pivot=float(pivot), legs=legs, dep=dep, d=d, vd=float(vd), stop=float(l[legs[-1][1]]))


def sma(a, n):
    out = np.full(len(a), np.nan)
    if len(a) >= n:
        c = np.cumsum(np.insert(a, 0, 0.0)); out[n - 1:] = (c[n:] - c[:-n]) / n
    return out


def ema(a, n):
    out = np.empty(len(a)); k = 2 / (n + 1); out[0] = a[0]
    for i in range(1, len(a)): out[i] = a[i] * k + out[i - 1] * (1 - k)
    return out


def pivots_high(h, left, right):
    """Indexes of bars whose high is the highest of `left` bars before and `right` bars after."""
    out = []
    for i in range(left, len(h) - right):
        if h[i] >= h[i - left:i].max() and h[i] > h[i + 1:i + right + 1].max(): out.append(i)
    return out


def pivots_low(l, left, right):
    out = []
    for i in range(left, len(l) - right):
        if l[i] <= l[i - left:i].min() and l[i] < l[i + 1:i + right + 1].min(): out.append(i)
    return out


class S:
    """One company's series with the measures every pattern shares."""
    def __init__(self, sym, dates, o, h, l, c, v):
        self.sym, self.d = sym, dates
        self.o, self.h, self.l, self.c, self.v = (np.array(x, dtype=float) for x in (o, h, l, c, v))
        n = self.n = len(self.c); c = self.c
        self.s10, self.s20, self.s50, self.s150, self.s200 = (sma(c, k) for k in (10, 20, 50, 150, 200))
        self.e50 = ema(c, 50)
        rng = (self.h / np.where(self.l > 0, self.l, np.nan) - 1) * 100
        self.adr = float(np.nanmean(rng[-20:])); self.adr100 = float(np.nanmean(rng[-100:]))
        self.v20 = sma(self.v, 20); self.v50 = sma(self.v, 50)
        self.turn = float(np.mean(c[-20:] * self.v[-20:]) / 1e7)   # replaced by the exchange figure when one is supplied
        self.hi52, self.lo52 = float(self.h.max()), float(self.l[self.l > 0].min())
        self.last = float(c[-1])
        self.off_high = (1 - self.last / self.hi52) * 100
        self.ret = lambda k: (c[-1] / c[-1 - k] - 1) * 100 if n > k and c[-1 - k] > 0 else float('nan')

    def ok(self):
        return self.n >= 60 and self.turn >= MIN_TURNOVER_CR and self.last >= MIN_PRICE and self.adr > 0

    def uptrend(self):
        """Close above a rising 50-day average that is above the 200-day (150-day when history is short)."""
        slow = self.s200 if not math.isnan(self.s200[-1]) else self.s150
        if math.isnan(self.s50[-1]) or math.isnan(self.s50[-21]): return False
        return self.last > self.s50[-1] and self.s50[-1] > self.s50[-21] and (math.isnan(slow[-1]) or self.s50[-1] > slow[-1])

    def stacked(self):
        slow = self.s200 if not math.isnan(self.s200[-1]) else self.s150
        return not math.isnan(self.s20[-1]) and self.s20[-1] > self.e50[-1] and (math.isnan(slow[-1]) or self.e50[-1] > slow[-1])

    def template(self, rs):
        """The eight trend conditions; returns how many hold."""
        s50, s150, s200 = self.s50[-1], self.s150[-1], self.s200[-1]
        if math.isnan(s200): return 0
        t = [self.last > s150 and self.last > s200, s150 > s200, self.s200[-1] > self.s200[-22], s50 > s150 and s50 > s200,
             self.last > s50, self.last >= self.lo52 * 1.30, self.last >= self.hi52 * 0.75, rs >= 70]
        return sum(bool(x) for x in t)


def levels(s, left, right, min_age, max_age, lookback, max_depth, min_move=20.0, move_bars=60, band=2.0, max_rej=3, h=None, l=None, c=None):
    """Resistance levels that are still standing: a swing high that ended a real rally, has not been
    closed above since, and has turned price back no more than three times."""
    h = s.h if h is None else h; l = s.l if l is None else l; c = s.c if c is None else c
    n = len(c); out = []
    for i in pivots_high(h, left, right):
        age = n - 1 - i
        if not (min_age <= age <= max_age) or i < n - lookback: continue
        lvl = h[i]
        if c[i + 1:].max() > lvl: continue                               # already closed above it
        lo_before = l[max(0, i - move_bars):i + 1].min()
        move = (lvl / lo_before - 1) * 100 if lo_before > 0 else 0
        if move < min_move: continue                                     # the level did not end a rally
        lo_i = i + 1 + int(np.argmin(l[i + 1:])); depth = (1 - l[lo_i] / lvl) * 100
        if depth > max_depth or depth < 1.5 * s.adr: continue             # too deep, or no base under it yet
        if h[i + 1:].max() > lvl * (1 + band / 100): continue             # traded well through it intraday
        near = h[i + 1:] >= lvl * (1 - band / 100); rej, k = 0, 0
        while k < len(near):                                             # count separate visits to the level
            if near[k]:
                rej += 1
                while k < len(near) and (near[k] or (k + 1 < len(near) and near[k + 1])): k += 1
            k += 1
        if rej > max_rej: continue
        out.append(dict(i=i, lvl=float(lvl), age=age, move=float(move), depth=float(depth), lo_i=lo_i, touches=rej))
    return out


def quality(parts):
    """0 to 100 from parts in [0, 1]; used only to order a list and to label it Clean, Fair or Rough."""
    return int(round(100 * sum(w * max(0.0, min(1.0, x)) for x, w in parts) / sum(w for _, w in parts)))


def vol_dry(s, k=10):
    return float(s.v[-k:].mean() / s.v50[-1]) if not math.isnan(s.v50[-1]) and s.v50[-1] > 0 else float('nan')


def hit(s, facts, draw, q, status=''):
    return dict(symbol=s.sym, facts=facts, draw=draw, q=q, status=status)


def dist(s, lvl):
    d = (1 - s.last / lvl) * 100
    return d, d / s.adr


def base_draw(s, L, label='Level'):
    return dict(level=[s.d[L['i']], round(L['lvl'], 2), label], zone=[s.d[L['i']], s.d[-1], round(float(s.l[L['i'] + 1:].min()), 2), round(L['lvl'], 2)], marks=[[s.d[L['lo_i']], round(float(s.l[L['lo_i']]), 2), 'Base low']])


def base_facts(s, L, unit='sessions'):
    d, da = dist(s, L['lvl'])
    return {'Level (Rs)': round(L['lvl'], 2), 'Below the level': f'{d:.1f}%', 'In daily ranges': round(da, 1), 'Level age': f"{L['age']} {unit}", 'Base depth': f"{L['depth']:.1f}%", 'Rally before it': f"{L['move']:.0f}%", 'Times tested': L['touches'], 'Volume, last 10 against 50': f"{vol_dry(s):.2f}x"}


def base_q(s, L, da):
    return quality([(1 - da / 3, 3), (1 - L['depth'] / 35, 2), (1.3 - vol_dry(s), 2), (1 - s.off_high / 25, 2), (1 if s.uptrend() else 0, 2)])


# ---------------------------------------------------------------- the patterns
def daily_base(s, rs):
    best = None
    for L in levels(s, 10, 10, 20, 90, 250, min(35.0, 8.5 * s.adr100)):
        d, da = dist(s, L['lvl'])
        if -0.2 <= d and da <= 3 and s.last > (s.s200[-1] if not math.isnan(s.s200[-1]) else 0):
            if best is None or L['lvl'] > best[0]['lvl']: best = (L, da)
    if best:
        L, da = best
        return hit(s, base_facts(s, L), base_draw(s, L), base_q(s, L, da), 'At the level' if da <= 1 else 'Forming')


def weekly_base(s, rs):
    """On three years of weekly bars: a level 17 to 78 weeks old that is the top of the last two years
    (within 8%), so a base under an older, higher top from a past fall is left out."""
    if s.wc is None or len(s.wc) < 70: return None
    H, Lw, C = s.wh, s.wl, s.wc; top = H[-104:].max(); best = None
    if not s.last > C[-40:].mean(): return None                            # above the 40-week average
    for L in levels(s, 4, 4, 17, 78, 104, min(45.0, 8.5 * s.adr100 * 1.3), move_bars=13, h=H, l=Lw, c=C):
        if L['lvl'] < top * 0.92: continue
        d, da = dist(s, L['lvl'])
        if -0.2 <= d and da <= 3 and (best is None or L['lvl'] > best[0]['lvl']): best = (L, da)
    if best:
        L, da = best; d = dist(s, L['lvl'])[0]
        facts = {'Level (Rs)': round(L['lvl'], 2), 'Below the level': f'{d:.1f}%', 'In daily ranges': round(da, 1), 'Level age': f"{L['age']} weeks", 'Base depth': f"{L['depth']:.1f}%", 'Rally before it': f"{L['move']:.0f}%", 'Times tested': L['touches'], 'Level is': 'The 2-year high' if L['lvl'] >= top * 0.999 else f"{(1 - L['lvl'] / top) * 100:.0f}% under the 2-year high"}
        draw = dict(level=[s.wd[L['i']], round(L['lvl'], 2), 'Level'], zone=[s.wd[L['i']], s.d[-1], round(float(Lw[L['i'] + 1:].min()), 2), round(L['lvl'], 2)], marks=[[s.wd[L['lo_i']], round(float(Lw[L['lo_i']]), 2), 'Base low']])
        return hit(s, facts, draw, base_q(s, L, da), 'At the level' if da <= 1 else 'Forming')


def near_pivot(s, rs):
    best = None
    for L in levels(s, 10, 10, 15, 170, 250, 40.0):
        d, da = dist(s, L['lvl'])
        if -0.2 <= d and da <= 1 and (best is None or da < best[1]): best = (L, da)
    slow = s.s200[-1] if not math.isnan(s.s200[-1]) else s.s150[-1]
    if best and s.last > s.s50[-1] and (math.isnan(slow) or s.last > slow):
        L, da = best; f = base_facts(s, L)
        return hit(s, f, base_draw(s, L, 'Pivot'), quality([(1 - da, 3), (1.3 - vol_dry(s), 2), (1 - L['depth'] / 40, 1), (rs / 99, 2)]), 'At the level')


VCP = dict(ratio=0.75, last_max=3.0, dry=0.8, min_legs=2)                # chosen on the walk-forward test in vcp2.py


def vcp(s, rs):
    if s.wc is None or not weekly_trend(s.wd, s.wh, s.wl, s.wc, s.d[-1], s.last) or not s.last > s.s50[-1]: return None
    r = contractions(s.h, s.l, s.c, s.v, s.adr, **VCP)
    if not r: return None
    marks = [[s.d[b], round(float(s.l[b]), 2), f'{dep:.0f}%'] for (a, b), dep in zip(r['legs'], r['dep'])]
    facts = {'Pullbacks': ' · '.join(f'{x:.0f}%' for x in r['dep']), 'Latest, in daily ranges': round(r['dep'][-1] / s.adr, 1), 'Pivot (Rs)': round(r['pivot'], 2), 'Below the pivot': f"{r['d']:.1f}%", 'Base age': f"{s.n - 1 - r['p']} sessions", 'Volume, last 10 against 50': f"{r['vd']:.2f}x", 'Last low (Rs)': round(r['stop'], 2)}
    q = quality([(1 - r['dep'][-1] / (3 * s.adr), 3), (len(r['dep']) / 3, 2), (1 - r['vd'], 2), (1 - r['d'] / 8, 2), (rs / 99, 1)])
    return hit(s, facts, dict(level=[s.d[r['p']], round(r['pivot'], 2), 'Pivot'], marks=marks), q, 'Tightening')


def tight_range(s, rs):
    if not (s.stacked() and s.ret(63) >= 15 and abs(s.last / s.s20[-1] - 1) * 100 <= 8): return None
    best = None
    for k in (10, 8, 6, 5, 4):
        box = (s.h[-k:].max() / s.l[-k:].min() - 1) * 100; allowed = s.adr100 * (1.0 + 0.12 * (k - 4))
        if box <= allowed: best = (k, box, allowed); break
    spread = (s.c[-5:].max() / s.c[-5:].min() - 1) * 100
    if best is None and spread <= 0.5 * s.adr100: best = (5, (s.h[-5:].max() / s.l[-5:].min() - 1) * 100, s.adr100)
    if best is None: return None
    k, box, allowed = best; hi, lo = float(s.h[-k:].max()), float(s.l[-k:].min())
    facts = {'Sessions in the range': k, 'Range': f'{box:.1f}%', 'Usual daily range': f'{s.adr100:.1f}%', 'Range in daily ranges': round(box / s.adr100, 1), '3-month gain': f'{s.ret(63):.0f}%', 'Volume, last 5 against 50': f'{vol_dry(s, 5):.2f}x'}
    return hit(s, facts, dict(zone=[s.d[-k], s.d[-1], round(lo, 2), round(hi, 2)], level=[s.d[-k], round(hi, 2), 'Range top']), quality([(1 - box / (2 * allowed), 3), (k / 10, 2), (1.2 - vol_dry(s, 5), 2), (rs / 99, 1)]), 'Tight')


def flag(s, rs):
    n = s.n; best = None
    for top in range(n - 16, n - 4):                                      # the pole's high: 4 to 15 sessions ago
        if s.h[top] < s.h[max(0, top - 5):n].max(): continue
        for pl in (5, 8, 12, 15):
            a = top - pl
            if a < 0: continue
            lo_i = a + int(np.argmin(s.l[a:top + 1])); gain = (s.h[top] / s.l[lo_i] - 1) * 100
            new_high = lo_i < 5 or s.h[top] >= s.h[max(0, lo_i - 60):lo_i].max() * 1.03   # the pole carried the price clear of its old highs
            calm = math.isnan(s.s50[lo_i]) or s.l[lo_i] >= s.s50[lo_i] * 0.93            # and started near the 50-day average, not from a sell-off
            new_high = new_high and calm
            if gain >= max(18.0, 5 * s.adr100) and new_high and (best is None or gain > best[2]): best = (top, lo_i, gain)
    if best is None: return None
    top, lo_i, gain = best; fh, fl, fc = s.h[top + 1:], s.l[top + 1:], s.c[top + 1:]; m = len(fc)
    pole = s.h[top] - s.l[lo_i]; back = (s.h[top] - fl.min()) / pole * 100
    if back > 40 or fc.max() > s.h[top] or not s.stacked() or s.last < s.s20[-1]: return None
    x = np.arange(m); up = np.polyfit(x, fh, 1) if m >= 3 else (0, fh.max()); dn = np.polyfit(x, fl, 1) if m >= 3 else (0, fl.min())
    su, sd = up[0] / s.last * 100, dn[0] / s.last * 100                    # slope of the flag's highs and lows, % a session
    if su > 0.25 * s.adr100 / 3 or su < -s.adr100 / 2: return None         # highs must drift flat or down, gently
    pv = float(s.v[lo_i:top + 1].mean()); fv = float(s.v[top + 1:].mean())
    if fv > 0.85 * pv: return None                                         # the pause must be on lighter volume
    kind = 'Pennant' if sd > 0.05 and su < -0.05 else 'Flag'
    u0, u1 = up[1], up[1] + up[0] * (m - 1); d0, d1 = dn[1], dn[1] + dn[0] * (m - 1)
    to_up = (u1 / s.last - 1) * 100
    facts = {'Kind': kind, 'Pole gain': f'{gain:.0f}%', 'Pole length': f'{top - lo_i} sessions', 'Flag length': f'{m} sessions', 'Given back': f'{back:.0f}% of the pole', 'Flag volume against pole': f'{fv / pv:.2f}x', 'To the upper line': f'{to_up:.1f}%'}
    draw = dict(lines=[[s.d[lo_i], round(float(s.l[lo_i]), 2), s.d[top], round(float(s.h[top]), 2), 'pole'], [s.d[top + 1], round(float(u0), 2), s.d[-1], round(float(u1), 2), 'up'], [s.d[top + 1], round(float(d0), 2), s.d[-1], round(float(d1), 2), 'dn']])
    return hit(s, facts, draw, quality([(1 - back / 40, 3), (gain / 40, 2), (1 - fv / pv, 2), (1 - abs(to_up) / (2 * s.adr), 1), (rs / 99, 1)]), 'In the flag')


def ema50_pullback(s, rs):
    slow = s.s200[-1] if not math.isnan(s.s200[-1]) else s.s150[-1]
    if math.isnan(slow) or s.n < 130: return None
    d = (s.last / s.e50[-1] - 1) * 100
    if not (abs(d) <= 3 and s.e50[-1] > slow and s.e50[-1] > s.e50[-11] and s.ret(126) >= 30 and s.ret(21) <= 5 and s.last >= s.lo52 * 1.3): return None
    days = int(np.sum(np.abs(s.c[-10:] / s.e50[-10:] - 1) <= 0.03))
    facts = {'From the 50-day EMA': f'{d:+.1f}%', '50-day EMA (Rs)': round(float(s.e50[-1]), 2), 'Sessions near it, of last 10': days, '6-month gain': f'{s.ret(126):.0f}%', '1-month change': f'{s.ret(21):+.1f}%', 'Volume, last 5 against 50': f'{vol_dry(s, 5):.2f}x'}
    return hit(s, facts, dict(ma='e50'), quality([(1 - abs(d) / 3, 3), (1.2 - vol_dry(s, 5), 2), (s.ret(126) / 80, 2), (rs / 99, 2)]), 'On the average')


def rs_before_price(s, rs, benches):
    look = 60; gap = (1 - s.last / s.c[-look:].max()) * 100; age = look - 1 - int(np.argmax(s.c[-look:]))
    if gap < 1.0 or age < 10 or not s.last > s.s50[-1] or rs < 55: return None    # the price high is at least 10 sessions old
    for name, bench in benches:                                            # against the mid and small-cap index first, then the Nifty 500
        keep = [i for i, d in enumerate(s.d) if d in bench]
        if len(keep) < look: continue
        line = s.c[keep] / np.array([bench[s.d[i]] for i in keep])
        if line[-3:].max() < line[-look:].max(): continue                  # the strength line made a new high in the last 3 sessions
        y = bool(line[-3:].max() >= line.max())
        facts = {'Strength line': 'New 52-week high' if y else 'New 3-month high', 'Against': name, 'Price below its high': f'{gap:.1f}%', 'Price high was': f'{age} sessions ago', 'Strength rank': rs}
        return hit(s, facts, dict(level=[s.d[-look + int(np.argmax(s.c[-look:]))], round(float(s.c[-look:].max()), 2), 'Its own high']), quality([(1 if y else 0.5, 3), (1 - gap / 15, 2), (rs / 99, 3)]), 'This week')


def ipo_base(s, rs, full):
    """A listing of the last year still inside its first base. Needs only a few sessions of prices, so it is run
    before the 60-session floor the other patterns need. Give the listing date when the server has it; without one,
    a series shorter than 200 sessions is taken as a recent listing."""
    if s.n >= 200 or s.n < 8: return None
    lvl_i = 0 if s.h[1] <= s.h[0] else next((i for i in pivots_high(s.h, 1, 2) if s.h[i] > s.h[0]), None)
    if lvl_i is None or s.n - 1 - lvl_i < 3: return None
    lvl = s.h[lvl_i]
    if s.c[lvl_i + 1:].max() > lvl: return None
    depth = (1 - s.l[lvl_i + 1:].min() / lvl) * 100; d, da = dist(s, lvl)
    if depth > 35 or not (-0.2 <= d <= 8) or s.n - 1 - lvl_i > 126: return None
    lo = lvl_i + 1 + int(np.argmin(s.l[lvl_i + 1:]))
    facts = {'Listed': s.d[0], 'Sessions since listing': s.n, 'Level (Rs)': round(float(lvl), 2), 'Below the level': f'{d:.1f}%', 'Base age': f'{s.n - 1 - lvl_i} sessions', 'Base depth': f'{depth:.1f}%', 'Level is': 'Listing-day high' if lvl_i == 0 else 'First high after listing'}
    return hit(s, facts, dict(level=[s.d[lvl_i], round(float(lvl), 2), 'Level'], zone=[s.d[lvl_i], s.d[-1], round(float(s.l[lvl_i + 1:].min()), 2), round(float(lvl), 2)], marks=[[s.d[lo], round(float(s.l[lo]), 2), 'Base low']]), quality([(1 - d / 8, 3), (1 - depth / 35, 2), (min(1, (s.n - 1 - lvl_i) / 15), 1)]), 'At the level' if da <= 1 else 'Forming')


def big_reversal(s, rs):
    for k in range(1, 6):                                                  # a signal in the last 5 sessions, newest first
        i = s.n - k
        if i < 60: break
        pc = s.c[i - 1]; cm = (s.c[i] / pc - 1) * 100
        slow = s.s200[i - 1] if not math.isnan(s.s200[i - 1]) else s.s150[i - 1]
        down = pc < s.s50[i - 1] and (math.isnan(slow) or s.s50[i - 1] < slow) and pc <= s.h[max(0, i - 126):i].max() * 0.8
        vx = s.v[i] / s.v20[i - 1] if s.v20[i - 1] > 0 else 0
        pos = (s.c[i] - s.l[i]) / (s.h[i] - s.l[i]) if s.h[i] > s.l[i] else 0
        if down and cm >= max(7.0, 2.5 * s.adr100) and vx >= 2.5 and pos >= 0.7 and s.last >= s.l[i]:
            facts = {'When': 'Today' if k == 1 else f'{k - 1} session{"s" if k > 2 else ""} ago', "Day's close against the day before": f'{cm:+.1f}%', 'In daily ranges': round(cm / s.adr100, 1), 'Volume against its 20-day average': f'{vx:.1f}x', 'Closed in the day\'s range at': f'{pos * 100:.0f}%', 'Since that close': f'{(s.last / s.c[i] - 1) * 100:+.1f}%', 'Below its 6-month high before': f'{(1 - pc / s.h[max(0, i - 126):i].max()) * 100:.0f}%'}
            return hit(s, facts, dict(marks=[[s.d[i], round(float(s.l[i]), 2), 'Reversal day']], level=[s.d[i], round(float(s.l[i]), 2), 'Low of the day']), quality([(cm / (5 * s.adr100), 3), (vx / 6, 3), (pos, 2)]), 'Today' if k == 1 else 'This week')


def shakeout(s, rs):
    """A fall of at least one usual daily range that was taken back: the close is above the pre-fall close the same
    day or within three sessions. The low may go under the averages (that is the shakeout); the close may not."""
    for k in range(1, 6):                                                  # the recovery was confirmed in the last 5 sessions
        r = s.n - k
        for f in range(r, r - 4, -1):                                      # the fall: the same day, or up to 3 sessions earlier
            if f < 60: continue
            pre = s.c[f - 1]; slow = s.s200[r] if not math.isnan(s.s200[r]) else s.s150[r]
            low = s.l[f:r + 1].min(); fall = (1 - low / pre) * 100
            if fall < 1.0 * s.adr or s.c[r] < pre * 0.998: continue          # not a real fall, or not taken back
            if f < r and s.c[f:r].max() >= pre * 0.998: continue             # it was already taken back earlier
            trend = s.c[r] > s.s50[r] and s.s50[r] > s.s50[r - 20] and (math.isnan(slow) or (s.c[r] > slow and s.s50[r] > slow)) and pre >= s.h[max(0, f - 120):f].max() * 0.85
            if not trend or s.c[r:].min() < low: continue                    # no uptrend, or it has since closed under the shakeout low
            li = f + int(np.argmin(s.l[f:r + 1])); under = '50-day average' if low < s.s50[f] else '20-day average' if low < s.s20[f] else 'Neither average'
            facts = {'Low was': f'{s.n - 1 - li} sessions ago', 'Fall to the low': f'{fall:.1f}%', 'In daily ranges': round(fall / s.adr, 1), 'Went under': under, 'Taken back': 'The same day' if r == f else f'In {r - f} session{"s" if r - f > 1 else ""}', 'Since then': f'{(s.last / s.c[r] - 1) * 100:+.1f}%', 'Above the 50-day average': f'{(s.last / s.s50[-1] - 1) * 100:.1f}%'}
            q = quality([(fall / (3 * s.adr), 2), (1 - (r - f) / 3, 2), (1 if under.startswith('50') else 0.6 if under.startswith('20') else 0.2, 3), (rs / 99, 2)])
            return hit(s, facts, dict(marks=[[s.d[li], round(float(low), 2), 'Shakeout low']], level=[s.d[f - 1], round(float(pre), 2), 'Close before the fall'], ma='s50'), q, 'Taken back ' + ('today' if k == 1 else f'{k - 1} session{"s" if k > 2 else ""} ago'))


def fresh_breakout(s, rs):
    """New: closed above a standing base level in the last 5 sessions, on volume, and still close to it."""
    for k in range(1, 6):
        i = s.n - k; sub = S(s.sym, s.d[:i], s.o[:i], s.h[:i], s.l[:i], s.c[:i], s.v[:i]) if i >= 80 else None
        if sub is None: continue
        for L in levels(sub, 10, 10, 20, 170, 250, 40.0):
            vx = s.v[i] / s.v50[i - 1] if s.v50[i - 1] > 0 else 0
            pos = (s.c[i] - s.l[i]) / (s.h[i] - s.l[i]) if s.h[i] > s.l[i] else 0
            ext = (s.last / L['lvl'] - 1) * 100
            if s.c[i] > L['lvl'] and s.c[i - 1] <= L['lvl'] and vx >= 1.5 and pos >= 0.5 and 0 <= ext <= 2 * s.adr and s.c[i:].min() >= L['lvl'] * 0.99:
                facts = {'Closed above': f"Rs {L['lvl']:.2f}", 'When': 'Today' if k == 1 else f'{k - 1} session{"s" if k > 2 else ""} ago', 'Volume that day against 50-day': f'{vx:.1f}x', 'Now above the level': f'{ext:.1f}%', 'In daily ranges': round(ext / s.adr, 1), 'Level age': f"{L['age']} sessions", 'Base depth': f"{L['depth']:.1f}%"}
                return hit(s, facts, dict(level=[s.d[L['i']], round(L['lvl'], 2), 'Level'], marks=[[s.d[i], round(float(s.h[i]), 2), 'Close above']]), quality([(vx / 4, 3), (1 - ext / (2 * s.adr), 2), (pos, 1), (rs / 99, 2)]), 'Today' if k == 1 else 'This week')


PATTERNS = [('daily_base', 'Daily base', daily_base), ('weekly_base', 'Weekly base', weekly_base), ('near_pivot', 'Near pivot', near_pivot), ('vcp', 'Volatility contraction (VCP)', vcp),
            ('tight_range', 'Tight range', tight_range), ('flag', 'Flag', flag), ('ema50_pullback', '50-day EMA pullback', ema50_pullback), ('rs_before_price', 'New RS high before price', rs_before_price),
            ('ipo_base', 'IPO base', ipo_base), ('big_reversal', 'Big reversal', big_reversal), ('shakeout', 'Shakeout', shakeout), ('fresh_breakout', 'Fresh breakout', fresh_breakout)]


def weekly_bars(dates: Sequence[str], h: Sequence[float], l: Sequence[float], c: Sequence[float]):
    """Weekly high, low and close from daily bars, dated on each week's last trading day (ISO weeks)."""
    from datetime import date as _d
    wd: List[str] = []; wh: List[float] = []; wl: List[float] = []; wc: List[float] = []; key = None
    for d, hi, lo, cl in zip(dates, h, l, c):
        k = _d.fromisoformat(d[:10]).isocalendar()[:2]
        if k == key:
            wd[-1] = d; wh[-1] = max(wh[-1], hi); wl[-1] = min(wl[-1], lo); wc[-1] = cl
        else:
            wd.append(d); wh.append(hi); wl.append(lo); wc.append(cl); key = k
    return np.array(wd), np.array(wh, dtype=float), np.array(wl, dtype=float), np.array(wc, dtype=float)


def strength_ranks(series: Dict[str, "S"]) -> Dict[str, int]:
    """Strength rank 1 to 99: each stock's weighted one-year return against every other stock scanned."""
    score = {k: float(np.nansum([0.4 * s.ret(63), 0.2 * s.ret(126), 0.2 * s.ret(189), 0.2 * s.ret(min(s.n - 1, 245))])) for k, s in series.items()}
    order = sorted(score, key=score.get)
    return {k: max(1, min(99, int(round(99 * (i + 1) / len(order))))) for i, k in enumerate(order)}


def scan(s: "S", rank: Optional[int], benches, young: bool = False) -> List[Dict[str, Any]]:
    """Every pattern this one company meets today. `young` (a listing with too few sessions for the averages): IPO base only."""
    out = []
    for pid, _name, f in PATTERNS:
        if young and pid != "ipo_base":
            continue
        try:
            r = f(s, rank or 0, benches) if pid == "rs_before_price" else f(s, rank or 0, s.n) if pid == "ipo_base" else f(s, rank or 0)
        except Exception:
            r = None
        if r:
            r["pattern"] = pid; r["rs"] = rank; r["adr"] = round(s.adr, 2); r["turn"] = round(s.turn, 1); r["clean"] = clean_label(r.get("q"))
            out.append(r)
    return out
