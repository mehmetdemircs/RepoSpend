import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const { default: sharp } = await import("sharp");
const { chromium } = await import("playwright");
const gifencModule = await import("gifenc");
const { GIFEncoder, quantize, applyPalette } = gifencModule.default ?? gifencModule;

const root = process.cwd();
const sourceDir = path.join(root, "docs", "screenshots");
const outputDir = path.join(root, "marketing", "producthunt");
const imageDir = path.join(outputDir, "images");
const videoDir = path.join(outputDir, "video");

const ph = { width: 1270, height: 760 };
const video = { width: 1920, height: 1080 };

const colors = {
  bg: "#050B13",
  panel: "#0B1220",
  panel2: "#101827",
  border: "#1E2A3D",
  text: "#F8FAFC",
  muted: "#A7B2C4",
  faint: "#64748B",
  teal: "#2DD4BF",
  cyan: "#38BDF8",
  purple: "#8B5CF6",
  yellow: "#FBBF24",
  red: "#F87171",
  green: "#22C55E",
  ph: "#FF6154",
};

const screenshots = {
  overview: path.join(sourceDir, "dashboard-overview.png"),
  repos: path.join(sourceDir, "repos-view.png"),
  repoDetail: path.join(sourceDir, "repo-detail.png"),
  sessions: path.join(sourceDir, "sessions-view.png"),
  sessionDetail: path.join(sourceDir, "session-detail.png"),
  models: path.join(sourceDir, "models-view.png"),
  friction: path.join(sourceDir, "agent-friction.png"),
};

await fs.mkdir(imageDir, { recursive: true });
await fs.mkdir(videoDir, { recursive: true });

await renderThumbnail();
const gallery = [
  await renderCover(),
  await renderOverview(),
  await renderInvestigation(),
  await renderLocalFirst(),
  await renderModels(),
];
await renderGalleryGif(gallery);
await renderVideoHtml(gallery);
if (process.env.REPOSPEND_PRODUCTHUNT_SKIP_VIDEO !== "1") {
  await recordVideo();
}

console.log(`Product Hunt media written to ${outputDir}`);

async function renderThumbnail() {
  const svg = svgDoc(
    240,
    240,
    `
    <defs>
      <linearGradient id="thumb-bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#6D6CFF"/>
        <stop offset="0.52" stop-color="#22D3EE"/>
        <stop offset="1" stop-color="#34D399"/>
      </linearGradient>
      <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%">
        <feDropShadow dx="0" dy="14" stdDeviation="18" flood-color="#000" flood-opacity="0.28"/>
      </filter>
    </defs>
    <rect width="240" height="240" rx="52" fill="url(#thumb-bg)"/>
    <g filter="url(#shadow)">
      <rect x="56" y="126" width="22" height="48" rx="5" fill="#FFFFFF" opacity="0.96"/>
      <rect x="92" y="104" width="22" height="70" rx="5" fill="#FFFFFF" opacity="0.96"/>
      <rect x="128" y="80" width="22" height="94" rx="5" fill="#FFFFFF" opacity="0.96"/>
      <rect x="164" y="55" width="22" height="119" rx="5" fill="#FFFFFF" opacity="0.96"/>
      <path d="M57 107 L98 82 L132 96 L182 42" fill="none" stroke="#FFFFFF" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M168 42 H184 V58" fill="none" stroke="#FFFFFF" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"/>
    </g>
  `,
  );
  await sharp(Buffer.from(svg)).png().toFile(path.join(imageDir, "repospend-producthunt-thumbnail-240.png"));
}

async function renderCover() {
  const file = "01-cover.png";
  const shot = await browserFrame(screenshots.overview, 610, frameHeight(610), {
    label: "RepoSpend dashboard",
  });
  const base = await canvas(
    `
    ${meshBg()}
    ${logoMark(70, 66, 42)}
    ${text("RepoSpend", 124, 89, 34, 800)}
    ${text("See which repos burn AI coding tokens", 70, 178, 55, 850, { width: 455, lineHeight: 1.03 })}
    ${text("Local first dashboard for AI coding usage by repo, session, model, and tool.", 72, 360, 22, 600, { color: colors.muted, width: 455, lineHeight: 1.28 })}
    ${pill(72, 482, "Open source")}
    ${pill(230, 482, "Local first")}
    ${pill(374, 482, "No prompt uploads")}
    ${featureCard(72, 612, "Repo usage", colors.teal)}
    ${featureCard(260, 612, "Session drilldown", colors.cyan)}
    ${featureCard(500, 612, "Model breakdown", colors.purple)}
    ${glow(900, 345, 560, colors.teal, 0.13)}
    `,
  );
  await composite(base, [{ input: shot, left: 620, top: 176 }], file);
  return path.join(imageDir, file);
}

