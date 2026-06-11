const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("blackCordDesktop", {
  platform: "windows",
  desktop: true
});
