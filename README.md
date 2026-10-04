# PulseFrame 脉搏帧帧
本项目99%由AI编写
> **“Your effort, framed.”**
> Turn a FIT / GPX / TCX activity file into a per-second dashboard overlay for your workout video — entirely in the browser, no client app, no upload to a vendor.

PulseFrame renders **one frame per second** of your activity: heart rate, pace, speed, cadence, power, elevation, slope, lap tables and an animated route map, all laid out on a canvas you design yourself. The result is exported as MP4 / MOV / WebM — including **WebM with an alpha channel**, so the dashboard can be dropped straight onto the original footage in an editor such as [Shotcut](https://shotcut.org/).

**Pulse** = the pulse of your data (heart rate, cadence, power). **Frame** = the unit the product works in. The Chinese name 脉搏帧帧 is a literal match: data has a pulse, the picture has frames.

| | |
|---|---|
| Live demo | <https://pulseframe.data4u.vip/> |
| Predecessor (v1) | <https://github.com/dalang911/Web-Sport-Data-Overlay> |
| Walkthrough (video) | <https://www.bilibili.com/video/BV1m9fEYRE6u/> |
| License | MIT — see [LICENSE](LICENSE) |

---

## Table of contents

- [Why](#why)
- [Features](#features)
- [Requirements](#requirements)
- [Quick start](#quick-start)
- [Configuration](#configuration)
- [Project layout](#project-layout)
- [The shared template store](#the-shared-template-store)
- [Privacy](#privacy)
- [Documentation](#documentation)
- [Ecosystem: three sub-brands](#ecosystem-three-sub-brands)
- [Third-party libraries and assets](#third-party-libraries-and-assets)
- [Acknowledgments](#acknowledgments)
- [Contributing](#contributing)
- [License](#license)

---

## Why

Most sports-data overlay tools are desktop apps, subscription SaaS, or phone apps that push your raw activity file to someone else's server. PulseFrame inverts that:

- **No client, no account.** Parsing, interpolation, derived metrics and rendering run in your browser tab. Nothing leaves your machine unless you deliberately publish a template.
- **One second = one frame.** The timeline maps 1:1 to the exported video, so gauges, charts and the moving map stay in sync with the footage without keyframe work.
- **An open component platform.** Every gauge, chart and panel is a small ES module with a documented interface. Design one in [PulseFrame Studio](studio/), share it through the store, and it appears in everyone's component palette.

## Features

- **Inputs:** FIT, GPX, TCX and PulseFrame's own JSON; format auto-detected, then normalised into a single schema.
- **Derived metrics:** per-second linear interpolation, slope, cumulative ascent/descent, azimuth/heading, map projection points, chart coordinates.
- **48 built-in components** across the palette categories `background`, `text`, `time`, `distance`, `chart`, `attr` (gauges), `map` and `cycling` — heart-rate / pace / elevation charts, heart, pace, speed, cadence, rpm and power gauges, distance bars & rulers, lap tables, date-time and weather panels, web map & compass.
- **Canvas presets:** 1920×1080 and 1080×1920; any size can be typed in.
- **Visual designer** (`designer.html`) for drag-and-drop layout plus a property editor generated from each component's `settings` declaration.
- **Video engine:** WebCodecs encoding via MediaBunny (H.264 `avc` / VP9), 8 Mbps default, optional alpha-preserving WebM.
- **Template store:** three panels — *Native* (bundled), *Local* (browser storage), *Shared* (community store).
- **Full control of the map layer:** OpenStreetMap Humanitarian, CARTO, Esri and (optionally) AMap raster tiles.

## Requirements

- A browser with the **WebCodecs API** — Google Chrome 94+ or Microsoft Edge. If encoding is unavailable the editor still works for layout and JSON templates; only video export needs WebCodecs.
- Serve the **production** site over HTTPS: WebCodecs requires a secure context and the *Shared* panel talks to an `https://` store. Local `http://localhost` is treated as secure and is fine for development.
- **No build step.** Everything is native ES modules plus a few vendored UMD libraries. No Node.js, no bundler, no `npm install`.

## Quick start

Because ES modules cannot be loaded from `file://`, serve the folder over HTTP:

```bash
git clone https://github.com/dalang911/pulseframe.git
cd pulseframe

# pick any static server you already have
python3 -m http.server 8080            # http://localhost:8080/
# or: php -S localhost:8080         (any PHP that can serve static files)
# or: npx serve .
```

Open `http://localhost:8080/index.html`, drop in `samples/demo-run.gpx` (a
synthetic 60-minute run, generated — no real route or person in it), and press
**Generate Video**.

To copy the sample into your own library: `samples/demo-run.gpx` can be dragged straight onto the upload control.

## Configuration

All deployment-specific values live in **`site.config.js`**, which is *not* tracked by git. Copy the example and edit:

```bash
cp site.config.example.js site.config.js
```

The example ships with two shared values already filled in, so a fresh clone
works out of the box:

```js
window.PULSEFRAME_CONFIG = {
    apiBase: 'https://sportsfile.data4u.vip/pages/server/api.php',
    apiBaseByHost: {
        // 'www.example.com': 'https://api.example.com/server/api.php',
    },
    amapKey: 'dc517396597f9dbd58c7483f2626c68c',
};
```

| Key | Meaning |
|---|---|
| `apiBase` | Absolute URL of the store endpoint the *Shared* panel talks to. The example points at the public demo store, which you can browse from a local clone. Set it to `''` to derive the URL from your own hosting layout instead (see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) §3). Publishing to a store requires an account issued by that store — how a store authenticates or gates writes is up to its operator and is not something this frontend knows about. |
| `apiBaseByHost` | Map of `hostname` → API URL, used when one build serves several domains. |
| `amapKey` | AMap (高德) JS API key. Only needed for the AMap tile layer; maptalks layers work without it. A demo key is pre-filled so the map components light up on first run — **replace it with your own** as soon as you deploy anywhere real, and apply for a key at <https://console.amap.com>. |

`<script src="./site.config.js">` is loaded before the modules in `index.html`, `designer.html` and `studio/index.html`. A `<meta name="pulseframe:api-base">` tag is honoured too, which is handy for one-off embeds.

## Project layout

```
pulseframe/
├── index.html            # main editor
├── designer.html         # visual designer (layout + property editor)
├── site.config.example.js# template for the untracked local config
├── css/                  # app + designer styles, layui & maptalks css
├── js/
│   ├── app.js            # editor entry point
│   ├── core/             # EventBus, Store, constants, appConfig
│   ├── parsers/          # GPX / TCX / FIT / JSON → unified schema
│   ├── data/             # interpolator, fieldComputer, DataSchema
│   ├── components/       # registry, factory, updater, definitions/
│   ├── renderer/         # LeaferManager, frameRenderer, VideoEngine
│   ├── ui/               # settings panel, template manager, template shop
│   ├── map/              # MapBridge: maptalks route/track layer + WGS-84→GCJ-02
│   ├── designer/         # DesignerApp and its panels
│   ├── utils/            # format / math / icon helpers
│   └── mediabunny.min.js # vendored encoder (the .mjs copy sits beside it)
├── studio/               # PulseFrame Studio — component workbench
├── lib/                  # vendored jquery, layui, maptalks
├── bg/, icon/, images/, font/   # UI assets (see “Third-party libraries”)
├── samples/              # generated demo data
├── tools/                # asset generator used to build samples/ + bg/
└── docs/                 # developer documentation (English; zh/ = originals)
```

## The shared template store

The *Shared* panel browses a community store over a single HTTP endpoint. Its
URL comes from `apiBase` in `site.config.js`, or from the derivation described
in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) §3. That is all a client of the
store needs to know.

**The store itself is not part of this repository and this project does not
document how it is built.** It lives in a separate deployment, holds other
people's submissions, and keeping its implementation private is part of keeping
it running. If you want to browse the shared library, use the demo `apiBase` in
[`site.config.example.js`](site.config.example.js). If you want to host your own
store, implement whatever you like — the frontend only cares that the URL answers
JSON, in the same shapes the Network tab already shows when you open the panel.

Everything else in PulseFrame runs without any store at all: the editor,
designer, Studio, local templates and video export are 100% client-side.

## Privacy

- Activity files are parsed in the browser. There is no analytics, no telemetry, no crash reporting and no third-party script other than the map tile providers you select yourself.
- Templates you save locally stay in `localStorage`.
- Publishing to a store is an explicit action and sends the template JSON, title, category, author name and an optional thumbnail to *that* store only.
- Map tiles reveal your approximate route to the tile provider. Use a self-hosted tile source if that matters for your activity.
- The demo `samples/demo-run.gpx` and the `bg/*.jpg` presets in this repository are **generated**, not real: the production site's photos and watch files are kept private, and the placeholders were produced by [`tools/gen-placeholders.py`](tools/gen-placeholders.py).

## Documentation

| Document | Contents |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Module map, event bus, state store, data pipeline, render loop |
| [docs/DATA_SCHEMA.md](docs/DATA_SCHEMA.md) | Unified activity-data structure and derived fields |
| [docs/COMPONENT_GUIDE.md](docs/COMPONENT_GUIDE.md) | How to write a component (interface, lifecycle, pitfalls) |
| [docs/COMPONENT_JSON_SPEC.md](docs/COMPONENT_JSON_SPEC.md) | Template JSON format |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Static hosting, API-address resolution, self-hosting the CDN dependencies |
| [SECURITY.md](SECURITY.md) | What the frontend protects against and how to report issues |
| [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) | Every bundled library and asset, with licences |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Style, module conventions, pull-request checklist |
| [docs/zh/](docs/zh/) | Original Chinese documentation, kept for reference |

## Ecosystem: three sub-brands

| Brand | What it is | Where |
|---|---|---|
| **PulseFrame** | the editor and renderer | `index.html`, `designer.html` |
| **PulseFrame Studio** | the component workbench: build, preview, bind fields, submit | [`studio/`](studio/) |
| **PulseFrame Hub** | the shared component/template library | the *Shared* panel |

## Third-party libraries and assets

Short list; full text, versions and licence notices in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

- [Leafer UI / Leafer Editor](https://www.leaferjs.com/) — canvas engine (MIT)
- [MediaBunny](https://github.com/Vanilagy/mediabunny) — WebCodecs video encoding (MPL-2.0, keep its header comment intact)
- [layui](https://layui.dev/) — UI widgets such as the colour picker (MIT)
- [maptalks](https://maptalks.org/) — map layer rendering (BSD-3-Clause)
- [jQuery](https://jquery.com/) — legacy DOM helpers bundled for layui (MIT)
- `GPXParser.js` / `TCXParser.js` — long-circulated XML activity parsers, vendored from the v1 project (**no licence header in the shipped copy** — see the note in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) before redistributing)
- A client-side FIT decoder assembled from public `fit-parser` / BackFit-style sources
- Tile providers: OpenStreetMap contributors, CARTO, Esri; AMap works out of the box with the shared demo key in `site.config.example.js`, but apply for your own before any real deployment
- Fonts and icons: `iconfont` set from [iconfont.cn](https://www.iconfont.cn/), *Sofadi One* (OFL)

## Acknowledgments

- The [leaferjs](https://github.com/leaferjs) team, whose canvas framework makes the frame-by-frame rendering practical in a browser tab.
- [MediaBunny](https://github.com/Vanilagy/mediabunny) — its continued work on WebCodecs, including transparency support, is what makes alpha WebM export possible without a server.
- [dalang911/Web-Sport-Data-Overlay](https://github.com/dalang911/Web-Sport-Data-Overlay) — the v1 project this repository grew out of, and the [bilibili walkthrough](https://www.bilibili.com/video/BV1m9fEYRE6u/) that introduced it.
- The OpenStreetMap, CARTO and Esri tile communities, and everyone who publishes a template back to the Hub.
- Chinese running and cycling communities whose feedback shaped the metric names, units and lap-table layouts.

## Contributing

Issues and pull requests are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md). Components are the easiest way to start: one file, one documented interface, no build tooling.

Please read [SECURITY.md](SECURITY.md) before reporting anything you think might be a vulnerability.

## License

Released under the [MIT License](LICENSE). Bundled third-party libraries keep their own licences; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
