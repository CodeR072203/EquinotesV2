// /var/www/html/EquinotesV2/backend/src/server.ts
import express from "express";
import http, { IncomingMessage } from "http";
import { WebSocketServer, WebSocket, RawData } from "ws";
import cors from "cors";
import type { Request, Response, NextFunction } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { pool } from "./db";
import authRouter from "./auth";
import callsRouter from "./calls";

// --- JWT + auth helpers -------------------------------------

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const JWT_EXPIRES_IN = "12h";

interface JwtPayload {
  id: number;
  email: string | null;
  username: string;
}

interface AuthRequest extends Request {
  user?: JwtPayload;
}

function createToken(agent: { id: number; email: string | null; username: string }) {
  const payload: JwtPayload = {
    id: agent.id,
    email: agent.email,
    username: agent.username,
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization || "";
  const parts = header.split(" ");
  const token = parts.length === 2 ? parts[1] : "";

  if (!token) {
    return res.status(401).json({ error: "Missing Authorization header" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

// ------------------------------------------------------------

const app = express();
app.use(cors());
app.use(express.json());
app.use("/api", authRouter);
app.use("/api", callsRouter);

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "equinotes-backend" });
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

const WHISPER_URL = "ws://127.0.0.1:9090";

/**
 * Force using the custom model folder name in the container: /models/faster-whisper-small
 */
const FORCED_MODEL = "faster-whisper-small";

/**
 * CRITICAL FIX: WhisperLive does NOT accept "auto" as a language code!
 * Must use specific language codes like "en" or "tl"
 */
type WhisperLanguage = "en" | "tl";

type WhisperSegment = { text?: unknown };
type WhisperLikeMessage = {
  text?: unknown;
  transcript?: unknown;
  result?: { text?: unknown };
  data?: { text?: unknown };
  segments?: unknown;
  message?: unknown;
  status?: unknown;
  uid?: unknown;
};

type ClientControlMessage =
  | {
      type: "config";
      language?: WhisperLanguage;
      model?: string; // ignored / mapped to FORCED_MODEL
      translate?: boolean;
      use_vad?: boolean;
    }
  | { type: "ping" };

type Channel = "client" | "agent" | "unknown";

type OutgoingJson =
  | { type: "info"; channel: Channel; message: string }
  | { type: "status"; channel: Channel; message: string }
  | { type: "transcript"; channel: Channel; text: string }
  | { type: "raw"; channel: Channel; text: string };

function tryExtractTranscript(raw: string): string | null {
  const isFilteredPromptText = (t: string) => {
    const low = t.toLowerCase();
    return (
      low.includes("transcribe the audio") ||
      low.includes("transcribe natural conversation")
    );
  };

  const hasLetters = (t: string) => {
    try {
      return /\p{L}/u.test(t); // any unicode letter
    } catch {
      // Fallback if unicode property escapes are not supported
      return /[A-Za-z]/.test(t);
    }
  };

  const looksLikeOnlyNumbers = (t: string) => {
    // e.g. "0.000", "13.800", "0.000 13.800"
    const tokens = t.trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return true;
    return tokens.every((x) => /^-?\d+(\.\d+)?$/.test(x));
  };

  const clean = (v: unknown): string | null => {
    if (typeof v !== "string") return null;
    const t = v.trim();
    if (t.length === 0) return null;
    if (isFilteredPromptText(t)) return null;
    // Avoid returning timestamps / numeric-only strings (your current symptom)
    if (!hasLetters(t) && looksLikeOnlyNumbers(t)) return null;
    return t;
  };

  // Keys that commonly contain the actual transcript
  const TEXT_KEYS = new Set([
    "text",
    "transcript",
    "sentence",
    "utterance",
    "raw_text",
    "partial",
    "final",
  ]);

  // Keys to skip during any recursive walk (prevents capturing "start"/"end" timestamps)
  const SKIP_KEYS = new Set([
    "start",
    "end",
    "uid",
    "id",
    "status",
    "message",
    "model",
    "language",
    "task",
    "completed",
    "completion",
    "duration",
    "prob",
    "avg_logprob",
    "no_speech_prob",
    "temperature",
  ]);

  const collectTextByKeys = (node: unknown, out: string[]) => {
    if (node == null) return;

    if (typeof node === "string") {
      const t = clean(node);
      if (t) out.push(t);
      return;
    }

    if (Array.isArray(node)) {
      for (const item of node) collectTextByKeys(item, out);
      return;
    }

    if (typeof node !== "object") return;
    const obj = node as Record<string, unknown>;

    // Pull only from known text keys in this object
    for (const k of Object.keys(obj)) {
      if (SKIP_KEYS.has(k)) continue;
      if (TEXT_KEYS.has(k)) {
        const t = clean(obj[k]);
        if (t) out.push(t);
      }
    }

    // Recurse into likely nesting containers, but do NOT blindly walk every key
    const containers: unknown[] = [];
    if (!SKIP_KEYS.has("segment") && (obj as any).segment)
      containers.push((obj as any).segment);
    if (!SKIP_KEYS.has("result") && (obj as any).result)
      containers.push((obj as any).result);
    if (!SKIP_KEYS.has("data") && (obj as any).data)
      containers.push((obj as any).data);

    for (const c of containers) collectTextByKeys(c, out);
  };

  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;

    const obj = parsed as WhisperLikeMessage;

    // 1) Prefer segments if present (WhisperLive’s common streaming shape)
    if (Array.isArray(obj.segments)) {
      const parts: string[] = [];
      for (const seg of obj.segments) collectTextByKeys(seg, parts);

      const joined = parts.join(" ").replace(/\s+/g, " ").trim();
      if (joined.length > 0 && !isFilteredPromptText(joined) && hasLetters(joined))
        return joined;
    }

    // 2) Fall back to top-level common fields (but still filtered)
    const candidates: unknown[] = [
      obj.text,
      obj.transcript,
      obj.result?.text,
      obj.data?.text,
      obj.message,
      obj.status,
    ];

    for (const c of candidates) {
      const t = clean(c);
      if (t) return t;
    }

    return null;
  } catch {
    const t = raw.trim();
    if (t.length === 0) return null;
    if (isFilteredPromptText(t)) return null;
    if (!hasLetters(t) && looksLikeOnlyNumbers(t)) return null;
    return t;
  }
}

function isServerReady(raw: string): boolean {
  if (raw.includes("SERVER_READY")) return true;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return false;
    const obj = parsed as Record<string, unknown>;
    return obj.message === "SERVER_READY" || obj.status === "SERVER_READY";
  } catch {
    return false;
  }
}

function safeParseControlMessage(text: string): ClientControlMessage | null {
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== "object" || parsed === null) return null;

    const obj = parsed as Record<string, unknown>;
    if (obj.type === "config") {
      const language = (obj as any).language;
      const model = (obj as any).model;
      const translate = (obj as any).translate;
      const use_vad = (obj as any).use_vad;

      // Only accept "en" or "tl" - WhisperLive doesn't accept "auto"
      const langOk = language === "en" || language === "tl";

      return {
        type: "config",
        language: langOk ? (language as WhisperLanguage) : "tl", // Default to "tl" for Taglish
        model: typeof model === "string" ? model : undefined,
        translate: typeof translate === "boolean" ? translate : undefined,
        use_vad: typeof use_vad === "boolean" ? use_vad : undefined,
      };
    }

    if ((obj as any).type === "ping") return { type: "ping" };
    return null;
  } catch {
    return null;
  }
}

