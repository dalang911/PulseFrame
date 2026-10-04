# 05 · 可直接复制的完整示例

以下每个 JSON 都**自成一体、可直接 Import**。设计坐标都写在 `400 × 200` 的盒子里（除特别说明）。
抄结构、改颜色和 `field`/边界即可产出新组件。

---

## A. 距离进度条（`size` 满量程 + 文本）

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

## B. 心率环形仪表（`arc` + `angle` 进度 + 居中数值）

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

## C. 大数值卡（配速，走单位系统）

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

## D. 心率区间色条（同一图层 `size` + `color` 双绑定）

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

## E. 指北针指针（`angle` → `rotation`）

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

## F. 里程碑点阵（`visible` 逐个点亮）

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

## G. 扫描游标（`size` → `x` 位置横扫）

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

## H. SVG 图标 + 数值文本

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

## 复用建议

- **换指标**：把 `field` 从 `heart_rate` 换成 `power`/`cadence`/`speed`，并同步换 `min`/`max`（见 [03_fields.md](03_fields.md) 的边界表）。
- **换配色**：改 `fill`/`stroke`（静态值），以及 `color` 模式里的 `thresholds[].color` 和 `base`。
- **改尺寸**：只动 `meta.width/height`，图层坐标按同样比例重排即可；运行时会自动缩放，不需要你换算像素。

自检清单见 → [CHECKLIST.md](CHECKLIST.md)。
