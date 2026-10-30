/**
 * VideoPanel.js - 视频生成交互（Setup 弹窗 + 进度/预览弹窗）
 * 对应老款程序 index.html 中 generateVideoBtn → Video Setup → 逐帧渲染 → 预览下载 的流程
 */

import { store } from '../core/Store.js';
import { generateVideo, abortRender } from '../renderer/frameRenderer.js';
import { mapBridge } from '../map/MapBridge.js';
import { secondsToHHMMSS } from '../utils/format.js';
import { VIDEO_DEFAULTS, VIDEO_FORMATS, VIDEO_FPS_PRESETS, VIDEO_FPS_MAX, normalizeVideoFps, MOV_BITRATE, RENDER_MEMORY_BUDGET, estimateRenderMemory } from '../core/constants.js';

/** 单次渲染的建议帧数上限：弹窗里那句「长视频分批」的口径（原来是按秒算，现在要按帧算） */
const RENDER_CHUNK_HINT = 5000;

/** 帧率那一行的悬停说明：讲清楚「时长不变、只是更细」，避免被当成倍速 */
const FPS_HELP = 'Frames per second.\n'
    + '1 = one trackpoint fills one second (the original behaviour).\n'
    + 'N > 1 spreads the same trackpoints over N frames each, so numbers, needles, the map\n'
    + 'and the chart cursor glide instead of stepping once per second. Values between two\n'
    + 'trackpoints are linearly interpolated (10 -> 12 shows 10.25, 10.5, 10.75).\n'
    + 'The video length does NOT change: one second of data is still one second of video.\n'
    + 'What grows is the frame count and the render time (x N).';

/**
 * 内存那一行的悬停说明：钱花在哪、为什么帧率不影响它、超了怎么办。
 * 口径全部来自 constants.estimateRenderMemory，文案与它保持同一套（别在 UI 里另算一遍）。
 */
const MEM_HELP = 'Rough upper bound on the memory this render needs.\n'
    + 'The encoded video is buffered entirely in the tab (MediaBunny BufferTarget), and when\n'
    + 'packing finishes the bytes are copied into a Blob, so the peak is about twice the file\n'
    + 'size, plus two full-size canvases (1920x1080 RGBA ~ 8 MB each) used per frame.\n'
    + 'File size grows with DURATION and FORMAT (MP4 8 Mbps ~ 1 MB/s, MOV ProRes 330 Mbps\n'
    + '~ 41 MB/s, WebM is quality-driven so MP4\'s rate is assumed). Frame rate does not\n'
    + 'change this estimate - it only multiplies render time.\n'
    + `If it goes over ${fmtBytes(RENDER_MEMORY_BUDGET)}, split the clip into shorter Start/End ranges and render\n`
    + 'them one by one; nothing is blocked here, this is only a warning.';

/** 字节数成人话：≥1 GB 显两位小数，否则取整 MB（弹窗那一行放不下第三种精度） */
function fmtBytes(bytes) {
    const b = Math.max(0, Number(bytes) || 0);
    const gb = 1024 ** 3;
    if (b >= gb) return `${(b / gb).toFixed(2)} GB`;
    return `${Math.max(1, Math.round(b / 1024 ** 2))} MB`;
}

/** 各格式的码率口径标签：和 estimateRenderMemory 用的是同一批常量，只是换成给用户看的说法 */
function rateLabel(format) {
    if (format === VIDEO_FORMATS.MOV) return `${Math.round(MOV_BITRATE / 1e6)} Mbps ProRes`;
    if (format === VIDEO_FORMATS.WEBM) return 'VP9 ~8 Mbps assumed';
    return `${Math.round(VIDEO_DEFAULTS.bitrate / 1e6)} Mbps`;
}

const CHECKER_BG = 'background-color: #fff; background-image: linear-gradient(45deg, #ccc 25%, transparent 25%), '
    + 'linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), '
    + 'linear-gradient(-45deg, transparent 75%, #ccc 75%); background-size: 20px 20px; '
    + 'background-position: 0 0, 0 10px, 10px -10px, -10px 0px;';

