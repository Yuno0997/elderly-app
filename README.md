# Elderly Care Monitoring App

Facility-oriented web application for resident monitoring with a React frontend and Express + SQLite backend.

## Tech Stack

- Frontend: React, TypeScript, Vite, Tailwind CSS
- Backend: Node.js, Express
- Database: SQLite (`server/data/elderly-app.sqlite`)
- Auth: JWT + role-based access (admin, caregiver, relative)

## Local Development

Install dependencies:

```bash
npm install
```

Run frontend + backend together:

```bash
npm run dev:all
```

Run separately:

```bash
# terminal 1
npm run dev

# terminal 2
npm run dev:backend
```

Frontend: `http://localhost:3000`  
Backend: `http://localhost:4000`

## Share App to Other PC

### Option A: Same Wi-Fi / LAN (fastest)

1. Start backend:

```bash
npm run start
```

2. Start frontend for LAN access:

```bash
npm run dev -- --host 0.0.0.0 --port 3000
```

3. Get host IP on main PC:

```bash
ipconfig
```

Use the `IPv4 Address` (example: `192.168.1.42`).

4. Open from other PC:

- Frontend: `http://<HOST_IP>:3000`
- Health check: `http://<HOST_IP>:4000/api/health`

5. If blocked, allow firewall inbound ports on host PC:

- TCP `3000` (frontend)
- TCP `4000` (backend)

---

### Option B: ngrok (works even when LAN is blocked)

Use this if devices cannot reach each other on local network (guest Wi-Fi, AP isolation, policy restrictions).

#### 1) Install and authenticate ngrok (once)

```bash
winget install --id Ngrok.Ngrok -e
ngrok config add-authtoken <YOUR_NGROK_AUTHTOKEN>
```

#### 2) Build frontend

```bash
npm run build
```

#### 3) Deploy build to XAMPP

Automated (recommended):

```bash
npm run deploy:xampp
```

Copy contents of `build/` into:

`C:\xampp\htdocs\elderly-app\`

Make sure this file exists after copy:

`C:\xampp\htdocs\elderly-app\index.html`

#### 4) Proxy `/api` from Apache to the backend (one-time)

To make a single ngrok URL serve both UI and API, Apache must forward `/api/*` to the Node backend.

Use this config template:

`xampp/apache-elderly-app.conf`

Follow the instructions inside that file (enable Apache proxy modules + include the snippet), then restart Apache.

#### 5) Start required services on host PC

- Start Apache in XAMPP (port `80`)
- Start backend:

```bash
npm run start
```

#### 6) Start ngrok tunnel

Automated (recommended):

```bash
npm run tunnel:ngrok
```

Manual:

```bash
ngrok http 80
```

Use the HTTPS forwarding URL shown by ngrok (example):

`https://xxxx.ngrok-free.dev/elderly-app/`

#### 7) Verify

- App UI: `https://<NGROK_URL>/elderly-app/`
- API health: `https://<NGROK_URL>/api/health`

If API health works but UI is stale, hard refresh (`Ctrl+F5`) or open in private/incognito mode.

## Authentication

All endpoints except `/api/health` and `/api/auth/login` require:

```http
Authorization: Bearer <token>
```

Password policy:

- Minimum 6 characters
- Must include at least one letter and one number
- Admin-created users must change password on first login

## Seeded Users (development only)

- Admin: `admin@safealert.com` / `admin`
- No caregiver/relative accounts are seeded by default.
- Admin can create caregiver and relative accounts from the Users page.

In production, set `ALLOW_DEMO_SEED=false` to disable all demo user seeding.

## Core API Endpoints

### Auth

- `POST /api/auth/login`
- `POST /api/auth/bootstrap-admin` (one-time setup, no auth)
- `GET /api/auth/me`
- `GET /api/auth/session`
- `POST /api/auth/change-password`
- `POST /api/auth/logout-all-sessions`

### Users (admin)

- `GET /api/users`
- `POST /api/users`
- `PATCH /api/users/:id`
- `PATCH /api/users/:id/reset-password`

### Residents

- `GET /api/residents`
- `GET /api/residents?includeArchived=true`
- `GET /api/residents/:id`
- `POST /api/residents` (admin)
- `PATCH /api/residents/:id`
- `DELETE /api/residents/:id` (soft archive)

### Alerts / Incidents

- `GET /api/alerts`
- `PATCH /api/alerts/:id` with `{ "status": "unacknowledged" | "acknowledged" | "resolved" }`

### Medications

- `GET /api/medications`
- `POST /api/medications`
- `PATCH /api/medications/:id` with `{ "given": true | false }`

### Devices

- `GET /api/devices`
- `POST /api/devices` (admin)
- `PATCH /api/devices/:id` (admin)

### Audit Logs (admin)

- `GET /api/audit-logs`

## Audit Logging Coverage

The backend now writes immutable audit log records for:

- User create/update/password reset
- Resident create/update/archive
- Device create/update (including assignment changes)
- Medication create/update (given/pending)
- Alert status updates (acknowledged/resolved)

## Operational Notes

- Data persists in SQLite across backend restarts.
- Residents, alerts, medications, and devices start empty by default.
- Keep seeded credentials for development only; replace in production onboarding.

## Production Ops Pack

### Environment hardening

Copy `.env.example` and set:

- `APP_ENV=production`
- `JWT_SECRET=<strong-random-secret>`
- `ALLOW_DEMO_SEED=false`
- `FIRST_ADMIN_BOOTSTRAP_KEY=<one-time-bootstrap-secret>`
- Optional: `BACKUP_DIR=<custom-backup-folder>`

The backend now fails startup in production if `JWT_SECRET` is left at the dev default.
The backend also requires `FIRST_ADMIN_BOOTSTRAP_KEY` in production.

### First admin bootstrap (production)

When demo seeds are disabled and no admin exists yet, create first admin once:

```bash
curl -X POST http://localhost:4000/api/auth/bootstrap-admin \
  -H "Content-Type: application/json" \
  -d "{\"key\":\"<FIRST_ADMIN_BOOTSTRAP_KEY>\",\"name\":\"Facility Admin\",\"email\":\"admin@facility.local\",\"password\":\"Admin123\"}"
```

Notes:

- This endpoint works only while there are zero admin users.
- After first admin is created, it returns `409 Bootstrap already completed`.
- Keep the bootstrap key secret and rotate/remove it after initial setup.

### Backup and restore

Create backup:

```bash
npm run db:backup
```

Restore backup:

```bash
npm run db:restore -- "elderly-app-YYYYMMDD-HHMMSS.sqlite"
```

Or restore from absolute path:

```bash
npm run db:restore -- "C:\path\to\backup.sqlite"
```

Default backup folder: `server/data/backups` (or `BACKUP_DIR` if set).

### Daily runbook (facility admin)

- Verify service starts: `npm run start`
- Verify health: `GET /api/health`
- Check unresolved incidents and medication pending tasks
- Review `Audit Log` page for high-risk changes (users, residents, devices)
- Run `npm run db:backup` at end of shift

### Weekly runbook

- Test one restore on a staging copy using `npm run db:restore`
- Rotate admin passwords as policy requires
- Review inactive/disabled users and remove access no longer needed
  