# TCET Coding Platform

TCET Coding Platform is a full-stack coding platform with a React + Vite frontend, an Express 5 + TypeScript backend, MongoDB persistence, Redis-backed queueing, and Judge0-based code execution.

The current deployment model assumes centralized CoE authentication upstream of the backend.

## Tech Stack

- Frontend: React 18, Vite 5, TypeScript 5, React Router, React Query, Tailwind CSS
- Backend: Express 5, TypeScript 6, Zod, Helmet, cookie-parser, express-rate-limit
- Data: MongoDB, Redis, BullMQ
- Code execution: Judge0 or stub execution provider

## Repository Layout

- `frontend/` — browser app
- `backend/` — API, auth, queue worker, execution logic
- `infrastructure/` — Judge0 and deployment-related files
- `scripts/` — Judge0 helper scripts

## Current Runtime Model

The backend expects trusted CoE headers from a reverse proxy or gateway:

- `x-coe-email`
- `x-coe-name`
- `x-coe-role`
- `x-coe-status`

Current auth behavior:

- Direct public access to the backend is not supported.
- Trusted proxy source IPs must be listed in `COE_TRUSTED_PROXY_IPS`.
- `COE_JWT_SECRET` is required and must be at least 32 characters.
- `x-coe-status` must be `ACTIVE`.

## Prerequisites

- Node.js 18 or newer
- npm
- MongoDB
- Redis
- Firebase Admin service account JSON
- Docker
- Judge0 runtime environment for local code execution

## Local Environment Setup

### 1) Backend

```bash
cd backend
npm install
```

Create `backend/.env` with values similar to:

```env
NODE_ENV=development
PORT=3001
CORS_ORIGIN=http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173,http://127.0.0.1:5173
COE_AUTH_BASE_URL=http://127.0.0.1:4000
COE_JWT_SECRET=replace-with-a-32-character-minimum-secret
COE_REQUIRE_TRUSTED_PROXY=true
COE_TRUSTED_PROXY_IPS=127.0.0.1,::1,::ffff:127.0.0.1
FIREBASE_SERVICE_ACCOUNT_PATH=./firebase-key.json
FIREBASE_PROJECT_ID=your-firebase-project
MONGODB_URI=mongodb://127.0.0.1:27017
MONGODB_DB_NAME=Tcet-code-platform
EXECUTION_PROVIDER=judge0
JUDGE0_BASE_URL=http://127.0.0.1:2358
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_DB=0
SUBMISSION_QUEUE_NAME=tcet-code-submissions
SUBMISSION_WORKER_CONCURRENCY=3
EMBED_SUBMISSION_WORKER=false
```

Place the Firebase key at:

```text
backend/firebase-key.json
```

Run the backend:

```bash
npm run dev
```

Optional backend commands:

```bash
npm run dev:worker
npm run typecheck
npm run test
npm run seed
```

### 2) Frontend

```bash
cd frontend
npm install
```

Create `frontend/.env`:

```env
VITE_API_BASE_URL=http://localhost:3001
```

Run the frontend:

```bash
npm run dev
```

## Judge0 Setup

The backend is configured to use Judge0 through `JUDGE0_BASE_URL=http://127.0.0.1:2358`.

Root-level helper scripts:

```bash
npm run judge0:up
npm run judge0:status
npm run judge0:test-sandbox
npm run judge0:test-languages
npm run judge0:down
```

Judge0 helper files live in:

- `infrastructure/judge0/`
- `scripts/`

## Ports

- Frontend: `5173`
- Backend API: `3001`
- Mock CoE SSO: `4000`
- Judge0: `2358`

## API Summary

### Auth

- `GET /api/auth/sso/callback`
- `POST /api/auth/sso/callback`
- `GET /api/logout`

### Health

- `GET /`
- `GET /health`
- `GET /test-db` — available only outside production and only for trusted/internal sources

### Users

- `GET /api/users/me`
- `GET /api/users/me/analytics`
- `PATCH /api/users/me`
- `GET /api/user/profile`
- `GET /api/users/:email` — faculty only
- `GET /api/users/:email/analytics` — faculty only

### Problems

- `GET /api/problems`
- `GET /api/problems/:problemId`
- `GET /api/problems/manage` — faculty only
- `GET /api/problems/manage/:problemId` — faculty only
- `POST /api/problems` — faculty only
- `PATCH /api/problems/:problemId` — faculty only
- `PATCH /api/problems/:problemId/state` — faculty only

### Contests

- `GET /api/contests`
- `GET /api/contests/:contestId`
- `GET /api/contests/:contestId/questions/:questionId` — student only, active attempt required
- `GET /api/contests/:contestId/standings`
- `GET /api/contests/:contestId/standings/export` — faculty only
- `GET /api/contests/:contestId/attempts` — faculty only
- `GET /api/contests/:contestId/attempts/:attemptId` — faculty only
- `POST /api/contests/:contestId/attempts` — student only
- `POST /api/contests/:contestId/attempts/submit` — student only
- `POST /api/contests/:contestId/proctor-events` — student only
- `POST /api/contests/:contestId/answers` — student only
- `POST /api/contests/:contestId/coding-run` — student only
- `POST /api/contests/:contestId/coding-submissions` — student only

### Submissions

- `POST /api/submissions/run` — student only, rate limited
- `POST /api/submissions` — student only, queued submission
- `GET /api/submissions`
- `GET /api/submissions/:submissionId`

### Leaderboard

- `GET /api/leaderboard`
- `GET /api/leaderboard/export` — faculty only

## Script Reference

### Root

- `npm run judge0:up`
- `npm run judge0:down`
- `npm run judge0:status`
- `npm run judge0:test-sandbox`
- `npm run judge0:test-languages`

### Backend

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

### Frontend

- `npm run dev`
- `npm run build`
- `npm run build:dev`
- `npm run preview`
- `npm run lint`
- `npm run test`
- `npm run test:watch`

## Deployment Notes

- Keep the backend behind a trusted reverse proxy.
- Strip any client-supplied `x-coe-*` headers at the proxy.
- Set `COE_TRUSTED_PROXY_IPS` to the real proxy source IPs/CIDRs only.
- Keep `COE_JWT_SECRET` configured in production.
- Keep `COE_REQUIRE_TRUSTED_PROXY=true` in production.
- Do not expose `/health` or `/test-db` publicly.

## Security Notes

- Do not commit `backend/.env`.
- Do not commit `backend/firebase-key.json`.
- The frontend validates auth redirects against an allowlist before redirecting.
- The backend validates route parameters, request origins for state-changing calls, and code execution rate limits.

## Troubleshooting

### `401 Unauthorized: missing authentication headers`

- The request did not come through the trusted CoE auth path.
- Verify the reverse proxy is injecting the required headers.

### `401 Unauthorized source`

- The request source IP is not in `COE_TRUSTED_PROXY_IPS`.
- Update the allowlist and restart the backend.

### `403 Account is NOT_ACTIVE`

- CoE marked the user inactive.
- Confirm the upstream identity payload.

### `Failed to fetch`

- Check `VITE_API_BASE_URL`.
- Confirm backend CORS allows the frontend origin.
- Confirm the backend is reachable through the configured ingress path.

### Judge0 execution failures

- Run `npm run judge0:status`.
- Run `npm run judge0:test-sandbox`.
- Run `npm run judge0:test-languages`.
- Confirm `JUDGE0_BASE_URL=http://127.0.0.1:2358`.