class VideoPanel {
    constructor() {
        this._layer = null;
        this._setupIndex = null;
        this._previewIndex = null;
        this._startTime = 0;
        this._videoUrl = null;
        this._finished = false;
    }

    /**
     * 绑定顶部 Generate Video 按钮
     */
    init() {
        const btn = document.getElementById('generateVideoBtn');
        if (!btn) {
            console.warn('[VideoPanel] #generateVideoBtn not found');
            return;
        }
        btn.addEventListener('click', () => this.openSetup());
        console.log('[VideoPanel] initialized');
    }

    /**
     * 懒加载 layui layer 模块
     */
    _getLayer() {
        return new Promise(resolve => {
            if (!window.layui) return resolve(null);
            if (layui.layer) return resolve(layui.layer);
            let done = false;
            const finish = () => {
                if (done) return;
                done = true;
                resolve((layui && layui.layer) || null);
            };
            try {
                layui.use(['layer'], finish);
            } catch (e) {
                finish();
            }
            // 兼容 layer 未就绪（部分模块走异步加载）时不卡在 await
            setTimeout(finish, 500);
        });
    }

    _toast(text, isError) {
        if (this._layer) {
            this._layer.msg(text, { icon: isError ? 2 : 1, time: 3000 });
        } else {
            alert(text);
        }
    }

