from fastapi import FastAPI, APIRouter, HTTPException, Depends, File, Form, UploadFile, status
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import List, Optional
from typing import Literal
import uuid
from datetime import datetime, timezone
from time import monotonic, time
from urllib.parse import urlencode
from urllib.request import urlopen
import asyncio
import bcrypt
import jwt
import re
import shutil
from html import escape
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from fastapi.responses import FileResponse
# from email_service import send_lead_emails, send_service_enquiry_email, EmailNotConfigured
from backend.email_service import send_lead_emails, send_service_enquiry_email, EmailNotConfigured


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')
CONTENT_STORAGE_DIR = ROOT_DIR / "content_uploads"
CONTENT_STORAGE_DIR.mkdir(exist_ok=True)

logging.basicConfig(level=logging.INFO,
                    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api_router = APIRouter(prefix="/api")

# Kept on the server so provider symbols and credentials never reach the browser.
# These global-market instruments were verified against the configured Finnhub plan.
MARKET_TICKER_INSTRUMENTS = [
    {"name": "Apple", "symbol": "AAPL", "category": "US equity", "currency": "USD"},
    {"name": "Microsoft", "symbol": "MSFT", "category": "US equity", "currency": "USD"},
    {"name": "NVIDIA", "symbol": "NVDA", "category": "US equity", "currency": "USD"},
    {"name": "SPDR S&P 500 ETF", "symbol": "SPY", "category": "US ETF", "currency": "USD"},
    {"name": "Invesco QQQ ETF", "symbol": "QQQ", "category": "US ETF", "currency": "USD"},
    {"name": "SPDR Dow Jones ETF", "symbol": "DIA", "category": "US ETF", "currency": "USD"},
]
MARKET_TICKER_CACHE_SECONDS = 60
_market_ticker_cache = {"items": None, "fetched_at": 0.0}

# Content CMS configuration. Admin identities are provisioned via environment
# variables only; there is deliberately no registration endpoint.
CONTENT_TYPES = {"ARTICLE", "PDF", "SPREADSHEET", "IMAGE", "FILE"}
CONTENT_STATUSES = {"DRAFT", "PUBLISHED"}
UPLOAD_TYPES = {
    ".pdf": {"application/pdf"},
    ".xlsx": {"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"},
    ".xls": {"application/vnd.ms-excel"},
    ".csv": {"text/csv", "application/csv", "application/vnd.ms-excel"},
    ".png": {"image/png"},
    ".jpg": {"image/jpeg"},
    ".jpeg": {"image/jpeg"},
    ".webp": {"image/webp"},
}
MAX_UPLOAD_BYTES = 15 * 1024 * 1024
ADMIN_TOKEN_TTL_SECONDS = 60 * 60 * 8
_login_attempts = {}
bearer_scheme = HTTPBearer(auto_error=False)


# ---------- Models ----------
class ContactMessage(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    email: EmailStr
    phone: Optional[str] = None
    investment_size: Optional[str] = None
    subject: Optional[str] = None
    message: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ContactCreate(BaseModel):
    name: str
    email: EmailStr
    phone: Optional[str] = None
    investment_size: Optional[str] = None
    subject: Optional[str] = None
    message: str


class ServiceEnquiry(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    email: EmailStr
    phone: str
    services: List[str]
    message: str
    source: str = "Services Page"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ServiceEnquiryCreate(BaseModel):
    name: str
    email: EmailStr
    phone: str
    services: List[str]
    message: str


class AdminLogin(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=256)


class ContentInput(BaseModel):
    title: str = Field(min_length=3, max_length=180)
    slug: Optional[str] = Field(default=None, max_length=200)
    excerpt: str = Field(default="", max_length=500)
    contentType: Literal["ARTICLE", "PDF", "SPREADSHEET", "IMAGE", "FILE"]
    articleBody: str = Field(default="", max_length=100_000)
    coverImageUrl: Optional[str] = Field(default=None, max_length=1000)
    fileKey: Optional[str] = Field(default=None, max_length=255)
    author: str = Field(default="Nishant Jain", max_length=120)
    status: Literal["DRAFT", "PUBLISHED"] = "DRAFT"


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug[:180] or "untitled"


def content_public_view(doc):
    return {key: doc.get(key) for key in (
        "id", "title", "slug", "excerpt", "contentType", "articleBody", "coverImageUrl",
        "fileUrl", "originalFileName", "mimeType", "fileSize", "author", "status",
        "publishedAt", "createdAt", "updatedAt",
    )}


def content_admin_view(doc):
    result = content_public_view(doc)
    result["fileKey"] = doc.get("fileKey")
    return result


def markdown_to_safe_html(markdown: str) -> str:
    """Small, deliberately limited Markdown renderer; all input is escaped first."""
    lines = markdown.replace("\r\n", "\n").split("\n")
    rendered, in_list = [], False
    for line in lines:
        raw = escape(line.strip())
        if raw.startswith("- ") or raw.startswith("* "):
            if not in_list:
                rendered.append("<ul>")
                in_list = True
            rendered.append(f"<li>{raw[2:]}</li>")
            continue
        if in_list:
            rendered.append("</ul>")
            in_list = False
        if not raw:
            continue
        if raw.startswith("### "):
            rendered.append(f"<h3>{raw[4:]}</h3>")
        elif raw.startswith("## "):
            rendered.append(f"<h2>{raw[3:]}</h2>")
        elif raw.startswith("# "):
            rendered.append(f"<h1>{raw[2:]}</h1>")
        else:
            raw = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", raw)
            raw = re.sub(r"(?<!\*)\*([^*]+)\*(?!\*)", r"<em>\1</em>", raw)
            raw = re.sub(r"\[([^\]]+)\]\((https?://[^\s)]+)\)", r'<a href="\2" target="_blank" rel="noreferrer">\1</a>', raw)
            rendered.append(f"<p>{raw}</p>")
    if in_list:
        rendered.append("</ul>")
    return "".join(rendered)


def token_secret():
    secret = os.environ.get("CMS_JWT_SECRET", "").strip()
    if not secret:
        raise HTTPException(status_code=503, detail="CMS authentication is not configured.")
    return secret


async def require_admin(credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme)):
    if not credentials:
        raise HTTPException(status_code=401, detail="Administrator authentication is required.")
    try:
        payload = jwt.decode(credentials.credentials, token_secret(), algorithms=["HS256"])
        if payload.get("role") != "admin" or not payload.get("sub"):
            raise ValueError("Invalid role")
        return payload
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="Administrator session is invalid or expired.")


@api_router.get("/")
async def root():
    return {"message": "Nishant Jain PMS API"}


@api_router.get("/content")
async def public_content(content_type: Optional[str] = None):
    query = {"status": "PUBLISHED"}
    if content_type:
        normalized = content_type.upper()
        if normalized not in CONTENT_TYPES:
            raise HTTPException(status_code=400, detail="Unknown content type.")
        query["contentType"] = normalized
    docs = await db.content.find(query, {"_id": 0, "fileKey": 0}).sort("publishedAt", -1).to_list(200)
    return [content_public_view(doc) for doc in docs]


@api_router.get("/content/{slug}")
async def public_content_detail(slug: str):
    doc = await db.content.find_one({"slug": slug, "status": "PUBLISHED"}, {"_id": 0, "fileKey": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Published content was not found.")
    result = content_public_view(doc)
    if result["contentType"] == "ARTICLE":
        result["articleHtml"] = markdown_to_safe_html(result.get("articleBody") or "")
    return result


@api_router.post("/content/admin/login")
async def admin_login(payload: AdminLogin):
    now = monotonic()
    attempt = _login_attempts.get(payload.email.lower(), {"count": 0, "until": 0})
    if attempt["until"] > now:
        raise HTTPException(status_code=429, detail="Too many login attempts. Try again later.")
    admin_email = os.environ.get("CMS_ADMIN_EMAIL", "").strip().lower()
    password_hash = os.environ.get("CMS_ADMIN_PASSWORD_HASH", "").strip()
    if not admin_email or not password_hash:
        raise HTTPException(status_code=503, detail="CMS administrator is not configured.")
    valid = payload.email.lower() == admin_email
    try:
        valid = valid and bcrypt.checkpw(payload.password.encode(), password_hash.encode())
    except ValueError:
        logger.error("CMS admin password hash is invalid")
        raise HTTPException(status_code=503, detail="CMS administrator is not configured.")
    if not valid:
        count = attempt["count"] + 1
        _login_attempts[payload.email.lower()] = {"count": count, "until": now + 300 if count >= 5 else 0}
        raise HTTPException(status_code=401, detail="Invalid administrator credentials.")
    _login_attempts.pop(payload.email.lower(), None)
    token = jwt.encode({"sub": admin_email, "role": "admin", "exp": int(time()) + ADMIN_TOKEN_TTL_SECONDS}, token_secret(), algorithm="HS256")
    return {"token": token, "expiresIn": ADMIN_TOKEN_TTL_SECONDS}


@api_router.get("/content/admin/items")
async def admin_content_list(_admin=Depends(require_admin)):
    docs = await db.content.find({}, {"_id": 0}).sort("updatedAt", -1).to_list(500)
    return [content_admin_view(doc) for doc in docs]


async def resolve_file_metadata(file_key: Optional[str]):
    if not file_key:
        return {}
    doc = await db.content_assets.find_one({"key": file_key}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=400, detail="Uploaded file was not found.")
    return {
        "fileKey": file_key, "fileUrl": f"/api/content/assets/{file_key}",
        "originalFileName": doc["originalFileName"], "mimeType": doc["mimeType"], "fileSize": doc["fileSize"],
    }


@api_router.post("/content/admin/items", status_code=201)
async def admin_create_content(payload: ContentInput, admin=Depends(require_admin)):
    slug = slugify(payload.slug or payload.title)
    if await db.content.find_one({"slug": slug}):
        raise HTTPException(status_code=409, detail="A content item already uses this slug.")
    if payload.contentType == "ARTICLE" and not payload.articleBody.strip():
        raise HTTPException(status_code=400, detail="Articles require a body.")
    if payload.contentType != "ARTICLE" and not payload.fileKey:
        raise HTTPException(status_code=400, detail="Resources require an uploaded file.")
    now = datetime.now(timezone.utc).isoformat()
    doc = payload.model_dump()
    doc.update(await resolve_file_metadata(payload.fileKey))
    doc.update({"id": str(uuid.uuid4()), "slug": slug, "createdAt": now, "updatedAt": now, "publishedAt": now if payload.status == "PUBLISHED" else None, "createdBy": admin["sub"]})
    await db.content.insert_one(doc)
    return content_public_view(doc)


@api_router.put("/content/admin/items/{content_id}")
async def admin_update_content(content_id: str, payload: ContentInput, _admin=Depends(require_admin)):
    existing = await db.content.find_one({"id": content_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Content was not found.")
    slug = slugify(payload.slug or payload.title)
    duplicate = await db.content.find_one({"slug": slug, "id": {"$ne": content_id}})
    if duplicate:
        raise HTTPException(status_code=409, detail="A content item already uses this slug.")
    if payload.contentType == "ARTICLE" and not payload.articleBody.strip():
        raise HTTPException(status_code=400, detail="Articles require a body.")
    if payload.contentType != "ARTICLE" and not payload.fileKey:
        raise HTTPException(status_code=400, detail="Resources require an uploaded file.")
    update = payload.model_dump()
    update.update(await resolve_file_metadata(payload.fileKey))
    update.update({"slug": slug, "updatedAt": datetime.now(timezone.utc).isoformat()})
    if payload.status == "PUBLISHED" and existing.get("status") != "PUBLISHED":
        update["publishedAt"] = datetime.now(timezone.utc).isoformat()
    await db.content.update_one({"id": content_id}, {"$set": update})
    return content_public_view({**existing, **update})


@api_router.delete("/content/admin/items/{content_id}", status_code=204)
async def admin_delete_content(content_id: str, _admin=Depends(require_admin)):
    existing = await db.content.find_one_and_delete({"id": content_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Content was not found.")
    for key in filter(None, [existing.get("fileKey")]):
        asset = await db.content_assets.find_one_and_delete({"key": key})
        if asset:
            (CONTENT_STORAGE_DIR / asset["storedName"]).unlink(missing_ok=True)
    return None


@api_router.post("/content/admin/upload")
async def admin_upload_content_file(file: UploadFile = File(...), _admin=Depends(require_admin)):
    original_name = Path(file.filename or "").name
    extension = Path(original_name).suffix.lower()
    if extension not in UPLOAD_TYPES or file.content_type not in UPLOAD_TYPES[extension]:
        raise HTTPException(status_code=400, detail="Unsupported file type.")
    key = str(uuid.uuid4())
    stored_name = f"{key}{extension}"
    destination = CONTENT_STORAGE_DIR / stored_name
    total = 0
    try:
        with destination.open("wb") as output:
            while chunk := await file.read(1024 * 1024):
                total += len(chunk)
                if total > MAX_UPLOAD_BYTES:
                    raise HTTPException(status_code=413, detail="File exceeds the 15 MB limit.")
                output.write(chunk)
    except Exception:
        destination.unlink(missing_ok=True)
        raise
    asset = {"key": key, "storedName": stored_name, "originalFileName": original_name, "mimeType": file.content_type, "fileSize": total}
    await db.content_assets.insert_one(asset)
    return {**asset, "fileUrl": f"/api/content/assets/{key}"}


@api_router.get("/content/assets/{key}")
async def content_asset(key: str):
    # An asset becomes public only when associated content is published.
    published = await db.content.find_one({"fileKey": key, "status": "PUBLISHED"})
    if not published:
        raise HTTPException(status_code=404, detail="Published asset was not found.")
    asset = await db.content_assets.find_one({"key": key}, {"_id": 0})
    if not asset:
        raise HTTPException(status_code=404, detail="Asset was not found.")
    path = CONTENT_STORAGE_DIR / asset["storedName"]
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Asset storage was not found.")
    return FileResponse(path, media_type=asset["mimeType"], filename=asset["originalFileName"], content_disposition_type="inline")


def _fetch_finnhub_quote(instrument, api_key):
    query = urlencode({"symbol": instrument["symbol"], "token": api_key})
    with urlopen(f"https://finnhub.io/api/v1/quote?{query}", timeout=10) as response:
        import json
        quote = json.loads(response.read().decode("utf-8"))

    price = quote.get("c")
    timestamp = quote.get("t")
    if not isinstance(price, (int, float)) or price <= 0 or not timestamp:
        raise ValueError(f"No usable quote returned for {instrument['symbol']}")

    change = quote.get("d") or 0
    change_percent = quote.get("dp") or 0
    return {
        "name": instrument["name"],
        "symbol": instrument["symbol"],
        "category": instrument["category"],
        "currency": instrument["currency"],
        "price": price,
        "change": change,
        "changePercent": change_percent,
        "direction": "up" if change > 0 else "down" if change < 0 else "flat",
        "timestamp": timestamp,
    }


@api_router.get("/market-ticker")
async def market_ticker():
    """Return cached, normalized Finnhub quotes without exposing the API key."""
    cached_items = _market_ticker_cache["items"]
    if cached_items and monotonic() - _market_ticker_cache["fetched_at"] < MARKET_TICKER_CACHE_SECONDS:
        return {"items": cached_items, "cached": True}

    api_key = os.environ.get("FINNHUB_API_KEY", "").strip()
    if not api_key:
        if cached_items:
            return {"items": cached_items, "cached": True, "stale": True}
        raise HTTPException(status_code=503, detail="Market data is not configured.")

    try:
        items = await asyncio.gather(
            *[asyncio.to_thread(_fetch_finnhub_quote, instrument, api_key) for instrument in MARKET_TICKER_INSTRUMENTS]
        )
    except Exception:
        # Deliberately do not log the provider exception: its request URL can
        # contain the token query parameter.
        logger.warning("Market ticker provider request failed")
        if cached_items:
            return {"items": cached_items, "cached": True, "stale": True}
        raise HTTPException(status_code=503, detail="Market data is temporarily unavailable.")

    _market_ticker_cache.update({"items": items, "fetched_at": monotonic()})
    return {"items": items, "cached": False, "timestamp": int(time())}


@api_router.post("/contact", response_model=ContactMessage)
async def create_contact(payload: ContactCreate):
    if not payload.name.strip() or not payload.message.strip():
        raise HTTPException(status_code=400, detail="Name and message are required")
    msg = ContactMessage(**payload.model_dump())
    doc = msg.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    # Persist the lead first so it is never lost, even if email delivery fails.
    await db.contact_messages.insert_one(doc)

    # Send email synchronously — only report success if the provider accepts it.
    try:
        await send_lead_emails(msg.model_dump(mode="json"), auto_reply=False)
    except EmailNotConfigured as e:
        logger.error("Contact email not sent: %s", e)
        raise HTTPException(
            status_code=503,
            detail="Email service is not configured yet. Your message was saved but not emailed.",
        )
    except Exception as e:
        logger.exception("Contact email delivery failed: %s", e)
        raise HTTPException(
            status_code=500,
            detail="We couldn't send your message right now. Please try again shortly.",
        )
    return msg


@api_router.get("/contact", response_model=List[ContactMessage])
async def list_contacts():
    docs = await db.contact_messages.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    for d in docs:
        if isinstance(d.get('created_at'), str):
            d['created_at'] = datetime.fromisoformat(d['created_at'])
    return docs


@api_router.post("/service-enquiry", response_model=ServiceEnquiry)
async def create_service_enquiry(payload: ServiceEnquiryCreate):
    if not payload.name.strip() or not payload.message.strip():
        raise HTTPException(status_code=400, detail="Name and message are required")
    if not payload.services:
        raise HTTPException(status_code=400, detail="Select at least one service")
    if len(payload.message.strip()) < 10:
        raise HTTPException(status_code=400, detail="Message is too short")
    enquiry = ServiceEnquiry(**payload.model_dump())
    doc = enquiry.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.service_enquiries.insert_one(doc)

    try:
        await send_service_enquiry_email(enquiry.model_dump(mode="json"))
    except EmailNotConfigured as e:
        logger.error("Service enquiry email not sent: %s", e)
        raise HTTPException(
            status_code=503,
            detail="Email service is not configured yet. Your enquiry was saved but not emailed.",
        )
    except Exception as e:
        logger.exception("Service enquiry email delivery failed: %s", e)
        raise HTTPException(
            status_code=500,
            detail="We couldn't send your enquiry right now. Please try again shortly.",
        )
    return enquiry


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
