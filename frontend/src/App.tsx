// /var/www/html/EquinotesV2/frontend/src/App.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranscriptionSocket } from "./useTranscriptionSocket";
import "./App.css";
import equinotesLogo from "./equinotes.png";

import { Mic, Copy as CopyIcon, Trash2, Download, LogOut, UserRound } from "lucide-react";

import RecentCallsPanel from "./components/RecentCallsPanel";

/** Simple linear resampler to 16kHz */
function resampleTo16k(input: Float32Array, srcRate: number): Float32Array {
  const targetRate = 16000;
  if (srcRate === targetRate) return input;

  const ratio = srcRate / targetRate;
  const newLen = Math.round(input.length / ratio);
  const output = new Float32Array(newLen);

  for (let i = 0; i < newLen; i++) {
    const pos = i * ratio;
    const i0 = Math.floor(pos);
    const i1 = Math.min(i0 + 1, input.length - 1);
    const frac = pos - i0;
    output[i] = input[i0] * (1 - frac) + input[i1] * frac;
  }

  return output;
}

type AudioInputDevice = {
  deviceId: string;
  label: string;
};

function useMicDebugger() {
  const [devices, setDevices] = useState<AudioInputDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | undefined>();
  const [currentLevel, setCurrentLevel] = useState(0);

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);

  function stopMonitor() {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (analyserRef.current) {
      analyserRef.current.disconnect();
      analyserRef.current = null;
    }
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch((err) => {
        console.debug("Error closing debug audio context", err);
      });
      audioContextRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }

  useEffect(() => {
    async function initDevices() {
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true });
        const allDevices = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = allDevices
          .filter((d) => d.kind === "audioinput")
          .map((d) => ({
            deviceId: d.deviceId,
            label: d.label || "Unknown microphone",
          }));

        setDevices(audioInputs);
        if (audioInputs.length > 0 && !selectedDeviceId) {
          setSelectedDeviceId(audioInputs[0].deviceId);
        }
      } catch (err) {
        console.error("Error initializing audio devices", err);
      }
    }

    initDevices();
  }, [selectedDeviceId]);

  useEffect(() => {
    if (!selectedDeviceId) return;

    let cancelled = false;

    async function startMonitor() {
      try {
        stopMonitor();

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: { exact: selectedDeviceId },
          },
        });

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;

        const audioContext = new AudioContext();
        audioContextRef.current = audioContext;

        if (audioContext.state === "suspended") {
          await audioContext.resume();
        }

        const source = audioContext.createMediaStreamSource(stream);
        sourceRef.current = source;

        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 2048;
        analyserRef.current = analyser;

        source.connect(analyser);

        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        const tick = () => {
          if (!analyserRef.current) return;
          analyserRef.current.getByteTimeDomainData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            const v = dataArray[i] - 128;
            sum += v * v;
          }
          const rms = Math.sqrt(sum / dataArray.length);
          const level = Math.min(1, rms / 64);
          setCurrentLevel(level);

          rafRef.current = requestAnimationFrame(tick);
        };

        tick();
      } catch (err) {
        console.error("Error starting mic monitor", err);
      }
    }

    startMonitor();

    return () => {
      cancelled = true;
      stopMonitor();
    };
  }, [selectedDeviceId]);

  return {
    devices,
    selectedDeviceId,
    setSelectedDeviceId,
    currentLevel,
    stopMonitor,
  };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

type BackendEnvelope = {
  type?: unknown;
  channel?: unknown;
  text?: unknown;
  message?: unknown;
};

function getStringField(obj: Record<string, unknown>, key: string): string | null {
  const v = obj[key];
  return typeof v === "string" ? v : null;
}

