# 02 · 数据绑定（bindings）

绑定把一个数据字段（`field`）按某种方式（`mode`）映射到图层的某个属性上。
写法：在图层里挂 `bindings`，**键 = 要驱动的属性名**，值 = 绑定对象（下为片段示意，非完整 spec）：

```jsonc
"bindings": {
  "text":    { "mode": "text",  "field": "km", "decimal": 2, "suffix": " km" },
  "width":   { "mode": "size",  "field": "pct", "min": 0, "max": 1 },
  "endAngle":{ "mode": "angle", "field": "heart_rate", "min": 60, "max": "heartRateMax", "from": -210, "to": 30 }
}
```

- **键（如 `text` / `width` / `endAngle`）就是目标属性**，引擎内部会把它当作 `prop` 使用，所以绑定对象里**不需要**再写 `prop`（写了也允许，但对常规用法是多余的）。
- 一个图层可以有多个绑定（同时驱动多个属性）。
- 绑定在**逐帧预览**和**真实运行时**每帧重新计算，覆盖 `props` 里的设计基准值。

---

## 6 个 mode 一览

| `mode` | 典型目标属性 | 作用 | 关键参数 |
|---|---|---|---|
| `text` | `text` | 把值格式化成字符串写进文本 | `field`, `decimal`, `unit`, `unitKey`, `prefix`, `suffix` |
| `size` | `width`/`height`/`x`/`y`/`strokeWidth`/`cornerRadius` | 按 0..1 比例 × 设计基准值 → 进度条/游标/柱状 | `field`, `min`, `max` |
| `angle` | `endAngle`/`startAngle`/`rotation` | 值线性映射到 `[from, to]` 角 → 仪表弧/指针 | `field`, `min`, `max`, `from`, `to` |
| `color` | `fill`/`stroke` | 按阈值分档取色 → 心率区间色 | `field`, `base`, `thresholds:[{gte,color}]` |
| `opacity` | `opacity` | 值归一到 0..1 作透明度 | `field`, `min`, `max` |
| `visible` | `visible` | 值 ≥ 阈值时显示图层 | `field`, `threshold` |

> 引擎的 `size` / `angle` 通过 `prop` 定位目标属性，理论上可驱动**任意数值属性**；但请遵循下方"可绑定属性表"，否则在 Studio 面板里无法被编辑/显示。

---

## 各 mode 详细规则

### `text`
```
raw = fieldValue(field)
若 decimal != null 且 raw 是数字 → str = raw.toFixed(decimal)   否则 str = String(raw)
若 unit === true  → str = unitConfig.format(unitKey || field, str)   （自动加空格的前后缀）
否则若 suffix     → str = str + suffix
若 prefix         → str = prefix + str
→ el.text = str
```
- 只有 `text` 模式会用 `decimal`/`unit`/`prefix`/`suffix`。
- `unit:true` 与 `suffix` **二选一**：`unit` 优先，走单位系统（见 [03_fields.md](03_fields.md)）。
- 想让单位带空格用 `unit`；想完全自定义用 `suffix`/`prefix`（`suffix` 不会自动补空格，需要空格就自己写 `" km"`）。
- 时间类字段（`elapsedTime`/`totalTime`/`remainTime`）返回的是字符串，别拿去 `toFixed`。

### `size`
```
base = layer.props[prop]            // 设计基准（满量程）
若容器被缩放 → base 按轴换算（height/y 用 scaleY，其余用 scaleX）
v   = fieldValue(field)
min = binding.min ?? 0
max = binding.max
若 max 未给 → el[prop] = base * clamp(v, 0, 1)        // 直接把 v 当 0..1 比例
若 max 已给 → ratio = normalize(v, min, max); el[prop] = base * ratio
若 from/to 已给（x/y 游标）→ t = 上面的比例；el[prop] = from + t * (to - from)
```
- **满量程 = 你在 `props` 里写的该属性值**。进度条做法：把 `props.width` 设计成"满条"的宽度，绑 `width` + `size` + `field` + `min`/`max`。
- `min`/`max` 可以是数字，也可以是**字段名**（字符串），见 [03_fields.md](03_fields.md)。
- 若字段本身就是 0..1（如 `pct`、`hrPct`），可以不写 `max`，引擎会 `clamp(v,0,1)` 直接用。
- 把 `x`/`y` 当 `size` 目标 = **位置扫描游标**：缺省 `props.x` 写成"终点"坐标，比例 × 满值实现横扫/纵扫（起点固定 0）。
- 游标要**设起点**就加 `from`/`to`（行程起/止坐标，数字）：引擎改为 `from + 比例 × (to − from)` 线性映射；在面板里绑 x/y 时会出现 From (start) / To (end) 两个输入框。例：进度条跟随圆点，条满宽 400、圆点宽 30，则 `from: 0, to: 370` 让圆点全程留在条内。

