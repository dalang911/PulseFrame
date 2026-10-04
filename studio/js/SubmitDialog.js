/**
 * studio/SubmitDialog.js - 提交组件到公共库（走后端审核流程）
 *
 * 采集 名称/分类/作者/描述 → 更新 spec.meta → POST api.php?action=submit（kind=component，
 * json_content=组件 Spec）。复用 TemplateShop 的提交/审核契约：提交后 status=pending，
 * 管理员审核通过(approved)后由 loader 的 list&kind=component 拉取发布。
 *
 * 弹窗里带一段审核/授权说明（.sp-terms）+ 同意勾选（#sdAgree）：公开就要接受管理员改稿、可能被拒，
 * 且发布后任何人可取用与二创。没勾选时提交按钮置灰，不想公开的用户改走 Save Local / Export JSON。
 */

import { specStore } from './SpecStore.js';
import { apiBase } from './lib/appConfig.js';
import { validateSpec } from './lib/validateSpec.js';
import { findIdConflict, nextCandidateId } from './lib/idGuard.js';

// 组件分类对齐主编辑器 WidgetPicker 的分类集合
const CATEGORIES = [
    { value: 'time', label: 'Time' },
    { value: 'distance', label: 'Distance' },
    { value: 'attr', label: 'Attribute' },
    { value: 'chart', label: 'Chart' },
    { value: 'text', label: 'Text' },
    { value: 'cycling', label: 'Cycling' },
    { value: 'theme', label: 'Theme' }
];

class SubmitDialog {
    constructor() { this._modal = null; this._posting = false; }

    _ensure() {
        if (this._modal) return this._modal;
        const m = document.createElement('div');
        m.className = 'sp-modal';
        m.innerHTML = `
            <div class="sp-modal-content">
                <div class="sp-modal-head">
                    <h3>Submit component to public library</h3>
                    <button class="sp-modal-x" data-close>&times;</button>
                </div>
                <div class="sp-modal-body">
                    <label class="sp-row"><span>Name</span><input type="text" id="sdName"></label>
                    <label class="sp-row"><span>Category</span><select id="sdCategory">${CATEGORIES.map(c => `<option value="${c.value}">${c.label}</option>`).join('')}</select></label>
                    <label class="sp-row"><span>Author</span><input type="text" id="sdAuthor" placeholder="Your nickname"></label>
                    <label class="sp-row sp-row-col"><span>Description</span><textarea id="sdDesc" rows="3" placeholder="Optional"></textarea></label>
                    <div class="sp-terms">
                        <b>Before you submit</b>
                        <ul>
                            <li>Every submission is read by an admin. It may be adjusted with good intent (layout, colours, bindings) to fit the library — and it may not be published at all, depending on its quality.</li>
                            <li>A published dashboard belongs to the public library: you give up exclusive rights to it and to the data layout it binds, anyone can use it and re-edit it into new components.</li>
                            <li>Would rather keep it private? Don't upload it — <b>Save Local</b> (stays in this browser) or <b>Export JSON</b> (a file only you hold) are the better choice.</li>
                        </ul>
                    </div>
                    <label class="sp-agree"><input type="checkbox" id="sdAgree"><span>I agree: it may be edited by admins, may be rejected, and once published anyone may use and remix it.</span></label>
                    <div class="sp-modal-note">After submitting, an admin must approve it before it appears in the public component library.</div>
                    <div class="sp-modal-note" id="sdHint" hidden></div>
                </div>
                <div class="sp-modal-foot">
                    <button class="sp-btn" data-close>Cancel</button>
                    <button class="sp-btn sp-btn-primary" id="sdSubmit">Submit for review</button>
                </div>
            </div>`;
        document.body.appendChild(m);
        m.addEventListener('click', (e) => { if (e.target === m || e.target.closest('[data-close]')) this._close(); });
        // 版权/审核说明必须看过：没勾选就把提交按钮锁住，比只放一行小字管用
        m.querySelector('#sdAgree').addEventListener('change', () => this._syncSubmit());
        m.querySelector('#sdSubmit').addEventListener('click', () => this._submit());
        this._modal = m;
        return m;
    }

    /** 提交按钮可用态：勾了同意才亮（_posting 期间额外置灰） */
    _syncSubmit() {
        const m = this._modal;
        if (!m) return;
        m.querySelector('#sdSubmit').disabled = this._posting || !m.querySelector('#sdAgree').checked;
    }

    open() {
        const m = this._ensure();
        const meta = specStore.getSpec().meta;
        m.querySelector('#sdName').value = meta.name || '';
        m.querySelector('#sdCategory').value = CATEGORIES.some(c => c.value === meta.category) ? meta.category : 'distance';
        m.querySelector('#sdAuthor').value = localStorage.getItem('studio_author') || '';
        m.querySelector('#sdDesc').value = '';
        m.querySelector('#sdAgree').checked = false;   // 同意不做记忆：每次提交都要重新看过
        this._syncSubmit();
        this._hint('');
        m.classList.add('show');
    }

    _close() { if (this._modal) this._modal.classList.remove('show'); }

