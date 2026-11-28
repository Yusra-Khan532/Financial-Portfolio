"""Task #365 (Chinmay, 24 Nov 2026): a sentiment score for every news item and exchange filing, from a financial-news language model.

Each item gets a score from -1 (clearly negative) to +1 (clearly positive): P(positive) - P(negative) from the model, as the team's plan
(FinBERT News Sentiment Model: Project Plan, phase 2) defines it, plus the three probabilities, the model version and the time it was scored, so the
items can be re-banded or re-scored later. The bands are the plan's draft:
    +0.5 to +1   clearly positive          -0.1 to +0.1   neutral
    +0.1 to +0.5 mildly positive           -0.5 to -0.1   mildly negative       -1 to -0.5   clearly negative
It describes the wording of what was published, nothing more: it is not a view on the share and not advice.

The model (scripts/export_sentiment_model.py) is an int8 ONNX file read with onnxruntime alone, one thread, batches of 32 headlines of at most
128 tokens, so it fits the jobs container (about 300 MB while scoring). The text is the headline plus the start of the summary (the plan's
"headline plus lead"). When the model file is missing (a local run, the demo) every call returns None and nothing is stored."""

from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence

MODEL_DIR = Path(os.environ.get("SENTIMENT_MODEL_DIR", "/app/models/sentiment"))
MAX_TOKENS = 128
BATCH = 32


@dataclass(frozen=True)
class Score:
    score: float      # P(positive) - P(negative), -1 .. +1
    pos: float
    neu: float
    neg: float


def band(score: Optional[float]) -> Optional[str]:
    """The plan's five draft bands; the edges +0.1 and +0.5 belong to the band above, -0.1 and -0.5 to the band below the middle."""
    if score is None:
        return None
    if score >= 0.5:
        return "clearly_positive"
    if score >= 0.1:
        return "positive"
    if score > -0.1:
        return "neutral"
    if score > -0.5:
        return "negative"
    return "clearly_negative"


_SPACE = re.compile(r"\s+")
# "Updates: X Limited has informed the Exchange regarding 'Y'" -> "Y": the exchange's own frame says nothing about the news and drowns it
_FRAME = re.compile(r"^(?:[A-Z][\w &/-]{0,40}:\s*)?.{0,120}?\bhas informed the Exchange (?:about|regarding|that)\s*(?:a |an |the )?", re.I)


def text_of(title: Optional[str], summary: Optional[str] = None) -> str:
    """The headline without the exchange's "X has informed the Exchange regarding" frame, plus the start of the summary when it adds something
    (the tokenizer cuts the rest at 128 tokens)."""
    t = _SPACE.sub(" ", (title or "")).strip()
    t = _FRAME.sub("", t).strip(" '\"") or t
    s = _SPACE.sub(" ", (summary or "")).strip()
    if s and s.lower() not in t.lower():
        t = f"{t}. {s[:600]}" if t else s[:600]
    return t


class Model:
    def __init__(self, folder: Path):
        import numpy as np
        import onnxruntime as ort
        from tokenizers import Tokenizer

        meta = json.loads((folder / "meta.json").read_text())
        self.version: str = meta["version"]
        labels = [x.lower() for x in meta["labels"]]
        self._i = (labels.index("positive"), labels.index("neutral"), labels.index("negative"))
        opts = ort.SessionOptions()
        opts.intra_op_num_threads = int(os.environ.get("SENTIMENT_THREADS", "1"))
        opts.inter_op_num_threads = 1
        self._s = ort.InferenceSession(str(folder / "model.onnx"), opts, providers=["CPUExecutionProvider"])
        self._t = Tokenizer.from_file(str(folder / "tokenizer.json"))
        self._t.enable_truncation(MAX_TOKENS)
        self._t.enable_padding(pad_id=self._t.token_to_id("<pad>") or 1, pad_token="<pad>")
        self._np = np

    def score(self, texts: Sequence[str]) -> List[Optional[Score]]:
        np = self._np
        out: List[Optional[Score]] = []
        for i in range(0, len(texts), BATCH):
            chunk = list(texts[i:i + BATCH])
            keep = [j for j, t in enumerate(chunk) if t.strip()]
            res: List[Optional[Score]] = [None] * len(chunk)
            if keep:
                enc = self._t.encode_batch([chunk[j] for j in keep])
                ids = np.array([e.ids for e in enc], dtype=np.int64)
                mask = np.array([e.attention_mask for e in enc], dtype=np.int64)
                logits = self._s.run(["logits"], {"input_ids": ids, "attention_mask": mask})[0]
                ex = np.exp(logits - logits.max(axis=1, keepdims=True))
                p = ex / ex.sum(axis=1, keepdims=True)
                ip, iu, ineg = self._i
                for k, j in enumerate(keep):
                    pos, neu, neg = float(p[k, ip]), float(p[k, iu]), float(p[k, ineg])
                    res[j] = Score(round(pos - neg, 4), round(pos, 4), round(neu, 4), round(neg, 4))
            out.extend(res)
        return out


