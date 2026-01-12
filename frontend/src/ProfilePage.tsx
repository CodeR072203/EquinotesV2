// /var/www/html/EquinotesV2/frontend/src/ProfilePage.tsx
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "./LoginPage.css";

type AgentStored = {
  publicId?: string;
  email?: string;
  username?: string;
};

function safeReadAgent(): AgentStored | null {
  try {
    const raw = localStorage.getItem("agent");
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;

    const obj = parsed as Record<string, unknown>;
    const agent: AgentStored = {};

    if (typeof obj.publicId === "string") agent.publicId = obj.publicId;
    if (typeof obj.email === "string") agent.email = obj.email;
    if (typeof obj.username === "string") agent.username = obj.username;

    return agent;
  } catch {
    return null;
  }
}

export default function ProfilePage() {
  const navigate = useNavigate();

  // Guard: if no token, go to login
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) navigate("/login", { replace: true });
  }, [navigate]);

  const agent = safeReadAgent();
  const publicIdFromStorage = localStorage.getItem("agentPublicId") || "";

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("agent");
    localStorage.removeItem("agentPublicId");
    navigate("/login", { replace: true });
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <h1 className="login-title">Profile</h1>

        <div style={{ marginBottom: 12 }}>
          <div>
            <b>Username:</b> {agent?.username ?? "-"}
          </div>
          <div>
            <b>Email:</b> {agent?.email ?? "-"}
          </div>
          <div>
            <b>Public ID:</b> {agent?.publicId ?? publicIdFromStorage ?? "-"}
          </div>
        </div>

        <button
          className="login-button"
          type="button"
          onClick={() => navigate("/profile/history")}
        >
          View history
        </button>

        <button className="link-button" type="button" onClick={() => navigate("/app")}>
          Back to app
        </button>

        <button className="link-button" type="button" onClick={logout}>
          Logout
        </button>
      </div>
    </div>
  );
}
