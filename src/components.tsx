import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

import type {
  GradeKey,
  OverlayAnchor,
  OverlayBrbCard,
  OverlayCurrentGameCard,
  OverlayDataResponse,
  OverlayEarnedSessionCard,
  OverlayOverallCard,
  OverlaySettings,
  OverlayTargetTrophyCard,
  OverlayUnearnedCard,
  OverlayView,
  StripOverlayView,
  StripZoneKey,
} from "../shared/contracts.js";
import {
  createDefaultOverlaySettings,
  DEFAULT_BRB_SUBTITLE_TEXT,
  DEFAULT_CAMERA_BORDER_OPACITY_PERCENT,
  DEFAULT_UNEARNED_TROPHIES_LABEL_TEXT,
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
const BRB_PREVIEW_VIEWPORT_HEIGHT = 220;
const EARNED_SESSION_PREVIEW_VIEWPORT_HEIGHT = 220;
export const CAMERA_BORDER_PREVIEW_VIEWPORT_WIDTH = 1920;
export const CAMERA_BORDER_PREVIEW_VIEWPORT_HEIGHT = 1080;

const numberFormatter = new Intl.NumberFormat("en-US");
const wholePercentFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});
const detailedPercentFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const formatCount = (value: number | null | undefined) =>
  numberFormatter.format(value ?? 0);

const formatWholePercent = (value: number | null | undefined) =>
  value == null ? "--" : `${wholePercentFormatter.format(value)}%`;

const formatDetailedPercent = (value: number | null | undefined) =>
  value == null ? "--" : `${detailedPercentFormatter.format(value)}%`;

const formatPair = (left: number | null | undefined, right: number | null | undefined) =>
  `${formatCount(left)} / ${formatCount(right)}`;

const formatCompactPair = (
  left: number | null | undefined,
  right: number | null | undefined,
) => `${formatCount(left)}/${formatCount(right)}`;

