// ═══════════════════════════════════════════════════════════════════════════════
// CHẶNG 5 (phần 1) — RATE LIMIT 3 LỚP (middleware/rateLimit.js)
//
// Ba lớp bảo vệ, mỗi lớp chặn một kiểu lạm dụng khác nhau:
//   1) apiRateLimit  — mỗi IP tối đa N request / cửa sổ (chống spam/DoS toàn cục)
//   2) Login         — sai 5 lần/phút theo IP+username -> khoá 15 phút (chống dò mật khẩu)
//   3) Submit        — quota nộp/ngày tuỳ Signal (đã học ở Chặng 4)
// Tất cả đều "đếm" bằng Redis. Redis chết -> FAIL-OPEN (cho qua), để không chặn nhầm
// người dùng thật khi hệ thống phụ trợ gặp sự cố.
// ═══════════════════════════════════════════════════════════════════════════════
const { cacheGet, cacheSet, cacheDel, incrWithTtl, getTtl } = require('../redis');
const { getSignal, dailyLimitForSignal, SIGNAL_GOOD } = require('../services/reputation');
const prisma = require('../prisma');
const HttpError = require('../lib/httpError');

// Cấu hình lớp Login
const LOGIN_MAX_FAILURES = 5; // sai tối đa 5 lần…
const LOGIN_WINDOW_SECONDS = 60; // …trong vòng 60 giây…
const LOGIN_BLOCK_SECONDS = 15 * 60; // …thì bị khoá 15 phút

// Công tắc chung: bật RATE_LIMIT_DISABLED=true khi chạy load test (để không tự chặn công cụ đo)
function rateLimitDisabled() {
  return String(process.env.RATE_LIMIT_DISABLED).toLowerCase() === 'true';
}

