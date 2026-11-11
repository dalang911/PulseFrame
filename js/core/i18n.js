/**
 * i18n.js - 双语核心（English / 简体中文）
 *
 * 设计口径：
 *   - 英文是源语言：所有 UI 字面量按英文书写，en 模式下 t() 原样返回、
 *     DOM 翻译器完全不启动 —— 默认观感与升级前逐字节一致，零运行时开销。
 *   - zh 模式：i18n.zh.js 提供「英文原文 → 中文」精确字典 + 少量正则模式；
 *     静态 DOM 文案由 walker + MutationObserver 翻译（含 layui 弹窗 / 设置面板 /
 *     轻提示等动态插入的内容），组合串 / 原生 alert、confirm / 画布文字在调用处用 t()。
 *   - 语言选择持久化在 localStorage（pulseframe_lang），默认 en；
 *     切换 = 持久化 + 刷新页面（画布状态本就不持久化，刷新与现有行为一致）。
 *   - Studio 复用本模块（同一单例、同一存储键），自己的词条经 registerDictionary()
 *     注入（studio/js/i18n.zh.js）；主编辑器不注册额外词典，行为与观感不变。
 */

import { ZH_DICT, ZH_PATTERNS } from './i18n.zh.js';

const STORAGE_KEY = 'pulseframe_lang';

// 额外词典 / 模式（registerDictionary 注入，主编辑器恒为空）
const EXTRA_DICTS = [];
const EXTRA_PATTERNS = [];

/**
 * 注册额外词典（Studio 复用本核心时调用，需在 t()/initI18n() 之前）。
 * 查找顺序：主词典 → 各额外词典（按注册序）→ 主模式 → 各额外模式；
 * 精确键永远优先于正则。纯增量：不调用时行为与之前逐字节一致。
 * @param {Object} dict - 英文原文 → 中文 的精确映射
 * @param {Array<[RegExp, string]>} [patterns] - 正则模式，模板用 {1}/{2} 引用捕获组
 */
export function registerDictionary(dict, patterns) {
    if (dict && typeof dict === 'object') EXTRA_DICTS.push(dict);
    if (Array.isArray(patterns)) EXTRA_PATTERNS.push(...patterns);
}

let _lang = 'en';
try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'zh' || saved === 'en') _lang = saved;
} catch (e) { /* localStorage 不可用（隐私模式等）时回退默认英文 */ }

/** 当前语言：'en' | 'zh' */
export function getLang() { return _lang; }

/** 是否中文模式 */
export function isZh() { return _lang === 'zh'; }

/**
 * 切换语言：持久化后刷新页面。
 * @param {string} lang - 'en' | 'zh'
 */
export function setLang(lang) {
    if ((lang !== 'en' && lang !== 'zh') || lang === _lang) return;
    try { localStorage.setItem(STORAGE_KEY, lang); } catch (e) { /* 忽略配额错误 */ }
    location.reload();
}

/** {name} 占位符替换（params 也可以是正则 match 数组，用 {1}/{2} 引用捕获组） */
function fill(text, params) {
    if (!params) return text;
    return text.replace(/\{(\w+)\}/g, (m, k) => (params[k] != null ? String(params[k]) : m));
}

/** 查一条完整文案的中文翻译：先精确字典（主→额外），再正则模式（主→额外）；未命中返回 null */
function lookupZh(text) {
    const hit = ZH_DICT[text];
    if (hit !== undefined) return hit;
    for (let i = 0; i < EXTRA_DICTS.length; i++) {
        const h = EXTRA_DICTS[i][text];
        if (h !== undefined) return h;
    }
    for (let i = 0; i < ZH_PATTERNS.length; i++) {
        const m = text.match(ZH_PATTERNS[i][0]);
        if (m) return fill(ZH_PATTERNS[i][1], m);
    }
    for (let i = 0; i < EXTRA_PATTERNS.length; i++) {
        const m = text.match(EXTRA_PATTERNS[i][0]);
        if (m) return fill(EXTRA_PATTERNS[i][1], m);
    }
    return null;
}

/**
 * 翻译 UI 文案（JS 调用处：组合串 / 原生弹窗 / 画布文字）。
 * en 模式原样返回（仅做占位符替换）；zh 模式先查字典再替换占位符。
 * @param {string} enText - 英文源文案，可含 {name} 占位符
 * @param {Object} [params] - 占位符参数
 * @returns {string}
 */
export function t(enText, params) {
    let out = String(enText);
    if (_lang === 'zh') {
        const zh = lookupZh(out);
        if (zh !== null) out = zh;
    }
    return fill(out, params);
}

