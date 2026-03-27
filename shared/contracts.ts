export type GradeKey = "platinum" | "gold" | "silver" | "bronze";
export type FieldSource = "psn" | "override" | "custom" | "none";
export type OverlayView =
  | "overall"
  | "unearnedTrophies"
  | "currentGame"
  | "targetTrophy";

export interface TrophyCountsSummary {
  bronze: number;
  silver: number;
  gold: number;
  platinum: number;
  total: number;
}

export const createEmptyTrophyCountsSummary = (): TrophyCountsSummary => ({
  bronze: 0,
  silver: 0,
  gold: 0,
  platinum: 0,
  total: 0,
});

export interface PartialTrophyCounts {
  bronze: number | null;
  silver: number | null;
  gold: number | null;
  platinum: number | null;
}

export interface ProfileSummary {
  accountId: string | null;
  onlineId: string | null;
  avatarUrl: string | null;
  trophyLevel: number | null;
  progressToNextLevel: number | null;
  tier: number | null;
  earnedCounts: TrophyCountsSummary;
  totalEarnedCount: number;
  completionPercentage: number | null;
}

export interface RecentTitleSummary {
  titleId: string;
  npCommunicationId: string;
  npServiceName: string;
  titleName: string;
  platform: string;
  iconUrl: string;
  progress: number | null;
  earnedCounts: TrophyCountsSummary;
  definedCounts: TrophyCountsSummary;
  earnedTotal: number;
  definedTotal: number;
  lastUpdated: string | null;
  hasTrophyGroups: boolean;
}

export interface TitleSearchResult {
  npCommunicationId: string;
  titleName: string;
  platform: string;
  iconUrl: string;
  progress: number | null;
  lastUpdated: string | null;
}

export interface TrophyBrowserItem {
  npCommunicationId: string;
  trophyId: number;
  trophyGroupId: string;
  name: string | null;
  description: string | null;
  iconUrl: string | null;
  grade: GradeKey;
  earned: boolean;
  earnedAt: string | null;
  hidden: boolean;
  groupName: string | null;
  trophyRare?: number | null;
  trophyEarnedRate?: number | null;
}

export interface ApiErrorPayload {
  type:
    | "invalid_request"
    | "missing_token"
    | "missing_env"
    | "psn_auth"
    | "psn_privacy"
    | "psn_upstream"
    | "unknown";
  message: string;
  details?: unknown;
}

export interface TrophySummaryResponse {
  profile: ProfileSummary | null;
  titles: RecentTitleSummary[];
  meta: {
    fetchedAt: string;
    cached: boolean;
    warnings: string[];
    partial: boolean;
    source: "psn-api";
  };
  error?: ApiErrorPayload;
}

export interface TitleSearchResponse {
  results: TitleSearchResult[];
  nextOffset: number | null;
  totalItemCount: number;
  error?: ApiErrorPayload;
}

export interface TargetTrophySelection {
  npCommunicationId: string;
  trophyId: number;
  trophyGroupId: string;
  updatedAt: string;
}

export interface UpdateTargetTrophyRequest {
  npCommunicationId: string;
  trophyId: number | null;
  trophyGroupId: string | null;
}

export interface TitleTrophiesResponse {
  title: RecentTitleSummary | null;
  trophies: TrophyBrowserItem[];
  target: TargetTrophySelection | null;
  meta: {
    fetchedAt: string;
    cached: boolean;
    warnings: string[];
    partial: boolean;
  };
  error?: ApiErrorPayload;
}

export interface UnearnedTrophyItem {
  npCommunicationId: string;
  trophyId: number;
  trophyGroupId: string;
  name: string | null;
  description: string | null;
  iconUrl: string | null;
  grade: GradeKey;
  earned: false;
  earnedAt: null;
  hidden: boolean;
  groupName: string | null;
  trophyRare: number | null;
  trophyEarnedRate: number | null;
  titleName: string;
  titleIconUrl: string;
  platform: string;
  titleLastUpdated: string | null;
  target: boolean;
}

export interface UnearnedTrophiesResponse {
  trophies: UnearnedTrophyItem[];
  meta: {
    fetchedAt: string;
    cached: boolean;
    warnings: string[];
    partial: boolean;
  };
  error?: ApiErrorPayload;
}

export interface HealthResponse {
  status: "ok";
  configured: boolean;
  source: "psn-api";
}

export interface PsnTokenStatusResponse {
  configured: boolean;
  storage: "local-file";
  updatedAt: string | null;
}

export interface UpdatePsnTokenRequest {
  token: string;
}

