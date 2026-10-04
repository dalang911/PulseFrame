/**
 * appConfig.js - single place where deployment-specific URLs are resolved.
 *
 * The frontend and the template store (server/) are deployed separately, so an
 * API address can never be hardcoded per page: /pulseframe/index.html and
 * /pulseframe/studio/index.html sit at different depths, and a public copy
 * may be hosted anywhere.
 *
 * Resolution order (first match wins):
 *   1. window.PULSEFRAME_CONFIG.apiBase          explicit override in the HTML
 *   2. window.PULSEFRAME_CONFIG.apiBaseByHost[hostname]
 *   3. <meta name="pulseframe:api-base" content="...">
 *   4. derived from the current URL: server/ is expected next to the app folder
 *
 * Example, put this in the page before the module scripts:
 *   <script>
 *     window.PULSEFRAME_CONFIG = {
 *         apiBase: 'https://sportsfile.data4u.vip/pages/server/api.php',
 *         amapKey: 'your-own-key',
 *     };
 *   </script>
 */

const GLOBAL_OVERRIDE = (typeof window !== 'undefined' && window.PULSEFRAME_CONFIG) || {};

function metaContent(name) {
    if (typeof document === 'undefined') return '';
    const el = document.querySelector(`meta[name="${name}"]`);
    return el ? (el.getAttribute('content') || '').trim() : '';
}

/** Collapse "." / ".." segments so the derived URL stays readable in logs. */
function normalizePath(path) {
    const out = [];
    for (const seg of path.split('/')) {
        if (!seg || seg === '.') continue;
        if (seg === '..') out.pop();
        else out.push(seg);
    }
    return '/' + out.join('/');
}

/**
 * Where the page lives, up to and including the app folder:
 * /apps/pulseframe/index.html and /apps/pulseframe/studio/ both give
 * /apps/pulseframe/.
 */
function appFolder(pathname) {
    let p = pathname.replace(/\/[^/]*\.html?$/i, '/');   // drop index.html
    p = p.replace(/\/studio\/?$/i, '/');                 // drop the studio subfolder
    return p.replace(/[^/]*$/, '');                       // keep trailing folder + slash
}

function deriveDefault() {
    if (typeof location === 'undefined') return 'server/api.php';
    const origin = location.origin || '';
    const folder = appFolder(location.pathname || '/');
    // server/ is a sibling of the app folder: /app/ -> /../server/api.php
    return origin + normalizePath(folder + '../server/api.php');
}

/**
 * Absolute API endpoint. Cached on first use; call apiBase(true) after setting
 * window.PULSEFRAME_CONFIG at runtime (tests, embedded previews).
 */
let cached = null;
export function apiBase(force = false) {
    if (cached && !force) return cached;
    const host = (typeof location !== 'undefined' && location.hostname) || '';
    const byHost = GLOBAL_OVERRIDE.apiBaseByHost || {};
    const value = GLOBAL_OVERRIDE.apiBase || metaContent('pulseframe:api-base') || byHost[host] || deriveDefault();
    cached = String(value).replace(/&$/, '').replace(/\?$/, '');
    return cached;
}

export const API_BASE = apiBase();

/** Query helper so callers never build URLs by hand. */
export function apiUrl(params = {}) {
    const qs = Object.entries(params)
        .filter(([, v]) => v !== undefined && v !== null && v !== '')
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&');
    const base = apiBase();
    return qs ? `${base}${base.includes('?') ? '&' : '?'}${qs}` : base;
}

/** AMap key. The published app has none: add your own or the map layer stays off. */
export const AMAP_KEY = GLOBAL_OVERRIDE.amapKey || metaContent('pulseframe:amap-key') || '';

export function hasAmapKey() {
    return AMAP_KEY.length > 0;
}

/**
 * Store thumbnails come from user submissions. The API validates them, but a
 * second check here keeps an older row (or another data source) from injecting
 * `javascript:` or a quote breakout into `<img src="...">`.
 */
const SAFE_THUMB = /^(https:\/\/[^\s"'<>\\]+$|data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$)/i;
export function safeThumb(url) {
    const value = String(url || '').trim();
    return value && SAFE_THUMB.test(value) ? value : '';
}

/** Escape before interpolating into innerHTML. */
export function escapeHtml(value) {
    return String(value ?? '')
        .replace(/[&<>"']/g, ch => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
        }[ch]));
}

export default { apiBase, API_BASE, apiUrl, AMAP_KEY, hasAmapKey, safeThumb, escapeHtml };
