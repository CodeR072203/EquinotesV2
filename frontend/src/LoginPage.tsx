// /var/www/html/EquinotesV2/frontend/src/LoginPage.tsx
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./LoginPage.css";

type AgentPayload = {
  publicId?: string;
  email?: string | null;
  username?: string;
};

type UserPayload = {
  id: number;
  email: string;
  fullName?: string | null;
  role: "user" | "admin";
  status: "pending" | "approved" | "denied";
};

type LoginResponse =
  | { token: string; agent?: AgentPayload; user?: UserPayload; error?: never }
  | { error: string; token?: never };

type JwtPayload = {
  sub?: string | number;
  email?: string | null;
  username?: string;
  role?: "user" | "admin";
  status?: "pending" | "approved" | "denied";
  exp?: number;
  iat?: number;
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
    const status =
      parsed.status === "approved" || parsed.status === "pending" || parsed.status === "denied"
        ? parsed.status
        : undefined;

    const out: JwtPayload = {
      sub: typeof parsed.sub === "string" || typeof parsed.sub === "number" ? parsed.sub : undefined,
      email: typeof parsed.email === "string" ? parsed.email : null,
      username: typeof parsed.username === "string" ? parsed.username : undefined,
      role,
      status,
      exp: typeof parsed.exp === "number" ? parsed.exp : undefined,
      iat: typeof parsed.iat === "number" ? parsed.iat : undefined,
    };

    return out;
  } catch {
    return null;
  }
}

const LoginPage: React.FC = () => {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (loading) return;
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });

      const rawText = await res.text();
      let data: LoginResponse | null = null;

      try {
        data = rawText ? (JSON.parse(rawText) as LoginResponse) : null;
      } catch {
        data = null;
      }

      if (!res.ok) {
        const msg =
          (data && "error" in data && typeof data.error === "string" && data.error) ||
          `Login failed (HTTP ${res.status})`;
        setError(msg);
        return;
      }

      if (!data || !("token" in data) || typeof data.token !== "string" || data.token.length === 0) {
        setError("Login failed: invalid response from server");
        return;
      }

      localStorage.setItem("token", data.token);

      // Store agent + publicId (if present)
      if ("agent" in data && data.agent && typeof data.agent === "object") {
        const agent = data.agent as AgentPayload;

        try {
          localStorage.setItem("agent", JSON.stringify(agent));
        } catch {
          // ignore
        }

        if (typeof agent.publicId === "string" && agent.publicId.length > 0) {
          localStorage.setItem("agentPublicId", agent.publicId);
        } else {
          localStorage.removeItem("agentPublicId");
        }
      } else {
        localStorage.removeItem("agent");
        localStorage.removeItem("agentPublicId");
      }

      // Store user (admin/users table) if present
      if ("user" in data && data.user && typeof data.user === "object") {
        try {
          localStorage.setItem("user", JSON.stringify(data.user));
        } catch {
          // ignore
        }

        if (data.user.role === "admin") {
          navigate("/admin", { replace: true });
          return;
        }
      } else {
        localStorage.removeItem("user");
      }

      // Fallback: decide by JWT role even if backend didn't return `user`
      const payload = decodeJwtPayload(data.token);
      if (payload?.role === "admin") {
        navigate("/admin", { replace: true });
        return;
      }

      navigate("/app", { replace: true });
    } catch (err: unknown) {
      console.error("Login error:", err);
      setError("Network error while logging in");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAccount = () => {
    navigate("/register");
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <h1 className="login-title">Login</h1>

        <form onSubmit={handleSubmit} className="login-form">
          <label className="login-label">
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="login-input"
              required
              autoComplete="email"
            />
          </label>

          <label className="login-label">
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="login-input"
              required
              autoComplete="current-password"
            />
          </label>

          {error && <div className="login-error">{error}</div>}

          <button type="submit" className="login-button" disabled={loading}>
            {loading ? "Logging in..." : "Login"}
          </button>
        </form>

        <button type="button" className="link-button" onClick={handleCreateAccount}>
          Create account
        </button>


      </div>
    </div>
  );
};

export default LoginPage;
