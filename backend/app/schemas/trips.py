"""
app/schemas/trips.py
--------------------
Pydantic request and response schemas for the /trips API endpoints.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from app.schemas.itinerary import (
    Itinerary,
    Pace,
    TravelStyle,
    TripPreferences,
)


# ---------------------------------------------------------------------------
# Request Schemas
# ---------------------------------------------------------------------------

class TripGenerateRequest(TripPreferences):
    """Payload to generate a new trip using Gemini AI."""
    title: str | None = Field(default=None, description="Custom trip title; generated if omitted")


class TripUpdateRequest(BaseModel):
    """Payload to update an existing trip."""
    title: str | None = None
    destination: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    budget: float | None = Field(default=None, gt=0)
    travel_style: TravelStyle | None = None
    group_size: int | None = Field(default=None, ge=1, le=50)
    interests: list[str] | None = None
    pace: Pace | None = None
    itinerary: dict[str, Any] | Itinerary | None = None


class RegenerateDayRequest(BaseModel):
    """Payload to regenerate a specific day's activities."""
    day_number: int = Field(..., ge=1, description="Day number to regenerate (1-based)")
    instruction: str = Field(..., min_length=3, description="Specific feedback or changes requested")


class ShareTripRequest(BaseModel):
    """Payload to share a trip with another registered user by email."""
    email: str = Field(..., min_length=5, description="Collaborator email address")
    role: Literal["editor", "viewer"] = "editor"

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        clean = v.strip().lower()
        if "@" not in clean or "." not in clean:
            raise ValueError(f"'{v}' is not a valid email address")
        return clean


# ---------------------------------------------------------------------------
# Response Schemas
# ---------------------------------------------------------------------------

class TripMemberResponse(BaseModel):
    user_id: str
    email: str | None = None
    full_name: str | None = None
    role: str = "viewer"


class TripListItemResponse(BaseModel):
    id: str
    owner_id: str
    title: str
    destination: str
    start_date: date | None = None
    end_date: date | None = None
    budget: float | None = None
    travel_style: str | None = None
    group_size: int | None = None
    interests: list[str] = Field(default_factory=list)
    pace: str | None = None
    estimated_cost: float | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
    role: str = "owner"  # "owner" | "editor" | "viewer"


class TripDetailResponse(TripListItemResponse):
    itinerary: dict[str, Any] = Field(default_factory=dict)
    members: list[TripMemberResponse] = Field(default_factory=list)
