/**
 * CanvasResizer.js - 画布尺寸（横屏 / 竖屏）切换编排
 *
 * 统一处理一次「改画布尺寸」需要同步的所有环节：
 *   1. CanvasManager：前端预览 Frame + 内存渲染 Frame 尺寸 + 预览重适配
 *   2. Store：canvasSize（视频导出 / 模板序列化的真值来源）
 *   3. DOM：#canv / #videoCanvas 导出画布元素尺寸
 *   4. 背景层：填满新尺寸（保留用户自定义背景）
 *   5. 逐帧刷新组件
 *   6. 广播 CANVAS_RESIZE 事件
 */

import { store } from '../core/Store.js';
import { canvasManager } from '../core/CanvasManager.js';
import { eventBus, Events } from '../core/EventBus.js';
import { CANVAS_PRESETS } from '../core/constants.js';
import { resizeBackground, clearAllComponents } from '../components/factory.js';
import { settingsPanel } from './SettingsPanel.js';

/**
 * 应用一个具体尺寸到画布
 * 语义：切换画布比例 = 重置画布（同初始化），会清空已添加的组件。
 * @param {{width:number, height:number}} size
 */
export function applyCanvasSize(size) {
    if (!size || !size.width || !size.height) return;
    const { width, height } = size;

    // 1. 双实例 Frame 尺寸 + 预览重适配
    canvasManager.setCanvasSize(width, height);

    // 2. 真值来源：视频导出与模板序列化都读这里
    store.set('canvasSize', { width, height });

    // 3. 同步导出用的 canvas 元素尺寸
    ['canv', 'videoCanvas'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) {
            el.width = width;
            el.height = height;
        }
    });

    // 4. 清空所有已添加组件（背景层除外）——避免旧坐标在新比例下错位跑到画布后面
    clearAllComponents();

    // 5. 背景层填满新画布（保留背景色/图）
    resizeBackground(width, height);

    // 6. 右侧设置面板重置（选中组件已被移除）
    if (settingsPanel && typeof settingsPanel.clear === 'function') {
        settingsPanel.clear();
    }

    // 7. 广播
    eventBus.emit(Events.CANVAS_RESIZE, { width, height });
}

/**
 * 按预设比例切换横竖屏
 * @param {string} ratio - '16:9'（横屏）或 '9:16'（竖屏）
 * @returns {boolean} 是否实际发生了切换
 */
export function applyRatio(ratio) {
    const size = CANVAS_PRESETS[ratio];
    if (!size) {
        console.warn(`[CanvasResizer] Unknown ratio preset: ${ratio}`);
        return false;
    }
    // 已是当前比例则不重复切换（避免误清空画布）
    const cur = store.get('canvasSize') || {};
    if (cur.width === size.width && cur.height === size.height) {
        return false;
    }
    applyCanvasSize(size);
    return true;
}
