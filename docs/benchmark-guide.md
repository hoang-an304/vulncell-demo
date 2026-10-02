# Hướng dẫn Benchmark & Stress Test (viết cho người mới)

> Tài liệu này để bạn **tự tay chạy** và **nhìn thấy kết quả**. Không cần biết trước gì về k6.
> Đọc từ trên xuống, phần 6 là "làm theo từng bước".

---

## 0. TL;DR — 6 lệnh cần nhớ

```powershell
npm run seed:bench                          # 1. bơm 500k report (chạy 1 lần, ~2 phút)
npm run serve:bench                         # 2. TERMINAL A: API chế độ đo (cache BẬT, rate limit TẮT)
# --- TERMINAL B (mở thêm 1 cửa sổ PowerShell ở thư mục vulncell) ---
npm run bench:search                        # 3. chạy 1 kịch bản bất kỳ (kết quả in ra ngay)
npm run bench:leaderboard
npm run bench:bruteforce                    # 4. kịch bản security (cần API chạy ở chế độ THƯỜNG)
npm run seed:bench:clean                    # 5. dọn dữ liệu khi đã chụp xong số
```

Muốn lưu kết quả thành file để so sánh về sau (thay vì chỉ xem trên màn hình):
```powershell
k6 run --summary-export=bench/results/v0-search.json bench/k6/dashboard-search.js
```

---

## 1. Bốn loại test — định nghĩa đơn giản

| Loại | Câu hỏi nó trả lời | Trong project này |
|---|---|---|
| **Benchmark** (đo hiệu năng) | "Nhanh cỡ nào?" — đo p90/p95, throughput ở tải bình thường | So sánh **trước/sau tối ưu** (các mốc v0 → v1 → v2) |
| **Load test** | "Chịu được tải dự kiến không?" | Ramp-up lên 30–50 user ảo (các stages trong script) |
| **Stress test** | "Gãy ở đâu? Bao giờ mới sập?" | Bơm 500k dữ liệu + đẩy tải tăng dần tới khi lỗi |
| **Abuse/Security test** | "Cơ chế chặn spam có hoạt động?" | Brute-force login + spam API (kịch bản 4, 5) |

**User ảo (VU)** = một "con robot" giả làm người dùng: lặp đi lặp lại việc gọi API.
Tăng VU = tăng số người dùng đồng thời. Ramp-up = tăng từ từ để mô phỏng thực tế.

---

## 2. Đọc các chỉ số (quan trọng nhất)

| Chỉ số trong output k6 | Nghĩa | Đọc thế nào |
|---|---|---|
| `http_req_duration` `p(95)` / `p(90)` | **95%/90% request nhanh hơn mức này** | Chỉ số chính để so sánh! p95 nhỏ hơn = tốt hơn |
| `http_req_duration` `avg` | Trung bình | Ít tin cậy — 1 request cực chậm cũng kéo lệch |
| `med` | Trung vị (50% request nhanh hơn) | Đại diện "người dùng điển hình" |
| `max` | Chậm nhất | Thường là request đầu tiên (cache miss, query cold) |
| `http_reqs` `... rate` | **Throughput** — số request/giây | Càng cao càng tốt, nhưng phải đi kèm p95 thấp |
| `http_req_failed` | Tỷ lệ request bị coi là lỗi (4xx/5xx) | Kịch bản perf phải ~0%; kịch bản security cố ý cao |
| `vus` | Số user ảo đang chạy | Đối chiếu với stages trong script |

> **Vì sao nhìn p95/p90 mà không nhìn avg?** Ví dụ 100 request: 95 request mất 20ms, 5 request mất 3 giây (cache miss + query nặng). Avg ≈ 170ms nghe "ổn", nhưng p95 = 20ms — avg bị outlier kéo lệch, còn p95/p90 mới mô tả trải nghiệm thật của phần lớn người dùng.

---

## 3. k6 hoạt động thế nào

1. Bạn viết kịch bản bằng JavaScript (`bench/k6/*.js`). Trong đó:
   - `options.stages`: kịch bản tăng/giảm số VU (ramp-up → giữ tải → ramp-down).
   - `export default function () {...}`: **mỗi VU chạy hàm này lặp đi lặp lại** — chính là 1 "lượt" người dùng.
   - `setup()`: chạy **1 lần duy nhất** trước khi bắn tải (dùng để lấy dữ liệu chuẩn bị, ví dụ danh sách report id).
   - `check()`: đánh dấu PASS/FAIL cho từng request (xem khối `checks` trong output).
