import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import {
  createDefaultBrbState,
  createDefaultActiveGameSelection,
  createDefaultOverlayAppearanceSettings,
  createDefaultCameraBorderSettings,
  createDefaultEarnedSessionCard,
  createEmptyTrophyCountsSummary,
  createDefaultOverlayAnchors,
  createDefaultOverlayLoopVisibility,
  createDefaultOverlaySettings,
  createDefaultOverlayStripVisibility,
  defaultStripZoneOrder,
  type ActiveGameSelection,
  type BrbStatus,
  type GradeKey,
  type LoopOverlayView,
  type OverlayBrbCard,
  type OverlayEarnedSessionCard,
  type OverlayAnchor,
  type OverlayAnchoredRouteKey,
  type OverlayAnchors,
  type OverlayLoopVisibility,
  type OverlayStripSectionVisibility,
  type OverlayStripVisibility,
  type OverlaySettings,
  type StripZoneKey,
  type StripOverlayView,
  type TargetTrophySelection,
  type TrophyCountsSummary,
  type UpdateBrbRequest,
  type UpdateEarnedSessionRequest,
  type UpdateTargetTrophyRequest,
  loopOverlayViews,
  overlayAnchoredRouteKeys,
  stripOverlayViews,
} from "../shared/contracts.js";
import { resolveDatabasePath } from "./runtime-config.js";

type AppStateRow = {
  id: number;
  settings_json: string;
  active_game_json: string;
  target_trophies_json: string;
  brb_json: string;
  earned_session_json: string;
  updated_at: string;
};

type EarnedSessionTitleSnapshot = {
  earnedTotal: number;
  lastUpdated: string | null;
};

export type EarnedSessionTracker = {
  visible: boolean;
  sessionStartedAt: string;
  autoCounts: TrophyCountsSummary;
  manualCounts: TrophyCountsSummary;
  countedTrophyKeys: string[];
  titleSnapshots: Record<string, EarnedSessionTitleSnapshot>;
  updatedAt: string;
};

type LegacyOverlaySettings = {
  showGradeRows?: unknown;
  showOverallCompletion?: unknown;
  showCurrentCompletion?: unknown;
  showCurrentTotals?: unknown;
  showStripArtwork?: unknown;
  showStripIdentity?: unknown;
  showStripMetrics?: unknown;
  showStripTrophies?: unknown;
  showTargetTrophyInLoop?: unknown;
  showTargetTrophyArtwork?: unknown;
  overlayAnchor?: unknown;
  overlayAnchors?: unknown;
  stripVisibility?: unknown;
  loopVisibility?: unknown;
};

const MAX_BRB_DURATION_MS = 24 * 60 * 60 * 1000;

const normalizeStripZoneOrder = (value: unknown): StripZoneKey[] => {
  if (!Array.isArray(value)) {
    return [...defaultStripZoneOrder];
  }

  const seen = new Set<StripZoneKey>();
  const normalized: StripZoneKey[] = [];

  value.forEach((entry) => {
    if (
      typeof entry === "string" &&
      defaultStripZoneOrder.includes(entry as StripZoneKey) &&
      !seen.has(entry as StripZoneKey)
    ) {
      const zone = entry as StripZoneKey;
      seen.add(zone);
      normalized.push(zone);
    }
  });

  defaultStripZoneOrder.forEach((zone) => {
    if (!seen.has(zone)) {
      normalized.push(zone);
    }
  });

  return normalized;
};

const normalizeOverlayAnchor = (
  value: unknown,
  fallback: OverlayAnchor = "bottom-left",
): OverlayAnchor => {
  switch (value) {
    case "top-left":
    case "top-center":
    case "top-right":
    case "bottom-left":
    case "bottom-center":
    case "bottom-right":
      return value;
    default:
      return fallback;
  }
};

const normalizeOverlayAnchors = (
  value: unknown,
  fallbackAnchor: OverlayAnchor,
): OverlayAnchors => {
  const defaults = createDefaultOverlayAnchors();
  const parsed = typeof value === "object" && value !== null
    ? (value as Partial<Record<OverlayAnchoredRouteKey, unknown>>)
    : {};

  return Object.fromEntries(
    overlayAnchoredRouteKeys.map((routeKey) => [
      routeKey,
      normalizeOverlayAnchor(parsed[routeKey], fallbackAnchor ?? defaults[routeKey]),
    ]),
  ) as OverlayAnchors;
};

