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
parser's elevation `pos` / `neg` totals. FIT's native unit is metres as well, but
`fitToRq()` builds `FitParser` with `lengthUnit: 'km'`, and that library routes
every length-typed field — `distance`, all altitude variants, `total_ascent` /
`total_descent`, `gps_accuracy` — through one `lengthUnits` table, so the values
arrive in **kilometres** and `parsers/index.js` multiplies by 1000 to land back on
metres. The `* 1000` and that option are a pair: set the option to `'m'` without
deleting them and FIT altitudes quietly grow a thousandfold. `step_length` is the
mirror-image trap — it is *not* routed through that table, so it arrives in
millimetres (FIT defines it as `{ scale: 10, units: 'mm' }`) and is divided by 1000.

**There is no `pace` field.** Pace is the reciprocal of speed and is formatted per
component (see `js/utils/format.js`), because a runner wants `min/km` while a
cyclist wants `km/h` — and both readings come from the same `speed` value.

## 3. `trkpt[]` — the frame array

After `interpolatePoints()` there is **exactly one entry per second**, and the
array index equals the second number: `trkpt[n]` is second *n* of the activity.
That one-to-one mapping is what keeps gauges, charts and the moving map in sync
with the exported video. Export may render several *frames* per second
(`videoFps`, default 1); frame *f* of such a render is the time
`start + f / videoFps` in this array — the array itself is never densified, see
§ 4.5.

| Field | Type | Unit | Notes |
|---|---|---|---|
| `timestamp` | number | s | absolute Unix seconds (UTC) |
| `sec` | number | s | seconds since the first point, starts at 0 |
| `position_lat` | number | ° | WGS84 latitude; repaired **together with** `position_long` as one pair, see “repair before interpolation” below |
| `position_long` | number | ° | WGS84 longitude (note: `long`, not `lng`) |
| `altitude` | number \| null | m | above sea level; `0` is *not* a measurement, see “repair before interpolation” below |
| `is_pause` | boolean | — | stop detected during parsing |
| `speed` | number | km/h | see “speed sources” below |
| `distance` | number | m | cumulative, from the file's own distance track |
| `heart_rate` | number \| null | bpm | `null` without a strap |
| `cadence` | number \| null | steps/min | see “cadence normalisation” |
| `power` | number \| null | W | cycling/power-meter only, optional |
| `step_length` | number | m | derived: `speed / (cadence·60/1000)` |

**Repair before interpolation.** Two fields encode “no reading” as a number:
`normalValue()` turns a missing altitude into `0`, and an unresolved position lands
as `(0, 0)`. A watch that has not locked on yet writes both for the first seconds of
a track. The interpolator cannot tell either apart from a measurement — it happily
blends a `0` altitude (drawing a climb out of sea level) and a `0` coordinate
(flinging the map line to the Gulf of Guinea, and wrecking the projection bounds for
every other vertex). So `repairSparseSeries(rq)` (`data/seriesRepair.js`) runs over
the parsed array first, on two field groups:

- `altitude` — **nearest**: a leading run takes the first real value, a trailing run
  the last, an interior gap takes whichever neighbour is closer (ties go backwards).
  Only genuine samples are used as the source, so a gap becomes two flat steps
  instead of a ramp, and negative altitudes (tunnels, below sea level) count as real
  data.
- `position_lat` + `position_long` — **bridge**: leading and trailing runs freeze at
  the mouth of the gap (the frame timeline keeps its length), while an interior gap
  is linearly interpolated between the two real positions that bracket it — the same
  thing `interpolatePoints` does for two real GPS samples, so a long dropout reads as
  a straight line instead of hold-then-teleport. Coordinates are repaired **as a
  pair**: if either component looks missing the whole point is bad and both come from
  one source, so a latitude from point A is never stitched to a longitude from point B.

A series with no real value at all invents nothing — it stays as parsed and a
`[repair] …` warning is logged (indoor/treadmill tracks hit this every load, which is
expected). Heart rate, cadence, power and speed are deliberately *not* in the list:
there `0` legitimately means “no strap”, “stopped”, “no meter”. One accepted trade-off:
an exact `0` latitude or longitude (equator / prime meridian, after rounding to 6
decimals) reads as missing. Downstream everything gets better — `baseAltitude`,
`eleMin`/`eleMax`, `slope` and `Gain`/`Loss` stop being dragged by warm-up zeros, and
`computeMapPoints`/`computeAzimuth` stop seeing phantom (0, 0) vertices.
`window.__repairReport` reports the repaired point count per group, and
`window.__rawData` still shows the untouched parsed values. The rules above are
pinned by [`tools/series-repair-test.html`](../tools/series-repair-test.html); run
it from a static server after touching the module or the pipeline order.

Derived in `fieldComputer.js`, added on top of the parsed values:

| Field | Type | Unit | Computed by |
|---|---|---|---|
| `slope` | number | % | `computeSlope` — Δaltitude / Δdistance × 100, zero when a step is degenerate |
| `Gain` | number | m | `computeGainLoss` — cumulative ascent, with a small-delta threshold so GPS/altimeter noise does not inflate it |
| `Loss` | number | m | `computeGainLoss` — cumulative descent (same threshold) |
| `azimuth` | number | ° | `computeAzimuth` — bearing to the next point, `0–359`, carried forward when two points coincide |

