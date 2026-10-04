/**
 * math.js - 数学工具函数
 * 从原 index.html 提取的坐标映射、抽稀等算法
 */

/**
 * 计算容器拖拽缩放后，子元素所处的「缩放比」。
 * 组件 build 内几何按「设计尺寸」书写；外层 Box 带 resizeChildren 时，
 * 拖拽会把子元素按 box.当前 / 设计 等比放大，但 update() 每帧用「设计坐标」
 * 直接回写 marker（进度点/进度条）会抵消这份缩放，导致 marker 不跟随。
 * 用本函数拿到缩放比，把设计坐标乘上它再写回即可对齐。
 * @param {Object} box - Leafer 容器（读 box.width/height 当前值）
 * @param {number} defW - 设计基准宽（definition.defaultConfig.width）
 * @param {number} defH - 设计基准高（definition.defaultConfig.height）
 * @returns {{x:number, y:number}}
 */
export function resizeScale(box, defW, defH) {
    const sx = defW && box && box.width ? box.width / defW : 1;
    const sy = defH && box && box.height ? box.height / defH : 1;
    return { x: sx, y: sy };
}

/**
 * 折线图绘图区内缩：把设计坐标 [0,W]x[0,H] 线性映射到留边距后的
 * [padX, W-padX] x [padY, H-padY]。
 * Box 带 resizeChildren 时按左上角等比缩放，若绘图内容铺满到 0/W、0/H，
 * 线宽/圆头/圆点半径会跨出边界，放大后越界更明显。内缩后四周留白随缩放
 * 同比放大，刻度线/曲线/圆点始终落在框内。
 * @param {number} W - 设计宽
 * @param {number} H - 设计高
 * @param {number} padX - 左右内缩（设计px）
 * @param {number} padY - 上下内缩（设计px）
 * @returns {{x:Function, y:Function, points:Function}}
 */
export function plotInsets(W, H, padX, padY) {
    const sx = (W - 2 * padX) / W;
    const sy = (H - 2 * padY) / H;
    return {
        x: v => padX + v * sx,
        y: v => padY + v * sy,
        points: flat => {
            const r = [];
            for (let i = 0; i < flat.length; i += 2) {
                r.push(padX + (flat[i] || 0) * sx, padY + (flat[i + 1] || 0) * sy);
            }
            return r;
        }
    };
}

/**
 * 值域映射：将值从一个范围线性映射到另一个范围
 * @param {number} value - 输入值
 * @param {number} fromMin - 源范围最小值
 * @param {number} fromMax - 源范围最大值
 * @param {number} toMin - 目标范围最小值
 * @param {number} toMax - 目标范围最大值
 * @returns {number}
 */
export function mapToRange(value, fromMin, fromMax, toMin, toMax) {
    if (Math.abs(fromMax - fromMin) < 1e-10) {
        return (toMin + toMax) / 2;
    }
    return (value - fromMin) * (toMax - toMin) / (fromMax - fromMin) + toMin;
}

/**
 * 道格拉斯-普克抽稀算法（迭代版）
 * 减少点数量，保留趋势
 * @param {Array} points - 二维点数组 [[x,y], ...]
 * @param {number} epsilon - 抽稀阈值（像素）
 * @returns {Array} 抽稀后的点数组
 */
