# 01 · Component Spec JSON 结构

一个 Studio 组件的完整 JSON 就叫 **Component Spec**。顶层固定三个键（`jsonc` 表示结构示意，含省略号，不能直接导入）：

```jsonc
{
  "version": 1,
  "meta": { ... },
  "layers": [ ... ]
}
```

## 顶层字段

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `version` | number | 建议 | 固定 `1`（整数，不是字符串 `"1"`）。当前代码不校验它，但请写 `1`。 |
| `meta` | object | ✅ | 组件元信息，见下 |
| `layers` | array | ✅ | 图层数组，顺序即层叠顺序 |

> **唯一的硬性校验**（`SpecStore.importString`）：解析后必须满足
> `spec.meta` 为真值 **且** `Array.isArray(spec.layers)`。
> 否则抛出 `Invalid component JSON`，导入失败。其余字段都有容错/默认值。

---

## `meta` 对象

```jsonc
"meta": {
  "id": "custom_m2k1x7a",
  "name": "Heart Arc",
  "category": "distance",
  "icon": "",
  "width": 400,
  "height": 200
}
```

| 键 | 类型 | 默认 | 规则 |
|---|---|---|---|
| `id` | string | `custom_{时间戳base36}` | **注册 id**，全局唯一。只允许 `[A-Za-z0-9_]`，Studio 会自动过滤掉其它字符（`id.replace(/[^a-zA-Z0-9_]/g,'')`）。建议自己起一个语义化、不易碰撞的名字，如 `custom_hrarc_v1`。 |
| `name` | string | `Untitled component` | 展示名，可中文。 |
| `category` | string | `distance` | 分类，用于调色板/库筛选。合法取值：`time` `distance` `attr` `chart` `text` `cycling` `theme`。 |
| `icon` | string | `""` | 图标，一般留空。 |
| `width` | number | `400` | **设计盒宽**。所有图层坐标以此为基准。 |
| `height` | number | `200` | **设计盒高**。 |

> `id` 一旦被保存到浏览器本地，实际存储键是 `studio_comp_{id}`（见 [04_workflow.md](04_workflow.md)）。

---

## `layers` 数组

每个元素是一个 **Layer**：

```jsonc
{
  "uid": "Lm2k1x0a1",
  "name": "track",
  "type": "arc",
  "visible": true,
  "props": { ... },
  "bindings": { ... },
  "children": [ ... ]
}
```

| 键 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `uid` | string | ✅ | 图层唯一 id。它会成为 Leafer 元素的 `id`，绑定引擎靠它在重建后找回元素。**同一 spec 内不能重复**。 |
| `name` | string | 建议 | 图层显示名（左侧图层树用），留空会回退成 `type`。 |
| `type` | string | ✅ | 见下方类型表。 |
| `visible` | boolean | 建议 | 缺省视为 `true`；`false` 才隐藏。 |
| `props` | object | ✅ | 直接映射到 Leafer 元素属性，见各类型默认值。 |
| `bindings` | object | 可选 | `{ <属性名>: Binding }`，见 [02_bindings.md](02_bindings.md)。可省略或给 `{}`。 |
| `children` | array | 仅 group | 只有 `type:"group"` 才有；子图层结构与 Layer 相同，递归。 |

### 关于 `uid`

- Studio 生成的格式：`L` + 时间戳(base36) + 递增种子(base36) + 随机(base36)，例如 `Lm2k1x0a1`。
- 你**手写**时不必模仿这个算法，只要保证：**唯一、非空、只含安全字符**（建议 `L` 前缀 + 短字母数字，如 `Lbg01`、`Lval02`）。
- 复制粘贴/导入到已有组件时若 `uid` 冲突，Studio 会重新分配；但独立导入时请自保证唯一。

---

## 图层类型（`type`）与 Leafer 映射

