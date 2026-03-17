import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it } from "vitest";

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
    expect(defaults.showTargetTrophyTag).toBe(true);
    expect(defaults.targetTrophyTagText).toBe("Current Target");

    store.saveSettings({
      ...defaults,
      showCurrentTotals: false,
      overallDurationMs: 9000,
      targetTrophyDurationMs: 15000,
      showTargetTrophyTag: false,
      targetTrophyTagText: "Featured Trophy",
    });
    store.close();

    const reopened = new StateStore(databasePath);
    const persisted = reopened.getSettings();
    expect(persisted.overallDurationMs).toBe(9000);
    expect(persisted.targetTrophyDurationMs).toBe(15000);
    expect(persisted.showCurrentTotals).toBe(false);
    expect(persisted.showTargetTrophyTag).toBe(false);
    expect(persisted.targetTrophyTagText).toBe("Featured Trophy");
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
