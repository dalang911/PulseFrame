/**
 * PropertyEditor.js - 设计器属性编辑器
 *
 * 共用逻辑已抽取到 PropertyRenderer.js，本文件只负责：
 *   1. 布局属性区（x/y/width/height/rotation）
 *   2. 组件自定义设置区（委托 renderSettings）
 *   3. 操作按钮区（删除/复制/置顶/置底）
 */

import { registry } from '../components/registry.js';
import {
    renderSettings,
    getNestedValue,
    setNestedValue,
    LAYOUT_KEYS
} from '../ui/PropertyRenderer.js';

class PropertyEditor {
    constructor() {
        this._container = null;
        this._currentBox = null;
        this._currentDefinition = null;
        this._cleanups = [];
    }

    /**
     * 初始化
     * @param {HTMLElement|string} container
     */
    init(container) {
        this._container = typeof container === 'string'
            ? document.querySelector(container)
            : container;
    }

    /**
     * 设置选中的组件并渲染属性编辑 UI
     * @param {Object} box - Leafer Box 实例
     */
    selectComponent(box) {
        this._cleanups.forEach(fn => typeof fn === 'function' && fn());
        this._cleanups = [];

        this._currentBox = box;

        if (!box || !box.id) {
            this._showEmpty();
            return;
        }

        this._currentDefinition = registry.get(box.id);
        if (!this._currentDefinition) {
            this._showEmpty();
            return;
        }

        this._render();
    }

    /**
     * 清空显示
     */
    _showEmpty() {
        if (this._container) {
            this._container.innerHTML = '<div class="property-empty">Select a component to edit its properties</div>';
        }
        this._currentBox = null;
        this._currentDefinition = null;
    }

    /**
     * 渲染属性编辑器
     */
    _render() {
        if (!this._container || !this._currentBox || !this._currentDefinition) return;

        const box = this._currentBox;
        const def = this._currentDefinition;
        const config = box.__leaferConfig || def.defaultConfig || {};

        // 保存 config 引用供 onChange 使用
        this._currentConfig = config;

        this._container.innerHTML = '';

        // === 基本信息 ===
        this._container.appendChild(this._createGroup('Basic Info', [
            { label: 'ID', html: `<span style="color:#999;font-size:11px;">${box.id}</span>` },
            { label: 'Name', html: `<span style="font-size:12px;">${def.name}</span>` }
        ]));

        // === 布局属性 ===
        const layoutGroup = document.createElement('div');
        layoutGroup.className = 'property-group';
        layoutGroup.innerHTML = `<div class="property-group-title">Layout</div>`;
        this._cleanups = renderSettings(layoutGroup, [
            { name: 'X', key: 'x', type: 'number' },
            { name: 'Y', key: 'y', type: 'number' },
            { name: 'Width', key: 'width', type: 'number' },
            { name: 'Height', key: 'height', type: 'number' },
            { name: 'Rotation', key: 'rotation', type: 'number', min: 0, max: 360 }
        ], box, (key, value) => this._onLayoutChange(key, value), {
            useNativeColor: true,  // 设计器用原生 color input（轻量）
            cssPrefix: 'designer-'
        });
        this._container.appendChild(layoutGroup);

        // === 组件自定义设置 ===
        if (def.settings && def.settings.length > 0) {
            const styleGroup = document.createElement('div');
            styleGroup.className = 'property-group';
            styleGroup.innerHTML = `<div class="property-group-title">Style Settings</div>`;
            const styleCleanups = renderSettings(styleGroup, def.settings, config,
                (key, value) => this._onStyleChange(key, value), {
                    useNativeColor: true,
                    cssPrefix: 'designer-'
                });
            this._cleanups.push(...styleCleanups);
            this._container.appendChild(styleGroup);
        }

        // === 操作按钮 ===
        const actionGroup = document.createElement('div');
        actionGroup.className = 'property-group';
        actionGroup.innerHTML = `
            <div class="property-group-title">Actions</div>
            <div style="display:flex;gap:6px;padding:4px 0;">
                <button class="layui-btn layui-btn-xs layui-btn-danger" id="btnDeleteComponent">Delete</button>
                <button class="layui-btn layui-btn-xs" id="btnDuplicateComponent">Duplicate</button>
                <button class="layui-btn layui-btn-xs layui-btn-normal" id="btnBringFront">Bring to Front</button>
                <button class="layui-btn layui-btn-xs" id="btnSendBack">Send to Back</button>
            </div>
        `;
        this._container.appendChild(actionGroup);
        this._bindActionButtons();
    }

    /**
     * 创建一个属性分组 DOM
     */
    _createGroup(title, rows) {
        const group = document.createElement('div');
        group.className = 'property-group';
        let html = `<div class="property-group-title">${title}</div>`;
        rows.forEach(r => {
            html += `<div class="property-row designer-property-row">
                <span class="designer-property-label property-label">${r.label}</span>
                <span class="designer-property-value property-value">${r.html}</span>
            </div>`;
        });
        group.innerHTML = html;
        return group;
    }

    /**
     * 布局属性变更 → 直接作用于 Box
     */
    _onLayoutChange(key, value) {
        if (!this._currentBox) return;
        this._currentBox[key] = value;
    }

    /**
     * 样式属性变更 → 更新 config（设计器中不重建，由导出器处理）
     */
    _onStyleChange(key, value) {
        if (!this._currentConfig) return;
        setNestedValue(this._currentConfig, key, value);
    }

    /**
     * 绑定操作按钮事件
     */
    _bindActionButtons() {
        if (!this._container || !this._currentBox) return;

        // 删除
        const deleteBtn = this._container.querySelector('#btnDeleteComponent');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => {
                if (this._currentBox && this._currentBox.parent) {
                    this._currentBox.parent.remove(this._currentBox);
                    this._showEmpty();
                }
            });
        }

        // 复制
        const duplicateBtn = this._container.querySelector('#btnDuplicateComponent');
        if (duplicateBtn) {
            duplicateBtn.addEventListener('click', () => {
                if (this._currentBox && this._currentBox.parent) {
                    const box = this._currentBox;
                    const parent = box.parent;
                    import('../components/factory.js').then(({ createComponent }) => {
                        const newBox = createComponent(box.id, {
                            x: (box.x || 0) + 20,
                            y: (box.y || 0) + 20,
                            width: box.width,
                            height: box.height
                        });
                        if (newBox) parent.add(newBox);
                    });
                }
            });
        }

        // 置顶
        const frontBtn = this._container.querySelector('#btnBringFront');
        if (frontBtn && this._currentBox) {
            frontBtn.addEventListener('click', () => {
                const box = this._currentBox;
                const parent = box.parent;
                if (parent) { parent.remove(box); parent.add(box); }
            });
        }

        // 置底
        const backBtn = this._container.querySelector('#btnSendBack');
        if (backBtn && this._currentBox) {
            backBtn.addEventListener('click', () => {
                const box = this._currentBox;
                const parent = box.parent;
                if (parent) {
                    parent.remove(box);
                    if (parent.children.length > 0) {
                        parent.children[0].add(box, 0);
                    } else {
                        parent.add(box);
                    }
                }
            });
        }
    }

    /**
     * 刷新当前属性显示
     */
    refresh() {
        if (this._currentBox) {
            this._render();
        }
    }
}

export const propertyEditor = new PropertyEditor();
