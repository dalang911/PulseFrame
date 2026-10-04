/**
 * app.js - 应用入口
 * 初始化核心模块、绑定事件、启动数据流
 */

import { eventBus, Events } from './core/EventBus.js';
import { store } from './core/Store.js';
import { canvasManager } from './core/CanvasManager.js';
import { DEFAULT_CANVAS, PREVIEW_SIZE } from './core/constants.js';
import { dataPipeline } from './data/DataPipeline.js';
import { localComponents, sharedComponents } from './ui/CustomComponentPanels.js';
import { widgetPicker } from './ui/WidgetPicker.js';
import { settingsPanel } from './ui/SettingsPanel.js';
import { initBackgroundLayer } from './components/factory.js';
import { updateAllComponents } from './components/updater.js';
import { videoPanel } from './ui/VideoPanel.js';
import { applyRatio } from './ui/CanvasResizer.js';
import { initAlignTools } from './ui/AlignTools.js';
import { initTemplateLibrary } from './ui/TemplateLibrary.js';
import { initGlobalFont } from './core/GlobalFont.js';

// 导入组件定义（触发注册到 registry）
import './components/definitions/index.js';
// 自定义（可视化）组件：本地同步注册 + 远端异步（审核通过的公共组件）
import { loadCustomComponents, REMOTE_EVENT } from './components/visual/loader.js';

// 内置定义注册完毕后，立即加载本地自定义组件（早于 widgetPicker 渲染）
loadCustomComponents();
// 远端组件异步到达后刷新左侧组件面板
eventBus.on(REMOTE_EVENT, () => widgetPicker.refresh());

// ===== DOM 就绪后初始化 =====
document.addEventListener('DOMContentLoaded', () => {
    console.log('[App] DOM ready, initializing...');

    initLeaferInstances();
    initFileUpload();
    initProgressBar();
    initWidgetPicker();
    initTabSwitch();
    initRatioSwitch();
    initTemplateLibrary();
    initCustomPanels();
    initEventListeners();
    initVideoPanel();

    // 右侧编辑面板（监听 component:selected → 渲染 settings UI）
    settingsPanel.init();

    // 多选对齐工具（依赖 canvasManager 已注册的 appview.editor）
    initAlignTools();

    // 全局字体：订阅组件事件 + 恢复上次保存的字体（依赖已注册的 frame）
    initGlobalFont();

    console.log('[App] Initialization complete');
});

/**
 * 初始化 Leafer 双实例（前端预览 + 内存渲染）
 */
function initLeaferInstances() {
    const { App, Frame, LeaferEvent, EditorEvent, ChildEvent } = window.LeaferUI;

    // 1. 创建前端 Leafer 实例（绑定 #appv 容器，960x960 视图）
    const appview = new App({
        id: 'frontendApp',
        view: 'appv',
        width: PREVIEW_SIZE,   // 960
        height: PREVIEW_SIZE,  // 960
        fill: '#CCCCCC',
        type: 'draw',
        editor: {
            point: { cornerRadius: 0 },
            middlePoint: {},
            rotatePoint: { width: 16, height: 16 },
            rect: { dashPattern: [3, 2] }
        }
    });

    // 2. 创建前端画布 Frame（1920x1080 实际分辨率）
    const frame = new Frame({
        width: DEFAULT_CANVAS.width,
        height: DEFAULT_CANVAS.height,
        overflow: 'hide',
        fill: '#00000000'
    });
    appview.tree.add(frame);

    // 3. 缩放到页面显示尺寸（将 1920x1080 适配到 960x960 容器）
    appview.tree.zoom(
        { x: 0, y: 0, width: DEFAULT_CANVAS.width, height: DEFAULT_CANVAS.height },
        [0, 0, 0, 0]
    );

    // 4. 注册元素多选事件 → 对齐工具面板（需 canvasManager 已注册 appview，见下方 initAlignTools）

    // 5. 创建内存渲染实例（全屏尺寸，用于视频导出）
    //    注意：App 基于编辑器，必须带 editor 配置，否则 .tree 不会初始化
    const memoryContainer = document.getElementById('tempLeaferContainer');
    const memoryApp = new App({
        id: 'memoryApp',
        view: 'tempLeaferContainer',
        width: DEFAULT_CANVAS.width,
        height: DEFAULT_CANVAS.height,
        fill: '#CCCCCC',
        type: 'draw',
        editor: {
            point: { cornerRadius: 0 },
            middlePoint: {},
            rotatePoint: { width: 16, height: 16 },
            rect: { dashPattern: [3, 2] }
        }
    });

    const memoryFrame = new Frame({
        width: DEFAULT_CANVAS.width,
        height: DEFAULT_CANVAS.height,
        overflow: 'hide',
        fill: '#00000000'
    });
    memoryApp.tree.add(memoryFrame);

    // 缩放到与前端一致的比例
    memoryApp.tree.zoom(
        { x: 0, y: 0, width: DEFAULT_CANVAS.width, height: DEFAULT_CANVAS.height },
        [0, 0, 0, 0]
    );

    // 存入 CanvasManager（不再存入 Store，避免不可序列化对象污染状态层）
    canvasManager.initPreview(appview, frame);
    canvasManager.initMemory(memoryApp, memoryFrame);

    // 6. 背景层：自动添加为画布最底层（仅预览参考，视频导出时过滤，同老款程序）
    initBackgroundLayer();

    console.log('[App] Leafer App instances created, frame:', DEFAULT_CANVAS.width + 'x' + DEFAULT_CANVAS.height);
}

