/**
 * AlignTools.js - 多选对齐工具面板
 *
 * 移植自老款程序 index.html 的 MultiSelect()：当编辑器中选中 >=2 个组件时，
 * 在右侧 #settable 面板顶部显示「Element Layout Tools」，提供：
 *   - Horizontal Align：Left / Center / Right
 *   - Vertical Align：  Top / Middle / Bottom
 *   - Even Distribution：Horizontal / Vertical
 *
 * 直接操作被选中的 Leafer Box（x/y/width/height），改完后 editor.refresh()。
 */

import { canvasManager } from '../core/CanvasManager.js';
import { settingsPanel } from './SettingsPanel.js';
import { eventBus, Events } from '../core/EventBus.js';

const CONTAINER_ID = 'multiSelectLayoutTools';
let _inited = false;

/**
 * 初始化：注册编辑器多选事件
 */
export function initAlignTools() {
    if (_inited) return;
    const appview = canvasManager.appview;
    const { EditorEvent } = window.LeaferUI;
    if (!appview || !appview.editor || !EditorEvent) {
        console.warn('[AlignTools] editor not ready');
        return;
    }
    _inited = true;

    appview.editor.on(EditorEvent.SELECT, (e) => {
        const list = (e && e.editor && e.editor.list) ? e.editor.list : [];
        if (list.length >= 2) {
            showPanel(list);
        } else {
            hidePanel();
        }
    });
}

/** 取当前被选中的组件 Box（>=2）；无则返回 null */
function currentSelected() {
    const appview = canvasManager.appview;
    const list = appview && appview.editor ? appview.editor.list : [];
    return list.length >= 2 ? [...list] : null;
}

/**
 * 显示/刷新对齐面板
 * @param {Array} list 被选中的 Box 列表
 */
function showPanel(list) {
    const settable = document.getElementById('settable');
    if (!settable) return;

    // 让位给对齐面板：清掉单组件设置面板，避免抢同一个 #settable 容器
    settingsPanel.clear();

    let container = document.getElementById(CONTAINER_ID);
    if (!container) {
        container = buildPanel();
        settable.appendChild(container);
    } else if (container.parentNode !== settable) {
        settable.appendChild(container);
    }

    const tip = document.getElementById('alignSelCount');
    if (tip) tip.textContent = `${list.length} components selected`;
}

/** 移除对齐面板 */
function hidePanel() {
    const container = document.getElementById(CONTAINER_ID);
    if (container && container.parentNode) container.parentNode.removeChild(container);
}

/** 构建面板 DOM */
function buildPanel() {
    const root = document.createElement('div');
    root.id = CONTAINER_ID;
    root.style.cssText = 'margin:8px; padding:10px; border:1px solid #ddd; border-radius:4px; background:#fff; box-sizing:border-box;';

    const header = document.createElement('div');
    header.textContent = 'Element Layout Tools';
    header.style.cssText = 'font-size:13px; font-weight:bold; padding-bottom:6px; border-bottom:1px solid #eee; margin-bottom:6px;';
    root.appendChild(header);

    const tip = document.createElement('div');
    tip.id = 'alignSelCount';
    tip.style.cssText = 'font-size:11px; color:#999; margin-bottom:8px;';
    root.appendChild(tip);

    const groups = [
        {
            name: 'Horizontal Align',
            buttons: [
                { text: 'Left', fn: alignLeft },
                { text: 'Center', fn: alignHCenter },
                { text: 'Right', fn: alignRight }
            ]
        },
        {
            name: 'Vertical Align',
            buttons: [
                { text: 'Top', fn: alignTop },
                { text: 'Middle', fn: alignVCenter },
                { text: 'Bottom', fn: alignBottom }
            ]
        },
        {
            name: 'Even Distribution',
            buttons: [
                { text: 'Horizontal', fn: distributeHorizontal },
                { text: 'Vertical', fn: distributeVertical }
            ]
        }
    ];

    groups.forEach(group => {
        const label = document.createElement('div');
        label.textContent = group.name;
        label.style.cssText = 'font-size:12px; color:#666; margin:8px 0 4px; font-weight:500;';
        root.appendChild(label);

        const row = document.createElement('div');
        row.style.cssText = 'display:flex; gap:6px;';
        group.buttons.forEach(btn => {
            const b = document.createElement('button');
            b.type = 'button';
            b.textContent = btn.text;
            b.style.cssText = 'flex:1; min-width:0; height:26px; padding:0 4px; font-size:11px; border:1px solid #d2d2d2; border-radius:3px; background:#fff; cursor:pointer;';
            b.onclick = () => {
                const els = currentSelected();
                if (!els) { toast('Select at least 2 components', 2); return; }
                btn.fn(els);
            };
            row.appendChild(b);
        });
        root.appendChild(row);
    });

    return root;
}

