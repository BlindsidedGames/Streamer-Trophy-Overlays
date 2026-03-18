import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type ReactNode,
} from "react";

import type {
  ActiveGameSelection,
  OverlayAnchor,
  OverlayDataResponse,
  OverlaySettings,
  PsnTokenStatusResponse,
  TargetTrophySelection,
  TitleSearchResponse,
  TitleSearchResult,
  StripZoneKey,
  TitleTrophiesResponse,
  TrophyBrowserItem,
  TrophySummaryResponse,
  UpdateTargetTrophyRequest,
} from "../shared/contracts.js";
import {
  createDefaultActiveGameSelection,
  createDefaultOverlaySettings,
  overlayAnchorOptions,
} from "../shared/contracts.js";
import { api } from "./api.js";
import {
  CurrentGameOverlay,
  EmbeddedOverlayPreview,
  LoopOverlay,
  OverallOverlay,
  TargetTrophyOverlay,
} from "./components.js";

type ConnectionState = "loading" | "ready" | "error";
type PsnAccessIssue = "missing" | "invalid" | null;
type WorkspaceTab = "setup" | "games" | "trophies";
type DesktopWindowControls = NonNullable<typeof window.streamerToolsDesktop>["windowControls"];

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
  "Open PSN access to save a token before loading titles and trophies.";
const PSN_TOKEN_URL = "https://ca.account.sony.com/api/v1/ssocookie";
const SETTINGS_SAVE_DEBOUNCE_MS = 400;
const ROUTE_COPY_FEEDBACK_MS = 1600;
const stripZoneLabels: Record<StripZoneKey, string> = {
  artwork: "Artwork",
  identity: "Title and platform",
  metrics: "Progress and earned totals",
  trophies: "Trophy counts",
  targetInfo: "Target info",
};
const overlayAnchorLabels: Record<OverlayAnchor, string> = {
  "top-left": "Top-left",
  "top-right": "Top-right",
  "bottom-left": "Bottom-left",
  "bottom-right": "Bottom-right",
};

const copyText = async (value: string) => {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // Fall back to the legacy copy path when clipboard access is unavailable.
  }

  const selection = window.getSelection();
  const ranges =
    selection == null
      ? []
      : Array.from({ length: selection.rangeCount }, (_, index) => selection.getRangeAt(index));
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";

  document.body.append(textarea);
  textarea.focus();
  textarea.select();

  const copied = typeof document.execCommand === "function"
    ? document.execCommand("copy")
    : false;

  document.body.removeChild(textarea);
  selection?.removeAllRanges();
  ranges.forEach((range) => selection?.addRange(range));

  return copied;
};

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

const extractErrorType = (error: unknown) => {
  if (typeof error === "object" && error !== null) {
    if ("type" in error && typeof error.type === "string") {
      return error.type;
    }

    if (
      "error" in error &&
      typeof error.error === "object" &&
      error.error !== null &&
      "type" in error.error &&
      typeof error.error.type === "string"
    ) {
      return error.error.type;
    }
  }

  return null;
};

