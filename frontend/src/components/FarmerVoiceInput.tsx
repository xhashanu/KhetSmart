import { IconMic } from "./icons";
import { useVoiceInput } from "../hooks/useVoiceInput";

type Props = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  inputError?: string | null;
};

export function FarmerVoiceInput({
  value,
  onChange,
  placeholder = "Amar 50 quintal Jyoti aloo ache",
  disabled = false,
  inputError = null,
}: Props) {
  const voice = useVoiceInput((spoken) => {
    const merged = value.trim() ? `${value.trim()} ${spoken}` : spoken;
    onChange(merged);
  });

  return (
    <div className="farmer-voice">
      <div className="farmer-voice__head">
        <span className="farmer-voice__label-text">বলুন বা লিখুন</span>
        <button
          type="button"
          className={`farmer-voice__mic ${voice.isListening ? "farmer-voice__mic--on" : ""}`}
          onClick={voice.toggle}
          disabled={disabled || voice.status === "unsupported"}
          aria-pressed={voice.isListening}
          aria-label={voice.isListening ? "Stop listening" : "Start voice input"}
          title={
            voice.status === "unsupported"
              ? "Voice not supported in this browser"
              : voice.isListening
                ? "Tap to stop"
                : "Tap to speak"
          }
        >
          <IconMic className="farmer-voice__mic-icon" />
          {voice.isListening && <span className="farmer-voice__mic-ring" aria-hidden />}
        </button>
      </div>

      {voice.isListening && (
        <p className="farmer-voice__listening">
          <span className="farmer-voice__dot" aria-hidden />
          Listening… speak in Bengali or English
          {voice.interim && (
            <span className="farmer-voice__interim"> “{voice.interim}”</span>
          )}
        </p>
      )}

      {(voice.error || voice.status === "unsupported") && (
        <p className="farmer-voice__hint">{voice.error}</p>
      )}

      {inputError && (
        <p className="farmer-voice__input-error" role="alert">
          {inputError}
        </p>
      )}

      <textarea
        className={`input-area ${voice.isListening ? "input-area--listening" : ""}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label="Farmer message"
        disabled={disabled}
      />
      <p className="farmer-voice__tip">
        Example: <em>Amar 50 quintal Jyoti aloo ache</em>
      </p>
    </div>
  );
}
