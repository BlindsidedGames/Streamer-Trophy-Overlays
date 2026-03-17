import type {
  ActiveGameSelection,
  FieldSource,
  GradeKey,
  OverlayCurrentGameCard,
  OverlayDataResponse,
  OverlaySettings,
  OverlayTargetTrophyCard,
  OverlayView,
  PsnTokenStatusResponse,
  TargetTrophySelection,
  TitleSearchResponse,
  TitleTrophiesResponse,
  TrophyCountsSummary,
  TrophySummaryResponse,
  UpdateTargetTrophyRequest,
} from "../shared/contracts.js";
import { StateStore } from "./store.js";
import {
  RealPsnSummaryService,
  type PsnSummaryService,
} from "./psn-summary-service.js";

const gradeKeys: GradeKey[] = ["platinum", "gold", "silver", "bronze"];

export interface OverlaySuiteService {
  getHealth(): ReturnType<PsnSummaryService["getHealth"]>;
  getPsnTokenStatus(): PsnTokenStatusResponse;
  savePsnToken(token: string): PsnTokenStatusResponse;
  clearPsnToken(): PsnTokenStatusResponse;
  getSummary(): Promise<TrophySummaryResponse>;
  searchTitles(
    query: string,
    offset?: number | null,
    limit?: number | null,
  ): Promise<TitleSearchResponse>;
  getTitleTrophies(npCommunicationId: string): Promise<TitleTrophiesResponse>;
  getSettings(): OverlaySettings;
  updateSettings(settings: OverlaySettings): OverlaySettings;
  getActiveGame(): ActiveGameSelection;
  updateActiveGame(activeGame: ActiveGameSelection): ActiveGameSelection;
  updateTargetTrophy(
    request: UpdateTargetTrophyRequest,
  ): TargetTrophySelection | null;
  getOverlayData(): Promise<OverlayDataResponse>;
}

export class RealOverlaySuiteService implements OverlaySuiteService {
  constructor(
    private readonly summaryService: PsnSummaryService = new RealPsnSummaryService(),
    private readonly stateStore: StateStore = new StateStore(),
  ) {}

  getHealth() {
    return this.summaryService.getHealth();
  }

  getPsnTokenStatus() {
    return this.summaryService.getTokenStatus();
  }

  savePsnToken(token: string) {
    return this.summaryService.saveToken(token);
  }

  clearPsnToken() {
    return this.summaryService.clearToken();
  }

  async getSummary() {
    return this.summaryService.getSummary();
  }

  async searchTitles(query: string, offset?: number | null, limit?: number | null) {
    return this.summaryService.searchTitles(query, offset, limit);
  }

  async getTitleTrophies(npCommunicationId: string): Promise<TitleTrophiesResponse> {
    const data = await this.summaryService.getTitleTrophies(npCommunicationId);

    return {
      ...data,
      target: this.stateStore.getTargetTrophy(npCommunicationId),
    };
  }

  getSettings() {
    return this.stateStore.getSettings();
  }

  updateSettings(settings: OverlaySettings) {
    return this.stateStore.saveSettings(settings);
  }

  getActiveGame() {
    return this.stateStore.getActiveGame();
  }

  updateActiveGame(activeGame: ActiveGameSelection) {
    return this.stateStore.saveActiveGame(activeGame);
  }

  updateTargetTrophy(request: UpdateTargetTrophyRequest) {
    return this.stateStore.saveTargetTrophy(request);
  }

  async getOverlayData(): Promise<OverlayDataResponse> {
    const summary = await this.summaryService.getSummary();
    const settings = this.stateStore.getSettings();
    const activeGame = this.stateStore.getActiveGame();
    const selectedTitle = await this.resolveSelectedTitle(summary, activeGame);
    const currentGame = selectCurrentGame(selectedTitle, activeGame);
    const targetTrophy = currentGame?.npCommunicationId
      ? await this.resolveTargetTrophy(
          currentGame.npCommunicationId,
          currentGame.titleName,
          activeGame.mode,
        )
      : null;
    const loopOrder: OverlayView[] = settings.showTargetTrophyInLoop && targetTrophy
      ? ["overall", "currentGame", "targetTrophy"]
      : ["overall", "currentGame"];

    return {
      overall: summary.profile
        ? {
            onlineId: summary.profile.onlineId,
            avatarUrl: summary.profile.avatarUrl,
            totalTrophies: summary.profile.totalEarnedCount,
            completionPercentage: summary.profile.completionPercentage,
            progressToNextLevel: summary.profile.progressToNextLevel,
            counts: summary.profile.earnedCounts,
          }
        : null,
      currentGame,
      targetTrophy,
      display: {
        settings,
        loopOrder,
        lastRefreshAt: summary.meta.fetchedAt,
      },
      meta: {
        fetchedAt: summary.meta.fetchedAt,
        cached: summary.meta.cached,
        warnings: summary.meta.warnings,
        partial: summary.meta.partial,
      },
    };
  }

  private async resolveSelectedTitle(
    summary: TrophySummaryResponse,
    activeGame: ActiveGameSelection,
  ) {
    if (activeGame.mode === "custom") {
      return null;
    }

    if (activeGame.selectedNpCommunicationId) {
      const recentTitle =
        summary.titles.find(
          (title) =>
            title.npCommunicationId === activeGame.selectedNpCommunicationId,
        ) ?? null;

      if (recentTitle) {
        return recentTitle;
      }

      const historicalTitle = await this.summaryService.getTitleByNpCommunicationId(
        activeGame.selectedNpCommunicationId,
      );

      if (historicalTitle) {
        return historicalTitle;
      }
    }

    return summary.titles[0] ?? null;
  }

