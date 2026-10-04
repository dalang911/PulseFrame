/**
 * visual/loader.js - 加载自定义（可视化）组件到 registry
 *
 * 来源：
 *   1) 本地：localStorage，键前缀 LOCAL_PREFIX，值为组件 Spec JSON（设计器"保存本地/发布到本地"）
 *   2) 远端：server/api.php?action=list&kind=component（管理员审核通过的公共组件），best-effort
 *
 * 设计器与主编辑器共用同一份注册来源，保证所见即所得。
 */

import { registry } from '../registry.js';
import { eventBus } from '../../core/EventBus.js';
import { apiBase } from '../../core/appConfig.js';
import { registerVisualComponent } from './visualFactory.js';

export const LOCAL_PREFIX = 'studio_comp_';
export const REMOTE_EVENT = 'custom:components-loaded';
export const REMOTE_PAGE = 10;

/** rowId → Promise<registryId|null>：同一行只拉一次 detail（启动全量与 Shared 面板分页共用） */
const rowRegistry = new Map();

/** 解析并注册一个 spec JSON 字符串；成功返回 id（source: 'local' | 'remote'，供前端本地/共享面板区分） */
function registerSpec(raw, source) {
    try {
        const spec = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (!spec || !spec.meta || !spec.meta.id) return null;
        // 已注册同 id 则跳过，避免重复覆盖手写组件
        if (registry.has(spec.meta.id) && !registry.get(spec.meta.id).isVisual) {
            console.warn(`[loader] skip "${spec.meta.id}" (conflicts with built-in)`);
            return null;
        }
        registerVisualComponent(spec);
        if (source) { const d = registry.get(spec.meta.id); if (d) d.source = source; }
        return spec.meta.id;
    } catch (e) {
        console.warn('[loader] failed to parse spec:', e);
        return null;
    }
}

/** 同步注册本地组件，返回注册到的 id 列表 */
export function loadLocalComponents() {
    const ids = [];
    try {
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(LOCAL_PREFIX)) {
                const id = registerSpec(localStorage.getItem(key), 'local');
                if (id) ids.push(id);
            }
        }
    } catch (e) {
        console.warn('[loader] loadLocal failed:', e);
    }
    return ids;
}

/**
 * 分页拉取已发布组件的列表元信息（不拉 detail，不注册）。
 * keyword 服务端匹配 名称/作者/描述（LIKE）。
 * @returns {Promise<{rows: Array, total: number}>}
 */
export async function fetchRemoteRows(limit = REMOTE_PAGE, offset = 0, keyword = '') {
    try {
        const kw = String(keyword || '').trim().slice(0, 64);
        const url = `${apiBase()}?action=list&kind=component&limit=${limit}&offset=${offset}`
            + (kw ? `&keyword=${encodeURIComponent(kw)}` : '');
        const res = await fetch(url);
        const ct = res.headers.get('content-type') || '';
        if (!ct.includes('application/json')) return { rows: [], total: 0 };
        const result = await res.json();
        if (!result.success) return { rows: [], total: 0 };
        return { rows: result.data || [], total: Number(result.total) || 0 };
    } catch (e) {
        return { rows: [], total: 0 };
    }
}

/** 真正拉 detail + 注册 + 挂 DB 行字段；失败返回 null，不抛异常 */
async function registerRow(rowId) {
    try {
        const res = await fetch(`${apiBase()}?action=detail&id=${encodeURIComponent(rowId)}`);
        if (!res.ok) return null;
        const d = await res.json();
        const row = d && d.data;
        const content = row && row.json_content;
        if (!content) return null;
        // 已注册且来源为本地 → 保留本地，不刷为 remote（同 id 多次保存的本地版本优先）。
        let spec;
        try { spec = typeof content === 'string' ? JSON.parse(content) : content; } catch (e) { return null; }
        if (spec && spec.meta && spec.meta.id) {
            const existing = registry.get(spec.meta.id);
            if (existing && existing.isVisual && existing.source === 'local') return null;
        }
        const id = registerSpec(content, 'remote');
        if (!id) return null;
        const def = registry.get(id);
        if (def) {
            def.storeId = String(row.id);
            def.storeTitle = row.title || '';
            def.storeAuthor = row.author || '';
            def.storeCategory = row.category || '';
            def.storeDescription = row.description || '';
            def.storeThumbnail = row.thumbnail || '';
            def.storeCreatedAt = row.created_at || '';
        }
        return id;
    } catch (e) {
        return null;
    }
}

/**
 * 确保某 DB 行已注册进 registry（带缓存；Shared 面板卡片点击时懒注册）。
 * @param {string|number} rowId DB 行 id
 * @returns {Promise<string|null>} registry id
 */
export function ensureRowRegistered(rowId) {
    const key = String(rowId);
    if (!rowRegistry.has(key)) {
        rowRegistry.set(key, registerRow(key));
    }
    return rowRegistry.get(key);
}

/**
 * 拉取远端已发布组件并注册（异步；完成广播 REMOTE_EVENT 供面板刷新）。
 *
 * 与主编辑器 Shared 面板、Studio 的 Open Library 保持“同一个数据模型”：
 *   - 展示字段（卡片名称 / 尾部 id / 作者）统一取 DB 行（list 接口直接返回），
 *     避免跟 spec.meta.name / spec.meta.id 不一致。
 *   - spec.meta.id 仍作为 registry / factory 的技术主键（画布上需要用它 lookup）。
 *   - 已存在同 id 的本地版本时，保留本地、不强行刷为 remote（否则 Local 面板会变空）。
 */
export async function loadRemoteComponents() {
    try {
        const res = await fetch(`${apiBase()}?action=list&kind=component`);
        const ct = res.headers.get('content-type') || '';
        if (!ct.includes('application/json')) return [];      // 后端未部署/非 JSON，静默跳过
        const result = await res.json();
        if (!result.success) return [];
        const rows = (result.data || []);

        // 并行拉 detail（list 不返 json_content），失败行自动跳过，不阻断整体；
        // 走 ensureRowRegistered 缓存，Shared 面板分页已注册的行不会重复拉。
        const ids = (await Promise.all(rows.map((row) =>
            row && row.id ? ensureRowRegistered(row.id) : Promise.resolve(null)))).filter(Boolean);
        if (ids.length) eventBus.emit(REMOTE_EVENT, ids);
        return ids;
    } catch (e) {
        // 网络/后端不可用时静默
        return [];
    }
}

/**
 * 加载全部自定义组件（本地同步 + 远端异步）
 * @returns {string[]} 本地即时注册到的 id 列表
 */
export function loadCustomComponents() {
    const ids = loadLocalComponents();
    loadRemoteComponents();     // 不 await：注册完成后广播事件刷新
    return ids;
}