// ===== zh 模式 DOM 翻译（en 模式不启动，零开销） =====

// 这些标签的文本内容不翻译（脚本 / 样式 / 用户输入 / 画布）；
// INPUT 仅翻译 placeholder/title 等属性，不碰 value；OPTION 要翻译（原生下拉可见）
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'CANVAS', 'TEMPLATE']);
const TRANS_ATTRS = ['title', 'placeholder', 'aria-label', 'alt'];

/** 翻译文本节点：trim 后精确匹配，保留原有首尾空白；译文与原文相同则不写回（防观察器循环） */
function translateText(node) {
    const raw = node.nodeValue;
    if (!raw) return;
    const trimmed = raw.trim();
    if (!trimmed) return;
    const zh = lookupZh(trimmed);
    if (zh === null) return;
    const lead = raw.match(/^\s*/)[0];
    const tail = raw.match(/\s*$/)[0];
    const next = lead + zh + tail;
    if (next !== raw) node.nodeValue = next;
}

/** 翻译元素的可见性属性（title / placeholder / aria-label / alt） */
function translateAttrs(el) {
    if (!el.getAttribute) return;
    for (let i = 0; i < TRANS_ATTRS.length; i++) {
        const a = TRANS_ATTRS[i];
        const v = el.getAttribute(a);
        if (!v) continue;
        const trimmed = v.trim();
        if (!trimmed) continue;
        const zh = lookupZh(trimmed);
        if (zh === null || zh === trimmed) continue;
        el.setAttribute(a, zh);
    }
}

/** 元素自身或任一祖先带 data-i18n-skip → 整棵子树不翻译（如字体名按钮组，字体名是数据不是文案） */
function isSkipped(el) {
    for (; el && el.nodeType === 1; el = el.parentElement) {
        if (el.dataset && el.dataset.i18nSkip !== undefined) return true;
    }
    return false;
}

/** 递归翻译节点（文本节点 / 元素子树） */
function translateNode(node) {
    if (node.nodeType === 3) { translateText(node); return; }
    if (node.nodeType !== 1) return;
    if (node.dataset && node.dataset.i18nSkip !== undefined) return;
    const tag = String(node.tagName).toUpperCase();
    if (tag === 'INPUT') { translateAttrs(node); return; }
    if (SKIP_TAGS.has(tag) || node.isContentEditable) return;
    translateAttrs(node);
    for (let c = node.firstChild; c; c = c.nextSibling) translateNode(c);
}

/** 观察器增量入口：新增节点可能挂在被跳过的子树里，要向上查祖先 */
function translateAdded(node) {
    if (node.nodeType === 3) {
        if (!isSkipped(node.parentElement)) translateText(node);
    } else if (node.nodeType === 1 && !isSkipped(node)) {
        translateNode(node);
    }
}

let _observer = null;

/**
 * zh 模式：翻译现有 DOM 并监听后续增量（layui 弹窗、设置面板、轻提示等）。
 * en 模式直接返回。译文不再命中任何英文键，写回又有同值守卫，观察器不会循环。
 */
export function startDomTranslation() {
    if (_lang !== 'zh' || _observer) return;
    document.documentElement.lang = 'zh-CN';
    const zhTitle = lookupZh(document.title);
    if (zhTitle) document.title = zhTitle;
    translateNode(document.body);
    _observer = new MutationObserver((muts) => {
        for (let i = 0; i < muts.length; i++) {
            const m = muts[i];
            if (m.type === 'childList') {
                m.addedNodes.forEach(translateAdded);
            } else if (m.type === 'characterData') {
                if (!isSkipped(m.target.parentElement)) translateText(m.target);
            } else if (m.type === 'attributes') {
                if (!isSkipped(m.target)) translateAttrs(m.target);
            }
        }
    });
    _observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: TRANS_ATTRS
    });
}

/** 绑定顶部 EN / 中 切换按钮（index.html 里的静态标记） */
export function initLangToggle() {
    const root = document.getElementById('langSwitch');
    if (!root) return;
    root.querySelectorAll('button[data-lang]').forEach(btn => {
        const on = btn.dataset.lang === _lang;
        btn.classList.toggle('active', on);
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
        btn.addEventListener('click', () => setLang(btn.dataset.lang));
    });
}

/** 入口：DOM 就绪、各面板初始化完成后调用（en 模式只绑定切换按钮） */
export function initI18n() {
    initLangToggle();
    startDomTranslation();
}