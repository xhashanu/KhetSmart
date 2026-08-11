import { useState, useCallback, useRef } from "react";
import {
  converseFarmer,
  type ConsultResponse,
  type VoiceConverseResponse,
  type VoiceConversationState,
} from "../api";
import { useTTS } from "./useTTS";
import type { VoiceDiagnostics } from "./useVoiceInput";

export type VoicePhase =
  | "idle"
  | "listening"
  | "processing"
  | "confirming"
  | "executing"
  | "result";

export interface Message {
  id: string;
  role: "farmer" | "assistant";
  text: string;
  lang?: string;
  sttProvider?: string;
}

export interface VoiceDebugInfo {
  phase: VoicePhase;
  microphone: string;
  audio: string;
  stt: string;
  transcript: string;
  detectedLanguage: string;
  conversationLanguage: string;
  intent: string;
  entities: string;
  backendApi: string;
  tts: string;
  sttProvider: string;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      resolve(dataUrl.split(",")[1] ?? "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function diagToDebug(
  phase: VoicePhase,
  resp: VoiceConverseResponse | null,
  captureDiag: VoiceDiagnostics | null
): VoiceDebugInfo {
  const d = resp?.diagnostics;
  return {
    phase,
    microphone: captureDiag?.microphone ?? d?.microphone ?? "—",
    audio: captureDiag
      ? captureDiag.audioCaptured
        ? `CAPTURED (${captureDiag.audioBytes} bytes, ${captureDiag.audioMime})`
        : "EMPTY"
      : d?.audio_captured
        ? `CAPTURED (${d.audio_bytes} bytes)`
        : "—",
    stt: d?.stt_status ?? "—",
    transcript: resp?.transcribed_text ?? "—",
    detectedLanguage: resp?.detected_language ?? "—",
    conversationLanguage: resp?.conversation_language ?? "—",
    intent: resp?.intent ?? "—",
    entities: resp?.entities ? JSON.stringify(resp.entities) : "—",
    backendApi: d?.backend_api ?? (resp?.consult_result ? "consult OK" : "—"),
    tts: d?.tts_status ?? "—",
    sttProvider: resp?.stt_provider ?? captureDiag?.sttProvider ?? "—",
  };
}

export function useVoiceAssistant() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [phase, setPhase] = useState<VoicePhase>("idle");
  const [isProcessing, setIsProcessing] = useState(false);
  const [conversationState, setConversationState] = useState<VoiceConversationState>({
    phase: "idle",
    conversation_language: "en",
    pending_harvest: null,
    last_consult: false,
  });
  const [lastResponse, setLastResponse] = useState<VoiceConverseResponse | null>(null);
  const [lastConsult, setLastConsult] = useState<ConsultResponse | null>(null);
  const [debugInfo, setDebugInfo] = useState<VoiceDebugInfo | null>(null);
  const [captureDiag, setCaptureDiag] = useState<VoiceDiagnostics | null>(null);

  const convStateRef = useRef(conversationState);
  convStateRef.current = conversationState;

  const { speak, stop: stopTTS, isSpeaking } = useTTS();

