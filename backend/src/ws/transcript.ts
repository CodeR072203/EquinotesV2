// /var/www/html/EquinotesV2/backend/src/ws/transcript.ts

import type { IncomingMessage } from "http";
import { FORCED_MODEL } from "../config";
import type {
  Channel,
  ClientControlMessage,
  WhisperLanguage,
  WhisperLikeMessage,
} from "./types";

export function parseChannelFromReq(req: IncomingMessage): Channel {
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

export function isServerReady(raw: string): boolean {
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

export function safeParseControlMessage(text: string): ClientControlMessage | null {
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== "object" || parsed === null) return null;

    const obj = parsed as Record<string, unknown>;

    if (obj.type === "config") {
      const language = (obj as any).language;
      const model = (obj as any).model;
      const translate = (obj as any).translate;
      const use_vad = (obj as any).use_vad;

      const langOk = language === "en" || language === "tl";

      return {
        type: "config",
        language: langOk ? (language as WhisperLanguage) : "tl",
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
 * WhisperLive init message. Must use valid language codes (no "auto").
 */
export function buildWhisperInit(params: {
  uid: string;
  language: WhisperLanguage;
  translate: boolean;
  use_vad: boolean;
}) {
  const { uid, language, translate, use_vad } = params;
  return {
    uid,
    model: FORCED_MODEL,
    language,
    task: translate ? "translate" : "transcribe",
    use_vad,
    initial_prompt:
      "Transcribe conversational Tagalog and English (Taglish). Keep Filipino words as-is. Preserve names, numbers, and common call-center terms.",
  };
}

export function tryExtractTranscript(raw: string): string | null {
  const isFilteredPromptText = (t: string) => {
    const low = t.toLowerCase();
    // keep legacy filters but make them a bit more robust
    return (
      low.includes("transcribe the audio") ||
      low.includes("transcribe natural conversation") ||
      low.includes("transcribe conversational tagalog and english")
    );
  };

  const hasLetters = (t: string) => {
    try {
      return /\p{L}/u.test(t);
    } catch {
      return /[A-Za-z]/.test(t);
    }
  };

  const looksLikeOnlyNumbers = (t: string) => {
    const tokens = t.trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return true;
    return tokens.every((x) => /^-?\d+(\.\d+)?$/.test(x));
  };

  const clean = (v: unknown): string | null => {
    if (typeof v !== "string") return null;
    const t = v.trim();
    if (t.length === 0) return null;
    if (isFilteredPromptText(t)) return null;
    if (!hasLetters(t) && looksLikeOnlyNumbers(t)) return null;
    return t;
  };

  const TEXT_KEYS = new Set([
    "text",
    "transcript",
    "sentence",
    "utterance",
    "raw_text",
    "partial",
    "final",
  ]);

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

  // Depth guard to avoid pathological recursion on unexpected payloads
  const collectTextByKeys = (node: unknown, out: string[], depth = 0) => {
    if (node == null) return;
    if (depth > 8) return;

    if (typeof node === "string") {
      const t = clean(node);
      if (t) out.push(t);
      return;
    }

    if (Array.isArray(node)) {
      for (const item of node) collectTextByKeys(item, out, depth + 1);
      return;
    }

    if (typeof node !== "object") return;
    const obj = node as Record<string, unknown>;

    // First, capture direct text fields (and recurse into them if not string)
    for (const k of Object.keys(obj)) {
      if (SKIP_KEYS.has(k)) continue;

      const v = obj[k];

      if (TEXT_KEYS.has(k)) {
        const t = clean(v);
        if (t) {
          out.push(t);
        } else {
          // Some payloads put text as arrays/objects; recurse so we don't miss it
          collectTextByKeys(v, out, depth + 1);
        }
      }
    }

    // Then recurse into likely containers + any other nested objects/arrays
    const containers: Array<[string, unknown]> = [];

    if ((obj as any).segment) containers.push(["segment", (obj as any).segment]);
    if ((obj as any).result) containers.push(["result", (obj as any).result]);
    if ((obj as any).data) containers.push(["data", (obj as any).data]);

    // Generic fallback recursion: walk other keys too (helps when WhisperLive schema differs per channel)
    for (const k of Object.keys(obj)) {
      if (SKIP_KEYS.has(k)) continue;
      if (TEXT_KEYS.has(k)) continue; // already handled above

      const v = obj[k];
      if (v && (typeof v === "object" || Array.isArray(v))) {
        containers.push([k, v]);
      }
    }

    for (const [, c] of containers) collectTextByKeys(c, out, depth + 1);
  };

  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;

    const obj = parsed as WhisperLikeMessage;

    // Prefer segments if present (WhisperLive typical)
    if (Array.isArray(obj.segments)) {
      const parts: string[] = [];
      for (const seg of obj.segments as any[]) collectTextByKeys(seg, parts);

      const joined = parts.join(" ").replace(/\s+/g, " ").trim();
      if (joined.length > 0 && !isFilteredPromptText(joined) && hasLetters(joined)) {
        return joined;
      }
    }

    // Fallback candidates
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

    // As a last fallback, scan the whole payload for any embedded text fields
    const deepParts: string[] = [];
    collectTextByKeys(parsed, deepParts);
    const deepJoined = deepParts.join(" ").replace(/\s+/g, " ").trim();
    if (deepJoined.length > 0 && !isFilteredPromptText(deepJoined) && hasLetters(deepJoined)) {
      return deepJoined;
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

/**
 * Interop safety:
 * Some dev/build paths may import this module via default export or require().
 * Provide a default object so both styles work.
 */
const transcriptApi = {
  parseChannelFromReq,
  isServerReady,
  safeParseControlMessage,
  buildWhisperInit,
  tryExtractTranscript,
};

export default transcriptApi;
