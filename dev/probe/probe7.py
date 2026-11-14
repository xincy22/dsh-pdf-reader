
import sys, io, time
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
import pymupdf, pymupdf.layout
print("activate ->", pymupdf.layout.activate())
path = sys.argv[1] if len(sys.argv) > 1 else "sample.pdf"
doc = pymupdf.open(path)
page = doc[4]
print("layout_information attr before:", page.layout_information)
try:
    import pymupdf4llm.helpers.document_layout as dl
    print("have document_layout")
    info = dl.get_page_layout  if hasattr(dl, 'get_page_layout') else None
    print([n for n in dir(dl) if 'layout' in n.lower()][:20])
except Exception as e:
    print("err", e)
