"""Backend API tests for Nishant Jain PMS site."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://portfolio-hub-4521.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# ---------- Root ----------
def test_root(client):
    r = client.get(f"{API}/", timeout=30)
    assert r.status_code == 200
    data = r.json()
    assert "message" in data
    assert "PMS" in data["message"] or "Nishant" in data["message"]


# ---------- Contact POST ----------
def test_contact_post_success_and_persistence(client):
    payload = {
        "name": "TEST_Investor",
        "email": "test_investor@example.com",
        "phone": "+911234567890",
        "investment_size": "₹1 Cr – ₹5 Cr",
        "subject": "TEST_SUBJECT Research discussion",
        "message": "TEST_MSG please contact me about PMS.",
    }
    r = client.post(f"{API}/contact", json=payload, timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["name"] == payload["name"]
    assert data["email"] == payload["email"]
    assert data["message"] == payload["message"]
    assert data["investment_size"] == payload["investment_size"]
    assert data["subject"] == payload["subject"]
    assert "id" in data and isinstance(data["id"], str)
    assert "created_at" in data

    # Verify persistence via GET
    r2 = client.get(f"{API}/contact", timeout=30)
    assert r2.status_code == 200
    items = r2.json()
    assert isinstance(items, list)
    ids = [i["id"] for i in items]
    assert data["id"] in ids
    # verify subject persisted in list
    found = next((i for i in items if i["id"] == data["id"]), None)
    assert found is not None
    assert found.get("subject") == payload["subject"]


def test_contact_post_invalid_email(client):
    r = client.post(f"{API}/contact", json={
        "name": "TEST_x",
        "email": "not-an-email",
        "message": "hi",
    }, timeout=30)
    assert r.status_code == 422


def test_contact_post_missing_required(client):
    r = client.post(f"{API}/contact", json={
        "email": "a@b.com",
    }, timeout=30)
    assert r.status_code == 422


def test_contact_post_empty_name_or_message(client):
    r = client.post(f"{API}/contact", json={
        "name": "   ",
        "email": "x@y.com",
        "message": "  ",
    }, timeout=30)
    # server explicitly returns 400 for whitespace-only name/message
    assert r.status_code == 400


# ---------- Contact GET ----------
def test_contact_list_no_object_id(client):
    r = client.get(f"{API}/contact", timeout=30)
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    for item in data:
        assert "_id" not in item
        assert "id" in item
        assert "email" in item
