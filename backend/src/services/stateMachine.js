// ═══════════════════════════════════════════════════════════════════════════════
// CHẶNG 3 (phần 1) — STATE MACHINE: "luật chơi" của report (services/stateMachine.js)
//
// File này KHÔNG đụng tới database — nó chỉ chứa LUẬT:
//   • Report được đi từ trạng thái nào sang trạng thái nào
//   • Vào mỗi trạng thái "disclosed" thì reporter được +/− bao nhiêu điểm
//   • Khi nào được đặt severity / cấp bounty
// Nơi THỰC THI luật (ghi DB, transaction) là routes/reports.js (POST /:id/actions).
// ═══════════════════════════════════════════════════════════════════════════════
const HttpError = require('../lib/httpError');

// "Disclosed" = đã kết luận → report ĐÓNG, không nhận thêm hành động nào nữa.
const DISCLOSED_STATES = ['RESOLVED', 'DUPLICATE', 'INFORMATIVE', 'NOT_APPLICABLE', 'SPAM'];
// Tất cả trạng thái có thể có (để phát hiện "state lạ" do client gửi lên).
const ALL_STATES = ['NONE', 'PENDING', 'TRIAGED', ...DISCLOSED_STATES];

// Nhóm disclosed nhưng KHÔNG spam — dùng cho hiển thị công khai.
// (SPAM là riêng tư: chỉ chủ nick và admin thấy)
const PUBLIC_STATES = DISCLOSED_STATES.filter((s) => s !== 'SPAM');

// BẢNG CHUYỂN TRẠNG THÁI: khóa bên trái = đang ở state này,
// mảng bên phải = các state được phép đi TỚI. Chỉ đi TIẾN, không quay ngược.
// Report tạo mới luôn là PENDING. PENDING -> SPAM là "làn đường tắt" cho spam
// rõ ràng (bỏ qua triage). Đã disclosed thì không có trong bảng = đóng.
const ALLOWED_TRANSITIONS = {
  NONE: ['PENDING', 'TRIAGED', 'SPAM'],
  PENDING: ['TRIAGED', 'SPAM'],
  TRIAGED: [...DISCLOSED_STATES],
};

// ĐIỂM thưởng/phạt cho reporter khi report rơi vào trạng thái disclosed.
// Sẽ được ghi vào ReputationLedger (xem Chặng 4) + cộng vào cột User.reputation.
const POINTS_BY_STATE = {
  RESOLVED: 7,
  DUPLICATE: 2,
  INFORMATIVE: 0,
  NOT_APPLICABLE: -5,
  SPAM: -10,
};

// "state >= TRIAGED" — severity chỉ được đặt từ TRIAGED trở đi.
const SEVERITY_STATES = new Set(['TRIAGED', ...DISCLOSED_STATES]);
// Bounty chỉ được cấp khi report đã RESOLVED.
const BOUNTY_STATES = new Set(['RESOLVED']);

function isDisclosed(state) {
  return DISCLOSED_STATES.includes(state);
}

// "NGƯỜI GÁC CỔNG": kiểm tra một hành động có hợp luật không.
// Vi phạm → NÉM HttpError(400, ...) chạy về error handler (xem Trạm 5).
// Hàm này CHỈ kiểm tra, KHÔNG ghi gì vào DB.
function assertActionAllowed(report, { newState, severity, bountyAmount }) {
  // (1) Report đã đóng thì cấm mọi hành động (kể cả comment)
  if (isDisclosed(report.state)) {
    throw new HttpError(400, 'Report is closed and no longer accepts new activities');
  }

  // Trạng thái SẼ CÓ sau hành động (không đổi state thì giữ nguyên)
  const stateAfter = newState || report.state;

  // (2) Nếu có đổi state: state phải hợp lệ và phải nằm trong bảng chuyển
  if (newState) {
    if (!ALL_STATES.includes(newState)) {
      throw new HttpError(400, `Unknown state: ${newState}`);
    }
    const allowed = ALLOWED_TRANSITIONS[report.state] || [];
    if (!allowed.includes(newState)) {
      throw new HttpError(400, `Invalid state transition: ${report.state} -> ${newState}`);
    }
  }

  // (3) Severity chỉ đặt được khi report đã TRIAGED hoặc đã disclosed
  if (severity && !SEVERITY_STATES.has(stateAfter)) {
    throw new HttpError(400, 'Severity can only be set when the report is TRIAGED or disclosed');
  }

  // (4) Bounty chỉ khi report RESOLVED
  if (bountyAmount !== undefined && bountyAmount !== null && !BOUNTY_STATES.has(stateAfter)) {
    throw new HttpError(400, 'Bounty can only be awarded when the report is RESOLVED');
  }
}


// Tra bảng điểm; state không có trong bảng (PENDING, TRIAGED…) → null.
function pointsForState(state) {
  return POINTS_BY_STATE[state] ?? null;
}

module.exports = {
  DISCLOSED_STATES,
  PUBLIC_STATES,
  ALL_STATES,
  ALLOWED_TRANSITIONS,
  POINTS_BY_STATE,
  isDisclosed,
  assertActionAllowed,
  pointsForState,
};
