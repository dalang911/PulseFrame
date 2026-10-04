/**
 * PropertyRenderer.js - 属性渲染共用引擎
 *
 * 抽取 SettingsPanel（主编辑器右侧）与 PropertyEditor（设计器右侧）
 * 的共同逻辑：嵌套属性读写、设置项 DOM 生成、变更应用。
 *
 * 调用方只需：
 *   1. 提供 definition.settings 数组
 *   2. 提供 config 对象（嵌套属性源）
 *   3. 提供 onChange(key, value) 回调
 */

import { openUnitConfigDialog } from './UnitConfigDialog.js';
import { loadAndApplyFont } from '../core/GlobalFont.js';

// 预定义颜色（与原版一致）
export const PRESET_COLORS = [
    '#0A9A38', '#000000', '#FFFFFF',
    '#CCCCCC', '#FF0000', '#C71585',
    '#9900FF', '#6A0DAD', '#FF7F00',
    '#FFD700', '#FFFACD', '#0000FF',
    '#1E90FF', '#00CED1', '#808080',
    '#8B0000', '#D9B3A1', '#E6E6FA'
];

// 布局类属性（直接作用于 Box 自身，不触发子元素重建）
export const LAYOUT_KEYS = ['x', 'y', 'width', 'height', 'rotation', 'opacity', 'cornerRadius', 'fill', 'stroke', 'strokeWidth'];

/**
 * 动态加载 Google Font 并应用到画布（委托给 GlobalFont）
 * @param {string} fontFamily - 字体名称（如 'Bitter'）
 * @param {Function} [onLoaded] - 加载完成后的回调
 */
function loadGoogleFont(fontFamily, onLoaded) {
    loadAndApplyFont(fontFamily, onLoaded);
}

// ===== 嵌套属性读写 =====

/**
 * 获取嵌套对象属性（支持 'colors.line' 点分路径）
 * @param {Object} obj
 * @param {string} path
 * @returns {*}
 */
export function getNestedValue(obj, path) {
    if (!obj || !path) return undefined;
    const keys = path.split('.');
    let current = obj;
    for (const key of keys) {
        if (current == null) return undefined;
        current = current[key];
    }
    return current;
}

/**
 * 设置嵌套对象属性（支持 'colors.line' 点分路径，自动创建中间层）
 * @param {Object} obj
 * @param {string} path
 * @param {*} value
 */
export function setNestedValue(obj, path, value) {
    if (!obj || !path) return;
    const keys = path.split('.');
    let current = obj;
    for (let i = 0; i < keys.length - 1; i++) {
        if (!current[keys[i]] || typeof current[keys[i]] !== 'object') {
            current[keys[i]] = {};
        }
        current = current[keys[i]];
    }
    current[keys[keys.length - 1]] = value;
}

// ===== 设置项 DOM 生成 =====

/**
 * 渲染一组设置项到指定容器（DOM 节点）
 *
 * @param {HTMLElement} container - 目标容器
 * @param {Array} settings - definition.settings 数组
 * @param {Object} config - 当前配置（含默认值 + 用户覆盖值）
 * @param {Function} onChange - (key, value) => void
 * @param {Object} [options]
 * @param {boolean} [options.useNativeColor=false] - true 用 <input type="color">，false 用 layui colorpicker
 * @param {string} [options.cssPrefix=''] - CSS 类名前缀
 * @returns {Array<{element: HTMLElement, cleanup: Function}>} 渲染结果 + 清理函数
 */
export function renderSettings(container, settings, config, onChange, options = {}) {
    const { useNativeColor = false, cssPrefix = '' } = options;
    const cleanups = [];

    settings.forEach(item => {
        const row = createRow(item, config, onChange, useNativeColor, cssPrefix);
        if (row.element) {
            container.appendChild(row.element);
            if (row.cleanup) cleanups.push(row.cleanup);
        }
    });

    return cleanups;
}

/**
 * 创建设置项行（内部方法）
 */
