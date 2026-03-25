// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import type { ReactElement } from "react";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createDefaultOverlaySettings,
  type OverlayDataResponse,
} from "../shared/contracts.js";
import {
  CurrentGameOverlay,
  EmbeddedOverlayPreview,
  LoopOverlay,
  OverlayStrip,
  LoopOverlayView,
  OverallOverlay,
  OVERLAY_PREVIEW_METRICS_MESSAGE_TYPE,
  OVERLAY_PREVIEW_MESSAGE_TYPE,
  TargetTrophyCard,
  TargetTrophyOverlay,
  toCurrentGameStripViewModel,
  toOverallStripViewModel,
  toTargetTrophyViewModel,
} from "./components.js";
import "./styles.css";

const LOOP_TRANSITION_SETTLE_MS = 840;
const flushEffects = () =>
  act(async () => {
    await Promise.resolve();
  });

const createRect = (width: number, height: number): DOMRect =>
  ({
    width,
    height,
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: width,
    bottom: height,
    toJSON: () => ({}),
  }) as DOMRect;

const setIntrinsicWidth = (element: HTMLElement, width: number, boundingWidth = width) => {
  Object.defineProperty(element, "scrollWidth", {
    configurable: true,
    get: () => width,
  });
  Object.defineProperty(element, "offsetWidth", {
    configurable: true,
    get: () => width,
  });
  element.getBoundingClientRect = () => createRect(boundingWidth, 120);
};

const getStripZoneClassOrder = (container: HTMLElement) =>
  Array.from(container.querySelectorAll(".overlay-strip-content > .overlay-strip-zone")).map(
    (zone) =>
      Array.from(zone.classList).find((className) =>
        className.startsWith("overlay-strip-zone-"),
      ),
  );

const getTargetTrophyZoneClassOrder = (container: HTMLElement) =>
  Array.from(container.querySelectorAll(".target-trophy-card > .target-trophy-zone")).map(
    (zone) =>
      Array.from(zone.classList).find((className) =>
        className.startsWith("target-trophy-zone-"),
      ),
  );

const getPrimaryOverlayShell = (container: HTMLElement) =>
  container.querySelector(
    ".overlay-strip-shell, .target-trophy-overlay-shell",
  ) as HTMLElement | null;

const getAnchorShell = (container: HTMLElement) =>
  container.querySelector(".overlay-anchor-shell") as HTMLElement | null;

const overlayData: OverlayDataResponse = {
  overall: {
    onlineId: "Vathreon",
    avatarUrl: null,
    totalTrophies: 2848,
    completionPercentage: null,
    progressToNextLevel: 66,
    counts: {
      platinum: 50,
      gold: 367,
      silver: 503,
      bronze: 1928,
      total: 2848,
    },
  },
  currentGame: {
    source: "psn",
    npCommunicationId: "NPWR1",
    titleName: "Bluey",
    platform: "PS5",
    iconUrl: null,
    completionPercentage: 100,
    earnedCounts: {
      platinum: 1,
      gold: 8,
      silver: 8,
      bronze: 6,
      total: 23,
    },
    definedCounts: {
      platinum: 1,
      gold: 8,
      silver: 8,
      bronze: 6,
      total: 23,
    },
    earnedTotal: 23,
    definedTotal: 23,
    hasTrophyGroups: false,
    lastUpdated: "2026-03-17T00:00:00Z",
    fieldSources: {
      titleName: "psn",
      iconUrl: "none",
      platform: "psn",
      completionPercentage: "psn",
      earnedCounts: {
        platinum: "psn",
        gold: "psn",
        silver: "psn",
        bronze: "psn",
      },
      definedCounts: {
        platinum: "psn",
        gold: "psn",
        silver: "psn",
        bronze: "psn",
      },
    },
  },
  targetTrophy: {
    npCommunicationId: "NPWR1",
    trophyId: 1,
    trophyGroupId: "default",
    titleName: "Bluey",
    trophyName: "Best in Show",
    description: "Earn every trophy in Bluey.",
    iconUrl: null,
    grade: "platinum",
    earned: false,
    earnedAt: null,
    hidden: false,
  },
  display: {
    settings: createDefaultOverlaySettings(),
    loopOrder: ["overall", "currentGame"],
    lastRefreshAt: "2026-03-17T00:00:00Z",
  },
  meta: {
    fetchedAt: "2026-03-17T00:00:00Z",
    cached: false,
    warnings: [],
    partial: false,
  },
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => overlayData,
    })),
  );
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  Object.defineProperty(window, "parent", {
    value: window,
    configurable: true,
  });
  window.history.pushState({}, "", "/");
});

