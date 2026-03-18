import { createServer } from "node:http";

import { afterEach, describe, expect, it } from "vitest";

import { startServerRuntime } from "./runtime.js";

const runtimes: Array<Awaited<ReturnType<typeof startServerRuntime>>> = [];

afterEach(async () => {
  while (runtimes.length > 0) {
    const runtime = runtimes.pop();

    if (runtime) {
      await runtime.stop();
    }
  }
});

describe("server runtime", () => {
  it("binds to 127.0.0.1 and serves the local API", async () => {
    const runtime = await startServerRuntime({
      host: "127.0.0.1",
      port: 0,
      loadEnv: false,
      rootCandidates: [],
      service: {
        getHealth: () => ({ status: "ok", configured: false, source: "psn-api" as const }),
        getPsnTokenStatus: () => ({ configured: false, storage: "local-file" as const, updatedAt: null }),
        savePsnToken: () => ({ configured: true, storage: "local-file" as const, updatedAt: null }),
        clearPsnToken: () => ({ configured: false, storage: "local-file" as const, updatedAt: null }),
        getSummary: async () => ({
          profile: null,
          titles: [],
          meta: {
            fetchedAt: "2026-03-18T00:00:00Z",
            cached: false,
            warnings: [],
            partial: false,
            source: "psn-api" as const,
          },
        }),
        searchTitles: async () => ({ results: [], nextOffset: null, totalItemCount: 0 }),
        getTitleTrophies: async () => ({
          title: null,
          trophies: [],
          target: null,
          meta: {
            fetchedAt: "2026-03-18T00:00:00Z",
            cached: false,
            warnings: [],
            partial: false,
          },
        }),
        getSettings: () => ({
          overallDurationMs: 5000,
          currentGameDurationMs: 5000,
          targetTrophyDurationMs: 12000,
          showGradeRows: true,
          showOverallCompletion: true,
          showCurrentCompletion: true,
          showCurrentTotals: true,
          showTargetTrophyInLoop: false,
          showTargetTrophyTag: true,
          targetTrophyTagText: "Current Target",
          updatedAt: "2026-03-18T00:00:00Z",
        }),
        updateSettings: (settings) => settings,
        getActiveGame: () => ({
          mode: "psn" as const,
          selectedNpCommunicationId: null,
          customGameId: "custom",
          override: {
            titleName: null,
            iconUrl: null,
            platform: null,
            completionPercentage: null,
            earnedCounts: {
              platinum: null,
              gold: null,
              silver: null,
              bronze: null,
            },
            definedCounts: {
              platinum: null,
              gold: null,
              silver: null,
              bronze: null,
            },
            updatedAt: "2026-03-18T00:00:00Z",
          },
          updatedAt: "2026-03-18T00:00:00Z",
        }),
        updateActiveGame: (activeGame) => activeGame,
        updateTargetTrophy: () => null,
        getOverlayData: async () => ({
          overall: null,
          currentGame: null,
          targetTrophy: null,
          display: {
            settings: {
              overallDurationMs: 5000,
              currentGameDurationMs: 5000,
              targetTrophyDurationMs: 12000,
              showGradeRows: true,
              showOverallCompletion: true,
              showCurrentCompletion: true,
              showCurrentTotals: true,
              showTargetTrophyInLoop: false,
              showTargetTrophyTag: true,
              targetTrophyTagText: "Current Target",
              updatedAt: "2026-03-18T00:00:00Z",
            },
            loopOrder: ["overall", "currentGame"] as const,
            lastRefreshAt: "2026-03-18T00:00:00Z",
          },
          meta: {
            fetchedAt: "2026-03-18T00:00:00Z",
            cached: false,
            warnings: [],
            partial: false,
          },
        }),
      },
    });
    runtimes.push(runtime);

    expect(runtime.host).toBe("127.0.0.1");
    expect(runtime.baseUrl).toContain("http://127.0.0.1:");

    const response = await fetch(`${runtime.baseUrl}/api/health`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "ok",
      configured: false,
      source: "psn-api",
    });
  });

  it("fails deterministically when the configured port is already in use", async () => {
    const blocker = createServer();

    await new Promise<void>((resolveStart, rejectStart) => {
      blocker.once("error", rejectStart);
      blocker.listen(0, "127.0.0.1", () => resolveStart());
    });

    const port = Number((blocker.address() as { port: number }).port);

    await expect(
      startServerRuntime({
        host: "127.0.0.1",
        port,
        loadEnv: false,
        rootCandidates: [],
        service: {
          getHealth: () => ({ status: "ok", configured: false, source: "psn-api" as const }),
          getPsnTokenStatus: () => ({ configured: false, storage: "local-file" as const, updatedAt: null }),
          savePsnToken: () => ({ configured: true, storage: "local-file" as const, updatedAt: null }),
          clearPsnToken: () => ({ configured: false, storage: "local-file" as const, updatedAt: null }),
          getSummary: async () => ({
            profile: null,
            titles: [],
            meta: {
              fetchedAt: "2026-03-18T00:00:00Z",
              cached: false,
              warnings: [],
              partial: false,
              source: "psn-api" as const,
            },
          }),
          searchTitles: async () => ({ results: [], nextOffset: null, totalItemCount: 0 }),
          getTitleTrophies: async () => ({
            title: null,
            trophies: [],
            target: null,
            meta: {
              fetchedAt: "2026-03-18T00:00:00Z",
              cached: false,
              warnings: [],
              partial: false,
            },
          }),
          getSettings: () => ({
            overallDurationMs: 5000,
            currentGameDurationMs: 5000,
            targetTrophyDurationMs: 12000,
            showGradeRows: true,
            showOverallCompletion: true,
            showCurrentCompletion: true,
            showCurrentTotals: true,
            showTargetTrophyInLoop: false,
            showTargetTrophyTag: true,
            targetTrophyTagText: "Current Target",
            updatedAt: "2026-03-18T00:00:00Z",
          }),
          updateSettings: (settings) => settings,
          getActiveGame: () => ({
            mode: "psn" as const,
            selectedNpCommunicationId: null,
            customGameId: "custom",
            override: {
              titleName: null,
              iconUrl: null,
              platform: null,
              completionPercentage: null,
              earnedCounts: {
                platinum: null,
                gold: null,
                silver: null,
                bronze: null,
              },
              definedCounts: {
                platinum: null,
                gold: null,
                silver: null,
                bronze: null,
              },
              updatedAt: "2026-03-18T00:00:00Z",
            },
            updatedAt: "2026-03-18T00:00:00Z",
          }),
          updateActiveGame: (activeGame) => activeGame,
          updateTargetTrophy: () => null,
          getOverlayData: async () => ({
            overall: null,
            currentGame: null,
            targetTrophy: null,
            display: {
              settings: {
                overallDurationMs: 5000,
                currentGameDurationMs: 5000,
                targetTrophyDurationMs: 12000,
                showGradeRows: true,
                showOverallCompletion: true,
                showCurrentCompletion: true,
                showCurrentTotals: true,
                showTargetTrophyInLoop: false,
                showTargetTrophyTag: true,
                targetTrophyTagText: "Current Target",
                updatedAt: "2026-03-18T00:00:00Z",
              },
              loopOrder: ["overall", "currentGame"] as const,
              lastRefreshAt: "2026-03-18T00:00:00Z",
            },
            meta: {
              fetchedAt: "2026-03-18T00:00:00Z",
              cached: false,
              warnings: [],
              partial: false,
            },
          }),
        },
      }),
    ).rejects.toMatchObject({ code: "EADDRINUSE" });

    await new Promise<void>((resolveStop, rejectStop) => {
      blocker.close((error) => {
        if (error) {
          rejectStop(error);
          return;
        }

        resolveStop();
      });
    });
  });
});
