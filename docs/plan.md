# VulnCell — Kế hoạch triển khai

> **Trạng thái 01/10:** ✅ **Tất cả các chặng đã xong** — backend + frontend + 6 mục security, benchmark 3 mốc (v0/v1/v2) + 2 kịch bản security đã đo và có báo cáo (`docs/benchmark-report.md`), đóng gói Docker demo (`npm run demo` → http://localhost:8080). Không còn hạng mục bắt buộc nào; chỉ còn việc trình bày (slide). Dữ liệu bench đã dọn — DB dev/demo hiện ở **11 tài khoản + 100 report**.

> Chốt ngày 29/09/2026. Kèm `docs/decisions.md` — nơi ghi đè các điểm mâu thuẫn giữa `proj.docx` và bản text mới nhất.
> Nguồn ưu tiên khi mâu thuẫn: **text chat mới nhất > `database và api.docx` > `proj.docx`**.

## 0. Trạng thái hiện tại (01/10/2026)

| Hạng mục | Trạng thái |
|---|---|
| Backend: auth, reports, actions (transaction), state machine, rate limit 3 lớp, sanitize, validate zod, profile editor (avatar/bio) | ✅ smoke test **61/61 PASS** |
| Frontend: 6 màn hình (Auth, Dashboard + Filters panel, Submit, Case, Leaderboard, Profile) + UI theo feedback (rail icon, card 2 lề, mobile menu, profile editor avatar/bio, code block wrap/copy/collapse; nút nổi "+" đã bỏ ở bản cuối) | ✅ đã kiểm tra trên trình duyệt |
| Reputation/Signal (ledger + cửa sổ 365 ngày) · Leaderboard cache · Profile privacy | ✅ |
| Seed demo: **10 reporter + 100 report** (mọi state/severity/bounty, PRNG tái lập) + seed bench 500k (`generate_series`) | ✅ |
| Tối ưu (mốc v2): pg_trgm/GIN, composite index, keyset cursor, cache profile, denormalize `User.reputation`, gzip, connection pool | ✅ migration `20260930163820_perf_optimizations` |
| Benchmark 3 mốc + 2 kịch bản security | ✅ `bench/results/` (14 file) — phân tích trong `docs/benchmark-report.md` |
| Đóng gói Docker demo | ✅ `docker-compose.demo.yml` + `npm run demo` |
| Ngôn ngữ web: UI + thông báo lỗi API + dữ liệu seed **tiếng Anh** (file .md giữ tiếng Việt) | ✅ |
| Git repo + GitHub | ✅ dựng lại `git` để đưa bản demo công khai lên GitHub (trước đó bỏ vì làm solo) |

## 1. Nguyên tắc làm solo

1. **Một repo, một nhánh `main`** (không cần Gitflow cho 1 người) — nhưng commit nhỏ, thường xuyên để kịp lùi khi hỏng.
2. **Lát cắt dọc (vertical slice):** backend endpoint → UI dùng ngay endpoint đó → chốt màn hình rồi mới sang màn hình kế. Không viết hết backend rồi mới làm UI.
3. **Ưu tiên sống còn:** chạy end-to-end trước → đủ tính năng → tối ưu/cache → benchmark → đóng gói demo.
4. **Cắt bỏ mọi thứ dành cho "team mới cần":** mock data song song, message queue, upload file/S3, chia branch phức tạp.
5. **Một nguồn sự thật cho API:** `docs/api.md` — sửa gì cập nhật đó.

## 2. Cấu trúc repo đích

```
vulncell/
  package.json               # root: workspace backend+frontend, script chạy 1 lệnh
  docker-compose.yml         # DEV: postgres:16 + redis:7
  docker-compose.demo.yml    # DEMO: + backend + frontend (nginx) — bật khi cần demo "đóng gói"
  .gitignore
  README.md                  # quickstart + lệnh
  docs/
    plan.md                  # file này
    decisions.md             # chốt đặc tả
    api.md                   # hợp đồng API (cập nhật dần)
  backend/
    prisma/
      schema.prisma
      seed.js                # seed nhỏ cho dev UI (vài chục report)
      seed-bench.js          # seed 500k cho benchmark (SQL generate_series)
    src/
      app.js, server.js, prisma.js, redis.js
      middleware/  auth.js, rateLimit.js, validate.js
      routes/      auth.js, reports.js, users.js, leaderboard.js
      services/    stateMachine.js, reputation.js, sanitize.js
  frontend/                  # Vite + React
    src/
      api/client.js          # fetch wrapper (credentials: include)
      lib/queryParser.js     # parse "disclosed:true severity:high keyword"
      components/            # ReportCard, TimelineBlock, ActionBox, Markdown...
      pages/                 # Login, Register, Dashboard, Submit, Case, Leaderboard, Profile
  bench/
    k6/                      # dashboard-search.js, case-detail.js, leaderboard.js, login-bruteforce.js
    results/                 # JSON kết quả + bảng so sánh trước/sau
```

## 3. Các lệnh chính (đã hoạt động)

```bash
npm run db:up          # bật Postgres 16 + Redis 7 (dev)
npm run dev            # backend :4000 + frontend :5173 chạy song song (concurrently)
npm run seed           # seed demo nhỏ (3 tài khoản + 17 report đủ state)
npm run seed:bench     # nạp 500.000 report cho benchmark
npm run smoke          # 61 phép thử end-to-end backend (server thường)
npm run serve:bench    # API chế độ đo: cache ON, rate limit TẮT (cho k6)
npm run serve:bench:nocache  # API chế độ đo DB thuần (cache OFF)
npm run bench:search / bench:leaderboard / bench:case / bench:bruteforce / bench:spam
npm run bench:results  # in bảng tổng hợp mọi file kết quả
npm run demo           # đóng gói: build + chạy toàn hệ thống trong Docker -> http://localhost:8080
npm run demo:down      # tắt bản demo
npm run kill:api       # giải phóng port 4000 khi đổi chế độ server
```

## 4. Lộ trình 6 chặng

### Chặng 0 — Dọn & chốt (0.5 ngày) ✅
- [x] `git init` + `.gitignore` + commit đầu tiên — lúc đầu bỏ vì làm solo, **dựng lại khi đưa demo lên GitHub**.
- [x] Fix lỗ hổng register nhận `role` ADMIN; validate username `^[a-z0-9_]+$` + độ mạnh mật khẩu.
- [x] Root `package.json` + npm script; khởi tạo `frontend/` bằng Vite (React).
- [x] Chốt `docs/decisions.md`.
- [x] Cài Docker Desktop (phương án A).

### Chặng 1 — Backend đủ logic (2–3 ngày) ✅
- [x] `services/stateMachine.js`: bảng chuyển state hợp lệ + rule severity/bounty.
- [x] `POST /reports/:id/actions`: validate state machine, khóa khi report đã disclosed, set `disclosedAt`, ghi ledger 1 lần/report, sinh đủ 4 loại block timeline.
- [x] `services/reputation.js`: `reputation` = SUM(ledger), `signal` = SUM 365 ngày (có index sẵn).
- [x] `redis.js` + rate limit: login sai 5 lần/phút → khóa 15 phút (429); submit theo Signal; cờ `RATE_LIMIT_DISABLED` cho k6.
- [x] `GET /leaderboard?sortBy=reputation|signal` — cache Redis TTL ~60s, invalidate khi đổi state.
- [x] `GET /users/:username` — kèm privacy 3 trường hợp.
- [x] `services/sanitize.js` (sanitize-html) + validate body bằng zod.
- [x] Cập nhật `docs/api.md`; test end-to-end bằng `scripts/smoke.js` (61 phép thử).

### Chặng 2 — Seed & dữ liệu (1 ngày)
- [x] `seed.js`: môi trường demo **10 reporter + ~100 report** đủ state/severity/bounty/timeline (PRNG cố định — tái lập được; `seed:reset` để tạo lại từ đầu).
- [x] `seed-bench.js` (SQL `generate_series` + batch 50k + `ANALYZE`): sẵn sàng — `npm run seed:bench` (2.000 user + 500.000 report), xoá bằng `npm run seed:bench:clean`, tuỳ chỉnh `--users= --reports=`.
- [x] Chạy seed 500k thật + kiểm tra dung lượng. *(đã chạy: 500.017 report, ~1.5 GB)*

### Chặng 3 — Frontend (4–6 ngày) ✅
Thứ tự màn hình: **Auth → Dashboard → Case → Submit → Leaderboard → Profile**.
- [x] Stack: Vite + React + React Router + TanStack Query + Tailwind CSS; Markdown bằng `react-markdown` + `remark-gfm` + `rehype-sanitize`.
- [x] `AuthContext` gọi `/auth/me` khi load, mọi fetch kèm `credentials: 'include'`.
- [x] Dashboard: search bar parse cú pháp (`disclosed:true`, `severity:high`, còn lại là keyword), 2 tab Disclosed/Undisclosed, **panel Filters trượt phải** (theo feedback: chỉ hiện filter có dữ liệu + icon severity), sort, phân trang (**keyset cursor** cho nút "Next →"), card 2 lề + chấm màu state.
- [x] Case: Tab 1 sidebar thông tin; Tab 2 markdown + timeline **rail nối + chấm màu** (state = xanh da trời, bounty = xanh lá) + Action Box theo role × state; report closed → khóa khu nhập liệu + dòng "This report is closed...".
- [x] Submit: form + editor markdown có preview; nộp xong chuyển thẳng vào Case vừa tạo.
- [x] Leaderboard: bảng sort reputation/signal, top 50.
- [x] Profile: thông tin + stats + danh sách report (report đang xử lý khi xem chính chủ thì gắn nhãn Private).
- [x] UI theo feedback: rail icon dọc, logo thật, nút nổi "+" (sau đó bỏ theo feedback cuối), menu mobile gộp, badge STAFF, sort theo thời gian.

### Chặng 4 — Tối ưu ✅ (mốc v2 — làm gộp 1 lần, chốt 30/09)
- [x] **pg_trgm** + GIN index cho `weakness`/`shortDescription`/`target` (migration `20260930163820_perf_optimizations`).
- [x] Composite index `(state, createdAt)`, `(severity, createdAt)`, `(reporterId, createdAt)`.
- [x] **Keyset pagination** (`createdAt`,`id`) cho nút "Next →" của GET /reports (backend nhận `cursor`).
- [x] **Cache Reputation/Signal cho Profile** (`user:stats:<id>`, TTL 60s, invalidate khi action).
- [x] **Denormalize `User.reputation`** (cập nhật cùng transaction khi ghi ledger + backfill) — thay Redis ZSET (đã chốt bỏ).
- [x] **Gzip compression** (`compression` middleware) — đã xác nhận `Content-Encoding: gzip`.
- [x] **Connection pool**: `?connection_limit=25&pool_timeout=20` trong DATABASE_URL.
- [x] Rà lại N+1 (giữ sạch).

### Chặng 5 — Benchmark 3 mốc (chốt 30/09)
- [x] **v0 = baseline nocache** (3 kịch bản) → `bench/results/v0-*.json`
- [x] **v1 = cache ON** — trước tối ưu (3 kịch bản) → `bench/results/v1-*.json`
- [x] **v2 = sau tối ưu** — chạy lại 3 kịch bản ở CẢ 2 chế độ → `v2-*-nocache.json` + `v2-*-cache.json`
- [x] Security: bruteforce + spam (server chế độ thường, rate limit bật) — counters: 5×401→1.205×429 và 300×200→51.398×429
- [x] Tổng hợp: bảng + phân tích chi tiết trong **`docs/benchmark-report.md`** (chart là việc trình bày slide)

### Chặng 6 — Đóng gói demo (0.5 ngày) ✅
- [x] `docker-compose.demo.yml`: backend (Dockerfile node) + frontend build → nginx (proxy `/api`). Chỉ mở cổng 8080, volume riêng cho demo.
- [x] README + `npm run demo` chạy 1 lệnh (tự migrate + seed trong container).
- [ ] (Điểm cộng, không bắt buộc) GitHub Actions lint/build — **bỏ, không cần cho mục tiêu điểm**.

## 5. Đối chiếu tiêu chí Advanced (đã xong 100%)
| Tiêu chí | Đáp ứng | Bằng chứng |
|---|---|---|
| 4–5+ tính năng chính | Auth + phân quyền, Submit + Markdown, Case/Timeline/State machine, Reputation/Signal + rate limit 3 lớp, Leaderboard, Profile + avatar/bio, Filters nâng cao (search cú pháp HackerOne) | smoke **61/61** · UI đã test trên trình duyệt |
| Optimize performance | Redis cache (leaderboard/list/facets/profile), pg_trgm + GIN, composite index, keyset cursor, denormalize `User.reputation`, gzip, connection pool, tránh N+1 | migration `20260930163820_perf_optimizations` |
| Benchmarking | k6: **3 mốc × 3 kịch bản × 2 chế độ** + 2 kịch bản security; bảng + phân tích đầy đủ | `docs/benchmark-report.md` — leaderboard **1263 → 47,8 ms** (DB thuần) |
| Stress testing | **500k report** thật, ramp-up 10→50 VU, chứng minh chặn brute-force/spam bằng counters 429 | `bench/results/security-*.json` |

## 6. Đã cắt / để sau (nếu dư thời gian mới thêm)
Verified badge, personal link, filter thời gian ở Profile; like/upvote; follow; Up&Comers + mũi tên xu hướng ở Leaderboard; cron job 15 phút (thay bằng cache TTL + invalidate); upload file/S3; message queue. *(Avatar + bio đã làm ở bản mới nhất; keyset pagination đã làm ở chặng 4.)*

## 7. Môi trường máy (đã hoàn tất)

- Node v24 ✅ · Git 2.49 ✅ · **Docker Desktop 4.93 (WSL2)** ✅ · **k6 v2.2** ✅.
- Docker data + volume Postgres/Redis nằm ở ổ D (C còn ~9 GB, D còn ~190 GB).
- **Hai stack độc lập, không đụng port nhau:** dev = `docker compose up -d` (Postgres 5432 + Redis 6379, compose gốc) · demo = `npm run demo` (cổng **8080** duy nhất, volume riêng `vulncell_demo_db_data`).
