"""
app/db/supabase_client.py
--------------------------
Singleton Supabase clients for use across the application.

Two clients are exposed:
  get_supabase()       – anon/public client (row-level security enforced)
  get_supabase_admin() – service-role client (bypasses RLS; falls back to get_supabase if unset)
"""

from functools import lru_cache
from supabase import create_client, Client
from app.core.config import get_settings


@lru_cache
def get_supabase() -> Client:
    """
    Return a cached Supabase client initialised with the anon key.
    Row Level Security is enforced for all operations through this client.
    """
    s = get_settings()
    return create_client(s.supabase_url, s.supabase_key)


@lru_cache
def get_supabase_admin() -> Client:
    """
    Return a cached Supabase client initialised with the service-role key.
    If SUPABASE_SERVICE_ROLE_KEY is not configured, safely falls back to get_supabase().
    """
    s = get_settings()
    if not s.supabase_service_role_key:
        return get_supabase()
    return create_client(s.supabase_url, s.supabase_service_role_key)
