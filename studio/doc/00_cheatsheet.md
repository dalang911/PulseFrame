# 00 · 速查内核

> 这一节是"只读 30 行也能写对"的压缩版。细节展开在 §01–§05，逐条自检在 CHECKLIST。

**唯一的硬性校验**：能被 `JSON.parse`（无注释、无尾逗号）＋ 有 `meta` 对象 ＋ `layers` 是数组。
注册落地还要求 `meta.id` 非空、只含 `[A-Za-z0-9_]`，建议 `custom_` 前缀以避开内置组件 id。
id 撞上内置组件/本地已存/本会话已注册的组件时，Studio 会自动加后缀改名（`my_comp` → `my_comp_2`）；
公共库里的重号由服务端拒绝（`spec.meta.id` 镜像到 `spec_id`，重复提交返 409 `duplicate_spec_id`）。

**最小骨架**（`jsonc`，`...` 处按需补全）：

```jsonc
{ "version": 1,
  "meta": { "id": "custom_xxx_v1", "name": "展示名", "category": "distance", "icon": "", "width": 400, "height": 200 },
  "layers": [ { "uid": "Lbg01", "name": "bg", "type": "rect", "visible": true,
                "props": { "x": 0, "y": 0, "width": 400, "height": 200, "fill": "#23232e", "cornerRadius": 12, "rotation": 0, "opacity": 1 },
                "bindings": { "width": { "mode": "size", "field": "pct", "min": 0, "max": 1 } } } ] }
```

**10 种 `type`**：`rect` `ellipse` `arc` `line` `text` `svg` `group`（面板可手动插入的就这 7 种）＋ `image`（旧版图片图层，面板已撤下）＋ `path` `polygon`（仅仪表盘导入透传）。
**6 种 `mode`**：`text` `size` `angle` `color` `opacity` `visible`。

**可绑定属性（BINDABLE，键=属性名）**

| type | 属性 → mode |
|---|---|
| `rect` | `x` `y` `width` `height` `strokeWidth` `cornerRadius`→`size`；`fill` `stroke`→`color`；`rotation`→`angle`；`opacity` `visible` |
| `ellipse` | `x` `y` `width` `height` `strokeWidth`→`size`；`fill` `stroke`→`color`；`rotation`→`angle`；`opacity` `visible` |
| `arc` | `endAngle` `startAngle`→`angle`；`stroke`→`color`；`strokeWidth` `innerRadius`→`size`；`opacity` |
| `line` | `x` `y` `width` `strokeWidth`→`size`；`stroke`→`color`；`rotation`→`angle`；`opacity` `visible` |
| `text` | `text`→`text`；`fill`→`color`；`x` `y` `fontSize`→`size`；`opacity` `visible` |
| `svg` | `x` `y`→`size`；`opacity` `visible` |
| `image` | `x` `y`→`size`；`opacity` `visible` |
| `group` | `opacity`→`opacity` |

**常用 `field`**：`distance` `speed` `heart_rate` `cadence` `power` `altitude` `slope` `azimuth` ｜ 派生 `km` `pace` `pct` `hrPct` `sec` `elapsedMin` `remainKm` `relAltitude` ｜ 文本 `elapsedTime` `totalTime` `remainTime`
**常当 `min`/`max` 引用的边界**：`totalKm` `totalDistance` `duration` `heartRateMin` `heartRateMax` `user_heartRateMax` `cadenceMin` `cadenceMax` `powerMin` `powerMax` `eleMin` `eleMax` `baseAltitude` `paceMin` `paceMax` `paceBoundMin` `paceBoundMax`

**五种典型写法**：数字随数据变 → `text` 模式绑 `text`（`field`+`decimal`+`suffix` 或 `unit:true`）· 进度条 → `rect` 的 `props.width` 写满宽、`size` 绑 `width` · 环形仪表 → `arc` 的 `endAngle` 用 `angle`（`from`/`to`）· 指针 → `rotation` 用 `angle` 绑 `azimuth`+`from:0,to:360` · 区间变色 → `fill`/`stroke` 用 `color`（`base`+`thresholds:[{gte,color}]`）

**最容易踩的 7 个坑**

1. `arc` 必须显式 `"closed": false`，否则渲染成闭合扇环、`strokeCap:"round"` 失效。
2. `rotation` 用 `angle` 模式必须写 `from`/`to`，否则退回错误的默认 `-210`/`30`。
3. **配速边界别用 `paceMin`/`paceMax`**（那是速度极值 km/h），`pace` 字段要配 `paceBoundMin`/`paceBoundMax`。
4. `size`/`angle`/`opacity`/`visible` 不要绑字符串型时间字段（`elapsedTime` 等只配 `text` 模式）。
5. 坐标一律写在 `meta.width × meta.height` 设计盒内，**不要**预先按显示尺寸缩放；`size` 绑定图层的被绑属性值要写成**满量程**。
6. 只有 `group` 能写 `children`；`uid` 在全 spec 内（含嵌套）唯一非空。图标用 `svg`：代码直接写在 `props.svg`（≤ 10 KB，超限或含 `<script>`/`<foreignObject>`/`on…=` 即为非法），`props.fill` 为空则保持原色；旧 `image.url` 只接受 `https://...` 或 `data:image/...;base64,...`。
7. `meta.id` 不要手改成已存在的：它同时是 localStorage 键、registry 注册键和库里 `spec_id` 唯一凭据。撞上内置/本地/已注册 id 时 Studio 会自动加后缀改名（`my_comp`→`my_comp_2`）；别人提交的重号本机看不见，由服务端 `409 duplicate_spec_id` 拦下。

**落地**：Import 到 `https://pulseframe.data4u.vip/studio/index.html`（或顶栏 **Open JSON** 粘贴 → `Validate & Import`，它比硬性规则更严）；Save Local 写 `localStorage` 键 `studio_comp_{id}`；Submit 走审核后入公共库 `api.php?action=list&kind=component`。
