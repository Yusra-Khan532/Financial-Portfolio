"""The feedback page ("Help us build a smarter FinLit"): POST /api/feedback saves one submission, GET /api/admin/feedback lists them for the team."""

from __future__ import annotations

import csv
import io
import json
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel, Field, field_validator

from .auth import crypto
from .auth.routes import NO_STORE, admin_ctx, fail, limit
from .security import client_ip

router = APIRouter(prefix="/api")

FEATURES = ["Stock Screener", "Model-Based Scoring / FinLit IQ", "Set Your Own Model", "Advanced Valuation Tools", "DCF and Financial Analysis", "Extended DuPont Analysis",
            "Chart Builder and Correlation", "Portfolio Import and Analysis", "IPO Analysis", "Company News", "Discussion Forum", "Macro Economics Simulator", "Glossary", "Other"]
IMPROVE = ["User interface and navigation", "Data accuracy and reliability", "More financial metrics and ratios", "Better stock screening capabilities", "More detailed company analysis",
           "Faster loading and performance", "Better explanations of financial indicators", "Other"]
WANTED = ["Advanced portfolio analytics", "Stock comparison and peer benchmarking", "Custom alerts and notifications", "More historical financial data", "Sector-wise analysis",
          "Mutual fund analysis", "AI-assisted financial explanations", "More macroeconomic indicators", "Community discussions and investor insights", "Mobile application", "Other"]


def _text(v: Optional[str]) -> str:
    return (v or "").strip()[:2000]


class FeedbackIn(BaseModel):
    rating: int = Field(ge=1, le=5)
    nps: int = Field(ge=0, le=10)
    navigation: int = Field(ge=1, le=5)
    data_quality: int = Field(ge=1, le=5)
    tools: int = Field(ge=1, le=5)
    speed: Optional[int] = Field(default=None, ge=1, le=5)
    used: List[str] = Field(default_factory=list, max_length=20)
    most_valuable: Optional[str] = Field(default=None, max_length=80)
    hard_to_use: Optional[str] = Field(default=None, max_length=2000)
    improve: List[str] = Field(default_factory=list, max_length=20)
    wanted: List[str] = Field(default_factory=list, max_length=20)
    likes: Optional[str] = Field(default=None, max_length=2000)
    fix_now: Optional[str] = Field(default=None, max_length=2000)
    expected: Optional[str] = Field(default=None, max_length=2000)
    early_access: bool = False
    contact_ok: bool = False
    email: Optional[str] = Field(default=None, max_length=254)
    website: Optional[str] = Field(default=None, max_length=100)   # hidden field: only bots fill it in

    @field_validator("used", "improve", "wanted")
    @classmethod
    def _short(cls, v: List[str]) -> List[str]:
        return [x.strip()[:80] for x in v if isinstance(x, str) and x.strip()][:20]


@router.post("/feedback", status_code=202)
async def send_feedback(request: Request, body: FeedbackIn):
    """Always answers the same way. The email is kept only when the person asked to be contacted."""
    ip = client_ip(request.scope, request.app.state.settings.client_ip_header)
    await limit(request, "feedback-ip", ip, 6, 3600)
    email: Optional[str] = None
    if body.contact_ok and _text(body.email):
        email = crypto.normalise_email(body.email or "")
        if not email:
            raise fail(422, "invalid_email", "Please enter a valid email address, or leave it empty.")
    if not body.website:
        answers: Dict[str, object] = body.model_dump(exclude={"website", "email", "rating", "nps", "contact_ok", "early_access"})
        for k in ("hard_to_use", "likes", "fix_now", "expected"):
            answers[k] = _text(answers.get(k))  # type: ignore[arg-type]
        async with request.app.state.store.pool.acquire() as conn:
            await conn.execute("INSERT INTO feedback (rating, nps, contact_ok, early_access, email, answers) VALUES ($1, $2, $3, $4, $5, $6::jsonb)",
                               body.rating, body.nps, body.contact_ok, body.early_access, email, json.dumps(answers))
    return Response(content='{"status":"ok"}', status_code=202, media_type="application/json", headers=NO_STORE)


@router.get("/admin/feedback")
async def feedback_list(request: Request, format: str = "json", _ctx=Depends(admin_ctx)):
    async with request.app.state.store.pool.acquire() as conn:
        rows = await conn.fetch("SELECT id, created_at, rating, nps, contact_ok, early_access, email, answers FROM feedback ORDER BY created_at DESC LIMIT 5000")
        total = await conn.fetchval("SELECT count(*) FROM feedback")
    items = [{"id": r["id"], "at": r["created_at"].isoformat(), "rating": r["rating"], "nps": r["nps"], "contactOk": r["contact_ok"], "earlyAccess": r["early_access"],
              "email": r["email"], "answers": json.loads(r["answers"]) if isinstance(r["answers"], str) else r["answers"]} for r in rows]
    if format == "csv":
        buf = io.StringIO(); w = csv.writer(buf)
        w.writerow(["id", "at", "rating", "recommend_0_10", "navigation", "data", "tools", "speed", "used", "most_valuable", "hard_to_use", "improve", "wanted", "likes", "fix_now", "expected", "early_access", "contact_ok", "email"])
        for i in items:
            a = i["answers"]
            w.writerow([i["id"], i["at"], i["rating"], i["nps"], a.get("navigation"), a.get("data_quality"), a.get("tools"), a.get("speed"), "; ".join(a.get("used", [])), a.get("most_valuable"),
                        a.get("hard_to_use"), "; ".join(a.get("improve", [])), "; ".join(a.get("wanted", [])), a.get("likes"), a.get("fix_now"), a.get("expected"), i["earlyAccess"], i["contactOk"], i["email"] or ""])
        return Response(content=buf.getvalue(), media_type="text/csv", headers={**NO_STORE, "Content-Disposition": 'attachment; filename="finlit-feedback.csv"'})
    return Response(content=json.dumps({"total": total, "items": items[:200]}), media_type="application/json", headers=NO_STORE)
