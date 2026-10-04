/**
 * visual/spec.js - 可视化组件 JSON Spec 模型与图层工厂
 *
 * Spec（组件契约）：
 *   {
 *     version: 1,
 *     meta: { id, name, category, icon, width, height },  // width/height = 组件默认盒尺寸
 *     layers: [ Layer ]                                     // 数组顺序 = 层叠顺序，index0 最底
 *   }
 *   Layer = {
 *     uid, name, type, visible,
 *     props: { ...直接映射 Leafer 元素属性... },
 *     bindings?: { <propKey>: Binding },                    // 把某属性绑定到数据字段
 *     children?: [Layer]                                    // 仅 group
 *   }
 *   Binding = { mode, field, min?, max?, from?, to?, decimal?, unit?, unitKey?, suffix?, thresholds? }
 *
 * 设计器与运行时（visualFactory）共用本模块的默认值 / 类型表 / uid 规则。
 */

// type → Leafer 元素 tag（arc 用 Ellipse 环形画法，与既有 gaugePanels 一致；
// path/polygon 仅供「前端仪表盘导入」透传，面板不手动插入这两种；
// svg 图标最终也是 Image（代码在渲染时转成 data:image/svg+xml URI），image 为旧版图片图层兼容）
export const LAYER_TAG = {
    rect: 'Rect',
    ellipse: 'Ellipse',
    arc: 'Ellipse',
    line: 'Line',
    text: 'Text',
    svg: 'Image',
    image: 'Image',
    group: 'Box',
    path: 'Path',
    polygon: 'Polygon'
};

// 设计器可插入的元素类型（image 已退出面板，仅为旧 spec 兼容保留）
export const ELEMENT_TYPES = ['rect', 'ellipse', 'arc', 'line', 'text', 'svg', 'image', 'group'];

