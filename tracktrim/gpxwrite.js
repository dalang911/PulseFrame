/* TrackTrim GPX 1.1 导出：心率/步频走 gpxtpx:TrackPointExtension，功率用 <power>（Strava 惯例）。
   删除片段保留时间轴时按连续段拆分 trkseg。 */
window.TT = window.TT || {};

TT.gpx = (function () {
    const U = TT.util;

    function write(points, segments, opts) {
        opts = opts || {};
        const name = U.escapeXml(opts.name || 'Track');
        const sport = (U.SPORTS[opts.sport] || U.SPORTS.generic).gpx;
        segments = segments && segments.length ? segments : [points];
        const firstT = points.length && points[0].t != null ? points[0].t : null;

        const L = [];
        L.push('<?xml version="1.0" encoding="UTF-8"?>');
        L.push('<gpx version="1.1" creator="TrackTrim" xmlns="http://www.topografix.com/GPX/1/1" xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd http://www.garmin.com/xmlschemas/TrackPointExtension/v1 http://www.garmin.com/xmlschemas/TrackPointExtensionv1.xsd">');
        L.push('<metadata><name>' + name + '</name>' + (firstT != null ? '<time>' + U.iso(firstT) + '</time>' : '') + '</metadata>');
        L.push('<trk><name>' + name + '</name><type>' + sport + '</type>');
        for (const seg of segments) {
            const pts = seg.filter(TT.model.validCoord);
            if (!pts.length) continue;
            L.push('<trkseg>');
            for (const p of pts) {
                L.push('<trkpt lat="' + p.lat.toFixed(7) + '" lon="' + p.lon.toFixed(7) + '">');
                if (p.ele != null) L.push('<ele>' + p.ele.toFixed(1) + '</ele>');
                if (p.t != null) L.push('<time>' + U.iso(p.t) + '</time>');
                const hr = p.hr != null ? Math.round(p.hr) : null;
                const cad = p.cad != null ? Math.round(p.cad) : null;
                const pw = p.power != null ? Math.round(p.power) : null;
                const tp = p.temp != null ? p.temp.toFixed(1) : null;
                if (hr != null || cad != null || tp != null || pw != null) {
                    L.push('<extensions>');
                    if (hr != null || cad != null || tp != null) {
                        L.push('<gpxtpx:TrackPointExtension>');
                        if (hr != null) L.push('<gpxtpx:hr>' + hr + '</gpxtpx:hr>');
                        if (cad != null) L.push('<gpxtpx:cad>' + cad + '</gpxtpx:cad>');
                        if (tp != null) L.push('<gpxtpx:atemp>' + tp + '</gpxtpx:atemp>');
                        L.push('</gpxtpx:TrackPointExtension>');
                    }
                    if (pw != null) L.push('<power>' + pw + '</power>');
                    L.push('</extensions>');
                }
                L.push('</trkpt>');
            }
            L.push('</trkseg>');
        }
        L.push('</trk></gpx>');
        return L.join('\n');
    }

    return { write };
})();