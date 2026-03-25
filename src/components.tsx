import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

import type {
  GradeKey,
  OverlayAnchor,
  OverlayCurrentGameCard,
  OverlayDataResponse,
  OverlayOverallCard,
  OverlayRouteKey,
  OverlaySettings,
  OverlayTargetTrophyCard,
  OverlayView,
  StripZoneKey,
} from "../shared/contracts.js";
import { api } from "./api.js";

const gradeOrder: GradeKey[] = ["platinum", "gold", "silver", "bronze"];
const gradeIcon: Record<GradeKey, string> = {
  platinum: "/img/40-platinum.png",
  gold: "/img/40-gold.png",
  silver: "/img/40-silver.png",
  bronze: "/img/40-bronze.png",
};
const LOOP_TRANSITION_MS = 800;
const OVERLAY_PREVIEW_QUERY_PARAM = "dashboardPreview";
export const OVERLAY_PREVIEW_MESSAGE_TYPE = "streamer-tools:overlay-preview-state";
export const OVERLAY_PREVIEW_METRICS_MESSAGE_TYPE = "streamer-tools:overlay-preview-metrics";
const DEFAULT_PREVIEW_VIEWPORT_WIDTH = 1360;
const CURRENT_GAME_PREVIEW_VIEWPORT_HEIGHT = 220;
const TARGET_TROPHY_PREVIEW_VIEWPORT_HEIGHT = 220;

const numberFormatter = new Intl.NumberFormat("en-US");

const formatCount = (value: number | null | undefined) =>
  numberFormatter.format(value ?? 0);

const formatPair = (left: number | null | undefined, right: number | null | undefined) =>
  `${formatCount(left)} / ${formatCount(right)}`;

const formatCompactPair = (
  left: number | null | undefined,
  right: number | null | undefined,
) => `${formatCount(left)}/${formatCount(right)}`;

const createPlaceholderGradeValues = () =>
  Object.fromEntries(
    gradeOrder.map((grade) => [grade, "--"]),
  ) as Record<GradeKey, string>;

const fullWidthAnchorShellStyle = {
  width: "100%",
  maxWidth: "100%",
  minWidth: 0,
} satisfies CSSProperties;

const intrinsicWidthShellStyle = {
  width: "fit-content",
  maxWidth: "100%",
  minWidth: 0,
} satisfies CSSProperties;

const singleLineClampStyle = {
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
} satisfies CSSProperties;

const multiLineClampStyle = {
  overflow: "hidden",
  display: "-webkit-box",
  WebkitBoxOrient: "vertical",
  WebkitLineClamp: 2,
} satisfies CSSProperties;

export type OverlayStripViewModel = {
  mode: "overall" | "currentGame";
  title: string;
  artUrl: string | null;
  chipLabel: string | null;
  metricValue: string;
  metricCaption: string;
  progressPercent: number;
  gradeValues: Record<GradeKey, string>;
};

export type TargetTrophyViewModel = {
  trophyName: string;
  description: string;
  iconUrl: string | null;
  grade: GradeKey | null;
};

export type TargetTrophyCardVariant =
  | "panel"
  | "loop"
  | "compact"
  | "standalone";

type OverlayStripSettings = Pick<
  OverlaySettings,
  | "showStripArtwork"
  | "showStripIdentity"
  | "showStripMetrics"
  | "showStripTrophies"
  | "stripZoneOrder"
>;

type TargetTrophyCardSettings = Pick<
  OverlaySettings,
  "stripZoneOrder" | "showTargetTrophyInfo"
>;

const defaultOverlayStripSettings: OverlayStripSettings = {
  showStripArtwork: true,
  showStripIdentity: true,
  showStripMetrics: true,
  showStripTrophies: true,
  stripZoneOrder: ["artwork", "identity", "metrics", "trophies", "targetInfo"],
};

const defaultTargetTrophyCardSettings: TargetTrophyCardSettings = {
  stripZoneOrder: ["artwork", "identity", "metrics", "trophies", "targetInfo"],
  showTargetTrophyInfo: true,
};

const resolveMeasuredElementWidth = (element: Element | null) => {
  if (!(element instanceof HTMLElement)) {
    return 0;
  }

  return Math.max(
    element.scrollWidth,
    element.offsetWidth,
    Math.ceil(element.getBoundingClientRect().width),
  );
};

