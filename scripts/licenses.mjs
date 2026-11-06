// Offline inventory: lockfile is authoritative; installed package metadata adds attribution locations.
import { readFileSync, existsSync, readdirSync } from "node:fs";
const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
const counts = {};
const entries = Object.entries(lock.packages)
  .filter(([path]) => path)
  .map(([path, entry]) => {
    const metadataPath = `${path}/package.json`;
    const installed = existsSync(metadataPath);
    const metadata = installed
      ? JSON.parse(readFileSync(metadataPath, "utf8"))
      : {};
    if (installed && metadata.version !== entry.version)
      throw new Error(`Installed version differs from lock: ${path}`);
    counts[entry.license ?? "UNKNOWN"] =
      (counts[entry.license ?? "UNKNOWN"] ?? 0) + 1;
    return {
      package: path.replace(/^.*node_modules\//, ""),
      version: entry.version,
      license: entry.license ?? "UNKNOWN",
      development: Boolean(entry.dev),
      optional: Boolean(entry.optional),
      installed,
      upstream:
        typeof metadata.repository === "string"
          ? metadata.repository
          : (metadata.repository?.url ?? entry.resolved),
      notices: installed
        ? readdirSync(path)
            .filter((name) => /^(licen[cs]e|copying|notice)/i.test(name))
            .map((name) => `${path}/${name}`)
        : [],
    };
  });
console.log(
  JSON.stringify(
    {
      lockfileVersion: lock.lockfileVersion,
      packageEntries: entries.length,
      licenses: counts,
      entries,
    },
    null,
    2,
  ),
);
if (entries.some((entry) => entry.license === "UNKNOWN")) process.exitCode = 1;
