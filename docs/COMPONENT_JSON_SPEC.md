# JSON formats

Two distinct documents are exchanged as JSON, and they are often confused:

| | **Template** (a layout) | **Component spec** (a widget) |
|---|---|---|
| Describes | which components sit where, and their style overrides | a new dashboard element, built from layers and data bindings |
| Produced by | editor (`js/ui/TemplateManager.js`) or designer (`js/designer/Exporter.js`) | PulseFrame Studio (`studio/js/SpecStore.js`) |
| Consumed by | `TemplateManager.deserialize()` | `js/components/visual/visualFactory.js` + `bindingEngine.js` |
| Store `kind` | `template` | `component` |
| Version field | `"version": "2.0"` | `"version": 1` |

Both are stored as text in the `json_content` column of the store, so the *store*
does not care which one you send — the `kind` field is what tells the client which
loader to use.

---

## Part 1 — Template JSON

```json
{
  "version": "2.0",
  "canvasSize": { "width": 1920, "height": 1080 },
  "components": [
    {
      "id": "pt_heart_pan",
      "name": "Heart Chart",
      "x": 80, "y": 850,
      "width": 400, "height": 200,
      "rotation": 0,
      "scale": 1,
      "config": { "colors": { "background": "#1a1a2e", "needle": "#C71585", "ruler": "#ffffff", "text": "#ffffff" }, "maxValue": 180 },
      "customProps": { "child_1_stroke": "#C71585" }
    }
  ],
  "createdAt": "2026-01-15T08:30:00.000Z"
}
```

### Top level

| Field | Type | Required | Notes |
|---|---|---|---|
| `version` | string | yes | always `"2.0"` for documents written by this code |
| `canvasSize` | object | yes | `{ width, height }`; loaded before the components so coordinates land in the right aspect |
| `components` | array | yes | render order = array order, first entry at the bottom |
| `createdAt` | string | no | ISO 8601, informational |

### Component entry

| Field | Type | Notes |
|---|---|---|
| `id` | string | must match a registered definition (or a Studio spec id) |
| `name` | string | display name, stored redundantly for readability |
| `x`, `y` | number | top-left in canvas pixels |
| `width`, `height` | number | box size; the factory builds at the definition's *design* geometry — `defaultConfig.width/height`, or `designSize(config)` when the definition declares it (the three charts size their design width as `200 × ratio`) — and then scales children to this size |
| `rotation` | number | degrees, default `0` |
| `scale` | number | default `1` |
| `customProps` | object | legacy positional style dump — see below |
| `config` | object | the component's own settings, as a diff from `defaultConfig` |

### `customProps`

Only the *differences* from `defaultConfig` are written, using the key shape
`child_{index}_{property}`:

| Property | Example |
|---|---|
| `fill` | `child_0_fill: "#FF5733"` |
| `stroke` | `child_1_stroke: "#C71585"` |
| `fontSize` | `child_2_fontSize: 18` |

The extractor (`TemplateManager._extractCustomProps`, mirrored in
`designer/Exporter.js`) walks the children positionally, which is why a component
must never reorder the array returned by `build()` — index 2 in an old template has
to remain the same element.

On load, `customProps` is merged into the config overrides passed to
`addComponentToCanvas()`, so it lands in `box.__leaferConfig` together with `x`, `y`,
`width`, `height` — but `build()` reads semantic keys (`config.avatarUrl`,
`config.pointSize`), never `child_0_fill`, so **these values are written and then
ignored**. They are kept for compatibility with templates already in the shop; the
real payload is `config`.

### `config`

`extractConfigDiff()` (`js/utils/configDiff.js`) diffs `box.__leaferConfig` against
`definition.defaultConfig` and writes only the keys the user actually changed:

```json
"config": { "avatarUrl": "./icon/i3.png", "pointSize": 40, "showStartEnd": true }
```

Rules:

- `x`/`y`/`width`/`height`/`rotation`/`scale` are excluded — the top-level fields own
  the geometry.
- Values equal to the default are omitted, so adding a setting never enlarges an
  untouched template, and a template stays valid when a definition gains new defaults.
- A setting that resizes the box is stored twice on purpose, and both copies agree: the
  chart `ratio` (1…8, default 2) goes into `config`, while the resulting `width`
  (`200 × ratio` at default height) is the top-level geometry field. Old templates have
  no `ratio` key, fall back to 2, and land back on exactly the 400×200 box they had.
- Anything that cannot be `JSON.stringify`-ed (a Leafer instance, a cyclic object) is
  skipped rather than throwing.
- On load, `mergeSavedConfig()` copies it into the overrides *before* `customProps`,
  then the factory merges the overrides over `defaultConfig`.
- Old templates simply have no `config` key and behave exactly as before.

An uploaded avatar/icon is stored as a `data:image/png;base64,…` string inside
`config`, which is why the shop's 2 MB cap matters: a 256×256 PNG costs roughly
30–60 KB per image.

### Known limitations (deliberate, but worth knowing)

- **The background layer is not part of a template.** Definitions flagged
  `isBackground` (the `Setup` plate) are skipped on both save and load: colour and
  image stay a per-user canvas setting, so a shared template cannot repaint your
  canvas.
- **`rotation` and `scale` are saved but not restored.** `deserialize()` passes
  only `x/y/width/height` plus `customProps` to the factory. Rotated presets (the
  vertical rulers) therefore need the rotation baked into the definition, not into
  the template. Fixing this means adding the two keys to `configOverrides` — and
  then also to the property panel, so a load-then-save cycle keeps writing them.
- **Unknown component ids are skipped with a warning**, not an error: a template
  referencing a Studio component that was deleted still loads the rest.
