import type { ReactNode } from "react";
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import equinotesLogo from "../equinotes.png";
import "../App.css";

type Section = {
  id: string;
  title: string;
  body: ReactNode;
};


function scrollToId(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
}

export default function Manual() {
  const navigate = useNavigate();

  const sections: Section[] = useMemo(
    () => [
      {
        id: "what-it-does",
        title: "1) What EquiNotes does",
        body: (
          <>
            <p>
              EquiNotes creates a live, timestamped transcript of a two-party call:
            </p>
            <ul>
              <li>
                <b>Agent</b> — your microphone
              </li>
              <li>
                <b>Client</b> — either a shared browser tab/screen audio or a microphone
              </li>
            </ul>
            <p>
              It shows live transcript bubbles for each speaker and lets you save the call for
              later review.
            </p>
          </>
        ),
      },
      {
        id: "before-starting",
        title: "2) What you need before starting",
        body: (
          <ul>
            <li>A modern browser (Chrome or Edge recommended)</li>
            <li>A signed-in account</li>
            <li>Microphone permission allowed for the Agent</li>
            <li>
              If capturing Client audio from a browser tab: be ready to share <b>tab audio</b>
            </li>
          </ul>
        ),
      },
      {
        id: "start-transcription",
        title: "3) How to start a transcription",
        body: (
          <ol>
            <li>Sign in</li>
            <li>
              Choose the <b>Client audio source</b>:
              <ul>
                <li>Tab/Screen audio (recommended), or</li>
                <li>Client microphone</li>
              </ul>
            </li>
            <li>Choose the <b>Agent microphone</b></li>
            <li>Wait until the <b>Start</b> button becomes enabled</li>
            <li>Click <b>Start</b></li>
            <li>Speak — live transcript bubbles appear for Agent and Client</li>
          </ol>
        ),
      },
      {
        id: "agent-audio",
        title: "4) Selecting Agent audio (your microphone)",
        body: (
          <ol>
            <li>Open the Agent microphone dropdown</li>
            <li>Select the microphone you want to use</li>
            <li>
              Speak and watch the <b>Agent level meter</b> — it should move when you talk
            </li>
          </ol>
        ),
      },
      {
        id: "client-audio",
        title: "5) Selecting Client audio",
        body: (
          <>
            <h4 style={{ marginTop: 0 }}>Option A — Tab / Screen audio (recommended)</h4>
            <p>Use this for Zoom, Teams, Meet, or browser-based calls.</p>
            <ol>
              <li>Choose Tab/Screen audio</li>
              <li>Select the correct tab or window</li>
              <li>
                Check <b>“Share tab audio”</b>
              </li>
              <li>Click Share</li>
            </ol>
            <p>
              <b>Important:</b> If “Share tab audio” is not checked, no client audio will be captured.
            </p>

            <hr style={{ margin: "16px 0" }} />

            <h4>Option B — Client microphone</h4>
            <p>Use this if the client is in the same room or on a separate mic.</p>
            <ol>
              <li>Choose Microphone</li>
              <li>Select the client’s microphone device</li>
            </ol>
          </>
        ),
      },
      {
        id: "verify-audio",
        title: "6) How to verify audio is working",
        body: (
          <>
            <ul>
              <li>
                <b>Agent:</b> the level meter moves when you speak
              </li>
              <li>
                <b>Client:</b> client transcript bubbles appear
              </li>
            </ul>
            <p>If nothing happens:</p>
            <ul>
              <li>Recheck permissions</li>
              <li>Re-select devices</li>
              <li>Re-share the tab with audio enabled</li>
            </ul>
          </>
        ),
      },
      {
        id: "live-transcript",
        title: "7) Understanding the live transcript",
        body: (
          <>
            <ul>
              <li>Each bubble shows a timestamp like <b>[MM:SS]</b></li>
              <li>Time is based on call duration, not clock time</li>
              <li>While someone is speaking, text may update/replace the previous line</li>
              <li>Final text stays once speech stops</li>
            </ul>
            <h4>Copying text</h4>
            <ul>
              <li>Click a bubble to copy that line</li>
              <li>Use <b>Copy</b> to copy the full combined transcript</li>
            </ul>
          </>
        ),
      },
      {
        id: "stop-save-discard",
        title: "8–9) Stop, Save, or Discard",
        body: (
          <>
            <h4 style={{ marginTop: 0 }}>Stopping a session</h4>
            <ol>
              <li>Click <b>Stop</b></li>
              <li>The call ends and the app prepares the transcript</li>
            </ol>

            <h4>Save or discard the call</h4>
            <ul>
              <li>
                <b>Save</b> — stores the transcript and call details
              </li>
              <li>
                <b>Discard</b> — removes the call
              </li>
            </ul>
            <p>
              If you only need the text: use <b>Copy</b> before saving or discarding.
            </p>
          </>
        ),
      },
      {
        id: "past-transcripts",
        title: "10) Viewing past transcripts",
        body: (
          <ol>
            <li>Open <b>Recent Calls</b></li>
            <li>Select a call to view its transcript</li>
          </ol>
        ),
      },
      {
        id: "common-problems",
        title: "11) Common problems and quick fixes",
        body: (
          <>
            <h4 style={{ marginTop: 0 }}>Start button is disabled</h4>
            <ul>
              <li>Wait a few seconds</li>
              <li>Confirm you are signed in</li>
              <li>Check microphone permission</li>
              <li>Refresh the page if needed</li>
            </ul>

            <h4>No client audio when sharing a tab</h4>
            <ul>
              <li>Stop the call</li>
              <li>Start again</li>
              <li>Ensure “Share tab audio” is checked</li>
              <li>Try a different tab if needed</li>
            </ul>

            <h4>Agent mic shows no level</h4>
            <ul>
              <li>Confirm the correct microphone is selected</li>
              <li>Check browser mic permission</li>
              <li>Re-select the mic or refresh the page</li>
            </ul>

            <h4>Transcript missing words or lagging</h4>
            <ul>
              <li>Check both audio sources are active</li>
              <li>Ensure neither source is muted</li>
              <li>Stop and restart the call if needed</li>
            </ul>

            <h4>Copy doesn’t work</h4>
            <ul>
              <li>Browser may block clipboard access</li>
              <li>Allow clipboard permission for the site</li>
              <li>Or manually select and copy the text</li>
            </ul>

            <h4>Duplicate or corrected text appears</h4>
            <p>
              Live transcription may correct earlier words. Wait for the final line before saving if accuracy matters.
            </p>
          </>
        ),
      },
      {
        id: "final-recommendation",
        title: "Final recommendation",
        body: (
          <>
            <p>For best results:</p>
            <ul>
              <li>Start EquiNotes before the call begins</li>
              <li>Use a headset microphone for the Agent</li>
              <li>Always confirm tab audio is shared for the Client</li>
            </ul>
          </>
        ),
      },
    ],
    []
  );

  return (
    <div className="appShell">
      <header className="topbar">
        <div className="brand">
          <img className="brandLogo" src={equinotesLogo} alt="EquiNotes" />
          <div className="brandName">EquiNotes — Quick User Manual</div>
        </div>

        <div className="topbarRight">
          <button className="topbarBtn" type="button" onClick={() => navigate(-1)}>
            <span className="topbarBtnText">Back</span>
            <ArrowLeft size={18} />
          </button>
        </div>
      </header>

      <main className="content">
        <div
          className="grid"
          style={{
            gridTemplateColumns: "320px 1fr",
            alignItems: "start",
            gap: 16,
          }}
        >
          {/* TOC */}
          <aside className="card" style={{ padding: 16, position: "sticky", top: 16, height: "fit-content" }}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>Contents</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {sections.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className="btn secondary"
                  style={{ justifyContent: "flex-start" }}
                  onClick={() => scrollToId(s.id)}
                >
                  {s.title}
                </button>
              ))}
            </div>
          </aside>

          {/* Content */}
          <section style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {sections.map((s) => (
              <div key={s.id} id={s.id} className="card" style={{ padding: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
                  <h2 style={{ margin: 0 }}>{s.title}</h2>
                  <button
                    type="button"
                    className="btn secondary"
                    style={{ padding: "6px 10px" }}
                    onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
                  >
                    Back to top
                  </button>
                </div>
                <div style={{ marginTop: 10 }}>{s.body}</div>
              </div>
            ))}
          </section>
        </div>
      </main>
    </div>
  );
}
