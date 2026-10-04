# Architecture

PulseFrame is a **build-free, browser-native** application: every first-party
file is an ES module loaded straight by the engine, and the third-party
frameworks are classic (non-module) scripts that attach globals. There is no
transpile step, so the source in this repository *is* what runs.

```
┌──────────────────────────────────────────────────────────────────┐
│  index.html            designer.html          studio/index.html  │
│  (editor)              (layout designer)      (component bench)  │
└───────────┬────────────────────┬─────────────────────┬───────────┘
            │ <script type="module">                    │
   ┌────────▼────────┐  ┌────────▼─────────┐  ┌────────▼────────┐
   │ js/app.js       │  │ designer/         │  │ studio/js/      │
   │ editor shell    │  │ DesignerApp.js    │  │ StudioApp.js    │
   └────────┬────────┘  └────────┬─────────┘  └────────┬────────┘
            │                    │                     │
   ┌────────▼────────────────────▼─────────────────────▼────────┐
   │ core/   EventBus · Store · CanvasManager · constants       │
   │         appConfig (deployment URLs) · UnitConfig · GlobalFont│
   └────────┬───────────────┬───────────────────┬───────────────┘
            │               │                   │
   ┌────────▼────────┐ ┌────▼──────────┐ ┌──────▼───────────────┐
   │ parsers/        │ │ data/         │ │ components/          │
   │ GPX TCX FIT JSON│ │ DataPipeline  │ │ registry · factory   │
   │ → unified `rq`  │ │ interpolator  │ │ updater · definitions/│
   │                 │ │ fieldComputer │ │ visual/loader        │
   │                 │ │ DataSchema    │ │ (shared components)  │
   └─────────────────┘ └────┬──────────┘ └──────┬───────────────┘
                            │                   │
              ┌─────────────▼──────┐   ┌────────▼─────────────┐
              │ renderer/          │   │ ui/  map/            │
              │ LeaferManager      │   │ panels · templates   │
              │ frameRenderer      │   │ MapBridge (maptalks) │
              │ VideoEngine        │   └──────────────────────┘
              └────────────────────┘
                            │
              ┌─────────────▼──────────────────────────────┐
              │ store API (separate deployment)           │
              │ js/core/appConfig.js → a JSON endpoint    │
              └────────────────────────────────────────────┘
```

## 1. Loading order matters

A page boots in this sequence, and each step depends on the previous one:

1. **Classic scripts** create globals: `lib/jquery-3.6.0.min.js`, `lib/layui.js`,
   `lib/maptalks.min.js`, then the parser primitives `js/parsers/GPXParser.js`,
   `TCXParser.js`, `FitParser.js` (they register `window`-level constructors, they
   are *not* modules), and Leafer (`window.LeaferUI`).
2. **`site.config.js`** (untracked, optional) sets `window.PULSEFRAME_CONFIG`
   before any module reads it. Missing file → defaults, logged, not fatal.
3. **The module graph** starts from `js/app.js` (or `designer/DesignerApp.js`,
   `studio/js/StudioApp.js`).
4. `js/app.js` imports `./components/definitions/index.js` for its side effect —
   that file registers all built-in definitions into `registry`.
5. `js/components/visual/loader.js` then adds *local* components from browser
   storage and *remote* ones from the store, and broadcasts `REMOTE_EVENT` so the
   panels refresh.

Two consequences to remember while editing:

- This project deliberately ships **no `?v=` cache-buster strings** on ES-module
  imports or asset URLs. Every import uses the bare relative path (`./Foo.js`),
  which keeps each module to a single URL and therefore a single instance in the
  browser. Adding a `?v=` back — even on one file — is how you end up with two
  registries / two stores; if you ever must, bump them uniformly across the whole
  tree.
- Anything a module needs from a classic script must be read lazily (inside a
  function), because at *module evaluation* time the global may not exist yet —
  this is why `MapBridge` re-checks `AMap` before use.

## 2. Core (`js/core/`)

| Module | Responsibility |
|---|---|
| `EventBus.js` | One global pub/sub singleton plus the `Events` name constants. `on()` returns an unsubscribe function; a throwing listener is caught and logged so one bad component cannot break a whole frame. |
| `Store.js` | UI/frame/render state (`get`, `set`, `batchSet`, `snapshot`, `resetData`). Every non-silent `set` emits `STATE_CHANGED`. Deliberately does **not** hold Leafer instances. |
| `CanvasManager.js` | The Leafer object graph references: on-screen `appview` / `frame` and the off-screen `memoryApp` / `memoryFrame` used for rendering. |
| `constants.js` | Canvas presets, preview size, video formats/defaults, and the canonical field names (`DATA_FIELDS`). |
| `appConfig.js` | Deployment URLs and secret-free config: `apiBase()`, `apiUrl()`, `AMAP_KEY`, plus the two sanitizers `safeThumb()` and `escapeHtml()`. The **only** place a store address may be computed. |
| `UnitConfig.js` | Metric/imperial and number prefix/suffix settings; changes emit `UNIT_CONFIG_CHANGED`. |
| `GlobalFont.js` | Web-font loading for canvas text: a `<link>` alone is not enough — `document.fonts.load()` must be awaited before the family is written onto text nodes, otherwise the canvas keeps drawing with the fallback. |

