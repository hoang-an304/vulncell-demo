# Deploy demo VulnCell trên Linux / Ubuntu Server

> Dành cho người nhận repo: chạy bản demo để xem mà **không cần cài Node.js** — chỉ cần Docker.
> Đã kiểm chứng trên Windows; toàn bộ image là Linux (`node:22-bookworm-slim`, `nginx`, `postgres:16`, `redis:7`) nên chạy tốt trên Ubuntu/Debian và các distro Linux khác, kể cả server từ xa.

---

## 0. TL;DR — 3 lệnh

```bash
curl -fsSL https://get.docker.com | sh && sudo usermod -aG docker $USER
# (đăng xuất / đăng nhập lại, hoặc chạy: newgrp docker)
git clone <repo-url> vulncell && cd vulncell
docker compose -p vulncell-demo -f docker-compose.demo.yml up -d --build
```

Mở `http://<IP-máy-chủ>:8080` → đăng nhập `admin` / `password123`.

---

## 1. Cài Docker Engine + Compose plugin

```bash
# Cách nhanh (script chính thức của Docker):
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER     # để dùng docker không cần sudo

# Kiểm tra
docker --version
docker compose version            # Compose V2 đi kèm Docker Engine
```

> Nếu không muốn dùng script: cài theo hướng dẫn chính thức https://docs.docker.com/engine/install/ubuntu/

**Bắt buộc tối thiểu:** Docker Engine 24+, 2 GB RAM, 3 GB dung lượng trống (image ~600 MB + volume dữ liệu).

---

## 2. Lấy code

```bash
git clone <repo-url> vulncell
cd vulncell
```

Không có git? Tải ZIP từ GitHub rồi giải nén, hoặc upload thư mục bằng `scp`.

---

## 3. Chạy bản demo

```bash
docker compose -p vulncell-demo -f docker-compose.demo.yml up -d --build
```

- Lần đầu build ~1–3 phút (tải image + npm ci + build frontend).
- Container `backend` tự chạy **migration + seed dữ liệu mẫu** khi khởi động (11 tài khoản, 100 report).
- Kiểm tra:

```bash
docker ps                                             # thấy 4 container vulncell-demo-*
docker logs vulncell-demo-backend-1 --tail 20         # thấy "VulnCell API running..."
curl -s http://localhost:8080/api/leaderboard | head  # JSON bảng xếp hạng
```

---

## 4. Mở cổng nếu server ở xa

- **ufw**: `sudo ufw allow 8080/tcp`
- **Cloud (AWS/GCP/DigitalOcean...)**: mở cổng 8080 ở Security Group / Firewall.
- Đổi cổng khác: sửa dòng `"8080:80"` trong `docker-compose.demo.yml` (ví dụ `"80:80"`).

---

## 5. Tài khoản demo

| Username | Vai trò | Ghi chú |
|---|---|---|
| `admin` | ADMIN (STAFF) | Triage, đổi state, cấp bounty |
| `reporter1` … `reporter10` | HACKER | `reporter10` Signal âm → bị khóa nộp |

Mật khẩu chung: **`password123`**.
Muốn nộp thử report: xem mẫu dán sẵn trong `docs/sample-reports.md`.

---

## 6. Quản lý & cập nhật

```bash
# Xem log
docker compose -p vulncell-demo -f docker-compose.demo.yml logs -f backend

# Tắt (giữ dữ liệu)
docker compose -p vulncell-demo -f docker-compose.demo.yml down

# Cập nhật code mới
git pull
docker compose -p vulncell-demo -f docker-compose.demo.yml up -d --build

# Reset dữ liệu demo về 11 tài khoản + 100 report sạch
docker exec vulncell-demo-backend-1 node prisma/seed.js --force
docker exec vulncell-demo-redis-1 redis-cli flushdb

# Xoá sạch cả dữ liệu (volume)
docker compose -p vulncell-demo -f docker-compose.demo.yml down -v
```

---

## 7. Lưu ý khi mở ra Internet (không bắt buộc)

Bản demo đủ để cho bạn bè/nhóm khác xem. Nếu public rộng rãi:

1. **HTTPS**: đặt sau reverse proxy (Caddy / nginx) trỏ vào `localhost:8080`. Khi có HTTPS hãy đổi backend env: `COOKIE_SECURE: "true"`.
2. **Đổi `JWT_SECRET`** trong `docker-compose.demo.yml` (hiện là secret demo, cố tình để lộ).
3. Rate limit 3 lớp đã bật sẵn; tài khoản demo dùng mật khẩu công khai — chấp nhận được với môi trường demo, đừng dùng cho dữ liệu thật.

---

## 7b. Chia sẻ demo qua Internet bằng Cloudflare Tunnel (tuỳ chọn)

Không cần mở firewall/router, chạy được cả sau CGNAT — cloudflared chủ động mở kết nối ra ngoài:

```bash
# 1) Tải 1 file portable (Windows: cloudflared-windows-amd64.exe; Linux: cloudflared-linux-amd64)
#    Xem https://github.com/cloudflare/cloudflared/releases
# 2) Chạy tunnel trỏ vào cổng demo 8080
./cloudflared tunnel --url http://localhost:8080 --no-autoupdate
# 3) Cloudflare in ra link dạng https://<random>.trycloudflare.com — gửi link này cho mọi người
```

Lưu ý:
- Link **tạm** (đổi mỗi lần chạy), sống trong lúc tiến trình cloudflared chạy; tắt bằng `Ctrl+C` hoặc `Stop-Process -Name cloudflared` (Windows).
- Qua tunnel, mọi người dùng **chung một "rổ" IP** ở lớp rate limit 1 → nếu cả lớp cùng truy cập, nên nâng `RATE_LIMIT_API_MAX` trong `docker-compose.demo.yml` (ví dụ `"2000"`) rồi `up -d`.
- Muốn link **cố định** (`demo.tenmien.com`) cần tài khoản Cloudflare + tên miền → dùng "named tunnel".

## 8. Xử lý lỗi thường gặp

| Lỗi | Nguyên nhân | Cách xử lý |
|---|---|---|
| `permission denied` khi gọi docker | Chưa vào group `docker` | `sudo usermod -aG docker $USER` rồi đăng nhập lại (hoặc `newgrp docker`) |
| `port is already allocated` | Cổng 8080 bị chiếm | Đổi mapping trong compose hoặc tắt service đang dùng cổng |
| Backend restart liên tục | DB chưa sẵn sàng / sai `DATABASE_URL` | Xem `docker logs vulncell-demo-backend-1`; compose đã có healthcheck, chờ ~20s |
| Trang mở nhưng API 502 | Backend chưa migrate xong | Chờ 20–30s rồi tải lại; xem log backend |
| Build chậm / tải image lỗi | Mạng | Chạy lại `up -d --build`, hoặc cấu hình mirror |
| Server arm64 (Raspberry Pi, Ampere) | — | Các image đều có bản arm64; build từ source chạy như thường |

---

## 9. (Tuỳ chọn) Chạy chế độ dev trên server

Chỉ cần khi muốn sửa code:

```bash
docker compose up -d                     # Postgres + Redis (stack dev)
npm install && npm --prefix backend install && npm --prefix frontend install
cd backend && cp .env.example .env && npx prisma migrate dev && npm run seed && cd ..
npm run dev                              # API :4000 + web :5173
```
