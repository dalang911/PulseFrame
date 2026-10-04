/**
 * lib/validateSpec.js - 组件 Spec 结构校验（纯函数，无副作用、无依赖）
 *
 * 被两处复用，保证"导入能过 = 提交能过"：
 *   - StudioApp 的 Open JSON 弹窗（errors 阻断导入）
 *   - SubmitDialog 提交前（errors 阻断上传，避免把注定注册失败的 spec 送进审核队列）
 * 规则与 doc/CHECKLIST.md 一致；只校验结构，id 是否撞车交给 lib/idGuard.js。
 * 唯一的外部依赖：SVG 图标的体积上限与字节算法复用 runtime/spec.js，避免两处规则飘移。
 */

import { SVG_MAX_BYTES, svgByteLength } from '../runtime/spec.js';

const TYPES = ['rect', 'ellipse', 'arc', 'line', 'text', 'svg', 'image', 'group', 'path', 'polygon'];
const MODES = ['text', 'size', 'angle', 'color', 'opacity', 'visible'];
const BINDABLE = {
    rect: ['x', 'y', 'width', 'height', 'strokeWidth', 'cornerRadius', 'fill', 'stroke', 'rotation', 'opacity', 'visible'],
    ellipse: ['x', 'y', 'width', 'height', 'strokeWidth', 'fill', 'stroke', 'rotation', 'opacity', 'visible'],
    arc: ['endAngle', 'startAngle', 'stroke', 'strokeWidth', 'innerRadius', 'opacity'],
    line: ['x', 'y', 'width', 'stroke', 'strokeWidth', 'rotation', 'opacity', 'visible'],
    text: ['text', 'fill', 'x', 'y', 'fontSize', 'opacity', 'visible'],
    image: ['x', 'y', 'opacity', 'visible'],
    svg: ['x', 'y', 'opacity', 'visible'],
    group: ['opacity'],
    path: [], polygon: []
};

/**
 * 结构校验：返回 { errors, warnings }。
 * errors 阻断导入/提交；warnings 允许但提示。
 * @param {Object} spec
 * @returns {{errors: string[], warnings: string[]}}
 */
export function validateSpec(spec) {
    const errors = [], warnings = [];
    if (!spec || typeof spec !== 'object' || Array.isArray(spec)) { errors.push('Top level must be a JSON object'); return { errors, warnings }; }
    if (!spec.meta || typeof spec.meta !== 'object') errors.push('Missing "meta" object (required to import)');
    else {
        if (spec.meta.id == null || String(spec.meta.id).trim() === '') warnings.push('meta.id is empty — it will not register/save until you set one');
        else if (!/^[A-Za-z0-9_]+$/.test(String(spec.meta.id))) warnings.push('meta.id should only contain [A-Za-z0-9_] (Studio strips other characters)');
        if (!spec.meta.name) warnings.push('meta.name is empty');
    }
    if (!Array.isArray(spec.layers)) errors.push('"layers" must be an array (required to import)');
    else {
        if (!spec.layers.length) warnings.push('"layers" is empty — the component has nothing to render');
        const uids = new Set();
        const walk = (arr, path) => arr.forEach((l, i) => {
            const at = `${path}[${i}]`;
            if (!l || typeof l !== 'object') { errors.push(`${at}: not an object`); return; }
            const label = l.uid ? `${at} (uid=${l.uid})` : at;
            if (!l.uid || String(l.uid).trim() === '') errors.push(`${at}: missing "uid"`);
            else if (uids.has(l.uid)) errors.push(`duplicate uid: "${l.uid}"`);
            else uids.add(l.uid);
            if (!TYPES.includes(l.type)) errors.push(`${label}: invalid "type" (${l.type})`);
            if (!l.props || typeof l.props !== 'object') errors.push(`${label}: missing "props" object`);
            if (l.type === 'arc' && l.props && l.props.closed === undefined) warnings.push(`${label}: arc without "closed:false" (Studio auto-adds it)`);
            if (l.type === 'svg') {
                const code = l.props ? String(l.props.svg || '') : '';
                if (!code.trim()) warnings.push(`${label}: svg layer has no SVG code (nothing to render)`);
                else if (svgByteLength(code) > SVG_MAX_BYTES) errors.push(`${label}: svg code is ${svgByteLength(code)} bytes, limit is ${SVG_MAX_BYTES} bytes (10 KB)`);
            }
            if (l.bindings != null && typeof l.bindings === 'object') {
                const bd = BINDABLE[l.type] || [];
                Object.keys(l.bindings).forEach((key) => {
                    const b = l.bindings[key];
                    if (!bd.includes(key)) errors.push(`${label}: property "${key}" is not bindable for type "${l.type}"`);
                    if (!b || !MODES.includes(b.mode)) errors.push(`${label}.${key}: invalid binding mode (${b && b.mode})`);
                    else if (b.mode === 'angle' && key === 'rotation' && (b.from == null || b.to == null)) errors.push(`${label}.${key}: "angle" on rotation must set "from" and "to"`);
                });
            }
            if (l.type === 'group' && Array.isArray(l.children)) walk(l.children, `${at}.children`);
        });
        walk(spec.layers, 'layers');
    }
    return { errors, warnings };
}
