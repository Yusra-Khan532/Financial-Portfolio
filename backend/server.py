from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import List, Optional
import uuid
from datetime import datetime, timezone
from email_service import send_lead_emails, send_service_enquiry_email, EmailNotConfigured


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

logging.basicConfig(level=logging.INFO,
                    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api_router = APIRouter(prefix="/api")


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


@api_router.get("/")
async def root():
    return {"message": "Nishant Jain PMS API"}


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