const toStripViewModel = (
  overlayData: OverlayDataResponse,
  view: "overall" | "currentGame",
) =>
  view === "overall"
    ? toOverallStripViewModel(overlayData.overall)
    : toCurrentGameStripViewModel(overlayData.currentGame);

export const resolveTargetTrophyTagLabel = (
  settings: Pick<OverlaySettings, "showTargetTrophyTag" | "targetTrophyTagText">,
) => {
  const label = settings.targetTrophyTagText.trim();
  return settings.showTargetTrophyTag && label ? label : null;
};

export function useOverlayPolling(intervalMs = 5000) {
  const [overlayData, setOverlayData] = useState<OverlayDataResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const nextData = await api.getOverlayData();
        if (!cancelled) {
          setOverlayData(nextData);
          setError(null);
        }
      } catch (nextError) {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : "Overlay load failed");
        }
      }
    };

    void load();
    const timer = window.setInterval(() => void load(), intervalMs);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [intervalMs]);

  return { overlayData, error };
}

export function toOverallStripViewModel(
  overall: OverlayOverallCard | null,
): OverlayStripViewModel {
  return {
    mode: "overall",
    title: overall?.onlineId ?? "Unavailable",
    artUrl: overall?.avatarUrl ?? null,
    chipLabel: "PSN Profile",
    metricValue: overall ? formatCount(overall.totalTrophies) : "--",
    metricCaption:
      overall?.progressToNextLevel != null
        ? `Level progress ${overall.progressToNextLevel}%`
        : "--",
    progressPercent: overall?.progressToNextLevel ?? 0,
    gradeValues: overall
      ? {
          platinum: formatCount(overall.counts.platinum),
          gold: formatCount(overall.counts.gold),
          silver: formatCount(overall.counts.silver),
          bronze: formatCount(overall.counts.bronze),
        }
      : createPlaceholderGradeValues(),
  };
}

export function toCurrentGameStripViewModel(
  currentGame: OverlayCurrentGameCard | null,
): OverlayStripViewModel {
  return {
    mode: "currentGame",
    title: currentGame?.titleName ?? "No active game selected",
    artUrl: currentGame?.iconUrl ?? null,
    chipLabel: currentGame?.platform ?? null,
    metricValue:
      currentGame?.completionPercentage != null
        ? `${currentGame.completionPercentage}%`
        : "--",
    metricCaption: currentGame
      ? `${formatPair(currentGame.earnedTotal, currentGame.definedTotal)} earned`
      : "--",
    progressPercent: currentGame?.completionPercentage ?? 0,
    gradeValues: currentGame
      ? {
          platinum: formatCompactPair(
            currentGame.earnedCounts.platinum,
            currentGame.definedCounts.platinum,
          ),
          gold: formatCompactPair(
            currentGame.earnedCounts.gold,
            currentGame.definedCounts.gold,
          ),
          silver: formatCompactPair(
            currentGame.earnedCounts.silver,
            currentGame.definedCounts.silver,
          ),
          bronze: formatCompactPair(
            currentGame.earnedCounts.bronze,
            currentGame.definedCounts.bronze,
          ),
        }
      : createPlaceholderGradeValues(),
  };
}

export function toTargetTrophyViewModel(
  targetTrophy: OverlayTargetTrophyCard | null,
): TargetTrophyViewModel {
  if (!targetTrophy) {
    return {
      trophyName: "No target trophy selected",
      description: "Pick a trophy from the browser to feature it on stream.",
      iconUrl: null,
      grade: null,
    };
  }

  return {
    trophyName: targetTrophy.trophyName,
    description:
      targetTrophy.description ?? "No trophy description is available for this entry.",
    iconUrl: targetTrophy.iconUrl,
    grade: targetTrophy.grade,
  };
}

export function OverlayStrip({
  viewModel,
  compact = false,
  settings = defaultOverlayStripSettings,
}: {
  viewModel: OverlayStripViewModel;
  compact?: boolean;
  settings?: OverlayStripSettings;
}) {
  return (
    <section
      className={`overlay-strip overlay-strip-${viewModel.mode} ${
        compact ? "overlay-strip-compact" : "overlay-strip-fluid"
      }`}
    >
      <OverlayStripContent viewModel={viewModel} compact={compact} settings={settings} />
    </section>
  );
}

