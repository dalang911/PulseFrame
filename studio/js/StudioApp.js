/**
 * studio/StudioApp.js - 组件设计器编排入口
 *
 * 串联：StudioCanvas + ElementPalette/PropsPanel/LayerPanel/BindingPanel/StudioPreview + SpecStore + SubmitDialog。
 * 负责顶栏元信息（名称/分类/尺寸/id）、工具栏动作（新建/打开本地/打开库/保存本地/导出/导入/提交/撤销/重做），
 * 以及键盘快捷键（Ctrl+Z / Ctrl+Shift+Z / Ctrl+S）。
 */

import { specStore } from './SpecStore.js';
import { studioCanvas } from './StudioCanvas.js';
import { elementPalette } from './ElementPalette.js';
import { propsPanel } from './PropsPanel.js';
import { multiSelectPanel } from './MultiSelectPanel.js';
import { layerPanel } from './LayerPanel.js';
import { bindingPanel } from './BindingPanel.js';
import { studioPreview } from './StudioPreview.js';
import { submitDialog } from './SubmitDialog.js';
import { handbookDialog } from './HandbookDialog.js';
import { registry } from './lib/registry.js';
import { validateSpec } from './lib/validateSpec.js';
import { setReservedIds, suggestUniqueId, findIdConflict } from './lib/idGuard.js';
import { themeManager, THEME_EVENT } from './ThemeManager.js';
import { loadFrontendDefs } from './FrontendGauges.js';
import { registerVisualComponent } from './runtime/visualFactory.js';
import { loadCustomComponents, LOCAL_PREFIX } from './runtime/loader.js';
import { apiBase } from './lib/appConfig.js';
import { DEMO_RQ } from './demoData.js';

const $ = (sel) => document.querySelector(sel);

class StudioApp {
    constructor() { this._metaFocus = false; }

    init() {
        this._checkStaleGraph();
        // 内置演示数据：独立打开 studio（未接入真实轨迹）时也提供预览帧，驱动数据预览进度条/播放。
        this._ensureDemoData();

        // 主题：先写入 html[data-theme]（head 前置脚本已防闪白，这里只是接管按钮与事件），
        // 必须在画布 init 之前，StudioCanvas 才能读到当前主题的底色变量。
        themeManager.init();
        // 按钮点击由 ThemeManager 自己绑定；只在此统一提示，保证快捷键/多标签页同步都会播报（避免重复绑定导致 toggle 抵消）
        document.addEventListener(THEME_EVENT, (e) => this._toast((e.detail && e.detail.theme) === 'dark' ? 'Dark theme' : 'Light theme'));

        // 画布与面板
        studioCanvas.init($('#studioCanvas'));
        elementPalette.init($('#spPalette'));
        propsPanel.init($('#spProps'));
        multiSelectPanel.init($('#spBatch'));
        layerPanel.init($('#spLayers'));
        bindingPanel.init($('#spBindings'));
        studioPreview.init($('#spPreview'));
        studioPreview.refresh();

        this._bindMeta();
        this._bindToolbar();
        this._bindShortcuts();

        // 载入本地自定义组件（使 registry 有内容，便于"打开库"与后续复用）
        loadCustomComponents();
        // 内置手写组件的 id 灌进 idGuard：studio 的 registry 里没有它们（注册在前端实例上），
        // 撞上了要改 ID 输入才拦得住（命中后 loader 会跳过，组件根本不出现）。
        loadFrontendDefs()
            .then(res => setReservedIds((res.defs || []).map(d => d.id)))
            .catch(() => { /* 前端定义拉不到：只少内置这一路检测，本地/远端仍拦得住 */ });

        this._syncMetaInputs();
        specStore.on('change', () => { if (!this._metaFocus) this._syncMetaInputs(); });

        // 首帧提交进历史基线
        specStore.commit('init');

        // 如果从主编辑器带了编辑参数打开（?editFrom=local&editId=xxx 或 ?editFrom=shared&editId=xxx）
        // → 自动载入对应仪表盘数据，直接进入编辑态。
        this._maybeAutoLoadFromUrl();
    }

