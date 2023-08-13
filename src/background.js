"use strict";

import {
  app,
  protocol,
  BrowserWindow,
  globalShortcut,
  clipboard,
  Menu,
  nativeImage,
  Tray,
} from "electron";
import { createProtocol } from "vue-cli-plugin-electron-builder/lib";
import installExtension, { VUEJS3_DEVTOOLS } from "electron-devtools-installer";
// import { isDefaultClause } from "typescript";
const isDevelopment = process.env.NODE_ENV !== "production";
const path = require("path");

let myTray = null;

const baseUrl = isDevelopment
  ? "http://localhost:8080/#"
  : "app://./index.html#"

const baseAssetsPath = isDevelopment ?
  path.resolve(__dirname, "bundled/assets")
  : path.resolve(__dirname, "assets");
// Scheme must be registered before the app is ready
protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { secure: true, standard: true } },
]);

async function createWindow() {
  // Create the browser window.
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.resolve(__dirname, "preload.js"),
      // Use pluginOptions.nodeIntegration, leave this alone
      // See nklayman.github.io/vue-cli-plugin-electron-builder/guide/security.html#node-integration for more info
      nodeIntegration: true, // process.env.ELECTRON_NODE_INTEGRATION,

      // The context isolation is required for the main window
      // see https://github.com/electron/forge/issues/2931
      contextIsolation: true,
    },
  });

 
  if (isDevelopment) {
    // Load the url of the dev server if in development mode
    // await win.loadURL(process.env.WEBPACK_DEV_SERVER_URL);
    await win.loadURL(baseUrl);
    if (!process.env.IS_TEST) win.webContents.openDevTools()
  } else {
    createProtocol('app');
    win.loadURL(baseUrl);
  }

  // Register a global shortcut
  const ret = globalShortcut.register("CommandOrControl+C+D", () => {
    const text = clipboard.readText("selection");
    win.webContents.send("shortcut-pressed", { text: text });
    win.show();
  });

  // Create the tray icon
  const icon = nativeImage.createFromPath(baseAssetsPath + "/TrayTemplate.png");
  myTray = new Tray(icon);
  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Settings",
      click: () => {
        // Create a new BrowserWindow for settings
        let settingsWindow = new BrowserWindow({
          width: 400,
          height: 300,
          webPreferences: {
            preload: path.resolve(__dirname, "preload.js"),
            // Use pluginOptions.nodeIntegration, leave this alone
            // See nklayman.github.io/vue-cli-plugin-electron-builder/guide/security.html#node-integration for more info
            nodeIntegration: true, // process.env.ELECTRON_NODE_INTEGRATION,
          },
        });
        settingsWindow.loadURL(baseUrl + "/settings");
      },
    },
    {
      label: "Quit",
      role: "quit",
    },
  ]);

  myTray.setToolTip("This is my Electron app.");
  myTray.setContextMenu(contextMenu);

  if (!ret) {
    console.log("registration failed");
  }
}

// Quit when all windows are closed.
app.on("window-all-closed", () => {
  // On macOS it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on("ready", async () => {
  if (isDevelopment && !process.env.IS_TEST) {
    // Install Vue Devtools
    try {
      await installExtension(VUEJS3_DEVTOOLS);
    } catch (e) {
      console.error("Vue Devtools failed to install:", e.toString());
    }
  }

  createWindow();
});

// Exit cleanly on request from parent process in development mode.
if (isDevelopment) {
  if (process.platform === "win32") {
    process.on("message", (data) => {
      if (data === "graceful-exit") {
        app.quit();
      }
    });
  } else {
    process.on("SIGTERM", () => {
      app.quit();
    });
  }
}
