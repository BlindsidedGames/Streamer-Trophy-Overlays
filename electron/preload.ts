import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("streamerToolsDesktop", {
  platform: "desktop",
});
