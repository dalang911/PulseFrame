/**
 * factory.js - 组件工厂
 * 根据组件定义 + 配置 JSON 创建 Leafer Box 实例
 */

import { registry } from './registry.js';
import { updateComponent } from './updater.js';
import { store } from '../core/Store.js';
import { canvasManager } from '../core/CanvasManager.js';
import { eventBus, Events } from '../core/EventBus.js';

const { Box } = window.LeaferUI;
// 注意：leafer web 包不导出 PointerEvent（与浏览器原生全局冲突），事件名用字符串 'pointer.down'

// 已移除组件的配置缓存（用于恢复尺寸/位置）
const _removedComponentsCache = new Map();

/**
 * 根据组件定义创建一个 Leafer Box 实例
 * @param {string} componentId - 组件注册 ID
 * @param {Object} [configOverrides] - 配置覆盖（位置/颜色等）
 * @returns {Box|null} Leafer Box 实例，或注册表无此组件时返回 null
 */
export function createComponent(componentId, configOverrides = {}) {
    const definition = registry.get(componentId);
    if (!definition) {
        console.warn(`[Factory] Unknown component: ${componentId}`);
        return null;
    }

    // 合并默认配置与覆盖配置
    const config = deepMerge({}, definition.defaultConfig, configOverrides);

    // 背景层锁定：editable=false 使编辑器忽略它（不可拖拽/缩放/选中），
    // 但 pointer.down 命中事件仍会触发下面的选中回调 → 弹出设置菜单
    const isLocked = !!definition.lockAsBackground;
    const isBg = !!definition.isBackground;

    // 组件子元素的内部坐标大多按「默认尺寸」设计（build 不随 config.width 缩放）。
    // 交互拖拽改尺寸时靠 Box.resizeChildren 运行时缩放子元素，但该缩放不回写 build，
    // 因此载入模板/恢复时：先按默认尺寸构建子元素，再 resize 到目标尺寸等比缩放子元素，
    // 复现拖拽后的效果（否则外框变了、里面的成员宽高不变）。背景层按目标尺寸直接铺满，不缩放。
    const defW = definition.defaultConfig?.width || config.width || 200;
    const defH = definition.defaultConfig?.height || config.height || 100;
    const targetW = config.width || defW;
    const targetH = config.height || defH;
    const baseW = isBg ? targetW : defW;
    const baseH = isBg ? targetH : defH;

    // 调用 build 函数获取 children（背景按目标尺寸，其它按默认几何）
    const children = definition.build({ ...config, width: baseW, height: baseH }, store.get('processedData'));

    // 创建 Box（先落在基准尺寸）
    const box = new Box({
        id: componentId,
        x: config.x || 0,
        y: config.y || 0,
        width: baseW,
        height: baseH,
        rotation: config.rotation || 0,  // 整体旋转（如竖排标尺 zs8_distance_pan），默认 0
        fill: config.fill,           // 面板底色（无则透明）
        lockRatio: true,
        editable: !isLocked,         // 背景层不可编辑（锁定）
        hitBox: true,
        cornerRadius: config.cornerRadius || 0,
        stroke: config.stroke,       // Box 级描边（web 地图外圈，无则不设）
        strokeWidth: config.strokeWidth,
        overflow: config.overflow,   // 'hide' 时子元素随圆角裁剪（圆形地图）
        resizeChildren: true,
        children: children
    });

    // 非背景组件：目标尺寸≠基准时 resize 到目标，等比缩放子元素
    // （resizeWidth/resizeHeight 缺失时退化为直接赋值 width/height，resizeChildren 仍会自动缩放）
    if (!isBg) {
        if (typeof box.resizeWidth === 'function') box.resizeWidth(targetW);
        else box.width = targetW;
        if (typeof box.resizeHeight === 'function') box.resizeHeight(targetH);
        else box.height = targetH;
    }

    // 保存合并后的配置，供右侧编辑面板读取/修改（同老款程序 json.set 机制）
    box.__leaferConfig = config;

    // 绑定点击→选中事件（显式 .on，不依赖 config.event，避免 PointerEvent 未导出导致失效）
    if (typeof box.on === 'function') {
        box.on('pointer.down', () => {
            eventBus.emit(Events.COMPONENT_SELECTED, componentId);
        });
    }

    return box;
}

/**
 * 将组件添加到前端画布
 * @param {string} componentId
 * @param {Object} [configOverrides]
 * @returns {Box|null}
 */
