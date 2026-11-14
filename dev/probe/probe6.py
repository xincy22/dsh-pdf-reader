
import sys, io, time
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
import pymupdf, pymupdf.layout
pymupdf.layout.activate()

path = sys.argv[1] if len(sys.argv) > 1 else "sample.pdf"
doc = pymupdf.open(path)

for pno in (4, 15):
    page = doc[pno]
    t0 = time.time()
    info = page.get_layout()
    dt = time.time() - t0
    print("== page", pno+1, "layout boxes:", len(info), "in %.2fs" % dt)
    for b in info:
        klass = b[4] if len(b) > 4 else "?"
        print("   ", klass, [round(v,1) for v in b[:4]])
