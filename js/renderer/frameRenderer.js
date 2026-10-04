/**
 * frameRenderer.js - 逐帧渲染编排器
 * 协调 LeaferManager + VideoEngine + ComponentUpdater 完成视频生成
 */

import { store } from '../core/Store.js';
import { eventBus, Events } from '../core/EventBus.js';
import { leaferManager } from './LeaferManager.js';
import { videoEngine } from './VideoEngine.js';
import { updateAllComponents } from '../components/updater.js';

/**
 * 生成视频
 * @param {Object} options
 * @param {number} options.startFrame - 起始帧
 * @param {number} options.endFrame - 结束帧
 * @param {string} [options.videoFormat='mp4'] - 视频格式
 * @param {Function} [options.onProgress] - 进度回调 (current, total)
 * @returns {Promise<Blob>} 视频 Blob
 */
export async function generateVideo(options = {}) {
    const trkptData = store.get('trkptData');

    if (!trkptData || trkptData.length === 0) {
        throw new Error('No trackpoint data, cannot generate video');
    }

    if (store.get('isRendering')) {
        throw new Error('A video is already generating, please wait for it to finish or abort it first');
    }

    const maxFrame = trkptData.length;
    // 帧范围钳制到合法区间（endFrame 为索引，最大 maxFrame-1）
    let startFrame = Number.isFinite(options.startFrame)
        ? options.startFrame : (store.get('startFrame') || 0);
    let endFrame = Number.isFinite(options.endFrame)
        ? options.endFrame : (store.get('endFrame') ?? maxFrame - 1);
    startFrame = Math.max(0, Math.min(startFrame, maxFrame - 1));
    endFrame = Math.max(startFrame, Math.min(endFrame, maxFrame - 1));

    const videoFormat = options.videoFormat || store.get('videoFormat') || 'mp4';
    const onProgress = options.onProgress || (() => {});

    store.set('startFrame', startFrame);
    store.set('endFrame', endFrame);
    store.set('videoFormat', videoFormat);

    const canvasSize = store.get('canvasSize') || { width: 1920, height: 1080 };
    const targetCanvas = document.getElementById('videoCanvas');

    if (!targetCanvas) {
        throw new Error('videoCanvas not found');
    }

    // 确保内存实例已初始化
    leaferManager.initMemory();

    // 迁移前端对象到内存
    const migratedObjects = leaferManager.migrateToFrontend();
    if (migratedObjects.length === 0) {
        throw new Error('No exportable components on the canvas (background layer is excluded from video); please add components first');
    }

    store.set('isRendering', true);
    eventBus.emit(Events.RENDER_START);

    // 记录渲染前的预览帧，回滚后恢复画布显示
    const prevFrame = store.get('currentFrame') || 0;

    try {
        // 初始化编码器
        await videoEngine.initEncoder(targetCanvas, {
            width: canvasSize.width,
            height: canvasSize.height,
            videoFormat
        });

        const totalFrames = endFrame - startFrame + 1;
        console.log(`[FrameRenderer] 开始渲染 ${totalFrames} 帧 (${startFrame}~${endFrame}, ${videoFormat})`);

        // 逐帧渲染
        for (let i = 0; i < totalFrames; i++) {
            const currentFrame = startFrame + i;

            // 检查是否被中止
            if (!store.get('isRendering')) {
                throw new Error('Render aborted by user');
            }

            // 1. 更新组件数据（内存实例）
            updateAllComponents(currentFrame, true);

            // 2. 导出帧到 Canvas
            await leaferManager.exportFrame(targetCanvas);

            // 3. 添加到视频编码器（1秒/帧）
            await videoEngine.addFrame(i, 1);

            // 4. 进度回调
            onProgress(i, totalFrames);
            eventBus.emit(Events.RENDER_PROGRESS, { current: i, total: totalFrames });
        }

        // 完成编码
        const blob = await videoEngine.finalize();

        // 回滚前端对象
        setTimeout(() => {
            leaferManager.rollbackToFrontend(migratedObjects);
            leaferManager.clearMemory();
            eventBus.emit(Events.FRAME_UPDATE, prevFrame);
        }, 500);

        store.set('isRendering', false);
        return blob;

    } catch (err) {
        console.error('[FrameRenderer] Error:', err);
        videoEngine.abort();
        store.set('isRendering', false);

        // 回滚
        setTimeout(() => {
            leaferManager.rollbackToFrontend(migratedObjects);
            leaferManager.clearMemory();
            eventBus.emit(Events.FRAME_UPDATE, prevFrame);
        }, 500);

        throw err;
    }
}

/**
 * 中止渲染
 */
export function abortRender() {
    store.set('isRendering', false);
    videoEngine.abort();
}
