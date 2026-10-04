/**
 * Canvas.js - 设计画布
 * 管理 Leafer Editor 实例，处理拖放、选择、移动、缩放等操作
 */

import { registry } from '../components/registry.js';
import { createComponent } from '../components/factory.js';

const CANVAS_SIZES = {
    '1920x1080': { width: 1920, height: 1080 },
    '1280x720': { width: 1280, height: 720 },
    '1080x1080': { width: 1080, height: 1080 },
    '1080x1920': { width: 1080, height: 1920 }
};

class Canvas {
    constructor() {
        this._leafer = null;
        this._frame = null;
        this._canvasSize = { width: 1920, height: 1080 };
        this._zoom = 0.5;
        this._onSelectCallback = null;
        this._onChangeCallback = null;
    }

    /**
     * 初始化画布
     * @param {HTMLElement|string} container - 挂载容器
     * @param {Object} options
     */
    init(container, options = {}) {
        const el = typeof container === 'string'
            ? document.querySelector(container)
            : container;

        if (!el) {
            console.error('[Canvas] Container not found');
            return;
        }

        const { Leafer, Frame } = window.LeaferUI;

        this._canvasSize = options.canvasSize || { width: 1920, height: 1080 };
        this._zoom = options.zoom || 0.5;

        // 创建 Leafer Editor 实例
        this._leafer = new Leafer({
            view: el,
            width: this._canvasSize.width * this._zoom,
            height: this._canvasSize.height * this._zoom,
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

        // 创建 Frame 容器
        this._frame = new Frame({
            id: 'designerFrame',
            width: this._canvasSize.width,
            height: this._canvasSize.height,
            scale: this._zoom,
            fill: '#1a1a2e'
        });
        this._leafer.add(this._frame);

        // 绑定编辑器事件
        this._bindEditorEvents();

        // 绑定画布拖放
        this._bindDrop(el);

        console.log('[Canvas] Initialized', this._canvasSize, 'zoom:', this._zoom);
    }

    /**
     * 绑定编辑器选择/变更事件
     */
    _bindEditorEvents() {
        const { editor } = this._leafer;
        if (!editor) return;

        // 选择事件
        editor.on('selection.change', (e) => {
            const selected = editor.list || [];
            if (this._onSelectCallback) {
                this._onSelectCallback(selected.length > 0 ? selected[0] : null);
            }
        });

        // 移动/缩放/旋转完成
        editor.on('selection.move.end', () => this._emitChange());
        editor.on('selection.resize.end', () => this._emitChange());
        editor.on('selection.rotate.end', () => this._emitChange());
    }

    /**
     * 绑定拖放（从组件面板拖入画布）
     */
    _bindDrop(el) {
        el.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
            el.classList.add('drag-over');
        });

        el.addEventListener('dragleave', () => {
            el.classList.remove('drag-over');
        });

        el.addEventListener('drop', (e) => {
            e.preventDefault();
            el.classList.remove('drag-over');

            const componentId = e.dataTransfer.getData('text/plain');
            if (!componentId) return;

            // 计算放置位置（考虑缩放）
            const rect = el.getBoundingClientRect();
            const x = Math.round((e.clientX - rect.left) / this._zoom);
            const y = Math.round((e.clientY - rect.top) / this._zoom);

            this.addComponent(componentId, { x, y });
        });
    }

    /**
     * 添加组件到画布
     * @param {string} componentId
     * @param {Object} configOverrides - { x, y, width, height }
     * @returns {Object} 创建的 Box
     */
    addComponent(componentId, configOverrides = {}) {
        const definition = registry.get(componentId);
        if (!definition) {
            console.warn('[Canvas] Unknown component:', componentId);
            return null;
        }

        const box = createComponent(componentId, configOverrides);
        if (!box) return null;

        this._frame.add(box);
        this._emitChange();

        console.log('[Canvas] Added component:', componentId);
        return box;
    }

    /**
     * 从画布移除组件
     * @param {Object} box
     */
    removeComponent(box) {
        if (!box || !box.parent) return;
        box.parent.remove(box);
        this._emitChange();
    }

    /**
     * 获取画布上所有组件
     * @returns {Array}
     */
    getComponents() {
        if (!this._frame) return [];
        return this._frame.children.filter(c => c.id);
    }

    /**
     * 清空画布
     */
    clear() {
        if (this._frame) {
            this._frame.clear();
            this._emitChange();
        }
    }

    /**
     * 设置画布尺寸
     * @param {string} sizeKey - e.g. '1920x1080'
     */
    setCanvasSize(sizeKey) {
        const size = CANVAS_SIZES[sizeKey];
        if (!size) return;

        this._canvasSize = size;
        if (this._frame) {
            this._frame.set({ width: size.width, height: size.height });
        }
        if (this._leafer) {
            this._leafer.set({
                width: size.width * this._zoom,
                height: size.height * this._zoom
            });
        }

        const infoEl = document.getElementById('canvasInfo');
        if (infoEl) {
            infoEl.textContent = `${size.width} × ${size.height}`;
        }
    }

    /**
     * 设置缩放
     * @param {number} zoom
     */
    setZoom(zoom) {
        this._zoom = zoom;
        if (this._frame) {
            this._frame.set({ scale: zoom });
        }
        if (this._leafer) {
            this._leafer.set({
                width: this._canvasSize.width * zoom,
                height: this._canvasSize.height * zoom
            });
        }
    }

    /**
     * 设置选择回调
     * @param {Function} callback - (selectedBox) => void
     */
    onSelect(callback) {
        this._onSelectCallback = callback;
    }

    /**
     * 设置变更回调
     * @param {Function} callback
     */
    onChange(callback) {
        this._onChangeCallback = callback;
    }

    /**
     * 获取 Leafer 实例
     */
    getLeafer() {
        return this._leafer;
    }

    /**
     * 获取 Frame 实例
     */
    getFrame() {
        return this._frame;
    }

    /**
     * 获取画布尺寸
     */
    getCanvasSize() {
        return { ...this._canvasSize };
    }

    /**
     * 强制刷新渲染
     */
    forceRender() {
        if (this._leafer && this._leafer.forceRender) {
            this._leafer.forceRender();
        }
    }

    _emitChange() {
        if (this._onChangeCallback) {
            this._onChangeCallback();
        }
    }

    /**
     * 销毁画布
     */
    destroy() {
        if (this._leafer) {
            this._leafer.destroy();
            this._leafer = null;
            this._frame = null;
        }
    }
}

export const canvas = new Canvas();
