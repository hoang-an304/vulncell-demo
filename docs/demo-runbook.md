# VulnCell — Demo Runbook (5–7 minutes)

> Presentation language: **English**. This document contains the **speaking script** and the **slide deck content**.
> Order: **all slides first, then the live demo** — the audience understands the design before seeing it run.
> Total ≈ 6 minutes at a normal speaking pace (no fixed timeline; follow the order).

## Evaluation criteria coverage

| Requirement | Covered by |
|---|---|
| **Standard**: complete interface + 2–3 key features | Slides S1/S5 + live demo steps 1–4 (auth, submit, triage) |
| **Advanced**: 4–5 main features + advanced functionality (e.g., optimize performance, benchmarking, stress testing) | Slides S2–S4 + demo + the benchmark and stress-test numbers below |

**5 main features**
1. Authentication & role-based access (hacker / admin)
2. Vulnerability report submission (Markdown, code blocks, sanitization, Signal-based quota)
3. Triage workflow — 8-state state machine, severity, bounty, audit timeline (transactional)
4. Reputation & Signal — ledger, profile stats, leaderboard
5. Discovery — HackerOne-style search, filters/facets, pagination, SPAM privacy

**Advanced capabilities**
- 3-layer rate limiting (**stress-tested** with k6)
- Redis caching with **version-based invalidation**
- Database optimization: denormalized reputation, composite + **GIN trigram** indexes
- **Benchmarking**: k6 on 500,000 reports (v0 → v2)
- Security stress tests: brute-force login, API spam
- 2-layer XSS sanitization; hardened deployment (nginx + `trust proxy`)

---

## 0. Pre-flight (15 minutes before)

```bash
# 1) Start the demo stack (migrate + seed run automatically inside the container)
docker compose -p vulncell-demo -f docker-compose.demo.yml up -d --build
curl http://localhost:8080/health

# 2) Reset to clean data (11 users / 100 reports, uploaded avatars kept)
docker exec vulncell-demo-backend-1 node prisma/seed.js --force
docker exec vulncell-demo-redis-1 redis-cli flushdb
```

- Open **two windows**: a normal window (reporter) and an **incognito window pre-logged in as `admin`** (separate cookie jars — never share one window between two accounts).
- Copy the **sample report** (Section 3) to the clipboard.
- Browser zoom 110–125%; close DevTools and notifications.
- Sharing the link with the class? Restart the tunnel and (recommended) raise `RATE_LIMIT_API_MAX` to `"2000"` in `docker-compose.demo.yml`, then `up -d` — viewers behind the tunnel share one IP bucket.
- Optional: keep a second screen with `docs/benchmark-report.md` or Prisma Studio.

---

## 1. Speaking script (English)

### Opening — 20 s
> "Good morning everyone. My name is … and this is **VulnCell** — a bug-bounty platform in the style of HackerOne. Hackers submit vulnerability reports; staff triage them, award bounties, and reputation is tracked on a leaderboard. The presentation has two parts: the design on slides, then a live demo."

### Slide S1 — Introduction — 30 s
> "VulnCell has three roles: guests can browse public reports, hackers submit and comment, and admins triage, close and reward reports. The platform has five main features: authentication with role-based access; report submission with Markdown; a triage workflow with a state machine and bounties; a reputation system with a leaderboard; and search with filters. The stack is **React** on the front end, **Express + Prisma/PostgreSQL** on the back end, **Redis** for caching and rate limiting, and everything ships with **Docker**."

### Slide S2 — Architecture & data flow — 40 s
> "The system has three layers: the React SPA, the Express API, and PostgreSQL plus Redis. A request travels through a proxy, then an express middleware chain — CORS, compression, JSON parsing, cookies and rate limiting — then the route, authentication and validation, the handler, and finally the database or cache.
> The data model has four tables: **User**, **Report**, **ReportEvent** for the audit timeline, and **ReputationLedger**, an append-only points ledger. A report moves through **eight forward-only states**: from PENDING to TRIAGED, then to RESOLVED or another closed state. Only admins can move states, and every action is **one database transaction**."

