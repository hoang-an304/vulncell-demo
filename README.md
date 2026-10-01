# VulnCell

Nền tảng công bố lỗ hổng bảo mật kiểu HackerOne thu nhỏ — project môn ICT3.005 Web Application.
Hacker nộp report → Admin triage/đổi trạng thái/cấp bounty; có Reputation, Signal, Leaderboard, Profile.

> Tài liệu: `docs/plan.md` (kế hoạch triển khai) · `docs/decisions.md` (chốt đặc tả) · `docs/api.md` (hợp đồng API) · `docs/benchmark-guide.md` (cách chạy benchmark) · `docs/benchmark-report.md` (báo cáo kết quả đo) · `docs/sample-reports.md` (mẫu report để submit thử) · `docs/deploy-linux.md` (chạy demo trên Linux/Ubuntu Server).

## Quickstart

Yêu cầu: **Node.js ≥ 20** và **Docker Desktop** (chạy Postgres 16 + Redis 7).

```bash
# 1. Bật database + Redis (từ thư mục gốc vulncell/)
docker compose up -d

# 2. Cài dependencies (một lần)
npm install                     # concurrently ở gốc
npm --prefix backend install
npm --prefix frontend install

# 3. Tạo bảng + seed dữ liệu demo (một lần)
cd backend
cp .env.example .env            # Windows PowerShell: copy .env.example .env
npx prisma migrate dev --name init
npm run seed
cd ..

# 4. Chạy cả API + web
npm run dev                     # API :4000 và web :5173
```

Mở **http://localhost:5173** → đăng nhập bằng tài khoản demo (giao diện + thông báo lỗi hiển thị tiếng Anh; tài liệu trong `docs/` giữ tiếng Việt).
Kiểm tra API end-to-end (terminal khác, server đang chạy): `npm run smoke`.

Tài khoản demo — mật khẩu chung `password123`:

| Username | Vai trò | Email |
|---|---|---|
| `admin` | ADMIN | admin@vulncell.dev |
| `reporter1` … `reporter10` | HACKER | reporterN@vulncell.dev |

> Seed tạo sẵn **10 reporter + 100 report** trải ~600 ngày, đủ mọi state/severity/bounty + timeline — đủ để test dashboard, leaderboard (có phân tầng điểm, signal lệch reputation), privacy của SPAM và rate limit (reporter10 điểm âm → bị khóa nộp).

## Tính năng

**Backend**
- Auth: register (luôn HACKER, không nhận role từ client), login bằng email *hoặc* username, JWT trong cookie httpOnly.
- **Rate limit 3 lớp (Redis)**: tổng quát theo IP cho toàn `/api` (300 request/phút → 429), chống brute-force login (sai 5 lần/phút → khóa 15 phút theo IP + username), và nộp report theo Signal.
- Reports: tạo (state `PENDING` + event `SUBMITTED`), danh sách + search `q/severity/disclosed/sort/phân trang`, chi tiết, timeline.
- State machine: `PENDING → TRIAGED | SPAM`; `TRIAGED → 5 state disclosed`; không quay ngược; report đã disclosed bị khóa.
- Action gộp 1 transaction: comment + state + severity + bounty + ledger + timeline + `disclosedAt`.
- Reputation = SUM cả đời, Signal = SUM 365 ngày; giới hạn nộp theo Signal (0 / 1 / không giới hạn mỗi ngày).
- Leaderboard top 50 (sort reputation/signal) cache Redis 60s; Profile kèm privacy (khách chỉ thấy disclosed).
- Bảo mật: bcrypt, validate zod, sanitize Markdown trước khi lưu.

**Frontend**
- Dashboard Hacktivity: 2 tab Disclosed/Undisclosed; **panel Filters trượt từ phải** (chỉ hiện lựa chọn đang có dữ liệu, kèm số đếm); search cú pháp kiểu HackerOne `(severity:HIGH AND weakness:("Reflected XSS") AND bounty:>=100 AND disclosed:true) keyword`; sort; phân trang.
- Case: sidebar thông tin mở/co; timeline 4 loại block; Action Box theo role × state (admin có Change State / Triage Severity / Award Bounty); report đã đóng bị khóa.
- Submit Report: form + preview Markdown, báo lỗi 429 khi hết lượt theo Signal.
- Leaderboard: top 50, đổi sort Reputation ↔ Signal.
- Profile: avatar + bio + **Edit profile** (upload ảnh resize 256×256 ngay trên trình duyệt); stats + Hacktivity (report đang xử lý gắn nhãn Private với chủ nick/admin).
- Markdown render 2 tầng an toàn (react-markdown + rehype-sanitize); code block có **wrap / copy / collapse** + số dòng (kiểu HackerOne).