const normalizeCameraBorderSettings = (
  value: unknown,
  fallback: OverlaySettings["cameraBorder"],
): OverlaySettings["cameraBorder"] => {
  const defaults = createDefaultCameraBorderSettings();
  const parsed = typeof value === "object" && value !== null
    ? (value as Partial<Record<keyof OverlaySettings["cameraBorder"], unknown>>)
    : {};
  const baseInsetPx = clampInteger(
    parsed.baseInsetPx,
    fallback.baseInsetPx ?? defaults.baseInsetPx,
    0,
    2000,
  );
  const baseThicknessPx = clampInteger(
    parsed.baseThicknessPx,
    fallback.baseThicknessPx ?? defaults.baseThicknessPx,
    0,
    2000,
  );
  const baseRadiusPx = clampInteger(
    parsed.baseRadiusPx,
    fallback.baseRadiusPx ?? defaults.baseRadiusPx,
    0,
    2000,
  );

  return {
    baseInsetPx,
    baseThicknessPx,
    baseRadiusPx,
    baseCutoutRadiusPx: clampInteger(
      parsed.baseCutoutRadiusPx,
      baseRadiusPx,
      0,
      2000,
    ),
    opacityPercent: clampInteger(
      parsed.opacityPercent,
      fallback.opacityPercent ?? defaults.opacityPercent,
      0,
      100,
    ),
  };
};

const normalizeOverlayCardAppearanceSettings = (
  value: unknown,
  fallback: OverlaySettings["overlayAppearance"]["unearnedTrophies"],
): OverlaySettings["overlayAppearance"]["unearnedTrophies"] => {
  const parsed = typeof value === "object" && value !== null
    ? (
        value as Partial<
          Record<
            keyof OverlaySettings["overlayAppearance"]["unearnedTrophies"],
            unknown
          >
        >
      )
    : {};

  return {
    backgroundTransparencyPercent: clampInteger(
      parsed.backgroundTransparencyPercent,
      fallback.backgroundTransparencyPercent,
      0,
      100,
    ),
  };
};

const normalizeOverlayArtworkCardAppearanceSettings = (
  value: unknown,
  fallback: OverlaySettings["overlayAppearance"]["overall"],
): OverlaySettings["overlayAppearance"]["overall"] => {
  const parsed = typeof value === "object" && value !== null
    ? (
        value as Partial<
          Record<keyof OverlaySettings["overlayAppearance"]["overall"], unknown>
        >
      )
    : {};

  return {
    backgroundTransparencyPercent: clampInteger(
      parsed.backgroundTransparencyPercent,
      fallback.backgroundTransparencyPercent,
      0,
      100,
    ),
    artworkRadiusPx: clampInteger(
      parsed.artworkRadiusPx,
      fallback.artworkRadiusPx,
      0,
      100,
    ),
  };
};

const normalizeOverlayAppearanceSettings = (
  value: unknown,
  fallback: OverlaySettings["overlayAppearance"],
): OverlaySettings["overlayAppearance"] => {
  const defaults = createDefaultOverlayAppearanceSettings();
  const parsed = typeof value === "object" && value !== null
    ? (value as Partial<Record<keyof OverlaySettings["overlayAppearance"], unknown>>)
    : {};

  return {
    overall: normalizeOverlayArtworkCardAppearanceSettings(
      parsed.overall,
      fallback.overall ?? defaults.overall,
    ),
    unearnedTrophies: normalizeOverlayCardAppearanceSettings(
      parsed.unearnedTrophies,
      fallback.unearnedTrophies ?? defaults.unearnedTrophies,
    ),
    currentGame: normalizeOverlayArtworkCardAppearanceSettings(
      parsed.currentGame,
      fallback.currentGame ?? defaults.currentGame,
    ),
    targetTrophy: normalizeOverlayArtworkCardAppearanceSettings(
      parsed.targetTrophy,
      fallback.targetTrophy ?? defaults.targetTrophy,
    ),
    brb: normalizeOverlayArtworkCardAppearanceSettings(
      parsed.brb,
      fallback.brb ?? defaults.brb,
    ),
    earnedSession: normalizeOverlayCardAppearanceSettings(
      parsed.earnedSession,
      fallback.earnedSession ?? defaults.earnedSession,
    ),
  };
};

