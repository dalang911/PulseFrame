/**
 * studio/StudioCanvas.js - 设计画布
 *
 * 把 spec.layers 渲染为可单独选中/拖拽/缩放的 Leafer 元素；
 * 与 specStore 双向同步（拖拽结束写回 x/y/width/height；选中回填 selectedUid）；
 * 提供层叠重排后的整体重渲染，以及基于真实数据的绑定预览（逐帧）。
 */

import { specStore } from './SpecStore.js';
import { LAYER_TAG, flattenLayers, normalizeArcProps, resolveSvgProps } from './runtime/spec.js';
import { applyLayerBindings } from './runtime/bindingEngine.js';
import { THEME_EVENT } from './ThemeManager.js';

const FIT_PAD = 0.82;

// 主题语义变量（明暗两套值都在 css/studio.css 里），cssVar() 按当前主题取值
const TOKEN_FRAME = '--sp-canvas-frame';   // 画板底
const TOKEN_ARTBOARD = '--sp-canvas-board'; // 组件边界盒底
const FALLBACK = { '--sp-canvas-frame': '#6f7686', '--sp-canvas-board': '#7d8595' };

/** 读当前主题下的 CSS 变量值（变量由 data-theme 决定，必须在 attribute 写入后再读） */
function cssVar(name) {
    try {
        const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
        return v || FALLBACK[name] || '#ffffff';
    } catch (e) { return FALLBACK[name] || '#ffffff'; }
}

class StudioCanvas {
    constructor() {
        this._app = null;
        this._leafer = null;
        this._frame = null;
        this._elByUid = {};
        this._view = { width: 800, height: 500 };
        this._zoom = 0.4;
        this._dragging = false;
        this._progDepth = 0;   // 程序化改动编辑器（target=null / select / cancel）期间 >0，抑制 editor.select 回调污染 store
        this._commitTimer = null;
    }

    init(container) {
        const el = typeof container === 'string' ? document.querySelector(container) : container;
        if (!el) { console.error('[StudioCanvas] container not found'); return; }

        const { App, Frame } = window.LeaferUI;
        this._view = { width: el.clientWidth || 800, height: el.clientHeight || 500 };

        // 必须用 App（而非裸 Leafer）：裸 new Leafer({editor}) 不会创建编辑器，
        // 导致选中/拖拽/缩放全部失效。App 会把编辑器建在 app.editor，内容根需加到 app.tree。
        this._app = new App({
            view: el,
            width: this._view.width,
            height: this._view.height,
            editor: {
                point: { size: 8 },
                middlePoint: { size: 6 },
                rotatePoint: { size: 8 },
                rect: { strokeWidth: 1, stroke: '#358DE6' },
                // 合法配置键（枚举验证）：moveable/resizeable/rotateable、select:'press'、multipleSelect、lockRatio
                moveable: true, resizeable: true, rotateable: true,
                select: 'press', multipleSelect: true, lockRatio: false
            }
        });
        this._leafer = this._app.tree;
        // App 的编辑器在 app.editor（tree/leafer 本身不带 editor），挂到 this._leafer.editor 以复用后续引用
        this._leafer.editor = this._app.editor;

        this._frame = new Frame({ id: 'studioFrame', width: this._view.width, height: this._view.height, fill: cssVar(TOKEN_FRAME) });
        this._leafer.add(this._frame);
        this._syncTheme();
        document.addEventListener(THEME_EVENT, () => this._syncTheme());   // 切换明暗时只换底色，不重建图层

        this._bindEditor();

        specStore.on('change', () => { if (!this._dragging) this.render(); });
        specStore.on('select', (uid) => this._syncSelectionToEditor(uid));

        this.render();
    }

    /** 把当前主题的底色写进画布（Frame 底 + 组件边界盒底）；外围留白由 .sp-canvas-wrap 的 CSS 变量负责 */
    _syncTheme() {
        if (!this._frame) return;
        const frame = cssVar(TOKEN_FRAME), board = cssVar(TOKEN_ARTBOARD);
        this._frame.fill = frame;
        const bounds = this._frame.findOne && this._frame.findOne('#studioBounds');
        if (bounds) bounds.fill = board;
        if (this._leafer && this._leafer.forceRender) this._leafer.forceRender();
    }

