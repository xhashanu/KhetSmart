import { useState } from "react";
import { transcribeVoiceAudio } from "../api";
import { IconMic } from "./icons";
import { useVoiceInput } from "../hooks/useVoiceInput";
import type { AppLanguage } from "../hooks/useAppSettings";
import { tFarmer } from "../i18n/farmerSimple";

type Props = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  inputError?: string | null;
  language?: AppLanguage;
};

export function FarmerVoiceInput({
  value,
  onChange,
  placeholder,
  disabled = false,
  inputError = null,
  language = "bn",
}: Props) {
  const t = tFarmer(language);
  const [transcribing, setTranscribing] = useState(false);

  const voice = useVoiceInput(async (blob) => {
    setTranscribing(true);
    try {
      const { text } = await transcribeVoiceAudio(blob, language);
      if (text.trim()) {
        const merged = value.trim() ? `${value.trim()} ${text.trim()}` : text.trim();
        onChange(merged);
      }
    } catch {
      /* error shown via voice.error from hook if mic fails; STT errors stay silent */
    } finally {
      setTranscribing(false);
    }
  }, language);

  const busy = voice.isListening || transcribing || voice.status === "transcribing";

  return (
    <div className="farmer-voice farmer-voice--simple">
      <div className="farmer-voice__head">
        <p className="farmer-voice__title">{t.speakOrWrite}</p>
        <button
          type="button"
          className={`farmer-voice__mic farmer-voice__mic--top ${voice.isRecording ? "farmer-voice__mic--on" : ""}`}
          onClick={voice.toggle}
          disabled={disabled || voice.status === "unsupported" || busy}
          aria-pressed={voice.isRecording}
          aria-label={voice.isRecording ? t.stopMic : t.tapMic}
          title={voice.isRecording ? t.stopMic : t.tapMic}
        >
          <IconMic className="farmer-voice__mic-icon" />
          {voice.isRecording && <span className="farmer-voice__mic-ring" aria-hidden />}
        </button>
      </div>

      <div
        className={`farmer-voice__composer ${voice.isRecording ? "farmer-voice__composer--listening" : ""}`}
      >
        <textarea
          className="farmer-voice__input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder ?? t.voicePlaceholder}
          aria-label={t.speakOrWrite}
          disabled={disabled}
          rows={2}
        />
      </div>

      {!busy && !voice.error && voice.supported && (
        <p className="farmer-voice__tip">{voice.voiceTip}</p>
      )}

      {busy && (
        <p className="farmer-voice__listening farmer-voice__listening--ai">
          <span className="farmer-voice__dot" aria-hidden />
          {transcribing ? t.voiceTranscribing : voice.statusLine}
        </p>
      )}

      {(voice.error || voice.status === "unsupported") && (
        <p className="farmer-voice__hint" role="alert">
          {voice.error ?? t.voiceErrUnsupported}
        </p>
      )}

      {inputError && (
        <p className="farmer-voice__input-error" role="alert">
          {inputError}
        </p>
      )}
    </div>
  );
}