const normalizeOverlayStripSectionVisibility = (
  value: unknown,
  fallback: OverlayStripSectionVisibility,
): OverlayStripSectionVisibility => {
  const parsed = typeof value === "object" && value !== null
    ? (value as Partial<Record<keyof OverlayStripSectionVisibility, unknown>>)
    : {};

  return {
    artwork:
      typeof parsed.artwork === "boolean" ? parsed.artwork : fallback.artwork,
    identity:
      typeof parsed.identity === "boolean" ? parsed.identity : fallback.identity,
    metrics:
      typeof parsed.metrics === "boolean" ? parsed.metrics : fallback.metrics,
    trophies:
      typeof parsed.trophies === "boolean" ? parsed.trophies : fallback.trophies,
  };
};

const normalizeOverlayStripVisibility = (
  value: unknown,
  fallback: OverlayStripVisibility,
): OverlayStripVisibility => {
  const parsed = typeof value === "object" && value !== null
    ? (value as Partial<Record<StripOverlayView, unknown>>)
    : {};

  return Object.fromEntries(
    stripOverlayViews.map((view) => {
      const normalized = normalizeOverlayStripSectionVisibility(
        parsed[view],
        fallback[view],
      );

      if (view === "unearnedTrophies") {
        normalized.artwork = false;
      }

      return [view, normalized];
    }),
  ) as OverlayStripVisibility;
};

const normalizeOverlayLoopVisibility = (
  value: unknown,
  fallback: OverlayLoopVisibility,
): OverlayLoopVisibility => {
  const parsed = typeof value === "object" && value !== null
    ? (value as Partial<Record<LoopOverlayView, unknown>>)
    : {};

  return Object.fromEntries(
    loopOverlayViews.map((view) => [
      view,
      typeof parsed[view] === "boolean" ? parsed[view] : fallback[view],
    ]),
  ) as OverlayLoopVisibility;
};

const isBrbStatus = (value: unknown): value is BrbStatus =>
  value === "stopped" || value === "running" || value === "paused" || value === "expired";

const sanitizeBrbState = (
  value: unknown,
  configuredDurationMs: number,
): OverlayBrbCard => {
  const defaults = createDefaultBrbState(configuredDurationMs);
  const parsed = (value ?? {}) as Partial<OverlayBrbCard>;
  const status = isBrbStatus(parsed.status) ? parsed.status : defaults.status;
  const sessionDurationMs = clampNumber(
    parsed.sessionDurationMs,
    defaults.sessionDurationMs,
    1000,
    MAX_BRB_DURATION_MS,
  );
  const remainingMs = clampNumber(parsed.remainingMs, defaults.remainingMs, 0, sessionDurationMs);
  const updatedAt =
    typeof parsed.updatedAt === "string" && parsed.updatedAt
      ? parsed.updatedAt
      : defaults.updatedAt;
  const visible = typeof parsed.visible === "boolean" ? parsed.visible : defaults.visible;
  const endsAt =
    typeof parsed.endsAt === "string" && parsed.endsAt.length > 0 ? parsed.endsAt : null;

  if (status === "stopped") {
    return {
      status,
      visible: false,
      remainingMs: configuredDurationMs,
      sessionDurationMs: configuredDurationMs,
      endsAt: null,
      updatedAt,
    };
  }

  if (status === "expired" || remainingMs === 0) {
    return {
      status: "expired",
      visible,
      remainingMs: 0,
      sessionDurationMs,
      endsAt: null,
      updatedAt,
    };
  }

  if (status === "running") {
    if (!endsAt) {
      return {
        status: "paused",
        visible,
        remainingMs,
        sessionDurationMs,
        endsAt: null,
        updatedAt,
      };
    }

    return {
      status,
      visible,
      remainingMs,
      sessionDurationMs,
      endsAt,
      updatedAt,
    };
  }

  return {
    status: "paused",
    visible,
    remainingMs,
    sessionDurationMs,
    endsAt: null,
    updatedAt,
  };
};

