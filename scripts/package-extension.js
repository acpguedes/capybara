#!/usr/bin/env node

const fs = require("fs/promises");
const path = require("path");
const zlib = require("node:zlib");
const { promisify } = require("node:util");

const deflateRaw = promisify(zlib.deflateRaw);

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);

  for (let index = 0; index < 256; index += 1) {
    let value = index;

    for (let bit = 0; bit < 8; bit += 1) {
      if ((value & 1) === 1) {
        value = 0xedb88320 ^ (value >>> 1);
      } else {
        value >>>= 1;
      }
    }

    table[index] = value >>> 0;
  }

  return table;
})();

function crc32(buffer) {
  let crc = 0 ^ -1;

  for (const byte of buffer) {
    crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ byte) & 0xff];
  }

  return (crc ^ -1) >>> 0;
}

function toDosDateTime(date) {
  const safeYear = Math.max(date.getFullYear(), 1980);
  const dosTime =
    (date.getHours() << 11) |
    (date.getMinutes() << 5) |
    Math.floor(date.getSeconds() / 2);
  const dosDate =
    ((safeYear - 1980) << 9) |
    ((date.getMonth() + 1) << 5) |
    date.getDate();

  return { dosDate, dosTime };
}

async function collectFiles(rootDirectory, currentDirectory = rootDirectory) {
  const entries = await fs.readdir(currentDirectory, { withFileTypes: true });
  const sortedEntries = entries.sort((left, right) =>
    left.name.localeCompare(right.name)
  );
  const files = [];

  for (const entry of sortedEntries) {
    const absolutePath = path.join(currentDirectory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await collectFiles(rootDirectory, absolutePath)));
    } else if (entry.isFile()) {
      files.push({
        absolutePath,
        relativePath: path.relative(rootDirectory, absolutePath),
      });
    }
  }

  return files;
}

async function createZipArchive(sourceDirectory, outputFile) {
  const files = await collectFiles(sourceDirectory);

  const localFileChunks = [];
  const centralDirectoryEntries = [];
  let localEntriesSize = 0;

  for (const file of files) {
    const fileName = file.relativePath.split(path.sep).join("/");
    const fileNameBuffer = Buffer.from(fileName, "utf8");
    const data = await fs.readFile(file.absolutePath);
    const compressedData = await deflateRaw(data, {
      level: zlib.constants.Z_BEST_COMPRESSION,
    });
    const crc = crc32(data);
    const stats = await fs.stat(file.absolutePath);
    const { dosDate, dosTime } = toDosDateTime(stats.mtime);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(8, 8);
    localHeader.writeUInt16LE(dosTime, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compressedData.length, 18);
    localHeader.writeUInt32LE(data.length, 22);
    localHeader.writeUInt16LE(fileNameBuffer.length, 26);
    localHeader.writeUInt16LE(0, 28);

    const localHeaderOffset = localEntriesSize;
    localEntriesSize += localHeader.length + fileNameBuffer.length + compressedData.length;

    localFileChunks.push(localHeader, fileNameBuffer, compressedData);
    centralDirectoryEntries.push({
      compressedSize: compressedData.length,
      crc,
      dosDate,
      dosTime,
      fileNameBuffer,
      localHeaderOffset,
      uncompressedSize: data.length,
    });
  }

  const centralDirectoryOffset = localEntriesSize;
  const centralDirectoryChunks = [];
  let centralDirectorySize = 0;

  for (const entry of centralDirectoryEntries) {
    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(0x0014, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(8, 10);
    centralHeader.writeUInt16LE(entry.dosTime, 12);
    centralHeader.writeUInt16LE(entry.dosDate, 14);
    centralHeader.writeUInt32LE(entry.crc, 16);
    centralHeader.writeUInt32LE(entry.compressedSize, 20);
    centralHeader.writeUInt32LE(entry.uncompressedSize, 24);
    centralHeader.writeUInt16LE(entry.fileNameBuffer.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(entry.localHeaderOffset, 42);

    centralDirectoryChunks.push(centralHeader, entry.fileNameBuffer);
    centralDirectorySize += centralHeader.length + entry.fileNameBuffer.length;
  }

  const endOfCentralDirectory = Buffer.alloc(22);
  endOfCentralDirectory.writeUInt32LE(0x06054b50, 0);
  endOfCentralDirectory.writeUInt16LE(0, 4);
  endOfCentralDirectory.writeUInt16LE(0, 6);
  endOfCentralDirectory.writeUInt16LE(centralDirectoryEntries.length, 8);
  endOfCentralDirectory.writeUInt16LE(centralDirectoryEntries.length, 10);
  endOfCentralDirectory.writeUInt32LE(centralDirectorySize, 12);
  endOfCentralDirectory.writeUInt32LE(centralDirectoryOffset, 16);
  endOfCentralDirectory.writeUInt16LE(0, 20);

  const totalSize =
    localEntriesSize + centralDirectorySize + endOfCentralDirectory.length;
  const buffers = [
    ...localFileChunks,
    ...centralDirectoryChunks,
    endOfCentralDirectory,
  ];
  const zipBuffer = Buffer.concat(buffers, totalSize);

  await fs.rm(outputFile, { force: true });
  await fs.writeFile(outputFile, zipBuffer);
}

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
  const packageJsonPath = path.join(extensionPackageRoot, "package.json");
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

  const packageDefinition = JSON.parse(
    await fs.readFile(packageJsonPath, "utf8")
  );
  const version = packageDefinition.version;

  if (typeof version !== "string" || version.trim() === "") {
    throw new Error("Extension package version is missing from package.json");
  }

  const archivePath = path.join(
    extensionPackageRoot,
    `capybara-extension-v${version}.zip`
  );
  await createZipArchive(extensionDirectory, archivePath);

  console.log(
    `Packaged extension assets into ${path.relative(
      repositoryRoot,
      extensionDirectory
    )}`
  );
  console.log(
    `Compressed extension archive available at ${path.relative(
      repositoryRoot,
      archivePath
    )}`
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
