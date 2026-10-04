/**
 * SettingsPanel.js - 右侧设置面板（主编辑器）
 *
 * 替代原 tosettable.js，根据组件的 settings 定义自动生成设置 UI。
 * 共用逻辑已抽取到 PropertyRenderer.js，本文件只负责：
 *   1. 监听事件 → 找到对应 Box/definition/config
 *   2. 调用 renderSettings() 生成 UI
 *   3. 变更时调用 applyPropertyChange() + rebuildBoxChildren()
 */

import { eventBus, Events } from '../core/EventBus.js';
import { store } from '../core/Store.js';
import { canvasManager } from '../core/CanvasManager.js';
import { registry } from '../components/registry.js';
import { updateComponent } from '../components/updater.js';
import { removeComponentFromCanvas } from '../components/factory.js';
import {
    renderSettings,
    applyPropertyChange,
    rebuildBoxChildren,
    getNestedValue,
    setNestedValue
} from './PropertyRenderer.js';

class SettingsPanel {
    constructor() {
        this._container = null;
        this._currentComponentId = null;
        this._currentBox = null;
        this._currentConfig = null;
        this._cleanups = [];
    }

    /**
     * 初始化，绑定事件
     */
    init() {
        this._container = document.getElementById('settable');

        // 监听组件选中 → 显示设置
        eventBus.on(Events.SETTINGS_SHOW, (data) => {
            this.show(data);
        });

        // 监听画布点击/列表重复点击（payload 为组件 id 字符串）→ 解析后显示面板
        eventBus.on(Events.COMPONENT_SELECTED, (data) => {
            if (typeof data !== 'string') return;
            const definition = registry.get(data);
            const frame = canvasManager.frame;
            if (!definition || !frame) return;

            const found = frame.find('#' + data);
            const box = Array.isArray(found) ? found[0] : (found || null);
            if (!box) return;

            this.show({
                componentId: data,
                definition,
                config: box.__leaferConfig || definition.defaultConfig || {},
                box
            });
        });
    }

    /**
     * 显示组件设置面板
     * @param {Object} params - { componentId, definition, config, box }
     */
    show({ componentId, definition, config, box }) {
        if (!this._container) {
            this._container = document.getElementById('settable');
        }
        if (!this._container || !definition) return;

        // 清理旧面板的 layui 渲染器
        this._cleanups.forEach(fn => typeof fn === 'function' && fn());
        this._container.innerHTML = '';
        this._cleanups = [];

        this._currentComponentId = componentId;
        this._currentBox = box;
        this._currentConfig = config;

        // 面板标题（紧凑）+ 移除按钮在右侧（背景组件不显示移除按钮）
        const header = document.createElement('div');
        header.style.cssText = 'padding:4px 8px; font-size:12px; font-weight:bold; border-bottom:1px solid #ddd; background:#fff; display:flex; align-items:center; justify-content:space-between; gap:6px;';
        const titleSpan = document.createElement('span');
        titleSpan.style.cssText = 'flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;';
        titleSpan.textContent = `⚙ ${definition.name || componentId}`;
        titleSpan.title = componentId;
        header.appendChild(titleSpan);

        // 背景组件（isBackground: true）不允许移除，不显示 Remove 按钮
        if (!definition.isBackground) {
            const removeBtn = document.createElement('button');
            removeBtn.textContent = 'Remove';
            removeBtn.title = 'Remove component';
            removeBtn.className = 'layui-btn layui-btn-danger layui-btn-xs';
            removeBtn.style.cssText = 'flex:0 0 auto; height:22px; line-height:22px; padding:0 8px; font-size:11px; border-radius:3px;';
            removeBtn.onclick = () => {
                removeComponentFromCanvas(componentId);
                this.clear();
            };
            header.appendChild(removeBtn);
        }
        this._container.appendChild(header);

        // 坐标/尺寸表单（X/Y、W/H），紧跟标题插入在面板最上面（移植自老版 tosettable.js）
        const positionCleanup = this._renderPositionBox(box, definition);

        // 使用共用引擎渲染设置项（放入带小内边距的容器）
        const bodyWrap = document.createElement('div');
        bodyWrap.style.cssText = 'padding:6px 8px;';
        this._container.appendChild(bodyWrap);
        const settings = definition.settings || [];
        this._cleanups = renderSettings(
            bodyWrap,
            settings,
            config,
            (key, value) => this._onPropertyChange(key, value),
            { useNativeColor: false }  // 主编辑器用 layui colorpicker
        );

        // 面板重绘/清空时解除表单的 Box 事件监听
        if (typeof positionCleanup === 'function') {
            this._cleanups.push(positionCleanup);
        }

        // 设置项渲染完毕（不再单独添加移除按钮）
    }