// ===== 对齐/分布核心（直接操作 Box 的 x/y，width/height 保持不变） =====

function alignLeft(els) {
    const minX = Math.min(...els.map(el => el.x));
    els.forEach(el => setPosition(el, minX, el.y));
    done('Left alignment done');
}

function alignHCenter(els) {
    const centers = els.map(el => el.x + el.width / 2);
    const avg = centers.reduce((s, v) => s + v, 0) / centers.length;
    els.forEach(el => setPosition(el, avg - el.width / 2, el.y));
    done('Horizontal center alignment done');
}

function alignRight(els) {
    const maxRight = Math.max(...els.map(el => el.x + el.width));
    els.forEach(el => setPosition(el, maxRight - el.width, el.y));
    done('Right alignment done');
}

function alignTop(els) {
    const minY = Math.min(...els.map(el => el.y));
    els.forEach(el => setPosition(el, el.x, minY));
    done('Top alignment done');
}

function alignVCenter(els) {
    const centers = els.map(el => el.y + el.height / 2);
    const avg = centers.reduce((s, v) => s + v, 0) / centers.length;
    els.forEach(el => setPosition(el, el.x, avg - el.height / 2));
    done('Vertical center alignment done');
}

function alignBottom(els) {
    const maxBottom = Math.max(...els.map(el => el.y + el.height));
    els.forEach(el => setPosition(el, el.x, maxBottom - el.height));
    done('Bottom alignment done');
}

function distributeHorizontal(els) {
    if (els.length < 3) { toast('Horizontal distribution requires at least 3 components', 2); return; }
    const sorted = [...els].sort((a, b) => a.x - b.x);
    const leftMost = sorted[0].x;
    const rightMost = Math.max(...sorted.map(el => el.x + el.width));
    const totalWidth = sorted.reduce((s, el) => s + el.width, 0);
    const gap = (rightMost - leftMost - totalWidth) / (sorted.length - 1);
    let cursor = leftMost;
    sorted.forEach((el, i) => {
        setPosition(el, cursor, el.y);
        if (i < sorted.length - 1) cursor += el.width + gap;
    });
    done('Horizontal even distribution done');
}

function distributeVertical(els) {
    if (els.length < 3) { toast('Vertical distribution requires at least 3 components', 2); return; }
    const sorted = [...els].sort((a, b) => a.y - b.y);
    const topMost = sorted[0].y;
    const bottomMost = Math.max(...sorted.map(el => el.y + el.height));
    const totalHeight = sorted.reduce((s, el) => s + el.height, 0);
    const gap = (bottomMost - topMost - totalHeight) / (sorted.length - 1);
    let cursor = topMost;
    sorted.forEach((el, i) => {
        setPosition(el, el.x, cursor);
        if (i < sorted.length - 1) cursor += el.height + gap;
    });
    done('Vertical even distribution done');
}

/**
 * 设置某个 Box 的位置，并同步 __leaferConfig（供模板序列化/面板读取）
 */
function setPosition(el, x, y) {
    el.x = x;
    el.y = y;
    if (el.__leaferConfig) {
        el.__leaferConfig.x = x;
        el.__leaferConfig.y = y;
    }
}

/** 对齐完成：刷新编辑器选框 + 通知 + 提示 */
function done(msg) {
    const appview = canvasManager.appview;
    if (appview && appview.editor && typeof appview.editor.refresh === 'function') {
        appview.editor.refresh();
    }
    eventBus.emit(Events.COMPONENT_UPDATED, { source: 'align' });
    toast(msg, 1);
}

/** layui 轻提示（无 layui 时降级到 console） */
function toast(msg, icon) {
    if (window.layui && layui.layer && layui.layer.msg) {
        layui.layer.msg(msg, { icon, time: 1000 });
    } else {
        console.log('[AlignTools] ' + msg);
    }
}
