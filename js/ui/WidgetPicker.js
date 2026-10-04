/**
 * WidgetPicker.js - 左侧组件选择面板
 * 从组件注册表读取所有可用组件，按分类展示图标，
 * 点击图标将组件添加到画布
 */

import { registry } from '../components/registry.js';
import { addComponentToCanvas } from '../components/factory.js';
import { store } from '../core/Store.js';
import { canvasManager } from '../core/CanvasManager.js';
import { eventBus, Events } from '../core/EventBus.js';

// 分类显示名（对齐老款程序 8 个 Tab）
const CATEGORY_LABELS = {
    time: 'Time',
    distance: 'Dist.',
    map: 'Map',
    chart: 'Chart',
    attr: 'Attr',
    text: 'Text',
    cycling: 'Cycling',
    theme: 'Theme'
};

// background 为特殊层，不在选择面板中展示
const CATEGORY_ORDER = ['time', 'distance', 'map', 'chart', 'attr', 'text', 'cycling', 'theme'];

// 分类对应的 layui 图标（对齐老款程序）
const CATEGORY_ICONS = {
    time: 'layui-icon-log',
    distance: 'layui-icon-next',
    map: 'layui-icon-location',
    chart: 'layui-icon-chart',
    attr: 'layui-icon-console',
    text: 'layui-icon-fonts-strong',
    cycling: 'layui-icon-engine',
    theme: 'layui-icon-theme'
};

class WidgetPicker {
    constructor() {
        this._container = null;
        this._currentCategory = null;
    }

    /**
     * 初始化组件选择面板
     * @param {HTMLElement|string} container - 挂载容器（#widgetList）
     */
    init(container) {
        this._container = typeof container === 'string'
            ? document.querySelector(container)
            : container;

        if (!this._container) {
            console.error('[WidgetPicker] Container not found');
            return;
        }

        this._render();
        this._bindCategoryTabs();

        // 默认显示第一个分类
        const categories = this._getCategories();
        if (categories.length > 0) {
            this._showCategory(categories[0]);
        }

        console.log(`[WidgetPicker] Initialized with ${registry.getIds().length} components`);
    }

    /**
     * 渲染分类 Tab 标签
     */
    _render() {
        const categories = this._getCategories();
        const tabHeader = document.getElementById('tabHeader');
        if (!tabHeader) return;

        // 保留 DashB 标题，清除其他 tab
        const dashTitle = tabHeader.querySelector('.layui-col-md12');
        // 移除已有的 tab 标签（保留标题）
        tabHeader.querySelectorAll('.tab').forEach(el => el.remove());

        // 为每个分类创建 tab
        categories.forEach((cat, idx) => {
            const tab = document.createElement('div');
            tab.className = 'tab layui-btn-primary' + (idx === 0 ? ' layui-this' : '');
            tab.dataset.category = cat;
            tab.innerHTML = `
                <i class="layui-icon ${CATEGORY_ICONS[cat] || 'layui-icon-star'} iconcc"></i>
                <div class="docs-icon-name">${CATEGORY_LABELS[cat] || cat}</div>
            `;
            tabHeader.appendChild(tab);
        });
    }

    /**
     * 绑定分类 Tab 点击事件
     */
    _bindCategoryTabs() {
        const tabHeader = document.getElementById('tabHeader');
        if (!tabHeader) return;

        tabHeader.addEventListener('click', (e) => {
            const tab = e.target.closest('.tab');
            if (!tab || !tab.dataset.category) return;

            // 切换 active 样式
            tabHeader.querySelectorAll('.tab').forEach(t => t.classList.remove('layui-this'));
            tab.classList.add('layui-this');

            this._showCategory(tab.dataset.category);
        });
    }