const resolveBrbStateForTime = (
  brbState: OverlayBrbCard,
  now = new Date(),
): { state: OverlayBrbCard; shouldPersist: boolean } => {
  if (brbState.status !== "running" || !brbState.endsAt) {
    return {
      state: brbState,
      shouldPersist: false,
    };
  }

  const remainingMs = Math.max(0, Date.parse(brbState.endsAt) - now.getTime());

  if (remainingMs > 0) {
    return {
      state: {
        ...brbState,
        remainingMs,
      },
      shouldPersist: false,
    };
  }

  return {
    state: {
      ...brbState,
      status: "expired",
      remainingMs: 0,
      endsAt: null,
      updatedAt: now.toISOString(),
    },
    shouldPersist: true,
  };
};

const sanitizeTrophyCountsSummary = (value: unknown): TrophyCountsSummary => {
  const parsed = (value ?? {}) as Partial<Record<keyof TrophyCountsSummary, unknown>>;
  const bronze = clampInteger(parsed.bronze, 0, 0, Number.MAX_SAFE_INTEGER);
  const silver = clampInteger(parsed.silver, 0, 0, Number.MAX_SAFE_INTEGER);
  const gold = clampInteger(parsed.gold, 0, 0, Number.MAX_SAFE_INTEGER);
  const platinum = clampInteger(parsed.platinum, 0, 0, Number.MAX_SAFE_INTEGER);

  return {
    bronze,
    silver,
    gold,
    platinum,
    total: bronze + silver + gold + platinum,
  };
};

const incrementTrophyCountsSummary = (
  counts: TrophyCountsSummary,
  grade: GradeKey,
): TrophyCountsSummary => ({
  ...counts,
  [grade]: counts[grade] + 1,
  total: counts.total + 1,
});

const combineTrophyCountsSummary = (
  left: TrophyCountsSummary,
  right: TrophyCountsSummary,
): TrophyCountsSummary => ({
  bronze: left.bronze + right.bronze,
  silver: left.silver + right.silver,
  gold: left.gold + right.gold,
  platinum: left.platinum + right.platinum,
  total: left.total + right.total,
});

const createDefaultEarnedSessionTracker = (now = new Date()): EarnedSessionTracker => {
  const defaultCard = createDefaultEarnedSessionCard(now);

  return {
    visible: defaultCard.visible,
    sessionStartedAt: defaultCard.sessionStartedAt,
    autoCounts: createEmptyTrophyCountsSummary(),
    manualCounts: createEmptyTrophyCountsSummary(),
    countedTrophyKeys: [],
    titleSnapshots: {},
    updatedAt: defaultCard.updatedAt,
  };
};

const sanitizeEarnedSessionTitleSnapshots = (
  value: unknown,
): Record<string, EarnedSessionTitleSnapshot> => {
  if (typeof value !== "object" || value === null) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).flatMap(([npCommunicationId, snapshot]) => {
      if (!npCommunicationId) {
        return [];
      }

      const parsed = (snapshot ?? {}) as Partial<EarnedSessionTitleSnapshot>;
      return [
        [
          npCommunicationId,
          {
            earnedTotal: clampInteger(parsed.earnedTotal, 0, 0, Number.MAX_SAFE_INTEGER),
            lastUpdated:
              typeof parsed.lastUpdated === "string" && parsed.lastUpdated.length > 0
                ? parsed.lastUpdated
                : null,
          } satisfies EarnedSessionTitleSnapshot,
        ],
      ];
    }),
  );
};

