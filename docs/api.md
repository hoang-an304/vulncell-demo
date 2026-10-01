# VulnCell API Contract v2

Base URL: `http://localhost:4000/api`
Auth: JWT trong cookie `token` (httpOnly, sameSite=lax). Frontend gọi fetch với `credentials: "include"` (hoặc dùng Vite proxy để cùng origin).
Lỗi luôn có dạng `{ "error": "message" }` với status 400 / 401 / 403 / 404 / 409 / 429 / 500. Thông báo lỗi trả về bằng **tiếng Anh** (UI hiển thị nguyên văn).

## Enum

- **role**: `HACKER, ADMIN`
- **state**: `NONE, PENDING, TRIAGED` (undisclosed) → `RESOLVED, DUPLICATE, INFORMATIVE, NOT_APPLICABLE, SPAM` (disclosed)
- **severity**: `NONE, LOW, MEDIUM, HIGH, CRITICAL`
- **event type**: `SUBMITTED, COMMENT, STATE_CHANGE, BOUNTY`

Quy tắc:
- Chuyển state hợp lệ: `PENDING → TRIAGED | SPAM`; `TRIAGED → {5 state disclosed}`. Đã disclosed thì đóng, không đổi gì nữa (kể cả comment).
- `severity` chỉ gán khi state ≥ `TRIAGED`. `bountyAmount` chỉ khi kết quả là `RESOLVED`.
- Vào nhóm disclosed thì set `disclosedAt` và ghi sổ điểm: RESOLVED +7, DUPLICATE +2, INFORMATIVE 0, NOT_APPLICABLE −5, SPAM −10.

## Auth

### POST /auth/register
```json
{ "username": "reporter3", "email": "r3@x.com", "password": "Passw0rd1" }
```
- 201 `{ "id": "uuid", "username": "reporter3", "role": "HACKER" }`
- 400 nếu username sai định dạng (`a-z0-9_`, 3–30) / email sai / mật khẩu yếu (<8, thiếu hoa/thường/số)
- 409 nếu trùng username hoặc email
- **Luôn tạo HACKER.** Field lạ trong body (ví dụ `"role": "ADMIN"`) bị bỏ qua.

### POST /auth/login
```json
{ "email": "reporter3@x.com", "password": "Passw0rd1" }
```
Chấp nhận `email` **hoặc** `username` (hoặc `identifier`) trong body.
- 200 `{ "id", "username", "role" }` + set cookie `token`
- 401 sai thông tin · 429 khi sai 5 lần/phút (khóa 15 phút theo IP + username)

### POST /auth/logout → 200 `{ "ok": true }`

### GET /auth/me (cần cookie) → 200 `{ "id", "username", "role", "avatar", "signal" }` (`avatar` là data URL hoặc null; `signal` để UI làm mờ nút Submit khi Signal âm), 401 nếu chưa đăng nhập

## Reports

### GET /reports
Query:
- `q` — từ khóa tự do (tìm trong target / weakness / shortDescription)
- `severity` — `NONE|LOW|MEDIUM|HIGH|CRITICAL`
- `state` — một trong 8 giá trị enum (khớp chính xác); nếu có `state` thì `disclosed` bị bỏ qua
- `weakness` — tên weakness chính xác (không phân biệt hoa thường), ví dụ `Reflected XSS`
- `disclosed=true|false` — nhóm trạng thái
- `bountyMin`, `bountyMax` — khoảng tiền thưởng (số nguyên ≥ 0)
- `sort=newest|oldest`, `page` (mặc định 1), `pageSize` (mặc định 20, tối đa 100)
- `cursor=<createdAt ISO>_<id>` — keyset pagination cho `sort=newest` (UI tự dùng cho nút "Next →"; khi có `cursor` thì bỏ qua `page`/bỏ qua OFFSET)

