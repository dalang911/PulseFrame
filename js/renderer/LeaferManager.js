/**
 * LeaferManager.js - Leafer 双实例管理器
 * 管理前端预览实例 + 内存渲染实例的生命周期
 * 替代原 index.html 中散落的初始化/迁移/回滚逻辑
 */

import { store } from '../core/Store.js';
import { canvasManager } from '../core/CanvasManager.js';
import { eventBus, Events } from '../core/EventBus.js';
import { DEFAULT_CANVAS, PREVIEW_SIZE } from '../core/constants.js';
import { registry } from '../components/registry.js';

const { Leafer, Frame } = window.LeaferUI;

class LeaferManager {
    constructor() {
        this._appview = null;
        this._frame = null;
        this._memoryApp = null;
        this._memoryFrame = null;
    }

    /**
     * 初始化前端预览 Leafer 实例
     */
    initFrontend() {
        if (this._appview) return this._appview;

        this._appview = new Leafer({
            view: 'appv',
            width: PREVIEW_SIZE,
            height: PREVIEW_SIZE,
            editor: {
                point: { size: 8 },
                middlePoint: { size: 6 },
                rotatePoint: { size: 8 },
                rect: { strokeWidth: 1, stroke: '#358DE6' },
                rotatable: true,
                scalable: true,
                dragable: true,
                select: true,
                multiSelect: true
            }
        });

        this._frame = new Frame({
            id: 'mainFrame',
            width: DEFAULT_CANVAS.width,
            height: DEFAULT_CANVAS.height,
            scale: PREVIEW_SIZE / DEFAULT_CANVAS.width
        });

        this._appview.add(this._frame);

        // 存入 CanvasManager
        canvasManager.initPreview(this._appview, this._frame);

        console.log('[LeaferManager] Frontend instance created');
        return this._appview;
    }

    /**
     * 初始化内存渲染 Leafer 实例（离屏）
     * 若 app.js 已创建并存入 store，则直接复用，避免重复实例化同一容器
     */
    initMemory() {
        const existingFrame = canvasManager.memoryFrame;
        if (existingFrame) {
            this._memoryFrame = existingFrame;
            this._memoryApp = canvasManager.memoryApp || this._memoryApp;
            return this._memoryApp;
        }

        if (this._memoryApp) return this._memoryApp;

        const container = document.getElementById('tempLeaferContainer');
        this._memoryApp = new Leafer({
            view: container,
            width: DEFAULT_CANVAS.width,
            height: DEFAULT_CANVAS.height
        });

        this._memoryFrame = new Frame({
            id: 'memoryFrame',
            width: DEFAULT_CANVAS.width,
            height: DEFAULT_CANVAS.height
        });

        this._memoryApp.add(this._memoryFrame);

        canvasManager.initMemory(this._memoryApp, this._memoryFrame);

        console.log('[LeaferManager] Memory instance created');
        return this._memoryApp;
    }

    /**
     * 将前端画布上的组件迁移到内存画布（用于视频渲染）
     * @returns {Array} 迁移的对象列表
     */
    migrateToFrontend() {
        // 优先使用本地缓存，否则从 CanvasManager 获取
        const frame = this._frame || canvasManager.frame;
        const memoryFrame = this._memoryFrame || canvasManager.memoryFrame;

        if (!frame || !memoryFrame) {
            console.error('[LeaferManager] Frame or memoryFrame missing, cannot migrate');
            return [];
        }

        const migrated = [];
        const children = [...frame.children];

        children.forEach(child => {
            if (!child.id) return;

            // 背景层等标记为 excludeFromVideo 的组件不参与视频渲染（同老款程序）
            const def = registry.get(child.id);
            if (def && def.excludeFromVideo) {
                console.log(`[LeaferManager] Skip video layer: ${child.id}`);
                return;
            }

            frame.remove(child);
            memoryFrame.add(child);
            migrated.push(child);
        });

        console.log(`[LeaferManager] Migrated ${migrated.length} objects to memory`);
        return migrated;
    }

    /**
     * 将内存画布上的对象回滚到前端画布
     * @param {Array} objects - 迁移时记录的对象列表
     */
    rollbackToFrontend(objects) {
        const frame = this._frame || canvasManager.frame;
        const memoryFrame = this._memoryFrame || canvasManager.memoryFrame;

        if (!frame || !memoryFrame) return;

        objects.forEach(obj => {
            if (obj && obj.id) {
                memoryFrame.remove(obj);
                frame.add(obj);
            }
        });

        console.log(`[LeaferManager] Rolled back ${objects.length} objects to frontend`);
    }

    /**
     * 清空内存画布
     */
    clearMemory() {
        const memoryFrame = this._memoryFrame || canvasManager.memoryFrame;
        if (memoryFrame) {
            memoryFrame.clear();
        }
    }

    /**
     * 从内存 Leafer 导出当前帧到目标 Canvas
     * @param {HTMLCanvasElement} targetCanvas
     * @returns {Promise<void>}
     */
    exportFrame(targetCanvas) {
        return new Promise((resolve, reject) => {
            const memoryFrame = this._memoryFrame || canvasManager.memoryFrame;

            if (!memoryFrame) {
                return reject(new Error('Memory frame not initialized'));
            }

            memoryFrame.export('canvas').then(result => {
                try {
                    const sourceCanvas = result.data.view;
                    const ctx = targetCanvas.getContext('2d', { alpha: true });

                    targetCanvas.width = targetCanvas.width; // 清空
                    ctx.drawImage(
                        sourceCanvas,
                        0, 0, sourceCanvas.width, sourceCanvas.height,
                        0, 0, targetCanvas.width, targetCanvas.height
                    );

                    resolve();
                } catch (err) {
                    reject(new Error(`Canvas draw error: ${err.message}`));
                }
            }).catch(err => {
                reject(new Error(`Frame export error: ${err.message}`));
            });
        });
    }

    // Getters
    get appview() { return this._appview || canvasManager.appview; }
    get frame() { return this._frame || canvasManager.frame; }
    get memoryApp() { return this._memoryApp || canvasManager.memoryApp; }
    get memoryFrame() { return this._memoryFrame || canvasManager.memoryFrame; }
}

// 单例导出
export const leaferManager = new LeaferManager();
