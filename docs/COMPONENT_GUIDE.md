# Component guide

A component is one ES module that describes a dashboard element: what it looks
like when created, which settings the property panel should offer, and how it
changes once per second. Register it and it appears in the editor palette, the
designer, the template JSON and the video renderer — no other wiring.

> Read [ARCHITECTURE.md](ARCHITECTURE.md) §4 first if you have not: it explains
> `registry` / `factory` / `updater`, which this document is about.
> The data your `update()` receives is specified in [DATA_SCHEMA.md](DATA_SCHEMA.md).

## 1. The interface

```js
// js/components/definitions/speedGauge.js
import { speedToPace } from '../../utils/format.js';

export default {
    // ---- metadata -----------------------------------------------------
    id: 'el_speed_pan',              // globally unique; existing ids use a short prefix
    name: 'Speed Gauge',             // shown in the palette
    category: 'distance',            // palette grouping, see §6
    icon: './images/x6.png',         // palette thumbnail

    // ---- default configuration ---------------------------------------
    defaultConfig: {
        x: 400, y: 200,
        width: 300, height: 300,
        cornerRadius: 0,
        colors: { background: '#1a1a2e', needle: '#ff6b6b', ruler: '#ffffff', text: '#ffffff' },
        strokeWidth: 2,
        minValue: 0,
        maxValue: 30,
    },

    // ---- what this component consumes --------------------------------
    dataBindings: ['speed'],

    // ---- auto-generated property panel -------------------------------
    settings: [
        { name: 'Gauge', type: 'title' },
        { name: 'Dial colour', key: 'colors.background', type: 'color' },
        { name: 'Needle', key: 'colors.needle', type: 'color' },
        { name: 'Stroke width', key: 'strokeWidth', type: 'number', min: 1, max: 10 },
        { name: 'Max speed', key: 'maxValue', type: 'number', min: 10, max: 200 },
        { name: 'Show ticks', key: 'showTicks', type: 'boolean' },
    ],

    // ---- create the children -----------------------------------------
    build(config, data) { /* returns an array of Leafer descriptors, §3 */ },

    // ---- one call per frame ------------------------------------------
    update(box, frameData, progress, ctx) { /* mutates box.children, §4 */ },
};
```

Field requirements enforced by `registry.register()` (`js/components/registry.js`):

| Field | Required | Behaviour if missing |
|---|---|---|
| `id` | yes | registration throws — the whole definitions file fails |
| `build` | yes | registration throws |
| `update` | effectively | warns; the component renders once and never refreshes |
| `name`, `category` | yes in practice | warns; the palette entry is unusable |
| `settings` | optional | must be an array if present, else registration throws |
| `defaultConfig` | yes in practice | the factory falls back to 200×100 and `x/y = 0` |

A definition may also set `isBackground: true` (fills the canvas, is *not*
rescaled — see §5) or `lockAsBackground: true` (`editable = false`, so it cannot
be dragged or selected by click, but a pointer hit still opens its settings).

Two optional hooks let a component drive its own box instead of accepting whatever
size the factory guessed:

| Hook | Called by | Contract |
|---|---|---|
| `designSize(config)` | `factory.createComponent()` and `PropertyRenderer.rebuildBoxChildren()` | returns `{width, height}`: the design space `build()` lays children out in. Defaults to `defaultConfig.width/height`. The three charts return `{width: 200 × ratio, height: 200}`, so `ratio` (1…8) widens the plot rect without moving a single child coordinate. Keep it proportional to what the user sees: the factory scales by `target ÷ design` per axis, so a design size equal to the target means `sx = sy` and nothing is stretched. |
| `onSettingChange(box, key, value, config)` | `SettingsPanel._onPropertyChange()` and Studio `PropertyEditor._onStyleChange()`, *before* the value is applied | return `true` when it resized the box, so the rebuild that follows measures against the new size. Chart `ratio` sets `box.width = box.height × ratio` by **direct assignment** — never `box.resizeWidth()`: the wrapper carries `lockRatio: true`, so `resizeWidth` preserves the aspect and drags `height` with it (measured on the real Leafer canvas: `resizeWidth(1600)` on a 400×200 chart produced 1600×**800**, i.e. a uniform zoom instead of a wider chart). |

