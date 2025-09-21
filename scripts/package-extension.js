#!/usr/bin/env node

const fs = require("fs/promises");
const path = require("path");

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function copyDirectory(source, destination) {
  await fs.mkdir(destination, { recursive: true });
  const entries = await fs.readdir(source, { withFileTypes: true });

  await Promise.all(
    entries.map(async (entry) => {
      const sourcePath = path.join(source, entry.name);
      const destinationPath = path.join(destination, entry.name);

      if (entry.isDirectory()) {
        await copyDirectory(sourcePath, destinationPath);
      } else if (entry.isFile()) {
        await fs.copyFile(sourcePath, destinationPath);
      }
    })
  );
}

async function copyPublicAssets(publicDirectory, extensionDirectory) {
  if (!(await pathExists(publicDirectory))) {
    return;
  }

  const assets = await fs.readdir(publicDirectory, { withFileTypes: true });

  await Promise.all(
    assets.map(async (asset) => {
      const source = path.join(publicDirectory, asset.name);
      const destination = path.join(extensionDirectory, asset.name);

      if (asset.isDirectory()) {
        await copyDirectory(source, destination);
      } else if (asset.isFile()) {
        if (asset.name === "popup.html") {
          const popupDestination = path.join(
            extensionDirectory,
            "dist",
            "popup"
          );
          await fs.mkdir(popupDestination, { recursive: true });
          await fs.copyFile(source, path.join(popupDestination, "index.html"));
        } else if (asset.name === "options.html") {
          const optionsDestination = path.join(
            extensionDirectory,
            "dist",
            "options"
          );
          await fs.mkdir(optionsDestination, { recursive: true });
          await fs.copyFile(source, path.join(optionsDestination, "index.html"));
        } else {
          await fs.copyFile(source, destination);
        }
      }
    })
  );
}

async function main() {
  const repositoryRoot = path.resolve(__dirname, "..");
  const extensionPackageRoot = path.join(
    repositoryRoot,
    "packages",
    "web-extension"
  );
  const manifestPath = path.join(extensionPackageRoot, "manifest.json");
  const publicDirectory = path.join(extensionPackageRoot, "public");
  const distDirectory = path.join(extensionPackageRoot, "dist");
  const extensionDirectory = path.join(extensionPackageRoot, "extension");

  if (!(await pathExists(distDirectory))) {
    throw new Error(
      "Missing compiled assets. Run the build script before packaging the extension."
    );
  }

  await fs.rm(extensionDirectory, { recursive: true, force: true });
  await fs.mkdir(extensionDirectory, { recursive: true });

  await fs.copyFile(
    manifestPath,
    path.join(extensionDirectory, path.basename(manifestPath))
  );

  await copyPublicAssets(publicDirectory, extensionDirectory);
  await copyDirectory(distDirectory, path.join(extensionDirectory, "dist"));

  console.log(
    `Packaged extension assets into ${path.relative(
      repositoryRoot,
      extensionDirectory
    )}`
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