2. Chạy: `k6 run script.js` → k6 bắn HTTP **từ máy bạn** tới `BASE_URL` (mặc định `http://localhost:4000`) → tổng hợp số liệu → in summary.
3. Muốn xuất file JSON: thêm `--summary-export=đường-dẫn.json`.

**Output mẫu** (số liệu minh hoạ — số thật sẽ khác):
```
running (0m58.0s), 00/30 VUs, ...
     ✓ HTTP 200

     checks.........................: 100.00% ✓ 1450 ✗ 0
     http_req_duration..............: avg=42ms  min=3ms med=25ms max=890ms p(90)=80ms p(95)=210ms
     http_reqs......................: 1450   24.9/s        ← throughput
     http_req_failed................: 0.00%  ✓ 0   ✗ 0
     vus............................: 30     min=1  max=30
```
→ Nghĩa là: 24.9 request/giây, một nửa request dưới 25ms, 95% dưới 210ms, không có lỗi.

---

## 4. Hệ thống của mình: đo cái gì bằng cái gì

**Dữ liệu:** `npm run seed:bench` tạo ~2.000 user + **500.000 report** (trải 3 năm) + ~300k dòng ledger.

**Hai công tắc quan trọng** (đặt qua 2 lệnh chạy server sẵn có):

| Lệnh | `RATE_LIMIT_DISABLED` | `CACHE_DISABLED` | Dùng cho |
|---|---|---|---|
| `npm run serve:bench` | true (tắt chặn) | false (cache bật) | Đo **trải nghiệm thực tế** (có cache) |
| `npm run serve:bench:nocache` | true | true (tắt cache) | Đo **DB thuần** — thấy rõ hiệu quả index/trigram |
| `npm run dev` (bình thường) | false | false | Chạy **kịch bản security** (để rate limit chặn thật) |

**Endpoint đo và "thủ phạm" hiệu năng tương ứng:**

| Kịch bản | Endpoint chính | Cải thiện nhờ (ở các mốc sau) |
|---|---|---|
| `bench:search` | `GET /api/reports?q=...` | **pg_trgm + GIN index** (LIKE %...% không dùng được index thường) |
| `bench:case` | `GET /api/reports/:id` + `/events` | Index sẵn có; chủ yếu xác nhận không hồi quy |
| `bench:leaderboard` | `GET /api/leaderboard` | Cache Redis → (mốc sau) cột `User.reputation` denormalized |
| `bench:bruteforce` | `POST /api/auth/login` | Rate limit login (5 sai/phút → khóa 15 phút) |
| `bench:spam` | Mọi `/api/*` | Rate limit tổng quát theo IP (300 req/phút) |

---

## 5. Kế hoạch mốc đo (chốt 30/09 — 3 mốc gọn)

| Mốc | Hệ thống | Cách chạy server | File kết quả |
|---|---|---|---|
| **v0** | Baseline — DB thuần, chưa tối ưu | `npm run serve:bench:nocache` | `v0-search.json`, `v0-leaderboard.json`, `v0-case.json` ✅ |
| **v1** | Baseline + cache Redis (trước tối ưu) | `npm run serve:bench` | `v1-search.json`, `v1-leaderboard.json`, `v1-case.json` ✅ |
| **v2** | + Toàn bộ tối ưu (pg_trgm, composite index, keyset, cache profile, denormalize reputation, gzip, pool) | chạy **cả 2 chế độ** | `v2-*-nocache.json` + `v2-*-cache.json` |
| Security | Rate limit 3 lớp BẬT | `npm run dev` (server thường) | `security-bruteforce.json`, `security-spam.json` |

Cách đọc kết quả cho báo cáo:
1. **nocache: v0 → v2** — hiệu quả tối ưu ở tầng DB/index (con số "kỹ thuật").
2. **cache: v1 → v2** — trải nghiệm cuối của người dùng.

**Nếu bí thời gian:** ưu tiên 2 kịch bản chính (search + leaderboard) × 2 chế độ là đủ biểu đồ.

---

## 6. Quy trình từng bước (copy-paste được)

### Bước 1 — Chuẩn bị dữ liệu 500k
```powershell
# từ thư mục gốc vulncell/
docker compose up -d          # chắc chắn Postgres + Redis đang chạy
npm run seed:bench            # ~2 phút, thêm ~1.5GB vào ổ D
```
Kiểm tra nhanh: mở http://localhost:5555 (Prisma Studio) xem bảng Report đã 500k+ dòng.
> Muốn ít dữ liệu hơn để thử: `npm run seed:bench -- --reports=100000`

### Bước 2 — Chạy API ở chế độ đo (Terminal A)
```powershell
npm run serve:bench            # cache ON — đo trải nghiệm thực tế
# hoặc
npm run serve:bench:nocache    # cache OFF — đo DB thuần (để thấy hiệu quả index)
```
Giữ terminal này mở suốt quá trình đo.