function createRow(item, config, onChange, useNativeColor, cssPrefix) {
    let cleanup = null;

    const row = document.createElement('div');
    row.className = `${cssPrefix}property-row layui-form-item`;
    // 紧凑单行布局：标签定宽 + 输入占满剩余，行高/间距最小化
    row.style.cssText = 'display:flex; align-items:center; margin:0 0 4px 0; padding:0; min-height:30px;';

    // 标题
    if (item.type === 'title') {
        row.innerHTML = `<div style="font-weight:bold; padding:3px 0; border-bottom:1px solid #eee; margin-bottom:4px; width:100%;">${item.name}</div>`;
        return { element: row, cleanup: null };
    }

    // 标签（窄宽 + 允许换行，尽量显示完整）
    const label = document.createElement('label');
    label.className = `${cssPrefix}property-label layui-form-label`;
    label.style.cssText = 'flex:0 0 auto; width:78px; max-width:78px; padding:0 6px 0 0; margin:0; font-size:12px; line-height:1.3; word-break:break-all; text-align:left;';
    label.textContent = item.name;
    row.appendChild(label);

    // 输入区（占据剩余空间）
    const inputDiv = document.createElement('div');
    inputDiv.className = `${cssPrefix}property-value layui-input-block`;
    inputDiv.style.cssText = 'flex:1 1 auto; min-width:0; margin:0; display:flex; align-items:center; gap:4px;';

    const currentValue = config ? getNestedValue(config, item.key) : undefined;
    const displayValue = currentValue ?? item.defaultValue ?? '';

    switch (item.type) {
        case 'color':
        case 'bg_color':
            if (useNativeColor) {
                inputDiv.innerHTML = `<input type="color" value="${displayValue || '#000000'}" class="prop-input-color" data-key="${item.key}" style="width:44px; height:26px; padding:0; border:1px solid #e6e6e6; border-radius:3px; cursor:pointer;">`;
                const input = inputDiv.querySelector('input');
                input.addEventListener('input', () => onChange(item.key, input.value));
            } else {
                cleanup = createLayuiColorPicker(inputDiv, displayValue, item.key, onChange);
            }
            break;

        case 'number':
            inputDiv.innerHTML = `<input type="number" value="${displayValue || 0}" class="layui-input prop-input-number"
                data-key="${item.key}"
                ${item.min !== undefined ? `min="${item.min}"` : ''}
                ${item.max !== undefined ? `max="${item.max}"` : ''}
                step="${item.step || 1}"
                style="width:100%; max-width:110px; height:28px; line-height:1.3; padding:2px 6px; font-size:12px; box-sizing:border-box;">`;
            const numInput = inputDiv.querySelector('input');
            numInput.addEventListener('change', () => onChange(item.key, parseFloat(numInput.value) || 0));
            numInput.addEventListener('input', () => onChange(item.key, parseFloat(numInput.value) || 0));
            break;

        case 'select':
            const options = (item.options || [])
                .map(o => `<option value="${o.value}" ${String(o.value) === String(displayValue) ? 'selected' : ''}>${o.label}</option>`)
                .join('');
            inputDiv.innerHTML = `<select data-key="${item.key}" class="layui-input prop-input-select" style="width:100%; height:28px; line-height:1.3; padding:2px 6px; font-size:12px; box-sizing:border-box;">${options}</select>`;
            const sel = inputDiv.querySelector('select');
            sel.addEventListener('change', () => onChange(item.key, sel.value));
            break;

        case 'boolean':
            // 原生复选框（#settable 无 layui-form 包裹，不会被 layui 改写），accent-color 让勾选色跟上手柄主题
            inputDiv.innerHTML = `<input type="checkbox" ${displayValue ? 'checked' : ''} data-key="${item.key}" style="width:14px; height:14px; margin:0; cursor:pointer; accent-color:#16b777;">`;
            const chk = inputDiv.querySelector('input');
            chk.addEventListener('change', () => onChange(item.key, chk.checked));
            break;

        case 'bg_image': {
            // 复杂多行布局：标签顶部对齐，内容纵向排列
            row.style.alignItems = 'flex-start';
            inputDiv.style.cssText = 'flex:1 1 auto; min-width:0; margin:0; display:flex; flex-direction:column; gap:4px;';
            // 预设背景图片列表（参照老代码）
            const bgImages = [
                { url: './bg/169.jpg', name: '16:9' },
                { url: './bg/1692.jpg', name: '16:9-2' },
                { url: './bg/1693.jpg', name: '16:9-3' },
                { url: './bg/916.jpg', name: '9:16' }
            ];
            // 图片横向排列（不换行）
            const imgGrid = document.createElement('div');
            imgGrid.style.cssText = 'display:flex; flex-wrap:nowrap; gap:4px;';
            bgImages.forEach(imgItem => {
                const imgWrap = document.createElement('div');
                imgWrap.style.cssText = 'cursor:pointer; text-align:center; flex:0 0 auto;';
                const img = document.createElement('img');
                img.src = imgItem.url;
                img.alt = imgItem.name;
                img.style.cssText = 'width:40px; height:40px; object-fit:cover; border:2px solid #e6e6e6; border-radius:3px;';
                img.title = imgItem.name;
                img.onclick = () => {
                    onChange(item.key, imgItem.url);
                    // 高亮选中
                    imgGrid.querySelectorAll('img').forEach(i => i.style.borderColor = '#e6e6e6');
                    img.style.borderColor = '#1890ff';
                };
                imgWrap.appendChild(img);
                const label = document.createElement('div');
                label.textContent = imgItem.name;
                label.style.cssText = 'font-size:10px; color:#999; margin-top:2px;';
                imgWrap.appendChild(label);
                imgGrid.appendChild(imgWrap);
            });
            inputDiv.appendChild(imgGrid);
            // 自定义上传
            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.accept = 'image/*';
            fileInput.className = 'layui-input';
            fileInput.style.cssText = 'width:100%; height:24px; font-size:10px; padding:1px 4px; box-sizing:border-box;';
            fileInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (ev) => onChange(item.key, ev.target.result);
                reader.readAsDataURL(file);
            });
            inputDiv.appendChild(fileInput);
            break;
        }

        case 'font_selector': {
            // 复杂多行布局
            row.style.alignItems = 'flex-start';
            inputDiv.style.cssText = 'flex:1 1 auto; min-width:0; margin:0; display:flex; flex-direction:column; gap:4px;';
            // 预设字体按钮（参照老代码）
            const presetFonts = [
                { name: 'Default', value: '' },
                { name: 'Bitter', value: 'Bitter' },
                { name: 'Roboto Slab', value: 'Roboto Slab' },
                { name: 'Fira Sans', value: 'Fira Sans' },
                { name: 'Quicksand', value: 'Quicksand' },
                { name: 'Teko', value: 'Teko' },
                { name: 'Play', value: 'Play' },
                { name: 'Courgette', value: 'Courgette' },
                { name: 'VT323', value: 'VT323' }
            ];
            // 自定义输入 + 确认按钮
            const fontRow = document.createElement('div');
            fontRow.style.cssText = 'display:flex; gap:4px; align-items:center; width:100%;';
            fontRow.innerHTML = `<input type="text" value="${displayValue || ''}" class="layui-input" placeholder="Font name" style="flex:1; min-width:0; height:26px; line-height:1.3; padding:2px 6px; font-size:11px; box-sizing:border-box;"><button class="layui-btn layui-btn-xs layui-btn-normal" style="flex:0 0 auto; height:26px; line-height:26px; padding:0 8px; font-size:11px;">OK</button>`;
            const fontInput = fontRow.querySelector('input');
            const confirmBtn = fontRow.querySelector('button');
            confirmBtn.onclick = () => {
                onChange(item.key, fontInput.value);
                // 加载字体（空值→恢复浏览器默认字体）
                loadGoogleFont(fontInput.value);
            };
            inputDiv.appendChild(fontRow);
            // 预设字体按钮组
            const btnGroup = document.createElement('div');
            btnGroup.style.cssText = 'display:flex; flex-wrap:wrap; gap:3px; width:100%;';
            presetFonts.forEach(pf => {
                const btn = document.createElement('button');
                btn.textContent = pf.name;
                btn.className = 'layui-btn layui-btn-xs layui-btn-primary';
                btn.style.cssText = 'height:22px; line-height:22px; padding:0 6px; font-size:10px;';
                btn.onclick = () => {
                    fontInput.value = pf.value;
                    onChange(item.key, pf.value);
                    loadGoogleFont(pf.value);
                };
                btnGroup.appendChild(btn);
            });
            inputDiv.appendChild(btnGroup);
            // 帮助文案 + 外链（Google Fonts / Font Library）
            const mkFontLink = (text, href) => {
                const a = document.createElement('a');
                a.href = href;
                a.target = '_blank';
                a.rel = 'noopener';
                a.textContent = text;
                a.style.cssText = 'color:#1890ff; text-decoration:none;';
                a.title = `Visit ${text} to download more fonts`;
                return a;
            };
            const help = document.createElement('div');
            help.style.cssText = 'font-size:10px; color:#999; line-height:1.5; margin-top:2px; width:100%;';
            const helpLine1 = document.createElement('div');
            helpLine1.append(
                document.createTextNode('Please enter a font name (obtainable from the following websites): '),
                mkFontLink('Google Fonts', 'https://fonts.google.com/'),
                document.createTextNode(' or '),
                mkFontLink('Font Library', 'https://fontlibrary.org/')
            );
            const helpLine2 = document.createElement('div');
            helpLine2.textContent = 'Click "Default" to restore the browser\'s native font';
            help.append(helpLine1, helpLine2);
            inputDiv.appendChild(help);
            break;
        }

        case 'unit_button': {
            // 全局单位配置按钮：点击弹出浮动窗（不参与组件 config 读写）
            inputDiv.style.cssText = 'flex:1 1 auto; min-width:0; margin:0; display:flex; align-items:center;';
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = item.buttonText || 'Configure units…';
            btn.className = 'layui-btn layui-btn-xs layui-btn-normal';
            btn.style.cssText = 'height:26px; line-height:26px; padding:0 10px; font-size:11px;';
            btn.onclick = () => openUnitConfigDialog();
            inputDiv.appendChild(btn);
            break;
        }

        default:
            // 通用文本输入
            inputDiv.innerHTML = `<input type="text" value="${displayValue}" class="layui-input prop-input-text" data-key="${item.key}" style="width:100%; height:28px; line-height:1.3; padding:2px 6px; font-size:12px; box-sizing:border-box;">`;
            const textInput = inputDiv.querySelector('input');
            textInput.addEventListener('change', () => onChange(item.key, textInput.value));
            break;
    }

    row.appendChild(inputDiv);
    return { element: row, cleanup };
}

