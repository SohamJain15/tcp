# TCET Code Studio

TCET Code Studio is a role-based coding platform with a React frontend, an Express backend, and Firebase/Firestore persistence.

Authentication is now handled by centralized CoE infrastructure upstream of this backend.

## Current System Overview

This repo contains:

- `frontend/` - React + Vite + TypeScript app (default: `http://localhost:5173`)
- `backend/` - Express + TypeScript API (default: `http://localhost:3001`)

Key implemented behavior:

- CoE trusted-header auth (`x-coe-*`) from reverse proxy/gateway
- backend auth callback route remains: `GET /api/auth/sso/callback`
- automatic user provisioning in Firestore on first authenticated request
- role-based route protection across backend APIs
- role-based UI routing in frontend

## Authentication Flow (CoE Centralized)

1. User authenticates with CoE SSO at CoE gateway/infrastructure.
2. Reverse proxy forwards request to backend and injects trusted identity headers:
   - `x-coe-email`
   - `x-coe-name`
   - `x-coe-role`
   - `x-coe-status`
3. Backend `authMiddleware` validates:
   - required headers present, else `401 Unauthorized`
   - `x-coe-status === ACTIVE`, else `403 Forbidden`
   - request source is a trusted proxy (when enabled)
4. Backend sets `req.user` as:
   - `{ email, role, name }`
5. Existing RBAC and existing Firestore auto-provisioning continue unchanged.

Important notes:

- Backend must not be publicly reachable directly.
- `x-coe-*` headers are trusted only when requests originate from trusted proxy infrastructure.
- `app.set("trust proxy", true)` is required for reverse-proxy deployments.

## Role Rules

- `STUDENT`
  - can submit solutions: `POST /api/submissions`
  - appears on leaderboard
- `FACULTY`
  - can manage problems and export leaderboard
  - cannot submit on student submission endpoint

## Prerequisites

- Node.js 18+
- npm
- Firebase Admin service account key (JSON)
- Docker
- Linux `x86_64` host for full local Judge0 sandboxing, or a compatible VM/runtime

## Local Judge0

The deployed backend is already configured to use a local Judge0 endpoint via `JUDGE0_BASE_URL=http://localhost:2358`. To run the compiler stack locally without changing auth or app behavior:

```bash
npm run judge0:up
npm run judge0:status
```

Useful verification commands:

```bash
npm run judge0:test-sandbox
npm run judge0:test-languages
npm run judge0:down
```

Local Judge0 support files live in:

- `infrastructure/judge0/`
- `scripts/judge0-*.sh`

Judge0 is exposed at:

```text
http://localhost:2358
```

## Quick Start

### 1. Backend

```bash
cd backend
npm install
```

Create `backend/.env` and set at least:

```env
NODE_ENV=development
PORT=3001
CORS_ORIGIN=http://localhost:5173,http://127.0.0.1:5173
COE_AUTH_BASE_URL=http://127.0.0.1:4000
COE_JWT_SECRET=
COE_REQUIRE_TRUSTED_PROXY=true
COE_TRUSTED_PROXY_IPS=127.0.0.1,::1,::ffff:127.0.0.1
FIREBASE_SERVICE_ACCOUNT_PATH=./firebase-key.json
```

Place Firebase key at:

```text
backend/firebase-key.json
```

Run backend:

```bash
npm run dev
```

Optional seed:

```bash
npm run seed
```

### 2. Frontend

```bash
cd frontend
npm install
```

Create `frontend/.env`:

```env
VITE_API_BASE_URL=http://localhost:3001
```

Run frontend:

```bash
npm run dev
```

## Runtime Ports

- Frontend: `5173`
- Backend API: `3001`

## Required Auth Headers

All protected backend routes expect these headers from trusted upstream auth middleware:

- `x-coe-email`
- `x-coe-name`
- `x-coe-role`
- `x-coe-status`

`x-coe-role` mapping:

