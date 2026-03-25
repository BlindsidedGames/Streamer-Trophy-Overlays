import type { AuthTokensResponse, TitleThinTrophy, UserThinTrophy } from "psn-api";

import type {
  HealthResponse,
  ProfileSummary,
  PsnTokenStatusResponse,
  RecentTitleSummary,
  UnearnedTrophiesResponse,
  UnearnedTrophyItem,
  TitleSearchResponse,
  TitleTrophiesResponse,
  TrophyBrowserItem,
  TrophySummaryResponse,
} from "../shared/contracts.js";
import { AppError } from "./errors.js";
import {
  normalizeProfile,
  normalizeTitle,
  normalizeTitleSearchResult,
  normalizeTrophyBrowserItem,
} from "./normalize.js";
import {
  exchangeAccessCodeForAuthTokens,
  exchangeNpssoForAccessCode,
  exchangeRefreshTokenForAuthTokens,
  getProfileFromAccountId,
  getTitleTrophies,
  getTitleTrophyGroups,
  getUserTitles,
  getUserTrophiesEarnedForTitle,
  getUserTrophyProfileSummary,
} from "./psn-api-runtime.js";
import { PsnCredentialStore } from "./psn-credential-store.js";

type CachedAuthState = {
  tokens: AuthTokensResponse;
  obtainedAtMs: number;
};

type CachedSummaryState = {
  summary: TrophySummaryResponse;
  fetchedAtMs: number;
};

type CachedTitleLibraryState = {
  titles: RecentTitleSummary[];
  fetchedAtMs: number;
};

export type TitleTrophiesData = Omit<TitleTrophiesResponse, "target" | "error">;

type CachedTitleTrophiesState = {
  response: TitleTrophiesData;
  fetchedAtMs: number;
};

export type UnearnedTrophiesData = Omit<UnearnedTrophiesResponse, "error" | "trophies"> & {
  trophies: Array<Omit<UnearnedTrophyItem, "target">>;
};

type CachedUnearnedTrophiesState = {
  response: UnearnedTrophiesData;
  fetchedAtMs: number;
};

const AUTH_SAFETY_WINDOW_MS = 60_000;
const SUMMARY_CACHE_TTL_MS = 10_000;
const SUMMARY_MAX_STALE_MS = 5 * 60_000;
const RECENT_TITLES_LIMIT = 24;
const PAGE_LIMIT = 800;
const DEFAULT_SEARCH_LIMIT = 12;
const MAX_SEARCH_LIMIT = 24;
const UNEARNED_FETCH_CONCURRENCY = 6;

const hasApiError = (value: unknown): value is { error: { message?: string } } =>
  typeof value === "object" && value !== null && "error" in value;

export interface PsnSummaryService {
  getHealth(): HealthResponse;
  getTokenStatus(): PsnTokenStatusResponse;
  saveToken(token: string): PsnTokenStatusResponse;
  clearToken(): PsnTokenStatusResponse;
  getSummary(): Promise<TrophySummaryResponse>;
  getTitleByNpCommunicationId(npCommunicationId: string): Promise<RecentTitleSummary | null>;
  getTitleTrophies(npCommunicationId: string): Promise<TitleTrophiesData>;
  getUnearnedTrophies(): Promise<UnearnedTrophiesData>;
  searchTitles(
    query: string,
    offset?: number | null,
    limit?: number | null,
  ): Promise<TitleSearchResponse>;
}

export class RealPsnSummaryService implements PsnSummaryService {
  private cachedAuthState: CachedAuthState | null = null;
  private cachedSummaryState: CachedSummaryState | null = null;
  private cachedTitleLibraryState: CachedTitleLibraryState | null = null;
  private readonly cachedTitleTrophiesState = new Map<string, CachedTitleTrophiesState>();
  private cachedUnearnedTrophiesState: CachedUnearnedTrophiesState | null = null;
  private authPromise: Promise<CachedAuthState> | null = null;
  private summaryRefreshPromise: Promise<CachedSummaryState> | null = null;
  private titleLibraryRefreshPromise: Promise<CachedTitleLibraryState> | null = null;
  private unearnedTrophiesRefreshPromise: Promise<CachedUnearnedTrophiesState> | null = null;
  private readonly titleTrophiesRefreshPromises = new Map<
    string,
    Promise<CachedTitleTrophiesState>
  >();
  private cacheGeneration = 0;

