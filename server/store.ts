import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import {
  createDefaultActiveGameSelection,
  createDefaultOverlaySettings,
  type ActiveGameSelection,
  type OverlaySettings,
  type TargetTrophySelection,
  type UpdateTargetTrophyRequest,
} from "../shared/contracts.js";
import { resolveDatabasePath } from "./runtime-config.js";

type AppStateRow = {
  id: number;
  settings_json: string;
  active_game_json: string;
  target_trophies_json: string;
  updated_at: string;
};

const sanitizeSettings = (value: unknown): OverlaySettings => {
  const defaults = createDefaultOverlaySettings();
  const parsed = (value ?? {}) as Partial<OverlaySettings>;

  return {
    overallDurationMs: clampNumber(parsed.overallDurationMs, defaults.overallDurationMs, 1000, 60000),
    currentGameDurationMs: clampNumber(
      parsed.currentGameDurationMs,
      defaults.currentGameDurationMs,
      1000,
      60000,
    ),
    targetTrophyDurationMs: clampNumber(
      parsed.targetTrophyDurationMs,
      defaults.targetTrophyDurationMs,
      1000,
      60000,
    ),
    showGradeRows: Boolean(parsed.showGradeRows ?? defaults.showGradeRows),
    showOverallCompletion: Boolean(
      parsed.showOverallCompletion ?? defaults.showOverallCompletion,
    ),
    showCurrentCompletion: Boolean(
      parsed.showCurrentCompletion ?? defaults.showCurrentCompletion,
    ),
    showCurrentTotals: Boolean(parsed.showCurrentTotals ?? defaults.showCurrentTotals),
    showTargetTrophyInLoop: Boolean(
      parsed.showTargetTrophyInLoop ?? defaults.showTargetTrophyInLoop,
    ),
    showTargetTrophyTag: Boolean(
      parsed.showTargetTrophyTag ?? defaults.showTargetTrophyTag,
    ),
    targetTrophyTagText:
      typeof parsed.targetTrophyTagText === "string"
        ? parsed.targetTrophyTagText
        : defaults.targetTrophyTagText,
    updatedAt:
      typeof parsed.updatedAt === "string" && parsed.updatedAt
        ? parsed.updatedAt
        : defaults.updatedAt,
  };
};

const sanitizeActiveGameSelection = (value: unknown): ActiveGameSelection => {
  const defaults = createDefaultActiveGameSelection();
  const parsed = (value ?? {}) as Partial<ActiveGameSelection>;
  const override = (parsed.override ?? {}) as Partial<ActiveGameSelection["override"]>;

  return {
    mode: parsed.mode === "custom" ? "custom" : "psn",
    selectedNpCommunicationId:
      typeof parsed.selectedNpCommunicationId === "string" &&
      parsed.selectedNpCommunicationId.length > 0
        ? parsed.selectedNpCommunicationId
        : null,
    customGameId:
      typeof parsed.customGameId === "string" && parsed.customGameId.length > 0
        ? parsed.customGameId
        : defaults.customGameId,
    override: {
      titleName: toNullableString(override.titleName),
      iconUrl: toNullableString(override.iconUrl),
      platform: toNullableString(override.platform),
      completionPercentage: toNullableNumber(override.completionPercentage),
      earnedCounts: sanitizePartialCounts(override.earnedCounts),
      definedCounts: sanitizePartialCounts(override.definedCounts),
      updatedAt:
        typeof override.updatedAt === "string" && override.updatedAt
          ? override.updatedAt
          : defaults.override.updatedAt,
    },
    updatedAt:
      typeof parsed.updatedAt === "string" && parsed.updatedAt
        ? parsed.updatedAt
        : defaults.updatedAt,
  };
};

