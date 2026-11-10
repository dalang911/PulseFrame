/**
 * insertPlacement.js - 组件默认落点的「相对化」换算
 *
 * defaultConfig 里的 x/y 是按 1920×1080 设计稿写的绝对坐标。画布分辨率现在可以自定义
 * （Ratio 旁的「Custom」），同一套坐标搬到别的尺寸上就会把组件推到画布外：实测
 * 1080×1920 有 15 个完全看不见、640×360 有 40 个。
 *
 * 换算规则（画布正好是 1920×1080 时三个因子全是 1，逐项恒等，默认观感不变）：
 *   位置  x = 设计x × 画布宽/1920，y = 设计y × 画布高/1080
 *         ——横竖各按自己的轴缩放，组件之间「铺开」的比例关系原样保留，
 *           所以不会出现全部挤在一处的情况。
 *   尺寸  宽和高同乘 min(横向比, 纵向比)
 *         ——只等比缩放，内容不被拉变形；小画布上放不下时也不会溢出。
 *   收口  按旋转后的实际包围盒把整框钳回画布内（Leafer 绕 Box 的 x/y 顶点旋转，
 *         竖排标尺 zs8_distance_pan 的 -90° 会让包围盒从顶点往上/左延伸）
 *
 * 调用方显式给了 x 或 y（载入模板、移除后恢复、属性面板改坐标）时不做换算，
 * 那些位置已经是「在当前画布上定好的」，再搬一次会把用户的布局改掉。
 */

export const DESIGN_CANVAS = { width: 1920, height: 1080 };

/**
 * Box 旋转后的轴对齐包围盒，坐标以 Box 的 x/y（旋转原点）为基准。
 * @param {number} width
 * @param {number} height
 * @param {number} [rotation] 度，顺时针为正（与 Leafer 一致）
 * @returns {{x:number,y:number,w:number,h:number}} x/y 可为负：包围盒从顶点往上看/往左看
 */
export function localAABB(width, height, rotation = 0) {
    const w = Number(width) || 0;
    const h = Number(height) || 0;
    if (!rotation) return { x: 0, y: 0, w, h };
    const rad = rotation * Math.PI / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const corners = [[0, 0], [w, 0], [w, h], [0, h]]
        .map(([px, py]) => [px * cos - py * sin, px * sin + py * cos]);
    const xs = corners.map(p => p[0]);
    const ys = corners.map(p => p[1]);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/**
 * 把设计稿落点换算成当前画布上的落点。
 * @param {{x:number,y:number,width:number,height:number,rotation?:number}} design
 *        设计空间（1920×1080）里的位置与尺寸；尺寸要传「设计尺寸」，
 *        声明了 designSize(config) 的组件（折线图按 ratio 变宽）要先算好再传进来
 * @param {{width:number,height:number}} canvasSize 当前画布尺寸
 * @returns {{x:number,y:number,width:number,height:number}|null} null = 尺寸不可用，照原样落点
 */
export function relativeInsert(design, canvasSize) {
    const W = Math.round(Number(canvasSize && canvasSize.width));
    const H = Math.round(Number(canvasSize && canvasSize.height));
    if (!Number.isFinite(W) || !Number.isFinite(H) || W <= 0 || H <= 0) return null;

    const sx = W / DESIGN_CANVAS.width;
    const sy = H / DESIGN_CANVAS.height;
    // 等比因子取两轴里小的那个：内置组件的占位（含旋转后的包围盒）都不超过 1920×1080，
    // 所以缩放后必然装得进画布，后面的钳制区间一定是下界 ≤ 上界（校验页把这两点都断言了）。
    // 不在这里再压一层「装得下」：Studio 里画了个比画布还高的自定义组件是它自身的尺寸问题，
    // 顺手缩它会改掉 1920×1080 上的默认观感（实测 custom_mvq3xb1t 1840x1376 -> 1444x1080）。
    const k = Math.min(sx, sy);
    const width = Math.max(1, Math.round((Number(design.width) || 0) * k));
    const height = Math.max(1, Math.round((Number(design.height) || 0) * k));

    const box = localAABB(width, height, design.rotation || 0);
    const loX = -box.x, hiX = W - (box.x + box.w);
    const loY = -box.y, hiY = H - (box.y + box.h);

    return {
        x: clamp(design.x * sx, loX, hiX),
        y: clamp(design.y * sy, loY, hiY),
        width,
        height
    };
}

/** 下界大于上界时（组件本身比画布还大）取下界：左上角留在原点，往右下溢出，与设计稿一致 */
function clamp(value, lo, hi) {
    if (lo > hi) return lo;
    const v = Number(value);
    if (!Number.isFinite(v)) return lo;
    return Math.min(hi, Math.max(lo, v));
}

export default { DESIGN_CANVAS, localAABB, relativeInsert };
