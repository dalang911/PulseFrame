/**
 * studio/ThemeManager.js - 界面明暗主题切换
 *
 * 只做三件事：把主题写到 <html data-theme>、记住用户选择、广播事件让画布同步底色。
 * - 默认明系；偏好存 localStorage（键 studio_theme），index.html <head> 里有同 key 的内联
 *   前置脚本，首帧就写好 data-theme，避免闪一下暗色。
 * - CSS 侧颜色全部走 --sp- 语义变量：:root/[data-theme="light"] 为明系，[data-theme="dark"] 覆盖为暗系。
 * - 每次切换在 document 上派发 'studio:themechange'，StudioCanvas 监听后刷新画布底色。
 */

const KEY = 'studio_theme';
export const THEME_EVENT = 'studio:themechange';

class ThemeManager {
    constructor() {
        this._btn = null;
        this._theme = 'light';
    }

    /** 读偏好：只认 localStorage，未设置过则为 light（明系默认） */
    get preference() {
        try { return localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light'; } catch (e) { return 'light'; }
    }

    get theme() { return this._theme; }
    isDark() { return this._theme === 'dark'; }

    init() {
        this._btn = document.getElementById('btnTheme');
        this._theme = this.preference;
        this._apply();                      // 与 <head> 前置脚本幂等，顺带补齐按钮文案
        if (this._btn) this._btn.addEventListener('click', () => this.toggle());
        // 多标签页之间跟随同一份偏好（_set(..., false) 不回写，但会广播事件让画布同步）
        window.addEventListener('storage', (e) => {
            if (e && e.key === KEY) this._set(this.preference, false);
        });
        return this;
    }

    setTheme(t) { this._set(t === 'dark' ? 'dark' : 'light', true); }
    toggle() { this._set(this.isDark() ? 'light' : 'dark', true); }

    _set(t, persist) {
        const changed = t !== this._theme;
        this._theme = t;
        this._apply();
        if (persist) { try { localStorage.setItem(KEY, t); } catch (e) { /* 隐私模式等写入失败仅影响记忆 */ } }
        if (changed) document.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: { theme: t } }));
    }

    _apply() {
        const html = document.documentElement;
        if (html) html.setAttribute('data-theme', this._theme);
        if (this._btn) {
            // 按钮展示“切换后的目标主题”（与主编辑器 Icon Toggle 惯例一致）
            const dark = this.isDark();
            this._btn.innerHTML = dark ? 'Light Mode' : 'Dark Mode';
            this._btn.title = dark ? 'Switch to light theme (Ctrl+Shift+L)' : 'Switch to dark theme (Ctrl+Shift+L)';
            this._btn.setAttribute('aria-pressed', dark ? 'true' : 'false');
        }
    }
}

export const themeManager = new ThemeManager();
