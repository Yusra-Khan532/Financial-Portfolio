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
from urllib.parse import urlparse
import asyncio
import bcrypt
import jwt
import nh3
import re
import shutil
import json
import requests
import csv
from io import StringIO
from html import escape
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from fastapi.responses import FileResponse, JSONResponse
from pymongo.errors import ServerSelectionTimeoutError
# from email_service import send_lead_emails, send_service_enquiry_email, EmailNotConfigured
# from backend.email_service import send_lead_emails, send_service_enquiry_email, EmailNotConfigured
from email_service import send_lead_emails, send_service_enquiry_email, EmailNotConfigured

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')
CONTENT_STORAGE_DIR = ROOT_DIR / "content_uploads"
CONTENT_STORAGE_DIR.mkdir(exist_ok=True)

logging.basicConfig(level=logging.INFO,
                    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(
    mongo_url,
    serverSelectionTimeoutMS=5000,
    connectTimeoutMS=5000,
)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api_router = APIRouter(prefix="/api")

# Kept on the server so provider symbols and credentials never reach the browser.
NIFTY_50_CONSTITUENTS_URL = "https://www.niftyindices.com/IndexConstituent/ind_nifty50list.csv"
MARKET_TICKER_INDEX_INSTRUMENTS = [
    {"name": "NIFTY 50", "symbol": "NIFTY 50", "instrument_key": "NSE_INDEX|Nifty 50", "category": "Index", "currency": "INR"},
]
MARKET_TICKER_CACHE_SECONDS = 60
NIFTY_50_CONSTITUENTS_CACHE_SECONDS = 60 * 60 * 6
_market_ticker_cache = {"items": None, "fetched_at": 0.0}
_nifty_50_constituents_cache = {"items": None, "fetched_at": 0.0}

# Content CMS configuration. Admin identities are provisioned via environment
# variables only; there is deliberately no registration endpoint.
CONTENT_TYPES = {"ARTICLE", "PDF", "SPREADSHEET", "IMAGE", "FILE"}
CONTENT_STATUSES = {"DRAFT", "PUBLISHED"}
UPLOAD_TYPES = {
    ".pdf": {"application/pdf"},
    ".xlsx": {"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"},
    ".xls": {"application/vnd.ms-excel"},
    ".csv": {"text/csv", "text/plain", "application/csv", "application/vnd.ms-excel"},
    ".png": {"image/png"},
    ".jpg": {"image/jpeg"},
    ".jpeg": {"image/jpeg"},
    ".webp": {"image/webp"},
}
MAX_UPLOAD_BYTES = 15 * 1024 * 1024
RESOURCE_MIME_TYPES = {
    "PDF": UPLOAD_TYPES[".pdf"],
    "SPREADSHEET": UPLOAD_TYPES[".xlsx"] | UPLOAD_TYPES[".xls"] | UPLOAD_TYPES[".csv"],
    "IMAGE": UPLOAD_TYPES[".png"] | UPLOAD_TYPES[".jpg"] | UPLOAD_TYPES[".jpeg"] | UPLOAD_TYPES[".webp"],
    "FILE": set().union(*UPLOAD_TYPES.values()),
}
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
    message: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ContactCreate(BaseModel):
    name: str
    email: EmailStr
    phone: Optional[str] = None
    investment_size: Optional[str] = None
    subject: Optional[str] = None
    message: str = ""


class ServiceEnquiry(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    email: EmailStr
    phone: str
    services: List[str]
    message: str = ""
    source: str = "Services Page"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ServiceEnquiryCreate(BaseModel):
    name: str
    email: EmailStr
    phone: str
    services: List[str]
    message: str = ""


class AdminLogin(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=256)


class ContentInput(BaseModel):
    title: str = Field(min_length=3, max_length=180)
    slug: Optional[str] = Field(default=None, max_length=200)
    excerpt: str = Field(default="", max_length=500)
    contentType: Literal["ARTICLE", "PDF", "SPREADSHEET", "IMAGE", "FILE"]
    articleBody: str = Field(default="", max_length=100_000)
    articleFormat: Literal["MARKDOWN", "HTML"] = "MARKDOWN"
    coverImageUrl: Optional[str] = Field(default=None, max_length=1000)
    coverImageKey: Optional[str] = Field(default=None, max_length=255)
    inlineImageKeys: List[str] = Field(default_factory=list, max_length=100)
    fileKey: Optional[str] = Field(default=None, max_length=255)
    author: str = Field(default="Nishant Jain", max_length=120)
    status: Literal["DRAFT", "PUBLISHED"] = "DRAFT"


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug[:180] or "untitled"


def content_public_view(doc):
    result = {key: doc.get(key) for key in (
        "id", "title", "slug", "excerpt", "contentType", "articleBody", "coverImageUrl",
        "fileUrl", "originalFileName", "mimeType", "fileSize", "author", "status",
        "publishedAt", "createdAt", "updatedAt",
    )}
    if doc.get("coverImageKey"):
        result["coverImageUrl"] = f"/api/content/assets/{doc['coverImageKey']}"
    return result


def content_admin_view(doc):
    result = content_public_view(doc)
    result["fileKey"] = doc.get("fileKey")
    result["coverImageKey"] = doc.get("coverImageKey")
    result["coverImageUrl"] = doc.get("coverImageUrl")
    result["inlineImageKeys"] = doc.get("inlineImageKeys") or []
    result["articleFormat"] = doc.get("articleFormat") or "MARKDOWN"
    if result["contentType"] == "ARTICLE":
        result["articleHtml"] = article_rendered_html(doc)
    return result


ARTICLE_TAGS = {
    "p", "h1", "h2", "h3", "strong", "em", "u", "ul", "ol", "li",
    "blockquote", "a", "img", "hr", "br",
}
ARTICLE_ATTRIBUTES = {
    "a": {"href", "title"},
    "img": {"src", "alt", "title"},
}


def sanitize_article_html(html: str) -> str:
    """Allow only the editorial HTML emitted by the CMS rich-text editor."""
    return nh3.clean(
        html,
        tags=ARTICLE_TAGS,
        clean_content_tags={"script", "style", "iframe", "object", "embed"},
        attributes=ARTICLE_ATTRIBUTES,
        set_tag_attribute_values={"a": {"target": "_blank"}},
        link_rel="noopener noreferrer",
        url_schemes={"https"},
        strip_comments=True,
    )


def article_rendered_html(doc) -> str:
    body = doc.get("articleBody") or ""
    if doc.get("articleFormat") == "HTML":
        return sanitize_article_html(body)
    return markdown_to_safe_html(body)


def validate_external_cover_url(url: Optional[str]):
    if not url:
        return
    parsed = urlparse(url)
    if parsed.scheme != "https" or not parsed.netloc:
        raise HTTPException(status_code=400, detail="External cover images require a valid HTTPS URL.")


def rich_article_is_empty(html: str) -> bool:
    readable = re.sub(r"<[^>]+>", "", html).replace("&nbsp;", " ").strip()
    return not readable and "<img" not in html


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
            raw = re.sub(r"\[([^\]]+)\]\((https://[^\s)]+)\)", r'<a href="\2" target="_blank" rel="noopener noreferrer">\1</a>', raw)
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
    try:
        docs = await db.content.find(query, {"_id": 0, "fileKey": 0}).sort("publishedAt", -1).to_list(200)
    except ServerSelectionTimeoutError:
        # Local development may start before MongoDB is installed/running. The
        # public index has no seeded content, so degrade to its valid empty state
        # while exposing the condition through a response header and server log.
        # Other database exceptions still surface as genuine API failures.
        logger.warning("CMS content store is unavailable; returning an empty public collection")
        return JSONResponse(
            content=[],
            status_code=200,
            headers={"X-CMS-Content-Store": "unavailable"},
        )
    return [content_public_view(doc) for doc in docs]


@api_router.get("/content/{slug}")
async def public_content_detail(slug: str):
    doc = await db.content.find_one({"slug": slug, "status": "PUBLISHED"}, {"_id": 0, "fileKey": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Published content was not found.")
    result = content_public_view(doc)
    if result["contentType"] == "ARTICLE":
        result["articleHtml"] = article_rendered_html(doc)
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


@api_router.get("/content/admin/items/{content_id}")
async def admin_content_detail(content_id: str, _admin=Depends(require_admin)):
    doc = await db.content.find_one({"id": content_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Content was not found.")
    return content_admin_view(doc)


async def resolve_file_metadata(file_key: Optional[str], content_type: Optional[str] = None):
    if not file_key:
        return {}
    doc = await db.content_assets.find_one({"key": file_key}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=400, detail="Uploaded file was not found.")
    if content_type and content_type != "ARTICLE" and doc.get("mimeType") not in RESOURCE_MIME_TYPES[content_type]:
        raise HTTPException(status_code=400, detail=f"The uploaded file is not valid for {content_type.lower()} content.")
    return {
        "fileKey": file_key, "fileUrl": f"/api/content/assets/{file_key}",
        "originalFileName": doc["originalFileName"], "mimeType": doc["mimeType"], "fileSize": doc["fileSize"],
    }


async def validate_image_assets(keys: List[Optional[str]]):
    for key in filter(None, keys):
        asset = await db.content_assets.find_one({"key": key}, {"_id": 0, "mimeType": 1})
        if not asset or not asset.get("mimeType", "").startswith("image/"):
            raise HTTPException(status_code=400, detail="Uploaded image was not found.")


@api_router.post("/content/admin/items", status_code=201)
async def admin_create_content(payload: ContentInput, admin=Depends(require_admin)):
    slug = slugify(payload.slug or payload.title)
    if await db.content.find_one({"slug": slug}):
        raise HTTPException(status_code=409, detail="A content item already uses this slug.")
    if payload.contentType == "ARTICLE" and not payload.articleBody.strip():
        raise HTTPException(status_code=400, detail="Articles require a body.")
    if payload.contentType != "ARTICLE" and not payload.fileKey:
        raise HTTPException(status_code=400, detail="Resources require an uploaded file.")
    if payload.contentType == "ARTICLE" and payload.articleFormat == "HTML":
        payload.articleBody = sanitize_article_html(payload.articleBody)
        if rich_article_is_empty(payload.articleBody):
            raise HTTPException(status_code=400, detail="Articles require a body.")
    validate_external_cover_url(payload.coverImageUrl)
    await validate_image_assets([payload.coverImageKey, *payload.inlineImageKeys])
    now = datetime.now(timezone.utc).isoformat()
    doc = payload.model_dump()
    doc.update(await resolve_file_metadata(payload.fileKey, payload.contentType))
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
    if payload.contentType == "ARTICLE" and payload.articleFormat == "HTML":
        payload.articleBody = sanitize_article_html(payload.articleBody)
        if rich_article_is_empty(payload.articleBody):
            raise HTTPException(status_code=400, detail="Articles require a body.")
    validate_external_cover_url(payload.coverImageUrl)
    await validate_image_assets([payload.coverImageKey, *payload.inlineImageKeys])
    update = payload.model_dump()
    update.update(await resolve_file_metadata(payload.fileKey, payload.contentType))
    update.update({"slug": slug, "updatedAt": datetime.now(timezone.utc).isoformat()})
    if payload.status == "PUBLISHED" and existing.get("status") != "PUBLISHED":
        update["publishedAt"] = datetime.now(timezone.utc).isoformat()
    elif payload.status == "DRAFT" and existing.get("status") == "PUBLISHED":
        update["publishedAt"] = None
    await db.content.update_one({"id": content_id}, {"$set": update})
    return content_admin_view({**existing, **update})


@api_router.delete("/content/admin/items/{content_id}", status_code=204)
async def admin_delete_content(content_id: str, _admin=Depends(require_admin)):
    existing = await db.content.find_one_and_delete({"id": content_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Content was not found.")
    asset_keys = {
        existing.get("fileKey"), existing.get("coverImageKey"),
        *(existing.get("inlineImageKeys") or []),
    }
    for key in filter(None, asset_keys):
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
        validate_uploaded_signature(extension, destination)
    except Exception:
        destination.unlink(missing_ok=True)
        raise
    asset = {"key": key, "storedName": stored_name, "originalFileName": original_name, "mimeType": file.content_type, "fileSize": total}
    # Motor mutates the inserted dictionary by adding MongoDB's ObjectId. Insert
    # a copy so the API response remains JSON serializable and never exposes it.
    await db.content_assets.insert_one(asset.copy())
    return {**asset, "fileUrl": f"/api/content/assets/{key}"}


def validate_uploaded_signature(extension: str, path: Path):
    """Confirm the file contents match the already validated extension/MIME pair."""
    header = path.read_bytes()[:65536]
    valid = {
        ".pdf": header.startswith(b"%PDF-"),
        ".xlsx": header.startswith(b"PK\x03\x04"),
        ".xls": header.startswith(b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"),
        ".png": header.startswith(b"\x89PNG\r\n\x1a\n"),
        ".jpg": header.startswith(b"\xff\xd8\xff"),
        ".jpeg": header.startswith(b"\xff\xd8\xff"),
        ".webp": header.startswith(b"RIFF") and header[8:12] == b"WEBP",
    }
    if extension == ".csv":
        try:
            header.decode("utf-8-sig")
            valid[extension] = b"\x00" not in header
        except UnicodeDecodeError:
            valid[extension] = False
    if not valid.get(extension, False):
        raise HTTPException(status_code=400, detail="File contents do not match the selected file type.")


@api_router.get("/content/assets/{key}")
async def content_asset(key: str):
    # An asset becomes public only when associated content is published.
    published = await db.content.find_one({
        "status": "PUBLISHED",
        "$or": [{"fileKey": key}, {"coverImageKey": key}, {"inlineImageKeys": key}],
    })
    if not published:
        raise HTTPException(status_code=404, detail="Published asset was not found.")
    asset = await db.content_assets.find_one({"key": key}, {"_id": 0})
    if not asset:
        raise HTTPException(status_code=404, detail="Asset was not found.")
    path = CONTENT_STORAGE_DIR / asset["storedName"]
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Asset storage was not found.")
    return FileResponse(path, media_type=asset["mimeType"], filename=asset["originalFileName"], content_disposition_type="inline")


@api_router.get("/content/admin/assets/{key}")
async def admin_content_asset(key: str, _admin=Depends(require_admin)):
    asset = await db.content_assets.find_one({"key": key}, {"_id": 0})
    if not asset:
        raise HTTPException(status_code=404, detail="Asset was not found.")
    path = CONTENT_STORAGE_DIR / asset["storedName"]
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Asset storage was not found.")
    return FileResponse(path, media_type=asset["mimeType"], filename=asset["originalFileName"], content_disposition_type="inline")


def configured_market_ticker_instruments():
    configured = os.environ.get("UPSTOX_MARKET_TICKER_INSTRUMENTS", "").strip()
    if not configured:
        return [*MARKET_TICKER_INDEX_INSTRUMENTS, *fetch_nifty_50_constituents()]
    try:
        instruments = json.loads(configured)
    except json.JSONDecodeError as e:
        raise ValueError("UPSTOX_MARKET_TICKER_INSTRUMENTS must be valid JSON") from e
    if not isinstance(instruments, list) or not instruments:
        raise ValueError("UPSTOX_MARKET_TICKER_INSTRUMENTS must be a non-empty JSON array")
    for instrument in instruments:
        if not isinstance(instrument, dict) or not instrument.get("instrument_key"):
            raise ValueError("Each ticker instrument must include an instrument_key")
    return instruments


def fetch_nifty_50_constituents():
    cached_items = _nifty_50_constituents_cache["items"]
    if cached_items and monotonic() - _nifty_50_constituents_cache["fetched_at"] < NIFTY_50_CONSTITUENTS_CACHE_SECONDS:
        return cached_items

    response = requests.get(
        NIFTY_50_CONSTITUENTS_URL,
        headers={
            "Accept": "text/csv,*/*",
            "User-Agent": "financial-portfolio-local/1.0",
        },
        timeout=10,
    )
    response.raise_for_status()

    rows = csv.DictReader(StringIO(response.text))
    instruments = []
    for row in rows:
        symbol = (row.get("Symbol") or "").strip()
        company = (row.get("Company Name") or symbol).strip()
        isin = (row.get("ISIN Code") or "").strip()
        if not symbol or not isin:
            continue
        instruments.append({
            "name": company,
            "symbol": symbol,
            "instrument_key": f"NSE_EQ|{isin}",
            "category": "NIFTY 50",
            "currency": "INR",
        })

    if len(instruments) < 45:
        raise ValueError("NIFTY 50 constituent feed returned too few instruments")
    _nifty_50_constituents_cache.update({"items": instruments, "fetched_at": monotonic()})
    return instruments


def _fetch_upstox_quotes(instruments, access_token):
    instrument_keys = [instrument["instrument_key"] for instrument in instruments]
    response = requests.get(
        "https://api.upstox.com/v3/market-quote/ltp",
        params={"instrument_key": ",".join(instrument_keys)},
        headers={
            "Accept": "application/json",
            "Authorization": f"Bearer {access_token}",
            "User-Agent": "financial-portfolio-local/1.0",
        },
        timeout=10,
    )
    response.raise_for_status()
    payload = response.json()

    data = payload.get("data")
    if payload.get("status") != "success" or not isinstance(data, dict):
        raise ValueError("No usable Upstox quote payload returned")

    quotes_by_token = {
        quote.get("instrument_token"): quote
        for quote in data.values()
        if isinstance(quote, dict) and quote.get("instrument_token")
    }

    items = []
    for instrument in instruments:
        quote = quotes_by_token.get(instrument["instrument_key"])
        if not quote:
            raise ValueError(f"No usable quote returned for {instrument['instrument_key']}")

        price = quote.get("last_price")
        close = quote.get("cp")
        if not isinstance(price, (int, float)) or price <= 0:
            raise ValueError(f"No usable price returned for {instrument['instrument_key']}")

        change = price - close if isinstance(close, (int, float)) else 0
        change_percent = (change / close) * 100 if isinstance(close, (int, float)) and close else 0
        items.append({
            "name": instrument.get("name") or quote.get("symbol") or instrument["instrument_key"],
            "symbol": instrument.get("symbol") or quote.get("symbol") or instrument["instrument_key"],
            "instrumentKey": instrument["instrument_key"],
            "category": instrument.get("category", "Market"),
            "currency": instrument.get("currency", "INR"),
            "price": price,
            "change": change,
            "changePercent": change_percent,
            "direction": "up" if change > 0 else "down" if change < 0 else "flat",
            "volume": quote.get("volume"),
            "timestamp": int(time()),
        })
    return items


@api_router.get("/market-ticker")
async def market_ticker():
    """Return cached, normalized Upstox quotes without exposing the API token."""
    cached_items = _market_ticker_cache["items"]
    if cached_items and monotonic() - _market_ticker_cache["fetched_at"] < MARKET_TICKER_CACHE_SECONDS:
        return {"items": cached_items, "cached": True}

    access_token = os.environ.get("UPSTOX_ACCESS_TOKEN", "").strip()
    if not access_token:
        if cached_items:
            return {"items": cached_items, "cached": True, "stale": True}
        raise HTTPException(status_code=503, detail="Market data is not configured.")

    try:
        instruments = configured_market_ticker_instruments()
        items = await asyncio.to_thread(_fetch_upstox_quotes, instruments, access_token)
    except Exception:
        # Deliberately keep provider details out of logs: request headers include
        # a bearer token, and some errors echo request metadata.
        logger.warning("Market ticker provider request failed")
        if cached_items:
            return {"items": cached_items, "cached": True, "stale": True}
        raise HTTPException(status_code=503, detail="Market data is temporarily unavailable.")

    _market_ticker_cache.update({"items": items, "fetched_at": monotonic()})
    return {"items": items, "cached": False, "timestamp": int(time())}


@api_router.post("/contact", response_model=ContactMessage)
async def create_contact(payload: ContactCreate):
    if not payload.name.strip():
        raise HTTPException(status_code=400, detail="Name is required")
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
    if not payload.name.strip():
        raise HTTPException(status_code=400, detail="Name is required")
    if not payload.services:
        raise HTTPException(status_code=400, detail="Select at least one service")
    if payload.message.strip() and len(payload.message.strip()) < 10:
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