  constructor(
    private readonly credentialStore: PsnCredentialStore = new PsnCredentialStore(),
  ) {}

  getHealth(): HealthResponse {
    return {
      status: "ok",
      configured: this.getTokenStatus().configured,
      source: "psn-api",
    };
  }

  getTokenStatus(): PsnTokenStatusResponse {
    return this.credentialStore.getStatus();
  }

  saveToken(token: string): PsnTokenStatusResponse {
    const status = this.credentialStore.save(token);
    this.invalidateCaches();
    return status;
  }

  clearToken(): PsnTokenStatusResponse {
    const status = this.credentialStore.clear();
    this.invalidateCaches();
    return status;
  }

  async getSummary(): Promise<TrophySummaryResponse> {
    const cached = this.cachedSummaryState;

    if (cached && !this.isCacheStale(cached)) {
      return this.cloneSummary(cached.summary, true);
    }

    if (cached && !this.isCacheExpired(cached)) {
      void this.refreshSummaryInBackground();
      return this.cloneSummary(cached.summary, true);
    }

    try {
      const nextState = await this.refreshSummaryState();
      return this.cloneSummary(nextState.summary, false);
    } catch (error) {
      if (cached && !this.isCacheExpired(cached)) {
        return this.cloneSummary(cached.summary, true);
      }

      throw error;
    }
  }

  async getTitleByNpCommunicationId(
    npCommunicationId: string,
  ): Promise<RecentTitleSummary | null> {
    const cachedRecent = this.cachedSummaryState?.summary.titles.find(
      (title) => title.npCommunicationId === npCommunicationId,
    );

    if (cachedRecent) {
      return this.cloneTitle(cachedRecent);
    }

    const cachedLibraryMatch = this.cachedTitleLibraryState?.titles.find(
      (title) => title.npCommunicationId === npCommunicationId,
    );

    if (cachedLibraryMatch) {
      return this.cloneTitle(cachedLibraryMatch);
    }

    const summary = await this.getSummary();
    const summaryMatch = summary.titles.find(
      (title) => title.npCommunicationId === npCommunicationId,
    );

    if (summaryMatch) {
      return this.cloneTitle(summaryMatch);
    }

    const library = await this.getTitleLibrary();
    const libraryMatch = library.find(
      (title) => title.npCommunicationId === npCommunicationId,
    );

    return libraryMatch ? this.cloneTitle(libraryMatch) : null;
  }

  async getTitleTrophies(npCommunicationId: string): Promise<TitleTrophiesData> {
    const cached = this.cachedTitleTrophiesState.get(npCommunicationId) ?? null;

    if (cached && !this.isCacheStale(cached)) {
      return this.cloneTitleTrophiesData(cached.response, true);
    }

    if (cached && !this.isCacheExpired(cached)) {
      void this.refreshTitleTrophiesInBackground(npCommunicationId);
      return this.cloneTitleTrophiesData(cached.response, true);
    }

    try {
      const nextState = await this.refreshTitleTrophiesState(npCommunicationId);
      return this.cloneTitleTrophiesData(nextState.response, false);
    } catch (error) {
      if (cached && !this.isCacheExpired(cached)) {
        return this.cloneTitleTrophiesData(cached.response, true);
      }

      throw error;
    }
  }

