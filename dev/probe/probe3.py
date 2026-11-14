
import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
import pymupdf
print("PyMuPDF:", pymupdf.__version__)
print()
print("Page methods related to layout/cluster/drawings:")
for n in dir(pymupdf.Page):
    if n.startswith("_"): continue
    if any(k in n.lower() for k in ("cluster","drawing","image","text","rect","crop","block","table","word")):
        print("  ", n)
