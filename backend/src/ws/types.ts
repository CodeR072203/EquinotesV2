// /var/www/html/EquinotesV2/backend/src/ws/types.ts

export type WhisperLanguage = "en" | "tl";

export type WhisperLikeMessage = {
  text?: unknown;
  transcript?: unknown;
  result?: { text?: unknown };
  data?: { text?: unknown };
  segments?: unknown[]; // array-like in practice
  message?: unknown;
  status?: unknown;
  uid?: unknown;
};

export type ClientControlMessage =
  | {
      type: "config";
      language?: WhisperLanguage;
      model?: string;
      translate?: boolean;
      use_vad?: boolean;
    }
  | { type: "ping" };

export type Channel = "client" | "agent" | "unknown";

export type OutgoingJson =
  | { type: "info"; channel: Channel; message: string }
  | { type: "status"; channel: Channel; message: string }
  | { type: "transcript"; channel: Channel; text: string }
  | { type: "raw"; channel: Channel; text: string };
