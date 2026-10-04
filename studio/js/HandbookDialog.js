/**
 * studio/HandbookDialog.js - 「AI Handbook」手册弹窗
 *
 * 顶栏按钮打开，内容分三块：画布上怎么搭（大致工作流）/ 不想点界面直接写 JSON 怎么进 /
 * 术语与高频坑，末尾给 studio/doc/ALL_IN_ONE.md 的下载链接（整本手册单文件，喂给 AI 或离线读）。
 *
 * 文案是静态的（不读 spec、不拼用户输入），故无需转义；体积行靠一次 HEAD 请求现取，
 * 拿不到就留空，不影响下载本身。改手册内容请改 studio/doc/*.md 再跑 tools/build_docs_single.py。
 */

const DOC_HREF = './doc/ALL_IN_ONE.md';
const DOC_NAME = 'PulseFrame-AI-Handbook.md';
const ICONFONT_URL = 'https://www.iconfont.cn/collections';

const SKELETON = `{
  "version": 1,
  "meta": { "id": "custom_xxx_v1", "name": "My Gauge", "category": "distance",
            "icon": "", "width": 400, "height": 200 },
  "layers": [
    { "uid": "Lbg01", "name": "bg", "type": "rect", "visible": true,
      "props": { "x": 0, "y": 0, "width": 400, "height": 200,
                 "fill": "#23232e", "cornerRadius": 12, "rotation": 0, "opacity": 1 },
      "bindings": {} },
    { "uid": "Lnum1", "name": "km", "type": "text", "visible": true,
      "props": { "x": 24, "y": 52, "text": "0.00 Km", "fontSize": 34,
                 "fill": "#ffffff", "rotation": 0, "opacity": 1 },
      "bindings": { "text": { "mode": "text", "field": "km", "decimal": 2, "suffix": " Km" } } }
  ]
}`;

class HandbookDialog {
    constructor() { this._modal = null; }

