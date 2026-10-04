/**
 * GlobalFont.js - 全局字体（FontFamily）加载与应用
 *
 * 解决的问题：
 *   - 只插入 @font-face CSS link 不足以让浏览器下载 woff2；canvas 用 ctx.font 绘制
 *     文字也不会触发 webfont 拉取。必须在 CSS 就绪后用 document.fonts.load() 显式加载，
 *     再把 fontFamily 写到画布上所有 Text 节点并重绘，文字才会真正变。
 *   - 老款程序靠 updateAllTextFontFamily 递归写子元素；此处等价实现并持久化 + 启动恢复。
 *
 * 键：newsports_global_font（localStorage）
 */

import { canvasManager } from './CanvasManager.js';
import { eventBus, Events } from './EventBus.js';

const STORAGE_KEY = 'newsports_global_font';
const FONT_HOST = 'https://gstatic.qaq.qa/css2?family=';

/** @type {string} 当前全局字体族（'' = 浏览器默认） */
let _family = '';

export function getGlobalFontFamily() {
    return _family;
}

/** 读取持久化的全局字体 */
export function loadSavedGlobalFont() {
    try { return localStorage.getItem(STORAGE_KEY) || ''; } catch (e) { return ''; }
}

/**
 * 设置全局字体并应用到画布所有文字（持久化）
 * @param {string} family
 * @param {boolean} [persist=true]
 */
export function setGlobalFontFamily(family, persist = true) {
    _family = (family || '').trim();
    if (persist) {
        try { localStorage.setItem(STORAGE_KEY, _family); } catch (e) { /* 忽略配额错误 */ }
    }
    refreshAllTextFont();
}

/** 判断是否为文字节点 */
function isTextNode(n) {
    if (!n) return false;
    if (n.tag === 'Text' || n.tag === 'Paragraph' || n.tag === 'HTMLText') return true;
    return typeof n.text === 'string' && typeof n.fontFamily === 'string';
}

/** 递归遍历 children */
function walk(node, fn) {
    const kids = node && node.children;
    if (!kids || typeof kids.forEach !== 'function') return;
    kids.forEach(child => { fn(child); walk(child, fn); });
}

/**
 * 把当前全局字体应用到预览帧 / 内存帧上的所有文字节点，并触发重绘
 */
export function refreshAllTextFont() {
    const fam = _family ? `${_family}, sans-serif` : '';

    const applyToFrame = (frame) => {
        if (!frame) return;
        walk(frame, (n) => { if (isTextNode(n)) { try { n.fontFamily = fam; } catch (e) { /* 忽略 */ } } });
        if (typeof frame.update === 'function') { try { frame.update(true); } catch (e) { try { frame.update(); } catch (_) {} } }
    };

    applyToFrame(canvasManager.frame);
    applyToFrame(canvasManager.memoryFrame);

    // 预览 App 重绘（设置属性通常已自动置脏，这里再兜底触发一帧）
    const app = canvasManager.appview;
    if (app && app.tree && typeof app.tree.update === 'function') {
        try { app.tree.update(); } catch (e) { /* 忽略 */ }
    }
}

/** 生成/复用 CSS link 的 DOM id */
function linkIdOf(family) {
    return 'gfont-' + family.replace(/\s+/g, '-').toLowerCase();
}

/**
 * 加载并应用 Google Font（拉取 CSS → document.fonts.load 强制下载 woff2 → 应用到画布）
 * @param {string} family - 字体名；空字符串 = 恢复浏览器默认字体
 * @param {Function} [onDone] - 完成回调
 */
export function loadAndApplyFont(family, onDone) {
    const layer = (window.layui && layui.layer) ? layui.layer : null;
    const done = (ok, msg, icon) => {
        if (layer && msg) layer.msg(msg, { icon, time: 1500 });
        if (typeof onDone === 'function') onDone(ok);
    };

    // 空值：恢复默认
    if (!family) {
        setGlobalFontFamily('');
        return done(true, 'Browser default font restored', 1);
    }

    const apply = async () => {
        // 关键：显式触发 woff2 下载并等待字体就绪（含常规/粗体变体）
        if (document.fonts && typeof document.fonts.load === 'function') {
            try {
                await Promise.all([
                    document.fonts.load(`400 48px "${family}"`),
                    document.fonts.load(`700 48px "${family}"`)
                ]);
            } catch (e) { /* 变体缺失时 fonts.load 通常 resolve 空集，不抛 */ }
        }
        setGlobalFontFamily(family);
        done(true, `Font "${family}" loaded and applied`, 1);
    };

    // 已注入过该字体的 CSS：直接走加载流程
    if (document.getElementById(linkIdOf(family))) {
        apply();
        return;
    }

    const link = document.createElement('link');
    link.id = linkIdOf(family);
    link.rel = 'stylesheet';
    link.crossOrigin = 'anonymous';
    link.href = `${FONT_HOST}${encodeURIComponent(family).replace(/%20/g, '+')}&display=swap`;
    link.onload = apply;
    link.onerror = () => done(false, `Failed to load font "${family}", please check the font name`, 2);
    document.head.appendChild(link);
}

/**
 * 初始化：订阅组件新增/更新/模板载入，把全局字体补到新建的文字节点上；
 * 并恢复上次保存的全局字体。需在 canvasManager 注册预览实例之后调用。
 */
export function initGlobalFont() {
    const reapply = () => { if (_family) refreshAllTextFont(); };
    // 组件被（重新）构建后，新文字节点没有 fontFamily，需要补上
    eventBus.on(Events.COMPONENT_ADDED, reapply);
    eventBus.on(Events.COMPONENT_UPDATED, reapply);
    eventBus.on(Events.TEMPLATE_LOAD, reapply);

    const saved = loadSavedGlobalFont();
    if (saved) {
        _family = saved;
        loadAndApplyFont(saved);
    }
}
