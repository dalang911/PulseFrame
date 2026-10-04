/**
 * VideoEngine.js - 视频编码引擎
 * 封装 MediaBunny 调用，支持 MP4/WebM/MOV 格式
 */

import { eventBus, Events } from '../core/EventBus.js';
import { VIDEO_DEFAULTS, VIDEO_FORMATS } from '../core/constants.js';

class VideoEngine {
    constructor() {
        this._output = null;
        this._videoSource = null;
        this._isInitialized = false;
        this._mbModules = null;
        this._config = {};
    }

    /**
     * 加载 MediaBunny 模块（动态 import）
     * @returns {Promise<Object>} MediaBunny 模块
     */
    async loadModules() {
        if (this._mbModules) return this._mbModules;

        const mod = await import('../mediabunny.min.js');
        this._mbModules = {
            Output: mod.Output,
            BufferTarget: mod.BufferTarget,
            Mp4OutputFormat: mod.Mp4OutputFormat,
            WebMOutputFormat: mod.WebMOutputFormat,
            MovOutputFormat: mod.MovOutputFormat,
            CanvasSource: mod.CanvasSource,
            QUALITY_HIGH: mod.QUALITY_HIGH
        };
        return this._mbModules;
    }

    /**
     * 初始化视频编码器
     * @param {HTMLCanvasElement} canvas - 视频帧输出 Canvas
     * @param {Object} options - 编码配置
     * @returns {Promise<void>}
     */
    async initEncoder(canvas, options = {}) {
        if (this._isInitialized) return;

        const mb = await this.loadModules();

        this._config = {
            width: options.width || 1920,
            height: options.height || 1080,
            codec: options.codec || VIDEO_DEFAULTS.codec,
            bitrate: options.bitrate || VIDEO_DEFAULTS.bitrate,
            videoFormat: options.videoFormat || VIDEO_DEFAULTS.format,
            ...options
        };

        // 根据格式创建输出格式
        let outputFormat;
        if (this._config.videoFormat === VIDEO_FORMATS.WEBM) {
            outputFormat = new mb.WebMOutputFormat({
                codec: 'vp9',
                bitrate: mb.QUALITY_HIGH
            });
        } else if (this._config.videoFormat === VIDEO_FORMATS.MOV) {
            outputFormat = new mb.MovOutputFormat({
                codec: 'prores',
                bitrate: 330_000_000
            });
        } else {
            outputFormat = new mb.Mp4OutputFormat({
                codec: this._config.codec,
                bitrate: this._config.bitrate
            });
        }

        // 创建输出器
        this._output = new mb.Output({
            format: outputFormat,
            target: new mb.BufferTarget()
        });

        // 配置 CanvasSource
        const canvasOpts = {
            width: this._config.width,
            height: this._config.height
        };

        if (this._config.videoFormat === VIDEO_FORMATS.WEBM) {
            canvasOpts.codec = 'vp9';
            canvasOpts.bitrate = mb.QUALITY_HIGH;
            canvasOpts.alpha = 'keep';
        } else if (this._config.videoFormat === VIDEO_FORMATS.MOV) {
            canvasOpts.codec = 'prores';
            canvasOpts.bitrate = 330_000_000;
            canvasOpts.alpha = 'keep';
        } else {
            canvasOpts.codec = this._config.codec;
            canvasOpts.bitrate = this._config.bitrate;
        }

        this._videoSource = new mb.CanvasSource(canvas, canvasOpts);
        this._output.addVideoTrack(this._videoSource);
        await this._output.start();

        this._isInitialized = true;
        console.log(`[VideoEngine] Initialized (${this._config.videoFormat})`);
    }

    /**
     * 添加一帧到视频
     * @param {number} timestamp - 时间戳（秒）
     * @param {number} duration - 帧持续时间（秒）
     */
    async addFrame(timestamp, duration) {
        if (!this._isInitialized) {
            throw new Error('Encoder not initialized');
        }
        await this._videoSource.add(timestamp, duration);
    }

    /**
     * 完成编码，返回视频 Blob
     * @returns {Promise<Blob>}
     */
    async finalize() {
        if (!this._isInitialized) {
            throw new Error('Encoder not initialized');
        }

        await this._output.finalize();

        const videoBuffer = this._output.target.buffer;
        let mimeType;

        switch (this._config.videoFormat) {
            case VIDEO_FORMATS.WEBM: mimeType = 'video/webm'; break;
            case VIDEO_FORMATS.MOV: mimeType = 'video/quicktime'; break;
            default: mimeType = 'video/mp4'; break;
        }

        const blob = new Blob([videoBuffer], { type: mimeType });
        this._cleanup();

        eventBus.emit(Events.RENDER_COMPLETE, blob);
        return blob;
    }

    /**
     * 中止渲染
     */
    abort() {
        this._cleanup();
        eventBus.emit(Events.RENDER_ABORT);
        console.log('[VideoEngine] Aborted');
    }

    _cleanup() {
        this._output = null;
        this._videoSource = null;
        this._isInitialized = false;
    }

    get isInitialized() { return this._isInitialized; }
}

// 单例导出
export const videoEngine = new VideoEngine();
