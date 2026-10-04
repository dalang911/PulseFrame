/**
 * studio/FrontendGauges.js - 引入前端面板（video 制作页）已定义的仪表盘组件
 *
 * 来源：../../js/components/definitions/index.js 会把全部手写组件定义注册进
 * 前端自己的 registry 单例（与 studio 的 lib/registry.js 是两个实例，互不影响）。
 *
 * 转换：definition.build(defaultConfig, null) 产出 Leafer 元素配置树（tag: Text/Rect/Ellipse/...），
 * 这里把它逐层转成 studio 的 spec 图层（type: text/rect/arc/...，group 递归 children），
 * 插入画布后即可正常编辑属性/加数据绑定，再经「保存本地/提交组件库」另存为新组件。
 *
 * 说明：
 *   - 原组件的逐帧 update() 逻辑不随导入（studio 走 binding 体系，需重新绑定）；
 *   - 图表/标尺等「构建时依赖轨迹数据」的组件，在无数据环境下可能为空形或构建失败（已 try/catch 提示）；
 *   - 未识别 tag（Canvas 等）的子元素会跳过并提示。
 */

import { makeUid } from './runtime/spec.js';
import { specStore } from './SpecStore.js';

// 前端 Leafer tag → studio 图层 type；Ellipse 需按是否有角度参数分流 arc/ellipse
const TAG_TYPE = { Rect: 'rect', Text: 'text', Line: 'line', Image: 'image', Box: 'group', Path: 'path', Polygon: 'polygon' };

const CAT_ORDER = ['time', 'distance', 'map', 'chart', 'attr', 'text', 'cycling', 'theme'];
const CAT_LABELS = { time: 'Time', distance: 'Distance', map: 'Map', chart: 'Chart', attr: 'Attribute', text: 'Text', cycling: 'Cycling', theme: 'Theme', background: 'Background' };

let _promise = null;

/** 动态加载前端组件定义（模块级缓存，重复调用返回同一 promise） */
export function loadFrontendDefs() {
    if (!_promise) {
        _promise = (async () => {
            await import('../../js/components/definitions/index.js');   // 副作用：批量 registerAll
            const { registry } = await import('../../js/components/registry.js');
            const defs = Object.values(registry.getAll()).filter(d => d && d.id && typeof d.build === 'function' && d.category !== 'background');
            const byCat = {};
            defs.forEach(d => {
                const cats = [d.category, ...(Array.isArray(d.categories) ? d.categories : [])].filter(Boolean);
                cats.forEach(c => (byCat[c] = byCat[c] || []).push(d));
            });
            const categories = CAT_ORDER.filter(c => byCat[c]);
            Object.keys(byCat).forEach(c => { if (!categories.includes(c)) categories.push(c); });
            return { defs, byCat, categories, labels: CAT_LABELS };
        })();
        _promise.catch(() => { _promise = null; });   // 失败允许重试
    }
    return _promise;
}

function elToLayer(el, skipped) {
    if (!el || typeof el !== 'object' || !el.tag) return null;
    let type = null;
    if (el.tag === 'Ellipse') type = (el.startAngle != null || el.endAngle != null || el.innerRadius != null) ? 'arc' : 'ellipse';
    else type = TAG_TYPE[el.tag];
    if (!type) { skipped.push(String(el.name || el.id || el.tag)); return null; }

    const props = {};
    Object.keys(el).forEach(k => {
        if (k === 'tag' || k === 'children' || k === 'name') return;
        if (typeof el[k] === 'function') return;   // 防呆：不携带回调
        props[k] = el[k];
    });
    // 设计器变换提交依赖这几个数值属性
    if (typeof props.x !== 'number') props.x = 0;
    if (typeof props.y !== 'number') props.y = 0;
    if (typeof props.rotation !== 'number') props.rotation = 0;
    if (typeof props.opacity !== 'number') props.opacity = 1;

    const layer = { uid: makeUid(), name: el.name || (type === 'text' && el.text ? String(el.text).slice(0, 14) : null) || el.id || type, type, visible: props.visible !== false, props, bindings: {} };
    if (type === 'group') layer.children = (el.children || []).map(c => elToLayer(c, skipped)).filter(Boolean);
    return layer;
}

/** 把一个前端组件定义转成 studio 图层数组（顶层多元素包进一个 group） */
export function defToLayers(def) {
    const cfg = JSON.parse(JSON.stringify(def.defaultConfig || {}));
    if (typeof cfg.width !== 'number') cfg.width = 200;
    if (typeof cfg.height !== 'number') cfg.height = 100;
    const els = def.build({ ...cfg }, null) || [];   // data=null：按“无轨迹数据”默认形态构建
    const skipped = [];
    const layers = els.map(e => elToLayer(e, skipped)).filter(Boolean);
    return { layers, skipped, size: { width: cfg.width, height: cfg.height } };
}

/** 导入组件到当前画布（包成可整体拖动的 group）；失败抛异常由调用方提示 */
export function importDef(def) {
    const { layers, skipped, size } = defToLayers(def);
    if (!layers.length) throw new Error('No importable layers were generated');
    const group = {
        uid: makeUid(), name: def.name || def.id, type: 'group', visible: true,
        props: { x: 60, y: 60, width: size.width, height: size.height, rotation: 0, opacity: 1 },
        bindings: {}, children: layers
    };
    specStore.addLayers([group]);
    return { count: layers.length, skipped };
}