    // ==================================================
    // 1. Setup 弹窗（格式 + 帧范围）
    // ==================================================
    async openSetup() {
        this._layer = await this._getLayer();
        if (!this._layer || !this._layer.open) {
            alert('UI layer (layui layer) not loaded, cannot open the video setup dialog');
            return;
        }

        const trkpt = store.get('trkptData');
        if (!trkpt || trkpt.length === 0) {
            this._toast('Please upload a GPX / TCX / FIT activity data file first', true);
            return;
        }
        if (!('VideoEncoder' in window)) {
            this._toast('WebCodecs is not supported in this browser, please use the latest Chrome / Edge / Safari', true);
            return;
        }
        if (store.get('isRendering')) {
            this._toast('A video is being generated, please finish or abort the current render first', true);
            return;
        }

        const maxFrame = trkpt.length;
        store.set('maxFrame', maxFrame);
        store.set('startFrame', 0);
        store.set('endFrame', maxFrame - 1);

        const fmtTime = idx => secondsToHHMMSS(trkpt[idx] ? trkpt[idx].sec : 0);

        // 帧率初值沿用上次导出选择（store.videoFps），非法值一律先归一化
        const fpsNow = normalizeVideoFps(store.get('videoFps'));
        const fpsIsPreset = VIDEO_FPS_PRESETS.includes(fpsNow);
        const fpsOptions = VIDEO_FPS_PRESETS
            .map(v => `<option value="${v}"${v === fpsNow ? ' selected' : ''}>${v} fps${v === 1 ? ' (default)' : ''}</option>`)
            .join('')
            + `<option value="custom"${fpsIsPreset ? '' : ' selected'}>Custom…</option>`;

        this._setupIndex = this._layer.open({
            type: 1,
            area: ['440px', '560px'],
            title: 'Video Setup',
            content: `
                <div style="padding: 12px;">
                    <div style="margin: 10px 0; line-height: 1.8;">
                        Split rendering:<br>
                        Choose a start/end frame range to render. For long videos, generate in chunks of 5000 frames.
                    </div>

                    <div style="margin: 15px 0; padding: 10px; border: 1px solid #eee; border-radius: 4px;">
                        <label style="margin-right: 18px; cursor: pointer;">
                            <input type="radio" name="videoFormat" value="mp4" checked> MP4
                        </label>
                        <label style="margin-right: 18px; cursor: pointer;">
                            <input type="radio" name="videoFormat" value="webm"> WebM (Alpha)
                        </label>
                        <label style="cursor: pointer;">
                            <input type="radio" name="videoFormat" value="mov"> MOV ProRes 4444 (Alpha)
                        </label>
                    </div>

                    <div style="margin: 0 0 12px; padding: 10px; border: 1px solid #eee; border-radius: 4px;">
                        <label style="display: inline-block; width: 74px;">Frame rate</label>
                        <select id="vFpsSelect" style="width: 110px;">${fpsOptions}</select>
                        <input type="number" id="vFpsCustom" min="1" max="${VIDEO_FPS_MAX}" step="1"
                            value="${fpsNow}"
                            style="display: none; width: 64px; margin-left: 6px;">
                        <span id="vFpsHelp" title="${FPS_HELP}"
                            style="display: inline-block; width: 16px; height: 16px; line-height: 14px;
                                   text-align: center; margin-left: 6px; border: 1px solid #bbb;
                                   border-radius: 50%; color: #888; font-size: 12px; cursor: help;">?</span>
                    </div>

                    <div style="margin-bottom: 8px;">
                        <label style="display: inline-block; width: 60px;">Start</label>
                        <input type="number" id="vStartFrame" min="0" max="${maxFrame - 1}" value="0"
                            style="width: 90px; margin-right: 10px;">
                        <span id="vStartFrameTime">time: ${fmtTime(0)}</span>
                    </div>
                    <div style="margin-bottom: 8px;">
                        <label style="display: inline-block; width: 60px;">End</label>
                        <input type="number" id="vEndFrame" min="1" max="${maxFrame - 1}" value="${maxFrame - 1}"
                            style="width: 90px; margin-right: 10px;">
                        <span id="vEndFrameTime">time: ${fmtTime(maxFrame - 1)}</span>
                    </div>
                    <div style="margin-bottom: 8px;">
                        <label style="display: inline-block; width: 60px;">Max</label>
                        <span>${maxFrame - 1}</span>
                        <span> | Total Time: ${fmtTime(maxFrame - 1)}</span>
                    </div>
                    <div id="vFrameCount" style="margin-bottom: 8px; color: #888;"></div>
                    <div id="vRenderHint" style="margin-bottom: 8px; color: #e74c3c;"></div>
                    <div style="margin-bottom: 10px; color: #888; line-height: 1.5;">
                        <span id="vMemHelp" title="${MEM_HELP}"
                            style="display: inline-block; width: 16px; height: 16px; line-height: 14px;
                                   text-align: center; margin-right: 6px; border: 1px solid #bbb;
                                   border-radius: 50%; color: #888; font-size: 12px; cursor: help;">?</span><span id="vMemText"></span>
                    </div>

                    <button class="layui-btn layui-btn-normal" id="btnStartGenerate">Start Generate</button>
                </div>
            `,
            success: () => {
                const startInput = document.getElementById('vStartFrame');
                const endInput = document.getElementById('vEndFrame');
                const select = document.getElementById('vFpsSelect');
                const custom = document.getElementById('vFpsCustom');
                const onChange = () => this._validateFrames();
                const syncFpsVisibility = () => {
                    if (custom) custom.style.display = select.value === 'custom' ? 'inline-block' : 'none';
                };
                startInput.addEventListener('change', onChange);
                endInput.addEventListener('change', onChange);
                select.addEventListener('change', () => { syncFpsVisibility(); onChange(); });
                if (custom) custom.addEventListener('change', onChange);
                // 格式也驱动回显：内存预估按格式的码率算，切 WebM / MOV 得跟着重算
                document.querySelectorAll('input[name="videoFormat"]')
                    .forEach(r => r.addEventListener('change', onChange));
                document.getElementById('btnStartGenerate')
                    .addEventListener('click', () => this._startGenerate());
                syncFpsVisibility();
                this._validateFrames();
            }
        });
    }

