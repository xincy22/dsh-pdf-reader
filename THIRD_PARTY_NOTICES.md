# 第三方依赖与许可声明 / Third-Party Notices

dsh-pdf-reader 本体以 [MIT](LICENSE) 许可发布。本插件**不打包、不分发**下列任何第三方组件；它们由用户自行安装，各自保留原有许可证，插件只在运行时调用。

## 框架依赖（peerDependencies，由 DeepSeek Harness 提供）

| 包 | 上游 | 许可证 |
| --- | --- | --- |
| @deepseek-ai/cordis | [github.com/cordiverse/cordis](https://github.com/cordiverse/cordis) | MIT |
| @deepseek-ai/dsh-tools | [github.com/deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) | MIT |

插件不声明任何 `dependencies`，安装时不从网络下载运行时代码。

## 外部程序与库（用户自行安装，插件通过子进程调用）

| 组件 | 用途 | 上游 | 许可证 |
| --- | --- | --- | --- |
| PyMuPDF（`pymupdf`） | 打开 PDF、取页面文字层、取图区与绘图对象、按区域渲染图 | [github.com/pymupdf/PyMuPDF](https://github.com/pymupdf/PyMuPDF) | AGPL-3.0 或商业许可 |
| pymupdf4llm | 把页面转成 Markdown，输出图引用与图内文字段 | [github.com/pymupdf/RAG](https://github.com/pymupdf/RAG) | AGPL-3.0 或商业许可 |

**PyMuPDF 采用 AGPL-3.0 双许可。** 本插件自身是 MIT，但它调用用户自行安装的 PyMuPDF；以 AGPL 组件构建分发版或通过网络提供服务时，AGPL 的义务落在使用者一侧。需要闭源分发时，向 Artifex 购买商业许可。

插件调用的 Python 解释器由用户提供，插件不分发它。

## dev/reference/skander（第三方源码，仅参考）

`dev/reference/skander/` 保存的是另一个同名插件 [SkanderBog/dsh-pdf-reader](https://github.com/SkanderBog/dsh-pdf-reader) 的源码，用来对照它在 Poppler/Tesseract 路线上的做法。

- 该代码**不属于本仓库的许可范围**，不随 `files` 字段发布，也不被 `src/` 引用。
- 版权归原作者。如果要在本仓库保留副本，需按其仓库的许可处理；如果不需要，可以整目录删除。
- 它的实现路线与本插件不同：走外部命令行程序（Poppler、Tesseract），无 Python 依赖。

## 实验素材

`dev/figures/` 下的 PNG 是本地裁图实验的输出，其中若干张来自一篇公开论文的页面渲染，仅用于开发对照，不随插件发布。