### Slide S3 — Security — 35 s
> "Security has five pillars. Passwords are **bcrypt-hashed**. Sessions are **JWTs stored in httpOnly cookies** — not in localStorage, so XSS cannot steal them. All input is validated with **zod**. All content is sanitized in **two layers**: the server strips every HTML tag before storing, and the client renders Markdown with a sanitizer on top. And there are **three rate-limit layers**: a global per-IP limit, a login limiter that locks after five failed attempts, and a submission quota based on Signal. Behind nginx we also enable `trust proxy`, so the limiter sees the real client IP."

### Slide S4 — Performance & benchmarking — 35 s
> "On performance: we denormalized the reputation column, added composite and GIN trigram indexes, introduced Redis caching with a version key, gzip and keyset pagination.
> We benchmarked with **k6 on 500,000 reports**. The leaderboard went from **1,263 ms to 47.8 ms p95 without cache — about 26 times faster — and 3.0 ms with cache**. For security, we ran stress tests: brute-force login is blocked after five attempts, and the spam test served **51,698 requests at 2,585 requests per second**, with exactly 300 requests passing the per-IP cap — everything else was rejected without touching the database."

### Slide S5 — Summary & roadmap — 20 s
> "To summarize: five main features — authentication, submission, triage, reputation and discovery — plus advanced engineering: three-layer rate limiting, caching, database optimization, and formal benchmarking and stress testing. Possible next steps are real-time notifications, two-factor authentication and object storage for avatars. Now let me show it running."

### Live demo — ~3 minutes

**Step 1 — Login lock (reporter5).**
> Action: type `reporter5` with a wrong password, click **Log in** five times (the field keeps its value — just click again).
> "This is the login rate limiter: five failed attempts per minute, per IP and username. The sixth attempt is blocked for fifteen minutes — the counter lives in Redis with a TTL, so it expires automatically."

**Step 2 — Blocked submit (reporter10).**
> Action: log in as `reporter10`; show the dimmed Submit button; open `/submit` (red banner); click Submit to trigger the 429.
> "This account has a negative **Signal**, so submissions are disabled. Signal is the sum of reputation points over the last 365 days — deliberately separate from lifetime reputation, so old good scores cannot wash out recent spam."

**Step 3 — Submit a report (reporter1).**
> Action: log in as `reporter1`; open the profile to show **Signal 51**; open Submit; paste the sample report; create it.
> "Signal is positive, so the daily quota allows this report. The server validates the payload with zod and strips HTML — note the malicious image tag in the report. The report is created in **PENDING**."

**Step 4 — Admin triage (incognito window).**
> Action: as `admin`, open the newest report; add a comment; set state **TRIAGED** with severity **HIGH**; then **RESOLVED** with a **$500** bounty.
> "Severity can only be set from TRIAGED, and the bounty only when the report is RESOLVED. Each action is a single transaction: the report, the timeline event, the ledger entry and the denormalized reputation column update together — or not at all."

**Step 5 — Back to reporter1.**
> Action: reload the profile — Signal **51 → 58**; open the case — full timeline.
> "Resolving the report added +7 points to the ledger, and Signal moved from 51 to 58. The timeline shows the full lifecycle: submitted, triaged, resolved, bounty. And the malicious tag is now harmless text — that is the two-layer sanitization."

**Step 6 — (optional, if time allows) Leaderboard.**
> Action: open `/leaderboard`.
> "The leaderboard reads the denormalized column, so it stays fast even with half a million reports."

### Closing — 15 s
> "VulnCell implements a complete, end-to-end bounty workflow — secure by design and validated by tests: **63 of 63 smoke checks pass**, and the k6 benchmark and stress tests quantify the improvements. Thank you — I am happy to take questions."

---

## 2. Slide deck content (copy-paste)

### Slide 1 — Title
- **VulnCell** — A Bug-Bounty Platform (HackerOne-style)
- Course / group / presenter
- "Design + live demo"

### Slide 2 — Introduction
- **What**: hackers report vulnerabilities; staff triage and reward; reputation and leaderboard.
- **Roles**: Guest · Hacker · Admin (STAFF).
- **5 main features**: authentication · submission (Markdown) · triage workflow · reputation & leaderboard · search & discovery.
- **Stack**: React (Vite) · Express + Prisma/PostgreSQL · Redis · Docker.