    /**
     * 读弹窗里选的帧率：钳制规则只有一处（constants.normalizeVideoFps），
     * 越界或填小数时把钳制结果写回输入框，让用户看得见最终值（跟 Start/End 一样）
     * @returns {number} 1 ~ VIDEO_FPS_MAX 的整数
     */
    _readFps() {
        const select = document.getElementById('vFpsSelect');
        const custom = document.getElementById('vFpsCustom');
        if (!select) return normalizeVideoFps(store.get('videoFps'));
        if (select.value !== 'custom') return normalizeVideoFps(select.value);
        const fps = normalizeVideoFps(custom ? custom.value : null);
        if (custom && Number(custom.value) !== fps) custom.value = fps;
        return fps;
    }

    /**
     * 帧范围校验 + 时间/帧数回显
     */
    _validateFrames() {
        const trkpt = store.get('trkptData');
        const maxFrame = trkpt.length;
        const startInput = document.getElementById('vStartFrame');
        const endInput = document.getElementById('vEndFrame');
        if (!startInput || !endInput) return;

        let start = parseInt(startInput.value, 10);
        let end = parseInt(endInput.value, 10);
        if (!Number.isFinite(start)) start = 0;
        if (!Number.isFinite(end)) end = maxFrame - 1;
        start = Math.max(0, Math.min(start, maxFrame - 1));
        end = Math.max(start, Math.min(end, maxFrame - 1));
        startInput.value = start;
        endInput.value = end;

        const st = document.getElementById('vStartFrameTime');
        const et = document.getElementById('vEndFrameTime');
        const fc = document.getElementById('vFrameCount');
        const hint = document.getElementById('vRenderHint');
        if (st) st.textContent = `time: ${secondsToHHMMSS(trkpt[start].sec)}`;
        if (et) et.textContent = `time: ${secondsToHHMMSS(trkpt[end].sec)}`;

        // Start/End 一直是「秒空间」的轨迹点范围，帧率只加密这一段：
        // 帧数 = 秒数 × fps，成片时长仍等于秒数 —— 文案把这个区别说清楚，别让人当成倍速。
        const fps = this._readFps();
        const seconds = end - start + 1;
        const frames = seconds * fps;
        if (fc) {
            fc.textContent = fps === 1
                ? `${seconds} frames total (1 frame = 1 second, output ≈ ${seconds} s)`
                : `${seconds} s of data × ${fps} frame/s = ${frames} frames, output ≈ ${seconds} s (length unchanged)`;
        }
        if (hint) {
            hint.textContent = frames > RENDER_CHUNK_HINT
                ? `Heads-up: ${frames} frames is over the 5000-frame chunk suggested above `
                  + `(that is ${Math.floor(RENDER_CHUNK_HINT / fps)} s of data at ${fps} frame/s). `
                  + 'Video length still ' + seconds + ' s; only render time grows.'
                : '';
        }

        // 内存预估：公式在 constants.estimateRenderMemory 里（本文件不另算一遍），
        // 只按「时长 × 格式码率」估，帧率不参与 —— 帧率改的是帧数和耗时，不是成片字节数。
        const memEl = document.getElementById('vMemText');
        if (memEl) {
            const format = document.querySelector('input[name="videoFormat"]:checked')?.value || VIDEO_DEFAULTS.format;
            const mem = estimateRenderMemory({ seconds, videoFormat: format, canvasSize: store.get('canvasSize') });
            memEl.textContent = `Memory ≈ ${fmtBytes(mem.peakBytes)} peak `
                + `(2 × ${fmtBytes(mem.fileBytes)} file + ${fmtBytes(mem.canvasBytes)} canvases; `
                + `${rateLabel(format)} × ${seconds} s)`
                + (mem.over
                    ? ` — over the ${fmtBytes(mem.budgetBytes)} budget, render in chunks of ≤ ${mem.maxChunkSeconds} s`
                    : '');
            const row = memEl.parentElement;
            if (row) row.style.color = mem.wayOver ? '#e74c3c' : mem.over ? '#e67e22' : '#888';
        }

        store.set('startFrame', start, true);
        store.set('endFrame', end, true);
        store.set('videoFps', fps, true);
    }

