#!/usr/bin/env node

import { access, stat } from "node:fs/promises";
import path from "node:path";

const projectRoot = process.cwd();
const srcDirectory = path.join(projectRoot, "src");
const publicDirectory = path.join(projectRoot, "public");
const distDirectory = path.join(projectRoot, "dist");

async function pathExists(targetPath) {
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

const buildEntries = [
  {
    source: path.join(srcDirectory, "background", "index.ts"),
    output: path.join(distDirectory, "background", "index.js")
  },
  {
    source: path.join(srcDirectory, "popup", "index.tsx"),
    output: path.join(distDirectory, "popup", "index.js")
  },
  {
    source: path.join(srcDirectory, "options", "settings.tsx"),
    output: path.join(distDirectory, "options", "settings.js")
  }
];

const assetEntries = [
  {
    source: path.join(publicDirectory, "popup.html"),
    output: path.join(distDirectory, "popup", "index.html")
  }
];

const missingOutputs = [];
let verifiedCount = 0;

for (const entry of buildEntries) {
  if (!(await pathExists(entry.source))) {
    continue;
  }

  if (!(await pathExists(entry.output))) {
    missingOutputs.push(path.relative(projectRoot, entry.output));
    continue;
  }

  verifiedCount += 1;
}

for (const asset of assetEntries) {
  if (!(await pathExists(asset.source))) {
    continue;
  }

  try {
    await access(asset.output);
    verifiedCount += 1;
  } catch {
    missingOutputs.push(path.relative(projectRoot, asset.output));
  }
}

if (missingOutputs.length > 0) {
  console.error("Missing build outputs:");
  for (const missing of missingOutputs) {
    console.error(` - ${missing}`);
  }
  process.exit(1);
}

console.log(
  `Verified ${verifiedCount} expected build artefact${verifiedCount === 1 ? "" : "s"}.`
);