function OverlayStripContent({
  viewModel,
  compact,
  settings,
}: {
  viewModel: OverlayStripViewModel;
  compact: boolean;
  settings: OverlayStripSettings;
}) {
  const zoneDefinitions = settings.stripZoneOrder.flatMap((zoneKey) => {
    const definition = resolveStripZoneDefinition(zoneKey, {
      compact,
      settings,
      viewModel,
    });

    return definition ? [definition] : [];
  });
  const templateColumns = zoneDefinitions.map((zone) => zone.column).join(" ");

  return (
    <div
      className={`overlay-strip-content overlay-strip-content-${viewModel.mode}`}
      style={templateColumns ? { gridTemplateColumns: templateColumns } : undefined}
    >
      {zoneDefinitions.map((zone) => zone.render())}
    </div>
  );
}

type OverlayStripZoneDefinition = {
  key: StripZoneKey;
  column: string;
  render: () => ReactNode;
};

const resolveStripZoneDefinition = (
  zoneKey: StripZoneKey,
  {
    compact,
    settings,
    viewModel,
  }: {
    compact: boolean;
    settings: OverlayStripSettings;
    viewModel: OverlayStripViewModel;
  },
): OverlayStripZoneDefinition | null => {
  if (zoneKey === "artwork") {
    if (!settings.showStripArtwork) {
      return null;
    }

    return {
      key: zoneKey,
      column: "var(--strip-art-size)",
      render: () => (
        <div className="overlay-strip-zone overlay-strip-zone-art" key={zoneKey}>
          <div className="overlay-art-shell">
            {viewModel.artUrl ? (
              <img className="overlay-art" src={viewModel.artUrl} alt="" />
            ) : (
              <div className="overlay-art overlay-art-placeholder" aria-hidden="true" />
            )}
          </div>
        </div>
      ),
    };
  }

  if (zoneKey === "identity") {
    if (!settings.showStripIdentity) {
      return null;
    }

    return {
      key: zoneKey,
      column: "minmax(0, 1fr)",
      render: () => (
        <div className="overlay-strip-zone overlay-strip-zone-identity" key={zoneKey}>
          <h2 title={viewModel.title} style={singleLineClampStyle}>{viewModel.title}</h2>
          {viewModel.chipLabel ? (
            <span className="overlay-chip">{viewModel.chipLabel}</span>
          ) : (
            <span className="overlay-chip overlay-chip-placeholder">--</span>
          )}
        </div>
      ),
    };
  }

  if (zoneKey === "metrics") {
    if (!settings.showStripMetrics) {
      return null;
    }

    return {
      key: zoneKey,
      column: compact
        ? "var(--strip-metric-width)"
        : "minmax(var(--strip-metric-width), auto)",
      render: () => (
        <div className="overlay-strip-zone overlay-strip-zone-metric" key={zoneKey}>
          <strong className="overlay-metric-value">{viewModel.metricValue}</strong>
          <span className="overlay-metric-caption">{viewModel.metricCaption}</span>
          <div className="overlay-metric-track" aria-hidden="true">
            <div
              className="overlay-metric-fill"
              style={{ width: `${Math.max(0, Math.min(100, viewModel.progressPercent))}%` }}
            />
          </div>
        </div>
      ),
    };
  }

  if (zoneKey !== "trophies" || !settings.showStripTrophies) {
    return null;
  }

  return {
    key: zoneKey,
    column: compact ? "var(--strip-trophy-width)" : "auto",
    render: () => (
      <div className="overlay-strip-zone overlay-strip-zone-grades" key={zoneKey}>
        {gradeOrder.map((grade) => (
          <div className={`overlay-grade-group ${grade}`} key={grade}>
            <div className="overlay-grade-head">
              <img className="overlay-grade-icon" src={gradeIcon[grade]} alt="" />
              <strong>{viewModel.gradeValues[grade]}</strong>
            </div>
          </div>
        ))}
      </div>
    ),
  };
};