    /** 绑定编辑器选中/拖拽事件 */
    _bindEditor() {
        const editor = this._leafer && this._leafer.editor;
        if (!editor) return;

        // 选中变化（点击/多选）：真实事件名 editor.select（不是 selection.change）
        editor.on('editor.select', () => {
            if (this._progDepth > 0) return;            // 重建期间的程序化 select（含 target=null）不回写 store，避免选中被清空
            const list = editor.list || [];
            const uids = list.map(el => el.id).filter(Boolean);
            specStore.setSelection(uids);
        });

        // 拖动/缩放/旋转进行中：仅标记 _dragging 以抑制整树重建。
        // 若在拖动中途 render()，会 detach 正在移动的元素 → Editor.onMove 读 undefined.draggable 崩溃并丢焦点。
        const markDragging = () => { this._dragging = true; };
        ['editor.move', 'editor.scale', 'editor.rotate'].forEach(ev => editor.on(ev, markDragging));

        // 真正拖拽结束（DragEvent.END = 'drag.end'）才写回；window pointerup 作兜底，保证指针抬起提交一次。
        const finish = () => { if (!this._dragging) return; this._dragging = false; this._commitTransform(); };
        editor.on('drag.end', finish);
        this._leafer.on('drag.end', finish);
        window.addEventListener('pointerup', finish);
    }

    /** 把当前选中元素的几何写回 spec 并 commit */
    _commitTransform() {
        const editor = this._leafer.editor;
        const list = (editor && editor.list) || [];
        list.forEach(el => {
            const f = specStore.findLayer(el.id);
            if (!f) return;
            const patch = { x: el.x, y: el.y };
            if (typeof el.width === 'number') patch.width = el.width;
            if (typeof el.height === 'number') patch.height = el.height;
            if (typeof el.rotation === 'number') patch.rotation = el.rotation;
            Object.assign(f.layer.props, patch);
        });
        specStore.commit('transform');
    }

    /** 全量重渲染图层树 */
    render() {
        if (!this._frame) return;
        const ed = this._leafer && this._leafer.editor;
        this._progDepth++;   // 整段重建期间抑制 editor.select 回调：target=null 及随后的 select/cancel 都会触发该事件，若不抑制会把 store 选中清空（即“改一次属性就丢选中”的根因）
        try {
        if (ed) { try { ed.target = null; } catch (e) { /* ignore */ } }   // 重建前释放编辑器对旧元素的引用，避免 removeAll 后命中/选中状态错乱
        this._frame.clear();
        this._elByUid = {};

        const spec = specStore.getSpec();
        const W = spec.meta.width || 400, H = spec.meta.height || 200;
        this._zoom = Math.min(this._view.width / W, this._view.height / H) * FIT_PAD;

        // 组件边界背景（自身不可选中，且不含子节点，避免 editable 继承影响图层）
        const { Box } = window.LeaferUI;
        const cx = (this._view.width - W * this._zoom) / 2;
        const cy = (this._view.height - H * this._zoom) / 2;
        const bounds = new Box({
            id: 'studioBounds',
            x: cx, y: cy, width: W * this._zoom, height: H * this._zoom,
            fill: cssVar(TOKEN_ARTBOARD), editable: false, dragable: false, hittable: false
        });
        // 图层容器：负责位移+缩放；不能设 editable:false，否则子元素会继承而全部不可选中。
        // 无 fill → 自身不作为命中目标，点击会落到子图层（可选）或空白（取消选中）。
        const comp = new Box({
            x: cx, y: cy,
            scaleX: this._zoom, scaleY: this._zoom,
            children: spec.layers.map(l => this._buildStudioEl(l))
        });
        this._frame.add(bounds);
        this._frame.add(comp);

        flattenLayers(spec.layers).forEach(l => {
            const found = comp.findOne('#' + l.uid);
            if (found) this._elByUid[l.uid] = found;
        });

        this._syncSelectionToEditor();
        } finally {
            this._progDepth--;
        }
    }

    /** 构建可编辑的设计期元素（group 透传、叶子可选） */
    _buildStudioEl(layer) {
        const tag = LAYER_TAG[layer.type] || 'Rect';
        const Ctor = window.LeaferUI[tag];
        if (!Ctor) { console.warn('[StudioCanvas] unknown tag', tag); return null; }
        // svg 图层：代码先合成 data URI（svg/fill 两个中间键不下发给元素）
        const props = layer.type === 'svg' ? resolveSvgProps(layer.props) : layer.props;
        const cfg = { id: layer.uid, visible: layer.visible !== false, ...clone(props) };
        if (layer.type === 'arc') normalizeArcProps(cfg);
        const isGroup = layer.type === 'group';
        cfg.editable = !isGroup;
        cfg.dragable = !isGroup;
        const el = new Ctor(cfg);
        if (isGroup) (layer.children || []).forEach(c => { const ch = this._buildStudioEl(c); if (ch) el.add(ch); });
        return el;
    }