const sanitizeTargetTrophies = (
  value: unknown,
): Record<string, TargetTrophySelection> => {
  if (typeof value !== "object" || value === null) {
    return {};
  }

  const entries = Object.entries(value as Record<string, unknown>);
  const nextEntries = entries.flatMap(([npCommunicationId, selection]) => {
    const parsed = sanitizeTargetTrophySelection(selection, npCommunicationId);
    return parsed ? [[npCommunicationId, parsed] as const] : [];
  });

  return Object.fromEntries(nextEntries);
};

const sanitizeTargetTrophySelection = (
  value: unknown,
  fallbackNpCommunicationId?: string,
): TargetTrophySelection | null => {
  const parsed = (value ?? {}) as Partial<TargetTrophySelection>;
  const npCommunicationId =
    typeof parsed.npCommunicationId === "string" && parsed.npCommunicationId.length > 0
      ? parsed.npCommunicationId
      : fallbackNpCommunicationId ?? null;
  const trophyGroupId =
    typeof parsed.trophyGroupId === "string" && parsed.trophyGroupId.length > 0
      ? parsed.trophyGroupId
      : null;
  const trophyId = Number(parsed.trophyId);

  if (!npCommunicationId || !trophyGroupId || !Number.isFinite(trophyId)) {
    return null;
  }

  return {
    npCommunicationId,
    trophyId,
    trophyGroupId,
    updatedAt:
      typeof parsed.updatedAt === "string" && parsed.updatedAt
        ? parsed.updatedAt
        : new Date(0).toISOString(),
  };
};

const sanitizePartialCounts = (value: unknown) => {
  const parsed = (value ?? {}) as Record<string, unknown>;

  return {
    platinum: toNullableNumber(parsed.platinum),
    gold: toNullableNumber(parsed.gold),
    silver: toNullableNumber(parsed.silver),
    bronze: toNullableNumber(parsed.bronze),
  };
};

const toNullableString = (value: unknown) =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : null;

