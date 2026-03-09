"""
knowledge_base/extractor.py — Extracción de texto de archivos.

Dispatch por MIME type. Tipos soportados: text/plain, text/markdown, application/pdf.
"""
import io

from app.api.v1.knowledge_base.exceptions import UnsupportedFileType


def _extract_text(content: bytes) -> str:
    return content.decode("utf-8", errors="replace")


def _extract_pdf(content: bytes) -> str:
    import pypdf

    reader = pypdf.PdfReader(io.BytesIO(content))
    pages = []
    for page in reader.pages:
        text = page.extract_text()
        if text and text.strip():
            pages.append(text)
    return "\n\n".join(pages)


def _extract_docx(content: bytes) -> str:
    from docx import Document as DocxDocument

    doc = DocxDocument(io.BytesIO(content))
    return "\n\n".join(p.text for p in doc.paragraphs if p.text.strip())


_EXTRACTORS: dict[str, callable] = {
    "text/plain": _extract_text,
    "text/markdown": _extract_text,
    "text/x-markdown": _extract_text,
    "text/x-rst": _extract_text,
    "text/csv": _extract_text,
    "application/json": _extract_text,
    "application/pdf": _extract_pdf,
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": _extract_docx,
    "application/msword": _extract_docx,
}


def extract_text(content: bytes, mime_type: str) -> str:
    """
    Extrae texto plano de un archivo dado su contenido binario y MIME type.
    Eleva UnsupportedFileType si el tipo no está soportado.

    Fallback: si el MIME es genérico (application/octet-stream o vacío) pero
    el contenido decodifica como UTF-8 válido, se trata como texto plano.
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

    raise UnsupportedFileType
