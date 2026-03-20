/* eslint global-require: off, no-console: off, promise/always-return: off */

/**
 * This module executes inside of electron's main process. You can start
 * electron renderer process from here and communicate with the other processes
 * through IPC.
 *
 * When running `npm run build` or `npm run build:main`, this file is compiled to
 * `./src/main.js` using webpack. This gives us some performance wins.
 */
import path from 'path';
import { exec } from 'child_process';
import {
  app,
  BrowserWindow,
  shell,
  ipcMain,
  globalShortcut,
  clipboard,
  systemPreferences,
} from 'electron';
import { autoUpdater } from 'electron-updater';
import log from 'electron-log';
import { resolveHtmlPath } from './util';
import trackEvent from './analytics';
import {
  sendChatMessage,
  SendMessageRequest,
  transcribeAudio,
  TranscribeRequest,
} from './ai_service';

class AppUpdater {
  constructor() {
    log.transports.file.level = 'info';
    autoUpdater.logger = log;
    autoUpdater.checkForUpdatesAndNotify();
  }
}

const RESOURCES_PATH = app.isPackaged
  ? path.join(process.resourcesPath, 'assets')
  : path.join(__dirname, '../../assets');

const getAssetPath = (...paths: string[]): string => {
  return path.join(RESOURCES_PATH, ...paths);
};

let mainWindow: BrowserWindow | null = null;
let voiceWindow: BrowserWindow | null = null;

ipcMain.on('ipc-example', async (event, arg) => {
  const msgTemplate = (pingPong: string) => `IPC test: ${pingPong}`;
  console.log(msgTemplate(arg));
  event.reply('ipc-example', msgTemplate('pong'));
});

// Handle AI chat requests from renderer - bypasses CORS issues
ipcMain.handle('ai-chat', async (_event, request: SendMessageRequest) => {
  return sendChatMessage(request);
});

// Handle audio transcription requests from renderer (OpenAI Whisper)
ipcMain.handle('ai-transcribe', async (_event, request: TranscribeRequest) => {
  return transcribeAudio(request);
});

// Handle voice popup transcription: transcribe → clipboard → paste back
ipcMain.handle(
  'voice-transcription-result',
  async (_event, request: TranscribeRequest) => {
    const result = await transcribeAudio(request);
    if (result.success && result.text) {
      clipboard.writeText(result.text);

      // Unregister voice shortcut so the simulated paste doesn't re-trigger it
      globalShortcut.unregister('CommandOrControl+Alt+V');

      // Close voice window
      if (voiceWindow) {
        voiceWindow.close();
        voiceWindow = null;
      }

      // Hide app so OS returns focus to previous app
      if (process.platform === 'darwin') {
        app.hide();
      }

      // Short delay then simulate Cmd+V to paste into previously focused app
      setTimeout(() => {
        if (process.platform === 'darwin') {
          exec(
            `osascript -e 'tell application "System Events" to keystroke "v" using command down'`,
          );
        }
        // Re-register voice shortcut after paste
        setTimeout(() => {
          registerVoiceShortcut();
        }, 500);
      }, 300);
    }
    return result;
  },
);

// Handle voice popup cancel
ipcMain.on('voice-cancel', () => {
  if (voiceWindow) {
    voiceWindow.close();
    voiceWindow = null;
  }
});

if (process.env.NODE_ENV === 'production') {
  const sourceMapSupport = require('source-map-support');
  sourceMapSupport.install();
}

const isDebug =
  process.env.NODE_ENV === 'development' || process.env.DEBUG_PROD === 'true';

if (isDebug) {
  require('electron-debug')();
}

const installExtensions = async () => {
  const installer = require('electron-devtools-installer');
  const forceDownload = !!process.env.UPGRADE_EXTENSIONS;
  const extensions = ['REACT_DEVELOPER_TOOLS'];

  return installer
    .default(
      extensions.map((name) => installer[name]),
      forceDownload,
    )
    .catch(console.log);
};

