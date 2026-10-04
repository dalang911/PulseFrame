# PulseFrame Studio — AI 生成手册（单文件版）

> **本文件自包含**：生成合法、可在 Studio 导入并正常运行的 Component Spec JSON
> 所需的全部规则都在这里，**无需读取任何其它文件或网页**。按 `§00 速查内核` → 需要细节再往下查各章。
>
> ⚠️ **产物文件，请勿手改**：由 `tools/build_docs_single.py` 合并 `studio/doc/` 下的
> 分篇源文件自动生成。改内容请改分篇，然后跑 `python3 tools/build_docs_single.py`。
> 分篇文件同时保留（按需检索/向量库切片用），两边靠脚本保持同源。

## 目录

- [§00 速查内核](#part-00)
- [§ 手册总览](#part-01)
- [§01 JSON 结构](#part-02)
- [§02 数据绑定](#part-03)
- [§03 字段与边界](#part-04)
- [§04 工作机制](#part-05)
- [§05 完整示例](#part-06)
- [§ 自检清单](#part-07)

---

<a id="part-00"></a>

## 00 · 速查内核

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

---
<a id="part-01"></a>

## PulseFrame Studio — AI 生成手册

> 面向 AI 的离线说明书：**无需打开网页**，即可直接生成合法、可在 Studio 导入并正常工作的组件 JSON。

本目录把 PulseFrame Studio（仪表盘组件设计器）的数据契约拆解成可机械执行的规则。
只要你按这里的结构书写 JSON，Studio 就能 `Import` 它、在画布上渲染、并逐帧应用数据绑定。

> **代码块约定**：` ```json ` 围栏里都是**完整、可直接 Import 的 Component Spec**（已通过解析与结构校验）；
> ` ```jsonc ` 围栏里是**结构片段/局部示意**（可能含 `...` 省略号或 `//` 注释），只用于说明字段形状，**不能单独导入**。

### 这是什么

PulseFrame Studio 是一个**声明式**组件设计器：一个组件 = 一组 Leafer 图形图层（`layers`）
+ 把运动数据映射到图层属性的**数据绑定**（`bindings`）。**没有 JavaScript**，因此共享组件可安全自动加载。

- 本地文件：`studio/index.html`（仓库根目录）
- 线上访问：`https://pulseframe.data4u.vip/index.html`（Studio：`https://pulseframe.data4u.vip/studio/index.html`）
- 服务端 API（导入库/提交）：`https://sportsfile.data4u.vip/pages/server/api.php`
- 渲染引擎：Leafer Editor 2.2.11

### 阅读顺序

| 文件 | 内容 | 什么时候看 |
|---|---|---|
| [§00 速查内核](#part-00) | 速查内核：硬校验、最小骨架、type/mode/BINDABLE、常用字段与边界、6 个高频坑 | 只想快速写对时先看它 |
| [§01 JSON 结构](#part-02) | Component Spec 顶层结构、`meta`、`layers`、各图层类型的默认属性 `props`、校验规则 | 开始书写前必读 |
| [§02 数据绑定](#part-03) | 6 种绑定 `mode`（text/size/angle/color/opacity/visible）的参数、每种类型可绑定的属性表 | 要给图层加数据驱动时 |
| [§03 字段与边界](#part-04) | 全部可绑定字段 `field` key、派生量、极值/边界、`min/max` 引用规则、单位与前后缀 | 选字段、设边界时 |
| [§04 工作机制](#part-05) | 工作机制：导入/导出、本地持久化、提交公共库、URL 访问与 API 端点、预览环境 | 想让用户生成的 JSON 落地时 |
| [§05 完整示例](#part-06) | 可直接复制的完整示例（进度条/环形仪表/大数值卡/心率区间色条/罗盘/里程碑/扫描游标） | 抄结构改参数最快 |
| [§ 自检清单](#part-07) | 生成前 / 生成后的逐项检查清单 | 每次产出 JSON 前后都跑一遍 |

> **另有一个单文件版 [ALL_IN_ONE.md](ALL_IN_ONE.md)**（约 1200 行 / 70 KB 量级，自包含、无跨文件跳转），
> 适合整份贴进对话窗口或塞进 system prompt。它是**产物，请勿手改**：
> 改上面任何一篇后运行 `python3 tools/build_docs_single.py` 重新生成（`--check` 可验证是否同步）。
> 分篇文件同时保留，供按文件名精确检索与向量库切片。
>
> 站点里顶栏的 **AI Handbook** 按钮就是这份单文件版的下载入口（`studio/js/HandbookDialog.js`，
> 弹窗正文是给使用者看的简版说明）。`studio/doc/` 是普通静态目录，**部署时必须一并带上**，
> 否则下载会 404（弹窗会探一次体量，拿不到就标红写明“manual not deployed”，不让人猜）。

### 30 秒上手：最小合法组件

```json
{
  "version": 1,
  "meta": {
    "id": "custom_mycomp01",
    "name": "My Distance",
    "category": "distance",
    "icon": "",
    "width": 400,
    "height": 200
  },
  "layers": [
    {
      "uid": "Lbg0001",
      "name": "bg",
      "type": "rect",
      "visible": true,
      "props": { "x": 0, "y": 0, "width": 400, "height": 200, "fill": "#23232e", "cornerRadius": 12, "rotation": 0, "opacity": 1 },
      "bindings": {}
    },
    {
      "uid": "Lval0002",
      "name": "km",
      "type": "text",
      "visible": true,
      "props": { "x": 40, "y": 70, "text": "0.0", "fontSize": 72, "fontWeight": "black", "fill": "#ffffff", "textAlign": "left", "verticalAlign": "top", "rotation": 0, "opacity": 1 },
      "bindings": {
        "text": { "mode": "text", "field": "km", "decimal": 2, "suffix": " km" }
      }
    }
  ]
}
```

把上面这段粘贴进 Studio 顶栏的 **Open JSON**（弹窗 → 粘贴 → `Validate & Import`，会先做结构校验、合格才导入），即可显示：背景板 + 一个每秒刷新、显示当前公里数的文本。
校验只有一条硬性规则（见 [§01 JSON 结构](#part-02)）：**必须有 `meta` 对象和 `layers` 数组**。

### 核心心智模型

1. **坐标写在设计尺寸里**：所有 `props.x/y/width/height` 都相对 `meta.width × meta.height` 这块设计画布。
   组件被放进任意大小的容器时，`visualFactory` 会按 `容器尺寸 / 设计尺寸` 等比缩放，你不用管像素换算。
2. **图层数组顺序 = 层叠顺序**：`layers[0]` 在最底，最后一个在最上。`group` 用 `children` 嵌套。
3. **绑定是"每帧重算"**：`props` 里写的是**设计基准值**（满量程/起始态）；绑定在预览和真实运行时按当前帧数据覆盖它。
4. **字段与边界解耦**：绑定用 `field` 取当前值，用 `min`/`max` 归一化；`min`/`max` 可以是数字，也可以是**另一个字段名**（如 `"max": "heartRateMax"`），让仪表按本次活动的真实极值缩放。

---
<a id="part-02"></a>

## 01 · Component Spec JSON 结构

一个 Studio 组件的完整 JSON 就叫 **Component Spec**。顶层固定三个键（`jsonc` 表示结构示意，含省略号，不能直接导入）：

```jsonc
{
  "version": 1,
  "meta": { ... },
  "layers": [ ... ]
}
```

### 顶层字段

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `version` | number | 建议 | 固定 `1`（整数，不是字符串 `"1"`）。当前代码不校验它，但请写 `1`。 |
| `meta` | object | ✅ | 组件元信息，见下 |
| `layers` | array | ✅ | 图层数组，顺序即层叠顺序 |

> **唯一的硬性校验**（`SpecStore.importString`）：解析后必须满足
> `spec.meta` 为真值 **且** `Array.isArray(spec.layers)`。
> 否则抛出 `Invalid component JSON`，导入失败。其余字段都有容错/默认值。

---

### `meta` 对象

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

> `id` 一旦被保存到浏览器本地，实际存储键是 `studio_comp_{id}`（见 [§04 工作机制](#part-05)）。

---

### `layers` 数组

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
| `bindings` | object | 可选 | `{ <属性名>: Binding }`，见 [§02 数据绑定](#part-03)。可省略或给 `{}`。 |
| `children` | array | 仅 group | 只有 `type:"group"` 才有；子图层结构与 Layer 相同，递归。 |

#### 关于 `uid`

- Studio 生成的格式：`L` + 时间戳(base36) + 递增种子(base36) + 随机(base36)，例如 `Lm2k1x0a1`。
- 你**手写**时不必模仿这个算法，只要保证：**唯一、非空、只含安全字符**（建议 `L` 前缀 + 短字母数字，如 `Lbg01`、`Lval02`）。
- 复制粘贴/导入到已有组件时若 `uid` 冲突，Studio 会重新分配；但独立导入时请自保证唯一。

---

### 图层类型（`type`）与 Leafer 映射

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

### 各类型 `props` 默认值（新图层的基准，也是绑定满量程来源）

以下即 Studio 新建该类型图层时写入的初始属性，可作为你书写 `props` 的**权威模板**（缺省属性会被 Leafer 用默认值补齐，但建议显式写全，便于绑定时确定满量程）。

#### `rect`
```jsonc
{ "x": 40, "y": 40, "width": 240, "height": 60, "fill": "#32cd79", "cornerRadius": 0, "rotation": 0, "opacity": 1 }
```
- `fill` 可给颜色字符串，或渐变对象（Leafer 渐变语法）；`stroke`/`strokeWidth` 可选。
- `cornerRadius`：圆角半径（数值）。

#### `ellipse`
```jsonc
{ "x": 40, "y": 40, "width": 160, "height": 160, "fill": "#32cd79", "rotation": 0, "opacity": 1 }
```
- `width===height` 即为正圆。

#### `arc`（仪表环）
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

#### `line`
```jsonc
{ "x": 40, "y": 40, "width": 240, "stroke": "#ffffff", "strokeWidth": 6, "rotation": 0, "opacity": 1 }
```
- `(x,y)` 起点，`width` 长度（默认水平向右），`rotation` 旋转整条线（度）。
- 没有 `height`；粗细用 `strokeWidth`。

#### `text`
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

#### `svg`（图标）
```jsonc
{ "x": 40, "y": 40, "width": 64, "height": 64, "svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 1024 1024\"><path d=\"...\" fill=\"#43464F\"/></svg>", "fill": "", "rotation": 0, "opacity": 1 }
```
- `svg`：图标代码本体（不是 URL！）。Studio 里点 **Basic Elements → SVG Icon** 会先落一个**占位三角形**图层（保证插上去就能看见），选中它后在右侧 **Properties → SVG code** 文本框里换成真代码（去 [iconfont.cn · collections](https://www.iconfont.cn/collections) 找图标，“复制 SVG 代码”）。失焦即校验并写入。
- **硬限制 10 KB**（UTF-8 字节数，按**规范化后**的结果算，所以带一堆 `p-id`/`class` 噪声的 iconfont 原文一般都能缩下去）：超出不会落库，提交/导入时 `validateSpec` 也会报错；含 `<script>`、`<foreignObject>`、`on…=` 事件处理器或 `javascript:` 的代码会被直接拒绝。
- Studio 会对代码做规范化：去掉 `p-id`/`t`/`class` 等平台噪声、补 `xmlns`、按 `viewBox` 写回固有尺寸（缺 `viewBox` 时退到 `width`/`height` 属性，再退到 1024×1024）。只贴 `<path/>` 之类的内部片段也行，会自动包一层 `<svg>`。
- `fill`：可选的**重着色**颜色（空 = 保持图标原色）。非空时渲染前会把图标内部所有 `fill="…"` / `fill:…` 换成这个色（`none` 与渐变 `url(#…)` 不动）。图标在图层里就是一个 Image 盒，`width`/`height` 控制显示尺寸（换代码时 Studio 会按新 `viewBox` 比例自动修正长宽，保持长边不变，不会拉扁），不会破坏矢量质量。
- 可绑定属性与 `image` 相同（`x` `y` `opacity` `visible`）；代码本身不参与数据绑定。

#### `image`（旧版图片，面板已不再提供入口）
```jsonc
{ "x": 40, "y": 40, "width": 160, "height": 160, "url": "", "rotation": 0, "opacity": 1 }
```
- `url` 只接受安全的 `https://...` 或 `data:image/...;base64,...`；其它（如 `javascript:`）会被过滤掉。新组件请用 `svg` 图层贴代码，不必再拼图片 URL。

#### `group`
```jsonc
{ "x": 0, "y": 0, "rotation": 0, "opacity": 1 }
```
- 子图层的坐标相对 group。group 本身不可选中/拖动（编辑器行为），但数据上正常渲染。

---

### 坐标与缩放（务必理解）

- 图层坐标写在 `meta.width × meta.height` 的**设计坐标系**里。
- 组件被放到运行时容器（如模板里给定的 `width/height`）时，`visualFactory` 计算 `scale = 容器尺寸 / 设计尺寸`，等比缩放整组元素。
- 对 `size` 绑定（进度条等）：引擎以**设计基准值**（`props.width` 等）为满量程，再按当前 `scale` 换算，保证容器被拉伸后进度条比例依然正确。
- 结论：**你只按设计尺寸排版，不要试图预先把坐标缩放到最终显示尺寸。**

---

### 一个不含绑定的纯静态组件示例

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

下一步：给这些属性挂上数据 → 见 [§02 数据绑定](#part-03)。

---
<a id="part-03"></a>

## 02 · 数据绑定（bindings）

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

### 6 个 mode 一览

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

### 各 mode 详细规则

#### `text`
```
raw = fieldValue(field)
若 decimal != null 且 raw 是数字 → str = raw.toFixed(decimal)   否则 str = String(raw)
若 unit === true  → str = unitConfig.format(unitKey || field, str)   （自动加空格的前后缀）
否则若 suffix     → str = str + suffix
若 prefix         → str = prefix + str
→ el.text = str
```
- 只有 `text` 模式会用 `decimal`/`unit`/`prefix`/`suffix`。
- `unit:true` 与 `suffix` **二选一**：`unit` 优先，走单位系统（见 [§03 字段与边界](#part-04)）。
- 想让单位带空格用 `unit`；想完全自定义用 `suffix`/`prefix`（`suffix` 不会自动补空格，需要空格就自己写 `" km"`）。
- 时间类字段（`elapsedTime`/`totalTime`/`remainTime`）返回的是字符串，别拿去 `toFixed`。

#### `size`
```
base = layer.props[prop]            // 设计基准（满量程）
若容器被缩放 → base 按轴换算（height/y 用 scaleY，其余用 scaleX）
v   = fieldValue(field)
min = binding.min ?? 0
max = binding.max
若 max 未给 → el[prop] = base * clamp(v, 0, 1)        // 直接把 v 当 0..1 比例
若 max 已给 → ratio = normalize(v, min, max); el[prop] = base * ratio
```
- **满量程 = 你在 `props` 里写的该属性值**。进度条做法：把 `props.width` 设计成"满条"的宽度，绑 `width` + `size` + `field` + `min`/`max`。
- `min`/`max` 可以是数字，也可以是**字段名**（字符串），见 [§03 字段与边界](#part-04)。
- 若字段本身就是 0..1（如 `pct`、`hrPct`），可以不写 `max`，引擎会 `clamp(v,0,1)` 直接用。
- 把 `x`/`y` 当 `size` 目标 = **位置扫描游标**：`props.x` 写成"填满"时的坐标，比例 × 满值实现横扫/纵扫。

#### `angle`
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

#### `color`
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

#### `opacity`
```
v = fieldValue(field)
el.opacity = normalize(v, min = binding.min ?? 0, max = binding.max ?? 1)
```

#### `visible`
```
v = fieldValue(field)
el.visible = v >= (binding.threshold ?? 0)
```
- 逐格点亮/到点显现：给每个格子一个 `visible` 绑定，`threshold` 设成各自触发值（配合 `pct` 或里程字段）。

---

### 可绑定属性表（BINDABLE）

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

### 切字段时的默认边界（FIELD_DEFAULT_BOUNDS）

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

> ⚠️ 配速陷阱：`paceMin`/`paceMax` 存的是**速度极值 (km/h)**，不是配速。要给 `pace` 字段（min/km）当边界，请用派生字段 `paceBoundMin`/`paceBoundMax`（引擎内部 = 60/速度），二者的快慢方向也已按配速语义对齐。字段取值详见 [§03 字段与边界](#part-04)。

---

字段清单、派生量、单位/前后缀规则见 → [§03 字段与边界](#part-04)。

---
<a id="part-04"></a>

## 03 · 数据字段、边界与单位

绑定里的 `field`（以及 `min`/`max` 的字符串引用）都由 `bindingEngine.fieldValue()` 解析。
它按下面的顺序取一个数值：

1. **合成/派生字段**（固定名字，直接现算）：见"派生量"表
2. **当前帧轨迹点字段**（`frameData`，即本秒的 trkpt）：见"实时字段"表
3. **chartData 里的键**（全量极值/基准，多用作 `min`/`max` 边界）：见"极值/边界"表
4. 都没有 → 返回 `0`

> `min`/`max` 规则：**数字**直接当边界；**字符串**则再走一遍 `fieldValue` 当字段引用。
> 所以 `"max": "heartRateMax"` 会把仪表满量程拉到"本次活动的心率峰值"，而不是写死 200。

---

### 实时字段（当前帧 trkpt，`group: value`）

| `field` key | 含义 | 单位 | 有 unitKey |
|---|---|---|---|
| `distance` | 累计距离 | m | ✅ `distance` |
| `speed` | 速度 | km/h | ✅ `speed` |
| `heart_rate` | 心率 | bpm | ✅ `heart_rate` |
| `cadence` | 步频/踏频 | steps/min | ✅ `cadence` |
| `power` | 功率 | watt | ✅ `power` |
| `step_length` | 步幅 | m | ✅ `step_length` |
| `altitude` | 海拔 | m | ✅ `altitude` |
| `slope` | 坡度 | % | — |
| `sec` | 已用时长 | s | — |
| `Gain` | 累计爬升 | m | — |
| `Loss` | 累计下降 | m | — |
| `azimuth` | 方位角 | ° | — |

> `frameData` 实际还含 `timestamp`、`position_lat`、`position_long`、`is_pause` 等，任何存在于当前帧的键都能用 `field` 直接取到（走通用回退分支）。但面板下拉只列出上表这些"可绑定的数值字段"。

---

### 派生量（引擎现算，`group: derived`）

| `field` key | 含义 | 计算 |
|---|---|---|
| `pct` | 时间线进度 0..1 | = 当前帧索引 / (总帧数-1) |
| `km` | 公里 | distance / 1000 |
| `pace` | 配速 | 由 speed 换算 min/km |
| `totalDistance` | 总距离 | 末点 distance |
| `totalKm` | 总公里 | 末点 distance / 1000 |
| `duration` | 总时长 | 末点 sec |
| `elapsedMin` | 已用分钟 | sec / 60 |
| `avgSpeed` | 平均速度 km/h | distance*3.6/sec |
| `avgPace` | 平均配速 | 由 avgSpeed 换算 |
| `remainDistance` | 剩余距离 | 末点 distance − 当前 distance |
| `remainKm` | 剩余公里 | remainDistance / 1000 |
| `relAltitude` | 相对海拔 | altitude − baseAltitude |
| `hrPct` | 心率占上限 0..1 | heart_rate / user_heartRateMax |
| `elapsedTime` | 已用时（文本） | 格式化 h:mm:ss / m:ss |
| `totalTime` | 总时长（文本） | 末点 sec 格式化 |
| `remainTime` | 预计剩余（文本） | 按当前均速推算 |
| `paceBoundMin` | 最慢配速 min/km | 60 / 速度极小… 见下 |
| `paceBoundMax` | 最快配速 min/km | 60 / 速度极大… 见下 |

> **时间文本**（`elapsedTime`/`totalTime`/`remainTime`）返回字符串，只适合 `text` 模式，别拿去 `size`/`angle` 归一。
> **`pace` 与 `paceBound*`**：`paceMin`/`paceMax` 是**速度**极值(km/h)；配速与其互为倒数。`paceBoundMin`=最慢配速，`paceBoundMax`=最快配速。给配速仪表选边界时，用 `paceBoundMin`/`paceBoundMax`，不要用 `paceMin`/`paceMax`。

---

### 极值 / 边界（chartData，`group: extreme`，常作 min/max）

| key | 含义 |
|---|---|
| `heartRateMin` / `heartRateMax` | 本次活动心率最低 / 最高 |
| `user_heartRateMax` | 用户心率上限（取整，常作心率 `max`） |
| `cadenceMin` / `cadenceMax` | 步频最低 / 最高 |
| `paceMin` / `paceMax` | **速度**最低 / 最高（km/h） |
| `paceBoundMin` / `paceBoundMax` | **配速**最慢 / 最快（min/km，由速度取倒数） |
| `eleMin` / `eleMax` | 海拔最低 / 最高 |
| `baseAltitude` | 基准海拔（算 `relAltitude`） |
| `powerMin` / `powerMax` | 功率最低 / 最高 |

> 这些键来自真实活动的 `chartData`，运行时由数据管道注入；Studio 预览用的是内置演示数据里同名键（如 `heartRateMax`、`user_heartRateMax:170`、`paceMin:10.34`、`paceMax:11.27`、`eleMax:24.6` 等）。
> `chartData` 还含点集数组（`heart_points`、`paces_points`、`ele_points`、`mapPoints` 等），供图表类组件消费；一般组件不需要直接绑它们。

---

### 单位系统（text 模式的 `unit:true`）

`text` 绑定勾选 `unit`（`"unit": true`）时，用 `unitConfig.format(unitKey || field, 值)` 拼接前后缀，**自动补空格**。
默认单位表（`UNIT_DEFS`）：

| `unitKey` | 默认前缀 | 默认后缀 |
|---|---|---|
| `heart_rate` | — | `bpm` |
| `pace` | — | `min/km` |
| `speed` | — | `km/h` |
| `cadence` | — | `steps/min` |
| `rpm` | — | `Rpm` |
| `power` | — | `watt` |
| `step_length` | — | `m` |
| `altitude` | — | `m` |
| `distance` | — | `Km` |

要点：
- 用户可在浏览器里改这些前后缀（存 `localStorage` 键 `newsports_unit_config`），所以**同一份 JSON 在不同用户处显示的单位文本可能不同**——这是预期行为。
- `unitKey` 可与 `field` 不同：例如 `field:"distance"`(m) 但想按公里单位表格式化，可显式 `"unitKey": "distance"`。
- 想要**固定**、不受用户单位设置影响的文本，用 `suffix`/`prefix`，别用 `unit`。

```jsonc
// 两种写法的对比
{ "mode": "text", "field": "heart_rate", "decimal": 0, "unit": true }        // → "148 bpm"（随用户单位设置变）
{ "mode": "text", "field": "heart_rate", "decimal": 0, "suffix": " bpm" }    // → "148 bpm"（固定）
```

---

### 挑选字段/边界的快捷原则

- **进度条/完成度**：`field` 用 `pct`（时间进度）或 `distance`/`km`（配 `max:"totalDistance"`/`"totalKm"`）。
- **心率仪表/色条**：`field:"heart_rate"`，`min:"heartRateMin"`，`max:"user_heartRateMax"`。
- **速度表**：`field:"speed"`，`min:"paceMin"`，`max:"paceMax"`（注意这是速度极值）。
- **配速表**：`field:"pace"`，`min:"paceBoundMin"`，`max:"paceBoundMax"`。
- **指北针/朝向**：`field:"azimuth"` + `angle` 模式绑 `rotation`，`min:0,max:360,from:0,to:360`。
- **海拔**：`field:"altitude"`（`min:"eleMin",max:"eleMax"`）或 `field:"relAltitude"`（`min:"baseAltitude",max:"eleMax"`）。

导入/预览/提交链路见 → [§04 工作机制](#part-05)。

---
<a id="part-05"></a>

## 04 · 工作机制：导入 / 导出 / 持久化 / 提交 / 预览

这一篇讲"一份 JSON 从生成到能用"的完整链路，以及所有相关端点与键名。

### 访问与部署

| 用途 | 地址 |
|---|---|
| Studio 页面（线上） | `https://pulseframe.data4u.vip/studio/index.html` |
| 服务端 API | `https://sportsfile.data4u.vip/pages/server/api.php` |
| 本地源码 | 仓库内 `studio/index.html`（若站点根下有指向本仓库的 `pages` 软链，**改仓库即改线上**，无需另外拷贝） |

API 基址由 `appConfig.apiBase()` 解析，优先级：
`window.PULSEFRAME_CONFIG.apiBase` → `<meta name="pulseframe:api-base">` → `apiBaseByHost[hostname]` → 由当前 URL 推导（`server/` 与 app 目录同级）。
所以换域名部署时端点会自动跟着变，一般无需硬编码。

> **改完前端怎么生效（缓存与 `?v=`）**：静态 JS 带 `Cache-Control: max-age=43200`（12 小时），`index.html` 只缓 2 分钟。
> 规矩：**`studio/js/**` 内部的所有 import 边必须带同一个版本 token**（当前 `?v=18`），改任意内部文件就把 token 统一 +1：
>
> ```bash
> cd studio && grep -rl "?v=18" js index.html | xargs sed -i 's/?v=18/?v=19/g'
> # js 内部边与 index.html 的入口/CSS 一起扫到，改完用 grep -rn "?v=" js index.html 确认只剩新 token
> ```
>
> 为什么不能“只给改过的文件加版本号”：没带版本号的模块（曾经的 `SpecStore.js`、`StudioPreview.js`、`FieldDemo.js` 等）URL 永远不变，浏览器/CDN 一旦回了旧副本，**旧副本里的 import 串也是旧的**，于是同一个模块被两个不同 URL 各加载一份——`studioCanvas`/`specStore` 变成两套单例，被 `init()` 的和面板/播放引用的不是同一个。故障是静默的：典型表现就是“点播放只动帧号不动画面”。
> 现在 `StudioCanvas`/`StudioPreview`/`SpecStore` 末尾各有一段混版自检（第二个实例注册时置 `window.__spDup`），命中后 `StudioApp` 会在顶栏下方挂一条红色横幅让用户强刷，不再让人对着“点了没反应”猜。
>
> **例外**：跳出 `studio/js/` 进入共享前端树（`../../js/components/…`、`../../../js/core/appConfig.js`）的边**不带** studio 的 token，那边有自己的版本约定；给它们乱加会让前端 registry 裂成两份，仪表盘组件直接从面板消失。

---

### 顶栏工具按钮（工作流入口）

元信息输入框：`Name` / `Category` / `Width` / `Height` / `ID`（对应 `spec.meta`，`ID` 只保留 `[A-Za-z0-9_]`，且**不允许与已有组件撞 id**，见下文“组件 ID 撞车防护”）。

| 按钮 | 作用 |
|---|---|
| **Import** | 选择本地 `.json` 文件 → `specStore.importString()` 载入到画布 |
| **Open JSON** | 弹出大文本框**粘贴** Component Spec JSON → 点 `Validate & Import` **先做结构校验，合格才导入**（不合格逐条列出错误，画布不变）；`Ctrl/Cmd+Enter` 同样触发 |
| **Export JSON** | `specStore.exportString()` = `JSON.stringify(spec, null, 2)`，复制出去即标准格式 |
| **Save Local** | 写入浏览器 `localStorage`，键 `studio_comp_{meta.id}`，主编辑器与 Studio 都能立即看到。写之前会过一道 id 防撞（撞上别的本地组件会自动改名，不会静默覆盖） |
| **Open Local** | 列出本机所有 `studio_comp_*` 组件，选一个载入编辑 |
| **Submit to Library** | 提交到公共库（走审核，弹窗里须先勾选授权声明），见下 |
| **AI Handbook**（顶栏右侧） | 弹出简版使用说明（上画布搭 / 直接写 JSON / 术语 / 高频坑）+ `ALL_IN_ONE.md` 下载链接 |
| **Open Library** | 浏览已发布的公共组件 |
| New / Reset / Undo / Redo / Copy / Paste / Delete | 常规编辑操作 |

URL 直达编辑：`?editFrom=local&editId={id}` 或 `?editFrom=shared&editId={dbId}`。
从 `shared` 打开会 **fork** 一份副本，`id` 变成 `{原id}_shared{dbId}`，不污染库里的原件。

---

### 校验规则（生成 JSON 时必须满足）

1. **导入**（`SpecStore.importString`）：
   ```js
   const spec = JSON.parse(text);
   if (!spec.meta || !Array.isArray(spec.layers)) throw new Error('Invalid component JSON');
   ```
   → 必须能 `JSON.parse`、有 `meta` 对象、`layers` 是数组。
2. **注册加载**（`loader.registerSpec` / `visualFactory.registerVisualComponent`）：
   → 必须有 `spec.meta.id`，否则跳过（不报错，但组件不出现）。
3. **与内置组件冲突**：若 `meta.id` 命中一个**非可视化**的内置组件 id，加载会**跳过**（保护内置组件）。→ 用 `custom_` 前缀可规避。
4. **组件 ID 撞车防护**（`lib/idGuard.js`，`_guardId` 在“改 ID”与“保存本地”两处调用）：id 同时是 localStorage 键、registry 注册键和模板/工程引用组件的凭据，撞上就是静默覆盖，因此只要命中以下三源就自动加后缀改名（`my_comp` → `my_comp_2`）并 toast 提示：
   - 内置手写组件 id（启动时由 `loadFrontendDefs()` 灌进来——它们注册在前端自己的 registry 实例上，studio 的 registry 看不见）；
   - 本机 `localStorage` 已存的组件（键后缀 + 内容里的 `meta.id` 都算）；
   - 本会话 registry 里已注册的可视化组件（含从公共库拉下来的）。

   就地编辑自己（`id` 未变）不算冲突；从 `shared` fork 的副本因 id 已带 `_shared{dbId}` 后缀，也不会与原件相撞。别人提交的重号本机看不见，由服务器 409 兜底（见“提交”）。

> 一句话：**能被 `JSON.parse` + 有 `meta`（含 `id`）+ `layers` 是数组** = 合法且能落地。其余都有默认值兜底。

> **结构校验（`lib/validateSpec.js`，规则同 [§ 自检清单](#part-07)）被两处复用**：Open JSON 弹窗的 `Validate & Import`、以及 Submit to Library 提交前。除了硬性项，还会拦下非法 `type`、缺失/重复 `uid`、缺失 `props`、不可绑定属性、非法 `mode`、`rotation` 的 `angle` 缺 `from/to` 等**结构错误**（有错则不导入 / 不上传）；`meta.id` 为空/含非法字符、`arc` 缺 `closed`、空 `layers` 等只作**警告**，不阻断导入。文件 `Import` 则仅走上面那条硬性规则。

---

### 持久化与加载

#### 本地
- 键：`studio_comp_{meta.id}`，值：完整 spec 的 JSON 字符串。
- `loadLocalComponents()` 同步扫描 `localStorage` 全部 `studio_comp_*` 并注册。

#### 公共库（远端）
- 列表：`GET {apiBase()}?action=list&kind=component`（返回审核通过的行）。
- 详情：`GET {apiBase()}?action=detail&id={rowId}` → 取 `data.json_content`（就是你提交的 spec JSON）。
- 加载完成后广播事件 `custom:components-loaded`，调色板刷新。
- 本地已有同 `id` 的可视化组件时，**保留本地、不被远端覆盖**。
- 单份 spec 坏掉只会被 `console.warn` 跳过，不影响其它组件。

#### 提交（Publish）
- 弹窗采集 `Name / Category / Author / Description` → 更新 `spec.meta`。
- 先跑一遍 `validateSpec()`（与 Open JSON 同一套规则）；结构有错直接拦下，不占用审核队列。额外还有三条**只拦上传、不拦导入**的硬要求：`meta.id` 非空、`meta.id` 只含 `[A-Za-z0-9_]`（非法字符会被服务端剔除后再查重，容易看不出为何撞号）、`layers` 非空（零图层组件装上去就是个透明盒子）。
- `POST {apiBase()}?action=submit`，`kind=component`，`json_content={你的spec JSON}`。
- 提交后 `status=pending`，**管理员审核通过 (`approved`)** 后才进入 `list&kind=component` 发布给所有人。
- 分类取值：`time` `distance` `attr` `chart` `text` `cycling` `theme`。
- **组件 id 重号会被拒**：服务端把 `meta.id` 镜像到 `templates.spec_id`，已有“存活行”（非 `rejected`）占着同一 id 时返回 `409` + `code:"duplicate_spec_id"`，弹窗询问是否换个后缀重提；被驳回的行会释放 id，改内容/重新通过审核时同样重查。模板（`kind=template`）不参与这条规则。每次拦截都会在 `server/logs/server.log.php` 记一条 `WARN duplicate component id rejected`（带撞的行号与来源 IP），方便管理员判断是谁在抢号。
- **提交前必须阅并同意授权声明**（弹窗里的 `.sp-terms` 块 + `#sdAgree` 勾选）：说清三件事——① 管理员会审阅，可能善意改动（布局/配色/绑定），也可能因质量不发布；② 一旦公开就交出独占权，任何人可取用并二次编辑；③ 不想公开就别上传，用 Save Local 或 Export JSON。未勾选时 **Submit for review** 置灰（`_syncSubmit()`），`_submit()` 开头再兜一道；同意**不做记忆**，每次 `open()` 重置。

---

### 预览环境（Studio 里"逐帧"是怎么跑起来的）

- Studio 启动时 `_ensureDemoData()` 会准备内置演示轨迹：`window.__trkptData`（逐帧数组）与 `window.__chartData`（极值/点集）。
- 画布每帧构造上下文：
  ```js
  ctx = { trkptData, currentFrame, maxFrame, chartData };
  progress = currentFrame / (maxFrame - 1);   // 0..1，供 field "pct"
  ```
  然后对每个有绑定的图层调用 `applyLayerBindings(el, layer, { frameData, ctx, progress })`。
- 因此 `pct` = 时间线进度，`totalDistance`/`duration` 等来自末帧，`heartRateMax` 等来自 `chartData`。
- 主编辑器 / 视频导出运行时用**真实活动数据**喂同样的字段——这就是"同一份 JSON，设计即所见、运行即所得"的原因。

---

### 运行时如何把 spec 变成组件（了解即可，无需你写）

`visualFactory.specToDefinition(spec)` 自动生成 registry 需要的定义：
- `defaultConfig = { x:0, y:0, width: meta.width, height: meta.height }`
- `build()`：把每个图层 `layerToElement` 转成 Leafer 元素配置（含 group 递归、`arc` 补 `closed:false`）。
- `update()`：`scale = 容器尺寸 / 设计尺寸`，按 `uid` 命中元素逐条应用绑定。
- `dataBindings`：自动收集用到的 `field`/`min`/`max`。

你只提供声明式 spec，**不提交任何 JavaScript**——这正是共享组件能被安全自动加载的前提。

---

### 可选：作者声明"可编辑样式项"（`spec.editable`）

除核心三段外，spec 支持一个可选数组 `editable`，让使用者在主编辑器属性面板里改某些样式（不改数据绑定）（下为片段示意，需嵌在顶层 spec 中）：

```jsonc
"editable": [
  { "key": "titleColor", "label": "Title color", "type": "color", "uid": "Ltitle", "prop": "fill" }
]
```

- 运行时使用者通过 `config.styleOverrides[uid][prop] = 值` 覆盖对应图层属性（`applyStyleOverride` 合入，不动原 spec）。
- 这是进阶项；**基础组件不需要它也能正常工作**。若不确定，省略 `editable` 即可。

---

完整示例 JSON 见 → [§05 完整示例](#part-06)；逐条自检见 → [§ 自检清单](#part-07)。

---
<a id="part-06"></a>

## 05 · 可直接复制的完整示例

以下每个 JSON 都**自成一体、可直接 Import**。设计坐标都写在 `400 × 200` 的盒子里（除特别说明）。
抄结构、改颜色和 `field`/边界即可产出新组件。

---

### A. 距离进度条（`size` 满量程 + 文本）

```json
{
  "version": 1,
  "meta": { "id": "custom_dist_bar", "name": "Distance Bar", "category": "distance", "icon": "", "width": 400, "height": 200 },
  "layers": [
    { "uid": "Lbg", "name": "bg", "type": "rect", "visible": true,
      "props": { "x": 0, "y": 0, "width": 400, "height": 200, "fill": "#23232e", "cornerRadius": 12, "rotation": 0, "opacity": 1 },
      "bindings": {} },
    { "uid": "Llabel", "name": "label", "type": "text", "visible": true,
      "props": { "x": 30, "y": 30, "text": "Distance", "fontSize": 22, "fontWeight": "normal", "fill": "#9aa0b4", "textAlign": "left", "verticalAlign": "top", "rotation": 0, "opacity": 1 },
      "bindings": {} },
    { "uid": "Lval", "name": "value", "type": "text", "visible": true,
      "props": { "x": 30, "y": 55, "text": "0.0 km", "fontSize": 44, "fontWeight": "black", "fill": "#ffffff", "textAlign": "left", "verticalAlign": "top", "rotation": 0, "opacity": 1 },
      "bindings": { "text": { "mode": "text", "field": "km", "decimal": 1, "suffix": " km" } } },
    { "uid": "Ltrack", "name": "track", "type": "rect", "visible": true,
      "props": { "x": 30, "y": 150, "width": 340, "height": 16, "fill": "#333344", "cornerRadius": 8, "rotation": 0, "opacity": 1 },
      "bindings": {} },
    { "uid": "Lfill", "name": "fill", "type": "rect", "visible": true,
      "props": { "x": 30, "y": 150, "width": 340, "height": 16, "fill": "#32cd79", "cornerRadius": 8, "rotation": 0, "opacity": 1 },
      "bindings": { "width": { "mode": "size", "field": "km", "min": 0, "max": "totalKm" } } }
  ]
}
```
> 关键点：`Lfill.props.width = 340` 是**满量程**；`size` 绑定把 `km/totalKm` 的比例乘到 340 上，随进度伸展。

---

### B. 心率环形仪表（`arc` + `angle` 进度 + 居中数值）

```json
{
  "version": 1,
  "meta": { "id": "custom_hr_ring", "name": "Heart Ring", "category": "distance", "icon": "", "width": 400, "height": 200 },
  "layers": [
    { "uid": "Lbg", "name": "bg", "type": "rect", "visible": true,
      "props": { "x": 0, "y": 0, "width": 400, "height": 200, "fill": "#23232e", "cornerRadius": 12, "rotation": 0, "opacity": 1 },
      "bindings": {} },
    { "uid": "Ltrack", "name": "track", "type": "arc", "visible": true,
      "props": { "x": 100, "y": 0, "width": 200, "height": 200, "fill": null, "innerRadius": 1, "startAngle": -210, "endAngle": 30, "closed": false, "stroke": "#333344", "strokeWidth": 22, "strokeCap": "round", "strokeAlign": "center", "rotation": 0, "opacity": 1 },
      "bindings": {} },
    { "uid": "Lvalue", "name": "value", "type": "arc", "visible": true,
      "props": { "x": 100, "y": 0, "width": 200, "height": 200, "fill": null, "innerRadius": 1, "startAngle": -210, "endAngle": -210, "closed": false, "stroke": "#32cd79", "strokeWidth": 22, "strokeCap": "round", "strokeAlign": "center", "rotation": 0, "opacity": 1 },
      "bindings": { "endAngle": { "mode": "angle", "field": "heart_rate", "min": "heartRateMin", "max": "user_heartRateMax", "from": -210, "to": 30 } } },
    { "uid": "Lnum", "name": "num", "type": "text", "visible": true,
      "props": { "x": 160, "y": 80, "text": "0", "fontSize": 44, "fontWeight": "black", "fill": "#ffffff", "textAlign": "left", "verticalAlign": "top", "rotation": 0, "opacity": 1 },
      "bindings": { "text": { "mode": "text", "field": "heart_rate", "decimal": 0, "suffix": " bpm" } } }
  ]
}
```
> 进度弧 = 第二层 `arc`，`endAngle` 从 `-210`（起点，空）被 `angle` 绑到 `30`（满）。`min`/`max` 用字段引用，随本次活动心率区间自适应。

---

### C. 大数值卡（配速，走单位系统）

```json
{
  "version": 1,
  "meta": { "id": "custom_pace_big", "name": "Pace Big", "category": "distance", "icon": "", "width": 400, "height": 200 },
  "layers": [
    { "uid": "Lbg", "name": "bg", "type": "rect", "visible": true,
      "props": { "x": 0, "y": 0, "width": 400, "height": 200, "fill": "#23232e", "cornerRadius": 16, "rotation": 0, "opacity": 1 },
      "bindings": {} },
    { "uid": "Lcap", "name": "caption", "type": "text", "visible": true,
      "props": { "x": 40, "y": 45, "text": "PACE", "fontSize": 20, "fontWeight": "normal", "fill": "#9aa0b4", "textAlign": "left", "verticalAlign": "top", "rotation": 0, "opacity": 1 },
      "bindings": {} },
    { "uid": "Lval", "name": "value", "type": "text", "visible": true,
      "props": { "x": 40, "y": 75, "text": "0:00", "fontSize": 64, "fontWeight": "black", "fill": "#32cd79", "textAlign": "left", "verticalAlign": "top", "rotation": 0, "opacity": 1 },
      "bindings": { "text": { "mode": "text", "field": "pace", "decimal": 0, "unit": true } } }
  ]
}
```

---

### D. 心率区间色条（同一图层 `size` + `color` 双绑定）

```json
{
  "version": 1,
  "meta": { "id": "custom_hr_zone", "name": "HR Zone Bar", "category": "chart", "icon": "", "width": 400, "height": 200 },
  "layers": [
    { "uid": "Lbg", "name": "bg", "type": "rect", "visible": true,
      "props": { "x": 0, "y": 0, "width": 400, "height": 200, "fill": "#23232e", "cornerRadius": 12, "rotation": 0, "opacity": 1 },
      "bindings": {} },
    { "uid": "Ltrack", "name": "track", "type": "rect", "visible": true,
      "props": { "x": 30, "y": 92, "width": 340, "height": 18, "fill": "#333344", "cornerRadius": 9, "rotation": 0, "opacity": 1 },
      "bindings": {} },
    { "uid": "Lbar", "name": "bar", "type": "rect", "visible": true,
      "props": { "x": 30, "y": 92, "width": 340, "height": 18, "fill": "#32cd79", "cornerRadius": 9, "rotation": 0, "opacity": 1 },
      "bindings": {
        "width": { "mode": "size", "field": "hrPct", "min": 0, "max": 1 },
        "fill":  { "mode": "color", "field": "heart_rate", "base": "#32cd79",
          "thresholds": [
            { "gte": 170, "color": "#ff3b3b" },
            { "gte": 155, "color": "#ff7a2f" },
            { "gte": 140, "color": "#ffd400" },
            { "gte": 120, "color": "#5bd66b" }
          ] }
      } }
  ]
}
```
> `width` 用 `hrPct`(0..1) 控制长度，`fill` 用 `heart_rate` 的阈值分档控制颜色——**两根绑定挂在同一图层的不同属性上**。

---

### E. 指北针指针（`angle` → `rotation`）

```json
{
  "version": 1,
  "meta": { "id": "custom_compass", "name": "Compass", "category": "attr", "icon": "", "width": 400, "height": 200 },
  "layers": [
    { "uid": "Lbg", "name": "bg", "type": "rect", "visible": true,
      "props": { "x": 0, "y": 0, "width": 400, "height": 200, "fill": "#23232e", "cornerRadius": 12, "rotation": 0, "opacity": 1 },
      "bindings": {} },
    { "uid": "Ldial", "name": "dial", "type": "ellipse", "visible": true,
      "props": { "x": 110, "y": 10, "width": 180, "height": 180, "fill": "#2d2d3a", "rotation": 0, "opacity": 1 },
      "bindings": {} },
    { "uid": "Lneedle", "name": "needle", "type": "line", "visible": true,
      "props": { "x": 200, "y": 100, "width": 80, "stroke": "#ff6b6b", "strokeWidth": 6, "rotation": 0, "opacity": 1 },
      "bindings": { "rotation": { "mode": "angle", "field": "azimuth", "min": 0, "max": 360, "from": 0, "to": 360 } } }
  ]
}
```
> `rotation` 的 `angle` 绑定**必须写 `from`/`to`**（这里 0→360），否则会退回弧度的默认 -210/30。
> ⚠️ Leafer 的 `rotation` 默认绕图层**原点**旋转。`line` 的原点在 `(x,y)` 起点，所以把针做成"从 `(x,y)` 伸出"即可围绕该点转。若要绕几何中心转，把 `x/y` 设在你想固定的轴心，针身从该点向外画。

---

### F. 里程碑点阵（`visible` 逐个点亮）

```json
{
  "version": 1,
  "meta": { "id": "custom_milestones", "name": "KM Milestones", "category": "distance", "icon": "", "width": 400, "height": 200 },
  "layers": [
    { "uid": "Lbg", "name": "bg", "type": "rect", "visible": true,
      "props": { "x": 0, "y": 0, "width": 400, "height": 200, "fill": "#23232e", "cornerRadius": 12, "rotation": 0, "opacity": 1 },
      "bindings": {} },
    { "uid": "Ld1", "name": "km1", "type": "ellipse", "visible": true,
      "props": { "x": 40, "y": 85, "width": 30, "height": 30, "fill": "#32cd79", "rotation": 0, "opacity": 1 },
      "bindings": { "visible": { "mode": "visible", "field": "pct", "threshold": 0.2 } } },
    { "uid": "Ld2", "name": "km2", "type": "ellipse", "visible": true,
      "props": { "x": 110, "y": 85, "width": 30, "height": 30, "fill": "#32cd79", "rotation": 0, "opacity": 1 },
      "bindings": { "visible": { "mode": "visible", "field": "pct", "threshold": 0.4 } } },
    { "uid": "Ld3", "name": "km3", "type": "ellipse", "visible": true,
      "props": { "x": 180, "y": 85, "width": 30, "height": 30, "fill": "#32cd79", "rotation": 0, "opacity": 1 },
      "bindings": { "visible": { "mode": "visible", "field": "pct", "threshold": 0.6 } } },
    { "uid": "Ld4", "name": "km4", "type": "ellipse", "visible": true,
      "props": { "x": 250, "y": 85, "width": 30, "height": 30, "fill": "#32cd79", "rotation": 0, "opacity": 1 },
      "bindings": { "visible": { "mode": "visible", "field": "pct", "threshold": 0.8 } } },
    { "uid": "Ld5", "name": "km5", "type": "ellipse", "visible": true,
      "props": { "x": 320, "y": 85, "width": 30, "height": 30, "fill": "#32cd79", "rotation": 0, "opacity": 1 },
      "bindings": { "visible": { "mode": "visible", "field": "pct", "threshold": 0.99 } } }
  ]
}
```

---

### G. 扫描游标（`size` → `x` 位置横扫）

```json
{
  "version": 1,
  "meta": { "id": "custom_sweep", "name": "Sweep Cursor", "category": "chart", "icon": "", "width": 400, "height": 200 },
  "layers": [
    { "uid": "Lbg", "name": "bg", "type": "rect", "visible": true,
      "props": { "x": 0, "y": 0, "width": 400, "height": 200, "fill": "#23232e", "cornerRadius": 12, "rotation": 0, "opacity": 1 },
      "bindings": {} },
    { "uid": "Laxis", "name": "axis", "type": "line", "visible": true,
      "props": { "x": 30, "y": 100, "width": 340, "stroke": "#333344", "strokeWidth": 2, "rotation": 0, "opacity": 1 },
      "bindings": {} },
    { "uid": "Lcur", "name": "cursor", "type": "rect", "visible": true,
      "props": { "x": 340, "y": 60, "width": 8, "height": 80, "fill": "#32cd79", "cornerRadius": 4, "rotation": 0, "opacity": 1 },
      "bindings": { "x": { "mode": "size", "field": "pct", "min": 0, "max": 1 } } }
  ]
}
```
> 游标的 `props.x=340` 是"最右端"坐标；`size` 把 `pct`(0..1) 乘到 340 → 游标从 `x≈0` 横扫到 `x=340`。要留左边距就在外面套一个 `group` 整体偏移。

---

### H. SVG 图标 + 数值文本

```json
{
  "version": 1,
  "meta": { "id": "custom_icon_value", "name": "Icon + Value", "category": "chart", "icon": "", "width": 400, "height": 200 },
  "layers": [
    { "uid": "Lbg", "name": "bg", "type": "rect", "visible": true,
      "props": { "x": 0, "y": 0, "width": 400, "height": 200, "fill": "#23232e", "cornerRadius": 12, "rotation": 0, "opacity": 1 },
      "bindings": {} },
    { "uid": "Lico", "name": "icon", "type": "svg", "visible": true,
      "props": { "x": 30, "y": 68, "width": 64, "height": 64, "rotation": 0, "opacity": 1,
        "svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 1024 1024\" width=\"1024\" height=\"1024\"><path d=\"M512 96L96 928h832z\" fill=\"#32cd79\"/></svg>",
        "fill": "" },
      "bindings": {} },
    { "uid": "Lval", "name": "value", "type": "text", "visible": true,
      "props": { "x": 110, "y": 78, "text": "0", "fontSize": 48, "fontWeight": "black", "fill": "#ffffff", "textAlign": "left", "verticalAlign": "top", "rotation": 0, "opacity": 1 },
      "bindings": { "text": { "mode": "text", "field": "heart_rate", "decimal": 0 } } }
  ]
}
```
> `props.svg` 是**原始 SVG 代码**（≤ 10 KB，JSON 字符串里的 `"` 要写成 `\"`，**根标签必须带 `xmlns`**——手写时最容易漏，Studio 面板/属性框会自动补）；`props.fill` 留空 = 保留图标自带颜色，写 `#rrggbb` = 整体重着色（渲染时把 `fill`/`stroke` 一律改写）。正常路径不用手写 JSON：在 Studio 点 **Basic Elements → SVG Icon** 先落一个占位三角形，选中它后在右侧 **Properties → SVG code** 里把代码换掉（图标去 https://www.iconfont.cn/collections 找），Studio 会顺手做规范化、体积校验与按比例修正显示盒。

---

### 复用建议

- **换指标**：把 `field` 从 `heart_rate` 换成 `power`/`cadence`/`speed`，并同步换 `min`/`max`（见 [§03 字段与边界](#part-04) 的边界表）。
- **换配色**：改 `fill`/`stroke`（静态值），以及 `color` 模式里的 `thresholds[].color` 和 `base`。
- **改尺寸**：只动 `meta.width/height`，图层坐标按同样比例重排即可；运行时会自动缩放，不需要你换算像素。

自检清单见 → [§ 自检清单](#part-07)。

---
<a id="part-07"></a>

## CHECKLIST · AI 生成自检清单

给"离线生成 Component Spec JSON"的 AI 用的**逐条自检**。产出 JSON 前后各跑一遍。

---

### 生成流程（推荐配方）

1. 定 `meta`：起一个 `custom_` 前缀、只含 `[A-Za-z0-9_]` 的 `id`；选好 `category`；定 `width`/`height`（默认 400×200）。
2. 从底层往上排 `layers`：先背景/底槽，再数值/指针，最后文字。
3. 每个图层：写全 `props`（用 [§01 JSON 结构](#part-02) 的默认值当模板），给唯一 `uid`。
4. 需要数据驱动的，加 `bindings`：键=目标属性，值=`{mode, field, ...}`（对照 [§02 数据绑定](#part-03)）。
5. 归一化的，`min`/`max` 直接抄 [§03 字段与边界](#part-04) 边界表（数字或字段名）。
6. 跑下方"硬校验"，通过后交给用户 Import。

---

### 硬性检查（不满足则导入/注册失败）

- [ ] 顶层是**合法 JSON**，能被 `JSON.parse`（无注释、无尾逗号、字符串用双引号）。
- [ ] 有 `meta` 对象，且 `meta.id` 是**非空字符串**（注册加载要求 `meta.id`）。
- [ ] `meta.id` 只含 `[A-Za-z0-9_]`，建议 `custom_` 前缀，避免与内置组件撞 id。
- [ ] `meta.id` 不与已有组件重号：撞上内置/本地/本会话已注册的 id 时 Studio 会自动加后缀改名；公共库由服务端 `spec_id` 列拦截重号（非 `rejected` 行占着同一 id 则提交返 409 `duplicate_spec_id`）。
- [ ] `layers` 是**数组**。
- [ ] 每个 layer 有 `type`，且取值在 `rect|ellipse|arc|line|text|svg|image|group|path|polygon`。
- [ ] 同一 spec 内所有 `uid` **唯一、非空**。
- [ ] 每个图层有 `props` 对象（可为该类型默认值）。

### 结构检查（不满足会渲染异常/无法编辑）

- [ ] `bindings` 的每个**键**是该 `type` 的**可绑定属性**，且**mode** 在允许集合内（见 [§02 数据绑定](#part-03) BINDABLE 表）。
- [ ] `group` 图层才有 `children`；非 group 不要写 `children`。
- [ ] `arc` 显式写了 `closed:false`（否则圆头端帽失效）。
- [ ] `angle` 绑 `rotation` 时写了 `from`/`to`（否则退回 -210/30）。
- [ ] `svg` 图层的 `props.svg` **有代码且≤ 10 KB**（UTF-8 字节，按规范化后的结果算；超限为 error、直接阻断提交/导入）；Studio 里点 **SVG Icon** 先落占位三角形，代码在右侧 **Properties → SVG code** 里换，图标去 https://www.iconfont.cn/collections 找。
- [ ] 手写 `svg` 代码时根标签带 `xmlns="http://www.w3.org/2000/svg"`（进 `<img>` 的独立 SVG 没它什么都不画；Studio 属性框会帮你补，但直接拼 JSON 时容易漏）。
- [ ] `svg` 代码不含 `<script>`、`<foreignObject>`、`on…=` 事件处理器、`javascript:`（含则拒绝插入/落库）。`props.fill` 为空保持原色，非空为重着色。
- [ ] `image.url`（旧版图片图层）只可能是 `https://...` 或 `data:image/...;base64,...`（其它会被安全过滤掉）。
- [ ] 数值字段（`size`/`angle`/`opacity`/`visible` 的 `field`）不是字符串型时间字段（`elapsedTime` 等只配 `text`）。

### 语义检查（保证"动起来"符合预期）

- [ ] 进度/仪表的 `field` 与 `min`/`max` **单位一致**（别把速度 `paceMin/paceMax` 配给 `pace` 字段——用 `paceBoundMin/paceBoundMax`）。
- [ ] `size` 绑定的图层，其 `props` 里被绑的属性写的是**满量程**值（进度条 = 满条宽/高；游标 = 终点坐标）。
- [ ] `color` 绑定提供了 `base`（兜底色）和至少一档 `thresholds`，且 `gte` 覆盖目标数据范围。
- [ ] `text` 绑定：想固定单位用 `suffix`/`prefix`；想跟随用户单位设置用 `unit:true`（可带 `unitKey`）。
- [ ] 坐标都写在 `meta.width×height` 设计盒内，**没有**预先按显示尺寸缩放。

### 落地检查（交付给用户时附带说明）

- [ ] 告知：Import 到 `https://pulseframe.data4u.vip/studio/index.html` 即可预览；Save Local 存 `studio_comp_{id}`；Submit 走审核，弹窗里需先勾选授权声明（管理员可善意改稿、可能不发布；公开后任何人可用可二创），不想公开的引导到 Save Local / Export JSON。
- [ ] 若声明了 `editable` / 依赖 `styleOverrides`，确认 `uid`/`prop` 拼写与实际图层一致。

---

### 一键本地校验（可选，Node/浏览器控制台）

```js
function validateSpec(spec) {
  const errs = [];
  const TYPES = ['rect','ellipse','arc','line','text','svg','image','group','path','polygon'];
  const MODES = ['text','size','angle','color','opacity','visible'];
  const BINDABLE = {
    rect:['x','y','width','height','strokeWidth','cornerRadius','fill','stroke','rotation','opacity','visible'],
    ellipse:['x','y','width','height','strokeWidth','fill','stroke','rotation','opacity','visible'],
    arc:['endAngle','startAngle','stroke','strokeWidth','innerRadius','opacity'],
    line:['x','y','width','stroke','strokeWidth','rotation','opacity','visible'],
    text:['text','fill','x','y','fontSize','opacity','visible'],
    svg:['x','y','opacity','visible'],
    image:['x','y','opacity','visible'],
    group:['opacity'],
    path:[], polygon:[]
  };
  if (!spec || typeof spec !== 'object') return ['顶层必须是对象'];
  if (!spec.meta) errs.push('缺 meta');
  else {
    if (!spec.meta.id || !/^[A-Za-z0-9_]+$/.test(String(spec.meta.id))) errs.push('meta.id 非法（只允许 A-Za-z0-9_）');
  }
  if (!Array.isArray(spec.layers)) errs.push('layers 必须是数组');
  else {
    const uids = new Set();
    const walk = (arr) => arr.forEach(l => {
      if (!l || !l.uid) errs.push('图层缺 uid');
      else if (uids.has(l.uid)) errs.push('uid 重复: ' + l.uid); else uids.add(l.uid);
      if (!TYPES.includes(l.type)) errs.push('非法 type: ' + l.type);
      if (!l.props || typeof l.props !== 'object') errs.push(l.uid + ' 缺 props');
      if (l.type === 'arc' && l.props && l.props.closed === undefined) errs.push(l.uid + ' arc 建议 closed:false');
      const bd = BINDABLE[l.type] || [];
      Object.keys(l.bindings || {}).forEach(key => {
        const b = l.bindings[key];
        if (!bd.includes(key)) errs.push(`${l.uid}: 属性 ${key} 对 ${l.type} 不可绑定`);
        if (!MODES.includes(b && b.mode)) errs.push(`${l.uid}.${key}: 非法 mode ${b && b.mode}`);
        if (l.type === 'arc' && key === 'rotation') errs.push('arc 不支持 rotation 绑定');
        if (b && b.mode === 'angle' && key === 'rotation' && (b.from == null || b.to == null)) errs.push(`${l.uid}.rotation: angle 需 from/to`);
      });
      if (l.type === 'group' && Array.isArray(l.children)) walk(l.children);
    });
    walk(spec.layers);
  }
  return errs;
}
// 用法：console.log(validateSpec(JSON.parse(yourJsonText)));  // [] 即通过
```

> 这份校验器只是"更严格版"的自检，覆盖上面所有对勾项；Studio 本身对多数问题会容错或跳过，但**过了它 = 高质量、可维护、面板里可编辑**的组件。

---

### 速查表

| 我想做 | 怎么写 |
|---|---|
| 数字随数据变 | `text` 模式绑 `text`，选 `field`+`decimal`+`suffix`/`unit` |
| 进度条 | `rect` 的 `props.width`=满宽，`size` 绑 `width`+`field`+`min`/`max` |
| 环形仪表 | `arc` 的 `endAngle`，`angle` 绑 `field`+`min`/`max`+`from`/`to` |
| 指针/罗盘 | 图层 `rotation`，`angle` 绑 `azimuth`+`from:0,to:360` |
| 区间变色 | `fill`/`stroke`，`color` 绑 `field`+`thresholds`+`base` |
| 渐显/点亮 | `visible` 绑 `field`+`threshold` |
| 淡入淡出 | `opacity` 绑 `field`+`min`/`max` |
| 横扫游标 | `x`（或 `y`）用 `size` 绑 `pct`，`props.x`=终点 |
| 自适应满量程 | `min`/`max` 填**字段名**字符串（如 `"totalKm"`、`"heartRateMax"`） |


---

*全文结束。校验硬规则：能 `JSON.parse` + 有 `meta`（`id` 只含 `[A-Za-z0-9_]`）+ `layers` 是数组。*
