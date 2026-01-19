import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

type AdminUserRow = {
  id: number;
  email: string;
  full_name: string | null;
  created_at: string;
  status: "pending" | "approved" | "denied";
  role: "user" | "admin";
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
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const selfId = useMemo(() => safeReadSelfId(), []);

  const redirectToLogin = useCallback(() => {
    localStorage.removeItem("token");
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

      setRows(Array.isArray(data) ? (data as AdminUserRow[]) : []);
    } catch {
      setErr("Network error loading users.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [navigate, redirectToLogin]);

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

        // Refresh list so status updates everywhere
        load();
      } catch {
        setErr("Network error approving user.");
      }
    },
    [redirectToLogin, load]
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
      } catch {
        setErr("Network error deleting user.");
      }
    },
    [redirectToLogin, selfId]
  );

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div style={{ padding: 20 }}>
      <h2>Admin: Users</h2>

      <div style={{ marginBottom: 12 }}>
        <button onClick={load} disabled={loading}>
          {loading ? "Loading..." : "Refresh"}
        </button>
      </div>

      {err ? (
        <div style={{ background: "#fee", padding: 10, border: "1px solid #f99", marginBottom: 12 }}>
          <b>Error:</b> {err}
        </div>
      ) : null}

      {rows.length === 0 ? (
        <div>No users found.</div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
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
                  <td style={{ borderBottom: "1px solid #eee", padding: 8 }}>{u.status}</td>
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
    </div>
  );
}