export function douglasPeucker(points, epsilon) {
    if (points.length <= 2) return [...points];

    const stack = [[0, points.length - 1]];
    const keep = new Array(points.length).fill(false);
    keep[0] = true;
    keep[points.length - 1] = true;

    const getDistance = (p, lineStart, lineEnd) => {
        if (lineStart[0] === lineEnd[0] && lineStart[1] === lineEnd[1]) {
            return Math.hypot(p[0] - lineStart[0], p[1] - lineStart[1]);
        }
        const numerator = Math.abs(
            (lineEnd[1] - lineStart[1]) * p[0] -
            (lineEnd[0] - lineStart[0]) * p[1] +
            lineEnd[0] * lineStart[1] -
            lineEnd[1] * lineStart[0]
        );
        const denominator = Math.hypot(lineEnd[1] - lineStart[1], lineEnd[0] - lineStart[0]);
        return numerator / denominator;
    };

    while (stack.length > 0) {
        const [startIdx, endIdx] = stack.pop();
        let maxDist = 0;
        let maxIdx = -1;

        for (let i = startIdx + 1; i < endIdx; i++) {
            const dist = getDistance(points[i], points[startIdx], points[endIdx]);
            if (dist > maxDist) {
                maxDist = dist;
                maxIdx = i;
            }
        }

        if (maxDist > epsilon) {
            keep[maxIdx] = true;
            stack.push([startIdx, maxIdx], [maxIdx, endIdx]);
        }
    }

    return points.filter((_, idx) => keep[idx]);
}

/**
 * 计算两点间距离（Haversine 公式）
 * @param {number} lat1
 * @param {number} lon1
 * @param {number} lat2
 * @param {number} lon2
 * @returns {number} 距离（米）
 */
export function calcDistanceBetween(lat1, lon1, lat2, lon2) {
    const rad = Math.PI / 180;
    const R = 6371000;
    const rlat1 = lat1 * rad;
    const rlat2 = lat2 * rad;
    const sinDLat = Math.sin((lat2 - lat1) * rad / 2);
    const sinDLon = Math.sin((lon2 - lon1) * rad / 2);
    const a = sinDLat * sinDLat + Math.cos(rlat1) * Math.cos(rlat2) * sinDLon * sinDLon;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

/**
 * 计算方位角
 * @param {number} lat1
 * @param {number} lon1
 * @param {number} lat2
 * @param {number} lon2
 * @returns {number} 方位角（0-360度）
 */
export function calcAzimuth(lat1, lon1, lat2, lon2) {
    const lat1r = lat1 * Math.PI / 180;
    const lon1r = lon1 * Math.PI / 180;
    const lat2r = lat2 * Math.PI / 180;
    const lon2r = lon2 * Math.PI / 180;

    const deltaLambda = lon2r - lon1r;
    const y = Math.sin(deltaLambda) * Math.cos(lat2r);
    const x = Math.cos(lat1r) * Math.sin(lat2r) - Math.sin(lat1r) * Math.cos(lat2r) * Math.cos(deltaLambda);
    const thetaRad = Math.atan2(y, x);

    return Math.round((thetaRad * 180 / Math.PI + 360) % 360);
}

/**
 * 地理坐标转画布坐标
 * @param {Array} trkptData - 轨迹点数组
 * @param {number} canvasWidth
 * @param {number} canvasHeight
 * @returns {Array} 扁平坐标数组 [x,y,x,y,...]
 */
export function geoToCanvasPoints(trkptData, canvasWidth = 600, canvasHeight = 600) {
    let minLon = Infinity, maxLon = -Infinity;
    let minLat = Infinity, maxLat = -Infinity;

    trkptData.forEach(point => {
        minLon = Math.min(minLon, point.position_long);
        maxLon = Math.max(maxLon, point.position_long);
        minLat = Math.min(minLat, point.position_lat);
        maxLat = Math.max(maxLat, point.position_lat);
    });

    const lonSpan = maxLon - minLon || 1;
    const latSpan = maxLat - minLat || 1;
    const geoRatio = lonSpan / latSpan;
    const canvasRatio = canvasWidth / canvasHeight;
    const scale = geoRatio > canvasRatio ? canvasWidth / lonSpan : canvasHeight / latSpan;

    const contentWidth = lonSpan * scale;
    const contentHeight = latSpan * scale;
    const offsetX = (canvasWidth - contentWidth) / 2;
    const offsetY = (canvasHeight - contentHeight) / 2;

    const points = [];
    trkptData.forEach(point => {
        const x = offsetX + (point.position_long - minLon) * scale;
        const y = offsetY + (maxLat - point.position_lat) * scale;
        points.push(x, y);
    });

    return points;
}
