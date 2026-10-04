/**
 * CustomComponentPanels.js - 左侧「本地 / 共享」自定义组件面板
 *
 * 数据源（均由 components/visual/loader.js 启动时注册进 registry，def.isVisual=true）：
 *   - 本地：浏览器 localStorage（键前缀 studio_comp_），studio「保存本地」的作品
 *   - 共享：服务器 api.php list&kind=component，用户上传、管理员审核发布的组件
 * registry def 上的 source 字段（'local'/'remote'）区分来源。
 *
 * 点击卡片 = 添加到画布（与原生组件一致：需先上传轨迹数据、同 id 单实例）。
 */

import { registry } from '../components/registry.js';
import { addComponentToCanvas, removeComponentFromCanvas } from '../components/factory.js';
import { store } from '../core/Store.js';
import { canvasManager } from '../core/CanvasManager.js';
import { eventBus, Events } from '../core/EventBus.js';
import { safeThumb } from '../core/appConfig.js';
import { loadLocalComponents, LOCAL_PREFIX, REMOTE_EVENT, fetchRemoteRows, ensureRowRegistered, REMOTE_PAGE } from '../components/visual/loader.js';

const CAT_LABELS = { running: 'Running', cycling: 'Cycling', swimming: 'Swimming', time: 'Time', distance: 'Distance', map: 'Map', chart: 'Chart', attr: 'Attribute', text: 'Text', theme: 'Theme' };

