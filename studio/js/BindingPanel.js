/**
 * studio/BindingPanel.js - 数据字段绑定面板
 *
 * 针对选中图层，列出其"可绑定属性"，为每个属性选择绑定 mode（文本/尺寸/角度/颜色/透明度/显隐），
 * 再选数据字段并填写该 mode 的参数。写入 specStore.setBinding(uid, prop, binding)。
 * 与 PropsPanel 共用"选中即刷新"的事件模型；绑定编辑为离散操作（change 提交后整块重渲染）。
 */

import { specStore } from './SpecStore.js';
import { fieldsByGroup } from './fieldCatalog.js';

// 每个 type 的可绑定属性 → 允许的 mode 列表（'none' 表示解除绑定）
// 判据：属性在 PropsPanel 可编辑 + bindingEngine 各 mode 天然支持任意数字属性（size/angle 用 binding.prop 定位）
// x+size = 位置扫描游标（设计 x 填满宽，比例×满宽→横扫）；rotation+angle = 指针旋转（默认左上角轴心，指针做成从轴心伸出的形态即可居中）
const BINDABLE = {
    rect:    { x: ['size', 'none'], y: ['size', 'none'], width: ['size', 'none'], height: ['size', 'none'], fill: ['color', 'none'], stroke: ['color', 'none'], strokeWidth: ['size', 'none'], rotation: ['angle', 'none'], cornerRadius: ['size', 'none'], opacity: ['opacity', 'none'], visible: ['visible', 'none'] },
    ellipse: { x: ['size', 'none'], y: ['size', 'none'], width: ['size', 'none'], height: ['size', 'none'], fill: ['color', 'none'], stroke: ['color', 'none'], strokeWidth: ['size', 'none'], rotation: ['angle', 'none'], opacity: ['opacity', 'none'], visible: ['visible', 'none'] },
    arc:     { endAngle: ['angle', 'none'], startAngle: ['angle', 'none'], stroke: ['color', 'none'], strokeWidth: ['size', 'none'], innerRadius: ['size', 'none'], opacity: ['opacity', 'none'] },
    line:    { x: ['size', 'none'], y: ['size', 'none'], width: ['size', 'none'], stroke: ['color', 'none'], strokeWidth: ['size', 'none'], rotation: ['angle', 'none'], opacity: ['opacity', 'none'], visible: ['visible', 'none'] },
    text:    { text: ['text', 'none'], fill: ['color', 'none'], x: ['size', 'none'], y: ['size', 'none'], fontSize: ['size', 'none'], opacity: ['opacity', 'none'], visible: ['visible', 'none'] },
    image:   { x: ['size', 'none'], y: ['size', 'none'], opacity: ['opacity', 'none'], visible: ['visible', 'none'] },
    svg:     { x: ['size', 'none'], y: ['size', 'none'], opacity: ['opacity', 'none'], visible: ['visible', 'none'] },
    group:   { opacity: ['opacity', 'none'] }
};

const MODE_LABEL = {
    text: 'Text', size: 'Size (ratio)', angle: 'Angle (gauge)',
    color: 'Color (threshold)', opacity: 'Opacity', visible: 'Visibility', none: '(unbound)'
};