    _ensure() {
        if (this._modal) return this._modal;
        const m = document.createElement('div');
        m.className = 'sp-modal';
        m.innerHTML = `
            <div class="sp-modal-content sp-doc-modal">
                <div class="sp-modal-head">
                    <h3>AI Handbook · authoring a component</h3>
                    <button class="sp-modal-x" data-close>&times;</button>
                </div>
                <div class="sp-modal-body">
                    <p class="sp-doc-lede">What you build here is a <b>Component Spec</b> — one JSON object
                    (<code>meta</code> + <code>layers</code>). The main editor renders it with Leafer and drives it
                    with live track data. Click it together on the canvas, or write the JSON yourself: both roads
                    end in the same file.</p>

                    <h4>1 · Build it on the canvas</h4>
                    <ol class="sp-doc-steps">
                        <li><b>Top bar</b> — <code>Name</code>, <code>Category</code>, <code>Width</code> × <code>Height</code>
                            (that is the design box: every coordinate stays inside it, never pre-scale for display)
                            and <code>ID</code> (<code>custom_…</code>, only <code>A-Za-z0-9_</code>).</li>
                        <li><b>Elements</b> — insert <code>Rect / Ellipse / Arc / Line / Text / SVG Icon / Group</code>,
                            or drop a ready-made block. <b>SVG Icon</b> lands a placeholder triangle: select it and paste
                            the real code in <b>Properties → SVG code</b> (max 10 KB; grab code from
                            <a href="${ICONFONT_URL}" target="_blank" rel="noopener noreferrer">iconfont.cn · collections</a>).</li>
                        <li><b>Properties</b> — position, size, fill/stroke, corner radius, rotation, opacity.</li>
                        <li><b>Data Binding</b> — pick the property, choose a <em>mode</em> and a data <em>field</em>
                            (with <code>min</code>/<code>max</code> for <code>size</code>/<code>angle</code>), then hit
                            <b>▶</b> in the Data Preview bar to watch it move frame by frame.</li>
                        <li><b>Output</b> — <b>Export JSON</b> (copy the spec out), <b>Save Local</b> (this browser only,
                            shows up instantly), or <b>Submit to Library</b> (admin review; publishing hands it to the public).</li>
                    </ol>

                    <h4>2 · Or skip the GUI</h4>
                    <p>Write the JSON (or let an assistant write it) and use <b>Open JSON → Validate &amp; Import</b>.
                    Nothing touches the canvas until validation passes, so pasting is safe. The same checker runs on
                    Submit, plus three upload-only hard rules: non-empty <code>meta.id</code>, <code>id</code> matching
                    <code>^[A-Za-z0-9_]+$</code>, and a non-empty <code>layers</code> array.</p>
                    <pre class="sp-doc-code" spellcheck="false">${SKELETON}</pre>

                    <h4>3 · The vocabulary</h4>
                    <p class="sp-doc-flat"><b>types</b> <code>rect</code> <code>ellipse</code> <code>arc</code>
                    <code>line</code> <code>text</code> <code>svg</code> <code>group</code> are insertable here;
                    <code>image</code> stays for old specs, <code>path</code>/<code>polygon</code> pass through from
                    imported dashboards. <b>modes</b> <code>text</code> <code>size</code> <code>angle</code>
                    <code>color</code> <code>opacity</code> <code>visible</code>. <b>fields</b> e.g.
                    <code>distance</code> <code>speed</code> <code>heart_rate</code> <code>power</code> <code>cadence</code>,
                    derived <code>km</code> <code>pace</code> <code>pct</code> <code>hrPct</code>, text-only
                    <code>elapsedTime</code> <code>totalTime</code>.</p>

                    <h4>4 · The traps worth memorising</h4>
                    <ul class="sp-doc-traps">
                        <li><code>arc</code> needs explicit <code>"closed": false</code>, otherwise it renders as a
                            closed sector and <code>strokeCap: "round"</code> silently dies.</li>
                        <li>Binding <code>rotation</code> with <code>angle</code> requires <code>from</code>/<code>to</code>,
                            else it falls back to the wrong <code>-210</code>/<code>30</code>.</li>
                        <li>For pace bounds use <code>paceBoundMin</code>/<code>paceBoundMax</code> —
                            <code>paceMin</code>/<code>paceMax</code> are speed extremes in km/h.</li>
                        <li>A <code>size</code>-bound property must be written at <b>full scale</b> in
                            <code>props</code> (a progress bar's width = the whole bar, not the current fill).</li>
                        <li><code>uid</code> is unique across the whole spec (nested groups included), and only
                            <code>group</code> may carry <code>children</code>. Hand-written <code>svg</code> needs
                            <code>xmlns</code> on its root.</li>
                    </ul>

                    <h4>5 · The whole manual</h4>
                    <p>Schema, binding rules, the field catalogue, workflow, copy-paste JSON examples and a
                    self-check list — all merged into one Markdown file. Feed it to an assistant, or read it offline.</p>
                    <p class="sp-doc-dlrow">
                        <a class="sp-doc-dl" href="${DOC_HREF}" download="${DOC_NAME}">Download ALL_IN_ONE.md</a>
                        <span class="sp-doc-size" id="spDocSize"></span>
                        <a class="sp-doc-alt" href="${DOC_HREF}" target="_blank" rel="noopener noreferrer">open in a new tab</a>
                    </p>
                </div>
                <div class="sp-modal-foot">
                    <span class="sp-doc-src">source of truth: <code>studio/doc/*.md</code></span>
                    <button class="sp-btn sp-btn-primary" data-close>Close</button>
                </div>
            </div>`;
        document.body.appendChild(m);
        m.addEventListener('click', (e) => { if (e.target === m || e.target.closest('[data-close]')) this._close(); });
        this._modal = m;
        return m;
    }

    open() {
        const m = this._ensure();
        m.classList.add('show');
        m.querySelector('.sp-modal-body').scrollTop = 0;
        this._fillSize();
    }

    _close() { if (this._modal) this._modal.classList.remove('show'); }

    /** 给下载链接补个当前体积；手册没部署到这个路径时直接说破（studio/doc/ 靠静态文件落地，不在构建产物里） */
    async _fillSize() {
        const el = this._modal && this._modal.querySelector('#spDocSize');
        if (!el || el.dataset.done) return;
        el.dataset.done = '1';
        try {
            const res = await fetch(DOC_HREF, { method: 'HEAD' });
            if (!res.ok) {
                el.textContent = 'manual not deployed at ' + DOC_HREF + ' (status ' + res.status + ')';
                el.classList.add('err');
                return;
            }
            const b = parseInt(res.headers.get('content-length') || '0', 10);
            if (b > 0) el.textContent = b < 1024 * 1024 ? (b / 1024).toFixed(1) + ' KB' : (b / 1024 / 1024).toFixed(2) + ' MB';
        } catch (e) { /* 拉不到就不显示体积，下载本身不受影响 */ }
    }
}

export const handbookDialog = new HandbookDialog();