    /**
     * URL 参数自动载入：主编辑器 Local/Shared 卡片上的“编辑”按钮会开新标签页，
     * 把目标组件的 id 带过来。studio 在 init 后拉取内容，灌进 specStore，后续保存
     * 会写回 localStorage：
     *   - local 同 id 就就地更新（编辑自己已存的项）
     *   - shared 自动将 spec.meta.id 重命名为 “<id>_shared<dbId>” 避免与已同名的本地项相盖
     */
    async _maybeAutoLoadFromUrl() {
        if (typeof location === 'undefined') return;
        const p = new URLSearchParams(location.search || '');
        const from = (p.get('editFrom') || '').toLowerCase();
        const id = p.get('editId') || p.get('id');
        if (!from || !id) return;
        if (from === 'local') {
            const spec = readLocalSpec(id);
            if (spec && spec.layers) {
                specStore.loadSpec(spec);
                this._toast('Editing local: ' + ((spec.meta && spec.meta.name) || id));
            } else {
                this._toast('Local component not found: ' + id);
            }
        } else if (from === 'shared') {
            this._toast('Loading shared #' + id);
            await this._importSharedRow(id);
        }
    }

    /**
     * 从 DB 行拉取 json_content，载入 specStore，并将 spec 内部的 meta.id 叉开，避免
     * “保存本地”时写到与已存在同名本地项相同的 key。_openLibraryDialog 与
     * _maybeAutoLoadFromUrl 共用。失败抛 alert（无返回值）。
     */
    async _importSharedRow(dbId) {
        try {
            const res = await fetch(`${apiBase()}?action=detail&id=${encodeURIComponent(dbId)}`);
            const ct = res.headers.get('content-type') || '';
            if (!ct.includes('application/json')) { alert('Backend unavailable'); return null; }
            const d = await res.json();
            const content = d && d.data && d.data.json_content;
            if (!content) { alert('No content for shared component #' + dbId); return null; }
            specStore.importString(content);
            // 重命名 id：将当前 spec.meta.id 加上 _shared<dbId> 后缀，保证与同名本地项不冲突。
            const cur = (specStore.getSpec().meta && specStore.getSpec().meta.id) || ('shared_' + dbId);
            const forked = /_shared\d+$/.test(cur) ? cur : cur + '_shared' + dbId;
            if (forked && forked !== cur) specStore.setMeta({ id: forked }, false);
            const row = d.data || {};
            this._toast('Editing copy of "' + (row.title || cur) + '" (#' + dbId + ' → ' + forked + ')');
            return { row, content };
        } catch (e) { alert('Load failed: ' + e.message); return null; }
    }

    // 若页面尚未注入真实轨迹数据，用内置体育场演示数据填充（不覆盖已有外部数据）
    _ensureDemoData() {
        const trk = DEMO_RQ && DEMO_RQ.data && DEMO_RQ.data.trkpt;
        if (!window.__trkptData && Array.isArray(trk) && trk.length) {
            window.__trkptData = trk;
            window.__chartData = DEMO_RQ._chartData || {};
        }
    }

    // ===== 元信息 =====
    _bindMeta() {
        const map = [
            ['#metaName', 'name', 'text'],
            ['#metaCategory', 'category', 'select'],
            ['#metaWidth', 'width', 'number'],
            ['#metaHeight', 'height', 'number'],
            ['#metaId', 'id', 'text']
        ];
        map.forEach(([sel, key, kind]) => {
            const el = $(sel);
            if (!el) return;
            el.addEventListener('focus', () => { this._metaFocus = true; });
            el.addEventListener('blur', () => { this._metaFocus = false; });
            el.addEventListener('change', () => {
                let v = el.value;
                if (kind === 'number') v = Math.max(1, Number(v) || 1);
                if (key === 'id') {
                    v = v.trim().replace(/[^a-zA-Z0-9_]/g, '') || specStore.getSpec().meta.id;
                    v = this._guardId(v);       // 撞车自动改名，避免覆掉另一个组件
                }
                specStore.setMeta({ [key]: v }, true);
                if (key === 'id' && el.value !== v) el.value = v;   // 改名要回写输入框（_metaFocus 会挡住自动同步）
            });
        });
    }

    /**
     * 组件 ID 防撞：把已被本地/内置/会话内注册占用的 id 推到一个可用后缀。
     * selfId = 当前 spec 自己的 id（就地编辑自己不算冲突）。
     */
    _guardId(id) {
        const self = specStore.getSpec().meta && specStore.getSpec().meta.id;
        const hit = findIdConflict(id, self);
        if (!hit) return id;
        const fixed = suggestUniqueId(id, self);
        this._toast(`ID "${id}" ${hit.reason === 'builtin' ? 'is a built-in id' : hit.reason === 'local' ? 'belongs to a saved local component' : 'is already registered'} → renamed to "${fixed}"`);
        return fixed;
    }

