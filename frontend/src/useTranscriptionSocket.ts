// /var/www/html/EquinotesV2/frontend/src/useTranscriptionSocket.ts

import { useCallback, useEffect, useRef, useState } from "react";

export type WsStatus = "connecting" | "open" | "closed" | "error";

type WhisperSegment = { text?: unknown };

type WhisperLikeMessage = {
  // legacy / WhisperLive-ish
  text?: unknown;
  transcript?: unknown;
  result?: { text?: unknown };
  data?: { text?: unknown };
  segments?: WhisperSegment[];

  // new backend envelope
  type?: unknown; // "info" | "status" | "transcript" | "raw"
  channel?: unknown;
  message?: unknown;

  // future-proof: allow additional fields without typing errors
  [k: string]: unknown;
};

type UseTranscriptionSocketResult = {
  status: WsStatus;
  messages: string[];
  lastTranscript: string;
  clear: () => void;
  sendBinary: (buf: ArrayBufferLike) => void;
  sendText: (text: string) => void;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function extractTranscriptText(raw: string): string | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) {
      const t = raw.trim();
      return t.length ? t : null;
    }

    const obj = parsed as WhisperLikeMessage;

    const candidates: unknown[] = [
      obj.text,
      obj.transcript,
      obj.result?.text,
      obj.data?.text,
      Array.isArray(obj.segments)
        ? obj.segments
            .map((s) => (typeof s.text === "string" ? s.text : ""))
            .join(" ")
        : null,
    ];

    for (const c of candidates) {
      if (typeof c === "string") {
        const t = c.trim();
        if (t.length) return t;
      }
    }

    return null;
  } catch {
    const t = raw.trim();
    return t.length ? t : null;
  }
}

type ParsedBackend =
  | { kind: "transcript"; text: string; channel?: string }
  | { kind: "ui"; text: string }
  | { kind: "none" };

function parseBackendPayload(raw: string): ParsedBackend {
  const trimmed = raw.trim();
  if (!trimmed) return { kind: "none" };

  try {
    const parsed: unknown = JSON.parse(raw);
    if (isRecord(parsed)) {
      const obj = parsed as WhisperLikeMessage;

      const t = typeof obj.type === "string" ? obj.type : "";
      const text = typeof obj.text === "string" ? obj.text.trim() : "";
      const message = typeof obj.message === "string" ? obj.message.trim() : "";
      const channel = typeof obj.channel === "string" ? obj.channel : undefined;

      if (t === "transcript") {
        if (text.length) return { kind: "transcript", text, channel };
      }

      if (t === "status" || t === "info") {
        const line = message || text;
        if (line.length) return { kind: "ui", text: line };
        return { kind: "none" };
      }

      if (t === "raw") {
        const line = text || message;
        if (line.length) return { kind: "ui", text: line };
        return { kind: "none" };
      }

      const legacy = extractTranscriptText(raw);
      if (legacy) return { kind: "transcript", text: legacy };
      return { kind: "ui", text: trimmed };
    }
  } catch {
    // ignore
  }

  const legacy = extractTranscriptText(raw);
  if (legacy) return { kind: "transcript", text: legacy };

  return { kind: "ui", text: trimmed };
}

