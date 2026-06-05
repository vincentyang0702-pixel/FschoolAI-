# CTO Email Setup - Quick Start

**CTO Email:** johannaresh@gmail.com

## Step 1: Copy .env.example to .env
```bash
cp .env.example .env
```

## Step 2: Email Already Configured
The `.env.example` file already has the CTO email configured:

```
# Your email for notifications and contact
CTO_EMAIL=johannaresh@gmail.com
```

Just copy it to `.env` - no changes needed!

## Step 3: Database Access
Your email is now registered. You can access the database:

**Option A: Supabase Dashboard (Easiest)**
- Go to https://app.supabase.com
- Login with your email
- Select the project
- View tables in "Table Editor"
- Run queries in "SQL Editor"

**Option B: Command Line**
```bash
# Connect to database
psql postgresql://postgres:$SUPABASE_DB_PASSWORD@db.vanzrpqmkmqgsbjdnfvj.supabase.co:5432/postgres

# View tables
\dt

# Query data
SELECT * FROM users;
```

## Step 4: Start Using Backend
```bash
npm install
npm run dev
```

Server runs on `http://localhost:5000`

---

**That's it! You're ready to go.**
