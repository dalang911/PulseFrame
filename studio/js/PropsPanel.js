/**
 * studio/PropsPanel.js - 右侧属性面板（编辑选中图层的 Leafer 属性）
 *
 * 按图层 type 展示对应控件；输入实时反映到画布（不重建），失焦/回车时提交进 undo 历史。
 * svg 图层（图标）：代码由点 SVG Icon 芯片插入的占位三角形起步，在这里替换；
 * 文本框只在失焦提交时写入，且必须过 normalizeSvg 校验（含 10 KB 上限）才落库。
 */

import { specStore } from './SpecStore.js';
import { studioCanvas } from './StudioCanvas.js';
import { normalizeSvg, svgIconBox, svgByteLength, SVG_MAX_BYTES } from './runtime/spec.js';

const ICONFONT_URL = 'https://www.iconfont.cn/collections';

// 每个属性的控件描述
const COMMON = [
    { key: 'x', label: 'X', control: 'number' },
    { key: 'y', label: 'Y', control: 'number' },
    { key: 'rotation', label: 'Rotation', control: 'number', min: -360, max: 360, step: 1 },
    { key: 'origin', label: 'Origin', control: 'origin' },
    { key: 'opacity', label: 'Opacity', control: 'number', min: 0, max: 1, step: 0.05 }
];

const BY_TYPE = {
    rect: [...COMMON,
        { key: 'width', label: 'Width', control: 'number', min: 1 },
        { key: 'height', label: 'Height', control: 'number', min: 1 },
        { key: 'fill', label: 'Fill', control: 'color' },
        { key: 'cornerRadius', label: 'Corner radius', control: 'number', min: 0 },
        { key: 'stroke', label: 'Stroke', control: 'color' },
        { key: 'strokeWidth', label: 'Stroke width', control: 'number', min: 0 }
    ],
    ellipse: [...COMMON,
        { key: 'width', label: 'Width', control: 'number', min: 1 },
        { key: 'height', label: 'Height', control: 'number', min: 1 },
        { key: 'fill', label: 'Fill', control: 'color' },
        { key: 'stroke', label: 'Stroke', control: 'color' },
        { key: 'strokeWidth', label: 'Stroke width', control: 'number', min: 0 }
    ],
    arc: [...COMMON,
        { key: 'width', label: 'Width', control: 'number', min: 1 },
        { key: 'height', label: 'Height', control: 'number', min: 1 },
        { key: 'stroke', label: 'Ring color', control: 'color' },
        { key: 'strokeWidth', label: 'Ring width', control: 'number', min: 1 },
        { key: 'startAngle', label: 'Start angle', control: 'number', min: -360, max: 360 },
        { key: 'endAngle', label: 'End angle', control: 'number', min: -360, max: 360 },
        { key: 'innerRadius', label: 'Inner radius', control: 'number', min: 0, max: 1, step: 0.05 },
        { key: 'strokeCap', label: 'End cap', control: 'select', options: ['butt', 'round', 'square'] }
    ],
    line: [...COMMON,
        { key: 'width', label: 'Length', control: 'number', min: 1 },
        { key: 'stroke', label: 'Color', control: 'color' },
        { key: 'strokeWidth', label: 'Thickness', control: 'number', min: 1 }
    ],
    text: [...COMMON,
        { key: 'text', label: 'Content', control: 'text' },
        { key: 'fontSize', label: 'Font size', control: 'number', min: 1 },
        { key: 'fontWeight', label: 'Font weight', control: 'select', options: ['normal', 'bold', 'black'] },
        { key: 'fill', label: 'Color', control: 'color' },
        { key: 'textAlign', label: 'H-align', control: 'select', options: ['left', 'center', 'right'] },
        { key: 'verticalAlign', label: 'V-align', control: 'select', options: ['top', 'middle', 'bottom'] }
    ],
    image: [...COMMON,
        { key: 'width', label: 'Width', control: 'number', min: 1 },
        { key: 'height', label: 'Height', control: 'number', min: 1 },
        { key: 'url', label: 'Image URL', control: 'text' }
    ],
    // 图标：代码存在图层里（渲染时转 data URI），fill 为可选重着色（空 = 保持原色）
    svg: [...COMMON,
        { key: 'width', label: 'Width', control: 'number', min: 1 },
        { key: 'height', label: 'Height', control: 'number', min: 1 },
        { key: 'fill', label: 'Recolor', control: 'color' },
        { key: 'svg', label: 'SVG code', control: 'textarea' }
    ],
    group: [
        { key: 'x', label: 'X', control: 'number' },
        { key: 'y', label: 'Y', control: 'number' },
        { key: 'rotation', label: 'Rotation', control: 'number', min: -360, max: 360 },
        { key: 'opacity', label: 'Opacity', control: 'number', min: 0, max: 1, step: 0.05 }
    ]
};

