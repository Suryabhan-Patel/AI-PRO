"""
tests/test_trips_router.py
--------------------------
Verifies that /trips routes strictly require authentication and reject unauthenticated requests.
"""

from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_list_trips_unauthenticated_returns_401():
    response = client.get("/trips")
    assert response.status_code == 401 or response.status_code == 403


def test_generate_trip_unauthenticated_returns_401():
    payload = {
        "destination": "Tokyo",
        "start_date": "2026-11-01",
        "end_date": "2026-11-05",
        "budget": 2000,
    }
    response = client.post("/trips/generate", json=payload)
    assert response.status_code == 401 or response.status_code == 403


def test_get_trip_unauthenticated_returns_401():
    response = client.get("/trips/12345678-1234-5678-1234-567812345678")
    assert response.status_code == 401 or response.status_code == 403


def test_delete_trip_unauthenticated_returns_401():
    response = client.delete("/trips/12345678-1234-5678-1234-567812345678")
    assert response.status_code == 401 or response.status_code == 403