function parseBackendText(
  raw: string
): { kind: "transcript" | "status" | "info" | "raw"; text: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { kind: "raw", text: "" };

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return { kind: "raw", text: trimmed };

    const env = parsed as BackendEnvelope;
    const rec = parsed as Record<string, unknown>;

    const type = typeof env.type === "string" ? env.type : "";
    const text = typeof env.text === "string" ? env.text : "";
    const message = typeof env.message === "string" ? env.message : "";

    if (type === "transcript" && text.trim().length > 0) {
      return { kind: "transcript", text: text.trim() };
    }

    if (type === "status" && message.trim().length > 0) {
      return { kind: "status", text: message.trim() };
    }

    if (type === "info" && message.trim().length > 0) {
      return { kind: "info", text: message.trim() };
    }

    if (type === "raw") {
      const t = (text || message).trim();
      return { kind: "raw", text: t.length ? t : trimmed };
    }

    const fallback =
      getStringField(rec, "text") ??
      getStringField(rec, "transcript") ??
      getStringField(rec, "message") ??
      trimmed;

    return { kind: "raw", text: fallback.trim().length ? fallback.trim() : trimmed };
  } catch {
    return { kind: "raw", text: trimmed };
  }
}

type Pipe = {
  audioCtxRef: React.MutableRefObject<AudioContext | null>;
  streamRef: React.MutableRefObject<MediaStream | null>;
  sourceRef: React.MutableRefObject<MediaStreamAudioSourceNode | null>;
  procRef: React.MutableRefObject<ScriptProcessorNode | null>;
  pcmQueueRef: React.MutableRefObject<Uint8Array>;
};

type CallStatus = "IDLE" | "ACTIVE" | "SAVED" | "DISCARDED";

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function formatHMS(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return `${pad2(hh)}:${pad2(mm)}:${pad2(ss)}`;
}

