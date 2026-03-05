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


_EXTRACTORS: dict[str, callable] = {
    "text/plain": _extract_text,
    "text/markdown": _extract_text,
    "application/pdf": _extract_pdf,
}


def extract_text(content: bytes, mime_type: str) -> str:
    """
    Extrae texto plano de un archivo dado su contenido binario y MIME type.
    Eleva UnsupportedFileType si el tipo no está soportado.
    """
    base_mime = mime_type.split(";")[0].strip().lower()
    fn = _EXTRACTORS.get(base_mime)
    if not fn:
        raise UnsupportedFileType
    return fn(content)