const resolvePsnAccessIssue = (error: unknown): PsnAccessIssue => {
  const type = extractErrorType(error);
  const message = extractErrorMessage(error, "").toLowerCase();

  if (type === "missing_token" || message.includes("missing psn token")) {
    return "missing";
  }

  if (type === "psn_auth") {
    return "invalid";
  }

  if (
    type === "invalid_request" &&
    (message.includes("token") || message.includes("npsso") || message.includes("access code"))
  ) {
    return "invalid";
  }

  if (
    message.includes("invalid") &&
    (message.includes("token") || message.includes("npsso") || message.includes("access code"))
  ) {
    return "invalid";
  }

  return null;
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

const moveStripZoneToIndex = (
  order: StripZoneKey[],
  sourceZone: StripZoneKey,
  targetIndex: number,
) => {
  const nextOrder = [...order];
  const sourceIndex = nextOrder.indexOf(sourceZone);

  if (sourceIndex === -1 || targetIndex < 0 || targetIndex > nextOrder.length) {
    return order;
  }

  nextOrder.splice(sourceIndex, 1);
  const insertionIndex = sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;

  if (insertionIndex === sourceIndex) {
    return order;
  }

  nextOrder.splice(insertionIndex, 0, sourceZone);

  return nextOrder;
};

const resolveStripDropIndex = (
  trackElement: HTMLDivElement,
  clientX: number,
) => {
  const chips = Array.from(
    trackElement.querySelectorAll<HTMLDivElement>(".strip-order-chip"),
  );

  if (chips.length === 0) {
    return 0;
  }

  for (const [index, chip] of chips.entries()) {
    const rect = chip.getBoundingClientRect();
    const midpoint = rect.left + rect.width / 2;

    if (clientX < midpoint) {
      return index;
    }
  }

  return chips.length;
};

const isStripZoneVisible = (settings: OverlaySettings, zone: StripZoneKey) => {
  if (zone === "artwork") {
    return settings.showStripArtwork;
  }

  if (zone === "identity") {
    return settings.showStripIdentity;
  }

  if (zone === "metrics") {
    return settings.showStripMetrics;
  }

  if (zone === "targetInfo") {
    return settings.showTargetTrophyInfo;
  }

  return settings.showStripTrophies;
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
  const desktopRuntime = window.streamerToolsDesktop;
  const isDesktopRuntime = desktopRuntime?.platform === "desktop";
  const desktopWindowControls = desktopRuntime?.windowControls;
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
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>("setup");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);
  const [psnAccessOpen, setPsnAccessOpen] = useState(false);
  const [psnAccessIssue, setPsnAccessIssue] = useState<PsnAccessIssue>(null);
  const [activeGamePendingId, setActiveGamePendingId] = useState<string | null>(null);
  const [targetPendingKey, setTargetPendingKey] = useState<string | null>(null);
  const [savingAdvancedGame, setSavingAdvancedGame] = useState(false);
  const [draggedStripZone, setDraggedStripZone] = useState<StripZoneKey | null>(null);
  const [dropStripIndex, setDropStripIndex] = useState<number | null>(null);
  const [copiedRouteKey, setCopiedRouteKey] = useState<string | null>(null);
  const settingsRef = useRef(settings);
  const pendingSettingsSaveTimeoutRef = useRef<number | null>(null);
  const settingsEditVersionRef = useRef(0);
  const latestSettingsSaveRequestIdRef = useRef(0);
  const copiedRouteResetTimeoutRef = useRef<number | null>(null);

  const overlayUrlBase = useMemo(() => window.location.origin, []);
  const psnAccessSummaryText =
    psnAccessIssue === "missing"
      ? "A saved NPSSO token is required before this control room can load PSN data."
      : psnAccessIssue === "invalid"
        ? "The saved token was rejected by PSN. Paste a fresh NPSSO token to continue."
        : "Update or clear the locally stored NPSSO token for this machine.";

  useEffect(() => {
    document.body.classList.toggle("modal-open", psnAccessOpen);
    return () => document.body.classList.remove("modal-open");
  }, [psnAccessOpen]);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(
    () => () => {
      if (pendingSettingsSaveTimeoutRef.current != null) {
        window.clearTimeout(pendingSettingsSaveTimeoutRef.current);
      }
      if (copiedRouteResetTimeoutRef.current != null) {
        window.clearTimeout(copiedRouteResetTimeoutRef.current);
      }
    },
    [],
  );

  const fetchTitleTrophiesForGame = async (
    nextActiveGame: ActiveGameSelection,
    nextSummary: TrophySummaryResponse,
    tokenConfigured = psnTokenStatus.configured,
  ) => {
    const selectedTitleId = resolveSelectedPsnTitleId(nextActiveGame, nextSummary);

    if (!selectedTitleId) {
      return {
        response: defaultTitleTrophies,
        error:
          nextActiveGame.mode === "custom"
            ? "Trophy targeting is unavailable while custom mode is active."
            : !tokenConfigured
              ? TOKEN_REQUIRED_MESSAGE
              : null,
        psnAccessIssue:
          nextActiveGame.mode === "custom" || tokenConfigured ? null : ("missing" as const),
      };
    }

    try {
      return {
        response: await api.getTitleTrophies(selectedTitleId),
        error: null,
        psnAccessIssue: null,
      };
    } catch (error) {
      return {
        response: defaultTitleTrophies,
        error: extractErrorMessage(error, "Unable to load trophies for the selected title."),
        psnAccessIssue: resolvePsnAccessIssue(error),
      };
    }
  };

  const loadTitleTrophiesForGame = async (
    nextActiveGame: ActiveGameSelection,
    nextSummary: TrophySummaryResponse,
  ) => {
    setTitleTrophiesLoading(true);

    try {
      const nextState = await fetchTitleTrophiesForGame(
        nextActiveGame,
        nextSummary,
        psnTokenStatus.configured,
      );
      setTitleTrophies(nextState.response);
      setTitleTrophiesError(nextState.error);
      setPsnAccessIssue(nextState.psnAccessIssue);
      if (nextState.psnAccessIssue) {
        setPsnAccessOpen(true);
      }
    } finally {
      setTitleTrophiesLoading(false);
    }
  };

  const load = async (nextStatusMessage = "Refreshing"): Promise<PsnAccessIssue> => {
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
      setSummary(nextSummary);
      setSettings(nextSettings);
      setActiveGame(nextActiveGame);
      setOverlayData(nextOverlayData);

      let titleTrophyState: {
        response: TitleTrophiesResponse;
        error: string | null;
        psnAccessIssue: PsnAccessIssue;
      } = {
        response: defaultTitleTrophies,
        error: nextTokenStatus.configured ? null : TOKEN_REQUIRED_MESSAGE,
        psnAccessIssue: nextTokenStatus.configured ? null : ("missing" as const),
      };

      if (nextSummaryResult.status === "fulfilled") {
        setTitleTrophiesLoading(true);
        titleTrophyState = await fetchTitleTrophiesForGame(
          nextActiveGame,
          nextSummary,
          nextTokenStatus.configured,
        );
        setTitleTrophiesLoading(false);
      }

      setTitleTrophies(titleTrophyState.response);
      setTitleTrophiesError(titleTrophyState.error);
      const nextPsnAccessIssue =
        (!nextTokenStatus.configured
          ? "missing"
          : null) ??
        titleTrophyState.psnAccessIssue ??
        [
          nextHealthResult.status === "rejected" ? nextHealthResult.reason : null,
          nextSummaryResult.status === "rejected" ? nextSummaryResult.reason : null,
          nextSettingsResult.status === "rejected" ? nextSettingsResult.reason : null,
          nextActiveGameResult.status === "rejected" ? nextActiveGameResult.reason : null,
          nextOverlayDataResult.status === "rejected" ? nextOverlayDataResult.reason : null,
        ]
          .map(resolvePsnAccessIssue)
          .find((issue): issue is Exclude<PsnAccessIssue, null> => issue !== null) ??
        null;
      setPsnAccessIssue(nextPsnAccessIssue);
      if (nextPsnAccessIssue) {
        setPsnAccessOpen(true);
      }
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
        setStatusMessage("PSN access required");
        return nextPsnAccessIssue;
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
        return nextPsnAccessIssue;
      }

      setConnectionState("ready");
      setStatusMessage("Connected");
      return nextPsnAccessIssue;
    } catch (error) {
      setDebugPayload(error);
      setConnectionState("error");
      setStatusMessage("Error");
      setTitleTrophiesLoading(false);
      const nextPsnAccessIssue = resolvePsnAccessIssue(error);
      setPsnAccessIssue(nextPsnAccessIssue);
      if (nextPsnAccessIssue) {
        setPsnAccessOpen(true);
      }
      return nextPsnAccessIssue;
    }
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (!deferredSearchQuery) {
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

  const isSearchMode = searchQuery.trim().length > 0;
  const visibleTitleList = isSearchMode ? titleSearch.results : summary.titles;
  const visibleBrowseTitles = useMemo(() => {
    if (
      activeGame.mode === "psn" &&
      selectedPsnTitle &&
      !visibleTitleList.some(
        (title) => title.npCommunicationId === selectedPsnTitle.npCommunicationId,
      )
    ) {
      return [selectedPsnTitle, ...visibleTitleList];
    }

    return visibleTitleList;
  }, [activeGame.mode, selectedPsnTitle, visibleTitleList]);
  const trophyBrowserAvailable =
    activeGame.mode === "psn" && selectedPsnTitleId != null;

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
  const openPsnTokenPage = () => {
    window.open(PSN_TOKEN_URL, "_blank", "noopener,noreferrer");
  };

  useEffect(() => {
    if (workspaceTab === "trophies" && !trophyBrowserAvailable) {
      setWorkspaceTab("games");
    }
  }, [trophyBrowserAvailable, workspaceTab]);

  const clearPendingSettingsSave = () => {
    if (pendingSettingsSaveTimeoutRef.current != null) {
      window.clearTimeout(pendingSettingsSaveTimeoutRef.current);
      pendingSettingsSaveTimeoutRef.current = null;
    }
  };

  const persistSettings = async (
    nextSettings: OverlaySettings,
    editVersion: number,
  ) => {
    const requestId = latestSettingsSaveRequestIdRef.current + 1;
    latestSettingsSaveRequestIdRef.current = requestId;
    setStatusMessage("Saving display settings");

    try {
      const persistedSettings = await api.saveSettings(nextSettings);
      const nextOverlayData = await api.getOverlayData();

      if (requestId !== latestSettingsSaveRequestIdRef.current) {
        return;
      }

      setOverlayData(nextOverlayData);

      if (settingsEditVersionRef.current !== editVersion) {
        return;
      }

      settingsRef.current = persistedSettings;
      setSettings(persistedSettings);
      setStatusMessage("Display settings saved");
    } catch (error) {
      if (
        requestId !== latestSettingsSaveRequestIdRef.current ||
        settingsEditVersionRef.current !== editVersion
      ) {
        return;
      }

      const nextPsnAccessIssue = resolvePsnAccessIssue(error);
      setPsnAccessIssue(nextPsnAccessIssue);
      if (nextPsnAccessIssue) {
        setPsnAccessOpen(true);
      }
      setStatusMessage("Display settings failed");
      setDebugPayload(error);
    }
  };

  const updateSettingsWithPersistence = (
    applyChange: (current: OverlaySettings) => OverlaySettings,
    persistence: "debounced" | "immediate",
  ) => {
    const currentSettings = settingsRef.current;
    const nextSettings = applyChange(currentSettings);

    if (nextSettings === currentSettings) {
      return;
    }

    settingsEditVersionRef.current += 1;
    const editVersion = settingsEditVersionRef.current;

    settingsRef.current = nextSettings;
    setSettings(nextSettings);

    clearPendingSettingsSave();

    if (persistence === "immediate") {
      void persistSettings(nextSettings, editVersion);
      return;
    }

    pendingSettingsSaveTimeoutRef.current = window.setTimeout(() => {
      pendingSettingsSaveTimeoutRef.current = null;
      void persistSettings(nextSettings, editVersion);
    }, SETTINGS_SAVE_DEBOUNCE_MS);
  };

  const copyRouteUrl = async (routeKey: string, url: string) => {
    const copied = await copyText(url);

    if (!copied) {
      return;
    }

    if (copiedRouteResetTimeoutRef.current != null) {
      window.clearTimeout(copiedRouteResetTimeoutRef.current);
    }

    setCopiedRouteKey(routeKey);
    copiedRouteResetTimeoutRef.current = window.setTimeout(() => {
      setCopiedRouteKey((current) => (current === routeKey ? null : current));
      copiedRouteResetTimeoutRef.current = null;
    }, ROUTE_COPY_FEEDBACK_MS);
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
      setWorkspaceTab("trophies");
      setSearchQuery("");
      setTitleSearch(defaultTitleSearch);
    } catch (error) {
      setActiveGame(previousActiveGame);
      setTitleTrophies(previousTitleTrophies);
      setTitleTrophiesError(
        extractErrorMessage(error, "Unable to switch the active game."),
      );
      const nextPsnAccessIssue = resolvePsnAccessIssue(error);
      setPsnAccessIssue(nextPsnAccessIssue);
      if (nextPsnAccessIssue) {
        setPsnAccessOpen(true);
      }
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
      const nextPsnAccessIssue = resolvePsnAccessIssue(error);
      setPsnAccessIssue(nextPsnAccessIssue);
      if (nextPsnAccessIssue) {
        setPsnAccessOpen(true);
      }
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
      const nextPsnAccessIssue = resolvePsnAccessIssue(error);
      setPsnAccessIssue(nextPsnAccessIssue);
      if (nextPsnAccessIssue) {
        setPsnAccessOpen(true);
      }
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
      const nextPsnAccessIssue = await load("Refreshing after token save");
      if (!nextPsnAccessIssue) {
        setPsnAccessOpen(false);
      }
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
      setPsnAccessOpen(true);
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

  const reorderStripZones = (sourceZone: StripZoneKey, targetIndex: number) => {
    updateSettingsWithPersistence((current) => {
      const nextOrder = moveStripZoneToIndex(
        current.stripZoneOrder,
        sourceZone,
        targetIndex,
      );

      if (nextOrder === current.stripZoneOrder) {
        return current;
      }

      return {
        ...current,
        stripZoneOrder: nextOrder,
      };
    }, "immediate");
  };

  const previewStripZoneOrder =
    draggedStripZone != null && dropStripIndex != null
      ? moveStripZoneToIndex(settings.stripZoneOrder, draggedStripZone, dropStripIndex)
      : settings.stripZoneOrder;

  const handleStripTrackDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!draggedStripZone) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";

    const nextIndex = resolveStripDropIndex(event.currentTarget, event.clientX);

    if (dropStripIndex !== nextIndex) {
      setDropStripIndex(nextIndex);
    }
  };

  const handleStripTrackDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();

    const sourceZone =
      (event.dataTransfer.getData("text/plain") as StripZoneKey) || draggedStripZone;

    if (sourceZone) {
      reorderStripZones(
        sourceZone,
        resolveStripDropIndex(event.currentTarget, event.clientX),
      );
    }

    setDraggedStripZone(null);
    setDropStripIndex(null);
  };

  return (
    <>
      {psnAccessOpen ? (
        <PsnAccessModal
          issue={psnAccessIssue}
          summaryText={psnAccessSummaryText}
          psnTokenStatusLabel={psnTokenStatusLabel}
          psnTokenUpdatedLabel={psnTokenUpdatedLabel}
          psnTokenStatus={psnTokenStatus}
          psnTokenInput={psnTokenInput}
          savingPsnToken={savingPsnToken}
          clearingPsnToken={clearingPsnToken}
          psnTokenError={psnTokenError}
          onTokenInputChange={setPsnTokenInput}
          onOpenTokenPage={openPsnTokenPage}
          onSave={() => void savePsnToken()}
          onClear={() => void clearPsnToken()}
          onClose={() => setPsnAccessOpen(false)}
        />
      ) : null}

      <div className={`dashboard-app ${isDesktopRuntime ? "dashboard-app-desktop" : ""}`}>
        <DashboardTopBar
          isDesktopRuntime={isDesktopRuntime}
          desktopWindowControls={desktopWindowControls}
          trophyBrowserAvailable={trophyBrowserAvailable}
          workspaceTab={workspaceTab}
          currentTargetSelectionKey={currentTargetSelectionKey}
          targetPendingKey={targetPendingKey}
          onSelectSetup={() => setWorkspaceTab("setup")}
          onSelectGames={() => setWorkspaceTab("games")}
          onSelectTrophies={() => setWorkspaceTab("trophies")}
          onClearTarget={() => void updateTargetTrophy(null)}
          onOpenPsnAccess={() => setPsnAccessOpen(true)}
          onRefresh={() => void load()}
        />

        <div className="dashboard-scroll-region">
        <div className="dashboard-shell">

        {workspaceTab === "setup" ? (
          <section
            className="workspace-panel"
            id="workspace-panel-setup"
            role="tabpanel"
            aria-labelledby="workspace-tab-setup"
          >
            <section className="workspace-subpanel setup-config-preview-surface">
              <div className="workspace-subpanel-header">
                <h3>Config and preview</h3>
              </div>

              <div className="setup-controls-stack">
                <div className="setup-config-rail">
                  <div className="editor-grid setup-config-fields">
                    <NumberField
                      label="Overall duration (ms)"
                      value={settings.overallDurationMs}
                      onChange={(value) =>
                        updateSettingsWithPersistence((current) => {
                          const nextValue = value ?? current.overallDurationMs;
                          return nextValue === current.overallDurationMs
                            ? current
                            : {
                                ...current,
                                overallDurationMs: nextValue,
                              };
                        }, "debounced")
                      }
                    />
                    <NumberField
                      label="Current game duration (ms)"
                      value={settings.currentGameDurationMs}
                      onChange={(value) =>
                        updateSettingsWithPersistence((current) => {
                          const nextValue = value ?? current.currentGameDurationMs;
                          return nextValue === current.currentGameDurationMs
                            ? current
                            : {
                                ...current,
                                currentGameDurationMs: nextValue,
                              };
                        }, "debounced")
                      }
                    />
                    <NumberField
                      label="Target trophy duration (ms)"
                      value={settings.targetTrophyDurationMs}
                      onChange={(value) =>
                        updateSettingsWithPersistence((current) => {
                          const nextValue = value ?? current.targetTrophyDurationMs;
                          return nextValue === current.targetTrophyDurationMs
                            ? current
                            : {
                                ...current,
                                targetTrophyDurationMs: nextValue,
                              };
                        }, "debounced")
                      }
                    />
                    <TextField
                      label="Target trophy tag text"
                      value={settings.targetTrophyTagText}
                      onChange={(value) =>
                        updateSettingsWithPersistence((current) =>
                          value === current.targetTrophyTagText
                            ? current
                            : {
                                ...current,
                                targetTrophyTagText: value,
                              }, "debounced")
                      }
                    />
                    <SelectField
                      label="Overlay anchor"
                      value={settings.overlayAnchor}
                      options={overlayAnchorOptions.map((anchor) => ({
                        value: anchor,
                        label: overlayAnchorLabels[anchor],
                      }))}
                      onChange={(value) =>
                        updateSettingsWithPersistence((current) =>
                          value === current.overlayAnchor
                            ? current
                            : {
                                ...current,
                                overlayAnchor: value,
                              }, "immediate")
                      }
                    />
                  </div>

                  <div className="toggle-grid settings-toggle-grid">
                    <ToggleField
                      label="Show artwork"
                      checked={settings.showStripArtwork}
                      onChange={(checked) =>
                        updateSettingsWithPersistence((current) =>
                          checked === current.showStripArtwork
                            ? current
                            : {
                                ...current,
                                showStripArtwork: checked,
                              }, "immediate")
                      }
                    />
                    <ToggleField
                      label="Show title and platform"
                      checked={settings.showStripIdentity}
                      onChange={(checked) =>
                        updateSettingsWithPersistence((current) =>
                          checked === current.showStripIdentity
                            ? current
                            : {
                                ...current,
                                showStripIdentity: checked,
                              }, "immediate")
                      }
                    />
                    <ToggleField
                      label="Show progress and earned totals"
                      checked={settings.showStripMetrics}
                      onChange={(checked) =>
                        updateSettingsWithPersistence((current) =>
                          checked === current.showStripMetrics
                            ? current
                            : {
                                ...current,
                                showStripMetrics: checked,
                              }, "immediate")
                      }
                    />
                    <ToggleField
                      label="Show trophy counts"
                      checked={settings.showStripTrophies}
                      onChange={(checked) =>
                        updateSettingsWithPersistence((current) =>
                          checked === current.showStripTrophies
                            ? current
                            : {
                                ...current,
                                showStripTrophies: checked,
                              }, "immediate")
                      }
                    />
                    <ToggleField
                      label="Show target trophy in loop"
                      checked={settings.showTargetTrophyInLoop}
                      onChange={(checked) =>
                        updateSettingsWithPersistence((current) =>
                          checked === current.showTargetTrophyInLoop
                            ? current
                            : {
                                ...current,
                                showTargetTrophyInLoop: checked,
                              }, "immediate")
                      }
                    />
                    <ToggleField
                      label="Show target trophy tag"
                      checked={settings.showTargetTrophyTag}
                      onChange={(checked) =>
                        updateSettingsWithPersistence((current) =>
                          checked === current.showTargetTrophyTag
                            ? current
                            : {
                                ...current,
                                showTargetTrophyTag: checked,
                              }, "immediate")
                      }
                    />
                    <ToggleField
                      label="Show target info"
                      checked={settings.showTargetTrophyInfo}
                      onChange={(checked) =>
                        updateSettingsWithPersistence((current) =>
                          checked === current.showTargetTrophyInfo
                            ? current
                            : {
                                ...current,
                                showTargetTrophyInfo: checked,
                              }, "immediate")
                      }
                    />
                  </div>
                </div>

                <div className="strip-order-rail">
                  <div
                    className={`strip-order-track ${draggedStripZone ? "is-dragging" : ""} ${
                      dropStripIndex === 0 ? "is-drop-start" : ""
                    } ${
                      dropStripIndex === settings.stripZoneOrder.length ? "is-drop-end" : ""
                    }`}
                    aria-label="Strip section order"
                    onDragOver={handleStripTrackDragOver}
                    onDrop={handleStripTrackDrop}
                  >
                    {settings.stripZoneOrder.map((zone) => {
                      const currentIndex = settings.stripZoneOrder.indexOf(zone);
                      const previewIndex = previewStripZoneOrder.indexOf(zone);
                      const shiftClass =
                        previewIndex < currentIndex
                          ? "is-shift-left"
                          : previewIndex > currentIndex
                            ? "is-shift-right"
                            : "";

                      return (
                        <div
                          className={`strip-order-chip ${
                            draggedStripZone === zone ? "is-dragging" : ""
                          } ${
                            !isStripZoneVisible(settings, zone) ? "is-muted" : ""
                          } ${shiftClass} ${
                            draggedStripZone !== zone &&
                            dropStripIndex != null &&
                            dropStripIndex === currentIndex
                              ? "is-drop-before"
                              : ""
                          } ${
                            draggedStripZone !== zone &&
                            dropStripIndex != null &&
                            dropStripIndex === currentIndex + 1
                              ? "is-drop-after"
                              : ""
                          }`}
                          data-strip-zone={zone}
                          draggable
                          key={zone}
                          onDragStart={(event) => {
                            event.dataTransfer.effectAllowed = "move";
                            event.dataTransfer.setData("text/plain", zone);
                            setDraggedStripZone(zone);
                            setDropStripIndex(settings.stripZoneOrder.indexOf(zone));
                          }}
                          onDragEnd={() => {
                            setDraggedStripZone(null);
                            setDropStripIndex(null);
                          }}
                        >
                          <span className="strip-order-handle" aria-hidden="true">
                            ⋮⋮
                          </span>
                          <span className="strip-order-chip-label">{stripZoneLabels[zone]}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="setup-preview-stack">
                <div className="overlay-preview-block">
                  <RouteRow
                    copied={copiedRouteKey === "loop"}
                    copyLabel="Copy loop URL"
                    onCopy={() => void copyRouteUrl("loop", `${overlayUrlBase}/overlay/loop`)}
                    url={`${overlayUrlBase}/overlay/loop`}
                  />
                  <EmbeddedOverlayPreview
                    title="Loop preview"
                    srcPath="/overlay/loop"
                    overlayData={overlayData}
                    settings={settings}
                    viewportHeight={220}
                  />
                </div>

                <div className="overlay-preview-block">
                  <RouteRow
                    copied={copiedRouteKey === "target-trophy"}
                    copyLabel="Copy target trophy URL"
                    onCopy={() =>
                      void copyRouteUrl("target-trophy", `${overlayUrlBase}/overlay/target-trophy`)
                    }
                    url={`${overlayUrlBase}/overlay/target-trophy`}
                  />
                  <EmbeddedOverlayPreview
                    title="Target trophy preview"
                    srcPath="/overlay/target-trophy"
                    overlayData={overlayData}
                    settings={settings}
                    viewportHeight={220}
                  />
                </div>

                <div className="overlay-preview-block">
                  <RouteRow
                    copied={copiedRouteKey === "overall"}
                    copyLabel="Copy overall URL"
                    onCopy={() => void copyRouteUrl("overall", `${overlayUrlBase}/overlay/overall`)}
                    url={`${overlayUrlBase}/overlay/overall`}
                  />
                  <EmbeddedOverlayPreview
                    title="Overall preview"
                    srcPath="/overlay/overall"
                    overlayData={overlayData}
                    settings={settings}
                    viewportHeight={220}
                  />
                </div>

                <div className="overlay-preview-block">
                  <RouteRow
                    copied={copiedRouteKey === "current-game"}
                    copyLabel="Copy current game URL"
                    onCopy={() =>
                      void copyRouteUrl("current-game", `${overlayUrlBase}/overlay/current-game`)
                    }
                    url={`${overlayUrlBase}/overlay/current-game`}
                  />
                  <EmbeddedOverlayPreview
                    title="Current game preview"
                    srcPath="/overlay/current-game"
                    overlayData={overlayData}
                    settings={settings}
                    viewportHeight={220}
                  />
                </div>
              </div>
            </section>

            <div className="setup-advanced-stack">
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
                          current.selectedNpCommunicationId ??
                          summary.titles[0]?.npCommunicationId ??
                          null,
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
          </section>
        ) : null}

        {workspaceTab === "games" ? (
          <section
            className="workspace-panel"
            id="workspace-panel-games"
            role="tabpanel"
            aria-labelledby="workspace-tab-games"
          >
            <div className="title-browser-surface">
              {activeGame.mode === "custom" ? (
                <p className="panel-footnote">
                  Custom mode is active. Select a PSN title here to switch back, or adjust manual
                  values in Setup.
                </p>
              ) : null}

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

              <div className="search-results-header">
                <p className="section-caption">
                  {isSearchMode
                    ? `Search results${titleSearch.totalItemCount > 0 ? ` (${titleSearch.totalItemCount})` : ""}`
                    : "Recent titles"}
                </p>
              </div>

              {isSearchMode ? (
                <>
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
                </>
              ) : null}

              {!isSearchMode && visibleBrowseTitles.length === 0 ? (
                <p className="panel-empty">No recent titles are available yet.</p>
              ) : null}

              {visibleBrowseTitles.length > 0 ? (
                <div className="title-picker-grid">
                  {visibleBrowseTitles.map((title) => (
                    <TitlePickerCard
                      key={`visible-${title.npCommunicationId}`}
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
              ) : null}

              {isSearchMode && titleSearch.nextOffset != null ? (
                <button
                  className="ghost-button"
                  disabled={titleSearchLoading}
                  onClick={() => void loadMoreSearchResults()}
                >
                  {titleSearchLoading ? "Loading…" : "Load more"}
                </button>
              ) : null}
            </div>
          </section>
        ) : null}

        {workspaceTab === "trophies" && trophyBrowserAvailable ? (
          <section
            className="workspace-panel"
            id="workspace-panel-trophies"
            role="tabpanel"
            aria-labelledby="workspace-tab-trophies"
          >
            <div className="trophy-browser-surface">
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
                <div className="trophy-browser-stack">
                  {currentTargetTrophy ? (
                    <div className="trophy-pinned">
                      <p className="section-caption">Pinned target</p>
                      <TrophyCard
                        trophy={currentTargetTrophy}
                        active
                        featured
                        pending={targetPendingKey === currentTargetSelectionKey}
                        onSelect={() => void updateTargetTrophy(currentTargetTrophy)}
                      />
                    </div>
                  ) : null}

                  {unearnedTrophies.length > 0 ? (
                    <div className="trophy-section">
                      <p className="section-caption">Unearned trophies</p>
                      <div className="trophy-card-grid">
                        {unearnedTrophies.map((trophy) => {
                          const trophyKey = `${trophy.trophyGroupId}:${trophy.trophyId}`;
                          return (
                            <TrophyCard
                              key={trophyKey}
                              trophy={trophy}
                              active={currentTargetSelectionKey === trophyKey}
                              pending={targetPendingKey === trophyKey}
                              onSelect={() => void updateTargetTrophy(trophy)}
                            />
                          );
                        })}
                      </div>
                    </div>
                  ) : null}

                  {earnedTrophies.length > 0 ? (
                    <div className="trophy-section">
                      <p className="section-caption">Earned trophies</p>
                      <div className="trophy-card-grid">
                        {earnedTrophies.map((trophy) => {
                          const trophyKey = `${trophy.trophyGroupId}:${trophy.trophyId}`;
                          return (
                            <TrophyCard
                              key={trophyKey}
                              trophy={trophy}
                              active={currentTargetSelectionKey === trophyKey}
                              pending={targetPendingKey === trophyKey}
                              onSelect={() => void updateTargetTrophy(trophy)}
                            />
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </section>
        ) : null}
      </div>
      </div>
      </div>
    </>
  );
}

function DashboardTopBar({
  isDesktopRuntime,
  desktopWindowControls,
  trophyBrowserAvailable,
  workspaceTab,
  currentTargetSelectionKey,
  targetPendingKey,
  onSelectSetup,
  onSelectGames,
  onSelectTrophies,
  onClearTarget,
  onOpenPsnAccess,
  onRefresh,
}: {
  isDesktopRuntime: boolean;
  desktopWindowControls?: DesktopWindowControls;
  trophyBrowserAvailable: boolean;
  workspaceTab: WorkspaceTab;
  currentTargetSelectionKey: string | null;
  targetPendingKey: string | null;
  onSelectSetup: () => void;
  onSelectGames: () => void;
  onSelectTrophies: () => void;
  onClearTarget: () => void;
  onOpenPsnAccess: () => void;
  onRefresh: () => void;
}) {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    if (!isDesktopRuntime || !desktopWindowControls) {
      return;
    }

    let disposed = false;

    void desktopWindowControls.isMaximized().then((nextIsMaximized) => {
      if (!disposed) {
        setIsMaximized(nextIsMaximized);
      }
    });

    const unsubscribe = desktopWindowControls.onMaximizedChange((nextIsMaximized) => {
      setIsMaximized(nextIsMaximized);
    });

    return () => {
      disposed = true;
      unsubscribe();
    };
  }, [desktopWindowControls, isDesktopRuntime]);

  return (
    <header className={`app-topbar ${isDesktopRuntime ? "app-topbar-desktop" : ""}`}>
      <div className="app-topbar-frame">
        <div className="app-topbar-shell">
          <div className="app-topbar-brand">
            <img className="app-topbar-brand-icon" src="/favicon.png" alt="" />
            <div className="app-topbar-brand-copy">
              <p className="app-topbar-brand-kicker">Streamer Tools</p>
              <p className="app-topbar-brand-title">PSN Trophy Overlay Suite</p>
            </div>
          </div>

          <div className="app-topbar-navigation">
            <div className="workspace-tabs" role="tablist" aria-label="Dashboard workspace">
              <button
                id="workspace-tab-setup"
                className={`workspace-tab ${workspaceTab === "setup" ? "is-active" : ""}`}
                role="tab"
                type="button"
                aria-selected={workspaceTab === "setup"}
                aria-controls="workspace-panel-setup"
                onClick={onSelectSetup}
              >
                Setup
              </button>
              <button
                id="workspace-tab-games"
                className={`workspace-tab ${workspaceTab === "games" ? "is-active" : ""}`}
                role="tab"
                type="button"
                aria-selected={workspaceTab === "games"}
                aria-controls="workspace-panel-games"
                onClick={onSelectGames}
              >
                Game Selection
              </button>
              {trophyBrowserAvailable ? (
                <button
                  id="workspace-tab-trophies"
                  className={`workspace-tab ${workspaceTab === "trophies" ? "is-active" : ""}`}
                  role="tab"
                  type="button"
                  aria-selected={workspaceTab === "trophies"}
                  aria-controls="workspace-panel-trophies"
                  onClick={onSelectTrophies}
                >
                  Trophy Browser
                </button>
              ) : null}
            </div>
          </div>

          <div className="app-topbar-drag-lane" aria-hidden="true" />

          <div className="app-topbar-actions">
            {workspaceTab === "trophies" && currentTargetSelectionKey ? (
              <button
                className="ghost-button"
                disabled={targetPendingKey === "clear"}
                onClick={onClearTarget}
              >
                Clear target
              </button>
            ) : null}
            <button className="ghost-button" onClick={onOpenPsnAccess}>
              PSN access
            </button>
            <button className="action-button" onClick={onRefresh}>
              Refresh all
            </button>
          </div>
        </div>

        {isDesktopRuntime && desktopWindowControls ? (
          <div className="app-topbar-window-controls" aria-label="Window controls">
            <button
              className="app-window-control"
              type="button"
              aria-label="Minimize window"
              onClick={() => desktopWindowControls.minimize()}
            >
              <span aria-hidden="true" className="app-window-control-glyph">
                _
              </span>
            </button>
            <button
              className="app-window-control"
              type="button"
              aria-label={isMaximized ? "Restore window" : "Maximize window"}
              onClick={() => desktopWindowControls.maximizeOrRestore()}
            >
              <span
                aria-hidden="true"
                className={`app-window-control-glyph app-window-control-glyph-square ${
                  isMaximized ? "is-restored" : ""
                }`}
              />
            </button>
            <button
              className="app-window-control app-window-control-close"
              type="button"
              aria-label="Close window"
              onClick={() => desktopWindowControls.close()}
            >
              <span aria-hidden="true" className="app-window-control-glyph">
                ×
              </span>
            </button>
          </div>
        ) : null}
      </div>
    </header>
  );
}

function PsnAccessModal({
  issue,
  summaryText,
  psnTokenStatusLabel,
  psnTokenUpdatedLabel,
  psnTokenStatus,
  psnTokenInput,
  savingPsnToken,
  clearingPsnToken,
  psnTokenError,
  onTokenInputChange,
  onOpenTokenPage,
  onSave,
  onClear,
  onClose,
}: {
  issue: PsnAccessIssue;
  summaryText: string;
  psnTokenStatusLabel: string;
  psnTokenUpdatedLabel: string;
  psnTokenStatus: PsnTokenStatusResponse;
  psnTokenInput: string;
  savingPsnToken: boolean;
  clearingPsnToken: boolean;
  psnTokenError: string | null;
  onTokenInputChange: (value: string) => void;
  onOpenTokenPage: () => void;
  onSave: () => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const introText =
    "Save an NPSSO token locally on this machine so the control room can load PSN data.";
  const storageLabel =
    psnTokenStatus.storage === "local-file" ? "Local file" : psnTokenStatus.storage;

  return (
    <div className="modal-backdrop" role="presentation">
      <section
        className="panel token-panel token-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="psn-access-title"
        aria-describedby="psn-access-summary"
      >
        <button
          className="token-modal-close"
          type="button"
          aria-label="Close PSN access"
          onClick={onClose}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 6 18 18" />
            <path d="M18 6 6 18" />
          </svg>
        </button>

        <div className="token-modal-header">
          <div className="token-modal-heading">
            <p className="eyebrow">PSN Access</p>
            <div className="token-modal-title-row">
              <h2 id="psn-access-title">Local token storage</h2>
              <span className="token-modal-status">{psnTokenStatusLabel}</span>
            </div>
            <p id="psn-access-summary" className="token-modal-copy">
              {introText}
            </p>
          </div>
        </div>

        {issue ? (
          <section
            className={`token-modal-callout ${issue === "invalid" ? "is-error" : ""}`}
            aria-label="PSN access status"
          >
            <p className="token-modal-callout-label">Connection status</p>
            <p className={issue === "invalid" ? "panel-error" : undefined}>{summaryText}</p>
          </section>
        ) : null}

        <div className="token-panel-grid">
          <label className="field token-field">
            <span>PSN token</span>
            <input
              type="password"
              autoComplete="off"
              placeholder="Paste your NPSSO token"
              value={psnTokenInput}
              onChange={(event) => onTokenInputChange(event.target.value)}
            />
          </label>

          <div className="token-actions">
            <button
              className="token-modal-button token-modal-button-secondary"
              type="button"
              onClick={onOpenTokenPage}
            >
              Open token page
            </button>
            <button
              className="token-modal-button token-modal-button-primary"
              type="button"
              disabled={savingPsnToken || clearingPsnToken || psnTokenInput.trim().length === 0}
              onClick={onSave}
            >
              {savingPsnToken ? "Saving…" : "Save token"}
            </button>
            <button
              className="token-modal-button token-modal-button-destructive"
              type="button"
              disabled={savingPsnToken || clearingPsnToken || !psnTokenStatus.configured}
              onClick={onClear}
            >
              {clearingPsnToken ? "Clearing…" : "Clear token"}
            </button>
          </div>
        </div>

        <dl className="token-status-strip">
          <div className="token-status-card">
            <dt>Status</dt>
            <dd>{psnTokenStatusLabel}</dd>
          </div>
          <div className="token-status-card">
            <dt>Storage</dt>
            <dd>{storageLabel}</dd>
          </div>
          <div className="token-status-card">
            <dt>Updated</dt>
            <dd>{psnTokenUpdatedLabel}</dd>
          </div>
        </dl>

        <p className="panel-footnote token-storage-note">
          Stored only on this machine in <code>~/.streamer-tools/psn-credentials.json</code>.
          The saved token is never returned to this page.
        </p>
        {psnTokenError ? <p className="panel-error token-modal-error">{psnTokenError}</p> : null}
      </section>
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
    <section className="collapsible-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
        </div>
        <button className="ghost-button" type="button" aria-expanded={open} onClick={onToggle}>
          {open ? "Collapse" : "Expand"}
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

function TrophyCard({
  trophy,
  active,
  featured = false,
  pending,
  onSelect,
}: {
  trophy: TrophyBrowserItem;
  active: boolean;
  featured?: boolean;
  pending: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={`trophy-card ${featured ? "trophy-card-featured" : ""} ${
        active ? "trophy-card-active" : ""
      } ${trophy.earned ? "trophy-card-earned" : ""}`}
      onClick={onSelect}
      disabled={pending}
    >
      {trophy.iconUrl ? (
        <img className="trophy-card-icon" src={trophy.iconUrl} alt="" />
      ) : (
        <div className="trophy-card-icon trophy-card-icon-placeholder" aria-hidden="true" />
      )}
      <div className="trophy-card-copy">
        <div className="trophy-card-head">
          <div className="trophy-card-title">
            <img
              className="trophy-card-grade-icon"
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

function RouteRow({
  copied,
  copyLabel,
  onCopy,
  url,
}: {
  copied: boolean;
  copyLabel: string;
  onCopy: () => void;
  url: string;
}) {
  return (
    <div className="route-row">
      <span className="route-row-text">{url}</span>
      <button
        type="button"
        className="route-copy-button"
        aria-label={copyLabel}
        onClick={onCopy}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
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

function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <label className="field select-field">
      <span>{label}</span>
      <div className="select-field-control">
        <select value={value} onChange={(event) => onChange(event.target.value as T)}>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
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
