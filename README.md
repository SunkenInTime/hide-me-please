<p align="center">
  <img src="assets/icon.png" alt="Hide Me Please logo" width="128" height="128">
</p>

<h1 align="center">Hide Me Please</h1>

<p align="center">
  A browser extension that replaces configured text on HTTP and HTTPS pages while keeping the surrounding HTML tags intact.
</p>

<p align="center">
  <a href="https://chromewebstore.google.com/detail/hide-me-please/mpgkameogcloblgnnollcoipphigikkf">
    <img src="https://developer.chrome.com/static/docs/webstore/branding/image/ChromeWebStore_BadgeWBorder_v2_496x150.png" alt="Available in the Chrome Web Store" width="248">
  </a>
</p>

<p align="center">
  Firefox support coming soon.
</p>

## Overview

Hide Me Please is built with Plasmo and runs as a browser extension. Configure text that should be hidden, and the extension swaps matching page content without breaking the page structure.

## What it does

- Stores replacement rules in Chrome sync storage.
- Applies replacements across HTTP and HTTPS pages, including iframes and open shadow roots.
- Preserves the original page markup by changing text nodes and common accessible text attributes only.
- Lets you blur sensitive "find" text in the popup until hover/focus.

## Local development

```bash
pnpm install
pnpm dev
```

Load the extension from `build/chrome-mv3-dev` in Chrome.

For Firefox:

```bash
pnpm dev:firefox
```

## Release build

```bash
pnpm release
```

That runs TypeScript checks, creates the production Chrome extension in `build/chrome-mv3-prod`, and writes the Chrome Web Store upload archive under `build/`.

Before publishing:

1. Update `version` in `package.json`.
2. Run `pnpm release`.
3. Load `build/chrome-mv3-prod` as an unpacked extension and smoke test on a normal website.
4. Upload the generated Chrome MV3 zip from `build/` to the Chrome Web Store dashboard.
