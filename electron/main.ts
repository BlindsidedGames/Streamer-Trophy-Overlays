import { fork, type ChildProcess } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

import {
  BrowserWindow,
  Menu,
  Tray,
  app,
  dialog,
  nativeImage,
  shell,
} from "electron";

import {
  DESKTOP_BASE_URL,
  DESKTOP_HOST,
  DESKTOP_PORT,
  isAllowedNavigation,
  resolveBackendExecDetails,
  resolveBackendWorkingDirectory,
  resolveAllowedOrigins,
  resolveBackendFailureMessage,
  resolveDesktopIconPath,
  resolveRendererUrl,
  resolveServerEntryPath,
} from "./runtime-utils.js";

type StartupMessage = {
  type?: string;
  code?: string;
  message?: string;
};

type ManagedBackendProcess = {
  baseUrl: string;
  stop(): Promise<void>;
};

const runtimeDirectory = dirname(fileURLToPath(import.meta.url));
const preloadPath = resolve(runtimeDirectory, "preload.js");
const singleInstanceLock = app.requestSingleInstanceLock();

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let backendProcess: ManagedBackendProcess | null = null;
let isQuitting = false;
let closePromptOpen = false;
let activeRendererUrl = resolveRendererUrl(process.env, DESKTOP_BASE_URL);
let activeAllowedOrigins = resolveAllowedOrigins(activeRendererUrl, DESKTOP_BASE_URL);

if (!singleInstanceLock) {
  app.quit();
}

const showFatalStartupError = (message: string) => {
  dialog.showErrorBox("Unable to start PSN Trophy Overlay Suite", message);
};

const appendOutputTail = (currentTail: string, chunk: Buffer | string) => {
  const nextTail = `${currentTail}${chunk.toString()}`;
  return nextTail.slice(-4000);
};

const waitForUrl = async (
  url: string,
  timeoutMs: number,
  onPoll?: () => void,
) => {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    onPoll?.();

    try {
      const response = await fetch(url, { cache: "no-store" });

      if (response.ok) {
        return;
      }
    } catch {
      // The dev server or local backend may still be starting.
    }

    await delay(250);
  }

  throw new Error(`Timed out waiting for ${url}.`);
};

const buildWindow = async () => {
  const iconPath = resolveDesktopIconPath(app.getAppPath());
  const icon = iconPath ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty();

  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1100,
    minHeight: 760,
    show: false,
    backgroundColor: "#0b0f14",
    autoHideMenuBar: true,
    title: "PSN Trophy Overlay Suite",
    icon: icon.isEmpty() ? undefined : icon,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  window.webContents.on("will-navigate", (event, url) => {
    if (!isAllowedNavigation(url, activeAllowedOrigins)) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });

  window.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault();
      void promptForCloseAction(window);
    }
  });

  window.on("closed", () => {
    if (mainWindow === window) {
      mainWindow = null;
    }
  });

  await window.loadURL(activeRendererUrl);
  window.show();
  window.focus();
  mainWindow = window;
  return window;
};

const showMainWindow = async () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }

    if (!mainWindow.isVisible()) {
      mainWindow.show();
    }

    mainWindow.focus();
    return mainWindow;
  }

  return buildWindow();
};

const promptForCloseAction = async (window: BrowserWindow) => {
  if (closePromptOpen) {
    return;
  }

  closePromptOpen = true;

  try {
    const { response } = await dialog.showMessageBox(window, {
      type: "question",
      buttons: ["Minimize to tray", "Quit app", "Cancel"],
      defaultId: 0,
      cancelId: 2,
      noLink: true,
      title: "Keep overlays running?",
      message: "Do you want to minimize to the tray or close the app?",
      detail:
        "Minimizing to the tray keeps the local overlay URLs running for OBS while the window is hidden.",
    });

    if (response === 0) {
      window.hide();
      return;
    }

    if (response === 1) {
      isQuitting = true;
      app.quit();
    }
  } finally {
    closePromptOpen = false;
  }
};

const ensureTray = () => {
  if (tray) {
    return tray;
  }

  const iconPath = resolveDesktopIconPath(app.getAppPath());
  const trayIcon =
    iconPath != null ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty();

  tray = new Tray(trayIcon.isEmpty() ? nativeImage.createEmpty() : trayIcon);
  tray.setToolTip("PSN Trophy Overlay Suite");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: "Show",
        click: () => {
          void showMainWindow();
        },
      },
      {
        label: "Quit",
        click: () => {
          isQuitting = true;
          app.quit();
        },
      },
    ]),
  );
  tray.on("click", () => {
    void showMainWindow();
  });
  return tray;
};

