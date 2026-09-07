# Batch classrooms

The `/api/classrooms` API replaces the old self-paced, proctored-session, and rotating-attendance-code APIs. The existing SQL authoring preview endpoint remains available. The frontend Labs feature flag controls the new list, classroom dashboard, and editor.

## Data and access

`classrooms` contains classroom metadata, experiment definitions, immutable session snapshots, enrollment, attendance, and manual grades. A revision-based compare-and-swap write protects concurrent roster and grade edits. The creation request includes all initial sessions in one document, so the classroom and schedule are committed together. Unique indexes enforce classroom IDs, invitation codes, and per-teacher creation request keys.

`classroom_work` stores immutable, versioned run/submission records. Unique request-derived IDs make retries idempotent. Code is saved before execution; the corresponding output is attached only to that record. Printable coding output comes from public sample runs; hidden evaluation exposes only its status. SQL results are stored, not reconstructed during report generation. `classroom_drafts` stores separate official/practice drafts using deterministic student/session/experiment keys.

Only the creator manages a classroom. Department and semester must match when enrolling; the batch comes from the classroom. Activated sessions freeze the enrollment roster, with eligible late entrants appended on entry. Attendance requires a server-time-active session and the teacher's network. Public IP addresses match exactly; RFC1918 IPv4 and private IPv6 use /24 and /64 respectively. Configure `COE_TRUSTED_PROXY_IPS` for the actual reverse proxy. A shared public NAT identifies that network, not a specific physical room.

Sessions use UTC timestamps and India time in the editor. Official writes require activation, enrollment, attendance, the network, and the selected language/experiment. Scheduled expiry is enforced on every request; no finalizer converts drafts into submissions. An explicitly closed session is also ended. Practice opens after ending and never changes official submissions or marks. Session content is frozen at scheduling and can be explicitly rescheduled only before its start.

One manual grade exists per classroom/student/experiment, including repeat sessions. Null means ungraded; zero is a grade. Every edit records actor and time. Students see saved marks immediately. CSV averages exclude null grades. PDF exports contain the latest official submission per experiment in each selected attended session; the UI retains all submitted versions.

## Endpoints

The classroom editor defaults to explicit batch student selection, with division and roll-range filters. `selectedStudentEmails` restricts code enrollment to validated students in the classroom department and semester; selecting students does not enroll them automatically. An empty selection is rejected. Null (or absent on older classrooms) permits cohort-wide code enrollment. Updating the selection removes deselected memberships while preserving session snapshots, work, and grades. Students cannot read the selection list.

- `GET/POST /api/classrooms`, `POST /join`, `GET/PATCH /:id`
- `DELETE /:id/members/:email`
- `POST /:id/sessions`, `PATCH /:id/sessions/:sessionId`
- `POST /:id/sessions/:sessionId/activate`, `/close`, `/enter`
- `POST /:id/sessions/:sessionId/work` with `requestKey`, `experimentId`, `mode`, `action`, `code`, and `language`
- `PATCH /:id/grades` with `email`, `experimentId`, and nullable `mark`
- `GET /:id/gradebook.csv`, `GET /:id/history.pdf?sessions=<comma-separated session IDs>`

## Reset and deployment

Deploy the new API and worker before resetting old data. Old workers must be stopped: the reset refuses to remove active lab jobs. The new worker and Mongo submission repository reject legacy `lab_coding` writes so old jobs cannot recreate removed records.

Run `npm run labs:reset:preview` from `backend` to inspect the configured database. Run `npm run labs:reset` to delete only the six old lab collections and `sourceType=lab_coding` submissions, remove their individual Redis jobs, and recalculate affected student/leaderboard aggregates. The manifest permits retrying after partial completion. New classroom collections and unrelated submission jobs are preserved. Redis cleanup uses commands compatible with older local Redis installations; application queue operation still requires the Redis version supported by BullMQ.

The reset was executed against the workspace's configured `TCP-Test` database; a subsequent preview verified zero old records.

SQL and coding execution retain the existing configured executors. PDF generation uses the shared Playwright Chromium renderer. Backend tests cover the service and HTTP contracts; frontend tests cover enrollment, grading, official work, practice, averages, and India-time conversions. The reset is not an application startup action.
