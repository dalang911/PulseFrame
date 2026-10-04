# 中文文档存档（Chinese documentation archive）

These are the original Chinese notes written while the project was developed. They
are kept for reference — the code comments in this repository are partly Chinese,
so reading them side by side is still useful.

**The English documents in the parent folder are the reference.** Where the two
disagree, the English version (and the code) wins; these files describe the design
as it was understood earlier and a few details have since changed:

| Archived file | Superseded by | What changed |
|---|---|---|
| `ARCHITECTURE.md` | [`../ARCHITECTURE.md`](../ARCHITECTURE.md) | data pipeline lives in `js/data/DataPipeline.js` (not `data/pipeline`); event names are `DATA_PARSED` / `DATA_INTERPOLATED` / `DATA_COMPUTED` / `DATA_READY`; Leafer instances moved from `Store` to `core/CanvasManager.js`; `js/map/MapBridge.js` replaced `MapManager` |
| `DATA_SCHEMA.md` | [`../DATA_SCHEMA.md`](../DATA_SCHEMA.md) | real field names are `sec`, `timestamp`, `position_lat`, `position_long`, `altitude`, `Gain`, `Loss` (there is no `time` / `elevation` / `latitude` field, and no stored `pace`); `lap_standard` entries are `{ id, total_timer_time }` |
| `COMPONENT_GUIDE.md` | [`../COMPONENT_GUIDE.md`](../COMPONENT_GUIDE.md) | `build()` returns Leafer **descriptor objects** (`{ tag: 'Text', … }`), not `new LeaferUI.Text(…)` instances; `update(box, frameData, progress, ctx)` takes the target box as the first argument and there is no `this.getChild()` |
| `COMPONENT_JSON_SPEC.md` | [`../COMPONENT_JSON_SPEC.md`](../COMPONENT_JSON_SPEC.md) | now split into the template format and the Studio component **spec** format; background layers are excluded from templates; `rotation`/`scale` are saved but not restored |

These archives cover the **frontend**. The store application's implementation,
configuration and hardening are deliberately undocumented in this repository;
any line in the archive that touches them describes what the *browser* sends and
receives, not how the endpoint is built.

If you translate or reconcile one of these, open a pull request against the English
file rather than editing the archive.