  async getUnearnedTrophies(): Promise<UnearnedTrophiesData> {
    const cached = this.cachedUnearnedTrophiesState;

    if (cached && !this.isCacheStale(cached)) {
      return this.cloneUnearnedTrophiesData(cached.response, true);
    }

    if (cached && !this.isCacheExpired(cached)) {
      void this.refreshUnearnedTrophiesInBackground();
      return this.cloneUnearnedTrophiesData(cached.response, true);
    }

    try {
      const nextState = await this.refreshUnearnedTrophiesState();
      return this.cloneUnearnedTrophiesData(nextState.response, false);
    } catch (error) {
      if (cached && !this.isCacheExpired(cached)) {
        return this.cloneUnearnedTrophiesData(cached.response, true);
      }

      throw error;
    }
  }

  async searchTitles(
    query: string,
    offset?: number | null,
    limit?: number | null,
  ): Promise<TitleSearchResponse> {
    const normalizedQuery = query.trim().toLowerCase();
    const nextOffset = Math.max(0, Number(offset ?? 0) || 0);
    const nextLimit = Math.min(
      Math.max(Number(limit ?? DEFAULT_SEARCH_LIMIT) || DEFAULT_SEARCH_LIMIT, 1),
      MAX_SEARCH_LIMIT,
    );

    if (!normalizedQuery) {
      return {
        results: [],
        nextOffset: null,
        totalItemCount: 0,
      };
    }

    const titles = await this.getTitleLibrary();
    const matches = titles.filter((title) =>
      title.titleName.toLowerCase().includes(normalizedQuery),
    );
    const results = matches
      .slice(nextOffset, nextOffset + nextLimit)
      .map(normalizeTitleSearchResult);

    return {
      results,
      nextOffset:
        nextOffset + nextLimit < matches.length ? nextOffset + nextLimit : null,
      totalItemCount: matches.length,
    };
  }

  private invalidateCaches() {
    this.cacheGeneration += 1;
    this.cachedAuthState = null;
    this.cachedSummaryState = null;
    this.cachedTitleLibraryState = null;
    this.cachedTitleTrophiesState.clear();
    this.cachedUnearnedTrophiesState = null;
    this.authPromise = null;
    this.summaryRefreshPromise = null;
    this.titleLibraryRefreshPromise = null;
    this.unearnedTrophiesRefreshPromise = null;
    this.titleTrophiesRefreshPromises.clear();
  }

  private async getTitleLibrary(): Promise<RecentTitleSummary[]> {
    const cached = this.cachedTitleLibraryState;

    if (cached && !this.isCacheStale(cached)) {
      return this.cloneTitles(cached.titles);
    }

    if (cached && !this.isCacheExpired(cached)) {
      void this.refreshTitleLibraryInBackground();
      return this.cloneTitles(cached.titles);
    }

    try {
      const nextState = await this.refreshTitleLibraryState();
      return this.cloneTitles(nextState.titles);
    } catch (error) {
      if (cached && !this.isCacheExpired(cached)) {
        return this.cloneTitles(cached.titles);
      }

      throw error;
    }
  }

  private async ensureAuthState(): Promise<CachedAuthState> {
    if (this.cachedAuthState && !this.isAuthExpired(this.cachedAuthState)) {
      return this.cachedAuthState;
    }

    const generation = this.cacheGeneration;
    let authPromise = this.authPromise;

    if (!authPromise) {
      const nextPromise = this.refreshAuthState(generation).finally(() => {
        if (this.authPromise === nextPromise) {
          this.authPromise = null;
        }
      });

      this.authPromise = nextPromise;
      authPromise = nextPromise;
    }

    const nextState = await authPromise;

    if (generation !== this.cacheGeneration) {
      return this.ensureAuthState();
    }

    this.cachedAuthState = nextState;
    return nextState;
  }

  private isAuthExpired(state: CachedAuthState): boolean {
    return (
      Date.now() >=
      state.obtainedAtMs + state.tokens.expiresIn * 1000 - AUTH_SAFETY_WINDOW_MS
    );
  }

  private isCacheStale(state: { fetchedAtMs: number }): boolean {
    return Date.now() >= state.fetchedAtMs + SUMMARY_CACHE_TTL_MS;
  }

