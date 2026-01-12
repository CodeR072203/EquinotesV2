// /var/www/html/EquinotesV2/frontend/src/RegisterPage.tsx
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./LoginPage.css";

type AgentPayload = {
  publicId?: string;
  email?: string | null;
  username?: string;
};

type RegisterResponse =
  | { token: string; agent?: AgentPayload; error?: never }
  | { error: string; token?: never };

const RegisterPage: React.FC = () => {
  const navigate = useNavigate();

  // UI fields: name, email, password
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Optional confirm
  const [confirmPassword, setConfirmPassword] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Backend requires username. Derive from email local part.
  const deriveUsername = (emailAddr: string) => {
    const local = (emailAddr.split("@")[0] || "").trim();
    const cleaned = local.replace(/[^a-zA-Z0-9._-]/g, "");
    return cleaned || `user${Date.now()}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (loading) return;
    setError(null);
    setSuccess(null);

    const trimmedName = name.trim();
    const trimmedEmail = email.trim().toLowerCase();

    if (!trimmedName) {
      setError("Name is required");
      return;
    }

    if (!trimmedEmail) {
      setError("Email is required");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    if (confirmPassword && password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);

    try {
      const username = deriveUsername(trimmedEmail);

      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          email: trimmedEmail,
          password,
        }),
      });

      const rawText = await res.text();
      let data: RegisterResponse | null = null;

      try {
        data = rawText ? (JSON.parse(rawText) as RegisterResponse) : null;
      } catch {
        data = null;
      }

      if (!res.ok) {
        const msg =
          (data && "error" in data && typeof data.error === "string" && data.error) ||
          `Registration failed (HTTP ${res.status})`;
        setError(msg);
        return;
      }

      if (!data || !("token" in data) || typeof data.token !== "string" || data.token.length === 0) {
        setError("Registration failed: invalid response from server");
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

      setSuccess("Account created. Redirecting...");
      navigate("/app");
    } catch (err) {
      console.error("Register error:", err);
      setError("Network error while registering");
    } finally {
      setLoading(false);
    }
  };

  const goToLogin = () => {
    navigate("/login");
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <h1 className="login-title">Create Account</h1>

        <form onSubmit={handleSubmit} className="login-form">
          <label className="login-label">
            Name
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="login-input"
              required
              autoComplete="name"
            />
          </label>

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
              autoComplete="new-password"
            />
          </label>

          <label className="login-label">
            Confirm password
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="login-input"
              autoComplete="new-password"
            />
          </label>

          {error && <div className="login-error">{error}</div>}
          {success && <div className="login-success">{success}</div>}

          <button type="submit" className="login-button" disabled={loading}>
            {loading ? "Creating account..." : "Create account"}
          </button>
        </form>

        <button type="button" className="link-button" onClick={goToLogin}>
          Back to login
        </button>
      </div>
    </div>
  );
};

export default RegisterPage;
