import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  DESKTOP_BASE_URL,
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

const temporaryDirectories: string[] = [];

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop();

    if (directory) {
      rmSync(directory, { recursive: true, force: true });
    }
  }
});

describe("desktop runtime helpers", () => {
  it("prefers the explicit dev renderer URL when one is configured", () => {
    expect(
      resolveRendererUrl({ ELECTRON_RENDERER_URL: "http://127.0.0.1:5173" }),
    ).toBe("http://127.0.0.1:5173");
    expect(resolveRendererUrl({}, DESKTOP_BASE_URL)).toBe(DESKTOP_BASE_URL);
  });

  it("allows only same-origin app navigation", () => {
    const allowedOrigins = resolveAllowedOrigins(
      "http://127.0.0.1:5173",
      DESKTOP_BASE_URL,
    );

    expect(isAllowedNavigation("http://127.0.0.1:5173/settings", allowedOrigins)).toBe(true);
    expect(isAllowedNavigation(`${DESKTOP_BASE_URL}/overlay/loop`, allowedOrigins)).toBe(true);
    expect(isAllowedNavigation("https://example.com", allowedOrigins)).toBe(false);
  });

  it("returns a stable blocking error when the desktop port is already occupied", () => {
    expect(
      resolveBackendFailureMessage({
        code: "EADDRINUSE",
        message: "listen EADDRINUSE: address already in use",
        port: DESKTOP_PORT,
      }),
    ).toBe(
      `Port ${DESKTOP_PORT} is already in use. Close the conflicting app or change PORT before retrying.`,
    );
  });

  it("uses the resources directory as the backend cwd for packaged asar builds", () => {
    expect(
      resolveBackendWorkingDirectory({
        appPath: "C:/Program Files/Streamer Tools/resources/app.asar",
        resourcesPath: "C:/Program Files/Streamer Tools/resources",
      }),
    ).toBe("C:/Program Files/Streamer Tools/resources");
    expect(
      resolveBackendWorkingDirectory({
        appPath: "C:/repo",
        resourcesPath: "C:/repo/resources",
      }),
    ).toBe("C:/repo");
  });

  it("maps backend launch ENOENT errors to a packaged-app startup message", () => {
    expect(
      resolveBackendFailureMessage({
        code: "ENOENT",
        message: "spawn C:/Temp/PSN Trophy Overlay Suite.exe ENOENT",
      }),
    ).toBe(
      "The local backend could not be launched. Reinstall the app or download a fresh release build.",
    );
  });

  it("finds the built server entry from the desktop dev layout", () => {
    const root = mkdtempSync(join(tmpdir(), "streamer-tools-electron-"));
    temporaryDirectories.push(root);
    mkdirSync(join(root, "build", "electron"), { recursive: true });
    mkdirSync(join(root, "build", "server"), { recursive: true });
    writeFileSync(join(root, "build", "server", "index.js"), "", "utf8");

    expect(
      resolveServerEntryPath({
        appPath: join(root, "build", "electron"),
      }),
    ).toBe(join(root, "build", "server", "index.js"));
  });

  it("finds the desktop icon from the repo root during desktop development", () => {
    const root = mkdtempSync(join(tmpdir(), "streamer-tools-electron-"));
    temporaryDirectories.push(root);
    mkdirSync(join(root, "build", "electron"), { recursive: true });
    mkdirSync(join(root, "build-assets"), { recursive: true });
    writeFileSync(join(root, "build-assets", "icon.ico"), "icon", "utf8");

    const previousCwd = process.cwd();
    process.chdir(root);

    try {
      expect(resolveDesktopIconPath(join(root, "build", "electron"))).toBe(
        join(root, "build-assets", "icon.ico"),
      );
    } finally {
      process.chdir(previousCwd);
    }
  });

  it("falls back to the generated PNG icon when the ico is unavailable", () => {
    const root = mkdtempSync(join(tmpdir(), "streamer-tools-electron-"));
    temporaryDirectories.push(root);
    mkdirSync(join(root, "build", "electron"), { recursive: true });
    mkdirSync(join(root, "build-assets"), { recursive: true });
    writeFileSync(join(root, "build-assets", "icon.png"), "icon", "utf8");

    const previousCwd = process.cwd();
    process.chdir(root);

    try {
      expect(resolveDesktopIconPath(join(root, "build", "electron"))).toBe(
        join(root, "build-assets", "icon.png"),
      );
    } finally {
      process.chdir(previousCwd);
    }
  });

  it("uses the host Node executable for desktop dev when npm provides one", () => {
    expect(
      resolveBackendExecDetails({
        env: {
          npm_node_execpath: "C:/Program Files/nodejs/node.exe",
        },
        packaged: false,
        electronExecPath: "C:/repo/node_modules/electron/dist/electron.exe",
      }),
    ).toEqual({
      execPath: "C:/Program Files/nodejs/node.exe",
      useElectronRunAsNode: false,
    });
  });

  it("uses the Electron runtime for packaged backend processes", () => {
    expect(
      resolveBackendExecDetails({
        env: {},
        packaged: true,
        electronExecPath: "C:/Program Files/Streamer Tools/PSN Trophy Overlay Suite.exe",
      }),
    ).toEqual({
      execPath: "C:/Program Files/Streamer Tools/PSN Trophy Overlay Suite.exe",
      useElectronRunAsNode: true,
    });
  });
});
