import fs from "node:fs/promises";
import path from "node:path";

const viewport = { width: 2560, height: 1440 };
const outputDir = path.resolve("docs/screenshots");
const baseUrl = process.env.REPOSPEND_CAPTURE_URL ?? "http://localhost:2005";
const dependencyCommand = "REPOSPEND_DEMO_DATA=lotr pnpm dev";
const captureCommand = "REPOSPEND_DEMO_DATA=lotr pnpm media:capture";

const stills = [
  { file: "dashboard-overview.png", path: "/?range=all" },
  { file: "repos-view.png", path: "/repos?range=all" },
  { file: "repo-detail.png", path: "/repos/%2Fdemo%2Fmiddle-earth%2Fone-ring-infra?range=all" },
  { file: "models-view.png", path: "/models?range=all" },
  { file: "sessions-view.png", path: "/sessions?range=all" },
  { file: "session-detail.png", path: "/sessions/lotr-session-004?range=all" },
  { file: "agent-friction.png", path: "/agent-friction?range=all" },
];

const gifs = [
  {
    file: "overview-sessions-tour.gif",
    steps: [
      { path: "/?range=all", hold: 5 },
      { scrollTo: 560, frames: 6 },
      { path: "/repos?range=all", hold: 5 },
      { path: "/sessions?range=all", hold: 7 },
    ],
  },
];

async function importDependency(name) {
  try {
    return await import(name);
  } catch (error) {
    throw new Error(`Missing ${name}. Run:\n\n  pnpm install\n  ${captureCommand}\n`, { cause: error });
  }
}

const { chromium } = await importDependency("playwright");
const { default: sharp } = await importDependency("sharp");
const gifenc = await importDependency("gifenc");
const { GIFEncoder, quantize, applyPalette } = gifenc.default ?? gifenc;

await fs.mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport,
  deviceScaleFactor: 1,
  colorScheme: "dark",
});
await context.addInitScript(() => {
  window.localStorage.clear();
});

const page = await context.newPage();

try {
  for (const still of stills) {
    await goto(page, still.path);
    await page.screenshot({
      path: path.join(outputDir, still.file),
      fullPage: false,
      animations: "disabled",
    });
    console.log(`wrote ${path.join(outputDir, still.file)}`);
  }

  for (const gif of gifs) {
    const encoder = GIFEncoder();
    for (const step of gif.steps) {
      if (step.path) {
        await goto(page, step.path);
      }
      if (step.scrollTo !== undefined) {
        await scrollFrames(page, encoder, step.scrollTo, step.frames ?? 6);
      }
      for (let index = 0; index < (step.hold ?? 0); index += 1) {
        await writeGifFrame(page, encoder, index === 0 ? 600 : 170);
      }
    }
    encoder.finish();
    const outputPath = path.join(outputDir, gif.file);
    await fs.writeFile(outputPath, Buffer.from(encoder.bytesView()));
    console.log(`wrote ${outputPath}`);
  }
} finally {
  await browser.close();
}

async function goto(targetPage, urlPath) {
  await targetPage.goto(new URL(urlPath, baseUrl).toString(), { waitUntil: "networkidle" });
  await targetPage.waitForSelector(".app-shell");
  await targetPage.waitForFunction(() => !document.body.innerText.includes("Loading local usage"));
  await assertDemoContent(targetPage);
  await targetPage.waitForTimeout(350);
}

async function assertDemoContent(targetPage) {
  const bodyText = await targetPage.locator("body").innerText();
  const demoSignals = ["/demo/middle-earth", "Middle-earth", "one-ring-infra", "shire-mobile", "lotr-session"];
  if (!demoSignals.some((signal) => bodyText.includes(signal))) {
    throw new Error(`Release media capture requires the LOTR demo dataset. Start the app with:\n\n  ${dependencyCommand}\n\nThen run:\n\n  ${captureCommand}\n`);
  }
}

async function scrollFrames(targetPage, encoder, targetY, frameCount) {
  const startY = await targetPage.evaluate(() => window.scrollY);
  for (let index = 1; index <= frameCount; index += 1) {
    const progress = index / frameCount;
    const eased = 1 - Math.pow(1 - progress, 3);
    const nextY = Math.round(startY + (targetY - startY) * eased);
    await targetPage.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), nextY);
    await targetPage.waitForTimeout(80);
    await writeGifFrame(targetPage, encoder, 170);
  }
}

async function writeGifFrame(targetPage, encoder, delay) {
  const png = await targetPage.screenshot({ fullPage: false, animations: "disabled" });
  const { data, info } = await sharp(png)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const palette = quantize(data, 256, { format: "rgba4444" });
  const indexed = applyPalette(data, palette, "rgba4444");
  encoder.writeFrame(indexed, info.width, info.height, { palette, delay });
}