export type BrbStatus = "stopped" | "running" | "paused" | "expired";

export interface OverlayBrbCard {
  status: BrbStatus;
  visible: boolean;
  remainingMs: number;
  sessionDurationMs: number;
  endsAt: string | null;
  updatedAt: string;
}

export type UpdateBrbRequest =
  | {
      action: "start";
    }
  | {
      action: "pause";
    }
  | {
      action: "resume";
    }
  | {
      action: "stop";
    }
  | {
      action: "setVisibility";
      visible: boolean;
    };

export interface OverlayEarnedSessionCard {
  visible: boolean;
  sessionStartedAt: string;
  counts: TrophyCountsSummary;
  totalEarnedCount: number;
  updatedAt: string;
}

export type UpdateEarnedSessionRequest =
  | {
      action: "reset";
    }
  | {
      action: "setVisibility";
      visible: boolean;
    }
  | {
      action: "increment";
      grade: GradeKey;
    };

export const defaultStripZoneOrder = [
  "artwork",
  "identity",
  "metrics",
  "trophies",
  "targetInfo",
] as const;

export type StripZoneKey = (typeof defaultStripZoneOrder)[number];
export const loopOverlayViews = [
  "overall",
  "unearnedTrophies",
  "currentGame",
  "targetTrophy",
] as const;
export type LoopOverlayView = (typeof loopOverlayViews)[number];
export const stripOverlayViews = [
  "overall",
  "currentGame",
  "unearnedTrophies",
] as const;
export type StripOverlayView = (typeof stripOverlayViews)[number];
export type OverlayStripSectionKey = "artwork" | "identity" | "metrics" | "trophies";
export interface OverlayStripSectionVisibility {
  artwork: boolean;
  identity: boolean;
  metrics: boolean;
  trophies: boolean;
}
export type OverlayStripVisibility = Record<
  StripOverlayView,
  OverlayStripSectionVisibility
>;
export type OverlayLoopVisibility = Record<LoopOverlayView, boolean>;
export const overlayRoutePaths = {
  loop: "/overlay/loop",
  overall: "/overlay/overall",
  unearnedTrophies: "/overlay/unearned-trophies",
  currentGame: "/overlay/current-game",
  targetTrophy: "/overlay/target-trophy",
  brb: "/overlay/brb",
  earnedSession: "/overlay/earned-this-session",
  cameraBorder: "/overlay/camera-border",
} as const;
export type OverlayRouteKey = keyof typeof overlayRoutePaths;
export const overlayRouteKeys = Object.keys(overlayRoutePaths) as OverlayRouteKey[];
export const overlayAnchoredRouteKeys = [
  "loop",
  "overall",
  "unearnedTrophies",
  "currentGame",
  "targetTrophy",
  "brb",
  "earnedSession",
] as const;
export type OverlayAnchoredRouteKey = (typeof overlayAnchoredRouteKeys)[number];
export const overlayAnchorOptions = [
  "top-left",
  "top-center",
  "top-right",
  "bottom-left",
  "bottom-center",
  "bottom-right",
] as const;
export type OverlayAnchor = (typeof overlayAnchorOptions)[number];
export type OverlayAnchors = Record<OverlayAnchoredRouteKey, OverlayAnchor>;

export interface CameraBorderSettings {
  baseInsetPx: number;
  baseThicknessPx: number;
  baseRadiusPx: number;
  baseCutoutRadiusPx: number;
  opacityPercent: number;
}

export interface OverlayCardAppearanceSettings {
  backgroundTransparencyPercent: number;
}

export interface OverlayArtworkCardAppearanceSettings
  extends OverlayCardAppearanceSettings {
  artworkRadiusPx: number;
}

export interface OverlayAppearanceSettings {
  overall: OverlayArtworkCardAppearanceSettings;
  unearnedTrophies: OverlayCardAppearanceSettings;
  currentGame: OverlayArtworkCardAppearanceSettings;
  targetTrophy: OverlayArtworkCardAppearanceSettings;
  brb: OverlayArtworkCardAppearanceSettings;
  earnedSession: OverlayCardAppearanceSettings;
}

