/**
 * CanvasManager.js - Leafer 画布实例生命周期管理
 *
 * 将 appview / frame / memoryApp / memoryFrame 等不可序列化的
 * Leafer 实例引用从 Store 中分离，独立管理。
 *
 * 好处：
 *   1. Store.reset() 不会误清画布实例
 *   2. Store.snapshot() 不会包含 DOM 引用
 *   3. 职责清晰：CanvasManager 管实例，Store 管状态
 */

import { eventBus, Events } from './EventBus.js';

class CanvasManager {
    constructor() {
        /** @type {object|null} 前端预览 App 实例 */
        this._appview = null;
        /** @type {object|null} 前端预览 Frame */
        this._frame = null;
        /** @type {object|null} 内存渲染 App 实例 */
        this._memoryApp = null;
        /** @type {object|null} 内存渲染 Frame */
        this._memoryFrame = null;
    }

    // ===== 前端预览实例 =====

    /**
     * 注册前端预览 App + Frame
     * @param {object} appview - Leafer App 实例
     * @param {object} frame   - 前端画布 Frame
     */
    initPreview(appview, frame) {
        this._appview = appview;
        this._frame = frame;
        console.log('[CanvasManager] Preview instances registered');
        eventBus.emit(Events.CANVAS_READY);
    }

    get appview() { return this._appview; }
    get frame() { return this._frame; }

    // ===== 内存渲染实例 =====

    /**
     * 注册内存渲染 App + Frame
     * @param {object} memoryApp   - 内存 Leafer App 实例
     * @param {object} memoryFrame - 内存 Leafer Frame
     */
    initMemory(memoryApp, memoryFrame) {
        this._memoryApp = memoryApp;
        this._memoryFrame = memoryFrame;
        console.log('[CanvasManager] Memory instances registered');
    }

    get memoryApp() { return this._memoryApp; }
    get memoryFrame() { return this._memoryFrame; }

    // ===== 兼容旧接口（过渡期可用） =====

    /**
     * @deprecated 使用 initPreview() 替代
     */
    set(key, value) {
        if (key === 'appview') this._appview = value;
        else if (key === 'frame') this._frame = value;
        else if (key === 'memoryApp') this._memoryApp = value;
        else if (key === 'memoryFrame') this._memoryFrame = value;
        else {
            console.warn(`[CanvasManager] Unknown key: ${key}`);
            return;
        }
        eventBus.emit(Events.CANVAS_READY);
    }

    /**
     * @deprecated 使用 getter 替代
     */
    get(key) {
        switch (key) {
            case 'appview':     return this._appview;
            case 'frame':       return this._frame;
            case 'memoryApp':   return this._memoryApp;
            case 'memoryFrame': return this._memoryFrame;
            default:
                console.warn(`[CanvasManager] Unknown key: ${key}`);
                return null;
        }
    }

    // ===== 工具方法 =====

    /**
     * 获取前端 frame 上所有有 id 的子组件
     * @returns {Array}
     */
    getActiveChildren() {
        if (!this._frame) return [];
        return this._frame.children.filter(c => c.id);
    }

    /**
     * 按组件 id 查找前端 frame 上的 Box
     * @param {string} componentId
     * @returns {object|null}
     */
    findBox(componentId) {
        if (!this._frame) return null;
        const found = this._frame.find('#' + componentId);
        return Array.isArray(found) ? found[0] : (found || null);
    }

    /**
     * 调整画布尺寸（横屏 1920x1080 / 竖屏 1080x1920 切换）
     * 同步前端预览 Frame、内存渲染 Frame 的尺寸，并将预览重新缩放适配到视口。
     * @param {number} width
     * @param {number} height
     */
    setCanvasSize(width, height) {
        if (!width || !height) return;

        if (this._frame) {
            this._frame.width = width;
            this._frame.height = height;
            if (typeof this._frame.update === 'function') this._frame.update();
        }
        if (this._memoryFrame) {
            this._memoryFrame.width = width;
            this._memoryFrame.height = height;
            if (typeof this._memoryFrame.update === 'function') this._memoryFrame.update();
        }

        // 重新把画布缩放到预览视口（同 app.js 初始化时的 zoom 适配）
        if (this._appview && this._appview.tree && typeof this._appview.tree.zoom === 'function') {
            this._appview.tree.zoom({ x: 0, y: 0, width, height }, [0, 0, 0, 0]);
        }

        console.log(`[CanvasManager] Canvas size → ${width}x${height}`);
    }

    /**
     * 销毁所有实例（页面卸载或重建画布时调用）
     */
    destroy() {
        if (this._appview && typeof this._appview.destroy === 'function') {
            this._appview.destroy();
        }
        if (this._memoryApp && typeof this._memoryApp.destroy === 'function') {
            this._memoryApp.destroy();
        }
        this._appview = null;
        this._frame = null;
        this._memoryApp = null;
        this._memoryFrame = null;
        console.log('[CanvasManager] All instances destroyed');
    }
}

// 单例导出
export const canvasManager = new CanvasManager();
