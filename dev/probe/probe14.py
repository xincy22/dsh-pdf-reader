
import sys, io, os, glob, shutil, tempfile
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
import pymupdf

src = glob.glob(os.path.join(tempfile.gettempdir(), "*", "ours-p*.png"))
# probe13 的临时目录已随进程结束消失，重新生成到固定位置
path = sys.argv[1] if len(sys.argv) > 1 else "sample.pdf"
doc = pymupdf.open(path)
outdir = sys.argv[2] if len(sys.argv) > 2 else "out"
os.makedirs(outdir, exist_ok=True)

def fig_regions(page):
    boxes = []
    for d in page.get_drawings():
        r = pymupdf.Rect(d["rect"])
        if r.width > 1 and r.height > 1: boxes.append(r)
    for i in page.get_image_info(): boxes.append(pymupdf.Rect(i["bbox"]))
    if not boxes: return []
    boxes.sort(key=lambda r: (r.y0, r.x0))
    groups, cur = [], pymupdf.Rect(boxes[0])
    for r in boxes[1:]:
        m = cur | r
        if r.y0 - cur.y1 <= 12 and m.height < page.rect.height*0.5 and m.width < page.rect.width*0.95:
            cur = m
        else:
            groups.append(cur); cur = pymupdf.Rect(r)
    groups.append(cur)
    return [g for g in groups if (g.width*g.height) > page.rect.width*page.rect.height*0.01]

for pno in (4, 15):
    page = doc[pno]
    for i, g in enumerate(fig_regions(page)):
        clip = pymupdf.Rect(g.x0-4, g.y0-4, g.x1+4, g.y1+4)
        pix = page.get_pixmap(clip=clip, dpi=150)
        pix.save(os.path.join(outdir, "p%d_fig%d.png" % (pno+1, i)))

import pymupdf4llm
md = pymupdf4llm.to_markdown(path, pages=[4,15], write_images=True, image_path=outdir, dpi=150, force_text=True)
print("written:", sorted(os.listdir(outdir)))
