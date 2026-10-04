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
- Use `data` (the whole `rq`) for anything static — totals, extremes, the point
  sets in `data._chartData`, the projected route in `data._mapPoints`. This is the
  only place you get the full series; `update()` sees one second.
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
    if (!children || children.length < 3) return;          // build changed? fail quiet

    const speed = frameData.speed || 0;
    const ratio = Math.min(1, Math.max(0,
        (speed - box.__leaferConfig.minValue) /
        (box.__leaferConfig.maxValue - box.__leaferConfig.minValue || 1)));

    children[1].rotation = ratio * 270 - 135;
    children[2].text = speed.toFixed(1);
}
```

If you need pixel positions on a resized component, scale them — the children were
built in default geometry, so multiply by `resizeScale(box, defW, defH)` from
`js/utils/math.js` (exactly what `heartChart.js` does for its progress marker).

Cost matters: `update()` runs once **per frame per component**, twice when the
memory canvas is active, thousands of times during one export. No sorting, no
regex compilation, no `new` arrays per call — precompute in `build()` and index.

Errors are caught and logged per component, so a throwing `update()` degrades that
one component instead of killing the render. Do not rely on that: guard explicitly,
because the log is not visible to users.

## 5. Sizing, templates and `customProps`

The factory (`js/components/factory.js`) wraps your children in a `Box` with
`lockRatio: true`, `resizeChildren: true`, `hitBox: true` and a `pointer.down`
listener that emits `COMPONENT_SELECTED`. Then:

1. `build()` is called with `defaultConfig.width/height` (background components get
   the target size instead, and are laid out at full canvas size).
2. The `Box` is resized to the target size, which scales the children.
3. `box.__leaferConfig` stores the merged config for the property panel.

Only the differences from `defaultConfig` are serialised into a template, under
`customProps` with keys `child_{index}_{property}` (`fill`, `stroke`, `fontSize`,
`strokeWidth` are what the extractors currently read). See
[COMPONENT_JSON_SPEC.md](COMPONENT_JSON_SPEC.md).

**Consequence:** if you add a field to `defaultConfig`, existing saved templates
still load — they simply do not have that key. Provide a sane fallback wherever you
read it (`config.showTicks !== false`, not `config.showTicks`). Never reorder
children: positional `customProps` keys and `children[i]` lookups both break.

## 6. Categories

`category` drives palette grouping; use one of the existing values so your
component is not orphaned in a new group:

| Category | Contents | Examples |
|---|---|---|
| `background` | the base layer | `appv_bg_pan` |
| `time` | clock and date blocks | `appv_date_pan`, `text_time_pan` |
| `distance` | distance bars, rulers, arcs, gauges | `lite_distance_pan`, `zs8_distance_pan`, `el_speed_pan` |
| `attr` | attribution/brand plates | small info plates |
| `chart` | time-series charts | `pt_heart_pan`, `pt_pace_pan`, `pt_ele_pan` |
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
- [ ] No store URL, no API key, no `?v=` inconsistency introduced.
