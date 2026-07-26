# TCET Coding Platform

## Overview
A highly scalable, centralized coding assessment and contest platform built for Thakur College of Engineering and Technology. Designed to handle mass lab sessions (4,000+ concurrent students), it provides a practice problem archive, timed proctored contests, sandboxed multi-language code execution, leaderboards, and faculty authoring/grading tools — with authentication delegated to a centralized CoE SSO gateway.

## Tech Stack & Architecture
* **Frontend:** React (Vite), TypeScript, Tailwind CSS, shadcn/ui
* **Backend:** Node.js, Express 5, TypeScript (protected by Helmet & rate limiting)
* **Database:** MongoDB
* **Message Queue:** Redis + BullMQ (asynchronous submission buffering to absorb load spikes)
* **Execution Engine:** Judge0 (self-hosted, sandboxed via `isolate` with a recycled box-ID pool)
* **Auth:** Centralized CoE SSO upstream of the API (trusted-proxy header model)
* **Infrastructure:** Cloudflare Tunnels (proxy), Tailscale (remote admin)

## Core Capabilities
* **Practice & problems** — difficulty tiers, sample/hidden test cases, per-language time/memory limits, run-before-submit, and rating on accepted submissions.
* **Contests** — Coding + MCQ/MSQ questions, department targeting, registration windows, per-student attempt timers, editor draft auto-save, and auto-submit at the deadline.
* **Proctoring** — violation tracking with penalties and auto-submit on reaching the limit.
* **Deferred scoring** — nothing is revealed during a live contest; scores, correctness, and standings are computed and shown only after faculty publish results.
* **Resilience** — asynchronous judging across a Judge0 worker pool, stale-submission recovery, and a background finaliser that closes abandoned attempts at their deadline.
* **Faculty tooling** — problem/contest authoring, attempt & proctoring review, standings, CSV exports, and a global rating-based leaderboard.

See [`README.md`](README.md) for setup, architecture diagram, API reference, and operations.
