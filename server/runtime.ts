import { createServer, type Server as HttpServer } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";
import type { AddressInfo } from "node:net";
import type { Express } from "express";

import { createApp } from "./app.js";
import { attachHostedUi, resolveHostedUiPaths } from "./hosted-ui.js";
import {
  RealOverlaySuiteService,
  type OverlaySuiteService,
} from "./overlay-suite-service.js";

export interface ManagedOverlaySuiteService extends OverlaySuiteService {
  close?(): void;
}

export interface ServerRuntimeOptions {
  host?: string;
  port?: number;
  service?: ManagedOverlaySuiteService;
  rootCandidates?: string[];
  loadEnv?: boolean;
}

export interface StartedServerRuntime {
  app: Express;
  server: HttpServer;
  host: string;
  port: number;
  baseUrl: string;
  hostedUiAttached: boolean;
  stop(): Promise<void>;
}

const runtimeDirectory = dirname(fileURLToPath(import.meta.url));

export const createDefaultRootCandidates = (cwd = process.cwd()) => [
  cwd,
  resolve(runtimeDirectory, ".."),
  resolve(runtimeDirectory, "../.."),
];

const toPort = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
};

const resolveHost = (host?: string) =>
  typeof host === "string" && host.trim().length > 0 ? host.trim() : "127.0.0.1";

export const loadRuntimeEnvironment = (
  rootCandidates = createDefaultRootCandidates(),
) => {
  const { envPath, clientDirectory, imageDirectory } = resolveHostedUiPaths(rootCandidates);

  if (envPath) {
    dotenv.config({ path: envPath });
  } else {
    dotenv.config();
  }

  return {
    envPath,
    clientDirectory,
    imageDirectory,
  };
};

export const startServerRuntime = async ({
  host,
  port,
  service,
  rootCandidates = createDefaultRootCandidates(),
  loadEnv = true,
}: ServerRuntimeOptions = {}): Promise<StartedServerRuntime> => {
  const managedService = service ?? new RealOverlaySuiteService();
  const uiPaths = loadEnv
    ? loadRuntimeEnvironment(rootCandidates)
    : resolveHostedUiPaths(rootCandidates);
  const nextHost = resolveHost(host);
  const nextPort = port ?? toPort(process.env.PORT, 4318);
  const app = createApp(managedService);
  const hostedUiAttached = attachHostedUi(app, uiPaths);
  const server = createServer(app);

  await new Promise<void>((resolveStart, rejectStart) => {
    const onError = (error: Error) => {
      server.off("listening", onListening);
      rejectStart(error);
    };

    const onListening = () => {
      server.off("error", onError);
      resolveStart();
    };

    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(nextPort, nextHost);
  }).catch((error) => {
    managedService.close?.();
    throw error;
  });

  const address = server.address();
  const activePort =
    typeof address === "object" && address !== null
      ? (address as AddressInfo).port
      : nextPort;
  const baseUrl = `http://${nextHost}:${activePort}`;

  return {
    app,
    server,
    host: nextHost,
    port: activePort,
    baseUrl,
    hostedUiAttached,
    stop: () =>
      new Promise<void>((resolveStop, rejectStop) => {
        server.close((error) => {
          managedService.close?.();

          if (error) {
            rejectStop(error);
            return;
          }

          resolveStop();
        });
      }),
  };
};
