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
  <meta charset="UTF-8">
  <title>Projects</title>
  <style>

 /* General styles */
 body {
   font-family: 'Arial', sans-serif;
   line-height: 1.6;
   margin: 0;
   padding: 0;
   background-color: #f4f4f4;
 }

 #postamble, #preamble {
   margin-left: 280px;
   padding: 20px 40px;
 }
 h1, h2, h3 {
   font-family: 'Helvetica', sans-serif;
 }
body > h1 {
  margin-top: 80px;           /* clears the fixed header */
  margin-left: 280px;         /* align with content/sidebar */
  padding: 10px 0;
  font-size: 2.2em;
  font-weight: 600;
  color: #111827;
  border-bottom: 2px solid #e5e7eb;
  letter-spacing: 0.02em;
}
body > ul {
  list-style: none;
  margin-left: 280px;
  padding: 20px 0;
  max-width: 900px;
}

body > ul li {
  margin: 12px 0;
}

body > ul li a {
  display: inline-block;
  padding: 10px 14px;
  font-size: 1.05em;
  color: #0000aa;
  text-decoration: none;
  border-radius: 6px;
  transition: all 0.2s ease;
}

body > ul li a:hover {
  background-color: #eef2ff;
  color: #000088;
  transform: translateX(4px);
}


 pre {
   background-color: #333;
   color: white;
   padding: 10px;
   overflow-x: auto;
   white-space: pre-wrap;
   word-wrap: break-word;
 }
 /* Styling code blocks */
 pre.src.src-html, pre.src.src-txt, pre.src.src-python, pre.src.src-java {
   font-family: 'Courier New', monospace;
   background-color: #222;
   color: white;
   padding: 15px;
   font-size: 1.1em;
   border-radius: 0.5em;
 }
 code {
   font-size: 1em;
 }
 img {
      max-width: 100%;
      height: auto;
      display: block;
      margin: 0 auto;
 }

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
   src: url('/home/praaneshnair/.config/doom/perfect-dos-vga-437-win.ttf') format('truetype');
 }

 /* Table of Contents Sidebar */
 #table-of-contents {
   position: fixed;
   left: 0;
   top: 45px;
   width: 280px;
   height: calc(100vh - 45px);
   overflow-y: auto;
   background-color: #f8f8f8;
   border-right: 1px solid #ddd;
   padding: 30px 20px;
   box-sizing: border-box;
   z-index: 10;
 }

 #table-of-contents h2 {
   margin-top: 0;
   color: #0000aa;
   font-size: 1.1em;
   border-bottom: 1px solid #ddd;
   padding-bottom: 10px;
   margin-bottom: 15px;
 }

 #table-of-contents ul {
   list-style-type: none;
   padding-left: 0;
   margin: 0;
 }

 #table-of-contents ul ul {
   padding-left: 15px;
   margin-top: 5px;
 }

 #table-of-contents li {
   margin: 8px 0;
 }

 #table-of-contents a {
   color: #555;
   text-decoration: none;
   display: block;
   padding: 5px 10px;
   border-radius: 4px;
   transition: all 0.2s ease;
   font-size: 0.95em;
 }

 #table-of-contents a:hover {
   color: #0000aa;
   background-color: #e8e8ff;
 }

 /* Main content area */
 #content {
   margin-left: 280px;
   margin-top: 45px;
   padding: 40px;
   background-color: #ffffff;
   min-height: calc(100vh - 45px);
 }
 table {
   border-collapse: collapse;
   margin: 1.5rem auto;
   font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
   font-size: 1rem;
   background: #ffffff;
   box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
   border-radius: 10px;
   overflow: hidden; /* clips rounded corners */
 }
 
 /* Remove legacy borders from org export */
 table[border] {
   border: none;
 }
 
 /* Table cells */
 td {
   padding: 0.75rem 1.1rem;
   text-align: center;
   border: 1px solid #e5e7eb; /* light gray */
   font-weight: 500;
   color: #111827;
 }
 
 /* Align org-left cleanly (override if needed) */
 td.org-left {
   text-align: center;
 }
 
 /* Zebra striping */
 tbody tr:nth-child(even) {
   background-color: #f9fafb;
 }
 
 /* Hover effect */
 tbody tr:hover {
   background-color: #eef2ff;
 }
 
 /* Make letters stand out */
 td {
   letter-spacing: 0.05em;
 }

 /* Responsive Design */
 @media screen and (max-width: 768px) {
   #table-of-contents {
     position: static;
     width: 100%;
     height: auto;
     border-right: none;
     border-bottom: 2px solid #0000aa;
   }
   
   #content {
     margin-left: 0;
   }
   
   body {
     font-size: 14px;
     padding: 10px;
   }
   h1 {
     font-size: 1.5em;
   }
   pre {
     font-size: 1.3em;
   }
 }

 @media screen and (max-width: 480px) {
   body {
     font-size: 12px;
     padding: 5px;
   }
   h1 {
     font-size: 1.3em;
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