  private isCacheExpired(state: { fetchedAtMs: number }): boolean {
    return Date.now() >= state.fetchedAtMs + SUMMARY_MAX_STALE_MS;
  }

  private async refreshAuthState(generation: number): Promise<CachedAuthState> {
    const npsso = this.credentialStore.getToken();

    if (!npsso) {
      throw new AppError(
        "missing_token",
        "Missing PSN token. Paste your token into the Control Room before requesting trophy data.",
      );
    }

    try {
      if (this.cachedAuthState?.tokens.refreshToken) {
        const refreshed = await exchangeRefreshTokenForAuthTokens(
          this.cachedAuthState.tokens.refreshToken,
        );

        return {
          tokens: refreshed,
          obtainedAtMs: Date.now(),
        };
      }

      const accessCode = await exchangeNpssoForAccessCode(npsso);
      const tokens = await exchangeAccessCodeForAuthTokens(accessCode);

      return {
        tokens,
        obtainedAtMs: Date.now(),
      };
    } catch (error) {
      if (generation === this.cacheGeneration) {
        this.cachedAuthState = null;
      }

      throw new AppError(
        "psn_auth",
        error instanceof Error ? error.message : "Failed to authenticate with PSN.",
        error,
      );
    }
  }

  private async refreshSummaryState(): Promise<CachedSummaryState> {
    const generation = this.cacheGeneration;
    let refreshPromise = this.summaryRefreshPromise;

    if (!refreshPromise) {
      const nextPromise = this.fetchSummaryState().finally(() => {
        if (this.summaryRefreshPromise === nextPromise) {
          this.summaryRefreshPromise = null;
        }
      });

      this.summaryRefreshPromise = nextPromise;
      refreshPromise = nextPromise;
    }

    const nextState = await refreshPromise;

    if (generation !== this.cacheGeneration) {
      return this.refreshSummaryState();
    }

    this.cachedSummaryState = nextState;
    return nextState;
  }

  private refreshSummaryInBackground() {
    if (this.summaryRefreshPromise) {
      return this.summaryRefreshPromise.catch(() => null);
    }

    const generation = this.cacheGeneration;
    const nextPromise = this.fetchSummaryState()
      .then((nextState) => {
        if (generation === this.cacheGeneration) {
          this.cachedSummaryState = nextState;
        }

        return nextState;
      })
      .finally(() => {
        if (this.summaryRefreshPromise === nextPromise) {
          this.summaryRefreshPromise = null;
        }
      });

    this.summaryRefreshPromise = nextPromise;
    return nextPromise.catch(() => null);
  }

  private async refreshTitleLibraryState(): Promise<CachedTitleLibraryState> {
    const generation = this.cacheGeneration;
    let refreshPromise = this.titleLibraryRefreshPromise;

    if (!refreshPromise) {
      const nextPromise = this.fetchTitleLibraryState().finally(() => {
        if (this.titleLibraryRefreshPromise === nextPromise) {
          this.titleLibraryRefreshPromise = null;
        }
      });

      this.titleLibraryRefreshPromise = nextPromise;
      refreshPromise = nextPromise;
    }

    const nextState = await refreshPromise;

    if (generation !== this.cacheGeneration) {
      return this.refreshTitleLibraryState();
    }

    this.cachedTitleLibraryState = nextState;
    return nextState;
  }

  private refreshTitleLibraryInBackground() {
    if (this.titleLibraryRefreshPromise) {
      return this.titleLibraryRefreshPromise.catch(() => null);
    }

    const generation = this.cacheGeneration;
    const nextPromise = this.fetchTitleLibraryState()
      .then((nextState) => {
        if (generation === this.cacheGeneration) {
          this.cachedTitleLibraryState = nextState;
        }

        return nextState;
      })
      .finally(() => {
        if (this.titleLibraryRefreshPromise === nextPromise) {
          this.titleLibraryRefreshPromise = null;
        }
      });

    this.titleLibraryRefreshPromise = nextPromise;
    return nextPromise.catch(() => null);
  }

