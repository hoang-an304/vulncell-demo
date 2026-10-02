// ═══════════════════════════════════════════════════════════════════════════════
// CHẶNG 4 (phần 1) — REPUTATION & SIGNAL (services/reputation.js)
//
// Đây là nơi "tính điểm" từ bảng sổ điểm ReputationLedger:
//   • Reputation = tổng điểm CẢ ĐỜI
//   • Signal     = tổng điểm trong SIGNAL_WINDOW_DAYS ngày gần nhất (mặc định 365)
// Hai hàm đầu giống nhau y hệt, chỉ KHÁC phần điều kiện thời gian.
// ═══════════════════════════════════════════════════════════════════════════════
const prisma = require('../prisma');

// Cấu hình qua .env (có giá trị mặc định): cửa sổ signal = 365 ngày; "signal tốt" = >= 5.
const SIGNAL_WINDOW_DAYS = Number(process.env.SIGNAL_WINDOW_DAYS || 365);
const SIGNAL_GOOD = Number(process.env.SIGNAL_GOOD_THRESHOLD || 5);
const DAY_MS = 24 * 60 * 60 * 1000;

// Mốc bắt đầu cửa sổ signal: "bây giờ" trừ đi 365 ngày.
function signalWindowStart(now = new Date()) {
  return new Date(now.getTime() - SIGNAL_WINDOW_DAYS * DAY_MS);
}

// Reputation = SUM(points) cả đời. Signal = SUM(points) trong 365 ngày gần nhất.
async function getReputation(userId) {
  // aggregate = để DATABASE cộng giúp (SUM), thay vì kéo hết dòng về rồi cộng
  const agg = await prisma.reputationLedger.aggregate({
    where: { userId },
    _sum: { points: true },
  });
  return agg._sum.points || 0; // chưa có dòng nào -> 0
}

async function getSignal(userId) {
  const agg = await prisma.reputationLedger.aggregate({
    where: { userId, createdAt: { gte: signalWindowStart() } }, // gte = "từ mốc này trở lại đây"
    _sum: { points: true },
  });
  return agg._sum.points || 0;
}

// Bản dạng BATCH cho leaderboard — tránh N+1:
// thay vì SUM từng user một, gom tất cả userId vào MỘT query rồi trả về Map.
async function getReputationsForUsers(userIds) {
  if (userIds.length === 0) return new Map();
  const rows = await prisma.reputationLedger.groupBy({
    by: ['userId'],
    where: { userId: { in: userIds } },
    _sum: { points: true },
  });
  return new Map(rows.map((r) => [r.userId, r._sum.points || 0]));
}

async function getSignalsForUsers(userIds) {
  if (userIds.length === 0) return new Map();
  const rows = await prisma.reputationLedger.groupBy({
    by: ['userId'],
    where: { userId: { in: userIds }, createdAt: { gte: signalWindowStart() } },
    _sum: { points: true },
  });
  return new Map(rows.map((r) => [r.userId, r._sum.points || 0]));
}

// Tổng TIỀN THƯỞNG (bounty) mỗi user — cho thẻ thống kê profile/leaderboard.
// Lưu ý: đọc từ cột Report.bounty, KHÔNG phải từ ledger.
async function getTotalBountiesForUsers(userIds) {
  if (userIds.length === 0) return new Map();
  const rows = await prisma.report.groupBy({
    by: ['reporterId'],
    where: { reporterId: { in: userIds }, bounty: { not: null } },
    _sum: { bounty: true },
  });
  return new Map(rows.map((r) => [r.reporterId, r._sum.bounty || 0]));
}

// Giới hạn NỘP report mỗi ngày theo Signal:
//   Signal < 0   -> 0 lượt/ngày (bị KHOÁ nộp)
//   Signal 0..4  -> 1 lượt/ngày
//   Signal >= 5  -> KHÔNG giới hạn (Infinity)
function dailyLimitForSignal(signal) {
  if (signal >= SIGNAL_GOOD) return Infinity;
  if (signal >= 0) return 1;
  return 0;
}

module.exports = {
  SIGNAL_WINDOW_DAYS,
  SIGNAL_GOOD,
  signalWindowStart,
  getReputation,
  getSignal,
  getReputationsForUsers,
  getSignalsForUsers,
  getTotalBountiesForUsers,
  dailyLimitForSignal,
};
