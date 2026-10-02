// ═══════════════════════════════════════════════════════════════════════════════
// TRẠM 2 — LẮP RÁP WEB APP (mọi request đi qua đây, theo thứ tự từ trên xuống)
//
// Hãy tưởng tượng mỗi request là một vị khách vào quán: khách đi lần lượt qua các "cửa"
// được đăng ký bằng app.use(...). Cửa nào đăng ký TRƯỚC thì chạy TRƯỚC, và có quyền
// chặn khách (ví dụ cửa chống spam). Vì vậy THỨ TỰ các dòng dưới đây chính là kiến trúc.
// ═══════════════════════════════════════════════════════════════════════════════
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');
const compression = require('compression');

const authRoutes = require('./routes/auth');
const reportRoutes = require('./routes/reports');
const leaderboardRoutes = require('./routes/leaderboard');
const userRoutes = require('./routes/users');
const { apiRateLimit } = require('./middleware/rateLimit');

const app = express();

// ⚠️ Khi chạy sau reverse proxy (nginx trong bản demo), kết nối tới Express mang IP nội bộ
// của proxy (dạng 172.x) → mọi người dùng chung 1 "rổ" rate limit theo IP (bị khoá lây).
// Tin đúng 1 lớp proxy để req.ip lấy IP THẬT từ X-Forwarded-For (nginx đã forward sẵn).
// Dùng số 1 (KHÔNG dùng `true`): `true` sẽ tin mọi giá trị XFF → client giả mạo để né rate limit.
app.set('trust proxy', 1);

// ── Cửa 1: CORS — "website nào được phép gọi API?"
// Trình duyệt tự bảo vệ người dùng: mặc định chặn trang web khác gọi API của mình.
// Dòng này cho phép frontend (FRONTEND_URL, mặc định http://localhost:5173) gọi.
// credentials: true = cho phép gửi kèm cookie (thẻ đăng nhập) — bắt buộc vì auth dùng cookie.
app.use(
  cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
  })
);

// ── Cửa 2: nén dữ liệu trả về (gzip) cho nhẹ, tải nhanh hơn (list/facets giảm ~70-80%)
app.use(compression());

// ── Cửa 3: đọc "giỏ hàng" JSON mà khách gửi lên (req.body); chặn nếu to quá 1mb
app.use(express.json({ limit: '1mb' }));

// ── Cửa 4: đọc "thẻ thành viên" (cookie) đính trong request → req.cookies
//     (middleware/auth.js đọc token đăng nhập từ đây)
app.use(cookieParser());

// ── Cửa 5: ghi log mỗi request ra terminal (chỉ để xem, không đổi logic)
app.use(morgan('dev'));

// Đường kiểm tra sức khoẻ: mở http://localhost:4000/health thấy {"ok":true} = server còn sống.
// Cố ý đặt TRƯỚC cửa chống spam, để Docker/compose kiểm tra không bao giờ bị chặn 429.
app.get('/health', (req, res) => res.json({ ok: true }));

// ── Cửa 6: chống spam — 1 IP gọi quá nhiều lần trong 1 phút thì bị chặn (429)
app.use('/api', apiRateLimit);

// ── Các "phòng chức năng": mỗi dòng là một nhóm API, nằm trong 1 file ở src/routes/
app.use('/api/auth', authRoutes); // đăng ký / đăng nhập / đăng xuất / me
app.use('/api/reports', reportRoutes); // xem, nộp, xử lý report
app.use('/api/leaderboard', leaderboardRoutes); // bảng xếp hạng
app.use('/api/users', userRoutes); // profile, avatar

// ── Không "phòng" nào khớp đường /api/... → trả 404 (chỉ chạy khi các dòng trên đã "trượt")
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// ── "Phòng quản lý": hứng MỌI lỗi ném ra từ các bước trên.
// Điều kiện của Express: hàm phải có ĐÚNG 4 tham số (err, req, res, next) và phải để CUỐI CÙNG.
// HttpError có .status (400/401/403/409/429…) → dùng status đó; lỗi khác → 500.
// Kết quả luôn thống nhất dạng { error: "..." } để frontend dễ đọc.
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal error' });
});

module.exports = app; // "xuất" app ra cho server.js require
