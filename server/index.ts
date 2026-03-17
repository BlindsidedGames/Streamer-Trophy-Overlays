import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";

import { createApp } from "./app.js";
import { attachHostedUi, resolveHostedUiPaths } from "./hosted-ui.js";

const runtimeDirectory = dirname(fileURLToPath(import.meta.url));
const rootCandidates = [
  process.cwd(),
  resolve(runtimeDirectory, ".."),
  resolve(runtimeDirectory, "../.."),
];
const { clientDirectory, envPath, imageDirectory } = resolveHostedUiPaths(rootCandidates);

if (envPath) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
}

const port = Number(process.env.PORT ?? 4318);
const app = createApp();
const hostedUiAttached = attachHostedUi(app, { clientDirectory, imageDirectory });

app.listen(port, () => {
  const baseUrl = `http://localhost:${port}`;
  console.log(
    hostedUiAttached
      ? `PSN trophy suite listening on ${baseUrl}`
      : `PSN trophy API listening on ${baseUrl}`,
  );
});
