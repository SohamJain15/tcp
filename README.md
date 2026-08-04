# TCET Coding Platform

TCET Coding Platform is a self-hosted programming practice and assessment system for Thakur College of Engineering and Technology (TCET). It gives students one place to practise coding, take proctored contests and class tests, and understand their progress; it gives faculty and institutional leadership secure tools to create assessments, review participation, and act on performance data.

The platform is designed for high-concurrency academic use. Browser requests stay responsive while code execution is queued and evaluated in isolated Judge0 sandboxes.

## Documentation

- [Documentation index](docs/README.md)
- [Student User Guide (PDF)](docs/TCET_Coding_Platform_User_Guide.pdf)
- [Technical documentation modules](docs/README.md#technical-documentation)
- [Deployment Guide](DEPLOYMENT_GUIDE.md)

## Product Capabilities

### Student experience

- Complete an academic profile through CoE single sign-on with validated UID, department, semester, and optional GitHub or LinkedIn links.
- Browse a searchable practice archive with status, difficulty, and topic filters.
- Run and submit solutions in supported languages; review verdicts, runtime, memory, and saved submission history.
- Register for eligible contests, work through Coding, MCQ, and MSQ questions, and use per-question coding drafts.
- Take targeted class tests with their own scheduling, attempts, proctoring controls, and released results.
- View global and contest leaderboards, personal report cards, rank, accuracy, language activity, difficulty breakdown, trends, and activity heatmaps.
- Submit contest feedback to unlock a published contest report and standings when required by the assessment workflow.

### Faculty experience

- Create, import, edit, publish, archive, and review programming problems with sample and hidden test cases.
- Create department-targeted contests with registration windows, timed attempts, Coding/MCQ/MSQ questions, result release, standings, registrations, attempt review, and CSV export.
- Create and manage class tests for defined student audiences; review attempts and proctoring events, then publish results.
- Review submissions with filters for source, status, language, date, problem, contest, and student department.
- Generate a contest report after published results. Reports combine deterministic metrics with a grounded local-AI narrative when available, fall back safely to templates, and can be exported as PDF.

### HOD and institutional reporting

- HODs receive a department-scoped participation view with student activity, cohort filters, difficulty distribution, consistency, heatmaps, contest participation, and student drill-down.
- HODs can delegate management of contests they created to faculty members in their own department.
- Allowlisted administrators receive cross-department analytics, department drill-down, institute-wide contest standings, leadership leaderboard access, and a separate admin profile.
- Department and admin analytics are read-only reporting surfaces: they do not expose problem statements, answer keys, test cases, or submitted source code.

## Assessment Integrity

The platform protects timed assessment workflows with these controls:

- Per-student deadlines: an attempt is bounded by its own duration and the assessment end time.
- Automatic saving of coding drafts during contest work; pending drafts can be auto-submitted at the deadline.
- Browser-level proctoring events, configurable violation thresholds, penalties, and automatic submission when a threshold is reached.
- Deferred contest scoring: students do not receive correctness, score, rank, or correct answers during a live or unpublished contest.
- Feedback-gated contest reports and standings after faculty publish results, when enabled by the contest flow.
- Deterministic, idempotent scoring for manual submit, deadline auto-submit, and result publication.

## Architecture

```text
                    CoE SSO / trusted reverse proxy
                                   |
                                   v
                         React + Vite frontend
                                   |
                                   v
                       Express 5 + TypeScript API
                         |            |           |
                         v            v           v
                     MongoDB      Redis/BullMQ  Report service
                         |            |
                         |            v
                         |       Submission workers
                         |            |
                         +-----------> Judge0 + isolate sandboxes
```

### Submission lifecycle

1. The API validates and persists a submission as `QUEUED`.
2. BullMQ buffers the work and a submission worker acquires it.
3. Judge0 compiles and executes the code in an `isolate` sandbox against the required test cases.
4. The worker persists a final verdict, pass count, runtime, and memory usage.
5. Practice submissions update relevant student analytics; contest and class-test scoring follows their release rules.

Queued execution absorbs submission bursts without placing compiler or sandbox work on the HTTP request path. Startup recovery re-enqueues stale queued/running submissions, and a background finaliser closes expired active attempts.

### Technology stack

| Area | Technology |
| --- | --- |
| Frontend | React 18, Vite, TypeScript, React Router, TanStack Query, Tailwind CSS, shadcn/ui |
| Backend | Node.js, Express 5, TypeScript, Zod, Helmet, cookie-parser, express-rate-limit |
| Persistence | MongoDB |
| Queueing | Redis and BullMQ |
| Code execution | Self-hosted Judge0 with `isolate` sandboxing |
| Authentication | Centralized CoE SSO through a trusted reverse proxy and signed CoE identity tokens |
| Operations | Docker Compose for Judge0 and PM2 configuration for application processes |
| Optional reporting AI | Local Ollama-compatible model with grounded output and template fallback |

## Roles and Access Model

| Role | Access |
| --- | --- |
| Student | Practice, contests, class tests, personal analytics, profile, and student-visible leaderboards/results. |
| Faculty | Problem authoring, contests, class tests, submission review, faculty leaderboard, and own profile. |
| Head of Department | Faculty access plus a department-scoped analytics and delegation view. |
| Administrator | Separate leadership dashboard with cross-department reporting, contest standings, leaderboard, and profile access. |

The upstream CoE identity service is authoritative for authentication and account status. The backend accepts identity information only from configured trusted proxy sources. The frontend improves navigation and user experience; backend authorization remains the enforcement boundary for every API call.

## Repository Layout

```text
.
├── frontend/                 # React application, pages, components, API client, and tests
├── backend/                  # Express API, services, repositories, workers, execution, and tests
├── infrastructure/judge0/    # Judge0 Docker Compose and sandbox override
├── scripts/                  # Judge0 lifecycle and diagnostic scripts
├── docs/                     # User guide and technical documentation modules
├── DEPLOYMENT_GUIDE.md       # Deployment procedures and operational notes
└── pm2.ecosystem.config.cjs  # PM2 process definitions
```

## Prerequisites

- Node.js 18 or newer
- npm
- MongoDB
- Redis
- Docker and Docker Compose for Judge0
- A configured CoE SSO / trusted reverse-proxy environment for authenticated use

For local code execution, start the supplied Judge0 stack. The application can use the `stub` execution provider for development and tests when Judge0 is unavailable.

## Local Development

### 1. Install dependencies

```bash
npm install
cd backend && npm install
cd ../frontend && npm install
```

### 2. Configure local environment

Create `backend/.env` with deployment-appropriate, non-production values. At minimum, configure the CoE JWT secret and trusted proxy settings, then select the local MongoDB, Redis, and execution endpoints.

```env
NODE_ENV=development
PORT=3001
FRONTEND_BASE_URL=http://localhost:5173
CORS_ORIGIN=http://localhost:5173
COE_AUTH_BASE_URL=http://localhost:4000
COE_JWT_SECRET=replace-with-a-secret-of-at-least-32-characters
COE_REQUIRE_TRUSTED_PROXY=false
COE_TRUSTED_PROXY_IPS=127.0.0.1
MONGODB_URI=mongodb://127.0.0.1:27017
MONGODB_DB_NAME=Tcet-code-platform
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
EXECUTION_PROVIDER=stub
```

Create `frontend/.env`:

```env
VITE_API_BASE_URL=http://localhost:3001
```

Never commit environment files, secrets, service-account credentials, or production tokens.

### 3. Start services

```bash
# Terminal 1: API server
cd backend
npm run dev

# Terminal 2: submission worker when EMBED_SUBMISSION_WORKER is disabled
cd backend
npm run dev:worker

# Terminal 3: frontend
cd frontend
npm run dev
```

The usual development ports are frontend `5173`, backend API `3001`, mock CoE SSO `4000`, and Judge0 `2358`.

### 4. Start Judge0 when using real execution

```bash
npm run judge0:up
npm run judge0:status
npm run judge0:test-sandbox
npm run judge0:test-languages
```

Set `EXECUTION_PROVIDER=judge0` and `JUDGE0_BASE_URL=http://127.0.0.1:2358` once the runtime checks pass.

## Configuration Reference

| Area | Important settings |
| --- | --- |
| CoE and ingress | `COE_AUTH_BASE_URL`, `COE_JWT_SECRET`, `COE_REQUIRE_TRUSTED_PROXY`, `COE_TRUSTED_PROXY_IPS`, `FRONTEND_BASE_URL`, `CORS_ORIGIN` |
| Data and queue | `MONGODB_URI`, `MONGODB_DB_NAME`, `REDIS_HOST`, `REDIS_PORT`, `REDIS_DB`, `REDIS_PASSWORD`, `SUBMISSION_QUEUE_NAME` |
| Execution | `EXECUTION_PROVIDER`, `JUDGE0_BASE_URL`, `JUDGE0_API_KEY`, `JUDGE0_HOST`, `JUDGE0_USE_WAIT`, `JUDGE0_POLL_INTERVAL_MS`, `JUDGE0_POLL_TIMEOUT_MS` |
| Submission throughput | `SUBMISSION_WORKER_CONCURRENCY`, `SUBMISSION_CHUNK_SIZE`, `SUBMISSION_BATCH_SIZE`, `SUBMISSION_BATCH_TEST_CASES`, `SUBMISSION_RECOVERY_STALE_MS` |
| Attempt lifecycle | `ATTEMPT_FINALIZER_INTERVAL_MS`, `EMBED_SUBMISSION_WORKER` |
| Platform scoring | `DEFAULT_PROBLEM_TIME_LIMIT_SECONDS`, `DEFAULT_PROBLEM_MEMORY_LIMIT_MB`, `RATING_POINTS_EASY`, `RATING_POINTS_MEDIUM`, `RATING_POINTS_HARD` |
| Local AI reports | `AI_ENABLED`, `AI_BASE_URL`, `AI_MODEL`, `AI_TIMEOUT_MS`, `AI_STALE_LOCK_MS` |

Production deployments must keep the backend private behind the trusted authentication path. Do not make the API directly reachable from the public internet.

## Judge0 Sandbox Notes

The Judge0 override in `infrastructure/judge0/overrides/isolate_job.rb` manages a bounded, recycled sandbox box-ID pool. This avoids the `isolate` range exhaustion that occurs when an ever-increasing submission identifier is used as a sandbox ID.

Useful tuning values:

- `JUDGE0_BOX_POOL_SIZE` controls concurrently available sandbox slots and must stay at or below `1000`.
- `JUDGE0_BOX_LOCK_DIR` sets the per-container lock directory.
- Submission concurrency and batch settings should be sized against the deployed Judge0 worker capacity.

After changing the override or Judge0 configuration, reload and verify the runtime:

```bash
npm run judge0:down
npm run judge0:up
npm run judge0:status
```

## Scripts

### Root

| Command | Purpose |
| --- | --- |
| `npm run judge0:up` | Start the Judge0 stack. |
| `npm run judge0:down` | Stop the Judge0 stack. |
| `npm run judge0:status` | Inspect runtime readiness. |
| `npm run judge0:test-sandbox` | Verify sandbox isolation. |
| `npm run judge0:test-languages` | Verify supported runtime languages. |

### Backend

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the API in development mode. |
| `npm run dev:worker` | Start a development submission worker. |
| `npm run build` | TypeScript build and report-asset copy. |
| `npm run start` / `npm run start:worker` | Start built API or worker processes. |
| `npm run typecheck` | Run TypeScript type checking. |
| `npm run test` | Run backend Vitest tests. |
| `npm run seed` | Seed local development data. |
| `npm run loadtest:queue` | Run submission queue load testing. |
| `npm run backfill:efficiency` | Backfill stored user-efficiency metrics. |

### Frontend

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Vite development server. |
| `npm run build` | Build the production frontend. |
| `npm run build:dev` | Build with development mode. |
| `npm run preview` | Preview a production build. |
| `npm run lint` | Run ESLint. |
| `npm run test` | Run frontend Vitest tests. |

## API Overview

All routes are relative to the backend API origin. Authentication and authorization apply to every protected endpoint; the listing below is a route map, not a replacement for server-side validation.

| Area | Representative routes |
| --- | --- |
| Authentication and users | `GET/POST /api/auth/sso/callback`, `GET /api/logout`, `GET/PATCH /api/users/me`, `GET /api/users/me/analytics` |
| Problems and submissions | `GET /api/problems`, `GET /api/problems/:problemId`, faculty `/api/problems/manage`, `POST /api/submissions/run`, `POST /api/submissions`, `GET /api/submissions` |
| Contests | `GET/POST /api/contests`, contest details, registration, attempts, answers, coding runs/drafts/submissions, proctor events, standings, exports, feedback, and faculty report routes under `/api/contests/:contestId/*` |
| Class tests | Student-assigned, attempt, answer, coding, proctoring, feedback, and result routes plus faculty creation, audience preview, review, and publication routes under `/api/class-tests/*` |
| Leaderboard | `GET /api/leaderboard` and authorized `GET /api/leaderboard/export` |
| HOD department analytics | `/api/department/overview`, students, contests, faculty, and managed-contest delegation routes |
| Administration | `/api/admin/departments`, department analytics and student drill-down, contest listings, and contest standings |

Route-level role checks, profile-completion checks, ownership checks, audience checks, and result-release rules determine the final allowed action.

## Reliability and Operations

- Submission recovery re-enqueues work that was persisted but left unfinished by a worker or runtime interruption.
- The attempt finaliser sweeps expired active contest and class-test attempts, submits saved drafts where applicable, and freezes the attempt state.
- Contest report generation is concurrency-safe; a stale generation lock can be reclaimed, and template-generated narratives remain available if the optional AI runtime is unavailable.
- Use `pm2.ecosystem.config.cjs` as the process-manager reference for deployed application processes.
- Follow [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) for deployment-specific setup and operating procedures.

## Security Requirements

- Keep `COE_REQUIRE_TRUSTED_PROXY=true` in production and restrict `COE_TRUSTED_PROXY_IPS` to real proxy source addresses or CIDRs.
- Strip client-supplied CoE identity headers at the reverse proxy and inject authenticated identity only after CoE verification.
- Require a strong `COE_JWT_SECRET`; do not expose it to the browser or commit it to the repository.
- Keep MongoDB, Redis, Judge0, workers, and administrative ingress on private or otherwise protected network paths.
- Treat contest questions, answer keys, hidden tests, submissions, and proctoring records as sensitive academic data.
- Review deployment changes with both application security and academic-integrity requirements in mind.

## Troubleshooting

### `401 Unauthorized: missing authentication headers`

The request bypassed the trusted CoE authentication path. Verify the reverse proxy injects the required authenticated identity headers or forwards a valid CoE token.

### `401 Unauthorized source`

The request source IP is not included in `COE_TRUSTED_PROXY_IPS`. Correct the trusted proxy configuration and restart the API.

### `403 Account is NOT_ACTIVE`

The upstream CoE identity marks the account inactive. Verify the user status with the CoE identity service.

### Frontend cannot reach the API

Check `VITE_API_BASE_URL`, backend availability, configured CORS origins, and the deployed ingress path.

### Judge0 execution failures

Run the runtime checks first:

```bash
npm run judge0:status
npm run judge0:test-sandbox
npm run judge0:test-languages
```

If logs show sandbox box-ID errors or missing sandbox paths, verify the custom `isolate_job.rb` override is deployed, then restart the Judge0 stack. Re-evaluate submissions that failed with an internal execution error during the outage.

## Contributing

Keep changes focused, preserve authorization boundaries, add or update tests for behavior changes, and do not commit secrets, generated local artifacts, or production data. For student-facing usage instructions and technical-documentation conventions, start with the [documentation index](docs/README.md).
