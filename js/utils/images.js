/**
 * utils/images.js - 图片相关的共用工具
 *
 * 组件设置里的「头像 / 自定义图标」都用这里的东西：
 *   - AVATAR_PRESETS：仓库自带的 4 张方形头像，供 image_picker 点选
 *   - imageToSquareDataUrl()：把用户本地选的图直接拉伸成 1:1 正方形再内嵌
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