Both hooks and the "default appearance is untouched" promise are pinned by
[`tools/chart-ratio-test.html`](../tools/chart-ratio-test.html) — 159 assertions over
`plotInsets` back-compatibility, the fixed-pixel internals at 1:1…1:8, the area clamp,
the marker alignment, the corner-pinned icon (its distance to the right edge stays 40
design px at every ratio) and the `valueFollow` switch (bottom-pinned off, dot-chasing
on, clamped inside the panel), plus 21 more that byte-compare `chartChildren()` /
`chartUpdate()` against temporary HEAD copies (the page prints the `git show` commands;
those 21 show up as "skipped" when the copies are absent, never as false passes — with
the copies present the page reports 180/180). Run it on a static server whenever you
touch `chartCommon.js`, `js/utils/math.js` or `factory.js`.

The weather pair has its own page, [`tools/weather-test.html`](../tools/weather-test.html)
— 82 assertions. It re-declares the square panel's *pre-upgrade* `build()` output as
literal constants and compares, so "old template still looks identical" is measured
rather than assumed (the only exemptions are the `name` metadata key and the icon
`path`, which this upgrade deliberately completed), plus: every one of the 7 icon paths
is checked against the character length of the source SVG so a future migration cannot
silently truncate it again, every `settings` key is probed to prove `build()` actually
consumes it and does not collide with `LAYOUT_KEYS`, the gradient directions are all
verified to be `Direction9` keywords (Leafer throws on anything else), and the wide
panel's layout contract (disc and icon share a centre, divider is a rotated `Line`,
condition label is right-pinned). Run it after touching `weatherCommon.js`,
`weatherPanel.js`, `weatherWide.js` or `icons.js`.

### Settings control types

`renderSettings()` (`js/ui/PropertyRenderer.js`) turns each `settings` entry into
one row. Supported `item.type`:

| `type` | Row | Value written back |
|---|---|---|
| `title` | section heading, no input | — |
| `number` | number input (`min`/`max`/`step`) | `parseFloat`, `0` when blank |
| `color`, `bg_color` | colour picker (layui in the editor, native in Studio) | `#rrggbb` |
| `select` | dropdown from `item.options` (`{value,label}`) | the string `value` |
| `button_group` | one small button per option, labelled with the option name; the active one gets a blue border | the option's `value` |
| `boolean` | checkbox | `true` / `false` |
| `text` *(default)* | free text input | the string |
| `bg_image` | preset thumbnail row + file input | preset url or dataURL |
| `image_picker` | preset thumbnails (click = use) + optional “none” cell + upload button that resamples the file to a 1:1 PNG dataURL (`item.uploadSize`, default 256) | preset url, `''` for none, or `data:image/png;base64,…` |
| `font_selector` | font dropdown | font name |
| `unit_button` | button that opens the global unit dialog | nothing — it ignores `key` and edits `unitConfig` |

`displayValue = config[key] ?? item.defaultValue ?? ''`, so a row can echo the value
`build()` actually falls back to even for templates saved before the key existed —
keep the two in sync.

`button_group` highlights the row whose `value` equals `displayValue`, so a
button-group knob only shows an active option when the key is reachable through that
chain: either list it in `defaultConfig` (what the weather panels do — every knob is
in `defaultConfig` with a value equal to the `build()` fallback) or set
`item.defaultValue`. `select` does not care, since a `<select>` shows the value itself.

**Key naming matters.** `applyPropertyChange()` treats `x`, `y`, `width`, `height`,
`rotation`, `opacity`, `cornerRadius`, `fill`, `stroke`, `strokeWidth` as layout keys:
it writes them straight onto the `Box` and never re-runs `build()`. A setting meant to
change something a child element owns therefore needs a distinct key
(`routeCornerRadius`, `pointStrokeWidth`, …), otherwise it silently edits the wrapper.

## 2. Register it

Add the import and the entry in `js/components/definitions/index.js`:

```js
import speedGauge from './speedGauge.js';

const allDefinitions = [
    // …
    speedGauge,
];
```

That is the whole integration. The palette, the designer, `store.activeComponents`,
template serialisation and the export loop all read from the registry.

Registering the same `id` twice logs a warning and **overwrites** — handy while
developing, so a hot reload of your module is enough; but it also means two files
silently fighting, so keep ids unique.

## 3. `build(config, data)` — return descriptors, not instances

`build` returns a **plain array of Leafer config objects** with a `tag`, and the
factory turns them into real elements when it creates the `Box`. You do not call
`new LeaferUI.Text(...)` — descriptors keep the tree serialisable and let Leafer
apply its own defaults.

```js
build(config, data) {
    const chartData = data?._chartData || {};          // extremes, point sets
    return [
        { tag: 'Rect',  name: 'plate', x: 0, y: 0, width: config.width, height: config.height,
          fill: config.colors.background, cornerRadius: config.cornerRadius },
        { tag: 'Line',  name: 'needle', lockRatio: true, points: [150, 150, 150, 40],
          stroke: config.colors.needle, strokeWidth: 3 },
        { tag: 'Text',  name: 'value', x: 150, y: 210, text: '0', resizeFontSize: true,
          fontSize: 24, fill: config.colors.text, textAlign: 'center' },
    ];
}
```