    /** 把提示写进弹窗自己的一行（不覆盖固定说明），用 textContent 避免注入 */
    _hint(msg) {
        const el = this._modal && this._modal.querySelector('#sdHint');
        if (!el) return;
        if (!msg) { el.hidden = true; el.textContent = ''; return; }
        el.hidden = false;
        el.textContent = msg;
    }

    /** 把被占用的 id 往后推（my_comp → my_comp_2 → …），直到本地也不再占用 */
    _bumpPastTaken(id) {
        let cand = nextCandidateId(id);
        for (let i = 0; i < 50 && findIdConflict(cand, null); i++) cand = nextCandidateId(cand);
        return cand;
    }

    /** POST 一次，返回解析后的 JSON（失败抛异常交给调用方统一提示） */
    async _post(payload) {
        const res = await fetch(`${apiBase()}?action=submit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const ct = res.headers.get('content-type') || '';
        if (!ct.includes('application/json')) throw new Error('Backend unavailable (non-JSON response)');
        return await res.json();
    }

    async _submit() {
        const m = this._modal;
        // 按钮已经拦一道，这里再兜一下（比如用户勾完后用脚本/回车触发提交）：没同意就不上传
        if (!m.querySelector('#sdAgree').checked) {
            this._hint('Please tick the agreement first — publishing hands the component to the public library.');
            return;
        }
        const name = m.querySelector('#sdName').value.trim();
        const category = m.querySelector('#sdCategory').value;
        const author = m.querySelector('#sdAuthor').value.trim() || 'Anonymous';
        const description = m.querySelector('#sdDesc').value.trim();
        if (!name) { alert('Please enter a component name'); return; }
        this._hint('');

        // 回填 meta（保持同一 id，便于本地覆盖保存）
        specStore.setMeta({ name, category }, true);
        localStorage.setItem('studio_author', author);

        // 结构校验：与 Open JSON 同一套规则。放过一个 uid 重复 / 结构非法的组件，
        // 只是白占审核队列——装上去就是崩的。
        const spec = specStore.getSpec();
        const { errors } = validateSpec(spec);
        if (errors.length) {
            this._hint('Fix before submitting: ' + errors.slice(0, 3).join(' / '));
            alert('Please fix these issues first:\n\n' + errors.slice(0, 8).join('\n') + (errors.length > 8 ? `\n(+${errors.length - 8} more)` : ''));
            return;
        }
        if (!String(spec.meta.id || '').trim()) {
            this._hint('Component ID is empty — set the ID field in the top bar first.');
            alert('Component ID is empty — the library registers components by meta.id, please set it first');
            return;
        }
        // 进库的东西要能装得上、能驱动：空图层 = 一张透明盒子；非法字符的 id 会被服务端
        // 剔除后再查重，容易让人误以为“凭空撞号”，两者都在上传前拦住。
        if (!Array.isArray(spec.layers) || !spec.layers.length) {
            this._hint('The component has no layers — add something to the canvas before submitting.');
            alert('Nothing to publish: the canvas has no layers yet');
            return;
        }
        if (!/^[A-Za-z0-9_]+$/.test(String(spec.meta.id))) {
            this._hint('Component ID may only contain letters, digits and "_".');
            alert('Component ID "' + spec.meta.id + '" is invalid — use only A-Z a-z 0-9 and _');
            return;
        }

        const payload = {
            title: name,
            category,
            author,
            description,
            kind: 'component',
            json_content: specStore.exportString()
        };

        const btn = m.querySelector('#sdSubmit');
        this._posting = true; btn.disabled = true; btn.textContent = 'Submitting…';
        try {
            let result = await this._post(payload);
            // 409：库里已有同一组件 id 的存活记录。别人的提交本地看不见，只能由服务器判定；
            // 确认后用后缀避开重号，否则把原因留在弹窗里让用户自己改 ID。
            if (result && result.code === 'duplicate_spec_id') {
                const cur = String(specStore.getSpec().meta.id || '');
                const cand = this._bumpPastTaken(cur);
                if (confirm(`Component ID "${cur}" is already used in the library:\n\n${result.error || ''}\n\nResubmit as "${cand}"?`)) {
                    specStore.setMeta({ id: cand }, true);
                    this._hint(`Resubmitting as "${cand}"…`);
                    result = await this._post({ ...payload, json_content: specStore.exportString() });
                    if (result.success) { alert(`Submitted as "${cand}", waiting for admin review!`); this._close(); return; }
                } else {
                    this._hint(`ID "${cur}" is taken — change the ID field in the top bar, or ask an admin to remove the old row.`);
                }
            }
            if (result.success) {
                alert('Submitted, waiting for admin review!');
                this._close();
            } else {
                this._hint(result.error ? `Submission failed: ${result.error}` : '');
                alert('Submission failed: ' + (result.error || 'unknown error'));
            }
        } catch (e) {
            alert('Submission failed: ' + e.message);
        } finally {
            this._posting = false;
            btn.textContent = 'Submit for review';
            this._syncSubmit();   // 回到“没勾同意就置灰”的门控状态
        }
    }
}

export const submitDialog = new SubmitDialog();
export { CATEGORIES };
