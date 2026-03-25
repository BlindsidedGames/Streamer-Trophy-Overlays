import type {
  ProfileFromAccountIdResponse,
  TitleThinTrophy,
  TrophyTitle,
  UserThinTrophy,
  UserTrophyProfileSummaryResponse,
} from "psn-api";

import type {
  ProfileSummary,
  RecentTitleSummary,
  TitleSearchResult,
  TrophyBrowserItem,
  TrophyCountsSummary,
} from "../shared/contracts.js";

const emptyCounts = (): TrophyCountsSummary => ({
  bronze: 0,
  silver: 0,
  gold: 0,
  platinum: 0,
  total: 0,
});

type RawTrophyCounts = {
  bronze?: number;
  silver?: number;
  gold?: number;
  platinum?: number;
};

export const normalizeCounts = (
  counts?: RawTrophyCounts | null,
): TrophyCountsSummary => {
  if (!counts) {
    return emptyCounts();
  }

  const bronze = Number(counts.bronze ?? 0);
  const silver = Number(counts.silver ?? 0);
  const gold = Number(counts.gold ?? 0);
  const platinum = Number(counts.platinum ?? 0);

  return {
    bronze,
    silver,
    gold,
    platinum,
    total: bronze + silver + gold + platinum,
  };
};

export const normalizeProfile = (
  summary: UserTrophyProfileSummaryResponse,
  profile?: ProfileFromAccountIdResponse | null,
): ProfileSummary => {
  const earnedCounts = normalizeCounts(summary.earnedTrophies);

  return {
    accountId: summary.accountId ?? null,
    onlineId: profile?.onlineId ?? null,
    avatarUrl: profile?.avatars?.[0]?.url ?? null,
    trophyLevel: Number(summary.trophyLevel ?? 0) || null,
    progressToNextLevel:
      typeof summary.progress === "number" ? summary.progress : null,
    tier: typeof summary.tier === "number" ? summary.tier : null,
    earnedCounts,
    totalEarnedCount: earnedCounts.total,
    completionPercentage: null,
  };
};

export const normalizeTitle = (title: TrophyTitle): RecentTitleSummary => {
  const earnedCounts = normalizeCounts(title.earnedTrophies);
  const definedCounts = normalizeCounts(title.definedTrophies);

  return {
    titleId: title.npCommunicationId,
    npCommunicationId: title.npCommunicationId,
    npServiceName: title.npServiceName,
    titleName: title.trophyTitleName,
    platform: String(title.trophyTitlePlatform),
    iconUrl: title.trophyTitleIconUrl,
    progress: typeof title.progress === "number" ? title.progress : null,
    earnedCounts,
    definedCounts,
    earnedTotal: earnedCounts.total,
    definedTotal: definedCounts.total,
    lastUpdated: title.lastUpdatedDateTime ?? null,
    hasTrophyGroups: title.hasTrophyGroups,
  };
};

export const normalizeTitleSearchResult = (
  title: RecentTitleSummary,
): TitleSearchResult => ({
  npCommunicationId: title.npCommunicationId,
  titleName: title.titleName,
  platform: title.platform,
  iconUrl: title.iconUrl,
  progress: title.progress,
  lastUpdated: title.lastUpdated,
});

export const normalizeTrophyBrowserItem = ({
  npCommunicationId,
  trophy,
  earned,
  groupName,
}: {
  npCommunicationId: string;
  trophy: TitleThinTrophy;
  earned?: UserThinTrophy | null;
  groupName?: string | null;
}): TrophyBrowserItem => ({
  npCommunicationId,
  trophyId: trophy.trophyId,
  trophyGroupId: trophy.trophyGroupId ?? "default",
  name: trophy.trophyName ?? null,
  description: trophy.trophyDetail ?? null,
  iconUrl: trophy.trophyIconUrl ?? null,
  grade: trophy.trophyType,
  earned: Boolean(earned?.earned),
  earnedAt: earned?.earnedDateTime ?? null,
  hidden: trophy.trophyHidden,
  groupName: groupName ?? null,
  trophyRare: typeof earned?.trophyRare === "number" ? earned.trophyRare : null,
  trophyEarnedRate:
    typeof earned?.trophyEarnedRate === "string" &&
      Number.isFinite(Number(earned.trophyEarnedRate))
      ? Number(earned.trophyEarnedRate)
      : null,
});
