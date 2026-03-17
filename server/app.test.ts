import request from "supertest";
import { describe, expect, it } from "vitest";

import {
  createDefaultActiveGameSelection,
  createDefaultOverlaySettings,
  type HealthResponse,
  type OverlayDataResponse,
  type PsnTokenStatusResponse,
  type TitleSearchResponse,
  type TitleTrophiesResponse,
  type TrophySummaryResponse,
} from "../shared/contracts.js";
import { createApp } from "./app.js";
import { AppError } from "./errors.js";

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

describe("createApp", () => {
  it("returns overlay data from the service", async () => {
    const app = createApp({
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
      getTitleTrophies: async (): Promise<TitleTrophiesResponse> =>
        createTitleTrophiesResponse(),
      getSettings: () => createDefaultOverlaySettings(),
      updateSettings: (settings) => settings,
      getActiveGame: () => createDefaultActiveGameSelection(),
      updateActiveGame: (activeGame) => activeGame,
      updateTargetTrophy: () => null,
      getOverlayData: async (): Promise<OverlayDataResponse> => ({
        overall: {
          onlineId: "Vathreon",
          avatarUrl: null,
          totalTrophies: 2848,
          completionPercentage: null,
          progressToNextLevel: 66,
          counts: {
            platinum: 50,
            gold: 367,
            silver: 503,
            bronze: 1928,
            total: 2848,
          },
        },
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

    const response = await request(app).get("/api/overlay-data");

    expect(response.status).toBe(200);
    expect(response.body.overall.onlineId).toBe("Vathreon");
  });

  it("persists settings via the service endpoints", async () => {
    const nextSettings = {
      ...createDefaultOverlaySettings(),
      overallDurationMs: 9000,
      showTargetTrophyTag: false,
      targetTrophyTagText: "Featured Trophy",
    };

    const app = createApp({
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
      getTitleTrophies: async (): Promise<TitleTrophiesResponse> =>
        createTitleTrophiesResponse(),
      getSettings: () => createDefaultOverlaySettings(),
      updateSettings: (settings) => settings,
      getActiveGame: () => createDefaultActiveGameSelection(),
      updateActiveGame: (activeGame) => activeGame,
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

    const response = await request(app).put("/api/settings").send(nextSettings);

    expect(response.status).toBe(200);
    expect(response.body.overallDurationMs).toBe(9000);
    expect(response.body.showTargetTrophyTag).toBe(false);
    expect(response.body.targetTrophyTagText).toBe("Featured Trophy");
  });

  it("omits target trophy from fallback loop order when overlay data fails", async () => {
    const failingSettings = {
      ...createDefaultOverlaySettings(),
      showTargetTrophyInLoop: true,
    };

    const app = createApp({
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
      getTitleTrophies: async (): Promise<TitleTrophiesResponse> =>
        createTitleTrophiesResponse(),
      getSettings: () => failingSettings,
      updateSettings: (settings) => settings,
      getActiveGame: () => createDefaultActiveGameSelection(),
      updateActiveGame: (activeGame) => activeGame,
      updateTargetTrophy: () => null,
      getOverlayData: async (): Promise<OverlayDataResponse> => {
        throw new Error("overlay unavailable");
      },
    });

    const response = await request(app).get("/api/overlay-data");

    expect(response.status).toBe(500);
    expect(response.body.targetTrophy).toBeNull();
    expect(response.body.display.loopOrder).toEqual(["overall", "currentGame"]);
  });

  it("persists and clears the PSN token through dedicated routes", async () => {
    let tokenStatus = createPsnTokenStatusResponse(false);

    const app = createApp({
      getHealth: (): HealthResponse => ({
        status: "ok",
        configured: tokenStatus.configured,
        source: "psn-api",
      }),
      getPsnTokenStatus: () => tokenStatus,
      savePsnToken: () => {
        tokenStatus = createPsnTokenStatusResponse(true);
        return tokenStatus;
      },
      clearPsnToken: () => {
        tokenStatus = createPsnTokenStatusResponse(false);
        return tokenStatus;
      },
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
      getTitleTrophies: async (): Promise<TitleTrophiesResponse> =>
        createTitleTrophiesResponse(),
      getSettings: () => createDefaultOverlaySettings(),
      updateSettings: (settings) => settings,
      getActiveGame: () => createDefaultActiveGameSelection(),
      updateActiveGame: (activeGame) => activeGame,
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

    const before = await request(app).get("/api/psn-token");
    expect(before.status).toBe(200);
    expect(before.body.configured).toBe(false);

    const saved = await request(app).put("/api/psn-token").send({ token: "secret-token" });
    expect(saved.status).toBe(200);
    expect(saved.body.configured).toBe(true);

    const health = await request(app).get("/api/health");
    expect(health.status).toBe(200);
    expect(health.body.configured).toBe(true);

    const cleared = await request(app).delete("/api/psn-token");
    expect(cleared.status).toBe(200);
    expect(cleared.body.configured).toBe(false);
  });

  it("rejects empty PSN token saves with a 400", async () => {
    const app = createApp({
      getHealth: (): HealthResponse => ({
        status: "ok",
        configured: false,
        source: "psn-api",
      }),
      getPsnTokenStatus: () => createPsnTokenStatusResponse(false),
      savePsnToken: () => {
        throw new AppError(
          "invalid_request",
          "A PSN token is required before you can save it.",
        );
      },
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
      getTitleTrophies: async (): Promise<TitleTrophiesResponse> =>
        createTitleTrophiesResponse(),
      getSettings: () => createDefaultOverlaySettings(),
      updateSettings: (settings) => settings,
      getActiveGame: () => createDefaultActiveGameSelection(),
      updateActiveGame: (activeGame) => activeGame,
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

    const response = await request(app).put("/api/psn-token").send({});

    expect(response.status).toBe(400);
  });
});
