// ═══════════════════════════════════════════════════════════════════════════════
// TRẠM 1 — ĐIỂM KHỞI ĐỘNG (file này chạy ĐẦU TIÊN khi bật backend)
//
// Khi bạn gõ `npm run dev` → nodemon → node src/server.js → file này chạy từ trên xuống.
// Nó chỉ làm 4 việc:
//   1. Đọc "sổ cấu hình" .env (DATABASE_URL, JWT_SECRET, PORT, REDIS_URL…)
//   2. Lấy "bộ khung web" đã lắp sẵn ở app.js
//   3. Thử nối Redis (bộ nhớ tạm) — KHÔNG đứng chờ
//   4. Mở cổng (port) để bắt đầu nhận request
// ═══════════════════════════════════════════════════════════════════════════════

// (1) Đọc file backend/.env rồi nhét các thông số vào bộ nhớ (đọc ra bằng process.env.TÊN)
require('dotenv').config();
const app = require('./app'); // (2) "bộ khung web" (các cửa + phòng chức năng) đã lắp ở app.js
const { connectRedis } = require('./redis'); // (3) hàm nối tới Redis

const PORT = process.env.PORT || 4000; // "số kênh" của server; .env không có PORT thì mặc định 4000

// (3) Nối Redis nhưng KHÔNG dùng `await` (không đứng chờ):
//     thư viện Redis thử kết nối lại MÃI MÃI, nên nếu Redis chết mà mình đứng chờ
//     thì server sẽ không bao giờ mở được cổng.
//     Nhờ vậy: Redis chết server vẫn sống — chậm hơn thôi (đọc thẳng Postgres, rate limit cho qua).
connectRedis();

// (4) Mở cổng và bắt đầu nhận request. Hàm `() => {...}` là "callback":
//     chỉ chạy khi cổng đã mở thành công, lúc đó mới in dòng log.
app.listen(PORT, () => {
  console.log(`VulnCell API running on http://localhost:${PORT}`);
}).on('error', (err) => {
  // (5) Lỗi hay gặp khi dev: cổng đang bị server cũ chiếm.
  //     Cổng giống "số kênh" — chỉ 1 chương trình được dùng 1 cổng tại một thời điểm.
  //     Server cũ còn chạy thì server mới mở cổng sẽ lỗi "EADDRINUSE" (địa chỉ đang được dùng).
  //     Thay vì crash khó hiểu, in hướng dẫn xử lý.
  if (err.code === 'EADDRINUSE') {
    console.error(`\n[!] Port ${PORT} đang bị tiến trình khác chiếm (server cũ chưa dừng).`);
    console.error('    Cách xử lý:');
    console.error('      - Dừng server cũ: bấm Ctrl+C ở cửa sổ đang chạy nó, hoặc');
    console.error('      - Chạy:  npm run kill:api   (từ thư mục gốc project)');
    process.exit(1); // thoát chương trình, mã 1 = thoát vì có lỗi
  }
  throw err; // lỗi khác thì cứ ném ra cho thấy rõ ràng
});