    /**
     * 坐标/尺寸表单（老版 tosettable.js 的 X/Y W/H 两行输入）
     * 背景层固定铺满画布且已锁定，不显示该表单。
     * X/Y 直接赋值；W/H 优先用 resizeWidth/resizeHeight（resizeChildren 会等比缩放子元素）。
     * 监听 Box 的 property.change 事件：拖拽/缩放组件时表单数值实时同步。
     * @returns {Function|null} 解除监听的清理函数
     */
    _renderPositionBox(box, definition) {
        if (!box || definition.isBackground) return null;

        const wrap = document.createElement('div');
        wrap.style.cssText = 'padding:4px 8px; border-bottom:1px solid #eee; background:#fafafa; display:flex; flex-direction:column; gap:4px;';

        const fmt = (v) => Math.round(Number(v) * 100) / 100;
        const inputs = {};

        const createField = (label, key, value, onApply) => {
            const col = document.createElement('label');
            col.style.cssText = 'flex:1; min-width:0; display:flex; align-items:center; gap:4px; font-size:11px; font-weight:bold; color:#666;';
            // 标签固定宽度，避免 X/Y/W/H 字符宽度不同导致输入框左右不对齐
            const lab = document.createElement('span');
            lab.textContent = label;
            lab.style.cssText = 'flex:0 0 12px; width:12px; text-align:center;';
            const input = document.createElement('input');
            input.type = 'number';
            input.step = 'any';
            input.value = value;
            input.style.cssText = 'flex:1; min-width:0; height:22px; padding:1px 4px; font-size:11px; border:1px solid #ddd; border-radius:3px; box-sizing:border-box;';
            input.onchange = function () {
                const v = parseFloat(this.value);
                if (!isNaN(v)) onApply(v);
            };
            inputs[key] = input;
            col.append(lab, input);
            return col;
        };

        const mkRow = (fields) => {
            const row = document.createElement('div');
            row.style.cssText = 'display:flex; gap:6px;';
            fields.forEach((f) => row.appendChild(f));
            return row;
        };

        const applyOne = (key, v) => {
            if ((key === 'width' || key === 'height') && typeof box[key === 'width' ? 'resizeWidth' : 'resizeHeight'] === 'function') {
                box[key === 'width' ? 'resizeWidth' : 'resizeHeight'](v);
            } else {
                box[key] = v;
            }
            applyPropertyChange(box, key, v, this._currentConfig, null);
            eventBus.emit(Events.COMPONENT_UPDATED, {
                id: this._currentComponentId,
                key,
                value: v
            });
        };

        wrap.appendChild(mkRow([
            createField('X', 'x', fmt(box.x), (v) => applyOne('x', v)),
            createField('Y', 'y', fmt(box.y), (v) => applyOne('y', v))
        ]));
        wrap.appendChild(mkRow([
            createField('W', 'width', fmt(box.width), (v) => applyOne('width', v)),
            createField('H', 'height', fmt(box.height), (v) => applyOne('height', v))
        ]));

        this._container.appendChild(wrap);

        // 动态同步：Box 任意属性变化（编辑器拖拽/缩放、表单回填）都刷新数值；
        // 正在编辑的输入框不覆盖，避免打断输入
        const sync = () => {
            const values = { x: box.x, y: box.y, width: box.width, height: box.height };
            for (const key in inputs) {
                const el = inputs[key];
                if (document.activeElement !== el) {
                    const v = fmt(values[key]);
                    if (Number(el.value) !== v) el.value = v;
                }
            }
        };
        box.on('property.change', sync);
        box.on('bounds.world', sync);

        return () => {
            if (typeof box.off === 'function') {
                box.off('property.change', sync);
                box.off('bounds.world', sync);
            }
        };
    }

    /**
     * 清空面板
     */
    clear() {
        this._cleanups.forEach(fn => typeof fn === 'function' && fn());
        this._cleanups = [];
        if (this._container) {
            this._container.innerHTML = '';
        }
        this._currentComponentId = null;
        this._currentBox = null;
        this._currentConfig = null;
    }

    /**
     * 属性变更回调 → 应用到 Box 并刷新当前帧
     */
    _onPropertyChange(key, value) {
        applyPropertyChange(
            this._currentBox,
            key,
            value,
            this._currentConfig,
            () => this._rebuild()
        );

        // 通知其他模块
        eventBus.emit(Events.COMPONENT_UPDATED, {
            id: this._currentComponentId,
            key,
            value
        });
    }

    /**
     * 重建 Box 子元素（委托给 PropertyRenderer）
     */
    _rebuild() {
        const currentFrame = store.get('currentFrame');
        rebuildBoxChildren(
            this._currentBox,
            registry.get(this._currentComponentId),
            this._currentConfig,
            store.get('processedData'),
            updateComponent,
            currentFrame
        );
    }
}

// 单例导出
export const settingsPanel = new SettingsPanel();
