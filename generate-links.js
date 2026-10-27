// generate-links.js
// Builds the root index.html (the landing page). Nothing about your courses or
// your site is written in this file; everything is read from the repo:
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

// "notes.compileartisan.dev" -> dim "notes." / bright "compileartisan" / dim ".dev"
const brand = (() => {
  const parts = siteName.split(".");
  if (parts.length >= 3) {
    return {
      before: parts[0] + ".",
      main: parts[1],
      after: "." + parts.slice(2).join("."),
    };
  }
  return { before: "", main: siteName || siteHeading, after: "" };
})();

const assetsDir = join(ROOT, "assets");
const assetFiles = existsSync(assetsDir) ? readdirSync(assetsDir) : [];
const fontFile = assetFiles.find((f) => /\.(woff2|woff|ttf|otf)$/i.test(f));
const ogImage = assetFiles.find((f) => /^og-image\.(png|jpe?g|webp)$/i.test(f));

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

const pageTitle = siteHeading;
const ogDescription = siteIntro || summary;

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="description" content="${esc(ogDescription)}">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(pageTitle)}">
<meta property="og:description" content="${esc(ogDescription)}">
${siteUrl ? `<meta property="og:url" content="${esc(siteUrl)}">` : ""}
${
  ogImage && siteUrl
    ? `<meta property="og:image" content="${esc(siteUrl)}/assets/${esc(ogImage)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${esc(siteUrl)}/assets/${esc(ogImage)}">`
    : `<meta name="twitter:card" content="summary">`
}
<title>${esc(pageTitle)}</title>
<style>
${
  fontFile
    ? `  @font-face {
    font-family: 'SiteBrand';
    src: url('./assets/${fontFile}');
    font-display: swap;
  }
`
    : ""
}
  :root {
    --bg: #f4f5f9;
    --surface: #ffffff;
    --ink: #16162a;
    --ink-soft: #4b4b63;
    --ink-faint: #7b7b92;
    --line: #dfe0ea;
    --accent: #2b2bc4;
    --accent-ink: #ffffff;
    --accent-wash: #e9e9ff;
    --header: #1a1a2e;
    --focus: #2b2bc4;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #101018;
      --surface: #171723;
      --ink: #ececf6;
      --ink-soft: #b4b4c8;
      --ink-faint: #8888a0;
      --line: #2a2a3c;
      --accent: #9a9aff;
      --accent-ink: #101018;
      --accent-wash: #25254a;
      --header: #0b0b14;
      --focus: #9a9aff;
    }
  }

  *, *::before, *::after { box-sizing: border-box; }
  html { scroll-behavior: smooth; }
  @media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } }

  body {
    margin: 0;
    background: var(--bg);
    color: var(--ink);
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    font-size: 15px;
    line-height: 1.65;
  }

  a { color: var(--accent); text-underline-offset: 3px; }
  :focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; border-radius: 4px; }

  /* ---------- header ---------- */
  .header {
    position: fixed; top: 0; left: 0; right: 0; z-index: 10;
    height: 48px; padding: 0 24px;
    display: flex; align-items: center; justify-content: space-between;
    background: var(--header);
    border-bottom: 1px solid rgba(255,255,255,0.06);
  }
  .brand {
    font-family: ${fontFile ? "'SiteBrand', " : ""}'Courier New', monospace;
    font-size: 1rem; letter-spacing: 0.03em; text-decoration: none; line-height: 1;
  }
  .brand .dim { color: #7878aa; }
  .brand .bright { color: #d8d8ff; }
  .header nav a { color: #b8b8d8; font-size: 13px; text-decoration: none; }
  .header nav a:hover { color: #fff; text-decoration: underline; }

  main { max-width: 980px; margin: 0 auto; padding: 48px 24px 72px; }

  /* ---------- intro ---------- */
  .intro { padding-top: 40px; }
  .intro h1 {
    margin: 0 0 14px;
    font-size: clamp(1.9rem, 4.2vw, 2.7rem);
    font-weight: 600; line-height: 1.15; letter-spacing: -0.02em;
    overflow-wrap: anywhere;
  }
  .intro .lede { margin: 0 0 14px; max-width: 38em; font-size: 1.07rem; color: var(--ink-soft); }
  .intro .summary {
    margin: 0; padding-left: 14px; max-width: 38em;
    border-left: 3px solid var(--accent);
  }

  /* ---------- controls ---------- */
  .controls {
    position: sticky; top: 48px; z-index: 5;
    margin: 36px -24px 0; padding: 14px 24px;
    background: var(--bg);
    border-bottom: 1px solid var(--line);
  }
  .controls-row { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; }
  .search { position: relative; flex: 1 1 260px; }
  .search input, .sort select {
    width: 100%;
    font: inherit; font-size: 14px; color: var(--ink);
    background: var(--surface);
    border: 1px solid var(--line); border-radius: 8px;
    padding: 9px 12px;
  }
  .search input::placeholder { color: var(--ink-faint); }
  .sort { flex: 0 0 auto; display: flex; align-items: center; gap: 8px; color: var(--ink-soft); font-size: 13px; }
  .sort select { width: auto; padding-right: 8px; }
  .chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
  .chip {
    font: inherit; font-size: 13px; cursor: pointer;
    color: var(--ink-soft); background: transparent;
    border: 1px solid var(--line); border-radius: 999px;
    padding: 3px 12px;
  }
  .chip:hover { border-color: var(--accent); color: var(--accent); }
  .chip[aria-pressed="true"] { background: var(--accent); border-color: var(--accent); color: var(--accent-ink); }
  .result-count { margin: 14px 0 0; font-size: 13px; color: var(--ink-faint); }

  /* ---------- course list ---------- */
  .courses { list-style: none; margin: 0; padding: 0; border-top: 1px solid var(--line); }
  .course { border-bottom: 1px solid var(--line); }
  .course[hidden] { display: none; }
  .course-link {
    display: grid; grid-template-columns: minmax(0, 1fr) 210px; gap: 28px;
    padding: 24px 12px; margin: 0 -12px;
    color: inherit; text-decoration: none; border-radius: 8px;
  }
  .course-link:hover { background: var(--surface); }
  .course h2 { margin: 0 0 6px; font-size: 1.2rem; font-weight: 600; letter-spacing: -0.01em; }
  .course-link:hover h2 { color: var(--accent); text-decoration: underline; text-underline-offset: 4px; }
  .desc { margin: 0 0 12px; color: var(--ink-soft); max-width: 40em; }
  .topics { list-style: none; margin: 10px 0 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px; }
  .topics li {
    font-size: 12.5px; line-height: 1; color: var(--ink-soft);
    background: var(--accent-wash); border-radius: 4px; padding: 5px 8px;
  }
  .topics li.more { background: transparent; color: var(--ink-faint); padding-left: 2px; }

  .facts { margin: 0; display: grid; gap: 6px; align-content: start; font-size: 13px; }
  .facts div { display: flex; justify-content: space-between; gap: 12px; border-bottom: 1px dotted var(--line); padding-bottom: 4px; }
  .facts dt { color: var(--ink-faint); }
  .facts dd { margin: 0; font-variant-numeric: tabular-nums; text-align: right; }

  .empty { display: none; padding: 40px 0; color: var(--ink-soft); }
  .empty.show { display: block; }
  .empty button { font: inherit; color: var(--accent); background: none; border: none; padding: 0; cursor: pointer; text-decoration: underline; }

  footer { max-width: 980px; margin: 0 auto; padding: 24px; border-top: 1px solid var(--line); color: var(--ink-faint); font-size: 13px; }
  footer p { margin: 0; }

  /* ---------- small screens ---------- */
  @media (max-width: 720px) {
    .header { padding: 0 16px; }
    main { padding: 40px 16px 56px; }
    .controls { margin: 28px -16px 0; padding: 12px 16px; }
    .course-link { grid-template-columns: 1fr; gap: 14px; }
    .facts { grid-template-columns: 1fr 1fr; column-gap: 20px; }
  }
  @media (max-width: 420px) { body { font-size: 14px; } }
</style>
</head>
<body>

<div class="header">
  <a class="brand" href="./">${brand.before ? `<span class="dim">${esc(brand.before)}</span>` : ""}<span class="bright">${esc(
  brand.main
)}</span>${brand.after ? `<span class="dim">${esc(brand.after)}</span>` : ""}</a>
  ${repoUrl ? `<nav aria-label="Site"><a href="${esc(repoUrl)}">Source</a></nav>` : ""}
</div>

<main>
  <section class="intro">
    <h1>${esc(siteHeading)}</h1>
    ${siteIntro ? `<p class="lede">${esc(siteIntro)}</p>` : ""}
    <p class="summary">${esc(summary)}</p>
  </section>

  <section class="controls" aria-label="Find a course">
    <div class="controls-row">
      <div class="search">
        <input id="q" type="search" placeholder="Search courses, chapters or keywords" aria-label="Search courses" autocomplete="off">
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
(function () {
  var list = document.getElementById('courses');
  var items = Array.prototype.slice.call(list.children);
  var q = document.getElementById('q');
  var sort = document.getElementById('sort');
  var count = document.getElementById('count');
  var empty = document.getElementById('empty');
  var chips = Array.prototype.slice.call(document.querySelectorAll('.chip'));
  var activeTag = null;

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
      ? 'Showing all ' + items.length + ' courses'
      : 'Showing ' + shown + ' of ' + items.length + ' courses';
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
  sort.addEventListener('change', reorder);
  chips.forEach(function (chip) {
    chip.addEventListener('click', function () {
      var tag = chip.getAttribute('data-tag');
      activeTag = activeTag === tag ? null : tag;
      chips.forEach(function (c) { c.setAttribute('aria-pressed', String(c.getAttribute('data-tag') === activeTag)); });
      apply();
    });
  });
  document.getElementById('reset').addEventListener('click', function () {
    q.value = ''; activeTag = null;
    chips.forEach(function (c) { c.setAttribute('aria-pressed', 'false'); });
    apply(); q.focus();
  });

  // Press "/" anywhere to start searching
  document.addEventListener('keydown', function (e) {
    if (e.key === '/' && document.activeElement !== q && !e.metaKey && !e.ctrlKey) {
      e.preventDefault(); q.focus();
    }
  });

  apply();
})();
</script>

</body>
</html>
`;

writeFileSync(OUTPUT, html);
console.log(`index.html generated with ${courses.length} course(s)`);
for (const c of courses) {
  console.log(`  - ${c.folder}: ${c.sections} sections, ${c.codeBlocks} code blocks, ~${c.minutes} min`);
}