export function TargetTrophyCard({
  viewModel,
  variant = "panel",
  tagLabel = null,
  settings = defaultTargetTrophyCardSettings,
}: {
  viewModel: TargetTrophyViewModel;
  variant?: TargetTrophyCardVariant;
  tagLabel?: string | null;
  settings?: TargetTrophyCardSettings;
}) {
  const className = [
    "target-trophy-card",
    `target-trophy-card-${variant}`,
    variant === "loop" || variant === "compact" ? "target-trophy-card-loop" : "",
    !settings.showTargetTrophyInfo ? "target-trophy-card-target-info-hidden" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const zoneOrder = settings.stripZoneOrder.filter(
    (zoneKey): zoneKey is "artwork" | "targetInfo" =>
      zoneKey === "artwork" || (zoneKey === "targetInfo" && settings.showTargetTrophyInfo),
  );
  const zoneElements = zoneOrder.flatMap((zoneKey) => {
    if (zoneKey === "artwork") {
      return [
        <div className="target-trophy-zone target-trophy-zone-artwork" key={zoneKey}>
          <div className="target-trophy-art-shell">
            {viewModel.iconUrl ? (
              <img className="target-trophy-art" src={viewModel.iconUrl} alt="" />
            ) : (
              <div
                className="target-trophy-art target-trophy-art-placeholder"
                aria-hidden="true"
              />
            )}
          </div>
        </div>,
      ];
    }

    return [
      <div className="target-trophy-zone target-trophy-zone-target-info" key={zoneKey}>
        <div
          className={`target-trophy-copy ${
            tagLabel ? "target-trophy-copy-with-tag" : "target-trophy-copy-no-tag"
          }`}
        >
          <div className="target-trophy-title-row">
            {viewModel.grade ? (
              <img
                className="target-trophy-grade-icon"
                src={gradeIcon[viewModel.grade]}
                alt=""
              />
            ) : null}
            <h2 title={viewModel.trophyName} style={singleLineClampStyle}>
              {viewModel.trophyName}
            </h2>
          </div>
          {tagLabel ? <span className="overlay-chip target-trophy-tag">{tagLabel}</span> : null}
          <p className="target-trophy-description" style={multiLineClampStyle}>
            {viewModel.description}
          </p>
        </div>
      </div>,
    ];
  });

  return (
    <section className={className}>
      {zoneElements}
    </section>
  );
}

function renderOverlayCard(
  overlayData: OverlayDataResponse,
  view: OverlayView,
  compact = false,
  settingsOverride?: OverlaySettings,
) {
  const resolvedSettings = settingsOverride ?? overlayData.display.settings;

  if (view === "targetTrophy") {
    return (
      <TargetTrophyCard
        viewModel={toTargetTrophyViewModel(overlayData.targetTrophy)}
        variant={compact ? "compact" : "loop"}
        tagLabel={resolveTargetTrophyTagLabel(resolvedSettings)}
        settings={resolvedSettings}
      />
    );
  }

  return (
    <OverlayStrip
      viewModel={toStripViewModel(overlayData, view)}
      compact={compact}
      settings={resolvedSettings}
    />
  );
}

export function DashboardOverlayPreview({
  overlayData,
  mode,
  settingsOverride,
  framed = true,
}: {
  overlayData: OverlayDataResponse;
  mode: OverlayView;
  settingsOverride?: OverlaySettings;
  framed?: boolean;
}) {
  if (!framed) {
    return renderOverlayCard(overlayData, mode, true, settingsOverride);
  }

  return <div className="overlay-preview-frame">{renderOverlayCard(overlayData, mode, true, settingsOverride)}</div>;
}

function OverlayPreviewStage({
  enabled,
  reportSignal,
  children,
}: {
  enabled: boolean;
  reportSignal?: unknown;
  children: ReactNode;
}) {
  const stageRef = useRef<HTMLDivElement | null>(null);

  const reportMetrics = useMemo(
    () => () => {
      if (!enabled || window.parent === window) {
        return;
      }

      const stage = stageRef.current;
      if (!stage) {
        return;
      }

      const bounds = stage.getBoundingClientRect();
      const width = Math.ceil(bounds.width);
      const height = Math.ceil(bounds.height);

      if (width <= 0 || height <= 0) {
        return;
      }

      window.parent.postMessage(
        {
          type: OVERLAY_PREVIEW_METRICS_MESSAGE_TYPE,
          width,
          height,
        },
        window.location.origin,
      );
    },
    [enabled],
  );

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const stage = stageRef.current;
    if (!stage) {
      return;
    }

    reportMetrics();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", reportMetrics);
      return () => window.removeEventListener("resize", reportMetrics);
    }

    const observer = new ResizeObserver(reportMetrics);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [enabled, reportMetrics]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    reportMetrics();
  }, [enabled, reportMetrics, reportSignal]);

  if (!enabled) {
    return <>{children}</>;
  }

  return (
    <div
      ref={stageRef}
      className="overlay-preview-stage"
      data-overlay-preview-stage=""
    >
      {children}
    </div>
  );
}