function normalizeLine(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

export function useTranscriptionSocket(url: string): UseTranscriptionSocketResult {
  const [status, setStatus] = useState<WsStatus>("connecting");
  const [messages, setMessages] = useState<string[]>([]);
  const [lastTranscript, setLastTranscript] = useState<string>("");

  const wsRef = useRef<WebSocket | null>(null);

  // Track last url used by this hook instance
  const urlRef = useRef<string>("");

  // Prevent duplicate connections in React 18 dev StrictMode / fast re-mounts
  const connectIdRef = useRef(0);

  // De-dupe consecutive identical UI/transcript lines
  const lastUiLineRef = useRef<string>("");

  // De-dupe transcript bursts (VERY conservative; avoid dropping content)
  const lastTranscriptNormRef = useRef<string>("");
  const lastTranscriptAtRef = useRef<number>(0);

  const pushMessage = useCallback((msg: string) => {
    const m = msg.trim();
    if (!m) return;

    if (lastUiLineRef.current === m) return;
    lastUiLineRef.current = m;

    setMessages((prev) => {
      const next = [...prev, m];
      if (next.length > 500) next.splice(0, next.length - 500);
      return next;
    });
  }, []);

  const sendBinary = useCallback((buf: ArrayBufferLike) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(buf);
  }, []);

  const sendText = useCallback((text: string) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(text);
  }, []);

  const clear = useCallback(() => {
    lastUiLineRef.current = "";
    lastTranscriptNormRef.current = "";
    lastTranscriptAtRef.current = 0;
    setMessages([]);
    setLastTranscript("");
  }, []);

  useEffect(() => {
    const existing = wsRef.current;

    // If url changed, force-close existing socket so we reconnect.
    if (existing && urlRef.current && urlRef.current !== url) {
      try {
        existing.onopen = null;
        existing.onmessage = null;
        existing.onerror = null;
        existing.onclose = null;

        if (existing.readyState === WebSocket.OPEN || existing.readyState === WebSocket.CONNECTING) {
          existing.close();
        }
      } catch {
        // ignore
      } finally {
        if (wsRef.current === existing) wsRef.current = null;
      }
    }

    // If we already have an OPEN/CONNECTING socket for this hook instance AND same url, don't create another.
    const stillExisting = wsRef.current;
    if (
      stillExisting &&
      urlRef.current === url &&
      (stillExisting.readyState === WebSocket.OPEN || stillExisting.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    urlRef.current = url;

    const connectId = ++connectIdRef.current;
    setStatus("connecting");

    const ws = new WebSocket(url);
    ws.binaryType = "arraybuffer";
    wsRef.current = ws;

    ws.onopen = () => {
      if (connectId !== connectIdRef.current) return;
      setStatus("open");
      pushMessage(JSON.stringify({ type: "info", message: "WS connected" }));
    };

    ws.onmessage = (event) => {
      if (connectId !== connectIdRef.current) return;

      if (typeof event.data === "string") {
        const parsed = parseBackendPayload(event.data);

        if (parsed.kind === "transcript") {
          // Keep whitespace stable, but do NOT aggressively de-dupe (prefer keeping more text).
          const norm = normalizeLine(parsed.text);
          if (!norm) return;

          // Only suppress exact duplicates that arrive in a very tight burst (e.g., same frame repeated).
          // This avoids dropping meaningful earlier content during evolving hypotheses.
          const now = Date.now();
          if (norm === lastTranscriptNormRef.current && now - lastTranscriptAtRef.current < 1000) {
            return;
          }

          lastTranscriptNormRef.current = norm;
          lastTranscriptAtRef.current = now;

          setLastTranscript(norm);

          // Push as backend-style envelope so App.tsx can parse kind==="transcript"
          pushMessage(
            JSON.stringify({
              type: "transcript",
              channel: parsed.channel ?? "unknown",
              text: norm,
            })
          );
          return;
        }

        if (parsed.kind === "ui") {
          // Keep UI/info as envelope too (App ignores these for bubbles)
          pushMessage(JSON.stringify({ type: "info", message: parsed.text }));
          return;
        }

        return;
      }

      // ignore binary inbound
    };

    ws.onerror = () => {
      if (connectId !== connectIdRef.current) return;
      setStatus("error");
      pushMessage(JSON.stringify({ type: "status", message: "❌ WS error" }));
    };

    ws.onclose = () => {
      if (connectId !== connectIdRef.current) return;
      setStatus("closed");
      pushMessage(JSON.stringify({ type: "status", message: "⚠️ WS closed" }));
    };

    return () => {
      if (connectId === connectIdRef.current) {
        connectIdRef.current += 1;
      }

      try {
        ws.onopen = null;
        ws.onmessage = null;
        ws.onerror = null;
        ws.onclose = null;

        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          ws.close();
        }
      } catch {
        // ignore
      } finally {
        if (wsRef.current === ws) wsRef.current = null;
      }
    };
  }, [url, pushMessage]);

  return { status, messages, lastTranscript, clear, sendBinary, sendText };
}
