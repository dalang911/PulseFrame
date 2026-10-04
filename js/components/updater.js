/**
 * updater.js - 组件数据更新器
 * 替代原 updateLeaferData.js 的 if-else 逻辑
 * 根据每个注册组件的 update() 方法逐帧更新
 */

import { registry } from './registry.js';
import { store } from '../core/Store.js';
import { canvasManager } from '../core/CanvasManager.js';
import { eventBus, Events } from '../core/EventBus.js';

/**
 * 更新前端画布上所有活跃组件的数据
 * @param {number} currentFrame - 当前帧索引
 * @param {boolean} [updateMemory=true] - 是否同时更新内存实例
 */
export function updateAllComponents(currentFrame, updateMemory = true) {
    const frame = canvasManager.frame;
    const memoryFrame = canvasManager.memoryFrame;
    const trkptData = store.get('trkptData');

    if (!frame || !trkptData || !trkptData[currentFrame]) return;

    const frameData = trkptData[currentFrame];
    const maxFrame = store.get('maxFrame');
    const progress = currentFrame / (maxFrame - 1 || 1);

    // 遍历前端 frame 的子元素
    frame.children.forEach(child => {
        const componentId = child.id;
        if (!componentId) return;

        const definition = registry.get(componentId);
        if (!definition || !definition.update) return;

        try {
            definition.update(child, frameData, progress, {
                trkptData,
                currentFrame,
                maxFrame,
                chartData: store.get('chartData')
            });
        } catch (err) {
            console.error(`[Updater] Error updating ${componentId}:`, err);
        }
    });

    // 同步更新内存实例
    if (updateMemory && memoryFrame) {
        memoryFrame.children.forEach(child => {
            const componentId = child.id;
            if (!componentId) return;

            const definition = registry.get(componentId);
            if (!definition || !definition.update) return;

            try {
                definition.update(child, frameData, progress, {
                    trkptData,
                    currentFrame,
                    maxFrame,
                    chartData: store.get('chartData')
                });
            } catch (err) {
                // 静默处理内存更新错误
            }
        });
    }
}

/**
 * 更新单个组件
 * @param {string} componentId
 * @param {number} currentFrame
 */
export function updateComponent(componentId, currentFrame) {
    const frame = canvasManager.frame;
    const trkptData = store.get('trkptData');
    if (!frame || !trkptData || !trkptData[currentFrame]) return;

    const child = frame.findOne('#' + componentId);
    if (!child) return;

    const definition = registry.get(componentId);
    if (!definition || !definition.update) return;

    const frameData = trkptData[currentFrame];
    const maxFrame = store.get('maxFrame');
    const progress = currentFrame / (maxFrame - 1 || 1);

    definition.update(child, frameData, progress, {
        trkptData,
        currentFrame,
        maxFrame,
        chartData: store.get('chartData')
    });
}
