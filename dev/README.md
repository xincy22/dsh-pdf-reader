# dev/

插件开发这条线的过程产物。**不随插件发布**（`package.json` 的 `files` 不包含本目录）。

## 这是什么

这个插件从一个「把 PDF 按阅读顺序读成图文交替块」的想法做成可用工具，中间留下了这些实验。留着是为了说明取舍是怎么来的，不是为了让人直接运行。

| 目录 | 内容 | 状态 |
| --- | --- | --- |
| `probe/` | 14 个 PyMuPDF 脚本，研究图区怎么聚类。前几个直接调 `pymupdf4llm` 对照，后几个用 `page.get_drawings()` + `page.get_image_info()` 自己算图框 | 可运行，需自备 PDF |
| `e2e/` | 假 ctx 加载插件，检查注册、执行、图是否提交 | 可运行 |
| `dumps/` | 开发期转储的 profile 配置与早期输出，其中的路径都是当时那台机器的 | 只作记录 |
| `figures/` | 历次裁图实验的对照 PNG，同一张图在不同裁法下的差异 | 只作对照 |
| `reference/` | 第三方同名插件 [SkanderBog/dsh-pdf-reader](https://github.com/SkanderBog/dsh-pdf-reader) 的源码 | 只作参考，见 [../THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md) |

## 跑法

需要一个装了 `pymupdf` 与 `pymupdf4llm` 的 Python。

```sh
# 端到端：注册检查 + 可选的真实 PDF 执行
node dev/e2e/smoke.mjs
node dev/e2e/smoke.mjs path/to/paper.pdf

# 单个 probe：第一个参数是 PDF，第二个是输出目录（默认 out）
python dev/probe/probe14.py path/to/paper.pdf out
```

`probe3.py`、`probe4.py`、`probe5.py`、`probe10.py` 不接受参数，它们是早期的小实验。

## 这些实验得出的结论

图区不能只靠 `pymupdf4llm` 的默认裁法。它按页面块切分，把围在图形外的纯几何对象（图例框、坐标轴、边框）排除在外，于是弧形排列的标签、包围盒之外的轴标签会掉出去。自己按 `get_drawings()` 的矩形做纵向合并、再按面积阈值过滤，得到的图框更贴边，代价是约 0.018 秒，而启用版面模型要 0.89 秒。

当前发布的版本仍走 `pymupdf4llm`，理由是它同时给出图内文字，而自建几何裁图只给图、不给图内文字。要换成自建路线，`extract.py` 是唯一需要改的文件。
