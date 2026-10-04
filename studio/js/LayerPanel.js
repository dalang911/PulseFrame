/**
 * studio/LayerPanel.js - 图层面板（层叠顺序管理 + 拖拽组织）
 *
 * 以「上层在前」的顺序列出图层树；支持选中、显隐、上移/下移/置顶/置底、删除。
 * 顺序即数组顺序：index 越大越靠上层，显示时反转。
 * 拖拽：行可拖到另一行的上/下半部（同级插序）或组行中部（进入组），
 *       拖到面板空白处 = 移出组（挂到根顶层）。
 * 选中双向同步：点行 → specStore.setSelected；画布点选 → specStore select 事件 → 高亮行。
 */

import { specStore } from './SpecStore.js';

const esc = (s) => String(s == null ? '' : s).replace(/</g, '&lt;');

class LayerPanel {
    constructor() {
        this._root = null;
        this._dragUid = null;   // 正在拖拽的图层 uid（dataTransfer 在 dragover 期不可读，用它判断）
        this._hoverMark = null; // 当前显示指示类的元素
    }

    init(container) {
        this._root = typeof container === 'string' ? document.querySelector(container) : container;
        if (!this._root) { console.error('[LayerPanel] container not found'); return; }
        specStore.on('change', () => this.render());
        specStore.on('select', () => this.render());
        this._bindDnd();
        this.render();
    }

    render() {
        const spec = specStore.getSpec();
        if (!spec.layers.length) {
            this._root.innerHTML = '<div class="sp-empty">No layers yet</div>';
            return;
        }
        // 反转显示：上层在前
        const rows = [];
        const walk = (arr, depth) => {
            [...arr].reverse().forEach(layer => {
                rows.push({ layer, depth });
                if (layer.type === 'group' && Array.isArray(layer.children)) walk(layer.children, depth + 1);
            });
        };
        walk(spec.layers, 0);

        this._root.innerHTML = rows.map(({ layer, depth }) => `
            <div class="sp-layer ${layer.uid === specStore.selectedUid ? 'selected' : ''}" data-uid="${layer.uid}" data-group="${layer.type === 'group' ? 1 : 0}" draggable="true" style="padding-left:${4 + depth * 14}px" title="Drag to reorder or move in/out of a group">
                <span class="sp-layer-drag">⠿</span>
                <button class="sp-eye" data-act="toggle" title="Show/Hide">${layer.visible === false ? '🚫' : '👁'}</button>
                <span class="sp-layer-type">${esc(layer.type)}</span>
                <span class="sp-layer-name">${esc(layer.name)}</span>
                <span class="sp-layer-acts">
                    <button data-act="up" title="Move up">↑</button>
                    <button data-act="down" title="Move down">↓</button>
                    <button data-act="top" title="To top">⤒</button>
                    <button data-act="bottom" title="To bottom">⤓</button>
                    <button data-act="del" title="Delete">✕</button>
                </span>
            </div>
        `).join('');

        this._root.querySelectorAll('.sp-layer').forEach(row => {
            const uid = row.dataset.uid;
            row.addEventListener('click', (e) => {
                const btn = e.target.closest('button');
                if (!btn) { specStore.setSelected(uid); return; }
                const act = btn.dataset.act;
                if (act === 'toggle') specStore.toggleVisible(uid);
                else if (act === 'del') specStore.removeLayer(uid);
                else specStore.moveLayer(uid, act);
            });
        });
    }

    // ===== 拖拽组织（事件委托，行重渲染不丢绑定） =====
    _bindDnd() {
        const root = this._root;

        root.addEventListener('dragstart', (e) => {
            const row = e.target.closest('.sp-layer');
            if (!row) return;
            this._dragUid = row.dataset.uid;
            e.dataTransfer.effectAllowed = 'move';
            try { e.dataTransfer.setData('text/plain', this._dragUid); } catch (err) { /* IE */ }
            row.classList.add('dragging');
        });

        root.addEventListener('dragend', () => {
            this._dragUid = null;
            this._clearMarks();
            root.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));
        });

        root.addEventListener('dragover', (e) => {
            if (!this._dragUid) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            const row = e.target.closest('.sp-layer');
            this._clearMarks();
            if (!row || row.dataset.uid === this._dragUid) {
                // 空白区域 = 移出到根
                if (!row) root.classList.add('drop-root');
                return;
            }
            const box = row.getBoundingClientRect();
            const ratio = (e.clientY - box.top) / box.height;
            if (row.dataset.group === '1' && ratio > 0.25 && ratio < 0.75) {
                row.classList.add('drop-into');
            } else {
                row.classList.add(ratio < 0.5 ? 'drop-before' : 'drop-after');
            }
            this._hoverMark = row;
        });

        root.addEventListener('dragleave', (e) => {
            if (e.target === root) root.classList.remove('drop-root');
        });

        root.addEventListener('drop', (e) => {
            if (!this._dragUid) return;
            e.preventDefault();
            const uid = this._dragUid;
            const row = e.target.closest('.sp-layer');
            let ok = false;
            if (!row) {
                // 面板空白：移出组，挂到根顶层
                ok = specStore.moveNodeTo(uid, null, 'into');
            } else if (row.dataset.uid !== uid) {
                const box = row.getBoundingClientRect();
                const ratio = (e.clientY - box.top) / box.height;
                const targetUid = row.dataset.uid;
                if (row.dataset.group === '1' && ratio > 0.25 && ratio < 0.75) {
                    ok = specStore.moveNodeTo(uid, targetUid, 'into');
                } else if (ratio < 0.5) {
                    // 显示在上 = 数组中排在目标之后（更靠上层）
                    ok = specStore.moveNodeTo(uid, targetUid, 'after');
                } else {
                    // 显示在下 = 数组中排在目标之前（更靠下层）
                    ok = specStore.moveNodeTo(uid, targetUid, 'before');
                }
            }
            this._dragUid = null;
            this._clearMarks();
            root.classList.remove('drop-root');
            if (!ok) return;
        });
    }

    _clearMarks() {
        this._root.querySelectorAll('.drop-before,.drop-after,.drop-into').forEach(el => {
            el.classList.remove('drop-before', 'drop-after', 'drop-into');
        });
        this._hoverMark = null;
    }
}

export const layerPanel = new LayerPanel();
