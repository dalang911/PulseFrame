/**
 * DesignerApp.js - 可视化设计器主逻辑
 * 编排 ComponentPalette、Canvas、PropertyEditor、Exporter、Preview 等模块
 */

import { registry } from '../components/registry.js';
import '../components/definitions/index.js';  // 注册所有组件定义

import { componentPalette } from './ComponentPalette.js';
import { canvas } from './Canvas.js';
import { propertyEditor } from './PropertyEditor.js';
import { exporter } from './Exporter.js';
import { preview } from './Preview.js';

// ===== DOM 就绪后初始化 =====
document.addEventListener('DOMContentLoaded', () => {
    console.log('[DesignerApp] DOM ready, initializing...');

    initCanvas();
    initComponentPalette();
    initPropertyEditor();
    initToolbar();
    initPreview();

    console.log('[DesignerApp] Initialization complete');
});

/**
 * 初始化设计画布
 */
function initCanvas() {
    canvas.init('designerCanvas', {
        canvasSize: { width: 1920, height: 1080 },
        zoom: 0.5
    });

    // 选择回调 → 更新属性编辑器 + 图层面板
    canvas.onSelect((box) => {
        propertyEditor.selectComponent(box);
        updateLayerPanel();
    });

    // 变更回调 → 更新图层面板
    canvas.onChange(() => {
        updateLayerPanel();
    });

    // 画布尺寸切换
    const sizeSelect = document.getElementById('canvasSizeSelect');
    if (sizeSelect) {
        sizeSelect.addEventListener('change', () => {
            canvas.setCanvasSize(sizeSelect.value);
        });
    }

    // 缩放切换
    const zoomSelect = document.getElementById('canvasZoom');
    if (zoomSelect) {
        zoomSelect.addEventListener('change', () => {
            canvas.setZoom(parseFloat(zoomSelect.value));
        });
    }
}

/**
 * 初始化组件面板
 */
function initComponentPalette() {
    componentPalette.init('componentPalette');
}

/**
 * 初始化属性编辑器
 */
function initPropertyEditor() {
    propertyEditor.init('propertyEditor');
}

/**
 * 初始化工具栏按钮
 */
function initToolbar() {
    // 导出 JSON
    const btnExport = document.getElementById('btnExportJSON');
    if (btnExport) {
        btnExport.addEventListener('click', () => {
            exporter.exportJSON(canvas.getFrame(), canvas.getCanvasSize());
        });
    }

    // 保存到本地
    const btnSave = document.getElementById('btnSaveLocal');
    if (btnSave) {
        btnSave.addEventListener('click', () => {
            const name = prompt('Enter template name:');
            if (!name) return;
            exporter.saveLocal(canvas.getFrame(), canvas.getCanvasSize(), name);
            alert('Saved to local storage');
        });
    }

    // 提交到商店
    const btnSubmit = document.getElementById('btnSubmitShop');
    if (btnSubmit) {
        btnSubmit.addEventListener('click', async () => {
            const title = prompt('Template name:');
            if (!title) return;
            const category = prompt('Category (running/cycling/swimming/custom):', 'custom');
            if (!category) return;
            const author = prompt('Your nickname:');
            if (!author) return;
            const description = prompt('Description (optional):', '');

            try {
                const result = await exporter.submitToShop(
                    canvas.getFrame(),
                    canvas.getCanvasSize(),
                    { title, category, author, description }
                );
                if (result.success) {
                    alert('Template submitted for review!');
                } else {
                    alert('Submit failed: ' + (result.error || 'Unknown error'));
                }
            } catch (err) {
                alert('Submit failed: ' + err.message);
            }
        });
    }

    // 加载模板
    const btnLoad = document.getElementById('btnLoadTemplate');
    if (btnLoad) {
        btnLoad.addEventListener('click', () => {
            const templates = exporter.listLocal();
            if (templates.length === 0) {
                alert('No templates saved locally');
                return;
            }

            const names = templates.map((t, i) => `${i + 1}. ${t.name} (${t.componentCount} components)`).join('\n');
            const choice = prompt(`Choose a template to load:\n${names}\n\nEnter number:`);
            if (!choice) return;

            const idx = parseInt(choice) - 1;
            if (idx < 0 || idx >= templates.length) {
                alert('Invalid number');
                return;
            }

            const template = exporter.loadLocal(templates[idx].name);
            if (template) {
                loadTemplateToCanvas(template);
            }
        });
    }

    // 预览按钮
    const btnPreview = document.getElementById('btnPreview');
    if (btnPreview) {
        btnPreview.addEventListener('click', () => {
            preview.renderFrame(0);
        });
    }

    // 撤销/重做（简单实现）
    const btnUndo = document.getElementById('btnUndo');
    const btnRedo = document.getElementById('btnRedo');
    if (btnUndo) {
        btnUndo.addEventListener('click', () => {
            console.log('[DesignerApp] Undo (not yet implemented)');
        });
    }
    if (btnRedo) {
        btnRedo.addEventListener('click', () => {
            console.log('[DesignerApp] Redo (not yet implemented)');
        });
    }
}

/**
 * 初始化数据预览
 */
function initPreview() {
    preview.init(canvas.getFrame());
}

/**
 * 将模板 JSON 加载到画布
 */
function loadTemplateToCanvas(template) {
    if (!template || !template.components) return;

    // 清空画布
    canvas.clear();

    // 逐个恢复组件（含 customProps 作为 configOverrides）
    template.components.forEach(comp => {
        const configOverrides = {
            x: comp.x,
            y: comp.y,
            width: comp.width,
            height: comp.height
        };
        // 合并保存的自定义样式属性
        if (comp.customProps) {
            Object.assign(configOverrides, comp.customProps);
        }
        canvas.addComponent(comp.id, configOverrides);
    });

    console.log('[DesignerApp] Template loaded:', template.components.length, 'components');
}

/**
 * 更新图层面板
 */
function updateLayerPanel() {
    const layerList = document.getElementById('layerList');
    if (!layerList) return;

    const components = canvas.getComponents();
    if (components.length === 0) {
        layerList.innerHTML = '<div style="padding:10px;color:#999;font-size:12px;text-align:center;">Empty canvas</div>';
        return;
    }

    // 反向显示（上层在前）
    const reversed = [...components].reverse();
    layerList.innerHTML = reversed.map(box => {
        const def = registry.get(box.id);
        const name = def ? def.name : box.id;
        return `
            <div class="layer-item" data-box-id="${box.id}">
                <span class="layer-item-name">${name}</span>
                <span class="layer-item-actions">
                    <button title="Delete" onclick="this.closest('.layer-item').dispatchEvent(new CustomEvent('layer-delete'))">🗑️</button>
                </span>
            </div>
        `;
    }).join('');

    // 绑定图层项点击
    layerList.querySelectorAll('.layer-item').forEach(item => {
        item.addEventListener('click', (e) => {
            if (e.target.tagName === 'BUTTON') return;
            // 选中对应组件
            const boxId = item.dataset.boxId;
            const frame = canvas.getFrame();
            const box = frame.children.find(c => c.id === boxId);
            if (box) {
                propertyEditor.selectComponent(box);
                layerList.querySelectorAll('.layer-item').forEach(i => i.classList.remove('selected'));
                item.classList.add('selected');
            }
        });

        // 删除
        item.addEventListener('layer-delete', () => {
            const boxId = item.dataset.boxId;
            const frame = canvas.getFrame();
            const box = frame.children.find(c => c.id === boxId);
            if (box) {
                canvas.removeComponent(box);
                propertyEditor.selectComponent(null);
            }
        });
    });
}
