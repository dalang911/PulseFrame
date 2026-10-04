# Data schema

Every supported input format (FIT, GPX, TCX, JSON) is normalised into one
structure before anything is drawn. That structure is the contract between the
parsers and the components, so **component code never looks at a raw file**.

The shape is defined and validated in code:

| Concern | File |
|---|---|
| field definitions + validator | `js/data/DataSchema.js` (`TRKPT_FIELDS`, `SUMMARY_SCHEMA`, `MOTION_SCHEMA`, `validateRq`) |
| canonical name constants | `DATA_FIELDS` in `js/core/constants.js` |
| production of the structure | `js/parsers/index.js` (`gpxToRq`, `tcxToRq`, `fitToRq`, `jsonToRq`) |
| completion of derived fields | `js/data/fieldComputer.js` |

## 1. Top level

```js
rq = {
    status: 0,                     // 0 = ok, -1 = nothing usable found
    data: {
        summary:      { … },       // what this activity is
        motion:       { … },       // headline totals
        trkpt:        [ … ],       // per-second track points — the frames
        lap_standard: [ … ],       // synthetic 1 km splits
        lap_user:     [ … ]        // watch-marked laps (FIT only; may be absent)
    },
    _chartData: { … },             // attached by DataPipeline after computing
    _mapPoints:   [ … ]            // attached by DataPipeline after computing
}
```

`validateRq(rq)` requires an object with `status`, `data.summary`, `data.motion`
and a non-empty `data.trkpt`, and spot-checks `timestamp` / `sec` on the first
point and `distance` on the last. A failure throws in `dataPipeline.process()` —
better an error than a half-drawn dashboard.

## 2. `summary` and `motion`

| `summary` | type | meaning |
|---|---|---|
| `name` | string | activity title (FIT records have no title, so `"fit"` is used) |
| `training_at` | string | start time, `YYYY-MM-DD HH:MM:SS` |
| `total_time` | number | elapsed seconds |
| `total_timer_time` | number | moving/timer seconds |

| `motion` | type | meaning |
|---|---|---|
| `distance` | number | total distance, metres |
| `total_ascent` | number | cumulative climb, metres |
| `total_descent` | number | cumulative descent, metres |

Not every format supplies every figure: GPX takes ascent/descent from the
parser's elevation `pos` / `neg` totals, while FIT reports `total_ascent` in
kilometres and the parser multiplies by 1000 to land on metres.

**There is no `pace` field.** Pace is the reciprocal of speed and is formatted per
component (see `js/utils/format.js`), because a runner wants `min/km` while a
cyclist wants `km/h` — and both readings come from the same `speed` value.

## 3. `trkpt[]` — the frame array

After `interpolatePoints()` there is **exactly one entry per second**, and the
array index equals the frame number: frame *n* is second *n* of the activity.
That one-to-one mapping is what keeps gauges, charts and the moving map in sync
with the exported video.

| Field | Type | Unit | Notes |
|---|---|---|---|
| `timestamp` | number | s | absolute Unix seconds (UTC) |
| `sec` | number | s | seconds since the first point, starts at 0 |
| `position_lat` | number | ° | WGS84 latitude |
| `position_long` | number | ° | WGS84 longitude (note: `long`, not `lng`) |
| `altitude` | number \| null | m | above sea level |
| `is_pause` | boolean | — | stop detected during parsing |
| `speed` | number | km/h | see “speed sources” below |
| `distance` | number | m | cumulative, from the file's own distance track |
| `heart_rate` | number \| null | bpm | `null` without a strap |
| `cadence` | number \| null | steps/min | see “cadence normalisation” |
| `power` | number \| null | W | cycling/power-meter only, optional |
| `step_length` | number | m | derived: `speed / (cadence·60/1000)` |

Derived in `fieldComputer.js`, added on top of the parsed values:

| Field | Type | Unit | Computed by |
|---|---|---|---|
| `slope` | number | % | `computeSlope` — Δaltitude / Δdistance × 100, zero when a step is degenerate |
| `Gain` | number | m | `computeGainLoss` — cumulative ascent, with a small-delta threshold so GPS/altimeter noise does not inflate it |
| `Loss` | number | m | `computeGainLoss` — cumulative descent (same threshold) |
| `azimuth` | number | ° | `computeAzimuth` — bearing to the next point, `0–359`, carried forward when two points coincide |

Mind the capitalisation: `Gain` / `Loss` are uppercase because the original
device exports used those names. `DATA_FIELDS.TRKPT` in `constants.js` is the
authoritative spelling list; prefer it over literals.

