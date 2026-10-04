/**
 * lib/idGuard.js - 组件 ID（spec.meta.id）撞车防护
 *
 * meta.id 同时是三种主键，手改成已被占用的 id 会引发静默覆盖：
 *   1) localStorage 键 `studio_comp_{id}` —— 撞上就覆掉另一个本地组件（不可恢复的数据丢失）
 *   2) registry 注册键 —— 撞上后注册的会覆盖先注册的，库里两张卡片渲染成同一个东西
 *   3) 模板/工程引用组件的凭据 —— 老工程打开时会被换成别人的组件
 * 所以「改 ID / 保存本地 / 提交」三个出口统一走这里拦一次。
 *
 * 内置组件的 id 单独维护成 _reserved：studio 的 registry 里没有内置手写组件
 * （它们注册在前端自己的 registry 实例上），命中后 loader 会直接跳过，组件根本不出现。
 */

import { registry } from './registry.js?v=20';
import { LOCAL_PREFIX } from '../runtime/loader.js?v=20';

let _reserved = new Set();

/** 灌入内置组件 id（StudioApp 启动时从前端组件定义取一次；取不到时仅少了内置这一路检测） */
export function setReservedIds(ids) {
    _reserved = new Set((ids || []).map(String));
}

/** 浏览器本地已存的组件 id：键后缀 + 内容里的 meta.id 都算（两者可能不一致） */
export function listLocalIds() {
    const out = new Set();
    try {
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (!key || !key.startsWith(LOCAL_PREFIX)) continue;
            out.add(key.slice(LOCAL_PREFIX.length));
            try {
                const spec = JSON.parse(localStorage.getItem(key));
                if (spec && spec.meta && spec.meta.id) out.add(String(spec.meta.id));
            } catch (e) { /* 内容坏了，键后缀仍视为占用 */ }
        }
    } catch (e) { /* 隐私模式禁用存储：当作无冲突，交给服务器兜底 */ }
    return out;
}

/**
 * 这个 id 是否已被占用。
 * @param {string} id     待检查 id
 * @param {string} [selfId] 当前 spec 自己的 id —— 就地编辑自己不算冲突
 * @returns {{reason: 'builtin'|'local'|'registered', detail: string}|null}
 */
export function findIdConflict(id, selfId = null) {
    const v = String(id == null ? '' : id).trim();
    if (!v || (selfId && v === String(selfId))) return null;
    if (_reserved.has(v)) return { reason: 'builtin', detail: `"${v}" is a built-in component id — the loader would skip it` };
    if (listLocalIds().has(v)) return { reason: 'local', detail: `a local component "${v}" already exists — saving would overwrite it` };
    if (registry.has(v)) return { reason: 'registered', detail: `"${v}" is already registered in this session` };
    return null;
}

/** 一定前进一步：my_comp → my_comp_2 → my_comp_3（服务器占用本地查不到，靠它推进） */
export function nextCandidateId(id) {
    const raw = String(id == null ? '' : id).trim() || 'custom';
    const m = raw.match(/^(.*?)_(\d+)$/);
    const stem = m ? m[1] : raw;
    const n = m ? Number(m[2]) + 1 : 2;
    return `${stem}_${n}`;
}

/** 撞车时给一个可用 id：逐个后缀推进，直到本地三源都不占（最多 999 次） */
export function suggestUniqueId(id, selfId = null) {
    let cand = String(id == null ? '' : id).trim() || 'custom';
    for (let i = 0; i < 999 && findIdConflict(cand, selfId); i++) cand = nextCandidateId(cand);
    return cand;
}
