
import sys, io, time
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
import pymupdf

path = sys.argv[1] if len(sys.argv) > 1 else "sample.pdf"
doc = pymupdf.open(path)

# 裸 PyMuPDF 自建版面：文本块 + 图形墨迹 + 位图，按 y 聚类成"内容带"
def bands(page, gap=6.0):
    rects = []
    for b in page.get_text("blocks"):
        if b[6] == 0:                      # 文本块
            rects.append(pymupdf.Rect(b[:4]))
    for d in page.get_drawings():
        rects.append(d["rect"])
    for i in page.get_image_info():
        rects.append(pymupdf.Rect(i["bbox"]))
    if not rects: return []
    rects.sort(key=lambda r: r.y0)
    out = []
    cur = pymupdf.Rect(rects[0])
    for r in rects[1:]:
        merged = cur | r
        if r.y0 - cur.y1 <= gap and merged.height < page.rect.height * 0.55:
            cur = merged
        else:
            out.append(cur); cur = pymupdf.Rect(r)
    out.append(cur)
    return out

for pno in (4, 15):
    page = doc[pno]
    t0 = time.time()
    bs = bands(page)
    print("== page", pno+1, "bands:", len(bs), "%.3fs" % (time.time()-t0))
    for b in bs:
        ratio = (b.x1-b.x0)*(b.y1-b.y0)/(page.rect.width*page.rect.height)
        txt = page.get_text("text", clip=b)[:40].replace("\n"," ")
        print("   ", [round(v,1) for v in (b.x0,b.y0,b.x1,b.y1)], "h=%.0f" % b.height, "area=%.2f" % ratio, "|", txt)
