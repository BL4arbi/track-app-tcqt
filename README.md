# SolidWorks Team Tracker

Internal tool for a ~20-person mechanical design team to see who's working on what, for which
client, at what step — plus a lightweight document store for SolidWorks files with a static
preview image. See the original handout for full product context.

Status: core web app (steps 1-5) plus the Electron desktop wrapper (step 6) are built and
verified. Backend hosting (step 7) is **not done yet** — see "Not done yet" below.

## Stack

- `backend/` — Node.js + Express + PostgreSQL (raw `pg`, no ORM), JWT auth, multer file uploads.
- `frontend/` — Vue 3 + Vite, Vue Router, Pinia, plain CSS, axios API client.

## Prerequisites

- Node.js 18+
- A running PostgreSQL instance (local install, or `docker run -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:16-alpine`)

## Backend setup

```
cd backend
npm install
cp .env.example .env   # edit DATABASE_URL, JWT_SECRET, ALLOWED_EMAIL_DOMAIN, SMTP_*
npm run migrate        # applies backend/src/db/schema.sql
npm run dev            # http://localhost:4000
```

Notes on `.env`:
- `ALLOWED_EMAIL_DOMAIN` restricts signup to `@yourdomain.com` — set it to your real domain.
- If `SMTP_HOST` is left blank, verification/reset emails are printed to the console instead of
  sent, which is convenient for local dev — copy the `token=...` link from the log.
- `UPLOAD_DIR` is where native SolidWorks files and preview images are stored on disk.

## Frontend setup

```
cd frontend
npm install
cp .env.example .env   # VITE_API_BASE_URL, defaults to http://localhost:4000
npm run dev            # http://localhost:5173
```

Sign up with an `@<ALLOWED_EMAIL_DOMAIN>` address, verify via the emailed (or logged) link, then
log in.

## Desktop app (Electron)

The `frontend/` package doubles as the Electron app — `frontend/electron/main.js` is the main
process, and `electron-updater` is wired to check `BL4arbi/track-app-tcqt` GitHub Releases.

```
cd frontend
npm run electron:dev      # runs Vite dev server + Electron together, hot reload
npm run electron:build    # builds an unsigned Windows installer into frontend/release/, no publish
npm run release           # bumps patch version, builds, and publishes a DRAFT GitHub release
```

Notes:
- `npm run release` needs a `GH_TOKEN` env var (a GitHub personal access token with `repo` scope)
  to create the draft release — `electron-builder` reads it automatically. Nothing is published
  until you review and publish the draft on GitHub.
- The installer is unsigned, so Windows SmartScreen will flag it on first run — expected for an
  internal tool; per the handout, skip code-signing unless it becomes annoying.
- `frontend/electron/main.js` points at `http://localhost:5173` in dev and at the built
  `dist/index.html` when packaged; it does not yet know the production backend URL — that's set
  via `frontend/.env`'s `VITE_API_BASE_URL` at build time (baked into the bundle), so re-build
  after pointing it at the real backend host.

## What's implemented (handout section 6, MVP feature list)

1. Signup + email verification + login (+ forgot/reset password)
2. Dashboard — all active tasks across the team: who, client, current step, next step, last updated
3. My Tasks — create/update your own tasks (client, title, current step, next step, status)
4. Task detail page — history log + attached documents
5. Document upload per task (native SolidWorks/PDF file + preview image), inline preview, download
6. Every step/status change writes a row to `task_history`

Explicitly out of scope for v1, per the handout: stats/charts, automatic CAD thumbnails,
interactive 3D preview, OAuth/SSO, mobile app, notifications.

## Not done yet (handout section 9, step 7)

**Backend deployment**, so the desktop app is reachable from every client site. Decided against
a self-managed VPS — plan is a managed platform (e.g. Railway/Render/Fly.io) that hosts the
Express app + Postgres with HTTPS included, no server admin. Needs a paid tier with a persistent
volume for `backend/uploads/` (free tiers usually wipe disk on redeploy). Blocked on: creating
that platform account (needs your payment details, can't be done on your behalf).

Once that's live, `frontend/.env`'s `VITE_API_BASE_URL` gets pointed at the real HTTPS URL and
the desktop app gets rebuilt/released.