const formatBrbRemaining = (valueMs: number) => {
  const totalSeconds = Math.max(0, Math.ceil(valueMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
};

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
  mode: StripOverlayView;
  title: string;
  artUrl: string | null;
  chipLabel: string | null;
  metricValue: string;
  metricCaption: string;
  detailedProgressValue: string;
  detailedProgressCaption: string;
  progressPercent: number;
  gradeValues: Record<GradeKey, string>;
};

export type TargetTrophyViewModel = {
  trophyName: string;
  description: string;
  iconUrl: string | null;
  grade: GradeKey | null;
};

type BrbViewModel = {
  status: OverlayBrbCard["status"];
  timerLabel: string;
  progressPercent: number;
};

type EarnedSessionViewModel = {
  title: string;
  gradeValues: Record<GradeKey, string>;
};

export type TargetTrophyCardVariant =
  | "panel"
  | "loop"
  | "compact"
  | "standalone";

type OverlayStripSettings = Pick<
  {
    showStripArtwork: boolean;
    showStripIdentity: boolean;
    showStripMetrics: boolean;
    showUnearnedDetailedProgress: boolean;
    showStripTrophies: boolean;
    stripZoneOrder: StripZoneKey[];
    backgroundTransparencyPercent: number;
    artworkRadiusPx: number;
  },
  | "showStripArtwork"
  | "showStripIdentity"
  | "showStripMetrics"
  | "showUnearnedDetailedProgress"
  | "showStripTrophies"
  | "stripZoneOrder"
  | "backgroundTransparencyPercent"
  | "artworkRadiusPx"
>;

type TargetTrophyCardSettings = Pick<
  OverlaySettings,
  "stripZoneOrder" | "showTargetTrophyArtwork" | "showTargetTrophyInfo"
> & {
  overlayAppearance?: OverlaySettings["overlayAppearance"];
};

const defaultOverlayAppearanceSettings = createDefaultOverlaySettings().overlayAppearance;

const defaultOverlayStripSettings: OverlayStripSettings = {
  showStripArtwork: true,
  showStripIdentity: true,
  showStripMetrics: true,
  showUnearnedDetailedProgress: false,
  showStripTrophies: true,
  stripZoneOrder: ["artwork", "identity", "metrics", "trophies", "targetInfo"],
  backgroundTransparencyPercent:
    defaultOverlayAppearanceSettings.currentGame.backgroundTransparencyPercent,
  artworkRadiusPx: defaultOverlayAppearanceSettings.currentGame.artworkRadiusPx,
};

const defaultTargetTrophyCardSettings: TargetTrophyCardSettings = {
  stripZoneOrder: ["artwork", "identity", "metrics", "trophies", "targetInfo"],
  showTargetTrophyArtwork: true,
  showTargetTrophyInfo: true,
  overlayAppearance: defaultOverlayAppearanceSettings,
};

type ArtworkInlineOverhang = "start" | "end" | "both" | null;

const resolveArtworkInlineOverhang = (
  index: number,
  total: number,
): ArtworkInlineOverhang => {
  const isFirst = index === 0;
  const isLast = index === total - 1;

  if (isFirst && isLast) {
    return "both";
  }

  if (isFirst) {
    return "start";
  }

  if (isLast) {
    return "end";
  }

  return null;
};

const clampPercent = (value: number) => Math.max(0, Math.min(100, value));

const clampArtworkRadius = (value: number) => Math.max(0, Math.min(100, value));

const resolveCardOpacityFactor = (backgroundTransparencyPercent: number) =>
  clampPercent(backgroundTransparencyPercent) / 100;

const createCardChromeStyle = (
  backgroundTransparencyPercent: number,
): CSSProperties =>
  ({
    "--overlay-card-opacity-factor": `${resolveCardOpacityFactor(
      backgroundTransparencyPercent,
    )}`,
  }) as CSSProperties;

const createOverlayStripStyle = ({
  backgroundTransparencyPercent,
  artworkRadiusPx,
}: Pick<
  OverlayStripSettings,
  "backgroundTransparencyPercent" | "artworkRadiusPx"
>): CSSProperties =>
  ({
    ...createCardChromeStyle(backgroundTransparencyPercent),
    "--strip-art-radius": `${clampArtworkRadius(artworkRadiusPx)}px`,
  }) as CSSProperties;

const createTargetTrophyCardStyle = ({
  backgroundTransparencyPercent,
  artworkRadiusPx,
}: OverlaySettings["overlayAppearance"]["targetTrophy"]): CSSProperties =>
  ({
    ...createCardChromeStyle(backgroundTransparencyPercent),
    "--target-trophy-art-radius": `${clampArtworkRadius(artworkRadiusPx)}px`,
  }) as CSSProperties;

const createBrbCardStyle = ({
  backgroundTransparencyPercent,
  artworkRadiusPx,
}: OverlaySettings["overlayAppearance"]["brb"]): CSSProperties =>
  ({
    ...createCardChromeStyle(backgroundTransparencyPercent),
    "--brb-art-radius": `${clampArtworkRadius(artworkRadiusPx)}px`,
  }) as CSSProperties;

const clampCameraBorderOpacityPercent = (value: number) =>
  Math.max(0, Math.min(100, value));

const resolveCameraBorderAlpha = (
  baseAlpha: number,
  opacityPercent: number,
) => {
  const clampedOpacityPercent = clampCameraBorderOpacityPercent(opacityPercent);

  if (clampedOpacityPercent <= DEFAULT_CAMERA_BORDER_OPACITY_PERCENT) {
    return Math.max(
      0,
      Math.min(1, baseAlpha * (clampedOpacityPercent / DEFAULT_CAMERA_BORDER_OPACITY_PERCENT)),
    );
  }

  const interpolationProgress =
    (clampedOpacityPercent - DEFAULT_CAMERA_BORDER_OPACITY_PERCENT) /
    (100 - DEFAULT_CAMERA_BORDER_OPACITY_PERCENT);

  return Math.max(
    0,
    Math.min(1, baseAlpha + (1 - baseAlpha) * interpolationProgress),
  );
};

const resolveBrbCardState = (brb: OverlayBrbCard, nowMs: number) => {
  if (brb.status !== "running" || !brb.endsAt) {
    return {
      status: brb.status,
      remainingMs: brb.remainingMs,
    };
  }

  const remainingMs = Math.max(0, Date.parse(brb.endsAt) - nowMs);

  return {
    status: remainingMs <= 0 ? "expired" : "running",
    remainingMs,
  } satisfies Pick<OverlayBrbCard, "status" | "remainingMs">;
};

const toBrbViewModel = (brb: OverlayBrbCard, nowMs: number): BrbViewModel => {
  const resolved = resolveBrbCardState(brb, nowMs);
  const sessionDurationMs = Math.max(brb.sessionDurationMs, 1000);
  const progressPercent =
    resolved.status === "stopped"
      ? 0
      : Math.max(
          0,
          Math.min(100, ((sessionDurationMs - resolved.remainingMs) / sessionDurationMs) * 100),
        );

  if (resolved.status === "running") {
    return {
      status: resolved.status,
      timerLabel: formatBrbRemaining(resolved.remainingMs),
      progressPercent,
    };
  }

  if (resolved.status === "paused") {
    return {
      status: resolved.status,
      timerLabel: formatBrbRemaining(resolved.remainingMs),
      progressPercent,
    };
  }

  if (resolved.status === "expired") {
    return {
      status: resolved.status,
      timerLabel: "00:00",
      progressPercent: 100,
    };
  }

  return {
    status: "stopped",
    timerLabel: formatBrbRemaining(brb.sessionDurationMs),
    progressPercent: 0,
  };
};

const resolveBrbSubtitle = (
  settings: Pick<OverlaySettings, "brbSubtitleText">,
) => {
  const label = settings.brbSubtitleText.trim();
  return label.length > 0 ? label : DEFAULT_BRB_SUBTITLE_TEXT;
};

type CameraBorderFrameMetrics = {
  overlayWidth: number;
  overlayHeight: number;
  inset: number;
  thickness: number;
  radius: number;
  cutoutRadius: number;
};

type CameraBorderFrameGeometry = {
  viewportWidth: number;
  viewportHeight: number;
  outerPath: string;
  innerPath: string | null;
  ringPath: string;
};

const clampCameraBorderRadius = (
  radius: number,
  width: number,
  height: number,
) => Math.max(0, Math.min(radius, width / 2, height / 2));

const createRoundedRectPath = ({
  x,
  y,
  width,
  height,
  radius,
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
}) => {
  if (width <= 0 || height <= 0) {
    return "";
  }

  const resolvedRadius = clampCameraBorderRadius(radius, width, height);

  if (resolvedRadius <= 0) {
    return [
      `M ${x} ${y}`,
      `H ${x + width}`,
      `V ${y + height}`,
      `H ${x}`,
      "Z",
    ].join(" ");
  }

  return [
    `M ${x + resolvedRadius} ${y}`,
    `H ${x + width - resolvedRadius}`,
    `A ${resolvedRadius} ${resolvedRadius} 0 0 1 ${x + width} ${y + resolvedRadius}`,
    `V ${y + height - resolvedRadius}`,
    `A ${resolvedRadius} ${resolvedRadius} 0 0 1 ${x + width - resolvedRadius} ${y + height}`,
    `H ${x + resolvedRadius}`,
    `A ${resolvedRadius} ${resolvedRadius} 0 0 1 ${x} ${y + height - resolvedRadius}`,
    `V ${y + resolvedRadius}`,
    `A ${resolvedRadius} ${resolvedRadius} 0 0 1 ${x + resolvedRadius} ${y}`,
    "Z",
  ].join(" ");
};

const resolveCameraBorderFrameMetrics = (
  cameraBorder: OverlaySettings["cameraBorder"],
  viewport: { width: number; height: number },
): CameraBorderFrameMetrics => {
  const scale = Math.min(
    Math.max(
      Math.min(
        viewport.width / CAMERA_BORDER_PREVIEW_VIEWPORT_WIDTH,
        viewport.height / CAMERA_BORDER_PREVIEW_VIEWPORT_HEIGHT,
      ),
      0.42,
    ),
    1.28,
  );

  return {
    overlayWidth: viewport.width,
    overlayHeight: viewport.height,
    inset: Math.max(0, Math.round(cameraBorder.baseInsetPx * scale)),
    thickness: Math.max(1, Math.round(cameraBorder.baseThicknessPx * scale)),
    radius: Math.max(0, Math.round(cameraBorder.baseRadiusPx * scale)),
    cutoutRadius: Math.max(0, Math.round(cameraBorder.baseCutoutRadiusPx * scale)),
  };
};

const resolveCameraBorderFrameGeometry = (
  frame: CameraBorderFrameMetrics,
): CameraBorderFrameGeometry => {
  const viewportWidth = Math.max(frame.overlayWidth, 1);
  const viewportHeight = Math.max(frame.overlayHeight, 1);
  const outerWidth = Math.max(0, viewportWidth - (frame.inset * 2));
  const outerHeight = Math.max(0, viewportHeight - (frame.inset * 2));
  const innerInset = frame.inset + frame.thickness;
  const innerWidth = Math.max(0, viewportWidth - (innerInset * 2));
  const innerHeight = Math.max(0, viewportHeight - (innerInset * 2));
  const outerPath = createRoundedRectPath({
    x: frame.inset,
    y: frame.inset,
    width: outerWidth,
    height: outerHeight,
    radius: clampCameraBorderRadius(frame.radius, outerWidth, outerHeight),
  });
  const innerPath =
    innerWidth > 0 && innerHeight > 0
      ? createRoundedRectPath({
          x: innerInset,
          y: innerInset,
          width: innerWidth,
          height: innerHeight,
          radius: clampCameraBorderRadius(frame.cutoutRadius, innerWidth, innerHeight),
        })
      : null;

  return {
    viewportWidth,
    viewportHeight,
    outerPath,
    innerPath,
    ringPath: innerPath ? `${outerPath} ${innerPath}` : outerPath,
  };
};

const toEarnedSessionViewModel = (
  earnedSession: OverlayEarnedSessionCard,
  settings: Pick<OverlaySettings, "earnedSessionHeadingText">,
): EarnedSessionViewModel => ({
  title: settings.earnedSessionHeadingText.trim() || "Earned This Session",
  gradeValues: {
    platinum: formatCount(earnedSession.counts.platinum),
    gold: formatCount(earnedSession.counts.gold),
    silver: formatCount(earnedSession.counts.silver),
    bronze: formatCount(earnedSession.counts.bronze),
  },
});

const formatUnearnedCountCaption = (
  count: number,
  settings: Pick<OverlaySettings, "unearnedTrophiesLabelText">,
) => {
  const label = settings.unearnedTrophiesLabelText.trim();
  const countLabel = formatCount(count);
  return label ? `${countLabel} ${label}` : countLabel;
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
  view: StripOverlayView,
  settings: Pick<OverlaySettings, "unearnedTrophiesLabelText">,
) => {
  if (view === "overall") {
    return toOverallStripViewModel(overlayData.overall);
  }

  if (view === "currentGame") {
    return toCurrentGameStripViewModel(overlayData.currentGame);
  }

  return toUnearnedStripViewModel(overlayData.unearnedTrophies, settings);
};

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
    detailedProgressValue: "--",
    detailedProgressCaption: "--",
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
    detailedProgressValue: "--",
    detailedProgressCaption: "--",
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

export function toUnearnedStripViewModel(
  unearnedTrophies: OverlayUnearnedCard | null,
  settings: Pick<OverlaySettings, "unearnedTrophiesLabelText"> = {
    unearnedTrophiesLabelText: DEFAULT_UNEARNED_TROPHIES_LABEL_TEXT,
  },
): OverlayStripViewModel {
  return {
    mode: "unearnedTrophies",
    title: unearnedTrophies?.onlineId ?? "Unavailable",
    artUrl: null,
    chipLabel: "Unearned trophies",
    metricValue: formatWholePercent(unearnedTrophies?.completionPercentage),
    metricCaption: unearnedTrophies
      ? formatUnearnedCountCaption(unearnedTrophies.totalUnearnedCount, settings)
      : "--",
    detailedProgressValue: formatDetailedPercent(unearnedTrophies?.completionPercentage),
    detailedProgressCaption: unearnedTrophies
      ? formatUnearnedCountCaption(unearnedTrophies.totalUnearnedCount, settings)
      : "--",
    progressPercent: unearnedTrophies?.completionPercentage ?? 0,
    gradeValues: unearnedTrophies
      ? {
          platinum: formatCount(unearnedTrophies.unearnedCounts.platinum),
          gold: formatCount(unearnedTrophies.unearnedCounts.gold),
          silver: formatCount(unearnedTrophies.unearnedCounts.silver),
          bronze: formatCount(unearnedTrophies.unearnedCounts.bronze),
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
      style={createOverlayStripStyle(settings)}
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
  const zoneDefinitions = resolveStripZoneDefinitions({
    compact,
    settings,
    viewModel,
  });
  const artworkIndex = zoneDefinitions.findIndex((zone) => zone.key === "artwork");
  const artworkInlineOverhang =
    artworkIndex >= 0
      ? resolveArtworkInlineOverhang(artworkIndex, zoneDefinitions.length)
      : null;
  const artworkStartOverhang =
    artworkInlineOverhang === "start" || artworkInlineOverhang === "both"
      ? " - var(--strip-art-inline-overhang)"
      : "";
  const artworkEndOverhang =
    artworkInlineOverhang === "end" || artworkInlineOverhang === "both"
      ? " - var(--strip-art-inline-overhang)"
      : "";
  const templateColumns = zoneDefinitions
    .map((zone) =>
      zone.key === "artwork" && artworkInlineOverhang
        ? "var(--overlay-strip-art-column-size)"
        : zone.column,
    )
    .join(" ");
  const contentStyle =
    templateColumns.length > 0
      ? ({
          gridTemplateColumns: templateColumns,
          ...(artworkInlineOverhang
            ? {
                "--overlay-strip-art-column-size": `calc(var(--strip-art-size)${artworkStartOverhang}${artworkEndOverhang})`,
              }
            : {}),
        } as CSSProperties)
      : undefined;

  return (
    <div
      className={`overlay-strip-content overlay-strip-content-${viewModel.mode}`}
      style={contentStyle}
    >
      {zoneDefinitions.map((zone) =>
        zone.render({
          artworkInlineOverhang: zone.key === "artwork" ? artworkInlineOverhang : null,
        }),
      )}
    </div>
  );
}

type OverlayStripZoneRenderLayout = {
  artworkInlineOverhang: ArtworkInlineOverhang;
};

type OverlayStripZoneDefinition = {
  key: string;
  column: string;
  render: (layout: OverlayStripZoneRenderLayout) => ReactNode;
};

const resolveStripZoneDefinitions = ({
  compact,
  settings,
  viewModel,
}: {
  compact: boolean;
  settings: OverlayStripSettings;
  viewModel: OverlayStripViewModel;
}): OverlayStripZoneDefinition[] => {
  if (viewModel.mode !== "unearnedTrophies" || !settings.showUnearnedDetailedProgress) {
    return settings.stripZoneOrder.flatMap((zoneKey) => {
      const definition = resolveStripZoneDefinition(zoneKey, {
        compact,
        settings,
        viewModel,
      });

      return definition ? [definition] : [];
    });
  }

  const detailedProgressDefinition = resolveDetailedProgressZoneDefinition({
    compact,
    viewModel,
  });
  const clusterDefinitions = [
    settings.showStripMetrics
      ? resolveStripZoneDefinition("metrics", {
          compact,
          settings,
          viewModel,
        })
      : null,
    detailedProgressDefinition,
    settings.showStripTrophies
      ? resolveStripZoneDefinition("trophies", {
          compact,
          settings,
          viewModel,
        })
      : null,
  ].filter((definition): definition is OverlayStripZoneDefinition => definition != null);
  const metricIndex = settings.stripZoneOrder.indexOf("metrics");
  const trophyIndex = settings.stripZoneOrder.indexOf("trophies");
  const anchorIndex = [
    settings.showStripMetrics || settings.showUnearnedDetailedProgress ? metricIndex : -1,
    settings.showStripTrophies ? trophyIndex : -1,
  ]
    .filter((index) => index >= 0)
    .sort((left, right) => left - right)
    .at(0);
  const zoneDefinitions: OverlayStripZoneDefinition[] = [];
  let clusterInserted = false;

  settings.stripZoneOrder.forEach((zoneKey, index) => {
    if (!clusterInserted && index === anchorIndex) {
      zoneDefinitions.push(...clusterDefinitions);
      clusterInserted = true;
    }

    if (zoneKey === "metrics" || zoneKey === "trophies") {
      return;
    }

    const definition = resolveStripZoneDefinition(zoneKey, {
      compact,
      settings,
      viewModel,
    });

    if (definition) {
      zoneDefinitions.push(definition);
    }
  });

  if (!clusterInserted) {
    zoneDefinitions.push(...clusterDefinitions);
  }

  return zoneDefinitions;
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
      render: ({ artworkInlineOverhang }) => (
        <div
          className={[
            "overlay-strip-zone",
            "overlay-strip-zone-art",
            artworkInlineOverhang
              ? `overlay-strip-zone-art-inline-${artworkInlineOverhang}`
              : "",
          ]
            .filter(Boolean)
            .join(" ")}
          key={zoneKey}
        >
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

const resolveDetailedProgressZoneDefinition = ({
  compact,
  viewModel,
}: {
  compact: boolean;
  viewModel: OverlayStripViewModel;
}): OverlayStripZoneDefinition => ({
  key: "unearnedDetailedProgress",
  column: "auto",
  render: () => (
    <div
      className="overlay-strip-zone overlay-strip-zone-detailed-progress"
      key="unearnedDetailedProgress"
    >
      <strong className="overlay-detailed-progress-line">
        {viewModel.detailedProgressValue}
      </strong>
      <strong className="overlay-detailed-progress-line">
        {viewModel.detailedProgressCaption}
      </strong>
    </div>
  ),
});

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
  const appearance =
    settings.overlayAppearance?.targetTrophy ??
    defaultOverlayAppearanceSettings.targetTrophy;
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
      (zoneKey === "artwork" && settings.showTargetTrophyArtwork) ||
      (zoneKey === "targetInfo" && settings.showTargetTrophyInfo),
  );
  const artworkInlineOverhang = zoneOrder.includes("artwork")
    ? resolveArtworkInlineOverhang(zoneOrder.indexOf("artwork"), zoneOrder.length)
    : null;
  const zoneElements = zoneOrder.flatMap((zoneKey) => {
    if (zoneKey === "artwork") {
      return [
        <div
          className={[
            "target-trophy-zone",
            "target-trophy-zone-artwork",
            artworkInlineOverhang
              ? `target-trophy-zone-artwork-inline-${artworkInlineOverhang}`
              : "",
          ]
            .filter(Boolean)
            .join(" ")}
          key={zoneKey}
        >
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
    <section className={className} style={createTargetTrophyCardStyle(appearance)}>
      {zoneElements}
    </section>
  );
}

function BeRightBackCard({
  brb,
  settings,
}: {
  brb: OverlayBrbCard;
  settings: Pick<
    OverlaySettings,
    | "showBrbArtwork"
    | "showBrbIdentity"
    | "showBrbProgress"
    | "brbSubtitleText"
    | "overlayAppearance"
  >;
}) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const viewModel = useMemo(() => toBrbViewModel(brb, nowMs), [brb, nowMs]);
  const subtitle = resolveBrbSubtitle(settings);

  useEffect(() => {
    if (brb.status !== "running" || !brb.endsAt) {
      return;
    }

    const tick = () => setNowMs(Date.now());
    tick();
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, [brb.endsAt, brb.status]);

  return (
    <section
      className={`brb-card brb-card-status-${viewModel.status}`}
      style={createBrbCardStyle(settings.overlayAppearance.brb)}
    >
      {settings.showBrbArtwork ? (
        <div className="brb-zone brb-zone-artwork brb-zone-artwork-inline-start">
          <div className="brb-art-shell">
            <div className="brb-art-badge" aria-hidden="true">
              BRB
            </div>
          </div>
        </div>
      ) : null}
      {settings.showBrbIdentity ? (
        <div className="brb-zone brb-zone-identity">
          <div className="brb-copy">
            <h2>Be Right Back</h2>
            <p className="brb-subtitle">{subtitle}</p>
          </div>
        </div>
      ) : null}
      <div className="brb-zone brb-zone-timer">
        <strong className="brb-timer-value">{viewModel.timerLabel}</strong>
        {settings.showBrbProgress ? (
          <div className="brb-progress-track" aria-hidden="true">
            <div
              className="brb-progress-fill"
              style={{ width: `${viewModel.progressPercent}%` }}
            />
          </div>
        ) : null}
      </div>
    </section>
  );
}

function EarnedSessionCard({
  earnedSession,
  settings,
}: {
  earnedSession: OverlayEarnedSessionCard;
  settings: Pick<
    OverlaySettings,
    | "showEarnedSessionIdentity"
    | "showEarnedSessionTrophies"
    | "earnedSessionHeadingText"
    | "overlayAppearance"
  >;
}) {
  const viewModel = useMemo(
    () => toEarnedSessionViewModel(earnedSession, settings),
    [earnedSession, settings],
  );

  return (
    <section
      className="earned-session-card"
      style={createCardChromeStyle(
        settings.overlayAppearance.earnedSession.backgroundTransparencyPercent,
      )}
    >
      {settings.showEarnedSessionIdentity ? (
        <div className="earned-session-zone earned-session-zone-identity">
          <h2 title={viewModel.title} style={singleLineClampStyle}>
            {viewModel.title}
          </h2>
        </div>
      ) : null}
      {settings.showEarnedSessionTrophies ? (
        <div className="earned-session-zone earned-session-zone-grades overlay-strip-zone-grades">
          {gradeOrder.map((grade) => (
            <div className={`overlay-grade-group ${grade}`} key={grade}>
              <div className="overlay-grade-head">
                <img className="overlay-grade-icon" src={gradeIcon[grade]} alt="" />
                <strong>{viewModel.gradeValues[grade]}</strong>
              </div>
            </div>
          ))}
        </div>
      ) : null}
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
      viewModel={toStripViewModel(overlayData, view, resolvedSettings)}
      compact={compact}
      settings={resolveOverlayStripSettings(resolvedSettings, view)}
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

function useOverlayPreviewMessage(previewEnabled: boolean) {
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

  return previewMessage;
}

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
  routeKey: keyof OverlaySettings["overlayAnchors"],
) => settings.overlayAnchors[routeKey];

const resolveOverlayAnchorClassName = (anchor: OverlayAnchor) => {
  switch (anchor) {
    case "top-left":
      return "overlay-scene-anchor-top-left";
    case "top-center":
      return "overlay-scene-anchor-top-center";
    case "top-right":
      return "overlay-scene-anchor-top-right";
    case "bottom-center":
      return "overlay-scene-anchor-bottom-center";
    case "bottom-right":
      return "overlay-scene-anchor-bottom-right";
    case "bottom-left":
    default:
      return "overlay-scene-anchor-bottom-left";
  }
};

type OverlayHorizontalAnchor = "left" | "center" | "right";

const resolveOverlayHorizontalAnchor = (
  anchor: OverlayAnchor,
): OverlayHorizontalAnchor => {
  switch (anchor) {
    case "top-right":
    case "bottom-right":
      return "right";
    case "top-center":
    case "bottom-center":
      return "center";
    case "top-left":
    case "bottom-left":
    default:
      return "left";
  }
};

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
  const previewMessage = useOverlayPreviewMessage(previewEnabled);

  const resolvedOverlayData = useMemo(() => {
    if (previewMessage) {
      return applyPreviewSettings(previewMessage.overlayData, previewMessage.settings);
    }

    return overlayData;
  }, [overlayData, previewMessage]);

  return { overlayData: resolvedOverlayData, error };
}

function useOverlaySettingsPolling(intervalMs = 5000) {
  const [settings, setSettings] = useState<OverlaySettings>(() => createDefaultOverlaySettings());

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const nextSettings = await api.getSettings();

        if (!cancelled) {
          setSettings(nextSettings);
        }
      } catch {
        // Preserve the last good settings so the route still renders offline.
      }
    };

    void load();
    const timer = window.setInterval(() => void load(), intervalMs);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [intervalMs]);

  return settings;
}

function useCameraBorderRouteSettings(intervalMs = 5000) {
  const previewEnabled = isDashboardPreviewMode();
  const persistedSettings = useOverlaySettingsPolling(intervalMs);
  const previewMessage = useOverlayPreviewMessage(previewEnabled);

  return previewMessage?.settings ?? persistedSettings;
}

const parsePositiveInt = (
  value: string | null,
  fallback: number,
  minimum: number,
  maximum: number,
) => {
  const parsed = Number.parseInt(value ?? "", 10);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(Math.max(parsed, minimum), maximum);
};

const resolveCameraBorderViewport = () => {
  const params = new URLSearchParams(window.location.search);
  const explicitWidth = parsePositiveInt(params.get("width"), 0, 0, 3840);
  const explicitHeight = parsePositiveInt(params.get("height"), 0, 0, 2160);

  return {
    width: explicitWidth || window.innerWidth,
    height: explicitHeight || window.innerHeight,
  };
};

export function CameraBorderOverlay() {
  const settings = useCameraBorderRouteSettings();
  const previewEnabled = isDashboardPreviewMode();
  const [viewport, setViewport] = useState(() => resolveCameraBorderViewport());
  const svgIdPrefix = useId().replace(/:/g, "");

  useEffect(() => {
    const updateViewport = () => {
      setViewport((current) => {
        const next = resolveCameraBorderViewport();

        return current.width === next.width && current.height === next.height ? current : next;
      });
    };

    updateViewport();
    window.addEventListener("resize", updateViewport, { passive: true });
    return () => window.removeEventListener("resize", updateViewport);
  }, []);

  const frameMetrics = useMemo(
    () => resolveCameraBorderFrameMetrics(settings.cameraBorder, viewport),
    [settings.cameraBorder, viewport.height, viewport.width],
  );
  const frameGeometry = useMemo(
    () => resolveCameraBorderFrameGeometry(frameMetrics),
    [frameMetrics],
  );
  const frameStyle = useMemo(
    () =>
      ({
        "--camera-border-overlay-width": `${frameMetrics.overlayWidth}px`,
        "--camera-border-overlay-height": `${frameMetrics.overlayHeight}px`,
        "--camera-border-frame-inset": `${frameMetrics.inset}px`,
        "--camera-border-frame-thickness": `${frameMetrics.thickness}px`,
        "--camera-border-frame-radius": `${frameMetrics.radius}px`,
        "--camera-border-cutout-radius": `${frameMetrics.cutoutRadius}px`,
      }) as CSSProperties,
    [frameMetrics],
  );
  const cameraBorderAlpha = useMemo(
    () => ({
      ringStart: `rgba(33, 52, 83, ${resolveCameraBorderAlpha(0.96, settings.cameraBorder.opacityPercent)})`,
      ringEnd: `rgba(14, 22, 35, ${resolveCameraBorderAlpha(0.96, settings.cameraBorder.opacityPercent)})`,
      sheenStart: `rgba(255, 255, 255, ${resolveCameraBorderAlpha(0.08, settings.cameraBorder.opacityPercent)})`,
      outerStroke: `rgba(168, 197, 247, ${resolveCameraBorderAlpha(0.22, settings.cameraBorder.opacityPercent)})`,
      outerHighlightStroke: `rgba(255, 255, 255, ${resolveCameraBorderAlpha(0.06, settings.cameraBorder.opacityPercent)})`,
      innerStroke: `rgba(209, 220, 244, ${resolveCameraBorderAlpha(0.24, settings.cameraBorder.opacityPercent)})`,
    }),
    [settings.cameraBorder.opacityPercent],
  );
  const ringGradientId = `${svgIdPrefix}-camera-border-ring-gradient`;
  const sheenGradientId = `${svgIdPrefix}-camera-border-sheen-gradient`;

  return (
    <div className="camera-border-overlay-scene">
      <OverlayPreviewStage enabled={previewEnabled} reportSignal={{ settings, viewport }}>
        <div className="camera-border-overlay-shell" style={frameStyle}>
          <svg
            aria-hidden="true"
            className="camera-border-frame-svg"
            data-camera-border-cutout-radius={frameMetrics.cutoutRadius}
            preserveAspectRatio="none"
            viewBox={`0 0 ${frameGeometry.viewportWidth} ${frameGeometry.viewportHeight}`}
          >
            <defs>
              <linearGradient id={ringGradientId} x1="0%" x2="100%" y1="0%" y2="100%">
                <stop offset="0%" stopColor={cameraBorderAlpha.ringStart} />
                <stop offset="100%" stopColor={cameraBorderAlpha.ringEnd} />
              </linearGradient>
              <linearGradient id={sheenGradientId} x1="0%" x2="0%" y1="0%" y2="100%">
                <stop offset="0%" stopColor={cameraBorderAlpha.sheenStart} />
                <stop offset="28%" stopColor="rgba(255, 255, 255, 0)" />
              </linearGradient>
            </defs>
            {frameGeometry.ringPath ? (
              <>
                <path
                  clipRule="evenodd"
                  d={frameGeometry.ringPath}
                  fill={`url(#${ringGradientId})`}
                  fillRule="evenodd"
                />
                <path
                  clipRule="evenodd"
                  d={frameGeometry.ringPath}
                  fill={`url(#${sheenGradientId})`}
                  fillRule="evenodd"
                />
                {frameGeometry.outerPath ? (
                  <>
                    <path
                      d={frameGeometry.outerPath}
                      fill="none"
                      stroke={cameraBorderAlpha.outerStroke}
                      strokeWidth="1"
                    />
                    <path
                      d={frameGeometry.outerPath}
                      fill="none"
                      stroke={cameraBorderAlpha.outerHighlightStroke}
                      strokeWidth="1"
                    />
                  </>
                ) : null}
                {frameGeometry.innerPath ? (
                  <path
                    d={frameGeometry.innerPath}
                    fill="none"
                    stroke={cameraBorderAlpha.innerStroke}
                    strokeWidth="1"
                  />
                ) : null}
              </>
            ) : null}
          </svg>
        </div>
      </OverlayPreviewStage>
    </div>
  );
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
  const unearnedTrophiesDurationMs =
    displayData.display.settings.unearnedTrophiesDurationMs;
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
        : currentView === "unearnedTrophies"
          ? unearnedTrophiesDurationMs
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
    unearnedTrophiesDurationMs,
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

export function UnearnedTrophiesOverlay() {
  const { overlayData } = useOverlayRouteData();
  const previewEnabled = isDashboardPreviewMode();

  if (!overlayData) {
    return <div className="overlay-scene overlay-loading">Loading overlay...</div>;
  }

  const routeAnchor = resolveRouteOverlayAnchor(
    overlayData.display.settings,
    "unearnedTrophies",
  );

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
            {renderOverlayCard(overlayData, "unearnedTrophies")}
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

export function BeRightBackOverlay() {
  const { overlayData } = useOverlayRouteData();
  const previewEnabled = isDashboardPreviewMode();

  if (!overlayData) {
    return <div className="overlay-scene overlay-loading">Loading overlay...</div>;
  }

  const routeAnchor = resolveRouteOverlayAnchor(overlayData.display.settings, "brb");
  const shouldRenderCard = previewEnabled || overlayData.brb.visible;

  return (
    <div
      className={resolveOverlaySceneClassName({
        anchor: routeAnchor,
        previewEnabled,
      })}
    >
      <OverlayPreviewStage enabled={previewEnabled} reportSignal={overlayData}>
        <OverlayAnchorShell anchor={routeAnchor}>
          {shouldRenderCard ? (
            <div
              className="brb-overlay-shell"
              data-overlay-horizontal-anchor={resolveOverlayHorizontalAnchor(routeAnchor)}
              style={intrinsicWidthShellStyle}
            >
              <BeRightBackCard brb={overlayData.brb} settings={overlayData.display.settings} />
            </div>
          ) : null}
        </OverlayAnchorShell>
      </OverlayPreviewStage>
    </div>
  );
}

export function EarnedSessionOverlay() {
  const { overlayData } = useOverlayRouteData();
  const previewEnabled = isDashboardPreviewMode();

  if (!overlayData) {
    return <div className="overlay-scene overlay-loading">Loading overlay...</div>;
  }

  const routeAnchor = resolveRouteOverlayAnchor(
    overlayData.display.settings,
    "earnedSession",
  );
  const shouldRenderCard = previewEnabled || overlayData.earnedSession.visible;

  return (
    <div
      className={resolveOverlaySceneClassName({
        anchor: routeAnchor,
        previewEnabled,
      })}
    >
      <OverlayPreviewStage enabled={previewEnabled} reportSignal={overlayData}>
        <OverlayAnchorShell anchor={routeAnchor}>
          {shouldRenderCard ? (
            <div
              className="earned-session-overlay-shell"
              data-overlay-horizontal-anchor={resolveOverlayHorizontalAnchor(routeAnchor)}
              style={intrinsicWidthShellStyle}
            >
              <EarnedSessionCard
                earnedSession={overlayData.earnedSession}
                settings={overlayData.display.settings}
              />
            </div>
          ) : null}
        </OverlayAnchorShell>
      </OverlayPreviewStage>
    </div>
  );
}

const resolveOverlayStripSettings = (
  settings: OverlaySettings,
  view: StripOverlayView,
): OverlayStripSettings => {
  const visibility = settings.stripVisibility[view];
  const appearance = settings.overlayAppearance[view];

  return {
    showStripArtwork: view === "unearnedTrophies" ? false : visibility.artwork,
    showStripIdentity: visibility.identity,
    showStripMetrics: visibility.metrics,
    showUnearnedDetailedProgress:
      view === "unearnedTrophies" && settings.showUnearnedDetailedProgress,
    showStripTrophies: visibility.trophies,
    stripZoneOrder: settings.stripZoneOrder,
    backgroundTransparencyPercent: appearance.backgroundTransparencyPercent,
    artworkRadiusPx:
      view === "unearnedTrophies"
        ? defaultOverlayAppearanceSettings.currentGame.artworkRadiusPx
        : settings.overlayAppearance[view].artworkRadiusPx,
  };
};
