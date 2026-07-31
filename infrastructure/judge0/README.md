# Judge0 execution tier — operations guide

Judge0 runs on the same VM as the API, Mongo and Redis, so its limits are what keep a
student's program from degrading the whole platform. This documents the settings that
matter and why they are set the way they are.

`judge0.conf` is **not in git** (it holds the Postgres/Redis passwords). It lives on the
server at `~/tcp/infrastructure/judge0/judge0.conf` and is mounted read-only into the
`server` and `worker` containers by `docker-compose.yml`.

```bash
cd ~/tcp/infrastructure/judge0
docker compose up -d          # start
docker compose restart        # after editing judge0.conf
docker compose logs -f worker # follow the sandbox workers
```

---

## Required `judge0.conf` values

| Key | Value | Why |
|---|---|---|
| `ENABLE_NETWORK` | `false` | Submitted code must not reach the network. `ALLOW_ENABLE_NETWORK=false` stops a request from re-enabling it per submission. |
| `ENABLE_WAIT_RESULT` | `true` | Lets the API collect a result in one round-trip instead of polling. See "Throughput" below. |
| `COUNT` | `4` | Concurrent isolate workers. **Coupled to RAM — see the warning below.** |
| `MAX_QUEUE_SIZE` | `2000` | Backlog ceiling. The API is rate-limited well below this. |
| `MAX_CPU_TIME_LIMIT` | `60` | Ceiling a request may ask for. The API always sends ≤5 s, so this is only a backstop. |
| `MAX_WALL_TIME_LIMIT` | `120` | As above; the API sends ≤10 s. |
| `MAX_MEMORY_LIMIT` | `2097152` (2 GB) | Ceiling. The API sends 256 MB × a per-language multiplier (Java/Kotlin ×4 = 1 GB). |
| `MAX_PROCESSES_AND_OR_THREADS` | **set explicitly, e.g. `64`** | Fork-bomb cap. Only the `MAX_MAX_…` ceiling (512) is currently set, so the built-in default silently applies — pin it deliberately. |
| `MAX_MAX_PROCESSES_AND_OR_THREADS` | `512` | Hard ceiling a request may ask for. |

### Do not raise `COUNT` without adding RAM

`COUNT=4` is currently what protects the box. A Java submission is sent
`256 MB × 4 = 1 GB`, so four concurrent Java runs is already ≈4 GB, alongside MongoDB,
Node and Redis on a 12 GB VM. Raising `COUNT` to buy throughput without a RAM upgrade
invites the OOM killer, which will terminate whichever process it likes — including Mongo.

### cgroup v2 and the per-process flags

The host runs cgroup v2, and `/sys/fs/cgroup` is mounted read-write into the containers.
The API deliberately sends:

```
enable_per_process_and_thread_time_limit:   false
enable_per_process_and_thread_memory_limit: false
```

With these `false`, `memory_limit` caps the **whole cgroup** — every process a submission
spawns, counted together. That is the host-safe reading. Setting them `true` applies the
limit to each process *individually*, so a program that forks 10 children could reserve
10× the memory. **Do not flip them.** They are asserted in
`backend/src/execution/judge0-execution-provider.test.ts`.

---

## Throughput: why the API is configured the way it is

Peak concurrent Judge0 jobs from the API is:

```
(worker processes) × SUBMISSION_WORKER_CONCURRENCY × SUBMISSION_CHUNK_SIZE
```

With `SUBMISSION_WORKER_CONCURRENCY=3` and `SUBMISSION_CHUNK_SIZE=5` that is 15 in-flight
requests against `COUNT=4` workers — 11 of them queue *inside* Judge0 while API workers sit
blocked. Keep the product near `COUNT`; lower `SUBMISSION_CHUNK_SIZE` first, since it costs
nothing but per-submission latency.

Relevant API `.env` settings:

| Key | Recommended | Note |
|---|---|---|
| `EXECUTION_PROVIDER` | `judge0` | Defaults to `stub`, which silently fakes results. Must be `judge0` in production. |
| `JUDGE0_BASE_URL` | `http://127.0.0.1:2358` | Self-hosted; keep `JUDGE0_API_KEY` empty. |
| `JUDGE0_USE_WAIT` | `true` | Uses `wait=true`. Requires `ENABLE_WAIT_RESULT=true`; falls back to polling automatically if unsupported. |
| `JUDGE0_POLL_TIMEOUT_MS` | `30000` | Fallback-path ceiling. A run is capped at 5 s CPU / 10 s wall, so 120 s only pinned a worker to a dead job. |
| `SUBMISSION_CHUNK_SIZE` | `5` (tune to `COUNT`) | Test cases dispatched in parallel per submission. |
| `SUBMISSION_WORKER_CONCURRENCY` | `3` | Submissions processed in parallel per worker process. |
| `EMBED_SUBMISSION_WORKER` | `false` | The worker runs as its **own process** — restart it separately after changing any of the above. |

### Why `wait=true` matters

With polling, `JUDGE0_POLL_INTERVAL_MS=1500` means a program that finishes in 40 ms still
occupies an API worker for at least 1.5 s. A 15-test submission spent ≈4.5 s purely waiting
on the polling clock. `wait=true` returns the finished result in a single request; the
client falls back to token+poll automatically (once, then permanently for that process) if
the deployment rejects it.

---

## Verifying the sandbox

Run each of these as a normal submission and confirm the verdict **and** that the host stays
healthy (`free -h`, `docker stats`, no OOM lines in `dmesg`):

| Test | Expected verdict |
|---|---|
| `while(true){}` (C++) | `TIME_LIMIT_EXCEEDED` |
| Allocate 4 GB in a loop | `RUNTIME_ERROR` (cgroup kill), host unaffected |
| Fork bomb — `while(1) fork();` | `RUNTIME_ERROR`, capped by `MAX_PROCESSES_AND_OR_THREADS` |
| `curl http://example.com` / socket connect | Fails — networking disabled |
| Read `/etc/shadow` | Permission denied |

After any `judge0.conf` change: `docker compose restart`, then re-run the table above.
