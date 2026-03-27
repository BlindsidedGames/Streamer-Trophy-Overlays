import type {
  ActiveGameSelection,
  FieldSource,
  GradeKey,
  OverlayBrbCard,
  OverlayCurrentGameCard,
  OverlayDataResponse,
  OverlayEarnedSessionCard,
  OverlayUnearnedCard,
  OverlaySettings,
  OverlayTargetTrophyCard,
  OverlayView,
  PsnTokenStatusResponse,
  TargetTrophySelection,
  TitleSearchResponse,
  TitleTrophiesResponse,
  UnearnedTrophiesResponse,
  TrophyCountsSummary,
  TrophySummaryResponse,
  UpdateBrbRequest,
  UpdateEarnedSessionRequest,
  UpdateTargetTrophyRequest,
} from "../shared/contracts.js";
import { StateStore } from "./store.js";
import {
  RealPsnSummaryService,
  type PsnSummaryService,
} from "./psn-summary-service.js";

const gradeKeys: GradeKey[] = ["platinum", "gold", "silver", "bronze"];
const fixedLoopOrder: OverlayView[] = [
  "overall",
  "unearnedTrophies",
  "currentGame",
  "targetTrophy",
];

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
  getUnearnedTrophies(): Promise<UnearnedTrophiesResponse>;
  getSettings(): OverlaySettings;
  updateSettings(settings: OverlaySettings): OverlaySettings;
  getActiveGame(): ActiveGameSelection;
  updateActiveGame(activeGame: ActiveGameSelection): ActiveGameSelection;
  getBrbState(): OverlayBrbCard;
  updateBrbState(request: UpdateBrbRequest): OverlayBrbCard;
  getEarnedSessionState(): OverlayEarnedSessionCard;
  updateEarnedSessionState(request: UpdateEarnedSessionRequest): OverlayEarnedSessionCard;
  updateTargetTrophy(
    request: UpdateTargetTrophyRequest,
  ): TargetTrophySelection | null;
  getOverlayData(): Promise<OverlayDataResponse>;
}

export class RealOverlaySuiteService implements OverlaySuiteService {
  private earnedSessionSyncChain: Promise<void> = Promise.resolve();

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

