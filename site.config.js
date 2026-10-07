/**
 * site.config.example.js — copy to site.config.js and edit for your hosting.
 *
 *   cp site.config.example.js site.config.js
 *
 * site.config.js is loaded by index.html / designer.html / studio/index.html
 * before any module runs, and it is NOT tracked by git (deployment-specific
 * values often end up in it). Every field below is optional; delete the file
 * and the app still works with the defaults described in js/core/appConfig.js.
 *
 * The two values pre-filled here are shared on purpose:
 *   - apiBase  points at the public demo store. It is browsable from any
 *     origin — clone the repo, run a static server, open the Shared panel and
 *     the community library loads. Publishing back to it requires an account
 *     issued by whoever runs that store; how a store authenticates its users
 *     and guards its write side is deliberately not documented here, since
 *     that belongs to the store, not to this frontend. Set apiBase to '' to
 *     derive the URL from your own hosting layout instead (see
 *     docs/DEPLOYMENT.md §3 for the exact rule).
 *   - amapKey  is a demo key exposed in a public repository — treat it as
 *     rate-limited and replace it with one you applied for at
 *     https://console.amap.com as soon as you deploy anywhere real. Every
 *     quota blow-up lands on the owner, so please do not hammer it.
 */

window.PULSEFRAME_CONFIG = {
    apiBase: 'https://sportsfile.data4u.vip/server/api.php',

    /**
     * Per-host overrides, used when the same build serves several domains
     * (e.g. a CDN hostname that does not sit next to the store).
     */
    apiBaseByHost: {
        // 'www.example.com': 'https://api.example.com/server/api.php',
    },

    /**
     * AMap (高德) JS API key. Required only by components whose framework is
     * "amap"; maptalks layers work without it. The library is not downloaded at
     * all while this is empty.
     */
    amapKey: 'dc517396597f9dbd58c7483f2626c68c',
};
