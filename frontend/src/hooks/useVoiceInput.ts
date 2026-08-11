import { useCallback, useEffect, useRef, useState } from "react";
import { fetchVoiceConfig } from "../api";
import { tFarmer } from "../i18n/farmerSimple";
import type { AppLanguage } from "./useAppSettings";

export type VoiceStatus =
  | "idle"
  | "recording"
  | "transcribing"
  | "unsupported"
  | "denied"
  | "error";

export type VoiceDiagnostics = {
  microphone: "unknown" | "connected" | "failed" | "denied";
  audioCaptured: boolean;
  audioBytes: number;
  audioMime: string | null;
  sttProvider: "Gemini" | "none" | null;
  errorDetail: string | null;
};

function pickMimeType(): string {
  const types = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4",
  ];
  for (const t of types) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) {
      return t;
    }
  }
  return "audio/webm";
}

const EMPTY_DIAG: VoiceDiagnostics = {
  microphone: "unknown",
  audioCaptured: false,
  audioBytes: 0,
  audioMime: null,
  sttProvider: null,
  errorDetail: null,
};

export function useVoiceInput(
  onAudioReady: (blob: Blob, diagnostics: VoiceDiagnostics) => void,
  language: AppLanguage = "bn"
) {
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [geminiAvailable, setGeminiAvailable] = useState<boolean | null>(null);
  const [diagnostics, setDiagnostics] = useState<VoiceDiagnostics>(EMPTY_DIAG);
  const [recordingMs, setRecordingMs] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const mountedRef = useRef(true);
  const onReadyRef = useRef(onAudioReady);
  const recordStartRef = useRef<number>(0);
  const timerRef = useRef<number | null>(null);

  onReadyRef.current = onAudioReady;
  const t = tFarmer(language);

  const recordSupported =
    typeof navigator !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia) &&
    typeof MediaRecorder !== "undefined";

  useEffect(() => {
    fetchVoiceConfig()
      .then((cfg) => setGeminiAvailable(cfg.gemini_stt))
      .catch(() => setGeminiAvailable(false));
  }, []);

  const stopMediaStream = useCallback(() => {
    mediaStreamRef.current?.getTracks().forEach((tr) => tr.stop());
    mediaStreamRef.current = null;
  }, []);

  const resetIdle = useCallback(() => {
    if (!mountedRef.current) return;
    setStatus("idle");
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setRecordingMs(0);
  }, []);

  const startRecording = useCallback(async () => {
    if (!recordSupported) {
      setStatus("unsupported");
      setError(t.voiceErrUnsupported);
      setDiagnostics({ ...EMPTY_DIAG, microphone: "failed", errorDetail: "MediaRecorder unavailable" });
      return;
    }

    if (geminiAvailable === false) {
      setStatus("error");
      setError(
        language === "bn"
          ? "ভয়েসের জন্য সার্ভার STT সেটআপ দরকার (GEMINI_API_KEY)। লিখে জানান।"
          : language === "hi"
            ? "Voice ke liye server STT (GEMINI_API_KEY) chahiye. Type karke bataiye."
            : "Voice requires server STT (GEMINI_API_KEY). Please type instead."
      );
      setDiagnostics({ ...EMPTY_DIAG, sttProvider: "none", errorDetail: "gemini_not_configured" });
      return;
    }

    setError(null);
    setDiagnostics({ ...EMPTY_DIAG, microphone: "unknown" });

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      const tracks = stream.getAudioTracks();
      if (!tracks.length || tracks.every((tr) => tr.readyState !== "live")) {
        stopMediaStream();
        setStatus("error");
        setError(t.voiceErrMic);
        setDiagnostics({
          ...EMPTY_DIAG,
          microphone: "failed",
          errorDetail: "No live audio tracks",
        });
        return;
      }

      mediaStreamRef.current = stream;
      const mime = pickMimeType();
      const mr = new MediaRecorder(stream, { mimeType: mime });
      audioChunksRef.current = [];

      mr.ondataavailable = (ev) => {
        if (ev.data.size > 0) audioChunksRef.current.push(ev.data);
      };

      mr.start(200);
      mediaRecorderRef.current = mr;
      recordStartRef.current = Date.now();
      timerRef.current = window.setInterval(() => {
        setRecordingMs(Date.now() - recordStartRef.current);
      }, 200);

      setDiagnostics({
        microphone: "connected",
        audioCaptured: false,
        audioBytes: 0,
        audioMime: mime,
        sttProvider: "Gemini",
        errorDetail: null,
      });
      setStatus("recording");
    } catch (err) {
      stopMediaStream();
      const name = err instanceof DOMException ? err.name : "unknown";
      setStatus(name === "NotAllowedError" ? "denied" : "error");
      setError(t.voiceErrMic);
      setDiagnostics({
        ...EMPTY_DIAG,
        microphone: name === "NotAllowedError" ? "denied" : "failed",
        errorDetail: name,
      });
    }
  }, [geminiAvailable, language, recordSupported, stopMediaStream, t]);

  const stopRecording = useCallback(async () => {
    const mr = mediaRecorderRef.current;
    if (!mr || mr.state === "inactive") {
      stopMediaStream();
      resetIdle();
      return;
    }

    setStatus("transcribing");

    try {
      await new Promise<void>((resolve) => {
        mr.onstop = () => resolve();
        try {
          mr.stop();
        } catch {
          resolve();
        }
      });

      mediaRecorderRef.current = null;
      stopMediaStream();

      const mime = mr.mimeType || "audio/webm";
      const blob = new Blob(audioChunksRef.current, { type: mime });
      audioChunksRef.current = [];

      const diag: VoiceDiagnostics = {
        microphone: "connected",
        audioCaptured: blob.size >= 400,
        audioBytes: blob.size,
        audioMime: mime,
        sttProvider: "Gemini",
        errorDetail: blob.size < 400 ? "audio_too_short" : null,
      };
      setDiagnostics(diag);

      if (blob.size < 400) {
        setStatus("error");
        setError(t.voiceErrNoSpeech);
        return;
      }

      onReadyRef.current(blob, diag);
      setError(null);
      resetIdle();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "recording_failed";
      setStatus("error");
      setError(t.voiceErrFailed);
      setDiagnostics((d) => ({ ...d, errorDetail: msg }));
      resetIdle();
    }
  }, [resetIdle, stopMediaStream, t]);

  const toggle = useCallback(() => {
    if (status === "recording") {
      void stopRecording();
    } else if (status === "transcribing") {
      return;
    } else {
      void startRecording();
    }
  }, [startRecording, status, stopRecording]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stopMediaStream();
      if (timerRef.current) window.clearInterval(timerRef.current);
      if (mediaRecorderRef.current?.state === "recording") {
        try {
          mediaRecorderRef.current.stop();
        } catch {
          /* ignore */
        }
      }
    };
  }, [stopMediaStream]);

  const isActive = status === "recording" || status === "transcribing";

  const statusLine =
    status === "recording"
      ? `${t.voiceRecording}${recordingMs > 0 ? ` (${(recordingMs / 1000).toFixed(1)}s)` : ""}`
      : status === "transcribing"
        ? t.voiceTranscribing
        : geminiAvailable === false
          ? t.voiceErrFailed
          : t.voiceGeminiListening;

  return {
    supported: recordSupported,
    geminiAvailable,
    status,
    error,
    diagnostics,
    isListening: isActive,
    isRecording: status === "recording",
    statusLine,
    sttProvider: "Gemini" as const,
    start: toggle,
    stop: () => void stopRecording(),
    toggle,
    voiceTip: t.voiceGeminiTip,
  };
}
