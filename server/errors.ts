import type { ApiErrorPayload } from "../shared/contracts.js";

export class AppError extends Error {
  readonly type: ApiErrorPayload["type"];
  readonly details?: unknown;

  constructor(type: ApiErrorPayload["type"], message: string, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.type = type;
    this.details = details;
  }
}

export const toApiErrorPayload = (error: unknown): ApiErrorPayload => {
  if (error instanceof AppError) {
    return {
      type: error.type,
      message: error.message,
      details: error.details,
    };
  }

  if (error instanceof Error) {
    return {
      type: classifyError(error.message),
      message: error.message,
    };
  }

  return {
    type: "unknown",
    message: "Unknown error",
    details: error,
  };
};

const classifyError = (message: string): ApiErrorPayload["type"] => {
  const normalized = message.toLowerCase();

  if (
    normalized.includes("required") ||
    normalized.includes("invalid") ||
    normalized.includes("missing token")
  ) {
    return "invalid_request";
  }

  if (normalized.includes("npsso") || normalized.includes("access code")) {
    return "psn_auth";
  }

  if (
    normalized.includes("privacy") ||
    normalized.includes("forbidden") ||
    normalized.includes("not authorized") ||
    normalized.includes("not permitted")
  ) {
    return "psn_privacy";
  }

  if (
    normalized.includes("network") ||
    normalized.includes("timeout") ||
    normalized.includes("fetch") ||
    normalized.includes("unexpected")
  ) {
    return "psn_upstream";
  }

  return "unknown";
};
