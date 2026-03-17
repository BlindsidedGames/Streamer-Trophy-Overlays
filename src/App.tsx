import { useDeferredValue, useEffect, useMemo, useState, type ReactNode } from "react";

import type {
  ActiveGameSelection,
  HealthResponse,
  OverlayDataResponse,
  OverlaySettings,
  PsnTokenStatusResponse,
  TargetTrophySelection,
  TitleSearchResponse,
  TitleSearchResult,
  TitleTrophiesResponse,
  TrophyBrowserItem,
  TrophySummaryResponse,
  UpdateTargetTrophyRequest,
} from "../shared/contracts.js";
import {
  createDefaultActiveGameSelection,
  createDefaultOverlaySettings,
} from "../shared/contracts.js";
import { api } from "./api.js";
import {
  CurrentGameOverlay,
  DashboardOverlayPreview,
  LoopOverlay,
  OverallOverlay,
  TargetTrophyOverlay,
} from "./components.js";

type ConnectionState = "loading" | "ready" | "error";

const trophyBrowserGradeIcon: Record<TrophyBrowserItem["grade"], string> = {
  platinum: "/img/40-platinum.png",
  gold: "/img/40-gold.png",
  silver: "/img/40-silver.png",
  bronze: "/img/40-bronze.png",
};

const defaultSummary: TrophySummaryResponse = {
  profile: null,
  titles: [],
  meta: {
    fetchedAt: "",
    cached: false,
    warnings: [],
    partial: false,
    source: "psn-api",
  },
};

const defaultOverlayData: OverlayDataResponse = {
  overall: null,
  currentGame: null,
  targetTrophy: null,
  display: {
    settings: createDefaultOverlaySettings(),
    loopOrder: ["overall", "currentGame"],
    lastRefreshAt: "",
  },
  meta: {
    fetchedAt: "",
    cached: false,
    warnings: [],
    partial: false,
  },
};

const defaultTitleTrophies: TitleTrophiesResponse = {
  title: null,
  trophies: [],
  target: null,
  meta: {
    fetchedAt: "",
    cached: false,
    warnings: [],
    partial: false,
  },
};

const defaultTitleSearch: TitleSearchResponse = {
  results: [],
  nextOffset: null,
  totalItemCount: 0,
};

const defaultPsnTokenStatus: PsnTokenStatusResponse = {
  configured: false,
  storage: "local-file",
  updatedAt: null,
};

const SEARCH_LIMIT = 12;
const TOKEN_REQUIRED_MESSAGE =
  "Paste a PSN token above to load titles and trophies.";

const resolveSelectedPsnTitleId = (
  nextActiveGame: ActiveGameSelection,
  nextSummary: TrophySummaryResponse,
) =>
  nextActiveGame.mode === "psn"
    ? nextActiveGame.selectedNpCommunicationId ?? nextSummary.titles[0]?.npCommunicationId ?? null
    : null;

const extractErrorMessage = (error: unknown, fallback: string) => {
  if (typeof error === "object" && error !== null) {
    if ("message" in error && typeof error.message === "string") {
      return error.message;
    }

    if (
      "error" in error &&
      typeof error.error === "object" &&
      error.error !== null &&
      "message" in error.error &&
      typeof error.error.message === "string"
    ) {
      return error.error.message;
    }
  }

  return fallback;
};

const toTargetRequest = (
  npCommunicationId: string,
  trophy: TrophyBrowserItem | null,
): UpdateTargetTrophyRequest => ({
  npCommunicationId,
  trophyId: trophy?.trophyId ?? null,
  trophyGroupId: trophy?.trophyGroupId ?? null,
});

const formatTimestamp = (value: string | null) => {
  if (!value) {
    return "Not saved";
  }

  return new Date(value).toLocaleString();
};

export function App() {
  const path = window.location.pathname;

  useEffect(() => {
    document.body.classList.toggle("overlay-body", path.startsWith("/overlay"));
    return () => document.body.classList.remove("overlay-body");
  }, [path]);

  if (path === "/overlay/loop") {
    return <LoopOverlay />;
  }

  if (path === "/overlay/overall") {
    return <OverallOverlay />;
  }

  if (path === "/overlay/current-game") {
    return <CurrentGameOverlay />;
  }

  if (path === "/overlay/target-trophy") {
    return <TargetTrophyOverlay />;
  }

  return <DashboardApp />;
}