const sanitizeEarnedSessionTracker = (
  value: unknown,
  now = new Date(),
): EarnedSessionTracker => {
  const defaults = createDefaultEarnedSessionTracker(now);
  const parsed = (value ?? {}) as Partial<EarnedSessionTracker>;

  return {
    visible: typeof parsed.visible === "boolean" ? parsed.visible : defaults.visible,
    sessionStartedAt:
      typeof parsed.sessionStartedAt === "string" && parsed.sessionStartedAt.length > 0
        ? parsed.sessionStartedAt
        : defaults.sessionStartedAt,
    autoCounts: sanitizeTrophyCountsSummary(parsed.autoCounts),
    manualCounts: sanitizeTrophyCountsSummary(parsed.manualCounts),
    countedTrophyKeys: Array.isArray(parsed.countedTrophyKeys)
      ? Array.from(
          new Set(
            parsed.countedTrophyKeys.filter(
              (value): value is string => typeof value === "string" && value.length > 0,
            ),
          ),
        )
      : defaults.countedTrophyKeys,
    titleSnapshots: sanitizeEarnedSessionTitleSnapshots(parsed.titleSnapshots),
    updatedAt:
      typeof parsed.updatedAt === "string" && parsed.updatedAt.length > 0
        ? parsed.updatedAt
        : defaults.updatedAt,
  };
};

const toEarnedSessionCard = (
  tracker: EarnedSessionTracker,
): OverlayEarnedSessionCard => {
  const counts = combineTrophyCountsSummary(tracker.autoCounts, tracker.manualCounts);

  return {
    visible: tracker.visible,
    sessionStartedAt: tracker.sessionStartedAt,
    counts,
    totalEarnedCount: counts.total,
    updatedAt: tracker.updatedAt,
  };
};