| `type` | Leafer tag | 说明 |
|---|---|---|
| `rect` | `Rect` | 矩形/圆角矩形/面板底色/柱条 |
| `ellipse` | `Ellipse` | 完整椭圆/圆 |
| `arc` | `Ellipse` | **环形/仪表弧**：用带角度的 Ellipse 描边（`innerRadius`+`startAngle`+`endAngle`） |
| `line` | `Line` | 线段：`(x,y)` 是**起点**，`width` 是**长度**（水平），`rotation` 控制方向 |
| `text` | `Text` | 文本 |
| `svg` | `Image` | **图标**：图标代码直接存在 `props.svg` 里，渲染时自动转成 `data:image/svg+xml` 交给 Image。**代码上限 10 KB** |
| `image` | `Image` | （旧版）外链/内联图片，`url` 受与缩略图同样的安全过滤（`http(s)://` 或 `data:image/png|jpeg|jpg|webp;base64,`）。面板已撤下图片入口，只保留给旧 spec 渲染 |
| `group` | `Box` | 分组，可含 `children`，随父级移动/缩放 |
| `path` | `Path` | ⚠️ 仅供"前端仪表盘导入"透传，调色板不手动插入；手写 JSON 可用但需自备 `points` 等 Leafer 属性 |
| `polygon` | `Polygon` | 同上，透传 |

> 面板能手动插入的只有前 7 种（`rect/ellipse/arc/line/text/svg/group`）。`image` 为旧版兼容，`path/polygon` 是导入既有前端 dashboard 时的兼容类型。

---

## 各类型 `props` 默认值（新图层的基准，也是绑定满量程来源）

以下即 Studio 新建该类型图层时写入的初始属性，可作为你书写 `props` 的**权威模板**（缺省属性会被 Leafer 用默认值补齐，但建议显式写全，便于绑定时确定满量程）。

### `rect`
```jsonc
{ "x": 40, "y": 40, "width": 240, "height": 60, "fill": "#32cd79", "cornerRadius": 0, "rotation": 0, "opacity": 1 }
```
- `fill` 可给颜色字符串，或渐变对象（Leafer 渐变语法）；`stroke`/`strokeWidth` 可选。
- `cornerRadius`：圆角半径（数值）。

### `ellipse`
```jsonc
{ "x": 40, "y": 40, "width": 160, "height": 160, "fill": "#32cd79", "rotation": 0, "opacity": 1 }
```
- `width===height` 即为正圆。

### `arc`（仪表环）
```jsonc
{
  "x": 40, "y": 40, "width": 200, "height": 200,
  "fill": null, "innerRadius": 1, "startAngle": -210, "endAngle": 30, "closed": false,
  "stroke": "#32cd79", "strokeWidth": 24, "strokeCap": "round", "strokeAlign": "center",
  "rotation": 0, "opacity": 1
}
```
- `innerRadius`：内圈半径比例（`0..1`，`1` = 满环）。
- `startAngle` / `endAngle`：弧的起止角（度），默认 `-210 → 30`（240° 开口朝下的仪表）。
- **`closed: false` 必须**：带 `innerRadius` 的角度 Ellipse 默认按闭合扇环渲染，封闭路径没有线端帽，`strokeCap:'round'` 会失效。`normalizeArcProps()` 会在缺少 `closed` 且有 `startAngle/endAngle` 时自动补 `false`——但**建议显式写**，避免歧义。
- 渐变/单色靠 `stroke` + `strokeWidth`；进度弧通过绑定 `endAngle`（`angle` 模式）实现。

### `line`
```jsonc
{ "x": 40, "y": 40, "width": 240, "stroke": "#ffffff", "strokeWidth": 6, "rotation": 0, "opacity": 1 }
```
- `(x,y)` 起点，`width` 长度（默认水平向右），`rotation` 旋转整条线（度）。
- 没有 `height`；粗细用 `strokeWidth`。

### `text`
```jsonc
{
  "x": 40, "y": 40, "text": "Text", "fontSize": 40, "fontWeight": "black", "fill": "#ffffff",
  "textAlign": "left", "verticalAlign": "top", "resizeFontSize": false, "rotation": 0, "opacity": 1
}
```
- `fontWeight`：`'black' | 'bold' | 'normal' | 'lighter' | ...`（Leafer 支持字符串字重）。
- `textAlign`：`left | center | right`；`verticalAlign`：`top | middle | bottom`。
- `resizeFontSize`：`true` 时字号随容器缩放（默认 `false`，字号按设计像素）。
- 动态内容通过 `text` 绑定（`text` 模式）覆盖 `props.text`。