export interface OverlaySettings {
  overallDurationMs: number;
  unearnedTrophiesDurationMs: number;
  unearnedTrophiesLabelText: string;
  currentGameDurationMs: number;
  targetTrophyDurationMs: number;
  brbDurationMs: number;
  stripVisibility: OverlayStripVisibility;
  stripZoneOrder: StripZoneKey[];
  loopVisibility: OverlayLoopVisibility;
  overlayAnchors: OverlayAnchors;
  showUnearnedDetailedProgress: boolean;
  showTargetTrophyArtwork: boolean;
  showTargetTrophyInfo: boolean;
  showTargetTrophyTag: boolean;
  targetTrophyTagText: string;
  showBrbArtwork: boolean;
  showBrbIdentity: boolean;
  showBrbProgress: boolean;
  brbSubtitleText: string;
  showEarnedSessionIdentity: boolean;
  showEarnedSessionTrophies: boolean;
  earnedSessionHeadingText: string;
  overlayAppearance: OverlayAppearanceSettings;
  cameraBorder: CameraBorderSettings;
  updatedAt: string;
}

export interface CurrentGameOverride {
  titleName: string | null;
  iconUrl: string | null;
  platform: string | null;
  completionPercentage: number | null;
  earnedCounts: PartialTrophyCounts;
  definedCounts: PartialTrophyCounts;
  updatedAt: string;
}

export interface ActiveGameSelection {
  mode: "psn" | "custom";
  selectedNpCommunicationId: string | null;
  customGameId: string;
  override: CurrentGameOverride;
  updatedAt: string;
}

export interface OverlayOverallCard {
  onlineId: string | null;
  avatarUrl: string | null;
  totalTrophies: number;
  completionPercentage: number | null;
  progressToNextLevel: number | null;
  counts: TrophyCountsSummary;
}

export interface OverlayCurrentGameCard {
  source: "psn" | "custom" | "mixed";
  npCommunicationId: string | null;
  titleName: string;
  platform: string | null;
  iconUrl: string | null;
  completionPercentage: number | null;
  earnedCounts: TrophyCountsSummary;
  definedCounts: TrophyCountsSummary;
  earnedTotal: number;
  definedTotal: number;
  hasTrophyGroups: boolean;
  lastUpdated: string | null;
  fieldSources: {
    titleName: FieldSource;
    iconUrl: FieldSource;
    platform: FieldSource;
    completionPercentage: FieldSource;
    earnedCounts: Record<GradeKey, FieldSource>;
    definedCounts: Record<GradeKey, FieldSource>;
  };
}

export interface OverlayUnearnedCard {
  onlineId: string | null;
  avatarUrl: string | null;
  completionPercentage: number | null;
  totalUnearnedCount: number;
  unearnedCounts: TrophyCountsSummary;
}

export interface OverlayTargetTrophyCard {
  npCommunicationId: string;
  trophyId: number;
  trophyGroupId: string;
  titleName: string;
  trophyName: string;
  description: string | null;
  iconUrl: string | null;
  grade: GradeKey;
  earned: boolean;
  earnedAt: string | null;
  hidden: boolean;
}

export interface OverlayDataResponse {
  overall: OverlayOverallCard | null;
  unearnedTrophies: OverlayUnearnedCard | null;
  currentGame: OverlayCurrentGameCard | null;
  targetTrophy: OverlayTargetTrophyCard | null;
  brb: OverlayBrbCard;
  earnedSession: OverlayEarnedSessionCard;
  display: {
    settings: OverlaySettings;
    loopOrder: OverlayView[];
    lastRefreshAt: string;
  };
  meta: {
    fetchedAt: string;
    cached: boolean;
    warnings: string[];
    partial: boolean;
  };
  error?: ApiErrorPayload;
}

export const createEmptyPartialCounts = (): PartialTrophyCounts => ({
  bronze: null,
  silver: null,
  gold: null,
  platinum: null,
});

export const createDefaultCurrentGameOverride = (): CurrentGameOverride => ({
  titleName: null,
  iconUrl: null,
  platform: null,
  completionPercentage: null,
  earnedCounts: createEmptyPartialCounts(),
  definedCounts: createEmptyPartialCounts(),
  updatedAt: new Date(0).toISOString(),
});

export const DEFAULT_BRB_DURATION_MS = 5 * 60 * 1000;
export const DEFAULT_BRB_SUBTITLE_TEXT = "Intermission";
export const DEFAULT_UNEARNED_TROPHIES_LABEL_TEXT = "Unearned";
export const DEFAULT_OVERLAY_BACKGROUND_TRANSPARENCY_PERCENT = 100;
export const DEFAULT_OVERLAY_ARTWORK_RADIUS_PX = 17;
export const DEFAULT_CAMERA_BORDER_OPACITY_PERCENT = 96;

export const createDefaultOverlayCardAppearanceSettings =
  (): OverlayCardAppearanceSettings => ({
    backgroundTransparencyPercent: DEFAULT_OVERLAY_BACKGROUND_TRANSPARENCY_PERCENT,
  });

