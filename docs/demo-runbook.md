# Runbook demo 5–7 phút — VulnCell

> Mục tiêu: trong 1 lượt 5–7 phút, thể hiện **đủ**: giới thiệu đề tài → kiến trúc & luồng dữ liệu → bảo mật → hiệu năng (slide), rồi **demo chạy thật** phần đã trình bày.
> **Thứ tự đã chốt: chiếu HẾT slide trước, demo SAU** (để người nghe hiểu thiết kế trước khi xem chạy).
> Nguyên tắc: **mỗi màn hình chỉ nói 1 ý**, số liệu lấy từ tài liệu (không bịa).

---

## 0) Chuẩn bị trước (T-15 phút)

```bash
# 1) Bật demo (docker tự chạy migrate + seed)
docker compose -p vulncell-demo -f docker-compose.demo.yml up -d --build
curl http://localhost:8080/health          # {"ok":true}

# 2) Dữ liệu sạch (11 user / 100 report, giữ avatar)
docker exec vulncell-demo-backend-1 node prisma/seed.js --force
docker exec vulncell-demo-redis-1 redis-cli flushdb

# 3) (Tuỳ chọn) nếu mở link cho cả lớp cùng vào thì khởi động lại tunnel và lấy URL mới
D:\cloudflared\cloudflared.exe tunnel --url http://localhost:8080 --no-autoupdate
```

- Mở **2 cửa sổ**: cửa sổ thường (reporter) + **cửa sổ ẩn danh** (đăng nhập sẵn `admin` — 2 cookie độc lập, không phải logout qua lại).
- Copy sẵn đoạn report ở **mục 4** vào clipboard.
- Zoom trình duyệt 110–125%, tắt DevTools + thông báo, chỉ mở 2–3 tab.
- Nếu **chia link tunnel cho cả lớp**: nên nâng `RATE_LIMIT_API_MAX: "2000"` trong `docker-compose.demo.yml` rồi `up -d` (vì qua tunnel mọi người dùng chung 1 "rổ" IP; 300/phút có thể bị chặn oan khi cả lớp cùng bấm).

---

## 1) Slides TRƯỚC (2:30–3:00) — 5 slide (S0 → S4)

> **Chiếu hết slide rồi mới demo** — người nghe hiểu bối cảnh/thiết kế trước khi xem chạy thật.

**S0. Giới thiệu đề tài** (30–40s) — *slide mở đầu*
- **VulnCell** = nền tảng bug bounty kiểu HackerOne: hacker nộp lỗ hổng → admin triage & trả thưởng → điểm uy tín + leaderboard.
- 3 vai trò: **Guest** (xem công khai) · **Hacker** (nộp/comment) · **Admin/Staff** (duyệt, đổi state, cấp bounty).
- Chức năng chính: đăng ký/đăng nhập · submit Markdown · **state machine 8 trạng thái** · bounty · **Reputation/Signal** · leaderboard · profile (avatar/bio) · tìm kiếm kiểu HackerOne.
- Công nghệ: **React (Vite) + Express + Prisma/Postgres + Redis + Docker**, kèm **benchmark k6** và **smoke test 63 checks**.
- Chốt: *"Bài gồm 2 phần: slide trình bày giải pháp kỹ thuật, sau đó là demo chạy thật."*

**S1. Kiến trúc & luồng dữ liệu** (45–60s)
- 3 tầng: **React SPA** (Vite dev / nginx demo) → **Express API** → **Postgres + Redis**.
- 1 request: Browser → nginx proxy `/api` → cors → gzip → json → cookie → **rate limit 3 lớp** → route → `authenticate`/`validate` → handler → Prisma/Redis → JSON; lỗi đổ về error handler.
- 4 bảng: `User`, `Report`, `ReportEvent` (timeline), `ReputationLedger` (sổ điểm) + **8 state** (PENDING → TRIAGED → disclosed).

**S2. Bảo mật API** (30s)
- JWT trong **cookie httpOnly** + sameSite; mật khẩu **bcrypt**; input **zod**.
- **Rate limit 3 lớp**: IP 300/phút · login 5 sai/phút → khoá 15' · submit theo Signal.
- **Sanitize 2 tầng** (server strip HTML + client rehype-sanitize) · **privacy SPAM** (người ngoài nhận 404).
- **`trust proxy = 1`** sau reverse proxy (chống "khoá lây" cả hệ thống).

**S3. Tối ưu & Benchmark** (30s)
- Denormalize `User.reputation` + index; composite index + **GIN pg_trgm**; cache "version" 30s + leaderboard/stats 60s + gzip; keyset pagination.
- **Leaderboard p95: 1263ms → 47.8ms (~26×)**, bật cache còn 3.0ms; smoke test **63/63 PASS**.

**S4. Tổng kết giải pháp & hướng phát triển** (20s) — *slide cuối TRƯỚC demo*
- Đã trình bày: kiến trúc 3 tầng · bảo mật (auth + rate limit 3 lớp + sanitize) · hiệu năng (index/cache) · kiểm chứng (smoke 63/63 + benchmark).
- Hướng phát triển: thông báo realtime, 2FA, lưu avatar lên S3/Cloud, full-text search.
- Câu chuyển sang demo: *"Thiết kế là vậy — giờ em demo để thầy thấy nó chạy thật."*

