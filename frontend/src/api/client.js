// ═══════════════════════════════════════════════════════════════════════════════
// CHẶNG 6 (phần 5) — GỌI API TỪ FRONTEND (api/client.js)
//
// Mọi request đi qua đường dẫn tương đối `/api/...`:
//   • DEV  : Vite proxy chuyển /api -> http://localhost:4000
//   • DEMO : nginx chuyển /api -> backend:4000 (nội bộ Docker)
// Nhờ vậy trình duyệt luôn thấy CÙNG origin -> không dính CORS, cookie tự gửi kèm.
// ═══════════════════════════════════════════════════════════════════════════════

// Lỗi có kèm mã HTTP — nơi khác (AuthContext) dựa vào err.status === 401 để biết "chưa đăng nhập".
export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export async function apiFetch(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'include', // QUAN TRỌNG: gửi kèm cookie phiên (thẻ đăng nhập)
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    /* body rỗng (ví dụ 204) */
  }

  if (!res.ok) {
    // Backend luôn trả lỗi dạng { error: "..." } -> lấy message đó cho UI hiển thị
    throw new ApiError(res.status, data?.error || `HTTP ${res.status}`);
  }
  return data;
}

// 3 "động từ" tiện dụng
export const api = {
  get: (path) => apiFetch(path),
  post: (path, body) => apiFetch(path, { method: 'POST', body }),
  patch: (path, body) => apiFetch(path, { method: 'PATCH', body }),
};

// Nối query params, bỏ các giá trị rỗng (undefined / null / '')
export function buildQuery(params) {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') qs.set(key, value);
  }
  const s = qs.toString();
  return s ? `?${s}` : '';
}