    /**
     * 显示指定分类的组件列表（仅原生手写组件；studio 制作的视觉组件在“本地/共享”面板展示）
     * @param {string} category
     */
    _showCategory(category) {
        this._currentCategory = category;
        const components = registry.getByCategory(category).filter(def => !def.isVisual);

        if (!this._container) return;

        if (components.length === 0) {
            this._container.innerHTML = '<div style="padding:20px;text-align:center;color:#999;font-size:12px;">No components in this category</div>';
            return;
        }

        let html = '<div class="layui-show"><div class="layui-row layui-col-space10">';
        components.forEach(def => {
            const iconSrc = def.icon || '';
            const iconHtml = iconSrc
                ? `<img src="${iconSrc}" onerror="this.style.display='none'">`
                : '';

            html += `
                <div class="layui-col-sm12">
                    <div class="layui-anim" data-component-id="${def.id}">${iconHtml}</div>
                    <div>${def.name}</div>
                </div>
            `;
        });
        html += '</div></div>';
        this._container.innerHTML = html;

        // 绑定组件图标点击事件 - 直接在 data-component-id 元素上绑定
        this._container.querySelectorAll('[data-component-id]').forEach(el => {
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = el.dataset.componentId;
                console.log('[WidgetPicker] Clicked component:', id);
                this._onComponentClick(id);
            });
        });

        console.log(`[WidgetPicker] Rendered ${components.length} components for category "${category}"`);
    }

    /**
     * 处理组件图标点击：添加到画布
     * @param {string} componentId
     */
    _onComponentClick(componentId) {
        console.log(`[WidgetPicker] _onComponentClick: ${componentId}`);

        // 未上传数据时禁止添加组件（同老款程序）
        const trkpt = store.get('trkptData');
        if (!trkpt || trkpt.length === 0) {
            alert('Please upload gpx, tcx, fit data files first');
            return;
        }

        // 检查画布上是否已有该组件（同老款程序，每个组件只能添加 1 个，编辑时必须通过 id 绑定）
        const frame = canvasManager.frame;
        if (frame) {
            try {
                const found = frame.find('#' + componentId);
                const existing = Array.isArray(found) ? found : (found ? [found] : []);
                if (existing.length > 0) {
                    console.log(`[WidgetPicker] Component "${componentId}" already on canvas (single-instance enforced)`);
                    eventBus.emit(Events.COMPONENT_SELECTED, componentId);
                    return;
                }
            } catch (e) {
                console.warn('[WidgetPicker] findOne error:', e.message);
            }
        } else {
            console.warn('[WidgetPicker] No frame found in store');
        }

        // 添加到画布
        try {
            const box = addComponentToCanvas(componentId);
            if (box) {
                console.log(`[WidgetPicker] Added component: ${componentId}`);
            } else {
                console.warn(`[WidgetPicker] addComponentToCanvas returned null for: ${componentId}`);
            }
        } catch (err) {
            console.error(`[WidgetPicker] Error adding component ${componentId}:`, err);
        }
    }

    /**
     * 刷新面板（自定义组件异步加载完成后调用）：重建分类 Tab + 重显当前分类。
     * 分类点击为事件委托绑定（见 _bindCategoryTabs），故无需重复绑定。
     */
    refresh() {
        if (!this._container) return;
        this._render();
        const cats = this._getCategories();
        const target = cats.includes(this._currentCategory) ? this._currentCategory : cats[0];
        if (target) this._showCategory(target);
    }

    /**
     * 获取已注册的所有分类（按预定义顺序排列，排除 background 特殊层）
     * @returns {string[]}
     */
    _getCategories() {
        // 只保留定义中明确列入 CATEGORY_ORDER 的分类（background 被排除）
        const registered = registry.getCategories().filter(c => c !== 'background');
        // 按预定义顺序排序，未知分类追加在后
        return CATEGORY_ORDER.filter(c => registered.includes(c))
            .concat(registered.filter(c => !CATEGORY_ORDER.includes(c)));
    }
}

// 单例导出
export const widgetPicker = new WidgetPicker();
