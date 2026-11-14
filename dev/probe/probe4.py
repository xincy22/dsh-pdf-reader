
import sys, io, os
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
import pymupdf4llm, inspect, os
d = os.path.dirname(pymupdf4llm.__file__)
print("pkg dir:", d)
for root, dirs, files in os.walk(d):
    for f in files:
        print(" ", os.path.join(root, f).replace(d, ""))
