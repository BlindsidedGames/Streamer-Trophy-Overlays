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
  GradeKey,
  OverlayAnchor,
  OverlayBrbCard,
  OverlayDataResponse,
  OverlayEarnedSessionCard,
  OverlayRouteKey,
  OverlaySettings,
  OverlayView,
  PsnTokenStatusResponse,
  TargetTrophySelection,
  TitleSearchResponse,
  TitleSearchResult,
  StripZoneKey,
  TitleTrophiesResponse,
  TrophyBrowserItem,
  TrophySummaryResponse,
  UnearnedTrophiesResponse,
  UnearnedTrophyItem,
  UpdateBrbRequest,
  UpdateEarnedSessionRequest,
  UpdateTargetTrophyRequest,
} from "../shared/contracts.js";
import {
  createDefaultBrbState,
  createDefaultActiveGameSelection,
  createDefaultEarnedSessionCard,
  createDefaultOverlaySettings,
  overlayAnchorOptions,
  overlayRoutePaths,
} from "../shared/contracts.js";
import { api } from "./api.js";
import {
  BeRightBackOverlay,
  CameraBorderOverlay,
  CAMERA_BORDER_PREVIEW_VIEWPORT_HEIGHT,
  CAMERA_BORDER_PREVIEW_VIEWPORT_WIDTH,
  CurrentGameOverlay,
  EarnedSessionOverlay,
  EmbeddedOverlayPreview,
  LoopOverlay,
  OverallOverlay,
  TargetTrophyOverlay,
  UnearnedTrophiesOverlay,
} from "./components.js";

type ConnectionState = "loading" | "ready" | "error";
type PsnAccessIssue = "missing" | "invalid" | null;
type WorkspaceTab = "setup" | "games" | "trophies" | "allUnearned";
type TrophyBrowserSubTabKey = "all" | "earned" | `group:${string}`;
type TrophyBrowserListMode = "earned" | "unearned";
type UnearnedSortMode =
  | "easiestFirst"
  | "hardestFirst"
  | "titleAsc"
  | "recentlyActiveTitle";
interface TrophyBrowserSubTab {
  key: TrophyBrowserSubTabKey;
  label: string;
  metricLabel: string | null;
  groupId: string | null;
  listMode: TrophyBrowserListMode;
}
type TargetableTrophy = {
  trophyId: number;
  trophyGroupId: string;
};
type DesktopWindowControls = NonNullable<typeof window.streamerToolsDesktop>["windowControls"];

const trophyBrowserGradeIcon: Record<TrophyBrowserItem["grade"], string> = {
  platinum: "/img/40-platinum.png",
  gold: "/img/40-gold.png",
  silver: "/img/40-silver.png",
  bronze: "/img/40-bronze.png",
};
const routeControlGradeOrder: GradeKey[] = ["platinum", "gold", "silver", "bronze"];

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
  unearnedTrophies: null,
  currentGame: null,
  targetTrophy: null,
  brb: createDefaultBrbState(),
  earnedSession: createDefaultEarnedSessionCard(),
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

const defaultUnearnedTrophies: UnearnedTrophiesResponse = {
  trophies: [],
  meta: {
    fetchedAt: "",
    cached: false,
    warnings: [],
    partial: false,
  },
};

const SEARCH_LIMIT = 12;
const TOKEN_REQUIRED_MESSAGE =
  "Open PSN access to save a token before loading titles and trophies.";
const PSN_TOKEN_URL = "https://ca.account.sony.com/api/v1/ssocookie";
const SETTINGS_SAVE_DEBOUNCE_MS = 400;
const ROUTE_COPY_FEEDBACK_MS = 1600;
const DEFAULT_TROPHY_GROUP_ID = "default";
const DEFAULT_UNEARNED_SORT_MODE: UnearnedSortMode = "easiestFirst";
const unearnedSortOptions: Array<{ value: UnearnedSortMode; label: string }> = [
  { value: "easiestFirst", label: "Easiest first" },
  { value: "hardestFirst", label: "Hardest first" },
  { value: "titleAsc", label: "Title A-Z" },
  { value: "recentlyActiveTitle", label: "Recently active title" },
];
const stripZoneLabels: Record<StripZoneKey, string> = {
  artwork: "Artwork",
  identity: "Identity",
  metrics: "Progress",
  trophies: "Trophies",
  targetInfo: "Target info",
};
const loopToggleLabels: Record<keyof OverlaySettings["loopVisibility"], string> = {
  overall: "Overall",
  unearnedTrophies: "Unearned",
  currentGame: "Current game",
  targetTrophy: "Target trophy",
};
const stripToggleLabels: Record<
  keyof OverlaySettings["stripVisibility"]["overall"],
  string
> = {
  artwork: "Artwork",
  identity: "Identity",
  metrics: "Progress",
  trophies: "Trophies",
};
const unearnedDetailedProgressToggleLabel = "Detailed progress";
const overlayAnchorLabels: Record<OverlayAnchor, string> = {
  "top-left": "Top-left",
  "top-center": "Top-center",
  "top-right": "Top-right",
  "bottom-left": "Bottom-left",
  "bottom-center": "Bottom-center",
  "bottom-right": "Bottom-right",
};
type OverlayRoutePreviewConfig = {
  key: OverlayRouteKey;
  routeLabel: string;
  copyLabel: string;
  urlPath: string;
  previewTitle: string;
  viewportWidth?: number;
  viewportHeight: number;
  anchored?: boolean;
};

const overlayRoutePreviewConfigs: ReadonlyArray<OverlayRoutePreviewConfig> = [
  {
    key: "loop",
    routeLabel: "Loop",
    copyLabel: "Copy loop URL",
    urlPath: overlayRoutePaths.loop,
    previewTitle: "Loop preview",
    viewportHeight: 220,
  },
  {
    key: "overall",
    routeLabel: "Overall",
    copyLabel: "Copy overall URL",
    urlPath: overlayRoutePaths.overall,
    previewTitle: "Overall preview",
    viewportHeight: 220,
  },
  {
    key: "unearnedTrophies",
    routeLabel: "Unearned trophies",
    copyLabel: "Copy unearned trophies URL",
    urlPath: overlayRoutePaths.unearnedTrophies,
    previewTitle: "Unearned trophies preview",
    viewportHeight: 220,
  },
  {
    key: "currentGame",
    routeLabel: "Current game",
    copyLabel: "Copy current game URL",
    urlPath: overlayRoutePaths.currentGame,
    previewTitle: "Current game preview",
    viewportHeight: 220,
  },
  {
    key: "targetTrophy",
    routeLabel: "Target trophy",
    copyLabel: "Copy target trophy URL",
    urlPath: overlayRoutePaths.targetTrophy,
    previewTitle: "Target trophy preview",
    viewportHeight: 220,
  },
  {
    key: "brb",
    routeLabel: "Be right back",
    copyLabel: "Copy BRB URL",
    urlPath: overlayRoutePaths.brb,
    previewTitle: "Be right back preview",
    viewportHeight: 220,
  },
  {
    key: "earnedSession",
    routeLabel: "Earned this session",
    copyLabel: "Copy earned session URL",
    urlPath: overlayRoutePaths.earnedSession,
    previewTitle: "Earned this session preview",
    viewportHeight: 220,
  },
  {
    key: "cameraBorder",
    routeLabel: "Camera border",
    copyLabel: "Copy camera border URL",
    urlPath: overlayRoutePaths.cameraBorder,
    previewTitle: "Camera border preview",
    viewportWidth: CAMERA_BORDER_PREVIEW_VIEWPORT_WIDTH,
    viewportHeight: CAMERA_BORDER_PREVIEW_VIEWPORT_HEIGHT,
    anchored: false,
  },
] as const;

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
  trophy: TargetableTrophy | null,
): UpdateTargetTrophyRequest => ({
  npCommunicationId,
  trophyId: trophy?.trophyId ?? null,
  trophyGroupId: trophy?.trophyGroupId ?? null,
});

const buildTrophySelectionKey = (
  npCommunicationId: string,
  trophyGroupId: string,
  trophyId: number,
) => `${npCommunicationId}:${trophyGroupId}:${trophyId}`;

const formatTimestamp = (value: string | null) => {
  if (!value) {
    return "Not saved";
  }

  return new Date(value).toLocaleString();
};

const earnedRateFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
});

