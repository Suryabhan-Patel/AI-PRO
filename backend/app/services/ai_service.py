"""
app/services/ai_service.py
--------------------------
Gemini-powered itinerary generation service with smart fallback for development/demo.

Public functions
----------------
generate_itinerary(preferences)
    Build a complete multi-day itinerary from trip preferences.

regenerate_day(itinerary, day_number, preferences, user_instruction)
    Replace a single day within an existing itinerary.
"""

from __future__ import annotations

import json
import logging
from datetime import timedelta
from functools import lru_cache

import google.generativeai as genai
from google.generativeai.types import GenerationConfig
from pydantic import ValidationError

from app.core.config import get_settings
from app.core.exceptions import ServiceUnavailableError, UnprocessableError
from app.schemas.itinerary import (
    Activity,
    ActivityType,
    Day,
    Itinerary,
    TripPreferences,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_DEFAULT_MODEL = "gemini-2.0-flash"

_GENERATION_CONFIG = GenerationConfig(
    response_mime_type="application/json",
    temperature=0.7,
    top_p=0.9,
    max_output_tokens=8192,
)

# ---------------------------------------------------------------------------
# Gemini client initialisation (lazy singleton)
# ---------------------------------------------------------------------------

@lru_cache
def _get_model() -> genai.GenerativeModel:
    """Configure the Gemini client and return a cached GenerativeModel."""
    settings = get_settings()
    genai.configure(api_key=settings.gemini_api_key)
    model_name = getattr(settings, "gemini_model", _DEFAULT_MODEL)
    logger.info("Gemini model initialised: %s", model_name)
    return genai.GenerativeModel(
        model_name=model_name,
        generation_config=_GENERATION_CONFIG,
    )


# ---------------------------------------------------------------------------
# JSON schema injected into prompt
# ---------------------------------------------------------------------------

_ITINERARY_JSON_SCHEMA = """
{
  "days": [
    {
      "day_number": 1,
      "date": "YYYY-MM-DD",
      "theme": "Brief theme for the day",
      "activities": [
        {
          "time": "HH:MM",
          "title": "Activity name",
          "type": "attraction | food | stay | transport",
          "description": "Detailed description (>= 10 chars)",
          "location": "Venue name or address",
          "estimated_cost": 0.0,
          "duration_minutes": 60
        }
      ]
    }
  ],
  "total_estimated_cost": 0.0,
  "travel_tips": ["tip 1", "tip 2"]
}
"""

# ---------------------------------------------------------------------------
# Prompt builders
# ---------------------------------------------------------------------------

def _build_generate_prompt(prefs: TripPreferences) -> str:
    interests_str = ", ".join(prefs.interests) if prefs.interests else "general sightseeing"
    notes_str = f"\nAdditional notes: {prefs.notes}" if prefs.notes else ""

    return f"""You are an expert travel planner. Generate a detailed, day-by-day travel itinerary.

## Trip Details
- Destination:    {prefs.destination}
- Dates:          {prefs.start_date} to {prefs.end_date} ({prefs.num_days} day(s))
- Budget:         ${prefs.budget:.2f} total per person (USD)
- Travel style:   {prefs.travel_style.value}
- Group size:     {prefs.group_size} person(s)
- Interests:      {interests_str}
- Pace:           {prefs.pace.value}{notes_str}

## Planning Rules
1. **Route optimisation** - sequence activities to minimise travel time and backtracking.
2. **Budget discipline** - the sum of all `estimated_cost` values (per person) MUST NOT exceed ${prefs.budget:.2f}.
3. **Every day must include** at least one activity of each type where applicable: attraction, food, stay, and transport.
4. **Pace adherence** - '{prefs.pace.value}'.
5. **Output Format** - Return ONLY a valid JSON object matching this schema exactly. No markdown, no extra text.

{_ITINERARY_JSON_SCHEMA}
"""


def _build_regenerate_day_prompt(
    itinerary: Itinerary,
    day_number: int,
    prefs: TripPreferences,
    user_instruction: str,
) -> str:
    other_days_summary = "\n".join(
        f"  Day {d.day_number} ({d.date}): {d.theme}"
        for d in itinerary.days
        if d.day_number != day_number
    )
    target_day = next(d for d in itinerary.days if d.day_number == day_number)
    budget_spent_other_days = sum(
        d.total_cost for d in itinerary.days if d.day_number != day_number
    )
    remaining_budget = max(50.0, prefs.budget - budget_spent_other_days)

    return f"""You are an expert travel planner. Regenerate ONLY Day {day_number} of an existing itinerary.

## Original Trip Context
- Destination:  {prefs.destination}
- Travel style: {prefs.travel_style.value}
- Pace:         {prefs.pace.value}

## Other Days (DO NOT change these)
{other_days_summary}

## Day to Regenerate
- Day number: {day_number}
- Date:       {target_day.date}
- Remaining budget for this day: ${remaining_budget:.2f} per person

## User Instruction for This Day
"{user_instruction}"

## Output Format
Return ONLY a valid JSON object representing the COMPLETE updated itinerary with Day {day_number} replaced.

{_ITINERARY_JSON_SCHEMA}
"""


def _call_gemini_and_validate(prompt: str, attempt: int = 1) -> Itinerary:
    model = _get_model()

    try:
        response = model.generate_content(prompt)
        raw_text = response.text
    except Exception as exc:
        logger.exception("Gemini API call failed (attempt %d)", attempt)
        raise ServiceUnavailableError(f"Gemini API error: {exc}") from exc

    try:
        # Clean any accidental markdown code fences
        clean_text = raw_text.strip()
        if clean_text.startswith("```"):
            clean_text = clean_text.split("```", 2)[1]
            if clean_text.startswith("json"):
                clean_text = clean_text[4:].strip()
            clean_text = clean_text.rstrip("```").strip()

        data = json.loads(clean_text)
        return Itinerary.model_validate(data)
    except (json.JSONDecodeError, ValidationError) as exc:
        if attempt == 1:
            correction_prompt = (
                prompt
                + f"\n\n[CORRECTION REQUIRED] Your previous response failed JSON validation: {exc}\nReturn ONLY raw JSON."
            )
            return _call_gemini_and_validate(correction_prompt, attempt=2)
        raise UnprocessableError(f"Gemini invalid JSON after 2 attempts: {exc}") from exc


# ---------------------------------------------------------------------------
# Fallback / Demo Itinerary Generator (when Gemini is unconfigured/offline)
# ---------------------------------------------------------------------------

def _build_mock_itinerary(prefs: TripPreferences) -> Itinerary:
    """Creates a high-quality, realistic itinerary tailored to user preferences."""
    days = []
    num_days = min(14, max(1, prefs.num_days))
    daily_budget = round(prefs.budget / num_days, 2)

    for i in range(num_days):
        day_num = i + 1
        day_date = prefs.start_date + timedelta(days=i)
        activities = [
            Activity(
                time="09:00",
                title=f"Explore Iconic Landmarks & Sightseeing in {prefs.destination}",
                type=ActivityType.attraction,
                description=f"Begin Day {day_num} taking in world-renowned architectural sights, historical landmarks, and scenic panoramas.",
                location=f"Central Historic District, {prefs.destination}",
                estimated_cost=round(daily_budget * 0.15, 2),
                duration_minutes=120,
            ),
            Activity(
                time="12:30",
                title=f"Authentic Local Dining & Street Specialties",
                type=ActivityType.food,
                description=f"Savor authentic regional flavors and fresh dishes matching your {prefs.travel_style.value} journey style.",
                location=f"Old Town Market, {prefs.destination}",
                estimated_cost=round(daily_budget * 0.20, 2),
                duration_minutes=60,
            ),
            Activity(
                time="14:30",
                title=f"Artisan Culture & Scenic Walking Tour",
                type=ActivityType.attraction,
                description=f"Immerse yourself in local craft boutiques, tranquil gardens, and scenic street photography locations.",
                location=f"Cultural Quarter, {prefs.destination}",
                estimated_cost=round(daily_budget * 0.10, 2),
                duration_minutes=90,
            ),
            Activity(
                time="17:00",
                title="Scenic Sunset Transit & Harbor Views",
                type=ActivityType.transport,
                description="Short scenic ride across town with picturesque panoramic golden hour views.",
                location=f"Waterfront Promenade, {prefs.destination}",
                estimated_cost=round(daily_budget * 0.05, 2),
                duration_minutes=30,
            ),
            Activity(
                time="19:30",
                title="Evening Chef Dinner & Local Nightlife",
                type=ActivityType.food,
                description="Relax over an exquisite evening meal enjoying the vibrant nighttime atmosphere of the city.",
                location=f"Downtown Plaza, {prefs.destination}",
                estimated_cost=round(daily_budget * 0.25, 2),
                duration_minutes=90,
            ),
            Activity(
                time="21:30",
                title=f"Night Stay in {prefs.destination}",
                type=ActivityType.stay,
                description="Comfortable, well-rated accommodation retreat to recharge for the next day's adventures.",
                location=f"Selected Boutique Hotel, {prefs.destination}",
                estimated_cost=round(daily_budget * 0.25, 2),
                duration_minutes=480,
            ),
        ]

        days.append(
            Day(
                day_number=day_num,
                date=day_date,
                theme=f"Day {day_num}: {prefs.destination} Highlights & Discovery",
                activities=activities,
            )
        )

    total_cost = sum(d.total_cost for d in days)
    return Itinerary(
        days=days,
        total_estimated_cost=round(total_cost, 2),
        travel_tips=[
            f"The best time to visit top attractions in {prefs.destination} without crowds is before 10 AM.",
            "Always keep local transit cards or small change on hand for quick travel.",
            "Sample regional seasonal dishes at traditional food stalls for authentic taste.",
            "Wear comfortable walking shoes suitable for exploring cobblestone streets."
        ],
    )


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def generate_itinerary(preferences: TripPreferences) -> Itinerary:
    """Generate a multi-day itinerary with Gemini AI, or mock fallback if key is not set."""
    settings = get_settings()

    if not settings.is_gemini_configured:
        logger.info("Using smart mock itinerary generator (GEMINI_API_KEY placeholder).")
        return _build_mock_itinerary(preferences)

    try:
        prompt = _build_generate_prompt(preferences)
        return _call_gemini_and_validate(prompt)
    except Exception as exc:
        logger.warning("Gemini API call failed (%s). Falling back to smart mock generator.", exc)
        return _build_mock_itinerary(preferences)


def regenerate_day(
    itinerary: Itinerary,
    day_number: int,
    preferences: TripPreferences,
    user_instruction: str,
) -> Itinerary:
    """Regenerate a single day with Gemini, or smart local revision if offline."""
    existing_numbers = [d.day_number for d in itinerary.days]
    if day_number not in existing_numbers:
        raise ValueError(f"day_number {day_number} not found in itinerary")

    settings = get_settings()
    if settings.is_gemini_configured:
        try:
            prompt = _build_regenerate_day_prompt(
                itinerary, day_number, preferences, user_instruction
            )
            return _call_gemini_and_validate(prompt)
        except Exception as exc:
            logger.warning("Gemini regenerate failed (%s). Applying local update.", exc)

    # Local fallback day revision
    updated_days = []
    target_date = next(d.date for d in itinerary.days if d.day_number == day_number)
    for d in itinerary.days:
        if d.day_number == day_number:
            revised_activities = [
                Activity(
                    time="10:00",
                    title=f"Custom: {user_instruction[:40]}",
                    type=ActivityType.attraction,
                    description=f"Adjusted activity based on request: '{user_instruction}'.",
                    location=f"Central {preferences.destination}",
                    estimated_cost=25.0,
                    duration_minutes=120,
                ),
                Activity(
                    time="13:00",
                    title="Casual Local Lunch",
                    type=ActivityType.food,
                    description="Relaxed lunch at a popular neighborhood spot.",
                    location=f"Near {preferences.destination} Market",
                    estimated_cost=20.0,
                    duration_minutes=60,
                ),
                Activity(
                    time="15:30",
                    title="Scenic Afternoon Exploration",
                    type=ActivityType.attraction,
                    description="Afternoon exploration aligned with updated itinerary preferences.",
                    location=f"{preferences.destination}",
                    estimated_cost=15.0,
                    duration_minutes=90,
                ),
                Activity(
                    time="19:00",
                    title="Evening Dinner & Local Walk",
                    type=ActivityType.food,
                    description="Delicious dinner followed by an evening stroll.",
                    location=f"Downtown {preferences.destination}",
                    estimated_cost=30.0,
                    duration_minutes=90,
                ),
            ]
            updated_days.append(
                Day(
                    day_number=day_number,
                    date=target_date,
                    theme=f"Day {day_number}: Custom Revision ({user_instruction[:25]}...)",
                    activities=revised_activities,
                )
            )
        else:
            updated_days.append(d)

    total_cost = sum(d.total_cost for d in updated_days)
    return Itinerary(
        days=updated_days,
        total_estimated_cost=round(total_cost, 2),
        travel_tips=itinerary.travel_tips,
    )
