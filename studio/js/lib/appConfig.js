/**
 * appConfig.js (studio) — re-export of the shared deployment configuration.
 *
 * Studio runs from the app folder's studio/ subdirectory, i.e. one folder
 * deeper than the editor pages, so a hardcoded '../server/api.php' would
 * point inside the app folder and 404. The resolution rules live in js/core/appConfig.js
 * (window.PULSEFRAME_CONFIG, <meta name="pulseframe:api-base">, or a URL
 * derived from the current page) and are shared from here so both apps agree.
 */

export { apiBase, API_BASE, apiUrl, AMAP_KEY, hasAmapKey, safeThumb, escapeHtml } from '../../../js/core/appConfig.js';