@lru_cache(maxsize=1)
def model() -> Optional[Model]:
    """The loaded model, or None when its files are not in the image (then nothing is scored and nothing breaks)."""
    if not (MODEL_DIR / "model.onnx").exists():
        return None
    return Model(MODEL_DIR)


# ------------------------------------------------------------------ routine filings (task #365 re-check, 28 Nov 2026)
# Filings that carry no news by nature: the model would only ever read their legal wording, so they are not scored and not averaged; the page shows
# "Routine filing". Kept to a short, explicit list built from the categories and subjects the exchanges really use (seen on the live feed of 15 large
# companies, 28 Nov 2026). Order wins, credit ratings, results, board outcomes, acquisitions, dividends and appointments are NOT routine.
_R = lambda p: re.compile(p, re.I)  # noqa: E731
ROUTINE = (
    ("esop", _R(r"^esop|^esos|^esps|\ballot\w*\b.{0,120}\b(?:esops?|esos|esps|employee stock|employees? stock|stock options?)\b"
                r"|\b(?:esops?|esos|esps)\b.{0,60}\ballot|\bgrant of (?:restricted stock units?|rsus?|(?:employee )?stock options)\b")),
    ("trading window", _R(r"trading window")),
    ("meet schedule", _R(r"\bschedule of (?:the )?(?:analysts?|investors?|institutional|con\.? ?call|\W)*meet|\bintimation of (?:analysts?|investors?|institutional)[\w /]*meet"
                         r"|\b(?:interaction|meetings?|meet)s? with (?:the )?(?:institutional |prospective )?(?:investors|analysts)\b.{0,60}\b(?:arranged|organi[sz]ed|hosted|scheduled)\b")),
    ("reg 74(5) certificate", _R(r"regulation\s*74\s*\(\s*5\s*\)|\breg\.?\s*74\s*\(\s*5\s*\)|certificate under sebi \(depositories and participants\)")),
    ("loss of share certificate", _R(r"loss of (?:share )?certificates?|duplicate share certificates?|issue of duplicate (?:share )?certificates?")),
    ("newspaper copy", _R(r"newspaper (?:publication|advertisement|ad)s?|copy of newspaper|publication of newspaper|newspaper cuttings?")),
    ("compliance certificate", _R(r"compliance certificate|certificate under reg(?:ulation)?\.?\s*(?:7\s*\(\s*3\s*\)|40\s*\(\s*9\s*\))")),
)
# Words that keep a filing out of the "meet schedule" kind whatever else it says (an outcome of a meet, a transcript or a recording is not its schedule).
_NOT_SCHEDULE = _R(r"\boutcome\b|\btranscript|\brecording\b|\bpresentation\b")


def routine_reason(kind: Optional[str], category: Optional[str], title: Optional[str]) -> Optional[str]:
    """Which routine kind a filing is (see ROUTINE), or None when it may carry news. Read from its exchange category and its subject only."""
    cat = _SPACE.sub(" ", category or "").strip().lower()
    t = _FRAME.sub("", _SPACE.sub(" ", title or "").strip()).lower()
    for name, rx in ROUTINE:
        if rx.search(cat) or rx.search(t):
            if name == "meet schedule" and _NOT_SCHEDULE.search(t):
                continue
            return name
    return None


