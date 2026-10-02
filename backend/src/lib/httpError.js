// ═══════════════════════════════════════════════════════════════════════════════
// TRẠM 5b — "LỖI CÓ MÃ TRẠNG THÁI" (lib/httpError.js)
//
// Một lớp lỗi (class) đặc biệt: nó MANG THEO mã HTTP mong muốn.
// Dùng ở service/route:   throw new HttpError(400, 'Invalid state transition: ...')
// Rồi ở route:            catch (err) { next(err) }
// Cuối cùng, error handler ở app.js đọc .status để trả về đúng mã cho client.
//
// Nhờ vậy mọi tầng code đều báo lỗi theo cùng một kiểu: (mã HTTP, thông báo).
// ═══════════════════════════════════════════════════════════════════════════════
class HttpError extends Error {
  constructor(status, message) {
    super(message); // gọi constructor của lớp Error cha → gán vào lỗi.message
    this.status = status; // gắn thêm mã HTTP (400/401/403/404/409/429…) vào lỗi
  }
}

module.exports = HttpError;
