// /var/www/html/EquinotesV2/frontend/src/main.tsx
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import "./index.css";

import AdminRouteGuard from "./AdminRouteGuard";

import App from "./App.tsx";
import LoginPage from "./LoginPage.tsx";
import RegisterPage from "./RegisterPage.tsx";
import ProfilePage from "./ProfilePage.tsx";
import HistoryPage from "./HistoryPage.tsx";

createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <Routes>
      <Route path="/admin" element={<AdminRouteGuard />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/app" element={<App />} />
      <Route path="/profile" element={<ProfilePage />} />
      <Route path="/profile/history" element={<HistoryPage />} />

      {/* root */}
      <Route path="/" element={<Navigate to="/login" replace />} />

      {/* keep this LAST */}
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  </BrowserRouter>
);
