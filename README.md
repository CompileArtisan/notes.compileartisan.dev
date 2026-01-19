# notes.compileartisan.dev

This contains some of the HTML-exports of the notes I take in class, using [Emacs Org Mode](https://orgmode.org/).

> [!NOTE]  
> This project was vibe-coded, and might contain bugs and questionable code structure.

## How this works
- The requirement was two build-time scripts (both created with the help of [Claude](https://claude.ai/))
  - `generate-links.js` creates the root `index.html` file
  - `relativize-paths.js` changes all paths used in the org-exported HTML file into relative paths.
