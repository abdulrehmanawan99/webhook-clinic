import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { chromium, expect } from "@playwright/test";

const AxeBuilder = createRequire(import.meta.url)("@axe-core/playwright").default;
const output = fileURLToPath(new URL("../.local/browser/", import.meta.url));
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(process.env.CLINIC_BROWSER_URL || "http://127.0.0.1:5174");
  await page.getByRole("button").filter({ hasText: "shipment.created" }).click();
  await page.getByRole("heading", { name: "shipment.created", exact: true }).waitFor();
  const diagnose = page.getByRole("button", { name: /Run diagnostics/ });
  if (await diagnose.count()) await diagnose.click();
  await page.getByRole("button", { name: /Analysis retained/ }).waitFor();
  const reproduce = page.getByRole("button", { name: /Reproduce locally/ });
  if (await reproduce.count()) await reproduce.click();
  await page.getByRole("button", { name: /Observation retained/ }).waitFor();
  await expect(page.locator('option[value="gemini"]')).toBeDisabled();
  const investigate = page.getByRole("button", { name: /Investigate fixture evidence/ });
  if (await investigate.isEnabled()) await investigate.click();
  await expect(page.locator(".investigation-result")).toContainText("FIXTURE · NO INFERENCE");
  await expect(page.locator(".investigation-result")).toContainText("SUCCEEDED");
  const replay = page.getByRole("button", { name: /Approve & replay locally/ });
  if (await replay.count()) {
    await expect(replay).toBeDisabled();
    await page.getByRole("checkbox").check();
    await replay.click();
  }
  await expect(page.locator(".replay .audit")).toContainText("SUCCEEDED");
  await page.reload();
  await page.getByRole("button").filter({ hasText: "shipment.created" }).click();
  await expect(page.locator(".replay .audit")).toContainText("SUCCEEDED");
  await page.getByRole("tab", { name: "Response snapshot" }).click();
  await page.keyboard.press("ArrowLeft");
  assert.equal(await page.evaluate(() => document.activeElement.id), "evidence-tab-request");
  await page.keyboard.press("ArrowRight");
  assert.equal(await page.evaluate(() => document.activeElement.id), "evidence-tab-response");
  const scans = [];
  for (const [name, width, height] of [["desktop", 1440, 1000], ["mobile", 390, 844]]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => window.scrollTo(0, 0));
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name} overflow`);
    const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    scans.push({ viewport: name, violations: result.violations.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) })) });
    await page.screenshot({ path: `${output}/${name}.png`, fullPage: true });
  }
  console.log(JSON.stringify({ workflow: "passed", browserErrors: errors, accessibility: scans }));
  assert.deepEqual(errors, []);
  assert(scans.every((scan) => scan.violations.length === 0), "Accessibility violations; inspect the retained report/screenshots");
} finally {
  await browser.close();
}
