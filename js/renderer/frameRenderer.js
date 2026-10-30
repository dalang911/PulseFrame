/**
 * frameRenderer.js - 逐帧渲染编排器
 * 协调 LeaferManager + VideoEngine + ComponentUpdater 完成视频生成
 */

import { store } from '../core/Store.js';
import { eventBus, Events } from '../core/EventBus.js';
import { leaferManager } from './LeaferManager.js';
import { videoEngine } from './VideoEngine.js';
import { updateAllComponents } from '../components/updater.js';
import { normalizeVideoFps, VIDEO_DEFAULTS } from '../core/constants.js';
import { timeOfFrame } from '../data/frameSampling.js';

/**
 * 生成视频
 * @param {Object} options
 * @param {number} options.startFrame - 起始帧（秒空间，等于轨迹点下标）
 * @param {number} options.endFrame - 结束帧（秒空间，含）
 * @param {string} [options.videoFormat='mp4'] - 视频格式
 * @param {number} [options.fps] - 每秒帧数；1（默认）= 一个轨迹点独占 1 秒，
 *        N>1 时同一批点铺成 N 帧，**成片时长不变**（帧数 ÷ N 还是那些秒数），
 *        数值与游标按帧线性细化，见 js/data/frameSampling.js
 * @param {Function} [options.onProgress] - 进度回调 (current, total)，稠密帧口径
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
    // 帧率：入参优先，其次沿用弹窗上次选择，最后回落默认 1 秒 1 帧；越界在这里钳制
    const fps = normalizeVideoFps(options.fps != null ? options.fps
        : (store.get('videoFps') != null ? store.get('videoFps') : VIDEO_DEFAULTS.fps));
    const onProgress = options.onProgress || (() => {});

    store.set('startFrame', startFrame);
    store.set('endFrame', endFrame);
    store.set('videoFormat', videoFormat);
    store.set('videoFps', fps);

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
            videoFormat,
            fps
        });

        // 秒空间的帧数 = 升级前渲染的帧数；稠密后帧数 ×fps，但每帧只占 1/fps 秒，
        // 所以成片时长 = totalFrames × (1/fps) = totalSeconds，与升级前逐秒口径一致。
        const totalSeconds = endFrame - startFrame + 1;
        const totalFrames = totalSeconds * fps;
        const frameDuration = 1 / fps;
        console.log(`[FrameRenderer] 开始渲染 ${totalFrames} 帧 (${startFrame}~${endFrame}, ${videoFormat}, ${fps} 帧/秒, 时长 ${totalSeconds} 秒)`);

        // 逐帧渲染
        for (let i = 0; i < totalFrames; i++) {
            // 检查是否被中止
            if (!store.get('isRendering')) {
                throw new Error('Render aborted by user');
            }

            // 0. 稠密帧号 → 秒时刻（可含小数）。fps=1 时 t 就是整数帧号，与升级前逐位相同；
            //    末尾若干帧夹在 endFrame 上重复显示，那正是升级前「最后一帧独占 1 秒」的那段。
            const t = timeOfFrame(startFrame, i, fps, endFrame);

            // 1. 更新组件数据（内存实例）—— 传 t，插值发生在 updater 里
            updateAllComponents(t, true);

            // 2. 导出帧到 Canvas
            await leaferManager.exportFrame(targetCanvas);

            // 3. 添加到视频编码器（每帧 1/fps 秒；时间戳按 i/fps 取绝对值，不做累加）
            await videoEngine.addFrame(i / fps, frameDuration);

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