const formatEarnedRate = (value: number | null) =>
  value == null ? "Rate unavailable" : `${earnedRateFormatter.format(value)}%`;

const formatTitleLastUpdated = (value: string | null) =>
  value ? new Date(value).toLocaleDateString() : "No recent sync";

const buildTrophyBrowserSubTabKey = (
  groupId: string,
): TrophyBrowserSubTabKey => `group:${groupId}`;

const sanitizeTrophyBrowserSubTabKey = (key: TrophyBrowserSubTabKey) =>
  key.replace(/[^a-z0-9-]+/gi, "-");

const resolveTrophyBrowserGroupLabel = (
  groupId: string,
  groupName: string | null,
) => {
  if (groupId === DEFAULT_TROPHY_GROUP_ID) {
    return "Main Game";
  }

  return groupName?.trim() ? groupName : `DLC ${groupId}`;
};

const formatTrophyBrowserMetric = (earnedCount: number, totalCount: number) =>
  `${Math.round(totalCount <= 0 ? 0 : (earnedCount / totalCount) * 100)}%`;

const filterTrophiesByGroup = (
  trophies: TrophyBrowserItem[],
  groupId: string | null,
) => (groupId == null ? trophies : trophies.filter((trophy) => trophy.trophyGroupId === groupId));

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
    return (
      settings.stripVisibility.overall.artwork ||
      settings.stripVisibility.currentGame.artwork ||
      settings.showTargetTrophyArtwork
    );
  }

  if (zone === "identity") {
    return (
      settings.stripVisibility.overall.identity ||
      settings.stripVisibility.currentGame.identity ||
      settings.stripVisibility.unearnedTrophies.identity
    );
  }

  if (zone === "metrics") {
    return (
      settings.stripVisibility.overall.metrics ||
      settings.stripVisibility.currentGame.metrics ||
      settings.stripVisibility.unearnedTrophies.metrics
    );
  }

  if (zone === "targetInfo") {
    return settings.showTargetTrophyInfo;
  }

  return (
    settings.stripVisibility.overall.trophies ||
    settings.stripVisibility.currentGame.trophies ||
    settings.stripVisibility.unearnedTrophies.trophies
  );
};

