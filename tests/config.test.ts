import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
const exec = promisify(execFile);
const config = fileURLToPath(new URL("../server/config.ts", import.meta.url));
const tsx = fileURLToPath(
  new URL("../node_modules/tsx/dist/loader.mjs", import.meta.url),
);

// Evaluates config.ts in a clean child process from a directory with a .env.
async function load(dotenv: string, env: Record<string, string>) {
  const dir = await mkdtemp(join(tmpdir(), "clinic-config-"));
  try {
    await writeFile(join(dir, ".env"), dotenv);
    const script = `const c = await import(${JSON.stringify(config)}); console.log(JSON.stringify({ ui: c.uiOrigin, api: c.apiBase, mongo: c.mongoUrl, key: process.env.DEMO_SIGNING_KEY }));`;
    const clean = Object.fromEntries(
      Object.entries(process.env).filter(
        ([k]) =>
          !k.startsWith("CLINIC_") &&
          !["MONGO_URL", "REDIS_URL", "DEMO_SIGNING_KEY"].includes(k),
      ),
    );
    const { stdout } = await exec(
      process.execPath,
      ["--import", tsx, "--input-type=module", "-e", script],
      { cwd: dir, env: { ...clean, ...env } },
    );
    return JSON.parse(stdout);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test(".env is loaded when present and exported variables win", async () => {
  const result = await load(
    "CLINIC_UI_PORT=5274\nCLINIC_API_PORT=8111\nCLINIC_MONGO_PORT=27118\nDEMO_SIGNING_KEY=from-file\n",
    { CLINIC_API_PORT: "8211" },
  );
  assert.equal(result.ui, "http://127.0.0.1:5274");
  assert.equal(result.api, "http://127.0.0.1:8211");
  assert.equal(result.mongo, "mongodb://127.0.0.1:27118");
  assert.equal(result.key, "from-file");
});

test("invalid port overrides are rejected at startup", async () => {
  await assert.rejects(load("CLINIC_UI_PORT=80\n", {}));
});