const escText = (v) => String(v == null ? '' : v).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const escAttr = (v) => String(v == null ? '' : v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** 添加到画布（校验逻辑与 WidgetPicker 原生组件一致），两个面板共用 */
function addVisualToCanvas(componentId) {
    const trkpt = store.get('trkptData');
    if (!trkpt || trkpt.length === 0) {
        alert('Please upload gpx, tcx, fit data files first');
        return;
    }
    const frame = canvasManager.frame;
    if (frame) {
        try {
            const found = frame.find('#' + componentId);
            const existing = Array.isArray(found) ? found : (found ? [found] : []);
            if (existing.length > 0) {
                eventBus.emit(Events.COMPONENT_SELECTED, componentId);
                return;
            }
        } catch (e) { console.warn('[CustomPanel] findOne error:', e.message); }
    }
    const box = addComponentToCanvas(componentId);
    if (!box) console.warn(`[CustomPanel] add failed: ${componentId}`);
}

class CustomPanel {
    /**
     * @param {string} source - 'local' | 'remote'
     * @param {Object} ui - { title, empty }
     */
    constructor(source, ui) {
        this._source = source;
        this._ui = ui;
        this._container = null;
    }

    init(container) {
        this._container = typeof container === 'string' ? document.querySelector(container) : container;
        if (!this._container) { console.error('[CustomPanel] container not found:', this._source); return; }
        this.render();
        if (this._source === 'remote') eventBus.on(REMOTE_EVENT, () => this.render());
        else if (typeof window !== 'undefined') {
            // 另一个标签页（studio）保存/删除了本地组件 → 自动刷新列表，无需刷新页面
            window.addEventListener('storage', (e) => {
                if (!e.key || e.key.indexOf(LOCAL_PREFIX) !== 0) return;
                loadLocalComponents();
                this.render();
            });
        }
        // 画布增删组件 / 清空 / 模板载入 → 刷“已在画布”高亮态
        [Events.COMPONENT_ADDED, Events.COMPONENT_REMOVED, Events.CANVAS_CLEAR, Events.TEMPLATE_LOAD]
            .forEach(ev => eventBus.on(ev, () => this.markOnCanvas()));
    }

    render() {
        if (!this._container) return;
        let defs = Object.values(registry.getAll()).filter(d => d.isVisual && d.source === this._source);
        if (this._source === 'local') {
            // 已删的本地组件（registry 无法反注册）不展示：以 localStorage 现存键为准
            try {
                defs = defs.filter(d => localStorage.getItem(LOCAL_PREFIX + d.id) !== null);
            } catch (e) { /* 隐私模式读不到 localStorage，保持原列表 */ }
        }
        defs.sort((a, b) => String(a.name).localeCompare(String(b.name)));
        const isShared = this._source === 'remote';

        let html = `
            <div class="custom-comp-head">
                <span>${this._ui.title}<span class="cch-count">${defs.length}</span></span>
                ${isShared ? '<button class="layui-btn layui-btn-xs layui-btn-primary" data-act="refresh" style="height:22px;line-height:20px;">Refresh</button>' : ''}
            </div>`;

        if (!defs.length) {
            html += `<div class="custom-comp-empty">${this._ui.empty}</div>`;
        } else {
            html += '<div class="custom-comp-list">';
            defs.forEach(def => {
                const isRemote = def.source === 'remote';
                // 展示优先取 DB 行（与 Studio Open Library 对齐）；无 store 字段时回退到 spec 自身。
                const cat = CAT_LABELS[def.storeCategory || def.category] || def.storeCategory || def.category || '';
                const size = `${def.defaultConfig?.width || '?'}×${def.defaultConfig?.height || '?'}`;
                const name = (isRemote ? (def.storeTitle || def.name) : def.name) || def.id;
                const author = isRemote && def.storeAuthor ? 'by ' + def.storeAuthor : '';
                const initial = String(name).trim().charAt(0).toUpperCase() || 'C';
                // id 尾缀：remote 直接展 DB 行 id（与 Studio Open Library 里的 #<row.id> 一致）；
                // local 展 spec.meta.id 去前缀后尾 4 位，区分同名多次保存。
                const tail = isRemote
                    ? (def.storeId ? '#' + def.storeId : '#' + String(def.id).replace(/^custom_/, '').slice(-4))
                    : '#' + String(def.id).replace(/^custom_/, '').slice(-4);
                const meta = [cat, size, tail, author].filter(Boolean).join(' · ');
                html += `
                    <div class="custom-comp-card${isShared ? ' src-shared' : ''}" data-component-id="${escAttr(def.id)}" title="Click to add to canvas (${escAttr(isRemote ? (def.storeId || def.id) : def.id)})">
                        <div class="cc-thumb">${escText(initial)}</div>
                        <div class="cc-info">
                            <div class="cc-name">${escText(name)}</div>
                            <div class="cc-meta">${escText(meta)}</div>
                        </div>
                        <div class="cc-actions">
                            <button type="button" class="cc-btn cc-add" data-act="add" title="Add to canvas">+</button>
                            <button type="button" class="cc-btn cc-edit" data-act="edit" title="Open in Studio">&#9998;</button>
                            ${!isShared ? '<button type="button" class="cc-btn cc-del" data-act="del" title="Delete local copy">&#10005;</button>' : ''}
                        </div>
                    </div>`;
            });
            html += '</div>';
        }
        this._container.innerHTML = html;

        const rf = this._container.querySelector('[data-act="refresh"]');
        if (rf) rf.addEventListener('click', async (e) => {
            e.stopPropagation();
            rf.disabled = true; rf.textContent = 'Refreshing…';
            await loadRemoteComponents();
            this.render();
        });
        this._container.querySelectorAll('[data-component-id]').forEach(el => {
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = el.dataset.componentId;
                const btn = e.target.closest('[data-act]');
                const act = btn ? btn.dataset.act : 'add';
                if (act === 'edit') { this._edit(id); return; }
                if (act === 'del')  { this._del(id);  return; }
                this._add(id);
            });
        });
        this.markOnCanvas();
    }

    /** 已在画布上的组件高亮（避免用户重复点、找不到已添加的那个） */
    markOnCanvas() {
        if (!this._container) return;
        const active = (store.get('activeComponents') || []).map(c => c.id);
        this._container.querySelectorAll('[data-component-id]').forEach(el => {
            el.classList.toggle('on-canvas', active.indexOf(el.dataset.componentId) >= 0);
        });
    }

    /** 添加到画布（校验逻辑与 WidgetPicker 原生组件一致） */
    _add(componentId) {
        addVisualToCanvas(componentId);
    }

    /**
     * 开新标签页到 studio，带 URL 参数自动载入当前仪表盘。
     *   local  → studio 从 localStorage[studio_comp_<id>] 读，传入 spec.meta.id（也就是 LOCAL_PREFIX 后缀）
     *   shared → studio 从 apiBase()?action=detail&id=<DB行id> 拉取 json_content，需传 DB id
     *           （已注册 def 上的 storeId）；旧缓存无 storeId 时回退到 registry id，保证不 500。
     */
    _edit(componentId) {
        const from = this._source === 'local' ? 'local' : 'shared';
        let key = componentId;
        if (from === 'shared') {
            const def = registry.get(componentId);
            key = (def && def.storeId) ? def.storeId : componentId;
        }
        // 从当前页面目录推算 studio 相对路径：主编辑器与 studio 同级，主编辑器下使用
        // “./studio/”，studio 下则使用 “./”。
        const base = /\/studio\/(index\.html)?$/i.test(location.pathname)
            ? './index.html'
            : './studio/index.html';
        const url = `${base}?editFrom=${from}&editId=${encodeURIComponent(key)}`;
        window.open(url, '_blank', 'noopener');
    }

    /**
     * 仅本地卡片可见的“删除”：移除 localStorage 里的 studio_comp_<id>，
     * 重进 registry 仍旧保留已注册的 def，因此额外以当前列表为准过滤展示。
     * Shared 卡片不展示此按钮（不能删别人的发布），无此方法分支。
     */
    _del(componentId) {
        if (this._source !== 'local') return;
        const def = registry.get(componentId);
        const shown = def ? (def.name || def.id) : componentId;
        if (!confirm('Delete local component "' + shown + '"?\nThis removes it from this browser and cannot be undone.')) return;
        try { localStorage.removeItem(LOCAL_PREFIX + componentId); } catch (e) { /* ignore */ }
        // 当前画布上同 id 的实例一并移除，同时更新 activeComponents。
        try { removeComponentFromCanvas(componentId); } catch (e) { /* ignore */ }
        loadLocalComponents();
        this.render();
    }
}

