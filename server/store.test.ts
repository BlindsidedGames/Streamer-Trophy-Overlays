import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createDefaultActiveGameSelection,
  createDefaultBrbState,
  createDefaultOverlaySettings,
} from "../shared/contracts.js";
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

describe("StateStore", () => {
  it("returns defaults and persists settings", () => {
    const directory = mkdtempSync(join(tmpdir(), "streamer-tools-store-"));
    tempPaths.push(directory);
    const databasePath = join(directory, "app.sqlite");

    const store = new StateStore(databasePath);
    const defaults = store.getSettings();
    expect(defaults.overallDurationMs).toBe(5000);
    expect(defaults.unearnedTrophiesDurationMs).toBe(12000);
    expect(defaults.unearnedTrophiesLabelText).toBe("Unearned");
    expect(defaults.targetTrophyDurationMs).toBe(12000);
    expect(defaults.brbDurationMs).toBe(300000);
    expect(defaults.stripVisibility.overall.artwork).toBe(true);
    expect(defaults.stripVisibility.currentGame.trophies).toBe(true);
    expect(defaults.stripVisibility.unearnedTrophies.artwork).toBe(false);
    expect(defaults.stripZoneOrder).toEqual([
      "artwork",
      "identity",
      "metrics",
      "trophies",
      "targetInfo",
    ]);
    expect(defaults.overlayAnchors).toEqual({
      loop: "bottom-left",
      targetTrophy: "bottom-left",
      overall: "bottom-left",
      unearnedTrophies: "bottom-left",
      currentGame: "bottom-left",
      brb: "bottom-left",
      earnedSession: "bottom-left",
    });
    expect(defaults.loopVisibility).toEqual({
      overall: true,
      unearnedTrophies: false,
      currentGame: true,
      targetTrophy: false,
    });
    expect(defaults.showUnearnedDetailedProgress).toBe(false);
    expect(defaults.showTargetTrophyArtwork).toBe(true);
    expect(defaults.showTargetTrophyInfo).toBe(true);
    expect(defaults.showTargetTrophyTag).toBe(true);
    expect(defaults.showBrbArtwork).toBe(true);
    expect(defaults.showBrbIdentity).toBe(true);
    expect(defaults.showBrbProgress).toBe(true);
    expect(defaults.brbSubtitleText).toBe("Intermission");
    expect(defaults.showEarnedSessionIdentity).toBe(true);
    expect(defaults.showEarnedSessionTrophies).toBe(true);
    expect(defaults.earnedSessionHeadingText).toBe("Earned This Session");
    expect(defaults.overlayAppearance).toEqual({
      overall: {
        backgroundTransparencyPercent: 100,
        artworkRadiusPx: 17,
      },
      unearnedTrophies: {
        backgroundTransparencyPercent: 100,
      },
      currentGame: {
        backgroundTransparencyPercent: 100,
        artworkRadiusPx: 17,
      },
      targetTrophy: {
        backgroundTransparencyPercent: 100,
        artworkRadiusPx: 17,
      },
      brb: {
        backgroundTransparencyPercent: 100,
        artworkRadiusPx: 17,
      },
      earnedSession: {
        backgroundTransparencyPercent: 100,
      },
    });
    expect(defaults.cameraBorder).toEqual({
      baseInsetPx: 30,
      baseThicknessPx: 36,
      baseRadiusPx: 24,
      baseCutoutRadiusPx: 24,
      opacityPercent: 96,
    });
    expect(defaults.targetTrophyTagText).toBe("Current Target");

    store.saveSettings({
      ...defaults,
      stripVisibility: {
        ...defaults.stripVisibility,
        overall: {
          ...defaults.stripVisibility.overall,
          metrics: false,
        },
      },
      stripZoneOrder: ["metrics", "identity", "artwork", "trophies", "targetInfo"],
      overallDurationMs: 9000,
      targetTrophyDurationMs: 15000,
      brbDurationMs: 600000,
      unearnedTrophiesLabelText: "Remaining",
      overlayAnchors: {
        loop: "top-center",
        targetTrophy: "bottom-center",
        overall: "top-left",
        unearnedTrophies: "top-right",
        currentGame: "bottom-left",
        brb: "bottom-center",
        earnedSession: "top-right",
      },
      showUnearnedDetailedProgress: true,
      showTargetTrophyArtwork: false,
      showTargetTrophyInfo: false,
      showTargetTrophyTag: false,
      targetTrophyTagText: "Featured Trophy",
      showBrbArtwork: false,
      showBrbIdentity: false,
      showBrbProgress: false,
      brbSubtitleText: "Back in a few",
      showEarnedSessionIdentity: false,
      showEarnedSessionTrophies: false,
      earnedSessionHeadingText: "Tonight's haul",
      overlayAppearance: {
        overall: {
          backgroundTransparencyPercent: 12,
          artworkRadiusPx: 14,
        },
        unearnedTrophies: {
          backgroundTransparencyPercent: 28,
        },
        currentGame: {
          backgroundTransparencyPercent: 34,
          artworkRadiusPx: 22,
        },
        targetTrophy: {
          backgroundTransparencyPercent: 18,
          artworkRadiusPx: 24,
        },
        brb: {
          backgroundTransparencyPercent: 45,
          artworkRadiusPx: 11,
        },
        earnedSession: {
          backgroundTransparencyPercent: 52,
        },
      },
      cameraBorder: {
        baseInsetPx: 42,
        baseThicknessPx: 48,
        baseRadiusPx: 28,
        baseCutoutRadiusPx: 18,
        opacityPercent: 80,
      },
    });
    store.close();

    const reopened = new StateStore(databasePath);
    const persisted = reopened.getSettings();
    expect(persisted.overallDurationMs).toBe(9000);
    expect(persisted.targetTrophyDurationMs).toBe(15000);
    expect(persisted.brbDurationMs).toBe(600000);
    expect(persisted.unearnedTrophiesLabelText).toBe("Remaining");
    expect(persisted.stripVisibility.overall.metrics).toBe(false);
    expect(persisted.stripZoneOrder).toEqual([
      "metrics",
      "identity",
      "artwork",
      "trophies",
      "targetInfo",
    ]);
    expect(persisted.overlayAnchors).toEqual({
      loop: "top-center",
      targetTrophy: "bottom-center",
      overall: "top-left",
      unearnedTrophies: "top-right",
      currentGame: "bottom-left",
      brb: "bottom-center",
      earnedSession: "top-right",
    });
    expect(persisted.showUnearnedDetailedProgress).toBe(true);
    expect(persisted.showTargetTrophyArtwork).toBe(false);
    expect(persisted.showTargetTrophyInfo).toBe(false);
    expect(persisted.showTargetTrophyTag).toBe(false);
    expect(persisted.showBrbArtwork).toBe(false);
    expect(persisted.showBrbIdentity).toBe(false);
    expect(persisted.showBrbProgress).toBe(false);
    expect(persisted.brbSubtitleText).toBe("Back in a few");
    expect(persisted.showEarnedSessionIdentity).toBe(false);
    expect(persisted.showEarnedSessionTrophies).toBe(false);
    expect(persisted.earnedSessionHeadingText).toBe("Tonight's haul");
    expect(persisted.overlayAppearance).toEqual({
      overall: {
        backgroundTransparencyPercent: 12,
        artworkRadiusPx: 14,
      },
      unearnedTrophies: {
        backgroundTransparencyPercent: 28,
      },
      currentGame: {
        backgroundTransparencyPercent: 34,
        artworkRadiusPx: 22,
      },
      targetTrophy: {
        backgroundTransparencyPercent: 18,
        artworkRadiusPx: 24,
      },
      brb: {
        backgroundTransparencyPercent: 45,
        artworkRadiusPx: 11,
      },
      earnedSession: {
        backgroundTransparencyPercent: 52,
      },
    });
    expect(persisted.cameraBorder).toEqual({
      baseInsetPx: 42,
      baseThicknessPx: 48,
      baseRadiusPx: 28,
      baseCutoutRadiusPx: 18,
      opacityPercent: 80,
    });
    expect(persisted.targetTrophyTagText).toBe("Featured Trophy");
    reopened.close();
  });

  it("migrates legacy strip settings into the new section toggles", () => {
    const directory = mkdtempSync(join(tmpdir(), "streamer-tools-store-"));
    tempPaths.push(directory);
    const databasePath = join(directory, "app.sqlite");

    const store = new StateStore(databasePath);
    store.close();

    const database = new Database(databasePath);
    database
      .prepare(
        `
          UPDATE app_state
          SET settings_json = @settings_json
          WHERE id = 1
        `,
      )
      .run({
        settings_json: JSON.stringify({
          overallDurationMs: 5000,
          currentGameDurationMs: 12000,
          targetTrophyDurationMs: 12000,
          showGradeRows: false,
          showOverallCompletion: false,
          showCurrentCompletion: false,
          showCurrentTotals: false,
          showTargetTrophyInLoop: true,
          overlayAnchor: "top-center",
          showTargetTrophyTag: true,
          targetTrophyTagText: "Featured Trophy",
          updatedAt: "2026-03-18T00:00:00Z",
        }),
      });
    database.close();

    const reopened = new StateStore(databasePath);
    const migrated = reopened.getSettings();

    expect(migrated.stripVisibility.overall.artwork).toBe(true);
    expect(migrated.stripVisibility.currentGame.identity).toBe(true);
    expect(migrated.stripVisibility.overall.metrics).toBe(false);
    expect(migrated.stripVisibility.unearnedTrophies.trophies).toBe(false);
    expect(migrated.stripZoneOrder).toEqual([
      "artwork",
      "identity",
      "metrics",
      "trophies",
      "targetInfo",
    ]);
    expect(migrated.loopVisibility).toEqual({
      overall: true,
      unearnedTrophies: false,
      currentGame: true,
      targetTrophy: true,
    });
    expect(migrated.overlayAnchors).toEqual({
      loop: "top-center",
      targetTrophy: "top-center",
      overall: "top-center",
      unearnedTrophies: "top-center",
      currentGame: "top-center",
      brb: "top-center",
      earnedSession: "top-center",
    });
    expect(migrated.showUnearnedDetailedProgress).toBe(false);
    expect(migrated.showTargetTrophyArtwork).toBe(true);
    expect(migrated.showTargetTrophyInfo).toBe(true);
    expect(migrated.overlayAppearance).toEqual({
      overall: {
        backgroundTransparencyPercent: 100,
        artworkRadiusPx: 17,
      },
      unearnedTrophies: {
        backgroundTransparencyPercent: 100,
      },
      currentGame: {
        backgroundTransparencyPercent: 100,
        artworkRadiusPx: 17,
      },
      targetTrophy: {
        backgroundTransparencyPercent: 100,
        artworkRadiusPx: 17,
      },
      brb: {
        backgroundTransparencyPercent: 100,
        artworkRadiusPx: 17,
      },
      earnedSession: {
        backgroundTransparencyPercent: 100,
      },
    });
    expect(migrated.cameraBorder).toEqual({
      baseInsetPx: 30,
      baseThicknessPx: 36,
      baseRadiusPx: 24,
      baseCutoutRadiusPx: 24,
      opacityPercent: 96,
    });
    expect(migrated.unearnedTrophiesLabelText).toBe("Unearned");
    expect(migrated.targetTrophyTagText).toBe("Featured Trophy");
    expect(migrated.brbSubtitleText).toBe("Intermission");
    reopened.close();
  });

  it("normalizes malformed saved strip section orders", () => {
    const directory = mkdtempSync(join(tmpdir(), "streamer-tools-store-"));
    tempPaths.push(directory);
    const databasePath = join(directory, "app.sqlite");

    const store = new StateStore(databasePath);
    store.close();

    const database = new Database(databasePath);
    database
      .prepare(
        `
          UPDATE app_state
          SET settings_json = @settings_json
          WHERE id = 1
        `,
      )
      .run({
        settings_json: JSON.stringify({
          ...createDefaultOverlaySettings(),
          stripZoneOrder: ["metrics", "artwork", "metrics", "invalid", "trophies"],
        }),
      });
    database.close();

    const reopened = new StateStore(databasePath);
    expect(reopened.getSettings().stripZoneOrder).toEqual([
      "metrics",
      "artwork",
      "trophies",
      "identity",
      "targetInfo",
    ]);
    reopened.close();
  });

  it("normalizes malformed camera border settings", () => {
    const directory = mkdtempSync(join(tmpdir(), "streamer-tools-store-"));
    tempPaths.push(directory);
    const databasePath = join(directory, "app.sqlite");

    const store = new StateStore(databasePath);
    store.close();

    const database = new Database(databasePath);
    database
      .prepare(
        `
          UPDATE app_state
          SET settings_json = @settings_json
          WHERE id = 1
        `,
      )
      .run({
        settings_json: JSON.stringify({
          ...createDefaultOverlaySettings(),
          cameraBorder: {
            baseInsetPx: "bad",
            baseThicknessPx: -10,
            baseRadiusPx: 24.6,
            baseCutoutRadiusPx: "bad",
            opacityPercent: 145,
          },
        }),
      });
    database.close();

    const reopened = new StateStore(databasePath);
    expect(reopened.getSettings().cameraBorder).toEqual({
      baseInsetPx: 30,
      baseThicknessPx: 0,
      baseRadiusPx: 25,
      baseCutoutRadiusPx: 25,
      opacityPercent: 100,
    });
    reopened.close();
  });

  it("normalizes malformed overlay appearance settings", () => {
    const directory = mkdtempSync(join(tmpdir(), "streamer-tools-store-"));
    tempPaths.push(directory);
    const databasePath = join(directory, "app.sqlite");

    const store = new StateStore(databasePath);
    store.close();

    const database = new Database(databasePath);
    database
      .prepare(
        `
          UPDATE app_state
          SET settings_json = @settings_json
          WHERE id = 1
        `,
      )
      .run({
        settings_json: JSON.stringify({
          ...createDefaultOverlaySettings(),
          overlayAppearance: {
            overall: {
              backgroundTransparencyPercent: -10,
              artworkRadiusPx: 140,
            },
            unearnedTrophies: {
              backgroundTransparencyPercent: "bad",
            },
            currentGame: {
              backgroundTransparencyPercent: 27.8,
              artworkRadiusPx: 13.2,
            },
            targetTrophy: {
              backgroundTransparencyPercent: 70,
            },
            brb: {
              backgroundTransparencyPercent: 80,
              artworkRadiusPx: "bad",
            },
            earnedSession: {
              backgroundTransparencyPercent: 999,
            },
          },
        }),
      });
    database.close();

    const reopened = new StateStore(databasePath);
    expect(reopened.getSettings().overlayAppearance).toEqual({
      overall: {
        backgroundTransparencyPercent: 0,
        artworkRadiusPx: 100,
      },
      unearnedTrophies: {
        backgroundTransparencyPercent: 100,
      },
      currentGame: {
        backgroundTransparencyPercent: 28,
        artworkRadiusPx: 13,
      },
      targetTrophy: {
        backgroundTransparencyPercent: 70,
        artworkRadiusPx: 17,
      },
      brb: {
        backgroundTransparencyPercent: 80,
        artworkRadiusPx: 17,
      },
      earnedSession: {
        backgroundTransparencyPercent: 100,
      },
    });
    reopened.close();
  });

  it("normalizes partial per-route anchors using the legacy anchor as fallback", () => {
    const directory = mkdtempSync(join(tmpdir(), "streamer-tools-store-"));
    tempPaths.push(directory);
    const databasePath = join(directory, "app.sqlite");

    const store = new StateStore(databasePath);
    store.close();

    const database = new Database(databasePath);
    database
      .prepare(
        `
          UPDATE app_state
          SET settings_json = @settings_json
          WHERE id = 1
        `,
      )
      .run({
        settings_json: JSON.stringify({
          ...createDefaultOverlaySettings(),
          overlayAnchor: "top-center",
          overlayAnchors: {
            loop: "bottom-right",
            overall: "bottom-center",
          },
        }),
      });
    database.close();

    const reopened = new StateStore(databasePath);
    expect(reopened.getSettings().overlayAnchors).toEqual({
      loop: "bottom-right",
      targetTrophy: "top-center",
      overall: "bottom-center",
      unearnedTrophies: "top-center",
      currentGame: "top-center",
      brb: "top-center",
      earnedSession: "top-center",
    });
    reopened.close();
  });

  it("persists active game overrides", () => {
    const directory = mkdtempSync(join(tmpdir(), "streamer-tools-store-"));
    tempPaths.push(directory);
    const databasePath = join(directory, "app.sqlite");

    const store = new StateStore(databasePath);
    const nextActiveGame = store.getActiveGame();

    nextActiveGame.mode = "custom";
    nextActiveGame.override.titleName = "LEGO DC Super-Villains";
    nextActiveGame.override.earnedCounts.gold = 4;

    store.saveActiveGame(nextActiveGame);
    store.close();

    const reopened = new StateStore(databasePath);
    const persisted = reopened.getActiveGame();

    expect(persisted.mode).toBe("custom");
    expect(persisted.override.titleName).toBe("LEGO DC Super-Villains");
    expect(persisted.override.earnedCounts.gold).toBe(4);
    reopened.close();
  });

  it("persists target trophy selections per title", () => {
    const directory = mkdtempSync(join(tmpdir(), "streamer-tools-store-"));
    tempPaths.push(directory);
    const databasePath = join(directory, "app.sqlite");

    const store = new StateStore(databasePath);
    store.saveTargetTrophy({
      npCommunicationId: "NPWR1",
      trophyId: 7,
      trophyGroupId: "default",
    });
    store.close();

    const reopened = new StateStore(databasePath);
    const persisted = reopened.getTargetTrophy("NPWR1");

    expect(persisted?.trophyId).toBe(7);
    expect(persisted?.trophyGroupId).toBe("default");
    expect(reopened.getSettings().loopVisibility.targetTrophy).toBe(false);
    reopened.close();
  });

  it("persists and controls BRB runtime state", () => {
    const directory = mkdtempSync(join(tmpdir(), "streamer-tools-store-"));
    tempPaths.push(directory);
    const databasePath = join(directory, "app.sqlite");
    let store: StateStore | null = null;

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-17T00:00:00Z"));

    try {
      store = new StateStore(databasePath);
      const started = store.updateBrbState({ action: "start" });

      expect(started.status).toBe("running");
      expect(started.visible).toBe(true);
      expect(started.remainingMs).toBe(store.getSettings().brbDurationMs);

      vi.setSystemTime(new Date("2026-03-17T00:01:00Z"));
      const paused = store.updateBrbState({ action: "pause" });
      expect(paused.status).toBe("paused");
      expect(paused.remainingMs).toBe(store.getSettings().brbDurationMs - 60000);

      const hidden = store.updateBrbState({ action: "setVisibility", visible: false });
      expect(hidden.visible).toBe(false);

      const resumed = store.updateBrbState({ action: "resume" });
      expect(resumed.status).toBe("running");
      expect(resumed.visible).toBe(true);

      const stopped = store.updateBrbState({ action: "stop" });
      expect(stopped).toMatchObject({
        status: "stopped",
        visible: false,
        remainingMs: store.getSettings().brbDurationMs,
        sessionDurationMs: store.getSettings().brbDurationMs,
        endsAt: null,
      });
    } finally {
      store?.close();
      vi.useRealTimers();
    }
  });

  it("normalizes expired BRB state and syncs stopped BRB duration with settings", () => {
    const directory = mkdtempSync(join(tmpdir(), "streamer-tools-store-"));
    tempPaths.push(directory);
    const databasePath = join(directory, "app.sqlite");
    let store: StateStore | null = null;

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-17T00:00:00Z"));

    try {
      store = new StateStore(databasePath);
      const defaults = store.getSettings();
      store.updateBrbState({ action: "start" });

      vi.setSystemTime(new Date("2026-03-17T00:05:01Z"));
      const expired = store.getBrbState();
      expect(expired.status).toBe("expired");
      expect(expired.visible).toBe(true);
      expect(expired.remainingMs).toBe(0);

      store.updateBrbState({ action: "stop" });
      store.saveSettings({
        ...defaults,
        brbDurationMs: 420000,
      });

      expect(store.getBrbState()).toMatchObject({
        status: "stopped",
        visible: false,
        remainingMs: 420000,
        sessionDurationMs: 420000,
        endsAt: null,
      });
    } finally {
      store?.close();
      vi.useRealTimers();
    }
  });

  it("adds earned session runtime state when migrating a legacy database", () => {
    const directory = mkdtempSync(join(tmpdir(), "streamer-tools-store-"));
    tempPaths.push(directory);
    const databasePath = join(directory, "app.sqlite");
    let database: Database.Database | null = null;
    let store: StateStore | null = null;

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-17T00:00:00Z"));

    try {
      database = new Database(databasePath);
      database.exec(`
        CREATE TABLE app_state (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          settings_json TEXT NOT NULL,
          active_game_json TEXT NOT NULL,
          target_trophies_json TEXT NOT NULL DEFAULT '{}',
          brb_json TEXT NOT NULL DEFAULT '{}',
          updated_at TEXT NOT NULL
        )
      `);
      database
        .prepare(
          `
            INSERT INTO app_state (
              id,
              settings_json,
              active_game_json,
              target_trophies_json,
              brb_json,
              updated_at
            )
            VALUES (
              @id,
              @settings_json,
              @active_game_json,
              @target_trophies_json,
              @brb_json,
              @updated_at
            )
          `,
        )
        .run({
          id: 1,
          settings_json: JSON.stringify(createDefaultOverlaySettings()),
          active_game_json: JSON.stringify(createDefaultActiveGameSelection()),
          target_trophies_json: JSON.stringify({}),
          brb_json: JSON.stringify(createDefaultBrbState()),
          updated_at: new Date().toISOString(),
        });
      database.close();
      database = null;

      store = new StateStore(databasePath);

      expect(store.getEarnedSessionState()).toMatchObject({
        visible: false,
        sessionStartedAt: "2026-03-17T00:00:00.000Z",
        totalEarnedCount: 0,
      });
    } finally {
      database?.close();
      store?.close();
      vi.useRealTimers();
    }
  });

  it("persists, increments, and resets earned session runtime state", () => {
    const directory = mkdtempSync(join(tmpdir(), "streamer-tools-store-"));
    tempPaths.push(directory);
    const databasePath = join(directory, "app.sqlite");
    let store: StateStore | null = null;
    let reopened: StateStore | null = null;

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-17T00:00:00Z"));

    try {
      store = new StateStore(databasePath);

      expect(store.getEarnedSessionState()).toMatchObject({
        visible: false,
        sessionStartedAt: "2026-03-17T00:00:00.000Z",
        totalEarnedCount: 0,
        counts: {
          platinum: 0,
          gold: 0,
          silver: 0,
          bronze: 0,
          total: 0,
        },
      });

      store.updateEarnedSessionState({ action: "setVisibility", visible: true });
      store.updateEarnedSessionState({ action: "increment", grade: "gold" });
      const incremented = store.updateEarnedSessionState({
        action: "increment",
        grade: "bronze",
      });

      expect(incremented).toMatchObject({
        visible: true,
        totalEarnedCount: 2,
        counts: {
          platinum: 0,
          gold: 1,
          silver: 0,
          bronze: 1,
          total: 2,
        },
      });

      store.close();
      store = null;

      reopened = new StateStore(databasePath);
      expect(reopened.getEarnedSessionState()).toMatchObject({
        visible: true,
        totalEarnedCount: 2,
        counts: {
          platinum: 0,
          gold: 1,
          silver: 0,
          bronze: 1,
          total: 2,
        },
      });

      vi.setSystemTime(new Date("2026-03-17T00:15:00Z"));
      const reset = reopened.updateEarnedSessionState({ action: "reset" });

      expect(reset).toMatchObject({
        visible: true,
        sessionStartedAt: "2026-03-17T00:15:00.000Z",
        totalEarnedCount: 0,
        counts: {
          platinum: 0,
          gold: 0,
          silver: 0,
          bronze: 0,
          total: 0,
        },
      });
    } finally {
      store?.close();
      reopened?.close();
      vi.useRealTimers();
    }
  });
});
