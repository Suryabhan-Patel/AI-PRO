"""
app/schemas/itinerary.py
------------------------
Pydantic models for AI-generated itineraries.

Hierarchy:
    TripPreferences          – input to the AI (what the user wants)
    Itinerary                – top-level AI output
      └─ days: list[Day]
           └─ activities: list[Activity]

All models use strict typing so that Pydantic can validate the raw JSON
returned by Gemini before it reaches application code.
"""

from __future__ import annotations

import re
from datetime import date
from enum import Enum
from typing import Annotated

from pydantic import BaseModel, Field, field_validator, model_validator


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

class ActivityType(str, Enum):
    attraction = "attraction"
    food       = "food"
    stay       = "stay"
    transport  = "transport"


class TravelStyle(str, Enum):
    adventure   = "adventure"
    luxury      = "luxury"
    backpacker  = "backpacker"
    cultural    = "cultural"
    family      = "family"
    business    = "business"


class Pace(str, Enum):
    relaxed  = "relaxed"
    moderate = "moderate"
    fast     = "fast"


# ---------------------------------------------------------------------------
# Input schema  (what the user / router sends to generate_itinerary)
# ---------------------------------------------------------------------------

class TripPreferences(BaseModel):
    """All the details needed to generate a personalised itinerary."""

    destination:  str  = Field(..., min_length=2, description="City, country or region")
    start_date:   date = Field(..., description="Trip start date")
    end_date:     date = Field(..., description="Trip end date (inclusive)")
    budget:       Annotated[float, Field(gt=0)] = Field(
        ..., description="Total trip budget in USD"
    )
    travel_style: TravelStyle = Field(default=TravelStyle.cultural)
    group_size:   Annotated[int, Field(ge=1, le=50)] = Field(
        default=1, description="Number of travellers"
    )
    interests:    list[str] = Field(
        default_factory=list,
        description="E.g. ['food', 'history', 'hiking']",
    )
    pace:         Pace = Field(default=Pace.moderate)
    # Optional extra context the user wants to communicate
    notes:        str | None = Field(
        default=None,
        description="Free-text notes, e.g. 'vegetarian only', 'no museums'",
    )

    @model_validator(mode="after")
    def end_after_start(self) -> TripPreferences:
        if self.end_date < self.start_date:
            raise ValueError("end_date must be on or after start_date")
        return self

    @property
    def num_days(self) -> int:
        return (self.end_date - self.start_date).days + 1


# ---------------------------------------------------------------------------
# Output schemas  (what Gemini returns, validated by Pydantic)
# ---------------------------------------------------------------------------

class Activity(BaseModel):
    """A single activity block within a day."""

    time:             str          = Field(..., description="Start time, e.g. '09:00'")
    title:            str          = Field(..., min_length=2)
    type:             ActivityType
    description:      str          = Field(..., min_length=10)
    location:         str          = Field(..., description="Venue name or address")
    estimated_cost:   float        = Field(..., ge=0, description="Cost per person in USD")
    duration_minutes: int          = Field(..., gt=0, le=1440)

    @field_validator("time")
    @classmethod
    def validate_time_format(cls, v: str) -> str:
        if not re.match(r"^\d{2}:\d{2}$", v):
            raise ValueError(f"time must be HH:MM format, got '{v}'")
        return v


class Day(BaseModel):
    """One day of the itinerary."""

    day_number:  int            = Field(..., ge=1)
    date:        date
    theme:       str            = Field(..., min_length=3, description="One-line theme for the day")
    activities:  list[Activity] = Field(..., min_length=1)

    @property
    def total_cost(self) -> float:
        return sum(a.estimated_cost for a in self.activities)


class Itinerary(BaseModel):
    """
    The complete AI-generated travel itinerary.

    This is the root model validated against Gemini's JSON output.
    """

    days:                list[Day] = Field(..., min_length=1)
    total_estimated_cost: float    = Field(..., ge=0, description="Total cost per person in USD")
    travel_tips:         list[str] = Field(
        default_factory=list,
        description="Practical tips: visa, weather, currency, safety, etc.",
    )

    @model_validator(mode="after")
    def days_are_sequential(self) -> Itinerary:
        """Ensure day_number values are 1, 2, 3… with no gaps."""
        numbers = [d.day_number for d in self.days]
        if numbers != list(range(1, len(self.days) + 1)):
            raise ValueError(
                f"day_number values must be sequential starting at 1, got {numbers}"
            )
        return self