const enableDevtoolsExtensions = process.env.ENABLE_DEVTOOLS === 'true';

const registerVoiceShortcut = () => {
  globalShortcut.register('CommandOrControl+Alt+V', () => {
    if (voiceWindow) {
      // Already open → trigger stop (transcribe & paste)
      voiceWindow.webContents.send('voice-stop');
      return;
    }
    // Hide main window so it doesn't appear when the app un-hides
    if (mainWindow) mainWindow.hide();
    createVoiceWindow();
  });
};

const createVoiceWindow = () => {
  voiceWindow = new BrowserWindow({
    width: 300,
    height: 80,
    show: false,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    hasShadow: false,
    backgroundColor: '#00000000',
    webPreferences: {
      devTools: false,
      preload: app.isPackaged
        ? path.join(__dirname, 'preload.js')
        : path.join(__dirname, '../../.erb/dll/preload.js'),
    },
  });

  const voiceUrl = resolveHtmlPath('index.html');
  voiceWindow.loadURL(`${voiceUrl}#/voice`);

  voiceWindow.on('ready-to-show', () => {
    if (!voiceWindow) return;
    voiceWindow.show();
    voiceWindow.webContents.send('voice-start');
  });

  voiceWindow.on('closed', () => {
    voiceWindow = null;
  });
};

const createWindow = async () => {
  if (isDebug && enableDevtoolsExtensions) {
    await installExtensions();
  }

  mainWindow = new BrowserWindow({
    show: false,
    icon: getAssetPath('icon.png'),
    height: 450,
    minHeight: 450,
    maximizable: false,
    useContentSize: true,
    webPreferences: {
      preload: app.isPackaged
        ? path.join(__dirname, 'preload.js')
        : path.join(__dirname, '../../.erb/dll/preload.js'),
    },
  });

  mainWindow.loadURL(resolveHtmlPath('index.html'));

  mainWindow.on('ready-to-show', () => {
    if (!mainWindow) {
      throw new Error('"mainWindow" is not defined');
    }
    if (process.env.START_MINIMIZED) {
      mainWindow.minimize();
    } else {
      mainWindow.show();
    }
  });

  // mainWindow.webContents.on('did-finish-load', () => {
  //   setTimeout(() => {
  //     if (!mainWindow) {
  //       throw new Error('"mainWindow" is not defined');
  //     }

  //     // const s = mainWindow.getContentBounds();

  //     // const size = mainWindow.getBrowserView().getBounds();
  //     // mainWindow.setSize(size[0], size[1]);
  //   }, 2000);
  // });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // const menuBuilder = new MenuBuilder(mainWindow);
  // menuBuilder.buildMenu();

  // Open urls in the user's browser
  mainWindow.webContents.setWindowOpenHandler((edata) => {
    shell.openExternal(edata.url);
    return { action: 'deny' };
  });

  mainWindow.setMenu(null);

  // Remove this if your app does not use auto updates
  // eslint-disable-next-line
  new AppUpdater();
};

/**
 * Add event listeners...
 */

app.on('window-all-closed', () => {
  // Respect the OSX convention of having the application in memory even
  // after all windows have been closed
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app
  .whenReady()
  .then(() => {
    if (process.platform === 'darwin') {
      systemPreferences.askForMediaAccess('microphone');
    }
    createWindow();
    app.on('activate', () => {
      // On macOS it's common to re-create a window in the app when the
      // dock icon is clicked and there are no other windows open.
      if (mainWindow === null) createWindow();
    });

    // Register a global shortcut
    globalShortcut.register('CommandOrControl+C+D', () => {
      trackEvent('shortcutPressed');
      if (mainWindow === null) {
        createWindow();
      }
      const text = clipboard.readText('selection');
      mainWindow!.webContents.send('shortcut-pressed', { text });
      mainWindow!.show();
    });

    // Register voice dictation shortcut (Cmd+C+V)
    registerVoiceShortcut();
  })
  .catch(console.log);
