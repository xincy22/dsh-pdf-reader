# dsh-pdf-reader

[English](README.md) | **中文**

[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

给 DeepSeek Harness 加一个 `pdf_read` 工具：把 PDF 按**阅读顺序**读成图文交替的块 —— 一段字、一张图、一段图注、一段正文。图不是堆在末尾，而是落在它原本所在的位置。

> 本插件不打包第三方程序或模型。它调用的 PyMuPDF 由用户自行安装，许可见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

![图按它本来的位置返回](assets/screenshots/01-figure-inlined.png)

第 16 页的饼图被单独裁出来作为一个块，紧随其后的是图里识别出的标注文字和这张图的图注，再往后才是下一段正文。

## 它解决什么

常规 PDF 转文本会把图和文字拆开：文字连成一大段，图另存一堆文件，模型看到的是「一堆字 + 几张不知道属于哪的图」。图表混排的论文、数据集说明、技术手册在这种形态下读不对。

`pdf_read` 返回的是有序块列表，每张图都跟在它上文之后、图注与后续正文之前，图里被识别出的标注文字作为独立块紧跟在图后面，不会混进正文句子。

## 工具

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `path` | string，必填 | PDF 的绝对路径 |
| `pages` | string | 页码表达式：`"5"`、`"5,16"`、`"5-9"`。省略则读前 10 页 |
| `withImages` | boolean | 默认 true。设为 false 只回文字，不消耗图像 token |
| `dpi` | number | 图的渲染分辨率，100–400，默认 200 |

返回值：`blocks`（图文交替的顺序块）、`text`（纯文本版，图位置留标记）、`imageCount`、`pageCount`、`pagesRead`。

## 安装

前置：DeepSeek Harness 0.2.x；本机有一个装了 `pymupdf` 与 `pymupdf4llm` 的 Python。

```sh
# 从 GitHub 安装（推荐）
dsh plugin --profile <profile> add git+https://github.com/xincy22/dsh-pdf-reader

# 或本地目录（开发用，改动立即生效）
dsh plugin --profile <profile> add ./dsh-pdf-reader
```

安装后**完全退出 DSH 再打开**：新的 Loader 行在启动时组合。

Python 的查找顺序是环境变量 `DSH_PDF_PYTHON` → DSH 自带运行时里的 python → PATH 上的 `python`。找不到装有 PyMuPDF 的 Python 时，工具会明确报错，不会静默返回空结果。

```sh
# 确认依赖就位
python -c "import pymupdf, pymupdf4llm; print('ok')"
```

## 用法

```
读 refs/Sayyed2026_etchVM_review.pdf 的第 5 页和第 16 页，说明图里的内容和正文的对应关系。
```

代理会调用 `pdf_read`，拿到按阅读顺序排列的文本与图，图直接进上下文。

注意两点：

- **按页读，不要一次读整本。** 长文档逐页读是有意的设计，一次全读会把上下文塞满。
- **只想要文字时传 `withImages: false`。** 图会换成位置标记，不产生图像 token。

## 已知限制

- 依赖 Python 进程，每次调用约 2 秒（0.4 秒启动 + 1–3 秒解析）。
- 图内文字的识别来自 PyMuPDF 的图区文字提取，不是 OCR 引擎。扫描件（无文本层）的图内文字识别不到，需要另配 OCR。
- 弧形排列、旋转过的标签文字会被逐字符拆散，字序不可靠。引用这类图表的数据时应以图为准。
- 单次调用没有文件大小与页数硬上限，但一次读太多页会占满上下文。

## 开发

仓库里 `dev/` 保存这条开发线的过程产物，不随插件发布：

| 目录 | 内容 |
| --- | --- |
| `dev/probe/` | 14 个 PyMuPDF 裁图实验脚本，研究图区聚类的可行做法 |
| `dev/e2e/` | 假 ctx 加载插件、验证注册与输出的脚本 |
| `dev/dumps/` | 开发期的 profile 配置转储 |
| `dev/figures/` | 历次裁图实验的对照 PNG |
| `dev/reference/` | 第三方同名插件的源码，仅作参考，来源见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) |

## 许可

MIT。见 [LICENSE](LICENSE)。
