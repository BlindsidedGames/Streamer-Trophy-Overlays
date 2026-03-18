import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";

import { AppError } from "./errors.js";
import { resolvePsnCredentialsPath } from "./runtime-config.js";

import type { PsnTokenStatusResponse } from "../shared/contracts.js";

type PersistedPsnCredentials = {
  token: string;
  updatedAt: string;
};

export const getDefaultPsnCredentialsPath = () => resolvePsnCredentialsPath();

const DIRECTORY_MODE = 0o700;
const FILE_MODE = 0o600;

export class PsnCredentialStore {
  constructor(private readonly credentialsPath = getDefaultPsnCredentialsPath()) {}

  getStatus(): PsnTokenStatusResponse {
    const credentials = this.readCredentials();

    return {
      configured: Boolean(credentials?.token),
      storage: "local-file",
      updatedAt: credentials?.updatedAt ?? null,
    };
  }

  getToken(): string | null {
    return this.readCredentials()?.token ?? null;
  }

  save(token: string): PsnTokenStatusResponse {
    const normalizedToken = token.trim();

    if (!normalizedToken) {
      throw new AppError(
        "invalid_request",
        "A PSN token is required before you can save it.",
      );
    }

    const nextCredentials: PersistedPsnCredentials = {
      token: normalizedToken,
      updatedAt: new Date().toISOString(),
    };

    const directoryPath = dirname(this.credentialsPath);
    mkdirSync(directoryPath, {
      recursive: true,
      mode: DIRECTORY_MODE,
    });

    writeFileSync(
      this.credentialsPath,
      JSON.stringify(nextCredentials, null, 2),
      {
        encoding: "utf8",
        mode: FILE_MODE,
      },
    );

    this.applyPermissions(directoryPath, DIRECTORY_MODE);
    this.applyPermissions(this.credentialsPath, FILE_MODE);

    return {
      configured: true,
      storage: "local-file",
      updatedAt: nextCredentials.updatedAt,
    };
  }

  clear(): PsnTokenStatusResponse {
    rmSync(this.credentialsPath, { force: true });

    return {
      configured: false,
      storage: "local-file",
      updatedAt: null,
    };
  }

  private readCredentials(): PersistedPsnCredentials | null {
    if (!existsSync(this.credentialsPath)) {
      return null;
    }

    try {
      const raw = readFileSync(this.credentialsPath, "utf8");
      const parsed = JSON.parse(raw) as Partial<PersistedPsnCredentials>;
      const token = typeof parsed.token === "string" ? parsed.token.trim() : "";
      const updatedAt =
        typeof parsed.updatedAt === "string" && parsed.updatedAt
          ? parsed.updatedAt
          : null;

      if (!token || !updatedAt) {
        return null;
      }

      return {
        token,
        updatedAt,
      };
    } catch {
      return null;
    }
  }

  private applyPermissions(path: string, mode: number) {
    try {
      chmodSync(path, mode);
    } catch {
      // Windows can reject POSIX chmod semantics; best effort is enough here.
    }
  }
}
