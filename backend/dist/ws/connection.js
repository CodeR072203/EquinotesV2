"use strict";
// /var/www/html/EquinotesV2/backend/src/ws/connection.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleFrontendConnection = handleFrontendConnection;
const ws_1 = require("ws");
const config_1 = require("../config");
const audio_1 = require("./audio");
/**
 * IMPORTANT:
 * Avoid importing helpers as named ES imports here because your runtime is CommonJS
 * under ts-node-dev and you previously hit:
 *   TypeError: (0, transcript_1.parseChannelFromReq) is not a function
 *
 * This file loads transcript helpers via require() for CJS compatibility.
 */
const transcriptMod = require("./transcript");
const parseChannelFromReq = transcriptMod.parseChannelFromReq || transcriptMod.default?.parseChannelFromReq;
const isServerReady = transcriptMod.isServerReady || transcriptMod.default?.isServerReady;
const safeParseControlMessage = transcriptMod.safeParseControlMessage || transcriptMod.default?.safeParseControlMessage;
const buildWhisperInit = transcriptMod.buildWhisperInit || transcriptMod.default?.buildWhisperInit;
const tryExtractTranscript = transcriptMod.tryExtractTranscript || transcriptMod.default?.tryExtractTranscript;
/**
 * Must be a named export so:
 *   import { handleFrontendConnection } from "./connection"
 * works in both ts-node-dev (dev) and compiled dist (start).
 */
