import { useCallback, useEffect, useRef, useState } from "react";

export type TTSStatus = "idle" | "speaking" | "error";

export function useTTS() {
  const [status, setStatus] = useState<TTSStatus>("idle");
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      synthRef.current = window.speechSynthesis;
    }
  }, []);

  const stop = useCallback(() => {
    if (synthRef.current) {
      synthRef.current.cancel();
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setStatus("idle");
  }, []);

  const speak = useCallback(
    (text: string, lang: string = "bn", audioBase64?: string | null) => {
      // Stop any ongoing speech
      stop();

      if (audioBase64) {
        try {
          const audio = new Audio("data:audio/mp3;base64," + audioBase64);
          audioRef.current = audio;
          audio.onplay = () => setStatus("speaking");
          audio.onended = () => setStatus("idle");
          audio.onerror = () => {
            console.error("Audio playback error, falling back to TTS");
            fallbackTTS(text, lang);
          };
          audio.play().catch((err) => {
            console.error("Audio play blocked, falling back to TTS", err);
            fallbackTTS(text, lang);
          });
          return;
        } catch (e) {
          console.error("Error creating Audio, falling back to TTS", e);
        }
      }

      fallbackTTS(text, lang);
    },
    [stop]
  );

  const fallbackTTS = (text: string, lang: string) => {
    if (!synthRef.current) return;
    const utterance = new SpeechSynthesisUtterance(text);

    const langMap: Record<string, string> = {
      bn: "bn-IN",
      hi: "hi-IN",
      en: "en-IN",
      ta: "ta-IN",
      te: "te-IN",
      mr: "mr-IN",
      kn: "kn-IN",
      gu: "gu-IN",
      pa: "pa-IN",
      or: "or-IN",
      ml: "ml-IN",
    };
    utterance.lang = langMap[lang] || langMap[lang.slice(0, 2)] || "en-IN";

    utterance.rate = 0.95;
    utterance.pitch = 1.0;

    utterance.onstart = () => setStatus("speaking");
    utterance.onend = () => setStatus("idle");
    utterance.onerror = (e) => {
      if (e.error !== "interrupted" && e.error !== "canceled") {
        console.error("TTS Error:", e);
        setStatus("error");
      }
    };

    synthRef.current.speak(utterance);
  };

  return {
    status,
    speak,
    stop,
    isSpeaking: status === "speaking",
  };
}