    // ==================================================
    // 2. 开始渲染
    // ==================================================
    async _startGenerate() {
        const trkpt = store.get('trkptData');
        const maxFrame = trkpt.length;
        const startRaw = parseInt(document.getElementById('vStartFrame').value, 10);
        const endRaw = parseInt(document.getElementById('vEndFrame').value, 10);
        const startFrame = Math.max(0, Math.min(Number.isFinite(startRaw) ? startRaw : 0, maxFrame - 1));
        const endFrame = Math.min(maxFrame - 1, Number.isFinite(endRaw) ? Math.max(endRaw, startFrame) : maxFrame - 1);
        const videoFormat = document.querySelector('input[name="videoFormat"]:checked')?.value || 'mp4';
        const fps = this._readFps();
        const renderFrames = (endFrame - startFrame + 1) * fps;

        if (startFrame > endFrame) {
            this._toast('Start frame cannot be greater than end frame', true);
            return;
        }

        // MOV(ProRes) 依赖 WebCodecs 编码支持，Linux 等环境常不支持
        if (videoFormat === 'mov') {
            try {
                const size = store.get('canvasSize') || { width: 1920, height: 1080 };
                const check = await VideoEncoder.isConfigSupported({
                    codec: 'prores',
                    width: size.width,
                    height: size.height,
                    bitrate: MOV_BITRATE
                });
                if (!check.supported) throw new Error('unsupported');
            } catch (e) {
                this._toast('ProRes encoding (MOV) is not supported by this browser/system, please use WebM (Alpha) instead', true);
                return;
            }
        }

        const btn = document.getElementById('btnStartGenerate');
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Generating...';
        }

        this._finished = false;
        this._startTime = Date.now();
        this._openPreview(renderFrames);