const sanitizeSettings = (value: unknown): OverlaySettings => {
  const defaults = createDefaultOverlaySettings();
  const parsed = (value ?? {}) as Partial<OverlaySettings> & LegacyOverlaySettings;
  const legacyMetricToggles = [
    parsed.showOverallCompletion,
    parsed.showCurrentCompletion,
    parsed.showCurrentTotals,
  ];
  const hasLegacyMetricToggle = legacyMetricToggles.some(
    (entry) => typeof entry === "boolean",
  );
  const areLegacyMetricTogglesAllFalse =
    hasLegacyMetricToggle && legacyMetricToggles.every((entry) => entry === false);
  const legacyOverlayAnchor = normalizeOverlayAnchor(
    parsed.overlayAnchor,
    defaults.overlayAnchors.loop,
  );
  const legacyStripVisibility = createDefaultOverlayStripVisibility();
  const legacySharedArtwork =
    typeof parsed.showStripArtwork === "boolean"
      ? parsed.showStripArtwork
      : legacyStripVisibility.overall.artwork;
  const legacySharedIdentity =
    typeof parsed.showStripIdentity === "boolean"
      ? parsed.showStripIdentity
      : legacyStripVisibility.overall.identity;
  const legacySharedMetrics =
    typeof parsed.showStripMetrics === "boolean"
      ? parsed.showStripMetrics
      : areLegacyMetricTogglesAllFalse
        ? false
        : legacyStripVisibility.overall.metrics;
  const legacySharedTrophies =
    typeof parsed.showStripTrophies === "boolean"
      ? parsed.showStripTrophies
      : typeof parsed.showGradeRows === "boolean"
        ? parsed.showGradeRows
        : legacyStripVisibility.overall.trophies;
  const migratedStripVisibility: OverlayStripVisibility = {
    overall: {
      artwork: legacySharedArtwork,
      identity: legacySharedIdentity,
      metrics: legacySharedMetrics,
      trophies: legacySharedTrophies,
    },
    currentGame: {
      artwork: legacySharedArtwork,
      identity: legacySharedIdentity,
      metrics: legacySharedMetrics,
      trophies: legacySharedTrophies,
    },
    unearnedTrophies: {
      artwork: false,
      identity: legacySharedIdentity,
      metrics: legacySharedMetrics,
      trophies: legacySharedTrophies,
    },
  };
  const migratedLoopVisibility = createDefaultOverlayLoopVisibility();
  migratedLoopVisibility.targetTrophy = Boolean(
    parsed.showTargetTrophyInLoop ?? defaults.loopVisibility.targetTrophy,
  );

  return {
    overallDurationMs: clampNumber(parsed.overallDurationMs, defaults.overallDurationMs, 1000, 60000),
    unearnedTrophiesDurationMs: clampNumber(
      parsed.unearnedTrophiesDurationMs,
      defaults.unearnedTrophiesDurationMs,
      1000,
      60000,
    ),
    unearnedTrophiesLabelText:
      typeof parsed.unearnedTrophiesLabelText === "string"
        ? parsed.unearnedTrophiesLabelText
        : defaults.unearnedTrophiesLabelText,
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
    brbDurationMs: clampNumber(parsed.brbDurationMs, defaults.brbDurationMs, 1000, MAX_BRB_DURATION_MS),
    stripVisibility: normalizeOverlayStripVisibility(
      parsed.stripVisibility,
      migratedStripVisibility,
    ),
    stripZoneOrder: normalizeStripZoneOrder(parsed.stripZoneOrder),
    loopVisibility: normalizeOverlayLoopVisibility(
      parsed.loopVisibility,
      migratedLoopVisibility,
    ),
    overlayAnchors: normalizeOverlayAnchors(parsed.overlayAnchors, legacyOverlayAnchor),
    showUnearnedDetailedProgress: Boolean(
      parsed.showUnearnedDetailedProgress ?? defaults.showUnearnedDetailedProgress,
    ),
    showTargetTrophyArtwork: Boolean(
      parsed.showTargetTrophyArtwork ?? defaults.showTargetTrophyArtwork,
    ),
    showTargetTrophyInfo: Boolean(
      parsed.showTargetTrophyInfo ?? defaults.showTargetTrophyInfo,
    ),
    showTargetTrophyTag: Boolean(
      parsed.showTargetTrophyTag ?? defaults.showTargetTrophyTag,
    ),
    targetTrophyTagText:
      typeof parsed.targetTrophyTagText === "string"
        ? parsed.targetTrophyTagText
        : defaults.targetTrophyTagText,
    showBrbArtwork: Boolean(parsed.showBrbArtwork ?? defaults.showBrbArtwork),
    showBrbIdentity: Boolean(parsed.showBrbIdentity ?? defaults.showBrbIdentity),
    showBrbProgress: Boolean(parsed.showBrbProgress ?? defaults.showBrbProgress),
    brbSubtitleText:
      typeof parsed.brbSubtitleText === "string"
        ? parsed.brbSubtitleText
        : defaults.brbSubtitleText,
    showEarnedSessionIdentity: Boolean(
      parsed.showEarnedSessionIdentity ?? defaults.showEarnedSessionIdentity,
    ),
    showEarnedSessionTrophies: Boolean(
      parsed.showEarnedSessionTrophies ?? defaults.showEarnedSessionTrophies,
    ),
    earnedSessionHeadingText:
      typeof parsed.earnedSessionHeadingText === "string"
        ? parsed.earnedSessionHeadingText
        : defaults.earnedSessionHeadingText,
    overlayAppearance: normalizeOverlayAppearanceSettings(
      parsed.overlayAppearance,
      defaults.overlayAppearance,
    ),
    cameraBorder: normalizeCameraBorderSettings(parsed.cameraBorder, defaults.cameraBorder),
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

const clampInteger = (
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
) => Math.round(clampNumber(value, fallback, minimum, maximum));

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
        brb_json TEXT NOT NULL DEFAULT '{}',
        earned_session_json TEXT NOT NULL DEFAULT '{}',
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
              brb_json,
              earned_session_json,
              updated_at
            )
            VALUES (
              @id,
              @settings_json,
              @active_game_json,
              @target_trophies_json,
              @brb_json,
              @earned_session_json,
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
          earned_session_json: JSON.stringify(createDefaultEarnedSessionTracker()),
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
    const nextBrbState =
      row.brbState.status === "stopped"
        ? {
            ...row.brbState,
            remainingMs: sanitized.brbDurationMs,
            sessionDurationMs: sanitized.brbDurationMs,
            endsAt: null,
            visible: false,
          }
        : row.brbState;
    this.saveRow({
      settings: sanitized,
      activeGame: row.activeGame,
      targetTrophies: row.targetTrophies,
      brbState: nextBrbState,
      earnedSessionState: row.earnedSessionState,
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
      brbState: row.brbState,
      earnedSessionState: row.earnedSessionState,
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
        brbState: row.brbState,
        earnedSessionState: row.earnedSessionState,
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
        brbState: row.brbState,
        earnedSessionState: row.earnedSessionState,
      });
      return null;
    }

    sanitizedTargets[nextTargetTrophy.npCommunicationId] = sanitizedSelection;
    this.saveRow({
      settings: row.settings,
      activeGame: row.activeGame,
      targetTrophies: sanitizedTargets,
      brbState: row.brbState,
      earnedSessionState: row.earnedSessionState,
    });

    return sanitizedSelection;
  }

  getBrbState(): OverlayBrbCard {
    const row = this.parseRow();
    const resolved = resolveBrbStateForTime(row.brbState);

    if (resolved.shouldPersist) {
      this.saveRow({
        settings: row.settings,
        activeGame: row.activeGame,
        targetTrophies: row.targetTrophies,
        brbState: resolved.state,
        earnedSessionState: row.earnedSessionState,
      });
    }

    return resolved.state;
  }

  updateBrbState(request: UpdateBrbRequest): OverlayBrbCard {
    const row = this.parseRow();
    const now = new Date();
    const resolvedCurrent = resolveBrbStateForTime(row.brbState, now).state;
    const nowIso = now.toISOString();

    let nextBrbState = resolvedCurrent;

    if (request.action === "start") {
      nextBrbState = {
        status: "running",
        visible: true,
        remainingMs: row.settings.brbDurationMs,
        sessionDurationMs: row.settings.brbDurationMs,
        endsAt: new Date(now.getTime() + row.settings.brbDurationMs).toISOString(),
        updatedAt: nowIso,
      };
    } else if (request.action === "pause") {
      if (resolvedCurrent.status === "running" && resolvedCurrent.endsAt) {
        const remainingMs = Math.max(0, Date.parse(resolvedCurrent.endsAt) - now.getTime());
        nextBrbState =
          remainingMs <= 0
            ? {
                ...resolvedCurrent,
                status: "expired",
                remainingMs: 0,
                endsAt: null,
                updatedAt: nowIso,
              }
            : {
                ...resolvedCurrent,
                status: "paused",
                remainingMs,
                endsAt: null,
                updatedAt: nowIso,
              };
      }
    } else if (request.action === "resume") {
      if (resolvedCurrent.status === "paused") {
        nextBrbState = {
          ...resolvedCurrent,
          status: "running",
          visible: true,
          endsAt: new Date(now.getTime() + resolvedCurrent.remainingMs).toISOString(),
          updatedAt: nowIso,
        };
      }
    } else if (request.action === "stop") {
      nextBrbState = {
        status: "stopped",
        visible: false,
        remainingMs: row.settings.brbDurationMs,
        sessionDurationMs: row.settings.brbDurationMs,
        endsAt: null,
        updatedAt: nowIso,
      };
    } else if (resolvedCurrent.status !== "stopped") {
      nextBrbState = {
        ...resolvedCurrent,
        visible: request.visible,
        updatedAt: nowIso,
      };
    }

    this.saveRow({
      settings: row.settings,
      activeGame: row.activeGame,
      targetTrophies: row.targetTrophies,
      brbState: nextBrbState,
      earnedSessionState: row.earnedSessionState,
    });

    return nextBrbState;
  }

  getEarnedSessionTracker(): EarnedSessionTracker {
    return this.parseRow().earnedSessionState;
  }

  getEarnedSessionState(): OverlayEarnedSessionCard {
    return toEarnedSessionCard(this.getEarnedSessionTracker());
  }

  saveEarnedSessionTracker(nextTracker: EarnedSessionTracker): OverlayEarnedSessionCard {
    const row = this.parseRow();
    const sanitized = sanitizeEarnedSessionTracker(
      {
        ...nextTracker,
        updatedAt: new Date().toISOString(),
      },
      new Date(),
    );

    this.saveRow({
      settings: row.settings,
      activeGame: row.activeGame,
      targetTrophies: row.targetTrophies,
      brbState: row.brbState,
      earnedSessionState: sanitized,
    });

    return toEarnedSessionCard(sanitized);
  }

  updateEarnedSessionState(
    request: UpdateEarnedSessionRequest,
  ): OverlayEarnedSessionCard {
    const row = this.parseRow();
    const now = new Date();
    const nowIso = now.toISOString();

    let nextTracker = row.earnedSessionState;

    if (request.action === "reset") {
      nextTracker = {
        ...createDefaultEarnedSessionTracker(now),
        visible: row.earnedSessionState.visible,
        updatedAt: nowIso,
      };
    } else if (request.action === "setVisibility") {
      nextTracker = {
        ...row.earnedSessionState,
        visible: request.visible,
        updatedAt: nowIso,
      };
    } else {
      nextTracker = {
        ...row.earnedSessionState,
        manualCounts: incrementTrophyCountsSummary(
          row.earnedSessionState.manualCounts,
          request.grade,
        ),
        updatedAt: nowIso,
      };
    }

    this.saveRow({
      settings: row.settings,
      activeGame: row.activeGame,
      targetTrophies: row.targetTrophies,
      brbState: row.brbState,
      earnedSessionState: nextTracker,
    });

    return toEarnedSessionCard(nextTracker);
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

    if (!columns.some((column) => column.name === "brb_json")) {
      this.database.exec(
        "ALTER TABLE app_state ADD COLUMN brb_json TEXT NOT NULL DEFAULT '{}'",
      );
    }

    if (!columns.some((column) => column.name === "earned_session_json")) {
      this.database.exec(
        "ALTER TABLE app_state ADD COLUMN earned_session_json TEXT NOT NULL DEFAULT '{}'",
      );
      this.database
        .prepare(
          `
            UPDATE app_state
            SET earned_session_json = @earned_session_json
            WHERE id = 1
          `,
        )
        .run({
          earned_session_json: JSON.stringify(createDefaultEarnedSessionTracker()),
        });
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
            brb_json,
            earned_session_json,
            updated_at
          FROM app_state
          WHERE id = 1
        `,
      )
      .get() as AppStateRow | undefined;
  }

  private parseRow() {
    const row = this.getRow();
    const defaultSettings = createDefaultOverlaySettings();
    const defaults = {
      settings: defaultSettings,
      activeGame: createDefaultActiveGameSelection(),
      targetTrophies: {},
      brbState: createDefaultBrbState(defaultSettings.brbDurationMs),
      earnedSessionState: createDefaultEarnedSessionTracker(),
    };

    if (!row) {
      return defaults;
    }

    try {
      const settings = sanitizeSettings(JSON.parse(row.settings_json));

      return {
        settings,
        activeGame: sanitizeActiveGameSelection(JSON.parse(row.active_game_json)),
        targetTrophies: sanitizeTargetTrophies(JSON.parse(row.target_trophies_json)),
        brbState: sanitizeBrbState(JSON.parse(row.brb_json), settings.brbDurationMs),
        earnedSessionState: sanitizeEarnedSessionTracker(
          JSON.parse(row.earned_session_json),
        ),
      };
    } catch {
      return defaults;
    }
  }

  private saveRow({
    settings,
    activeGame,
    targetTrophies,
    brbState,
    earnedSessionState,
  }: {
    settings: OverlaySettings;
    activeGame: ActiveGameSelection;
    targetTrophies: Record<string, TargetTrophySelection>;
    brbState: OverlayBrbCard;
    earnedSessionState: EarnedSessionTracker;
  }) {
    this.database
      .prepare(
        `
          UPDATE app_state
          SET settings_json = @settings_json,
              active_game_json = @active_game_json,
              target_trophies_json = @target_trophies_json,
              brb_json = @brb_json,
              earned_session_json = @earned_session_json,
              updated_at = @updated_at
          WHERE id = 1
        `,
      )
      .run({
        settings_json: JSON.stringify(settings),
        active_game_json: JSON.stringify(activeGame),
        target_trophies_json: JSON.stringify(targetTrophies),
        brb_json: JSON.stringify(brbState),
        earned_session_json: JSON.stringify(earnedSessionState),
        updated_at: new Date().toISOString(),
      });
  }
}
