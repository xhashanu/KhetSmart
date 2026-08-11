import { useEffect, useRef } from "react";
import type { Message } from "../hooks/useVoiceAssistant";

type Props = {
  messages: Message[];
  isListening?: boolean;
  statusLine?: string;
};

export function VoiceConversation({ messages, isListening, statusLine }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [messages, isListening, statusLine]);

  if (messages.length === 0 && !isListening) {
    return null;
  }

  return (
    <div className="voice-chat" ref={containerRef}>
      {messages.map((msg) => (
        <div
          key={msg.id}
          className={`voice-chat__bubble voice-chat__bubble--${msg.role}`}
          dir="auto"
        >
          {msg.text}
          {msg.sttProvider && msg.role === "farmer" && import.meta.env.DEV && (
            <span className="voice-chat__stt-badge">{msg.sttProvider}</span>
          )}
        </div>
      ))}
      {isListening && (
        <div
          className="voice-chat__bubble voice-chat__bubble--farmer voice-chat__bubble--interim"
          dir="auto"
        >
          {statusLine ?? "Recording…"}
        </div>
      )}
    </div>
  );
}
