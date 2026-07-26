# TCET Coding Platform

TCET Coding Platform is a full-stack, self-hosted competitive-programming and assessment platform for running large-scale coding contests and lab exams — designed for mass sessions with thousands of concurrent students. It combines a practice problem archive, timed proctored contests, real-time code execution across 20+ languages, and faculty tooling for authoring, monitoring, and grading.

It uses a React + Vite frontend, an Express 5 + TypeScript backend, MongoDB for persistence, Redis + BullMQ for asynchronous submission queuing, and a self-hosted Judge0 cluster (sandboxed via `isolate`) for code execution. Authentication is delegated to a centralized CoE SSO gateway upstream of the backend.

## Overview

The platform serves two roles:

- **Students** — solve practice problems, register for and take timed contests (coding + objective questions), submit code that is judged in a secure sandbox, and view results and rankings once released.
- **Faculty** — author problems and contests, target contests by department, monitor attempts and proctoring events, and publish results and standings.

## Key Features

**Practice & problems**

- Problem archive with difficulty tiers, sample/hidden test cases, and per-language time/memory limits.
- Run-before-submit, rate-limited execution, and rating awarded on accepted submissions.

**Contests**

- Timed contests mixing Coding and MCQ/MSQ questions, with department targeting and registration windows.
- Per-student attempt timer (start + duration, capped at contest end), editor draft auto-save, and auto-submit of unsubmitted drafts when time runs out.
- **Proctoring** — violation events are logged and penalized; reaching the configured limit auto-submits the attempt.
- **Deferred scoring** — nothing is revealed during a live contest; scores, correctness, and standings are computed and shown only after faculty publish results.

**Execution & scale**

- Submissions are queued (Redis/BullMQ) and judged asynchronously by a pool of Judge0 workers, so bursts of thousands of simultaneous submissions are buffered rather than overwhelming the judge.
- Sandbox isolation via `isolate` with a recycled box-ID pool (see [Judge0 Setup](#judge0-setup)).
- Resilience — stale-submission recovery and a background attempt finaliser (see [Background Jobs](#background-jobs)).

**Faculty tooling**

- Problem/contest authoring, attempt & proctoring review, standings, and CSV exports.
- Global rating-based leaderboard.

## Architecture

```
Browser (React + Vite)
      │  CoE SSO headers, injected by a trusted reverse proxy
      ▼
Express API  (TypeScript, Zod, Helmet, rate limiting)
      │                                  │
      ▼                                  ▼
   MongoDB                        Redis + BullMQ queue
 (users, problems, contests,             │
  attempts, submissions)                 ▼
                              Judge0 workers ──► isolate sandbox (self-hosted)
```

**Submission lifecycle** — a submission is persisted as `QUEUED`, enqueued to BullMQ, picked up by a worker, executed on Judge0 against the problem/question test cases, then finalized with a verdict (`ACCEPTED` / `WRONG_ANSWER` / `TIME_LIMIT_EXCEEDED` / `RUNTIME_ERROR` / `COMPILATION_ERROR` / `INTERNAL_ERROR`), pass count, runtime, and memory. For contest submissions the verdict is written back onto the attempt, while points stay deferred until publish.

**Contest lifecycle** — `register → start attempt → (answer / run / submit, drafts auto-saved) → submit or auto-submit at deadline → faculty publish`. Grading (`finalizeAttemptScoring`) is the single scoring pass — deterministic and idempotent — run at submit, auto-submit, and publish. Coding points are proportional to passed test cases; a question is `SOLVED` only on a full pass with an `ACCEPTED` verdict; objective questions are graded by correctness; and violation penalties are deducted. Standings rank by score, then time taken, then start time. Results stay hidden from students until `resultsPublished` is set.

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

### Sandbox box-ID pool (custom `isolate_job.rb`)

Judge0's job runner is customized in `infrastructure/judge0/overrides/isolate_job.rb` (mounted read-only into the `server` and `worker` containers). Each run **leases a sandbox box ID from a small, recycled pool** instead of deriving it from the submission ID.

Why this exists: `isolate` only permits box IDs `0–999`. Deriving the box ID from the ever-incrementing submission ID exhausts that range after 1000 submissions and then breaks **all** judging with `Sandbox ID out of range (allowed: 0-999)` → `Internal Error (status 13)`. The pool leases the lowest currently-free ID (held via an `flock`, returned on cleanup), so box IDs stay bounded and are recycled — the range can never be exhausted regardless of total submission volume. `isolate` state is per-container, so the pool is scoped per worker container.

Optional environment variables (defaults are fine for most deployments):

- `JUDGE0_BOX_POOL_SIZE` — number of concurrent sandbox slots (default `100`). Must exceed a worker's concurrency and stay `≤ 1000`.
- `JUDGE0_BOX_LOCK_DIR` — lock directory for the pool (default `/tmp/judge0-box-locks`, per container).

After editing the override, reload it into the containers and re-check the runtime:

```bash
npm run judge0:down && npm run judge0:up
npm run judge0:status   # expect RUNTIME_PROBE=ok
```

## Background Jobs

The backend runs two maintenance jobs (in the API server process):

- **Stale submission recovery** — on startup, re-enqueues any submission left `QUEUED`/`RUNNING` and never finalized, so a worker/Judge0 hiccup doesn't strand submissions.
- **Attempt finaliser** — on a timer, finalises every `ACTIVE` attempt whose personal deadline has passed: it auto-submits any unsubmitted draft for judging and marks the attempt `AUTO_SUBMITTED` as of the deadline. This closes abandoned attempts near their real deadline instead of leaving them open until the student returns or results are published. Scoring stays deferred (hidden from students) until faculty publishes.
  - `ATTEMPT_FINALIZER_INTERVAL_MS` — sweep interval in ms (default `60000`; set `0` to disable).

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
- If logs show `Sandbox ID out of range (allowed: 0-999)`, `chown: cannot access '/box'`, or `rb_sysopen - /box/script.py` (Internal Error / status 13), the sandbox box-ID range was exhausted. This is handled by the box-ID pool in `infrastructure/judge0/overrides/isolate_job.rb` — ensure that override is deployed, then reload with `npm run judge0:down && npm run judge0:up`. Re-judge any submissions that returned `INTERNAL_ERROR` during the outage.
