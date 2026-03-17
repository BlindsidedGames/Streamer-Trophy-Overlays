import { useEffect, useMemo, useRef, useState } from "react";

import type {
  GradeKey,
  OverlayCurrentGameCard,
  OverlayDataResponse,
  OverlayOverallCard,
  OverlaySettings,
  OverlayTargetTrophyCard,
  OverlayView,
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
}: {
  viewModel: OverlayStripViewModel;
  compact?: boolean;
}) {
  return (
    <section
      className={`overlay-strip overlay-strip-${viewModel.mode} ${
        compact ? "overlay-strip-compact" : ""
      }`}
    >
      <OverlayStripContent viewModel={viewModel} />
    </section>
  );
}

function OverlayStripContent({
  viewModel,
}: {
  viewModel: OverlayStripViewModel;
}) {
  return (
    <div className={`overlay-strip-content overlay-strip-content-${viewModel.mode}`}>
      <div className="overlay-strip-zone overlay-strip-zone-art">
        <div className="overlay-art-shell">
          {viewModel.artUrl ? (
            <img className="overlay-art" src={viewModel.artUrl} alt="" />
          ) : (
            <div className="overlay-art overlay-art-placeholder" aria-hidden="true" />
          )}
        </div>
      </div>

      <div className="overlay-strip-zone overlay-strip-zone-identity">
        <h2 title={viewModel.title}>{viewModel.title}</h2>
        {viewModel.chipLabel ? (
          <span className="overlay-chip">{viewModel.chipLabel}</span>
        ) : (
          <span className="overlay-chip overlay-chip-placeholder">--</span>
        )}
      </div>

      <div className="overlay-strip-zone overlay-strip-zone-metric">
        <strong className="overlay-metric-value">{viewModel.metricValue}</strong>
        <div className="overlay-metric-track" aria-hidden="true">
          <div
            className="overlay-metric-fill"
            style={{ width: `${Math.max(0, Math.min(100, viewModel.progressPercent))}%` }}
          />
        </div>
        <span className="overlay-metric-caption">{viewModel.metricCaption}</span>
      </div>

      <div className="overlay-strip-zone overlay-strip-zone-grades">
        {gradeOrder.map((grade) => (
          <div className={`overlay-grade-group ${grade}`} key={grade}>
            <div className="overlay-grade-head">
              <img className="overlay-grade-icon" src={gradeIcon[grade]} alt="" />
              <strong>{viewModel.gradeValues[grade]}</strong>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function TargetTrophyCard({
  viewModel,
  variant = "panel",
  tagLabel = null,
}: {
  viewModel: TargetTrophyViewModel;
  variant?: TargetTrophyCardVariant;
  tagLabel?: string | null;
}) {
  const className = [
    "target-trophy-card",
    `target-trophy-card-${variant}`,
    variant === "loop" || variant === "compact" ? "target-trophy-card-loop" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <section className={className}>
      <div className="target-trophy-art-shell">
        {viewModel.iconUrl ? (
          <img className="target-trophy-art" src={viewModel.iconUrl} alt="" />
        ) : (
          <div className="target-trophy-art target-trophy-art-placeholder" aria-hidden="true" />
        )}
      </div>

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
          <h2 title={viewModel.trophyName}>{viewModel.trophyName}</h2>
        </div>
        {tagLabel ? <span className="overlay-chip target-trophy-tag">{tagLabel}</span> : null}
        <p className="target-trophy-description">{viewModel.description}</p>
      </div>
    </section>
  );
}

function renderOverlayCard(
  overlayData: OverlayDataResponse,
  view: OverlayView,
  compact = false,
  settingsOverride?: OverlaySettings,
) {
  if (view === "targetTrophy") {
    return (
      <TargetTrophyCard
        viewModel={toTargetTrophyViewModel(overlayData.targetTrophy)}
        variant={compact ? "compact" : "loop"}
        tagLabel={resolveTargetTrophyTagLabel(
          settingsOverride ?? overlayData.display.settings,
        )}
      />
    );
  }

  return (
    <OverlayStrip viewModel={toStripViewModel(overlayData, view)} compact={compact} />
  );
}

export function DashboardOverlayPreview({
  overlayData,
  mode,
  settingsOverride,
}: {
  overlayData: OverlayDataResponse;
  mode: OverlayView;
  settingsOverride?: OverlaySettings;
}) {
  return (
    <div className="overlay-preview-frame">
      {renderOverlayCard(overlayData, mode, true, settingsOverride)}
    </div>
  );
}

export function LoopOverlay() {
  const { overlayData } = useOverlayPolling();

  if (!overlayData) {
    return <div className="overlay-scene overlay-loading">Loading overlay...</div>;
  }

  return <LoopOverlayView overlayData={overlayData} />;
}

export function LoopOverlayView({
  overlayData,
}: {
  overlayData: OverlayDataResponse;
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [previousView, setPreviousView] = useState<OverlayView | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [transitionEntered, setTransitionEntered] = useState(false);
  const [displayData, setDisplayData] = useState(overlayData);
  const pendingDataRef = useRef<OverlayDataResponse | null>(null);

  const loopOrder: OverlayView[] = displayData.display.loopOrder.length
    ? displayData.display.loopOrder
    : ["overall", "currentGame"];

  useEffect(() => {
    if (currentIndex >= loopOrder.length) {
      setCurrentIndex(0);
    }
  }, [currentIndex, loopOrder.length]);

  const currentView = loopOrder[Math.min(currentIndex, loopOrder.length - 1)] ?? "overall";
  const overallDurationMs = displayData.display.settings.overallDurationMs;
  const currentGameDurationMs = displayData.display.settings.currentGameDurationMs;
  const targetTrophyDurationMs = displayData.display.settings.targetTrophyDurationMs;

  useEffect(() => {
    if (isTransitioning) {
      pendingDataRef.current = overlayData;
      return;
    }

    setDisplayData(overlayData);
  }, [isTransitioning, overlayData]);

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

  return (
    <div className="overlay-scene overlay-scene-strip">
      <div className="overlay-strip-shell">
        <div className="overlay-strip-content-stack">
          <div
            className={`overlay-strip-content-layer overlay-strip-content-layer-current overlay-strip-content-layer-${currentView} ${
              isTransitioning ? "is-transitioning" : ""
            } ${transitionEntered ? "is-entered" : ""}`}
          >
            {renderOverlayCard(displayData, currentView)}
          </div>
          {previousView ? (
            <div
              className={`overlay-strip-content-layer overlay-strip-content-layer-previous overlay-strip-content-layer-${previousView} ${
                transitionEntered ? "is-exiting" : ""
              }`}
            >
              {renderOverlayCard(displayData, previousView)}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function OverallOverlay() {
  const { overlayData } = useOverlayPolling();

  if (!overlayData) {
    return <div className="overlay-scene overlay-loading">Loading overlay...</div>;
  }

  return (
    <div className="overlay-scene overlay-scene-strip">
      <div className="overlay-strip-shell">
        {renderOverlayCard(overlayData, "overall")}
      </div>
    </div>
  );
}

export function CurrentGameOverlay() {
  const { overlayData } = useOverlayPolling();

  if (!overlayData) {
    return <div className="overlay-scene overlay-loading">Loading overlay...</div>;
  }

  return (
    <div className="overlay-scene overlay-scene-strip">
      <div className="overlay-strip-shell">
        {renderOverlayCard(overlayData, "currentGame")}
      </div>
    </div>
  );
}

export function TargetTrophyOverlay() {
  const { overlayData } = useOverlayPolling();

  if (!overlayData) {
    return <div className="overlay-scene overlay-loading">Loading overlay...</div>;
  }

  return (
    <div className="overlay-scene overlay-scene-strip">
      <div className="target-trophy-overlay-shell">
        <TargetTrophyCard
          viewModel={toTargetTrophyViewModel(overlayData.targetTrophy)}
          variant="standalone"
          tagLabel={resolveTargetTrophyTagLabel(overlayData.display.settings)}
        />
      </div>
    </div>
  );
}
