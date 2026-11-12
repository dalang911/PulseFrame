/* TrackTrim 内置示例：一段 believable 的晨跑河畔环线（含热身/冷却 + 中途红灯暂停），
   用于首次打开即可体验「裁剪头尾 / 删除中间 / 导出」完整流程。纯确定性生成，无随机。 */
window.TT = window.TT || {};

TT.demo = (function () {
    function build() {
        const N = 900;
        const cLat = 35.4137, cLon = 119.5214;
        const start = new Date(); start.setHours(6, 30, 0, 0);
        const t0 = start.getTime();
        const pauseA = 400, pauseB = 435;
        const moving = N - (pauseB - pauseA);
        const pts = [];
        let u = 0;
        for (let i = 0; i < N; i++) {
            const paused = i >= pauseA && i < pauseB;
            // 热身渐快、冷却渐慢
            let factor = 1;
            if (i < 40) factor = 0.6 + 0.4 * (i / 40);
            else if (i > N - 25) factor = 1 - 0.35 * ((i - (N - 25)) / 25);
            if (!paused) u += (2 * Math.PI / moving) * factor;
            const lat = cLat + 0.0035 * Math.sin(u) + 0.0012 * Math.sin(2 * u);
            const lon = cLon + 0.0050 * Math.cos(u) + 0.0009 * Math.cos(3 * u);
            const ele = 12 + 8 * Math.sin(u * 2) + 3 * Math.sin(u * 5);
            let hr, cad, power;
            if (paused) { hr = 118 + Math.round(3 * Math.sin(i)); cad = 0; power = 0; }
            else {
                const phase = i < 40 ? 105 + 40 * (i / 40)
                    : i > N - 25 ? 158 - 28 * ((i - (N - 25)) / 25)
                    : 150 + 12 * Math.sin(i / 60) + 6 * Math.sin(i / 13);
                hr = Math.round(phase);
                cad = Math.round(88 + 3 * Math.sin(i / 15));
                power = Math.round(215 + 35 * Math.sin(i / 20) + 15 * Math.sin(i / 7));
            }
            pts.push({
                t: t0 + i * 1000, lat, lon, ele: Math.round(ele * 10) / 10,
                hr, cad, power, speed: null, dist: null, temp: 18
            });
        }
        return { name: '示例 · 晨跑河畔环线', format: 'DEMO', sport: 'running', points: pts, meta: { created: t0 } };
    }
    return { build };
})();