Also added per frame by `computeDerivedFields()` — these exist so that every key
Studio lets you bind is present in `rq` itself, not only inside the binding engine:

| Field | Type | Unit | Definition |
|---|---|---|---|
| `elapsedMin` | number | min | `sec / 60` |
| `avgSpeed` | number | km/h | `distance · 3.6 / sec` since the start (not a rolling average) |
| `avgPace` | string \| number | mm:ss/km | `speedToPace(avgSpeed)`; the literal number `0` when `avgSpeed` is 0, matching the engine |
| `remainDistance` | number | m | `totalDistance − distance`, clamped at 0 |
| `remainKm` | number | km | `remainDistance / 1000` |
| `relAltitude` | number | m | `altitude − baseAltitude` (base = first point) |
| `hrPct` | number | 0..1 | `heart_rate / user_heartRateMax` (the rounded-up cap), 0 without a cap |
| `elapsedTime` | string | — | `sec` as `m:ss`, or `h:mm:ss` past an hour |
| `remainTime` | string | — | `remainDistance` extrapolated at the current average speed; `0:00` before any distance |

Whole-activity quantities land on `chartData` (so on `rq._chartData`) rather than
being repeated on every frame: `totalDistance`, `totalKm`, `duration`, `totalTime`,
`paceBoundMin` and `paceBoundMax`. The last two are **pace** bounds in min/km —
`paceMin`/`paceMax` stay speed extremes in km/h, and pace is their reciprocal, so
`paceBoundMin` is the *slowest* pace (60 / slowest speed, the larger number) and
`paceBoundMax` the *fastest*. A pace gauge binds them in that order on purpose:
`normalize()` accepts `min > max` and returns the intuitive "faster = fuller"
ramp, but it returns 0 when `min === max`, so the two bounds must never collapse
onto each other. They used to: `computeChartPoints` counts zero-speed samples, so
any activity with a start, stop or pause has `paceMin === 0` and takes the
per-frame fallback scan — and that scan was reading the *maximum* speed for
`paceBoundMin`, i.e. the same number as `paceBoundMax`. The fallback now skips
zero speeds and scans the minimum, in both engines and in
`computeDerivedFields`; `tools/field-parity.html` asserts the direction on three
fixture shapes.

Values materialised here are rounded for readability (2 decimals, 4 for `hrPct`);
bindings do **not** read them — `bindingEngine.fieldValue()` recomputes the same
expressions unrounded, so the rendered result is identical either way. Those
expressions are shared with `studio/js/runtime/bindingEngine.js` and must stay
byte-for-byte equivalent: after touching either engine, run
[`tools/field-parity.html`](../tools/field-parity.html) on a static server.

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

## 4.5 Sub-second sampling (`data/frameSampling.js`)

Rendering at `videoFps = N` lays N frames inside each real second. Nothing about
the array changes: the sampler is called with a decimal *time* and blends the two
bracketing entries on the fly. Rules, in one place:

- **Decimation regression (the invariant everything else leans on).** At an
  integer time the sampler returns `trkpt[i]` itself — the same object, not an
  equal-looking copy. So every dense sequence replays its anchor frames exactly,
  and `fps = 1` is byte-identical to the pre-adjustable-rate behaviour. Component
  output is verified this way: revisit an integer second after visiting the
  sub-frames around it and the whole Leafer tree snapshots identical.
- Only keys present on **both** neighbours get interpolated; `is_pause` and
  `timestamp` are never blended (step-like / absolute), `azimuth` takes the
  shortest arc so 359°→1° passes through 0° rather than the whole dial.
- Derived fields are not blended but **recomputed** from the interpolated point
  with the same formulas as `fieldComputer.js` (`avgSpeed`, `avgPace`,
  `elapsedTime`, `remainTime`, `remainDistance`, `remainKm`, `elapsedMin`), and
  every value goes through the same `formatValue()`/rounding, so text fields never
  grow a decimal (`06:00`, never `0:10.25`).
- Chart cursors and the map playhead use `sampleSeriesAt` / `sliceSeriesTo` /
  `samplePathPoint` — the same regression: at integer times they return
  `pts[i*2], pts[i*2+1]` and `path[i]`, i.e. what the old inline indexing produced.
- **Length is unchanged by construction**: `frames = seconds × N`, each frame is
  `1/N` s, and the last `N-1` frames clamp onto `endFrame` (the picture holds on
  the final second, exactly as the final 1-second frame used to). A 60-second
  selection stays a 60-second file at any `N` — measured with MediaBunny's own
  demuxer: `duration` 2 s and `frameRateIsConstant: true`, `averageFrameRate` 1
  with 2 samples vs 4 with 8 samples.

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

The baked extent stays **400×200 no matter how the chart is displayed**: the polyline
charts map it into whatever plot rect they currently have
(`plotInsets(W, H, padX, padY, 400, 200)` in `chartCommon.js`), so the `ratio` setting
(design width = `200 × ratio`, 1…8) only changes the target box — never these numbers.
Same array, same frame index, at every ratio.

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
