/**
 * CanvasResolutionDialog.js - 自定义画布分辨率
 *
 * 由 Ratio 按钮组里的 Custom 触发，弹 layui layer 小窗（与 UnitConfigDialog 同一套路）。
 * 钳制规则只在 constants.normalizeCanvasSize 一处，这里只负责回显与写回输入框。
 * 应用走 CanvasResizer.applyCanvasSize，与横竖屏切换是同一条链路（会重置画布）。
 */

import { store } from '../core/Store.js';
import {
    DEFAULT_CANVAS,
    CANVAS_RESOLUTION_PRESETS,
    CANVAS_SIZE_MIN,
    CANVAS_SIZE_MAX,
    CANVAS_MAX_PIXELS,
    normalizeCanvasSize,
    canvasAspectLabel
} from '../core/constants.js';
import { applyCanvasSize } from './CanvasResizer.js';

const SHAPE_BOX_W = 108;
const SHAPE_BOX_H = 68;

const CONSTRAINT_HELP = `Width and height are rounded to even numbers: H.264 and VP9 use 4:2:0 chroma subsampling and reject odd dimensions. Each side is clamped to ${CANVAS_SIZE_MIN}-${CANVAS_SIZE_MAX}. Total pixels are capped at ${CANVAS_MAX_PIXELS.toLocaleString('en-US')} (4096x2304, the largest frame H.264 level 5.1 accepts); anything larger is scaled down proportionally, keeping the aspect ratio you chose. The middle preview always scales to fit its container, and the exported video uses the exact resolution.`;

/**
 * 打开自定义分辨率弹窗
 * @param {Function} [onApplied] - 实际改了尺寸后的回调，收到 {width, height}
 */
export function openCanvasResolutionDialog(onApplied) {
    if (!window.layui) {
        console.warn('[CanvasResolutionDialog] layui 未加载');
        return;
    }
    if (layui.layer && layui.layer.open) _show(layui.layer, onApplied);
    else layui.use(['layer'], () => _show(layui.layer, onApplied));
}

