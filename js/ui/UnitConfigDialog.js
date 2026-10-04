/**
 * UnitConfigDialog.js - 单位（前后缀）配置浮动窗
 *
 * 由 Background 组件设置面板中的「单位修改」按钮触发。
 * 弹出 layui layer，逐变量提供 前缀 / 后缀 输入框，保存后写入
 * 全局 unitConfig（localStorage 持久化）并广播刷新画布。
 */

import { unitConfig } from '../core/UnitConfig.js';

/**
 * 打开单位配置浮动窗
 * @param {Function} [onSaved] - 保存成功后的回调
 */
export function openUnitConfigDialog(onSaved) {
    if (!window.layui) {
        console.warn('[UnitConfigDialog] layui 未加载');
        return;
    }
    // layer 可能需懒加载（与 VideoPanel 一致）
    if (layui.layer && layui.layer.open) {
        _show(layui.layer, onSaved);
    } else {
        layui.use(['layer'], () => _show(layui.layer, onSaved));
    }
}

/** 内部：真正构建并弹出浮动窗 */
function _show(layer, onSaved) {
    if (!layer || !layer.open) {
        console.warn('[UnitConfigDialog] layui.layer 未就绪');
        return;
    }

    const defs = unitConfig.getDefs();

    const rowsHtml = defs.map(d => {
        const cfg = unitConfig.get(d.key);
        return `
            <div class="uc-row" data-key="${d.key}">
                <label class="uc-label" title="${d.label}">${d.label}</label>
                <input type="text" class="layui-input uc-prefix" value="${escapeAttr(cfg.prefix)}" placeholder="Prefix (optional)">
                <span class="uc-num">value</span>
                <input type="text" class="layui-input uc-suffix" value="${escapeAttr(cfg.suffix)}" placeholder="Suffix (unit)">
            </div>`;
    }).join('');

    const style = `
        <style>
            .uc-wrap { padding: 12px 16px; font-size: 13px; }
            .uc-tip { color: #888; font-size: 12px; margin-bottom: 10px; line-height: 1.5; }
            .uc-row { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; }
            .uc-label { flex: 0 0 130px; text-align: left; color: #333; }
            .uc-num { flex: 0 0 34px; text-align: center; color: #bbb; font-size: 12px; }
            .uc-row .layui-input { flex: 1 1 auto; height: 30px; line-height: 30px; min-width: 0; }
            .uc-footer { display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px; padding-top: 10px; border-top: 1px solid #eee; }
        </style>`;

    const content = `${style}
        <div class="uc-wrap">
            <div class="uc-tip">Set custom <b>prefix</b> and <b>suffix</b> (unit) for each value type. Leave empty to hide. Changes are <b>auto-saved</b> and applied to the canvas in real time, and reloaded next time you open the site.</div>
            ${rowsHtml}
            <div class="uc-footer">
                <button type="button" class="layui-btn layui-btn-primary layui-btn-sm uc-reset">Restore Defaults</button>
                <button type="button" class="layui-btn layui-btn-sm uc-save">Save</button>
            </div>
        </div>`;

    layer.open({
        type: 1,
        title: 'Unit Settings (value prefixes / suffixes)',
        area: ['520px', 'auto'],
        content: content,
        success: (layero, index) => {
            const root = layero[0] || layero;

            const collect = () => {
                const map = {};
                root.querySelectorAll('.uc-row').forEach(row => {
                    const key = row.getAttribute('data-key');
                    const prefix = row.querySelector('.uc-prefix').value;
                    const suffix = row.querySelector('.uc-suffix').value;
                    map[key] = { prefix, suffix };
                });
                return map;
            };

            // 自动保存：任一前/后缀输入变化即持久化 + 广播刷新画布（防抖 200ms）
            let saveTimer = null;
            const autoSave = () => {
                clearTimeout(saveTimer);
                saveTimer = setTimeout(() => unitConfig.applyAll(collect()), 200);
            };
            root.querySelectorAll('.uc-prefix, .uc-suffix').forEach(inp => {
                inp.addEventListener('input', autoSave);
                inp.addEventListener('change', autoSave);
            });

            root.querySelector('.uc-save').onclick = () => {
                clearTimeout(saveTimer);
                unitConfig.applyAll(collect());
                layer.msg('Unit settings saved and applied', { icon: 1, time: 1500 });
                layer.close(index);
                if (typeof onSaved === 'function') onSaved();
            };

            root.querySelector('.uc-reset').onclick = () => {
                unitConfig.reset();
                // 同步输入框回到默认值
                unitConfig.getDefs().forEach(d => {
                    const row = root.querySelector(`.uc-row[data-key="${d.key}"]`);
                    if (!row) return;
                    const cfg = unitConfig.get(d.key);
                    row.querySelector('.uc-prefix').value = cfg.prefix;
                    row.querySelector('.uc-suffix').value = cfg.suffix;
                });
                layer.msg('Default units restored', { icon: 1, time: 1200 });
            };
        }
    });
}

/** HTML 属性值转义 */
function escapeAttr(str) {
    return String(str == null ? '' : str)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

export default openUnitConfigDialog;
