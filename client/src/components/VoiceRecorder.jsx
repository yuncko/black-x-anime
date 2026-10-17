import React, { useState, useRef, useEffect } from 'react';

const MIC_ERRORS = {
  insecure: ['تسجيل الصوت محتاج اتصال آمن (https)', 'Voice notes need a secure (https) page'],
  blocked: ['المايك مقفول للموقع ده — اسمح بالمايك من إعدادات المتصفح وجرب تاني', 'The microphone is blocked — allow it in the browser settings and try again'],
  missing: ['مفيش مايك متوصل بالجهاز ده', 'No microphone was found on this device'],
  busy: ['المايك مستخدم في برنامج تاني — اقفله وجرب تاني', 'The microphone is used by another app — close it and try again'],
  unsupported: ['المتصفح ده مش بيدعم تسجيل الصوت', 'This browser cannot record voice notes'],
  other: ['تعذر الوصول إلى الميكروفون', 'Could not use the microphone']
};

/** Why the microphone could not be used, in the visitor's language. */
function micErrorMessage(err, lang) {
  const name = err && err.name;
  let kind = 'other';
  if (typeof window !== 'undefined' && window.isSecureContext === false) kind = 'insecure';
  else if (err === 'unsupported') kind = 'unsupported';
  else if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') kind = 'blocked';
  else if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') kind = 'missing';
  else if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') kind = 'busy';
  return MIC_ERRORS[kind][lang === 'en' ? 1 : 0];
}

/**
 * Real microphone recording with the MediaRecorder API.
 * When the browser refuses the microphone (permission, no device, no support), nothing is
 * recorded and `error` says why — there is no made-up clip (the old fallback generated a tone
 * and attached it as if it were the user's voice).
 */
export function useVoiceRecorder(lang = 'ar') {
  const [isRecording, setIsRecording] = useState(false);
  const [recordSec, setRecordSec] = useState(0);
  const [audioUrl, setAudioUrl] = useState(null);
  const [audioBlob, setAudioBlob] = useState(null);
  const [error, setError] = useState(null);

  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const recordSecRef = useRef(0);
  const cancelledRef = useRef(false);

  const releaseStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  /** Resolves { ok: true } when recording started, { error } otherwise (never throws). */
  const startRecording = async () => {
    setError(null);
    setAudioUrl(null);
    setAudioBlob(null);
    setRecordSec(0);
    recordSecRef.current = 0;
    chunksRef.current = [];
    cancelledRef.current = false;

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      const msg = micErrorMessage('unsupported', lang);
      setError(msg);
      return { error: msg };
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeTypes = ['audio/webm', 'audio/mp4', 'audio/ogg', 'audio/wav'];
      let selectedMime = '';
      for (const m of mimeTypes) {
        if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m)) {
          selectedMime = m;
          break;
        }
      }

      const recorder = new MediaRecorder(stream, selectedMime ? { mimeType: selectedMime } : {});
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        releaseStream(); // turns the browser's microphone indicator off
        // cancelled: the last chunk arrives after cancel, so the flag decides, not the chunk count
        if (cancelledRef.current || !chunksRef.current.length) return;
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        setAudioBlob(blob);
        const reader = new FileReader();
        reader.onloadend = () => setAudioUrl(reader.result);
        reader.readAsDataURL(blob);
      };

      recorder.start(250); // collect chunks every 250ms
      setIsRecording(true);
      timerRef.current = setInterval(() => {
        recordSecRef.current += 1;
        setRecordSec(recordSecRef.current);
      }, 1000);
      return { ok: true };
    } catch (err) {
      releaseStream();
      const msg = micErrorMessage(err, lang);
      setError(msg);
      setIsRecording(false);
      return { error: msg };
    }
  };

  const stopRecording = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    } else {
      releaseStream();
    }
    setIsRecording(false);
  };

  const cancelRecording = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    cancelledRef.current = true;
    chunksRef.current = [];
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    releaseStream();
    setIsRecording(false);
    setRecordSec(0);
    recordSecRef.current = 0;
    setAudioUrl(null);
    setAudioBlob(null);
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  return {
    isRecording,
    recordSec,
    audioUrl,
    audioBlob,
    error,
    startRecording,
    stopRecording,
    cancelRecording
  };
}

/**
 * Beautiful Glassmorphism Voice Audio Player with Real Playback & Equalizer
 */
export function VoiceAudioPlayer({ audioUrl, durationSec = 0, mini = false }) {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const audioRef = useRef(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => {
      if (audio.duration) {
        setProgress((audio.currentTime / audio.duration) * 100);
        setCurrentTime(audio.currentTime);
      }
    };

    const onEnded = () => {
      setPlaying(false);
      setProgress(0);
      setCurrentTime(0);
    };

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('ended', onEnded);
    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('ended', onEnded);
    };
  }, [audioUrl]);

  const togglePlay = (e) => {
    e?.stopPropagation?.();
    const audio = audioRef.current;
    if (!audio) return;

    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      audio.play().then(() => setPlaying(true)).catch((err) => {
        console.warn('Audio play error:', err);
      });
    }
  };

  const fmt = (s) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${String(sec).padStart(2, '0')}`;
  };

  if (!audioUrl) return null;

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.65rem',
        padding: mini ? '0.25rem 0.65rem' : '0.45rem 0.95rem',
        background: 'linear-gradient(135deg, rgba(236, 72, 153, 0.18), rgba(139, 92, 246, 0.22))',
        border: '1px solid rgba(236, 72, 153, 0.45)',
        borderRadius: '999px',
        color: '#fff',
        userSelect: 'none',
        maxWidth: '100%'
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <audio ref={audioRef} src={audioUrl} preload="metadata" />

      {/* Play/Pause Circle Button */}
      <button
        type="button"
        onClick={togglePlay}
        style={{
          width: mini ? '26px' : '32px',
          height: mini ? '26px' : '32px',
          borderRadius: '50%',
          border: 'none',
          background: 'linear-gradient(135deg, #ec4899, #8b5cf6)',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          flexShrink: 0,
          boxShadow: '0 2px 8px rgba(236, 72, 153, 0.5)',
          padding: 0
        }}
        aria-label={playing ? 'Pause' : 'Play'}
      >
        <span style={{ fontSize: mini ? '0.75rem' : '0.9rem', marginInlineStart: playing ? '0' : '2px' }}>
          {playing ? '⏸' : '▶'}
        </span>
      </button>

      {/* Equalizer Waveform Animation */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '3px', height: '18px', flexShrink: 0 }}>
        {[10, 16, 22, 14, 18, 12, 20, 15, 11].map((h, i) => (
          <span
            key={i}
            style={{
              width: '3px',
              height: playing ? `${Math.max(6, (h * (1 + (i % 3) * 0.4)) % 22)}px` : '6px',
              background: playing ? (i % 2 === 0 ? '#38bdf8' : '#f472b6') : 'rgba(255, 255, 255, 0.35)',
              borderRadius: '2px',
              transition: 'height 0.15s ease'
            }}
          />
        ))}
      </div>

      {/* Duration / Progress counter */}
      <span style={{ fontSize: '0.78rem', color: '#e2e8f0', fontFamily: 'monospace', fontWeight: 700, minWidth: '34px' }}>
        {playing ? fmt(currentTime) : fmt(durationSec || 5)}
      </span>
    </div>
  );
}
