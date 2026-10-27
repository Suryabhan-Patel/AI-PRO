"""
tests/test_itinerary_schema.py
-------------------------------
Verifies Pydantic itinerary schema validation, constraints, and cost calculations.
"""

from datetime import date
import pytest
from pydantic import ValidationError

from app.schemas.itinerary import (
    Activity,
    ActivityType,
    Day,
    Itinerary,
    Pace,
    TravelStyle,
    TripPreferences,
)


def test_valid_trip_preferences():
    prefs = TripPreferences(
        destination="Kyoto, Japan",
        start_date=date(2026, 11, 1),
        end_date=date(2026, 11, 5),
        budget=1800.0,
        travel_style=TravelStyle.cultural,
        group_size=2,
        interests=["food", "temples"],
        pace=Pace.moderate,
    )
    assert prefs.num_days == 5
    assert prefs.destination == "Kyoto, Japan"


def test_invalid_date_range_raises_validation_error():
    with pytest.raises(ValidationError):
        TripPreferences(
            destination="Paris, France",
            start_date=date(2026, 12, 10),
            end_date=date(2026, 12, 5),  # End before start
            budget=1000.0,
        )


def test_invalid_budget_raises_validation_error():
    with pytest.raises(ValidationError):
        TripPreferences(
            destination="Rome, Italy",
            start_date=date(2026, 9, 1),
            end_date=date(2026, 9, 3),
            budget=-500.0,  # Negative budget
        )


def test_valid_itinerary_and_cost_calculation():
    raw_itinerary = {
        "days": [
            {
                "day_number": 1,
                "date": "2026-11-01",
                "theme": "Arrival and Historic Gion",
                "activities": [
                    {
                        "time": "10:00",
                        "title": "Kiyomizu-dera Temple",
                        "type": "attraction",
                        "description": "Explore the famous wooden terrace overlooking the city.",
                        "location": "1 Chome-294 Kiyomizu, Higashiyama Ward, Kyoto",
                        "estimated_cost": 4.5,
                        "duration_minutes": 120,
                    },
                    {
                        "time": "13:00",
                        "title": "Matcha & Soba Lunch",
                        "type": "food",
                        "description": "Traditional handmade buckwheat noodles in Gion.",
                        "location": "Gion, Higashiyama Ward, Kyoto",
                        "estimated_cost": 18.0,
                        "duration_minutes": 60,
                    },
                ],
            },
            {
                "day_number": 2,
                "date": "2026-11-02",
                "theme": "Bamboo Groves & Arashiyama",
                "activities": [
                    {
                        "time": "09:00",
                        "title": "Arashiyama Bamboo Grove Walk",
                        "type": "attraction",
                        "description": "Walk through towering bamboo stalks in the early morning quiet.",
                        "location": "Arashiyama, Ukyo Ward, Kyoto",
                        "estimated_cost": 0.0,
                        "duration_minutes": 90,
                    },
                ],
            },
        ],
        "total_estimated_cost": 22.5,
        "travel_tips": ["Purchase an IC card for seamless transit.", "Wear comfortable slip-on shoes."],
    }

    itinerary = Itinerary.model_validate(raw_itinerary)
    assert len(itinerary.days) == 2
    assert itinerary.days[0].total_cost == 22.5
    assert itinerary.days[1].total_cost == 0.0
    assert itinerary.total_estimated_cost == 22.5


def test_non_sequential_days_raises_validation_error():
    raw_bad_days = {
        "days": [
            {
                "day_number": 1,
                "date": "2026-11-01",
                "theme": "Day 1",
                "activities": [
                    {
                        "time": "09:00",
                        "title": "Morning Visit",
                        "type": "attraction",
                        "description": "Descriptive text here for testing.",
                        "location": "Downtown",
                        "estimated_cost": 10.0,
                        "duration_minutes": 60,
                    }
                ],
            },
            {
                "day_number": 3,  # Missing Day 2
                "date": "2026-11-03",
                "theme": "Day 3",
                "activities": [
                    {
                        "time": "09:00",
                        "title": "Morning Visit",
                        "type": "attraction",
                        "description": "Descriptive text here for testing.",
                        "location": "Downtown",
                        "estimated_cost": 10.0,
                        "duration_minutes": 60,
                    }
                ],
            },
        ],
        "total_estimated_cost": 20.0,
    }

    with pytest.raises(ValidationError):
        Itinerary.model_validate(raw_bad_days)


def test_invalid_time_format_raises_validation_error():
    with pytest.raises(ValidationError):
        Activity(
            time="9am",  # Must be HH:MM
            title="Breakfast",
            type=ActivityType.food,
            description="Fresh croissants and coffee at the corner bakery.",
            location="Paris Cafe",
            estimated_cost=12.0,
            duration_minutes=45,
        )
