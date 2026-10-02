// ═══════════════════════════════════════════════════════════════════════════════
// CHẶNG 6 (phần 3) — QUẢN LÝ ĐĂNG NHẬP PHÍA FRONTEND (auth/AuthContext.jsx)
//
// Cả app biết "ai đang đăng nhập" nhờ Context này. Nó dùng react-query để:
//   • useQuery(['me'])  -> gọi GET /auth/me một lần rồi cache (staleTime 5 phút)
//   • login/logout      -> gọi API rồi cập nhật lại cache cho UI đổi ngay
// ═══════════════════════════════════════════════════════════════════════════════
import { createContext, useContext } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const queryClient = useQueryClient();

  // Gọi /auth/me để biết phiên đăng nhập (cookie gửi kèm tự động).
  // 401 = chưa đăng nhập -> trả null (KHÔNG coi là lỗi, tránh retry vô ích).
  const { data, isLoading } = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        return await api.get('/auth/me');
      } catch (err) {
        if (err.status === 401) return null; // chưa đăng nhập — không phải lỗi
        throw err;
      }
    },
    staleTime: 5 * 60 * 1000, // 5 phút coi như còn "tươi", không gọi lại liên tục
  });

  // identifier: email hoặc username
  const login = async (identifier, password) => {
    const user = await api.post('/auth/login', { email: identifier, password });
    // Đăng nhập xong -> đánh dấu cache ['me'] cũ để nó gọi lại (lấy user mới)
    await queryClient.invalidateQueries({ queryKey: ['me'] });
    return user;
  };

  const register = (payload) => api.post('/auth/register', payload);

  const logout = async () => {
    await api.post('/auth/logout');
    // Đặt user = null NGAY cho UI, không chờ refetch (queryClient.clear() một mình
    // không làm observer đang mount cập nhật -> đó là lý do bấm Logout bị "đơ").
    queryClient.setQueryData(['me'], null);
    // Dọn cache của các dữ liệu theo phiên đăng nhập (giữ lại đúng ['me'])
    queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
  };

  return (
    <AuthContext.Provider value={{ user: data ?? null, isLoading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

// Hook tiện dụng: component nào cần user thì gọi useAuth()
export function useAuth() {
  return useContext(AuthContext);
}
