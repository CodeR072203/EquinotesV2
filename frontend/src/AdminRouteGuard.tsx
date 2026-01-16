// /var/www/html/EquinotesV2/frontend/src/AdminRouteGuard.tsx
import { Navigate } from "react-router-dom";
import AdminPage from "./AdminPage";

type JwtPayload = {
  role?: "user" | "admin";
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function decodeJwtPayload(token: string): JwtPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;

    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4 ? "=".repeat(4 - (b64.length % 4)) : "";
    const json = atob(b64 + pad);

    const parsed: unknown = JSON.parse(json);
    if (!isRecord(parsed)) return null;

    const role = parsed.role === "admin" ? "admin" : parsed.role === "user" ? "user" : undefined;
    return { role };
  } catch {
    return null;
  }
}

export default function AdminRouteGuard() {
  const token = localStorage.getItem("token");
  if (!token) return <Navigate to="/login" replace />;

  const payload = decodeJwtPayload(token);
  if (payload?.role !== "admin") return <Navigate to="/app" replace />;

  return <AdminPage />;
}
