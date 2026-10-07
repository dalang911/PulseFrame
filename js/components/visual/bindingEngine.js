/**
 * visual/bindingEngine.js - 数据字段 → Leafer 元素属性的绑定引擎（可插拔 mode）
 *
 * 每个 binding 形如 { mode, field, ...params }，mode 决定把解析出的值写到元素的哪个属性上。
 * MVP 支持：text / size / angle / color / opacity / visible。
 * 新增可视化能力（如 points 折线）只需在 MODES 里注册一个 mode，无需改动工厂。
 */

import { unitConfig } from '../../core/UnitConfig.js';
import { speedToPace } from '../../utils/format.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/**
 * 解析字段值。支持轨迹点字段、派生字段、chartData 极值/引用。
 * @param {string} field
 * @param {Object} frameData - 当前帧轨迹点
 * @param {Object} ctx - { trkptData, currentFrame, maxFrame, chartData }
 * @param {number} progress - 0..1
 */
export function fieldValue(field, frameData, ctx, progress) {
    if (!field) return 0;
    const cd = (ctx && ctx.chartData) || {};
    const trk = (ctx && ctx.trkptData) || [];
    const lastPt = trk.length ? trk[trk.length - 1] : {};

    switch (field) {
        case 'pct': return progress || 0;
        case 'km': return (frameData.distance || 0) / 1000;
        case 'pace': return speedToPace(frameData.speed || 0);
        case 'totalDistance': return lastPt.distance || 0;
        case 'totalKm': return (lastPt.distance || 0) / 1000;
        case 'duration': return lastPt.sec || 0;
        default:
            if (frameData && field in frameData) return frameData[field];
            if (field in cd) return cd[field];
            return 0;
    }
}

/** 解析 min/max 边界：数字直接用；字符串按字段引用解析 */
function resolveBound(v, frameData, ctx, progress) {
    if (typeof v === 'number') return v;
    if (typeof v === 'string') return fieldValue(v, frameData, ctx, progress);
    return null;
}

/** 归一化到 0..1 */
function normalize(value, min, max) {
    if (min == null) min = 0;
    if (max == null || max === min) return 0;
    return clamp((value - min) / (max - min), 0, 1);
}

// ===== mode 注册表：每个 mode 实现 apply(el, binding, layer, env) =====
/**
 * @param el - 目标 Leafer 元素
 * @param binding
 * @param layer - 图层（含设计基准 props）
 * @param env - { frameData, ctx, progress, propKey }
 */