export const createDefaultOverlayArtworkCardAppearanceSettings =
  (): OverlayArtworkCardAppearanceSettings => ({
    ...createDefaultOverlayCardAppearanceSettings(),
    artworkRadiusPx: DEFAULT_OVERLAY_ARTWORK_RADIUS_PX,
  });

export const createDefaultOverlayAppearanceSettings =
  (): OverlayAppearanceSettings => ({
    overall: createDefaultOverlayArtworkCardAppearanceSettings(),
    unearnedTrophies: createDefaultOverlayCardAppearanceSettings(),
    currentGame: createDefaultOverlayArtworkCardAppearanceSettings(),
    targetTrophy: createDefaultOverlayArtworkCardAppearanceSettings(),
    brb: createDefaultOverlayArtworkCardAppearanceSettings(),
    earnedSession: createDefaultOverlayCardAppearanceSettings(),
  });

export const createDefaultCameraBorderSettings = (): CameraBorderSettings => ({
  baseInsetPx: 30,
  baseThicknessPx: 36,
  baseRadiusPx: 24,
  baseCutoutRadiusPx: 24,
  opacityPercent: DEFAULT_CAMERA_BORDER_OPACITY_PERCENT,
});

export const createDefaultBrbState = (
  durationMs = DEFAULT_BRB_DURATION_MS,
): OverlayBrbCard => ({
  status: "stopped",
  visible: false,
  remainingMs: durationMs,
  sessionDurationMs: durationMs,
  endsAt: null,
  updatedAt: new Date(0).toISOString(),
});

export const createDefaultEarnedSessionCard = (
  now: Date | string = new Date(0),
): OverlayEarnedSessionCard => {
  const nowIso = typeof now === "string" ? now : now.toISOString();

  return {
    visible: false,
    sessionStartedAt: nowIso,
    counts: createEmptyTrophyCountsSummary(),
    totalEarnedCount: 0,
    updatedAt: nowIso,
  };
};

export const createDefaultOverlayAnchors = (): OverlayAnchors => ({
  loop: "bottom-left",
  targetTrophy: "bottom-left",
  overall: "bottom-left",
  unearnedTrophies: "bottom-left",
  currentGame: "bottom-left",
  brb: "bottom-left",
  earnedSession: "bottom-left",
});

export const createDefaultOverlayStripVisibility =
  (): OverlayStripVisibility => ({
    overall: {
      artwork: true,
      identity: true,
      metrics: true,
      trophies: true,
    },
    currentGame: {
      artwork: true,
      identity: true,
      metrics: true,
      trophies: true,
    },
    unearnedTrophies: {
      artwork: false,
      identity: true,
      metrics: true,
      trophies: true,
    },
  });

export const createDefaultOverlayLoopVisibility = (): OverlayLoopVisibility => ({
  overall: true,
  unearnedTrophies: false,
  currentGame: true,
  targetTrophy: false,
});

export const createDefaultOverlaySettings = (): OverlaySettings => ({
  overallDurationMs: 5000,
  unearnedTrophiesDurationMs: 12000,
  unearnedTrophiesLabelText: DEFAULT_UNEARNED_TROPHIES_LABEL_TEXT,
  currentGameDurationMs: 12000,
  targetTrophyDurationMs: 12000,
  brbDurationMs: DEFAULT_BRB_DURATION_MS,
  stripVisibility: createDefaultOverlayStripVisibility(),
  stripZoneOrder: [...defaultStripZoneOrder],
  loopVisibility: createDefaultOverlayLoopVisibility(),
  overlayAnchors: createDefaultOverlayAnchors(),
  showUnearnedDetailedProgress: false,
  showTargetTrophyArtwork: true,
  showTargetTrophyInfo: true,
  showTargetTrophyTag: true,
  targetTrophyTagText: "Current Target",
  showBrbArtwork: true,
  showBrbIdentity: true,
  showBrbProgress: true,
  brbSubtitleText: DEFAULT_BRB_SUBTITLE_TEXT,
  showEarnedSessionIdentity: true,
  showEarnedSessionTrophies: true,
  earnedSessionHeadingText: "Earned This Session",
  overlayAppearance: createDefaultOverlayAppearanceSettings(),
  cameraBorder: createDefaultCameraBorderSettings(),
  updatedAt: new Date(0).toISOString(),
});

export const createDefaultActiveGameSelection = (): ActiveGameSelection => ({
  mode: "psn",
  selectedNpCommunicationId: null,
  customGameId: "custom-current-game",
  override: createDefaultCurrentGameOverride(),
  updatedAt: new Date(0).toISOString(),
});
