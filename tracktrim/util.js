/* TrackTrim 公共工具：地理、时间、格式化。所有模块挂在 window.TT 下（经典脚本，file:// 可用）。 */
window.TT = window.TT || {};

TT.util = (function () {
    const FIT_EPOCH = 631065600; // FIT date_time 起点 = 1989-12-31T00:00:00Z 的 unix 秒
    const SEMI = 2147483648; // 2^31，半圆(smicircles)与度的换算因子

    function hav(lat1, lon1, lat2, lon2) {
        const R = 6371000, rad = Math.PI / 180;
        const dLat = (lat2 - lat1) * rad, dLon = (lon2 - lon1) * rad;
        const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
        return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
    }

    const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
    const semiToDeg = v => v * 180 / SEMI;
    const degToSemi = d => clamp(Math.round(d * SEMI / 180), -SEMI, SEMI - 1);
    const msToFit = ms => Math.round(ms / 1000) - FIT_EPOCH;
    const fitToMs = s => (s + FIT_EPOCH) * 1000;

    function pad(n, w) { return String(n).padStart(w || 2, '0'); }

    function fmtDuration(sec) {
        if (sec == null || !isFinite(sec)) return '—';
        sec = Math.round(sec);
        const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
        return h > 0 ? h + ':' + pad(m) + ':' + pad(s) : m + ':' + pad(s);
    }

    function fmtHMS(sec) {
        if (sec == null || !isFinite(sec)) return '00:00:00';
        sec = Math.max(0, Math.round(sec));
        return pad(Math.floor(sec / 3600)) + ':' + pad(Math.floor((sec % 3600) / 60)) + ':' + pad(sec % 60);
    }

    function parseHMS(str) {
        const m = String(str).trim().match(/^(\d+):([0-5]?\d):([0-5]?\d)$/);
        if (!m) return null;
        return (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]);
    }

    const fmtDist = m => m == null ? '—' : (m >= 1000 ? (m / 1000).toFixed(2) + ' km' : Math.round(m) + ' m');
    const fmtSpeed = v => v == null ? '—' : (v * 3.6).toFixed(1) + ' km/h';
    function fmtPace(v) {
        if (!v || v <= 0.2) return '—';
        const s = 1000 / v;
        return Math.floor(s / 60) + "'" + pad(Math.round(s % 60)) + '"';
    }
    const fmtEle = m => m == null ? '—' : Math.round(m) + ' m';

    function fmtClock(ms) {
        const d = new Date(ms);
        return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
    }
    function fmtDate(ms) {
        const d = new Date(ms);
        return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    }
    function toLocalInput(ms) {
        const d = new Date(ms);
        return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
            'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    }
    function fromLocalInput(str) {
        const m = String(str).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
        if (!m) return null;
        return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).getTime();
    }
    const iso = ms => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');

    const escapeXml = s => String(s).replace(/[<>&'"]/g,
        c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));

    function downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
    }

    // 二分：x 升序数组中最后一个 <= v 的下标
    function lowerBound(arr, v, get) {
        let lo = 0, hi = arr.length - 1, ans = 0;
        while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            if (get(arr[mid]) <= v) { ans = mid; lo = mid + 1; } else hi = mid - 1;
        }
        return ans;
    }

    const SPORTS = {
        generic: { label: '其他', fit: 0, gpx: 'other' },
        running: { label: '跑步', fit: 1, gpx: 'running' },
        cycling: { label: '骑行', fit: 2, gpx: 'cycling' },
        swimming: { label: '游泳', fit: 5, gpx: 'swimming' },
        walking: { label: '步行', fit: 11, gpx: 'walking' },
        hiking: { label: '徒步', fit: 17, gpx: 'hiking' }
    };

    function sportFromText(s) {
        s = String(s || '').toLowerCase();
        if (/run|跑/.test(s)) return 'running';
        if (/cycl|bik|ride|骑/.test(s)) return 'cycling';
        if (/swim|游/.test(s)) return 'swimming';
        if (/hik|登山|徒步/.test(s)) return 'hiking';
        if (/walk|步行|走/.test(s)) return 'walking';
        return 'generic';
    }

    return {
        FIT_EPOCH, hav, clamp, semiToDeg, degToSemi, msToFit, fitToMs,
        fmtDuration, fmtHMS, parseHMS, fmtDist, fmtSpeed, fmtPace, fmtEle,
        fmtClock, fmtDate, toLocalInput, fromLocalInput, iso,
        escapeXml, downloadBlob, lowerBound, SPORTS, sportFromText
    };
})();