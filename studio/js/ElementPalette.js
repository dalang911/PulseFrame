/**
 * studio/ElementPalette.js - 左侧元素/组件块面板
 *
 * 两类：
 *   1) 基础元素：rect / ellipse / arc / line / text / svg / group —— 插入单个图层
 *      （图标走 svg：点 SVG Icon 先落一个占位三角形，真代码在右侧属性面板里换，上限 10 KB）
 *   2) 预封装块：数值文本、进度条、环形仪表、面板底 —— 一次插入一个 group（含默认绑定，可再编辑）
 * 低门槛优先：块即"图层语法糖"，插入后仍可逐项改属性/绑定/层叠。
 */

import { specStore } from './SpecStore.js';
import { makeLayer } from './runtime/spec.js';
import { fieldDemo } from './FieldDemo.js';
import { loadFrontendDefs, importDef } from './FrontendGauges.js';

const BASIC = [
    { type: 'rect', label: 'Rect' },
    { type: 'ellipse', label: 'Ellipse' },
    { type: 'arc', label: 'Arc / Ring' },
    { type: 'line', label: 'Line' },
    { type: 'text', label: 'Text' },
    { type: 'svg', label: 'SVG Icon' },
    { type: 'group', label: 'Group' }
];

const ICONFONT_URL = 'https://www.iconfont.cn/collections';

// ===== 预封装块（返回构成 group.children 的图层数组）=====
function blockValueText() {
    return {
        label: 'Value Text',
        build() {
            const bg = makeLayer('rect', { name: 'Bg', props: { x: 0, y: 0, width: 300, height: 120, fill: '#191970', cornerRadius: 12 } });
            const label = makeLayer('text', { name: 'Label', props: { x: 24, y: 14, text: 'Distance', fontSize: 26, fontWeight: 'bold', fill: '#CCCCCC' } });
            const value = makeLayer('text', {
                name: 'Value',
                props: { x: 24, y: 52, text: '0.00', fontSize: 52, fontWeight: 'black', fill: '#FF7F00' },
                bindings: { text: { mode: 'text', field: 'km', decimal: 2, unit: true, unitKey: 'distance' } }
            });
            return [bg, label, value];
        }
    };
}
function blockProgressBar() {
    return {
        label: 'Progress Bar',
        build() {
            const bg = makeLayer('rect', { name: 'Track', props: { x: 0, y: 0, width: 400, height: 30, fill: '#333344', cornerRadius: 15 } });
            const fg = makeLayer('rect', {
                name: 'Fill', props: { x: 0, y: 0, width: 400, height: 30, fill: '#FFCC00', cornerRadius: 15 },
                bindings: { width: { mode: 'size', field: 'distance', prop: 'width', min: 0, max: 'totalDistance' } }
            });
            const val = makeLayer('text', {
                name: 'Value', props: { x: 0, y: -40, text: '0', fontSize: 30, fontWeight: 'black', fill: '#FFFFFF' },
                bindings: { text: { mode: 'text', field: 'km', decimal: 2, suffix: ' Km' } }
            });
            return [bg, fg, val];
        }
    };
}
function blockRingGauge() {
    return {
        label: 'Ring Gauge',
        build() {
            const bg = makeLayer('arc', { name: 'Ring Bg', props: { x: 0, y: 0, width: 200, height: 200, innerRadius: 1, startAngle: -210, endAngle: 30, stroke: '#333344', strokeWidth: 24, strokeCap: 'round', strokeWidthFixed: false, strokeAlign: 'center' } });
            const fg = makeLayer('arc', {
                name: 'Ring Fill', props: { x: 0, y: 0, width: 200, height: 200, innerRadius: 1, startAngle: -210, endAngle: 30, stroke: '#32cd79', strokeWidth: 24, strokeCap: 'round', strokeWidthFixed: false, strokeAlign: 'center' },
                bindings: { endAngle: { mode: 'angle', field: 'heart_rate', prop: 'endAngle', min: 'heartRateMin', max: 'user_heartRateMax', from: -210, to: 30 } }
            });
            const val = makeLayer('text', {
                name: 'Value', props: { x: 60, y: 80, text: '0', fontSize: 44, fontWeight: 'black', fill: '#FFFFFF' },
                bindings: { text: { mode: 'text', field: 'heart_rate', decimal: 0 } }
            });
            return [bg, fg, val];
        }
    };
}
function blockPanel() {
    return {
        label: 'Panel Bg',
        build() {
            return [makeLayer('rect', { name: 'Panel', props: { x: 0, y: 0, width: 360, height: 200, fill: '#00000080', cornerRadius: 16 } })];
        }
    };
}

const BLOCKS = [blockValueText, blockProgressBar, blockRingGauge, blockPanel].map(fn => fn());

class ElementPalette {
    constructor() { this._root = null; }

    init(container) {
        this._root = typeof container === 'string' ? document.querySelector(container) : container;
        if (!this._root) { console.error('[ElementPalette] container not found'); return; }
        this._render();
    }

