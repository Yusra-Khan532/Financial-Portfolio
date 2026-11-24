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
from typing import List, Optional, Sequence

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


PENDING_SQL = """
SELECT f.id, f.title, f.summary FROM feed_items f LEFT JOIN feed_sentiment s ON s.feed_id = f.id
WHERE f.kind IN ('news', 'result', 'document') AND (s.feed_id IS NULL OR s.model <> $1) AND f.item_date >= $2
ORDER BY f.item_date DESC, f.id DESC LIMIT $3"""
UPSERT_SQL = """
INSERT INTO feed_sentiment (feed_id, score, pos, neu, neg, model, scored_at) VALUES ($1, $2, $3, $4, $5, $6, now())
ON CONFLICT (feed_id) DO UPDATE SET score = EXCLUDED.score, pos = EXCLUDED.pos, neu = EXCLUDED.neu, neg = EXCLUDED.neg, model = EXCLUDED.model,
  scored_at = EXCLUDED.scored_at"""
LOOKBACK_DAYS = 730


async def score_pending(store, limit: int = 40000, max_minutes: float = 30.0) -> dict:
    """The nightly job: scores the items not scored yet (or scored by an older model), newest first, in rounds of 512, until none is left, `limit`
    is reached or `max_minutes` have passed; the next run continues. Database only, no download."""
    import time
    from datetime import date, timedelta

    m = model()
    if m is None:
        return {"ok": True, "skipped": "no model in this image", "scored": 0}
    start, done = time.monotonic(), 0
    since = date.today() - timedelta(days=LOOKBACK_DAYS)
    while done < limit and time.monotonic() - start < max_minutes * 60:
        async with store.pool.acquire() as conn:
            rows = await conn.fetch(PENDING_SQL, m.version, since, min(512, limit - done))
        if not rows:
            break
        scores = m.score([text_of(r["title"], r["summary"]) for r in rows])
        vals = [(r["id"], s.score, s.pos, s.neu, s.neg, m.version) for r, s in zip(rows, scores) if s is not None]
        empty = [(r["id"], 0.0, 0.0, 1.0, 0.0, m.version) for r, s in zip(rows, scores) if s is None]   # no words to read: neutral, never re-read
        async with store.pool.acquire() as conn:
            await conn.executemany(UPSERT_SQL, vals + empty)
        done += len(rows)
    async with store.pool.acquire() as conn:
        left = await conn.fetchval("SELECT count(*) FROM feed_items f LEFT JOIN feed_sentiment s ON s.feed_id = f.id "
                                   "WHERE (s.feed_id IS NULL OR s.model <> $1) AND f.item_date >= $2", m.version, since)
    return {"ok": True, "model": m.version, "scored": done, "left": int(left or 0), "minutes": round((time.monotonic() - start) / 60, 1)}
