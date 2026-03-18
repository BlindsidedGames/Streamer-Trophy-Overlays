import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, parse, resolve } from "node:path";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const projectRoot = resolve(process.cwd());
const supportedTargets = new Set(["nsis", "portable"]);
const requestedTargets = process.argv.slice(2);
const targets = requestedTargets.length > 0 ? requestedTargets : ["nsis", "portable"];
const needsStage = /\s/.test(projectRoot);
const stagingRoot = join(tmpdir(), "streamer-tools-win-build");
const stagedProjectRoot = join(stagingRoot, "app");
const releaseDirectoryName = "release";

for (const target of targets) {
  if (!supportedTargets.has(target)) {
    throw new Error(
      `Unsupported Windows packaging target "${target}". Supported targets: ${Array.from(supportedTargets).join(", ")}.`,
    );
  }
}

const filesToStage = [
  "package.json",
  "package-lock.json",
];

const directoriesToStage = [
  "build",
  "dist",
  "img",
  "build-assets",
  "node_modules",
];

const runCommand = (command, args, cwd) =>
  new Promise((resolveCommand, rejectCommand) => {
    const child = spawn(command, args, {
      cwd,
      stdio: "inherit",
      shell: true,
      env: process.env,
    });

    child.once("exit", (code) => {
      if (code === 0) {
        resolveCommand();
        return;
      }

      rejectCommand(new Error(`${command} ${args.join(" ")} exited with code ${code ?? 1}.`));
    });
    child.once("error", rejectCommand);
  });

const isRetryableFsError = (error) =>
  error != null &&
  typeof error === "object" &&
  "code" in error &&
  (error.code === "EPERM" || error.code === "EBUSY");

const replacePathWithRetry = async (source, destination) => {
  let lastError;

  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      rmSync(destination, { recursive: true, force: true });
      cpSync(source, destination, { recursive: true, force: true });
      return;
    } catch (error) {
      lastError = error;

      if (!isRetryableFsError(error) || attempt === 9) {
        throw error;
      }

      await delay(500);
    }
  }

  throw lastError;
};

const copyPathWithFallback = async (source, destination) => {
  try {
    await replacePathWithRetry(source, destination);
    return destination;
  } catch (error) {
    if (!isRetryableFsError(error)) {
      throw error;
    }

    const sourceIsDirectory = statSync(source).isDirectory();
    const parsedDestination = parse(destination);
    const fallbackDestination = sourceIsDirectory
      ? `${destination}-rebuilt`
      : join(
          parsedDestination.dir,
          `${parsedDestination.name}-rebuilt${parsedDestination.ext}`,
        );

    rmSync(fallbackDestination, { recursive: true, force: true });
    cpSync(source, fallbackDestination, { recursive: true, force: true });
    console.warn(
      `Could not replace ${destination} because Windows is holding a lock on it. Wrote the refreshed artifact to ${fallbackDestination} instead.`,
    );
    return fallbackDestination;
  }
};

const stageProject = () => {
  rmSync(stagingRoot, { recursive: true, force: true });
  mkdirSync(stagedProjectRoot, { recursive: true });

  for (const file of filesToStage) {
    const source = join(projectRoot, file);

    if (existsSync(source)) {
      cpSync(source, join(stagedProjectRoot, file));
    }
  }

  for (const directory of directoriesToStage) {
    const source = join(projectRoot, directory);

    if (existsSync(source)) {
      cpSync(source, join(stagedProjectRoot, directory), { recursive: true });
    }
  }

  return stagedProjectRoot;
};

const copyReleaseArtifactsBack = async (packagingRoot) => {
  const stagedReleaseRoot = join(packagingRoot, releaseDirectoryName);

  if (!existsSync(stagedReleaseRoot)) {
    return;
  }

  const releaseRoot = join(projectRoot, releaseDirectoryName);
  rmSync(releaseRoot, { recursive: true, force: true });
  mkdirSync(releaseRoot, { recursive: true });

  for (const entry of readdirSync(stagedReleaseRoot)) {
    const source = join(stagedReleaseRoot, entry);
    const destination = join(releaseRoot, entry);
    await copyPathWithFallback(source, destination);
  }
};

const cleanReleaseDirectory = (packagingRoot) => {
  rmSync(join(packagingRoot, releaseDirectoryName), { recursive: true, force: true });
};

const cleanupStage = () => {
  if (!needsStage) {
    return;
  }

  rmSync(stagingRoot, { recursive: true, force: true });
};

const packagingRoot = needsStage ? stageProject() : projectRoot;

if (needsStage) {
  console.log(`Packaging through ${packagingRoot} to avoid native rebuild failures from spaced paths.`);
}

try {
  await runCommand("npm", ["run", "electron:install-app-deps"], packagingRoot);
  const builderArgs = ["electron-builder", "--win", ...targets];
  try {
    await runCommand("npx", builderArgs, packagingRoot);
  } catch (error) {
    console.warn(
      "Standard Windows packaging failed. Retrying without executable resource editing for an unsigned local build.",
    );
    cleanReleaseDirectory(packagingRoot);
    await runCommand(
      "npx",
      [...builderArgs, "-c.win.signAndEditExecutable=false"],
      packagingRoot,
    );
  }
  await copyReleaseArtifactsBack(packagingRoot);
} finally {
  cleanupStage();
}
