/**
 * visual/loader.js - 加载自定义（可视化）组件到 registry
 *
 * 来源：
 *   1) 本地：localStorage，键前缀 LOCAL_PREFIX，值为组件 Spec JSON（设计器"保存本地/发布到本地"）
 *   2) 远端：server/api.php?action=list&kind=component（管理员审核通过的公共组件），best-effort
 *
 * 设计器与主编辑器共用同一份注册来源，保证所见即所得。
 */

import { registry } from '../lib/registry.js?v=20';
import { eventBus } from '../lib/EventBus.js?v=20';
import { apiBase } from '../lib/appConfig.js?v=20';
import { registerVisualComponent } from './visualFactory.js?v=20';

export const LOCAL_PREFIX = 'studio_comp_';
export const REMOTE_EVENT = 'custom:components-loaded';

/** 解析并注册一个 spec JSON 字符串；成功返回 id（source: 'local' | 'remote'）*/
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
 * 拉取远端已发布组件并注册（异步；完成广播 REMOTE_EVENT 供面板刷新）。
 * 与主编辑器 js/components/visual/loader.js 行为对齐：
 *   - list 拉行，并行拉 detail，失败行自动跳过。
 *   - 同 id 已存在且为 local 时保留本地，不刷为 remote。
 *   - 将 DB 行信息挂到 def.store* 上（与主编辑器展示一致）。
 */
export async function loadRemoteComponents() {
    try {
        const res = await fetch(`${apiBase()}?action=list&kind=component`);
        const ct = res.headers.get('content-type') || '';
        if (!ct.includes('application/json')) return [];
        const result = await res.json();
        if (!result.success) return [];
        const rows = (result.data || []);

        const detailed = await Promise.all(rows.map(async (row) => {
            if (!row || !row.id) return null;
            const d = await fetch(`${apiBase()}?action=detail&id=${encodeURIComponent(row.id)}`)
                .then(r => r.ok ? r.json() : null)
                .catch(() => null);
            const content = d && d.data && d.data.json_content;
            return content ? { row, content } : null;
        }));

        const ids = [];
        for (const item of detailed) {
            if (!item) continue;
            const { row, content } = item;
            let spec;
            try { spec = JSON.parse(content); } catch (e) { console.warn('[loader] bad json_content for row', row.id, e); continue; }
            if (!spec || !spec.meta || !spec.meta.id) continue;

            const existing = registry.get(spec.meta.id);
            if (existing && existing.isVisual && existing.source === 'local') {
                console.info(`[loader] keep local copy of "${spec.meta.id}" (remote row #${row.id} “${row.title}” shares the same spec id)`);
                continue;
            }

            const id = registerSpec(spec, 'remote');
            if (!id) continue;
            const def = registry.get(id);
            if (def) {
                def.storeId = row.id;
                def.storeTitle = row.title || '';
                def.storeAuthor = row.author || '';
                def.storeCategory = row.category || '';
                def.storeDescription = row.description || '';
                def.storeThumbnail = row.thumbnail || '';
                def.storeCreatedAt = row.created_at || '';
            }
            ids.push(id);
        }
        if (ids.length) eventBus.emit(REMOTE_EVENT, ids);
        return ids;
    } catch (e) {
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
