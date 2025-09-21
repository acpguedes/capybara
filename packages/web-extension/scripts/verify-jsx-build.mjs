#!/usr/bin/env node

import { access, readdir } from "node:fs/promises";
import path from "node:path";

const SRC_DIR = path.resolve("src");
const DIST_DIR = path.resolve("dist");

async function collectJsxSources(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectJsxSources(entryPath)));
    } else if (entry.name.endsWith(".tsx") || entry.name.endsWith(".jsx")) {
      files.push(entryPath);
    }
  }

  return files;
}

const sourceFiles = await collectJsxSources(SRC_DIR);

if (sourceFiles.length === 0) {
  console.log("No TSX/JSX sources detected. Nothing to verify.");
  process.exit(0);
}

const missingOutputs = [];

for (const sourceFile of sourceFiles) {
  const relativePath = path.relative(SRC_DIR, sourceFile);
  const { dir, name } = path.parse(relativePath);
  const outputPath = path.join(DIST_DIR, dir, `${name}.js`);

  try {
    await access(outputPath);
  } catch (error) {
    missingOutputs.push(path.relative(process.cwd(), outputPath));
  }
}

if (missingOutputs.length > 0) {
  console.error("Missing compiled outputs for the following TSX/JSX sources:");
  for (const missing of missingOutputs) {
    console.error(` - ${missing}`);
  }
  process.exit(1);
}

console.log(
  `Verified compiled outputs for ${sourceFiles.length} TSX/JSX source ${sourceFiles.length === 1 ? "file" : "files"}.`
);
