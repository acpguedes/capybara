#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import process from "node:process";

const projectRoot = process.cwd();
const distDirectory = path.join(projectRoot, "dist");
const defaultPort = 4173;
const port = Number.parseInt(process.env.PREVIEW_PORT ?? String(defaultPort), 10);
const host = "0.0.0.0";

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "application/javascript; charset=utf-8"],
  [".mjs", "application/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".gif", "image/gif"],
  [".ico", "image/x-icon"],
  [".map", "application/json; charset=utf-8"],
]);

function runBuild() {
  return new Promise((resolve, reject) => {
    const build = spawn("npm", ["run", "build", "--silent"], {
      cwd: projectRoot,
      stdio: "inherit",
      env: process.env,
    });

    build.on("error", (error) => {
      reject(new Error(`Failed to launch build: ${error instanceof Error ? error.message : String(error)}`));
    });

    build.on("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`Build terminated by signal ${signal}`));
        return;
      }

      if (typeof code === "number" && code !== 0) {
        reject(new Error(`Build exited with status ${code}`));
        return;
      }

      resolve();
    });
  });
}

async function resolveFilePath(requestedPath) {
  const normalizedPath = path.posix.normalize(requestedPath);
  const relativePath = normalizedPath.startsWith("/")
    ? normalizedPath.slice(1)
    : normalizedPath;
  const resolvedPath = path.resolve(distDirectory, relativePath);

  const relativeToDist = path.relative(distDirectory, resolvedPath);

  if (relativeToDist.startsWith("..") || path.isAbsolute(relativeToDist)) {
    return null;
  }

  let candidatePath = resolvedPath;
  let fileStats = await stat(candidatePath).catch(() => null);

  if (fileStats?.isDirectory()) {
    const indexPath = path.join(candidatePath, "index.html");
    const indexStats = await stat(indexPath).catch(() => null);

    if (indexStats?.isFile()) {
      return indexPath;
    }

    return null;
  }

  if (fileStats?.isFile()) {
    return candidatePath;
  }

  const htmlFallback = `${resolvedPath}.html`;
  const htmlStats = await stat(htmlFallback).catch(() => null);

  if (htmlStats?.isFile()) {
    return htmlFallback;
  }

  return null;
}

async function handleRequest(request, response) {
  const method = request.method?.toUpperCase();

  if (method && method !== "GET" && method !== "HEAD") {
    response.statusCode = 405;
    response.setHeader("Allow", "GET, HEAD");
    response.end("Method Not Allowed");
    return;
  }

  const fallbackHost = `localhost:${Number.isFinite(port) ? port : defaultPort}`;
  const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host ?? fallbackHost}`);

  if (requestUrl.pathname === "/") {
    response.statusCode = 302;
    response.setHeader("Location", "/popup/");
    response.end();
    return;
  }

  const filePath = await resolveFilePath(requestUrl.pathname).catch(() => null);

  if (!filePath) {
    response.statusCode = 404;
    response.end("Not Found");
    return;
  }

  const fileExtension = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes.get(fileExtension) ?? "application/octet-stream";

  response.statusCode = 200;
  response.setHeader("Content-Type", contentType);
  response.setHeader("Cache-Control", "no-store");

  if (method === "HEAD") {
    response.end();
    return;
  }

  const stream = createReadStream(filePath);

  stream.on("error", (error) => {
    response.destroy(error);
  });

  stream.pipe(response);
}

async function main() {
  if (!Number.isFinite(port)) {
    console.warn(`Invalid PREVIEW_PORT value: ${process.env.PREVIEW_PORT}. Falling back to ${defaultPort}.`);
  }

  await runBuild();

  const server = http.createServer((request, response) => {
    handleRequest(request, response).catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      response.statusCode = 500;
      response.setHeader("Content-Type", "text/plain; charset=utf-8");
      response.end(`Internal Server Error\n${message}`);
    });
  });

  server.listen(Number.isFinite(port) ? port : defaultPort, host, () => {
    const listenPort = Number.isFinite(port) ? port : defaultPort;
    console.log("");
    console.log(`Capybara preview server listening on http://localhost:${listenPort}`);
    console.log(`Popup UI: http://localhost:${listenPort}/popup/`);
    console.log(`Options UI: http://localhost:${listenPort}/options/`);
    console.log("Press Ctrl+C to stop the server.");
  });

  const closeServer = () => {
    server.close(() => {
      process.exit(0);
    });
  };

  process.on("SIGINT", closeServer);
  process.on("SIGTERM", closeServer);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