  private async refreshTitleTrophiesState(
    npCommunicationId: string,
  ): Promise<CachedTitleTrophiesState> {
    const generation = this.cacheGeneration;
    let refreshPromise = this.titleTrophiesRefreshPromises.get(npCommunicationId);

    if (!refreshPromise) {
      const nextPromise = this.fetchTitleTrophiesState(npCommunicationId).finally(() => {
        if (this.titleTrophiesRefreshPromises.get(npCommunicationId) === nextPromise) {
          this.titleTrophiesRefreshPromises.delete(npCommunicationId);
        }
      });

      this.titleTrophiesRefreshPromises.set(npCommunicationId, nextPromise);
      refreshPromise = nextPromise;
    }

    const nextState = await refreshPromise;

    if (generation !== this.cacheGeneration) {
      return this.refreshTitleTrophiesState(npCommunicationId);
    }

    this.cachedTitleTrophiesState.set(npCommunicationId, nextState);
    return nextState;
  }

  private refreshTitleTrophiesInBackground(npCommunicationId: string) {
    const existingPromise = this.titleTrophiesRefreshPromises.get(npCommunicationId);

    if (existingPromise) {
      return existingPromise.catch(() => null);
    }

    const generation = this.cacheGeneration;
    const nextPromise = this.fetchTitleTrophiesState(npCommunicationId)
      .then((nextState) => {
        if (generation === this.cacheGeneration) {
          this.cachedTitleTrophiesState.set(npCommunicationId, nextState);
        }

        return nextState;
      })
      .finally(() => {
        if (this.titleTrophiesRefreshPromises.get(npCommunicationId) === nextPromise) {
          this.titleTrophiesRefreshPromises.delete(npCommunicationId);
        }
      });

    this.titleTrophiesRefreshPromises.set(npCommunicationId, nextPromise);
    return nextPromise.catch(() => null);
  }

  private async refreshUnearnedTrophiesState(): Promise<CachedUnearnedTrophiesState> {
    const generation = this.cacheGeneration;
    let refreshPromise = this.unearnedTrophiesRefreshPromise;

    if (!refreshPromise) {
      const nextPromise = this.fetchUnearnedTrophiesState().finally(() => {
        if (this.unearnedTrophiesRefreshPromise === nextPromise) {
          this.unearnedTrophiesRefreshPromise = null;
        }
      });

      this.unearnedTrophiesRefreshPromise = nextPromise;
      refreshPromise = nextPromise;
    }

    const nextState = await refreshPromise;

    if (generation !== this.cacheGeneration) {
      return this.refreshUnearnedTrophiesState();
    }

    this.cachedUnearnedTrophiesState = nextState;
    return nextState;
  }

  private refreshUnearnedTrophiesInBackground() {
    if (this.unearnedTrophiesRefreshPromise) {
      return this.unearnedTrophiesRefreshPromise.catch(() => null);
    }

    const generation = this.cacheGeneration;
    const nextPromise = this.fetchUnearnedTrophiesState()
      .then((nextState) => {
        if (generation === this.cacheGeneration) {
          this.cachedUnearnedTrophiesState = nextState;
        }

        return nextState;
      })
      .finally(() => {
        if (this.unearnedTrophiesRefreshPromise === nextPromise) {
          this.unearnedTrophiesRefreshPromise = null;
        }
      });

    this.unearnedTrophiesRefreshPromise = nextPromise;
    return nextPromise.catch(() => null);
  }

