"""把 docs/技术文档.md 转成 PDF。

依赖（用 uv 临时安装，不污染项目环境）：
    uv run --with markdown python docs/build_pdf.py

流程：markdown → HTML（带打印样式）→ Chrome 无头 --print-to-pdf
"""

import pathlib
import re
import subprocess
import sys

import markdown

ROOT = pathlib.Path(__file__).resolve().parent
MD = ROOT / (sys.argv[1] if len(sys.argv) > 1 else "技术文档.md")
HTML = ROOT / ("_build_" + MD.stem + ".html")
PDF = ROOT / (MD.stem + ".pdf")

CHROME_CANDIDATES = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
]

CSS = """
@page { size: A4; margin: 20mm 18mm 18mm 18mm; }

* { box-sizing: border-box; }

body {
  font-family: "Source Han Serif SC", "Noto Serif CJK SC", "SimSun", "宋体", serif;
  font-size: 10.5pt;
  line-height: 1.75;
  color: #1a1a1a;
  margin: 0;
  text-align: justify;
}

h1, h2, h3, h4 {
  font-family: "Source Han Sans SC", "Microsoft YaHei", "微软雅黑", "SimHei", "黑体", sans-serif;
  color: #14231d;
  line-height: 1.4;
  page-break-after: avoid;
}

h1 {
  font-size: 20pt;
  text-align: center;
  margin: 0 0 6pt 0;
  letter-spacing: 1px;
  text-wrap: balance;
  page-break-after: avoid;
}

h1 + p strong { display: block; text-align: center; }

h2 {
  font-size: 15pt;
  margin: 22pt 0 10pt 0;
  padding-bottom: 4pt;
  border-bottom: 1.2pt solid #146b56;
  page-break-before: auto;
}

h3 {
  font-size: 12pt;
  margin: 16pt 0 8pt 0;
}

h4 { font-size: 11pt; margin: 12pt 0 6pt 0; }

p { margin: 0 0 8pt 0; }

strong { font-weight: 700; }

ul, ol { margin: 0 0 10pt 0; padding-left: 1.6em; }
li { margin-bottom: 4pt; }

table {
  width: 100%;
  border-collapse: collapse;
  margin: 8pt 0 14pt 0;
  font-size: 9.5pt;
  page-break-inside: avoid;
}

th, td {
  border: 0.6pt solid #b9c4bf;
  padding: 5pt 7pt;
  text-align: left;
  vertical-align: top;
}

/* 第一列通常是短标签（部分/模块/方法），不允许被压成竖排 */
th:first-child, td:first-child {
  white-space: nowrap;
}

td { word-break: break-word; }

th {
  background: #eef3f0;
  font-family: "Microsoft YaHei", "微软雅黑", sans-serif;
  font-weight: 700;
}

tr:nth-child(even) td { background: #fafbfa; }

code {
  font-family: "Cascadia Mono", Consolas, "Courier New", monospace;
  font-size: 9pt;
  background: #f2f4f3;
  padding: 1pt 3pt;
  border-radius: 2pt;
}

pre {
  background: #f5f7f6;
  border: 0.6pt solid #d7e0dc;
  border-left: 2.5pt solid #146b56;
  padding: 8pt 10pt;
  overflow-x: auto;
  page-break-inside: avoid;
  margin: 8pt 0 12pt 0;
}

pre code { background: none; padding: 0; font-size: 8.6pt; line-height: 1.55; }

hr { border: none; border-top: 0.6pt solid #ccd6d1; margin: 14pt 0; }

blockquote {
  margin: 8pt 0;
  padding: 6pt 10pt;
  border-left: 2.5pt solid #c9a227;
  background: #fdfaf0;
}

a { color: #146b56; text-decoration: none; }

img {
  display: block;
  max-width: 100%;
  height: auto;
  margin: 4pt auto 8pt auto;
  border: 0.6pt solid #d7e0dc;
  page-break-inside: avoid;
}

figure {
  margin: 0 0 14pt 0;
  page-break-inside: avoid;
  text-align: center;
}

figure img { max-height: 105mm; margin: 0 auto; }

figcaption {
  font-size: 9pt;
  color: #4a5751;
  text-align: left;
  margin-bottom: 5pt;
  line-height: 1.55;
}

/* 首页标题区 */
h1 { page-break-before: avoid; }
"""


def convert():
    text = MD.read_text(encoding="utf-8")
    body = markdown.markdown(
        text,
        extensions=["tables", "fenced_code", "sane_lists", "attr_list"],
        output_format="html5",
    )
    html = f"""<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>银龄无诈 · 技术文档</title>
<style>{CSS}</style>
</head>
<body>
{body}
</body>
</html>"""
    HTML.write_text(html, encoding="utf-8")
    return html


def find_chrome():
    for path in CHROME_CANDIDATES:
        if pathlib.Path(path).exists():
            return path
    return None


def build_pdf(chrome):
    if PDF.exists():
        PDF.unlink()
    profile = ROOT / ".chrome-profile"
    profile.mkdir(exist_ok=True)
    cmd = [
        chrome,
        "--headless=new",
        "--disable-gpu",
        "--no-sandbox",
        "--disable-crash-reporter",
        f"--user-data-dir={profile}",
        "--no-pdf-header-footer",
        "--virtual-time-budget=8000",
        f"--print-to-pdf={PDF}",
        HTML.as_uri(),
    ]
    result = subprocess.run(cmd, capture_output=True, timeout=180)
    if not PDF.exists():
        print(result.stdout.decode("utf-8", "replace")[-2000:])
        print(result.stderr.decode("utf-8", "replace")[-2000:])
        raise SystemExit("PDF 生成失败")
    return result


def add_page_numbers(src):
    """在每页底部叠加「第 N 页 / 共 M 页」。"""
    import io

    from pypdf import PdfReader, PdfWriter
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.cidfonts import UnicodeCIDFont
    from reportlab.pdfgen import canvas

    pdfmetrics.registerFont(UnicodeCIDFont("STSong-Light"))

    reader = PdfReader(str(src))
    total = len(reader.pages)
    writer = PdfWriter()
    for index, page in enumerate(reader.pages, start=1):
        width = float(page.mediabox.width)
        height = float(page.mediabox.height)
        buffer = io.BytesIO()
        canv = canvas.Canvas(buffer, pagesize=(width, height))
        canv.setFont("STSong-Light", 8.5)
        canv.setFillColorRGB(0.42, 0.42, 0.42)
        canv.drawCentredString(width / 2, 13, "第 {} 页 / 共 {} 页".format(index, total))
        canv.save()
        buffer.seek(0)
        page.merge_page(PdfReader(buffer).pages[0])
        writer.add_page(page)

    temp = src.with_suffix(".numbered.pdf")
    with open(temp, "wb") as handle:
        writer.write(handle)
    temp.replace(src)


def page_count():
    raw = PDF.read_bytes()
    counts = [int(x) for x in re.findall(rb"/Count\s+(\d+)", raw)]
    return max(counts) if counts else 0


if __name__ == "__main__":
    convert()
    chrome = find_chrome()
    if not chrome:
        raise SystemExit("找不到 Chrome / Edge")
    build_pdf(chrome)
    add_page_numbers(PDF)
    size = PDF.stat().st_size / 1024
    print(f"PDF: {PDF}")
    print(f"大小: {size:.0f} KB, 页数: {page_count()}")
