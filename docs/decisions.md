# VulnCell — Chốt đặc tả (ghi đè khi tài liệu mâu thuẫn)

> Nguồn ưu tiên: **text chat mới nhất > `database và api.docx` > `proj.docx`**.
> File này chốt mọi điểm còn mơ hồ để code không phải dừng lại hỏi.

## 1. Người dùng & xác thực

| Điểm | Chốt | Ghi chú |
|---|---|---|
| Role | `HACKER`, `ADMIN` | proj.docx có "guest/reporter" → bỏ; khách = chưa đăng nhập |
| Đăng ký | `{username, email, password}` | Luôn gán HACKER. **Không bao giờ nhận `role` từ client** (lỗ hổng leo thang quyền) |
| Username | Chỉ `a-z0-9_`, 3–30 ký tự | Validate cả client + server |
| Mật khẩu | ≥8 ký tự, có hoa + thường + số | bcrypt 10 vòng |
| Đăng nhập | `{email, password}` — chấp nhận thêm `username` thay email | Chốt theo api.docx; hỗ trợ cả hai cho tiện |
| Phiên | JWT trong cookie httpOnly (tên đặt qua `COOKIE_NAME`, mặc định `token`; demo dùng `vc_demo_token` để không ghi đè phiên dev trên cùng host `localhost`), sameSite=lax | `secure=true` khi deploy HTTPS; "remember me" lo sau (không bắt buộc) |
| Avatar & bio | Mỗi user có ảnh đại diện + bio ≤160 ký tự, sửa qua `PATCH /users/me` (profile editor) | Avatar = data URL, client resize 256×256 trước khi gửi — ảnh gốc không rời máy người dùng; server chặn > 400KB base64 |
| Chống brute-force | Sai 5 lần/phút (theo IP + username) → khóa 15 phút → HTTP 429 | Redis đếm; có `RATE_LIMIT_DISABLED=true` cho lúc chạy k6 |

## 2. Bảng dữ liệu

4 bảng: `User`, `Report`, `ReportEvent`, `ReputationLedger` — **đè** thiết kế 3 bảng có cột `reputation_change` trong proj.docx (điểm nằm ở ledger, không nhúng vào event).

## 3. State machine (chỉ ADMIN được đổi)

```
NONE     ·  giữ trong enum, không dùng khi tạo mới
PENDING  →  TRIAGED | SPAM
TRIAGED  →  RESOLVED | DUPLICATE | INFORMATIVE | NOT_APPLICABLE | SPAM
DISCLOSED (RESOLVED, DUPLICATE, INFORMATIVE, NOT_APPLICABLE, SPAM) → không chuyển đi đâu nữa
```

- Tạo mới: state = `PENDING`, sinh event `SUBMITTED` (content = toàn bộ Markdown PoC).
- `severity`: chỉ gán được khi state **kết quả** ∈ {TRIAGED + nhóm disclosed} (tức ≥ TRIAGED).
- `bountyAmount`: chỉ khi state **kết quả** = `RESOLVED`. Cùng action vừa chuyển RESOLVED vừa thưởng được.
- Khi vào nhóm disclosed: set `disclosedAt = now()`.
- **Report đã disclosed = đóng:** mọi action mới (kể cả comment của admin) trả 400 `Report is closed`. Giao diện hiện dòng "This report is closed and no longer accepts new activities." và khóa khu nhập liệu (theo proj.docx).
- Comment một mình (không đổi state) vẫn được khi report đang mở.

## 4. Điểm — Ledger

| State đích | Điểm | Ghi chú |
|---|---|---|
| RESOLVED | +7 | |
| DUPLICATE | +2 | |
| INFORMATIVE | 0 | vẫn ghi 1 dòng ledger điểm 0 cho đủ lịch sử |
| NOT_APPLICABLE | −5 | |
| SPAM | −10 | |

- Ghi ledger **1 lần duy nhất** cho report khi nó vào nhóm disclosed (không thể quay lại nên không sợ cộng đúp).
- `Reputation` = SUM(ledger) toàn thời gian; `Signal` = SUM(ledger) trong 365 ngày gần nhất. Không bảng riêng, có thể cache Redis.

## 5. Rate limit theo Signal (lúc nộp report)

| Signal | Số report/ngày |
|---|---|
| < 0 | 0 (khóa nộp) |
| 0 – dưới 5 | 1 |
| ≥ 5 | Không giới hạn |

Chốt theo `database và api.docx`; proj.docx ghi 1/2/unlimited → bản docx API thắng. Để dạng hằng số trong config, dễ chỉnh.

