import { useState, useRef, useEffect } from 'react';
import { analyzeLiveTranscript } from '../services/ai';

const ANALYSIS_INTERVAL_MS = 8000;
const MIN_CHARS_TO_ANALYZE = 30;
const MAX_FULL_TRANSCRIPT_CHARS = 8000;
const DG_ENDPOINT = 'wss://api.deepgram.com/v1/listen';

function float32ToInt16(float32Array: Float32Array): Int16Array {
  const int16Array = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  return int16Array;
}

/**
 * Map a Deepgram speaker index (0, 1, 2 ...) to a human-readable name.
 * Uses the contributor list in the order the user typed it. Falls back to
 * "Speaker N" if the index is beyond the known list.
 */
function mapSpeaker(speakerIdx: number, contributorNames: string[]): string {
  if (speakerIdx >= 0 && speakerIdx < contributorNames.length) {
    return contributorNames[speakerIdx];
  }
  return `Speaker ${speakerIdx + 1}`;
}

/**
 * Pick the dominant speaker in a sentence by majority of words.
 * A single utterance may span speakers if one person interrupts; we pick
 * the most common label.
 */
function dominantSpeaker(words: Array<{ speaker?: number }>): number {
  const counts = new Map<number, number>();
  for (const w of words) {
    if (typeof w.speaker === 'number') {
      counts.set(w.speaker, (counts.get(w.speaker) ?? 0) + 1);
    }
  }
  let best = 0;
  let bestCount = -1;
  counts.forEach((c, k) => { if (c > bestCount) { best = k; bestCount = c; } });
  return best;
}

