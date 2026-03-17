// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
  type UpdateTargetTrophyRequest,
} from "../shared/contracts.js";
import { App } from "./App.js";

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
      progress: 100,
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
      lastUpdated: "2026-03-17T00:00:00Z",
      hasTrophyGroups: false,
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
  let fetchMock: ReturnType<typeof vi.fn>;

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

  beforeEach(() => {
    activeGame = createDefaultActiveGameSelection();
    settings = createDefaultOverlaySettings();
    targetsByTitle = {};
    tokenStatus = {
      configured: true,
      storage: "local-file",
      updatedAt: "2026-03-17T00:00:00Z",
    };

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

      if (input.startsWith("/api/trophies/search")) {
        const query = new URL(`http://localhost${input}`).searchParams.get("q") ?? "";
        const results: TitleSearchResponse = {
          results: summary.titles
            .filter((title) => title.titleName.toLowerCase().includes(query.toLowerCase()))
            .map((title) => ({
              npCommunicationId: title.npCommunicationId,
              titleName: title.titleName,
              platform: title.platform,
              iconUrl: title.iconUrl,
              progress: title.progress,
              lastUpdated: title.lastUpdated,
            })),
          nextOffset: null,
          totalItemCount: query ? 1 : 0,
        };

        return {
          ok: true,
          json: async () => results,
        };
      }

      if (input === "/api/settings") {
        if (method === "PUT") {
          settings = JSON.parse(String(init?.body));
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
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("saves and clears the local token without rendering the stored value back", async () => {
    render(<App />);

    const tokenField = (await screen.findByLabelText("PSN token")) as HTMLInputElement;
    const summaryCallsBefore = fetchMock.mock.calls.filter(
      ([input]) => input === "/api/trophies/summary",
    ).length;

    fireEvent.change(tokenField, { target: { value: "super-secret-token" } });
    fireEvent.click(screen.getByRole("button", { name: "Save token" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/psn-token",
        expect.objectContaining({ method: "PUT" }),
      );
    });
    await waitFor(() => {
      expect(tokenField).toHaveValue("");
    });
    await waitFor(() => {
      const summaryCallsAfter = fetchMock.mock.calls.filter(
        ([input]) => input === "/api/trophies/summary",
      ).length;
      expect(summaryCallsAfter).toBeGreaterThan(summaryCallsBefore);
    });

    fireEvent.click(screen.getByRole("button", { name: "Clear token" }));

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

  it("switches the active title from the visual picker and loads its trophies", async () => {
    const { container } = render(<App />);

    const astroCard = await screen.findByRole("button", { name: /Astro Bot/i });
    fireEvent.click(astroCard);

    expect(await screen.findByText("Galaxy Champion")).toBeInTheDocument();
    expect(container.textContent).toContain("Unearned");
    expect(container.textContent).not.toContain("Open");
    expect(container.textContent).not.toContain("Set target");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/active-game",
      expect.objectContaining({ method: "PUT" }),
    );
  });

  it("pins a trophy as the current target and exposes the clear action", async () => {
    render(<App />);

    const trophyButton = await screen.findByRole("button", { name: /Best in Show/i });
    fireEvent.click(trophyButton);

    expect(screen.queryByRole("heading", { name: "Featured on stream" })).not.toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Clear target" })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/target-trophy",
      expect.objectContaining({ method: "PUT" }),
    );
  });

  it("splits the trophy browser into unearned and earned sections", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getAllByText("Unearned trophies").length).toBeGreaterThan(0);
    });
    expect(screen.getAllByText("Earned trophies").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Family Photo").length).toBeGreaterThan(0);
  });

  it("keeps clear target in the trophy browser header and removes empty targets from loop data", async () => {
    settings = {
      ...createDefaultOverlaySettings(),
      showTargetTrophyInLoop: true,
    };

    const { container } = render(<App />);

    const [trophyButton] = await within(container).findAllByRole("button", {
      name: /Best in Show/i,
    });
    fireEvent.click(trophyButton);

    const trophyBrowserPanel = screen
      .getAllByText("Trophy Browser")
      .map((node) => node.closest(".panel"))
      .find(
        (panel): panel is HTMLElement =>
          Boolean(panel) && within(panel as HTMLElement).queryByRole("button", { name: "Clear target" }) !== null,
      );
    expect(trophyBrowserPanel).not.toBeNull();
    if (!trophyBrowserPanel) {
      throw new Error("Expected trophy browser panel with clear target action");
    }
    expect(within(trophyBrowserPanel).getByRole("button", { name: "Clear target" })).toBeInTheDocument();

    fireEvent.click(within(trophyBrowserPanel).getByRole("button", { name: "Clear target" }));

    await waitFor(() => {
      expect(screen.getAllByText("No target trophy selected").length).toBeGreaterThan(0);
    });

    expect(screen.queryByText("Pinned target")).not.toBeInTheDocument();
  });

  it("renders target trophy tag settings and updates the dashboard preview immediately", async () => {
    const { container } = render(<App />);

    const textField = await within(container).findByLabelText("Target trophy tag text");
    const toggle = within(container).getByLabelText("Show target trophy tag");

    expect(textField).toHaveValue("Current Target");
    expect(screen.getAllByText("Current Target").length).toBeGreaterThan(0);

    fireEvent.change(textField, { target: { value: "Featured Trophy" } });

    await waitFor(() => {
      expect(screen.getAllByText("Featured Trophy").length).toBeGreaterThan(0);
    });

    fireEvent.click(toggle);

    await waitFor(() => {
      expect(screen.queryAllByText("Featured Trophy")).toHaveLength(0);
    });
  });

  it("stacks the live previews with target trophy first and omits timestamps in title cards", async () => {
    const { container } = render(<App />);

    await waitFor(() => {
      expect(container.querySelectorAll(".live-preview-grid .preview-card")).toHaveLength(2);
      expect(container.querySelectorAll(".title-card .title-stats").length).toBeGreaterThan(0);
    });

    const previewCaptions = Array.from(
      container.querySelectorAll(".live-preview-grid .preview-card .section-caption"),
    ).map((node) => node.textContent?.trim());

    expect(previewCaptions).toEqual(["Target trophy", "Main HUD"]);

    const titleStats = Array.from(container.querySelectorAll(".title-card .title-stats")).map(
      (node) => node.textContent?.trim(),
    );

    expect(titleStats).toContain("100% complete");
    expect(titleStats).toContain("75% complete");
    expect(container.textContent).not.toContain("3/17/2026");
    expect(container.textContent).not.toContain("3/16/2026");
  });
});
