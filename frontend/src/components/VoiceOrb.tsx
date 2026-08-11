import { IconMic } from "./icons";
import type { VoiceStatus } from "../hooks/useVoiceInput";
import { tFarmer } from "../i18n/farmerSimple";
import type { AppLanguage } from "../hooks/useAppSettings";

type Props = {
  status: VoiceStatus;
  isProcessing: boolean;
  isSpeaking: boolean;
  onToggle: () => void;
  language: AppLanguage;
  disabled?: boolean;
};

export function VoiceOrb({
  status,
  isProcessing,
  isSpeaking,
  onToggle,
  language,
  disabled = false,
}: Props) {
  const t = tFarmer(language);
  const isRecording = status === "recording";
  const isTranscribing = status === "transcribing";

  let stateClass = "voice-orb--idle";
  if (isRecording) stateClass = "voice-orb--listening";
  else if (isTranscribing || isProcessing) stateClass = "voice-orb--processing";
  else if (isSpeaking) stateClass = "voice-orb--speaking";

  let label: string = t.tapMic;
  if (isRecording) label = t.listening;
  else if (isTranscribing || isProcessing) label = t.voiceTranscribing;
  else if (isSpeaking) label = t.stopMic;

  return (
    <div className={`voice-orb ${stateClass}`}>
      <button
        type="button"
        className="voice-orb__btn"
        onClick={onToggle}
        disabled={disabled}
        aria-label={label}
        title={label}
      >
        <div className="voice-orb__waves">
          <span className="voice-orb__wave" />
          <span className="voice-orb__wave" />
          <span className="voice-orb__wave" />
        </div>
        <IconMic className="voice-orb__icon" />
      </button>
      <p className="voice-orb__label">{label}</p>
    </div>
  );
}
