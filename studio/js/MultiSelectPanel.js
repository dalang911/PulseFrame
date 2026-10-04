/**
 * studio/MultiSelectPanel.js - 多选快速对齐 & 批量赋值面板
 *
 * 当画布选中 >=2 个对象时显示，提供：
 *   - 对齐：左 / 水平居中 / 右、顶 / 垂直居中 / 底（相对选区外接框）
 *   - 等距分布：横向 / 纵向（需 >=3 个）
 *   - 批量赋值：宽/高/旋转/透明度/填充色/描边色/描边宽/圆角/字号/字重
 *
 * 所有写回通过 studioCanvas.runBatch 完成（保留多选、一次提交进 undo 历史）。
 */

import { specStore } from './SpecStore.js';
import { studioCanvas } from './StudioCanvas.js';

const esc = (s) => String(s == null ? '' : s).replace(/"/g, '&quot;').replace(/</g, '&lt;');

// 可批量修改的属性（对不适用类型的元素无害，Leafer 会忽略未知属性）
const BATCH_FIELDS = [
    { key: 'width', label: 'Width', control: 'number', min: 1 },
    { key: 'height', label: 'Height', control: 'number', min: 1 },
    { key: 'rotation', label: 'Rotation', control: 'number', min: -360, max: 360 },
    { key: 'opacity', label: 'Opacity', control: 'number', min: 0, max: 1, step: 0.05 },
    { key: 'cornerRadius', label: 'Corner radius', control: 'number', min: 0 },
    { key: 'fill', label: 'Fill', control: 'color' },
    { key: 'stroke', label: 'Stroke', control: 'color' },
    { key: 'strokeWidth', label: 'Stroke width', control: 'number', min: 0 },
    { key: 'fontSize', label: 'Font size', control: 'number', min: 1 },
    { key: 'fontWeight', label: 'Font weight', control: 'select', options: ['normal', 'bold', 'black'] }
];

// 对齐按钮定义（fn 接收选区 boxes，返回每个 uid 的 {x?,y?} 位移）
const ALIGN_OPS = {
    left(boxes) {
        const minX = Math.min(...boxes.map(b => b.x));
        return boxes.map(b => ({ uid: b.uid, patch: { x: minX } }));
    },
    hcenter(boxes) {
        const minX = Math.min(...boxes.map(b => b.x));
        const maxX = Math.max(...boxes.map(b => b.x + b.w));
        const cx = (minX + maxX) / 2;
        return boxes.map(b => ({ uid: b.uid, patch: { x: Math.round(cx - b.w / 2) } }));
    },
    right(boxes) {
        const maxX = Math.max(...boxes.map(b => b.x + b.w));
        return boxes.map(b => ({ uid: b.uid, patch: { x: maxX - b.w } }));
    },
    top(boxes) {
        const minY = Math.min(...boxes.map(b => b.y));
        return boxes.map(b => ({ uid: b.uid, patch: { y: minY } }));
    },
    vcenter(boxes) {
        const minY = Math.min(...boxes.map(b => b.y));
        const maxY = Math.max(...boxes.map(b => b.y + b.h));
        const cy = (minY + maxY) / 2;
        return boxes.map(b => ({ uid: b.uid, patch: { y: Math.round(cy - b.h / 2) } }));
    },
    bottom(boxes) {
        const maxY = Math.max(...boxes.map(b => b.y + b.h));
        return boxes.map(b => ({ uid: b.uid, patch: { y: maxY - b.h } }));
    },
    distH(boxes) {
        const sorted = [...boxes].sort((a, b) => a.x - b.x);
        const left = sorted[0].x;
        const right = Math.max(...sorted.map(b => b.x + b.w));
        const total = sorted.reduce((s, b) => s + b.w, 0);
        const gap = (right - left - total) / (sorted.length - 1);
        let cursor = left;
        return sorted.map(b => {
            const item = { uid: b.uid, patch: { x: Math.round(cursor) } };
            cursor += b.w + gap;
            return item;
        });
    },
    distV(boxes) {
        const sorted = [...boxes].sort((a, b) => a.y - b.y);
        const top = sorted[0].y;
        const bottom = Math.max(...sorted.map(b => b.y + b.h));
        const total = sorted.reduce((s, b) => s + b.h, 0);
        const gap = (bottom - top - total) / (sorted.length - 1);
        let cursor = top;
        return sorted.map(b => {
            const item = { uid: b.uid, patch: { y: Math.round(cursor) } };
            cursor += b.h + gap;
            return item;
        });
    }
};

class MultiSelectPanel {
    constructor() {
        this._wrap = null;
        this._root = null;
    }

    init(container) {
        this._root = typeof container === 'string' ? document.querySelector(container) : container;
        if (!this._root) { console.error('[MultiSelectPanel] container not found'); return; }
        this._wrap = document.getElementById('spBatchWrap');
        specStore.on('select', () => this.render());
        specStore.on('change', () => { if (!this._focusIn) this.render(); });
        this._root.addEventListener('click', (e) => this._onClick(e));
        this._root.addEventListener('input', () => { this._focusIn = true; });
        this._root.addEventListener('change', () => { this._focusIn = true; });
        this._root.addEventListener('blur', () => { this._focusIn = false; }, true);
        this.render();
    }

    _selectedUids() {
        return (specStore.selectedUids && specStore.selectedUids.length >= 2) ? specStore.selectedUids : [];
    }

    /** 量取每个选中元素的组件空间外接框（x/y/w/h） */
    _boxes(uids) {
        return uids.map(uid => {
            const f = specStore.findLayer(uid);
            const el = studioCanvas.getEl(uid);
            const props = f ? f.layer.props : {};
            return {
                uid,
                x: el && typeof el.x === 'number' ? el.x : (props.x || 0),
                y: el && typeof el.y === 'number' ? el.y : (props.y || 0),
                w: el && typeof el.width === 'number' ? el.width : (props.width || 0),
                h: el && typeof el.height === 'number' ? el.height : (props.height || 0)
            };
        });
    }

    render() {
        const uids = this._selectedUids();
        if (uids.length < 2) {
            if (this._wrap) this._wrap.hidden = true;
            this._root.innerHTML = '';
            return;
        }
        if (this._wrap) this._wrap.hidden = false;
        const canDistribute = uids.length >= 3;

        const alignBtn = (act, title, glyph, disabled) =>
            `<button class="sp-align-btn${disabled ? ' disabled' : ''}" data-align="${act}" title="${esc(title)}"${disabled ? ' disabled' : ''}>${glyph}</button>`;

        this._root.innerHTML = `
            <div class="sp-batch-count">Selected <b>${uids.length}</b> objects</div>

            <div class="sp-batch-sec-title">Align (relative to selection)</div>
            <div class="sp-align-grid">
                ${alignBtn('left', 'Align left', '⇤')}
                ${alignBtn('hcenter', 'Align center horizontally', '⇹')}
                ${alignBtn('right', 'Align right', '⇥')}
                ${alignBtn('top', 'Align top', '⤒')}
                ${alignBtn('vcenter', 'Align center vertically', '⇳')}
                ${alignBtn('bottom', 'Align bottom', '⤓')}
            </div>
            <div class="sp-align-grid sp-align-grid-2">
                ${alignBtn('distH', 'Distribute horizontally (≥3)', 'Dist H', !canDistribute)}
                ${alignBtn('distV', 'Distribute vertically (≥3)', 'Dist V', !canDistribute)}
            </div>

            <div class="sp-batch-sec-title">Batch assign</div>
            <div class="sp-batch-fields">
                ${BATCH_FIELDS.map(f => this._field(f)).join('')}
            </div>
        `;
    }

    _field(f) {
        const id = 'spb_' + f.key;
        let input;
        if (f.control === 'color') {
            input = `<input type="color" id="${id}" data-key="${f.key}" value="#32cd79">`;
        } else if (f.control === 'select') {
            input = `<select id="${id}" data-key="${f.key}">${f.options.map(o => `<option value="${esc(o)}">${esc(o)}</option>`).join('')}</select>`;
        } else {
            input = `<input type="number" id="${id}" data-key="${f.key}" ${f.min != null ? `min="${f.min}"` : ''} ${f.max != null ? `max="${f.max}"` : ''} step="${f.step || 1}" placeholder="value">`;
        }
        return `<div class="sp-batch-row">
            <span class="sp-batch-label">${esc(f.label)}</span>
            ${input}
            <button class="sp-batch-apply" data-apply="${f.key}" data-control="${f.control}" title="Apply to selected objects">Apply</button>
        </div>`;
    }

    _onClick(e) {
        const alignBtn = e.target.closest('[data-align]');
        if (alignBtn && !alignBtn.disabled) { this._doAlign(alignBtn.dataset.align); return; }
        const applyBtn = e.target.closest('[data-apply]');
        if (applyBtn) { this._doApply(applyBtn.dataset.apply); return; }
    }

    _doAlign(op) {
        const uids = this._selectedUids();
        if (uids.length < 2) return;
        const fn = ALIGN_OPS[op];
        if (!fn) return;
        if ((op === 'distH' || op === 'distV') && uids.length < 3) { this._toast('Distribute needs at least 3 selected objects'); return; }
        const boxes = this._boxes(uids);
        const items = fn(boxes);
        studioCanvas.runBatch(items, 'align-' + op);
        this._toast('Aligned');
    }

    _doApply(key) {
        const uids = this._selectedUids();
        if (uids.length < 2) return;
        const input = document.getElementById('spb_' + key);
        if (!input) return;
        let value;
        if (input.type === 'number') {
            if (input.value === '') { this._toast('Enter a value first'); return; }
            value = Number(input.value);
        } else {
            value = input.value;
        }
        const items = uids.map(uid => ({ uid, patch: { [key]: value } }));
        studioCanvas.runBatch(items, 'batch-' + key);
        this._toast('Batch applied');
    }

    _toast(msg) {
        let t = document.getElementById('spToast');
        if (!t) { t = document.createElement('div'); t.id = 'spToast'; t.className = 'sp-toast'; document.body.appendChild(t); }
        t.textContent = msg;
        t.classList.add('show');
        clearTimeout(this._toastTimer);
        this._toastTimer = setTimeout(() => t.classList.remove('show'), 1500);
    }
}

export const multiSelectPanel = new MultiSelectPanel();