**Ba lớp rate limit đang chạy** (đều fail-open nếu Redis chết — server vẫn phục vụ):
1. **Tổng quát theo IP** cho toàn `/api`: 300 request/phút (`RATE_LIMIT_API_MAX`, `RATE_LIMIT_API_WINDOW`) → 429 kèm header `Retry-After` (chống spam/DoS tầng HTTP).
2. **Login**: sai 5 lần/phút theo IP + username → khóa 15 phút.
3. **Nộp report theo Signal**: bảng phía trên.

`RATE_LIMIT_DISABLED=true` để tắt cả 3 lớp khi chạy load test (k6/JMeter).

## 6. Endpoint chốt (bổ sung so với `docs/api.md`)

| Endpoint | Ghi chú |
|---|---|
| `GET /reports` | `q, severity, disclosed, sort, page, pageSize` — giữ như móng, thêm `sort` (mặc định `createdAt desc`) |
| `POST /reports` | + kiểm tra rate limit theo Signal → 429 kèm thông báo còn bao nhiêu ngày/lượt |
| `GET /reports/:id` | + trả `reporter.username`, `disclosedAt` |
| `GET /reports/:id/events` | 4 loại block: SUBMITTED / COMMENT / STATE_CHANGE (from→to) / BOUNTY (amount) |
| `POST /reports/:id/actions` | `{comment?, newState?, severity?, bountyAmount?}`; validate state machine + rule ở mục 3; admin-only cho 3 field sau; 1 transaction |
| `GET /leaderboard?sortBy=reputation\|signal&page` | Top 50, cache Redis TTL ~60s, invalidate khi action đổi state |
| `GET /reports/facets` | Số đếm theo Severity/Status/Bounty (chỉ giá trị đang có), cache Redis 30s |
| `GET /reports/weaknesses?search=` | Gợi ý weakness đang tồn tại trong DB kèm số đếm — vì weakness sẽ rất nhiều, không liệt kê cứng |
| `GET /users/:username` | `{username, role, createdAt, reputation, signal, totalBounty, reports[]}` + privacy |
| `GET /health` | `{ok:true}` |

Lỗi chuẩn: `{ "error": "message" }` với 400/401/403/404/409/429/500.

## 7. Privacy (riêng tư)

**SPAM là riêng tư toàn hệ thống**: ẩn khỏi dashboard, trang Case, timeline, facets và profile với khách & hacker khác — **chỉ chủ nick và admin thấy** (report SPAM của chính mình gắn nhãn **Private** trong profile).

| Người xem | Trang Profile / danh sách thấy gì |
|---|---|
| Khách / hacker khác | Chỉ state disclosed **và không phải SPAM** |
| Chính chủ | Toàn bộ; report chưa xử lý hoặc SPAM gắn nhãn Private |
| Admin | Toàn bộ (kể cả SPAM) |

Stats (reputation/signal/total bounty) hiển thị công khai.

## 8. Search & bộ lọc trên Dashboard

- **Panel Filters** trượt từ bên phải: Status (Undisclosed/Disclosed), Severity, Weakness, khoảng Bounty.
  - Chỉ hiện lựa chọn **đang có dữ liệu** (count = 0 thì ẩn) — lấy từ `GET /reports/facets`.
  - Chọn xong, thanh search tự sinh đúng cú pháp truy vấn để tái sử dụng.
- **Cú pháp search** (parse ở frontend → query params; backend nhận `q/severity/state/weakness/bountyMin/bountyMax/disclosed`):
  - `(severity:HIGH AND weakness:("Reflected XSS") AND bounty:>=100 AND bounty:<=600 AND disclosed:true) từ khóa`
  - Alias: `cwe` = `weakness`, `total_awarded_amount` = `bounty`; hỗ trợ `>`, `>=`, `<`, `<=`, `=`
  - Từ khóa tự do còn lại → `q` (tìm trong target + weakness + shortDescription)
- Tab Disclosed/Undisclosed là preset của `disclosed:`; chọn `state:` cụ thể trong panel thì `state` thắng `disclosed`.
- Facets cache Redis 30 giây; chỉ gọi khi mở panel (không gọi theo từng ký tự gõ).

## 9. Markdown

