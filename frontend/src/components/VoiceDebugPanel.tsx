import type { VoiceDebugInfo } from "../hooks/useVoiceAssistant";

type Props = {
  debug: VoiceDebugInfo | null;
  show: boolean;
};

export function VoiceDebugPanel({ debug, show }: Props) {
  if (!show || !debug) return null;

  const rows: [string, string][] = [
    ["Phase", debug.phase],
    ["Microphone", String(debug.microphone)],
    ["Audio", debug.audio],
    ["STT provider", debug.sttProvider],
    ["STT", debug.stt],
    ["Transcript", debug.transcript],
    ["Detected language", debug.detectedLanguage],
    ["Conversation language", debug.conversationLanguage],
    ["Intent", debug.intent],
    ["Entities", debug.entities],
    ["Backend API", debug.backendApi],
    ["TTS", debug.tts],
  ];

  return (
    <details className="voice-debug" open>
      <summary>Voice diagnostics (dev)</summary>
      <dl className="voice-debug__grid">
        {rows.map(([label, value]) => (
          <div key={label} className="voice-debug__row">
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
