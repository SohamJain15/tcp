# TCET Code Studio Frontend

React + Vite frontend for TCET Code Studio.

## Runs On

- Default URL: `http://localhost:5173`

## Setup

```bash
npm install
```

Create `frontend/.env`:

```env
VITE_API_BASE_URL=http://localhost:3001
```

Start:

```bash
npm run dev
```

## Auth and Role Behavior

- Frontend uses cookie-based auth (`credentials: include`).
- Sign-in starts at mock SSO.
- Backend callback route resolves role and redirects:
  - `STUDENT` -> student dashboard
  - `FACULTY` -> faculty dashboard
- Manual Student/Faculty switch UI has been removed.
- Role guards redirect users away from unauthorized route groups.

## Submission Access

- Student problem submission endpoint is student-only.
- If signed in as faculty, student submit path is blocked/redirected.

## Scripts

- `npm run dev`
- `npm run build`
- `npm run build:dev`
- `npm run preview`
- `npm run lint`
- `npm run test`
- `npm run test:watch`

## Common Issues

### Login loop

- Use one host consistently (`localhost` recommended).
- Clear stale cookies for `localhost` and `127.0.0.1`.
- Make sure mock SSO (`4000`) and backend (`3001`) are running.

### Failed to fetch

- Confirm `VITE_API_BASE_URL` points to running backend (`3001`).
- Check backend CORS includes your frontend origin.
