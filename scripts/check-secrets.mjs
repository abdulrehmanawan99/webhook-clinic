// Bounded pattern scan of tracked text and generated frontend JS/CSS. Never prints matches.
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, existsSync } from "node:fs";
const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter(Boolean);
if (existsSync("dist/assets"))
  files.push(
    ...readdirSync("dist/assets")
      .filter((f) => /\.(js|css)$/.test(f))
      .map((f) => `dist/assets/${f}`),
  );
const patterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bAIza[0-9A-Za-z_-]{35}\b/,
  /\bgh[pousr]_[A-Za-z0-9]{30,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{50,}\b/,
  /\bAKIA[A-Z0-9]{16}\b/,
];
let scanned = 0;
const flagged = [];
for (const file of new Set(files)) {
  const data = readFileSync(file);
  if (data.includes(0)) continue; // PNG and other binaries are outside this text check.
  scanned++;
  if (patterns.some((pattern) => pattern.test(data.toString("utf8"))))
    flagged.push(file);
}
console.log(
  JSON.stringify({
    scannedTextFiles: scanned,
    flaggedFiles: flagged,
    scope:
      "tracked working-tree text + generated frontend JS/CSS; not history, ignored files, binary OCR or entropy analysis",
  }),
);
if (flagged.length) process.exitCode = 1;