function formatMMSS(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${pad2(mm)}:${pad2(ss)}`;
}

function tsTag(totalSeconds: number): string {
  return `[${formatMMSS(totalSeconds)}]`;
}

async function copyToClipboard(text: string): Promise<boolean> {
  const t = text.trim();
  if (!t) return false;

  try {
    await navigator.clipboard.writeText(t);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = t;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      ta.style.top = "-9999px";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

export default function App() {
  const navigate = useNavigate();

  // Auth redirect without breaking SPA routing
  useEffect(() => {
    const storedToken = localStorage.getItem("token");
    if (!storedToken) {
      navigate("/login", { replace: true });
    }
  }, [navigate]);

  const defaultHost = window.location.hostname;
  const [backendHost, setBackendHost] = useState(defaultHost);

  const baseWsUrl = useMemo(() => {
    const pageProto = window.location.protocol;
    if (pageProto === "https:") {
      return `wss://${window.location.host}/ws`;
    }
    return `ws://${backendHost}:3001/ws`;
  }, [backendHost]);

  const wsUrlClient = useMemo(() => `${baseWsUrl}?channel=client`, [baseWsUrl]);
  const wsUrlAgent = useMemo(() => `${baseWsUrl}?channel=agent`, [baseWsUrl]);

  const clientSock = useTranscriptionSocket(wsUrlClient);
  const agentSock = useTranscriptionSocket(wsUrlAgent);

  const [running, setRunning] = useState(false);
  const [agentError, setAgentError] = useState<string>("");
  const [clientError, setClientError] = useState<string>("");

  const agentPipe: Pipe = {
    audioCtxRef: useRef<AudioContext | null>(null),
    streamRef: useRef<MediaStream | null>(null),
    sourceRef: useRef<MediaStreamAudioSourceNode | null>(null),
    procRef: useRef<ScriptProcessorNode | null>(null),
    pcmQueueRef: useRef<Uint8Array>(new Uint8Array(0)),
  };

  const clientPipe: Pipe = {
    audioCtxRef: useRef<AudioContext | null>(null),
    streamRef: useRef<MediaStream | null>(null),
    sourceRef: useRef<MediaStreamAudioSourceNode | null>(null),
    procRef: useRef<ScriptProcessorNode | null>(null),
    pcmQueueRef: useRef<Uint8Array>(new Uint8Array(0)),
  };

  const {
    devices,
    selectedDeviceId: agentDeviceId,
    setSelectedDeviceId: setAgentDeviceId,
    currentLevel: agentLevel,
    stopMonitor,
  } = useMicDebugger();

  const [clientDeviceId, setClientDeviceId] = useState<string | undefined>();

  const effectiveClientDeviceId = useMemo(() => {
    if (clientDeviceId) return clientDeviceId;
    if (devices.length === 0) return undefined;

    const cable = devices.find((d) => d.label.toLowerCase().includes("cable output"));
    return cable?.deviceId ?? devices[0].deviceId;
  }, [clientDeviceId, devices]);

  // Store stamped transcript lines (timestamp is frozen when line arrives)
  const [clientLines, setClientLines] = useState<string[]>([]);
  const [agentLines, setAgentLines] = useState<string[]>([]);

  // Track how many socket messages we already processed (so we only append new ones)
  const lastClientMsgIndexRef = useRef(0);
  const lastAgentMsgIndexRef = useRef(0);

  // Call-local zero time (set from the ACTIVE effect; avoids impurity lint in handlers)
  const callStartPerfRef = useRef<number | null>(null);

  function currentStampSeconds(): number {
    const start = callStartPerfRef.current;
    if (start === null) return 0;
    const s = (performance.now() - start) / 1000;
    return Number.isFinite(s) ? Math.max(0, s) : 0;
  }

  function sendFresh(sendBinaryFn: (buf: ArrayBufferLike) => void, bytes: Uint8Array) {
    if (bytes.byteLength === 0) return;
    const out = new Uint8Array(bytes.byteLength);
    out.set(bytes);
    sendBinaryFn(out.buffer);
  }

  function float32ToPCM16leBytes(input: Float32Array): Uint8Array {
    const out = new Uint8Array(input.length * 2);
    const view = new DataView(out.buffer);
    for (let i = 0; i < input.length; i++) {
      let s = input[i];
      if (s > 1) s = 1;
      else if (s < -1) s = -1;
      const v = s < 0 ? Math.round(s * 32768) : Math.round(s * 32767);
      view.setInt16(i * 2, v, true);
    }
    return out;
  }

  function enqueueAndSendPCM16(
    pipe: Pipe,
    pcm16Bytes: Uint8Array,
    sendBinaryFn: (buf: ArrayBufferLike) => void
  ) {
    if (pcm16Bytes.byteLength === 0) return;

    const incomingLenEven2 = pcm16Bytes.length - (pcm16Bytes.length % 2);
    if (incomingLenEven2 <= 0) return;

    const prev = pipe.pcmQueueRef.current;
    const merged = new Uint8Array(prev.length + incomingLenEven2);
    merged.set(prev, 0);
    merged.set(pcm16Bytes.subarray(0, incomingLenEven2), prev.length);
    pipe.pcmQueueRef.current = merged;

    const CHUNK = 4096;
    while (pipe.pcmQueueRef.current.length >= CHUNK) {
      const chunk = pipe.pcmQueueRef.current.subarray(0, CHUNK);
      pipe.pcmQueueRef.current = pipe.pcmQueueRef.current.subarray(CHUNK);
      sendFresh(sendBinaryFn, chunk);
    }
  }

  async function startPipe(params: {
    pipe: Pipe;
    deviceId: string | undefined;
    socket: typeof agentSock;
    setErr: (s: string) => void;
  }) {
    const { pipe, deviceId, socket, setErr } = params;

    setErr("");

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setErr("Audio API is blocked. Use https:// or http://localhost for dev.");
        return;
      }

      if (socket.status !== "open") {
        setErr("WebSocket is not open yet.");
        return;
      }

      await stopPipe({ pipe, socket });

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          deviceId: deviceId ? { exact: deviceId } : undefined,
        },
        video: false,
      });

      pipe.streamRef.current = stream;

      const ctx = new AudioContext();
      pipe.audioCtxRef.current = ctx;

      if (ctx.state === "suspended") {
        await ctx.resume();
      }

      const source = ctx.createMediaStreamSource(stream);
      pipe.sourceRef.current = source;

      const processor = ctx.createScriptProcessor(512, 1, 1);
      pipe.procRef.current = processor;

      pipe.pcmQueueRef.current = new Uint8Array(0);

      processor.onaudioprocess = (e) => {
        const input = e.inputBuffer.getChannelData(0);
        const resampled = resampleTo16k(input, ctx.sampleRate);
        const pcm16 = float32ToPCM16leBytes(resampled);
        enqueueAndSendPCM16(pipe, pcm16, socket.sendBinary);
      };

      source.connect(processor);
      processor.connect(ctx.destination);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to start audio capture.";
      setErr(msg);
      await stopPipe({ pipe, socket });
    }
  }

  async function stopPipe(params: { pipe: Pipe; socket: typeof agentSock }) {
    const { pipe, socket } = params;

    try {
      const leftover = pipe.pcmQueueRef.current;
      if (leftover.length > 0 && socket.status === "open") {
        const even2 = leftover.length - (leftover.length % 2);
        if (even2 > 0) {
          sendFresh(socket.sendBinary, leftover.subarray(0, even2));
        }
      }
      pipe.pcmQueueRef.current = new Uint8Array(0);
    } catch (e) {
      console.debug("flush leftover ignored", e);
    }

    try {
      if (socket.status === "open") socket.sendText("END_OF_AUDIO");
    } catch (e) {
      console.debug("END_OF_AUDIO send ignored", e);
    }

    try {
      pipe.procRef.current?.disconnect();
    } catch (e) {
      console.debug("proc disconnect ignored", e);
    }

    try {
      pipe.sourceRef.current?.disconnect();
    } catch (e) {
      console.debug("source disconnect ignored", e);
    }

    pipe.procRef.current = null;
    pipe.sourceRef.current = null;

    if (pipe.streamRef.current) {
      pipe.streamRef.current.getTracks().forEach((t) => t.stop());
      pipe.streamRef.current = null;
    }

    if (pipe.audioCtxRef.current) {
      try {
        await pipe.audioCtxRef.current.close();
      } catch (e) {
        console.debug("audio ctx close ignored", e);
      }
      pipe.audioCtxRef.current = null;
    }
  }

  const clientConfigSentRef = useRef(false);
  const agentConfigSentRef = useRef(false);

  const clientSendTextRef = useRef<(text: string) => void>(() => {});
  const agentSendTextRef = useRef<(text: string) => void>(() => {});

  useEffect(() => {
    clientSendTextRef.current = clientSock.sendText;
  }, [clientSock.sendText]);

  useEffect(() => {
    agentSendTextRef.current = agentSock.sendText;
  }, [agentSock.sendText]);

  useEffect(() => {
    if (clientSock.status !== "open") {
      clientConfigSentRef.current = false;
    }
  }, [clientSock.status]);

  useEffect(() => {
    if (agentSock.status !== "open") {
      agentConfigSentRef.current = false;
    }
  }, [agentSock.status]);

  useEffect(() => {
    if (clientSock.status === "open" && !clientConfigSentRef.current) {
      clientSendTextRef.current(JSON.stringify({ type: "config" }));
      clientConfigSentRef.current = true;
    }
  }, [clientSock.status]);

  useEffect(() => {
    if (agentSock.status === "open" && !agentConfigSentRef.current) {
      agentSendTextRef.current(JSON.stringify({ type: "config" }));
      agentConfigSentRef.current = true;
    }
  }, [agentSock.status]);

  const [callId, setCallId] = useState<number | null>(null);
  const [callStatus, setCallStatus] = useState<CallStatus>("IDLE");
  const [needsSaveDiscard, setNeedsSaveDiscard] = useState(false);

  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const perfStartRef = useRef<number | null>(null);
  const timerIntervalRef = useRef<number | null>(null);
  const [timerStartTick, setTimerStartTick] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    if (callStatus !== "ACTIVE") return;

    // Start both: UI timer baseline + transcript timestamp baseline
    const startNow = performance.now();
    perfStartRef.current = startNow;
    callStartPerfRef.current = startNow;

    if (timerIntervalRef.current !== null) {
      window.clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    timerIntervalRef.current = window.setInterval(() => {
      const start = perfStartRef.current;
      if (start === null) return;
      const now = performance.now();
      const secs = (now - start) / 1000;
      setElapsedSeconds(secs);
    }, 250);

    return () => {
      if (timerIntervalRef.current !== null) {
        window.clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    };
  }, [callStatus, timerStartTick]);

  // Append NEW client transcript messages and freeze their timestamp at arrival time
  useEffect(() => {
    const msgs = clientSock.messages ?? [];
    const startIdx = lastClientMsgIndexRef.current;
    const endIdx = msgs.length;
    if (endIdx <= startIdx) return;

    const additions: string[] = [];
    for (let i = startIdx; i < endIdx; i++) {
      const p = parseBackendText(msgs[i]);
      if (p.kind === "transcript" && p.text.length > 0) {
        const tag = tsTag(currentStampSeconds());
        additions.push(`${tag} ${p.text}`);
      }
    }

    lastClientMsgIndexRef.current = endIdx;

    if (additions.length === 0) return;

    // eslint rule: avoid synchronous setState inside effect body
    const t = window.setTimeout(() => {
      setClientLines((prev) => [...prev, ...additions]);
    }, 0);

    return () => window.clearTimeout(t);
  }, [clientSock.messages]);

  // Append NEW agent transcript messages and freeze their timestamp at arrival time
  useEffect(() => {
    const msgs = agentSock.messages ?? [];
    const startIdx = lastAgentMsgIndexRef.current;
    const endIdx = msgs.length;
    if (endIdx <= startIdx) return;

    const additions: string[] = [];
    for (let i = startIdx; i < endIdx; i++) {
      const p = parseBackendText(msgs[i]);
      if (p.kind === "transcript" && p.text.length > 0) {
        const tag = tsTag(currentStampSeconds());
        additions.push(`${tag} ${p.text}`);
      }
    }

    lastAgentMsgIndexRef.current = endIdx;

    if (additions.length === 0) return;

    // eslint rule: avoid synchronous setState inside effect body
    const t = window.setTimeout(() => {
      setAgentLines((prev) => [...prev, ...additions]);
    }, 0);

    return () => window.clearTimeout(t);
  }, [agentSock.messages]);

  const handleLogout = async () => {
    if (running) {
      await stopBoth();
    }

    clearAll();
    setCallStatus("IDLE");

    localStorage.removeItem("token");
    localStorage.removeItem("agent");
    localStorage.removeItem("agentPublicId");

    navigate("/login", { replace: true });
  };

  const confirmLogout = () => {
    setShowLogoutConfirm(true);
  };

  function combinedTranscript(): string {
    const lines: string[] = [];
    for (const t of clientLines) lines.push(`CLIENT: ${t}`);
    for (const t of agentLines) lines.push(`AGENT: ${t}`);
    return lines.join("\n");
  }

  async function startBoth() {
    setAgentError("");
    setClientError("");

    if (running) return;

    const currentToken = localStorage.getItem("token");
    if (!currentToken) {
      navigate("/login", { replace: true });
      return;
    }

    clearAll();

    let newCallId: number | null = null;
    try {
      const res = await fetch("/api/calls", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${currentToken}`,
        },
        body: JSON.stringify({}),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || !data || typeof data.id !== "number") {
        const msg = data?.error || "Failed to create call on server. Please try again.";
        setClientError(msg);
        setAgentError(msg);
        return;
      }

      newCallId = data.id;
      setCallId(newCallId);
    } catch (err) {
      console.error("Error creating call:", err);
      const msg = "Network error while creating call.";
      setClientError(msg);
      setAgentError(msg);
      return;
    }

    try {
      await Promise.all([
        startPipe({
          pipe: clientPipe,
          deviceId: effectiveClientDeviceId,
          socket: clientSock,
          setErr: setClientError,
        }),
        startPipe({
          pipe: agentPipe,
          deviceId: agentDeviceId,
          socket: agentSock,
          setErr: setAgentError,
        }),
      ]);

      setRunning(true);
      setCallStatus("ACTIVE");
      setNeedsSaveDiscard(false);

      setElapsedSeconds(0);
      setTimerStartTick((n) => n + 1);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to start transcription.";
      setClientError((prev) => (prev ? prev : msg));
      setAgentError((prev) => (prev ? prev : msg));
      await stopBoth();
    }
  }

  async function stopBoth() {
    setRunning(false);

    await Promise.all([
      stopPipe({ pipe: clientPipe, socket: clientSock }),
      stopPipe({ pipe: agentPipe, socket: agentSock }),
    ]);

    stopMonitor();

    perfStartRef.current = null;
    if (timerIntervalRef.current !== null) {
      window.clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    setNeedsSaveDiscard(true);
  }

  function clearAll() {
    clientSock.clear();
    agentSock.clear();

    // reset stamped transcript state + message cursors
    setClientLines([]);
    setAgentLines([]);
    lastClientMsgIndexRef.current = 0;
    lastAgentMsgIndexRef.current = 0;

    // reset call-local clock
    callStartPerfRef.current = null;
  }

  async function saveCall() {
    const currentToken = localStorage.getItem("token");
    const currentCallId = callId;

    if (currentToken && currentCallId) {
      const durationSec = Math.round(elapsedSeconds);

      try {
        await fetch(`/api/calls/${currentCallId}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${currentToken}`,
          },
          body: JSON.stringify({
            status: "saved",
            durationSec,
            combinedTranscript: combinedTranscript(),
            clientTranscript: clientLines.join("\n"),
            agentTranscript: agentLines.join("\n"),
          }),
        });
      } catch (err) {
        console.error("Failed to save call:", err);
      }
    }

    setCallStatus("SAVED");
    setNeedsSaveDiscard(false);
    setElapsedSeconds(0);
  }

  async function discardCall() {
    const currentToken = localStorage.getItem("token");
    const currentCallId = callId;
    const durationSec = Math.round(elapsedSeconds);

    if (currentToken && currentCallId) {
      try {
        await fetch(`/api/calls/${currentCallId}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${currentToken}`,
          },
          body: JSON.stringify({
            status: "discarded",
            durationSec,
          }),
        });
      } catch (err) {
        console.error("Failed to discard call:", err);
      }
    }

    await stopBoth();
    clearAll();
    setCallStatus("DISCARDED");
    setElapsedSeconds(0);
  }

  const canStart =
    clientSock.status === "open" &&
    agentSock.status === "open" &&
    Boolean(effectiveClientDeviceId) &&
    Boolean(agentDeviceId);

  async function onCopyCombined() {
    const ok = await copyToClipboard(combinedTranscript());
    if (!ok) {
      alert("Copy failed (browser blocked clipboard).");
    }
  }

  function Bubble(props: { side: "left" | "right"; text: string; idx: number }) {
    const isLeft = props.side === "left";
    return (
      <div className={`bubbleRow ${isLeft ? "left" : "right"}`}>
        <button
          type="button"
          className={`bubble ${isLeft ? "client" : "agent"}`}
          onClick={async () => {
            const ok = await copyToClipboard(props.text);
            if (!ok) alert("Copy failed (browser blocked clipboard).");
          }}
          title="Click to copy"
        >
          {props.text}
        </button>
      </div>
    );
  }

  const showDevBackendHost = window.location.protocol !== "https:";

  return (
    <div className="appShell">
      <header className="topbar">
        <div className="brand">
          <img className="brandLogo" src={equinotesLogo} alt="EquiNotes" />
          <div className="brandName">EquiNotes</div>
        </div>

        <div className="topbarRight">
          <button className="topbarBtn" type="button" onClick={() => navigate("/profile")}>
            <span className="avatar">H</span>
            <span className="topbarBtnText">Profile</span>
            <UserRound size={18} />
          </button>

          <button className="topbarBtn logout" type="button" onClick={confirmLogout}>
            <span className="topbarBtnText">Logout</span>
            <LogOut size={18} />
          </button>
        </div>
      </header>

      <main className="content">
        <div className="grid">
          <section className="card liveCard">
            <div className="cardHeader">
              <div className="cardTitle">
                <span className="iconBadge">
                  <Mic size={18} />
                </span>
                <div>
                  <div className="titleText">Live Transcript</div>
                  <div className="subtitleText">Call ID: #{callId !== null ? callId : "—"}</div>
                </div>
              </div>

              <div className={`statusPill ${callStatus.toLowerCase()}`}>{callStatus}</div>
            </div>

            <div className="liveTools">
              <div className="deviceGroup">
                <div className="deviceLabel">Client input</div>
                <select
                  className="select"
                  value={effectiveClientDeviceId}
                  onChange={(e) => setClientDeviceId(e.target.value)}
                  disabled={running}
                >
                  {devices.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label || d.deviceId}
                    </option>
                  ))}
                </select>
              </div>

              <div className="deviceGroup">
                <div className="deviceLabel">Agent input</div>
                <select
                  className="select"
                  value={agentDeviceId}
                  onChange={(e) => setAgentDeviceId(e.target.value)}
                  disabled={running}
                >
                  {devices.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label || d.deviceId}
                    </option>
                  ))}
                </select>
              </div>

              <div className="levelGroup">
                <div className="levelLabel">agent</div>
                <div className="meter">
                  <div
                    className={`meterFill ${agentLevel > 0.7 ? "hot" : ""}`}
                    style={{ width: `${Math.round(agentLevel * 100)}%` }}
                  />
                </div>
              </div>
            </div>

            {showDevBackendHost ? (
              <div className="devRow">
                <div className="devLabel">Backend IP (dev only)</div>
                <input
                  className="input"
                  value={backendHost}
                  onChange={(e) => setBackendHost(e.target.value)}
                  placeholder="10.10.1.243"
                />
                <div className="devStatus">
                  <span>
                    Client: <b>{clientSock.status}</b>
                  </span>
                  <span>
                    Agent: <b>{agentSock.status}</b>
                  </span>
                </div>
              </div>
            ) : null}

            {clientError ? (
              <div className="errorBox">
                <b>Client audio error:</b> {clientError}
              </div>
            ) : null}

            {agentError ? (
              <div className="errorBox">
                <b>Agent mic error:</b> {agentError}
              </div>
            ) : null}

            <div className="transcriptArea">
              <div className="columnsHeader">
                <div>client</div>
                <div className="rightHead">agent</div>
              </div>

              <div className="columns">
                <div className="col">
                  {clientLines.length === 0 ? (
                    <div className="emptyText">{running ? "Listening…" : "Press Start to begin."}</div>
                  ) : (
                    clientLines.map((t, i) => <Bubble key={`c-${i}`} side="left" text={t} idx={i} />)
                  )}
                </div>

                <div className="col">
                  {agentLines.length === 0 ? (
                    <div className="emptyText">{running ? "Listening…" : "Press Start to begin."}</div>
                  ) : (
                    agentLines.map((t, i) => <Bubble key={`a-${i}`} side="right" text={t} idx={i} />)
                  )}
                </div>
              </div>
            </div>

            <div className="bottomActions">
              {needsSaveDiscard ? (
                <>
                  <button className="btn primary" type="button" onClick={saveCall}>
                    <Download size={18} />
                    Save
                  </button>

                  <button className="btn danger" type="button" onClick={discardCall}>
                    <Trash2 size={18} />
                    Discard
                  </button>
                </>
              ) : null}

              <button className="btn primary" type="button" onClick={onCopyCombined}>
                <CopyIcon size={18} />
                Copy
              </button>
            </div>
          </section>

          <aside className="rightRail">
            <section className="card controlsCard">
              <div className="controlsTitle">Call Controls</div>

              <div className="timer">{formatHMS(elapsedSeconds)}</div>

              {!running ? (
                <button
                  className="btn startBtn"
                  type="button"
                  onClick={startBoth}
                  disabled={!canStart}
                  title={!canStart ? "Wait for both sockets and devices to be ready" : ""}
                >
                  <Mic size={18} />
                  Start
                </button>
              ) : (
                <button className="btn startBtn" type="button" onClick={stopBoth}>
                  <Mic size={18} />
                  Stop
                </button>
              )}
            </section>

            {/* Recent Calls moved into its own component */}
            <RecentCallsPanel />
          </aside>
        </div>
      </main>

      {showLogoutConfirm && (
        <div className="modalOverlay">
          <div className="modalContent">
            <h3>Confirm Logout</h3>
            <p>Are you sure you want to logout?</p>
            <div className="modalActions">
              <button className="btn secondary" onClick={() => setShowLogoutConfirm(false)}>
                Cancel
              </button>
              <button className="btn danger" onClick={handleLogout}>
                Yes, Logout
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
