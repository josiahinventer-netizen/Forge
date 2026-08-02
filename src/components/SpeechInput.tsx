import { useRef, useState } from 'react';

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: { transcript: string };
}
interface SpeechRecognitionEventLike {
  results: ArrayLike<SpeechRecognitionResultLike>;
}
interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start(): void;
  stop(): void;
}
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

const recognitionConstructor = () => {
  const speechWindow = window as typeof window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
};

export function SpeechInput({
  value,
  onChange,
  multiline = false,
  required = false,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  required?: boolean;
  placeholder?: string;
}) {
  const [listening, setListening] = useState(false);
  const recognition = useRef<SpeechRecognitionLike | null>(null);
  const Constructor = recognitionConstructor();
  const toggle = () => {
    if (listening) {
      recognition.current?.stop();
      return;
    }
    if (!Constructor) return;
    const instance = new Constructor();
    recognition.current = instance;
    instance.continuous = true;
    instance.interimResults = false;
    instance.lang = navigator.language || 'en-US';
    let accumulated = value;
    instance.onresult = (event) => {
      const transcript = Array.from(event.results)
        .filter((result) => result.isFinal)
        .map((result) => result[0].transcript.trim())
        .join(' ');
      if (transcript) {
        accumulated = `${accumulated}${accumulated.trim() ? ' ' : ''}${transcript}`;
        onChange(accumulated);
      }
    };
    instance.onend = () => setListening(false);
    instance.onerror = () => setListening(false);
    setListening(true);
    instance.start();
  };
  const input = multiline ? (
    <textarea
      required={required}
      value={value}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
    />
  ) : (
    <input
      required={required}
      value={value}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
    />
  );
  return (
    <div className="speech-input">
      {input}
      {Constructor && (
        <button
          type="button"
          className={listening ? 'listening' : 'secondary'}
          aria-pressed={listening}
          onClick={toggle}
        >
          {listening ? 'Stop listening' : 'Speak'}
        </button>
      )}
    </div>
  );
}
