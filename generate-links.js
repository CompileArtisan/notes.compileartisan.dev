// generate-links.js
// Builds the root index.html (the landing page), styled to match the exported
// notes (same tokens, fonts, header, light/dark toggle and code/link styling).
// Nothing about your courses or your site is written in this file; everything
// is read from the repo:
//
//   course title, chapters, section count,
//   code examples, word count        <- each course's .org file (HTML as fallback)
//   course description (optional)    <- a "#+description:" line in the .org file
//   subject tags (optional)          <- a "#+filetags: :ai:vision:" line in the .org file
//   last updated                     <- git history (file mtime as fallback)
//   page heading and intro text      <- README.md (first "# heading" and first paragraph)
//   site name, domain, repo link     <- package.json ("name", "description", "repository", "homepage")
//   font and og-image                <- whatever is in ./assets
//
// A folder is listed only if it contains an exported .html file.

import { readdirSync, statSync, readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";

const ROOT = process.cwd();
const OUTPUT = join(ROOT, "index.html");

// Display tuning only, not content.
const WORDS_PER_MINUTE = 200;
const MAX_TOPIC_PILLS = 7;

// The big page title: only the linked part is a hyperlink.  -> "Praanesh’s Notes"
const TITLE = {
  link: { text: "Praanesh", href: "https://compileartisan.dev/" },
  rest: "’s Notes",
};

// Used when ./assets has no font file (same URL the exported notes use).
const REMOTE_BRAND_FONT = "https://compileartisan.dev/Perfect%20DOS%20VGA%20437%20Win.ttf";

/* ------------------------------ helpers ------------------------------ */

const esc = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const readIfExists = (p) => (existsSync(p) ? readFileSync(p, "utf-8") : "");

const plural = (n, one, many = one + "s") => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

const fmtDate = (d) =>
  d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

const fmtMinutes = (m) =>
  m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}`;

/** Strip Org inline markup so a heading reads as plain text. */
function cleanOrg(text) {
  return text
    .replace(/^(TODO|DONE|NEXT|WAIT)\s+/, "")
    .replace(/\s+:[\w@:]+:\s*$/, "") // trailing :tags:
    .replace(/\[\[[^\]]*\]\[([^\]]*)\]\]/g, "$1") // [[url][label]]
    .replace(/\[\[([^\]]*)\]\]/g, "$1") // [[url]]
    .replace(/\\\(|\\\)|\$/g, "") // inline math delimiters
    .replace(/\\([a-zA-Z]+)/g, "") // latex commands
    .replace(/[~=*/+_](\S(?:.*?\S)?)[~=*/+_]/g, "$1") // ~code~ *bold* /italic/
    .replace(/\s+/g, " ")
    .trim();
}

/** Strip Markdown inline markup. */
const cleanMd = (text) =>
  text
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[`*_]{1,3}([^`*_]+)[`*_]{1,3}/g, "$1")
    .replace(/\s+/g, " ")
    .trim();

/* ------------------------- site-level information ------------------------- */

function readPackage() {
  try {
    return JSON.parse(readIfExists(join(ROOT, "package.json")) || "{}");
  } catch {
    return {};
  }
}

