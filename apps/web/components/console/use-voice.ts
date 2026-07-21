'use client';

// Voice capture + playback hook (CONTRACTS §10):
// - push-to-talk and hands-free capture via MediaRecorder
// - waveform levels from a WebAudio analyser
// - STT provider switch: browser (Web Speech API), server (whisper/deepgram
//   via /api/voice/stt), mock (test hook only)
// - TTS with mute + barge-in; browser speechSynthesis or server audio
// - mic permission denied → micDenied flag (UI falls back to text)

import { useCallback, useEffect, useRef, useState } from 'react';

const STT_PROVIDER = process.env.NEXT_PUBLIC_STT_PROVIDER ?? 'mock';
const TTS_PROVIDER = process.env.NEXT_PUBLIC_TTS_PROVIDER ?? 'mock';

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  start: () => void;
  stop: () => void;
};

function getSpeechRecognition(): SpeechRecognitionLike | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as Record<string, new () => SpeechRecognitionLike>;
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return Ctor ? new Ctor() : null;
}

export interface UseVoiceOptions {
  onTranscript: (text: string) => void;
}

export function useVoice({ onTranscript }: UseVoiceOptions) {
  const [recording, setRecording] = useState(false);
  const [handsFree, setHandsFree] = useState(false);
  const [micDenied, setMicDenied] = useState(false);
  const [partial, setPartial] = useState('');
  const [level, setLevel] = useState(0);
  const [muted, setMuted] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const rafRef = useRef<number>(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;
  const mutedRef = useRef(muted);
  mutedRef.current = muted;

  const stopPlayback = useCallback(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    if (audioElRef.current) {
      audioElRef.current.pause();
      audioElRef.current = null;
    }
    setSpeaking(false);
  }, []);

  const speak = useCallback(
    async (text: string) => {
      if (mutedRef.current || !text) return;
      stopPlayback();
      if (TTS_PROVIDER === 'browser' && typeof window !== 'undefined' && 'speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.onend = () => setSpeaking(false);
        setSpeaking(true);
        window.speechSynthesis.speak(utterance);
        return;
      }
      if (TTS_PROVIDER === 'openai' || TTS_PROVIDER === 'elevenlabs') {
        try {
          const res = await fetch('/api/voice/tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text }),
          });
          const contentType = res.headers.get('content-type') ?? '';
          if (!contentType.startsWith('audio/')) return; // not configured → silent
          const blob = await res.blob();
          const audio = new Audio(URL.createObjectURL(blob));
          audioElRef.current = audio;
          audio.onended = () => setSpeaking(false);
          setSpeaking(true);
          await audio.play().catch(() => setSpeaking(false));
        } catch {
          setSpeaking(false);
        }
      }
      // mock → no audio
    },
    [stopPlayback],
  );

  const teardownStream = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    setLevel(0);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    void audioCtxRef.current?.close().catch(() => undefined);
    audioCtxRef.current = null;
  }, []);

  const stopRecording = useCallback(() => {
    setRecording(false);
    setPartial('');
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    } else {
      teardownStream();
    }
  }, [teardownStream]);

  const startRecording = useCallback(async () => {
    stopPlayback(); // barge-in: user speech interrupts the agent
    if (recording) return;

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setMicDenied(true);
      return;
    }
    streamRef.current = stream;
    setRecording(true);
    setMicDenied(false);

    // Waveform levels via analyser.
    try {
      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const loop = () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (const v of data) sum += Math.abs(v - 128);
        setLevel(Math.min(1, sum / data.length / 40));
        rafRef.current = requestAnimationFrame(loop);
      };
      loop();
    } catch {
      // analyser is decorative — ignore failures
    }

    if (STT_PROVIDER === 'browser') {
      const recognition = getSpeechRecognition();
      if (recognition) {
        recognition.lang = 'en-US';
        recognition.continuous = true;
        recognition.interimResults = true;
        let finalText = '';
        recognition.onresult = (event) => {
          let interim = '';
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const result = event.results[i]!;
            if (result.isFinal) finalText += result[0]!.transcript;
            else interim += result[0]!.transcript;
          }
          setPartial(finalText + interim);
        };
        recognition.onend = () => {
          if (finalText.trim()) onTranscriptRef.current(finalText.trim());
          setPartial('');
        };
        recognition.onerror = () => setPartial('');
        recognitionRef.current = recognition;
        recognition.start();
      }
      // Also record so teardown works uniformly.
    }

    const recorder = new MediaRecorder(stream);
    chunksRef.current = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = async () => {
      teardownStream();
      if (STT_PROVIDER === 'whisper' || STT_PROVIDER === 'deepgram') {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        if (blob.size > 0) {
          const form = new FormData();
          form.append('audio', blob, 'audio.webm');
          try {
            const res = await fetch('/api/voice/stt', { method: 'POST', body: form });
            const data = (await res.json()) as { transcript?: string };
            if (data.transcript?.trim()) onTranscriptRef.current(data.transcript.trim());
          } catch {
            // degrade silently — user can type instead
          }
        }
      }
      // browser handled by recognition.onend; mock handled by the test hook
    };
    recorderRef.current = recorder;
    recorder.start();
  }, [recording, stopPlayback, teardownStream]);

  const toggleHandsFree = useCallback(() => {
    setHandsFree((prev) => {
      const next = !prev;
      if (next) void startRecording();
      else stopRecording();
      return next;
    });
  }, [startRecording, stopRecording]);

  // Test hook + programmatic voice input (CONTRACTS §10): Playwright injects
  // transcripts here in mock mode.
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__voxSTT = {
      inject: (text: string) => onTranscriptRef.current(text),
    };
    return () => {
      delete (window as unknown as Record<string, unknown>).__voxSTT;
    };
  }, []);

  useEffect(() => () => {
    stopRecording();
    stopPlayback();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    recording,
    handsFree,
    micDenied,
    partial,
    level,
    muted,
    speaking,
    setMuted,
    startRecording,
    stopRecording,
    toggleHandsFree,
    speak,
    stopPlayback,
    sttProvider: STT_PROVIDER,
  };
}
