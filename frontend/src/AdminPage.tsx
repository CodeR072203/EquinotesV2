// var/www/html/EquinotesV2/frontend/src/AdminPage.tsx

import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

type AdminUserRow = {
  id: number;
  email: string;
  full_name: string | null;
  created_at: string;
  status: "pending" | "approved" | "denied";
  role: "user" | "admin";
  approved_at?: string | null;
  denied_at?: string | null;
  denied_reason?: string | null;
  is_agent?: 0 | 1;
};

type AdminAgentRow = {
  id: number;
  username: string;
  display_name: string | null;
  email: string;
  email_verified: 0 | 1;
  is_active: 0 | 1;
  created_at: string;
  updated_at: string;
  public_id: string;
};

type ApiError = { error?: string };

function getErrorMessage(data: unknown, fallback: string) {
  if (data && typeof data === "object") {
    const maybe = data as ApiError;
    if (typeof maybe.error === "string" && maybe.error.trim().length > 0) return maybe.error;
  }
  return fallback;
}

function safeReadSelfId(): number | null {
  try {
    const raw = localStorage.getItem("user");
    if (!raw) return null;

    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;

    const obj = parsed as Record<string, unknown>;
    return typeof obj.id === "number" ? obj.id : null;
  } catch {
    return null;
  }
}

