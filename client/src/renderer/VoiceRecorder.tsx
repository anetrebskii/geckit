import { useState, useRef, useEffect, useCallback } from 'react';
import { Box, Typography, IconButton, CircularProgress } from '@mui/material';
import { Stop as StopIcon, Close as CloseIcon } from '@mui/icons-material';
import { getUserContext } from './services/user_context';
import { AIConfig } from './services/ai_service';

type VoiceState = 'waiting' | 'recording' | 'transcribing' | 'error';

const BAR_COUNT = 5;
const BAR_MIN = 4;
const BAR_MAX = 20;

function AudioBars({ levels }: { levels: number[] }) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: '3px',
        height: BAR_MAX,
      }}
    >
      {levels.map((level, i) => (
        <Box
          // eslint-disable-next-line react/no-array-index-key
          key={i}
          sx={{
            width: 3,
            borderRadius: 1,
            bgcolor: 'error.main',
            height: BAR_MIN + level * (BAR_MAX - BAR_MIN),
            transition: 'height 80ms ease-out',
          }}
        />
      ))}
    </Box>
  );
}

export default function VoiceRecorder() {
  const [state, setState] = useState<VoiceState>('waiting');
  const [elapsed, setElapsed] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [levels, setLevels] = useState<number[]>(() =>
    Array.from({ length: BAR_COUNT }, () => 0),
  );

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedRef = useRef(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);

  const releaseStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const stopAnalyser = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close();
      audioCtxRef.current = null;
    }
    analyserRef.current = null;
    setLevels(Array.from({ length: BAR_COUNT }, () => 0));
  }, []);

  const startAnalyser = useCallback((stream: MediaStream) => {
    const audioCtx = new AudioContext();
    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 64;
    source.connect(analyser);

    audioCtxRef.current = audioCtx;
    analyserRef.current = analyser;

    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    const tick = () => {
      analyser.getByteFrequencyData(dataArray);

      // Pick frequency bands spread across the spectrum
      const binCount = analyser.frequencyBinCount;
      const step = Math.max(1, Math.floor(binCount / BAR_COUNT));
      const newLevels: number[] = [];
      for (let i = 0; i < BAR_COUNT; i++) {
        const idx = Math.min(i * step, binCount - 1);
        newLevels.push(dataArray[idx] / 255);
      }
      setLevels(newLevels);
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const handleTranscribe = useCallback(async (audioBlob: Blob) => {
    setState('transcribing');
    try {
      const userContext = getUserContext();
      const aiConfig: AIConfig = {
        provider: userContext.settings.aiProvider || 'openai',
        openAiKey: userContext.settings.openAiKey,
        anthropicKey: userContext.settings.anthropicKey,
        openRouterKey: userContext.settings.openRouterKey,
      };

      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onloadend = () => {
          const result = reader.result as string;
          resolve(result.split(',')[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(audioBlob);
      });

      const result = await window.electron.ai.voiceTranscribe({
        config: aiConfig,
        audioData: base64,
        fileName: 'voice-recording.webm',
      });

      if (!result.success) {
        setState('error');
        setErrorMsg(result.error || 'Transcription failed');
      }
      // On success, main process will close this window
    } catch (err) {
      setState('error');
      setErrorMsg(String(err));
    }
  }, []);

  const stopRecording = useCallback(() => {
    stopTimer();
    stopAnalyser();
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== 'inactive'
    ) {
      mediaRecorderRef.current.stop();
    }
    // onstop handler will call handleTranscribe
  }, [stopAnalyser]);

  const cancelRecording = useCallback(() => {
    stopTimer();
    stopAnalyser();
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.onstop = null;
      if (mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
    }
    releaseStream();
    window.electron.ai.voiceCancel();
  }, [stopAnalyser]);

  const startRecording = useCallback(async () => {
    if (startedRef.current) return;
    startedRef.current = true;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        releaseStream();
        const audioBlob = new Blob(audioChunksRef.current, {
          type: 'audio/webm',
        });
        if (audioBlob.size > 0) {
          handleTranscribe(audioBlob);
        }
      };

      mediaRecorder.start();
      startAnalyser(stream);
      setState('recording');

      const startTime = Date.now();
      timerRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startTime) / 1000));
      }, 200);
    } catch (err) {
      setState('error');
      setErrorMsg(`Mic access denied: ${err}`);
    }
  }, [handleTranscribe, startAnalyser]);

  // Listen for IPC signals from main process
  useEffect(() => {
    const unsubStart = window.electron.ipcRenderer.on('voice-start', () => {
      startRecording();
    });

    const unsubStop = window.electron.ipcRenderer.on('voice-stop', () => {
      stopRecording();
    });

    return () => {
      unsubStart();
      unsubStop();
    };
  }, [startRecording, stopRecording]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopTimer();
      stopAnalyser();
      releaseStream();
    };
  }, [stopAnalyser]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <Box
      sx={{
        width: '100vw',
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'transparent',
        WebkitAppRegion: 'drag',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          bgcolor: 'background.paper',
          borderRadius: 50,
          px: 2.5,
          py: 1,
          boxShadow: 6,
          WebkitAppRegion: 'no-drag',
        }}
      >
        {state === 'transcribing' && (
          <>
            <CircularProgress size={18} />
            <Typography variant="body2" sx={{ minWidth: 90 }}>
              Transcribing...
            </Typography>
          </>
        )}

        {state === 'error' && (
          <>
            <Typography
              variant="body2"
              color="error"
              noWrap
              sx={{ maxWidth: 180 }}
            >
              {errorMsg}
            </Typography>
            <IconButton size="small" onClick={cancelRecording}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </>
        )}

        {(state === 'waiting' || state === 'recording') && (
          <>
            {/* Audio bars - reactive to mic input */}
            <AudioBars levels={levels} />

            {/* Timer */}
            <Typography
              variant="body2"
              fontFamily="monospace"
              sx={{ minWidth: 36 }}
            >
              {formatTime(elapsed)}
            </Typography>

            {/* Stop button */}
            <IconButton
              size="small"
              onClick={stopRecording}
              sx={{ color: 'error.main' }}
              disabled={state === 'waiting'}
            >
              <StopIcon fontSize="small" />
            </IconButton>

            {/* Cancel button */}
            <IconButton size="small" onClick={cancelRecording}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </>
        )}
      </Box>
    </Box>
  );
}
