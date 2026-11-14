
import sys, io, time
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
import pymupdf
t0=time.time()
import pymupdf4llm
print("import pymupdf4llm: %.2fs" % (time.time()-t0))
t0=time.time()
import pymupdf.layout
print("import pymupdf.layout: %.2fs" % (time.time()-t0))
print("onnxruntime loaded?", "onnxruntime" in sys.modules)
import onnxruntime
print("onnxruntime version:", onnxruntime.__version__)
