/**
 * utils/images.js - 图片相关的共用工具
 *
 * 组件设置里的「头像 / 自定义图标」都用这里的东西：
 *   - AVATAR_PRESETS：仓库自带的 4 张方形头像，供 image_picker 点选
 *   - imageToSquareDataUrl()：把用户本地选的图直接拉伸成 1:1 正方形再内嵌
 * 商店封面的截图也在这里：
 *   - canvasToCoverDataUrl()：把画布等比缩到长边 ≤480 再出 JPEG，只降分辨率，
 *     不改质量参数、不裁切、不填背景 —— 提交链路见 TemplateManager._generateThumbnail()
 *   - coverCropRect() / cropCanvasToCoverDataUrl()：先按 CSS 坐标裁一块再走上面那条缩放
 *     —— Studio 提交的组件只占画布一角，见 studio/js/StudioCanvas.js#snapshotCoverDataUrl
 *
 * 为什么拉伸而不是裁切：头像是被圆角裁成圆形的，非正方形原图直接拉伸最直观
 * （整张脸都在），而居中裁切会切掉画面边缘，用户难以预期结果。
 * 上传后一律转成 dataURL 存进组件 config，模板保存/导出视频时不再依赖外部文件。
 */

/** 仓库内置头像预设（注意实际扩展名：i1 是 jpg，i2/i3/i4 是 png） */
export const AVATAR_PRESETS = [
    { url: './icon/i1.jpg', name: 'i1' },
    { url: './icon/i2.png', name: 'i2' },
    { url: './icon/i3.png', name: 'i3' },
    { url: './icon/i4.png', name: 'i4' }
];

/** 按 URL 找预设名（用于面板回显「当前用的是哪一张」） */
export function presetNameOf(url, presets = AVATAR_PRESETS) {
    const hit = presets.find(p => p.url === url);
    return hit ? hit.name : null;
}

/**
 * 读本地图片 → 拉伸为 1:1 正方形 → dataURL
 * @param {File} file - input[type=file] 选中的图片
 * @param {number} [size=256] - 输出边长（像素）；头像在画布上只有几十像素，256 足够清晰又不至于把模板撑爆
 * @returns {Promise<string>} image/png 的 dataURL
 */
export function imageToSquareDataUrl(file, size = 256) {
    return new Promise((resolve, reject) => {
        if (!file || !/^image\//.test(file.type || '')) {
            reject(new Error('请选择图片文件'));
            return;
        }
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('文件读取失败'));
        reader.onload = (ev) => {
            const img = new Image();
            img.onerror = () => reject(new Error('图片解码失败（格式可能不受浏览器支持）'));
            img.onload = () => {
                try {
                    const canvas = document.createElement('canvas');
                    canvas.width = size;
                    canvas.height = size;
                    const ctx = canvas.getContext('2d');
                    // 不按原图比例，直接铺满正方形 = 拉伸
                    ctx.drawImage(img, 0, 0, size, size);
                    resolve(canvas.toDataURL('image/png'));
                } catch (err) {
                    reject(new Error('图片转换失败：' + err.message));
                }
            };
            img.src = ev.target.result;
        };
        reader.readAsDataURL(file);
    });
}

/** 商店封面长边上限（像素）。卡片位只有 80×60，详情弹窗限高 300，480 已够 1:1 显示 */
export const COVER_MAX_EDGE = 480;

/**
 * 纯计算：等比缩放后的目标尺寸（无 DOM，便于单独验证）
 * 规则：长边 > maxEdge 才缩；已经够小的一律原样返回（绝不放大）。
 * @param {number} w 源宽（画布背板像素，不是 CSS 像素）
 * @param {number} h 源高
 * @param {number} [maxEdge=COVER_MAX_EDGE]
 * @returns {{w:number,h:number,scaled:boolean,edge:number}}  scaled=false 表示沿用源尺寸
 */
export function coverTargetSize(w, h, maxEdge = COVER_MAX_EDGE) {
    const sw = Math.floor(Number(w) || 0);
    const sh = Math.floor(Number(h) || 0);
    const edge = Math.floor(Number(maxEdge) || 0);
    const long = Math.max(sw, sh);
    if (sw <= 0 || sh <= 0 || edge <= 0 || long <= edge || long <= 1) {
        return { w: sw, h: sh, scaled: false, edge: long };
    }
    const scale = edge / long;
    // 至少留 1 像素：极扁的画布（如 4000×8）按浮点算会得到 0 高，缩出来就是一张空图
    return {
        w: Math.max(1, Math.round(sw * scale)),
        h: Math.max(1, Math.round(sh * scale)),
        scaled: true,
        edge: long,
    };
}

/**
 * 画布 → 等比缩小后的商店封面 dataURL
 *
 * 与升级前 `canvas.toDataURL('image/jpeg', 0.5)` 的唯一区别是分辨率：
 * 质量参数、mime、色彩合成都没动（JPEG 无 alpha，浏览器按既有行为把透明区合成成黑底，
 * 这里不额外填色，免得观感变白底）。源画本就不超标时直接走原调用，输出逐字节相同。
 *
 * @param {HTMLCanvasElement} canvas 源画布（一般是 #appv 的第一张 canvas）
 * @param {{maxEdge?:number, quality?:number, mime?:string}} [opts]
 * @returns {string} dataURL；源画布不合法时返回 ''
 */
