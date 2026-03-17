// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { act, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createDefaultOverlaySettings,
  type OverlayDataResponse,
} from "../shared/contracts.js";
import {
  OverlayStrip,
  LoopOverlayView,
  TargetTrophyCard,
  toCurrentGameStripViewModel,
  toOverallStripViewModel,
  toTargetTrophyViewModel,
} from "./components.js";

const LOOP_TRANSITION_SETTLE_MS = 840;

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
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("overlay strip components", () => {
  it("renders current game values in the shared strip", () => {
    render(
      <OverlayStrip
        viewModel={toCurrentGameStripViewModel(overlayData.currentGame)}
      />,
    );

    expect(screen.getByText("Bluey")).toBeInTheDocument();
    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(screen.getByText("23 / 23 earned")).toBeInTheDocument();
    expect(screen.getByText("PS5")).toBeInTheDocument();
  });

  it("renders overall values in the shared strip", () => {
    render(
      <OverlayStrip viewModel={toOverallStripViewModel(overlayData.overall)} />,
    );

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

  it("switches overlay views using configured timings", async () => {
    const { container } = render(<LoopOverlayView overlayData={overlayData} />);

    expect(container.querySelectorAll(".overlay-strip")).toHaveLength(1);
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
});
