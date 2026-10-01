# VulnCell — Tổng quan dự án & Tính năng

> Tài liệu này tổng hợp toàn bộ dự án: hệ thống làm gì, có những tính năng nào, các kỹ thuật "Advanced" giúp ích gì — viết để **người không đi sâu kỹ thuật vẫn nắm được**.
> Số liệu đo và phân tích chi tiết: `docs/benchmark-report.md` · Cách chạy: `README.md` · Quyết định đặc tả: `docs/decisions.md`.

---

## 1. VulnCell là gì?

VulnCell là một **nền tảng công bố lỗ hổng bảo mật kiểu HackerOne/Bugcrowd thu nhỏ**:

- **Hacker** tìm lỗ hổng → nộp báo cáo (kèm mô tả kỹ thuật, cách tái hiện viết bằng Markdown).
- **Admin** đọc, xác nhận (triage), đổi trạng thái xử lý và cấp tiền thưởng (bounty).
- Hệ thống tự tính **điểm uy tín (Reputation)** và **phong độ (Signal)** cho hacker, có **bảng xếp hạng** tạo động lực đóng góp.
- Trạng thái báo cáo chạy theo **state machine** chặt chẽ: chỉ tiến, không lùi; khi đã xử lý xong thì khóa lại.

Đây là project môn **ICT3.005 Web Application**, làm solo, nhắm mức điểm **Advanced (17.5+)**.

---

## 2. Kiến trúc & Công nghệ

```
Trình duyệt (React SPA)
      │  fetch /api …  (phiên đăng nhập = cookie JWT httpOnly)
      ▼
   Backend — Node.js / Express / Prisma
      │            │
      │            └──► Redis  (bộ nhớ đệm cache + bộ đếm chống spam)
      ▼
 PostgreSQL 16  (4 bảng: User · Report · ReportEvent · ReputationLedger)
```

| Lớp | Công nghệ | Vai trò |
|---|---|---|
| Giao diện | Vite + React + Tailwind CSS + TanStack Query | SPA 6 màn hình, quản lý trạng thái/tải dữ liệu |
| Nghiệp vụ | Node.js + Express + Prisma (ORM) | API REST, state machine, tính điểm, phân quyền |
| Dữ liệu | PostgreSQL 16 | Lưu 4 bảng chính, dữ liệu bền vững |
| Bộ đệm | Redis 7 | Cache trả lời nhanh + đếm rate limit |
| Đóng gói | Docker / Docker Compose | Dev + demo chạy 1 lệnh, môi trường đồng nhất |
| Kiểm thử | k6 + smoke test | Đo hiệu năng, test API end-to-end |

---

## 3. Người dùng & Phân quyền

| Vai trò | Là ai | Quyền chính |
|---|---|---|
| **HACKER** | Người nộp báo cáo | Nộp report, bình luận, xem dashboard/leaderboard/profile |
| **ADMIN** (nhãn hiển thị: **STAFF**) | Người xử lý | Tất cả trên + đổi state, gán severity, cấp bounty, không nộp report |
| Khách | Chưa đăng nhập | Xem dashboard, case đã công bố, leaderboard, profile công khai |

Quyền được kiểm tra **ở backend** (middleware), giao diện chỉ ẩn/hiện nút cho đẹp — không phải nơi bảo vệ.

---

## 4. Tính năng chi tiết (theo màn hình)

### 4.1 Đăng ký / Đăng nhập
- Đăng ký: username (chỉ `a-z0-9_`), email, mật khẩu — kiểm tra ngay trên trình duyệt và lần nữa ở server. **Luôn tạo tài khoản HACKER**, không cho tự chọn quyền.
- Đăng nhập bằng email hoặc username; phiên lưu trong **cookie httpOnly** (JavaScript độc hại không đọc được token).
- Sai 5 lần/phút → khóa 15 phút (chống dò mật khẩu).

### 4.2 Dashboard Hacktivity (trang chủ)
- Danh sách case dạng thẻ: target · severity (có màu) · tiền thưởng · state (chấm màu + tên).
- **2 tab Disclosed / Undisclosed** — mặc định admin xem Undisclosed, người khác xem Disclosed.
- **Thanh tìm kiếm cú pháp kiểu HackerOne**: gõ `severity:HIGH weakness:("Reflected XSS") bounty:>=100 disclosed:true xss login` — panel **Filters** trượt từ phải (chỉ hiện lựa chọn đang có dữ liệu, kèm số đếm và icon mức độ nghiêm trọng) tự sinh cú pháp này.
- Sắp xếp theo thời gian, phân trang (trang sâu dùng keyset — không chậm dần).
- Nút nổi **"+"** đã bỏ theo feedback cuối; nộp report bằng nút **Submit Report** ở navbar (nút bị **làm mờ** khi Signal âm — tài khoản đang bị tạm khóa nộp).