export const MODES = {
    // 文本内容
    text(el, binding, layer, { frameData, ctx, progress }) {
        const raw = fieldValue(binding.field, frameData, ctx, progress);
        let str;
        if (binding.decimal != null && typeof raw === 'number') {
            str = raw.toFixed(binding.decimal);
        } else {
            str = String(raw);
        }
        if (binding.unit) {
            const key = binding.unitKey || binding.field;
            str = unitConfig.format(key, str);
        } else if (binding.suffix) {
            str = str + binding.suffix;
        }
        if (binding.prefix) str = binding.prefix + str;
        el.text = str;
    },

    // 尺寸（进度条/柱状）：以设计基准宽/高为满值，按 0..1 归一后乘
    // 可选 from/to（位置游标）：给定时改为线性映射 from + t*(to-from)，起点不再是固定 0（与 studio 引擎同步）
    size(el, binding, layer, { frameData, ctx, progress, scale }) {
        const propKey = binding.prop || 'width';
        let base = Number(layer.props[propKey]) || 0;
        // 图层 props 存的是「设计尺寸」下的基准；容器被 resize 后子元素由 Box.resizeChildren 等比放大，
        // 若不换算，进度条/定位等每帧都会回写成变形前的值（尺寸对了但条短一截、位置偏移）
        // 轴向：height / y 取 scale.y，其余（width / x / strokeWidth / cornerRadius / 半径）取 scale.x
        const isY = propKey === 'height' || propKey === 'y';
        if (scale) {
            const s = isY ? scale.y : scale.x;
            if (s && s !== 1) base *= s;
        }
        const v = fieldValue(binding.field, frameData, ctx, progress);
        const min = resolveBound(binding.min != null ? binding.min : 0, frameData, ctx, progress);
        const max = resolveBound(binding.max, frameData, ctx, progress);
        const ratio = normalize(v, min, max == null ? base : max);
        // max 未给定时：若字段本身是比例(0..1)直接用，否则按 totalDistance 等边界由调用方提供
        const t = binding.max == null ? clamp(v, 0, 1) : ratio;
        if (binding.from != null || binding.to != null) {
            // 游标映射：from=行程起点（缺省 0）、to=行程终点（缺省设计基准值）；
            // from/to 同为设计坐标，须与 base 一样按轴向缩放到变形后的 px 空间
            let from = binding.from != null ? Number(binding.from) : 0;
            let to = binding.to != null ? Number(binding.to) : base;
            if (scale) {
                const s = isY ? scale.y : scale.x;
                if (s && s !== 1) { from *= s; to *= s; }
            }
            el[propKey] = from + t * (to - from);
            return;
        }
        el[propKey] = base * t;
    },

    // 角度（环形仪表 endAngle）：值线性映射到 [from,to]
    angle(el, binding, layer, { frameData, ctx, progress }) {
        const propKey = binding.prop || 'endAngle';
        const from = binding.from != null ? binding.from : (layer.props.startAngle != null ? layer.props.startAngle : -210);
        const to = binding.to != null ? binding.to : (layer.props.endAngle != null ? layer.props.endAngle : 30);
        const v = fieldValue(binding.field, frameData, ctx, progress);
        const min = resolveBound(binding.min != null ? binding.min : 0, frameData, ctx, progress);
        const max = resolveBound(binding.max, frameData, ctx, progress);
        const ratio = normalize(v, min, max);
        el[propKey] = from + ratio * (to - from);
    },

    // 颜色（阈值分档）：thresholds=[{gte,color}]，取第一个 v>=gte 的档
    color(el, binding, layer, { frameData, ctx, progress }) {
        const propKey = binding.prop || 'fill';
        const v = fieldValue(binding.field, frameData, ctx, progress);
        const list = (binding.thresholds || []).slice().sort((a, b) => (b.gte || 0) - (a.gte || 0));
        let picked = binding.base || layer.props[propKey];
        for (const t of list) {
            if (v >= (t.gte != null ? t.gte : 0)) { picked = t.color; break; }
        }
        if (picked) el[propKey] = picked;
    },

    // 透明度
    opacity(el, binding, layer, { frameData, ctx, progress }) {
        const v = fieldValue(binding.field, frameData, ctx, progress);
        const min = resolveBound(binding.min != null ? binding.min : 0, frameData, ctx, progress);
        const max = resolveBound(binding.max != null ? binding.max : 1, frameData, ctx, progress);
        el.opacity = normalize(v, min, max);
    },

    // 显隐：v >= threshold 时显示
    visible(el, binding, layer, { frameData, ctx, progress }) {
        const v = fieldValue(binding.field, frameData, ctx, progress);
        const th = binding.threshold != null ? binding.threshold : 0;
        el.visible = !!layer._hiddenByUser === false && v >= th;
    }
};

/**
 * 对单个元素应用它的全部绑定
 * @param {Object} el - Leafer 元素
 * @param {Layer} layer
 * @param {Object} env - { frameData, ctx, progress }
 */
export function applyLayerBindings(el, layer, env) {
    const bindings = layer.bindings || {};
    Object.keys(bindings).forEach(propKey => {
        const binding = bindings[propKey];
        if (!binding || !binding.mode) return;
        const fn = MODES[binding.mode];
        if (!fn) return;
        try {
            fn(el, { prop: propKey, ...binding }, layer, env);
        } catch (e) {
            console.warn(`[bindingEngine] ${layer.uid}.${propKey} (${binding.mode}) error:`, e);
        }
    });
}