/**
 * 初始化文件上传处理
 */
function initFileUpload() {
    const fileInput = document.getElementById('fileInput');
    if (!fileInput) return;

    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        console.log('[App] File selected:', file.name, `(${(file.size / 1024).toFixed(1)}KB)`);

        try {
            const rq = await dataPipeline.process(file, (stage) => {
                console.log(`[Pipeline] ${stage}`);
            });

            // 统一写入 Store
            store.set('processedData', rq, true);
            store.set('trkptData', rq.data.trkpt, true);
            store.set('chartData', rq._chartData, true);
            store.set('currentFrame', 0, true);
            store.set('maxFrame', rq.data.trkpt.length, true);
            store.set('endFrame', rq.data.trkpt.length - 1);

            // 调试输出：Store 中的数据变量（原始/处理数据快照见 DataPipeline 的 [Data] 日志）
            console.log('[App] 数据已写入 Store:', {
                processedData: 'store.get("processedData") → 完整 rq',
                trkptData: `store.get("trkptData") → ${rq.data.trkpt.length} 个逐秒轨迹点`,
                chartData: 'store.get("chartData") → 图表坐标/极值'
            });
            window.__store = store;

            // 显示摘要 + 通知其他模块
            displaySummary(rq.data);
            eventBus.emit(Events.DATA_LOADED, rq);
        } catch (err) {
            console.error('[App] Data processing error:', err);
            alert('Data parsing failed: ' + err.message);
        }
    });
}

/**
 * 显示数据摘要到左侧面板
 * @param {Object} data - rq.data
 */
function displaySummary(data) {
    const infoEl = document.getElementById('jsonInfo');
    if (!infoEl) return;

    const { summary, motion, trkpt } = data;
    const totalKm = (motion.distance / 1000).toFixed(2);
    const duration = formatDuration(summary.total_time);

    infoEl.innerHTML = `
        <div style="font-size: 12px; line-height: 1.8;">
            <div><b>Title:</b> ${summary.name || '-'}</div>
            <div><b>Date:</b> ${summary.training_at || '-'}</div>
            <div><b>Distance:</b> ${totalKm} km</div>
            <div><b>Duration:</b> ${duration}</div>
            <div><b>Ascent:</b> ${motion.total_ascent || 0} m</div>
            <div><b>Descent:</b> ${motion.total_descent || 0} m</div>
            <div><b>Points:</b> ${trkpt.length}</div>
        </div>
    `;
}

/**
 * 秒数 → "HH:MM:SS"
 */
function formatDuration(totalSec) {
    if (!totalSec) return '00:00:00';
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return [h, m, s].map(v => String(v).padStart(2, '0')).join(':');
}

/**
 * 初始化预览进度条 + 播放/暂停按钮
 * 播放：每 100ms 前进 1% 进度（1 秒 10 次），到末尾自动停止。
 */
function initProgressBar() {
    const progressBar = document.getElementById('progressBar');
    const playBtn = document.getElementById('playBtn');
    if (!progressBar) return;

    // 应用某一帧到画布（进度条与播放共用）
    const applyFrame = (frame) => {
        store.set('currentFrame', frame);
        eventBus.emit(Events.FRAME_UPDATE, frame);
    };

    progressBar.addEventListener('input', (e) => {
        applyFrame(parseInt(e.target.value, 10));
    });

    if (!playBtn) return;

    const PLAY_ICON = '\u25B6';   // ▶
    const PAUSE_ICON = '\u275A\u275A'; // ❚❚
    let timer = null;

    const stop = () => {
        if (timer) { clearInterval(timer); timer = null; }
        playBtn.textContent = PLAY_ICON;
        playBtn.title = 'Play';
    };

    const start = () => {
        const max = parseInt(progressBar.max, 10) || 0;
        if (max <= 0) return; // 未加载数据，不播放
        if (parseInt(progressBar.value, 10) >= max) { // 已在末尾 → 从头播
            progressBar.value = 0;
            applyFrame(0);
        }
        timer = setInterval(() => {
            const step = Math.max(1, Math.round(max / 100)); // 1% 进度
            let next = parseInt(progressBar.value, 10) + step;
            if (next >= max) {         // 播放到末尾即停止
                progressBar.value = max;
                applyFrame(max);
                stop();
                return;
            }
            progressBar.value = next;
            applyFrame(next);
        }, 100);
        playBtn.textContent = PAUSE_ICON;
        playBtn.title = 'Pause';
    };

    playBtn.addEventListener('click', () => {
        if (timer) stop();
        else start();
    });
}