- Loading is a **full reset** (`clearAllComponents()` first), so templates replace
  each other rather than merge.

### Local storage

Saved templates live in `localStorage` under `frameConfig_{name}`
(`js/core/constants.js` → `STORAGE_PREFIX`). The designer writes its own drafts
under `designer_*`, Studio components under `studio_comp_{id}`, and the shop cache
under `templateShop_cache`. v1 documents (`frameConfig_*` written by the predecessor
project) are read by the same loader, which is why `version` is advisory rather than
validated.

### Size

The store caps `json_content` at 2 MB, and a template should stay near 100 KB; the
client fetches the whole list, so a bloated template slows the *Shared* panel for
everyone, not just you.

---

## Part 2 — Studio component spec

A declarative component: layers of Leafer elements plus bindings that map activity
data onto element properties each second. No JavaScript is submitted, which is why
shared components are safe to auto-load.

```json
{
  "version": 1,
  "meta": {
    "id": "custom_m2k1x7a",
    "name": "Heart Arc",
    "category": "distance",
    "icon": "",
    "width": 400,
    "height": 200
  },
  "layers": [
    {
      "uid": "Lm2k1x0a1",
      "name": "track",
      "type": "arc",
      "visible": true,
      "props": {
        "x": 40, "y": 40, "width": 200, "height": 200,
        "innerRadius": 1, "startAngle": -210, "endAngle": 30, "closed": false,
        "stroke": "#333344", "strokeWidth": 24, "strokeCap": "round", "strokeAlign": "center"
      },
      "bindings": {}
    },
    {
      "uid": "Lm2k1x0b2",
      "name": "value",
      "type": "text",
      "visible": true,
      "props": { "x": 90, "y": 110, "text": "0", "fontSize": 40, "fontWeight": "black", "fill": "#ffffff" },
      "bindings": {
        "text": { "mode": "text", "field": "heart_rate", "decimal": 0, "suffix": " bpm" }
      }
    },
    {
      "uid": "Lm2k1x0c3",
      "name": "needle",
      "type": "arc",
      "visible": true,
      "props": { "stroke": "#ff6b6b" },
      "bindings": {
        "endAngle": { "mode": "angle", "field": "heart_rate", "min": 60, "max": "heartRateMax", "from": -210, "to": 30 }
      }
    }
  ]
}
```

### `meta`

| Field | Meaning |
|---|---|
| `id` | registry id; Studio generates `custom_{base36}` and the loader prefixes stored components with `studio_comp_` |
| `name`, `category`, `icon` | palette presentation (`category` values as in the component guide) |
| `width`, `height` | default box size — the design reference every layer coordinate is written against |

### `layers`

Array order is stacking order (index 0 at the bottom). `group` layers nest via
`children`. `uid` is stable and becomes the Leafer element `id`, which is how the
binding engine finds the element again after a rebuild.

| `type` | Leafer `tag` | Note |
|---|---|---|
| `rect` | `Rect` | `cornerRadius` supported |
| `ellipse` | `Ellipse` | |
| `arc` | `Ellipse` | gauge ring: `innerRadius`, `startAngle`, `endAngle`, `strokeCap`. `closed: false` is required for round caps — an angle Ellipse without it renders as a closed sector and drops the cap. `normalizeArcProps()` back-fills it for older specs. |
| `line` | `Line` | origin at `x/y`, `width` is the length, `rotation` the direction |
| `text` | `Text` | `resizeFontSize` opt-in |
| `image` | `Image` | `url`; subject to the same sanitising rules as thumbnails |
| `group` | `Box` | recursive `children` |
| `path`, `polygon` | `Path`, `Polygon` | passthrough for imported dashboards; the Studio palette does not insert them |

### Bindings

`bindings` maps a **property key** of the layer to a binding object. Modes, from
`js/components/visual/bindingEngine.js`:

| `mode` | Typical `prop` | Fields used |
|---|---|---|
| `text` | `text` | `field`, `decimal`, `unit`/`unitKey` (unit config formatting), `prefix`, `suffix` |
| `size` | `width`, `height` | `field`, `min`, `max` — progress bars; the design-time value is the full-scale base and is rescaled by the container's current size |
| `angle` | `endAngle` | `field`, `min`, `max`, `from`, `to` — gauge needles/arcs |
| `color` | `fill`, `stroke` | `field`, `thresholds: [{ gte, color }]` (highest matching tier wins), `base` — zone colours such as heart-rate zones |
| `opacity` | `opacity` | `field`, `min`, `max` |
| `visible` | — | `field`, `threshold` — render the layer only once the value reaches it |

`field` resolution (`fieldValue()`):

1. synthetic names: `pct` (timeline progress), `km`, `pace`, `totalDistance`,
   `totalKm`, `duration`
2. any [DATA_SCHEMA.md](DATA_SCHEMA.md) `trkpt` field (`heart_rate`, `speed`,
   `distance`, `altitude`, `cadence`, `power`, `slope`, `Gain`, `Loss`, `azimuth`, …)
3. any key of `chartData` (`heartRateMax`, `paceMin`, `baseAltitude`, point sets …)
4. otherwise `0`

`min` / `max` accept a literal number **or a field name**, so `"max": "heartRateMax"`
scales a gauge to the actual peak of *this* activity instead of a fixed 200 bpm.

### Loading path

`loadLocalComponents()` reads `studio_comp_*` from `localStorage`;
`loadRemoteComponents()` queries `?action=list&kind=component`, fetches each
`json_content`, registers a definition built by `visualFactory` + `bindingEngine`,
and emits `custom:components-loaded` so the *Local* / *Shared* palettes refresh. A
failing spec is logged and skipped — one broken component never blocks the others.
