"""Task #365: the news sentiment score: bands, the text the model reads, the API field, and the nightly job's registration."""
from finlit import sentiment as S
from finlit.auth.routes import _sentiment_json, feed_json
from finlit.jobs.registry import build_jobs


def test_bands_follow_the_plans_draft_edges():
    assert [S.band(x) for x in (1, 0.5, 0.49, 0.1, 0.09, 0, -0.09, -0.1, -0.49, -0.5, -1)] == [
        "clearly_positive", "clearly_positive", "positive", "positive", "neutral", "neutral", "neutral", "negative", "negative", "clearly_negative", "clearly_negative"]
    assert S.band(None) is None


def test_the_model_reads_the_news_not_the_exchanges_frame():
    assert S.text_of("Updates: Kirloskar Industries Limited has informed the Exchange regarding 'Order of Rs 120 crore'") == "Order of Rs 120 crore"
    assert S.text_of("Container Corporation Of India Limited has informed the Exchange about Credit Rating") == "Credit Rating"
    assert S.text_of("Net loss widens", "Revenue fell 18% on weak demand") == "Net loss widens. Revenue fell 18% on weak demand"
    assert S.text_of("Net loss widens", "net loss widens") == "Net loss widens"


class Row(dict):
    def keys(self):
        return super().keys()


def test_feed_items_carry_their_score_or_none():
    from datetime import date
    base = dict(id=1, kind="news", title="t", symbol="X", company="X", source="s", link=None, item_date=date(2026, 11, 24), category=None, period=None,
                summary=None, auto=True, topic="other")
    assert feed_json(Row(base, s_score=0.734))["sentiment"] == {"score": 0.73, "band": "clearly_positive"}
    assert feed_json(Row(base, s_score=None))["sentiment"] is None
    assert _sentiment_json(Row(base)) is None


def test_no_model_in_the_image_means_nothing_is_scored(tmp_path, monkeypatch):
    monkeypatch.setattr(S, "MODEL_DIR", tmp_path)
    S.model.cache_clear()
    assert S.model() is None
    S.model.cache_clear()


def test_the_nightly_job_is_registered_within_the_jobs_memory():
    j = next(x for x in build_jobs({}) if x.name == "news-sentiment")
    assert j.args[0] == "score-sentiment" and j.cls == "bulk" and j.weight_mb <= 400 and j.resumable
