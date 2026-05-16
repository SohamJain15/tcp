# TCET Code Studio - Phase 1

## Overview
A highly scalable, centralized coding assessment platform built for Thakur College of Engineering and Technology. Designed to handle mass lab sessions (4,000+ concurrent students) featuring real-time code compilation, leaderboard generation, and SSO integration.

## Tech Stack & Architecture
* **Frontend:** React (Vite), Tailwind CSS, Shadcn UI
* **Backend:** Node.js, Express, TypeScript (Protected by Helmet & Rate Limiting)
* **Database:** Firebase / Firestore
* **Execution Engine:** Judge0 (Local Instance, Sandboxed via `isolate`)
* **Message Queue:** Redis (Asynchronous buffering to prevent DDOS)
* **Infrastructure:** Cloudflare Tunnels (Proxy), Tailscale (Remote Admin)
