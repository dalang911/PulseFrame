/**
 * studio/SpecStore.js - 设计器状态中枢（唯一真源）
 *
 * 负责：当前 spec、选中图层、undo/redo 历史、图层增删改与层叠、绑定编辑、本地持久化与导入导出。
 * 各面板/画布订阅其事件（change / select），实现单向数据流：
 *   用户操作 → SpecStore 改 spec + emit → StudioCanvas/面板重渲染。
 */

import { createEmptySpec, makeLayer } from './runtime/spec.js?v=20';
import { LOCAL_PREFIX } from './runtime/loader.js?v=20';

const clone = (o) => JSON.parse(JSON.stringify(o));

class SpecStore {
    constructor() {
        this.spec = createEmptySpec();
        this.selectedUid = null;
        this.selectedUids = [];   // 多选时的全部 uid（length>=2 表示处于多选状态）
        this._undo = [];
        this._redo = [];
        this._clipboard = [];     // 内存剪贴板：[{ snapshot, parentUid }]（关页面即失）
        this._pasteSeq = 0;       // 本次复制后已粘贴次数，用于逐次累加固定偏移
        this._listeners = { change: [], select: [], dirty: [] };
    }

    // ===== 极简事件 =====
    on(evt, cb) { (this._listeners[evt] || (this._listeners[evt] = [])).push(cb); return () => this.off(evt, cb); }
    off(evt, cb) { if (this._listeners[evt]) this._listeners[evt] = this._listeners[evt].filter(f => f !== cb); }
    emit(evt, payload) { (this._listeners[evt] || []).forEach(cb => { try { cb(payload); } catch (e) { console.error('[SpecStore] listener error:', e); } }); }

    getSpec() { return this.spec; }

    // ===== 生命周期 =====
    newComponent(meta = {}) {
        this.spec = createEmptySpec(meta);
        this.selectedUid = null;
        this.selectedUids = [];
        this._undo = []; this._redo = [];
        this.emit('change', { reason: 'new' });
        this.emit('select', null);
    }

    loadSpec(spec) {
        this.spec = clone(spec);
        this.selectedUid = null;
        this.selectedUids = [];
        this._undo = []; this._redo = [];
        this.emit('change', { reason: 'load' });
        this.emit('select', null);
    }

    // ===== 历史 =====
    commit(label = '') {
        this._undo.push({ label, snapshot: clone(this.spec) });
        if (this._undo.length > 60) this._undo.shift();
        this._redo = [];
        this.emit('change', { reason: 'commit', label });
    }
    undo() {
        if (!this._undo.length) return false;
        this._redo.push({ snapshot: clone(this.spec) });
        const last = this._undo.pop();
        this.spec = last.snapshot;
        this._afterHistory();
        return true;
    }
    redo() {
        if (!this._redo.length) return false;
        this._undo.push({ snapshot: clone(this.spec) });
        const nxt = this._redo.pop();
        this.spec = nxt.snapshot;
        this._afterHistory();
        return true;
    }
    _afterHistory() {
        // 选中项可能已被删除；同步收敛 selectedUids 与 selectedUid
        this.selectedUids = (this.selectedUids || []).filter(u => this.findLayer(u));
        if (this.selectedUids.length === 1) this.selectedUid = this.selectedUids[0];
        else if (this.selectedUids.length >= 2) this.selectedUid = null;
        else if (this.selectedUid && !this.findLayer(this.selectedUid)) this.selectedUid = null;
        this.emit('change', { reason: 'history' });
        this.emit('select', this.selectedUid);
    }

    // ===== 图层查找（递归）=====
    findLayer(uid, arr = this.spec.layers, parent = null) {
        for (let i = 0; i < arr.length; i++) {
            if (arr[i].uid === uid) return { layer: arr[i], arr, index: i, parent };
            if (arr[i].type === 'group' && Array.isArray(arr[i].children)) {
                const found = this.findLayer(uid, arr[i].children, arr[i]);
                if (found) return found;
            }
        }
        return null;
    }

    getSelected() {
        const f = this.selectedUid ? this.findLayer(this.selectedUid) : null;
        return f ? f.layer : null;
    }

    /** 当前全部选中图层对象（含多选），过滤已不存在的 uid */
    getSelectedLayers() {
        const uids = (this.selectedUids && this.selectedUids.length)
            ? this.selectedUids
            : (this.selectedUid ? [this.selectedUid] : []);
        return uids.map(u => { const f = this.findLayer(u); return f ? f.layer : null; }).filter(Boolean);
    }

