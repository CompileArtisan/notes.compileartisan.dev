import { readdirSync, statSync, writeFileSync } from "fs";
import { join } from "path";

const ROOT = process.cwd();
const OUTPUT = "./index.html";

const folders = readdirSync(ROOT).filter(name => {
  return statSync(join(ROOT, name)).isDirectory();
});

const links = folders
  .map(folder => {
    const indexFile = join(ROOT, folder, "index.html");
    try {
      statSync(indexFile);
      return `<li><a href="./${folder}/">${folder}</a></li>`;
    } catch {
      return null;
    }
  })
  .filter(Boolean)
  .join("\n");

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta property="og:image" content="https://notes.compileartisan.dev/assets/og-image.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:type" content="website">
<meta property="og:title" content="Notes - CompileArtisan">
<meta property="og:description" content="Course notes from CompileArtisan">
<meta property="og:url" content="https://notes.compileartisan.dev">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="https://notes.compileartisan.dev/assets/og-image.png">
<title>Notes - CompileArtisan</title>
<style>
  @font-face {
    font-family: 'DOSVGA';
    src: url('./assets/perfect-dos-vga-437-win.ttf') format('truetype');
  }

  *, *::before, *::after {
    box-sizing: border-box;
  }

  body {
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    font-size: 15px;
    line-height: 1.7;
    margin: 0;
    padding: 0;
    background-color: #f5f5f7;
    color: #1a1a1a;
  }

  .header {
    position: fixed;
    top: 0; left: 0; right: 0;
    z-index: 1000;
    height: 48px;
    background: #1a1a2e;
    display: flex;
    align-items: center;
    padding: 0 24px;
    border-bottom: 1px solid rgba(255,255,255,0.06);
  }

  .header a {
    font-family: 'DOSVGA', 'Courier New', monospace;
    font-size: 1rem;
    letter-spacing: 0.03em;
    text-decoration: none;
    line-height: 1;
  }

  .header a .dim    { color: #7878aa; }
  .header a .bright { color: #d8d8ff; }

  h1 {
    margin: 80px 0 0;
    padding: 10px 48px;
    font-size: 1.75rem;
    font-weight: 500;
    color: #111;
    border-bottom: 0.5px solid #e0e0e8;
    letter-spacing: 0.01em;
  }

  ul {
    list-style: none;
    padding: 20px 48px;
    max-width: 900px;
    margin: 0;
  }

  ul li {
    margin: 4px 0;
  }

  ul li a {
    display: inline-block;
    padding: 6px 10px;
    font-size: 0.95rem;
    color: #2222cc;
    text-decoration: none;
    border-radius: 6px;
    transition: background 0.12s, color 0.12s, transform 0.12s;
  }

  ul li a:hover {
    background-color: #ededff;
    color: #1a1aaa;
    transform: translateX(3px);
  }

  @media (max-width: 768px) {
    h1 {
      font-size: 1.4rem;
      padding: 10px 20px;
      margin-top: 64px;
    }
    ul {
      padding: 16px 20px;
    }
  }

  @media (max-width: 480px) {
    body { font-size: 14px; }
    h1   { font-size: 1.25rem; }
  }
</style>
</head>
<body>

<div class="header">
  <a href="https://compileartisan.pages.dev/">
    <span class="dim">notes.</span><span class="bright">compileartisan</span><span class="dim">.dev</span>
  </a>
</div>

<h1>Notes</h1>
<ul>
  ${links}
</ul>

</body>
</html>
`;

writeFileSync(OUTPUT, html);
console.log("index.html generated");