  const addMessage = useCallback(
    (role: "farmer" | "assistant", text: string, lang?: string, sttProvider?: string) => {
      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          role,
          text,
          lang,
          sttProvider,
        },
      ]);
    },
    []
  );

  const clearConversation = useCallback(() => {
    setMessages([]);
    setLastResponse(null);
    setLastConsult(null);
    setConversationState({
      phase: "idle",
      conversation_language: "en",
      pending_harvest: null,
      last_consult: false,
    });
    setPhase("idle");
    setDebugInfo(null);
    setCaptureDiag(null);
    stopTTS();
  }, [stopTTS]);

  const applyResponse = useCallback(
    (response: VoiceConverseResponse, capDiag: VoiceDiagnostics | null) => {
      setLastResponse(response);

      const newPhase = (response.phase as VoicePhase) || "idle";
      setPhase(newPhase);

      if (response.conversation_state) {
        setConversationState(response.conversation_state);
      }

      if (response.consult_result) {
        setLastConsult(response.consult_result as ConsultResponse);
      }

      setDebugInfo(diagToDebug(newPhase, response, capDiag));

      const replyText =
        response.needs_confirmation && response.confirmation_text
          ? response.confirmation_text
          : response.response_text;

      if (replyText) {
        addMessage(
          "assistant",
          replyText,
          response.conversation_language || response.detected_language,
          response.stt_provider ?? undefined
        );
        speak(
          replyText,
          response.conversation_language || response.detected_language,
          response.response_audio_base64
        );
      }
    },
    [addMessage, speak]
  );

  const sendTurn = useCallback(
    async (
      opts: {
        text?: string;
        audioBlob?: Blob;
        captureDiagnostics?: VoiceDiagnostics;
        context?: Record<string, unknown>;
      }
    ) => {
      const { text, audioBlob, captureDiagnostics, context } = opts;
      if (!text?.trim() && !audioBlob) return;

      stopTTS();
      setIsProcessing(true);
      setPhase(audioBlob ? "processing" : phase === "confirming" ? "executing" : "processing");

      if (captureDiagnostics) setCaptureDiag(captureDiagnostics);

      if (text?.trim()) {
        addMessage("farmer", text.trim(), conversationState.conversation_language);
      } else if (audioBlob) {
        addMessage("farmer", "🎙️ …", conversationState.conversation_language, "Gemini");
      }

      try {
        let base64Audio: string | null = null;
        let audioMime: string | null = null;
        if (audioBlob) {
          base64Audio = await blobToBase64(audioBlob);
          audioMime = audioBlob.type;
        }

        const loc = context?.location as { lat?: number; lng?: number } | undefined;
        const response = await converseFarmer({
          text: text?.trim() || null,
          context,
          conversationState: convStateRef.current,
          audioBase64: base64Audio,
          audioMime,
          farmerLat: loc?.lat,
          farmerLng: loc?.lng,
        });

        if (response.transcribed_text && audioBlob) {
          setMessages((prev) => {
            const next = [...prev];
            for (let i = next.length - 1; i >= 0; i--) {
              if (next[i].role === "farmer" && next[i].text.startsWith("🎙️")) {
                next[i] = {
                  ...next[i],
                  text: response.transcribed_text!,
                  sttProvider: response.stt_provider ?? "Gemini",
                };
                break;
              }
            }
            return next;
          });
        }

        applyResponse(response, captureDiagnostics ?? null);
      } catch (err) {
        console.error("[Voice] pipeline error:", err);
        const lang = convStateRef.current.conversation_language || "en";
        const errMsg =
          lang === "bn"
            ? "মাফ করবেন, আমি বুঝতে পারিনি। আবার বলুন।"
            : lang === "hi"
              ? "Maaf kijiye, main samajh nahi paya. Kripya phir se bolein."
              : "Sorry, I couldn't understand that. Please say it again.";
        addMessage("assistant", errMsg, lang);
        speak(errMsg, lang);
        setPhase("idle");
        setDebugInfo({
          phase: "idle",
          microphone: captureDiagnostics?.microphone ?? "—",
          audio: captureDiagnostics?.audioCaptured ? "CAPTURED" : "FAILED",
          stt: "FAILED",
          transcript: "—",
          detectedLanguage: lang,
          conversationLanguage: lang,
          intent: "ERROR",
          entities: "—",
          backendApi: String(err),
          tts: "browser",
          sttProvider: "—",
        });
      } finally {
        setIsProcessing(false);
      }
    },
    [addMessage, applyResponse, phase, speak, stopTTS, conversationState.conversation_language]
  );

  const processAudio = useCallback(
    (blob: Blob, captureDiagnostics: VoiceDiagnostics, context?: Record<string, unknown>) => {
      setPhase("processing");
      return sendTurn({ audioBlob: blob, captureDiagnostics, context });
    },
    [sendTurn]
  );

  const processText = useCallback(
    (text: string, context?: Record<string, unknown>) => {
      return sendTurn({ text, context });
    },
    [sendTurn]
  );

  const confirmYes = useCallback(
    (context?: Record<string, unknown>) => {
      const lang = convStateRef.current.conversation_language || "en";
      const yesMap: Record<string, string> = {
        bn: "হ্যাঁ",
        hi: "haan",
        ta: "ஆம்",
        te: "avunu",
        mr: "ho",
        en: "yes",
      };
      return sendTurn({ text: yesMap[lang] || "yes", context });
    },
    [sendTurn]
  );

  const confirmNo = useCallback(
    (context?: Record<string, unknown>) => {
      const lang = convStateRef.current.conversation_language || "en";
      const noMap: Record<string, string> = {
        bn: "না",
        hi: "nahi",
        ta: "illai",
        te: "ledu",
        mr: "nahi",
        en: "no",
      };
      return sendTurn({ text: noMap[lang] || "no", context });
    },
    [sendTurn]
  );

  return {
    messages,
    phase,
    isProcessing,
    isSpeaking,
    lastResponse,
    lastConsult,
    conversationState,
    debugInfo,
    captureDiag,
    processAudio,
    processText,
    confirmYes,
    confirmNo,
    clearConversation,
    stopSpeaking: stopTTS,
  };
}
