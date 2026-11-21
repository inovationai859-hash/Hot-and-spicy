import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Bot,
  X,
  Send,
  RefreshCw,
  Mic,
  MicOff,
  PhoneCall,
  PhoneOff,
  Globe,
  MapPin,
  ExternalLink,
} from 'lucide-react';
import type { ChatMessage } from '../types';
import { useCatalog } from '../context/CatalogContext';
import { formatOperatingHours } from '../data/catalogData';

interface SpicyBotProps {
  onOpenBooking: (type?: 'dining' | 'ps5' | 'pool') => void;
}

function downsampleTo16k(input: Float32Array, inputRate: number): Float32Array {
  if (!inputRate || inputRate <= 16000) return input;
  const ratio = inputRate / 16000;
  const outLength = Math.max(1, Math.floor(input.length / ratio));
  const result = new Float32Array(outLength);
  for (let i = 0; i < outLength; i += 1) {
    const start = Math.floor(i * ratio);
    const end = Math.min(input.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    let count = 0;
    for (let j = start; j < end; j += 1) {
      sum += input[j];
      count += 1;
    }
    result[i] = count > 0 ? sum / count : input[Math.min(input.length - 1, start)];
  }
  return result;
}

function floatToInt16Base64(floatData: Float32Array): string {
  const int16 = new Int16Array(floatData.length);
  for (let i = 0; i < floatData.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, floatData[i]));
    int16[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
  }
  const bytes = new Uint8Array(int16.buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToPcmFloat32(base64: string): Float32Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  const int16 = new Int16Array(bytes.buffer, 0, Math.floor(bytes.byteLength / 2));
  const float32 = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i += 1) {
    float32[i] = int16[i] / 0x8000;
  }
  return float32;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function createAdaptiveAudioContext(preferredRate?: number): AudioContext {
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) {
    throw new Error('Audio playback is unavailable in this browser.');
  }
  if (preferredRate) {
    try {
      return new AudioCtx({ sampleRate: preferredRate });
    } catch {
      // Mobile Chrome & embedded WebViews sometimes reject fixed sampleRate options
    }
  }
  return new AudioCtx();
}

