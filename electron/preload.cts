const { contextBridge, ipcRenderer } = require("electron") as typeof import("electron");

contextBridge.exposeInMainWorld("streamerToolsDesktop", {
  platform: "desktop",
  windowControls: {
    minimize: () => ipcRenderer.send("desktop-window:minimize"),
    maximizeOrRestore: () => ipcRenderer.send("desktop-window:maximize-or-restore"),
    close: () => ipcRenderer.send("desktop-window:close"),
    isMaximized: () => ipcRenderer.invoke("desktop-window:is-maximized") as Promise<boolean>,
    onMaximizedChange: (listener: (isMaximized: boolean) => void) => {
      const handleChange = (_event: Electron.IpcRendererEvent, isMaximized: boolean) => {
        listener(isMaximized);
      };

      ipcRenderer.on("desktop-window:maximized-changed", handleChange);

      return () => {
        ipcRenderer.removeListener("desktop-window:maximized-changed", handleChange);
      };
    },
  },
});
