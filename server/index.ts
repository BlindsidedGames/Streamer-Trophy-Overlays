import { startServerRuntime } from "./runtime.js";

const resolveStartupErrorMessage = (error: unknown) => {
  if (typeof error === "object" && error !== null) {
    const code =
      "code" in error && typeof error.code === "string" ? error.code : null;
    const message =
      "message" in error && typeof error.message === "string"
        ? error.message
        : "Unknown startup failure.";

    if (code === "EADDRINUSE") {
      return "Port 4318 is already in use. Close the conflicting app or change PORT before retrying.";
    }

    return message;
  }

  return "Unknown startup failure.";
};

let runtime: Awaited<ReturnType<typeof startServerRuntime>> | null = null;
let shuttingDown = false;

const stopRuntime = async () => {
  if (!runtime) {
    return;
  }

  const nextRuntime = runtime;
  runtime = null;
  await nextRuntime.stop();
};

const shutdown = async (exitCode = 0) => {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  try {
    await stopRuntime();
  } finally {
    process.exit(exitCode);
  }
};

const registerSignalHandlers = () => {
  const handleSignal = () => {
    void shutdown(0);
  };

  process.once("SIGINT", handleSignal);
  process.once("SIGTERM", handleSignal);
};

const main = async () => {
  try {
    runtime = await startServerRuntime();
    registerSignalHandlers();
    console.log(
      runtime.hostedUiAttached
        ? `PSN trophy suite listening on ${runtime.baseUrl}`
        : `PSN trophy API listening on ${runtime.baseUrl}`,
    );
    process.send?.({
      type: "server-ready",
      baseUrl: runtime.baseUrl,
      hostedUiAttached: runtime.hostedUiAttached,
    });
  } catch (error) {
    const message = resolveStartupErrorMessage(error);
    console.error(message);
    process.send?.({
      type: "startup-error",
      message,
      code:
        typeof error === "object" && error !== null && "code" in error
          ? error.code
          : undefined,
    });
    process.exit(1);
  }
};

void main();
