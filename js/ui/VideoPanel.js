/**
 * VideoPanel.js - 视频生成交互（Setup 弹窗 + 进度/预览弹窗）
 * 对应老款程序 index.html 中 generateVideoBtn → Video Setup → 逐帧渲染 → 预览下载 的流程
 */

import { store } from '../core/Store.js';
import { generateVideo, abortRender } from '../renderer/frameRenderer.js';
import { mapBridge } from '../map/MapBridge.js';
import { secondsToHHMMSS } from '../utils/format.js';

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

        this._setupIndex = this._layer.open({
            type: 1,
            area: ['440px', '420px'],
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

                    <button class="layui-btn layui-btn-normal" id="btnStartGenerate">Start Generate</button>
                </div>
            `,
            success: () => {
                const startInput = document.getElementById('vStartFrame');
                const endInput = document.getElementById('vEndFrame');
                const onChange = () => this._validateFrames();
                startInput.addEventListener('change', onChange);
                endInput.addEventListener('change', onChange);
                document.getElementById('btnStartGenerate')
                    .addEventListener('click', () => this._startGenerate());
                this._validateFrames();
            }
        });
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
        if (st) st.textContent = `time: ${secondsToHHMMSS(trkpt[start].sec)}`;
        if (et) et.textContent = `time: ${secondsToHHMMSS(trkpt[end].sec)}`;
        if (fc) fc.textContent = `${end - start + 1} frames total (1 frame = 1 second, output ≈ ${end - start + 1} s)`;

        store.set('startFrame', start, true);
        store.set('endFrame', end, true);
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
                    bitrate: 330_000_000
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
        this._openPreview(endFrame - startFrame + 1);

        try {
            // 地图预载 pass（约 5 秒）：先快速播放一遍让离屏地图预热瓦片/完成首帧渲染，
            // 防止用户未预览过地图导致导出前几帧背景滞后；无地图组件时自动跳过
            const preloaded = await mapBridge.preloadMaps(startFrame, endFrame, (p) =>
                this._setStatus(`Preloading maps... ${p}%`, false));
            if (preloaded) this._setStatus('Maps preloaded, starting render', false);

            const blob = await generateVideo({
                startFrame,
                endFrame,
                videoFormat,
                onProgress: (current, total) => this._updateProgress(current, total)
            });

            store.set('videoBlob', blob, true);
            this._updateProgress(endFrame - startFrame, endFrame - startFrame + 1);
            this._showResult(blob, videoFormat);
            this._setStatus('Video generated', false);
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