  private async fetchSummaryState(): Promise<CachedSummaryState> {
    const warnings: string[] = [];
    const authorization = (await this.ensureAuthState()).tokens;

    const [profileSummaryRaw, userTitlesRaw] = await Promise.all([
      getUserTrophyProfileSummary(authorization, "me"),
      getUserTitles(authorization, "me", { limit: RECENT_TITLES_LIMIT }),
    ]);

    if (hasApiError(profileSummaryRaw)) {
      throw this.classifyUpstreamError(profileSummaryRaw.error.message, profileSummaryRaw);
    }

    if (hasApiError(userTitlesRaw)) {
      throw this.classifyUpstreamError(userTitlesRaw.error.message, userTitlesRaw);
    }

    const profileDetailsResult = await getProfileFromAccountId(
      authorization,
      profileSummaryRaw.accountId,
    ).catch((error) => {
      warnings.push(
        error instanceof Error
          ? `Profile lookup failed: ${error.message}`
          : "Profile lookup failed.",
      );

      return null;
    });

    const previous = this.cachedSummaryState?.summary ?? null;
    const profile = this.mergeProfileIdentity(
      normalizeProfile(profileSummaryRaw, profileDetailsResult),
      previous?.profile ?? null,
    );
    const titles = this.mergeTitleMetadata(
      userTitlesRaw.trophyTitles.map(normalizeTitle),
      previous?.titles ?? [],
    );

    return {
      summary: {
        profile,
        titles,
        meta: {
          fetchedAt: new Date().toISOString(),
          cached: false,
          warnings,
          partial: warnings.length > 0,
          source: "psn-api",
        },
      },
      fetchedAtMs: Date.now(),
    };
  }

  private async fetchTitleLibraryState(): Promise<CachedTitleLibraryState> {
    const authorization = (await this.ensureAuthState()).tokens;
    const titles: RecentTitleSummary[] = [];
    let offset = 0;

    while (true) {
      const response = await getUserTitles(authorization, "me", {
        limit: PAGE_LIMIT,
        offset,
      });

      if (hasApiError(response)) {
        throw this.classifyUpstreamError(response.error.message, response);
      }

      titles.push(...response.trophyTitles.map(normalizeTitle));

      if (typeof response.nextOffset !== "number" || response.nextOffset <= offset) {
        break;
      }

      offset = response.nextOffset;
    }

    return {
      titles: this.mergeTitleMetadata(
        titles,
        this.cachedTitleLibraryState?.titles ?? this.cachedSummaryState?.summary.titles ?? [],
      ),
      fetchedAtMs: Date.now(),
    };
  }

  private async fetchUnearnedTrophiesState(): Promise<CachedUnearnedTrophiesState> {
    const titles = await this.getTitleLibrary();
    const warnings: string[] = [];
    const aggregatedTrophies: Array<Omit<UnearnedTrophyItem, "target">> = [];

    const titleResponses = await this.mapWithConcurrency(
      titles,
      UNEARNED_FETCH_CONCURRENCY,
      async (title) => {
        try {
          const response = await this.getTitleTrophies(title.npCommunicationId);
          return { title, response, error: null as Error | null };
        } catch (error) {
          return {
            title,
            response: null as TitleTrophiesData | null,
            error: error instanceof Error ? error : new Error("Unexpected error."),
          };
        }
      },
    );

    titleResponses.forEach(({ title, response, error }) => {
      if (error || !response) {
        warnings.push(`Unable to load ${title.titleName}: ${error?.message ?? "Unexpected error."}`);
        return;
      }

      warnings.push(...response.meta.warnings.map((warning) => `${title.titleName}: ${warning}`));

      response.trophies.forEach((trophy) => {
        if (trophy.earned) {
          return;
        }

        aggregatedTrophies.push({
          npCommunicationId: trophy.npCommunicationId,
          trophyId: trophy.trophyId,
          trophyGroupId: trophy.trophyGroupId,
          name: trophy.name,
          description: trophy.description,
          iconUrl: trophy.iconUrl,
          grade: trophy.grade,
          earned: false,
          earnedAt: null,
          hidden: trophy.hidden,
          groupName: trophy.groupName,
          trophyRare: trophy.trophyRare ?? null,
          trophyEarnedRate: trophy.trophyEarnedRate ?? null,
          titleName: title.titleName,
          titleIconUrl: title.iconUrl,
          platform: title.platform,
          titleLastUpdated: title.lastUpdated,
        });
      });
    });

    return {
      response: {
        trophies: aggregatedTrophies,
        meta: {
          fetchedAt: new Date().toISOString(),
          cached: false,
          warnings,
          partial: warnings.length > 0,
        },
      },
      fetchedAtMs: Date.now(),
    };
  }

