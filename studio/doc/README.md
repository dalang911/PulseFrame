# PulseFrame Studio — AI 生成手册

> 面向 AI 的离线说明书：**无需打开网页**，即可直接生成合法、可在 Studio 导入并正常工作的组件 JSON。

本目录把 PulseFrame Studio（仪表盘组件设计器）的数据契约拆解成可机械执行的规则。
只要你按这里的结构书写 JSON，Studio 就能 `Import` 它、在画布上渲染、并逐帧应用数据绑定。

> **代码块约定**：` ```json ` 围栏里都是**完整、可直接 Import 的 Component Spec**（已通过解析与结构校验）；
> ` ```jsonc ` 围栏里是**结构片段/局部示意**（可能含 `...` 省略号或 `//` 注释），只用于说明字段形状，**不能单独导入**。

## 这是什么

PulseFrame Studio 是一个**声明式**组件设计器：一个组件 = 一组 Leafer 图形图层（`layers`）
+ 把运动数据映射到图层属性的**数据绑定**（`bindings`）。**没有 JavaScript**，因此共享组件可安全自动加载。

- 本地文件：`studio/index.html`（仓库根目录）
- 线上访问：`https://pulseframe.data4u.vip/index.html`（Studio：`https://pulseframe.data4u.vip/studio/index.html`）
- 服务端 API（导入库/提交）：`https://sportsfile.data4u.vip/pages/server/api.php`
- 渲染引擎：Leafer Editor 2.2.11

## 阅读顺序

| 文件 | 内容 | 什么时候看 |
|---|---|---|
| [00_cheatsheet.md](00_cheatsheet.md) | 速查内核：硬校验、最小骨架、type/mode/BINDABLE、常用字段与边界、6 个高频坑 | 只想快速写对时先看它 |
| [01_spec_schema.md](01_spec_schema.md) | Component Spec 顶层结构、`meta`、`layers`、各图层类型的默认属性 `props`、校验规则 | 开始书写前必读 |
| [02_bindings.md](02_bindings.md) | 6 种绑定 `mode`（text/size/angle/color/opacity/visible）的参数、每种类型可绑定的属性表 | 要给图层加数据驱动时 |
| [03_fields.md](03_fields.md) | 全部可绑定字段 `field` key、派生量、极值/边界、`min/max` 引用规则、单位与前后缀 | 选字段、设边界时 |
| [04_workflow.md](04_workflow.md) | 工作机制：导入/导出、本地持久化、提交公共库、URL 访问与 API 端点、预览环境 | 想让用户生成的 JSON 落地时 |
| [05_examples.md](05_examples.md) | 可直接复制的完整示例（进度条/环形仪表/大数值卡/心率区间色条/罗盘/里程碑/扫描游标） | 抄结构改参数最快 |
| [CHECKLIST.md](CHECKLIST.md) | 生成前 / 生成后的逐项检查清单 | 每次产出 JSON 前后都跑一遍 |

> **另有一个单文件版 [ALL_IN_ONE.md](ALL_IN_ONE.md)**（约 1200 行 / 70 KB 量级，自包含、无跨文件跳转），
> 适合整份贴进对话窗口或塞进 system prompt。它是**产物，请勿手改**：
> 改上面任何一篇后运行 `python3 tools/build_docs_single.py` 重新生成（`--check` 可验证是否同步）。
> 分篇文件同时保留，供按文件名精确检索与向量库切片。
>
> 站点里顶栏的 **AI Handbook** 按钮就是这份单文件版的下载入口（`studio/js/HandbookDialog.js`，
> 弹窗正文是给使用者看的简版说明）。`studio/doc/` 是普通静态目录，**部署时必须一并带上**，
> 否则下载会 404（弹窗会探一次体量，拿不到就标红写明“manual not deployed”，不让人猜）。

## 30 秒上手：最小合法组件

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
校验只有一条硬性规则（见 [01_spec_schema.md](01_spec_schema.md)）：**必须有 `meta` 对象和 `layers` 数组**。

## 核心心智模型

1. **坐标写在设计尺寸里**：所有 `props.x/y/width/height` 都相对 `meta.width × meta.height` 这块设计画布。
   组件被放进任意大小的容器时，`visualFactory` 会按 `容器尺寸 / 设计尺寸` 等比缩放，你不用管像素换算。
2. **图层数组顺序 = 层叠顺序**：`layers[0]` 在最底，最后一个在最上。`group` 用 `children` 嵌套。
3. **绑定是"每帧重算"**：`props` 里写的是**设计基准值**（满量程/起始态）；绑定在预览和真实运行时按当前帧数据覆盖它。
4. **字段与边界解耦**：绑定用 `field` 取当前值，用 `min`/`max` 归一化；`min`/`max` 可以是数字，也可以是**另一个字段名**（如 `"max": "heartRateMax"`），让仪表按本次活动的真实极值缩放。
