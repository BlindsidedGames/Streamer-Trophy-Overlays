// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createDefaultActiveGameSelection,
  createDefaultOverlaySettings,
  type ActiveGameSelection,
  type OverlayDataResponse,
  type OverlayTargetTrophyCard,
  type PsnTokenStatusResponse,
  type TargetTrophySelection,
  type TitleSearchResponse,
  type TitleTrophiesResponse,
  type TrophyBrowserItem,
  type TrophySummaryResponse,
  type UnearnedTrophiesResponse,
  type UpdateTargetTrophyRequest,
} from "../shared/contracts.js";
import { App } from "./App.js";

const createDesktopWindowControlsMock = () => {
  const listeners = new Set<(isMaximized: boolean) => void>();

  return {
    controls: {
      minimize: vi.fn(),
      maximizeOrRestore: vi.fn(),
      close: vi.fn(),
      isMaximized: vi.fn(async () => false),
      onMaximizedChange: vi.fn((listener: (isMaximized: boolean) => void) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      }),
    },
    emitMaximizedChange: (isMaximized: boolean) => {
      listeners.forEach((listener) => listener(isMaximized));
    },
  };
};

const waitForMs = (durationMs: number) =>
  new Promise<void>((resolve) => {
    window.setTimeout(resolve, durationMs);
  });

const summary: TrophySummaryResponse = {
  profile: {
    accountId: "123",
    onlineId: "Vathreon",
    avatarUrl: null,
    trophyLevel: 335,
    progressToNextLevel: 66,
    tier: 4,
    earnedCounts: {
      platinum: 50,
      gold: 367,
      silver: 503,
      bronze: 1928,
      total: 2848,
    },
    totalEarnedCount: 2848,
    completionPercentage: null,
  },
  titles: [
    {
      titleId: "NPWR1",
      npCommunicationId: "NPWR1",
      npServiceName: "trophy2",
      titleName: "Bluey",
      platform: "PS5",
      iconUrl: "https://example.com/bluey.png",
      progress: 60,
      earnedCounts: {
        platinum: 0,
        gold: 1,
        silver: 1,
        bronze: 1,
        total: 3,
      },
      definedCounts: {
        platinum: 1,
        gold: 1,
        silver: 1,
        bronze: 2,
        total: 5,
      },
      earnedTotal: 3,
      definedTotal: 5,
      lastUpdated: "2026-03-17T00:00:00Z",
      hasTrophyGroups: true,
    },
    {
      titleId: "NPWR2",
      npCommunicationId: "NPWR2",
      npServiceName: "trophy2",
      titleName: "Astro Bot",
      platform: "PS5",
      iconUrl: "https://example.com/astro.png",
      progress: 75,
      earnedCounts: {
        platinum: 0,
        gold: 3,
        silver: 5,
        bronze: 10,
        total: 18,
      },
      definedCounts: {
        platinum: 1,
        gold: 4,
        silver: 7,
        bronze: 12,
        total: 24,
      },
      earnedTotal: 18,
      definedTotal: 24,
      lastUpdated: "2026-03-16T00:00:00Z",
      hasTrophyGroups: false,
    },
  ],
  meta: {
    fetchedAt: "2026-03-17T00:00:00Z",
    cached: false,
    warnings: [],
    partial: false,
    source: "psn-api",
  },
};

const trophiesByTitle: Record<string, TrophyBrowserItem[]> = {
  NPWR1: [
    {
      npCommunicationId: "NPWR1",
      trophyId: 1,
      trophyGroupId: "default",
      name: "Best in Show",
      description: "Earn every trophy in Bluey.",
      iconUrl: null,
      grade: "platinum",
      earned: false,
      earnedAt: null,
      hidden: false,
      groupName: null,
    },
    {
      npCommunicationId: "NPWR1",
      trophyId: 3,
      trophyGroupId: "default",
      name: "Family Photo",
      description: "Unlock the album and frame every memory.",
      iconUrl: null,
      grade: "silver",
      earned: true,
      earnedAt: "2026-03-15T00:00:00Z",
      hidden: false,
      groupName: null,
    },
    {
      npCommunicationId: "NPWR1",
      trophyId: 4,
      trophyGroupId: "001",
      name: "Rainy Day",
      description: "Complete the backyard course in the rain.",
      iconUrl: null,
      grade: "bronze",
      earned: false,
      earnedAt: null,
      hidden: false,
      groupName: "Puppy Playtime",
    },
    {
      npCommunicationId: "NPWR1",
      trophyId: 5,
      trophyGroupId: "001",
      name: "Backyard Hero",
      description: "Collect every prize in Puppy Playtime.",
      iconUrl: null,
      grade: "gold",
      earned: true,
      earnedAt: "2026-03-16T00:00:00Z",
      hidden: false,
      groupName: "Puppy Playtime",
    },
    {
      npCommunicationId: "NPWR1",
      trophyId: 6,
      trophyGroupId: "002",
      name: "Night Watch",
      description: "Complete the bedtime patrol route.",
      iconUrl: null,
      grade: "bronze",
      earned: true,
      earnedAt: "2026-03-17T00:00:00Z",
      hidden: false,
      groupName: null,
    },
  ],
  NPWR2: [
    {
      npCommunicationId: "NPWR2",
      trophyId: 2,
      trophyGroupId: "default",
      name: "Galaxy Champion",
      description: "Save the stars and clean up every world.",
      iconUrl: null,
      grade: "gold",
      earned: false,
      earnedAt: null,
      hidden: false,
      groupName: null,
    },
  ],
};

const createOverlayTarget = (
  titleId: string,
  selection: TargetTrophySelection | null,
): OverlayTargetTrophyCard | null => {
  if (!selection) {
    return null;
  }

  const title = summary.titles.find((entry) => entry.npCommunicationId === titleId) ?? null;
  const trophy = trophiesByTitle[titleId]?.find(
    (entry) =>
      entry.trophyId === selection.trophyId &&
      entry.trophyGroupId === selection.trophyGroupId,
  );

  if (!title || !trophy || !trophy.name) {
    return null;
  }

  return {
    npCommunicationId: titleId,
    trophyId: trophy.trophyId,
    trophyGroupId: trophy.trophyGroupId,
    titleName: title.titleName,
    trophyName: trophy.name,
    description: trophy.description,
    iconUrl: trophy.iconUrl,
    grade: trophy.grade,
    earned: trophy.earned,
    earnedAt: trophy.earnedAt,
    hidden: trophy.hidden,
  };
};