Practical rules learned from the shipped components:

- **Give every child that changes per frame a `name`** (and keep the index
  stable). Most existing components index children positionally
  (`children[9].text = …`), which is compact but fragile — a new name-based lookup
  is easier to maintain, so prefer `name`.
- `tag` values are the Leafer element names: `Box`, `Rect`, `Text`, `Line`,
  `Ellipse`, `Polygon`, `Path`, `Group`.
- `lockRatio: true` on lines keeps their endpoints scaling with the box;
  `resizeFontSize: true` on text makes the font scale when the component is
  resized. Without these, resized templates look broken.
- **Do not read the DOM or `window` sizes** in `build`. Design inside the default
  `width`/`height` from your own `defaultConfig`: the factory builds at the default
  geometry and then resizes the box (scaling children), because the per-child
  coordinates you compute are not aware of the target size.
- If the *design* size itself should follow a setting — the charts' `ratio` — declare
  `designSize(config)` (§1) and design inside the size it returns. The factory then
  builds and measures against that box, so a wider chart is a wider plot rect rather
  than a stretched 400-wide one (`sx = sy`), and `update()` must recompute the same
  width from `box.__leaferConfig` before multiplying by `resizeScale()`.
- Inside a resizable box, anchor things that must stay in a corner to the **edge**, not
  to a percentage: the chart icon sits at `width - 40`, so it reads as "bottom-right"
  at 1:1 and at 1:8 alike (a `0.9 × width` anchor put it 160 px off the edge once the
  panel was widened). Derive the margin from the old literal — `CHART_W - CHART_W * 9/10`
  is exactly 40, so the default box still gets 360 and parity is preserved by
  construction, not by luck.
- A setting that only changes where `update()` writes a child per frame (the charts'
  `valueFollow`) does not need a `build()` branch at all. Leaving `build()` alone keeps
  the default output byte-identical for free, and toggling it still repaints immediately,
  because a non-layout key routes through `rebuildBoxChildren()`, which ends by calling
  `updateFn(id, currentFrame)` — so the new position lands on the very next tick of the
  panel, paused or not.
- Use `data` (the whole `rq`) for anything static — totals, extremes, the point
  sets in `data._chartData`, the projected route in `data._mapPoints`. This is the
  only place you get the full series; `update()` sees one second.
- **Never hand a `data._chartData` array straight to a child.** `Box.resizeChildren`
  is not a wrapper transform: the moment the box is resized it multiplies every
  child's `points` / `x` / `y` / `width` / `height` **in place**, and it keeps
  mutating whatever array you handed it. So `points: chartData.mapPoints` rewrites
  the store's own design coordinates, and the next `update()` — which multiplies by
  `resizeScale()` — scales them a second time, and the layers drift apart. Copy at
  the boundary: `points: mapPoints.slice()`.
- Helper functions you will want: `plotInsets(W, H, padX, padY)` and
  `mapToRange()` from `js/utils/math.js`, the formatters in `js/utils/format.js`
  (`speedToPace`, `secondsToHHMMSS`, `metersToKm`, `timestampToDateString`).

## 4. `update(box, frameData, progress, ctx)`

Called by `updater.updateAllComponents(currentFrame)` for every child of the
canvas frame whose `id` resolves to a registered definition, and again for the
off-screen memory instance used by export. Signature, precisely:

| Param | Contents |
|---|---|
| `box` | the component's Leafer `Box` (mutate `box.children[i]`) |
| `frameData` | `trkptData[currentFrame]` — one second of [DATA_SCHEMA.md](DATA_SCHEMA.md) |
| `progress` | `currentFrame / (maxFrame - 1)`, 0…1 |
| `ctx` | `{ trkptData, currentFrame, maxFrame, chartData }` — use `ctx.chartData` for chart geometry and `ctx.currentFrame` to index into it |

There is **no `this`**: the definition object is not the instance, so all state
must come from the parameters or from `box` itself. Config lives on
`box.__leaferConfig` (merged `defaultConfig` + template `customProps` + user edits).

```js
update(box, frameData, progress, ctx) {
    const children = box.children;
    if (!children || !children.length) return;             // build changed? fail quiet

    const byName = n => children.find(c => c && c.name === n);
    const speed = frameData.speed || 0;
    const ratio = Math.min(1, Math.max(0,
        (speed - box.__leaferConfig.minValue) /
        (box.__leaferConfig.maxValue - box.__leaferConfig.minValue || 1)));

    const needle = byName('needle');
    if (needle) needle.rotation = ratio * 270 - 135;
    const readout = byName('readout');
    if (readout) readout.text = speed.toFixed(1);
}
```

