// ═══════════════════════════════════════════════════════════════════════════════
// CHẶNG 6 (phần 6) — ĐIỀU HƯỚNG TRANG (App.jsx)
//
// 5 trang chính nằm trong <Layout /> (có navbar/rail/mobile menu):
//   /              Dashboard (danh sách report + filters)
//   /cases/:id     Case (chi tiết + timeline + Action Box)
//   /submit        Nộp report (bắt buộc đăng nhập)
//   /leaderboard   Bảng xếp hạng
//   /u/:username   Profile
// 2 trang ngoài Layout: /login, /register. Đường lạ -> về trang chủ.
// ═══════════════════════════════════════════════════════════════════════════════
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import Layout from './components/Layout';
import Spinner from './components/Spinner';
import DashboardPage from './pages/DashboardPage';
import CasePage from './pages/CasePage';
import SubmitPage from './pages/SubmitPage';
import LeaderboardPage from './pages/LeaderboardPage';
import ProfilePage from './pages/ProfilePage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';

// "Cửa gác" phía client: chưa đăng nhập thì đá về /login.
// - Đang tải /auth/me -> hiện spinner (tránh nháy trang)
// - Nhớ vị trí đang muốn vào (state.from) để đăng nhập xong quay lại
function RequireAuth({ children }) {
  const { user, isLoading } = useAuth();
  const location = useLocation();
  if (isLoading) {
    return (
      <div className="grid min-h-screen place-items-center">
        <Spinner size="lg" />
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<DashboardPage />} />
        <Route path="cases/:id" element={<CasePage />} />
        <Route
          path="submit"
          element={
            <RequireAuth>
              <SubmitPage />
            </RequireAuth>
          }
        />
        <Route path="leaderboard" element={<LeaderboardPage />} />
        <Route path="u/:username" element={<ProfilePage />} />
      </Route>
      <Route path="login" element={<LoginPage />} />
      <Route path="register" element={<RegisterPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