async function renderOverview() {
  const file = "02-dashboard-overview.png";
  const shot = await browserFrame(screenshots.overview, 680, frameHeight(680), {
    label: "Overview",
  });
  const base = await canvas(
    `
    ${darkBg()}
    ${eyebrow("Dashboard overview", 70, 90)}
    ${text("Understand AI coding usage at a glance", 70, 150, 42, 850, { width: 380, lineHeight: 1.08 })}
    ${text("RepoSpend groups local sessions by repository, model, provider, and session so expensive sessions are visible fast.", 72, 318, 20, 560, { color: colors.muted, width: 390, lineHeight: 1.3 })}
    ${callout(78, 450, "Repo usage", "Top repos and token concentration", colors.teal)}
    ${callout(78, 558, "Session cost", "Estimated API-equivalent cost", colors.cyan)}
    ${callout(78, 666, "Provider insights", "Codex, Claude Code, Copilot, Cursor", colors.purple)}
    `,
  );
  await composite(base, [{ input: shot, left: 542, top: 150 }], file);
  return path.join(imageDir, file);
}

async function renderInvestigation() {
  const file = "03-find-expensive-sessions.png";
  const repo = await browserFrame(screenshots.repoDetail, 520, frameHeight(520), {
    label: "Repo detail",
  });
  const session = await browserFrame(screenshots.sessionDetail, 520, frameHeight(520), {
    label: "Session detail",
  });
  const base = await canvas(
    `
    ${darkBg()}
    ${eyebrow("Repo and session drilldown", 70, 88)}
    ${text("Find expensive AI coding sessions quickly", 70, 148, 48, 850, { width: 530, lineHeight: 1.1 })}
    ${text("Follow repo-level cost into the exact session, model, command signals, and token breakdown.", 72, 318, 21, 560, { color: colors.muted, width: 470, lineHeight: 1.32 })}
    ${callout(72, 434, "Top repo", "one-ring-infra leads the demo window", colors.teal)}
    ${callout(72, 542, "Cost driver", "One session accounts for most estimated cost", colors.yellow)}
    ${callout(72, 650, "Evidence", "Warnings stay tied to local command samples", colors.red)}
    ${glow(880, 180, 520, colors.purple, 0.12)}
    `,
  );
  await composite(
    base,
    [
      { input: repo, left: 690, top: 86 },
      { input: session, left: 690, top: 422 },
    ],
    file,
  );
  return path.join(imageDir, file);
}

async function renderLocalFirst() {
  const file = "04-local-first.png";
  const shot = await browserFrame(screenshots.overview, 520, frameHeight(520), {
    label: "Local dashboard",
  });
  const base = await canvas(
    `
    ${darkBg()}
    ${eyebrow("Privacy and trust", 70, 90)}
    ${text("Runs locally, keeps prompts out of the cloud.", 70, 150, 46, 850, { width: 540, lineHeight: 1.07 })}
    ${text("RepoSpend reads local usage files so developers can see usage without login, telemetry, cloud sync, or code uploads.", 72, 304, 21, 560, { color: colors.muted, width: 560, lineHeight: 1.3 })}
    ${flowCard(86, 470, "1", "~/.codex / Claude / Copilot", "Read-only local sources", colors.cyan)}
    ${flowArrow(382, 524)}
    ${flowCard(460, 470, "2", "localhost dashboard", "Server binds locally", colors.teal)}
    ${flowArrow(756, 524)}
    ${flowCard(834, 470, "3", "You stay in control", "No telemetry or sync", colors.green)}
    ${terminal(82, 616)}
    ${glow(960, 250, 480, colors.teal, 0.1)}
    `,
  );
  await composite(base, [{ input: shot, left: 690, top: 96 }], file);
  return path.join(imageDir, file);
}

