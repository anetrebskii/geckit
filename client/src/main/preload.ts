// Disable no-unused-vars, broken for spread args
/* eslint no-unused-vars: off */
import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

export type Channels =
  | 'ipc-example'
  | 'shortcut-pressed'
  | 'voice-start'
  | 'voice-stop';

const electronHandler = {
  ipcRenderer: {
    sendMessage(channel: Channels, ...args: unknown[]) {
      ipcRenderer.send(channel, ...args);
    },
    on(channel: Channels, func: (...args: unknown[]) => void) {
      const subscription = (_event: IpcRendererEvent, ...args: unknown[]) =>
        func(...args);
      ipcRenderer.on(channel, subscription);

      return () => {
        ipcRenderer.removeListener(channel, subscription);
      };
    },
    once(channel: Channels, func: (...args: unknown[]) => void) {
      ipcRenderer.once(channel, (_event, ...args) => func(...args));
    },
  },
  // AI chat handler - calls main process to avoid CORS issues with Anthropic API
  ai: {
    chat: (request: unknown) => ipcRenderer.invoke('ai-chat', request),
    transcribe: (request: unknown) =>
      ipcRenderer.invoke('ai-transcribe', request),
    voiceTranscribe: (request: unknown) =>
      ipcRenderer.invoke('voice-transcription-result', request),
    voiceCancel: () => ipcRenderer.send('voice-cancel'),
  },
};

contextBridge.exposeInMainWorld('electron', electronHandler);

export type ElectronHandler = typeof electronHandler;
