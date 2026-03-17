export type GradeKey = "platinum" | "gold" | "silver" | "bronze";
export type FieldSource = "psn" | "override" | "custom" | "none";
export type OverlayView = "overall" | "currentGame" | "targetTrophy";

export interface TrophyCountsSummary {
  bronze: number;
  silver: number;
  gold: number;
  platinum: number;
  total: number;
}

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

export interface OverlaySettings {
  overallDurationMs: number;
  currentGameDurationMs: number;
  targetTrophyDurationMs: number;
  showGradeRows: boolean;
  showOverallCompletion: boolean;
  showCurrentCompletion: boolean;
  showCurrentTotals: boolean;
  showTargetTrophyInLoop: boolean;
  showTargetTrophyTag: boolean;
  targetTrophyTagText: string;
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
  currentGame: OverlayCurrentGameCard | null;
  targetTrophy: OverlayTargetTrophyCard | null;
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

export const createDefaultOverlaySettings = (): OverlaySettings => ({
  overallDurationMs: 5000,
  currentGameDurationMs: 12000,
  targetTrophyDurationMs: 12000,
  showGradeRows: true,
  showOverallCompletion: true,
  showCurrentCompletion: true,
  showCurrentTotals: true,
  showTargetTrophyInLoop: false,
  showTargetTrophyTag: true,
  targetTrophyTagText: "Current Target",
  updatedAt: new Date(0).toISOString(),
});

export const createDefaultActiveGameSelection = (): ActiveGameSelection => ({
  mode: "psn",
  selectedNpCommunicationId: null,
  customGameId: "custom-current-game",
  override: createDefaultCurrentGameOverride(),
  updatedAt: new Date(0).toISOString(),
});
