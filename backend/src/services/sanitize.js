// ═══════════════════════════════════════════════════════════════════════════════
// CHẶNG 6 (phần 1) — SANITIZE: chống XSS ở TẦNG SERVER (services/sanitize.js)
//
// Nội dung report/comment là Markdown (text thuần). Kẻ tấn công có thể nhét thẻ HTML
// như <script>alert(1)</script> để "stored XSS" — lưu vào DB rồi hại người xem sau.
//
// Phòng thủ 2 tầng (defense in depth):
//   • TẦNG SERVER (file này): loại bỏ TOÀN BỘ thẻ HTML thô TRƯỚC KHI LƯU.
//   • TẦNG CLIENT (Markdown.jsx): react-markdown mặc định không render HTML thô,
//     cộng thêm rehype-sanitize làm lớp chặn thứ hai khi hiển thị.
// → Kể cả 1 tầng có lỗi, tầng còn lại vẫn chặn được.
// ═══════════════════════════════════════════════════════════════════════════════
const sanitizeHtml = require('sanitize-html');

// Cấu hình "diệt sạch HTML":
//   allowedTags: []      -> không cho phép BẤT KỲ thẻ nào
//   allowedAttributes: {} -> không cho phép thuộc tính nào
//   disallowedTagsMode: 'discard' -> thẻ bị xoá, giữ phần CHỮ bên trong
//   nonTextTags: [...]   -> riêng script/style/... bị xoá CẢ NỘI DUNG bên trong
const STRIP_ALL_HTML = {
  allowedTags: [],
  allowedAttributes: {},
  disallowedTagsMode: 'discard',
  // script/style/... bị xoá cả phần nội dung bên trong
  nonTextTags: ['script', 'style', 'textarea', 'option', 'noscript'],
};

// Dùng cho nội dung DÀI (details, comment) — vẫn giữ xuống dòng/ký tự Markdown.
function sanitizeMarkdown(text) {
  if (typeof text !== 'string') return text;
  return sanitizeHtml(text, STRIP_ALL_HTML);
}

// Dùng cho các ô NGẮN (target, weakness, cveId, shortDescription) — thêm .trim().
function sanitizePlainText(text) {
  if (typeof text !== 'string') return text;
  return sanitizeHtml(text, STRIP_ALL_HTML).trim();
}

module.exports = { sanitizeMarkdown, sanitizePlainText };