### Events

All names come from `Events`; use the constant, never the string.

| Group | Events |
|---|---|
| Data | `DATA_LOADED`, `DATA_PARSED`, `DATA_INTERPOLATED`, `DATA_COMPUTED`, `DATA_READY`, `DATA_PROCESSED` |
| Frame | `FRAME_UPDATE`, `FRAME_RANGE_CHANGE` |
| Components | `COMPONENT_SELECTED`, `COMPONENT_ADDED`, `COMPONENT_REMOVED`, `COMPONENT_UPDATED` |
| Canvas | `CANVAS_RESIZE`, `CANVAS_CLEAR`, `CANVAS_READY` |
| Templates | `TEMPLATE_LOAD`, `TEMPLATE_SAVE`, `TEMPLATE_SUBMIT` |
| Rendering | `RENDER_START`, `RENDER_PROGRESS`, `RENDER_COMPLETE`, `RENDER_ABORT` |
| UI | `SETTINGS_SHOW`, `SETTINGS_HIDE`, `WIDGET_PICK`, `UNIT_CONFIG_CHANGED`, `STATE_CHANGED` |
| Custom components | `custom:components-loaded` (exported as `REMOTE_EVENT` from `visual/loader.js`) |

`DATA_PROCESSED` is kept for compatibility with older listeners; new code should
react to `DATA_READY`, which carries `{ rq, chartData, mapPoints }` in one payload.

### Store keys

| Key | Meaning |
|---|---|
| `processedData` | the complete `rq` object after interpolation and derived fields |
| `trkptData` | per-second track-point array (the frame index is the array index) |
| `chartData` | chart coordinates and extremes (see [DATA_SCHEMA.md](DATA_SCHEMA.md)) |
| `currentFrame`, `startFrame`, `endFrame`, `maxFrame` | frame window; `maxFrame === trkptData.length` |
| `canvasSize` | `{ width, height }` |
| `activeComponents` | `[{ id, config }]` currently on the canvas |
| `isRendering`, `videoFormat`, `currentTemplate` | render/UI state |

Leafer references (`frame`, `appview`, `memoryApp`, `memoryFrame`) are reached
through `canvasManager`, not the store — keeping object graphs out of the state
store avoids leaking canvases between documents.

## 3. Data pipeline (`js/parsers/`, `js/data/`)

`dataPipeline.process(file, onProgress)` is the single entry point from a file to
usable data. Stages, in order:

| Stage | Module | What happens | Event |
|---|---|---|---|
| detect + parse | `parsers/index.js` → `gpxToRq` / `tcxToRq` / `fitToRq` / `jsonToRq` | any supported file → the unified `rq` structure | `DATA_PARSED` |
| validate | `data/DataSchema.js` → `validateRq(rq)` | returns `{ valid, errors }`; invalid input throws instead of rendering nonsense | — |
| interpolate | `data/interpolator.js` → `interpolatePoints(rq)` | rewrites `rq.data.trkpt` **in place** to exactly one point per second; `formatValue()` rounds each field to its sensible precision | `DATA_INTERPOLATED` |
| derive | `data/fieldComputer.js` → `computeAllFields(rq)` | `computeSlope`, `computeGainLoss`, `computeAzimuth` mutate the points; `computeChartPoints` and `computeMapPoints` return the geometry | `DATA_COMPUTED` |
| ready | — | attaches `rq._chartData` / `rq._mapPoints` | `DATA_READY` |

Because `interpolatePoints` mutates in place, `DataPipeline` takes a debug
snapshot *before* interpolating; the console exposes `window.__rawData`,
`__processedData`, `__rq`, `__trkptData` and `__chartData` while you work. They
are inspection aids only — nothing in the app reads them back.

Details of the resulting structure are in [DATA_SCHEMA.md](DATA_SCHEMA.md).

## 4. Component system (`js/components/`)

| Module | API |
|---|---|
| `registry.js` | `register(def)`, `registerAll(defs)`, `get(id)`, `has(id)`, `getAll()`, `getByCategory(cat)`, `getCategories()`, `getIds()` |
| `factory.js` | `createComponent(id, overrides)` → Leafer children; `addComponentToCanvas`, `removeComponentFromCanvas`, `clearAllComponents`, `initBackgroundLayer`, `resizeBackground` |
| `updater.js` | `updateAllComponents(frame, updateMemory)`, `updateComponent(id, frame)` |
| `definitions/` | one file per component, or a group exported as an array (`gaugePanels.js`, `lapPanels.js`, …) registered through `definitions/index.js` |
| `visual/` | components authored in Studio: JSON specs rather than code |
| `visual/loader.js` | `loadLocalComponents()` (browser storage, ids prefixed `studio_comp_`), `loadRemoteComponents()` (store), `loadCustomComponents()` (both) |

