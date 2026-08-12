"""Backend tests for Service Enquiry & regression on Contact."""
import os
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://portfolio-hub-4521.preview.emergentagent.com').rstrip('/')
API = f"{BASE_URL}/api"


@pytest.fixture
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


VALID = {
    "name": "TEST_Priya Sharma",
    "email": "priya@example.com",
    "phone": "+91 90000 12345",
    "services": ["Global Investing Discussion", "Portfolio Review"],
    "message": "I would like to review my portfolio and discuss global exposure.",
}


class TestServiceEnquiry:
    def test_valid_submission_200(self, client):
        r = client.post(f"{API}/service-enquiry", json=VALID, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["name"] == VALID["name"]
        assert d["email"] == VALID["email"]
        assert d["services"] == VALID["services"]
        assert d["source"] == "Services Page"
        assert "id" in d and "created_at" in d

    def test_empty_services_400(self, client):
        payload = {**VALID, "services": []}
        r = client.post(f"{API}/service-enquiry", json=payload, timeout=15)
        assert r.status_code == 400
        assert "service" in r.json().get("detail", "").lower()

    def test_invalid_email_422(self, client):
        payload = {**VALID, "email": "bad"}
        r = client.post(f"{API}/service-enquiry", json=payload, timeout=15)
        assert r.status_code == 422

    def test_empty_name_400(self, client):
        payload = {**VALID, "name": "   "}
        r = client.post(f"{API}/service-enquiry", json=payload, timeout=15)
        assert r.status_code == 400

    def test_empty_message_400(self, client):
        payload = {**VALID, "message": "   "}
        r = client.post(f"{API}/service-enquiry", json=payload, timeout=15)
        assert r.status_code == 400


class TestContactRegression:
    def test_contact_still_works(self, client):
        payload = {
            "name": "TEST_Contact User",
            "email": "test_contact@example.com",
            "message": "Regression test message for contact form.",
        }
        r = client.post(f"{API}/contact", json=payload, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["name"] == payload["name"]
        assert d["email"] == payload["email"]