### `angle`
```
prop = 绑定键（endAngle / startAngle / rotation）
from = binding.from ?? layer.props.startAngle ?? -210
to   = binding.to   ?? layer.props.endAngle   ?? 30
v    = fieldValue(field)
ratio= normalize(v, min=binding.min ?? 0, max=binding.max)
→ el[prop] = from + ratio * (to - from)
```
- 仪表进度弧：绑 `endAngle`，`from/to` 用弧的起止角（默认 -210→30）。
- 指针旋转：绑 `rotation`，**必须显式写 `from`/`to`**（如 `0`→`360`），否则会退回 -210/30 的错误默认。指针图形请做成"从旋转轴心伸出"的形态。

### `color`
```
v = fieldValue(field)
把 thresholds 按 gte 从大到小排序
picked = binding.base ?? layer.props[prop]
逐个 t：若 v >= t.gte → picked = t.color; break      // 命中最高档
→ el[prop] = picked
```
- `thresholds` 形如 `[ { "gte": 160, "color": "#ff4d4d" }, { "gte": 140, "color": "#ffae00" }, ... ]`。
- 取**第一个满足 v≥gte 的档**（已降序），所以高阈值放前面更直观（顺序其实由引擎重排）。
- `base` 是所有档都不满足时的兜底色（一般也写进 `props` 同属性）。

### `opacity`
```
v = fieldValue(field)
el.opacity = normalize(v, min = binding.min ?? 0, max = binding.max ?? 1)
```

### `visible`
```
v = fieldValue(field)
el.visible = v >= (binding.threshold ?? 0)
```
- 逐格点亮/到点显现：给每个格子一个 `visible` 绑定，`threshold` 设成各自触发值（配合 `pct` 或里程字段）。

---

## 可绑定属性表（BINDABLE）

下表来自 `BindingPanel.js`，规定**每个 type 的哪个属性能用哪个 mode**。生成的 JSON 请严格遵守，以保证导入后在面板里可见、可编辑、且渲染正确。

| type | 可绑定属性 → 允许的 mode |
|---|---|
| `rect` | `x`,`y`,`width`,`height`,`strokeWidth`,`cornerRadius` → `size`；`fill`,`stroke` → `color`；`rotation` → `angle`；`opacity` → `opacity`；`visible` → `visible` |
| `ellipse` | `x`,`y`,`width`,`height`,`strokeWidth` → `size`；`fill`,`stroke` → `color`；`rotation` → `angle`；`opacity`,`visible` |
| `arc` | `endAngle`,`startAngle` → `angle`；`stroke` → `color`；`strokeWidth`,`innerRadius` → `size`；`opacity` → `opacity` |
| `line` | `x`,`y`,`width`,`strokeWidth` → `size`；`stroke` → `color`；`rotation` → `angle`；`opacity`,`visible` |
| `text` | `text` → `text`；`fill` → `color`；`x`,`y`,`fontSize` → `size`；`opacity`,`visible` |
| `svg` | `x`,`y` → `size`；`opacity`,`visible` |
| `image` | `x`,`y` → `size`；`opacity`,`visible` |
| `group` | `opacity` → `opacity` |

> 所有绑定都可用 `"none"` 解除（面板语义）；在 JSON 里"解除"= 直接从 `bindings` 里删掉那个键，或整个 `bindings:{}`。

---

## 切字段时的默认边界（FIELD_DEFAULT_BOUNDS）

Studio 里切换 `field` 会自动把 `min`/`max` 重设成下表的默认边界（用户手改过的不覆盖）。
**手写 JSON 时，直接照抄这张表的 `min`/`max` 就能得到"符合标准"的归一化区间**：

| `field` | 默认 `min` | 默认 `max` |
|---|---|---|
| `heart_rate` | `"heartRateMin"` | `"user_heartRateMax"` |
| `cadence` | `"cadenceMin"` | `"cadenceMax"` |
| `power` | `"powerMin"` | `"powerMax"` |
| `speed` | `"paceMin"` | `"paceMax"` |
| `pace` | `"paceBoundMin"` | `"paceBoundMax"` |
| `altitude` | `"eleMin"` | `"eleMax"` |
| `relAltitude` | `"baseAltitude"` | `"eleMax"` |
| `slope` | `-15` | `15` |
| `step_length` | `0.3` | `1.2` |
| `azimuth` | `0` | `360` |
| `distance` | `0` | `"totalDistance"` |
| `km` | `0` | `"totalKm"` |
| `remainDistance` | `0` | `"totalDistance"` |
| `remainKm` | `0` | `"totalKm"` |
| `pct` | `0` | `1` |
| `hrPct` | `0` | `1` |
| `sec` | `0` | `"duration"` |

> ⚠️ 配速陷阱：`paceMin`/`paceMax` 存的是**速度极值 (km/h)**，不是配速。要给 `pace` 字段（min/km）当边界，请用派生字段 `paceBoundMin`/`paceBoundMax`（引擎内部 = 60/速度），二者的快慢方向也已按配速语义对齐。字段取值详见 [03_fields.md](03_fields.md)。

---

字段清单、派生量、单位/前后缀规则见 → [03_fields.md](03_fields.md)。
