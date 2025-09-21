#!/usr/bin/env node

import { build } from "esbuild";
import { rm, mkdir, readdir, stat, copyFile } from "node:fs/promises";
import path from "node:path";

const projectRoot = process.cwd();
const srcDirectory = path.join(projectRoot, "src");
const distDirectory = path.join(projectRoot, "dist");
const publicDirectory = path.join(projectRoot, "public");

async function pathExists(targetPath) {
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

function resolveEntry(relativePath) {
  const entryPath = path.join(srcDirectory, relativePath);
  return { entryPath, relativePath };
}

async function collectEntries() {
  const candidates = [
    resolveEntry(path.join("background", "index.ts")),
    resolveEntry(path.join("popup", "index.tsx")),
    resolveEntry(path.join("options", "settings.tsx"))
  ];

  const entries = {};

  for (const candidate of candidates) {
    if (await pathExists(candidate.entryPath)) {
      const outputKey = candidate.relativePath.replace(/\\.tsx?$/, "");
      entries[outputKey] = candidate.entryPath;
    }
  }

  return entries;
}

async function copyDirectory(source, destination) {
  await mkdir(destination, { recursive: true });
  const entries = await readdir(source, { withFileTypes: true });

  for (const entry of entries) {
    const sourcePath = path.join(source, entry.name);
    const destinationPath = path.join(destination, entry.name);

    if (entry.isDirectory()) {
      await copyDirectory(sourcePath, destinationPath);
    } else if (entry.isFile()) {
      await mkdir(path.dirname(destinationPath), { recursive: true });
      await copyFile(sourcePath, destinationPath);
    }
  }
}

async function copyPublicAssets() {
  if (!(await pathExists(publicDirectory))) {
    return;
  }

  const assets = await readdir(publicDirectory, { withFileTypes: true });

  for (const asset of assets) {
    const source = path.join(publicDirectory, asset.name);

    if (asset.isDirectory()) {
      const destination = path.join(distDirectory, asset.name);
      await copyDirectory(source, destination);
    } else if (asset.isFile()) {
      if (asset.name === "popup.html") {
        const popupDestination = path.join(distDirectory, "popup");
        await mkdir(popupDestination, { recursive: true });
        await copyFile(source, path.join(popupDestination, "index.html"));
      } else {
        const destination = path.join(distDirectory, asset.name);
        await mkdir(path.dirname(destination), { recursive: true });
        await copyFile(source, destination);
      }
    }
  }
}

async function run() {
  const entryPoints = await collectEntries();

  if (Object.keys(entryPoints).length === 0) {
    console.warn("No build entry points detected.");
    return;
  }

  await rm(distDirectory, { recursive: true, force: true });

  await build({
    entryPoints,
    outdir: distDirectory,
    bundle: true,
    format: "esm",
    platform: "browser",
    target: ["chrome110", "firefox115"],
    sourcemap: true,
    logLevel: "info",
    chunkNames: "chunks/[name]-[hash]",
    assetNames: "assets/[name]-[hash]",
    tsconfig: path.join(projectRoot, "tsconfig.json")
  });

  await copyPublicAssets();

  console.log(`Bundled ${Object.keys(entryPoints).length} entry point(s) into ${path.relative(projectRoot, distDirectory)}`);
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