    _syncMetaInputs() {
        const meta = specStore.getSpec().meta;
        const set = (sel, v) => { const el = $(sel); if (el && document.activeElement !== el) el.value = v; };
        set('#metaName', meta.name || '');
        set('#metaCategory', meta.category || 'distance');
        set('#metaWidth', meta.width || 400);
        set('#metaHeight', meta.height || 200);
        set('#metaId', meta.id || '');
    }

    // ===== 工具栏 =====
    _bindToolbar() {
        const on = (sel, fn) => { const el = $(sel); if (el) el.addEventListener('click', fn); };
        on('#btnNew', () => this._newComponent());
        on('#btnReset', () => this._resetCanvas());
        on('#btnOpenLocal', () => this._openLocalDialog());
        on('#btnOpenLib', () => this._openLibraryDialog());
        on('#btnSaveLocal', () => this._saveLocal());
        on('#btnExport', () => this._exportJson());
        on('#btnImport', () => $('#importFile') && $('#importFile').click());
        on('#btnOpenJson', () => this._openJsonDialog());
        on('#btnSubmit', () => submitDialog.open());
        on('#btnHandbook', () => handbookDialog.open());
        on('#btnUndo', () => { if (specStore.undo()) this._toast('Undone'); });
        on('#btnRedo', () => { if (specStore.redo()) this._toast('Redone'); });
        on('#btnCopy', () => this._copy());
        on('#btnPaste', () => this._paste());
        on('#btnDeleteSel', () => this._deleteSel());

        const file = $('#importFile');
        if (file) file.addEventListener('change', () => this._importFile(file));
    }

    // ===== 复制/粘贴/批量删除 =====
    _copy() { const n = specStore.copySelection(); this._toast(n ? 'Copied ' + n + ' layers' : 'No layers selected'); }
    _paste() {
        const uids = specStore.paste();
        if (uids.length) this._toast('Pasted ' + uids.length);
        else this._toast('Clipboard is empty');
    }
    _deleteSel() { const n = specStore.deleteSelection(); if (n) this._toast('Deleted ' + n); }

    _newComponent() {
        if (!confirm('Creating a new component will clear current unsaved edits. Continue?')) return;
        specStore.newComponent();
        this._toast('Created new');
    }

    /** 重置页面：初始化画布（清空全部图层，保留当前组件 meta） */
    _resetCanvas() {
        const spec = specStore.getSpec();
        if (!(spec.layers || []).length) { this._toast('Canvas is already empty'); return; }
        if (!confirm('Reset will clear all layers on the canvas (keeping component name/category/size). Continue?')) return;
        const blank = JSON.parse(JSON.stringify(spec));
        blank.layers = [];
        specStore.loadSpec(blank);
        this._toast('Canvas reset');
    }

    _saveLocal() {
        const spec = specStore.getSpec();
        if (!spec.meta.name || !spec.meta.name.trim()) { alert('Please enter a component name first'); return; }
        // 本地键就是 studio_comp_{meta.id}，id 撞车会直接覆掉另一份组件，先改名再写
        const origId = spec.meta.id;
        const safe = this._guardId(origId);
        if (safe !== origId) specStore.setMeta({ id: safe }, false);
        const id = specStore.saveLocal();
        registerVisualComponent(JSON.parse(JSON.stringify(specStore.getSpec()))); // 立即生效于本会话 registry
        this._toast('Saved to local: ' + id + (safe === origId ? '' : ` (renamed, "${origId}" was taken)`));
    }

