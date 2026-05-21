import { useCallback, useEffect, useRef, useState } from "react";

export type VoiceStatus = "idle" | "listening" | "unsupported" | "denied" | "error";

function getRecognitionCtor(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
}

export function useVoiceInput(onFinalText: (text: string) => void) {
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const listeningRef = useRef(false);

  const supported = getRecognitionCtor() != null;

  const stop = useCallback(() => {
    listeningRef.current = false;
    recognitionRef.current?.stop();
    setStatus("idle");
    setInterim("");
  }, []);

  const start = useCallback(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) {
      setStatus("unsupported");
      setError("Voice not supported — use Chrome or Edge, or type instead.");
      return;
    }

    if (listeningRef.current) {
      stop();
      return;
    }

    const recognition = new Ctor();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "bn-IN";
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interimText = "";
      let finalText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const part = event.results[i][0]?.transcript ?? "";
        if (event.results[i].isFinal) {
          finalText += part;
        } else {
          interimText += part;
        }
      }
      if (finalText.trim()) {
        onFinalText(finalText.trim());
        setInterim("");
      } else {
        setInterim(interimText);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      listeningRef.current = false;
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setStatus("denied");
        setError("Microphone blocked — allow mic in browser settings.");
      } else if (event.error === "no-speech") {
        setStatus("error");
        setError("No speech heard — try again.");
      } else {
        setStatus("error");
        setError("Voice error — try English or type instead.");
      }
    };

    recognition.onend = () => {
      listeningRef.current = false;
      setStatus((s) => (s === "listening" ? "idle" : s));
      setInterim("");
    };

    recognitionRef.current = recognition;
    listeningRef.current = true;
    setError(null);
    setStatus("listening");
    setInterim("");
    try {
      recognition.start();
    } catch {
      setStatus("error");
      setError("Could not start microphone.");
      listeningRef.current = false;
    }
  }, [onFinalText, stop]);

  useEffect(() => {
    if (!supported) setStatus("unsupported");
    return () => {
      recognitionRef.current?.abort();
    };
  }, [supported]);

  return {
    supported,
    status,
    interim,
    error,
    isListening: status === "listening",
    start,
    stop,
    toggle: start,
  };
}
