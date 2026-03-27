import request from "supertest";
import { describe, expect, it } from "vitest";

import {
  createDefaultBrbState,
  createDefaultActiveGameSelection,
  createDefaultEarnedSessionCard,
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

const createUnearnedTrophiesResponse = (): UnearnedTrophiesResponse => ({
  trophies: [],
  meta: {
    fetchedAt: "2026-03-17T00:00:00Z",
    cached: false,
    warnings: [],
    partial: false,
  },
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
      getUnearnedTrophies: async (): Promise<UnearnedTrophiesResponse> =>
        createUnearnedTrophiesResponse(),
      getSettings: () => createDefaultOverlaySettings(),
      updateSettings: (settings) => settings,
      getActiveGame: () => createDefaultActiveGameSelection(),
      updateActiveGame: (activeGame) => activeGame,
      getBrbState: () => createDefaultBrbState(),
      updateBrbState: () => createDefaultBrbState(),
      getEarnedSessionState: () => createDefaultEarnedSessionCard(),
      updateEarnedSessionState: () => createDefaultEarnedSessionCard(),
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
        unearnedTrophies: null,
        currentGame: null,
        targetTrophy: null,
        brb: createDefaultBrbState(),
        earnedSession: createDefaultEarnedSessionCard(),
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

  it("returns aggregated unearned trophies from the service", async () => {
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
      getUnearnedTrophies: async (): Promise<UnearnedTrophiesResponse> => ({
        trophies: [
          {
            npCommunicationId: "NPWR1",
            trophyId: 1,
            trophyGroupId: "default",
            name: "Best in Show",
            description: "Earn every trophy in Bluey.",
            iconUrl: null,
            grade: "platinum",
            earned: false,
            earnedAt: null,
            hidden: false,
            groupName: null,
            trophyRare: 1,
            trophyEarnedRate: 11.1,
            titleName: "Bluey",
            titleIconUrl: "https://example.com/bluey.png",
            platform: "PS5",
            titleLastUpdated: "2026-03-17T00:00:00Z",
            target: false,
          },
        ],
        meta: {
          fetchedAt: "2026-03-17T00:00:00Z",
          cached: false,
          warnings: [],
          partial: false,
        },
      }),
      getSettings: () => createDefaultOverlaySettings(),
      updateSettings: (settings) => settings,
      getActiveGame: () => createDefaultActiveGameSelection(),
      updateActiveGame: (activeGame) => activeGame,
      getBrbState: () => createDefaultBrbState(),
      updateBrbState: () => createDefaultBrbState(),
      getEarnedSessionState: () => createDefaultEarnedSessionCard(),
      updateEarnedSessionState: () => createDefaultEarnedSessionCard(),
      updateTargetTrophy: () => null,
      getOverlayData: async (): Promise<OverlayDataResponse> => ({
        overall: null,
        unearnedTrophies: null,
        currentGame: null,
        targetTrophy: null,
        brb: createDefaultBrbState(),
        earnedSession: createDefaultEarnedSessionCard(),
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

    const response = await request(app).get("/api/trophies/unearned");

    expect(response.status).toBe(200);
    expect(response.body.trophies[0].titleName).toBe("Bluey");
    expect(response.body.trophies[0].trophyEarnedRate).toBe(11.1);
  });

  it("persists settings via the service endpoints", async () => {
    const nextSettings = {
      ...createDefaultOverlaySettings(),
      overallDurationMs: 9000,
      stripVisibility: {
        ...createDefaultOverlaySettings().stripVisibility,
        overall: {
          ...createDefaultOverlaySettings().stripVisibility.overall,
          artwork: false,
        },
      },
      stripZoneOrder: ["metrics", "trophies", "identity", "artwork", "targetInfo"],
      overlayAnchors: {
        ...createDefaultOverlaySettings().overlayAnchors,
        targetTrophy: "top-right",
        brb: "bottom-right",
      },
      showTargetTrophyArtwork: false,
      showTargetTrophyInfo: false,
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
      getUnearnedTrophies: async (): Promise<UnearnedTrophiesResponse> =>
        createUnearnedTrophiesResponse(),
      getSettings: () => createDefaultOverlaySettings(),
      updateSettings: (settings) => settings,
      getActiveGame: () => createDefaultActiveGameSelection(),
      updateActiveGame: (activeGame) => activeGame,
      getBrbState: () => createDefaultBrbState(),
      updateBrbState: () => createDefaultBrbState(),
      getEarnedSessionState: () => createDefaultEarnedSessionCard(),
      updateEarnedSessionState: () => createDefaultEarnedSessionCard(),
      updateTargetTrophy: () => null,
      getOverlayData: async (): Promise<OverlayDataResponse> => ({
        overall: null,
        unearnedTrophies: null,
        currentGame: null,
        targetTrophy: null,
        brb: createDefaultBrbState(),
        earnedSession: createDefaultEarnedSessionCard(),
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
    expect(response.body.stripVisibility.overall.artwork).toBe(false);
    expect(response.body.stripZoneOrder).toEqual([
      "metrics",
      "trophies",
      "identity",
      "artwork",
      "targetInfo",
    ]);
    expect(response.body.overlayAnchors.targetTrophy).toBe("top-right");
    expect(response.body.overlayAnchors.loop).toBe("bottom-left");
    expect(response.body.overlayAnchors.brb).toBe("bottom-right");
    expect(response.body.showTargetTrophyArtwork).toBe(false);
    expect(response.body.showTargetTrophyInfo).toBe(false);
    expect(response.body.showTargetTrophyTag).toBe(false);
    expect(response.body.targetTrophyTagText).toBe("Featured Trophy");
  });

  it("updates BRB runtime state through the dedicated route", async () => {
    let receivedRequest: unknown = null;

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
      getUnearnedTrophies: async (): Promise<UnearnedTrophiesResponse> =>
        createUnearnedTrophiesResponse(),
      getSettings: () => createDefaultOverlaySettings(),
      updateSettings: (settings) => settings,
      getActiveGame: () => createDefaultActiveGameSelection(),
      updateActiveGame: (activeGame) => activeGame,
      getBrbState: () => createDefaultBrbState(),
      getEarnedSessionState: () => createDefaultEarnedSessionCard(),
      updateBrbState: (request) => {
        receivedRequest = request;
        return {
          status: "running",
          visible: true,
          remainingMs: 120000,
          sessionDurationMs: 120000,
          endsAt: "2026-03-17T00:02:00Z",
          updatedAt: "2026-03-17T00:00:00Z",
        };
      },
      updateEarnedSessionState: () => createDefaultEarnedSessionCard(),
      updateTargetTrophy: () => null,
      getOverlayData: async (): Promise<OverlayDataResponse> => ({
        overall: null,
        unearnedTrophies: null,
        currentGame: null,
        targetTrophy: null,
        brb: createDefaultBrbState(),
        earnedSession: createDefaultEarnedSessionCard(),
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

    const response = await request(app).put("/api/brb").send({ action: "start" });

    expect(response.status).toBe(200);
    expect(receivedRequest).toEqual({ action: "start" });
    expect(response.body.status).toBe("running");
    expect(response.body.visible).toBe(true);
    expect(response.body.remainingMs).toBe(120000);
  });

  it("updates earned session runtime state through the dedicated route", async () => {
    let receivedRequest: unknown = null;

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
      getUnearnedTrophies: async (): Promise<UnearnedTrophiesResponse> =>
        createUnearnedTrophiesResponse(),
      getSettings: () => createDefaultOverlaySettings(),
      updateSettings: (settings) => settings,
      getActiveGame: () => createDefaultActiveGameSelection(),
      updateActiveGame: (activeGame) => activeGame,
      getBrbState: () => createDefaultBrbState(),
      updateBrbState: () => createDefaultBrbState(),
      getEarnedSessionState: () => createDefaultEarnedSessionCard(),
      updateEarnedSessionState: (request) => {
        receivedRequest = request;
        return {
          visible: false,
          sessionStartedAt: "2026-03-17T00:00:00Z",
          counts: {
            platinum: 0,
            gold: 1,
            silver: 0,
            bronze: 0,
            total: 1,
          },
          totalEarnedCount: 1,
          updatedAt: "2026-03-17T00:05:00Z",
        };
      },
      updateTargetTrophy: () => null,
      getOverlayData: async (): Promise<OverlayDataResponse> => ({
        overall: null,
        unearnedTrophies: null,
        currentGame: null,
        targetTrophy: null,
        brb: createDefaultBrbState(),
        earnedSession: createDefaultEarnedSessionCard(),
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

    const response = await request(app)
      .put("/api/earned-session")
      .send({ action: "increment", grade: "gold" });

    expect(response.status).toBe(200);
    expect(receivedRequest).toEqual({ action: "increment", grade: "gold" });
    expect(response.body.counts.gold).toBe(1);
    expect(response.body.totalEarnedCount).toBe(1);
  });

  it("omits target trophy from fallback loop order when overlay data fails", async () => {
    const failingSettings = {
      ...createDefaultOverlaySettings(),
      loopVisibility: {
        ...createDefaultOverlaySettings().loopVisibility,
        targetTrophy: true,
      },
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
      getUnearnedTrophies: async (): Promise<UnearnedTrophiesResponse> =>
        createUnearnedTrophiesResponse(),
      getSettings: () => failingSettings,
      updateSettings: (settings) => settings,
      getActiveGame: () => createDefaultActiveGameSelection(),
      updateActiveGame: (activeGame) => activeGame,
      getBrbState: () => createDefaultBrbState(),
      updateBrbState: () => createDefaultBrbState(),
      getEarnedSessionState: () => createDefaultEarnedSessionCard(),
      updateEarnedSessionState: () => createDefaultEarnedSessionCard(),
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
      getUnearnedTrophies: async (): Promise<UnearnedTrophiesResponse> =>
        createUnearnedTrophiesResponse(),
      getSettings: () => createDefaultOverlaySettings(),
      updateSettings: (settings) => settings,
      getActiveGame: () => createDefaultActiveGameSelection(),
      updateActiveGame: (activeGame) => activeGame,
      getBrbState: () => createDefaultBrbState(),
      updateBrbState: () => createDefaultBrbState(),
      getEarnedSessionState: () => createDefaultEarnedSessionCard(),
      updateEarnedSessionState: () => createDefaultEarnedSessionCard(),
      updateTargetTrophy: () => null,
      getOverlayData: async (): Promise<OverlayDataResponse> => ({
        overall: null,
        unearnedTrophies: null,
        currentGame: null,
        targetTrophy: null,
        brb: createDefaultBrbState(),
        earnedSession: createDefaultEarnedSessionCard(),
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
      getUnearnedTrophies: async (): Promise<UnearnedTrophiesResponse> =>
        createUnearnedTrophiesResponse(),
      getSettings: () => createDefaultOverlaySettings(),
      updateSettings: (settings) => settings,
      getActiveGame: () => createDefaultActiveGameSelection(),
      updateActiveGame: (activeGame) => activeGame,
      getBrbState: () => createDefaultBrbState(),
      updateBrbState: () => createDefaultBrbState(),
      getEarnedSessionState: () => createDefaultEarnedSessionCard(),
      updateEarnedSessionState: () => createDefaultEarnedSessionCard(),
      updateTargetTrophy: () => null,
      getOverlayData: async (): Promise<OverlayDataResponse> => ({
        overall: null,
        unearnedTrophies: null,
        currentGame: null,
        targetTrophy: null,
        brb: createDefaultBrbState(),
        earnedSession: createDefaultEarnedSessionCard(),
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
