
import sys, io, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
import pymupdf

path = sys.argv[1] if len(sys.argv) > 1 else "sample.pdf"
doc = pymupdf.open(path)
for pno in (4, 15):
    page = doc[pno]
    print("=== page", pno + 1)
    d = page.get_text("dict")
    for b in d["blocks"]:
        if b["type"] == 0:
            txt = " / ".join("".join(sp["text"] for sp in l["spans"]) for l in b["lines"])[:80]
            print("  TEXT ", [round(v,1) for v in b["bbox"]], txt.replace("\xa0"," "))
        else:
            print("  IMAGE", [round(v,1) for v in b["bbox"]], b.get("width"), b.get("height"))
    print("  image_info:", len(page.get_image_info()), "drawings:", len(page.get_drawings()))
    # 判图：非白像素占位
    for b in page.get_text("dict")["blocks"]:
        if b["type"] == 1:
            print("   img bbox area ratio", round((b["bbox"][2]-b["bbox"][0])*(b["bbox"][3]-b["bbox"][1])/(page.rect.width*page.rect.height),3))
