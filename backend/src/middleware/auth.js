// ═══════════════════════════════════════════════════════════════════════════════
// TRẠM 4 — "TRẠM GÁC" XÁC THỰC (middleware/auth.js)
//
// Đây là các hàm chạy TRƯỚC handler của route, quyết định:
//   • authenticate         → BẮT BUỘC đăng nhập, chưa đăng nhập thì chặn (401)
//   • optionalAuthenticate → KHÔNG bắt buộc; biết thì gắn user, không biết thì coi như khách
//   • requireRole          → chỉ cho phép một vai trò (ví dụ ADMIN) — xem ghi chú bên dưới
//
// Cách chung: đọc cookie → xác thực "thẻ" JWT → gắn thông tin user vào `req.user`
// để handler phía sau dùng (req.user.id, req.user.role…).
// ═══════════════════════════════════════════════════════════════════════════════
const jwt = require('jsonwebtoken'); // kiểm tra "thẻ đăng nhập"
const prisma = require('../prisma'); // tra user trong database

// Tên cookie phiên — cấu hình được để dev (:5173) và demo (:8080) KHÔNG ghi đè cookie của nhau.
// Bài học thật từ bug: cookie KHÔNG phân biệt port — cùng host "localhost" là chung một "phong bì".
// Dev và demo lại dùng JWT_SECRET khác nhau, nên thẻ của stack này sang stack kia sẽ bị coi là
// giả → lỗi "invalid or expired token". Vì vậy demo dùng tên riêng: vc_demo_token.
const COOKIE_NAME = process.env.COOKIE_NAME || 'token';

// Đọc cookie → xác thực thẻ → trả về thông tin user (hoặc null nếu không hợp lệ).
async function loadUserFromToken(req) {
  const token = req.cookies?.[COOKIE_NAME]; // dấu ?. = "nếu có req.cookies thì mới lấy", tránh lỗi
  if (!token) return null; // không có thẻ → coi như chưa đăng nhập
  const payload = jwt.verify(token, process.env.JWT_SECRET); // sai chữ ký / hết hạn → NÉM lỗi

  // QUAN TRỌNG: không tin thông tin trong thẻ, mà tra lại user trong DB theo payload.sub (id).
  // Nhờ vậy đổi role / xoá user có hiệu lực NGAY, không phải chờ thẻ hết hạn.
  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  return user ? { id: user.id, username: user.username, role: user.role, avatar: user.avatar } : null;
}

// ── authenticate: BẮT BUỘC đăng nhập ──────────────────────────────────────────
// Không có thẻ → 401 "Not authenticated" (chưa đăng nhập)
// Thẻ hỏng     → 401 "Invalid or expired token" (jwt.verify ném lỗi, rơi vào catch)
// Hợp lệ       → gắn req.user rồi next() để chạy tiếp handler
async function authenticate(req, res, next) {
  try {
    const user = await loadUserFromToken(req);
    if (!user) return res.status(401).json({ error: 'Not authenticated' });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// ── optionalAuthenticate: KHÔNG bắt buộc đăng nhập ────────────────────────────
// Dùng cho API công khai nhưng cần biết "ai đang xem" (ví dụ danh sách report:
// admin thấy hết, chủ nick thấy SPAM của mình, khách chỉ thấy phần công khai).
// Luôn next() — có thẻ thì req.user = user, không có thì req.user = null.
async function optionalAuthenticate(req, res, next) {
  try {
    req.user = (await loadUserFromToken(req)) || null; // `|| null`: undefined → null
  } catch {
    req.user = null; // thẻ hỏng cũng KHÔNG chặn, chỉ coi như khách
  }
  next();
}

// ── requireRole: chỉ cho phép một vai trò ─────────────────────────────────────
// Đây là "hàm trả về hàm": requireRole('ADMIN') trả về một middleware để gắn vào route.
// ⚠️ Ghi chú trung thực: file này ĐỊNH NGHĨA requireRole nhưng các route CHƯA dùng nó —
//    phần kiểm tra admin đang viết trực tiếp trong routes/reports.js
//    (`req.user.role === 'ADMIN'` → 403). Có thể refactor cho gọn: điểm đáng nói khi bảo vệ.
function requireRole(role) {
  return (req, res, next) => {
    if (!req.user || req.user.role !== role) {
      return res.status(403).json({ error: 'Forbidden' }); // 403 = đã đăng nhập nhưng không đủ quyền
    }
    next();
  };
}

module.exports = { authenticate, optionalAuthenticate, requireRole, COOKIE_NAME };