function _show(layer, onApplied) {
    if (!layer || !layer.open) {
        console.warn('[CanvasResolutionDialog] layui.layer 未就绪');
        return;
    }

    const current = store.get('canvasSize') || DEFAULT_CANVAS;
    const componentCount = (store.get('activeComponents') || []).length;

    const chips = CANVAS_RESOLUTION_PRESETS.map(p => `
        <button type="button" class="cr-preset" data-w="${p.width}" data-h="${p.height}"
                title="${escapeAttr(p.label)}">${p.width}&times;${p.height}</button>`).join('');

    const content = `
        <style>
            .cr-wrap { padding: 14px 16px; font-size: 13px; }
            .cr-top { display: flex; align-items: center; gap: 14px; margin-bottom: 12px; }
            .cr-shape-box { flex: 0 0 124px; height: 84px; display: flex; align-items: center;
                            justify-content: center; background: #f6f6f6; border: 1px solid #e6e6e6;
                            border-radius: 4px; }
            .cr-shape { background: #1e9fff; opacity: .7; border-radius: 2px; }
            .cr-meta { min-width: 0; line-height: 1.7; color: #333; }
            .cr-meta b { font-size: 16px; }
            .cr-sub { color: #888; font-size: 12px; }
            .cr-presets { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; }
            .cr-preset { padding: 3px 8px; font-size: 12px; line-height: 18px; cursor: pointer;
                         background: #fff; border: 1px solid #d2d2d2; border-radius: 3px; color: #555; }
            .cr-preset:hover { border-color: #1e9fff; color: #1e9fff; }
            .cr-preset.is-on { border-color: #1e9fff; color: #1e9fff; background: #f0f8ff; }
            .cr-inputs { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
            .cr-inputs label { color: #555; }
            .cr-inputs .layui-input { width: 88px; height: 30px; line-height: 30px; }
            .cr-x { color: #bbb; padding: 0 2px; }
            .cr-lock { margin-left: auto; padding: 0 10px; height: 30px; line-height: 28px;
                       font-size: 12px; cursor: pointer; background: #fff; color: #555;
                       border: 1px solid #d2d2d2; border-radius: 3px; }
            .cr-lock.is-on { border-color: #1e9fff; color: #1e9fff; background: #f0f8ff; }
            .cr-note { color: #888; font-size: 12px; line-height: 1.6; }
            .cr-help { display: inline-block; width: 16px; height: 16px; line-height: 14px;
                       text-align: center; margin-right: 6px; border: 1px solid #bbb;
                       border-radius: 50%; color: #888; font-size: 12px; cursor: help; }
            .cr-warn { margin-top: 10px; color: #e6a23c; font-size: 12px; line-height: 1.5; }
            .cr-footer { display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px;
                         padding-top: 10px; border-top: 1px solid #eee; }
        </style>
        <div class="cr-wrap">
            <div class="cr-top">
                <div class="cr-shape-box"><div class="cr-shape"></div></div>
                <div class="cr-meta">
                    <b class="cr-size"></b>
                    <div class="cr-sub cr-detail"></div>
                </div>
            </div>

            <div class="cr-presets">${chips}</div>

            <div class="cr-inputs">
                <label for="crWidth">Width</label>
                <input type="number" id="crWidth" class="layui-input" min="${CANVAS_SIZE_MIN}"
                       max="${CANVAS_SIZE_MAX}" step="2" value="${current.width}">
                <span class="cr-x">&times;</span>
                <label for="crHeight">Height</label>
                <input type="number" id="crHeight" class="layui-input" min="${CANVAS_SIZE_MIN}"
                       max="${CANVAS_SIZE_MAX}" step="2" value="${current.height}">
                <button type="button" class="cr-lock" title="Keep the current aspect ratio when editing either side">Lock ratio</button>
            </div>

            <div class="cr-note">
                <span class="cr-help" title="${escapeAttr(CONSTRAINT_HELP)}">?</span>Even numbers only &middot; ${CANVAS_SIZE_MIN}&ndash;${CANVAS_SIZE_MAX} per side &middot; up to 4096&times;2304 pixels. Out-of-range values are adjusted automatically.
            </div>
            <div class="cr-warn" style="display:none;"></div>

            <div class="cr-footer">
                <button type="button" class="layui-btn layui-btn-primary layui-btn-sm cr-cancel">Cancel</button>
                <button type="button" class="layui-btn layui-btn-sm cr-apply">Apply</button>
            </div>
        </div>`;

    layer.open({
        type: 1,
        title: 'Canvas Resolution',
        area: [`${Math.min(460, document.documentElement.clientWidth - 24)}px`, 'auto'],
        content,
        success: (layero, index) => {
            const root = layero[0] || layero;
            const wInput = root.querySelector('#crWidth');
            const hInput = root.querySelector('#crHeight');
            const shape = root.querySelector('.cr-shape');
            const sizeText = root.querySelector('.cr-size');
            const detailText = root.querySelector('.cr-detail');
            const warn = root.querySelector('.cr-warn');
            const lockBtn = root.querySelector('.cr-lock');
            const presetBtns = [...root.querySelectorAll('.cr-preset')];

            let linked = false;
            let linkRatio = current.width / current.height;

            const read = () => normalizeCanvasSize({ width: wInput.value, height: hInput.value });

            const refresh = (writeBack) => {
                const size = read();
                if (writeBack) {
                    wInput.value = size.width;
                    hInput.value = size.height;
                }

                const k = Math.min(SHAPE_BOX_W / size.width, SHAPE_BOX_H / size.height);
                shape.style.width = `${Math.max(1, Math.round(size.width * k))}px`;
                shape.style.height = `${Math.max(1, Math.round(size.height * k))}px`;

                sizeText.textContent = `${size.width} × ${size.height}`;
                const orientation = size.width > size.height ? 'Landscape'
                    : size.width < size.height ? 'Portrait' : 'Square';
                const mp = (size.width * size.height / 1e6).toFixed(2);
                detailText.textContent = `${canvasAspectLabel(size.width, size.height)} · ${orientation} · ${mp} MP`;

                presetBtns.forEach(btn => {
                    const on = Number(btn.dataset.w) === size.width && Number(btn.dataset.h) === size.height;
                    btn.classList.toggle('is-on', on);
                });

                const changed = size.width !== current.width || size.height !== current.height;
                warn.style.display = changed && componentCount > 0 ? '' : 'none';
                warn.textContent = `Applying resets the canvas and removes the ${componentCount} component${componentCount > 1 ? 's' : ''} on it.`;
                return size;
            };

            // 锁定比例时以「按下锁的那一刻」的比值为准，之后改任一边都推另一边
            lockBtn.addEventListener('click', () => {
                linked = !linked;
                if (linked) {
                    const size = read();
                    linkRatio = size.width / size.height;
                }
                lockBtn.classList.toggle('is-on', linked);
                lockBtn.textContent = linked ? 'Ratio locked' : 'Lock ratio';
            });

            const onEdit = (side) => {
                if (linked) {
                    if (side === 'w') {
                        const w = Number(wInput.value);
                        if (Number.isFinite(w) && w > 0) hInput.value = Math.round(w / linkRatio);
                    } else {
                        const h = Number(hInput.value);
                        if (Number.isFinite(h) && h > 0) wInput.value = Math.round(h * linkRatio);
                    }
                }
                refresh(false);
            };
            wInput.addEventListener('input', () => onEdit('w'));
            hInput.addEventListener('input', () => onEdit('h'));
            // 失焦时才把钳制结果写回，输入过程中不跟用户抢光标
            wInput.addEventListener('change', () => refresh(true));
            hInput.addEventListener('change', () => refresh(true));

            presetBtns.forEach(btn => btn.addEventListener('click', () => {
                wInput.value = btn.dataset.w;
                hInput.value = btn.dataset.h;
                if (linked) linkRatio = Number(btn.dataset.w) / Number(btn.dataset.h);
                refresh(false);
            }));

            root.querySelector('.cr-cancel').addEventListener('click', () => layer.close(index));
            root.querySelector('.cr-apply').addEventListener('click', () => {
                const size = refresh(true);
                if (size.width === current.width && size.height === current.height) {
                    layer.close(index);
                    layer.msg('Already at this resolution', { icon: 0, time: 1200 });
                    return;
                }
                const commit = () => {
                    applyCanvasSize(size);
                    layer.close(index);
                    if (typeof onApplied === 'function') onApplied(size);
                };
                if (componentCount > 0) {
                    layer.confirm(
                        `Changing the resolution resets the canvas and removes ${componentCount} component${componentCount > 1 ? 's' : ''}. Continue?`,
                        { icon: 3, title: 'Reset canvas?' },
                        (confirmIndex) => { layer.close(confirmIndex); commit(); }
                    );
                } else {
                    commit();
                }
            });

            refresh(false);
        }
    });
}

function escapeAttr(str) {
    return String(str == null ? '' : str)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

export default openCanvasResolutionDialog;