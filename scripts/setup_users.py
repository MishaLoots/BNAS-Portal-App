"""
BNAS Portal — User Setup Script
Creates Supabase auth users for all artists + admin, then links them to profiles.

Usage:
  pip install supabase
  SUPABASE_URL=... SUPABASE_KEY=<service_role_key> python3 setup_users.py

Run AFTER migrate.py (artists must exist before we link profiles).
"""

import os
from supabase import create_client

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_KEY"]   # service_role key

sb = create_client(SUPABASE_URL, SUPABASE_KEY)

USERS = [
    # (email, display_name, is_admin, artist_name_to_link)
    ("misha@bnas.co.za",                  "Misha",         True,  None),
    ("fatgrooveproductions@gmail.com",     "Pedro Barbosa", False, "Pedro Barbosa"),
    ("applegule@bnas.co.za",              "Apple Gule",    False, "Apple Gule"),
    ("bookingssaxby@gmail.com",           "Saxby Twins",   False, "Saxby Twins"),
    ("SlwaneMusic@outlook.com",           "Anzo",          False, "Anzo"),
]

# Temp password — users will be prompted to reset on first login
TEMP_PASSWORD = "BNASPortal2026!"

print("Creating auth users...")
for email, name, is_admin, artist_name in USERS:
    try:
        # Create user via admin API
        res = sb.auth.admin.create_user({
            "email": email,
            "password": TEMP_PASSWORD,
            "email_confirm": True,   # skip email verification
            "user_metadata": {"display_name": name}
        })
        user_id = res.user.id
        print(f"  ✓ Created: {email} (id: {user_id})")

        # Link profile
        profile_update = {"is_admin": is_admin}
        if artist_name:
            # Find artist_id
            artist = sb.table("artists").select("id").eq("name", artist_name).single().execute()
            profile_update["artist_id"] = artist.data["id"]

        sb.table("profiles").update(profile_update).eq("id", user_id).execute()
        print(f"    → Profile linked (admin={is_admin}, artist={artist_name})")

    except Exception as e:
        print(f"  ✗ {email}: {e}")

print(f"\n✅ Done. Temp password for all users: {TEMP_PASSWORD}")
print("   Artists should change their password on first login.")
print("   Send each person their email + the temp password.")
