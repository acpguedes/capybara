#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ICON_PAYLOADS = {
  16: "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAGUlEQVR4nGPIWt//nxLMMGrAqAGjBgwXAwC9TqcfHqpyHgAAAABJRU5ErkJggg==",
  32: "iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAL0lEQVR4nO3OIQEAAAgDMPJShihEhBg3E/Or3rmkEhAQEBAQEBAQEBAQEBAQSAcelUWclzpyAqkAAAAASUVORK5CYII=",
  48: "iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAAAZElEQVR4nO3PMQ0AIADAMPRiBilIBBEcDcmO/d2Ye52fGxrQgAY0oAENaEADGtCABjSgAQ1oQAMa0IAGNKABDWhAAxrQgAY0oAENaEADGtCABjSgAQ1oQAMa0IAGNKABDWjAaxcQg+BaD2/XOQAAAABJRU5ErkJggg==",
  128: "iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAYAAADDPmHLAAABL0lEQVR4nO3SIQEAIBDAwM9LGaIQEWIgduL8xGadfema3wEYAANgAAyAATAABsAAGAADYAAMgAEwAAbAABgAA2AADIABMAAGwAAYAANgAAyAATAABsAAGAADYAAMgAEwAAbAABgAA2CAOAPEGSDOAHEGiDNAnAHiDBBngDgDxBkgzgBxBogzQJwB4gwQZ4A4A8QZIM4AcQaIM0CcAeIMEGeAOAPEGSDOAHEGiDNAnAHiDBBngDgDxBkgzgBxBogzQJwB4gwQZ4A4A8QZIM4AcQaIM0CcAeIMEGeAOAPEGSDOAHEGiDNAnAHiDBBngDgDxBkgzgBxBogzQJwB4gwQZ4A4A8QZIM4AcQaIM0CcAeIMEGeAOAPEGSDOAHEGiDNAnAHiDBBngDgDxBkgzgBxDwTXyeglJraiAAAAAElFTkSuQmCC"
};

export async function writeIcons(outputDirectory) {
  await mkdir(outputDirectory, { recursive: true });

  await Promise.all(
    Object.entries(ICON_PAYLOADS).map(async ([size, payload]) => {
      const filePath = path.join(outputDirectory, `icon-${size}.png`);
      const buffer = Buffer.from(payload, "base64");
      await writeFile(filePath, buffer);
    })
  );
}

async function cli() {
  const target = process.argv[2]
    ? path.resolve(process.argv[2])
    : path.join(process.cwd(), "public", "icons");

  await writeIcons(target);
  console.log(`Wrote ${Object.keys(ICON_PAYLOADS).length} icon(s) to ${target}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  cli().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