export function canvasToCoverDataUrl(canvas, opts = {}) {
    const maxEdge = opts.maxEdge ?? COVER_MAX_EDGE;
    const quality = opts.quality ?? 0.5;      // 与升级前写死的 0.5 保持一致
    const mime = opts.mime ?? 'image/jpeg';
    if (!canvas || typeof canvas.toDataURL !== 'function') return '';

    const t = coverTargetSize(canvas.width, canvas.height, maxEdge);
    if (!t.scaled || !t.w || !t.h) return canvas.toDataURL(mime, quality);

    // 超过 2 倍的一次性缩小会明显走样，逐级对半缩到目标尺寸附近再最后一笔
    let srcCanvas = canvas;
    let srcW = canvas.width, srcH = canvas.height;
    while (srcW / 2 >= t.w && srcH / 2 >= t.h) {
        const half = document.createElement('canvas');
        half.width = Math.max(1, Math.round(srcW / 2));
        half.height = Math.max(1, Math.round(srcH / 2));
        const hctx = half.getContext('2d');
        hctx.imageSmoothingEnabled = true;
        hctx.imageSmoothingQuality = 'high';
        hctx.drawImage(srcCanvas, 0, 0, half.width, half.height);
        srcCanvas = half; srcW = half.width; srcH = half.height;
    }

    const out = document.createElement('canvas');
    out.width = t.w;
    out.height = t.h;
    const ctx = out.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(srcCanvas, 0, 0, t.w, t.h);
    return out.toDataURL(mime, quality);
}

/**
 * 纯计算：把「CSS 像素下的裁剪框」换算成源画布的背板像素矩形（无 DOM，便于单独验证）
 *
 * 为什么要有这一步：Leafer / 浏览器按 devicePixelRatio 建画布，画布的 width 是背板像素、
 * 不是 CSS 像素，直接用屏幕坐标去 drawImage 会错位（DPR=2 时只截到左上四分之一）。
 * 越界按「交集」处理：负坐标不是把窗口整体挪进画布，而是把伸出去的那截丢掉（x=-50,w=200
 * 只取到宽 150），否则封面会多带上一段本来不在框里的内容。
 * @param {number} canvasWidth 源画布背板宽（canvas.width）
 * @param {number} canvasHeight 源画布背板高（canvas.height）
 * @param {number} cssWidth 源画布的 CSS 宽（画布自己认为的坐标系宽度）
 * @param {{x:number,y:number,w:number,h:number}} rect CSS 坐标系里的裁剪框
 * @returns {{sx:number,sy:number,sw:number,sh:number,ratio:number}|null} 交集不足 1px 返回 null
 */
export function coverCropRect(canvasWidth, canvasHeight, cssWidth, rect) {
    const cw = Math.floor(Number(canvasWidth) || 0);
    const ch = Math.floor(Number(canvasHeight) || 0);
    const vw = Number(cssWidth) || 0;
    if (cw <= 0 || ch <= 0 || vw <= 0 || !rect) return null;
    const ratio = cw / vw;                       // 背板像素 / CSS 像素，即这台设备的 DPR
    const sx = Math.max(0, Math.floor((Number(rect.x) || 0) * ratio));
    const sy = Math.max(0, Math.floor((Number(rect.y) || 0) * ratio));
    const sw = Math.max(0, Math.min(cw, Math.round(((Number(rect.x) || 0) + (Number(rect.w) || 0)) * ratio))) - sx;
    const sh = Math.max(0, Math.min(ch, Math.round(((Number(rect.y) || 0) + (Number(rect.h) || 0)) * ratio))) - sy;
    if (sw < 1 || sh < 1) return null;
    return { sx, sy, sw, sh, ratio };
}

/**
 * 从画布里裁一块，再等比缩到长边 ≤480 出商店封面
 *
 * 给「组件只占画布一角」的场合用（Studio 提交：画布四周是留白，整截会把组件稀释没）。
 * 缩放、质量、mime 全部沿用 canvasToCoverDataUrl，两条提交链路的封面口径保持一致。
 * @param {HTMLCanvasElement} canvas 源画布
 * @param {{x:number,y:number,w:number,h:number}} rect CSS 坐标系里的裁剪框
 * @param {number} cssWidth 源画布的 CSS 宽
 * @param {{maxEdge?:number, quality?:number, mime?:string}} [opts] 透传给 canvasToCoverDataUrl
 * @returns {string} dataURL；裁剪框不合法时返回 ''
 */
export function cropCanvasToCoverDataUrl(canvas, rect, cssWidth, opts = {}) {
    if (!canvas || typeof canvas.toDataURL !== 'function') return '';
    const crop = coverCropRect(canvas.width, canvas.height, cssWidth, rect);
    if (!crop) return '';
    const out = document.createElement('canvas');
    out.width = crop.sw;
    out.height = crop.sh;
    const ctx = out.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(canvas, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, crop.sw, crop.sh);
    return canvasToCoverDataUrl(out, opts);
}
