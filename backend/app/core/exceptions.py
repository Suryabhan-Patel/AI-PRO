"""
app/core/exceptions.py
-----------------------
Custom exception classes and global exception handlers for the FastAPI app.

Register all handlers via  register_exception_handlers(app)  in main.py.

All error responses share a consistent JSON envelope:
    {
        "error": {
            "code":    <HTTP status int>,
            "type":    <exception class name>,
            "message": <human-readable string>,
            "detail":  <optional extra info>
        }
    }
"""

import logging
from typing import Any

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Custom application exceptions
# ---------------------------------------------------------------------------

class AppError(Exception):
    """Base class for all application-level errors."""
    status_code: int = status.HTTP_500_INTERNAL_SERVER_ERROR
    detail: str = "An unexpected error occurred."

    def __init__(self, detail: str | None = None, **extra: Any) -> None:
        self.detail = detail or self.__class__.detail
        self.extra = extra
        super().__init__(self.detail)


class NotFoundError(AppError):
    """Raised when a requested resource does not exist."""
    status_code = status.HTTP_404_NOT_FOUND
    detail = "Resource not found."


class ForbiddenError(AppError):
    """Raised when the authenticated user lacks permission."""
    status_code = status.HTTP_403_FORBIDDEN
    detail = "You do not have permission to perform this action."


class ConflictError(AppError):
    """Raised when a resource already exists (duplicate)."""
    status_code = status.HTTP_409_CONFLICT
    detail = "A conflict occurred with the current state of the resource."


class UnprocessableError(AppError):
    """Raised when business-logic validation fails (beyond Pydantic)."""
    status_code = getattr(status, "HTTP_422_UNPROCESSABLE_CONTENT", 422)
    detail = "The request could not be processed."


class ServiceUnavailableError(AppError):
    """Raised when an external dependency (Supabase, Gemini) is unreachable."""
    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    detail = "A downstream service is currently unavailable."


# ---------------------------------------------------------------------------
# JSON error envelope helper
# ---------------------------------------------------------------------------

def _error_response(
    status_code: int,
    type_: str,
    message: str,
    detail: Any = None,
) -> JSONResponse:
    body: dict[str, Any] = {
        "error": {
            "code": status_code,
            "type": type_,
            "message": message,
        }
    }
    if detail is not None:
        body["error"]["detail"] = detail
    return JSONResponse(status_code=status_code, content=body)


# ---------------------------------------------------------------------------
# Handlers
# ---------------------------------------------------------------------------

async def _handle_app_error(request: Request, exc: AppError) -> JSONResponse:
    """Handle all custom AppError subclasses."""
    logger.warning(
        "AppError [%s] %s – %s %s",
        exc.status_code,
        type(exc).__name__,
        request.method,
        request.url,
    )
    return _error_response(
        status_code=exc.status_code,
        type_=type(exc).__name__,
        message=exc.detail,
        detail=exc.extra or None,
    )


async def _handle_http_exception(
    request: Request, exc: StarletteHTTPException
) -> JSONResponse:
    """Handle FastAPI / Starlette HTTPException (including 401, 403, 404…)."""
    return _error_response(
        status_code=exc.status_code,
        type_="HTTPException",
        message=exc.detail if isinstance(exc.detail, str) else str(exc.detail),
    )


async def _handle_validation_error(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    """Handle Pydantic request-body / query-param validation errors."""
    # Flatten pydantic errors into a readable list
    errors = [
        {
            "field": " → ".join(str(loc) for loc in err["loc"]),
            "message": err["msg"],
            "type": err["type"],
        }
        for err in exc.errors()
    ]
    return _error_response(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        type_="ValidationError",
        message="Request validation failed.",
        detail=errors,
    )


async def _handle_unhandled_exception(
    request: Request, exc: Exception
) -> JSONResponse:
    """Catch-all for any unhandled exception – logs full traceback."""
    logger.exception(
        "Unhandled exception on %s %s", request.method, request.url
    )
    return _error_response(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        type_="InternalServerError",
        message="An internal server error occurred.",
    )


# ---------------------------------------------------------------------------
# Registration helper
# ---------------------------------------------------------------------------

def register_exception_handlers(app: FastAPI) -> None:
    """
    Attach all global exception handlers to the FastAPI application.
    Call this in main.py immediately after creating the app instance.
    """
    app.add_exception_handler(AppError, _handle_app_error)                          # type: ignore[arg-type]
    app.add_exception_handler(HTTPException, _handle_http_exception)                 # type: ignore[arg-type]
    app.add_exception_handler(StarletteHTTPException, _handle_http_exception)        # type: ignore[arg-type]
    app.add_exception_handler(RequestValidationError, _handle_validation_error)      # type: ignore[arg-type]
    app.add_exception_handler(Exception, _handle_unhandled_exception)                # type: ignore[arg-type]
