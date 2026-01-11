import { readdirSync, statSync, writeFileSync } from "fs";
import { join } from "path";

const ROOT = "/home/praaneshnair/gitProjects/notes.compileartisan.dev";
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
  <title>Projects</title>
  <style>
    body { font-family: system-ui; padding: 2rem; }
    ul { line-height: 1.8; }
    a { text-decoration: none; color: #2563eb; }
  </style>
</head>
<body>
  <h1>Files</h1>
  <ul>
    ${links}
  </ul>
</body>
</html>
`;

writeFileSync(OUTPUT, html);
console.log("index.html generated");
