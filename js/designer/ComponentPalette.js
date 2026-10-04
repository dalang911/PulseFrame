/**
 * ComponentPalette.js - 组件面板（拖拽源）
 * 从组件注册表读取所有可用组件，按分类展示，支持拖拽到画布
 */

import { registry } from '../components/registry.js';

const CATEGORY_LABELS = {
    background: 'Background',
    info: 'Info',
    chart: 'Chart',
    gauge: 'Gauge',
    map: 'Map',
    table: 'Table',
    progress: 'Progress'
};

const CATEGORY_ICONS = {
    background: '🎨',
    info: 'ℹ️',
    chart: '📊',
    gauge: '🎯',
    map: '🗺️',
    table: '📋',
    progress: '📏'
};

class ComponentPalette {
    constructor() {
        this._container = null;
        this._filterKeyword = '';
    }

    /**
     * 初始化面板
     * @param {HTMLElement|string} container
     */
    init(container) {
        this._container = typeof container === 'string'
            ? document.querySelector(container)
            : container;

        if (!this._container) {
            console.error('[ComponentPalette] Container not found');
            return;
        }

        this._render();
        this._bindSearch();
    }

    /**
     * 渲染组件列表
     */
    _render() {
        const allDefs = registry.getAll();
        const categories = registry.getCategories();

        // 按关键词过滤
        let filtered = allDefs;
        if (this._filterKeyword) {
            const kw = this._filterKeyword.toLowerCase();
            filtered = allDefs.filter(d =>
                d.name.toLowerCase().includes(kw) ||
                d.id.toLowerCase().includes(kw) ||
                (d.category || '').toLowerCase().includes(kw)
            );
        }

        // 按分类分组
        const grouped = {};
        filtered.forEach(def => {
            const cat = def.category || 'other';
            if (!grouped[cat]) grouped[cat] = [];
            grouped[cat].push(def);
        });

        let html = '';
        for (const cat of categories) {
            const items = grouped[cat];
            if (!items || items.length === 0) continue;

            const label = CATEGORY_LABELS[cat] || cat;
            const icon = CATEGORY_ICONS[cat] || '📦';

            html += `<div class="palette-category">`;
            html += `<div class="palette-category-title">${icon} ${label}</div>`;

            for (const def of items) {
                html += `
                    <div class="palette-item" draggable="true" data-component-id="${def.id}">
                        <div class="palette-icon">${icon}</div>
                        <span class="palette-name">${def.name}</span>
                    </div>
                `;
            }

            html += `</div>`;
        }

        if (!html) {
            html = '<div style="text-align:center;color:#999;padding:20px;font-size:12px;">No matching components</div>';
        }

        this._container.innerHTML = html;
        this._bindDrag();
    }

    /**
     * 绑定搜索
     */
    _bindSearch() {
        const searchInput = document.getElementById('componentSearch');
        if (!searchInput) return;

        let timer;
        searchInput.addEventListener('input', () => {
            clearTimeout(timer);
            timer = setTimeout(() => {
                this._filterKeyword = searchInput.value.trim();
                this._render();
            }, 200);
        });
    }

    /**
     * 绑定拖拽事件
     */
    _bindDrag() {
        this._container.querySelectorAll('.palette-item').forEach(item => {
            item.addEventListener('dragstart', (e) => {
                const componentId = item.dataset.componentId;
                e.dataTransfer.setData('text/plain', componentId);
                e.dataTransfer.effectAllowed = 'copy';
                item.style.opacity = '0.5';
            });

            item.addEventListener('dragend', () => {
                item.style.opacity = '1';
            });
        });
    }

    /**
     * 刷新面板（注册表变化时调用）
     */
    refresh() {
        this._render();
    }
}

export const componentPalette = new ComponentPalette();
