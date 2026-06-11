const fs = require("fs");
const path = require("path");
const { app, BrowserWindow, Menu, shell, session } = require("electron");

const config = readConfig();
const appUrl = process.env.BLACK_CORD_URL || config.serverUrl || "https://blackcord.onrender.com";

app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
app.commandLine.appendSwitch("enable-features", "WebRTCPipeWireCapturer");
app.commandLine.appendSwitch("force-fieldtrials", "WebRTC-Audio-Agc2/Enabled/");

let mainWindow;

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(["media", "audioCapture"].includes(permission));
  });

  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    return ["media", "audioCapture"].includes(permission);
  });

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 620,
    backgroundColor: "#101316",
    title: "Black Cord",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  });

  mainWindow.loadURL(appUrl);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", event => {
    const current = new URL(appUrl);
    const target = new URL(event.url);
    if (target.origin !== current.origin) {
      event.preventDefault();
      shell.openExternal(event.url);
    }
  });

  Menu.setApplicationMenu(null);
}

function readConfig() {
  const configPath = path.join(__dirname, "app-config.json");
  try {
    return JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch {
    return {};
  }
}
