import { createRequire } from "node:module";

import type {
  AuthTokensResponse,
  ProfileFromAccountIdResponse,
  TitleTrophiesResponse,
  TitleTrophyGroupsResponse,
  UserTitlesResponse,
  UserTrophiesEarnedForTitleResponse,
  UserTrophyProfileSummaryResponse,
} from "psn-api";

const require = createRequire(import.meta.url);
const psnApi = require("psn-api") as {
  exchangeAccessCodeForAuthTokens: (accessCode: string) => Promise<AuthTokensResponse>;
  exchangeNpssoForAccessCode: (npssoToken: string) => Promise<string>;
  exchangeRefreshTokenForAuthTokens: (
    refreshToken: string,
  ) => Promise<AuthTokensResponse>;
  getProfileFromAccountId: (
    authorization: AuthTokensResponse,
    accountId: string,
  ) => Promise<ProfileFromAccountIdResponse>;
  getUserTitles: (
    authorization: AuthTokensResponse,
    accountId: string,
    options?: { limit?: number; offset?: number },
  ) => Promise<UserTitlesResponse>;
  getUserTrophyProfileSummary: (
    authorization: AuthTokensResponse,
    accountId: string,
  ) => Promise<UserTrophyProfileSummaryResponse | { error: { message?: string } }>;
  getTitleTrophyGroups: (
    authorization: AuthTokensResponse,
    npCommunicationId: string,
    options?: { npServiceName?: string; headerOverrides?: Record<string, string> },
  ) => Promise<TitleTrophyGroupsResponse>;
  getTitleTrophies: (
    authorization: AuthTokensResponse,
    npCommunicationId: string,
    trophyGroupId: string,
    options?: {
      headerOverrides?: Record<string, string>;
      limit?: number;
      npServiceName?: string;
      offset?: number;
    },
  ) => Promise<TitleTrophiesResponse>;
  getUserTrophiesEarnedForTitle: (
    authorization: AuthTokensResponse,
    accountId: string,
    npCommunicationId: string,
    trophyGroupId: string,
    options?: {
      headerOverrides?: Record<string, string>;
      limit?: number;
      npServiceName?: string;
      offset?: number;
    },
  ) => Promise<UserTrophiesEarnedForTitleResponse>;
};

export const exchangeAccessCodeForAuthTokens =
  psnApi.exchangeAccessCodeForAuthTokens;
export const exchangeNpssoForAccessCode = psnApi.exchangeNpssoForAccessCode;
export const exchangeRefreshTokenForAuthTokens =
  psnApi.exchangeRefreshTokenForAuthTokens;
export const getProfileFromAccountId = psnApi.getProfileFromAccountId;
export const getUserTitles = psnApi.getUserTitles;
export const getUserTrophyProfileSummary = psnApi.getUserTrophyProfileSummary;
export const getTitleTrophyGroups = psnApi.getTitleTrophyGroups;
export const getTitleTrophies = psnApi.getTitleTrophies;
export const getUserTrophiesEarnedForTitle =
  psnApi.getUserTrophiesEarnedForTitle;
