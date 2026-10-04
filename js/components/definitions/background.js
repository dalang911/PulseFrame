/**
 * definitions/background.js - 背景画布组件
 */

export default {
    id: 'appv_bg_pan',
    name: 'Setup',
    category: 'background',
    icon: '',
    // 背景层：初始化时自动添加为画布最底层，不在组件选择面板中展示
    isBackground: true,
    // 锁定：不允许拖拽/缩放/旋转（editable=false 使编辑器忽略它），但点击仍可弹出设置菜单
    lockAsBackground: true,
    // 视频导出时过滤掉该层（参照老款程序 webm 逻辑），仅作预览参考背景
    excludeFromVideo: true,
    defaultConfig: {
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
        bgColor: '#000000',
        bgImageUrl: ''
    },
    dataBindings: [],
    settings: [
        { name: 'Canvas Settings', type: 'title' },
        { name: 'Canvas color', key: 'bgColor', type: 'bg_color' },
        { name: 'Background Image', key: 'bgImageUrl', type: 'bg_image' },
        { name: 'Global FontFamily', key: 'globalFontFamily', type: 'font_selector' },
        { name: 'Units & Global', type: 'title' },
        { name: 'Units', key: 'unitConfig', type: 'unit_button', buttonText: 'Configure units…' }
    ],

    build(config) {
        const children = [];
        // 背景色 Canvas
        children.push({
            tag: 'Canvas',
            width: config.width,
            height: config.height,
            fill: config.bgColor || '#000000'
        });
        // 背景图片（如果有）
        if (config.bgImageUrl) {
            children.push({
                tag: 'Image',
                url: config.bgImageUrl,
                x: 0,
                y: 0,
                width: config.width,
                height: config.height
            });
        }
        return children;
    },

    update(box, frameData, progress, ctx) {
        // 背景组件不需要每帧更新
    }
};