describe("DashboardApp", () => {
  let activeGame: ActiveGameSelection;
  let settings = createDefaultOverlaySettings();
  let targetsByTitle: Record<string, TargetTrophySelection> = {};
  let tokenStatus: PsnTokenStatusResponse;
  let summaryError: { type: string; message: string } | null;
  let fetchMock: ReturnType<typeof vi.fn>;
  let openMock: ReturnType<typeof vi.spyOn>;
  let originalDesktopRuntime: Window["streamerToolsDesktop"];
  let settingsSaveDelaysMs: number[];

  const currentTitleId = () =>
    activeGame.mode === "psn"
      ? activeGame.selectedNpCommunicationId ?? summary.titles[0]?.npCommunicationId ?? null
      : null;

  const overlayData = (): OverlayDataResponse => {
    const titleId = currentTitleId();
    const title = summary.titles.find((entry) => entry.npCommunicationId === titleId) ?? summary.titles[0];
    const target = titleId ? targetsByTitle[titleId] ?? null : null;
    const targetCard = titleId ? createOverlayTarget(titleId, target) : null;

    return {
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
      currentGame: title
        ? {
            source: "psn",
            npCommunicationId: title.npCommunicationId,
            titleName: title.titleName,
            platform: title.platform,
            iconUrl: title.iconUrl,
            completionPercentage: title.progress,
            earnedCounts: title.earnedCounts,
            definedCounts: title.definedCounts,
            earnedTotal: title.earnedTotal,
            definedTotal: title.definedTotal,
            hasTrophyGroups: title.hasTrophyGroups,
            lastUpdated: title.lastUpdated,
            fieldSources: {
              titleName: "psn",
              iconUrl: "psn",
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
          }
        : null,
      targetTrophy: targetCard,
      display: {
        settings,
        loopOrder: settings.showTargetTrophyInLoop && targetCard
          ? ["overall", "currentGame", "targetTrophy"]
          : ["overall", "currentGame"],
        lastRefreshAt: "2026-03-17T00:00:00Z",
      },
      meta: {
        fetchedAt: "2026-03-17T00:00:00Z",
        cached: false,
        warnings: [],
        partial: false,
      },
    };
  };

  const titleTrophiesResponse = (titleId: string): TitleTrophiesResponse => ({
    title: summary.titles.find((entry) => entry.npCommunicationId === titleId) ?? null,
    trophies: trophiesByTitle[titleId] ?? [],
    target: targetsByTitle[titleId] ?? null,
    meta: {
      fetchedAt: "2026-03-17T00:00:00Z",
      cached: false,
      warnings: [],
      partial: false,
    },
  });

  const unearnedTrophiesResponse = (): UnearnedTrophiesResponse => ({
    trophies: [
      {
        npCommunicationId: "NPWR1",
        trophyId: 1,
        trophyGroupId: "default",
        name: "Best in Show",
        description: "Earn every trophy in Bluey.",
        iconUrl: null,
        grade: "platinum",
        earned: false,
        earnedAt: null,
        hidden: false,
        groupName: null,
        trophyRare: 1,
        trophyEarnedRate: 11.1,
        titleName: "Bluey",
        titleIconUrl: "https://example.com/bluey.png",
        platform: "PS5",
        titleLastUpdated: "2026-03-17T00:00:00Z",
        target:
          targetsByTitle.NPWR1?.trophyId === 1 &&
          targetsByTitle.NPWR1?.trophyGroupId === "default",
      },
      {
        npCommunicationId: "NPWR1",
        trophyId: 4,
        trophyGroupId: "001",
        name: "Rainy Day",
        description: "Complete the backyard course in the rain.",
        iconUrl: null,
        grade: "bronze",
        earned: false,
        earnedAt: null,
        hidden: false,
        groupName: "Puppy Playtime",
        trophyRare: 3,
        trophyEarnedRate: 48.7,
        titleName: "Bluey",
        titleIconUrl: "https://example.com/bluey.png",
        platform: "PS5",
        titleLastUpdated: "2026-03-17T00:00:00Z",
        target:
          targetsByTitle.NPWR1?.trophyId === 4 &&
          targetsByTitle.NPWR1?.trophyGroupId === "001",
      },
      {
        npCommunicationId: "NPWR2",
        trophyId: 2,
        trophyGroupId: "default",
        name: "Galaxy Champion",
        description: "Save the stars and clean up every world.",
        iconUrl: null,
        grade: "gold",
        earned: false,
        earnedAt: null,
        hidden: false,
        groupName: null,
        trophyRare: 2,
        trophyEarnedRate: 22.2,
        titleName: "Astro Bot",
        titleIconUrl: "https://example.com/astro.png",
        platform: "PS5",
        titleLastUpdated: "2026-03-16T00:00:00Z",
        target:
          targetsByTitle.NPWR2?.trophyId === 2 &&
          targetsByTitle.NPWR2?.trophyGroupId === "default",
      },
      {
        npCommunicationId: "NPWR2",
        trophyId: 8,
        trophyGroupId: "default",
        name: "Mystery Signal",
        description: "Find the hidden transmission.",
        iconUrl: null,
        grade: "silver",
        earned: false,
        earnedAt: null,
        hidden: true,
        groupName: null,
        trophyRare: 1,
        trophyEarnedRate: null,
        titleName: "Astro Bot",
        titleIconUrl: "https://example.com/astro.png",
        platform: "PS5",
        titleLastUpdated: "2026-03-16T00:00:00Z",
        target:
          targetsByTitle.NPWR2?.trophyId === 8 &&
          targetsByTitle.NPWR2?.trophyGroupId === "default",
      },
    ],
    meta: {
      fetchedAt: "2026-03-17T00:00:00Z",
      cached: false,
      warnings: [],
      partial: false,
    },
  });

  const openTrophyBrowser = async () => {
    fireEvent.click(await screen.findByRole("tab", { name: "Trophy Browser" }));
    return screen.getByRole("tabpanel", { name: "Trophy Browser" });
  };

  const openAllUnearned = async () => {
    fireEvent.click(await screen.findByRole("tab", { name: "All Unearned" }));
    return screen.getByRole("tabpanel", { name: "All Unearned" });
  };

  beforeEach(() => {
    originalDesktopRuntime = window.streamerToolsDesktop;
    activeGame = createDefaultActiveGameSelection();
    settings = createDefaultOverlaySettings();
    targetsByTitle = {};
    tokenStatus = {
      configured: true,
      storage: "local-file",
      updatedAt: "2026-03-17T00:00:00Z",
    };
    summaryError = null;
    settingsSaveDelaysMs = [];
    fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";

      if (input === "/api/psn-token") {
        if (method === "PUT") {
          tokenStatus = {
            configured: true,
            storage: "local-file",
            updatedAt: "2026-03-17T00:00:00Z",
          };
        }

        if (method === "DELETE") {
          tokenStatus = {
            configured: false,
            storage: "local-file",
            updatedAt: null,
          };
        }

        return {
          ok: true,
          json: async () => tokenStatus,
        };
      }

      if (input === "/api/health") {
        return {
          ok: true,
          json: async () => ({
            status: "ok",
            configured: tokenStatus.configured,
            source: "psn-api",
          }),
        };
      }

      if (input === "/api/trophies/summary") {
        if (summaryError) {
          return {
            ok: false,
            json: async () => summaryError,
          };
        }

        return {
          ok: true,
          json: async () => summary,
        };
      }

      if (input.startsWith("/api/trophies/title/")) {
        const titleId = input.replace("/api/trophies/title/", "");
        return {
          ok: true,
          json: async () => titleTrophiesResponse(titleId),
        };
      }

      if (input === "/api/trophies/unearned") {
        return {
          ok: true,
          json: async () => unearnedTrophiesResponse(),
        };
      }

      if (input.startsWith("/api/trophies/search")) {
        const query = new URL(`http://localhost${input}`).searchParams.get("q") ?? "";
        const matchingResults = summary.titles
          .filter((title) => title.titleName.toLowerCase().includes(query.toLowerCase()))
          .map((title) => ({
            npCommunicationId: title.npCommunicationId,
            titleName: title.titleName,
            platform: title.platform,
            iconUrl: title.iconUrl,
            progress: title.progress,
            lastUpdated: title.lastUpdated,
          }));
        const responsePayload: TitleSearchResponse = {
          results: matchingResults,
          nextOffset: null,
          totalItemCount: matchingResults.length,
        };

        return {
          ok: true,
          json: async () => responsePayload,
        };
      }

      if (input === "/api/settings") {
        if (method === "PUT") {
          const nextSettings = JSON.parse(String(init?.body));
          const nextDelayMs = settingsSaveDelaysMs.shift() ?? 0;

          if (nextDelayMs > 0) {
            await waitForMs(nextDelayMs);
          }

          settings = nextSettings;
        }

        return {
          ok: true,
          json: async () => settings,
        };
      }

      if (input === "/api/active-game") {
        if (method === "PUT") {
          activeGame = JSON.parse(String(init?.body));
        }

        return {
          ok: true,
          json: async () => activeGame,
        };
      }

      if (input === "/api/target-trophy") {
        const payload = JSON.parse(String(init?.body)) as UpdateTargetTrophyRequest;
        if (payload.trophyId == null || !payload.trophyGroupId) {
          delete targetsByTitle[payload.npCommunicationId];
          return {
            ok: true,
            json: async () => null,
          };
        }

        const nextSelection: TargetTrophySelection = {
          npCommunicationId: payload.npCommunicationId,
          trophyId: payload.trophyId,
          trophyGroupId: payload.trophyGroupId,
          updatedAt: "2026-03-17T00:00:00Z",
        };
        targetsByTitle[payload.npCommunicationId] = nextSelection;
        return {
          ok: true,
          json: async () => nextSelection,
        };
      }

      if (input === "/api/overlay-data") {
        return {
          ok: true,
          json: async () => overlayData(),
        };
      }

      throw new Error(`Unhandled request: ${method} ${input}`);
    });

    vi.stubGlobal("fetch", fetchMock);
    openMock = vi.spyOn(window, "open").mockImplementation(() => null);
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    window.streamerToolsDesktop = originalDesktopRuntime;
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("opens PSN access automatically when no token is stored, then saves and clears it", async () => {
    tokenStatus = {
      configured: false,
      storage: "local-file",
      updatedAt: null,
    };

    render(<App />);

    const dialog = await screen.findByRole("dialog", { name: "Local token storage" });
    expect(
      within(dialog).getAllByText(
        "A saved NPSSO token is required before this control room can load PSN data.",
      ),
    ).toHaveLength(1);
    const tokenField = within(dialog).getByLabelText("PSN token") as HTMLInputElement;
    const summaryCallsBefore = fetchMock.mock.calls.filter(
      ([input]) => input === "/api/trophies/summary",
    ).length;

    fireEvent.change(tokenField, { target: { value: "super-secret-token" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save token" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/psn-token",
        expect.objectContaining({ method: "PUT" }),
      );
    });
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Local token storage" })).not.toBeInTheDocument();
    });
    await waitFor(() => {
      const summaryCallsAfter = fetchMock.mock.calls.filter(
        ([input]) => input === "/api/trophies/summary",
      ).length;
      expect(summaryCallsAfter).toBeGreaterThan(summaryCallsBefore);
    });

    fireEvent.click(screen.getByRole("tab", { name: "Setup" }));
    fireEvent.click(screen.getByRole("button", { name: "PSN access" }));

    const reopenedDialog = await screen.findByRole("dialog", { name: "Local token storage" });
    expect(within(reopenedDialog).getByLabelText("PSN token")).toHaveValue("");

    fireEvent.click(within(reopenedDialog).getByRole("button", { name: "Clear token" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/psn-token",
        expect.objectContaining({ method: "DELETE" }),
      );
    });
    await waitFor(() => {
      expect(screen.getAllByText("No token saved").length).toBeGreaterThan(0);
    });
  });

  it("reopens PSN access when the saved token is rejected", async () => {
    summaryError = {
      type: "psn_auth",
      message: "Invalid NPSSO token.",
    };

    render(<App />);

    const dialog = await screen.findByRole("dialog", { name: "Local token storage" });
    await waitFor(() => {
      expect(within(dialog).getAllByText(/rejected by PSN/i)).toHaveLength(1);
    });
    fireEvent.click(screen.getByRole("tab", { name: "Setup" }));
    expect(screen.getByRole("button", { name: "PSN access" })).toBeInTheDocument();
  });

  it("renders the redesigned PSN access controls and closes from the icon button", async () => {
    tokenStatus = {
      configured: false,
      storage: "local-file",
      updatedAt: null,
    };

    render(<App />);

    const dialog = await screen.findByRole("dialog", { name: "Local token storage" });
    expect(within(dialog).getByRole("button", { name: "Close PSN access" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Open token page" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Save token" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Clear token" })).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "Close PSN access" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Local token storage" })).not.toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("tab", { name: "Setup" }));
    expect(screen.getByRole("button", { name: "PSN access" })).toBeInTheDocument();
  });

  it("opens the Sony token page from the PSN access dialog", async () => {
    tokenStatus = {
      configured: false,
      storage: "local-file",
      updatedAt: null,
    };

    render(<App />);

    const dialog = await screen.findByRole("dialog", { name: "Local token storage" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Open token page" }));

    expect(openMock).toHaveBeenCalledWith(
      "https://ca.account.sony.com/api/v1/ssocookie",
      "_blank",
      "noopener,noreferrer",
    );
  });

  it("renders the tabbed workspace with Setup active by default", async () => {
    const { container } = render(<App />);
    const topBar = container.querySelector(".app-topbar") as HTMLElement;
    const topBarFrame = topBar.querySelector(".app-topbar-frame") as HTMLElement;
    const scrollRegion = container.querySelector(".dashboard-scroll-region") as HTMLElement;
    const actions = topBar.querySelector(".app-topbar-actions") as HTMLElement;
    const dragLane = topBar.querySelector(".app-topbar-drag-lane") as HTMLElement;

    expect(await screen.findByRole("tab", { name: "Setup" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: "Game Selection" })).toHaveAttribute(
      "aria-selected",
      "false",
    );
    expect(screen.getByRole("tab", { name: "Trophy Browser" })).toHaveAttribute(
      "aria-selected",
      "false",
    );
    expect(
      screen.getByRole("tabpanel", { name: "Setup" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("tabpanel", { name: "Game Selection" }),
    ).not.toBeInTheDocument();
    expect(topBar).toBeTruthy();
    expect(topBarFrame).toBeTruthy();
    expect(scrollRegion).toBeTruthy();
    expect(dragLane).toBeTruthy();
    expect(dragLane).toHaveAttribute("aria-hidden", "true");
    expect(within(topBar).getByText("PSN Trophy Overlay Suite")).toBeInTheDocument();
    expect(screen.queryByText("Recent titles and older-title search")).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        "Manage overlay routes, timing controls, and the stream-facing preview surfaces.",
      ),
    ).not.toBeInTheDocument();
    expect(within(actions).getByRole("button", { name: "PSN access" })).toBeInTheDocument();
    expect(within(actions).getByRole("button", { name: "Refresh all" })).toBeInTheDocument();
    expect(topBar.querySelector(".status-pill")).toBeNull();
    expect(topBar.querySelector(".panel-tag")).toBeNull();
    expect(topBar.querySelector(".app-topbar-window-controls")).toBeNull();
  });

  it("renders custom window controls only in desktop mode", async () => {
    const desktop = createDesktopWindowControlsMock();
    window.streamerToolsDesktop = {
      platform: "desktop",
      windowControls: desktop.controls,
    };

    const { rerender } = render(<App />);
    const desktopTopBar = document.querySelector(".app-topbar") as HTMLElement;

    expect(await screen.findByRole("button", { name: "Minimize window" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Maximize window" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close window" })).toBeInTheDocument();
    expect(desktopTopBar.querySelector(".app-topbar-frame")).toBeTruthy();
    expect(desktopTopBar.querySelector(".app-topbar-window-controls")).toBeTruthy();
    expect(desktopTopBar.querySelector(".app-topbar-drag-lane")).toBeTruthy();

    window.streamerToolsDesktop = undefined;
    rerender(<App />);

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Minimize window" })).not.toBeInTheDocument();
    });
  });

  it("updates the maximize control label when desktop maximize state changes", async () => {
    const desktop = createDesktopWindowControlsMock();
    window.streamerToolsDesktop = {
      platform: "desktop",
      windowControls: desktop.controls,
    };

    render(<App />);

    expect(await screen.findByRole("button", { name: "Maximize window" })).toBeInTheDocument();
    expect(desktop.controls.isMaximized).toHaveBeenCalled();

    desktop.emitMaximizedChange(true);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Restore window" })).toBeInTheDocument();
    });
  });

  it("keeps the shared app bar actions when switching to Setup", async () => {
    const { container } = render(<App />);

    fireEvent.click(await screen.findByRole("tab", { name: "Setup" }));

    const topBar = container.querySelector(".app-topbar") as HTMLElement;
    const actions = topBar.querySelector(".app-topbar-actions") as HTMLElement;
    const setupPanel = await screen.findByRole("tabpanel", { name: "Setup" });

    expect(topBar).toBeTruthy();
    expect(
      within(topBar).queryByText(
        "Manage overlay routes, timing controls, and the stream-facing preview surfaces.",
      ),
    ).not.toBeInTheDocument();
    expect(within(actions).getByRole("button", { name: "PSN access" })).toBeInTheDocument();
    expect(within(actions).getByRole("button", { name: "Refresh all" })).toBeInTheDocument();
    expect(within(setupPanel).queryByRole("button", { name: "PSN access" })).not.toBeInTheDocument();
    expect(container.querySelector(".workspace-header-band")).toBeNull();
    expect(topBar.querySelector(".status-pill")).toBeNull();
    expect(topBar.querySelector(".panel-tag")).toBeNull();
    expect(setupPanel).not.toHaveClass("panel");
  });

  it("hides the trophy browser tab when no PSN title is available", async () => {
    const baseFetchMock = fetchMock;
    const callBaseFetch = baseFetchMock as unknown as (
      input: string,
      init?: RequestInit,
    ) => Promise<unknown>;
    fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
      if (input === "/api/trophies/summary") {
        return {
          ok: true,
          json: async () => ({
            ...summary,
            titles: [],
          }),
        };
      }

      return callBaseFetch(input, init);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    expect(await screen.findByRole("tab", { name: "Game Selection" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Trophy Browser" })).not.toBeInTheDocument();
  });

  it("hides the trophy browser tab while custom mode is active", async () => {
    activeGame = {
      ...createDefaultActiveGameSelection(),
      mode: "custom",
    };

    render(<App />);

    expect(await screen.findByRole("tab", { name: "Game Selection" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Trophy Browser" })).not.toBeInTheDocument();
  });

  it("switches tabs to Trophy Browser after selecting a title and loads its trophies", async () => {
    const { container } = render(<App />);

    fireEvent.click(await screen.findByRole("tab", { name: "Game Selection" }));
    const gamesPanel = await screen.findByRole("tabpanel", { name: "Game Selection" });
    const astroCard = within(gamesPanel).getByRole("button", { name: /Astro Bot/i });
    fireEvent.click(astroCard);

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "Trophy Browser" })).toHaveAttribute(
        "aria-selected",
        "true",
      );
    });
    const trophyPanel = await screen.findByRole("tabpanel", { name: "Trophy Browser" });
    expect(trophyPanel).toBeInTheDocument();
    expect(trophyPanel).not.toHaveClass("panel");
    expect(container.querySelector(".trophy-browser-surface")).toBeTruthy();
    expect(container.querySelector(".trophy-card-grid")).toBeTruthy();
    expect(await screen.findByText("Galaxy Champion")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/active-game",
      expect.objectContaining({ method: "PUT" }),
    );
  });

  it("replaces recent titles with live search results from the first character", async () => {
    render(<App />);

    fireEvent.click(await screen.findByRole("tab", { name: "Game Selection" }));
    const activeGameSection = await screen.findByRole("tabpanel", {
      name: "Game Selection",
    });

    fireEvent.change(within(activeGameSection).getByLabelText("Search older PSN titles"), {
      target: { value: "blue" },
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/trophies/search?q=blue&offset=0&limit=12",
        expect.objectContaining({ headers: expect.any(Object) }),
      );
    });
    expect(within(activeGameSection).getByText("Search results (1)")).toBeInTheDocument();
    expect(within(activeGameSection).queryByText("Recent titles")).not.toBeInTheDocument();
    expect(within(activeGameSection).queryByRole("button", { name: /Astro Bot/i })).not.toBeInTheDocument();
    expect(within(activeGameSection).getByRole("button", { name: /Bluey/i })).toBeInTheDocument();
  });

  it("keeps the current selection visible when search results exclude it", async () => {
    render(<App />);

    fireEvent.click(await screen.findByRole("tab", { name: "Game Selection" }));
    const activeGameSection = await screen.findByRole("tabpanel", {
      name: "Game Selection",
    });

    fireEvent.click(within(activeGameSection).getByRole("button", { name: /Astro Bot/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/active-game",
        expect.objectContaining({ method: "PUT" }),
      );
    });

    fireEvent.click(screen.getByRole("tab", { name: "Game Selection" }));
    const refreshedGamePanel = await screen.findByRole("tabpanel", {
      name: "Game Selection",
    });
    fireEvent.change(within(refreshedGamePanel).getByLabelText("Search older PSN titles"), {
      target: { value: "blue" },
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/trophies/search?q=blue&offset=0&limit=12",
        expect.objectContaining({ headers: expect.any(Object) }),
      );
    });
    expect(within(refreshedGamePanel).getAllByRole("button", { name: /Astro Bot/i })).toHaveLength(1);
    expect(within(refreshedGamePanel).getByText("Search results (1)")).toBeInTheDocument();
  });

  it("does not duplicate the active title when it is already in the visible search results", async () => {
    render(<App />);

    fireEvent.click(await screen.findByRole("tab", { name: "Game Selection" }));
    const activeGameSection = await screen.findByRole("tabpanel", {
      name: "Game Selection",
    });

    fireEvent.click(within(activeGameSection).getByRole("button", { name: /Astro Bot/i }));

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "Trophy Browser" })).toHaveAttribute(
        "aria-selected",
        "true",
      );
    });

    fireEvent.click(screen.getByRole("tab", { name: "Game Selection" }));
    const refreshedGamePanel = await screen.findByRole("tabpanel", {
      name: "Game Selection",
    });
    fireEvent.change(within(refreshedGamePanel).getByLabelText("Search older PSN titles"), {
      target: { value: "astro" },
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/trophies/search?q=astro&offset=0&limit=12",
        expect.objectContaining({ headers: expect.any(Object) }),
      );
    });
    expect(within(refreshedGamePanel).getAllByRole("button", { name: /Astro Bot/i })).toHaveLength(1);
  });

  it("pins a trophy as the current target and exposes the clear action", async () => {
    const { container } = render(<App />);
    const trophyBrowserPanel = await openTrophyBrowser();
    const trophyButton = await within(trophyBrowserPanel).findByRole("button", {
      name: /Best in Show/i,
    });
    fireEvent.click(trophyButton);

    expect(screen.queryByRole("heading", { name: "Featured on stream" })).not.toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Clear target" })).toBeInTheDocument();
    expect(container.querySelector(".trophy-browser-target-rail .trophy-card-featured")).toBeTruthy();
    expect(screen.queryByText("Pinned target")).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/target-trophy",
      expect.objectContaining({ method: "PUT" }),
    );
  });

  it("renders group tabs with percentages and filters unearned trophies by scope", async () => {
    const { container } = render(<App />);
    const trophyBrowserPanel = await openTrophyBrowser();
    const tabList = within(trophyBrowserPanel).getByRole("tablist", {
      name: "Trophy browser groups",
    });
    const tabs = within(tabList).getAllByRole("tab");

    expect(tabs).toHaveLength(5);
    expect(within(tabs[0] as HTMLElement).getByText("All")).toBeInTheDocument();
    expect(within(tabs[0] as HTMLElement).getByText("60%")).toBeInTheDocument();
    expect(within(tabs[1] as HTMLElement).getByText("Main Game")).toBeInTheDocument();
    expect(within(tabs[1] as HTMLElement).getByText("50%")).toBeInTheDocument();
    expect(within(tabs[2] as HTMLElement).getByText("Puppy Playtime")).toBeInTheDocument();
    expect(within(tabs[2] as HTMLElement).getByText("50%")).toBeInTheDocument();
    expect(within(tabs[3] as HTMLElement).getByText("DLC 002")).toBeInTheDocument();
    expect(within(tabs[3] as HTMLElement).getByText("100%")).toBeInTheDocument();
    expect(within(tabs[4] as HTMLElement).getByText("Earned")).toBeInTheDocument();
    expect(within(trophyBrowserPanel).getByText("Unearned trophies 2")).toBeInTheDocument();
    expect(within(trophyBrowserPanel).getByText("Best in Show")).toBeInTheDocument();
    expect(within(trophyBrowserPanel).getByText("Rainy Day")).toBeInTheDocument();
    expect(within(trophyBrowserPanel).queryByText("Family Photo")).not.toBeInTheDocument();
    expect(container.querySelectorAll(".trophy-card-grid")).toHaveLength(1);

    fireEvent.click(within(tabList).getByRole("tab", { name: /Main Game/i }));
    expect(within(trophyBrowserPanel).getByText("Unearned trophies 1")).toBeInTheDocument();
    expect(within(trophyBrowserPanel).getByText("Best in Show")).toBeInTheDocument();
    expect(within(trophyBrowserPanel).queryByText("Rainy Day")).not.toBeInTheDocument();
    expect(within(trophyBrowserPanel).queryByText("No unearned trophies in this tab.")).not.toBeInTheDocument();

    fireEvent.click(within(tabList).getByRole("tab", { name: /Puppy Playtime/i }));
    expect(within(trophyBrowserPanel).getByText("Unearned trophies 1")).toBeInTheDocument();
    expect(within(trophyBrowserPanel).getByText("Rainy Day")).toBeInTheDocument();
    expect(within(trophyBrowserPanel).queryByText("Best in Show")).not.toBeInTheDocument();

    fireEvent.click(within(tabList).getByRole("tab", { name: /DLC 002/i }));
    expect(within(trophyBrowserPanel).getByText("Unearned trophies 0")).toBeInTheDocument();
    expect(within(trophyBrowserPanel).getByText("No unearned trophies in this tab.")).toBeInTheDocument();
  });

  it("shows the earned tab and keeps the pinned target visible above the browser across sub-tabs", async () => {
    const { container } = render(<App />);
    const trophyBrowserPanel = await openTrophyBrowser();
    const trophyBrowserSurface = trophyBrowserPanel.querySelector(
      ".trophy-browser-surface",
    ) as HTMLElement;
    const tabList = within(trophyBrowserPanel).getByRole("tablist", {
      name: "Trophy browser groups",
    });

    fireEvent.click(within(trophyBrowserPanel).getByRole("button", { name: /Best in Show/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Clear target" })).toBeInTheDocument();
    });
    expect(container.querySelector(".trophy-browser-target-rail .trophy-card-featured")).toBeTruthy();
    expect(within(trophyBrowserSurface).getByText("Unearned trophies 2")).toBeInTheDocument();
    expect(within(trophyBrowserSurface).queryByText("Best in Show")).not.toBeInTheDocument();
    expect(within(trophyBrowserSurface).getByText("Rainy Day")).toBeInTheDocument();

    fireEvent.click(within(tabList).getByRole("tab", { name: /Main Game/i }));

    expect(within(trophyBrowserSurface).getByText("Unearned trophies 1")).toBeInTheDocument();
    expect(within(trophyBrowserSurface).queryByText("Best in Show")).not.toBeInTheDocument();
    expect(within(trophyBrowserSurface).queryByText("No unearned trophies in this tab.")).not.toBeInTheDocument();
    expect(within(trophyBrowserPanel).getByRole("tab", { name: /Main Game/i })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    fireEvent.click(within(tabList).getByRole("tab", { name: /Earned/i }));

    expect(within(trophyBrowserSurface).getByText("Earned trophies 3")).toBeInTheDocument();
    expect(within(trophyBrowserSurface).getByText("Family Photo")).toBeInTheDocument();
    expect(within(trophyBrowserSurface).getByText("Backyard Hero")).toBeInTheDocument();
    expect(within(trophyBrowserSurface).getByText("Night Watch")).toBeInTheDocument();
    expect(within(trophyBrowserSurface).queryByText("Best in Show")).not.toBeInTheDocument();
  });

  it("preserves the current sub-tab during target updates and resets it when switching titles", async () => {
    render(<App />);
    const trophyBrowserPanel = await openTrophyBrowser();
    const tabList = within(trophyBrowserPanel).getByRole("tablist", {
      name: "Trophy browser groups",
    });

    fireEvent.click(within(tabList).getByRole("tab", { name: /Puppy Playtime/i }));
    fireEvent.click(within(trophyBrowserPanel).getByRole("button", { name: /Rainy Day/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Clear target" })).toBeInTheDocument();
    });
    expect(within(trophyBrowserPanel).getByRole("tab", { name: /Puppy Playtime/i })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    fireEvent.click(screen.getByRole("tab", { name: "Game Selection" }));
    const gamesPanel = await screen.findByRole("tabpanel", { name: "Game Selection" });
    fireEvent.click(within(gamesPanel).getByRole("button", { name: /Astro Bot/i }));

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "Trophy Browser" })).toHaveAttribute(
        "aria-selected",
        "true",
      );
    });

    const refreshedTrophyBrowserPanel = screen.getByRole("tabpanel", { name: "Trophy Browser" });
    const refreshedTabList = within(refreshedTrophyBrowserPanel).getByRole("tablist", {
      name: "Trophy browser groups",
    });
    expect(within(refreshedTabList).getByRole("tab", { name: /All/i })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("keeps clear target in the trophy browser header and removes empty targets from loop data", async () => {
    settings = {
      ...createDefaultOverlaySettings(),
      showTargetTrophyInLoop: true,
    };

    render(<App />);

    const trophyBrowserPanel = await openTrophyBrowser();

    const [trophyButton] = await within(trophyBrowserPanel).findAllByRole("button", {
      name: /Best in Show/i,
    });
    fireEvent.click(trophyButton);

    const clearTargetButton = await screen.findByRole("button", { name: "Clear target" });
    fireEvent.click(clearTargetButton);

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Clear target" })).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("tab", { name: "Setup" }));
    const setupPanel = await screen.findByRole("tabpanel", { name: "Setup" });
    expect(within(setupPanel).getByTitle("Target trophy preview")).toBeInTheDocument();
    expect(screen.queryByText("Pinned target")).not.toBeInTheDocument();
  });

  it("keeps the shared top bar free of trophy-specific title copy", async () => {
    const { container } = render(<App />);
    await openTrophyBrowser();

    const topBar = container.querySelector(".app-topbar") as HTMLElement;

    expect(within(topBar).getByRole("tab", { name: "Trophy Browser" })).toBeInTheDocument();
    expect(within(topBar).queryByText("Bluey")).not.toBeInTheDocument();
  });

  it("renders the combined setup config and preview panel", async () => {
    const { container } = render(<App />);
    fireEvent.click(await screen.findByRole("tab", { name: "Setup" }));

    const setupPanel = await screen.findByRole("tabpanel", { name: "Setup" });
    const previewSurface = setupPanel.querySelector(
      ".setup-config-preview-surface",
    ) as HTMLElement;

    expect(setupPanel).not.toHaveClass("panel");
    expect(within(setupPanel).getByRole("heading", { name: "Config and preview" })).toBeInTheDocument();
    expect(
      within(setupPanel).queryByRole("heading", { name: "Manage overlay routes" }),
    ).not.toBeInTheDocument();
    expect(
      within(setupPanel).queryByRole("heading", { name: "Overlay controls" }),
    ).not.toBeInTheDocument();
    expect(within(setupPanel).getByText("Show artwork")).toBeInTheDocument();
    expect(within(setupPanel).getByText("Show title and platform")).toBeInTheDocument();
    expect(within(setupPanel).getByText("Show progress and earned totals")).toBeInTheDocument();
    expect(within(setupPanel).getByText("Show trophy counts")).toBeInTheDocument();
    expect(within(setupPanel).queryByLabelText("Overlay anchor")).not.toBeInTheDocument();
    expect(within(setupPanel).getByRole("combobox", { name: "Loop anchor" })).toBeInTheDocument();
    expect(within(setupPanel).getByRole("combobox", { name: "Target trophy anchor" })).toBeInTheDocument();
    expect(within(setupPanel).getByRole("combobox", { name: "Overall anchor" })).toBeInTheDocument();
    expect(within(setupPanel).getByRole("combobox", { name: "Current game anchor" })).toBeInTheDocument();
    expect(within(setupPanel).getByText("Show target info")).toBeInTheDocument();
    const controlsStack = previewSurface.querySelector(".setup-controls-stack") as HTMLElement;
    expect(controlsStack).toBeTruthy();
    expect(controlsStack.lastElementChild).toHaveClass("strip-order-rail");
    expect(previewSurface.querySelector(".strip-order-track")).toBeTruthy();
    const fieldLabels = Array.from(
      previewSurface.querySelectorAll(".setup-config-fields .field > span:first-child"),
    ).map((field) => field.textContent?.trim());
    const previewBlocks = Array.from(
      previewSurface.querySelectorAll(".overlay-preview-block"),
    ) as HTMLDivElement[];
    expect(fieldLabels).toEqual([
      "Overall duration (ms)",
      "Current game duration (ms)",
      "Target trophy duration (ms)",
      "Target trophy tag text",
    ]);
    const loopAnchorSelect = within(previewBlocks[0] as HTMLElement).getByRole("combobox", {
      name: "Loop anchor",
    }) as HTMLSelectElement;
    expect(
      Array.from(loopAnchorSelect.options).map((option) => option.textContent),
    ).toEqual(["Top-left", "Top-right", "Bottom-left", "Bottom-right"]);
    const toggleLabels = Array.from(
      previewSurface.querySelectorAll(".settings-toggle-grid .toggle-field"),
    ).map((field) => field.textContent?.replace(/\s+/g, " ").trim());
    expect(toggleLabels).toEqual([
      "Show artwork",
      "Show title and platform",
      "Show progress and earned totals",
      "Show trophy counts",
      "Show target trophy in loop",
      "Show target trophy tag",
      "Show target info",
    ]);
    expect(
      within(setupPanel).queryByRole("heading", { name: "Strip section order" }),
    ).not.toBeInTheDocument();
    expect(within(setupPanel).queryByText("Section order")).not.toBeInTheDocument();
    expect(
      within(setupPanel).queryByText(
        "Drag sections left or right to update the target trophy and strip overlays.",
      ),
    ).not.toBeInTheDocument();
    expect(within(setupPanel).queryByRole("button", { name: "Save settings" })).not.toBeInTheDocument();
    expect(within(setupPanel).getByRole("button", { name: "Copy loop URL" })).toBeInTheDocument();
    expect(within(setupPanel).getByRole("button", { name: "Copy target trophy URL" })).toBeInTheDocument();
    expect(within(setupPanel).getByRole("button", { name: "Copy overall URL" })).toBeInTheDocument();
    expect(within(setupPanel).getByRole("button", { name: "Copy current game URL" })).toBeInTheDocument();
    expect(previewBlocks[0]?.querySelector('[title="Loop preview"]')).not.toBeNull();
    expect(previewBlocks[0]?.querySelector(".route-row-actions")).not.toBeNull();
    const reorderChips = Array.from(
      previewSurface.querySelectorAll(".strip-order-chip"),
    ) as HTMLDivElement[];
    expect(reorderChips).toHaveLength(5);
    expect(
      reorderChips.map(
        (row) =>
          row.querySelector(".strip-order-chip-label")?.textContent?.trim(),
      ),
    ).toEqual([
      "Artwork",
      "Title and platform",
      "Progress and earned totals",
      "Trophy counts",
      "Target info",
    ]);
    expect(reorderChips.every((row) => row.getAttribute("draggable") === "true")).toBe(true);
    expect(within(setupPanel).queryByText("Show grade rows")).not.toBeInTheDocument();
    expect(within(setupPanel).queryByText("Show overall completion")).not.toBeInTheDocument();
    expect(within(setupPanel).queryByText("Show current completion")).not.toBeInTheDocument();
    expect(within(setupPanel).queryByText("Show current totals")).not.toBeInTheDocument();
    expect(within(setupPanel).queryByText("Source")).not.toBeInTheDocument();
    expect(within(setupPanel).queryByText("Token updated")).not.toBeInTheDocument();
    expect(within(setupPanel).queryByText("Fetched")).not.toBeInTheDocument();
    expect(within(setupPanel).queryByText("Warnings")).not.toBeInTheDocument();
    expect(
      within(setupPanel).queryByRole("heading", { name: "Stream-facing preview surfaces" }),
    ).not.toBeInTheDocument();
    expect(within(setupPanel).queryByRole("heading", { name: "Target trophy" })).not.toBeInTheDocument();
    expect(within(setupPanel).queryByRole("heading", { name: "Main HUD" })).not.toBeInTheDocument();
    expect(
      within(setupPanel).getByText(`${window.location.origin}/overlay/loop`),
    ).toBeInTheDocument();
    expect(
      within(setupPanel).getByText(`${window.location.origin}/overlay/target-trophy`),
    ).toBeInTheDocument();
    expect(
      within(setupPanel).getByText(`${window.location.origin}/overlay/overall`),
    ).toBeInTheDocument();
    expect(
      within(setupPanel).getByText(`${window.location.origin}/overlay/current-game`),
    ).toBeInTheDocument();

    const [loopPreview, targetPreview, overallPreview, currentGamePreview] = within(setupPanel).getAllByTitle(
      /preview$/i,
    ) as HTMLIFrameElement[];

    expect(loopPreview.getAttribute("src")).toBe("/overlay/loop?dashboardPreview=1");
    expect(targetPreview.getAttribute("src")).toBe("/overlay/target-trophy?dashboardPreview=1");
    expect(overallPreview.getAttribute("src")).toBe("/overlay/overall?dashboardPreview=1");
    expect(currentGamePreview.getAttribute("src")).toBe("/overlay/current-game?dashboardPreview=1");
    expect(loopPreview).not.toHaveAttribute("draggable");
    expect(targetPreview).not.toHaveAttribute("draggable");
    expect(overallPreview).not.toHaveAttribute("draggable");
    expect(currentGamePreview).not.toHaveAttribute("draggable");
    expect(container.querySelector(".embedded-overlay-preview")?.getAttribute("draggable")).toBeNull();
  });

  it("reorders strip sections from the preview rail using chip hover insertion", async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole("tab", { name: "Setup" }));

    const setupPanel = await screen.findByRole("tabpanel", { name: "Setup" });
    const previewSurface = setupPanel.querySelector(
      ".setup-config-preview-surface",
    ) as HTMLElement;
    const orderRows = () =>
      Array.from(previewSurface.querySelectorAll(".strip-order-chip")).map((row) =>
        row.querySelector(".strip-order-chip-label")?.textContent?.trim(),
      );

    const dragData = (() => {
      let payload = "";
      return {
        effectAllowed: "move",
        dropEffect: "move",
        setData: (_type: string, value: string) => {
          payload = value;
        },
        getData: () => payload,
      };
    })();

    const artworkRow = previewSurface.querySelector(
      '[data-strip-zone="artwork"]',
    ) as HTMLDivElement | null;
    const targetInfoRow = previewSurface.querySelector(
      '[data-strip-zone="targetInfo"]',
    ) as HTMLDivElement | null;

    expect(artworkRow).toBeTruthy();
    expect(targetInfoRow).toBeTruthy();
    expect(orderRows()).toEqual([
      "Artwork",
      "Title and platform",
      "Progress and earned totals",
      "Trophy counts",
      "Target info",
    ]);

    (artworkRow as HTMLDivElement).getBoundingClientRect = () =>
      ({
        left: 0,
        width: 140,
      }) as DOMRect;
    (
      previewSurface.querySelector('[data-strip-zone="identity"]') as HTMLDivElement
    ).getBoundingClientRect = () =>
      ({
        left: 160,
        width: 180,
      }) as DOMRect;
    (
      previewSurface.querySelector('[data-strip-zone="metrics"]') as HTMLDivElement
    ).getBoundingClientRect = () =>
      ({
        left: 360,
        width: 220,
      }) as DOMRect;
    (
      previewSurface.querySelector('[data-strip-zone="trophies"]') as HTMLDivElement
    ).getBoundingClientRect = () =>
      ({
        left: 600,
        width: 150,
      }) as DOMRect;
    (targetInfoRow as HTMLDivElement).getBoundingClientRect = () =>
      ({
        left: 770,
        width: 160,
      }) as DOMRect;

    fireEvent.dragStart(artworkRow as Element, { dataTransfer: dragData });
    fireEvent.dragOver(targetInfoRow as Element, {
      clientX: 950,
      dataTransfer: dragData,
    });
    fireEvent.drop(targetInfoRow as Element, {
      clientX: 950,
      dataTransfer: dragData,
    });
    fireEvent.dragEnd(artworkRow as Element, { dataTransfer: dragData });

    expect(orderRows()).toEqual([
      "Title and platform",
      "Progress and earned totals",
      "Trophy counts",
      "Target info",
      "Artwork",
    ]);
    await waitFor(() => {
      expect(
        fetchMock.mock.calls.filter(
          ([input, init]) => input === "/api/settings" && (init?.method ?? "GET") === "PUT",
        ),
      ).toHaveLength(1);
    });
    expect(setupPanel.querySelector(".embedded-overlay-preview")?.getAttribute("draggable")).toBeNull();
  });

  it("copies a route URL with the clipboard API and shows local feedback", async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    render(<App />);
    fireEvent.click(await screen.findByRole("tab", { name: "Setup" }));

    const button = await screen.findByRole("button", { name: "Copy loop URL" });
    fireEvent.click(button);

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/overlay/loop`);
    });
    expect(button).toHaveTextContent("Copied");
  });

  it("falls back to execCommand when the clipboard API is unavailable", async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: undefined,
      configurable: true,
    });
    const execCommand = vi.fn(() => true);
    Object.defineProperty(document, "execCommand", {
      value: execCommand,
      configurable: true,
    });

    render(<App />);
    fireEvent.click(await screen.findByRole("tab", { name: "Setup" }));

    fireEvent.click(await screen.findByRole("button", { name: "Copy target trophy URL" }));

    await waitFor(() => {
      expect(execCommand).toHaveBeenCalledWith("copy");
    });
  });

  it("persists toggle changes immediately", async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole("tab", { name: "Setup" }));

    const setupPanel = await screen.findByRole("tabpanel", { name: "Setup" });
    const toggle = within(setupPanel).getByLabelText("Show target trophy in loop") as HTMLInputElement;

    fireEvent.click(toggle);

    await waitFor(() => {
      const putCalls = fetchMock.mock.calls.filter(
        ([input, init]) => input === "/api/settings" && (init?.method ?? "GET") === "PUT",
      );

      expect(putCalls).toHaveLength(1);
      expect(JSON.parse(String(putCalls[0]?.[1]?.body)).showTargetTrophyInLoop).toBe(true);
    });
  });

  it("persists the target info toggle and mutes the target info strip chip", async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole("tab", { name: "Setup" }));

    const setupPanel = await screen.findByRole("tabpanel", { name: "Setup" });
    const toggle = within(setupPanel).getByLabelText("Show target info") as HTMLInputElement;
    const targetInfoRow = setupPanel.querySelector(
      '[data-strip-zone="targetInfo"]',
    ) as HTMLDivElement | null;

    expect(targetInfoRow).toBeTruthy();
    expect(targetInfoRow).not.toHaveClass("is-muted");

    fireEvent.click(toggle);

    await waitFor(() => {
      const putCalls = fetchMock.mock.calls.filter(
        ([input, init]) => input === "/api/settings" && (init?.method ?? "GET") === "PUT",
      );
      expect(putCalls).toHaveLength(1);
      expect(JSON.parse(String(putCalls[0]?.[1]?.body)).showTargetTrophyInfo).toBe(false);
    });

    expect(targetInfoRow).toHaveClass("is-muted");
  });

  it("persists per-route anchor changes immediately", async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole("tab", { name: "Setup" }));

    const setupPanel = await screen.findByRole("tabpanel", { name: "Setup" });
    const select = within(setupPanel).getByRole("combobox", {
      name: "Target trophy anchor",
    }) as HTMLSelectElement;

    fireEvent.change(select, { target: { value: "top-right" } });

    await waitFor(() => {
      const putCalls = fetchMock.mock.calls.filter(
        ([input, init]) => input === "/api/settings" && (init?.method ?? "GET") === "PUT",
      );
      expect(putCalls).toHaveLength(1);
      const payload = JSON.parse(String(putCalls[0]?.[1]?.body));
      expect(payload.overlayAnchors.targetTrophy).toBe("top-right");
      expect(payload.overlayAnchors.loop).toBe("bottom-left");
    });
  });

  it("debounces text and number edits into one settings save", async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole("tab", { name: "Setup" }));

    const setupPanel = await screen.findByRole("tabpanel", { name: "Setup" });
    vi.useFakeTimers();

    const overallDuration = within(setupPanel).getByLabelText(
      "Overall duration (ms)",
    ) as HTMLInputElement;
    const tagText = within(setupPanel).getByLabelText("Target trophy tag text") as HTMLInputElement;

    fireEvent.change(overallDuration, { target: { value: "6000" } });
    fireEvent.change(overallDuration, { target: { value: "7000" } });
    fireEvent.change(tagText, { target: { value: "Featured Trophy" } });

    expect(
      fetchMock.mock.calls.filter(
        ([input, init]) => input === "/api/settings" && (init?.method ?? "GET") === "PUT",
      ),
    ).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(399);

    expect(
      fetchMock.mock.calls.filter(
        ([input, init]) => input === "/api/settings" && (init?.method ?? "GET") === "PUT",
      ),
    ).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(1);

    const putCalls = fetchMock.mock.calls.filter(
      ([input, init]) => input === "/api/settings" && (init?.method ?? "GET") === "PUT",
    );
    expect(putCalls).toHaveLength(1);
    expect(JSON.parse(String(putCalls[0]?.[1]?.body))).toMatchObject({
      overallDurationMs: 7000,
      targetTrophyTagText: "Featured Trophy",
    });
  });

  it("ignores stale settings save responses that return out of order", async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole("tab", { name: "Setup" }));

    const setupPanel = await screen.findByRole("tabpanel", { name: "Setup" });
    const toggle = within(setupPanel).getByLabelText("Show target trophy tag") as HTMLInputElement;
    settingsSaveDelaysMs = [500, 0];
    vi.useFakeTimers();

    fireEvent.click(toggle);
    fireEvent.click(toggle);

    expect(
      fetchMock.mock.calls.filter(
        ([input, init]) => input === "/api/settings" && (init?.method ?? "GET") === "PUT",
      ),
    ).toHaveLength(2);

    await vi.advanceTimersByTimeAsync(500);

    expect(toggle).toBeChecked();
    expect(settings.showTargetTrophyTag).toBe(false);
  });

  it("keeps the active title badge rendered on the selected game card", async () => {
    const { container } = render(<App />);
    fireEvent.click(await screen.findByRole("tab", { name: "Game Selection" }));
    const activeGameSection = await screen.findByRole("tabpanel", {
      name: "Game Selection",
    });

    fireEvent.click(await within(activeGameSection).findByRole("button", { name: /Astro Bot/i }));
    fireEvent.click(await screen.findByRole("tab", { name: "Game Selection" }));

    const refreshedGamePanel = await screen.findByRole("tabpanel", {
      name: "Game Selection",
    });

    const activeCard = within(refreshedGamePanel).getByRole("button", { name: /Astro Bot/i });
    expect(within(activeCard).getByText("Active")).toBeInTheDocument();
    expect(container.querySelector(".title-card-active .title-card-badge")).toBeTruthy();
  });

  it("loads all unearned trophies on demand and reuses the loaded state", async () => {
    render(<App />);

    expect(
      fetchMock.mock.calls.filter(([input]) => input === "/api/trophies/unearned"),
    ).toHaveLength(0);

    const unearnedPanel = await openAllUnearned();
    await waitFor(() => {
      expect(unearnedPanel.querySelectorAll(".all-unearned-row")).toHaveLength(4);
    });
    expect(within(unearnedPanel).getByText(/All unearned trophies/i)).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.filter(([input]) => input === "/api/trophies/unearned"),
    ).toHaveLength(1);

    fireEvent.click(screen.getByRole("tab", { name: "Game Selection" }));
    fireEvent.click(screen.getByRole("tab", { name: "All Unearned" }));

    expect(
      fetchMock.mock.calls.filter(([input]) => input === "/api/trophies/unearned"),
    ).toHaveLength(1);
  });

  it("sorts the all unearned list locally with the setup-style dropdown", async () => {
    render(<App />);

    const unearnedPanel = await openAllUnearned();
    const sortSelect = within(unearnedPanel).getByLabelText(
      "All unearned sort order",
    ) as HTMLSelectElement;
    const getVisibleNames = () =>
      Array.from(unearnedPanel.querySelectorAll(".all-unearned-row h3")).map((node) => node.textContent);

    await waitFor(() => {
      expect(getVisibleNames()).toHaveLength(4);
    });
    expect(sortSelect.closest(".select-field-control")).not.toBeNull();
    expect(getVisibleNames()).toEqual([
      "Rainy Day",
      "Galaxy Champion",
      "Best in Show",
      "Mystery Signal",
    ]);

    fireEvent.change(sortSelect, { target: { value: "hardestFirst" } });
    expect(getVisibleNames()).toEqual([
      "Best in Show",
      "Galaxy Champion",
      "Rainy Day",
      "Mystery Signal",
    ]);

    fireEvent.change(sortSelect, { target: { value: "titleAsc" } });
    expect(getVisibleNames()).toEqual([
      "Galaxy Champion",
      "Mystery Signal",
      "Rainy Day",
      "Best in Show",
    ]);

    fireEvent.change(sortSelect, { target: { value: "recentlyActiveTitle" } });
    expect(getVisibleNames()).toEqual([
      "Rainy Day",
      "Best in Show",
      "Galaxy Champion",
      "Mystery Signal",
    ]);

    expect(
      fetchMock.mock.calls.filter(([input]) => input === "/api/trophies/unearned"),
    ).toHaveLength(1);
  });

  it("updates the target trophy from the all unearned list without changing the active title", async () => {
    render(<App />);

    const previousSelectedTitleId = activeGame.selectedNpCommunicationId;
    const unearnedPanel = await openAllUnearned();
    const galaxyRow = await within(unearnedPanel).findByRole("button", {
      name: /Galaxy Champion/i,
    });

    fireEvent.click(galaxyRow);

    await waitFor(() => {
      expect(targetsByTitle.NPWR2?.trophyId).toBe(2);
    });

    expect(within(unearnedPanel).getByText("Current target")).toBeInTheDocument();
    expect(activeGame.selectedNpCommunicationId).toBe(previousSelectedTitleId);
  });

  it("does not refetch all unearned trophies when refresh all is used", async () => {
    render(<App />);

    await openAllUnearned();
    expect(
      fetchMock.mock.calls.filter(([input]) => input === "/api/trophies/unearned"),
    ).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Refresh all" }));

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.filter(([input]) => input === "/api/trophies/summary"),
      ).toHaveLength(2);
    });
    expect(
      fetchMock.mock.calls.filter(([input]) => input === "/api/trophies/unearned"),
    ).toHaveLength(1);
  });
});
