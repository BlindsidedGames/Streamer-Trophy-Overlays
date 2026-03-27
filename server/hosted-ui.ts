import { existsSync } from "node:fs";
import { resolve } from "node:path";

import express, { type Express } from "express";
import { overlayRoutePaths } from "../shared/contracts.js";

const dashboardRoutes = [
  "/",
  ...Object.values(overlayRoutePaths),
];

export interface HostedUiPaths {
  clientDirectory: string | null;
  imageDirectory: string | null;
}

export interface HostedUiRuntimePaths extends HostedUiPaths {
  envPath: string | null;
}

export const resolveExistingPath = (
  rootCandidates: string[],
  relativePath: string,
) =>
  rootCandidates
    .map((candidate) => resolve(candidate, relativePath))
    .find((candidate) => existsSync(candidate)) ?? null;

export const resolveHostedUiPaths = (
  rootCandidates: string[],
): HostedUiRuntimePaths => ({
  envPath: resolveExistingPath(rootCandidates, ".env"),
  clientDirectory: resolveExistingPath(rootCandidates, "dist"),
  imageDirectory: resolveExistingPath(rootCandidates, "img"),
});

export const attachHostedUi = (
  app: Express,
  { clientDirectory, imageDirectory }: HostedUiPaths,
) => {
  if (imageDirectory) {
    app.use("/img", express.static(imageDirectory));
  }

  if (!clientDirectory) {
    return false;
  }

  app.use(express.static(clientDirectory, { index: false }));
  app.get(dashboardRoutes, (_request, response) => {
    response.sendFile(resolve(clientDirectory, "index.html"));
  });

  return true;
};