- Editor: textarea + preview (không cần editor nặng).
- **Sanitize 2 tầng:** server dùng `sanitize-html` loại bỏ **toàn bộ** thẻ HTML thô trước khi lưu (phần chữ/markdown giữ nguyên); frontend render bằng `react-markdown` + `remark-gfm` + `rehype-sanitize` và **không bật** `rehype-raw`. DOMPurify không dùng ở server vì cần DOM.
- Nội dung gửi lên vẫn giữ nguyên text trong DB bản `details` (đã sanitize) — không render HTML thô từ người dùng ở bất kỳ đâu.

## 10. Cache (Redis) — đang chạy thật

| Key | Nội dung | TTL | Hành vi |
|---|---|---|---|
| `reports:v2:<version>:<viewerTag>:<filter>` | Danh sách report đã filter | 30s | Version tăng mỗi lần ghi → cache cũ bị bỏ qua ngay; `viewerTag` (`guest` / `u_<id>` / `admin`) tách kết quả theo người xem để report SPAM không lộ qua cache |
| `facets:v2:<viewerTag>:<filter>` | Số đếm filter | 30s | Chỉ gọi khi mở panel Filters |
| `weakopt:v2:<viewerTag>:<filter+search>` | Gợi ý weakness | 30s | Gõ tới đâu tìm tới đó (debounce 250ms) |
| `lb:reputation`, `lb:signal` | Bảng xếp hạng | 60s | Xoá ngay khi action đổi state |
| `login:fail/block:*`, `submit:count:*`, `api:<ip>:<window>` | Rate limit 3 lớp | theo luật | Không phải cache — bộ đếm chống spam/DoS |

**Đã triển khai ở chặng 4 (mốc v2)** — migration `20260930163820_perf_optimizations`:
- pg_trgm + GIN index cho `weakness`/`shortDescription`/`target`; composite index `(state, createdAt)`, `(severity, createdAt)`, `(reporterId, createdAt)`.
- Keyset cursor cho GET /reports (nút "Next →" dùng `createdAt_id`), cache `user:stats:<id>` TTL 60s, gzip compression, connection pool 25.
- Cột `User.reputation` denormalized: cập nhật cùng transaction khi ghi `ReputationLedger` + backfill, leaderboard đọc 1 cột. **Mọi đường ghi ledger đều phải cập nhật cột** (actions của admin lẫn `seed.js`); `seed:reset` xoá sạch report/ledger/event + tài khoản lạ ngoài 11 tài khoản demo (rác smoke/bench) rồi reset cột về 0 trước khi seed lại — nếu không sẽ lệch.

`CACHE_DISABLED=true` trong `.env` để đo baseline không cache khi benchmark (kết hợp `RATE_LIMIT_DISABLED=true`).

## 11. UI chốt

- **Admin**: không hiện nút Submit Report (vào `/submit` bị chuyển về trang chủ); tab mặc định khi vào Dashboard là **Undisclosed**; cạnh tên admin trong trang Case có badge **STAFF** (nền zinc-800, chữ amber — giống nền block event nhưng nổi hơn).
- **Nhãn vai trò thống nhất = STAFF** ở mọi nơi hiển thị (navbar, profile, timeline, Action Box). Backend vẫn chỉ có `role = ADMIN`; STAFF chỉ là nhãn hiển thị, cùng đọc từ một trường `role` nên không có chuyện lệch dữ liệu.
- **Sidebar dọc thu gọn thành icon rail** (~56px, icon lucide): Dashboard / Leaderboard / Profile (+ Submit Report cho hacker). Mục đang mở được tô vòng tròn màu vàng gold (theo logo).
- **Rail ghim sát mép trái màn hình (fixed)**, chạy từ chân top bar xuống đáy, dính liền vào top bar (không nổi giữa trang).
- **Top bar full-width**: logo/tên sát mép trái, tài khoản + hành động sát mép phải ở mọi độ phân giải.
- **Mobile (< md)**: rail và tên tài khoản ở top bar ẩn đi; thay bằng nút menu (hamburger) mở **menu toàn màn hình** gồm: tên tài khoản + các mục của rail + Logout (khách thì Log in/Sign up). Card report giữ nguyên.
- **Header trang report chỉ có 2 tag: `#<report-id>` và state**; target để dạng chữ; severity/bounty và mọi thông tin khác nằm ở thanh thông tin bên cạnh.
- **Card report (Dashboard/Profile)**: hàng đầu — target bên trái, **cụm `[severity · tiền · state]` gom thành MỘT khối liền sát lề phải** (tiền chỉ ghi số, state là chấm màu + chữ, không khung). Report `severity = NONE` thì **ẩn luôn pill severity** trên card (chưa triage = chưa có severity). Màu chấm: Pending xám sáng · Triaged tím · Resolved xanh lá · Duplicate hồng cánh sen · Informative xám · Not applicable hồng · Spam đỏ.
- **Nút nổi "+" đã bỏ** (theo feedback mới nhất — đỡ phiền): nộp report bằng nút **Submit Report** trên navbar hoặc icon trên rail. **Ai bị khóa nộp (Signal âm) thì nút Submit bị làm mờ** ở navbar + rail + menu mobile (kèm tooltip giải thích); trang Submit hiện banner đỏ và khóa nút gửi.
- **Chuyển màn mượt**: mỗi lần đổi route có animation fade nhẹ (`page-enter`, tôn trọng `prefers-reduced-motion`); mọi trạng thái đang tải dùng **spinner xoay màu vàng gold** (kể cả trong nút Log in / Submit / Save / Logout).
- Các banner báo lỗi (sai mật khẩu, 429 thử lại sau 15 phút…) **không viền** — nền đỏ mờ + chữ đỏ, đồng bộ với chip severity/role.
- Bo góc card/khối report dùng `rounded-md` (6px) — bớt tròn hơn `rounded-lg` trước đó.
- **Nội dung căn giữa** với bề rộng tối đa 1024px (`max-w-5xl`), không tràn full chiều ngang màn hình.
- **Timeline trang Case** là một rail dọc nối các block bằng chấm màu:
  - `SUBMITTED` = chấm sáng (zinc-200) · `COMMENT` = xám (zinc-500)
  - `STATE_CHANGE` = **xanh da trời** (sky-400)
  - `BOUNTY` = **xanh lá** (emerald-500)
