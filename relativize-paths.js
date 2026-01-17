import { readdirSync, statSync, readFileSync, writeFileSync } from "fs";
import { join, dirname, relative, sep } from "path";

// Use current working directory instead of hardcoded path
const ROOT = process.cwd();
const ASSETS_DIR = "assets";
const FONT_NAME = "perfect-dos-vga-437-win.ttf";

/**
 * Calculate relative path from one file to another
 */
function getRelativePath(from, to) {
  const fromDir = dirname(from);
  let rel = relative(fromDir, to);
  
  // Convert backslashes to forward slashes for web
  rel = rel.split(sep).join('/');
  
  // Ensure it starts with ./ or ../
  if (!rel.startsWith('.')) {
    rel = './' + rel;
  }
  
  return rel;
}

/**
 * Process a single HTML file
 */
function processHtmlFile(filePath) {
  let content = readFileSync(filePath, 'utf-8');
  let modified = false;

  // Calculate relative path to font
  const fontPath = join(ROOT, ASSETS_DIR, FONT_NAME);
  const relativeFontPath = getRelativePath(filePath, fontPath);

  // Replace absolute font path
  const fontRegex = /url\(['"]?\/home\/praaneshnair\/\.config\/doom\/perfect-dos-vga-437-win\.ttf['"]?\)/g;
  if (fontRegex.test(content)) {
    content = content.replace(fontRegex, `url('${relativeFontPath}')`);
    modified = true;
    console.log(`  Updated font path to: ${relativeFontPath}`);
  }

  // Replace absolute href links to homepage
  const linkRegex = /href=["']https:\/\/compileartisan\.pages\.dev\/["']/g;
  if (linkRegex.test(content)) {
    // Calculate relative path to root index.html
    const rootIndex = join(ROOT, 'index.html');
    const relativeRoot = getRelativePath(filePath, rootIndex);
    content = content.replace(linkRegex, `href="${relativeRoot}"`);
    modified = true;
    console.log(`  Updated header link to: ${relativeRoot}`);
  }

  // Replace file:// protocol image paths
  // Matches: file:///home/praaneshnair/gitProjects/org-notes/...
  const fileProtocolRegex = /file:\/\/\/home\/praaneshnair\/gitProjects\/org-notes\/([^"'\s)]+\.(png|jpg|jpeg|gif|svg|webp|bmp|ico))/gi;
  content = content.replace(fileProtocolRegex, (match, capturedPath) => {
    // The capturedPath is relative to org-notes directory
    // We need to find where this file actually is in our project structure
    const targetPath = join(ROOT, capturedPath);
    const relativePath = getRelativePath(filePath, targetPath);
    modified = true;
    console.log(`  Updated file:// image path to: ${relativePath}`);
    return relativePath;
  });

  // Replace any other absolute paths that might reference the project root
  const absPathRegex = new RegExp(`/home/praaneshnair/gitProjects/notes\\.compileartisan\\.dev/([^"'\\s)]+)`, 'g');
  content = content.replace(absPathRegex, (match, capturedPath) => {
    const targetPath = join(ROOT, capturedPath);
    const relativePath = getRelativePath(filePath, targetPath);
    modified = true;
    console.log(`  Updated absolute path to: ${relativePath}`);
    return relativePath;
  });

  if (modified) {
    writeFileSync(filePath, content, 'utf-8');
    return true;
  }
  
  return false;
}

/**
 * Recursively find and process all HTML files
 */
function processDirectory(dir) {
  const entries = readdirSync(dir);
  let filesProcessed = 0;

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      // Skip node_modules, .git, assets, etc.
      if (!entry.startsWith('.') && entry !== 'node_modules' && entry !== 'assets') {
        filesProcessed += processDirectory(fullPath);
      }
    } else if (entry.endsWith('.html')) {
      console.log(`Processing: ${relative(ROOT, fullPath)}`);
      if (processHtmlFile(fullPath)) {
        filesProcessed++;
      }
    }
  }

  return filesProcessed;
}

// Run the script
console.log('Starting path relativization...\n');
const count = processDirectory(ROOT);
console.log(`\n✓ Processed ${count} HTML file(s)`);
console.log('\nAll paths have been converted to relative paths!');
console.log('Your site is now ready to deploy! 🚀');
