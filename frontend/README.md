# AI Interview — frontend

Production frontend for the AI interviewer: a **candidate interview app** (`/i/[token]`) and a **recruiter / reviewer console** (`/console`). Next.js 16 · React 19 · TypeScript strict · Tailwind v4 · Zustand · TanStack Query · zod · Vitest · Playwright.

Start with **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** — directory map, turn flow, invariants, state machine. Backend teams: **[docs/api-contract.md](docs/api-contract.md)**.

## Run it

```bash
cp .env.example .env.local        # mock mode by default
npm install
npm run dev                       # http://localhost:3000
```

- Demo interview: <http://localhost:3000/i/demo> — consent → device check (or typed answers) → disclosure → questions. Give a “we did X, 30% improvement” answer and watch the OWN probe fire.
- Console: <http://localhost:3000/console> — any work email, password = `CONSOLE_DEV_PASSWORD` (`change-me` in `.env.example`). Prefix the email with `reviewer` / `admin` for those roles.

The mock BFF lives in `src/mock/` and runs inside the app (`/api/mock/*`). Point at a real backend with:

```
NEXT_PUBLIC_API_MODE=real
NEXT_PUBLIC_API_BASE_URL=https://api.example.com/api/v1
```

## Quality gates

```bash
npm run check                                   # typecheck + lint + unit tests
PLAYWRIGHT_BASE_URL=http://localhost:3000 npm run e2e   # e2e against the dev server
npm run build && npm run e2e                    # e2e against a production server (CI)
```

CI: `.github/workflows/frontend-ci.yml` (typecheck, lint, format, unit + coverage, e2e, Docker build).

## Non-negotiables baked into the UI

- Only `candidate_message` is ever shown to a candidate; the DTO is parsed with a **strict** zod schema — leaked fields fail closed.
- No praise, no progress bar, no counters, no interview clock. Fixed neutral bridge line after 1.5 s.
- Rights bar (Repeat · Rephrase · Break · Adjustment · Stop) on every interview screen; accommodations apply immediately and never ask why.
- Behavioral signals render only in the report's collapsed, non-scored block — never near a score.
- The human decision is recorded separately from the model's label.
- CSP with per-request nonce, `frame-ancestors 'none'`, no secrets in the client bundle, console gated by a signed HttpOnly cookie.

## Deploy

```bash
docker build -t ai-interview-frontend \
  --build-arg NEXT_PUBLIC_API_MODE=real \
  --build-arg NEXT_PUBLIC_API_BASE_URL=https://api.example.com/api/v1 .
docker run -p 3000:3000 -e CONSOLE_COOKIE_SECRET=… ai-interview-frontend
```

Standalone Next output, non-root user, health check on `/`.

## Interviewly workspace

Start at `/` for the new practice dashboard, `/setup` to upload a resume, and `/recordings` for browser-local session videos. In local development, the console login offers **Enter development workspace** without email/password. See [FRONTEND-HANDOFF.md](docs/FRONTEND-HANDOFF.md) for the session-creation contract, recording implementation, and team integration boundaries. Questions remain scripted in mock mode; resume-based Gemini generation requires the real BFF.