export function EmbeddedOverlayPreview({
  srcPath,
  title,
  overlayData,
  settings,
  viewportWidth = DEFAULT_PREVIEW_VIEWPORT_WIDTH,
  viewportHeight = CURRENT_GAME_PREVIEW_VIEWPORT_HEIGHT,
}: {
  srcPath: string;
  title: string;
  overlayData: OverlayDataResponse;
  settings: OverlaySettings;
  viewportWidth?: number;
  viewportHeight?: number;
}) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [scale, setScale] = useState(1);
  const fixedViewport = useMemo(
    () => ({
      width: viewportWidth,
      height: viewportHeight,
    }),
    [viewportHeight, viewportWidth],
  );

  const previewSrc = useMemo(() => {
    const url = new URL(srcPath, window.location.origin);
    url.searchParams.set(OVERLAY_PREVIEW_QUERY_PARAM, "1");
    return `${url.pathname}${url.search}`;
  }, [srcPath]);

  const postPreviewState = useMemo(
    () => () => {
      iframeRef.current?.contentWindow?.postMessage(
        {
          type: OVERLAY_PREVIEW_MESSAGE_TYPE,
          overlayData,
          settings,
        },
        window.location.origin,
      );
    },
    [overlayData, settings],
  );
  const scaledViewport = useMemo(
    () => ({
      width: fixedViewport.width * scale,
      height: fixedViewport.height * scale,
    }),
    [fixedViewport.height, fixedViewport.width, scale],
  );

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) {
      return;
    }

    const updateScale = () => {
      const width = wrapper.getBoundingClientRect().width;
      setScale(width > 0 ? Math.min(1, width / fixedViewport.width) : 1);
    };

    updateScale();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateScale);
      return () => window.removeEventListener("resize", updateScale);
    }

    const observer = new ResizeObserver(updateScale);
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, [fixedViewport.width]);

  useEffect(() => {
    postPreviewState();
  }, [postPreviewState, previewSrc]);

  return (
    <div
      ref={wrapperRef}
      className="embedded-overlay-preview"
      style={
        {
          "--overlay-preview-scale": `${scale}`,
          "--overlay-preview-viewport-width": `${fixedViewport.width}px`,
          "--overlay-preview-viewport-height": `${fixedViewport.height}px`,
          height: `${scaledViewport.height}px`,
        } as CSSProperties
      }
    >
      <div
        className="embedded-overlay-preview-canvas"
        style={
          {
            width: `${scaledViewport.width}px`,
            height: `${scaledViewport.height}px`,
          } as CSSProperties
        }
      >
        <iframe
          ref={iframeRef}
          title={title}
          className="embedded-overlay-preview-frame"
          src={previewSrc}
          scrolling="no"
          onLoad={() => {
            postPreviewState();
          }}
        />
      </div>
    </div>
  );
}

type OverlayPreviewMessage = {
  type: typeof OVERLAY_PREVIEW_MESSAGE_TYPE;
  overlayData: OverlayDataResponse;
  settings: OverlaySettings;
};

const isOverlayPreviewMessage = (value: unknown): value is OverlayPreviewMessage => {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<OverlayPreviewMessage>;
  return (
    candidate.type === OVERLAY_PREVIEW_MESSAGE_TYPE &&
    typeof candidate.overlayData === "object" &&
    candidate.overlayData !== null &&
    typeof candidate.settings === "object" &&
    candidate.settings !== null
  );
};

const isDashboardPreviewMode = () =>
  new URLSearchParams(window.location.search).get(OVERLAY_PREVIEW_QUERY_PARAM) === "1";

const applyPreviewSettings = (
  overlayData: OverlayDataResponse,
  settings: OverlaySettings,
): OverlayDataResponse => ({
  ...overlayData,
  display: {
    ...overlayData.display,
    settings,
  },
});

const resolveRouteOverlayAnchor = (
  settings: Pick<OverlaySettings, "overlayAnchors">,
  routeKey: OverlayRouteKey,
) => settings.overlayAnchors[routeKey];

const resolveOverlayAnchorClassName = (anchor: OverlayAnchor) => {
  switch (anchor) {
    case "top-left":
      return "overlay-scene-anchor-top-left";
    case "top-right":
      return "overlay-scene-anchor-top-right";
    case "bottom-right":
      return "overlay-scene-anchor-bottom-right";
    case "bottom-left":
    default:
      return "overlay-scene-anchor-bottom-left";
  }
};

