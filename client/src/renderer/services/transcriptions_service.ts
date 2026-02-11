import { v4 as uuidv4 } from 'uuid';

export interface Transcription {
  id: string;
  text: string;
  sourceLabel: string; // "Mic recording" or filename
  createdAt: string; // ISO timestamp
  durationSeconds?: number; // audio duration in seconds
}

export interface TranscriptionsState {
  transcriptions: Transcription[];
}

const STORAGE_KEY = 'geckit-transcriptions';

const DEFAULT_STATE: TranscriptionsState = {
  transcriptions: [],
};

export function getTranscriptionsState(): TranscriptionsState {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (!stored) return DEFAULT_STATE;

  try {
    return { ...DEFAULT_STATE, ...JSON.parse(stored) };
  } catch {
    return DEFAULT_STATE;
  }
}

export function setTranscriptionsState(state: TranscriptionsState): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function createTranscription(
  text: string,
  sourceLabel: string,
  durationSeconds?: number,
): Transcription {
  return {
    id: uuidv4(),
    text,
    sourceLabel,
    createdAt: new Date().toISOString(),
    durationSeconds,
  };
}

export function deleteTranscription(
  state: TranscriptionsState,
  id: string,
): TranscriptionsState {
  return {
    ...state,
    transcriptions: state.transcriptions.filter((t) => t.id !== id),
  };
}
