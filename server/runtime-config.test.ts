import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  resolveAppDataDirectory,
  resolveDatabasePath,
  resolvePsnCredentialsPath,
} from "./runtime-config.js";

describe("runtime config path resolution", () => {
  it("prefers APP_DB_PATH over APP_DATA_DIR and cwd defaults", () => {
    expect(
      resolveDatabasePath({
        env: {
          APP_DB_PATH: "D:/custom/streamer-tools.sqlite",
          APP_DATA_DIR: "D:/app-data",
        },
        cwd: "C:/repo",
      }),
    ).toBe("D:/custom/streamer-tools.sqlite");
  });

  it("uses APP_DATA_DIR for the default database and credentials locations", () => {
    const env = { APP_DATA_DIR: "D:/Streamer Tools/Data" };

    expect(resolveAppDataDirectory(env)).toBe("D:/Streamer Tools/Data");
    expect(resolveDatabasePath({ env, cwd: "C:/repo" })).toBe(
      resolve("D:/Streamer Tools/Data", "streamer-tools.sqlite"),
    );
    expect(resolvePsnCredentialsPath({ env, homeDirectory: "C:/Users/Test" })).toBe(
      resolve("D:/Streamer Tools/Data", "psn-credentials.json"),
    );
  });

  it("falls back to the source-run locations when no desktop data directory is configured", () => {
    expect(resolveDatabasePath({ env: {}, cwd: "C:/repo" })).toBe(
      resolve("C:/repo", "streamer-tools.sqlite"),
    );
    expect(resolvePsnCredentialsPath({ env: {}, homeDirectory: "C:/Users/Test" })).toBe(
      resolve("C:/Users/Test", ".streamer-tools", "psn-credentials.json"),
    );
  });

  it("prefers PSN_CREDENTIALS_PATH over APP_DATA_DIR for local credentials", () => {
    expect(
      resolvePsnCredentialsPath({
        env: {
          APP_DATA_DIR: "D:/Streamer Tools/Data",
          PSN_CREDENTIALS_PATH: "D:/Secrets/psn-credentials.json",
        },
        homeDirectory: "C:/Users/Test",
      }),
    ).toBe("D:/Secrets/psn-credentials.json");
  });
});