### `svg`（图标）
```jsonc
{ "x": 40, "y": 40, "width": 64, "height": 64, "svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 1024 1024\"><path d=\"...\" fill=\"#43464F\"/></svg>", "fill": "", "rotation": 0, "opacity": 1 }
```
- `svg`：图标代码本体（不是 URL！）。Studio 里点 **Basic Elements → SVG Icon** 会先落一个**占位三角形**图层（保证插上去就能看见），选中它后在右侧 **Properties → SVG code** 文本框里换成真代码（去 [iconfont.cn · collections](https://www.iconfont.cn/collections) 找图标，“复制 SVG 代码”）。失焦即校验并写入。
- **硬限制 10 KB**（UTF-8 字节数，按**规范化后**的结果算，所以带一堆 `p-id`/`class` 噪声的 iconfont 原文一般都能缩下去）：超出不会落库，提交/导入时 `validateSpec` 也会报错；含 `<script>`、`<foreignObject>`、`on…=` 事件处理器或 `javascript:` 的代码会被直接拒绝。
- Studio 会对代码做规范化：去掉 `p-id`/`t`/`class` 等平台噪声、补 `xmlns`、按 `viewBox` 写回固有尺寸（缺 `viewBox` 时退到 `width`/`height` 属性，再退到 1024×1024）。只贴 `<path/>` 之类的内部片段也行，会自动包一层 `<svg>`。
- `fill`：可选的**重着色**颜色（空 = 保持图标原色）。非空时渲染前会把图标内部所有 `fill="…"` / `fill:…` 换成这个色（`none` 与渐变 `url(#…)` 不动）。图标在图层里就是一个 Image 盒，`width`/`height` 控制显示尺寸（换代码时 Studio 会按新 `viewBox` 比例自动修正长宽，保持长边不变，不会拉扁），不会破坏矢量质量。
- 可绑定属性与 `image` 相同（`x` `y` `opacity` `visible`）；代码本身不参与数据绑定。

### `image`（旧版图片，面板已不再提供入口）
```jsonc
{ "x": 40, "y": 40, "width": 160, "height": 160, "url": "", "rotation": 0, "opacity": 1 }
```
- `url` 只接受安全的 `https://...` 或 `data:image/...;base64,...`；其它（如 `javascript:`）会被过滤掉。新组件请用 `svg` 图层贴代码，不必再拼图片 URL。

### `group`
```jsonc
{ "x": 0, "y": 0, "rotation": 0, "opacity": 1 }
```
- 子图层的坐标相对 group。group 本身不可选中/拖动（编辑器行为），但数据上正常渲染。

---

## 坐标与缩放（务必理解）

- 图层坐标写在 `meta.width × meta.height` 的**设计坐标系**里。
- 组件被放到运行时容器（如模板里给定的 `width/height`）时，`visualFactory` 计算 `scale = 容器尺寸 / 设计尺寸`，等比缩放整组元素。
- 对 `size` 绑定（进度条等）：引擎以**设计基准值**（`props.width` 等）为满量程，再按当前 `scale` 换算，保证容器被拉伸后进度条比例依然正确。
- 结论：**你只按设计尺寸排版，不要试图预先把坐标缩放到最终显示尺寸。**

---

## 一个不含绑定的纯静态组件示例

```json
{
  "version": 1,
  "meta": { "id": "custom_static_card", "name": "Static Card", "category": "text", "icon": "", "width": 400, "height": 200 },
  "layers": [
    { "uid": "Lbg", "name": "bg", "type": "rect", "visible": true,
      "props": { "x": 0, "y": 0, "width": 400, "height": 200, "fill": "#2d2d3a", "cornerRadius": 16, "rotation": 0, "opacity": 1 },
      "bindings": {} },
    { "uid": "Lring", "name": "ring", "type": "arc", "visible": true,
      "props": { "x": 100, "y": 0, "width": 200, "height": 200, "fill": null, "innerRadius": 1, "startAngle": -210, "endAngle": 30, "closed": false, "stroke": "#333344", "strokeWidth": 24, "strokeCap": "round", "strokeAlign": "center", "rotation": 0, "opacity": 1 },
      "bindings": {} },
    { "uid": "Ltitle", "name": "title", "type": "text", "visible": true,
      "props": { "x": 175, "y": 85, "text": "100", "fontSize": 48, "fontWeight": "black", "fill": "#ffffff", "textAlign": "left", "verticalAlign": "top", "rotation": 0, "opacity": 1 },
      "bindings": {} }
  ]
}
```

下一步：给这些属性挂上数据 → 见 [02_bindings.md](02_bindings.md)。
