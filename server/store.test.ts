import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it } from "vitest";

import { createDefaultOverlaySettings } from "../shared/contracts.js";
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
    expect(defaults.targetTrophyDurationMs).toBe(12000);
    expect(defaults.showStripArtwork).toBe(true);
    expect(defaults.showStripTrophies).toBe(true);
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
      currentGame: "bottom-left",
    });
    expect(defaults.showTargetTrophyInfo).toBe(true);
    expect(defaults.showTargetTrophyTag).toBe(true);
    expect(defaults.targetTrophyTagText).toBe("Current Target");

    store.saveSettings({
      ...defaults,
      showStripMetrics: false,
      stripZoneOrder: ["metrics", "identity", "artwork", "trophies", "targetInfo"],
      overallDurationMs: 9000,
      targetTrophyDurationMs: 15000,
      overlayAnchors: {
        loop: "top-right",
        targetTrophy: "bottom-right",
        overall: "top-left",
        currentGame: "bottom-left",
      },
      showTargetTrophyInfo: false,
      showTargetTrophyTag: false,
      targetTrophyTagText: "Featured Trophy",
    });
    store.close();

    const reopened = new StateStore(databasePath);
    const persisted = reopened.getSettings();
    expect(persisted.overallDurationMs).toBe(9000);
    expect(persisted.targetTrophyDurationMs).toBe(15000);
    expect(persisted.showStripMetrics).toBe(false);
    expect(persisted.stripZoneOrder).toEqual([
      "metrics",
      "identity",
      "artwork",
      "trophies",
      "targetInfo",
    ]);
    expect(persisted.overlayAnchors).toEqual({
      loop: "top-right",
      targetTrophy: "bottom-right",
      overall: "top-left",
      currentGame: "bottom-left",
    });
    expect(persisted.showTargetTrophyInfo).toBe(false);
    expect(persisted.showTargetTrophyTag).toBe(false);
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
          overlayAnchor: "top-right",
          showTargetTrophyTag: true,
          targetTrophyTagText: "Featured Trophy",
          updatedAt: "2026-03-18T00:00:00Z",
        }),
      });
    database.close();

    const reopened = new StateStore(databasePath);
    const migrated = reopened.getSettings();

    expect(migrated.showStripArtwork).toBe(true);
    expect(migrated.showStripIdentity).toBe(true);
    expect(migrated.showStripMetrics).toBe(false);
    expect(migrated.showStripTrophies).toBe(false);
    expect(migrated.stripZoneOrder).toEqual([
      "artwork",
      "identity",
      "metrics",
      "trophies",
      "targetInfo",
    ]);
    expect(migrated.showTargetTrophyInLoop).toBe(true);
    expect(migrated.overlayAnchors).toEqual({
      loop: "top-right",
      targetTrophy: "top-right",
      overall: "top-right",
      currentGame: "top-right",
    });
    expect(migrated.showTargetTrophyInfo).toBe(true);
    expect(migrated.targetTrophyTagText).toBe("Featured Trophy");
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
          overlayAnchor: "top-left",
          overlayAnchors: {
            loop: "bottom-right",
            overall: "not-a-real-anchor",
          },
        }),
      });
    database.close();

    const reopened = new StateStore(databasePath);
    expect(reopened.getSettings().overlayAnchors).toEqual({
      loop: "bottom-right",
      targetTrophy: "top-left",
      overall: "top-left",
      currentGame: "top-left",
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
    expect(reopened.getSettings().showTargetTrophyInLoop).toBe(false);
    reopened.close();
  });
});