### Bước 3 — Chạy kịch bản (Terminal B)
```powershell
# chạy thử 7 giây trước để chắc mọi thứ OK (nhớ bỏ QUICK sau khi thử: Remove-Item Env:QUICK)
$env:QUICK='true'; k6 run bench/k6/dashboard-search.js

# v0 (nocache) — đã chạy xong, tên file chuẩn:
#   v0-search.json · v0-leaderboard.json · v0-case.json
# v1 (cache) — đã chạy xong:
#   v1-search.json · v1-leaderboard.json · v1-case.json
# v2 (sau tối ưu) — chạy cả 2 chế độ, ví dụ:
k6 run --summary-export=bench/results/v2-search-nocache.json bench/k6/dashboard-search.js
k6 run --summary-export=bench/results/v2-leaderboard-cache.json bench/k6/leaderboard.js
k6 run --summary-export=bench/results/v2-case-cache.json bench/k6/case-detail.js
```
Mỗi kịch bản dài ~1 phút. **Chạy 3 lần, bỏ lần 1 (warm-up), lấy lần 2–3.**
> ⚠️ **Đảm bảo biến `QUICK` đã được tắt** — nếu phiên PowerShell còn `$env:QUICK='true'` thì kịch bản chỉ chạy ~7 giây (ít mẫu, số liệu kém tin cậy). Tắt bằng: `Remove-Item Env:QUICK -ErrorAction SilentlyContinue`
> Nếu chưa thêm k6 vào PATH (mới cài): mở cửa sổ PowerShell MỚI, hoặc chạy `& "C:\Program Files\k6\k6.exe" run ...`

### Bước 4 — Đọc kết quả & ghi lại
Nhìn 4 dòng này trong output:
```
http_req_duration....: ... p(95)=...
http_reqs............: ... <rate>/s
http_req_failed......: ...%
```
Ghi vào bảng tổng hợp (Mục 9) bộ số: **p95 · p90 · RPS · error%**.

### Bước 5 — So sánh sau khi tối ưu
Sau khi áp xong toàn bộ tối ưu (phiên bản **v2**): **restart server, chạy lại đúng các lệnh ở Bước 3** với tên file `v2-...`, lặp ở **cả 2 chế độ** (`serve:bench:nocache` → file `-nocache`, `serve:bench` → file `-cache`). So sánh bằng `npm run bench:results` hoặc mở JSON bằng Excel.

> Tóm tắt khác biệt **v0 / v1 / v2** (setup từng mốc, v2 thêm những gì): xem `docs/benchmark-report.md` §1.3.

### Bước 6 — Kịch bản security (làm cuối cùng, server chế độ THƯỜNG)
```powershell
# Terminal A: dừng serve:bench, chạy server thường
npm run dev:api

# Terminal B:
k6 run --summary-export=bench/results/security-bruteforce.json bench/k6/login-bruteforce.js
k6 run --summary-export=bench/results/security-spam.json       bench/k6/api-spam.js
```
Nhìn 2 dòng counter tự tạo trong output:
```
login_401_sai_mat_khau.......: 5
login_429_DA_BI_CHAN.........: 648    ← sau 5 lần sai, TẤT CẢ request sau đó bị chặn
api_200_qua_duoc.............: 300    ← đúng trần 300 req/phút
api_429_DA_BI_CHAN...........: 1234   ← phần vượt trần bị chặn
```
> ⚠️ Kịch bản spam sẽ khóa IP của bạn ~60 giây. Muốn mở ngay:
> ```powershell
> docker exec vulncell-redis-1 redis-cli --scan --pattern "api:*" | ForEach-Object { docker exec vulncell-redis-1 redis-cli del $_ }
> ```

### Bước 7 — Dọn dẹp khi xong
```powershell
npm run seed:bench:clean       # xóa user/report/ledger bench — về lại dữ liệu demo nhỏ
```

---

## 7. Độ tin cậy của số đo

1. **Chạy cùng máy** (server + k6 chung laptop) sẽ nhiễu hơn chạy 2 máy. Với đồ án, cùng máy vẫn OK — nhưng **ghi rõ cấu hình máy vào báo cáo** (12 CPU, 31GB RAM, Postgres+Redis trong Docker).
2. Tắt bớt app nặng (Chrome nhiều tab, Docker build, Windows Update) khi đo; đừng vừa đo vừa mở IDE build project.
3. **3 lần lấy median** — đừng lấy 1 lần.
4. Lần chạy đầu tiên luôn chậm hơn (cache cold, JIT) → bỏ lần 1.
5. Không chạy 2 kịch bản cùng lúc (trừ khi muốn xem hệ thống chịu "nhiều loại tải" ra sao).
6. Ghi kèm: ngày giờ, chế độ server (cache/nocache), số VU, dữ liệu (500k).

