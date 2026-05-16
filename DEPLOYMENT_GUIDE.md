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

## 4. Proxy & Security Configuration
The backend uses `app.set("trust proxy", 1)` to read Cloudflare's `X-Forwarded-For` headers. 
Rate limiting is strictly enforced: Global API (150/min), Code Submissions (10/min). Payload size is capped at 100kb.
