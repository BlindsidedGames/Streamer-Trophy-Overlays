import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { PsnCredentialStore } from "./psn-credential-store.js";

const tempPaths: string[] = [];

afterEach(() => {
  while (tempPaths.length > 0) {
    const next = tempPaths.pop();
    if (next) {
      rmSync(next, { recursive: true, force: true });
    }
  }
});

describe("PsnCredentialStore", () => {
  it("saves, reloads, and clears the local token file", () => {
    const directory = mkdtempSync(join(tmpdir(), "streamer-tools-credentials-"));
    tempPaths.push(directory);
    const credentialsPath = join(directory, "psn-credentials.json");

    const store = new PsnCredentialStore(credentialsPath);

    expect(store.getStatus()).toEqual({
      configured: false,
      storage: "local-file",
      updatedAt: null,
    });

    const saved = store.save("  secret-token  ");
    expect(saved.configured).toBe(true);
    expect(saved.updatedAt).toBeTruthy();
    expect(existsSync(credentialsPath)).toBe(true);

    const persisted = JSON.parse(readFileSync(credentialsPath, "utf8")) as {
      token: string;
      updatedAt: string;
    };
    expect(persisted.token).toBe("secret-token");
    expect(persisted.updatedAt).toBe(saved.updatedAt);

    const reopened = new PsnCredentialStore(credentialsPath);
    expect(reopened.getToken()).toBe("secret-token");
    expect(reopened.getStatus()).toEqual(saved);

    expect(reopened.clear()).toEqual({
      configured: false,
      storage: "local-file",
      updatedAt: null,
    });
    expect(existsSync(credentialsPath)).toBe(false);
  });
});