async function renderModels() {
  const file = "05-models-and-providers.png";
  const shot = await browserFrame(screenshots.models, 682, frameHeight(682), {
    label: "Models",
  });
  const base = await canvas(
    `
    ${darkBg()}
    ${eyebrow("Models and providers", 70, 90)}
    ${text("See which models shape the spend", 70, 150, 45, 850, { width: 380, lineHeight: 1.06 })}
    ${text("Separate Codex, Claude Code, GitHub Copilot, and experimental Cursor usage without mixing tool-specific usage quirks.", 72, 292, 20, 560, { color: colors.muted, width: 395, lineHeight: 1.3 })}
    ${callout(82, 452, "Model mix", "Compare token and cost patterns", colors.purple)}
    ${callout(82, 560, "Cache reuse", "Track cached input as part of input", colors.teal)}
    ${callout(82, 668, "Careful cost language", "Estimated API-equivalent, not your bill", colors.cyan)}
    `,
  );
  await composite(base, [{ input: shot, left: 542, top: 150 }], file);
  return path.join(imageDir, file);
}

async function renderGalleryGif(galleryPaths) {
  const encoder = GIFEncoder();
  for (const galleryPath of galleryPaths.slice(0, 4)) {
    const { data, info } = await sharp(galleryPath)
      .resize({ width: ph.width, height: ph.height, fit: "cover" })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const palette = quantize(data, 128, { format: "rgba4444" });
    const indexed = applyPalette(data, palette, "rgba4444");
    encoder.writeFrame(indexed, info.width, info.height, { palette, delay: 1200 });
  }
  encoder.finish();
  await fs.writeFile(path.join(imageDir, "06-gallery-hover-tour.gif"), Buffer.from(encoder.bytesView()));
}