export const localComponents = new CustomPanel('local', {
    title: 'Local Components',
    empty: 'No local components yet<br/><a href="./studio/index.html" target="_blank" style="color:#1E9FFF;">Create in PulseFrame Studio →</a><br/><span style="color:#bbb;">After designing, click "Save Local" and it will appear here (stored in this browser)</span>'
});

/**
 * Shared 面板（服务器来源）：分页加载，每页 10 条，滚动到底自动续拉。
 * 展示直接用 DB 行元信息（list 接口已含 thumbnail/author/created_at/description），
 * 组件本体按行懒注册（ensureRowRegistered），卡片上预览图即后台批准时自动生成的概览截图。
 */
class RemotePanel {
    constructor(ui) {
        this._ui = ui;
        this._container = null;
        this._rows = [];
        this._total = 0;
        this._offset = 0;
        this._loading = false;
        this._keyword = '';
        this._searchTimer = null;
    }

    init(container) {
        this._container = typeof container === 'string' ? document.querySelector(container) : container;
        if (!this._container) { console.error('[RemotePanel] container not found'); return; }
        this.render();
        this.loadPage(true);
        // 画布增删 → 刷“已在画布”高亮
        [Events.COMPONENT_ADDED, Events.COMPONENT_REMOVED, Events.CANVAS_CLEAR, Events.TEMPLATE_LOAD]
            .forEach(ev => eventBus.on(ev, () => this.markOnCanvas()));
    }