const esc = (s) => String(s == null ? '' : s).replace(/"/g, '&quot;').replace(/</g, '&lt;');
/** textarea 内容专用转义（先转 & 再转 <，否则会被当成标签或实体） */
const escText = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const fmtBytes = (n) => n < 1024 ? n + ' B' : (n / 1024).toFixed(1) + ' KB';

class PropsPanel {
    constructor() { this._root = null; }

    init(container) {
        this._root = typeof container === 'string' ? document.querySelector(container) : container;
        if (!this._root) { console.error('[PropsPanel] container not found'); return; }
        specStore.on('select', () => this.render());
        specStore.on('change', () => { if (!this._focusIn) this.render(); });
        this.render();
    }

    render() {
        const layer = specStore.getSelected();
        if (!layer) {
            this._root.innerHTML = '<div class="sp-empty">Select a layer to edit its properties</div>';
            return;
        }
        const fields = BY_TYPE[layer.type] || COMMON;
        this._root.innerHTML = `
            <div class="sp-prop-head">
                <span class="sp-prop-type">${esc(layer.type)}</span>
                <input class="sp-prop-name" id="spLayerName" value="${esc(layer.name)}" title="Layer name">
            </div>
            <div class="sp-props">
                ${fields.map(f => this._field(f, layer)).join('')}
            </div>
        `;
        this._bind(layer, fields);
    }

    _field(f, layer) {
        const v = layer.props[f.key];
        const id = 'sp_' + f.key;
        if (f.control === 'color') {
            const col = (typeof v === 'string' && /^#([0-9a-f]{3,8})$/i.test(v)) ? v.slice(0, 7) : (v ? '#000000' : '#000000');
            return `<label class="sp-row"><span>${esc(f.label)}</span>
                <span class="sp-color-wrap">
                    <input type="color" id="${id}" data-key="${f.key}" value="${esc(col)}">
                    <input type="text" class="sp-color-text" data-key="${f.key}" value="${esc(v == null ? '' : v)}" placeholder="#RRGGBB">
                </span></label>`;
        }
        if (f.control === 'origin') {
            const o = (v && typeof v === 'object') ? v : { x: 0, y: 0 };
            return `<label class="sp-row"><span>${esc(f.label)}</span>
                <span class="sp-color-wrap">
                    <input type="number" data-key="origin" data-sub="x" value="${esc(o.x == null ? 0 : o.x)}" title="Origin X (relative to element top-left)" step="1">
                    <input type="number" data-key="origin" data-sub="y" value="${esc(o.y == null ? 0 : o.y)}" title="Origin Y (relative to element top-left)" step="1">
                </span></label>`;
        }
        if (f.control === 'select') {
            return `<label class="sp-row"><span>${esc(f.label)}</span>
                <select id="${id}" data-key="${f.key}">
                    ${f.options.map(o => `<option value="${esc(o)}" ${v === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}
                </select></label>`;
        }
        if (f.control === 'number') {
            return `<label class="sp-row"><span>${esc(f.label)}</span>
                <input type="number" id="${id}" data-key="${f.key}" value="${esc(v == null ? '' : v)}" ${f.min != null ? `min="${f.min}"` : ''} ${f.max != null ? `max="${f.max}"` : ''} step="${f.step || 1}"></label>`;
        }
        if (f.control === 'textarea') {
            // data-live="off"：逐字符不刷画布（中间状态不是合法 SVG），失焦才提交
            return `<label class="sp-row sp-row-col">
                <span>${esc(f.label)}</span>
                <textarea id="${id}" class="sp-svg-code" data-key="${f.key}" data-live="off" rows="8" spellcheck="false" autocomplete="off" placeholder="&lt;svg …&gt;…&lt;/svg&gt;">${escText(v)}</textarea>
                <span class="sp-svg-size" id="spSvgMeta"></span>
                <a class="sp-svg-link" href="${ICONFONT_URL}" target="_blank" rel="noopener noreferrer">Get SVG code at iconfont.cn · collections</a></label>`;
        }
        // text
        return `<label class="sp-row sp-row-col"><span>${esc(f.label)}</span>
            <input type="text" id="${id}" data-key="${f.key}" value="${esc(v == null ? '' : v)}"></label>`;
    }

    _bind(layer, fields) {
        const nameInput = this._root.querySelector('#spLayerName');
        if (nameInput) {
            nameInput.addEventListener('change', () => specStore.rename(layer.uid, nameInput.value.trim() || layer.type));
            nameInput.addEventListener('focus', () => { this._focusIn = true; });
            nameInput.addEventListener('blur', () => { this._focusIn = false; });
        }

        const setVal = (key, raw, commit) => {
            const patch = {};
            patch[key] = raw;
            if (commit) specStore.updateProps(layer.uid, patch, { commit: true });
            else { specStore.updateProps(layer.uid, patch, { commit: false }); studioCanvas.applyLive(layer.uid, patch); }
        };

        this._root.querySelectorAll('[data-key]').forEach(inp => {
            const key = inp.dataset.key;
            const sub = inp.dataset.sub;
            const isNum = inp.type === 'number';
            const noLive = inp.dataset.live === 'off';   // textarea：逐字符不刷画布也不落库
            const handler = (commit) => {
                let raw = inp.value;
                if (isNum) raw = raw === '' ? 0 : Number(raw);
                if (sub === 'x' || sub === 'y') {   // 嵌套 origin 轴心（{x,y}）
                    const cur = (layer.props.origin && typeof layer.props.origin === 'object') ? layer.props.origin : { x: 0, y: 0 };
                    const next = Object.assign({}, cur); next[sub] = raw;
                    const patch = { origin: next };
                    if (commit) specStore.updateProps(layer.uid, patch, { commit: true });
                    else { specStore.updateProps(layer.uid, patch, { commit: false }); studioCanvas.applyLive(layer.uid, patch); }
                    return;
                }
                if (key === 'svg') {
                    // 图标代码：过不了校验（含 10 KB 上限）就不落库，保留上一次可用代码
                    const res = normalizeSvg(raw);
                    this._svgMeta(raw, res);
                    if (!res.ok) return;
                    const p = layer.props;
                    const box = svgIconBox(res.width, res.height, Math.max(p.width || 0, p.height || 0));
                    if (box.width !== p.width || box.height !== p.height) {
                        // 顺手按新 viewBox 比例修正显示盒（长边不变），避免图标被拉扁
                        specStore.updateProps(layer.uid, { svg: res.svg, width: box.width, height: box.height }, { commit });
                        return;
                    }
                    raw = res.svg;
                }
                setVal(key, raw, commit);
            };
            inp.addEventListener('input', () => {
                this._focusIn = true;
                if (!noLive) handler(false);
                else if (key === 'svg') this._svgMeta(inp.value, normalizeSvg(inp.value));
            });
            inp.addEventListener('change', () => { handler(true); this._focusIn = false; });
            if (inp.tagName === 'SELECT') inp.addEventListener('change', () => handler(true));
            inp.addEventListener('blur', () => { this._focusIn = false; });
        });

        if (layer.type === 'svg') this._svgMeta(layer.props.svg || '', normalizeSvg(layer.props.svg || ''));
    }

    /** svg 文本框下方的体积/错误提示（超 10 KB 或代码非法时标红） */
    _svgMeta(raw, res) {
        const el = this._root.querySelector('#spSvgMeta');
        if (!el) return;
        const bytes = res && res.ok ? res.bytes : svgByteLength(raw);   // 合法时按规范化后的字节数（= 真正落库的体积）
        const bad = bytes > SVG_MAX_BYTES || (res && res.ok === false);
        const err = res && !res.ok ? res.error : '';
        el.textContent = fmtBytes(bytes) + ' / ' + fmtBytes(SVG_MAX_BYTES) + (err ? ' · ' + err : '');
        el.className = 'sp-svg-size' + (bad ? ' err' : '');
    }
}

export const propsPanel = new PropsPanel();
export { BY_TYPE };
