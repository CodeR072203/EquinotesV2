// /var/www/html/EquinotesV2/frontend/src/LoginPage.tsx
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./LoginPage.css";

type AgentPayload = {
  publicId?: string;
  email?: string | null;
  username?: string;
};

type LoginResponse =
  | { token: string; agent?: AgentPayload; error?: never }
  | { error: string; token?: never };

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

      navigate("/app");
    } catch (err) {
      console.error("Login error:", err);
      setError("Network error while logging in");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAccount = () => {
    navigate("/register");
  };

  const handleGoogleLogin = () => {
    console.log("Login with Google (not implemented)");
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

        <div className="divider">
          <span>or</span>
        </div>

        <button type="button" className="google-button" onClick={handleGoogleLogin}>
          Login with Google
        </button>
      </div>
    </div>
  );
};

export default LoginPage;