function handleFrontendConnection(clientSocket, req) {
    // Hard-fail early with clear message if transcript helpers didn't load correctly
    if (typeof parseChannelFromReq !== "function" ||
        typeof isServerReady !== "function" ||
        typeof safeParseControlMessage !== "function" ||
        typeof buildWhisperInit !== "function" ||
        typeof tryExtractTranscript !== "function") {
        const missing = [
            ["parseChannelFromReq", parseChannelFromReq],
            ["isServerReady", isServerReady],
            ["safeParseControlMessage", safeParseControlMessage],
            ["buildWhisperInit", buildWhisperInit],
            ["tryExtractTranscript", tryExtractTranscript],
        ]
            .filter(([, v]) => typeof v !== "function")
            .map(([k]) => k)
            .join(", ");
        try {
            if (clientSocket.readyState === ws_1.WebSocket.OPEN) {
                clientSocket.send(JSON.stringify({
                    type: "status",
                    channel: "unknown",
                    message: `Backend WS misconfigured: missing ${missing} in ws/transcript.ts`,
                }));
            }
        }
        catch {
            // ignore
        }
        try {
            clientSocket.close(1011, "backend_ws_misconfigured");
        }
        catch {
            // ignore
        }
        console.error(`Backend WS misconfigured: missing ${missing} in ws/transcript.ts`);
        return;
    }
    const channel = parseChannelFromReq(req);
    console.log(`Frontend WS client connected (channel=${channel})`);
    let language = "tl";
    let translate = false;
    let use_vad = true;
    let micStreaming = false;
    let hasReceivedAnyAudio = false;
    let bytesFromBrowser = 0;
    let lastLog = Date.now();
    let bytesToWhisper = 0;
    let peakAbs = 0;
    let lastWhisperLog = Date.now();
    let whisperSocket = null;
    let whisperReady = false;
    let endOfAudioSent = false;
    let pcmQueue = Buffer.alloc(0);
    const pendingFloat32 = [];
    let nextReconnectAt = 0;
    let backoffMs = 500;
    const BACKOFF_MAX_MS = 10000;
    let consecutiveEarlyCloses = 0;
    const MAX_EARLY_CLOSES = 6;
    let stopRequested = false;
    let stopDeadlineMs = 0;
    let stopTimer = null;
    function nowMs() {
        return Date.now();
    }
    function sendToFrontendSafe(msg) {
        try {
            if (clientSocket.readyState === ws_1.WebSocket.OPEN)
                clientSocket.send(msg);
        }
        catch {
            // ignore
        }
    }
    function sendJsonSafe(payload) {
        sendToFrontendSafe(JSON.stringify(payload));
    }
    function info(message) {
        sendJsonSafe({ type: "info", channel, message });
    }
    function status(message) {
        sendJsonSafe({ type: "status", channel, message });
    }
    function transcript(text) {
        sendJsonSafe({ type: "transcript", channel, text });
    }
    function raw(text) {
        sendJsonSafe({ type: "raw", channel, text });
    }
    info("Connected to EquiNotes backend WebSocket");
    function clearStopTimer() {
        if (stopTimer) {
            clearInterval(stopTimer);
            stopTimer = null;
        }
    }
    function safeCloseWs(ws, code, reason) {
        if (!ws)
            return;
        try {
            if (ws.readyState === ws_1.WebSocket.CONNECTING) {
                ws.terminate();
                return;
            }
            if (ws.readyState === ws_1.WebSocket.OPEN || ws.readyState === ws_1.WebSocket.CLOSING) {
                ws.close(code, reason);
            }
        }
        catch {
            // ignore
        }
    }
    function closeWhisperLocalState() {
        whisperReady = false;
        pendingFloat32.length = 0;
        whisperSocket = null;
        endOfAudioSent = false;
    }
    function closeWhisperSafe(reason) {
        whisperReady = false;
        const ws = whisperSocket;
        closeWhisperLocalState();
        if (!ws)
            return;
        safeCloseWs(ws, 1000, reason);
    }
    function sendEndOfAudioToWhisper(ws) {
        try {
            if (ws.readyState === ws_1.WebSocket.OPEN && !endOfAudioSent) {
                ws.send(Buffer.from("END_OF_AUDIO"));
                endOfAudioSent = true;
            }
        }
        catch {
            // ignore
        }
    }
    function updateWhisperDiagnostics(floatBytes) {
        bytesToWhisper += floatBytes.length;
        const len = floatBytes.length - (floatBytes.length % 4);
        for (let i = 0; i < len; i += 4) {
            const v = floatBytes.readFloatLE(i);
            const a = Math.abs(v);
            if (a > peakAbs)
                peakAbs = a;
        }
        const t = nowMs();
        if (t - lastWhisperLog >= 1000) {
            console.log(`to whisper: ~${bytesToWhisper} bytes/sec (channel=${channel}), peakAbs=${peakAbs.toFixed(4)}`);
            bytesToWhisper = 0;
            peakAbs = 0;
            lastWhisperLog = t;
        }
    }
    function scheduleForcedStopIfNeeded() {
        if (!stopRequested)
            return;
        if (stopTimer)
            return;
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
    function flushPendingIfReady(ws) {
        if (!whisperReady)
            return;
        while (pendingFloat32.length > 0 && ws.readyState === ws_1.WebSocket.OPEN) {
            const chunk = pendingFloat32.shift();
            if (!chunk)
                break;
            updateWhisperDiagnostics(chunk);
            ws.send(chunk);
        }
    }
    function ensureWhisperConnected() {
        if (!micStreaming)
            return;
        if (stopRequested)
            return;
        const t = nowMs();
        if (nextReconnectAt > t)
            return;
        if (whisperSocket &&
            (whisperSocket.readyState === ws_1.WebSocket.CONNECTING ||
                whisperSocket.readyState === ws_1.WebSocket.OPEN ||
                whisperSocket.readyState === ws_1.WebSocket.CLOSING)) {
            return;
        }
        const ws = new ws_1.WebSocket(config_1.WHISPER_URL);
        whisperSocket = ws;
        whisperReady = false;
        const uid = `equinotes-${channel}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        let readySeenForThisSocket = false;
        ws.on("open", () => {
            console.log(`Connected to WhisperLive: ${config_1.WHISPER_URL} (channel=${channel})`);
            status(`Connected to WhisperLive (${config_1.WHISPER_URL})`);
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
                const b = Buffer.isBuffer(msg) ? msg : (0, audio_1.rawToBuffer)(msg);
                sendToFrontendSafe(b);
                return;
            }
            const text = msg.toString();
            if (!text.includes("SERVER_READY")) {
                console.log(`WhisperLive -> backend (channel=${channel}): ${text.substring(0, 100)}`);
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
            const t2 = tryExtractTranscript(text);
            if (t2 && t2.trim().length > 0) {
                console.log(`📝 TRANSCRIPT (channel=${channel}): "${t2}"`);
                transcript(t2);
            }
        });
        ws.on("close", (code, reason) => {
            const rsn = reason?.toString() ?? "";
            console.log(`WhisperLive WS closed: code=${code} (channel=${channel})`);
            const closedBeforeReady = !readySeenForThisSocket;
            whisperReady = false;
            if (whisperSocket === ws)
                whisperSocket = null;
            if (stopRequested) {
                stopRequested = false;
                clearStopTimer();
                status(`WhisperLive closed (${rsn || "closed"})`);
                return;
            }
            if (!micStreaming)
                return;
            if (closedBeforeReady) {
                consecutiveEarlyCloses += 1;
                if (consecutiveEarlyCloses >= MAX_EARLY_CLOSES) {
                    status("WhisperLive keeps closing before SERVER_READY. Check WhisperLive logs.");
                    micStreaming = false;
                    return;
                }
                nextReconnectAt = nowMs() + backoffMs;
                backoffMs = Math.min(BACKOFF_MAX_MS, backoffMs * 2);
                status("WhisperLive closed early; reconnecting soon...");
            }
            else {
                nextReconnectAt = nowMs() + 750;
                status("WhisperLive connection closed; reconnecting...");
            }
        });
        ws.on("error", (err) => {
            console.error(`WhisperLive WS error (channel=${channel}):`, err);
            whisperReady = false;
            if (whisperSocket === ws)
                whisperSocket = null;
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
        const PCM_CHUNK_BYTES = 8192;
        while (pcmQueue.length >= PCM_CHUNK_BYTES) {
            const pcmChunk = pcmQueue.subarray(0, PCM_CHUNK_BYTES);
            pcmQueue = Buffer.from(pcmQueue.subarray(PCM_CHUNK_BYTES));
            const floatBytes = (0, audio_1.pcm16leToFloat32Bytes)(Buffer.from(pcmChunk));
            const ws = whisperSocket;
            if (ws && ws.readyState === ws_1.WebSocket.OPEN && whisperReady) {
                updateWhisperDiagnostics(floatBytes);
                ws.send(floatBytes);
            }
            else {
                if (pendingFloat32.length < 400)
                    pendingFloat32.push(floatBytes);
            }
        }
    }
    function flushPcmTailToPending() {
        try {
            const evenLen = pcmQueue.length - (pcmQueue.length % 2);
            if (evenLen > 0) {
                const pcmTail = pcmQueue.subarray(0, evenLen);
                pcmQueue = Buffer.alloc(0);
                const floatTail = (0, audio_1.pcm16leToFloat32Bytes)(Buffer.from(pcmTail));
                const ws = whisperSocket;
                if (ws && ws.readyState === ws_1.WebSocket.OPEN && whisperReady) {
                    updateWhisperDiagnostics(floatTail);
                    ws.send(floatTail);
                }
                else {
                    if (pendingFloat32.length < 400)
                        pendingFloat32.push(floatTail);
                }
            }
            else {
                pcmQueue = Buffer.alloc(0);
            }
        }
        catch {
            // ignore
        }
    }
    function requestStopWhisper() {
        micStreaming = false;
        flushPcmTailToPending();
        stopRequested = true;
        stopDeadlineMs = nowMs() + 6000;
        const ws = whisperSocket;
        if (ws && ws.readyState === ws_1.WebSocket.OPEN && whisperReady) {
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
                const msg = `Config set (forced model): model=${config_1.FORCED_MODEL}, lang=${language}, translate=${translate}, vad=${use_vad}`;
                console.log(`${msg} (channel=${channel})`);
                status(msg);
                stopRequested = false;
                clearStopTimer();
                closeWhisperSafe("config_change");
                if (micStreaming)
                    ensureWhisperConnected();
                return;
            }
            raw(`Ignored text: ${text}`);
            return;
        }
        const buf = (0, audio_1.rawToBuffer)(data);
        const evenLen = buf.length - (buf.length % 2);
        if (evenLen <= 0)
            return;
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
            if (ws && ws.readyState === ws_1.WebSocket.OPEN) {
                sendEndOfAudioToWhisper(ws);
            }
        }
        catch {
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
}