---

## 8. Tổng hợp vào báo cáo/slide — SỐ THẬT (đã đo 01/10/2026, 500k report, 12 CPU)

**Bảng hiệu năng** (k6, ramp-up 10→30/50 VU, mỗi số là 1 lần chạy ~60s; 0% lỗi toàn bộ):

| Kịch bản | v0 (nocache) p95 | v1 (cache) p95 | v2 (nocache) p95 | v2 (cache) p95 |
|---|---|---|---|---|
| **leaderboard** | **1263.1 ms** | 3.0 ms | **47.8 ms** | 3.0 ms |
| search | 9.2 ms | 4.3 ms | 9.8 ms | 7.9 ms |
| case detail | 5.9 ms | 6.2 ms | 6.6 ms | 5.6 ms |

**Câu chuyện cho slide:**
1. **Leaderboard — điểm đau nhất được sửa:** DB thuần **1263 ms → 47.8 ms p95 (~26×)**, median **678 → 12.8 ms (~53×)** nhờ denormalize `User.reputation` + composite index. Cache giữ 3.0 ms; request "nguội" (cache miss) max giảm **352 → 41 ms**.
2. **Search & Case — ổn định, không hồi quy:** ~5–10 ms ở mọi mốc. Search vốn đã nhanh nhờ `ORDER BY createdAt DESC LIMIT` tận dụng index sẵn có; pg_trgm giữ lại để tìm từ khóa hiếm (không tốt hơn trên từ khóa phổ biến — nói thẳng trong báo cáo).
3. **Security — bằng chứng chặn spam/DoS** (server chế độ thường, rate limit bật):

| Kịch bản | Tổng request | Kết quả | Nhận xét |
|---|---|---|---|
| `security-bruteforce` | 1.210 | **5×401 rồi 1.205×429** | Sau đúng 5 lần sai, khóa 15 phút — mọi request sau bị chặn tức thì (p95 4.5 ms) |
| `security-spam` | 51.698 | **300×200 rồi 51.398×429** | Trần 300 request/phút/IP hoạt động chính xác; 429 trả về nhanh nên server không treo (2.585 req/s) |

> Lưu ý khi trình bày: cột "error%" của 2 dòng security cao (100% / 99.4%) là **đúng chủ đích** — đó là các request bị chặn, không phải lỗi hệ thống.

→ Vẽ biểu đồ cột p95: leaderboard v0 vs v2 (chênh 26×) là hình ăn điểm nhất.
→ Kèm ảnh chụp 2 counter: `login_429_DA_BI_CHAN` và `api_429_DA_BI_CHAN`.

---

## 9. Lỗi thường gặp

| Lỗi | Nguyên nhân | Cách xử lý |
|---|---|---|
| `k6: command not found` | PATH chưa nạp (vừa cài) | Mở cửa sổ PowerShell MỚI, hoặc `& "C:\Program Files\k6\k6.exe" run ...` |
| `connection refused` | API chưa chạy | Terminal A chạy `npm run serve:bench` |
| Nhiều 429 trong kịch bản perf | Quên tắt rate limit | Dùng `serve:bench` / `serve:bench:nocache`, không dùng `npm run dev` |
| `http_req_failed` = 100% ở bruteforce | 401/429 bị coi là "failed" | Bình thường! Kịch bản này cố tình; đọc 2 counter `login_401`/`login_429` thay vì http_req_failed |
| Số p95 lạ đời, dao động mạnh | Máy đang chạy việc khác | Tắt app nặng, chạy lại; luôn chạy 3 lần |
| `setup()` báo "Không lấy được report nào" | Chưa seed | `npm run seed` hoặc `npm run seed:bench` |

---

## 10. Các lệnh tra nhanh

```powershell
npm run seed:bench                                  # seed 500k
npm run seed:bench:clean                            # xóa dữ liệu bench
npm run serve:bench                                 # API cache ON  (rate limit tắt)
npm run serve:bench:nocache                         # API cache OFF (rate limit tắt)
npm run bench:search | bench:case | bench:leaderboard | bench:bruteforce | bench:spam
k6 run --summary-export=bench/results/<tên>.json bench/k6/<script>.js
k6 run --summary-trend-stats="avg,min,med,p(90),p(95),max" bench/k6/<script>.js
$env:QUICK='true'; k6 run bench/k6/<script>.js      # chạy thử ~7 giây
```