Look children up by `name`, not by index, whenever any of them can be missing. A
layer toggle is implemented by not emitting that child (see §5), so indices shift
underneath you; `name` survives. `lapPanels.js` and the three chart components in
`chartCommon.js` already do this. When every child is unconditional and the order is
part of the component's contract (the map panels: 0 = route, 1 = progress, 2 = current
position …), indexing is fine — but then say so in a comment above `build()`.

If you need pixel positions on a resized component, scale them — the children were
built in default geometry, so multiply by `resizeScale(box, defW, defH)` from
`js/utils/math.js` (exactly what `heartChart.js` does for its progress marker).

Both halves of that rule come from the same mechanism: a resize multiplies every
child's geometry by `new ÷ old`, so the accumulated factor is exactly
`current ÷ default` — which is what `resizeScale()` returns. Write design
coordinates in `build()` (into an array you copied), write design × `resizeScale()`
in `update()`, and the layers stay welded together at any size. Get either half
wrong and the component only looks right at its default dimensions.

Two `scale`-related traps live on the same mechanism, both fixed in
`definitions/chartCommon.js`. A filled area polygon must **not** inherit the
curve's `curve: true`: Leafer smooths the whole closed path, and the single long
segment that closes the shape along the baseline gets dragged into a wave that
pokes outside the plot rect. Keep the area straight-segmented and clamp its
vertices into the plot rect — with thousands of points per chart, straight versus
smooth is sub-pixel anyway. And `scale` transforms are anchored at the element's
top-left, so a corner icon grows toward the bottom-right; counter-translate its
`x`/`y` by `(factor - 1) × naturalSize × defaultScale ÷ 2` in `build()`, then
recompute the same offset against `resizeScale()` in `update()`, because a resize
multiplies `x`/`y` but never `scale`. Both offsets are exactly zero at the default
factor, which is what keeps old templates pixel-identical. A third rule lives right
next to them: an element that belongs in a corner is anchored by an **edge margin**
(`width − 40`), never by a width percentage — a 90% anchor leaves it 160 px off the
right edge once the chart is 1:8, which reads as "somewhere in the middle of the curve"
rather than "in the corner", and the margin derived from the same 400-wide default is
still exactly 360 there.

Cost matters: `update()` runs once **per frame per component**, twice when the
memory canvas is active, thousands of times during one export. No sorting, no
regex compilation, no `new` arrays per call — precompute in `build()`. Scanning
`children` with a couple of `find()` calls is fine (the list is single digits); if a
component really needs per-frame indexing, cache it and invalidate on rebuild.

Errors are caught and logged per component, so a throwing `update()` degrades that
one component instead of killing the render. Do not rely on that: guard explicitly,
because the log is not visible to users.

## 5. Sizing, templates and `customProps`

The factory (`js/components/factory.js`) wraps your children in a `Box` with
`lockRatio: true`, `resizeChildren: true`, `hitBox: true` and a `pointer.down`
listener that emits `COMPONENT_SELECTED`. Then:

1. `build()` is called with the design size — `designSize(config).width/height` when
   the definition declares it, otherwise `defaultConfig.width/height` (background
   components get the target size instead, and are laid out at full canvas size).
2. The `Box` is resized to the target size, which scales the children. The target is
   `config.width/height` — except for `designSize` components created without an
   explicit width/height (e.g. `addComponentToCanvas(id, {ratio: 8})`), where the
   design size *is* the target; otherwise the two `lockRatio` resize calls below would
   round-trip through the aspect lock.
3. `box.__leaferConfig` stores the merged config for the property panel.

Because the wrapper is created with `lockRatio: true`, `resizeWidth()`/`resizeHeight()`
each preserve the aspect ratio, so a restore only lands exactly on a *proportional*
target (measured: 800×100 for a 1600×200 design → exactly 800×100). A non-proportional
`config.width/height` pair (800×300) comes back as 2400×300 — a long-standing quirk of
this step, unrelated to `ratio`; drag handles keep the aspect, so it does not normally
show up in the editor.

Writing `box.width` / `box.height` directly *does* bypass the aspect lock, but it does
not scale anything either: on the live canvas a 400×200 chart assigned to 800×300 kept
its children at `x` 14…386, ruler width 372 and icon `x` 360 — only the frame moved.
`resizeChildren` reacts to the `resize*()` API, not to plain property writes. That is
why `ratio` goes through `onSettingChange` (direct `box.width`, no aspect drift) and
then relies on the panel re-running `build()` for the new design width; if you take the
same route for another setting, make sure a rebuild follows.