    _render() {
        const esc = (s) => String(s).replace(/"/g, '&quot;');
        this._root.innerHTML = `
            <div class="sp-sec">
                <div class="sp-sec-title">Preset Blocks</div>
                <div class="sp-grid">
                    ${BLOCKS.map((b, i) => `<button class="sp-chip sp-chip-block" data-block="${i}">${esc(b.label)}</button>`).join('')}
                    <button class="sp-chip sp-chip-block" data-fielddemo title="Generate a text preview of every bindable data field at once (with name/unit, color-grouped, laid out on a grid)">Data Demo</button>
                </div>
            </div>
            <div class="sp-sec">
                <div class="sp-sec-title">Basic Elements</div>
                <div class="sp-grid">
                    ${BASIC.map((b, i) => `<button class="sp-chip" data-basic="${b.type}" ${b.type === 'svg' ? 'title="Insert a placeholder icon layer, then replace its SVG code in Properties"' : ''}>${esc(b.label)}</button>`).join('')}
                </div>
                <div class="sp-svg-tip">
                    <b>SVG Icon</b> inserts a placeholder triangle — select it and replace the code in <b>Properties → SVG code</b> (max 10 KB). Grab SVG code from
                    <a href="${ICONFONT_URL}" target="_blank" rel="noopener noreferrer">iconfont.cn · collections</a>
                </div>
            </div>
            <div class="sp-sec">
                <div class="sp-sec-title" title="Import dashboards already defined by the front-end video panel and convert them into editable layers (per-frame update is not carried over, you need to re-add data bindings; save local / submit stores it as a new component)">Front-end Dashboards</div>
                <div class="sp-row" style="margin:0 0 6px">
                    <select id="spFeCat" style="flex:1"><option value="">Loading…</option></select>
                </div>
                <div class="sp-grid" id="spFeList"></div>
                <div id="spFeStatus" style="font-size:11px;color:#8a8a9a;margin-top:4px;word-break:break-all"></div>
            </div>
        `;

        this._root.querySelectorAll('[data-basic]').forEach(btn => {
            btn.addEventListener('click', () => this._insertBasic(btn.dataset.basic));
        });
        this._root.querySelectorAll('[data-block]').forEach(btn => {
            btn.addEventListener('click', () => this._insertBlock(parseInt(btn.dataset.block, 10)));
        });
        this._root.querySelectorAll('[data-fielddemo]').forEach(btn => {
            btn.addEventListener('click', () => fieldDemo.generate());
        });
        this._initFrontendSection();
    }

    // ===== 前端仪表盘分类菜单（异步加载定义，失败可重试）=====
    _initFrontendSection() {
        const esc = (s) => String(s == null ? '' : s).replace(/"/g, '&quot;').replace(/</g, '&lt;');
        const catSel = this._root.querySelector('#spFeCat');
        const list = this._root.querySelector('#spFeList');
        const status = this._root.querySelector('#spFeStatus');
        const renderList = () => {
            if (!this._fe) return;
            const defs = this._fe.byCat[catSel.value] || [];
            list.innerHTML = defs.map(d => `<button class="sp-chip" data-fegauges="${esc(d.id)}" title="${esc(d.id)}">${esc(d.name || d.id)}</button>`).join('') || '<span style="font-size:12px;color:#8a8a9a">No components in this category</span>';
            list.querySelectorAll('[data-fegauges]').forEach(btn => {
                btn.addEventListener('click', () => {
                    const def = this._fe.defs.find(d => d.id === btn.dataset.fegauges);
                    try {
                        const r = importDef(def);
                        status.textContent = `Imported "${def.name || def.id}" ${r.count} layers` + (r.skipped.length ? `, skipped ${r.skipped.length} unsupported element(s) (${r.skipped.join(', ')})` : '');
                    } catch (e) {
                        status.textContent = `Import failed: ${e.message}`;
                    }
                });
            });
        };
        catSel.addEventListener('change', renderList);
        loadFrontendDefs().then(res => {
            this._fe = res;
            catSel.innerHTML = res.categories.map(c => `<option value="${c}">${res.labels[c] || c} (${res.byCat[c].length})</option>`).join('');
            renderList();
        }).catch(e => {
            catSel.innerHTML = '<option value="">Load failed</option>';
            status.textContent = `Failed to load front-end components: ${e.message}`;
        });
    }

    _insertBasic(type) {
        specStore.addLayer(type, type === 'svg' ? { name: 'Icon' } : undefined);
    }

    _insertBlock(i) {
        const block = BLOCKS[i];
        if (!block) return;
        const layers = block.build();
        // 包成 group，便于整体移动，子层仍可单独选中
        const group = makeLayer('group', { name: block.label, children: layers, props: { x: 60, y: 60 } });
        specStore.addLayers([group]);
    }
}

export const elementPalette = new ElementPalette();
export { BASIC, BLOCKS };
