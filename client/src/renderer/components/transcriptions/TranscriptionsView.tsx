import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  IconButton,
  Button,
  Paper,
  List,
  ListItemButton,
  ListItemText,
  Tooltip,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
} from '@mui/material';
import {
  Mic as MicIcon,
  Stop as StopIcon,
  Pause as PauseIcon,
  PlayArrow as ResumeIcon,
  Close as CloseIcon,
  AudioFile as AudioFileIcon,
  ContentCopy as ContentCopyIcon,
  Delete as DeleteIcon,
  ArrowBack as ArrowBackIcon,
  UploadFile as UploadFileIcon,
  Replay as ReplayIcon,
} from '@mui/icons-material';
import { getUserContext } from '../../services/user_context';
import { transcribeAudio, AIConfig } from '../../services/ai_service';
import {
  Transcription,
  getTranscriptionsState,
  setTranscriptionsState,
  createTranscription,
  deleteTranscription,
} from '../../services/transcriptions_service';

type RecordingState = 'idle' | 'recording' | 'paused' | 'transcribing';

export default function TranscriptionsView() {
  const [transcriptions, setTranscriptions] = useState<Transcription[]>([]);
  const [recordingState, setRecordingState] = useState<RecordingState>('idle');
  const [audioLevel, setAudioLevel] = useState(0);
  const [isDragOver, setIsDragOver] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [failedAudio, setFailedAudio] = useState<{
    blob: Blob;
    fileName: string;
    sourceLabel: string;
    knownDuration?: number;
  } | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);
  const recordingStartRef = useRef<number | null>(null);
  const pausedDurationRef = useRef<number>(0);

  // Load from localStorage
  useEffect(() => {
    const state = getTranscriptionsState();
    setTranscriptions(state.transcriptions);
  }, []);

  // Persist changes
  const persist = useCallback((items: Transcription[]) => {
    setTranscriptions(items);
    setTranscriptionsState({ transcriptions: items });
  }, []);

  const ACCEPTED_AUDIO_EXTENSIONS = [
    '.mp3', '.mp4', '.mpeg', '.mpga', '.m4a', '.wav', '.webm', '.ogg',
  ];

  const isAudioFile = (file: File) => {
    const ext = `.${file.name.split('.').pop()?.toLowerCase()}`;
    return file.type.startsWith('audio/') || ACCEPTED_AUDIO_EXTENSIONS.includes(ext);
  };

  // --- Volume monitoring ---

  const stopVolumeMonitoring = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    setAudioLevel(0);
  };

  const startVolumeMonitoring = (stream: MediaStream) => {
    const audioContext = new AudioContext();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);
    audioContextRef.current = audioContext;
    analyserRef.current = analyser;

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    const updateLevel = () => {
      if (!analyserRef.current) return;
      analyserRef.current.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i += 1) {
        sum += dataArray[i] * dataArray[i];
      }
      const rms = Math.sqrt(sum / dataArray.length);
      setAudioLevel(Math.min(rms / 128, 1));
      animationFrameRef.current = requestAnimationFrame(updateLevel);
    };
    updateLevel();
  };

  // --- Audio duration ---

  const getAudioDuration = (blob: Blob): Promise<number | undefined> => {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(blob);
      const audio = new Audio();
      audio.addEventListener('loadedmetadata', () => {
        const duration = Number.isFinite(audio.duration) ? audio.duration : undefined;
        URL.revokeObjectURL(url);
        resolve(duration);
      });
      audio.addEventListener('error', () => {
        URL.revokeObjectURL(url);
        resolve(undefined);
      });
      audio.src = url;
    });
  };

  // --- Transcription ---

  const handleTranscribe = async (audioBlob: Blob, fileName: string, sourceLabel: string, knownDuration?: number) => {
    setRecordingState('transcribing');
    setError(null);
    setFailedAudio(null);

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

      const [text, probedDuration] = await Promise.all([
        transcribeAudio(aiConfig, base64, fileName),
        knownDuration != null ? Promise.resolve(knownDuration) : getAudioDuration(audioBlob),
      ]);
      const durationSeconds = probedDuration;

      if (text.trim()) {
        const item = createTranscription(text, sourceLabel, durationSeconds);
        const updated = [item, ...transcriptions];
        persist(updated);
        setSelectedId(item.id);
      } else {
        setError('No speech detected in the audio. Please try again.');
        setFailedAudio({ blob: audioBlob, fileName, sourceLabel, knownDuration });
      }
    } catch (err) {
      setError(`Transcription error: ${err}`);
      setFailedAudio({ blob: audioBlob, fileName, sourceLabel, knownDuration });
    }

    setRecordingState('idle');
  };

  // --- Recording ---

  const releaseStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  const startRecording = async () => {
    try {
      setError(null);
      setFailedAudio(null);
      const { microphoneDeviceId } = getUserContext().settings;
      const audioConstraint = microphoneDeviceId
        ? { deviceId: { exact: microphoneDeviceId } }
        : true;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraint });
      streamRef.current = stream;
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      startVolumeMonitoring(stream);

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        // Calculate elapsed recording time
        let elapsed = pausedDurationRef.current;
        if (recordingStartRef.current) {
          elapsed += (Date.now() - recordingStartRef.current) / 1000;
        }
        const recordedDuration = elapsed > 0 ? elapsed : undefined;
        recordingStartRef.current = null;
        pausedDurationRef.current = 0;

        releaseStream();
        stopVolumeMonitoring();
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        if (audioBlob.size > 0) {
          handleTranscribe(audioBlob, 'recording.webm', 'Mic recording', recordedDuration);
        }
      };

      recordingStartRef.current = Date.now();
      pausedDurationRef.current = 0;
      mediaRecorder.start();
      setRecordingState('recording');
    } catch (err) {
      setError(`Microphone error: Could not access microphone. Please grant permission. (${err})`);
    }
  };

  const pauseRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.pause();
      if (recordingStartRef.current) {
        pausedDurationRef.current += (Date.now() - recordingStartRef.current) / 1000;
        recordingStartRef.current = null;
      }
      setRecordingState('paused');
    }
  };

  const resumeRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'paused') {
      mediaRecorderRef.current.resume();
      recordingStartRef.current = Date.now();
      setRecordingState('recording');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    // onstop handler will call handleTranscribe
  };

  const cancelRecording = () => {
    // Detach onstop handler so it doesn't transcribe
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.onstop = null;
      if (mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
    }
    releaseStream();
    stopVolumeMonitoring();
    audioChunksRef.current = [];
    recordingStartRef.current = null;
    pausedDurationRef.current = 0;
    setRecordingState('idle');
  };

  // --- Drag and drop ---

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current += 1;
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragOver(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current === 0) {
      setIsDragOver(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    dragCounterRef.current = 0;

    if (recordingState !== 'idle') return;

    const { files } = e.dataTransfer;
    if (files.length === 0) return;

    const file = files[0];
    if (isAudioFile(file)) {
      handleTranscribe(file, file.name, file.name);
    }
  };

  // --- File upload ---

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    handleTranscribe(file, file.name, file.name);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // --- Actions ---

  const copyToClipboard = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  const handleDelete = (id: string) => {
    setDeleteConfirmId(id);
  };

  const confirmDelete = () => {
    if (!deleteConfirmId) return;
    const state = { transcriptions };
    const updated = deleteTranscription(state, deleteConfirmId);
    persist(updated.transcriptions);
    if (selectedId === deleteConfirmId) {
      setSelectedId(null);
    }
    setDeleteConfirmId(null);
  };

  const formatDuration = (seconds?: number) => {
    if (seconds == null || !Number.isFinite(seconds)) return null;
    const totalSec = Math.round(seconds);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const formatTimestamp = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString();
  };

  // --- Detail view ---

  const selectedTranscription = selectedId
    ? transcriptions.find((t) => t.id === selectedId)
    : null;

  if (selectedTranscription) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <Paper
          sx={{
            p: 2,
            borderBottom: 1,
            borderColor: 'divider',
            display: 'flex',
            alignItems: 'center',
            gap: 1,
          }}
          elevation={1}
        >
          <Tooltip title="Back to list">
            <IconButton size="small" onClick={() => setSelectedId(null)}>
              <ArrowBackIcon />
            </IconButton>
          </Tooltip>
          <Box sx={{ flex: 1 }}>
            <Typography variant="subtitle1" fontWeight="bold">
              {selectedTranscription.sourceLabel}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {formatTimestamp(selectedTranscription.createdAt)}
              {formatDuration(selectedTranscription.durationSeconds) && (
                <> &middot; {formatDuration(selectedTranscription.durationSeconds)}</>
              )}
            </Typography>
          </Box>
          <Tooltip title={copiedId === selectedTranscription.id ? 'Copied!' : 'Copy text'}>
            <IconButton
              size="small"
              onClick={() => copyToClipboard(selectedTranscription.text, selectedTranscription.id)}
            >
              <ContentCopyIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Delete">
            <IconButton
              size="small"
              onClick={() => handleDelete(selectedTranscription.id)}
              sx={{ color: 'error.main' }}
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Paper>
        <Box sx={{ flex: 1, overflow: 'auto', p: 3 }}>
          <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap' }}>
            {selectedTranscription.text}
          </Typography>
        </Box>
      </Box>
    );
  }

  // --- List view ---

  const isIdle = recordingState === 'idle';
  const isRecordingOrPaused = recordingState === 'recording' || recordingState === 'paused';
  const isTranscribing = recordingState === 'transcribing';

  return (
    <Box
      sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Top section: drop zone + recording controls */}
      <Paper sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }} elevation={1}>
        {/* Drop zone */}
        <Box
          sx={{
            border: '2px dashed',
            borderColor: isDragOver ? 'primary.main' : 'divider',
            borderRadius: 2,
            p: 3,
            textAlign: 'center',
            bgcolor: isDragOver ? 'rgba(25, 118, 210, 0.08)' : 'transparent',
            transition: 'all 0.2s',
            mb: isRecordingOrPaused || isTranscribing ? 2 : 0,
          }}
        >
          {isTranscribing ? (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
              <CircularProgress size={24} />
              <Typography color="text.secondary">Transcribing audio...</Typography>
            </Box>
          ) : isRecordingOrPaused ? (
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2, mb: 1 }}>
                {recordingState === 'paused' ? (
                  <Typography color="warning.main" fontWeight="bold">Paused</Typography>
                ) : (
                  <>
                    <Box
                      sx={{
                        width: 10,
                        height: 10,
                        borderRadius: '50%',
                        bgcolor: 'error.main',
                        animation: 'pulse 1.5s infinite',
                        '@keyframes pulse': {
                          '0%, 100%': { opacity: 1 },
                          '50%': { opacity: 0.3 },
                        },
                      }}
                    />
                    <Typography color="error.main" fontWeight="bold">Recording</Typography>
                  </>
                )}
                {/* Volume bars */}
                {recordingState === 'recording' && (
                  <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: '2px', height: 24 }}>
                    {[0, 1, 2, 3, 4].map((i) => {
                      const barLevel = Math.max(
                        0.15,
                        audioLevel * (0.5 + Math.sin(Date.now() / 150 + i * 1.2) * 0.5),
                      );
                      return (
                        <Box
                          key={i}
                          sx={{
                            width: 3,
                            borderRadius: 1,
                            bgcolor: 'error.main',
                            height: `${barLevel * 100}%`,
                            minHeight: 3,
                            transition: 'height 0.1s ease',
                          }}
                        />
                      );
                    })}
                  </Box>
                )}
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1 }}>
                {recordingState === 'recording' ? (
                  <Tooltip title="Pause">
                    <IconButton onClick={pauseRecording} sx={{ color: 'warning.main' }}>
                      <PauseIcon />
                    </IconButton>
                  </Tooltip>
                ) : (
                  <Tooltip title="Resume">
                    <IconButton onClick={resumeRecording} color="primary">
                      <ResumeIcon />
                    </IconButton>
                  </Tooltip>
                )}
                <Tooltip title="Stop and transcribe">
                  <IconButton onClick={stopRecording} sx={{ color: 'error.main' }}>
                    <StopIcon />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Cancel">
                  <IconButton onClick={cancelRecording}>
                    <CloseIcon />
                  </IconButton>
                </Tooltip>
              </Box>
            </Box>
          ) : (
            <Box>
              <AudioFileIcon sx={{ fontSize: 36, color: 'text.disabled', mb: 1 }} />
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                Drop audio file here
              </Typography>
              <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1 }}>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<UploadFileIcon />}
                  onClick={() => fileInputRef.current?.click()}
                >
                  Upload File
                </Button>
                <Button
                  variant="contained"
                  size="small"
                  startIcon={<MicIcon />}
                  onClick={startRecording}
                  color="error"
                >
                  Record
                </Button>
              </Box>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                accept=".mp3,.mp4,.mpeg,.mpga,.m4a,.wav,.webm,.ogg"
                style={{ display: 'none' }}
              />
              <Typography variant="caption" color="text.disabled" sx={{ mt: 1.5, display: 'block' }}>
                Tip: Press {navigator.platform.includes('Mac') ? 'Cmd' : 'Ctrl'}+Alt+V anywhere to dictate and paste into any app
              </Typography>
            </Box>
          )}
        </Box>

        {error && (
          <Box sx={{ mt: 1, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Typography variant="body2" color="error" sx={{ flex: 1 }}>
              {error}
            </Typography>
            {failedAudio && (
              <Button
                size="small"
                startIcon={<ReplayIcon />}
                onClick={() => {
                  const { blob, fileName, sourceLabel, knownDuration } = failedAudio;
                  handleTranscribe(blob, fileName, sourceLabel, knownDuration);
                }}
              >
                Retry
              </Button>
            )}
          </Box>
        )}
      </Paper>

      {/* Transcription list */}
      <Box sx={{ flex: 1, overflow: 'auto' }}>
        {transcriptions.length === 0 ? (
          <Box sx={{ textAlign: 'center', p: 4 }}>
            <Typography color="text.secondary">
              No transcriptions yet. Record or upload an audio file to get started.
            </Typography>
          </Box>
        ) : (
          <List disablePadding>
            {transcriptions.map((t) => (
              <ListItemButton
                key={t.id}
                onClick={() => setSelectedId(t.id)}
                sx={{ borderBottom: 1, borderColor: 'divider' }}
              >
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <MicIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                      <Typography variant="body2" fontWeight="bold" noWrap>
                        {t.sourceLabel}
                      </Typography>
                    </Box>
                  }
                  secondary={
                    <Box component="span">
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        noWrap
                        component="span"
                        sx={{ display: 'block' }}
                      >
                        {t.text.slice(0, 100)}{t.text.length > 100 ? '...' : ''}
                      </Typography>
                      <Typography variant="caption" color="text.disabled" component="span">
                        {formatTimestamp(t.createdAt)}
                        {formatDuration(t.durationSeconds) && (
                          <> &middot; {formatDuration(t.durationSeconds)}</>
                        )}
                      </Typography>
                    </Box>
                  }
                />
                <Box sx={{ display: 'flex', gap: 0.5, ml: 1, flexShrink: 0 }}>
                  <Tooltip title={copiedId === t.id ? 'Copied!' : 'Copy'}>
                    <IconButton
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        copyToClipboard(t.text, t.id);
                      }}
                    >
                      <ContentCopyIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Delete">
                    <IconButton
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(t.id);
                      }}
                      sx={{ '&:hover': { color: 'error.main' } }}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Box>
              </ListItemButton>
            ))}
          </List>
        )}
      </Box>

      {/* Delete confirmation dialog */}
      <Dialog
        open={deleteConfirmId !== null}
        onClose={() => setDeleteConfirmId(null)}
      >
        <DialogTitle>Delete transcription?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This transcription will be permanently deleted.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirmId(null)}>Cancel</Button>
          <Button onClick={confirmDelete} color="error">
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
