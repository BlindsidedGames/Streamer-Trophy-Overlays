import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type {
  PsnTokenStatusResponse,
  TitleSearchResponse,
  TrophySummaryResponse,
} from "../shared/contracts.js";
import { RealOverlaySuiteService } from "./overlay-suite-service.js";
import { StateStore } from "./store.js";

const tempPaths: string[] = [];

afterEach(() => {
  while (tempPaths.length > 0) {
    const next = tempPaths.pop();
    if (next) {
      rmSync(next, { recursive: true, force: true });
    }
  }
});

const createSummary = (): TrophySummaryResponse => ({
  profile: {
    accountId: "123",
    onlineId: "Vathreon",
    avatarUrl: null,
    trophyLevel: 335,
    progressToNextLevel: 66,
    tier: 4,
    earnedCounts: {
      platinum: 50,
      gold: 367,
      silver: 503,
      bronze: 1928,
      total: 2848,
    },
    totalEarnedCount: 2848,
    completionPercentage: null,
  },
  titles: [
    {
      titleId: "NPWR1",
      npCommunicationId: "NPWR1",
      npServiceName: "trophy2",
      titleName: "Bluey",
      platform: "PS5",
      iconUrl: "https://example.com/bluey.png",
      progress: 100,
      earnedCounts: {
        platinum: 1,
        gold: 8,
        silver: 8,
        bronze: 6,
        total: 23,
      },
      definedCounts: {
        platinum: 1,
        gold: 8,
        silver: 8,
        bronze: 6,
        total: 23,
      },
      earnedTotal: 23,
      definedTotal: 23,
      lastUpdated: "2026-03-17T00:00:00Z",
      hasTrophyGroups: false,
    },
  ],
  meta: {
    fetchedAt: "2026-03-17T00:00:00Z",
    cached: false,
    warnings: [],
    partial: false,
    source: "psn-api",
  },
});

const createSummaryService = (summary: TrophySummaryResponse) => ({
  getHealth: () => ({ status: "ok" as const, configured: true, source: "psn-api" as const }),
  getTokenStatus: (): PsnTokenStatusResponse => ({
    configured: true,
    storage: "local-file",
    updatedAt: "2026-03-17T00:00:00Z",
  }),
  saveToken: (): PsnTokenStatusResponse => ({
    configured: true,
    storage: "local-file",
    updatedAt: "2026-03-17T00:00:00Z",
  }),
  clearToken: (): PsnTokenStatusResponse => ({
    configured: false,
    storage: "local-file",
    updatedAt: null,
  }),
  getSummary: async () => summary,
  getTitleByNpCommunicationId: async (npCommunicationId: string) =>
    summary.titles.find((title) => title.npCommunicationId === npCommunicationId) ?? null,
  getTitleTrophies: async (npCommunicationId: string) => ({
    title:
      summary.titles.find((title) => title.npCommunicationId === npCommunicationId) ?? null,
    trophies: [
      {
        npCommunicationId,
        trophyId: 1,
        trophyGroupId: "default",
        name: "Best in Show",
        description: "Earn every trophy in Bluey.",
        iconUrl: "https://example.com/trophy.png",
        grade: "platinum" as const,
        earned: false,
        earnedAt: null,
        hidden: false,
        groupName: null,
      },
    ],
    meta: {
      fetchedAt: "2026-03-17T00:00:00Z",
      cached: false,
      warnings: [],
      partial: false,
    },
  }),
  searchTitles: async (): Promise<TitleSearchResponse> => ({
    results: [],
    nextOffset: null,
    totalItemCount: 0,
  }),
});