const startBackendProcess = async (): Promise<ManagedBackendProcess> => {
  const appPath = app.getAppPath();
  const serverEntryPath = resolveServerEntryPath({
    appPath,
    overridePath: process.env.ELECTRON_SERVER_ENTRY,
  });
  const backendExec = resolveBackendExecDetails({
    env: process.env,
    packaged: app.isPackaged,
    electronExecPath: process.execPath,
  });
  const childEnv: NodeJS.ProcessEnv = {
    ...process.env,
    HOST: DESKTOP_HOST,
    PORT: String(DESKTOP_PORT),
    APP_DATA_DIR: app.getPath("userData"),
  };

  if (backendExec.useElectronRunAsNode) {
    childEnv.ELECTRON_RUN_AS_NODE = "1";
  } else {
    delete childEnv.ELECTRON_RUN_AS_NODE;
  }

  const child = fork(serverEntryPath, [], {
    cwd: resolveBackendWorkingDirectory({
      appPath,
      resourcesPath: process.resourcesPath,
    }),
    execPath: backendExec.execPath,
    stdio: ["ignore", "pipe", "pipe", "ipc"],
    env: childEnv,
  });

  let stopping = false;
  let stderrTail = "";
  let startupError: StartupMessage | null = null;
  let launchError: NodeJS.ErrnoException | null = null;

  child.stdout?.on("data", (chunk) => {
    process.stdout.write(chunk);
  });
  child.stderr?.on("data", (chunk) => {
    stderrTail = appendOutputTail(stderrTail, chunk);
    process.stderr.write(chunk);
  });
  child.on("message", (message: StartupMessage) => {
    if (message?.type === "startup-error") {
      startupError = message;
    }
  });
  child.once("error", (error: NodeJS.ErrnoException) => {
    launchError = error;
  });

  await waitForUrl(`${DESKTOP_BASE_URL}/api/health`, 15_000, () => {
    if (launchError) {
      throw new Error(
        resolveBackendFailureMessage({
          code: launchError.code,
          message: launchError.message,
          stderrTail,
        }),
      );
    }

    if (startupError) {
      throw new Error(
        resolveBackendFailureMessage({
          code: startupError.code,
          message: startupError.message,
          stderrTail,
        }),
      );
    }

    if (child.exitCode != null) {
      throw new Error(
        resolveBackendFailureMessage({
          message: "The local backend exited before it became ready.",
          stderrTail,
        }),
      );
    }
  });

  child.once("exit", (_code, signal) => {
    if (stopping || isQuitting) {
      return;
    }

    const message = resolveBackendFailureMessage({
      code: startupError?.code,
      message:
        startupError?.message ??
        `The local backend stopped unexpectedly${signal ? ` (${signal})` : ""}.`,
      stderrTail,
    });
    showFatalStartupError(message);
    isQuitting = true;
    app.quit();
  });

  return {
    baseUrl: DESKTOP_BASE_URL,
    stop: async () => {
      stopping = true;

      if (child.exitCode != null) {
        return;
      }

      child.kill("SIGTERM");

      await Promise.race([
        new Promise<void>((resolveExit) => {
          child.once("exit", () => resolveExit());
        }),
        delay(5_000).then(() => {
          if (child.exitCode == null) {
            child.kill("SIGKILL");
          }
        }),
      ]);
    },
  };
};

const startDesktopApp = async () => {
  backendProcess = await startBackendProcess();
  activeRendererUrl = resolveRendererUrl(process.env, backendProcess.baseUrl);
  activeAllowedOrigins = resolveAllowedOrigins(activeRendererUrl, backendProcess.baseUrl);

  if (activeRendererUrl !== backendProcess.baseUrl) {
    await waitForUrl(activeRendererUrl, 15_000);
  }

  ensureTray();
  await showMainWindow();
};

app.setAppUserModelId("com.streamertools.psn-overlay-suite");
app.setName("PSN Trophy Overlay Suite");

app.on("second-instance", () => {
  void showMainWindow();
});

app.on("before-quit", () => {
  isQuitting = true;
});

app.on("activate", () => {
  void showMainWindow();
});

app.whenReady().then(async () => {
  try {
    await startDesktopApp();
  } catch (error) {
    showFatalStartupError(
      error instanceof Error ? error.message : "Unable to start the desktop app.",
    );
    isQuitting = true;
    app.quit();
  }
});

app.on("will-quit", (event) => {
  if (!backendProcess) {
    return;
  }

  event.preventDefault();
  const nextBackend = backendProcess;
  backendProcess = null;
  void nextBackend.stop().finally(() => {
    tray?.destroy();
    tray = null;
    app.exit(0);
  });
});
