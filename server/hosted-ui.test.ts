import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";

import {
  createDefaultActiveGameSelection,
  createDefaultOverlaySettings,
  type HealthResponse,
  type OverlayDataResponse,
  type PsnTokenStatusResponse,
  type TitleSearchResponse,
  type TitleTrophiesResponse,
  type TrophySummaryResponse,
  type UnearnedTrophiesResponse,
} from "../shared/contracts.js";
import { createApp } from "./app.js";
import { attachHostedUi, resolveHostedUiPaths } from "./hosted-ui.js";

const temporaryDirectories: string[] = [];

const createTitleSearchResponse = (): TitleSearchResponse => ({
  results: [],
  nextOffset: null,
  totalItemCount: 0,
});

const createTitleTrophiesResponse = (): TitleTrophiesResponse => ({
  title: null,
  trophies: [],
  target: null,
  meta: {
    fetchedAt: "2026-03-17T00:00:00Z",
    cached: false,
    warnings: [],
    partial: false,
  },
});

const createPsnTokenStatusResponse = (
  configured = true,
): PsnTokenStatusResponse => ({
  configured,
  storage: "local-file",
  updatedAt: configured ? "2026-03-17T00:00:00Z" : null,
});

const createUnearnedTrophiesResponse = (): UnearnedTrophiesResponse => ({
  trophies: [],
  meta: {
    fetchedAt: "2026-03-17T00:00:00Z",
    cached: false,
    warnings: [],
    partial: false,
  },
});

const createServiceStub = () => ({
  getHealth: (): HealthResponse => ({
    status: "ok",
    configured: true,
    source: "psn-api",
  }),
  getPsnTokenStatus: () => createPsnTokenStatusResponse(),
  savePsnToken: () => createPsnTokenStatusResponse(),
  clearPsnToken: () => createPsnTokenStatusResponse(false),
  getSummary: async (): Promise<TrophySummaryResponse> => ({
    profile: null,
    titles: [],
    meta: {
      fetchedAt: "2026-03-17T00:00:00Z",
      cached: false,
      warnings: [],
      partial: false,
      source: "psn-api",
    },
  }),
  searchTitles: async (): Promise<TitleSearchResponse> => createTitleSearchResponse(),
  getTitleTrophies: async (): Promise<TitleTrophiesResponse> => createTitleTrophiesResponse(),
  getUnearnedTrophies: async (): Promise<UnearnedTrophiesResponse> =>
    createUnearnedTrophiesResponse(),
  getSettings: () => createDefaultOverlaySettings(),
  updateSettings: (settings: ReturnType<typeof createDefaultOverlaySettings>) => settings,
  getActiveGame: () => createDefaultActiveGameSelection(),
  updateActiveGame: (activeGame: ReturnType<typeof createDefaultActiveGameSelection>) =>
    activeGame,
  updateTargetTrophy: () => null,
  getOverlayData: async (): Promise<OverlayDataResponse> => ({
    overall: null,
    currentGame: null,
    targetTrophy: null,
    display: {
      settings: createDefaultOverlaySettings(),
      loopOrder: ["overall", "currentGame"],
      lastRefreshAt: "2026-03-17T00:00:00Z",
    },
    meta: {
      fetchedAt: "2026-03-17T00:00:00Z",
      cached: false,
      warnings: [],
      partial: false,
    },
  }),
});

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop();
    if (directory) {
      rmSync(directory, { recursive: true, force: true });
    }
  }
});

describe("hosted UI runtime", () => {
  it("finds production assets from the provided roots", () => {
    const runtimeRoot = mkdtempSync(join(tmpdir(), "streamer-tools-ui-"));
    temporaryDirectories.push(runtimeRoot);

    mkdirSync(join(runtimeRoot, "dist"), { recursive: true });
    mkdirSync(join(runtimeRoot, "img"), { recursive: true });
    writeFileSync(join(runtimeRoot, ".env"), "PORT=4318\n", "utf8");

    expect(resolveHostedUiPaths([runtimeRoot])).toEqual({
      envPath: join(runtimeRoot, ".env"),
      clientDirectory: join(runtimeRoot, "dist"),
      imageDirectory: join(runtimeRoot, "img"),
    });
  });

  it("serves the dashboard shell for overlay routes and exposes image assets", async () => {
    const runtimeRoot = mkdtempSync(join(tmpdir(), "streamer-tools-ui-"));
    temporaryDirectories.push(runtimeRoot);

    const clientDirectory = join(runtimeRoot, "dist");
    const imageDirectory = join(runtimeRoot, "img");

    mkdirSync(clientDirectory, { recursive: true });
    mkdirSync(imageDirectory, { recursive: true });
    writeFileSync(
      join(clientDirectory, "index.html"),
      "<!doctype html><html><body><div id=\"root\">Control Room</div></body></html>",
      "utf8",
    );
    writeFileSync(join(imageDirectory, "40-gold.png"), "gold", "utf8");

    const app = createApp(createServiceStub());
    const attached = attachHostedUi(app, { clientDirectory, imageDirectory });

    expect(attached).toBe(true);

    const dashboardResponse = await request(app).get("/");
    const overlayResponse = await request(app).get("/overlay/current-game");
    const imageResponse = await request(app).get("/img/40-gold.png");

    expect(dashboardResponse.status).toBe(200);
    expect(dashboardResponse.text).toContain("Control Room");
    expect(overlayResponse.status).toBe(200);
    expect(overlayResponse.text).toContain("Control Room");
    expect(imageResponse.status).toBe(200);
    expect(Buffer.from(imageResponse.body).toString("utf8")).toBe("gold");
  });
});
