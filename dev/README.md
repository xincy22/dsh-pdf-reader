# dev/

插件开发过程中的产物，**不随插件发布**（`package.json` 的 `files` 不包含本目录）。

## 现在可用的

```sh
node dev/try.mjs path/to/paper.pdf 1-3 /tmp/out   # 打印引擎输出，把裁出的图存到 /tmp/out
node dev/e2e/smoke.mjs path/to/paper.pdf          # 用假的 Harness 上下文加载插件并执行一次
```

## 历史记录：早期的 PyMuPDF 路线

插件最初通过子进程调用用户自装的 Python + PyMuPDF。用户必须自己准备装好依赖的 Python，这条路线已被进程内的 MuPDF WebAssembly 取代。下面这些目录保留当时的实验，需要自备装有 `pymupdf` 的 Python 才能运行：

| 目录 | 内容 | 状态 |
| --- | --- | --- |
| `probe/` | 14 个 PyMuPDF 脚本，研究图区怎么聚类。前几个直接调 `pymupdf4llm` 对照，后几个用 `page.get_drawings()` + `page.get_image_info()` 自己算图框 | 可运行，需自备 PDF |
| `dumps/` | 开发期转储的 profile 配置与早期输出，其中的路径都是当时那台机器的 | 只作记录 |
| `figures/` | 历次裁图实验的对照 PNG，同一张图在不同裁法下的差异 | 只作对照 |
| `reference/` | 第三方同名插件 [SkanderBog/dsh-pdf-reader](https://github.com/SkanderBog/dsh-pdf-reader) 的源码 | 只作参考，见 [../THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md) |

当时的结论仍然适用于新引擎：只按页面块切图会漏掉图框外的坐标轴和标签，所以 `src/layout.js` 用绘图对象的几何聚类找图区，再把贴着图区的短小文字并进去。
