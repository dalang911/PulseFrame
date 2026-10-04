# Contributing

Thanks for your interest! PulseFrame is a small, dependency-light codebase and
most contributions are **one new component** or **one template**, both of which
need no build tooling at all.

- Bug reports and feature requests: open an issue.
- Security issues: please read [SECURITY.md](SECURITY.md) and report privately.
- Anything about licences or bundled assets: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## 1. Set up a development copy

```bash
git clone https://github.com/dalang911/pulseframe.git
cd pulseframe
cp site.config.example.js site.config.js    # untracked; holds your keys and API URL
python3 -m http.server 8080                 # ES modules need http://, not file://
```

Open <http://localhost:8080/index.html>. There is nothing to install and nothing
to compile: reload the page after each edit.

Optional checks while working:

```bash
node --check js/path/to/File.js     # syntax only; the code is not transpiled
```

Browser targets: Chrome/Edge with WebCodecs (needed only for video export).

## 2. Repository layout you will touch

| Area | Path | Notes |
|---|---|---|
| Core engine | `js/core/` | `EventBus`, `Store`, `constants`, `appConfig` (deployment URLs) |
| Parsers | `js/parsers/` | format → unified schema; keep output identical across formats |
| Data pipeline | `js/data/` | interpolation and derived fields |
| Components | `js/components/definitions/` | **the friendliest place to contribute** |
| Rendering | `js/renderer/` | Leafer manager, frame renderer, video engine |
| UI | `js/ui/` | settings panel, template manager, template shop |
| Map | `js/map/`, `js/components/definitions/webMapPanels.js` | maptalks + optional AMap |
| Studio | `studio/` | component workbench, submits to the store |
| Docs | `docs/` | English is the primary language; `docs/zh/` keeps the originals |

## 3. Code style

The existing code speaks for itself; the short version:

- **Native ES modules**, `import`/`export`, no bundler syntax, no TypeScript.
- **No new runtime dependency** without discussion. Everything shipped must work
  from a static file host.
- 4-space indent, single quotes in JS, double quotes in HTML attributes.
- Comments: a file-level block explaining *why the module exists*, then comments
  at the non-obvious decisions. Chinese comments are already common in this
  codebase and are fine; **user-visible strings must be English** (translate in
  your own fork if you need another UI language).
- Keep every cache-busting `?v=` for a given module identical across a page —
  two different query strings load two instances of the same module.
- Never hard-code a store URL or an API key: use `apiBase()` / `AMAP_KEY` from
  `js/core/appConfig.js`, and put anything secret in `site.config.js`.
- Anything interpolated into HTML from a store response goes through
  `escapeHtml()`; anything used as an image URL goes through `safeThumb()`.

## 4. Adding a component

1. Create `js/components/definitions/yourComponent.js` exporting the standard
   interface (`id`, `name`, `category`, `defaultConfig`, `dataBindings`,
   `settings`, `build()`, `update()`).
2. Import it in `js/components/definitions/index.js` and add it to
   `allDefinitions`.
3. Handle missing data: any bound field may be `null` (no heart-rate strap, no
   power meter, no GPS).
4. Keep `update()` cheap — it runs once per rendered frame.
5. Test the three paths: editor palette, designer property panel (generated from
   `settings`), and video export.

The full interface reference is
[docs/COMPONENT_GUIDE.md](docs/COMPONENT_GUIDE.md); the JSON your component will
be serialised into is specified in [docs/COMPONENT_JSON_SPEC.md](docs/COMPONENT_JSON_SPEC.md).

Components designed visually belong in **PulseFrame Studio** (`studio/`): build
there, preview against `studio/js/demoData.js`, then *Submit to Library* — or
export the JSON and open a pull request with it under `samples/`.

## 5. Sharing a template (no code)

Build a layout in the editor or designer, then use the *Shared* panel to publish
it to a store. If you want it included with this repository, export the JSON and
attach it to an issue or a PR — **check that it contains no personal route data**
(a template stores layout and styling, not your activity; the activity file stays
on your machine).

## 6. Documentation

- Docs live in `docs/`, written in English. Chinese originals are preserved under
  `docs/zh/` and are not the reference text.
- Update the table of contents in `README.md` when adding a document.
- Prefer a note about *why* plus the constraint that shaped the code, over a
  description of the code — the code is already readable.

## 7. Pull requests

- One component, one fix, one PR. Small PRs get merged.
- Branch from `main`; use an imperative, scoped subject:
  `component: add cadence arc`, `parsers: keep null cadence in TCX`, `docs: note tile attribution`.
- In the description: what changed, how you verified it (browser + OS, and which
  page), and which files you touched.
- Do not commit `site.config.js`, `server/`, activity files (`*.gpx`, `*.tcx`,
  `*.fit` outside `samples/`), databases or logs — `.gitignore` covers them;
  double-check before pushing.
- **Never add personal photos, real routes or real activity data** as fixtures.
  The generated stand-ins come from `tools/gen-placeholders.py`; extend that
  script instead of uploading real material.
- If you touch `docs/` or the public API of a module, mention it in the PR so the
  Chinese copies can be reconciled afterwards.

## 8. Release housekeeping

Version strings live in the page header (`index.html`) and in `docs/` release
notes. When the Leafer/maptalks/layui bundles are upgraded, update
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) §1–2 in the same commit.

By opening a pull request you agree to license your contribution under the
project's [MIT License](LICENSE).
