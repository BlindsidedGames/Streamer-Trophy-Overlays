import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PsnCredentialStore } from "./psn-credential-store.js";

const mockExchangeAccessCodeForAuthTokens = vi.fn();
const mockExchangeNpssoForAccessCode = vi.fn();
const mockExchangeRefreshTokenForAuthTokens = vi.fn();
const mockGetProfileFromAccountId = vi.fn();
const mockGetTitleTrophies = vi.fn();
const mockGetTitleTrophyGroups = vi.fn();
const mockGetUserTitles = vi.fn();
const mockGetUserTrophiesEarnedForTitle = vi.fn();
const mockGetUserTrophyProfileSummary = vi.fn();

vi.mock("./psn-api-runtime.js", () => ({
  exchangeAccessCodeForAuthTokens: mockExchangeAccessCodeForAuthTokens,
  exchangeNpssoForAccessCode: mockExchangeNpssoForAccessCode,
  exchangeRefreshTokenForAuthTokens: mockExchangeRefreshTokenForAuthTokens,
  getProfileFromAccountId: mockGetProfileFromAccountId,
  getTitleTrophies: mockGetTitleTrophies,
  getTitleTrophyGroups: mockGetTitleTrophyGroups,
  getUserTitles: mockGetUserTitles,
  getUserTrophiesEarnedForTitle: mockGetUserTrophiesEarnedForTitle,
  getUserTrophyProfileSummary: mockGetUserTrophyProfileSummary,
}));

const createCredentialStore = (initialToken = "token") => {
  let token = initialToken;
  let updatedAt = initialToken ? "2026-03-17T00:00:00Z" : null;

  return {
    getStatus: () => ({
      configured: Boolean(token),
      storage: "local-file" as const,
      updatedAt,
    }),
    getToken: () => token || null,
    save: (nextToken: string) => {
      token = nextToken.trim();
      updatedAt = "2026-03-17T00:00:00Z";
      return {
        configured: true,
        storage: "local-file" as const,
        updatedAt,
      };
    },
    clear: () => {
      token = "";
      updatedAt = null;
      return {
        configured: false,
        storage: "local-file" as const,
        updatedAt,
      };
    },
  };
};

