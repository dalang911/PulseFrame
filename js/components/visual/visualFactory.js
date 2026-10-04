/**
 * visual/visualFactory.js - 把可视化 Spec 转为符合 registry schema 的组件定义
 *
 * 产出的定义与手写组件完全等价：
 *   build(config, data)  → 图层树（Leafer 元素配置数组，含 group 嵌套）
 *   update(box, frameData, progress, ctx) → 按 uid 命中元素，逐条应用绑定
 *
 * 这样设计器保存/发布的组件即可被主编辑器 addComponentToCanvas / updater / 视频导出复用。
 */

import { registry } from '../registry.js';
import { layerToElement, flattenLayers, collectBindings } from './spec.js';
import { applyLayerBindings } from './bindingEngine.js';

/** 依据 spec 生成右侧属性面板用的 settings（MVP：标题 + 可选作者声明的可编辑项） */
function buildSettings(spec) {
    const settings = [{ name: spec.meta.name || 'Custom', type: 'title' }];
    (spec.editable || []).forEach(item => {
        if (!item || !item.key) return;
        settings.push({
            name: item.label || item.key,
            key: item.key,        // 走 config 覆盖通道（layout 之外的键触发重建，见 PropertyRenderer）
            type: item.type || 'color'
        });
    });
    return settings;
}

/**
 * Spec → 组件定义
 * @param {Object} spec
 * @returns {Object} registry 定义
 */
export function specToDefinition(spec) {
    // uid → layer 索引（展平，含 group 子层），供 update 命中
    const layerByUid = {};
    flattenLayers(spec.layers).forEach(l => { layerByUid[l.uid] = l; });
    // 设计基准尺寸：图层 props 均按此书写，与建盒时用的默认尺寸一致
    const designW = spec.meta.width || 400;
    const designH = spec.meta.height || 200;

    return {
        id: spec.meta.id,
        name: spec.meta.name,
        category: spec.meta.category,
        icon: spec.meta.icon,
        isVisual: true,
        spec,                                   // 保留原始 spec，供设计器回读编辑
        defaultConfig: {
            x: 0, y: 0,
            width: designW,
            height: designH
        },
        dataBindings: collectBindings(spec),
        settings: buildSettings(spec),

        build(config, data) {
            // config 覆盖里的可编辑项（作者声明）合并到对应图层属性，实现"属性面板改样式"
            const overrides = config && config.styleOverrides ? config.styleOverrides : {};
            return spec.layers.map(layer => {
                const el = layerToElement(applyStyleOverride(layer, overrides));
                return el;
            });
        },

        update(box, frameData, progress, ctx) {
            if (!box || !box.children) return;
            // 当前容器尺寸 ÷ 设计尺寸 = 子元素实际缩放比（拖拽/面板改 W、H 都反映在 box.width/height 上），
            // 供 size 绑定换算基准，避免进度条按变形前的长度回写
            const scale = {
                x: designW > 0 && box.width ? Number(box.width) / designW : 1,
                y: designH > 0 && box.height ? Number(box.height) / designH : 1
            };
            const env = { frameData, ctx, progress, scale };
            walkAndBind(box.children, layerByUid, env);
        }
    };
}

/** 把 config.styleOverrides[uid][prop] 合入图层（不改原 spec，返回浅拷贝图层） */
function applyStyleOverride(layer, overrides) {
    const ov = overrides[layer.uid];
    if (!ov) {
        if (layer.type === 'group' && Array.isArray(layer.children)) {
            return { ...layer, children: layer.children.map(c => applyStyleOverride(c, overrides)) };
        }
        return layer;
    }
    const merged = { ...layer, props: { ...layer.props, ...ov } };
    if (layer.type === 'group' && Array.isArray(layer.children)) {
        merged.children = layer.children.map(c => applyStyleOverride(c, overrides));
    }
    return merged;
}

/** 递归遍历 Leafer 元素树，按 id 命中图层并应用绑定 */
function walkAndBind(children, layerByUid, env) {
    for (const el of children) {
        if (!el) continue;
        const layer = el.id ? layerByUid[el.id] : null;
        if (layer) applyLayerBindings(el, layer, env);
        if (el.children && el.children.length) walkAndBind(el.children, layerByUid, env);
    }
}

/**
 * 注册一个可视化组件（若已存在同 id 会由 registry 覆盖并告警）
 * @param {Object} spec
 */
export function registerVisualComponent(spec) {
    if (!spec || !spec.meta || !spec.meta.id) {
        console.warn('[visualFactory] invalid spec, skip register');
        return null;
    }
    const def = specToDefinition(spec);
    registry.register(def);
    return def;
}