  private async fetchTitleTrophiesState(
    npCommunicationId: string,
  ): Promise<CachedTitleTrophiesState> {
    const title = await this.getTitleByNpCommunicationId(npCommunicationId);

    if (!title) {
      throw new AppError(
        "unknown",
        `Title ${npCommunicationId} was not found in the PSN trophy history.`,
      );
    }

    const warnings: string[] = [];
    const authorization = (await this.ensureAuthState()).tokens;
    const [titleTrophies, earnedTrophies, trophyGroups] = await Promise.all([
      this.fetchAllTitleTrophies(authorization, title),
      this.fetchAllUserTrophies(authorization, title),
      title.hasTrophyGroups
        ? getTitleTrophyGroups(authorization, npCommunicationId, {
            npServiceName: title.npServiceName,
          }).catch((error) => {
            warnings.push(
              error instanceof Error
                ? `Trophy group lookup failed: ${error.message}`
                : "Trophy group lookup failed.",
            );
            return null;
          })
        : Promise.resolve(null),
    ]);

    const groupNames = new Map(
      (trophyGroups?.trophyGroups ?? []).map((group) => [
        group.trophyGroupId,
        group.trophyGroupName,
      ]),
    );
    const earnedById = new Map<number, UserThinTrophy>(
      earnedTrophies.map((trophy) => [trophy.trophyId, trophy]),
    );
    const trophies: TrophyBrowserItem[] = titleTrophies.map((trophy) =>
      normalizeTrophyBrowserItem({
        npCommunicationId,
        trophy,
        earned: earnedById.get(trophy.trophyId) ?? null,
        groupName: groupNames.get(trophy.trophyGroupId ?? "default") ?? null,
      }),
    );

    return {
      response: {
        title,
        trophies,
        meta: {
          fetchedAt: new Date().toISOString(),
          cached: false,
          warnings,
          partial: warnings.length > 0,
        },
      },
      fetchedAtMs: Date.now(),
    };
  }

  private async fetchAllTitleTrophies(
    authorization: AuthTokensResponse,
    title: RecentTitleSummary,
  ): Promise<TitleThinTrophy[]> {
    const trophies: TitleThinTrophy[] = [];
    let offset = 0;

    while (true) {
      const response = await getTitleTrophies(
        authorization,
        title.npCommunicationId,
        "all",
        {
          npServiceName: title.npServiceName,
          limit: PAGE_LIMIT,
          offset,
        },
      );

      trophies.push(...response.trophies);

      if (typeof response.nextOffset !== "number" || response.nextOffset <= offset) {
        break;
      }

      offset = response.nextOffset;
    }

    return trophies;
  }

  private async fetchAllUserTrophies(
    authorization: AuthTokensResponse,
    title: RecentTitleSummary,
  ): Promise<UserThinTrophy[]> {
    const trophies: UserThinTrophy[] = [];
    let offset = 0;

    while (true) {
      const response = await getUserTrophiesEarnedForTitle(
        authorization,
        "me",
        title.npCommunicationId,
        "all",
        {
          npServiceName: title.npServiceName,
          limit: PAGE_LIMIT,
          offset,
        },
      );

      trophies.push(...response.trophies);

      if (typeof response.nextOffset !== "number" || response.nextOffset <= offset) {
        break;
      }

      offset = response.nextOffset;
    }

    return trophies;
  }

