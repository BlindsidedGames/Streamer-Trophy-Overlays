import cors from "cors";
import express from "express";

import type {
  ActiveGameSelection,
  OverlaySettings,
  UpdatePsnTokenRequest,
  UpdateTargetTrophyRequest,
} from "../shared/contracts.js";
import { AppError, toApiErrorPayload } from "./errors.js";
import {
  RealOverlaySuiteService,
  type OverlaySuiteService,
} from "./overlay-suite-service.js";

export const createApp = (
  service: OverlaySuiteService = new RealOverlaySuiteService(),
) => {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.get("/api/health", (_request, response) => {
    response.json(service.getHealth());
  });

  app.get("/api/psn-token", (_request, response) => {
    response.json(service.getPsnTokenStatus());
  });

  app.put("/api/psn-token", (request, response) => {
    try {
      const payload = request.body as Partial<UpdatePsnTokenRequest>;
      const status = service.savePsnToken(String(payload.token ?? ""));
      response.json(status);
    } catch (error) {
      response.status(resolveErrorStatus(error)).json({ error: toApiErrorPayload(error) });
    }
  });

  app.delete("/api/psn-token", (_request, response) => {
    try {
      response.json(service.clearPsnToken());
    } catch (error) {
      response.status(resolveErrorStatus(error)).json({ error: toApiErrorPayload(error) });
    }
  });

  app.get("/api/trophies/summary", async (_request, response) => {
    try {
      const summary = await service.getSummary();
      response.json(summary);
    } catch (error) {
      response.status(500).json({
        profile: null,
        titles: [],
        meta: {
          fetchedAt: new Date().toISOString(),
          cached: false,
          warnings: [],
          partial: false,
          source: "psn-api",
        },
        error: toApiErrorPayload(error),
      });
    }
  });

  app.get("/api/trophies/search", async (request, response) => {
    try {
      const search = await service.searchTitles(
        String(request.query.q ?? ""),
        request.query.offset == null ? null : Number(request.query.offset),
        request.query.limit == null ? null : Number(request.query.limit),
      );
      response.json(search);
    } catch (error) {
      response.status(500).json({
        results: [],
        nextOffset: null,
        totalItemCount: 0,
        error: toApiErrorPayload(error),
      });
    }
  });

  app.get("/api/trophies/title/:npCommunicationId", async (request, response) => {
    try {
      const titleTrophies = await service.getTitleTrophies(
        request.params.npCommunicationId,
      );
      response.json(titleTrophies);
    } catch (error) {
      response.status(500).json({
        title: null,
        trophies: [],
        target: null,
        meta: {
          fetchedAt: new Date().toISOString(),
          cached: false,
          warnings: [],
          partial: false,
        },
        error: toApiErrorPayload(error),
      });
    }
  });

  app.get("/api/trophies/unearned", async (_request, response) => {
    try {
      const unearnedTrophies = await service.getUnearnedTrophies();
      response.json(unearnedTrophies);
    } catch (error) {
      response.status(500).json({
        trophies: [],
        meta: {
          fetchedAt: new Date().toISOString(),
          cached: false,
          warnings: [],
          partial: false,
        },
        error: toApiErrorPayload(error),
      });
    }
  });

  app.get("/api/settings", (_request, response) => {
    response.json(service.getSettings());
  });

  app.put("/api/settings", (request, response) => {
    try {
      const settings = service.updateSettings(request.body as OverlaySettings);
      response.json(settings);
    } catch (error) {
      response.status(500).json({ error: toApiErrorPayload(error) });
    }
  });

  app.get("/api/active-game", (_request, response) => {
    response.json(service.getActiveGame());
  });

  app.put("/api/active-game", (request, response) => {
    try {
      const activeGame = service.updateActiveGame(
        request.body as ActiveGameSelection,
      );
      response.json(activeGame);
    } catch (error) {
      response.status(500).json({ error: toApiErrorPayload(error) });
    }
  });

  app.put("/api/target-trophy", (request, response) => {
    try {
      const targetTrophy = service.updateTargetTrophy(
        request.body as UpdateTargetTrophyRequest,
      );
      response.json(targetTrophy);
    } catch (error) {
      response.status(500).json({ error: toApiErrorPayload(error) });
    }
  });

  app.get("/api/overlay-data", async (_request, response) => {
    try {
      const overlayData = await service.getOverlayData();
      response.json(overlayData);
    } catch (error) {
      const settings = service.getSettings();
      const targetTrophy = null;
      response.status(500).json({
        overall: null,
        currentGame: null,
        targetTrophy,
        display: {
          settings,
          loopOrder: settings.showTargetTrophyInLoop && targetTrophy
            ? ["overall", "currentGame", "targetTrophy"]
            : ["overall", "currentGame"],
          lastRefreshAt: new Date().toISOString(),
        },
        meta: {
          fetchedAt: new Date().toISOString(),
          cached: false,
          warnings: [],
          partial: false,
        },
        error: toApiErrorPayload(error),
      });
    }
  });

  return app;
};

const resolveErrorStatus = (error: unknown) => {
  if (error instanceof AppError && error.type === "invalid_request") {
    return 400;
  }

  return 500;
};