export function App() {
  const path = window.location.pathname;

  useEffect(() => {
    document.body.classList.toggle("overlay-body", path.startsWith("/overlay"));
    return () => document.body.classList.remove("overlay-body");
  }, [path]);

  if (path === overlayRoutePaths.loop) {
    return <LoopOverlay />;
  }

  if (path === overlayRoutePaths.overall) {
    return <OverallOverlay />;
  }

  if (path === overlayRoutePaths.currentGame) {
    return <CurrentGameOverlay />;
  }

  if (path === overlayRoutePaths.unearnedTrophies) {
    return <UnearnedTrophiesOverlay />;
  }

  if (path === overlayRoutePaths.targetTrophy) {
    return <TargetTrophyOverlay />;
  }

  if (path === overlayRoutePaths.brb) {
    return <BeRightBackOverlay />;
  }

  if (path === overlayRoutePaths.earnedSession) {
    return <EarnedSessionOverlay />;
  }

  if (path === overlayRoutePaths.cameraBorder) {
    return <CameraBorderOverlay />;
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
  const [trophyBrowserSubTab, setTrophyBrowserSubTab] =
    useState<TrophyBrowserSubTabKey>("all");
  const [unearnedTrophies, setUnearnedTrophies] =
    useState<UnearnedTrophiesResponse>(defaultUnearnedTrophies);
  const [unearnedTrophiesLoading, setUnearnedTrophiesLoading] = useState(false);
  const [unearnedTrophiesError, setUnearnedTrophiesError] = useState<string | null>(null);
  const [hasAttemptedUnearnedTrophiesLoad, setHasAttemptedUnearnedTrophiesLoad] =
    useState(false);
  const [unearnedSortMode, setUnearnedSortMode] =
    useState<UnearnedSortMode>(DEFAULT_UNEARNED_SORT_MODE);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);
  const [psnAccessOpen, setPsnAccessOpen] = useState(false);
  const [psnAccessIssue, setPsnAccessIssue] = useState<PsnAccessIssue>(null);
  const [activeGamePendingId, setActiveGamePendingId] = useState<string | null>(null);
  const [targetPendingKey, setTargetPendingKey] = useState<string | null>(null);
  const [savingAdvancedGame, setSavingAdvancedGame] = useState(false);
  const [draggedStripZone, setDraggedStripZone] = useState<StripZoneKey | null>(null);
  const [dropStripIndex, setDropStripIndex] = useState<number | null>(null);
  const [copiedRouteKey, setCopiedRouteKey] = useState<OverlayRouteKey | null>(null);
  const [brbActionPending, setBrbActionPending] = useState(false);
  const [earnedSessionActionPending, setEarnedSessionActionPending] = useState(false);
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

  const loadUnearnedTrophies = async () => {
    setUnearnedTrophiesLoading(true);
    setUnearnedTrophiesError(null);
    setHasAttemptedUnearnedTrophiesLoad(true);

    try {
      const nextUnearnedTrophies = await api.getUnearnedTrophies();
      setUnearnedTrophies(nextUnearnedTrophies);
    } catch (error) {
      const nextPsnAccessIssue = resolvePsnAccessIssue(error);
      setUnearnedTrophiesError(
        extractErrorMessage(error, "Unable to load unearned trophies."),
      );
      setPsnAccessIssue(nextPsnAccessIssue);
      if (nextPsnAccessIssue) {
        setPsnAccessOpen(true);
      }
      setDebugPayload(error);
    } finally {
      setUnearnedTrophiesLoading(false);
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
  const unearnedTrophyCount = unearnedTrophies.trophies.length;

  const trophyBrowserTabs = useMemo(() => {
    if (titleTrophies.trophies.length === 0) {
      return [] satisfies TrophyBrowserSubTab[];
    }

    const tabs: TrophyBrowserSubTab[] = [
      {
        key: "all",
        label: "All",
        metricLabel: formatTrophyBrowserMetric(
          titleTrophies.trophies.filter((trophy) => trophy.earned).length,
          titleTrophies.trophies.length,
        ),
        groupId: null,
        listMode: "unearned",
      },
      {
        key: buildTrophyBrowserSubTabKey(DEFAULT_TROPHY_GROUP_ID),
        label: "Main Game",
        metricLabel: formatTrophyBrowserMetric(
          titleTrophies.trophies.filter(
            (trophy) => trophy.trophyGroupId === DEFAULT_TROPHY_GROUP_ID && trophy.earned,
          ).length,
          titleTrophies.trophies.filter(
            (trophy) => trophy.trophyGroupId === DEFAULT_TROPHY_GROUP_ID,
          ).length,
        ),
        groupId: DEFAULT_TROPHY_GROUP_ID,
        listMode: "unearned",
      },
    ];

    const dlcGroups = Array.from(
      titleTrophies.trophies.reduce(
        (groups, trophy) => {
          if (trophy.trophyGroupId === DEFAULT_TROPHY_GROUP_ID) {
            return groups;
          }

          const existingGroup = groups.get(trophy.trophyGroupId);
          if (!existingGroup || (!existingGroup.groupName && trophy.groupName)) {
            groups.set(trophy.trophyGroupId, {
              groupId: trophy.trophyGroupId,
              groupName: trophy.groupName,
            });
          }

          return groups;
        },
        new Map<string, { groupId: string; groupName: string | null }>(),
      ).values(),
    ).sort((left, right) => left.groupId.localeCompare(right.groupId));

    dlcGroups.forEach((group) => {
      const groupTrophies = filterTrophiesByGroup(titleTrophies.trophies, group.groupId);
      tabs.push({
        key: buildTrophyBrowserSubTabKey(group.groupId),
        label: resolveTrophyBrowserGroupLabel(group.groupId, group.groupName),
        metricLabel: formatTrophyBrowserMetric(
          groupTrophies.filter((trophy) => trophy.earned).length,
          groupTrophies.length,
        ),
        groupId: group.groupId,
        listMode: "unearned",
      });
    });

    tabs.push({
      key: "earned",
      label: "Earned",
      metricLabel: null,
      groupId: null,
      listMode: "earned",
    });

    return tabs;
  }, [titleTrophies.trophies]);

  const activeTrophyBrowserTab =
    trophyBrowserTabs.find((tab) => tab.key === trophyBrowserSubTab) ??
    trophyBrowserTabs[0] ??
    null;

  const currentTargetSelectionKey = titleTrophies.target
    ? buildTrophySelectionKey(
        titleTrophies.target.npCommunicationId,
        titleTrophies.target.trophyGroupId,
        titleTrophies.target.trophyId,
      )
    : null;
  const currentTargetClearPendingKey = titleTrophies.target
    ? `clear:${titleTrophies.target.npCommunicationId}`
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
  const trophyBrowserQualifiedEntries = useMemo(() => {
    if (!activeTrophyBrowserTab) {
      return [];
    }

    const scopedTrophies = filterTrophiesByGroup(
      titleTrophies.trophies,
      activeTrophyBrowserTab.groupId,
    );

    return activeTrophyBrowserTab.listMode === "earned"
      ? scopedTrophies.filter((trophy) => trophy.earned)
      : scopedTrophies.filter((trophy) => !trophy.earned);
  }, [activeTrophyBrowserTab, titleTrophies.trophies]);
  const trophyBrowserEntries = useMemo(
    () =>
      trophyBrowserQualifiedEntries.filter((trophy) => {
        const trophyKey = buildTrophySelectionKey(
          trophy.npCommunicationId,
          trophy.trophyGroupId,
          trophy.trophyId,
        );
        return trophyKey !== currentTargetSelectionKey;
      }),
    [currentTargetSelectionKey, trophyBrowserQualifiedEntries],
  );
  const sortedUnearnedTrophies = useMemo(() => {
    const rows = [...unearnedTrophies.trophies];

    const compareRateAscending = (left: number | null, right: number | null) => {
      if (left == null && right == null) {
        return 0;
      }

      if (left == null) {
        return 1;
      }

      if (right == null) {
        return -1;
      }

      return left - right;
    };

    const compareRateDescending = (left: number | null, right: number | null) =>
      left == null && right == null
        ? 0
        : left == null
          ? 1
          : right == null
            ? -1
            : right - left;

    rows.sort((left, right) => {
      if (unearnedSortMode === "easiestFirst") {
        const rateComparison = compareRateDescending(
          left.trophyEarnedRate,
          right.trophyEarnedRate,
        );

        if (rateComparison !== 0) {
          return rateComparison;
        }
      }

      if (unearnedSortMode === "hardestFirst") {
        const rateComparison = compareRateAscending(
          left.trophyEarnedRate,
          right.trophyEarnedRate,
        );

        if (rateComparison !== 0) {
          return rateComparison;
        }
      }

      if (unearnedSortMode === "titleAsc") {
        const titleComparison = left.titleName.localeCompare(right.titleName);

        if (titleComparison !== 0) {
          return titleComparison;
        }

        const rateComparison = compareRateDescending(
          left.trophyEarnedRate,
          right.trophyEarnedRate,
        );

        if (rateComparison !== 0) {
          return rateComparison;
        }
      }

      if (unearnedSortMode === "recentlyActiveTitle") {
        const leftUpdatedAt = left.titleLastUpdated ? Date.parse(left.titleLastUpdated) : null;
        const rightUpdatedAt = right.titleLastUpdated ? Date.parse(right.titleLastUpdated) : null;

        if (leftUpdatedAt == null && rightUpdatedAt != null) {
          return 1;
        }

        if (leftUpdatedAt != null && rightUpdatedAt == null) {
          return -1;
        }

        if (
          leftUpdatedAt != null &&
          rightUpdatedAt != null &&
          leftUpdatedAt !== rightUpdatedAt
        ) {
          return rightUpdatedAt - leftUpdatedAt;
        }

        const rateComparison = compareRateDescending(
          left.trophyEarnedRate,
          right.trophyEarnedRate,
        );

        if (rateComparison !== 0) {
          return rateComparison;
        }
      }

      const titleComparison = left.titleName.localeCompare(right.titleName);

      if (titleComparison !== 0) {
        return titleComparison;
      }

      const trophyNameComparison = (left.name ?? "").localeCompare(right.name ?? "");

      if (trophyNameComparison !== 0) {
        return trophyNameComparison;
      }

      return left.trophyId - right.trophyId;
    });

    return rows;
  }, [unearnedSortMode, unearnedTrophies.trophies]);
  const trophyBrowserSectionCaption =
    activeTrophyBrowserTab?.listMode === "earned"
      ? `Earned trophies ${trophyBrowserQualifiedEntries.length}`
      : `Unearned trophies ${trophyBrowserQualifiedEntries.length}`;
  const trophyBrowserEmptyMessage =
    activeTrophyBrowserTab?.listMode === "earned"
      ? "No earned trophies in this title yet."
      : "No unearned trophies in this tab.";
  const psnTokenStatusLabel = psnTokenStatus.configured ? "Saved locally" : "No token saved";
  const psnTokenUpdatedLabel = useMemo(
    () => formatTimestamp(psnTokenStatus.updatedAt),
    [psnTokenStatus.updatedAt],
  );
  const openPsnTokenPage = () => {
    window.open(PSN_TOKEN_URL, "_blank", "noopener,noreferrer");
  };

  useEffect(() => {
    if (
      (workspaceTab === "trophies" || workspaceTab === "allUnearned") &&
      !trophyBrowserAvailable
    ) {
      setWorkspaceTab("games");
    }
  }, [trophyBrowserAvailable, workspaceTab]);

  useEffect(() => {
    if (
      workspaceTab === "allUnearned" &&
      trophyBrowserAvailable &&
      !hasAttemptedUnearnedTrophiesLoad &&
      !unearnedTrophiesLoading
    ) {
      void loadUnearnedTrophies();
    }
  }, [
    hasAttemptedUnearnedTrophiesLoad,
    trophyBrowserAvailable,
    unearnedTrophiesLoading,
    workspaceTab,
  ]);

  useEffect(() => {
    setTrophyBrowserSubTab("all");
  }, [selectedPsnTitleId]);

  useEffect(() => {
    if (!trophyBrowserAvailable || titleTrophiesLoading || trophyBrowserTabs.length === 0) {
      return;
    }

    if (!trophyBrowserTabs.some((tab) => tab.key === trophyBrowserSubTab)) {
      setTrophyBrowserSubTab("all");
    }
  }, [
    titleTrophiesLoading,
    trophyBrowserAvailable,
    trophyBrowserSubTab,
    trophyBrowserTabs,
  ]);

  const clearPendingSettingsSave = () => {
    if (pendingSettingsSaveTimeoutRef.current != null) {
      window.clearTimeout(pendingSettingsSaveTimeoutRef.current);
      pendingSettingsSaveTimeoutRef.current = null;
    }
  };

  const flushPendingSettingsSave = async () => {
    if (pendingSettingsSaveTimeoutRef.current == null) {
      return;
    }

    const editVersion = settingsEditVersionRef.current;
    clearPendingSettingsSave();
    await persistSettings(settingsRef.current, editVersion);
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

  const copyRouteUrl = async (routeKey: OverlayRouteKey, url: string) => {
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

  const applyBrbState = (nextBrb: OverlayBrbCard) => {
    setOverlayData((current) => ({
      ...current,
      brb: nextBrb,
      display: {
        ...current.display,
        settings: settingsRef.current,
      },
    }));
  };

  const runBrbAction = async (request: UpdateBrbRequest, pendingLabel: string, successLabel: string) => {
    setBrbActionPending(true);

    try {
      await flushPendingSettingsSave();
      setStatusMessage(pendingLabel);
      const nextBrb = await api.updateBrb(request);
      applyBrbState(nextBrb);
      setStatusMessage(successLabel);
    } catch (error) {
      const nextPsnAccessIssue = resolvePsnAccessIssue(error);
      setPsnAccessIssue(nextPsnAccessIssue);
      if (nextPsnAccessIssue) {
        setPsnAccessOpen(true);
      }
      setStatusMessage("BRB update failed");
      setDebugPayload(error);
    } finally {
      setBrbActionPending(false);
    }
  };

  const applyEarnedSessionState = (nextEarnedSession: OverlayEarnedSessionCard) => {
    setOverlayData((current) => ({
      ...current,
      earnedSession: nextEarnedSession,
      display: {
        ...current.display,
        settings: settingsRef.current,
      },
    }));
  };

  const runEarnedSessionAction = async (
    request: UpdateEarnedSessionRequest,
    pendingLabel: string,
    successLabel: string,
  ) => {
    setEarnedSessionActionPending(true);

    try {
      await flushPendingSettingsSave();
      setStatusMessage(pendingLabel);
      const nextEarnedSession = await api.updateEarnedSession(request);
      applyEarnedSessionState(nextEarnedSession);
      setStatusMessage(successLabel);
    } catch (error) {
      const nextPsnAccessIssue = resolvePsnAccessIssue(error);
      setPsnAccessIssue(nextPsnAccessIssue);
      if (nextPsnAccessIssue) {
        setPsnAccessOpen(true);
      }
      setStatusMessage("Earned session update failed");
      setDebugPayload(error);
    } finally {
      setEarnedSessionActionPending(false);
    }
  };

  const setLoopVisibility = (
    view: keyof OverlaySettings["loopVisibility"],
    nextValue: boolean,
  ) => {
    updateSettingsWithPersistence((current) => {
      if (current.loopVisibility[view] === nextValue) {
        return current;
      }

      return {
        ...current,
        loopVisibility: {
          ...current.loopVisibility,
          [view]: nextValue,
        },
      };
    }, "immediate");
  };

  const setStripVisibility = (
    view: keyof OverlaySettings["stripVisibility"],
    section: keyof OverlaySettings["stripVisibility"]["overall"],
    nextValue: boolean,
  ) => {
    updateSettingsWithPersistence((current) => {
      if (view === "unearnedTrophies" && section === "artwork") {
        return current;
      }

      if (current.stripVisibility[view][section] === nextValue) {
        return current;
      }

      return {
        ...current,
        stripVisibility: {
          ...current.stripVisibility,
          [view]: {
            ...current.stripVisibility[view],
            [section]: nextValue,
          },
        },
      };
    }, "immediate");
  };

  const setDurationSetting = (
    key:
      | "overallDurationMs"
      | "unearnedTrophiesDurationMs"
      | "currentGameDurationMs"
      | "targetTrophyDurationMs"
      | "brbDurationMs",
    nextValue: number | null,
  ) => {
    updateSettingsWithPersistence((current) => {
      const resolvedValue = nextValue ?? current[key];

      return resolvedValue === current[key]
        ? current
        : {
            ...current,
            [key]: resolvedValue,
          };
    }, "debounced");
  };

  const setUnearnedDetailedProgressVisibility = (nextValue: boolean) => {
    updateSettingsWithPersistence((current) => {
      if (current.showUnearnedDetailedProgress === nextValue) {
        return current;
      }

      return {
        ...current,
        showUnearnedDetailedProgress: nextValue,
      };
    }, "immediate");
  };

  const setCameraBorderSetting = (
    key: keyof OverlaySettings["cameraBorder"],
    nextValue: number | null,
  ) => {
    updateSettingsWithPersistence((current) => {
      const resolvedValue = nextValue ?? current.cameraBorder[key];

      return resolvedValue === current.cameraBorder[key]
        ? current
        : {
            ...current,
            cameraBorder: {
              ...current.cameraBorder,
              [key]: resolvedValue,
            },
      };
    }, "debounced");
  };

  const setOverlayBackgroundTransparency = (
    key: keyof OverlaySettings["overlayAppearance"],
    nextValue: number | null,
  ) => {
    updateSettingsWithPersistence((current) => {
      const resolvedValue =
        nextValue ?? current.overlayAppearance[key].backgroundTransparencyPercent;

      return resolvedValue === current.overlayAppearance[key].backgroundTransparencyPercent
        ? current
        : {
            ...current,
            overlayAppearance: {
              ...current.overlayAppearance,
              [key]: {
                ...current.overlayAppearance[key],
                backgroundTransparencyPercent: resolvedValue,
              },
            },
          };
    }, "debounced");
  };

  const setOverlayArtworkRadius = (
    key: "overall" | "currentGame" | "targetTrophy" | "brb",
    nextValue: number | null,
  ) => {
    updateSettingsWithPersistence((current) => {
      const resolvedValue = nextValue ?? current.overlayAppearance[key].artworkRadiusPx;

      return resolvedValue === current.overlayAppearance[key].artworkRadiusPx
        ? current
        : {
            ...current,
            overlayAppearance: {
              ...current.overlayAppearance,
              [key]: {
                ...current.overlayAppearance[key],
                artworkRadiusPx: resolvedValue,
              },
            },
          };
    }, "debounced");
  };

  const loopToggleOrder: Array<keyof OverlaySettings["loopVisibility"]> = [
    "overall",
    "unearnedTrophies",
    "currentGame",
    "targetTrophy",
  ];
  const brbState = overlayData.brb;
  const earnedSessionState = overlayData.earnedSession;

  const renderRouteControls = (routeKey: OverlayRouteKey) => {
    if (routeKey === "loop") {
      return (
        <RouteToggleGroup
          routeLabel="Loop"
          toggles={loopToggleOrder.map((view) => ({
            label: loopToggleLabels[view],
            pressed: settings.loopVisibility[view],
            onToggle: () => setLoopVisibility(view, !settings.loopVisibility[view]),
          }))}
        />
      );
    }

    if (routeKey === "overall") {
      return (
        <>
          <RouteToggleGroup
            routeLabel="Overall"
            toggles={[
              {
                label: stripToggleLabels.artwork,
                pressed: settings.stripVisibility.overall.artwork,
                onToggle: () =>
                  setStripVisibility(
                    "overall",
                    "artwork",
                    !settings.stripVisibility.overall.artwork,
                  ),
              },
              {
                label: stripToggleLabels.identity,
                pressed: settings.stripVisibility.overall.identity,
                onToggle: () =>
                  setStripVisibility(
                    "overall",
                    "identity",
                    !settings.stripVisibility.overall.identity,
                  ),
              },
              {
                label: stripToggleLabels.metrics,
                pressed: settings.stripVisibility.overall.metrics,
                onToggle: () =>
                  setStripVisibility(
                    "overall",
                    "metrics",
                    !settings.stripVisibility.overall.metrics,
                  ),
              },
              {
                label: stripToggleLabels.trophies,
                pressed: settings.stripVisibility.overall.trophies,
                onToggle: () =>
                  setStripVisibility(
                    "overall",
                    "trophies",
                    !settings.stripVisibility.overall.trophies,
                  ),
              },
            ]}
          />
          <InlineNumberField
            ariaLabel="Overall duration"
            label="Duration"
            value={settings.overallDurationMs}
            onChange={(value) => setDurationSetting("overallDurationMs", value)}
          />
          <InlineNumberField
            ariaLabel="Overall opacity"
            label="Opacity"
            value={settings.overlayAppearance.overall.backgroundTransparencyPercent}
            min={0}
            max={100}
            step={1}
            onChange={(value) => setOverlayBackgroundTransparency("overall", value)}
          />
          <InlineNumberField
            ariaLabel="Overall artwork radius"
            label="Artwork radius"
            value={settings.overlayAppearance.overall.artworkRadiusPx}
            min={0}
            max={100}
            step={1}
            onChange={(value) => setOverlayArtworkRadius("overall", value)}
          />
        </>
      );
    }

    if (routeKey === "unearnedTrophies") {
      return (
        <>
          <RouteToggleGroup
            routeLabel="Unearned trophies"
            toggles={[
              {
                label: stripToggleLabels.identity,
                pressed: settings.stripVisibility.unearnedTrophies.identity,
                onToggle: () =>
                  setStripVisibility(
                    "unearnedTrophies",
                    "identity",
                    !settings.stripVisibility.unearnedTrophies.identity,
                  ),
              },
              {
                label: stripToggleLabels.metrics,
                pressed: settings.stripVisibility.unearnedTrophies.metrics,
                onToggle: () =>
                  setStripVisibility(
                    "unearnedTrophies",
                    "metrics",
                    !settings.stripVisibility.unearnedTrophies.metrics,
                  ),
              },
              {
                label: unearnedDetailedProgressToggleLabel,
                pressed: settings.showUnearnedDetailedProgress,
                onToggle: () =>
                  setUnearnedDetailedProgressVisibility(
                    !settings.showUnearnedDetailedProgress,
                  ),
              },
              {
                label: stripToggleLabels.trophies,
                pressed: settings.stripVisibility.unearnedTrophies.trophies,
                onToggle: () =>
                  setStripVisibility(
                    "unearnedTrophies",
                    "trophies",
                    !settings.stripVisibility.unearnedTrophies.trophies,
                  ),
              },
            ]}
          />
          <InlineTextField
            ariaLabel="Unearned trophies label text"
            hideLabel
            placeholder="Unearned"
            value={settings.unearnedTrophiesLabelText}
            onChange={(value) =>
              updateSettingsWithPersistence((current) =>
                value === current.unearnedTrophiesLabelText
                  ? current
                  : {
                      ...current,
                      unearnedTrophiesLabelText: value,
                    }, "debounced")
            }
          />
          <InlineNumberField
            ariaLabel="Unearned trophies duration"
            label="Duration"
            value={settings.unearnedTrophiesDurationMs}
            onChange={(value) => setDurationSetting("unearnedTrophiesDurationMs", value)}
          />
          <InlineNumberField
            ariaLabel="Unearned trophies opacity"
            label="Opacity"
            value={settings.overlayAppearance.unearnedTrophies.backgroundTransparencyPercent}
            min={0}
            max={100}
            step={1}
            onChange={(value) =>
              setOverlayBackgroundTransparency("unearnedTrophies", value)}
          />
        </>
      );
    }

    if (routeKey === "currentGame") {
      return (
        <>
          <RouteToggleGroup
            routeLabel="Current game"
            toggles={[
              {
                label: stripToggleLabels.artwork,
                pressed: settings.stripVisibility.currentGame.artwork,
                onToggle: () =>
                  setStripVisibility(
                    "currentGame",
                    "artwork",
                    !settings.stripVisibility.currentGame.artwork,
                  ),
              },
              {
                label: stripToggleLabels.identity,
                pressed: settings.stripVisibility.currentGame.identity,
                onToggle: () =>
                  setStripVisibility(
                    "currentGame",
                    "identity",
                    !settings.stripVisibility.currentGame.identity,
                  ),
              },
              {
                label: stripToggleLabels.metrics,
                pressed: settings.stripVisibility.currentGame.metrics,
                onToggle: () =>
                  setStripVisibility(
                    "currentGame",
                    "metrics",
                    !settings.stripVisibility.currentGame.metrics,
                  ),
              },
              {
                label: stripToggleLabels.trophies,
                pressed: settings.stripVisibility.currentGame.trophies,
                onToggle: () =>
                  setStripVisibility(
                    "currentGame",
                    "trophies",
                    !settings.stripVisibility.currentGame.trophies,
                  ),
              },
            ]}
          />
          <InlineNumberField
            ariaLabel="Current game duration"
            label="Duration"
            value={settings.currentGameDurationMs}
            onChange={(value) => setDurationSetting("currentGameDurationMs", value)}
          />
          <InlineNumberField
            ariaLabel="Current game opacity"
            label="Opacity"
            value={settings.overlayAppearance.currentGame.backgroundTransparencyPercent}
            min={0}
            max={100}
            step={1}
            onChange={(value) => setOverlayBackgroundTransparency("currentGame", value)}
          />
          <InlineNumberField
            ariaLabel="Current game artwork radius"
            label="Artwork radius"
            value={settings.overlayAppearance.currentGame.artworkRadiusPx}
            min={0}
            max={100}
            step={1}
            onChange={(value) => setOverlayArtworkRadius("currentGame", value)}
          />
        </>
      );
    }

    if (routeKey === "targetTrophy") {
      return (
        <>
          <RouteToggleGroup
            routeLabel="Target trophy"
            toggles={[
              {
                label: "Artwork",
                pressed: settings.showTargetTrophyArtwork,
                onToggle: () =>
                  updateSettingsWithPersistence((current) =>
                    ({
                      ...current,
                      showTargetTrophyArtwork: !current.showTargetTrophyArtwork,
                    }), "immediate"),
              },
              {
                label: "Tag",
                pressed: settings.showTargetTrophyTag,
                onToggle: () =>
                  updateSettingsWithPersistence((current) =>
                    ({
                      ...current,
                      showTargetTrophyTag: !current.showTargetTrophyTag,
                    }), "immediate"),
              },
              {
                label: "Info",
                pressed: settings.showTargetTrophyInfo,
                onToggle: () =>
                  updateSettingsWithPersistence((current) =>
                    ({
                      ...current,
                      showTargetTrophyInfo: !current.showTargetTrophyInfo,
                    }), "immediate"),
              },
            ]}
          />
          <InlineNumberField
            ariaLabel="Target trophy duration"
            label="Duration"
            value={settings.targetTrophyDurationMs}
            onChange={(value) => setDurationSetting("targetTrophyDurationMs", value)}
          />
          <InlineTextField
            ariaLabel="Target trophy tag text"
            hideLabel
            placeholder="Current target"
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
          <InlineNumberField
            ariaLabel="Target trophy opacity"
            label="Opacity"
            value={settings.overlayAppearance.targetTrophy.backgroundTransparencyPercent}
            min={0}
            max={100}
            step={1}
            onChange={(value) => setOverlayBackgroundTransparency("targetTrophy", value)}
          />
          <InlineNumberField
            ariaLabel="Target trophy artwork radius"
            label="Artwork radius"
            value={settings.overlayAppearance.targetTrophy.artworkRadiusPx}
            min={0}
            max={100}
            step={1}
            onChange={(value) => setOverlayArtworkRadius("targetTrophy", value)}
          />
        </>
      );
    }

    if (routeKey === "brb") {
      return (
        <>
          <RouteToggleGroup
            routeLabel="Be right back"
            toggles={[
              {
                label: "Artwork",
                pressed: settings.showBrbArtwork,
                onToggle: () =>
                  updateSettingsWithPersistence((current) =>
                    ({
                      ...current,
                      showBrbArtwork: !current.showBrbArtwork,
                    }), "immediate"),
              },
              {
                label: "Identity",
                pressed: settings.showBrbIdentity,
                onToggle: () =>
                  updateSettingsWithPersistence((current) =>
                    ({
                      ...current,
                      showBrbIdentity: !current.showBrbIdentity,
                    }), "immediate"),
              },
              {
                label: "Progress",
                pressed: settings.showBrbProgress,
                onToggle: () =>
                  updateSettingsWithPersistence((current) =>
                    ({
                      ...current,
                      showBrbProgress: !current.showBrbProgress,
                    }), "immediate"),
              },
            ]}
          />
          <InlineSecondsField
            ariaLabel="Be right back duration"
            label="Duration"
            valueMs={settings.brbDurationMs}
            onChangeMs={(value) => setDurationSetting("brbDurationMs", value)}
          />
          <InlineTextField
            ariaLabel="Be right back subtitle text"
            hideLabel
            placeholder="Intermission"
            value={settings.brbSubtitleText}
            onChange={(value) =>
              updateSettingsWithPersistence((current) =>
                value === current.brbSubtitleText
                  ? current
                  : {
                      ...current,
                      brbSubtitleText: value,
                    }, "debounced")
            }
          />
          <InlineNumberField
            ariaLabel="Be right back opacity"
            label="Opacity"
            value={settings.overlayAppearance.brb.backgroundTransparencyPercent}
            min={0}
            max={100}
            step={1}
            onChange={(value) => setOverlayBackgroundTransparency("brb", value)}
          />
          <InlineNumberField
            ariaLabel="Be right back artwork radius"
            label="Artwork radius"
            value={settings.overlayAppearance.brb.artworkRadiusPx}
            min={0}
            max={100}
            step={1}
            onChange={(value) => setOverlayArtworkRadius("brb", value)}
          />
          <ToggleChipButton
            ariaLabel="Be right back Visible"
            label="Visible"
            pressed={brbState.visible}
            disabled={brbActionPending || brbState.status === "stopped"}
            onToggle={() =>
              void runBrbAction(
                {
                  action: "setVisibility",
                  visible: !brbState.visible,
                },
                brbState.visible ? "Hiding BRB overlay" : "Showing BRB overlay",
                brbState.visible ? "BRB overlay hidden" : "BRB overlay visible",
              )
            }
          />
          <RouteActionGroup
            actions={[
              {
                label: brbState.status === "paused" ? "Resume" : "Start",
                disabled:
                  brbActionPending ||
                  (brbState.status !== "stopped" &&
                    brbState.status !== "paused" &&
                    brbState.status !== "expired"),
                onClick: () =>
                  void runBrbAction(
                    {
                      action: brbState.status === "paused" ? "resume" : "start",
                    },
                    brbState.status === "paused" ? "Resuming BRB countdown" : "Starting BRB countdown",
                    brbState.status === "paused" ? "BRB countdown resumed" : "BRB countdown started",
                  ),
              },
              {
                label: "Pause",
                disabled: brbActionPending || brbState.status !== "running",
                onClick: () =>
                  void runBrbAction(
                    { action: "pause" },
                    "Pausing BRB countdown",
                    "BRB countdown paused",
                  ),
              },
              {
                label: "Stop",
                disabled: brbActionPending || brbState.status === "stopped",
                onClick: () =>
                  void runBrbAction(
                    { action: "stop" },
                    "Stopping BRB countdown",
                    "BRB countdown stopped",
                  ),
              },
            ]}
          />
        </>
      );
    }

    if (routeKey === "earnedSession") {
      return (
        <>
          <RouteToggleGroup
            routeLabel="Earned this session"
            toggles={[
              {
                label: "Identity",
                pressed: settings.showEarnedSessionIdentity,
                onToggle: () =>
                  updateSettingsWithPersistence((current) =>
                    ({
                      ...current,
                      showEarnedSessionIdentity: !current.showEarnedSessionIdentity,
                    }), "immediate"),
              },
              {
                label: "Trophies",
                pressed: settings.showEarnedSessionTrophies,
                onToggle: () =>
                  updateSettingsWithPersistence((current) =>
                    ({
                      ...current,
                      showEarnedSessionTrophies: !current.showEarnedSessionTrophies,
                    }), "immediate"),
              },
            ]}
          />
          <InlineTextField
            ariaLabel="Earned this session heading text"
            hideLabel
            placeholder="Earned This Session"
            value={settings.earnedSessionHeadingText}
            onChange={(value) =>
              updateSettingsWithPersistence((current) =>
                value === current.earnedSessionHeadingText
                  ? current
                  : {
                      ...current,
                      earnedSessionHeadingText: value,
                    }, "debounced")
            }
          />
          <InlineNumberField
            ariaLabel="Earned this session opacity"
            label="Opacity"
            value={settings.overlayAppearance.earnedSession.backgroundTransparencyPercent}
            min={0}
            max={100}
            step={1}
            onChange={(value) => setOverlayBackgroundTransparency("earnedSession", value)}
          />
          <InlineGradeIncrementField
            label="Manually increment"
            disabled={earnedSessionActionPending}
            onIncrement={(grade) =>
              void runEarnedSessionAction(
                {
                  action: "increment",
                  grade,
                },
                `Adding ${grade} trophy to session`,
                "Earned session updated",
              )
            }
          />
          <ToggleChipButton
            ariaLabel="Earned this session Visible"
            label="Visible"
            pressed={earnedSessionState.visible}
            disabled={earnedSessionActionPending}
            onToggle={() =>
              void runEarnedSessionAction(
                {
                  action: "setVisibility",
                  visible: !earnedSessionState.visible,
                },
                earnedSessionState.visible
                  ? "Hiding earned session overlay"
                  : "Showing earned session overlay",
                earnedSessionState.visible
                  ? "Earned session overlay hidden"
                  : "Earned session overlay visible",
              )
            }
          />
          <RouteActionGroup
            actions={[
              {
                label: "Reset",
                disabled: earnedSessionActionPending,
                onClick: () =>
                  void runEarnedSessionAction(
                    { action: "reset" },
                    "Resetting earned session",
                    "Earned session reset",
                  ),
              },
            ]}
          />
        </>
      );
    }

    if (routeKey === "cameraBorder") {
      return (
        <>
          <InlineNumberField
            ariaLabel="Camera border inset"
            label="Inset"
            value={settings.cameraBorder.baseInsetPx}
            onChange={(value) => setCameraBorderSetting("baseInsetPx", value)}
          />
          <InlineNumberField
            ariaLabel="Camera border thickness"
            label="Thickness"
            value={settings.cameraBorder.baseThicknessPx}
            onChange={(value) => setCameraBorderSetting("baseThicknessPx", value)}
          />
          <InlineNumberField
            ariaLabel="Camera border radius"
            label="Radius"
            value={settings.cameraBorder.baseRadiusPx}
            onChange={(value) => setCameraBorderSetting("baseRadiusPx", value)}
          />
          <InlineNumberField
            ariaLabel="Camera border cutout radius"
            label="Cutout radius"
            value={settings.cameraBorder.baseCutoutRadiusPx}
            onChange={(value) => setCameraBorderSetting("baseCutoutRadiusPx", value)}
          />
          <InlineNumberField
            ariaLabel="Camera border opacity"
            label="Opacity"
            value={settings.cameraBorder.opacityPercent}
            min={0}
            max={100}
            step={1}
            onChange={(value) => setCameraBorderSetting("opacityPercent", value)}
          />
        </>
      );
    }

    return null;
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

  const updateTargetTrophyForTitle = async (
    npCommunicationId: string | null,
    trophy: TargetableTrophy | null,
  ) => {
    if (!npCommunicationId) {
      return;
    }

    const previousTarget = npCommunicationId === selectedPsnTitleId
      ? titleTrophies.target
      : null;
    const previousUnearnedTrophies = unearnedTrophies;
    const request = toTargetRequest(npCommunicationId, trophy);
    const nextTargetKey =
      trophy == null
        ? `clear:${npCommunicationId}`
        : buildTrophySelectionKey(npCommunicationId, trophy.trophyGroupId, trophy.trophyId);

    setTargetPendingKey(nextTargetKey);
    if (npCommunicationId === selectedPsnTitleId) {
      setTitleTrophies((current) => ({
        ...current,
        target:
          trophy == null
            ? null
            : {
                npCommunicationId,
                trophyId: trophy.trophyId,
                trophyGroupId: trophy.trophyGroupId,
                updatedAt: new Date().toISOString(),
              },
      }));
    }
    setUnearnedTrophies((current) => ({
      ...current,
      trophies: current.trophies.map((entry) => ({
        ...entry,
        target:
          entry.npCommunicationId === npCommunicationId &&
          trophy != null &&
          entry.trophyId === trophy.trophyId &&
          entry.trophyGroupId === trophy.trophyGroupId,
      })),
    }));
    setStatusMessage(trophy ? "Updating current trophy" : "Clearing current trophy");

    try {
      await api.saveTargetTrophy(request);
      const nextOverlayDataPromise = api.getOverlayData();
      const nextTitleTrophiesPromise = npCommunicationId === selectedPsnTitleId
        ? api.getTitleTrophies(npCommunicationId)
        : Promise.resolve(null);
      const [nextOverlayData, nextTitleTrophies] = await Promise.all([
        nextOverlayDataPromise,
        nextTitleTrophiesPromise,
      ]);
      setOverlayData(nextOverlayData);
      if (nextTitleTrophies) {
        setTitleTrophies(nextTitleTrophies);
      }
      setStatusMessage(trophy ? "Current trophy updated" : "Current trophy cleared");
    } catch (error) {
      if (npCommunicationId === selectedPsnTitleId) {
        setTitleTrophies((current) => ({
          ...current,
          target: previousTarget,
        }));
      }
      setUnearnedTrophies(previousUnearnedTrophies);
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
          currentTargetClearPendingKey={currentTargetClearPendingKey}
          targetPendingKey={targetPendingKey}
          onSelectSetup={() => setWorkspaceTab("setup")}
          onSelectGames={() => setWorkspaceTab("games")}
          onSelectTrophies={() => setWorkspaceTab("trophies")}
          onSelectAllUnearned={() => setWorkspaceTab("allUnearned")}
          onClearTarget={() => void updateTargetTrophyForTitle(selectedPsnTitleId, null)}
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
                {overlayRoutePreviewConfigs.map((route) => {
                  const anchored = route.anchored !== false;
                  const anchorKey = route.key as keyof OverlaySettings["overlayAnchors"];
                  const url = `${overlayUrlBase}${route.urlPath}`;

                  return (
                    <div className="overlay-preview-block" key={route.key}>
                      <RouteRow
                        anchor={anchored ? settings.overlayAnchors[anchorKey] : undefined}
                        anchorLabel={anchored ? `${route.routeLabel} anchor` : undefined}
                        copied={copiedRouteKey === route.key}
                        copyLabel={route.copyLabel}
                        controls={renderRouteControls(route.key)}
                        onAnchorChange={anchored
                          ? (value) =>
                              updateSettingsWithPersistence((current) =>
                                value === current.overlayAnchors[anchorKey]
                                  ? current
                                  : {
                                      ...current,
                                      overlayAnchors: {
                                        ...current.overlayAnchors,
                                        [anchorKey]: value,
                                      },
                                    }, "immediate")
                          : undefined}
                        onCopy={() => void copyRouteUrl(route.key, url)}
                        url={url}
                      />
                      <EmbeddedOverlayPreview
                        title={route.previewTitle}
                        srcPath={route.urlPath}
                        overlayData={overlayData}
                        settings={settings}
                        viewportWidth={route.viewportWidth}
                        viewportHeight={route.viewportHeight}
                      />
                    </div>
                  );
                })}
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
            className="workspace-panel trophy-browser-workspace"
            id="workspace-panel-trophies"
            role="tabpanel"
            aria-labelledby="workspace-tab-trophies"
          >
            {activeGame.mode === "custom" ? (
              <div className="trophy-browser-surface">
                <p className="panel-empty">
                  Switch back to a PSN title to browse and target trophies.
                </p>
              </div>
            ) : titleTrophiesLoading ? (
              <div className="trophy-browser-surface">
                <p className="panel-empty">Loading trophies…</p>
              </div>
            ) : titleTrophiesError ? (
              <div className="trophy-browser-surface">
                <p className="panel-error">{titleTrophiesError}</p>
              </div>
            ) : titleTrophies.trophies.length === 0 ? (
              <div className="trophy-browser-surface">
                <p className="panel-empty">
                  No trophies are available for the selected title.
                </p>
              </div>
            ) : (
              <>
                {currentTargetTrophy ? (
                  <div className="trophy-browser-target-rail">
                    <TrophyCard
                      trophy={currentTargetTrophy}
                      active
                      featured
                      pending={targetPendingKey === currentTargetSelectionKey}
                      onSelect={() =>
                        void updateTargetTrophyForTitle(
                          currentTargetTrophy.npCommunicationId,
                          currentTargetTrophy,
                        )}
                    />
                  </div>
                ) : null}

                <div className="trophy-browser-surface">
                <div className="trophy-browser-stack">
                  <div
                    className="trophy-browser-tablist"
                    role="tablist"
                    aria-label="Trophy browser groups"
                  >
                    {trophyBrowserTabs.map((tab) => {
                      const tabId = `trophy-browser-tab-${sanitizeTrophyBrowserSubTabKey(tab.key)}`;
                      const panelId = `trophy-browser-panel-${sanitizeTrophyBrowserSubTabKey(tab.key)}`;

                      return (
                        <button
                          key={tab.key}
                          id={tabId}
                          className={`trophy-browser-tab ${
                            activeTrophyBrowserTab?.key === tab.key ? "is-active" : ""
                          }`}
                          type="button"
                          role="tab"
                          aria-selected={activeTrophyBrowserTab?.key === tab.key}
                          aria-controls={panelId}
                          onClick={() => setTrophyBrowserSubTab(tab.key)}
                        >
                          <span className="trophy-browser-tab-label">{tab.label}</span>
                          {tab.metricLabel ? (
                            <span className="trophy-browser-tab-metric">{tab.metricLabel}</span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>

                  {activeTrophyBrowserTab ? (
                    <div
                      id={`trophy-browser-panel-${sanitizeTrophyBrowserSubTabKey(
                        activeTrophyBrowserTab.key,
                      )}`}
                      className="trophy-section"
                    >
                      <p className="section-caption">{trophyBrowserSectionCaption}</p>
                      {trophyBrowserEntries.length > 0 ? (
                        <div className="trophy-card-grid">
                          {trophyBrowserEntries.map((trophy) => {
                            const trophyKey = buildTrophySelectionKey(
                              trophy.npCommunicationId,
                              trophy.trophyGroupId,
                              trophy.trophyId,
                            );
                            return (
                              <TrophyCard
                                key={trophyKey}
                                trophy={trophy}
                                active={currentTargetSelectionKey === trophyKey}
                                pending={targetPendingKey === trophyKey}
                                onSelect={() =>
                                  void updateTargetTrophyForTitle(
                                    trophy.npCommunicationId,
                                    trophy,
                                  )}
                              />
                            );
                          })}
                        </div>
                      ) : trophyBrowserQualifiedEntries.length === 0 ? (
                        <p className="panel-empty">{trophyBrowserEmptyMessage}</p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                </div>
              </>
            )}
          </section>
        ) : null}

        {workspaceTab === "allUnearned" && trophyBrowserAvailable ? (
          <section
            className="workspace-panel all-unearned-workspace"
            id="workspace-panel-all-unearned"
            role="tabpanel"
            aria-labelledby="workspace-tab-all-unearned"
          >
            <div className="workspace-subpanel all-unearned-surface">
              <div className="all-unearned-toolbar">
                <div className="all-unearned-toolbar-copy">
                  <p className="section-caption">All unearned trophies {unearnedTrophyCount}</p>
                  <p className="panel-footnote">
                    All played titles from PSN trophy history, sorted locally without refetching.
                  </p>
                </div>

                <div className="all-unearned-toolbar-actions">
                  <label className="field select-field all-unearned-sort-field">
                    <span>Sort order</span>
                    <div className="select-field-control">
                      <select
                        aria-label="All unearned sort order"
                        value={unearnedSortMode}
                        onChange={(event) =>
                          setUnearnedSortMode(event.target.value as UnearnedSortMode)}
                      >
                        {unearnedSortOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </label>

                  <button
                    className="ghost-button"
                    type="button"
                    disabled={unearnedTrophiesLoading}
                    onClick={() => void loadUnearnedTrophies()}
                  >
                    {unearnedTrophiesLoading ? "Refreshing…" : "Refresh unearned"}
                  </button>
                </div>
              </div>

              {unearnedTrophiesError ? <p className="panel-error">{unearnedTrophiesError}</p> : null}

              {unearnedTrophies.meta.warnings.length > 0 ? (
                <div className="all-unearned-warning-stack">
                  <p className="panel-footnote">
                    Partial data loaded. {unearnedTrophies.meta.warnings.length} titles returned
                    warnings.
                  </p>
                  <div className="all-unearned-warning-list">
                    {unearnedTrophies.meta.warnings.map((warning) => (
                      <p className="panel-footnote" key={warning}>
                        {warning}
                      </p>
                    ))}
                  </div>
                </div>
              ) : null}

              {unearnedTrophiesLoading && unearnedTrophies.trophies.length === 0 ? (
                <p className="panel-empty">Loading unearned trophies…</p>
              ) : null}

              {!unearnedTrophiesLoading &&
              !unearnedTrophiesError &&
              sortedUnearnedTrophies.length === 0 ? (
                <p className="panel-empty">
                  No unearned trophies are available across the current PSN trophy history.
                </p>
              ) : null}

              {sortedUnearnedTrophies.length > 0 ? (
                <>
                  <div className="all-unearned-list-header" aria-hidden="true">
                    <span>Trophy</span>
                    <span>Title</span>
                    <span>Group</span>
                    <span>Grade</span>
                    <span>Earned rate</span>
                    <span>Status</span>
                  </div>

                  <div className="all-unearned-list">
                    {sortedUnearnedTrophies.map((trophy) => {
                      const trophyKey = buildTrophySelectionKey(
                        trophy.npCommunicationId,
                        trophy.trophyGroupId,
                        trophy.trophyId,
                      );

                      return (
                        <button
                          key={trophyKey}
                          type="button"
                          className={`all-unearned-row ${trophy.target ? "is-target" : ""}`}
                          disabled={targetPendingKey === trophyKey}
                          onClick={() => void updateTargetTrophyForTitle(trophy.npCommunicationId, trophy)}
                        >
                          <div className="all-unearned-row-primary">
                            {trophy.iconUrl ? (
                              <img className="all-unearned-trophy-icon" src={trophy.iconUrl} alt="" />
                            ) : (
                              <div
                                className="all-unearned-trophy-icon all-unearned-trophy-icon-placeholder"
                                aria-hidden="true"
                              />
                            )}
                            <div className="all-unearned-row-copy">
                              <div className="all-unearned-row-title">
                                <img
                                  className="all-unearned-row-grade-icon"
                                  src={trophyBrowserGradeIcon[trophy.grade]}
                                  alt=""
                                />
                                <h3>{trophy.name ?? "Unnamed trophy"}</h3>
                              </div>
                              <p>{trophy.description ?? "No trophy description is available."}</p>
                            </div>
                          </div>

                          <div className="all-unearned-row-title-meta">
                            {trophy.titleIconUrl ? (
                              <img className="all-unearned-title-icon" src={trophy.titleIconUrl} alt="" />
                            ) : (
                              <div
                                className="all-unearned-title-icon all-unearned-title-icon-placeholder"
                                aria-hidden="true"
                              />
                            )}
                            <div>
                              <strong>{trophy.titleName}</strong>
                              <span>
                                {trophy.platform} · Updated {formatTitleLastUpdated(trophy.titleLastUpdated)}
                              </span>
                            </div>
                          </div>

                          <div className="all-unearned-row-meta">
                            <strong>{resolveTrophyBrowserGroupLabel(trophy.trophyGroupId, trophy.groupName)}</strong>
                          </div>

                          <div className="all-unearned-row-meta">
                            <strong>{trophy.grade}</strong>
                          </div>

                          <div className="all-unearned-row-rate">
                            <strong>{formatEarnedRate(trophy.trophyEarnedRate)}</strong>
                          </div>

                          <div className="all-unearned-row-status">
                            {trophy.target ? (
                              <span className="trophy-chip trophy-chip-earned">Current target</span>
                            ) : null}
                            {trophy.hidden ? (
                              <span className="trophy-chip trophy-chip-unearned">Secret</span>
                            ) : null}
                            {targetPendingKey === trophyKey ? (
                              <span className="trophy-chip trophy-chip-earned">Saving…</span>
                            ) : null}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : null}
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
  currentTargetClearPendingKey,
  targetPendingKey,
  onSelectSetup,
  onSelectGames,
  onSelectTrophies,
  onSelectAllUnearned,
  onClearTarget,
  onOpenPsnAccess,
  onRefresh,
}: {
  isDesktopRuntime: boolean;
  desktopWindowControls?: DesktopWindowControls;
  trophyBrowserAvailable: boolean;
  workspaceTab: WorkspaceTab;
  currentTargetSelectionKey: string | null;
  currentTargetClearPendingKey: string | null;
  targetPendingKey: string | null;
  onSelectSetup: () => void;
  onSelectGames: () => void;
  onSelectTrophies: () => void;
  onSelectAllUnearned: () => void;
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
              {trophyBrowserAvailable ? (
                <button
                  id="workspace-tab-all-unearned"
                  className={`workspace-tab ${workspaceTab === "allUnearned" ? "is-active" : ""}`}
                  role="tab"
                  type="button"
                  aria-selected={workspaceTab === "allUnearned"}
                  aria-controls="workspace-panel-all-unearned"
                  onClick={onSelectAllUnearned}
                >
                  All Unearned
                </button>
              ) : null}
            </div>
          </div>

          <div className="app-topbar-drag-lane" aria-hidden="true" />

          <div className="app-topbar-actions">
            {workspaceTab === "trophies" && currentTargetSelectionKey ? (
              <button
                className="ghost-button"
                disabled={targetPendingKey === currentTargetClearPendingKey}
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
  anchor,
  anchorLabel,
  copied,
  copyLabel,
  controls,
  onAnchorChange,
  onCopy,
  url,
}: {
  anchor?: OverlayAnchor;
  anchorLabel?: string;
  copied: boolean;
  copyLabel: string;
  controls?: ReactNode;
  onAnchorChange?: (value: OverlayAnchor) => void;
  onCopy: () => void;
  url: string;
}) {
  return (
    <div className="route-row">
      <div className="route-url-bar">
        <span className="route-row-text">{url}</span>
        <div className="route-url-actions">
          <button
            type="button"
            className="route-copy-button"
            aria-label={copyLabel}
            onClick={onCopy}
          >
            {copied ? "Copied" : "Copy"}
          </button>
          {anchor && anchorLabel && onAnchorChange ? (
            <div className="select-field-control route-anchor-control">
              <select
                className="route-anchor-select"
                aria-label={anchorLabel}
                value={anchor}
                onChange={(event) => onAnchorChange(event.target.value as OverlayAnchor)}
              >
                {overlayAnchorOptions.map((option) => (
                  <option key={option} value={option}>
                    {overlayAnchorLabels[option]}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </div>
      </div>
      {controls ? <div className="route-settings-bar">{controls}</div> : null}
    </div>
  );
}

function InlineTextField({
  ariaLabel,
  hideLabel = false,
  label = "",
  placeholder,
  value,
  onChange,
}: {
  ariaLabel: string;
  hideLabel?: boolean;
  label?: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label
      className={`route-inline-field route-inline-field-text ${
        hideLabel ? "route-inline-field-unlabeled" : ""
      }`}
    >
      {!hideLabel ? <span>{label}</span> : null}
      <input
        aria-label={ariaLabel}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function InlineNumberField({
  ariaLabel,
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  ariaLabel: string;
  label: string;
  value: number | null;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number | null) => void;
}) {
  return (
    <label className="route-inline-field route-inline-field-number">
      <span>{label}</span>
      <input
        aria-label={ariaLabel}
        type="number"
        min={min}
        max={max}
        step={step}
        value={value ?? ""}
        onChange={(event) =>
          onChange(event.target.value === "" ? null : Number(event.target.value))
        }
      />
    </label>
  );
}

function InlineSecondsField({
  ariaLabel,
  label,
  valueMs,
  onChangeMs,
}: {
  ariaLabel: string;
  label: string;
  valueMs: number | null;
  onChangeMs: (value: number | null) => void;
}) {
  return (
    <label className="route-inline-field route-inline-field-number">
      <span>{label}</span>
      <input
        aria-label={ariaLabel}
        type="number"
        min="1"
        step="1"
        value={valueMs == null ? "" : Math.round(valueMs / 1000)}
        onChange={(event) => {
          if (event.target.value === "") {
            onChangeMs(null);
            return;
          }

          const nextValue = Number(event.target.value);
          onChangeMs(Number.isFinite(nextValue) ? Math.round(nextValue * 1000) : null);
        }}
      />
    </label>
  );
}

function InlineGradeIncrementField({
  label,
  disabled = false,
  onIncrement,
}: {
  label: string;
  disabled?: boolean;
  onIncrement: (grade: GradeKey) => void;
}) {
  return (
    <div className="route-inline-field route-inline-field-grade-buttons">
      <span>{label}</span>
      <div className="route-grade-button-group">
        {routeControlGradeOrder.map((grade) => (
          <button
            key={grade}
            type="button"
            className="route-grade-icon-button"
            aria-label={`Add ${grade} trophy`}
            disabled={disabled}
            onClick={() => onIncrement(grade)}
          >
            <img src={trophyBrowserGradeIcon[grade]} alt="" />
          </button>
        ))}
      </div>
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

function ToggleChipButton({
  ariaLabel,
  label,
  pressed,
  disabled = false,
  onToggle,
}: {
  ariaLabel?: string;
  label: string;
  pressed: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className={`route-toggle-chip ${pressed ? "is-active" : ""}`}
      aria-label={ariaLabel ?? label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onToggle}
    >
      {label}
    </button>
  );
}

function RouteToggleGroup({
  routeLabel,
  toggles,
}: {
  routeLabel: string;
  toggles: Array<{
    label: string;
    pressed: boolean;
    onToggle: () => void;
  }>;
}) {
  return (
    <div className="route-toggle-group">
      {toggles.map((toggle) => (
        <ToggleChipButton
          key={`${routeLabel}-${toggle.label}`}
          ariaLabel={`${routeLabel} ${toggle.label}`}
          label={toggle.label}
          pressed={toggle.pressed}
          onToggle={toggle.onToggle}
        />
      ))}
    </div>
  );
}

function RouteActionGroup({
  actions,
}: {
  actions: Array<{
    label: string;
    disabled?: boolean;
    onClick: () => void;
  }>;
}) {
  return (
    <div className="route-action-group">
      {actions.map((action) => (
        <button
          key={action.label}
          type="button"
          className="route-action-button"
          disabled={action.disabled}
          onClick={action.onClick}
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}
