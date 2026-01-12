// /var/www/html/EquinotesV2/frontend/src/HistoryPage.tsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, Download } from "lucide-react";
import "./App.css";
import { apiGet } from "./lib/api";
import type { ApiCall } from "./lib/api";

function buildTranscriptText(call: ApiCall): string {
  const combined = (call.combinedTranscript || "").trim();
  if (combined) return combined;

  const client = (call.clientTranscript || "").trim();
  const agent = (call.agentTranscript || "").trim();
  return ["=== CLIENT ===", client, "", "=== AGENT ===", agent, ""].join("\n");
}

function downloadTranscript(call: ApiCall) {
  const content = buildTranscriptText(call);
  const datePart = (call.startTime || "").slice(0, 10) || "unknown-date";
  const filename = `call-${call.id}-${datePart}.txt`;

  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();

  URL.revokeObjectURL(url);
}

function errorToMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  return "Unknown error";
}

export default function HistoryPage() {
  const navigate = useNavigate();

  const [calls, setCalls] = useState<ApiCall[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [limit] = useState(50);
  const [offset, setOffset] = useState(0);

  const [selected, setSelected] = useState<ApiCall | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) navigate("/login", { replace: true });
  }, [navigate]);

  async function load(nextOffset: number) {
    setLoading(true);
    setError("");
    try {
      const data = await apiGet<{ calls: ApiCall[]; limit: number; offset: number; count: number }>(
        `/api/calls/history?limit=${limit}&offset=${nextOffset}`
      );
      setCalls(data.calls || []);
      setOffset(nextOffset);
    } catch (e: unknown) {
      setError(errorToMessage(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canPrev = offset > 0;
  const canNext = useMemo(() => calls.length === limit, [calls.length, limit]);

  return (
    <div className="appShell">
      <main className="content">
        <div className="grid" style={{ gridTemplateColumns: "1fr" }}>
          <section className="card recentCard">
            <div className="recentHeader">
              <div className="recentTitle">History</div>

              <div style={{ display: "flex", gap: 8 }}>
                <button className="pillBtn" type="button" onClick={() => navigate("/profile")}>
                  Back
                </button>
                <button className="pillBtn" type="button" onClick={() => load(offset)} disabled={loading}>
                  {loading ? "Loading" : "Refresh"}
                </button>
              </div>
            </div>

            {error ? (
              <div className="errorBox">
                <b>History error:</b> {error}
              </div>
            ) : null}

            <div className="recentList">
              {calls.length === 0 ? (
                <div className="emptyText">No history yet.</div>
              ) : (
                calls.map((c) => (
                  <div className="recentItem" key={c.id}>
                    <div className="recentMeta">
                      <div className="recentId">#{c.id}</div>
                      <div className="recentDt">
                        <div>{(c.startTime || "").slice(0, 10) || "—"}</div>
                        <div>{(c.startTime || "").slice(11, 16) || "—"}</div>
                      </div>
                    </div>

                    <div className={`tag ${(c.status || "").toLowerCase()}`}>{c.status}</div>

                    <div className="recentActions">
                      <button className="iconBtn" type="button" onClick={() => setSelected(c)} title="View">
                        <Eye size={18} />
                      </button>
                      <button
                        className="iconBtn"
                        type="button"
                        onClick={() => downloadTranscript(c)}
                        title="Download"
                      >
                        <Download size={18} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 12, justifyContent: "flex-end" }}>
              <button className="pillBtn" type="button" disabled={!canPrev || loading} onClick={() => load(Math.max(0, offset - limit))}>
                Prev
              </button>
              <button className="pillBtn" type="button" disabled={!canNext || loading} onClick={() => load(offset + limit)}>
                Next
              </button>
            </div>
          </section>
        </div>
      </main>

      {selected && (
        <div className="modalOverlay" onClick={() => setSelected(null)}>
          <div className="modalContent" onClick={(e) => e.stopPropagation()}>
            <h3>Call #{selected.id}</h3>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <button className="btn secondary" type="button" onClick={() => downloadTranscript(selected)}>
                <Download size={18} />
                Download
              </button>
              <button className="btn secondary" type="button" onClick={() => setSelected(null)}>
                Close
              </button>
            </div>
            <pre style={{ whiteSpace: "pre-wrap", maxHeight: "55vh", overflow: "auto" }}>
              {buildTranscriptText(selected)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