/**
 * 创建 layui colorpicker（返回 cleanup 函数）
 */
function createLayuiColorPicker(container, currentValue, key, onChange) {
    const colorInput = document.createElement('input');
    colorInput.type = 'hidden';
    colorInput.value = currentValue || '#FFFFFF';
    container.appendChild(colorInput);

    const triggerBtn = document.createElement('div');
    triggerBtn.style.cssText = `
        width: 32px; height: 26px; border-radius: 3px; flex:0 0 auto;
        border: 1px solid #e6e6e6; background-color: ${currentValue || '#FFFFFF'};
        cursor: pointer; display: inline-block; vertical-align: middle;
    `;
    container.appendChild(triggerBtn);

    // 颜色值文本（紧凑回显）
    const hexLabel = document.createElement('span');
    hexLabel.style.cssText = 'font-size:11px; color:#666; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;';
    hexLabel.textContent = currentValue || '#FFFFFF';
    container.appendChild(hexLabel);

    if (window.layui && layui.colorpicker) {
        layui.use(['colorpicker'], () => {
            layui.colorpicker.render({
                elem: triggerBtn,
                target: colorInput,
                color: currentValue || '#FFFFFF',
                alpha: true,
                format: 'rgb',
                predefine: true,
                colors: PRESET_COLORS,
                change: (color) => {
                    triggerBtn.style.backgroundColor = color;
                    colorInput.value = color;
                    if (hexLabel) hexLabel.textContent = color || '';
                },
                done: (color) => {
                    triggerBtn.style.backgroundColor = color;
                    colorInput.value = color;
                    if (hexLabel) hexLabel.textContent = color || '';
                    onChange(key, color);
                }
            });
        });
    }

    // cleanup: 无实际需要销毁的（layui 会 GC）
    return () => {};
}