describe("overlay strip components", () => {
  it("renders current game values in the shared strip", () => {
    const { container } = render(
      <OverlayStrip
        viewModel={toCurrentGameStripViewModel(overlayData.currentGame)}
      />,
    );

    expect(container.querySelector(".overlay-strip-fluid")).not.toBeNull();
    expect(screen.getByText("Bluey")).toBeInTheDocument();
    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(screen.getByText("23 / 23 earned")).toBeInTheDocument();
    expect(screen.getByText("PS5")).toBeInTheDocument();
  });

  it("renders overall values in the shared strip", () => {
    const { container } = render(
      <OverlayStrip viewModel={toOverallStripViewModel(overlayData.overall)} />,
    );

    expect(container.querySelector(".overlay-strip-fluid")).not.toBeNull();
    expect(screen.getByText("Vathreon")).toBeInTheDocument();
    expect(screen.getByText("2,848")).toBeInTheDocument();
    expect(screen.getByText("Level progress 66%")).toBeInTheDocument();
    expect(screen.getByText("PSN Profile")).toBeInTheDocument();
  });

  it("renders the target trophy card", () => {
    const { container } = render(
      <TargetTrophyCard
        viewModel={toTargetTrophyViewModel(overlayData.targetTrophy)}
        variant="standalone"
        tagLabel="Current Target"
      />,
    );

    expect(screen.getByText("Best in Show")).toBeInTheDocument();
    expect(screen.getByText("Earn every trophy in Bluey.")).toBeInTheDocument();
    expect(screen.getByText("Current Target")).toBeInTheDocument();
    expect(screen.queryByText("Current Trophy")).not.toBeInTheDocument();
    expect(within(container).queryByText("Bluey")).not.toBeInTheDocument();
    expect(container.querySelector(".target-trophy-card-standalone")).not.toBeNull();
    expect(container.querySelector(".target-trophy-grade-icon")).not.toBeNull();
    expect(container.querySelector(".target-trophy-copy-with-tag")).not.toBeNull();
    expect(container.querySelector(".target-trophy-tag")).not.toBeNull();
  });

  it("hides target info in the target trophy card when configured", () => {
    const { container } = render(
      <TargetTrophyCard
        viewModel={toTargetTrophyViewModel(overlayData.targetTrophy)}
        variant="standalone"
        tagLabel="Current Target"
        settings={{
          ...createDefaultOverlaySettings(),
          showTargetTrophyInfo: false,
        }}
      />,
    );

    expect(container.querySelector(".target-trophy-zone-target-info")).toBeNull();
    expect(container.querySelector(".target-trophy-zone-artwork")).not.toBeNull();
    expect(container.querySelector(".target-trophy-card-target-info-hidden")).not.toBeNull();
    expect(screen.queryByText("Best in Show")).not.toBeInTheDocument();
  });

  it("hides the target trophy chip when no label is provided", () => {
    const { container } = render(
      <TargetTrophyCard
        viewModel={toTargetTrophyViewModel(overlayData.targetTrophy)}
        variant="standalone"
        tagLabel={null}
      />,
    );

    expect(within(container).queryByText("Current Target")).not.toBeInTheDocument();
    expect(container.querySelector(".target-trophy-copy-no-tag")).not.toBeNull();
    expect(container.querySelector(".target-trophy-tag")).toBeNull();
  });

  it("hides the target trophy chip when the label is empty", () => {
    const { container } = render(
      <TargetTrophyCard
        viewModel={toTargetTrophyViewModel(overlayData.targetTrophy)}
        variant="standalone"
        tagLabel=""
      />,
    );

    expect(within(container).queryByText("Current Target")).not.toBeInTheDocument();
  });

  it("renders identical structural zones for overall and current-game strips", () => {
    const overall = render(
      <OverlayStrip viewModel={toOverallStripViewModel(overlayData.overall)} />,
    );
    const current = render(
      <OverlayStrip
        viewModel={toCurrentGameStripViewModel(overlayData.currentGame)}
      />,
    );

    expect(overall.container.querySelectorAll(".overlay-strip-zone")).toHaveLength(4);
    expect(current.container.querySelectorAll(".overlay-strip-zone")).toHaveLength(4);
    expect(overall.container.querySelectorAll(".overlay-grade-group")).toHaveLength(4);
    expect(current.container.querySelectorAll(".overlay-grade-group")).toHaveLength(4);
  });

  it("ignores targetInfo when rendering strip zones", () => {
    const { container } = render(
      <OverlayStrip
        viewModel={toCurrentGameStripViewModel(overlayData.currentGame)}
        settings={{
          ...createDefaultOverlaySettings(),
          stripZoneOrder: [
            "targetInfo",
            "metrics",
            "identity",
            "artwork",
            "trophies",
          ],
        }}
      />,
    );

    expect(getStripZoneClassOrder(container)).toEqual([
      "overlay-strip-zone-metric",
      "overlay-strip-zone-identity",
      "overlay-strip-zone-art",
      "overlay-strip-zone-grades",
    ]);
  });

  it("hides the artwork zone when strip artwork is disabled", () => {
    const { container } = render(
      <OverlayStrip
        viewModel={toCurrentGameStripViewModel(overlayData.currentGame)}
        settings={{
          ...createDefaultOverlaySettings(),
          showStripArtwork: false,
        }}
      />,
    );

    expect(container.querySelector(".overlay-strip-zone-art")).toBeNull();
    expect(screen.getByText("Bluey")).toBeInTheDocument();
  });

  it("hides the identity zone when title and platform are disabled", () => {
    const { container } = render(
      <OverlayStrip
        viewModel={toCurrentGameStripViewModel(overlayData.currentGame)}
        settings={{
          ...createDefaultOverlaySettings(),
          showStripIdentity: false,
        }}
      />,
    );

    expect(container.querySelector(".overlay-strip-zone-identity")).toBeNull();
    expect(screen.queryByText("Bluey")).not.toBeInTheDocument();
    expect(screen.queryByText("PS5")).not.toBeInTheDocument();
  });

  it("hides the metric zone in the loop overlay when progress is disabled", () => {
    const { container } = render(
      <LoopOverlayView
        overlayData={{
          ...overlayData,
          display: {
            ...overlayData.display,
            settings: {
              ...overlayData.display.settings,
              showStripMetrics: false,
            },
          },
        }}
      />,
    );

    expect(container.querySelector(".overlay-strip-zone-metric")).toBeNull();
    expect(container.querySelector(".overlay-strip-zone-grades")).not.toBeNull();
  });

  it("renders strip zones using the configured zone order", () => {
    const { container } = render(
      <OverlayStrip
        viewModel={toCurrentGameStripViewModel(overlayData.currentGame)}
        settings={{
          ...createDefaultOverlaySettings(),
          stripZoneOrder: ["metrics", "identity", "trophies", "artwork"],
        }}
      />,
    );

    expect(getStripZoneClassOrder(container)).toEqual([
      "overlay-strip-zone-metric",
      "overlay-strip-zone-identity",
      "overlay-strip-zone-grades",
      "overlay-strip-zone-art",
    ]);
  });

  it("switches overlay views using configured timings", async () => {
    const { container } = render(<LoopOverlayView overlayData={overlayData} />);

    expect(container.querySelectorAll(".overlay-strip-content-layer > .overlay-strip")).toHaveLength(1);
    expect(
      container.querySelector(".overlay-strip-content-layer-current h2")?.textContent,
    ).toBe("Vathreon");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(
        overlayData.display.settings.overallDurationMs + 1,
      );
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(40);
    });

    expect(container.querySelectorAll(".overlay-strip-content-layer")).toHaveLength(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });

    expect(
      container.querySelector(".overlay-strip-content-layer-current h2")?.textContent,
    ).toBe("Bluey");
  });

  it("uses the target trophy duration when it is part of the loop", async () => {
    const targetLoopData: OverlayDataResponse = {
      ...overlayData,
      display: {
        ...overlayData.display,
        settings: {
          ...overlayData.display.settings,
          overallDurationMs: 1000,
          currentGameDurationMs: 1000,
          targetTrophyDurationMs: 2000,
          showTargetTrophyInLoop: true,
        },
        loopOrder: ["overall", "currentGame", "targetTrophy"],
      },
    };

    const { container } = render(<LoopOverlayView overlayData={targetLoopData} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(targetLoopData.display.settings.overallDurationMs + 1);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(LOOP_TRANSITION_SETTLE_MS);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(
        targetLoopData.display.settings.currentGameDurationMs + 1,
      );
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(LOOP_TRANSITION_SETTLE_MS);
    });

    expect(
      container.querySelector(".overlay-strip-content-layer-current h2")?.textContent,
    ).toBe("Best in Show");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(
      container.querySelector(".overlay-strip-content-layer-current h2")?.textContent,
    ).toBe("Best in Show");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1001);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(LOOP_TRANSITION_SETTLE_MS);
    });

    expect(
      container.querySelector(".overlay-strip-content-layer-current h2")?.textContent,
    ).toBe("Vathreon");
  });

  it("applies preview-mode settings overrides in the target trophy route", async () => {
    window.history.pushState({}, "", "/overlay/target-trophy?dashboardPreview=1");

    const { container } = render(<TargetTrophyOverlay />);

    await flushEffects();
    expect(container.querySelector(".overlay-scene-preview")).not.toBeNull();
    expect(container.querySelector("[data-overlay-preview-stage]")).not.toBeNull();
    expect(container.querySelector(".target-trophy-overlay-shell")).not.toBeNull();
    expect(screen.getByText("Current Target")).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          origin: window.location.origin,
          data: {
            type: OVERLAY_PREVIEW_MESSAGE_TYPE,
            overlayData,
            settings: {
              ...overlayData.display.settings,
              stripZoneOrder: [
                "targetInfo",
                "identity",
                "metrics",
                "trophies",
                "artwork",
              ],
              showTargetTrophyTag: false,
            },
          },
        }),
      );
    });

    await flushEffects();
    expect(screen.getByText("Best in Show")).toBeInTheDocument();
    expect(screen.queryByText("Current Target")).not.toBeInTheDocument();
    expect(getTargetTrophyZoneClassOrder(container)).toEqual([
      "target-trophy-zone-target-info",
      "target-trophy-zone-artwork",
    ]);
  });

  it("uses preview mode in the loop route and applies preview overlay data", async () => {
    window.history.pushState({}, "", "/overlay/loop?dashboardPreview=1");

    const { container } = render(<LoopOverlay />);

    await flushEffects();
    expect(container.querySelector(".overlay-scene-preview")).not.toBeNull();
    expect(container.querySelector(".overlay-scene-anchor-bottom-left")).not.toBeNull();
    expect(container.querySelector("[data-overlay-preview-stage]")).not.toBeNull();
    expect(
      container.querySelector(".overlay-strip-content-layer-current h2")?.textContent,
    ).toBe("Vathreon");

    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          origin: window.location.origin,
          data: {
            type: OVERLAY_PREVIEW_MESSAGE_TYPE,
            overlayData: {
              ...overlayData,
              targetTrophy: overlayData.targetTrophy,
              display: {
                ...overlayData.display,
                loopOrder: ["targetTrophy"],
              },
            },
            settings: {
              ...overlayData.display.settings,
              showTargetTrophyInLoop: true,
            },
          },
        }),
      );
    });

    await flushEffects();
    expect(
      container.querySelector(".overlay-strip-content-layer-current .target-trophy-title-row h2")
        ?.textContent,
    ).toBe("Best in Show");
    expect(
      container.querySelector(".overlay-strip-content-layer-current .target-trophy-card-loop"),
    ).not.toBeNull();
  });

  it("applies preview-mode anchor overrides across all overlay routes", async () => {
    const routeAssertions = async (
      path: string,
      routeKey: keyof typeof overlayData.display.settings.overlayAnchors,
      element: ReactElement,
    ) => {
      window.history.pushState({}, "", path);

      const { container, unmount } = render(element);

      await flushEffects();
      expect(container.querySelector(".overlay-scene-anchor-bottom-left")).not.toBeNull();
      expect(getPrimaryOverlayShell(container)).toHaveAttribute(
        "data-overlay-horizontal-anchor",
        "left",
      );

      act(() => {
        window.dispatchEvent(
          new MessageEvent("message", {
            origin: window.location.origin,
            data: {
              type: OVERLAY_PREVIEW_MESSAGE_TYPE,
              overlayData,
              settings: {
                ...overlayData.display.settings,
                overlayAnchors: {
                  ...overlayData.display.settings.overlayAnchors,
                  [routeKey]: "top-right",
                },
              },
            },
          }),
        );
      });

      await flushEffects();
      expect(container.querySelector(".overlay-scene-anchor-top-right")).not.toBeNull();
      expect(getPrimaryOverlayShell(container)).toHaveAttribute(
        "data-overlay-horizontal-anchor",
        "right",
      );
      unmount();
    };

    await routeAssertions("/overlay/loop?dashboardPreview=1", "loop", <LoopOverlay />);
    await routeAssertions("/overlay/overall?dashboardPreview=1", "overall", <OverallOverlay />);
    await routeAssertions(
      "/overlay/current-game?dashboardPreview=1",
      "currentGame",
      <CurrentGameOverlay />,
    );
    await routeAssertions(
      "/overlay/target-trophy?dashboardPreview=1",
      "targetTrophy",
      <TargetTrophyOverlay />,
    );
  });

  it("applies preview-mode overlay data overrides in the current game route", async () => {
    window.history.pushState({}, "", "/overlay/current-game?dashboardPreview=1");

    const { container } = render(<CurrentGameOverlay />);

    await flushEffects();
    expect(container.querySelector(".overlay-scene-preview")).not.toBeNull();
    expect(container.querySelector("[data-overlay-preview-stage]")).not.toBeNull();
    expect(container.querySelector(".overlay-strip-fluid")).not.toBeNull();
    expect(screen.getByText("Bluey")).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          origin: window.location.origin,
          data: {
            type: OVERLAY_PREVIEW_MESSAGE_TYPE,
            overlayData: {
              ...overlayData,
              currentGame: {
                ...overlayData.currentGame,
                titleName: "Astro Bot",
                platform: "PS4",
                completionPercentage: 58,
              },
            },
            settings: {
              ...overlayData.display.settings,
            },
          },
        }),
      );
    });

    await flushEffects();
    expect(screen.getByText("Astro Bot")).toBeInTheDocument();
    expect(screen.getByText("58%")).toBeInTheDocument();
    expect(screen.getByText("PS4")).toBeInTheDocument();
  });

  it("applies preview-mode strip setting overrides in the current game route", async () => {
    window.history.pushState({}, "", "/overlay/current-game?dashboardPreview=1");

    const { container } = render(<CurrentGameOverlay />);

    await flushEffects();
    expect(container.querySelector(".overlay-strip-zone-metric")).not.toBeNull();
    expect(container.querySelector(".overlay-strip-zone-grades")).not.toBeNull();

    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          origin: window.location.origin,
          data: {
            type: OVERLAY_PREVIEW_MESSAGE_TYPE,
            overlayData,
            settings: {
              ...overlayData.display.settings,
              showStripMetrics: false,
              showStripTrophies: false,
            },
          },
        }),
      );
    });

    await flushEffects();
    expect(container.querySelector(".overlay-strip-zone-metric")).toBeNull();
    expect(container.querySelector(".overlay-strip-zone-grades")).toBeNull();
    expect(screen.getByText("Bluey")).toBeInTheDocument();
  });

  it("applies preview-mode strip order overrides in the current game route", async () => {
    window.history.pushState({}, "", "/overlay/current-game?dashboardPreview=1");

    const { container } = render(<CurrentGameOverlay />);

    await flushEffects();

    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          origin: window.location.origin,
          data: {
            type: OVERLAY_PREVIEW_MESSAGE_TYPE,
            overlayData,
            settings: {
              ...overlayData.display.settings,
              stripZoneOrder: ["trophies", "metrics", "identity", "artwork"],
            },
          },
        }),
      );
    });

    await flushEffects();
    expect(getStripZoneClassOrder(container)).toEqual([
      "overlay-strip-zone-grades",
      "overlay-strip-zone-metric",
      "overlay-strip-zone-identity",
      "overlay-strip-zone-art",
    ]);
  });

  it("applies preview-mode strip order overrides in the overall route", async () => {
    window.history.pushState({}, "", "/overlay/overall?dashboardPreview=1");

    const { container } = render(<OverallOverlay />);

    await flushEffects();

    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          origin: window.location.origin,
          data: {
            type: OVERLAY_PREVIEW_MESSAGE_TYPE,
            overlayData,
            settings: {
              ...overlayData.display.settings,
              stripZoneOrder: ["metrics", "trophies", "identity", "artwork"],
            },
          },
        }),
      );
    });

    await flushEffects();
    expect(getStripZoneClassOrder(container)).toEqual([
      "overlay-strip-zone-metric",
      "overlay-strip-zone-grades",
      "overlay-strip-zone-identity",
      "overlay-strip-zone-art",
    ]);
  });

  it("renders the metric zone as value, caption, then progress track", () => {
    const { container } = render(
      <OverlayStrip
        viewModel={toCurrentGameStripViewModel(overlayData.currentGame)}
      />,
    );

    const metricZone = container.querySelector(
      ".overlay-strip-zone-metric",
    ) as HTMLDivElement | null;

    expect(metricZone).not.toBeNull();
    expect(metricZone?.children).toHaveLength(3);
    expect(metricZone?.children[0]).toHaveClass("overlay-metric-value");
    expect(metricZone?.children[1]).toHaveClass("overlay-metric-caption");
    expect(metricZone?.children[2]).toHaveClass("overlay-metric-track");
  });

  it("reports rounded preview metrics from the stage wrapper", async () => {
    window.history.pushState({}, "", "/overlay/current-game?dashboardPreview=1");

    const parentPostMessage = vi.fn();
    Object.defineProperty(window, "parent", {
      value: { postMessage: parentPostMessage },
      configurable: true,
    });

    let resizeCallback: ResizeObserverCallback | null = null;
    class ResizeObserverMock {
      constructor(callback: ResizeObserverCallback) {
        resizeCallback = callback;
      }

      observe() {}

      disconnect() {}
    }

    vi.stubGlobal("ResizeObserver", ResizeObserverMock as unknown as typeof ResizeObserver);

    const { container } = render(<CurrentGameOverlay />);

    await flushEffects();
    const stage = container.querySelector("[data-overlay-preview-stage]") as HTMLDivElement | null;
    expect(stage).not.toBeNull();

    stage!.getBoundingClientRect = () => createRect(911.2, 123.33);

    act(() => {
      resizeCallback?.(
        [
          ({
            target: stage!,
            contentRect: createRect(911.2, 123.33),
          } as unknown as ResizeObserverEntry),
        ],
        {} as ResizeObserver,
      );
    });

    expect(parentPostMessage).toHaveBeenCalledWith(
      {
        type: OVERLAY_PREVIEW_METRICS_MESSAGE_TYPE,
        width: 912,
        height: 124,
      },
      window.location.origin,
    );
  });

  it("reports preview metrics from the loop route stage wrapper", async () => {
    window.history.pushState({}, "", "/overlay/loop?dashboardPreview=1");

    const parentPostMessage = vi.fn();
    Object.defineProperty(window, "parent", {
      value: { postMessage: parentPostMessage },
      configurable: true,
    });

    let resizeCallback: ResizeObserverCallback | null = null;
    class ResizeObserverMock {
      constructor(callback: ResizeObserverCallback) {
        resizeCallback = callback;
      }

      observe() {}

      disconnect() {}
    }

    vi.stubGlobal("ResizeObserver", ResizeObserverMock as unknown as typeof ResizeObserver);

    const { container } = render(<LoopOverlay />);

    await flushEffects();
    const stage = container.querySelector("[data-overlay-preview-stage]") as HTMLDivElement | null;
    expect(stage).not.toBeNull();

    stage!.getBoundingClientRect = () => createRect(1004.4, 181.2);

    act(() => {
      resizeCallback?.(
        [
          ({
            target: stage!,
            contentRect: createRect(1004.4, 181.2),
          } as unknown as ResizeObserverEntry),
        ],
        {} as ResizeObserver,
      );
    });

    expect(parentPostMessage).toHaveBeenCalledWith(
      {
        type: OVERLAY_PREVIEW_METRICS_MESSAGE_TYPE,
        width: 1005,
        height: 182,
      },
      window.location.origin,
    );
  });

  it("keeps embedded previews at fixed viewport dimensions when route metrics arrive", async () => {
    const { container } = render(
      <EmbeddedOverlayPreview
        title="Current game preview"
        srcPath="/overlay/current-game"
        overlayData={overlayData}
        settings={overlayData.display.settings}
      />,
    );

    await flushEffects();
    const wrapper = container.querySelector(".embedded-overlay-preview") as HTMLDivElement | null;
    const iframe = screen.getByTitle("Current game preview") as HTMLIFrameElement | null;

    expect(wrapper).not.toBeNull();
    expect(wrapper?.style.height).toBe("220px");

    if (iframe && !iframe.contentWindow) {
      Object.defineProperty(iframe, "contentWindow", {
        value: window,
        configurable: true,
      });
    }

    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          origin: window.location.origin,
          source: iframe?.contentWindow as MessageEventSource,
          data: {
            type: OVERLAY_PREVIEW_METRICS_MESSAGE_TYPE,
            width: 912,
            height: 124,
          },
        }),
      );
    });

    await flushEffects();
    expect(wrapper?.style.getPropertyValue("--overlay-preview-viewport-width")).toBe("1360px");
    expect(wrapper?.style.getPropertyValue("--overlay-preview-viewport-height")).toBe("220px");
    expect(wrapper?.style.height).toBe("220px");
  });

  it("rescales the embedded preview canvas when the host width shrinks", async () => {
    let resizeCallback: ResizeObserverCallback | null = null;
    class ResizeObserverMock {
      constructor(callback: ResizeObserverCallback) {
        resizeCallback = callback;
      }

      observe() {}

      disconnect() {}
    }

    vi.stubGlobal("ResizeObserver", ResizeObserverMock as unknown as typeof ResizeObserver);

    const { container } = render(
      <EmbeddedOverlayPreview
        title="Current game preview"
        srcPath="/overlay/current-game"
        overlayData={overlayData}
        settings={overlayData.display.settings}
      />,
    );

    await flushEffects();

    const wrapper = container.querySelector(".embedded-overlay-preview") as HTMLDivElement | null;
    const canvas = container.querySelector(".embedded-overlay-preview-canvas") as HTMLDivElement | null;

    expect(wrapper).not.toBeNull();
    expect(canvas).not.toBeNull();

    wrapper!.getBoundingClientRect = () => createRect(680, 220);

    act(() => {
      resizeCallback?.(
        [
          ({
            target: wrapper!,
            contentRect: createRect(680, 220),
          } as unknown as ResizeObserverEntry),
        ],
        {} as ResizeObserver,
      );
    });

    await flushEffects();

    expect(wrapper?.style.height).toBe("110px");
    expect(canvas?.style.width).toBe("680px");
    expect(canvas?.style.height).toBe("110px");
  });

  it("renders the overall route with the fluid strip class and respects strip section toggles", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          ...overlayData,
          display: {
            ...overlayData.display,
            settings: {
              ...overlayData.display.settings,
              showStripTrophies: false,
            },
          },
        }),
      })),
    );

    const { container } = render(<OverallOverlay />);

    await flushEffects();
    expect(container.querySelector(".overlay-strip-fluid")).not.toBeNull();
    expect(container.querySelector(".overlay-strip-zone-grades")).toBeNull();
    expect(screen.getByText("Vathreon")).toBeInTheDocument();
  });

  it("uses per-route anchors across all live overlay routes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          ...overlayData,
          display: {
            ...overlayData.display,
            settings: {
              ...overlayData.display.settings,
              overlayAnchors: {
                ...overlayData.display.settings.overlayAnchors,
                loop: "top-right",
                overall: "bottom-left",
                currentGame: "bottom-right",
                targetTrophy: "top-left",
              },
            },
          },
        }),
      })),
    );

    const routeAssertions = async (
      path: string,
      expectedSceneClass: string,
      expectedHorizontalAnchor: "left" | "right",
      element: ReactElement,
    ) => {
      window.history.pushState({}, "", path);
      const { container, unmount } = render(element);
      await flushEffects();
      expect(container.querySelector(expectedSceneClass)).not.toBeNull();
      expect(getAnchorShell(container)).toHaveAttribute(
        "data-overlay-horizontal-anchor",
        expectedHorizontalAnchor,
      );
      expect(getPrimaryOverlayShell(container)).toHaveAttribute(
        "data-overlay-horizontal-anchor",
        expectedHorizontalAnchor,
      );
      unmount();
    };

    await routeAssertions("/overlay/loop", ".overlay-scene-anchor-top-right", "right", <LoopOverlay />);
    await routeAssertions("/overlay/overall", ".overlay-scene-anchor-bottom-left", "left", <OverallOverlay />);
    await routeAssertions(
      "/overlay/current-game",
      ".overlay-scene-anchor-bottom-right",
      "right",
      <CurrentGameOverlay />,
    );
    await routeAssertions(
      "/overlay/target-trophy",
      ".overlay-scene-anchor-top-left",
      "left",
      <TargetTrophyOverlay />,
    );
  });

  it("keeps left-side per-route anchors on the left across all live overlay routes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          ...overlayData,
          display: {
            ...overlayData.display,
            settings: {
              ...overlayData.display.settings,
              overlayAnchors: {
                ...overlayData.display.settings.overlayAnchors,
                loop: "bottom-left",
                overall: "top-left",
                currentGame: "bottom-left",
                targetTrophy: "top-left",
              },
            },
          },
        }),
      })),
    );

    const routeAssertions = async (
      path: string,
      expectedSceneClass: string,
      element: ReactElement,
    ) => {
      window.history.pushState({}, "", path);
      const { container, unmount } = render(element);
      await flushEffects();
      expect(container.querySelector(expectedSceneClass)).not.toBeNull();
      expect(getAnchorShell(container)).toHaveAttribute(
        "data-overlay-horizontal-anchor",
        "left",
      );
      expect(getPrimaryOverlayShell(container)).toHaveAttribute(
        "data-overlay-horizontal-anchor",
        "left",
      );
      unmount();
    };

    await routeAssertions("/overlay/loop", ".overlay-scene-anchor-bottom-left", <LoopOverlay />);
    await routeAssertions("/overlay/overall", ".overlay-scene-anchor-top-left", <OverallOverlay />);
    await routeAssertions(
      "/overlay/current-game",
      ".overlay-scene-anchor-bottom-left",
      <CurrentGameOverlay />,
    );
    await routeAssertions(
      "/overlay/target-trophy",
      ".overlay-scene-anchor-top-left",
      <TargetTrophyOverlay />,
    );
  });

  it("renders the loop target trophy card with the loop variant when enabled", async () => {
    const targetLoopData: OverlayDataResponse = {
      ...overlayData,
      display: {
        ...overlayData.display,
        settings: {
          ...overlayData.display.settings,
          stripZoneOrder: [
            "targetInfo",
            "identity",
            "metrics",
            "trophies",
            "artwork",
          ],
          showTargetTrophyInLoop: true,
        },
        loopOrder: ["overall", "currentGame", "targetTrophy"],
      },
    };

    const { container } = render(<LoopOverlayView overlayData={targetLoopData} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(targetLoopData.display.settings.overallDurationMs + 1);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(LOOP_TRANSITION_SETTLE_MS);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(
        targetLoopData.display.settings.currentGameDurationMs + 1,
      );
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(LOOP_TRANSITION_SETTLE_MS);
    });

    const currentLayer = container.querySelector(
      ".overlay-strip-content-layer-current",
    ) as HTMLElement;

    expect(currentLayer.querySelector(".target-trophy-card-loop")).not.toBeNull();
    expect(currentLayer.querySelector(".target-trophy-card-standalone")).toBeNull();
    expect(getTargetTrophyZoneClassOrder(currentLayer)).toEqual([
      "target-trophy-zone-target-info",
      "target-trophy-zone-artwork",
    ]);
  });

  it("hides target info in the loop target trophy card when configured", async () => {
    const targetLoopData: OverlayDataResponse = {
      ...overlayData,
      display: {
        ...overlayData.display,
        settings: {
          ...overlayData.display.settings,
          stripZoneOrder: [
            "targetInfo",
            "identity",
            "metrics",
            "trophies",
            "artwork",
          ],
          showTargetTrophyInLoop: true,
          showTargetTrophyInfo: false,
        },
        loopOrder: ["overall", "currentGame", "targetTrophy"],
      },
    };

    const { container } = render(<LoopOverlayView overlayData={targetLoopData} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(targetLoopData.display.settings.overallDurationMs + 1);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(LOOP_TRANSITION_SETTLE_MS);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(
        targetLoopData.display.settings.currentGameDurationMs + 1,
      );
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(LOOP_TRANSITION_SETTLE_MS);
    });

    const currentLayer = container.querySelector(
      ".overlay-strip-content-layer-current",
    ) as HTMLElement;

    expect(currentLayer.querySelector(".target-trophy-card-loop")).not.toBeNull();
    expect(currentLayer.querySelector(".target-trophy-zone-target-info")).toBeNull();
    expect(getTargetTrophyZoneClassOrder(currentLayer)).toEqual([
      "target-trophy-zone-artwork",
    ]);
  });

  it("uses the current state's measured width in adaptive mode and keeps transitions unclipped", async () => {
    const targetLoopData: OverlayDataResponse = {
      ...overlayData,
      display: {
        ...overlayData.display,
        settings: {
          ...overlayData.display.settings,
          overallDurationMs: 1000,
          currentGameDurationMs: 1000,
          targetTrophyDurationMs: 2000,
          showTargetTrophyInLoop: true,
        },
        loopOrder: ["overall", "currentGame", "targetTrophy"],
      },
    };

    const { container } = render(<LoopOverlayView overlayData={targetLoopData} />);
    const shell = container.querySelector(".overlay-strip-shell") as HTMLDivElement;
    const setMeasuredWidth = (view: string, width: number) => {
      const element = container.querySelector(
        `[data-loop-measure-view="${view}"] > *`,
      ) as HTMLElement | null;
      expect(element).toBeTruthy();
      setIntrinsicWidth(element!, width);
      window.dispatchEvent(new Event("resize"));
    };

    setMeasuredWidth("overall", 420);
    setMeasuredWidth("currentGame", 640);
    setMeasuredWidth("targetTrophy", 460);
    await flushEffects();
    expect(shell.dataset.loopShellWidth).toBe("420");
    expect(shell.style.width).toBe("100%");
    expect(shell.style.maxWidth).toBe("420px");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(targetLoopData.display.settings.overallDurationMs + 1);
    });
    await flushEffects();
    expect(shell.dataset.loopShellWidth).toBe("640");
    expect(shell.style.width).toBe("100%");
    expect(shell.style.maxWidth).toBe("640px");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(LOOP_TRANSITION_SETTLE_MS);
    });
    await flushEffects();
    expect(shell.dataset.loopShellWidth).toBe("640");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(targetLoopData.display.settings.currentGameDurationMs + 1);
    });
    await flushEffects();
    expect(shell.dataset.loopShellWidth).toBe("640");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(LOOP_TRANSITION_SETTLE_MS);
    });
    await flushEffects();
    expect(shell.dataset.loopShellWidth).toBe("460");
    expect(shell.style.width).toBe("100%");
    expect(shell.style.maxWidth).toBe("460px");
  });

  it("prefers intrinsic width metrics over a smaller bounding box during measurement", async () => {
    const targetLoopData: OverlayDataResponse = {
      ...overlayData,
      display: {
        ...overlayData.display,
        loopOrder: ["overall", "currentGame"],
      },
    };

    const { container } = render(<LoopOverlayView overlayData={targetLoopData} />);
    const shell = container.querySelector(".overlay-strip-shell") as HTMLDivElement;
    const overallElement = container.querySelector(
      '[data-loop-measure-view="overall"] > *',
    ) as HTMLElement | null;
    const currentGameElement = container.querySelector(
      '[data-loop-measure-view="currentGame"] > *',
    ) as HTMLElement | null;

    expect(overallElement).toBeTruthy();
    expect(currentGameElement).toBeTruthy();

    setIntrinsicWidth(overallElement!, 710, 420);
    setIntrinsicWidth(currentGameElement!, 640, 400);
    window.dispatchEvent(new Event("resize"));
    await flushEffects();

    expect(shell.dataset.loopShellWidth).toBe("710");
    expect(shell.style.width).toBe("100%");
    expect(shell.style.maxWidth).toBe("710px");
  });

  it("uses a full-width anchor shell for right-aligned live routes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          ...overlayData,
          display: {
            ...overlayData.display,
            settings: {
              ...overlayData.display.settings,
              overlayAnchors: {
                ...overlayData.display.settings.overlayAnchors,
                loop: "bottom-right",
                overall: "bottom-right",
                currentGame: "bottom-right",
                targetTrophy: "bottom-right",
              },
            },
          },
        }),
      })),
    );

    const routeAssertions = async (path: string, element: ReactElement) => {
      window.history.pushState({}, "", path);
      const { container, unmount } = render(element);
      await flushEffects();

      expect(getAnchorShell(container)).toHaveAttribute(
        "data-overlay-horizontal-anchor",
        "right",
      );
      expect(getAnchorShell(container)).toHaveStyle({
        width: "100%",
        maxWidth: "100%",
      });

      unmount();
    };

    await routeAssertions("/overlay/loop", <LoopOverlay />);
    await routeAssertions("/overlay/overall", <OverallOverlay />);
    await routeAssertions("/overlay/current-game", <CurrentGameOverlay />);
    await routeAssertions("/overlay/target-trophy", <TargetTrophyOverlay />);
  });

  it("keeps the standalone target trophy route content-sized inside the shared anchor shell", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          ...overlayData,
          display: {
            ...overlayData.display,
            settings: {
              ...overlayData.display.settings,
              overlayAnchors: {
                ...overlayData.display.settings.overlayAnchors,
                targetTrophy: "bottom-right",
              },
            },
          },
        }),
      })),
    );

    window.history.pushState({}, "", "/overlay/target-trophy");
    const { container } = render(<TargetTrophyOverlay />);
    await flushEffects();

    expect(getPrimaryOverlayShell(container)).toHaveStyle({
      width: "fit-content",
      maxWidth: "100%",
    });
  });

  it("uses a flexible identity column to clamp long strip titles within the card", () => {
    const longTitle = "An Extremely Long Current Game Name That Keeps Going Well Past Any Reasonable Overlay Width And Should Truncate";
    const { container } = render(
      <OverlayStrip
        viewModel={toCurrentGameStripViewModel({
          ...overlayData.currentGame!,
          titleName: longTitle,
        })}
      />,
    );

    const stripContent = container.querySelector(".overlay-strip-content") as HTMLDivElement | null;
    const title = container.querySelector(".overlay-strip-zone-identity h2") as HTMLHeadingElement | null;

    expect(stripContent?.style.gridTemplateColumns).toContain("minmax(0, 1fr)");
    expect(title).toHaveAttribute("title", longTitle);
    expect(title).toHaveStyle({
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis",
    });
  });

  it("clamps long target trophy copy instead of forcing the card wider", () => {
    const { container } = render(
      <TargetTrophyCard
        viewModel={toTargetTrophyViewModel({
          ...overlayData.targetTrophy!,
          trophyName: "An Extremely Long Target Trophy Name That Keeps Going Well Past Any Reasonable Overlay Width",
          description:
            "This description is intentionally long so the overlay relies on line clamping instead of widening the card itself.",
        })}
        variant="standalone"
        tagLabel="Current Target"
      />,
    );

    const title = container.querySelector(".target-trophy-title-row h2") as HTMLHeadingElement | null;
    const description = container.querySelector(".target-trophy-description") as HTMLParagraphElement | null;

    expect(title).toHaveStyle({
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis",
    });
    expect(description).toHaveStyle({
      overflow: "hidden",
      display: "-webkit-box",
    });
  });

  it("renders target trophy sections using the shared order between artwork and target info", () => {
    const { container } = render(
      <TargetTrophyCard
        viewModel={toTargetTrophyViewModel(overlayData.targetTrophy)}
        variant="standalone"
        tagLabel="Current Target"
        settings={{
          stripZoneOrder: [
            "targetInfo",
            "metrics",
            "identity",
            "artwork",
            "trophies",
          ],
          showTargetTrophyInfo: true,
        }}
      />,
    );

    expect(getTargetTrophyZoneClassOrder(container)).toEqual([
      "target-trophy-zone-target-info",
      "target-trophy-zone-artwork",
    ]);
    expect(screen.getByText("Current Target")).toBeInTheDocument();
  });
});