export function useLiveAgent(
  onNewMessage: (author: string, text: string) => void,
  getCurrentSpeaker: () => string,
  onFrameworkSuggested?: (frameworkId: string, reason: string) => void,
  onVisualizationAction?: (args: any) => void,
  contributorNames: string[] = [],
) {
  const [isConnected, setIsConnected] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [connectError, setConnectError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const scriptNodeRef = useRef<ScriptProcessorNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analysisTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const keepAliveRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingChunkRef = useRef<string>('');
  const fullTranscriptRef = useRef<string>('');
  const analyzingRef = useRef(false);

  const onFrameworkRef = useRef(onFrameworkSuggested);
  const onVisualizationRef = useRef(onVisualizationAction);
  const onNewMessageRef = useRef(onNewMessage);
  const contributorsRef = useRef(contributorNames);

  useEffect(() => {
    onFrameworkRef.current = onFrameworkSuggested;
    onVisualizationRef.current = onVisualizationAction;
    onNewMessageRef.current = onNewMessage;
    contributorsRef.current = contributorNames;
  }, [onFrameworkSuggested, onVisualizationAction, onNewMessage, contributorNames]);

  useEffect(() => {
    return () => { disconnect(); };
  }, []);

  const runAnalysis = async () => {
    if (analyzingRef.current) return;
    const chunk = pendingChunkRef.current.trim();
    if (chunk.length < MIN_CHARS_TO_ANALYZE) return;

    analyzingRef.current = true;
    pendingChunkRef.current = '';

    try {
      const result = await analyzeLiveTranscript(fullTranscriptRef.current, chunk);
      result.visualizationActions?.forEach((action) => {
        if (onVisualizationRef.current) onVisualizationRef.current(action);
      });
      if (result.frameworkSuggestion && onFrameworkRef.current) {
        onFrameworkRef.current(result.frameworkSuggestion.frameworkId, result.frameworkSuggestion.reason);
      }
    } catch (err: any) {
      if (err?.message === 'QUOTA_EXCEEDED') {
        console.warn('Live analyzer hit rate limit; will retry next cycle');
        pendingChunkRef.current = (chunk + '\n' + pendingChunkRef.current).slice(-4000);
      } else {
        console.error('Live analyzer error:', err);
      }
    } finally {
      analyzingRef.current = false;
    }
  };

  const recordFinalUtterance = (author: string, text: string) => {
    onNewMessageRef.current(author, text);
    const line = `${author}: ${text}`;
    fullTranscriptRef.current = (fullTranscriptRef.current + '\n' + line).slice(-MAX_FULL_TRANSCRIPT_CHARS);
    pendingChunkRef.current += line + '\n';
  };

  const connect = async () => {
    if (isConnected) return;
    setConnectError(null);

    if (!import.meta.env.VITE_DEEPGRAM_API_KEY) {
      const msg = 'VITE_DEEPGRAM_API_KEY is missing. Add it to .env.local and restart `npm run dev`.';
      console.error(msg);
      setConnectError(msg);
      return;
    }

    if (typeof window === 'undefined') {
      setConnectError('Browser environment required.');
      return;
    }

    // Mic permission + stream
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, sampleRate: 16000, echoCancellation: true, noiseSuppression: true },
      });
    } catch (err: any) {
      const msg = err?.name === 'NotAllowedError'
        ? 'Microphone permission was denied. Allow it in your browser settings and try again.'
        : `Microphone unavailable: ${err?.message || err}`;
      console.error('Microphone permission denied:', err);
      setConnectError(msg);
      return;
    }
    streamRef.current = stream;

    pendingChunkRef.current = '';
    fullTranscriptRef.current = '';

    // Audio capture pipeline @ 16kHz mono PCM, exactly what Deepgram expects.
    let captureContext: AudioContext;
    try {
      captureContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      await captureContext.resume();
    } catch (err: any) {
      setConnectError(`Audio context failed: ${err?.message || err}`);
      return;
    }
    audioContextRef.current = captureContext;

    const source = captureContext.createMediaStreamSource(stream);
    const scriptNode = captureContext.createScriptProcessor(4096, 1, 1);
    scriptNodeRef.current = scriptNode;
    source.connect(scriptNode);
    scriptNode.connect(captureContext.destination);

    // Connect to Deepgram streaming endpoint via WebSocket.
    // The 'token' subprotocol is Deepgram's documented way to pass the API key
    // from the browser without exposing it in the URL bar / referer headers.
    const params = new URLSearchParams({
      model: 'nova-3',
      language: 'multi',           // English + Chinese mixed
      diarize: 'true',
      smart_format: 'true',
      punctuate: 'true',
      interim_results: 'true',
      encoding: 'linear16',
      sample_rate: '16000',
      channels: '1',
      endpointing: '800',
    });
    const url = `${DG_ENDPOINT}?${params.toString()}`;

    let ws: WebSocket;
    try {
      ws = new WebSocket(url, ['token', import.meta.env.VITE_DEEPGRAM_API_KEY]);
    } catch (err: any) {
      setConnectError(`Failed to open Deepgram connection: ${err?.message || err}`);
      return;
    }
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);

      scriptNode.onaudioprocess = (audioEvent) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
        const inputData = audioEvent.inputBuffer.getChannelData(0);
        const int16 = float32ToInt16(inputData);
        try {
          wsRef.current.send(int16.buffer);
        } catch {
          // socket closing — drop the frame
        }
      };

      // Deepgram closes idle sockets after ~12s of silence; keepalive every 8s
      keepAliveRef.current = setInterval(() => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          try { wsRef.current.send(JSON.stringify({ type: 'KeepAlive' })); } catch {}
        }
      }, 8000);
    };

    ws.onmessage = (event) => {
      let data: any;
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }
      if (data.type !== 'Results') return;

      const alt = data?.channel?.alternatives?.[0];
      if (!alt) return;
      const transcript: string = alt.transcript || '';
      if (!transcript.trim()) return;

      if (data.is_final) {
        const speakerIdx = dominantSpeaker(alt.words || []);
        const author = mapSpeaker(speakerIdx, contributorsRef.current);
        recordFinalUtterance(author, transcript.trim());
        setInterimTranscript('');
      } else {
        setInterimTranscript(transcript);
      }
    };

    ws.onerror = (event) => {
      console.error('Deepgram WebSocket error:', event);
      setConnectError('Transcription connection error. Check your Deepgram API key and network.');
    };

    ws.onclose = (event) => {
      setIsConnected(false);
      // 4xx-style close codes from Deepgram come with an explanatory reason
      if (event.code >= 4000 && event.code < 5000 && event.reason) {
        setConnectError(`Deepgram: ${event.reason}`);
      }
    };

    analysisTimerRef.current = setInterval(runAnalysis, ANALYSIS_INTERVAL_MS);
  };

  const disconnect = () => {
    setIsConnected(false);
    setInterimTranscript('');

    if (analysisTimerRef.current) {
      clearInterval(analysisTimerRef.current);
      analysisTimerRef.current = null;
    }
    if (keepAliveRef.current) {
      clearInterval(keepAliveRef.current);
      keepAliveRef.current = null;
    }
    if (scriptNodeRef.current) {
      try { scriptNodeRef.current.disconnect(); } catch {}
      scriptNodeRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current) {
      try { audioContextRef.current.close(); } catch {}
      audioContextRef.current = null;
    }
    if (wsRef.current) {
      const ws = wsRef.current;
      wsRef.current = null;
      try {
        if (ws.readyState === WebSocket.OPEN) {
          // Tell Deepgram we're done sending audio; it will flush any pending transcript.
          ws.send(JSON.stringify({ type: 'CloseStream' }));
        }
        ws.close();
      } catch {}
    }
  };

  return {
    isConnected,
    connect,
    disconnect,
    interimTranscript,
    connectError,
    clearConnectError: () => setConnectError(null),
  };
}
