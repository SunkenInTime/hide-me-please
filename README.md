# Hide Me Please

Browser extension built with Plasmo that replaces configured text on any HTTP or HTTPS page while keeping the existing HTML tags intact.

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
