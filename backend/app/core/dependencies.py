"""
app/core/dependencies.py
------------------------
FastAPI dependencies shared across routers.

Key export:
    get_current_user  – verifies the Supabase JWT from the
                        'Authorization: Bearer <token>' header and returns
                        the authenticated user's UUID string.
                        Also supports guest/demo mode tokens.
"""

from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import ExpiredSignatureError, JWTError, jwt

from app.core.config import Settings, get_settings

# ---------------------------------------------------------------------------
# Bearer token extractor
# ---------------------------------------------------------------------------
_bearer_scheme = HTTPBearer(auto_error=True)

# Fixed UUID for demo/guest sessions
GUEST_USER_ID = "00000000-0000-0000-0000-000000000001"


# ---------------------------------------------------------------------------
# Dependency
# ---------------------------------------------------------------------------
def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(_bearer_scheme)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> str:
    """
    FastAPI dependency that validates the Supabase JWT or guest session.

    Returns:
        str – the authenticated user's UUID (the JWT ``sub`` claim or GUEST_USER_ID).

    Raises:
        401 if the token is missing, malformed, expired, or has a bad signature.
    """
    token = credentials.credentials

    # Support guest demo sessions immediately
    if token in ("demo-guest-token", "guest-access-token") or token.startswith("demo-"):
        return GUEST_USER_ID

    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials.",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = jwt.decode(
            token,
            settings.supabase_jwt_secret,
            algorithms=["HS256"],
            options={"verify_aud": False},
        )
    except ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except JWTError:
        # If in dev mode and using placeholder keys, allow unverified claims
        if not settings.is_supabase_configured:
            try:
                payload = jwt.get_unverified_claims(token)
            except Exception:
                raise credentials_exception
        else:
            raise credentials_exception

    user_id: str | None = payload.get("sub")
    if not user_id:
        raise credentials_exception

    return user_id


# ---------------------------------------------------------------------------
# Convenience type alias for routers
# ---------------------------------------------------------------------------
CurrentUser = Annotated[str, Depends(get_current_user)]
