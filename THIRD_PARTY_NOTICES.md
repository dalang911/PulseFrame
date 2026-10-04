# Third-Party Notices

PulseFrame's own source is released under the [MIT License](LICENSE). Every
third-party library, font, icon, tile source and data format mentioned here
keeps **its own** licence; nothing below is re-licensed by this project.

Sections:

1. [Bundled runtime libraries](#1-bundled-runtime-libraries)
2. [Dependencies loaded from a CDN at runtime](#2-dependencies-loaded-from-a-cdn-at-runtime)
3. [Parsers with an unclear licence](#3-parsers-with-an-unclear-licence)
4. [Fonts and icons](#4-fonts-and-icons)
5. [Map tiles and geodata](#5-map-tiles-and-geodata)
6. [Assets generated for this repository](#6-assets-generated-for-this-repository)
7. [Reference material](#7-reference-material)
8. [Compliance checklist for downstream users](#8-compliance-checklist-for-downstream-users)

---

## 1. Bundled runtime libraries

Copies shipped inside this repository.

| Library | Version | Licence | Where | Upstream |
|---|---|---|---|---|
| Leafer Editor (incl. `leafer-ui` + editor plugin) | 2.3.0 | MIT | `studio/js/vendor/leafer-editor.web.min.js` | <https://github.com/leaferjs/Leafer-Editor> |
| Leafer Editor | 2.2.11 | MIT | loaded from unpkg in `index.html` / `designer.html` (see §2) | same |
| MediaBunny | (bundled build) | MPL-2.0 | `js/mediabunny.min.js`, `js/mediabunny.min.mjs` | <https://github.com/Vanilagy/mediabunny> |
| layui | 2.11.5 | MIT | `lib/layui.js`, `css/layui.css`, `studio/css/layui.css` | <https://github.com/layui/layui> |
| maptalks | 1.0.3 | BSD-3-Clause | `lib/maptalks.min.js`, `css/maptalks.css` | <https://github.com/maptalks/maptalks.js> |
| jQuery | 3.6.0 | MIT | `lib/jquery-3.6.0.min.js` (kept for layui's older module API) | <https://github.com/jquery/jquery> |

Notes:

- **MediaBunny (MPL-2.0)** is a weak-copyleft licence: you may use and ship it in
  open- or closed-source projects, but if you *modify* `mediabunny.min.*` itself
  and distribute it, the modified file must stay under MPL-2.0. The copyright and
  licence header is retained at the top of both bundles — do not strip it.
- **Leafer version drift.** `studio/index.html` loads a local 2.3.0 build and only
  falls back to the unpkg 2.2.11 CDN when `window.LeaferUI` is missing, while the
  editor pages load 2.2.11 from unpkg and nothing else. Both work today, but a
  component written against one release can hit changed behaviour in the other.
  Vendor a single version and point every page at it.
- The `?v=` query string used on some local script tags is a cache-buster only; it
  does not affect which code runs, but loading the same ES module under two
  different `?v=` values creates two separate instances. Keep the version string
  identical across a page.

## 2. Dependencies loaded from a CDN at runtime

These are **fetched by the visitor's browser**, not shipped here. A deployment
may want to vendor them for privacy or offline reasons.

| Resource | Loaded by | Notes |
|---|---|---|
| `https://unpkg.com/leafer-editor@2.2.11/dist/web.min.js` | `index.html`, `designer.html`, and as a fallback in `studio/index.html` | MIT; unpkg is a third-party CDN |
| `https://webapi.amap.com/maps?v=2.0&key=…` | `index.html`, only when `amapKey` is set | The example config ships a shared **demo key** so map components light up on first run — quota is limited and domain restrictions may apply. Replace it with your own from <https://console.amap.com> before any real deployment |
| `https://gstatic.qaq.qa/css2?family=Sofadi+One&display=swap` | `index.html`, and dynamically from `js/core/GlobalFont.js` | ⚠️ A **mirror** of the Google Fonts CSS API, not an endpoint operated by Google or by this project. It also proxies every other family name the user types into the font picker. Replace it with `https://fonts.googleapis.com/css2?family=` (and `https://fonts.gstatic.com/s/` for the files) unless you specifically trust and control that host. |

## 3. Parsers with an unclear licence

`js/parsers/GPXParser.js` and `js/parsers/TCXParser.js` are widely circulated
GPX/TCX parsing scripts inherited from the v1 project
([Web-Sport-Data-Overlay](https://github.com/dalang911/Web-Sport-Data-Overlay)).

- They carry **no SPDX header, no licence text and no copyright notice** in the
  shipped copy; `GPXParser.js` even ends with a Node-only `module.exports` shim
  and a `jsdom-global` require left over from its original repository.
- They are therefore *not* covered by this project's MIT grant. Treat them as
  “all rights reserved by an unknown holder” until the origin is confirmed.

**Before redistributing**, either (a) find and honour the upstream licence,
(b) replace them — a GPX/TCX file is plain XML, so a few dozen lines of
`DOMParser` cover what these do, or (c) ask the original author for written
permission. Contributions that replace these two files with properly licensed
code are welcome; see [CONTRIBUTING.md](CONTRIBUTING.md).

The FIT decoder in `js/parsers/FitParser.js` is a hand-assembled browser port of
public `fit-parser`-style sources (single-file build, comments preserved at the
top of the file). The same caution applies: the Garmin `.fit` *specification* is
free to implement, but this particular code has no explicit licence header.

## 4. Fonts and icons

| Asset | Licence | Notes |
|---|---|---|
| `font/iconfont.*` (eot/svg/ttf/woff/woff2), `studio/font/iconfont.*` | iconfont.cn user-subset | Built with [iconfont.cn](https://www.iconfont.cn/). Each glyph's licence is set by its uploader; the subset was assembled for this project. Icons used for UI decoration only. |
| *Sofadi One* (Google Fonts) | SIL Open Font License 1.1 | Loaded over the network, not vendored. |
| System fallbacks (`Arial`, `Helvetica Neue`, `PingFang SC`, …) | proprietary, owned by their respective vendors | Referenced in CSS font stacks; never shipped. |

## 5. Map tiles and geodata

The map components query raster tile services directly. Attribution and terms are
the **tile provider's**, and each has its own:

| Source | Base URL used in `js/map/` | Terms |
|---|---|---|
| OpenStreetMap Humanitarian (HOT) | `https://tile-{s}.openstreetmap.fr/hot/{z}/{x}/{y}.png` | © OpenStreetMap contributors, tiles under ODbL; the `openstreetmap.fr` proxy is a volunteer service — respect its usage policy, do not hammer it, use your own tile server for volume |
| CARTO basemaps | `https://{s}.basemaps.cartocdn.com/…` | © OpenStreetMap contributors © CARTO; free tier with attribution, see <https://carto.com/attributions> |
| Esri World basemaps | `https://server.arcgisonline.com/ArcGIS/rest/services/…` | Esri terms, attribution “Powered by Esri”; commercial use needs an Esri agreement |
| AMap (高德) raster/JS API | `https://webapi.amap.com/…` | Mainland-China coverage; the shipped example key is a shared demo, apply your own for anything real and bind it to your domain |

Exported videos that show a basemap inherit the map's attribution requirements —
keep the credit visible, or switch to a self-hosted tile cache.

## 6. Assets generated for this repository

The production deployment this project came from uses personal photographs as
background presets and real watch files as demo data. **None of that is published
here.** Everything in these paths was generated by
[`tools/gen-placeholders.py`](tools/gen-placeholders.py) for this repository and
is offered under the same MIT licence as the code:

| File | What it is |
|---|---|
| `bg/169.jpg`, `bg/1692.jpg`, `bg/1693.jpg` | 1920×1080 synthetic gradient plates (landscape presets) |
| `bg/916.jpg` | 1080×1920 synthetic gradient plate (portrait preset) |
| `samples/demo-run.gpx` | 60-minute synthetic run: 1 200 track points at 3 s spacing (~10 km), pseudo heart-rate extension, arbitrary start coordinate — no real route, no real person |

Regenerate or re-colour them with:

```bash
python3 tools/gen-placeholders.py   # needs Pillow
```

Edit the palettes / point count at the bottom of the script; it writes directly
to `bg/` and `samples/`.

## 7. Reference material

- [Web-Sport-Data-Overlay](https://github.com/dalang911/Web-Sport-Data-Overlay) —
  the v1 project this codebase grew from, and the source of the FIT/GPX/TCX
  pipeline idea. Its [bilibili walkthrough](https://www.bilibili.com/video/BV1m9fEYRE6u/)
  is linked from the app header.
- [GPX 1.1](https://www.topografix.com/gpx_manual.asp), [TCX (Fit SDK)](https://developer.fitdigitalarchive.com/),
  and the [FIT SDK profile tables](https://github.com/garmin/fit-devicetype) — the
  file formats this tool reads. Format specs are open standards; no code from the
  spec documents is included.
- [Shotcut](https://shotcut.org/) — mentioned in the docs as a convenient editor
  for alpha-channel WebM output; not a dependency, not endorsed, GPL-3.0.
- [WebCodecs API](https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API) —
  the browser interface MediaBunny drives.

## 8. Compliance checklist for downstream users

If you fork, host or ship PulseFrame:

- [ ] Keep this file and [`LICENSE`](LICENSE) in your distribution.
- [ ] Keep the MPL-2.0 header inside `js/mediabunny.min.js` / `.mjs`.
- [ ] Keep the map attribution visible in videos that show a basemap, and check
      the provider's terms for your use (Esri in particular).
- [ ] Replace the shared demo AMap key with one you applied for at
      <https://console.amap.com>, or leave `amapKey` empty. The example key is
      billed to its owner and rate-limited — production traffic will blow the
      quota and get it blocked for everyone.
- [ ] Replace the `gstatic.qaq.qa` font mirror with `fonts.googleapis.com` or a
      self-hosted copy (§2).
- [ ] Resolve the parser licence question in §3 before redistributing binaries.
- [ ] Do not ship a `site.config.js` with real personal keys, and never publish
      a store's runtime data (submissions, credentials, logs) alongside the
      frontend.
- [ ] Third-party names and logos (Leafer, MediaBunny, layui, maptalks, AMap,
      Garmin, Esri, CARTO, Google) remain their owners' trademarks; mentioning
      them here is descriptive, not an endorsement.

*Not legal advice — this file is a faithful inventory, and the binding terms are
the licence texts of each project named above.*