## 4. Interpolation rules (`data/interpolator.js`)

`interpolatePoints(rq)` rewrites `rq.data.trkpt` **in place** (which is why
`DataPipeline` snapshots the raw points first):

1. Every value is first cleaned through `formatValue()` — `heart_rate` and
   `cadence` are rounded to integers, `distance`/`speed`/`step_length`/`altitude`
   to 2 decimals, coordinates to 6 decimals (≈ 0.1 m).
2. For each adjacent pair, missing seconds are filled with a linear blend of the
   two neighbours, but **only for keys present on both points**. A field that is
   `null` on one side therefore does not leak a bogus number to the filled point.
3. Pairs whose timestamps are equal or reversed are skipped with a console
   warning — corrupted exports are common, and dropping the segment beats
   producing negative time.

## 5. Speed and cadence quirks you should know

These are deliberate, and they are the most frequent source of “the numbers look
wrong” reports:

- **Speed.** COROS GPX exports carry a `speed` extension in m/s and are used
  directly (× 3600/1000). Other GPX files have no speed, so it is estimated from
  the *previous and next* segments — a centred difference that smooths GPS jitter
  (× 3.6 for km/h). The first and last points keep the estimate as 0.
- **Cadence.** Many running watches report *left-foot* cadence, roughly half the
  real step rate. The parser tracks a running average; if that average is below
  140 spm it doubles the value. Devices that already report full cadence are left
  alone — which is why the threshold exists instead of an unconditional ×2.
- **`is_pause`.** Pause segments keep their timestamps, so a paused minute still
  consumes frames. Trim it with `startFrame` / `endFrame` in the editor.

## 6. Laps

`lap_standard` is generated for every format by `computeLaps(trkpt)`: it walks the
cumulative distance and emits `{ id, total_timer_time }` at each 1 km crossing, so
a lap can span two track points and may be reported on the point that *closed* it.

`lap_user` exists only when the source declares real lap records (FIT). Entries are
the decoded FIT lap plus normalised `timestamp` / `start_time` in Unix seconds, so
the available columns vary by device. `js/components/definitions/lapPanels.js`
handles both: `appv_lap_pan` renders the standard splits, `appv_lap_user_pan`
renders the watch laps with a highlight marker on the lap under the current frame.
If a component reads `lap_user` it must tolerate `undefined` — GPX and TCX never
fill it.

## 7. Chart and map geometry (`fieldComputer.js`)

`computeAllFields(rq)` returns one flat object; the same object is attached as
`rq._chartData` (with `mapPoints` also exposed as `rq._mapPoints`) and cached on
`dataPipeline.chartData` / `dataPipeline.mapPoints`.

| Group | Keys |
|---|---|
| heart rate | `heart_points`, `pt_heart_points` |
| cadence | `cadences_points` |
| pace | `paces_points`, `pt_paces_points` |
| elevation | `ele_points`, `pt_ele_points`, `ele18_points`, `o2o_ele_points`, `zh_ele_points`, `zh_eled_points` |
| extremes | `heartRateMin`, `heartRateMax`, `user_heartRateMax`, `cadenceMin`, `cadenceMax`, `paceMin`, `paceMax`, `eleMin`, `eleMax`, `powerMin`, `powerMax`, `baseAltitude` |
| map | `mapPoints` |

Each point set is an array of `{ x, y }` in a **400 px-wide normalised space**
(`xScale = 400 / (n - 1)`), so a component scales it to its own box instead of
re-deriving coordinates. `baseAltitude` is the first valid altitude, used to keep
elevation axes from floating when a file has no sea-level reference.

The `zh_*` / `o2o_*` / `ele18_*` families exist because different presets draw the
elevation profile in different projections (per-km bars, 1:1 scale, 18×
exaggeration). They are the same data, re-mapped — not different measurements.

## 8. Writing a component against this schema

```js
update(config, frameData /* = trkpt[currentFrame] */, progress) {
    const hr = frameData.heart_rate;
    if (hr === null || hr === undefined) {
        // no strap: hide the value, keep the layout stable
        this.getChild('hrValue').visible = false;
        return;
    }
    this.getChild('hrValue').text = String(Math.round(hr));
}
```

Rules worth following:

- Read only the names in `DATA_FIELDS`; never invent a key.
- Treat every optional field as possibly `null`/`undefined`, both in `build()` and
  in `update()`.
- Do not recompute derived fields — they are already there, computed once with the
  noise thresholds applied.
- If you need totals or extremes, read `rq._chartData` / `store.get('processedData')`
  rather than scanning `trkpt` per frame.
