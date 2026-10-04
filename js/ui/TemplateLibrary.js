/**
 * TemplateLibrary.js - 本地模板「保存 / 读取」UI（主编辑器）
 *
 * 把 TemplateManager 已有的 localStorage 能力（saveLocal/loadLocal/listLocal/
 * deleteLocal + exportFile/importFile）接到界面上：
 *   - 保存模板：将当前画布序列化为具名模板存入 localStorage
 *   - 我的模板：弹窗列出本地模板，可 载入 / 删除，并可 导出/导入 JSON 文件
 *
 * 载入模板需要画布上有数据（addComponentToCanvas 依赖 trkpt），无数据时提示先上传。
 */

import { store } from '../core/Store.js';
import { templateManager } from './TemplateManager.js';

let _inited = false;

/**
 * 绑定顶部/侧栏的保存、读取按钮
 */
export function initTemplateLibrary() {
    if (_inited) return;
    const saveBtn = document.getElementById('tplSaveBtn');
    const loadBtn = document.getElementById('tplLoadBtn');
    if (saveBtn) saveBtn.addEventListener('click', openSaveDialog);
    if (loadBtn) loadBtn.addEventListener('click', openLibraryDialog);
    _inited = true;
}

/** 确保 layui.layer 就绪后回调 */
function withLayer(cb) {
    if (!window.layui) { console.warn('[TemplateLibrary] layui 未加载'); return; }
    if (layui.layer && layui.layer.open) cb(layui.layer);
    else layui.use(['layer'], () => cb(layui.layer));
}

/** 保存当前画布为具名模板 */
function openSaveDialog() {
    if (!templateManager.serialize()) { toast('Canvas not ready', 2); return; }
    const defName = 'Template ' + new Date().toLocaleString('en-US', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

    withLayer((layer) => {
        layer.open({
            type: 1,
            title: 'Save Template',
            area: ['360px', 'auto'],
            content: `<div style="padding:16px;">
                <input type="text" id="tplNameInput" class="layui-input" placeholder="Template name" value="${escapeAttr(defName)}">
                <div style="color:#999;font-size:12px;margin-top:8px;">Saves all components on the current canvas (position/size/style) as a local template.</div>
            </div>`,
            btn: ['Save', 'Cancel'],
            success: (layero, index) => {
                const input = (layero[0] || layero).querySelector('#tplNameInput');
                if (input) setTimeout(() => input.focus(), 50);
            },
            yes: (index, layero) => {
                const input = (layero[0] || layero).querySelector('#tplNameInput');
                const name = (input ? input.value : '').trim();
                if (!name) { toast('Please enter a template name', 2); return; }
                const key = templateManager.saveLocal(name);
                layer.close(index);
                toast(key ? 'Template saved: ' + name : 'Save failed', key ? 1 : 2);
            }
        });
    });
}

/** 打开「我的模板」列表弹窗 */
function openLibraryDialog() {
    withLayer((layer) => {
        layer.open({
            type: 1,
            title: 'My Templates',
            area: ['460px', '520px'],
            content: `<div style="padding:12px 16px;height:100%;box-sizing:border-box;display:flex;flex-direction:column;">
                <div id="tplList" style="flex:1;overflow:auto;"></div>
                <div style="display:flex;gap:8px;padding-top:10px;border-top:1px solid #eee;">
                    <button type="button" class="layui-btn layui-btn-sm layui-btn-primary" id="tplExport">Export JSON</button>
                    <button type="button" class="layui-btn layui-btn-sm layui-btn-primary" id="tplImport">Import JSON</button>
                    <input type="file" id="tplImportFile" accept=".json" style="display:none;">
                </div>
            </div>`,
            success: (layero) => {
                const root = layero[0] || layero;
                const listBox = root.querySelector('#tplList');

                const renderList = () => {
                    const list = templateManager.listLocal();
                    if (!list.length) {
                        listBox.innerHTML = '<div style="color:#999;text-align:center;padding:40px 0;">No saved templates yet</div>';
                        return;
                    }
                    listBox.innerHTML = list.map((t, i) => `
                        <div class="tpl-item" data-name="${escapeAttr(t.name)}" style="display:flex;align-items:center;gap:8px;padding:8px;border:1px solid #eee;border-radius:4px;margin-bottom:8px;">
                            <div style="flex:1;min-width:0;">
                                <div style="font-weight:bold;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(t.name)}</div>
                                <div style="color:#999;font-size:12px;">${t.componentCount} components${t.createdAt ? ' · ' + escapeHtml(String(t.createdAt).slice(0, 10)) : ''}</div>
                            </div>
                            <button type="button" class="layui-btn layui-btn-xs tpl-load">Load</button>
                            <button type="button" class="layui-btn layui-btn-xs layui-btn-danger tpl-del">Delete</button>
                        </div>
                    `).join('');
                };

                const hasData = () => {
                    const trkpt = store.get('trkptData');
                    return trkpt && trkpt.length > 0;
                };

                // 载入 / 删除（事件委托）
                listBox.addEventListener('click', (e) => {
                    const item = e.target.closest('.tpl-item');
                    if (!item) return;
                    const name = item.getAttribute('data-name');
                    if (e.target.classList.contains('tpl-load')) {
                        if (!hasData()) { toast('Upload a data file first, then load the template', 2); return; }
                        templateManager.loadLocal(name);
                        toast('Template loaded: ' + name, 1);
                        layer.closeAll('page');
                    } else if (e.target.classList.contains('tpl-del')) {
                        if (!confirm('Delete template "' + name + '"?')) return;
                        templateManager.deleteLocal(name);
                        renderList();
                    }
                });

                root.querySelector('#tplExport').onclick = () => templateManager.exportFile();
                const fileInput = root.querySelector('#tplImportFile');
                root.querySelector('#tplImport').onclick = () => fileInput.click();
                fileInput.onchange = (e) => {
                    const file = e.target.files[0];
                    if (!file) return;
                    if (!hasData()) { toast('Upload a data file first, then import the template', 2); return; }
                    templateManager.importFile(file)
                        .then(() => toast('Template imported', 1))
                        .catch((err) => toast('Import failed: ' + err.message, 2))
                        .finally(() => { fileInput.value = ''; });
                };

                renderList();
            }
        });
    });
}

function toast(msg, icon) {
    if (window.layui && layui.layer && layui.layer.msg) layui.layer.msg(msg, { icon, time: 1600 });
    else console.log('[TemplateLibrary] ' + msg);
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
}

function escapeAttr(str) {
    return String(str == null ? '' : str)
        .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
        .replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export default initTemplateLibrary;