describe("RealPsnSummaryService", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-17T00:00:00Z"));
    vi.resetModules();
    vi.clearAllMocks();
    mockExchangeNpssoForAccessCode.mockResolvedValue("access-code");
    mockExchangeAccessCodeForAuthTokens.mockResolvedValue({
      accessToken: "access-token",
      expiresIn: 3600,
      idToken: "id-token",
      refreshToken: "refresh-token",
      refreshTokenExpiresIn: 7200,
      scope: "scope",
      tokenType: "Bearer",
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns normalized trophy data", async () => {
    mockGetUserTrophyProfileSummary.mockResolvedValue({
      accountId: "123",
      trophyLevel: "500",
      progress: 44,
      tier: 6,
      earnedTrophies: {
        bronze: 100,
        silver: 50,
        gold: 10,
        platinum: 5,
      },
    });
    mockGetUserTitles.mockResolvedValue({
      trophyTitles: [
        {
          npServiceName: "trophy2",
          npCommunicationId: "NPWR123_00",
          trophySetVersion: "01.00",
          trophyTitleName: "Demo Game",
          trophyTitleIconUrl: "https://example.com/icon.png",
          trophyTitlePlatform: "PS5",
          hasTrophyGroups: false,
          definedTrophies: {
            bronze: 20,
            silver: 10,
            gold: 5,
            platinum: 1,
          },
          progress: 50,
          earnedTrophies: {
            bronze: 10,
            silver: 5,
            gold: 2,
            platinum: 0,
          },
          hiddenFlag: false,
          lastUpdatedDateTime: "2026-03-17T00:00:00Z",
        },
      ],
      totalItemCount: 1,
    });
    mockGetProfileFromAccountId.mockResolvedValue({
      onlineId: "mattr",
      aboutMe: "",
      avatars: [{ size: "m", url: "https://example.com/avatar.png" }],
      languages: ["en"],
      isPlus: true,
      isOfficiallyVerified: false,
      isMe: true,
    });

    const { RealPsnSummaryService } = await import("./psn-summary-service.js");
    const service = new RealPsnSummaryService(
      createCredentialStore() as unknown as PsnCredentialStore,
    );
    const summary = await service.getSummary();

    expect(summary.error).toBeUndefined();
    expect(summary.profile?.onlineId).toBe("mattr");
    expect(summary.profile?.totalEarnedCount).toBe(165);
    expect(summary.titles).toHaveLength(1);
    expect(summary.titles[0]?.definedTotal).toBe(36);
  });

  it("adds warnings when profile details are unavailable", async () => {
    mockGetUserTrophyProfileSummary.mockResolvedValue({
      accountId: "123",
      trophyLevel: "500",
      progress: 44,
      tier: 6,
      earnedTrophies: {
        bronze: 100,
        silver: 50,
        gold: 10,
        platinum: 5,
      },
    });
    mockGetUserTitles.mockResolvedValue({
      trophyTitles: [],
      totalItemCount: 0,
    });
    mockGetProfileFromAccountId.mockRejectedValue(new Error("privacy settings"));

    const { RealPsnSummaryService } = await import("./psn-summary-service.js");
    const service = new RealPsnSummaryService(
      createCredentialStore() as unknown as PsnCredentialStore,
    );
    const summary = await service.getSummary();

    expect(summary.meta.partial).toBe(true);
    expect(summary.meta.warnings[0]).toContain("Profile lookup failed");
  });

  it("maps auth failures to explicit error types", async () => {
    mockExchangeNpssoForAccessCode.mockRejectedValue(
      new Error("There was a problem retrieving your PSN access code."),
    );

    const { RealPsnSummaryService } = await import("./psn-summary-service.js");
    const service = new RealPsnSummaryService(
      createCredentialStore() as unknown as PsnCredentialStore,
    );

    await expect(service.getSummary()).rejects.toMatchObject({
      type: "psn_auth",
    });
  });

  it("returns cached summary results within the ttl", async () => {
    mockGetUserTrophyProfileSummary.mockResolvedValue({
      accountId: "123",
      trophyLevel: "500",
      progress: 44,
      tier: 6,
      earnedTrophies: {
        bronze: 100,
        silver: 50,
        gold: 10,
        platinum: 5,
      },
    });
    mockGetUserTitles.mockResolvedValue({
      trophyTitles: [],
      totalItemCount: 0,
    });
    mockGetProfileFromAccountId.mockResolvedValue({
      onlineId: "mattr",
      aboutMe: "",
      avatars: [{ size: "m", url: "https://example.com/avatar.png" }],
      languages: ["en"],
      isPlus: true,
      isOfficiallyVerified: false,
      isMe: true,
    });

    const { RealPsnSummaryService } = await import("./psn-summary-service.js");
    const service = new RealPsnSummaryService(
      createCredentialStore() as unknown as PsnCredentialStore,
    );

    const first = await service.getSummary();
    const second = await service.getSummary();

    expect(first.meta.cached).toBe(false);
    expect(second.meta.cached).toBe(true);
    expect(mockGetUserTrophyProfileSummary).toHaveBeenCalledTimes(1);
    expect(mockGetUserTitles).toHaveBeenCalledTimes(1);
    expect(mockGetProfileFromAccountId).toHaveBeenCalledTimes(1);
  });

  it("preserves the last known onlineId when the profile lookup later fails", async () => {
    mockGetUserTrophyProfileSummary.mockResolvedValue({
      accountId: "123",
      trophyLevel: "500",
      progress: 44,
      tier: 6,
      earnedTrophies: {
        bronze: 100,
        silver: 50,
        gold: 10,
        platinum: 5,
      },
    });
    mockGetUserTitles.mockResolvedValue({
      trophyTitles: [],
      totalItemCount: 0,
    });
    mockGetProfileFromAccountId
      .mockResolvedValueOnce({
        onlineId: "mattr",
        aboutMe: "",
        avatars: [{ size: "m", url: "https://example.com/avatar.png" }],
        languages: ["en"],
        isPlus: true,
        isOfficiallyVerified: false,
        isMe: true,
      })
      .mockRejectedValueOnce(new Error("privacy settings"));

    const { RealPsnSummaryService } = await import("./psn-summary-service.js");
    const service = new RealPsnSummaryService(
      createCredentialStore() as unknown as PsnCredentialStore,
    );

    const first = await service.getSummary();

    vi.advanceTimersByTime(11_000);
    const stale = await service.getSummary();
    await vi.runAllTicks();

    expect(first.profile?.onlineId).toBe("mattr");
    expect(stale.meta.cached).toBe(true);
    expect(stale.profile?.onlineId).toBe("mattr");
  });

  it("returns a missing token error when nothing is saved locally", async () => {
    const { RealPsnSummaryService } = await import("./psn-summary-service.js");
    const service = new RealPsnSummaryService(
      createCredentialStore("") as unknown as PsnCredentialStore,
    );

    await expect(service.getSummary()).rejects.toMatchObject({
      type: "missing_token",
    });
  });

  it("invalidates cached auth and summary data when the token changes", async () => {
    const credentialStore = createCredentialStore("token-a");
    mockGetUserTrophyProfileSummary
      .mockResolvedValueOnce({
        accountId: "123",
        trophyLevel: "500",
        progress: 44,
        tier: 6,
        earnedTrophies: {
          bronze: 100,
          silver: 50,
          gold: 10,
          platinum: 5,
        },
      })
      .mockResolvedValueOnce({
        accountId: "123",
        trophyLevel: "501",
        progress: 45,
        tier: 6,
        earnedTrophies: {
          bronze: 101,
          silver: 50,
          gold: 10,
          platinum: 5,
        },
      });
    mockGetUserTitles.mockResolvedValue({
      trophyTitles: [],
      totalItemCount: 0,
    });
    mockGetProfileFromAccountId.mockResolvedValue({
      onlineId: "mattr",
      aboutMe: "",
      avatars: [{ size: "m", url: "https://example.com/avatar.png" }],
      languages: ["en"],
      isPlus: true,
      isOfficiallyVerified: false,
      isMe: true,
    });

    const { RealPsnSummaryService } = await import("./psn-summary-service.js");
    const service = new RealPsnSummaryService(
      credentialStore as unknown as PsnCredentialStore,
    );

    await service.getSummary();

    service.saveToken("token-b");
    await service.getSummary();

    expect(mockExchangeNpssoForAccessCode).toHaveBeenNthCalledWith(1, "token-a");
    expect(mockExchangeNpssoForAccessCode).toHaveBeenNthCalledWith(2, "token-b");
    expect(mockGetUserTrophyProfileSummary).toHaveBeenCalledTimes(2);
  });

  it("drops cached auth when the token is cleared", async () => {
    mockGetUserTrophyProfileSummary.mockResolvedValue({
      accountId: "123",
      trophyLevel: "500",
      progress: 44,
      tier: 6,
      earnedTrophies: {
        bronze: 100,
        silver: 50,
        gold: 10,
        platinum: 5,
      },
    });
    mockGetUserTitles.mockResolvedValue({
      trophyTitles: [],
      totalItemCount: 0,
    });
    mockGetProfileFromAccountId.mockResolvedValue({
      onlineId: "mattr",
      aboutMe: "",
      avatars: [{ size: "m", url: "https://example.com/avatar.png" }],
      languages: ["en"],
      isPlus: true,
      isOfficiallyVerified: false,
      isMe: true,
    });

    const credentialStore = createCredentialStore("token-a");
    const { RealPsnSummaryService } = await import("./psn-summary-service.js");
    const service = new RealPsnSummaryService(
      credentialStore as unknown as PsnCredentialStore,
    );

    await service.getSummary();
    service.clearToken();

    expect(service.getHealth().configured).toBe(false);
    await expect(service.getSummary()).rejects.toMatchObject({
      type: "missing_token",
    });
  });

  it("aggregates unearned trophies with title context and earned rate", async () => {
    mockGetUserTrophyProfileSummary.mockResolvedValue({
      accountId: "123",
      trophyLevel: "500",
      progress: 44,
      tier: 6,
      earnedTrophies: {
        bronze: 100,
        silver: 50,
        gold: 10,
        platinum: 5,
      },
    });
    mockGetProfileFromAccountId.mockResolvedValue({
      onlineId: "mattr",
      aboutMe: "",
      avatars: [{ size: "m", url: "https://example.com/avatar.png" }],
      languages: ["en"],
      isPlus: true,
      isOfficiallyVerified: false,
      isMe: true,
    });
    mockGetUserTitles.mockResolvedValue({
      trophyTitles: [
        {
          npServiceName: "trophy2",
          npCommunicationId: "NPWR1",
          trophySetVersion: "01.00",
          trophyTitleName: "Bluey",
          trophyTitleIconUrl: "https://example.com/bluey.png",
          trophyTitlePlatform: "PS5",
          hasTrophyGroups: false,
          definedTrophies: { bronze: 2, silver: 1, gold: 1, platinum: 1 },
          progress: 60,
          earnedTrophies: { bronze: 1, silver: 1, gold: 0, platinum: 0 },
          hiddenFlag: false,
          lastUpdatedDateTime: "2026-03-17T00:00:00Z",
        },
        {
          npServiceName: "trophy2",
          npCommunicationId: "NPWR2",
          trophySetVersion: "01.00",
          trophyTitleName: "Astro Bot",
          trophyTitleIconUrl: "https://example.com/astro.png",
          trophyTitlePlatform: "PS5",
          hasTrophyGroups: false,
          definedTrophies: { bronze: 1, silver: 0, gold: 1, platinum: 0 },
          progress: 50,
          earnedTrophies: { bronze: 1, silver: 0, gold: 0, platinum: 0 },
          hiddenFlag: false,
          lastUpdatedDateTime: "2026-03-16T00:00:00Z",
        },
      ],
      totalItemCount: 2,
    });
    mockGetTitleTrophies.mockImplementation(async (_authorization, npCommunicationId: string) => ({
      trophies:
        npCommunicationId === "NPWR1"
          ? [
              {
                trophyId: 1,
                trophyHidden: false,
                trophyType: "platinum",
                trophyName: "Best in Show",
                trophyDetail: "Earn every trophy in Bluey.",
                trophyIconUrl: "https://example.com/best.png",
                trophyGroupId: "default",
              },
              {
                trophyId: 2,
                trophyHidden: false,
                trophyType: "silver",
                trophyName: "Family Photo",
                trophyDetail: "Frame every memory.",
                trophyIconUrl: "https://example.com/family.png",
                trophyGroupId: "default",
              },
            ]
          : [
              {
                trophyId: 3,
                trophyHidden: true,
                trophyType: "gold",
                trophyName: "Galaxy Champion",
                trophyDetail: "Save the stars.",
                trophyIconUrl: "https://example.com/galaxy.png",
                trophyGroupId: "default",
              },
            ],
    }));
    mockGetUserTrophiesEarnedForTitle.mockImplementation(
      async (_authorization, _accountId, npCommunicationId: string) => ({
        trophySetVersion: "01.00",
        hasTrophyGroups: false,
        lastUpdatedDateTime: "2026-03-17T00:00:00Z",
        totalItemCount: 2,
        trophies:
          npCommunicationId === "NPWR1"
            ? [
                {
                  trophyId: 1,
                  trophyHidden: false,
                  earned: false,
                  trophyType: "platinum",
                  trophyRare: 1,
                  trophyEarnedRate: "11.1",
                  trophyProgressTargetValue: undefined,
                  trophyRewardImageUrl: undefined,
                  trophyRewardName: undefined,
                },
                {
                  trophyId: 2,
                  trophyHidden: false,
                  earned: true,
                  earnedDateTime: "2026-03-17T00:00:00Z",
                  trophyType: "silver",
                  trophyRare: 3,
                  trophyEarnedRate: "58.8",
                  trophyProgressTargetValue: undefined,
                  trophyRewardImageUrl: undefined,
                  trophyRewardName: undefined,
                },
              ]
            : [
                {
                  trophyId: 3,
                  trophyHidden: true,
                  earned: false,
                  trophyType: "gold",
                  trophyRare: 2,
                  trophyEarnedRate: "22.2",
                  trophyProgressTargetValue: undefined,
                  trophyRewardImageUrl: undefined,
                  trophyRewardName: undefined,
                },
              ],
      }),
    );

    const { RealPsnSummaryService } = await import("./psn-summary-service.js");
    const service = new RealPsnSummaryService(
      createCredentialStore() as unknown as PsnCredentialStore,
    );

    const first = await service.getUnearnedTrophies();
    const second = await service.getUnearnedTrophies();

    expect(first.trophies).toEqual([
      expect.objectContaining({
        npCommunicationId: "NPWR1",
        trophyId: 1,
        trophyEarnedRate: 11.1,
        trophyRare: 1,
        titleName: "Bluey",
        titleIconUrl: "https://example.com/bluey.png",
        titleLastUpdated: "2026-03-17T00:00:00Z",
      }),
      expect.objectContaining({
        npCommunicationId: "NPWR2",
        trophyId: 3,
        hidden: true,
        trophyEarnedRate: 22.2,
        titleName: "Astro Bot",
      }),
    ]);
    expect(second.meta.cached).toBe(true);
    expect(mockGetTitleTrophies).toHaveBeenCalledTimes(2);
  });

  it("keeps aggregate results partial when a title fetch fails", async () => {
    mockGetUserTrophyProfileSummary.mockResolvedValue({
      accountId: "123",
      trophyLevel: "500",
      progress: 44,
      tier: 6,
      earnedTrophies: {
        bronze: 100,
        silver: 50,
        gold: 10,
        platinum: 5,
      },
    });
    mockGetProfileFromAccountId.mockResolvedValue({
      onlineId: "mattr",
      aboutMe: "",
      avatars: [{ size: "m", url: "https://example.com/avatar.png" }],
      languages: ["en"],
      isPlus: true,
      isOfficiallyVerified: false,
      isMe: true,
    });
    mockGetUserTitles.mockResolvedValue({
      trophyTitles: [
        {
          npServiceName: "trophy2",
          npCommunicationId: "NPWR1",
          trophySetVersion: "01.00",
          trophyTitleName: "Bluey",
          trophyTitleIconUrl: "https://example.com/bluey.png",
          trophyTitlePlatform: "PS5",
          hasTrophyGroups: false,
          definedTrophies: { bronze: 1, silver: 0, gold: 0, platinum: 0 },
          progress: 0,
          earnedTrophies: { bronze: 0, silver: 0, gold: 0, platinum: 0 },
          hiddenFlag: false,
          lastUpdatedDateTime: "2026-03-17T00:00:00Z",
        },
        {
          npServiceName: "trophy2",
          npCommunicationId: "NPWR2",
          trophySetVersion: "01.00",
          trophyTitleName: "Astro Bot",
          trophyTitleIconUrl: "https://example.com/astro.png",
          trophyTitlePlatform: "PS5",
          hasTrophyGroups: false,
          definedTrophies: { bronze: 1, silver: 0, gold: 0, platinum: 0 },
          progress: 0,
          earnedTrophies: { bronze: 0, silver: 0, gold: 0, platinum: 0 },
          hiddenFlag: false,
          lastUpdatedDateTime: "2026-03-16T00:00:00Z",
        },
      ],
      totalItemCount: 2,
    });
    mockGetTitleTrophies.mockImplementation(async (_authorization, npCommunicationId: string) => {
      if (npCommunicationId === "NPWR2") {
        throw new Error("title lookup failed");
      }

      return {
        trophies: [
          {
            trophyId: 1,
            trophyHidden: false,
            trophyType: "bronze",
            trophyName: "First Step",
            trophyDetail: "Start the game.",
            trophyIconUrl: "https://example.com/start.png",
            trophyGroupId: "default",
          },
        ],
      };
    });
    mockGetUserTrophiesEarnedForTitle.mockResolvedValue({
      trophySetVersion: "01.00",
      hasTrophyGroups: false,
      lastUpdatedDateTime: "2026-03-17T00:00:00Z",
      totalItemCount: 1,
      trophies: [
        {
          trophyId: 1,
          trophyHidden: false,
          earned: false,
          trophyType: "bronze",
          trophyRare: 3,
          trophyEarnedRate: "81.2",
          trophyProgressTargetValue: undefined,
          trophyRewardImageUrl: undefined,
          trophyRewardName: undefined,
        },
      ],
    });

    const { RealPsnSummaryService } = await import("./psn-summary-service.js");
    const service = new RealPsnSummaryService(
      createCredentialStore() as unknown as PsnCredentialStore,
    );

    const response = await service.getUnearnedTrophies();

    expect(response.trophies).toHaveLength(1);
    expect(response.meta.partial).toBe(true);
    expect(response.meta.warnings[0]).toContain("Astro Bot");
  });
});