/**
 * WhisperLive init message. CRITICAL: must use valid language codes.
 */
function buildWhisperInit(params: {
  uid: string;
  language: WhisperLanguage;
  translate: boolean;
  use_vad: boolean;
}) {
  const { uid, language, translate, use_vad } = params;
  return {
    uid,
    model: FORCED_MODEL,
    language, // MUST be valid language code like "en" or "tl", NOT "auto"
    task: translate ? "translate" : "transcribe",
    use_vad,
    initial_prompt:
      "Transcribe natural conversation in Tagalog and English (Taglish).",
  };
}

function rawToBuffer(data: RawData): Buffer {
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof ArrayBuffer) return Buffer.from(new Uint8Array(data));
  if (Array.isArray(data)) return Buffer.concat(data as Buffer[]);
  return Buffer.from(String(data));
}

/**
 * Convert PCM16 bytes (Int16LE) -> Float32LE bytes with conservative normalization.
 * WhisperLive expects float32 samples.
 */
function pcm16leToFloat32Bytes(pcmBytes: Buffer): Buffer {
  const evenLen = pcmBytes.length - (pcmBytes.length % 2);
  const sampleCount = evenLen / 2;
  if (sampleCount <= 0) return Buffer.alloc(0);

  // 1) PCM16 -> Float32 (-1..1)
  const floats = new Float32Array(sampleCount);
  let sum = 0;

  for (let i = 0; i < sampleCount; i++) {
    const s = pcmBytes.readInt16LE(i * 2);
    const f = s < 0 ? s / 32768 : s / 32767;
    floats[i] = f;
    sum += f;
  }

  // 2) DC offset removal
  const mean = sum / sampleCount;

  // 3) Compute RMS + peak + simple variability metric
  let peak = 0;
  let sumSq = 0;
  let sumAbsDiff = 0;

  let prev = 0;
  for (let i = 0; i < sampleCount; i++) {
    const x = floats[i] - mean;
    floats[i] = x;

    const ax = Math.abs(x);
    if (ax > peak) peak = ax;

    sumSq += x * x;

    if (i > 0) sumAbsDiff += Math.abs(x - prev);
    prev = x;
  }

  const rms = Math.sqrt(sumSq / sampleCount);

  // avg absolute delta between adjacent samples (very low for "flat" / steady signals)
  const avgAbsDiff = sumAbsDiff / Math.max(1, sampleCount - 1);

  // Hard gate: near silence
  const EPS = 1e-8;
  if (rms < 0.0015 && peak < 0.008) {
    return Buffer.from(new Uint8Array(floats.buffer));
  }

  const looksFlat = avgAbsDiff < 0.00035 && peak > 0.05;

  // 4) Automatic gain (only if not flat)
  let gain = 1.0;

  if (!looksFlat) {
    const TARGET_RMS = 0.1;
    gain = TARGET_RMS / Math.max(rms, EPS);

    const MIN_GAIN = 0.05;
    const MAX_GAIN = 16.0;
    if (gain < MIN_GAIN) gain = MIN_GAIN;
    if (gain > MAX_GAIN) gain = MAX_GAIN;

    if (peak > 0.92 && rms > 0.2) gain *= 0.6;
    if (peak > 0.98 && rms > 0.12) gain *= 0.5;
  } else {
    gain = 1.5;
  }

  // Apply gain and track post-gain peak
  let postPeak = 0;
  for (let i = 0; i < sampleCount; i++) {
    const y = floats[i] * gain;
    floats[i] = y;
    const ay = Math.abs(y);
    if (ay > postPeak) postPeak = ay;
  }

  // 5) Soft limiting only if needed AND not flat
  const LIMIT_THRESHOLD = 0.97;

  if (!looksFlat && postPeak > LIMIT_THRESHOLD) {
    const DRIVE = 1.9;
    const tanhNorm = Math.tanh(DRIVE);

    for (let i = 0; i < sampleCount; i++) {
      const x = floats[i];
      const y = Math.tanh(DRIVE * x) / tanhNorm;
      floats[i] = y > 1 ? 1 : y < -1 ? -1 : y;
    }
  } else {
    for (let i = 0; i < sampleCount; i++) {
      const x = floats[i];
      floats[i] = x > 1 ? 1 : x < -1 ? -1 : x;
    }
  }

  return Buffer.from(new Uint8Array(floats.buffer));
}