const resolveOverlayHorizontalAnchor = (anchor: OverlayAnchor) =>
  anchor.endsWith("right") ? "right" : "left";

const resolveOverlaySceneClassName = ({
  anchor,
  previewEnabled,
}: {
  anchor: OverlayAnchor;
  previewEnabled: boolean;
}) =>
  `overlay-scene ${resolveOverlayAnchorClassName(anchor)}${
    previewEnabled ? " overlay-scene-preview" : ""
  }`;

function OverlayAnchorShell({
  anchor,
  children,
}: {
  anchor: OverlayAnchor;
  children: ReactNode;
}) {
  return (
    <div
      className="overlay-anchor-shell"
      data-overlay-horizontal-anchor={resolveOverlayHorizontalAnchor(anchor)}
      style={fullWidthAnchorShellStyle}
    >
      {children}
    </div>
  );
}

function useOverlayRouteData(intervalMs = 5000) {
  const previewEnabled = isDashboardPreviewMode();
  const { overlayData, error } = useOverlayPolling(intervalMs);
  const [previewMessage, setPreviewMessage] = useState<OverlayPreviewMessage | null>(null);

  useEffect(() => {
    if (!previewEnabled) {
      return;
    }

    const handleMessage = (event: MessageEvent) => {
      if (event.origin && event.origin !== window.location.origin) {
        return;
      }

      if (!isOverlayPreviewMessage(event.data)) {
        return;
      }

      setPreviewMessage(event.data);
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [previewEnabled]);

  const resolvedOverlayData = useMemo(() => {
    if (previewMessage) {
      return applyPreviewSettings(previewMessage.overlayData, previewMessage.settings);
    }

    return overlayData;
  }, [overlayData, previewMessage]);

  return { overlayData: resolvedOverlayData, error };
}

export function LoopOverlay() {
  const { overlayData } = useOverlayRouteData();
  const previewEnabled = isDashboardPreviewMode();

  if (!overlayData) {
    return <div className="overlay-scene overlay-loading">Loading overlay...</div>;
  }

  const routeAnchor = resolveRouteOverlayAnchor(overlayData.display.settings, "loop");

  return (
    <div
      className={resolveOverlaySceneClassName({
        anchor: routeAnchor,
        previewEnabled,
      })}
    >
      <OverlayPreviewStage enabled={previewEnabled} reportSignal={overlayData}>
        <LoopOverlayView
          overlayData={overlayData}
          previewEnabled={previewEnabled}
          framed={false}
        />
      </OverlayPreviewStage>
    </div>
  );
}

export function LoopOverlayView({
  overlayData,
  previewEnabled = false,
  framed = true,
}: {
  overlayData: OverlayDataResponse;
  previewEnabled?: boolean;
  framed?: boolean;
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [previousView, setPreviousView] = useState<OverlayView | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [transitionEntered, setTransitionEntered] = useState(false);
  const [displayData, setDisplayData] = useState(overlayData);
  const [measuredLoopWidths, setMeasuredLoopWidths] = useState<
    Partial<Record<OverlayView, number>>
  >({});
  const pendingDataRef = useRef<OverlayDataResponse | null>(null);
  const currentLayerRef = useRef<HTMLDivElement | null>(null);
  const previousLayerRef = useRef<HTMLDivElement | null>(null);

  const loopOrder: OverlayView[] = displayData.display.loopOrder.length
    ? displayData.display.loopOrder
    : ["overall", "currentGame"];
  const loopOrderKey = loopOrder.join("|");
  const measuredLoopViews = useMemo(
    () => Array.from(new Set(loopOrder)),
    [loopOrderKey],
  );
  const measurementRefs = useRef<Partial<Record<OverlayView, HTMLDivElement | null>>>({});

  useEffect(() => {
    if (currentIndex >= loopOrder.length) {
      setCurrentIndex(0);
    }
  }, [currentIndex, loopOrder.length]);

  const currentView = loopOrder[Math.min(currentIndex, loopOrder.length - 1)] ?? "overall";
  const overallDurationMs = displayData.display.settings.overallDurationMs;
  const currentGameDurationMs = displayData.display.settings.currentGameDurationMs;
  const targetTrophyDurationMs = displayData.display.settings.targetTrophyDurationMs;
  const routeAnchor = resolveRouteOverlayAnchor(displayData.display.settings, "loop");
  const horizontalAnchor = resolveOverlayHorizontalAnchor(routeAnchor);

  useEffect(() => {
    if (isTransitioning) {
      pendingDataRef.current = overlayData;
      return;
    }

    setDisplayData(overlayData);
  }, [isTransitioning, overlayData]);

  useEffect(() => {
    setMeasuredLoopWidths({});
  }, [displayData, loopOrderKey]);

  useEffect(() => {
    if (isTransitioning || loopOrder.length <= 1) {
      return;
    }

    const duration =
      currentView === "overall"
        ? overallDurationMs
        : currentView === "currentGame"
          ? currentGameDurationMs
          : targetTrophyDurationMs;
    const timer = window.setTimeout(() => {
      setPreviousView(currentView);
      setCurrentIndex((index) => (index + 1) % loopOrder.length);
      setIsTransitioning(true);
      setTransitionEntered(false);
    }, duration);

    return () => window.clearTimeout(timer);
  }, [
    currentGameDurationMs,
    currentView,
    isTransitioning,
    loopOrder.length,
    overallDurationMs,
    targetTrophyDurationMs,
  ]);

  useEffect(() => {
    if (!isTransitioning || !previousView) {
      return;
    }

    const enterTimer = window.setTimeout(() => {
      setTransitionEntered(true);
    }, 24);

    const settleTimer = window.setTimeout(() => {
      setPreviousView(null);
      setIsTransitioning(false);
      setTransitionEntered(false);

      if (pendingDataRef.current) {
        setDisplayData(pendingDataRef.current);
        pendingDataRef.current = null;
      }
    }, LOOP_TRANSITION_MS);

    return () => {
      window.clearTimeout(enterTimer);
      window.clearTimeout(settleTimer);
    };
  }, [isTransitioning, previousView]);

  useEffect(() => {
    const updateMeasuredWidths = () => {
      setMeasuredLoopWidths((current) => {
        const next: Partial<Record<OverlayView, number>> = {};

        measuredLoopViews.forEach((view) => {
          const width = resolveMeasuredElementWidth(
            measurementRefs.current[view]?.firstElementChild ?? null,
          );

          if (width > 0) {
            next[view] = width;
          }
        });

        const currentKeys = Object.keys(current) as OverlayView[];
        const nextKeys = Object.keys(next) as OverlayView[];
        const unchanged =
          currentKeys.length === nextKeys.length &&
          nextKeys.every((view) => current[view] === next[view]);

        return unchanged ? current : next;
      });
    };

    updateMeasuredWidths();

    const observedElements = measuredLoopViews
      .map((view) => measurementRefs.current[view]?.firstElementChild)
      .filter((element): element is HTMLElement => element instanceof HTMLElement);

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateMeasuredWidths);
      return () => window.removeEventListener("resize", updateMeasuredWidths);
    }

    const observer = new ResizeObserver(updateMeasuredWidths);
    observedElements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [displayData, loopOrderKey, measuredLoopViews]);

  const resolvedLoopWidth = useMemo(() => {
    const resolveWidthForView = (view: OverlayView | null) =>
      view ? measuredLoopWidths[view] ?? 0 : 0;

    const activeWidths = [resolveWidthForView(currentView)];

    if (isTransitioning && previousView) {
      activeWidths.push(resolveWidthForView(previousView));
    }

    const widths = activeWidths.filter((width) => width > 0);
    return widths.length > 0 ? Math.max(...widths) : null;
  }, [
    currentView,
    isTransitioning,
    measuredLoopWidths,
    previousView,
  ]);

  const loopShellStyle =
    resolvedLoopWidth != null
      ? ({ width: "100%", maxWidth: `${resolvedLoopWidth}px` } satisfies CSSProperties)
      : undefined;

  const content = (
    <>
      <OverlayAnchorShell anchor={routeAnchor}>
        <div
          className="overlay-strip-shell"
          data-loop-shell-width={resolvedLoopWidth ?? undefined}
          data-overlay-horizontal-anchor={horizontalAnchor}
          style={loopShellStyle}
        >
          <div
            className="overlay-strip-content-stack"
            style={loopShellStyle}
          >
            <div
              ref={currentLayerRef}
              className={`overlay-strip-content-layer overlay-strip-content-layer-current overlay-strip-content-layer-${currentView} ${
                isTransitioning ? "is-transitioning" : ""
              } ${transitionEntered ? "is-entered" : ""}`}
            >
              {renderOverlayCard(displayData, currentView)}
            </div>
            {previousView ? (
              <div
                ref={previousLayerRef}
                className={`overlay-strip-content-layer overlay-strip-content-layer-previous overlay-strip-content-layer-${previousView} ${
                  transitionEntered ? "is-exiting" : ""
                }`}
              >
                {renderOverlayCard(displayData, previousView)}
              </div>
            ) : null}
          </div>
        </div>
      </OverlayAnchorShell>
      <div className="overlay-loop-measurements" aria-hidden="true">
        {measuredLoopViews.map((view) => (
        <div
          key={view}
            ref={(node) => {
              if (node) {
                measurementRefs.current[view] = node;
              } else {
                delete measurementRefs.current[view];
              }
            }}
            className={`overlay-loop-measurement overlay-loop-measurement-${view}`}
            data-loop-measure-view={view}
          >
            {renderOverlayCard(displayData, view)}
          </div>
        ))}
      </div>
    </>
  );

  if (!framed) {
    return content;
  }

  return (
    <div
      className={resolveOverlaySceneClassName({
        anchor: routeAnchor,
        previewEnabled,
      })}
    >
      {content}
    </div>
  );
}

export function OverallOverlay() {
  const { overlayData } = useOverlayRouteData();
  const previewEnabled = isDashboardPreviewMode();

  if (!overlayData) {
    return <div className="overlay-scene overlay-loading">Loading overlay...</div>;
  }

  const routeAnchor = resolveRouteOverlayAnchor(overlayData.display.settings, "overall");

  return (
    <div
      className={resolveOverlaySceneClassName({
        anchor: routeAnchor,
        previewEnabled,
      })}
    >
      <OverlayPreviewStage enabled={previewEnabled} reportSignal={overlayData}>
        <OverlayAnchorShell anchor={routeAnchor}>
          <div
            className="overlay-strip-shell"
            data-overlay-horizontal-anchor={resolveOverlayHorizontalAnchor(routeAnchor)}
          >
            {renderOverlayCard(overlayData, "overall")}
          </div>
        </OverlayAnchorShell>
      </OverlayPreviewStage>
    </div>
  );
}

export function CurrentGameOverlay() {
  const { overlayData } = useOverlayRouteData();
  const previewEnabled = isDashboardPreviewMode();

  if (!overlayData) {
    return <div className="overlay-scene overlay-loading">Loading overlay...</div>;
  }

  const routeAnchor = resolveRouteOverlayAnchor(overlayData.display.settings, "currentGame");

  return (
    <div
      className={resolveOverlaySceneClassName({
        anchor: routeAnchor,
        previewEnabled,
      })}
    >
      <OverlayPreviewStage enabled={previewEnabled} reportSignal={overlayData}>
        <OverlayAnchorShell anchor={routeAnchor}>
          <div
            className="overlay-strip-shell"
            data-overlay-horizontal-anchor={resolveOverlayHorizontalAnchor(routeAnchor)}
          >
            {renderOverlayCard(overlayData, "currentGame")}
          </div>
        </OverlayAnchorShell>
      </OverlayPreviewStage>
    </div>
  );
}

export function TargetTrophyOverlay() {
  const { overlayData } = useOverlayRouteData();
  const previewEnabled = isDashboardPreviewMode();

  if (!overlayData) {
    return <div className="overlay-scene overlay-loading">Loading overlay...</div>;
  }

  const routeAnchor = resolveRouteOverlayAnchor(overlayData.display.settings, "targetTrophy");

  return (
    <div
      className={resolveOverlaySceneClassName({
        anchor: routeAnchor,
        previewEnabled,
      })}
    >
      <OverlayPreviewStage enabled={previewEnabled} reportSignal={overlayData}>
        <OverlayAnchorShell anchor={routeAnchor}>
          <div
            className="target-trophy-overlay-shell"
            data-overlay-horizontal-anchor={resolveOverlayHorizontalAnchor(routeAnchor)}
            style={intrinsicWidthShellStyle}
          >
            <TargetTrophyCard
              viewModel={toTargetTrophyViewModel(overlayData.targetTrophy)}
              variant="standalone"
              tagLabel={resolveTargetTrophyTagLabel(overlayData.display.settings)}
              settings={overlayData.display.settings}
            />
          </div>
        </OverlayAnchorShell>
      </OverlayPreviewStage>
    </div>
  );
}