Không cần đăng nhập, nhưng **nên gửi kèm cookie**: kết quả khác nhau theo người xem — report **SPAM chỉ hiện với chủ nick và admin** (khách/hacker khác bị lọc khỏi cả danh sách lẫn facets).
400 nếu tham số enum/số sai.
Kết quả được **cache Redis 30 giây** theo tổ hợp filter + "version" dữ liệu: mọi thao tác ghi (tạo report / action) tăng version → cache cũ bị bỏ qua ngay, không phải chờ hết TTL.

**Cú pháp search ở frontend** (được parse thành các tham số trên):
```
(severity:HIGH AND weakness:("Reflected XSS") AND bounty:>=100 AND bounty:<=600 AND disclosed:true) xss login
```
- alias chấp nhận: `cwe` = `weakness`, `total_awarded_amount` = `bounty`
- hỗ trợ toán tử `>`, `>=`, `<`, `<=`, `=` cho bounty
- phần còn lại (ngoài filter) là từ khóa tự do `q`

### GET /reports/facets — số đếm theo từng filter
Cùng tham số lọc như `GET /reports` (không có sort/page). Không cần đăng nhập.
Chỉ trả về giá trị **đang có dữ liệu** (count = 0 không xuất hiện) → UI ẩn lựa chọn vô nghĩa.
Cache Redis 30 giây theo tổ hợp filter. Số đếm "live": mỗi chiều được đếm khi bỏ qua chính filter của chiều đó (giống HackerOne).
```json
{
  "total": 8,
  "severities": [{ "value": "CRITICAL", "count": 1 }],
  "states": [{ "value": "PENDING", "count": 1 }],
  "bounty": { "min": 150, "max": 1250 }
}
```

### GET /reports/weaknesses — gợi ý weakness đang tồn tại
Query: `search` (tìm theo tên weakness, không phân biệt hoa thường) + các filter như trên.
Trả tối đa 20 giá trị weakness **có trong dữ liệu**, kèm số đếm, sắp theo count giảm dần. Cache Redis 30 giây.
```json
[{ "value": "Reflected XSS", "count": 2 }]
```
```json
[
  {
    "id": "uuid",
    "target": "shop.vulncell.dev/checkout",
    "weakness": "Reflected XSS",
    "cveId": null,
    "shortDescription": "Reflected XSS via the coupon parameter...",
    "severity": "HIGH",
    "state": "RESOLVED",
    "bounty": 500,
    "createdAt": "2026-08-20T10:00:00Z",
    "disclosedAt": "2026-08-30T09:00:00Z",
    "reporter": { "username": "reporter1" }
  }
]
```

### POST /reports (cần đăng nhập)
```json
{
  "target": "example.com/login",
  "weakness": "Reflected XSS",
  "cveId": null,
  "shortDescription": "Reflected XSS on search param",
  "details": "## Steps to reproduce\n1. ..."
}
```
- 201 report vừa tạo (state `PENDING`, đã sinh event `SUBMITTED`)
- 400 thiếu field / field quá ngắn
- **429 nếu vượt giới hạn theo Signal:** signal < 0 → 0 report/ngày; 0–4 → 1/ngày; ≥ 5 → không giới hạn (reset 00:00 UTC)
- `details` bị strip toàn bộ HTML thô trước khi lưu (chống stored XSS)

### GET /reports/:id (công khai)
Full report + `reporter: { username, role }`, `disclosedAt`. 404 nếu không có **hoặc report là SPAM mà người xem không phải chủ nick/admin**.
(Trang Case dùng `role` để gắn badge **STAFF** cạnh tên admin.)

### GET /reports/:id/events (công khai)
Timeline sắp theo thời gian tăng dần. Cùng quy tắc riêng tư: report SPAM → 404 với người ngoài.
```json
[
  {
    "id": "uuid",
    "type": "STATE_CHANGE",
    "content": "Confirmed by triage.",
    "fromState": "PENDING",
    "toState": "TRIAGED",
    "bountyAmount": null,
    "createdAt": "2026-09-21T08:00:00Z",
    "actor": { "username": "admin", "role": "ADMIN" }
  }
]
```