function DashboardApp() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [psnTokenStatus, setPsnTokenStatus] =
    useState<PsnTokenStatusResponse>(defaultPsnTokenStatus);
  const [psnTokenInput, setPsnTokenInput] = useState("");
  const [psnTokenError, setPsnTokenError] = useState<string | null>(null);
  const [savingPsnToken, setSavingPsnToken] = useState(false);
  const [clearingPsnToken, setClearingPsnToken] = useState(false);
  const [summary, setSummary] = useState<TrophySummaryResponse>(defaultSummary);
  const [settings, setSettings] = useState<OverlaySettings>(createDefaultOverlaySettings());
  const [activeGame, setActiveGame] = useState<ActiveGameSelection>(
    createDefaultActiveGameSelection(),
  );
  const [overlayData, setOverlayData] = useState<OverlayDataResponse>(defaultOverlayData);
  const [titleTrophies, setTitleTrophies] =
    useState<TitleTrophiesResponse>(defaultTitleTrophies);
  const [titleTrophiesError, setTitleTrophiesError] = useState<string | null>(null);
  const [titleTrophiesLoading, setTitleTrophiesLoading] = useState(false);
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("loading");
  const [statusMessage, setStatusMessage] = useState("Loading");
  const [debugPayload, setDebugPayload] = useState<unknown>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const deferredSearchQuery = useDeferredValue(searchQuery.trim());
  const [titleSearch, setTitleSearch] = useState<TitleSearchResponse>(defaultTitleSearch);
  const [titleSearchLoading, setTitleSearchLoading] = useState(false);
  const [titleSearchError, setTitleSearchError] = useState<string | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);
  const [activeGamePendingId, setActiveGamePendingId] = useState<string | null>(null);
  const [targetPendingKey, setTargetPendingKey] = useState<string | null>(null);
  const [savingAdvancedGame, setSavingAdvancedGame] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);

  const overlayUrlBase = useMemo(() => window.location.origin, []);

  const fetchTitleTrophiesForGame = async (
    nextActiveGame: ActiveGameSelection,
    nextSummary: TrophySummaryResponse,
  ) => {
    const selectedTitleId = resolveSelectedPsnTitleId(nextActiveGame, nextSummary);

    if (!selectedTitleId) {
      return {
        response: defaultTitleTrophies,
        error:
          nextActiveGame.mode === "custom"
            ? "Trophy targeting is unavailable while custom mode is active."
            : !psnTokenStatus.configured
              ? TOKEN_REQUIRED_MESSAGE
              : null,
      };
    }

    try {
      return {
        response: await api.getTitleTrophies(selectedTitleId),
        error: null,
      };
    } catch (error) {
      return {
        response: defaultTitleTrophies,
        error: extractErrorMessage(error, "Unable to load trophies for the selected title."),
      };
    }
  };

  const loadTitleTrophiesForGame = async (
    nextActiveGame: ActiveGameSelection,
    nextSummary: TrophySummaryResponse,
  ) => {
    setTitleTrophiesLoading(true);

    try {
      const nextState = await fetchTitleTrophiesForGame(nextActiveGame, nextSummary);
      setTitleTrophies(nextState.response);
      setTitleTrophiesError(nextState.error);
    } finally {
      setTitleTrophiesLoading(false);
    }
  };

  const load = async (nextStatusMessage = "Refreshing") => {
    setConnectionState("loading");
    setStatusMessage(nextStatusMessage);

    try {
      const [
        nextTokenStatusResult,
        nextHealthResult,
        nextSummaryResult,
        nextSettingsResult,
        nextActiveGameResult,
        nextOverlayDataResult,
      ] = await Promise.allSettled([
        api.getPsnTokenStatus(),
        api.getHealth(),
        api.getSummary(),
        api.getSettings(),
        api.getActiveGame(),
        api.getOverlayData(),
      ]);

      const nextTokenStatus =
        nextTokenStatusResult.status === "fulfilled"
          ? nextTokenStatusResult.value
          : defaultPsnTokenStatus;
      const nextHealth =
        nextHealthResult.status === "fulfilled" ? nextHealthResult.value : null;
      const nextSummary =
        nextSummaryResult.status === "fulfilled"
          ? nextSummaryResult.value
          : defaultSummary;
      const nextSettings =
        nextSettingsResult.status === "fulfilled"
          ? nextSettingsResult.value
          : createDefaultOverlaySettings();
      const nextActiveGame =
        nextActiveGameResult.status === "fulfilled"
          ? nextActiveGameResult.value
          : createDefaultActiveGameSelection();
      const nextOverlayData =
        nextOverlayDataResult.status === "fulfilled"
          ? nextOverlayDataResult.value
          : defaultOverlayData;

      setPsnTokenStatus(nextTokenStatus);
      setHealth(nextHealth);
      setSummary(nextSummary);
      setSettings(nextSettings);
      setActiveGame(nextActiveGame);
      setOverlayData(nextOverlayData);

      let titleTrophyState = {
        response: defaultTitleTrophies,
        error: nextTokenStatus.configured ? null : TOKEN_REQUIRED_MESSAGE,
      };

      if (nextSummaryResult.status === "fulfilled") {
        setTitleTrophiesLoading(true);
        titleTrophyState = await fetchTitleTrophiesForGame(nextActiveGame, nextSummary);
        setTitleTrophiesLoading(false);
      }

      setTitleTrophies(titleTrophyState.response);
      setTitleTrophiesError(titleTrophyState.error);
      setDebugPayload({
        tokenStatus:
          nextTokenStatusResult.status === "fulfilled"
            ? nextTokenStatusResult.value
            : nextTokenStatusResult.reason,
        health:
          nextHealthResult.status === "fulfilled"
            ? nextHealthResult.value
            : nextHealthResult.reason,
        summary:
          nextSummaryResult.status === "fulfilled"
            ? nextSummaryResult.value
            : nextSummaryResult.reason,
        settings:
          nextSettingsResult.status === "fulfilled"
            ? nextSettingsResult.value
            : nextSettingsResult.reason,
        activeGame:
          nextActiveGameResult.status === "fulfilled"
            ? nextActiveGameResult.value
            : nextActiveGameResult.reason,
        overlayData:
          nextOverlayDataResult.status === "fulfilled"
            ? nextOverlayDataResult.value
            : nextOverlayDataResult.reason,
        titleTrophies: titleTrophyState,
      });

      if (!nextTokenStatus.configured) {
        setConnectionState("error");
        setStatusMessage("Token required");
        return;
      }

      if (
        nextHealthResult.status === "rejected" ||
        nextSummaryResult.status === "rejected" ||
        nextSettingsResult.status === "rejected" ||
        nextActiveGameResult.status === "rejected" ||
        nextOverlayDataResult.status === "rejected" ||
        (nextActiveGame.mode === "psn" && titleTrophyState.error)
      ) {
        const firstError =
          (nextSummaryResult.status === "rejected" && nextSummaryResult.reason) ||
          (nextOverlayDataResult.status === "rejected" && nextOverlayDataResult.reason) ||
          (nextHealthResult.status === "rejected" && nextHealthResult.reason) ||
          (nextSettingsResult.status === "rejected" && nextSettingsResult.reason) ||
          (nextActiveGameResult.status === "rejected" && nextActiveGameResult.reason);
        setConnectionState("error");
        setStatusMessage(
          extractErrorMessage(firstError, titleTrophyState.error ?? "Unable to load PSN data."),
        );
        return;
      }

      setConnectionState("ready");
      setStatusMessage("Connected");
    } catch (error) {
      setDebugPayload(error);
      setConnectionState("error");
      setStatusMessage("Error");
      setTitleTrophiesLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (deferredSearchQuery.length < 2) {
      setTitleSearch(defaultTitleSearch);
      setTitleSearchError(null);
      setTitleSearchLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setTitleSearchLoading(true);
    setTitleSearchError(null);

    api.searchTitles(deferredSearchQuery, 0, SEARCH_LIMIT)
      .then((nextSearch) => {
        if (cancelled) {
          return;
        }

        setTitleSearch(nextSearch);
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        setTitleSearch(defaultTitleSearch);
        setTitleSearchError(
          extractErrorMessage(error, "Unable to search the trophy history."),
        );
      })
      .finally(() => {
        if (!cancelled) {
          setTitleSearchLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [deferredSearchQuery]);

  const selectedPsnTitleId = resolveSelectedPsnTitleId(activeGame, summary);
  const selectedPsnTitle = useMemo(() => {
    if (!selectedPsnTitleId) {
      return null;
    }

    return (
      summary.titles.find((title) => title.npCommunicationId === selectedPsnTitleId) ??
      (titleTrophies.title?.npCommunicationId === selectedPsnTitleId
        ? titleTrophies.title
        : null)
    );
  }, [selectedPsnTitleId, summary.titles, titleTrophies.title]);

  const selectedTitleOutsideRecent = Boolean(
    selectedPsnTitle &&
      !summary.titles.some(
        (title) => title.npCommunicationId === selectedPsnTitle.npCommunicationId,
      ),
  );

  const currentTargetSelectionKey = titleTrophies.target
    ? `${titleTrophies.target.trophyGroupId}:${titleTrophies.target.trophyId}`
    : null;
  const currentTargetTrophy = useMemo(
    () =>
      titleTrophies.target
        ? titleTrophies.trophies.find(
            (trophy) =>
              trophy.trophyId === titleTrophies.target?.trophyId &&
              trophy.trophyGroupId === titleTrophies.target?.trophyGroupId,
          ) ?? null
        : null,
    [titleTrophies.target, titleTrophies.trophies],
  );
  const trophyBrowserEntries = useMemo(
    () =>
      titleTrophies.trophies.filter((trophy) => {
        const trophyKey = `${trophy.trophyGroupId}:${trophy.trophyId}`;
        return trophyKey !== currentTargetSelectionKey;
      }),
    [currentTargetSelectionKey, titleTrophies.trophies],
  );
  const unearnedTrophies = useMemo(
    () => trophyBrowserEntries.filter((trophy) => !trophy.earned),
    [trophyBrowserEntries],
  );
  const earnedTrophies = useMemo(
    () => trophyBrowserEntries.filter((trophy) => trophy.earned),
    [trophyBrowserEntries],
  );
  const psnTokenStatusLabel = psnTokenStatus.configured ? "Saved locally" : "No token saved";
  const psnTokenUpdatedLabel = useMemo(
    () => formatTimestamp(psnTokenStatus.updatedAt),
    [psnTokenStatus.updatedAt],
  );

  const saveSettings = async () => {
    setSavingSettings(true);
    setStatusMessage("Saving display settings");

    try {
      const nextSettings = await api.saveSettings(settings);
      setSettings(nextSettings);
      const nextOverlayData = await api.getOverlayData();
      setOverlayData(nextOverlayData);
      setStatusMessage("Display settings saved");
    } catch (error) {
      setStatusMessage("Display settings failed");
      setDebugPayload(error);
    } finally {
      setSavingSettings(false);
    }
  };

  const selectTitle = async (title: { npCommunicationId: string; titleName: string }) => {
    if (
      activeGame.mode === "psn" &&
      activeGame.selectedNpCommunicationId === title.npCommunicationId
    ) {
      return;
    }

    const previousActiveGame = activeGame;
    const previousTitleTrophies = titleTrophies;
    const nextActiveGame = {
      ...activeGame,
      mode: "psn" as const,
      selectedNpCommunicationId: title.npCommunicationId,
    };

    setActiveGame(nextActiveGame);
    setActiveGamePendingId(title.npCommunicationId);
    setTitleTrophiesLoading(true);
    setTitleTrophies(defaultTitleTrophies);
    setTitleTrophiesError(null);
    setStatusMessage(`Switching to ${title.titleName}`);

    try {
      const persistedActiveGame = await api.saveActiveGame(nextActiveGame);
      const [nextSummary, nextOverlayData, nextTitleTrophies] = await Promise.all([
        api.getSummary(),
        api.getOverlayData(),
        api.getTitleTrophies(title.npCommunicationId),
      ]);
      setActiveGame(persistedActiveGame);
      setSummary(nextSummary);
      setOverlayData(nextOverlayData);
      setTitleTrophies(nextTitleTrophies);
      setTitleTrophiesError(null);
      setStatusMessage("Active game updated");
      setSearchQuery("");
      setTitleSearch(defaultTitleSearch);
    } catch (error) {
      setActiveGame(previousActiveGame);
      setTitleTrophies(previousTitleTrophies);
      setTitleTrophiesError(
        extractErrorMessage(error, "Unable to switch the active game."),
      );
      setStatusMessage("Active game update failed");
      setDebugPayload(error);
    } finally {
      setTitleTrophiesLoading(false);
      setActiveGamePendingId(null);
    }
  };

  const saveAdvancedGame = async () => {
    setSavingAdvancedGame(true);
    setStatusMessage(
      activeGame.mode === "custom" ? "Saving custom game" : "Saving advanced overrides",
    );

    try {
      const nextActiveGame = await api.saveActiveGame(activeGame);
      const [nextSummary, nextOverlayData] = await Promise.all([
        api.getSummary(),
        api.getOverlayData(),
      ]);
      setActiveGame(nextActiveGame);
      setSummary(nextSummary);
      setOverlayData(nextOverlayData);
      await loadTitleTrophiesForGame(nextActiveGame, nextSummary);
      setStatusMessage("Advanced overrides saved");
      setAdvancedOpen(false);
    } catch (error) {
      setStatusMessage("Advanced overrides failed");
      setDebugPayload(error);
    } finally {
      setSavingAdvancedGame(false);
    }
  };

  const updateTargetTrophy = async (trophy: TrophyBrowserItem | null) => {
    if (!selectedPsnTitleId) {
      return;
    }

    const previousTarget = titleTrophies.target;
    const request = toTargetRequest(selectedPsnTitleId, trophy);
    const nextTargetKey =
      trophy == null ? "clear" : `${trophy.trophyGroupId}:${trophy.trophyId}`;

    setTargetPendingKey(nextTargetKey);
    setTitleTrophies((current) => ({
      ...current,
      target:
        trophy == null
          ? null
          : {
              npCommunicationId: selectedPsnTitleId,
              trophyId: trophy.trophyId,
              trophyGroupId: trophy.trophyGroupId,
              updatedAt: new Date().toISOString(),
            },
    }));
    setStatusMessage(trophy ? "Updating current trophy" : "Clearing current trophy");

    try {
      await api.saveTargetTrophy(request);
      const [nextOverlayData, nextTitleTrophies] = await Promise.all([
        api.getOverlayData(),
        api.getTitleTrophies(selectedPsnTitleId),
      ]);
      setOverlayData(nextOverlayData);
      setTitleTrophies(nextTitleTrophies);
      setStatusMessage(trophy ? "Current trophy updated" : "Current trophy cleared");
    } catch (error) {
      setTitleTrophies((current) => ({
        ...current,
        target: previousTarget,
      }));
      setStatusMessage("Current trophy update failed");
      setDebugPayload(error);
    } finally {
      setTargetPendingKey(null);
    }
  };

  const savePsnToken = async () => {
    setSavingPsnToken(true);
    setPsnTokenError(null);
    setStatusMessage("Saving PSN token");

    try {
      const nextTokenStatus = await api.savePsnToken(psnTokenInput);
      setPsnTokenStatus(nextTokenStatus);
      setPsnTokenInput("");
      await load("Refreshing after token save");
    } catch (error) {
      setPsnTokenError(
        extractErrorMessage(error, "Unable to save the PSN token locally."),
      );
      setStatusMessage("PSN token save failed");
      setDebugPayload(error);
    } finally {
      setSavingPsnToken(false);
    }
  };

  const clearPsnToken = async () => {
    setClearingPsnToken(true);
    setPsnTokenError(null);
    setStatusMessage("Clearing PSN token");

    try {
      const nextTokenStatus = await api.clearPsnToken();
      setPsnTokenStatus(nextTokenStatus);
      setPsnTokenInput("");
      await load("Refreshing after token clear");
    } catch (error) {
      setPsnTokenError(
        extractErrorMessage(error, "Unable to clear the saved PSN token."),
      );
      setStatusMessage("PSN token clear failed");
      setDebugPayload(error);
    } finally {
      setClearingPsnToken(false);
    }
  };

  const loadMoreSearchResults = async () => {
    if (!deferredSearchQuery || titleSearch.nextOffset == null) {
      return;
    }

    setTitleSearchLoading(true);

    try {
      const nextPage = await api.searchTitles(
        deferredSearchQuery,
        titleSearch.nextOffset,
        SEARCH_LIMIT,
      );
      setTitleSearch((current) => ({
        results: [...current.results, ...nextPage.results],
        nextOffset: nextPage.nextOffset,
        totalItemCount: nextPage.totalItemCount,
      }));
    } catch (error) {
      setTitleSearchError(
        extractErrorMessage(error, "Unable to load more search results."),
      );
    } finally {
      setTitleSearchLoading(false);
    }
  };

  return (
    <div className="dashboard-shell">
      <header className="hero-card">
        <div>
          <p className="eyebrow">Streamer Tools</p>
          <h1>PSN Trophy Control Room</h1>
          <p className="hero-copy">
            Pick the active game visually, browse its trophies, and pin the one
            you want on stream without dropping into the override form by
            default.
          </p>
        </div>
        <div className={`status-pill status-${connectionState}`}>{statusMessage}</div>
      </header>

      <section className="panel token-panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">PSN Access</p>
            <h2>Local token storage</h2>
          </div>
          <span className="panel-tag">{psnTokenStatusLabel}</span>
        </div>

        <div className="token-panel-grid">
          <label className="field token-field">
            <span>PSN token</span>
            <input
              type="password"
              autoComplete="off"
              placeholder="Paste your NPSSO token"
              value={psnTokenInput}
              onChange={(event) => setPsnTokenInput(event.target.value)}
            />
          </label>

          <div className="token-actions">
            <button
              className="action-button"
              disabled={savingPsnToken || clearingPsnToken || psnTokenInput.trim().length === 0}
              onClick={() => void savePsnToken()}
            >
              {savingPsnToken ? "Saving…" : "Save token"}
            </button>
            <button
              className="ghost-button"
              disabled={savingPsnToken || clearingPsnToken || !psnTokenStatus.configured}
              onClick={() => void clearPsnToken()}
            >
              {clearingPsnToken ? "Clearing…" : "Clear token"}
            </button>
          </div>
        </div>

        <dl className="runtime-grid token-status-grid">
          <div>
            <dt>Status</dt>
            <dd>{psnTokenStatusLabel}</dd>
          </div>
          <div>
            <dt>Storage</dt>
            <dd>{psnTokenStatus.storage}</dd>
          </div>
          <div>
            <dt>Updated</dt>
            <dd>{psnTokenUpdatedLabel}</dd>
          </div>
        </dl>

        <p className="panel-footnote">
          Stored only on this machine in <code>~/.streamer-tools/psn-credentials.json</code>.
          The saved token is never returned to this page.
        </p>
        {psnTokenError ? <p className="panel-error">{psnTokenError}</p> : null}
      </section>

      <section className="panel-grid dashboard-top-grid">
        <article className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Connection</p>
              <h2>Runtime and routes</h2>
            </div>
            <button className="action-button" onClick={() => void load()}>
              Refresh all
            </button>
          </div>

          <dl className="runtime-grid">
            <div>
              <dt>Source</dt>
              <dd>{health?.source ?? "psn-api"}</dd>
            </div>
            <div>
              <dt>Configured</dt>
              <dd>{health?.configured ? "Yes" : "No"}</dd>
            </div>
            <div>
              <dt>Fetched</dt>
              <dd>{summary.meta.fetchedAt || "Not yet loaded"}</dd>
            </div>
            <div>
              <dt>Warnings</dt>
              <dd>{summary.meta.warnings.length}</dd>
            </div>
          </dl>

          <div className="route-list">
            <span>{overlayUrlBase}/overlay/loop</span>
            <span>{overlayUrlBase}/overlay/overall</span>
            <span>{overlayUrlBase}/overlay/current-game</span>
            <span>{overlayUrlBase}/overlay/target-trophy</span>
          </div>
        </article>

        <article className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Display Settings</p>
              <h2>Loop timing and visibility</h2>
            </div>
            <button
              className="action-button"
              disabled={savingSettings}
              onClick={() => void saveSettings()}
            >
              {savingSettings ? "Saving…" : "Save settings"}
            </button>
          </div>

          <div className="editor-grid">
            <NumberField
              label="Overall duration (ms)"
              value={settings.overallDurationMs}
              onChange={(value) =>
                setSettings((current) => ({
                  ...current,
                  overallDurationMs: value ?? current.overallDurationMs,
                }))
              }
            />
            <NumberField
              label="Current game duration (ms)"
              value={settings.currentGameDurationMs}
              onChange={(value) =>
                setSettings((current) => ({
                  ...current,
                  currentGameDurationMs: value ?? current.currentGameDurationMs,
                }))
              }
            />
            <NumberField
              label="Target trophy duration (ms)"
              value={settings.targetTrophyDurationMs}
              onChange={(value) =>
                setSettings((current) => ({
                  ...current,
                  targetTrophyDurationMs: value ?? current.targetTrophyDurationMs,
                }))
              }
            />
            <TextField
              label="Target trophy tag text"
              value={settings.targetTrophyTagText}
              onChange={(value) =>
                setSettings((current) => ({
                  ...current,
                  targetTrophyTagText: value,
                }))
              }
            />
          </div>

          <div className="toggle-grid settings-toggle-grid">
            <ToggleField
              label="Show grade rows"
              checked={settings.showGradeRows}
              onChange={(checked) =>
                setSettings((current) => ({ ...current, showGradeRows: checked }))
              }
            />
            <ToggleField
              label="Show overall completion"
              checked={settings.showOverallCompletion}
              onChange={(checked) =>
                setSettings((current) => ({
                  ...current,
                  showOverallCompletion: checked,
                }))
              }
            />
            <ToggleField
              label="Show current completion"
              checked={settings.showCurrentCompletion}
              onChange={(checked) =>
                setSettings((current) => ({
                  ...current,
                  showCurrentCompletion: checked,
                }))
              }
            />
            <ToggleField
              label="Show current totals"
              checked={settings.showCurrentTotals}
              onChange={(checked) =>
                setSettings((current) => ({ ...current, showCurrentTotals: checked }))
              }
            />
            <ToggleField
              label="Show target trophy in loop"
              checked={settings.showTargetTrophyInLoop}
              onChange={(checked) =>
                setSettings((current) => ({
                  ...current,
                  showTargetTrophyInLoop: checked,
                }))
              }
            />
            <ToggleField
              label="Show target trophy tag"
              checked={settings.showTargetTrophyTag}
              onChange={(checked) =>
                setSettings((current) => ({
                  ...current,
                  showTargetTrophyTag: checked,
                }))
              }
            />
          </div>
        </article>
      </section>

      <section className="panel live-preview-panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Live Preview</p>
            <h2>HUD and target trophy</h2>
          </div>
        </div>

        <div className="live-preview-grid">
          <article className="preview-card">
            <p className="section-caption">Target trophy</p>
            <DashboardOverlayPreview
              overlayData={overlayData}
              mode="targetTrophy"
              settingsOverride={settings}
            />
          </article>
          <article className="preview-card">
            <p className="section-caption">Main HUD</p>
            <DashboardOverlayPreview
              overlayData={overlayData}
              mode="currentGame"
              settingsOverride={settings}
            />
          </article>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Active Game Selection</p>
            <h2>Recent titles and older-title search</h2>
          </div>
          <div className="panel-header-actions">
            {activeGame.mode === "custom" ? (
              <span className="panel-tag">Custom mode active</span>
            ) : null}
            <button
              className="ghost-button"
              onClick={() => {
                setAdvancedOpen(true);
                setActiveGame((current) => ({ ...current, mode: "custom" }));
              }}
            >
              Use custom game
            </button>
          </div>
        </div>

        <div className="search-toolbar">
          <label className="field search-field">
            <span>Search older PSN titles</span>
            <input
              type="search"
              placeholder="Start typing a title name"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
          </label>
        </div>

        {selectedTitleOutsideRecent && selectedPsnTitle ? (
          <div className="selected-library-wrap">
            <p className="section-caption">Selected from library</p>
            <TitlePickerCard
              title={selectedPsnTitle}
              active
              pending={activeGamePendingId === selectedPsnTitle.npCommunicationId}
              onSelect={() => void selectTitle(selectedPsnTitle)}
            />
          </div>
        ) : null}

        <div className="title-picker-grid">
          {summary.titles.map((title) => (
            <TitlePickerCard
              key={title.npCommunicationId}
              title={title}
              active={
                activeGame.mode === "psn" &&
                selectedPsnTitleId === title.npCommunicationId
              }
              pending={activeGamePendingId === title.npCommunicationId}
              onSelect={() => void selectTitle(title)}
            />
          ))}
        </div>

        {deferredSearchQuery.length >= 2 ? (
          <div className="search-results-panel">
            <div className="search-results-header">
              <p className="section-caption">
                Search results
                {titleSearch.totalItemCount > 0
                  ? ` (${titleSearch.totalItemCount})`
                  : ""}
              </p>
            </div>

            {titleSearchLoading && titleSearch.results.length === 0 ? (
              <p className="panel-empty">Searching trophy history…</p>
            ) : null}
            {titleSearchError ? <p className="panel-error">{titleSearchError}</p> : null}
            {!titleSearchLoading &&
            !titleSearchError &&
            titleSearch.results.length === 0 ? (
              <p className="panel-empty">
                No titles matched that search. Your current selection stays as-is.
              </p>
            ) : null}
            <div className="search-results-grid">
              {titleSearch.results.map((title) => (
                <SearchResultCard
                  key={`search-${title.npCommunicationId}`}
                  title={title}
                  active={
                    activeGame.mode === "psn" &&
                    selectedPsnTitleId === title.npCommunicationId
                  }
                  pending={activeGamePendingId === title.npCommunicationId}
                  onSelect={() => void selectTitle(title)}
                />
              ))}
            </div>

            {titleSearch.nextOffset != null ? (
              <button
                className="ghost-button"
                disabled={titleSearchLoading}
                onClick={() => void loadMoreSearchResults()}
              >
                {titleSearchLoading ? "Loading…" : "Load more"}
              </button>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Trophy Browser</p>
            <h2>{selectedPsnTitle?.titleName ?? "Select a PSN title"}</h2>
          </div>
          {currentTargetSelectionKey ? (
            <button
              className="ghost-button"
              disabled={targetPendingKey === "clear"}
              onClick={() => void updateTargetTrophy(null)}
            >
              Clear target
            </button>
          ) : null}
        </div>

        {activeGame.mode === "custom" ? (
          <p className="panel-empty">
            Switch back to a PSN title to browse and target trophies.
          </p>
        ) : titleTrophiesLoading ? (
          <p className="panel-empty">Loading trophies…</p>
        ) : titleTrophiesError ? (
          <p className="panel-error">{titleTrophiesError}</p>
        ) : titleTrophies.trophies.length === 0 ? (
          <p className="panel-empty">
            No trophies are available for the selected title.
          </p>
        ) : (
          <div className="trophy-list">
            {currentTargetTrophy ? (
              <div className="trophy-pinned">
                <p className="section-caption">Pinned target</p>
                <TrophyRow
                  trophy={currentTargetTrophy}
                  active
                  pending={targetPendingKey === currentTargetSelectionKey}
                  onSelect={() => void updateTargetTrophy(currentTargetTrophy)}
                />
              </div>
            ) : null}

            {unearnedTrophies.length > 0 ? (
              <div className="trophy-section">
                <p className="section-caption">Unearned trophies</p>
                {unearnedTrophies.map((trophy) => {
                  const trophyKey = `${trophy.trophyGroupId}:${trophy.trophyId}`;
                  return (
                    <TrophyRow
                      key={trophyKey}
                      trophy={trophy}
                      active={currentTargetSelectionKey === trophyKey}
                      pending={targetPendingKey === trophyKey}
                      onSelect={() => void updateTargetTrophy(trophy)}
                    />
                  );
                })}
              </div>
            ) : null}

            {earnedTrophies.length > 0 ? (
              <div className="trophy-section">
                <p className="section-caption">Earned trophies</p>
                {earnedTrophies.map((trophy) => {
                  const trophyKey = `${trophy.trophyGroupId}:${trophy.trophyId}`;
                  return (
                    <TrophyRow
                      key={trophyKey}
                      trophy={trophy}
                      active={currentTargetSelectionKey === trophyKey}
                      pending={targetPendingKey === trophyKey}
                      onSelect={() => void updateTargetTrophy(trophy)}
                    />
                  );
                })}
              </div>
            ) : null}
          </div>
        )}
      </section>

      <CollapsibleSection
        eyebrow="Advanced Overrides"
        title="Custom mode and manual edits"
        open={advancedOpen}
        onToggle={() => setAdvancedOpen((current) => !current)}
      >
        <div className="advanced-mode-actions">
          <button
            className={`ghost-button ${activeGame.mode === "psn" ? "is-active" : ""}`}
            onClick={() =>
              setActiveGame((current) => ({
                ...current,
                mode: "psn",
                selectedNpCommunicationId:
                  current.selectedNpCommunicationId ?? summary.titles[0]?.npCommunicationId ?? null,
              }))
            }
          >
            Use PSN title
          </button>
          <button
            className={`ghost-button ${activeGame.mode === "custom" ? "is-active" : ""}`}
            onClick={() =>
              setActiveGame((current) => ({
                ...current,
                mode: "custom",
              }))
            }
          >
            Use custom game
          </button>
        </div>

        <div className="editor-grid">
          <TextField
            label="Title override"
            value={activeGame.override.titleName ?? ""}
            onChange={(value) =>
              setActiveGame((current) => ({
                ...current,
                override: {
                  ...current.override,
                  titleName: value || null,
                },
              }))
            }
          />
          <TextField
            label="Icon URL override"
            value={activeGame.override.iconUrl ?? ""}
            onChange={(value) =>
              setActiveGame((current) => ({
                ...current,
                override: {
                  ...current.override,
                  iconUrl: value || null,
                },
              }))
            }
          />
          <TextField
            label="Platform override"
            value={activeGame.override.platform ?? ""}
            onChange={(value) =>
              setActiveGame((current) => ({
                ...current,
                override: {
                  ...current.override,
                  platform: value || null,
                },
              }))
            }
          />
          <NumberField
            label="Completion % override"
            value={activeGame.override.completionPercentage}
            onChange={(value) =>
              setActiveGame((current) => ({
                ...current,
                override: {
                  ...current.override,
                  completionPercentage: value,
                },
              }))
            }
          />
        </div>

        <div className="counts-editor">
          {(["platinum", "gold", "silver", "bronze"] as const).map((grade) => (
            <div className="count-editor-card" key={grade}>
              <h3>{grade}</h3>
              <NumberField
                label="Earned override"
                value={activeGame.override.earnedCounts[grade]}
                onChange={(value) =>
                  setActiveGame((current) => ({
                    ...current,
                    override: {
                      ...current.override,
                      earnedCounts: {
                        ...current.override.earnedCounts,
                        [grade]: value,
                      },
                    },
                  }))
                }
              />
              <NumberField
                label="Total override"
                value={activeGame.override.definedCounts[grade]}
                onChange={(value) =>
                  setActiveGame((current) => ({
                    ...current,
                    override: {
                      ...current.override,
                      definedCounts: {
                        ...current.override.definedCounts,
                        [grade]: value,
                      },
                    },
                  }))
                }
              />
            </div>
          ))}
        </div>

        <button
          className="action-button"
          disabled={savingAdvancedGame}
          onClick={() => void saveAdvancedGame()}
        >
          {savingAdvancedGame ? "Saving…" : "Save advanced overrides"}
        </button>
      </CollapsibleSection>

      <CollapsibleSection
        eyebrow="Debug"
        title="Raw payload"
        open={debugOpen}
        onToggle={() => setDebugOpen((current) => !current)}
      >
        <pre className="debug-panel">{JSON.stringify(debugPayload, null, 2)}</pre>
      </CollapsibleSection>
    </div>
  );
}

function CollapsibleSection({
  eyebrow,
  title,
  open,
  onToggle,
  children,
}: {
  eyebrow: string;
  title: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className="panel collapsible-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
        </div>
        <button className="ghost-button" onClick={onToggle}>
          {open ? "Hide" : "Show"}
        </button>
      </div>

      {open ? <div className="collapsible-body">{children}</div> : null}
    </section>
  );
}

function TitlePickerCard({
  title,
  active,
  pending,
  onSelect,
}: {
  title: TitleSearchResult | TitleTrophiesResponse["title"];
  active: boolean;
  pending: boolean;
  onSelect: () => void;
}) {
  if (!title) {
    return null;
  }

  return (
    <button
      type="button"
      className={`title-card title-picker-card ${active ? "title-card-active" : ""}`}
      onClick={onSelect}
      disabled={pending}
    >
      <img className="title-icon" src={title.iconUrl} alt="" />
      <div className="title-body">
        <div className="title-topline">
          <h3>{title.titleName}</h3>
          <span>{title.platform}</span>
        </div>
        <div className="title-stats">
          <span>{title.progress ?? 0}% complete</span>
        </div>
      </div>
      {active ? <span className="title-card-badge">Active</span> : null}
    </button>
  );
}

function SearchResultCard({
  title,
  active,
  pending,
  onSelect,
}: {
  title: TitleSearchResult;
  active: boolean;
  pending: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={`search-result-card ${active ? "search-result-card-active" : ""}`}
      onClick={onSelect}
      disabled={pending}
    >
      <img className="search-result-icon" src={title.iconUrl} alt="" />
      <div>
        <h3>{title.titleName}</h3>
        <p>
          {title.platform} · {title.progress ?? 0}% complete
        </p>
      </div>
    </button>
  );
}

function TrophyRow({
  trophy,
  active,
  pending,
  onSelect,
}: {
  trophy: TrophyBrowserItem;
  active: boolean;
  pending: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={`trophy-row ${active ? "trophy-row-active" : ""} ${
        trophy.earned ? "trophy-row-earned" : ""
      }`}
      onClick={onSelect}
      disabled={pending}
    >
      {trophy.iconUrl ? (
        <img className="trophy-row-icon" src={trophy.iconUrl} alt="" />
      ) : (
        <div className="trophy-row-icon trophy-row-icon-placeholder" aria-hidden="true" />
      )}
      <div className="trophy-row-copy">
        <div className="trophy-row-head">
          <div className="trophy-row-title">
            <img
              className="trophy-row-grade-icon"
              src={trophyBrowserGradeIcon[trophy.grade]}
              alt=""
            />
            <h3>{trophy.name ?? "Unnamed trophy"}</h3>
          </div>
          <span
            className={`trophy-chip trophy-chip-status ${
              trophy.earned ? "trophy-chip-earned" : "trophy-chip-unearned"
            }`}
          >
            {trophy.earned ? "Earned" : "Unearned"}
          </span>
        </div>
        <p>{trophy.description ?? "No trophy description is available."}</p>
      </div>
    </button>
  );
}

function TextField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="number"
        value={value ?? ""}
        onChange={(event) =>
          onChange(event.target.value === "" ? null : Number(event.target.value))
        }
      />
    </label>
  );
}

function ToggleField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="toggle-field">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}