### Slide 3 — Architecture & data flow
- **3 layers**: React SPA → Express API → PostgreSQL + Redis.
- **Request pipeline**: proxy → CORS → compression → JSON/cookie parsing → rate limit → route → auth/validation → handler → DB/cache.
- **Data model (4 tables)**: `User`, `Report`, `ReportEvent` (timeline), `ReputationLedger` (points).
- **State machine**: 8 forward-only states, admin-only transitions, every action = 1 transaction.

### Slide 4 — Security
- bcrypt password hashing; **JWT in httpOnly cookie**; zod input validation.
- **Sanitization in 2 layers** (server strips HTML; client renders Markdown safely).
- **Rate limiting in 3 layers** (IP / login / Signal) + `trust proxy` for real client IPs.
- Privacy: SPAM reports are visible only to their owner and admins.

### Slide 5 — Performance & benchmarking
- Optimizations: denormalized reputation + composite & **GIN trigram** indexes; Redis cache with version key; gzip; keyset pagination.
- Benchmark (k6, 500,000 reports):

| Metric | v0 | v2 (no cache) | v2 (cache) |
|---|---|---|---|
| Leaderboard p95 | **1,263 ms** | **47.8 ms (~26×)** | **3.0 ms** |
| Search / Case p95 | 9.2 / 5.9 ms | 9.8 / 6.6 ms | 7.9 / 5.6 ms |
| Cold-miss max (leaderboard) | 1,533 ms | 88.9 ms | **41.2 ms** |

- Security stress tests: brute-force → 1,205 × 429 after 5 tries; spam → 51,698 requests @ 2,585 RPS, exactly 300 passed.
- Full data: `docs/benchmark-report.md`.

### Slide 6 — Summary & roadmap
- **5 main features** + advanced engineering (rate limiting, caching, DB optimization, benchmarking, stress testing).
- Test evidence: **63/63** smoke checks; k6 benchmark & security stress tests.
- Next steps: real-time notifications · 2FA · object storage for avatars.

---

## 3. Sample report (clipboard)

```
## Summary
IDOR on the profile endpoint lets any logged-in user read another user's private data by changing the id parameter.

## Steps to reproduce
1. Log in as any user and open /profile?id=101
2. Change the id to 102 and reload the page
3. The profile of user 102 is returned

## Impact
Private user data (email, reports) is exposed to any authenticated user. <img src=x onerror=alert(1)>

## Proof of concept
```http
GET /profile?id=102 HTTP/1.1
Host: api.vulncell.dev
Authorization: Bearer <victim token>
```
```

> The `<img onerror>` tag in the Impact line is intentional: when the case is opened, it appears as plain text — proof of two-layer sanitization. Remove the line if you prefer not to mention sanitization.

---

## 4. Fallback plan

| Risk | Action |
|---|---|
| Tunnel lag / URL changed | Demo on localhost on the projector; the tunnel is only for the audience to follow along |
| Report closed by mistake | Open another PENDING report from the dashboard — reports are independent |
| Forgot the sample text | Use `docs/sample-reports.md` (three paste-ready samples) |
| `reporter5` already locked | Use `reporter4` (same Signal 0) |
| Whole class hits the IP limit (shared tunnel bucket) | `docker exec vulncell-demo-redis-1 redis-cli flushdb` — or raise `RATE_LIMIT_API_MAX` beforehand |
| Admin changes the wrong state | States are forward-only; switch to a different report |

---

## 5. Q&A cheat sheet

- **Why are Signal and Reputation separate?** → Recent penalties must not be washed out by old points; e.g. `reporter8` has +4 reputation but −5 Signal and is still blocked.
- **Why httpOnly cookies?** → JavaScript cannot read the token, so XSS cannot steal the session.
- **Why transactions?** → Report + timeline + ledger + reputation column change together, or not at all.
- **Why is PENDING → RESOLVED rejected?** → The transition table is forward-only; a report must be TRIAGED first.
- **What happens if Redis dies?** → Cache misses fall back to PostgreSQL and rate limiting fails open; the API stays available.
- **Are the performance indexes real?** → Yes: composite and GIN trigram indexes are declared in `schema.prisma` and verified in the database.
- **Can two accounts run in one browser?** → No — cookies are shared across tabs; use two browsers or an incognito window (as in this demo).
