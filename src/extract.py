#!/usr/bin/env python3
"""extract.py — PDF → Markdown（文本 + 图），图按页面顺序内联。

为什么只有这一个函数：pymupdf4llm 已经把「找图、裁切、OCR 图内文字」都做好了。
我们要做的只是把它的结果翻译成工具能返回的形状。

协议：stdin 收一个 JSON 参数对象，stdout 回一个 JSON 结果。
  in : {"path": "...", "pages": "5,16", "dpi": 200, "withImages": true}
  out: {"markdown": "...", "images": [{"path": "...", "name": "..."}], "pageCount": 61, "pages": "5,16"}
"""
import sys, os, json, tempfile, re

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

def emit(obj):
    sys.stdout.write(json.dumps(obj, ensure_ascii=False))
    sys.stdout.flush()

def parse_pages(spec, page_count):
    """'5' / '5,16' / '5-9' / None → 1-based 页码列表"""
    if not spec:
        return list(range(1, min(page_count, 10) + 1))
    spec = str(spec).strip()
    out = []
    for part in spec.split(","):
        part = part.strip()
        if not part:
            continue
        try:
            if "-" in part:
                a, b = part.split("-")[:2]
                lo, hi = int(a), int(b)
                if lo > hi:
                    raise ValueError("range %s runs backwards" % part)
                out.extend(range(lo, hi + 1))
            else:
                out.append(int(part))
        except ValueError as e:
            raise ValueError("bad pages expression %r (%s); use \"5\", \"5,16\" or \"5-9\"" % (spec, e))
    return out

IMG_REF = re.compile(r"!\[[^\]]*\]\(([^)]+)\)")

PIC_START = "<!-- Start of picture text -->"
PIC_END = "<!-- End of picture text -->"

def split_picture_text(text):
    """把「图内文字」段单独拆成一个 text 块，并标上 role=figure_text。

    pymupdf4llm 会在图片引用**之后**输出一段 <br> 连接的 OCR 文字，
    用 PIC_START / PIC_END 包着。它描述的是**那张图本身的内容**，
    和正文混在一个块里，模型就会把图的标注当成正文句子读。
    拆出来后紧跟在图后面，语义才对得上。
    """
    out = []
    rest = text
    while True:
        i = rest.find(PIC_START)
        if i < 0:
            if rest.strip():
                out.append({"type": "text", "text": rest.strip()})
            break
        before = rest[:i].strip()
        if before:
            out.append({"type": "text", "text": before})
        j = rest.find(PIC_END, i)
        if j < 0:
            body = rest[i + len(PIC_START):]
            after = ""
        else:
            body = rest[i + len(PIC_START):j]
            after = rest[j + len(PIC_END):]
        body = body.replace("<br>", "\n").strip()
        if body:
            out.append({"type": "text", "role": "figure_text", "text": "[该图内的文字]\n" + body})
        rest = after
    return out

def split_blocks(markdown, images):
    """把 markdown 按图片引用的位置切开，返回阅读顺序的 blocks。

    pymupdf4llm 把图输出成 ![](path)，位置就在图上出现的那个地方。
    我们按引用位置切段：文本 → 图 → 文本 → 图 ……，
    这样图不会全堆在末尾，而是落在它本来该在的位置。
    """
    by_path = {}
    for img in images:
        by_path[os.path.normcase(os.path.abspath(img["path"])).replace("\\", "/")] = img
        by_path[os.path.normcase(img["name"]).lower()] = img

    blocks = []
    cursor = 0
    consumed = set()

    for m in IMG_REF.finditer(markdown):
        ref = m.group(1)
        key = os.path.normcase(os.path.abspath(ref)).replace("\\", "/")
        img = by_path.get(key) or by_path.get(os.path.normcase(os.path.basename(ref)).lower())
        if img is None:
            continue  # 认不出是哪张图，保留原文不动

        before = markdown[cursor:m.start()].strip()
        if before:
            blocks.extend(split_picture_text(before))
        blocks.append({"type": "image", "name": img["name"], "path": img["path"]})
        consumed.add(img["name"])
        cursor = m.end()

    tail = markdown[cursor:].strip()
    if tail:
        blocks.extend(split_picture_text(tail))

    # 没被 markdown 引用的图（少见）补到末尾，不丢
    leftovers = [i for i in images if i["name"] not in consumed]
    for img in leftovers:
        blocks.append({"type": "image", "name": img["name"], "path": img["path"]})

    return blocks

def main():
    # 参数从 argv[1] 指定的 UTF-8 JSON 文件读，而不是 stdin：
    # Windows 上 PowerShell 管道按 GBK 传输，中文路径会被打散成乱码。
    try:
        if len(sys.argv) > 1 and os.path.exists(sys.argv[1]):
            with open(sys.argv[1], "r", encoding="utf-8") as fh:
                args = json.load(fh)
        else:
            args = json.loads(sys.stdin.read() or "{}")
    except Exception as e:
        emit({"error": "bad arguments: %s" % e})
        return 2

    path = args.get("path")
    if not path or not os.path.exists(path):
        emit({"error": "file not found: %s" % path})
        return 2

    try:
        import pymupdf
        import pymupdf4llm
    except Exception as e:
        emit({"error": "pymupdf4llm is not installed in this Python: %s" % e})
        return 2

    try:
        doc = pymupdf.open(path)
        page_count = doc.page_count
        doc.close()
    except Exception as e:
        emit({"error": "cannot open PDF: %s" % e})
        return 2

    try:
        pages = parse_pages(args.get("pages"), page_count)
    except ValueError as e:
        emit({"error": str(e)})
        return 2
    bad = [p for p in pages if p < 1 or p > page_count]
    if bad:
        emit({"error": "page out of range: %s (document has %d pages)" % (bad, page_count)})
        return 2

    dpi = args.get("dpi") or 200
    with_images = bool(args.get("withImages", True))
    image_dir = tempfile.mkdtemp(prefix="dsh-pdf-")

    try:
        md = pymupdf4llm.to_markdown(
            path,
            pages=[p - 1 for p in pages],   # 0-based
            write_images=with_images,
            image_path=image_dir if with_images else None,
            dpi=dpi,
            show_progress=False,
        )
    except TypeError:
        # 老版本不接受某些关键字，退回最小参数
        md = pymupdf4llm.to_markdown(
            path,
            pages=[p - 1 for p in pages],
            write_images=with_images,
            image_path=image_dir if with_images else None,
            dpi=dpi,
        )
    except Exception as e:
        emit({"error": "pymupdf4llm failed: %s" % e})
        return 2

    images = []
    if with_images and os.path.isdir(image_dir):
        for name in sorted(os.listdir(image_dir)):
            fp = os.path.join(image_dir, name)
            if os.path.isfile(fp):
                images.append({"path": fp, "name": name})

    blocks = split_blocks(md, images) if with_images else [{"type": "text", "text": md}]

    emit({
        "blocks": blocks,
        "markdown": md,
        "images": images,
        "imageDir": image_dir,
        "pageCount": page_count,
        "pages": ",".join(str(p) for p in pages),
    })
    return 0

if __name__ == "__main__":
    sys.exit(main())