  private cloneSummary(summary: TrophySummaryResponse, cached: boolean): TrophySummaryResponse {
    return {
      ...summary,
      profile: summary.profile ? { ...summary.profile } : null,
      titles: this.cloneTitles(summary.titles),
      meta: {
        ...summary.meta,
        warnings: [...summary.meta.warnings],
        cached,
      },
    };
  }

  private cloneTitles(titles: RecentTitleSummary[]): RecentTitleSummary[] {
    return titles.map((title) => this.cloneTitle(title));
  }

  private cloneTitle(title: RecentTitleSummary): RecentTitleSummary {
    return {
      ...title,
      earnedCounts: { ...title.earnedCounts },
      definedCounts: { ...title.definedCounts },
    };
  }

  private cloneTitleTrophiesData(
    response: TitleTrophiesData,
    cached: boolean,
  ): TitleTrophiesData {
    return {
      title: response.title ? this.cloneTitle(response.title) : null,
      trophies: response.trophies.map((trophy) => ({ ...trophy })),
      meta: {
        ...response.meta,
        warnings: [...response.meta.warnings],
        cached,
      },
    };
  }

  private cloneUnearnedTrophiesData(
    response: UnearnedTrophiesData,
    cached: boolean,
  ): UnearnedTrophiesData {
    return {
      trophies: response.trophies.map((trophy) => ({ ...trophy })),
      meta: {
        ...response.meta,
        warnings: [...response.meta.warnings],
        cached,
      },
    };
  }

  private async mapWithConcurrency<TItem, TResult>(
    items: TItem[],
    concurrency: number,
    worker: (item: TItem, index: number) => Promise<TResult>,
  ): Promise<TResult[]> {
    const results = new Array<TResult>(items.length);
    let cursor = 0;

    const next = async (): Promise<void> => {
      const currentIndex = cursor;
      cursor += 1;

      if (currentIndex >= items.length) {
        return;
      }

      results[currentIndex] = await worker(items[currentIndex] as TItem, currentIndex);
      await next();
    };

    const workerCount = Math.min(Math.max(concurrency, 1), items.length);
    await Promise.all(Array.from({ length: workerCount }, () => next()));

    return results;
  }

  private mergeProfileIdentity(
    current: ProfileSummary | null,
    previous: ProfileSummary | null,
  ): ProfileSummary | null {
    if (!current) {
      return previous ? { ...previous } : null;
    }

    if (!previous) {
      return current;
    }

    return {
      ...current,
      onlineId: current.onlineId ?? previous.onlineId,
      avatarUrl: current.avatarUrl ?? previous.avatarUrl,
    };
  }

  private mergeTitleMetadata(
    currentTitles: RecentTitleSummary[],
    previousTitles: RecentTitleSummary[],
  ): RecentTitleSummary[] {
    const previousById = new Map(
      previousTitles.map((title) => [title.npCommunicationId, title]),
    );

    return currentTitles.map((title) => {
      const previous = previousById.get(title.npCommunicationId);

      if (!previous) {
        return title;
      }

      return {
        ...title,
        titleName: this.pickString(title.titleName, previous.titleName),
        platform: this.pickString(title.platform, previous.platform),
        iconUrl: this.pickString(title.iconUrl, previous.iconUrl),
      };
    });
  }

  private pickString(current: string | null | undefined, previous: string | null | undefined) {
    if (typeof current === "string" && current.trim().length > 0) {
      return current;
    }

    return previous ?? current ?? "";
  }

  private classifyUpstreamError(message?: string, details?: unknown): AppError {
    const normalized = (message ?? "Unexpected PSN response.").toLowerCase();

    if (
      normalized.includes("privacy") ||
      normalized.includes("forbidden") ||
      normalized.includes("not authorized")
    ) {
      return new AppError(
        "psn_privacy",
        message ?? "PSN denied access to trophy data due to privacy restrictions.",
        details,
      );
    }

    return new AppError(
      "psn_upstream",
      message ?? "PSN returned an unexpected response.",
      details,
    );
  }
}
