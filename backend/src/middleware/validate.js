// ═══════════════════════════════════════════════════════════════════════════════
// TRẠM 5a — KIỂM TRA DỮ LIỆU ĐẦU VÀO (middleware/validate.js)
//
// Gắn vào route dạng: validate(registerSchema) — chạy TRƯỚC handler.
// Nó kiểm tra "giỏ hàng" JSON khách gửi lên (req.body) theo luật zod:
//   • sai  → trả 400 kèm thông báo lỗi đầu tiên (KHÔNG vào handler)
//   • đúng → ghi đè req.body bằng dữ liệu ĐÃ CHUẨN HOÁ rồi next()
//
// Đây là "hàm trả về hàm": validate(schema) trả về một middleware.
// ═══════════════════════════════════════════════════════════════════════════════
function validate(schema) {
  return (req, res, next) => {
    // safeParse = "kiểm tra mà KHÔNG ném lỗi" → trả về { success, data hoặc error }
    const result = schema.safeParse(req.body ?? {}); // không có body thì coi như {} để báo lỗi rõ ràng

    if (!result.success) {
      const issue = result.error.issues[0]; // chỉ lấy lỗi ĐẦU TIÊN cho gọn
      const path = issue.path.length ? `${issue.path.join('.')}: ` : ''; // ví dụ "password: "
      return res.status(400).json({ error: `${path}${issue.message}` });
    }

    // QUAN TRỌNG: thay req.body bằng dữ liệu đã qua zod — zod còn BIẾN ĐỔI dữ liệu
    // (trim khoảng trắng, toLowerCase…) nên handler nhận được dữ liệu sạch, đã chuẩn hoá.
    req.body = result.data;
    next(); // hợp lệ → cho đi tiếp vào handler
  };
}

module.exports = { validate };