let _uidSeed = 0;
/** 生成图层稳定唯一 id（同一次会话内递增 + 随机前缀，避免碰撞） */
export function makeUid(prefix = 'L') {
    _uidSeed += 1;
    return `${prefix}${Date.now().toString(36)}${_uidSeed.toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
}

/** 各类型的默认属性（Leafer 命名），作为新建图层初值与绑定基准尺寸来源 */
export function defaultProps(type) {
    switch (type) {
        case 'rect':
            return { x: 40, y: 40, width: 240, height: 60, fill: '#32cd79', cornerRadius: 0, rotation: 0, opacity: 1 };
        case 'ellipse':
            return { x: 40, y: 40, width: 160, height: 160, fill: '#32cd79', rotation: 0, opacity: 1 };
        case 'arc':
            // 环形/仪表：用 Ellipse 描边，fill 留空，靠 startAngle/endAngle 成弧
            // closed:false 必须：带 innerRadius 的角度 Ellipse 默认按闭合扇环渲染，封闭路径无 line cap，strokeCap:'round' 会失效（同 gaugePanels.js 环底写法）
            return {
                x: 40, y: 40, width: 200, height: 200,
                fill: null, innerRadius: 1, startAngle: -210, endAngle: 30, closed: false,
                stroke: '#32cd79', strokeWidth: 24, strokeCap: 'round', strokeAlign: 'center',
                rotation: 0, opacity: 1
            };
        case 'line':
            // Leafer Line：以 (x,y) 为起点、width 为长度的水平线，rotation 控制方向
            return { x: 40, y: 40, width: 240, stroke: '#ffffff', strokeWidth: 6, rotation: 0, opacity: 1 };
        case 'text':
            return {
                x: 40, y: 40, text: 'Text', fontSize: 40, fontWeight: 'black', fill: '#ffffff',
                textAlign: 'left', verticalAlign: 'top', resizeFontSize: false, rotation: 0, opacity: 1
            };
        case 'image':
            return { x: 40, y: 40, width: 160, height: 160, url: '', rotation: 0, opacity: 1 };
        case 'svg':
            // svg = 图标代码本体（插入时是占位三角形，在属性面板里替换）；fill = 可选重着色（空则保持原色）
            return { x: 40, y: 40, width: 64, height: 64, svg: DEFAULT_SVG_ICON, fill: '', rotation: 0, opacity: 1 };
        case 'group':
            return { x: 0, y: 0, rotation: 0, opacity: 1 };
        default:
            return { x: 0, y: 0, opacity: 1 };
    }
}

/**
 * 创建一个图层对象
 * @param {string} type - ELEMENT_TYPES 之一
 * @param {Object} [overrides] - { name, props, bindings, children, visible }
 */
export function makeLayer(type, overrides = {}) {
    const props = { ...defaultProps(type), ...(overrides.props || {}) };
    const layer = {
        uid: overrides.uid || makeUid(),
        name: overrides.name || type,
        type,
        visible: overrides.visible !== false,
        props,
        bindings: overrides.bindings || {}
    };
    if (type === 'group') layer.children = overrides.children || [];
    return layer;
}

/** 新建空组件 Spec */
export function createEmptySpec(meta = {}) {
    return {
        version: 1,
        meta: {
            id: meta.id || ('custom_' + Date.now().toString(36)),
            name: meta.name || 'Untitled component',
            category: meta.category || 'distance',
            icon: meta.icon || '',
            width: meta.width || 400,
            height: meta.height || 200
        },
        layers: []
    };
}

/**
 * arc 图层属性兜底：旧 spec / 前端导入的弧可能没写 closed，
 * 带 innerRadius 的角度 Ellipse 无 closed 会按闭合扇环渲染，strokeCap:'round' 失效。
 * 类型层面补 closed:false 即可（整圈 0..360 内外圈同时渲染，开放与闭合视觉一致）。
 */
export function normalizeArcProps(props) {
    if (props && props.closed === undefined && props.startAngle != null && props.endAngle != null) {
        props.closed = false;
    }
    return props;
}

/**
 * SVG 图标（type: svg）相关工具。
 *
 * 图标代码直接存在图层里（props.svg），渲染时序列化为 data:image/svg+xml;base64 交给 Leafer Image：
 * 不用上传图片、不依赖外链，也不会把 base64 塞进 spec；代码体积硬限制 SVG_MAX_BYTES（10 KB）。
 * 与前端 js/components/visual/spec.js 的同名实现保持一致（两份 runtime 同步）。
 */
export const SVG_MAX_BYTES = 10 * 1024;
const SVG_NS = 'http://www.w3.org/2000/svg';
const SVG_ICON_BOX = 64;      // 新插图标的默认显示盒长边（设计像素）

/** 点 SVG Icon 芯片先落一个占位图标（保证插上去就能看见），真代码在右侧属性里换 */
export const DEFAULT_SVG_ICON = `<svg xmlns="${SVG_NS}" viewBox="0 0 1024 1024" width="1024" height="1024"><path d="M512 96L96 928h832z" fill="#32cd79"/></svg>`;

/** UTF-8 字节数（10 KB 限制按字节算，中文/属性名都会占位） */
export function svgByteLength(str) {
    const s = String(str == null ? '' : str);
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(s).length;
    let n = 0;
    for (let i = 0; i < s.length; i++) {
        const c = s.charCodeAt(i);
        if (c < 128) n += 1;
        else if (c < 2048) n += 2;
        else if (c >= 0xd800 && c < 0xdc00) { n += 4; i++; }
        else n += 3;
    }
    return n;
}

/** 危险内容拦截：图标用不着脚本/内嵌 HTML/事件处理器（渲染时也会走 <img> 通道，双保险） */
function svgUnsafeReason(raw) {
    if (/<\s*script\b/i.test(raw)) return 'SVG contains a <script> element';
    if (/<\s*foreignObject\b/i.test(raw)) return 'SVG contains <foreignObject> (embedded HTML)';
    if (/\son[a-z]+\s*=\s*["']/i.test(raw)) return 'SVG contains an inline event handler (on…=)';
    if (/javascript\s*:/i.test(raw)) return 'SVG contains a javascript: URL';
    return '';
}

function fmtBytes(n) {
    return n < 1024 ? n + ' B' : (n / 1024).toFixed(1) + ' KB';
}

/** viewBox 优先，其次 width/height 属性；都拿不到按 1024×1024（iconfont 的常见画布） */
function svgBox(root) {
    const vb = String(root.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
    if (vb.length === 4 && vb[2] > 0 && vb[3] > 0) return { w: vb[2], h: vb[3] };
    const w = parseFloat(root.getAttribute('width')) || 0;
    const h = parseFloat(root.getAttribute('height')) || 0;
    if (w > 0 && h > 0) return { w, h };
    return { w: 1024, h: 1024 };
}

/**
 * 校验 + 规范化用户贴进来的 SVG 代码（去掉 p-id/t/class 等平台噪声，补齐 xmlns 与固有尺寸）。
 * 也接受只贴内部片段（<path .../> 之类），会自动包一层 svg。
 * @param {string} raw
 * @returns {{ok:boolean, error?:string, svg?:string, width?:number, height?:number, bytes?:number}}
 */
export function normalizeSvg(raw) {
    const text = String(raw == null ? '' : raw).trim();
    if (!text) return { ok: false, error: 'No SVG code' };
    const unsafe = svgUnsafeReason(text);
    if (unsafe) return { ok: false, error: unsafe + ' (not allowed)' };
    const body = /<svg[\s>]/i.test(text) ? text : `<svg xmlns="${SVG_NS}" viewBox="0 0 1024 1024">${text}</svg>`;
    let root;
    try {
        const doc = new DOMParser().parseFromString(body, 'image/svg+xml');
        if (doc.querySelector('parsererror')) return { ok: false, error: 'SVG code is not well-formed XML' };
        root = doc.documentElement;
    } catch (e) { return { ok: false, error: 'Failed to parse SVG: ' + e.message }; }
    if (!root || !/svg/i.test(root.nodeName)) return { ok: false, error: 'Not an <svg> element' };

    root.removeAttribute('p-id');
    root.removeAttribute('t');
    root.removeAttribute('class');
    if (root.querySelectorAll) {
        root.querySelectorAll('[p-id],[t],.icon').forEach(n => { n.removeAttribute('p-id'); n.removeAttribute('t'); n.removeAttribute('class'); });
    }
    root.setAttribute('xmlns', SVG_NS);
    const box = svgBox(root);
    // 只有 viewBox 的 svg 在 <img> 里会按 300×150 兜底解码，显式写回固有尺寸
    root.setAttribute('width', String(box.w));
    root.setAttribute('height', String(box.h));

    const svg = new XMLSerializer().serializeToString(root);
    const bytes = svgByteLength(svg);
    if (bytes > SVG_MAX_BYTES) return { ok: false, error: `SVG too large: ${fmtBytes(bytes)} (limit ${fmtBytes(SVG_MAX_BYTES)})` };
    return { ok: true, svg, width: box.w, height: box.h, bytes };
}

/**
 * 把图标里的死色（iconfont 复制出来常带 fill="#43464F"）统一换成指定色。
 * 只动 fill 属性与 style 里的 fill，none / url(...) 保持不变。
 */
export function recolorSvg(svg, color) {
    const s = String(svg || '');
    const c = String(color || '').trim();
    if (!s || !/^#[0-9a-f]{3,8}$/i.test(c)) return s;
    return s
        .replace(/\bfill\s*=\s*(["'])([^"']*)\1/gi, (m, q, v) => (v === 'none' || /^url\(/i.test(v) ? m : `fill=${q}${c}${q}`))
        .replace(/\bfill\s*:\s*(?!none)(?:#[0-9a-f]{3,8}\b|currentColor)/gi, `fill:${c}`);
}

/** 兜底补 xmlns：进 <img> 的独立 SVG 没它解不出命名空间（什么都不画），手写/导入的代码经常漏 */
function ensureSvgNs(svg) {
    return svg.replace(/<svg(?![^>]*\bxmlns\s*=)/i, `<svg xmlns="${SVG_NS}"`);
}

/** SVG 代码 → data:image/svg+xml;base64 URI（Leafer 按前缀识别为 svg 并解码） */
export function svgToDataUri(svg) {
    const s = ensureSvgNs(String(svg || ''));
    if (!s) return '';
    try {
        if (typeof TextEncoder !== 'undefined') {
            const bytes = new TextEncoder().encode(s);
            let bin = '';
            for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
            return 'data:image/svg+xml;base64,' + btoa(bin);
        }
        return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(s)));
    } catch (e) {
        console.warn('[spec] svgToDataUri failed:', e);
        return '';
    }
}

/** svg 图层 props → Leafer Image props（svg/fill 合成 url，两个中间键不下发） */
export function resolveSvgProps(props) {
    const out = { ...(props || {}) };
    const url = svgToDataUri(recolorSvg(out.svg, out.fill));
    delete out.svg;
    delete out.fill;
    out.url = url;
    return out;
}

/** 按 viewBox 比例算显示盒：长边默认 64 设计像素，传入当前长边则只改比例不改大小 */
export function svgIconBox(w, h, longSide) {
    const bw = Number(w) || 1, bh = Number(h) || 1;
    const box = Number(longSide) > 0 ? Number(longSide) : SVG_ICON_BOX;
    const k = box / Math.max(bw, bh);
    return { width: Math.max(1, Math.round(bw * k)), height: Math.max(1, Math.round(bh * k)) };
}

/**
 * 把一个图层转换为 Leafer 元素配置对象（build 用；group 递归 children）
 * @param {Layer} layer
 */
export function layerToElement(layer) {
    const tag = LAYER_TAG[layer.type] || 'Rect';
    const props = layer.type === 'svg' ? resolveSvgProps(layer.props) : (layer.props || {});
    const el = { tag, id: layer.uid, visible: layer.visible !== false };
    // 复制属性（过滤 null / undefined）
    Object.keys(props).forEach(k => {
        const v = props[k];
        if (v !== null && v !== undefined) el[k] = v;
    });
    if (layer.type === 'arc') normalizeArcProps(el);
    if (layer.type === 'group') {
        el.children = (layer.children || []).map(layerToElement);
    }
    return el;
}

/**
 * 递归展平所有图层（含 group 子层），返回 Layer 数组，供 update 建 uid 索引
 * @param {Layer[]} layers
 */
export function flattenLayers(layers) {
    const out = [];
    const walk = (arr) => {
        arr.forEach(layer => {
            out.push(layer);
            if (layer.type === 'group' && Array.isArray(layer.children)) walk(layer.children);
        });
    };
    walk(layers || []);
    return out;
}

/** 从 spec 收集用到的数据字段（用于 dataBindings 元信息） */
export function collectBindings(spec) {
    const fields = new Set();
    flattenLayers(spec.layers).forEach(layer => {
        Object.values(layer.bindings || {}).forEach(b => {
            if (b && b.field) fields.add(b.field);
            if (b && b.max) fields.add(String(b.max));
            if (b && b.min) fields.add(String(b.min));
        });
    });
    return [...fields];
}
