#!/usr/bin/env node

import { spawn } from "node:child_process";
import process from "node:process";

const defaultPreviewPort = "4173";
const defaultDebugPort = "9222";
const previewPort = process.env.PREVIEW_PORT ?? defaultPreviewPort;
const debugPort = process.env.DEBUG_PORT ?? defaultDebugPort;

function spawnProcess(command, args, options = {}) {
  const child = spawn(command, args, { stdio: "inherit", ...options });

  child.on("error", (error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Failed to launch ${command}: ${message}`);
  });

  return child;
}

function waitFor(child) {
  return new Promise((resolve, reject) => {
    child.once("exit", (code, signal) => resolve({ code, signal }));
    child.once("error", (error) => reject(error));
  });
}

async function main() {
  const serveEnv = { ...process.env, PREVIEW_PORT: previewPort };
  const serve = spawnProcess("npm", ["run", "serve", "--silent"], { env: serveEnv });

  console.log("");
  console.log(`Launching headless Chromium with remote debugging on port ${debugPort}...`);
  console.log("Use chrome://inspect in your host browser and add a target with the exposed port to attach to the session.");

  let chromiumExitCode = 0;
  const chromiumArgs = [
    "--no-sandbox",
    "--headless=new",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--remote-debugging-address=0.0.0.0",
    `--remote-debugging-port=${debugPort}`,
    "--remote-allow-origins=*",
  ];
  const chromium = spawnProcess("chromium", chromiumArgs);

  const serveExitPromise = waitFor(serve);
  const chromiumExitPromise = waitFor(chromium).then(({ code, signal }) => {
    if (signal && signal !== "SIGTERM" && signal !== "SIGINT") {
      console.error(`Chromium exited due to signal ${signal}`);
    }

    if (typeof code === "number" && code !== 0) {
      console.error(`Chromium exited with status ${code}`);
      chromiumExitCode = code;
      if (!serve.killed) {
        console.error("Stopping preview server because Chromium is no longer running.");
        serve.kill("SIGTERM");
      }
    }
  }).catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    if (!serve.killed) {
      serve.kill("SIGTERM");
    }
    chromiumExitCode = 1;
  });

  const stopProcesses = () => {
    if (!serve.killed) {
      serve.kill("SIGTERM");
    }

    if (!chromium.killed) {
      chromium.kill("SIGTERM");
    }
  };

  process.once("SIGINT", stopProcesses);
  process.once("SIGTERM", stopProcesses);

  const { code: serveCode, signal: serveSignal } = await serveExitPromise.catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    return { code: 1, signal: null };
  });

  stopProcesses();
  await chromiumExitPromise;

  if (typeof serveSignal === "string" && (serveSignal === "SIGINT" || serveSignal === "SIGTERM")) {
    process.exit(0);
  }

  if (typeof serveCode === "number" && serveCode !== 0) {
    process.exit(serveCode);
  }

  if (chromiumExitCode !== 0) {
    process.exit(chromiumExitCode);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