### 4.3 Submit Report
- Form: target, weakness (loại lỗ hổng), CVE (tuỳ chọn), mô tả ngắn, Proof-of-Concept Markdown **có xem trước**.
- Nộp xong → report ở trạng thái `PENDING`, chuyển thẳng vào trang Case.
- **Giới hạn theo Signal**: điểm phong độ thấp thì bị giới hạn số report/ngày (chống spam).

### 4.4 Trang Case (chi tiết báo cáo) — trái tim hệ thống
- **Cột phải**: hộp thông tin (ngày nộp UTC, người nộp, ID, severity, state, bounty, weakness, CVE...) — mở/co được.
- **Cột chính**: tiêu đề + mô tả + **Timeline** dạng "đường ray" nối các block bằng chấm màu:
  - `SUBMITTED` (nộp bài) · `COMMENT` (bình luận) · `STATE_CHANGE` (**chấm xanh da trời**) · `BOUNTY` (**chấm xanh lá**).
- **Action Box** đổi theo vai trò × trạng thái:
  - Hacker: chỉ ô bình luận.
  - Admin: bình luận + **Change State** (chỉ hiện nước đi hợp lệ) + **Triage Severity** + **Award Bounty** — tất cả gói trong **1 transaction**, kèm 1 bình luận nếu muốn.
- **Code block trong Proof of Concept**: header `Code · <dung lượng>`, nút **wrap / copy / collapse** và số dòng (kiểu HackerOne).
- Report đã xử lý xong → **khóa**: "This report is closed and no longer accepts new activities."

### 4.5 Leaderboard
- Top 50 theo **Reputation** (điểm cả đời) hoặc **Signal** (điểm 365 ngày gần nhất), kèm tổng tiền thưởng.

### 4.6 Profile
- Thông tin + **Reputation / Signal / Tổng bounty** + danh sách report.
- **Avatar & bio**: mỗi người có ảnh đại diện + mô tả ngắn; chủ nick bấm **Edit profile** để đổi (ảnh resize 256×256 ngay trên trình duyệt, bio ≤160 ký tự). Hiển thị ở Profile + navbar + card report + timeline + leaderboard; **tài khoản mới mặc định dùng ảnh anonymous** trong `frontend/public/`.
- **Quyền riêng tư**: khách chỉ thấy report đã công bố; chính chủ và admin thấy hết (report đang xử lý gắn nhãn Private).

### 4.7 Trải nghiệm di động & giao diện theo phản hồi
- Rail icon dọc bên trái, logo thật, badge **STAFF** cạnh tên admin, menu toàn màn hình trên điện thoại, bo góc/căn lề theo bản thiết kế đã chốt.
- **Ngôn ngữ**: toàn bộ nhãn giao diện, thông báo lỗi và dữ liệu mẫu hiển thị **tiếng Anh**; tài liệu .md trong `docs/` giữ tiếng Việt.
- **Phong cách**: font **Figtree** (gần với Effra của HackerOne), màu nhấn **vàng gold** theo logo, badge severity/role kiểu chip không viền (nền mờ + chữ màu), card danh sách sát nhau; thời gian bài mới hiện tương đối ("7 days ago") — các nét học từ UI/UX của HackerOne.

---

## 5. Reputation & Signal — "điểm uy tín" hoạt động thế nào?

Mỗi lần admin chốt trạng thái xử lý, hệ thống ghi **một dòng vào sổ cái** (ledger) cho người nộp:

| Trạng thái kết quả | Điểm |
|---|---|
| ✅ Resolved (đã vá) | **+7** |
| 🔁 Duplicate (trùng) | +2 |
| ℹ️ Informative (hữu ích nhưng không phải lỗi) | 0 |
| 🚫 Not applicable (không liên quan) | **−5** |
| 🗑️ Spam (rác) | **−10** |

- **Reputation** = cộng toàn bộ sổ cái từ lúc lập nick (uy tín dài hạn).
- **Signal** = chỉ cộng các dòng trong **365 ngày gần nhất** (phong độ — bỏ chơi 1 năm là tụt).
- Signal còn dùng làm **hàng rào chống spam**: Signal âm → không được nộp; 0–4 → 1 report/ngày; ≥ 5 → không giới hạn.