function parseChannelFromReq(req: IncomingMessage): Channel {
  try {
    const url = new URL(req.url ?? "", "http://localhost");
    const ch = (url.searchParams.get("channel") ?? "").toLowerCase();
    if (ch === "client") return "client";
    if (ch === "agent") return "agent";
    return "unknown";
  } catch {
    return "unknown";
  }
}

wss.on("connection", (clientSocket: WebSocket, req: IncomingMessage) => {
  const channel: Channel = parseChannelFromReq(req);

  console.log(`Frontend WS client connected (channel=${channel})`);

  // Defaults: Use "tl" for Tagalog+English (Taglish)
  let language: WhisperLanguage = "tl";
  let translate = false;
  let use_vad = false;

  let micStreaming = false;

  let hasReceivedAnyAudio = false;

  let bytesFromBrowser = 0;
  let lastLog = Date.now();

  let bytesToWhisper = 0;
  let peakAbs = 0;
  let lastWhisperLog = Date.now();

  let whisperSocket: WebSocket | null = null;
  let whisperReady = false;

  let endOfAudioSent = false;

  let pcmQueue: Buffer = Buffer.alloc(0);

  const pendingFloat32: Buffer[] = [];

  let nextReconnectAt = 0;
  let backoffMs = 500;
  const BACKOFF_MAX_MS = 10_000;

  let consecutiveEarlyCloses = 0;
  const MAX_EARLY_CLOSES = 6;

  let stopRequested = false;
  let stopDeadlineMs = 0;
  let stopTimer: NodeJS.Timeout | null = null;

  function nowMs() {
    return Date.now();
  }

  function sendToFrontendSafe(msg: string | Buffer) {
    try {
      if (clientSocket.readyState === WebSocket.OPEN) clientSocket.send(msg);
    } catch {
      // ignore
    }
  }

  function sendJsonSafe(payload: OutgoingJson) {
    sendToFrontendSafe(JSON.stringify(payload));
  }

  function info(message: string) {
    sendJsonSafe({ type: "info", channel, message });
  }

  function status(message: string) {
    sendJsonSafe({ type: "status", channel, message });
  }

  function transcript(text: string) {
    sendJsonSafe({ type: "transcript", channel, text });
  }

  function raw(text: string) {
    sendJsonSafe({ type: "raw", channel, text });
  }

  info("Connected to EquiNotes backend WebSocket");

  function clearStopTimer() {
    if (stopTimer) {
      clearInterval(stopTimer);
      stopTimer = null;
    }
  }

  function safeCloseWs(ws: WebSocket | null, code: number, reason: string) {
    if (!ws) return;
    try {
      if (ws.readyState === WebSocket.CONNECTING) {
        ws.terminate();
        return;
      }
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CLOSING) {
        ws.close(code, reason);
      }
    } catch {
      // ignore
    }
  }

  function closeWhisperLocalState() {
    whisperReady = false;
    pendingFloat32.length = 0;
    whisperSocket = null;
    endOfAudioSent = false;
  }

  function closeWhisperSafe(reason: string) {
    whisperReady = false;

    const ws = whisperSocket;
    closeWhisperLocalState();

    if (!ws) return;
    safeCloseWs(ws, 1000, reason);
  }

  function sendEndOfAudioToWhisper(ws: WebSocket) {
    try {
      if (ws.readyState === WebSocket.OPEN && !endOfAudioSent) {
        ws.send(Buffer.from("END_OF_AUDIO"));
        endOfAudioSent = true;
      }
    } catch {
      // ignore
    }
  }

  function updateWhisperDiagnostics(floatBytes: Buffer) {
    bytesToWhisper += floatBytes.length;

    const len = floatBytes.length - (floatBytes.length % 4);
    for (let i = 0; i < len; i += 4) {
      const v = floatBytes.readFloatLE(i);
      const a = Math.abs(v);
      if (a > peakAbs) peakAbs = a;
    }

    const t = nowMs();
    if (t - lastWhisperLog >= 1000) {
      console.log(
        `to whisper: ~${bytesToWhisper} bytes/sec (channel=${channel}), peakAbs=${peakAbs.toFixed(
          4
        )}`
      );
      bytesToWhisper = 0;
      peakAbs = 0;
      lastWhisperLog = t;
    }
  }

  function scheduleForcedStopIfNeeded() {
    if (!stopRequested) return;
    if (stopTimer) return;

    stopTimer = setInterval(() => {
      if (!stopRequested) {
        clearStopTimer();
        return;
      }

      if (!whisperSocket) {
        stopRequested = false;
        clearStopTimer();
        return;
      }

      if (nowMs() >= stopDeadlineMs) {
        const ws = whisperSocket;
        closeWhisperLocalState();
        safeCloseWs(ws, 1000, "client_stop_timeout");
        stopRequested = false;
        clearStopTimer();
        status("WhisperLive stop timeout; connection closed");
      }
    }, 250);
  }

  function flushPendingIfReady(ws: WebSocket) {
    if (!whisperReady) return;
    while (pendingFloat32.length > 0 && ws.readyState === WebSocket.OPEN) {
      const chunk = pendingFloat32.shift();
      if (!chunk) break;
      updateWhisperDiagnostics(chunk);
      ws.send(chunk);
    }
  }

  function ensureWhisperConnected() {
    if (!micStreaming) return;

    if (stopRequested) return;

    const t = nowMs();
    if (nextReconnectAt > t) return;

    if (
      whisperSocket &&
      (whisperSocket.readyState === WebSocket.CONNECTING ||
        whisperSocket.readyState === WebSocket.OPEN ||
        whisperSocket.readyState === WebSocket.CLOSING)
    ) {
      return;
    }

    const ws = new WebSocket(WHISPER_URL);
    whisperSocket = ws;
    whisperReady = false;

    const uid = `equinotes-${channel}-${Date.now()}-${Math.random()
      .toString(16)
      .slice(2)}`;

    let readySeenForThisSocket = false;

    ws.on("open", () => {
      console.log(`Connected to WhisperLive: ${WHISPER_URL} (channel=${channel})`);
      status(`Connected to WhisperLive (${WHISPER_URL})`);

      const initMsg = buildWhisperInit({
        uid,
        language,
        translate,
        use_vad,
      });

      ws.send(JSON.stringify(initMsg));
      console.log(`Sent WhisperLive init (channel=${channel})`);
    });

    ws.on("message", (msg, isBinary) => {
      if (isBinary) {
        const b = Buffer.isBuffer(msg) ? msg : rawToBuffer(msg as any);
        sendToFrontendSafe(b);
        return;
      }

      const text = msg.toString();

      if (!text.includes("SERVER_READY")) {
        console.log(
          `WhisperLive -> backend (channel=${channel}): ${text.substring(0, 100)}`
        );
      }

      raw(text);

      if (!readySeenForThisSocket && isServerReady(text)) {
        readySeenForThisSocket = true;
        whisperReady = true;

        consecutiveEarlyCloses = 0;
        backoffMs = 500;
        nextReconnectAt = 0;

        status("WhisperLive is ready");
        flushPendingIfReady(ws);

        if (stopRequested) {
          sendEndOfAudioToWhisper(ws);
          scheduleForcedStopIfNeeded();
        }
        return;
      }

      const t = tryExtractTranscript(text);
      if (t && t.trim().length > 0) {
        console.log(`📝 TRANSCRIPT (channel=${channel}): "${t}"`);
        transcript(t);
      }
    });

    ws.on("close", (code, reason) => {
      const rsn = reason?.toString() ?? "";
      console.log(`WhisperLive WS closed: code=${code} (channel=${channel})`);

      const closedBeforeReady = !readySeenForThisSocket;

      whisperReady = false;
      if (whisperSocket === ws) whisperSocket = null;

      if (stopRequested) {
        stopRequested = false;
        clearStopTimer();
        status(`WhisperLive closed (${rsn || "closed"})`);
        return;
      }

      if (!micStreaming) return;

      if (closedBeforeReady) {
        consecutiveEarlyCloses += 1;

        if (consecutiveEarlyCloses >= MAX_EARLY_CLOSES) {
          status("WhisperLive keeps closing before SERVER_READY. Check WhisperLive logs.");
          micStreaming = false;
          return;
        }

        nextReconnectAt = nowMs() + backoffMs;
        backoffMs = Math.min(BACKOFF_MAX_MS, backoffMs * 2);

        status(`WhisperLive closed early; reconnecting soon...`);
      } else {
        nextReconnectAt = nowMs() + 750;
        status("WhisperLive connection closed; reconnecting...");
      }
    });

    ws.on("error", (err) => {
      console.error(`WhisperLive WS error (channel=${channel}):`, err);
      whisperReady = false;
      if (whisperSocket === ws) whisperSocket = null;

      if (stopRequested) {
        stopRequested = false;
        clearStopTimer();
        status("WhisperLive error during stop; connection closed");
        return;
      }

      if (micStreaming) {
        nextReconnectAt = nowMs() + backoffMs;
        backoffMs = Math.min(BACKOFF_MAX_MS, backoffMs * 2);
        status("WhisperLive error; backing off reconnect...");
      }
    });
  }

  function drainPcmToWhisper() {
    const PCM_CHUNK_BYTES = 16384;

    while (pcmQueue.length >= PCM_CHUNK_BYTES) {
      const pcmChunk = pcmQueue.subarray(0, PCM_CHUNK_BYTES);
      pcmQueue = Buffer.from(pcmQueue.subarray(PCM_CHUNK_BYTES));

      const floatBytes = pcm16leToFloat32Bytes(Buffer.from(pcmChunk));

      const ws = whisperSocket;
      if (ws && ws.readyState === WebSocket.OPEN && whisperReady) {
        updateWhisperDiagnostics(floatBytes);
        ws.send(floatBytes);
      } else {
        if (pendingFloat32.length < 400) pendingFloat32.push(floatBytes);
      }
    }
  }

  function flushPcmTailToPending() {
    try {
      const evenLen = pcmQueue.length - (pcmQueue.length % 2);
      if (evenLen > 0) {
        const pcmTail = pcmQueue.subarray(0, evenLen);
        pcmQueue = Buffer.alloc(0);

        const floatTail = pcm16leToFloat32Bytes(Buffer.from(pcmTail));
        const ws = whisperSocket;
        if (ws && ws.readyState === WebSocket.OPEN && whisperReady) {
          updateWhisperDiagnostics(floatTail);
          ws.send(floatTail);
        } else {
          if (pendingFloat32.length < 400) pendingFloat32.push(floatTail);
        }
      } else {
        pcmQueue = Buffer.alloc(0);
      }
    } catch {
      // ignore
    }
  }

  function requestStopWhisper() {
    micStreaming = false;

    flushPcmTailToPending();

    stopRequested = true;
    stopDeadlineMs = nowMs() + 6000;

    const ws = whisperSocket;
    if (ws && ws.readyState === WebSocket.OPEN && whisperReady) {
      sendEndOfAudioToWhisper(ws);
    }

    scheduleForcedStopIfNeeded();
  }

  clientSocket.on("message", (data, isBinary) => {
    if (!isBinary) {
      const text = data.toString();

      if (text === "END_OF_AUDIO") {
        if (!hasReceivedAnyAudio) {
          console.log(`Ignoring END_OF_AUDIO (no audio received yet) (channel=${channel})`);
          status("Ignoring END_OF_AUDIO (no audio received yet)");
          return;
        }

        console.log(`Received END_OF_AUDIO from frontend (channel=${channel})`);

        status("END_OF_AUDIO received");
        requestStopWhisper();
        return;
      }

      const ctrl = safeParseControlMessage(text);
      if (ctrl?.type === "ping") {
        raw("pong");
        return;
      }

      if (ctrl?.type === "config") {
        language = ctrl.language === "en" ? "en" : "tl";
        translate = ctrl.translate ?? translate;
        use_vad = ctrl.use_vad ?? use_vad;

        const msg = `Config set (forced model): model=${FORCED_MODEL}, lang=${language}, translate=${translate}, vad=${use_vad}`;
        console.log(`${msg} (channel=${channel})`);
        status(msg);

        stopRequested = false;
        clearStopTimer();

        closeWhisperSafe("config_change");
        if (micStreaming) ensureWhisperConnected();
        return;
      }

      raw(`Ignored text: ${text}`);
      return;
    }

    const buf = rawToBuffer(data);

    const evenLen = buf.length - (buf.length % 2);
    if (evenLen <= 0) return;

    hasReceivedAnyAudio = true;

    if (stopRequested) {
      stopRequested = false;
      clearStopTimer();
    }

    micStreaming = true;

    bytesFromBrowser += evenLen;
    const t = nowMs();
    if (t - lastLog >= 1000) {
      const kbPerSec = Math.round(bytesFromBrowser / 1024);
      console.log(`audio in: ~${kbPerSec} KB/sec (channel=${channel})`);
      bytesFromBrowser = 0;
      lastLog = t;
    }

    const slice = Buffer.from(buf.subarray(0, evenLen));
    pcmQueue = pcmQueue.length === 0 ? slice : Buffer.concat([pcmQueue, slice]);

    ensureWhisperConnected();
    drainPcmToWhisper();
  });

  clientSocket.on("close", () => {
    console.log(`Frontend WS client disconnected (channel=${channel})`);

    micStreaming = false;
    hasReceivedAnyAudio = false;
    pcmQueue = Buffer.alloc(0);
    pendingFloat32.length = 0;

    stopRequested = false;
    clearStopTimer();

    try {
      const ws = whisperSocket;
      if (ws && ws.readyState === WebSocket.OPEN) {
        sendEndOfAudioToWhisper(ws);
      }
    } catch {
      // ignore
    }

    closeWhisperSafe("frontend_disconnect");
  });

  clientSocket.on("error", (err) => {
    console.error(`Frontend WS error (channel=${channel}):`, err);

    micStreaming = false;
    hasReceivedAnyAudio = false;
    pcmQueue = Buffer.alloc(0);
    pendingFloat32.length = 0;

    stopRequested = false;
    clearStopTimer();

    closeWhisperSafe("frontend_error");
  });
});

const PORT = 3001;
server.listen(PORT, () => {
  console.log(`EquiNotes backend running at http://0.0.0.0:${PORT}`);
  console.log(`WebSocket endpoint: ws://<server-ip>:${PORT}/ws`);
  console.log(
    `Using language="tl" for Tagalog+English (Taglish) (WhisperLive doesn't accept "auto")`
  );
});