/**
 * 初始化左侧组件选择面板
 */
function initWidgetPicker() {
    const widgetList = document.getElementById('widgetList');
    if (widgetList) {
        widgetPicker.init(widgetList);
    }
}

/**
 * 初始化左侧面板 Tab 切换（原生 / 本地 / 共享）
 * 原生＝内置手写组件（带分类 Tab 条）；本地＝浏览器 localStorage 的 studio 作品；共享＝服务器审核发布的组件
 */
function initTabSwitch() {
    const tabs = {
        widget: document.getElementById('tabWidget'),
        local: document.getElementById('tabLocal'),
        shared: document.getElementById('tabShop')
    };
    const panels = {
        widget: document.getElementById('widgetList'),
        local: document.getElementById('localContainer'),
        shared: document.getElementById('sharedContainer')
    };
    const tabHeader = document.getElementById('tabHeader');
    const tabBodyWrap = document.getElementById('tabBodyWrap');

    if (!tabs.widget || !tabs.local || !tabs.shared) {
        console.error('[App] Tab elements not found!');
        return;
    }

    const activate = (name) => {
        Object.keys(tabs).forEach(k => tabs[k] && tabs[k].classList.toggle('layui-this', k === name));
        Object.keys(panels).forEach(k => { if (panels[k]) panels[k].style.display = k === name ? '' : 'none'; });
        if (tabHeader) tabHeader.style.display = name === 'widget' ? '' : 'none';
        if (tabBodyWrap) {
            tabBodyWrap.classList.toggle('layui-col-md9', name === 'widget');
            tabBodyWrap.classList.toggle('layui-col-md12', name !== 'widget');
        }
    };

    Object.keys(tabs).forEach(k => tabs[k].addEventListener('click', () => {
        console.log('[App] Tab:', k);
        activate(k);
    }));
}

/**
 * 初始化横竖屏（画布比例）切换按钮
 */
function initRatioSwitch() {
    const btn169 = document.getElementById('ratio169');
    const btn916 = document.getElementById('ratio916');
    if (!btn169 || !btn916) return;

    const setActive = (ratio) => {
        btn169.classList.toggle('layui-btn-normal', ratio === '16:9');
        btn169.classList.toggle('layui-btn-primary', ratio !== '16:9');
        btn916.classList.toggle('layui-btn-normal', ratio === '9:16');
        btn916.classList.toggle('layui-btn-primary', ratio !== '9:16');
    };

    btn169.addEventListener('click', () => {
        if (applyRatio('16:9')) { setActive('16:9'); notifyRatioSwitch(); }
    });
    btn916.addEventListener('click', () => {
        if (applyRatio('9:16')) { setActive('9:16'); notifyRatioSwitch(); }
    });
}

/**
 * 切换比例后的轻提示（画布已重置，组件被清空）
 */
function notifyRatioSwitch() {
    if (!window.layui) return;
    const show = () => layui.layer.msg('Canvas ratio changed; components cleared, please re-add them', { icon: 1, time: 1800 });
    if (layui.layer && layui.layer.msg) show();
    else if (typeof layui.use === 'function') layui.use(['layer'], show);
}

/**
 * 初始化左侧「本地 / 共享」自定义组件面板
 */
function initCustomPanels() {
    localComponents.init('#localContainer');
    sharedComponents.init('#sharedContainer');
    console.log('[App] Custom component panels initialized');
}

/**
 * 初始化全局事件监听
 */
function initEventListeners() {
    // 数据就绪后更新进度条范围
    eventBus.on(Events.DATA_LOADED, (rq) => {
        const progressBar = document.getElementById('progressBar');
        if (progressBar) {
            progressBar.max = rq.data.trkpt.length - 1;
            progressBar.value = 0;
        }
    });

    // 帧更新：刷新画布上所有组件数据
    eventBus.on(Events.FRAME_UPDATE, (frame) => {
        updateAllComponents(frame);
    });

    // 帧更新时同步进度条
    eventBus.on(Events.FRAME_UPDATE, (frame) => {
        const progressBar = document.getElementById('progressBar');
        if (progressBar && parseInt(progressBar.value) !== frame) {
            progressBar.value = frame;
        }
    });

    // 全局单位配置变更：刷新当前帧，使各仪表盘重新读取前后缀
    eventBus.on(Events.UNIT_CONFIG_CHANGED, () => {
        const currentFrame = store.get('currentFrame');
        if (currentFrame != null) {
            updateAllComponents(currentFrame);
        }
    });
}

/**
 * 初始化视频生成面板（Generate Video 按钮 → Setup 弹窗 → 逐帧渲染）
 */
function initVideoPanel() {
    videoPanel.init();
}
