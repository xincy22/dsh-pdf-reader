
import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
import pymupdf

path = sys.argv[1] if len(sys.argv) > 1 else "sample.pdf"
doc = pymupdf.open(path)

print("== check: does pymupdf4llm load an OCR engine? ==")
try:
    import pymupdf4llm
    print("pymupdf4llm version:", getattr(pymupdf4llm, "__version__", "n/a"))
except Exception as e:
    print("import failed", e)

print()
print("== page 16 figure region: plain text extraction (no OCR) ==")
page = doc[15]
clip = pymupdf.Rect(180, 70, 400, 260)   # 饼图区域
print(repr(page.get_text("text", clip=clip)[:400]))

print()
print("== page 5 figure region plain text ==")
page = doc[4]
clip = pymupdf.Rect(120, 70, 500, 200)
print(repr(page.get_text("text", clip=clip)[:600]))
