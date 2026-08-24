# Deployment & Infrastructure Guide

## 1. Remote Access (Tailscale)
The VM is not publicly exposed. SSH and administrative access route through Tailscale.
1. Install Tailscale on the VM: `curl -fsSL https://tailscale.com/install.sh | sh`
2. Authenticate the VM to the TCET Tailnet.
3. Connect via the Tailscale IP (e.g., `100.x.x.x`).

## 2. Public Routing (Cloudflare Tunnels)
We use Cloudflare Tunnels (`cloudflared`) to securely expose local ports via reverse proxy.
* `codestudio.tcetcercd.in` -> Routes to Frontend (port 5173).
* `api.codestudio.tcetcercd.in` -> Routes to Backend API (port 3000).

## 3. Environment Variables (.env)
Production requirements:
* `CORS_ORIGIN=https://codestudio.tcetcercd.in`
* `JUDGE0_BASE_URL=http://localhost:2358`
* `SUBMISSION_WORKER_CONCURRENCY=4`

### DBMS SQL sandbox

Run the dedicated sandbox MySQL stack from `infrastructure/sql-sandbox` before enabling SQL labs.
The complete Linux setup, private port mapping, admin bootstrap, and rotation procedure are in
[`infrastructure/sql-sandbox/README.md`](infrastructure/sql-sandbox/README.md).

Production must include `SQL_SANDBOX_ISOLATED_INSTANCE=true`, a non-root
`MYSQL_ADMIN_USER`, and `MYSQL_ADMIN_PASSWORD`. The SQL sandbox must not share a MySQL instance
with production application data, and MySQL must remain bound to loopback/private Docker networking.

Server-side contest PDF exports use Playwright's Chromium renderer. Install the browser once on the
backend host after installing backend dependencies:
```bash
cd backend
npx playwright install --with-deps chromium
```
The renderer also detects an installed system Chrome/Chromium executable when one is already available.

For local compiler parity on a development machine, start the bundled Judge0 stack from the repo root with `npm run judge0:up`, then validate it with `npm run judge0:status`.

For SQL labs on the Linux deployment host, create `infrastructure/sql-sandbox/.env` from
`.env.example`, copy `mysql.cnf.example` to the deployment-only `mysql.cnf`, set both MySQL
passwords, and run `npm run sql-sandbox:enable` once. This enables Docker at boot and starts the
dedicated SQL sandbox. Its Compose service uses
`restart: unless-stopped`, so it returns automatically after a server reboot. Use
`npm run sql-sandbox:status` and `npm run sql-sandbox:logs` for verification and diagnostics.

For this 4-vCPU server, set `SQL_SANDBOX_CONCURRENCY=32` and `SQL_SANDBOX_POOL_SIZE=40` in the
backend production environment. Additional SQL requests wait in the backend queue. Each active
run consumes approximately two MySQL sessions; the dedicated sandbox is configured for 128
connections. Increase these only after load-testing the actual VM.

The SQL Compose service is hardened with a dedicated Docker bridge network, loopback-only MySQL
publication, a read-only root filesystem, dropped Linux capabilities, `no-new-privileges`, and
CPU/memory/process limits. Verify that the server firewall does not allow inbound TCP 3307:

```bash
sudo ss -ltnp | grep ':3307'
sudo ufw deny 3307/tcp
```

The `ss` output should show `127.0.0.1:3307`, never `0.0.0.0:3307` or the server's public/Tailscale
address.

## 4. Proxy & Security Configuration
The backend uses `app.set("trust proxy", 1)` to read Cloudflare's `X-Forwarded-For` headers. 
Rate limiting is strictly enforced: Global API (150/min), Code Submissions (10/min). Payload size is capped at 100kb.