export function addComponentToCanvas(componentId, configOverrides = {}) {
    const frame = canvasManager.frame;
    if (!frame) {
        console.error('[Factory] Frame not initialized');
        return null;
    }

    // 未上传数据时禁止添加（同老款程序）
    const trkpt = store.get('trkptData');
    if (!trkpt || trkpt.length === 0) {
        console.warn('[Factory] No data loaded, cannot add component');
        return null;
    }

    // 同一组件只能添加 1 个（id 绑定的必要约束）
    const active = store.get('activeComponents') || [];
    if (active.some(c => c.id === componentId)) {
        console.log(`[Factory] Component "${componentId}" already exists (single-instance)`);
        return null;
    }

    // 如果有缓存的移除前配置（尺寸/位置），优先使用，否则使用传入的 overrides
    const cachedConfig = _removedComponentsCache.get(componentId);
    const finalOverrides = cachedConfig ? { ...cachedConfig, ...configOverrides } : configOverrides;
    const box = createComponent(componentId, finalOverrides);
    if (!box) return null;

    // 恢复成功后清除缓存
    if (cachedConfig) {
        _removedComponentsCache.delete(componentId);
    }

    frame.add(box);

    // 若数据已加载，立即按当前帧刷新一次，避免新组件停在占位值
    const currentFrame = store.get('currentFrame');
    if (currentFrame != null) {
        updateComponent(componentId, currentFrame);
    }

    // 记录到 activeComponents
    active.push({ id: componentId, config: configOverrides });
    store.set('activeComponents', active);

    eventBus.emit(Events.COMPONENT_ADDED, { id: componentId, box });

    return box;
}

/**
 * 初始化背景层：将 appv_bg_pan 添加为画布最底层（唯一，不参与视频导出）
 * 参照老款程序：huitu() 中 frame.add(appv_bg_pan) 默认置于最底层作为预览参考背景
 * @returns {Box|null}
 */
export function initBackgroundLayer() {
    const frame = canvasManager.frame;
    if (!frame) {
        console.error('[Factory] Frame not initialized');
        return null;
    }

    // 已存在背景层则不重复添加
    const existing = frame.children && frame.children.find(c => c.id === 'appv_bg_pan');
    if (existing) return existing;

    const box = createComponent('appv_bg_pan');
    if (!box) return null;

    frame.add(box);
    // 置于最底层（Leafer DisplayList 提供 bottom()）
    if (typeof box.bottom === 'function') box.bottom();

    // 注意：背景层不写入 activeComponents，视频导出时按 excludeFromVideo 过滤
    return box;
}

/**
 * 调整背景层尺寸（横竖屏切换时填满新画布）
 * 保留用户自定义的背景色/背景图，仅重设 width/height。
 * @param {number} width
 * @param {number} height
 * @returns {Box|null}
 */
export function resizeBackground(width, height) {
    const frame = canvasManager.frame;
    if (!frame) return null;

    const existing = frame.children && frame.children.find(c => c.id === 'appv_bg_pan');
    // 保留已有自定义配置（背景色/图），只换尺寸
    const keepConfig = existing && existing.__leaferConfig ? { ...existing.__leaferConfig } : {};
    if (existing) frame.remove(existing);

    const box = createComponent('appv_bg_pan', { ...keepConfig, width, height });
    if (!box) return null;

    frame.add(box);
    if (typeof box.bottom === 'function') box.bottom();
    return box;
}

/**
 * 清空画布上所有用户添加的组件（背景层除外），重置为初始状态
 * 用于切换画布比例时重置画布。
 */
export function clearAllComponents() {
    const frame = canvasManager.frame;
    if (frame) {
        // slice() 复制一份，避免遍历时 children 变化
        frame.children
            .filter(c => c.id && c.id !== 'appv_bg_pan')
            .slice()
            .forEach(c => {
                frame.remove(c);
                eventBus.emit(Events.COMPONENT_REMOVED, c.id); // 让地图等副作用层清理实例
            });
    }
    store.set('activeComponents', []);
    // 同步清空内存渲染实例上的组件（避免残留导出旧内容）
    const memoryFrame = canvasManager.memoryFrame;
    if (memoryFrame) {
        memoryFrame.children
            .filter(c => c.id && c.id !== 'appv_bg_pan')
            .slice()
            .forEach(c => memoryFrame.remove(c));
    }
}

/**
 * 从画布移除组件
 * @param {string} componentId
 */
export function removeComponentFromCanvas(componentId) {
    const frame = canvasManager.frame;
    if (!frame) return;

    // LeaferUI 用 '#' 前缀做 id 查找
    const child = frame.findOne('#' + componentId);
    if (child) {
        // 移除前保存当前配置到缓存，以便再次添加时恢复
        // 重要：使用 Box 对象的实际尺寸（可能被用户拖拽改变），而不是 __leaferConfig 里的旧值
        if (child.__leaferConfig) {
            const actualConfig = { ...child.__leaferConfig };
            // 覆盖为 Box 当前的实际尺寸/位置
            actualConfig.x = child.x;
            actualConfig.y = child.y;
            actualConfig.width = child.width;
            actualConfig.height = child.height;
            _removedComponentsCache.set(componentId, actualConfig);
        }
        frame.remove(child);
    }

    // 从 activeComponents 移除
    const active = store.get('activeComponents') || [];
    store.set('activeComponents', active.filter(c => c.id !== componentId));

    // 刷新当前帧画布
    const currentFrame = store.get('currentFrame');
    if (currentFrame != null) {
        eventBus.emit(Events.FRAME_UPDATE, currentFrame);
    }

    eventBus.emit(Events.COMPONENT_REMOVED, componentId);
}

/**
 * 深合并对象（简单版）
 */
function deepMerge(target, ...sources) {
    for (const source of sources) {
        if (!source) continue;
        for (const key of Object.keys(source)) {
            if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                if (!target[key]) target[key] = {};
                deepMerge(target[key], source[key]);
            } else {
                target[key] = source[key];
            }
        }
    }
    return target;
}
