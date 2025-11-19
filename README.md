## Deployment Guide (Supabase + Render + Netlify)

This folder documents how to publish the project without touching the existing source tree. All scripts/config live under `deployment/`. Follow each section in order.

---

### 1. Prerequisites

- GitHub repo containing this project.
- Supabase account (free tier).
- Render account (or Railway) for hosting the Node server.
- Netlify account for hosting the React UI.
- Node 18 locally (for sanity checks).

---

### 2. Provision Supabase Postgres

1. Sign in to [Supabase](https://supabase.com) → **New project**.
2. Choose a strong database password and note the generated connection string (Settings → Database → Connection string (URI)).
3. Open the SQL editor and run the contents of [`supabase-schema.sql`](./supabase-schema.sql):
   ```sql
   -- Example
   create extension if not exists "pgcrypto";
   -- ... rest of script ...
   ```
   This recreates all tables (`questions`, `students`, `sessions`, `session_questions`, `responses`, `violations`, `audit_logs`) plus seed data.
4. (Optional) Add additional rows to `students` and `questions` inside Supabase.

The important outputs:

| Variable | Where to find it |
|----------|------------------|
| `SUPABASE_DB_URL` | Supabase → Settings → Database → Connection string (URI) |
| `SUPABASE_DB_HOST` / `PORT` / `USER` / `PASSWORD` / `DATABASE` | Same page (connection info) |

---

### 3. Update the backend to use Supabase (Postgres)

> **No code is changed here**; this section explains what must be modified in the `server/` directory before deploying. Make edits in a feature branch or fork.

1. **Install Postgres driver**  
   ```bash
   cd server
   npm install pg
   ```
2. **Replace `mysql2` pool with `pg` Pool** (`server/src/db/pool.js`):
   - Import `{ Pool }` from `pg`.
   - Create a pool with the Supabase credentials or a single `DATABASE_URL`.
   - Remove MySQL-specific options (`namedPlaceholders`, `connectionLimit`, etc.).
3. **Adjust SQL syntax** in `sessionService.js` & `schema.sql` usage:
   - Replace MySQL specific quotes/backticks with Postgres double quotes or none.
   - Ensure booleans use `true/false` instead of `1/0`.
   - Replace `NOW()` usages if necessary (Postgres accepts `NOW()`).
4. **Environment variables**  
   Use `deployment/server.env.example` as a template (see below).
5. Run the Node server locally pointing to Supabase to confirm everything still works.

When these changes are committed, you are ready to host the backend.

---

### 4. Deploy backend on Render

1. Push the updated repo to GitHub.
2. In Render → **New + → Web Service** → connect the repo.
3. Settings:
   - Build command: `cd server && npm install`
   - Start command: `cd server && npm run start`
   - Runtime: Node 18+
4. Add environment variables (Render dashboard → Environment):
   ```
   PORT=4000
   DATABASE_URL=<Supabase connection URI>
   SUPABASE_DB_HOST=<host>
   SUPABASE_DB_PORT=6543
   SUPABASE_DB_USER=<user>
   SUPABASE_DB_PASSWORD=<password>
   SUPABASE_DB_NAME=<database>
   EXAM_PASSWORD=EXAM@123
   SESSION_DURATION_MINUTES=45
   ALLOWED_ORIGINS=https://<your-netlify-site>.netlify.app
   ```
5. Deploy. Render will provide a URL like `https://exam-server.onrender.com`.

---

### 5. Deploy frontend on Netlify

1. In `client/.env`, set `VITE_API_BASE_URL=https://exam-server.onrender.com`.
2. Commit the `.env` file or, preferably, create `.env.production` and reference it during build.
3. On Netlify:
   - **New site from Git** → select repo.
   - Build command: `npm run build`
   - Publish directory: `client/dist`
   - Environment variable: `VITE_API_BASE_URL` (same value as above).
4. Netlify will assign `https://<your-site>.netlify.app`. This is the single public link you can share.

---

### 6. Monitoring & Access Control

- **Supabase dashboard**: track sessions, run SQL queries, export audit logs.
- **Render logs**: watch real-time server output (login, STARTED_TEST, etc.).
- **Restricting access**:
  - Keep the Netlify URL private or behind Netlify Identity if needed.
  - On Supabase, enable Row Level Security if you expand functionality.
  - Use Render environment variables to rotate exam passwords quickly.

---

### 7. Files included in `deployment/`

| File | Purpose |
|------|---------|
| `README.md` | This deployment guide. |
| `supabase-schema.sql` | Postgres-ready schema & seed data for Supabase. |
| `server.env.example` *(optional to create)* | Template with all environment variables for Render/local usage. |

Add additional helper scripts here as you iterate (e.g., Terraform, CI configs) without touching the main codebase.

---

Need help adjusting the Node code for Postgres or automating the deploy? Let me know! 

