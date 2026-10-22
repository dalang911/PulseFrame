/**
 * site.config.example.js — the tracked defaults, and the template for your own
 * deployment config.
 *
 * Load order (both are plain classic scripts, so they run before any module):
 *   1. site.config.example.js — this file, committed to the repo.
 *   2. site.config.js         — your local / deployment copy, git-ignored and
 *      loaded immediately after, so it replaces whatever this file sets.
 *
 * A static deploy built straight from this repository therefore resolves the
 * Shared panel and the map layers with no extra step: the values below are the
 * public demo's. Copy the file when you want your own:
 *
 *   cp site.config.example.js site.config.js
 *
 * Every field is optional. Both files assign `window.PULSEFRAME_CONFIG` as a
 * whole object — they do not merge field by field — so when you override one
 * value, keep the others you still need in the same object.
 *
 *   - apiBase points at the public demo store and is browsable from any origin.
 *     Publishing back to a store needs an account issued by whoever runs it;
 *     how a store authenticates users and guards its write side is deliberately
 *     not documented here, since that belongs to the store, not to this frontend.
 *     Set apiBase to '' to derive the URL from your own hosting layout instead
 *     (docs/DEPLOYMENT.md §3 has the rule — note that the derivation only finds
 *     a store sitting next to the app folder, which is NOT how the live
 *     pulseframe.data4u.vip instance is arranged).
 *   - amapKey is a demo key published in a public repository on purpose so that
 *     a fresh clone renders the AMap layers. Treat it as rate-limited: every
 *     quota blow-up lands on the owner, so please do not hammer it. Apply for
 *     your own at https://console.amap.com, restrict it to your domain, and keep
 *     it in site.config.js so it never reaches the repo.
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
