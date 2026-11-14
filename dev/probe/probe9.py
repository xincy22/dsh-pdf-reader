
import sys, io, time
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
import pymupdf

path = sys.argv[1] if len(sys.argv) > 1 else "sample.pdf"
doc = pymupdf.open(path)

for pno in (4, 15):
    page = doc[pno]
    print("=== page", pno+1)
    t0 = time.time()
    clusters = page.cluster_drawings()
    print("  cluster_drawings: %d rects, %.3fs" % (len(clusters), time.time()-t0))
    for c in clusters:
        print("    ", [round(v,1) for v in (c.x0,c.y0,c.x1,c.y1)], "area_ratio", round((c.x1-c.x0)*(c.y1-c.y0)/(page.rect.width*page.rect.height),3))
    infos = page.get_image_info()
    print("  get_image_info: %d" % len(infos))
    for i in infos:
        r = pymupdf.Rect(i["bbox"])
        print("    ", [round(v,1) for v in (r.x0,r.y0,r.x1,r.y1)], "px", i["width"], i["height"])