export const SpicyBot: React.FC<SpicyBotProps> = ({ onOpenBooking: _onOpenBooking }) => {
  const { venueSettings } = useCatalog();
  const operatingHours = formatOperatingHours(venueSettings);
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    {
      id: 'welcome',
      role: 'assistant',
      text: `Hello! I'm SpicyBot. Ask me about our menu, ${formatOperatingHours(venueSettings)} timings, PS5 arena, 8-ball pool slots, or directions.`,
      timestamp: 'Now',
    },
  ]);

  // Voice recording -> transcription state
  const [isRecording, setIsRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Live Voice WebSocket session state
  const [liveStatus, setLiveStatus] = useState<'idle' | 'connecting' | 'active'>('idle');
  const liveStatusRef = useRef<'idle' | 'connecting' | 'active'>('idle');
  const liveWsRef = useRef<WebSocket | null>(null);
  const liveStreamRef = useRef<MediaStream | null>(null);
  const liveInputCtxRef = useRef<AudioContext | null>(null);
  const liveOutputCtxRef = useRef<AudioContext | null>(null);
  const liveProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const liveNextStartTimeRef = useRef<number>(0);
  const liveActiveSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const botWindowRef = useRef<HTMLDivElement>(null);
  const triggerBtnRef = useRef<HTMLButtonElement>(null);

  const appendAssistantNote = useCallback((text: string) => {
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.role === 'assistant' && last.text.trim() === text.trim()) {
        return prev;
      }
      return [
        ...prev,
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          role: 'assistant',
          text,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ];
    });
  }, []);

  const stopLiveVoice = useCallback(() => {
    liveStatusRef.current = 'idle';
    setLiveStatus('idle');

    if (liveProcessorRef.current) {
      try {
        liveProcessorRef.current.disconnect();
      } catch {}
      liveProcessorRef.current = null;
    }
    if (liveStreamRef.current) {
      liveStreamRef.current.getTracks().forEach((t) => t.stop());
      liveStreamRef.current = null;
    }
    if (liveInputCtxRef.current) {
      liveInputCtxRef.current.close().catch(() => {});
      liveInputCtxRef.current = null;
    }
    for (const src of liveActiveSourcesRef.current) {
      try {
        src.stop();
      } catch {}
    }
    liveActiveSourcesRef.current.clear();
    if (liveOutputCtxRef.current) {
      liveOutputCtxRef.current.close().catch(() => {});
      liveOutputCtxRef.current = null;
    }
    if (liveWsRef.current) {
      try {
        liveWsRef.current.close();
      } catch {}
      liveWsRef.current = null;
    }
    liveNextStartTimeRef.current = 0;
  }, []);

  const stopMicRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {}
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    setIsRecording(false);
  }, []);

  useEffect(() => {
    return () => {
      stopLiveVoice();
      stopMicRecording();
    };
  }, [stopLiveVoice, stopMicRecording]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
      const t = window.setTimeout(() => {
        botWindowRef.current?.querySelector<HTMLElement>('input, button')?.focus();
      }, 60);
      const onKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          setIsOpen(false);
          window.setTimeout(() => triggerBtnRef.current?.focus(), 60);
        }
      };
      window.addEventListener('keydown', onKeyDown);
      return () => {
        window.clearTimeout(t);
        window.removeEventListener('keydown', onKeyDown);
      };
    } else {
      stopLiveVoice();
      if (isRecording) stopMicRecording();
    }
  }, [isOpen, isRecording, stopLiveVoice, stopMicRecording]);

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen]);

  const handleScrollWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    const isScrollingUp = e.deltaY < 0;
    const isScrollingDown = e.deltaY > 0;

    const atTop = scrollTop <= 0;
    const atBottom = scrollTop + clientHeight >= scrollHeight - 1;

    if ((isScrollingUp && atTop) || (isScrollingDown && atBottom)) {
      e.preventDefault();
    }
    e.stopPropagation();
  };

  /**
   * Explicitly checks device/browser microphone permission and triggers the native permission prompt.
   */
  const requestMicrophoneStream = async (): Promise<MediaStream | null> => {
    if (typeof window !== 'undefined' && window.isSecureContext === false) {
      appendAssistantNote(
        'Voice input requires a secure HTTPS connection. Please type your question below.'
      );
      return null;
    }

    const docWithPolicy = document as unknown as {
      featurePolicy?: { allowsFeature?: (f: string) => boolean };
      permissionsPolicy?: { allowsFeature?: (f: string) => boolean };
    };
    const policyAllowsMic =
      docWithPolicy.permissionsPolicy?.allowsFeature?.('microphone') ??
      docWithPolicy.featurePolicy?.allowsFeature?.('microphone') ??
      true;
    if (!policyAllowsMic) {
      appendAssistantNote(
        'Microphone access is restricted in this embedded preview. Open the site directly or type your question below.'
      );
      return null;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      appendAssistantNote(
        'Voice input is not supported in this browser. Please type your message below.'
      );
      return null;
    }

    try {
      if (navigator.permissions?.query) {
        const status = await navigator.permissions.query({
          name: 'microphone' as PermissionName,
        });
        if (status.state === 'denied') {
          appendAssistantNote(
            'Microphone permission is blocked on your device. Please enable Microphone access in your browser or phone site settings and try again.'
          );
          return null;
        }
      }
    } catch {
      // Some browsers omit Permissions API for microphone; proceed directly to getUserMedia
    }

    try {
      return await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
    } catch (err: any) {
      const name = String(err?.name || '');
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        appendAssistantNote(
          'Please allow microphone permission on your device when prompted (or enable it in site settings) to use voice.'
        );
      } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        appendAssistantNote(
          'No microphone was found on this device. Please connect one or type your message.'
        );
      } else if (name === 'NotReadableError' || name === 'TrackStartError') {
        appendAssistantNote(
          'Your microphone appears busy in another app. Close that app and tap again.'
        );
      } else {
        appendAssistantNote(
          'Unable to access your device microphone right now. Please check device permissions and retry.'
        );
      }
      return null;
    }
  };

  const handleSend = async (textToSend?: string) => {
    const text = (textToSend ?? input).trim();
    if (!text || loading) return;

    const userMessage: ChatMessage = {
      id: String(Date.now()),
      role: 'user',
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMessage]);
    if (!textToSend) setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          mode: 'balanced',
          history: messages.slice(-6).map((m) => ({ role: m.role, text: m.text })),
          userLocation: { lat: 22.9718, lng: 88.3994 },
        }),
      });

      if (!res.ok) {
        throw new Error('Network error');
      }

      const data = await res.json();
      const botMessage: ChatMessage = {
        id: String(Date.now() + 1),
        role: 'assistant',
        text: data.reply || 'Hot & Spicy welcomes you! How may I assist your visit?',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        modeUsed: data.modeUsed || 'balanced',
        groundingLinks: Array.isArray(data.groundingLinks) ? data.groundingLinks : undefined,
      };

      setMessages((prev) => [...prev, botMessage]);
    } catch {
      appendAssistantNote(
        `I had trouble reaching the venue assistant just now. Please ask again in a moment, or message us on WhatsApp at ${venueSettings.whatsappNumber}.`
      );
    } finally {
      setLoading(false);
    }
  };

  const handleToggleMic = async () => {
    if (isRecording) {
      stopMicRecording();
      return;
    }
    if (transcribing || loading || liveStatus !== 'idle') return;

    if (typeof MediaRecorder === 'undefined') {
      appendAssistantNote(
        'Voice recording is not supported in this browser. You can type your message or use Live Voice.'
      );
      return;
    }

    const stream = await requestMicrophoneStream();
    if (!stream) return;

    try {
      mediaStreamRef.current = stream;
      audioChunksRef.current = [];
      const preferredMime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find(
        (m) => {
          try {
            return MediaRecorder.isTypeSupported(m);
          } catch {
            return false;
          }
        }
      );
      const recorder = preferredMime
        ? new MediaRecorder(stream, { mimeType: preferredMime })
        : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) audioChunksRef.current.push(ev.data);
      };

      recorder.onstop = async () => {
        const chunks = audioChunksRef.current;
        audioChunksRef.current = [];
        stream.getTracks().forEach((t) => t.stop());
        mediaStreamRef.current = null;
        if (chunks.length === 0) return;

        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        setTranscribing(true);
        try {
          const buffer = await blob.arrayBuffer();
          const audioBase64 = arrayBufferToBase64(buffer);
          const res = await fetch('/api/ai/transcribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              audioBase64,
              mimeType: blob.type || 'audio/webm',
            }),
          });
          const data = await res.json();
          if (res.ok && data.text) {
            setInput((prev) => (prev ? `${prev} ${data.text}` : data.text));
          } else {
            throw new Error(data.error || 'Could not transcribe speech.');
          }
        } catch (err: any) {
          appendAssistantNote(err?.message || 'Unable to understand audio right now. Please try again.');
        } finally {
          setTranscribing(false);
        }
      };

      recorder.start();
      setIsRecording(true);
    } catch {
      stream.getTracks().forEach((t) => t.stop());
      appendAssistantNote('Could not start voice recording on this device.');
    }
  };

  const handleToggleLiveVoice = async () => {
    if (liveStatus !== 'idle') {
      stopLiveVoice();
      return;
    }

    if (typeof WebSocket === 'undefined') {
      appendAssistantNote('Live voice is not supported in this browser. Please type your message.');
      return;
    }

    if (isRecording) {
      stopMicRecording();
    }

    const stream = await requestMicrophoneStream();
    if (!stream) return;

    liveStatusRef.current = 'connecting';
    setLiveStatus('connecting');

    try {
      liveStreamRef.current = stream;

      const inputCtx = createAdaptiveAudioContext(16000);
      const outputCtx = createAdaptiveAudioContext(24000);
      if (inputCtx.state === 'suspended') await inputCtx.resume().catch(() => {});
      if (outputCtx.state === 'suspended') await outputCtx.resume().catch(() => {});

      liveInputCtxRef.current = inputCtx;
      liveOutputCtxRef.current = outputCtx;
      liveNextStartTimeRef.current = outputCtx.currentTime;

      const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${wsProto}//${window.location.host}/live`);
      liveWsRef.current = ws;

      let receivedError = false;

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'ready') {
            liveStatusRef.current = 'active';
            setLiveStatus('active');
            const source = inputCtx.createMediaStreamSource(stream);
            const processor = inputCtx.createScriptProcessor(4096, 1, 1);
            liveProcessorRef.current = processor;
            processor.onaudioprocess = (e) => {
              if (liveStatusRef.current !== 'active' || ws.readyState !== WebSocket.OPEN) return;
              const rawChannel = e.inputBuffer.getChannelData(0);
              const resampled = downsampleTo16k(rawChannel, inputCtx.sampleRate);
              const base64 = floatToInt16Base64(resampled);
              ws.send(JSON.stringify({ type: 'audio', data: base64 }));
            };
            source.connect(processor);
            processor.connect(inputCtx.destination);
          } else if (msg.type === 'audio' && msg.data && liveOutputCtxRef.current) {
            const floatSamples = base64ToPcmFloat32(msg.data);
            const ctx = liveOutputCtxRef.current;
            const audioBuf = ctx.createBuffer(1, floatSamples.length, 24000);
            audioBuf.getChannelData(0).set(floatSamples);
            const srcNode = ctx.createBufferSource();
            srcNode.buffer = audioBuf;
            srcNode.connect(ctx.destination);
            const startAt = Math.max(ctx.currentTime, liveNextStartTimeRef.current);
            srcNode.start(startAt);
            liveNextStartTimeRef.current = startAt + audioBuf.duration;
            liveActiveSourcesRef.current.add(srcNode);
            srcNode.onended = () => liveActiveSourcesRef.current.delete(srcNode);
          } else if (msg.type === 'interrupted') {
            for (const src of liveActiveSourcesRef.current) {
              try {
                src.stop();
              } catch {}
            }
            liveActiveSourcesRef.current.clear();
            if (liveOutputCtxRef.current) {
              liveNextStartTimeRef.current = liveOutputCtxRef.current.currentTime;
            }
          } else if (msg.type === 'output_transcript' && msg.text) {
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (last && last.id.startsWith('live-out-')) {
                const updated = [...prev];
                updated[updated.length - 1] = { ...last, text: `${last.text}${msg.text}` };
                return updated;
              }
              return [
                ...prev,
                {
                  id: `live-out-${Date.now()}`,
                  role: 'assistant',
                  text: String(msg.text),
                  timestamp: 'Live Voice',
                },
              ];
            });
          } else if (msg.type === 'error') {
            receivedError = true;
            appendAssistantNote(msg.message || 'Live voice session unavailable right now.');
            stopLiveVoice();
          }
        } catch {}
      };

      ws.onerror = () => {
        if (!receivedError) {
          receivedError = true;
          appendAssistantNote('Could not reach live voice service. Please try typing below.');
        }
        stopLiveVoice();
      };
      ws.onclose = () => {
        if (liveStatusRef.current === 'connecting' && !receivedError) {
          appendAssistantNote('Live voice service is temporarily unavailable. You can still type or use Mic.');
        }
        if (liveStatusRef.current !== 'idle') {
          stopLiveVoice();
        }
      };
    } catch {
      stopLiveVoice();
      appendAssistantNote(
        'Could not start audio on this device. Please ensure microphone permission is enabled and retry.'
      );
    }
  };

  return (
    <aside
      data-ink-live="true"
      aria-label="Venue Assistant"
      className="fixed bottom-4 right-3.5 sm:bottom-6 sm:right-6 z-[1001]"
    >
      <AnimatePresence mode="wait">
        {!isOpen && (
          <motion.button
            ref={triggerBtnRef}
            key="bot-trigger"
            initial={{ opacity: 0, scale: 0.9, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 8 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setIsOpen(true)}
            className="flex items-center gap-2.5 px-3.5 min-h-[48px] rounded-full bg-[rgba(20,16,11,0.94)] border border-[#8D6613] hover:bg-[#221A11] text-[#E4D6C3] font-semibold shadow-2xl will-change-transform cursor-pointer"
            aria-label="Open SpicyBot Assistant"
            aria-expanded={isOpen}
          >
            <div className="w-8 h-8 rounded-full bg-[#8D6613] flex items-center justify-center text-[#FAF2E6]">
              <Bot className="w-4 h-4" />
            </div>
            <div className="text-left hidden sm:block pr-1">
              <div className="text-[10px] uppercase tracking-wider text-[#D8B467] font-bold leading-none">
                Concierge
              </div>
              <div className="text-xs font-semibold text-[#E4D6C3]">
                Ask Menu &amp; Hours
              </div>
            </div>
            <span className="sm:hidden text-xs font-semibold text-[#E4D6C3] pr-1">Help</span>
          </motion.button>
        )}

        {isOpen && (
          <motion.div
            ref={botWindowRef}
            key="bot-window"
            data-lenis-prevent
            role="dialog"
            aria-label="SpicyBot Concierge"
            initial={{ opacity: 0, scale: 0.92, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 16 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            onWheel={(e) => e.stopPropagation()}
            onTouchMove={(e) => e.stopPropagation()}
            className="w-[calc(100vw-1.5rem)] max-w-[380px] h-[480px] max-h-[78dvh] rounded-2xl bg-[#EFE5D6] dark:bg-[#1F1710] border border-[#C2AD93] dark:border-[#3D2F20] shadow-2xl flex flex-col overflow-hidden text-[#14100B] dark:text-[#F0E6D8] origin-bottom-right will-change-transform"
            style={{ overscrollBehavior: 'contain' }}
          >
            {/* Clean Minimal Header */}
            <div className="p-3.5 bg-[#14100B] border-b border-[rgba(141,102,19,0.4)] flex items-center justify-between gap-2 text-[#E4D6C3]">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-[#8D6613] flex items-center justify-center text-[#FAF2E6] shrink-0">
                  <Bot className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-luxury text-base font-bold text-[#E4D6C3] leading-tight">
                    SpicyBot
                  </h3>
                  <p className="text-[11px] text-[#D8C7B4] truncate">
                    {liveStatus === 'active'
                      ? 'Live Voice Active'
                      : liveStatus === 'connecting'
                      ? 'Connecting Live Voice...'
                      : `Open ${operatingHours}`}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={handleToggleLiveVoice}
                  title={liveStatus === 'idle' ? 'Start Live Voice Conversation' : 'End Live Voice'}
                  className={`px-3 min-h-[40px] rounded-lg text-[10px] font-bold uppercase tracking-wider inline-flex items-center gap-1 cursor-pointer ${
                    liveStatus !== 'idle'
                      ? 'bg-rose-600 hover:bg-rose-700 text-white'
                      : 'bg-[#221A11] hover:bg-[#8D6613] border border-[rgba(141,102,19,0.6)] text-[#FAF2E6]'
                  }`}
                >
                  {liveStatus !== 'idle' ? (
                    <>
                      <PhoneOff className="w-3.5 h-3.5" />
                      <span>End</span>
                    </>
                  ) : (
                    <>
                      <PhoneCall className="w-3.5 h-3.5" />
                      <span>Live</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg text-[#D8C7B4] hover:text-[#E4D6C3] hover:bg-[#221A11] cursor-pointer"
                  aria-label="Close Chat"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div
              ref={scrollContainerRef}
              data-lenis-prevent
              data-dialog-scroll
              onWheel={handleScrollWheel}
              onTouchMove={(e) => e.stopPropagation()}
              className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y p-4 space-y-3 text-xs chat-scroll-contain bg-[#E4D6C3] dark:bg-[#120E0A]"
            >
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`flex flex-col ${
                    m.role === 'user' ? 'items-end' : 'items-start'
                  }`}
                >
                  <div
                    className={`max-w-[86%] rounded-2xl px-3.5 py-2.5 leading-relaxed space-y-2 ${
                      m.role === 'user'
                        ? 'bg-[#8D6613] text-[#FAF2E6] font-medium rounded-tr-none'
                        : 'bg-[#EFE5D6] dark:bg-[#1F1710] border border-[#C2AD93] dark:border-[#3D2F20] text-[#14100B] dark:text-[#F0E6D8] rounded-tl-none'
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{m.text}</p>

                    {m.groundingLinks && m.groundingLinks.length > 0 && (
                      <div className="pt-1.5 border-t border-[rgba(194,173,147,0.6)] dark:border-[#3D2F20] space-y-1">
                        {m.groundingLinks.map((link, idx) => (
                          <a
                            key={`${m.id}-link-${idx}`}
                            href={link.uri}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-between gap-2 px-2 py-1 rounded-lg bg-[rgba(228,214,195,0.8)] dark:bg-[rgba(18,14,10,0.8)] hover:border-[#8D6613] border border-transparent text-[10px] font-semibold text-[#5C4008] dark:text-[#D8B467]"
                          >
                            <span className="inline-flex items-center gap-1 truncate">
                              {link.source === 'maps' ? (
                                <MapPin className="w-3 h-3 shrink-0" />
                              ) : (
                                <Globe className="w-3 h-3 shrink-0" />
                              )}
                              <span className="truncate">{link.title}</span>
                            </span>
                            <ExternalLink className="w-3 h-3 shrink-0" />
                          </a>
                        ))}
                      </div>
                    )}
                  </div>

                  <span className="text-[10px] text-[#5E5042] dark:text-[#B5A494] mt-1 px-1">
                    {m.timestamp}
                  </span>
                </div>
              ))}

              {loading && (
                <div className="flex items-center gap-2 text-[#5C4008] dark:text-[#D8B467] font-semibold text-xs px-2">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Thinking...</span>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Clean Single-Row Input Composer */}
            <div className="p-3 bg-[#EFE5D6] dark:bg-[#1F1710] border-t border-[#C2AD93] dark:border-[#3D2F20] flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleToggleMic}
                disabled={transcribing || loading || liveStatus !== 'idle'}
                aria-label={isRecording ? 'Stop voice recording' : 'Record voice question'}
                title={isRecording ? 'Tap to stop recording' : 'Ask by voice'}
                className={`min-w-[40px] min-h-[42px] flex items-center justify-center rounded-xl border cursor-pointer disabled:opacity-45 ${
                  isRecording
                    ? 'bg-rose-600 border-rose-700 text-white'
                    : 'bg-[#E4D6C3] dark:bg-[#120E0A] border-[#C2AD93] dark:border-[#3D2F20] text-[#14100B] dark:text-[#F0E6D8] hover:border-[#8D6613]'
                }`}
              >
                {isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSend();
                }}
                placeholder={
                  isRecording
                    ? 'Listening... tap mic when done'
                    : transcribing
                    ? 'Transcribing voice...'
                    : 'Ask about menu, PS5, timings...'
                }
                disabled={loading || isRecording}
                className="flex-1 min-w-0 bg-[#E4D6C3] dark:bg-[#120E0A] border border-[#C2AD93] dark:border-[#3D2F20] rounded-xl px-3 min-h-[42px] text-base sm:text-xs text-[#14100B] dark:text-[#F0E6D8] placeholder-[#5E5042] dark:placeholder-[#9A8A79] focus:outline-none focus:border-[#8D6613] dark:focus:border-[#D8B467]"
              />
              <button
                type="button"
                onClick={() => handleSend()}
                disabled={loading || !input.trim() || isRecording}
                className="min-w-[42px] min-h-[42px] flex items-center justify-center rounded-xl bg-[#8D6613] hover:bg-[#73520D] text-[#FAF2E6] disabled:opacity-40 cursor-pointer"
                aria-label="Send message"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </aside>
  );
};