const toNullableNumber = (value: unknown) => {
  if (value == null || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const clampNumber = (
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
) => {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(Math.max(parsed, minimum), maximum);
};

export class StateStore {
  private readonly database: Database.Database;

  constructor(databasePath = resolveDatabasePath()) {
    mkdirSync(dirname(databasePath), { recursive: true });
    this.database = new Database(databasePath);
    this.database.pragma("journal_mode = WAL");
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS app_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        settings_json TEXT NOT NULL,
        active_game_json TEXT NOT NULL,
        target_trophies_json TEXT NOT NULL DEFAULT '{}',
        updated_at TEXT NOT NULL
      )
    `);
    this.ensureSchema();

    const existing = this.getRow();

    if (!existing) {
      this.database
        .prepare(
          `
            INSERT INTO app_state (
              id,
              settings_json,
              active_game_json,
              target_trophies_json,
              updated_at
            )
            VALUES (
              @id,
              @settings_json,
              @active_game_json,
              @target_trophies_json,
              @updated_at
            )
          `,
        )
        .run({
          id: 1,
          settings_json: JSON.stringify(createDefaultOverlaySettings()),
          active_game_json: JSON.stringify(createDefaultActiveGameSelection()),
          target_trophies_json: JSON.stringify({}),
          updated_at: new Date().toISOString(),
        });
    }
  }

  getSettings(): OverlaySettings {
    return sanitizeSettings(this.parseRow().settings);
  }

  saveSettings(nextSettings: OverlaySettings): OverlaySettings {
    const sanitized = sanitizeSettings({
      ...nextSettings,
      updatedAt: new Date().toISOString(),
    });

    const row = this.parseRow();
    this.saveRow({
      settings: sanitized,
      activeGame: row.activeGame,
      targetTrophies: row.targetTrophies,
    });

    return sanitized;
  }

  getActiveGame(): ActiveGameSelection {
    return sanitizeActiveGameSelection(this.parseRow().activeGame);
  }

  saveActiveGame(nextActiveGame: ActiveGameSelection): ActiveGameSelection {
    const sanitized = sanitizeActiveGameSelection({
      ...nextActiveGame,
      updatedAt: new Date().toISOString(),
      override: {
        ...nextActiveGame.override,
        updatedAt: new Date().toISOString(),
      },
    });

    const row = this.parseRow();
    this.saveRow({
      settings: row.settings,
      activeGame: sanitized,
      targetTrophies: row.targetTrophies,
    });

    return sanitized;
  }

  getTargetTrophies(): Record<string, TargetTrophySelection> {
    return sanitizeTargetTrophies(this.parseRow().targetTrophies);
  }

  getTargetTrophy(npCommunicationId: string): TargetTrophySelection | null {
    return this.getTargetTrophies()[npCommunicationId] ?? null;
  }

  saveTargetTrophy(
    nextTargetTrophy: UpdateTargetTrophyRequest,
  ): TargetTrophySelection | null {
    const row = this.parseRow();
    const sanitizedTargets = sanitizeTargetTrophies(row.targetTrophies);
    const now = new Date().toISOString();

    if (nextTargetTrophy.trophyId == null || !nextTargetTrophy.trophyGroupId) {
      delete sanitizedTargets[nextTargetTrophy.npCommunicationId];
      this.saveRow({
        settings: row.settings,
        activeGame: row.activeGame,
        targetTrophies: sanitizedTargets,
      });
      return null;
    }

    const sanitizedSelection = sanitizeTargetTrophySelection({
      ...nextTargetTrophy,
      updatedAt: now,
    });

    if (!sanitizedSelection) {
      delete sanitizedTargets[nextTargetTrophy.npCommunicationId];
      this.saveRow({
        settings: row.settings,
        activeGame: row.activeGame,
        targetTrophies: sanitizedTargets,
      });
      return null;
    }

    sanitizedTargets[nextTargetTrophy.npCommunicationId] = sanitizedSelection;
    this.saveRow({
      settings: row.settings,
      activeGame: row.activeGame,
      targetTrophies: sanitizedTargets,
    });

    return sanitizedSelection;
  }

  close() {
    this.database.close();
  }

  private ensureSchema() {
    const columns = this.database
      .prepare("PRAGMA table_info(app_state)")
      .all() as Array<{ name: string }>;

    if (!columns.some((column) => column.name === "target_trophies_json")) {
      this.database.exec(
        "ALTER TABLE app_state ADD COLUMN target_trophies_json TEXT NOT NULL DEFAULT '{}'",
      );
    }
  }

  private getRow(): AppStateRow | undefined {
    return this.database
      .prepare(
        `
          SELECT
            id,
            settings_json,
            active_game_json,
            target_trophies_json,
            updated_at
          FROM app_state
          WHERE id = 1
        `,
      )
      .get() as AppStateRow | undefined;
  }

  private parseRow() {
    const row = this.getRow();
    const defaults = {
      settings: createDefaultOverlaySettings(),
      activeGame: createDefaultActiveGameSelection(),
      targetTrophies: {},
    };

    if (!row) {
      return defaults;
    }

    try {
      return {
        settings: sanitizeSettings(JSON.parse(row.settings_json)),
        activeGame: sanitizeActiveGameSelection(JSON.parse(row.active_game_json)),
        targetTrophies: sanitizeTargetTrophies(JSON.parse(row.target_trophies_json)),
      };
    } catch {
      return defaults;
    }
  }

  private saveRow({
    settings,
    activeGame,
    targetTrophies,
  }: {
    settings: OverlaySettings;
    activeGame: ActiveGameSelection;
    targetTrophies: Record<string, TargetTrophySelection>;
  }) {
    this.database
      .prepare(
        `
          UPDATE app_state
          SET settings_json = @settings_json,
              active_game_json = @active_game_json,
              target_trophies_json = @target_trophies_json,
              updated_at = @updated_at
          WHERE id = 1
        `,
      )
      .run({
        settings_json: JSON.stringify(settings),
        active_game_json: JSON.stringify(activeGame),
        target_trophies_json: JSON.stringify(targetTrophies),
        updated_at: new Date().toISOString(),
      });
  }
}