---

## 2) Live demo SAU slides (3–3,5 phút) — timeline

> Câu chuyển từ S4: *"Thiết kế là vậy — giờ em demo để thầy thấy nó chạy thật."*

| Thời gian | Màn hình | Thao tác | Kết quả thấy được | Nói gì (1 ý) |
|---|---|---|---|---|
| 0:00–0:30 | Login (đang đăng xuất) | `reporter5` + sai mật khẩu, bấm **Log in** 5 lần (giữ nguyên ô, chỉ bấm lại) | Lần 6: **429** `Try again in 15 minute(s)` | "Lớp chặn thứ 2 trên slide: **5 sai/phút theo IP+user** → khoá 15 phút, đếm bằng Redis TTL" |
| 0:30–1:00 | Đăng nhập `reporter10` | Navbar: nút Submit **mờ** → vào `/submit` thấy **băng đỏ** → bấm Submit → **429 signal âm** | Submit bị khoá | "**Signal âm → khoá nộp**; Signal = tổng điểm 365 ngày gần nhất — tách khỏi Reputation để không bị điểm cũ 'rửa'" |
| 1:00–2:00 | Đăng xuất → `reporter1` | Profile xem **Signal trước (51)** → vào Submit → dán report mục 4 → **Create report** | Chuyển sang Case **PENDING**, code block hiện đúng | "Submit qua **zod + sanitize**, quota theo Signal; report mới luôn PENDING" |
| 2:00–2:50 | **Cửa sổ ẩn danh: `admin`** | Mở report mới nhất → comment "Verified on staging" → **TRIAGED + severity HIGH** → sau đó **RESOLVED + bounty 500** | Badge đổi màu, timeline dài thêm | "Mỗi action là **1 transaction**: Report + Event + Ledger + cột reputation cùng xong hoặc cùng huỷ; severity chỉ từ TRIAGED, bounty chỉ khi RESOLVED" |
| 2:50–3:20 | Quay lại cửa sổ reporter1 | Reload Profile → **Signal tăng +7** (51 → 58); mở Case | Timeline: `SUBMITTED → TRIAGED → RESOLVED → BOUNTY $500`; thẻ `<img>` thành chữ | "Timeline + sổ điểm sinh tự động; **sanitize** đã biến HTML độc hại thành chữ vô hại" |
| 3:20–3:30 | nếu còn giờ | Mở `/leaderboard` | reporter1 tăng hạng | "Leaderboard đọc cột denormalized — nhanh, cập nhật cùng transaction" |

**Tổng: slides ~2:40 + demo ~3:20 + chốt ~0:20 ≈ 6 phút** — vừa khung 5–7 phút.
**Bản 5 phút (nếu bị rút):** S0 nói gọn 20s; trong demo bỏ comment + bỏ leaderboard; giữ: khoá login → reporter10 bị chặn → submit → admin RESOLVED → signal tăng.

---

## 3) Report mẫu để dán (copy sẵn clipboard)

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

> Ý cuối có 1 thẻ `<img onerror>` — khi mở Case sẽ thấy nó **biến thành chữ** (sanitize 2 tầng). Nếu không muốn nhắc sanitize thì xoá dòng đó.

---

## 4) Phương án dự phòng

| Rủi ro | Xử lý |
|---|---|
| Tunnel lag/đổi URL | Vẫn demo **localhost trên máy chiếu**; tunnel chỉ để mọi người xem lại sau |
| Lỡ tay đóng report sớm | Mở report PENDING khác trên Dashboard (còn nhiều) — mỗi report độc lập |
| Quên đoạn text | Mở `docs/sample-reports.md` (3 mẫu dán sẵn) |
| Cần `reporter5` mà đã bị khoá | Dùng `reporter4` (cùng signal 0) |
| Cả lớp cùng vào bị 429 tầng IP | `docker exec vulncell-demo-redis-1 redis-cli flushdb` (nói: "đây là lớp chặn IP theo cửa sổ 60s") hoặc đã nâng `RATE_LIMIT_API_MAX` từ trước |
| Admin bấm sai state | Luật chỉ đi tiến → nếu lỡ, dùng report khác |

---

## 5) Câu hỏi dễ bị hỏi trong lúc demo (trả lời 1 dòng)

- **Vì sao Signal tách khỏi Reputation?** → Phạt "gần đây" không bị điểm cũ rửa sạch; ví dụ seed: `reporter8` reputation +4 nhưng signal −5 → vẫn bị khoá.
- **Vì sao cookie httpOnly?** → JS không đọc được token → chống XSS đánh cắp phiên.
- **Vì sao cần transaction?** → Report + Event + Ledger + `User.reputation` cùng thay đổi hoặc cùng huỷ.
- **Vì sao không cho PENDING → RESOLVED?** → Bảng chuyển chỉ-đi-tiến; phải qua TRIAGED.
- **Vì sao không sập khi Redis chết?** → Cache miss đọc thẳng Postgres, rate limit fail-open.
- **Index có thật không?** → Có: composite + GIN pg_trgm đã khôi phục và khai báo trong `schema.prisma` (Chặng 2).
