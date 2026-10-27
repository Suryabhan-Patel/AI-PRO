"""
app/db/client.py
----------------
Compatibility shim – re-exports from supabase_client.py.
Import directly from supabase_client in new code.
"""

from app.db.supabase_client import get_supabase, get_supabase_admin  # noqa: F401
