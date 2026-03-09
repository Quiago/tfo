"""
knowledge_base/extractor.py — Extracción de texto de archivos para RAG.

Formatos soportados:
  Texto plano  → .txt, .md, .rst, .csv, .json, .yaml, .xml, .log
  Ofimática    → .pdf, .docx, .pptx, .xlsx, .xls
  Web          → .html, .htm
  Rich Text    → .rtf
  eBook        → .epub
"""
import io

from app.api.v1.knowledge_base.exceptions import UnsupportedFileType


# ── Plain text ────────────────────────────────────────────────────────────────

def _extract_text(content: bytes) -> str:
    return content.decode("utf-8", errors="replace")


def _extract_yaml(content: bytes) -> str:
    import yaml

    data = yaml.safe_load(content.decode("utf-8", errors="replace"))
    return yaml.dump(data, allow_unicode=True, default_flow_style=False)


def _extract_xml(content: bytes) -> str:
    import xml.etree.ElementTree as ET

    root = ET.fromstring(content.decode("utf-8", errors="replace"))
    texts = [el.text.strip() for el in root.iter() if el.text and el.text.strip()]
    return "\n".join(texts)


# ── Office formats ────────────────────────────────────────────────────────────

def _extract_pdf(content: bytes) -> str:
    import pypdf

    reader = pypdf.PdfReader(io.BytesIO(content))
    pages = [page.extract_text() for page in reader.pages]
    return "\n\n".join(p for p in pages if p and p.strip())


def _extract_docx(content: bytes) -> str:
    from docx import Document as DocxDocument

    doc = DocxDocument(io.BytesIO(content))
    parts = []
    for p in doc.paragraphs:
        if p.text.strip():
            parts.append(p.text)
    # Also extract tables
    for table in doc.tables:
        for row in table.rows:
            row_text = " | ".join(cell.text.strip() for cell in row.cells if cell.text.strip())
            if row_text:
                parts.append(row_text)
    return "\n\n".join(parts)


def _extract_pptx(content: bytes) -> str:
    from pptx import Presentation

    prs = Presentation(io.BytesIO(content))
    slides = []
    for i, slide in enumerate(prs.slides, 1):
        texts = []
        for shape in slide.shapes:
            if shape.has_text_frame:
                for para in shape.text_frame.paragraphs:
                    line = para.text.strip()
                    if line:
                        texts.append(line)
        if texts:
            slides.append(f"[Slide {i}]\n" + "\n".join(texts))
    return "\n\n".join(slides)


def _extract_xlsx(content: bytes) -> str:
    import openpyxl

    wb = openpyxl.load_workbook(io.BytesIO(content), read_only=True, data_only=True)
    sheets = []
    for sheet in wb.worksheets:
        rows = []
        for row in sheet.iter_rows(values_only=True):
            cells = [str(c) for c in row if c is not None]
            if cells:
                rows.append(" | ".join(cells))
        if rows:
            sheets.append(f"[Sheet: {sheet.title}]\n" + "\n".join(rows))
    return "\n\n".join(sheets)


def _extract_xls(content: bytes) -> str:
    import xlrd

    wb = xlrd.open_workbook(file_contents=content)
    sheets = []
    for sheet in wb.sheets():
        rows = []
        for rx in range(sheet.nrows):
            cells = [str(sheet.cell_value(rx, cx)) for cx in range(sheet.ncols)]
            cells = [c for c in cells if c.strip()]
            if cells:
                rows.append(" | ".join(cells))
        if rows:
            sheets.append(f"[Sheet: {sheet.name}]\n" + "\n".join(rows))
    return "\n\n".join(sheets)


# ── Web ───────────────────────────────────────────────────────────────────────

def _extract_html(content: bytes) -> str:
    from bs4 import BeautifulSoup

    soup = BeautifulSoup(content, "lxml")
    # Remove script/style noise
    for tag in soup(["script", "style", "meta", "head"]):
        tag.decompose()
    return soup.get_text(separator="\n", strip=True)


# ── Rich Text ─────────────────────────────────────────────────────────────────

def _extract_rtf(content: bytes) -> str:
    from striprtf.striprtf import rtf_to_text

    return rtf_to_text(content.decode("utf-8", errors="replace"))


# ── eBook ─────────────────────────────────────────────────────────────────────

def _extract_epub(content: bytes) -> str:
    import ebooklib
    from ebooklib import epub
    from bs4 import BeautifulSoup

    book = epub.read_epub(io.BytesIO(content))
    chapters = []
    for item in book.get_items_of_type(ebooklib.ITEM_DOCUMENT):
        soup = BeautifulSoup(item.get_content(), "lxml")
        text = soup.get_text(separator="\n", strip=True)
        if text:
            chapters.append(text)
    return "\n\n".join(chapters)


# ── Dispatch table ────────────────────────────────────────────────────────────

_EXTRACTORS: dict[str, callable] = {
    # Plain text
    "text/plain":             _extract_text,
    "text/markdown":          _extract_text,
    "text/x-markdown":        _extract_text,
    "text/x-rst":             _extract_text,
    "text/csv":               _extract_text,
    "text/tab-separated-values": _extract_text,
    "text/log":               _extract_text,
    "application/json":       _extract_text,
    "application/x-yaml":     _extract_yaml,
    "text/yaml":              _extract_yaml,
    "text/x-yaml":            _extract_yaml,
    "application/xml":        _extract_xml,
    "text/xml":               _extract_xml,
    # Office
    "application/pdf":        _extract_pdf,
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": _extract_docx,
    "application/msword":     _extract_docx,
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": _extract_pptx,
    "application/vnd.ms-powerpoint": _extract_pptx,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": _extract_xlsx,
    "application/vnd.ms-excel": _extract_xls,
    # Web
    "text/html":              _extract_html,
    "application/xhtml+xml":  _extract_html,
    # Rich text
    "application/rtf":        _extract_rtf,
    "text/rtf":               _extract_rtf,
    # eBook
    "application/epub+zip":   _extract_epub,
}

_SUPPORTED_EXTENSIONS = (
    ".txt", ".md", ".rst", ".csv", ".tsv", ".log",
    ".json", ".yaml", ".yml", ".xml",
    ".pdf", ".docx", ".pptx", ".xlsx", ".xls",
    ".html", ".htm", ".rtf", ".epub",
)


def extract_text(content: bytes, mime_type: str) -> str:
    """
    Extrae texto plano de un archivo dado su contenido binario y MIME type.
    Eleva UnsupportedFileType si el tipo no está soportado.

    Fallback: MIME genérico (application/octet-stream) → intenta UTF-8.
    """
    base_mime = mime_type.split(";")[0].strip().lower()
    fn = _EXTRACTORS.get(base_mime)
    if fn:
        return fn(content)

    # Fallback for generic MIME — attempt UTF-8 decode before rejecting
    if base_mime in ("application/octet-stream", "", "binary/octet-stream"):
        try:
            return content.decode("utf-8")
        except UnicodeDecodeError:
            pass

    raise UnsupportedFileType(base_mime)
