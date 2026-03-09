from fastapi import HTTPException, status

DocumentNotFound = HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found.")


def UnsupportedFileType(mime_type: str = "") -> HTTPException:
    """Raised when the uploaded file's MIME type has no registered extractor."""
    hint = f" (received: {mime_type})" if mime_type else ""
    return HTTPException(
        status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
        detail=(
            f"Unsupported file type{hint}. "
            "Allowed: txt, md, rst, csv, tsv, json, yaml, xml, "
            "pdf, docx, pptx, xlsx, xls, html, htm, rtf, epub."
        ),
    )
