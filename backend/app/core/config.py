"""
app/core/config.py
------------------
Pydantic-settings configuration loaded from environment variables / .env.
Safe development fallbacks are provided so the app can boot and run demo mode
even before external cloud credentials (Supabase, Gemini) are configured.
"""

from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # --- Application ---
    app_name: str = "Travel Planner API"
    app_env: str = "development"
    debug: bool = True

    # --- Supabase ---
    supabase_url: str = "https://placeholder-project.supabase.co"
    supabase_key: str = "placeholder-anon-key"
    supabase_service_role_key: str = ""
    # Supabase signs JWTs with this secret (Settings → API → JWT Secret)
    supabase_jwt_secret: str = "dev-secret-key-at-least-32-bytes-long-placeholder"

    # --- Google Gemini AI ---
    gemini_api_key: str = "placeholder-gemini-key"

    # --- CORS ---
    allowed_origins: str = "http://localhost:5173"

    @property
    def allowed_origins_list(self) -> list[str]:
        """Parse comma-separated ALLOWED_ORIGINS into a Python list."""
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]

    @property
    def is_supabase_configured(self) -> bool:
        return (
            bool(self.supabase_url)
            and "placeholder" not in self.supabase_url
            and bool(self.supabase_key)
            and "placeholder" not in self.supabase_key
        )

    @property
    def is_gemini_configured(self) -> bool:
        return (
            bool(self.gemini_api_key)
            and "placeholder" not in self.gemini_api_key
        )


@lru_cache
def get_settings() -> Settings:
    """Return a cached singleton instance of Settings."""
    return Settings()
