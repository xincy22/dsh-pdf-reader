# dsh-pdf-reader

**English** | [中文](README.zh.md)

[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A DeepSeek Harness tool plugin that gives agents a `pdf_read` tool: it reads a PDF in **reading order** as interleaved blocks — a run of text, the figure that belongs there, its caption, then the text that follows. Figures are not piled up at the end.

> This plugin bundles no third-party binaries or models. It calls PyMuPDF, which the user installs separately; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

![A figure returned where it belongs](assets/screenshots/01-figure-inlined.png)

The pie chart on page 16 comes back as its own block, immediately followed by the labels recognised inside it and then its caption — the next paragraph of prose comes after that.

## The problem it solves

Plain PDF-to-text splits figures away from prose: text collapses into one long run, figures become a pile of files, and the model sees "a wall of words plus a few pictures with no idea where they came from". Papers, dataset READMEs and technical manuals that mix charts with text read wrong in that form.

`pdf_read` returns an ordered block list. Each figure sits right after the text that introduces it and before its caption and what follows. Text extracted from inside the figure comes back as its own block directly after the image, so captions and labels do not leak into prose.

## Tool

| Argument | Type | Meaning |
| --- | --- | --- |
| `path` | string, required | Absolute path to the PDF |
| `pages` | string | Page expression: `"5"`, `"5,16"`, `"5-9"`. Omit for the first 10 pages |
| `withImages` | boolean | Default true. `false` returns text only and spends no image tokens |
| `dpi` | number | Figure rendering resolution, 100–400, default 200 |

Returns `blocks` (interleaved text and figure blocks), `text` (plain-text version with position markers), `imageCount`, `pageCount`, `pagesRead`.

## Install

Prerequisites: DeepSeek Harness 0.2.x, and a local Python with `pymupdf` and `pymupdf4llm`.

```sh
# From GitHub (recommended)
dsh plugin --profile <profile> add git+https://github.com/xincy22/dsh-pdf-reader

# Or from a local directory (development; edits apply immediately)
dsh plugin --profile <profile> add ./dsh-pdf-reader
```

**Restart DSH completely** after installing: the new Loader row is composed at startup.

Python is looked up as `DSH_PDF_PYTHON` → the bundled DSH runtime → `python` on PATH. If no Python with PyMuPDF is found the tool fails loudly instead of returning an empty result.

```sh
# Check the dependency
python -c "import pymupdf, pymupdf4llm; print('ok')"
```

## Usage

```
Read pages 5 and 16 of refs/Sayyed2026_etchVM_review.pdf, and explain how the figures relate to the text.
```

The agent calls `pdf_read`, gets text and figures in reading order, and the figures land in context as real images.

Two rules that matter:

- **Read by page range, not the whole book.** Page-ranged reading is deliberate; a whole long document at once will fill the context.
- **Pass `withImages: false` for text only.** Figures become position markers and cost no image tokens.

## Known limits

- Needs a Python process; about 2 seconds per call (0.4 s startup plus 1–3 s parsing).
- Text inside figures comes from PyMuPDF's figure-region text extraction, not from an OCR engine. Scanned pages without a text layer will not yield figure text; add OCR separately if needed.
- Curved or rotated labels are split character by character and come back out of order. Read the figure itself when citing numbers from such charts.
- There is no hard size or page cap per call, but reading too many pages at once will consume the context.

## Development

The `dev/` tree keeps working artifacts from this development line. It is not published with the plugin:

| Directory | Contents |
| --- | --- |
| `dev/probe/` | 14 PyMuPDF figure-region experiments |
| `dev/e2e/` | Scripts that load the plugin with a mock ctx and check registration and output |
| `dev/dumps/` | Profile configuration dumps from development |
| `dev/figures/` | Before/after PNGs from those cropping experiments |
| `dev/reference/` | Source of a third-party plugin with the same name, kept for reference only; provenance in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) |

## License

MIT. See [LICENSE](LICENSE).