---

## 6. Bảo mật (6 lớp đã triển khai)

| Lớp | Cách làm | Chặn được gì |
|---|---|---|
| Băm mật khẩu | bcrypt (10 vòng), không bao giờ trả `passwordHash` qua API | Lộ mật khẩu khi rò rỉ DB |
| Phiên đăng nhập | JWT trong **cookie httpOnly + sameSite** | Đọc trộm token qua XSS |
| Phân quyền | Kiểm tra ở **middleware backend**, không tin giao diện | Hacker tự phong admin, gọi API trái quyền |
| Làm sạch nội dung | Sanitize Markdown **2 tầng**: lúc lưu (server) + lúc hiển thị (client) | XSS qua báo cáo/bình luận |
| Kiểm tra dữ liệu | zod validate mọi endpoint nhận dữ liệu | Dữ liệu rác, tấn công đầu vào |
| Chống spam/brute-force | **3 lớp rate limit theo IP + theo Signal** | Dò mật khẩu, spam API, lạm dụng nộp report |

*Minh chứng đo được:* bắn 1.210 lần dò mật khẩu → đúng 5 lần được thử rồi **1.205 lần bị chặn (429)**; bắn 51.698 request spam → đúng **300 request được phục vụ** rồi chặn phần còn lại, server vẫn trả lời trong ~4–5 ms.

---

## 7. Các kỹ thuật "Advanced" — dành cho người không đi sâu

> Cách trình bày: mỗi mục trả lời "**nếu không làm thì sao → làm gì → được gì**".

### 7.1 Cache bằng Redis — "trả lời từ bộ nhớ đệm"
- **Không làm:** mỗi lần mở bảng xếp hạng, server phải cộng điểm từ ~300.000 dòng → **~1,3 giây** mỗi lần, 50 người vào cùng lúc là nghẽn.
- **Làm gì:** kết quả vừa tính xong được cất vào Redis (RAM) trong 60 giây; ai vào sau đọc luôn từ đó. Có thao tác làm thay đổi điểm thì xóa cache ngay (không trả số cũ).
- **Được gì:** bảng xếp hạng còn **~3 ms** (nhanh ~400 lần). Tương tự cho danh sách report, bộ lọc, thống kê profile.

### 7.2 Index + tìm kiếm mờ (pg_trgm) — "mục lục của cuốn sách"
- **Không làm:** tìm 1 từ khóa phải quét cả 500.000 dòng — càng nhiều dữ liệu càng chậm.
- **Làm gì:** tạo "mục lục" (index) cho các cột hay tìm/sắp xếp, và bật tìm kiếm mờ để câu `chứa "xss"` vẫn dùng được mục lục.
- **Được gì:** giữ tốc độ ổn định khi dữ liệu lớn lên; các truy vấn lọc/sắp xếp phổ biến nhanh hơn hẳn.

### 7.3 Tránh N+1 query — "1 chuyến giao hàng thay vì 100 chuyến"
- **Không làm:** duyệt 20 report rồi hỏi tên người nộp từng cái một = 21 câu truy vấn cho 1 lần mở trang.
- **Làm gì:** dùng khả năng "kèm dữ liệu liên quan" của ORM để lấy 1 lần.
- **Được gì:** ít truy vấn hơn → trang mở nhanh hơn, DB nhẹ hơn.

### 7.4 Lưu sẵn điểm uy tín (denormalize) — "bảng điểm ghi sẵn thay vì tính lại"
- **Không làm:** mỗi lần mở bảng xếp hạng phải cộng lại 300.000 dòng điểm.
- **Làm gì:** ghi thẳng tổng điểm vào bảng người dùng, **cập nhật cùng lúc** với lúc ghi sổ cái (1 transaction — không bao giờ lệch), và có số liệu đối chiếu sẵn từ đầu.
- **Được gì:** bảng xếp hạng nhanh nhất có thể: đọc 1 cột và sắp xếp (đo được: **~1,26 giây → ~48 mili-giây ngay cả khi không có cache**).

### 7.5 Phân trang kiểu cursor — "đọc tiếp từ chỗ đang đứng"
- **Không làm:** cách phân trang thường (OFFSET) càng lật trang sâu càng chậm — như lật 1000 trang giấy để đếm lại từ đầu.
- **Làm gì:** trang sau chỉ xin "các mục cũ hơn mục cuối cùng của trang trước".
- **Được gì:** trang 1.000 mất thời gian như trang 1.

