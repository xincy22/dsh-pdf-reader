
import sys, io, time
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
import pymupdf

path = sys.argv[1] if len(sys.argv) > 1 else "sample.pdf"
doc = pymupdf.open(path)

def fig_regions(page):
    """只靠绘图对象与位图的几何，把"图形密集区"合并成图的外框。"""
    boxes = []
    for d in page.get_drawings():
        r = pymupdf.Rect(d["rect"])
        if r.width > 1 and r.height > 1:
            boxes.append(r)
    for i in page.get_image_info():
        boxes.append(pymupdf.Rect(i["bbox"]))
    if not boxes:
        return []
    boxes.sort(key=lambda r: (r.y0, r.x0))
    groups = []
    cur = pymupdf.Rect(boxes[0])
    for r in boxes[1:]:
        m = cur | r
        # 合并条件：y 方向相接，且合并后外框不失控
        if r.y0 - cur.y1 <= 12 and m.height < page.rect.height * 0.5 and m.width < page.rect.width * 0.95:
            cur = m
        else:
            groups.append(cur); cur = pymupdf.Rect(r)
    groups.append(cur)
    # 丢掉太小的（散点、下标线）
    return [g for g in groups if (g.width*g.height) > page.rect.width*page.rect.height*0.01]

for pno in (4, 15):
    page = doc[pno]
    t0 = time.time()
    gs = fig_regions(page)
    print("== page", pno+1, "figure regions:", len(gs), "%.3fs" % (time.time()-t0))
    for g in gs:
        print("   ", [round(v,1) for v in (g.x0,g.y0,g.x1,g.y1)], "w=%.0f h=%.0f" % (g.width, g.height))