export default function AdminPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<AdminUserRow[]>([]);
  const [agents, setAgents] = useState<AdminAgentRow[]>([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingAgents, setLoadingAgents] = useState(false);

  const selfId = useMemo(() => safeReadSelfId(), []);

  const redirectToLogin = useCallback(() => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/login", { replace: true });
  }, [navigate]);

  const logout = useCallback(() => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/login", { replace: true });
  }, [navigate]);

  const load = useCallback(async () => {
    setErr("");
    setLoading(true);

    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/login", { replace: true });
      return;
    }

    try {
      // Load ALL users (approved/denied/pending) so admin can delete denied users and reuse emails
      const res = await fetch("/api/admin/users", {
        headers: { Authorization: `Bearer ${token}` },
      });

      const data: unknown = await res.json().catch(() => null);

      if (res.status === 401) {
        const msg = getErrorMessage(data, "Unauthorized. Please log in again.");
        setErr(msg);
        window.setTimeout(() => redirectToLogin(), 0);
        return;
      }

      if (res.status === 403) {
        setErr("Forbidden: admin access required.");
        setRows([]);
        return;
      }

      if (!res.ok) {
        setErr(getErrorMessage(data, "Failed to load users."));
        setRows([]);
        return;
      }

      const list = Array.isArray(data) ? (data as AdminUserRow[]) : [];
      // Hide non-admin approved users once they are already agents (clean UI)
      const filtered = list.filter((u) => {
        if (u.role === "admin") return true;
        if (u.status === "pending") return true;
        if (u.status === "denied") return true;
        if (u.status === "approved") return !(u.is_agent === 1);
        return true;
      });

      setRows(filtered);
    } catch {
      setErr("Network error loading users.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [navigate, redirectToLogin]);

  const loadAgents = useCallback(async () => {
    setErr("");
    setLoadingAgents(true);

    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/login", { replace: true });
      return;
    }

    try {
      const res = await fetch("/api/admin/agents", {
        headers: { Authorization: `Bearer ${token}` },
      });

      const data: unknown = await res.json().catch(() => null);

      if (res.status === 401) {
        const msg = getErrorMessage(data, "Unauthorized. Please log in again.");
        setErr(msg);
        window.setTimeout(() => redirectToLogin(), 0);
        return;
      }

      if (res.status === 403) {
        setErr("Forbidden: admin access required.");
        setAgents([]);
        return;
      }

      if (!res.ok) {
        setErr(getErrorMessage(data, "Failed to load agents."));
        setAgents([]);
        return;
      }

      setAgents(Array.isArray(data) ? (data as AdminAgentRow[]) : []);
    } catch {
      setErr("Network error loading agents.");
      setAgents([]);
    } finally {
      setLoadingAgents(false);
    }
  }, [navigate, redirectToLogin]);

  const setAgentActive = useCallback(
    async (id: number, is_active: boolean) => {
      const token = localStorage.getItem("token");
      if (!token) return;

      setErr("");
      try {
        const res = await fetch(`/api/admin/agents/${id}/active`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ is_active }),
        });

        const data: unknown = await res.json().catch(() => null);

        if (res.status === 401) {
          setErr(getErrorMessage(data, "Unauthorized. Please log in again."));
          window.setTimeout(() => redirectToLogin(), 0);
          return;
        }
        if (res.status === 403) {
          setErr("Forbidden: admin access required.");
          return;
        }
        if (!res.ok) {
          setErr(getErrorMessage(data, "Failed to update agent."));
          return;
        }

        loadAgents();
      } catch {
        setErr("Network error updating agent.");
      }
    },
    [redirectToLogin, loadAgents]
  );

  const approve = useCallback(
    async (id: number) => {
      const token = localStorage.getItem("token");
      if (!token) return;

      setErr("");
      try {
        const res = await fetch(`/api/admin/users/${id}/approve`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({}),
        });

        const data: unknown = await res.json().catch(() => null);

        if (res.status === 401) {
          setErr(getErrorMessage(data, "Unauthorized. Please log in again."));
          window.setTimeout(() => redirectToLogin(), 0);
          return;
        }
        if (res.status === 403) {
          setErr("Forbidden: admin access required.");
          return;
        }
        if (!res.ok) {
          setErr(getErrorMessage(data, "Approve failed."));
          return;
        }

        // Refresh users and agents (approval now creates/updates agent)
        load();
        loadAgents();
      } catch {
        setErr("Network error approving user.");
      }
    },
    [redirectToLogin, load, loadAgents]
  );

  const deny = useCallback(
    async (id: number) => {
      const token = localStorage.getItem("token");
      if (!token) return;

      const reason = prompt("Reason for denial? (optional)") || "";
      setErr("");
      try {
        const res = await fetch(`/api/admin/users/${id}/deny`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ reason }),
        });

        const data: unknown = await res.json().catch(() => null);

        if (res.status === 401) {
          setErr(getErrorMessage(data, "Unauthorized. Please log in again."));
          window.setTimeout(() => redirectToLogin(), 0);
          return;
        }
        if (res.status === 403) {
          setErr("Forbidden: admin access required.");
          return;
        }
        if (!res.ok) {
          setErr(getErrorMessage(data, "Deny failed."));
          return;
        }

        load();
      } catch {
        setErr("Network error denying user.");
      }
    },
    [redirectToLogin, load]
  );

  const removeUser = useCallback(
    async (id: number) => {
      const token = localStorage.getItem("token");
      if (!token) return;

      if (selfId !== null && id === selfId) {
        setErr("You cannot delete your own admin account.");
        return;
      }

      const ok = window.confirm(`Delete user #${id}? This cannot be undone.`);
      if (!ok) return;

      setErr("");
      try {
        const res = await fetch(`/api/admin/users/${id}`, {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        const data: unknown = await res.json().catch(() => null);

        if (res.status === 401) {
          setErr(getErrorMessage(data, "Unauthorized. Please log in again."));
          window.setTimeout(() => redirectToLogin(), 0);
          return;
        }
        if (res.status === 403) {
          setErr("Forbidden: admin access required.");
          return;
        }
        if (!res.ok) {
          setErr(getErrorMessage(data, "Delete failed."));
          return;
        }

        setRows((prev) => prev.filter((u) => u.id !== id));
        // If delete removed a linked agent too, refresh agents list
        loadAgents();
      } catch {
        setErr("Network error deleting user.");
      }
    },
    [redirectToLogin, selfId, loadAgents]
  );

  useEffect(() => {
    load();
    loadAgents();
  }, [load, loadAgents]);

  const pendingCount = rows.filter((u) => u.status === "pending").length;

  return (
    <div style={{ padding: 20 }}>
      <h2>Admin</h2>

      <div style={{ marginBottom: 12 }}>
        <button onClick={load} disabled={loading}>
          {loading ? "Loading..." : "Refresh Users"}
        </button>
        <button onClick={loadAgents} disabled={loadingAgents} style={{ marginLeft: 8 }}>
          {loadingAgents ? "Loading..." : "Refresh Agents"}
        </button>
        <button onClick={logout} style={{ marginLeft: 8 }}>
          Logout
        </button>
      </div>

      {err ? (
        <div style={{ background: "#fee", padding: 10, border: "1px solid #f99", marginBottom: 12 }}>
          <b>Error:</b> {err}
        </div>
      ) : null}

      <h3>Users ({pendingCount} pending)</h3>
      {rows.length === 0 ? (
        <div>No users found.</div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 24 }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ccc", padding: 8 }}>ID</th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ccc", padding: 8 }}>Name</th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ccc", padding: 8 }}>Email</th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ccc", padding: 8 }}>Role</th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ccc", padding: 8 }}>Status</th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ccc", padding: 8 }}>Created</th>
              <th style={{ borderBottom: "1px solid #ccc", padding: 8 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => {
              const isSelf = selfId !== null && u.id === selfId;
              return (
                <tr key={u.id}>
                  <td style={{ borderBottom: "1px solid #eee", padding: 8 }}>{u.id}</td>
                  <td style={{ borderBottom: "1px solid #eee", padding: 8 }}>{u.full_name || "—"}</td>
                  <td style={{ borderBottom: "1px solid #eee", padding: 8 }}>{u.email}</td>
                  <td style={{ borderBottom: "1px solid #eee", padding: 8 }}>{u.role}</td>
                  <td style={{ borderBottom: "1px solid #eee", padding: 8 }}>
                    {u.status}
                    {u.status === "approved" && u.is_agent === 1 ? " (agent)" : ""}
                  </td>
                  <td style={{ borderBottom: "1px solid #eee", padding: 8 }}>
                    {new Date(u.created_at).toLocaleString()}
                  </td>
                  <td style={{ borderBottom: "1px solid #eee", padding: 8, textAlign: "center" }}>
                    {u.status === "pending" ? (
                      <>
                        <button onClick={() => approve(u.id)} style={{ marginRight: 8 }}>
                          Approve
                        </button>
                        <button onClick={() => deny(u.id)} style={{ marginRight: 8 }}>
                          Deny
                        </button>
                      </>
                    ) : null}
                    <button
                      onClick={() => removeUser(u.id)}
                      disabled={isSelf}
                      title={isSelf ? "Cannot delete self" : ""}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <h3>Agents</h3>
      {agents.length === 0 ? (
        <div>No agents found.</div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ccc", padding: 8 }}>ID</th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ccc", padding: 8 }}>Username</th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ccc", padding: 8 }}>Display Name</th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ccc", padding: 8 }}>Email</th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ccc", padding: 8 }}>Verified</th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ccc", padding: 8 }}>Active</th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ccc", padding: 8 }}>Created</th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ccc", padding: 8 }}>Updated</th>
              <th style={{ borderBottom: "1px solid #ccc", padding: 8 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {agents.map((a) => {
              const active = a.is_active === 1;
              const verified = a.email_verified === 1;
              return (
                <tr key={a.id}>
                  <td style={{ borderBottom: "1px solid #eee", padding: 8 }}>{a.id}</td>
                  <td style={{ borderBottom: "1px solid #eee", padding: 8 }}>{a.username}</td>
                  <td style={{ borderBottom: "1px solid #eee", padding: 8 }}>{a.display_name || "—"}</td>
                  <td style={{ borderBottom: "1px solid #eee", padding: 8 }}>{a.email}</td>
                  <td style={{ borderBottom: "1px solid #eee", padding: 8 }}>{verified ? "Yes" : "No"}</td>
                  <td style={{ borderBottom: "1px solid #eee", padding: 8 }}>{active ? "Active" : "Inactive"}</td>
                  <td style={{ borderBottom: "1px solid #eee", padding: 8 }}>
                    {new Date(a.created_at).toLocaleString()}
                  </td>
                  <td style={{ borderBottom: "1px solid #eee", padding: 8 }}>
                    {new Date(a.updated_at).toLocaleString()}
                  </td>
                  <td style={{ borderBottom: "1px solid #eee", padding: 8, textAlign: "center" }}>
                    <button onClick={() => setAgentActive(a.id, !active)}>
                      {active ? "Deactivate" : "Activate"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