## Lệnh hay dùng

| Lệnh | Việc |
|---|---|
| `npm run dev` (gốc) | chạy API + web song song |
| `npm run dev:api` / `npm run dev:web` | chạy riêng từng bên |
| `npm run smoke` | smoke test end-to-end backend (~61 phép thử) |
| `npm run demo` / `npm run demo:down` | build + chạy toàn hệ thống trong Docker → **http://localhost:8080** (stack riêng, không đụng port dev) |
| `npm run seed` / `npm run seed:reset` | seed / seed lại dữ liệu demo |
| `npm run seed:bench` / `seed:bench:clean` | seed 500k report cho benchmark / xoá sạch dữ liệu bench |
| `npm run db:up` / `npm run db:down` | bật / tắt Postgres + Redis |
| `npx prisma studio` (trong `backend/`) | mở web xem 4 bảng dữ liệu |

Biến môi trường quan trọng (`backend/.env`): `RATE_LIMIT_DISABLED=true` khi chạy load test · `COOKIE_SECURE=true` khi deploy HTTPS.

## Cài đặt môi trường từ đầu (máy mới)

1. **Node.js LTS** — https://nodejs.org
2. **WSL2 + Docker Desktop** (PowerShell quyền Admin):
   ```powershell
   wsl --install --no-distribution     # sau đó khởi động lại máy
   winget install -e --id Docker.DockerDesktop
   ```
   Mở Docker Desktop lần đầu → chấp nhận điều khoản. Nếu ổ C ít dung lượng: Settings → Resources → Disk image location → đổi sang ổ D.
3. **Git** — https://git-scm.com
4. **Linux / Ubuntu Server**: chỉ cần **Docker** để chạy bản demo — xem `docs/deploy-linux.md` (không cần Node).

## Benchmark & Stress test

Xem hướng dẫn đầy đủ (viết cho người mới): **`docs/benchmark-guide.md`**.

```powershell
npm run seed:bench        # data 500k (một lần)
npm run serve:bench       # API chế độ đo (cache ON, rate limit TẮT)
npm run bench:search      # chạy 1 kịch bản k6 bất kỳ (search / case / leaderboard / bruteforce / spam)
npm run seed:bench:clean  # dọn khi xong
```
Kịch bản k6 nằm ở `bench/k6/`, kết quả lưu vào `bench/results/*.json`.

## Demo đóng gói (Docker)

```powershell
npm run demo        # build + chạy toàn hệ thống trong Docker -> mở http://localhost:8080
npm run demo:down   # tắt bản demo
```

Stack riêng (project name `vulncell-demo`), **chỉ mở cổng 8080**, tự động chạy migration + seed dữ liệu mẫu khi khởi động — không ảnh hưởng stack dev ở `:4000`/`:5173` và không lẫn dữ liệu.

### Chạy demo trên Linux / Ubuntu Server (không cần Node — chỉ Docker)

```bash
# 1) Cài Docker Engine + Compose plugin (Ubuntu/Debian)
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER          # đăng nhập lại để không phải gõ sudo

# 2) Clone repo rồi chạy (thay <repo-url> bằng link GitHub)
git clone <repo-url> vulncell && cd vulncell
docker compose -p vulncell-demo -f docker-compose.demo.yml up -d --build

# 3) Mở http://<IP-máy-chủ>:8080  (nhớ mở cổng 8080 trên firewall/security group)
#    Tắt: docker compose -p vulncell-demo -f docker-compose.demo.yml down
```

→ Hướng dẫn đầy đủ (cài Docker, firewall, HTTPS, cập nhật, xử lý lỗi): **`docs/deploy-linux.md`**.

## Cấu trúc thư mục

```
vulncell/
  package.json           # lệnh gói: npm run dev / smoke / seed / db:up
  docker-compose.yml     # Postgres 16 + Redis 7
  backend/
    prisma/              # schema 4 bảng + seed
    scripts/smoke.js     # smoke test end-to-end
    src/
      middleware/        # auth (JWT), validate (zod), rateLimit (Redis)
      routes/            # auth, reports, users, leaderboard
      services/          # stateMachine, reputation, sanitize
  frontend/
    src/
      api/               # fetch wrapper (cookie)
      auth/              # AuthContext
      components/        # Layout, ReportCard, TimelineBlock, ActionBox, Avatar, CodeBlock, Markdown…
      pages/             # Login, Register, Dashboard, Case, Submit, Leaderboard, Profile
      lib/               # queryParser, stateMachine, format
  docs/                  # plan.md, decisions.md, api.md
```
