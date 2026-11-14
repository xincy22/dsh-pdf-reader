# reference/

**这里的代码不是本项目的作品。**

`skander/` 是从 [SkanderBog/dsh-pdf-reader](https://github.com/SkanderBog/dsh-pdf-reader) 取得的同名插件源码，开发时用来对照它的另一条路线（外部命令行程序 Poppler + Tesseract，无 Python 依赖）。

- 版权归原作者，不适用本仓库的 MIT 许可。
- 不被 `src/` 引用，不进 `package.json` 的 `files`，不随插件发布。
- 若上游仓库的许可不允许再分发，删除本目录即可，不影响插件运行。

本项目的实现与之无关：走 PyMuPDF，一个 Python 进程，返回图文交替的有序块。