### 7.6 Nén gzip — "gửi hàng đóng gói thay vì để rời"
- **Không làm:** dữ liệu JSON trả về nguyên khối — tốn băng thông, chậm tải.
- **Làm gì:** server nén dữ liệu trước khi gửi (trình duyệt tự giải nén).
- **Được gì:** dung lượng giảm ~70–80% → tải nhanh hơn nhất là mạng yếu.

### 7.7 Connection pool — "hàng đợi thu ngân hợp lý"
- **Không làm:** mỗi request mở/kết nối mới tới database → tắc khi đông người.
- **Làm gì:** giữ sẵn một nhóm kết nối cố định (25) cho mọi request dùng lại.
- **Được gì:** nhiều người dùng cùng lúc vẫn mượt, không "nghẽn cổ chai".

### 7.8 Chuẩn bị dữ liệu lớn & đo lường — "không đoán, chỉ đo"
- **500.000 báo cáo giả lập** trải 3 năm được bơm vào DB bằng SQL (nhanh, không insert từng dòng).
- Bộ kịch bản **k6**: mô phỏng 10→50 người dùng ảo cùng vào trang, đo **p95 / throughput / tỉ lệ lỗi** — so sánh **trước ⟶ sau tối ưu** bằng số cụ thể.
- Kèm 2 kịch bản "tấn công": dò mật khẩu và spam API — chụp lại bằng chứng bị chặn (429).
- *(Số liệu đầy đủ: `docs/benchmark-report.md`.)*

### 7.9 Đóng gói Docker — "đóng hộp mang đi"
- **Không làm:** máy khác thiếu phiên bản Node/Postgres là demo lỗi.
- **Làm gì:** đóng cả 4 thành phần (web + API + database + cache) vào container; chạy **1 lệnh** `npm run demo` → mở `http://localhost:8080`.
- **Được gì:** máy nào cũng chạy y hệt, tự tạo bảng + dữ liệu mẫu khi khởi động.

---

## 8. Vài con số đáng nhớ (chi tiết ở benchmark-report)

| Hạng mục | Trước | Sau |
|---|---|---|
| Bảng xếp hạng (dữ liệu thuần) | 1.263 ms | **47,8 ms** (−96%) |
| Bảng xếp hạng (có cache) | — | **3,0 ms** |
| Khi spam API | — | 300 request lọt, **51.398 bị chặn**, server vẫn trả lời ~4,6 ms |
| Dò mật khẩu | — | đúng 5 lần thử, **1.205 lần bị khóa** |
| API end-to-end (smoke) | — | **63/63 phép thử PASS** |

---

## 9. Cấu trúc & Tài liệu

| Đường dẫn | Nội dung |
|---|---|
| `backend/` | API Express + Prisma (routes, middleware, services) |
| `frontend/` | React SPA (pages, components, lib) |
| `bench/k6/` + `bench/results/` | Kịch bản đo tải + 14 file kết quả |
| `docs/plan.md` | Kế hoạch & trạng thái từng chặng (đã tick hết) |
| `docs/decisions.md` | Chốt đặc tả — nơi tra khi có mâu thuẫn |
| `docs/api.md` | Hợp đồng API cho frontend |
| `docs/benchmark-guide.md` | Cách tự chạy benchmark từng bước |
| **`docs/benchmark-report.md`** | **Báo cáo kết quả đo + phân tích chi tiết** |
| `docs/sample-reports.md` | Mẫu report (target/weakness/mô tả/PoC) để submit thử + kịch bản demo |
| `docs/project-overview.md` | File này — tổng quan & tính năng |

---

## 10. Trạng thái & hướng phát triển

- ✅ **Hoàn tất**: tính năng, bảo mật, tối ưu, benchmark, đóng gói demo, tài liệu.
- ✅ **Sẵn sàng demo**: dữ liệu bench đã dọn (DB dev/demo: 11 tài khoản + 100 report); chạy `npm run demo` (mở http://localhost:8080) hoặc `npm run dev` (:5173) tùy cách trình bày.
- 💡 **Nếu phát triển tiếp**: thông báo email khi report đổi trạng thái, tải file PoC/ảnh lên, bảng "Up & Comers" cho người mới, biểu đồ xu hướng xếp hạng, đăng nhập bằng GitHub.