Lifecycle: **register** → **build** (`factory.createComponent`) → **update**
(`updater.updateAllComponents` once per frame) → **remove**.

`customProps` in a saved template is merged over `defaultConfig` at build time, so
a template only stores what the user actually changed. The full contract,
including the `settings` → auto-generated panel mapping, is
[COMPONENT_GUIDE.md](COMPONENT_GUIDE.md).

## 5. Rendering (`js/renderer/`)

| Module | Role |
|---|---|
| `LeaferManager.js` | Owns the two Leafer worlds: the interactive one the user edits, and an in-memory one used for export. Keeping them separate is what lets export run without freezing or repainting the editor. |
| `frameRenderer.js` | For frame *n*: set `currentFrame`, call `updateAllComponents(n, /* memory */ true)`, paint the memory canvas, hand the bitmap to the encoder. One second per frame — that is the product's core premise. |
| `VideoEngine.js` | MediaBunny wrapper. Default `avc` @ 8 Mbps in MP4/MOV; the WebM path switches to `vp9` with `alpha: 'keep'` so the dashboard can be composited over footage. |

Encoding happens entirely in the tab: there is no server-side render, and no
frame ever leaves the machine except through whatever sharing you choose.

## 6. Map (`js/map/MapBridge.js`)

`maptalks` renders raster basemaps (OSM-HOT, CARTO, Esri, optional AMap) and the
route polyline; `computeMapPoints` supplies the projected coordinates so the map
component can also be drawn *inside* the Leafer canvas for export. The AMap layer
is optional and guarded — with no key configured the rest of the app is
unaffected. Tile-provider attribution obligations are listed in
[THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md).

## 7. UI (`js/ui/`)

| File | Panel |
|---|---|
| `TemplateLibrary.js` | **Native** templates shipped with the app |
| `TemplateManager.js` | **Local** templates in browser storage (v1 `frameConfig_*` entries are still readable) |
| `TemplateShop.js` | **Shared** templates from the store; renders `thumbnail` through `safeThumb()` and every text field through `escapeHtml()` |
| `SettingsPanel.js`, `PropertyRenderer.js` | Panels generated from a component's `settings` declaration |
| `CustomComponentPanels.js` | **Local** and **Shared** component palettes |
| `WidgetPicker.js`, `AlignTools.js`, `CanvasResizer.js`, `VideoPanel.js`, `UnitConfigDialog.js` | editing affordances |

## 8. Store API

The *Shared* panel talks to an external HTTP endpoint. Its implementation and
deployment are **not part of this repository and are not documented here** —
the frontend only needs its URL, which `appConfig.js` resolves in this order:

1. `PULSEFRAME_CONFIG.apiBase`
2. `PULSEFRAME_CONFIG.apiBaseByHost[location.hostname]`
3. `<meta name="pulseframe:api-base">`
4. derived from the page URL as `../server/api.php`

Hosting and API-address rules: [DEPLOYMENT.md](DEPLOYMENT.md). The request and
response shapes are visible in the browser's Network tab when the panel runs.

## 9. Tech stack

| Technology | Version | Used for | Shipped here? |
|---|---|---|---|
| Leafer Editor / leafer-ui | 2.2.11 (editor pages) · 2.3.0 (Studio vendor) | canvas interaction and the object graph | CDN + vendored |
| MediaBunny | bundled build | WebCodecs video encoding | yes |
| layui | 2.11.5 | buttons, nav, colour picker, dialogs | yes |
| maptalks | 1.0.3 | map layers | yes |
| jQuery | 3.6.0 | legacy helpers layui still expects | yes |
| AMap JS API | 2.0 | optional China tile/service layer | no (loaded from `webapi.amap.com`; example ships a shared demo key) |
| ES Modules | native | all first-party code | — |

## 10. Directory map

```
js/
  app.js                  editor entry
  core/                   event bus, state, canvas refs, config, units, fonts
  parsers/                format detection + GPX/TCX/FIT/JSON → rq
  data/                   DataPipeline, interpolator, fieldComputer, DataSchema
  components/             registry, factory, updater, definitions/, visual/
  renderer/               LeaferManager, frameRenderer, VideoEngine
  ui/                     panels, templates (native/local/shared), dialogs
  map/                    MapBridge
  designer/               DesignerApp, Canvas, ComponentPalette, PropertyEditor, Preview, Exporter
  utils/                  format, math, icons
  mediabunny.min.js/.mjs  vendored encoder
studio/                   PulseFrame Studio (own module tree, shares the JSON spec)
lib/, css/, font/, icon/, images/, bg/   vendored assets and presets
samples/                  generated demo data
tools/                    asset generator
docs/, docs/zh/           English reference / archived Chinese notes
```