const esc = (s) => String(s == null ? '' : s).replace(/"/g, '&quot;').replace(/</g, '&lt;');

/** 边界值是字段引用（字符串且非数字）而非手填数字 */
const isFieldVal = (v) => typeof v === 'string' && v !== '' && isNaN(Number(v));

/** 边界下拉首项：回落到手填数字框 */
const NUM = '__num__';

/** 各字段的"默认边界"：切换 Data field 时按此表自动重绑 min/max（存内部 key，UI 展示人类标签） */
const FIELD_DEFAULT_BOUNDS = {
    heart_rate:     { min: 'heartRateMin', max: 'user_heartRateMax' },
    cadence:        { min: 'cadenceMin',   max: 'cadenceMax' },
    power:          { min: 'powerMin',     max: 'powerMax' },
    speed:          { min: 'paceMin',      max: 'paceMax' },
    pace:           { min: 'paceBoundMin', max: 'paceBoundMax' },  // 真实配速极值：由速度极值取倒数（引擎 paceBound* 字段），旧遗留数字 4/12 也会被重绑
    altitude:       { min: 'eleMin',       max: 'eleMax' },
    relAltitude:    { min: 'baseAltitude',  max: 'eleMax' },
    slope:          { min: -15,            max: 15 },
    step_length:    { min: 0.3,            max: 1.2 },
    azimuth:        { min: 0,              max: 360 },
    distance:       { min: 0,              max: 'totalDistance' },
    km:             { min: 0,              max: 'totalKm' },
    remainDistance: { min: 0,              max: 'totalDistance' },
    remainKm:       { min: 0,              max: 'totalKm' },
    pct:            { min: 0,              max: 1 },
    hrPct:          { min: 0,              max: 1 },
    sec:            { min: 0,              max: 'duration' }
};

/** 选定 mode 后的默认参数 */
function defaultBinding(mode, layer, prop) {
    const hb = FIELD_DEFAULT_BOUNDS.heart_rate, db = FIELD_DEFAULT_BOUNDS.distance, pb = FIELD_DEFAULT_BOUNDS.pct;
    switch (mode) {
        case 'text': return { mode: 'text', field: 'distance', decimal: 1 };
        case 'size': return { mode: 'size', field: 'distance', min: db.min, max: db.max };
        case 'angle': return prop === 'rotation'
            ? { mode: 'angle', field: 'azimuth', min: 0, max: 360, from: 0, to: 360 }
            : {
                mode: 'angle', field: 'heart_rate', min: hb.min, max: hb.max,
                from: layer.props.startAngle != null ? layer.props.startAngle : -210,
                to: layer.props.endAngle != null ? layer.props.endAngle : 30
            };
        case 'color': return { mode: 'color', field: 'heart_rate', base: layer.props[prop] || '#32cd79', thresholds: [] };
        case 'opacity': return { mode: 'opacity', field: 'pct', min: pb.min, max: pb.max };
        case 'visible': return { mode: 'visible', field: 'pct', threshold: 0.5 };
        default: return null;
    }
}

/** 换数据字段后：min/max 若仍是旧字段的默认边界（或为空）就替换为新字段的；用户手改过的不覆盖 */
function remapBounds(b, oldField, newField) {
    const dNew = FIELD_DEFAULT_BOUNDS[newField];
    if (!dNew) return;
    const dOld = FIELD_DEFAULT_BOUNDS[oldField] || {};
    // 遗留兼容：早期 pace 默认是数字 4/12（当时无真配速边界），现换成字段引用——
    // 旧默认是数字而新默认是字段时，这些数字也视为可覆盖。
    const legacyDefaults = oldField === 'pace' ? [4, 12] : [];
    const overwritable = (v, d) => v === undefined || v === ''
        || (d !== undefined && String(v) === String(d))
        || legacyDefaults.indexOf(Number(v)) >= 0;
    if (overwritable(b.min, dOld.min)) b.min = dNew.min;
    if (overwritable(b.max, dOld.max)) b.max = dNew.max;
}

function fieldOptions(selected) {
    const { groups, labels } = fieldsByGroup();
    let html = `<option value="">(select field)</option>`;
    ['value', 'derived', 'extreme'].forEach(g => {
        if (!groups[g]) return;
        html += `<optgroup label="${labels[g]}">` + groups[g].map(f =>
            `<option value="${esc(f.key)}" ${f.key === selected ? 'selected' : ''}>${esc(f.label)}</option>`).join('') + `</optgroup>`;
    });
    return html;
}

/** Min/Max 边界下拉选项：Custom number… + 全部字段（展示人类标签，value 仍是内部 key） */
function boundSelectHtml(selected) {
    let html = `<option value="${NUM}" ${isFieldVal(selected) ? '' : 'selected'}>Custom number…</option>`;
    const { groups, labels } = fieldsByGroup();
    ['value', 'derived', 'extreme'].forEach(g => {
        if (!groups[g]) return;
        html += `<optgroup label="${labels[g]}">` + groups[g].map(f =>
            `<option value="${esc(f.key)}" ${f.key === selected ? 'selected' : ''}>${esc(f.label)}</option>`).join('') + `</optgroup>`;
    });
    return html;
}

class BindingPanel {
    constructor() { this._root = null; }

    init(container) {
        this._root = typeof container === 'string' ? document.querySelector(container) : container;
        if (!this._root) { console.error('[BindingPanel] container not found'); return; }
        specStore.on('select', () => this.render());
        specStore.on('change', () => { if (!this._focusIn) this.render(); });
        this.render();
    }

    render() {
        const layer = specStore.getSelected();
        if (!layer) { this._root.innerHTML = '<div class="sp-empty">Select a layer to configure data bindings</div>'; return; }
        const bindable = BINDABLE[layer.type] || {};
        const props = Object.keys(bindable);
        if (!props.length) { this._root.innerHTML = '<div class="sp-empty">This layer has no bindable properties</div>'; return; }

        this._root.innerHTML = props.map(prop => this._section(layer, prop, bindable[prop])).join('');
        this._bind(layer);
    }

    _section(layer, prop, modes) {
        const b = (layer.bindings && layer.bindings[prop]) || null;
        const curMode = b ? b.mode : 'none';
        return `
            <div class="sp-bind" data-prop="${esc(prop)}">
                <div class="sp-bind-head">
                    <span class="sp-bind-prop">${esc(prop)}</span>
                    <select class="sp-bind-mode" data-prop="${esc(prop)}">
                        ${modes.map(m => `<option value="${m}" ${m === curMode ? 'selected' : ''}>${MODE_LABEL[m] || m}</option>`).join('')}
                    </select>
                </div>
                ${b ? this._params(layer, prop, b) : ''}
            </div>`;
    }

    _params(layer, prop, b) {
        const num = (k, label) => `<label class="sp-mini"><span>${label}</span><input type="number" data-k="${k}" value="${esc(b[k] == null ? '' : b[k])}"></label>`;
        const txt = (k, label, ph) => `<label class="sp-mini"><span>${label}</span><input type="text" data-k="${k}" placeholder="${esc(ph || '')}" value="${esc(b[k] == null ? '' : b[k])}"></label>`;
        const bound = (k, label) => `<label class="sp-mini sp-bound" data-bk="${k}"><span>${label}</span><select class="sp-bind-bound">${boundSelectHtml(b[k])}</select><input type="number" step="any" class="sp-bind-boundnum"${isFieldVal(b[k]) ? ' hidden' : ''} value="${isFieldVal(b[k]) ? '' : esc(b[k] == null ? '' : b[k])}" placeholder="number"></label>`;
        let inner = `<label class="sp-mini"><span>Data field</span><select class="sp-bind-field" data-k="field">${fieldOptions(b.field)}</select></label>`;

        switch (b.mode) {
            case 'text':
                inner += num('decimal', 'Decimals') + txt('suffix', 'Suffix') + txt('prefix', 'Prefix')
                    + `<label class="sp-mini sp-check"><span>Unit</span><input type="checkbox" data-k="unit" ${b.unit ? 'checked' : ''}></label>`;
                break;
            case 'size':
            case 'opacity':
                inner += bound('min', 'Min') + bound('max', 'Max');
                break;
            case 'angle':
                inner += num('from', 'From°') + num('to', 'To°') + bound('min', 'Value min') + bound('max', 'Value max');
                break;
            case 'visible':
                inner += num('threshold', 'Show threshold (≥)');
                break;
            case 'color':
                inner += `<label class="sp-mini"><span>Base color</span><input type="text" data-k="base" value="${esc(b.base || '')}"></label>`;
                inner += `<div class="sp-thr-title">Threshold tiers (use the color when value ≥ threshold)</div>`;
                inner += `<div class="sp-thr-list" data-k="thresholds">${this._thresholds(b.thresholds || [])}</div>`;
                inner += `<button class="sp-btn-mini" data-act="add-thr">+ Add tier</button>`;
                inner += `<div class="sp-hint">Tip: after switching the data field, re-check tier values — units differ per field (bpm vs min/km).</div>`;
                break;
        }
        return `<div class="sp-bind-body">${inner}</div>`;
    }

    _thresholds(list) {
        return list.map((t, i) => `
            <div class="sp-thr-row" data-i="${i}">
                <input type="number" class="sp-thr-gte" placeholder="≥" value="${esc(t.gte == null ? '' : t.gte)}">
                <input type="text" class="sp-thr-color" placeholder="#color" value="${esc(t.color || '')}">
                <button data-act="del-thr" title="Delete">✕</button>
            </div>`).join('');
    }

    _bind(layer) {
        const uid = layer.uid;
        const re = () => this.render();

        // mode 切换：none → 解除；否则建默认参数
        this._root.querySelectorAll('.sp-bind-mode').forEach(sel => {
            sel.addEventListener('change', () => {
                const prop = sel.dataset.prop;
                const m = sel.value;
                if (m === 'none') specStore.setBinding(uid, prop, null);
                else specStore.setBinding(uid, prop, defaultBinding(m, layer, prop));
                re();
            });
        });

        // 参数编辑（作用于当前作用域 binding）
        const collect = (scope) => {
            const prop = scope.dataset.prop;
            const b = Object.assign({}, layer.bindings[prop]);
            scope.querySelectorAll('[data-k]').forEach(inp => {
                const k = inp.dataset.k;
                if (k === 'field') b.field = inp.value;
                else if (k === 'thresholds') return;
                else if (k === 'unit') b.unit = inp.checked;
                else if (inp.type === 'number') b[k] = inp.value === '' ? undefined : Number(inp.value);
                else b[k] = inp.value;
            });
            // 边界控件：下拉选字段 / Custom number… 时取数字框
            scope.querySelectorAll('.sp-bound').forEach(ctl => {
                const sel = ctl.querySelector('.sp-bind-bound');
                const k = ctl.dataset.bk;
                if (sel.value === NUM) {
                    const nv = ctl.querySelector('.sp-bind-boundnum').value;
                    b[k] = nv === '' ? undefined : Number(nv);
                } else b[k] = sel.value;
            });
            return { prop, b };
        };
        const commit = (scope) => {
            const { prop, b } = collect(scope);
            // 合并阈值
            b.thresholds = readThresholds(scope);
            specStore.setBinding(uid, prop, b);
        };

        this._root.querySelectorAll('.sp-bind').forEach(scope => {
            scope.querySelectorAll('[data-k]').forEach(inp => {
                inp.addEventListener('focus', () => { this._focusIn = true; });
                inp.addEventListener('blur', () => { this._focusIn = false; });
                inp.addEventListener('change', () => {
                    if (inp.classList.contains('sp-bind-field')) {
                        // 换数据字段：提交新字段并把默认边界自动重绑（用户手改过的保留）
                        const nb = Object.assign({}, layer.bindings[scope.dataset.prop]);
                        const oldField = nb.field;
                        nb.field = inp.value;
                        remapBounds(nb, oldField, inp.value);
                        specStore.setBinding(uid, scope.dataset.prop, nb);
                        re();
                    } else commit(scope);
                });
                if (inp.type === 'checkbox') inp.addEventListener('change', () => commit(scope));
            });

            // Min/Max 边界：选字段直接提交；选 Custom number… 切到数字框
            scope.querySelectorAll('.sp-bound').forEach(ctl => {
                const sel = ctl.querySelector('.sp-bind-bound');
                const num = ctl.querySelector('.sp-bind-boundnum');
                sel.addEventListener('change', () => {
                    if (sel.value === NUM) { num.hidden = false; num.focus(); }
                    else num.hidden = true;
                    commit(scope);
                });
                num.addEventListener('focus', () => { this._focusIn = true; });
                num.addEventListener('blur', () => { this._focusIn = false; commit(scope); });
                num.addEventListener('change', () => commit(scope));
            });

            const addThr = scope.querySelector('[data-act="add-thr"]');
            if (addThr) addThr.addEventListener('click', () => {
                const prop = scope.dataset.prop;
                const b = Object.assign({}, layer.bindings[prop]);
                b.thresholds = (b.thresholds || []).concat([{ gte: 0, color: '#32cd79' }]);
                specStore.setBinding(uid, prop, b); re();
            });

            scope.querySelectorAll('.sp-thr-row [data-act="del-thr"]').forEach(btn => {
                btn.addEventListener('click', () => {
                    const i = parseInt(btn.closest('.sp-thr-row').dataset.i, 10);
                    const prop = scope.dataset.prop;
                    const b = Object.assign({}, layer.bindings[prop]);
                    b.thresholds = (b.thresholds || []).slice(); b.thresholds.splice(i, 1);
                    specStore.setBinding(uid, prop, b); re();
                });
            });
        });
    }
}

function readThresholds(scope) {
    if (!scope.querySelector('.sp-thr-list')) return undefined;
    const rows = scope.querySelectorAll('.sp-thr-row');
    const out = [];
    rows.forEach(row => {
        const gte = row.querySelector('.sp-thr-gte').value;
        const color = row.querySelector('.sp-thr-color').value;
        if (color) out.push({ gte: gte === '' ? 0 : Number(gte), color });
    });
    return out;
}

export const bindingPanel = new BindingPanel();
export { BINDABLE, MODE_LABEL };