  async getUnearnedTrophies(): Promise<UnearnedTrophiesResponse> {
    const data = await this.summaryService.getUnearnedTrophies();
    const targetsByTitle = this.stateStore.getTargetTrophies();

    return {
      ...data,
      trophies: data.trophies.map((trophy) => {
        const target = targetsByTitle[trophy.npCommunicationId] ?? null;

        return {
          ...trophy,
          target:
            target?.trophyId === trophy.trophyId &&
            target?.trophyGroupId === trophy.trophyGroupId,
        };
      }),
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

  getBrbState() {
    return this.stateStore.getBrbState();
  }

  updateBrbState(request: UpdateBrbRequest) {
    return this.stateStore.updateBrbState(request);
  }

  getEarnedSessionState() {
    return this.stateStore.getEarnedSessionState();
  }

  updateEarnedSessionState(request: UpdateEarnedSessionRequest) {
    return this.stateStore.updateEarnedSessionState(request);
  }

  updateTargetTrophy(request: UpdateTargetTrophyRequest) {
    return this.stateStore.saveTargetTrophy(request);
  }

  async getOverlayData(): Promise<OverlayDataResponse> {
    const [summary, unearnedResult] = await Promise.all([
      this.summaryService.getSummary(),
      this.summaryService
        .getUnearnedTrophies()
        .then((response) => ({
          response,
          error: null as Error | null,
        }))
        .catch((error) => ({
          response: null as Awaited<ReturnType<PsnSummaryService["getUnearnedTrophies"]>> | null,
          error: error instanceof Error ? error : new Error("Unable to load unearned trophies."),
        })),
    ]);
    const settings = this.stateStore.getSettings();
    const activeGame = this.stateStore.getActiveGame();
    const brb = this.stateStore.getBrbState();
    const earnedSessionResult = await this.syncEarnedSession(summary);
    const selectedTitle = await this.resolveSelectedTitle(summary, activeGame);
    const currentGame = selectCurrentGame(selectedTitle, activeGame);
    const unearnedTrophies = buildUnearnedOverlayCard(
      summary.profile,
      unearnedResult.response,
    );
    const targetTrophy = currentGame?.npCommunicationId
      ? await this.resolveTargetTrophy(
          currentGame.npCommunicationId,
          currentGame.titleName,
          activeGame.mode,
        )
      : null;
    const warnings = [...summary.meta.warnings];

    if (unearnedResult.error) {
      warnings.push(`Unearned overlay unavailable: ${unearnedResult.error.message}`);
    } else if (unearnedResult.response) {
      warnings.push(...unearnedResult.response.meta.warnings);
    }
    warnings.push(...earnedSessionResult.warnings);

    const fetchedAt = resolveLatestTimestamp(
      summary.meta.fetchedAt,
      unearnedResult.response?.meta.fetchedAt ?? null,
    );
    const loopOrder = fixedLoopOrder.filter(
      (view) =>
        settings.loopVisibility[view] &&
        (view !== "targetTrophy" || targetTrophy !== null),
    );

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
      unearnedTrophies,
      currentGame,
      targetTrophy,
      brb,
      earnedSession: earnedSessionResult.card,
      display: {
        settings,
        loopOrder,
        lastRefreshAt: fetchedAt,
      },
      meta: {
        fetchedAt,
        cached: summary.meta.cached && (unearnedResult.response?.meta.cached ?? true),
        warnings,
        partial:
          summary.meta.partial ||
          Boolean(unearnedResult.error) ||
          earnedSessionResult.warnings.length > 0 ||
          Boolean(unearnedResult.response?.meta.partial),
      },
    };
  }

  close() {
    this.stateStore.close();
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

  private async syncEarnedSession(summary: TrophySummaryResponse): Promise<{
    card: OverlayEarnedSessionCard;
    warnings: string[];
  }> {
    const run = async () => {
      const tracker = this.stateStore.getEarnedSessionTracker();
      const sessionStartedAtMs = Date.parse(tracker.sessionStartedAt);
      const countedTrophyKeys = new Set(tracker.countedTrophyKeys);
      let autoCounts = { ...tracker.autoCounts };
      let titleSnapshots = { ...tracker.titleSnapshots };
      let changed = false;
      const warnings: string[] = [];

      for (const title of summary.titles) {
        const snapshot = tracker.titleSnapshots[title.npCommunicationId] ?? null;
        const titleLastUpdated = title.lastUpdated ?? null;
        const needsRefresh =
          !snapshot ||
          snapshot.earnedTotal !== title.earnedTotal ||
          snapshot.lastUpdated !== titleLastUpdated;

        if (!needsRefresh) {
          continue;
        }

        try {
          const titleTrophies = await this.summaryService.getTitleTrophies(title.npCommunicationId);

          titleTrophies.trophies.forEach((trophy) => {
            if (!trophy.earned || !trophy.earnedAt) {
              return;
            }

            const earnedAtMs = Date.parse(trophy.earnedAt);
            if (Number.isNaN(earnedAtMs) || earnedAtMs < sessionStartedAtMs) {
              return;
            }

            const trophyKey = createEarnedSessionTrophyKey(
              title.npCommunicationId,
              trophy.trophyId,
              trophy.trophyGroupId,
            );

            if (countedTrophyKeys.has(trophyKey)) {
              return;
            }

            countedTrophyKeys.add(trophyKey);
            autoCounts = incrementCounts(autoCounts, trophy.grade);
            changed = true;
          });

          titleSnapshots = {
            ...titleSnapshots,
            [title.npCommunicationId]: {
              earnedTotal: title.earnedTotal,
              lastUpdated: titleLastUpdated,
            },
          };
          changed = true;
        } catch (error) {
          warnings.push(
            `Earned session sync unavailable for ${title.titleName}: ${extractSyncErrorMessage(error)}`,
          );
        }
      }

      if (!changed) {
        return {
          card: this.stateStore.getEarnedSessionState(),
          warnings,
        };
      }

      return {
        card: this.stateStore.saveEarnedSessionTracker({
          ...tracker,
          autoCounts,
          countedTrophyKeys: Array.from(countedTrophyKeys),
          titleSnapshots,
        }),
        warnings,
      };
    };

    const resultPromise = this.earnedSessionSyncChain.then(run, run);
    this.earnedSessionSyncChain = resultPromise.then(
      () => undefined,
      () => undefined,
    );

    return resultPromise;
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

const incrementCounts = (
  counts: TrophyCountsSummary,
  grade: GradeKey,
): TrophyCountsSummary => ({
  ...counts,
  [grade]: counts[grade] + 1,
  total: counts.total + 1,
});

const createEarnedSessionTrophyKey = (
  npCommunicationId: string,
  trophyId: number,
  trophyGroupId: string,
) => `${npCommunicationId}:${trophyGroupId}:${trophyId}`;

const extractSyncErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Unable to load title trophies.";

const buildUnearnedOverlayCard = (
  profile: TrophySummaryResponse["profile"],
  response: Awaited<ReturnType<PsnSummaryService["getUnearnedTrophies"]>> | null,
): OverlayUnearnedCard | null => {
  if (!profile && !response) {
    return null;
  }

  const unearnedCounts = emptyCounts();
  response?.trophies.forEach((trophy) => {
    unearnedCounts[trophy.grade] += 1;
    unearnedCounts.total += 1;
  });

  const totalEarnedCount = profile?.totalEarnedCount ?? 0;
  const definedTotal = totalEarnedCount + unearnedCounts.total;

  return {
    onlineId: profile?.onlineId ?? null,
    avatarUrl: profile?.avatarUrl ?? null,
    completionPercentage:
      definedTotal > 0 ? (totalEarnedCount / definedTotal) * 100 : null,
    totalUnearnedCount: unearnedCounts.total,
    unearnedCounts,
  };
};

const resolveLatestTimestamp = (...timestamps: Array<string | null | undefined>) =>
  timestamps
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .sort()
    .at(-1) ?? new Date().toISOString();

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