// Lấy IP người gọi (Express điền sẵn; fallback socket)
function clientIp(req) {
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

// Tạo cặp key đếm theo IP + username (viết thường để "Admin" và "admin" là một)
function loginKeys(req, username) {
  const id = `${clientIp(req)}:${username.toLowerCase()}`;
  return { fail: `login:fail:${id}`, block: `login:block:${id}` };
}

// Gọi TRƯỚC khi kiểm tra mật khẩu. Ném 429 nếu IP+username đang bị khoá.
async function assertLoginAllowed(req, username) {
  if (rateLimitDisabled()) return;
  const { block } = loginKeys(req, username);
  const remaining = await getTtl(block); // còn bao nhiêu giây nữa mới hết khoá?
  if (remaining > 0) {
    throw new HttpError(
      429,
      `Too many failed login attempts. Try again in ${Math.ceil(remaining / 60)} minute(s)`
    );
  }
}

// Gọi khi SAI mật khẩu: tăng bộ đếm; đủ 5 lần -> tạo key "block" 15 phút.
async function recordLoginFailure(req, username) {
  if (rateLimitDisabled()) return;
  const { fail, block } = loginKeys(req, username);
  const count = await incrWithTtl(fail, LOGIN_WINDOW_SECONDS); // INCR + TTL 60s ở lần đầu
  if (count !== null && count >= LOGIN_MAX_FAILURES) {
    await cacheSet(block, '1', LOGIN_BLOCK_SECONDS);
    await cacheDel(fail); // đã khoá thì xoá bộ đếm sai
  }
}

// Gọi khi đăng nhập THÀNH CÔNG: xoá bộ đếm để lần sau không bị cộng dồn oan.
async function clearLoginFailures(req, username) {
  if (rateLimitDisabled()) return;
  const { fail } = loginKeys(req, username);
  await cacheDel(fail);
}

// ---------- Lớp 3: Giới hạn nộp report theo Signal (đã học ở Chặng 4) ----------

// Mốc 00:00 UTC của ngày hiện tại
function utcDayStart(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

// Còn bao nhiêu giây tới 00:00 UTC kế tiếp (để đặt TTL cho bộ đếm)
function secondsUntilUtcMidnight(now = new Date()) {
  const nextMidnight = utcDayStart(new Date(now.getTime() + 24 * 3600 * 1000));
  return Math.max(1, Math.floor((nextMidnight.getTime() - now.getTime()) / 1000));
}

// Tên key đếm lượt nộp: có NGÀY trong key -> sang ngày mới tự đếm lại từ 0.
function submitCountKey(userId, now = new Date()) {
  return `submit:count:${userId}:${utcDayStart(now).toISOString().slice(0, 10)}`;
}

// Đếm nhanh bằng Redis; miss thì đếm từ DB rồi cache lại tới hết ngày UTC.
async function getUsedToday(userId) {
  const key = submitCountKey(userId);
  const cached = await cacheGet(key);
  if (cached !== null) return Number(cached) || 0;

  const fromDb = await prisma.report.count({
    where: { reporterId: userId, createdAt: { gte: utcDayStart() } },
  });
  await cacheSet(key, String(fromDb), secondsUntilUtcMidnight());
  return fromDb;
}

// Ném HttpError 429 nếu đã dùng hết quota trong ngày.
async function assertCanSubmit(userId) {
  if (rateLimitDisabled()) return { signal: null, limit: Infinity, used: 0 };

  const signal = await getSignal(userId);
  const limit = dailyLimitForSignal(signal); // <0 -> 0; 0..4 -> 1; >=5 -> Infinity
  const used = await getUsedToday(userId);

  if (used >= limit) {
    const detail =
      limit === 0
        ? `Your signal is negative (${signal}) — submissions are temporarily blocked.`
        : `Daily submission limit reached (${used}/${limit} today, Signal ${signal} < ${SIGNAL_GOOD}).`;
    throw new HttpError(429, `${detail} Try again after 00:00 UTC.`);
  }
  return { signal, limit, used };
}

// Gọi SAU khi tạo report thành công: tăng bộ đếm lượt nộp của hôm nay.
async function recordSubmit(userId) {
  if (rateLimitDisabled()) return;
  await incrWithTtl(submitCountKey(userId), secondsUntilUtcMidnight());
}

// ---------- Lớp 1: Rate limit tổng quát theo IP cho toàn bộ /api (chống spam/DoS) ----------
// Fixed-window "đơn giản nhất có thể": key = IP + số thứ tự khung thời gian.
// Ví dụ 60s một khung: khung thứ 29.xxx.xxx nào đó — sang khung mới khách đếm lại từ 0.
const API_LIMIT_MAX = Number(process.env.RATE_LIMIT_API_MAX || 300);
const API_LIMIT_WINDOW_SECONDS = Number(process.env.RATE_LIMIT_API_WINDOW || 60);

async function apiRateLimit(req, res, next) {
  if (rateLimitDisabled()) return next();
  try {
    const windowId = Math.floor(Date.now() / (API_LIMIT_WINDOW_SECONDS * 1000));
    const key = `api:${clientIp(req)}:${windowId}`;
    const count = await incrWithTtl(key, API_LIMIT_WINDOW_SECONDS + 5);
    if (count === null) return next(); // Redis chết -> fail-open (cho qua)
    if (count > API_LIMIT_MAX) {
      const retry = API_LIMIT_WINDOW_SECONDS - Math.floor((Date.now() / 1000) % API_LIMIT_WINDOW_SECONDS);
      res.set('Retry-After', String(retry)); // nói cho client biết chờ bao lâu
      return res.status(429).json({ error: `Too many requests — try again in about ${retry}s.` });
    }
  } catch {
    /* fail-open: có lỗi bất ngờ cũng không chặn user */
  }
  next(); // qua được lớp 1 -> đi tiếp vào route
}

module.exports = {
  assertLoginAllowed,
  recordLoginFailure,
  clearLoginFailures,
  assertCanSubmit,
  recordSubmit,
  apiRateLimit,
};
