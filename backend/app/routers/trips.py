"""
app/routers/trips.py
--------------------
All trip-related API endpoints. Every endpoint is protected by get_current_user.

Endpoints:
- POST   /trips/generate          Generate itinerary via Gemini and save
- GET    /trips                   List user's owned and shared trips
- GET    /trips/{id}              Retrieve trip details and members
- PUT    /trips/{id}              Update trip details or itinerary with cost recalculation
- POST   /trips/{id}/regenerate-day  Regenerate a specific day
- DELETE /trips/{id}              Delete trip (owner only)
- POST   /trips/{id}/share        Share trip with another user by email
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.config import get_settings
from app.core.dependencies import CurrentUser, GUEST_USER_ID
from app.db.supabase_client import get_supabase, get_supabase_admin
from app.schemas.itinerary import (
    Itinerary,
    Pace,
    TravelStyle,
    TripPreferences,
)
from app.schemas.trips import (
    RegenerateDayRequest,
    ShareTripRequest,
    TripDetailResponse,
    TripGenerateRequest,
    TripListItemResponse,
    TripMemberResponse,
    TripUpdateRequest,
)
from app.services.ai_service import generate_itinerary, regenerate_day

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/trips", tags=["Trips"])

# In-memory storage fallback for demo/guest mode and offline development
_DEMO_TRIPS: dict[str, dict[str, Any]] = {}
_DEMO_MEMBERS: dict[str, list[dict[str, Any]]] = {}


# ---------------------------------------------------------------------------
# Helper Functions
# ---------------------------------------------------------------------------

def _get_db():
    """Use admin client if available, fallback to anon client."""
    try:
        return get_supabase_admin()
    except Exception:
        return get_supabase()


def _recalculate_itinerary_cost(itinerary_data: dict[str, Any]) -> float:
    """
    Calculate the total cost across all days/activities in an itinerary dict,
    and update day/itinerary cost properties in place.
    """
    total = 0.0
    days = itinerary_data.get("days", [])
    if isinstance(days, list):
        for day in days:
            if isinstance(day, dict):
                activities = day.get("activities", [])
                day_total = 0.0
                if isinstance(activities, list):
                    for act in activities:
                        if isinstance(act, dict):
                            cost = float(act.get("estimated_cost", 0.0) or 0.0)
                            day_total += cost
                day["total_cost"] = round(day_total, 2)
                total += day_total

    total = round(total, 2)
    itinerary_data["total_estimated_cost"] = total
    return total


def _get_trip_and_role(db, trip_id: str, user_id: str) -> tuple[dict[str, Any], str]:
    """
    Fetch trip from database and determine caller's role: 'owner', 'editor', or 'viewer'.
    Falls back to in-memory demo store if Supabase is offline or unconfigured.
    """
    settings = get_settings()

    if settings.is_supabase_configured:
        try:
            res = db.table("trips").select("*").eq("id", trip_id).execute()
            if res.data:
                trip = res.data[0]
                if trip.get("owner_id") == user_id or user_id == GUEST_USER_ID:
                    return trip, "owner"

                member_res = (
                    db.table("trip_members")
                    .select("role")
                    .eq("trip_id", trip_id)
                    .eq("user_id", user_id)
                    .execute()
                )
                if member_res.data:
                    return trip, member_res.data[0]["role"]
        except Exception as exc:
            logger.warning("Supabase lookup failed (%s); checking local store.", exc)

    # In-memory store fallback
    if trip_id in _DEMO_TRIPS:
        trip = dict(_DEMO_TRIPS[trip_id])
        role = "owner" if (trip.get("owner_id") == user_id or user_id == GUEST_USER_ID) else "editor"
        return trip, role

    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"Trip '{trip_id}' not found.",
    )


# ---------------------------------------------------------------------------
# Route Handlers
# ---------------------------------------------------------------------------

@router.post(
    "/generate",
    response_model=TripDetailResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Generate AI itinerary and save to database",
)
async def generate_trip(
    payload: TripGenerateRequest,
    current_user: CurrentUser,
):
    """
    Generates a complete travel itinerary based on preferences and saves
    the new trip to Supabase (or demo storage).
    """
    db = _get_db()
    settings = get_settings()

    # Build TripPreferences for the AI service
    prefs = TripPreferences(
        destination=payload.destination,
        start_date=payload.start_date,
        end_date=payload.end_date,
        budget=payload.budget,
        travel_style=payload.travel_style,
        group_size=payload.group_size,
        interests=payload.interests,
        pace=payload.pace,
        notes=payload.notes,
    )

    # Call AI service (with smart mock fallback if Gemini is unconfigured)
    itinerary: Itinerary = generate_itinerary(prefs)
    itinerary_dict = itinerary.model_dump(mode="json")
    cost = _recalculate_itinerary_cost(itinerary_dict)

    title = payload.title or f"Trip to {payload.destination}"

    trip_data = {
        "owner_id": current_user,
        "title": title,
        "destination": payload.destination,
        "start_date": str(payload.start_date),
        "end_date": str(payload.end_date),
        "budget": payload.budget,
        "travel_style": payload.travel_style.value,
        "group_size": payload.group_size,
        "interests": payload.interests,
        "pace": payload.pace.value,
        "itinerary": itinerary_dict,
        "estimated_cost": cost,
    }

    # Attempt Supabase insert
    if settings.is_supabase_configured:
        try:
            insert_res = db.table("trips").insert(trip_data).execute()
            if insert_res.data:
                saved_trip = insert_res.data[0]
                saved_trip["role"] = "owner"
                saved_trip["members"] = []
                return saved_trip
        except Exception as exc:
            logger.warning("Supabase insert failed (%s); using in-memory demo store.", exc)

    # In-memory fallback
    new_id = str(uuid.uuid4())
    saved_trip = {
        **trip_data,
        "id": new_id,
        "created_at": datetime.utcnow().isoformat(),
        "updated_at": datetime.utcnow().isoformat(),
        "role": "owner",
        "members": [],
    }
    _DEMO_TRIPS[new_id] = saved_trip
    return saved_trip


@router.get(
    "",
    response_model=list[TripListItemResponse],
    summary="List user's owned and shared trips",
)
async def list_trips(current_user: CurrentUser):
    """
    Returns all trips where the user is either the owner or a member.
    """
    db = _get_db()
    settings = get_settings()
    trips: list[dict[str, Any]] = []

    if settings.is_supabase_configured:
        try:
            owned_res = (
                db.table("trips")
                .select("id, owner_id, title, destination, start_date, end_date, budget, travel_style, group_size, interests, pace, estimated_cost, created_at, updated_at")
                .eq("owner_id", current_user)
                .order("created_at", desc=True)
                .execute()
            )
            for item in owned_res.data or []:
                item["role"] = "owner"
                trips.append(item)

            membership_res = (
                db.table("trip_members")
                .select("trip_id, role")
                .eq("user_id", current_user)
                .execute()
            )
            if membership_res.data:
                shared_ids = [m["trip_id"] for m in membership_res.data]
                role_map = {m["trip_id"]: m["role"] for m in membership_res.data}
                shared_res = (
                    db.table("trips")
                    .select("id, owner_id, title, destination, start_date, end_date, budget, travel_style, group_size, interests, pace, estimated_cost, created_at, updated_at")
                    .in_("id", shared_ids)
                    .order("created_at", desc=True)
                    .execute()
                )
                for item in shared_res.data or []:
                    item["role"] = role_map.get(item["id"], "viewer")
                    trips.append(item)
            return trips
        except Exception as exc:
            logger.warning("Supabase list failed (%s); returning local trips.", exc)

    # In-memory store
    for item in _DEMO_TRIPS.values():
        is_owner = item.get("owner_id") == current_user or current_user == GUEST_USER_ID
        trips.append({
            **item,
            "role": "owner" if is_owner else "editor",
        })

    return trips


@router.get(
    "/{trip_id}",
    response_model=TripDetailResponse,
    summary="Get trip details and members",
)
async def get_trip(trip_id: str, current_user: CurrentUser):
    """
    Fetches full trip details including the AI itinerary and collaborators list.
    """
    db = _get_db()
    trip, role = _get_trip_and_role(db, trip_id, current_user)

    members_list = _DEMO_MEMBERS.get(trip_id, [])

    settings = get_settings()
    if settings.is_supabase_configured:
        try:
            members_res = (
                db.table("trip_members")
                .select("user_id, role")
                .eq("trip_id", trip_id)
                .execute()
            )
            if members_res.data:
                user_ids = [m["user_id"] for m in members_res.data]
                profiles_res = (
                    db.table("profiles")
                    .select("id, email, full_name")
                    .in_("id", user_ids)
                    .execute()
                )
                profile_map = {p["id"]: p for p in (profiles_res.data or [])}
                members_list = []
                for m in members_res.data:
                    prof = profile_map.get(m["user_id"], {})
                    members_list.append({
                        "user_id": m["user_id"],
                        "role": m["role"],
                        "email": prof.get("email"),
                        "full_name": prof.get("full_name"),
                    })
        except Exception:
            pass

    trip["role"] = role
    trip["members"] = members_list
    return trip


@router.put(
    "/{trip_id}",
    response_model=TripDetailResponse,
    summary="Update trip details or manual itinerary edits",
)
async def update_trip(
    trip_id: str,
    payload: TripUpdateRequest,
    current_user: CurrentUser,
):
    """
    Manually update trip metadata or itinerary activities.
    Recalculates estimated_cost automatically.
    """
    db = _get_db()
    trip, role = _get_trip_and_role(db, trip_id, current_user)

    if role not in ("owner", "editor"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to edit this trip.",
        )

    updates: dict[str, Any] = {}
    if payload.title is not None:
        updates["title"] = payload.title
    if payload.destination is not None:
        updates["destination"] = payload.destination
    if payload.start_date is not None:
        updates["start_date"] = str(payload.start_date)
    if payload.end_date is not None:
        updates["end_date"] = str(payload.end_date)
    if payload.budget is not None:
        updates["budget"] = payload.budget
    if payload.travel_style is not None:
        updates["travel_style"] = payload.travel_style.value
    if payload.group_size is not None:
        updates["group_size"] = payload.group_size
    if payload.interests is not None:
        updates["interests"] = payload.interests
    if payload.pace is not None:
        updates["pace"] = payload.pace.value

    # Recalculate cost
    if payload.itinerary is not None:
        itin_dict = (
            payload.itinerary.model_dump(mode="json")
            if isinstance(payload.itinerary, Itinerary)
            else dict(payload.itinerary)
        )
        new_cost = _recalculate_itinerary_cost(itin_dict)
        updates["itinerary"] = itin_dict
        updates["estimated_cost"] = new_cost
    elif "itinerary" in trip and trip["itinerary"]:
        existing_itin = dict(trip["itinerary"])
        updates["estimated_cost"] = _recalculate_itinerary_cost(existing_itin)
        updates["itinerary"] = existing_itin

    settings = get_settings()
    if settings.is_supabase_configured:
        try:
            res = db.table("trips").update(updates).eq("id", trip_id).execute()
            if res.data:
                trip = res.data[0]
        except Exception as exc:
            logger.warning("Supabase update failed (%s); updating local store.", exc)

    if trip_id in _DEMO_TRIPS:
        _DEMO_TRIPS[trip_id].update(updates)
        _DEMO_TRIPS[trip_id]["updated_at"] = datetime.utcnow().isoformat()
        trip = _DEMO_TRIPS[trip_id]

    trip["role"] = role
    return trip


@router.post(
    "/{trip_id}/regenerate-day",
    response_model=TripDetailResponse,
    summary="Regenerate a single day with custom instructions",
)
async def regenerate_trip_day(
    trip_id: str,
    payload: RegenerateDayRequest,
    current_user: CurrentUser,
):
    """
    Regenerates only the specified day's schedule using Gemini AI (or smart local revision).
    """
    db = _get_db()
    trip, role = _get_trip_and_role(db, trip_id, current_user)

    if role not in ("owner", "editor"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to modify this trip.",
        )

    prefs = TripPreferences(
        destination=trip["destination"],
        start_date=trip["start_date"],
        end_date=trip["end_date"],
        budget=float(trip["budget"] or 1000),
        travel_style=TravelStyle(trip.get("travel_style") or "cultural"),
        group_size=int(trip.get("group_size") or 1),
        interests=trip.get("interests") or [],
        pace=Pace(trip.get("pace") or "moderate"),
    )
    current_itinerary = Itinerary.model_validate(trip["itinerary"])

    updated_itinerary = regenerate_day(
        itinerary=current_itinerary,
        day_number=payload.day_number,
        preferences=prefs,
        user_instruction=payload.instruction,
    )

    itin_dict = updated_itinerary.model_dump(mode="json")
    new_cost = _recalculate_itinerary_cost(itin_dict)

    settings = get_settings()
    if settings.is_supabase_configured:
        try:
            update_res = (
                db.table("trips")
                .update({"itinerary": itin_dict, "estimated_cost": new_cost})
                .eq("id", trip_id)
                .execute()
            )
            if update_res.data:
                updated_trip = update_res.data[0]
                updated_trip["role"] = role
                return updated_trip
        except Exception:
            pass

    if trip_id in _DEMO_TRIPS:
        _DEMO_TRIPS[trip_id]["itinerary"] = itin_dict
        _DEMO_TRIPS[trip_id]["estimated_cost"] = new_cost
        _DEMO_TRIPS[trip_id]["updated_at"] = datetime.utcnow().isoformat()
        updated_trip = _DEMO_TRIPS[trip_id]
        updated_trip["role"] = role
        return updated_trip

    trip["itinerary"] = itin_dict
    trip["estimated_cost"] = new_cost
    trip["role"] = role
    return trip


@router.delete(
    "/{trip_id}",
    status_code=status.HTTP_200_OK,
    summary="Delete a trip (owner only)",
)
async def delete_trip(trip_id: str, current_user: CurrentUser):
    """
    Permanently deletes a trip. Only the trip owner can perform this action.
    """
    db = _get_db()
    trip, role = _get_trip_and_role(db, trip_id, current_user)

    if role != "owner":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the trip owner can delete this trip.",
        )

    settings = get_settings()
    if settings.is_supabase_configured:
        try:
            db.table("trips").delete().eq("id", trip_id).execute()
        except Exception:
            pass

    if trip_id in _DEMO_TRIPS:
        del _DEMO_TRIPS[trip_id]

    return {"message": "Trip deleted successfully", "id": trip_id}


@router.post(
    "/{trip_id}/share",
    status_code=status.HTTP_200_OK,
    summary="Share trip with another user by email",
)
async def share_trip(
    trip_id: str,
    payload: ShareTripRequest,
    current_user: CurrentUser,
):
    """
    Invites or grants another user access to the trip by email.
    """
    db = _get_db()
    trip, role = _get_trip_and_role(db, trip_id, current_user)

    if role != "owner":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the trip owner can share this trip.",
        )

    member_id = str(uuid.uuid4())
    member_record = {
        "user_id": member_id,
        "email": payload.email.lower().strip(),
        "full_name": payload.email.split("@")[0].capitalize(),
        "role": payload.role,
    }

    if trip_id not in _DEMO_MEMBERS:
        _DEMO_MEMBERS[trip_id] = []
    _DEMO_MEMBERS[trip_id].append(member_record)

    settings = get_settings()
    if settings.is_supabase_configured:
        try:
            profile_res = (
                db.table("profiles")
                .select("id, email, full_name")
                .eq("email", payload.email.lower().strip())
                .execute()
            )
            if profile_res.data:
                target_user = profile_res.data[0]
                db.table("trip_members").upsert({
                    "trip_id": trip_id,
                    "user_id": target_user["id"],
                    "role": payload.role,
                }).execute()
        except Exception as exc:
            logger.warning("Supabase share failed (%s); member saved in memory.", exc)

    return {
        "message": f"Trip shared with {payload.email} as {payload.role}.",
        "member": member_record,
    }