- `STUDENT` -> `STUDENT`
- `FACULTY`/`ADMIN`/`INDUSTRY` -> `FACULTY`

`x-coe-status` must be `ACTIVE`.

## API Highlights

### Auth and Session

- `GET /api/auth/sso/callback` - validates authenticated user and redirects by role
- `GET /api/logout` - redirects to CoE logout endpoint

### Health

- `GET /`
- `GET /health`
- `GET /test-db`

### Users

- `GET /api/users/me`
- `GET /api/user/profile` (legacy compatibility)
- `GET /api/users/:email` (faculty only)

### Problems

- `GET /api/problems`
- `GET /api/problems/:problemId`
- `GET /api/problems/manage` (faculty only)
- `GET /api/problems/manage/:problemId` (faculty only)
- `POST /api/problems` (faculty only)
- `PATCH /api/problems/:problemId` (faculty only)
- `PATCH /api/problems/:problemId/state` (faculty only)

### Submissions

- `POST /api/submissions/run` (non-persistent test run)
- `POST /api/submissions` (student only, queued + judged)
- `GET /api/submissions`
- `GET /api/submissions/:submissionId`

### Leaderboard

- `GET /api/leaderboard`
- `GET /api/leaderboard/export` (faculty only)

## User Auto-Provisioning

Users are automatically created/updated when authenticated requests hit protected routes.

Provisioned fields include:

- email
- role
- name/uid/department (if present in existing profile flow)
- stats defaults (`rating`, `score`, `problemsSolved`, etc.)

## Scripts

### Backend (`backend/`)

- `npm run dev`
- `npm run dev:worker`
- `npm run build`
- `npm run start`
- `npm run start:worker`
- `npm run typecheck`
- `npm run test`
- `npm run test:watch`
- `npm run seed`
- `npm run loadtest:queue`

### Frontend (`frontend/`)

- `npm run dev`
- `npm run build`
- `npm run build:dev`
- `npm run preview`
- `npm run lint`
- `npm run test`
- `npm run test:watch`

## Reverse Proxy Deployment Notes

This backend is designed for reverse-proxy auth architecture and is compatible with:

- Cloudflare Tunnel
- Tailscale VM deployment
- Internal gateway/reverse proxy auth layers

Production guidance:

- Keep backend private (bind internal interface or firewall to proxy-only ingress).
- Ensure proxy strips incoming client `x-coe-*` and injects canonical CoE headers.
- Set `COE_TRUSTED_PROXY_IPS` to actual proxy source IPs/CIDRs.
- Keep `COE_REQUIRE_TRUSTED_PROXY=true` in production.
- Keep `COE_JWT_SECRET` configured for future direct JWT verification support.

## Troubleshooting

### `401 Unauthorized: missing authentication headers`

- Request reached backend without CoE proxy header injection.
- Ensure request path goes through reverse proxy/gateway auth layer.

### `401 Unauthorized source`

- Source IP is not in `COE_TRUSTED_PROXY_IPS`.
- Add proxy IP/CIDR and restart backend.

### `403 Account is NOT_ACTIVE`

- CoE status header value is not `ACTIVE`.
- Confirm user account state in CoE auth system.

### `Failed to fetch`

- Confirm frontend points to backend `3001`.
- Ensure backend CORS includes frontend origin.
- Ensure backend is running and reachable through your chosen ingress path.

### Judge0 Is Reachable but Submissions Fail

- Run `npm run judge0:status`.
- Run `npm run judge0:test-sandbox`.
- Run `npm run judge0:test-languages`.
- Confirm `JUDGE0_BASE_URL=http://localhost:2358` in `backend/.env`.

## Security Notes

- Never commit secrets or credentials.
- Keep these files private:
  - `backend/.env`
  - `backend/firebase-key.json`
- Trusted-header auth is secure only when backend is protected behind trusted proxy infrastructure.
- If backend is directly exposed to the public internet, header spoofing is possible.
