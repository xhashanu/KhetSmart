import { useEffect, useRef, useState } from "react";
import type { ConsultResponse } from "../api";
import { useVoiceAssistant } from "../hooks/useVoiceAssistant";
import { useVoiceInput } from "../hooks/useVoiceInput";
import type { AppLanguage } from "../hooks/useAppSettings";
import { tFarmer } from "../i18n/farmerSimple";
import { VoiceConversation } from "./VoiceConversation";
import { VoiceDebugPanel } from "./VoiceDebugPanel";
import { VoiceOrb } from "./VoiceOrb";

type Props = {
  language: AppLanguage;
  compact?: boolean;
  onConsultReady: (
    consult: ConsultResponse,
    harvest: { quantity_quintals: number; crop: string; district?: string | null }
  ) => void;
  onExecuteAction: (action: string) => void;
  context?: Record<string, unknown>;
};

export function VoiceAssistantPanel({
  language,
  compact = false,
  onConsultReady,
  onExecuteAction,
  context,
}: Props) {
  const t = tFarmer(language);
  const assistant = useVoiceAssistant();
  const [textInput, setTextInput] = useState("");
  const [showText, setShowText] = useState(false);
  const lastConsultRef = useRef<string | null>(null);
  const lastActionRef = useRef<string | null>(null);

  const voice = useVoiceInput((blob, captureDiagnostics) => {
    void assistant.processAudio(blob, captureDiagnostics, context);
  }, language);

  useEffect(() => {
    const consult = assistant.lastConsult;
    if (!consult) return;
    const key = `${consult.route.storage_id}-${consult.parsed.quantity_quintals}-${consult.parsed.crop}`;
    if (lastConsultRef.current === key) return;
    lastConsultRef.current = key;
    onConsultReady(consult, {
      quantity_quintals: consult.parsed.quantity_quintals,
      crop: consult.parsed.crop,
      district: consult.parsed.district,
    });
  }, [assistant.lastConsult, onConsultReady]);

  useEffect(() => {
    const resp = assistant.lastResponse;
    if (!resp?.suggested_actions?.length || resp.needs_confirmation) return;
    const action = resp.suggested_actions[0];
    if (!action || lastActionRef.current === action) return;
    lastActionRef.current = action;
    onExecuteAction(action);
  }, [assistant.lastResponse, onExecuteAction]);

  const handleSubmitText = (e: React.FormEvent) => {
    e.preventDefault();
    if (textInput.trim()) {
      void assistant.processText(textInput.trim(), context);
      setTextInput("");
      setShowText(false);
    }
  };

  const confirmYesLabel = (lang: string) => {
    if (lang === "bn") return "হ্যাঁ, ঠিক আছে";
    if (lang === "hi") return "हाँ, सही है";
    if (lang === "ta") return "ஆம், சரி";
    if (lang === "te") return "అవును, సరే";
    if (lang === "mr") return "हो, बरोबर";
    return "Yes, continue";
  };

  const confirmNoLabel = (lang: string) => {
    if (lang === "bn") return "না, পরিবর্তন করুন";
    if (lang === "hi") return "नहीं, बदलें";
    if (lang === "ta") return "இல்லை, மாற்று";
    if (lang === "te") return "లేదు, మార్చు";
    if (lang === "mr") return "नाही, बदला";
    return "No, change";
  };

  const convLang = assistant.conversationState.conversation_language || "en";

  const showConfirm =
    assistant.phase === "confirming" || assistant.lastResponse?.needs_confirmation;

  const phaseLabel = voice.isRecording
    ? voice.statusLine
    : assistant.phase === "processing" || assistant.phase === "executing"
      ? t.voiceTranscribing
      : assistant.phase === "confirming"
        ? t.voiceConfirmPrompt
        : voice.statusLine;

  return (
    <section
      className={`visual-card voice-panel animate-in${compact ? " voice-panel--compact" : ""}`}
    >
      <div className="voice-panel__header">
        <h2 className="voice-panel__title">{t.voicePanelTitle}</h2>
        {assistant.phase !== "idle" && (
          <span className="voice-panel__phase" data-phase={assistant.phase}>
            {assistant.phase.replace("_", " ")}
          </span>
        )}
      </div>

      <VoiceConversation
        messages={assistant.messages}
        isListening={voice.isRecording}
        statusLine={phaseLabel}
      />

      {(voice.error || assistant.phase === "idle") && voice.error && (
        <p className="voice-panel__error" role="alert">
          {voice.error}
        </p>
      )}

      {voice.geminiAvailable === false && (
        <p className="voice-panel__warn" role="status">
          {language === "bn"
            ? "ভয়েস STT সার্ভারে সেটআপ নেই। নিচে লিখে পাঠান।"
            : language === "hi"
              ? "Voice STT server par setup nahi hai. Neeche type karke bhejein."
              : "Voice STT is not configured on the server. Type your message below."}
        </p>
      )}

      {showConfirm && (
        <div className="voice-panel__confirm-actions">
          <button
            type="button"
            className="btn-primary"
            onClick={() => void assistant.confirmYes(context)}
            disabled={assistant.isProcessing}
          >
            ✓ {confirmYesLabel(convLang)}
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => void assistant.confirmNo(context)}
            disabled={assistant.isProcessing}
          >
            ✕ {confirmNoLabel(convLang)}
          </button>
        </div>
      )}

      <div className="voice-panel__controls">
        <VoiceOrb
          status={voice.status}
          isProcessing={assistant.isProcessing}
          isSpeaking={assistant.isSpeaking}
          onToggle={voice.toggle}
          language={language}
          disabled={assistant.isProcessing && !voice.isRecording}
        />

        <p className="voice-panel__stt-tag">
          STT: {voice.sttProvider}
          {voice.diagnostics.audioBytes > 0 && ` · ${voice.diagnostics.audioBytes} B`}
        </p>

        {!showText && (
          <button
            type="button"
            className="voice-panel__write-toggle"
            onClick={() => setShowText(true)}
          >
            ✍️ {t.voiceTypeInstead}
          </button>
        )}

        {showText && (
          <form onSubmit={handleSubmitText} className="voice-panel__form">
            <input
              type="text"
              className="farmer-voice__input"
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder={t.voicePlaceholder}
              disabled={assistant.isProcessing}
            />
            <button
              type="submit"
              className="btn-primary"
              disabled={!textInput.trim() || assistant.isProcessing}
            >
              Send
            </button>
          </form>
        )}
      </div>

      <VoiceDebugPanel debug={assistant.debugInfo} show={import.meta.env.DEV} />
    </section>
  );
}