    /** 程序化选中（面板点击图层/多选恢复 → 编辑器高亮） */
    _syncSelectionToEditor() {
        const editor = this._leafer && this._leafer.editor;
        if (!editor) return;
        const uids = (specStore.selectedUids && specStore.selectedUids.length)
            ? specStore.selectedUids
            : (specStore.selectedUid ? [specStore.selectedUid] : []);
        const els = uids.map(u => this._elByUid[u]).filter(Boolean);
        this._progDepth++;
        try {
            if (!els.length) { editor.cancel ? editor.cancel() : (editor.target = null); return; }
            if (!editor.select) { editor.target = els[0]; return; }
            try {
                editor.select(els.length === 1 ? els[0] : els);
            } catch (e) {
                try { editor.target = els[0]; } catch (_) { /* ignore */ }
            }
        } finally {
            this._progDepth--;
        }
    }

    /** 取某 uid 对应的画布元素（供批量面板量取位置/尺寸） */
    getEl(uid) { return this._elByUid[uid] || null; }

    /**
     * 批量写回：直接更新元素属性（不重建整树，保留多选），并一次提交进历史。
     * @param {Array<{uid:string, patch:Object}>} items
     * @param {string} label
     */
    runBatch(items, label = 'batch') {
        this._dragging = true; // 抑制 change 触发的整树重建，避免多选丢失
        try {
            specStore.batchPatch(items, label);
            (items || []).forEach(({ uid, patch }) => this.applyLive(uid, patch));
            const editor = this._leafer && this._leafer.editor;
            if (editor && typeof editor.refresh === 'function') { try { editor.refresh(); } catch (e) { /* ignore */ } }
            this._forceRender();
        } finally {
            this._dragging = false;
        }
    }

    /** 直接更新某元素属性（不整树重建，用于属性面板实时拖动） */
    applyLive(uid, patch) {
        const el = this._elByUid[uid];
        if (!el) return;
        const f = specStore.findLayer(uid);
        const isSvg = !!(f && f.layer.type === 'svg');
        // svg 图层改代码/重着色：下发的是合成出来的 url，而不是 svg/fill 本身
        if (isSvg && (patch.svg !== undefined || patch.fill !== undefined)) {
            try { el.url = resolveSvgProps(f.layer.props).url; } catch (e) { /* ignore */ }
        }
        Object.keys(patch).forEach(k => {
            if (k === 'children' || (isSvg && (k === 'svg' || k === 'fill'))) return;
            try { el[k] = patch[k]; } catch (e) { /* readonly */ }
        });
        this._forceRender();
    }

    // ===== 绑定预览（用真实数据逐帧应用）=====
    get trkptData() { return window.__trkptData || null; }

    /**
     * 画布没起来（init 失败 / 页面里混进了新旧两套模块，本实例从未初始化）时安静跳过，
     * 别让一次逐帧调用把异常抛进播放定时器，表现为「播放演示数据没反应」。
     */
    _forceRender() {
        if (!this._leafer) return;
        if (this._leafer.forceRender) this._leafer.forceRender();
    }

    /**
     * 用给定帧数据把绑定结果渲染到画布（预览）
     * @param {number} index
     */
    previewFrame(index) {
        const trk = this.trkptData;
        if (!trk || !trk.length || !this._leafer) return false;
        const i = Math.max(0, Math.min(trk.length - 1, index | 0));
        const frameData = trk[i];
        const ctx = { trkptData: trk, currentFrame: i, maxFrame: trk.length, chartData: window.__chartData || {} };
        const progress = i / (trk.length - 1 || 1);
        const spec = specStore.getSpec();
        flattenLayers(spec.layers).forEach(layer => {
            const el = this._elByUid[layer.uid];
            if (el && layer.bindings && Object.keys(layer.bindings).length) {
                applyLayerBindings(el, layer, { frameData, ctx, progress });
            }
        });
        this._forceRender();
        return true;
    }

    /** 退出预览：恢复设计值 */
    exitPreview() { this.render(); }

    setZoom(z) {
        this._zoom = z;
        this.render();
    }
}

function clone(o) { return JSON.parse(JSON.stringify(o)); }

export const studioCanvas = new StudioCanvas();

// 混版自检，说明见 SpecStore.js 末尾同一段。画布实例被复制一份是最隐蔽的：
// 没被 init() 的那一份 _leafer 永远为 null，逐帧预览只能默默跳过。
(window.__spSingles = window.__spSingles || {});
if (window.__spSingles.StudioCanvas) window.__spDup = true;
window.__spSingles.StudioCanvas = studioCanvas;