// ===== 变更应用工具 =====

/**
 * 将属性变更应用到 Leafer Box（共用逻辑）
 *
 * @param {object} box - Leafer Box 实例
 * @param {string} key - 属性路径
 * @param {*} value - 新值
 * @param {object} config - 组件配置对象（会被修改）
 * @param {Function} rebuildFn - () => void，非布局属性时调用以重建子元素
 */
export function applyPropertyChange(box, key, value, config, rebuildFn) {
    if (!box || !key) return;

    // 更新配置
    setNestedValue(config, key, value);

    // 布局属性直接作用于 Box
    if (LAYOUT_KEYS.includes(key)) {
        box[key] = value;
    } else if (typeof rebuildFn === 'function') {
        rebuildFn();
    }
}

/**
 * 用新配置重建 Box 的子元素
 *
 * @param {object} box - Leafer Box 实例
 * @param {object} definition - 组件定义（需有 build 方法）
 * @param {object} config - 合并后的配置
 * @param {object} data - processedData（rq 对象）
 * @param {Function} updateFn - (componentId, frame) => void，重建后刷新当前帧
 * @param {number} currentFrame - 当前帧索引
 */
export function rebuildBoxChildren(box, definition, config, data, updateFn, currentFrame) {
    if (!box || !definition || typeof definition.build !== 'function') return;

    const LeaferUI = window.LeaferUI;
    if (!LeaferUI) return;

    try {
        const isBg = !!definition.isBackground;

        // 目标尺寸 = Box 当前实际尺寸（用户可能已拖拽改过；__leaferConfig.width 是创建时的旧值，不可信）
        const targetW = box.width;
        const targetH = box.height;
        // 基准（默认）尺寸：子元素内部坐标大多按此设计
        const defW = definition.defaultConfig?.width || config.width || 200;
        const defH = definition.defaultConfig?.height || config.height || 100;
        // 背景层按目标尺寸直接铺满（build 读 config.width），其它组件按默认几何构建后再等比缩放
        const baseW = isBg ? targetW : defW;
        const baseH = isBg ? targetH : defH;

        // 移除旧子元素
        if (box.children && box.children.length) {
            [...box.children].forEach(c => box.remove(c));
        }

        // 非背景：先把空的 Box 复位到基准尺寸，保证随后 resize 的缩放比例 = 目标/默认
        if (!isBg) {
            box.width = defW;
            box.height = defH;
        }

        // 用新配置重新 build（背景按目标尺寸铺满，其它按默认几何）
        const children = definition.build({ ...config, width: baseW, height: baseH }, data) || [];
        children.forEach(cfg => {
            const Ctor = LeaferUI[cfg.tag];
            if (Ctor) {
                box.add(new Ctor(cfg));
            } else {
                console.warn(`[PropertyRenderer] Unknown child tag: ${cfg.tag}`);
            }
        });

        // 非背景：从基准尺寸 resize 到目标尺寸，等比缩放子元素（复现拖拽/载入效果，
        // 否则改颜色/粗细后内容会退回默认大小）。createComponent 中同款逻辑。
        if (!isBg) {
            if (typeof box.resizeWidth === 'function') box.resizeWidth(targetW);
            else box.width = targetW;
            if (typeof box.resizeHeight === 'function') box.resizeHeight(targetH);
            else box.height = targetH;
        }

        // 刷新当前帧数据
        if (currentFrame != null && typeof updateFn === 'function') {
            updateFn(definition.id || box.id, currentFrame);
        }
    } catch (err) {
        console.error('[PropertyRenderer] Rebuild failed:', err);
    }
}
