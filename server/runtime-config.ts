import { homedir } from "node:os";
import { resolve } from "node:path";

const DATABASE_FILENAME = "streamer-tools.sqlite";
const CREDENTIALS_DIRECTORY = ".streamer-tools";
const CREDENTIALS_FILENAME = "psn-credentials.json";

const readEnvValue = (
  env: NodeJS.ProcessEnv,
  key: "APP_DATA_DIR" | "APP_DB_PATH" | "PSN_CREDENTIALS_PATH",
) => {
  const value = env[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
};

export const resolveAppDataDirectory = (env: NodeJS.ProcessEnv = process.env) =>
  readEnvValue(env, "APP_DATA_DIR");

export const resolveDatabasePath = ({
  env = process.env,
  cwd = process.cwd(),
}: {
  env?: NodeJS.ProcessEnv;
  cwd?: string;
} = {}) => {
  const explicitPath = readEnvValue(env, "APP_DB_PATH");

  if (explicitPath) {
    return explicitPath;
  }

  const appDataDirectory = resolveAppDataDirectory(env);

  if (appDataDirectory) {
    return resolve(appDataDirectory, DATABASE_FILENAME);
  }

  return resolve(cwd, DATABASE_FILENAME);
};

export const resolvePsnCredentialsPath = ({
  env = process.env,
  homeDirectory = homedir(),
}: {
  env?: NodeJS.ProcessEnv;
  homeDirectory?: string;
} = {}) => {
  const explicitPath = readEnvValue(env, "PSN_CREDENTIALS_PATH");

  if (explicitPath) {
    return explicitPath;
  }

  const appDataDirectory = resolveAppDataDirectory(env);

  if (appDataDirectory) {
    return resolve(appDataDirectory, CREDENTIALS_FILENAME);
  }

  return resolve(homeDirectory, CREDENTIALS_DIRECTORY, CREDENTIALS_FILENAME);
};
