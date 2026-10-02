// ═══════════════════════════════════════════════════════════════════════════════
// CHẶNG 6 (phần 4) — ĐIỂM KHỞI ĐỘNG FRONTEND (main.jsx)
//
// Lồng các "nhà cung cấp" (Provider) theo thứ tự — ngoài cùng bọc trong cùng:
//   QueryClientProvider  -> cache dữ liệu API (react-query: retry, staleTime…)
//     BrowserRouter      -> điều hướng URL cho React Router
//       AuthProvider     -> ai đang đăng nhập (gọi /auth/me)
//         App            -> các route (App.jsx)
// ═══════════════════════════════════════════════════════════════════════════════
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { AuthProvider } from './auth/AuthContext';
import '@fontsource-variable/figtree'; // font Figtree nhúng sẵn (offline)
import './index.css'; // Tailwind + theme (màu gold, keyframes…)

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1, // lỗi thì thử lại 1 lần
      refetchOnWindowFocus: false, // không tự gọi lại mỗi lần quay lại tab
      staleTime: 30_000, // dữ liệu "tươi" 30 giây
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);
