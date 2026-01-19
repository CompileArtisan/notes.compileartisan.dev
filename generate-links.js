import { readdirSync, statSync, writeFileSync } from "fs";
import { join } from "path";

// Use current working directory instead of hardcoded path
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
<meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Notes - CompileArtisan</title>
  <style>  
    body {
      font-family: 'Arial', sans-serif;
      line-height: 1.6;
      margin: 0;
      background-color: #f4f4f4;
    }

    /* Header - exact match from notes */
    .header {
      text-align: center;
      margin: 0px;
      background-color: #0000aa;
      color: #ffffff;
      padding: 5px 0;
      flex-shrink: 0;
      word-wrap: break-word;
      font-family: DOSVGA, monospace;
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      z-index: 1000;
      box-shadow: 0 2px 5px rgba(0,0,0,0.2);
    }

    .header a {
      color: #ffffff;
      text-decoration: none;
      font-size: 1.5em;
      white-space: nowrap;
      transition: all 0.3s ease;
      padding: 0px;
    }

    .header a:hover {
      color: #bababa;
    }

    @font-face {
      font-family: DOSVGA;
      src: url('./assets/perfect-dos-vga-437-win.ttf') format('truetype');
    }

    /* Main content */
    h1 {
      margin-top: 80px;
      padding: 10px 20px;
      font-size: 2.2em;
      font-weight: 600;
      color: #111827;
      border-bottom: 2px solid #e5e7eb;
      letter-spacing: 0.02em;
    }

    ul {
      list-style: none;
      padding: 20px;
      max-width: 900px;
      margin: 0 auto;
    }

    ul li {
      margin: 12px 0;
    }

    ul li a {
      display: inline-block;
      padding: 10px 14px;
      font-size: 1.05em;
      color: #0000aa;
      text-decoration: none;
      border-radius: 6px;
      transition: all 0.2s ease;
    }

    ul li a:hover {
      background-color: #eef2ff;
      color: #000088;
      transform: translateX(4px);
    }

    /* Responsive Design */
    @media screen and (max-width: 768px) {
      h1 {
        font-size: 1.8em;
        padding: 10px 15px;
      }

      ul {
        padding: 15px;
      }

      ul li a {
        font-size: 1em;
        padding: 8px 12px;
      }
    }

 @media screen and (max-width: 480px) {
   body {
     font-size: 14px;
   }
   h1 {
     font-size: 1.5em;
   }
   pre {
     font-size: 1.3em;
   }
 }

</style>
</head>
 <div class="header">
 <a href="https://compileartisan.pages.dev/">CompileArtisan</a>
 </div>
<body>
  <h1>Notes</h1>
  <ul>
    ${links}
  </ul>
</body>
</html>
`;

writeFileSync(OUTPUT, html);
console.log("index.html generated");
