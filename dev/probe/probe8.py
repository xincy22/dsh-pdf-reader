
import sys, io, time
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
import pymupdf, pymupdf.layout
pymupdf.layout.activate()

path = sys.argv[1] if len(sys.argv) > 1 else "sample.pdf"
doc = pymupdf.open(path)
page = doc[4]
print("get_layout doc:", pymupdf.Page.get_layout.__doc__)
t0=time.time()
try:
    info = page.get_layout()
    print("type:", type(info), "len:", len(info) if info is not None else None, "%.2fs"%(time.time()-t0))
    if info:
        for b in list(info)[:12]:
            print("  ", b)
except Exception as e:
    print("ERR", type(e).__name__, e)