### POST /reports/:id/actions (cần đăng nhập)
```json
{ "comment": "Fixed on staging", "newState": "RESOLVED", "severity": "HIGH", "bountyAmount": 500 }
```
- HACKER chỉ được gửi `comment`; gửi field admin-only → 403
- 400 khi: state machine không hợp lệ, severity/bounty sai thời điểm, report đã disclosed (closed)
- 200 report đã cập nhật; mọi thay đổi nằm trong 1 transaction (comment + đổi state + severity + bounty + ledger + timeline)
- Nếu có `newState`: nội dung `comment` được gộp vào block `STATE_CHANGE`, **không sinh block `COMMENT` trùng nội dung**. Comment thuần mới sinh block `COMMENT`.
- Cache Redis của danh sách report/leaderboard được làm mới ngay sau action (version + xoá key).

## Leaderboard

### GET /leaderboard?sortBy=reputation|signal
Không cần đăng nhập. Top 50, cache Redis 60 giây (tự xóa khi có action đổi state).
```json
[
  { "rank": 1, "userId": "uuid", "username": "reporter1", "reputation": 322, "signal": 15, "totalBounty": 650 }
]
```

## Profile

### GET /users/:username
Không cần đăng nhập (gửi kèm cookie nếu có để xem đầy đủ).
```json
{
  "id": "uuid",
  "username": "reporter1",
  "role": "HACKER",
  "createdAt": "2026-01-01T00:00:00Z",
  "avatar": "data:image/jpeg;base64,...",
  "bio": "Web & API security.",
  "reputation": 322,
  "signal": 15,
  "totalBounty": 650,
  "isOwner": false,
  "reports": [ { "...": "ReportSummary + isPrivate: true|false" } ]
}
```
Privacy: khách/hacker khác chỉ thấy report disclosed **và không phải SPAM**; chính chủ và admin thấy hết — report chưa xử lý hoặc SPAM có `isPrivate: true`.

### PATCH /users/me (cần đăng nhập) — profile editor
```json
{ "avatar": "data:image/jpeg;base64,...", "bio": "Web & API security." }
```
- Chỉ sửa được profile của **chính mình**. Gửi `null` (hoặc chuỗi rỗng) để xoá avatar/bio.
- `bio` tối đa **160 ký tự**; `avatar` phải là data URL `data:image/(png|jpeg|webp);base64,...` ≤ ~400KB (frontend đã resize 256×256 trước khi gửi).
- 400 nếu sai định dạng/quá giới hạn · 401 nếu chưa đăng nhập.
- 200 `{ "id", "username", "role", "avatar", "bio" }`.

### GET /users/:username/avatar (công khai)
- 200 `image/png|jpeg|webp` + `Cache-Control: public, max-age=300` nếu user đã upload avatar.
- 200 `image/png` (ảnh anonymous mặc định `backend/public/anonymous.png`, `Cache-Control: max-age=60`) nếu chưa có ảnh — **không trả 404**, console trình duyệt sạch.
- Dùng endpoint này ở mọi nơi cần avatar (navbar, card report, timeline, leaderboard…) để payload JSON không phải mang theo ảnh base64.

## Hệ thống

### GET /health → `{ "ok": true }` (không có prefix /api)

## Biến môi trường ảnh hưởng hành vi

| Biến | Ý nghĩa |
|---|---|
| `RATE_LIMIT_DISABLED=true` | Tắt cả 3 lớp rate limit — dùng khi chạy k6/JMeter |
| `RATE_LIMIT_API_MAX` / `RATE_LIMIT_API_WINDOW` | Giới hạn tổng quát theo IP cho `/api`, mặc định 300 request / 60 giây |
| `COOKIE_SECURE=true` | Đặt khi deploy có HTTPS |
| `COOKIE_NAME` | Tên cookie phiên (mặc định `token`); demo đặt `vc_demo_token` để dev/demo không ghi đè cookie của nhau trên cùng host |
| `SIGNAL_WINDOW_DAYS` | Cửa sổ Signal, mặc định 365 |
| `SIGNAL_GOOD_THRESHOLD` | Ngưỡng Signal "tốt", mặc định 5 |