function readReadme() {
  const lines = readIfExists(join(ROOT, "README.md")).split(/\r?\n/);
  let heading = "";
  let paragraph = "";
  let collecting = false;
  let inFence = false;

  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith("```")) inFence = !inFence;
    if (inFence) continue;

    const h1 = line.match(/^#\s+(.+)$/);
    if (h1 && !heading) {
      heading = cleanMd(h1[1]);
      continue;
    }
    if (!heading) continue;

    const isProse = line && !/^([#>\-*+|`]|\d+\.)/.test(line);
    if (isProse) {
      paragraph += (paragraph ? " " : "") + line;
      collecting = true;
    } else if (collecting) {
      break; // end of first paragraph
    }
  }
  return { heading, paragraph: cleanMd(paragraph) };
}

const pkg = readPackage();
const readme = readReadme();

const siteName = pkg.name || "";
const siteHeading = readme.heading || siteName || "Notes";
const siteIntro = readme.paragraph || pkg.description || "";
const siteUrl = siteName.includes(".") ? `https://${siteName}` : "";

const repoUrl = (() => {
  const raw = (pkg.repository && (pkg.repository.url || pkg.repository)) || pkg.homepage || "";
  return typeof raw === "string"
    ? raw.replace(/^git\+/, "").replace(/\.git$/, "").replace(/#.*$/, "")
    : "";
})();

// "notes.compileartisan.dev" -> dim "notes." / bright "CompileArtisan" / dim ".dev"
// The bright part borrows the casing of the GitHub owner name when it matches,
// which is how the exported notes spell it.
const brand = (() => {
  const parts = siteName.split(".");
  const owner = (repoUrl.match(/github\.com\/([^/]+)/i) || [])[1] || "";
  if (parts.length >= 3) {
    const main = owner.toLowerCase() === parts[1].toLowerCase() ? owner : parts[1];
    return { before: parts[0] + ".", main, after: "." + parts.slice(2).join(".") };
  }
  return { before: "", main: siteName || siteHeading, after: "" };
})();

const assetsDir = join(ROOT, "assets");
const assetFiles = existsSync(assetsDir) ? readdirSync(assetsDir) : [];
const fontFile = assetFiles.find((f) => /\.(woff2|woff|ttf|otf)$/i.test(f));
const ogImage = assetFiles.find((f) => /^og-image\.(png|jpe?g|webp)$/i.test(f));
const fontSrc = fontFile ? `./assets/${encodeURI(fontFile)}` : REMOTE_BRAND_FONT;

/* ------------------------------ parsing courses ------------------------------ */

/** Parse an Org file for title, description, tags, headings, code blocks and words. */
function parseOrg(path) {
  const lines = readFileSync(path, "utf-8").split(/\r?\n/);
  let title = null;
  let description = null;
  let tags = [];
  const headings = [];
  let codeBlocks = 0;
  let words = 0;
  let inBlock = false;

  for (const line of lines) {
    const kw = line.match(/^#\+(\w+):\s*(.*)$/i);
    if (kw) {
      const key = kw[1].toLowerCase();
      if (key === "title") title = cleanOrg(kw[2]);
      else if (key === "description") description = cleanOrg(kw[2]);
      else if (key === "filetags") tags = kw[2].split(":").map((t) => t.trim()).filter(Boolean);
    }
    if (/^\s*#\+begin_/i.test(line)) {
      inBlock = true;
      if (/^\s*#\+begin_src/i.test(line)) codeBlocks++;
      continue;
    }
    if (/^\s*#\+end_/i.test(line)) {
      inBlock = false;
      continue;
    }
    if (inBlock) continue;
    if (/^\s*#/.test(line)) continue; // comments and other keywords
    if (/^\s*\|[-+|\s]+\|?\s*$/.test(line)) continue; // table rules

    const h = line.match(/^(\*+)\s+(.+)$/);
    if (h) {
      const text = cleanOrg(h[2]);
      if (text) headings.push({ level: h[1].length, text });
    }
    words += line.split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length;
  }
  return { title, description, tags, headings, codeBlocks, words };
}

/** Fallback when there is no .org file: read the exported HTML. */
function parseHtml(path) {
  const html = readFileSync(path, "utf-8");
  const title = (html.match(/<title>([^<]*)<\/title>/i) || [])[1];
  const headings = [];
  const re = /<h([2-6]) id="[^"]*">(?:<span[^>]*>[^<]*<\/span>)?\s*([\s\S]*?)<\/h\1>/gi;
  let m;
  while ((m = re.exec(html))) {
    const text = m[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    if (text && text !== "Table of Contents") headings.push({ level: Number(m[1]) - 1, text });
  }
  const codeBlocks = (html.match(/<pre class="src/g) || []).length;
  const body = html.replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>|<[^>]+>/g, " ");
  const words = body.split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length;
  return {
    title: title ? title.trim() : null,
    description: null,
    tags: [],
    headings,
    codeBlocks,
    words,
  };
}

function lastUpdated(folder, files) {
  try {
    const out = execSync(`git log -1 --format=%cI -- "${folder}"`, {
      cwd: ROOT,
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
    if (out) return new Date(out);
  } catch {
    /* not a git checkout */
  }
  return new Date(Math.max(...files.filter(existsSync).map((f) => statSync(f).mtimeMs)));
}

const folders = readdirSync(ROOT)
  .filter((name) => !name.startsWith(".") && name !== "node_modules")
  .filter((name) => statSync(join(ROOT, name)).isDirectory())
  .sort();

const courses = [];

for (const folder of folders) {
  const dir = join(ROOT, folder);
  const htmlFiles = readdirSync(dir).filter((f) => f.endsWith(".html"));
  if (htmlFiles.length === 0) continue; // not exported, so not listed

  const entry = htmlFiles.includes("index.html") ? "index.html" : htmlFiles[0];
  const htmlPath = join(dir, entry);
  const orgPath = join(dir, entry.replace(/\.html$/, ".org"));

  const parsed = existsSync(orgPath) ? parseOrg(orgPath) : parseHtml(htmlPath);
  const topics = parsed.headings.filter((h) => h.level === 1).map((h) => h.text);

  courses.push({
    folder,
    href: entry === "index.html" ? `./${folder}/` : `./${folder}/${entry}`,
    title: parsed.title || folder,
    description: parsed.description || "",
    tags: parsed.tags,
    topics,
    sections: parsed.headings.length,
    codeBlocks: parsed.codeBlocks,
    words: parsed.words,
    minutes: Math.max(1, Math.round(parsed.words / WORDS_PER_MINUTE)),
    updated: lastUpdated(folder, [htmlPath, orgPath]),
  });
}

courses.sort((a, b) => a.title.localeCompare(b.title));

const totals = courses.reduce(
  (t, c) => ({
    sections: t.sections + c.sections,
    code: t.code + c.codeBlocks,
    minutes: t.minutes + c.minutes,
  }),
  { sections: 0, code: 0, minutes: 0 }
);
const newest = courses.reduce((a, b) => (a && a.updated > b.updated ? a : b), null);
const allTags = [...new Set(courses.flatMap((c) => c.tags))].sort();

/* ------------------------------ render ------------------------------ */

const rows = courses
  .map((c) => {
    const pills = c.topics.slice(0, MAX_TOPIC_PILLS).map((t) => `<li>${esc(t)}</li>`).join("");
    const extra =
      c.topics.length > MAX_TOPIC_PILLS
        ? `<li class="more">+${c.topics.length - MAX_TOPIC_PILLS} more</li>`
        : "";
    const search = [c.title, c.description, c.tags.join(" "), c.topics.join(" ")].join(" ").toLowerCase();
    return `
  <li class="course" data-search="${esc(search)}" data-tags="${esc(c.tags.join("|"))}" data-title="${esc(
      c.title.toLowerCase()
    )}" data-updated="${c.updated.getTime()}" data-size="${c.words}">
    <a class="course-link" href="${esc(c.href)}">
      <div class="course-main">
        <h2>${esc(c.title)}</h2>
        ${c.description ? `<p class="desc">${esc(c.description)}</p>` : ""}
        ${pills ? `<ul class="topics" aria-label="Chapters">${pills}${extra}</ul>` : ""}
      </div>
      <dl class="facts">
        <div><dt>Sections</dt><dd>${c.sections}</dd></div>
        <div><dt>Code examples</dt><dd>${c.codeBlocks}</dd></div>
        <div><dt>Reading time</dt><dd>${fmtMinutes(c.minutes)}</dd></div>
        <div><dt>Updated</dt><dd>${fmtDate(c.updated)}</dd></div>
      </dl>
    </a>
  </li>`;
  })
  .join("\n");

const tagButtons = allTags
  .map((t) => `<button type="button" class="chip" data-tag="${esc(t)}" aria-pressed="false">${esc(t)}</button>`)
  .join("\n      ");

const summary = courses.length
  ? `${plural(courses.length, "course")}, ${plural(totals.sections, "section")}, ${plural(
      totals.code,
      "code example"
    )} and about ${fmtMinutes(totals.minutes)} of reading.${
      newest ? ` Last updated ${fmtDate(newest.updated)}.` : ""
    }`
  : "No courses have been exported yet.";

const pageTitle = TITLE.link.text + TITLE.rest;
const ogDescription = siteIntro || summary;

const brandHtml =
  (brand.before ? `<span class="dim">${esc(brand.before)}</span>` : "") +
  `<span class="bright">${esc(brand.main)}</span>` +
  (brand.after ? `<span class="dim">${esc(brand.after)}</span>` : "");

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#1a1a2e">
<meta name="description" content="${esc(ogDescription)}">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(pageTitle)}">
<meta property="og:description" content="${esc(ogDescription)}">
${siteUrl ? `<meta property="og:url" content="${esc(siteUrl)}">` : ""}
${
  ogImage && siteUrl
    ? `<meta property="og:image" content="${esc(siteUrl)}/assets/${esc(ogImage)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${esc(siteUrl)}/assets/${esc(ogImage)}">`
    : `<meta name="twitter:card" content="summary">`
}
<title>${esc(pageTitle)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;0,8..60,650;1,8..60,400&family=JetBrains+Mono:wght@400;500;600&display=swap">
<script>
(function () {
  try {
    var t = localStorage.getItem('ca-theme');
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
  } catch (e) {}
})();
</script>
<style>
/* ═══════════════════════════════════════════════════════════
   CompileArtisan Notes: index page (same theme as the notes)
   Flat page · serif text · light/dark
═══════════════════════════════════════════════════════════ */

@font-face {
  font-family: 'DOSVGA';
  src: url('${fontSrc}') format('truetype');
  font-display: swap;
}

/* ─── Design tokens ─────────────────────────────────────── */
:root {
  color-scheme: light;
  --header-h: 48px;
  --measure: 760px;

  --bg: #ffffff;
  --surface: #ffffff;
  --surface-2: #f6f6f8;
  --text: #1b1b22;
  --text-soft: #2c2c37;
  --muted: #6f6f7c;
  --border: #e6e6ea;
  --border-strong: #d4d4dc;
  --accent: #3d3dbf;
  --accent-hover: #2a2a9a;
  --accent-soft: #f0f0fb;
  --header-bg: #1a1a2e;

  --inline-code-bg: #f1f1f5;
  --inline-code-fg: #2c2c3a;

  --font-serif: "Source Serif 4", "Source Serif Pro", Charter, "Iowan Old Style", "Palatino Linotype", Georgia, serif;
  --font-sans: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, "SF Mono", "Cascadia Code", Menlo, Consolas, monospace;
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    color-scheme: dark;
    --bg: #121217;
    --surface: #121217;
    --surface-2: #18181f;
    --text: #e6e6ec;
    --text-soft: #d0d0d9;
    --muted: #8e8e9c;
    --border: #26262f;
    --border-strong: #353540;
    --accent: #9c9cff;
    --accent-hover: #bcbcff;
    --accent-soft: #1d1d30;
    --header-bg: #0d0d18;
    --inline-code-bg: #20202b;
    --inline-code-fg: #dedeea;
  }
}
:root[data-theme="dark"] {
  color-scheme: dark;
  --bg: #121217;
  --surface: #121217;
  --surface-2: #18181f;
  --text: #e6e6ec;
  --text-soft: #d0d0d9;
  --muted: #8e8e9c;
  --border: #26262f;
  --border-strong: #353540;
  --accent: #9c9cff;
  --accent-hover: #bcbcff;
  --accent-soft: #1d1d30;
  --header-bg: #0d0d18;
  --inline-code-bg: #20202b;
  --inline-code-fg: #dedeea;
}

/* ─── Reset & base ──────────────────────────────────────── */
*, *::before, *::after { box-sizing: border-box; }

@media (prefers-reduced-motion: no-preference) {
  html { scroll-behavior: smooth; }
}
html { -webkit-text-size-adjust: 100%; }

body {
  margin: 0;
  padding: var(--header-h) 0 0;
  font-family: var(--font-serif);
  font-size: 18px;
  line-height: 1.7;
  color: var(--text);
  background: var(--bg);
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}

::selection { background: color-mix(in srgb, var(--accent) 25%, transparent); }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

a {
  color: var(--accent);
  text-decoration: underline;
  text-decoration-thickness: 1px;
  text-underline-offset: 3px;
  text-decoration-color: color-mix(in srgb, var(--accent) 40%, transparent);
  transition: color .15s, text-decoration-color .15s;
}
a:hover { color: var(--accent-hover); text-decoration-color: currentColor; }

code {
  font-family: var(--font-mono);
  padding: .1em .35em;
  font-size: .82em;
  color: var(--inline-code-fg);
  background: var(--inline-code-bg);
  border-radius: 3px;
}
kbd {
  padding: 1px 5px;
  font: .8em var(--font-mono);
  color: var(--text);
  border: 1px solid var(--border-strong);
  border-bottom-width: 2px;
  border-radius: 3px;
}

/* ─── Header ────────────────────────────────────────────── */
.site-header {
  position: fixed;
  top: 0; left: 0; right: 0;
  z-index: 1200;
  height: var(--header-h);
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 20px;
  background: var(--header-bg);
}
.site-header .brand {
  font-family: 'DOSVGA', var(--font-mono);
  font-size: 1.1rem;
  letter-spacing: .03em;
  line-height: 1;
  text-decoration: none;
  white-space: nowrap;
}
.site-header .brand:hover { text-decoration: none; }
.brand .dim { color: #7b7bad; }
.brand .bright { color: #dcdcff; }
.brand .cursor {
  display: inline-block;
  width: .55em; height: 1em;
  margin-left: 5px;
  vertical-align: -.14em;
  background: #b8b8ff;
  animation: blink 1.1s steps(1) infinite;
}
@keyframes blink { 50% { opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .brand .cursor { animation: none; } }
.site-header .spacer { flex: 1; }
.site-header .nav-link {
  font: 13px var(--font-sans);
  color: #a8a8cc;
  text-decoration: none;
  padding: 0 6px;
}
.site-header .nav-link:hover { color: #fff; }

.icon-btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: 32px; height: 32px;
  padding: 0;
  color: #a8a8cc;
  background: transparent;
  border: 0;
  border-radius: 4px;
  cursor: pointer;
  transition: color .15s;
}
.icon-btn:hover { color: #fff; }
.icon-btn:focus-visible, .site-header .nav-link:focus-visible, .brand:focus-visible { outline-color: #b8b8ff; }

.site-header .progress {
  position: absolute;
  left: 0; bottom: 0;
  width: 100%; height: 2px;
  background: #8c8cff;
  transform: scaleX(0);
  transform-origin: 0 50%;
  pointer-events: none;
}

/* ─── Main content (flat, no card) ──────────────────────── */
main {
  max-width: var(--measure);
  margin: 0 auto;
  padding: 56px 32px 96px;
}

h1.title {
  margin: 0 0 1.2rem;
  font-family: 'DOSVGA', var(--font-mono);
  font-size: clamp(2.6rem, 8vw, 4rem);
  font-weight: 400;
  line-height: 1.1;
  letter-spacing: .02em;
  overflow-wrap: anywhere;
}
h1.title a {
  color: var(--accent);
  text-decoration-thickness: 2px;
  text-underline-offset: 6px;
}
h1.title a:hover { color: var(--accent-hover); }
h1.title::after {
  content: "";
  display: block;
  width: 36px; height: 3px;
  margin-top: 18px;
  background: var(--accent);
}
.lede { margin: 0 0 1.1rem; color: var(--text-soft); }
.summary {
  margin: 1.8rem 0 0;
  padding: .1rem 0 .1rem 1.3rem;
  color: var(--muted);
  font-style: italic;
  border-left: 3px solid var(--accent);
}

/* ─── Controls ──────────────────────────────────────────── */
.controls {
  position: sticky; top: var(--header-h); z-index: 5;
  margin: 2.6rem -32px 0; padding: 14px 32px;
  font-family: var(--font-sans);
  background: var(--bg);
  border-bottom: 1px solid var(--border);
}
.controls-row { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; }
.search { position: relative; flex: 1 1 260px; }
.search::before {
  content: "";
  position: absolute; left: 10px; top: 50%;
  width: 14px; height: 14px;
  transform: translateY(-50%);
  background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%239a9ab0' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='11' cy='11' r='8'/%3E%3Cpath d='m21 21-4.35-4.35'/%3E%3C/svg%3E") no-repeat center;
  pointer-events: none;
}
.search kbd {
  position: absolute; right: 8px; top: 50%;
  transform: translateY(-50%);
  padding: 0 6px;
  font: 11px/17px var(--font-mono);
  color: var(--muted);
  pointer-events: none;
}
.search:focus-within kbd { display: none; }
.search input, .sort select {
  width: 100%;
  font: 13.5px var(--font-sans);
  color: var(--text);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 4px;
  outline: none;
  transition: border-color .15s;
}
.search input { padding: 7px 32px 7px 30px; }
.search input:focus, .sort select:focus { border-color: var(--accent); }
.search input::placeholder { color: var(--muted); opacity: .7; }
.sort { flex: 0 0 auto; display: flex; align-items: center; gap: 8px; color: var(--muted); font-size: 13px; }
.sort select { width: auto; padding: 7px 8px; }

.chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
.chip {
  font: 12px var(--font-mono);
  cursor: pointer;
  color: var(--muted); background: transparent;
  border: 1px solid var(--border-strong); border-radius: 3px;
  padding: 3px 9px;
  transition: color .12s, border-color .12s;
}
.chip::before { content: "#"; opacity: .6; }
.chip:hover { border-color: var(--accent); color: var(--accent); }
.chip[aria-pressed="true"] { background: var(--accent); border-color: var(--accent); color: var(--bg); }
.result-count { margin: 12px 0 0; font-size: 13px; color: var(--muted); }

/* ─── Course list ───────────────────────────────────────── */
.courses { list-style: none; margin: 0; padding: 0; }
.course { border-bottom: 1px solid var(--border); }
.course[hidden] { display: none; }
.course-link {
  display: grid; grid-template-columns: minmax(0, 1fr) 200px; gap: 28px;
  padding: 26px 0;
  color: inherit; text-decoration: none;
}
.course-link:hover { color: inherit; }
.course h2 {
  margin: 0 0 .35rem;
  font-size: 1.35rem; font-weight: 600; line-height: 1.25;
  color: var(--text);
  transition: color .15s;
}
.course-link:hover h2 {
  color: var(--accent);
  text-decoration: underline;
  text-decoration-thickness: 1px;
  text-underline-offset: 4px;
}
.desc { margin: 0 0 .7rem; font-size: 1rem; color: var(--text-soft); }

.topics { list-style: none; margin: .5rem 0 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px; }
.topics li {
  font: 12px/1 var(--font-mono);
  color: var(--inline-code-fg);
  background: var(--inline-code-bg);
  border-radius: 3px;
  padding: 5px 7px;
}
.topics li.more { background: transparent; color: var(--muted); padding-left: 2px; }

.facts { margin: 0; display: grid; gap: 6px; align-content: start; font: 13.5px/1.5 var(--font-sans); }
.facts div { display: flex; justify-content: space-between; gap: 12px; border-bottom: 1px solid var(--border); padding-bottom: 4px; }
.facts dt { color: var(--muted); }
.facts dd { margin: 0; color: var(--text-soft); font-variant-numeric: tabular-nums; text-align: right; }

.empty { display: none; padding: 40px 0; color: var(--muted); }
.empty.show { display: block; }
.empty button {
  font: inherit; color: var(--accent);
  background: none; border: 0; padding: 0; cursor: pointer;
  text-decoration: underline; text-underline-offset: 3px;
}

footer {
  max-width: var(--measure);
  margin: 0 auto;
  padding: 0 32px 56px;
  font: 13px var(--font-sans);
  color: var(--muted);
}
footer p { margin: 0; padding-top: 20px; border-top: 1px solid var(--border); }

/* ─── Responsive ────────────────────────────────────────── */
@media (max-width: 720px) {
  main { padding: 36px 20px 72px; }
  .controls { margin: 2rem -20px 0; padding: 12px 20px; }
  footer { padding: 0 20px 48px; }
  .course-link { grid-template-columns: 1fr; gap: 14px; }
  .facts { grid-template-columns: 1fr 1fr; column-gap: 20px; }
}
@media (max-width: 480px) {
  body { font-size: 17px; }
  .site-header { padding: 0 14px; }
  .site-header .brand { font-size: 1rem; }
}

/* ─── Print ─────────────────────────────────────────────── */
@media print {
  .site-header, .controls { display: none !important; }
  body { padding: 0; background: #fff; color: #000; }
}
</style>
</head>
<body>

<main>
  <h1 class="title"><b><a href="${esc(TITLE.link.href)}">${esc(TITLE.link.text)}</a>${esc(TITLE.rest)}</b></h1>
  ${siteIntro ? `<p class="lede">${esc(siteIntro)}</p>` : ""}
  <p class="summary">${esc(summary)}</p>

  <section class="controls" aria-label="Find a course">
    <div class="controls-row">
      <div class="search">
        <input id="q" type="text" placeholder="Search courses, chapters or keywords" aria-label="Search courses" autocomplete="off" spellcheck="false">
        <kbd>/</kbd>
      </div>
      <label class="sort">Sort by
        <select id="sort">
          <option value="title">Name</option>
          <option value="updated">Recently updated</option>
          <option value="size">Longest first</option>
        </select>
      </label>
    </div>
    ${allTags.length ? `<div class="chips" role="group" aria-label="Filter by subject">\n      ${tagButtons}\n    </div>` : ""}
    <p class="result-count" id="count" aria-live="polite"></p>
  </section>

  <ul class="courses" id="courses">
${rows}
  </ul>
  <div class="empty" id="empty">
    No course matches that search. <button type="button" id="reset">Clear filters</button>
  </div>
</main>

<footer>
  <p>Generated ${esc(fmtDate(new Date()))} from ${plural(courses.length, "course")}${
  repoUrl ? `. <a href="${esc(repoUrl)}">Source on GitHub</a>` : ""
}.</p>
</footer>

<script>
document.addEventListener('DOMContentLoaded', function () {
  'use strict';

  var body = document.body;
  var root = document.documentElement;

  /* ── Header (injected, same as the notes) ───────────────── */
  var ICON = {
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>'
  };
  function svg(inner) {
    return '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" ' +
      'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + inner + '</svg>';
  }

  var header = document.createElement('header');
  header.className = 'site-header';
  header.innerHTML =
    '<a class="brand" href="./">' + ${JSON.stringify(brandHtml)} +
    '<span class="cursor" aria-hidden="true"></span></a>' +
    '<span class="spacer"></span>' +
    ${JSON.stringify(repoUrl ? `<a class="nav-link" href="${esc(repoUrl)}">Source</a>` : "")} +
    '<button class="icon-btn theme-btn" type="button"></button>' +
    '<div class="progress" aria-hidden="true"></div>';
  body.insertBefore(header, body.firstChild);

  /* ── Theme toggle ───────────────────────────────────────── */
  var themeBtn = header.querySelector('.theme-btn');
  var mq = window.matchMedia('(prefers-color-scheme: dark)');
  function effectiveTheme() {
    return root.getAttribute('data-theme') || (mq.matches ? 'dark' : 'light');
  }
  function paintThemeBtn() {
    var dark = effectiveTheme() === 'dark';
    themeBtn.innerHTML = svg(dark ? ICON.sun : ICON.moon);
    themeBtn.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
    themeBtn.title = themeBtn.getAttribute('aria-label');
  }
  themeBtn.addEventListener('click', function () {
    var next = effectiveTheme() === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem('ca-theme', next); } catch (e) {}
    paintThemeBtn();
  });
  if (mq.addEventListener) mq.addEventListener('change', paintThemeBtn);
  paintThemeBtn();

  /* ── Scroll progress bar ────────────────────────────────── */
  var bar = header.querySelector('.progress');
  var ticking = false;
  function updateBar() {
    var max = document.documentElement.scrollHeight - window.innerHeight;
    bar.style.transform = 'scaleX(' + (max > 0 ? Math.min(1, window.scrollY / max) : 0) + ')';
  }
  window.addEventListener('scroll', function () {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () { ticking = false; updateBar(); });
  }, { passive: true });
  window.addEventListener('resize', updateBar);
  updateBar();

  /* ── Search, tag filter, sort ───────────────────────────── */
  var list = document.getElementById('courses');
  var items = Array.prototype.slice.call(list.children);
  var q = document.getElementById('q');
  var sort = document.getElementById('sort');
  var count = document.getElementById('count');
  var empty = document.getElementById('empty');
  var chips = Array.prototype.slice.call(document.querySelectorAll('.chip'));
  var activeTag = null;

  function noun(n) { return n === 1 ? 'course' : 'courses'; }

  function apply() {
    var terms = q.value.toLowerCase().split(/\\s+/).filter(Boolean);
    var shown = 0;
    items.forEach(function (li) {
      var hay = li.getAttribute('data-search');
      var tags = li.getAttribute('data-tags').split('|');
      var ok = terms.every(function (t) { return hay.indexOf(t) !== -1; }) &&
               (!activeTag || tags.indexOf(activeTag) !== -1);
      li.hidden = !ok;
      if (ok) shown++;
    });
    count.textContent = shown === items.length
      ? 'Showing all ' + items.length + ' ' + noun(items.length)
      : 'Showing ' + shown + ' of ' + items.length + ' ' + noun(items.length);
    empty.classList.toggle('show', shown === 0);
  }

  function reorder() {
    var key = sort.value;
    items.sort(function (a, b) {
      if (key === 'updated') return Number(b.dataset.updated) - Number(a.dataset.updated);
      if (key === 'size') return Number(b.dataset.size) - Number(a.dataset.size);
      return a.dataset.title.localeCompare(b.dataset.title);
    });
    items.forEach(function (li) { list.appendChild(li); });
  }

  q.addEventListener('input', apply);
  q.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { q.value = ''; apply(); q.blur(); }
    if (e.key === 'Enter') {
      var first = list.querySelector('.course:not([hidden]) .course-link');
      if (first) first.click();
    }
  });
  sort.addEventListener('change', reorder);
  chips.forEach(function (chip) {
    chip.addEventListener('click', function () {
      var tag = chip.getAttribute('data-tag');
      activeTag = activeTag === tag ? null : tag;
      chips.forEach(function (c) {
        c.setAttribute('aria-pressed', String(c.getAttribute('data-tag') === activeTag));
      });
      apply();
    });
  });
  document.getElementById('reset').addEventListener('click', function () {
    q.value = ''; activeTag = null;
    chips.forEach(function (c) { c.setAttribute('aria-pressed', 'false'); });
    apply(); q.focus();
  });

  // Press "/" anywhere to start searching (same shortcut as the notes' sidebar)
  document.addEventListener('keydown', function (e) {
    var tag = (document.activeElement && document.activeElement.tagName) || '';
    if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(tag) && !e.metaKey && !e.ctrlKey) {
      e.preventDefault(); q.focus();
    }
  });

  apply();
});
</script>

</body>
</html>
`;

writeFileSync(OUTPUT, html);
console.log(`index.html generated with ${courses.length} course(s)`);
for (const c of courses) {
  console.log(`  - ${c.folder}: ${c.sections} sections, ${c.codeBlocks} code blocks, ~${c.minutes} min`);
}
