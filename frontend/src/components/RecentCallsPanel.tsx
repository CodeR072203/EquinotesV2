// /var/www/html/EquinotesV2/frontend/src/components/RecentCallsPanel.tsx
import { useEffect, useMemo, useState } from "react";
import { RefreshCcw, Eye, Download } from "lucide-react";
import { apiGet } from "../lib/api";
import type { ApiCall } from "../lib/api";

function statusTagClass(status: string): string {
  const s = (status || "").toLowerCase();
  if (s === "saved") return "saved";
  if (s === "discarded") return "discarded";
  if (s === "active") return "active";
  return s || "active";
}

function formatRecentDateParts(startTime: string): { date: string; time: string } {
  const raw = (startTime || "").trim();
  if (!raw) return { date: "—", time: "—" };

  const normalized = raw.includes("T") ? raw : raw.replace(" ", "T");
  const d = new Date(normalized);

  if (Number.isNaN(d.getTime())) {
    const parts = raw.split(" ");
    return {
      date: parts[0] || raw,
      time: parts[1] || "",
    };
  }

  // Short, stable formatting to avoid ugly wrapping ("Jan 15, 2026" on one line)
  const date = d.toLocaleDateString(undefined, {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });

  const time = d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });

  return { date, time };
}

function uniqById(calls: ApiCall[]): ApiCall[] {
  const seen = new Set<number>();
  const out: ApiCall[] = [];
  for (const c of calls) {
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    out.push(c);
  }
  return out;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function formatMMSS(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${pad2(mm)}:${pad2(ss)}`;
}

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
  try {
    return JSON.stringify(e);
  } catch {
    return "Unknown error";
  }
}

export default function RecentCallsPanel() {
  const [calls, setCalls] = useState<ApiCall[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");

  const [selected, setSelected] = useState<ApiCall | null>(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await apiGet<{ calls: ApiCall[] }>("/api/calls/recent");
      setCalls(uniqById(data.calls || []));
    } catch (e: unknown) {
      setError(errorToMessage(e) || "Failed to load recent calls");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  // UI polish: show 3 recent calls
  const rows = useMemo(() => calls.slice(0, 5), [calls]);

  return (
    <>
      <section className="card recentCard">
        <div className="recentHeader">
          <div className="recentTitle">
            <span className="recentIcon">
              <span className="clockDot" />
            </span>
            Recent Calls
          </div>

          <button className="pillBtn" type="button" onClick={load} disabled={loading}>
            <RefreshCcw size={16} />
            {loading ? "Loading" : "Refresh"}
          </button>
        </div>

        {error ? (
          <div className="errorBox">
            <b>Recent calls error:</b> {error}
          </div>
        ) : null}

        <div className="recentList">
          {rows.length === 0 ? (
            <div className="emptyText">No recent calls yet.</div>
          ) : (
            rows.map((c) => {
              const { date, time } = formatRecentDateParts(c.startTime);
              const s = (c.status || "").toLowerCase();
              const statusText = s === "discarded" ? "Discarded" : s === "saved" ? "Saved" : "Active";

              const duration =
                typeof c.durationSec === "number" && Number.isFinite(c.durationSec)
                  ? formatMMSS(c.durationSec)
                  : "—";

              return (
                <div className="recentItem" key={c.id}>
                  <div className="recentMeta">
                    <div className="recentId">#{c.id}</div>
                    <div className="recentDt">
                      <div className="recentDate">{date}</div>
                      <div className="recentTime">{time}</div>
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                    <div className={`tag ${statusTagClass(c.status)}`}>{statusText}</div>
                    <div style={{ fontSize: 12, opacity: 0.75, minWidth: 44, textAlign: "right" }}>
                      {duration}
                    </div>
                  </div>

                  <div className="recentActions">
                    <button
                      className="iconBtn"
                      type="button"
                      onClick={() => setSelected(c)}
                      aria-label="View"
                      title="View"
                    >
                      <Eye size={18} />
                    </button>
                    <button
                      className="iconBtn"
                      type="button"
                      onClick={() => downloadTranscript(c)}
                      aria-label="Download"
                      title="Download"
                    >
                      <Download size={18} />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      {selected && (
        <div className="modalOverlay" onClick={() => setSelected(null)}>
          <div className="modalContent" onClick={(e) => e.stopPropagation()}>
            <h3>Call #{selected.id}</h3>

            <div style={{ marginBottom: 12, opacity: 0.8, fontSize: 12 }}>
              <div>Status: {selected.status}</div>
              <div>Start: {selected.startTime}</div>
              <div>
                Duration:{" "}
                {typeof selected.durationSec === "number" && Number.isFinite(selected.durationSec)
                  ? formatMMSS(selected.durationSec)
                  : "—"}
              </div>
            </div>

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
    </>
  );
}
