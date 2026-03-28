# BNAS Portal — Deployment Guide

## What you need
- A free account on [supabase.com](https://supabase.com)
- A free account on [vercel.com](https://vercel.com)
- A free account on [github.com](https://github.com) (Vercel deploys from GitHub)

---

## Step 1 — Set up Supabase (database + auth)

1. Go to [supabase.com](https://supabase.com) → **New Project**
2. Name it `bnas-portal`, choose a strong database password, pick a region (Europe West is fine)
3. Wait ~2 minutes for it to spin up

**Run the database schema:**
4. In your project, go to **SQL Editor** → **New Query**
5. Paste the entire contents of `supabase/schema.sql`
6. Click **Run**

**Get your API keys:**
7. Go to **Project Settings → API**
8. Copy:
   - **Project URL** → this is your `SUPABASE_URL`
   - **anon / public key** → this is your `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role key** → keep this secret, only for the migration scripts

---

## Step 2 — Create user accounts

On your computer (requires Python 3 + pip):

```bash
cd scripts
pip install supabase openpyxl

# Create auth users for all artists + admin
SUPABASE_URL=https://xxxx.supabase.co \
SUPABASE_KEY=<service_role_key> \
python3 setup_users.py
```

This creates all 5 accounts with the temporary password: **BNASPortal2026!**

---

## Step 3 — Import existing paybook data

```bash
# Point at your latest Excel file
SUPABASE_URL=https://xxxx.supabase.co \
SUPABASE_KEY=<service_role_key> \
EXCEL_PATH="/path/to/BNAS Artist Paybook 2026.xlsx" \
python3 migrate.py
```

**After running:**
- Go to Supabase → **Table Editor → profiles**
- Find `misha@bnas.co.za` → set `is_admin = true`

---

## Step 4 — Deploy the web app to Vercel

1. Upload the `bnas-portal` folder to a new GitHub repository
   - Go to [github.com](https://github.com) → **New repository** → name it `bnas-portal`
   - Upload all files (or use GitHub Desktop)

2. Go to [vercel.com](https://vercel.com) → **Add New Project**
3. Import your `bnas-portal` GitHub repo
4. Under **Environment Variables**, add:
   ```
   NEXT_PUBLIC_SUPABASE_URL     = https://xxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY = your-anon-key
   ```
5. Click **Deploy** — done in ~2 minutes

Your app will be live at: `https://bnas-portal.vercel.app`

---

## Step 5 — Send logins to artists

Email each artist their login details:

> **BNAS Artist Portal**
> URL: https://bnas-portal.vercel.app
> Email: [their email]
> Temporary password: BNASPortal2026!
>
> Please log in and change your password via the profile settings.

---

## Updating the app later

Any time you push a change to GitHub, Vercel automatically redeploys within ~1 minute. No manual steps needed.

## Adding a new show (day-to-day)

Log into the portal as Misha → click the artist → Show Log tab → **+ Add Show**

## Logging a payout

Admin → Artist → Payouts tab → **+ Log Payout**
The artist will see a notification to approve it on their next login.
