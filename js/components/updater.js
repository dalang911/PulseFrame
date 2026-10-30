/**
 * updater.js - 组件数据更新器
 * 替代原 updateLeaferData.js 的 if-else 逻辑
 * 根据每个注册组件的 update() 方法逐帧更新
 */

import { registry } from './registry.js';
import { store } from '../core/Store.js';
import { canvasManager } from '../core/CanvasManager.js';
import { eventBus, Events } from '../core/EventBus.js';
import { sampleFrame } from '../data/frameSampling.js';

/**
 * 更新前端画布上所有活跃组件的数据
 * @param {number} frameTime - 当前帧时刻（秒）。导出帧率 >1 时这里是小数，
 *        亚秒细化发生在 sampleFrame 里；预览与 1 秒 1 帧导出传的都是整数，行为逐位不变
 * @param {boolean} [updateMemory=true] - 是否同时更新内存实例
 */
export function updateAllComponents(frameTime, updateMemory = true) {
    const frame = canvasManager.frame;
    const memoryFrame = canvasManager.memoryFrame;
    const trkptData = store.get('trkptData');

    const raw = Number(frameTime);
    const time = Number.isFinite(raw) ? raw : 0;
    // currentFrame 继续是「秒空间整数下标」：回看最近 N 秒、按整公里倒扫、
    // currentFrame % 2 这类读取点因此不用改，加密帧率不会把它们的比例尺一起改掉
    const currentFrame = Math.floor(time);

    if (!frame || !trkptData || !trkptData[currentFrame]) return;

    // 整数时刻返回数组里的原对象（同一引用），小数时刻才现算插值点
    const frameData = sampleFrame(trkptData, time);
    const maxFrame = store.get('maxFrame');
    const progress = time / (maxFrame - 1 || 1);

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
                frameTime: time,
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
                    frameTime: time,
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
 * @param {number} frameTime - 帧时刻（秒，可为小数）
 */
export function updateComponent(componentId, frameTime) {
    const frame = canvasManager.frame;
    const trkptData = store.get('trkptData');

    const raw = Number(frameTime);
    const time = Number.isFinite(raw) ? raw : 0;
    const currentFrame = Math.floor(time);

    if (!frame || !trkptData || !trkptData[currentFrame]) return;

    const child = frame.findOne('#' + componentId);
    if (!child) return;

    const definition = registry.get(componentId);
    if (!definition || !definition.update) return;

    const frameData = sampleFrame(trkptData, time);
    const maxFrame = store.get('maxFrame');
    const progress = time / (maxFrame - 1 || 1);

    definition.update(child, frameData, progress, {
        trkptData,
        currentFrame,
        frameTime: time,
        maxFrame,
        chartData: store.get('chartData')
    });
}
