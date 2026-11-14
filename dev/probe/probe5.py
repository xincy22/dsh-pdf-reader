
import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
import pymupdf, pymupdf.layout
print("pymupdf", pymupdf.__version__)
print()
print("== pymupdf.layout public API ==")
print([n for n in dir(pymupdf.layout) if not n.startswith("_")])
print()
print("== Page layout-related methods ==")
print([n for n in dir(pymupdf.Page) if "layout" in n.lower() or "structure" in n.lower()])
print()
print("== Document layout-related ==")
print([n for n in dir(pymupdf.Document) if "layout" in n.lower()])