def is_routine(kind: Optional[str], category: Optional[str], title: Optional[str]) -> bool:
    return routine_reason(kind, category, title) is not None


def scoring_text(title: Optional[str], summary: Optional[str] = None, lead: Optional[str] = None) -> str:
    """What the model reads: the headline and the start of the item's own text: the administrator's summary, else the filing's lead (its words, from the
    exchange's description or its PDF: finlit/filing_text.py). When the lead is the full text the cut title was taken from, the lead alone."""
    s, ld = (summary or "").strip(), (lead or "").strip()
    if not s and ld:
        head = _SPACE.sub(" ", title or "").strip()
        head = re.sub(r"^[^:]{1,80}:\s+", "", head)
        if head and _SPACE.sub(" ", ld).lower().startswith(head.lower()[:120]):
            return text_of(ld)
    return text_of(title, s or ld)


TEXT_RULES = "lead1"   # changes when what is read changes (scoring_text, the routine list): every item is read again, gradually, by the nightly job
# The text an item is scored from, as a hash the database computes, so an item whose text changes (its lead arrives) is scored again.
# $1 the text rules, $2 the model version, $3 the oldest day; the same item list in both queries (written out in full: no SQL is built from parts).
PENDING_SQL = """
SELECT * FROM (
  SELECT f.id, f.kind, f.category, f.title, f.summary, f.lead, f.item_date, s.feed_id AS sid, s.model AS smodel, s.text_hash AS shash,
    md5($1::text || chr(31) || coalesce(f.kind, '') || chr(31) || coalesce(f.category, '') || chr(31) || coalesce(f.title, '') || chr(31)
        || coalesce(f.summary, '') || chr(31) || coalesce(f.lead, '')) AS h
  FROM feed_items f LEFT JOIN feed_sentiment s ON s.feed_id = f.id
  WHERE f.kind IN ('news', 'result', 'document') AND f.item_date >= $3) x
WHERE x.sid IS NULL OR x.smodel <> $2 OR x.shash IS DISTINCT FROM x.h ORDER BY x.item_date DESC, x.id DESC LIMIT $4"""
LEFT_SQL = """
SELECT count(*) FROM (
  SELECT s.feed_id AS sid, s.model AS smodel, s.text_hash AS shash,
    md5($1::text || chr(31) || coalesce(f.kind, '') || chr(31) || coalesce(f.category, '') || chr(31) || coalesce(f.title, '') || chr(31)
        || coalesce(f.summary, '') || chr(31) || coalesce(f.lead, '')) AS h
  FROM feed_items f LEFT JOIN feed_sentiment s ON s.feed_id = f.id
  WHERE f.kind IN ('news', 'result', 'document') AND f.item_date >= $3) x
WHERE x.sid IS NULL OR x.smodel <> $2 OR x.shash IS DISTINCT FROM x.h"""
UPSERT_SQL = """
INSERT INTO feed_sentiment (feed_id, score, pos, neu, neg, model, scored_at, state, text_hash) VALUES ($1, $2, $3, $4, $5, $6, now(), $7, $8)
ON CONFLICT (feed_id) DO UPDATE SET score = EXCLUDED.score, pos = EXCLUDED.pos, neu = EXCLUDED.neu, neg = EXCLUDED.neg, model = EXCLUDED.model,
  scored_at = EXCLUDED.scored_at, state = EXCLUDED.state, text_hash = EXCLUDED.text_hash"""
LOOKBACK_DAYS = 730
NEUTRAL_WARN_SHARE = 0.90   # more of a kind than this reading neutral in one run: the job's status carries a warning (the fault of 28 Nov 2026)
NEUTRAL_WARN_MIN = 50       # only judged on at least this many scored items of the kind
FILINGS_SQL = "SELECT status, count(*) AS n FROM filing_reads GROUP BY status"