        try {
            // 地图预载 pass（约 5 秒）：位置仍走整秒栅格（跟升级前一样，见 MapBridge.preloadMaps），
            // 但进度按本次真实帧数报；无地图组件时自动跳过不增加等待
            const preloaded = await mapBridge.preloadMaps(startFrame, endFrame, fps, ({ percent, warmed, totalFrames }) =>
                this._setStatus(`Preloading maps... ${percent}% (${warmed}/${totalFrames} frames @ ${fps} fps)`, false));
            if (preloaded) this._setStatus('Maps preloaded, starting render', false);

            const blob = await generateVideo({
                startFrame,
                endFrame,
                videoFormat,
                fps,
                onProgress: (current, total) => this._updateProgress(current, total)
            });

            store.set('videoBlob', blob, true);
            this._updateProgress(renderFrames - 1, renderFrames);
            this._showResult(blob, videoFormat);
            this._setStatus(`Video generated (${renderFrames / fps} s @ ${fps} frame/s)`, false);
        } catch (err) {
            const msg = err && err.message ? err.message : String(err);
            const aborted = /abort|终止/i.test(msg);
            this._showError(aborted ? `Render aborted: ${msg}` : `Generation failed: ${msg}`);
            console.error('[VideoPanel] Render failed:', err);
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.textContent = 'Start Generate';
            }
            store.set('isRendering', false, true);
        }
    }

    // ==================================================
    // 3. 进度 / 预览弹窗
    // ==================================================
    _openPreview(totalFrames) {
        this._layer.open({
            type: 1,
            area: ['720px', '640px'],
            title: 'Video Preview & Progress',
            content: `
                <div style="padding: 10px; ${CHECKER_BG}">
                    <div id="videoProgressText"
                        style="font-size: 22px; text-align: center; margin: 18px 0; font-weight: bold; color: #333;">
                        Video generating... (0%)
                    </div>
                    <video id="previewVideo" width="680" height="400" controls autoplay
                        style="display: none; margin: 0 auto;"></video>
                    <div style="width: 420px; margin: 12px auto; text-align: center;">
                        Generation Time: <span id="videoRuntime">Calculating...</span>
                        <a id="videoDownloadLink" download="Sport-Data-Overlay.mp4"
                            style="display: none; margin-top: 10px;">
                            <button class="layui-btn layui-bg-blue layui-btn-fluid">Download Video</button>
                        </a>
                        <button class="layui-btn layui-btn-danger" id="btnAbortRender"
                            style="margin-top: 10px; width: 100%;">Abort Render</button>
                    </div>
                </div>
            `,
            success: (layero, index) => {
                this._previewIndex = index;
                const abortBtn = document.getElementById('btnAbortRender');
                if (abortBtn) {
                    abortBtn.addEventListener('click', () => {
                        abortRender();
                        this._showError('Aborting render...');
                    });
                }
            },
            end: () => {
                this._previewIndex = null;
                // 弹窗关闭时若仍在渲染 → 强制终止并释放资源
                if (!this._finished && store.get('isRendering')) {
                    abortRender();
                    this._setStatus('Video render aborted', false);
                }
                if (this._videoUrl) {
                    URL.revokeObjectURL(this._videoUrl);
                    this._videoUrl = null;
                }
                this._setStatus('', false, true);
            }
        });

        this._setStatus(`Video generating... 0/${totalFrames}`, false);
    }

    _updateProgress(current, total) {
        const el = document.getElementById('videoProgressText');
        if (!el) return;
        const percent = total > 1 ? Math.round((current / (total - 1)) * 100) : 100;
        el.style.color = '#333';
        el.textContent = `Video generating... ${current}/${total} (${percent}%)`;
        this._setStatus(`Video generating... ${current}/${total} (${percent}%)`, false);
    }

    _showResult(blob, videoFormat) {
        this._finished = true;

        const progressEl = document.getElementById('videoProgressText');
        const videoEl = document.getElementById('previewVideo');
        const linkEl = document.getElementById('videoDownloadLink');
        const runtimeEl = document.getElementById('videoRuntime');
        const abortBtn = document.getElementById('btnAbortRender');

        if (abortBtn) abortBtn.style.display = 'none';

        if (this._videoUrl) URL.revokeObjectURL(this._videoUrl);
        this._videoUrl = URL.createObjectURL(blob);

        if (progressEl) {
            progressEl.textContent = `Video generated! (${(blob.size / 1024 / 1024).toFixed(2)} MB)`;
            progressEl.style.color = '#16b777';
        }
        if (runtimeEl) {
            runtimeEl.textContent = secondsToHHMMSS(Math.round((Date.now() - this._startTime) / 1000));
        }
        if (videoEl) {
            videoEl.src = this._videoUrl;
            videoEl.style.display = 'block';
        }
        if (linkEl) {
            linkEl.download = `Sport-Data-Overlay.${videoFormat}`;
            linkEl.href = this._videoUrl;
            linkEl.style.display = 'block';
        }
    }

    _showError(text) {
        this._finished = true;
        const el = document.getElementById('videoProgressText');
        if (el) {
            el.textContent = text;
            el.style.color = '#dc3545';
        }
        const abortBtn = document.getElementById('btnAbortRender');
        if (abortBtn) abortBtn.style.display = 'none';
        this._toast(text, true);
        this._setStatus(text, true);
    }

    /**
     * 画布上的状态提示条（#videoStatus）
     */
    _setStatus(text, isError, hide = false) {
        const el = document.getElementById('videoStatus');
        if (!el) return;
        if (hide || !text) {
            el.style.display = 'none';
            return;
        }
        el.textContent = text;
        el.style.background = isError ? 'rgba(200, 40, 40, 0.8)' : 'rgba(0, 0, 0, 0.7)';
        el.style.display = 'block';
    }
}

export const videoPanel = new VideoPanel();
