#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把 studio/doc 的分篇 AI 手册合并成单文件 ALL_IN_ONE.md。

用法：
    python3 tools/build_docs_single.py            # 生成/更新 ALL_IN_ONE.md
    python3 tools/build_docs_single.py --check    # 只检查是否已同步（防漂移，不一致则退出码 1）

为什么需要它：分篇文件服务"按需检索"（agent / RAG 切片），单文件服务"一次读完"
（贴进对话窗口或 system prompt）。两边内容靠本脚本保持同源，不要手改产物。
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
DOC = ROOT / 'studio' / 'doc'
OUT = DOC / 'ALL_IN_ONE.md'

# (源文件, 单文件里用于替代跨文件链接的章节名)；顺序即合并顺序
SECTIONS = [
    ('00_cheatsheet.md', '\u00a700 速查内核'),
    ('README.md', '\u00a7 手册总览'),
    ('01_spec_schema.md', '\u00a701 JSON 结构'),
    ('02_bindings.md', '\u00a702 数据绑定'),
    ('03_fields.md', '\u00a703 字段与边界'),
    ('04_workflow.md', '\u00a704 工作机制'),
    ('05_examples.md', '\u00a705 完整示例'),
    ('CHECKLIST.md', '\u00a7 自检清单'),
]
ANCHOR = {name: '#part-%02d' % i for i, (name, _) in enumerate(SECTIONS)}
LABEL = dict(SECTIONS)
# 不是合并源、但确实存在于仓库的文件：链接保持原样，不算死链
KEEP_AS_IS = {'ALL_IN_ONE.md'}

FENCE = re.compile(r'^\s*```')
HEADING = re.compile(r'^(#{1,5}) (.*)$')
LINK = re.compile(r'\[([^\]]*)\]\(([\w.\-]+\.md)(#[^)]*)?\)')


def transform(src, name):
    """标题降一级（代码围栏内不动）＋ 跨文件链接改文内锚点。"""
    out, inside, rebuilt, frag_seen = [], False, 0, []
    for line in src.rstrip('\n').split('\n'):
        if FENCE.match(line):
            inside = not inside
            out.append(line)
            continue
        if inside:
            out.append(line)
            continue
        m = HEADING.match(line)
        if m:
            line = '#' + m.group(1) + ' ' + m.group(2)

        def sub(mm):
            target = mm.group(2)
            if target not in ANCHOR:
                return mm.group(0)
            if mm.group(3):
                frag_seen.append(target + mm.group(3))
            return '[%s](%s)' % (LABEL.get(target, target), ANCHOR[target])

        line, n = LINK.subn(sub, line)
        rebuilt += n
        out.append(line)
    if frag_seen:
        print('  ! %s: 跨文件带锚点的链接（已退化为章节锚点）: %s' % (name, ', '.join(frag_seen)))
    return '\n'.join(out), rebuilt


def main():
    if '--check' in sys.argv:
        existing = OUT.read_text(encoding='utf-8') if OUT.exists() else None
        generated = build()[0]
        if existing == generated:
            print('ALL_IN_ONE.md 与源文件同步。')
            return 0
        print('ALL_IN_ONE.md 已过期，请重新运行 tools/build_docs_single.py')
        return 1

    body, stats = build()
    OUT.write_text(body, encoding='utf-8')
    print('已生成 %s' % OUT)
    for name, lines, links in stats:
        print('  %-20s %4d 行  改写链接 %d 处' % (name, lines, links))
    print('  合计 %d 行 / %d 字节 (~%.1f k token)' % (
        body.count('\n') + 1, len(body.encode('utf-8')), len(body) / 3200))


def build():
    chunks, stats, residual = [], [], []
    for i, (name, title) in enumerate(SECTIONS):
        path = DOC / name
        if not path.exists():
            sys.exit('缺少源文件: %s' % path)
        text, links = transform(path.read_text(encoding='utf-8'), name)
        lines = text.count('\n') + 1
        chunks.append('<a id="part-%02d"></a>\n\n%s\n' % (i, text))
        stats.append((name, lines, links))
        # 自检：不该还有指向其它分篇的链接（那样会诱导读者去找不存在的文件）
        for mm in LINK.finditer(text):
            if mm.group(2) in KEEP_AS_IS:
                continue
            residual.append('%s: %s' % (name, mm.group(0)))

    head = [
        '# PulseFrame Studio — AI 生成手册（单文件版）',
        '',
        '> **本文件自包含**：生成合法、可在 Studio 导入并正常运行的 Component Spec JSON',
        '> 所需的全部规则都在这里，**无需读取任何其它文件或网页**。按 `§00 速查内核` → 需要细节再往下查各章。',
        '>',
        '> ⚠️ **产物文件，请勿手改**：由 `tools/build_docs_single.py` 合并 `studio/doc/` 下的',
        '> 分篇源文件自动生成。改内容请改分篇，然后跑 `python3 tools/build_docs_single.py`。',
        '> 分篇文件同时保留（按需检索/向量库切片用），两边靠脚本保持同源。',
        '',
        '## 目录',
        '',
    ]
    toc = ['- [%s](%s)' % (title, ANCHOR[name]) for name, title in SECTIONS]
    tail = [
        '',
        '---',
        '',
        '*全文结束。校验硬规则：能 `JSON.parse` + 有 `meta`（`id` 只含 `[A-Za-z0-9_]`）+ `layers` 是数组。*',
        '',
    ]
    body = '\n'.join(head + toc + [''] + ['---', ''] + ['\n---\n'.join(chunks)] + tail)
    if residual:
        print('  ! 未改写的跨文件链接:')
        for r in residual:
            print('    ' + r)
    return body, stats


if __name__ == '__main__':
    sys.exit(main())