- Nhãn trạng thái ghi đầy đủ: "Not applicable" (không viết tắt N/A).
- Weakness trong panel là ô **tìm kiếm trên giá trị đang tồn tại** (không liệt kê cứng) vì về sau sẽ có rất nhiều loại.
- Sort danh sách: **"Time: newest first" / "Time: oldest first"** (thanh chọn thời gian).
- **Username hiển thị KHÔNG có `@`** ở mọi nơi (navbar, card, case, profile, timeline) — chỉ gõ `@` khi cần nhắc trên mạng xã hội.
- **Code block trong report**: header `Code · <dung lượng>` + 3 tác vụ **wrap / copy / collapse**, kèm số dòng — học từ HackerOne; nội dung vẫn đi qua sanitize 2 tầng.
- **Profile có avatar + bio + Edit profile** (chủ nick): modal upload ảnh (resize 256×256 ngay trên trình duyệt) + bio ≤160 ký tự; ngày **Joined** ghi theo tháng/năm.
- **Avatar mặc định**: mọi user — kể cả tài khoản mới — hiển thị ảnh `anonymous.png` (trong `frontend/public/`, cạnh logo) khi chưa tự upload; ảnh thật phục vụ qua `GET /users/:username/avatar` (nhẹ, cache 5 phút, không nhét base64 vào payload danh sách). Avatar gắn cạnh username ở **navbar, card report, case, timeline, leaderboard, profile**.
- **Ngôn ngữ giao diện = tiếng Anh**: mọi nhãn UI, thông báo lỗi API (validate/rate limit/state machine) và dữ liệu seed đều tiếng Anh; chỉ các file .md tài liệu giữ tiếng Việt.
- **Phong cách & màu**: font toàn cục **Figtree** (font Google gần nhất với **Effra** của HackerOne — Effra là font thương mại); bảng màu brand **gold** lấy theo logo (`#c9a26b`, khai báo trong `@theme` của Tailwind v4) dùng cho nav active, nút hành động, link; xanh emerald chỉ còn mang nghĩa "tiền/điểm dương/Resolved". **Badge severity & role không viền** — chỉ nền mờ + chữ màu (kiểu chip của HackerOne).
- Danh sách card ở Dashboard/Profile xếp sát nhau (gap ~6px) thay vì thoáng như trước; thời gian trên card hiện **tương đối** ("7 days ago") cho bài mới, quá 30 ngày mới hiện mốc UTC (hover xem đầy đủ) — học từ HackerOne.

## 12. Đã cắt hẳn (deadline)

Verified badge, personal link, filter thời gian Profile, like/upvote, follow, quốc gia, Up&Comers + mũi tên xu hướng Leaderboard, cron 15 phút (dùng TTL + invalidate), upload ảnh/PoC file, S3, message queue, bảng Leaderboard riêng, ZSET. *(Avatar + bio từng nằm trong danh sách cắt — đã làm lại ở bản mới nhất, xem mục 11.)*
