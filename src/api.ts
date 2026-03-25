import type {
  ActiveGameSelection,
  HealthResponse,
  OverlayDataResponse,
  OverlaySettings,
  PsnTokenStatusResponse,
  TargetTrophySelection,
  TitleSearchResponse,
  TitleTrophiesResponse,
  UnearnedTrophiesResponse,
  TrophySummaryResponse,
  UpdatePsnTokenRequest,
  UpdateTargetTrophyRequest,
} from "../shared/contracts.js";

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
    },
    ...init,
  });

  const payload = (await response.json()) as T;

  if (!response.ok) {
    throw payload;
  }

  return payload;
}

export const api = {
  getHealth: () => requestJson<HealthResponse>("/api/health"),
  getPsnTokenStatus: () => requestJson<PsnTokenStatusResponse>("/api/psn-token"),
  savePsnToken: (token: string) =>
    requestJson<PsnTokenStatusResponse>("/api/psn-token", {
      method: "PUT",
      body: JSON.stringify({ token } satisfies UpdatePsnTokenRequest),
    }),
  clearPsnToken: () =>
    requestJson<PsnTokenStatusResponse>("/api/psn-token", {
      method: "DELETE",
    }),
  getSummary: () => requestJson<TrophySummaryResponse>("/api/trophies/summary"),
  searchTitles: (query: string, offset = 0, limit = 12) =>
    requestJson<TitleSearchResponse>(
      `/api/trophies/search?q=${encodeURIComponent(query)}&offset=${offset}&limit=${limit}`,
    ),
  getTitleTrophies: (npCommunicationId: string) =>
    requestJson<TitleTrophiesResponse>(`/api/trophies/title/${npCommunicationId}`),
  getUnearnedTrophies: () =>
    requestJson<UnearnedTrophiesResponse>("/api/trophies/unearned"),
  saveTargetTrophy: (target: UpdateTargetTrophyRequest) =>
    requestJson<TargetTrophySelection | null>("/api/target-trophy", {
      method: "PUT",
      body: JSON.stringify(target),
    }),
  getSettings: () => requestJson<OverlaySettings>("/api/settings"),
  saveSettings: (settings: OverlaySettings) =>
    requestJson<OverlaySettings>("/api/settings", {
      method: "PUT",
      body: JSON.stringify(settings),
    }),
  getActiveGame: () => requestJson<ActiveGameSelection>("/api/active-game"),
  saveActiveGame: (activeGame: ActiveGameSelection) =>
    requestJson<ActiveGameSelection>("/api/active-game", {
      method: "PUT",
      body: JSON.stringify(activeGame),
    }),
  getOverlayData: () => requestJson<OverlayDataResponse>("/api/overlay-data"),
};