def sentiment_json(score: Any, state: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """An item's sentiment as the APIs give it: {"score", "band"}; a routine filing {"score": None, "band": "routine"};
    None while it is not scored, or when it had no words to read (never a made-up 0)."""
    if state == "routine":
        return {"score": None, "band": "routine"}
    if score is None or state == "empty":
        return None
    v = round(float(score), 2) + 0.0          # + 0.0: never "-0.0"
    return {"score": v, "band": band(v)}


def neutral_warning(by_kind: Dict[str, Dict[str, int]]) -> Optional[str]:
    """The warning for the job's status when more than 90% of a kind read in one run is neutral (at least 50 of that kind), else None."""
    hot = [f"{k} {round(100 * v['neutral'] / v['read'])}% neutral of {v['read']}" for k, v in sorted(by_kind.items())
           if v["read"] >= NEUTRAL_WARN_MIN and v["neutral"] / v["read"] > NEUTRAL_WARN_SHARE]
    if not hot:
        return None
    return ("most items read neutral (" + ", ".join(hot) + "): the model may be reading subject lines without the filing's own words; "
            "check the filing-text job and feed_items.lead")


async def score_pending(store, limit: int = 40000, max_minutes: float = 30.0) -> dict:
    """The nightly job: scores the items not scored yet, scored by an older model, or whose text changed since (a lead arrived), newest first, in rounds
    of 512, until none is left, `limit` is reached or `max_minutes` have passed; the next run continues. Database only, no download.
    Routine filings are stored as 'routine' with no score; an item with no words as 'empty' with no score. The result reports, by kind, how many were
    read and how many of those read neutral, and carries a warning (status 'partial', never a failure) when more than 90% of a kind read neutral."""
    import time
    from datetime import date, timedelta

    m = model()
    if m is None:
        return {"ok": True, "skipped": "no model in this image", "scored": 0}
    version = f"{m.version}+{TEXT_RULES}"
    start, done = time.monotonic(), 0
    since = date.today() - timedelta(days=LOOKBACK_DAYS)
    by_kind: Dict[str, Dict[str, int]] = {}
    routine = empty = with_text = 0
    while done < limit and time.monotonic() - start < max_minutes * 60:
        async with store.pool.acquire() as conn:
            rows = await conn.fetch(PENDING_SQL, TEXT_RULES, version, since, min(512, limit - done))
        if not rows:
            break
        vals: List[tuple] = []
        todo = []
        for r in rows:
            if is_routine(r["kind"], r["category"], r["title"]):
                vals.append((r["id"], None, None, None, None, version, "routine", r["h"]))
                routine += 1
            else:
                todo.append(r)
        scores = m.score([scoring_text(r["title"], r["summary"], r["lead"]) for r in todo]) if todo else []
        for r, s in zip(todo, scores):
            if s is None:                                   # no words to read: stored as empty, no score, read again only when its text changes
                vals.append((r["id"], None, None, None, None, version, "empty", r["h"]))
                empty += 1
                continue
            vals.append((r["id"], s.score, s.pos, s.neu, s.neg, version, "read", r["h"]))
            k = by_kind.setdefault(r["kind"], {"read": 0, "neutral": 0})
            k["read"] += 1
            k["neutral"] += int(band(s.score) == "neutral")
            with_text += int(bool((r["lead"] or "").strip() or (r["summary"] or "").strip()))
        async with store.pool.acquire() as conn:
            await conn.executemany(UPSERT_SQL, vals)
        done += len(rows)
    async with store.pool.acquire() as conn:
        left = await conn.fetchval(LEFT_SQL, TEXT_RULES, version, since)
        filings = {r["status"]: int(r["n"]) for r in await conn.fetch(FILINGS_SQL)}
    res: Dict[str, Any] = {
        "ok": True, "status": "ok", "model": version, "scored": done, "left": int(left or 0), "minutes": round((time.monotonic() - start) / 60, 1),
        "routine": routine, "empty": empty, "withText": with_text,
        "byKind": {k: {**v, "neutralShare": round(v["neutral"] / v["read"], 3) if v["read"] else None} for k, v in sorted(by_kind.items())},
        "filings": {"pdfRead": filings.get("ok", 0), "pdfFailed": filings.get("failed", 0), "noText": filings.get("no_text", 0), "tooLarge": filings.get("too_large", 0)},
    }
    warn = neutral_warning(by_kind)
    if warn:
        res.update(status="partial", why=warn, warnings=[warn])
    return res
