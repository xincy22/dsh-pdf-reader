# 第三方依赖与许可声明 / Third-Party Notices

dsh-pdf-reader 的代码以 [MIT](LICENSE) 许可发布。

## 运行时依赖（dependencies，安装插件时由包管理器从 npm 安装）

| 包 | 用途 | 上游 | 许可证 |
| --- | --- | --- | --- |
| mupdf | 打开 PDF、取文字层与绘图对象、按区域渲染图 | [github.com/ArtifexSoftware/mupdf.js](https://github.com/ArtifexSoftware/mupdf.js) | AGPL-3.0-or-later 或 Artifex 商业许可 |

本仓库不包含 MuPDF 的代码或二进制，用户安装插件时从 npm 获取 `mupdf`。插件在同一进程中加载 MuPDF；分发包含 MuPDF 的组合作品，或以网络服务形式向他人提供时，需要遵守 AGPL-3.0 的义务（例如提供对应源代码），或向 Artifex 购买商业许可。

## 框架依赖（peerDependencies，由 DeepSeek Harness 提供）

| 包 | 上游 | 许可证 |
| --- | --- | --- |
| @deepseek-ai/cordis | [github.com/cordiverse/cordis](https://github.com/cordiverse/cordis) | MIT |
| @deepseek-ai/dsh-tools | [github.com/deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) | MIT |

## dev/reference/skander（第三方源码，仅参考）

`dev/reference/skander/` 保存的是另一个同名插件 [SkanderBog/dsh-pdf-reader](https://github.com/SkanderBog/dsh-pdf-reader) 的源码，用来对照它在 Poppler/Tesseract 路线上的做法。

- 该代码**不属于本仓库的许可范围**，不随 `files` 字段发布，也不被 `src/` 引用。
- 版权归原作者。如果要在本仓库保留副本，需按其仓库的许可处理；如果不需要，可以整目录删除。

## 实验素材

`dev/` 下的脚本和 PNG 是早期 PyMuPDF 路线的实验记录（PyMuPDF 同为 AGPL-3.0），其中若干张来自一篇公开论文的页面渲染，仅用于开发对照，不随插件发布。