Only the differences from `defaultConfig` are serialised into a template. Your
semantic settings go into `components[i].config` (`js/utils/configDiff.js`); the older
`customProps` block still records positional child styles under
`child_{index}_{property}` (`fill`, `stroke`, `fontSize`, `strokeWidth`), but nothing
reads those keys back, so `config` is what makes a saved template look the same on
reload. See [COMPONENT_JSON_SPEC.md](COMPONENT_JSON_SPEC.md).

**Consequence:** if you add a field to `defaultConfig`, existing saved templates
still load — they simply do not have that key. Provide a sane fallback wherever you
read it (`config.showTicks !== false`, not `config.showTicks`), and make that fallback
equal whatever value used to be hardcoded, so an old template renders identical.
Layer toggles obey the same rule: default to on, so the child list built without any
of the new keys is exactly the list the component used to build.

Do not reorder children — `build()` output order is paint order (children later in
the list draw on top, which is why the area fill sits just before the curve in
`chartCommon.js`), and `children[i]` lookups in `update()` break the moment a layer
is switched off.

## 6. Categories

`category` drives palette grouping; use one of the existing values so your
component is not orphaned in a new group:

| Category | Contents | Examples |
|---|---|---|
| `background` | the base layer | `appv_bg_pan` |
| `time` | clock, date and weather blocks | `appv_date_pan`, `text_time_pan`, `el_weather_pan` (square) + `el_weather_wide_pan` (560×200) — both are option objects over `definitions/weatherCommon.js` |
| `distance` | distance bars, rulers, arcs, gauges | `lite_distance_pan`, `zs8_distance_pan`, `el_speed_pan` |
| `attr` | attribution/brand plates | small info plates |
| `chart` | time-series charts | `pt_heart_pan`, `pt_pace_pan`, `pt_ele_pan` — all three are thin option objects over `definitions/chartCommon.js` |
| `map` | route and heading maps | `appv_map_pan`, `appv_map_a_pan` |
| `text` | free labels | `text_day_pan`, `text_nowtime_pan` |

(`registry.getCategories()` derives the list from the registrations, so a new value
works mechanically — it just creates a new group.)

## 7. Data bindings

`dataBindings` is documentation and a dependency hint: it names the
[DATA_SCHEMA.md](DATA_SCHEMA.md) fields your component reads
(`heart_rate`, `speed`, `distance`, `altitude`, `cadence`, `power`, `step_length`,
`slope`, `Gain`, `Loss`, `azimuth`, `position_lat`, `position_long`, `timestamp`,
`sec`). Keep it honest — the panels and future "needs a sensor" warnings use it.

Every optional field can be `null` (no strap, no power meter, no GPS, a file whose
cadence is absent). The shipped components handle this by hiding the value or
printing `--`, **keeping the layout stable**; do the same. A component that
disappears and reappears per frame is worse than one showing `--`.

## 8. Building a component without code

[PulseFrame Studio](../studio/) (`studio/index.html`) is a visual workbench for the
same output: draw the elements, bind fields, preview against
`studio/js/demoData.js`, then *Submit to Library* or export the JSON. Studio
components are **declarative specs** consumed by `js/components/visual/loader.js`
(ids prefixed `studio_comp_`, local ones in browser storage, shared ones fetched
from the store), so they need no registration in `definitions/index.js` and reach
every user of your store.

Use code definitions when you need per-frame logic Studio's binding engine cannot
express: custom math, chart geometry, animation states, map projections.

## 9. Checklist before opening a PR

- [ ] Unique `id`, human-readable `name`, existing `category`.
- [ ] `build()` returns descriptors only; every per-frame child has a `name`.
- [ ] Reads only `DATA_FIELDS` names; tolerates `null`/`undefined` everywhere.
- [ ] `update()` allocates nothing heavy per call and guards child indexes.
- [ ] Resizing to 0.5× and 2× of the default still looks right (`lockRatio`,
      `resizeFontSize`, `resizeScale` where needed).
- [ ] Saved, reloaded, and re-saved a template: `customProps` round-trips without
      drift.
- [ ] Video export at 1920×1080 **and** 1080×1920: the component is visible in the
      memory canvas, not just the editor.
- [ ] Works with a file lacking heart rate / cadence / GPS (`samples/demo-run.gpx`
      has all three; try a stripped copy).
- [ ] No store URL, no API key, no `?v=` cache-buster introduced (the project
      standard is: bare relative imports, rely on the CDN to purge).
