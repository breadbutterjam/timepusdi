# Kept

Private photo books for Chrome / Edge on Windows and Mac. Static files, no server, no build step.

```
index.html          welcome page, with "Open Kept" and "Read the setup guide"
css/landing.css     its styles (design tokens at the top)
app/                the Kept app itself (index.html, css/, js/)
guide/              Mac setup one-pager: index.html, guide.css, Kept-setup-guide-Mac.pdf
tools/              heic_to_jpeg.py, converts iPhone HEIC photos to JPEG
tests/              logic tests and a browser smoke test
```

## Run it on your own computer

In this folder run `python -m http.server 8000`, then open http://localhost:8000 in Chrome or Edge.
(Opening index.html straight from the folder will not work, because the app needs a web address to load its files.)

## Put it online with GitHub Pages

1. Make a new repository on GitHub and upload the contents of this folder to its top level, so that `index.html` sits at the root.
2. In the repository go to Settings, then Pages. Under "Build and deployment" choose "Deploy from a branch", pick `main` and `/ (root)`, and save.
3. After a minute the site is live at `https://<your-username>.github.io/<repository-name>/`. Send that link to your friend.

Never upload photos or finished books. The `.gitignore` already skips `Chapter-*` folders and HEIC files, but check before you push.

## Tests

- `npm test` runs the logic tests (Node 20+).
- `tests/browser-smoke.mjs` runs the whole import, view, edit and save flow in a headless browser against a private test folder. It needs Playwright installed.

## How a book is stored

A book is a folder you choose: `Chapter-01/ { manifest.json, photos/, pages/, music/ }`, then `Chapter-02/` and so on. Chapter order is the folder-name order.