async function renderVideoHtml() {
  const slides = [
    {
      image: "../images/01-cover.png",
      kicker: "0:05",
      title: "After your face intro",
      body: "Open with the problem: AI coding work is getting expensive, but it is hard to see where the tokens went.",
    },
    {
      image: "../images/02-dashboard-overview.png",
      kicker: "0:12",
      title: "Show the overview",
      body: "Point at total tokens, estimated API-equivalent cost, top repo, and provider/model breakdowns.",
    },
    {
      image: "../images/03-find-expensive-sessions.png",
      kicker: "0:24",
      title: "Drill into the answer",
      body: "Move from a repo rollup into the session that drove the spend.",
    },
    {
      image: "../images/04-local-first.png",
      kicker: "0:38",
      title: "Land the trust point",
      body: "RepoSpend runs locally and does not upload prompts or code.",
    },
    {
      image: "../images/05-models-and-providers.png",
      kicker: "0:50",
      title: "Close with the audience",
      body: "For developers using AI coding tools who want repo-level visibility.",
    },
  ];

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>RepoSpend Product Hunt screen demo</title>
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; background: ${colors.bg}; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: white; }
    .stage { position: relative; width: 100vw; height: 100vh; background: radial-gradient(circle at 70% 12%, rgba(45,212,191,.16), transparent 34%), radial-gradient(circle at 8% 90%, rgba(139,92,246,.13), transparent 35%), #050B13; }
    .brand { position: absolute; left: 86px; top: 64px; display: flex; align-items: center; gap: 18px; z-index: 20; }
    .brand-mark { width: 56px; height: 56px; border-radius: 16px; background: linear-gradient(135deg,#6D6CFF,#22D3EE 55%,#34D399); display: grid; place-items: center; box-shadow: 0 18px 60px rgba(45,212,191,.22); }
    .brand-mark svg { width: 36px; height: 36px; }
    .brand-name { font-size: 34px; font-weight: 850; letter-spacing: 0; }
    .slide { position: absolute; inset: 0; opacity: 0; animation: reveal 50s linear forwards; }
    .slide:nth-child(1) { animation-delay: 0s; }
    .slide:nth-child(2) { animation-delay: 10s; }
    .slide:nth-child(3) { animation-delay: 20s; }
    .slide:nth-child(4) { animation-delay: 30s; }
    .slide:nth-child(5) { animation-delay: 40s; }
    .visual { position: absolute; left: 190px; top: 180px; width: 1540px; height: 922px; border-radius: 24px; box-shadow: 0 34px 110px rgba(0,0,0,.48); animation: drift 10s ease-in-out forwards; }
    .copy { position: absolute; left: 108px; bottom: 82px; width: 720px; padding: 28px 32px; border: 1px solid rgba(148,163,184,.2); border-radius: 22px; background: rgba(7,13,24,.82); backdrop-filter: blur(18px); box-shadow: 0 24px 80px rgba(0,0,0,.34); z-index: 10; }
    .kicker { color: ${colors.teal}; font-size: 22px; font-weight: 800; margin-bottom: 10px; }
    h1 { margin: 0 0 12px; font-size: 44px; line-height: 1.02; letter-spacing: 0; }
    p { margin: 0; color: ${colors.muted}; font-size: 24px; line-height: 1.3; font-weight: 560; }
    @keyframes reveal {
      0% { opacity: 0; }
      3% { opacity: 1; }
      18% { opacity: 1; }
      20% { opacity: 0; }
      100% { opacity: 0; }
    }
    @keyframes drift {
      0% { transform: translate3d(0,22px,0) scale(1.02); }
      100% { transform: translate3d(0,-18px,0) scale(1.075); }
    }
  </style>
</head>
<body>
  <main class="stage">
    <div class="brand">
      <div class="brand-mark">${chartIcon()}</div>
      <div class="brand-name">RepoSpend</div>
    </div>
    ${slides
      .map(
        (slide) => `<section class="slide">
      <img class="visual" src="${slide.image}" alt="" />
      <div class="copy">
        <div class="kicker">${slide.kicker}</div>
        <h1>${escapeHtml(slide.title)}</h1>
        <p>${escapeHtml(slide.body)}</p>
      </div>
    </section>`,
      )
      .join("\n")}
  </main>
</body>
</html>`;
  await fs.writeFile(path.join(videoDir, "screen-demo.html"), html);
}

async function recordVideo() {
  await removeTemporaryRecordings();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: video,
    deviceScaleFactor: 1,
    recordVideo: { dir: videoDir, size: video },
  });
  const page = await context.newPage();
  await page.goto(pathToFileURL(path.join(videoDir, "screen-demo.html")).toString());
  await page.waitForTimeout(51000);
  const captured = page.video();
  await page.close();
  if (captured) {
    await captured.saveAs(path.join(videoDir, "repospend-producthunt-screen-demo.webm"));
    await captured.delete();
  }
  await context.close();
  await browser.close();
  await removeTemporaryRecordings();
}

async function removeTemporaryRecordings() {
  const entries = await fs.readdir(videoDir).catch(() => []);
  await Promise.all(
    entries
      .filter((entry) => entry.startsWith("page@") && entry.endsWith(".webm"))
      .map((entry) => fs.rm(path.join(videoDir, entry), { force: true })),
  );
}

async function canvas(inner, width = ph.width, height = ph.height) {
  return sharp(Buffer.from(svgDoc(width, height, inner))).png().toBuffer();
}

async function composite(base, overlays, file) {
  await sharp(base)
    .composite(overlays)
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(path.join(imageDir, file));
}

function frameHeight(width) {
  const chrome = 38;
  return Math.round(width * 9 / 16) + chrome;
}

async function browserFrame(inputPath, width, height, options = {}) {
  const chrome = 38;
  const radius = 20;
  const crop = options.crop;
  let shot = sharp(inputPath);
  if (crop) {
    shot = shot.extract(crop);
  }
  const content = await rounded(
    await shot
      .resize({ width, height: height - chrome, fit: "cover", position: options.position ?? "top" })
      .png()
      .toBuffer(),
    width,
    height - chrome,
    0,
  );
  const frame = await sharp(
    Buffer.from(
      svgDoc(
        width,
        height,
        `
        <defs>
          <filter id="frame-shadow" x="-20%" y="-20%" width="140%" height="150%">
            <feDropShadow dx="0" dy="24" stdDeviation="28" flood-color="#000" flood-opacity="0.38"/>
          </filter>
        </defs>
        <rect x="0" y="0" width="${width}" height="${height}" rx="${radius}" fill="#0B1220" filter="url(#frame-shadow)"/>
        <rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="${radius}" fill="none" stroke="#27364C" stroke-width="2"/>
        <circle cx="22" cy="20" r="5" fill="#F87171"/>
        <circle cx="40" cy="20" r="5" fill="#FBBF24"/>
        <circle cx="58" cy="20" r="5" fill="#34D399"/>
        <rect x="84" y="11" width="${Math.min(260, width - 120)}" height="18" rx="9" fill="#101827" stroke="#25324A"/>
        ${text(options.label ?? "RepoSpend", 100, 24, 11, 700, { color: colors.muted })}
        `,
      ),
    ),
  )
    .png()
    .toBuffer();
  return sharp(frame)
    .composite([{ input: content, left: 0, top: chrome }])
    .png()
    .toBuffer();
}

async function rounded(buffer, width, height, radius) {
  if (!radius) return buffer;
  const mask = Buffer.from(
    svgDoc(width, height, `<rect x="0" y="0" width="${width}" height="${height}" rx="${radius}" fill="#fff"/>`),
  );
  return sharp(buffer)
    .ensureAlpha()
    .composite([{ input: mask, blend: "dest-in" }])
    .png()
    .toBuffer();
}

function svgDoc(width, height, inner) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${inner}</svg>`;
}

function darkBg() {
  return `
    <rect width="${ph.width}" height="${ph.height}" fill="${colors.bg}"/>
    <path d="M0 0H1270V760H0Z" fill="url(#noise)" opacity="0"/>
    ${glow(1080, 100, 420, colors.cyan, 0.11)}
    ${glow(120, 720, 430, colors.purple, 0.1)}
    <path d="M0 640 C260 560 480 690 750 620 C940 570 1070 630 1270 560 V760 H0 Z" fill="#07111F" opacity="0.82"/>
  `;
}

function meshBg() {
  return `
    <rect width="${ph.width}" height="${ph.height}" fill="${colors.bg}"/>
    ${glow(1020, 110, 520, colors.cyan, 0.18)}
    ${glow(50, 680, 500, colors.purple, 0.13)}
    ${glow(690, 710, 420, colors.teal, 0.08)}
    <path d="M0 626 C246 552 454 658 682 606 C884 560 1030 620 1270 526 V760 H0 Z" fill="#07111F" opacity="0.88"/>
    <g opacity=".13" stroke="#38BDF8" stroke-width="1">
      <path d="M698 0V760"/>
      <path d="M820 0V760"/>
      <path d="M942 0V760"/>
      <path d="M1064 0V760"/>
      <path d="M1186 0V760"/>
      <path d="M0 180H1270"/>
      <path d="M0 302H1270"/>
      <path d="M0 424H1270"/>
      <path d="M0 546H1270"/>
    </g>
  `;
}

function glow(cx, cy, r, color, opacity) {
  return `<radialGradient id="g-${cx}-${cy}" cx="${cx}" cy="${cy}" r="${r}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${color}" stop-opacity="${opacity}"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient><circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#g-${cx}-${cy})"/>`;
}

function logoMark(x, y, size) {
  return `
    <g transform="translate(${x} ${y}) scale(${size / 42})">
      <rect width="42" height="42" rx="12" fill="url(#logo-grad)"/>
      <defs>
        <linearGradient id="logo-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#6D6CFF"/>
          <stop offset="0.55" stop-color="#22D3EE"/>
          <stop offset="1" stop-color="#34D399"/>
        </linearGradient>
      </defs>
      ${chartIcon(6, 6, 30)}
    </g>`;
}

function chartIcon(x = 0, y = 0, size = 42) {
  const s = size / 42;
  return `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="0 0 42 42" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="${8 * s}" y="${24 * s}" width="${5 * s}" height="${10 * s}" rx="${1.5 * s}" fill="white" opacity=".95"/>
    <rect x="${18 * s}" y="${18 * s}" width="${5 * s}" height="${16 * s}" rx="${1.5 * s}" fill="white" opacity=".95"/>
    <rect x="${28 * s}" y="${11 * s}" width="${5 * s}" height="${23 * s}" rx="${1.5 * s}" fill="white" opacity=".95"/>
    <path d="M9 19L18 14L26 17L34 8" stroke="white" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

function eyebrow(label, x, y) {
  return `${text(label.toUpperCase(), x, y, 15, 850, { color: colors.teal })}<rect x="${x}" y="${y + 17}" width="68" height="3" rx="1.5" fill="${colors.teal}"/>`;
}

function text(value, x, y, size, weight = 600, opts = {}) {
  const color = opts.color ?? colors.text;
  const width = opts.width ?? 900;
  const lineHeight = opts.lineHeight ?? 1.15;
  const lines = wrap(value, width, size, weight);
  const tspans = lines
    .map((line, index) => `<tspan x="${x}" dy="${index === 0 ? 0 : size * lineHeight}">${escapeHtml(line)}</tspan>`)
    .join("");
  return `<text x="${x}" y="${y}" fill="${color}" font-family="Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="${size}" font-weight="${weight}" letter-spacing="0">${tspans}</text>`;
}

function wrap(value, maxWidth, size, weight) {
  const words = String(value).split(/\s+/);
  const lines = [];
  let line = "";
  const weightFactor = weight >= 800 ? 0.58 : 0.53;
  const maxChars = Math.max(8, Math.floor(maxWidth / (size * weightFactor)));
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function pill(x, y, label) {
  const width = 58 + label.length * 8.2;
  return `<g><rect x="${x}" y="${y}" width="${width}" height="40" rx="20" fill="#0C1F2A" stroke="#1EBAAA" stroke-opacity=".5"/><circle cx="${x + 22}" cy="${y + 20}" r="5" fill="${colors.teal}"/>${text(label, x + 38, y + 26, 15, 800, { color: colors.text })}</g>`;
}

function featureCard(x, y, label, color) {
  return `<g><rect x="${x}" y="${y}" width="170" height="82" rx="16" fill="#0B1220" stroke="${color}" stroke-opacity=".42"/><circle cx="${x + 24}" cy="${y + 30}" r="7" fill="${color}"/><text x="${x + 18}" y="${y + 60}" fill="${colors.text}" font-size="18" font-weight="850" font-family="Inter, ui-sans-serif, system-ui">${escapeHtml(label)}</text></g>`;
}

function callout(x, y, title, body, color) {
  return `<g><rect x="${x}" y="${y}" width="360" height="80" rx="16" fill="#0B1220" stroke="${color}" stroke-opacity=".46"/><circle cx="${x + 30}" cy="${y + 32}" r="10" fill="${color}" opacity=".18"/><circle cx="${x + 30}" cy="${y + 32}" r="4" fill="${color}"/>${text(title, x + 54, y + 31, 18, 850)}${text(body, x + 54, y + 56, 14, 650, { color: colors.muted, width: 280 })}</g>`;
}

function flowCard(x, y, number, title, body, color) {
  return `<g><rect x="${x}" y="${y}" width="260" height="110" rx="18" fill="#0B1220" stroke="${color}" stroke-opacity=".44"/><circle cx="${x + 36}" cy="${y + 35}" r="17" fill="${color}" opacity=".17"/><text x="${x + 30}" y="${y + 42}" fill="${color}" font-size="20" font-weight="850" font-family="Inter, ui-sans-serif, system-ui">${number}</text>${text(title, x + 66, y + 34, 16, 850, { width: 170 })}${text(body, x + 66, y + 70, 14, 650, { color: colors.muted, width: 170 })}</g>`;
}

function flowArrow(x, y) {
  return `<path d="M${x} ${y}H${x + 48}" stroke="${colors.faint}" stroke-width="3" stroke-linecap="round"/><path d="M${x + 39} ${y - 9}L${x + 50} ${y}L${x + 39} ${y + 9}" fill="none" stroke="${colors.faint}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;
}

function terminal(x, y) {
  return `<g><rect x="${x}" y="${y}" width="510" height="78" rx="18" fill="#020617" stroke="#223149"/><text x="${x + 24}" y="${y + 32}" fill="${colors.faint}" font-size="16" font-weight="700" font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace">$ npx repospend</text><text x="${x + 24}" y="${y + 58}" fill="${colors.teal}" font-size="16" font-weight="700" font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace">localhost dashboard opens</text></g>`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