    _exportJson() {
        const spec = specStore.getSpec();
        const fname = (spec.meta.id || 'component') + '.json';
        const blob = new Blob([specStore.exportString()], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = fname;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    _importFile(fileInput) {
        const f = fileInput.files && fileInput.files[0];
        if (!f) return;
        const reader = new FileReader();
        reader.onload = () => {
            try { specStore.importString(reader.result); this._toast('Import successful'); }
            catch (e) { alert('Import failed: ' + e.message); }
            fileInput.value = '';
        };
        reader.readAsText(f);
    }

    // ===== 打开：粘贴 JSON 导入（先校验合格再导入系统） =====
    _openJsonDialog() {
        const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
        const mask = document.createElement('div');
        mask.className = 'sp-modal show';
        mask.innerHTML = `
            <div class="sp-modal-content sp-json-modal">
                <div class="sp-modal-head"><h3>Open JSON</h3><button class="sp-modal-x" data-close>&times;</button></div>
                <div class="sp-modal-body">
                    <div class="sp-modal-note">Paste a full Component Spec JSON (top level must contain a <code>meta</code> object and a <code>layers</code> array). It is validated before importing — nothing changes on the canvas until validation passes.</div>
                    <textarea class="sp-json-area" placeholder='{\n  "version": 1,\n  "meta": { "id": "custom_...", "name": "...", "category": "distance", "width": 400, "height": 200 },\n  "layers": [ ... ]\n}' spellcheck="false"></textarea>
                    <div class="sp-json-msg" hidden></div>
                </div>
                <div class="sp-modal-foot">
                    <button class="sp-btn" data-close>Cancel</button>
                    <button class="sp-btn sp-btn-primary" data-validate>Validate &amp; Import</button>
                </div>
            </div>`;
        const close = () => mask.remove();
        const area = mask.querySelector('.sp-json-area');
        const msg = mask.querySelector('.sp-json-msg');
        const showMsg = (kind, title, lines) => {
            msg.hidden = false;
            msg.className = 'sp-json-msg ' + kind;
            const body = lines && lines.length
                ? `<ul class="sp-json-list">${lines.map(l => `<li>${esc(l)}</li>`).join('')}</ul>` : '';
            msg.innerHTML = `<strong>${esc(title)}</strong>${body}`;
        };
        const clearMsg = () => { msg.hidden = true; msg.innerHTML = ''; msg.className = 'sp-json-msg'; };
        const doValidate = () => {
            const text = (area.value || '').trim();
            if (!text) { showMsg('err', 'Please paste JSON first.', []); area.focus(); return; }
            let parsed;
            try { parsed = JSON.parse(text); }
            catch (e) { showMsg('err', 'Invalid JSON: ' + e.message, []); return; }
            const { errors, warnings } = validateSpec(parsed);
            if (errors.length) { showMsg('err', `Validation failed (${errors.length} issue${errors.length > 1 ? 's' : ''}), not imported:`, errors); return; }
            try { specStore.importString(text); }   // re-parse + hard guard (meta & layers) then loadSpec
            catch (e) { showMsg('err', 'Import failed: ' + e.message, []); return; }
            this._toast('Imported: ' + (parsed.meta.name || parsed.meta.id || 'component'));
            if (warnings.length) showMsg('warn', `Imported with ${warnings.length} note(s):`, warnings);
            else close();
        };
        mask.addEventListener('click', (e) => {
            if (e.target === mask || e.target.closest('[data-close]')) { close(); return; }
            if (e.target.closest('[data-validate]')) { doValidate(); }
        });
        area.addEventListener('input', clearMsg);
        area.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); doValidate(); } });
        document.body.appendChild(mask);
        area.focus();
    }

    // 结构校验已抽到 lib/validateSpec.js（Import 与 Submit 共用同一套规则）

    // ===== 打开：本地 =====
    _openLocalDialog() {
        // 列表提供一个“可重入”的工厂：删除一项后弹窗内容会重新拉取，
        // 不需要手工拼接刷新。
        const provider = () => SpecStoreList().map(x => ({
            label: x.name || x.id,
            sub: `${x.layerCount} layers · ${x.id}`,
            onPick: () => {
                const spec = readLocalSpec(x.id);
                if (spec) { specStore.loadSpec(spec); this._toast('Opened: ' + (spec.meta.name || x.id)); }
                else alert('Read failed');
            },
            onDelete: () => {
                const shown = x.name || x.id;
                if (!confirm('Delete local component "' + shown + '"?\nThis removes it from localStorage and cannot be undone.')) return false;
                try { localStorage.removeItem(LOCAL_PREFIX + x.id); } catch (e) { /* ignore */ }
                this._toast('Deleted: ' + shown);
                return true;
            }
        }));
        if (!provider().length) { alert('No locally saved components'); return; }
        this._pickDialog('Open local component', provider);
    }

    // ===== 打开：公共库（approved 组件） =====
    async _openLibraryDialog() {
        this._toast('Loading public components…');
        let rows = [];
        try {
            const res = await fetch(`${apiBase()}?action=list&kind=component&limit=200`);
            const ct = res.headers.get('content-type') || '';
            if (!ct.includes('application/json')) { alert('Backend unavailable'); return; }
            const result = await res.json();
            rows = (result.success && result.data) ? result.data : [];
        } catch (e) { alert('Load failed: ' + e.message); return; }

        if (!rows.length) { alert('No published components in the public library'); return; }
        this._libraryDialog(rows);
    }

    /**
     * 公共库卡片弹窗：1:1 概览图 + 名称/作者/分类，顶部搜索条本地过滤
     * （名称/作者/分类/描述，与主编辑器 Shared 面板的服务端搜索同字段）。
     */
    _libraryDialog(rows) {
        const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
        // thumbnail 来自用户/后台提交：只放行 https 与 base64 图片，防 javascript: 注入。
        const safeThumb = (u) => {
            const v = String(u || '').trim();
            return /^(https:\/\/[^\s"'<>\\]+$|data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$)/i.test(v) ? v : '';
        };
        const cardHtml = (r) => {
            const thumb = safeThumb(r.thumbnail);
            const name = r.title || ('#' + r.id);
            const initial = String(name).trim().charAt(0).toUpperCase() || 'C';
            return `
                <div class="sp-lib-card" data-db-id="${esc(r.id)}" title="Import to canvas">
                    <div class="sp-lib-media">${thumb ? `<img src="${esc(thumb)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<span class="sp-lib-fallback">${esc(initial)}</span>`}</div>
                    <div class="sp-lib-name">${esc(name)}</div>
                    <div class="sp-lib-sub">${r.author ? '👤 ' + esc(r.author) + ' · ' : '👤 — · '}#${esc(r.id)}${r.category ? ' · ' + esc(r.category) : ''}</div>
                </div>`;
        };
        const filter = (kw) => {
            const q = String(kw || '').trim().toLowerCase();
            const list = !q ? rows : rows.filter(r =>
                [r.title, r.author, r.category, r.description].some(v => String(v || '').toLowerCase().indexOf(q) >= 0));
            const grid = mask.querySelector('.sp-lib-grid');
            const cnt = mask.querySelector('.sp-lib-count');
            if (grid) grid.innerHTML = list.length ? list.map(cardHtml).join('') : '<div class="sp-empty">No matching components</div>';
            if (cnt) cnt.textContent = q ? `${list.length}/${rows.length}` : String(rows.length);
        };
        const mask = document.createElement('div');
        mask.className = 'sp-modal show';
        mask.innerHTML = `
            <div class="sp-modal-content sp-lib-modal">
                <div class="sp-modal-head"><h3>Public Library <span class="sp-lib-count">${rows.length}</span></h3><button class="sp-modal-x" data-close>&times;</button></div>
                <div class="sp-lib-search"><input type="search" class="sp-lib-kw" placeholder="Search name / author / category / description…"></div>
                <div class="sp-modal-body sp-lib-body"><div class="sp-lib-grid">${rows.map(cardHtml).join('')}</div></div>
                <div class="sp-modal-foot"><button class="sp-btn" data-close>Close</button></div>
            </div>`;
        let kwTimer = null;
        const kwInput = mask.querySelector('.sp-lib-kw');
        kwInput.addEventListener('input', () => { clearTimeout(kwTimer); kwTimer = setTimeout(() => filter(kwInput.value), 200); });
        mask.addEventListener('click', (e) => {
            if (e.target === mask || e.target.closest('[data-close]')) { mask.remove(); return; }
            const card = e.target.closest('.sp-lib-card');
            if (card) { const id = card.dataset.dbId; mask.remove(); this._importSharedRow(id); }
        });
        document.body.appendChild(mask);
        kwInput.focus();
    }

    // ===== 通用列表选择弹窗 =====
    /**
     * @param {string} title
     * @param {Array|(()=>Array)} itemsOrProvider 提供列表的数组或工厂函数（支持删除后自动重刷）
     *   每项：{ label, sub, onPick, onDelete? }
     */
    _pickDialog(title, itemsOrProvider) {
        const getItems = () => (typeof itemsOrProvider === 'function' ? itemsOrProvider() : itemsOrProvider) || [];
        const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
        const renderBody = () => {
            const items = getItems();
            if (!items.length) return '<div class="sp-empty">No entries</div>';
            return items.map((it, i) => `
                <div class="sp-pick" data-i="${i}">
                    <span class="sp-pick-label">${esc(it.label)}</span>
                    <span class="sp-pick-sub">${esc(it.sub)}</span>
                    ${it.onDelete ? `<button type="button" class="sp-pick-del" data-del="${i}" title="Delete from local">Delete</button>` : ''}
                </div>`).join('');
        };
        const mask = document.createElement('div');
        mask.className = 'sp-modal show';
        mask.innerHTML = `
            <div class="sp-modal-content sp-modal-list">
                <div class="sp-modal-head"><h3>${esc(title)}</h3><button class="sp-modal-x" data-close>&times;</button></div>
                <div class="sp-modal-body">${renderBody()}</div>
                <div class="sp-modal-foot"><button class="sp-btn" data-close>Close</button></div>
            </div>`;
        const close = () => mask.remove();
        const refresh = () => {
            const body = mask.querySelector('.sp-modal-body');
            if (!body) return;
            body.innerHTML = renderBody();
            if (!getItems().length) {
                const foot = mask.querySelector('.sp-modal-foot');
                if (foot) foot.innerHTML = '<div class="sp-empty" style="margin-bottom:8px;">All entries deleted</div><button class="sp-btn" data-close>Close</button>';
            }
        };
        mask.addEventListener('click', (e) => {
            if (e.target === mask || e.target.closest('[data-close]')) { close(); return; }
            const delBtn = e.target.closest('.sp-pick-del');
            if (delBtn) {
                e.stopPropagation();
                const idx = parseInt(delBtn.dataset.del, 10);
                const it = getItems()[idx];
                if (it && it.onDelete) { const removed = it.onDelete(); if (removed !== false) refresh(); }
                return;
            }
            const row = e.target.closest('.sp-pick');
            if (row) { const it = getItems()[parseInt(row.dataset.i, 10)]; close(); if (it && it.onPick) it.onPick(); }
        });
        document.body.appendChild(mask);
    }

    // ===== 快捷键 =====
    _bindShortcuts() {
        document.addEventListener('keydown', (e) => {
            const tag = (e.target && e.target.tagName) || '';
            if (/INPUT|TEXTAREA|SELECT/.test(tag)) return;
            const mod = e.ctrlKey || e.metaKey;
            if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? specStore.redo() : specStore.undo(); }
            else if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); this._saveLocal(); }
            else if (mod && e.key.toLowerCase() === 'c') { e.preventDefault(); this._copy(); }
            else if (mod && e.key.toLowerCase() === 'v') { e.preventDefault(); this._paste(); }
            else if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); this._copy(); this._paste(); }
            else if (mod && e.shiftKey && e.key.toLowerCase() === 'l') { e.preventDefault(); themeManager.toggle(); }
            else if (e.key === 'Delete') { this._deleteSel(); }
        });
    }

    /**
     * 缓存混版自检。import 上的 ?v= 只是绕开缓存，绕不开已落盘的旧副本：旧副本会按旧 URL 再拉一套模块，
     * 页面里就同时存在两份单例（画布被初始化的是 A，某些面板引用的是 B），表现为「点了没反应」的静默故障。
     * 宁可把话说破：碰到就挂横幅让用户强刷，不要让用户怀疑自己的操作。
     */
    _checkStaleGraph() {
        if (!window.__spDup) return;
        console.error('[Studio] duplicate module instances detected — stale cached JS, hard refresh required');
        const bar = document.createElement('div');
        bar.className = 'sp-stale';
        bar.textContent = 'Stale cached scripts detected: this page loaded two copies of some modules, so panels may drive a canvas you cannot see. Please hard-refresh (Ctrl+Shift+R).';
        document.body.insertBefore(bar, document.querySelector('.sp-layout'));
    }

    _toast(msg) {
        let t = $('#spToast');
        if (!t) { t = document.createElement('div'); t.id = 'spToast'; t.className = 'sp-toast'; document.body.appendChild(t); }
        t.textContent = msg;
        t.classList.add('show');
        clearTimeout(this._toastTimer);
        this._toastTimer = setTimeout(() => t.classList.remove('show'), 1800);
    }
}

// 从本地存储读取组件 Spec（与 loader/SpecStore 共用 LOCAL_PREFIX）
function readLocalSpec(id) {
    try { return JSON.parse(localStorage.getItem(LOCAL_PREFIX + id)); } catch (e) { return null; }
}

// SpecStore 的本地列表（静态方法在实例上不可直接取，这里用 import 的类）
function SpecStoreList() {
    try {
        const out = [];
        const PFX = 'studio_comp_';
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(PFX)) {
                try {
                    const spec = JSON.parse(localStorage.getItem(key));
                    out.push({ id: spec.meta && spec.meta.id ? spec.meta.id : key.slice(PFX.length), name: spec.meta && spec.meta.name, layerCount: (spec.layers || []).length });
                } catch (e) { /* skip */ }
            }
        }
        return out;
    } catch (e) { return []; }
}

// registry 引用留作扩展（避免 tree-shaking 误删，同时便于将来在页内即时预览库组件）
void registry;

export const studioApp = new StudioApp();

if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => studioApp.init());
}
