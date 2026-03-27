import { createServer } from "node:http";

import { afterEach, describe, expect, it } from "vitest";

import {
  createDefaultBrbState,
  createDefaultActiveGameSelection,
  createDefaultEarnedSessionCard,
  createDefaultOverlaySettings,
} from "../shared/contracts.js";
import { startServerRuntime } from "./runtime.js";

const runtimes: Array<Awaited<ReturnType<typeof startServerRuntime>>> = [];

const createRuntimeServiceStub = () => {
  const settings = {
    ...createDefaultOverlaySettings(),
    currentGameDurationMs: 5000,
    updatedAt: "2026-03-18T00:00:00Z",
  };
  const activeGame = {
    ...createDefaultActiveGameSelection(),
    customGameId: "custom",
    updatedAt: "2026-03-18T00:00:00Z",
    override: {
      ...createDefaultActiveGameSelection().override,
      updatedAt: "2026-03-18T00:00:00Z",
    },
  };

  return {
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
    getUnearnedTrophies: async () => ({
      trophies: [],
      meta: {
        fetchedAt: "2026-03-18T00:00:00Z",
        cached: false,
        warnings: [],
        partial: false,
      },
    }),
    getSettings: () => settings,
    updateSettings: (nextSettings: typeof settings) => nextSettings,
    getActiveGame: () => activeGame,
    updateActiveGame: (nextActiveGame: typeof activeGame) => nextActiveGame,
    getBrbState: () => createDefaultBrbState(),
    updateBrbState: () => createDefaultBrbState(),
    getEarnedSessionState: () => createDefaultEarnedSessionCard(),
    updateEarnedSessionState: () => createDefaultEarnedSessionCard(),
    updateTargetTrophy: () => null,
    getOverlayData: async () => ({
      overall: null,
      unearnedTrophies: null,
      currentGame: null,
      targetTrophy: null,
      brb: {
        status: "stopped" as const,
        visible: false,
        remainingMs: settings.brbDurationMs,
        sessionDurationMs: settings.brbDurationMs,
        endsAt: null,
        updatedAt: "2026-03-18T00:00:00Z",
      },
      earnedSession: createDefaultEarnedSessionCard("2026-03-18T00:00:00Z"),
      display: {
        settings,
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
  };
};

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
      service: createRuntimeServiceStub(),
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
        service: createRuntimeServiceStub(),
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