describe("RealOverlaySuiteService", () => {
  it("merges PSN data with overrides for overlay output", async () => {
    const directory = mkdtempSync(join(tmpdir(), "streamer-tools-overlay-"));
    tempPaths.push(directory);
    const store = new StateStore(join(directory, "app.sqlite"));
    const activeGame = store.getActiveGame();
    activeGame.selectedNpCommunicationId = "NPWR1";
    activeGame.override.titleName = "Bluey Override";
    activeGame.override.earnedCounts.gold = 9;
    store.saveActiveGame(activeGame);

    const service = new RealOverlaySuiteService(
      createSummaryService(createSummary()),
      store,
    );

    const overlay = await service.getOverlayData();

    expect(overlay.currentGame?.titleName).toBe("Bluey Override");
    expect(overlay.currentGame?.earnedCounts.gold).toBe(9);
    expect(overlay.currentGame?.fieldSources.titleName).toBe("override");
    expect(overlay.currentGame?.fieldSources.earnedCounts.gold).toBe("override");
    expect(overlay.targetTrophy).toBeNull();
    store.close();
  });

  it("supports custom-only active games", async () => {
    const directory = mkdtempSync(join(tmpdir(), "streamer-tools-overlay-"));
    tempPaths.push(directory);
    const store = new StateStore(join(directory, "app.sqlite"));
    const activeGame = store.getActiveGame();
    activeGame.mode = "custom";
    activeGame.override.titleName = "LEGO DC Super-Villains";
    activeGame.override.platform = "PS4";
    activeGame.override.definedCounts.bronze = 30;
    activeGame.override.earnedCounts.bronze = 4;
    store.saveActiveGame(activeGame);

    const service = new RealOverlaySuiteService(
      createSummaryService(createSummary()),
      store,
    );

    const overlay = await service.getOverlayData();

    expect(overlay.currentGame?.source).toBe("custom");
    expect(overlay.currentGame?.titleName).toBe("LEGO DC Super-Villains");
    expect(overlay.currentGame?.earnedCounts.bronze).toBe(4);
    expect(overlay.currentGame?.definedCounts.bronze).toBe(30);
    expect(overlay.targetTrophy).toBeNull();
    store.close();
  });

  it("falls back to the newest PSN title when the selected title is missing", async () => {
    const directory = mkdtempSync(join(tmpdir(), "streamer-tools-overlay-"));
    tempPaths.push(directory);
    const store = new StateStore(join(directory, "app.sqlite"));
    const activeGame = store.getActiveGame();
    activeGame.selectedNpCommunicationId = "MISSING";
    store.saveActiveGame(activeGame);

    const service = new RealOverlaySuiteService(
      createSummaryService(createSummary()),
      store,
    );

    const overlay = await service.getOverlayData();

    expect(overlay.currentGame?.npCommunicationId).toBe("NPWR1");
    expect(overlay.currentGame?.titleName).toBe("Bluey");
    store.close();
  });

  it("resolves the current target trophy for overlay output", async () => {
    const directory = mkdtempSync(join(tmpdir(), "streamer-tools-overlay-"));
    tempPaths.push(directory);
    const store = new StateStore(join(directory, "app.sqlite"));
    const activeGame = store.getActiveGame();
    activeGame.selectedNpCommunicationId = "NPWR1";
    store.saveActiveGame(activeGame);
    store.saveTargetTrophy({
      npCommunicationId: "NPWR1",
      trophyId: 1,
      trophyGroupId: "default",
    });

    const service = new RealOverlaySuiteService(
      createSummaryService(createSummary()),
      store,
    );

    const overlay = await service.getOverlayData();

    expect(overlay.targetTrophy?.titleName).toBe("Bluey");
    expect(overlay.targetTrophy?.trophyName).toBe("Best in Show");
    expect(overlay.display.loopOrder).toEqual(["overall", "currentGame"]);
    store.close();
  });

  it("includes the target trophy in loop order only when enabled and present", async () => {
    const directory = mkdtempSync(join(tmpdir(), "streamer-tools-overlay-"));
    tempPaths.push(directory);
    const store = new StateStore(join(directory, "app.sqlite"));
    const settings = store.getSettings();
    settings.showTargetTrophyInLoop = true;
    store.saveSettings(settings);

    const activeGame = store.getActiveGame();
    activeGame.selectedNpCommunicationId = "NPWR1";
    store.saveActiveGame(activeGame);
    store.saveTargetTrophy({
      npCommunicationId: "NPWR1",
      trophyId: 1,
      trophyGroupId: "default",
    });

    const service = new RealOverlaySuiteService(
      createSummaryService(createSummary()),
      store,
    );

    const overlay = await service.getOverlayData();

    expect(overlay.targetTrophy?.trophyName).toBe("Best in Show");
    expect(overlay.display.loopOrder).toEqual([
      "overall",
      "currentGame",
      "targetTrophy",
    ]);
    store.close();
  });

  it("omits the target trophy from loop order when enabled but no target exists", async () => {
    const directory = mkdtempSync(join(tmpdir(), "streamer-tools-overlay-"));
    tempPaths.push(directory);
    const store = new StateStore(join(directory, "app.sqlite"));
    const settings = store.getSettings();
    settings.showTargetTrophyInLoop = true;
    store.saveSettings(settings);

    const activeGame = store.getActiveGame();
    activeGame.selectedNpCommunicationId = "NPWR1";
    store.saveActiveGame(activeGame);

    const service = new RealOverlaySuiteService(
      createSummaryService(createSummary()),
      store,
    );

    const overlay = await service.getOverlayData();

    expect(overlay.targetTrophy).toBeNull();
    expect(overlay.display.loopOrder).toEqual(["overall", "currentGame"]);
    store.close();
  });
});
