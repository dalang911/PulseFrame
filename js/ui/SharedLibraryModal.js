/**
 * SharedLibraryModal.js - 公共库（Open Library）弹窗的唯一实现
 *
 * 主编辑器左侧 Shared 面板的「Open Library」与 Studio 工具栏的「Open Library」
 * 共用这一份：同一套 DOM 结构 + 同一套类名（.sp-modal / .sp-lib-*），
 * 样式在 css/shared-library.css（两个页面都加载它）→ 两边观感一致。
 *
 * 本模块不依赖任何宿主模块（不 import appConfig / registry / store），
 * 两边各自把行数据传进来、各自决定点击卡片之后做什么：
 *   - Studio：点卡片 = 把该组件导入 Studio 画布
 *   - 主编辑器：点卡片 = 加到主画布；卡片右上角 ✎ = 到 Studio 里打开同一份
 *
 * 封面 URL 仍按白名单过滤（只放行 https 与 base64 图片），防 javascript: 注入。
 */

/** 只放行 https 与 base64 图片（与 core/appConfig.js 的 safeThumb 同一套规则） */
const SAFE_THUMB = /^(https:\/\/[^\s"'<>\\]+$|data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$)/i;

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const safeThumb = (u) => {
    const v = String(u || '').trim();
    return SAFE_THUMB.test(v) ? v : '';
};

/**
 * 单张卡片 HTML
 * @param {Object} r 行数据（list 接口的一行）
 * @param {Object} [opts] { onOpenStudio, pickTitle }
 */
export function libraryCardHtml(r, opts = {}) {
    const thumb = safeThumb(r.thumbnail);
    const name = r.title || ('#' + r.id);
    const initial = String(name).trim().charAt(0).toUpperCase() || 'C';
    // 「在 Studio 打开」按钮：只有宿主传了 onOpenStudio 才渲染，Studio 侧不传 → DOM 与从前一致
    const openBtn = opts.onOpenStudio
        ? `<button type="button" class="sp-lib-open" data-open title="Open in Studio">&#9998;</button>`
        : '';
    return `
                <div class="sp-lib-card" data-db-id="${esc(r.id)}" title="${esc(opts.pickTitle || 'Import to canvas')}">
                    <div class="sp-lib-media">${thumb ? `<img src="${esc(thumb)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<span class="sp-lib-fallback">${esc(initial)}</span>`}${openBtn}</div>
                    <div class="sp-lib-name">${esc(name)}</div>
                    <div class="sp-lib-sub">${r.author ? '👤 ' + esc(r.author) + ' · ' : '👤 — · '}#${esc(r.id)}${r.category ? ' · ' + esc(r.category) : ''}</div>
                </div>`;
}

/**
 * 打开公共库弹窗
 * @param {Object} opts
 *   rows          行数据数组（list 接口的 data）
 *   title         标题，默认 'Public Library'
 *   placeholder   搜索框提示文字
 *   emptyText     搜索无结果时的空态文字，默认 'No matching components'
 *   onPick(row)   点卡片（宿主决定动作，弹窗会先关闭）
 *   onOpenStudio(row)  可选：卡片右上角 ✎ 的动作
 *   pickTitle     卡片 title 属性，默认 'Import to canvas'
 *   wide          true → 宽版弹窗（一屏看到更多组件）
 * @returns {{ mask: HTMLElement, close: () => void }}
 */
export function openSharedLibrary(opts = {}) {
    const rows = Array.isArray(opts.rows) ? opts.rows : [];
    const title = opts.title || 'Public Library';
    const placeholder = opts.placeholder || 'Search name / author / category / description…';
    const emptyText = opts.emptyText || 'No matching components';
    const noItemsText = opts.noItemsText || 'No components yet';
    const onPick = opts.onPick;
    const onOpenStudio = opts.onOpenStudio;
    const cardOpts = { onOpenStudio, pickTitle: opts.pickTitle };

    const mask = document.createElement('div');
    mask.className = 'sp-modal show';
    mask.innerHTML = `
        <div class="sp-modal-content sp-lib-modal${opts.wide ? ' sp-lib-modal-wide' : ''}">
            <div class="sp-modal-head"><h3>${esc(title)} <span class="sp-lib-count">${rows.length}</span></h3><button class="sp-modal-x" data-close>&times;</button></div>
            <div class="sp-lib-search"><input type="search" class="sp-lib-kw" placeholder="${esc(placeholder)}"></div>
            <div class="sp-modal-body sp-lib-body"><div class="sp-lib-grid">${rows.length ? rows.map(r => libraryCardHtml(r, cardOpts)).join('') : `<div class="sp-empty">${esc(noItemsText)}</div>`}</div></div>
            <div class="sp-modal-foot"><button class="sp-btn" data-close>Close</button></div>
        </div>`;

    // 顶部搜索条：本地过滤（名称/作者/分类/描述），命中数实时回显
    const filter = (kw) => {
        const q = String(kw || '').trim().toLowerCase();
        const list = !q ? rows : rows.filter(r =>
            [r.title, r.author, r.category, r.description].some(v => String(v || '').toLowerCase().indexOf(q) >= 0));
        const grid = mask.querySelector('.sp-lib-grid');
        const cnt = mask.querySelector('.sp-lib-count');
        if (grid) grid.innerHTML = list.length ? list.map(r => libraryCardHtml(r, cardOpts)).join('') : `<div class="sp-empty">${esc(emptyText)}</div>`;
        if (cnt) cnt.textContent = q ? `${list.length}/${rows.length}` : String(rows.length);
    };

    const close = () => { if (mask.parentNode) mask.parentNode.removeChild(mask); };

    let kwTimer = null;
    const kwInput = mask.querySelector('.sp-lib-kw');
    kwInput.addEventListener('input', () => { clearTimeout(kwTimer); kwTimer = setTimeout(() => filter(kwInput.value), 200); });
    mask.addEventListener('click', (e) => {
        if (e.target === mask || e.target.closest('[data-close]')) { close(); return; }
        const openBtn = e.target.closest('[data-open]');
        if (openBtn) {
            e.stopPropagation();
            const card = openBtn.closest('.sp-lib-card');
            const row = card ? rows.find(r => String(r.id) === card.dataset.dbId) : null;
            if (row && onOpenStudio) onOpenStudio(row);
            return;
        }
        const card = e.target.closest('.sp-lib-card');
        if (card) {
            const row = rows.find(r => String(r.id) === card.dataset.dbId);
            close();
            if (row && onPick) onPick(row);
        }
    });
    document.body.appendChild(mask);
    kwInput.focus();

    return { mask, close };
}

export default { openSharedLibrary, libraryCardHtml };
