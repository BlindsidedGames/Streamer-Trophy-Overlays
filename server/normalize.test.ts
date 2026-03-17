import { describe, expect, it } from "vitest";
import type {
  ProfileFromAccountIdResponse,
  TrophyTitle,
  UserTrophyProfileSummaryResponse,
} from "psn-api";

import {
  normalizeCounts,
  normalizeProfile,
  normalizeTitle,
  normalizeTitleSearchResult,
  normalizeTrophyBrowserItem,
} from "./normalize.js";

describe("normalizeCounts", () => {
  it("maps trophy grade counts and total", () => {
    expect(
      normalizeCounts({
        bronze: 10,
        silver: 5,
        gold: 2,
        platinum: 1,
      }),
    ).toEqual({
      bronze: 10,
      silver: 5,
      gold: 2,
      platinum: 1,
      total: 18,
    });
  });

  it("falls back when optional counts are missing", () => {
    expect(normalizeCounts()).toEqual({
      bronze: 0,
      silver: 0,
      gold: 0,
      platinum: 0,
      total: 0,
    });
  });
});

describe("normalizeProfile", () => {
  it("maps summary and profile details", () => {
    const summary: UserTrophyProfileSummaryResponse = {
      accountId: "123",
      trophyLevel: "345",
      progress: 61,
      tier: 4,
      earnedTrophies: {
        bronze: 100,
        silver: 40,
        gold: 12,
        platinum: 3,
      } as unknown as UserTrophyProfileSummaryResponse["earnedTrophies"],
    };

    const profile: ProfileFromAccountIdResponse = {
      onlineId: "mattr",
      aboutMe: "",
      avatars: [{ size: "m", url: "https://example.com/avatar.png" }],
      languages: ["en"],
      isPlus: true,
      isOfficiallyVerified: false,
      isMe: true,
    };

    expect(normalizeProfile(summary, profile)).toEqual({
      accountId: "123",
      onlineId: "mattr",
      avatarUrl: "https://example.com/avatar.png",
      trophyLevel: 345,
      progressToNextLevel: 61,
      tier: 4,
      earnedCounts: {
        bronze: 100,
        silver: 40,
        gold: 12,
        platinum: 3,
        total: 155,
      },
      totalEarnedCount: 155,
      completionPercentage: null,
    });
  });
});

describe("normalizeTitle", () => {
  it("maps recent title data", () => {
    const title: TrophyTitle = {
      npServiceName: "trophy2",
      npCommunicationId: "NPWR12345_00",
      trophySetVersion: "01.00",
      trophyTitleName: "Astro Bot",
      trophyTitleIconUrl: "https://example.com/icon.png",
      trophyTitlePlatform: "PS5",
      hasTrophyGroups: false,
      definedTrophies: {
        bronze: 30,
        silver: 12,
        gold: 4,
        platinum: 1,
      },
      progress: 78,
      earnedTrophies: {
        bronze: 25,
        silver: 8,
        gold: 2,
        platinum: 0,
      },
      hiddenFlag: false,
      lastUpdatedDateTime: "2026-03-17T01:02:03Z",
    };

    expect(normalizeTitle(title)).toEqual({
      titleId: "NPWR12345_00",
      npCommunicationId: "NPWR12345_00",
      npServiceName: "trophy2",
      titleName: "Astro Bot",
      platform: "PS5",
      iconUrl: "https://example.com/icon.png",
      progress: 78,
      earnedCounts: {
        bronze: 25,
        silver: 8,
        gold: 2,
        platinum: 0,
        total: 35,
      },
      definedCounts: {
        bronze: 30,
        silver: 12,
        gold: 4,
        platinum: 1,
        total: 47,
      },
      earnedTotal: 35,
      definedTotal: 47,
      lastUpdated: "2026-03-17T01:02:03Z",
      hasTrophyGroups: false,
    });
  });

  it("maps title search results", () => {
    const title = normalizeTitle({
      npServiceName: "trophy2",
      npCommunicationId: "NPWR12345_00",
      trophySetVersion: "01.00",
      trophyTitleName: "Astro Bot",
      trophyTitleIconUrl: "https://example.com/icon.png",
      trophyTitlePlatform: "PS5",
      hasTrophyGroups: false,
      definedTrophies: {
        bronze: 30,
        silver: 12,
        gold: 4,
        platinum: 1,
      },
      progress: 78,
      earnedTrophies: {
        bronze: 25,
        silver: 8,
        gold: 2,
        platinum: 0,
      },
      hiddenFlag: false,
      lastUpdatedDateTime: "2026-03-17T01:02:03Z",
    });

    expect(normalizeTitleSearchResult(title)).toEqual({
      npCommunicationId: "NPWR12345_00",
      titleName: "Astro Bot",
      platform: "PS5",
      iconUrl: "https://example.com/icon.png",
      progress: 78,
      lastUpdated: "2026-03-17T01:02:03Z",
    });
  });
});

describe("normalizeTrophyBrowserItem", () => {
  it("merges trophy metadata with earned status", () => {
    expect(
      normalizeTrophyBrowserItem({
        npCommunicationId: "NPWR12345_00",
        trophy: {
          trophyId: 2,
          trophyHidden: false,
          trophyType: "gold",
          trophyName: "Galaxy Champion",
          trophyDetail: "Save the stars.",
          trophyIconUrl: "https://example.com/trophy.png",
          trophyGroupId: "default",
        },
        earned: {
          trophyId: 2,
          trophyHidden: false,
          earned: true,
          earnedDateTime: "2026-03-17T01:02:03Z",
          trophyType: "gold",
          trophyRare: 3,
          trophyEarnedRate: "12.3",
          trophyProgressTargetValue: "1",
          trophyRewardImageUrl: undefined,
          trophyRewardName: undefined,
        },
        groupName: "Main Set",
      }),
    ).toEqual({
      npCommunicationId: "NPWR12345_00",
      trophyId: 2,
      trophyGroupId: "default",
      name: "Galaxy Champion",
      description: "Save the stars.",
      iconUrl: "https://example.com/trophy.png",
      grade: "gold",
      earned: true,
      earnedAt: "2026-03-17T01:02:03Z",
      hidden: false,
      groupName: "Main Set",
    });
  });
});