    async loadPage(reset) {
        if (this._loading) return;
        this._loading = true;
        this.render();                                   // 先画 Loading 态
        const offset = reset ? 0 : this._offset;
        const { rows, total } = await fetchRemoteRows(REMOTE_PAGE, offset, this._keyword);
        if (reset) {
            this._rows = rows;
        } else {
            const seen = new Set(this._rows.map(r => String(r.id)));
            this._rows = this._rows.concat(rows.filter(r => !seen.has(String(r.id))));
        }
        this._total = total;
        this._offset = offset + rows.length;
        this._loading = false;
        this.render();
        // 本页组件本体后台注册；完成后补一次渲染以显示尺寸信息
        Promise.all(rows.map(r => ensureRowRegistered(r.id))).then(() => this.render());
        this._fillViewport();
    }

    /** 列表短不到一屏且还有更多 → 主动续拉，避免用户无法触发滚动加载 */
    _fillViewport() {
        const list = this._container && this._container.querySelector('.custom-comp-list');
        if (!list || this._loading) return;
        if (this._rows.length < this._total && list.scrollHeight <= list.clientHeight + 24) {
            this.loadPage(false);
        }
    }

    render() {
        if (!this._container) return;
        // innerHTML 重建会丢焦点：先记录搜索框是否在聚焦中及光标位置，重建后恢复。
        const prevSearch = this._container.querySelector('.cc-search-input');
        const refocus = !!(prevSearch && document.activeElement === prevSearch);
        const caret = refocus ? prevSearch.selectionStart : 0;
        const hasMore = this._rows.length < this._total;
        const searching = !!this._keyword;
        let html = `
            <div class="custom-comp-head">
                <span>${this._ui.title}<span class="cch-count">${this._rows.length}${this._total ? '/' + this._total : ''}</span></span>
                <button class="layui-btn layui-btn-xs layui-btn-primary" data-act="refresh" style="height:22px;line-height:20px;">Refresh</button>
            </div>
            <div class="cc-search">
                <input type="search" class="cc-search-input" placeholder="Search name / author / description…" value="${escAttr(this._keyword)}">
                ${searching ? '<button type="button" class="cc-search-clear" data-act="clearsearch" title="Clear search">&times;</button>' : ''}
            </div>`;

        if (!this._rows.length && !this._loading) {
            html += `<div class="custom-comp-empty">${searching ? 'No components matching "' + escText(this._keyword) + '"' : this._ui.empty}</div>`;
            this._container.innerHTML = html;
        } else {
            html += '<div class="custom-comp-list">';
            this._rows.forEach(row => { html += this._card(row); });
            if (this._loading) html += '<div class="cc-loadmore">Loading…</div>';
            else if (hasMore) html += '<div class="cc-loadmore">Scroll down to load more</div>';
            else if (this._rows.length) html += '<div class="cc-loadmore">— all loaded —</div>';
            html += '</div>';
            this._container.innerHTML = html;

            const list = this._container.querySelector('.custom-comp-list');
            list.addEventListener('scroll', () => {
                if (this._loading) return;
                if (list.scrollTop + list.clientHeight >= list.scrollHeight - 40) this.loadPage(false);
            });
        }

        // 搜索条：输入防抖 350ms 后从第一页重拉；重渲染时恢复焦点与光标位置，
        // 避免边打字边被重建打断。
        const search = this._container.querySelector('.cc-search-input');
        if (search) {
            if (refocus) {
                search.focus();
                try { search.setSelectionRange(caret, caret); } catch (e) { /* ignore */ }
            }
            search.addEventListener('input', () => {
                clearTimeout(this._searchTimer);
                this._searchTimer = setTimeout(() => {
                    const kw = search.value.trim();
                    if (kw === this._keyword) return;
                    this._keyword = kw;
                    this.loadPage(true);
                }, 350);
            });
            search.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') { e.preventDefault(); clearTimeout(this._searchTimer); this._keyword = search.value.trim(); this.loadPage(true); }
            });
        }

        const clr = this._container.querySelector('[data-act="clearsearch"]');
        if (clr) clr.addEventListener('click', (e) => { e.stopPropagation(); this._keyword = ''; this.loadPage(true); });

        const rf = this._container.querySelector('[data-act="refresh"]');
        if (rf) rf.addEventListener('click', (e) => { e.stopPropagation(); this.loadPage(true); });
        this._container.querySelectorAll('[data-row-id]').forEach(el => {
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                const btn = e.target.closest('[data-act]');
                const act = btn ? btn.dataset.act : 'add';
                const row = this._rows.find(r => String(r.id) === el.dataset.rowId);
                if (!row) return;
                if (act === 'edit') { this._edit(row); return; }
                this._add(row);
            });
        });
        this.markOnCanvas();
    }

    _card(row) {
        const thumb = safeThumb(row.thumbnail);
        const name = row.title || ('#' + row.id);
        const initial = String(name).trim().charAt(0).toUpperCase() || 'C';
        const cat = CAT_LABELS[row.category] || row.category || '';
        const def = this._defFor(row.id);
        const size = def ? `${def.defaultConfig?.width || '?'}×${def.defaultConfig?.height || '?'}` : '';
        const meta = [cat, size, '#' + row.id, row.created_at].filter(Boolean).join(' · ');
        // 上下结构：1:1 通栏概览图在上，信息在下；作者名称必展示（缺失时占位）。
        return `
            <div class="custom-comp-card src-shared" data-row-id="${escAttr(row.id)}" title="Click to add to canvas">
                <div class="cc-media${thumb ? ' cc-img' : ''}">${thumb ? `<img src="${escAttr(thumb)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<span class="cc-media-fallback">${escText(initial)}</span>`}</div>
                <div class="cc-body">
                    <div class="cc-name">${escText(name)}</div>
                    <div class="cc-author">${row.author ? '👤 ' + escText(row.author) : '👤 —'}</div>
                    <div class="cc-meta">${escText(meta)}</div>
                    ${row.description ? `<div class="cc-desc">${escText(row.description)}</div>` : ''}
                    <div class="cc-actions">
                        <button type="button" class="cc-btn cc-add" data-act="add" title="Add to canvas">+</button>
                        <button type="button" class="cc-btn cc-edit" data-act="edit" title="Open in Studio">&#9998;</button>
                    </div>
                </div>
            </div>`;
    }

    /** DB 行 id → 已注册的 def（registry 里带 storeId 的视觉组件） */
    _defFor(rowId) {
        const rid = String(rowId);
        return Object.values(registry.getAll()).find(d => d.isVisual && String(d.storeId) === rid) || null;
    }

    async _add(row) {
        let def = this._defFor(row.id);
        if (!def) {
            const id = await ensureRowRegistered(row.id);
            def = id ? registry.get(id) : null;
        }
        if (!def) { alert('Component content not available yet, try again in a moment'); return; }
        addVisualToCanvas(def.id);
        this.markOnCanvas();
    }

    _edit(row) {
        const base = /\/studio\/(index\.html)?$/i.test(location.pathname)
            ? './index.html'
            : './studio/index.html';
        window.open(`${base}?editFrom=shared&editId=${encodeURIComponent(row.id)}`, '_blank', 'noopener');
    }

    markOnCanvas() {
        if (!this._container) return;
        const active = (store.get('activeComponents') || []).map(c => String(c.id));
        this._container.querySelectorAll('[data-row-id]').forEach(el => {
            const def = this._defFor(el.dataset.rowId);
            el.classList.toggle('on-canvas', !!(def && active.indexOf(String(def.id)) >= 0));
        });
    }
}

export const sharedComponents = new RemotePanel({
    title: 'Shared Components',
    empty: 'No shared components yet<br/><a href="./studio/index.html" target="_blank" style="color:#1E9FFF;">Create in PulseFrame Studio →</a><br/><span style="color:#bbb;">Click "Submit to Library"; it will be published to all users after admin approval</span>'
});