    setSelected(uid) {
        this.setSelection(uid ? [uid] : []);
    }

    /** 设置多选集合；单一时回填 selectedUid，多个时 selectedUid 置空 */
    setSelection(uids) {
        uids = (uids || []).filter(Boolean);
        const cur = this.selectedUids || [];
        const sameSelection = uids.length === cur.length && uids.every((u, i) => u === cur[i]);
        const sameSingle = uids.length === 1 ? this.selectedUid === uids[0] : this.selectedUid === null;
        if (sameSelection && sameSingle) return;
        this.selectedUids = uids;
        this.selectedUid = uids.length === 1 ? uids[0] : null;
        this.emit('select', this.selectedUid);
    }

    /** 批量改属性：items = [{uid, patch}]，一次提交进历史 */
    batchPatch(items, label = 'batch') {
        let changed = false;
        (items || []).forEach(({ uid, patch }) => {
            const f = this.findLayer(uid);
            if (f) { Object.assign(f.layer.props, patch); changed = true; }
        });
        if (changed) this.commit(label);
        return changed;
    }

    // ===== 图层操作 =====
    addLayer(type, overrides = {}, targetArr = null, index = -1) {
        const layer = makeLayer(type, overrides);
        const arr = targetArr || this.spec.layers;
        if (index >= 0 && index <= arr.length) arr.splice(index, 0, layer);
        else arr.push(layer);
        this.commit('add ' + type);
        this.setSelected(layer.uid);
        return layer;
    }

    addLayers(layers, targetArr = null) {
        // 预封装块：一次性塞入多个已构建好的图层对象
        const arr = targetArr || this.spec.layers;
        layers.forEach(l => arr.push(l));
        this.commit('add block');
        if (layers.length) this.setSelected(layers[layers.length - 1].uid);
    }

    removeLayer(uid) {
        const f = this.findLayer(uid);
        if (!f) return;
        f.arr.splice(f.index, 1);
        this.selectedUids = (this.selectedUids || []).filter(u => u !== uid);
        if (this.selectedUid === uid) {
            this.selectedUid = this.selectedUids.length === 1 ? this.selectedUids[0] : null;
        }
        this.commit('remove');
        this.emit('select', this.selectedUid);
    }

    duplicateLayer(uid) {
        const f = this.findLayer(uid);
        if (!f) return;
        const copy = clone(f.layer);
        this._reassignUids(copy);
        f.arr.splice(f.index + 1, 0, copy);
        this.commit('duplicate');
        this.setSelected(copy.uid);
    }

    _reassignUids(layer) {
        layer.uid = makeLayer(layer.type).uid;
        if (Array.isArray(layer.children)) layer.children.forEach(c => this._reassignUids(c));
    }

    // ===== 复制 / 粘贴（内存剪贴板）=====
    /** 深拷贝当前选中的 1..N 个图层入剪贴板；记住各自父层以便粘回同组。返回数量 */
    copySelection() {
        const layers = this.getSelectedLayers();
        if (!layers.length) return 0;
        this._clipboard = layers.map(l => {
            const f = this.findLayer(l.uid);
            return { snapshot: clone(l), parentUid: f && f.parent ? f.parent.uid : null };
        });
        this._pasteSeq = 0;
        return layers.length;
    }

    /** 粘贴：重新克隆剪贴板（可连续多次）、重发 uid、固定偏移、粘回同父层、自动选中。返回新 uid */
    paste() {
        if (!this._clipboard || !this._clipboard.length) return [];
        this._pasteSeq += 1;
        const d = 20 * this._pasteSeq;   // 每次粘贴再远 20px，避免叠成一坠
        const newUids = [];
        this._clipboard.forEach(item => {
            const copy = clone(item.snapshot);
            this._reassignUids(copy);        // 递归新随机 uid（含子层）
            this._offsetLayer(copy, d);
            this._pasteTargetArr(item.parentUid).push(copy);
            newUids.push(copy.uid);
        });
        this.commit('paste');
        this.setSelection(newUids);
        return newUids;
    }

    _pasteTargetArr(parentUid) {
        if (parentUid) {
            const f = this.findLayer(parentUid);
            if (f && f.layer.type === 'group') {
                if (!Array.isArray(f.layer.children)) f.layer.children = [];
                return f.layer.children;
            }
        }
        return this.spec.layers;
    }

