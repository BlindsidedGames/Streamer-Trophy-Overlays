import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

export const DESKTOP_HOST = "127.0.0.1";
export const DESKTOP_PORT = 4318;
export const DESKTOP_BASE_URL = `http://${DESKTOP_HOST}:${DESKTOP_PORT}`;
const DEFAULT_RENDERER_URL = DESKTOP_BASE_URL;

export const resolveRendererUrl = (
  env: NodeJS.ProcessEnv,
  fallbackUrl = DEFAULT_RENDERER_URL,
) => {
  const rendererUrl = env.ELECTRON_RENDERER_URL;
  return typeof rendererUrl === "string" && rendererUrl.trim().length > 0
    ? rendererUrl.trim()
    : fallbackUrl;
};

export const resolveAllowedOrigins = (...urls: string[]) =>
  Array.from(
    new Set(
      urls
        .filter((value) => value.length > 0)
        .map((value) => new URL(value).origin),
    ),
  );

export const isAllowedNavigation = (url: string, allowedOrigins: string[]) => {
  if (url === "about:blank") {
    return true;
  }

  try {
    return allowedOrigins.includes(new URL(url).origin);
  } catch {
    return false;
  }
};

export const resolveServerEntryPath = ({
  appPath,
  overridePath,
}: {
  appPath: string;
  overridePath?: string | null;
}) => {
  const candidates = overridePath?.trim().length
    ? [overridePath.trim()]
    : [
        resolve(appPath, "build", "server", "index.js"),
        resolve(appPath, "..", "server", "index.js"),
        resolve(process.cwd(), "build", "server", "index.js"),
      ];
  const candidate = candidates.find((entry) => existsSync(entry));

  if (!candidate) {
    throw new Error(
      `Unable to find the packaged server entry. Checked: ${candidates.join(", ")}`,
    );
  }

  return candidate;
};

export const resolveDesktopIconPath = (appPath: string) => {
  const candidateRoots = [
    resolve(appPath, "build-assets"),
    resolve(appPath, "..", "..", "build-assets"),
    resolve(process.cwd(), "build-assets"),
  ];
  const candidates = candidateRoots.flatMap((root) => [
    resolve(root, "icon.ico"),
    resolve(root, "icon.png"),
  ]);

  return candidates.find((candidate) => existsSync(candidate)) ?? null;
};

export const resolveBackendExecDetails = ({
  env,
  packaged,
  electronExecPath,
}: {
  env: NodeJS.ProcessEnv;
  packaged: boolean;
  electronExecPath: string;
}) => {
  const explicitExecPath = env.ELECTRON_SERVER_EXEC_PATH?.trim();

  if (explicitExecPath) {
    return {
      execPath: explicitExecPath,
      useElectronRunAsNode: false,
    };
  }

  if (!packaged) {
    const hostNodeExecPath = env.npm_node_execpath?.trim();

    if (hostNodeExecPath) {
      return {
        execPath: hostNodeExecPath,
        useElectronRunAsNode: false,
      };
    }
  }

  return {
    execPath: electronExecPath,
    useElectronRunAsNode: true,
  };
};

export const resolveBackendWorkingDirectory = ({
  appPath,
  resourcesPath,
}: {
  appPath: string;
  resourcesPath?: string | null;
}) => {
  if (appPath.toLowerCase().endsWith(".asar")) {
    if (typeof resourcesPath === "string" && resourcesPath.trim().length > 0) {
      return resourcesPath.trim();
    }

    return dirname(appPath);
  }

  return appPath;
};

export const resolveBackendFailureMessage = ({
  code,
  message,
  stderrTail,
  port = DESKTOP_PORT,
}: {
  code?: string | null;
  message?: string | null;
  stderrTail?: string;
  port?: number;
}) => {
  const trimmedMessage = typeof message === "string" ? message.trim() : "";
  const trimmedStderr = typeof stderrTail === "string" ? stderrTail.trim() : "";

  if (code === "EADDRINUSE" || trimmedMessage.includes("already in use")) {
    return `Port ${port} is already in use. Close the conflicting app or change PORT before retrying.`;
  }

  if (code === "ENOENT" || trimmedMessage.includes(" enoent")) {
    return "The local backend could not be launched. Reinstall the app or download a fresh release build.";
  }

  if (trimmedMessage.length > 0) {
    return trimmedMessage;
  }

  if (trimmedStderr.length > 0) {
    return trimmedStderr;
  }

  return "The local backend failed to start.";
};