  private async resolveTargetTrophy(
    npCommunicationId: string,
    titleName: string,
    mode: ActiveGameSelection["mode"],
  ): Promise<OverlayTargetTrophyCard | null> {
    if (mode === "custom") {
      return null;
    }

    const selection = this.stateStore.getTargetTrophy(npCommunicationId);

    if (!selection) {
      return null;
    }

    const titleTrophies = await this.summaryService.getTitleTrophies(npCommunicationId);
    const trophy = titleTrophies.trophies.find(
      (entry) =>
        entry.trophyId === selection.trophyId &&
        entry.trophyGroupId === selection.trophyGroupId,
    );

    if (!trophy || !trophy.name) {
      return null;
    }

    return {
      npCommunicationId,
      trophyId: trophy.trophyId,
      trophyGroupId: trophy.trophyGroupId,
      titleName,
      trophyName: trophy.name,
      description: trophy.description,
      iconUrl: trophy.iconUrl,
      grade: trophy.grade,
      earned: trophy.earned,
      earnedAt: trophy.earnedAt,
      hidden: trophy.hidden,
    };
  }
}

const selectCurrentGame = (
  baseTitle: TrophySummaryResponse["titles"][number] | null,
  activeGame: ActiveGameSelection,
): OverlayCurrentGameCard | null => {
  if (!baseTitle && activeGame.mode === "psn" && !hasCustomContent(activeGame)) {
    return null;
  }

  const titleSources = createGradeSources("none");
  const definedSources = createGradeSources("none");

  const pickValue = <T,>(
    psnValue: T | null,
    overrideValue: T | null,
    baseSource: FieldSource,
  ): { value: T | null; source: FieldSource } => {
    if (overrideValue != null) {
      return {
        value: overrideValue,
        source: activeGame.mode === "custom" ? "custom" : "override",
      };
    }

    if (psnValue != null) {
      return {
        value: psnValue,
        source: baseSource,
      };
    }

    return {
      value: null,
      source: "none",
    };
  };

  const titleName = pickValue(
    baseTitle?.titleName ?? null,
    activeGame.override.titleName,
    baseTitle ? "psn" : "none",
  );
  const iconUrl = pickValue(
    baseTitle?.iconUrl ?? null,
    activeGame.override.iconUrl,
    baseTitle ? "psn" : "none",
  );
  const platform = pickValue(
    baseTitle?.platform ?? null,
    activeGame.override.platform,
    baseTitle ? "psn" : "none",
  );
  const completionPercentage = pickValue(
    baseTitle?.progress ?? null,
    activeGame.override.completionPercentage,
    baseTitle ? "psn" : "none",
  );

  const earnedCounts = mergeCounts(
    baseTitle?.earnedCounts ?? emptyCounts(),
    activeGame.override.earnedCounts,
    activeGame.mode,
    titleSources,
  );
  const definedCounts = mergeCounts(
    baseTitle?.definedCounts ?? emptyCounts(),
    activeGame.override.definedCounts,
    activeGame.mode,
    definedSources,
  );

  const source =
    activeGame.mode === "custom"
      ? "custom"
      : hasOverride(activeGame)
        ? "mixed"
        : "psn";

  return {
    source,
    npCommunicationId:
      activeGame.mode === "custom"
        ? null
        : baseTitle?.npCommunicationId ?? activeGame.selectedNpCommunicationId,
    titleName: titleName.value ?? "Custom Game",
    platform: platform.value,
    iconUrl: iconUrl.value,
    completionPercentage: completionPercentage.value,
    earnedCounts,
    definedCounts,
    earnedTotal: earnedCounts.total,
    definedTotal: definedCounts.total,
    hasTrophyGroups: baseTitle?.hasTrophyGroups ?? false,
    lastUpdated: baseTitle?.lastUpdated ?? null,
    fieldSources: {
      titleName: titleName.source,
      iconUrl: iconUrl.source,
      platform: platform.source,
      completionPercentage: completionPercentage.source,
      earnedCounts: titleSources,
      definedCounts: definedSources,
    },
  };
};

const mergeCounts = (
  psnCounts: TrophyCountsSummary,
  overrideCounts: ActiveGameSelection["override"]["earnedCounts"],
  mode: ActiveGameSelection["mode"],
  sources: Record<GradeKey, FieldSource>,
): TrophyCountsSummary => {
  const nextCounts = { ...emptyCounts() };

  for (const grade of gradeKeys) {
    const overrideValue = overrideCounts[grade];
    if (overrideValue != null) {
      nextCounts[grade] = overrideValue;
      sources[grade] = mode === "custom" ? "custom" : "override";
    } else if (psnCounts[grade] != null) {
      nextCounts[grade] = psnCounts[grade];
      sources[grade] = "psn";
    } else {
      sources[grade] = "none";
    }
  }

  nextCounts.total =
    nextCounts.platinum + nextCounts.gold + nextCounts.silver + nextCounts.bronze;

  return nextCounts;
};

const createGradeSources = (initial: FieldSource): Record<GradeKey, FieldSource> => ({
  platinum: initial,
  gold: initial,
  silver: initial,
  bronze: initial,
});

const emptyCounts = (): TrophyCountsSummary => ({
  platinum: 0,
  gold: 0,
  silver: 0,
  bronze: 0,
  total: 0,
});

const hasOverride = (activeGame: ActiveGameSelection) =>
  hasCustomContent(activeGame) ||
  gradeKeys.some((grade) => activeGame.override.earnedCounts[grade] != null) ||
  gradeKeys.some((grade) => activeGame.override.definedCounts[grade] != null);

const hasCustomContent = (activeGame: ActiveGameSelection) =>
  Boolean(
    activeGame.override.titleName ||
      activeGame.override.iconUrl ||
      activeGame.override.platform ||
      activeGame.override.completionPercentage != null,
  );