    _offsetLayer(layer, d) {
        if (layer.props) {
            if (typeof layer.props.x === 'number') layer.props.x += d;
            if (typeof layer.props.y === 'number') layer.props.y += d;
        }
    }

    /** 批量删除当前选中（含多选）；一次提交。返回删除数 */
    deleteSelection() {
        const uids = (this.selectedUids && this.selectedUids.length)
            ? this.selectedUids.slice()
            : (this.selectedUid ? [this.selectedUid] : []);
        if (!uids.length) return 0;
        uids.forEach(u => { const f = this.findLayer(u); if (f) f.arr.splice(f.index, 1); });
        this.selectedUids = [];
        this.selectedUid = null;
        this.commit('delete multi');
        this.emit('select', null);
        return uids.length;
    }

    updateProps(uid, patch, { commit = true } = {}) {
        const f = this.findLayer(uid);
        if (!f) return;
        Object.assign(f.layer.props, patch);
        if (commit) this.commit('props');
        else this.emit('change', { reason: 'props-live' });
    }

    rename(uid, name) {
        const f = this.findLayer(uid);
        if (!f) return;
        f.layer.name = name || f.layer.type;
        this.commit('rename');
    }

    toggleVisible(uid) {
        const f = this.findLayer(uid);
        if (!f) return;
        f.layer.visible = f.layer.visible === false;
        this.commit('visibility');
    }

    // 层叠：在同一父数组内上移/下移/置顶/置底（index 越大越靠上层）
    moveLayer(uid, action) {
        const f = this.findLayer(uid);
        if (!f) return;
        const { arr, index } = f;
        let to = index;
        if (action === 'up') to = Math.min(arr.length - 1, index + 1);
        else if (action === 'down') to = Math.max(0, index - 1);
        else if (action === 'top') to = arr.length - 1;
        else if (action === 'bottom') to = 0;
        if (to === index) return;
        const [item] = arr.splice(index, 1);
        arr.splice(to, 0, item);
        this.commit('reorder');
    }

    // 绑定
    setBinding(uid, prop, binding) {
        const f = this.findLayer(uid);
        if (!f) return;
        if (!f.layer.bindings) f.layer.bindings = {};
        if (binding === null) delete f.layer.bindings[prop];
        else f.layer.bindings[prop] = binding;
        this.commit('binding');
    }

    // 元信息
    setMeta(patch, doCommit = true) {
        Object.assign(this.spec.meta, patch);
        if (doCommit) this.commit('meta');
        else this.emit('change', { reason: 'meta-live' });
    }

    // ===== 持久化（与运行时 loader 共用 LOCAL_PREFIX，本地保存即主编辑器可见） =====
    saveLocal() {
        const id = this.spec.meta.id;
        localStorage.setItem(LOCAL_PREFIX + id, JSON.stringify(this.spec));
        return id;
    }
    static listLocal() {
        const out = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(LOCAL_PREFIX)) {
                try {
                    const spec = JSON.parse(localStorage.getItem(key));
                    out.push({ id: spec.meta?.id || key.slice(LOCAL_PREFIX.length), name: spec.meta?.name || '', layerCount: (spec.layers || []).length });
                } catch (e) { /* skip */ }
            }
        }
        return out;
    }
    static readLocal(id) {
        try { return JSON.parse(localStorage.getItem(LOCAL_PREFIX + id)); } catch (e) { return null; }
    }
    static deleteLocal(id) { localStorage.removeItem(LOCAL_PREFIX + id); }

    exportString() { return JSON.stringify(this.spec, null, 2); }
    importString(text) {
        const spec = JSON.parse(text);
        if (!spec.meta || !Array.isArray(spec.layers)) throw new Error('Invalid component JSON');
        this.loadSpec(spec);
    }
}

export const specStore = new SpecStore();

// 混版自检（StudioCanvas.js / StudioPreview.js 末尾各有一份）：?v= 只能绕缓存，绕不了已落盘的旧副本——
// 旧副本会按旧 URL 再拉一份模块，页面里就同时存在两套单例（一套被初始化、一套被某些面板引用），
// 故障还是静默的（典型表现：点播放只动帧号不动画面）。第二个实例进来就打标记，由 StudioApp 显式提醒强刷。
(window.__spSingles = window.__spSingles || {});
if (window.__spSingles.SpecStore) window.__spDup = true;
window.__spSingles.SpecStore = specStore;
