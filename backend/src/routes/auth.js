// ═══════════════════════════════════════════════════════════════════════════════
// TRẠM 3 — ĐĂNG KÝ / ĐĂNG NHẬP / ĐĂNG XUẤT / "TÔI LÀ AI"   (routes/auth.js)
//
// `express.Router()` bên dưới giống một "bảng chỉ dẫn nhỏ": chứa các đường con
// (/register, /login, /logout, /me) và được app.js gắn vào với tiền tố /api/auth.
// → Đường đầy đủ: /api/auth/register, /api/auth/login, ...
//
// Ba khái niệm cốt lõi của file này:
//   • HASH mật khẩu : KHÔNG lưu mật khẩu thật, chỉ lưu "bản băm" một chiều (bcrypt).
//   • JWT (token)   : "thẻ đăng nhập" server ký tặng sau khi đăng nhập đúng.
//   • COOKIE        : "phong bì" đựng thẻ — trình duyệt tự gửi kèm mỗi request sau đó.
// ═══════════════════════════════════════════════════════════════════════════════
const express = require('express');
const bcrypt = require('bcryptjs'); // thư viện băm mật khẩu
const jwt = require('jsonwebtoken'); // thư viện tạo / kiểm tra "thẻ đăng nhập"
const prisma = require('../prisma'); // để nói chuyện với database Postgres
const { authenticate, COOKIE_NAME } = require('../middleware/auth'); // "trạm gác" (Trạm 4)
const { validate } = require('../middleware/validate'); // kiểm tra dữ liệu đầu vào
const { registerSchema, loginSchema } = require('../schemas'); // luật kiểm tra (zod)
const { getSignal } = require('../services/reputation'); // tính Signal (uy tín gần đây)
const {
  assertLoginAllowed,
  recordLoginFailure,
  clearLoginFailures,
} = require('../middleware/rateLimit'); // chống dò mật khẩu (chi tiết ở Chặng 5)

const router = express.Router(); // "bảng chỉ dẫn nhỏ" cho nhóm API /api/auth

// Cấu hình "phong bì" cookie đựng thẻ đăng nhập.
const COOKIE_OPTIONS = {
  httpOnly: true, // JS trong trình duyệt KHÔNG đọc được cookie (chống XSS lấy token)
  sameSite: 'lax', // hạn chế website khác lợi dụng cookie (giảm CSRF)
  secure: process.env.COOKIE_SECURE === 'true', // chỉ gửi qua HTTPS; dev/demo HTTP nên false
  maxAge: 7 * 24 * 60 * 60 * 1000, // sống 7 ngày (7 × 24h × 60' × 60s × 1000ms)
};

// ── POST /api/auth/register — tạo tài khoản mới ────────────────────────────────
// Điểm quan trọng: KHÔNG BAO GIỜ nhận "role" từ client, luôn tạo HACKER.
// (zod trong registerSchema tự bỏ qua field lạ như "role" nên gửi lên cũng vô tác dụng)
router.post('/register', validate(registerSchema), async (req, res, next) => {
  try {
    const { username, email, password } = req.body; // body đã được zod chuẩn hoá (trim/lowercase)
    const passwordHash = await bcrypt.hash(password, 10); // 10 = số vòng băm (càng cao càng chậm & khó dò)
    const user = await prisma.user.create({
      data: { username, email, passwordHash, role: 'HACKER' }, // role HARDCODE = chống leo quyền
    });
    res.status(201).json({ id: user.id, username: user.username, role: user.role }); // 201 = đã tạo xong
  } catch (err) {
    // P2002 = mã lỗi Prisma khi vi phạm ràng buộc "duy nhất" (username/email đã tồn tại)
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'Username or email already exists' });
    }
    next(err); // lỗi khác → chuyển cho "phòng quản lý" (error handler ở app.js)
  }
});

// ── POST /api/auth/login — đăng nhập bằng email HOẶC username ──────────────────
// Sai 5 lần trong 1 phút (theo IP + username) → khóa tạm 15 phút (429). Chi tiết: Chặng 5.
router.post('/login', validate(loginSchema), async (req, res, next) => {
  try {
    // Người dùng có thể gửi email, username, hoặc field "identifier" — lấy field nào có
    const identifier = req.body.email || req.body.username || req.body.identifier;

    // (1) Đang bị khóa do sai quá nhiều trước đó? → ném 429 và dừng luôn
    await assertLoginAllowed(req, identifier);

    // (2) Tìm user theo email HOẶC username (findFirst + OR)
    const user = await prisma.user.findFirst({
      where: { OR: [{ email: identifier }, { username: identifier }] },
    });

    // (3) So mật khẩu người nhập với "bản băm" trong DB (bcrypt.compare lo phần so sánh an toàn)
    const ok = user && (await bcrypt.compare(req.body.password, user.passwordHash));

    if (!ok) {
      // (4) Sai → ghi nhận 1 lần thất bại (để đếm mà khóa) rồi trả 401.
      //     Cố ý dùng CÙNG một thông báo cho "sai user" và "sai mật khẩu"
      //     → kẻ tấn công không dò được tài khoản nào tồn tại.
      await recordLoginFailure(req, identifier);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // (5) Đúng → xoá bộ đếm sai, rồi ký "thẻ đăng nhập" JWT (payload: sub = id user, role)
    await clearLoginFailures(req, identifier);
    const token = jwt.sign({ sub: user.id, role: user.role }, process.env.JWT_SECRET, {
      expiresIn: '7d', // thẻ hết hạn sau 7 ngày (khớp maxAge của cookie)
    });

    // (6) Nhét thẻ vào "phong bì" cookie gửi về trình duyệt; body trả thông tin user
    //     (KHÔNG bao giờ trả mật khẩu hay passwordHash)
    res.cookie(COOKIE_NAME, token, COOKIE_OPTIONS);
    res.json({ id: user.id, username: user.username, role: user.role });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/auth/logout — đăng xuất ─────────────────────────────────────────
// Chỉ cần bảo trình duyệt xoá cookie. (JWT là "thẻ" tự chứa thông tin, server không lưu phiên.)
router.post('/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME); // ra lệnh cho trình duyệt xoá cookie
  res.json({ ok: true });
});

// ── GET /api/auth/me — "tôi đang là ai?" ──────────────────────────────────────
// `authenticate` (Trạm 4) đọc cookie + xác thực token rồi gắn user vào req.user.
// Kèm `signal` — frontend dùng để làm mờ nút Submit khi Signal âm (bị khóa nộp).
router.get('/me', authenticate, async (req, res, next) => {
  try {
    const signal = await getSignal(req.user.id); // tính điểm uy tín gần đây
    res.json({ ...req.user, signal }); // ...req.user = trải thông tin user ra, rồi thêm signal
  } catch (err) {
    next(err);
  }
});

module.exports = router; // xuất "bảng chỉ dẫn" cho app.js gắn vào tiền tố /api/auth
