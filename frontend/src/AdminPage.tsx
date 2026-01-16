// /var/www/html/EquinotesV2/frontend/src/AdminPage.tsx

import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

type PendingUser = {
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

export default function AdminPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<PendingUser[]>([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

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
      const res = await fetch("/api/admin/users/pending", {
        headers: { Authorization: `Bearer ${token}` },
      });

      const data: unknown = await res.json().catch(() => null);

      if (res.status === 401) {
        const msg = getErrorMessage(data, "Unauthorized. Please log in again.");
        console.error("Admin auth failed (401):", msg);
        setErr(msg);

        // Keep existing behavior (redirect), but do it after setting the error.
        // This makes the real cause visible instead of looking like "nothing happened".
        window.setTimeout(() => {
          redirectToLogin();
        }, 0);
        return;
      }

      if (res.status === 403) {
        setErr("Forbidden: admin access required.");
        setRows([]);
        return;
      }

      if (!res.ok) {
        setErr(getErrorMessage(data, "Failed to load pending users."));
        setRows([]);
        return;
      }

      setRows(Array.isArray(data) ? (data as PendingUser[]) : []);
    } catch {
      setErr("Network error loading pending users.");
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
          const msg = getErrorMessage(data, "Unauthorized. Please log in again.");
          console.error("Admin approve auth failed (401):", msg);
          setErr(msg);
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

        setRows((prev) => prev.filter((u) => u.id !== id));
      } catch {
        setErr("Network error approving user.");
      }
    },
    [redirectToLogin]
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
          const msg = getErrorMessage(data, "Unauthorized. Please log in again.");
          console.error("Admin deny auth failed (401):", msg);
          setErr(msg);
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

        setRows((prev) => prev.filter((u) => u.id !== id));
      } catch {
        setErr("Network error denying user.");
      }
    },
    [redirectToLogin]
  );

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div style={{ padding: 20 }}>
      <h2>Admin: Account Verification</h2>

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
        <div>No pending users.</div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ccc", padding: 8 }}>ID</th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ccc", padding: 8 }}>Name</th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ccc", padding: 8 }}>Email</th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ccc", padding: 8 }}>Created</th>
              <th style={{ borderBottom: "1px solid #ccc", padding: 8 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id}>
                <td style={{ borderBottom: "1px solid #eee", padding: 8 }}>{u.id}</td>
                <td style={{ borderBottom: "1px solid #eee", padding: 8 }}>{u.full_name || "—"}</td>
                <td style={{ borderBottom: "1px solid #eee", padding: 8 }}>{u.email}</td>
                <td style={{ borderBottom: "1px solid #eee", padding: 8 }}>
                  {new Date(u.created_at).toLocaleString()}
                </td>
                <td style={{ borderBottom: "1px solid #eee", padding: 8, textAlign: "center" }}>
                  <button onClick={() => approve(u.id)} style={{ marginRight: 8 }}>
                    Approve
                  </button>
                  <button onClick={() => deny(u.id)}>Deny</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
