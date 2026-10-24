/**
 * utils/images.js - 图片相关的共用工具
 *
 * 组件设置里的「头像 / 自定义图标」都用这里的东西：
 *   - AVATAR_PRESETS：仓库自带的 4 张方形头像，供 image_picker 点选
 *   - imageToSquareDataUrl()：把用户本地选的图直接拉伸成 1:1 正方形再内嵌
 * 商店封面的截图也在这里：
 *   - canvasToCoverDataUrl()：把画布等比缩到长边 ≤480 再出 JPEG，只降分辨率，
 *     不改质量参数、不裁切、不填背景 —— 提交链路见 TemplateManager._generateThumbnail()
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
